/* Slime Reborn — SK.Slime: the hero's soft-body jelly, wild/ally slimes, procedural rendering
 * and per-stage cosmetics (crystal core, demon horns & flames, crown, wings, rune circles). */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const HALF_PI = PI * 0.5;
  const EMPTY = Object.freeze({});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const frac = (v) => v - Math.floor(v);
  const now = () => (SK.time && isFinite(SK.time.t) ? SK.time.t : 0);

  /* ================================================================ soft body */
  // Every body lives in "unit space": radius 1 around the entity center, +y down.
  const N = 16;
  const SUBSTEP = 1 / 120;
  const MAX_SUBSTEPS = 16;
  // The two oscillators below drive the big squash & stretch; the verlet ring rides on top of
  // them (stiffer, ~5 Hz) and adds the organic wobble, inertial lag and local dents from hits.
  const K_SHAPE = 900; // point -> target-shape spring (radial anchoring)
  const K_EDGE = 500; // neighbour springs
  const K_PRESS = 420; // area pressure
  const DAMP = 7; // velocity damping (1/s)
  const INERTIA = 0.42; // how much the jelly lags behind center acceleration
  const MAX_IMPULSE = 5; // unit/s cap per frame for the inertial kick
  const K_ST = 170, C_ST = 8.5; // stretch-along-velocity oscillator (bouncy)
  const K_GS = 260, C_GS = 9.5; // ground squash oscillator (bouncy)
  const ST_MIN = -0.3, ST_MAX = 0.62; // stretch limits (dash peaks near the top)
  const GS_MIN = -0.36, GS_MAX = 0.36; // ground squash limits
  const VEL_MAX = 10; // oscillator velocity cap (many hits in one frame stay sane)
  const GROUND_Y = 0.84; // where the mochi's flat-ish bottom touches the ground

  // Base "mochi" silhouette: round dome, slightly flattened and widened at the bottom.
  const BASE_X = new Float32Array(N);
  const BASE_Y = new Float32Array(N);
  const DIR_X = new Float32Array(N);
  const DIR_Y = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = -HALF_PI + (i / N) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    DIR_X[i] = c;
    DIR_Y[i] = s;
    const low = s > 0 ? s : 0;
    BASE_X[i] = c * (1.03 + 0.08 * low);
    BASE_Y[i] = s * (s > 0 ? 0.84 : 0.97);
  }
  function polyArea(xs, ys) {
    let a = 0;
    for (let i = 0, j = N - 1; i < N; j = i++) a += xs[j] * ys[i] - xs[i] * ys[j];
    return a * 0.5;
  }
  const BASE_AREA = polyArea(BASE_X, BASE_Y);

  /** Writes the 2x2 deformation (stretch `st` along angle `sa`, ground squash `gs`) into o.a..o.d. */
  function shapeMatrix(o, st, sa, gs) {
    const s = 1 + st, is = 1 / s;
    const C = Math.cos(sa), S = Math.sin(sa);
    const m11 = s * C * C + is * S * S;
    const m12 = C * S * (s - is);
    const m22 = s * S * S + is * C * C;
    const gx = 1 + gs * 0.7, gy = 1 - gs;
    o.a = gx * m11;
    o.c = gx * m12;
    o.b = gy * m12;
    o.d = gy * m22;
    o.gy = gy;
  }

  function computeTargets(bd) {
    const a = bd.a, b = bd.b, c = bd.c, d = bd.d;
    const tx = bd.tx, ty = bd.ty, rest = bd.rest;
    for (let i = 0; i < N; i++) {
      tx[i] = a * BASE_X[i] + c * BASE_Y[i];
      ty[i] = b * BASE_X[i] + d * BASE_Y[i];
    }
    for (let i = 0; i < N; i++) {
      const j = i === N - 1 ? 0 : i + 1;
      const dx = tx[j] - tx[i], dy = ty[j] - ty[i];
      rest[i] = Math.sqrt(dx * dx + dy * dy);
    }
    const det = a * d - b * c;
    bd.tArea = BASE_AREA * (det > 0.2 ? det : 0.2);
  }

  /** One Verlet substep: shape springs + neighbour springs + area pressure. */
  function stepPoints(bd, h) {
    const px = bd.px, py = bd.py, ox = bd.ox, oy = bd.oy;
    const tx = bd.tx, ty = bd.ty, fx = bd.fx, fy = bd.fy, rest = bd.rest;
    let area = 0;
    for (let i = 0, j = N - 1; i < N; j = i++) area += px[j] * py[i] - px[i] * py[j];
    area *= 0.5;
    const tA = bd.tArea;
    const pr = (K_PRESS * (tA - area)) / tA * 0.5;
    const ks = K_SHAPE * bd.stiff;
    for (let i = 0; i < N; i++) {
      const ip = i === 0 ? N - 1 : i - 1;
      const inx = i === N - 1 ? 0 : i + 1;
      // outward normal of the polygon at i (points are ordered with positive area)
      fx[i] = (tx[i] - px[i]) * ks + (py[inx] - py[ip]) * pr;
      fy[i] = (ty[i] - py[i]) * ks - (px[inx] - px[ip]) * pr;
    }
    for (let i = 0; i < N; i++) {
      const j = i === N - 1 ? 0 : i + 1;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      const L = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const f = (K_EDGE * (L - rest[i])) / L;
      fx[i] += dx * f;
      fy[i] += dy * f;
      fx[j] -= dx * f;
      fy[j] -= dy * f;
    }
    const damp = Math.exp(-DAMP * h), h2 = h * h;
    for (let i = 0; i < N; i++) {
      const vx = (px[i] - ox[i]) * damp, vy = (py[i] - oy[i]) * damp;
      ox[i] = px[i];
      oy[i] = py[i];
      let nx = px[i] + vx + fx[i] * h2;
      let ny = py[i] + vy + fy[i] * h2;
      if (!(nx === nx) || !(ny === ny)) {
        nx = ox[i] = tx[i];
        ny = oy[i] = ty[i];
      } else {
        // keep every point inside a sane envelope around its target (no inversions, no explosions)
        const ex = nx - tx[i], ey = ny - ty[i], e2 = ex * ex + ey * ey;
        if (e2 > 0.3025) {
          const k = 0.55 / Math.sqrt(e2);
          nx = tx[i] + ex * k;
          ny = ty[i] + ey * k;
          ox[i] = nx - (nx - ox[i]) * 0.5;
          oy[i] = ny - (ny - oy[i]) * 0.5;
        }
      }
      px[i] = nx;
      py[i] = ny;
    }
  }

  function resetBody(bd) {
    if (!bd || !bd.px) return bd;
    bd.st = bd.stV = bd.gs = bd.gsV = 0;
    bd.hopAmp = 0;
    bd.hopPh = 0;
    bd.stiff = bd.stiff || 1;
    shapeMatrix(bd, 0, bd.sa || 0, 0);
    computeTargets(bd);
    for (let i = 0; i < N; i++) {
      bd.px[i] = bd.ox[i] = bd.tx[i];
      bd.py[i] = bd.oy[i] = bd.ty[i];
    }
    bd.jx = bd.jy = 0;
    bd.pokeT = 0;
    bd.absOpen = 0;
    return bd;
  }

  /** Creates a SlimeBody (ring of N verlet points + squash/stretch oscillators + face state). */
  function createBody(radius) {
    const bd = {
      n: N,
      r: radius > 0 ? +radius : 22,
      px: new Float32Array(N), py: new Float32Array(N),
      ox: new Float32Array(N), oy: new Float32Array(N),
      tx: new Float32Array(N), ty: new Float32Array(N),
      fx: new Float32Array(N), fy: new Float32Array(N),
      rest: new Float32Array(N),
      a: 1, b: 0, c: 0, d: 1, gy: 1, tArea: BASE_AREA, stiff: 1,
      st: 0, stV: 0, sa: HALF_PI, gs: 0, gsV: 0,
      hopPh: 0, hopAmp: 0,
      x: NaN, y: NaN, lvx: 0, lvy: 0, speed: 0, lastH: SUBSTEP,
      t: Math.random() * 20, seed: Math.random(),
      blink: 0, blinkT: 0.8 + Math.random() * 2.4, blinkPh: -1, blinkAgain: false, noDouble: false,
      idleT: 0, joyT: 0, nextJoy: 5 + Math.random() * 4,
      absorbing: false, absT: 0, absOpen: 0,
      dashing: false, hurt: false, landing: false, pokeT: 0,
      jx: 0, jy: 0, stage: 0,
    };
    return resetBody(bd);
  }

  /**
   * Jiggle impulse. `angle` = direction the impact pushes the slime (from the attacker toward it).
   * `strength` ~0..1.6 as a fraction of the radius (values > 3 are read as pixels and normalised).
   * Accepts the entity itself too (uses ent.body).
   */
  function poke(bd, angle, strength) {
    if (bd && !bd.px && bd.body && bd.body.px) bd = bd.body;
    if (!bd || !bd.px) return;
    let s = +strength;
    if (!(s > 0)) s = 0.6;
    if (s > 3) s /= bd.r || 22;
    if (s > 1.6) s = 1.6;
    const ang = isFinite(angle) ? +angle : Math.random() * TAU;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let i = 0; i < N; i++) {
      const face = -(DIR_X[i] * dx + DIR_Y[i] * dy); // > 0 on the struck side
      if (face > 0) {
        const k = s * 0.3 * face * Math.sqrt(face);
        bd.px[i] += dx * k;
        bd.py[i] += dy * k;
        bd.ox[i] += dx * k * 0.88;
        bd.oy[i] += dy * k * 0.88;
      } else {
        const k = s * 0.012 * -face; // the shock wave pushes the far side outward a little
        bd.ox[i] -= dx * k;
        bd.oy[i] -= dy * k;
      }
    }
    bd.gsV += s * 2.5;
    bd.stV -= s * 1.5;
    bd.pokeT = Math.max(bd.pokeT, 0.18 + s * 0.15);
  }

  /**
   * Advances the jelly. opts: {absorbing, hurt, dash, stage, landing, r}.
   * vx/vy may be omitted (null) and are then derived from the position delta.
   * Stable for any dt (substeps at 1/120 s); dt <= 0 (hitstop) freezes it.
   */
  function updateBody(bd, x, y, vx, vy, dt, opts) {
    if (!bd || !bd.px) return bd;
    opts = opts || EMPTY;
    if (!(dt > 0)) return bd;
    if (dt > 0.2) dt = 0.2;
    if (opts.r > 0) bd.r = +opts.r;
    const R = bd.r > 0 ? bd.r : 22;
    x = +x || 0;
    y = +y || 0;
    const fresh = !(bd.x === bd.x);
    if (vx == null || !isFinite(vx)) vx = fresh ? 0 : (x - bd.x) / dt;
    if (vy == null || !isFinite(vy)) vy = fresh ? 0 : (y - bd.y) / dt;
    if (fresh || Math.abs(x - bd.x) > R * 10 + 200 || Math.abs(y - bd.y) > R * 10 + 200) {
      // spawn or teleport: start from rest instead of exploding
      bd.lvx = vx;
      bd.lvy = vy;
      resetBody(bd);
    }
    bd.x = x;
    bd.y = y;
    bd.t += dt;
    bd.stage = clamp(opts.stage | 0, 0, 3);
    bd.stiff = 1 + bd.stage * 0.07;
    const speed = Math.sqrt(vx * vx + vy * vy);
    bd.speed = U.damp(bd.speed, speed, 14, dt);

    // inertial kick from center acceleration (jelly lags behind, trailing side lags more)
    let ix = (-(vx - bd.lvx) / R) * INERTIA, iy = (-(vy - bd.lvy) / R) * INERTIA;
    bd.lvx = vx;
    bd.lvy = vy;
    let il = Math.sqrt(ix * ix + iy * iy);
    if (il > MAX_IMPULSE) {
      ix *= MAX_IMPULSE / il;
      iy *= MAX_IMPULSE / il;
      il = MAX_IMPULSE;
    }

    // edge-triggered juice
    const dash = !!opts.dash, absorbing = !!opts.absorbing, hurt = !!opts.hurt, landing = !!opts.landing;
    if (dash && !bd.dashing) {
      bd.stV += 5.5;
      bd.gsV -= 2.5;
      if (speed > 1) bd.sa = Math.atan2(vy, vx);
    } else if (!dash && bd.dashing) {
      bd.stV -= 3.5;
      bd.gsV += 2;
    }
    bd.dashing = dash;
    if (landing && !bd.landing) {
      const s = typeof opts.landing === 'number' ? clamp(opts.landing, 0, 3) : 1;
      bd.gsV += 6 * s;
    }
    bd.landing = landing;
    if (absorbing && !bd.absorbing) {
      bd.gsV -= 3.4; // inhale: stretch up before the gulp
      bd.absT = 0;
    } else if (!absorbing && bd.absorbing) {
      bd.gsV += 3;
    }
    bd.absorbing = absorbing;
    if (absorbing) {
      bd.absT += dt;
      bd.absOpen = Math.min(1, bd.absOpen + dt * 5.5);
    } else bd.absOpen = Math.max(0, bd.absOpen - dt * 7);
    if (hurt && !bd.hurt) poke(bd, Math.random() * TAU, 0.55);
    bd.hurt = hurt;
    if (bd.pokeT > 0) bd.pokeT = Math.max(0, bd.pokeT - dt);

    if (speed > 4) bd.sa = U.lerpAngle(bd.sa, Math.atan2(vy, vx), 1 - Math.exp(-16 * dt));

    // hopping gait: slimes bounce along; each touchdown squashes the jelly
    const moving = speed > 14 && !dash;
    const hopTarget = moving ? Math.min(1, speed / 150) * (absorbing ? 0.06 : 0.14) : 0;
    bd.hopAmp = U.damp(bd.hopAmp, hopTarget, moving ? 7 : 5, dt);
    const ph0 = frac(bd.hopPh);
    if (moving || (ph0 > 0 && bd.hopAmp > 0.004)) {
      const freq = moving ? clamp(speed / (R * 2.6 + 30), 1.5, 3.4) : 2.8;
      const prev = bd.hopPh;
      bd.hopPh += freq * dt;
      if (Math.floor(bd.hopPh) !== Math.floor(prev)) {
        bd.gsV += 0.6 + 11 * bd.hopAmp;
        if (!moving) bd.hopPh = Math.floor(bd.hopPh);
      }
    } else if (ph0 > 0) bd.hopPh = Math.floor(bd.hopPh);
    const hop = Math.abs(Math.sin(PI * frac(bd.hopPh))) * bd.hopAmp;

    // idle joy: every few seconds of standing still, a happy ^ ^ hop
    if (speed < 10 && !absorbing && !dash) {
      bd.idleT += dt;
      if (bd.idleT > bd.nextJoy) {
        bd.joyT = 1.4;
        bd.nextJoy = bd.idleT + 6 + Math.random() * 6;
        bd.hopAmp = Math.max(bd.hopAmp, 0.09);
        bd.hopPh = Math.floor(bd.hopPh) + 0.001;
        bd.gsV -= 2.5;
      }
    } else if (bd.idleT > 0) {
      bd.idleT = 0;
      bd.nextJoy = 5 + Math.random() * 4;
    }
    if (bd.joyT > 0) bd.joyT -= dt;

    // blinking (randomised, sometimes double)
    if (bd.blinkPh >= 0) {
      bd.blinkPh += dt / 0.15;
      if (bd.blinkPh >= 1) {
        bd.blinkPh = -1;
        if (bd.blinkAgain) {
          bd.blinkAgain = false;
          bd.noDouble = true;
          bd.blinkT = 0.07;
        } else bd.blinkT = 1.6 + Math.random() * 3.6;
      }
    } else {
      bd.blinkT -= dt;
      if (bd.blinkT <= 0) {
        bd.blinkPh = 0;
        bd.blinkAgain = !bd.noDouble && Math.random() < 0.22;
        bd.noDouble = false;
      }
    }
    bd.blink = bd.blinkPh >= 0 ? Math.sin(bd.blinkPh * PI) : 0;

    // oscillator targets
    let stT = Math.min(0.13, bd.speed / 1400) + (dash ? 0.38 : 0);
    if (absorbing) stT *= 0.5;
    const gsT = -hop * 0.85 + (absorbing ? 0.07 + Math.sin(bd.t * 15) * 0.02 : 0);

    let steps = Math.ceil(dt / SUBSTEP - 1e-6);
    if (steps < 1) steps = 1;
    else if (steps > MAX_SUBSTEPS) steps = MAX_SUBSTEPS;
    const h = dt / steps;
    // rescale the implicit Verlet velocities to the new step, then apply the inertial kick
    const vr = h / (bd.lastH > 0 ? bd.lastH : h);
    bd.lastH = h;
    const ux = il > 1e-6 ? ix / il : 0, uy = il > 1e-6 ? iy / il : 0;
    const px = bd.px, py = bd.py, ox = bd.ox, oy = bd.oy;
    for (let i = 0; i < N; i++) {
      const w = 1 + 0.6 * (DIR_X[i] * ux + DIR_Y[i] * uy);
      ox[i] = px[i] - (px[i] - ox[i]) * vr - ix * w * h;
      oy[i] = py[i] - (py[i] - oy[i]) * vr - iy * w * h;
    }
    bd.stV = clamp(bd.stV, -VEL_MAX, VEL_MAX);
    bd.gsV = clamp(bd.gsV, -VEL_MAX, VEL_MAX);
    for (let s = 0; s < steps; s++) {
      bd.stV += (K_ST * (stT - bd.st) - C_ST * bd.stV) * h;
      bd.st += bd.stV * h;
      if (bd.st > ST_MAX) { bd.st = ST_MAX; if (bd.stV > 0) bd.stV *= -0.3; }
      else if (bd.st < ST_MIN) { bd.st = ST_MIN; if (bd.stV < 0) bd.stV *= -0.3; }
      bd.gsV += (K_GS * (gsT - bd.gs) - C_GS * bd.gsV) * h;
      bd.gs += bd.gsV * h;
      if (bd.gs > GS_MAX) { bd.gs = GS_MAX; if (bd.gsV > 0) bd.gsV *= -0.3; }
      else if (bd.gs < GS_MIN) { bd.gs = GS_MIN; if (bd.gsV < 0) bd.gsV *= -0.3; }
      shapeMatrix(bd, bd.st, bd.sa, bd.gs);
      computeTargets(bd);
      stepPoints(bd, h);
    }
    let mx = 0, my = 0;
    for (let i = 0; i < N; i++) {
      mx += px[i] - bd.tx[i];
      my += py[i] - bd.ty[i];
    }
    bd.jx = mx / N;
    bd.jy = my / N;
    return bd;
  }

  /* ================================================================ palettes */
  const DEFAULT_RAW = {
    id: 'stage0',
    body: '#4fc3ff', light: '#d2f4ff', dark: '#1b62bd', deep: '#0b2a63', core: '#e8fbff',
    eye: '#0c1736', iris: '#5fd8ff', aura: '#4fc3ff', aura2: '#a6ecff', rim: '#f2fdff',
    cheek: '#ff8fc4', mouth: '#0c1736', tongue: '#ff6f96', horn: '#e9ecff', gem: '#ff5fa2',
    glow: 0.17, slit: false,
  };
  const STAGE_DEFS = [
    DEFAULT_RAW,
    { // Slime Primordiale — luminous cyan, crystal core, orbiting motes
      id: 'stage1',
      body: '#2ee6e0', light: '#d6fffb', dark: '#0b7f98', deep: '#053a4f', core: '#c4fff8',
      eye: '#062330', iris: '#74fff2', aura: '#3bffe6', aura2: '#b2fff4', rim: '#f2fffe',
      cheek: '#ff9ad2', mouth: '#062330', tongue: '#ff7096', horn: '#e6fffd', gem: '#9ffcff',
      glow: 0.22, slit: false,
    },
    { // Slime Demoniaco — indigo & silver, golden slit eyes, horns, dark flames
      id: 'stage2',
      body: '#5a49dc', light: '#e2e3ff', dark: '#251b6b', deep: '#0f0934', core: '#b9a6ff',
      eye: '#2a1203', iris: '#ffc53d', aura: '#8a4dff', aura2: '#ff47b0', rim: '#f0f1ff',
      cheek: '#ff86d0', mouth: '#170a2e', tongue: '#ff5f8f', horn: '#eceeff', gem: '#c06bff',
      glow: 0.26, slit: true,
    },
    { // Sovrano Slime — gold-white melting into violet, crown, wings, rune circles
      id: 'stage3',
      body: '#ffd56e', light: '#fffcef', dark: '#7c48da', deep: '#2f1668', core: '#fff3c4',
      eye: '#26104a', iris: '#c9a2ff', aura: '#d8b6ff', aura2: '#ffd54f', rim: '#ffffff',
      cheek: '#ffa0cf', mouth: '#26104a', tongue: '#ff7aa0', horn: '#fff3c0', gem: '#ff4f8b',
      glow: 0.3, slit: false,
    },
  ];
  const WILD_RAW = {
    id: 'wild',
    body: '#7ee05e', light: '#e4ffd0', dark: '#2a8a30', deep: '#0f3f17', core: '#f0ffd8',
    eye: '#13290f', iris: '#b6ff7c', aura: '#8dff6b', aura2: '#d4ff9e', rim: '#f6fff0',
    cheek: '#ff9fb2', mouth: '#13290f', tongue: '#ff6f8a', horn: '#f0ffe6', gem: '#ffd54f',
    glow: 0, slit: false,
  };
  const ALLY_RAW = {
    id: 'ally',
    body: '#5cf0c8', light: '#e2fff7', dark: '#178c7a', deep: '#06413a', core: '#f0fffb',
    eye: '#0a2b27', iris: '#8cffe8', aura: '#ffd54f', aura2: '#8cffe8', rim: '#ffffff',
    cheek: '#ff9fd0', mouth: '#0a2b27', tongue: '#ff6f96', horn: '#fff6d8', gem: '#ffd54f',
    glow: 0.14, slit: false,
  };

  const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  function isHex(c) {
    return typeof c === 'string' && HEX_RE.test(c);
  }
  function hex6(c) {
    const s = c.charAt(0) === '#' ? c : '#' + c;
    return U.mix(s, s, 0);
  }

  /** Builds a ready-to-draw palette (fills missing fields, adds gradient caches). */
  function finalize(def) {
    const p = Object.assign({}, DEFAULT_RAW, def);
    for (const k in DEFAULT_RAW) {
      if (typeof DEFAULT_RAW[k] === 'string' && k !== 'id' && !isHex(p[k])) p[k] = DEFAULT_RAW[k];
    }
    if (!(p.glow >= 0)) p.glow = 0;
    p.slit = !!p.slit;
    p.irisDark = isHex(def && def.irisDark) ? def.irisDark : U.mix(p.iris, '#000000', 0.42);
    p.key = String(p.id || p.body);
    p._raw = Object.assign({}, p);
    p._ok = true;
    p._g = new WeakMap(); // ctx -> gradients
    p._derived = new Map(); // custom color -> palette
    p._runes = null;
    return p;
  }

  const palettes = STAGE_DEFS.map(finalize);
  palettes.wild = finalize(WILD_RAW);
  palettes.ally = finalize(ALLY_RAW);

  const foreign = new WeakMap();
  function normPal(p) {
    if (p._ok) return p;
    let n = foreign.get(p);
    if (!n) {
      n = finalize(p);
      foreign.set(p, n);
    }
    return n;
  }

  /** Palette recolored from a custom body hex; eyes/cheeks/etc. stay from the stage palette. */
  function derivePal(base, color) {
    let p = base._derived.get(color);
    if (p) return p;
    const c = hex6(color);
    const r = base._raw;
    p = finalize(Object.assign({}, r, {
      id: r.id + c,
      body: c,
      light: U.mix(c, '#ffffff', 0.66),
      dark: U.mix(U.mix(c, '#05051a', 0.5), r.dark, 0.25),
      deep: U.mix(U.mix(c, '#020210', 0.78), r.deep, 0.25),
      core: U.mix(c, '#ffffff', 0.84),
      aura: U.mix(c, r.aura, 0.3),
      aura2: U.mix(U.mix(c, '#ffffff', 0.5), r.aura2, 0.45),
      rim: U.mix(c, '#ffffff', 0.9),
      irisDark: undefined,
    }));
    if (base._derived.size > 48) base._derived.clear();
    base._derived.set(color, p);
    return p;
  }

  function resolvePalette(opts, stage) {
    const p = opts.palette;
    let base = null;
    if (p == null) base = palettes[stage];
    else if (typeof p === 'string') base = palettes[p];
    else if (typeof p === 'number') base = palettes[clamp(p | 0, 0, 3)];
    else if (typeof p === 'object') base = normPal(p);
    if (!base || !base._ok) base = palettes[stage];
    if (isHex(opts.color)) return derivePal(base, opts.color);
    return base;
  }

  /* ============================================================ draw helpers */
  // Per-draw state (render is synchronous and never re-entrant).
  let PPU = 22; // CSS px per unit of the current drawing space (used for LOD & glow resolution)
  let BA = 1; // base alpha of the slime being drawn

  // Scratch frame (no per-draw allocations).
  const FR = {
    px: new Float32Array(N), py: new Float32Array(N),
    a: 1, b: 0, c: 0, d: 1, gy: 1, hop: 0, jx: 0, jy: 0,
    blink: 0, joy: false, speed: 0, mvx: 0, mvy: 0, open: 0, pokeT: 0,
    w: 1, cx: 0, top: -1,
  };

  function ctxScale(ctx) {
    if (typeof ctx.getTransform === 'function') {
      try {
        const m = ctx.getTransform();
        const s = Math.sqrt(m.a * m.a + m.b * m.b) / (SK.DPR || 1);
        if (s > 0 && isFinite(s)) return s;
      } catch { /* fall through */ }
    }
    return SK.cam && SK.cam.zoom > 0 ? SK.cam.zoom : 1;
  }

  function makeCanvas(w, h) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    } catch {
      return null;
    }
  }

  // Local glow fallback (used only when SK.FX is unavailable).
  const GLOW_BUCKETS = [8, 16, 32, 64, 128, 256];
  const localGlowCache = new Map();
  function localGlow(color, rpx) {
    let bi = 0;
    while (bi < GLOW_BUCKETS.length - 1 && GLOW_BUCKETS[bi] < rpx) bi++;
    let arr = localGlowCache.get(color);
    if (!arr) {
      if (localGlowCache.size > 64) localGlowCache.clear();
      arr = [null, null, null, null, null, null];
      localGlowCache.set(color, arr);
    }
    let c = arr[bi];
    if (c === null) {
      const r = GLOW_BUCKETS[bi];
      c = makeCanvas(r * 2, r * 2);
      const g = c && c.getContext ? c.getContext('2d') : null;
      if (g) {
        const gr = g.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, U.rgba(color, 1));
        gr.addColorStop(0.22, U.rgba(color, 0.6));
        gr.addColorStop(0.55, U.rgba(color, 0.18));
        gr.addColorStop(1, U.rgba(color, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, r * 2, r * 2);
      } else c = false;
      arr[bi] = c;
    }
    return c || null;
  }
  function glowSprite(color, rpx) {
    const fx = SK.FX;
    if (fx && typeof fx.glowSprite === 'function') {
      try {
        const s = fx.glowSprite(color, rpx);
        if (s && s.width > 0) return s;
      } catch { /* use local fallback */ }
    }
    return localGlow(color, rpx);
  }
  /** Additive glow of radius r (current units) — cached sprite, no shadowBlur. */
  function glow(ctx, x, y, r, color, a) {
    if (!(a > 0.004) || !(r > 0)) return;
    const spr = glowSprite(color, clamp(r * PPU, 4, 256));
    if (!spr) return;
    const pg = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = BA * (a > 1 ? 1 : a);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = pg;
  }

  let shadowSpr;
  function shadowSprite() {
    if (shadowSpr === undefined) {
      shadowSpr = null;
      const c = makeCanvas(64, 64);
      const g = c && c.getContext ? c.getContext('2d') : null;
      if (g) {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(0,0,0,0.6)');
        gr.addColorStop(0.5, 'rgba(0,0,0,0.4)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        shadowSpr = c;
      }
    }
    return shadowSpr;
  }

  // Gradients are built once per (palette, context) in local unit space and reused every frame.
  function grads(ctx, pal) {
    let g = pal._g.get(ctx);
    if (!g) {
      g = buildGrads(ctx, pal);
      pal._g.set(ctx, g);
    }
    return g;
  }
  function buildGrads(ctx, p) {
    const body = ctx.createRadialGradient(-0.34, -0.46, 0.04, -0.08, -0.02, 1.22);
    body.addColorStop(0, p.light);
    body.addColorStop(0.42, p.body);
    body.addColorStop(0.86, p.dark);
    body.addColorStop(1, p.deep);
    const rim = ctx.createLinearGradient(-0.75, -0.85, 0.35, 0.45);
    rim.addColorStop(0, U.rgba(p.rim, 0.95));
    rim.addColorStop(0.45, U.rgba(p.rim, 0.32));
    rim.addColorStop(1, U.rgba(p.rim, 0));
    const vortex = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    vortex.addColorStop(0, '#000000');
    vortex.addColorStop(0.42, '#05010f');
    vortex.addColorStop(0.72, p.deep);
    vortex.addColorStop(0.9, p.dark);
    vortex.addColorStop(1, p.light);
    const horn = ctx.createLinearGradient(0, 0.06, 0.1, -0.34);
    horn.addColorStop(0, p.deep);
    horn.addColorStop(0.5, U.mix(p.horn, p.deep, 0.5));
    horn.addColorStop(1, p.horn);
    const wing = ctx.createLinearGradient(0, 0, 1.5, -0.9);
    wing.addColorStop(0, U.rgba(p.rim, 0.75));
    wing.addColorStop(0.45, U.rgba(p.aura, 0.4));
    wing.addColorStop(1, U.rgba(p.aura2, 0.08));
    return { body, rim, vortex, horn, wing };
  }
  const commonGrads = new WeakMap();
  function cgrads(ctx) {
    let g = commonGrads.get(ctx);
    if (!g) {
      const crown = ctx.createLinearGradient(0, -0.32, 0, 0.18);
      crown.addColorStop(0, '#fffbe0');
      crown.addColorStop(0.35, '#ffd54f');
      crown.addColorStop(0.7, '#f0a818');
      crown.addColorStop(1, '#a8680c');
      g = { crown };
      commonGrads.set(ctx, g);
    }
    return g;
  }

  function tracePath(ctx, s, ox, oy) {
    const px = FR.px, py = FR.py;
    ctx.moveTo((px[N - 1] + px[0]) * 0.5 * s + ox, (py[N - 1] + py[0]) * 0.5 * s + oy);
    for (let i = 0; i < N; i++) {
      const j = i === N - 1 ? 0 : i + 1;
      ctx.quadraticCurveTo(px[i] * s + ox, py[i] * s + oy, (px[i] + px[j]) * 0.5 * s + ox, (py[i] + py[j]) * 0.5 * s + oy);
    }
    ctx.closePath();
  }

  function ellipseSub(ctx, x, y, rx, ry, rot) {
    ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  }

  /** Concave 4-point sparkle. */
  function star4(ctx, x, y, r, rot, color, alpha, additive) {
    if (!(r > 0.0005) || !(alpha > 0.004)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.fillStyle = color;
    const k = r * 0.13;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(k, -k, r, 0);
    ctx.quadraticCurveTo(k, k, 0, r);
    ctx.quadraticCurveTo(-k, k, -r, 0);
    ctx.quadraticCurveTo(-k, -k, 0, -r);
    ctx.fill();
    ctx.restore();
  }

  /* ============================================================ frame build */
  function frameFromBody(bd) {
    for (let i = 0; i < N; i++) {
      FR.px[i] = bd.px[i];
      FR.py[i] = bd.py[i];
    }
    FR.a = bd.a;
    FR.b = bd.b;
    FR.c = bd.c;
    FR.d = bd.d;
    FR.gy = 1 - bd.gs;
    FR.hop = Math.abs(Math.sin(PI * frac(bd.hopPh))) * bd.hopAmp;
    FR.jx = bd.jx;
    FR.jy = bd.jy;
    FR.blink = bd.blink;
    FR.joy = bd.joyT > 0;
    FR.speed = bd.speed;
    FR.mvx = bd.lvx;
    FR.mvy = bd.lvy;
    FR.open = bd.absorbing ? U.ease.outBack(bd.absOpen) : bd.absOpen * bd.absOpen;
    FR.pokeT = bd.pokeT;
  }

  /** Bodiless slime: deterministic wobble/hop from time + velocity (enemies, portraits). */
  function frameProcedural(ent, T, seed, opts) {
    const vx = +ent.vx || 0, vy = +ent.vy || 0;
    const sp = Math.sqrt(vx * vx + vy * vy);
    const R = +ent.r > 0 ? +ent.r : 22;
    const st = Math.min(0.13, sp / 1400);
    const sa = sp > 1 ? Math.atan2(vy, vx) : 0;
    let amp = 0, rate = 0;
    if (sp > 15) {
      amp = Math.min(1, sp / 150) * 0.12;
      rate = clamp(sp / (R * 2.6 + 30), 1.5, 3.2);
    } else if (opts.bounce > 0) {
      amp = Math.min(0.3, +opts.bounce);
      rate = +opts.bounceRate > 0 ? +opts.bounceRate : 0.9;
    }
    let hop = 0, gs = Math.sin(T * 1.7 + seed * 9) * 0.015;
    if (amp > 0) {
      const ph = frac(T * rate + seed);
      hop = Math.abs(Math.sin(PI * ph)) * amp;
      const land = ph < 0.2 ? 1 - ph / 0.2 : 0;
      gs += land * land * amp * 2.4 - hop * 0.85;
    }
    shapeMatrix(FR, st, sa, gs);
    const a = FR.a, b = FR.b, c = FR.c, d = FR.d;
    for (let i = 0; i < N; i++) {
      const w = 1 + 0.024 * Math.sin(T * 3.1 + i * 1.71 + seed * 31) + 0.016 * Math.sin(T * 5.3 - i * 2.37 + seed * 17);
      const bx = BASE_X[i] * w, by = BASE_Y[i] * w;
      FR.px[i] = a * bx + c * by;
      FR.py[i] = b * bx + d * by;
    }
    FR.hop = hop;
    FR.jx = FR.jy = 0;
    const period = 3.2 + frac(seed * 7.13) * 2.2;
    let bp = (T + seed * 17) % period;
    if (bp < 0) bp += period;
    FR.blink = bp < 0.16 ? Math.sin((bp / 0.16) * PI) : 0;
    FR.joy = false;
    FR.speed = sp;
    FR.mvx = vx;
    FR.mvy = vy;
    FR.open = 0;
    FR.pokeT = 0;
  }

  function measureFrame() {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    for (let i = 0; i < N; i++) {
      const x = FR.px[i], y = FR.py[i];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
    }
    FR.w = (x1 - x0) * 0.5;
    FR.cx = (x0 + x1) * 0.5;
    FR.top = y0;
  }

  function seedOf(ent) {
    if (ent.seed != null && isFinite(ent.seed)) return frac(+ent.seed);
    if (ent.id != null && isFinite(ent.id)) return frac(+ent.id * 0.6180339887 + 0.137);
    return 0.37;
  }

  /* ============================================================ ground layer */
  function drawShadow(ctx, stage) {
    const spr = shadowSprite();
    if (!spr) return;
    const lift = clamp(FR.hop * 4, 0, 0.6);
    const w = FR.w * (1 - lift * 0.25), h = 0.3 * (1 - lift * 0.2);
    ctx.globalCompositeOperation = 'source-over';
    if (stage === 2) {
      // dark pool of demonic aura
      ctx.globalAlpha = BA * 0.55;
      ctx.drawImage(spr, -1.65, GROUND_Y - 0.5, 3.3, 1.0);
    }
    ctx.globalAlpha = BA * (0.8 - lift * 0.45);
    ctx.drawImage(spr, FR.cx - w * 1.12, GROUND_Y - 0.02 - h, w * 2.24, h * 2);
  }

  function buildRuneOuter(c1, c2) {
    const S = 256, h = S / 2;
    const cv = makeCanvas(S, S);
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!g) return null;
    g.translate(h, h);
    const rg = g.createRadialGradient(0, 0, h * 0.62, 0, 0, h);
    rg.addColorStop(0, U.rgba(c1, 0));
    rg.addColorStop(0.6, U.rgba(c1, 0.3));
    rg.addColorStop(1, U.rgba(c1, 0));
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, h, 0, TAU);
    g.fill();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const glyphCol = U.mix(c1, '#ffffff', 0.35);
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      g.strokeStyle = wide ? U.rgba(c2, 0.26) : c2;
      g.lineWidth = wide ? 7 : 2.4;
      g.beginPath();
      g.arc(0, 0, h * 0.93, 0, TAU);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, h * 0.76, 0, TAU);
      g.stroke();
      g.strokeStyle = wide ? U.rgba(c1, 0.3) : glyphCol;
      g.lineWidth = wide ? 6 : 2;
      for (let k = 0; k < 18; k++) {
        g.save();
        g.rotate((k / 18) * TAU);
        g.translate(0, -h * 0.845);
        const bits = ((k * 13 + 7) % 31) + 1;
        g.beginPath();
        g.moveTo(0, -7);
        g.lineTo(0, 7);
        if (bits & 1) { g.moveTo(-5, -3); g.lineTo(5, -3); }
        if (bits & 2) { g.moveTo(-5, 7); g.lineTo(5, 1); }
        if (bits & 4) { g.moveTo(-5, -7); g.lineTo(0, -2); g.lineTo(5, -7); }
        if (bits & 8) { g.moveTo(3.5, 3); g.arc(0, 3, 3.5, 0, TAU); }
        if (bits & 16) { g.moveTo(-5, 3); g.lineTo(-2, 6); }
        g.stroke();
        g.restore();
      }
      g.strokeStyle = wide ? U.rgba(c2, 0.22) : c2;
      g.lineWidth = wide ? 4 : 1.4;
      g.beginPath();
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const r0 = h * 0.955, r1 = h * (k % 6 === 0 ? 0.995 : 0.975);
        g.moveTo(ca * r0, sa * r0);
        g.lineTo(ca * r1, sa * r1);
      }
      g.stroke();
    }
    return cv;
  }
  function buildRuneInner(c1, c2) {
    const S = 192, h = S / 2;
    const cv = makeCanvas(S, S);
    const g = cv && cv.getContext ? cv.getContext('2d') : null;
    if (!g) return null;
    g.translate(h, h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const wide = pass === 0;
      g.strokeStyle = wide ? U.rgba(c1, 0.28) : c1;
      g.lineWidth = wide ? 6 : 2;
      g.beginPath();
      g.arc(0, 0, h * 0.9, 0, TAU);
      g.stroke();
      // hexagram
      const rr = h * 0.86;
      g.strokeStyle = wide ? U.rgba(c2, 0.26) : c2;
      g.beginPath();
      for (let t = 0; t < 2; t++) {
        for (let k = 0; k <= 3; k++) {
          const a = -HALF_PI + t * PI + (k % 3) * (TAU / 3);
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      }
      g.stroke();
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = -HALF_PI + k * (TAU / 6);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        g.moveTo(x + 5, y);
        g.arc(x, y, 5, 0, TAU);
      }
      g.stroke();
      g.strokeStyle = wide ? U.rgba(c1, 0.26) : c1;
      g.beginPath();
      g.arc(0, 0, h * 0.42, 0, TAU);
      g.stroke();
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU + 0.2;
        g.moveTo(Math.cos(a) * h * 0.2, Math.sin(a) * h * 0.2);
        g.lineTo(Math.cos(a) * h * 0.36, Math.sin(a) * h * 0.36);
      }
      g.stroke();
    }
    return cv;
  }
  function runeCanvases(pal) {
    if (pal._runes === null) {
      const outer = buildRuneOuter(pal.aura, pal.aura2);
      const inner = buildRuneInner(pal.aura, pal.aura2);
      pal._runes = outer && inner ? { outer, inner } : false;
    }
    return pal._runes || null;
  }
  function drawRunes(ctx, T, pal) {
    const rc = runeCanvases(pal);
    if (!rc) return;
    ctx.save();
    ctx.translate(0, GROUND_Y - 0.04);
    ctx.scale(1, 0.4);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = BA * (0.6 + 0.15 * Math.sin(T * 2.2));
    ctx.rotate(T * 0.35);
    ctx.drawImage(rc.outer, -1.85, -1.85, 3.7, 3.7);
    ctx.rotate(-T * 0.95);
    ctx.globalAlpha = BA * (0.5 + 0.2 * Math.sin(T * 3.1 + 1));
    ctx.drawImage(rc.inner, -1.2, -1.2, 2.4, 2.4);
    ctx.restore();
  }

  /* ============================================================ back layer */
  function flamePath(ctx, w, h, sway, curl) {
    // S-curved tongue: wide soft base, thin flickering tip
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * 1.15, -h * 0.35, sway - curl - w * 0.35, -h * 0.62, sway, -h);
    ctx.bezierCurveTo(sway + curl + w * 0.1, -h * 0.58, w * 1.1, -h * 0.32, w, 0);
    ctx.quadraticCurveTo(0, w * 0.8, -w, 0);
    ctx.closePath();
  }
  function drawDemonAura(ctx, T, pal, low, med) {
    const half = low ? 2 : med ? 3 : 4;
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < half; k++) {
        const i = k * 2 + (side > 0 ? 1 : 0);
        const off = PI * (0.3 + (half > 1 ? k / (half - 1) : 0.5) * 0.48);
        const phi = -HALF_PI + side * off;
        const bx = Math.cos(phi) * 0.84, by = Math.sin(phi) * 0.78 + 0.08;
        const flick = Math.sin(T * 7.3 + i * 1.93) * 0.5 + Math.sin(T * 12.1 + i * 3.1) * 0.25;
        const h = 0.4 + 0.13 * flick + (1 - k / half) * 0.16;
        const w = 0.15;
        const sway = Math.sin(T * 5 + i * 2.2) * 0.09;
        const curl = Math.sin(T * 3.3 + i * 1.3) * 0.06;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate((phi + HALF_PI) * 0.42);
        glow(ctx, 0, -h * 0.3, h * 0.75, pal.aura, 0.3);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = BA * 0.3;
        ctx.fillStyle = pal.aura;
        flamePath(ctx, w, h, sway, curl);
        ctx.fill();
        ctx.globalAlpha = BA * 0.32;
        ctx.fillStyle = pal.aura2;
        flamePath(ctx, w * 0.5, h * 0.6, sway * 0.6, curl * 0.5);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function wingPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0.3, -0.75, 0.95, -1.08, 1.5, -0.92);
    ctx.quadraticCurveTo(1.32, -0.68, 1.46, -0.52);
    ctx.quadraticCurveTo(1.15, -0.42, 1.22, -0.24);
    ctx.quadraticCurveTo(0.9, -0.16, 0.9, 0.04);
    ctx.quadraticCurveTo(0.45, 0.06, 0, 0);
    ctx.closePath();
  }
  function drawWings(ctx, T, pal, lod, low) {
    const g = grads(ctx, pal);
    const flap = Math.sin(T * 2.1) * 0.2 + Math.sin(T * 4.2 + 1) * 0.04;
    for (let side = -1; side <= 1; side += 2) {
      glow(ctx, side * 1.12 + FR.jx * 0.5, -0.78 + flap * 0.3, 0.95, pal.aura, 0.32);
      ctx.save();
      ctx.translate(side * 0.42 + FR.jx * 0.5, -0.22 + FR.jy * 0.5);
      ctx.scale(side, 1);
      ctx.rotate(-0.12 - flap);
      ctx.scale(0.94 + 0.08 * Math.cos(T * 2.1), 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = BA * 0.85;
      ctx.fillStyle = g.wing;
      wingPath(ctx);
      ctx.fill();
      if (lod >= 1) {
        ctx.globalAlpha = BA * 0.55;
        ctx.strokeStyle = pal.rim;
        ctx.lineWidth = 0.025;
        ctx.stroke();
        if (!low) {
          ctx.globalAlpha = BA * 0.35;
          ctx.beginPath();
          ctx.moveTo(0.05, -0.03);
          ctx.quadraticCurveTo(0.6, -0.55, 1.38, -0.86);
          ctx.moveTo(0.05, -0.02);
          ctx.quadraticCurveTo(0.7, -0.35, 1.36, -0.5);
          ctx.moveTo(0.05, 0);
          ctx.quadraticCurveTo(0.6, -0.12, 1.14, -0.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawMotes(ctx, T, pal, lod, low, front) {
    for (let i = 0; i < 3; i++) {
      const a = T * 1.55 + i * (TAU / 3);
      const s = Math.sin(a);
      if (s > 0 !== front) continue;
      const depth = 0.78 + 0.32 * (s * 0.5 + 0.5);
      const x = Math.cos(a) * 1.32, y = -0.12 + s * 0.42 + Math.sin(T * 2.3 + i) * 0.05;
      if (lod >= 1 && !low) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = pal.aura2;
        for (let k = 1; k <= 3; k++) {
          const ak = a - k * 0.16;
          ctx.globalAlpha = BA * (0.36 / k);
          ctx.beginPath();
          ctx.arc(Math.cos(ak) * 1.32, -0.12 + Math.sin(ak) * 0.42 + Math.sin(T * 2.3 + i) * 0.05, 0.05 * depth * (1 - k * 0.18), 0, TAU);
          ctx.fill();
        }
      }
      glow(ctx, x, y, 0.42 * depth, pal.aura, 0.85);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = BA;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 0.065 * depth, 0, TAU);
      ctx.fill();
    }
  }

  function drawHorns(ctx, T, pal, lod) {
    const g = grads(ctx, pal);
    for (let side = -1; side <= 1; side += 2) {
      const bx = side * 0.36, by = -0.8;
      const hx = FR.a * bx + FR.c * by + FR.jx * 0.7;
      const hy = FR.b * bx + FR.d * by + FR.jy * 0.7;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(side, 1);
      ctx.rotate(0.28 + Math.sin(T * 1.7) * 0.02);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = BA;
      ctx.beginPath();
      ctx.moveTo(-0.085, 0.06);
      ctx.quadraticCurveTo(-0.09, -0.2, 0.13, -0.34);
      ctx.quadraticCurveTo(0.03, -0.15, 0.085, 0.06);
      ctx.closePath();
      ctx.fillStyle = g.horn;
      ctx.fill();
      ctx.strokeStyle = pal.deep;
      ctx.lineWidth = 0.025;
      ctx.stroke();
      if (lod >= 1) {
        ctx.globalAlpha = BA * 0.55;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.018;
        ctx.beginPath();
        ctx.moveTo(-0.05, -0.02);
        ctx.quadraticCurveTo(-0.05, -0.16, 0.08, -0.27);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ============================================================ the gel */
  function drawCrystal(ctx, x, y, s, T, pal) {
    const ridge = Math.sin(T * 1.3) * 0.5;
    const yy = y + Math.sin(T * 2) * 0.03;
    glow(ctx, x, yy, s * 2.6, pal.aura, 0.55 + 0.15 * Math.sin(T * 3));
    ctx.save();
    ctx.translate(x, yy);
    ctx.scale(s, s);
    ctx.globalCompositeOperation = 'source-over';
    const fl = ridge > 0 ? '#ffffff' : pal.core, fr = ridge > 0 ? pal.aura : pal.core;
    // upper-left, upper-right, lower-left, lower-right facets around a spinning ridge
    ctx.globalAlpha = BA * 0.9;
    ctx.fillStyle = fl;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(-0.62, -0.12); ctx.lineTo(ridge, -0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fr;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(ridge, -0.12); ctx.lineTo(0.62, -0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.aura;
    ctx.beginPath(); ctx.moveTo(-0.62, -0.12); ctx.lineTo(0, 1.1); ctx.lineTo(ridge, -0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.dark;
    ctx.beginPath(); ctx.moveTo(ridge, -0.12); ctx.lineTo(0, 1.1); ctx.lineTo(0.62, -0.12); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = BA * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.09;
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0.62, -0.12); ctx.lineTo(0, 1.1); ctx.lineTo(-0.62, -0.12); ctx.closePath(); ctx.stroke();
    ctx.restore();
    const tw = Math.sin(T * 2.4 + 1);
    if (tw > 0.5) star4(ctx, x - s * 0.1, yy - s * 0.95, s * 0.9 * (tw - 0.5) * 2, T, '#ffffff', BA, true);
  }

  function drawDemonHeart(ctx, x, y, T, pal) {
    // a slow double heartbeat of dark magicule glowing through the gel
    const beat = Math.min(1, Math.pow(Math.max(0, Math.sin(T * 4.4)), 8) + 0.6 * Math.pow(Math.max(0, Math.sin(T * 4.4 - 0.75)), 8));
    const p = 1 + beat * 0.25;
    glow(ctx, x, y, 0.6 * p, pal.aura, 0.38 + beat * 0.25);
    glow(ctx, x, y, 0.3 * p, pal.aura2, 0.3 + beat * 0.35);
    glow(ctx, x, y, 0.12 * p, '#ffffff', 0.25 + beat * 0.4);
  }

  function drawStarCore(ctx, x, y, T, pal) {
    const p = 1 + Math.sin(T * 3) * 0.08;
    glow(ctx, x, y, 0.5 * p, pal.aura2, 0.5);
    glow(ctx, x, y, 0.22 * p, '#ffffff', 0.45);
    star4(ctx, x, y, 0.22 * p, T * 0.6, '#fff6d0', BA * 0.9, true);
    star4(ctx, x, y, 0.13 * p, -T * 0.9 + PI / 4, pal.aura2, BA * 0.75, true);
  }

  function drawBubbles(ctx, T, pal, count, seed) {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < count; i++) {
      const ph = frac(T * (0.16 + i * 0.045) + i * 0.29 + seed);
      const y = 0.55 - ph;
      const x = Math.sin(T * 1.25 + i * 2.1 + seed * 5) * 0.28 * (1 - ph * 0.4) + (i - (count - 1) / 2) * 0.16;
      const r = 0.032 + (i % 2) * 0.02 + ph * 0.012;
      const a = Math.sin(ph * PI);
      ctx.globalAlpha = BA * 0.3 * a;
      ctx.fillStyle = pal.light;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = BA * 0.75 * a;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.32, 0, TAU);
      ctx.fill();
    }
  }

  function drawGel(ctx, T, pal, stage, lod, low, med, open, seed, px1) {
    const g = grads(ctx, pal);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA * 0.9;
    ctx.fillStyle = g.body;
    ctx.beginPath();
    tracePath(ctx, 1, 0, 0);
    ctx.fill();

    // inside the jelly (follows the deformation)
    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.jx * 0.5, FR.jy * 0.5);
    if (lod >= 1) {
      // bounce light along the bottom: the gel glows where light exits
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = BA * 0.3;
      ctx.strokeStyle = pal.core;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.ellipse(0, 0.02, 0.86, 0.7, 0, 0.2, 1.9);
      ctx.stroke();
    }
    glow(ctx, 0, 0.2, 0.8, pal.core, 0.28 + 0.08 * Math.sin(T * 2.1 + seed * 4) + open * 0.35);
    if (stage === 1) drawCrystal(ctx, 0, 0.52, 0.17, T, pal);
    else if (stage === 2) drawDemonHeart(ctx, 0, 0.5, T, pal);
    else if (stage === 3) drawStarCore(ctx, 0, 0.5, T, pal);
    if (lod === 2 && !low) drawBubbles(ctx, T, pal, med ? 2 : 4, seed);
    ctx.restore();

    // outline (readability) + inner rim light (gel thickness)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA * 0.92;
    ctx.strokeStyle = pal.dark;
    ctx.lineWidth = clamp(PPU * 0.06, 1.1, 4) * px1;
    ctx.beginPath();
    tracePath(ctx, 1, 0, 0);
    ctx.stroke();
    if (lod >= 1) {
      ctx.globalAlpha = BA * 0.75;
      ctx.strokeStyle = g.rim;
      ctx.lineWidth = clamp(PPU * 0.05, 1, 3.6) * px1;
      ctx.beginPath();
      tracePath(ctx, 0.9, 0, -0.015);
      ctx.stroke();
    }
  }

  function drawGloss(ctx, T, seed, lod, low) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = BA * 0.78;
    ctx.beginPath();
    ctx.ellipse(-0.4, -0.5, 0.25, 0.125, -0.62, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = BA * 0.92;
    ctx.beginPath();
    ctx.ellipse(-0.14, -0.71, 0.075, 0.045, -0.25, 0, TAU);
    ctx.fill();
    if (lod >= 1) {
      ctx.globalAlpha = BA * 0.2;
      ctx.beginPath();
      ctx.ellipse(0.5, 0.38, 0.16, 0.06, -0.9, 0, TAU);
      ctx.fill();
      if (!low) {
        const tw = Math.sin(T * 1.6 + seed * 9);
        if (tw > 0.72) {
          const k = (tw - 0.72) / 0.28;
          star4(ctx, -0.6, -0.66, 0.17 * k, T * 0.5, '#ffffff', BA * k, true);
        }
      }
    }
  }

  /* ============================================================ face */
  const EYE_OPEN = 0, EYE_HAPPY = 1, EYE_HURT = 2, EYE_CLOSED = 3;
  let MOUTH_X = 0, MOUTH_Y = 0; // face-space mouth of the slime being drawn

  function eyePath(ctx, ew, eh, lid, side) {
    ctx.beginPath();
    if (lid === 1) {
      // angry: lid slants down toward the nose
      if (side < 0) ctx.ellipse(0, 0, ew, eh, 0, 0.2, PI + 0.75, false);
      else ctx.ellipse(0, 0, ew, eh, 0, PI - 0.2, -0.75, true);
      ctx.closePath();
    } else if (lid === 2) {
      // focus: flat, determined upper lid
      ctx.ellipse(0, 0, ew, eh, 0, -0.2527, PI + 0.2527, false);
      ctx.closePath();
    } else ctx.ellipse(0, 0, ew, eh, 0, 0, TAU);
  }

  function drawEye(ctx, x, y, side, ew, eh, style, lid, sy, dil, lx, ly, pal, stage, T, lod, px1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA;
    if (style !== EYE_OPEN) {
      ctx.strokeStyle = pal.eye;
      ctx.lineWidth = Math.max(ew * 0.42, 1.3 * px1);
      ctx.beginPath();
      if (style === EYE_HAPPY) {
        ctx.moveTo(-ew, eh * 0.3);
        ctx.quadraticCurveTo(0, -eh * 1.05, ew, eh * 0.3);
      } else if (style === EYE_CLOSED) {
        ctx.moveTo(-ew, -eh * 0.02);
        ctx.quadraticCurveTo(0, eh * 0.6, ew, -eh * 0.02);
      } else {
        const f = -side; // left eye ">" , right eye "<"
        ctx.moveTo(-f * ew * 0.85, -eh * 0.62);
        ctx.lineTo(f * ew * 0.75, 0);
        ctx.lineTo(-f * ew * 0.85, eh * 0.62);
      }
      ctx.stroke();
      if (style === EYE_HURT && lod >= 1 && side > 0) {
        const ty = eh * 0.75 + frac(T * 1.2) * eh * 0.6;
        ctx.globalAlpha = BA * 0.85;
        ctx.fillStyle = '#9fe6ff';
        ctx.beginPath();
        ctx.moveTo(ew, ty - ew * 0.5);
        ctx.quadraticCurveTo(ew * 1.34, ty + ew * 0.1, ew, ty + ew * 0.24);
        ctx.quadraticCurveTo(ew * 0.66, ty + ew * 0.1, ew, ty - ew * 0.5);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    ctx.scale(1, sy > 0.08 ? sy : 0.08);
    eyePath(ctx, ew, eh, lid, side);
    ctx.fillStyle = pal.slit ? pal.iris : pal.eye;
    ctx.fill();
    if (lod >= 2) {
      ctx.save();
      ctx.clip();
      if (pal.slit) {
        ctx.globalAlpha = BA * 0.6;
        ctx.fillStyle = pal.irisDark;
        ctx.beginPath();
        ctx.ellipse(lx * ew * 0.12, eh * 0.5, ew * 0.95, eh * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = BA;
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.ellipse(lx * ew * 0.3, ly * eh * 0.15, ew * (0.17 + dil * 0.32), eh * (0.68 - dil * 0.08), 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = BA * 0.62;
        ctx.fillStyle = pal.iris;
        ctx.beginPath();
        ctx.ellipse(lx * ew * 0.22, eh * (0.46 + ly * 0.1), ew * 0.78 * (1 - dil * 0.25), eh * 0.42, 0, 0, TAU);
        ctx.fill();
        const pr = ew * (0.36 + dil * 0.34), pxx = lx * ew * 0.26, pyy = eh * (0.1 + ly * 0.16);
        ctx.globalAlpha = BA * (0.45 + dil * 0.4);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(pxx, pyy, pr, 0, TAU);
        ctx.fill();
        if (dil > 0.15) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = BA * 0.7 * dil;
          ctx.strokeStyle = pal.aura2;
          ctx.lineWidth = ew * 0.13;
          ctx.beginPath();
          ctx.arc(pxx, pyy, pr * 1.18, 0, TAU);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();
      if (pal.slit) {
        ctx.globalAlpha = BA;
        ctx.strokeStyle = pal.eye;
        ctx.lineWidth = Math.max(ew * 0.14, px1);
        eyePath(ctx, ew, eh, lid, side);
        ctx.stroke();
      }
    } else if (pal.slit && lid === 0) {
      ctx.fillStyle = pal.eye;
      ctx.beginPath();
      ctx.ellipse(lx * ew * 0.2, 0, ew * (0.2 + dil * 0.3), eh * 0.6, 0, 0, TAU);
      ctx.fill();
    }
    // glossy reflections stay put (light comes from the top-left) while the iris moves
    const hy = lid === 1 ? eh * 0.1 : lid === 2 ? -eh * 0.02 : -eh * 0.4;
    const hs = lid ? 0.75 : 1;
    ctx.globalAlpha = BA * 0.96;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-ew * 0.3, hy, ew * 0.36 * hs, eh * 0.26 * hs, -0.3, 0, TAU);
    ctx.fill();
    if (lod >= 1) {
      ctx.globalAlpha = BA * 0.85;
      ctx.beginPath();
      ctx.arc(ew * 0.36, eh * 0.4, ew * 0.15, 0, TAU);
      ctx.fill();
    }
    if (stage >= 3 && lod >= 2 && lid === 0) {
      star4(ctx, ew * 0.38, -eh * 0.42, ew * 0.34 * (0.75 + 0.25 * Math.sin(T * 4)), T, pal.aura2, BA * 0.95, false);
    }
    ctx.restore();
  }

  function drawBrow(ctx, x, y, side, ew, eh, pal, px1) {
    const f = -side;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA;
    ctx.strokeStyle = pal.eye;
    ctx.lineWidth = Math.max(ew * 0.38, 1.2 * px1);
    ctx.beginPath();
    ctx.moveTo(x - f * ew * 1.15, y - eh * 1.02);
    ctx.lineTo(x + f * ew * 1.0, y - eh * 0.36);
    ctx.stroke();
  }

  function drawMouth(ctx, x, y, expr, pal, stage, lod, T, px1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA;
    ctx.lineWidth = Math.max(0.036, 1.1 * px1);
    ctx.strokeStyle = pal.mouth;
    ctx.fillStyle = pal.mouth;
    let fang = stage === 2 && lod >= 1;
    ctx.beginPath();
    if (expr === 'happy') {
      ctx.moveTo(-0.11, -0.025);
      ctx.quadraticCurveTo(0, 0.18, 0.11, -0.025);
      ctx.closePath();
      ctx.fill();
      if (lod >= 1) {
        ctx.fillStyle = pal.tongue;
        ctx.beginPath();
        ctx.ellipse(0.005, 0.045, 0.045, 0.024, 0, 0, TAU);
        ctx.fill();
      }
    } else if (expr === 'eat') {
      const k = 1 + Math.sin(T * 16) * 0.12;
      ctx.ellipse(0, 0.05, 0.17, 0.145 * k, 0, 0, TAU);
      ctx.fill();
      if (lod >= 1) {
        ctx.fillStyle = pal.tongue;
        ctx.beginPath();
        ctx.ellipse(0, 0.05 + 0.08 * k, 0.095, 0.045, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = BA * 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-0.07, -0.03, 0.035, 0.018, -0.5, 0, TAU);
        ctx.fill();
      }
      fang = false;
    } else if (expr === 'angry') {
      ctx.moveTo(-0.08, 0.035);
      ctx.quadraticCurveTo(0, -0.04, 0.08, 0.035);
      ctx.stroke();
    } else if (expr === 'hurt') {
      ctx.moveTo(-0.09, 0.02);
      for (let k = 0; k < 4; k++) {
        const x0 = -0.09 + k * 0.045;
        ctx.quadraticCurveTo(x0 + 0.0225, k % 2 ? 0.05 : -0.01, x0 + 0.045, 0.02);
      }
      ctx.stroke();
      fang = false;
    } else if (expr === 'focus') {
      ctx.moveTo(-0.05, 0.012);
      ctx.quadraticCurveTo(0, 0.002, 0.05, 0.012);
      ctx.stroke();
    } else {
      ctx.moveTo(-0.085, -0.005);
      ctx.quadraticCurveTo(0, 0.075, 0.085, -0.005);
      ctx.stroke();
    }
    if (fang) {
      // a single tiny demon fang — still cute
      const fy = expr === 'angry' ? 0.012 : 0.022;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0.03, fy);
      ctx.lineTo(0.062, fy - 0.002);
      ctx.lineTo(0.048, fy + 0.04);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVortexUnit(ctx, x, y, mr, T, pal, lod, open) {
    if (!(mr > 0)) return;
    const g = grads(ctx, pal);
    const o = open > 1 ? 1 : open;
    ctx.save();
    ctx.translate(x, y);
    glow(ctx, 0, 0, mr * 2.4, pal.aura, 0.5 * o);
    ctx.scale(mr, mr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA;
    ctx.fillStyle = g.vortex;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    if (lod >= 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = pal.aura2;
      ctx.lineWidth = 0.1;
      const arms = lod >= 2 && SK.quality !== 'low' ? 4 : 3;
      const rot = -T * 7.5;
      ctx.globalAlpha = BA * 0.55;
      for (let k = 0; k < arms; k++) {
        const a0 = rot + (k / arms) * TAU;
        ctx.beginPath();
        for (let j = 0; j <= 9; j++) {
          const r = 0.96 - j * 0.095;
          const a = a0 + (1 - r) * 3.6;
          const vx = Math.cos(a) * r, vy = Math.sin(a) * r;
          if (j === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = BA * 0.95;
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = 0.11;
    ctx.beginPath();
    ctx.arc(0, 0, 0.97, 0, TAU);
    ctx.stroke();
    if (lod >= 2) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = BA * 0.6 * o;
      ctx.strokeStyle = pal.aura;
      ctx.lineWidth = 0.08;
      for (let k = 0; k < 3; k++) {
        const a = T * 5 + k * (TAU / 3);
        ctx.beginPath();
        ctx.arc(0, 0, 1.14, a, a + 0.9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawFace(ctx, T, pal, stage, expr, lookX, lookY, open, lod, px1) {
    const fcx = lookX * 0.11, fcy = -0.07 + lookY * 0.065 - open * 0.07;
    let ew = 0.124, eh = 0.17;
    if (lod === 0) {
      ew *= 1.22;
      eh *= 1.14;
    }
    let style = EYE_OPEN, lid = 0, es = 1, dil = 0;
    if (expr === 'happy') style = EYE_HAPPY;
    else if (expr === 'hurt') style = EYE_HURT;
    else if (expr === 'angry') lid = 1;
    else if (expr === 'focus') lid = 2;
    else if (expr === 'eat') es = 1.12;
    if (open > 0.2 && style !== EYE_HURT) {
      style = EYE_OPEN;
      dil = open > 1 ? 1 : open;
      if (lid === 0) es = Math.max(es, 1.08);
    }
    let sy = 1;
    if (style === EYE_OPEN) {
      if (FR.blink > 0.8) style = EYE_CLOSED;
      else sy = 1 - FR.blink * 0.9;
    }
    const ex = 0.285 * (1 - 0.07 * Math.abs(lookX));
    for (let side = -1; side <= 1; side += 2) {
      const persp = 1 - 0.17 * Math.max(0, side * lookX); // the far eye narrows as the face turns
      const x = fcx + side * ex, w = ew * es * persp, h = eh * es;
      drawEye(ctx, x, fcy, side, w, h, style, lid, sy, dil, lookX, lookY, pal, stage, T, lod, px1);
      if (lid === 1) drawBrow(ctx, x, fcy, side, w, h, pal, px1);
    }
    if (lod >= 1 && open < 0.3 && (expr === 'idle' || expr === 'happy' || expr === 'eat')) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = BA * (expr === 'happy' ? 0.5 : 0.32);
      ctx.fillStyle = pal.cheek;
      ctx.beginPath();
      ellipseSub(ctx, fcx - 0.45, fcy + 0.165, 0.085, 0.05, 0);
      ellipseSub(ctx, fcx + 0.45, fcy + 0.165, 0.085, 0.05, 0);
      ctx.fill();
    }
    MOUTH_X = fcx * 1.12;
    MOUTH_Y = fcy + 0.26 + open * 0.05;
    if (open > 0) drawVortexUnit(ctx, MOUTH_X, MOUTH_Y, 0.045 + 0.27 * (open > 1.1 ? 1.1 : open), T, pal, lod, open);
    else drawMouth(ctx, MOUTH_X, MOUTH_Y, expr, pal, stage, lod, T, px1);
  }

  /* ============================================================ front layer */
  function drawSuction(ctx, T, pal, open, low, med, mr, px1) {
    const mx = FR.a * MOUTH_X + FR.c * MOUTH_Y + FR.jx * 0.7;
    const my = FR.b * MOUTH_X + FR.d * MOUTH_Y + FR.jy * 0.7;
    const o = open > 1 ? 1 : open;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // wind spiralling into the mouth
    ctx.strokeStyle = pal.aura2;
    ctx.lineWidth = clamp(PPU * 0.04, 1, 3) * px1;
    for (let k = 0; k < 3; k++) {
      const r = 1.25 + k * 0.28;
      const a = -T * (3.2 - k * 0.6) + k * 2.1;
      ctx.globalAlpha = BA * 0.2 * o * (1 - k * 0.22);
      ctx.beginPath();
      ctx.ellipse(mx * 0.4, my * 0.4, r, r * 0.86, 0, a, a + 1.25);
      ctx.stroke();
    }
    // motes and essence sparks swirling in (comet streaks along the spiral)
    const cnt = low ? 5 : med ? 8 : 12;
    const lw = clamp(PPU * 0.032, 0.9, 2.8) * px1;
    ctx.lineWidth = lw;
    for (let i = 0; i < cnt; i++) {
      const ph = frac(T * 0.95 + i * 0.6180339);
      const a0 = i * 2.39996 - T * 0.25;
      const col = i % 3 === 0 ? pal.aura : i % 3 === 1 ? pal.aura2 : pal.core;
      ctx.globalAlpha = BA * o * Math.min(1, ph * 3) * (1 - ph * 0.3);
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let k = 2; k >= 0; k--) {
        const p = ph - k * 0.055;
        const pp = p > 0 ? p : 0;
        const d = mr + (1 - pp * pp) * 2.0;
        const ang = a0 + pp * 2.8;
        const x = mx + Math.cos(ang) * d, y = my + Math.sin(ang) * d * 0.85;
        if (k === 2) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const d = mr + (1 - ph * ph) * 2.0, ang = a0 + ph * 2.8;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(mx + Math.cos(ang) * d, my + Math.sin(ang) * d * 0.85, lw * (1.1 + (1 - ph) * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEmbers(ctx, T, pal) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = frac(T * 0.55 + i * 0.37);
      const x = Math.sin(i * 2.7 + T * 0.9) * 0.75 + Math.sin(T * 3 + i) * 0.06;
      const y = 0.35 - ph * 1.7;
      ctx.globalAlpha = BA * Math.sin(ph * PI) * 0.85;
      ctx.fillStyle = i & 1 ? pal.aura2 : pal.aura;
      ctx.beginPath();
      ctx.arc(x, y, 0.045 * (1 - ph * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawHolySparkles(ctx, T, pal) {
    for (let i = 0; i < 4; i++) {
      const a = T * 0.6 + i * (TAU / 4);
      const ph = frac(T * 0.5 + i * 0.25);
      const tw = Math.sin(ph * PI);
      star4(ctx, Math.cos(a) * 1.25, -0.2 + Math.sin(a) * 0.55 - ph * 0.3, 0.12 * tw, T, i & 1 ? pal.aura2 : '#ffffff', BA * tw, true);
    }
  }

  function crownPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.31, 0.14);
    ctx.lineTo(-0.35, -0.12);
    ctx.lineTo(-0.22, -0.01);
    ctx.lineTo(-0.15, -0.22);
    ctx.lineTo(-0.065, -0.03);
    ctx.lineTo(0, -0.32);
    ctx.lineTo(0.065, -0.03);
    ctx.lineTo(0.15, -0.22);
    ctx.lineTo(0.22, -0.01);
    ctx.lineTo(0.35, -0.12);
    ctx.lineTo(0.31, 0.14);
    ctx.quadraticCurveTo(0, 0.2, -0.31, 0.14);
    ctx.closePath();
  }
  const CROWN_TIPS = [-0.35, -0.12, -0.15, -0.22, 0, -0.32, 0.15, -0.22, 0.35, -0.12];
  function drawCrownUnit(ctx, T, pal, lod) {
    glow(ctx, 0, -0.06, 0.78, '#ffd54f', 0.42);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = BA;
    crownPath(ctx);
    ctx.fillStyle = cgrads(ctx).crown;
    ctx.fill();
    ctx.strokeStyle = '#7a4a08';
    ctx.lineWidth = 0.028;
    ctx.stroke();
    if (lod >= 1) {
      ctx.globalAlpha = BA * 0.75;
      ctx.strokeStyle = '#fff2b0';
      ctx.lineWidth = 0.022;
      ctx.beginPath();
      ctx.moveTo(-0.29, 0.075);
      ctx.quadraticCurveTo(0, 0.125, 0.29, 0.075);
      ctx.stroke();
      ctx.globalAlpha = BA;
      ctx.fillStyle = pal.gem;
      ctx.beginPath();
      ctx.moveTo(0, 0.02);
      ctx.lineTo(0.042, 0.065);
      ctx.lineTo(0, 0.11);
      ctx.lineTo(-0.042, 0.065);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5ad1ff';
      ctx.beginPath();
      ellipseSub(ctx, -0.18, 0.07, 0.032, 0.032, 0);
      ellipseSub(ctx, 0.18, 0.07, 0.032, 0.032, 0);
      ctx.fill();
      ctx.fillStyle = '#fffbe0';
      ctx.beginPath();
      for (let k = 0; k < CROWN_TIPS.length; k += 2) ellipseSub(ctx, CROWN_TIPS[k], CROWN_TIPS[k + 1], 0.03, 0.03, 0);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = BA * 0.9;
      ctx.beginPath();
      ellipseSub(ctx, -0.012, 0.05, 0.012, 0.012, 0);
      ellipseSub(ctx, -0.19, 0.06, 0.01, 0.01, 0);
      ellipseSub(ctx, 0.17, 0.06, 0.01, 0.01, 0);
      ctx.fill();
    }
    const tw = Math.sin(T * 2.7);
    if (tw > 0.6) star4(ctx, 0, -0.33, (0.16 * (tw - 0.6)) / 0.4, T, '#ffffff', BA, true);
  }
  function drawCrownOnHead(ctx, T, pal, lookX, lod) {
    ctx.save();
    ctx.translate(FR.cx * 0.5 + FR.jx * 0.6 + lookX * 0.05, FR.top - 0.2 + Math.sin(T * 2.2) * 0.045);
    ctx.rotate(Math.sin(T * 1.3) * 0.06 + lookX * 0.06);
    drawCrownUnit(ctx, T, pal, lod);
    ctx.restore();
  }

  /* ============================================================ render */
  /**
   * Draws a slime at ent.x, ent.y (radius ent.r × opts.scale) using ent.body when present.
   * opts: {stage, palette ('wild'|'ally'|index|object), color, crown, facing, lookAmt,
   *        expression, absorbing, absorbT, alpha, scale, t, flash, shadow=true, radius, body,
   *        bounce, bounceRate (idle hop for bodiless slimes)}
   */
  function render(ctx, ent, opts) {
    if (!ctx || !ent) return;
    opts = opts || EMPTY;
    const stage = clamp((opts.stage != null ? +opts.stage : +ent.stage || 0) | 0, 0, 3);
    const pal = resolvePalette(opts, stage);
    const body = opts.body && opts.body.px ? opts.body : ent.body && ent.body.px ? ent.body : null;
    const T = opts.t != null && isFinite(opts.t) ? +opts.t : body ? body.t : now();
    const scale = opts.scale != null && isFinite(opts.scale) ? +opts.scale : 1;
    const R = (+opts.radius > 0 ? +opts.radius : +ent.r > 0 ? +ent.r : body ? body.r : 22) * scale;
    if (!(R > 0.05)) return;
    const alpha = opts.alpha != null ? clamp(+opts.alpha || 0, 0, 1) : 1;
    if (alpha <= 0.003) return;
    const seed = body ? body.seed : seedOf(ent);
    if (body) frameFromBody(body);
    else frameProcedural(ent, T, seed, opts);
    measureFrame();

    const q = SK.quality;
    const low = q === 'low', med = q === 'medium';
    PPU = R * ctxScale(ctx);
    const lod = PPU < 13 ? 0 : PPU < 26 ? 1 : 2;
    const px1 = 1 / PPU;

    let expr = opts.expression || ent.expression || 'idle';
    const hurtT = +ent.hurtT > 0 ? +ent.hurtT : 0;
    if (expr === 'idle' && FR.joy) expr = 'happy';

    let open = FR.open;
    if (opts.absorbing) {
      const at = +opts.absorbT || 0;
      const o2 = at > 0 ? U.ease.outBack(clamp(at / 0.3, 0, 1)) : body ? 0 : 1;
      if (o2 > open) open = o2;
    }
    if (!(open > 0.015)) open = 0;

    let facing = opts.facing;
    if (facing == null || !isFinite(facing)) facing = ent.facing;
    if (facing == null || !isFinite(facing)) facing = FR.speed > 6 ? Math.atan2(FR.mvy, FR.mvx) : HALF_PI;
    const lookAmt = opts.lookAmt != null ? clamp(+opts.lookAmt || 0, 0, 1) : 1;
    const lookX = Math.cos(facing) * lookAmt, lookY = Math.sin(facing) * lookAmt;
    const flash = clamp((opts.flash != null ? +opts.flash : +ent.hitFlash) || 0, 0, 1);

    const moveK = clamp(FR.speed / 120, 0, 1);
    const breath = Math.sin(T * 2.3 + seed * 6.28) * (0.026 - 0.016 * moveK);
    const pulse = open > 0 ? 1 + Math.sin(T * 15) * 0.035 * (open > 1 ? 1 : open) : 1;
    const sx = (1 - breath * 0.6) * pulse, sy = (1 + breath) * pulse;
    const anc = GROUND_Y * (1 - FR.gy * sy); // keep the bottom planted while squashing
    const hurtAmt = Math.max(Math.min(1, hurtT * 3), FR.pokeT * 2.5, expr === 'hurt' ? 0.35 : 0);
    const shx = hurtAmt > 0 ? Math.sin(T * 83) * 0.03 * Math.min(1, hurtAmt) : 0;
    const crown = opts.crown === true || (stage >= 3 && opts.crown !== false);

    ctx.save();
    BA = ctx.globalAlpha * alpha;
    ctx.globalAlpha = BA;
    ctx.translate(+ent.x || 0, +ent.y || 0);
    ctx.scale(R, R);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ground
    if (stage >= 3 && lod >= 1) drawRunes(ctx, T, pal);
    if (opts.shadow !== false) drawShadow(ctx, stage);

    ctx.translate(shx, anc - FR.hop);
    ctx.scale(sx, sy);

    // behind the body
    if (pal.glow > 0 && !low) glow(ctx, FR.jx * 0.5, -0.04, 1.8, pal.aura, pal.glow * (1 + open * 0.9) + flash * 0.15);
    if (stage === 2) drawDemonAura(ctx, T, pal, low, med);
    if (stage === 3) drawWings(ctx, T, pal, lod, low);
    if (stage === 1) drawMotes(ctx, T, pal, lod, low, false);
    if (stage === 2) drawHorns(ctx, T, pal, lod);

    drawGel(ctx, T, pal, stage, lod, low, med, open, seed, px1);

    ctx.save();
    ctx.transform(FR.a, FR.b, FR.c, FR.d, FR.jx * 0.7, FR.jy * 0.7);
    drawGloss(ctx, T, seed, lod, low);
    drawFace(ctx, T, pal, stage, expr, lookX, lookY, open, lod, px1);
    ctx.restore();

    if (flash > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = BA * flash * 0.88;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      tracePath(ctx, 1, 0, 0);
      ctx.fill();
    }

    // in front of the body
    if (stage === 1) drawMotes(ctx, T, pal, lod, low, true);
    if (stage === 2 && lod >= 1 && !low) drawEmbers(ctx, T, pal);
    if (stage === 3 && lod >= 1 && !low) drawHolySparkles(ctx, T, pal);
    if (crown) drawCrownOnHead(ctx, T, pal, lookX, lod);
    if (open > 0.12 && lod >= 1) drawSuction(ctx, T, pal, open, low, med, 0.045 + 0.27 * Math.min(1, open), px1);
    ctx.restore();
  }

  /* ============================================================ portraits & extras */
  const PORTRAIT_ENT = { x: 0, y: 0, r: 30, vx: 0, vy: 0, id: 7 };
  const PORTRAIT_OPTS = {
    stage: 0, t: 0, expression: 'idle', facing: HALF_PI, lookAmt: 0.55, bounce: 0.05, bounceRate: 0.75,
    palette: null, color: null, crown: undefined, alpha: 1, shadow: true, absorbing: false, absorbT: 0, flash: 0,
  };
  /**
   * Standalone (screen space) animated slime for title/menus/evolution cut-in. `size` = box size in px.
   * Optional 7th arg `extra`: {palette, color, crown, expression, absorbing, absorbT, alpha, flash, shadow}.
   */
  function renderPortrait(ctx, x, y, size, stage, t, extra) {
    if (!ctx) return;
    const sz = +size > 0 ? +size : 96;
    const st = clamp((+stage || 0) | 0, 0, 3);
    const T = t != null && isFinite(t) ? +t : now();
    const R = sz * (st >= 3 ? 0.27 : 0.31);
    const e = PORTRAIT_ENT;
    e.x = +x || 0;
    e.y = (+y || 0) + R * (st >= 3 ? 0.28 : 0.08);
    e.r = R;
    const o = PORTRAIT_OPTS;
    const ex = extra || EMPTY;
    const cyc = ((T % 9) + 9) % 9;
    o.stage = st;
    o.t = T;
    o.expression = ex.expression || (cyc > 6.3 && cyc < 7.7 ? 'happy' : 'idle');
    o.facing = Math.atan2(0.55 + Math.sin(T * 0.43) * 0.45, Math.sin(T * 0.61) * 0.9);
    o.palette = ex.palette != null ? ex.palette : null;
    o.color = ex.color != null ? ex.color : null;
    o.crown = ex.crown;
    o.alpha = ex.alpha != null ? ex.alpha : 1;
    o.flash = ex.flash || 0;
    o.shadow = ex.shadow !== false;
    o.absorbing = !!ex.absorbing;
    o.absorbT = ex.absorbT || 0;
    render(ctx, e, o);
  }

  /** Floating golden crown centered at x,y with the given width (any space). */
  function drawCrown(ctx, x, y, width, t, palette) {
    if (!ctx) return;
    const w = +width > 0 ? +width : 24;
    const s = w / 0.72;
    const T = t != null && isFinite(t) ? +t : now();
    const pal = palette ? resolvePalette({ palette }, 3) : palettes[3];
    ctx.save();
    BA = ctx.globalAlpha;
    PPU = s * ctxScale(ctx);
    ctx.translate(+x || 0, +y || 0);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawCrownUnit(ctx, T, pal, PPU < 14 ? 0 : 2);
    ctx.restore();
  }

  /** The Predatore vortex mouth on its own (radius r) — reusable by other races. */
  function drawVortex(ctx, x, y, r, t, palette) {
    if (!ctx || !(+r > 0)) return;
    const T = t != null && isFinite(t) ? +t : now();
    const pal = palette ? resolvePalette({ palette }, 0) : palettes[0];
    ctx.save();
    BA = ctx.globalAlpha;
    PPU = ctxScale(ctx);
    ctx.lineCap = 'round';
    drawVortexUnit(ctx, +x || 0, +y || 0, +r, T, pal, r * PPU < 8 ? 0 : 2, 1);
    ctx.restore();
  }

  /** Resolved palette for a stage (+ optional custom body color / named palette). */
  function paletteFor(stage, color, palette) {
    const st = clamp((+stage || 0) | 0, 0, 3);
    return resolvePalette({ color, palette }, st);
  }

  SK.Slime = {
    createBody,
    updateBody,
    resetBody,
    poke,
    render,
    renderPortrait,
    drawCrown,
    drawVortex,
    paletteFor,
    palettes,
    stageNames: ['Slime', 'Slime Primordiale', 'Slime Demoniaco', 'Sovrano Slime'],
    POINTS: N,
  };
})(window.SK);
