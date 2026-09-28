import {useEffect, useRef, useState, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {Activity, AlertTriangle, Camera, CameraOff, Download, Expand, FileAudio, Loader2, Mic, MicOff, MonitorSmartphone, RefreshCw, ShieldAlert, Square, Video, Waves, Zap} from 'lucide-react';
import {liveApi, liveErrorMessage, type WarmupState} from './api/live';
import {sessionsApi, type LiveSession} from './api/sessions';
import {api} from './api/client';
import type {Detection, ModelResult} from './api/detections';
import {Modal} from './ui';
import {MicrophoneEngine} from './lib/micEngine';
import {loadTeachableMachine, recognizeWindow, type TmResult, type TmStatus} from './lib/teachableMachine';
import './live.css';

type Tab = 'audio' | 'camera' | 'events';
type MicStatus = 'off' | 'starting' | 'on';
type PermState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';

/**
 * Window length. The server models are built around a 5 s window:
 * extract_tabular_features pads/crops to sr*5 and extract_mel_spectrogram
 * fills 216 mel columns, which only 5 s of audio produces. A shorter window
 * would hand the CNN a third of its input as zeros, so the window must be 5 s.
 */
const WINDOW_SECONDS = 5;

/**
 * How often a new window is cut. Shorter than the window, so consecutive
 * windows overlap and the panel still feels continuous instead of pausing
 * between 5 s blocks.
 */
const WINDOW_INTERVAL_MS = 2500;

/** Server-side models, in the order the live panel lists them. */
const SERVER_MODELS = ['yamnet', 'cnn', 'svm'] as const;

function NiceTime({iso}:{iso:string}){ const d = new Date(iso); return <span>{d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>; }
function ClockTime({at}:{at:Date|null}){ return <span className="lm-mono">{at ? at.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '--:--:--'}</span>; }

/* ---------------- ONE SERVER-SIDE MODEL TILE ---------------- */
function ModelTile({m}:{m:ModelResult}){
  const ran = m.status === 'evaluated' && !!m.classification;
  return <div className={'lm-model' + (ran ? '' : ' idle')}>
    <div className="lm-model-head">
      <b>{m.name}</b>
      <span className={'pill ' + (ran ? 'seg-ok' : 'seg-low')}>{ran ? 'ran' : m.status.replace(/_/g, ' ')}</span>
    </div>
    {ran
      ? <>
        <div className="lm-model-class">{m.classification}</div>
        <div className="lm-bar" role="img" aria-label={`confidence ${Math.round(m.confidence * 100)} percent`}>
          <i style={{transform:`scaleX(${Math.max(0, Math.min(1, m.confidence))})`}}/>
        </div>
        <div className="lm-model-foot">
          <span className="lm-mono">{Math.round(m.confidence * 100)}%</span>
          {m.accuracy != null && <span className="lm-muted">test acc {Math.round(m.accuracy * 100)}%</span>}
        </div>
      </>
      : <p className="lm-model-reason">{m.reason || 'This model produced no result for this window.'}</p>}
  </div>;
}

/* ---------------- TEACHABLE MACHINE PANEL ---------------- */
function TmPanel({status, err, result, updatedAt}:{
  status: TmStatus; err: string; result: TmResult | null; updatedAt: Date | null;
}){
  const top = result?.topSound ?? null;
  return <div className="lm-tm">
    <div className="section-head">
      <div>
        <h3>Teachable Machine <span className="lm-tag">runs in your browser</span></h3>
        <p className="muted">Independent result — its audio is never uploaded, and it is not part of the merged decision above.</p>
      </div>
      {status === 'ready' && <span className="pill seg-ok">{result ? 'running' : 'loaded'}</span>}
      {status === 'loading' && <span className="pill seg-medium"><Loader2 className="spin" size={11}/> loading</span>}
      {status === 'error' && <span className="pill seg-critical">failed to load</span>}
      {status === 'idle' && <span className="pill seg-low">not started</span>}
    </div>

    {status === 'idle' && <div className="empty-state lm-empty"><MicOff size={24}/><p className="muted">Start the microphone to run the Teachable Machine model on the same window.</p></div>}
    {status === 'loading' && <div className="center-pad"><Loader2 className="spin" size={20}/><p className="muted">Loading the Teachable Machine graph and its metadata…</p></div>}
    {status === 'error' && <p className="err-text">{err || 'The Teachable Machine model could not be loaded.'}</p>}

    {status === 'ready' && result && <>
      <div className="lm-pred">
        <div className="lm-pred-label">Highest-confidence class</div>
        <div className="lm-pred-value">{top ? top.label : '—'}</div>
        <div className="lm-pred-meta">
          <span className="lm-mono">{top ? Math.round(top.score * 100) : 0}%</span>
          <span className="lm-muted">{result.windowSeconds.toFixed(2)}s window @ {result.sampleRate / 1000} kHz</span>
          <ClockTime at={updatedAt}/>
        </div>
        {result.top && result.top.isBackground && (
          <p className="lm-note">The model's own background/silence class scored highest, so no sound was above it.</p>
        )}
      </div>

      <div className="lm-tm-bars">
        <div className="lm-tm-bars-head">
          <b>All {result.scores.length} classes</b>
          <span className="lm-muted">index order as loaded from the model</span>
        </div>
        {result.scores.map(s => <div key={s.index} className={'lm-tm-row' + (s.isTop ? ' top' : '') + (s.isBackground ? ' bg' : '')}>
          <span className="lm-tm-name" title={`index ${s.index} — ${s.rawLabel}`}>{s.label}</span>
          <span className="lm-tm-track"><i style={{transform:`scaleX(${Math.max(0, Math.min(1, s.score))})`}}/></span>
          <span className="lm-tm-val lm-mono">{(s.score * 100).toFixed(1)}%</span>
        </div>)}
      </div>
    </>}
    {status === 'ready' && !result && err && (
      <div className="center-pad lm-tm-err"><AlertTriangle size={18}/><p className="muted">{err}</p></div>
    )}
    {status === 'ready' && !result && !err && <div className="center-pad"><Waves size={22}/><p className="muted">Waiting for the first window…</p></div>}
  </div>;
}

/* ---------------- LIVE MICROPHONE (real capture → real predictions) ---------------- */
function AudioMonitor(){
  const [status, setStatus] = useState<MicStatus>('off');
  const [err, setErr] = useState('');
  const [level, setLevel] = useState(0);
  const [current, setCurrent] = useState<Detection | null>(null);
  const [history, setHistory] = useState<Detection[]>([]);
  const [windows, setWindows] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [tmStatus, setTmStatus] = useState<TmStatus>('idle');
  const [tmErr, setTmErr] = useState('');
  const [tm, setTm] = useState<TmResult | null>(null);
  const [tmAt, setTmAt] = useState<Date | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [modelStatus, setModelStatus] = useState('');
  const [warm, setWarm] = useState<WarmupState | null>(null);
  const [repeatRun, setRepeatRun] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<MicrophoneEngine | null>(null);
  const tmRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const busyRef = useRef(false);
  const seqRef = useRef(0);
  const lastClassRef = useRef<string | null>(null);
  const repeatRef = useRef(0);

  const toast = (type: string, message: string) =>
    window.dispatchEvent(new CustomEvent('sonic:toast', {detail: {type, message}}));

  /* ---- classify one window; server models and the browser model in parallel ---- */
  const classify = useCallback(async (wav: Blob, samples: Float32Array, rate: number) => {
    if (busyRef.current) return;             // never stack overlapping requests
    busyRef.current = true;
    setAnalysing(true);
    const seq = ++seqRef.current;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    const serverCall = liveApi.analyzeChunk(wav, `live_mic_${stamp}.wav`, sessionIdRef.current);
    const tmCall = tmRef.current
      ? recognizeWindow(tmRef.current, samples, rate)
      : Promise.reject(new Error('Teachable Machine is still loading.'));

    const [server, browser] = await Promise.allSettled([serverCall, tmCall]);

    // A newer window started while this one was in flight: drop this result so
    // the panel can never show an older prediction over a newer one.
    if (!aliveRef.current || seq !== seqRef.current) return;

    if (server.status === 'fulfilled') {
      const det = server.value.data;
      setCurrent(det);
      setUpdatedAt(new Date());
      setWindows(w => w + 1);
      setHistory(prev => [det, ...prev].slice(0, 25));
      if (det.classification === lastClassRef.current) {
        repeatRef.current += 1;
      } else {
        lastClassRef.current = det.classification ?? null;
        repeatRef.current = 0;
      }
      setRepeatRun(repeatRef.current);
      if (det.severity === 'high' || det.severity === 'critical') {
        toast('alert', `${det.severity.toUpperCase()}: ${det.classification} detected`);
      }
      setErr('');
    } else {
      setErr(liveErrorMessage(server.reason, 'The backend could not classify this window.'));
    }

    if (browser.status === 'fulfilled') {
      setTm(browser.value);
      setTmAt(new Date());
    } else if (tmRef.current) {
      setTmErr((browser.reason as Error)?.message || 'Teachable Machine inference failed for this window.');
    }

    busyRef.current = false;
    if (aliveRef.current && seq === seqRef.current) setAnalysing(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- engine + teardown ---- */
  const shutdown = useCallback(async (closeSession: boolean) => {
    seqRef.current++;                       // invalidate any in-flight result
    busyRef.current = false;
    await engineRef.current?.stop();
    const sid = sessionIdRef.current;
    sessionIdRef.current = null;
    if (closeSession && sid) {
      try { setSession((await sessionsApi.stop(sid)).data); }
      catch { /* the session is best-effort bookkeeping */ }
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      // Page change or unmount: release the mic, the graph and the session.
      aliveRef.current = false;
      void shutdown(true);
    };
  }, [shutdown]);

  useEffect(() => {
    // Unmount is the normal path, but a closed or reloaded tab never runs it.
    // Releasing the tracks and closing the backend session here means the
    // microphone is never left hot after the page is gone.
    const onPageHide = () => {
      aliveRef.current = false;
      void engineRef.current?.stop();
      const sid = sessionIdRef.current;
      sessionIdRef.current = null;
      if (!sid) return;
      const url = `${(api as any).defaults.baseURL ?? ''}/live/sessions/${sid}/stop`.replace(/\/{2,}/g, '/');
      try {
        navigator.sendBeacon(url, new Blob([], { type: 'application/json' }));
      } catch {
        void sessionsApi.stop(sid).catch(() => { /* the session expires server-side */ });
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  useEffect(() => {
    api.get('/models')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setModelStatus(list.some((x: any) => x.status === 'loaded') ? 'loaded' : 'active');
      })
      .catch(() => { /* the status chip is informational only */ });

    // A cold backend spends over a minute building the YAMNet graph. Say so,
    // instead of leaving the first window looking hung.
    let alive = true;
    const pollWarm = () => {
      liveApi.warmup()
        .then(r => { if (alive) setWarm(r.data.modelWarmup ?? null); })
        .catch(() => { /* health is best effort */ });
    };
    pollWarm();
    const iv = window.setInterval(pollWarm, 5000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  /* ---- visualiser: reads the live analyser, writes to the canvas ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let lastPush = 0;
    const buf = new Uint8Array(2048);

    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.floor((canvas.offsetWidth || 600) * dpr));
      const h = Math.max(1, Math.floor(140 * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      ctx.fillStyle = '#02050c';
      ctx.fillRect(0, 0, w, h);

      const analyser = engineRef.current?.analyserNode ?? null;
      const live = !!analyser;

      if (live && analyser) {
        analyser.getByteTimeDomainData(buf);
      } else {
        buf.fill(128);                       // idle: a flat centre line, not a fake wave
      }

      // mean-removed trace so silence sits on the centre line
      let mean = 0;
      for (let i = 0; i < buf.length; i++) mean += buf[i];
      mean /= buf.length;

      let sum = 0;
      ctx.beginPath();
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - mean) / 128;
        sum += v * v;
        const x = (i / (buf.length - 1)) * w;
        const y = h / 2 + v * (h / 2.4);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = live ? '#00f0ff' : '#2a3550';
      ctx.lineWidth = Math.max(1.5, 2 * dpr);
      ctx.shadowColor = live ? 'rgba(0,240,255,.6)' : 'transparent';
      ctx.shadowBlur = live ? 10 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // only ~9 React updates per second, not 60
      const now = performance.now();
      if (now - lastPush > 110) {
        lastPush = now;
        setLevel(Math.sqrt(sum / buf.length));
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---- start / stop ---- */
  const start = async () => {
    if (engineRef.current?.isRunning()) return;     // refuse a second stream
    setErr('');
    setTmErr('');
    setStatus('starting');
    aliveRef.current = true;
    lastClassRef.current = null;
    repeatRef.current = 0;
    setRepeatRun(0);
    setCurrent(null);
    setTm(null);

    // Warm the browser model in parallel with the permission prompt.
    setTmStatus('loading');
    loadTeachableMachine()
      .then(rec => {
        if (!aliveRef.current) return;
        tmRef.current = rec;
        setTmStatus('ready');
      })
      .catch((e: any) => {
        if (!aliveRef.current) return;
        tmRef.current = null;
        setTmStatus('error');
        setTmErr(e?.message || 'The Teachable Machine model could not be loaded.');
      });

    if (!engineRef.current) {
      engineRef.current = new MicrophoneEngine({
        windowSeconds: WINDOW_SECONDS,
        intervalMs: WINDOW_INTERVAL_MS,
        onWindow: (w) => { void classify(w.wav, w.samples, w.sampleRate); },
        onLevel: (l) => setLevel(l),
        onError: (message) => {
          if (!aliveRef.current) return;
          setStatus('off');
          setErr(message);
          setLevel(0);
        },
      });
    }

    await engineRef.current.start();
    if (!aliveRef.current) { void shutdown(true); return; }
    if (engineRef.current.currentState !== 'running') { setStatus('off'); return; }

    setStatus('on');
    try {
      const s = await sessionsApi.start('microphone');
      if (!aliveRef.current) { void sessionsApi.stop(s.data.id); return; }
      sessionIdRef.current = s.data.id;
      setSession(s.data);
    } catch {
      sessionIdRef.current = null;          // monitoring still works without it
    }
    toast('info', `Microphone live — a ${WINDOW_SECONDS}s window every ${(WINDOW_INTERVAL_MS / 1000).toFixed(1)}s`);
  };

  const stop = async () => {
    await shutdown(true);
    setStatus('off');
    setLevel(0);
    setAnalysing(false);
    setWindows(0);
    toast('info', 'Microphone stopped — tracks released');
  };

  const clearHistory = () => setHistory([]);

  const breakdown = current?.modelBreakdown ?? null;
  const mergedClass = current?.classification ?? null;
  const mergedConf = current?.confidence ?? 0;
  const isNoEvent = !mergedClass || mergedClass === 'No event detected';

  return <div className="live-panel card">
    <div className="section-head">
      <div>
        <h3>Live microphone</h3>
        <p className="muted">Continuous capture — a rolling {WINDOW_SECONDS}s window is re-classified every {(WINDOW_INTERVAL_MS / 1000).toFixed(1)}s by the server models and by the Teachable Machine model in your browser.</p>
      </div>
      {status === 'on' && <span className="pill live"><span className="pulse-dot"/> Listening</span>}
      {status === 'starting' && <span className="pill seg-medium"><Loader2 className="spin" size={11}/> starting</span>}
      {status === 'off' && <span className="pill seg-low">Microphone off</span>}
      {modelStatus && <span className={'pill ' + (modelStatus === 'loaded' ? 'seg-ok' : 'seg-low')}>models: {modelStatus}</span>}
    </div>

    <div className="live-controls">
      {status === 'on'
        ? <button className="lm-stop" onClick={stop}><Square size={14}/> Stop Microphone</button>
        : <button className="lm-start" onClick={start} disabled={status === 'starting'}>
            {status === 'starting' ? <><Loader2 className="spin" size={16}/> Requesting microphone…</> : <><Mic size={16}/> Start Live Microphone</>}
          </button>}
      {status === 'on' && <span className="lm-hint">window #{windows + (analysing ? 1 : 0)} in flight</span>}
      {history.length > 0 && <button className="ghost tiny" onClick={clearHistory}><RefreshCw size={13}/> Clear</button>}
      {session && <span className="pill pill-soft">session {session.id.slice(-6)} · {session.detectionCount} detections</span>}
    </div>

    <div className="live-visual">
      <canvas ref={canvasRef} className="wave-canvas"/>
      <div className="rms-meter"><span className="muted">RMS</span><div className="rms-fill" style={{transform:`scaleX(${Math.min(1, level * 8)})`}}/><b>{(level * 100).toFixed(0)}%</b></div>
      {status === 'off' && <div className="center-pad">
        {err ? <><ShieldAlert size={24}/><p className="muted">{err}</p></> : <><MicOff size={24}/><p className="muted">Microphone is off. Press “Start Live Microphone” to begin.</p></>}
      </div>}
      {status === 'starting' && <div className="center-pad"><Loader2 className="spin" size={22}/><p className="muted">Requesting microphone access…</p></div>}
    </div>

    {err && status === 'on' && <p className="err-text">{err}</p>}

    {/* ---------- current prediction ---------- */}
    {warm && warm.status !== 'ready' && (
      <p className="lm-note">
        {warm.status === 'warming' && 'The backend is warming up its models (first YAMNet inference builds the TensorFlow graph, which can take a minute or two). The first window will be slow; later ones are about a second.'}
        {warm.status === 'cold' && 'The backend has not warmed up its models yet. The first window may take a minute or two.'}
        {warm.status === 'error' && `The backend could not warm up its models: ${warm.error ?? 'unknown reason'}. Predictions may be unavailable.`}
        {warm.status === 'unknown' && 'The backend did not report its model warm-up state.'}
      </p>
    )}
    {warm && warm.status === 'ready' && warm.seconds != null && warm.seconds > 20 && (
      <p className="lm-muted lm-warm-note">Models warmed in {Math.round(warm.seconds)}s at start-up.</p>
    )}

    <div className={'lm-pred-card' + (analysing ? ' busy' : '')}>
      <div className="lm-pred-head">
        <span className="lm-eyebrow">CURRENT PREDICTION</span>
        {status === 'on' && <span className={'pill ' + (analysing ? 'seg-medium' : 'seg-ok')}>{analysing ? 'Listening…' : '● live'}</span>}
      </div>
      {current
        ? <>
          <div className="lm-pred-value">{isNoEvent ? 'No event detected' : mergedClass}</div>
          <div className="lm-bar big"><i style={{transform:`scaleX(${Math.max(0, Math.min(1, mergedConf))})`}}/></div>
          <div className="lm-pred-meta">
            <span className="lm-mono">{Math.round(mergedConf * 100)}%</span>
            <span className="lm-muted">model: server ensemble (YAMNet · CNN · SVM)</span>
            <span className={'pill seg-' + (current.severity ?? 'low')}>{current.severity ?? 'low'}</span>
            <ClockTime at={updatedAt}/>
          </div>
          {repeatRun >= 3 && !isNoEvent && (
            <p className="lm-note">Same class for {repeatRun} windows in a row. The per-model results below show which model is driving it.</p>
          )}
        </>
        : <div className="lm-pred-value dim">{status === 'on' ? 'Listening…' : 'Microphone off'}</div>}
    </div>

    {/* ---------- per-model results ---------- */}
    {breakdown && <>
      <div className="section-head lm-section">
        <div><h3>Server model breakdown</h3><p className="muted">Each model scored this same window on its own. A model that could not run says so.</p></div>
      </div>
      <div className="lm-models">
        {SERVER_MODELS.map(key => {
          const m = breakdown[key];
          return m ? <ModelTile key={key} m={m}/> : null;
        })}
      </div>
    </>}

    <TmPanel status={tmStatus} err={tmErr} result={tm} updatedAt={tmAt}/>

    {/* ---------- history ---------- */}
    <div className="live-results">
      <div className="section-head"><div><h3>Live detections</h3><p className="muted">Newest first — {history.length} of the last 25 windows</p></div></div>
      {history.length === 0
        ? <div className="empty-state"><Mic size={26}/><p className="muted">No windows analysed yet — start the microphone and speak or play a sound.</p></div>
        : <div className="detect-list">{history.map(r => <div className="detect-row" key={r.id}>
            <div className="sound"><FileAudio size={17}/></div>
            <div className="detect-main">
              <b>{r.classification}{r.classification === 'No event detected' ? <em className="muted"> (below the model&apos;s decision floor)</em> : null}</b>
              <p className="muted"><NiceTime iso={r.createdAt}/> · {r.audioQuality?.rms != null ? `rms ${(r.audioQuality.rms * 100).toFixed(1)}%` : 'level unknown'}</p>
            </div>
            <span className={'pill seg-' + r.severity}>{r.severity}</span>
            <b className="conf">{Math.round((r.confidence ?? 0) * 100)}%</b>
          </div>)}</div>}
    </div>
  </div>;
}

/* ---------------- CAMERA MONITOR (REAL preview, no fake vision) ---------------- */
function CameraMonitor(){
  const [perm,setPerm]=useState<PermState>('idle');
  const [active,setActive]=useState(false);
  const [mirror,setMirror]=useState(true);
  const [devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const [deviceId,setDeviceId]=useState('');
  const [snap,setSnap]=useState<string|null>(null);
  const [err,setErr]=useState('');
  const videoRef=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const snapRef=useRef<HTMLCanvasElement|null>(null);

  const stopTracks=()=>{ if(streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; } };
  useEffect(()=>{
    if(navigator.mediaDevices?.enumerateDevices){
      navigator.mediaDevices.enumerateDevices().then(ds=>{ const cams=ds.filter(d=>d.kind==='videoinput'); setDevices(cams); if(cams[0]?.deviceId) setDeviceId(cams[0].deviceId); }).catch(()=>{});
    }
    return stopTracks;
  },[]);

  const activate=async()=>{
    setErr(''); setSnap(null);
    try{ setPerm('requesting');
      const stream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId}:true});
      streamRef.current=stream; setPerm('granted'); setActive(true);
      if(videoRef.current){ videoRef.current.srcObject=stream; videoRef.current.play().catch(()=>{}); }
      window.dispatchEvent(new CustomEvent('sonic:toast',{detail:{type:'info',message:'Camera preview active — vision analysis not configured'}}));
    }catch(e:any){ setPerm('denied'); setErr(e.name==='NotAllowedError'?'Camera permission denied':e.name==='NotFoundError'?'No camera found':e.message??'Camera start failed'); }
  };
  const deactivate=()=>{ setActive(false); stopTracks(); if(videoRef.current) videoRef.current.srcObject=null; setSnap(null); };

  const toggleFullscreen=()=>{ if(videoRef.current){ if(document.fullscreenElement) document.exitFullscreen().catch(()=>{}); else videoRef.current.requestFullscreen().catch(()=>{}); } };
  const takeSnapshot=()=>{ const v=videoRef.current, c=snapRef.current; if(!v||!c) return; const W=v.videoWidth||640, H=v.videoHeight||480; c.width=W; c.height=H; const ctx=c.getContext('2d'); if(!ctx) return; ctx.drawImage(v,0,0,W,H); setSnap(c.toDataURL('image/png')); };

  return <div className="live-panel card">
    <div className="section-head"><div><h3>Camera monitor</h3><p className="muted">Live preview with privacy — activate only on your action</p></div>
      <span className="pill seg-low"><Video size={12}/> Vision model not configured</span></div>
    <div className="cam-stage">
      {!active?<div className="cam-empty"><CameraOff size={30}/><h3>Camera off</h3><p className="muted">Preview stays off until you activate it. No video leaves your device.</p>
        {devices.length>1&&<select className="auth-input" value={deviceId} onChange={e=>setDeviceId(e.target.value)}><option value="">Default camera</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.label||`Camera ${d.deviceId.slice(0,5)}`}</option>)}</select>}
        <button className="primary" onClick={activate} disabled={perm==='requesting'}>{perm==='requesting'?<><Loader2 className="spin" size={15}/> Requesting…</>:<><Camera size={16}/> Activate camera</>}</button>
      </div>:
      <div className="cam-live">
        <div className={'cam-wrap '+(mirror?'mirrored':'')}><video ref={videoRef} autoPlay playsInline muted/></div>
        <div className="cam-toolbar">
          <button className={'ghost tiny '+(mirror?'active':'')} onClick={()=>setMirror(!mirror)} title="Mirror">🪞 Mirror</button>
          <button className="ghost tiny" onClick={toggleFullscreen} title="Fullscreen"><Expand size={13}/> Fullscreen</button>
          <button className="ghost tiny" onClick={takeSnapshot} title="Snapshot"><Camera size={13}/> Snapshot</button>
          <button className="ghost tiny danger" onClick={deactivate} title="Stop camera"><CameraOff size={13}/> Stop</button>
        </div>
      </div>}
      {err&&<p className="err-text">{err}</p>}
      <canvas ref={snapRef} style={{display:'none'}}/>
    </div>
    <Modal open={!!snap} onClose={()=>setSnap(null)} title="Snapshot — captured locally, never uploaded">
      {snap&&<><img src={snap} alt="Preview snapshot"/><div className="row-actions" style={{marginTop:14}}><a className="ghost tiny" href={snap} download="sonicsentinel-snapshot.png"><Download size={13}/> Save</a><button className="ghost tiny" onClick={()=>setSnap(null)}>Dismiss</button></div></>}
    </Modal>
  </div>;
}

function SessionLog(){
  const [sessions,setSessions]=useState<LiveSession[]>([]);
  const [loading,setLoading]=useState(true);
  const load=useCallback(()=>{sessionsApi.list(10).then(r=>setSessions(r.data)).catch(()=>{}).finally(()=>setLoading(false));},[]);
  useEffect(()=>{load();},[load]);
  return <div className="live-panel card"><div className="section-head"><div><h3>Session activity</h3><p className="muted">Recent live detection sessions</p></div><button className="ghost" onClick={load}><RefreshCw size={13}/> Refresh</button></div>
    {loading?<div className="center-pad"><Loader2 className="spin" size={22}/></div>:sessions.length===0?<div className="empty-state"><MonitorSmartphone size={26}/><p className="muted">No live sessions yet — start microphone monitoring.</p></div>:
    <div className="detect-list">{sessions.map(s=><div className="detect-row" key={s.id}>
      <div className="sound"><Activity size={17}/></div>
      <div className="detect-main"><b>Session {(s.id as string).slice(-6)}</b><p className="muted">{s.source} · started <NiceTime iso={s.startedAt}/> · {s.endedAt?'ended':'active now'}</p></div>
      <span className={'pill '+(s.status==='active'?'seg-ok':'pill-soft')}>{s.status}</span>
      <b className="conf" title="detections">{s.detectionCount} det</b>
    </div>)}</div>}
  </div>;
}

function EventStream(){
  const [events,setEvents]=useState<{kind:string;text:string;time:string}[]>([]);
  const [detections,setDetections]=useState<Detection[]>([]);
  const load=useCallback(()=>{ api.get('/detections?source=live&limit=10').then(r=>setDetections(r.data)).catch(()=>{}); },[]);
  useEffect(()=>{
    load();
    const iv=setInterval(load,5000);
    const onToast=(e:Event)=>{ const d=(e as CustomEvent).detail; setEvents(prev=>[{kind:d.type??'info',text:d.message,time:new Date().toLocaleTimeString()},...prev].slice(0,20)); };
    window.addEventListener('sonic:toast',onToast);
    return ()=>{ clearInterval(iv); window.removeEventListener('sonic:toast',onToast); };
  },[load]);
  return <div className="live-panel card"><div className="section-head"><div><h3>Event stream</h3><p className="muted">Live detections + system events (auto-refresh 5s)</p></div></div>
    <div className="event-list">
      {detections.length===0&&events.length===0&&<div className="empty-state"><Zap size={26}/><p className="muted">No events yet. Start the microphone for live events.</p></div>}
      {events.map((e,i)=><div className="event-row" key={i}><span className={'event-dot '+(e.kind==='alert'?'alert':e.kind==='error'?'error':'info')}/><span className="muted event-time">{e.time}</span><b>{e.text}</b></div>)}
      {detections.map(d=><div className="event-row" key={d.id}><span className={'event-dot '+(d.severity==='high'||d.severity==='critical'?'alert':'ok')}/><span className="muted event-time"><NiceTime iso={d.createdAt}/></span><b>{d.classification}</b><span className={'pill seg-'+d.severity}>{d.severity}</span><em className="conf">{Math.round((d.confidence??0)*100)}%</em></div>)}
    </div>
  </div>;
}

/* ---------------- LIVE MONITOR PAGE (unified) ---------------- */
export function LiveMonitorPage(){
  const [tab,setTab]=useState<Tab>('audio');
  return <div className="dash">
    <section className="hero"><div><p className="eyebrow">SENSOR CENTER</p><h1>Live <span className="grad-text">monitor</span></h1><p className="muted">Microphone, camera, and real-time event stream — all real data, on your action.</p></div>
      <div className="hero-pills"><span className="pill live"><span className="pulse-dot"/> LIVE</span></div></section>
    <div className="live-tabs">
      {([['audio','Audio monitor',Mic],['camera','Camera monitor',Camera],['events','Event stream',Zap]] as [Tab,string,React.ElementType][]).map(([id,label,Icon])=>
        <button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={16}/>{label}</button>)}
    </div>
    {/*
      Keyed directly rather than inside AnimatePresence mode="wait". Waiting
      for an exit animation to finish would delay the AudioMonitor unmount,
      and an exit never finishes while requestAnimationFrame is paused (a
      hidden tab). That would leave the microphone open after switching tabs.
    */}
    <motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.15}}>
      {tab==='audio'&&<AudioMonitor/>}{tab==='camera'&&<CameraMonitor/>}{tab==='events'&&<><EventStream/><SessionLog/></>}
    </motion.div>
  </div>;
}