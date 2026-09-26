import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', withCredentials: true });
api.interceptors.response.use(r=>r, error=>{ if(error.response?.status===401) window.dispatchEvent(new Event('sonic:unauthorized')); return Promise.reject(error); });
