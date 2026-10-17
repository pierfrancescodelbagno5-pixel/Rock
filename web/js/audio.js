/* Slime Reborn — SK.Audio: 100% procedural WebAudio.
 * - Master chain: buses (music / sfx) -> master -> DynamicsCompressor -> destination.
 * - Generated convolution reverbs: short "room" for sfx, long "hall" send for music.
 * - Layered sfx synthesis (oscillators + filtered noise + pitch/filter envelopes) with
 *   per-name rate limiting, voice caps, pitch variance, {vol, pitch, pan} options.
 * - Generative music: every track is composed at runtime from hand-written motifs,
 *   chord progressions and per-track arrangements, then re-varied on every loop.
 *   Look-ahead scheduler (setInterval 25 ms, ~0.12 s ahead on audioCtx.currentTime),
 *   ~1 s crossfades, ducking.
 * Every public function is a safe no-op before init() or without WebAudio.
 */
(function (SK) {
  'use strict';

  /* ================================================================ helpers */
  const W = window;
  const AC = W.AudioContext || W.webkitAudioContext || null;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const isNum = (v) => typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
  const rand = (a, b) => a + Math.random() * (b - a);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const fr = (f) => (f > 15000 ? 15000 : f < 10 ? 10 : f); // keep frequencies in a safe range
  const nowMs = () => (W.performance && W.performance.now ? W.performance.now() : Date.now());
  const noop = () => {};
  const lowQ = () => SK.quality === 'low';
  const EMPTY = Object.freeze({});

  const warned = new Set();
  function warn(e) {
    const msg = (e && e.message) || String(e);
    if (warned.has(msg) || warned.size > 24) return;
    warned.add(msg);
    try { console.warn('[SK.Audio]', msg); } catch (er) { /* no console */ }
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rngOf(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function disconnectAll(list) {
    for (let i = 0; i < list.length; i++) {
      try { list[i].disconnect(); } catch (e) { /* already disconnected */ }
    }
  }

  /* ================================================================== state */
  const LOOKAHEAD = 0.12;   // seconds scheduled ahead of currentTime
  const TICK_MS = 25;       // scheduler period
  const XFADE = 1.0;        // music crossfade
  const MUSIC_BASE = 0.62;  // music bus gain at volume 1
  const SFX_BASE = 0.58;    // sfx bus gain at volume 1
  const GLOBAL_CAP = 40;    // concurrent sfx voices
  const PRIORITY_CAP = 52;  // important stingers may exceed the normal cap a little

  let ctx = null;
  let failed = false;
  let userSuspended = false;
  let initMs = 0;
  let timer = 0;
  let canPan = false;
  let master = null, comp = null, sfxBus = null, musicBus = null, duckGain = null;
  let roomSend = null, hallSend = null;
  let smMusic = null, smSfx = null, smDuck = null; // smoothed long-lived params
  let duckActive = false;
  const graphNodes = [];
  let volMusic = 0.6, volSfx = 0.8;
  let pendingTrack = null;
  let current = null;
  const tracks = [];
  const voices = [];
  const perName = Object.create(null);
  const lastMs = Object.create(null);
  const NB = { white: null, pink: null, brown: null };
  const WAVES = {};
  const CURVES = Object.create(null);
  let duckUntil = 0, duckLevel = 1;

  const volCurve = (v) => { v = isNum(v) ? clamp(v, 0, 1) : 0; return v * v; };

  /* ================================================== context & master graph */
  function gn(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function bq(type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type; b.frequency.value = fr(f); b.Q.value = q;
    return b;
  }
  function osc(type, f, t) {
    const o = ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.setValueAtTime(fr(f), t);
    return o;
  }
  function noiseSrc(color, t, stop) {
    const s = ctx.createBufferSource();
    s.buffer = NB[color] || NB.white;
    s.loop = true;
    s.start(t, Math.random() * 1.6);
    s.stop(stop);
    return s;
  }
  function curveFor(k) {
    let c = CURVES[k];
    if (c) return c;
    const n = 2048;
    c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    CURVES[k] = c;
    return c;
  }
  function softClipCurve() {
    const n = 4096, c = new Float32Array(n), knee = 0.7, room = 0.22;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1, ax = Math.abs(x);
      const y = ax <= knee ? ax : knee + room * Math.tanh((ax - knee) / room);
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }
  // Long-lived params (bus volumes, track faders, duck) only ever move by "glides".
  // Every glide anchors the analytically known current value with setValueAtTime before
  // its setTargetAtTime: cancelling never removes an in-progress ramp (no jumps) and no
  // implementation has to chain two open-ended targets (some engines mis-compute that).
  function sparam(p, v) {
    p.value = v;
    return { p, from: v, to: v, t0: 0, tc: 0.01 };
  }
  function spValue(s, t) {
    if (t <= s.t0) return s.from;
    return s.to + (s.from - s.to) * Math.exp(-(t - s.t0) / s.tc);
  }
  function glide(s, to, tc, at) {
    const t = at == null ? ctx.currentTime : at;
    const v = spValue(s, t);
    s.p.cancelScheduledValues(t);
    s.p.setValueAtTime(v, t);
    s.p.setTargetAtTime(to, t, tc);
    s.from = v; s.to = to; s.t0 = t; s.tc = tc;
  }
  // Note envelope: 0 -(linear a)-> peak -(exp, tc d)-> sus ... at `off` release (tc rtc).
  // The release is anchored at the exact decayed value (no chained open-ended targets).
  function adsr(p, t, a, peak, d, sus, off, rtc) {
    const ta = t + a;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, ta);
    if (off <= ta) { p.setTargetAtTime(0, ta, rtc); return; }
    let v = peak;
    if (d > 0 && sus !== peak) {
      p.setTargetAtTime(sus, ta, d);
      v = sus + (peak - sus) * Math.exp(-(off - ta) / d);
    }
    p.setValueAtTime(v, off);
    p.setTargetAtTime(0, off, rtc);
  }

  function buildNoise() {
    const sr = ctx.sampleRate, len = Math.floor(sr * 2);
    const w = ctx.createBuffer(1, len, sr), p = ctx.createBuffer(1, len, sr), b = ctx.createBuffer(1, len, sr);
    const dw = w.getChannelData(0), dp = p.getChannelData(0), db = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < len; i++) {
      const x = Math.random() * 2 - 1;
      dw[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      dp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
      br = (br + 0.02 * x) / 1.02;
      db[i] = br * 3.5;
    }
    // seamless loops for the coloured noises (crossfade the tail into the head)
    const xf = Math.floor(sr * 0.02);
    for (const d of [dp, db]) {
      for (let i = 0; i < xf; i++) {
        const k = i / xf;
        d[len - xf + i] = d[len - xf + i] * (1 - k) + d[i] * k;
      }
    }
    NB.white = w; NB.pink = p; NB.brown = b;
  }

  function periodic(amps) {
    const n = amps.length;
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 1; i < n; i++) im[i] = amps[i];
    return ctx.createPeriodicWave(re, im);
  }
  function buildWaves() {
    // Pipe organ: fundamental is an octave below the played note (16' stop), so the
    // harmonic table holds 16', 8', 5 1/3', 4', 2 2/3', 2', 1 3/5', 1 1/3', 1'.
    WAVES.organ = periodic([0, 0.5, 1, 0.32, 0.72, 0, 0.36, 0, 0.42, 0, 0.12, 0, 0.18, 0, 0, 0, 0.12]);
    // Warm string/pad: soft saw with slightly weaker even harmonics.
    const warm = [0];
    for (let h = 1; h <= 24; h++) warm.push((1 / Math.pow(h, 1.35)) * (h % 2 ? 1 : 0.82));
    WAVES.warm = periodic(warm);
  }

  // Stereo convolution impulse: decaying noise that gets darker over time + early reflections.
  function impulse(seconds, decay, pre, bright, dark) {
    const sr = ctx.sampleRate;
    const len = Math.max(64, Math.floor(sr * seconds));
    const preN = Math.min(len - 1, Math.floor(sr * pre));
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      const span = len - preN;
      for (let i = preN; i < len; i++) {
        const x = (i - preN) / span;
        const c = bright + (dark - bright) * x;
        lp += c * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - x, decay);
      }
      for (let k = 0; k < 7; k++) {
        const idx = preN + Math.floor(sr * (0.004 + Math.random() * 0.045));
        if (idx < len) d[idx] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.055);
      }
    }
    return buf;
  }

  function buildGraph() {
    const t = ctx.currentTime;
    comp = ctx.createDynamicsCompressor();
    // near-limiter "glue": stacked sounds never clip (note: the node adds ~+5 dB makeup gain)
    comp.threshold.setValueAtTime(-10, t);
    comp.knee.setValueAtTime(8, t);
    comp.ratio.setValueAtTime(8, t);
    comp.attack.setValueAtTime(0.002, t);
    comp.release.setValueAtTime(0.18, t);
    master = gn(0.92);
    master.connect(comp);
    // final safety stage: transparent below ~-3 dBFS, smooth tanh knee above, ceiling
    // ~-0.7 dBFS -> the output can never hard-clip, whatever stacks up
    const safety = ctx.createWaveShaper();
    safety.curve = softClipCurve();
    safety.oversample = 'none';
    comp.connect(safety);
    safety.connect(ctx.destination);
    graphNodes.push(safety);

    sfxBus = ctx.createGain();
    smSfx = sparam(sfxBus.gain, volCurve(volSfx) * SFX_BASE);
    sfxBus.connect(master);
    duckGain = ctx.createGain();
    smDuck = sparam(duckGain.gain, 1);
    duckGain.connect(master);
    musicBus = ctx.createGain();
    smMusic = sparam(musicBus.gain, volCurve(volMusic) * MUSIC_BASE);
    musicBus.connect(duckGain);

    const q = SK.quality;
    const roomLen = q === 'low' ? 0.7 : 1.15;
    const hallLen = q === 'low' ? 1.8 : q === 'medium' ? 2.5 : 3.1;

    roomSend = gn(1);
    const room = ctx.createConvolver();
    room.buffer = impulse(roomLen, 3.4, 0.006, 0.85, 0.28);
    const roomRet = gn(0.5);
    roomSend.connect(room); room.connect(roomRet); roomRet.connect(sfxBus);

    hallSend = gn(1);
    const hall = ctx.createConvolver();
    hall.buffer = impulse(hallLen, 2.3, 0.024, 0.7, 0.09);
    const hallRet = gn(0.55);
    hallSend.connect(hall); hall.connect(hallRet); hallRet.connect(musicBus);

    graphNodes.push(comp, master, sfxBus, duckGain, musicBus, roomSend, room, roomRet, hallSend, hall, hallRet);
  }

  // iOS / some WebViews only unlock output after something plays inside a gesture.
  function unlockBlip() {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.onended = () => { try { s.disconnect(); } catch (e) { /* ignore */ } };
    s.start(0);
  }

  function kick() {
    if (!ctx || userSuspended || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(noop);
    } catch (e) { /* ignore */ }
  }
  function startTimer() { if (!timer && ctx && !userSuspended) timer = setInterval(tick, TICK_MS); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }

  function init() {
    if (ctx) { kick(); return true; }
    if (failed || !AC) return false;
    try {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      initMs = nowMs();
      canPan = typeof ctx.createStereoPanner === 'function';
      buildNoise();
      buildWaves();
      buildGraph();
      unlockBlip();
      kick();
      startTimer();
      if (pendingTrack) { const p = pendingTrack; pendingTrack = null; music(p); }
      return true;
    } catch (e) {
      failed = true;
      try { if (ctx && ctx.close) ctx.close(); } catch (e2) { /* ignore */ }
      ctx = null;
      warn(e);
      return false;
    }
  }

  /* ============================================================ sfx voices */
  class Voice {
    constructor(name, t, vol, pan, send) {
      this.name = name;
      this.end = t;
      this.tail = 0.05;
      this.nodes = [];
      this.lastFilter = null;
      const out = ctx.createGain();
      out.gain.value = vol;
      this.out = out;
      this.nodes.push(out);
      let tail = out;
      if (pan && canPan) {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        out.connect(p);
        tail = p;
        this.nodes.push(p);
      }
      tail.connect(sfxBus);
      if (send > 0) {
        const s = ctx.createGain();
        s.gain.value = send;
        tail.connect(s);
        s.connect(roomSend);
        this.nodes.push(s);
      }
    }
    play(src, t0, t1, offset) {
      if (offset != null) src.start(t0, offset); else src.start(t0);
      src.stop(t1);
      this.nodes.push(src);
      if (t1 > this.end) this.end = t1;
      return src;
    }
    dispose() { disconnectAll(this.nodes); this.nodes.length = 0; }
  }

  // attack -> hold -> exponential release
  function ahr(p, t, a, peak, h, r) {
    if (!(peak > 0.0002)) peak = 0.0002;
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (h > 0) p.setValueAtTime(peak, t + a + h);
    p.exponentialRampToValueAtTime(0.0001, t + a + h + r);
  }

  function vFilter(v, type, f, q, dest) {
    const n = bq(type, f, q == null ? 0.8 : q);
    n.connect(dest || v.out);
    v.nodes.push(n);
    return n;
  }
  function vGain(v, val, dest) {
    const g = gn(val);
    g.connect(dest || v.out);
    v.nodes.push(g);
    return g;
  }
  function vShaper(v, k, dest) {
    const s = ctx.createWaveShaper();
    s.curve = curveFor(k);
    s.oversample = lowQ() ? 'none' : '2x';
    s.connect(dest || v.out);
    v.nodes.push(s);
    return s;
  }
  // amplitude tremolo stage (gain swings between 1-2*depth and 1)
  function vTrem(v, t, dur, rate, depth, dest) {
    const g = vGain(v, 1 - depth, dest);
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const lg = gn(depth);
    l.connect(lg); lg.connect(g.gain);
    v.nodes.push(lg);
    v.play(l, t, t + dur);
    return g;
  }
  function vLfo(v, t, dur, rate, depth, param) {
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const lg = gn(depth);
    l.connect(lg); lg.connect(param);
    v.nodes.push(lg);
    v.play(l, t, t + dur);
  }
  // per-voice stereo-ish feedback echo used by the big stingers
  function vEcho(v, time, fb, mix, lp) {
    const inp = vGain(v, 1);
    const d = ctx.createDelay(1.5);
    d.delayTime.value = time;
    const f = bq('lowpass', lp || 2800, 0.5);
    const g = gn(fb), w = gn(mix);
    inp.connect(d); d.connect(f); f.connect(g); g.connect(d); f.connect(w); w.connect(v.out);
    v.nodes.push(d, f, g, w);
    v.tail = Math.max(v.tail, (Math.log(0.001) / Math.log(fb)) * time);
    return inp;
  }

  // Oscillator layer. o: {t, type|wave, f, f2, g2, f3, g3, pts:[[dt,f]...], a, h, r, vol, det, vib:[rate,cents], dest}
  function tone(v, o) {
    const t = o.t, a = o.a == null ? 0.004 : o.a, h = o.h || 0, r = o.r == null ? 0.15 : o.r;
    const len = a + h + r, end = t + len;
    const s = ctx.createOscillator();
    if (o.wave) s.setPeriodicWave(o.wave); else s.type = o.type || 'sine';
    const fq = s.frequency;
    fq.setValueAtTime(fr(o.f), t);
    if (o.pts) {
      for (let i = 0; i < o.pts.length; i++) fq.exponentialRampToValueAtTime(fr(o.pts[i][1]), t + o.pts[i][0]);
    } else if (o.f2) {
      fq.exponentialRampToValueAtTime(fr(o.f2), t + (o.g2 || len));
      if (o.f3) fq.exponentialRampToValueAtTime(fr(o.f3), t + (o.g3 || len));
    }
    if (o.det) s.detune.value = o.det;
    if (o.vib) {
      const l = ctx.createOscillator();
      l.frequency.value = o.vib[0];
      const lg = gn(o.vib[1]);
      l.connect(lg); lg.connect(s.detune);
      v.nodes.push(lg);
      v.play(l, t, end);
    }
    const g = ctx.createGain();
    ahr(g.gain, t, a, o.vol == null ? 0.2 : o.vol, h, r);
    s.connect(g);
    g.connect(o.dest || v.out);
    v.nodes.push(g);
    v.play(s, t, end + 0.02);
    return s;
  }

  // Filtered noise layer. o: {t, color, a, h, r, vol, ft, ff, ff2, fg, ff3, fg3, q, rate, dest}
  function noise(v, o) {
    const t = o.t, a = o.a == null ? 0.002 : o.a, h = o.h || 0, r = o.r == null ? 0.1 : o.r;
    const len = a + h + r, end = t + len;
    const s = ctx.createBufferSource();
    s.buffer = NB[o.color || 'white'];
    s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    let head = s;
    if (o.ft) {
      const f = ctx.createBiquadFilter();
      f.type = o.ft;
      f.Q.value = o.q == null ? 0.8 : o.q;
      f.frequency.setValueAtTime(fr(o.ff), t);
      if (o.ff2) {
        f.frequency.exponentialRampToValueAtTime(fr(o.ff2), t + (o.fg || len));
        if (o.ff3) f.frequency.exponentialRampToValueAtTime(fr(o.ff3), t + (o.fg3 || len));
      }
      s.connect(f);
      head = f;
      v.nodes.push(f);
      v.lastFilter = f;
    }
    const g = ctx.createGain();
    ahr(g.gain, t, a, o.vol == null ? 0.2 : o.vol, h, r);
    head.connect(g);
    g.connect(o.dest || v.out);
    v.nodes.push(g);
    v.play(s, t, end + 0.02, Math.random() * 1.6);
    return g;
  }

  // Many tiny clicks from ONE noise source (gain spikes) — fire crackle, debris.
  function crackle(v, t, dur, count, vol, ff, dest) {
    const s = ctx.createBufferSource();
    s.buffer = NB.white;
    s.loop = true;
    const f = bq('highpass', ff, 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    const times = [];
    for (let i = 0; i < count; i++) times.push(t + Math.random() * dur);
    times.sort((x, y) => x - y);
    let lastT = -1;
    for (let i = 0; i < times.length; i++) {
      const tt = Math.max(times[i], lastT + 0.004);
      g.gain.setValueAtTime(vol * rand(0.35, 1), tt);
      g.gain.setTargetAtTime(0, tt + 0.0006, 0.002 + Math.random() * 0.005);
      lastT = tt;
    }
    s.connect(f); f.connect(g); g.connect(dest || v.out);
    v.nodes.push(f, g);
    v.play(s, t, Math.max(lastT, t) + 0.06, Math.random());
  }

  // FM bell / chime. o: {t, f, ratio, idx, idx2, a, h, r, vol, dest}
  function fm(v, o) {
    const t = o.t, a = o.a == null ? 0.002 : o.a, h = o.h || 0, r = o.r == null ? 0.6 : o.r;
    const end = t + a + h + r;
    const f = fr(o.f);
    const c = osc('sine', f, t);
    const m = osc('sine', f * (o.ratio || 3.5), t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * (o.idx == null ? 1.5 : o.idx), t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.5, f * (o.idx2 == null ? 0.08 : o.idx2)), end);
    m.connect(mg); mg.connect(c.frequency);
    const g = ctx.createGain();
    ahr(g.gain, t, a, o.vol == null ? 0.1 : o.vol, h, r);
    c.connect(g);
    g.connect(o.dest || v.out);
    v.nodes.push(mg, g);
    v.play(m, t, end + 0.02);
    v.play(c, t, end + 0.02);
  }

  // Brass-like "bwah" (detuned saws through an opening lowpass) for fanfares.
  function brassNote(v, t, midi, dur, vol, dest) {
    const f = mtof(midi);
    const end = t + dur + 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(fr(Math.min(5200, f * 9)), t + 0.06);
    lp.frequency.setTargetAtTime(fr(Math.min(2600, f * 4.5)), t + 0.07, 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.04, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g); g.connect(dest || v.out);
    v.nodes.push(lp, g);
    for (let k = -1; k <= 1; k += 2) {
      const o = osc('sawtooth', f, t);
      o.detune.value = k * 6;
      o.connect(lp);
      v.play(o, t, end + 0.02);
    }
  }

  const SFX = Object.create(null);
  function defSfx(name, o, fn) {
    SFX[name] = {
      fn,
      max: o.max || 8,
      gap: o.gap == null ? 30 : o.gap,
      vary: o.vary == null ? 0.04 : o.vary,
      prio: !!o.prio,
      send: o.send == null ? 0.12 : o.send,
      vol: o.vol == null ? 1 : o.vol,
      duck: o.duck || null,
    };
  }

  /* ---------------------------------------------------------- combat hits */
  defSfx('hit', { max: 8, gap: 30, vary: 0.09, send: 0.06, vol: 0.9 }, (v, t, p) => {
    noise(v, { t, a: 0.001, r: 0.06, vol: 0.55, ft: 'bandpass', ff: 2300 * p, ff2: 650 * p, q: 1.1 });
    tone(v, { t, type: 'triangle', f: 270 * p, f2: 78 * p, g2: 0.08, a: 0.002, r: 0.09, vol: 0.6 });
    tone(v, { t, type: 'square', f: 1500 * p, f2: 600 * p, g2: 0.02, a: 0.001, r: 0.018, vol: 0.1 });
  });

  defSfx('crit', { max: 6, gap: 40, vary: 0.05, send: 0.16, vol: 1 }, (v, t, p) => {
    noise(v, { t, a: 0.001, r: 0.05, vol: 0.55, ft: 'highpass', ff: 2600, q: 0.7 });
    const lp = vFilter(v, 'lowpass', 3200, 1.5);
    tone(v, { t, type: 'sawtooth', f: 1150 * p, f2: 170 * p, g2: 0.11, a: 0.001, r: 0.13, vol: 0.32, dest: lp });
    fm(v, { t: t + 0.006, f: 1850 * p, ratio: 1.414, idx: 4, idx2: 0.4, a: 0.001, r: 0.32, vol: 0.13 });
    tone(v, { t, type: 'sine', f: 165 * p, f2: 46, g2: 0.15, a: 0.002, r: 0.18, vol: 0.65 });
  });

  defSfx('kill', { max: 8, gap: 35, vary: 0.11, send: 0.12, vol: 1 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 240 * p, f2: 840 * p, g2: 0.035, f3: 130 * p, g3: 0.14, a: 0.002, h: 0.02, r: 0.12, vol: 0.5 });
    noise(v, { t: t + 0.008, a: 0.004, r: 0.14, vol: 0.34, ft: 'lowpass', ff: 2600, ff2: 260, q: 2.5 });
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.04 + i * 0.03 + Math.random() * 0.015;
      const f = (1500 + Math.random() * 1300) * p;
      tone(v, { t: tt, type: 'sine', f, f2: f * 1.5, g2: 0.03, a: 0.001, r: 0.045, vol: 0.09 });
    }
  });

  defSfx('hurt', { max: 3, gap: 80, vary: 0.05, send: 0.1, vol: 1 }, (v, t, p) => {
    const sh = vShaper(v, 6);
    const lp = vFilter(v, 'lowpass', 1500, 1, sh);
    tone(v, { t, type: 'sawtooth', f: 310 * p, f2: 105 * p, g2: 0.2, a: 0.003, h: 0.03, r: 0.18, vol: 0.32, dest: lp });
    noise(v, { t, a: 0.001, r: 0.12, vol: 0.4, ft: 'lowpass', ff: 1500, ff2: 300, q: 1 });
    tone(v, { t, type: 'sine', f: 115, f2: 44, g2: 0.2, a: 0.003, r: 0.22, vol: 0.6 });
    tone(v, { t: t + 0.01, type: 'square', f: 620 * p, f2: 540 * p, a: 0.002, r: 0.08, vol: 0.05 });
  });

  defSfx('heal', { max: 3, gap: 90, vary: 0, send: 0.35, vol: 1.4 }, (v, t, p) => {
    const notes = [72, 76, 79, 84, 88];
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * 0.048;
      tone(v, { t: tt, type: 'sine', f: mtof(notes[i]) * p, a: 0.004, r: 0.38, vol: 0.13 });
      tone(v, { t: tt, type: 'triangle', f: mtof(notes[i] - 12) * p, a: 0.006, r: 0.22, vol: 0.06 });
    }
    tone(v, { t, type: 'triangle', f: mtof(60) * p, f2: mtof(67) * p, g2: 0.3, a: 0.08, h: 0.1, r: 0.35, vol: 0.12 });
    noise(v, { t, a: 0.15, r: 0.35, vol: 0.05, ft: 'highpass', ff: 6500 });
  });

  defSfx('pickup', { max: 6, gap: 40, vary: 0.02, send: 0.12, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'triangle', f: 880 * p, a: 0.002, h: 0.04, r: 0.05, vol: 0.24 });
    tone(v, { t: t + 0.055, type: 'triangle', f: 1320 * p, a: 0.002, h: 0.03, r: 0.13, vol: 0.24 });
    tone(v, { t: t + 0.055, type: 'sine', f: 2640 * p, a: 0.002, r: 0.1, vol: 0.05 });
  });

  defSfx('xp', { max: 6, gap: 35, vary: 0.05, send: 0.1, vol: 1.3 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 1568 * p, f2: 1760 * p, g2: 0.03, a: 0.001, r: 0.07, vol: 0.15 });
    tone(v, { t: t + 0.012, type: 'sine', f: 2349 * p, a: 0.001, r: 0.06, vol: 0.07 });
    tone(v, { t, type: 'triangle', f: 784 * p, a: 0.001, r: 0.03, vol: 0.07 });
  });

  defSfx('levelup', { max: 2, gap: 200, vary: 0, prio: true, send: 0.3, duck: [0.45, 1.1], vol: 1.6 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 3800, 0.8);
    const seq = [67, 72, 76, 79];
    for (let i = 0; i < seq.length; i++) {
      const tt = t + i * 0.075;
      tone(v, { t: tt, type: 'square', f: mtof(seq[i]) * p, a: 0.003, h: 0.05, r: 0.12, vol: 0.07, dest: lp });
      tone(v, { t: tt, type: 'triangle', f: mtof(seq[i]) * p, a: 0.003, h: 0.05, r: 0.14, vol: 0.17 });
    }
    const tc = t + 0.3;
    const chord = [72, 79, 84, 88, 91];
    for (let i = 0; i < chord.length; i++) brassNote(v, tc, chord[i], 0.4, 0.045, null);
    tone(v, { t: tc, type: 'sine', f: mtof(60) * p, a: 0.01, h: 0.3, r: 0.5, vol: 0.18 });
    for (let i = 0; i < 7; i++) {
      const f = (2000 + Math.random() * 2400) * p;
      tone(v, { t: tc + Math.random() * 0.6, type: 'sine', f, a: 0.001, r: 0.12, vol: 0.05 });
    }
    noise(v, { t: tc, a: 0.2, r: 0.6, vol: 0.05, ft: 'highpass', ff: 7000 });
    tone(v, { t, type: 'sine', f: 400 * p, f2: 1600 * p, g2: 0.3, a: 0.02, r: 0.28, vol: 0.05 });
  });

  defSfx('dash', { max: 3, gap: 60, vary: 0.06, send: 0.06, vol: 1.3 }, (v, t, p) => {
    noise(v, { t, a: 0.02, h: 0.03, r: 0.15, vol: 0.42, ft: 'bandpass', ff: 500 * p, ff2: 2700 * p, fg: 0.12, ff3: 1200 * p, fg3: 0.2, q: 1.6 });
    tone(v, { t, type: 'sine', f: 195 * p, f2: 80 * p, g2: 0.12, a: 0.005, r: 0.12, vol: 0.32 });
    noise(v, { t, color: 'pink', a: 0.002, r: 0.05, vol: 0.22, ft: 'lowpass', ff: 650 });
  });

  /* -------------------------------------------------------- skill sounds */
  defSfx('water', { max: 6, gap: 50, vary: 0.06, send: 0.2, vol: 1.5 }, (v, t, p) => {
    noise(v, { t, a: 0.01, h: 0.02, r: 0.2, vol: 0.2, ft: 'bandpass', ff: 3000 * p, ff2: 700 * p, fg: 0.22, q: 2 });
    for (let i = 0; i < 5; i++) {
      const tt = t + i * 0.036 + Math.random() * 0.02;
      const f = (380 + i * 120 + rand(-60, 60)) * p;
      tone(v, { t: tt, type: 'sine', f, f2: f * 2.4, g2: 0.045, a: 0.002, r: 0.06, vol: 0.17 });
    }
    tone(v, { t, type: 'sine', f: 900 * p, f2: 300 * p, g2: 0.18, a: 0.004, r: 0.18, vol: 0.12 });
  });

  defSfx('fire', { max: 5, gap: 50, vary: 0.06, send: 0.15, vol: 1.2 }, (v, t, p) => {
    noise(v, { t, color: 'pink', a: 0.05, h: 0.08, r: 0.32, vol: 0.5, ft: 'lowpass', ff: 400 * p, ff2: 2600 * p, fg: 0.08, ff3: 650, fg3: 0.45, q: 0.9 });
    noise(v, { t, color: 'brown', a: 0.03, r: 0.4, vol: 0.38, ft: 'lowpass', ff: 320 });
    crackle(v, t + 0.02, 0.4, 7, 0.32, 3200);
    const lp = vFilter(v, 'lowpass', 300, 0.7);
    tone(v, { t, type: 'sawtooth', f: 90, f2: 60, a: 0.04, r: 0.3, vol: 0.08, dest: lp });
  });

  defSfx('thunder', { max: 3, gap: 80, vary: 0.05, send: 0.3, vol: 1 }, (v, t, p) => {
    noise(v, { t, a: 0.0005, h: 0.01, r: 0.09, vol: 0.7, ft: 'highpass', ff: 1200, q: 0.5 });
    tone(v, { t, type: 'sawtooth', f: 2400 * p, f2: 90 * p, g2: 0.07, a: 0.001, r: 0.08, vol: 0.18 });
    crackle(v, t + 0.005, 0.14, 7, 0.42, 2500);
    noise(v, { t: t + 0.02, color: 'brown', a: 0.06, h: 0.15, r: 1.1, vol: 0.95, ft: 'lowpass', ff: 650, ff2: 90, fg: 1.0, q: 0.8 });
    tone(v, { t: t + 0.01, type: 'sine', f: 72, f2: 32, g2: 0.8, a: 0.01, h: 0.1, r: 0.8, vol: 0.45 });
  });

  defSfx('poison', { max: 5, gap: 60, vary: 0.08, send: 0.15, vol: 1.4 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 1000, 1.2);
    for (let i = 0; i < 4; i++) {
      const tt = t + i * 0.07 + Math.random() * 0.03;
      const f = rand(140, 260) * p;
      tone(v, { t: tt, type: 'sine', f, f2: f * 1.8, g2: 0.05, a: 0.003, r: 0.07, vol: 0.26, dest: lp });
    }
    noise(v, { t, a: 0.06, h: 0.08, r: 0.25, vol: 0.22, ft: 'bandpass', ff: 1400 * p, ff2: 900 * p, q: 3 });
    tone(v, { t, type: 'square', f: 233 * p, a: 0.02, r: 0.25, vol: 0.05, dest: lp });
    tone(v, { t, type: 'square', f: 247 * p, a: 0.02, r: 0.25, vol: 0.05, dest: lp });
  });

  defSfx('web', { max: 5, gap: 50, vary: 0.07, send: 0.1, vol: 1.3 }, (v, t, p) => {
    noise(v, { t, a: 0.002, r: 0.08, vol: 0.32, ft: 'bandpass', ff: 3500 * p, ff2: 900 * p, q: 3 });
    tone(v, { t, type: 'triangle', f: 700 * p, f2: 260 * p, g2: 0.08, a: 0.002, h: 0.02, r: 0.16, vol: 0.28, vib: [28, 40] });
    tone(v, { t: t + 0.03, type: 'sine', f: 220 * p, f2: 140 * p, g2: 0.12, a: 0.01, r: 0.14, vol: 0.22 });
  });

  defSfx('sonic', { max: 4, gap: 60, vary: 0.04, send: 0.25, vol: 1.2 }, (v, t, p) => {
    const tr = vTrem(v, t, 0.4, 32, 0.45);
    tone(v, { t, type: 'sine', f: 1100 * p, f2: 160 * p, g2: 0.32, a: 0.004, r: 0.34, vol: 0.4, dest: tr });
    tone(v, { t, type: 'triangle', f: 2200 * p, f2: 600 * p, g2: 0.25, a: 0.002, r: 0.2, vol: 0.08 });
    noise(v, { t, a: 0.01, r: 0.25, vol: 0.14, ft: 'bandpass', ff: 1500, ff2: 400, q: 4 });
  });

  defSfx('needle', { max: 6, gap: 30, vary: 0.12, send: 0.05, vol: 1.2 }, (v, t, p) => {
    noise(v, { t, a: 0.0005, r: 0.03, vol: 0.28, ft: 'highpass', ff: 5000 * p, q: 1 });
    tone(v, { t, type: 'sine', f: 3200 * p, f2: 1800 * p, g2: 0.025, a: 0.001, r: 0.03, vol: 0.09 });
  });

  defSfx('slash', { max: 5, gap: 40, vary: 0.07, send: 0.12, vol: 1.6 }, (v, t, p) => {
    noise(v, { t, a: 0.012, h: 0.02, r: 0.12, vol: 0.48, ft: 'bandpass', ff: 900 * p, ff2: 5200 * p, fg: 0.07, ff3: 1600 * p, fg3: 0.16, q: 2.2 });
    fm(v, { t: t + 0.02, f: 2300 * p, ratio: 2.76, idx: 1.6, idx2: 0.2, a: 0.002, r: 0.2, vol: 0.06 });
    tone(v, { t, type: 'sine', f: 160 * p, f2: 70, g2: 0.1, a: 0.004, r: 0.1, vol: 0.22 });
  });

  defSfx('magma', { max: 5, gap: 50, vary: 0.07, send: 0.15, vol: 0.9 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 130 * p, f2: 55 * p, g2: 0.2, a: 0.004, r: 0.28, vol: 0.55 });
    noise(v, { t, color: 'brown', a: 0.01, h: 0.05, r: 0.3, vol: 0.55, ft: 'lowpass', ff: 900, ff2: 250, q: 1.5 });
    noise(v, { t, a: 0.02, r: 0.35, vol: 0.06, ft: 'highpass', ff: 4200 });
    for (let i = 0; i < 3; i++) {
      const f = rand(180, 360) * p;
      tone(v, { t: t + 0.08 + Math.random() * 0.22, type: 'sine', f, f2: f * 1.7, g2: 0.05, a: 0.002, r: 0.06, vol: 0.13 });
    }
  });

  defSfx('spirit', { max: 5, gap: 50, vary: 0.05, send: 0.4, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 660 * p, f2: 990 * p, g2: 0.35, a: 0.06, h: 0.1, r: 0.35, vol: 0.17, vib: [6, 25] });
    tone(v, { t: t + 0.03, type: 'triangle', f: 990 * p, f2: 1480 * p, g2: 0.35, a: 0.08, h: 0.06, r: 0.35, vol: 0.06, vib: [6.5, 30] });
    noise(v, { t, a: 0.1, h: 0.05, r: 0.3, vol: 0.1, ft: 'bandpass', ff: 1800 * p, ff2: 2600 * p, q: 6 });
  });

  defSfx('meteor', { max: 4, gap: 80, vary: 0.05, send: 0.25, vol: 1 }, (v, t, p) => {
    noise(v, { t, a: 0.12, r: 0.04, vol: 0.25, ft: 'bandpass', ff: 3000, ff2: 700, fg: 0.16, q: 1.5 });
    tone(v, { t, type: 'sine', f: 1800 * p, f2: 500 * p, g2: 0.16, a: 0.05, r: 0.12, vol: 0.06 });
    const ti = t + 0.14;
    noise(v, { t: ti, a: 0.001, h: 0.01, r: 0.06, vol: 0.5, ft: 'highpass', ff: 1500 });
    tone(v, { t: ti, type: 'sine', f: 120 * p, f2: 34, g2: 0.45, a: 0.002, h: 0.04, r: 0.5, vol: 0.75 });
    noise(v, { t: ti, color: 'brown', a: 0.003, h: 0.05, r: 0.7, vol: 0.75, ft: 'lowpass', ff: 1600, ff2: 140, fg: 0.6 });
    crackle(v, ti + 0.05, 0.35, 6, 0.2, 2000);
  });

  defSfx('howl', { max: 2, gap: 250, vary: 0.03, send: 0.45, duck: [0.3, 1.2], vol: 1.2 }, (v, t, p) => {
    const dur = 1.35;
    const g = vGain(v, 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.25);
    g.gain.setValueAtTime(1, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f1 = vFilter(v, 'bandpass', 500, 5, g);
    const f2 = vFilter(v, 'bandpass', 900, 7, vGain(v, 0.6, g));
    const body = vFilter(v, 'lowpass', 1100, 0.6, vGain(v, 0.25, g));
    // vowel glide "oo -> ah -> oh"
    f1.frequency.setValueAtTime(480, t); f1.frequency.linearRampToValueAtTime(760, t + 0.4); f1.frequency.linearRampToValueAtTime(560, t + dur);
    f2.frequency.setValueAtTime(820, t); f2.frequency.linearRampToValueAtTime(1180, t + 0.4); f2.frequency.linearRampToValueAtTime(900, t + dur);
    // shared vibrato whose depth fades in once the howl has risen
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.35); lg.gain.linearRampToValueAtTime(28, t + 0.7);
    lfo.connect(lg);
    v.nodes.push(lg);
    v.play(lfo, t, t + dur);
    const base = 300 * p;
    const pts = [[0.35, base * 1.75], [0.9, base * 1.8], [dur, base * 1.3]];
    // lead wolf, a wolf an octave below, and a slightly sour fifth for the pack
    const layers = [[1, 0, 0.5], [0.5, 8, 0.32], [1.498, -6, 0.18]];
    for (let i = 0; i < layers.length; i++) {
      const k = layers[i][0];
      const s = osc('sawtooth', base * k, t);
      for (let j = 0; j < pts.length; j++) s.frequency.exponentialRampToValueAtTime(fr(pts[j][1] * k), t + pts[j][0]);
      s.detune.value = layers[i][1];
      lg.connect(s.detune);
      const sg = gn(layers[i][2]);
      s.connect(sg); sg.connect(f1); sg.connect(f2); sg.connect(body);
      v.nodes.push(sg);
      v.play(s, t, t + dur + 0.02);
    }
    noise(v, { t, a: 0.2, h: 0.5, r: 0.6, vol: 0.05, ft: 'bandpass', ff: 1400, q: 2 });
  });

  defSfx('gluttony', { max: 2, gap: 300, vary: 0.02, prio: true, send: 0.35, duck: [0.4, 1.4], vol: 1 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 900, 7);
    vLfo(v, t, 1.3, 6.5, 650, lp.frequency);
    tone(v, { t, type: 'sawtooth', f: 220 * p, f2: 55 * p, g2: 1.15, a: 0.08, h: 0.7, r: 0.4, vol: 0.2, dest: lp });
    tone(v, { t, type: 'sawtooth', f: 223 * p, f2: 56 * p, g2: 1.15, a: 0.08, h: 0.7, r: 0.4, vol: 0.2, dest: lp });
    tone(v, { t, type: 'sine', f: 82 * p, f2: 34, g2: 1.1, a: 0.05, h: 0.7, r: 0.4, vol: 0.5 });
    noise(v, { t, color: 'brown', a: 0.2, h: 0.6, r: 0.5, vol: 0.55, ft: 'lowpass', ff: 520 });
    noise(v, { t, a: 0.15, h: 0.5, r: 0.4, vol: 0.28, ft: 'bandpass', ff: 3200, ff2: 280, fg: 1.0, q: 3 });
    const tc = t + 1.12;
    tone(v, { t: tc, type: 'sine', f: 210, f2: 58, g2: 0.12, a: 0.002, r: 0.14, vol: 0.6 });
    noise(v, { t: tc, a: 0.002, r: 0.07, vol: 0.4, ft: 'lowpass', ff: 1300 });
  });

  defSfx('absorbStart', { max: 2, gap: 150, vary: 0.04, send: 0.2, vol: 1 }, (v, t, p) => {
    noise(v, { t, a: 0.04, h: 0.12, r: 0.3, vol: 0.42, ft: 'bandpass', ff: 1800 * p, ff2: 220 * p, fg: 0.45, q: 4 });
    tone(v, { t, type: 'sine', f: 420 * p, f2: 85 * p, g2: 0.42, a: 0.02, h: 0.1, r: 0.32, vol: 0.42, vib: [13, 60] });
    const lp = vFilter(v, 'lowpass', 500, 1);
    tone(v, { t, type: 'triangle', f: 210 * p, f2: 50 * p, g2: 0.42, a: 0.03, h: 0.08, r: 0.3, vol: 0.3, dest: lp });
  });

  defSfx('absorb', { max: 4, gap: 60, vary: 0.03, send: 0.2, vol: 1 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 200 * p, f2: 85 * p, g2: 0.06, f3: 260 * p, g3: 0.13, a: 0.004, h: 0.04, r: 0.1, vol: 0.58 });
    noise(v, { t, a: 0.004, r: 0.09, vol: 0.27, ft: 'lowpass', ff: 900, ff2: 300, q: 4 });
    const sc = [0, 2, 4, 7, 9, 12, 14];
    for (let i = 0; i < 5; i++) {
      const tt = t + 0.1 + i * 0.035;
      const f = mtof(84 + sc[i]) * p;
      tone(v, { t: tt, type: 'sine', f, a: 0.002, r: 0.14, vol: 0.1 });
      tone(v, { t: tt, type: 'sine', f: f * 2, a: 0.002, r: 0.08, vol: 0.03 });
    }
    noise(v, { t: t + 0.1, a: 0.05, r: 0.25, vol: 0.05, ft: 'highpass', ff: 7000 });
  });

  defSfx('skillGet', { max: 1, gap: 300, vary: 0, prio: true, send: 0.4, duck: [0.5, 1.4], vol: 1.6 }, (v, t, p) => {
    const arp = [60, 64, 67, 71, 74, 78, 81, 86];
    for (let i = 0; i < arp.length; i++) {
      const tt = t + i * 0.05;
      fm(v, { t: tt, f: mtof(arp[i] + 12) * p, ratio: 2.0, idx: 1.2, idx2: 0.05, a: 0.002, r: 0.7, vol: 0.06 });
      tone(v, { t: tt, type: 'triangle', f: mtof(arp[i]) * p, a: 0.003, r: 0.3, vol: 0.09 });
    }
    const tc = t + 0.25;
    const lp = vFilter(v, 'lowpass', 600, 0.8);
    lp.frequency.setValueAtTime(600, tc); lp.frequency.exponentialRampToValueAtTime(3200, tc + 0.5);
    const chord = [60, 67, 71, 74, 78];
    for (let i = 0; i < chord.length; i++) {
      tone(v, { t: tc, type: 'sawtooth', f: mtof(chord[i]) * p, a: 0.3, h: 0.3, r: 0.8, vol: 0.035, det: -6, dest: lp });
      tone(v, { t: tc, type: 'sawtooth', f: mtof(chord[i]) * p, a: 0.3, h: 0.3, r: 0.8, vol: 0.035, det: 6, dest: lp });
    }
    noise(v, { t: tc, a: 0.3, r: 0.6, vol: 0.06, ft: 'highpass', ff: 6000 });
    tone(v, { t: tc, type: 'sine', f: mtof(48) * p, a: 0.05, h: 0.3, r: 0.8, vol: 0.2 });
  });

  defSfx('evolve', { max: 1, gap: 1000, vary: 0, prio: true, send: 0.35, duck: [0.7, 3.2], vol: 1 }, (v, t, p) => {
    const lq = lowQ();
    const echo = vEcho(v, 0.19, 0.35, 0.35, 3000);
    const R = 1.7;
    noise(v, { t, a: R, h: 0.02, r: 0.12, vol: 0.3, ft: 'bandpass', ff: 200, ff2: 7000, fg: R, q: 2.5 });
    const sweep = vFilter(v, 'lowpass', 300, 1.5);
    sweep.frequency.setValueAtTime(300, t); sweep.frequency.exponentialRampToValueAtTime(5000, t + R);
    const tr = vTrem(v, t, R + 0.2, 7, 0.2, sweep);
    const rise = [48, 55, 60, 64, 67];
    for (let i = 0; i < rise.length; i++) {
      for (let k = 0; k < (lq ? 1 : 2); k++) {
        tone(v, { t, type: 'sawtooth', f: mtof(rise[i] - 12), f2: mtof(rise[i]), g2: R, a: R * 0.85, h: R * 0.15, r: 0.15, vol: 0.06, det: k ? 9 : -9, dest: tr });
      }
    }
    const tb = t + R;
    tone(v, { t: tb, type: 'sine', f: 92, f2: 34, g2: 0.9, a: 0.003, h: 0.1, r: 1.0, vol: 0.85 });
    noise(v, { t: tb, color: 'brown', a: 0.004, h: 0.1, r: 1.2, vol: 0.55, ft: 'lowpass', ff: 1300, ff2: 120, fg: 1.2 });
    noise(v, { t: tb, a: 0.003, r: 1.6, vol: 0.16, ft: 'highpass', ff: 4200 });
    const bloom = lq ? [60, 67, 72, 76, 84] : [48, 60, 64, 67, 72, 76, 79, 84];
    for (let i = 0; i < bloom.length; i++) brassNote(v, tb, bloom[i], 0.55, 0.05, echo);
    const pent = [84, 86, 88, 91, 93, 96, 98, 100];
    const nb = lq ? 5 : 9;
    for (let i = 0; i < nb; i++) {
      fm(v, { t: tb + 0.05 + i * 0.07, f: mtof(pent[(Math.random() * pent.length) | 0]), ratio: 3.5, idx: 1.4, idx2: 0.05, a: 0.002, r: 0.9, vol: 0.05, dest: echo });
    }
    noise(v, { t: tb + 0.1, a: 0.4, h: 0.3, r: 1.0, vol: 0.05, ft: 'highpass', ff: 8000, dest: echo });
  });

  /* ----------------------------------------------------------- boss & big */
  defSfx('bossRoar', { max: 2, gap: 400, vary: 0.03, prio: true, send: 0.3, duck: [0.35, 1.5], vol: 1 }, (v, t, p) => {
    const dur = 1.6;
    const lp = vFilter(v, 'lowpass', 1100, 2);
    lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.3); lp.frequency.linearRampToValueAtTime(500, t + dur);
    const tr = vTrem(v, t, dur, 21, 0.32, lp);
    const sh = vShaper(v, 32, tr);
    const env = vGain(v, 1, sh);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.12);
    env.gain.setValueAtTime(1, t + 1.0);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = 62 * p;
    const pts = [[0.25, f * 1.25], [1.0, f * 1.1], [dur, f * 0.7]];
    const parts = [['sawtooth', 1, -14, 0.24], ['sawtooth', 1, 0, 0.24], ['sawtooth', 1, 17, 0.24], ['square', 1.5, 5, 0.12]];
    for (let i = 0; i < parts.length; i++) {
      const s = osc(parts[i][0], f * 0.8 * parts[i][1], t);
      for (let j = 0; j < pts.length; j++) s.frequency.exponentialRampToValueAtTime(fr(pts[j][1] * parts[i][1]), t + pts[j][0]);
      s.detune.value = parts[i][2];
      const sg = gn(parts[i][3]);
      s.connect(sg); sg.connect(env);
      v.nodes.push(sg);
      v.play(s, t, t + dur + 0.02);
    }
    noise(v, { t, color: 'pink', a: 0.15, h: 0.7, r: 0.6, vol: 0.4, ft: 'bandpass', ff: 520, q: 1, dest: sh });
    tone(v, { t, type: 'sine', f: f * 0.5, pts: [[0.25, f * 0.62], [dur, f * 0.36]], a: 0.12, h: 0.9, r: 0.5, vol: 0.45 });
  });

  defSfx('bossDie', { max: 1, gap: 1000, vary: 0, prio: true, send: 0.35, duck: [0.6, 2.6], vol: 1 }, (v, t, p) => {
    noise(v, { t, a: 0.0005, h: 0.02, r: 0.08, vol: 0.6, ft: 'highpass', ff: 1500 });
    tone(v, { t, type: 'sine', f: 110, f2: 30, g2: 0.7, a: 0.002, h: 0.05, r: 0.8, vol: 0.85 });
    noise(v, { t, color: 'brown', a: 0.02, h: 0.5, r: 1.8, vol: 0.75, ft: 'lowpass', ff: 600, ff2: 60, fg: 2.2 });
    const sh = vShaper(v, 12);
    const lp = vFilter(v, 'lowpass', 2000, 1, sh);
    lp.frequency.setValueAtTime(2200, t); lp.frequency.exponentialRampToValueAtTime(260, t + 1.6);
    tone(v, { t, type: 'sawtooth', f: 520, f2: 55, g2: 1.6, a: 0.05, h: 0.6, r: 1.0, vol: 0.2, vib: [6, 35], dest: lp });
    const after = [0.35, 0.7, 1.02];
    for (let i = 0; i < after.length; i++) {
      const ta = t + after[i];
      tone(v, { t: ta, type: 'sine', f: 100 - i * 8, f2: 34, g2: 0.4, a: 0.002, r: 0.45, vol: 0.45 });
      noise(v, { t: ta, a: 0.002, r: 0.25, vol: 0.4, ft: 'lowpass', ff: 2200, ff2: 300 });
      crackle(v, ta, 0.25, 4, 0.18, 2400);
    }
    const tb = t + 1.3;
    const asc = [72, 76, 79, 84, 88];
    for (let i = 0; i < asc.length; i++) fm(v, { t: tb + i * 0.08, f: mtof(asc[i]), ratio: 3.5, idx: 1.2, idx2: 0.05, a: 0.002, r: 1.0, vol: 0.06 });
  });

  defSfx('explosion', { max: 5, gap: 50, vary: 0.08, send: 0.2, vol: 0.8 }, (v, t, p) => {
    noise(v, { t, a: 0.0005, h: 0.01, r: 0.05, vol: 0.55, ft: 'highpass', ff: 1800 });
    tone(v, { t, type: 'sine', f: 115 * p, f2: 36, g2: 0.45, a: 0.002, h: 0.03, r: 0.45, vol: 0.8 });
    noise(v, { t, color: 'brown', a: 0.002, h: 0.04, r: 0.6, vol: 0.8, ft: 'lowpass', ff: 2200 * p, ff2: 160, fg: 0.5 });
    crackle(v, t + 0.04, 0.3, 5, 0.16, 2500);
  });

  defSfx('shield', { max: 3, gap: 80, vary: 0.03, send: 0.25, vol: 1.4 }, (v, t, p) => {
    const tr = vTrem(v, t, 0.55, 24, 0.25);
    tone(v, { t, type: 'triangle', f: 440 * p, f2: 660 * p, g2: 0.15, a: 0.01, h: 0.15, r: 0.3, vol: 0.2, dest: tr });
    tone(v, { t, type: 'sine', f: 880 * p, f2: 1320 * p, g2: 0.15, a: 0.01, h: 0.12, r: 0.3, vol: 0.13, dest: tr });
    fm(v, { t, f: 1760 * p, ratio: 1.5, idx: 2, idx2: 0.3, a: 0.002, r: 0.45, vol: 0.06 });
    noise(v, { t, a: 0.03, h: 0.08, r: 0.25, vol: 0.1, ft: 'bandpass', ff: 2500, q: 8 });
  });

  /* ------------------------------------------------- progression & world */
  defSfx('name', { max: 1, gap: 400, vary: 0, prio: true, send: 0.45, duck: [0.45, 1.5], vol: 1.5 }, (v, t, p) => {
    const chord = [65, 69, 72, 76, 79];
    for (let i = 0; i < chord.length; i++) {
      const f = mtof(chord[i]) * p;
      tone(v, { t: t + i * 0.012, type: 'triangle', f, a: 0.06, h: 0.4, r: 1.0, vol: 0.06 });
      tone(v, { t: t + i * 0.012, type: 'sine', f: f * 2, a: 0.08, h: 0.3, r: 0.9, vol: 0.025 });
    }
    const sp = [77, 81, 84, 88, 91, 96];
    for (let i = 0; i < sp.length; i++) fm(v, { t: t + 0.1 + i * 0.06, f: mtof(sp[i]) * p, ratio: 3.5, idx: 1.2, idx2: 0.05, a: 0.002, r: 0.7, vol: 0.05 });
    noise(v, { t, a: 0.3, r: 0.8, vol: 0.04, ft: 'highpass', ff: 7000 });
    tone(v, { t, type: 'sine', f: mtof(41) * p, a: 0.05, h: 0.4, r: 0.9, vol: 0.16 });
  });

  defSfx('chest', { max: 2, gap: 200, vary: 0, prio: true, send: 0.3, vol: 1.3 }, (v, t, p) => {
    const bp = vFilter(v, 'bandpass', 900, 3);
    tone(v, { t, type: 'sawtooth', f: 110, f2: 175, g2: 0.2, a: 0.02, h: 0.12, r: 0.08, vol: 0.32, vib: [17, 70], dest: bp });
    tone(v, { t: t + 0.22, type: 'sine', f: 140, f2: 70, g2: 0.08, a: 0.002, r: 0.1, vol: 0.45 });
    noise(v, { t: t + 0.22, a: 0.002, r: 0.06, vol: 0.25, ft: 'lowpass', ff: 900 });
    const lp = vFilter(v, 'lowpass', 4200, 0.8);
    const arp = [79, 83, 86, 91];
    for (let i = 0; i < arp.length; i++) {
      const tt = t + 0.27 + i * 0.06;
      tone(v, { t: tt, type: 'square', f: mtof(arp[i]) * p, a: 0.002, h: 0.04, r: 0.22, vol: 0.06, dest: lp });
      tone(v, { t: tt, type: 'triangle', f: mtof(arp[i]) * p, a: 0.002, h: 0.04, r: 0.3, vol: 0.13 });
    }
    for (let i = 0; i < 6; i++) fm(v, { t: t + 0.35 + Math.random() * 0.4, f: rand(2600, 4200), ratio: 1.41, idx: 2, idx2: 0.1, a: 0.001, r: 0.18, vol: 0.035 });
    noise(v, { t: t + 0.3, a: 0.1, r: 0.4, vol: 0.04, ft: 'highpass', ff: 8000 });
  });

  defSfx('coin', { max: 5, gap: 40, vary: 0.01, send: 0.12, vol: 1.6 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 4500, 0.7);
    tone(v, { t, type: 'square', f: 988 * p, a: 0.001, h: 0.05, r: 0.01, vol: 0.09, dest: lp });
    tone(v, { t: t + 0.06, type: 'square', f: 1319 * p, a: 0.001, h: 0.04, r: 0.28, vol: 0.09, dest: lp });
    tone(v, { t: t + 0.06, type: 'sine', f: 2638 * p, a: 0.001, r: 0.25, vol: 0.05 });
  });

  defSfx('warning', { max: 1, gap: 500, vary: 0, prio: true, send: 0.25, duck: [0.4, 1.6], vol: 1 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 1800, 2);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.42;
      const fs = [220, 233.1, 311.1];
      for (let k = 0; k < fs.length; k++) {
        tone(v, { t: tt, type: 'sawtooth', f: fs[k] * p, f2: fs[k] * 0.97 * p, g2: 0.34, a: 0.02, h: 0.22, r: 0.12, vol: 0.1, dest: lp });
      }
      tone(v, { t: tt, type: 'sine', f: 72, f2: 50, g2: 0.3, a: 0.004, r: 0.3, vol: 0.45 });
    }
    const dl = vFilter(v, 'lowpass', 300, 1);
    tone(v, { t, type: 'sawtooth', f: 55, a: 0.1, h: 1.0, r: 0.4, vol: 0.2, dest: dl });
  });

  defSfx('portal', { max: 2, gap: 300, vary: 0, prio: true, send: 0.4, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 200 * p, f2: 900 * p, g2: 0.9, a: 0.2, h: 0.5, r: 0.5, vol: 0.2, vib: [9, 60] });
    tone(v, { t, type: 'triangle', f: 300 * p, f2: 1350 * p, g2: 0.9, a: 0.25, h: 0.45, r: 0.5, vol: 0.09, vib: [7, 40] });
    noise(v, { t, a: 0.3, h: 0.5, r: 0.5, vol: 0.24, ft: 'bandpass', ff: 1500, q: 5 });
    vLfo(v, t, 1.3, 3, 700, v.lastFilter.frequency); // swirling wind
    const bells = [84, 88, 91, 96];
    for (let i = 0; i < bells.length; i++) fm(v, { t: t + 0.6 + i * 0.08, f: mtof(bells[i]) * p, ratio: 3.5, idx: 1.2, idx2: 0.05, a: 0.002, r: 0.8, vol: 0.05 });
  });

  /* ---------------------------------------------------------------- UI */
  defSfx('ui', { max: 4, gap: 30, vary: 0.02, send: 0.02, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 1500 * p, f2: 1150 * p, g2: 0.025, a: 0.001, r: 0.04, vol: 0.2 });
    noise(v, { t, a: 0.0005, r: 0.012, vol: 0.07, ft: 'highpass', ff: 5000 });
  });
  defSfx('uiBack', { max: 4, gap: 30, vary: 0.02, send: 0.02, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 900 * p, f2: 600 * p, g2: 0.04, a: 0.001, r: 0.06, vol: 0.2 });
    tone(v, { t, type: 'triangle', f: 450 * p, a: 0.001, r: 0.04, vol: 0.06 });
  });
  defSfx('select', { max: 4, gap: 40, vary: 0, send: 0.08, vol: 1.4 }, (v, t, p) => {
    tone(v, { t, type: 'triangle', f: 880 * p, a: 0.002, h: 0.03, r: 0.03, vol: 0.2 });
    tone(v, { t: t + 0.045, type: 'triangle', f: 1320 * p, a: 0.002, h: 0.02, r: 0.1, vol: 0.2 });
    tone(v, { t: t + 0.045, type: 'sine', f: 2640 * p, a: 0.002, r: 0.08, vol: 0.04 });
  });

  /* ------------------------------------------------------- run stingers */
  defSfx('gameover', { max: 1, gap: 1000, vary: 0, prio: true, send: 0.45, duck: [0.85, 3.6], vol: 1 }, (v, t, p) => {
    const echo = vEcho(v, 0.32, 0.3, 0.3, 2200);
    const mel = [[76, 0, 0.3], [74, 0.3, 0.3], [72, 0.6, 0.3], [71, 0.9, 0.45], [69, 1.35, 1.4]];
    for (let i = 0; i < mel.length; i++) {
      const m = mel[i];
      const last = i === mel.length - 1;
      tone(v, { t: t + m[1], type: 'triangle', f: mtof(m[0]), a: 0.02, h: m[2] * 0.6, r: last ? 1.2 : 0.35, vol: 0.16, vib: last ? [5, 14] : null, dest: echo });
      tone(v, { t: t + m[1], type: 'sine', f: mtof(m[0] - 12), a: 0.03, h: m[2] * 0.5, r: last ? 1.0 : 0.3, vol: 0.07, dest: echo });
    }
    const lp = vFilter(v, 'lowpass', 900, 0.7);
    const chords = [[[57, 60, 64], 0, 0.6], [[53, 57, 60], 0.6, 0.75], [[52, 56, 59], 1.35, 0.45], [[45, 52, 57, 60], 1.8, 1.6]];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      for (let k = 0; k < c[0].length; k++) {
        tone(v, { t: t + c[1], type: 'sawtooth', f: mtof(c[0][k]), a: 0.15, h: c[2] * 0.6, r: 0.6, vol: 0.035, det: k % 2 ? 7 : -7, dest: lp });
      }
      tone(v, { t: t + c[1], type: 'sine', f: mtof(c[0][0] - 12), a: 0.05, h: c[2] * 0.7, r: 0.5, vol: 0.2 });
    }
    tone(v, { t: t + 1.8, type: 'sine', f: 70, f2: 40, g2: 1.2, a: 0.004, h: 0.1, r: 1.3, vol: 0.4 });
    noise(v, { t: t + 1.8, color: 'brown', a: 0.3, h: 0.3, r: 1.2, vol: 0.18, ft: 'lowpass', ff: 400 });
  });

  defSfx('victory', { max: 1, gap: 1000, vary: 0, prio: true, send: 0.35, duck: [0.8, 2.8], vol: 1 }, (v, t, p) => {
    const lq = lowQ();
    const ph = [[67, 0, 0.09], [67, 0.1, 0.09], [67, 0.2, 0.09], [72, 0.3, 0.22], [76, 0.55, 0.18], [79, 0.75, 0.18], [84, 0.95, 1.0]];
    for (let i = 0; i < ph.length; i++) brassNote(v, t + ph[i][1], ph[i][0], ph[i][2], 0.1, null);
    const ch = lq ? [60, 67, 76] : [48, 60, 64, 67, 72];
    for (let i = 0; i < ch.length; i++) brassNote(v, t + 0.95, ch[i], 0.9, 0.055, null);
    const timp = [[0, 43], [0.3, 48], [0.95, 36]];
    for (let i = 0; i < timp.length; i++) {
      const f = mtof(timp[i][1]);
      tone(v, { t: t + timp[i][0], type: 'sine', f, f2: f * 0.97, g2: 0.6, a: 0.003, r: i === 2 ? 1.2 : 0.4, vol: 0.5 });
    }
    for (let i = 0; i < 8; i++) {
      const tt = t + 0.5 + i * 0.056;
      noise(v, { t: tt, a: 0.001, r: 0.06, vol: 0.06 + i * 0.022, ft: 'highpass', ff: 1200 });
    }
    noise(v, { t: t + 0.95, a: 0.003, r: 1.8, vol: 0.2, ft: 'highpass', ff: 5000 });
    const sp = [88, 91, 96, 100];
    for (let i = 0; i < sp.length; i++) fm(v, { t: t + 1.05 + i * 0.07, f: mtof(sp[i]), ratio: 3.5, idx: 1.2, idx2: 0.05, a: 0.002, r: 0.8, vol: 0.045 });
  });

  defSfx('oracle', { max: 2, gap: 250, vary: 0, prio: true, send: 0.55, vol: 2.0 }, (v, t, p) => {
    fm(v, { t, f: mtof(88) * p, ratio: 3.5, idx: 1.2, idx2: 0.05, a: 0.003, r: 1.1, vol: 0.075 });
    fm(v, { t: t + 0.09, f: mtof(95) * p, ratio: 3.5, idx: 1.0, idx2: 0.05, a: 0.003, r: 1.2, vol: 0.06 });
    tone(v, { t, type: 'sine', f: mtof(76) * p, a: 0.15, h: 0.1, r: 0.8, vol: 0.06 });
    noise(v, { t, a: 0.2, r: 0.6, vol: 0.025, ft: 'highpass', ff: 9000 });
  });

  defSfx('combo', { max: 4, gap: 40, vary: 0, send: 0.1, vol: 1.4 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 5000, 0.7);
    tone(v, { t, type: 'square', f: 660 * p, f2: 990 * p, g2: 0.05, a: 0.001, h: 0.03, r: 0.07, vol: 0.07, dest: lp });
    tone(v, { t, type: 'triangle', f: 1320 * p, a: 0.001, r: 0.09, vol: 0.11 });
  });

  /* --------------------------- extras (not required by the contract) */
  defSfx('deny', { max: 2, gap: 120, vary: 0, send: 0.04, vol: 1.6 }, (v, t, p) => {
    const lp = vFilter(v, 'lowpass', 1200, 1);
    tone(v, { t, type: 'square', f: 220 * p, a: 0.002, h: 0.06, r: 0.03, vol: 0.12, dest: lp });
    tone(v, { t: t + 0.1, type: 'square', f: 196 * p, a: 0.002, h: 0.09, r: 0.05, vol: 0.12, dest: lp });
  });
  defSfx('type', { max: 3, gap: 25, vary: 0.1, send: 0.02, vol: 1.3 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 1800 * p, f2: 1500 * p, g2: 0.012, a: 0.001, r: 0.016, vol: 0.1 });
  });
  defSfx('heart', { max: 2, gap: 150, vary: 0, send: 0.4, vol: 1.6 }, (v, t, p) => {
    fm(v, { t, f: mtof(84) * p, ratio: 2, idx: 1, idx2: 0.05, a: 0.003, r: 0.6, vol: 0.07 });
    fm(v, { t: t + 0.11, f: mtof(91) * p, ratio: 2, idx: 1, idx2: 0.05, a: 0.003, r: 0.8, vol: 0.07 });
    tone(v, { t, type: 'sine', f: mtof(72) * p, a: 0.05, h: 0.15, r: 0.5, vol: 0.08 });
  });
  defSfx('firework', { max: 4, gap: 120, vary: 0.08, send: 0.35, vol: 1 }, (v, t, p) => {
    tone(v, { t, type: 'sine', f: 600 * p, f2: 1900 * p, g2: 0.4, a: 0.05, h: 0.25, r: 0.1, vol: 0.05 });
    noise(v, { t, a: 0.2, r: 0.2, vol: 0.06, ft: 'bandpass', ff: 2500, q: 2 });
    const tb = t + 0.45;
    noise(v, { t: tb, a: 0.001, h: 0.01, r: 0.25, vol: 0.5, ft: 'lowpass', ff: 3000, ff2: 400 });
    tone(v, { t: tb, type: 'sine', f: 90, f2: 40, g2: 0.3, a: 0.002, r: 0.35, vol: 0.5 });
    crackle(v, tb + 0.08, 0.7, 14, 0.25, 4000);
  });
  defSfx('wedding', { max: 1, gap: 1500, vary: 0, prio: true, send: 0.5, duck: [0.5, 2.5], vol: 1.6 }, (v, t, p) => {
    const peal = [84, 79, 76, 72, 84, 76, 79, 72];
    for (let i = 0; i < peal.length; i++) fm(v, { t: t + i * 0.22, f: mtof(peal[i] - 12), ratio: 3.01, idx: 2.2, idx2: 0.1, a: 0.002, r: 1.6, vol: 0.07 });
    const ch = [60, 64, 67, 72];
    for (let i = 0; i < ch.length; i++) fm(v, { t: t + 1.9, f: mtof(ch[i]), ratio: 3.01, idx: 2, idx2: 0.1, a: 0.002, r: 2.2, vol: 0.06 });
  });

  const ALIAS = {
    click: 'ui', tap: 'ui', back: 'uiBack', cancel: 'uiBack', confirm: 'select', ok: 'select',
    error: 'deny', fail: 'deny', levelUp: 'levelup', lightning: 'thunder', black_lightning: 'thunder',
    boss: 'bossRoar', roar: 'bossRoar', bubble: 'water', burn: 'fire', flame: 'fire',
    mana: 'pickup', magicule: 'pickup', soul: 'coin', souls: 'coin', gem: 'xp', crystal: 'xp',
    essence: 'absorb', devour: 'absorb', evolution: 'evolve', open: 'chest', gift: 'chest',
    teleport: 'portal', typewriter: 'type', love: 'heart', date: 'heart', marry: 'wedding',
    fireworks: 'firework', wolf: 'howl', wolf_howl: 'howl', vortex: 'gluttony', boom: 'explosion',
    sting: 'needle', cleave: 'slash', guard: 'shield', bell: 'oracle', hp: 'heal', die: 'hurt',
  };

  function sfx(name, opts) {
    if (!ctx || userSuspended || volSfx <= 0.001) return;
    try {
      let d = SFX[name];
      if (!d) {
        const al = ALIAS[name];
        if (!al) return;
        name = al;
        d = SFX[al];
      }
      if (ctx.state !== 'running') {
        // Not unlocked yet: allow only right after init (the very first click), else drop.
        if (nowMs() - initMs > 400) { kick(); return; }
      }
      const ms = nowMs();
      const last = lastMs[name];
      if (last !== undefined && ms - last < d.gap) return;
      if ((perName[name] || 0) >= d.max) return;
      if (voices.length >= (d.prio ? PRIORITY_CAP : GLOBAL_CAP)) return;
      let vol = 1, pitch = 1, pan = 0;
      const o = opts || EMPTY;
      if (isNum(o.vol)) vol = clamp(o.vol, 0, 2);
      if (isNum(o.pitch) && o.pitch > 0) pitch = clamp(o.pitch, 0.25, 4);
      if (isNum(o.pan)) pan = clamp(o.pan, -1, 1);
      if (vol <= 0.001) return;
      lastMs[name] = ms;
      if (d.vary) pitch *= 1 + (Math.random() * 2 - 1) * d.vary;
      const t = ctx.currentTime + 0.004;
      const v = new Voice(name, t, vol * d.vol, pan, d.send);
      try {
        d.fn(v, t, pitch, o);
      } catch (e) {
        v.dispose();
        warn(e);
        return;
      }
      voices.push(v);
      perName[name] = (perName[name] || 0) + 1;
      if (d.duck) duck(d.duck[0] * Math.min(1, vol), d.duck[1]);
    } catch (e) { warn(e); }
  }

  /* ======================================================= music instruments */
  const VOW = { a: [760, 1150], o: [480, 830], u: [340, 760], e: [460, 1750], i: [300, 2100] };
  const notesOf = (e) => (typeof e.n === 'number' ? [e.n] : e.n || []);
  function cleanupOnEnd(src, nodes) {
    src.onended = function () {
      src.onended = null;
      disconnectAll(nodes);
    };
  }

  // Channel defaults per instrument; tracks override per channel via def.mix[name].
  const CH = {
    pad: { lvl: 0.34, wet: 0.55, a: 0.8, r: 1.4, cut: 1500 },
    choir: { lvl: 0.3, wet: 0.65, a: 0.7, r: 1.5, v0: 'o', v1: 'a' },
    organ: { lvl: 0.24, wet: 0.5, a: 0.03, r: 0.3, trem: 0.12, chiff: 1 },
    pedal: { lvl: 0.34, wet: 0.35 },
    harp: { lvl: 0.36, wet: 0.45, decay: 1.5, fx: [['lp', 3800]] },
    pluck: { lvl: 0.42, wet: 0.3, decay: 0.55, ratio: 4 },
    harpsi: { lvl: 0.26, wet: 0.35, decay: 0.7, fx: [['hp', 180]] },
    bell: { lvl: 0.3, wet: 0.6, ratio: 3.5, idx: 1.6, decay: 2.2 },
    drip: { lvl: 0.26, wet: 0.7 },
    flute: { lvl: 0.36, wet: 0.45 },
    horn: { lvl: 0.4, wet: 0.5 },
    brass: { lvl: 0.34, wet: 0.4 },
    lead: { lvl: 0.28, wet: 0.3, fx: [['lp', 5200]] },
    dlead: { lvl: 0.22, wet: 0.25, fx: [['drive', 7], ['lp', 3200]] },
    stab: { lvl: 0.28, wet: 0.3, cut: 2600, hold: 0.16 },
    power: { lvl: 0.17, wet: 0.12, fx: [['hp', 80], ['drive', 22], ['lp', 2800]] },
    pulse: { lvl: 0.16, wet: 0.3, fx: [['lp', 3400]] },
    sub: { lvl: 0.55, wet: 0 },
    pbass: { lvl: 0.5, wet: 0.05, cut: 1400 },
    dbass: { lvl: 0.36, wet: 0.03, fx: [['drive', 5], ['lp', 2000]] },
    kick: { lvl: 0.75, wet: 0.04, tune: 1, decay: 0.42 },
    snare: { lvl: 0.42, wet: 0.25, decay: 0.19 },
    clap: { lvl: 0.42, wet: 0.3, fx: [['bp', 1300, 0.9]] },
    hat: { lvl: 0.15, wet: 0.08, pan: 0.18, decay: 0.045, fx: [['hp', 7200]] },
    ohat: { lvl: 0.12, wet: 0.12, pan: 0.18, decay: 0.26, fx: [['hp', 6500]] },
    shaker: { lvl: 0.14, wet: 0.12, pan: -0.22, fx: [['bp', 6500, 1.1]] },
    tom: { lvl: 0.5, wet: 0.22 },
    taiko: { lvl: 0.68, wet: 0.4 },
    timp: { lvl: 0.55, wet: 0.4 },
    crash: { lvl: 0.15, wet: 0.3, decay: 1.7, fx: [['hp', 4500]] },
    boom: { lvl: 0.7, wet: 0.55 },
    rim: { lvl: 0.22, wet: 0.45, fx: [['bp', 1900, 2.5]] },
  };

  function envSustain(g, t, a, peak, holdUntil, r) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, Math.max(t + a, holdUntil));
    g.gain.setTargetAtTime(0, Math.max(t + a, holdUntil), r / 5);
  }

  function brassCore(c, t, e, sd, mellow) {
    const N = notesOf(e), dur = Math.max(0.06, e.d * sd);
    const a = mellow ? 0.09 : 0.035, r = mellow ? 0.3 : 0.18, end = t + dur + r * 1.4;
    const per = lowQ() ? 1 : 2;
    const peak = (e.v * 0.5) / Math.sqrt(N.length * per);
    const base = mellow ? 260 : 380;
    const pk = mellow ? 700 + 900 * e.v : 1500 + 2600 * e.v;
    const sus = (mellow ? 650 : 1300) * (0.7 + 0.5 * e.v);
    const f = bq('lowpass', base, mellow ? 0.7 : 1.3);
    f.frequency.setValueAtTime(base, t);
    f.frequency.exponentialRampToValueAtTime(fr(pk), t + a + 0.04);
    f.frequency.exponentialRampToValueAtTime(fr(sus), t + a + 0.4);
    const g = gn(0);
    envSustain(g, t, a, peak, t + dur, r);
    f.connect(g); g.connect(c.in);
    const nodes = [f, g];
    let lg = null, lfo = null;
    if (dur > 0.45 && !lowQ()) {
      lfo = osc('sine', 5.4, t);
      lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.2); lg.gain.linearRampToValueAtTime(9, t + 0.55);
      lfo.connect(lg);
      lfo.start(t); lfo.stop(end);
      nodes.push(lfo, lg);
    }
    let last = null;
    for (let i = 0; i < N.length; i++) {
      for (let k = 0; k < per; k++) {
        const o = osc('sawtooth', mtof(N[i]), t);
        o.detune.value = per > 1 ? (k ? 6 : -6) : 0;
        if (lg) lg.connect(o.detune);
        o.connect(f);
        o.start(t); o.stop(end);
        nodes.push(o); last = o;
      }
    }
    if (last) cleanupOnEnd(last, nodes);
  }

  const INS = {
    pad(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dur = Math.max(0.05, e.d * sd);
      const a = Math.min(P.a, dur * 0.7), r = P.r, end = t + dur + r * 1.2;
      const per = lowQ() ? 1 : 2;
      const peak = (e.v * 0.55) / Math.sqrt(N.length * per);
      const f = bq('lowpass', P.cut * 0.45, 0.6);
      f.frequency.setValueAtTime(fr(P.cut * 0.45), t);
      f.frequency.linearRampToValueAtTime(fr(P.cut), t + a);
      f.frequency.linearRampToValueAtTime(fr(P.cut * 0.7), t + dur);
      const g = gn(0);
      envSustain(g, t, a, peak, t + dur, r);
      f.connect(g); g.connect(c.in);
      const nodes = [f, g];
      let last = null;
      for (let i = 0; i < N.length; i++) {
        for (let k = 0; k < per; k++) {
          const o = osc(P.saw ? 'sawtooth' : WAVES.warm, mtof(N[i]), t);
          o.detune.value = per > 1 ? (k ? 1 : -1) * (P.det || 7) + rand(-2, 2) : 0;
          o.connect(f);
          o.start(t); o.stop(end);
          nodes.push(o); last = o;
        }
      }
      if (last) cleanupOnEnd(last, nodes);
    },

    choir(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dur = Math.max(0.05, e.d * sd);
      const a = Math.min(P.a, dur * 0.7), r = P.r, end = t + dur + r * 1.2;
      const per = lowQ() ? 1 : 2;
      const peak = (e.v * 1.6) / Math.sqrt(N.length * per);
      const V0 = VOW[P.v0] || VOW.o, V1 = VOW[P.v1] || VOW.a;
      const g = gn(0);
      envSustain(g, t, a, peak, t + dur, r);
      g.connect(c.in);
      const f1 = bq('bandpass', V0[0], 4.5), f2 = bq('bandpass', V0[1], 6), body = bq('lowpass', 1300, 0.5);
      const morph = t + Math.max(0.1, dur * 0.6);
      f1.frequency.setValueAtTime(V0[0], t); f1.frequency.linearRampToValueAtTime(V1[0], morph);
      f2.frequency.setValueAtTime(V0[1], t); f2.frequency.linearRampToValueAtTime(V1[1], morph);
      const g2 = gn(0.6), gb = gn(0.16);
      f1.connect(g); f2.connect(g2); g2.connect(g); body.connect(gb); gb.connect(g);
      const lfo = osc('sine', 5.0 + Math.random() * 0.5, t);
      const lg = gn(9);
      lfo.connect(lg);
      const nodes = [g, f1, f2, body, g2, gb, lg, lfo];
      for (let i = 0; i < N.length; i++) {
        for (let k = 0; k < per; k++) {
          const o = osc('sawtooth', mtof(N[i]), t);
          o.detune.value = per > 1 ? (k ? 11 : -11) + rand(-3, 3) : 0;
          lg.connect(o.detune);
          o.connect(f1); o.connect(f2); o.connect(body);
          o.start(t); o.stop(end);
          nodes.push(o);
        }
      }
      lfo.start(t); lfo.stop(end + 0.01);
      cleanupOnEnd(lfo, nodes);
    },

    organ(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dur = Math.max(0.05, e.d * sd);
      const a = P.a, r = P.r, end = t + dur + r * 1.3;
      const peak = (e.v * 0.5) / Math.sqrt(N.length);
      const g = gn(0);
      envSustain(g, t, a, peak, t + dur, r);
      const nodes = [g];
      if (P.trem && !lowQ()) {
        const tg = gn(1 - P.trem);
        const lfo = osc('sine', 5.6, t);
        const lg = gn(P.trem);
        lfo.connect(lg); lg.connect(tg.gain);
        g.connect(tg); tg.connect(c.in);
        lfo.start(t); lfo.stop(end);
        nodes.push(tg, lfo, lg);
      } else {
        g.connect(c.in);
      }
      let last = null;
      for (let i = 0; i < N.length; i++) {
        const o = osc(WAVES.organ, mtof(N[i]) / 2, t);
        o.connect(g);
        o.start(t); o.stop(end);
        nodes.push(o); last = o;
      }
      if (P.chiff && !lowQ()) {
        const s = noiseSrc('white', t, t + 0.09);
        const b = bq('bandpass', 2600, 1.2);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(e.v * 0.1, t);
        cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
        s.connect(b); b.connect(cg); cg.connect(c.in);
        cleanupOnEnd(s, [s, b, cg]);
      }
      if (last) cleanupOnEnd(last, nodes);
    },

    pedal(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.05, e.d * sd), end = t + dur + 0.5;
      const g = gn(0);
      envSustain(g, t, 0.08, e.v * 0.5, t + dur, 0.35);
      g.connect(c.in);
      const nodes = [g];
      let last = null;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const o = osc(WAVES.organ, f / 2, t);
        const s = osc('sine', f / 2, t);
        const sg = gn(0.45);
        o.connect(g); s.connect(sg); sg.connect(g);
        o.start(t); o.stop(end); s.start(t); s.stop(end);
        nodes.push(o, s, sg); last = o;
      }
      if (last) cleanupOnEnd(last, nodes);
    },

    harp(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), lq = lowQ();
      const dec = lq ? P.decay * 0.6 : P.decay;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.45, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0006, t + dec);
        g.connect(c.in);
        const o1 = osc('triangle', f, t);
        o1.connect(g);
        o1.start(t); o1.stop(t + dec + 0.02);
        const nodes = [g, o1];
        if (!lq) {
          const o2 = osc('sine', f * 2, t);
          const g2 = gn(0.22);
          o2.connect(g2); g2.connect(g);
          o2.start(t); o2.stop(t + dec * 0.6);
          nodes.push(o2, g2);
        }
        cleanupOnEnd(o1, nodes);
      }
    },

    pluck(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dec = P.decay;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.5, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0006, t + dec);
        g.connect(c.in);
        const o1 = osc('sine', f, t);
        o1.connect(g);
        o1.start(t); o1.stop(t + dec + 0.02);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0, t);
        g2.gain.linearRampToValueAtTime(e.v * 0.3, t + 0.002);
        g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.07);
        g2.connect(c.in);
        const o2 = osc('sine', f * (P.ratio || 4), t);
        o2.connect(g2);
        o2.start(t); o2.stop(t + 0.09);
        cleanupOnEnd(o1, [g, o1, g2, o2]);
      }
    },

    harpsi(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dec = P.decay;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const b = bq('lowpass', 7000, 0.9);
        b.frequency.setValueAtTime(fr(Math.min(9000, f * 10)), t);
        b.frequency.exponentialRampToValueAtTime(fr(Math.max(800, f * 2.5)), t + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.35, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
        b.connect(g); g.connect(c.in);
        const o1 = osc('sawtooth', f, t);
        const o2 = osc('square', f * 2, t);
        const g2 = gn(0.25);
        o1.connect(b); o2.connect(g2); g2.connect(b);
        o1.start(t); o1.stop(t + dec + 0.02);
        o2.start(t); o2.stop(t + dec + 0.02);
        cleanupOnEnd(o1, [b, g, o1, o2, g2]);
      }
    },

    bell(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dec = P.decay;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const car = osc('sine', f, t);
        const mod = osc('sine', f * P.ratio, t);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(f * P.idx, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(0.5, f * 0.05), t + dec * 0.6);
        mod.connect(mg); mg.connect(car.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.35, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
        car.connect(g); g.connect(c.in);
        car.start(t); car.stop(t + dec + 0.02);
        mod.start(t); mod.stop(t + dec + 0.02);
        cleanupOnEnd(car, [car, mod, mg, g]);
      }
    },

    drip(c, t, e, sd) {
      const N = notesOf(e);
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const o = osc('sine', f, t);
        o.frequency.exponentialRampToValueAtTime(fr(f * 1.6), t + 0.07);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.5, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
        o.connect(g);
        const nodes = [o, g];
        if (canPan) {
          const p = ctx.createStereoPanner();
          p.pan.value = rand(-0.75, 0.75);
          g.connect(p); p.connect(c.in);
          nodes.push(p);
        } else {
          g.connect(c.in);
        }
        o.start(t); o.stop(t + 0.32);
        cleanupOnEnd(o, nodes);
      }
    },

    flute(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.06, e.d * sd), lq = lowQ();
      const end = t + dur + 0.25;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const g = ctx.createGain();
        adsr(g.gain, t, 0.05, e.v * 0.4, 0.2, e.v * 0.31, t + Math.max(0.06, dur), 0.04);
        g.connect(c.in);
        const o1 = osc('sine', f, t);
        o1.connect(g);
        o1.start(t); o1.stop(end);
        const nodes = [g, o1];
        let o2 = null;
        if (!lq) {
          o2 = osc('sine', f * 2, t);
          const g2 = gn(0.1);
          o2.connect(g2); g2.connect(g);
          o2.start(t); o2.stop(end);
          nodes.push(o2, g2);
        }
        if (dur > 0.3) {
          const lfo = osc('sine', 5.2, t);
          const lg = ctx.createGain();
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(14, t + 0.45);
          lfo.connect(lg); lg.connect(o1.detune);
          if (o2) lg.connect(o2.detune);
          lfo.start(t); lfo.stop(end);
          nodes.push(lfo, lg);
        }
        if (!lq) {
          const s = noiseSrc('white', t, end);
          const b = bq('bandpass', f * 1.6, 1.2);
          const ng = ctx.createGain();
          adsr(ng.gain, t, 0.03, e.v * 0.05, 0.06, e.v * 0.014, t + Math.max(0.06, dur), 0.03);
          s.connect(b); b.connect(ng); ng.connect(c.in);
          nodes.push(s, b, ng);
        }
        cleanupOnEnd(o1, nodes);
      }
    },

    horn(c, t, e, sd) { brassCore(c, t, e, sd, true); },
    brass(c, t, e, sd) { brassCore(c, t, e, sd, false); },

    lead(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.05, e.d * sd), end = t + dur + 0.18;
      const per = lowQ() ? 1 : 2;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const b = bq('lowpass', 4200, 3);
        b.frequency.setValueAtTime(4200, t);
        b.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
        const g = ctx.createGain();
        const pk = (e.v * 0.3) / Math.sqrt(per);
        adsr(g.gain, t, 0.006, pk, 0.1, pk * 0.8, t + dur, 0.03);
        b.connect(g); g.connect(c.in);
        const nodes = [b, g];
        let lg = null;
        if (dur > 0.28) {
          const lfo = osc('sine', 6, t);
          lg = ctx.createGain();
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(12, t + 0.35);
          lfo.connect(lg);
          lfo.start(t); lfo.stop(end);
          nodes.push(lfo, lg);
        }
        let last = null;
        for (let k = 0; k < per; k++) {
          const o = osc('sawtooth', f, t);
          o.detune.value = per > 1 ? (k ? 9 : -9) : 0;
          if (lg) lg.connect(o.detune);
          o.connect(b);
          o.start(t); o.stop(end);
          nodes.push(o); last = o;
        }
        cleanupOnEnd(last, nodes);
      }
    },

    dlead(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.05, e.d * sd), end = t + dur + 0.14;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.32, t + 0.005);
        g.gain.setValueAtTime(e.v * 0.32, t + dur);
        g.gain.setTargetAtTime(0, t + dur, 0.025);
        g.connect(c.in);
        const o1 = osc('sawtooth', f * 0.945, t);
        o1.frequency.exponentialRampToValueAtTime(fr(f), t + 0.035);
        const o2 = osc('square', f * 0.948, t);
        o2.frequency.exponentialRampToValueAtTime(fr(f * 1.003), t + 0.035);
        const g2 = gn(0.5);
        o1.connect(g); o2.connect(g2); g2.connect(g);
        o1.start(t); o1.stop(end); o2.start(t); o2.stop(end);
        const nodes = [g, o1, o2, g2];
        if (dur > 0.3) {
          const lfo = osc('sine', 5.5, t);
          const lg = ctx.createGain();
          lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.15); lg.gain.linearRampToValueAtTime(16, t + 0.35);
          lfo.connect(lg); lg.connect(o1.detune); lg.connect(o2.detune);
          lfo.start(t); lfo.stop(end);
          nodes.push(lfo, lg);
        }
        cleanupOnEnd(o1, nodes);
      }
    },

    stab(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e);
      const dur = Math.min(Math.max(0.04, e.d * sd), P.hold || 0.16);
      const end = t + dur + 0.14;
      const per = lowQ() ? 1 : 2;
      const peak = (e.v * 0.5) / Math.sqrt(N.length * per);
      const b = bq('lowpass', P.cut || 2600, 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.setValueAtTime(peak, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.1);
      b.connect(g); g.connect(c.in);
      const nodes = [b, g];
      let last = null;
      for (let i = 0; i < N.length; i++) {
        for (let k = 0; k < per; k++) {
          const o = osc('sawtooth', mtof(N[i]), t);
          o.detune.value = per > 1 ? (k ? 8 : -8) : 0;
          o.connect(b);
          o.start(t); o.stop(end);
          nodes.push(o); last = o;
        }
      }
      if (last) cleanupOnEnd(last, nodes);
    },

    power(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.05, e.d * sd);
      const short = e.d <= 3;
      const end = t + (short ? 0.2 : dur + 0.15);
      const peak = (e.v * 0.45) / Math.sqrt(N.length);
      const g = ctx.createGain();
      if (short) {
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 0.17);
      } else {
        adsr(g.gain, t, 0.004, peak, 0.25, peak * 0.75, t + dur, 0.035);
      }
      g.connect(c.in);
      const nodes = [g];
      let last = null;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const o1 = osc('sawtooth', f, t);
        const o2 = osc('square', f * 1.006, t);
        o1.connect(g); o2.connect(g);
        o1.start(t); o1.stop(end); o2.start(t); o2.stop(end);
        nodes.push(o1, o2); last = o1;
      }
      if (last) cleanupOnEnd(last, nodes);
    },

    pulse(c, t, e, sd) {
      const N = notesOf(e), dec = clamp(e.d * sd * 1.6, 0.06, 0.4);
      for (let i = 0; i < N.length; i++) {
        const o = osc('square', mtof(N[i]), t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(e.v * 0.3, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
        o.connect(g); g.connect(c.in);
        o.start(t); o.stop(t + dec + 0.02);
        cleanupOnEnd(o, [o, g]);
      }
    },

    sub(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.05, e.d * sd), end = t + dur + 0.3;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const g = gn(0);
        envSustain(g, t, 0.02, e.v * 0.6, t + dur, 0.25);
        g.connect(c.in);
        const o1 = osc('sine', f, t);
        const o2 = osc('triangle', f, t);
        const g2 = gn(0.3);
        o1.connect(g); o2.connect(g2); g2.connect(g);
        o1.start(t); o1.stop(end); o2.start(t); o2.stop(end);
        cleanupOnEnd(o1, [g, o1, o2, g2]);
      }
    },

    pbass(c, t, e, sd) {
      const P = c.cfg, N = notesOf(e), dur = Math.max(0.05, e.d * sd), end = t + dur + 0.2;
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const b = bq('lowpass', P.cut, 4);
        b.frequency.setValueAtTime(fr(P.cut), t);
        b.frequency.exponentialRampToValueAtTime(240, t + 0.22);
        const g = ctx.createGain();
        const pk = e.v * 0.6;
        adsr(g.gain, t, 0.004, pk, 0.08, pk * 0.45, t + dur, 0.03);
        b.connect(g); g.connect(c.in);
        const o1 = osc('triangle', f, t);
        const o2 = osc('sawtooth', f, t);
        const g2 = gn(0.35);
        o1.connect(b); o2.connect(g2); g2.connect(b);
        o1.start(t); o1.stop(end); o2.start(t); o2.stop(end);
        cleanupOnEnd(o1, [b, g, o1, o2, g2]);
      }
    },

    dbass(c, t, e, sd) {
      const N = notesOf(e), dur = Math.max(0.04, e.d * sd), end = t + dur + 0.15, lq = lowQ();
      for (let i = 0; i < N.length; i++) {
        const f = mtof(N[i]);
        const b = bq('lowpass', 2600, 2.5);
        b.frequency.setValueAtTime(2600, t);
        b.frequency.exponentialRampToValueAtTime(520, t + 0.13); // ramps end -> static filter (cheap)
        const g = ctx.createGain();
        const pk = e.v * 0.5;
        adsr(g.gain, t, 0.003, pk, 0.06, pk * 0.75, t + dur, 0.02);
        b.connect(g); g.connect(c.in);
        const o1 = osc('sawtooth', f, t);
        o1.connect(b);
        o1.start(t); o1.stop(end);
        const nodes = [b, g, o1];
        if (!lq) {
          const o2 = osc('sawtooth', f * 1.0045, t);
          o2.connect(b);
          o2.start(t); o2.stop(end);
          nodes.push(o2);
        }
        cleanupOnEnd(o1, nodes);
      }
    },

    /* ------------------------------------------------------------ drums */
    kick(c, t, e, sd) {
      const P = c.cfg, v = e.v, tn = P.tune || 1, dec = P.decay || 0.42;
      const o = osc('sine', 160 * tn, t);
      o.frequency.exponentialRampToValueAtTime(52 * tn, t + 0.07);
      o.frequency.exponentialRampToValueAtTime(40 * tn, t + dec);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dec);
      o.connect(g); g.connect(c.in);
      o.start(t); o.stop(t + dec + 0.02);
      cleanupOnEnd(o, [o, g]);
      if (!lowQ()) {
        const s = noiseSrc('white', t, t + 0.03);
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(v * 0.28, t);
        cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.012);
        s.connect(cg); cg.connect(c.in);
        cleanupOnEnd(s, [s, cg]);
      }
    },

    snare(c, t, e, sd) {
      const v = e.v, dec = c.cfg.decay || 0.19;
      const s = noiseSrc('white', t, t + dec + 0.02);
      const hp = bq('highpass', 1000, 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v * 0.75, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      s.connect(hp); hp.connect(g); g.connect(c.in);
      cleanupOnEnd(s, [s, hp, g]);
      const o = osc('triangle', 210, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(v * 0.55, t);
      bg.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
      o.connect(bg); bg.connect(c.in);
      o.start(t); o.stop(t + 0.13);
      cleanupOnEnd(o, [o, bg]);
    },

    clap(c, t, e, sd) {
      const v = e.v;
      const s = noiseSrc('white', t, t + 0.26);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.setTargetAtTime(0, t + 0.001, 0.003);
      g.gain.setValueAtTime(v * 0.85, t + 0.011);
      g.gain.setTargetAtTime(0, t + 0.012, 0.003);
      g.gain.setValueAtTime(v * 0.75, t + 0.022);
      g.gain.setTargetAtTime(0, t + 0.023, 0.045);
      s.connect(g); g.connect(c.in);
      cleanupOnEnd(s, [s, g]);
    },

    hat(c, t, e, sd) {
      const v = e.v, dec = c.cfg.decay || 0.045;
      const s = noiseSrc('white', t, t + dec + 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v * 0.8, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      s.connect(g); g.connect(c.in);
      cleanupOnEnd(s, [s, g]);
    },
    ohat(c, t, e, sd) { INS.hat(c, t, e, sd); },

    shaker(c, t, e, sd) {
      const v = e.v;
      const s = noiseSrc('white', t, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.7, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.075);
      s.connect(g); g.connect(c.in);
      cleanupOnEnd(s, [s, g]);
    },

    tom(c, t, e, sd) {
      const v = e.v, f = typeof e.n === 'number' ? mtof(e.n) : 120;
      const o = osc('sine', f, t);
      o.frequency.exponentialRampToValueAtTime(fr(f * 0.62), t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.8, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.4);
      o.connect(g); g.connect(c.in);
      o.start(t); o.stop(t + 0.42);
      cleanupOnEnd(o, [o, g]);
    },

    taiko(c, t, e, sd) {
      const v = e.v;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.9, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.95);
      g.connect(c.in);
      const o1 = osc('sine', 105, t);
      o1.frequency.exponentialRampToValueAtTime(52, t + 0.32);
      const o2 = osc('triangle', 170, t);
      o2.frequency.exponentialRampToValueAtTime(85, t + 0.3);
      const g2 = gn(0.25);
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(t); o1.stop(t + 0.97); o2.start(t); o2.stop(t + 0.6);
      cleanupOnEnd(o1, [g, o1, o2, g2]);
      const s = noiseSrc('white', t, t + 0.08);
      const lp = bq('lowpass', 900, 0.8);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(v * 0.5, t);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      s.connect(lp); lp.connect(ng); ng.connect(c.in);
      cleanupOnEnd(s, [s, lp, ng]);
    },

    timp(c, t, e, sd) {
      const v = e.v, f = mtof(typeof e.n === 'number' ? e.n : 41);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v * 0.8, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.3);
      g.connect(c.in);
      const o1 = osc('sine', f, t);
      o1.frequency.exponentialRampToValueAtTime(fr(f * 0.985), t + 1.2);
      const o2 = osc('sine', f * 1.5, t);
      const g2 = gn(0.2);
      const o3 = osc('triangle', f * 2, t);
      const g3 = gn(0.1);
      o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
      o1.start(t); o1.stop(t + 1.32); o2.start(t); o2.stop(t + 0.8); o3.start(t); o3.stop(t + 0.5);
      cleanupOnEnd(o1, [g, o1, o2, g2, o3, g3]);
      const s = noiseSrc('white', t, t + 0.07);
      const lp = bq('lowpass', 500, 0.8);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(v * 0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
      s.connect(lp); lp.connect(ng); ng.connect(c.in);
      cleanupOnEnd(s, [s, lp, ng]);
    },

    crash(c, t, e, sd) {
      const v = e.v, dec = c.cfg.decay || 1.7;
      const s = noiseSrc('white', t, t + dec + 0.02);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v * 0.8, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
      s.connect(g); g.connect(c.in);
      cleanupOnEnd(s, [s, g]);
    },

    boom(c, t, e, sd) {
      const v = e.v;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 2.0);
      g.connect(c.in);
      const o = osc('sine', 64, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
      o.connect(g);
      o.start(t); o.stop(t + 2.02);
      const s = noiseSrc('brown', t, t + 1.5);
      const lp = bq('lowpass', 220, 0.7);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(v * 0.8, t);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 1.4);
      s.connect(lp); lp.connect(ng); ng.connect(c.in);
      cleanupOnEnd(o, [g, o]);
      cleanupOnEnd(s, [s, lp, ng]);
    },

    rim(c, t, e, sd) {
      const v = e.v;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
      g.connect(c.in);
      const o1 = osc('triangle', 1750, t);
      const o2 = osc('square', 820, t);
      const g2 = gn(0.3);
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(t); o1.stop(t + 0.06); o2.start(t); o2.stop(t + 0.06);
      cleanupOnEnd(o1, [g, o1, o2, g2]);
    },
  };

  /* ========================================================= composer */
  const MODES = {
    ionian: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
  };
  const QUAL = { M: [0, 4, 7], m: [0, 3, 7], d: [0, 3, 6], a: [0, 4, 8], s4: [0, 5, 7], s2: [0, 2, 7] };
  const CHORD_RE = /^([b#]?)([1-7])(M|m|d|a|s4|s2)?(7)?$/;

  // '1' '5M' 'b2M' '4m7' '5s4'... -> {deg, root (semitones from key), pcs, scale (mode adapted to chord)}
  function parseChord(spec, mode) {
    const m = CHORD_RE.exec(spec);
    if (!m) throw new Error('accordo non valido: ' + spec);
    const deg = +m[2] - 1;
    const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    const root = (mode[deg] + acc + 12) % 12;
    let iv;
    if (m[3]) iv = QUAL[m[3]].slice();
    else if (acc) iv = [0, 4, 7];
    else iv = [0, (mode[(deg + 2) % 7] - mode[deg] + 12) % 12, (mode[(deg + 4) % 7] - mode[deg] + 12) % 12];
    if (m[4]) iv.push(acc ? 10 : (mode[(deg + 6) % 7] - mode[deg] + 12) % 12);
    const pcs = iv.map((x) => (root + x) % 12);
    const scale = mode.slice();
    for (let j = 0; j < pcs.length; j++) {
      const pc = pcs[j];
      if (scale.indexOf(pc) >= 0) continue;
      let bi = -1, bd = 99;
      for (let i = 1; i < 7; i++) {
        const dd = Math.abs(scale[i] - pc);
        const d = Math.min(dd, 12 - dd);
        if (d <= bd) { bd = d; bi = i; }
      }
      if (bi > 0 && bd <= 1) scale[bi] = pc;
    }
    return { spec, deg, root, pcs, scale, lad: null };
  }

  function buildSong(name, def, variation) {
    const spb = def.spb || 16;
    const key = def.root;
    const mode = def.mode;
    const rng = rngOf(hashStr(name) ^ Math.imul(variation + 1, 0x9e3779b1));
    const cache = Object.create(null);
    const chordOf = (spec) => cache[spec] || (cache[spec] = parseChord(spec, mode));
    const pcOf = (m) => (((m - key) % 12) + 12) % 12;
    const placeAbove = (pc, lo) => {
      let m = key + pc;
      while (m < lo) m += 12;
      while (m - 12 >= lo) m -= 12;
      return m;
    };
    const degMidi = (scale, d) => {
      const o = Math.floor(d / 7);
      return key + o * 12 + scale[d - o * 7];
    };
    const snap = (m, ch) => {
      let best = m, bd = 99;
      for (let k = -6; k <= 6; k++) {
        if (ch.pcs.indexOf(pcOf(m + k)) >= 0) {
          const d = Math.abs(k) + (k > 0 ? 0.1 : 0);
          if (d < bd) { bd = d; best = m + k; }
        }
      }
      return best;
    };
    const nextCT = (m, ch, step) => {
      let x = m + step;
      for (let k = 0; k < 12 && ch.pcs.indexOf(pcOf(x)) < 0; k++) x += step;
      return x;
    };
    // snap to a chord tone in the intended direction, never collapsing a step into a repeat
    const snapDir = (m, ch, dir, prevM) => {
      const isCT = ch.pcs.indexOf(pcOf(m)) >= 0;
      if (dir > 0) {
        let x = isCT ? m : nextCT(m, ch, 1);
        if (prevM !== null && x <= prevM) x = nextCT(prevM, ch, 1);
        return x;
      }
      if (dir < 0) {
        let x = isCT ? m : nextCT(m, ch, -1);
        if (prevM !== null && x >= prevM) x = nextCT(prevM, ch, -1);
        return x;
      }
      return isCT ? m : snap(m, ch);
    };
    const ladder = (ch, lo, n) => {
      const k = lo * 64 + n;
      if (!ch.lad) ch.lad = Object.create(null);
      let out = ch.lad[k];
      if (out) return out;
      out = [];
      for (let m = lo; out.length < n && m < lo + 72; m++) if (ch.pcs.indexOf(pcOf(m)) >= 0) out.push(m);
      ch.lad[k] = out;
      return out;
    };
    const voicing = (ch, center, n, prev) => {
      const pcs = ch.pcs, L = pcs.length;
      let best = null, bc = Infinity;
      for (let inv = 0; inv < L; inv++) {
        for (let oc = -1; oc <= 1; oc++) {
          const v = [];
          let m = placeAbove(pcs[inv], center - 8 + oc * 12);
          v.push(m);
          for (let j = 1; j < n; j++) {
            const want = pcs[(inv + j) % L];
            let x = m + 1;
            while (pcOf(x) !== want) x++;
            v.push(x);
            m = x;
          }
          let sum = 0;
          for (let j = 0; j < n; j++) sum += v[j];
          let cost = Math.abs(sum / n - center) * (prev ? 0.4 : 1);
          if (prev && prev.length === n) for (let j = 0; j < n; j++) cost += Math.abs(v[j] - prev[j]);
          if (cost < bc) { bc = cost; best = v; }
        }
      }
      return best;
    };

    const S = { spb, var: variation, bars: 0, loopBar: 0, chords: [], ev: [], rng, M: def.motifs || EMPTY, total: 0, loopStep: 0 };

    S.put = (bar, step, inst, n, len, vel) => {
      if (bar < 0 || step < 0 || step >= spb) return;
      const idx = bar * spb + step;
      (S.ev[idx] || (S.ev[idx] = [])).push({ i: inst, n, d: len, v: clamp(vel, 0.02, 1.2) });
    };
    S.sec = (prog) => {
      const b0 = S.bars;
      for (let i = 0; i < prog.length; i++) {
        const parts = prog[i].split('|');
        const len = spb / parts.length;
        const segs = [];
        for (let j = 0; j < parts.length; j++) segs.push({ s0: j * len, len, ch: chordOf(parts[j]) });
        S.chords.push(segs);
        S.bars++;
      }
      return { b0, n: prog.length };
    };
    S.loop = (sec) => { S.loopBar = sec.b0; };
    S.seg = (bar, s) => {
      const segs = S.chords[bar] || S.chords[S.loopBar] || S.chords[0];
      for (let i = segs.length - 1; i >= 0; i--) if (s >= segs[i].s0) return segs[i];
      return segs[0];
    };
    S.chordAt = (bar, s) => S.seg(bar, s).ch;
    S.hit = (bar, step, inst, n, len, vel) => S.put(bar, step, inst, n, len, vel);

    // Sustained chords (merging repeated chords), smooth voice leading.
    S.pad = (sec, inst, o) => {
      const center = o.center || 60, n = o.voices || 4, vel = o.vel == null ? 0.5 : o.vel, maxLen = o.maxLen || spb * 2;
      let prev = null;
      let cur = null;
      const flush = () => {
        if (!cur) return;
        const v = voicing(cur.ch, center, n, prev);
        prev = v;
        S.put(cur.bar, cur.s, inst, v, cur.len, vel * (0.94 + rng() * 0.1));
        cur = null;
      };
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        const segs = S.chords[bar];
        for (let j = 0; j < segs.length; j++) {
          const sg = segs[j];
          if (cur && cur.ch.spec === sg.ch.spec && cur.len + sg.len <= maxLen && o.merge !== false) { cur.len += sg.len; continue; }
          flush();
          cur = { bar, s: sg.s0, len: sg.len, ch: sg.ch };
        }
      }
      flush();
    };

    // Chord rhythm (stabs / power chords / brass hits).
    S.rhy = (sec, inst, pat, o) => {
      const pats = Array.isArray(pat) ? pat : [pat];
      const vel = o.vel == null ? 0.6 : o.vel;
      let prev = null;
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        const p = pats[b % pats.length];
        for (let s = 0; s < spb; s++) {
          const c = p[s];
          if (!c || c === '.' || c === '-') continue;
          let nx = s + 1;
          while (nx < spb && (p[nx] === '.' || p[nx] === '-')) nx++;
          const len = o.len || (nx - s);
          const ch = S.chordAt(bar, s);
          let notes;
          if (o.voicing) {
            const r = placeAbove(ch.root, o.lo);
            notes = o.voicing.map((x) => r + x);
          } else {
            notes = voicing(ch, o.center || 62, o.voices || 3, prev);
            prev = notes;
          }
          const vv = c === 'X' ? 1 : c === 'x' ? 0.78 : 0.5;
          S.put(bar, s, inst, notes, len, vel * vv * (0.94 + rng() * 0.1));
        }
      }
    };

    // Arpeggios over the chord-tone ladder.
    S.arp = (sec, inst, o) => {
      const rate = o.rate || 2, lo = o.lo, span = o.span || 6, vel = o.vel == null ? 0.5 : o.vel, len = o.len || rate;
      const pat = o.pat || [0, 1, 2, 3, 4, 5, 4, 3];
      let k = 0;
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        if (o.every && b % o.every !== 0) continue;
        if (o.resetBar) k = 0;
        for (let s = o.start || 0; s < spb; s += rate) {
          const ch = S.chordAt(bar, s);
          const lad = ladder(ch, lo, span);
          const idx = pat === 'rand' ? Math.floor(rng() * span) : pat[k % pat.length];
          k++;
          const m = lad[Math.min(lad.length - 1, idx)];
          const vv = vel * (s % 4 === 0 ? 1 : 0.8) * (0.9 + rng() * 0.18);
          S.put(bar, s, inst, m, len, vv);
        }
      }
    };

    // Bass lines from a 16-step pattern: R/r root, F/f fifth, O/o octave, T third, L fifth below, A approach.
    S.bass = (sec, inst, o) => {
      const pats = Array.isArray(o.pat) ? o.pat : [o.pat];
      const lo = o.lo, vel = o.vel == null ? 0.7 : o.vel;
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        const p = pats[b % pats.length];
        for (let s = 0; s < spb; s++) {
          const c = p[s];
          if (!c || c === '.' || c === '-') continue;
          let nx = s + 1;
          while (nx < spb && (p[nx] === '.' || p[nx] === '-')) nx++;
          const len = o.len || (nx - s);
          const ch = S.chordAt(bar, s);
          const r = placeAbove(ch.root, lo);
          const fifth = ch.pcs.length > 2 ? (ch.pcs[2] - ch.root + 12) % 12 : 7;
          let m = r;
          const up = c.toUpperCase();
          if (up === 'F') m = r + fifth;
          else if (up === 'O') m = r + 12;
          else if (up === 'T') m = r + ((ch.pcs[1] - ch.root + 12) % 12);
          else if (up === 'L') m = r + fifth - 12 >= lo - 5 ? r + fifth - 12 : r + fifth;
          else if (up === 'A') {
            const nb = bar + 1 < S.bars ? bar + 1 : S.loopBar;
            m = placeAbove(S.chordAt(nb, 0).root, lo) - 1;
            if (m < lo - 2) m += 12;
          }
          const vv = c === up ? vel : vel * 0.62;
          S.put(bar, s, inst, m, len, vv * (0.95 + rng() * 0.08));
        }
      }
    };

    // Motif-based melody: motifs are [step, len, degree offset] relative to a chord-tone anchor
    // picked by voice leading; strong notes snap to chord tones; variations mutate on later loops.
    S.mel = (sec, inst, o) => {
      const M = o.motifs || S.M, form = o.form, lo = o.lo, hi = o.hi;
      const vel = o.vel == null ? 0.6 : o.vel, leg = o.legato || 0.92;
      const mut = variation > 0 ? (o.mut == null ? 0.2 : o.mut) : 0;
      const oct = o.oct == null ? 14 : o.oct;
      let prev = null, prevM = null;
      for (let b = 0; b < sec.n; b++) {
        const motif = M[form[b % form.length]];
        if (!motif) continue;
        const bar = sec.b0 + b;
        const ch0 = S.chordAt(bar, 0);
        const first = motif[0][2];
        let minOff = first, maxOff = first;
        for (let i = 1; i < motif.length; i++) {
          if (motif[i][2] < minOff) minOff = motif[i][2];
          if (motif[i][2] > maxOff) maxOff = motif[i][2];
        }
        // anchor on a chord tone: smooth voice leading from the previous note, and the
        // WHOLE motif inside the range so its contour survives intact
        const target = prev === null ? ch0.deg + oct + first : prev;
        let anchor = ch0.deg + oct, best = Infinity;
        for (let k = -2; k <= 2; k++) {
          for (let ct = 0; ct <= 4; ct += 2) {
            const cand = ch0.deg + oct + ct + k * 7;
            const lowM = degMidi(ch0.scale, cand + minOff), highM = degMidi(ch0.scale, cand + maxOff);
            let cost = Math.abs(cand + first - target) + rng() * 0.7;
            if (ch0.pcs.indexOf(pcOf(degMidi(ch0.scale, cand + first))) < 0) cost += 1.5; // land the downbeat on a chord tone
            if (lowM < lo) cost += (lo - lowM) * 5;
            if (highM > hi) cost += (highM - hi) * 5;
            if (cost < best) { best = cost; anchor = cand; }
          }
        }
        for (let i = 0; i < motif.length; i++) {
          const nt = motif[i];
          const s = nt[0], len = nt[1];
          const d0 = anchor + nt[2];
          let d = d0;
          const edge = i === 0 || i === motif.length - 1;
          if (mut && !edge && rng() < mut) d += rng() < 0.5 ? 1 : -1;
          const sg = S.seg(bar, s);
          const strong = s === 0 || s === sg.s0 || len >= 6;
          // intended direction: the motif's own contour, or voice leading across bars
          const dir = i > 0 ? Math.sign(nt[2] - motif[i - 1][2]) : prev === null ? 0 : Math.sign(d0 - prev);
          const place = (dd) => {
            const raw = degMidi(sg.ch.scale, dd);
            return strong ? snapDir(raw, sg.ch, dir, prevM) : raw;
          };
          let m = place(d);
          if (d !== d0 && (m > hi || m < lo)) {
            // a variation must never force an octave leap: drop the mutation instead
            d = d0;
            m = place(d);
          }
          let shift = 0;
          while (m > hi) { m -= 12; shift -= 7; }
          while (m < lo) { m += 12; shift += 7; }
          const acc = s === 0 ? 1 : 0.84 + rng() * 0.1;
          if (mut && len >= 4 && !edge && rng() < mut * 0.6) {
            const h = len >> 1;
            S.put(bar, s, inst, m, h * leg, vel * acc);
            let m2 = degMidi(sg.ch.scale, d + shift + (rng() < 0.5 ? 1 : -1));
            while (m2 > hi) m2 -= 12;
            while (m2 < lo) m2 += 12;
            S.put(bar, s + h, inst, m2, (len - h) * leg, vel * 0.85);
            prevM = m2;
          } else {
            S.put(bar, s, inst, m, len * leg, vel * acc);
            prevM = m;
          }
          prev = d + shift;
        }
      }
    };

    // Random chord-coloured glints (cave drips, crystal bells, fireflies).
    S.spr = (sec, inst, o) => {
      const lo = o.lo, hi = o.hi, vel = o.vel == null ? 0.4 : o.vel, dens = o.dens || 2;
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        const count = Math.floor(dens + rng());
        for (let i = 0; i < count; i++) {
          const s = Math.floor(rng() * spb);
          const ch = S.chordAt(bar, s);
          const pool = ch.pcs.concat([ch.scale[(ch.deg + 1) % 7]]);
          const pc = pool[Math.floor(rng() * pool.length)];
          let m = placeAbove(pc, lo + Math.floor(rng() * Math.max(1, hi - lo - 11)));
          if (m > hi) m -= 12;
          S.put(bar, s, inst, m, 4, vel * (0.55 + rng() * 0.45));
        }
      }
    };

    // Drum patterns per bar ('X' accent, 'x' normal, 'o' ghost) + fills + crashes.
    const TOMS = [57, 55, 52, 50, 48, 45, 43, 40];
    S.drum = (sec, pats, o) => {
      const list = Array.isArray(pats) ? pats : [pats];
      const opt = o || EMPTY;
      for (let b = 0; b < sec.n; b++) {
        const bar = sec.b0 + b;
        const p = list[b % list.length];
        const fl = opt.fill;
        const isFill = !!fl && (b + 1) % fl.every === 0;
        const from = isFill ? fl.from : spb;
        for (const inst in p) {
          const str = p[inst];
          const mute = isFill && inst !== 'kick' && inst !== 'crash';
          for (let s = 0; s < spb; s++) {
            const c = str[s];
            if (!c || c === '.' || c === '-') continue;
            if (mute && s >= from) continue;
            const vv = c === 'X' ? 1 : c === 'x' ? 0.78 : 0.4;
            S.put(bar, s, inst, inst === 'tom' ? TOMS[(s >> 1) % 8] : null, 1, vv * (0.92 + rng() * 0.12));
          }
        }
        if (isFill) {
          const kinds = Array.isArray(fl.kind) ? fl.kind : [fl.kind];
          const kind = kinds[Math.floor(rng() * kinds.length)];
          const n = spb - from;
          for (let s = from, k = 0; s < spb; s++, k++) {
            const ramp = 0.45 + (0.55 * k) / Math.max(1, n - 1);
            if (kind === 'snare') S.put(bar, s, 'snare', null, 1, ramp);
            else if (kind === 'toms') S.put(bar, s, 'tom', TOMS[Math.floor((k * 8) / n)], 1, 0.6 + 0.35 * ramp);
            else if (kind === 'taiko' && k % 2 === 0) S.put(bar, s, 'taiko', null, 1, ramp);
          }
        }
        if (opt.crash && b % (opt.crashEvery || 8) === 0) S.put(bar, 0, 'crash', null, 1, 0.85);
      }
    };

    def.compose(S);
    S.total = S.bars * spb;
    S.loopStep = S.loopBar * spb;
    if (S.ev.length < S.total) S.ev.length = S.total;
    return S;
  }

  /* ============================================================ the tracks */
  const TRACKS = {
    // Epic but mysterious: D minor, slow pads, harp arpeggios, cinematic booms.
    title: {
      bpm: 72, root: 50, mode: MODES.aeolian, level: 1.0,
      echo: { beats: 0.75, fb: 0.36, lp: 2600, mix: 0.5 },
      mix: {
        pad: { cut: 1250, a: 1.2, r: 1.8 },
        harp: { echo: 0.28, decay: 1.8 },
        flute: { echo: 0.25 },
        horn: { lvl: 0.42 },
        choir: { v0: 'o', v1: 'a', a: 1.1 },
        bell: { echo: 0.4, lvl: 0.22 },
      },
      motifs: {
        a: [[0, 6, 0], [6, 2, 1], [8, 4, 2], [12, 4, 4]],
        b: [[0, 6, 4], [6, 2, 3], [8, 4, 2], [12, 4, 1]],
        c: [[0, 4, 2], [4, 4, 1], [8, 8, 0]],
        d: [[0, 3, 0], [3, 3, 2], [6, 2, 4], [8, 8, 7]],
        e: [[0, 8, 0], [8, 4, -1], [12, 4, -3]],
        f: [[0, 4, 2], [4, 4, 4], [8, 8, 2]],
        g: [[0, 6, 4], [6, 2, 3], [8, 8, 0]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '6', '3', '7', '1', '6', '4', '5M']);
        const B = S.sec(['6', '7', '1', '1', '4', '6', '5s4|5M', '5M']);
        const C = S.sec(['1', '6', '3', '7', '1', '6', '4', '5M']);
        S.loop(A);
        const harpPat = [0, 1, 2, 3, 4, 5, 4, 3];
        S.pad(I, 'pad', { center: 60, vel: 0.45 });
        S.arp(I, 'harp', { rate: 2, pat: harpPat, lo: 62, span: 6, vel: 0.32 });
        S.bass(I, 'sub', { pat: 'R...............', lo: 38, vel: 0.55 });
        S.hit(I.b0, 0, 'boom', null, 16, 0.9);

        S.pad(A, 'pad', { center: 60, vel: 0.5 });
        S.arp(A, 'harp', { rate: 2, pat: harpPat, lo: 62, span: 6, vel: 0.4 });
        S.bass(A, 'sub', { pat: 'R...............', lo: 38, vel: 0.62 });
        S.mel(A, 'flute', { form: 'abadabac', oct: 14, lo: 67, hi: 86, vel: 0.6, mut: 0.25 });
        S.hit(A.b0, 0, 'boom', null, 16, 0.75);
        S.hit(A.b0 + 4, 0, 'boom', null, 16, 0.55);

        S.pad(B, 'choir', { center: 62, vel: 0.62 });
        S.pad(B, 'pad', { center: 55, vel: 0.32 });
        S.arp(B, 'harp', { rate: 1, pat: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1], lo: 57, span: 8, vel: 0.3 });
        S.bass(B, 'sub', { pat: 'R.......R.......', lo: 38, vel: 0.66 });
        S.mel(B, 'horn', { form: 'efefefg.', oct: 7, lo: 55, hi: 72, vel: 0.68, mut: 0.15 });
        S.drum(B, [{ taiko: 'X.......x.....x.' }, { taiko: 'X.....x.x.x.....' }], { fill: { every: 4, kind: 'taiko', from: 8 } });
        S.hit(B.b0, 0, 'crash', null, 1, 0.5);
        S.hit(B.b0, 0, 'boom', null, 16, 1);

        S.pad(C, 'pad', { center: 62, vel: 0.5 });
        S.arp(C, 'harp', { rate: 1, pat: [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 4, 3, 2, 1, 0], lo: 62, span: 7, vel: 0.3 });
        S.bass(C, 'sub', { pat: 'R...............', lo: 38, vel: 0.62 });
        S.mel(C, 'flute', { form: 'abadabac', oct: 21, lo: 74, hi: 93, vel: 0.5, mut: 0.35 });
        S.spr(C, 'bell', { dens: 1.2, lo: 79, hi: 96, vel: 0.32 });
        S.drum(C, { taiko: 'X...............' }, {});
      },
    },

    // Ambient, drippy, echoey: F# minor, 2-bar chords, kalimba fragments, water drops.
    cave: {
      bpm: 84, root: 42, mode: MODES.aeolian, level: 1.05,
      echo: { beats: 1.5, fb: 0.5, lp: 2200, mix: 0.6 },
      mix: {
        pad: { cut: 750, a: 2.2, r: 2.6, lvl: 0.38 },
        kalimba: { ins: 'pluck', echo: 0.5, wet: 0.5, decay: 0.9, ratio: 3.98, lvl: 0.4 },
        drip: { echo: 0.55, lvl: 0.24 },
        bell: { echo: 0.45, ratio: 1.4, idx: 1.1, decay: 2.8, lvl: 0.22 },
        choir: { v0: 'u', v1: 'o', a: 1.6, r: 2.2, lvl: 0.24 },
        kick: { tune: 0.85, decay: 0.55, lvl: 0.55 },
        rim: { echo: 0.6 },
        sub: { lvl: 0.5 },
      },
      motifs: {
        a: [[0, 2, 4], [2, 2, 2], [4, 8, 0]],
        b: [[0, 3, 0], [3, 3, 1], [6, 2, 2], [8, 8, 4]],
        c: [[4, 4, 2], [8, 8, 0]],
        d: [[0, 2, 7], [2, 2, 4], [4, 4, 2], [8, 4, 1], [12, 4, 0]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '1', '6', '6', '4', '4', '5', '5']);
        const B = S.sec(['6', '6', '7', '7', '1', '1', 'b2M', 'b2M']);
        S.loop(A);
        const subPat = ['R...............', '................'];
        S.pad(I, 'pad', { center: 54, vel: 0.5 });
        S.bass(I, 'sub', { pat: subPat, lo: 30, len: 32, vel: 0.55 });
        S.spr(I, 'drip', { dens: 2, lo: 78, hi: 94, vel: 0.5 });

        S.pad(A, 'pad', { center: 54, vel: 0.55 });
        S.bass(A, 'sub', { pat: subPat, lo: 30, len: 32, vel: 0.6 });
        S.spr(A, 'drip', { dens: 2.4, lo: 78, hi: 96, vel: 0.5 });
        S.mel(A, 'kalimba', { form: 'a.b.a.c.', oct: 14, lo: 64, hi: 84, vel: 0.5, mut: 0.3 });

        S.pad(B, 'pad', { center: 56, vel: 0.55 });
        S.pad(B, 'choir', { center: 61, vel: 0.4 });
        S.bass(B, 'sub', { pat: subPat, lo: 30, len: 32, vel: 0.6 });
        S.arp(B, 'bell', { rate: 4, pat: [0, 2, 1, 3], lo: 66, span: 5, vel: 0.36 });
        S.spr(B, 'drip', { dens: 1.4, lo: 80, hi: 96, vel: 0.45 });
        S.mel(B, 'kalimba', { form: '.d.b..c.', oct: 14, lo: 64, hi: 84, vel: 0.48, mut: 0.3 });
        S.drum(B, [{ kick: 'x..o............', rim: '..........o.....' }, { kick: 'x..o............', rim: '......o.......o.' }], {});
      },
    },

    // Light, adventurous: G major, marimba arps, flute melody, shaker & clap groove.
    forest: {
      bpm: 112, root: 55, mode: MODES.ionian, level: 0.95, swing: 0.12,
      echo: { beats: 0.75, fb: 0.28, lp: 3200, mix: 0.4 },
      mix: {
        marimba: { ins: 'pluck', decay: 0.5, ratio: 4, lvl: 0.4, pan: -0.15 },
        flute: { echo: 0.2 },
        pad: { cut: 2200, a: 0.5, r: 0.9, lvl: 0.22 },
        bell: { ratio: 3.5, decay: 1.4, lvl: 0.16, echo: 0.35 },
        kick: { lvl: 0.6 },
        snare: { lvl: 0.3 },
      },
      motifs: {
        a: [[0, 2, 0], [2, 2, 1], [4, 4, 2], [8, 2, 4], [10, 2, 3], [12, 4, 2]],
        b: [[0, 3, 4], [3, 1, 5], [4, 4, 4], [8, 2, 2], [10, 2, 1], [12, 4, 0]],
        c: [[0, 4, 2], [4, 2, 1], [6, 2, -1], [8, 8, 0]],
        d: [[0, 2, 4], [2, 2, 5], [4, 2, 7], [6, 2, 5], [8, 4, 4], [12, 2, 2], [14, 2, 1]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '5', '6', '4', '1', '5', '4', '5']);
        const B = S.sec(['6', '4', '1', '5', '6', '4', '2', '5s4|5']);
        const C = S.sec(['1', '5', '6', '4', '4', '5', '1', '1']);
        S.loop(A);
        const mPat = [0, 2, 1, 3, 2, 4, 3, 1];
        S.arp(I, 'marimba', { rate: 2, pat: mPat, lo: 67, span: 6, vel: 0.45 });
        S.drum(I, { shaker: 'o.x.o.x.o.x.o.x.' }, {});

        S.arp(A, 'marimba', { rate: 2, pat: mPat, lo: 67, span: 6, vel: 0.5 });
        S.pad(A, 'pad', { center: 62, vel: 0.4 });
        S.bass(A, 'pbass', { pat: 'R.....F.R...F.O.', lo: 40, vel: 0.7 });
        S.mel(A, 'flute', { form: 'abadabac', oct: 14, lo: 69, hi: 88, vel: 0.58, mut: 0.25 });
        S.drum(A, { kick: 'x.......x.......', clap: '....x.......x...', shaker: 'o.x.o.x.o.x.o.x.' }, { fill: { every: 4, kind: 'toms', from: 12 } });

        S.arp(B, 'marimba', { rate: 1, pat: [0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 6, 5, 4, 2], lo: 64, span: 7, vel: 0.38 });
        S.pad(B, 'pad', { center: 64, vel: 0.45 });
        S.bass(B, 'pbass', { pat: 'R..R..F.R..R..FA', lo: 40, vel: 0.7 });
        S.mel(B, 'flute', { form: 'dbdc', oct: 14, lo: 69, hi: 88, vel: 0.6, mut: 0.25 });
        S.spr(B, 'bell', { dens: 1, lo: 84, hi: 98, vel: 0.35 });
        S.drum(B, { kick: 'x.....x.x.......', clap: '....x.......x...', shaker: 'oxoxoxoxoxoxoxox' }, { fill: { every: 4, kind: ['toms', 'snare'], from: 12 } });

        S.arp(C, 'marimba', { rate: 2, pat: [0, 3, 2, 4, 1, 3, 2, 5], lo: 67, span: 6, vel: 0.5 });
        S.pad(C, 'pad', { center: 62, vel: 0.4 });
        S.bass(C, 'pbass', { pat: 'R.....F.R...F.O.', lo: 40, vel: 0.7 });
        S.mel(C, 'flute', { form: 'badc', oct: 14, lo: 69, hi: 88, vel: 0.6, mut: 0.35 });
        S.drum(C, { kick: 'x.......x.......', clap: '....x.......x...', shaker: 'o.x.o.x.o.x.o.x.' }, { fill: { every: 8, kind: 'toms', from: 8 } });
      },
    },

    // Driving, heavy: E minor/phrygian, distorted power chords, chugging bass, rock drums.
    volcano: {
      bpm: 138, root: 40, mode: MODES.aeolian, level: 0.92,
      mix: {
        choir: { v0: 'o', v1: 'o', a: 0.6, lvl: 0.22 },
        crash: { lvl: 0.14 },
        hat: { lvl: 0.12 },
      },
      motifs: {
        a: [[0, 3, 0], [3, 3, 0], [6, 2, 1], [8, 3, 2], [11, 3, 1], [14, 2, 0]],
        b: [[0, 2, 4], [2, 2, 3], [4, 4, 2], [8, 2, 0], [10, 2, 1], [12, 4, -1]],
        c: [[0, 6, 4], [6, 2, 3], [8, 8, 0]],
        d: [[0, 2, 7], [2, 2, 6], [4, 2, 4], [6, 2, 6], [8, 4, 7], [12, 4, 4]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '6', '7', '1', '1', '6', 'b2M', '5M']);
        const B = S.sec(['4', '6', '7', '1', '4', '6', '5M', '5M']);
        const C = S.sec(['1', '6', '7', '1', '1', '6', 'b2M', '5M']);
        S.loop(A);
        const pv = { voicing: [0, 7, 12], lo: 40, vel: 0.8 };
        S.rhy(I, 'power', 'X...............', pv);
        S.drum(I, [{ kick: 'x.......x.......' }, { kick: 'x.......x.......', tom: '........x.x.xxxx' }], {});

        S.rhy(A, 'power', ['X..x..X...x.X...', 'X..x..X...x.x.x.'], pv);
        S.bass(A, 'dbass', { pat: 'R.rrR.rrR.rrR.rr', lo: 28, vel: 0.72 });
        S.pad(A, 'choir', { center: 59, vel: 0.32 });
        S.drum(A, { kick: 'x.....x.x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' }, { crash: true, fill: { every: 4, kind: 'toms', from: 12 } });

        S.rhy(B, 'power', 'X.x.X.x.X.x.X.x.', pv);
        S.bass(B, 'dbass', { pat: 'RrRrRrRrRrRrOrRr', lo: 28, vel: 0.7 });
        S.mel(B, 'dlead', { form: 'ababdbdc', oct: 14, lo: 64, hi: 84, vel: 0.62, mut: 0.2 });
        S.pad(B, 'choir', { center: 60, vel: 0.36 });
        S.drum(B, { kick: 'x.x...x.x.x...x.', snare: '....X.......X...', hat: 'oxoxoxoxoxoxoxox' }, { crash: true, fill: { every: 4, kind: 'snare', from: 8 } });

        S.rhy(C, 'power', ['X..x..X...x.X...', 'X..x..X...x.x.x.'], pv);
        S.bass(C, 'dbass', { pat: 'R.rrR.rrR.rrR.rr', lo: 28, vel: 0.72 });
        S.mel(C, 'dlead', { form: 'a.a.abac', oct: 14, lo: 64, hi: 84, vel: 0.6, mut: 0.3 });
        S.drum(C, { kick: 'x.....x.x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' }, { crash: true, fill: { every: 4, kind: ['toms', 'snare'], from: 12 } });
      },
    },

    // Dark gothic organ: C harmonic minor, organ chords + pedal, harpsichord toccata, choir, tolling bells.
    demon: {
      bpm: 92, root: 48, mode: MODES.aeolian, level: 0.95,
      mix: {
        olead: { ins: 'organ', trem: 0.08, chiff: 1, lvl: 0.26, a: 0.02, r: 0.12 },
        tbell: { ins: 'bell', ratio: 3.01, idx: 2.4, decay: 3.4, lvl: 0.26, wet: 0.7 },
        choir: { v0: 'u', v1: 'a', a: 0.9, lvl: 0.32 },
        snare: { decay: 0.3, wet: 0.6 },
        kick: { tune: 0.9, decay: 0.5 },
      },
      motifs: {
        a: [[0, 4, 4], [4, 2, 3], [6, 2, 2], [8, 4, 1], [12, 4, 0]],
        b: [[0, 2, 0], [2, 2, 2], [4, 2, 4], [6, 2, 7], [8, 6, 6], [14, 2, 4]],
        c: [[0, 4, 2], [4, 4, 1], [8, 8, 0]],
        d: [[0, 1, 0], [1, 1, 1], [2, 1, 0], [3, 1, -1], [4, 4, 0], [8, 4, 4], [12, 4, 2]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '4', '5M', '1', '6', '4', '2d', '5M']);
        const B = S.sec(['6', '7', '3', '6', '4', '1', '2d', '5M']);
        const C = S.sec(['1', '4', '5M', '1', '6', '4', '2d', '5M']);
        S.loop(A);
        S.pad(I, 'organ', { center: 60, vel: 0.55 });
        S.bass(I, 'pedal', { pat: 'R...............', lo: 36, vel: 0.6 });
        S.hit(I.b0, 0, 'tbell', 60, 16, 0.7);
        S.hit(I.b0 + 1, 0, 'tbell', 55, 16, 0.6);

        S.pad(A, 'organ', { center: 62, vel: 0.5 });
        S.bass(A, 'pedal', { pat: 'R...............', lo: 36, vel: 0.6 });
        S.mel(A, 'olead', { form: 'adbcadbc', oct: 14, lo: 67, hi: 86, vel: 0.6, mut: 0.2, legato: 0.85 });
        S.bass(A, 'tbell', { pat: ['R...............', '................'], lo: 60, vel: 0.45 });
        S.drum(A, { kick: 'X.......x.......', snare: '........X.......' }, {});

        S.pad(B, 'choir', { center: 62, vel: 0.6 });
        S.pad(B, 'organ', { center: 55, vel: 0.38 });
        S.arp(B, 'harpsi', { rate: 1, pat: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 4, 3, 2, 1], lo: 60, span: 6, vel: 0.42 });
        S.bass(B, 'pedal', { pat: 'R.......O.......', lo: 36, vel: 0.6 });
        S.mel(B, 'olead', { form: 'bbdc', oct: 14, lo: 67, hi: 88, vel: 0.55, mut: 0.25, legato: 0.85 });
        S.drum(B, { kick: 'X.....x.X.......', snare: '........X.......', hat: 'x...x...x...x...' }, { fill: { every: 4, kind: 'toms', from: 12 } });

        S.pad(C, 'organ', { center: 62, vel: 0.5 });
        S.pad(C, 'choir', { center: 67, vel: 0.35 });
        S.arp(C, 'harpsi', { rate: 2, pat: [0, 2, 1, 3, 2, 4, 3, 1], lo: 60, span: 6, vel: 0.38 });
        S.bass(C, 'pedal', { pat: 'R...............', lo: 36, vel: 0.6 });
        S.mel(C, 'olead', { form: 'adbcadbc', oct: 14, lo: 67, hi: 86, vel: 0.58, mut: 0.35, legato: 0.85 });
        S.bass(C, 'tbell', { pat: ['R...............', '................'], lo: 60, vel: 0.4 });
        S.drum(C, { kick: 'X.......x.......', snare: '........X.......', hat: '..x...x...x...x.' }, {});
      },
    },

    // Fast, intense: D harmonic minor 160 bpm, 16th bass & chip arps, off-beat stabs, saw lead.
    boss: {
      bpm: 160, root: 50, mode: MODES.aeolian, level: 0.9,
      mix: {
        pad: { cut: 1800, a: 0.5, r: 0.8, lvl: 0.24 },
        choir: { v0: 'o', v1: 'a', a: 0.5, lvl: 0.26 },
        stab: { cut: 3000, hold: 0.1 },
        hat: { lvl: 0.12 },
      },
      motifs: {
        a: [[0, 2, 0], [2, 2, 0], [4, 2, 2], [6, 2, 0], [8, 2, 4], [10, 2, 3], [12, 4, 2]],
        b: [[0, 1, 7], [1, 1, 6], [2, 2, 4], [4, 2, 6], [6, 2, 4], [8, 4, 2], [12, 2, 1], [14, 2, 2]],
        c: [[0, 4, 4], [4, 4, 2], [8, 8, 0]],
        d: [[0, 3, 0], [3, 3, 2], [6, 2, 4], [8, 3, 5], [11, 3, 4], [14, 2, 2]],
      },
      compose(S) {
        const I = S.sec(['1']);
        const A = S.sec(['1', '6', '7', '5M', '1', '6', '4', '5M']);
        const B = S.sec(['6', '7', '1', '1', 'b2M', 'b2M', '5M', '5M']);
        S.loop(A);
        S.drum(I, { kick: 'X...............', snare: '........ooxxxXXX' }, {});
        S.rhy(I, 'stab', 'X...............', { center: 62, vel: 0.8 });

        S.bass(A, 'dbass', { pat: 'RrRrRrRrRrRrOrRr', lo: 26, vel: 0.68 });
        S.arp(A, 'pulse', { rate: 1, pat: [0, 1, 2, 3, 2, 1], lo: 62, span: 4, vel: 0.42 });
        S.rhy(A, 'stab', '..x...x...x...x.', { center: 64, vel: 0.55 });
        S.pad(A, 'pad', { center: 57, vel: 0.35 });
        S.mel(A, 'lead', { form: 'adacadbc', oct: 14, lo: 69, hi: 88, vel: 0.6, mut: 0.2 });
        S.drum(A, { kick: 'x...x...x...x...', snare: '....X.......X...', hat: 'oxoxoxoxoxoxoxox' }, { crash: true, crashEvery: 4, fill: { every: 4, kind: ['toms', 'snare'], from: 12 } });

        S.bass(B, 'dbass', { pat: 'R.RrR.RrR.RrR.Rr', lo: 26, vel: 0.7 });
        S.arp(B, 'pulse', { rate: 1, pat: [0, 2, 4, 2, 1, 3, 5, 3], lo: 62, span: 6, vel: 0.4 });
        S.rhy(B, 'stab', 'X..X..X...X..X..', { center: 64, vel: 0.6 });
        S.pad(B, 'choir', { center: 62, vel: 0.5 });
        S.mel(B, 'lead', { form: 'bbdc', oct: 14, lo: 69, hi: 90, vel: 0.62, mut: 0.25 });
        S.drum(B, { kick: 'x.x.x.x.x.x.x.x.', snare: '....X.......X..o', hat: 'xxxxxxxxxxxxxxxx' }, { crash: true, crashEvery: 4, fill: { every: 4, kind: 'snare', from: 8 } });
      },
    },

    // Epic finale: B minor 150 bpm, big choir pads, brass, string ostinato, taiko + fast drums.
    finalboss: {
      bpm: 150, root: 47, mode: MODES.aeolian, level: 0.88,
      mix: {
        choir: { v0: 'o', v1: 'a', a: 0.8, r: 1.6, lvl: 0.36 },
        choirL: { ins: 'choir', v0: 'a', v1: 'o', a: 0.12, r: 0.6, lvl: 0.4, wet: 0.7 },
        brassL: { ins: 'brass', lvl: 0.36 },
        ostin: { ins: 'stab', hold: 0.07, cut: 2400, lvl: 0.22, pan: 0.2 },
        pad: { cut: 1600, lvl: 0.22 },
        bell: { ratio: 3.01, idx: 2.2, decay: 3.0, lvl: 0.22, wet: 0.7 },
        hat: { lvl: 0.11 },
      },
      motifs: {
        a: [[0, 8, 0], [8, 4, 2], [12, 4, 4]],
        b: [[0, 6, 4], [6, 2, 5], [8, 8, 4]],
        c: [[0, 4, 2], [4, 4, 1], [8, 8, 0]],
        d: [[0, 4, 7], [4, 4, 6], [8, 4, 4], [12, 4, 2]],
        e: [[0, 3, 0], [3, 1, 0], [4, 4, 4], [8, 3, 2], [11, 1, 1], [12, 4, 0]],
        f: [[0, 3, 4], [3, 1, 4], [4, 4, 5], [8, 8, 4]],
      },
      compose(S) {
        const I = S.sec(['1', '1']);
        const A = S.sec(['1', '6', '7', '1', '4', '6', '5M', '5M']);
        const B = S.sec(['6', '3', '7', '1', '6', '3', '4', '5M']);
        const C = S.sec(['4', '4', '6', '6', 'b2M', 'b2M', '5M', '5M']);
        S.loop(A);
        S.pad(I, 'choir', { center: 62, vel: 0.6 });
        S.drum(I, [{ taiko: 'X.......X.......' }, { taiko: 'X.......X.x.X.XX' }], {});
        S.hit(I.b0, 0, 'boom', null, 16, 0.9);

        S.pad(A, 'choir', { center: 62, vel: 0.62 });
        S.arp(A, 'ostin', { rate: 1, pat: [0, 1, 2, 1], lo: 59, span: 4, vel: 0.42, len: 1 });
        S.bass(A, 'dbass', { pat: 'R.R.R.R.R.R.R.R.', lo: 35, vel: 0.58 });
        S.bass(A, 'sub', { pat: 'R...............', lo: 35, vel: 0.5 });
        S.rhy(A, 'brass', 'X.....x...x.....', { center: 60, vel: 0.6 });
        S.mel(A, 'choirL', { form: 'abacabdc', oct: 14, lo: 66, hi: 83, vel: 0.62, mut: 0.15, legato: 0.98 });
        S.drum(A, { taiko: 'X..x..x.X..x....', kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'oxoxoxoxoxoxoxox' }, { crash: true, fill: { every: 4, kind: 'snare', from: 8 } });

        S.pad(B, 'choir', { center: 64, vel: 0.62 });
        S.pad(B, 'pad', { center: 55, vel: 0.4 });
        S.arp(B, 'ostin', { rate: 1, pat: [0, 2, 1, 3, 2, 1], lo: 59, span: 5, vel: 0.42, len: 1 });
        S.bass(B, 'dbass', { pat: 'R.RrR.RrR.RrR.Rr', lo: 35, vel: 0.6 });
        S.mel(B, 'brassL', { form: 'efefefdc', oct: 7, lo: 59, hi: 79, vel: 0.65, mut: 0.2 });
        S.drum(B, { taiko: 'X..x..x.X..x..x.', kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.oo', hat: 'xxxxxxxxxxxxxxxx' }, { crash: true, crashEvery: 4, fill: { every: 4, kind: ['snare', 'taiko'], from: 8 } });

        S.pad(C, 'choir', { center: 60, vel: 0.7 });
        S.pad(C, 'brass', { center: 57, vel: 0.35 });
        S.bass(C, 'sub', { pat: 'R.......R.......', lo: 35, vel: 0.6 });
        S.bass(C, 'timp', { pat: 'R.....R.R.......', lo: 35, vel: 0.6 });
        S.arp(C, 'bell', { rate: 8, pat: [0, 1], lo: 71, span: 3, vel: 0.4 });
        S.mel(C, 'choirL', { form: 'dbdc', oct: 14, lo: 66, hi: 86, vel: 0.6, mut: 0.2, legato: 0.98 });
        S.drum(C, { taiko: 'X.......X.....x.', hat: 'x.x.x.x.x.x.x.x.' }, { fill: { every: 8, kind: 'snare', from: 0 } });
      },
    },

    // Major, triumphant: C major 120 bpm, brass fanfare melody, march snare, timpani, harp runs.
    victory: {
      bpm: 120, root: 48, mode: MODES.ionian, level: 0.9,
      mix: {
        brassL: { ins: 'brass', lvl: 0.4 },
        harp: { decay: 1.1, lvl: 0.3 },
        snare: { lvl: 0.32, decay: 0.15 },
        timp: { lvl: 0.5 },
      },
      motifs: {
        a: [[0, 3, 0], [3, 1, 0], [4, 4, 2], [8, 4, 4], [12, 4, 7]],
        b: [[0, 4, 7], [4, 2, 6], [6, 2, 5], [8, 4, 4], [12, 4, 2]],
        c: [[0, 3, 4], [3, 1, 5], [4, 4, 6], [8, 8, 7]],
        d: [[0, 2, 4], [2, 2, 2], [4, 4, 0], [8, 4, 2], [12, 4, 4]],
      },
      compose(S) {
        const A = S.sec(['1', '4', '1', '5', '1', '6', '4', '5']);
        const B = S.sec(['4', '5', '3', '6', '2', '5', '1', '1']);
        S.loop(A);
        S.rhy(A, 'brass', 'X.....x.X.......', { center: 62, vel: 0.55 });
        S.mel(A, 'brassL', { form: 'abadabac', oct: 14, lo: 67, hi: 86, vel: 0.68, mut: 0.2 });
        S.arp(A, 'harp', { rate: 1, pat: [0, 1, 2, 3, 4, 5, 6, 7], lo: 60, span: 8, vel: 0.3, every: 2 });
        S.bass(A, 'pbass', { pat: 'R...F...R...F.A.', lo: 36, vel: 0.68 });
        S.bass(A, 'timp', { pat: 'R.......F.......', lo: 41, vel: 0.55 });
        S.drum(A, { kick: 'x.......x.......', snare: 'X..x.xx.X..x.x..' }, { crash: true, fill: { every: 4, kind: 'snare', from: 12 } });

        S.pad(B, 'pad', { center: 62, vel: 0.4 });
        S.rhy(B, 'brass', 'X.......x.x.....', { center: 64, vel: 0.5 });
        S.mel(B, 'brassL', { form: 'dbdc', oct: 14, lo: 67, hi: 88, vel: 0.66, mut: 0.25 });
        S.arp(B, 'harp', { rate: 1, pat: [7, 6, 5, 4, 3, 2, 1, 0], lo: 60, span: 8, vel: 0.28, every: 2 });
        S.bass(B, 'pbass', { pat: 'R...F...R.O.F.A.', lo: 36, vel: 0.68 });
        S.bass(B, 'timp', { pat: 'R.......R.R.....', lo: 41, vel: 0.5 });
        S.drum(B, { kick: 'x.......x.......', snare: 'X..x.xx.X..x.xxx' }, { crash: true, fill: { every: 4, kind: 'snare', from: 8 } });
      },
    },
  };

  /* ================================================ music engine / scheduler */
  function buildEcho(T, cfg) {
    const time = clamp((cfg.beats * 60) / T.def.bpm, 0.05, 1.9);
    const inp = gn(1);
    const dL = ctx.createDelay(2.0), dR = ctx.createDelay(2.0);
    dL.delayTime.value = time; dR.delayTime.value = time;
    const lp = bq('lowpass', cfg.lp || 2500, 0.5);
    const hp = bq('highpass', 220, 0.5);
    const fbL = gn(cfg.fb), fbR = gn(cfg.fb);
    const merger = ctx.createChannelMerger(2);
    const out = gn(cfg.mix == null ? 0.5 : cfg.mix);
    inp.connect(lp); lp.connect(hp); hp.connect(dL);
    dL.connect(fbL); fbL.connect(dR);
    dR.connect(fbR); fbR.connect(dL);
    dL.connect(merger, 0, 0);
    dR.connect(merger, 0, 1);
    merger.connect(out);
    out.connect(T.fader);
    const ow = gn(0.5);
    out.connect(ow); ow.connect(T.wetFader);
    T.echoIn = inp;
    T.nodes.push(inp, dL, dR, lp, hp, fbL, fbR, merger, out, ow);
  }

  function makeChan(T, name) {
    const over = (T.def.mix && T.def.mix[name]) || null;
    const ins = (over && over.ins) || name;
    const fn = INS[ins];
    if (!fn) { T.chans[name] = false; return false; }
    const cfg = Object.assign({}, CH[ins] || EMPTY, over || EMPTY);
    const inp = gn(cfg.lvl == null ? 0.3 : cfg.lvl);
    const nodes = [inp];
    let tail = inp;
    if (cfg.fx) {
      for (let i = 0; i < cfg.fx.length; i++) {
        const fx = cfg.fx[i];
        let n;
        if (fx[0] === 'drive') {
          n = ctx.createWaveShaper();
          n.curve = curveFor(fx[1]);
          n.oversample = lowQ() ? 'none' : '2x';
        } else {
          n = bq(fx[0] === 'lp' ? 'lowpass' : fx[0] === 'hp' ? 'highpass' : 'bandpass', fx[1], fx[2] == null ? 0.7 : fx[2]);
        }
        tail.connect(n);
        tail = n;
        nodes.push(n);
      }
    }
    if (cfg.pan && canPan) {
      const p = ctx.createStereoPanner();
      p.pan.value = cfg.pan;
      tail.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(T.fader);
    if (cfg.wet > 0) { const w = gn(cfg.wet); tail.connect(w); w.connect(T.wetFader); nodes.push(w); }
    if (cfg.echo > 0 && T.echoIn) { const eg = gn(cfg.echo); tail.connect(eg); eg.connect(T.echoIn); nodes.push(eg); }
    const c = { in: inp, cfg, fn, nodes };
    T.chans[name] = c;
    return c;
  }

  function createTrack(name, at) {
    const def = TRACKS[name];
    const sd = 60 / def.bpm / 4;
    const T = {
      name, def, sd, swing: (def.swing || 0) * sd,
      pos: 0, loop: 0, next: at, song: null,
      chans: Object.create(null), nodes: [], echoIn: null,
      alive: true, endAt: Infinity, killAt: Infinity,
      level: def.level || 1,
    };
    T.fader = ctx.createGain();
    T.wetFader = ctx.createGain();
    T.smDry = sparam(T.fader.gain, 0);
    T.smWet = sparam(T.wetFader.gain, 0);
    T.fader.connect(musicBus);
    T.wetFader.connect(hallSend);
    T.nodes.push(T.fader, T.wetFader);
    if (def.echo) buildEcho(T, def.echo);
    T.song = buildSong(name, def, 0);
    return T;
  }

  // dur = time to get within ~2% of the target
  function fadeTrack(T, to, at, dur) {
    glide(T.smDry, to, dur / 4, at);
    glide(T.smWet, to, dur / 4, at);
  }

  function stopTrack(T, now) {
    if (!T.alive) return;
    T.alive = false;
    fadeTrack(T, 0, now, XFADE);
    T.endAt = now + XFADE + 0.05;
    T.killAt = T.endAt + 4.5; // let reverb / echo / release tails ring out
  }

  function disposeTrack(T) {
    for (const k in T.chans) if (T.chans[k]) disconnectAll(T.chans[k].nodes);
    disconnectAll(T.nodes);
    T.chans = Object.create(null);
    T.nodes.length = 0;
  }

  function playEvent(T, e, t) {
    let c = T.chans[e.i];
    if (c === undefined) c = makeChan(T, e.i);
    if (!c) return;
    try { c.fn(c, t, e, T.sd); } catch (err) { warn(err); }
  }

  function runTrack(T, now) {
    const horizon = now + LOOKAHEAD;
    let guard = 0;
    while (T.next < horizon && T.next < T.endAt && guard++ < 4096) {
      const S = T.song;
      const idx = T.pos;
      if (T.next >= now - 0.03 && volMusic > 0.001) {
        const evs = S.ev[idx];
        if (evs) {
          const tt = T.next + ((idx & 1) ? T.swing : 0);
          for (let i = 0; i < evs.length; i++) playEvent(T, evs[i], tt);
        }
      }
      T.next += T.sd;
      T.pos++;
      if (T.pos >= S.total) {
        T.loop++;
        try { T.song = buildSong(T.name, T.def, T.loop); } catch (err) { warn(err); }
        T.pos = T.song.loopStep;
      }
    }
  }

  function tick() {
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (duckActive && now >= duckUntil) {
        duckActive = false;
        duckLevel = 1;
        glide(smDuck, 1, 0.18, now);
      }
      for (let i = tracks.length - 1; i >= 0; i--) {
        const T = tracks[i];
        if (!T.alive && now >= T.killAt) {
          disposeTrack(T);
          tracks.splice(i, 1);
          continue;
        }
        runTrack(T, now);
      }
      for (let i = voices.length - 1; i >= 0; i--) {
        const v = voices[i];
        if (now > v.end + v.tail) {
          v.dispose();
          perName[v.name] = Math.max(0, (perName[v.name] || 1) - 1);
          voices.splice(i, 1);
        }
      }
    } catch (e) { warn(e); }
  }

  function music(track) {
    try {
      let name = null;
      if (track) {
        if (!TRACKS[track]) { warn(new Error('traccia sconosciuta: ' + track)); return; }
        name = track;
      }
      if (!ctx) { pendingTrack = name; return; }
      if (current && current.alive && current.name === name) return;
      const now = ctx.currentTime;
      if (current) { stopTrack(current, now); current = null; }
      let crossfade = false; // fade in slowly if anything is still audible (incl. a track fading out)
      for (let i = 0; i < tracks.length; i++) if (now < tracks[i].endAt) crossfade = true;
      if (!name) return;
      const T = createTrack(name, now + 0.06);
      fadeTrack(T, T.level, now, crossfade ? XFADE : 0.1);
      tracks.push(T);
      current = T;
      startTimer();
      runTrack(T, now);
    } catch (e) { warn(e); }
  }

  /* ================================================================ public */
  function setVolumes(m, s) {
    if (isNum(m)) volMusic = clamp(m, 0, 1);
    if (isNum(s)) volSfx = clamp(s, 0, 1);
    if (!ctx) return;
    try {
      if (Math.abs(smMusic.to - volCurve(volMusic) * MUSIC_BASE) > 1e-6) glide(smMusic, volCurve(volMusic) * MUSIC_BASE, 0.05);
      if (Math.abs(smSfx.to - volCurve(volSfx) * SFX_BASE) > 1e-6) glide(smSfx, volCurve(volSfx) * SFX_BASE, 0.05);
    } catch (e) { warn(e); }
  }

  function suspend() {
    if (!ctx) return;
    userSuspended = true;
    stopTimer();
    try {
      const p = ctx.suspend();
      if (p && p.catch) p.catch(noop);
    } catch (e) { /* ignore */ }
  }

  function resume() {
    if (!ctx) return;
    userSuspended = false;
    kick();
    startTimer();
  }

  function duck(amount, seconds) {
    if (!ctx) return;
    try {
      amount = isNum(amount) ? clamp(amount, 0, 1) : 0.5;
      seconds = isNum(seconds) ? clamp(seconds, 0.05, 30) : 1;
      const now = ctx.currentTime;
      let lvl = Math.max(0.0001, 1 - amount);
      let until = now + seconds;
      if (now < duckUntil) { lvl = Math.min(lvl, duckLevel); until = Math.max(until, duckUntil); }
      duckLevel = lvl;
      duckUntil = until;
      duckActive = true;
      glide(smDuck, lvl, 0.03, now); // released by tick() once duckUntil has passed
      startTimer();
    } catch (e) { warn(e); }
  }

  // Some WebViews only start output on specific gesture types (touchend / click):
  // after init(), keep nudging a suspended context on those events.
  function onGesture() {
    if (ctx && !userSuspended && ctx.state !== 'running') kick();
  }
  try {
    const evs = ['touchend', 'pointerup', 'mousedown', 'keydown', 'click'];
    for (let i = 0; i < evs.length; i++) W.addEventListener(evs[i], onGesture, { capture: true, passive: true });
  } catch (e) { /* no DOM events */ }

  SK.Audio = {
    init,
    sfx,
    music,
    setVolumes,
    suspend,
    resume,
    duck,
    track: () => (current ? current.name : pendingTrack),
    get ready() { return !!ctx; },
    names: Object.keys(SFX),
    tracks: Object.keys(TRACKS),
  };
})(window.SK);
