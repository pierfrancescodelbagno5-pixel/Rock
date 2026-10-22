/* Slime Reborn — Terre Spezzate: dungeon3d.js
 * "Torre dei Mille Piani": a colossal tower outside the east gate of Altheria and a procedural tower dungeon.
 * Floors are generated (seeded by floor number) inside the pocket area x,z in [3000, 3600]: rooms + corridors on a grid,
 * torch-lit stone halls, traps (spike plates, swinging blades, fire jets), treasure chests (and mimics), monster packs and
 * elites scaled by floor, a sealed portal to the next floor, a return crystal and a floor guardian every 5 floors.
 * Plugin for game3d.js (see docs/PLUGIN3D.md). Cross-module calls (API.rpg, quests) are always guarded. */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE;
  const SK = window.SK || {};
  const { P, S, scene, camera, emit, sfx, hdr, std, mesh, pivot, sph, coneG, cap, BOX, rand, lerp, clamp, angDiff, TAU } = API;
  const LOW = API.quality === 'low', HIGH = API.quality === 'high';
  const $ = (id) => document.getElementById(id);
  const toast = (t) => API.toast(t);
  const oracle = (t, gold) => { if (typeof API.oracle === 'function') API.oracle(t, gold); else setTimeout(() => API.toast(t), 400); };
  const music = (n) => { try { API.music(n); } catch (e) { /* audio optional */ } };
  const evt = (n, d) => { try { if (SK.events) SK.events.emit(n, d); } catch (e) { console.error(e); } };
  const dmgNum = (x, y, z, v, cls) => { if (typeof API.dmgNum === 'function') API.dmgNum(x, y, z, v, cls); };
  const fmt = (n) => Math.floor(n).toLocaleString('it-IT');

  /* ================================================================ constants */
  const TOWER = { x: 194, z: 470, ix: 175.5, iz: 470 };
  const CS = 3, GW = 56, GH = 56, OX = 3080, OZ = 3080, WH = 5.6;
  const POCKET = {
    contains: (x, z) => x >= 3000 && x <= 3600 && z >= 3000 && z <= 3600,
    h: 0,
    heightAt: () => 0,
  };
  const inPocket = (x, z) => POCKET.contains(x, z);
  const THEMES = [
    { id: 'crypt', name: 'Cripta delle Ossa Silenti', wall: '#7a7064', cap: '#4a433b', floor: '#6d655a', under: '#07060a', fog: '#0b0a0e', dens: 0.03,
      hemiSky: '#5a6080', hemiGround: '#1c150e', hemi: 0.7, lantern: '#ffd8a8', sun: '#8c9ac0', sunI: 0.3, flame: '#ff8a2a', light: '#ff9a48', dust: '#d8c8a8', accent: '#ffb060',
      music: 'cave', mobs: ['soldier', 'bat', 'spider', 'knight'], banner: '#5a1820' },
    { id: 'crystal', name: 'Caverne di Cristallo', wall: '#5e5480', cap: '#352e4c', floor: '#5a5474', under: '#06050c', fog: '#0a0816', dens: 0.026,
      hemiSky: '#6070b0', hemiGround: '#140c22', hemi: 0.75, lantern: '#c8e8ff', sun: '#9fb0ff', sunI: 0.3, flame: '#4ff0ff', light: '#5fd8ff', dust: '#a8e8ff', accent: '#d070ff',
      music: 'cave', mobs: ['spider', 'bat', 'viper', 'knight'], banner: '#2a2a6a' },
    { id: 'forge', name: 'Forgia di Lava', wall: '#4a3f3a', cap: '#2a2220', floor: '#4c423d', under: '#0c0504', fog: '#160806', dens: 0.026,
      hemiSky: '#a0503a', hemiGround: '#1a0a06', hemi: 0.65, lantern: '#ffc890', sun: '#ff9a70', sunI: 0.22, flame: '#ff5a1a', light: '#ff6a2a', dust: '#ff9a4a', accent: '#ff4a10',
      music: 'volcano', mobs: ['flame', 'soldier', 'knight', 'wolf'], banner: '#3a1a10' },
    { id: 'frost', name: 'Sale Congelate', wall: '#a8bcd0', cap: '#7f96ac', floor: '#b4c6d6', under: '#081018', fog: '#0c1624', dens: 0.026,
      hemiSky: '#9fc0e8', hemiGround: '#1a2230', hemi: 0.7, lantern: '#e0f0ff', sun: '#cfe4ff', sunI: 0.35, flame: '#8fd8ff', light: '#9fd0ff', dust: '#ffffff', accent: '#bfefff',
      music: 'cave', mobs: ['wolf', 'knight', 'bat', 'soldier'], banner: '#1a3a5a' },
    { id: 'void', name: 'Santuario del Vuoto', wall: '#3a3048', cap: '#1e1828', floor: '#3a3246', under: '#05020a', fog: '#0a0412', dens: 0.03,
      hemiSky: '#7a50b0', hemiGround: '#100818', hemi: 0.65, lantern: '#e0c8ff', sun: '#c0a0ff', sunI: 0.25, flame: '#c04dff', light: '#b060ff', dust: '#d0a0ff', accent: '#ff3bd0',
      music: 'demon', mobs: ['knight', 'flame', 'spider', 'viper', 'bat'], banner: '#3a0a4a' },
  ];
  for (const th of THEMES) { th.fogC = new T.Color(th.fog); th.hemiSkyC = new T.Color(th.hemiSky); th.hemiGroundC = new T.Color(th.hemiGround); th.sunC = new T.Color(th.sun); }
  const themeOf = (f) => THEMES[Math.floor((f - 1) / 5) % THEMES.length];
  const floorLevel = (f) => clamp(Math.round(4 + f * 1.6), 1, 99);
  const BOSSES = ['tw_lich', 'tw_golem', 'tw_minotaur', 'tw_wyrm', 'tw_herald'];
  const bossOf = (f) => BOSSES[(Math.floor(f / 5) - 1) % BOSSES.length];
  const RAR = [
    { n: 'comune', c: '#e8d4a0', glow: 0.7, wood: '#6b4a2c', metal: '#5a5650' },
    { n: 'raro', c: '#4fa8ff', glow: 1.3, wood: '#4a3a2c', metal: '#7a8aa0' },
    { n: 'epico', c: '#c04dff', glow: 1.8, wood: '#3a2a3a', metal: '#8a6ab0' },
    { n: 'leggendario', c: '#ffb020', glow: 2.6, wood: '#3a2a1a', metal: '#d4a640' },
  ];

  /* ================================================================ persistent state */
  function TS() {
    if (!S.tower || typeof S.tower !== 'object') S.tower = {};
    const t = S.tower;
    if (!(t.best >= 0)) t.best = 0;
    if (!(t.checkpoint >= 1)) t.checkpoint = 1;
    if (!t.bosses || typeof t.bosses !== 'object') t.bosses = {};
    return t;
  }

  /* ================================================================ helpers */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vn(x, y, w) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (i, j) => hash2(((i % w) + w) % w, ((j % w) + w) % w);
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  }
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _s = new T.Vector3(), _c = new T.Color(), _v2 = new T.Vector3();
  function M4(x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
    return new T.Matrix4().compose(new T.Vector3(x, y, z), _q.clone(), new T.Vector3(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
  }
  // merge a list of [geometry, matrix] into one non-indexed geometry (position, normal, uv)
  function merge(list) {
    let n = 0;
    const parts = list.map(([g, m]) => { const ng = g.index ? g.toNonIndexed() : g.clone(); if (m) ng.applyMatrix4(m); n += ng.attributes.position.count; return ng; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count; g.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3)); out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  function canvasTex(N, draw, repeat) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    draw(c.getContext('2d'), N);
    const t = new T.CanvasTexture(c);
    if (repeat !== false) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }
  // bake an albedo + normal map pair from a height/albedo function fn(u, v, out) → out.h, out.a
  function bake(N, fn, normK) {
    const H = new Float32Array(N * N), A = new Float32Array(N * N), out = { h: 0, a: 0 };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { fn((x + 0.5) / N, (y + 0.5) / N, out); H[y * N + x] = out.h; A[y * N + x] = out.a; }
    const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N); fill(im.data); x.putImageData(im, 0, 0); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t; };
    const map = mk((d) => { for (let i = 0; i < N * N; i++) { const g = clamp(A[i], 0, 1) * 255; d[i * 4] = g; d[i * 4 + 1] = g * 0.98; d[i * 4 + 2] = g * 0.95; d[i * 4 + 3] = 255; } });
    map.colorSpace = T.SRGBColorSpace;
    let normal = null;
    if (!LOW) normal = mk((d) => {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
        const nx = -hx * normK, ny = -hy * normK, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4;
        d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (ny / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
      }
    });
    return { map, normal };
  }

  /* ================================================================ shared textures, geometries, materials */
  const TX = {}, GEO = {}, MAT = {};
  function buildShared() {
    const N = LOW ? 128 : 256;
    // stone bricks (walls)
    TX.brick = bake(N, (u, v, o) => {
      const rows = 4, row = Math.floor(v * rows), off = (row % 2) * 0.5, bu = u * 2 + off, col = Math.floor(bu), fu = bu - col, fv = v * rows - row;
      const d = Math.min(Math.min(fu, 1 - fu) * 0.5, Math.min(fv, 1 - fv) / rows);
      const n = vn(u * 16, v * 16, 16) * 0.6 + vn(u * 48, v * 48, 48) * 0.4;
      const cw = ((col % 2) + 2) % 2, tone = 0.72 + 0.32 * hash2(cw * 3.1 + 1, row * 7.7 + 2);
      const bev = sstep(0.01, 0.03, d);
      const chip = vn(u * 24 + 3, v * 24 + 5, 24) > 0.78 ? 0.25 : 0;
      o.h = bev * (0.7 + 0.3 * n) - chip * 0.4;
      o.a = d < 0.01 ? 0.28 + n * 0.1 : tone * (0.78 + 0.3 * n) * (0.75 + 0.25 * bev) - chip * 0.25;
    }, 3.5);
    // flagstones (floors): 2x2 irregular stones per tile
    TX.flag = bake(N, (u, v, o) => {
      const j = (vn(u * 10, v * 10, 10) - 0.5) * 0.05;
      const su = u * 2 + j, sv = v * 2 - j, cu = Math.floor(su), cv = Math.floor(sv), fu = su - cu, fv = sv - cv;
      const d = Math.min(fu, 1 - fu, fv, 1 - fv) * 0.5;
      const n = vn(u * 12, v * 12, 12) * 0.5 + vn(u * 40, v * 40, 40) * 0.35 + vn(u * 96, v * 96, 96) * 0.15;
      const tone = 0.7 + 0.3 * hash2(((cu % 2) + 2) % 2 + 4, ((cv % 2) + 2) % 2 + 9);
      const crack = Math.abs(vn(u * 6 + 11, v * 6 + 3, 6) - 0.5) < 0.012 ? 1 : 0;
      const bev = sstep(0.008, 0.03, d);
      o.h = bev * (0.75 + 0.25 * n) - crack * 0.3;
      o.a = d < 0.008 ? 0.22 : tone * (0.72 + 0.36 * n) * (0.8 + 0.2 * bev) * (1 - crack * 0.45);
    }, 3);
    // glyph strip for runes (tower bands, floor circles)
    TX.runes = canvasTex(512, (x, N) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
      x.strokeStyle = '#fff'; x.lineCap = 'round';
      const R = rng(77);
      for (let i = 0; i < 24; i++) {
        const cx = (i + 0.5) * (N / 24), cy = N / 2;
        x.lineWidth = 3 + R() * 2; x.beginPath();
        for (let k = 0; k < 4; k++) { const a = R() * TAU, b = R() * TAU, r = 6 + R() * 8; x.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.6); x.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r * 1.6); }
        x.stroke();
        if (R() < 0.5) { x.beginPath(); x.arc(cx, cy, 3 + R() * 4, 0, TAU); x.stroke(); }
      }
      x.fillStyle = '#fff'; x.fillRect(0, N / 2 - 30, N, 2); x.fillRect(0, N / 2 + 28, N, 2);
    });
    TX.runes.repeat.set(1, 1);
    // swirling portal
    TX.swirl = canvasTex(128, (x, N) => {
      const c = N / 2; x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
      const g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(180,180,255,.55)'); g.addColorStop(0.85, 'rgba(60,60,120,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, N, N);
      x.globalCompositeOperation = 'lighter';
      for (let arm = 0; arm < 5; arm++) for (let i = 0; i < 80; i++) {
        const t = i / 80, a = arm * TAU / 5 + t * 5.2, r = t * c * 0.96;
        x.fillStyle = `rgba(255,255,255,${((1 - t) * 0.3).toFixed(3)})`;
        x.beginPath(); x.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1.5 + (1 - t) * 5, 0, TAU); x.fill();
      }
    }, false);
    TX.swirl.center.set(0.5, 0.5);
    TX.ring = canvasTex(256, (x, N) => { // magic circle
      const c = N / 2; x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.strokeStyle = '#fff';
      x.lineWidth = 4; x.beginPath(); x.arc(c, c, c - 6, 0, TAU); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(c, c, c - 22, 0, TAU); x.stroke();
      x.beginPath(); x.arc(c, c, c * 0.42, 0, TAU); x.stroke();
      for (let k = 0; k < 2; k++) { x.beginPath(); for (let i = 0; i <= 3; i++) { const a = k * Math.PI / 3 + i * TAU / 3 - Math.PI / 2; const px = c + Math.cos(a) * (c - 22), py = c + Math.sin(a) * (c - 22); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
      const R = rng(5); x.lineWidth = 2;
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = c - 14; const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r; x.beginPath(); x.moveTo(px - 4 + R() * 8, py - 4); x.lineTo(px + 4 - R() * 8, py + 4); x.stroke(); }
    }, false);

    // geometries
    const wall = new T.BoxGeometry(CS, WH, CS); wall.translate(0, WH / 2, 0);
    { const uv = wall.attributes.uv; for (const f of [0, 1, 4, 5]) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setY(i, uv.getY(i) * WH / CS); } }
    GEO.wall = wall;
    GEO.cap = new T.BoxGeometry(CS * 1.06, 0.34, CS * 1.06); GEO.cap.translate(0, WH + 0.17, 0);
    GEO.plinth = new T.BoxGeometry(CS * 1.05, 0.42, CS * 1.05); GEO.plinth.translate(0, 0.21, 0);
    GEO.tile = new T.BoxGeometry(CS * 0.985, 0.3, CS * 0.985); GEO.tile.translate(0, -0.15, 0);
    GEO.pillar = merge([
      [new T.CylinderGeometry(0.6, 0.68, WH - 0.9, 10), M4(0, WH / 2, 0)],
      [new T.BoxGeometry(1.55, 0.5, 1.55), M4(0, 0.25, 0)], [new T.BoxGeometry(1.3, 0.25, 1.3), M4(0, 0.62, 0)],
      [new T.BoxGeometry(1.55, 0.45, 1.55), M4(0, WH - 0.22, 0)], [new T.BoxGeometry(1.3, 0.22, 1.3), M4(0, WH - 0.55, 0)],
    ]);
    GEO.broken = merge([[new T.CylinderGeometry(0.6, 0.68, 2.2, 10), M4(0, 1.1, 0, 0.06, 0, 0.04)], [new T.BoxGeometry(1.55, 0.5, 1.55), M4(0, 0.25, 0)]]);
    GEO.torch = merge([
      [new T.BoxGeometry(0.34, 0.6, 0.08), M4(0, 0, 0.04)],
      [new T.BoxGeometry(0.08, 0.08, 0.5), M4(0, -0.05, 0.28, -0.5, 0, 0)],
      [new T.CylinderGeometry(0.16, 0.08, 0.24, 8), M4(0, 0.16, 0.5)],
      [new T.TorusGeometry(0.16, 0.025, 4, 10), M4(0, 0.27, 0.5, Math.PI / 2, 0, 0)],
    ]);
    GEO.flame = new T.ConeGeometry(0.13, 0.5, 6); GEO.flame.translate(0, 0.25, 0);
    GEO.brazier = merge([
      [new T.CylinderGeometry(0.75, 0.42, 0.55, 10), M4(0, 1.15, 0)], [new T.TorusGeometry(0.75, 0.06, 4, 14), M4(0, 1.42, 0, Math.PI / 2, 0, 0)],
      [new T.CylinderGeometry(0.07, 0.1, 1.0, 5), M4(0.35, 0.45, 0, 0, 0, 0.25)], [new T.CylinderGeometry(0.07, 0.1, 1.0, 5), M4(-0.18, 0.45, 0.3, -0.22, 0, -0.12)],
      [new T.CylinderGeometry(0.07, 0.1, 1.0, 5), M4(-0.18, 0.45, -0.3, 0.22, 0, -0.12)], [new T.CylinderGeometry(0.5, 0.6, 0.12, 10), M4(0, 0.06, 0)],
    ]);
    GEO.rubble = new T.DodecahedronGeometry(0.5, 0);
    GEO.bone = new T.CapsuleGeometry(0.05, 0.42, 2, 5);
    GEO.skull = merge([[new T.SphereGeometry(0.17, 8, 6), M4(0, 0.17, 0, 0, 0, 0, 1, 0.92, 1.1)], [new T.BoxGeometry(0.16, 0.08, 0.14), M4(0, 0.06, 0.1)]]);
    GEO.sarco = merge([[new T.BoxGeometry(1.2, 0.8, 2.4), M4(0, 0.4, 0)], [new T.BoxGeometry(1.32, 0.2, 2.55), M4(0, 0.9, 0)], [new T.BoxGeometry(0.9, 0.16, 1.9), M4(0, 1.08, 0)], [new T.SphereGeometry(0.22, 8, 6), M4(0, 1.15, -0.75, 0, 0, 0, 1, 0.6, 1)]]);
    GEO.crystal = new T.OctahedronGeometry(0.5, 0);
    GEO.anvil = merge([[new T.BoxGeometry(0.6, 0.5, 0.5), M4(0, 0.25, 0)], [new T.BoxGeometry(0.4, 0.3, 0.35), M4(0, 0.62, 0)], [new T.BoxGeometry(1.2, 0.28, 0.5), M4(0.1, 0.88, 0)], [new T.ConeGeometry(0.22, 0.5, 4), M4(0.88, 0.88, 0, 0, 0, -Math.PI / 2, 1, 1, 0.8)]]);
    GEO.icicle = new T.ConeGeometry(0.18, 1.2, 5); GEO.icicle.rotateX(Math.PI); GEO.icicle.translate(0, -0.6, 0);
    GEO.mound = new T.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2);
    GEO.obelisk = merge([[new T.BoxGeometry(0.8, 3.2, 0.8), M4(0, 1.6, 0)], [new T.ConeGeometry(0.58, 0.8, 4), M4(0, 3.6, 0, 0, Math.PI / 4, 0)], [new T.BoxGeometry(1.2, 0.3, 1.2), M4(0, 0.15, 0)]]);
    GEO.banner = new T.PlaneGeometry(1.3, 2.6, 1, 3); GEO.banner.translate(0, -1.3, 0);
    GEO.bannerRod = new T.CylinderGeometry(0.05, 0.05, 1.6, 5); GEO.bannerRod.rotateZ(Math.PI / 2);
    GEO.disc = new T.CircleGeometry(1, 32);
    GEO.lavaCrack = new T.BoxGeometry(1, 0.04, 1);
    GEO.plate = merge([[new T.BoxGeometry(2.7, 0.1, 2.7), M4(0, 0.05, 0)], [new T.BoxGeometry(2.4, 0.04, 0.12), M4(0, 0.11, -0.6)], [new T.BoxGeometry(2.4, 0.04, 0.12), M4(0, 0.11, 0.6)], [new T.BoxGeometry(0.12, 0.04, 2.4), M4(-0.6, 0.11, 0)], [new T.BoxGeometry(0.12, 0.04, 2.4), M4(0.6, 0.11, 0)]]);
    { const l = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) l.push([new T.ConeGeometry(0.12, 1.1, 5), M4(-0.9 + i * 0.6, 0.55, -0.9 + j * 0.6)]); GEO.spikes = merge(l); }
    GEO.chestBody = merge([[new T.BoxGeometry(1.4, 0.72, 0.92), M4(0, 0.36, 0)]]);
    GEO.chestLid = merge([[new T.BoxGeometry(1.4, 0.18, 0.92), M4(0, 0.09, 0.46)], [new T.CylinderGeometry(0.46, 0.46, 1.4, 10, 1, false, 0, Math.PI), M4(0, 0.18, 0.46, 0, 0, Math.PI / 2, 1, 0.55, 1)]]);
    GEO.chestBands = merge([
      [new T.BoxGeometry(0.12, 0.76, 0.96), M4(-0.5, 0.38, 0)], [new T.BoxGeometry(0.12, 0.76, 0.96), M4(0.5, 0.38, 0)],
      [new T.BoxGeometry(1.44, 0.08, 0.96), M4(0, 0.06, 0)], [new T.BoxGeometry(0.3, 0.32, 0.06), M4(0, 0.5, 0.48)],
    ]);
    GEO.lidBands = merge([[new T.BoxGeometry(0.12, 0.45, 0.96), M4(-0.5, 0.22, 0.46)], [new T.BoxGeometry(0.12, 0.45, 0.96), M4(0.5, 0.22, 0.46)]]);
    GEO.ringFlat = new T.RingGeometry(0.85, 1, 40); GEO.ringFlat.rotateX(-Math.PI / 2);
    GEO.gateWall = new T.PlaneGeometry(CS, 6.5); GEO.gateWall.translate(0, 3.25, 0);

    // materials (colours are re-tinted per theme)
    const tune = (m) => { m.envMapIntensity = 0.25; return m; };
    MAT.wall = tune(new T.MeshStandardMaterial({ color: '#ffffff', map: TX.brick.map, normalMap: TX.brick.normal, normalScale: new T.Vector2(1.2, 1.2), roughness: 0.92, metalness: 0.02 }));
    MAT.cap = tune(new T.MeshStandardMaterial({ color: '#ffffff', map: TX.brick.map, roughness: 0.95, metalness: 0.02 }));
    MAT.floor = tune(new T.MeshStandardMaterial({ color: '#ffffff', map: TX.flag.map, normalMap: TX.flag.normal, normalScale: new T.Vector2(1, 1), roughness: 0.88, metalness: 0.04 }));
    MAT.pillar = tune(new T.MeshStandardMaterial({ color: '#ffffff', map: TX.brick.map, normalMap: TX.brick.normal, roughness: 0.9, metalness: 0.02 }));
    MAT.under = new T.MeshBasicMaterial({ color: '#050407' });
    MAT.iron = std('#3c3a3a', 0.45, 0.85);
    MAT.flame = new T.MeshBasicMaterial({ color: hdr('#ff8a2a', 3) });
    MAT.rubble = std('#6a6258', 0.95, 0);
    MAT.bone = std('#d8cfb8', 0.7, 0);
    MAT.sarco = std('#8a8274', 0.85, 0.05);
    MAT.crystalA = std('#7ff0ff', 0.12, 0.25, { emissive: hdr('#2fb8ff', 1.3), transparent: true, opacity: 0.9 });
    MAT.crystalB = std('#e0a0ff', 0.12, 0.25, { emissive: hdr('#b04dff', 1.3), transparent: true, opacity: 0.9 });
    MAT.anvil = std('#2c2a2a', 0.35, 0.9);
    MAT.lava = new T.MeshBasicMaterial({ color: hdr('#ff5a10', 2.6) });
    MAT.lavaPool = new T.MeshBasicMaterial({ color: hdr('#ff6a1a', 2.2) });
    MAT.ice = std('#cfefff', 0.08, 0.1, { transparent: true, opacity: 0.85, emissive: hdr('#5fb0e0', 0.25) });
    MAT.snow = std('#f2f7ff', 0.9, 0);
    MAT.obelisk = std('#1c1426', 0.3, 0.6, { emissive: hdr('#4a1070', 0.25) });
    MAT.shard = new T.MeshBasicMaterial({ color: hdr('#c04dff', 2.2) });
    MAT.banner = std('#5a1820', 0.95, 0, { side: T.DoubleSide });
    MAT.rune = new T.MeshBasicMaterial({ map: TX.ring, color: hdr('#c04dff', 1.6), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    MAT.plate = std('#3a3634', 0.5, 0.8, { emissive: new T.Color(0, 0, 0) });
    MAT.spike = std('#b8bcc4', 0.25, 0.95);
    MAT.gate = new T.MeshBasicMaterial({ color: hdr('#ffe6b0', 0.9), transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    MAT.glowPts = API.pointMat(true);
  }

  /* ================================================================ runtime state */
  const D = {
    inside: false, busy: false, floor: 0, kills: 0, total: 0, need: 0, unlocked: false, gate: false, boss: null, bossDead: false,
    prevPocket: null, saved: null, titleT: 0, time: 0, deadH: false, proxT: 0, flowT: 0, exploreT: 0, miniT: 0, lavaT: 0, camPull: 0, seenDirty: true,
    lights: [], lightT: 0, mobs: [], hudKey: '', bigMini: false, healOnce: false,
  };
  let F = null; // current floor
  let ENV = null; // engine scene objects we hide/override

  /* ================================================================ grid helpers */
  const idx = (cx, cy) => cy * GW + cx;
  const inb = (cx, cy) => cx >= 0 && cy >= 0 && cx < GW && cy < GH;
  const wx = (cx) => OX + (cx + 0.5) * CS;
  const wz = (cy) => OZ + (cy + 0.5) * CS;
  const cxOf = (x) => Math.floor((x - OX) / CS);
  const cyOf = (z) => Math.floor((z - OZ) / CS);
  function open(cx, cy) { return !!F && inb(cx, cy) && F.grid[idx(cx, cy)] > 0 && !F.block[idx(cx, cy)]; }
  const QUEUE = new Int32Array(GW * GH);
  function bfs(dist, sx, sy) {
    dist.fill(-1);
    if (!inb(sx, sy) || !F.grid[idx(sx, sy)]) return;
    let h = 0, t = 0; const s = idx(sx, sy); QUEUE[t++] = s; dist[s] = 0;
    while (h < t) {
      const i = QUEUE[h++], x = i % GW, d = dist[i] + 1;
      if (x > 0 && F.grid[i - 1] && !F.block[i - 1] && dist[i - 1] < 0) { dist[i - 1] = d; QUEUE[t++] = i - 1; }
      if (x < GW - 1 && F.grid[i + 1] && !F.block[i + 1] && dist[i + 1] < 0) { dist[i + 1] = d; QUEUE[t++] = i + 1; }
      if (i >= GW && F.grid[i - GW] && !F.block[i - GW] && dist[i - GW] < 0) { dist[i - GW] = d; QUEUE[t++] = i - GW; }
      if (i < GW * (GH - 1) && F.grid[i + GW] && !F.block[i + GW] && dist[i + GW] < 0) { dist[i + GW] = d; QUEUE[t++] = i + GW; }
    }
  }
  // push a circle (o.x, o.z, radius r) out of solid cells and pillars
  function pushOut(o, r) {
    const cx0 = cxOf(o.x - r), cx1 = cxOf(o.x + r), cy0 = cyOf(o.z - r), cy1 = cyOf(o.z + r);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (open(cx, cy)) continue;
      const bx = OX + cx * CS, bz = OZ + cy * CS;
      const qx = clamp(o.x, bx, bx + CS), qz = clamp(o.z, bz, bz + CS);
      let dx = o.x - qx, dz = o.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        dx = o.x - (bx + CS / 2); dz = o.z - (bz + CS / 2);
        if (Math.abs(dx) > Math.abs(dz)) o.x = dx > 0 ? bx + CS + r : bx - r; else o.z = dz > 0 ? bz + CS + r : bz - r;
        continue;
      }
      const d = Math.sqrt(d2); o.x = qx + dx / d * r; o.z = qz + dz / d * r;
    }
    for (const c of F.circles) {
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { o.x = c.x + dx / d * m; o.z = c.z + dz / d * m; }
    }
  }
  function losClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.ceil(L / 0.8);
    for (let i = 1; i < n; i++) { const t = i / n; if (!open(cxOf(x0 + dx * t), cyOf(z0 + dz * t))) return false; }
    return true;
  }

  /* ================================================================ layout generation */
  function genLayout(f) {
    const R = rng(f * 92821 + 1337), boss = f % 5 === 0;
    const grid = new Uint8Array(GW * GH), rid = new Int16Array(GW * GH).fill(-1), rooms = [];
    const fits = (r) => {
      if (r.x < 2 || r.y < 2 || r.x + r.w > GW - 2 || r.y + r.h > GH - 2) return false;
      for (const o of rooms) if (r.x < o.x + o.w + 2 && r.x + r.w + 2 > o.x && r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y) return false;
      return true;
    };
    let arena = null, startI = 0;
    if (boss) {
      arena = { x: GW - 19, y: (GH >> 1) - 7, w: 15, h: 15, arena: true }; rooms.push(arena);
      rooms.push({ x: 3, y: (GH >> 1) - 3, w: 7, h: 7 }); startI = 1;
      for (let t = 0; t < 300 && rooms.length < 6; t++) { const w = 5 + ((R() * 4) | 0), h = 5 + ((R() * 4) | 0); const r = { x: 2 + ((R() * (arena.x - w - 6)) | 0), y: 2 + ((R() * (GH - h - 4)) | 0), w, h }; if (fits(r)) rooms.push(r); }
    } else {
      const want = 8 + Math.min(6, (f / 3) | 0);
      for (let t = 0; t < 600 && rooms.length < want; t++) {
        const w = 5 + ((R() * 6) | 0), h = 5 + ((R() * 6) | 0);
        const r = { x: 2 + ((R() * (GW - w - 4)) | 0), y: 2 + ((R() * (GH - h - 4)) | 0), w, h };
        if (fits(r)) rooms.push(r);
      }
      let mx = 1e9; rooms.forEach((r, i) => { if (r.x + r.w / 2 < mx) { mx = r.x + r.w / 2; startI = i; } });
    }
    rooms.forEach((r, i) => {
      r.i = i; r.cx = r.x + (r.w >> 1); r.cy = r.y + (r.h >> 1);
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[idx(x, y)] = 1; rid[idx(x, y)] = i; }
    });
    const carve = (x, y) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const cx = x + dx, cy = y + dy; if (cx > 0 && cy > 0 && cx < GW - 1 && cy < GH - 1 && !grid[idx(cx, cy)]) grid[idx(cx, cy)] = 2; } };
    const corridor = (a, b) => {
      let x = a.cx, y = a.cy;
      const sx = () => { while (x !== b.cx) { carve(x, y); x += Math.sign(b.cx - x); } };
      const sy = () => { while (y !== b.cy) { carve(x, y); y += Math.sign(b.cy - y); } };
      if (R() < 0.5) { sx(); sy(); } else { sy(); sx(); }
      carve(x, y);
    };
    const nodes = rooms.map((r, i) => i).filter((i) => !rooms[i].arena);
    const conn = [startI], rest = nodes.filter((i) => i !== startI), links = new Set();
    while (rest.length) {
      let bi = -1, bk = -1, bd = 1e9;
      for (const i of conn) for (let k = 0; k < rest.length; k++) { const j = rest[k], d = Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy); if (d < bd) { bd = d; bi = i; bk = k; } }
      const j = rest.splice(bk, 1)[0]; corridor(rooms[bi], rooms[j]); conn.push(j); links.add(bi + '-' + j); links.add(j + '-' + bi);
    }
    if (arena) {
      let bj = -1, bd = 1e9;
      for (const i of nodes) { const d = Math.abs(rooms[i].cx - arena.cx) + Math.abs(rooms[i].cy - arena.cy) * 1.5; if (d < bd) { bd = d; bj = i; } }
      const a = rooms[bj]; // straight corridor into the arena's west side, then L into the room
      corridor({ cx: arena.x + 1, cy: arena.cy }, a);
    } else {
      for (let k = 0, made = 0; k < 30 && made < 2; k++) {
        const i = nodes[(R() * nodes.length) | 0], j = nodes[(R() * nodes.length) | 0];
        if (i === j || links.has(i + '-' + j)) continue;
        if (Math.abs(rooms[i].cx - rooms[j].cx) + Math.abs(rooms[i].cy - rooms[j].cy) > 26) continue;
        corridor(rooms[i], rooms[j]); links.add(i + '-' + j); links.add(j + '-' + i); made++;
      }
    }
    return { R, boss, grid, rid, rooms, arena, startI };
  }

  /* ================================================================ floor building */
  function disposeFloor() {
    if (!F) return;
    for (const e of D.mobs) removeEnemy(e);
    D.mobs.length = 0;
    scene.remove(F.group);
    F.group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.userData.ownGeo && o.geometry) o.geometry.dispose();
      if (o.userData.ownMat && o.material) o.material.dispose();
    });
    if (F.glow) { F.glow.geometry.dispose(); }
    if (F.dust) { F.dust.geometry.dispose(); }
    F = null;
  }
  function removeEnemy(e) {
    const i = API.enemies.indexOf(e);
    if (i >= 0) API.enemies.splice(i, 1);
    if (e.model && e.model.root) scene.remove(e.model.root);
    if (e.bar) scene.remove(e.bar.bg, e.bar.fg);
    if (API.input && API.input.lock === e) API.input.lock = null;
  }
  function inst(geo, mat, list, cast, recv) {
    if (!list.length) return null;
    const im = new T.InstancedMesh(geo, mat, list.length);
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      _e.set(it.rx || 0, it.ry || 0, it.rz || 0); _q.setFromEuler(_e);
      _m4.compose(_v.set(it.x, it.y, it.z), _q, _s.set(it.sx == null ? 1 : it.sx, it.sy == null ? 1 : it.sy, it.sz == null ? 1 : it.sz));
      im.setMatrixAt(i, _m4);
      const c = it.c == null ? 1 : it.c;
      if (typeof c === 'number') _c.setRGB(c, c, c); else _c.set(c);
      im.setColorAt(i, _c);
    }
    im.castShadow = cast !== false; im.receiveShadow = recv !== false;
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    if (im.computeBoundingSphere) im.computeBoundingSphere();
    F.group.add(im);
    return im;
  }
  // things mounted on a wall (torches, banners, icicles) disappear while that wall is cut away for the camera
  function attach(im, list) {
    if (!im) return;
    for (let i = 0; i < list.length; i++) {
      const wi = list[i].wi; if (wi == null || wi < 0) continue;
      const m = new T.Matrix4(); im.getMatrixAt(i, m);
      (F.attach[wi] || (F.attach[wi] = [])).push({ im, i, m });
    }
  }
  function addMesh(geo, mat, x, y, z, ry, own) {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry || 0;
    m.castShadow = true; m.receiveShadow = true;
    if (own) { m.userData.ownGeo = !!own.geo; m.userData.ownMat = !!own.mat; }
    F.group.add(m); return m;
  }
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function buildFloor(f) {
    disposeFloor();
    const L = genLayout(f), R = L.R, TH = themeOf(f);
    F = { f, TH, wallIdx: new Int32Array(GW * GH).fill(-1), attach: {}, grid: L.grid, rid: L.rid, rooms: L.rooms, arena: L.arena, boss: L.boss, block: new Uint8Array(GW * GH), seen: new Uint8Array(GW * GH),
      flow: new Int16Array(GW * GH), dist: new Int16Array(GW * GH), group: new T.Group(), circles: [], torches: [], traps: [], chests: [], spawns: [],
      packs: [], gates: [], lavas: [], dyn: [], shards: null, shardData: [], flames: null, flameData: [], used: new Uint8Array(GW * GH) };
    scene.add(F.group);
    const grid = F.grid, rooms = F.rooms;
    const start = rooms[L.startI];
    // distances from the start room: pick the exit (farthest) and the key room
    bfs(F.dist, start.cx, start.cy);
    let exit = null, key = null;
    if (F.boss) exit = F.arena;
    else {
      let bd = -1; for (const r of rooms) { const d = F.dist[idx(r.cx, r.cy)]; if (r !== start && d > bd) { bd = d; exit = r; } }
      let kd = -1; for (const r of rooms) { const d = F.dist[idx(r.cx, r.cy)]; if (r !== start && r !== exit && d > kd && d >= bd * 0.3) { kd = d; key = r; } }
      if (!key) key = rooms.find((r) => r !== start && r !== exit) || exit;
    }
    F.start = start; F.exit = exit; F.key = key;
    MAT.wall.color.set(TH.wall); MAT.cap.color.set(TH.cap); MAT.floor.color.set(TH.floor); MAT.pillar.color.set(TH.wall).multiplyScalar(1.05);
    MAT.under.color.set(TH.under); MAT.flame.color.copy(hdr(TH.flame, 3.2)); MAT.banner.color.set(TH.banner);
    MAT.rune.color.copy(hdr(TH.accent, 1.5));

    // --- floor tiles + walls
    const tiles = [], walls = [], caps = [], plinths = [];
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      const i = idx(cx, cy), x = wx(cx), z = wz(cy);
      if (grid[i]) {
        const h = hash2(cx * 1.7 + f, cy * 2.3);
        tiles.push({ x, y: (h - 0.5) * 0.04, z, ry: ((h * 4) | 0) * Math.PI / 2, rx: (hash2(cx, cy + f) - 0.5) * 0.012, rz: (hash2(cy, cx - f) - 0.5) * 0.012,
          c: 0.78 + 0.3 * hash2(cx + 0.3, cy + f * 0.7) - (grid[i] === 2 ? 0.08 : 0) });
        continue;
      }
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(cx + dx, cy + dy) && grid[idx(cx + dx, cy + dy)]) { edge = true; break; }
      if (!edge) continue;
      const h = hash2(cx * 3.1 + f, cy * 1.3), sy = 1 + (h - 0.5) * 0.14;
      const c = 0.82 + 0.26 * hash2(cx + 5.5, cy - 2.2);
      F.wallIdx[i] = walls.length;
      walls.push({ x, y: 0, z, sy, c, ry: ((h * 4) | 0) * Math.PI / 2 });
      caps.push({ x, y: (sy - 1) * WH, z, c: c * 0.9 });
      plinths.push({ x, y: 0, z, c: c * 0.8 });
    }
    inst(GEO.tile, MAT.floor, tiles, false, true);
    F.wallIM = inst(GEO.wall, MAT.wall, walls, true, true);
    F.capIM = inst(GEO.cap, MAT.cap, caps, true, true);
    F.wallList = walls; F.cut = new Float32Array(walls.length).fill(1); F.cutWant = new Uint8Array(walls.length); F.cutIn = new Uint8Array(walls.length); F.cutList = [];
    inst(GEO.plinth, MAT.cap, plinths, false, true);
    { const u = new T.Mesh(new T.PlaneGeometry(GW * CS + 40, GH * CS + 40), MAT.under); u.rotation.x = -Math.PI / 2; u.position.set(OX + GW * CS / 2, -0.3, OZ + GH * CS / 2); u.userData.ownGeo = true; F.group.add(u); }

    // --- pillars
    const pillars = [], broken = [];
    const markPillar = (cx, cy, br) => {
      if (!inb(cx, cy) || !grid[idx(cx, cy)]) return;
      const x = wx(cx), z = wz(cy);
      (br ? broken : pillars).push({ x, y: 0, z, ry: R() * TAU, c: 0.85 + R() * 0.2 });
      F.circles.push({ x, z, r: 0.8, h: br ? 2.4 : WH }); F.used[idx(cx, cy)] = 1;
    };
    for (const r of rooms) {
      if (r === start) continue;
      if (r.arena) {
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; markPillar(Math.round(r.cx + Math.cos(a) * 5.4), Math.round(r.cy + Math.sin(a) * 5.4), false); }
        continue;
      }
      if (r.w >= 8 && r.h >= 8) {
        const br = R() < 0.35;
        for (const [px, py] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) markPillar(px, py, br && R() < 0.5);
      } else if (r.w >= 7 && R() < 0.5) markPillar(r.cx, r.cy, true);
    }
    inst(GEO.pillar, MAT.pillar, pillars, true, true);
    inst(GEO.broken, MAT.pillar, broken, true, true);

    // --- torches on wall faces (and wall-face candidates for jets / banners)
    const faces = [];
    for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
      if (grid[idx(cx, cy)]) continue;
      for (const [dx, dy] of DIR4) {
        const nx = cx + dx, ny = cy + dy;
        if (!inb(nx, ny) || !grid[idx(nx, ny)]) continue;
        faces.push({ cx, cy, dx, dy, nx, ny, x: wx(cx) + dx * (CS / 2 + 0.02), z: wz(cy) + dy * (CS / 2 + 0.02), ry: Math.atan2(dx, dy), room: L.rid[idx(nx, ny)] });
      }
    }
    // shuffle deterministically
    for (let i = faces.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = faces[i]; faces[i] = faces[j]; faces[j] = t; }
    const torchList = [], maxT = LOW ? 46 : 72;
    for (const fc of faces) {
      if (torchList.length >= maxT) break;
      let ok = true;
      for (const t of F.torches) if (Math.abs(t.x - fc.x) < 8 && Math.abs(t.z - fc.z) < 8 && Math.hypot(t.x - fc.x, t.z - fc.z) < 8.5) { ok = false; break; }
      if (!ok) continue;
      fc.used = true;
      const y = 2.7, fx = fc.x + Math.sin(fc.ry) * 0.5, fz = fc.z + Math.cos(fc.ry) * 0.5;
      const wi = F.wallIdx[idx(fc.cx, fc.cy)];
      torchList.push({ x: fc.x, y, z: fc.z, ry: fc.ry, c: 1, wi });
      F.torches.push({ x: fx, y: y + 0.42, z: fz, col: TH.light, base: 1, ph: R() * 100, kind: 'torch', wi });
    }
    attach(inst(GEO.torch, MAT.iron, torchList, false, false), torchList);
    // braziers in the arena / start room
    const braz = [];
    const addBrazier = (x, z) => { braz.push({ x, y: 0, z, ry: R() * TAU, c: 1 }); F.torches.push({ x, y: 1.75, z, col: TH.light, base: 1.5, ph: R() * 100, kind: 'brazier' }); F.circles.push({ x, z, r: 0.8 }); };
    if (F.arena) {
      const a = F.arena;
      for (const [ox, oy] of [[1.5, 1.5], [a.w - 1.5, 1.5], [1.5, a.h - 1.5], [a.w - 1.5, a.h - 1.5], [a.w / 2, 1.2], [a.w / 2, a.h - 1.2], [a.w - 1.2, a.h / 2]]) addBrazier(OX + (a.x + ox) * CS, OZ + (a.y + oy) * CS);
      const rm = new T.MeshBasicMaterial({ map: TX.ring, color: hdr(TH.accent, 0.55), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      const ring = new T.Mesh(new T.PlaneGeometry(1, 1), rm); ring.rotation.x = -Math.PI / 2; ring.position.set(wx(a.cx), 0.04, wz(a.cy)); ring.scale.setScalar(a.w * CS * 0.62);
      ring.userData.ownGeo = true; ring.userData.ownMat = true; F.group.add(ring); F.arenaRing = ring;
    }
    addBrazier(wx(start.x) + 1, wz(start.y) + 1); addBrazier(wx(start.x + start.w - 1) - 1, wz(start.y + start.h - 1) - 1);
    inst(GEO.brazier, MAT.iron, braz, true, true);
    // --- banners on some unused faces in rooms
    const banners = [], rods = [];
    let nb = 0;
    for (const fc of faces) {
      if (nb >= 14) break;
      if (fc.used || fc.room < 0 || R() > 0.25) continue;
      fc.used = true; nb++;
      const x = fc.x + Math.sin(fc.ry) * 0.08, z = fc.z + Math.cos(fc.ry) * 0.08;
      const wi = F.wallIdx[idx(fc.cx, fc.cy)];
      banners.push({ x, y: 4.2, z, ry: fc.ry, c: 0.8 + R() * 0.3, wi }); rods.push({ x: x + Math.sin(fc.ry) * 0.05, y: 4.22, z: z + Math.cos(fc.ry) * 0.05, ry: fc.ry, c: 1, wi });
    }
    attach(inst(GEO.banner, MAT.banner, banners, false, true), banners);
    attach(inst(GEO.bannerRod, MAT.iron, rods, false, false), rods);

    // --- rubble and theme props
    const rubble = [], A = [], B = [], C = [];
    const freeCell = (r, edge) => { // random free floor cell of a room (edge: next to a wall)
      for (let k = 0; k < 30; k++) {
        const cx = r.x + ((R() * r.w) | 0), cy = r.y + ((R() * r.h) | 0), i = idx(cx, cy);
        if (F.used[i] || grid[i] !== 1) continue;
        const nearWall = !grid[idx(cx + 1, cy)] || !grid[idx(cx - 1, cy)] || !grid[idx(cx, cy + 1)] || !grid[idx(cx, cy - 1)];
        if (edge && !nearWall) continue;
        return { cx, cy, i };
      }
      return null;
    };
    for (const r of rooms) {
      const nr = 3 + ((R() * 6) | 0);
      for (let k = 0; k < nr; k++) { const c = freeCell(r, true); if (!c) continue; const s = 0.25 + R() * 0.6; rubble.push({ x: wx(c.cx) + rand(-1.2, 1.2), y: s * 0.25, z: wz(c.cy) + rand(-1.2, 1.2), sx: s, sy: s * 0.7, sz: s * 1.1, rx: R(), ry: R() * 6, c: 0.7 + R() * 0.4 }); }
    }
    for (let k = 0; k < 40; k++) { const cx = (R() * GW) | 0, cy = (R() * GH) | 0; if (grid[idx(cx, cy)] === 2) { const s = 0.2 + R() * 0.35; rubble.push({ x: wx(cx) + rand(-1, 1), y: s * 0.2, z: wz(cy) + rand(-1, 1), sx: s, sy: s * 0.6, sz: s, ry: R() * 6, c: 0.75 }); } }
    MAT.rubble.color.set(TH.wall).multiplyScalar(0.85);
    inst(GEO.rubble, MAT.rubble, rubble, true, true);
    const T_ = TH.id;
    for (const r of rooms) {
      if (r === start && T_ !== 'crystal') continue;
      if (T_ === 'crypt') {
        for (let k = 0; k < 4; k++) { const c = freeCell(r, false); if (!c) continue; const x = wx(c.cx), z = wz(c.cy); for (let b = 0; b < 4; b++) A.push({ x: x + rand(-0.8, 0.8), y: 0.06, z: z + rand(-0.8, 0.8), rx: Math.PI / 2, rz: R() * 6, c: 0.85 + R() * 0.2 }); B.push({ x: x + rand(-0.5, 0.5), y: 0, z: z + rand(-0.5, 0.5), ry: R() * 6, rx: -0.2, c: 0.9 }); }
        if (R() < 0.6 && r.w >= 6) { const c = freeCell(r, true); if (c) { const along = grid[idx(c.cx + 1, c.cy)] && grid[idx(c.cx - 1, c.cy)]; C.push({ x: wx(c.cx), y: 0, z: wz(c.cy), ry: along ? Math.PI / 2 : 0, c: 0.9 + R() * 0.15 }); F.used[c.i] = 1; F.circles.push({ x: wx(c.cx) + (along ? 0.8 : 0), z: wz(c.cy) + (along ? 0 : 0.8), r: 0.75 }, { x: wx(c.cx) - (along ? 0.8 : 0), z: wz(c.cy) - (along ? 0 : 0.8), r: 0.75 }); } }
      } else if (T_ === 'crystal') {
        for (let k = 0; k < 3; k++) {
          const c = freeCell(r, true); if (!c) continue; F.used[c.i] = 1;
          const x = wx(c.cx), z = wz(c.cy), magenta = R() < 0.4, list = magenta ? B : A;
          for (let s = 0; s < 5; s++) { const h = 0.8 + R() * 2.2; list.push({ x: x + rand(-0.9, 0.9), y: h * 0.42, z: z + rand(-0.9, 0.9), sx: 0.35 + R() * 0.3, sy: h, sz: 0.35 + R() * 0.3, rx: rand(-0.35, 0.35), rz: rand(-0.35, 0.35), ry: R() * 6, c: 0.8 + R() * 0.4 }); }
          F.circles.push({ x, z, r: 1.0 });
          F.torches.push({ x, y: 1.6, z, col: magenta ? '#d070ff' : '#5fe8ff', base: 0.9, ph: R() * 100, kind: 'crystal' });
        }
      } else if (T_ === 'forge') {
        if (R() < 0.6) { const c = freeCell(r, true); if (c) { A.push({ x: wx(c.cx), y: 0, z: wz(c.cy), ry: R() * 6, c: 1 }); F.used[c.i] = 1; F.circles.push({ x: wx(c.cx), z: wz(c.cy), r: 0.7 }); } }
        for (let k = 0; k < 5; k++) { const c = freeCell(r, false); if (!c) continue; B.push({ x: wx(c.cx) + rand(-1, 1), y: 0.02, z: wz(c.cy) + rand(-1, 1), sx: 0.12 + R() * 0.1, sz: 1.5 + R() * 2.5, ry: R() * 6, c: 0.7 + R() * 0.5 }); }
        if (r !== start && r.w >= 6 && r.h >= 6 && R() < 0.7) {
          const c = freeCell(r, true); if (c) { F.used[c.i] = 1; const rr = 1.1 + R() * 0.5; F.lavas.push({ x: wx(c.cx), z: wz(c.cy), r: rr }); const m = addMesh(GEO.disc, MAT.lavaPool, wx(c.cx), 0.03, wz(c.cy)); m.rotation.x = -Math.PI / 2; m.scale.setScalar(rr); m.castShadow = false; F.torches.push({ x: wx(c.cx), y: 0.8, z: wz(c.cy), col: '#ff5a10', base: 0.8, ph: R() * 100, kind: 'lava' }); }
        }
      } else if (T_ === 'frost') {
        for (let k = 0; k < 4; k++) { const c = freeCell(r, true); if (!c) continue; const s = 0.6 + R() * 0.9; B.push({ x: wx(c.cx) + rand(-1, 1), y: 0, z: wz(c.cy) + rand(-1, 1), sx: s * 1.4, sy: s * 0.45, sz: s, ry: R() * 6, c: 0.9 + R() * 0.1 }); }
        for (let k = 0; k < 2; k++) { const c = freeCell(r, true); if (!c) continue; F.used[c.i] = 1; const x = wx(c.cx), z = wz(c.cy); for (let s = 0; s < 4; s++) { const h = 0.8 + R() * 1.8; C.push({ x: x + rand(-0.8, 0.8), y: h * 0.42, z: z + rand(-0.8, 0.8), sx: 0.4, sy: h, sz: 0.4, rx: rand(-0.3, 0.3), rz: rand(-0.3, 0.3), ry: R() * 6, c: 1 }); } F.circles.push({ x, z, r: 0.9 }); }
      } else if (T_ === 'void') {
        if (r !== start && R() < 0.8) { const m = addMesh(GEO.ringFlat, MAT.rune, wx(r.cx), 0.05, wz(r.cy)); m.scale.setScalar(Math.min(r.w, r.h) * 1.2); m.castShadow = false; m.receiveShadow = false; F.shardData.push({ ring: m }); }
        if (R() < 0.6) { const c = freeCell(r, true); if (c) { A.push({ x: wx(c.cx), y: 0, z: wz(c.cy), ry: R() * 6, c: 1 }); F.used[c.i] = 1; F.circles.push({ x: wx(c.cx), z: wz(c.cy), r: 0.7 }); F.torches.push({ x: wx(c.cx), y: 3.7, z: wz(c.cy), col: '#ff3bd0', base: 0.6, ph: R() * 100, kind: 'obelisk' }); } }
        for (let k = 0; k < 3; k++) { const c = freeCell(r, false); if (!c) continue; B.push({ x: wx(c.cx) + rand(-1, 1), y: 1.5 + R() * 2.5, z: wz(c.cy) + rand(-1, 1), sx: 0.2 + R() * 0.3, sy: 0.6 + R() * 0.8, sz: 0.2 + R() * 0.3, ry: R() * 6, c: 0.7 + R() * 0.5, ph: R() * 10 }); }
      }
    }
    if (T_ === 'crypt') { inst(GEO.bone, MAT.bone, A, false, true); inst(GEO.skull, MAT.bone, B, true, true); inst(GEO.sarco, MAT.sarco, C, true, true); }
    else if (T_ === 'crystal') { inst(GEO.crystal, MAT.crystalA, A, true, true); inst(GEO.crystal, MAT.crystalB, B, true, true); }
    else if (T_ === 'forge') { inst(GEO.anvil, MAT.anvil, A, true, true); inst(GEO.lavaCrack, MAT.lava, B, false, false); }
    else if (T_ === 'frost') {
      inst(GEO.mound, MAT.snow, B, false, true); inst(GEO.crystal, MAT.ice, C, true, true);
      const ic = []; for (const fc of faces) if (R() < 0.4) for (let k = 0; k < 3; k++) { const lat = rand(-1.3, 1.3); ic.push({ x: fc.x + Math.sin(fc.ry) * 0.2 + Math.cos(fc.ry) * lat, y: WH - 0.05, z: fc.z + Math.cos(fc.ry) * 0.2 - Math.sin(fc.ry) * lat, sx: 0.6 + R() * 0.8, sy: 0.6 + R() * 1.4, sz: 0.6 + R() * 0.8, c: 1, wi: F.wallIdx[idx(fc.cx, fc.cy)] }); }
      attach(inst(GEO.icicle, MAT.ice, ic, false, false), ic);
    } else if (T_ === 'void') {
      inst(GEO.obelisk, MAT.obelisk, A, true, true);
      if (B.length) { F.shards = inst(GEO.crystal, MAT.shard, B, false, false); F.shardList = B; }
    }

    // --- spawn layout, chests, traps, portal, crystal
    planSpawns(f, R);
    planChests(f, R);
    planTraps(f, R);
    buildPortal();
    buildCrystal();
    if (F.arena) buildGate();
    buildFlames();
    // dust motes
    {
      const n = LOW ? 70 : 150, g = new T.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), dc = new T.Color(TH.dust);
      F.dustData = [];
      for (let i = 0; i < n; i++) { F.dustData.push({ x: P.x, y: -99, z: P.z, ph: R() * TAU, sp: 0.4 + R() * 0.8, k: 0.12 + R() * 0.2 }); col[i * 3] = dc.r; col[i * 3 + 1] = dc.g; col[i * 3 + 2] = dc.b; size[i] = 0.06 + R() * 0.1; }
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1));
      const pts = new T.Points(g, MAT.glowPts); pts.frustumCulled = false; F.group.add(pts); F.dust = pts; F.dustC = dc;
    }
    // start position: inside the start room, a few metres from the crystal
    // face toward the nearest room, standing beside the crystal (so it never blocks the camera)
    let tgt = rooms.find((r) => r !== start) || start, bd2 = 1e9;
    for (const r of rooms) { if (r === start) continue; const d = Math.hypot(r.cx - start.cx, r.cy - start.cy); if (d < bd2) { bd2 = d; tgt = r; } }
    const rot0 = Math.atan2(wx(tgt.cx) - wx(start.cx), wz(tgt.cy) - wz(start.cy));
    F.startPos = { x: F.crystal.x + Math.cos(rot0) * 3.4 + Math.sin(rot0) * 1.5, z: F.crystal.z - Math.sin(rot0) * 3.4 + Math.cos(rot0) * 1.5, rot: rot0 };
    F.flowCell = -1;
  }

  function buildFlames() {
    // flames (instanced, flickered near the player) + glow halos (one Points object) for every light source
    {
      const im = new T.InstancedMesh(GEO.flame, MAT.flame, F.torches.length);
      F.torches.forEach((t, i) => { const fl = t.kind === 'torch' || t.kind === 'brazier'; F.flameData.push({ x: t.x, y: t.y - (t.kind === 'brazier' ? 0.3 : 0.16), z: t.z, s: t.kind === 'brazier' ? 2.6 : 1 }); _m4.compose(_v.set(t.x, t.y, t.z), _q.identity(), _s.setScalar(fl ? 1 : 0)); im.setMatrixAt(i, _m4); });
      im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false;
      F.group.add(im); F.flames = im;
    }
    // glow halos (one Points object)
    {
      const n = F.torches.length, g = new T.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
      F.torches.forEach((t, i) => { pos[i * 3] = t.x; pos[i * 3 + 1] = t.y + 0.1; pos[i * 3 + 2] = t.z; size[i] = t.kind === 'brazier' ? 3.2 : t.kind === 'torch' ? 1.9 : t.kind === 'portal' ? 5 : 3.2; });
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1));
      const pts = new T.Points(g, MAT.glowPts); pts.frustumCulled = false; F.group.add(pts); F.glow = pts;
      F.glowCol = new T.Color(F.TH.flame);
    }

  }

  /* ---------------------------------------------------------------- monsters */
  function pickType(TH, f, R) {
    const list = TH.mobs.filter((t) => API.TYPES[t] && (t !== 'knight' || f >= 3));
    if (!list.length) return 'soldier';
    return list[(R() * list.length) | 0];
  }
  function planSpawns(f, R) {
    const TH = F.TH, Lv = floorLevel(f);
    let total = 0;
    const spot = (r) => {
      for (let k = 0; k < 20; k++) {
        const cx = r.x + 1 + ((R() * Math.max(1, r.w - 2)) | 0), cy = r.y + 1 + ((R() * Math.max(1, r.h - 2)) | 0);
        if (!F.used[idx(cx, cy)]) return { x: wx(cx) + rand(-0.8, 0.8), z: wz(cy) + rand(-0.8, 0.8) };
      }
      return { x: wx(r.cx), z: wz(r.cy) };
    };
    for (const r of F.rooms) {
      if (r === F.start || r.arena) continue;
      const pack = { room: r, x: wx(r.cx), z: wz(r.cy), spawned: false, list: [] };
      let n = 2 + ((R() * 2) | 0) + Math.min(2, (f / 7) | 0);
      if (r === F.key) n += 1;
      if (F.boss) n = Math.max(1, n - 2);
      const main = pickType(TH, f, R);
      for (let k = 0; k < n; k++) {
        const s = spot(r), type = R() < 0.6 ? main : pickType(TH, f, R);
        pack.list.push({ type, x: s.x, z: s.z, level: Lv + ((R() * 3) | 0) - 1, elite: false, seal: false, killed: false, e: null, count: true });
      }
      if (r === F.key) {
        const ng = f >= 8 ? 2 : 1;
        for (let k = 0; k < ng; k++) { const s = spot(r); pack.list.push({ type: f >= 3 && API.TYPES.knight ? 'knight' : main, x: s.x, z: s.z, level: Lv + 2, elite: true, seal: true, killed: false, e: null, count: true }); }
      } else if (R() < 0.22 + f * 0.012) { const s = spot(r); pack.list.push({ type: main, x: s.x, z: s.z, level: Lv + 1, elite: true, seal: false, killed: false, e: null, count: true }); }
      total += pack.list.length;
      F.packs.push(pack);
    }
    // corridor patrols
    const cor = [];
    for (let cy = 1; cy < GH - 1; cy += 2) for (let cx = 1; cx < GW - 1; cx += 2) if (F.grid[idx(cx, cy)] === 2 && F.dist[idx(cx, cy)] > 8) cor.push([cx, cy]);
    const np = Math.min(cor.length, F.boss ? 1 : 2 + ((f / 6) | 0));
    for (let k = 0; k < np; k++) {
      const [cx, cy] = cor.splice((R() * cor.length) | 0, 1)[0];
      const type = API.TYPES.bat && R() < 0.5 ? 'bat' : API.TYPES.wolf ? 'wolf' : 'soldier';
      const pack = { room: null, x: wx(cx), z: wz(cy), spawned: false, list: [] };
      for (let j = 0; j < 2; j++) pack.list.push({ type, x: wx(cx) + rand(-1, 1), z: wz(cy) + rand(-1, 1), level: Lv, elite: false, seal: false, killed: false, e: null, count: true });
      total += 2; F.packs.push(pack);
    }
    if (F.boss) {
      const a = F.arena, type = bossOf(f);
      F.bossRec = { type, x: wx(a.cx) + 4, z: wz(a.cy), level: Lv + 4, killed: false, e: null };
    }
    D.total = total; D.need = clamp(Math.ceil(total * 0.5), 3, 26); D.kills = 0;
  }
  function spawnRec(rec, extra) {
    if (!API.TYPES[rec.type]) return null;
    const o = Object.assign({ level: rec.level, elite: !!rec.elite, _tw: true, _rec: rec }, extra || {});
    let e = null;
    try { e = API.spawn(rec.type, rec.x, rec.z, o); } catch (err) { console.error('[dungeon spawn]', err); return null; }
    rec.e = e; D.mobs.push(e);
    if (rec.elite) {
      const ring = new T.Mesh(GEO.ringFlat, rec.seal ? MAT.auraSeal : MAT.aura);
      ring.scale.setScalar((e.d.r || 0.8) * 1.9); ring.position.y = 0.06; ring.castShadow = false; ring.renderOrder = 2;
      e.model.root.add(ring); e._aura = ring;
    }
    return e;
  }
  function updatePacks() {
    for (const pk of F.packs) {
      if (pk.spawned) continue;
      if (Math.abs(P.x - pk.x) > 46 || Math.abs(P.z - pk.z) > 46) continue;
      if (Math.hypot(P.x - pk.x, P.z - pk.z) > 42) continue;
      pk.spawned = true;
      for (const rec of pk.list) if (!rec.killed) spawnRec(rec);
    }
    if (F.bossRec && !F.bossRec.e && !F.bossRec.killed) {
      const b = F.bossRec;
      if (Math.hypot(P.x - b.x, P.z - b.z) < 60) {
        const e = spawnRec(b, { passive: true, rot: -Math.PI / 2, _boss: true });
        if (e) { D.boss = e; F.dyn.push({ follow: e, x: e.x, y: 7 + e.d.r * 1.5, z: e.z, col: F.TH.accent, base: 26 + e.d.r * 6, kind: 'boss' }); }
      }
    }
  }

  /* ---------------------------------------------------------------- chests */
  function chestModel(tier, mimicLook) {
    const Rr = RAR[tier], root = new T.Group();
    const wood = std(Rr.wood, 0.85, 0), metal = std(Rr.metal, 0.3, 0.9, { emissive: tier >= 3 ? hdr('#ffb020', 0.15) : new T.Color(0, 0, 0) });
    mesh(root, GEO.chestBody, wood, 0, 0, 0); mesh(root, GEO.chestBands, metal, 0, 0, 0);
    const lid = pivot(root, 0, 0.72, -0.46);
    mesh(lid, GEO.chestLid, wood, 0, 0, 0); mesh(lid, GEO.lidBands, metal, 0, 0, 0);
    const inner = new T.Mesh(new T.PlaneGeometry(1.3, 0.85), new T.MeshBasicMaterial({ color: hdr(Rr.c, 1.4 + tier * 0.5), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    inner.rotation.x = -Math.PI / 2; inner.position.set(0, 0.7, 0); root.add(inner);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr(Rr.c, Rr.glow), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: mimicLook ? 0.5 : 0.85 }));
    glow.scale.set(2.6 + tier * 0.6, 1.6 + tier * 0.3, 1); glow.position.y = 0.55; root.add(glow);
    root.traverse((o) => { if (o.isMesh) { o.userData.ownMat = true; } });
    inner.userData.ownGeo = true;
    return { root, lid, glow, inner, wood, metal };
  }
  function rollTier(R, bonus) {
    const r = R() - (bonus || 0);
    return r < 0.04 ? 3 : r < 0.18 ? 2 : r < 0.5 ? 1 : 0;
  }
  function placeChest(cx, cy, tier, opts) {
    const x = wx(cx), z = wz(cy);
    // face away from the nearest wall
    let ry = 0, best = -1;
    for (const [dx, dy] of DIR4) { if (!F.grid[idx(cx - dx, cy - dy)]) { ry = Math.atan2(dx, dy); best = 1; break; } }
    if (best < 0) ry = Math.atan2(wx(F.start.cx) - x, wz(F.start.cy) - z);
    const ox = best > 0 ? -Math.sin(ry) * 0.5 : 0, oz = best > 0 ? -Math.cos(ry) * 0.5 : 0;
    const m = chestModel(tier, opts && opts.mimic);
    m.root.position.set(x + ox, 0, z + oz); m.root.rotation.y = ry;
    F.group.add(m.root);
    const c = Object.assign({ x: x + ox, z: z + oz, ry, tier, m, opened: false, openT: 0, popped: false, mimic: false, shake: 0, twitch: 0 }, opts || {});
    F.chests.push(c); F.used[idx(cx, cy)] = 1;
    c.circle = { x: c.x, z: c.z, r: 0.85 }; F.circles.push(c.circle);
    return c;
  }
  function planChests(f, R) {
    const cand = F.rooms.filter((r) => r !== F.start && !r.arena);
    const n = Math.min(cand.length, 2 + (R() < 0.5 ? 1 : 0) + (f >= 10 ? 1 : 0));
    const pickEdge = (r) => {
      for (let k = 0; k < 40; k++) {
        const cx = r.x + ((R() * r.w) | 0), cy = r.y + ((R() * r.h) | 0), i = idx(cx, cy);
        if (F.used[i] || F.grid[i] !== 1) continue;
        const nearWall = !F.grid[idx(cx + 1, cy)] || !F.grid[idx(cx - 1, cy)] || !F.grid[idx(cx, cy + 1)] || !F.grid[idx(cx, cy - 1)];
        if (nearWall) return [cx, cy];
      }
      return null;
    };
    if (F.key && F.key !== F.exit) { const p = pickEdge(F.key); if (p) placeChest(p[0], p[1], Math.max(1, rollTier(R, 0.15))); }
    const pool = cand.slice();
    for (let k = 0; k < n && pool.length; k++) {
      const r = pool.splice((R() * pool.length) | 0, 1)[0];
      if (r === F.key) continue;
      const p = pickEdge(r); if (!p) continue;
      const mimic = f >= 2 && R() < 0.16;
      placeChest(p[0], p[1], mimic ? 1 + (R() < 0.3 ? 1 : 0) : rollTier(R, f * 0.004), { mimic });
    }
  }
  function openChest(c) {
    if (c.opened || c.shake > 0) return;
    if (c.mimic) { c.shake = 0.55; sfx('warning'); API.setShake(0.15); return; }
    c.opened = true; c.openT = 0; sfx('chest');
  }
  function chestLoot(c) {
    const il = floorLevel(F.f) + c.tier, x = c.x + Math.sin(c.ry) * 1.2, z = c.z + Math.cos(c.ry) * 1.2;
    const items = [1, 1 + (Math.random() < 0.5 ? 1 : 0), 2, 3][c.tier];
    const gold = Math.round((20 + F.f * 9) * (1 + c.tier * 0.8) * (0.8 + Math.random() * 0.4));
    if (API.rpg && typeof API.rpg.dropLoot === 'function') {
      for (let i = 0; i < items; i++) setTimeout(() => { try { API.rpg.dropLoot(x + rand(-1, 1), z + rand(-1, 1), il, c.tier); } catch (e) { console.error(e); } }, 120 + i * 220);
      try { API.rpg.giveGold(gold); } catch (e) { S.runes += gold; }
    } else S.runes += gold * 2;
    dmgNum(c.x, 2.2, c.z, '+' + fmt(API.rpg ? gold : gold * 2) + ' ◈', 'gold');
    emit(c.x, 1, c.z, 30 + c.tier * 15, RAR[c.tier].c, { speed: 4, up: 6, grav: 6, life: 1.3, bright: 2.2 });
    if (c.tier >= 2) { API.lightPillar(c.x, c.z, RAR[c.tier].c, 1.4); sfx(c.tier >= 3 ? 'skillGet' : 'pickup'); }
    if (c.tier >= 3) oracle('《Scrigno leggendario. Contenuto: di valore eccezionale.》', true);
    API.saveS();
  }
  function revealMimic(c) {
    c.opened = true; c.popped = true;
    F.group.remove(c.m.root);
    const i = F.circles.indexOf(c.circle); if (i >= 0) F.circles.splice(i, 1);
    const rec = { type: 'tw_mimic', x: c.x, z: c.z, level: floorLevel(F.f) + 1, elite: false, killed: false, e: null, count: false, mimic: true };
    const e = spawnRec(rec, { rot: c.ry, engaged: true, _mimic: true, _tier: c.tier });
    emit(c.x, 1, c.z, 40, '#ff3b4a', { speed: 6, up: 4, life: 0.9 });
    sfx('bossRoar', { vol: 0.5 }); API.setShake(0.35);
    oracle('《Allarme: quello non era uno scrigno. Ostile: Scrigno Famelico.》');
    if (e) API.input.lock = e;
  }
  function updateChests(dt) {
    for (const c of F.chests) {
      if (c.popped && c.mimic) continue;
      const m = c.m;
      if (c.shake > 0) {
        c.shake -= dt; m.root.rotation.z = Math.sin(c.shake * 60) * 0.08; m.lid.rotation.x = -Math.abs(Math.sin(c.shake * 30)) * 0.3;
        if (c.shake <= 0) revealMimic(c);
        continue;
      }
      if (c.mimic && !c.opened) { // subtle tell: the "chest" breathes and twitches now and then
        c.twitch -= dt;
        const near = Math.abs(P.x - c.x) < 12 && Math.abs(P.z - c.z) < 12;
        if (near && c.twitch <= 0) { c.twitch = 2 + Math.random() * 4; c.tw = 0.3; }
        if (c.tw > 0) { c.tw -= dt; m.lid.rotation.x = -Math.sin(c.tw / 0.3 * Math.PI) * 0.12; } else m.lid.rotation.x = 0;
        m.root.scale.y = 1 + Math.sin(D.time * 2.2) * 0.015;
        continue;
      }
      if (c.opened && c.openT < 1.6) {
        c.openT += dt;
        const k = clamp(c.openT / 0.7, 0, 1), back = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
        m.lid.rotation.x = -1.95 * back;
        m.inner.material.opacity = Math.min(1, c.openT * 2) * (1 - Math.max(0, c.openT - 1.1) * 1.2);
        if (!c.popped && c.openT > 0.45) { c.popped = true; chestLoot(c); }
      } else if (c.opened) { m.glow.material.opacity = Math.max(0.08, m.glow.material.opacity - dt * 0.5); m.inner.material.opacity = 0; }
      else { m.glow.material.opacity = 0.65 + Math.sin(D.time * 2.5 + c.x) * 0.2; if (Math.random() < dt * (1 + c.tier)) emit(c.x + rand(-0.6, 0.6), 0.9, c.z + rand(-0.4, 0.4), 1, RAR[c.tier].c, { speed: 0.3, up: 1.2, grav: -0.5, life: 1.2, size: 0.25, bright: 1.6 }); }
    }
  }

  /* ---------------------------------------------------------------- traps */
  function planTraps(f, R) {
    const avoid = (cx, cy) => { const r = F.rid[idx(cx, cy)]; if (r >= 0 && (F.rooms[r] === F.start || F.rooms[r].arena)) return true; if (F.used[idx(cx, cy)]) return true; return F.dist[idx(cx, cy)] >= 0 && F.dist[idx(cx, cy)] < 5; };
    // spike plates
    const ns = Math.min(7, 1 + ((f / 2) | 0));
    for (let k = 0, tries = 0; k < ns && tries < 300; tries++) {
      const cx = 1 + ((R() * (GW - 2)) | 0), cy = 1 + ((R() * (GH - 2)) | 0);
      if (!F.grid[idx(cx, cy)] || avoid(cx, cy)) continue;
      F.used[idx(cx, cy)] = 1; k++;
      const x = wx(cx), z = wz(cy);
      const plateMat = MAT.plate.clone(); plateMat.emissive = new T.Color(0, 0, 0);
      const plate = addMesh(GEO.plate, plateMat, x, 0, z, 0, { mat: true });
      const sp = addMesh(GEO.spikes, MAT.spike, x, -1.15, z, 0);
      F.traps.push({ kind: 'spike', x, z, plate, sp, t: R() * 3.4, per: 3.4, hit: false, mat: plateMat });
    }
    // swinging blades in straight corridors
    const nb = f >= 2 ? Math.min(4, 1 + ((f / 5) | 0)) : 0;
    for (let k = 0, tries = 0; k < nb && tries < 600; tries++) {
      const cx = 2 + ((R() * (GW - 4)) | 0), cy = 2 + ((R() * (GH - 4)) | 0);
      if (F.grid[idx(cx, cy)] !== 2 || avoid(cx, cy)) continue;
      let axis = null;
      if (F.grid[idx(cx, cy + 1)] === 2 && !F.grid[idx(cx, cy - 1)] && !F.grid[idx(cx, cy + 2)] && F.grid[idx(cx - 1, cy)] && F.grid[idx(cx + 1, cy)]) axis = 'x';
      else if (F.grid[idx(cx + 1, cy)] === 2 && !F.grid[idx(cx - 1, cy)] && !F.grid[idx(cx + 2, cy)] && F.grid[idx(cx, cy - 1)] && F.grid[idx(cx, cy + 1)]) axis = 'z';
      if (!axis) continue;
      F.used[idx(cx, cy)] = 1; k++;
      // corridor runs along `axis`; the blade sweeps across it
      const x = axis === 'x' ? wx(cx) : OX + (cx + 1) * CS, z = axis === 'x' ? OZ + (cy + 1) * CS : wz(cy);
      const g = new T.Group(); g.position.set(x, 7.6, z); F.group.add(g);
      const arm = new T.Group(); g.add(arm);
      const inner = new T.Group(); arm.add(inner);
      mesh(inner, BOX, MAT.iron, 0, -2.8, 0, 0, 0, 0, 0.16, 5.6, 0.16);
      mesh(inner, BOX, MAT.iron, 0, -0.1, 0, 0, 0, 0, 0.5, 0.5, 0.5);
      const bladeMat = std('#c8ccd4', 0.18, 0.95, { emissive: hdr('#ff3020', 0) }); bladeMat.userData = {};
      const bl = mesh(inner, GEO.blade || (GEO.blade = (() => { const gg = new T.CylinderGeometry(1.5, 1.5, 0.08, 18, 1, false, Math.PI, Math.PI); gg.rotateZ(Math.PI / 2); return gg; })()), bladeMat, 0, -5.6, 0);
      bl.userData.ownMat = true;
      if (axis === 'z') inner.rotation.y = Math.PI / 2;
      // ceiling beam spanning the corridor
      const beam = mesh(g, BOX, MAT.iron, 0, 0.1, 0, 0, axis === 'x' ? 0 : Math.PI / 2, 0, 0.5, 0.5, CS * 2 + 1.5);
      beam.castShadow = true;
      F.traps.push({ kind: 'blade', x, z, axis, g, arm, mat: bladeMat, ph: R() * TAU, w: 1.6 + R() * 0.6, cd: 0, last: 0 });
    }
    // fire jets on wall faces
    const nj = f >= 3 ? Math.min(5, 1 + ((f / 4) | 0)) : 0;
    for (let k = 0, tries = 0; k < nj && tries < 600; tries++) {
      const cx = 1 + ((R() * (GW - 2)) | 0), cy = 1 + ((R() * (GH - 2)) | 0);
      if (F.grid[idx(cx, cy)]) continue;
      const d = DIR4[(R() * 4) | 0], nx = cx + d[0], ny = cy + d[1];
      if (!inb(nx, ny) || !F.grid[idx(nx, ny)] || avoid(nx, ny)) continue;
      if (!F.grid[idx(nx + d[0], ny + d[1])]) continue;
      k++;
      const x = wx(cx) + d[0] * (CS / 2 + 0.05), z = wz(cy) + d[1] * (CS / 2 + 0.05), ry = Math.atan2(d[0], d[1]);
      const g = new T.Group(); g.position.set(x, 1.1, z); g.rotation.y = ry; F.group.add(g);
      const headMat = std('#3a3432', 0.4, 0.8, { emissive: hdr('#ff5a10', 0) });
      const head = mesh(g, BOX, headMat, 0, 0, 0.25, 0, 0, 0, 0.7, 0.55, 0.5); head.userData.ownMat = true;
      mesh(g, coneG(0.12, 0.45, 5), MAT.iron, 0.24, 0.32, 0.12, -0.6, 0, -0.3); mesh(g, coneG(0.12, 0.45, 5), MAT.iron, -0.24, 0.32, 0.12, -0.6, 0, 0.3);
      mesh(g, new T.CylinderGeometry(0.16, 0.2, 0.25, 8), MAT.iron, 0, -0.02, 0.55, Math.PI / 2, 0, 0).userData.ownGeo = true;
      const cone = new T.Mesh(GEO.jet || (GEO.jet = (() => { const gg = new T.ConeGeometry(0.9, 6.5, 10, 1, true); gg.rotateX(-Math.PI / 2); gg.translate(0, 0, 3.9); return gg; })()),
        new T.MeshBasicMaterial({ color: hdr('#ff7a2a', 2.2), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      cone.userData.ownMat = true; cone.visible = false; g.add(cone);
      F.traps.push({ kind: 'jet', x, z, dx: d[0], dz: d[1], g, head, mat: headMat, cone, t: R() * 4.2, per: 4.2, tick: 0 });
    }
  }
  function updateTraps(dt) {
    const py = P.y;
    for (const tr of F.traps) {
      const near = Math.abs(P.x - tr.x) < 34 && Math.abs(P.z - tr.z) < 34;
      if (tr.kind === 'spike') {
        if (!near) continue;
        tr.t = (tr.t + dt) % tr.per;
        const t = tr.t, warn = t > 1.9 && t < 2.6, up = t >= 2.6 && t < 3.2;
        const k = up ? Math.min(1, (t - 2.6) / 0.08) : t >= 3.2 ? 0 : warn ? (t - 1.9) / 0.7 * 0.15 : 0;
        tr.sp.position.y = lerp(-1.15, 0.05, k);
        tr.mat.emissive.setRGB(warn ? 1.2 + Math.sin(t * 30) * 0.8 : up ? 0.6 : 0, warn ? 0.12 : 0.04, 0.02);
        if (warn && !tr.warned) { tr.warned = true; if (Math.hypot(P.x - tr.x, P.z - tr.z) < 9) sfx('warning', { vol: 0.35 }); }
        if (up && !tr.hit) {
          tr.hit = true; tr.warned = false;
          emit(tr.x, 0.3, tr.z, 14, '#d8d0c0', { speed: 3, up: 3, life: 0.5 });
          if (Math.abs(P.x - tr.x) < 1.55 && Math.abs(P.z - tr.z) < 1.55 && py < 0.6) { API.hurtPlayer(Math.round(P.maxHp * 0.16 + floorLevel(F.f) * 2), tr.x, tr.z); emit(P.x, 0.8, P.z, 16, '#ff3b3b', { speed: 4 }); }
          for (const e of D.mobs) if (!e.dead && Math.abs(e.x - tr.x) < 1.5 && Math.abs(e.z - tr.z) < 1.5) API.hitEnemyQuiet(e, Math.round(e.maxHp * 0.15));
        }
        if (!up) tr.hit = false;
      } else if (tr.kind === 'blade') {
        const ang = Math.sin(D.time * tr.w + tr.ph) * 1.05;
        if (tr.axis === 'x') tr.arm.rotation.x = ang; else tr.arm.rotation.z = -ang;
        if (!near) continue;
        const swing = Math.abs(Math.cos(D.time * tr.w + tr.ph));
        tr.mat.emissive.setRGB(1.6 * swing * swing, 0.25 * swing, 0.1 * swing);
        const off = -Math.sin(ang) * 6.3, ty = 7.6 - Math.cos(ang) * 6.3;
        const bx = tr.axis === 'x' ? tr.x : tr.x + off, bz = tr.axis === 'x' ? tr.z + off : tr.z;
        tr.cd -= dt;
        if (Math.abs(ang) < 0.25 && swing > 0.95 && D.time - tr.last > 0.5 && Math.hypot(P.x - tr.x, P.z - tr.z) < 14) { tr.last = D.time; sfx('slash', { vol: 0.3 }); }
        if (tr.cd <= 0 && ty < 2.4 && Math.abs(P.x - bx) < (tr.axis === 'x' ? 0.9 : 1.6) && Math.abs(P.z - bz) < (tr.axis === 'x' ? 1.6 : 0.9) && P.iframe <= 0) {
          tr.cd = 0.9;
          const vs = -Math.cos(D.time * tr.w + tr.ph); // swing direction pushes the player along it
          API.hurtPlayer(Math.round(P.maxHp * 0.2 + floorLevel(F.f) * 2.5), bx - (tr.axis === 'z' ? vs * 3 : 0), bz - (tr.axis === 'x' ? vs * 3 : 0));
          emit(P.x, 1, P.z, 20, '#ff3b3b', { speed: 6 }); API.setShake(0.3);
        }
      } else if (tr.kind === 'jet') {
        if (!near) { tr.cone.visible = false; continue; }
        tr.t = (tr.t + dt) % tr.per;
        const t = tr.t, warn = t > 2.2 && t < 3.0, fire = t >= 3.0;
        tr.mat.emissive.copy(hdr('#ff5a10', warn ? 0.8 + Math.sin(t * 25) * 0.6 : fire ? 2.2 : 0.05));
        const mx = tr.x + tr.dx * 0.6, mz = tr.z + tr.dz * 0.6;
        if (warn && Math.random() < dt * 25) emit(mx, 1.1, mz, 1, '#ffb040', { speed: 1.5, up: 0.5, grav: 0, life: 0.4, size: 0.25, bright: 2.5 });
        if (warn && !tr.warned) { tr.warned = true; if (Math.hypot(P.x - tr.x, P.z - tr.z) < 12) sfx('fire', { vol: 0.3 }); }
        tr.cone.visible = fire;
        if (fire) {
          tr.warned = false;
          tr.cone.scale.set(0.8 + Math.random() * 0.4, 0.8 + Math.random() * 0.4, Math.min(1, (t - 3.0) * 6) * (0.9 + Math.random() * 0.15));
          tr.cone.material.opacity = 0.35 + Math.random() * 0.25;
          for (let i = 0; i < (LOW ? 2 : 4); i++) { const s = rand(0.4, 6.8), w = 0.15 + s * 0.12; emit(mx + tr.dx * s + rand(-w, w), 1.1 + rand(-w, w) * 0.6, mz + tr.dz * s + rand(-w, w), 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffcf5a', { speed: 0.8, up: 0.6, grav: -2, life: 0.45, size: 0.5 + s * 0.12, bright: 2.4 }); }
          tr.tick -= dt;
          const rx = P.x - tr.x, rz = P.z - tr.z, along = rx * tr.dx + rz * tr.dz, lat = Math.abs(rx * tr.dz - rz * tr.dx);
          if (tr.tick <= 0 && along > 0 && along < 7.2 && lat < 1.0 + along * 0.12 && P.y < 1.5) { tr.tick = 0.35; API.hurtPlayer(Math.round(P.maxHp * 0.07 + floorLevel(F.f)), tr.x, tr.z); }
          if (Math.random() < dt * 6) for (const e of D.mobs) { if (e.dead) continue; const ex = e.x - tr.x, ez = e.z - tr.z, al = ex * tr.dx + ez * tr.dz; if (al > 0 && al < 7 && Math.abs(ex * tr.dz - ez * tr.dx) < 1.2) API.hitEnemyQuiet(e, Math.round(e.maxHp * 0.04)); }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- portal, crystal, gate */
  function buildPortal() {
    const r = F.exit, x = wx(r.cx) + (F.boss ? 3 * CS : 0), z = wz(r.cy);
    const g = new T.Group(); g.position.set(x, 0, z); F.group.add(g);
    const stone = std(F.TH.wall, 0.85, 0.05);
    mesh(g, new T.CylinderGeometry(2.9, 3.2, 0.35, 12), stone, 0, 0.17, 0).userData.ownGeo = true;
    mesh(g, new T.CylinderGeometry(2.3, 2.6, 0.3, 12), stone, 0, 0.5, 0).userData.ownGeo = true;
    const runeMat = new T.MeshBasicMaterial({ map: TX.ring, color: hdr('#ff3030', 1.4), transparent: true, blending: T.AdditiveBlending, depthWrite: false });
    const rune = new T.Mesh(new T.CircleGeometry(2.2, 32), runeMat); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.67; g.add(rune);
    rune.userData.ownGeo = true; rune.userData.ownMat = true;
    // arch
    const arch = new T.Group(); arch.position.y = 0.65; g.add(arch);
    for (const sx of [-1, 1]) {
      mesh(arch, BOX, stone, sx * 1.75, 2.0, 0, 0, 0, 0, 0.55, 4, 0.7);
      mesh(arch, BOX, stone, sx * 1.75, 0.15, 0, 0, 0, 0, 0.8, 0.3, 0.9);
    }
    const top = mesh(arch, new T.TorusGeometry(1.75, 0.32, 6, 16, Math.PI), stone, 0, 4.0, 0); top.userData.ownGeo = true;
    const gem = mesh(arch, new T.OctahedronGeometry(0.28, 0), new T.MeshBasicMaterial({ color: hdr('#ff3030', 3) }), 0, 5.9, 0); gem.userData.ownGeo = true; gem.userData.ownMat = true;
    const discMat = new T.MeshBasicMaterial({ map: TX.swirl, color: hdr('#ff3030', 0.6), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const disc = new T.Mesh(new T.CircleGeometry(1.55, 32), discMat); disc.position.set(0, 2.65, 0); disc.scale.set(1, 1.55, 1); arch.add(disc);
    disc.userData.ownGeo = true; disc.userData.ownMat = true;
    stone.userData = {}; g.traverse((o) => { if (o.isMesh && o.material === stone) o.userData.ownMat = true; });
    // orient the arch toward the start room
    arch.rotation.y = Math.atan2(wx(F.start.cx) - x, wz(F.start.cy) - z);
    F.portal = { x, z, g, rune, runeMat, disc, discMat, gem, arch };
    F.circles.push({ x: x + Math.cos(arch.rotation.y) * 1.75, z: z - Math.sin(arch.rotation.y) * 1.75, r: 0.5 }, { x: x - Math.cos(arch.rotation.y) * 1.75, z: z + Math.sin(arch.rotation.y) * 1.75, r: 0.5 });
    F.torches.push({ x, y: 3, z, col: '#ff3030', base: 0.7, ph: 0, kind: 'portal', prio: 1 });
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) F.used[idx(cxOf(x) + dx, cyOf(z) + dy)] = 1;
    setPortalState(false);
  }
  function setPortalState(on) {
    const p = F.portal; if (!p) return;
    const c = on ? '#b070ff' : '#ff3030';
    p.runeMat.color.copy(hdr(on ? '#ffd36b' : '#ff3030', on ? 2 : 1.2));
    p.discMat.color.copy(hdr(c, on ? 2.2 : 0.5));
    p.gem.material.color.copy(hdr(on ? '#ffd36b' : '#ff3030', 3));
    const lt = F.torches.find((t) => t.kind === 'portal'); if (lt) { lt.col = on ? '#b080ff' : '#ff3030'; lt.base = on ? 1.4 : 0.7; }
  }
  function buildCrystal() {
    const r = F.start, x = wx(r.cx), z = wz(r.cy) - 1;
    const g = new T.Group(); g.position.set(x, 0, z); F.group.add(g);
    const stone = std(F.TH.wall, 0.8, 0.1); stone.userData = {};
    mesh(g, new T.CylinderGeometry(0.9, 1.15, 0.6, 8), stone, 0, 0.3, 0).userData.ownGeo = true;
    mesh(g, new T.CylinderGeometry(0.55, 0.8, 0.5, 8), stone, 0, 0.85, 0).userData.ownGeo = true;
    g.children.forEach((o) => { o.userData.ownMat = o.material === stone; });
    const cm = std('#9fe8ff', 0.08, 0.3, { emissive: hdr('#3fb0ff', 1.8), transparent: true, opacity: 0.92 });
    const cr = mesh(g, new T.OctahedronGeometry(0.55, 0), cm, 0, 2.2, 0, 0, 0, 0, 1, 1.9, 1); cr.userData.ownGeo = true; cr.userData.ownMat = true;
    const rm = new T.MeshBasicMaterial({ color: hdr('#7fd8ff', 2.2), transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false });
    const r1 = mesh(g, new T.TorusGeometry(1.05, 0.03, 4, 40), rm, 0, 2.2, 0, Math.PI / 2, 0, 0); r1.userData.ownGeo = true; r1.userData.ownMat = true; r1.castShadow = false;
    const r2 = mesh(g, new T.TorusGeometry(0.8, 0.025, 4, 32), rm, 0, 2.2, 0, 0.6, 0, 0); r2.userData.ownGeo = true; r2.castShadow = false;
    const halo = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr('#5fc8ff', 1.4), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.7 }));
    halo.scale.set(3.4, 3.4, 1); halo.position.y = 2.2; g.add(halo); halo.userData.ownMat = true;
    F.crystal = { x, z, g, cr, r1, r2, halo };
    F.circles.push({ x, z, r: 1.1 });
    F.torches.push({ x, y: 2.4, z, col: '#5fc8ff', base: 0.9, ph: 3, kind: 'crystal', prio: 1 });
    F.used[idx(cxOf(x), cyOf(z))] = 1;
  }
  function buildGate() {
    const a = F.arena;
    for (let cy = a.y - 1; cy <= a.y + a.h; cy++) for (let cx = a.x - 1; cx <= a.x + a.w; cx++) {
      const inside = cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h;
      if (inside || !F.grid[idx(cx, cy)]) continue;
      // the opening cell must touch the arena orthogonally
      let dir = null;
      if (cx === a.x - 1 && cy >= a.y && cy < a.y + a.h) dir = [1, 0];
      else if (cx === a.x + a.w && cy >= a.y && cy < a.y + a.h) dir = [-1, 0];
      else if (cy === a.y - 1 && cx >= a.x && cx < a.x + a.w) dir = [0, 1];
      else if (cy === a.y + a.h && cx >= a.x && cx < a.x + a.w) dir = [0, -1];
      if (!dir) continue;
      const m = new T.Mesh(GEO.gateWall, MAT.gate);
      m.position.set(wx(cx) + dir[0] * (CS / 2), 0, wz(cy) + dir[1] * (CS / 2)); m.rotation.y = Math.atan2(dir[0], dir[1]);
      F.group.add(m);
      F.gates.push({ cx, cy, m });
    }
  }
  function setGate(on) {
    D.gate = on;
    for (const g of F.gates) F.block[idx(g.cx, g.cy)] = on ? 1 : 0;
  }

  /* ================================================================ enemy types: mimic + floor guardians */
  function recolor(m, map, eyeHex) {
    m.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (o.material.isMeshBasicMaterial) { if (eyeHex) o.material.color.copy(hdr(eyeHex, 3.5)); return; }
      const to = map['#' + o.material.color.getHexString()];
      if (!to) return;
      o.material.color.set(to[0]);
      if (to[1] != null) o.material.metalness = to[1];
      if (to[2] != null) o.material.roughness = to[2];
      if (to[3]) o.material.emissive = new T.Color(to[3]);
    });
  }
  const hx = (c) => '#' + new T.Color(c).getHexString();
  function mimicModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const wood = std('#4a3a2c', 0.85), iron = std('#7a8aa0', 0.3, 0.9), flesh = std('#5a0f1e', 0.55), tooth = std('#efe6d2', 0.35);
    const eye = new T.MeshBasicMaterial({ color: hdr('#ffcc33', 4) });
    mesh(g, GEO.chestBody, wood, 0, 0.42, 0); mesh(g, GEO.chestBands, iron, 0, 0.42, 0);
    mesh(g, BOX, flesh, 0, 1.12, 0, 0, 0, 0, 1.25, 0.05, 0.8);
    for (let i = 0; i < 7; i++) mesh(g, coneG(0.06, 0.24, 4), tooth, -0.54 + i * 0.18, 1.24, 0.4, 0, 0, 0);
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) mesh(g, coneG(0.05, 0.2, 4), tooth, sx * 0.63, 1.22, -0.3 + i * 0.2, 0, 0, 0);
    const lid = pivot(g, 0, 1.14, -0.46);
    mesh(lid, GEO.chestLid, wood, 0, 0, 0); mesh(lid, GEO.lidBands, iron, 0, 0, 0);
    for (let i = 0; i < 7; i++) mesh(lid, coneG(0.06, 0.26, 4), tooth, -0.54 + i * 0.18, -0.08, 0.86, Math.PI, 0, 0);
    for (const sx of [-1, 1]) mesh(lid, sph(0.07, 8, 6), eye, sx * 0.3, 0.42, 0.86, 0, 0, 0, 1.4, 0.6, 0.5);
    const tongue = pivot(g, 0, 1.15, 0.1);
    mesh(tongue, cap(0.12, 0.7), std('#c02a4a', 0.4), 0, 0.02, 0.4, Math.PI / 2, 0, 0, 1, 1, 0.5);
    const legs = [];
    for (const [x, z] of [[-0.55, 0.32], [0.55, 0.32], [-0.55, -0.32], [0.55, -0.32]]) { const l = pivot(g, x, 0.45, z); mesh(l, cap(0.08, 0.3), flesh, 0, -0.22, 0); mesh(l, coneG(0.07, 0.18, 4), tooth, 0, -0.45, 0.06, 1.3, 0, 0); legs.push(l); }
    const tail = pivot(g, 0, 0.6, -0.5);
    const animate = (e, dt, anim, wind, act) => {
      const t = e.t;
      let open = anim === 'walk' ? 0.25 + Math.abs(Math.sin(t * 9)) * 0.45 : 0.12 + Math.sin(t * 2.5) * 0.08;
      if (e.atk) open = act > 0 ? lerp(1.3, 0.02, Math.min(1, act * 2)) : wind * 1.3;
      lid.rotation.x = -open; tongue.rotation.x = Math.sin(t * 7) * 0.25 - open * 0.3; tongue.rotation.y = Math.sin(t * 5) * 0.3;
      g.position.y = anim === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.12 : 0;
    };
    return { root, g, legs, tail, lid, tongue, animate, s: 1 };
  }
  function lichModel() {
    const m = API.humanoid('knight', 1.7);
    recolor(m, { [hx('#2a2d36')]: ['#d9d0b8', 0, 0.7], [hx('#4a1c26')]: ['#5a0a16', 0, 0.9, '#1a0004'], [hx('#4d5361')]: ['#2e2228', 0.7, 0.4], [hx('#c9a24a')]: ['#d4a640', 0.9, 0.3], [hx('#c9ced8')]: ['#2a0a10', 0.5, 0.4] }, '#ff2a3a');
    const robe = std('#5a0a16', 0.9, 0, { side: T.DoubleSide, emissive: new T.Color('#140004') });
    mesh(m.g, new T.CylinderGeometry(0.36, 0.8, 1.3, 12, 1, true), robe, 0, 0.62, 0);
    mesh(m.head, coneG(0.36, 0.6, 8), robe, 0, 0.38, -0.04, -0.15, 0, 0);
    const gold = std('#d4a640', 0.25, 0.95);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; mesh(m.head, coneG(0.04, 0.22, 4), gold, Math.cos(a) * 0.3, 0.32, Math.sin(a) * 0.3); }
    const glow = new T.MeshBasicMaterial({ color: hdr('#ff2a3a', 3.2) });
    const staff = pivot(m.armR, 0, -0.8, 0.1);
    mesh(staff, new T.CylinderGeometry(0.04, 0.05, 2.8, 6), std('#2a1a1a', 0.8), 0, -0.2, 0);
    m.orb = mesh(staff, sph(0.18, 12, 10), glow, 0, 1.3, 0);
    m.ring = mesh(staff, new T.TorusGeometry(0.3, 0.02, 4, 24), glow, 0, 1.3, 0, Math.PI / 2, 0, 0);
    m.weapon.visible = false;
    m.animate = (e, dt) => { m.g.position.y += 0.45 + Math.sin(e.t * 2) * 0.12; if (m.ring) m.ring.rotation.z += dt * 3; m.orb.scale.setScalar(1 + Math.sin(e.t * 6) * 0.12); };
    return m;
  }
  function minotaurModel() {
    const m = API.humanoid('tyrant', 2.4);
    recolor(m, { [hx('#7b6a52')]: ['#4a3226', 0, 0.85], [hx('#5a2a1e')]: ['#2b2b31', 0.6, 0.5], [hx('#6a5a48')]: ['#5d6470', 0.85, 0.35], [hx('#e0d6c0')]: ['#efe6d2', 0, 0.4] }, '#ff5a1a');
    const hide = std('#3a261c', 0.85), horn = std('#efe6d2', 0.4), gold = std('#d4a640', 0.25, 0.95), iron = std('#5d6470', 0.3, 0.9);
    mesh(m.head, BOX, hide, 0, -0.08, 0.26, 0.15, 0, 0, 0.34, 0.24, 0.26);
    mesh(m.head, new T.TorusGeometry(0.07, 0.018, 5, 12), gold, 0, -0.17, 0.4, 0, 0, 0);
    for (const sx of [-1, 1]) { mesh(m.head, coneG(0.09, 0.75, 6), horn, sx * 0.42, 0.18, 0.02, 0, 0, -sx * 1.25); mesh(m.head, coneG(0.06, 0.3, 5), horn, sx * 0.72, 0.36, 0.02, 0, 0, -sx * 0.2); }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) mesh(m.g, coneG(0.07, 0.3, 4), iron, sx * (0.42 + i * 0.07), 2.08 - i * 0.05, -0.05 + i * 0.05, 0, 0, -sx * 0.5);
    const blade = new T.CylinderGeometry(0.75, 0.75, 0.06, 14, 1, false, 0, Math.PI); blade.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) mesh(m.weapon, blade, std('#9aa0a8', 0.2, 0.95), sx * 0.3, -2.45, 0, 0, sx > 0 ? 0 : Math.PI, Math.PI / 2);
    return m;
  }
  function golemModel() {
    const m = API.humanoid('tyrant', 2.7);
    recolor(m, { [hx('#7b6a52')]: ['#3b3550', 0, 0.9], [hx('#5a2a1e')]: ['#2a2638', 0, 0.9], [hx('#6a5a48')]: ['#6a5aa0', 0.3, 0.3, '#1a1040'], [hx('#e0d6c0')]: ['#9fe8ff', 0.1, 0.15, '#2a80b0'], [hx('#4a3a2a')]: ['#2a2638', 0, 0.9], [hx('#3a2a1e')]: ['#3b3550', 0, 0.9] }, '#7ff0ff');
    const crA = std('#7ff0ff', 0.1, 0.2, { emissive: hdr('#2fb8ff', 1.6) }), crB = std('#e0a0ff', 0.1, 0.2, { emissive: hdr('#b04dff', 1.6) });
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) mesh(m.g, GEO.crystal, i % 2 ? crB : crA, sx * (0.45 + i * 0.1), 2.05 + i * 0.08, -0.1 - i * 0.05, rand(-0.4, 0.4), 0, -sx * (0.4 + i * 0.2), 0.3, 0.9 + i * 0.25, 0.3);
    for (let i = 0; i < 4; i++) mesh(m.g, GEO.crystal, i % 2 ? crA : crB, rand(-0.3, 0.3), 1.6 + i * 0.12, -0.42, -0.6, 0, rand(-0.5, 0.5), 0.28, 0.8 + i * 0.2, 0.28);
    m.core = mesh(m.g, sph(0.16, 10, 8), new T.MeshBasicMaterial({ color: hdr('#7ff0ff', 4) }), 0, 1.55, 0.34);
    for (const A of [m.armL, m.armR]) mesh(A, GEO.crystal, crA, 0, -0.95, 0, 0, 0, 0, 0.35, 0.6, 0.35);
    return m;
  }
  function wyrmModel() {
    const m = API.dragonModel();
    m.g.scale.setScalar(1.9);
    recolor(m, { [hx('#3f4e66')]: ['#bcd4ea', 0.25, 0.45], [hx('#a99a7a')]: ['#eaf4ff', 0, 0.6], [hx('#e0d8c6')]: ['#9fe0ff', 0.1, 0.2, '#2a6a9a'], [hx('#5e3a46')]: ['#4a7aa8', 0, 0.6, '#0a2040'] }, '#9ff3ff');
    return m;
  }
  function heraldModel() {
    const m = API.humanoid('knight', 2.3);
    recolor(m, { [hx('#2a2d36')]: ['#141018', 0.5, 0.4], [hx('#4a1c26')]: ['#2a0838', 0, 0.8, '#12001c'], [hx('#4d5361')]: ['#231a2e', 0.9, 0.25], [hx('#c9a24a')]: ['#b04dff', 0.9, 0.2, '#4a0080'], [hx('#c9ced8')]: ['#120018', 0.9, 0.2, '#6a10c0'] }, '#ff3bd0');
    const glow = new T.MeshBasicMaterial({ color: hdr('#c04dff', 3.2) });
    m.halo = mesh(m.g, new T.TorusGeometry(0.5, 0.03, 6, 32), glow, 0, 2.7, -0.3, 0.3, 0, 0);
    m.orbs = [];
    for (let i = 0; i < 3; i++) m.orbs.push(mesh(m.root, sph(0.22, 10, 8), new T.MeshBasicMaterial({ color: hdr(i === 1 ? '#ff3bd0' : '#8a4dff', 3.5) }), 0, 3, 0));
    m.animate = (e) => {
      const t = e.t;
      m.orbs.forEach((o, i) => { const a = t * 1.6 + i * TAU / 3; o.position.set(Math.cos(a) * 2.4, 3.2 + Math.sin(t * 2 + i) * 0.5, Math.sin(a) * 2.4); });
      m.halo.rotation.z += 0.02;
    };
    return m;
  }
  function bossPhase(e, line, color) {
    if (e.phase !== 1 || e.hp >= e.maxHp * 0.5) return false;
    e.phase = 2; // set before the engine's own check (it would announce the overworld Tyrant)
    toast(line); sfx('bossRoar'); API.setShake(0.6);
    API.shockwave(e.x, e.z, 12, 60, color); API.lightPillar(e.x, e.z, color, 1.6);
    return true;
  }
  function minion(type, x, z, lv) {
    if (!API.TYPES[type] || !F) return null;
    const rec = { type, x, z, level: lv, elite: false, killed: false, e: null, count: false };
    const e = spawnRec(rec, { engaged: true });
    if (e) { emit(x, 1, z, 26, '#c04dff', { speed: 4, up: 3, life: 0.8 }); }
    return e;
  }
  function registerTypes() {
    const TY = API.TYPES;
    TY.tw_mimic = { name: 'Scrigno Famelico', hp: 230, r: 0.95, speed: 5, aggro: 22, runes: 160, poise: 45, build: mimicModel,
      attacks: [{ name: 'chomp', range: 2.8, windup: 0.45, active: 0.2, recover: 0.5, dmg: 55, reach: 2.7, arc: 1.3 },
        { name: 'lunge', range: 8, minRange: 3, windup: 0.6, active: 0.3, recover: 0.8, dmg: 65, reach: 2.9, arc: 1.2, lunge: 17 }] };
    TY.tw_lich = { name: 'Vaelith, il Lich Cremisi', boss: true, hp: 2300, r: 1.1, speed: 2.8, aggro: 70, runes: 2600, poise: 200, build: lichModel,
      attacks: [
        { name: 'staff', range: 3.6, windup: 0.6, active: 0.2, recover: 0.6, dmg: 75, reach: 3.9, arc: 1.6 },
        { name: 'nova', range: 6, windup: 0.9, active: 0.2, recover: 0.8, dmg: 90, reach: 5.5, arc: TAU, wave: 10 },
        { name: 'daggers', range: 26, minRange: 5, windup: 0.7, active: 0.1, recover: 0.7, dmg: 55, daggers: 5 },
        { name: 'storm', range: 30, minRange: 6, windup: 1.0, active: 0.1, recover: 1.0, dmg: 70, bolts: 5 },
        { name: 'daggers2', range: 26, windup: 0.6, active: 0.1, recover: 0.6, dmg: 55, daggers: 9, phase2: true },
      ],
      update(e, dt) {
        if (e.dead) return false;
        if (Math.random() < dt * 5) emit(e.x + rand(-0.8, 0.8), e.y + rand(0.5, 3.5), e.z + rand(-0.8, 0.8), 1, '#ff2a3a', { speed: 0.4, up: 1, grav: -0.6, life: 1.1, size: 0.5 });
        if (!e.engaged) return false;
        if (bossPhase(e, 'Vaelith: «Alzatevi, servitori!»', '#ff2a3a')) { for (let i = 0; i < 2; i++) { const a = rand(0, TAU); minion('soldier', e.x + Math.cos(a) * 6, e.z + Math.sin(a) * 6, e.level - 3); } }
        e.blink = (e.blink == null ? 6 : e.blink) - dt;
        if (e.phase > 1 && e.blink <= 0 && !e.atk && F && F.arena) {
          e.blink = 7 + Math.random() * 3;
          emit(e.x, e.y + 1.5, e.z, 40, '#ff2a3a', { speed: 6, up: 2, life: 0.8 });
          const a = rand(0, TAU), r = rand(8, 12);
          e.x = clamp(P.x + Math.cos(a) * r, wx(F.arena.x) + 2, wx(F.arena.x + F.arena.w - 1) - 2); e.z = clamp(P.z + Math.sin(a) * r, wz(F.arena.y) + 2, wz(F.arena.y + F.arena.h - 1) - 2);
          emit(e.x, e.y + 1.5, e.z, 40, '#ff2a3a', { speed: 6, up: 2, life: 0.8 }); sfx('spirit');
        }
        return false;
      } };
    TY.tw_golem = { name: 'Colosso di Cristallo', boss: true, hp: 3300, r: 1.9, speed: 3.2, aggro: 70, runes: 3600, poise: 420, build: golemModel,
      attacks: [
        { name: 'slam', range: 5.5, windup: 1.0, active: 0.2, recover: 0.9, dmg: 130, reach: 5.5, arc: 1.2, wave: 10 },
        { name: 'sweep', range: 6, windup: 0.75, active: 0.3, recover: 0.6, dmg: 105, reach: 6.5, arc: 2.8 },
        { name: 'storm', range: 30, minRange: 6, windup: 1.1, active: 0.1, recover: 1.0, dmg: 80, bolts: 6 },
        { name: 'shards', range: 24, windup: 0.6, active: 0.1, recover: 0.6, dmg: 60, daggers: 7, phase2: true },
      ],
      update(e, dt) {
        if (e.dead) return false;
        if (e.model.core) e.model.core.scale.setScalar(1 + Math.sin(e.t * 5) * 0.2);
        if (Math.random() < dt * 4) emit(e.x + rand(-1.5, 1.5), e.y + rand(1, 5), e.z + rand(-1.5, 1.5), 1, Math.random() < 0.5 ? '#7ff0ff' : '#d070ff', { speed: 0.5, up: 1, grav: -0.4, life: 1, size: 0.4 });
        if (!e.engaged) return false;
        bossPhase(e, 'Il Colosso si incrina… e risplende!', '#7ff0ff');
        return false;
      } };
    TY.tw_minotaur = { name: 'Brontar, Minotauro di Ferro', boss: true, hp: 3800, r: 1.6, speed: 4.4, aggro: 70, runes: 4400, poise: 380, build: minotaurModel,
      attacks: [
        { name: 'slam', range: 5.5, windup: 0.95, active: 0.2, recover: 0.8, dmg: 150, reach: 5.5, arc: 1.2, wave: 9 },
        { name: 'sweep', range: 6, windup: 0.6, active: 0.3, recover: 0.6, dmg: 120, reach: 6.5, arc: 2.8 },
        { name: 'leap', range: 22, minRange: 7, windup: 0.85, active: 0.4, recover: 1.0, dmg: 160, reach: 4.2, arc: TAU, lunge: 30, wave: 10 },
        { name: 'combo', range: 5, windup: 0.4, active: 0.2, recover: 0.35, dmg: 90, reach: 5.2, arc: 1.5, combo: 3, phase2: true },
      ],
      update(e, dt) {
        if (e.dead || !e.engaged) return false;
        bossPhase(e, 'Brontar: «Il ferro non si piega!»', '#ff7a2a');
        if (e.phase > 1) { e.quake = (e.quake == null ? 6 : e.quake) - dt; if (e.quake <= 0 && !e.atk) { e.quake = 7; API.shockwave(e.x, e.z, 14, 70, '#ff7a2a'); sfx('explosion'); API.setShake(0.5); } if (Math.random() < dt * 8) emit(e.x + rand(-1, 1), e.y + rand(0.5, 3), e.z + rand(-1, 1), 1, '#ff7a2a', { speed: 1, up: 2, grav: -1 }); }
        return false;
      } };
    TY.tw_wyrm = { name: 'Skadhra, Viverna di Brina', boss: true, hp: 4400, r: 3.3, speed: 4.4, aggro: 70, runes: 5600, poise: 9999, build: wyrmModel,
      attacks: [
        { name: 'bite', range: 7, windup: 0.6, active: 0.2, recover: 0.6, dmg: 130, reach: 8, arc: 1.0 },
        { name: 'stomp', range: 7, windup: 0.8, active: 0.2, recover: 0.8, dmg: 120, reach: 7, arc: TAU, wave: 11 },
        { name: 'storm', range: 40, windup: 1.0, active: 0.1, recover: 1.0, dmg: 85, bolts: 6 },
        { name: 'storm2', range: 40, windup: 0.9, active: 0.1, recover: 0.9, dmg: 85, bolts: 10, phase2: true },
      ],
      update(e, dt) {
        if (e.dead) return false;
        if (Math.random() < dt * 6) emit(e.x + rand(-3, 3), e.y + rand(1, 6), e.z + rand(-3, 3), 1, '#cfefff', { speed: 0.6, up: 0.5, grav: 0.5, life: 1.4, size: 0.4 });
        if (!e.engaged) return false;
        bossPhase(e, 'Skadhra spalanca le ali: la tormenta si abbatte!', '#9fe0ff');
        return false;
      } };
    TY.tw_herald = { name: 'Araldo del Vuoto', boss: true, hp: 4800, r: 1.4, speed: 4.8, aggro: 70, runes: 7000, poise: 360, build: heraldModel,
      attacks: [
        { name: 'combo', range: 4.5, windup: 0.45, active: 0.2, recover: 0.35, dmg: 100, reach: 4.8, arc: 1.4, combo: 3 },
        { name: 'leap', range: 20, minRange: 7, windup: 0.7, active: 0.25, recover: 0.9, dmg: 150, reach: 4.5, arc: TAU, lunge: 24, wave: 12 },
        { name: 'daggers', range: 26, windup: 0.6, active: 0.1, recover: 0.5, dmg: 70, daggers: 7 },
        { name: 'storm', range: 40, windup: 1.0, active: 0.1, recover: 0.9, dmg: 90, bolts: 8, phase2: true },
      ],
      update(e, dt) {
        if (e.dead) return false;
        if (Math.random() < dt * 6) emit(e.x + rand(-1, 1), e.y + rand(1, 5), e.z + rand(-1, 1), 1, '#c04dff', { speed: 0.6, up: 1.4, grav: -0.5, life: 1.1, size: 0.6 });
        if (!e.engaged) return false;
        if (bossPhase(e, 'L\'Araldo apre una breccia nel Vuoto!', '#c04dff')) { for (let i = 0; i < 2; i++) { const a = rand(0, TAU); minion(API.TYPES.flame ? 'flame' : 'knight', e.x + Math.cos(a) * 7, e.z + Math.sin(a) * 7, e.level - 3); } }
        if (e.phase > 1) { e.pulse = (e.pulse == null ? 8 : e.pulse) - dt; if (e.pulse <= 0 && !e.atk) { e.pulse = 9; API.shockwave(e.x, e.z, 16, 90, '#c04dff'); sfx('explosion'); } }
        return false;
      } };
    MAT.aura = new T.MeshBasicMaterial({ color: hdr('#ff7a2a', 2.2), transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    MAT.auraSeal = new T.MeshBasicMaterial({ color: hdr('#ff2a4a', 2.6), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  }

  /* ================================================================ enter / leave */
  function findEnv() {
    if (ENV) return ENV;
    const pts = scene.children.filter((o) => o.isPoints);
    ENV = {
      hemi: scene.children.find((o) => o.isHemisphereLight) || null,
      sun: scene.children.find((o) => o.isDirectionalLight) || null,
      sky: scene.children.find((o) => o.isMesh && o.material && o.material.uniforms && o.material.uniforms.sunDir) || null,
      clouds: scene.children.filter((o) => o.isSprite && o.material && o.material.fog === false && o.scale.x > 100),
      weather: pts.slice(1, 3),
    };
    return ENV;
  }
  function beginInside() {
    findEnv();
    D.inside = true; D.deadH = false;
    D.prevPocket = API.pocket && API.pocket !== POCKET ? API.pocket : null;
    API.pocket = POCKET;
    D.saved = { dens: scene.fog.density, bg: scene.background, env: scene.environment };
    if (ENV.sky) ENV.sky.visible = false;
    for (const c of ENV.clouds) c.visible = false;
    for (const w of ENV.weather) w.visible = false;
    for (const l of D.lights) { l.intensity = 0; scene.add(l); }
    scene.add(D.lantern);
    document.body.classList.add('twin');
    if (UI.hud) UI.hud.style.display = 'block';
    if (UI.mini) UI.mini.style.display = 'block';
  }
  function endInside() {
    disposeFloor();
    D.inside = false; D.gate = false; D.boss = null;
    if (API.pocket === POCKET) API.pocket = D.prevPocket || null;
    D.prevPocket = null;
    if (D.saved) { scene.fog.density = D.saved.dens; scene.background = D.saved.bg || null; scene.environment = D.saved.env || scene.environment; }
    if (ENV) { if (ENV.sky) ENV.sky.visible = true; for (const c of ENV.clouds) c.visible = true; for (const w of ENV.weather) w.visible = true; }
    for (const l of D.lights) scene.remove(l);
    scene.remove(D.lantern);
    document.body.classList.remove('twin');
    if (UI.hud) UI.hud.style.display = 'none';
    if (UI.mini) UI.mini.style.display = 'none';
  }
  function fadeTo(fn, delay) {
    D.busy = true;
    if (API.state === 'play') API.state = 'menu';
    API.input.lock = null;
    const fade = $('fade'); if (fade) fade.style.opacity = 1;
    setTimeout(() => {
      try { fn(); } catch (err) { console.error('[dungeon3d]', err); }
      if (API.state === 'menu') API.state = 'play';
      if (fade) fade.style.opacity = 0;
      D.busy = false;
    }, delay || 950);
  }
  function enterFloor(f) {
    if (D.busy) return;
    f = Math.max(1, f | 0);
    sfx('portal');
    fadeTo(() => {
      if (!D.inside) beginInside();
      buildFloor(f);
      D.floor = f; D.unlocked = false; D.bossDead = false; D.boss = null; D.healOnce = false; D.introFrames = 0; setGate(false);
      const s = F.startPos;
      API.teleport(s.x, s.z); P.rot = s.rot; API.input.yaw = s.rot + Math.PI; API.input.pitch = 0.42;
      D.camPull = 0; D.titleT = 0.05; D.proxT = 0; D.flowT = 0; D.lightT = 0; D.exploreT = 0; D.seenDirty = true;
      const TS_ = TS();
      if (f > TS_.best) TS_.best = f;
      if (f > 1 && (f - 1) % 5 === 0 && f > TS_.checkpoint) { TS_.checkpoint = f; setTimeout(() => toast('Punto di controllo raggiunto: Piano ' + f), 2600); }
      API.saveS();
      music(F.TH.music);
      evt('3d:floor', { floor: f });
      setTimeout(() => analyseFloor(), 2200);
    });
  }
  function leaveTower() {
    if (D.busy) return;
    sfx('portal');
    fadeTo(() => {
      endInside();
      API.teleport(TOWER.ix - 4, TOWER.iz); P.rot = -Math.PI / 2; API.input.yaw = Math.PI / 2; API.input.pitch = 0.3;
      music('forest');
      setTimeout(() => API.bigMsg('Torre dei Mille Piani', 'place', 2.6), 300);
    });
  }
  const DIRN = (dx, dz) => { const a = Math.atan2(dx, -dz) * 180 / Math.PI; const n = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest']; return n[((Math.round(a / 45) % 8) + 8) % 8]; };
  function analyseFloor() {
    if (!D.inside || !F) return;
    const traps = F.traps.length, ch = F.chests.length;
    if (F.boss) oracle(`《Analisi del piano ${F.f}: rilevata una presenza dominante. Custode del piano: ${API.TYPES[F.bossRec.type].name}. Raccomandazione: prepararsi.》`, true);
    else oracle(`《Analisi del piano ${F.f}: ${D.total} ostili, ${traps} trappole, ${ch} scrigni. Il Sigillo è custodito a ${DIRN(wx(F.key.cx) - P.x, wz(F.key.cy) - P.z)}.》`);
  }
  function checkSeal() {
    if (!F || D.unlocked || F.boss) return;
    let g = 0, gk = 0;
    for (const pk of F.packs) for (const r of pk.list) if (r.seal) { g++; if (r.killed) gk++; }
    if ((g > 0 && gk >= g) || D.kills >= D.need) unlockPortal();
  }
  function unlockPortal() {
    if (D.unlocked) return;
    D.unlocked = true; setPortalState(true);
    sfx('portal'); API.bigMsg('IL SIGILLO SI INFRANGE', 'gold', 3);
    oracle(`《Sigillo infranto. Il passaggio per il piano ${F.f + 1} è aperto.》`, true);
    if (F.portal) { API.lightPillar(F.portal.x, F.portal.z, '#b070ff', 2.2); emit(F.portal.x, 2.5, F.portal.z, 60, '#c090ff', { speed: 6, up: 4, life: 1.4 }); }
  }
  function bossDefeated(e) {
    D.bossDead = true; D.boss = null;
    if (F.bossRec) F.bossRec.killed = true;
    setGate(false);
    const TS_ = TS(); TS_.bosses[e.type] = (TS_.bosses[e.type] || 0) + 1;
    if (F.f + 1 > TS_.checkpoint) TS_.checkpoint = F.f + 1;
    setTimeout(() => { if (S.bosses && S.bosses[e.type]) { delete S.bosses[e.type]; API.saveS(); } }, 60); // tower guardians are not overworld unique bosses
    API.saveS();
    setTimeout(() => {
      if (!D.inside || !F) return;
      const a = F.arena; const c = placeChest(a.cx, a.cy, 3); c.m.root.position.y = 0;
      API.lightPillar(c.x, c.z, '#ffb020', 2); emit(c.x, 1, c.z, 60, '#ffd36b', { speed: 5, up: 5, life: 1.4 });
      unlockPortalBoss();
    }, 2200);
    setTimeout(() => { if (D.inside && F) music(F.TH.music); }, 1600);
    setTimeout(() => toast('Punto di controllo sbloccato: Piano ' + (F ? F.f + 1 : '')), 4200);
  }
  function unlockPortalBoss() { D.unlocked = true; setPortalState(true); sfx('portal'); oracle('《Custode sconfitto. Il passaggio verso l\'alto si è aperto.》', true); }

  /* ================================================================ per-frame updates */
  function updateMobs(dt) {
    // flow field toward the player (recomputed when the player changes cell)
    const pc = idx(clamp(cxOf(P.x), 0, GW - 1), clamp(cyOf(P.z), 0, GH - 1));
    D.flowT -= dt;
    if (pc !== F.flowCell && D.flowT <= 0) { F.flowCell = pc; D.flowT = 0.25; bfs(F.flow, pc % GW, (pc / GW) | 0); }
    for (let i = D.mobs.length - 1; i >= 0; i--) {
      const e = D.mobs[i];
      if (API.enemies.indexOf(e) < 0) { D.mobs.splice(i, 1); continue; }
      if (e.dead) continue;
      const r = (e.d.r || 0.7) * 0.85;
      if (e._px != null && e.engaged && !e.atk && !(e.stagger > 0) && !e.d.boss) {
        e._losT = (e._losT || 0) - dt;
        if (e._losT <= 0) { e._losT = 0.25 + Math.random() * 0.1; e._los = losClear(e.x, e.z, P.x, P.z); }
        if (!e._los) {
          const cx = cxOf(e.x), cy = cyOf(e.z);
          let best = inb(cx, cy) ? F.flow[idx(cx, cy)] : -1, bx = 0, bz = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx, ny = cy + dy;
            if (!open(nx, ny)) continue;
            if (dx && dy && (!open(cx + dx, cy) || !open(cx, cy + dy))) continue;
            const v = F.flow[idx(nx, ny)];
            if (v >= 0 && (best < 0 || v < best)) { best = v; bx = wx(nx) - e.x; bz = wz(ny) - e.z; }
          }
          const l = Math.hypot(bx, bz);
          if (l > 0.01) {
            const moved = Math.hypot(e.x - e._px, e.z - e._pz), sp = Math.max(moved, e.d.speed * dt * 0.9);
            e.x = e._px + bx / l * sp; e.z = e._pz + bz / l * sp;
            const want = Math.atan2(bx, bz); e.rot += angDiff(e.rot, want) * Math.min(1, dt * 8);
            e.model.root.rotation.y = e.rot;
          }
        }
      }
      if (e.d.boss && F.arena) {
        const a = F.arena, x0 = OX + a.x * CS + r, x1 = OX + (a.x + a.w) * CS - r, z0 = OZ + a.y * CS + r, z1 = OZ + (a.y + a.h) * CS - r;
        e.x = clamp(e.x, x0, x1); e.z = clamp(e.z, z0, z1);
      } else pushOut(e, r);
      e.model.root.position.x = e.x; e.model.root.position.z = e.z;
      e._px = e.x; e._pz = e.z;
      if (e._aura) { e._aura.rotation.z += dt * 1.5; e._aura.material.opacity = 0.55 + Math.sin(D.time * 4 + i) * 0.25; if (Math.random() < dt * 5) emit(e.x + rand(-0.7, 0.7), 0.2, e.z + rand(-0.7, 0.7), 1, e._rec && e._rec.seal ? '#ff3b5a' : '#ff9a3a', { speed: 0.3, up: 2, grav: -0.5, life: 0.8, size: 0.35, bright: 2 }); }
    }
    // stray enemies of other modules inside the pocket also respect the walls
    for (const e of API.enemies) { if (e.dead || e._tw || !inPocket(e.x, e.z)) continue; pushOut(e, (e.d.r || 0.7) * 0.85); e.model.root.position.x = e.x; e.model.root.position.z = e.z; }
  }
  function updateBossFlow(dt) {
    if (!F.boss || D.bossDead) return;
    const a = F.arena, inA = P.x > OX + (a.x + 0.6) * CS && P.x < OX + (a.x + a.w - 0.6) * CS && P.z > OZ + (a.y + 0.6) * CS && P.z < OZ + (a.y + a.h - 0.6) * CS;
    if (!D.gate && inA && D.boss && !D.boss.dead) {
      setGate(true); D.boss.passive = false;
      sfx('portal'); oracle('《La nebbia sigilla l\'arena. Nessuna via di fuga.》');
    }
    for (const g of F.gates) { g.m.material.opacity = (D.gate ? 0.42 : 0.2) + Math.sin(D.time * 3 + g.cx) * 0.08; }
    if (D.gate) {
      const x0 = OX + a.x * CS + P.r, x1 = OX + (a.x + a.w) * CS - P.r, z0 = OZ + a.y * CS + P.r, z1 = OZ + (a.y + a.h) * CS - P.r;
      P.x = clamp(P.x, x0, x1); P.z = clamp(P.z, z0, z1);
      if (Math.random() < dt * 10) { const g = F.gates[(Math.random() * F.gates.length) | 0]; if (g) emit(g.m.position.x, rand(0.3, 5), g.m.position.z, 1, '#ffe6b0', { speed: 0.5, up: 1, grav: -0.5, life: 1, size: 0.4 }); }
    }
  }
    function flick(ph, t) { return 0.78 + 0.12 * Math.sin(t * 7.3 + ph) + 0.07 * Math.sin(t * 13.1 + ph * 1.7) + 0.05 * Math.sin(t * 2.1 + ph * 0.3); }
  function updateTorches(dt) {
    const t = D.time;
    // light pool: nearest torches (cheap selection every 0.3s)
    D.lightT -= dt;
    if (D.lightT <= 0) {
      D.lightT = 0.3;
      const ts = F.dyn.length ? F.torches.concat(F.dyn) : F.torches;
      for (const tc of ts) { if (tc.follow) { tc.x = tc.follow.x; tc.z = tc.follow.z; } const dx = tc.x - P.x, dz = tc.z - P.z; tc._d = dx * dx + dz * dz - (tc.prio ? 120 : 0) - (tc.follow ? 900 : 0); }
      const n = D.lights.length;
      F.lit = F.lit || [];
      F.lit.length = 0;
      for (let k = 0; k < n; k++) {
        let bi = -1, bd = 1e9;
        for (let i = 0; i < ts.length; i++) { const tc = ts[i]; if (tc._pick === D.time) continue; if (tc._d < bd) { bd = tc._d; bi = i; } }
        if (bi < 0) break;
        ts[bi]._pick = D.time; F.lit.push(ts[bi]);
      }
      for (let k = 0; k < n; k++) { const l = D.lights[k], tc = F.lit[k]; if (tc) { l.position.set(tc.x, tc.y + 0.2, tc.z); l.color.set(tc.col); l.userData.tc = tc; } else l.userData.tc = null; }
    }
    D.lantern.position.set(P.x, P.y + 3.4, P.z);
    D.lantern.color.set(F.TH.lantern || '#ffe0b0');
    D.lantern.intensity = 9 * (0.95 + 0.05 * Math.sin(t * 3.1));
    for (const l of D.lights) {
      const tc = l.userData.tc;
      if (!tc) { l.intensity = 0; continue; }
      if (tc.wi >= 0 && F.cut[tc.wi] < 0.85) { l.intensity = 0; continue; }
      if (tc.follow) { if (tc.follow.dead || !tc.follow.model.root.visible) { l.intensity = 0; continue; } l.position.set(tc.follow.x, tc.follow.y + tc.y, tc.follow.z); l.intensity = tc.base; continue; }
      const k = flick(tc.ph, t);
      l.intensity = (tc.kind === 'brazier' ? 34 : tc.kind === 'torch' ? 24 : 20) * tc.base * (tc.kind === 'crystal' || tc.kind === 'portal' ? 0.85 + 0.15 * Math.sin(t * 1.5 + tc.ph) : k);
    }
    // flames + glow halos near the player
    const fl = F.flames, pos = F.glow.geometry.attributes.color.array, gc = F.glowCol;
    let emitted = 0;
    for (let i = 0; i < F.torches.length; i++) {
      const tc = F.torches[i];
      const near = Math.abs(tc.x - P.x) < 36 && Math.abs(tc.z - P.z) < 36 && !(tc.wi >= 0 && F.cut[tc.wi] < 0.85);
      if (!near) { pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0; if (tc.kind === 'torch') { _m4.makeScale(0, 0, 0); fl.setMatrixAt(i, _m4); } continue; }
      const k = flick(tc.ph, t);
      if (tc.kind === 'torch' || tc.kind === 'brazier') {
        const fd = F.flameData[i];
        _e.set(Math.sin(t * 9 + tc.ph) * 0.12, 0, Math.sin(t * 7 + tc.ph) * 0.12); _q.setFromEuler(_e);
        _m4.compose(_v.set(fd.x, fd.y, fd.z), _q, _s.set(fd.s * (0.8 + 0.3 * k), fd.s * (0.7 + 0.6 * k), fd.s * (0.8 + 0.3 * k)));
        fl.setMatrixAt(i, _m4);
        const g = 1.1 * k; pos[i * 3] = gc.r * g; pos[i * 3 + 1] = gc.g * g; pos[i * 3 + 2] = gc.b * g;
        if (emitted < 3 && Math.random() < dt * 2.5) { emitted++; emit(tc.x + rand(-0.06, 0.06), tc.y + 0.25, tc.z + rand(-0.06, 0.06), 1, tc.col, { speed: 0.35, up: 1.6, grav: -1.2, life: 1.0, size: 0.16, bright: 2.6 }); }
      } else {
        _c.set(tc.col); const g = 0.55 * k; pos[i * 3] = _c.r * g; pos[i * 3 + 1] = _c.g * g; pos[i * 3 + 2] = _c.b * g;
        if (tc.kind !== 'torch' && tc.kind !== 'brazier') { _m4.makeScale(0, 0, 0); fl.setMatrixAt(i, _m4); }
      }
    }
    fl.instanceMatrix.needsUpdate = true;
    F.glow.geometry.attributes.color.needsUpdate = true;
  }
  function updateDust(dt) {
    const d = F.dust; if (!d) return;
    const pos = d.geometry.attributes.position.array, col = d.geometry.attributes.color.array, c = F.dustC, t = D.time;
    const rise = F.TH.id === 'forge', fall = F.TH.id === 'frost';
    for (let i = 0; i < F.dustData.length; i++) {
      const p = F.dustData[i];
      if (p.y < -1 || p.y > 7.5 || Math.abs(p.x - P.x) > 15 || Math.abs(p.z - P.z) > 15) { p.x = P.x + rand(-15, 15); p.z = P.z + rand(-15, 15); p.y = rise ? rand(0, 1) : fall ? rand(4, 7) : rand(0.2, 6); }
      p.ph += dt * p.sp;
      p.x += Math.sin(p.ph) * dt * 0.25; p.z += Math.cos(p.ph * 0.8) * dt * 0.25;
      p.y += rise ? dt * 0.9 * p.sp : fall ? -dt * 0.5 * p.sp : Math.sin(p.ph * 1.3) * dt * 0.08;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const tw = (0.5 + 0.5 * Math.sin(t * 1.7 + p.ph * 3)) * p.k * (rise ? 3 : 1);
      col[i * 3] = c.r * tw; col[i * 3 + 1] = c.g * tw; col[i * 3 + 2] = c.b * tw;
    }
    d.geometry.attributes.position.needsUpdate = true; d.geometry.attributes.color.needsUpdate = true;
  }
  function updateDecor(dt) {
    const t = D.time;
    if (F.portal) {
      const p = F.portal;
      p.disc.rotation.z -= dt * (D.unlocked ? 2.4 : 0.5);
      p.rune.rotation.z += dt * (D.unlocked ? 0.6 : 0.15);
      p.gem.rotation.y += dt * 2; p.gem.position.y = 5.9 + Math.sin(t * 2) * 0.1;
      const near = Math.abs(P.x - p.x) < 30 && Math.abs(P.z - p.z) < 30;
      if (near && Math.random() < dt * (D.unlocked ? 30 : 5)) {
        const a = rand(0, TAU), r = rand(0.5, 2.2);
        emit(p.x + Math.cos(a) * r, 0.8, p.z + Math.sin(a) * r, 1, D.unlocked ? (Math.random() < 0.5 ? '#c090ff' : '#ffd36b') : '#ff3030', { speed: 0.3, up: D.unlocked ? 3 : 1, grav: -1, life: 1.4, size: 0.3, bright: 2.4 });
      }
    }
    if (F.crystal) {
      const c = F.crystal;
      c.cr.rotation.y += dt * 0.8; c.cr.position.y = 2.2 + Math.sin(t * 1.6) * 0.15;
      c.r1.rotation.x = Math.PI / 2 + Math.sin(t * 0.7) * 0.3; c.r1.rotation.z += dt; c.r2.rotation.y += dt * 1.6;
      c.halo.material.opacity = 0.55 + Math.sin(t * 2) * 0.15;
      if (Math.random() < dt * 4) emit(c.x + rand(-0.8, 0.8), 1.2, c.z + rand(-0.8, 0.8), 1, '#7fd8ff', { speed: 0.2, up: 1.2, grav: -0.6, life: 1.4, size: 0.25, bright: 2 });
    }
    if (F.shards && F.shardList) {
      const im = F.shards, L = F.shardList;
      for (let i = 0; i < L.length; i++) {
        const s = L[i];
        if (Math.abs(s.x - P.x) > 40 || Math.abs(s.z - P.z) > 40) continue;
        _e.set(t * 0.5 + s.ph, t * 0.8 + s.ph, 0); _q.setFromEuler(_e);
        _m4.compose(_v.set(s.x, s.y + Math.sin(t * 1.2 + s.ph) * 0.4, s.z), _q, _s.set(s.sx, s.sy, s.sz)); im.setMatrixAt(i, _m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    for (const sd of F.shardData) if (sd.ring) sd.ring.rotation.y += dt * 0.15;
    if (F.arenaRing) { F.arenaRing.rotation.z += dt * (D.gate ? 0.35 : 0.08); F.arenaRing.material.opacity = D.bossDead ? 0.3 : D.gate ? 0.75 + Math.sin(t * 4) * 0.2 : 0.45; }
    if (F.lavas.length) {
      MAT.lavaPool.color.copy(hdr('#ff6a1a', 2 + Math.sin(t * 1.3) * 0.4));
      D.lavaT -= dt;
      for (const lv of F.lavas) {
        const d = Math.hypot(P.x - lv.x, P.z - lv.z);
        if (d < lv.r + 4 && Math.random() < dt * 3) emit(lv.x + rand(-lv.r, lv.r) * 0.7, 0.2, lv.z + rand(-lv.r, lv.r) * 0.7, 1, '#ff8a2a', { speed: 0.5, up: 2.5, grav: 1, life: 1, size: 0.3, bright: 2.5 });
        if (d < lv.r - 0.2 && P.y < 0.4 && D.lavaT <= 0) { D.lavaT = 0.5; API.hurtPlayer(Math.round(P.maxHp * 0.06), lv.x, lv.z); emit(P.x, 0.5, P.z, 12, '#ff6a1a', { speed: 3, up: 3 }); }
      }
    }
  }
  function explore() {
    const cx = cxOf(P.x), cy = cyOf(P.z), R2 = 4;
    let changed = false;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      if (dx * dx + dy * dy > R2 * R2 + 1) continue;
      const x = cx + dx, y = cy + dy;
      if (!inb(x, y)) continue;
      const i = idx(x, y);
      if (!F.seen[i]) { F.seen[i] = 1; changed = true; }
    }
    const ri = inb(cx, cy) ? F.rid[idx(cx, cy)] : -1;
    if (ri >= 0 && !F.rooms[ri].seen) {
      const r = F.rooms[ri]; r.seen = true; changed = true;
      for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (inb(x, y)) F.seen[idx(x, y)] = 1;
    }
    if (changed) D.seenDirty = true;
  }

  /* ================================================================ camera + atmosphere (run from the hud hook: after the engine camera and day cycle) */
  const _fwd = new T.Vector3();
  // Walls between the camera and the player are lowered (cutaway) so the camera can keep its distance; anything still in the
  // way (pillars, very low camera angles) pulls the camera in along its view ray.
  const CUT = 0.3;
  function setWallH(wi, c) {
    const w = F.wallList[wi];
    _e.set(0, w.ry, 0); _q.setFromEuler(_e);
    _m4.compose(_v.set(w.x, 0, w.z), _q, _s.set(1, w.sy * c, 1)); F.wallIM.setMatrixAt(wi, _m4);
    _m4.compose(_v.set(w.x, (w.sy * c - 1) * WH, w.z), _q.identity(), _s.set(1, 1, 1)); F.capIM.setMatrixAt(wi, _m4);
    const at = F.attach[wi];
    if (at) {
      const hide = c < 0.85;
      if (hide !== !!w.hid) { w.hid = hide; for (const a of at) { a.im.setMatrixAt(a.i, hide ? ZERO_M : a.m); a.im.instanceMatrix.needsUpdate = true; } }
    }
  }
  const ZERO_M = new T.Matrix4().makeScale(0, 0, 0);
  function cameraOcclusion(dt) {
    // boss intro: the engine runs its own orbit camera ('cine' state; no update hook that frame)
    if (API.state === 'cine' || (D.boss && D.boss.introDone && (D.introFrames || 0) < 2 && !D.updRan)) return;
    const ex = camera.position.x, ez = camera.position.z, ey = camera.position.y;
    const px = P.x, pz = P.z, py = P.y + 1.4;
    const dx = ex - px, dz = ez - pz, L = Math.hypot(dx, dz);
    const want = F.cutWant; want.fill(0);
    let keep = 1;
    if (L > 0.6 && F.wallIM) {
      const n = Math.ceil(L / 0.3), lx = -dz / L, lz = dx / L;
      for (let i = 1; i <= n; i++) {
        const t = i / n, x = px + dx * t, z = pz + dz * t, y = py + (ey - py) * t;
        if (y > WH * 1.1 + 0.6) break;
        const wd = 0.45 + t * 1.1; // widening cone toward the camera (neighbouring wall cells would frame the view)
        for (let o = -2; o <= 2; o++) {
          const cx = cxOf(x + lx * o * wd), cy = cyOf(z + lz * o * wd);
          if (!inb(cx, cy)) continue;
          const wi = F.wallIdx[idx(cx, cy)];
          if (wi < 0 || y > WH * F.wallList[wi].sy + 0.4) continue;
          want[wi] = 1;
          if (!F.cutIn[wi]) { F.cutIn[wi] = 1; F.cutList.push(wi); }
        }
        if (keep === 1) {
          const cx = cxOf(x), cy = cyOf(z), wi = inb(cx, cy) ? F.wallIdx[idx(cx, cy)] : -1;
          const blocked = (wi >= 0 && y < WH * F.wallList[wi].sy * F.cut[wi] + 0.45) || nearPillar(x, z, y) || (F.block[idx(clamp(cx, 0, GW - 1), clamp(cy, 0, GH - 1))] && y < 6.5);
          if (blocked) keep = Math.max(0.3, (t * L - 0.45) / L);
        }
      }
    }
    // animate the cutaway
    let dirty = false;
    for (let k = F.cutList.length - 1; k >= 0; k--) {
      const wi = F.cutList[k], tgt = want[wi] ? CUT : 1;
      const c = F.cut[wi] + clamp(tgt - F.cut[wi], -dt * 3.5, dt * 3.5);
      if (c !== F.cut[wi]) { F.cut[wi] = c; setWallH(wi, c); dirty = true; }
      if (!want[wi] && c >= 1) { F.cutIn[wi] = 0; F.cutList.splice(k, 1); }
    }
    if (dirty) { F.wallIM.instanceMatrix.needsUpdate = true; F.capIM.instanceMatrix.needsUpdate = true; }
    const pull = 1 - keep;
    D.camPull = pull > D.camPull ? pull : lerp(D.camPull, pull, Math.min(1, dt * 5));
    if (D.camPull > 0.002) {
      camera.getWorldDirection(_fwd);
      const dist = Math.hypot(dx, dz, ey - py) * D.camPull;
      camera.position.addScaledVector(_fwd, dist);
    }
  }
  function nearPillar(x, z, y) {
    for (const c of F.circles) if (c.h && y < c.h && Math.abs(x - c.x) < c.r && Math.abs(z - c.z) < c.r) return true;
    return false;
  }
  function applyAtmos() {
    const TH = F.TH;
    scene.fog.color.copy(TH.fogC); scene.fog.density = TH.dens * (LOW ? 1.15 : 1);
    scene.background = TH.fogC;
    scene.environment = null;
    if (ENV.hemi) { ENV.hemi.intensity = TH.hemi; ENV.hemi.color.copy(TH.hemiSkyC); ENV.hemi.groundColor.copy(TH.hemiGroundC); }
    if (ENV.sun) { ENV.sun.intensity = TH.sunI; ENV.sun.color.copy(TH.sunC); }
  }

  /* ================================================================ UI: HUD line, minimap, floor selection */
  const UI = {};
  function buildUI() {
    const st = document.createElement('style');
    st.textContent = `
#twhud{position:absolute;left:50%;top:30px;transform:translateX(-50%);text-align:center;pointer-events:none;display:none;white-space:nowrap;
 text-shadow:0 1px 3px #000,0 0 8px #000;font-family:"Palatino Linotype",Georgia,serif}
#twhud .a{font-size:13px;letter-spacing:2px;color:#f3d27a}
#twhud .b{font-size:11px;color:#d8c79a;margin-top:1px;letter-spacing:.5px}
#twhud .b i{font-style:normal;color:#ff8a7a}#twhud .b i.ok{color:#a8ffb8}
#twmini{position:absolute;right:calc(10px + env(safe-area-inset-right));top:62px;width:118px;height:118px;border:1px solid rgba(214,186,120,.75);border-radius:6px;
 background:rgba(6,5,4,.72);box-shadow:0 0 10px rgba(0,0,0,.7),inset 0 0 14px #000;display:none;pointer-events:auto;cursor:pointer;transition:width .25s,height .25s}
#twmini.big{width:min(62vh,300px);height:min(62vh,300px)}
body.twin #qtrk{top:190px !important}
body.twin #tod{visibility:hidden}
#twsel .box{width:min(460px,92vw);border-color:rgba(230,195,120,.75);box-shadow:0 0 40px rgba(240,190,90,.22),inset 0 0 30px rgba(0,0,0,.6);
 background:radial-gradient(ellipse at 50% 0%,rgba(120,70,160,.25),transparent 60%),linear-gradient(#1d1810,#0f0c07)}
#twsel h2{font-size:22px;margin-bottom:2px}
#twsel .sub{text-align:center;color:#c9b27a;font-size:13px;margin-bottom:10px;letter-spacing:1px}
#twsel button{text-align:left;padding:11px 14px;min-height:48px;font-size:16px;position:relative}
#twsel button small{display:block;color:#a8987a;font-size:12px;margin-top:2px}
#twsel button b{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-weight:normal;color:#7d6f52;font-size:12px}
#twsel button.pri{border-color:rgba(255,205,120,.85);box-shadow:0 0 12px rgba(255,190,90,.25)}
#twsel .x{text-align:center}`;
    document.head.appendChild(st);
    const hudEl = $('hud') || document.body;
    UI.hud = document.createElement('div'); UI.hud.id = 'twhud'; UI.hud.innerHTML = '<div class="a"></div><div class="b"></div>'; hudEl.appendChild(UI.hud);
    UI.hudA = UI.hud.querySelector('.a'); UI.hudB = UI.hud.querySelector('.b');
    UI.mini = document.createElement('canvas'); UI.mini.id = 'twmini'; UI.mini.width = UI.mini.height = 224; hudEl.appendChild(UI.mini);
    UI.mctx = UI.mini.getContext('2d');
    UI.mini.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); toggleMini(); });
    UI.off = document.createElement('canvas'); UI.off.width = GW; UI.off.height = GH; UI.octx = UI.off.getContext('2d'); UI.oimg = UI.octx.createImageData(GW, GH);
    UI.sel = document.createElement('div'); UI.sel.className = 'panel'; UI.sel.id = 'twsel';
    UI.sel.innerHTML = '<div class="box"><h2>Torre dei Mille Piani</h2><div class="sub"></div><div class="opts"></div><button class="x">Allontanati</button></div>';
    document.body.appendChild(UI.sel);
    UI.sel.querySelector('.x').addEventListener('click', () => closeSel());
    UI.sel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    window.addEventListener('keydown', (ev) => {
      if (UI.selOpen) {
        ev.stopPropagation();
        if (ev.code === 'Escape' || ev.code === 'KeyP') { ev.preventDefault(); closeSel(); return; }
        const m = /^Digit([1-9])$/.exec(ev.code);
        if (m && !ev.repeat) { const b = UI.sel.querySelectorAll('.opts button')[+m[1] - 1]; if (b) b.click(); }
        if ((ev.code === 'Enter' || ev.code === 'KeyE') && !ev.repeat) { const b = UI.sel.querySelector('.opts button.pri'); if (b) b.click(); }
        return;
      }
      if (ev.code === 'KeyN' && D.inside && !ev.repeat) toggleMini();
    }, true);
  }
  function toggleMini() { D.bigMini = !D.bigMini; UI.mini.classList.toggle('big', D.bigMini); D.seenDirty = true; sfx('ui', { vol: 0.4 }); }
  function openSel() {
    const t = TS(), cps = [1];
    for (let f = 6; f <= t.checkpoint; f += 5) cps.push(f);
    if (cps.length === 1) { enterFloor(1); return; }
    UI.sub = UI.sel.querySelector('.sub');
    UI.sub.textContent = `Piano più alto raggiunto: ${t.best} · Scegli da dove iniziare l'ascesa`;
    const box = UI.sel.querySelector('.opts'); box.innerHTML = '';
    cps.slice(-8).forEach((f, i, arr) => {
      const b = document.createElement('button');
      if (i === arr.length - 1) b.className = 'pri';
      b.innerHTML = `${f === 1 ? 'Ingresso' : 'Punto di controllo'} — Piano ${f}<small>${themeOf(f).name} · Livello consigliato ${floorLevel(f)}</small><b>${i + 1}</b>`;
      b.addEventListener('click', () => { closeSel(true); enterFloor(f); });
      box.appendChild(b);
    });
    UI.sel.classList.add('open'); UI.selOpen = true;
    if (API.state === 'play') API.state = 'menu';
    sfx('ui');
  }
  function closeSel(go) {
    UI.sel.classList.remove('open'); UI.selOpen = false;
    if (!go && API.state === 'menu') API.state = 'play';
    if (!go) sfx('uiBack');
  }
  function hudText() {
    let b;
    if (F.boss) b = D.bossDead ? '<i class="ok">Custode sconfitto — il passaggio è aperto</i>' : `Custode del piano: <i>${API.TYPES[F.bossRec.type].name}</i>`;
    else if (D.unlocked) b = '<i class="ok">Sigillo infranto — il portale è aperto</i>';
    else {
      let g = 0, gk = 0; for (const pk of F.packs) for (const r of pk.list) if (r.seal) { g++; if (r.killed) gk++; }
      b = `Sigillo: guardiani <i>${gk}/${g}</i> · oppure abbattuti <i>${D.kills}/${D.need}</i>`;
    }
    const a = `Torre dei Mille Piani — Piano ${F.f}`;
    const key = a + b;
    if (key !== D.hudKey) { D.hudKey = key; UI.hudA.textContent = a; UI.hudB.innerHTML = `${F.TH.name} · ${b}`; }
  }
  const MC = { room: [138, 122, 90], cor: [104, 92, 68], wall: [44, 38, 28] };
  function drawMini() {
    if (D.seenDirty) {
      D.seenDirty = false;
      const d = UI.oimg.data;
      for (let i = 0; i < GW * GH; i++) {
        const o = i * 4;
        if (!F.seen[i]) { d[o + 3] = 0; continue; }
        const g = F.grid[i], c = g === 1 ? MC.room : g === 2 ? MC.cor : MC.wall;
        if (!g) { // only draw walls bordering floor
          const x = i % GW, y = (i / GW) | 0; let edge = false;
          for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, y + dy) && F.grid[idx(x + dx, y + dy)]) { edge = true; break; }
          if (!edge) { d[o + 3] = 0; continue; }
        }
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      UI.octx.putImageData(UI.oimg, 0, 0);
    }
    const x = UI.mctx, W = UI.mini.width, s = W / GW;
    x.clearRect(0, 0, W, W);
    x.imageSmoothingEnabled = false;
    x.globalAlpha = 0.92; x.drawImage(UI.off, 0, 0, W, W); x.globalAlpha = 1;
    const at = (px, pz) => [(px - OX) / CS * s, (pz - OZ) / CS * s];
    const seenAt = (px, pz) => { const cx = cxOf(px), cy = cyOf(pz); return inb(cx, cy) && F.seen[idx(cx, cy)]; };
    // chests
    for (const c of F.chests) { if (c.opened || !seenAt(c.x, c.z)) continue; const [u, v] = at(c.x, c.z); x.fillStyle = RAR[c.tier].c; x.fillRect(u - 3, v - 3, 6, 6); }
    // crystal + portal
    if (F.crystal) { const [u, v] = at(F.crystal.x, F.crystal.z); x.fillStyle = '#7fd8ff'; x.beginPath(); x.arc(u, v, 4, 0, TAU); x.fill(); }
    if (F.portal && seenAt(F.portal.x, F.portal.z)) { const [u, v] = at(F.portal.x, F.portal.z); x.strokeStyle = D.unlocked ? '#d0a0ff' : '#ff4a4a'; x.lineWidth = 2.5; x.beginPath(); x.arc(u, v, 5 + Math.sin(D.time * 4) * 1.2, 0, TAU); x.stroke(); }
    // nearby hostiles
    x.fillStyle = '#ff4a3a';
    for (const e of D.mobs) { if (e.dead || Math.abs(e.x - P.x) > 30 || Math.abs(e.z - P.z) > 30) continue; const [u, v] = at(e.x, e.z); x.beginPath(); x.arc(u, v, e.d.boss ? 5 : e.elite ? 3.2 : 2.2, 0, TAU); x.fill(); }
    // player arrow
    const [u, v] = at(P.x, P.z);
    x.save(); x.translate(u, v); x.rotate(-P.rot + Math.PI); x.fillStyle = '#4fc3ff'; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, -7); x.lineTo(5, 5); x.lineTo(-5, 5); x.closePath(); x.fill(); x.stroke(); x.restore();
  }

  /* ================================================================ tower exterior */
  const TW = { group: null, runes: [], rocks: null, rockG: null, portal: null, braz: [], t: 0 };
  function buildTower() {
    const g = new T.Group(); TW.group = g; scene.add(g);
    let gmin = 1e9, gmax = -1e9;
    for (let a = 0; a < 16; a++) for (const r of [0, 8, 16]) { const h = API.heightAt(TOWER.x + Math.cos(a / 16 * TAU) * r, TOWER.z + Math.sin(a / 16 * TAU) * r); gmin = Math.min(gmin, h); gmax = Math.max(gmax, h); }
    const gy = gmin; TW.gy = gy;
    const gateG = API.heightAt(TOWER.x - 19, TOWER.z);
    const tex = TX.brick.map.clone(); tex.needsUpdate = true; tex.repeat.set(14, 6);
    const ntex = TX.brick.normal ? TX.brick.normal.clone() : null; if (ntex) { ntex.needsUpdate = true; ntex.repeat.set(14, 6); }
    const stone = new T.MeshStandardMaterial({ color: '#b3a894', map: tex, normalMap: ntex, roughness: 0.9, metalness: 0.03 });
    const dark = new T.MeshStandardMaterial({ color: '#6e655a', map: tex, roughness: 0.92, metalness: 0.03 });
    const runeMat = new T.MeshBasicMaterial({ map: TX.runes.clone(), color: hdr('#6ff0ff', 2.2), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide });
    runeMat.map.needsUpdate = true; runeMat.map.repeat.set(6, 1); runeMat.map.wrapS = runeMat.map.wrapT = T.RepeatWrapping; TW.runeMat = runeMat;
    const add = (geo, mat, x, y, z, rx, ry, rz) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const X = TOWER.x, Z = TOWER.z;
    // base plinth (sunk into the ground) + stepped foundation
    const baseTop = Math.max(gateG + 1.1, gmin + 1.1);
    add(new T.CylinderGeometry(15.5, 17.5, baseTop - gy + 6, 12), dark, X, (baseTop + gy - 6) / 2, Z);
    add(new T.CylinderGeometry(16.6, 17.4, 1.6, 12), dark, X, gy + 0.3, Z);
    add(new T.CylinderGeometry(15.9, 15.9, 0.8, 12), stone, X, baseTop + 0.4, Z);
    // tapering segments
    const N = 11, segH = 26; let y = baseTop + 0.8;
    for (let i = 0; i < N; i++) {
      const rb = lerp(13, 4.4, i / N), rt = lerp(13, 4.4, (i + 1) / N) * 0.97;
      const seg = add(new T.CylinderGeometry(rt, rb, segH, 12), i % 2 ? stone : dark, X, y + segH / 2, Z, 0, i * 0.26, 0);
      seg.castShadow = i < 3;
      add(new T.CylinderGeometry(rt + 0.9, rt + 0.6, 1.3, 12), dark, X, y + segH + 0.2, Z, 0, i * 0.26, 0);
      const band = new T.Mesh(new T.CylinderGeometry(lerp(rb, rt, 0.5) * 1.012, lerp(rb, rt, 0.5) * 1.012, 2.2, 24, 1, true), runeMat);
      band.position.set(X, y + segH * 0.5, Z); g.add(band); TW.runes.push(band);
      y += segH + 0.8;
    }
    TW.top = y;
    // spire and beacon
    add(new T.ConeGeometry(4.6, 34, 12), dark, X, y + 17, Z);
    const beacon = new T.Mesh(new T.OctahedronGeometry(2.2, 0), new T.MeshBasicMaterial({ color: hdr('#c08aff', 4), fog: false }));
    beacon.position.set(X, y + 40, Z); g.add(beacon); TW.beacon = beacon;
    const beam = new T.Mesh(new T.CylinderGeometry(0.7, 1.6, 600, 10, 1, true), new T.MeshBasicMaterial({ color: hdr('#b080ff', 1.2), transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
    beam.position.set(X, y + 340, Z); g.add(beam); TW.beam = beam;
    const halo = new T.Mesh(new T.TorusGeometry(9, 0.25, 4, 48), new T.MeshBasicMaterial({ color: hdr('#c08aff', 2.4), transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    halo.position.set(X, y + 30, Z); halo.rotation.x = Math.PI / 2; g.add(halo); TW.halo = halo;
    // buttresses
    const butt = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; if (Math.abs(angDiff(a, Math.PI)) < 0.5) continue; butt.push({ x: X + Math.cos(a) * 16.2, y: gy + 9, z: Z + Math.sin(a) * 16.2, sx: 3, sy: 22, sz: 4.2, ry: -a, rz: 0, c: 0.85 }); }
    {
      const im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), dark, butt.length);
      butt.forEach((b, i) => { _e.set(0, b.ry, 0.0); _q.setFromEuler(_e); _m4.compose(_v.set(b.x, b.y, b.z), _q, _s.set(b.sx, b.sy, b.sz)); im.setMatrixAt(i, _m4); });
      im.castShadow = true; im.receiveShadow = true; g.add(im);
      for (const b of butt) API.COLL.push({ x: b.x, z: b.z, r: 2.4 });
    }
    // glowing windows
    {
      const list = []; y = baseTop + 0.8;
      for (let i = 0; i < N; i++) { const r = lerp(13, 4.4, (i + 0.5) / N); for (let k = 0; k < 3; k++) { const a = i * 1.7 + k * TAU / 3; list.push([X + Math.cos(a) * r * 0.99, y + segH * (0.3 + 0.4 * ((k + i) % 2)), Z + Math.sin(a) * r * 0.99, -a]); } y += segH + 0.8; }
      const im = new T.InstancedMesh(new T.BoxGeometry(0.4, 2.4, 1.1), new T.MeshBasicMaterial({ color: hdr('#ffc860', 2.4), fog: false }), list.length);
      list.forEach((w, i) => { _e.set(0, w[3], 0); _q.setFromEuler(_e); _m4.compose(_v.set(w[0], w[1], w[2]), _q, _s.set(1, 1, 1)); im.setMatrixAt(i, _m4); });
      g.add(im);
    }
    // floating rocks with crystals (one rotating group)
    {
      const rg = new T.Group(); rg.position.set(X, 0, Z); g.add(rg); TW.rockG = rg;
      const R = rng(4242), rocks = [], crys = [];
      for (let i = 0; i < 22; i++) {
        const a = R() * TAU, r = 19 + R() * 22, h = i < 6 ? gy + 6 + R() * 10 : gy + 30 + R() * 220, s = 1.2 + R() * (i < 6 ? 2 : 4.5);
        rocks.push([Math.cos(a) * r, h, Math.sin(a) * r, s, R()]);
        crys.push([Math.cos(a) * r, h - s * 0.9, Math.sin(a) * r, s * 0.5, R()]);
      }
      const ri = new T.InstancedMesh(new T.DodecahedronGeometry(1, 0), dark, rocks.length), ci = new T.InstancedMesh(new T.OctahedronGeometry(1, 0), new T.MeshBasicMaterial({ color: hdr('#7ff0ff', 2.2) }), crys.length);
      rocks.forEach((p, i) => { _e.set(p[4] * 3, p[4] * 5, 0); _q.setFromEuler(_e); _m4.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(p[3], p[3] * 0.7, p[3])); ri.setMatrixAt(i, _m4); });
      crys.forEach((p, i) => { _e.set(Math.PI, p[4] * 3, 0); _q.setFromEuler(_e); _m4.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(p[3] * 0.5, p[3] * 1.3, p[3] * 0.5)); ci.setMatrixAt(i, _m4); });
      ri.castShadow = true; rg.add(ri, ci); TW.rockData = rocks;
    }
    // entrance gate (west face) with swirling portal
    const gx = X - 15.6;
    for (const sz of [-1, 1]) {
      add(new T.BoxGeometry(2.2, 13, 2.2), stone, gx - 0.6, baseTop - 1 + 6.5, Z + sz * 4.6);
      add(new T.BoxGeometry(2.8, 1.2, 2.8), dark, gx - 0.6, baseTop + 12.1, Z + sz * 4.6);
      add(new T.ConeGeometry(1.1, 2.6, 4), dark, gx - 0.6, baseTop + 14, Z + sz * 4.6, 0, Math.PI / 4, 0);
      API.COLL.push({ x: gx - 0.6, z: Z + sz * 4.6, r: 1.6 });
    }
    add(new T.BoxGeometry(2.6, 2.2, 11.6), stone, gx - 0.6, baseTop + 10.6, Z);
    const arch = add(new T.TorusGeometry(4.2, 0.55, 6, 18, Math.PI), dark, gx - 0.2, baseTop + 5.7, Z, 0, Math.PI / 2, 0); arch.castShadow = false;
    const key = new T.Mesh(new T.OctahedronGeometry(0.7, 0), new T.MeshBasicMaterial({ color: hdr('#c08aff', 3.5), fog: false })); key.position.set(gx - 1.95, baseTop + 10.6, Z); g.add(key); TW.key = key;
    const sw = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ map: TX.swirl, color: hdr('#a070ff', 1.8), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    sw.position.set(gx + 0.1, baseTop + 4.9, Z); sw.rotation.y = -Math.PI / 2; sw.scale.set(3.9, 5.4, 1); g.add(sw); TW.portal = sw;
    const sw2 = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshBasicMaterial({ map: TX.swirl, color: hdr('#5fd8ff', 1.1), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    sw2.position.set(gx + 0.05, baseTop + 4.9, Z); sw2.rotation.y = -Math.PI / 2; sw2.scale.set(3.4, 4.8, 1); g.add(sw2); TW.portal2 = sw2;
    // steps down to the ground
    for (let i = 0; i < 3; i++) { const top = baseTop - 0.05 - i * 0.38, h = top - gy + 2; add(new T.BoxGeometry(1.4, h, 10.2 - i * 0.5), dark, gx - 1.4 - i * 1.3, top - h / 2, Z); }
    for (const sz of [-2.6, 0, 2.6]) API.COLL.push({ x: gx - 2.4, z: Z + sz, r: 2.5 });
    // braziers flanking the stairs
    for (const sz of [-1, 1]) {
      const bx = gx - 6.5, bz = Z + sz * 6.5, by = API.heightAt(bx, bz);
      const b = new T.Mesh(GEO.brazier, MAT.iron); b.position.set(bx, by, bz); b.scale.setScalar(1.3); b.castShadow = true; g.add(b);
      const fl = new T.Mesh(GEO.flame, new T.MeshBasicMaterial({ color: hdr('#ff8a2a', 3.2) })); fl.position.set(bx, by + 1.75, bz); fl.scale.setScalar(3.2); g.add(fl);
      TW.braz.push({ x: bx, y: by + 2.1, z: bz, fl });
      API.COLL.push({ x: bx, z: bz, r: 1.1 });
    }
    API.COLL.push({ x: X, z: Z, r: 16.4 });
    try { API.mapMarkers.push({ x: TOWER.ix, z: TOWER.iz, label: 'Torre dei Mille Piani', color: '#c08aff' }); } catch (e) { /* ignore */ }
  }
  function updateTower(dt) {
    if (!TW.group) return;
    const d = Math.hypot(P.x - TOWER.x, P.z - TOWER.z);
    TW.group.visible = !D.inside;
    if (D.inside || d > 900) return;
    const t = D.time;
    TW.runeMat.map.offset.x -= dt * 0.02;
    TW.runeMat.color.copy(hdr('#6ff0ff', 1.8 + Math.sin(t * 1.3) * 0.6));
    TW.rockG.rotation.y += dt * 0.025;
    TW.beacon.rotation.y += dt * 0.8; TW.halo.rotation.z += dt * 0.2;
    TW.portal.rotation.z -= dt * 1.4; TW.portal2.rotation.z += dt * 0.9;
    TW.key.rotation.y += dt * 1.5;
    if (d < 70) {
      for (const b of TW.braz) { const k = flick(b.x, t); b.fl.scale.set(3.2 * (0.8 + 0.3 * k), 3.2 * (0.7 + 0.6 * k), 3.2 * (0.8 + 0.3 * k)); if (Math.random() < dt * 8) emit(b.x + rand(-0.3, 0.3), b.y, b.z + rand(-0.3, 0.3), 1, '#ff9a3a', { speed: 0.6, up: 2.4, grav: -1, life: 1, size: 0.3, bright: 2.4 }); }
      if (Math.random() < dt * 14) { const gx = TOWER.x - 15.6; emit(gx - 0.3, TW.gy + rand(2, 12), TOWER.z + rand(-3.5, 3.5), 1, Math.random() < 0.5 ? '#a070ff' : '#5fd8ff', { speed: 0.6, up: 0.5, grav: -0.4, life: 1.4, size: 0.35, bright: 2.2 }); }
    }
  }

  /* ================================================================ plugin */
  API.register({
    id: 'dungeon3d',
    init() {
      TS();
      buildShared();
      registerTypes();
      buildUI();
      const nl = LOW ? 3 : API.quality === 'medium' ? 5 : 7;
      for (let i = 0; i < nl; i++) { const l = new T.PointLight('#ff9a48', 0, 18, 1.6); l.castShadow = false; D.lights.push(l); }
      D.lantern = new T.PointLight('#ffe0b0', 0, 15, 1.4); D.lantern.castShadow = false;
      try { buildTower(); } catch (err) { console.error('[dungeon3d tower]', err); }
    },
    populate() {
      if (!D.inside) return;
      if (!inPocket(P.x, P.z)) { endInside(); return; }
      // the world was repopulated while inside: queue the floor's survivors again
      D.mobs.length = 0;
      if (F) {
        for (const pk of F.packs) { pk.spawned = false; for (const r of pk.list) r.e = null; }
        if (F.bossRec && !F.bossRec.killed) { F.bossRec.e = null; D.boss = null; setGate(false); }
      }
    },
    update(dt) {
      D.time += dt;
      D.updRan = true;
      updateTower(dt);
      if (!D.inside || !F) return;
      if (D.boss && D.boss.introDone) D.introFrames = (D.introFrames || 0) + 1;
      if (!inPocket(P.x, P.z)) { endInside(); return; }
      if (D.titleT > 0) { D.titleT -= dt; if (D.titleT <= 0) API.bigMsg((F.boss ? 'Piano ' + F.f + ' — Custode' : 'Piano ' + F.f), 'place', 3); }
      pushOut(P, P.r || 0.9);
      D.proxT -= dt; if (D.proxT <= 0) { D.proxT = 0.3; updatePacks(); }
      updateMobs(dt);
      updateBossFlow(dt);
      pushOut(P, P.r || 0.9);
      updateTraps(dt);
      updateChests(dt);
      updateTorches(dt);
      updateDust(dt);
      updateDecor(dt);
      D.exploreT -= dt; if (D.exploreT <= 0) { D.exploreT = 0.2; explore(); }
      // checkpoint floors: the crystal restores you once
      if (F.crystal && !D.healOnce && (F.f === 1 || (F.f - 1) % 5 === 0) && Math.hypot(P.x - F.crystal.x, P.z - F.crystal.z) < 4) {
        D.healOnce = true; P.hp = P.maxHp; P.fp = P.maxFp; P.flasks = S.flasks; sfx('heal');
        emit(P.x, 1, P.z, 30, '#7fd8ff', { speed: 2, up: 4, grav: -1, life: 1.2 }); toast('Il Cristallo ti ristora');
      }
    },
    interactables() {
      const out = [];
      if (!D.inside) {
        if (Math.abs(P.x - TOWER.ix) < 8 && Math.abs(P.z - TOWER.iz) < 8 && !D.busy) out.push({ x: TOWER.ix, z: TOWER.iz, r: 5.5, label: 'Entra nella Torre dei Mille Piani ⟰', action: () => openSel() });
        return out;
      }
      if (!F || D.busy) return out;
      if (F.crystal) out.push({ x: F.crystal.x, z: F.crystal.z, r: 2.8, label: 'Cristallo del Ritorno — torna in superficie', action: () => leaveTower() });
      if (F.portal) {
        const p = F.portal;
        if (D.unlocked) out.push({ x: p.x, z: p.z, r: 3.8, label: `Varca il portale — Piano ${F.f + 1} ⟰`, action: () => enterFloor(F.f + 1) });
        else out.push({ x: p.x, z: p.z, r: 3.8, label: F.boss ? 'Il portale è sigillato dal Custode' : `Sigillato: abbatti i guardiani (${D.kills}/${D.need})`, action: () => { sfx('uiBack'); oracle(F.boss ? '《Il Custode del piano tiene chiuso il passaggio.》' : '《Il Sigillo è alimentato dai guardiani dalla corona rossa. Eliminali, o abbatti abbastanza ostili.》'); } });
      }
      for (const c of F.chests) if (!c.opened && c.shake <= 0 && Math.abs(P.x - c.x) < 4 && Math.abs(P.z - c.z) < 4) out.push({ x: c.x, z: c.z, r: 2.6, label: `Apri lo scrigno (${RAR[c.tier].n})`, action: () => openChest(c) });
      return out;
    },
    onSpawn(e) {
      if (!e || !e._tw) return;
      if (!API.rpg && e.level) { const k = 1 + (e.level - 1) * 0.12 * (e.elite ? 2 : 1); e.maxHp = Math.round(e.maxHp * k); e.hp = e.maxHp; if (e.elite) { e.model.root.scale.setScalar(1.22); e.scale0 = 1.22; } }
    },
    onKill(e, absorbed) {
      if (!e || !e._tw || !F) return;
      const rec = e._rec;
      if (rec) { rec.killed = true; rec.e = null; }
      if (rec && rec.count) { D.kills++; checkSeal(); }
      if (e._boss || (e.d && e.d.boss && F.boss)) bossDefeated(e);
      if (e._mimic) {
        const il = floorLevel(F.f) + 2;
        if (API.rpg) { for (let i = 0; i < 2; i++) setTimeout(() => { try { API.rpg.dropLoot(e.x + rand(-1.5, 1.5), e.z + rand(-1.5, 1.5), il, 2); } catch (er) { console.error(er); } }, 500 + i * 250); }
        else S.runes += 400 + F.f * 40;
        oracle('《Scrigno Famelico neutralizzato. Il suo contenuto è ora tuo.》');
      } else if (e.elite) {
        if (API.rpg) { try { API.rpg.dropLoot(e.x + rand(-1, 1), e.z + rand(-1, 1), (e.level || floorLevel(F.f)) + 1, 1); } catch (er) { console.error(er); } }
        else S.runes += 150 + F.f * 20;
      }
      if (!API.rpg) evt('3d:kill', { type: e.type, level: e.level || 1, boss: !!(e.d && e.d.boss), elite: !!e.elite });
      void absorbed;
    },
    hud() {
      // API.state is not a live accessor in every engine build: protect the player while our dialogs / fades are up
      if (UI.selOpen || D.busy) { P.iframe = Math.max(P.iframe, 0.25); P.vx = P.vz = 0; }
      if (!D.inside || !F) { D.updRan = false; return; }
      if (P.dead && !D.deadH) {
        D.deadH = true;
        if (S.stain && inPocket(S.stain.x, S.stain.z)) { S.stain.x = TOWER.ix - 6; S.stain.z = TOWER.iz + rand(-2, 2); API.saveS(); }
        setTimeout(() => oracle('《Le tue anime sono state trascinate all\'ingresso della Torre.》'), 5200);
      }
      applyAtmos();
      const now = performance.now(), rdt = clamp((now - (D.hudLast || now)) / 1000, 0.001, 0.1); D.hudLast = now;
      cameraOcclusion(rdt);
      D.updRan = false;
      hudText();
      D.miniT -= 1 / 60;
      if (D.miniT <= 0) { D.miniT = 0.12; drawMini(); }
    },
  });

  API.dungeon = {
    get inside() { return D.inside; },
    get floor() { return D.inside ? D.floor : 0; },
    get best() { return TS().best; },
    get maxFloor() { return TS().best; },
    get checkpoint() { return TS().checkpoint; },
    enter: (f) => enterFloor(f || 1),
    exit: () => leaveTower(),
    openSelect: () => openSel(),
    unlock: () => { if (D.inside && F) { if (F.boss) unlockPortalBoss(); else unlockPortal(); } },
    get data() { return F; },
    get state() { return D; },
    TOWER,
  };
})();
