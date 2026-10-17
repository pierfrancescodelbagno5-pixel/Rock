/* Slime Reborn — SK.FX: the juice engine.
 *
 * Pooled particles (circle / spark / square / star / drop / ring, plus internal
 * glow / smoke / plus shapes), cached glow sprites, shockwave rings, lightning,
 * slash crescents, floating damage text, afterimage trails, god-rays, light
 * columns, biome ambient life and screen-space post effects (flashes,
 * vignettes, low-HP heartbeat, colour grading).
 *
 * Performance rules honoured here: no shadowBlur / ctx.filter anywhere, glows
 * are cached radial-gradient canvases drawn with 'lighter', every hot-path
 * object comes from a preallocated pool, colour-over-life uses cached colour
 * ramps (no per-frame string building), counts scale with SK.quality.
 */
(function (SK) {
  'use strict';

  const U = SK.util;
  const E = U.ease;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const HALF_PI = Math.PI / 2;
  const SQ12 = Math.SQRT1_2;
  const EMPTY = Object.freeze({});
  const rand = Math.random;
  const cos = Math.cos;
  const sin = Math.sin;

  const inQuad = (t) => t * t;
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const smooth = (t) => t * t * (3 - 2 * t);

  /* ------------------------------------------------------------- quality */
  const PARTICLE_CAP = [350, 700, 1200];
  const COUNT_MUL = [0.5, 0.7, 1];
  const AMBIENT_MAX = [22, 40, 60];
  const VIGNETTE_BASE = [0.42, 0.5, 0.56];

  function qi() {
    const q = SK.quality;
    return q === 'low' ? 0 : q === 'medium' ? 1 : 2;
  }
  /** Scale a requested particle count by quality, keeping at least 1. */
  function scaleCount(n) {
    n = +n || 0;
    if (n <= 0) return 0;
    const m = n * COUNT_MUL[qi()];
    const f = Math.floor(m);
    return Math.max(1, f + (rand() < m - f ? 1 : 0));
  }
  function lo(v, d) {
    if (v == null) return d;
    if (typeof v === 'number') return v;
    return v[0] != null ? v[0] : d;
  }
  function hi(v, d) {
    if (v == null) return d;
    if (typeof v === 'number') return v;
    return v[1] != null ? v[1] : v[0] != null ? v[0] : d;
  }
  function between(a, b) {
    return a + rand() * (b - a);
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  /* -------------------------------------------------------------- colour */
  const colorCache = new Map();
  const RGB_RE = /rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i;
  let probeCtx = null;

  function hex2(v) {
    const s = v.toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  /** Any CSS colour -> {r,g,b,key:'#rrggbb',css:'rgb()',lum}. Cached. */
  function parseColor(c) {
    if (c == null || c === '') c = '#ffffff';
    let o = colorCache.get(c);
    if (o) return o;
    let r = 255, g = 255, b = 255;
    const s = String(c).trim();
    if (s[0] === '#') {
      const h = U.hexToRgb(s);
      r = h.r; g = h.g; b = h.b;
    } else {
      let m = RGB_RE.exec(s);
      if (!m) {
        try {
          if (!probeCtx) probeCtx = makeCanvas(1, 1).getContext('2d');
          if (probeCtx) {
            probeCtx.fillStyle = '#ffffff';
            probeCtx.fillStyle = s;
            const n = String(probeCtx.fillStyle);
            if (n[0] === '#') {
              const h = U.hexToRgb(n);
              r = h.r; g = h.g; b = h.b;
            } else m = RGB_RE.exec(n);
          }
        } catch (e) { /* unknown colour: white */ }
      }
      if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
    }
    r = Math.round(U.clamp(r || 0, 0, 255));
    g = Math.round(U.clamp(g || 0, 0, 255));
    b = Math.round(U.clamp(b || 0, 0, 255));
    o = {
      r, g, b,
      key: '#' + hex2(r) + hex2(g) + hex2(b),
      css: 'rgb(' + r + ',' + g + ',' + b + ')',
      lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255,
    };
    if (colorCache.size > 600) colorCache.clear();
    colorCache.set(c, o);
    return o;
  }
  function rgbaOf(o, a) {
    return 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + a + ')';
  }
  /** rgba() string of colour o blended toward white by t. */
  function lightRgba(o, t, a) {
    return 'rgba(' + Math.round(o.r + (255 - o.r) * t) + ',' + Math.round(o.g + (255 - o.g) * t) + ',' +
      Math.round(o.b + (255 - o.b) * t) + ',' + a + ')';
  }
  /** '#rrggbb' mix of two colours. */
  function mixKey(c1, c2, t) {
    const A = parseColor(c1), B = parseColor(c2);
    return '#' + hex2(Math.round(A.r + (B.r - A.r) * t)) + hex2(Math.round(A.g + (B.g - A.g) * t)) +
      hex2(Math.round(A.b + (B.b - A.b) * t));
  }

  /* Colour-over-life ramps: arrays of 16 precomputed css strings (or 1 when
   * start === end) so the render loop only indexes, never builds strings. */
  const RAMP_STEPS = 16;
  const rampCache = new Map();
  function rampFor(c0, c1) {
    const a = parseColor(c0), b = parseColor(c1 == null ? c0 : c1);
    let m = rampCache.get(a.key);
    if (!m) {
      if (rampCache.size > 256) rampCache.clear();
      m = new Map();
      rampCache.set(a.key, m);
    }
    let r = m.get(b.key);
    if (!r) {
      if (a.key === b.key) r = [a.css];
      else {
        r = new Array(RAMP_STEPS);
        for (let i = 0; i < RAMP_STEPS; i++) {
          const t = i / (RAMP_STEPS - 1);
          r[i] = 'rgb(' + Math.round(a.r + (b.r - a.r) * t) + ',' + Math.round(a.g + (b.g - a.g) * t) + ',' +
            Math.round(a.b + (b.b - a.b) * t) + ')';
        }
      }
      m.set(b.key, r);
    }
    return r;
  }
  function rampAt(ramp, t) {
    const n = ramp.length - 1;
    return n ? ramp[(t * n + 0.5) | 0] : ramp[0];
  }

  /* -------------------------------------------------------- glow sprites */
  const GLOW_MAX_R = 320;
  const BUCKETS = [];
  (function buildBuckets() {
    let r = 2;
    while (r < GLOW_MAX_R) {
      const ri = Math.round(r);
      if (!BUCKETS.length || ri > BUCKETS[BUCKETS.length - 1]) BUCKETS.push(ri);
      r *= 1.1;
    }
    BUCKETS.push(GLOW_MAX_R);
  })();
  const BUCKET_OF = new Uint8Array(GLOW_MAX_R + 1);
  (function buildBucketLut() {
    let k = 0;
    for (let r = 0; r <= GLOW_MAX_R; r++) {
      while (k < BUCKETS.length - 1 && Math.abs(BUCKETS[k + 1] - r) <= Math.abs(BUCKETS[k] - r)) k++;
      BUCKET_OF[r] = k;
    }
  })();
  function bucketIndex(radius) {
    let r = radius > 1 ? Math.round(radius) : 1;
    if (r > GLOW_MAX_R) r = GLOW_MAX_R;
    return BUCKET_OF[r];
  }

  const SPR_GLOW = 0, SPR_HOT = 1, SPR_SOFT = 2;
  const spriteMaps = [new Map(), new Map(), new Map()];
  const SPRITE_LIMIT = 200;
  let spriteCount = 0;
  let spriteStamp = 0;

  function buildSprite(kind, pc, R) {
    const size = R * 2;
    const c = makeCanvas(size, size);
    const g = c.getContext('2d');
    if (!g) return c;
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    if (kind === SPR_HOT) {
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.08, lightRgba(pc, 0.6, 0.95));
      grad.addColorStop(0.2, rgbaOf(pc, 0.62));
      grad.addColorStop(0.38, rgbaOf(pc, 0.3));
      grad.addColorStop(0.58, rgbaOf(pc, 0.12));
      grad.addColorStop(0.78, rgbaOf(pc, 0.035));
      grad.addColorStop(1, rgbaOf(pc, 0));
    } else if (kind === SPR_SOFT) {
      grad.addColorStop(0, rgbaOf(pc, 0.85));
      grad.addColorStop(0.3, rgbaOf(pc, 0.62));
      grad.addColorStop(0.6, rgbaOf(pc, 0.25));
      grad.addColorStop(0.85, rgbaOf(pc, 0.06));
      grad.addColorStop(1, rgbaOf(pc, 0));
    } else {
      // smooth quasi-gaussian falloff
      grad.addColorStop(0, rgbaOf(pc, 1));
      grad.addColorStop(0.1, rgbaOf(pc, 0.85));
      grad.addColorStop(0.24, rgbaOf(pc, 0.55));
      grad.addColorStop(0.42, rgbaOf(pc, 0.28));
      grad.addColorStop(0.6, rgbaOf(pc, 0.12));
      grad.addColorStop(0.8, rgbaOf(pc, 0.035));
      grad.addColorStop(1, rgbaOf(pc, 0));
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  /** Evict the least recently used colour family (never `keep`). */
  function evictSprites(keep) {
    let best = null, bestMap = null;
    for (let k = 0; k < 3; k++) {
      for (const e of spriteMaps[k].values()) {
        if (e !== keep && (!best || e.use < best.use)) { best = e; bestMap = spriteMaps[k]; }
      }
    }
    if (best) {
      bestMap.delete(best.key);
      spriteCount -= best.n;
      return true;
    }
    if (keep && keep.n > 0) {
      for (let i = 0; i < keep.list.length; i++) {
        if (keep.list[i]) { keep.list[i] = null; keep.n--; spriteCount--; }
      }
    }
    return false;
  }

  function getSprite(kind, color, radius) {
    const pc = parseColor(color);
    const map = spriteMaps[kind];
    let e = map.get(pc.key);
    if (!e) {
      e = { key: pc.key, list: new Array(BUCKETS.length).fill(null), n: 0, use: 0 };
      map.set(pc.key, e);
    }
    e.use = ++spriteStamp;
    const bi = bucketIndex(radius);
    let spr = e.list[bi];
    if (!spr) {
      while (spriteCount >= SPRITE_LIMIT && evictSprites(e)) { /* evict LRU families */ }
      spr = buildSprite(kind, pc, BUCKETS[bi]);
      e.list[bi] = spr;
      e.n++;
      spriteCount++;
    }
    return spr;
  }

  /** Cached radial glow canvas (width = height = 2 × quantised radius). */
  function glowSprite(color, radius, hot) {
    return getSprite(hot ? SPR_HOT : SPR_GLOW, color, radius);
  }

  /** Additive glow centred at x,y with exact radius; multiplies ctx alpha. */
  function drawGlow(ctx, x, y, radius, color, alpha) {
    if (!ctx || !(radius > 0)) return;
    const a = alpha == null ? 1 : alpha;
    if (!(a > 0.003)) return;
    const spr = getSprite(SPR_GLOW, color, radius);
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * (a > 1 ? 1 : a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(spr, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }

  /* ----------------------------------------------- generic small pools */
  function SmallPool(make, n) {
    this.free = [];
    this.act = [];
    this.rr = 0;
    for (let i = 0; i < n; i++) this.free.push(make());
  }
  SmallPool.prototype.get = function () {
    if (this.free.length) {
      const o = this.free.pop();
      this.act.push(o);
      return o;
    }
    if (!this.act.length) return null;
    this.rr = (this.rr + 1) % this.act.length;
    return this.act[this.rr]; // recycle in place
  };
  SmallPool.prototype.kill = function (i) {
    const a = this.act;
    const o = a[i];
    a[i] = a[a.length - 1];
    a.pop();
    this.free.push(o);
  };
  SmallPool.prototype.clear = function () {
    while (this.act.length) this.free.push(this.act.pop());
  };

  /* ============================================================ PARTICLES */
  const SH_CIRCLE = 0, SH_SPARK = 1, SH_SQUARE = 2, SH_STAR = 3, SH_DROP = 4, SH_RING = 5,
    SH_GLOW = 6, SH_SMOKE = 7, SH_PLUS = 8;
  const SHAPE_IDS = {
    circle: SH_CIRCLE, spark: SH_SPARK, square: SH_SQUARE, star: SH_STAR, drop: SH_DROP,
    ring: SH_RING, glow: SH_GLOW, smoke: SH_SMOKE, plus: SH_PLUS,
  };

  function Particle() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.age = 0; this.max = 1;
    this.s0 = 1; this.s1 = 0; this.smode = 0;
    this.ramp = null; this.shape = 0; this.add = false;
    this.glow = null; this.gm = 3; this.ga = 0.55; this.spr = null;
    this.drag = 0; this.grav = 0; this.rot = 0; this.vrot = 0;
    this.alpha = 1; this.fo = 2.2; this.fin = 0; this.flick = 0; this.ph = 0;
    this.stretch = 1; this.m = 30;
  }

  const POOL_SIZE = 1500;
  const pFree = [];
  const pAct = [];
  for (let i = 0; i < POOL_SIZE; i++) pFree.push(new Particle());
  let pSteal = 0;

  function allocP() {
    const cap = PARTICLE_CAP[qi()];
    if (pAct.length < cap && pFree.length) {
      const p = pFree.pop();
      pAct.push(p);
      return p;
    }
    if (!pAct.length) return null;
    pSteal = (pSteal + 1) % pAct.length;
    return pAct[pSteal]; // saturated: recycle an existing particle in place
  }

  function spawnP(x, y, vx, vy, life, s0, s1, ramp, shape, add) {
    const p = allocP();
    if (!p) return null;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.age = 0; p.max = life > 0.016 ? life : 0.016;
    p.s0 = s0 > 0 ? s0 : 0; p.s1 = s1 > 0 ? s1 : 0; p.smode = 0;
    p.ramp = ramp; p.shape = shape; p.add = add;
    p.glow = null; p.gm = 3.2; p.ga = 0.55; p.spr = null;
    p.drag = 0; p.grav = 0; p.rot = 0; p.vrot = 0;
    p.alpha = 1; p.fo = 2.2; p.fin = 0; p.flick = 0; p.ph = rand() * TAU;
    p.stretch = 1;
    p.m = (p.s0 > p.s1 ? p.s0 : p.s1) * 6 + 30;
    return p;
  }

  const scratchRamps = [];
  const scratchGlows = [];
  const scratchSprs = [];

  /**
   * burst(x, y, opts) — contract §5.2 plus extensions:
   * colorEnd, add, alpha, sizeEnd (multiplier of start size), sizeMode
   * ('linear'|'bell'|'grow'), radius (spawn disc), spin, stretch, flicker,
   * fadeIn, glowSize, glowAlpha, vx/vy (inherited velocity).
   */
  function burst(x, y, opts) {
    const o = opts || EMPTY;
    const count = scaleCount(o.count == null ? 12 : o.count);
    if (!count) return;
    const shape = SHAPE_IDS[o.shape] != null ? SHAPE_IDS[o.shape] : SH_CIRCLE;
    const glow = !!o.glow;
    const endC = o.colorEnd || o.endColor || null;
    const colors = o.colors && o.colors.length ? o.colors : null;
    let nc = 0;
    if (colors) {
      for (let i = 0; i < colors.length && i < 16; i++) {
        scratchRamps[nc] = rampFor(colors[i], endC || colors[i]);
        scratchGlows[nc] = glow ? getSprite(SPR_GLOW, colors[i], 24) : null;
        scratchSprs[nc] = shape === SH_GLOW ? getSprite(SPR_HOT, colors[i], 48)
          : shape === SH_SMOKE ? getSprite(SPR_SOFT, colors[i], 48) : null;
        nc++;
      }
    } else {
      const c = o.color || '#ffffff';
      scratchRamps[0] = rampFor(c, endC || c);
      scratchGlows[0] = glow ? getSprite(SPR_GLOW, c, 24) : null;
      scratchSprs[0] = shape === SH_GLOW ? getSprite(SPR_HOT, c, 48)
        : shape === SH_SMOKE ? getSprite(SPR_SOFT, c, 48) : null;
      nc = 1;
    }
    const spMin = lo(o.speed, 60), spMax = hi(o.speed, 220);
    const lfMin = lo(o.life, 0.3), lfMax = hi(o.life, 0.8);
    const szMin = lo(o.size, 2), szMax = hi(o.size, 5);
    const spread = o.spread == null ? TAU : o.spread;
    const full = spread >= TAU - 1e-4;
    const ang0 = o.angle || 0;
    const grav = o.gravity || 0;
    const drag = o.drag == null ? 2 : o.drag;
    const shrink = o.shrink !== false;
    const add = o.add != null ? !!o.add
      : glow || shape === SH_SPARK || shape === SH_STAR || shape === SH_GLOW || shape === SH_PLUS || shape === SH_RING;
    let endMul;
    if (o.sizeEnd != null) endMul = o.sizeEnd;
    else if (shape === SH_RING) endMul = 3.2;
    else if (shape === SH_SMOKE) endMul = 2.2;
    else endMul = shrink ? 0 : 1;
    const smode = o.sizeMode === 'bell' ? 1 : o.sizeMode === 'grow' || ((shape === SH_RING || shape === SH_SMOKE) && o.sizeMode !== 'linear') ? 2 : 0;
    const alpha = o.alpha == null ? (shape === SH_SMOKE ? 0.5 : 1) : o.alpha;
    const radius = o.radius || 0;
    const spin = o.spin != null ? o.spin : shape === SH_SQUARE || shape === SH_STAR ? 7 : 0;
    const stretch = o.stretch == null ? 1 : o.stretch;
    const flick = o.flicker || 0;
    const fin = o.fadeIn != null ? o.fadeIn : shape === SH_SMOKE ? 0.18 : 0;
    const fo = shape === SH_SMOKE ? 1.25 : 2.2;
    const gm = o.glowSize == null ? 3.2 : o.glowSize;
    const ga = o.glowAlpha == null ? 0.55 : o.glowAlpha;
    const bvx = o.vx || 0, bvy = o.vy || 0;

    for (let i = 0; i < count; i++) {
      const a = full ? rand() * TAU : ang0 + (rand() - 0.5) * spread;
      const ca = cos(a), sa = sin(a);
      const sp = between(spMin, spMax);
      let px = x, py = y;
      if (radius) {
        const rr = Math.sqrt(rand()) * radius;
        px += ca * rr; py += sa * rr;
      }
      const k = nc > 1 ? (rand() * nc) | 0 : 0;
      const s0 = between(szMin, szMax);
      const p = spawnP(px, py, ca * sp + bvx, sa * sp + bvy, between(lfMin, lfMax), s0, s0 * endMul,
        scratchRamps[k], shape, add);
      if (!p) return;
      p.smode = smode;
      p.drag = drag; p.grav = grav;
      p.alpha = alpha; p.fo = fo; p.fin = fin; p.flick = flick;
      p.stretch = stretch;
      if (spin) { p.rot = rand() * TAU; p.vrot = (rand() - 0.5) * 2 * spin; }
      if (scratchGlows[k]) { p.glow = scratchGlows[k]; p.gm = gm; p.ga = ga; }
      if (scratchSprs[k]) p.spr = scratchSprs[k];
      p.m = (p.s0 > p.s1 ? p.s0 : p.s1) * (gm + 2) + 30;
    }
  }

  /** Single directional streak. opts {color, colorEnd, speed, life, size, drag, gravity, glow=true, stretch}. */
  function spark(x, y, angle, opts) {
    const o = opts || EMPTY;
    if (qi() === 0 && rand() < 0.35) return;
    const col = o.color || '#fff59d';
    const sp = between(lo(o.speed, 260), hi(o.speed, 520));
    const size = between(lo(o.size, 1.6), hi(o.size, 2.8));
    const a = angle || 0;
    const p = spawnP(x, y, cos(a) * sp + (o.vx || 0), sin(a) * sp + (o.vy || 0),
      between(lo(o.life, 0.18), hi(o.life, 0.32)), size, o.shrink === false ? size : size * 0.3,
      rampFor(col, o.colorEnd || col), SH_SPARK, true);
    if (!p) return;
    p.drag = o.drag == null ? 5 : o.drag;
    p.grav = o.gravity || 0;
    p.stretch = o.stretch == null ? 1.25 : o.stretch;
    if (o.glow !== false) { p.glow = getSprite(SPR_GLOW, col, 24); p.gm = 3; p.ga = 0.4; }
  }

  /** Internal: one big glow puff (hot core) that shrinks/grows over life. */
  function glowPuff(x, y, r0, r1, life, color, alpha) {
    const p = spawnP(x, y, 0, 0, life, r0, r1, rampFor(color, color), SH_GLOW, true);
    if (!p) return;
    p.spr = getSprite(SPR_HOT, color, 64);
    p.alpha = alpha == null ? 0.9 : alpha;
    p.fo = 1.4;
    p.smode = r1 > r0 ? 2 : 0;
    p.m = Math.max(r0, r1) + 30;
  }

  function updateParticles(dt) {
    for (let i = pAct.length - 1; i >= 0; i--) {
      const p = pAct[i];
      p.age += dt;
      if (p.age >= p.max) {
        pAct[i] = pAct[pAct.length - 1];
        pAct.pop();
        pFree.push(p);
        continue;
      }
      if (p.drag) {
        const k = 1 / (1 + p.drag * dt);
        p.vx *= k; p.vy *= k;
      }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vrot) p.rot += p.vrot * dt;
    }
  }

  function pSize(p, t) {
    if (p.smode === 0) return p.s0 + (p.s1 - p.s0) * t;
    if (p.smode === 1) return p.s0 * (t < 0.25 ? E.outQuad(t * 4) : 1 - inQuad((t - 0.25) / 0.75));
    return p.s0 + (p.s1 - p.s0) * E.outCubic(t);
  }
  function pAlpha(p, t) {
    let a = 1 - t;
    a = p.alpha * (a * p.fo < 1 ? a * p.fo : 1);
    if (p.fin > 0 && t < p.fin) a *= t / p.fin;
    if (p.flick) a *= 0.6 + 0.4 * sin(p.age * p.flick + p.ph);
    return a;
  }

  function drawShape(ctx, p, t, s, a, col) {
    const x = p.x, y = p.y;
    ctx.globalAlpha = a > 1 ? 1 : a;
    switch (p.shape) {
      case SH_CIRCLE:
        ctx.fillStyle = col;
        if (s < 1.3) ctx.fillRect(x - s, y - s, s * 2, s * 2);
        else {
          ctx.beginPath();
          ctx.arc(x, y, s, 0, TAU);
          ctx.fill();
        }
        break;
      case SH_SPARK: {
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (sp < 4) {
          ctx.fillStyle = col;
          ctx.fillRect(x - s * 0.5, y - s * 0.5, s, s);
          break;
        }
        const ux = p.vx / sp, uy = p.vy / sp;
        const len = s * 1.5 + sp * 0.045 * p.stretch;
        ctx.strokeStyle = col;
        ctx.lineWidth = s;
        ctx.beginPath();
        ctx.moveTo(x + ux * s * 0.5, y + uy * s * 0.5);
        ctx.lineTo(x - ux * len, y - uy * len);
        ctx.stroke();
        break;
      }
      case SH_SQUARE: {
        const c = cos(p.rot) * s, n = sin(p.rot) * s;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + c - n, y + n + c);
        ctx.lineTo(x - c - n, y - n + c);
        ctx.lineTo(x - c + n, y - n - c);
        ctx.lineTo(x + c + n, y + n - c);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case SH_STAR: {
        const c = cos(p.rot), n = sin(p.rot);
        const ci = (c - n) * SQ12 * s * 0.3, si = (n + c) * SQ12 * s * 0.3;
        const co = c * s, so = n * s;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + co, y + so);
        ctx.lineTo(x + ci, y + si);
        ctx.lineTo(x - so, y + co);
        ctx.lineTo(x - si, y + ci);
        ctx.lineTo(x - co, y - so);
        ctx.lineTo(x - ci, y - si);
        ctx.lineTo(x + so, y - co);
        ctx.lineTo(x + si, y - ci);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case SH_DROP: {
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        ctx.fillStyle = col;
        ctx.beginPath();
        if (sp < 6) ctx.arc(x, y, s, 0, TAU);
        else {
          const ux = p.vx / sp, uy = p.vy / sp;
          const L = s * (1.8 + Math.min(2.6, sp * 0.008));
          const ang = Math.atan2(uy, ux);
          ctx.moveTo(x - ux * L, y - uy * L);
          ctx.arc(x, y, s, ang + HALF_PI, ang - HALF_PI, true);
          ctx.closePath();
        }
        ctx.fill();
        break;
      }
      case SH_RING:
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(0.8, p.s0 * 0.35 * (1 - t) + 0.6);
        ctx.beginPath();
        ctx.arc(x, y, s, 0, TAU);
        ctx.stroke();
        break;
      case SH_GLOW:
      case SH_SMOKE:
        if (p.spr) ctx.drawImage(p.spr, x - s, y - s, s * 2, s * 2);
        break;
      case SH_PLUS: {
        const w = s * 0.32;
        ctx.fillStyle = col;
        ctx.fillRect(x - s, y - w, s * 2, w * 2);
        ctx.fillRect(x - w, y - s, w * 2, s * 2);
        break;
      }
      default:
        break;
    }
  }

  function renderParticles(ctx, v) {
    const x0 = v.x0, x1 = v.x1, y0 = v.y0, y1 = v.y1;
    const n = pAct.length;
    if (!n) return;
    // pass 1: normal blending (smoke, debris, goo)
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < n; i++) {
      const p = pAct[i];
      if (p.add) continue;
      const m = p.m;
      if (p.x < x0 - m || p.x > x1 + m || p.y < y0 - m || p.y > y1 + m) continue;
      const t = p.age / p.max;
      const a = pAlpha(p, t);
      if (a <= 0.01) continue;
      const s = pSize(p, t);
      if (s <= 0.05) continue;
      drawShape(ctx, p, t, s, a, rampAt(p.ramp, t));
    }
    // pass 2: additive (glows + emissive shapes)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = pAct[i];
      if (!p.add && !p.glow) continue;
      const m = p.m;
      if (p.x < x0 - m || p.x > x1 + m || p.y < y0 - m || p.y > y1 + m) continue;
      const t = p.age / p.max;
      const a = pAlpha(p, t);
      if (a <= 0.01) continue;
      const s = pSize(p, t);
      if (s <= 0.05) continue;
      if (p.glow) {
        const gs = s * p.gm + 2;
        const ga = a * p.ga;
        ctx.globalAlpha = ga > 1 ? 1 : ga;
        ctx.drawImage(p.glow, p.x - gs, p.y - gs, gs * 2, gs * 2);
      }
      if (p.add) drawShape(ctx, p, t, s, a, rampAt(p.ramp, t));
    }
  }

  /* ================================================================ RINGS */
  function Ring() {
    this.x = 0; this.y = 0; this.r0 = 0; this.r1 = 0; this.age = 0; this.max = 1; this.delay = 0;
    this.w = 6; this.col = '#fff'; this.fill = false; this.add = true; this.hot = true; this.alpha = 1;
  }
  const rings = new SmallPool(() => new Ring(), 72);

  /** Expanding shockwave. opts {radius=80, color, life=0.4, width=6, fill=false, delay, start, alpha, add, hot}. */
  function ring(x, y, opts) {
    const o = opts || EMPTY;
    const R = rings.get();
    if (!R) return;
    const pc = parseColor(o.color || '#ffffff');
    const radius = Math.max(1, o.radius == null ? 80 : o.radius);
    R.x = x; R.y = y;
    R.r1 = radius;
    R.r0 = radius * U.clamp(o.start == null ? 0.12 : o.start, 0, 1);
    R.age = 0;
    R.max = Math.max(0.02, o.life == null ? 0.4 : o.life);
    R.delay = Math.max(0, o.delay || 0);
    R.w = Math.max(0.5, o.width == null ? 6 : o.width);
    R.col = pc.css;
    R.fill = !!o.fill;
    R.alpha = o.alpha == null ? 1 : o.alpha;
    R.add = o.add != null ? !!o.add : pc.lum > 0.16;
    R.hot = o.hot != null ? !!o.hot : R.add;
  }

  function updateRings(dt) {
    const a = rings.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const R = a[i];
      if (R.delay > 0) { R.delay -= dt; continue; }
      R.age += dt;
      if (R.age >= R.max) rings.kill(i);
    }
  }

  function renderRings(ctx, v, q) {
    const a = rings.act;
    if (!a.length) return;
    let gco = '';
    for (let i = 0; i < a.length; i++) {
      const R = a[i];
      if (R.delay > 0) continue;
      const ext = R.r1 + R.w;
      if (R.x + ext < v.x0 || R.x - ext > v.x1 || R.y + ext < v.y0 || R.y - ext > v.y1) continue;
      const t = R.age / R.max;
      const r = R.r0 + (R.r1 - R.r0) * E.outCubic(t);
      const want = R.add ? 'lighter' : 'source-over';
      if (want !== gco) { ctx.globalCompositeOperation = want; gco = want; }
      if (R.fill && t < 0.45) {
        const k = 1 - t / 0.45;
        ctx.globalAlpha = R.alpha * 0.3 * k * k;
        ctx.fillStyle = R.col;
        ctx.beginPath();
        ctx.arc(R.x, R.y, r, 0, TAU);
        ctx.fill();
      }
      const al = R.alpha * Math.pow(1 - t, 1.5);
      if (al <= 0.01) continue;
      const lw = Math.max(0.6, R.w * (1 - 0.82 * t));
      ctx.globalAlpha = al;
      ctx.strokeStyle = R.col;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(R.x, R.y, r, 0, TAU);
      ctx.stroke();
      if (R.hot && q > 0 && lw > 1.6) {
        ctx.globalAlpha = al * 0.75;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = lw * 0.33;
        ctx.stroke();
      }
    }
  }

  /* ============================================================ LIGHTNING */
  const MAIN_SEGS_MAX = 64, BR_SEGS_MAX = 16, MAX_BRANCH = 4;
  function Bolt() {
    this.x1 = 0; this.y1 = 0; this.x2 = 0; this.y2 = 0;
    this.age = 0; this.max = 0.25; this.w = 3; this.col = '#fff'; this.glow = null;
    this.segs = 16; this.nb = 0; this.rough = 0.17; this.jT = 0; this.jI = 0.05; this.flick = 1;
    this.pts = new Float32Array((MAIN_SEGS_MAX + 1) * 2);
    this.br = [];
    for (let i = 0; i < MAX_BRANCH; i++) this.br.push({ pts: new Float32Array((BR_SEGS_MAX + 1) * 2), segs: 8 });
  }
  const bolts = new SmallPool(() => new Bolt(), 32);

  /** Midpoint displacement along the segment normal. segs must be a power of 2. */
  function genPath(pts, segs, x1, y1, x2, y2, rough) {
    pts[0] = x1; pts[1] = y1;
    pts[segs * 2] = x2; pts[segs * 2 + 1] = y2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len;
    let disp = len * rough;
    for (let step = segs; step > 1; step >>= 1) {
      const half = step >> 1;
      for (let i = 0; i < segs; i += step) {
        const ia = i * 2, ib = (i + step) * 2, im = (i + half) * 2;
        const off = (rand() * 2 - 1) * disp;
        pts[im] = (pts[ia] + pts[ib]) * 0.5 + nx * off;
        pts[im + 1] = (pts[ia + 1] + pts[ib + 1]) * 0.5 + ny * off;
      }
      disp *= 0.52;
    }
  }

  function genBolt(b) {
    genPath(b.pts, b.segs, b.x1, b.y1, b.x2, b.y2, b.rough);
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < b.nb; i++) {
      const br = b.br[i];
      const k = ((0.15 + rand() * 0.6) * b.segs) | 0;
      const sx = b.pts[k * 2], sy = b.pts[k * 2 + 1];
      const ang = base + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.6);
      const bl = len * (0.18 + rand() * 0.3);
      br.segs = bl > 70 ? 16 : 8;
      genPath(br.pts, br.segs, sx, sy, sx + cos(ang) * bl, sy + sin(ang) * bl, 0.24);
    }
    b.flick = 0.62 + rand() * 0.38;
  }

  /** Jagged bolt. opts {color='#b388ff', width=3, life=0.25, branches=2, rough, sparks=true}. */
  function lightning(x1, y1, x2, y2, opts) {
    const o = opts || EMPTY;
    const b = bolts.get();
    if (!b) return;
    const col = o.color || '#b388ff';
    const pc = parseColor(col);
    b.x1 = x1; b.y1 = y1; b.x2 = x2; b.y2 = y2;
    b.age = 0;
    b.max = Math.max(0.04, o.life == null ? 0.25 : o.life);
    b.w = Math.max(0.6, o.width == null ? 3 : o.width);
    b.col = pc.css;
    b.glow = getSprite(SPR_HOT, pc.key, 48);
    const len = Math.hypot(x2 - x1, y2 - y1);
    b.segs = len < 50 ? 8 : len < 140 ? 16 : len < 360 ? 32 : 64;
    let nb = Math.round(o.branches == null ? 2 : o.branches);
    nb = Math.max(0, Math.min(MAX_BRANCH, nb));
    if (qi() === 0) nb = Math.min(nb, 1);
    b.nb = len < 30 ? 0 : nb;
    b.rough = o.rough == null ? 0.17 : o.rough;
    b.jI = Math.max(0.03, b.max / 4.5);
    b.jT = b.jI;
    genBolt(b);
    if (o.sparks !== false) {
      burst(x2, y2, {
        count: 4, colors: [pc.key, '#ffffff'], speed: [120, 340], life: [0.12, 0.3],
        size: [1.2, 2.2], shape: 'spark', drag: 5,
      });
    }
  }

  function updateBolts(dt) {
    const a = bolts.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const b = a[i];
      b.age += dt;
      if (b.age >= b.max) { bolts.kill(i); continue; }
      b.jT -= dt;
      if (b.jT <= 0) { genBolt(b); b.jT = b.jI; }
    }
  }

  function tracePts(ctx, pts, segs) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i <= segs; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  }

  function renderBolts(ctx, v, q) {
    const a = bolts.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      const m = 60 + Math.abs(b.x2 - b.x1) * 0.25 + Math.abs(b.y2 - b.y1) * 0.25;
      if (Math.max(b.x1, b.x2) < v.x0 - m || Math.min(b.x1, b.x2) > v.x1 + m ||
        Math.max(b.y1, b.y2) < v.y0 - m || Math.min(b.y1, b.y2) > v.y1 + m) continue;
      const t = b.age / b.max;
      const al = Math.pow(1 - t, 0.8) * b.flick;
      const w = b.w * (1 - 0.45 * t);
      // impact + origin glows
      const gr = w * 9 * (0.75 + 0.25 * b.flick);
      ctx.globalAlpha = al * 0.85;
      ctx.drawImage(b.glow, b.x2 - gr, b.y2 - gr, gr * 2, gr * 2);
      ctx.globalAlpha = al * 0.5;
      ctx.drawImage(b.glow, b.x1 - gr * 0.6, b.y1 - gr * 0.6, gr * 1.2, gr * 1.2);
      // main bolt: outer haze, coloured body, white-hot core
      ctx.beginPath();
      tracePts(ctx, b.pts, b.segs);
      ctx.strokeStyle = b.col;
      if (q > 0) {
        ctx.globalAlpha = al * 0.26;
        ctx.lineWidth = w * 3.8;
        ctx.stroke();
      }
      ctx.globalAlpha = al * 0.9;
      ctx.lineWidth = w * 1.4;
      ctx.stroke();
      ctx.globalAlpha = al;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, w * 0.5);
      ctx.stroke();
      // branches
      if (b.nb) {
        ctx.beginPath();
        for (let k = 0; k < b.nb; k++) tracePts(ctx, b.br[k].pts, b.br[k].segs);
        ctx.strokeStyle = b.col;
        ctx.globalAlpha = al * 0.75;
        ctx.lineWidth = w * 0.85;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = al * 0.8;
        ctx.lineWidth = Math.max(0.7, w * 0.3);
        ctx.stroke();
      }
    }
  }

  /* ============================================================== SLASHES */
  function Slash() {
    this.x = 0; this.y = 0; this.ang = 0; this.R = 60; this.arc = 2.2; this.w = 10;
    this.age = 0; this.max = 0.2; this.dir = 1; this.alpha = 1;
    this.pc = null; this.grad = null; this.gctx = null; this.glow = null;
  }
  const slashes = new SmallPool(() => new Slash(), 48);

  /** Crescent arc. opts {radius=60, arc=2.2, color, life=0.2, width=10, dir=1|-1, alpha}. */
  function slash(x, y, angle, opts) {
    const o = opts || EMPTY;
    const s = slashes.get();
    if (!s) return;
    s.x = x; s.y = y; s.ang = angle || 0;
    s.R = Math.max(4, o.radius == null ? 60 : o.radius);
    s.arc = U.clamp(o.arc == null ? 2.2 : o.arc, 0.2, TAU * 0.95);
    s.w = Math.max(1, o.width == null ? 10 : o.width);
    s.age = 0;
    s.max = Math.max(0.04, o.life == null ? 0.2 : o.life);
    s.dir = o.dir < 0 || o.flip ? -1 : 1;
    s.alpha = o.alpha == null ? 1 : o.alpha;
    s.pc = parseColor(o.color || '#e0f7ff');
    s.grad = null;
    s.gctx = null;
    s.glow = getSprite(SPR_HOT, s.pc.key, 32);
  }

  function updateSlashes(dt) {
    const a = slashes.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const s = a[i];
      s.age += dt;
      if (s.age >= s.max) slashes.kill(i);
    }
  }

  function renderSlashes(ctx, v, q) {
    const a = slashes.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    const N = q === 0 ? 8 : 14;
    for (let i = 0; i < a.length; i++) {
      const s = a[i];
      const ext = s.R + s.w * 2;
      if (s.x + ext < v.x0 || s.x - ext > v.x1 || s.y + ext < v.y0 || s.y - ext > v.y1) continue;
      const t = s.age / s.max;
      const head = E.outCubic(clamp01(t / 0.45));
      const tail = E.inOutSine(clamp01((t - 0.1) / 0.9));
      if (head - tail < 0.012) continue;
      const A0 = -s.arc / 2;
      const ha = A0 + s.arc * head, ta = A0 + s.arc * tail;
      const al = s.alpha * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
      if (al <= 0.01) continue;
      const R = s.R, w = s.w;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (s.dir < 0) ctx.scale(1, -1);
      if (s.gctx !== ctx || !s.grad) {
        const g = ctx.createRadialGradient(0, 0, Math.max(0, R - w * 1.1), 0, 0, R + w * 0.45);
        g.addColorStop(0, rgbaOf(s.pc, 0));
        g.addColorStop(0.45, rgbaOf(s.pc, 0.35));
        g.addColorStop(0.7, rgbaOf(s.pc, 0.9));
        g.addColorStop(0.88, lightRgba(s.pc, 0.6, 1));
        g.addColorStop(1, 'rgba(255,255,255,1)');
        s.grad = g;
        s.gctx = ctx;
      }
      ctx.beginPath();
      for (let k = 0; k <= N; k++) {
        const u = k / N;
        const an = ta + (ha - ta) * u;
        const th = w * sin(PI * Math.pow(u, 1.6));
        const ro = R + th * 0.3;
        if (k === 0) ctx.moveTo(cos(an) * ro, sin(an) * ro);
        else ctx.lineTo(cos(an) * ro, sin(an) * ro);
      }
      for (let k = N; k >= 0; k--) {
        const u = k / N;
        const an = ta + (ha - ta) * u;
        const th = w * sin(PI * Math.pow(u, 1.6));
        const ri = Math.max(0, R - th * 0.7);
        ctx.lineTo(cos(an) * ri, sin(an) * ri);
      }
      ctx.closePath();
      ctx.globalAlpha = al;
      ctx.fillStyle = s.grad;
      ctx.fill();
      if (q > 0) {
        // razor-thin bright edge along the leading two thirds
        ctx.beginPath();
        ctx.arc(0, 0, R + w * 0.26, ta + (ha - ta) * 0.35, ha);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.globalAlpha = al * 0.7;
        ctx.stroke();
        if (t < 0.5) {
          const gr = w * 1.7;
          const hx = cos(ha) * R, hy = sin(ha) * R;
          ctx.globalAlpha = al * (1 - t / 0.5);
          ctx.drawImage(s.glow, hx - gr, hy - gr, gr * 2, gr * 2);
        }
      }
      ctx.restore();
    }
  }

  /* ======================================================= FLOATING TEXT */
  const FONT_BASE = 32;
  const FONT = '800 32px "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const outlineCache = new Map();
  function outlineFor(color) {
    const pc = parseColor(color);
    let o = outlineCache.get(pc.key);
    if (!o) {
      o = mixKey(pc.key, '#05030a', 0.8);
      outlineCache.set(pc.key, o);
    }
    return o;
  }

  function FText() {
    this.x = 0; this.y = 0; this.ox = 0; this.oy = 0; this.str = ''; this.color = '#fff';
    this.outline = '#000'; this.size = 16; this.crit = false; this.age = 0; this.max = 0.8;
    this.rise = 40; this.vx = 0; this.tilt = 0; this.pop = 0.22; this.glow = null;
  }
  const texts = new SmallPool(() => new FText(), 120);
  let critGrad = null, critGradCtx = null;

  function fmtValue(v) {
    if (typeof v === 'number') {
      if (!isFinite(v)) return '∞';
      const n = Math.round(v);
      return Math.abs(n) >= 10000 ? U.fmtNum(n) : String(n);
    }
    return v == null ? '' : String(v);
  }

  /** Floating number / label. opts {color='#fff', size=16, crit=false, life=0.8, rise=40, critColor}. */
  function text(x, y, str, opts) {
    const o = opts || EMPTY;
    const s = fmtValue(str);
    if (!s) return;
    let T;
    if (texts.free.length) T = texts.get();
    else {
      // full: recycle the oldest one
      let best = 0, bestAge = -1;
      for (let i = 0; i < texts.act.length; i++) {
        if (texts.act[i].age > bestAge) { bestAge = texts.act[i].age; best = i; }
      }
      T = texts.act[best];
      if (!T) return;
    }
    const crit = !!o.crit;
    const size = (o.size || 16) * (crit ? 1.55 : 1);
    // stack fresh numbers spawned near each other so they never overlap
    let stack = 0;
    const tA = texts.act;
    for (let i = 0; i < tA.length; i++) {
      const q = tA[i];
      if (q === T || q.age > 0.32) continue;
      if (Math.abs(q.ox - x) < 30 && Math.abs(q.oy - y) < 26) stack++;
    }
    stack = stack % 6;
    T.ox = x; T.oy = y;
    T.x = x + (rand() - 0.5) * 12 + (stack & 1 ? 9 : stack ? -9 : 0);
    T.y = y - stack * size * 0.78;
    T.str = s;
    T.crit = crit;
    T.color = crit ? o.critColor || '#ffd54f' : o.color || '#ffffff';
    T.outline = crit ? '#4a1d00' : outlineFor(T.color);
    T.size = size;
    T.age = 0;
    T.max = Math.max(0.2, o.life == null ? (crit ? 1.0 : 0.8) : o.life);
    T.rise = (o.rise == null ? 40 : o.rise) * (crit ? 1.2 : 1);
    T.vx = (rand() - 0.5) * 18;
    T.tilt = crit ? (rand() - 0.5) * 0.36 : (rand() - 0.5) * 0.08;
    T.pop = crit ? 0.3 : 0.22;
    T.glow = crit ? getSprite(SPR_GLOW, T.color, 48) : null;
    if (crit) {
      burst(x, y, {
        count: 7, colors: [T.color, '#fff8e1', '#ffab00'], speed: [90, 230], life: [0.25, 0.5],
        size: [2.5, 4.5], shape: 'star', drag: 4, spin: 9,
      });
      if (qi() > 0) ring(x, y, { radius: 26, color: T.color, life: 0.22, width: 2.5 });
    }
  }

  function updateTexts(dt) {
    const a = texts.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const T = a[i];
      T.age += dt;
      if (T.age >= T.max) texts.kill(i);
    }
  }

  function renderTexts(ctx, v, q) {
    const a = texts.act;
    if (!a.length) return;
    const z = SK.cam.zoom || 1;
    const ts = U.clamp(0.95 / z, 1, 1.7); // keep numbers readable on small phone screens
    // crit halos (additive) first
    if (q > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < a.length; i++) {
        const T = a[i];
        if (!T.glow) continue;
        const t = T.age / T.max;
        const y = T.y - T.rise * E.outCubic(t);
        const x = T.x + T.vx * t;
        if (x < v.x0 - 80 || x > v.x1 + 80 || y < v.y0 - 80 || y > v.y1 + 80) continue;
        const gr = T.size * ts * (1.5 - t * 0.5);
        ctx.globalAlpha = 0.45 * (1 - t);
        ctx.drawImage(T.glow, x - gr * 1.4, y - gr, gr * 2.8, gr * 2);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (critGradCtx !== ctx || !critGrad) {
      critGrad = ctx.createLinearGradient(0, -FONT_BASE * 0.45, 0, FONT_BASE * 0.45);
      critGrad.addColorStop(0, '#fffde7');
      critGrad.addColorStop(0.45, '#ffd54f');
      critGrad.addColorStop(1, '#ff8f00');
      critGradCtx = ctx;
    }
    for (let i = 0; i < a.length; i++) {
      const T = a[i];
      const t = T.age / T.max;
      const y = T.y - T.rise * E.outCubic(t);
      const x = T.x + T.vx * t;
      if (x < v.x0 - 80 || x > v.x1 + 80 || y < v.y0 - 60 || y > v.y1 + 60) continue;
      const tp = T.age < T.pop ? T.age / T.pop : 1;
      let sc = T.crit ? 2.1 - 1.1 * E.outBack(tp) : 0.25 + 0.75 * E.outBack(tp);
      if (t > 0.75) sc *= 1 - 0.3 * ((t - 0.75) / 0.25);
      const al = t < 0.55 ? 1 : 1 - inQuad((t - 0.55) / 0.45);
      if (al <= 0.01) continue;
      const k = (T.size * sc * ts) / FONT_BASE;
      if (!(k > 0.01)) continue;
      ctx.save();
      ctx.translate(x, y);
      if (T.tilt) ctx.rotate(T.tilt * (1 - tp * 0.7));
      ctx.scale(k, k);
      ctx.globalAlpha = al;
      ctx.strokeStyle = T.outline;
      ctx.lineWidth = T.crit ? 8.5 : 7;
      ctx.strokeText(T.str, 0, 0);
      ctx.fillStyle = T.crit && !(T.color !== '#ffd54f') ? critGrad : T.color;
      ctx.fillText(T.str, 0, 0);
      ctx.restore();
    }
  }

  /* ======================================================= GHOST TRAILS */
  function Ghost() {
    this.x = 0; this.y = 0; this.r = 10; this.col = '#fff'; this.glow = null;
    this.ang = 0; this.st = 1; this.age = 0; this.max = 0.32; this.a0 = 0.55;
  }
  const ghosts = new SmallPool(() => new Ghost(), 90);
  const trailLast = new WeakMap();

  /** Afterimage helper: call every frame while an entity dashes / moves fast. */
  function trail(entity, color, size) {
    if (!entity || typeof entity !== 'object') return;
    const now = SK.time.gameT;
    const last = trailLast.get(entity);
    if (last != null && now >= last && now - last < 0.028) return;
    trailLast.set(entity, now);
    const g = ghosts.get();
    if (!g) return;
    const pc = parseColor(color || '#7fdcff');
    g.x = +entity.x || 0;
    g.y = +entity.y || 0;
    g.r = Math.max(2, size || entity.r || 16);
    g.col = pc.css;
    g.glow = getSprite(SPR_GLOW, pc.key, 48);
    const vx = +entity.vx || 0, vy = +entity.vy || 0;
    const sp = Math.sqrt(vx * vx + vy * vy);
    g.ang = sp > 1 ? Math.atan2(vy, vx) : 0;
    g.st = 1 + Math.min(0.45, sp / 1400);
    g.age = 0;
    g.max = 0.32;
    g.a0 = 0.55;
  }

  function updateGhosts(dt) {
    const a = ghosts.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const g = a[i];
      g.age += dt;
      if (g.age >= g.max) ghosts.kill(i);
    }
  }

  function renderGhosts(ctx, v) {
    const a = ghosts.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const g = a[i];
      const m = g.r * 2.5;
      if (g.x < v.x0 - m || g.x > v.x1 + m || g.y < v.y0 - m || g.y > v.y1 + m) continue;
      const t = g.age / g.max;
      const al = g.a0 * Math.pow(1 - t, 1.5);
      const r = g.r * (1 - 0.35 * t);
      if (r <= 0.5) continue;
      const gr = r * 1.8;
      ctx.globalAlpha = al * 0.5;
      ctx.drawImage(g.glow, g.x - gr, g.y - gr, gr * 2, gr * 2);
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, r * g.st, r / Math.sqrt(g.st), g.ang, 0, TAU);
      ctx.globalAlpha = al * 0.35;
      ctx.fillStyle = g.col;
      ctx.fill();
      ctx.globalAlpha = al * 0.75;
      ctx.strokeStyle = g.col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  /* ========================================================== GOD-RAYS */
  const RAY_MAX = 24;
  function Rays() {
    this.x = 0; this.y = 0; this.n = 10; this.age = 0; this.max = 1.2; this.R = 260;
    this.rot = 0; this.spin = 0.35; this.spr = null; this.core = null; this.follow = null; this.alpha = 1;
    this.ang = new Float32Array(RAY_MAX); this.len = new Float32Array(RAY_MAX);
    this.wid = new Float32Array(RAY_MAX); this.ph = new Float32Array(RAY_MAX);
  }
  const rays = new SmallPool(() => new Rays(), 10);
  const raySprites = new Map();

  function raySprite(color) {
    const pc = parseColor(color);
    let c = raySprites.get(pc.key);
    if (c) return c;
    if (raySprites.size > 16) raySprites.clear();
    c = makeCanvas(256, 32);
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createLinearGradient(0, 0, 256, 0);
      grad.addColorStop(0, lightRgba(pc, 0.7, 0.95));
      grad.addColorStop(0.22, rgbaOf(pc, 0.55));
      grad.addColorStop(0.6, rgbaOf(pc, 0.18));
      grad.addColorStop(1, rgbaOf(pc, 0));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 15);
      g.lineTo(256, 0);
      g.lineTo(256, 32);
      g.lineTo(0, 17);
      g.closePath();
      g.fill();
    }
    raySprites.set(pc.key, c);
    return c;
  }

  /** Rotating god-rays. opts {count=10, color='#fff6c8', life=1.2, radius=260, spin, follow /*entity*/, alpha}. */
  function lightRays(x, y, opts) {
    const o = opts || EMPTY;
    const R = rays.get();
    if (!R) return;
    const col = o.color || '#fff6c8';
    let n = Math.round(o.count == null ? 10 : o.count);
    n = Math.max(1, Math.min(RAY_MAX, qi() === 0 ? Math.ceil(n * 0.6) : n));
    R.x = x; R.y = y; R.n = n;
    R.age = 0;
    R.max = Math.max(0.1, o.life == null ? 1.2 : o.life);
    R.R = Math.max(10, o.radius == null ? 260 : o.radius);
    R.rot = rand() * TAU;
    R.spin = o.spin == null ? (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.25) : o.spin;
    R.spr = raySprite(col);
    R.core = getSprite(SPR_HOT, col, 96);
    R.follow = o.follow || null;
    R.alpha = o.alpha == null ? 1 : o.alpha;
    for (let i = 0; i < n; i++) {
      R.ang[i] = (i / n) * TAU + (rand() - 0.5) * (TAU / n) * 0.5;
      R.len[i] = R.R * (0.55 + rand() * 0.45);
      R.wid[i] = R.R * (0.07 + rand() * 0.12);
      R.ph[i] = rand() * TAU;
    }
  }

  function updateRays(dt) {
    const a = rays.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const R = a[i];
      R.age += dt;
      if (R.age >= R.max) { R.follow = null; rays.kill(i); continue; }
      R.rot += R.spin * dt;
      if (R.follow && R.follow.x != null) { R.x = R.follow.x; R.y = R.follow.y; }
    }
  }

  function renderRays(ctx, v) {
    const a = rays.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const R = a[i];
      if (R.x + R.R < v.x0 || R.x - R.R > v.x1 || R.y + R.R < v.y0 || R.y - R.R > v.y1) continue;
      const t = R.age / R.max;
      const env = t < 0.15 ? E.outCubic(t / 0.15) : 1 - inQuad((t - 0.15) / 0.85);
      if (env <= 0.01) continue;
      ctx.save();
      ctx.translate(R.x, R.y);
      ctx.rotate(R.rot);
      let prev = 0;
      for (let k = 0; k < R.n; k++) {
        const an = R.ang[k];
        ctx.rotate(an - prev);
        prev = an;
        const ph = R.ph[k];
        const len = R.len[k] * (0.85 + 0.15 * sin(R.age * 3 + ph)) * (0.55 + 0.45 * env);
        const w = R.wid[k] * (0.8 + 0.2 * sin(R.age * 4.3 + ph * 1.7));
        ctx.globalAlpha = R.alpha * env * 0.55 * (0.7 + 0.3 * sin(R.age * 5 + ph));
        ctx.drawImage(R.spr, 0, -w / 2, len, w);
      }
      ctx.restore();
      const cr = R.R * 0.32 * (0.8 + 0.2 * env);
      ctx.globalAlpha = R.alpha * env * 0.7;
      ctx.drawImage(R.core, R.x - cr, R.y - cr, cr * 2, cr * 2);
    }
  }

  /* ====================================================== LIGHT COLUMNS */
  function Beam() {
    this.x = 0; this.y = 0; this.w = 70; this.h = 420; this.age = 0; this.max = 1;
    this.spr = null; this.foot = null;
  }
  const beams = new SmallPool(() => new Beam(), 8);
  const beamSprites = new Map();

  function beamSprite(color) {
    const pc = parseColor(color);
    let c = beamSprites.get(pc.key);
    if (c) return c;
    if (beamSprites.size > 12) beamSprites.clear();
    c = makeCanvas(64, 256);
    const g = c.getContext('2d');
    if (g) {
      const gh = g.createLinearGradient(0, 0, 64, 0);
      gh.addColorStop(0, rgbaOf(pc, 0));
      gh.addColorStop(0.28, rgbaOf(pc, 0.32));
      gh.addColorStop(0.44, lightRgba(pc, 0.6, 0.85));
      gh.addColorStop(0.5, 'rgba(255,255,255,1)');
      gh.addColorStop(0.56, lightRgba(pc, 0.6, 0.85));
      gh.addColorStop(0.72, rgbaOf(pc, 0.32));
      gh.addColorStop(1, rgbaOf(pc, 0));
      g.fillStyle = gh;
      g.fillRect(0, 0, 64, 256);
      g.globalCompositeOperation = 'destination-in';
      const gv = g.createLinearGradient(0, 0, 0, 256);
      gv.addColorStop(0, 'rgba(0,0,0,0)');
      gv.addColorStop(0.4, 'rgba(0,0,0,0.75)');
      gv.addColorStop(0.9, 'rgba(0,0,0,1)');
      gv.addColorStop(1, 'rgba(0,0,0,0.6)');
      g.fillStyle = gv;
      g.fillRect(0, 0, 64, 256);
      g.globalCompositeOperation = 'source-over';
    }
    beamSprites.set(pc.key, c);
    return c;
  }

  /** Vertical column of light rising from (x,y). opts {color, width=70, height=420, life=1}. */
  function beam(x, y, opts) {
    const o = opts || EMPTY;
    const B = beams.get();
    if (!B) return;
    const col = o.color || '#fff2b0';
    B.x = x; B.y = y;
    B.w = Math.max(4, o.width == null ? 70 : o.width);
    B.h = Math.max(10, o.height == null ? 420 : o.height);
    B.age = 0;
    B.max = Math.max(0.1, o.life == null ? 1 : o.life);
    B.spr = beamSprite(col);
    B.foot = getSprite(SPR_HOT, col, 96);
  }

  function updateBeams(dt) {
    const a = beams.act;
    for (let i = a.length - 1; i >= 0; i--) {
      const B = a[i];
      B.age += dt;
      if (B.age >= B.max) beams.kill(i);
    }
  }

  function renderBeams(ctx, v) {
    const a = beams.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const B = a[i];
      if (B.x + B.w < v.x0 || B.x - B.w > v.x1 || B.y < v.y0 - 40 || B.y - B.h > v.y1) continue;
      const t = B.age / B.max;
      const wm = t < 0.12 ? E.outBack(t / 0.12) : 1 - E.inCubic((t - 0.12) / 0.88) * 0.85;
      const al = t < 0.12 ? 1 : 1 - inQuad((t - 0.12) / 0.88);
      if (al <= 0.01 || wm <= 0.01) continue;
      const w = B.w * wm * (1 + 0.06 * sin(B.age * 40));
      ctx.globalAlpha = al;
      ctx.drawImage(B.spr, B.x - w / 2, B.y - B.h, w, B.h);
      ctx.globalAlpha = al * 0.6;
      ctx.drawImage(B.spr, B.x - w * 0.22, B.y - B.h * 1.1, w * 0.44, B.h * 1.1);
      const fr = B.w * (0.9 + 0.3 * wm);
      ctx.globalAlpha = al * 0.8;
      ctx.drawImage(B.foot, B.x - fr, B.y - fr * 0.45, fr * 2, fr * 0.9);
    }
  }

  /* ============================================================= TIMERS */
  const timers = [];
  /** Run fn after `delay` seconds of game time (used by composite helpers). */
  function after(delay, fn) {
    if (typeof fn !== 'function') return;
    if (timers.length >= 96) return;
    timers.push({ t: Math.max(0, +delay || 0), fn });
  }
  function updateTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (i >= timers.length) continue;
      const tm = timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        timers[i] = timers[timers.length - 1];
        timers.pop();
        try { tm.fn(); } catch (e) { console.error('[FX timer]', e); }
      }
    }
  }

  /* ============================================================ AMBIENT */
  const AMB_MOTES = 0, AMB_FIREFLIES = 1, AMB_EMBERS = 2, AMB_SOULS = 3;
  const AMB_IDS = { motes: AMB_MOTES, fireflies: AMB_FIREFLIES, embers: AMB_EMBERS, souls: AMB_SOULS };
  const AMB_BY_BIOME = { cave: 'motes', forest: 'fireflies', volcano: 'embers', demon: 'souls' };
  const AMB_DEFAULT_COLORS = [
    ['#4dd0e1', '#7c4dff', '#80deea', '#b39ddb'],
    ['#ffd54f', '#fff176', '#d4e157', '#ffca28'],
    ['#ff9100', '#ff6d00', '#ffab40', '#ff3d00'],
    ['#b388ff', '#7c4dff', '#ea80fc', '#d1c4e9'],
  ];

  function Amb() {
    this.kind = 0; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.dx = 0; this.dy = 0;
    this.age = 0; this.max = 5; this.size = 2; this.ph = 0; this.f1 = 1; this.f2 = 1; this.f3 = 1;
    this.col = '#fff'; this.glow = null; this.core = null; this.ramp = null; this.fade = 1; this.dying = false;
  }
  const amb = new SmallPool(() => new Amb(), 90);
  let ambKind = -1;
  let ambAcc = 0;
  let ambColors = AMB_DEFAULT_COLORS[0];
  let ambBiome = null;
  let ambLastT = -99;

  function ambKindOf(biome) {
    if (typeof biome === 'string') {
      if (AMB_IDS[biome] != null) return AMB_IDS[biome];
      return AMB_IDS[AMB_BY_BIOME[biome]] != null ? AMB_IDS[AMB_BY_BIOME[biome]] : AMB_MOTES;
    }
    const name = biome.ambient || AMB_BY_BIOME[biome.id];
    return AMB_IDS[name] != null ? AMB_IDS[name] : AMB_MOTES;
  }

  function spawnAmb(kind) {
    const v = SK.cam.view;
    const a = amb.get();
    if (!a) return;
    const col = ambColors[(rand() * ambColors.length) | 0] || '#ffffff';
    const pc = parseColor(col);
    const w = v.x1 - v.x0, h = v.y1 - v.y0;
    a.kind = kind;
    a.x = v.x0 + rand() * w;
    a.y = kind === AMB_EMBERS || kind === AMB_SOULS ? v.y0 + (0.25 + rand() * 0.85) * h : v.y0 + rand() * h;
    a.age = 0;
    a.ph = rand() * TAU;
    a.fade = 1;
    a.dying = false;
    a.col = pc.css;
    a.ramp = null;
    switch (kind) {
      case AMB_FIREFLIES:
        a.max = between(6, 10);
        a.size = between(1.4, 2.4);
        a.vx = between(-10, 10); a.vy = between(-8, 8);
        a.f1 = between(0.4, 0.9); a.f2 = between(0.5, 1.1); a.f3 = between(1.6, 3.2);
        a.glow = getSprite(SPR_GLOW, pc.key, 20);
        a.core = getSprite(SPR_HOT, pc.key, 8);
        break;
      case AMB_EMBERS:
        a.max = between(2.5, 5);
        a.size = between(1, 2.1);
        a.vx = between(-6, 14); a.vy = between(-75, -28);
        a.f1 = between(1.5, 3); a.f2 = between(5, 9); a.f3 = between(18, 28);
        a.glow = getSprite(SPR_GLOW, pc.key, 12);
        a.core = null;
        a.ramp = rampFor(mixKey(pc.key, '#fff3c4', 0.65), pc.key);
        break;
      case AMB_SOULS:
        a.max = between(5, 8);
        a.size = between(2.2, 3.8);
        a.vx = between(-8, 8); a.vy = between(-30, -12);
        a.f1 = between(0.8, 1.6); a.f2 = between(1.5, 3); a.f3 = between(2, 4);
        a.glow = getSprite(SPR_GLOW, pc.key, 32);
        a.core = getSprite(SPR_HOT, pc.key, 10);
        break;
      default:
        a.max = between(5, 9);
        a.size = between(0.9, 2.3);
        a.vx = between(-9, 9); a.vy = between(-7, 5);
        a.f1 = between(0.3, 0.8); a.f2 = between(0.3, 0.8); a.f3 = between(1, 2.5);
        a.glow = getSprite(SPR_GLOW, pc.key, 14);
        a.core = null;
        break;
    }
  }

  /** Called by game.js every frame with the current biome object (or an ambient name). */
  function ambient(biome, dt) {
    if (!biome) return;
    dt = +dt || 0;
    const kind = ambKindOf(biome);
    const obj = typeof biome === 'object' ? biome : null;
    ambBiome = obj;
    ambLastT = SK.time.t;
    const pal = obj && obj.palette && Array.isArray(obj.palette.ambient) && obj.palette.ambient.length
      ? obj.palette.ambient : AMB_DEFAULT_COLORS[kind];
    if (kind !== ambKind || pal !== ambColors) {
      if (kind !== ambKind) {
        for (let i = 0; i < amb.act.length; i++) {
          const a = amb.act[i];
          if (a.kind !== kind) a.dying = true;
        }
      }
      ambKind = kind;
      ambColors = pal;
    }
    if (!(dt > 0)) return;
    const target = AMBIENT_MAX[qi()];
    let alive = 0;
    for (let i = 0; i < amb.act.length; i++) if (!amb.act[i].dying) alive++;
    const rate = alive < target * 0.6 ? target / 1.6 : target / 3.5;
    ambAcc += dt * rate;
    if (ambAcc > 8) ambAcc = 8;
    while (ambAcc >= 1) {
      ambAcc -= 1;
      if (alive >= target) { ambAcc = 0; break; }
      spawnAmb(kind);
      alive++;
    }
  }

  function updateAmbient(dt) {
    const a = amb.act;
    if (!a.length) return;
    const v = SK.cam.view;
    const M = 160;
    for (let i = a.length - 1; i >= 0; i--) {
      const p = a[i];
      p.age += dt;
      if (p.dying) p.fade -= dt * 1.6;
      if (p.age >= p.max || p.fade <= 0) { amb.kill(i); continue; }
      const t = p.age;
      switch (p.kind) {
        case AMB_FIREFLIES:
          p.dx = p.vx + cos(t * p.f1 + p.ph) * 22;
          p.dy = p.vy + sin(t * p.f2 + p.ph * 1.3) * 16;
          break;
        case AMB_EMBERS:
          p.vy *= 1 - 0.12 * dt;
          p.dx = p.vx + sin(t * p.f1 + p.ph) * 14;
          p.dy = p.vy;
          break;
        case AMB_SOULS:
          p.dx = p.vx + sin(t * p.f1 + p.ph) * 18;
          p.dy = p.vy;
          break;
        default:
          p.dx = p.vx + cos(t * p.f1 + p.ph) * 6;
          p.dy = p.vy + sin(t * p.f2 + p.ph) * 6;
          break;
      }
      p.x += p.dx * dt;
      p.y += p.dy * dt;
      if (p.x < v.x0 - M || p.x > v.x1 + M || p.y < v.y0 - M || p.y > v.y1 + M) amb.kill(i);
    }
  }

  function renderAmbient(ctx, v) {
    const a = amb.act;
    if (!a.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < a.length; i++) {
      const p = a[i];
      if (p.x < v.x0 - 40 || p.x > v.x1 + 40 || p.y < v.y0 - 40 || p.y > v.y1 + 40) continue;
      const t = p.age / p.max;
      let env = Math.min(1, t / 0.2) * Math.min(1, (1 - t) / 0.3);
      env = smooth(env < 0 ? 0 : env) * (p.fade < 1 ? (p.fade > 0 ? p.fade : 0) : 1);
      if (env <= 0.01) continue;
      const s = p.size;
      switch (p.kind) {
        case AMB_FIREFLIES: {
          let b = sin(p.age * p.f3 + p.ph);
          b = b > 0 ? b * b * b : 0;
          const al = env * (0.12 + 0.88 * b);
          if (al <= 0.01) break;
          const gr = s * 9 * (0.75 + 0.25 * b);
          ctx.globalAlpha = al * 0.8;
          ctx.drawImage(p.glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
          const cr = s * 2.2;
          ctx.globalAlpha = al;
          ctx.drawImage(p.core, p.x - cr, p.y - cr, cr * 2, cr * 2);
          break;
        }
        case AMB_EMBERS: {
          const fl = 0.55 + 0.45 * sin(p.age * p.f3 + p.ph) * sin(p.age * p.f2 + p.ph * 2);
          const al = env * fl;
          if (al <= 0.01) break;
          const gr = s * 6;
          ctx.globalAlpha = al * 0.5;
          ctx.drawImage(p.glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
          const sp = Math.sqrt(p.dx * p.dx + p.dy * p.dy) || 1;
          const len = s * 1.5 + sp * 0.06;
          ctx.globalAlpha = al;
          ctx.strokeStyle = rampAt(p.ramp, t);
          ctx.lineWidth = s;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.dx / sp) * len, p.y - (p.dy / sp) * len);
          ctx.stroke();
          break;
        }
        case AMB_SOULS: {
          const al = env * (0.7 + 0.3 * sin(p.age * p.f3 + p.ph));
          const gr = s * 8;
          ctx.globalAlpha = al * 0.32;
          ctx.drawImage(p.glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
          // wispy tail trailing behind the motion
          for (let k = 1; k <= 3; k++) {
            const tx = p.x - p.dx * 0.09 * k, ty = p.y - p.dy * 0.12 * k;
            const tr = s * (2.6 - k * 0.55);
            ctx.globalAlpha = al * (0.42 - k * 0.11);
            ctx.drawImage(p.glow, tx - tr, ty - tr, tr * 2, tr * 2);
          }
          const cr = s * 2.3;
          ctx.globalAlpha = al;
          ctx.drawImage(p.core, p.x - cr, p.y - cr, cr * 2, cr * 2);
          break;
        }
        default: {
          const al = env * 0.75 * (0.7 + 0.3 * sin(p.age * p.f3 * 2 + p.ph));
          const gr = s * 6;
          ctx.globalAlpha = al * 0.6;
          ctx.drawImage(p.glow, p.x - gr, p.y - gr, gr * 2, gr * 2);
          ctx.globalAlpha = al;
          ctx.fillStyle = p.col;
          ctx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
          break;
        }
      }
    }
  }

  /* ===================================================== SCREEN SPACE */
  function Flash() { this.col = '#fff'; this.a = 0; this.dur = 0.2; this.t = 0; this.add = true; this.on = false; }
  const flashes = [];
  for (let i = 0; i < 8; i++) flashes.push(new Flash());
  function Vig() { this.col = '#000'; this.a = 0; this.dur = 0.4; this.t = 0; this.on = false; }
  const vigs = [];
  for (let i = 0; i < 6; i++) vigs.push(new Vig());

  /** Full-screen flash (screen space). Bright colours add light, dark ones darken. */
  function flash(color, alpha, duration) {
    const pc = parseColor(color || '#ffffff');
    let slot = null;
    for (let i = 0; i < flashes.length; i++) if (!flashes[i].on) { slot = flashes[i]; break; }
    if (!slot) {
      let best = 1e9;
      for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i];
        const rem = (f.dur - f.t) * f.a;
        if (rem < best) { best = rem; slot = f; }
      }
    }
    slot.col = pc.css;
    slot.a = U.clamp(alpha == null ? 0.5 : +alpha || 0, 0, 1);
    slot.dur = Math.max(0.02, duration == null ? 0.25 : +duration || 0.25);
    slot.t = 0;
    slot.add = pc.lum > 0.25;
    slot.on = true;
  }

  /** Coloured edge vignette pulse, e.g. red when hurt. */
  function vignette(color, alpha, duration) {
    const pc = parseColor(color || '#ff1744');
    let slot = null;
    for (let i = 0; i < vigs.length; i++) if (vigs[i].on && vigs[i].col === pc.key) { slot = vigs[i]; break; }
    if (!slot) for (let i = 0; i < vigs.length; i++) if (!vigs[i].on) { slot = vigs[i]; break; }
    if (!slot) {
      let best = 1e9;
      for (let i = 0; i < vigs.length; i++) {
        const g = vigs[i];
        const rem = (g.dur - g.t) * g.a;
        if (rem < best) { best = rem; slot = g; }
      }
    }
    const a = U.clamp(alpha == null ? 0.5 : +alpha || 0, 0, 1);
    // re-triggering the same colour keeps the stronger remaining intensity
    if (slot.on && slot.col === pc.key) {
      const k = slot.t / slot.dur;
      const cur = slot.a * (k < 0.1 ? 1 : Math.pow(1 - k, 1.5));
      if (cur > a) return;
    }
    slot.col = pc.key;
    slot.a = a;
    slot.dur = Math.max(0.05, duration == null ? 0.4 : +duration || 0.4);
    slot.t = 0;
    slot.on = true;
  }

  let scrW = 0, scrH = 0;
  const vigCache = new Map();

  function buildVignette(pc, W, H) {
    const vw = Math.max(32, Math.round(W / 4)), vh = Math.max(24, Math.round(H / 4));
    const c = makeCanvas(vw, vh);
    const g = c.getContext('2d');
    if (!g) return c;
    g.save();
    g.translate(vw / 2, vh / 2);
    g.scale(1, vh / vw);
    const R = (vw / 2) * Math.SQRT2;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, R);
    grad.addColorStop(0, rgbaOf(pc, 0));
    grad.addColorStop(0.48, rgbaOf(pc, 0));
    grad.addColorStop(0.66, rgbaOf(pc, 0.16));
    grad.addColorStop(0.82, rgbaOf(pc, 0.5));
    grad.addColorStop(1, rgbaOf(pc, 0.92));
    g.fillStyle = grad;
    g.fillRect(-vw, -vw, vw * 2, vw * 2);
    g.restore();
    return c;
  }
  function vignetteFor(color) {
    const pc = parseColor(color);
    let c = vigCache.get(pc.key);
    if (!c) {
      if (vigCache.size >= 12) vigCache.delete(vigCache.keys().next().value);
      c = buildVignette(pc, scrW, scrH);
      vigCache.set(pc.key, c);
    }
    return c;
  }
  function onResize() {
    vigCache.clear();
    scrW = SK.W; scrH = SK.H;
  }
  if (SK.events && SK.events.on) SK.events.on('resize', onResize);

  /* --- colour grading per biome: a stretched vertical gradient strip */
  const GRADES = {
    cave: [[0, '#4dd0e1', 0.075], [0.45, '#4dd0e1', 0], [0.6, '#2a1470', 0], [1, '#2a1470', 0.17]],
    forest: [[0, '#ffe082', 0.075], [0.45, '#ffe082', 0], [0.6, '#003c28', 0], [1, '#003c28', 0.17]],
    volcano: [[0, '#140500', 0.2], [0.42, '#140500', 0], [0.62, '#ff5722', 0], [1, '#ff5722', 0.13]],
    demon: [[0, '#7828c8', 0.12], [0.45, '#7828c8', 0], [0.6, '#a00028', 0], [1, '#a00028', 0.17]],
  };
  const gradeCache = new Map();
  function gradeFor(biome) {
    const id = biome && biome.id != null ? String(biome.id) : 'default';
    let c = gradeCache.get(id);
    if (c) return c;
    let stops = GRADES[id];
    if (!stops) {
      const pal = (biome && biome.palette) || EMPTY;
      const top = pal.light || pal.accent || '#9fa8da';
      const bot = pal.fog || pal.bg || '#1a1030';
      stops = [[0, top, 0.07], [0.45, top, 0], [0.6, bot, 0], [1, bot, 0.15]];
    }
    c = makeCanvas(4, 128);
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 128);
      for (let i = 0; i < stops.length; i++) grad.addColorStop(stops[i][0], rgbaOf(parseColor(stops[i][1]), stops[i][2]));
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 128);
    }
    if (gradeCache.size > 12) gradeCache.clear();
    gradeCache.set(id, c);
    return c;
  }
  let gradeCur = null, gradePrev = null, gradeMix = 1, gradeKey = null;

  function currentBiome() {
    if (ambBiome && SK.time.t - ambLastT < 1) return ambBiome;
    const G = SK.G;
    const W = SK.World;
    if (G && W && W.biomes && W.biomes[G.biome]) return W.biomes[G.biome];
    return ambBiome;
  }

  let scrLastT = -1;
  let hpPulse = 0;

  function renderScreen(ctx) {
    if (!ctx) return;
    const now = SK.time.t;
    let rdt = scrLastT < 0 ? 0 : now - scrLastT;
    scrLastT = now;
    if (!(rdt > 0)) rdt = 0;
    else if (rdt > 0.1) rdt = 0.1;
    const W = SK.W, H = SK.H;
    if (W !== scrW || H !== scrH) onResize();
    const q = qi();
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';

      // 1) biome colour grading (crossfades on biome change)
      const biome = currentBiome();
      if (q > 0 && biome) {
        const key = biome.id != null ? String(biome.id) : 'default';
        if (key !== gradeKey) {
          gradePrev = gradeCur;
          gradeCur = gradeFor(biome);
          gradeKey = key;
          gradeMix = gradePrev ? 0 : 1;
        }
        if (gradeMix < 1) gradeMix = Math.min(1, gradeMix + rdt / 1.5);
        if (gradePrev && gradeMix < 1) {
          ctx.globalAlpha = 1 - gradeMix;
          ctx.drawImage(gradePrev, 0, 0, W, H);
        }
        if (gradeCur) {
          ctx.globalAlpha = gradeMix;
          ctx.drawImage(gradeCur, 0, 0, W, H);
        }
      }

      // 2) permanent soft vignette
      ctx.globalAlpha = VIGNETTE_BASE[q];
      ctx.drawImage(vignetteFor('#02030a'), 0, 0, W, H);

      // 3) low-HP heartbeat
      const G = SK.G;
      const pl = G && G.player;
      let target = 0;
      if (pl && !pl.dead && pl.maxHp > 0 && G.state !== 'title' && G.state !== 'gameover' && G.state !== 'victory') {
        const ratio = pl.hp / pl.maxHp;
        if (ratio < 0.3) target = 1 - Math.max(0, ratio) / 0.3;
        else target = 0;
        target = target > 0 ? 0.25 + 0.75 * target : 0;
      }
      hpPulse = U.damp(hpPulse, target, 5, rdt);
      if (hpPulse > 0.01) {
        const rate = 1.1 + 0.9 * hpPulse;
        const ph = (now * rate) % 1;
        const d1 = (ph - 0.06) / 0.055, d2 = (ph - 0.27) / 0.06;
        const beat = Math.exp(-d1 * d1) + 0.6 * Math.exp(-d2 * d2);
        ctx.globalAlpha = Math.min(1, hpPulse * (0.35 + 0.65 * beat) * 0.85);
        ctx.drawImage(vignetteFor('#ff1744'), 0, 0, W, H);
        if (q > 0) {
          ctx.globalAlpha = hpPulse * beat * 0.06;
          ctx.fillStyle = '#ff1744';
          ctx.fillRect(0, 0, W, H);
        }
      }

      // 4) timed coloured vignettes
      for (let i = 0; i < vigs.length; i++) {
        const g = vigs[i];
        if (!g.on) continue;
        g.t += rdt;
        if (g.t >= g.dur) { g.on = false; continue; }
        const k = g.t / g.dur;
        const al = g.a * (k < 0.1 ? k / 0.1 : Math.pow(1 - (k - 0.1) / 0.9, 1.5));
        if (al <= 0.005) continue;
        ctx.globalAlpha = al > 1 ? 1 : al;
        ctx.drawImage(vignetteFor(g.col), 0, 0, W, H);
      }

      // 5) flashes on top
      for (let i = 0; i < flashes.length; i++) {
        const f = flashes[i];
        if (!f.on) continue;
        f.t += rdt;
        if (f.t >= f.dur) { f.on = false; continue; }
        const k = 1 - f.t / f.dur;
        const al = f.a * k * k;
        if (al <= 0.005) continue;
        ctx.globalCompositeOperation = f.add ? 'lighter' : 'source-over';
        ctx.globalAlpha = al;
        ctx.fillStyle = f.col;
        ctx.fillRect(0, 0, W, H);
      }
    } finally {
      ctx.restore();
    }
  }

  /* ============================================== COMPOSITE HELPERS */
  /** Big explosion: flash ring + sparks + fire + smoke + debris + embers. opts {radius=90, color='#ff9100', shake}. */
  function explosion(x, y, opts) {
    const o = opts || EMPTY;
    const R = Math.max(10, o.radius == null ? 90 : o.radius);
    const col = parseColor(o.color || '#ff9100').key;
    const light = mixKey(col, '#ffffff', 0.55);
    const dark = mixKey(col, '#1a0500', 0.75);
    ring(x, y, { radius: R * 1.25, color: col, life: 0.5, width: Math.max(4, R * 0.1), fill: true });
    ring(x, y, { radius: R * 0.75, color: light, life: 0.28, width: Math.max(2, R * 0.05) });
    glowPuff(x, y, R * 1.5, R * 0.35, 0.34, light, 0.95);
    burst(x, y, {
      count: 10 + R / 7, colors: [light, col, '#ffffff'], colorEnd: col, speed: [R * 2.2, R * 5.5],
      life: [0.2, 0.5], size: [1.5, 3.2], shape: 'spark', drag: 4,
    });
    burst(x, y, {
      count: 8 + R / 12, colors: ['#fff3c4', light], colorEnd: dark, speed: [R * 0.6, R * 2],
      life: [0.3, 0.7], size: [R * 0.06, R * 0.14], shape: 'circle', drag: 3.5, glow: true, glowSize: 2.4,
    });
    burst(x, y, {
      count: 5 + R / 20, color: '#1c1622', speed: [R * 0.3, R * 1.1], life: [0.7, 1.3],
      size: [R * 0.14, R * 0.22], sizeEnd: 2.4, shape: 'smoke', drag: 2.2, gravity: -40, alpha: 0.5, radius: R * 0.25,
    });
    burst(x, y, {
      count: 4 + R / 25, colors: [dark, '#3a2a2a'], speed: [R * 1.5, R * 3.5], life: [0.4, 0.8],
      size: [2, 4], shape: 'square', gravity: 420, drag: 1.2, shrink: false, add: false,
    });
    if (qi() > 0) {
      burst(x, y, {
        count: 4 + R / 30, colors: ['#ffab40', '#ffd54f'], speed: [20, 80], life: [0.8, 1.6],
        size: [1.2, 2.2], shape: 'spark', gravity: -90, drag: 1, glow: true, flicker: 20, radius: R * 0.5,
      });
    }
    if (o.shake && SK.cam && SK.cam.shake) SK.cam.shake(o.shake, 0.35);
  }

  /** Small star twinkle. */
  function sparkle(x, y, color) {
    const col = parseColor(color || '#fff59d').key;
    const p = spawnP(x, y, 0, 0, 0.5, between(5.5, 8), 0, rampFor('#ffffff', col), SH_STAR, true);
    if (p) {
      p.smode = 1;
      p.rot = rand() * TAU;
      p.vrot = (rand() - 0.5) * 4;
      p.glow = getSprite(SPR_HOT, col, 32);
      p.gm = 2.6;
      p.ga = 0.6;
      p.fo = 1.5;
      p.m = 60;
    }
    burst(x, y, {
      count: 3, colors: [col, '#ffffff'], speed: [10, 45], life: [0.3, 0.6], size: [0.9, 1.7],
      shape: 'circle', glow: true, drag: 2,
    });
  }

  /** Level-up: column of light + rings + rising stars + spiral. */
  function levelUpBurst(x, y) {
    const GOLD = '#ffd54f', CY = '#80deea', WARM = '#fff8e1';
    beam(x, y + 8, { color: GOLD, width: 84, height: 460, life: 1.1 });
    ring(x, y, { radius: 130, color: GOLD, life: 0.6, width: 8, fill: true });
    ring(x, y, { radius: 85, color: CY, life: 0.5, width: 4, delay: 0.12 });
    glowPuff(x, y, 120, 40, 0.5, GOLD, 0.8);
    burst(x, y, {
      count: 22, colors: [GOLD, WARM, CY], speed: [20, 90], life: [0.9, 1.5], size: [3, 6],
      shape: 'star', gravity: -170, drag: 1.5, glow: true, radius: 30, spin: 4,
    });
    burst(x, y, {
      count: 16, colors: [GOLD, '#ffffff'], speed: [180, 380], life: [0.25, 0.5], size: [1.5, 2.5],
      shape: 'spark', drag: 4,
    });
    // spiral of sparks winding up the column
    const n = scaleCount(16);
    const ramp = rampFor(WARM, GOLD);
    const glow = getSprite(SPR_GLOW, GOLD, 24);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = 38;
      const p = spawnP(x + cos(a) * r, y + sin(a) * r * 0.45, -sin(a) * 120, -60 - i * 9,
        0.7 + i * 0.03, 2.4, 0.6, ramp, SH_SPARK, true);
      if (!p) break;
      p.drag = 1.2;
      p.grav = -80;
      p.glow = glow;
      p.gm = 3;
      p.ga = 0.5;
    }
    after(0.18, () => sparkle(x + (rand() - 0.5) * 30, y - 90 - rand() * 40, GOLD));
    after(0.32, () => sparkle(x + (rand() - 0.5) * 40, y - 170 - rand() * 50, CY));
    after(0.46, () => sparkle(x + (rand() - 0.5) * 30, y - 260 - rand() * 60, WARM));
  }

  /** Evolution: gigantic multi-ring, god-rays, star storm, screen flash. */
  function evolveBurst(x, y, color) {
    const col = parseColor(color || '#b388ff').key;
    const light = mixKey(col, '#ffffff', 0.6);
    flash(light, 0.4, 0.6);
    lightRays(x, y, { count: 16, color: light, life: 1.8, radius: 520 });
    const radii = [150, 240, 340, 460, 600];
    const delays = [0, 0.07, 0.16, 0.28, 0.42];
    const cols = ['#ffffff', col, light, col, light];
    for (let i = 0; i < radii.length; i++) {
      ring(x, y, {
        radius: radii[i], color: cols[i], life: 0.7 + i * 0.12, width: 16 - i * 2.4,
        fill: i === 0, delay: delays[i],
      });
    }
    glowPuff(x, y, 300, 60, 0.8, light, 0.9);
    burst(x, y, {
      count: 50, colors: ['#ffffff', light, col], speed: [300, 900], life: [0.3, 0.8], size: [2, 4],
      shape: 'spark', drag: 3,
    });
    burst(x, y, {
      count: 26, colors: [light, col, '#fff8e1'], speed: [80, 300], life: [0.8, 1.6], size: [3, 7],
      shape: 'star', glow: true, gravity: -60, drag: 2, spin: 6,
    });
    burst(x, y, {
      count: 30, colors: [col, light], speed: [100, 500], life: [0.5, 1.1], size: [3, 8],
      shape: 'circle', glow: true, drag: 3,
    });
    after(0.25, () => {
      burst(x, y, {
        count: 24, colors: [col, light], speed: [200, 420], life: [0.5, 0.9], size: [3, 5],
        shape: 'drop', drag: 2.5,
      });
      ring(x, y, { radius: 200, color: light, life: 0.45, width: 6 });
    });
    after(0.5, () => {
      ring(x, y, { radius: 380, color: light, life: 0.6, width: 5 });
      burst(x, y, {
        count: 24, colors: ['#ffffff', light], speed: [40, 160], life: [0.8, 1.4], size: [2.5, 5],
        shape: 'star', glow: true, gravity: -90, drag: 1.5, radius: 90, spin: 5,
      });
    });
  }

  /** Small impact: directional spark fan + flash + tiny ring. angle optional. */
  function hit(x, y, color, angle) {
    const col = parseColor(color || '#ffffff').key;
    const dir = angle != null && isFinite(angle);
    burst(x, y, {
      count: 5, colors: [col, '#ffffff'], speed: [160, 380], life: [0.12, 0.28], size: [1.2, 2.4],
      shape: 'spark', angle: dir ? angle : 0, spread: dir ? 1.3 : TAU, drag: 6,
    });
    glowPuff(x, y, 24, 8, 0.14, col, 0.8);
    if (qi() > 0) ring(x, y, { radius: 20, color: col, life: 0.16, width: 2.5 });
  }

  /** Healing: rising green crosses + soft ring. */
  function heal(x, y, color) {
    const col = parseColor(color || '#69f0ae').key;
    burst(x, y, {
      count: 8, colors: [col, '#b9f6ca'], speed: [10, 40], gravity: -60, life: [0.6, 1.0],
      size: [3, 5], shape: 'plus', glow: true, glowSize: 2.2, radius: 18, shrink: false, sizeEnd: 0.6, drag: 1,
    });
    ring(x, y, { radius: 46, color: col, life: 0.45, width: 3 });
  }

  /** Monster death pop: goo droplets + ring + glow. */
  function death(x, y, color, r) {
    const col = parseColor(color || '#7fdcff').key;
    const rr = Math.max(6, r || 16);
    const light = mixKey(col, '#ffffff', 0.5);
    ring(x, y, { radius: rr * 2.8, color: col, life: 0.35, width: Math.max(2, rr * 0.22) });
    glowPuff(x, y, rr * 2.4, rr * 0.6, 0.25, light, 0.8);
    burst(x, y, {
      count: 8 + rr / 4, color: col, colorEnd: mixKey(col, '#000000', 0.5), speed: [rr * 4, rr * 11],
      life: [0.3, 0.6], size: [rr * 0.12, rr * 0.25], shape: 'drop', drag: 3.5, add: false,
    });
    burst(x, y, {
      count: 6, colors: [light, '#ffffff'], speed: [rr * 3, rr * 8], life: [0.2, 0.45], size: [1.2, 2.4],
      shape: 'circle', glow: true, drag: 4,
    });
  }

  /** Particles converging into (x,y) from a ring (charging / absorbing). opts {radius=120, count=10, color, life=0.5, size=2}. */
  function converge(x, y, opts) {
    const o = opts || EMPTY;
    const R = Math.max(8, o.radius == null ? 120 : o.radius);
    const life = Math.max(0.08, o.life == null ? 0.5 : o.life);
    const n = scaleCount(o.count == null ? 10 : o.count);
    const col = parseColor(o.color || '#80d8ff').key;
    const ramp = rampFor(col, o.colorEnd || '#ffffff');
    const glow = o.glow === false ? null : getSprite(SPR_GLOW, col, 24);
    const size = o.size == null ? 2 : o.size;
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU;
      const r = R * (0.75 + rand() * 0.25);
      const lf = life * (0.75 + rand() * 0.25);
      const sp = r / lf;
      const p = spawnP(x + cos(a) * r, y + sin(a) * r, -cos(a) * sp, -sin(a) * sp, lf, size, size * 0.4,
        ramp, SH_SPARK, true);
      if (!p) break;
      p.fin = 0.25;
      p.fo = 6;
      p.stretch = 0.8;
      if (glow) { p.glow = glow; p.gm = 3; p.ga = 0.45; }
      p.m = R + 30;
    }
  }

  /* =================================================== LIFECYCLE */
  function update(dt) {
    dt = +dt;
    if (!(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    updateTimers(dt);
    updateParticles(dt);
    updateRings(dt);
    updateBolts(dt);
    updateSlashes(dt);
    updateTexts(dt);
    updateGhosts(dt);
    updateRays(dt);
    updateBeams(dt);
    updateAmbient(dt);
  }

  function render(ctx) {
    if (!ctx) return;
    const q = qi();
    const v = SK.cam.view;
    ctx.save();
    try {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      renderAmbient(ctx, v);
      renderGhosts(ctx, v);
      renderRays(ctx, v);
      renderBeams(ctx, v);
      renderParticles(ctx, v);
      renderRings(ctx, v, q);
      renderSlashes(ctx, v, q);
      renderBolts(ctx, v, q);
      renderTexts(ctx, v, q);
    } finally {
      ctx.restore();
    }
  }

  function clear() {
    while (pAct.length) pFree.push(pAct.pop());
    rings.clear();
    bolts.clear();
    slashes.clear();
    texts.clear();
    ghosts.clear();
    for (let i = 0; i < rays.act.length; i++) rays.act[i].follow = null;
    rays.clear();
    beams.clear();
    amb.clear();
    timers.length = 0;
    ambAcc = 0;
    ambKind = -1;
    for (let i = 0; i < flashes.length; i++) flashes[i].on = false;
    for (let i = 0; i < vigs.length; i++) vigs[i].on = false;
    hpPulse = 0;
  }

  function count() {
    return pAct.length + amb.act.length;
  }

  SK.FX = {
    // contract §5.2
    glowSprite,
    drawGlow,
    burst,
    spark,
    ring,
    text,
    lightning,
    slash,
    trail,
    flash,
    vignette,
    ambient,
    clear,
    update,
    render,
    renderScreen,
    count,
    // composite helpers
    explosion,
    sparkle,
    levelUpBurst,
    evolveBurst,
    lightRays,
    beam,
    hit,
    heal,
    death,
    converge,
    after,
    // small utilities other modules may find handy
    softSprite: (color, radius) => getSprite(SPR_SOFT, color, radius),
    parseColor,
    stats: () => ({
      particles: pAct.length, ambient: amb.act.length, rings: rings.act.length, bolts: bolts.act.length,
      slashes: slashes.act.length, texts: texts.act.length, ghosts: ghosts.act.length, sprites: spriteCount,
    }),
  };
})(window.SK);
