/**
 * Client-side audio utilities for the live microphone pipeline.
 *
 * Why this exists: the browser's MediaRecorder can only emit WebM/Opus, AAC or
 * MP4. The backend decodes with libsndfile, which has no WebM/Opus decoder, so
 * a MediaRecorder blob reaches the classifier as undecodable bytes. Capturing
 * raw PCM from the Web Audio graph and encoding a real WAV here removes that
 * format gap entirely, and gives exact control over window size.
 */

/** Resample mono float samples to a target rate using a windowed low-pass. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  if (input.length === 0) return new Float32Array(0);

  const ratio = to / from;
  const outLength = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLength);

  // Cutoff below the lower of the two Nyquist limits, with a simple
  // raised-cosine window to suppress aliasing when downsampling.
  const cutoff = Math.min(0.5, 0.5 * ratio);
  const taps = 16;
  const kernel = new Float32Array(taps * 2 + 1);
  let sum = 0;
  for (let i = -taps; i <= taps; i++) {
    const x = i;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * x);
    const window = 0.5 * (1 + Math.cos((Math.PI * x) / (2 * taps)));
    kernel[i + taps] = sinc * window;
    sum += kernel[i + taps];
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  for (let i = 0; i < outLength; i++) {
    const center = i / ratio;
    const base = Math.floor(center);
    let acc = 0;
    for (let k = -taps; k <= taps; k++) {
      const idx = base + k;
      if (idx < 0 || idx >= input.length) continue;
      acc += input[idx] * kernel[k + taps];
    }
    out[i] = acc;
  }
  return out;
}

/** Encode mono float samples as a 16-bit PCM WAV blob. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);            // PCM chunk size
  view.setUint16(20, 1, true);             // format = PCM
  view.setUint16(22, 1, true);             // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Peak-normalise a window to a consistent level before it reaches a model. */
export function normalize(samples: Float32Array, targetPeak = 0.95): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > peak) peak = v;
  }
  if (peak < 1e-6) return samples;
  if (peak >= targetPeak) return samples;
  const gain = targetPeak / peak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/** Root-mean-square level, used to tell silence from real audio. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i] * samples[i];
  return Math.sqrt(acc / samples.length);
}

/**
 * Rolling sample buffer. Audio is appended continuously and read back as
 * fixed-length windows, which is what a streaming classifier actually needs.
 */
export class RollingWindow {
  private buffer: Float32Array;
  private write = 0;
  private filled = 0;

  constructor(private capacity: number) {
    this.buffer = new Float32Array(capacity);
  }

  push(chunk: Float32Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.buffer[this.write] = chunk[i];
      this.write = (this.write + 1) % this.capacity;
      if (this.filled < this.capacity) this.filled++;
    }
  }

  /** Length of the most recent `n` samples, or 0 when not enough has arrived. */
  get available(): number {
    return this.filled;
  }

  /** The newest `n` samples in chronological order, or null if not full yet. */
  latest(n: number): Float32Array | null {
    if (this.filled < n) return null;
    const out = new Float32Array(n);
    let idx = (this.write - n + this.capacity) % this.capacity;
    for (let i = 0; i < n; i++) {
      out[i] = this.buffer[idx];
      idx = (idx + 1) % this.capacity;
    }
    return out;
  }

  reset(): void {
    this.buffer.fill(0);
    this.write = 0;
    this.filled = 0;
  }
}
