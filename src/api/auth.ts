import { api } from './client';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'reviewer' | 'admin';
  avatar?: string;
  createdAt: string;
}

export const authApi = {
  login: (email: string, password: string) => 
    api.post<User>('/auth/login', { email, password }),
  register: (name: string, email: string, password: string) => 
    api.post<User>('/auth/register', { name, email, password }),
  me: () => 
    api.get<User>('/auth/me', { timeout: 2500 }),
  logout: () => 
    api.post('/auth/logout', {}, { timeout: 2500 }),
  forgotPassword: (email: string) => 
    api.post('/auth/forgot-password', { email }),
  updateProfile: (name: string) => 
    api.patch<User>('/auth/profile', { name }),
};
