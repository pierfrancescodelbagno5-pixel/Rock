/* Slime Reborn — core engine: utils, events, canvas, camera, time, input, save, loop. */
window.SK = window.SK || {};
(function (SK) {
  'use strict';

  /* ------------------------------------------------------------------ utils */
  const TAU = Math.PI * 2;
  let uidCounter = 1;
  const hexCache = new Map();

  const U = (SK.util = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    invLerp: (a, b, v) => (b === a ? 0 : (v - a) / (b - a)),
    remap: (v, a, b, c, d) => c + (d - c) * ((v - a) / (b - a || 1)),
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    choice: (arr) => arr[(Math.random() * arr.length) | 0],
    weighted(arr, weightFn) {
      let total = 0;
      for (const it of arr) total += Math.max(0, weightFn(it));
      if (total <= 0) return arr[0];
      let r = Math.random() * total;
      for (const it of arr) {
        r -= Math.max(0, weightFn(it));
        if (r <= 0) return it;
      }
      return arr[arr.length - 1];
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay),
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    angleDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    lerpAngle: (a, b, t) => a + U.angleDiff(a, b) * t,
    approach: (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target)),
    damp: (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt)),
    ease: {
      outCubic: (t) => 1 - Math.pow(1 - t, 3),
      inCubic: (t) => t * t * t,
      inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
      outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
      outQuad: (t) => 1 - (1 - t) * (1 - t),
      inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    },
    hexToRgb(hex) {
      let c = hexCache.get(hex);
      if (c) return c;
      let h = String(hex).replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h.slice(0, 6), 16) || 0;
      c = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      hexCache.set(hex, c);
      return c;
    },
    rgba(hex, a) {
      const c = U.hexToRgb(hex);
      return `rgba(${c.r},${c.g},${c.b},${a})`;
    },
    mix(a, b, t) {
      const A = U.hexToRgb(a), B = U.hexToRgb(b);
      const h = (v) => Math.round(v).toString(16).padStart(2, '0');
      return '#' + h(A.r + (B.r - A.r) * t) + h(A.g + (B.g - A.g) * t) + h(A.b + (B.b - A.b) * t);
    },
    fmtTime(sec) {
      sec = Math.max(0, Math.floor(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + String(s).padStart(2, '0');
    },
    fmtNum(n) {
      n = Math.round(n);
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
      return String(n);
    },
    uid: () => uidCounter++,
  });

  /* ----------------------------------------------------------------- events */
  const listeners = new Map();
  SK.events = {
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    off(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    emit(name, data) {
      const set = listeners.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(data); } catch (e) { console.error('[event ' + name + ']', e); }
      }
    },
  };

  /* ------------------------------------------------------------------ debug */
  const qs = new URLSearchParams(location.search);
  SK.debug = {
    enabled: qs.has('debug'),
    autoplay: qs.has('autoplay'),
    speed: Math.max(0.1, parseFloat(qs.get('speed')) || 1),
    godmode: qs.has('god'),
    startBiome: Math.max(0, Math.min(3, parseInt(qs.get('biome'), 10) || 0)),
    fps: 60,
  };

  /* ------------------------------------------------------------------- save */
  const SAVE_KEY = 'slimeReborn.save.v1';
  function defaultSave() {
    return {
      version: 1,
      souls: 0,
      totalSouls: 0,
      upgrades: {},
      best: { time: 0, kills: 0, level: 0, biome: 0, score: 0 },
      runs: 0,
      wins: 0,
      bestiary: {},
      skillsFound: {},
      achievements: {},
      nightmare: false,
      character: { name: 'Pierfrancesco', race: 'slime', cls: 'pierfrancesco', color: '#4fc3ff' },
      nation: { companions: {}, citizens: [], rings: 0, activeCompanion: null, weddings: 0 },
      settings: { music: 0.6, sfx: 0.8, vibration: true, quality: 'high', showFps: false },
    };
  }
  function mergeDeep(base, extra) {
    if (!extra || typeof extra !== 'object') return base;
    for (const k of Object.keys(extra)) {
      const v = extra[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') mergeDeep(base[k], v);
      else base[k] = v;
    }
    return base;
  }
  SK.save = {
    data: defaultSave(),
    load() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) this.data = mergeDeep(defaultSave(), JSON.parse(raw));
      } catch (e) {
        this.data = defaultSave();
      }
      return this.data;
    },
    write() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
    },
    reset() {
      const settings = this.data.settings;
      this.data = defaultSave();
      this.data.settings = settings;
      this.write();
    },
  };

  /* ---------------------------------------------------------------- haptics */
  SK.vibrate = function (pattern) {
    if (!SK.save.data.settings.vibration) return;
    try {
      if (window.SKNative && typeof window.SKNative.vibrate === 'function') {
        window.SKNative.vibrate(Array.isArray(pattern) ? pattern[0] : pattern);
      } else if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (e) { /* ignore */ }
  };

  /* ----------------------------------------------------------------- canvas */
  SK.canvas = document.getElementById('game');
  SK.ctx = SK.canvas.getContext('2d', { alpha: false, desynchronized: true });
  SK.W = window.innerWidth;
  SK.H = window.innerHeight;
  SK.DPR = 1;
  SK.quality = 'high';

  SK.resize = function () {
    SK.W = Math.max(1, window.innerWidth);
    SK.H = Math.max(1, window.innerHeight);
    const maxDpr = SK.quality === 'low' ? 1 : SK.quality === 'medium' ? 1.5 : 2;
    SK.DPR = Math.min(window.devicePixelRatio || 1, maxDpr);
    SK.canvas.width = Math.round(SK.W * SK.DPR);
    SK.canvas.height = Math.round(SK.H * SK.DPR);
    SK.canvas.style.width = SK.W + 'px';
    SK.canvas.style.height = SK.H + 'px';
    SK.input.layout();
    SK.events.emit('resize', { w: SK.W, h: SK.H });
  };
  SK.setQuality = function (q) {
    SK.quality = q === 'low' || q === 'medium' ? q : 'high';
    SK.resize();
  };

  /* ----------------------------------------------------------------- camera */
  const cam = (SK.cam = {
    x: 0, y: 0, zoom: 1, zoomMul: 1,
    shakeI: 0, shakeT: 0, shakeDur: 0, ox: 0, oy: 0, kickX: 0, kickY: 0,
    view: { x0: 0, y0: 0, x1: 0, y1: 0 },
    baseZoom() {
      return Math.min(SK.W, SK.H) / 620;
    },
    updateView() {
      this.zoom = this.baseZoom() * this.zoomMul;
      const hw = SK.W / 2 / this.zoom, hh = SK.H / 2 / this.zoom;
      this.view.x0 = this.x - hw; this.view.x1 = this.x + hw;
      this.view.y0 = this.y - hh; this.view.y1 = this.y + hh;
    },
    snap(x, y) { this.x = x; this.y = y; this.updateView(); },
    follow(tx, ty, dt) {
      this.x = U.damp(this.x, tx, 6, dt);
      this.y = U.damp(this.y, ty, 6, dt);
      // shake (uses real time so it still decays during hitstop)
      const rdt = SK.time.rawDt;
      if (this.shakeT > 0) {
        this.shakeT = Math.max(0, this.shakeT - rdt);
        const k = this.shakeDur > 0 ? this.shakeT / this.shakeDur : 0;
        const a = this.shakeI * k * k;
        this.ox = (Math.random() * 2 - 1) * a;
        this.oy = (Math.random() * 2 - 1) * a;
      } else { this.ox = this.oy = 0; this.shakeI = 0; }
      this.kickX = U.damp(this.kickX, 0, 14, rdt);
      this.kickY = U.damp(this.kickY, 0, 14, rdt);
      this.updateView();
    },
    shake(intensity, duration = 0.3) {
      if (intensity >= this.shakeI * (this.shakeDur > 0 ? this.shakeT / this.shakeDur : 0)) {
        this.shakeI = Math.min(30, intensity);
        this.shakeDur = this.shakeT = duration;
      }
    },
    kick(dx, dy) { this.kickX += dx; this.kickY += dy; },
    begin(ctx) {
      ctx.save();
      ctx.translate(SK.W / 2, SK.H / 2);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x + this.ox + this.kickX, -this.y + this.oy + this.kickY);
    },
    end(ctx) { ctx.restore(); },
    toScreen(wx, wy) {
      return { x: (wx - this.x + this.ox + this.kickX) * this.zoom + SK.W / 2, y: (wy - this.y + this.oy + this.kickY) * this.zoom + SK.H / 2 };
    },
    toWorld(sx, sy) {
      return { x: (sx - SK.W / 2) / this.zoom + this.x, y: (sy - SK.H / 2) / this.zoom + this.y };
    },
    inView(x, y, margin = 0) {
      const v = this.view;
      return x > v.x0 - margin && x < v.x1 + margin && y > v.y0 - margin && y < v.y1 + margin;
    },
  });

  /* ------------------------------------------------------------------- time */
  SK.time = {
    t: 0, gameT: 0, rawDt: 0, dt: 0,
    scale: SK.debug.speed,
    hitstopT: 0, slowT: 0, slowScale: 1,
    hitstop(seconds) { this.hitstopT = Math.max(this.hitstopT, Math.min(0.15, seconds)); },
    slowmo(factor, seconds) { this.slowScale = factor; this.slowT = Math.max(this.slowT, seconds); },
    tick(raw) {
      this.rawDt = raw;
      this.t += raw;
      let dt = raw * this.scale;
      if (this.hitstopT > 0) { this.hitstopT -= raw; dt = 0; }
      if (this.slowT > 0) { this.slowT -= raw; dt *= this.slowScale; if (this.slowT <= 0) this.slowScale = 1; }
      this.dt = dt;
      this.gameT += dt;
      return dt;
    },
  };

  /* ------------------------------------------------------------------ input */
  const KEYMAP = {
    Space: 'dash', KeyE: 'absorb', ShiftLeft: 'absorb', ShiftRight: 'absorb',
    Digit1: 's1', KeyJ: 's1', Digit2: 's2', KeyK: 's2', Digit3: 's3', KeyL: 's3',
    KeyF: 'name', KeyN: 'name', Escape: 'pause', KeyP: 'pause',
  };
  const MOVEKEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  };
  const JOY_R = 62;
  const input = (SK.input = {
    enabled: true,
    move: { x: 0, y: 0 },
    down: {}, pressed: {}, released: {},
    keys: {},
    joy: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, r: JOY_R },
    buttons: [
      { id: 'absorb', x: 0, y: 0, r: 46, visible: true, enabled: true, down: false, icon: 'absorb', pid: -1 },
      { id: 'dash', x: 0, y: 0, r: 33, visible: true, enabled: true, down: false, icon: 'dash', pid: -1 },
      { id: 's1', x: 0, y: 0, r: 30, visible: true, enabled: true, down: false, icon: null, pid: -1 },
      { id: 's2', x: 0, y: 0, r: 30, visible: true, enabled: true, down: false, icon: null, pid: -1 },
      { id: 's3', x: 0, y: 0, r: 30, visible: true, enabled: true, down: false, icon: null, pid: -1 },
      { id: 'name', x: 0, y: 0, r: 30, visible: false, enabled: true, down: false, icon: 'name', pid: -1 },
      { id: 'pause', x: 0, y: 0, r: 22, visible: true, enabled: true, down: false, icon: 'pause', pid: -1 },
    ],
    botMove: null,
    botDown: null,
    lastPointerType: 'mouse',
    touchUsed: false,
    button(id) { return this.buttons.find((b) => b.id === id); },
    layout() {
      const W = SK.W, H = SK.H;
      const s = U.clamp(Math.min(W, H) / 400, 0.8, 1.35); // scale buttons for tablets
      const cx = W - 92 * s, cy = H - 92 * s;
      const ring = 112 * s;
      const place = (id, ang, r) => {
        const b = this.button(id);
        b.r = r * s;
        b.x = cx + Math.cos(ang) * ring;
        b.y = cy + Math.sin(ang) * ring;
      };
      const ab = this.button('absorb');
      ab.x = cx; ab.y = cy; ab.r = 46 * s;
      const d = Math.PI / 180;
      place('dash', 180 * d, 33);
      place('s1', 217 * d, 30);
      place('s2', 253 * d, 30);
      place('s3', 289 * d, 30);
      const nb = this.button('name');
      nb.r = 30 * s; nb.x = cx - ring - 78 * s; nb.y = cy - 6 * s;
      const pb = this.button('pause');
      pb.r = 22 * s; pb.x = W - 34 * s; pb.y = 34 * s;
      this.joy.r = JOY_R * s;
    },
    hitButton(x, y) {
      let best = null, bd = Infinity;
      for (const b of this.buttons) {
        if (!b.visible) continue;
        const d = Math.hypot(x - b.x, y - b.y);
        if (d < b.r * 1.3 && d < bd) { best = b; bd = d; }
      }
      return best;
    },
    setDown(id, v) {
      if (v && !this.down[id]) this.pressed[id] = true;
      if (!v && this.down[id]) this.released[id] = true;
      this.down[id] = v;
    },
    recompute() {
      // keyboard vector
      let kx = 0, ky = 0;
      for (const code in MOVEKEYS) if (this.keys[code]) { kx += MOVEKEYS[code][0]; ky += MOVEKEYS[code][1]; }
      let mx = 0, my = 0;
      if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
      if (this.joy.active) {
        const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy;
        const l = Math.hypot(dx, dy);
        const dead = 6;
        if (l > dead) {
          const m = Math.min(1, (l - dead) / (this.joy.r - dead));
          mx = (dx / l) * m; my = (dy / l) * m;
        }
      }
      this.move.x = mx; this.move.y = my;
    },
    endFrame() {
      this.pressed = {};
      this.released = {};
    },
    clear() {
      for (const b of this.buttons) { b.down = false; b.pid = -1; }
      this.keys = {};
      for (const k in this.down) if (this.down[k]) this.released[k] = true;
      this.down = {};
      this.joy.active = false; this.joy.id = -1;
      this.recompute();
    },
    applyBot() {
      if (!this.botMove && !this.botDown) return;
      if (this.botMove) { this.move.x = this.botMove.x; this.move.y = this.botMove.y; }
      if (this.botDown) for (const id in this.botDown) this.setDown(id, !!this.botDown[id]);
    },
  });

  function onPointerDown(e) {
    input.lastPointerType = e.pointerType || 'mouse';
    if (e.pointerType === 'touch') input.touchUsed = true;
    SK.events.emit('gesture');
    if (!input.enabled) return;
    const x = e.clientX, y = e.clientY;
    const b = input.hitButton(x, y);
    if (b && b.enabled) {
      b.down = true; b.pid = e.pointerId;
      input.setDown(b.id, true);
      if (b.id !== 'pause') SK.vibrate(8);
    } else if (!input.joy.active) {
      input.joy.active = true; input.joy.id = e.pointerId;
      input.joy.ox = input.joy.x = x; input.joy.oy = input.joy.y = y;
    }
    input.recompute();
    try { SK.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (input.joy.active && e.pointerId === input.joy.id) {
      input.joy.x = e.clientX; input.joy.y = e.clientY;
      // drag the origin along when the finger goes beyond the radius (more forgiving)
      const dx = input.joy.x - input.joy.ox, dy = input.joy.y - input.joy.oy;
      const l = Math.hypot(dx, dy), max = input.joy.r * 1.25;
      if (l > max) { input.joy.ox = input.joy.x - (dx / l) * max; input.joy.oy = input.joy.y - (dy / l) * max; }
      input.recompute();
    }
  }
  function onPointerUp(e) {
    if (input.joy.active && e.pointerId === input.joy.id) { input.joy.active = false; input.joy.id = -1; }
    for (const b of input.buttons) {
      if (b.pid === e.pointerId) { b.down = false; b.pid = -1; input.setDown(b.id, false); }
    }
    input.recompute();
  }
  SK.canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  SK.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    SK.events.emit('gesture');
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (MOVEKEYS[e.code]) { input.keys[e.code] = true; input.recompute(); e.preventDefault(); }
    const id = KEYMAP[e.code];
    if (id) {
      if (!e.repeat) input.setDown(id, true);
      e.preventDefault();
    }
    SK.events.emit('key', e);
  });
  window.addEventListener('keyup', (e) => {
    if (MOVEKEYS[e.code]) { input.keys[e.code] = false; input.recompute(); }
    const id = KEYMAP[e.code];
    if (id) input.setDown(id, false);
  });
  window.addEventListener('blur', () => input.clear());

  /* ------------------------------------------------------------------- loop */
  SK.loop = {
    running: false,
    last: 0,
    fpsAcc: 0, fpsFrames: 0,
    start(update, render) {
      this.update = update; this.render = render;
      if (this.running) return;
      this.running = true;
      this.last = performance.now();
      const frame = (ts) => {
        if (!this.running) return;
        let raw = (ts - this.last) / 1000;
        this.last = ts;
        if (!(raw > 0)) raw = 0;
        if (raw > 0.1) raw = 0.1; // tab switch / hiccup
        const step = Math.min(raw, 1 / 30);
        this.fpsAcc += raw; this.fpsFrames++;
        if (this.fpsAcc >= 0.5) { SK.debug.fps = Math.round(this.fpsFrames / this.fpsAcc); this.fpsAcc = 0; this.fpsFrames = 0; }
        input.applyBot();
        // at high debug speeds run several sub-steps so physics stay stable
        const subs = Math.max(1, Math.ceil(SK.time.scale / 2));
        for (let i = 0; i < subs; i++) {
          SK.time.scale /= subs;
          const dt = SK.time.tick(step);
          SK.time.scale *= subs;
          try { this.update(dt, step); } catch (e) { console.error(e); }
          if (i < subs - 1) input.endFrame();
        }
        try {
          SK.ctx.setTransform(SK.DPR, 0, 0, SK.DPR, 0, 0);
          this.render(SK.ctx);
        } catch (e) { console.error(e); }
        input.endFrame();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
  };

  document.addEventListener('visibilitychange', () => {
    SK.events.emit(document.hidden ? 'hidden' : 'visible');
    if (document.hidden) input.clear();
  });
  window.addEventListener('resize', () => SK.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => SK.resize(), 200));
})(window.SK);
