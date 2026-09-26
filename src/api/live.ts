import {api} from './client';
import type {Detection} from './detections';

export const liveApi = {
  analyzeChunk: (blob: Blob, filename: string, sessionId?: string | null) => {
    const body = new FormData();
    body.append('audio', blob, filename);
    if (sessionId) body.append('session_id', sessionId);
    return api.post<Detection>('/live/analyze', body);
  },
};