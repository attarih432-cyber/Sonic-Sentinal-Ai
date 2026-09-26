import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, Lock, Eye, EyeOff, User, ArrowRight, Loader2, 
  CheckCircle2, AlertTriangle, ShieldCheck, ChevronLeft
} from 'lucide-react';
import { authApi } from '../api/auth';
import { Logo } from '../brand';

export type AuthMode = 'login' | 'register' | 'forgot';

export function AuthCard({
  initialMode = 'login',
  onSuccess,
  onCancel
}: {
  initialMode?: AuthMode;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccessMsg('');

    try {
      if (mode === 'login') {
        await authApi.login(email.trim(), password);
        if (onSuccess) onSuccess();
        else window.location.reload();
      } else if (mode === 'register') {
        await authApi.register(name.trim(), email.trim(), password);
        if (onSuccess) onSuccess();
        else window.location.reload();
      } else if (mode === 'forgot') {
        await authApi.forgotPassword(email.trim());
        setSuccessMsg('Password reset instructions have been sent to your email.');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Authentication failed. Please verify credentials.');
    } finally {
      setBusy(false);
    }
  };

  const apiUrl = import.meta.env.VITE_API_URL ?? '/api';

  return (
    <div className="glass-auth-card">
      {onCancel && (
        <button className="auth-back-btn" onClick={onCancel} type="button">
          <ChevronLeft size={14} />
          <span>Back to Landing</span>
        </button>
      )}

      <div className="auth-brand-head">
        <Logo large />
      </div>

      <div className="auth-titles">
        <h3>
          {mode === 'login' && 'Sign in to your SonicSentinel account'}
          {mode === 'register' && 'Create your SonicSentinel account'}
          {mode === 'forgot' && 'Reset your password'}
        </h3>
        <p className="muted">
          {mode === 'login' && 'Enter your credentials to access live acoustic monitoring.'}
          {mode === 'register' && 'Join the next-generation acoustic threat intelligence workspace.'}
          {mode === 'forgot' && 'Enter your registered email to receive recovery instructions.'}
        </p>
      </div>

      {/* Form Fields */}
      <form onSubmit={submit} className="auth-form-fields">
        {mode === 'register' && (
          <div className="input-group">
            <label>Full Name</label>
            <div className="input-wrap">
              <User size={16} className="input-icon" />
              <input 
                className="glass-input" 
                placeholder="Enter your name" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
                autoFocus
              />
            </div>
          </div>
        )}

        <div className="input-group">
          <label>Email Address</label>
          <div className="input-wrap">
            <Mail size={16} className="input-icon" />
            <input 
              className="glass-input" 
              type="email" 
              placeholder="Enter your email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              autoFocus={mode !== 'register'}
            />
          </div>
        </div>

        {mode !== 'forgot' && (
          <div className="input-group">
            <label>Password</label>
            <div className="input-wrap">
              <Lock size={16} className="input-icon" />
              <input 
                className="glass-input" 
                type={showPassword ? 'text' : 'password'} 
                placeholder="Enter your password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                minLength={8}
              />
              <button 
                type="button" 
                className="pw-toggle" 
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}

        {mode === 'login' && (
          <div className="auth-row-options">
            <label className="remember-label">
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={e => setRememberMe(e.target.checked)} 
              />
              <span>Remember me</span>
            </label>
            <button 
              type="button" 
              className="link-btn" 
              onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="auth-error-box">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </motion.div>
        )}

        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="auth-success-box">
            <CheckCircle2 size={15} />
            <span>{successMsg}</span>
          </motion.div>
        )}

        <button className="primary-glow-btn" disabled={busy} type="submit">
          {busy ? (
            <>
              <Loader2 className="spin" size={16} />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>
                {mode === 'login' && 'Sign In'}
                {mode === 'register' && 'Create Account'}
                {mode === 'forgot' && 'Send Reset Link'}
              </span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      {/* Social OAuth Dividers */}
      {mode !== 'forgot' && (
        <>
          <div className="auth-or-sep">
            <span>Or continue with</span>
          </div>

          <div className="oauth-btn-grid">
            <button 
              type="button" 
              className="oauth-btn" 
              onClick={() => window.location.href = `${apiUrl}/auth/google`}
              disabled={busy}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span>Google</span>
            </button>

            <button 
              type="button" 
              className="oauth-btn" 
              onClick={() => window.location.href = `${apiUrl}/auth/facebook`}
              disabled={busy}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span>Facebook</span>
            </button>
          </div>
        </>
      )}

      {/* Switch Mode Footer */}
      <div className="auth-card-foot">
        {mode === 'login' && (
          <p>
            Don&apos;t have an account?{' '}
            <button 
              type="button" 
              className="link-highlight" 
              onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
            >
              Register
            </button>
          </p>
        )}
        {mode === 'register' && (
          <p>
            Already have an account?{' '}
            <button 
              type="button" 
              className="link-highlight" 
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            >
              Sign In
            </button>
          </p>
        )}
        {mode === 'forgot' && (
          <p>
            Remember your credentials?{' '}
            <button 
              type="button" 
              className="link-highlight" 
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            >
              Back to Sign In
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
