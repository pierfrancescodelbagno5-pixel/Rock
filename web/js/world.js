/* Slime Reborn — SK.World: biomes, arena & decor, wave director, pickups, portal. */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, hypot = Math.hypot, sqrt = Math.sqrt;
  const min = Math.min, max = Math.max, floor = Math.floor, abs = Math.abs, random = Math.random, exp = Math.exp;
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + random() * (b - a);
  const fract = (v) => v - floor(v);
  const wrapIn = (v, start, len) => start + (((v - start) % len) + len) % len;

  const ARENA_R = 1400;
  const TEX = 512;
  const ESSENCE_LIFE = 14;
  const GRAV = 720;
  const EMPTY = Object.freeze({});
  const EMPTY_DASH = [];
  const FLOW_DASH = [16, 30];

  function qi() { return SK.quality === 'low' ? 0 : SK.quality === 'medium' ? 1 : 2; }

  /* ------------------------------------------------------------ safe calls */
  function sfx(name, opts) { const A = SK.Audio; if (A && A.sfx) A.sfx(name, opts); }
  function music(track) { const A = SK.Audio; if (A && A.music) A.music(track); }
  function banner(t, s, o) { const UI = SK.UI; if (UI && UI.banner) UI.banner(t, s, o); }
  function oracle(t, o) { const UI = SK.UI; if (UI && UI.oracle) UI.oracle(t, o); }
  function toast(t, c) { const UI = SK.UI; if (UI && UI.toast) UI.toast(t, c); }
  function FX() { return SK.FX || null; }
  function enemyTypes() { const E = SK.Enemies; return (E && E.types) || EMPTY; }

  /* ------------------------------------------------------------ seeded rng */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ================================================================ biomes */
  const biomes = [
    {
      id: 'cave', name: 'Caverna Sigillata', subtitle: "Dove l'abisso dorme sotto un antico sigillo",
      music: 'cave', boss: 'abyss_serpent', duration: 150, radius: ARENA_R, ambient: 'motes',
      enemies: [
        { type: 'bat', weight: 6, from: 0, pack: [3, 5] },
        { type: 'wild_slime', weight: 4, from: 0, pack: [1, 2] },
        { type: 'cave_spider', weight: 4, from: 12, pack: [1, 3] },
        { type: 'rock_crab', weight: 2.4, from: 35, pack: [1, 2] },
      ],
      horde: ['bat', 'cave_spider'], wanderers: ['wild_slime'], maxPassive: 2,
      palette: {
        bg: '#05040c', ground: '#151229', ground2: '#252050', accent: '#3de8ff', fog: '#1b1446',
        light: '#a6f7ff', ambient: ['#4de1ff', '#9a7dff', '#c8fff9'],
      },
      darkness: 0.5, fogA: 0.16,
      oracle: '《Analisi ambientale: caverna sigillata, saturazione di magicule elevata. Rilevate forme di vita ostili. Suggerimento: divorarle tutte.》',
      bossLine: '《Avviso: una massa di energia colossale si muove nella roccia sotto di noi.》',
    },
    {
      id: 'forest', name: 'Foresta di Smeraldo', subtitle: 'Il bosco sussurra, e i lupi rispondono',
      music: 'forest', boss: 'alpha_wolf', duration: 150, radius: ARENA_R, ambient: 'fireflies',
      enemies: [
        { type: 'goblin', weight: 5, from: 0, pack: [1, 3] },
        { type: 'dire_wolf', weight: 4, from: 0, pack: [2, 3] },
        { type: 'killer_hornet', weight: 4, from: 10, pack: [2, 4] },
        { type: 'toxic_shroom', weight: 3, from: 25, pack: [1, 2] },
        { type: 'treant', weight: 1.6, from: 50, pack: [1, 1] },
      ],
      horde: ['dire_wolf', 'goblin'], wanderers: ['goblin', 'goblin', 'dire_wolf'], maxPassive: 3,
      palette: {
        bg: '#030b07', ground: '#10261a', ground2: '#1e4224', accent: '#7dff8a', fog: '#0e2a1c',
        light: '#ffe58a', ambient: ['#ffe066', '#b9ff7a', '#fff3b0'],
      },
      darkness: 0.28, fogA: 0.11,
      oracle: '《Ambiente: foresta primordiale. Le creature di qui cacciano in branco. Alcuni goblin non sembrano ostili... potresti dar loro un Nome.》',
      bossLine: '《La luna si tinge di cremisi. Un ululato antico chiama a raccolta il branco.》',
    },
    {
      id: 'volcano', name: 'Vulcano Cremisi', subtitle: 'La terra sanguina fuoco, gli orchi forgiano la guerra',
      music: 'volcano', boss: 'orc_tyrant', duration: 150, radius: ARENA_R, ambient: 'embers',
      enemies: [
        { type: 'fire_imp', weight: 5, from: 0, pack: [3, 5] },
        { type: 'salamander', weight: 4, from: 0, pack: [1, 2] },
        { type: 'orc_warrior', weight: 4, from: 15, pack: [1, 3] },
        { type: 'magma_golem', weight: 1.6, from: 45, pack: [1, 1] },
      ],
      horde: ['fire_imp', 'orc_warrior'], wanderers: ['orc_warrior', 'goblin'], maxPassive: 2,
      palette: {
        bg: '#070303', ground: '#1b100d', ground2: '#2e1913', accent: '#ff6a1a', fog: '#3a1208',
        light: '#ffb347', ambient: ['#ff9a3c', '#ff5722', '#ffd180'],
      },
      darkness: 0.3, fogA: 0.14,
      oracle: '《Temperatura estrema rilevata. Il sottosuolo ribolle di magma. Gli orchi di queste terre rispettano soltanto la forza.》',
      bossLine: "《Il suolo trema al ritmo di passi enormi. Il Tiranno degli Orchi ha fiutato la tua forza.》",
    },
    {
      id: 'demon', name: 'Cittadella dei Demoni', subtitle: 'Il trono del Re Caduto attende il suo erede',
      music: 'demon', boss: 'demon_lord', duration: 150, radius: ARENA_R, ambient: 'souls',
      enemies: [
        { type: 'specter', weight: 5, from: 0, pack: [2, 4] },
        { type: 'gargoyle', weight: 4, from: 10, pack: [1, 3] },
        { type: 'dark_mage', weight: 3, from: 20, pack: [1, 2] },
        { type: 'demon_knight', weight: 2.5, from: 35, pack: [1, 2] },
        { type: 'orc_warrior', weight: 1.2, from: 70, pack: [1, 2] },
      ],
      horde: ['specter', 'gargoyle'], wanderers: ['orc_warrior', 'dire_wolf', 'goblin'], maxPassive: 2,
      palette: {
        bg: '#07020a', ground: '#1b0e1f', ground2: '#2d1433', accent: '#d03cff', fog: '#2a0820',
        light: '#ff3d6e', ambient: ['#c86bff', '#ff4f7b', '#ffd1f4'],
      },
      darkness: 0.45, fogA: 0.18,
      oracle: "《Energia demoniaca oltre ogni misura. Questa è la Cittadella del Re Demone Caduto: ogni passo ci avvicina al trono.》",
      bossLine: "《L'aria si fa pesante come piombo. Il Re Demone Caduto si è destato.》",
    },
  ];

  /* ================================================================ canvas helpers */
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = max(1, Math.ceil(w));
    c.height = max(1, Math.ceil(h));
    return c;
  }
  const shade = (hex, k) => (k >= 0 ? U.mix(hex, '#ffffff', k) : U.mix(hex, '#000000', -k));

  const glowCache = new Map();
  function glowSpr(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = mk(128, 128);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, U.rgba(color, 1));
    gr.addColorStop(0.22, U.rgba(color, 0.55));
    gr.addColorStop(0.55, U.rgba(color, 0.17));
    gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    glowCache.set(color, c);
    return c;
  }
  const softCache = new Map();
  function softSpr(color) {
    let c = softCache.get(color);
    if (c) return c;
    c = mk(128, 128);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, U.rgba(color, 1));
    gr.addColorStop(0.45, U.rgba(color, 0.6));
    gr.addColorStop(1, U.rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    softCache.set(color, c);
    return c;
  }
  /** Additive glow; caller sets globalCompositeOperation = 'lighter'. */
  function glowAt(ctx, x, y, r, color, a) {
    if (!(a > 0.01) || !(r > 0.5)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(glowSpr(color), x - r, y - r, r * 2, r * 2);
  }
  function softAt(ctx, x, y, r, color, a) {
    if (!(a > 0.01) || !(r > 0.5)) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(softSpr(color), x - r, y - r, r * 2, r * 2);
  }

  function poly(g, pts) {
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }
  function blobPath(g, cx, cy, rx, ry, rng, n, jag) {
    const px = [], py = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, o = 1 + (rng() - 0.5) * jag;
      px.push(cx + cos(a) * rx * o);
      py.push(cy + sin(a) * ry * o);
    }
    g.beginPath();
    g.moveTo((px[n - 1] + px[0]) / 2, (py[n - 1] + py[0]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.quadraticCurveTo(px[i], py[i], (px[i] + px[j]) / 2, (py[i] + py[j]) / 2);
    }
    g.closePath();
  }
  /** Calls fn at every tiled copy of (x,y) that can touch the [0,S] square. */
  function wrapPts(S, x, y, m, fn) {
    for (let ox = -S; ox <= S; ox += S) {
      const xx = x + ox;
      if (xx < -m || xx > S + m) continue;
      for (let oy = -S; oy <= S; oy += S) {
        const yy = y + oy;
        if (yy < -m || yy > S + m) continue;
        fn(xx, yy, ox, oy);
      }
    }
  }
  function strokePts(g, pts, ox, oy) {
    g.beginPath();
    g.moveTo(pts[0] + ox, pts[1] + oy);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] + ox, pts[i + 1] + oy);
    g.stroke();
  }
  function walkPts(rng, x, y, len, steps, bend) {
    const pts = [x, y];
    let a = rng() * TAU, cx = x, cy = y;
    const sl = len / steps;
    for (let i = 0; i < steps; i++) {
      a += (rng() - 0.5) * bend;
      cx += cos(a) * sl;
      cy += sin(a) * sl;
      pts.push(cx, cy);
    }
    return pts;
  }

  /** Procedural rune glyph on a 3×3 lattice, deterministic by seed. */
  function drawRune(g, x, y, s, seed) {
    const r = mulberry(seed | 0);
    const h = s / 2;
    const gp = (i) => [x + ((i % 3) - 1) * h, y + (floor(i / 3) - 1) * h];
    g.beginPath();
    if (r() < 0.7) { g.moveTo(x, y - h); g.lineTo(x, y + h); }
    const n = 2 + floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = floor(r() * 9);
      let b = floor(r() * 9);
      if (b === a) b = (a + 4) % 9;
      const A = gp(a), B = gp(b);
      g.moveTo(A[0], A[1]);
      g.lineTo(B[0], B[1]);
    }
    if (r() < 0.4) {
      const C = gp(floor(r() * 9));
      g.moveTo(C[0] + s * 0.16, C[1]);
      g.arc(C[0], C[1], s * 0.16, 0, TAU);
    }
    g.stroke();
  }

  /* ================================================================ ground texture */
  function softDot(g, S, x, y, r, col, a) {
    wrapPts(S, x, y, r, (xx, yy) => {
      const gr = g.createRadialGradient(xx, yy, 0, xx, yy, r);
      gr.addColorStop(0, U.rgba(col, a));
      gr.addColorStop(1, U.rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(xx - r, yy - r, r * 2, r * 2);
    });
  }
  function crack(g, S, rng, x, y, len, steps, col, w, hi, branch) {
    const pts = walkPts(rng, x, y, len, steps, 1.1);
    wrapPts(S, x, y, len + 6, (xx, yy, ox, oy) => {
      if (hi) { g.strokeStyle = hi; g.lineWidth = w * 0.7; strokePts(g, pts, ox + 1, oy + 1); }
      g.strokeStyle = col; g.lineWidth = w; strokePts(g, pts, ox, oy);
    });
    if (branch && rng() < 0.6) {
      const k = 2 * (1 + floor(rng() * (steps - 2)));
      crack(g, S, rng, pts[k], pts[k + 1], len * 0.45, max(3, steps >> 1), col, w * 0.6, hi, false);
    }
  }
  function vein(g, S, rng, x, y, len) {
    const pts = walkPts(rng, x, y, len, 9, 1.0);
    wrapPts(S, x, y, len + 8, (xx, yy, ox, oy) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,70,20,0.14)'; g.lineWidth = 9; strokePts(g, pts, ox, oy);
      g.strokeStyle = 'rgba(255,90,26,0.85)'; g.lineWidth = 2.4; strokePts(g, pts, ox, oy);
      g.strokeStyle = 'rgba(255,214,140,0.9)'; g.lineWidth = 0.9; strokePts(g, pts, ox, oy);
    });
  }
  function pebble(g, S, rng, x, y, r, col) {
    const sq = 0.55 + rng() * 0.35, rot = rng() * PI;
    wrapPts(S, x, y, r + 3, (xx, yy) => {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(xx + r * 0.25, yy + r * 0.3, r, r * sq, rot, 0, TAU); g.fill();
      g.fillStyle = col;
      g.beginPath(); g.ellipse(xx, yy, r, r * sq, rot, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath(); g.ellipse(xx - r * 0.25, yy - r * 0.25, r * 0.45, r * 0.3 * sq, rot, 0, TAU); g.fill();
    });
  }
  function dots(g, S, rng, n, cols, rMin, rMax, aMin, aMax) {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = rMin + rng() * (rMax - rMin), a = aMin + rng() * (aMax - aMin);
      const col = cols[floor(rng() * cols.length)];
      wrapPts(S, x, y, r + 1, (xx, yy) => {
        g.fillStyle = U.rgba(col, a);
        g.fillRect(xx - r, yy - r, r * 2, r * 2);
      });
    }
  }

  const TEX_DETAIL = {
    cave(g, S, rng, pal) {
      for (let i = 0; i < 24; i++) softDot(g, S, rng() * S, rng() * S, 30 + rng() * 80, '#000000', 0.16 + rng() * 0.14);
      for (let i = 0; i < 10; i++) softDot(g, S, rng() * S, rng() * S, 40 + rng() * 60, pal.accent, 0.035);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 30; i++) crack(g, S, rng, rng() * S, rng() * S, 50 + rng() * 110, 8, 'rgba(0,0,0,0.55)', 1.4 + rng() * 1.2, U.rgba(pal.light, 0.07), true);
      for (let i = 0; i < 300; i++) pebble(g, S, rng, rng() * S, rng() * S, 1.5 + rng() * 3.5, i % 5 === 0 ? '#3a3468' : '#252046');
      for (let i = 0; i < 30; i++) {
        const cx = rng() * S, cy = rng() * S, col = rng() < 0.5 ? pal.accent : '#9a7dff';
        for (let k = 0; k < 12; k++) {
          const x = cx + (rng() - 0.5) * 26, y = cy + (rng() - 0.5) * 26, r = 0.6 + rng() * 1.4, a = 0.1 + rng() * 0.18;
          wrapPts(S, x, y, 3, (xx, yy) => { g.fillStyle = U.rgba(col, a); g.fillRect(xx - r, yy - r, r * 2, r * 2); });
        }
      }
      dots(g, S, rng, 90, [pal.light], 0.6, 0.9, 0.35, 0.85);
    },
    forest(g, S, rng, pal) {
      for (let i = 0; i < 16; i++) softDot(g, S, rng() * S, rng() * S, 40 + rng() * 70, '#3b2a16', 0.3);
      for (let i = 0; i < 14; i++) softDot(g, S, rng() * S, rng() * S, 40 + rng() * 70, '#4f8a2e', 0.12);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 9; i++) crack(g, S, rng, rng() * S, rng() * S, 60 + rng() * 80, 6, 'rgba(58,38,20,0.75)', 3 + rng() * 2, 'rgba(140,105,60,0.25)', true);
      const LEAF = ['#2f5d2a', '#3d7a2f', '#56892f', '#6f7a2a', '#8a5a20', '#c9a227', '#244a22'];
      for (let i = 0; i < 420; i++) {
        const x = rng() * S, y = rng() * S, rx = 2.5 + rng() * 2.2, ry = 1.1 + rng() * 0.9, rot = rng() * PI;
        const col = LEAF[floor(rng() * LEAF.length)];
        wrapPts(S, x, y, 6, (xx, yy) => {
          g.fillStyle = col;
          g.beginPath(); g.ellipse(xx, yy, rx, ry, rot, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.5;
          g.beginPath(); g.moveTo(xx - cos(rot) * rx, yy - sin(rot) * rx); g.lineTo(xx + cos(rot) * rx, yy + sin(rot) * rx); g.stroke();
        });
      }
      const GR = ['#3f7d34', '#4f9a3c', '#2e6328', '#6fae46', '#87c25a'];
      g.lineWidth = 1.1;
      for (let i = 0; i < 2000; i++) {
        const x = rng() * S, y = rng() * S, h = 3 + rng() * 6, lean = (rng() - 0.5) * 5;
        const col = GR[floor(rng() * GR.length)];
        wrapPts(S, x, y, 10, (xx, yy) => {
          g.strokeStyle = col;
          g.beginPath(); g.moveTo(xx, yy); g.quadraticCurveTo(xx + lean * 0.3, yy - h * 0.6, xx + lean, yy - h); g.stroke();
        });
      }
      const FL = ['#ffffff', '#ffd54f', '#ff9ad5', '#b388ff'];
      for (let i = 0; i < 140; i++) {
        const x = rng() * S, y = rng() * S, col = FL[floor(rng() * FL.length)];
        wrapPts(S, x, y, 4, (xx, yy) => {
          g.fillStyle = col;
          for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; g.fillRect(xx + cos(a) * 1.3 - 0.8, yy + sin(a) * 1.3 - 0.8, 1.6, 1.6); }
          g.fillStyle = '#fff59d'; g.fillRect(xx - 0.6, yy - 0.6, 1.2, 1.2);
        });
      }
    },
    volcano(g, S, rng, pal) {
      for (let i = 0; i < 22; i++) softDot(g, S, rng() * S, rng() * S, 30 + rng() * 80, '#000000', 0.3);
      for (let i = 0; i < 10; i++) softDot(g, S, rng() * S, rng() * S, 40 + rng() * 60, '#5a4a44', 0.12);
      for (let i = 0; i < 8; i++) softDot(g, S, rng() * S, rng() * S, 30 + rng() * 40, pal.accent, 0.05);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 46; i++) crack(g, S, rng, rng() * S, rng() * S, 40 + rng() * 100, 7, 'rgba(0,0,0,0.7)', 2 + rng() * 1.2, 'rgba(255,120,60,0.09)', true);
      for (let i = 0; i < 14; i++) vein(g, S, rng, rng() * S, rng() * S, 50 + rng() * 90);
      dots(g, S, rng, 2200, ['#6b5f5a', '#4a403c', '#8a7a70'], 0.4, 0.9, 0.12, 0.3);
      dots(g, S, rng, 130, ['#ff8a3c', '#ffb347'], 0.5, 0.9, 0.35, 0.7);
    },
    demon(g, S, rng, pal) {
      const T = 64;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, S, S);
      const base = U.hexToRgb(pal.ground2);
      for (let row = 0; row < S / T; row++) {
        for (let col = 0; col < S / T; col++) {
          const off = (row % 2) * (T / 2);
          const cx = col * T + off + T / 2, cy = row * T + T / 2;
          const k = 0.75 + rng() * 0.45, a = 0.5 + rng() * 0.2;
          const fill = `rgba(${floor(base.r * k)},${floor(base.g * k)},${floor(base.b * k)},${a})`;
          const cracked = rng() < 0.28, rune = rng() < 0.1, rseed = floor(rng() * 1e6);
          const cpts = cracked ? walkPts(rng, cx + (rng() - 0.5) * 30, cy + (rng() - 0.5) * 30, 26 + rng() * 20, 5, 1.2) : null;
          wrapPts(S, cx, cy, T, (xx, yy, ox, oy) => {
            const x0 = xx - T / 2 + 2, y0 = yy - T / 2 + 2, w = T - 4;
            g.fillStyle = fill; g.fillRect(x0, y0, w, w);
            g.fillStyle = 'rgba(255,220,255,0.05)'; g.fillRect(x0, y0, w, 2); g.fillRect(x0, y0, 2, w);
            g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x0, y0 + w - 2, w, 2); g.fillRect(x0 + w - 2, y0, 2, w);
            if (cpts) { g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.3; strokePts(g, cpts, ox, oy); }
            if (rune) { g.strokeStyle = U.rgba(pal.accent, 0.22); g.lineWidth = 1.6; g.lineCap = 'round'; drawRune(g, xx, yy, 26, rseed); }
          });
        }
      }
      for (let i = 0; i < 9; i++) {
        const x = rng() * S, y = rng() * S, r = 10 + rng() * 22;
        softDot(g, S, x, y, r * 1.6, '#5a0014', 0.35);
        const seed = floor(rng() * 1e6);
        wrapPts(S, x, y, r * 1.4, (xx, yy) => {
          g.fillStyle = 'rgba(70,0,16,0.45)';
          blobPath(g, xx, yy, r, r * 0.7, mulberry(seed), 9, 0.5); g.fill();
        });
      }
      dots(g, S, rng, 900, ['#000000'], 0.5, 1.2, 0.15, 0.35);
      dots(g, S, rng, 60, [pal.accent, pal.light], 0.5, 0.8, 0.25, 0.6);
    },
  };

  function buildTexture(bi) {
    const b = biomes[bi], pal = b.palette, S = TEX;
    const c = mk(S, S), g = c.getContext('2d');
    const rng = mulberry(9001 + bi * 131);
    const L = [4, 8, 16, 32], AMP = [0.5, 0.26, 0.15, 0.09];
    const tabs = [];
    for (let o = 0; o < 4; o++) {
      const n = L[o] * L[o], tb = new Float32Array(n);
      for (let i = 0; i < n; i++) tb[i] = rng();
      tabs.push(tb);
    }
    const A = U.hexToRgb(pal.ground), B = U.hexToRgb(pal.ground2);
    const img = g.createImageData ? g.createImageData(S, S) : null;
    const d = img && img.data;
    if (d && d.length >= S * S * 4) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let n = 0;
          for (let o = 0; o < 4; o++) {
            const l = L[o], tb = tabs[o];
            const gx = (x * l) / S, gy = (y * l) / S;
            const ix = gx | 0, iy = gy | 0;
            let fx = gx - ix, fy = gy - iy;
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            const ix1 = (ix + 1) % l, iy1 = (iy + 1) % l;
            const a = tb[iy * l + ix], bb = tb[iy * l + ix1], cc = tb[iy1 * l + ix], dd = tb[iy1 * l + ix1];
            const top = a + (bb - a) * fx, bot = cc + (dd - cc) * fx;
            n += AMP[o] * (top + (bot - top) * fy);
          }
          let k = (n - 0.3) * 2.2;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          const sh = 0.78 + n * 0.42 + (rng() - 0.5) * 0.07;
          const p = (y * S + x) << 2;
          d[p] = (A.r + (B.r - A.r) * k) * sh;
          d[p + 1] = (A.g + (B.g - A.g) * k) * sh;
          d[p + 2] = (A.b + (B.b - A.b) * k) * sh;
          d[p + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    } else {
      g.fillStyle = pal.ground;
      g.fillRect(0, 0, S, S);
    }
    TEX_DETAIL[b.id](g, S, rng, pal);
    return c;
  }

  /* ================================================================ decor sprites */
  function sprCircle(R, col, seed, pts) {
    const S = Math.ceil(R * 2 + 16), c = mk(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    const ring = (r, w, a) => { g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
    g.globalAlpha = 0.06; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    ring(R, 3, 0.9); ring(R - 7, 1.2, 0.6); ring(R * 0.74, 2.2, 0.8); ring(R * 0.7, 1, 0.45); ring(R * 0.36, 1.6, 0.7);
    g.globalAlpha = 0.55; g.lineWidth = 1.2;
    const tk = floor(R / 4);
    g.beginPath();
    for (let i = 0; i < tk; i++) {
      const a = (i / tk) * TAU, r0 = R - 7, r1 = R - (i % 4 === 0 ? 0 : 4);
      g.moveTo(cos(a) * r0, sin(a) * r0); g.lineTo(cos(a) * r1, sin(a) * r1);
    }
    g.stroke();
    const band = (R - 7 + R * 0.74) / 2, gs = (R - 7 - R * 0.74) * 0.62;
    const n = max(6, floor((TAU * band) / (gs * 1.7)));
    g.globalAlpha = 0.85; g.lineWidth = max(1, gs * 0.12);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      g.save(); g.translate(cos(a) * band, sin(a) * band); g.rotate(a + PI / 2);
      drawRune(g, 0, 0, gs, seed * 31 + i * 7);
      g.restore();
    }
    const k = pts || 8, step = k === 8 ? 3 : 2, rs = R * 0.7;
    g.globalAlpha = 0.75; g.lineWidth = 1.8;
    g.beginPath();
    for (let i = 0; i <= k; i++) {
      const idx = (i * step) % k, a = (idx / k) * TAU - PI / 2;
      if (i === 0) g.moveTo(cos(a) * rs, sin(a) * rs); else g.lineTo(cos(a) * rs, sin(a) * rs);
    }
    g.stroke();
    g.globalAlpha = 0.9;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * TAU - PI / 2;
      g.beginPath(); g.arc(cos(a) * rs, sin(a) * rs, max(2, R * 0.03), 0, TAU); g.fill();
    }
    g.globalAlpha = 0.6; g.lineWidth = 1.4;
    for (let s = 0; s < 2; s++) {
      g.beginPath();
      for (let i = 0; i <= 4; i++) {
        const a = (i / 4) * TAU + s * (PI / 4), r = R * 0.33;
        if (i === 0) g.moveTo(cos(a) * r, sin(a) * r); else g.lineTo(cos(a) * r, sin(a) * r);
      }
      g.stroke();
    }
    g.globalAlpha = 0.95; g.lineWidth = max(1.5, R * 0.025);
    drawRune(g, 0, 0, R * 0.3, seed * 13 + 5);
    g.globalAlpha = 1;
    return c;
  }

  function sprGlyph(col, seed) {
    const c = mk(36, 36), g = c.getContext('2d');
    g.strokeStyle = col; g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round';
    drawRune(g, 18, 18, 22, seed);
    g.fillStyle = col; g.globalAlpha = 0.8;
    g.beginPath(); g.arc(18, 32, 1.6, 0, TAU); g.fill();
    return c;
  }

  function sprBeam(col) {
    const c = mk(64, 512), g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, U.rgba(col, 0)); gr.addColorStop(0.5, U.rgba(col, 1)); gr.addColorStop(1, U.rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
    g.globalCompositeOperation = 'destination-in';
    gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
    return c;
  }

  function sprCrystal(rng, col, rockCol, sc) {
    const s = sc || 1;
    const W = 120 * s, H = 140 * s, c = mk(W, H), g = c.getContext('2d');
    const bx = W / 2, by = H - 24 * s;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(bx, by + 4 * s, 40 * s, 12 * s, 0, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) {
      const rx = bx + (rng() - 0.5) * 50 * s, ry = by + (rng() - 0.3) * 8 * s, rr = (8 + rng() * 9) * s;
      g.fillStyle = shade(rockCol, (rng() - 0.5) * 0.3);
      g.beginPath(); g.ellipse(rx, ry, rr, rr * 0.6, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.beginPath(); g.ellipse(rx - rr * 0.2, ry - rr * 0.25, rr * 0.6, rr * 0.3, 0, 0, TAU); g.fill();
    }
    const n = 3 + floor(rng() * 4);
    const sh = [];
    for (let i = 0; i < n; i++) {
      const side = i / (n - 1) - 0.5;
      sh.push({
        a: -PI / 2 + side * 1.4 + (rng() - 0.5) * 0.3,
        len: (38 + rng() * 30 + (1 - abs(side) * 2) * 30) * s,
        w: (9 + rng() * 9) * s,
        ox: (side * 34 + (rng() - 0.5) * 8) * s,
      });
    }
    sh.sort((p, q) => abs(q.a + PI / 2) - abs(p.a + PI / 2));
    const lit = shade(col, 0.35), dark = shade(col, -0.45), edge = U.rgba(shade(col, 0.7), 0.75);
    for (const q of sh) {
      const dx = cos(q.a), dy = sin(q.a), px = -dy, py = dx, hw = q.w / 2;
      const x0 = bx + q.ox, y0 = by;
      const blx = x0 + px * hw, bly = y0 + py * hw, brx = x0 - px * hw, bry = y0 - py * hw;
      const sl = q.len * 0.74;
      const slx = blx + dx * sl, sly = bly + dy * sl, srx = brx + dx * sl, sry = bry + dy * sl;
      const tx = x0 + dx * q.len, ty = y0 + dy * q.len;
      g.globalAlpha = 0.93;
      g.fillStyle = px < 0 ? lit : dark; poly(g, [blx, bly, slx, sly, tx, ty, x0, y0]); g.fill();
      g.fillStyle = px < 0 ? dark : lit; poly(g, [x0, y0, tx, ty, srx, sry, brx, bry]); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = edge; g.lineWidth = 1;
      poly(g, [blx, bly, slx, sly, tx, ty, srx, sry, brx, bry]); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0 + dx * q.len * 0.18, y0 + dy * q.len * 0.18); g.lineTo(tx - dx * 4 * s, ty - dy * 4 * s); g.stroke();
    }
    const gr = g.createRadialGradient(bx, by - 10 * s, 0, bx, by - 10 * s, 28 * s);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, U.rgba(col, 0));
    g.fillStyle = gr; g.fillRect(bx - 30 * s, by - 40 * s, 60 * s, 60 * s);
    return c;
  }

  function sprStalag(rng) {
    const h = 50 + rng() * 45, rw = 15 + rng() * 10;
    const W = rw * 2 + 34, H = h + 30, c = mk(W, H), g = c.getContext('2d');
    const bx = W / 2, by = H - 12;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(bx + 6, by + 2, rw + 11, 7, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(bx - rw, 0, bx + rw, 0);
    gr.addColorStop(0, '#4c4584'); gr.addColorStop(0.4, '#2c2754'); gr.addColorStop(1, '#110e25');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(bx - rw, by);
    g.quadraticCurveTo(bx - rw * 0.45, by - h * 0.45, bx - 2, by - h);
    g.lineTo(bx + 2, by - h);
    g.quadraticCurveTo(bx + rw * 0.55, by - h * 0.4, bx + rw, by);
    g.quadraticCurveTo(bx, by + 7, bx - rw, by);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const yy = by - h * (0.18 + 0.22 * k), ww = rw * (1 - (0.18 + 0.22 * k)) * 0.95;
      g.beginPath(); g.moveTo(bx - ww, yy); g.quadraticCurveTo(bx, yy + 4, bx + ww, yy); g.stroke();
    }
    g.strokeStyle = 'rgba(160,230,255,0.28)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(bx - rw * 0.6, by - 4); g.quadraticCurveTo(bx - rw * 0.35, by - h * 0.5, bx - 2, by - h + 6); g.stroke();
    g.fillStyle = 'rgba(160,240,255,0.6)';
    g.beginPath(); g.arc(bx, by - h + 3, 1.6, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) {
      const rx = bx + (rng() - 0.5) * rw * 2.4, rr = 2 + rng() * 4;
      g.fillStyle = '#231e44'; g.beginPath(); g.ellipse(rx, by + 2, rr, rr * 0.6, 0, 0, TAU); g.fill();
    }
    return { c, ax: bx, ay: by };
  }

  function sprPuddle(rng, pal, rx, ry) {
    const W = rx * 2 + 16, H = ry * 2 + 16, c = mk(W, H), g = c.getContext('2d');
    const cx = W / 2, cy = H / 2, seed = floor(rng() * 1e9);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    blobPath(g, cx, cy + 2, rx + 3, ry + 3, mulberry(seed), 12, 0.35); g.fill();
    const gr = g.createRadialGradient(cx, cy - ry * 0.3, 0, cx, cy, max(rx, ry));
    gr.addColorStop(0, '#0a1530'); gr.addColorStop(0.7, '#12284a'); gr.addColorStop(1, '#1d4170');
    g.fillStyle = gr;
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 12, 0.35); g.fill();
    g.save();
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 12, 0.35); g.clip();
    for (let k = 0; k < 4; k++) {
      const x = cx + (rng() - 0.5) * rx * 1.3, w = 3 + rng() * 6;
      const lg = g.createLinearGradient(0, cy - ry, 0, cy + ry);
      lg.addColorStop(0, U.rgba(pal.accent, 0.3)); lg.addColorStop(1, U.rgba(pal.accent, 0));
      g.fillStyle = lg; g.fillRect(x - w / 2, cy - ry, w, ry * 1.6);
    }
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.ellipse(cx - rx * 0.2, cy - ry * 0.45, rx * 0.55, ry * 0.18, -0.1, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = U.rgba(pal.accent, 0.35); g.lineWidth = 1.4;
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 12, 0.35); g.stroke();
    return c;
  }

  function sprShroom(rng, capCol, glowy, stemCol) {
    const W = 54, H = 46, c = mk(W, H), g = c.getContext('2d');
    const by = 40;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(27, by + 1, 18, 5, 0, 0, TAU); g.fill();
    const n = 2 + floor(rng() * 3);
    const list = [];
    for (let i = 0; i < n; i++) list.push({ ox: (rng() - 0.5) * 28, h: 8 + rng() * 12, r: 5 + rng() * 5 });
    list.sort((a, b) => b.h - a.h);
    for (const m of list) {
      const x = 27 + m.ox, top = by - m.h;
      g.fillStyle = stemCol || (glowy ? '#bdeef7' : '#ded3c0');
      g.fillRect(x - m.r * 0.22, top, m.r * 0.44, m.h);
      const gr = g.createRadialGradient(x - m.r * 0.3, top - m.r * 0.35, 0, x, top, m.r);
      gr.addColorStop(0, shade(capCol, 0.45)); gr.addColorStop(1, shade(capCol, -0.3));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(x, top, m.r, m.r * 0.66, 0, PI, TAU); g.quadraticCurveTo(x, top + m.r * 0.3, x - m.r, top); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(x, top + 0.5, m.r * 0.9, m.r * 0.18, 0, 0, PI); g.fill();
      g.fillStyle = glowy ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 3; k++) {
        const sx = x + (rng() - 0.5) * m.r * 1.2, sy = top - m.r * (0.15 + rng() * 0.35);
        g.beginPath(); g.arc(sx, sy, 0.8 + rng() * 1.1, 0, TAU); g.fill();
      }
    }
    return c;
  }

  function sprRocks(rng, base, n, spread) {
    const W = spread * 2 + 30, H = spread + 30, c = mk(W, H), g = c.getContext('2d');
    const cx = W / 2, cy = H / 2 + 4;
    const list = [];
    for (let i = 0; i < n; i++) list.push({ x: cx + (rng() - 0.5) * spread * 1.6, y: cy + (rng() - 0.5) * spread * 0.6, r: 4 + rng() * spread * 0.32 });
    list.sort((a, b) => a.y - b.y);
    for (const r of list) {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(r.x + 2, r.y + r.r * 0.45, r.r * 1.05, r.r * 0.45, 0, 0, TAU); g.fill();
      const seed = floor(rng() * 1e9);
      const gr = g.createLinearGradient(r.x - r.r, r.y - r.r, r.x + r.r, r.y + r.r);
      gr.addColorStop(0, shade(base, 0.25)); gr.addColorStop(1, shade(base, -0.45));
      g.fillStyle = gr;
      blobPath(g, r.x, r.y, r.r, r.r * 0.75, mulberry(seed), 7, 0.45); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.beginPath(); g.ellipse(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.4, r.r * 0.2, -0.4, 0, TAU); g.fill();
    }
    return c;
  }

  function sprBoulder(rng) {
    const W = 84, H = 70, c = mk(W, H), g = c.getContext('2d');
    const cx = 42, cy = 38, rx = 26 + rng() * 8, ry = 18 + rng() * 5, seed = floor(rng() * 1e9);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(cx + 6, cy + ry * 0.7, rx * 1.05, ry * 0.5, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
    gr.addColorStop(0, '#7a8078'); gr.addColorStop(0.5, '#4d544c'); gr.addColorStop(1, '#262b25');
    g.fillStyle = gr;
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 9, 0.3); g.fill();
    g.save();
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 9, 0.3); g.clip();
    g.fillStyle = '#3f7d34';
    blobPath(g, cx - rx * 0.2, cy - ry * 0.7, rx * 0.9, ry * 0.65, mulberry(seed + 7), 9, 0.5); g.fill();
    g.fillStyle = '#6fae46';
    blobPath(g, cx - rx * 0.35, cy - ry * 0.85, rx * 0.5, ry * 0.35, mulberry(seed + 9), 8, 0.5); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(cx + rx * 0.2, cy - ry * 0.1); g.lineTo(cx + rx * 0.45, cy + ry * 0.4); g.stroke();
    return c;
  }

  function sprTrunk(rng) {
    const W = 150, H = 112, c = mk(W, H), g = c.getContext('2d');
    const bx = 75, by = 92;
    g.lineCap = 'round';
    const n = 5 + floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rng() - 0.5) * 0.6, len = 30 + rng() * 34;
      let x = bx, y = by - 4, w = 11;
      for (let s = 0; s < 4; s++) {
        const aa = a + (rng() - 0.5) * 0.5;
        const nx = x + (cos(aa) * len) / 4, ny = y + ((sin(aa) * len) / 4) * 0.6;
        g.strokeStyle = '#26170b'; g.lineWidth = w + 2.5;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = '#4a3019'; g.lineWidth = w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = 'rgba(170,125,75,0.25)'; g.lineWidth = w * 0.3;
        g.beginPath(); g.moveTo(x - 1, y - 1.5); g.lineTo(nx - 1, ny - 1.5); g.stroke();
        x = nx; y = ny; w *= 0.66;
      }
    }
    const gr = g.createLinearGradient(bx - 17, 0, bx + 17, 0);
    gr.addColorStop(0, '#7a5530'); gr.addColorStop(0.45, '#5a3a1e'); gr.addColorStop(1, '#24150a');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(bx - 16, by - 76);
    g.lineTo(bx + 16, by - 76);
    g.lineTo(bx + 19, by);
    g.ellipse(bx, by, 19, 7, 0, 0, PI);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      const xx = bx - 10 + k * 6.5 + (rng() - 0.5) * 2;
      g.beginPath(); g.moveTo(xx, by - 74);
      g.bezierCurveTo(xx + 3, by - 52, xx - 3, by - 28, xx + 1, by + 2); g.stroke();
    }
    g.fillStyle = 'rgba(111,174,70,0.55)';
    g.beginPath(); g.ellipse(bx - 10, by - 4, 9, 4, 0.2, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(bx + 9, by - 18, 5, 3, -0.4, 0, TAU); g.fill();
    return { c, ax: bx, ay: by };
  }

  const CANOPY = [
    ['#123d1f', '#1f5e2c', '#3f8f3a', '#b6e36a'],
    ['#0f3326', '#1a5440', '#2f8a5e', '#9af0c0'],
    ['#163a14', '#2c6a22', '#5aa83a', '#ffe58a'],
    ['#3a2410', '#7a4a16', '#c98a2a', '#ffd166'],
  ];
  function sprCanopy(rng, cols, R, blossom) {
    const S = Math.ceil(R * 2 + 28), c = mk(S, S), g = c.getContext('2d');
    const o = S / 2;
    const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(o + 6, o + 8, R * 0.98, 0, TAU); g.fill();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rng() * 0.3, d = R * (0.74 + rng() * 0.08);
      blob(o + cos(a) * d, o + sin(a) * d, R * (0.2 + rng() * 0.08), cols[0]);
    }
    blob(o, o, R * 0.8, cols[0]);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rng() * 0.5, d = R * (0.35 + rng() * 0.2);
      blob(o - R * 0.06 + cos(a) * d, o - R * 0.08 + sin(a) * d, R * (0.3 + rng() * 0.12), cols[1]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + rng(), d = R * (0.15 + rng() * 0.3);
      blob(o - R * 0.22 + cos(a) * d, o - R * 0.26 + sin(a) * d, R * (0.13 + rng() * 0.08), cols[2]);
    }
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createRadialGradient(o - R * 0.35, o - R * 0.35, R * 0.1, o, o, R * 1.15);
    gr.addColorStop(0, 'rgba(255,255,220,0.12)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 46; i++) {
      const a = rng() * TAU, d = sqrt(rng()) * R * 0.85;
      g.globalAlpha = 0.35 + rng() * 0.5;
      blob(o - R * 0.1 + cos(a) * d, o - R * 0.1 + sin(a) * d, 0.8 + rng() * 1.4, cols[3]);
    }
    if (blossom) {
      for (let i = 0; i < 34; i++) {
        const a = rng() * TAU, d = sqrt(rng()) * R * 0.85;
        g.globalAlpha = 0.85;
        blob(o + cos(a) * d, o + sin(a) * d, 1.6 + rng() * 1.6, i % 3 ? '#ff9ad5' : '#ffe1f2');
      }
    }
    g.globalAlpha = 1;
    return c;
  }

  function sprFlowers(rng, col) {
    const W = 50, H = 42, c = mk(W, H), g = c.getContext('2d');
    const n = 4 + floor(rng() * 4);
    g.fillStyle = '#2f6a2a';
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.ellipse(25 + (rng() - 0.5) * 30, 26 + (rng() - 0.5) * 14, 4, 1.6, rng() * PI, 0, TAU); g.fill();
    }
    for (let i = 0; i < n; i++) {
      const x = 25 + (rng() - 0.5) * 32, y = 22 + (rng() - 0.5) * 22, pr = 2.2 + rng() * 1.2;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.arc(x + 1.5, y + 2, pr * 1.6, 0, TAU); g.fill();
      g.fillStyle = col;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + i;
        g.beginPath(); g.arc(x + cos(a) * pr, y + sin(a) * pr, pr * 0.85, 0, TAU); g.fill();
      }
      g.fillStyle = '#ffd740';
      g.beginPath(); g.arc(x, y, pr * 0.55, 0, TAU); g.fill();
    }
    return c;
  }

  function sprGrass(rng) {
    const W = 36, H = 30, c = mk(W, H), g = c.getContext('2d');
    const bx = 18, by = 28;
    const GR = ['#3f7d34', '#4f9a3c', '#2e6328', '#6fae46', '#87c25a'];
    g.lineCap = 'round';
    const n = 8 + floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const ox = (rng() - 0.5) * 16, h = 12 + rng() * 14, lean = (rng() - 0.5) * 14;
      g.strokeStyle = GR[floor(rng() * GR.length)]; g.lineWidth = 1.6 + rng();
      g.beginPath(); g.moveTo(bx + ox, by); g.quadraticCurveTo(bx + ox + lean * 0.3, by - h * 0.6, bx + ox + lean, by - h); g.stroke();
    }
    return { c, ax: bx, ay: by };
  }

  function sprLava(rng, rx, ry) {
    const W = rx * 2 + 34, H = ry * 2 + 34, c = mk(W, H), g = c.getContext('2d');
    const cx = W / 2, cy = H / 2, seed = floor(rng() * 1e9);
    g.fillStyle = '#140805';
    blobPath(g, cx, cy + 2, rx + 12, ry + 10, mulberry(seed), 14, 0.3); g.fill();
    g.strokeStyle = 'rgba(120,70,50,0.45)'; g.lineWidth = 2;
    blobPath(g, cx, cy + 2, rx + 12, ry + 10, mulberry(seed), 14, 0.3); g.stroke();
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, max(rx, ry));
    gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.3, '#ffb300'); gr.addColorStop(0.7, '#ff5a1a'); gr.addColorStop(1, '#a3160a');
    g.fillStyle = gr;
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 14, 0.3); g.fill();
    g.save();
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 14, 0.3); g.clip();
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU, d = sqrt(rng()) * 0.8;
      const px = cx + cos(a) * rx * d, py = cy + sin(a) * ry * d, pr = 5 + rng() * 10;
      g.fillStyle = 'rgba(43,18,10,0.82)';
      blobPath(g, px, py, pr, pr * 0.7, mulberry(seed + i * 17), 6, 0.6); g.fill();
      g.strokeStyle = 'rgba(255,170,60,0.6)'; g.lineWidth = 1;
      blobPath(g, px, py, pr, pr * 0.7, mulberry(seed + i * 17), 6, 0.6); g.stroke();
    }
    g.strokeStyle = 'rgba(255,240,180,0.35)'; g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const y = cy + (rng() - 0.5) * ry * 1.2;
      g.beginPath(); g.moveTo(cx - rx, y); g.bezierCurveTo(cx - rx * 0.3, y - 6, cx + rx * 0.3, y + 6, cx + rx, y); g.stroke();
    }
    g.restore();
    return c;
  }

  function sprVent(rng) {
    const W = 84, H = 64, c = mk(W, H), g = c.getContext('2d');
    const cx = 42, cy = 34;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rng() * 0.3, r = 7 + rng() * 6;
      const x = cx + cos(a) * 22, y = cy + sin(a) * 13;
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x + 2, y + 3, r, r * 0.6, 0, 0, TAU); g.fill();
      g.fillStyle = shade('#2a1a14', (rng() - 0.5) * 0.3); g.beginPath(); g.ellipse(x, y, r, r * 0.65, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,140,80,0.1)'; g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.25, 0, 0, TAU); g.fill();
    }
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 18);
    gr.addColorStop(0, '#fff1b8'); gr.addColorStop(0.35, '#ffb347'); gr.addColorStop(0.75, '#ff5a1a'); gr.addColorStop(1, '#3a0c05');
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 17, 10, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,110,40,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      g.beginPath(); g.moveTo(cx + cos(a) * 17, cy + sin(a) * 10);
      g.lineTo(cx + cos(a + (rng() - 0.5) * 0.4) * (28 + rng() * 10), cy + sin(a) * (17 + rng() * 6)); g.stroke();
    }
    return c;
  }

  function sprBasalt(rng) {
    const W = 120, H = 110, c = mk(W, H), g = c.getContext('2d');
    const cols = [];
    const hr = 12;
    const cells = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1], [2, -1], [-2, 1], [1, 1], [-1, -1]];
    const n = 7 + floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const q = cells[i][0], r = cells[i][1];
      cols.push({ x: 60 + hr * 1.5 * q, y: 64 + hr * 1.73 * (r + q / 2) * 0.62, h: 6 + rng() * 22 });
    }
    cols.sort((a, b) => a.y - b.y);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(64, 74, 46, 20, 0, 0, TAU); g.fill();
    for (const k of cols) {
      const x = k.x, y = k.y - k.h;
      const hx = (i) => x + cos((i / 6) * TAU) * hr, hy = (i) => y + sin((i / 6) * TAU) * hr * 0.62;
      g.fillStyle = '#140d0b';
      poly(g, [hx(0), hy(0), hx(0), hy(0) + k.h, hx(1), hy(1) + k.h, hx(2), hy(2) + k.h, hx(3), hy(3) + k.h, hx(3), hy(3), hx(2), hy(2), hx(1), hy(1)]); g.fill();
      g.fillStyle = '#211714';
      poly(g, [hx(0), hy(0), hx(0), hy(0) + k.h, hx(1), hy(1) + k.h, hx(1), hy(1)]); g.fill();
      const gr = g.createLinearGradient(x - hr, y - hr, x + hr, y + hr);
      gr.addColorStop(0, '#4a3c36'); gr.addColorStop(1, '#221815');
      g.fillStyle = gr;
      poly(g, [hx(0), hy(0), hx(1), hy(1), hx(2), hy(2), hx(3), hy(3), hx(4), hy(4), hx(5), hy(5)]); g.fill();
      g.strokeStyle = 'rgba(255,120,60,0.18)'; g.lineWidth = 1; g.stroke();
    }
    return c;
  }

  function sprPillarBase() {
    const W = 100, H = 70, c = mk(W, H), g = c.getContext('2d');
    const cx = 50, cy = 38;
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.ellipse(cx + 8, cy + 8, 44, 20, 0, 0, TAU); g.fill();
    const oct = (r, ry, dy) => {
      const p = [];
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8; p.push(cx + cos(a) * r, cy + dy + sin(a) * ry); }
      return p;
    };
    g.fillStyle = '#120a16'; poly(g, oct(40, 20, 6)); g.fill();
    g.fillStyle = '#2b1f33'; poly(g, oct(40, 20, 0)); g.fill();
    g.strokeStyle = 'rgba(220,150,255,0.18)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#16101b'; poly(g, oct(30, 15, 0)); g.fill();
    g.fillStyle = '#3a2a45'; poly(g, oct(30, 15, -4)); g.fill();
    g.strokeStyle = 'rgba(208,60,255,0.35)'; g.lineWidth = 1; g.stroke();
    return { c, ax: cx, ay: cy };
  }

  function sprPillarShaft(rng, broken, pal) {
    const H = broken ? 96 + rng() * 30 : 186, W = 76, c = mk(W, H + 10), g = c.getContext('2d');
    const bx = W / 2, by = H + 4, top = broken ? 18 : 30;
    const gr = g.createLinearGradient(bx - 16, 0, bx + 16, 0);
    gr.addColorStop(0, '#5a4868'); gr.addColorStop(0.35, '#3a2b47'); gr.addColorStop(1, '#120b18');
    g.fillStyle = gr;
    if (broken) {
      const pts = [bx - 16, by - 10, bx - 16, top + 10];
      for (let i = 0; i <= 5; i++) pts.push(bx - 16 + (32 * i) / 5, top + rng() * 18);
      pts.push(bx + 16, by - 10);
      poly(g, pts); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.stroke();
    } else {
      g.fillRect(bx - 16, top, 32, by - 10 - top);
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(bx + k * 8, top + 14); g.lineTo(bx + k * 8, by - 12); g.stroke(); }
    g.strokeStyle = 'rgba(255,230,255,0.12)'; g.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(bx + k * 8 - 2, top + 14); g.lineTo(bx + k * 8 - 2, by - 12); g.stroke(); }
    g.fillStyle = '#2a1f33'; g.fillRect(bx - 20, by - 14, 40, 12);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(bx - 20, by - 14, 40, 2);
    if (!broken) {
      const cg = g.createLinearGradient(bx - 24, 0, bx + 24, 0);
      cg.addColorStop(0, '#6a5578'); cg.addColorStop(0.4, '#3d2d4a'); cg.addColorStop(1, '#150d1b');
      g.fillStyle = cg;
      g.fillRect(bx - 24, top - 4, 48, 16);
      poly(g, [bx - 24, top - 4, bx - 18, top - 14, bx - 12, top - 4]); g.fill();
      poly(g, [bx + 24, top - 4, bx + 18, top - 14, bx + 12, top - 4]); g.fill();
      poly(g, [bx - 8, top - 4, bx, top - 26, bx + 8, top - 4]); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx - 24, top - 4); g.lineTo(bx + 24, top - 4); g.stroke();
    }
    g.strokeStyle = U.rgba(pal.light, 0.85); g.lineWidth = 2; g.lineCap = 'round';
    drawRune(g, bx, top + (by - top) * 0.42, 14, floor(rng() * 1e6));
    return { c, ax: bx, ay: by, runeY: by - (top + (by - top) * 0.42), top: by - top };
  }

  function sprBlood(rng, rx, ry) {
    const W = rx * 2 + 16, H = ry * 2 + 16, c = mk(W, H), g = c.getContext('2d');
    const cx = W / 2, cy = H / 2, seed = floor(rng() * 1e9);
    const gr = g.createRadialGradient(cx - rx * 0.2, cy - ry * 0.2, 0, cx, cy, max(rx, ry));
    gr.addColorStop(0, '#8a0f26'); gr.addColorStop(0.7, '#5a0516'); gr.addColorStop(1, '#2a0009');
    g.fillStyle = gr;
    blobPath(g, cx, cy, rx, ry, mulberry(seed), 11, 0.45); g.fill();
    for (let i = 0; i < 4; i++) {
      const a = rng() * TAU;
      g.beginPath(); g.arc(cx + cos(a) * rx * 1.15, cy + sin(a) * ry * 1.15, 1.5 + rng() * 2.5, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,200,220,0.22)';
    g.beginPath(); g.ellipse(cx - rx * 0.3, cy - ry * 0.4, rx * 0.35, ry * 0.12, -0.2, 0, TAU); g.fill();
    return c;
  }

  function sprBrazier() {
    const W = 50, H = 56, c = mk(W, H), g = c.getContext('2d');
    const bx = 25, by = 50;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.ellipse(bx + 3, by, 17, 5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#1d1822'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx - 12, by); g.lineTo(bx - 4, by - 18); g.moveTo(bx + 12, by); g.lineTo(bx + 4, by - 18); g.moveTo(bx, by + 2); g.lineTo(bx, by - 18); g.stroke();
    const gr = g.createLinearGradient(bx - 15, 0, bx + 15, 0);
    gr.addColorStop(0, '#5a4c66'); gr.addColorStop(1, '#1b1420');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(bx - 15, by - 26); g.quadraticCurveTo(bx, by - 8, bx + 15, by - 26); g.closePath(); g.fill();
    g.fillStyle = '#2d2335';
    g.beginPath(); g.ellipse(bx, by - 26, 15, 4.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#ff3d00';
    g.beginPath(); g.ellipse(bx, by - 26, 11, 3, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffb347';
    g.beginPath(); g.ellipse(bx - 2, by - 26.5, 5, 1.4, 0, 0, TAU); g.fill();
    return { c, ax: bx, ay: by, fy: by - 28 };
  }

  function sprFlame(c1, c2) {
    const W = 40, H = 60, c = mk(W, H), g = c.getContext('2d');
    const gr = g.createRadialGradient(20, 42, 0, 20, 38, 26);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, c2); gr.addColorStop(0.7, c1); gr.addColorStop(1, U.rgba(c1, 0));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(20, 2);
    g.bezierCurveTo(30, 18, 36, 34, 20, 56);
    g.bezierCurveTo(4, 34, 10, 18, 20, 2);
    g.fill();
    return c;
  }

  function sprSpikes(rng) {
    const W = 64, H = 54, c = mk(W, H), g = c.getContext('2d');
    const n = 4 + floor(rng() * 4), list = [];
    for (let i = 0; i < n; i++) list.push({ x: 32 + (rng() - 0.5) * 36, y: 40 + (rng() - 0.5) * 12, h: 18 + rng() * 18, w: 4 + rng() * 3 });
    list.sort((a, b) => a.y - b.y);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath(); g.ellipse(34, 44, 26, 8, 0, 0, TAU); g.fill();
    for (const s of list) {
      g.fillStyle = '#2a2230'; poly(g, [s.x - s.w, s.y, s.x, s.y - s.h, s.x + s.w, s.y]); g.fill();
      g.fillStyle = '#5a4a66'; poly(g, [s.x - s.w, s.y, s.x, s.y - s.h, s.x - s.w * 0.1, s.y]); g.fill();
      g.fillStyle = 'rgba(255,61,110,0.7)';
      g.beginPath(); g.arc(s.x, s.y - s.h + 2, 1, 0, TAU); g.fill();
    }
    return c;
  }

  /* ================================================================ decor generation */
  function mkItem(k, x, y, spr, ax, ay) {
    return {
      k, x, y, spr, ax, ay,
      bx0: -ax, by0: -ay, bx1: spr ? spr.width - ax : 0, by1: spr ? spr.height - ay : 0,
      rad: 0, seed: 0, gc: null, gr: 0, ga: 0, gx: 0, gy: 0, sp: 1, em: 0, R: 0, rot: 0, alt: null, f: 0,
    };
  }
  function centered(k, x, y, spr) { return mkItem(k, x, y, spr, spr.width / 2, spr.height / 2); }

  function buildDecor(bi, A) {
    const b = biomes[bi], pal = b.palette, rng = mulberry(4242 + bi * 1009);
    const R = ARENA_R - 50;
    const placed = [];
    const SPOT = { x: 0, y: 0 };
    const free = (x, y, rad) => {
      for (let i = 0; i < placed.length; i++) {
        const q = placed[i], dx = q.x - x, dy = q.y - y, m = q.rad + rad;
        if (dx * dx + dy * dy < m * m) return false;
      }
      if (A.rivers.length) {
        for (const rv of A.rivers) {
          for (let i = 0; i < rv.pts.length; i += 2) {
            const dx = rv.pts[i] - x, dy = rv.pts[i + 1] - y, m = rv.w + rad + 30;
            if (dx * dx + dy * dy < m * m) return false;
          }
        }
      }
      return true;
    };
    const spot = (minR, maxR, rad) => {
      for (let k = 0; k < 40; k++) {
        const a = rng() * TAU, r = sqrt(minR * minR + rng() * (maxR * maxR - minR * minR));
        const x = cos(a) * r, y = sin(a) * r;
        if (free(x, y, rad)) { SPOT.x = x; SPOT.y = y; return SPOT; }
      }
      return null;
    };
    const solid = (it, rad) => { it.rad = rad; placed.push(it); return it; };
    const up = (it) => { A.items.push(it); return it; };
    const flat = (it) => { A.flat.push(it); return it; };
    const pick = (arr) => arr[floor(rng() * arr.length)];

    // boundary glyphs
    const GN = 72;
    for (let i = 0; i < GN; i++) {
      const a = (i / GN) * TAU;
      A.glyphs.push({ a, x: cos(a) * (ARENA_R + 16), y: sin(a) * (ARENA_R + 16), v: i % 8 });
    }
    for (let k = 0; k < 8; k++) A.glyphSprites.push(sprGlyph(pal.accent, 1000 + bi * 50 + k));
    A.beam = sprBeam(pal.light);
    A.flame = sprFlame(bi === 3 ? '#b000ff' : '#ff5a1a', bi === 3 ? '#ff80ff' : '#ffd180');

    const addBeams = (n, ang) => {
      for (let i = 0; i < n; i++) {
        const a = rng() * TAU, r = sqrt(rng()) * R;
        const it = mkItem('beam', cos(a) * r, sin(a) * r, null, 0, 0);
        it.R = 380 + rng() * 260; it.f = 60 + rng() * 70; it.rot = ang + (rng() - 0.5) * 0.12; it.seed = rng();
        it.bx0 = -it.R; it.by0 = -it.R; it.bx1 = it.R; it.by1 = it.R;
        A.fg.push(it);
      }
    };

    if (b.id === 'cave') {
      const seal = solid(flat(centered('seal', 0, 0, sprCircle(230, pal.accent, 77, 8))), 250);
      seal.sp = 0.05; seal.gc = pal.accent; seal.gr = 320; seal.ga = 0.1;
      const cryCols = [pal.accent, pal.accent, '#9a7dff', '#64ffda', '#ff7ae0', '#7ab8ff'];
      const crys = cryCols.map((col) => ({ spr: sprCrystal(rng, col, '#2a2548', 1), col }));
      const crysBig = [pal.accent, '#9a7dff'].map((col) => ({ spr: sprCrystal(rng, col, '#2a2548', 1.5), col }));
      for (let i = 0; i < 8; i++) {
        const s = spot(420, R, 70); if (!s) continue;
        const v = crysBig[i % 2];
        const it = solid(up(mkItem('crystal', s.x, s.y, v.spr, v.spr.width / 2, v.spr.height - 36)), 70);
        it.gc = v.col; it.gr = 150; it.ga = 0.45; it.gy = -56; it.sp = 1 + rng(); it.seed = rng(); it.em = 1;
      }
      for (let i = 0; i < 60; i++) {
        const s = spot(270, R, 44); if (!s) continue;
        const v = pick(crys);
        const it = solid(up(mkItem('crystal', s.x, s.y, v.spr, 60, 116)), 44);
        it.gc = v.col; it.gr = 90; it.ga = 0.4; it.gy = -38; it.sp = 1.3 + rng(); it.seed = rng(); it.em = 1;
      }
      const stal = [0, 1, 2, 3].map(() => sprStalag(rng));
      for (let i = 0; i < 46; i++) {
        const s = spot(260, R, 30); if (!s) continue;
        const v = pick(stal);
        solid(up(mkItem('stalag', s.x, s.y, v.c, v.ax, v.ay)), 30);
      }
      const pud = [sprPuddle(rng, pal, 60, 30), sprPuddle(rng, pal, 44, 22), sprPuddle(rng, pal, 80, 38)];
      for (let i = 0; i < 22; i++) {
        const s = spot(260, R, 70); if (!s) continue;
        const v = pick(pud);
        const it = solid(flat(centered('puddle', s.x, s.y, v)), v.width * 0.42);
        it.R = v.width / 2 - 8; it.f = v.height / 2 - 8; it.seed = rng();
      }
      const shr = [sprShroom(rng, '#3de8ff', true), sprShroom(rng, '#b388ff', true), sprShroom(rng, '#64ffda', true)];
      const shrCol = ['#3de8ff', '#b388ff', '#64ffda'];
      for (let i = 0; i < 34; i++) {
        const s = spot(240, R, 22); if (!s) continue;
        const k = floor(rng() * 3);
        const it = solid(up(mkItem('shroom', s.x, s.y, shr[k], 27, 40)), 22);
        it.gc = shrCol[k]; it.gr = 34; it.ga = 0.35; it.gy = -12; it.sp = 2 + rng() * 2; it.seed = rng(); it.em = 4;
      }
      const rub = [0, 1, 2, 3].map(() => sprRocks(rng, '#2c2752', 3 + floor(rng() * 4), 26));
      for (let i = 0; i < 80; i++) {
        const s = spot(200, R, 16); if (!s) continue;
        up(centered('rock', s.x, s.y, pick(rub)));
      }
      addBeams(qi() ? 9 : 4, -0.5);
    } else if (b.id === 'forest') {
      const ringShr = sprShroom(rng, '#64ffda', true, '#d8fff4');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU;
        const it = solid(up(mkItem('shroom', cos(a) * 175, sin(a) * 175, ringShr, 27, 40)), 18);
        it.gc = '#64ffda'; it.gr = 40; it.ga = 0.45; it.gy = -12; it.sp = 2.4; it.seed = i / 14; it.em = 4;
      }
      const trunks = [0, 1, 2].map(() => sprTrunk(rng));
      const canR = [88, 104, 120, 96, 112];
      const cans = canR.map((r, i) => ({ c: sprCanopy(rng, CANOPY[i % 4], r, i === 4), r }));
      for (let i = 0; i < 72; i++) {
        const s = spot(300, R + 40, 78); if (!s) continue;
        const tv = pick(trunks);
        const cv = rng() < 0.08 ? cans[3] : rng() < 0.12 ? cans[4] : cans[floor(rng() * 3)];
        const sh = flat(mkItem('shade', s.x + 26, s.y + 6, null, 0, 0));
        sh.R = cv.r * 1.05; sh.bx0 = -sh.R; sh.by0 = -sh.R; sh.bx1 = sh.R; sh.by1 = sh.R;
        solid(up(mkItem('trunk', s.x, s.y, tv.c, tv.ax, tv.ay)), 78);
        const cn = mkItem('canopy', s.x, s.y - 64, cv.c, cv.c.width / 2, cv.c.height / 2);
        cn.R = cv.r; cn.seed = rng(); cn.f = 1;
        A.fg.push(cn);
      }
      const bould = [sprBoulder(rng), sprBoulder(rng), sprBoulder(rng)];
      for (let i = 0; i < 26; i++) {
        const s = spot(240, R, 34); if (!s) continue;
        solid(up(mkItem('boulder', s.x, s.y, pick(bould), 42, 46)), 34);
      }
      const FLC = ['#ffffff', '#ff9ad5', '#b388ff', '#ffd54f', '#80d8ff'];
      const fl = FLC.map((c) => sprFlowers(rng, c));
      for (let i = 0; i < 130; i++) {
        const s = spot(150, R, 10); if (!s) continue;
        const k = floor(rng() * FLC.length);
        const it = up(centered('flowers', s.x, s.y, fl[k]));
        if (k === 4 || k === 2) { it.gc = FLC[k]; it.gr = 26; it.ga = 0.22; it.sp = 1.5 + rng(); it.seed = rng(); }
      }
      const msh = [sprShroom(rng, '#e53935', false), sprShroom(rng, '#ff7043', false), sprShroom(rng, '#4fc3ff', true)];
      for (let i = 0; i < 40; i++) {
        const s = spot(220, R, 16); if (!s) continue;
        const k = floor(rng() * 3);
        const it = solid(up(mkItem('shroom', s.x, s.y, msh[k], 27, 40)), 16);
        if (k === 2) { it.gc = '#4fc3ff'; it.gr = 30; it.ga = 0.35; it.gy = -12; it.sp = 2; it.seed = rng(); it.em = 4; }
      }
      const gr = [0, 1, 2, 3].map(() => sprGrass(rng));
      for (let i = 0; i < 260; i++) {
        const a = rng() * TAU, r = sqrt(rng()) * R;
        const v = pick(gr);
        const it = up(mkItem('grass', cos(a) * r, sin(a) * r, v.c, v.ax, v.ay));
        it.seed = rng();
      }
      addBeams(qi() ? 14 : 6, -0.45);
    } else if (b.id === 'volcano') {
      for (let r = 0; r < 3; r++) {
        const pts = [];
        const a0 = (r / 3) * TAU + rng() * 0.8;
        let x = cos(a0) * (ARENA_R + 160), y = sin(a0) * (ARENA_R + 160);
        let h = a0 + PI + (rng() - 0.5) * 0.9;
        const w = 22 + rng() * 16;
        for (let s = 0; s < 80; s++) {
          pts.push(x, y);
          h += (rng() - 0.5) * 0.5;
          const d = hypot(x, y);
          if (d < 460) h = U.lerpAngle(h, atan2(y, x), 0.35);
          x += cos(h) * 55; y += sin(h) * 55;
          if (s > 8 && hypot(x, y) > ARENA_R + 160) { pts.push(x, y); break; }
        }
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
          x0 = min(x0, pts[i]); x1 = max(x1, pts[i]); y0 = min(y0, pts[i + 1]); y1 = max(y1, pts[i + 1]);
        }
        const m = w * 2.6;
        A.rivers.push({ pts, w, x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m, seed: rng() });
      }
      const center = flat(centered('seal', 0, 0, sprCircle(170, '#ff6a1a', 91, 7)));
      center.sp = -0.04; center.gc = '#ff6a1a'; center.gr = 220; center.ga = 0.08;
      solid(center, 190);
      const pools = [sprLava(rng, 70, 40), sprLava(rng, 50, 30), sprLava(rng, 95, 52), sprLava(rng, 40, 26)];
      for (let i = 0; i < 20; i++) {
        const s = spot(320, R, 80); if (!s) continue;
        const v = pick(pools);
        const it = solid(flat(centered('lava', s.x, s.y, v)), v.width * 0.42);
        it.R = v.width / 2 - 17; it.f = v.height / 2 - 17; it.gc = '#ff6a1a'; it.gr = v.width * 0.95; it.ga = 0.35;
        it.sp = 1.2 + rng(); it.seed = rng(); it.em = 2;
      }
      const obs = [0, 1, 2].map(() => sprCrystal(rng, '#2a1f3d', '#1a1210', 0.8));
      for (let i = 0; i < 34; i++) {
        const s = spot(240, R, 34); if (!s) continue;
        const v = pick(obs);
        solid(up(mkItem('obsidian', s.x, s.y, v, v.width / 2, v.height - 19)), 34);
      }
      const vents = [sprVent(rng), sprVent(rng)];
      for (let i = 0; i < 16; i++) {
        const s = spot(260, R, 40); if (!s) continue;
        const v = pick(vents);
        const it = solid(flat(centered('vent', s.x, s.y, v)), 40);
        it.gc = '#ff6a1a'; it.gr = 46; it.ga = 0.5; it.gy = 0; it.sp = 3; it.seed = rng(); it.em = 2;
        const sm = mkItem('smoke', s.x, s.y, null, 0, 0);
        sm.seed = rng(); sm.bx0 = -90; sm.bx1 = 90; sm.by0 = -220; sm.by1 = 30;
        A.fg.push(sm);
      }
      const bas = [sprBasalt(rng), sprBasalt(rng), sprBasalt(rng)];
      for (let i = 0; i < 20; i++) {
        const s = spot(260, R, 52); if (!s) continue;
        solid(up(mkItem('basalt', s.x, s.y, pick(bas), 60, 70)), 52);
      }
      const rub = [0, 1, 2, 3].map(() => sprRocks(rng, '#2a1d18', 3 + floor(rng() * 4), 24));
      for (let i = 0; i < 60; i++) {
        const s = spot(200, R, 16); if (!s) continue;
        up(centered('rock', s.x, s.y, pick(rub)));
      }
    } else {
      const grand = solid(flat(centered('seal', 0, 0, sprCircle(250, pal.accent, 666, 9))), 260);
      grand.sp = 0.035; grand.gc = '#ff3d6e'; grand.gr = 340; grand.ga = 0.1;
      const base = sprPillarBase();
      const shafts = [sprPillarShaft(rng, false, pal), sprPillarShaft(rng, false, pal), sprPillarShaft(rng, true, pal), sprPillarShaft(rng, true, pal)];
      const pillars = [];
      const addPillar = (x, y, broken) => {
        solid(up(mkItem('pbase', x, y, base.c, base.ax, base.ay)), 40);
        const sv = broken ? shafts[2 + floor(rng() * 2)] : shafts[floor(rng() * 2)];
        const it = mkItem('shaft', x, y - 6, sv.c, sv.ax, sv.ay);
        it.f = sv.runeY; it.R = sv.top; it.seed = rng(); it.gc = pal.light;
        A.fg.push(it);
        if (!broken) pillars.push({ x, y: y - 6, top: sv.top });
      };
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + PI / 8;
        addPillar(cos(a) * 340, sin(a) * 340, false);
      }
      for (let i = 0; i < 26; i++) {
        const s = spot(420, R - 20, 60); if (!s) continue;
        addPillar(s.x, s.y, rng() < 0.3);
      }
      const addChain = (p, q) => {
        const x1 = p.x, y1 = p.y - p.top + 30, x2 = q.x, y2 = q.y - q.top + 30;
        const len = hypot(x2 - x1, y2 - y1);
        A.chains.push({
          x1, y1, x2, y2, sag: 26 + len * 0.18, n: max(8, floor(len / 9)), seed: rng(),
          x0: min(x1, x2) - 20, y0: min(y1, y2) - 20, xm: max(x1, x2) + 20, ym: max(y1, y2) + 40 + len * 0.2,
        });
      };
      for (let i = 0; i < 8; i += 2) addChain(pillars[i], pillars[i + 1]);
      let chains = 0;
      for (let i = 8; i < pillars.length && chains < 9; i++) {
        let best = null, bd = 290 * 290;
        for (let j = 8; j < pillars.length; j++) {
          if (j === i) continue;
          const d = U.dist2(pillars[i].x, pillars[i].y, pillars[j].x, pillars[j].y);
          if (d < bd && d > 90 * 90) { bd = d; best = pillars[j]; }
        }
        if (best && !pillars[i].chained && !best.chained) { addChain(pillars[i], best); pillars[i].chained = best.chained = true; chains++; }
      }
      const rc = [sprCircle(90, '#ff3d6e', 11, 7), sprCircle(110, pal.accent, 23, 8), sprCircle(75, '#ff3d6e', 37, 9)];
      for (let i = 0; i < 12; i++) {
        const s = spot(420, R, 110); if (!s) continue;
        const v = pick(rc);
        const it = solid(flat(centered('seal', s.x, s.y, v)), v.width * 0.45);
        it.sp = (rng() < 0.5 ? -1 : 1) * (0.08 + rng() * 0.1); it.gc = '#ff3d6e'; it.gr = v.width * 0.7; it.ga = 0.14; it.seed = rng();
      }
      const bl = [sprBlood(rng, 46, 26), sprBlood(rng, 30, 18), sprBlood(rng, 60, 30)];
      for (let i = 0; i < 22; i++) {
        const s = spot(260, R, 50); if (!s) continue;
        const v = pick(bl);
        const it = solid(flat(centered('blood', s.x, s.y, v)), v.width * 0.4);
        it.seed = rng();
      }
      const br = sprBrazier();
      for (let i = 0; i < 20; i++) {
        const s = spot(300, R, 30); if (!s) continue;
        const it = solid(up(mkItem('brazier', s.x, s.y, br.c, br.ax, br.ay)), 30);
        it.f = br.ay - br.fy; it.gc = '#c86bff'; it.gr = 70; it.ga = 0.5; it.gy = -it.f; it.sp = 6; it.seed = rng(); it.em = 3;
      }
      const sp = [sprSpikes(rng), sprSpikes(rng), sprSpikes(rng)];
      for (let i = 0; i < 26; i++) {
        const s = spot(260, R, 28); if (!s) continue;
        solid(up(mkItem('spikes', s.x, s.y, pick(sp), 32, 44)), 28);
      }
      const rub = [0, 1, 2, 3].map(() => sprRocks(rng, '#2b1f33', 3 + floor(rng() * 4), 24));
      for (let i = 0; i < 50; i++) {
        const s = spot(200, R, 16); if (!s) continue;
        up(centered('rock', s.x, s.y, pick(rub)));
      }
      addBeams(qi() ? 6 : 3, -0.5);
    }
    A.items.sort((p, q) => p.y - q.y);
    A.fg.sort((p, q) => p.y - q.y);
  }

  /* ================================================================ biome assets */
  const assets = [null, null, null, null];
  function ensureAssets(bi) {
    bi = clampN(bi | 0, 0, 3);
    if (!assets[bi]) {
      const A = {
        tex: null, pattern: null, patCtx: null,
        flat: [], items: [], fg: [], rivers: [], chains: [], glyphs: [], glyphSprites: [],
        beam: null, flame: null, vis: [], fvis: [],
      };
      A.tex = buildTexture(bi);
      buildDecor(bi, A);
      assets[bi] = A;
    }
    return assets[bi];
  }

  /* ================================================================ pickup sprites */
  const XP_COLORS = ['#4fc3ff', '#69f0ae', '#ff5252'];
  const RAINBOW = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#7c4dff', '#ff4081'];
  const XP_SIZE = [6, 7.5, 9, 11];
  const PK = { built: false, xp: [], rainbow: [], star: null, heart: null, magi: null, chestBody: null, chestLid: null, soulOut: null, soulIn: null, shadow: null, orb: new Map(), icon: new Map() };

  function sprXp(col, size) {
    const hw = size * 0.8, hh = size * 1.25;
    const W = Math.ceil(hw * 2 + 6), H = Math.ceil(hh * 2 + 6), c = mk(W, H), g = c.getContext('2d');
    const cx = W / 2, cy = H / 2;
    const tx = cx, ty = cy - hh, rx = cx + hw, ry = cy - hh * 0.1, bx = cx, by = cy + hh, lx = cx - hw, ly = cy - hh * 0.1;
    const mx = cx - hw * 0.15, my = cy - hh * 0.15;
    g.fillStyle = shade(col, 0.6); poly(g, [tx, ty, lx, ly, mx, my]); g.fill();
    g.fillStyle = shade(col, 0.2); poly(g, [tx, ty, rx, ry, mx, my]); g.fill();
    g.fillStyle = col; poly(g, [lx, ly, bx, by, mx, my]); g.fill();
    g.fillStyle = shade(col, -0.4); poly(g, [rx, ry, bx, by, mx, my]); g.fill();
    g.strokeStyle = U.rgba(shade(col, 0.75), 0.9); g.lineWidth = 1;
    poly(g, [tx, ty, rx, ry, bx, by, lx, ly]); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(tx - 0.5, ty + 2); g.lineTo(mx - 1, my); g.stroke();
    return c;
  }
  function ensurePK() {
    if (PK.built) return;
    PK.built = true;
    for (let i = 0; i < 3; i++) PK.xp.push(sprXp(XP_COLORS[i], XP_SIZE[i]));
    for (let i = 0; i < RAINBOW.length; i++) PK.rainbow.push(sprXp(RAINBOW[i], XP_SIZE[3]));
    // star
    let c = mk(32, 32), g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - PI / 2, r = i % 2 ? 2.6 : 15;
      if (i === 0) g.moveTo(16 + cos(a) * r, 16 + sin(a) * r); else g.lineTo(16 + cos(a) * r, 16 + sin(a) * r);
    }
    g.closePath(); g.fill();
    PK.star = c;
    // heart
    c = mk(40, 38); g = c.getContext('2d');
    g.translate(20, 20);
    const heartPath = () => {
      g.beginPath();
      g.moveTo(0, 14);
      g.bezierCurveTo(-20, 0, -13, -18, 0, -8);
      g.bezierCurveTo(13, -18, 20, 0, 0, 14);
      g.closePath();
    };
    let gr = g.createRadialGradient(-5, -6, 1, 0, 0, 18);
    gr.addColorStop(0, '#ffb3c1'); gr.addColorStop(0.4, '#ff1f4f'); gr.addColorStop(1, '#9a0026');
    g.fillStyle = gr; heartPath(); g.fill();
    g.strokeStyle = '#5c0018'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(-6, -6, 3.5, 2.2, -0.6, 0, TAU); g.fill();
    PK.heart = c;
    // magicule crystal
    c = mk(30, 40); g = c.getContext('2d');
    g.translate(15, 20);
    g.fillStyle = '#9fc4ff'; poly(g, [0, -16, -9, -7, -9, 7, 0, 16]); g.fill();
    g.fillStyle = '#2962ff'; poly(g, [0, -16, 9, -7, 9, 7, 0, 16]); g.fill();
    g.fillStyle = '#d6e6ff'; poly(g, [0, -16, 9, -7, 0, -3, -9, -7]); g.fill();
    g.fillStyle = 'rgba(10,30,120,0.45)'; poly(g, [0, 16, 9, 7, 0, 4, -9, 7]); g.fill();
    g.strokeStyle = 'rgba(227,242,253,0.85)'; g.lineWidth = 1;
    poly(g, [0, -16, 9, -7, 9, 7, 0, 16, -9, 7, -9, -7]); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-5, -7); g.lineTo(-5, 6); g.stroke();
    PK.magi = c;
    // chest body
    c = mk(48, 34); g = c.getContext('2d');
    gr = g.createLinearGradient(0, 4, 0, 32);
    gr.addColorStop(0, '#a0682f'); gr.addColorStop(1, '#4e2f14');
    g.fillStyle = gr; g.fillRect(3, 4, 42, 26);
    g.fillStyle = '#2d1a0a'; g.fillRect(3, 28, 42, 3);
    g.fillStyle = '#ffca28'; g.fillRect(8, 4, 5, 27); g.fillRect(35, 4, 5, 27); g.fillRect(3, 4, 42, 3);
    g.fillStyle = '#fff3b0'; g.fillRect(8, 4, 1.5, 27); g.fillRect(35, 4, 1.5, 27);
    g.fillStyle = '#ffd54f'; g.fillRect(19, 6, 10, 12);
    g.fillStyle = '#b8860b'; g.fillRect(19, 16, 10, 2);
    g.fillStyle = '#2d1a0a'; g.beginPath(); g.arc(24, 10.5, 1.8, 0, TAU); g.fill(); g.fillRect(23.3, 11, 1.4, 4);
    PK.chestBody = c;
    // chest lid
    c = mk(48, 22); g = c.getContext('2d');
    gr = g.createLinearGradient(0, 0, 0, 20);
    gr.addColorStop(0, '#c4884a'); gr.addColorStop(1, '#7a4a1e');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(3, 20); g.lineTo(3, 10); g.quadraticCurveTo(24, -4, 45, 10); g.lineTo(45, 20); g.closePath(); g.fill();
    g.fillStyle = '#ffca28'; g.fillRect(3, 17, 42, 3);
    g.fillRect(8, 6, 5, 12); g.fillRect(35, 6, 5, 12);
    g.strokeStyle = '#ffe082'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(3, 10); g.quadraticCurveTo(24, -4, 45, 10); g.stroke();
    PK.chestLid = c;
    // soul flame (outer + inner)
    PK.soulOut = sprFlame('#7b1fa2', '#e040fb');
    PK.soulIn = sprFlame('#ce93d8', '#ffffff');
    // shadow
    c = mk(32, 32); g = c.getContext('2d');
    gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    PK.shadow = c;
  }
  function orbSpr(col) {
    let c = PK.orb.get(col);
    if (c) return c;
    c = mk(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(28, 26, 0, 32, 32, 30);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, U.rgba(shade(col, 0.45), 0.95));
    gr.addColorStop(0.7, U.rgba(col, 0.85)); gr.addColorStop(1, U.rgba(col, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill();
    g.strokeStyle = U.rgba(shade(col, 0.6), 0.55); g.lineWidth = 1.5;
    g.beginPath(); g.arc(32, 32, 21, 0, TAU); g.stroke();
    PK.orb.set(col, c);
    return c;
  }
  function skillDef(id) { const S = SK.Skills; return (S && S.defs && S.defs[id]) || null; }
  function skillColor(id) { const d = skillDef(id); return (d && d.color) || '#b388ff'; }
  function iconSpr(id) {
    if (PK.icon.has(id)) return PK.icon.get(id);
    const d = skillDef(id);
    if (!d) return null; // skills module not ready yet; retry later
    let c = null;
    if (typeof d.drawIcon === 'function') {
      c = mk(64, 64);
      try { d.drawIcon(c.getContext('2d'), 32, 32, 50, 0); } catch (e) { c = null; }
    }
    PK.icon.set(id, c);
    return c;
  }

  /* ================================================================ director state */
  const D = {
    bi: -1, G: null, extClock: false, seenT: -1,
    spawnAcc: 0, eliteT: 0, hordeT: 0, hordeWarnT: -1, wanderT: 0, firstWave: false,
    warned: false, bossSpawned: false, bossRef: null, bossDead: false, bossDeadT: 0, bossX: 0, bossY: 0,
    musicBack: false, oracleT: -1, oracleText: '', hpMul: 1, dmgMul: 1,
    emT: 0, edgeT: 0, edgeFxT: 0, xpChainT: 0, xpPitch: 1, mergeT: 0, sparkleT: 0, alive: 0,
  };
  let portal = null;
  let hintedWanderer = false;
  const SP = { x: 0, y: 0 };
  const SO = { elite: false, passive: false, nameable: undefined, hpMul: 1, dmgMul: 1 };
  const pool = [];
  const PVIS = [];
  const mergeMap = new Map();

  function resetDirector(G, bi) {
    D.bi = bi; D.G = G;
    D.seenT = G ? +G.biomeT || 0 : 0;
    D.spawnAcc = 0; D.eliteT = 0; D.hordeT = 0; D.hordeWarnT = -1; D.wanderT = 6; D.firstWave = false;
    D.warned = false; D.bossSpawned = false; D.bossRef = null; D.bossDead = false; D.bossDeadT = 0;
    D.musicBack = false; D.oracleT = -1; D.oracleText = ''; D.emT = 0; D.edgeT = 0; D.mergeT = 0;
    portal = null;
    if (G) G.portal = null;
  }

  /* ================================================================ arena clamp */
  function clamp(ent) {
    if (!ent) return false;
    const r = ent.r || 0;
    const R = ARENA_R - r;
    const x = ent.x, y = ent.y, d2 = x * x + y * y;
    if (d2 <= R * R) return false;
    const d = sqrt(d2) || 1, k = R / d;
    ent.x = x * k; ent.y = y * k;
    const nx = ent.x / R, ny = ent.y / R;
    const vn = (ent.vx || 0) * nx + (ent.vy || 0) * ny;
    if (vn > 0 && typeof ent.vx === 'number') { ent.vx -= vn * nx; ent.vy -= vn * ny; }
    return true;
  }
  function clampAll(G, dt) {
    const P = G.player;
    if (P && !P.dead && clamp(P)) {
      D.edgeT = 0.35;
      D.edgeFxT -= dt;
      const F = FX();
      if (D.edgeFxT <= 0 && F) {
        D.edgeFxT = 0.22;
        const a = atan2(P.y, P.x), ex = cos(a) * ARENA_R, ey = sin(a) * ARENA_R;
        const pal = biomes[D.bi < 0 ? 0 : D.bi].palette;
        F.burst(ex, ey, { count: 5, colors: [pal.accent, pal.light], speed: [30, 110], life: [0.25, 0.5], size: [1.5, 3], glow: true, angle: a + PI, spread: 1.6 });
      }
    } else if (D.edgeT > 0) D.edgeT -= dt;
    const E = G.enemies;
    if (E) {
      for (let i = 0; i < E.length; i++) {
        const m = E[i];
        if (!m || m.dead) continue;
        if (m.boss && m.ai && m.ai.enter > 0) continue;
        clamp(m);
      }
    }
    const A = G.allies;
    if (A) for (let i = 0; i < A.length; i++) { const m = A[i]; if (m && !m.dead) clamp(m); }
  }

  /* ================================================================ spawning */
  function spawnPoint(G, margin) {
    const v = SK.cam.view;
    const m = margin || 70;
    const R = ARENA_R - 40;
    const x0 = v.x0 - m, x1 = v.x1 + m, y0 = v.y0 - m, y1 = v.y1 + m;
    const w = x1 - x0, h = y1 - y0;
    for (let tries = 0; tries < 12; tries++) {
      let s = random() * (2 * w + 2 * h), x, y;
      if (s < w) { x = x0 + s; y = y0; }
      else if ((s -= w) < h) { x = x1; y = y0 + s; }
      else if ((s -= h) < w) { x = x1 - s; y = y1; }
      else { s -= w; x = x0; y = y1 - s; }
      if (x * x + y * y < R * R) { SP.x = x; SP.y = y; return SP; }
    }
    const P = G.player;
    const px = P ? P.x : SK.cam.x, py = P ? P.y : SK.cam.y;
    const a = atan2(-py, -px) + rand(-1.1, 1.1);
    let x = px + cos(a) * 440, y = py + sin(a) * 440;
    const d = hypot(x, y);
    if (d > R) { x *= R / d; y *= R / d; }
    SP.x = x; SP.y = y;
    return SP;
  }

  function spawnEnemy(G, type, x, y, elite, passive, hpMul, dmgMul) {
    const E = SK.Enemies;
    if (!E || !E.spawn || !enemyTypes()[type]) return null;
    SO.elite = !!elite; SO.passive = !!passive; SO.nameable = passive ? true : undefined;
    SO.hpMul = hpMul || 1; SO.dmgMul = dmgMul || 1;
    const m = E.spawn(G, type, x, y, SO);
    if (m) clamp(m);
    return m;
  }

  function pickEntry(b, T, noSwarm) {
    const tbl = b.enemies, types = enemyTypes();
    let total = 0;
    for (let i = 0; i < tbl.length; i++) {
      const e = tbl[i], def = types[e.type];
      if (!def || T < e.from) continue;
      if (noSwarm && def.behavior === 'swarm') continue;
      total += e.weight * min(1, 0.35 + (T - e.from) / 25);
    }
    if (total <= 0) return null;
    let r = random() * total;
    for (let i = 0; i < tbl.length; i++) {
      const e = tbl[i], def = types[e.type];
      if (!def || T < e.from) continue;
      if (noSwarm && def.behavior === 'swarm') continue;
      r -= e.weight * min(1, 0.35 + (T - e.from) / 25);
      if (r <= 0) return e;
    }
    return null;
  }

  function spawnGroup(G, b, T, maxPack) {
    const e = pickEntry(b, T, false);
    if (!e) return 0;
    let n = U.randi(e.pack[0], e.pack[1]);
    if (T > b.duration * 0.55 && random() < 0.4) n++;
    if (maxPack) n = min(n, maxPack);
    const sp = spawnPoint(G, 70);
    const cx = sp.x, cy = sp.y;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const m = spawnEnemy(G, e.type, cx + rand(-46, 46), cy + rand(-46, 46), false, false, D.hpMul, D.dmgMul);
      if (m) made++;
    }
    return made;
  }

  function spawnHorde(G, b, bi, T, room) {
    const P = G.player;
    if (!P) return;
    const prog = clampN(T / b.duration, 0, 1);
    let cnt = floor((14 + bi * 3 + prog * 10) * (G.nightmare ? 1.3 : 1) * (qi() === 0 ? 0.75 : 1));
    cnt = min(cnt, max(6, room));
    const types = enemyTypes();
    const list = [];
    for (let i = 0; i < b.horde.length; i++) {
      const id = b.horde[i];
      const e = b.enemies.find((q) => q.type === id);
      if (types[id] && (!e || T >= e.from)) list.push(id);
    }
    if (!list.length) return;
    const R = 400 + random() * 40, a0 = random() * TAU;
    for (let i = 0; i < cnt; i++) {
      const a = a0 + (i / cnt) * TAU;
      spawnEnemy(G, list[i % list.length], P.x + cos(a) * R, P.y + sin(a) * R, false, false, D.hpMul * 0.85, D.dmgMul);
    }
    const F = FX();
    if (F) {
      F.ring(P.x, P.y, { radius: R, color: '#ff5252', life: 0.7, width: 5, start: 1.25 });
      F.ring(P.x, P.y, { radius: R * 0.8, color: b.palette.accent, life: 0.6, width: 3, delay: 0.1, start: 1.3 });
    }
    if (SK.cam.shake) SK.cam.shake(6, 0.4);
  }

  function director(G, b, bi, dt, T) {
    const E = SK.Enemies;
    if (!E || !E.spawn || !G.enemies) return;
    const P = G.player;
    const nm = G.nightmare ? 1.6 : 1;
    const prog = clampN(T / b.duration, 0, 1);
    D.hpMul = (1 + prog * 0.6) * (1 + bi * 0.06) * nm;
    D.dmgMul = (1 + prog * 0.3) * nm;
    let alive = 0, passive = 0;
    const L = G.enemies;
    for (let i = 0; i < L.length; i++) {
      const m = L[i];
      if (!m || m.dead) continue;
      if (m.passive) passive++; else alive++;
    }
    D.alive = alive;
    const cap = [140, 190, 240][qi()];
    const F = FX();

    if (!D.bossSpawned) {
      if (T < 2.5) return;
      if (!D.firstWave) {
        D.firstWave = true;
        for (let i = 0; i < 2 + bi; i++) alive += spawnGroup(G, b, T, 3);
      }
      const pulse = 0.78 + 0.44 * (0.5 + 0.5 * sin((T * TAU) / 22 - PI / 2));
      const rate = (1.05 + bi * 0.3) * (1 + prog * 2.1) * pulse * nm;
      D.spawnAcc += rate * dt;
      let guard = 0;
      while (D.spawnAcc >= 1 && alive < cap && guard++ < 6) {
        const n = spawnGroup(G, b, T, 0);
        alive += n;
        D.spawnAcc -= max(1, n);
      }
      if (alive >= cap) D.spawnAcc = min(D.spawnAcc, 2);

      // elites
      D.eliteT += dt;
      const eliteEvery = G.nightmare ? 24 : 32;
      if (T > 20 && T < b.duration - 8 && D.eliteT >= eliteEvery) {
        D.eliteT = 0;
        const e = pickEntry(b, T, true) || pickEntry(b, T, false);
        if (e) {
          const sp = spawnPoint(G, 60);
          const m = spawnEnemy(G, e.type, sp.x, sp.y, true, false, D.hpMul, D.dmgMul);
          if (m) {
            toast('✦ Nemico Élite: ' + (m.def && m.def.name ? m.def.name : 'Sconosciuto') + ' ✦', '#ffd54f');
            sfx('warning', { vol: 0.45, pitch: 1.35 });
          }
        }
      }

      // horde
      D.hordeT += dt;
      if (T > 30 && T < b.duration - 15) {
        if (D.hordeWarnT < 0 && D.hordeT >= 43) {
          D.hordeWarnT = 2;
          toast("⚠ Un'orda ti sta circondando! ⚠", '#ff5252');
          sfx('warning', { vol: 0.8 });
          if (b.id === 'forest') sfx('howl', { vol: 0.6, pitch: 0.8 });
          if (F) F.vignette('#ff1744', 0.25, 1.6);
        }
      }
      if (D.hordeWarnT >= 0) {
        D.hordeWarnT -= dt;
        if (P && F && random() < dt * 8) {
          const a = random() * TAU;
          F.burst(P.x + cos(a) * 400, P.y + sin(a) * 400, { count: 3, color: '#ff5252', speed: [10, 50], life: [0.4, 0.8], size: [2, 4], glow: true });
        }
        if (D.hordeWarnT <= 0) {
          D.hordeWarnT = -1;
          D.hordeT = 0;
          spawnHorde(G, b, bi, T, cap + 40 - alive);
        }
      }

      // passive nameable wanderers
      D.wanderT += dt;
      const wInt = bi === 1 ? 11 : 16;
      if (T > 6 && D.wanderT >= wInt && passive < b.maxPassive) {
        D.wanderT = 0;
        const types = enemyTypes();
        const opts = b.wanderers.filter((id) => types[id] && types[id].nameable);
        if (opts.length) {
          const sp = spawnPoint(G, 40);
          const m = spawnEnemy(G, opts[floor(random() * opts.length)], sp.x, sp.y, false, true, 1, 1);
          if (m && !hintedWanderer) {
            hintedWanderer = true;
            oracle("《Rilevata una creatura non ostile nelle vicinanze. Avvicinati e conferiscile un Nome: diventerà tua alleata.》");
          }
        }
      }
    } else if (!D.bossDead) {
      D.spawnAcc += 0.35 * (1 + bi * 0.2) * nm * dt;
      if (D.spawnAcc >= 1 && alive < 26) {
        D.spawnAcc -= max(1, spawnGroup(G, b, T, 2));
      }
      if (D.spawnAcc > 3) D.spawnAcc = 3;
    }
  }

  function bossLogic(G, b, bi, dt, T) {
    const P = G.player;
    const F = FX();
    const types = enemyTypes();
    if (!D.warned && T >= b.duration - 5) {
      D.warned = true;
      const def = types[b.boss];
      banner('⚠ ATTENZIONE ⚠', def ? def.name : 'Un nemico leggendario', { color: '#ff5252', duration: 3.2 });
      sfx('warning');
      const A = SK.Audio;
      if (A && A.duck) A.duck(0.5, 3);
      if (F) { F.vignette('#ff1744', 0.35, 1.6); F.flash('#ff1744', 0.12, 0.4); }
      if (SK.cam.shake) SK.cam.shake(5, 0.8);
      if (b.bossLine) oracle(b.bossLine, { important: true });
      SK.vibrate && SK.vibrate([30, 60, 30]);
    }
    if (!D.bossSpawned && T >= b.duration) {
      D.bossSpawned = true;
      const E = SK.Enemies;
      let m = null;
      if (E && E.spawnBoss && types[b.boss]) m = E.spawnBoss(G, b.boss);
      D.bossRef = m || G.boss || null;
      sfx('bossRoar');
      music(bi === 3 ? 'finalboss' : 'boss');
      if (SK.cam.shake) SK.cam.shake(12, 0.9);
      if (F) F.flash('#000000', 0.35, 0.5);
      if (!D.bossRef) {
        D.bossDead = true; D.bossDeadT = 0;
        D.bossX = P ? P.x + 150 : 150; D.bossY = P ? P.y : 0;
      }
    }
    if (D.bossSpawned && !D.bossDead) {
      const m = D.bossRef;
      if (!m || m.dead || m.hp <= 0) {
        D.bossDead = true; D.bossDeadT = 0;
        D.bossX = m ? m.x : P ? P.x + 150 : 0;
        D.bossY = m ? m.y : P ? P.y : 0;
      }
    }
    if (D.bossDead && !portal) {
      D.bossDeadT += dt;
      if (!D.musicBack && D.bossDeadT > 1.6 && bi < 3) { D.musicBack = true; music(b.music); }
      if (D.bossDeadT > 2.4) spawnPortal(G, D.bossX, D.bossY);
    }
  }

  /* ================================================================ portal */
  function spawnPortal(G, x, y) {
    if (portal) return portal;
    G = G || SK.G;
    const bi = clampN((G && G.biome) | 0, 0, 3);
    const pal = biomes[bi].palette;
    let px = +x || 0, py = +y || 0;
    const R = ARENA_R - 160, d = hypot(px, py);
    if (d > R) { px *= R / d; py *= R / d; }
    portal = {
      x: px, y: py, r: 64, t: 0, entered: false, enterT: 0, fxT: 0.6,
      color: pal.accent, color2: pal.light, seed: random(), spr: sprCircle(96, pal.accent, 404 + bi, 8),
    };
    if (G) G.portal = portal;
    const F = FX();
    if (F) {
      F.lightRays(px, py, { color: pal.light, count: 12, radius: 300, life: 1.6 });
      F.ring(px, py, { radius: 180, color: pal.accent, life: 0.7, width: 8 });
      F.ring(px, py, { radius: 110, color: '#ffffff', life: 0.5, width: 4, delay: 0.12 });
      F.burst(px, py, { count: 30, colors: [pal.accent, pal.light, '#ffffff'], speed: [80, 300], life: [0.5, 1.1], size: [2, 5], glow: true, shape: 'spark' });
      F.flash(pal.light, 0.25, 0.4);
    }
    sfx('portal');
    if (SK.cam.shake) SK.cam.shake(6, 0.5);
    oracle('《Varco dimensionale stabilizzato. Entra nel portale per proseguire il viaggio.》');
    return portal;
  }

  function updatePortal(G, dt) {
    if (!portal) return;
    const P = G.player;
    portal.t += dt;
    const F = FX();
    portal.fxT -= dt;
    if (portal.fxT <= 0) {
      portal.fxT = qi() === 0 ? 0.6 : 0.3;
      if (F && F.converge && SK.cam.inView(portal.x, portal.y, 120)) {
        F.converge(portal.x, portal.y, { radius: 170, count: qi() ? 7 : 3, color: portal.color2, life: 0.7, size: 2.2 });
      }
    }
    if (portal.entered) { portal.enterT += dt; return; }
    if (!P || P.dead) return;
    const dx = portal.x - P.x, dy = portal.y - P.y, d = hypot(dx, dy);
    const pullR = portal.r * 2.6;
    if (portal.t > 1 && d < pullR && d > 1) {
      const k = (1 - d / pullR) * 110 * dt;
      P.x += (dx / d) * k;
      P.y += (dy / d) * k;
    }
    if (portal.t > 1.2 && d < portal.r * 0.55) {
      portal.entered = true;
      portal.enterT = 0;
      sfx('portal', { pitch: 1.2 });
      if (F) {
        F.flash(portal.color2, 0.75, 0.6);
        F.ring(portal.x, portal.y, { radius: 240, color: portal.color, life: 0.6, width: 10 });
        F.burst(portal.x, portal.y, { count: 36, colors: [portal.color, portal.color2, '#ffffff'], speed: [120, 420], life: [0.4, 0.9], size: [2, 5], glow: true, shape: 'star' });
      }
      if (SK.cam.shake) SK.cam.shake(6, 0.4);
      SK.vibrate && SK.vibrate(40);
      const Gm = SK.Game;
      if (Gm && Gm.nextBiome) Gm.nextBiome();
    }
  }

  /* ================================================================ pickups */
  function xpTier(v) { return v >= 40 ? 3 : v >= 10 ? 2 : v >= 3 ? 1 : 0; }
  function pickupColor(p) {
    switch (p.kind) {
      case 'xp': return p.tier === 3 ? RAINBOW[floor(SK.time.t * 6 + p.seed * 6) % 6] : XP_COLORS[p.tier];
      case 'essence': return p.color;
      case 'heart': return '#ff4d6d';
      case 'magicule': return '#448aff';
      case 'chest': return '#ffd54f';
      case 'soul': return '#d05cff';
      default: return '#ffffff';
    }
  }
  function absorbRadius(P) {
    const st = (P && P.stats) || EMPTY;
    return 230 * (st.area || 1) * (st.absorbMul || 1);
  }

  function spawnPickup(G, kind, x, y, opts) {
    G = G || SK.G;
    if (!G) return null;
    if (!G.pickups) G.pickups = [];
    const o = opts || EMPTY;
    const p = pool.pop() || {};
    p.id = U.uid();
    p.kind = kind;
    p.x = +x || 0; p.y = +y || 0;
    const a = o.angle != null ? o.angle : random() * TAU;
    const sp = o.speed != null ? o.speed : rand(40, 130);
    p.vx = o.vx != null ? o.vx : cos(a) * sp;
    p.vy = o.vy != null ? o.vy : sin(a) * sp;
    p.value = o.value != null ? o.value : 1;
    p.skillId = o.skillId || null;
    p.from = o.from || null;
    p.t = 0;
    p.life = o.life != null ? o.life : kind === 'essence' ? ESSENCE_LIFE : kind === 'heart' || kind === 'magicule' ? 45 : Infinity;
    p.dead = false;
    p.z = o.z || 0;
    p.vz = o.vz != null ? o.vz : kind === 'chest' ? 300 : rand(110, 210);
    p.land = 0; p.mag = false; p.ms = 0; p.pull = 0; p.seed = random();
    p.spin = (random() < 0.5 ? -1 : 1) * rand(2.4, 3.6);
    p.opened = false; p.openT = 0; p.hopT = 1.4 + random();
    p.tier = kind === 'xp' ? xpTier(p.value) : 0;
    p.color = kind === 'essence' ? skillColor(p.skillId) : '#ffffff';
    if (kind !== 'essence') p.color = pickupColor(p);
    const R = ARENA_R - 24, d = hypot(p.x, p.y);
    if (d > R) { p.x *= R / d; p.y *= R / d; }
    G.pickups.push(p);
    return p;
  }

  function dropLoot(G, m) {
    G = G || SK.G;
    if (!G || !m || m.team === 'ally') return;
    const def = m.def || EMPTY;
    const P = G.player;
    const luck = (P && P.stats && P.stats.luck) || 1;
    const x = m.x, y = m.y;
    let xp = m.xp != null ? m.xp : def.xp != null ? def.xp : 1;
    xp = max(1, Math.round(xp));
    if (m.boss) {
      const n = qi() === 0 ? 16 : 24;
      const per = max(1, floor((xp * 0.75) / n));
      for (let i = 0; i < n; i++) {
        spawnPickup(G, 'xp', x, y, { value: per, speed: rand(120, 380), vz: rand(260, 480) });
      }
      spawnPickup(G, 'xp', x, y, { value: max(40, xp - per * n), speed: 40, vz: 420 });
    } else if (m.elite) {
      const n = 3 + floor(random() * 3);
      const per = max(1, floor(xp / n));
      for (let i = 0; i < n; i++) spawnPickup(G, 'xp', x, y, { value: i === 0 ? xp - per * (n - 1) : per, speed: rand(70, 190) });
    } else if (xp >= 8 && random() < 0.5) {
      const h = floor(xp / 2);
      spawnPickup(G, 'xp', x, y, { value: h });
      spawnPickup(G, 'xp', x, y, { value: xp - h });
    } else {
      spawnPickup(G, 'xp', x, y, { value: xp, speed: rand(20, 80) });
    }

    const Gm = SK.Game;
    const sk = Gm && typeof Gm.essenceFor === 'function' ? Gm.essenceFor(m) : m.essence || null;
    const eChance = m.boss || m.elite ? 1 : 0.35;
    if (sk && random() < eChance) {
      spawnPickup(G, 'essence', x, y, { skillId: sk, from: m.type || def.id || null, speed: rand(30, 90), vz: 240 });
    }

    if (m.boss) {
      for (let i = 0; i < 2; i++) spawnPickup(G, 'heart', x, y, { speed: rand(80, 200), vz: 300 });
      for (let i = 0; i < 2; i++) spawnPickup(G, 'magicule', x, y, { speed: rand(80, 200), vz: 300 });
    } else {
      if (random() < 0.03 * luck) spawnPickup(G, 'heart', x, y, { vz: 220 });
      if (random() < 0.04 * luck) spawnPickup(G, 'magicule', x, y, { vz: 220 });
    }
    if (m.elite || m.boss) spawnPickup(G, 'chest', x, y, { speed: rand(30, 70), vz: 330 });

    let souls = m.souls != null ? m.souls : def.souls || 0;
    if (m.elite) souls = max(souls, 2);
    if (m.boss) souls = max(souls, 25);
    if (souls > 0) {
      const n = min(6, max(1, Math.ceil(souls / 5)));
      const per = floor(souls / n);
      for (let i = 0; i < n; i++) {
        spawnPickup(G, 'soul', x, y, { value: i === 0 ? souls - per * (n - 1) : per, speed: rand(60, 170), vz: rand(200, 320) });
      }
    }
  }

  function wantsPickup(p, P) {
    if (p.kind === 'heart') return !(P.maxHp > 0) || P.hp < P.maxHp;
    if (p.kind === 'magicule') return !(P.maxMp > 0) || P.mp < P.maxMp;
    return true;
  }

  function collect(G, p) {
    if (p.dead) return;
    p.dead = true;
    const F = FX();
    const col = pickupColor(p);
    const now = SK.time.t;
    switch (p.kind) {
      case 'xp':
        sfx('xp', { pitch: D.xpPitch, vol: p.tier >= 2 ? 1 : 0.7 });
        D.xpPitch = D.xpChainT > 0 ? min(1.9, D.xpPitch + 0.035) : 1;
        D.xpChainT = 0.35;
        if (F && (p.tier > 0 || now - D.sparkleT > 0.05)) { D.sparkleT = now; F.sparkle(p.x, p.y - 6, col); }
        break;
      case 'heart':
        sfx('heal');
        if (F) { F.heal(p.x, p.y - 6); F.sparkle(p.x, p.y - 8, '#ff8a9a'); }
        break;
      case 'magicule':
        sfx('pickup', { pitch: 1.3 });
        if (F) { F.sparkle(p.x, p.y - 8, '#82b1ff'); F.ring(p.x, p.y, { radius: 34, color: '#448aff', life: 0.35, width: 3 }); }
        break;
      case 'soul':
        sfx('coin', { pitch: 0.9 + random() * 0.2 });
        if (F) {
          F.sparkle(p.x, p.y - 10, '#e040fb');
          F.burst(p.x, p.y - 10, { count: 5, colors: ['#e040fb', '#ffffff'], speed: [20, 70], gravity: -90, life: [0.4, 0.7], size: [1.5, 3], glow: true });
        }
        break;
      case 'essence': {
        sfx('absorb');
        if (F) {
          F.sparkle(p.x, p.y, col);
          F.ring(p.x, p.y, { radius: 46, color: col, life: 0.35, width: 4 });
          F.burst(p.x, p.y, { count: 10, colors: [col, '#ffffff'], speed: [40, 140], life: [0.3, 0.6], size: [1.5, 3.5], glow: true, shape: 'spark' });
        }
        break;
      }
      case 'chest':
        sfx('chest');
        break;
      default:
        sfx('pickup');
    }
    const Gm = SK.Game;
    if (Gm && Gm.onPickup) Gm.onPickup(p);
  }

  function openChest(G, p) {
    p.opened = true;
    p.openT = 0;
    p.vz = 0; p.z = 0;
    const F = FX();
    if (F) {
      F.lightRays(p.x, p.y - 10, { color: '#ffe082', count: 9, radius: 160, life: 1.1 });
      F.ring(p.x, p.y, { radius: 90, color: '#ffd54f', life: 0.45, width: 6 });
      F.burst(p.x, p.y - 12, { count: 22, colors: ['#ffd54f', '#ffecb3', '#ffffff'], speed: [120, 300], gravity: 380, life: [0.5, 1.0], size: [2, 4], shape: 'square', glow: true, angle: -PI / 2, spread: 2.2 });
      F.sparkle(p.x, p.y - 16, '#fff59d');
    }
    if (SK.cam.shake) SK.cam.shake(4, 0.25);
    SK.vibrate && SK.vibrate(25);
    p.dead = false;
    collect(G, p);
    p.dead = false; // keep it alive for the lid animation; removed once openT ends
    p.collected = true;
  }

  function mergeXp(G, cell) {
    mergeMap.clear();
    const list = G.pickups;
    const F = FX();
    let fxN = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead || p.kind !== 'xp' || p.mag) continue;
      const key = (floor(p.x / cell) + 4096) * 8192 + (floor(p.y / cell) + 4096);
      const host = mergeMap.get(key);
      if (!host) { mergeMap.set(key, p); continue; }
      host.value += p.value;
      host.tier = xpTier(host.value);
      host.land = 1;
      if (host.z <= 0) host.vz = max(host.vz, 120);
      p.dead = true;
      if (F && fxN < 6 && SK.cam.inView(host.x, host.y, 20)) { fxN++; F.sparkle(host.x, host.y - 6, pickupColor(host)); }
    }
  }

  function recycle(list, i) {
    const p = list[i];
    const last = list.pop();
    if (i < list.length) list[i] = last;
    p.collected = false;
    pool.push(p);
  }

  function updatePickups(G, dt) {
    const list = G.pickups;
    if (!list) return;
    const P = G.player;
    const alive = P && !P.dead;
    const st = (P && P.stats) || EMPTY;
    const magR = st.magnet || 110;
    const absR = absorbRadius(P);
    const absorbing = !!(alive && P.absorbing);
    const fc = P ? P.facing || 0 : 0;
    const mx = P ? P.x + cos(fc) * (P.r || 22) * 0.35 : 0, my = P ? P.y + sin(fc) * (P.r || 22) * 0.35 : 0;
    const pvx = (P && P.vx) || 0, pvy = (P && P.vy) || 0;
    const fr = exp(-3.4 * dt);
    const F = FX();
    let xpCount = 0;
    if (D.xpChainT > 0) { D.xpChainT -= dt; if (D.xpChainT <= 0) D.xpPitch = 1; }

    for (let i = list.length - 1; i >= 0; i--) {
      if (i >= list.length) continue;
      const p = list[i];
      if (p.dead) { recycle(list, i); continue; }
      p.t += dt;
      if (p.z > 0 || p.vz !== 0) {
        p.vz -= GRAV * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          if (p.vz < -80) { p.vz = -p.vz * 0.36; p.land = 1; } else { if (p.vz < -20) p.land = 0.6; p.vz = 0; }
        }
      }
      if (p.land > 0) p.land = max(0, p.land - dt * 5);
      if (!p.mag && !p.pull) {
        p.vx *= fr; p.vy *= fr;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      const kind = p.kind;
      if (kind === 'xp') xpCount++;

      if (kind === 'chest') {
        if (p.opened) {
          p.openT += dt;
          if (p.openT > 0.95) p.dead = true;
          continue;
        }
        p.hopT -= dt;
        if (p.hopT <= 0 && p.z === 0) { p.vz = 150; p.hopT = 1.5 + random(); }
        if (alive && p.t > 0.45) {
          const dx = P.x - p.x, dy = P.y - p.y, rr = (P.r || 22) + 20;
          if (dx * dx + dy * dy < rr * rr) openChest(G, p);
        }
        continue;
      }

      if (kind === 'essence') {
        let pulled = false;
        if (absorbing) {
          const dx = p.x - mx, dy = p.y - my, d = hypot(dx, dy);
          if (d < absR) {
            pulled = true;
            if (!p.pull) { p.ms = 40; sfx('absorbStart', { vol: 0.35, pitch: 1.4 }); }
            p.pull = min(1, p.pull + dt * 2.5);
            p.ms += 900 * dt;
            const a = atan2(dy, dx) + p.spin * dt * (1.4 + 5 * (1 - d / absR));
            const nd = max(0, d - p.ms * dt);
            p.x = mx + cos(a) * nd + pvx * dt;
            p.y = my + sin(a) * nd + pvy * dt;
            p.z = max(0, p.z - 60 * dt);
            p.vx = cos(a + PI / 2) * 60; p.vy = sin(a + PI / 2) * 60;
            if (F && random() < dt * 30) F.burst(p.x, p.y - 8, { count: 1, color: p.color, speed: [5, 20], life: [0.2, 0.4], size: [1.5, 2.5], glow: true });
            if (nd < 12) { collect(G, p); continue; }
          }
        }
        if (!pulled && p.pull) { p.pull = 0; p.ms = 0; }
        if (!pulled && p.t > p.life) {
          p.dead = true;
          if (F && SK.cam.inView(p.x, p.y, 30)) {
            F.burst(p.x, p.y - 10, { count: 8, colors: [p.color, '#ffffff'], speed: [20, 80], gravity: -60, life: [0.4, 0.8], size: [1.5, 3], glow: true });
          }
        }
        continue;
      }

      // magnetised kinds: xp, heart, magicule, soul
      if (p.t > p.life && !p.mag) { p.dead = true; continue; }
      if (!alive) continue;
      if (kind === 'soul') p.z = max(p.z, 0);
      const dx = P.x - p.x, dy = P.y - p.y;
      const d = hypot(dx, dy) || 0.001;
      const want = wantsPickup(p, P);
      if (!p.mag) {
        if (want && p.t > 0.25 && (d < magR || (absorbing && d < absR))) { p.mag = true; p.ms = -110; }
        else continue;
      }
      if (!want) { p.mag = false; p.ms = 0; continue; }
      p.ms += 1500 * dt;
      const step = p.ms * dt;
      const nx = dx / d, ny = dy / d;
      const curl = p.seed > 0.5 ? 1 : -1, cw = clampN(d / 260, 0, 1) * (p.ms > 0 ? 0.55 : 0);
      p.x += (nx - ny * curl * cw) * step + pvx * dt;
      p.y += (ny + nx * curl * cw) * step + pvy * dt;
      if (p.z > 0) p.z = max(0, p.z - 200 * dt);
      const hitR = (P.r || 22) * 0.8 + 8;
      if (d < hitR || (step > 0 && step >= d)) collect(G, p);
    }

    D.mergeT -= dt;
    if (xpCount > 200 && D.mergeT <= 0) {
      D.mergeT = 0.25;
      mergeXp(G, xpCount > 350 ? 300 : 150);
    }
  }

  /* ================================================================ update */
  function update(G, dt) {
    G = G || SK.G;
    if (!G || !(dt >= 0)) return;
    const bi = clampN(G.biome | 0, 0, 3), b = biomes[bi];
    if (D.bi !== bi || D.G !== G) resetDirector(G, bi);
    if (typeof G.biomeT !== 'number') G.biomeT = 0;
    // biomeT is owned by whoever advances it: if game.js already does, we don't double count.
    if (!D.extClock && D.seenT >= 0 && G.biomeT !== D.seenT) D.extClock = true;
    if (!D.extClock) G.biomeT += dt;
    const T = G.biomeT;
    const A = ensureAssets(bi);
    const F = FX();
    if (F && F.ambient) F.ambient(b, dt);

    if (D.oracleT > 0) {
      D.oracleT -= dt;
      if (D.oracleT <= 0 && D.oracleText) { oracle(D.oracleText); D.oracleText = ''; }
    }

    if (!G.enemies) G.enemies = [];
    if (!G.pickups) G.pickups = [];
    clampAll(G, dt);
    const P = G.player;
    if (P && !P.dead) {
      director(G, b, bi, dt, T);
      bossLogic(G, b, bi, dt, T);
    }
    updatePortal(G, dt);
    updatePickups(G, dt);
    decorFx(A, b, dt);
    D.seenT = G.biomeT;
  }

  function decorFx(A, b, dt) {
    const F = FX();
    const nv = A.vis.length, nf = A.fvis.length;
    if (!F || !(nv + nf)) return;
    D.emT -= dt;
    if (D.emT > 0) return;
    D.emT = qi() === 0 ? 0.5 : qi() === 1 ? 0.25 : 0.15;
    for (let tries = 0; tries < 4; tries++) {
      const r = floor(random() * (nv + nf));
      const it = r < nv ? A.vis[r] : A.fvis[r - nv];
      if (!it || !it.em) continue;
      switch (it.em) {
        case 1:
          F.sparkle(it.x + rand(-24, 24), it.y - rand(14, 70), it.gc);
          break;
        case 2:
          F.burst(it.x + rand(-20, 20), it.y + rand(-10, 6), {
            count: 2, colors: ['#ffb347', '#ff5a1a', '#fff1b8'], speed: [20, 70], gravity: -90, life: [0.7, 1.3],
            size: [1.2, 2.6], glow: true, angle: -PI / 2, spread: 1.1,
          });
          break;
        case 3:
          F.burst(it.x + rand(-5, 5), it.y - it.f - 6, {
            count: 2, colors: ['#e040fb', '#ff80ff', '#ffffff'], speed: [20, 60], gravity: -120, life: [0.5, 0.9],
            size: [1, 2.2], glow: true, angle: -PI / 2, spread: 0.8,
          });
          break;
        case 4:
          F.burst(it.x + rand(-12, 12), it.y - 16, {
            count: 1, color: it.gc, speed: [5, 18], gravity: -25, life: [1, 1.8], size: [1.2, 2], glow: true, drag: 1,
          });
          break;
      }
      break;
    }
  }

  /* ================================================================ startBiome */
  function startBiome(G, index) {
    G = G || SK.G;
    if (!G) return;
    const bi = clampN(index | 0, 0, 3), b = biomes[bi];
    G.biome = bi;
    G.biomeT = 0;
    if (!G.pickups) G.pickups = [];
    for (let i = 0; i < G.pickups.length; i++) { const p = G.pickups[i]; p.collected = false; pool.push(p); }
    G.pickups.length = 0;
    if (G.zones) G.zones.length = 0;
    if (G.projectiles) G.projectiles.length = 0;
    if (G.enemies) G.enemies.length = 0; else G.enemies = [];
    G.boss = null;
    if ((G.t || 0) < 1) hintedWanderer = false;
    resetDirector(G, bi);
    D.seenT = 0;
    ensureAssets(bi);
    const P = G.player;
    if (P) {
      P.x = 0; P.y = 0;
      if (typeof P.vx === 'number') { P.vx = 0; P.vy = 0; }
    }
    const AL = G.allies;
    if (AL && AL.length) {
      for (let i = 0; i < AL.length; i++) {
        const m = AL[i], a = (i / AL.length) * TAU;
        m.x = cos(a) * 80; m.y = sin(a) * 80;
        if (typeof m.vx === 'number') { m.vx = 0; m.vy = 0; }
      }
    }
    SK.cam.snap(0, 0);
    banner(b.name, b.subtitle, { color: b.palette.accent, duration: 3.4 });
    music(b.music);
    D.oracleText = b.oracle;
    D.oracleT = 2.6;
    const F = FX();
    if (F) {
      F.ring(0, 0, { radius: 200, color: b.palette.accent, life: 0.9, width: 7 });
      F.ring(0, 0, { radius: 120, color: b.palette.light, life: 0.7, width: 4, delay: 0.15 });
      F.burst(0, 0, { count: 24, colors: [b.palette.accent, b.palette.light, '#ffffff'], speed: [60, 240], life: [0.5, 1.1], size: [2, 4], glow: true });
      if (bi > 0) F.flash(b.palette.light, 0.45, 0.7);
    }
  }

  /* ================================================================ rendering: background */
  function boxVis(v, x0, y0, x1, y1) { return x1 > v.x0 && x0 < v.x1 && y1 > v.y0 && y0 < v.y1; }

  function drawRiver(ctx, rv, t, lowQ) {
    const pts = rv.pts, n = pts.length;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < n - 2; i += 2) {
      ctx.quadraticCurveTo(pts[i], pts[i + 1], (pts[i] + pts[i + 2]) / 2, (pts[i + 1] + pts[i + 3]) / 2);
    }
    ctx.lineTo(pts[n - 2], pts[n - 1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#1a0905'; ctx.lineWidth = rv.w + 18; ctx.stroke();
    ctx.strokeStyle = '#4a1a0c'; ctx.lineWidth = rv.w + 8; ctx.stroke();
    ctx.strokeStyle = '#d8400f'; ctx.lineWidth = rv.w; ctx.stroke();
    ctx.strokeStyle = '#ff8a1a'; ctx.lineWidth = rv.w * 0.62; ctx.stroke();
    if (!lowQ) {
      ctx.setLineDash(FLOW_DASH);
      ctx.lineDashOffset = -t * 26 - rv.seed * 100;
      ctx.strokeStyle = '#ffd28a'; ctx.globalAlpha = 0.7; ctx.lineWidth = rv.w * 0.24; ctx.stroke();
      ctx.setLineDash(EMPTY_DASH);
      ctx.lineDashOffset = 0;
    }
    ctx.globalAlpha = 0.55; ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = max(1.5, rv.w * 0.09); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function renderBackground(ctx, G) {
    G = G || SK.G || EMPTY;
    const bi = clampN(G.biome | 0, 0, 3), b = biomes[bi], pal = b.palette;
    const A = ensureAssets(bi);
    const v = SK.cam.view, t = SK.time.t, q = qi();
    const pad = 70;
    const x0 = v.x0 - pad, y0 = v.y0 - pad, w = v.x1 - v.x0 + pad * 2, h = v.y1 - v.y0 + pad * 2;
    ctx.save();
    if (!A.pattern || A.patCtx !== ctx) {
      A.pattern = ctx.createPattern ? ctx.createPattern(A.tex, 'repeat') : null;
      A.patCtx = ctx;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = A.pattern || pal.ground;
    ctx.fillRect(x0, y0, w, h);

    // rivers (volcano)
    for (let i = 0; i < A.rivers.length; i++) {
      const rv = A.rivers[i];
      if (boxVis(v, rv.x0, rv.y0, rv.x1, rv.y1)) drawRiver(ctx, rv, t, q === 0);
    }

    // flat decals
    const fv = A.fvis;
    fv.length = 0;
    for (let i = 0; i < A.flat.length; i++) {
      const it = A.flat[i];
      if (boxVis(v, it.x + it.bx0, it.y + it.by0, it.x + it.bx1, it.y + it.by1)) fv.push(it);
    }
    for (let i = 0; i < fv.length; i++) {
      const it = fv[i];
      switch (it.k) {
        case 'shade':
          softAt(ctx, it.x, it.y, it.R, '#000000', 0.38);
          break;
        case 'seal':
          break; // drawn additively below
        case 'puddle': {
          ctx.globalAlpha = 1;
          ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay);
          const ph = fract(t * 0.35 + it.seed);
          ctx.globalAlpha = (1 - ph) * 0.35;
          ctx.strokeStyle = pal.light; ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.ellipse(it.x + (it.seed - 0.5) * it.R * 0.6, it.y + (fract(it.seed * 7) - 0.5) * it.f * 0.6, it.R * 0.15 + ph * it.R * 0.55, it.f * 0.15 + ph * it.f * 0.55, 0, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'lava': {
          ctx.globalAlpha = 1;
          ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay);
          if (q > 0) {
            ctx.fillStyle = '#fff1b8';
            for (let k = 0; k < 3; k++) {
              const ph = fract(t * 0.55 + k * 0.33 + it.seed);
              const bx = it.x + sin(it.seed * 40 + k * 2.1) * it.R * 0.55, by = it.y + cos(it.seed * 30 + k * 1.7) * it.f * 0.5;
              ctx.globalAlpha = ph < 0.85 ? 0.55 : (1 - ph) * 3.6;
              ctx.beginPath(); ctx.arc(bx, by, 1.5 + ph * 4.5, 0, TAU); ctx.fill();
            }
          }
          break;
        }
        default:
          ctx.globalAlpha = 1;
          ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay);
      }
    }

    // upright decor
    const vis = A.vis;
    vis.length = 0;
    for (let i = 0; i < A.items.length; i++) {
      const it = A.items[i];
      if (boxVis(v, it.x + it.bx0, it.y + it.by0, it.x + it.bx1, it.y + it.by1)) vis.push(it);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < vis.length; i++) {
      const it = vis[i];
      if (it.k === 'grass') {
        if (q === 0) { ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay); continue; }
        const k = sin(t * 1.7 + it.seed * 9 + it.x * 0.004) * 0.22;
        ctx.translate(it.x, it.y);
        ctx.transform(1, 0, k, 1, 0, 0);
        ctx.drawImage(it.spr, -it.ax, -it.ay);
        ctx.transform(1, 0, -k, 1, 0, 0);
        ctx.translate(-it.x, -it.y);
      } else {
        ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay);
      }
    }

    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < fv.length; i++) {
      const it = fv[i];
      if (it.k === 'seal') {
        const pulse = 0.5 + 0.5 * sin(t * 1.3 + it.seed * 6);
        ctx.globalAlpha = 0.3 + pulse * 0.25;
        ctx.translate(it.x, it.y);
        ctx.rotate(t * it.sp);
        ctx.drawImage(it.spr, -it.ax, -it.ay);
        ctx.rotate(-t * it.sp);
        ctx.translate(-it.x, -it.y);
        glowAt(ctx, it.x, it.y, it.gr, it.gc, it.ga * (0.7 + pulse * 0.6));
      } else if (it.gc) {
        const pulse = 0.75 + 0.25 * sin(t * it.sp + it.seed * TAU);
        glowAt(ctx, it.x + it.gx, it.y + it.gy, it.gr * (0.92 + 0.08 * pulse), it.gc, it.ga * pulse);
      }
    }
    for (let i = 0; i < vis.length; i++) {
      const it = vis[i];
      if (it.k === 'brazier') {
        const fl = 1 + 0.12 * sin(t * 13 + it.seed * 20) + 0.08 * sin(t * 21 + it.seed * 7);
        const fh = 1 + 0.2 * sin(t * 9 + it.seed * 11);
        const fw = A.flame.width * 0.62 * fl, fhh = A.flame.height * 0.62 * fh;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(A.flame, it.x - fw / 2, it.y - it.f - fhh * 0.92, fw, fhh);
      }
      if (it.gc) {
        const pulse = 0.75 + 0.25 * sin(t * it.sp + it.seed * TAU);
        glowAt(ctx, it.x + it.gx, it.y + it.gy, it.gr * (0.92 + 0.08 * pulse), it.gc, it.ga * pulse);
      }
    }
    if (q > 0) {
      for (let i = 0; i < A.rivers.length; i++) {
        const rv = A.rivers[i];
        if (!boxVis(v, rv.x0, rv.y0, rv.x1, rv.y1)) continue;
        const pts = rv.pts, gr = rv.w * 2.4;
        for (let k = 0; k < pts.length; k += 4) {
          const x = pts[k], y = pts[k + 1];
          if (x < v.x0 - gr || x > v.x1 + gr || y < v.y0 - gr || y > v.y1 + gr) continue;
          glowAt(ctx, x, y, gr, '#ff5a1a', 0.2 + 0.08 * sin(t * 2 + k * 0.37));
        }
      }
    }

    // arena edge
    const cx = SK.cam.x, cy = SK.cam.y;
    const vr = hypot(v.x1 - v.x0, v.y1 - v.y0) / 2 + pad;
    const dc = hypot(cx, cy);
    if (dc + vr > ARENA_R - 200) {
      // glyph ring
      const P = G.player;
      const near = D.edgeT > 0 ? 1 : 0;
      for (let i = 0; i < A.glyphs.length; i++) {
        const gl = A.glyphs[i];
        if (gl.x < v.x0 - 30 || gl.x > v.x1 + 30 || gl.y < v.y0 - 30 || gl.y > v.y1 + 30) continue;
        let a = 0.3 + 0.25 * sin(t * 2 - i * 0.55);
        if (P) {
          const dd = hypot(P.x - gl.x, P.y - gl.y);
          if (dd < 300) a += (1 - dd / 300) * (0.45 + near * 0.4);
        }
        const spr = A.glyphSprites[gl.v];
        ctx.globalAlpha = clampN(a, 0, 1);
        ctx.translate(gl.x, gl.y);
        ctx.rotate(gl.a + PI / 2);
        ctx.drawImage(spr, -18, -18);
        ctx.rotate(-(gl.a + PI / 2));
        ctx.translate(-gl.x, -gl.y);
        if (q > 0) glowAt(ctx, gl.x, gl.y, 34, pal.accent, a * 0.45);
      }
      ctx.globalAlpha = 0.35 + 0.15 * sin(t * 1.5) + near * 0.3;
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, ARENA_R + 2, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      const gr = ctx.createRadialGradient(0, 0, ARENA_R - 170, 0, 0, ARENA_R + 70);
      gr.addColorStop(0, U.rgba(pal.fog, 0));
      gr.addColorStop(0.55, U.rgba(pal.fog, 0.45));
      gr.addColorStop(0.8, U.rgba(pal.bg, 0.85));
      gr.addColorStop(1, U.rgba(pal.bg, 1));
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillRect(x0, y0, w, h);
    }
    ctx.restore();
  }

  /* ================================================================ rendering: pickups */
  function heartBeat(t) {
    const b = fract(t * 1.15);
    return 1 + 0.2 * exp(-((b - 0.08) * (b - 0.08)) / 0.0025) + 0.12 * exp(-((b - 0.26) * (b - 0.26)) / 0.0025);
  }

  function renderPickups(ctx, G) {
    G = G || SK.G;
    const list = G && G.pickups;
    if (!list || !list.length) return;
    ensurePK();
    const v = SK.cam.view, t = SK.time.t, q = qi();
    const vis = PVIS;
    vis.length = 0;
    const M = 50;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.dead) continue;
      if (p.x < v.x0 - M || p.x > v.x1 + M || p.y < v.y0 - M || p.y > v.y1 + M) continue;
      vis.push(p);
    }
    if (!vis.length) return;
    ctx.save();
    // alpha per pickup (fade in / blink)
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      let a = min(1, p.t * 6);
      const rem = p.life - p.t;
      if (rem < 3 && !p.pull && !p.mag) a *= sin(t * (rem < 1 ? 34 : 18)) > 0 ? 1 : 0.25;
      if (p.kind === 'chest' && p.opened) a = 1 - clampN((p.openT - 0.6) / 0.35, 0, 1);
      p.alpha = a;
    }
    // shadows
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      const sw = p.kind === 'chest' ? 26 : p.kind === 'essence' ? 15 : p.kind === 'xp' ? 6 + p.tier * 1.5 : 9;
      const k = 1 / (1 + p.z * 0.012);
      ctx.globalAlpha = p.alpha * 0.8 * k;
      ctx.drawImage(PK.shadow, p.x - sw * k, p.y + 2 - sw * 0.38 * k, sw * 2 * k, sw * 0.76 * k);
    }
    // back glows
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      const y = p.y - p.z;
      switch (p.kind) {
        case 'xp': {
          const col = pickupColor(p);
          glowAt(ctx, p.x, y - 7, 13 + p.tier * 5, col, p.alpha * (0.4 + 0.1 * sin(t * 4 + p.seed * 9)));
          break;
        }
        case 'essence': {
          const bob = sin(t * 2.6 + p.seed * 9) * 4;
          glowAt(ctx, p.x, y - 14 + bob, 40 + 6 * sin(t * 3 + p.seed * 5), p.color, p.alpha * 0.75);
          break;
        }
        case 'heart': glowAt(ctx, p.x, y - 9, 24 * heartBeat(t + p.seed), '#ff4d6d', p.alpha * 0.5); break;
        case 'magicule': glowAt(ctx, p.x, y - 10, 24, '#448aff', p.alpha * (0.5 + 0.15 * sin(t * 3 + p.seed * 7))); break;
        case 'chest': {
          const op = p.opened ? clampN(p.openT / 0.3, 0, 1) : 0;
          glowAt(ctx, p.x, y - 12, 36 + op * 50, '#ffd54f', p.alpha * (0.35 + 0.1 * sin(t * 3) + op * 0.6));
          break;
        }
        case 'soul': glowAt(ctx, p.x, y - 14, 26, '#d05cff', p.alpha * (0.5 + 0.15 * sin(t * 7 + p.seed * 9))); break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // bodies
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      const a = p.alpha;
      if (!(a > 0.01)) continue;
      ctx.globalAlpha = a;
      const y = p.y - p.z;
      const sq = p.land;
      switch (p.kind) {
        case 'xp': {
          const spr = p.tier === 3 ? PK.rainbow[floor(t * 6 + p.seed * 6) % 6] : PK.xp[p.tier];
          const bob = sin(t * 3.2 + p.seed * TAU) * 2.2;
          const spin = 0.72 + 0.28 * cos(t * 2.4 + p.seed * 6);
          const w = spr.width * spin * (1 + sq * 0.3), h = spr.height * (1 - sq * 0.25);
          ctx.drawImage(spr, p.x - w / 2, y - 7 + bob - h / 2 + sq * 2, w, h);
          break;
        }
        case 'heart': {
          const s = heartBeat(t + p.seed) * (1 + sq * 0.25);
          const bob = sin(t * 2.4 + p.seed * 9) * 2;
          const w = PK.heart.width * 0.62 * s, h = PK.heart.height * 0.62 * s * (1 - sq * 0.2);
          ctx.drawImage(PK.heart, p.x - w / 2, y - 9 + bob - h / 2, w, h);
          break;
        }
        case 'magicule': {
          const spin = 0.55 + 0.45 * abs(cos(t * 2 + p.seed * 6));
          const bob = sin(t * 2.8 + p.seed * 9) * 2.5;
          const w = PK.magi.width * 0.62 * spin, h = PK.magi.height * 0.62 * (1 - sq * 0.2);
          ctx.drawImage(PK.magi, p.x - w / 2, y - 11 + bob - h / 2, w, h);
          break;
        }
        case 'chest': {
          const cw = PK.chestBody.width * 0.72, ch = PK.chestBody.height * 0.72;
          const sx = 1 + sq * 0.22, sy = 1 - sq * 0.2;
          const bx = p.x - (cw * sx) / 2, by = y - ch * sy;
          ctx.drawImage(PK.chestBody, bx, by, cw * sx, ch * sy);
          const lw = PK.chestLid.width * 0.72 * sx, lh = PK.chestLid.height * 0.72;
          if (!p.opened) {
            ctx.drawImage(PK.chestLid, p.x - lw / 2, by - lh * 0.55, lw, lh);
          } else {
            const e = U.ease.outBack(clampN(p.openT / 0.35, 0, 1));
            const flip = 1 - e * 1.7;
            const lift = e * 10;
            const hh = lh * abs(flip);
            ctx.drawImage(PK.chestLid, p.x - lw / 2, by - lh * 0.55 - lift - (flip < 0 ? hh - lh * 0.3 : 0), lw, max(1, hh));
          }
          break;
        }
        case 'essence': {
          const bob = sin(t * 2.6 + p.seed * 9) * 4;
          const yy = y - 14 + bob;
          const pr = 14 + sin(t * 4 + p.seed * 3) * 1;
          const st = p.pull ? 1 + p.pull * 0.25 : 1;
          ctx.drawImage(orbSpr(p.color), p.x - pr * st, yy - pr / st, pr * 2 * st, (pr * 2) / st);
          const ic = p.skillId ? iconSpr(p.skillId) : null;
          if (ic) {
            const is = 17;
            ctx.globalAlpha = a * 0.95;
            ctx.drawImage(ic, p.x - is / 2, yy - is / 2, is, is);
          } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(p.x, yy, 4, 0, TAU); ctx.fill();
          }
          break;
        }
        default:
          break;
      }
    }
    // foreground additive: twinkles, motes, flames
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < vis.length; i++) {
      const p = vis[i];
      const a = p.alpha;
      if (!(a > 0.01)) continue;
      const y = p.y - p.z;
      switch (p.kind) {
        case 'xp': {
          const ph = fract(t * 0.7 + p.seed * 3.7);
          if (ph < 0.1 && (q > 0 || p.tier > 0)) {
            const s = sin((ph / 0.1) * PI) * (6 + p.tier * 2);
            ctx.globalAlpha = a * 0.9;
            ctx.drawImage(PK.star, p.x - s + 2, y - 12 - s, s * 2, s * 2);
          }
          break;
        }
        case 'essence': {
          const bob = sin(t * 2.6 + p.seed * 9) * 4;
          const yy = y - 14 + bob;
          const n = q === 0 ? 2 : 3;
          for (let k = 0; k < n; k++) {
            const an = t * 3.2 + (k * TAU) / n + p.seed * 6;
            const ox = cos(an) * 19, oy = sin(an) * 7;
            glowAt(ctx, p.x + ox, yy + oy, sin(an) > 0 ? 6 : 4, p.color, a * (sin(an) > 0 ? 0.95 : 0.45));
          }
          for (let k = 0; k < 2; k++) {
            const ph = fract(t * 1.4 + k * 0.5 + p.seed);
            glowAt(ctx, p.x + sin(t * 5 + k * 3) * 3, yy - 8 - ph * 16, 5 * (1 - ph), '#ffffff', a * (1 - ph) * 0.7);
          }
          break;
        }
        case 'soul': {
          const bob = sin(t * 2.2 + p.seed * 9) * 3;
          const fl = 1 + 0.1 * sin(t * 11 + p.seed * 20), fh = 1 + 0.16 * sin(t * 8 + p.seed * 13);
          const ow = PK.soulOut.width * 0.5 * fl, oh = PK.soulOut.height * 0.5 * fh;
          ctx.globalAlpha = a;
          ctx.drawImage(PK.soulOut, p.x - ow / 2, y - 6 + bob - oh, ow, oh);
          const iw = ow * 0.55, ih = oh * 0.6;
          ctx.drawImage(PK.soulIn, p.x - iw / 2, y - 7 + bob - ih, iw, ih);
          break;
        }
        case 'chest': {
          if (!p.opened) {
            const ph = fract(t * 0.45 + p.seed);
            if (ph < 0.12) {
              const s = sin((ph / 0.12) * PI) * 8;
              ctx.globalAlpha = a;
              ctx.drawImage(PK.star, p.x + 11 - s, y - 22 - s, s * 2, s * 2);
            }
          }
          break;
        }
        case 'magicule': {
          const ph = fract(t * 0.6 + p.seed * 2.3);
          if (ph < 0.12) {
            const s = sin((ph / 0.12) * PI) * 7;
            ctx.globalAlpha = a;
            ctx.drawImage(PK.star, p.x - s - 3, y - 18 - s, s * 2, s * 2);
          }
          break;
        }
      }
    }
    ctx.restore();
  }

  /* ================================================================ rendering: foreground */
  let darkSpr = null;
  function getDark() {
    if (darkSpr) return darkSpr;
    const c = mk(256, 256), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.42, 'rgba(0,0,0,0)');
    gr.addColorStop(0.75, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    darkSpr = c;
    return c;
  }

  function drawChain(ctx, ch, t) {
    const n = ch.n, sway = sin(t * 1.1 + ch.seed * 9) * 4;
    const sag = ch.sag + sway;
    const dx = ch.x2 - ch.x1, dy = ch.y2 - ch.y1;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const x = ch.x1 + dx * f, y = ch.y1 + dy * f + sag * 4 * f * (1 - f);
        const ang = atan2(dy + sag * 4 * (1 - 2 * f), dx);
        if (i % 2 === 0) {
          ctx.moveTo(x + cos(ang) * 5.5, y + sin(ang) * 5.5);
          ctx.ellipse(x, y, 5.5, 3, ang, 0, TAU);
        } else {
          ctx.moveTo(x - cos(ang) * 5, y - sin(ang) * 5);
          ctx.lineTo(x + cos(ang) * 5, y + sin(ang) * 5);
        }
      }
      if (pass === 0) { ctx.strokeStyle = '#0d0910'; ctx.lineWidth = 3.4; }
      else { ctx.strokeStyle = '#6a5a74'; ctx.lineWidth = 1.4; }
      ctx.stroke();
    }
  }

  function drawPortal(ctx, t, q) {
    const p = portal;
    const k = U.ease.outBack(clampN(p.t / 1.1, 0, 1));
    const ent = p.entered ? clampN(p.enterT / 0.6, 0, 1) : 0;
    const R = p.r * k * (1 + ent * 0.7);
    if (R <= 1) return;
    const fade = 1 - ent;
    const x = p.x, y = p.y, c1 = p.color, c2 = p.color2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.86);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = '#05000f';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, 0, 0, R * 2.6, c1, (0.5 + 0.15 * sin(t * 3)) * fade + ent * 0.5);
    // rune ring
    ctx.globalAlpha = (0.55 + 0.2 * sin(t * 2)) * fade;
    ctx.rotate(-t * 0.6);
    const rs = (R * 1.5) / 96;
    ctx.drawImage(p.spr, (-p.spr.width / 2) * rs, (-p.spr.height / 2) * rs, p.spr.width * rs, p.spr.height * rs);
    ctx.rotate(t * 0.6);
    // spiral arms
    ctx.lineCap = 'round';
    const arms = q === 0 ? 3 : 5;
    for (let j = 0; j < arms; j++) {
      const base = t * 2.4 + (j * TAU) / arms;
      ctx.beginPath();
      for (let s = 0; s <= 14; s++) {
        const f = s / 14, rr = R * 0.95 * (1 - f * 0.92), a = base + f * 3.4;
        if (s === 0) ctx.moveTo(cos(a) * rr, sin(a) * rr); else ctx.lineTo(cos(a) * rr, sin(a) * rr);
      }
      ctx.globalAlpha = 0.6 * fade;
      ctx.strokeStyle = j % 2 ? c2 : c1;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // rotating ring segments
    for (let i = 0; i < 3; i++) {
      const s0 = t * (1.5 + i * 0.7) * (i % 2 ? -1 : 1) + i * 2;
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = i === 1 ? '#ffffff' : c2;
      ctx.lineWidth = 4 - i;
      ctx.beginPath(); ctx.arc(0, 0, R * (1 - i * 0.13), s0, s0 + PI * 1.15); ctx.stroke();
    }
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeStyle = c1; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    glowAt(ctx, 0, 0, R * 0.7, '#ffffff', 0.55 * fade + ent);
    // inward motes
    const nm = q === 0 ? 10 : q === 1 ? 18 : 26;
    for (let i = 0; i < nm; i++) {
      const ph = fract(t * 0.45 + i / nm + p.seed);
      const rr = R * (2.4 - 2.25 * ph), a = i * 2.39996 + ph * 2.8 + t * 0.2;
      glowAt(ctx, cos(a) * rr, sin(a) * rr, 3 + 5 * (1 - ph), ph > 0.6 ? '#ffffff' : c2, sin(ph * PI) * 0.9 * fade);
    }
    ctx.restore();
  }

  function drawPortalArrow(ctx, t) {
    const p = portal;
    if (SK.cam.inView(p.x, p.y, -30)) return;
    const v = SK.cam.view;
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    const a = atan2(p.y - cy, p.x - cx);
    const hw = (v.x1 - v.x0) / 2 - 44, hh = (v.y1 - v.y0) / 2 - 44;
    const ca = cos(a), sa = sin(a);
    const s = min(hw / max(1e-4, abs(ca)), hh / max(1e-4, abs(sa)));
    const ax = cx + ca * s, ay = cy + sa * s;
    const pulse = 1 + 0.15 * sin(t * 6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, ax, ay, 34 * pulse, p.color, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = p.color2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -12); ctx.lineTo(-3, 0); ctx.lineTo(-8, 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  function renderForeground(ctx, G) {
    G = G || SK.G || EMPTY;
    const bi = clampN(G.biome | 0, 0, 3), b = biomes[bi], pal = b.palette;
    const A = ensureAssets(bi);
    const v = SK.cam.view, t = SK.time.t, q = qi();
    const P = G.player;
    const vw = v.x1 - v.x0, vh = v.y1 - v.y0;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // tall decor: canopies, pillar shafts, smoke
    for (let i = 0; i < A.fg.length; i++) {
      const it = A.fg[i];
      if (it.k === 'beam') continue;
      if (!boxVis(v, it.x + it.bx0, it.y + it.by0, it.x + it.bx1, it.y + it.by1)) continue;
      switch (it.k) {
        case 'canopy': {
          let a = 0.92;
          if (P) {
            const d = hypot(P.x - it.x, P.y - it.y);
            a = clampN((d - it.R * 0.35) / (it.R * 0.6), 0.28, 0.92);
          }
          it.f = U.lerp(it.f, a, 0.12);
          const sw = sin(t * 0.7 + it.seed * 6) * 2.5;
          ctx.globalAlpha = it.f;
          ctx.drawImage(it.spr, it.x - it.ax + sw, it.y - it.ay + sw * 0.4);
          break;
        }
        case 'shaft': {
          let a = 1;
          if (P && abs(P.x - it.x) < 30 && P.y < it.y - 4 && P.y > it.y - it.R - 10) a = 0.4;
          it.alt = it.alt == null ? a : U.lerp(it.alt, a, 0.15);
          ctx.globalAlpha = it.alt;
          ctx.drawImage(it.spr, it.x - it.ax, it.y - it.ay);
          ctx.globalCompositeOperation = 'lighter';
          glowAt(ctx, it.x, it.y - it.f, 26, it.gc, (0.45 + 0.25 * sin(t * 2.2 + it.seed * 9)) * it.alt);
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'smoke': {
          const n = q === 0 ? 3 : 5;
          for (let k = 0; k < n; k++) {
            const ph = fract(t * 0.32 + k / n + it.seed);
            const px = it.x + sin(ph * 5 + it.seed * 10) * 12 * ph + ph * 26;
            const py = it.y - ph * 170;
            softAt(ctx, px, py, 14 + ph * 46, '#3d302e', 0.42 * sin(ph * PI));
          }
          break;
        }
      }
    }

    // chains
    if (A.chains.length) {
      ctx.globalAlpha = 1;
      for (let i = 0; i < A.chains.length; i++) {
        const ch = A.chains[i];
        if (boxVis(v, ch.x0, ch.y0, ch.xm, ch.ym)) drawChain(ctx, ch, t);
      }
    }

    // light shafts
    ctx.globalCompositeOperation = 'lighter';
    if (q > 0 && A.beam) {
      for (let i = 0; i < A.fg.length; i++) {
        const it = A.fg[i];
        if (it.k !== 'beam') continue;
        if (!boxVis(v, it.x + it.bx0, it.y + it.by0, it.x + it.bx1, it.y + it.by1)) continue;
        const a = (bi === 1 ? 0.16 : 0.1) * (0.6 + 0.4 * sin(t * 0.5 + it.seed * 9));
        ctx.globalAlpha = a;
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        ctx.drawImage(A.beam, -it.f / 2, -it.R, it.f, it.R * 1.15);
        ctx.rotate(-it.rot);
        ctx.translate(-it.x, -it.y);
      }
    }

    // biome atmosphere
    if (bi === 2 && q > 0) {
      const n = q === 1 ? 26 : 46;
      for (let i = 0; i < n; i++) {
        const x = wrapIn(i * 173.7 + sin(t * 0.9 + i) * 14, v.x0, vw);
        const y = wrapIn(i * 311.3 - t * (22 + (i % 7) * 7), v.y0, vh);
        glowAt(ctx, x, y, 3 + (i % 3) * 1.5, i % 4 ? '#ff8a3c' : '#ffd180', 0.22 + 0.14 * sin(t * 3 + i));
      }
    } else if (bi === 1 && q > 0) {
      const n = q === 1 ? 6 : 10;
      for (let i = 0; i < n; i++) {
        const x = wrapIn(i * 389.1 + t * 9, v.x0 - 80, vw + 160);
        const y = wrapIn(i * 233.7 + sin(t * 0.2 + i) * 40, v.y0 - 80, vh + 160);
        glowAt(ctx, x, y, 46 + (i % 3) * 14, '#fff3b0', 0.07 + 0.05 * sin(t * 0.8 + i * 2));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    if (bi === 1 && q > 0) {
      for (let i = 0; i < 4; i++) {
        const sz = 300 + i * 70;
        const x = wrapIn(i * 911 + t * 11, v.x0 - sz, vw + sz * 2);
        const y = wrapIn(i * 577 + t * 4, v.y0 - sz, vh + sz * 2);
        softAt(ctx, x, y, sz, '#000000', 0.16);
      }
    }
    if (bi === 2 && q > 0) {
      const n = q === 1 ? 14 : 24;
      ctx.fillStyle = '#9a8c86';
      for (let i = 0; i < n; i++) {
        const x = wrapIn(i * 211.3 + sin(t * 0.7 + i * 1.3) * 22 + t * 8, v.x0, vw);
        const y = wrapIn(i * 157.9 + t * (14 + (i % 5) * 4), v.y0, vh);
        ctx.globalAlpha = 0.3 + 0.2 * sin(t + i);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }

    // drifting fog layers
    if (q > 0) {
      const n = q === 1 ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const sz = 360 + (i % 3) * 150;
        const x = wrapIn(i * 911 + t * (12 + i * 3), v.x0 - sz, vw + sz * 2);
        const y = wrapIn(i * 577 + sin(t * 0.1 + i) * 60, v.y0 - sz, vh + sz * 2);
        softAt(ctx, x, y, sz, pal.fog, b.fogA * (0.6 + 0.4 * sin(t * 0.2 + i)));
      }
    }

    // edge fog over entities
    const cx = SK.cam.x, cy = SK.cam.y;
    const vr = hypot(vw, vh) / 2 + 60;
    if (hypot(cx, cy) + vr > ARENA_R - 120) {
      const gr = ctx.createRadialGradient(0, 0, ARENA_R - 110, 0, 0, ARENA_R + 40);
      gr.addColorStop(0, U.rgba(pal.fog, 0));
      gr.addColorStop(1, U.rgba(pal.fog, 0.55));
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.fillRect(v.x0 - 60, v.y0 - 60, vw + 120, vh + 120);
    }

    // darkness around the player
    if (b.darkness > 0) {
      const ox = P ? P.x : cx, oy = P ? P.y : cy;
      const rr = hypot(vw, vh) * 0.62 + hypot(ox - cx, oy - cy);
      ctx.globalAlpha = b.darkness;
      ctx.drawImage(getDark(), ox - rr, oy - rr, rr * 2, rr * 2);
    }

    // portal
    if (portal) {
      if (SK.cam.inView(portal.x, portal.y, portal.r * 3)) drawPortal(ctx, t, q);
      if (!portal.entered) drawPortalArrow(ctx, t);
    }
    ctx.restore();
  }

  /* ================================================================ minimap */
  const MM = { radius: ARENA_R, player: null, portal: null, boss: null, biome: null, progress: 0, bossIn: 0, elites: [] };
  function minimapData(G) {
    G = G || SK.G || EMPTY;
    const bi = clampN(G.biome | 0, 0, 3), b = biomes[bi];
    MM.player = G.player || null;
    MM.portal = portal;
    MM.boss = G.boss && !G.boss.dead ? G.boss : null;
    MM.biome = b;
    MM.progress = clampN((G.biomeT || 0) / b.duration, 0, 1);
    MM.bossIn = max(0, b.duration - (G.biomeT || 0));
    MM.elites.length = 0;
    const E = G.enemies;
    if (E) for (let i = 0; i < E.length && MM.elites.length < 8; i++) { const m = E[i]; if (m && !m.dead && (m.elite || m.passive)) MM.elites.push(m); }
    return MM;
  }

  /* ================================================================ export */
  SK.World = {
    biomes,
    radius: ARENA_R,
    startBiome,
    update,
    spawnPickup,
    dropLoot,
    spawnPortal,
    renderBackground,
    renderPickups,
    renderForeground,
    minimapData,
    clamp,
    absorbRadius,
    get portal() { return portal; },
    prewarm(i) { ensureAssets(i == null ? 0 : i); ensurePK(); },
    reset() {
      portal = null;
      D.bi = -1; D.G = null;
      hintedWanderer = false;
    },
  };
})(window.SK);
