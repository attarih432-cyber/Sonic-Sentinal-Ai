/**
 * Client-side Teachable Machine runtime client.
 *
 * This model runs entirely in the browser, so its audio is never uploaded to
 * the backend. Labels and their order are read from the loaded model's own
 * metadata, never assumed or hardcoded. A label string is only tidied for
 * display; the index it came from is preserved, so the probability always
 * belongs to the class the model was actually trained on.
 */
import { resample } from './audio';

/**
 * The Speech Commands recognizer for this project's export defaults to a
 * 44100 Hz browserFFT pipeline (fftSize 1024, hop 1024, 43 frames, first 232
 * bins of a 2048-point FFT in dB). A window is resampled to exactly this rate
 * so the spectrogram matches what the model was trained on.
 */
export const TM_SAMPLE_RATE = 44100;

/** Analysis-frame geometry of the exported graph (input shape [43, 232, 1]). */
const TM_FFT_SIZE = 2048;
const TM_HOP = 1024;
const TM_FRAMES = 43;
const TM_BINS = 232;
/** Samples needed for the full 43-frame spectrogram (window span ≈ 1.0 s). */
const TM_SPAN = TM_FRAMES * TM_HOP + TM_FFT_SIZE;

export interface TmClassScore {
  index: number;
  rawLabel: string;
  label: string;
  score: number;
  isTop: boolean;
  /** True for the runtime's own "_background_noise_" class, if the model has one. */
  isBackground: boolean;
}

export interface TmResult {
  scores: TmClassScore[];
  top: TmClassScore | null;
  /** Highest-scoring class that is an actual trained sound, not the runtime's filler. */
  topSound: TmClassScore | null;
  frameCount: number;
  sampleRate: number;
  windowSeconds: number;
}

export type TmStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SpeechCommandsFactory {
  create(
    vocabulary: string,
    modelType: 'BROWSER_FFT' | undefined,
    checkpointURL: string,
    metadataURL: string,
  ): any;
}

let scriptPromise: Promise<SpeechCommandsFactory> | null = null;
let recognizerPromise: Promise<any> | null = null;

/**
 * Where the exported model is served from (proxied to the backend in dev).
 *
 * It must be an absolute URL: the Speech Commands runtime parses the metadata
 * and checkpoint paths itself and rejects anything that is not http(s), so a
 * root-relative "/tm-model/metadata.json" fails with "Unsupported URL scheme".
 */
function modelBase(): string {
  return new URL('/tm-model', window.location.origin).href.replace(/\/$/, '');
}

/**
 * Absolute URL for one file of the exported model.
 *
 * Every caller must use this instead of building a path by hand. The Speech
 * Commands runtime fetches the metadata and checkpoint itself and rejects any
 * URL that is not http(s), so a root-relative "/tm-model/metadata.json" fails
 * with "Unsupported URL scheme" — which is what a hand-rolled
 * `host + '/tm-model/...'` string produced outside the dev server's port.
 */
export function tmModelUrl(file: string): string {
  return `${modelBase()}/${file.replace(/^\//, '')}`;
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).__sonicLoaded) { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      (script as any).__sonicLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

/** Load the TFJS + Speech Commands runtimes once for the whole page. */
async function loadRuntime(): Promise<SpeechCommandsFactory> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = (async () => {
    await loadScript('sonic-tfjs-runtime', '/vendor/tf.min.js');
    await loadScript('sonic-speech-commands-runtime', '/vendor/speech-commands.min.js');
    const factory = (window as any).speechCommands;
    if (!factory || typeof factory.create !== 'function') {
      throw new Error('Speech Commands runtime did not initialise.');
    }
    return factory as SpeechCommandsFactory;
  })().catch((err) => {
    scriptPromise = null;           // allow a retry after a transient failure
    throw err;
  });
  return scriptPromise;
}

/** Load (once) the exported Teachable Machine graph and its metadata. */
export function loadTeachableMachine(): Promise<any> {
  if (recognizerPromise) return recognizerPromise;
  const base = modelBase();
  recognizerPromise = (async () => {
    const factory = await loadRuntime();
    const recognizer = factory.create(
      'BROWSER_FFT',
      undefined,
      `${base}/model.json`,
      `${base}/metadata.json`,
    );
    await recognizer.ensureModelLoaded();
    return recognizer;
  })().catch((err) => {
    recognizerPromise = null;
    throw err;
  });
  return recognizerPromise;
}

/**
 * Presentation-only spelling fixes. The raw label and its index are always
 * kept, so this never changes which class a probability belongs to.
 */
const DISPLAY_ALIASES: Record<string, string> = {
  'alaram or siren': 'Alarm or Siren',
  'alram or siren': 'Alarm or Siren',
  'vehical horn': 'Vehicle Horn',
  'animal sound': 'Animal Sound',
  'machinery fault': 'Machinery Fault',
  'person asking for help': 'Person Asking for Help',
  'background noise': 'Background Noise',
  'glass breaking': 'Glass Breaking',
  'panic scream': 'Panic Scream',
  'aggression': 'Aggression',
  'gunshot': 'Gunshot',
};

function displayLabel(raw: string): string {
  const trimmed = (raw || '').trim();
  return DISPLAY_ALIASES[trimmed.toLowerCase()] || trimmed;
}

/**
 * The Speech Commands runtime injects a "_background_noise_" class ahead of the
 * trained labels when a model was exported with silence examples. It is a real
 * class with a real index, so it is reported like any other but flagged so the
 * UI can say what it is instead of presenting it as a detected sound.
 */
function isBackgroundLabel(raw: string): boolean {
  return /^\s*_/.test(raw);
}

/** The class order the trained model actually emits. */
export function tmLabelOrder(recognizer: any): string[] {
  const labels = recognizer?.wordLabels?.();
  return Array.isArray(labels) ? labels.map((l: any) => String(l)) : [];
}

/** Blackman window, matching what the browser AnalyserNode applies before its FFT. */
function blackman(n: number, size: number): number {
  return 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / size) + 0.08 * Math.cos((4 * Math.PI * n) / size);
}

const DB_FLOOR = 1e-10; // -200 dB: below this the analyser reports -Infinity

/**
 * Reproduce the truncated-FFT dB spectrogram the Speech Commands runtime feeds
 * the model when listening: 43 consecutive 2048-point FFT frames (hop 1024) of
 * the most recent audio at 44100 Hz, first 232 magnitude bins, converted to
 * decibels and flattened in frame-major order (43 * 232 == 9976 floats). This
 * is the exact input the graph's [43, 232, 1] shape expects; feeding raw PCM
 * would (and did) fail the runtime's divisibility check.
 *
 * The vendored TensorFlow.js is 1.3.x, which has tf.signal.stft but not
 * tf.signal.fft, so the whole spectrogram is produced with one stft call.
 */
async function computeTmSpectrogram(mono44k: Float32Array): Promise<Float32Array> {
  const tf = (window as any).tf;
  if (!tf?.signal?.stft) {
    throw new Error('TensorFlow.js is not available for the Teachable Machine spectrogram.');
  }
  if (mono44k.length < TM_SPAN) {
    throw new Error(
      `Not enough audio for the Teachable Machine window (needs ~${(TM_SPAN / TM_SAMPLE_RATE).toFixed(2)}s at ${Math.round(TM_SAMPLE_RATE / 1000)} kHz).`,
    );
  }

  // The most recent audio, like the analyser's live capture buffer.
  const tail = mono44k.subarray(mono44k.length - TM_SPAN);
  const windowFn = (len: number) =>
    tf.tensor1d(Array.from({ length: len }, (_, i) => blackman(i, len)));

  const x = tf.tensor1d(tail);
  let spectrogram: any;
  try {
    // [43, 1025] complex64 — one frame per 1024-sample hop.
    spectrogram = tf.signal.stft(x, TM_FFT_SIZE, TM_HOP, TM_FFT_SIZE, windowFn);
  } finally {
    x.dispose();
  }
  try {
    const magnitudes = tf.abs(spectrogram);              // [43, 1025] float
    const magData = await magnitudes.slice([0, 0], [TM_FRAMES, TM_BINS]).data();
    const flat = new Float32Array(TM_FRAMES * TM_BINS);
    for (let i = 0; i < flat.length; i++) {
      flat[i] = 20 * Math.log10(Math.max(magData[i], DB_FLOOR));
    }
    return flat;
  } finally {
    spectrogram.dispose();
  }
}

/**
 * Run the model over a mono window. The window is resampled to the model's
 * native rate and converted into the spectrogram the graph expects, so the
 * input matches training rather than being fed raw PCM.
 */
export async function recognizeWindow(
  recognizer: any,
  mono: Float32Array,
  inputRate: number,
): Promise<TmResult> {
  const at44k = inputRate === TM_SAMPLE_RATE ? mono : resample(mono, inputRate, TM_SAMPLE_RATE);

  const labels = tmLabelOrder(recognizer);
  if (labels.length === 0) {
    throw new Error('Teachable Machine metadata contained no class labels.');
  }

  const spectrogram = await computeTmSpectrogram(at44k);
  const out = await recognizer.recognize(spectrogram);
  const rawScores = out?.scores;
  if (!rawScores) throw new Error('Teachable Machine returned no scores.');

  // The label list and the score vector come from the same loaded model, so
  // index i in one is index i in the other. Nothing is assumed about the order.
  if (rawScores.length !== labels.length) {
    throw new Error(
      `Teachable Machine returned ${rawScores.length} scores for ${labels.length} labels.`,
    );
  }

  const scores: TmClassScore[] = labels.map((rawLabel, index) => ({
    index,
    rawLabel,
    label: isBackgroundLabel(rawLabel) ? 'Background / silence (runtime class)' : displayLabel(rawLabel),
    score: Number(rawScores[index] ?? 0),
    isTop: false,
    isBackground: isBackgroundLabel(rawLabel),
  }));

  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 0) scores[0].isTop = true;
  const topSound = scores.find((s) => !s.isBackground) ?? null;

  return {
    scores,
    top: scores[0] ?? null,
    topSound,
    frameCount: TM_SPAN,
    sampleRate: TM_SAMPLE_RATE,
    windowSeconds: TM_SPAN / TM_SAMPLE_RATE,
  };
}

/** Release the cached recognizer so the next start reloads cleanly. */
export function resetTeachableMachine(): void {
  recognizerPromise = null;
}
