/**
 * Live microphone capture engine.
 *
 * Design constraints this satisfies:
 *  - one AudioContext for the whole session, created on start, closed on stop
 *  - one MediaStream; starting twice is refused rather than stacking
 *  - a rolling sample buffer drives fixed-duration windows, so a prediction runs
 *    every window without waiting for the user to stop talking
 *  - a single in-flight window at a time, so the backend is never flooded
 *  - every node, timer and track is released on stop and on unmount
 */
import { RollingWindow, encodeWav, normalize, rms } from './audio';

export type MicState = 'idle' | 'starting' | 'running' | 'error';

export interface MicEngineOptions {
  /** Length of each analysed window, in seconds. */
  windowSeconds?: number;
  /** Gap between the end of one window and the start of the next. */
  intervalMs?: number;
  /** Called with each complete window. */
  onWindow?: (payload: { wav: Blob; samples: Float32Array; sampleRate: number; level: number }) => void;
  /** Called with the rolling input level for the visualiser, ~10x per second. */
  onLevel?: (level: number) => void;
  /** Called with a human-readable message when the engine itself fails. */
  onError?: (message: string) => void;
}

const WORKLET_SOURCE = `
// Batches the 128-sample render quanta into ~4096-sample blocks. Posting every
// quantum would mean several hundred postMessage calls per second.
class SonicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(4096);
    this.n = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf);
          this.buf = new Float32Array(4096);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('sonic-capture', SonicCapture);
`;

function describeMicError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone permission was denied. Allow it in your browser settings, then press Start again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'The microphone is in use by another application (another browser tab, Zoom, Teams, or a similar app). Close it there, then press Start again.';
    case 'AbortError':
      return 'The microphone could not be started.';
    default:
      return e?.message ? `Microphone error: ${e.message}` : 'The microphone could not be started.';
  }
}

export class MicrophoneEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private fallbackNode: ScriptProcessorNode | null = null;

  private rolling: RollingWindow;
  private timer: number | null = null;
  private levelTimer: number | null = null;
  private readonly windowSamples: number;
  private readonly intervalMs: number;

  private state: MicState = 'idle';
  private active = false;

  constructor(private opts: MicEngineOptions = {}) {
    const windowSeconds = opts.windowSeconds ?? 3;
    this.intervalMs = opts.intervalMs ?? Math.round(windowSeconds * 1000);
    // Placeholder capacity; replaced with the real rate on start.
    this.windowSamples = windowSeconds * 44100;
    this.rolling = new RollingWindow(this.windowSamples);
  }

  get currentState(): MicState {
    return this.state;
  }

  get analyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  /** Refuse a second start so two streams can never run at once. */
  isRunning(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    // Refuse both an active stream and a concurrent start: two getUserMedia
    // calls racing one another make the browser fail the second with
    // NotReadableError — "microphone is in use by another application".
    if (this.active || this.state === 'starting') return;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.state = 'error';
      this.opts.onError?.(
        'This browser does not expose microphone capture. Web Audio and MediaDevices are required.',
      );
      return;
    }

    this.state = 'starting';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,      // mono: matches the trained models
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.stream = stream;

      const ctx = new AudioContext();
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();
      const rate = ctx.sampleRate;

      // Re-create the ring buffer now that the real rate is known.
      const windowSeconds = this.windowSamples / 44100;
      const capacity = Math.ceil(windowSeconds * rate);
      this.rolling = new RollingWindow(capacity);
      const needSamples = Math.round(windowSeconds * rate);

      this.source = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.7;
      this.source.connect(this.analyser);
      // Deliberately not connected to the destination: monitoring the mic
      // through the speakers would feed back.

      await this.attachCapture(ctx, rate);

      this.active = true;
      this.state = 'running';

      // Emit the newest full window on a fixed cadence.
      this.timer = window.setInterval(() => {
        if (!this.active) return;
        const slice = this.rolling.latest(needSamples);
        if (!slice) return;                    // still filling the first window
        const level = rms(slice);
        if (level < 0.0008) {
          // Genuine silence: report the level so the UI can idle, but do not
          // spend a backend request on it.
          this.opts.onLevel?.(level);
          return;
        }
        const samples = normalize(slice);
        this.opts.onWindow?.({
          wav: encodeWav(samples, rate),
          samples,
          sampleRate: rate,
          level,
        });
      }, this.intervalMs);

      this.levelTimer = window.setInterval(() => {
        if (this.analyser) this.opts.onLevel?.(this.readLevel());
      }, 100);
    } catch (err) {
      await this.stop();
      this.state = 'error';
      this.opts.onError?.(describeMicError(err));
    }
  }

  /** Prefer an AudioWorklet; fall back to ScriptProcessor where unsupported. */
  private async attachCapture(ctx: AudioContext, rate: number): Promise<void> {
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        const url = URL.createObjectURL(
          new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
        );
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        const node = new AudioWorkletNode(ctx, 'sonic-capture');
        node.port.onmessage = (e: MessageEvent) => {
          if (this.active) this.rolling.push(e.data as Float32Array);
        };
        this.source!.connect(node);
        // A worklet with no output connection still needs a sink to be pulled.
        const silent = ctx.createGain();
        silent.gain.value = 0;
        node.connect(silent).connect(ctx.destination);
        this.worklet = node;
        return;
      } catch {
        this.worklet = null;    // fall through to the legacy node
      }
    }

    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      if (!this.active) return;
      this.rolling.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.source!.connect(node);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(ctx.destination);
    this.fallbackNode = node;
  }

  private readLevel(): number {
    const analyser = this.analyser;
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return rms(data);
  }

  async stop(): Promise<void> {
    this.active = false;

    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.levelTimer !== null) { window.clearInterval(this.levelTimer); this.levelTimer = null; }

    if (this.worklet) {
      this.worklet.port.onmessage = null;
      try { this.worklet.disconnect(); } catch { /* already detached */ }
      this.worklet = null;
    }
    if (this.fallbackNode) {
      this.fallbackNode.onaudioprocess = null;
      try { this.fallbackNode.disconnect(); } catch { /* already detached */ }
      this.fallbackNode = null;
    }
    try { this.source?.disconnect(); } catch { /* already detached */ }
    this.source = null;
    this.analyser = null;

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      try { await this.ctx.close(); } catch { /* already closed */ }
      this.ctx = null;
    }

    this.rolling.reset();
    if (this.state !== 'error') this.state = 'idle';
  }
}
