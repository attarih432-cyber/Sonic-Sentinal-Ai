import {api} from './client';
import type {Detection} from './detections';

/** Turn a failed request into one readable sentence, never a silent no-op. */
export function liveErrorMessage(err: unknown, fallback: string): string {
  const e = err as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { detail?: unknown } };
  };
  if (e?.code === 'ECONNABORTED') {
    return 'The backend did not answer in time. It may be busy or restarting.';
  }
  if (!e?.response) {
    return 'Cannot reach the prediction service. Check that the backend is running on port 8000.';
  }
  const {status, data} = e.response;
  const detail = data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as {msg?: string};
    if (first?.msg) return first.msg;
  }
  if (status === 401) return 'Your session expired. Sign in again.';
  if (status === 413) return 'The audio window was too large to process.';
  if (status === 415) return 'The backend could not read that audio format.';
  if (status === 422) return 'The backend rejected the audio window as invalid.';
  if (status && status >= 500) return `The backend failed while classifying (HTTP ${status}).`;
  return fallback;
}

export interface WarmupState {
  status: 'cold' | 'warming' | 'ready' | 'error' | 'unknown';
  seconds?: number | null;
  error?: string | null;
}

export const liveApi = {
  /**
   * Send one rolling microphone window for classification.
   * The blob is a real PCM WAV encoded in the browser, which is the only
   * container the server-side decoder reads reliably.
   *
   * The timeout is generous on purpose: a backend that has just restarted is
   * still building the YAMNet graph, which takes over a minute. A short timeout
   * would report a failure for a prediction that was about to succeed.
   */
  analyzeChunk: (blob: Blob, filename: string, sessionId?: string | null) => {
    const body = new FormData();
    body.append('audio', blob, filename);
    if (sessionId) body.append('session_id', sessionId);
    return api.post<Detection>('/live/analyze', body, {timeout: 180000});
  },

  /** Whether the server-side models have finished their first-run warm-up. */
  warmup: () => api.get<{status: string; modelWarmup?: WarmupState}>('/health'),
};
