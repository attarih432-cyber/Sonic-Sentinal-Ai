import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, type User } from '../api/auth';

type Context = {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Context | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Safety timeout: Never keep the user on a loading screen for more than 1.5s
    const maxWaitTimer = setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, 1500);

    authApi.me()
      .then(({ data }) => {
        if (active) {
          setUser(data);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        clearTimeout(maxWaitTimer);
        if (active) {
          setLoading(false);
        }
      });

    const expired = () => setUser(null);
    window.addEventListener('sonic:unauthorized', expired);
    return () => {
      active = false;
      clearTimeout(maxWaitTimer);
      window.removeEventListener('sonic:unauthorized', expired);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        logout: async () => {
          try {
            await authApi.logout();
          } catch (_) {
            // Ignore error on logout
          }
          setUser(null);
        }
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
};
