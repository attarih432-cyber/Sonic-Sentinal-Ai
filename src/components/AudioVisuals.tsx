import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Volume2, ShieldAlert, Car, AlertOctagon, Dog, Wrench, 
  Sparkles, Radio, Play, Pause, RotateCcw, VolumeX, Mic, MicOff,
  Flame, Bell, Activity
} from 'lucide-react';

/* -------------------------------------------------------------
 * 1. CLASS BADGE & ICONS
 * ------------------------------------------------------------- */
export interface ClassMeta {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  glow: string;
}

export const CLASS_META: Record<string, ClassMeta> = {
  'Gunshot': { label: 'Gunshot', icon: Flame, color: '#ff3366', bg: 'rgba(255, 51, 102, 0.15)', glow: 'rgba(255, 51, 102, 0.4)' },
  'Siren': { label: 'Siren', icon: Volume2, color: '#00f0ff', bg: 'rgba(0, 240, 255, 0.15)', glow: 'rgba(0, 240, 255, 0.4)' },
  'Vehicle Horn': { label: 'Vehicle Horn', icon: Car, color: '#ffb800', bg: 'rgba(255, 184, 0, 0.15)', glow: 'rgba(255, 184, 0, 0.4)' },
  'Vehicle': { label: 'Vehicle', icon: Car, color: '#ffb800', bg: 'rgba(255, 184, 0, 0.15)', glow: 'rgba(255, 184, 0, 0.4)' },
  'Panic Scream': { label: 'Panic Scream', icon: AlertOctagon, color: '#ff3366', bg: 'rgba(255, 51, 102, 0.15)', glow: 'rgba(255, 51, 102, 0.4)' },
  'Aggression': { label: 'Aggression', icon: AlertOctagon, color: '#ff5c85', bg: 'rgba(255, 92, 133, 0.15)', glow: 'rgba(255, 92, 133, 0.4)' },
  'Animal Sound': { label: 'Animal Sound', icon: Dog, color: '#2fe0a8', bg: 'rgba(47, 224, 168, 0.15)', glow: 'rgba(47, 224, 168, 0.4)' },
  'Machinery Fault': { label: 'Machinery Fault', icon: Wrench, color: '#7b61ff', bg: 'rgba(123, 97, 255, 0.15)', glow: 'rgba(123, 97, 255, 0.4)' },
  'Glass Breaking': { label: 'Glass Breaking', icon: Sparkles, color: '#00d4ff', bg: 'rgba(0, 212, 255, 0.15)', glow: 'rgba(0, 212, 255, 0.4)' },
  'Urban noise': { label: 'Urban Noise', icon: Activity, color: '#849495', bg: 'rgba(132, 148, 149, 0.15)', glow: 'rgba(132, 148, 149, 0.3)' },
  'Other': { label: 'Other', icon: Radio, color: '#849495', bg: 'rgba(132, 148, 149, 0.15)', glow: 'rgba(132, 148, 149, 0.3)' },
};

export function getClassMeta(classification?: string): ClassMeta {
  if (!classification) return CLASS_META['Other'];
  const match = Object.keys(CLASS_META).find(k => k.toLowerCase() === classification.toLowerCase());
  return match ? CLASS_META[match] : {
    label: classification,
    icon: Volume2,
    color: '#00f0ff',
    bg: 'rgba(0, 240, 255, 0.15)',
    glow: 'rgba(0, 240, 255, 0.4)'
  };
}

export function ClassBadge({ classification, className = '' }: { classification?: string; className?: string }) {
  const meta = getClassMeta(classification);
  const Icon = meta.icon;
  return (
    <span 
      className={`class-badge ${className}`}
      style={{
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.color}44`,
        boxShadow: `0 0 10px ${meta.glow}`
      }}
    >
      <Icon size={13} />
      <span>{meta.label}</span>
    </span>
  );
}

export function SeverityBadge({ severity }: { severity?: string }) {
  const s = (severity || 'low').toLowerCase();
  return <span className={`pill seg-${s}`}>{s}</span>;
}

/* -------------------------------------------------------------
 * 2. 3D HOLOGRAM HEADSET STAGE (Hero & Login Left Visual)
 * ------------------------------------------------------------- */
export function HologramHeadsetStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const resize = () => {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particles for soundwave dispersion
    const particles = Array.from({ length: 45 }, () => ({
      x: (Math.random() - 0.5) * 260,
      y: Math.random() * 200 - 100,
      r: Math.random() * 2 + 1,
      vy: -(Math.random() * 0.8 + 0.3),
      vx: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.7 + 0.3,
      pulse: Math.random() * Math.PI * 2
    }));

    const render = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H * 0.62;
      t += 0.025;

      // 1. Draw glowing concentric elliptical rings on floor
      const rings = [
        { rx: 170, ry: 50, color: 'rgba(0, 240, 255, 0.4)', lw: 2.5 },
        { rx: 140, ry: 40, color: 'rgba(0, 240, 255, 0.6)', lw: 3 },
        { rx: 100, ry: 28, color: 'rgba(123, 97, 255, 0.7)', lw: 2 },
        { rx: 65, ry: 18, color: 'rgba(0, 240, 255, 0.9)', lw: 2.5 }
      ];

      // Subtle rotating floor glow
      const floorGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 220);
      floorGrad.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
      floorGrad.addColorStop(0.4, 'rgba(123, 97, 255, 0.12)');
      floorGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 210, 65, 0, 0, Math.PI * 2);
      ctx.fill();

      // Floor rings
      rings.forEach((r, idx) => {
        ctx.beginPath();
        const pulse = Math.sin(t * 1.5 + idx * 0.8) * 4;
        ctx.ellipse(cx, cy, r.rx + pulse, r.ry + pulse * 0.3, 0, 0, Math.PI * 2);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.lw;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.stroke();
      });

      // Rotating tick marks along outer ring
      ctx.save();
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00f0ff';
      const outerRx = 175;
      const outerRy = 52;
      const ticks = 36;
      for (let i = 0; i < ticks; i++) {
        const angle = (i / ticks) * Math.PI * 2 + t * 0.2;
        const x1 = cx + Math.cos(angle) * (outerRx - 4);
        const y1 = cy + Math.sin(angle) * (outerRy - 1.2);
        const x2 = cx + Math.cos(angle) * (outerRx + 6);
        const y2 = cy + Math.sin(angle) * (outerRy + 2);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = i % 4 === 0 ? '#00f0ff' : 'rgba(0, 240, 255, 0.3)';
        ctx.lineWidth = i % 4 === 0 ? 2 : 1;
        ctx.stroke();
      }
      ctx.restore();

      // 2. Central Holographic Audio Waveform column
      const bars = 28;
      const barSpacing = 7;
      const totalWidth = bars * barSpacing;
      const startX = cx - totalWidth / 2;
      const waveCenterY = cy - 85;

      ctx.save();
      for (let i = 0; i < bars; i++) {
        const x = startX + i * barSpacing;
        const distFromCenter = Math.abs(i - bars / 2) / (bars / 2);
        const wave = Math.sin(t * 3.5 + i * 0.45) * 32 * (1 - distFromCenter * 0.5);
        const h = Math.max(8, Math.abs(wave) + 12);
        
        const grad = ctx.createLinearGradient(x, waveCenterY - h, x, waveCenterY + h);
        grad.addColorStop(0, '#00f0ff');
        grad.addColorStop(0.5, '#7b61ff');
        grad.addColorStop(1, '#00f0ff');

        ctx.fillStyle = grad;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10;
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(x, waveCenterY - h / 2, 3.5, h, 2);
        } else {
          ctx.rect(x, waveCenterY - h / 2, 3.5, h);
        }
        ctx.fill();
      }
      ctx.restore();

      // 3. Floating particles rising from the stage
      ctx.save();
      particles.forEach(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.pulse += 0.05;
        if (p.y < -160) {
          p.y = 20;
          p.x = (Math.random() - 0.5) * 200;
        }
        const px = cx + p.x;
        const py = cy + p.y;
        const alpha = Math.max(0, p.alpha * (1 - Math.abs(p.y) / 160));

        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 8;
        ctx.fill();
      });
      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="hologram-stage-container">
      <canvas ref={canvasRef} className="hologram-canvas" />

      {/* Futuristic 3D Headphone Vector Graphic overlay with floating pulse */}
      <div className="headset-graphic-wrapper">
        <svg viewBox="0 0 340 340" className="headset-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="neonCyanGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#0070f3" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#7b61ff" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="metalArch" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0b172a" />
              <stop offset="30%" stopColor="#1e293b" />
              <stop offset="50%" stopColor="#38bdf8" />
              <stop offset="70%" stopColor="#1e293b" />
              <stop offset="100%" stopColor="#0b172a" />
            </linearGradient>
            <filter id="cyanGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Headband arch */}
          <path 
            d="M 75 190 C 70 80, 270 80, 265 190" 
            stroke="url(#metalArch)" 
            strokeWidth="16" 
            strokeLinecap="round" 
          />
          {/* Inner Headband glow wire */}
          <path 
            d="M 85 185 C 80 95, 260 95, 255 185" 
            stroke="url(#neonCyanGlow)" 
            strokeWidth="3.5" 
            strokeLinecap="round"
            filter="url(#cyanGlowFilter)"
          />

          {/* Left Earcup */}
          <g transform="translate(48, 160)">
            {/* Earcup outer body */}
            <rect x="0" y="0" width="46" height="74" rx="23" fill="#0d1527" stroke="#1e293b" strokeWidth="3" />
            {/* Earcup glowing ring */}
            <circle cx="23" cy="37" r="18" stroke="#00f0ff" strokeWidth="2.5" filter="url(#cyanGlowFilter)" />
            <circle cx="23" cy="37" r="12" fill="#00f0ff" fillOpacity="0.15" />
            {/* LED activity dot */}
            <circle cx="23" cy="37" r="4" fill="#00f0ff" />
          </g>

          {/* Right Earcup */}
          <g transform="translate(246, 160)">
            {/* Earcup outer body */}
            <rect x="0" y="0" width="46" height="74" rx="23" fill="#0d1527" stroke="#1e293b" strokeWidth="3" />
            {/* Earcup glowing ring */}
            <circle cx="23" cy="37" r="18" stroke="#00f0ff" strokeWidth="2.5" filter="url(#cyanGlowFilter)" />
            <circle cx="23" cy="37" r="12" fill="#00f0ff" fillOpacity="0.15" />
            {/* LED activity dot */}
            <circle cx="23" cy="37" r="4" fill="#00f0ff" />
          </g>

          {/* Futuristic boom microphone */}
          <path 
            d="M 68 215 C 68 245, 120 265, 148 260" 
            stroke="#1e293b" 
            strokeWidth="5" 
            strokeLinecap="round" 
          />
          <path 
            d="M 68 215 C 68 245, 120 265, 148 260" 
            stroke="#00f0ff" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
          />
          {/* Mic capsule */}
          <rect x="144" y="252" width="22" height="15" rx="6" fill="#0f172a" stroke="#00f0ff" strokeWidth="2" filter="url(#cyanGlowFilter)" />
          <circle cx="155" cy="259.5" r="2.5" fill="#ff3366" />
        </svg>
      </div>

      {/* Floating Holographic Detection Badges */}
      <div className="floating-badge badge-gunshot">
        <Flame size={14} />
        <span>Gunshot Detected</span>
      </div>
      <div className="floating-badge badge-siren">
        <Volume2 size={14} />
        <span>Siren 98.7%</span>
      </div>
      <div className="floating-badge badge-horn">
        <Car size={14} />
        <span>Vehicle Horn</span>
      </div>
      <div className="floating-badge badge-animal">
        <Dog size={14} />
        <span>Animal Sound</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * 3. LIVE AUDIO WAVEFORM & SPECTROGRAM CARD (Dashboard Visual)
 * ------------------------------------------------------------- */
export function LiveAudioWaveformCard({
  isMicActive = false,
  onToggleMic,
  analyserNode = null
}: {
  isMicActive?: boolean;
  onToggleMic?: () => void;
  analyserNode?: AnalyserNode | null;
}) {
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const [rmsDb, setRmsDb] = useState<number>(-60);

  useEffect(() => {
    const waveCanvas = waveCanvasRef.current;
    const specCanvas = specCanvasRef.current;
    if (!waveCanvas || !specCanvas) return;

    const wCtx = waveCanvas.getContext('2d');
    const sCtx = specCanvas.getContext('2d');
    if (!wCtx || !sCtx) return;

    let raf = 0;
    let t = 0;

    // Waterfall spectrogram history buffer
    const historyRows = 40;
    const bins = 64;
    const spectrogramData: number[][] = Array.from({ length: historyRows }, () => Array(bins).fill(0));

    const render = () => {
      const W = (waveCanvas.width = waveCanvas.offsetWidth * window.devicePixelRatio);
      const H = (waveCanvas.height = waveCanvas.offsetHeight * window.devicePixelRatio);
      const SW = (specCanvas.width = specCanvas.offsetWidth * window.devicePixelRatio);
      const SH = (specCanvas.height = specCanvas.offsetHeight * window.devicePixelRatio);

      t += 0.04;

      // 1. WAVEFORM OSCILLOSCOPE
      wCtx.fillStyle = '#060a12';
      wCtx.fillRect(0, 0, W, H);

      // Grid lines
      wCtx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
      wCtx.lineWidth = 1;
      for (let y = 0; y < H; y += H / 4) {
        wCtx.beginPath();
        wCtx.moveTo(0, y);
        wCtx.lineTo(W, y);
        wCtx.stroke();
      }

      if (analyserNode && isMicActive) {
        const timeData = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteTimeDomainData(timeData);

        // Draw real waveform
        wCtx.strokeStyle = '#00f0ff';
        wCtx.lineWidth = 2.5;
        wCtx.shadowColor = '#00f0ff';
        wCtx.shadowBlur = 10;
        wCtx.beginPath();

        const sliceWidth = W / timeData.length;
        let sumSq = 0;

        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * H) / 2;
          const delta = (timeData[i] - 128) / 128;
          sumSq += delta * delta;

          if (i === 0) wCtx.moveTo(i * sliceWidth, y);
          else wCtx.lineTo(i * sliceWidth, y);
        }
        wCtx.stroke();

        // Calculate real RMS dB
        const rms = Math.sqrt(sumSq / timeData.length);
        const db = Math.round(20 * Math.log10(Math.max(rms, 0.0001)));
        setRmsDb(Math.max(-60, Math.min(0, db)));

        // Frequency bins for spectrogram
        const freqData = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(freqData);

        const row = [];
        const step = Math.floor(freqData.length / bins);
        for (let b = 0; b < bins; b++) {
          row.push(freqData[b * step] / 255);
        }
        spectrogramData.unshift(row);
        spectrogramData.pop();
      } else {
        // Idle ambient animated synth wave
        wCtx.strokeStyle = '#00d4ff';
        wCtx.lineWidth = 2;
        wCtx.shadowColor = 'rgba(0, 212, 255, 0.6)';
        wCtx.shadowBlur = 8;
        wCtx.beginPath();

        const points = 120;
        for (let i = 0; i < points; i++) {
          const x = (i / points) * W;
          const normX = i / points;
          const envelope = Math.sin(normX * Math.PI);
          const y = H / 2 + (Math.sin(t * 2 + normX * 14) * 16 + Math.sin(t * 3.5 + normX * 30) * 8) * envelope;
          if (i === 0) wCtx.moveTo(x, y);
          else wCtx.lineTo(x, y);
        }
        wCtx.stroke();

        setRmsDb(-48 + Math.round(Math.sin(t) * 4));

        // Simulated calm spectrogram row
        const row = [];
        for (let b = 0; b < bins; b++) {
          const v = Math.max(0, Math.sin(t + b * 0.2) * 0.4 + 0.2);
          row.push(v);
        }
        spectrogramData.unshift(row);
        spectrogramData.pop();
      }

      // 2. SPECTROGRAM WATERFALL
      sCtx.fillStyle = '#060a12';
      sCtx.fillRect(0, 0, SW, SH);

      const cellW = SW / bins;
      const cellH = SH / historyRows;

      for (let r = 0; r < historyRows; r++) {
        for (let b = 0; b < bins; b++) {
          const val = spectrogramData[r][b];
          if (val > 0.05) {
            // Heatmap color interpolation (Cyan -> Purple -> Crimson)
            let color = '';
            if (val < 0.4) {
              const alpha = val / 0.4;
              color = `rgba(0, 240, 255, ${alpha * 0.75})`;
            } else if (val < 0.75) {
              const alpha = (val - 0.4) / 0.35;
              color = `rgba(123, 97, 255, ${0.75 + alpha * 0.2})`;
            } else {
              const alpha = (val - 0.75) / 0.25;
              color = `rgba(255, 51, 102, ${0.85 + alpha * 0.15})`;
            }
            sCtx.fillStyle = color;
            sCtx.fillRect(b * cellW, r * cellH, cellW - 0.5, cellH - 0.5);
          }
        }
      }

      raf = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(raf);
  }, [analyserNode, isMicActive]);

  return (
    <div className="card live-waveform-card">
      <div className="waveform-header">
        <div className="waveform-title-group">
          <h4>Audio Waveform (Live)</h4>
          <span className={`live-pill ${isMicActive ? 'active' : 'idle'}`}>
            <span className="pulse-dot" />
            {isMicActive ? 'Live' : 'Idle'}
          </span>
        </div>

        <div className="waveform-tools">
          <div className="vu-meter">
            <span className="vu-label">RMS {rmsDb} dB</span>
            <div className="vu-track">
              <div 
                className="vu-fill" 
                style={{ width: `${Math.max(5, ((rmsDb + 60) / 60) * 100)}%` }} 
              />
            </div>
          </div>

          {onToggleMic && (
            <button 
              className={`icon-btn ${isMicActive ? 'active' : ''}`} 
              onClick={onToggleMic}
              title={isMicActive ? 'Stop live listening' : 'Start live listening'}
            >
              {isMicActive ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* Waveform Canvas */}
      <div className="waveform-canvas-box">
        <canvas ref={waveCanvasRef} className="scope-canvas" />
      </div>

      {/* Spectrogram Canvas */}
      <div className="spectrogram-canvas-box">
        <div className="spec-label">Spectral Density Waterfall</div>
        <canvas ref={specCanvasRef} className="spec-canvas" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * 4. INTERACTIVE AUDIO PREVIEW PLAYER (Analyze & Detail Modals)
 * ------------------------------------------------------------- */
export function InteractiveAudioPreview({
  audioFile,
  audioUrl
}: {
  audioFile?: File | null;
  audioUrl?: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load audio source
  useEffect(() => {
    let src = '';
    if (audioFile) {
      src = URL.createObjectURL(audioFile);
    } else if (audioUrl) {
      src = audioUrl;
    }

    if (!src) return;

    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      setDuration(audio.duration || 0);
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      if (audioFile && src) URL.revokeObjectURL(src);
    };
  }, [audioFile, audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * duration;
    setCurrentTime(audio.currentTime);
  };

  // Render static styled soundwave bars
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="audio-preview-card">
      <div className="audio-preview-head">
        <h5>Audio Preview</h5>
        <span className="time-code">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Waveform track with progress scrubber */}
      <div className="waveform-scrubber" onClick={seek}>
        <div className="waveform-bars">
          {Array.from({ length: 48 }, (_, i) => {
            const barH = 12 + Math.abs(Math.sin(i * 0.45)) * 32 + (i % 3 === 0 ? 8 : 0);
            const isPlayed = (i / 48) * 100 <= progress;
            return (
              <span
                key={i}
                className={`wave-bar ${isPlayed ? 'played' : ''}`}
                style={{ height: `${barH}px` }}
              />
            );
          })}
        </div>
        <div className="scrubber-head" style={{ left: `${progress}%` }} />
      </div>

      {/* Control bar */}
      <div className="player-controls">
        <button className="primary-circle-btn" onClick={togglePlay}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button 
          className="ghost-circle-btn" 
          onClick={() => {
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
              setCurrentTime(0);
            }
          }}
        >
          <RotateCcw size={14} />
        </button>
        <span className="audio-format-tag">
          {audioFile?.type || 'audio/wav'}
        </span>
      </div>
    </div>
  );
}
