import { api } from './client';

export const adminApi = {
  // Overview
  overview: () => api.get('/api/admin/overview'),

  // Users
  listUsers: (params?: { search?: string; role?: string; active?: boolean; limit?: number; offset?: number }) =>
    api.get('/api/admin/users', { params }),
  getUser: (userId: string) => api.get(`/api/admin/users/${userId}`),
  updateUser: (userId: string, data: { active?: boolean }) =>
    api.patch(`/api/admin/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/api/admin/users/${userId}`),

  // Detections
  listDetections: (params?: { user_id?: string; severity?: string; classification?: string; status?: string; limit?: number; offset?: number }) =>
    api.get('/api/admin/detections', { params }),

  // Alerts
  listAlerts: (params?: { user_id?: string; severity?: string; resolved?: boolean; limit?: number; offset?: number }) =>
    api.get('/api/admin/alerts', { params }),

  // Reports
  reports: () => api.get('/api/admin/reports'),

  // System
  system: () => api.get('/api/admin/system'),

  // Logs
  logs: (limit?: number) => api.get('/api/admin/logs', { params: { limit } }),
};
