import {api} from './client';

export interface LiveSession {
  id: string;
  source: 'microphone' | 'camera' | 'both';
  status: 'active' | 'stopped';
  startedAt: string;
  endedAt: string | null;
  detectionCount: number;
  alertCount: number;
}

export const sessionsApi = {
  start: (source: 'microphone' | 'camera' | 'both' = 'microphone') => {
    const body = new FormData();
    body.append('source', source);
    return api.post<LiveSession>('/live/sessions/start', body);
  },
  stop: (id: string) => api.post<LiveSession>(`/live/sessions/${id}/stop`),
  list: (limit = 20) => api.get<LiveSession[]>('/live/sessions', {params: {limit}}),
  active: () => api.get<LiveSession | null>('/live/sessions/active'),
};