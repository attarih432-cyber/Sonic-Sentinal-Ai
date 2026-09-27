import {useEffect, useRef, useState, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {Activity, AlertTriangle, Camera, CameraOff, Download, Expand, FileAudio, Loader2, Mic, MicOff, MonitorSmartphone, RefreshCw, Square, Video, Zap, CheckCircle2, ShieldAlert} from 'lucide-react';
import {liveApi} from './api/live';
import {sessionsApi, type LiveSession} from './api/sessions';
import {api} from './api/client';
import type {Detection} from './api/detections';
import {Modal} from './ui';

type PermState = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported';
type Tab = 'audio' | 'camera' | 'events';

function NiceTime({iso}:{iso:string}){ const d = new Date(iso); return <span>{d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>; }

/* ---------------- AUDIO MONITOR (REAL mic + Web Audio) ---------------- */
function AudioMonitor(){
  const [perm,setPerm]=useState<PermState>('idle');
  const [listening,setListening]=useState(false);
  const [results,setResults]=useState<Detection[]>([]);
  const [err,setErr]=useState('');
  const [rms,setRms]=useState(0);
  const [modelStatus,setModelStatus]=useState('');
  const [session,setSession]=useState<LiveSession|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const ctxRef=useRef<AudioContext|null>(null);
  const analyserRef=useRef<AnalyserNode|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const rafRef=useRef<number>(0);
  const chunkRef=useRef<Blob[]>([]);
  const sessionIdRef=useRef<string|null>(null);
  const resultsRef=useRef<Detection[]>([]);

  const drawVisualizer=useCallback(()=>{
    const canvas=canvasRef.current, analyser=analyserRef.current;
    if(!canvas||!analyser) return;
    const c=canvas.getContext('2d'); if(!c) return;
    const W=canvas.width=canvas.offsetWidth*2, H=canvas.height=140*2;
    c.fillStyle='#070b11'; c.fillRect(0,0,W,H);
    const data=new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    c.strokeStyle='#00f0ff'; c.lineWidth=3; c.shadowColor='rgba(0,240,255,.75)'; c.shadowBlur=12; c.beginPath();
    const step=W/data.length;
    for(let i=0;i<data.length;i++){ const v=data[i]/128.0, y=H/2+v*H/2.5; i===0?c.moveTo(i*step,y):c.lineTo(i*step,y); }
    c.stroke();
    // RMS (real)
    let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
    setRms(Math.sqrt(sum/data.length));
    rafRef.current=requestAnimationFrame(drawVisualizer);
  },[]);

  const stopTracks=()=>{ if(streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; } };
  const cleanup=()=>{
    if(recorderRef.current&&recorderRef.current.state!=='inactive'){ try{recorderRef.current.stop();}catch{} }
    stopTracks();
    if(ctxRef.current){ ctxRef.current.close().catch(()=>{}); ctxRef.current=null; }
    cancelAnimationFrame(rafRef.current);
  };

  const checkPermission=async()=>{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){ setPerm('unsupported'); return; }
    try{
      if(navigator.permissions&&navigator.permissions.query){
        const st=await navigator.permissions.query({name:'microphone' as PermissionName});
        if(st.state==='denied'){ setPerm('denied'); return; }
      }
      setPerm('granted');
    }catch{ setPerm('granted'); }
  };

  const intervalRef = useRef<any>(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    checkPermission();
    api.get('/models').then(r => {
      const loaded = Array.isArray(r.data) && r.data.some((x: any) => x.status === 'loaded');
      setModelStatus(loaded ? 'loaded' : 'active');
    }).catch(() => {});
    return cleanup;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const recordChunk = useCallback(() => {
    if (!streamRef.current || !listeningRef.current) return;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    } catch {
      rec = new MediaRecorder(streamRef.current);
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      if (chunks.length === 0 || !listeningRef.current) return;
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      const ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const fname = `live_mic_${Date.now()}.${ext}`;
      liveApi.analyzeChunk(blob, fname, sessionIdRef.current).then(r => {
        const det = r.data;
        resultsRef.current = [det, ...resultsRef.current].slice(0, 25);
        setResults([...resultsRef.current]);
        if (det.severity === 'high' || det.severity === 'critical') {
          window.dispatchEvent(new CustomEvent('sonic:toast', { detail: { type: 'alert', message: `${det.severity.toUpperCase()}: ${det.classification} detected` } }));
        }
      }).catch(e => {
        const msg = e.response?.data?.detail ?? 'Chunk analysis failed';
        setErr(msg);
      });
    };
    rec.start();
    setTimeout(() => {
      if (rec.state === 'recording') {
        try { rec.stop(); } catch {}
      }
    }, 3500);
  }, []);

  const start = async () => {
    setErr('');
    try {
      setPerm('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setPerm('granted');
      listeningRef.current = true;
      setListening(true);

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyserRef.current = analyser;
      drawVisualizer();

      const s = await sessionsApi.start('microphone');
      sessionIdRef.current = s.data.id;
      setSession(s.data);

      recordChunk();
      intervalRef.current = setInterval(recordChunk, 3700);

      window.dispatchEvent(new CustomEvent('sonic:toast', { detail: { type: 'info', message: 'Mic listening started' } }));
    } catch (e: any) {
      listeningRef.current = false;
      setListening(false);
      setPerm('denied');
      setErr(e.name === 'NotAllowedError' ? 'Microphone permission denied' : e.name === 'NotFoundError' ? 'No microphone found' : e.message ?? 'Mic start failed');
    }
  };

  const stop = async () => {
    listeningRef.current = false;
    setListening(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (sessionIdRef.current) {
      try {
        const s = await sessionsApi.stop(sessionIdRef.current);
        setSession(s.data);
      } catch {}
    }
    stopTracks();
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setRms(0);
    sessionIdRef.current = null;
    window.dispatchEvent(new CustomEvent('sonic:toast', { detail: { type: 'info', message: 'Mic stopped — session saved' } }));
  };

  const clearResults=()=>{ resultsRef.current=[]; setResults([]); };

  return <div className="live-panel card">
    <div className="section-head"><div><h3>Live microphone monitor</h3><p className="muted">Real audio from your mic — analyzed in 4s chunks</p></div>
      {modelStatus&&<span className={'pill '+(modelStatus==='loaded'?'seg-ok':'seg-low')}>model: {modelStatus}</span>}</div>
    <div className="live-visual">
      <canvas ref={canvasRef} className="wave-canvas"/>
      <div className="rms-meter"><span className="muted">RMS</span><div className="rms-fill" style={{transform:`scaleX(${Math.min(1,rms*8)})`}}/><b>{(rms*100).toFixed(0)}%</b></div>
      {perm==='idle'&&<div className="center-pad muted">Microphone not started yet</div>}
      {perm==='requesting'&&<div className="center-pad"><Loader2 className="spin" size={22}/><p className="muted">Requesting microphone…</p></div>}
      {perm==='denied'&&<div className="center-pad"><ShieldAlert size={24}/><p className="muted">Microphone permission denied. Enable it in browser settings and try again.</p></div>}
      {perm==='unsupported'&&<div className="center-pad"><MicOff size={24}/><p className="muted">Microphone not supported in this browser.</p></div>}
    </div>
    {err&&<p className="err-text">{err}</p>}
    <div className="live-controls">
      {!listening?<button className="primary" onClick={start} disabled={perm==='unsupported'}><Mic size={16}/> Start listening</button>
      :<button className="ghost danger" onClick={stop}><Square size={14}/> Stop session</button>}
      {results.length>0&&<button className="ghost tiny" onClick={clearResults}><RefreshCw size={13}/> Clear</button>}
      {session&&<span className="pill pill-soft">session {session.id.slice(-6)} · {session.detectionCount} detections</span>}
    </div>
    <div className="live-results">
      <div className="section-head"><div><h3>Live detections</h3><p className="muted">Real results from your microphone</p></div></div>
      {results.length===0?<div className="empty-state"><Mic size={26}/><p className="muted">No detections yet — start listening and speak or play sound.</p></div>:
      <div className="detect-list">{results.map(r=><div className="detect-row" key={r.id}>
        <div className="sound"><FileAudio size={17}/></div>
        <div className="detect-main"><b>{r.classification}{!r.classification||r.classification==='No event detected'?(<em className="muted"> (quiet chunk)</em>):null}</b><p className="muted"><NiceTime iso={r.createdAt}/> · {r.audioQuality?.rms!=null?`rms ${(r.audioQuality.rms*100).toFixed(1)}%`:'quality unknown'}</p></div>
        <span className={'pill seg-'+r.severity}>{r.severity}</span><b className="conf">{Math.round((r.confidence??0)*100)}%</b>
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
    <AnimatePresence mode="wait"><motion.div key={tab} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.15}}>
      {tab==='audio'&&<AudioMonitor/>}{tab==='camera'&&<CameraMonitor/>}{tab==='events'&&<><EventStream/><SessionLog/></>}
    </motion.div></AnimatePresence>
  </div>;
}