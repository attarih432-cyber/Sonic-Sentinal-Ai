/**
 * Browser-side harness for the live microphone test.
 *
 * Paste into the page (devtools console or an automation evaluate call) to
 * stand up a synthetic microphone, so the real Web Audio graph can be driven
 * without hardware. The app's own code is untouched: getUserMedia is the only
 * thing replaced, so AudioContext -> worklet -> rolling window -> WAV ->
 * backend -> Teachable Machine all run for real.
 */
window.__sonicTest = (() => {
  const state = { installed: false, ctx: null, src: null, gain: null, track: null, tone: 'horn', logs: [] };
  const log = (m) => { state.logs.push(`${new Date().toISOString().slice(11, 23)} ${m}`); if (state.logs.length > 200) state.logs.shift(); };

  function rebuild() {
    if (!state.ctx) return;
    try { if (state.src) { state.src.stop(); state.src.disconnect(); } } catch (e) { /* not started */ }
    const ctx = state.ctx;
    let src;
    if (state.tone === 'horn') {
      src = ctx.createOscillator(); src.type = 'sawtooth'; src.frequency.value = 440;
    } else if (state.tone === 'rumble') {
      src = ctx.createOscillator(); src.type = 'sine'; src.frequency.value = 70;
    } else if (state.tone === 'hiss') {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * 0.35;
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    } else if (state.tone === 'speech') {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        ch[i] = 0.4 * Math.sin(2 * Math.PI * 190 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3.1 * t));
      }
      src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    } else {
      src = ctx.createOscillator(); src.type = 'sine'; src.frequency.value = 0;
    }
    src.connect(state.gain);
    src.start();
    state.src = src;
    log(`tone -> ${state.tone}`);
  }

  function install() {
    if (state.installed) return 'already';
    state.installed = true;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ctx.createMediaStreamDestination();
      state.ctx = ctx;
      state.gain = ctx.createGain();
      state.gain.gain.value = 0.9;
      state.gain.connect(dest);
      state.track = dest.stream.getAudioTracks()[0];
      rebuild();
      log('getUserMedia called, synthetic stream returned');
      return dest.stream;
    };
    window.addEventListener('error', (e) => log('window error: ' + e.message));
    window.addEventListener('unhandledrejection', (e) => log('rejection: ' + (e.reason && e.reason.message)));
    return 'installed';
  }

  return {
    install,
    setTone: (t) => { state.tone = t; rebuild(); return t; },
    status: () => ({
      track: state.track ? state.track.readyState : null,
      ctx: state.ctx ? state.ctx.state : null,
      tone: state.tone,
    }),
    panel: () => {
      const p = document.querySelector('.live-panel');
      if (!p) return { error: 'no .live-panel on screen' };
      const txt = (sel) => { const n = p.querySelector(sel); return n ? n.textContent.trim() : null; };
      return {
        pills: [...p.querySelectorAll('.pill')].map((x) => x.textContent.trim()),
        startPresent: !!p.querySelector('.lm-start'),
        stopPresent: !!p.querySelector('.lm-stop'),
        prediction: txt('.lm-pred-card .lm-pred-value'),
        predMeta: txt('.lm-pred-card .lm-pred-meta'),
        rms: txt('.rms-meter b'),
        errors: [...p.querySelectorAll('.err-text')].map((x) => x.textContent.trim()),
        note: txt('.lm-note'),
        models: [...p.querySelectorAll('.lm-model')].map((m) => ({
          name: m.querySelector('.lm-model-head b') ? m.querySelector('.lm-model-head b').textContent.trim() : null,
          status: m.querySelector('.lm-model-head .pill') ? m.querySelector('.lm-model-head .pill').textContent.trim() : null,
          class: m.querySelector('.lm-model-class') ? m.querySelector('.lm-model-class').textContent.trim() : null,
          conf: m.querySelector('.lm-model-foot .lm-mono') ? m.querySelector('.lm-model-foot .lm-mono').textContent.trim() : null,
          reason: m.querySelector('.lm-model-reason') ? m.querySelector('.lm-model-reason').textContent.trim() : null,
        })),
        tmStatus: (() => { const n = p.querySelector('.lm-tm .section-head .pill'); return n ? n.textContent.trim() : null; })(),
        tmTop: txt('.lm-tm .lm-pred-value'),
        tmMeta: txt('.lm-tm .lm-pred-meta'),
        tmNote: txt('.lm-tm .lm-note'),
        tmBars: [...p.querySelectorAll('.lm-tm-row')].map((r) => ({
          label: r.querySelector('.lm-tm-name') ? r.querySelector('.lm-tm-name').textContent.trim() : null,
          val: r.querySelector('.lm-tm-val') ? r.querySelector('.lm-tm-val').textContent.trim() : null,
          top: r.classList.contains('top'),
        })),
        historyCount: p.querySelectorAll('.live-results .detect-row').length,
        historyTop: [...p.querySelectorAll('.live-results .detect-row')].slice(0, 4).map((d) => d.innerText.replace(/\s+/g, ' ').slice(0, 90)),
      };
    },
    logs: () => state.logs.slice(-40),
  };
})();
'__sonicTest ready';
