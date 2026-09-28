import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { 
  ShieldCheck, Activity, ChevronDown, ArrowRight, Radio, Mic, 
  Sparkles, LineChart, BellRing, Cpu, Volume2, Database, Sliders,
  CheckCircle2, Lock, Zap, Layers, RefreshCw, BarChart3, Terminal
} from 'lucide-react';
import { Logo } from './brand';
import { HologramHeadsetStage } from './components/AudioVisuals';
import { AuthCard, type AuthMode } from './auth/AuthCard';

/* ---------- Canvas starfield particles ---------- */
function AmbientStarfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = (canvas.width = canvas.offsetWidth * window.devicePixelRatio);
    let h = (canvas.height = canvas.offsetHeight * window.devicePixelRatio);
    const N = 85;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() * 1.5 + 0.5) * window.devicePixelRatio,
      v: Math.random() * 0.4 + 0.15,
      o: Math.random() * Math.PI * 2
    }));

    const onResize = () => {
      if (!canvas) return;
      w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    window.addEventListener('resize', onResize);

    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        p.y -= p.v;
        p.o += 0.02;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        const tw = 0.35 + Math.sin(p.o) * 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${tw * 0.75})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="starfield" />;
}

export function LandingPage({
  onStart,
  showAuthDirectly = false,
  initialAuthMode = 'login'
}: {
  onStart: (mode: 'login' | 'register') => void;
  showAuthDirectly?: boolean;
  initialAuthMode?: 'login' | 'register';
}) {
  const [inlineAuthMode, setInlineAuthMode] = useState<AuthMode | null>(
    showAuthDirectly ? initialAuthMode : null
  );

  const features = [
    {
      title: 'Real-Time Monitoring',
      desc: 'Sub-second acoustic stream capture with low-latency browser Web Audio analysis and continuous telemetry.',
      icon: Radio,
      color: '#00f0ff'
    },
    {
      title: 'AI Audio Classification',
      desc: 'Deep feature extraction across MFCC, spectral centroid, zero-crossing rate and Chroma signal metrics.',
      icon: Cpu,
      color: '#7b61ff'
    },
    {
      title: 'Critical Event Detection',
      desc: 'Instant rule-based thresholds detecting gunshots, emergency sirens, vehicular collisions and distress alarms.',
      icon: BellRing,
      color: '#ff3366'
    },
    {
      title: 'Model Comparison',
      desc: 'Independent side-by-side consensus evaluation between native Python ML models and Google Teachable Machine.',
      icon: Layers,
      color: '#00d4ff'
    },
    {
      title: 'Audio Analytics',
      desc: 'Comprehensive multi-day classification distributions, event trends, noise robustness and severity breakdowns.',
      icon: BarChart3,
      color: '#ffb800'
    },
    {
      title: 'Secure Monitoring',
      desc: 'Role-based access control, cryptographic session persistence, and zero unauthorized background microphone recording.',
      icon: Lock,
      color: '#2fe0a8'
    }
  ];

  const pipeline = [
    { step: '01', title: 'Audio Input', desc: 'WAV, MP3, FLAC, OGG, M4A upload or live mic stream' },
    { step: '02', title: 'Validation', desc: 'MIME check, container verification, size bounds' },
    { step: '03', title: 'Preprocessing', desc: 'Resampling, mono conversion, silence trimming' },
    { step: '04', title: 'Feature Extraction', desc: 'MFCCs, spectral roll-off, chroma, RMS energy' },
    { step: '05', title: 'AI Classification', desc: 'YAMNet, SVM, CNN & Teachable Machine' },
    { step: '06', title: 'Confidence Scoring', desc: 'Calibrated probability distribution metrics' },
    { step: '07', title: 'Critical Event Rules', desc: 'Threat severity classification (Low to Critical)' },
    { step: '08', title: 'Real-Time Alert', desc: 'Push notifications & audio telemetry dispatch' },
    { step: '09', title: 'Operator Review', desc: 'Human-in-the-loop validation & audit history' }
  ];

  return (
    <div className="landing-futuristic">
      <AmbientStarfield />
      <div className="ambient-glow glow-cyan" />
      <div className="ambient-glow glow-purple" />

      {/* Top Navigation */}
      <header className="landing-top-bar">
        <Logo />
        <nav className="landing-nav-links">
          <a href="#hero">Platform</a>
          <a href="#features">Capabilities</a>
          <a href="#pipeline">Pipeline</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <div className="landing-nav-ctas">
          <button 
            className="ghost-neon-btn" 
            onClick={() => setInlineAuthMode('login')}
          >
            Sign In
          </button>
          <button 
            className="primary-glow-btn compact" 
            onClick={() => setInlineAuthMode('register')}
          >
            <span>Get Started</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Split Hero Section matching reference */}
      <section id="hero" className="cinematic-hero-section">
        <div className="hero-split-grid">
          
          {/* Left Column: Visual Brand, Tagline & 3D Stage */}
          <div className="hero-left-col">
            <div className="brand-tag-wrapper">
              <span className="brand-dot" />
              <span className="brand-sub">Hear • Detect • Protect</span>
            </div>

            <h1 className="hero-giant-title">
              AI-Powered <br />
              <span className="neon-gradient-text">Audio Threat Detection</span>
            </h1>

            <p className="hero-lead-text">
              SonicSentinel analyzes acoustic telemetry in real time using advanced machine learning 
              models to detect critical sounds, categorize anomalies, and safeguard mission-critical 
              environments.
            </p>

            {/* Feature Pills from reference */}
            <div className="hero-badge-grid">
              <div className="hero-badge-item">
                <Radio size={16} className="text-cyan" />
                <span>Real-Time Monitoring</span>
              </div>
              <div className="hero-badge-item">
                <Cpu size={16} className="text-purple" />
                <span>Multi-Model AI Analysis</span>
              </div>
              <div className="hero-badge-item">
                <BellRing size={16} className="text-crimson" />
                <span>Instant Alerts</span>
              </div>
              <div className="hero-badge-item">
                <ShieldCheck size={16} className="text-emerald" />
                <span>Secure & Reliable</span>
              </div>
            </div>

            {/* 3D Hologram Headset Stage Component */}
            <div className="hero-3d-stage-box">
              <HologramHeadsetStage />
            </div>
          </div>

          {/* Right Column: Embedded Glass Auth Card or Hero Showcase */}
          <div className="hero-right-col">
            <div className="auth-card-sticky-wrapper">
              <AnimatePresence mode="wait">
                {inlineAuthMode ? (
                  <motion.div
                    key="auth-card-view"
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -14, scale: 0.98 }}
                    transition={{ duration: 0.22 }}
                  >
                    <AuthCard 
                      key={inlineAuthMode}
                      initialMode={inlineAuthMode}
                      onCancel={() => setInlineAuthMode(null)}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="hero-showcase-view"
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -14, scale: 0.98 }}
                    transition={{ duration: 0.22 }}
                    className="hero-preview-showcase"
                  >
                    <div className="showcase-top-row">
                      <div className="showcase-brand">
                        <span className="pulse-dot" />
                        <span>Acoustic Threat Hub</span>
                      </div>
                      <span className="status-live-pill">
                        <span className="pulse-dot green" />
                        Online
                      </span>
                    </div>

                    <div className="showcase-visual-box">
                      <div className="showcase-visual-head">
                        <h5>Live Spectral Density Trace</h5>
                        <span className="frequency-spec">48.0 kHz · 24-bit</span>
                      </div>
                      <div className="showcase-mini-wave">
                        {Array.from({ length: 36 }, (_, i) => {
                          const h = 10 + Math.sin(i * 0.5) * 22 + (i % 4 === 0 ? 12 : 0);
                          return (
                            <span 
                              key={i} 
                              className="showcase-wave-bar" 
                              style={{ 
                                height: `${h}px`,
                                animationDelay: `${i * 40}ms`
                              }} 
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="showcase-detection-cards">
                      <div className="showcase-det-row">
                        <span className="class-badge" style={{ color: '#ff3366', background: 'rgba(255, 51, 102, 0.15)', border: '1px solid rgba(255, 51, 102, 0.4)' }}>
                          Gunshot Detected
                        </span>
                        <b className="conf-value text-crimson">98.7%</b>
                      </div>
                      <div className="showcase-det-row">
                        <span className="class-badge" style={{ color: '#00f0ff', background: 'rgba(0, 240, 255, 0.15)', border: '1px solid rgba(0, 240, 255, 0.4)' }}>
                          Siren
                        </span>
                        <b className="conf-value text-cyan">99.2%</b>
                      </div>
                      <div className="showcase-det-row">
                        <span className="class-badge" style={{ color: '#ffb800', background: 'rgba(255, 184, 0, 0.15)', border: '1px solid rgba(255, 184, 0, 0.4)' }}>
                          Vehicle Horn
                        </span>
                        <b className="conf-value text-amber">96.4%</b>
                      </div>
                    </div>

                    <div className="showcase-action-group">
                      <button 
                        className="primary-glow-btn full-width"
                        onClick={() => setInlineAuthMode('login')}
                      >
                        <span>Sign In to Sentinel</span>
                        <ArrowRight size={15} />
                      </button>

                      <button 
                        className="ghost-neon-btn full-width text-center"
                        onClick={() => setInlineAuthMode('register')}
                      >
                        <span>Create Free Account</span>
                      </button>
                    </div>

                    <p className="showcase-hint">
                      Instant verification · Dual ML consensus · Zero hidden telemetry
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </section>

      {/* Capabilities / Feature Cards */}
      <section id="features" className="landing-section">
        <div className="section-title-center">
          <span className="section-eyebrow">INTELLIGENCE SUITE</span>
          <h2>Next-Generation Acoustic Threat Classification</h2>
          <p className="muted">Engineered for real-world enterprise environments with zero latency compromise.</p>
        </div>

        <div className="feature-cards-grid">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div 
                key={f.title} 
                className="glass-feature-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.5 }}
                whileHover={{ y: -5 }}
              >
                <div 
                  className="feature-icon-box"
                  style={{
                    background: `${f.color}15`,
                    color: f.color,
                    border: `1px solid ${f.color}44`,
                    boxShadow: `0 0 15px ${f.color}33`
                  }}
                >
                  <Icon size={22} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="feature-hover-line" style={{ background: f.color }} />
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Pipeline / How SonicSentinel Works */}
      <section id="pipeline" className="landing-section pipeline-section">
        <div className="section-title-center">
          <span className="section-eyebrow">AUDITABLE PIPELINE</span>
          <h2>How SonicSentinel Works</h2>
          <p className="muted">Every sound wave traverses a deterministic forensic pipeline from capture to operator action.</p>
        </div>

        <div className="pipeline-flow-grid">
          {pipeline.map((p, idx) => (
            <div key={p.step} className="pipeline-step-card">
              <div className="step-num">{p.step}</div>
              <h4>{p.title}</h4>
              <p>{p.desc}</p>
              {idx < pipeline.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Architecture & Verification Section */}
      <section id="architecture" className="landing-section">
        <div className="architecture-glass-card">
          <div className="arch-header">
            <div>
              <span className="section-eyebrow">SYSTEM ARCHITECTURE</span>
              <h3>Dual-Engine Verification & Resilient Telemetry</h3>
            </div>
            <span className="pill seg-ok">
              <span className="pulse-dot" /> Production Grade
            </span>
          </div>

          <div className="arch-body-grid">
            <div className="arch-item">
              <div className="arch-icon"><Terminal size={18} /></div>
              <div>
                <b>Python ML Engine</b>
                <p>Librosa feature extraction pipeline driving a YAMNet embedding classifier alongside SVM and CNN classifiers.</p>
              </div>
            </div>

            <div className="arch-item">
              <div className="arch-icon"><Layers size={18} /></div>
              <div>
                <b>Teachable Machine Adapter</b>
                <p>Decoupled secondary neural network model adapter providing independent confirmation without bias.</p>
              </div>
            </div>

            <div className="arch-item">
              <div className="arch-icon"><Zap size={18} /></div>
              <div>
                <b>FastAPI Microservice</b>
                <p>Asynchronous event dispatching, memory-safe audio chunking, and non-blocking MongoDB Atlas persistence.</p>
              </div>
            </div>

            <div className="arch-item">
              <div className="arch-icon"><Database size={18} /></div>
              <div>
                <b>Zero-Leak Privacy Design</b>
                <p>Audio is analyzed strictly during explicit sessions. Microphone permissions require active operator consent.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="landing-cta-bottom">
        <div className="cta-box">
          <Activity size={32} className="text-cyan" />
          <h2>Ready to Deploy SonicSentinel?</h2>
          <p className="muted">Access live audio classification, real-time threat alerts, and automated reporting.</p>
          <button 
            className="primary-glow-btn big" 
            onClick={() => {
              setInlineAuthMode('register');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span>Launch Sentinel Workspace</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-foot-bar">
        <Logo />
        <p className="muted">
          © {new Date().getFullYear()} SonicSentinel AI. Acoustic Threat Intelligence. All rights reserved.
        </p>
        <div className="foot-status">
          <span className="pulse-dot" />
          <span>System Online</span>
        </div>
      </footer>
    </div>
  );
}