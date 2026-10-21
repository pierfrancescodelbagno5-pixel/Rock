/* Slime Reborn — Terre Spezzate 3D · quests3d.js
 * Missions and the Adventurers' Guild: quest engine (stages, objectives, rewards, persistence in S.quests),
 * the Guild of Altheria (receptionist, quest board, ranks F→S, procedural contracts, rank exams),
 * the main story "La Convergenza dei Mondi" (prologue + 8 chapters + epilogue), hand-written side quests,
 * quest NPCs with "!" / "?" markers, dialogue/cutscene panel, quest log (L), HUD tracker, waypoints and banners.
 * Plugin for game3d.js — see docs/PLUGIN3D.md. Classic script, THREE global (r160). */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE, SK = window.SK || {};
  const { rand, clamp, lerp, TAU, std, hdr } = API;
  const PI = Math.PI;
  const Q = API.quality, LOW = Q === 'low', HIGH = Q === 'high';
  const S = API.S, P = API.P;
  const sfx = (n, o) => { try { API.sfx(n, o); } catch (e) { /* audio optional */ } };
  const oracle = (t, gold) => { try { if (API.oracle) API.oracle(t, gold); else API.toast(t); } catch (e) { /* ignore */ } };
  const toast = (t) => { try { API.toast(t); } catch (e) { /* ignore */ } };
  const fmt = (n) => Math.floor(n).toLocaleString('it-IT');
  const pname = () => (API.ch && API.ch.name) || 'Viandante';
  const EV = SK.events || { on() {}, emit() {} };
  const emitEv = (n, d) => { try { EV.emit(n, d); } catch (e) { /* ignore */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dist = (x, z) => Math.hypot(P.x - x, P.z - z);
  const plLevel = () => { try { const r = API.rpg; if (r && r.level > 0) return r.level; } catch (e) { /* ignore */ } return S.level || 1; };
  function hstr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function hrand(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ============================================================ persistent state */
  const QS = S.quests = Object.assign({ v: 1, q: {}, track: [], cdefs: {}, rep: {}, maxFloor: 0, flags: {}, titles: [], stats: { done: 0, contracts: 0 } }, S.quests || {});
  QS.guild = Object.assign({ reg: false, rank: 0, pts: 0, offers: [], seed: 1, t: 0 }, QS.guild || {});
  for (const k of ['q', 'cdefs', 'rep', 'flags']) if (!QS[k] || typeof QS[k] !== 'object') QS[k] = {};
  if (!Array.isArray(QS.track)) QS.track = [];
  if (!Array.isArray(QS.titles)) QS.titles = [];
  if (!Array.isArray(QS.guild.offers)) QS.guild.offers = [];
  for (const id in QS.q) { const r = QS.q[id]; if (!r || typeof r !== 'object') { delete QS.q[id]; continue; } if (!Array.isArray(r.p)) r.p = []; if (!Array.isArray(r.pk)) r.pk = []; }
  const save = () => { try { API.saveS(); } catch (e) { /* ignore */ } };

  const RANKS = [
    { l: 'F', pts: 0, c: '#a8a8a8', n: 'Novizio' }, { l: 'E', pts: 60, c: '#c98a4a', n: 'Apprendista' }, { l: 'D', pts: 180, c: '#9ccc65', n: 'Avventuriero' },
    { l: 'C', pts: 400, c: '#4fc3f7', n: 'Veterano' }, { l: 'B', pts: 800, c: '#c27dff', n: 'Élite' }, { l: 'A', pts: 1500, c: '#ffb300', n: 'Eroe' },
    { l: 'S', pts: 3000, c: '#ff5252', n: 'Leggenda' }];
  const FACTIONS = { corona: 'Corona di Altheria', gilda: 'Gilda degli Avventurieri', nazione: 'Nazione di Valdoria', eroi: 'Eroi Evocati', popolo: 'Popolo di Altheria' };
  const CITY = { x: 0, z: 470 }, TOWER = { x: 175, z: 470 };
  const TOWNS = [{ x: 0, z: 470, r: 150 }, { x: 175, z: 470, r: 30 }, { x: 60, z: 230, r: 85 }, { x: -45, z: 75, r: 35 }, { x: -200, z: 100, r: 25 },
    { x: -350, z: 140, r: 40 }, { x: 40, z: -420, r: 40 }, { x: 520, z: 40, r: 40 }, { x: 430, z: -230, r: 40 }, { x: -120, z: -590, r: 45 }];
  const freeSpot = (x, z) => Math.hypot(x, z) < API.MAPR - 40 && !TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r);

  /* ============================================================ geometry / merge kit */
  const GEO = { box: API.BOX, sph: new T.SphereGeometry(1, 12, 9), sphLo: new T.SphereGeometry(1, 7, 5), cyl: new T.CylinderGeometry(1, 1, 1, 10),
    cyl6: new T.CylinderGeometry(1, 1, 1, 6), cone: new T.ConeGeometry(1, 1, 10), cone4: new T.ConeGeometry(1, 1, 4), oct: new T.OctahedronGeometry(1, 0),
    ico: new T.IcosahedronGeometry(1, 0), tor: new T.TorusGeometry(1, 0.12, 6, 20), dode: new T.DodecahedronGeometry(1, 0) };
  const CAPS = {};
  const capG = (r, l) => CAPS[r + '_' + l] || (CAPS[r + '_' + l] = new T.CapsuleGeometry(r, l, 3, 8));
  const NI = new WeakMap();
  function nonIdx(g) { let r = NI.get(g); if (!r) { r = g.index ? g.toNonIndexed() : g; if (!r.attributes.normal) r.computeVertexNormals(); NI.set(g, r); } return r; }
  const _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _v = new T.Vector3(), _s = new T.Vector3(), _n3 = new T.Matrix3();
  function Kit() { this.parts = []; this.count = 0; }
  Kit.prototype.add = function (geo, col, x, y, z, sx, sy, sz, rx, ry, rz) {
    if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    const m = new T.Matrix4().compose(_v.set(x || 0, y || 0, z || 0), _q, _s.set(sx, sy, sz));
    const g = nonIdx(geo);
    this.parts.push({ g, m, c: col && col.isColor ? col.clone() : new T.Color(col) });
    this.count += g.attributes.position.count;
    return this;
  };
  Kit.prototype.build = function () {
    const n = this.count, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const p of this.parts) {
      const pa = p.g.attributes.position, na = p.g.attributes.normal;
      _n3.getNormalMatrix(p.m);
      for (let i = 0; i < pa.count; i++, o++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(p.m); pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize(); nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
        col[o * 3] = p.c.r; col[o * 3 + 1] = p.c.g; col[o * 3 + 2] = p.c.b;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  };
  const MAT = {
    vc: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.62, metalness: 0.08 }),
    vcMetal: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.3, metalness: 0.75 }),
    glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  Kit.prototype.mesh = function (mat, parent, shadow) {
    if (!this.count) return null;
    const m = new T.Mesh(this.build(), mat || MAT.vc);
    m.castShadow = shadow !== false && HIGH; m.receiveShadow = false;
    parent.add(m); return m;
  };
  function piv(parent, x, y, z) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
  const addMat = (hex, k, op) => new T.MeshBasicMaterial({ color: hdr(hex, k), transparent: true, opacity: op == null ? 0.85 : op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false });

  /* ============================================================ NPC models */
  function npcModel(o) {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const sc = o.scale || 1; g.scale.setScalar(sc);
    const skin = o.skin || '#f1d2bc', cl = o.cloth || '#5a4a3a', cl2 = o.cloth2 || cl, pa = o.pants || '#3a3036', hair = o.hair || '#3a2a1e', trim = o.trim || '#c9a24a';
    const boots = o.boots || '#2a1e16', armor = o.armor, burly = o.burly ? 1.18 : 1;
    // legs
    const legL = piv(g, -0.11, 0.92, 0), legR = piv(g, 0.11, 0.92, 0);
    for (const L of [legL, legR]) {
      const k = new Kit();
      k.add(capG(0.085, 0.58), armor || pa, 0, -0.42, 0, burly, 1, burly);
      k.add(GEO.box, boots, 0, -0.86, 0.04, 0.17, 0.13, 0.3);
      k.add(GEO.cyl, armor ? trim : boots, 0, -0.68, 0, 0.1, 0.16, 0.1);
      k.mesh(armor ? MAT.vcMetal : MAT.vc, L);
    }
    // body
    const b = new Kit(), bm = new Kit(), bg = new Kit();
    b.add(GEO.box, pa, 0, 0.98, 0, 0.34 * burly, 0.22, 0.22);
    b.add(capG(0.19, 0.3), cl, 0, 1.3, 0, 1.15 * burly, 1, 0.8);
    b.add(GEO.box, o.belt || '#3a2a1e', 0, 1.08, 0, 0.42 * burly, 0.07, 0.3);
    b.add(GEO.box, trim, 0, 1.08, 0.15, 0.08, 0.08, 0.02);
    b.add(GEO.cyl6, skin, 0, 1.5, 0, 0.065, 0.12, 0.065);
    b.add(GEO.box, cl2, 0, 1.32, 0.16, 0.12 * burly, 0.36, 0.02);
    if (o.robe) { b.add(GEO.cone, o.robe, 0, 0.66, 0, 0.42 * burly, 0.9, 0.36); b.add(GEO.cyl, trim, 0, 0.24, 0, 0.405 * burly, 0.04, 0.345); }
    else if (o.female) { b.add(GEO.cone, o.dress || cl, 0, 0.78, 0, 0.36, 0.6, 0.3); b.add(GEO.cyl, trim, 0, 0.5, 0, 0.32, 0.03, 0.27); }
    if (o.apron) b.add(GEO.box, o.apron, 0, 1.0, 0.18, 0.32, 0.62, 0.03);
    if (armor) {
      bm.add(GEO.box, armor, 0, 1.34, 0.04, 0.46 * burly, 0.44, 0.36);
      for (const sx of [-1, 1]) bm.add(GEO.sph, armor, sx * 0.27 * burly, 1.47, 0, 0.14, 0.1, 0.15);
      bm.add(GEO.box, trim, 0, 1.52, 0.2, 0.3, 0.04, 0.03);
    }
    if (o.fur) { b.add(GEO.sph, o.fur, 0, 1.5, -0.02, 0.32 * burly, 0.12, 0.24); }
    if (o.bag) b.add(GEO.box, '#6b4a2a', 0, 1.28, -0.2, 0.34, 0.42, 0.2);
    if (o.gem) bg.add(GEO.oct, hdr(o.gem, 2.4), 0, 1.38, 0.19, 0.04, 0.05, 0.02);
    if (o.runes) for (let i = 0; i < 3; i++) bg.add(GEO.box, hdr(o.runes, 2.2), 0, 0.5 + i * 0.16, 0.36 - i * 0.03, 0.18 - i * 0.03, 0.012, 0.01);
    b.mesh(MAT.vc, g); bm.mesh(MAT.vcMetal, g); bg.mesh(MAT.glow, g, false);
    // cape / coat tail
    let cape = null;
    if (o.cape) { cape = piv(g, 0, 1.5, -0.17); const k = new Kit(); k.add(GEO.box, o.cape, 0, -0.58, -0.02, 0.5 * burly, 1.25, 0.03); k.add(GEO.box, trim, 0, -1.2, -0.02, 0.5 * burly, 0.05, 0.035); k.mesh(MAT.vc, cape); }
    // tail (beastkin)
    let tail = null;
    if (o.tail) { tail = piv(g, 0, 1.02, -0.16); const k = new Kit(); k.add(capG(0.07, 0.42), o.tail, 0, -0.1, -0.24, 1, 1, 1, 1.0); k.add(GEO.sph, o.tailTip || '#e8dcc4', 0, -0.3, -0.45, 0.07); k.mesh(MAT.vc, tail); }
    // head
    const head = piv(g, 0, 1.56, 0), hk = new Kit(), hm = new Kit(), hg = new Kit();
    hk.add(GEO.sph, skin, 0, 0.12, 0, 0.15, 0.165, 0.15);
    hk.add(GEO.box, new T.Color(skin).multiplyScalar(0.88), 0, 0.09, 0.15, 0.035, 0.05, 0.04);
    for (const sx of [-1, 1]) {
      hk.add(GEO.box, '#f8f4ec', sx * 0.055, 0.135, 0.132, 0.045, 0.035, 0.015);
      hg.add(GEO.box, hdr(o.eye || '#3a6aa0', o.eyeGlow || 1.0), sx * 0.055, 0.133, 0.14, 0.024, 0.032, 0.012);
      hk.add(GEO.box, new T.Color(hair).multiplyScalar(0.8), sx * 0.058, 0.18, 0.138, 0.06, 0.012, 0.012);
    }
    hk.add(GEO.box, '#9a5a50', 0, 0.045, 0.142, 0.05, 0.012, 0.01);
    const hs = o.hs || 'short';
    if (hs !== 'bald' && hs !== 'hood') hk.add(GEO.sph, hair, 0, 0.17, -0.02, 0.16, 0.14, 0.165);
    if (hs === 'long' || hs === 'mane') { hk.add(capG(0.12, 0.3), hair, 0, -0.03, -0.09, 1.3, 1, 0.72); }
    if (hs === 'mane') for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.6; hk.add(GEO.cone4, hair, Math.sin(a) * 0.15, 0.12, -0.02 - Math.cos(a) * 0.12, 0.06, 0.2, 0.05, 2.4 + Math.cos(a) * 0.3, a, 0); }
    if (hs === 'ponytail') { hk.add(GEO.sph, hair, 0, 0.22, -0.15, 0.06); hk.add(capG(0.06, 0.34), hair, 0, -0.02, -0.2, 1, 1, 1, 0.28); }
    if (hs === 'bun') hk.add(GEO.sph, hair, 0, 0.32, -0.08, 0.08);
    if (hs === 'spiky' || hs === 'short' || hs === 'long' || hs === 'ponytail') for (let i = 0; i < 5; i++) hk.add(GEO.cone4, hair, (-0.08 + i * 0.04), 0.24, 0.1, 0.035, 0.12, 0.035, 2.6, 0, (i - 2) * 0.12);
    if (hs === 'spiky') for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; hk.add(GEO.cone4, hair, Math.sin(a) * 0.12, 0.28, Math.cos(a) * 0.1 - 0.03, 0.05, 0.2, 0.05, Math.cos(a) * -0.7, 0, Math.sin(a) * 0.7); }
    if (hs === 'hood') { hk.add(GEO.sph, o.hood || cl, 0, 0.15, -0.03, 0.19, 0.2, 0.19); hk.add(GEO.cone, o.hood || cl, 0, 0.2, -0.17, 0.12, 0.25, 0.1, -1.2); }
    if (o.beard) { hk.add(GEO.box, o.beard, 0, 0.0, 0.11, 0.2, 0.16, 0.1); hk.add(GEO.cone4, o.beard, 0, -0.1, 0.12, 0.08, 0.14, 0.05, PI); }
    if (o.ears === 'wolf') for (const sx of [-1, 1]) { hk.add(GEO.cone4, hair, sx * 0.1, 0.33, -0.02, 0.06, 0.16, 0.035, 0, 0, -sx * 0.25); hk.add(GEO.cone4, '#e8c8b0', sx * 0.1, 0.32, -0.005, 0.035, 0.1, 0.02, 0, 0, -sx * 0.25); }
    if (o.ears === 'elf') for (const sx of [-1, 1]) hk.add(GEO.cone4, skin, sx * 0.16, 0.13, -0.01, 0.025, 0.2, 0.02, 0, 0, -sx * 1.3);
    if (o.glasses) for (const sx of [-1, 1]) hm.add(GEO.tor, '#c9ced8', sx * 0.055, 0.135, 0.15, 0.035, 0.035, 0.02);
    if (o.crown) { hm.add(GEO.cyl, '#ffcf40', 0, 0.28, 0, 0.155, 0.07, 0.155); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; hm.add(GEO.cone4, '#ffcf40', Math.cos(a) * 0.15, 0.36, Math.sin(a) * 0.15, 0.03, 0.1, 0.03); } hg.add(GEO.oct, hdr('#ff2a4a', 2.6), 0, 0.3, 0.155, 0.03, 0.04, 0.015); }
    if (o.hat === 'helmet') { hm.add(GEO.sph, o.armor || '#9aa0aa', 0, 0.19, 0, 0.175, 0.14, 0.175); hm.add(GEO.box, o.armor || '#9aa0aa', 0, 0.1, 0.16, 0.03, 0.12, 0.03); hk.add(GEO.cone4, o.plume || '#1d3a8a', 0, 0.38, -0.02, 0.04, 0.16, 0.04); }
    if (o.hat === 'wizard') { hk.add(GEO.cyl, o.hatC || cl, 0, 0.25, 0, 0.26, 0.02, 0.26); hk.add(GEO.cone, o.hatC || cl, 0, 0.45, -0.03, 0.15, 0.42, 0.15, -0.15); }
    if (o.hat === 'cap') hk.add(GEO.sph, o.hatC || '#5a2a2a', 0.02, 0.26, -0.01, 0.17, 0.08, 0.17);
    if (o.hat === 'straw') { hk.add(GEO.cyl, '#d8b45a', 0, 0.27, 0, 0.3, 0.025, 0.3); hk.add(GEO.cyl, '#d8b45a', 0, 0.33, 0, 0.15, 0.12, 0.15); }
    if (o.hat === 'kerchief') hk.add(GEO.sph, o.hatC || '#c62828', 0, 0.2, -0.02, 0.165, 0.11, 0.17);
    if (o.hat === 'circlet') { hm.add(GEO.cyl, '#dfe6f2', 0, 0.22, 0, 0.158, 0.025, 0.158); hg.add(GEO.oct, hdr(o.gem || '#7df9ff', 2.6), 0, 0.23, 0.16, 0.025, 0.035, 0.012); }
    if (o.scar) hk.add(GEO.box, '#8a4a3a', 0.07, 0.15, 0.148, 0.012, 0.09, 0.01, 0, 0, 0.3);
    hk.mesh(MAT.vc, head); hm.mesh(MAT.vcMetal, head); hg.mesh(MAT.glow, head, false);
    // arms
    const armL = piv(g, -0.27 * burly, 1.44, 0), armR = piv(g, 0.27 * burly, 1.44, 0);
    let weapon = null;
    for (const A of [armL, armR]) {
      const k = new Kit(), km = new Kit(), kg = new Kit(), right = A === armR;
      k.add(capG(0.062, 0.4), armor || cl, 0, -0.26, 0, burly, 1, burly);
      k.add(GEO.cyl, trim, 0, -0.44, 0, 0.07 * burly, 0.04, 0.07 * burly);
      k.add(GEO.sph, skin, 0, -0.52, 0, 0.06 * burly);
      const it = right ? o.item : o.itemL;
      if (it === 'book') { k.add(GEO.box, '#5a2a1e', 0, -0.56, 0.08, 0.04, 0.22, 0.16); k.add(GEO.box, '#f0e6cc', 0.005, -0.56, 0.08, 0.035, 0.2, 0.15); }
      if (it === 'sword') { km.add(GEO.box, trim, 0, -0.58, 0.08, 0.05, 0.05, 0.22); km.add(GEO.box, '#e6ebf4', 0, -0.58, 0.62, 0.025, 0.06, 0.95); kg.add(GEO.box, hdr(o.bladeGlow || '#9ff3ff', 1.6), 0, -0.58, 0.62, 0.01, 0.025, 0.9); }
      if (it === 'staff') { k.add(GEO.cyl6, '#3a2a4a', 0, -0.5, 0.06, 0.022, 1.65, 0.022); kg.add(GEO.oct, hdr(o.staffGem || '#7df9ff', 2.8), 0, 0.42, 0.06, 0.08, 0.12, 0.08); km.add(GEO.tor, '#c9ced8', 0, 0.35, 0.06, 0.09, 0.09, 0.09, PI / 2); }
      if (it === 'axe') { k.add(GEO.cyl6, '#4a3424', 0, -0.4, 0.06, 0.03, 1.5, 0.03); km.add(GEO.box, '#8a8f98', 0.16, 0.22, 0.06, 0.3, 0.32, 0.03); km.add(GEO.box, '#8a8f98', -0.12, 0.22, 0.06, 0.18, 0.2, 0.03); }
      if (it === 'scepter') { km.add(GEO.cyl6, '#ffcf40', 0, -0.45, 0.06, 0.02, 0.9, 0.02); kg.add(GEO.sph, hdr('#ff3a5a', 2.4), 0, -0.02, 0.06, 0.06); }
      if (it === 'spear') { k.add(GEO.cyl6, '#5a3e2a', 0, -0.4, 0.06, 0.025, 2.3, 0.025); km.add(GEO.cone4, '#c9ced8', 0, 0.85, 0.06, 0.06, 0.25, 0.03); }
      if (it === 'basket') { k.add(GEO.cyl, '#b88a4a', 0, -0.62, 0.12, 0.13, 0.12, 0.13); k.add(GEO.sph, '#8bc34a', 0.03, -0.55, 0.12, 0.05); k.add(GEO.sph, '#c8ff6a', -0.04, -0.55, 0.14, 0.05); }
      if (it === 'hammer') { k.add(GEO.cyl6, '#5a3e2a', 0, -0.62, 0.15, 0.025, 0.45, 0.025, PI / 2); km.add(GEO.box, '#4a4c56', 0, -0.62, 0.38, 0.12, 0.2, 0.1); }
      if (it === 'bread') { k.add(capG(0.06, 0.18), '#c98a3a', 0, -0.56, 0.1, 1, 1, 1, PI / 2); }
      if (it === 'scroll') { k.add(GEO.cyl, '#efe2bf', 0, -0.56, 0.08, 0.04, 0.3, 0.04, 0, 0, PI / 2); }
      if (it === 'lantern') { km.add(GEO.box, '#3a3a3a', 0, -0.68, 0.08, 0.1, 0.14, 0.1); kg.add(GEO.box, hdr('#ffc46a', 2.6), 0, -0.68, 0.08, 0.07, 0.1, 0.07); }
      if (it === 'bow') { k.add(GEO.tor, '#7b4f2c', 0, -0.48, 0.05, 0.5, 0.5, 0.3, 0, PI / 2, 0); }
      k.mesh(MAT.vc, A); km.mesh(MAT.vcMetal, A); kg.mesh(MAT.glow, A, false);
      if (it) weapon = A;
    }
    if (o.back === 'sword') { const k = new Kit(), kg = new Kit(); k.add(GEO.box, trim, 0, 1.55, -0.2, 0.22, 0.05, 0.05, 0, 0, 0.6); k.add(GEO.box, '#e6ebf4', 0.28, 1.08, -0.2, 0.07, 1.0, 0.025, 0, 0, 0.6); kg.add(GEO.box, hdr(o.bladeGlow || '#ffd36b', 1.8), 0.28, 1.08, -0.18, 0.02, 0.95, 0.01, 0, 0, 0.6); k.mesh(MAT.vcMetal, g); kg.mesh(MAT.glow, g, false); }
    const orbs = [];
    if (o.orbs) for (let i = 0; i < 3; i++) { const m = new T.Mesh(GEO.oct, addMat(o.orbs, 2.6, 0.95)); m.scale.setScalar(0.06); root.add(m); orbs.push(m); }
    root.traverse((m) => { if (m.isMesh) m.castShadow = HIGH && m.material !== MAT.glow && !m.material.blending; });
    return { root, g, head, legL, legR, armL, armR, cape, tail, orbs, weapon, s: sc };
  }
  function catModel(col) {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const k = new Kit(), kg = new Kit();
    k.add(capG(0.12, 0.3), col, 0, 0.26, 0, 1, 1, 1, PI / 2);
    k.add(GEO.sph, col, 0, 0.42, 0.24, 0.13, 0.12, 0.12);
    for (const sx of [-1, 1]) { k.add(GEO.cone4, col, sx * 0.07, 0.55, 0.22, 0.04, 0.09, 0.03); kg.add(GEO.box, hdr('#9cff6a', 1.8), sx * 0.05, 0.44, 0.355, 0.03, 0.02, 0.01); }
    k.add(GEO.sph, '#ffb0c0', 0, 0.4, 0.36, 0.02);
    k.add(GEO.box, '#e8e0d0', 0, 0.36, 0.33, 0.08, 0.04, 0.04);
    k.mesh(MAT.vc, g); kg.mesh(MAT.glow, g, false);
    const legs = [];
    for (const [x, z] of [[-0.07, 0.14], [0.07, 0.14], [-0.07, -0.14], [0.07, -0.14]]) { const l = piv(g, x, 0.2, z); const kk = new Kit(); kk.add(capG(0.03, 0.14), col, 0, -0.1, 0); kk.mesh(MAT.vc, l); legs.push(l); }
    const tail = piv(g, 0, 0.3, -0.25); { const kk = new Kit(); kk.add(capG(0.03, 0.3), col, 0, 0.12, -0.08, 1, 1, 1, -0.6); kk.mesh(MAT.vc, tail); }
    return { root, g, legs, tail, cat: true, s: 1 };
  }

  /* ============================================================ markers ("!" / "?") */
  function glyphTex(ch) {
    const c = document.createElement('canvas'); c.width = 64; c.height = 96;
    const x = c.getContext('2d');
    x.font = 'bold 78px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = 'rgba(20,12,4,.95)'; x.strokeText(ch, 32, 52);
    x.fillStyle = '#ffffff'; x.fillText(ch, 32, 52);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  const TEX = { ex: glyphTex('!'), qm: glyphTex('?') };
  const MK = {
    gold: new T.SpriteMaterial({ map: TEX.ex, color: hdr('#ffc93a', 2.2), transparent: true, depthWrite: false }),
    blue: new T.SpriteMaterial({ map: TEX.ex, color: hdr('#58c8ff', 2.2), transparent: true, depthWrite: false }),
    turn: new T.SpriteMaterial({ map: TEX.qm, color: hdr('#ffd84a', 2.6), transparent: true, depthWrite: false }),
    wait: new T.SpriteMaterial({ map: TEX.qm, color: new T.Color('#8a8a8a'), transparent: true, depthWrite: false, opacity: 0.85 }),
  };
  const haloMat = new T.SpriteMaterial({ map: API.dot, color: hdr('#ffc94a', 1.4), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.6 });

  /* ============================================================ NPC registry */
  const ST = {
    elina: { skin: '#f6dcc8', hair: '#b5532a', hs: 'ponytail', cloth: '#2f5a46', cloth2: '#efe6d0', pants: '#2a2a30', trim: '#d9b44a', female: true, dress: '#24493a', eye: '#3fae7a', item: 'book', gem: '#7dffb0' },
    king: { skin: '#efd2bc', hair: '#e8e6e0', hs: 'short', beard: '#e8e6e0', cloth: '#7a1830', cloth2: '#d9b44a', robe: '#5a1022', cape: '#8a1a2a', crown: true, trim: '#ffd36b', eye: '#4a7ab0', item: 'scepter', scale: 1.06, fur: '#f2ece0' },
    guard: { skin: '#e2b896', hair: '#4a2f1d', hs: 'short', cloth: '#1d3a8a', cloth2: '#d9b44a', armor: '#a0a8b8', trim: '#d9b44a', hat: 'helmet', plume: '#c62828', item: 'spear', cape: '#1d3a8a' },
    ren: { skin: '#f3d6c0', hair: '#15151c', hs: 'spiky', cloth: '#e9ecf2', cloth2: '#2a3a6a', armor: '#d6dce8', trim: '#ffd36b', eye: '#ff5a3c', eyeGlow: 1.6, back: 'sword', bladeGlow: '#ffd36b', cape: '#1e2a5a', boots: '#1e2230' },
    sora: { skin: '#f7e6da', hair: '#a9c8ff', hs: 'long', female: true, dress: '#1c2340', robe: '#1c2340', cloth: '#26305a', cloth2: '#7df9ff', trim: '#7df9ff', eye: '#7df9ff', eyeGlow: 1.8, item: 'staff', glasses: true, orbs: '#7df9ff', runes: '#7df9ff', hat: 'circlet' },
    brann: { skin: '#b07a52', hair: '#5a4636', hs: 'mane', ears: 'wolf', tail: '#5a4636', cloth: '#5a3a24', cloth2: '#3a2618', fur: '#d8c8a8', armor: '#6a5a48', trim: '#b08a4a', eye: '#ffc23a', eyeGlow: 1.5, item: 'axe', scale: 1.2, burly: true, scar: true },
    tobia: { skin: '#f1c7a5', hair: '#7a4a24', hs: 'bald', beard: '#7a4a24', cloth: '#e8e0cc', cloth2: '#c98a3a', apron: '#f5f0e0', pants: '#5a4a3a', item: 'bread', burly: true, hat: 'cap', hatC: '#f5f0e0' },
    orsola: { skin: '#e8b896', hair: '#d8d8d0', hs: 'bun', female: true, dress: '#4a6a3a', cloth: '#5a7a44', cloth2: '#c8ff6a', trim: '#8bc34a', item: 'basket', hat: 'kerchief', hatC: '#6b8a3a' },
    anselmo: { skin: '#f5d6c0', hair: '#9a9a9a', hs: 'bald', cloth: '#efe8d8', cloth2: '#d9b44a', robe: '#e8e0cc', trim: '#d9b44a', item: 'book', gem: '#ffd36b', scale: 1.02 },
    gildo: { skin: '#c68c5f', hair: '#2b1d14', hs: 'short', beard: '#2b1d14', cloth: '#5a4636', cloth2: '#3a2a1e', apron: '#3a2a1e', pants: '#2e3440', item: 'hammer', burly: true },
    lucetta: { skin: '#fbe0cc', hair: '#e8b04a', hs: 'ponytail', female: true, dress: '#c2507a', cloth: '#e07a9a', cloth2: '#fff0f4', trim: '#fff0f4', scale: 0.66 },
    doran: { skin: '#d9a27a', hair: '#5a3a2a', hs: 'short', beard: '#5a3a2a', cloth: '#1d3a8a', cloth2: '#d9b44a', armor: '#9aa3b4', trim: '#d9b44a', cape: '#7a1830', item: 'sword', scar: true },
    isadora: { skin: '#f5d6c0', hair: '#2a2a3a', hs: 'bun', female: true, dress: '#6a4a2a', cloth: '#8a6a3a', cloth2: '#efe2bf', trim: '#c9a24a', item: 'scroll', glasses: true, bag: true },
    pip: { skin: '#f1c7a5', hair: '#c99a52', hs: 'short', cloth: '#b0643a', cloth2: '#ffd36b', pants: '#4a3a2a', bag: true, hat: 'straw', item: 'lantern', scale: 0.86 },
    elric: { skin: '#f1d6c4', hair: '#c9c9d8', hs: 'long', beard: '#c9c9d8', cloth: '#3a2a6a', cloth2: '#b388ff', robe: '#2a1f4a', trim: '#b388ff', item: 'staff', staffGem: '#b388ff', hat: 'wizard', hatC: '#2a1f4a', ears: 'elf' },
    merlo: { skin: '#e2b896', hair: '#3a3a44', hs: 'hood', hood: '#3a3a44', cloth: '#4a4a56', cloth2: '#7df9ff', robe: '#33333d', trim: '#7df9ff', item: 'lantern', gem: '#7df9ff' },
    liora: { skin: '#d8f0e8', hair: '#3fbf9f', hs: 'long', female: true, dress: '#1f5a4a', cloth: '#2a7a6a', cloth2: '#b2fff4', trim: '#b2fff4', eye: '#ffd36b', eyeGlow: 1.4, ears: 'elf', item: 'staff', staffGem: '#b2fff4', hat: 'circlet', gem: '#b2fff4' },
    gorgo: { skin: '#6d8a3a', hair: '#2a2a1a', hs: 'bald', cloth: '#5a4630', cloth2: '#c8ff6a', pants: '#3a2a1e', fur: '#8a7a5a', item: 'staff', staffGem: '#c8ff6a', ears: 'elf', eye: '#ffcf3a', eyeGlow: 1.6, scale: 0.8, hat: 'kerchief', hatC: '#7a2e2e' },
    fiorella: { skin: '#f1c7a5', hair: '#e8e8e0', hs: 'bun', female: true, dress: '#4a3a6b', cloth: '#5a4a7a', cloth2: '#c8ff6a', trim: '#c8ff6a', item: 'lantern', scale: 0.92 },
    hakon: { skin: '#e8c0a0', hair: '#e8d7a0', hs: 'long', beard: '#e8d7a0', cloth: '#5a6a7a', cloth2: '#e8e0cc', fur: '#f2ece0', pants: '#3a3a44', item: 'bow', burly: true, hat: 'cap', hatC: '#e8e0cc' },
    vessa: { skin: '#c68c5f', hair: '#9a3b1f', hs: 'ponytail', female: true, dress: '#5a2a1e', cloth: '#7a2e2e', cloth2: '#ff7a3a', armor: '#7a6a5a', trim: '#ff7a3a', item: 'spear', scar: true },
  };
  const NPCS = {};
  const NPC_LIST = [];
  function npcDef(id, o) { o.id = id; NPCS[id] = o; NPC_LIST.push(o); return o; }
  // the metropolis (Altheria)
  npcDef('elina', { name: 'Elina', title: 'Receptionist della Gilda', x: 27.5, z: 449.6, face: [27.5, 470], st: ST.elina, color: '#9fe6c0', guild: true,
    chat: ['Benvenuto alla Gilda degli Avventurieri di Altheria! Incarichi, promozioni, ricompense: passa tutto da me.', 'Un consiglio da amica: non accettare contratti sopra il tuo rango. La bacheca non restituisce i cadaveri.', 'Da quando le Crepe si aprono ogni notte, la bacheca si riempie più in fretta di quanto riesca a timbrare le pratiche…'] });
  npcDef('king', { name: 'Re Valerian IV', title: 'Sovrano di Altheria', x: 0, z: 540, face: [0, 470], st: ST.king, color: '#ffd36b', main: true,
    chat: ['Altheria è sopravvissuta a tre Convergenze. Con te e gli eroi, sopravviverà anche alla quarta.', 'Il trono è pesante, {P}. Ma più pesante è il silenzio dei villaggi inghiottiti dalle Crepe.', 'Le porte del castello sono sempre aperte per te, Evocato.'] });
  npcDef('guardL', { name: 'Guardia Reale', title: 'Corona di Altheria', x: -4.5, z: 538, face: [0, 470], st: ST.guard, color: '#9fc4ff', deco: true, chat: ['Sua Maestà ti riceverà. Niente armi sguainate al cospetto del trono.', 'Altheria non dorme mai. Nemmeno noi.'] });
  npcDef('guardR', { name: 'Guardia Reale', title: 'Corona di Altheria', x: 4.5, z: 538, face: [0, 470], st: ST.guard, color: '#9fc4ff', deco: true, chat: ['Eroi evocati, mostri parlanti, slime che diventano umani… lavoro più strano non potevo trovarlo.', 'Il Re si fida di te. Io sto ancora decidendo.'] });
  npcDef('ren', { name: 'Ren Takashiro', title: 'Eroe della Spada Sacra', x: -15, z: 486, face: [0, 470], st: ST.ren, color: '#ff8a6a', hero: true,
    chat: ['Hmph. Nel mio mondo ero il numero uno in tutto. Qui sarà lo stesso.', 'La Spada Sacra ha scelto me. Non dimenticarlo, slime.', 'Non sono geloso. È solo che… nessuno ha mai evocato uno slime prima. È irregolare.'],
    vis: () => !(QS.flags.renGone) });
  npcDef('sora', { name: 'Sora Mizuhara', title: 'Arcanista del Mondo di Vetro', x: 10, z: 410, face: [0, 440], st: ST.sora, color: '#7df9ff', hero: true,
    chat: ['Nel mio mondo la magia era un\'equazione. Qui è… viva. Affascinante.', 'Ho calcolato la frequenza delle Crepe: crescono del 3,7% ogni notte. Non è una buona notizia.', 'Il tuo Oracolo… parla davvero dentro la tua testa? Posso studiarlo? Senza bisturi, promesso.'] });
  npcDef('brann', { name: 'Brann Durnhal', title: 'Campione delle Lande di Kharvos', x: 37, z: 490, face: [10, 470], st: ST.brann, color: '#ffc23a', hero: true,
    chat: ['Nel mio mondo la guerra non finiva mai. Qui almeno la birra è buona.', 'Ti ho visto combattere, piccolo. Hai l\'istinto di un predatore. Mi piace.', 'Un guerriero si misura dalle cicatrici. Tu non ne hai: o sei fortissimo, o sei gelatina. Forse entrambe le cose.'] });
  npcDef('tobia', { name: 'Tobia', title: 'Fornaio della Piazza', x: -12, z: 507, face: [0, 470], st: ST.tobia, color: '#ffcf8a', chat: ['Pane caldo, pane caldo! Il profumo arriva fino al castello, sai?', 'Da quando sono arrivati gli eroi, sforno il triplo. Gli eroi mangiano come draghi!'] });
  npcDef('orsola', { name: 'Madama Orsola', title: 'Erborista', x: -27, z: 488, face: [0, 480], st: ST.orsola, color: '#c8ff6a', chat: ['Ogni erba ha un\'anima, caro. Bisogna solo saperla ascoltare.', 'Le pozioni della bottega accanto? Acqua colorata. Le mie, invece, ti rimettono in piedi anche da morto. Quasi.'] });
  npcDef('anselmo', { name: 'Fratello Anselmo', title: 'Custode della Cattedrale', x: 53, z: 494, face: [0, 470], st: ST.anselmo, color: '#ffe7a8', chat: ['La luce della Cattedrale non si è mai spenta in mille anni. Nemmeno durante le Convergenze.', 'Che la Grazia guidi i tuoi passi, figliolo. E che non ti faccia inciampare.'] });
  npcDef('gildo', { name: 'Gildo', title: 'Fabbro Mastro', x: -26, z: 449, face: [0, 465], st: ST.gildo, color: '#ffb36b', chat: ['Il metallo non mente. Se una lama è storta, è colpa del fabbro. O del cavaliere.', 'Clang! Clang! Scusa, non ti sentivo. Parlavi?'] });
  npcDef('lucetta', { name: 'Lucetta', title: 'Bambina del Quartiere dell\'Arena', x: -52, z: 508, face: [0, 470], st: ST.lucetta, color: '#ffb3c8', chat: ['Sei uno slime vero? Posso toccarti? È morbido?', 'Da grande farò l\'avventuriera di rango S! O la fornaia. Dipende.'] });
  npcDef('doran', { name: 'Capitano Doran', title: 'Guardia della Porta Nord', x: 7, z: 357, face: [0, 400], st: ST.doran, color: '#9fc4ff', chat: ['Porta Nord, tutto tranquillo. Per ora.', 'Venti anni di servizio e mai visto tanti mostri come in questa Convergenza.'] });
  npcDef('isadora', { name: 'Isadora', title: 'Cartografa dell\'Accademia', x: -15, z: 412, face: [0, 440], st: ST.isadora, color: '#efe2bf', chat: ['Le mappe del regno cambiano ogni settimana. Le Crepe spostano perfino le colline!', 'Un buon cartografo misura due volte e cammina tre.'] });
  npcDef('pip', { name: 'Pip', title: 'Mercante Itinerante', x: 112, z: 478, face: [80, 470], st: ST.pip, color: '#ffd36b', chat: ['Compro, vendo, baratto! Tranne il mio cappello. Il cappello non si tocca.', 'Le strade sono pericolose, ma i profitti… ah, i profitti!'], vis: () => !(ESC && ESC.npc === 'pip') });
  npcDef('elric', { name: 'Professor Elric Vane', title: 'Decano dell\'Accademia di Magia', x: -6, z: 404, face: [0, 440], st: ST.elric, color: '#c9a0ff', chat: ['La magia è il linguaggio con cui il mondo parla a se stesso. Tu, mio caro slime, sei una parola nuova.', 'All\'Accademia insegniamo dodici scuole di magia. La tredicesima la stai inventando tu.'] });
  npcDef('merlo', { name: 'Custode Merlo', title: 'Guardiano della Torre', x: 164, z: 480, face: [175, 470], st: ST.merlo, color: '#7df9ff', chat: ['La Torre dei Mille Piani non è stata costruita. È… cresciuta. Da una Crepa.', 'Ogni piano è un mondo diverso. Ricordatelo quando cambia il cielo.'] });
  // existing towns
  npcDef('liora', { name: 'Liora', title: 'Ambasciatrice di Valdoria', x: 70, z: 224, face: [60, 230], st: ST.liora, color: '#b2fff4', chat: ['Valdoria è nata da mostri a cui qualcuno ha dato un nome. Un nome è una promessa.', 'La Nazione e Altheria sono alleate, ora. Grazie anche a te.'] });
  npcDef('gorgo', { name: 'Gorgo', title: 'Sciamano del Villaggio Goblin', x: -40, z: 71, face: [-45, 75], st: ST.gorgo, color: '#c8ff6a', chat: ['Gu-gu. Spiriti del bosco parlano. Parlano di te, grande slime.', 'Gorgo vecchio, ma Gorgo sente ancora odore di Crepa.'] });
  npcDef('fiorella', { name: 'Nonna Fiorella', title: 'Saggia del Borgo delle Lucciole', x: -344, z: 146, face: [-350, 140], st: ST.fiorella, color: '#c8ff6a', chat: ['Le lucciole sono anime gentili, dicono. Io dico che sono lucciole. Ma belle.', 'Siediti, cara creatura. Le gambe… ah, non le hai. Beato te.'] });
  npcDef('hakon', { name: 'Hakon', title: 'Cacciatore del Rifugio Gelido', x: 46, z: -415, face: [40, -420], st: ST.hakon, color: '#bfe3ff', chat: ['Il freddo non uccide. È la fretta che uccide, quassù.', 'Vuoi scaldarti? Il fuoco è lì. Non avvicinarti troppo, sei fatto d\'acqua.'] });
  npcDef('vessa', { name: 'Sergente Vessa', title: 'Avamposto Cremisi', x: 526, z: 45, face: [520, 40], st: ST.vessa, color: '#ff8a5a', chat: ['L\'Avamposto regge. Regge sempre. Finché ci sono io.', 'Le Terre Cremisi non perdonano. Né io.'] });

  // story-dependent small talk: the newest matching entry wins
  const CHAT_BY = {
    ren: [['m4', ['La Spada Sacra è stata riforgiata. Più leggera. O forse sono io che sono diventato più forte.', 'Non pensare che ti debba qualcosa per Gorvan. …Va bene, forse un po\'.']],
      ['m7', ['La voce del Vuoto è sparita. Ma ricordo ogni parola: mi aiuta a non dimenticare chi non voglio essere.', 'Ehi, slime. Grazie. Non farmelo ripetere.']],
      ['m9', ['Protettore di Altheria, eh? Il titolo ti sta bene. Ma il prossimo sarà mio!', 'Ho ripreso ad allenarmi all\'alba. Non per essere il protagonista: per essere all\'altezza.']]],
    sora: [['m5', ['I dati della Torre mi tengono sveglia la notte. Ogni piano è un mondo diverso. Alcuni… somigliano al mio.']],
      ['m8', ['Il segnale del Vuoto è sparito. Ora posso studiare la magia senza la fine del mondo alle calcagna. Che lusso!', 'Sto scrivendo un trattato: "Teoria unificata delle magicule". Capitolo uno: gli slime.']]],
    brann: [['m6', ['Il drago! Ancora non ci credo. Nel mio mondo avremmo cantato per tre giorni.']],
      ['m9', ['Trecento anni di guerra, poi un mondo nuovo e una vittoria vera. Forse resterò qui, piccolo.']]],
    king: [['m6', ['Il guardiano della tempesta riposa in pace. Altheria ti è debitrice.']], ['m9', ['Protettore. Il regno dorme tranquillo sapendo che vegli su di esso.', 'Le Crepe minori continuano ad aprirsi. La Gilda ti terrà occupato, temo.']]],
    liora: [['m3', ['Grazie a te le Crepe di Valdoria sono chiuse. I bambini della Nazione hanno inventato un gioco: "il Sigillatore". Indovina chi interpretano.']]],
    gorgo: [['s_spirito', ['Spirito del bosco felice. Funghi crescono più grandi. Gorgo mangia funghi. Gorgo felice.']]],
  };
  function chatLines(n) {
    let lines = n.chat || ['…'];
    for (const [q, l] of CHAT_BY[n.id] || []) if (QS.q[q] && QS.q[q].s === 'turned') lines = l;
    if (n.id === 'elina' && QS.guild.reg) {
      if (QS.guild.rank >= 5) lines = ['Rango ' + RANKS[QS.guild.rank].l + '… Le altre receptionist mi invidiano: gestisco la pratica di una leggenda!'].concat(lines);
      else if (QS.guild.rank >= 2) lines = ['Il tuo nome gira parecchio in sala comune. Qualcuno ha già aperto delle scommesse su quando arriverai al Rango S.'].concat(lines);
    }
    return lines;
  }

  /* ============================================================ quest helpers & definitions */
  const TN = (t) => (API.TYPES[t] && API.TYPES[t].name) || t;
  const K = (e, n, x) => Object.assign({ t: 'kill', e, n }, x || {});
  const R = (x, z, r, label) => ({ t: 'reach', x, z, r: r || 10, label });
  const TK = (npc, say, x) => Object.assign({ t: 'talk', npc, say }, x || {});
  const HU = (e, n, at, el, x) => Object.assign({ t: 'hunt', e, n, at, el }, x || {});
  const DEFS = {};
  const ORDER = [];
  function Qd(id, o) { o.id = id; DEFS[id] = o; ORDER.push(id); return o; }

  /* ---------------- main story: "La Convergenza dei Mondi" ---------------- */
  Qd('m0', { kind: 'main', ch: 'Prologo', title: 'Il Quarto Evocato', giver: 'king', auto: true, lvl: 1,
    desc: 'Ti sei risvegliato nelle Terre Spezzate in un corpo di slime. L\'Oracolo, la voce analitica che vive dentro di te, ha percepito una enorme concentrazione di magicule: la capitale Altheria, la Città dei Mille Mondi. Il suo Re ti attende.',
    stages: [
      { text: 'Raggiungi Altheria, la Città dei Mille Mondi', objs: [R(0, 470, 28, 'Raggiungi la Piazza delle Mille Stelle')], oracle: '《Rilevata vasta concentrazione di magicule a sud-est. Destinazione suggerita: Altheria.》' },
      { text: 'Il Re di Altheria ti ha convocato al castello', objs: [TK('king', [
        'n:La sala del trono è immensa. Stendardi di cento mondi diversi pendono dalle colonne.',
        'Così sei tu… il Quarto. Avvicinati, creatura. Non temere: qui nessuno ti scambierà per un mostro da abbattere.',
        'Sono Valerian IV, Re di Altheria. Ascolta bene, perché quel che ti dirò cambierà la tua vita. Di nuovo.',
        'Ogni mille anni i mondi si sfiorano. Lo chiamiamo la Convergenza. Si aprono le Crepe, e da esse cade di tutto: mostri, rovine, persone.',
        'Questa volta la Convergenza è… sbagliata. Troppo veloce. Troppo affamata. Qualcosa, oltre il Vuoto, la sta tirando a sé.',
        'Per questo ho compiuto il Rito dell\'Evocazione. Tre eroi da tre mondi diversi hanno risposto. Ma il Rito ha portato una quarta anima.',
        'Te. Un\'anima rinata nel corpo più umile che esista… eppure il cristallo del Rito è quasi esploso, quando sei arrivato.',
        'o:《Analisi: il sovrano dice il vero. Battito regolare, nessuna menzogna rilevata. Probabilità di arruolamento forzato: 94%.》',
        { ask: [
          { t: 'Sono solo uno slime. Perché io?', fn: (D) => D.say(['Gli umili sopravvivono dove i giganti cadono. E tu divori ciò che ti minaccia, mi dicono. Il Vuoto avrà pane per i suoi denti.'], null, { rep: { corona: 5 } }) },
          { t: 'Combatterò. Questo mondo è anche mio, ora.', fn: (D) => D.say(['Parole da re, non da slime. Altheria ricorderà questo giorno.'], null, { rep: { corona: 10 } }) },
          { t: 'Cosa ci guadagno?', fn: (D) => D.say(['Ah, un pragmatico! Oro, terre, titoli… e la possibilità di continuare a esistere. Non male, come paga.'], null, { rep: { corona: 2, gilda: 3 } }) },
        ] },
        'Ti chiedo due cose. Primo: incontra gli altri tre Evocati. Secondo: registrati alla Gilda degli Avventurieri. Elina ti darà la Tessera.',
        'Lì dimostrerai il tuo valore, rango dopo rango. E quando sarai pronto… ti chiamerò di nuovo.',
      ], { label: 'Parla con Re Valerian IV al castello' })] },
    ],
    rew: { xp: 120, gold: 300, rep: { corona: 10 } }, turnIn: null,
    done: ['o:《Missione registrata. Nuovi obiettivi: Evocati ×3, Gilda degli Avventurieri.》'] });

  Qd('m1', { kind: 'main', ch: 'Capitolo 1', title: 'Gli Eroi di Altri Mondi', giver: 'king', auto: true, req: ['m0'], lvl: 1,
    desc: 'Tre eroi sono stati evocati ad Altheria da tre mondi diversi. Incontrali, poi registrati alla Gilda degli Avventurieri.',
    stages: [
      { text: 'Incontra i tre Eroi Evocati', objs: [
        TK('ren', ['Tu? Il quarto evocato è… una gelatina?', 'Io sono Ren Takashiro. Nel mio mondo ero il campione nazionale di kendo, primo in classifica in sei videogiochi e studente modello.', 'Poi un camion. Poi una luce. Poi una spada che canta. Sono il protagonista, è evidente.', 'p:Piacere, Ren.', 'Non metterti in mezzo, slime. Quando il Signore dei Demoni cadrà, sarà la mia spada a farlo cadere.', 'o:《Soggetto: Ren Takashiro. Arroganza elevata. Potenziale elevato. Fragilità emotiva: elevata.》'], { label: 'Incontra Ren, l\'Eroe della Spada (piazza)' }),
        TK('sora', ['Oh! Tu sei il Quarto. Posso… no, non posso toccarti, scusa. Sono Sora Mizuhara.', 'Vengo da un mondo di vetro e luce: città sospese, intelligenze artificiali, nessuna magia. O almeno così credevamo.', 'Qui l\'energia ambientale — le chiamate magicule — risponde al pensiero. È la scoperta del secolo. Di tutti i secoli.', 'La Convergenza segue uno schema. Se riesco a capirlo, possiamo fermarla. Avrò bisogno di dati. E di qualcuno che li raccolga… sul campo.', 'o:《Soggetto: Sora Mizuhara. Intelletto eccezionale. Affidabilità: alta. Suggerimento: cooperare.》'], { label: 'Incontra Sora, l\'Arcanista (Accademia)' }),
        TK('brann', ['Ah! Il piccolo che tutti chiamano "il Quarto". Siediti. Bevi. Ah, giusto, non hai bocca. O sì?', 'Brann Durnhal, delle Lande di Kharvos. Nel mio mondo la guerra durava da trecento anni. Io ne ho combattuti centoventi.', 'Il Rito mi ha strappato da un campo di battaglia. Mi sono detto: un\'altra guerra. Almeno qui c\'è chi la vuole vincere.', 'Hai l\'odore di un predatore, slime. Un giorno combatteremo fianco a fianco. Allora vedremo chi divora chi.', 'o:《Soggetto: Brann Durnhal. Razza: bestiale. Forza fisica: 4,2 volte la media umana. Lealtà: altissima.》'], { label: 'Incontra Brann, il Campione (taverna)' }),
      ] },
      { text: 'Registrati come avventuriero', objs: [TK('elina', null, { fn: 'register', label: 'Registrati alla Gilda degli Avventurieri (Elina)' })] },
    ],
    rew: { xp: 200, gold: 400, rep: { eroi: 10, gilda: 10 } }, turnIn: 'king',
    done: ['Gli Evocati ti hanno incontrato e la Gilda ti ha accolto. Bene, molto bene.', 'Ma ho notizie preoccupanti: al Villaggio Goblin, nelle Pianure Dorate, gli spiriti del bosco impazziscono. Le bestie attaccano senza motivo.', 'Va\' laggiù. Lo sciamano Gorgo saprà dirti di più.'] });

  Qd('m2', { kind: 'main', ch: 'Capitolo 2', title: 'Il Villaggio dei Senza Nome', giver: 'king', auto: true, req: ['m1'], lvl: 3,
    desc: 'Le bestie delle Pianure Dorate attaccano il Villaggio Goblin. Lo sciamano Gorgo sospetta che una Crepa stia avvelenando gli spiriti del bosco.',
    stages: [
      { text: 'Raggiungi il Villaggio Goblin', objs: [R(-45, 75, 22, 'Raggiungi il Villaggio Goblin')] },
      { text: 'Parla con lo sciamano Gorgo', objs: [TK('gorgo', ['Gu-gu! Grande slime è venuto! Gorgo l\'ha visto nel fumo!', 'Lupi neri attaccano villaggio. Occhi rossi. Bava viola. Non lupi normali: lupi della Crepa!', 'Capobranco si chiama Fauce Cava. Grande. Cattivo. Mangia goblin a colazione.', 'Tu uccidere Fauce Cava e suo branco? Gorgo darà grande benedizione!', 'o:《Analisi: tracce di energia dimensionale a ovest del villaggio. Ostili in avvicinamento.》'])] },
      { text: 'Elimina il branco corrotto', objs: [HU('wolf', 4, { x: -82, z: 52 }, { name: 'Lupo della Crepa', hp: 1.6, sc: 1.15, glow: '#b04dff' }, { label: 'Elimina i Lupi della Crepa' }),
        HU('wolf', 1, { x: -86, z: 46 }, { name: 'Fauce Cava, Alfa della Crepa', hp: 4.5, sc: 1.6, glow: '#d24dff', dmg: 1.4, runes: 6 }, { label: 'Abbatti Fauce Cava' })] },
      { text: 'Torna da Gorgo', objs: [TK('gorgo', ['Gu-gu-GU! Fauce Cava morto! Villaggio salvo!', 'Ma Gorgo ha visto cosa c\'era dentro Fauce Cava: una scheggia di Crepa. Viola. Fredda. Parla.', 'Diceva un nome: "Nyxareth". Gorgo ha paura di quel nome.', 'o:《Avviso: il nome "Nyxareth" corrisponde a un\'entità classificata come Calamità. Archivio insufficiente.》'])] },
    ],
    rew: { xp: 400, gold: 650, rep: { nazione: 10, popolo: 5 }, loot: 1, ilvl: 6 }, turnIn: null,
    done: ['o:《La Nazione di Valdoria, poco a nord-est, è alleata dei goblin. L\'Ambasciatrice Liora potrebbe sapere di più sulle schegge.》'] });

  Qd('m3', { kind: 'main', ch: 'Capitolo 3', title: 'Le Crepe di Valdoria', giver: 'liora', auto: true, req: ['m2'], lvl: 6,
    desc: 'L\'Ambasciatrice Liora di Valdoria ha mappato tre Crepe Dimensionali aperte nelle regioni. Vanno sigillate prima che si allarghino.',
    stages: [
      { text: 'Raggiungi Valdoria e parla con l\'Ambasciatrice Liora', objs: [TK('liora', ['Tu sei il Quarto Evocato. I goblin cantano già canzoni su di te. Stonate, ma sincere.', 'Sono Liora, Ambasciatrice di Valdoria. La nostra Nazione è nata da mostri a cui qualcuno ha donato un nome.', 'Ho mappato tre Crepe stabili: nelle Pianure Dorate, nelle Terre Cremisi e nella Palude dei Sussurri.', 'Ognuna sputa creature ogni ora. Se restano aperte, si fonderanno in una sola. E allora…', 'Avvicinati a una Crepa: i suoi guardiani si mostreranno. Abbattili e la Crepa collasserà.', 'o:《Coordinate delle Crepe registrate. Sono state aggiunte alla bussola.》'], { label: 'Parla con Liora a Valdoria' })] },
      { text: 'Sigilla le tre Crepe Dimensionali', objs: [
        { t: 'rift', x: 118, z: 118, wave: ['soldier', 'soldier', 'wolf', 'soldier'], label: 'Sigilla la Crepa delle Pianure' },
        { t: 'rift', x: 305, z: 150, wave: ['knight', 'soldier', 'soldier', 'wolf'], label: 'Sigilla la Crepa Cremisi' },
        { t: 'rift', x: -285, z: 105, wave: ['wolf', 'wolf', 'knight', 'wolf'], label: 'Sigilla la Crepa della Palude' },
      ] },
      { text: 'Torna da Liora a Valdoria', objs: [TK('liora', ['Le tre Crepe… sigillate. Valdoria respira di nuovo.', 'Ma i miei studiosi hanno notato una cosa: le Crepe non erano casuali. Formavano un cerchio. E al centro…', 'Le Terre Cremisi. Dove regna Gorvan, il Tiranno Caduto.', 'Uno dei vostri eroi, Ren, è partito questa mattina per affrontarlo. Da solo.'])] },
    ],
    rew: { xp: 900, gold: 1200, rep: { nazione: 20 }, loot: 1, ilvl: 10, boost: 1 }, turnIn: null });

  Qd('m4', { kind: 'main', ch: 'Capitolo 4', title: 'L\'Ombra del Tiranno', giver: 'brann', auto: true, req: ['m3'], lvl: 12,
    desc: 'Ren è partito da solo per affrontare Gorvan, il Tiranno Caduto. Brann teme il peggio.',
    stages: [
      { text: 'Parla con Brann ad Altheria', objs: [TK('brann', ['Quel ragazzo testardo! Ren è andato dal Tiranno senza nessuno. Ha detto che "il protagonista non ha bisogno di comprimari".', 'È tornato un\'ora fa, trascinato da un carro. Vivo, per miracolo. La Spada Sacra era spezzata.', 'Gorvan non è un semplice bruto. Era un re, prima della Convergenza. La Crepa l\'ha svuotato e riempito di rabbia.', 'Io devo restare a guardia della città. Tu vai, piccolo. Mostra a quel Tiranno cosa sa fare uno slime.'])] },
      { text: 'Raggiungi la Soglia del Tiranno', objs: [R(430, -175, 14, 'Raggiungi la Soglia del Tiranno (Terre Cremisi)')] },
      { text: 'Sconfiggi Gorvan, il Tiranno Caduto', objs: [{ t: 'boss', b: 'tyrant', at: { x: 430, z: -230 }, label: 'Sconfiggi Gorvan, il Tiranno Caduto' }], oracle: '《Avviso: entità di classe Boss rilevata. Raccomandazione: schivare gli attacchi ad area. Colpire durante il recupero.》' },
      { text: 'Torna da Ren ad Altheria', objs: [TK('ren', ['…Lo hai battuto. Gorvan. Quello che mi ha spezzato la spada.', 'Non dirò grazie. Non te l\'ho chiesto io.', '…', 'Va bene. Grazie. Ma solo questa volta. E non dirlo a Brann.', 'o:《Soggetto: Ren Takashiro. Orgoglio ferito. Rilevata una leggera crepa nella sua aura. Monitoraggio consigliato.》'], { label: 'Parla con Ren in piazza' })] },
    ],
    rew: { xp: 1800, gold: 2500, rep: { eroi: 15, corona: 10 }, loot: 2, ilvl: 16, boost: 1 }, turnIn: null });

  Qd('m5', { kind: 'main', ch: 'Capitolo 5', title: 'La Torre dei Mille Piani', giver: 'sora', auto: true, req: ['m4'], lvl: 15, rankReq: 2,
    desc: 'Sora ha scoperto che la Torre dei Mille Piani, oltre la Porta Est, è un "chiodo" che tiene uniti i mondi. Per studiarla servono misure prese all\'interno.',
    stages: [
      { text: 'Parla con Sora all\'Accademia', objs: [TK('sora', ['Eccoti! Ho finito i calcoli. Ricordi le Crepe a cerchio? Il loro punto di convergenza non è Gorvan.', 'È la Torre dei Mille Piani, appena fuori dalla Porta Est. Non è un edificio: è un ago conficcato nella realtà.', 'Ogni piano è un frammento di un mondo diverso. Se la Torre cede, i mondi collassano l\'uno sull\'altro.', 'Mi servono letture dal quinto piano. Porta con te questo cristallo: registrerà tutto.', 'o:《Cristallo di misurazione sincronizzato. Avvicinati alla Torre.》'])] },
      { text: 'Raggiungi la Torre dei Mille Piani', objs: [R(175, 470, 16, 'Raggiungi l\'ingresso della Torre (fuori dalla Porta Est)')] },
      { text: 'Scala la Torre', objs: [{ t: 'floor', n: 5, label: 'Raggiungi il 5° piano della Torre' }] },
      { text: 'Riporta le misure a Sora', objs: [TK('sora', ['I dati… sono peggio di quanto temessi.', 'C\'è un segnale che parte dal fondo della Torre e arriva al Vuoto. Qualcuno sta tirando la Torre come una corda.', 'Nyxareth. Il Signore dei Demoni. È lui che accelera la Convergenza: vuole che tutti i mondi cadano nel Vuoto, per divorarli.', 'E c\'è altro: il segnale più forte arriva dalla Vetta della Tempesta. Dal Drago.'])] },
    ],
    rew: { xp: 2600, gold: 3200, rep: { eroi: 10, gilda: 10 }, loot: 2, ilvl: 20, boost: 1 }, turnIn: null });

  Qd('m6', { kind: 'main', ch: 'Capitolo 6', title: 'Il Cuore della Tempesta', giver: 'king', auto: true, req: ['m5'], lvl: 20,
    desc: 'Il Drago della Tempesta Antica fa da àncora a una Crepa sulla Vetta. Il Re chiede che sia abbattuto.',
    stages: [
      { text: 'Fai rapporto al Re', objs: [TK('king', ['Sora mi ha riferito. Il Drago della Tempesta Antica… un tempo era il guardiano di Altheria.', 'Se la Crepa lo ha corrotto, non c\'è altra scelta. Liberalo dalla sua prigione di fulmini.', 'Brann ti accompagnerà fino al Passo Gelido. Oltre, la Vetta è tua.'])] },
      { text: 'Raggiungi la Vetta della Tempesta', objs: [R(-120, -520, 18, 'Raggiungi la Vetta della Tempesta (Vette Gelide)')] },
      { text: 'Abbatti il Drago della Tempesta Antica', objs: [{ t: 'boss', b: 'dragon', at: { x: -120, z: -590 }, label: 'Abbatti il Drago della Tempesta Antica' }], oracle: '《Avviso: il drago controlla i fulmini. Restare in movimento durante la tempesta.》' },
      { text: 'Torna da Brann', objs: [TK('brann', ['HA! L\'hai abbattuto davvero! Il cielo sopra la Vetta è sereno per la prima volta da secoli!', 'Nel mio mondo avremmo cantato per tre giorni. Qui… beh, una birra la offro io.', 'Ma ascolta: Ren è sparito. Ha lasciato questa nella sua stanza.', 'n:Brann ti mostra una piuma nera. Al tatto è gelida, e sussurra.'])] },
    ],
    rew: { xp: 4000, gold: 5000, rep: { corona: 15, eroi: 10 }, loot: 2, ilvl: 26, boost: 2 }, turnIn: null });

  Qd('m7', { kind: 'main', ch: 'Capitolo 7', title: 'Il Sussurro del Vuoto', giver: 'sora', auto: true, req: ['m6'], lvl: 24,
    desc: 'Ren è scomparso. Una piuma del Vuoto è stata trovata nella sua stanza. Nyxareth sussurra agli eroi più fragili.',
    start: () => { QS.flags.renGone = true; },
    stages: [
      { text: 'Parla con Sora all\'Accademia', objs: [TK('sora', ['La piuma… è un catalizzatore del Vuoto. Chi la tocca sente una voce che promette tutto ciò che desidera.', 'Ren voleva essere il protagonista. Il più forte. Nyxareth gli ha offerto esattamente questo.', 'Ho tracciato la sua aura: è alle Rovine del Risveglio. Dove tu sei nato in questo mondo.', 'Ti prego… riportalo indietro. Non è cattivo. È solo un ragazzo che ha paura di non contare niente.'])] },
      { text: 'Affronta Ren alle Rovine del Risveglio', objs: [R(0, 6, 16, 'Raggiungi le Rovine del Risveglio'), HU('eroe_caduto', 1, { x: 4, z: -10 }, null, { label: 'Sconfiggi Ren, l\'Eroe Corrotto', boss: true })], seq: true },
      { text: 'Parla con Ren', start: () => { QS.flags.renGone = false; }, objs: [TK('ren', ['…La voce è sparita. Finalmente silenzio.', 'Mi diceva che ero speciale. Che tu mi avevi rubato la storia. Che solo io meritavo di essere l\'eroe.', 'E io ci ho creduto. Perché era quello che volevo sentire.', 'p:Non devi essere il protagonista, Ren. Devi solo essere te stesso.', '…Tsk. Parli come un personaggio secondario saggio. Odio quando hanno ragione.', 'Quando affronterai Nyxareth, la mia spada sarà al tuo fianco. Te lo devo.'], { label: 'Parla con Ren in piazza' })] },
    ],
    rew: { xp: 5500, gold: 6500, rep: { eroi: 25 }, loot: 2, ilvl: 30, boost: 2 }, turnIn: null });

  Qd('m8', { kind: 'main', ch: 'Capitolo 8', title: 'La Convergenza', giver: 'king', auto: true, req: ['m7'], lvl: 28, rankReq: 3,
    desc: 'Nyxareth, il Signore dei Demoni, sta aprendo il Cratere della Convergenza nelle Vette Gelide. È l\'ora della battaglia finale.',
    stages: [
      { text: 'Partecipa al Consiglio di Guerra', objs: [TK('king', ['Il cielo a nord-ovest si è spaccato. I miei esploratori lo chiamano il Cratere della Convergenza.', 'Nyxareth sta forzando l\'ultima porta. Se si apre, tutti i mondi — il tuo, quelli degli eroi, il nostro — cadranno nel Vuoto.', '@ren:La mia spada è riforgiata. Questa volta combatto con gli altri, non al posto degli altri.', '@sora:Ho calcolato tutto. Tre Crepe tengono aperto il Cratere: sigillatele e Nyxareth sarà vulnerabile.', '@brann:E quando sarà vulnerabile… lo faremo a pezzi. Insieme.', 'Va\', Evocato. Il destino di mille mondi cammina con te.'], { label: 'Parla con il Re (Consiglio di Guerra)' })] },
      { text: 'Raggiungi il Cratere della Convergenza', objs: [R(-420, -300, 30, 'Raggiungi il Cratere della Convergenza')] },
      { text: 'Sigilla le Crepe del Cratere', objs: [
        { t: 'rift', x: -455, z: -270, wave: ['knight', 'knight', 'wolf', 'wolf'], label: 'Sigilla la Crepa Occidentale' },
        { t: 'rift', x: -385, z: -268, wave: ['knight', 'soldier', 'soldier', 'knight'], label: 'Sigilla la Crepa Orientale' },
        { t: 'rift', x: -420, z: -338, wave: ['knight', 'knight', 'knight'], label: 'Sigilla la Crepa Centrale' },
      ] },
      { text: 'Sconfiggi Nyxareth, il Signore dei Demoni', objs: [HU('demon_lord', 1, { x: -420, z: -305 }, null, { label: 'Sconfiggi Nyxareth, Signore dei Demoni', boss: true })], allies: true,
        oracle: '《Allarme: entità di classe Calamità. Gli Eroi Evocati sono in posizione. Probabilità di vittoria: in aumento.》' },
    ],
    rew: { xp: 12000, gold: 15000, rep: { corona: 30, eroi: 30, gilda: 20, popolo: 30 }, loot: 3, ilvl: 40, boost: 3, title: 'Sigillatore della Convergenza' }, turnIn: null,
    done: ['n:Il Cratere si richiude con un boato che si sente in mille mondi. Il cielo torna azzurro.', '@sora:Il segnale… è sparito. La Convergenza sta rallentando. Ce l\'abbiamo fatta!', '@brann:HA! Racconterò questa battaglia per trecento anni!', '@ren:…Non male, slime. Non male per niente.'] });

  Qd('m9', { kind: 'main', ch: 'Epilogo', title: 'Il Re dei Mille Mondi', giver: 'king', auto: true, req: ['m8'], lvl: 28,
    desc: 'Nyxareth è caduto. Altheria festeggia. Il Re ti attende per l\'ultima udienza.',
    stages: [{ text: 'Torna dal Re', objs: [TK('king', ['Evocato. Anzi no: {P}. Oggi ti chiamerò con il tuo nome.', 'Hai attraversato il regno, sigillato le Crepe, abbattuto Tiranni e Draghi, salvato un eroe da se stesso e un mondo dal Vuoto.', 'Per questo, davanti alla corte e ai mille mondi, ti nomino Protettore di Altheria.', 'La Convergenza rallenta, ma non è finita. Le Crepe minori continueranno ad aprirsi. La Torre resta in piedi.', 'La Gilda avrà sempre bisogno di te. E io… anche.', 'o:《Missione principale completata. Il viaggio, tuttavia, continua.》'])] }],
    rew: { xp: 6000, gold: 10000, rep: { corona: 50 }, loot: 1, ilvl: 45, boost: 3, title: 'Protettore di Altheria' }, turnIn: null,
    done: ['n:FINE DEL PRIMO ATTO — La Convergenza dei Mondi'] });

  /* ---------------- side quests ---------------- */
  Qd('s_pane', { kind: 'side', title: 'Il Pane del Mattino', giver: 'tobia', lvl: 2,
    desc: 'Tobia il fornaio ha finito la carne per i suoi famosi pasticci. I lupi delle Pianure ne sono pieni, dice lui.',
    intro: ['Ah, avventuriero! Proprio te cercavo. I miei pasticci di carne sono famosi in tutta Altheria…', 'Ma la carne è finita, e il macellaio è scappato quando ha visto un eroe evocato mangiare dodici salsicce di fila.', 'Mi porteresti 5 tagli di carne di lupo? Pago bene. E ti regalo il primo pasticcio!'],
    stages: [{ text: 'Raccogli carne di lupo', objs: [{ t: 'drop', e: 'wolf', item: 'Carne di Lupo', n: 5, ch: 0.7, label: 'Raccogli Carne di Lupo (dai lupi)' }] }],
    rew: { xp: 180, gold: 250, rep: { popolo: 8 }, flask: false }, turnIn: 'tobia',
    done: ['Che profumo! Questi pasticci andranno a ruba. Tieni, la tua paga. E il pasticcio… ah, giusto, lo digerisci da fuori. Comodo!'] });
  Qd('s_erbe', { kind: 'side', title: 'Erbe della Luna', giver: 'orsola', lvl: 3,
    desc: 'Madama Orsola ha bisogno di Erba Lunare, che cresce solo nelle radure a sud-ovest della città.',
    intro: ['Ah, una creatura gentile! Si vede subito, sai. Hai un\'aura… umida.', 'L\'Erba Lunare brilla nelle radure a sud-ovest delle mura. Mi servono 6 steli per il mio unguento.', 'Attento: dove cresce l\'Erba Lunare, le bestie diventano nervose.'],
    stages: [{ text: 'Raccogli Erba Lunare', objs: [{ t: 'gather', item: 'Erba Lunare', n: 6, at: { x: -150, z: 600 }, r: 26, color: '#9fffd0', label: 'Raccogli Erba Lunare (radure a sud-ovest)' }] }],
    rew: { xp: 220, gold: 300, rep: { popolo: 8 }, loot: 1, ilvl: 4 }, turnIn: 'orsola',
    done: ['Perfette! Profumano di notte e di rugiada. Ecco la tua ricompensa, e ricorda: la Gelatina Cremisi cura il corpo, ma l\'Erba Lunare cura l\'anima.'] });
  Qd('s_reliquia', { kind: 'side', title: 'La Reliquia Profanata', giver: 'anselmo', lvl: 6,
    desc: 'Cavalieri Oscuri hanno occupato le rovine vicine alla Chiesa della Gelatina, profanando un antico reliquiario.',
    intro: ['Figliolo, porto una notizia triste. Le rovine accanto alla Chiesa della Gelatina sono state profanate.', 'Cavalieri Oscuri, anime vuote in armature nere, montano la guardia al reliquiario dei Primi Evocati.', 'Liberali dalla loro prigione d\'acciaio. Sconfiggine tre e la reliquia sarà salva.'],
    stages: [{ text: 'Libera le rovine dai Cavalieri Oscuri', objs: [K('knight', 3, { near: { x: 86, z: 66, r: 45 }, label: 'Sconfiggi Cavalieri Oscuri presso le Rovine' })] }],
    rew: { xp: 500, gold: 600, rep: { popolo: 10, corona: 5 }, loot: 1, ilvl: 8 }, turnIn: 'anselmo',
    done: ['Le anime di quei cavalieri ora riposano. La Grazia te ne renderà merito. E anche io, con qualcosa di più tangibile.'] });
  Qd('s_ferro', { kind: 'side', title: 'Ferro per la Forgia', giver: 'gildo', lvl: 4,
    desc: 'Gildo il fabbro vuole il ferro speciale che i goblin rubano alle carovane: lo fondono in emblemi.',
    intro: ['Ehi, tu! Sì, la gelatina. I goblin rubano ferro alle carovane e lo fondono in emblemi brutti come la fame.', 'Ma quel ferro è purissimo! Portami 5 Emblemi Goblin e ti forgio qualcosa di decente.'],
    stages: [{ text: 'Recupera emblemi di ferro', objs: [{ t: 'drop', e: 'soldier', item: 'Emblema Goblin', n: 5, ch: 0.6, label: 'Raccogli Emblemi Goblin (dai Soldati Goblin)' }] }],
    rew: { xp: 280, gold: 350, rep: { popolo: 6 }, loot: 1, ilvl: 7, boost: 1 }, turnIn: 'gildo',
    done: ['Ah, ferro dolce come il miele! Ecco, l\'ho forgiato mentre parlavi. Sì, sono così veloce. Clang!'] });
  Qd('s_gatto', { kind: 'side', title: 'Il Gatto di Lucetta', giver: 'lucetta', lvl: 2,
    desc: 'Il gatto di Lucetta, Biscotto, è scappato oltre la Porta Ovest. Riportalo a casa sano e salvo.',
    intro: ['*snif* Biscotto è scappato! È andato fuori dalla Porta Ovest, dove ci sono i lupi!', 'È arancione, grasso e si chiama Biscotto. Se lo chiami, non viene. Ma se trova da mangiare sì.', 'Ti prego, riportalo a casa!'],
    stages: [
      { text: 'Trova Biscotto oltre la Porta Ovest', objs: [R(-185, 452, 7, 'Trova Biscotto (oltre la Porta Ovest)')] },
      { text: 'Riporta Biscotto da Lucetta', objs: [{ t: 'escort', who: 'biscotto', from: { x: -185, z: 452 }, to: { x: -52, z: 508 }, r: 7, amb: 'wolf', ambN: 2, label: 'Riporta Biscotto da Lucetta' }] },
    ],
    rew: { xp: 200, gold: 200, rep: { popolo: 12 } }, turnIn: 'lucetta',
    done: ['BISCOTTO! Sei tornato! *abbraccia il gatto, che protesta*', 'Grazie, grazie, grazie! Tieni, sono tutti i miei risparmi. E un disegno di te. Sei il cerchio blu.'] });
  Qd('s_porte', { kind: 'side', title: 'Ululati alle Porte', giver: 'doran', lvl: 5,
    desc: 'Un branco guidato da un lupo alfa minaccia la strada a nord di Altheria.',
    intro: ['Avventuriero. Un branco si è stabilito sulla strada nord. Guidato da un alfa che chiamano Zannagrigia.', 'Le carovane non passano più. I miei uomini servono alle mura. Te ne occupi tu?'],
    stages: [{ text: 'Elimina il branco di Zannagrigia', objs: [HU('wolf', 4, { x: -30, z: 300 }, { name: 'Lupo del Branco', hp: 1.3, sc: 1.05 }, { label: 'Elimina i Lupi del Branco' }), HU('wolf', 1, { x: -36, z: 295 }, { name: 'Zannagrigia, Lupo Alfa', hp: 3.5, sc: 1.5, glow: '#9fd8ff', dmg: 1.3, runes: 5 }, { label: 'Abbatti Zannagrigia' })] }],
    rew: { xp: 420, gold: 500, rep: { corona: 8, popolo: 6 }, loot: 1, ilvl: 7 }, turnIn: 'doran',
    done: ['Zannagrigia è caduto? Ottimo lavoro. La strada nord è di nuovo sicura. La Corona non dimentica.'] });
  Qd('s_mappa', { kind: 'side', title: 'Cartografia delle Terre Spezzate', giver: 'isadora', lvl: 5,
    desc: 'Isadora deve aggiornare la mappa del regno: visita tre punti di osservazione.',
    intro: ['Le Crepe hanno spostato colline e fiumi. La mappa dell\'Accademia è un disastro!', 'Mi servono rilevamenti da tre punti: le Colline del Tramonto, il Crocevia Dorato e l\'Accampamento Cremisi.', 'Basta che tu ci vada: il mio cristallo di rilevamento farà il resto.'],
    stages: [{ text: 'Effettua i rilevamenti', objs: [R(180, 300, 14, 'Rilevamento: Colline del Tramonto'), R(-150, 140, 14, 'Rilevamento: Crocevia Dorato'), R(330, -40, 14, 'Rilevamento: Accampamento Cremisi')] }],
    rew: { xp: 600, gold: 500, rep: { gilda: 6, popolo: 4 }, loot: 1, ilvl: 9 }, turnIn: 'isadora',
    done: ['Meraviglioso! Il Crocevia si è spostato di quaranta passi a est. Te l\'avevo detto: un disastro. Ma un disastro mappato!'] });
  Qd('s_carovana', { kind: 'side', title: 'La Carovana di Pip', giver: 'pip', lvl: 6,
    desc: 'Pip deve portare le sue merci a Valdoria, ma la strada è infestata dai goblin.',
    intro: ['Ehilà! Pip, mercante itinerante, al tuo servizio! E tu, al mio, se vuoi guadagnare qualcosa.', 'Devo arrivare a Valdoria con le mie merci. La strada è piena di goblin che adorano le mie merci più di me.', 'Scortami fino a Valdoria. Io cammino, tu… rimbalzi. Affare fatto?'],
    stages: [{ text: 'Scorta Pip fino a Valdoria', objs: [{ t: 'escort', who: 'pip', from: { x: 112, z: 478 }, to: { x: 60, z: 250 }, r: 16, amb: 'soldier', ambN: 4, label: 'Scorta Pip fino a Valdoria' }] }],
    rew: { xp: 520, gold: 700, rep: { popolo: 6, nazione: 6 }, loot: 1, ilvl: 9, boost: 1 }, turnIn: null,
    done: ['@pip:Valdoria! Tutto intero, merci comprese! Sei il miglior rimbalzatore del regno. Ecco la tua parte, socio!'] });
  Qd('s_essenze', { kind: 'side', title: 'Studio sulle Essenze', giver: 'elric', lvl: 4,
    desc: 'Il Professor Elric vuole studiare l\'abilità Predatore: divora 5 nemici indeboliti.',
    intro: ['Ah, il famoso Predatore! Sai che nessuno, in tremila anni di annali, ha mai descritto un\'abilità simile?', 'Divorare l\'essenza di un nemico e assimilarne il potere… Affascinante! Terrificante! Ma soprattutto affascinante.', 'Divora 5 nemici con il Predatore (tasto G, quando sono indeboliti). Il mio cristallo registrerà le fluttuazioni.'],
    stages: [{ text: 'Divora i nemici con il Predatore', objs: [K('any', 5, { abs: true, label: 'Divora 5 nemici con il Predatore' })] }],
    rew: { xp: 450, gold: 400, rep: { gilda: 4 }, loot: 1, ilvl: 8, boost: 1 }, turnIn: 'elric',
    done: ['Straordinario! Le fluttuazioni sono… non lineari! Scriverò un trattato. Forse tre. Il tuo nome sarà in copertina. In piccolo.'] });
  Qd('s_valdoria', { kind: 'side', title: 'Pattuglia della Nazione', giver: 'liora', lvl: 8, req: ['m3'],
    desc: 'Liora chiede di sfoltire le bande di goblin selvaggi che razziano le Pianure Dorate.',
    intro: ['Non tutti i goblin hanno ricevuto un nome. Alcuni sono ancora selvaggi, e razziano le nostre fattorie.', 'Sconfiggine 8 nelle Pianure Dorate. Non per crudeltà: per proteggere chi ha scelto la pace.'],
    stages: [{ text: 'Pattuglia le Pianure Dorate', objs: [K('soldier', 8, { reg: 'center', label: 'Sconfiggi Soldati Goblin (Pianure Dorate)' })] }],
    rew: { xp: 700, gold: 650, rep: { nazione: 15 }, loot: 1, ilvl: 11 }, turnIn: 'liora',
    done: ['Le fattorie respirano. Valdoria ti è grata. Un giorno, forse, anche quei goblin avranno un nome.'] });
  Qd('s_spirito', { kind: 'side', title: 'Lo Spirito del Bosco', giver: 'gorgo', lvl: 7, req: ['m2'],
    desc: 'Gorgo vuole purificare lo spirito del bosco: servono Funghi Lumino e la caduta dello Spirito Corrotto.',
    intro: ['Gu. Spirito del bosco ancora triste. Scheggia di Crepa ha lasciato veleno.', 'Gorgo deve fare rito. Servono 5 Funghi Lumino, crescono vicino al villaggio.', 'Poi… Spirito Corrotto. Armatura vuota con dentro tristezza. Tu abbattere, Gorgo purificare.'],
    stages: [
      { text: 'Raccogli Funghi Lumino', objs: [{ t: 'gather', item: 'Fungo Lumino', n: 5, at: { x: -78, z: 110 }, r: 18, color: '#c8ff6a', label: 'Raccogli Funghi Lumino' }] },
      { text: 'Abbatti lo Spirito Corrotto', objs: [HU('knight', 1, { x: -95, z: 30 }, { name: 'Spirito Corrotto del Bosco', hp: 2.5, sc: 1.3, glow: '#7dff8a', dmg: 1.1, runes: 4 }, { label: 'Abbatti lo Spirito Corrotto' })] },
    ],
    rew: { xp: 650, gold: 500, rep: { nazione: 10 }, loot: 1, ilvl: 10, boost: 1 }, turnIn: 'gorgo',
    done: ['Gu-gu-gu… *danza intorno al fuoco* Spirito libero! Bosco felice! Gorgo felice! Tu prendere, regalo di Gorgo.'] });
  Qd('s_lucciole', { kind: 'side', title: 'Le Lucciole Perdute', giver: 'fiorella', lvl: 9,
    desc: 'Le lanterne del Borgo si sono spente. Nonna Fiorella chiede di raccogliere le Lucciole Spirito sparse nella palude.',
    intro: ['Le lanterne del Borgo si accendono con le Lucciole Spirito. Ma ieri notte una Crepa le ha disperse.', 'Sono qui intorno, nella palude. Raccoglierne 7 basterà per riaccendere il salice.', 'Sono gentili: non scappano. Basta tenderle… una mano. O quello che hai.'],
    stages: [{ text: 'Raccogli le Lucciole Spirito', objs: [{ t: 'gather', item: 'Lucciola Spirito', n: 7, at: { x: -330, z: 205 }, r: 28, color: '#d8ff6a', label: 'Raccogli Lucciole Spirito (palude)' }] }],
    rew: { xp: 800, gold: 600, rep: { popolo: 8, nazione: 4 }, loot: 1, ilvl: 12 }, turnIn: 'fiorella',
    done: ['Guarda come brilla il salice! Il Borgo è di nuovo il Borgo. Tieni, cara creatura, l\'ho cucito per te.'] });
  Qd('s_brina', { kind: 'side', title: 'La Bestia del Passo', giver: 'hakon', lvl: 14,
    desc: 'Una bestia chiamata Fauce di Brina divora i viandanti sul Passo Gelido.',
    intro: ['Viaggiatore. Sul Passo c\'è una bestia. La chiamano Fauce di Brina. Ha già preso tre cacciatori.', 'Io sono vecchio e la mia mano trema. Ma tu… tu hai l\'aria di chi divora le bestie, non il contrario.'],
    stages: [{ text: 'Caccia Fauce di Brina', objs: [HU('wolf', 1, { x: -20, z: -370 }, { name: 'Fauce di Brina', hp: 6, sc: 1.9, glow: '#bfe3ff', dmg: 1.6, runes: 8 }, { label: 'Abbatti Fauce di Brina (Passo Gelido)' }), K('wolf', 4, { reg: 'north', label: 'Sconfiggi lupi nelle Vette Gelide' })] }],
    rew: { xp: 1600, gold: 1400, rep: { popolo: 6 }, loot: 2, ilvl: 18, boost: 1 }, turnIn: 'hakon',
    done: ['L\'hai presa. Il Passo è libero. I cacciatori canteranno di te attorno al fuoco. Prendi questo: era di mio padre.'] });
  Qd('s_cremisi', { kind: 'side', title: 'Rinforzi Cremisi', giver: 'vessa', lvl: 12,
    desc: 'Il Sergente Vessa chiede aiuto contro i Cavalieri Oscuri che assediano l\'Avamposto Cremisi.',
    intro: ['Tu. Sei quello che chiamano il Quarto? Bene. Mi servono braccia. O pseudopodi.', 'I Cavalieri Oscuri assediano l\'Avamposto da est. Abbattine 4 nelle Terre Cremisi e il loro assedio crollerà.'],
    stages: [{ text: 'Spezza l\'assedio', objs: [K('knight', 4, { reg: 'east', label: 'Sconfiggi Cavalieri Oscuri (Terre Cremisi)' })] }],
    rew: { xp: 1300, gold: 1200, rep: { corona: 10 }, loot: 1, ilvl: 16, boost: 1 }, turnIn: 'vessa',
    done: ['L\'assedio è rotto. Non male, per una pozzanghera che parla. Questo è per te. Non farmelo ripetere.'] });
  Qd('s_ren', { kind: 'side', title: 'La Sfida della Spada', giver: 'ren', lvl: 10, req: ['m1'],
    desc: 'Ren ti sfida: chi abbatte più nemici in una gara? Dimostragli il tuo valore.',
    intro: ['Ehi, slime. Facciamo una gara. Io e te. Chi abbatte più mostri.', 'Io ne ho già abbattuti 3 Cavalieri Oscuri e 10 lupi stamattina. Vediamo se riesci a fare lo stesso.', 'Se vinci… ammetterò che non sei completamente inutile.'],
    stages: [{ text: 'Supera il punteggio di Ren', objs: [K('knight', 3, { label: 'Sconfiggi Cavalieri Oscuri' }), K('wolf', 10, { label: 'Sconfiggi lupi' })] }],
    rew: { xp: 1000, gold: 800, rep: { eroi: 12 }, loot: 1, ilvl: 13, boost: 1 }, turnIn: 'ren',
    done: ['…Già fatto? Tsk. Va bene, va bene. Non sei completamente inutile. Ecco, l\'ho detto. Felice?'] });
  Qd('s_sora', { kind: 'side', title: 'Frammenti di Vetro', giver: 'sora', lvl: 5, req: ['m1'],
    desc: 'Sora ha percepito frammenti del suo mondo caduti presso le Rovine del Risveglio.',
    intro: ['Ho percepito una firma energetica… del mio mondo! Frammenti di vetro-luce, caduti dalle Crepe.', 'Sono vicino alle Rovine del Risveglio. Me ne porteresti 4? Potrei costruire un amplificatore per le mie analisi.'],
    stages: [{ text: 'Raccogli i Frammenti di Vetro-luce', objs: [{ t: 'gather', item: 'Frammento di Vetro-luce', n: 4, at: { x: 10, z: 30 }, r: 22, color: '#7df9ff', label: 'Raccogli Frammenti di Vetro-luce (Rovine del Risveglio)' }] }],
    rew: { xp: 380, gold: 350, rep: { eroi: 10 }, loot: 1, ilvl: 7, boost: 1 }, turnIn: 'sora',
    done: ['Sono loro! Vetro-luce di Neo-Kyrion… la mia città. Guarda come brillano. Grazie. Davvero.'] });
  Qd('s_brann', { kind: 'side', title: 'Onore tra Guerrieri', giver: 'brann', lvl: 8, req: ['m1'],
    desc: 'Brann vuole vedere di cosa sei capace: abbatti il Signore della Guerra Goblin.',
    intro: ['Piccolo! Voglio vedere cosa sai fare. Nell\'accampamento goblin a nord delle Rovine c\'è un capo enorme.', 'Lo chiamano Brutok, Signore della Guerra. Abbattilo, e brinderò al tuo nome.'],
    stages: [{ text: 'Abbatti Brutok', objs: [HU('soldier', 1, { x: 45, z: -32 }, { name: 'Brutok, Signore della Guerra Goblin', hp: 6, sc: 1.8, glow: '#ff7a3a', dmg: 1.6, runes: 6 }, { label: 'Abbatti Brutok, Signore della Guerra' })] }],
    rew: { xp: 700, gold: 600, rep: { eroi: 12 }, loot: 1, ilvl: 11, boost: 2 }, turnIn: 'brann',
    done: ['HA! L\'ho saputo dagli esploratori: un colpo e Brutok ha visto le stelle! Alla tua salute, piccolo predatore!'] });
  Qd('s_torre', { kind: 'side', title: 'Il Primo Passo nella Torre', giver: 'merlo', lvl: 8,
    desc: 'Il Custode Merlo sfida gli avventurieri a raggiungere il terzo piano della Torre.',
    intro: ['La Torre mette alla prova chi la sale. Il terzo piano è dove i novizi diventano avventurieri.', 'Raggiungilo, e saprò che la Torre ti ha accettato.'],
    stages: [{ text: 'Raggiungi il 3° piano della Torre', objs: [{ t: 'floor', n: 3, label: 'Raggiungi il 3° piano della Torre' }] }],
    rew: { xp: 900, gold: 700, rep: { gilda: 10 }, loot: 1, ilvl: 12, boost: 1 }, turnIn: 'merlo',
    done: ['La Torre ti ha accettato. Lo sento dal modo in cui le pietre vibrano. Sali ancora, quando sarai pronto.'] });

  /* ---------------- guild: registration + rank exams ---------------- */
  const EXAM = [null,
    { title: 'Esame di Rango E', desc: 'Dimostra di saper combattere: sconfiggi 6 Soldati Goblin.', objs: [K('soldier', 6, { label: 'Sconfiggi Soldati Goblin' })], xp: 300, gold: 300 },
    { title: 'Esame di Rango D', desc: 'Abbatti Grakk, il Capobanda Goblin che razzia le carovane a nord-est di Valdoria.', objs: [HU('soldier', 1, { x: 140, z: 160 }, { name: 'Grakk, Capobanda Goblin', hp: 4, sc: 1.5, glow: '#ffb36b', dmg: 1.3, runes: 5 }, { label: 'Abbatti Grakk, il Capobanda' })], xp: 700, gold: 600 },
    { title: 'Esame di Rango C', desc: 'Sconfiggi 3 Cavalieri Oscuri e sigilla una Crepa minore nelle Terre Cremisi.', objs: [K('knight', 3, { label: 'Sconfiggi Cavalieri Oscuri' }), { t: 'rift', x: 380, z: 230, wave: ['knight', 'soldier', 'soldier'], label: 'Sigilla la Crepa minore' }], xp: 1500, gold: 1200 },
    { title: 'Esame di Rango B', desc: 'Caccia Ombralupa, l\'alfa che guida i branchi della Palude dei Sussurri.', objs: [HU('wolf', 1, { x: -420, z: -20 }, { name: 'Ombralupa, Alfa della Palude', hp: 7, sc: 1.9, glow: '#b04dff', dmg: 1.7, runes: 8 }, { label: 'Abbatti Ombralupa' }), K('wolf', 6, { reg: 'west', label: 'Sconfiggi lupi della Palude' })], xp: 3000, gold: 2500 },
    { title: 'Esame di Rango A', desc: 'Solo chi ha sconfitto Gorvan e scalato la Torre può diventare un Eroe della Gilda.', objs: [{ t: 'boss', b: 'tyrant', at: { x: 430, z: -230 }, label: 'Sconfiggi Gorvan, il Tiranno Caduto' }, { t: 'floor', n: 8, label: 'Raggiungi l\'8° piano della Torre' }], xp: 5000, gold: 4000 },
    { title: 'Esame di Rango S', desc: 'La prova delle leggende: abbatti il Drago della Tempesta e il Cavaliere del Vuoto.', objs: [{ t: 'boss', b: 'dragon', at: { x: -120, z: -590 }, label: 'Abbatti il Drago della Tempesta Antica' }, HU('knight', 1, { x: -200, z: -425 }, { name: 'Cavaliere del Vuoto', hp: 9, sc: 1.7, glow: '#d24dff', dmg: 2, runes: 12 }, { label: 'Abbatti il Cavaliere del Vuoto' })], xp: 9000, gold: 8000 },
  ];
  for (let r = 1; r < EXAM.length; r++) {
    const E = EXAM[r];
    Qd('exam' + r, { kind: 'guild', exam: r, title: E.title, giver: 'elina', lvl: 1, desc: E.desc,
      intro: ['Hai accumulato abbastanza Punti Gilda per l\'esame di promozione al Rango ' + RANKS[r].l + '!', E.desc, 'Superalo e la tua Tessera cambierà colore. Buona fortuna!'],
      stages: [{ text: E.title, objs: E.objs }], rew: { xp: E.xp, gold: E.gold, rank: r, rep: { gilda: 10 + r * 5 }, loot: r >= 2 ? 1 : 0, ilvl: 5 + r * 7, boost: r >= 4 ? 2 : 1 }, turnIn: 'elina',
      done: ['Esame superato! Congratulazioni! Dammi la Tessera… *timbro* Ecco: ora sei un avventuriero di Rango ' + RANKS[r].l + '!'] });
  }

  /* ============================================================ procedural guild contracts */
  const POI = [
    { n: 'Colline del Tramonto', x: 200, z: 320 }, { n: 'Crocevia Dorato', x: -150, z: 170 }, { n: 'Altopiano Spezzato', x: 250, z: -140 }, { n: 'Valle delle Ossa', x: 420, z: 190 },
    { n: 'Bosco Sussurrante', x: -300, z: -150 }, { n: 'Picchi Gemelli', x: 150, z: -320 }, { n: 'Lago Specchio', x: -130, z: 300 }, { n: 'Cava Abbandonata', x: 310, z: 370 },
    { n: 'Guado dei Salici', x: -250, z: 330 }, { n: 'Pietre Cantanti', x: -60, z: -200 }, { n: 'Faglia Cremisi', x: 560, z: -120 }, { n: 'Ghiacciaio Muto', x: 200, z: -480 },
    { n: 'Stagno delle Lanterne', x: -470, z: 260 }, { n: 'Campo dei Giganti', x: 120, z: 30 }, { n: 'Cripta Dimenticata', x: -230, z: -40 }];
  const HERBS = { center: ['Erba Lunare', '#9fffd0'], north: ['Fiore di Brina', '#bfe3ff'], east: ['Ambra Cremisi', '#ff8a3a'], west: ['Fungo Lumino', '#c8ff6a'] };
  const DROPS = { wolf: 'Zanna di Lupo', soldier: 'Emblema Goblin', knight: 'Frammento d\'Armatura Oscura' };
  const ELITE = { wolf: ['Zannarossa', 'Ululato Grigio', 'Fauce d\'Ombra', 'Artiglio di Cenere', 'Occhio di Luna'], soldier: ['Murzug', 'Kroll', 'Grashak', 'Uzbek il Torvo', 'Skarn'], knight: ['Ser Malbrand', 'Ser Osric il Vuoto', 'Dama Corvina', 'Ser Valgrim', 'Il Cavaliere Senza Volto'] };
  const ELITE_T = { wolf: 'Lupo Alfa', soldier: 'Capobanda Goblin', knight: 'Cavaliere Rinnegato' };
  const CLIENTS = [['Mercante Ottavio', 'pip'], ['Pellegrina Selva', 'orsola'], ['Studioso Amedeo', 'isadora'], ['Bardo Fennick', 'pip'], ['Messaggera Aurelia Bianchi', 'lucetta'], ['Speziale Corrado', 'gildo']];
  const DESTS = [{ n: 'Valdoria', x: 60, z: 250, r: 16 }, { n: 'il Borgo delle Lucciole', x: -335, z: 150, r: 14 }, { n: 'l\'Avamposto Cremisi', x: 505, z: 50, r: 14 }, { n: 'il Villaggio Goblin', x: -40, z: 90, r: 14 }];
  const GATES = [{ x: 132, z: 470 }, { x: 0, z: 603 }, { x: -132, z: 470 }, { x: 0, z: 338 }];
  const RMULT = [1, 1.6, 2.5, 4, 6, 9, 13], GPB = [12, 16, 22, 30, 40, 55, 75];
  function genContract(rank, seed) {
    const rnd = hrand(seed * 7919 + rank * 131), pick = (a) => a[Math.floor(rnd() * a.length)];
    const pois = POI.filter((p) => (rank < 2 ? Math.hypot(p.x, p.z - 250) < 380 : true));
    const kinds = ['sub', 'sub', 'hunt', 'col', 'herb', 'esc', 'exp', 'rift'];
    if (towerAvail()) kinds.push('dun', 'dun');
    const kind = pick(kinds);
    const typ = rank < 2 ? pick(['wolf', 'soldier']) : rank < 4 ? pick(['wolf', 'soldier', 'knight', 'knight']) : pick(['knight', 'knight', 'wolf', 'soldier']);
    const poi = pick(pois), reg = API.regionAt(poi.x, poi.z), rn = API.REGIONS[reg].name;
    let k = 1, o = { id: 'c' + seed, kind: 'guild', contract: kind, crank: rank, giver: 'elina', turnIn: 'elina', lvl: 1 + rank * 5, stages: [] };
    const n = (base) => Math.round(base * (1 + rank * 0.35));
    if (kind === 'sub') {
      const N = typ === 'knight' ? Math.min(8, 2 + rank) : n(5);
      o.title = 'Sottomissione: ' + TN(typ); o.desc = `La Gilda paga per sfoltire le creature che minacciano le ${rn}. Sconfiggi ${N} × ${TN(typ)} nella regione.`;
      o.stages.push({ text: o.title, objs: [K(typ, N, { reg, hint: { x: poi.x, z: poi.z }, label: `Sconfiggi ${TN(typ)} (${rn})` })] }); k = 1;
    } else if (kind === 'hunt') {
      const nm = pick(ELITE[typ]) + ', ' + ELITE_T[typ];
      o.title = 'Caccia: ' + nm.split(',')[0]; o.desc = `Taglia emessa dalla Gilda. ${nm} è stato avvistato presso ${poi.n} (${rn}). Abbattilo.`;
      o.stages.push({ text: o.title, objs: [HU(typ, 1, { x: poi.x, z: poi.z }, { name: nm, hp: 2.5 + rank * 0.9, sc: 1.35 + rank * 0.06, glow: pick(['#ff7a3a', '#b04dff', '#9fd8ff', '#ff3a5a']), dmg: 1.2 + rank * 0.12, runes: 4 + rank }, { label: 'Abbatti ' + nm.split(',')[0], minions: { e: typ === 'knight' ? 'soldier' : typ, n: Math.min(5, 1 + rank) } })] }); k = 1.3;
    } else if (kind === 'col') {
      const N = n(4), it = DROPS[typ];
      o.title = 'Raccolta: ' + it; o.desc = `Un alchimista della capitale paga bene per ${N} × ${it}. Si ottengono da ${TN(typ)}.`;
      o.stages.push({ text: o.title, objs: [{ t: 'drop', e: typ, item: it, n: N, ch: 0.55, label: `Raccogli ${it}`, hint: { x: poi.x, z: poi.z } }] }); k = 1.1;
    } else if (kind === 'herb') {
      const [it, col] = HERBS[reg], N = n(5);
      o.title = 'Raccolta: ' + it; o.desc = `L\'Accademia richiede ${N} × ${it}, che cresce presso ${poi.n} (${rn}).`;
      o.stages.push({ text: o.title, objs: [{ t: 'gather', item: it, n: N, at: { x: poi.x, z: poi.z }, r: 22, color: col, label: `Raccogli ${it} (${poi.n})` }] }); k = 0.9;
    } else if (kind === 'esc') {
      const [cname, look] = pick(CLIENTS), dst = pick(DESTS), gate = GATES.reduce((a, g) => (Math.hypot(g.x - dst.x, g.z - dst.z) < Math.hypot(a.x - dst.x, a.z - dst.z) ? g : a), GATES[0]);
      o.title = 'Scorta: ' + cname; o.desc = `${cname} deve raggiungere ${dst.n}. Proteggilo dagli agguati lungo la strada.`;
      o.stages.push({ text: o.title, objs: [{ t: 'escort', who: 'client', look, name: cname, from: { x: gate.x, z: gate.z }, to: { x: dst.x, z: dst.z }, r: dst.r, amb: typ, ambN: typ === 'knight' ? 2 + (rank > 3 ? 1 : 0) : 3 + Math.min(3, rank), label: `Scorta ${cname} fino a ${dst.n}` }] }); k = 1.25;
    } else if (kind === 'exp') {
      const p2 = pick(pois.filter((p) => p !== poi));
      o.title = 'Esplorazione: ' + poi.n; o.desc = `La Gilda ha bisogno di rilevamenti aggiornati: raggiungi ${poi.n} e ${p2.n}.`;
      o.stages.push({ text: o.title, objs: [R(poi.x, poi.z, 14, 'Raggiungi ' + poi.n), R(p2.x, p2.z, 14, 'Raggiungi ' + p2.n)] }); k = 0.9;
    } else if (kind === 'rift') {
      const pool = rank < 2 ? ['soldier', 'wolf'] : ['knight', 'soldier', 'wolf'], wave = [];
      for (let i = 0; i < 3 + Math.min(4, rank); i++) wave.push(pick(pool));
      o.title = 'Crepa: ' + poi.n; o.desc = `Una Crepa Dimensionale minore si è aperta presso ${poi.n}. Sconfiggi i guardiani e sigillala.`;
      o.stages.push({ text: o.title, objs: [{ t: 'rift', x: poi.x + 8, z: poi.z + 8, wave, label: 'Sigilla la Crepa presso ' + poi.n }] }); k = 1.35;
    } else {
      const F = 2 + rank * 3 + Math.floor(rnd() * 3);
      o.title = 'Dungeon: Piano ' + F; o.desc = `La Gilda mappa la Torre dei Mille Piani. Raggiungi il piano ${F} e torna a fare rapporto.`;
      o.stages.push({ text: o.title, objs: [{ t: 'floor', n: F, label: `Raggiungi il piano ${F} della Torre` }] }); k = 1.4;
    }
    const m = RMULT[rank] * k;
    o.rew = { xp: Math.round(150 * m / 10) * 10, gold: Math.round(120 * m / 10) * 10, gp: Math.round(GPB[rank] * k), rep: { gilda: 2 + rank }, loot: rnd() < 0.35 + rank * 0.1 ? 1 : 0, ilvl: 4 + rank * 7, boost: rank >= 4 ? 1 : 0 };
    o.done = [pick(['Incarico completato! Ecco la ricompensa e i Punti Gilda. Ottimo lavoro!', 'Perfetto, registro subito il completamento. La tua Tessera ringrazia!', 'Un altro incarico portato a termine! Continua così e salirai di rango in un lampo.'])];
    return o;
  }
  function makeUrgent(o) {
    if (!o || o.urgent) return;
    o.urgent = true; o.title = '★ ' + o.title;
    o.desc = 'URGENTE — ' + o.desc + ' La Gilda raddoppia la paga per chi agisce subito.';
    const r = o.rew; r.xp = Math.round(r.xp * 1.8); r.gold = Math.round(r.gold * 2); r.gp = Math.round(r.gp * 1.5); r.loot = (r.loot || 0) + 1; r.boost = (r.boost || 0) + 1;
  }
  function refreshOffers(force) {
    const G = QS.guild;
    if (!force && G.offers.length >= 5 && Date.now() - (G.t || 0) < 15 * 60 * 1000) return;
    G.offers = [];
    for (let i = 0; i < 5; i++) {
      const r = clamp(G.rank + (i === 4 ? 1 : i === 3 ? -1 : 0), 0, 6);
      G.offers.push(genContract(r, G.seed++));
    }
    if (Math.random() < 0.45) makeUrgent(G.offers[(Math.random() * 3) | 0]);
    G.t = Date.now(); save();
  }

  /* ============================================================ TYPES: final boss + fallen hero */
  function recolor(m, map, eye) {
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.isMeshBasicMaterial) { o.material.color.copy(hdr(eye, 4)); return; }
      const hex = '#' + o.material.color.getHexString();
      for (const [from, to] of map) if (hex === from) { o.material.color.set(to[0]); if (to[1] != null) o.material.metalness = to[1]; if (to[2]) o.material.emissive = new T.Color(to[2]); }
    });
  }
  function hexOf(c) { return '#' + new T.Color(c).getHexString(); }
  API.TYPES.demon_lord = {
    name: 'Nyxareth, Signore dei Demoni', boss: true, hp: 9000, r: 2.2, speed: 4.2, aggro: 50, runes: 20000, poise: 650,
    build: () => {
      const m = API.humanoid('knight', 3.6);
      recolor(m, [[hexOf('#2a2d36'), ['#120a18', 0.6]], [hexOf('#4a1c26'), ['#3a0f4a', 0, '#1a0526']], [hexOf('#4d5361'), ['#1d1424', 0.9]], [hexOf('#c9ced8'), ['#2a0838', 0.9, '#5a10a0']], [hexOf('#c9a24a'), ['#a020ff', 0.9, '#4a0080']]], '#d24dff');
      const glow = new T.MeshBasicMaterial({ color: hdr('#c04dff', 3.2), toneMapped: false });
      const hornM = API.std('#1a1020', 0.35, 0.6);
      for (const sx of [-1, 1]) { API.mesh(m.head, API.coneG(0.07, 0.6, 6), hornM, sx * 0.22, 0.42, -0.02, -0.4, 0, -sx * 0.7); API.mesh(m.head, API.coneG(0.04, 0.3, 5), glow, sx * 0.36, 0.62, -0.12, -0.9, 0, -sx * 1.0); }
      const halo = API.mesh(m.g, new T.TorusGeometry(0.42, 0.025, 6, 32), glow, 0, 2.62, -0.25); halo.rotation.x = 0.25;
      const wingGeo = new T.ConeGeometry(0.5, 2.4, 4); wingGeo.translate(0, 1.2, 0);
      const wm = API.std('#1d0a26', 0.6, 0.3, { side: T.DoubleSide, emissive: new T.Color('#2a0640') });
      m.wings = [];
      for (const sx of [-1, 1]) { const w = API.pivot(m.g, sx * 0.3, 2.0, -0.3); const wmesh = API.mesh(w, wingGeo, wm, 0, 0, 0, 0, 0, 0, 0.5, 1, 0.12); wmesh.rotation.z = -sx * 1.0; m.wings.push(w); }
      m.halo = halo;
      return m;
    },
    attacks: [
      { name: 'slam', range: 6.5, windup: 0.95, active: 0.2, recover: 0.8, dmg: 190, reach: 6.5, arc: 1.3, wave: 12 },
      { name: 'sweep', range: 7, windup: 0.6, active: 0.3, recover: 0.5, dmg: 150, reach: 7.5, arc: 2.9 },
      { name: 'leap', range: 20, minRange: 8, windup: 0.7, active: 0.25, recover: 0.9, dmg: 200, reach: 5.5, arc: TAU, lunge: 26, wave: 14 },
      { name: 'combo', range: 6, windup: 0.45, active: 0.2, recover: 0.35, dmg: 110, reach: 6.5, arc: 1.4, combo: 3 },
      { name: 'daggers', range: 26, windup: 0.6, active: 0.1, recover: 0.5, dmg: 80, phase2: true, daggers: 9 },
      { name: 'storm', range: 40, windup: 1.0, active: 0.1, recover: 0.9, dmg: 110, phase2: true, bolts: 9 },
    ],
    update(e, dt) {
      const m = e.model;
      if (m.halo) m.halo.rotation.z += dt * 1.5;
      if (m.wings) { const f = Math.sin(e.t * 2.2) * 0.25; m.wings[0].rotation.y = 0.4 + f; m.wings[1].rotation.y = -0.4 - f; }
      if (e.dead || !e.engaged) return false;
      if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
        e.phase = 2; API.bigMsg('IL VUOTO SI APRE', 'death', 2.5); sfx('bossRoar'); API.setShake(0.8);
        API.shockwave(e.x, e.z, 18, 90, '#c04dff'); API.lightPillar(e.x, e.z, '#b04dff', 2);
        for (let i = 0; i < 2; i++) { const a = rand(0, TAU); const k = API.spawn('knight', e.x + Math.cos(a) * 9, e.z + Math.sin(a) * 9, { qtag: 'dlm' }); k.engaged = true; }
        oracle('《Nyxareth ha evocato i suoi Cavalieri. Priorità: il Signore dei Demoni.》', true);
      }
      e.ecl = (e.ecl || 9) - dt;
      if (e.phase === 2 && e.ecl <= 0 && !e.atk) {
        e.ecl = 11; API.shockwave(e.x, e.z, 16, 130, '#b04dff'); API.emit(e.x, e.y + 4, e.z, 60, '#c04dff', { speed: 10, up: 4, life: 1.2 });
        API.flashLight.color.set('#b04dff'); API.flashLight.intensity = 60; API.flashLight.position.set(e.x, e.y + 5, e.z); sfx('explosion');
      }
      if (Math.random() < dt * 6) API.emit(e.x + rand(-1.5, 1.5), e.y + rand(1, 7), e.z + rand(-1.5, 1.5), 1, '#b04dff', { speed: 0.6, up: 1.5, grav: -0.5, life: 1.2, size: 0.8 });
      return false;
    },
  };
  API.TYPES.eroe_caduto = {
    name: 'Ren, l\'Eroe Corrotto', boss: true, hp: 3600, r: 1.0, speed: 5.2, aggro: 30, runes: 6000, poise: 260,
    build: () => {
      const m = API.humanoid('knight', 1.45);
      recolor(m, [[hexOf('#2a2d36'), ['#e8ecf4', 0.4]], [hexOf('#4a1c26'), ['#1a0f2a', 0]], [hexOf('#4d5361'), ['#cfd6e4', 0.9]], [hexOf('#c9ced8'), ['#1a0a22', 0.9, '#6a10a0']], [hexOf('#c9a24a'), ['#ffd36b', 0.9]]], '#ff2a4a');
      const glow = new T.MeshBasicMaterial({ color: hdr('#b04dff', 3), toneMapped: false });
      API.mesh(m.weapon, API.BOX, glow, 0, -0.95, 0, 0, 0, 0, 0.12, 1.75, 0.05);
      return m;
    },
    attacks: [
      { range: 3.4, windup: 0.4, active: 0.18, recover: 0.35, dmg: 95, reach: 3.6, arc: 1.5, combo: 3 },
      { range: 12, minRange: 5, windup: 0.5, active: 0.25, recover: 0.6, dmg: 120, reach: 3.5, arc: 1.4, lunge: 24 },
      { range: 3.5, windup: 0.8, active: 0.2, recover: 0.7, dmg: 150, reach: 4, arc: TAU, wave: 8 },
      { range: 20, windup: 0.5, active: 0.1, recover: 0.5, dmg: 70, phase2: true, daggers: 6 },
    ],
    update(e, dt) {
      if (e.dead || !e.engaged) return false;
      if (e.phase === 1 && e.hp < e.maxHp * 0.5) { e.phase = 2; toast('Ren: «Taci! Io sono il protagonista!»'); sfx('bossRoar'); API.setShake(0.5); API.lightPillar(e.x, e.z, '#b04dff', 1.4); }
      if (Math.random() < dt * 5) API.emit(e.x + rand(-0.6, 0.6), e.y + rand(1, 3), e.z + rand(-0.6, 0.6), 1, '#b04dff', { speed: 0.5, up: 1.2, grav: -0.5, life: 1, size: 0.6 });
      return false;
    },
  };

  /* ============================================================ quest engine */
  const def = (id) => DEFS[id] || QS.cdefs[id] || null;
  const rec = (id) => QS.q[id];
  function towerAvail() { return !!(API.dungeon || API.plugins.some((p) => /dungeon|tower|torre/i.test(p.id || ''))); }
  function reqOk(d) {
    if (d.req && !d.req.every((r) => QS.q[r] && QS.q[r].s === 'turned')) return false;
    if (d.exam != null) { const G = QS.guild; if (!G.reg || G.rank !== d.exam - 1 || G.pts < RANKS[d.exam].pts) return false; }
    return true;
  }
  function lockReason(d) {
    if (d.rankReq != null && QS.guild.rank < d.rankReq) return 'Richiede il Rango ' + RANKS[d.rankReq].l + ' nella Gilda degli Avventurieri';
    return '';
  }
  function available(id) { const d = def(id); return !!(d && !QS.q[id] && reqOk(d) && !lockReason(d)); }
  function stateOf(id) { const r = QS.q[id]; return r ? r.s : available(id) ? 'available' : 'locked'; }
  let dirty = true, trkDirty = true;
  const markDirty = () => { dirty = true; trkDirty = true; };
  function accept(id, quiet) {
    const d = def(id); if (!d || QS.q[id]) return false;
    QS.q[id] = { s: 'active', st: 0, p: [], t: Date.now() };
    if (d.start) try { d.start(); } catch (e) { console.error(e); }
    startStage(id, true);
    if (!QS.track.includes(id)) { if (d.kind === 'main') QS.track.unshift(id); else QS.track.push(id); }
    while (QS.track.length > 3) { const drop = QS.track.findIndex((t) => !def(t) || def(t).kind !== 'main'); QS.track.splice(drop >= 0 ? drop : QS.track.length - 1, 1); }
    emitEv('3d:quest', { id, state: 'active' });
    if (!quiet) {
      if (d.kind === 'main') chapterCard(d);
      else banner('NUOVA MISSIONE', d.title, null, 'new');
      sfx('skillGet');
    }
    markDirty(); save();
    return true;
  }
  function startStage(id, first) {
    const d = def(id), r = rec(id), stg = d.stages[r.st];
    r.p = stg.objs.map(() => 0); r.pk = stg.objs.map(() => []);
    if (stg.start) try { stg.start(); } catch (e) { console.error(e); }
    if (stg.oracle) setTimeout(() => oracle(stg.oracle, d.kind === 'main'), first ? 2600 : 900);
    if (!first) { toast('Nuovo obiettivo: ' + stg.text); sfx('ui'); }
    resetStageRuntime(id);
    markDirty();
    setTimeout(() => checkPassive(), 50);
  }
  function stageOf(id) { const d = def(id), r = rec(id); return d && r && r.s === 'active' ? d.stages[r.st] : null; }
  function objActive(id, i) { const stg = stageOf(id); if (!stg) return false; if (stg.seq) { for (let k = 0; k < i; k++) if (!(rec(id).p[k] >= (stg.objs[k].n || 1))) return false; } return true; }
  function progress(id, i, amt, quietToast) {
    const d = def(id), r = rec(id), stg = stageOf(id); if (!stg) return;
    const o = stg.objs[i], need = o.n || 1;
    if (r.p[i] >= need) return;
    r.p[i] = Math.min(need, r.p[i] + (amt || 1));
    const lbl = objLabel(o);
    if (!quietToast) {
      if (r.p[i] >= need) { toast('✔ ' + lbl); sfx('pickup'); }
      else { toast(`${lbl}  ${r.p[i]}/${need}`); sfx('ui', { vol: 0.6 }); }
    }
    flashTrack(id);
    if (stg.objs.every((oo, k) => r.p[k] >= (oo.n || 1))) {
      setTimeout(() => advance(id), 350);
    }
    trkDirty = true; dirty = true; save();
  }
  function advance(id) {
    const d = def(id), r = rec(id); if (!r || r.s !== 'active') return;
    const stg = d.stages[r.st];
    if (!stg.objs.every((oo, k) => r.p[k] >= (oo.n || 1))) return;
    cleanupStage(id);
    r.st++;
    if (r.st >= d.stages.length) complete(id);
    else startStage(id);
    save();
  }
  function complete(id) {
    const d = def(id), r = rec(id);
    if (d.turnIn) {
      r.s = 'done'; emitEv('3d:quest', { id, state: 'done' });
      const n = NPCS[d.turnIn];
      toast(`Missione pronta: torna da ${n ? n.name : '?'}`); sfx('skillGet');
      oracle(`《Obiettivi completati: «${d.title}». Ritorna da ${n ? n.name : 'chi ti ha affidato l\'incarico'}.》`);
      markDirty(); save();
    } else {
      r.s = 'done'; markDirty();
      if (d.done && d.done.length) {
        const sp = d.done.find((l) => typeof l === 'string' && /^@(\w+):/.test(l));
        const who = sp ? NPCS[/^@(\w+):/.exec(sp)[1]] : NPCS[d.giver];
        const showLines = () => { if (D.open) { setTimeout(showLines, 400); return; } D.start(who || NPCS.king, { cine: d.kind === 'main', narr: true }); D.say(d.done, () => { D.close(); turnIn(id); }); };
        setTimeout(showLines, 900);
      } else turnIn(id);
    }
  }
  function turnIn(id) {
    const d = def(id), r = rec(id); if (!r || r.s === 'turned') return;
    r.s = 'turned'; r.t2 = Date.now();
    const out = grant(d.rew || {}, d);
    QS.stats.done++;
    QS.track = QS.track.filter((t) => t !== id);
    emitEv('3d:quest', { id, state: 'turned' });
    if (d.kind === 'guild' && d.contract) { QS.stats.contracts++; delete QS.q[id]; delete QS.cdefs[id]; }
    banner(d.kind === 'main' && id === 'm9' ? 'LEGGENDA COMPIUTA' : 'MISSIONE COMPLETATA', d.title, out, d.kind === 'main' ? 'main' : 'done');
    sfx('victory'); sfx('levelup');
    celebrate('#ffd36b');
    if (d.after) try { d.after(); } catch (e) { console.error(e); }
    markDirty(); save();
    setTimeout(autoMain, 4500);
  }
  // celebratory burst around the player (rings + rising sparks; no full-screen pillar at the camera)
  function celebrate(col) {
    const y = API.heightAt(P.x, P.z);
    API.shockwave(P.x, P.z, 7, 0, col);
    setTimeout(() => API.shockwave(P.x, P.z, 4, 0, '#fff3c8'), 220);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; API.emit(P.x + Math.cos(a) * 1.6, y + 0.3, P.z + Math.sin(a) * 1.6, 4, col, { speed: 1.2, up: 7, grav: -2.5, life: 1.6, size: 0.9, bright: 2.4 }); }
    API.emit(P.x, y + 1.6, P.z, 40, '#fff3c8', { speed: 6, up: 3, life: 1.1, bright: 2.6 });
    try { API.flashLight.color.set(col); API.flashLight.intensity = 40; API.flashLight.position.set(P.x, y + 3, P.z); } catch (e) { /* ignore */ }
  }
  function abandon(id) {
    const d = def(id); if (!d || d.kind === 'main') return;
    cleanupStage(id);
    delete QS.q[id]; QS.track = QS.track.filter((t) => t !== id);
    if (d.contract) { delete QS.cdefs[id]; QS.guild.pts = Math.max(0, QS.guild.pts - 5); }
    emitEv('3d:quest', { id, state: 'abandoned' });
    toast('Missione abbandonata: ' + d.title); sfx('uiBack'); markDirty(); save();
  }
  function grant(rew, d) {
    const out = [], rpg = API.rpg;
    if (rew.xp) { try { if (rpg && rpg.giveXP) rpg.giveXP(rew.xp, P.x, P.z); else S.runes += Math.round(rew.xp * 0.5); } catch (e) { console.error(e); } out.push(['✦', fmt(rew.xp) + ' XP', '#9fe8ff']); }
    if (rew.gold) { try { if (rpg && rpg.giveGold) rpg.giveGold(rew.gold); else S.runes += rew.gold; } catch (e) { S.runes += rew.gold; } out.push(['◈', fmt(rew.gold) + ' anime', '#ffd36b']); }
    const gp = rew.gp || (d && d.kind === 'side' ? 8 + (d.lvl | 0) : d && GP_MAIN[d.id] || 0);
    if (gp && QS.guild.reg) { QS.guild.pts += gp; out.push(['⚜', '+' + gp + ' Punti Gilda', '#9cff9a']); }
    if (rew.rank != null) { QS.guild.rank = Math.max(QS.guild.rank, rew.rank); out.push(['♜', 'Rango ' + RANKS[rew.rank].l, RANKS[rew.rank].c]); setTimeout(() => rankUpFx(rew.rank), 2600); }
    if (rew.rep) for (const k in rew.rep) { QS.rep[k] = (QS.rep[k] || 0) + rew.rep[k]; out.push(['♛', FACTIONS[k] + ' +' + rew.rep[k], '#e8c8ff']); }
    const nl = rew.loot || 0;
    for (let i = 0; i < nl; i++) {
      let name = null;
      try {
        if (rpg && rpg.rollLoot && rpg.giveItem) { const it = rpg.rollLoot(Math.max(rew.ilvl || 1, plLevel()), rew.boost || 0); if (it) { const got = rpg.giveItem(it) || it; name = rpg.itemName ? rpg.itemName(got) : got.name; } }
      } catch (e) { console.error(e); }
      if (name) out.push(['⚔', name, '#ffb36b']);
      else { const g = 200 * (1 + (rew.ilvl || 1) / 5); S.runes += Math.round(g); out.push(['◈', '+' + fmt(g) + ' anime (bottino)', '#ffd36b']); }
    }
    if (rew.title && !QS.titles.includes(rew.title)) { QS.titles.push(rew.title); out.push(['❖', 'Titolo: ' + rew.title, '#ffe7a8']); }
    if (d && d.kind === 'guild' && QS.guild.reg && !rew.gp && rew.rank == null) { /* exams give no PG */ }
    save();
    return out;
  }
  const GP_MAIN = { m2: 25, m3: 40, m4: 60, m5: 60, m6: 90, m7: 90, m8: 200, m9: 100 };
  function autoMain() {
    for (const id of ORDER) {
      const d = DEFS[id];
      if (d.kind !== 'main' || !d.auto || QS.q[id]) continue;
      if (!reqOk(d)) continue;
      if (lockReason(d)) { if (!QS.flags['lockMsg_' + id]) { QS.flags['lockMsg_' + id] = 1; oracle('《Il prossimo capitolo richiede: ' + lockReason(d) + '.》'); } continue; }
      if (D.open || API.state !== 'play' || anyPanel()) { setTimeout(autoMain, 1500); return; }
      accept(id);
      return;
    }
  }

  /* ---------------- objective labels & world positions ---------------- */
  function objLabel(o) {
    if (o.label) return o.label;
    switch (o.t) {
      case 'kill': return 'Sconfiggi ' + (o.e === 'any' ? 'nemici' : TN(o.e)) + (o.reg ? ' (' + API.REGIONS[o.reg].name + ')' : '');
      case 'talk': return 'Parla con ' + (NPCS[o.npc] ? NPCS[o.npc].name : o.npc);
      case 'reach': return 'Raggiungi la destinazione';
      case 'hunt': return 'Elimina ' + ((o.el && o.el.name) || TN(o.e));
      case 'drop': case 'gather': return 'Raccogli ' + o.item;
      case 'floor': return 'Raggiungi il piano ' + o.n + ' della Torre';
      case 'boss': return 'Sconfiggi ' + TN(o.b);
      case 'escort': return 'Scorta ' + (o.name || 'il viaggiatore');
      case 'rift': return 'Sigilla la Crepa';
      default: return 'Obiettivo';
    }
  }
  function npcPos(id) { const n = NPCS[id]; if (!n) return null; return n.cur || n; }
  function objPos(id, o, i) {
    switch (o.t) {
      case 'reach': return o;
      case 'talk': return npcPos(o.npc);
      case 'hunt': {
        const tag = id + '#' + i; let best = null, bd = 1e9;
        for (const e of API.enemies) if (e.qtag === tag && !e.dead) { const dd = dist(e.x, e.z); if (dd < bd) { bd = dd; best = e; } }
        return best || o.at;
      }
      case 'gather': { const r = rec(id); const nodes = gatherNodes(id, o, i); let best = null, bd = 1e9; for (let k = 0; k < nodes.length; k++) { if (r.pk[i] && r.pk[i].includes(k)) continue; const dd = dist(nodes[k].x, nodes[k].z); if (dd < bd) { bd = dd; best = nodes[k]; } } return best || o.at; }
      case 'rift': return o;
      case 'escort': return ESC && ESC.tag === id + '#' + i ? (ESC.started ? o.to : ESC) : o.from;
      case 'boss': return o.at || null;
      case 'floor': return TOWER;
      case 'kill': return o.near || o.hint || null;
      case 'drop': return o.hint || null;
      default: return null;
    }
  }

  /* ---------------- event inputs ---------------- */
  function onKillQ(e, absorbed) {
    for (const id in QS.q) {
      const r = QS.q[id]; if (r.s !== 'active') continue;
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => {
        if (r.p[i] >= (o.n || 1) || !objActive(id, i)) return;
        if (o.t === 'kill') {
          if (o.e !== 'any' && o.e !== e.type && !(Array.isArray(o.e) && o.e.includes(e.type))) return;
          if (o.abs && !absorbed) return;
          if (o.reg && API.regionAt(e.x, e.z) !== o.reg) return;
          if (o.near && Math.hypot(e.x - o.near.x, e.z - o.near.z) > o.near.r) return;
          progress(id, i, 1);
        } else if (o.t === 'hunt') {
          if (e.qtag === id + '#' + i) progress(id, i, 1);
        } else if (o.t === 'drop') {
          if (o.e !== e.type) return;
          if (Math.random() < (o.ch || 0.5)) {
            progress(id, i, 1, true);
            const rr = rec(id);
            toast(`Ottenuto: ${o.item}  (${Math.min(rr.p[i], o.n)}/${o.n})`); sfx('pickup');
            API.emit(e.x, e.y + 1.2, e.z, 16, '#ffd36b', { speed: 3, up: 4, life: 1 });
          }
        }
      });
    }
  }
  function checkPassive() {
    const lv = plLevel();
    for (const id in QS.q) {
      const r = QS.q[id]; if (r.s !== 'active') continue;
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => {
        if (r.p[i] >= (o.n || 1) || !objActive(id, i)) return;
        if (o.t === 'reach' && dist(o.x, o.z) < (o.r || 10)) progress(id, i, 1);
        else if (o.t === 'boss' && S.bosses[o.b]) progress(id, i, 1);
        else if (o.t === 'floor' && (floorReached() >= o.n || (!towerAvail() && dist(TOWER.x, TOWER.z) < 18))) progress(id, i, o.n);
        else if (o.t === 'level' && lv >= o.n) progress(id, i, o.n);
      });
    }
  }
  function floorReached() {
    let f = QS.maxFloor || 0;
    try { const dg = API.dungeon; if (dg) f = Math.max(f, dg.maxFloor || 0, dg.best || 0, (S.dungeon && (S.dungeon.maxFloor || S.dungeon.best)) || 0); } catch (e) { /* ignore */ }
    return f;
  }
  EV.on('3d:floor', (d) => { const f = d && (d.floor | 0); if (f > (QS.maxFloor || 0)) { QS.maxFloor = f; save(); } checkPassive(); });
  EV.on('3d:levelup', () => checkPassive());
  EV.on('3d:item', (d) => {
    const it = d && d.item; if (!it) return;
    let nm = it.name || it.id || '';
    try { if (API.rpg && API.rpg.itemName) nm = API.rpg.itemName(it) || nm; } catch (e) { /* ignore */ }
    for (const id in QS.q) {
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => { if ((o.t === 'drop' || o.t === 'collect') && (o.itemId === it.id || (o.item && String(nm).indexOf(o.item) >= 0))) progress(id, i, 1); });
    }
  });
  EV.on('3d:enterCity', () => checkPassive());

  /* ---------------- runtime: hunts, rifts, gather nodes, escort ---------------- */
  const RT = { hunts: {}, rifts: {}, gathers: {}, minions: {} };
  let ESC = null;
  function resetStageRuntime(id) { /* lazily created in tick */ }
  function cleanupStage(id) {
    for (const k of Object.keys(RT.rifts)) if (k.startsWith(id + '#')) { const rf = RT.rifts[k]; if (rf.mesh) API.scene.remove(rf.mesh); delete RT.rifts[k]; }
    for (const k of Object.keys(RT.gathers)) if (k.startsWith(id + '#')) { for (const n of RT.gathers[k].nodes) if (n.mesh) API.scene.remove(n.mesh); delete RT.gathers[k]; }
    if (ESC && ESC.tag.startsWith(id + '#')) removeEscort();
    for (const e of API.enemies) if (e.qtag && e.qtag.startsWith(id + '#') && !e.dead && e.qtag.endsWith('m')) { /* leave minions in world */ }
  }
  function eliteize(e, el) {
    if (!el) return;
    const base = e.d;
    e.d = Object.assign({}, base, { name: el.name || base.name, runes: Math.round(base.runes * (el.runes || 2)), poise: (base.poise || 20) * (el.hp || 1),
      attacks: base.attacks.map((a) => Object.assign({}, a, { dmg: Math.round(a.dmg * (el.dmg || 1)) })) });
    e.maxHp = Math.round(e.maxHp * (el.hp || 1)); e.hp = e.maxHp; e.poise = e.d.poise;
    if (el.sc) { e.model.root.scale.setScalar(el.sc); e.scale0 = el.sc; }
    if (el.glow) {
      e.glow = el.glow; const gc = new T.Color(el.glow);
      e.model.root.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { m.material.emissive.copy(gc).multiplyScalar(0.18); } });
    }
    e.elite = true;
  }
  function spawnHunt(id, i, o, count) {
    for (let k = 0; k < count; k++) {
      const a = rand(0, TAU), rr = count > 1 ? rand(2, 7) : rand(0, 2);
      const x = o.at.x + Math.cos(a) * rr, z = o.at.z + Math.sin(a) * rr;
      const e = API.spawn(o.e, x, z, { qtag: id + '#' + i });
      eliteize(e, o.el);
    }
  }
  function tickHunts() {
    for (const id in QS.q) {
      const r = QS.q[id]; if (r.s !== 'active') continue;
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => {
        if (o.t !== 'hunt' || !objActive(id, i)) return;
        const need = (o.n || 1) - r.p[i]; if (need <= 0) return;
        if (dist(o.at.x, o.at.z) > 150) return;
        const tag = id + '#' + i; let alive = 0;
        for (const e of API.enemies) if (e.qtag === tag && !e.dead) alive++;
        if (alive < need) { spawnHunt(id, i, o, need - alive); if (o.boss) { /* engine handles intro */ } }
        if (o.minions && !RT.minions[tag]) { RT.minions[tag] = true; for (let k = 0; k < o.minions.n; k++) { const a = rand(0, TAU); API.spawn(o.minions.e, o.at.x + Math.cos(a) * rand(4, 9), o.at.z + Math.sin(a) * rand(4, 9), { qtag: tag + 'm' }); } }
      });
    }
  }
  // ---- rifts
  const riftU = { time: { value: 0 } };
  const riftMat = new T.ShaderMaterial({ uniforms: riftU, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time; varying vec2 vUv;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float sw = sin(a * 5.0 + r * 9.0 - time * 3.0) * 0.5 + 0.5; float core = smoothstep(1.0, 0.0, r);
        vec3 c = mix(vec3(0.25, 0.02, 0.5), vec3(1.4, 0.4, 2.6), sw * core) + vec3(2.2, 1.6, 3.0) * pow(core, 6.0);
        float edge = smoothstep(1.0, 0.86, r); gl_FragColor = vec4(c * edge * (0.55 + core), edge * (0.4 + 0.6 * core)); }` });
  const riftRingMat = addMat('#c04dff', 3, 0.9), riftCrys = std('#2a1038', 0.25, 0.6, { emissive: new T.Color('#3a0a5a') });
  const riftDisc = new T.CircleGeometry(2.6, 40), riftRing = new T.TorusGeometry(2.7, 0.12, 8, 48);
  function makeRift(x, z) {
    const g = new T.Group(), y = API.heightAt(x, z);
    g.position.set(x, y, z);
    const disc = new T.Mesh(riftDisc, riftMat); disc.position.y = 3.4; g.add(disc);
    const ring = new T.Mesh(riftRing, riftRingMat); ring.position.y = 3.4; g.add(ring);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const c = new T.Mesh(GEO.oct, riftCrys); c.position.set(Math.cos(a) * 3.4, 0.6, Math.sin(a) * 3.4); c.scale.set(0.45, 1.4 + (i % 3) * 0.5, 0.45); c.rotation.set(rand(-0.3, 0.3), a, rand(-0.3, 0.3)); g.add(c); }
    g.userData = { disc, ring };
    API.scene.add(g);
    return g;
  }
  function tickRifts(dt) {
    riftU.time.value += dt;
    for (const id in QS.q) {
      const r = QS.q[id]; if (r.s !== 'active') continue;
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => {
        if (o.t !== 'rift' || !objActive(id, i)) return;
        const tag = id + '#' + i;
        let rf = RT.rifts[tag];
        if (r.p[i] >= 1) return;
        if (!rf) rf = RT.rifts[tag] = { st: 'idle', mesh: null, t: 0 };
        const d0 = dist(o.x, o.z);
        if (!rf.mesh && d0 < 320) rf.mesh = makeRift(o.x, o.z);
        if (rf.mesh) {
          rf.mesh.visible = d0 < 320;
          const ud = rf.mesh.userData; ud.disc.lookAt(API.camera.position.x, ud.disc.getWorldPosition(_v).y, API.camera.position.z);
          ud.ring.quaternion.copy(ud.disc.quaternion); ud.ring.rotateZ(riftU.time.value * 0.8);
          const s = rf.st === 'sealing' ? Math.max(0.01, 1 - rf.t) : 1 + Math.sin(riftU.time.value * 3) * 0.04; ud.disc.scale.setScalar(s); ud.ring.scale.setScalar(s);
          if (d0 < 90 && Math.random() < dt * 8) API.emit(o.x + rand(-2.5, 2.5), API.heightAt(o.x, o.z) + rand(1, 6), o.z + rand(-2.5, 2.5), 1, '#c04dff', { speed: 1, up: 2, grav: -1, life: 1.2, size: 0.8 });
        }
        if (rf.st === 'idle' && d0 < 30) {
          rf.st = 'wave'; sfx('portal'); API.setShake(0.4); toast('La Crepa si spalanca! Sconfiggi i guardiani!');
          API.lightPillar(o.x, o.z, '#b04dff', 1.2);
          (o.wave || ['soldier', 'soldier']).forEach((t, k) => {
            const a = (k / o.wave.length) * TAU + rand(-0.3, 0.3);
            const e = API.spawn(t, o.x + Math.cos(a) * 5, o.z + Math.sin(a) * 5, { qtag: tag }); e.engaged = true;
            eliteize(e, { glow: '#b04dff', hp: 1.2 });
            API.emit(e.x, API.heightAt(e.x, e.z) + 1, e.z, 20, '#c04dff', { speed: 5, up: 3 });
          });
        } else if (rf.st === 'wave') {
          let alive = 0; for (const e of API.enemies) if (e.qtag === tag && !e.dead) alive++;
          if (!alive) { rf.st = 'sealing'; rf.t = 0; sfx('absorb'); oracle('《Crepa destabilizzata. Sigillo in corso…》'); }
        } else if (rf.st === 'sealing') {
          rf.t += dt * 0.7;
          if (rf.t >= 1) {
            rf.st = 'sealed'; API.shockwave(o.x, o.z, 10, 0, '#e0b0ff'); API.lightPillar(o.x, o.z, '#ffd36b', 1.6); sfx('victory');
            API.emit(o.x, API.heightAt(o.x, o.z) + 3, o.z, 80, '#e0b0ff', { speed: 9, up: 4, life: 1.4 });
            if (rf.mesh) { API.scene.remove(rf.mesh); rf.mesh = null; }
            progress(id, i, 1);
          }
        }
      });
    }
  }
  // ---- gather nodes
  const nodeMats = {};
  const nodeMat = (c) => nodeMats[c] || (nodeMats[c] = new T.MeshBasicMaterial({ color: hdr(c, 2.6), toneMapped: false }));
  const leafMat = std('#3f6b3a', 0.8);
  function gatherNodes(id, o, i) {
    const tag = id + '#' + i; let G = RT.gathers[tag];
    if (!G) {
      const rnd = hrand(hstr(tag)), nodes = [];
      for (let k = 0; k < o.n; k++) {
        let x = 0, z = 0;
        for (let tries = 0; tries < 12; tries++) { const a = rnd() * TAU, rr = (0.25 + rnd() * 0.75) * (o.r || 20); x = o.at.x + Math.cos(a) * rr; z = o.at.z + Math.sin(a) * rr; if (!TOWNS.some((t) => t.r > 30 && Math.hypot(x - t.x, z - t.z) < t.r - 10)) break; }
        nodes.push({ x, z, mesh: null, k });
      }
      G = RT.gathers[tag] = { nodes };
    }
    return G.nodes;
  }
  function makeNode(x, z, col) {
    const g = new T.Group(), y = API.heightAt(x, z); g.position.set(x, y, z);
    for (let k = 0; k < 4; k++) { const l = new T.Mesh(GEO.cone4, leafMat); const a = k * PI / 2 + 0.3; l.position.set(Math.cos(a) * 0.18, 0.18, Math.sin(a) * 0.18); l.scale.set(0.12, 0.42, 0.05); l.rotation.set(Math.sin(a) * 0.6, a, -Math.cos(a) * 0.6); g.add(l); }
    const c = new T.Mesh(GEO.oct, nodeMat(col)); c.position.y = 0.55; c.scale.set(0.16, 0.26, 0.16); g.add(c);
    const h = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr(col, 1.4), transparent: true, blending: T.AdditiveBlending, depthWrite: false })); h.scale.set(1.6, 1.6, 1); h.position.y = 0.6; g.add(h);
    g.userData.c = c;
    API.scene.add(g); return g;
  }
  function tickGather(dt, now) {
    for (const id in QS.q) {
      const r = QS.q[id]; if (r.s !== 'active') continue;
      const stg = stageOf(id); if (!stg) continue;
      stg.objs.forEach((o, i) => {
        if (o.t !== 'gather' || !objActive(id, i)) return;
        const nodes = gatherNodes(id, o, i), near = dist(o.at.x, o.at.z) < 200;
        for (const n of nodes) {
          const picked = r.pk[i] && r.pk[i].includes(n.k);
          if (picked || !near) { if (n.mesh) { API.scene.remove(n.mesh); n.mesh = null; } continue; }
          if (!n.mesh) n.mesh = makeNode(n.x, n.z, o.color || '#9fffd0');
          const c = n.mesh.userData.c; c.rotation.y = now * 0.002 + n.k; c.position.y = 0.55 + Math.sin(now * 0.003 + n.k) * 0.08;
          if (Math.random() < dt * 1.5) API.emit(n.x, n.mesh.position.y + 0.6, n.z, 1, o.color || '#9fffd0', { speed: 0.3, up: 1.2, grav: -0.3, life: 1.4, size: 0.5 });
        }
      });
    }
  }
  function pickNode(id, i, o, n) {
    const r = rec(id); if (!r || !r.pk[i] || r.pk[i].includes(n.k)) return;
    r.pk[i].push(n.k);
    if (n.mesh) { API.scene.remove(n.mesh); n.mesh = null; }
    API.emit(n.x, API.heightAt(n.x, n.z) + 0.6, n.z, 26, o.color || '#9fffd0', { speed: 3, up: 4, life: 1 });
    sfx('pickup');
    progress(id, i, 1);
  }
  // ---- escort
  function escortLook(o) { if (o.who === 'biscotto') return null; if (o.who === 'pip') return ST.pip; return ST[o.look] || ST.pip; }
  function makeEscort(id, i, o) {
    const tag = id + '#' + i;
    const model = o.who === 'biscotto' ? catModel('#e08a3a') : npcModel(Object.assign({}, escortLook(o), { scale: (escortLook(o).scale || 1) }));
    API.scene.add(model.root);
    ESC = { tag, id, i, o, model, x: o.from.x, z: o.from.z, rot: 0, hp: 100, maxHp: 100, started: false, amb: false, t: 0, npc: o.who === 'pip' ? 'pip' : null,
      name: o.who === 'biscotto' ? 'Biscotto' : o.who === 'pip' ? 'Pip' : (o.name || 'Cliente'), wait: 0 };
    ESC.d0 = Math.hypot(o.to.x - o.from.x, o.to.z - o.from.z);
    markDirty();
  }
  function removeEscort() { if (!ESC) return; API.scene.remove(ESC.model.root); ESC = null; markDirty(); }
  function tickEscort(dt) {
    // create escort for active escort objective
    if (!ESC) {
      for (const id in QS.q) {
        const r = QS.q[id]; if (r.s !== 'active') continue;
        const stg = stageOf(id); if (!stg) continue;
        stg.objs.forEach((o, i) => { if (!ESC && o.t === 'escort' && objActive(id, i) && r.p[i] < 1) makeEscort(id, i, o); });
      }
      if (!ESC) return;
    }
    const E = ESC, o = E.o, m = E.model, r = rec(E.id);
    if (!r || r.s !== 'active' || !stageOf(E.id) || r.p[E.i] >= 1) { removeEscort(); return; }
    E.t += dt;
    const dP = dist(E.x, E.z);
    if (!E.started && dP < 6) { E.started = true; toast(`${E.name} ti segue. Portalo a destinazione!`); sfx('select'); markDirty(); }
    let moving = false;
    if (E.started) {
      const tx = P.x, tz = P.z, dd = Math.hypot(tx - E.x, tz - E.z);
      if (dd > 3.2 && dd < 60) {
        const sp = (dd > 12 ? 7.5 : 5) * (o.who === 'biscotto' ? 1.15 : 1), a = Math.atan2(tx - E.x, tz - E.z);
        E.x += Math.sin(a) * sp * dt; E.z += Math.cos(a) * sp * dt; E.rot = a; moving = true;
      }
      if (dd >= 60) { E.wait += dt; if (E.wait > 6) { E.wait = 0; toast(`${E.name}: «Aspettami!»`); } }
      const prog = 1 - Math.hypot(o.to.x - E.x, o.to.z - E.z) / Math.max(1, E.d0);
      if (!E.amb && prog > 0.42) {
        E.amb = true; sfx('warning'); toast('Agguato!'); API.setShake(0.3);
        const ang = Math.atan2(o.to.x - E.x, o.to.z - E.z);
        for (let k = 0; k < (o.ambN || 3); k++) {
          const a = ang + rand(-0.9, 0.9), rr = rand(9, 15);
          const e = API.spawn(o.amb || 'soldier', E.x + Math.sin(a) * rr, E.z + Math.cos(a) * rr, { qtag: E.tag + 'a' }); e.engaged = true;
        }
      }
      // ambushers hurt the escortee
      E.hurtT = (E.hurtT || 0) - dt;
      if (E.hurtT <= 0) {
        E.hurtT = 0.6;
        for (const e of API.enemies) if (!e.dead && e.qtag === E.tag + 'a' && Math.hypot(e.x - E.x, e.z - E.z) < 3.2) {
          E.hp -= 4; API.dmgNum(E.x, API.heightAt(E.x, E.z) + 1.8, E.z, 4, 'pl'); API.emit(E.x, API.heightAt(E.x, E.z) + 1, E.z, 6, '#ff5252', { speed: 3 });
        }
        if (E.hp <= 0) {
          toast(`${E.name} è stato ferito gravemente! Missione ripresa dal punto di partenza.`); sfx('warning');
          r.p[E.i] = 0; removeEscort(); return;
        }
      }
      if (Math.hypot(o.to.x - E.x, o.to.z - E.z) < (o.r || 10)) {
        API.shockwave(E.x, E.z, 5, 0, '#ffd36b'); API.emit(E.x, API.heightAt(E.x, E.z) + 1, E.z, 30, '#ffd36b', { speed: 3, up: 5, life: 1.2 });
        toast(`${E.name} è arrivato a destinazione!`);
        removeEscort(); progress(E.id, E.i, 1);
        return;
      }
    } else if (E.t % 4 < dt) { /* idle look-around */ }
    const y = API.heightAt(E.x, E.z);
    m.root.position.set(E.x, y, E.z);
    m.root.rotation.y += API.angDiff(m.root.rotation.y, E.started && moving ? E.rot : Math.atan2(P.x - E.x, P.z - E.z)) * Math.min(1, dt * 6);
    animModel(m, moving, E.t);
    if (!E.started && Math.random() < dt * 2) API.emit(E.x, y + (m.cat ? 0.8 : 2.4), E.z, 1, '#ffd36b', { speed: 0.3, up: 1.4, grav: -0.4, life: 1, size: 0.6 });
  }
  function animModel(m, moving, t) {
    const sw = moving ? Math.sin(t * 9) * 0.7 : 0;
    if (m.cat) { m.legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(t * 12 + (k % 2 ? PI : 0) + (k > 1 ? PI / 2 : 0)) * 0.7 : 0; }); m.tail.rotation.z = Math.sin(t * 3) * 0.4; m.g.position.y = moving ? Math.abs(Math.sin(t * 12)) * 0.04 : 0; return; }
    m.legL.rotation.x = sw; m.legR.rotation.x = -sw;
    m.armL.rotation.x = -sw * 0.6; m.armR.rotation.x = sw * 0.6;
    m.g.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 1.8) * 0.01;
  }

  /* ============================================================ set piece: Cratere della Convergenza */
  const CRATER = { x: -420, z: -300 };
  let crater = null;
  const vortexU = { time: { value: 0 }, a: { value: 1 } };
  function buildCrater() {
    const g = new T.Group(), y0 = API.heightAt(CRATER.x, CRATER.z);
    g.position.set(CRATER.x, 0, CRATER.z);
    const N = LOW ? 28 : 46, rnd = hrand(777);
    const spikeMat = std('#1a1024', 0.25, 0.55, { emissive: new T.Color('#2a0640') });
    const im = new T.InstancedMesh(GEO.oct, spikeMat, N), m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = new T.Vector3(), pv = new T.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + rnd() * 0.12, r = 26 + rnd() * 18, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = 2 + rnd() * 6 * (r < 34 ? 1.4 : 1);
      e.set((rnd() - 0.5) * 0.5 - Math.cos(a) * 0.35, a, (rnd() - 0.5) * 0.5 + Math.sin(a) * 0.35); q.setFromEuler(e);
      m4.compose(pv.set(x, API.heightAt(CRATER.x + x, CRATER.z + z) + h * 0.35, z), q, sv.set(0.8 + rnd() * 0.9, h, 0.8 + rnd() * 0.9)); im.setMatrixAt(i, m4);
    }
    im.castShadow = !LOW; im.receiveShadow = true; g.add(im);
    // glowing rune ring on the ground
    const ring = new T.Mesh(new T.RingGeometry(20, 21.2, 96), addMat('#b04dff', 2.4, 0.75)); ring.rotation.x = -PI / 2; ring.position.y = y0 + 0.3; g.add(ring);
    const ring2 = new T.Mesh(new T.RingGeometry(11, 11.6, 64), addMat('#e080ff', 2.6, 0.6)); ring2.rotation.x = -PI / 2; ring2.position.y = y0 + 0.32; g.add(ring2);
    // the vortex: a tall swirling column of void light into the sky
    const vMat = new T.ShaderMaterial({ uniforms: vortexU, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time, a; varying vec2 vUv;
        void main(){ float s = sin(vUv.x * 6.2831 * 4.0 + vUv.y * 18.0 - time * 2.5) * 0.5 + 0.5; float f = pow(1.0 - vUv.y, 0.7) * (0.35 + 0.65 * s);
          vec3 c = mix(vec3(0.5, 0.08, 1.0), vec3(1.6, 0.7, 2.4), s) * f * a; gl_FragColor = vec4(c, 1.0); }` });
    const vortex = new T.Mesh(new T.CylinderGeometry(7, 3, 220, 24, 1, true), vMat); vortex.position.y = y0 + 108; vortex.frustumCulled = false; g.add(vortex);
    const pit = new T.Mesh(new T.CircleGeometry(10, 40), new T.MeshBasicMaterial({ color: '#05010a' })); pit.rotation.x = -PI / 2; pit.position.y = y0 + 0.25; g.add(pit);
    API.scene.add(g);
    return { g, im, ring, ring2, vortex, spikeMat, y0 };
  }
  function tickCrater(dt) {
    const active = !!(QS.q.m8 || (QS.q.m7 && QS.q.m7.s === 'turned'));
    if (!active) return;
    const dd = dist(CRATER.x, CRATER.z);
    if (!crater) { if (dd > 900) return; crater = buildCrater(); }
    const sealed = QS.q.m8 && QS.q.m8.s === 'turned';
    crater.g.visible = dd < 900;
    if (!crater.g.visible) return;
    vortexU.time.value += dt; vortexU.a.value = clamp((dd - 22) / 90, 0.08, 1);
    crater.vortex.visible = !sealed;
    if (sealed && !crater.sealed) { crater.sealed = true; crater.spikeMat.emissive.set('#5a3a08'); crater.ring.material.color.copy(hdr('#ffd36b', 2.2)); crater.ring2.material.color.copy(hdr('#fff3c8', 2.2)); }
    crater.ring.rotation.z += dt * 0.08; crater.ring2.rotation.z -= dt * 0.15;
    if (!sealed && dd < 140 && Math.random() < dt * 10) { const a = rand(0, TAU), r = rand(2, 12); API.emit(CRATER.x + Math.cos(a) * r, crater.y0 + rand(0.5, 3), CRATER.z + Math.sin(a) * r, 1, '#b04dff', { speed: 0.6, up: 6, grav: -2, life: 2, size: 1, bright: 2.4 }); }
  }

  /* ============================================================ NPC instances in the world */
  const markers = [];
  // far LOD: the whole NPC (rest pose) merged into one vertex-coloured mesh → 1 draw call
  const _inv = new T.Matrix4(), _lm = new T.Matrix4();
  function lodMesh(root) {
    root.updateMatrixWorld(true); _inv.copy(root.matrixWorld).invert();
    const parts = []; let count = 0;
    root.traverse((o) => { if (o.isMesh && o.geometry.attributes.color && !o.material.blending) { parts.push(o); count += o.geometry.attributes.position.count; } });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    let k = 0;
    for (const o of parts) {
      _lm.multiplyMatrices(_inv, o.matrixWorld); _n3.getNormalMatrix(_lm);
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, ca = g.attributes.color;
      for (let i = 0; i < pa.count; i++, k++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(_lm); pos[k * 3] = _v.x; pos[k * 3 + 1] = _v.y; pos[k * 3 + 2] = _v.z;
        _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize(); nor[k * 3] = _v.x; nor[k * 3 + 1] = _v.y; nor[k * 3 + 2] = _v.z;
        col[k * 3] = Math.min(ca.getX(i), 1.6); col[k * 3 + 1] = Math.min(ca.getY(i), 1.6); col[k * 3 + 2] = Math.min(ca.getZ(i), 1.6);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const m = new T.Mesh(geo, MAT.vc); m.castShadow = false; m.visible = false;
    return m;
  }
  const LODD = LOW ? 22 : HIGH ? 38 : 30;
  function spawnNpcs() {
    for (const n of NPC_LIST) {
      const m = npcModel(n.st);
      n.lod = lodMesh(m.root); API.scene.add(n.lod);
      const y = API.heightAt(n.x, n.z);
      m.root.position.set(n.x, y, n.z);
      n.rot0 = n.face ? Math.atan2(n.face[0] - n.x, n.face[1] - n.z) : 0;
      m.root.rotation.y = n.rot0;
      API.scene.add(m.root);
      n.m = m; n.t = rand(0, 10); n.talkT = 0; n.cur = { x: n.x, z: n.z };
      const sp = new T.Sprite(MK.gold); sp.scale.set(0.55, 0.82, 1); sp.visible = false; sp.renderOrder = 5;
      sp.position.set(n.x, y + 2.55 * (n.st.scale || 1) + 0.25, n.z); API.scene.add(sp); n.mk = sp;
      const hl = new T.Sprite(haloMat); hl.scale.set(1.3, 1.3, 1); sp.add(hl); hl.position.set(0, 0, -0.01); hl.scale.set(2.2, 1.5, 1); n.hl = hl;
      API.COLL.push({ x: n.x, z: n.z, r: 0.55 * (n.st.scale || 1) });
      markers.push(n);
    }
    // quest board
    buildBoard();
  }
  let board = null;
  const BOARD = { x: 34, z: 449.4 };
  function buildBoard() {
    const g = new T.Group(), y = API.heightAt(BOARD.x, BOARD.z);
    g.position.set(BOARD.x, y, BOARD.z); g.rotation.y = Math.atan2(BOARD.x - BOARD.x, 470 - BOARD.z);
    const k = new Kit(), kg = new Kit(), wood = '#5a3e2a', dark = '#3a2618';
    for (const sx of [-1, 1]) { k.add(GEO.box, dark, sx * 1.15, 1.2, 0, 0.16, 2.4, 0.16); k.add(GEO.box, dark, sx * 1.15, 0.05, 0, 0.36, 0.1, 0.36); }
    k.add(GEO.box, wood, 0, 1.55, 0, 2.2, 1.5, 0.1);
    k.add(GEO.box, dark, 0, 2.35, 0, 2.5, 0.12, 0.22); k.add(GEO.box, dark, 0, 0.78, 0, 2.3, 0.08, 0.14);
    k.add(GEO.box, '#2a5a46', 0, 2.62, 0, 1.6, 0.36, 0.06); kg.add(GEO.box, hdr('#ffd36b', 1.6), 0, 2.62, 0.035, 1.3, 0.05, 0.01);
    const papers = [[-0.75, 1.9, -0.1, '#efe2bf'], [-0.2, 1.75, 0.12, '#f2e8cc'], [0.45, 1.95, -0.06, '#e8d8b0'], [0.8, 1.45, 0.1, '#efe2bf'], [-0.6, 1.25, 0.05, '#f5edd6'], [0.1, 1.2, -0.12, '#e6d6ae']];
    for (const [x, yy, rz, c] of papers) { k.add(GEO.box, c, x, yy, 0.06, 0.42, 0.52, 0.012, 0, 0, rz); k.add(GEO.box, '#b03030', x, yy + 0.22, 0.07, 0.05, 0.05, 0.015); }
    for (let i = 0; i < 4; i++) kg.add(GEO.box, hdr(['#ff7a3a', '#9fd8ff', '#9cff9a', '#ffd36b'][i], 1.4), -0.75 + i * 0.5, 2.15, 0.07, 0.08, 0.02, 0.01);
    // emblem
    kg.add(GEO.oct, hdr('#7dffb0', 2.2), 0, 2.62, 0.07, 0.07, 0.1, 0.02);
    // lantern posts
    for (const sx of [-1, 1]) { k.add(GEO.cyl6, '#2a2a2a', sx * 1.55, 1.1, 0.3, 0.04, 2.2, 0.04); k.add(GEO.box, '#2a2a2a', sx * 1.55, 2.25, 0.3, 0.2, 0.26, 0.2); kg.add(GEO.box, hdr('#ffc46a', 2.6), sx * 1.55, 2.25, 0.3, 0.14, 0.2, 0.14); }
    k.mesh(MAT.vc, g); kg.mesh(MAT.glow, g, false);
    API.scene.add(g);
    const sp = new T.Sprite(MK.blue); sp.scale.set(0.55, 0.82, 1); sp.position.set(BOARD.x, y + 3.35, BOARD.z); sp.visible = false; API.scene.add(sp);
    board = { g, sp, y };
    API.COLL.push({ x: BOARD.x, z: BOARD.z, r: 1.1 });
    // receptionist counter
    const cg = new T.Group(); cg.position.set(NPCS.elina.x, API.heightAt(NPCS.elina.x, NPCS.elina.z), NPCS.elina.z + 0.85);
    const ck = new Kit(), ckg = new Kit();
    ck.add(GEO.box, '#4a3020', 0, 0.5, 0, 1.9, 1.0, 0.55); ck.add(GEO.box, '#6b4a2a', 0, 1.03, 0, 2.05, 0.07, 0.7); ck.add(GEO.box, '#2a5a46', 0, 0.55, 0.28, 1.6, 0.6, 0.02);
    ck.add(GEO.box, '#efe2bf', -0.5, 1.09, 0.05, 0.36, 0.03, 0.26); ck.add(GEO.box, '#3a2a1e', 0.55, 1.1, 0, 0.12, 0.06, 0.12);
    ckg.add(GEO.box, hdr('#ffd36b', 1.8), 0, 0.55, 0.295, 1.2, 0.04, 0.01); ckg.add(GEO.oct, hdr('#7dffb0', 2.4), 0.55, 1.22, 0, 0.06, 0.09, 0.06);
    ck.mesh(MAT.vc, cg); ckg.mesh(MAT.glow, cg, false); API.scene.add(cg);
    API.COLL.push({ x: NPCS.elina.x, z: NPCS.elina.z + 0.85, r: 0.9 });
  }
  function npcState(n) {
    // marker kind for this NPC: 'turn' > 'gold'/'blue' (available) > 'wait' > null
    if (n.vis && !n.vis()) return null;
    let k = null;
    for (const id in QS.q) { const r = QS.q[id]; const d = def(id); if (!d) continue; if (r.s === 'done' && d.turnIn === n.id) return 'turn'; }
    for (const id in QS.q) { const stg = stageOf(id); if (!stg) continue; const r = rec(id); if (stg.objs.some((o, i) => o.t === 'talk' && o.npc === n.id && r.p[i] < 1 && objActive(id, i))) return 'turn'; }
    for (const id of ORDER) { const d = DEFS[id]; if (d.giver === n.id && !d.auto && available(id)) { k = d.kind === 'guild' ? 'blue' : 'gold'; if (k === 'gold') break; } }
    if (!k && n.id === 'elina' && !QS.guild.reg && QS.q.m1) k = 'blue';
    if (!k) for (const id in QS.q) { const r = QS.q[id], d = def(id); if (d && r.s === 'active' && d.turnIn === n.id && d.giver === n.id) { k = 'wait'; break; } }
    return k;
  }
  let mkT = 0;
  function tickNpcs(dt, now) {
    mkT -= dt;
    const upd = mkT <= 0; if (upd) mkT = 0.5;
    for (const n of NPC_LIST) {
      const vis = !n.vis || n.vis();
      const dd = dist(n.cur.x, n.cur.z);
      const show = vis && dd < (LOW ? 80 : 115), far = dd > LODD && !(D.open && D.npc === n);
      n.m.root.visible = show && !far; n.lod.visible = show && far;
      if (upd) { n.mkState = vis && dd < 140 ? npcState(n) : null; n.mk.material = MK[n.mkState] || MK.gold; }
      n.mk.visible = vis && dd < 140 && !!n.mkState;
      if (n.mk.visible) {
        const y = API.heightAt(n.cur.x, n.cur.z) + 2.25 * (n.st.scale || 1) + 0.35;
        n.mk.position.set(n.cur.x, y + Math.sin(now * 0.004 + n.t) * 0.09, n.cur.z);
        const pulse = (1 + Math.sin(now * 0.006) * 0.06) * (dd > 40 ? 1 + (dd - 40) / 60 : 1); n.mk.scale.set(0.5 * pulse, 0.75 * pulse, 1);
      }
      if (far && show) { n.lod.position.copy(n.m.root.position); n.lod.rotation.y = n.m.root.rotation.y; }
      if (!show || far) continue;
      n.t += dt;
      const m = n.m;
      // head/eyes toward player when near
      const near = dd < 7;
      const want = near ? Math.atan2(P.x - n.cur.x, P.z - n.cur.z) - m.root.rotation.y : 0;
      let wd = want; while (wd > PI) wd -= TAU; while (wd < -PI) wd += TAU;
      m.head.rotation.y = lerp(m.head.rotation.y, clamp(wd, -1.0, 1.0), Math.min(1, dt * 4));
      if (n.talkT > 0) { n.talkT -= dt; m.root.rotation.y += API.angDiff(m.root.rotation.y, Math.atan2(P.x - n.cur.x, P.z - n.cur.z)) * Math.min(1, dt * 5); }
      else { const ad = API.angDiff(m.root.rotation.y, n.rot0); if (Math.abs(ad) > 0.01) m.root.rotation.y += ad * Math.min(1, dt * 1.5); }
      const br = Math.sin(n.t * 1.7) * 0.012;
      m.g.position.y = br;
      if (n.castT > 0) n.castT -= dt;
      const talking = (D.open && D.npc === n) || n.castT > 0;
      m.armR.rotation.x = talking ? -0.5 + Math.sin(n.t * 4) * 0.35 : Math.sin(n.t * 1.1) * 0.05;
      m.armR.rotation.z = talking ? -0.2 : 0;
      m.armL.rotation.x = Math.sin(n.t * 1.1 + 1) * 0.05;
      if (m.cape) m.cape.rotation.x = 0.08 + Math.sin(n.t * 1.6) * 0.05;
      if (m.tail) { m.tail.rotation.y = Math.sin(n.t * 2.2) * 0.5; }
      if (m.orbs.length) m.orbs.forEach((o, k) => { const a = n.t * 1.3 + k * TAU / 3; o.position.set(Math.cos(a) * 0.55, 1.5 * m.s + Math.sin(n.t * 2 + k) * 0.12, Math.sin(a) * 0.55); o.rotation.y = n.t * 2; });
    }
    if (board) {
      if (upd) board.state = QS.guild.reg ? (QS.guild.offers.length ? 'blue' : null) : null;
      board.sp.visible = !!board.state && dist(BOARD.x, BOARD.z) < 100;
      if (board.sp.visible) board.sp.position.y = board.y + 3.3 + Math.sin(now * 0.004) * 0.09;
    }
  }
  /* ambient barks: speech bubble above the nearest idle NPC */
  const bub = document.createElement('div'); bub.id = 'qbub'; (document.getElementById('hud') || document.body).appendChild(bub);
  const BK = { n: null, t: 0, cd: 4 };
  const _bv = new T.Vector3();
  function tickBarks(dt) {
    BK.cd -= dt;
    if (BK.n) {
      BK.t -= dt;
      const n = BK.n;
      if (BK.t <= 0 || D.open || !n.m.root.visible || dist(n.cur.x, n.cur.z) > 16) { BK.n = null; bub.className = ''; return; }
      _bv.set(n.cur.x, API.heightAt(n.cur.x, n.cur.z) + 2.2 * (n.st.scale || 1) + (n.mk.visible ? 0.9 : 0.35), n.cur.z).project(API.camera);
      if (_bv.z > 1) { bub.style.opacity = '0'; return; }
      bub.style.opacity = '1';
      bub.style.transform = `translate(${((_bv.x + 1) / 2 * innerWidth).toFixed(0)}px,${((1 - _bv.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%,-100%)`;
      return;
    }
    if (BK.cd > 0 || D.open) return;
    BK.cd = rand(5, 10);
    let best = null, bd = 9;
    for (const n of NPC_LIST) { if (!n.m.root.visible || n.ally) continue; const d0 = dist(n.cur.x, n.cur.z); if (d0 < bd && d0 > 2.2) { bd = d0; best = n; } }
    if (!best) return;
    const lines = best.barks || chatLines(best);
    let txt = lines[(Math.random() * lines.length) | 0] || '';
    if (best.mkState === 'gold') txt = '«Ehi, tu! Ho bisogno di una mano!»';
    else if (best.mkState === 'turn') txt = '«Allora? Com\'è andata?»';
    if (txt.length > 90) txt = txt.slice(0, txt.lastIndexOf(' ', 86)) + '…';
    BK.n = best; BK.t = 3.6; bub.textContent = txt.replace(/\{P\}/g, pname()); bub.className = 'on';
  }
  function placeAllies(on) {
    // heroes join the final battle at the crater
    const spots = { ren: [-412, -292], sora: [-430, -290], brann: [-421, -284] };
    for (const id of ['ren', 'sora', 'brann']) {
      const n = NPCS[id], p = on ? { x: spots[id][0], z: spots[id][1] } : { x: n.x, z: n.z };
      n.ally = on;
      if (n.cur.x === p.x && n.cur.z === p.z) continue;
      n.cur = p; n.m.root.position.set(p.x, API.heightAt(p.x, p.z), p.z);
      n.rot0 = on ? Math.atan2(-420 - p.x, -305 - p.z) : Math.atan2(n.face[0] - n.x, n.face[1] - n.z);
      if (on) API.lightPillar(p.x, p.z, n.color, 1);
    }
  }
  let allyT = 0;
  function tickAllies(dt) {
    const stg = stageOf('m8'); const on = !!(stg && stg.allies);
    placeAllies(on && dist(-420, -300) < 160);
    if (!on) return;
    const boss = API.enemies.find((e) => e.type === 'demon_lord' && !e.dead);
    if (!boss || !boss.engaged) return;
    allyT -= dt; if (allyT > 0) return;
    allyT = 2.2;
    const ids = ['ren', 'sora', 'brann'], who = NPCS[ids[(Math.random() * 3) | 0]];
    const y0 = API.heightAt(who.cur.x, who.cur.z) + 2, by = boss.y + 3;
    who.castT = 0.6; who.m.root.rotation.y = Math.atan2(boss.x - who.cur.x, boss.z - who.cur.z);
    const dmg = Math.round(boss.maxHp * 0.012);
    if (who.id === 'ren') { API.bolt(who.cur.x, y0, who.cur.z, boss.x, by, boss.z, '#ffd36b'); API.emit(boss.x, by, boss.z, 20, '#ffd36b', { speed: 6 }); }
    else if (who.id === 'sora') { API.bolt(who.cur.x, y0 + 1, who.cur.z, boss.x, by, boss.z, '#7df9ff'); API.emit(boss.x, by, boss.z, 24, '#7df9ff', { speed: 6 }); }
    else { API.emit(boss.x, boss.y + 0.5, boss.z, 30, '#ffc23a', { speed: 8, up: 2 }); API.setShake(0.15); }
    sfx(who.id === 'brann' ? 'slash' : 'thunder', { vol: 0.5 });
    try { API.hitEnemyQuiet(boss, dmg); } catch (e) { boss.hp -= dmg; }
    if (Math.random() < 0.25) toast(who.id === 'ren' ? 'Ren: «Lama di Luce!»' : who.id === 'sora' ? 'Sora: «Matrice Arcana, fuoco!»' : 'Brann: «Per Kharvos!»');
  }

  /* ============================================================ DIALOGUE / CUTSCENE PANEL */
  const css = document.createElement('style');
  css.textContent = `
#qdlg{position:fixed;inset:0;z-index:46;display:none;pointer-events:none;font-family:"Palatino Linotype","Book Antiqua",Georgia,serif}
#qdlg.on{display:block}
#qdlg .lb{position:absolute;left:0;right:0;height:0;background:#000;transition:height .5s ease;pointer-events:none}
#qdlg .lb.t{top:0}#qdlg .lb.b{bottom:0}
#qdlg.cine .lb{height:9vh}
#qdlg .qb{position:absolute;left:50%;bottom:calc(10px + 1vh);transform:translateX(-50%);width:min(96vw,820px);pointer-events:auto;box-sizing:border-box;display:flex;gap:12px;align-items:stretch;
 background:linear-gradient(rgba(26,20,11,.96),rgba(10,8,5,.97));border:1px solid rgba(220,190,120,.65);border-radius:4px;color:#efe3c0;
 box-shadow:0 0 34px rgba(0,0,0,.7),inset 0 0 26px rgba(240,190,90,.08);padding:10px 14px 10px 10px}
#qdlg.cine .qb{bottom:calc(9vh + 8px)}
#qdlg .qb::before{content:'';position:absolute;left:6px;right:6px;top:3px;height:1px;background:linear-gradient(90deg,transparent,rgba(255,215,140,.55),transparent)}
#qdlg canvas{width:112px;height:126px;flex:0 0 112px;border:1px solid rgba(220,190,120,.5);border-radius:3px;background:#0b0905;box-shadow:inset 0 0 12px #000}
#qdlg .qc{flex:1;min-width:0;display:flex;flex-direction:column}
#qdlg .qh{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid rgba(220,190,120,.25);padding-bottom:3px;margin-bottom:3px}
#qdlg .qn{font-size:19px;letter-spacing:1px;color:#ffe7a8;text-shadow:0 0 10px rgba(0,0,0,.6)}
#qdlg .qs{font-size:12px;color:#a8987a;font-style:italic}
#qdlg .qt{font-size:16px;line-height:1.45;min-height:3.1em;white-space:pre-wrap;flex:1}
#qdlg .qt.nar{font-style:italic;color:#cbbd98;text-align:center}
#qdlg .qt.orc{color:#bfe9ff;text-shadow:0 0 8px rgba(80,180,255,.45)}
#qdlg .qx{text-align:right;font-size:11px;color:#d6ba78;height:13px;animation:qbl 1s infinite}
@keyframes qbl{50%{opacity:.15}}
#qdlg .qa{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
#qdlg .qa button{flex:1 1 40%;min-width:150px;min-height:42px;padding:7px 10px;font:inherit;font-size:14.5px;color:#efe3c0;background:rgba(60,48,26,.72);border:1px solid rgba(220,190,120,.45);
 cursor:pointer;text-align:left;border-radius:3px;line-height:1.2}
#qdlg .qa button small{display:block;font-size:11.5px;color:#b8a57a;margin-top:2px}
#qdlg .qa button em{font-style:normal;color:#ffd36b;margin-right:6px}
#qdlg .qa button:active,#qdlg .qa button:hover{background:rgba(140,110,50,.62)}
#qdlg .qa button.pri{border-color:rgba(255,200,120,.9);box-shadow:0 0 12px rgba(255,190,90,.3)}
#qdlg .qa button.off{opacity:.45}
#qcard{position:fixed;inset:0;z-index:47;display:flex;align-items:center;justify-content:center;flex-direction:column;pointer-events:none;opacity:0;transition:opacity 1s;
 font-family:"Palatino Linotype",Georgia,serif;background:radial-gradient(ellipse at center,rgba(0,0,0,.72),rgba(0,0,0,.25) 70%,transparent)}
#qcard.on{opacity:1}
#qcard .c1{font-size:clamp(13px,2.2vw,18px);letter-spacing:8px;color:#d6ba78;text-transform:uppercase}
#qcard .c2{font-size:clamp(28px,6vw,58px);letter-spacing:3px;color:#ffe7a8;text-shadow:0 0 24px rgba(255,200,90,.55),0 2px 4px #000;margin:4px 0}
#qcard .c3{width:min(60vw,520px);height:1px;background:linear-gradient(90deg,transparent,#d6ba78,transparent)}
#qcard .c4{font-size:clamp(12px,1.8vw,15px);color:#c9b98e;font-style:italic;margin-top:8px;max-width:70vw;text-align:center}
#qban{position:fixed;left:50%;top:21%;transform:translateX(-50%);z-index:44;pointer-events:none;text-align:center;font-family:"Palatino Linotype",Georgia,serif;opacity:0;width:min(96vw,720px);
 padding:6px 0 12px;background:linear-gradient(90deg,transparent,rgba(8,6,3,.72) 16%,rgba(8,6,3,.72) 84%,transparent)}
#qban.on{animation:qbin 4.6s ease forwards}
@keyframes qbin{0%{opacity:0;transform:translateX(-50%) scale(1.25)}8%{opacity:1;transform:translateX(-50%) scale(1)}82%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-14px)}}
#qban .b1{font-size:clamp(24px,5vw,44px);letter-spacing:6px;background:linear-gradient(100deg,#b8862a 0%,#f3d27a 38%,#fffbe8 50%,#f3d27a 62%,#b8862a 100%);background-size:260% 100%;background-position:100% 0;
 -webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 10px rgba(255,190,80,.5));padding:6px 0 2px;animation:qsh 2.2s .2s ease-in-out 2}
#qban.rank .b1{background-image:linear-gradient(100deg,#7a9ab8 0%,#cfe8ff 38%,#ffffff 50%,#cfe8ff 62%,#7a9ab8 100%)}
#qban.main .b1{font-size:clamp(26px,5.6vw,50px)}
#qban.new .b1{font-size:clamp(18px,3.4vw,30px)}
#qban .b2{font-size:clamp(14px,2.4vw,19px);color:#efe3c0;text-shadow:0 1px 3px #000;letter-spacing:1px}
#qban .b0{height:2px;margin:6px auto;width:80%;background:linear-gradient(90deg,transparent,#f3d27a,transparent)}
#qban .b3{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 10px;margin-top:6px}
#qban .b3 span{font-size:13.5px;padding:3px 10px;border:1px solid rgba(220,190,120,.45);background:rgba(10,8,4,.72);border-radius:12px;white-space:nowrap}
@keyframes qsh{from{background-position:100% 0}to{background-position:0% 0}}
#qtrk{position:absolute;right:calc(10px + env(safe-area-inset-right));top:64px;width:min(31vw,272px);font-family:"Palatino Linotype",Georgia,serif;pointer-events:none;text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.8)}
#qtrk .hd{pointer-events:auto;cursor:pointer;font-size:11px;letter-spacing:2px;color:#d6ba78;text-align:right;padding:2px 2px 3px;border-bottom:1px solid rgba(214,186,120,.35);margin-bottom:4px}
#qtrk .q{margin:0 0 7px;padding:4px 7px 5px;background:linear-gradient(270deg,rgba(0,0,0,.5),rgba(0,0,0,.18) 80%,transparent);border-right:2px solid rgba(214,186,120,.6);transition:box-shadow .3s,background .3s}
#qtrk .q.main{border-right-color:#ffd36b}#qtrk .q.guild{border-right-color:#58c8ff}
#qtrk .q.up{background:linear-gradient(270deg,rgba(255,200,90,.35),rgba(0,0,0,.18) 80%,transparent);box-shadow:0 0 12px rgba(255,200,90,.35)}
#qtrk .t{font-size:13px;color:#ffe7a8;text-align:right;line-height:1.2}
#qtrk .q.guild .t{color:#a8e4ff}
#qtrk .t i{font-style:normal;font-size:10px;color:#a8987a;margin-right:4px;letter-spacing:1px}
#qtrk .o{font-size:12px;color:#efe3c0;text-align:right;line-height:1.3;margin-top:1px}
#qtrk .o.ok{color:#8cdc8a;text-decoration:line-through;opacity:.75}
#qtrk .o b{color:#ffd36b;font-weight:normal}#qtrk .o u{color:#9fc4ff;text-decoration:none;font-size:11px}
#qtrk .o.ready{color:#ffd84a}
#qtrk .hp{height:3px;background:rgba(0,0,0,.6);margin:2px 0 0 30%;}
#qtrk .hp i{display:block;height:100%;background:linear-gradient(90deg,#3a9a3a,#8cdc8a)}
#qbub{position:absolute;left:0;top:0;max-width:min(46vw,300px);padding:5px 10px;font-size:12.5px;line-height:1.3;color:#2a1e10;background:linear-gradient(#f7eed6,#e6d6ae);border:1px solid #8a6a3a;
 border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.5);opacity:0;transition:opacity .25s;pointer-events:none;font-family:"Palatino Linotype",Georgia,serif;font-style:italic;display:none}
#qbub.on{display:block}
#qbub::after{content:'';position:absolute;left:50%;bottom:-7px;margin-left:-6px;border:6px solid transparent;border-top-color:#e6d6ae;border-bottom:0}
#qlogb{position:absolute;right:calc(118px + env(safe-area-inset-right));top:8px;width:48px;height:48px;font-size:10.5px !important;pointer-events:auto}
#qlog,#qboard{z-index:48}
#qlog .box,#qboard .box{width:min(96vw,900px);height:min(92vh,640px);max-height:none;display:flex;flex-direction:column;padding:12px 14px;position:relative}
#qlog .qx-close,#qboard .qx-close{position:absolute;right:8px;top:6px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:20px;padding:0;margin:0;border-radius:50%;z-index:2}
.qdet u{text-decoration:none;color:#9fc4ff;font-size:12px}
.qtabs{display:flex;gap:6px;margin:0 46px 8px 0;flex-wrap:wrap}
.qtabs button{flex:1;margin:0 !important;min-height:40px;letter-spacing:1px}
.qtabs button.on{background:rgba(160,120,50,.55) !important;border-color:#f3d27a !important;color:#fff3c8 !important;box-shadow:0 0 10px rgba(255,200,90,.25)}
.qbody{flex:1;display:flex;gap:10px;min-height:0}
.qlist{flex:0 0 38%;overflow:auto;border-right:1px solid rgba(220,190,120,.25);padding-right:6px}
.qlist .it{padding:8px 9px;margin:0 0 5px;border:1px solid rgba(220,190,120,.2);background:rgba(40,32,18,.45);cursor:pointer;min-height:40px;border-radius:2px}
.qlist .it.sel{border-color:#f3d27a;background:rgba(110,85,40,.45)}
.qlist .it .n{font-size:14px;color:#efe3c0}.qlist .it .s{font-size:11px;color:#a8987a;margin-top:2px}
.qlist .it.done .n{color:#ffd84a}.qlist .it.turned{opacity:.55}
.qlist .sec{font-size:11px;letter-spacing:3px;color:#d6ba78;margin:8px 0 5px;text-transform:uppercase}
.qdet{flex:1;overflow:auto;padding:0 4px}
.qdet h3{margin:2px 0 2px;font-weight:normal;color:#f3d27a;font-size:20px;letter-spacing:1px}
.qdet .sub{font-size:12px;color:#a8987a;margin-bottom:8px}
.qdet p{font-size:14px;line-height:1.5;color:#e2d6b4;margin:6px 0}
.qdet .ob{font-size:14px;margin:4px 0;padding-left:20px;position:relative}
.qdet .ob::before{content:'◇';position:absolute;left:2px;color:#d6ba78}
.qdet .ob.ok{color:#8cdc8a}.qdet .ob.ok::before{content:'✔';color:#8cdc8a}
.qdet .stg{font-size:12px;color:#a8987a;margin:10px 0 2px;letter-spacing:1px;text-transform:uppercase}
.qdet .rw{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.qdet .rw span{font-size:12.5px;padding:3px 9px;border:1px solid rgba(220,190,120,.35);background:rgba(10,8,4,.6);border-radius:10px}
.qdet .act{display:flex;gap:8px;margin-top:10px}.qdet .act button{flex:1;min-height:42px}
.qcardg{display:flex;gap:12px;align-items:center;padding:10px;margin:0 0 10px;border:1px solid rgba(220,190,120,.45);background:linear-gradient(120deg,rgba(40,70,55,.55),rgba(20,16,10,.7));border-radius:6px;position:relative;overflow:hidden}
.qcardg::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 40%,rgba(255,255,255,.08) 50%,transparent 60%);pointer-events:none}
.qrank{width:58px;height:58px;flex:0 0 58px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:bold;color:#120d06;
 box-shadow:0 0 16px currentColor,inset 0 0 10px rgba(255,255,255,.5);border:2px solid #fff3c8}
.qpts{height:8px;background:rgba(0,0,0,.6);border:1px solid rgba(220,190,120,.4);margin-top:5px;border-radius:4px;overflow:hidden}
.qpts i{display:block;height:100%;background:linear-gradient(90deg,#3a8a5a,#9cff9a)}
.qgrid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px;padding:2px 2px 6px;align-content:start}
.qct{position:relative;padding:10px 11px 9px;background:linear-gradient(#efe2bf,#d8c69a);color:#2a1e10;border-radius:2px;box-shadow:0 3px 10px rgba(0,0,0,.6),inset 0 0 22px rgba(120,80,30,.35);
 font-family:"Palatino Linotype",Georgia,serif;display:flex;flex-direction:column}
.qct::before{content:'';position:absolute;top:5px;left:50%;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:radial-gradient(#ff7070,#8a1010);box-shadow:0 1px 2px #000}
.qct .rk{position:absolute;right:8px;top:6px;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#fff;font-size:16px;text-shadow:0 1px 2px #000;border:1px solid rgba(0,0,0,.4)}
.qct .ty{font-size:11px;letter-spacing:2px;color:#7a5a2a;text-transform:uppercase;margin-top:6px}
.qct .ti{font-size:16px;font-weight:bold;margin:2px 36px 4px 0;line-height:1.15}
.qct .de{font-size:12.5px;line-height:1.35;color:#3a2a18;flex:1}
.qct .re{font-size:12px;margin:6px 0;color:#5a3a10}
.qct button{display:block;width:100%;margin:4px 0 0 !important;min-height:40px;background:rgba(60,40,20,.85) !important;color:#ffe7a8 !important;border:1px solid #3a2410 !important}
.qct.risk .ti::after{content:' ⚠';color:#b03030}
.qct.urg{background:linear-gradient(#fff1c4,#e8c86a);box-shadow:0 0 16px rgba(255,200,80,.55),0 3px 10px rgba(0,0,0,.6),inset 0 0 22px rgba(160,100,20,.35);outline:2px solid #c9962e}
.qct.urg .ty{color:#a0300a}
.qct.act{outline:2px solid #2a7a4a}
.qrow{display:flex;gap:8px;align-items:center;margin-top:8px}
.qrow button{flex:1;min-height:42px;margin:0 !important}
@media (max-height:420px){.qct{padding:7px 9px 7px}.qct .ti{font-size:14.5px}.qct .de{font-size:11.5px}.qct button{min-height:34px}.qcardg{padding:6px 10px;margin-bottom:6px}.qrank{width:46px;height:46px;flex-basis:46px;font-size:24px}#qlog .box,#qboard .box{padding:8px 10px}#qlog h2,#qboard h2{font-size:18px;margin-bottom:4px !important}.qtabs button{min-height:36px}#qdlg canvas{width:84px;height:96px;flex-basis:84px}#qdlg .qt{font-size:14.5px;min-height:2.6em}#qtrk{top:60px}#qtrk .o{font-size:11px}#qtrk .t{font-size:12px}}
@media (hover:hover) and (pointer:fine){#qlogb{display:none !important}}
`;
  document.head.appendChild(css);

  /* ---------------- portraits (procedural painted busts) ---------------- */
  function shade(hex, k) { const c = new T.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }
  function drawPortrait(cx, spk, t, talking) {
    const W = 224, H = 252; cx.clearRect(0, 0, W, H);
    if (spk === 'o') {
      const g = cx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 140); g.addColorStop(0, '#16314a'); g.addColorStop(1, '#03070d'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.save(); cx.translate(W / 2, H / 2);
      for (let i = 0; i < 4; i++) { cx.strokeStyle = `rgba(120,210,255,${0.25 + i * 0.15})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(0, 0, 30 + i * 18 + Math.sin(t * 2 + i) * 3, t * (i % 2 ? 1 : -1) * 0.6, t * (i % 2 ? 1 : -1) * 0.6 + 4.6); cx.stroke(); }
      cx.fillStyle = '#bfefff'; cx.shadowColor = '#7fd4ff'; cx.shadowBlur = 24; cx.beginPath(); cx.ellipse(0, 0, 34, 16, 0, 0, TAU); cx.fill();
      cx.fillStyle = '#0b2a40'; cx.beginPath(); cx.arc(Math.sin(t) * 6, 0, 11, 0, TAU); cx.fill(); cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(Math.sin(t) * 6 + 4, -4, 3, 0, TAU); cx.fill();
      cx.restore(); cx.shadowBlur = 0; return;
    }
    if (spk === 'p') {
      const col = (API.ch && API.ch.color) || '#4fc3ff';
      const g = cx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, 150); g.addColorStop(0, shade(col, -0.25)); g.addColorStop(1, '#05080c'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      const sq = 1 + Math.sin(t * 3) * 0.03;
      cx.save(); cx.translate(W / 2, H * 0.66); cx.scale(1 / sq, sq);
      const bg = cx.createRadialGradient(-20, -50, 10, 0, -20, 110); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.25, col); bg.addColorStop(1, shade(col, -0.3));
      cx.fillStyle = bg; cx.beginPath(); cx.moveTo(-88, 40); cx.bezierCurveTo(-100, -40, -50, -110, 0, -112); cx.bezierCurveTo(50, -110, 100, -40, 88, 40); cx.closePath(); cx.fill();
      const bl = (t % 3.4) < 0.12 ? 0.15 : 1;
      cx.fillStyle = '#0b0e18'; for (const sx of [-1, 1]) { cx.beginPath(); cx.ellipse(sx * 26, -38, 10, 15 * bl, 0, 0, TAU); cx.fill(); }
      cx.fillStyle = '#fff'; for (const sx of [-1, 1]) { cx.beginPath(); cx.arc(sx * 26 + 4, -44, 3.5 * bl, 0, TAU); cx.fill(); }
      if (talking && Math.sin(t * 20) > 0) { cx.fillStyle = '#0b0e18'; cx.beginPath(); cx.ellipse(0, -10, 7, 4, 0, 0, TAU); cx.fill(); }
      cx.restore(); return;
    }
    const n = NPCS[spk] || NPCS.king, o = n.st;
    const bgc = n.color || '#ffd36b';
    const g = cx.createRadialGradient(W / 2, H * 0.35, 8, W / 2, H / 2, 170); g.addColorStop(0, shade(bgc, -0.32)); g.addColorStop(1, '#070504'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(255,230,170,.06)'; for (let i = 0; i < 6; i++) { cx.beginPath(); cx.arc(30 + i * 37, 30 + (i % 2) * 16, 14, 0, TAU); cx.fill(); }
    const breathe = Math.sin(t * 1.8) * 1.5;
    cx.save(); cx.translate(W / 2, H * 0.6 + breathe);
    const sk = o.skin || '#f1d2bc', hr = o.hair || '#3a2a1e', cl = o.armor || o.cloth || '#5a4a3a', tr = o.trim || '#c9a24a';
    const burly = o.burly ? 1.15 : 1;
    // hair back
    if (o.hs === 'long' || o.hs === 'mane') { cx.fillStyle = shade(hr, -0.08); cx.beginPath(); cx.ellipse(0, 10, 62 * burly, 92, 0, 0, TAU); cx.fill(); }
    if (o.hs === 'ponytail') { cx.fillStyle = shade(hr, -0.08); cx.beginPath(); cx.ellipse(46, 10, 16, 52, -0.3, 0, TAU); cx.fill(); }
    if (o.cape) { cx.fillStyle = o.cape; cx.beginPath(); cx.moveTo(-104 * burly, 130); cx.lineTo(-70, 40); cx.lineTo(70, 40); cx.lineTo(104 * burly, 130); cx.fill(); }
    // shoulders
    const sg = cx.createLinearGradient(0, 40, 0, 130); sg.addColorStop(0, shade(cl, 0.08)); sg.addColorStop(1, shade(cl, -0.15)); cx.fillStyle = sg;
    cx.beginPath(); cx.moveTo(-96 * burly, 130); cx.bezierCurveTo(-92 * burly, 62, -60, 48, -22, 44); cx.lineTo(22, 44); cx.bezierCurveTo(60, 48, 92 * burly, 62, 96 * burly, 130); cx.fill();
    if (o.fur) { cx.fillStyle = o.fur; cx.beginPath(); cx.ellipse(0, 50, 64 * burly, 18, 0, 0, TAU); cx.fill(); }
    cx.strokeStyle = tr; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-26, 46); cx.lineTo(0, 78); cx.lineTo(26, 46); cx.stroke();
    if (o.cloth2) { cx.fillStyle = o.cloth2; cx.beginPath(); cx.moveTo(-10, 60); cx.lineTo(0, 76); cx.lineTo(10, 60); cx.fill(); }
    if (o.gem) { cx.fillStyle = o.gem; cx.shadowColor = o.gem; cx.shadowBlur = 12; cx.beginPath(); cx.arc(0, 92, 5, 0, TAU); cx.fill(); cx.shadowBlur = 0; }
    // neck & face
    cx.fillStyle = shade(sk, -0.06); cx.fillRect(-13, 18, 26, 30);
    const fg = cx.createRadialGradient(-10, -30, 6, 0, -14, 64); fg.addColorStop(0, shade(sk, 0.06)); fg.addColorStop(1, shade(sk, -0.08)); cx.fillStyle = fg;
    cx.beginPath(); cx.ellipse(0, -14, 40 * (o.burly ? 1.08 : 1), 48, 0, 0, TAU); cx.fill();
    if (o.ears === 'elf') { cx.fillStyle = sk; for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(sx * 36, -18); cx.lineTo(sx * 64, -40); cx.lineTo(sx * 38, -2); cx.fill(); } }
    // eyes
    const bl = ((t + (n.x || 0)) % 3.7) < 0.13 ? 0.12 : 1, eye = o.eye || '#3a6aa0';
    for (const sx of [-1, 1]) {
      cx.fillStyle = '#f8f4ec'; cx.beginPath(); cx.ellipse(sx * 15, -14, 9, 6.5 * bl, 0, 0, TAU); cx.fill();
      cx.fillStyle = eye; if (o.eyeGlow) { cx.shadowColor = eye; cx.shadowBlur = 10; } cx.beginPath(); cx.arc(sx * 15, -14, 4.6 * bl, 0, TAU); cx.fill(); cx.shadowBlur = 0;
      cx.fillStyle = '#0b0805'; cx.beginPath(); cx.arc(sx * 15, -14, 2 * bl, 0, TAU); cx.fill();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(sx * 15 + 2, -16, 1.4 * bl, 0, TAU); cx.fill();
      cx.strokeStyle = shade(hr, -0.1); cx.lineWidth = 3; cx.beginPath(); cx.moveTo(sx * 7, -26 - (o.scar && sx > 0 ? 2 : 0)); cx.lineTo(sx * 24, -27 + (n.id === 'ren' ? -3 : 0)); cx.stroke();
    }
    if (o.glasses) { cx.strokeStyle = '#c9ced8'; cx.lineWidth = 2; for (const sx of [-1, 1]) { cx.beginPath(); cx.arc(sx * 15, -14, 11, 0, TAU); cx.stroke(); } cx.beginPath(); cx.moveTo(-4, -14); cx.lineTo(4, -14); cx.stroke(); }
    if (o.scar) { cx.strokeStyle = '#8a4a3a'; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(22, -34); cx.lineTo(10, -2); cx.stroke(); }
    cx.fillStyle = shade(sk, -0.12); cx.beginPath(); cx.moveTo(0, -8); cx.lineTo(-4, 4); cx.lineTo(4, 4); cx.fill();
    if (!o.beard) { cx.fillStyle = 'rgba(255,120,120,.18)'; for (const sx of [-1, 1]) { cx.beginPath(); cx.ellipse(sx * 22, 2, 7, 4, 0, 0, TAU); cx.fill(); } }
    const mo = talking ? Math.abs(Math.sin(t * 16)) * 5 + 1 : 1;
    cx.fillStyle = '#6a2a24'; cx.beginPath(); cx.ellipse(0, 16, 8, mo, 0, 0, TAU); cx.fill();
    if (o.beard) { cx.fillStyle = o.beard; cx.beginPath(); cx.moveTo(-36, -2); cx.quadraticCurveTo(-30, 50, 0, 58); cx.quadraticCurveTo(30, 50, 36, -2); cx.quadraticCurveTo(20, 24, 0, 24); cx.quadraticCurveTo(-20, 24, -36, -2); cx.fill(); cx.fillStyle = '#6a2a24'; cx.beginPath(); cx.ellipse(0, 16, 7, mo * 0.8, 0, 0, TAU); cx.fill(); }
    // hair front
    cx.fillStyle = hr;
    if (o.hs === 'hood') { cx.fillStyle = o.hood || o.cloth; cx.beginPath(); cx.ellipse(0, -26, 54, 66, 0, PI * 0.95, PI * 2.05); cx.lineTo(48, 40); cx.lineTo(-48, 40); cx.fill(); }
    else if (o.hs !== 'bald') {
      cx.beginPath(); cx.ellipse(0, -40, 44, 30, 0, PI, TAU); cx.fill();
      const spikes = o.hs === 'spiky' ? 9 : o.hs === 'mane' ? 11 : 6;
      for (let i = 0; i < spikes; i++) { const x = -40 + (i / (spikes - 1)) * 80, len = o.hs === 'spiky' ? 26 : 16; cx.beginPath(); cx.moveTo(x - 9, -46); cx.lineTo(x + (o.hs === 'spiky' ? (i % 2 ? 8 : -8) : 3), -46 + (i % 2 ? len * 0.5 : len) * (o.hs === 'spiky' ? -1 : 1) + (o.hs === 'spiky' ? 0 : 6)); cx.lineTo(x + 9, -46); cx.fill(); }
      if (o.hs === 'spiky') for (let i = 0; i < 5; i++) { const x = -30 + i * 15; cx.beginPath(); cx.moveTo(x - 7, -50); cx.lineTo(x + 2, -26); cx.lineTo(x + 7, -50); cx.fill(); }
      if (o.hs === 'long' || o.hs === 'mane') for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(sx * 40, -40); cx.quadraticCurveTo(sx * 52, 10, sx * 40, 50); cx.lineTo(sx * 30, 40); cx.quadraticCurveTo(sx * 40, 0, sx * 34, -30); cx.fill(); }
      if (o.hs === 'bun') { cx.beginPath(); cx.arc(0, -78, 16, 0, TAU); cx.fill(); }
    }
    if (o.ears === 'wolf') for (const sx of [-1, 1]) { cx.fillStyle = hr; cx.beginPath(); cx.moveTo(sx * 18, -60); cx.lineTo(sx * 40, -98); cx.lineTo(sx * 44, -52); cx.fill(); cx.fillStyle = '#e8c8b0'; cx.beginPath(); cx.moveTo(sx * 25, -62); cx.lineTo(sx * 39, -88); cx.lineTo(sx * 40, -58); cx.fill(); }
    if (o.crown) { cx.fillStyle = '#ffcf40'; cx.beginPath(); cx.moveTo(-38, -58); for (let i = 0; i <= 6; i++) { const x = -38 + i * 12.6; cx.lineTo(x, i % 2 ? -72 : -88); } cx.lineTo(38, -58); cx.closePath(); cx.fill(); cx.fillStyle = '#ff2a4a'; cx.beginPath(); cx.arc(0, -66, 4.5, 0, TAU); cx.fill(); }
    if (o.hat === 'helmet') { cx.fillStyle = o.armor || '#9aa0aa'; cx.beginPath(); cx.ellipse(0, -44, 46, 36, 0, PI, TAU); cx.fill(); cx.fillRect(-4, -48, 8, 40); cx.fillStyle = o.plume || '#c62828'; cx.beginPath(); cx.ellipse(0, -86, 8, 16, 0, 0, TAU); cx.fill(); }
    if (o.hat === 'wizard') { cx.fillStyle = o.hatC || o.cloth; cx.beginPath(); cx.moveTo(-60, -50); cx.lineTo(60, -50); cx.lineTo(10, -124); cx.closePath(); cx.fill(); cx.fillStyle = tr; cx.fillRect(-48, -56, 96, 6); }
    if (o.hat === 'circlet') { cx.strokeStyle = '#dfe6f2'; cx.lineWidth = 3; cx.beginPath(); cx.ellipse(0, -46, 42, 10, 0, PI, TAU); cx.stroke(); cx.fillStyle = o.gem || '#7df9ff'; cx.shadowColor = cx.fillStyle; cx.shadowBlur = 10; cx.beginPath(); cx.arc(0, -55, 4, 0, TAU); cx.fill(); cx.shadowBlur = 0; }
    if (o.hat === 'kerchief' || o.hat === 'cap') { cx.fillStyle = o.hatC || '#c62828'; cx.beginPath(); cx.ellipse(0, -50, 46, 26, 0, PI, TAU); cx.fill(); }
    if (o.hat === 'straw') { cx.fillStyle = '#d8b45a'; cx.beginPath(); cx.ellipse(0, -52, 74, 12, 0, 0, TAU); cx.fill(); cx.beginPath(); cx.ellipse(0, -64, 36, 22, 0, PI, TAU); cx.fill(); }
    cx.restore();
    const vg = cx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 160); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
  }

  /* ---------------- dialogue controller ---------------- */
  const D = { open: false, npc: null, lines: [], li: 0, full: '', shown: 0, typing: false, next: null, acts: null, waiting: false, spk: 'c', t: 0, block: 0, opts: {} };
  const dEl = document.createElement('div'); dEl.id = 'qdlg';
  dEl.innerHTML = '<div class="lb t"></div><div class="lb b"></div><div class="qb"><canvas width="224" height="252"></canvas><div class="qc"><div class="qh"><span class="qn"></span><span class="qs"></span></div><div class="qt"></div><div class="qx">▼</div><div class="qa"></div></div></div>';
  document.body.appendChild(dEl);
  const dE = { cv: dEl.querySelector('canvas'), name: dEl.querySelector('.qn'), sub: dEl.querySelector('.qs'), text: dEl.querySelector('.qt'), nx: dEl.querySelector('.qx'), acts: dEl.querySelector('.qa'), box: dEl.querySelector('.qb') };
  const dCx = dE.cv.getContext('2d');
  dE.box.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target.closest('button')) return; D.advance(); });
  D.start = function (npc, opts) {
    if (D.open) D.close(true);
    D.open = true; D.npc = npc; D.opts = opts || {}; D.acts = null; D.waiting = false; D.lines = []; D.next = null;
    dEl.className = 'on' + (D.opts.cine ? ' cine' : '');
    dE.acts.innerHTML = ''; dE.text.textContent = '';
    if (API.state === 'play') API.state = 'menu';
    if (API.input) API.input.lock = null;
    if (npc && npc.cur && dist(npc.cur.x, npc.cur.z) < 12) { npc.talkT = 999; try { API.input.yaw = Math.atan2(P.x - npc.cur.x, P.z - npc.cur.z) + 0.35; } catch (e) { /* ignore */ } emitEv('3d:talk', { npcId: npc.id }); }
    sfx('ui', { vol: 0.5 });
    startTick();
  };
  function parse(raw) {
    let s = String(raw), spk = 'c';
    if (s.startsWith('n:')) { spk = 'n'; s = s.slice(2); } else if (s.startsWith('p:')) { spk = 'p'; s = s.slice(2); } else if (s.startsWith('o:')) { spk = 'o'; s = s.slice(2); }
    const mm = /^@(\w+):/.exec(s); if (mm) { spk = mm[1]; s = s.slice(mm[0].length); }
    return { spk, txt: s.replace(/\{P\}/g, pname()).trim() };
  }
  D.say = function (lines, next, meta) {
    if (!D.open) return;
    if (meta && meta.rep) for (const k in meta.rep) QS.rep[k] = (QS.rep[k] || 0) + meta.rep[k];
    const flat = []; let ask = null;
    for (const l of (Array.isArray(lines) ? lines : [lines])) { if (l && typeof l === 'object' && l.ask) { ask = { opts: l.ask, rest: (Array.isArray(lines) ? lines : []).slice((Array.isArray(lines) ? lines : []).indexOf(l) + 1) }; break; } flat.push(l); }
    if (ask) {
      D.lines = flat.map(parse); D.li = 0; D.acts = null;
      D.next = null;
      D.after = () => D.choices(ask.opts.map((a) => ({ t: a.t, s: a.s, fn: () => a.fn({ say: (ls, nx, mt) => D.say(ls, () => D.say(ask.rest, next), mt) }) })));
    } else { D.lines = flat.map(parse); D.li = 0; D.next = next || null; D.after = null; }
    if (!D.lines.length) { if (D.after) D.after(); else if (D.next) D.next(); else D.close(); return; }
    D.waiting = false; dE.acts.innerHTML = '';
    showLine();
  };
  function showLine() {
    const L = D.lines[D.li]; D.spk = L.spk; D.full = L.txt; D.shown = 0; D.typing = true;
    dE.text.className = 'qt' + (L.spk === 'n' ? ' nar' : L.spk === 'o' ? ' orc' : '');
    let nm = '', sub = '', col = '#ffe7a8';
    if (L.spk === 'p') { nm = pname(); sub = 'Tu'; col = '#9fe8ff'; }
    else if (L.spk === 'o') { nm = '《 Oracolo 》'; sub = 'Abilità Unica'; col = '#7fd4ff'; }
    else if (L.spk === 'n') { nm = ''; sub = ''; }
    else { const n = L.spk === 'c' ? D.npc : NPCS[L.spk]; if (n) { nm = n.name; sub = n.title; col = n.color || col; } }
    dE.name.textContent = nm; dE.name.style.color = col; dE.sub.textContent = sub;
    dE.cv.style.visibility = L.spk === 'n' ? 'hidden' : 'visible';
    dE.text.textContent = ''; dE.nx.style.visibility = 'hidden';
    if (L.spk === 'o') sfx('oracle', { vol: 0.5 });
  }
  D.advance = function () {
    if (!D.open || performance.now() < D.block) return;
    if (D.typing) { D.shown = D.full.length; return; }
    if (D.waiting) return;
    if (D.li < D.lines.length - 1) { D.li++; showLine(); sfx('ui', { vol: 0.22 }); return; }
    if (D.after) { const a = D.after; D.after = null; a(); return; }
    if (D.next) { const n = D.next; D.next = null; n(); return; }
    D.close();
  };
  D.choices = function (list) {
    if (!D.open) return;
    D.waiting = true; D.acts = list; dE.acts.innerHTML = ''; dE.nx.style.visibility = 'hidden';
    list.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = (a.off ? 'off' : '') + (a.pri ? ' pri' : '');
      b.innerHTML = `<em>${i + 1}</em>${a.t}${a.s ? `<small>${a.s}</small>` : ''}`;
      b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      b.addEventListener('click', (ev) => { ev.stopPropagation(); D.pick(i); });
      dE.acts.appendChild(b);
    });
  };
  D.pick = function (i) {
    const a = D.acts && D.acts[i]; if (!a || !D.waiting) return;
    if (a.off) { toast(typeof a.off === 'string' ? a.off : 'Non disponibile'); sfx('uiBack'); return; }
    D.waiting = false; D.acts = null; dE.acts.innerHTML = ''; sfx('select'); a.fn();
  };
  D.close = function (silent) {
    if (!D.open) return;
    D.open = false; D.waiting = false; D.typing = false;
    dEl.className = '';
    if (D.npc) D.npc.talkT = 0.8;
    const cb = D.opts && D.opts.onClose; D.npc = null; D.opts = {};
    if (API.state === 'menu' && !anyPanel()) API.state = 'play';
    D.block = performance.now() + 350; blockUntil = performance.now() + 450;
    if (!silent) sfx('uiBack', { vol: 0.35 });
    if (cb) try { cb(); } catch (e) { console.error(e); }
    markDirty();
  };
  let tickOn = false, tickLast = 0, blockUntil = 0;
  function startTick() { if (tickOn) return; tickOn = true; tickLast = performance.now(); requestAnimationFrame(tick); }
  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - tickLast) / 1000)); tickLast = now;
    try {
      if (D.open) {
        D.t += dt;
        if (D.typing) {
          const before = Math.floor(D.shown); D.shown = D.fast ? D.full.length : Math.min(D.full.length, D.shown + dt * 48);
          const n = Math.floor(D.shown);
          if (n !== before) { dE.text.textContent = D.full.slice(0, n); if (n % 3 === 0 && D.spk !== 'n') sfx('ui', { vol: 0.04, pitch: D.spk === 'o' ? 2.2 : 1.6 }); }
          if (n >= D.full.length) {
            D.typing = false; dE.text.textContent = D.full;
            if (D.li >= D.lines.length - 1 && D.after) { const a = D.after; D.after = null; a(); }
            else dE.nx.style.visibility = 'visible';
          }
        }
        if (((D.pf = (D.pf || 0) + 1) & 1) === 0 && D.spk !== 'n') drawPortrait(dCx, D.spk === 'c' ? (D.npc ? D.npc.id : 'king') : D.spk, D.t, D.typing);
        if (API.state === 'menu' && D.npc && D.npc.m) tickNpcs(dt, now);
      }
    } catch (e) { console.error('[quests3d tick]', e); }
    if (D.open) requestAnimationFrame(tick); else tickOn = false;
  }
  window.addEventListener('keydown', (ev) => {
    if (D.open) {
      ev.stopPropagation();
      if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'KeyE') { ev.preventDefault(); if (ev.repeat) return; if (D.waiting && D.acts && D.acts.length === 1) { D.pick(0); return; } D.advance(); }
      else if (/^Digit[1-9]$/.test(ev.code) && D.waiting) D.pick(+ev.code.slice(5) - 1);
      else if (ev.code === 'Escape' && !(D.opts && D.opts.cine)) D.close();
      return;
    }
    if (logOpen || boardOpen) {
      if (ev.code === 'Escape' || (ev.code === 'KeyL' && logOpen)) { ev.stopPropagation(); closePanels(); }
      else if (ev.code !== 'Tab') ev.stopPropagation();
      return;
    }
    if (ev.code === 'KeyL' && !ev.repeat && API.state === 'play') { ev.stopPropagation(); openLog(); }
  }, true);

  /* ---------------- NPC conversation flow ---------------- */
  function rewText(rew, d) {
    const p = [], gp = rew.gp || (d && d.kind === 'side' ? 8 + (d.lvl | 0) : d && GP_MAIN[d.id] || 0);
    if (rew.xp) p.push(fmt(rew.xp) + ' XP'); if (rew.gold) p.push(fmt(rew.gold) + ' anime'); if (gp) p.push(gp + ' PG');
    if (rew.loot) p.push(rew.loot + (rew.loot > 1 ? ' oggetti' : ' oggetto')); if (rew.rank != null) p.push('Rango ' + RANKS[rew.rank].l);
    if (rew.title) p.push('Titolo');
    return p.join(' · ');
  }
  function talk(n) {
    if (performance.now() < blockUntil) return;
    D.start(n, { cine: !!(n.main || n.hero) && hasStoryFor(n) });
    talkMenu(n, true);
  }
  function hasStoryFor(n) {
    for (const id in QS.q) { const d = def(id); if (!d || d.kind !== 'main') continue; const stg = stageOf(id); if (stg && stg.objs.some((o) => o.t === 'talk' && o.npc === n.id)) return true; }
    return false;
  }
  function talkMenu(n, first) {
    // 1) turn-ins
    for (const id in QS.q) {
      const r = QS.q[id], d = def(id);
      if (d && r.s === 'done' && d.turnIn === n.id) {
        if (d.kind === 'main') { D.opts.cine = true; dEl.className = 'on cine'; }
        D.say(d.done || ['Ottimo lavoro!'], () => { D.close(); turnIn(id); });
        return;
      }
    }
    // 2) talk objectives
    for (const id in QS.q) {
      const stg = stageOf(id); if (!stg) continue;
      const r = rec(id);
      for (let i = 0; i < stg.objs.length; i++) {
        const o = stg.objs[i];
        if (o.t !== 'talk' || o.npc !== n.id || r.p[i] >= 1 || !objActive(id, i)) continue;
        if (o.fn === 'register') {
          if (QS.guild.reg) { D.say(['Sei già registrato, ' + pname() + '! Annoto tutto per il Re: la tua Tessera è in regola.'], () => { D.close(); progress(id, i, 1); }); return; }
          guildRegister(n, () => progress(id, i, 1)); return;
        }
        if (o.start) try { o.start(); } catch (e) { console.error(e); }
        D.opts.cine = def(id).kind === 'main'; dEl.className = 'on' + (D.opts.cine ? ' cine' : '');
        D.say(o.say || ['…'], () => { D.close(); progress(id, i, 1); });
        return;
      }
    }
    // 3) offers + menu
    const acts = [];
    const offers = ORDER.filter((id) => DEFS[id].giver === n.id && !DEFS[id].auto && available(id) && DEFS[id].kind !== 'guild');
    for (const id of offers) { const d = DEFS[id]; acts.push({ t: '❗ ' + d.title, s: 'Missione secondaria · Lv. ' + d.lvl + ' · ' + rewText(d.rew, d), pri: true, fn: () => offer(n, id) }); }
    if (n.guild) { guildMenu(n, first); return; }
    for (const id in QS.q) { const r = QS.q[id], d = def(id); if (d && r.s === 'active' && d.turnIn === n.id && d.giver === n.id) acts.push({ t: '… ' + d.title, s: 'In corso: ' + d.stages[r.st].text, fn: () => D.say([progressLine(id)], () => talkMenu(n)) }); }
    const chat = chatLines(n);
    acts.push({ t: 'Chiacchiera', s: '', fn: () => D.say([chat[(Math.random() * chat.length) | 0]], () => talkMenu(n)) });
    acts.push({ t: 'Arrivederci', s: '', fn: () => D.close() });
    if (first && !offers.length) { D.say([chat[(n.ci = ((n.ci || 0) + 1)) % chat.length]], null); D.after = () => D.choices(acts); return; }
    D.say([offers.length ? 'Ah, proprio te cercavo. Hai un momento?' : chat[0]], null); D.after = () => D.choices(acts);
  }
  function progressLine(id) { const d = def(id), r = rec(id), stg = d.stages[r.st]; const left = stg.objs.map((o, i) => (r.p[i] >= (o.n || 1) ? null : objLabel(o) + (o.n > 1 ? ` (${r.p[i]}/${o.n})` : ''))).filter(Boolean); return 'Come procede? Ti manca ancora: ' + left.join(', ') + '.'; }
  function offer(n, id) {
    const d = DEFS[id];
    D.say(d.intro || [d.desc], null);
    D.after = () => D.choices([
      { t: 'Accetta: ' + d.title, s: 'Ricompense: ' + rewText(d.rew, d), pri: true, fn: () => { accept(id); D.say(['Grazie! Conto su di te.'], () => D.close()); } },
      { t: 'Non ora', s: '', fn: () => D.say(['Capisco. Se cambi idea, sai dove trovarmi.'], () => talkMenu(n)) },
    ]);
  }
  function guildRegister(n, done) {
    D.say(['Benvenuto alla Gilda degli Avventurieri di Altheria! Sono Elina, la receptionist.', 'Il Re mi ha avvisata: sei il Quarto Evocato. Che emozione! Non ho mai registrato uno slime. Hai… una mano per firmare?', 'p:Posso formarne una.', 'Perfetto! Allora: nome… ' + pname() + '. Razza… "slime, ma speciale". Classe… la lascio in bianco, sembri il tipo che la cambia spesso.', 'n:Elina posa un cristallo sul bancone. Si illumina di una luce così intensa che mezza sala si volta.', 'Ehm. Il cristallo dice che il tuo potenziale è… "errore". Non l\'avevo mai visto. Facciamo che è un buon segno!', 'Ecco la tua Tessera della Gilda. Parti dal Rango F: completa incarichi, guadagna Punti Gilda e affronta gli esami per salire fino al Rango S.', 'Gli incarichi sono sulla bacheca qui accanto. Torna da me per consegnarli. Buona caccia!'], () => {
      QS.guild.reg = true; QS.guild.rank = Math.max(0, QS.guild.rank); refreshOffers(true); save();
      D.close(); done && done();
      setTimeout(() => rankUpFx(0, true), 500);
    });
  }
  function guildMenu(n, first) {
    const G = QS.guild, acts = [];
    if (!G.reg) {
      if (!QS.q.m1 || QS.q.m1.s === 'turned' || !QS.q.m1) acts.push({ t: 'Registrati come avventuriero', s: 'Ottieni la Tessera della Gilda (Rango F)', pri: true, fn: () => guildRegister(n, () => { /* free registration */ }) });
    } else {
      const ready = Object.keys(QS.q).filter((id) => QS.q[id].s === 'done' && def(id) && def(id).turnIn === 'elina');
      if (ready.length) acts.push({ t: '✔ Consegna incarichi (' + ready.length + ')', s: 'Ricevi ricompense e Punti Gilda', pri: true, fn: () => deliverAll(ready) });
      const ex = ORDER.find((id) => DEFS[id].exam != null && available(id));
      if (ex) acts.push({ t: '♜ ' + DEFS[ex].title, s: 'Promozione al Rango ' + RANKS[DEFS[ex].exam].l, pri: true, fn: () => offer(n, ex) });
      acts.push({ t: '📜 Bacheca degli incarichi', s: 'Contratti di Rango ' + RANKS[G.rank].l + ' · attivi ' + activeContracts().length + '/3', fn: () => { D.close(true); openBoard(); } });
      acts.push({ t: 'La mia Tessera', s: 'Rango ' + RANKS[G.rank].l + ' · ' + G.pts + ' PG', fn: () => { D.close(true); openLog('guild'); } });
    }
    acts.push({ t: 'Chiacchiera', fn: () => { const c = chatLines(n); D.say([c[(Math.random() * c.length) | 0]], () => guildMenu(n)); } });
    acts.push({ t: 'Arrivederci', fn: () => D.close() });
    const greet = !G.reg ? 'Benvenuto! Vuoi registrarti come avventuriero?' : first ? `Bentornato, avventuriero di Rango ${RANKS[G.rank].l}! Come posso aiutarti?` : 'Altro?';
    D.say([greet], null); D.after = () => D.choices(acts);
  }
  function deliverAll(ids) {
    const id = ids[0], d = def(id);
    D.say(d.done || ['Ottimo lavoro!'], () => { turnIn(id); const rest = ids.slice(1).filter((x) => QS.q[x] && QS.q[x].s === 'done'); if (rest.length) deliverAll(rest); else D.say(['Tutto registrato! La Gilda è fiera di te.'], () => D.close()); });
  }
  function activeContracts() { return Object.keys(QS.q).filter((id) => QS.cdefs[id] && QS.q[id].s !== 'turned'); }
  function rankUpFx(r, reg) {
    const R0 = RANKS[r];
    banner(reg ? 'TESSERA DELLA GILDA' : 'PROMOZIONE', reg ? 'Avventuriero di Rango F' : `Rango ${R0.l} · ${R0.n}`, [['♜', 'Rango ' + R0.l, R0.c]], 'rank');
    celebrate(R0.c); sfx('levelup');
    oracle(reg ? '《Tessera della Gilda acquisita. Rango attuale: F. Margine di crescita: illimitato.》' : `《Promozione confermata: Rango ${R0.l}. Nuovi contratti disponibili.》`, true);
    refreshOffers(true);
  }

  /* ============================================================ banners / chapter card */
  const banEl = document.createElement('div'); banEl.id = 'qban'; document.body.appendChild(banEl);
  const cardEl = document.createElement('div'); cardEl.id = 'qcard'; cardEl.innerHTML = '<div class="c1"></div><div class="c2"></div><div class="c3"></div><div class="c4"></div>'; document.body.appendChild(cardEl);
  const banQ = []; let banBusy = false;
  function banner(title, sub, rew, cls) { banQ.push({ title, sub, rew, cls }); if (!banBusy) nextBanner(); }
  function nextBanner() {
    const b = banQ.shift(); if (!b) { banBusy = false; return; }
    banBusy = true;
    banEl.className = ''; void banEl.offsetWidth;
    banEl.innerHTML = `<div class="b1">${esc(b.title)}</div><div class="b0"></div><div class="b2">${esc(b.sub || '')}</div>` +
      (b.rew && b.rew.length ? `<div class="b3">${b.rew.map((r) => `<span style="color:${r[2] || '#efe3c0'}">${r[0]} ${esc(r[1])}</span>`).join('')}</div>` : '');
    banEl.className = 'on ' + (b.cls || '');
    setTimeout(nextBanner, b.cls === 'new' ? 3000 : 4700);
  }
  function chapterCard(d) {
    cardEl.querySelector('.c1').textContent = d.ch || 'Missione';
    cardEl.querySelector('.c2').textContent = d.title;
    cardEl.querySelector('.c4').textContent = d.desc || '';
    cardEl.classList.add('on'); sfx('bossDie', { vol: 0.35 }); sfx('skillGet');
    setTimeout(() => cardEl.classList.remove('on'), 4600);
  }

  /* ============================================================ HUD tracker */
  const hud = document.getElementById('hud') || document.body;
  const trk = document.createElement('div'); trk.id = 'qtrk'; hud.appendChild(trk);
  trk.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.hd')) { ev.stopPropagation(); if (API.state === 'play') openLog(); } });
  const flashed = {};
  function flashTrack(id) { flashed[id] = performance.now() + 900; trkDirty = true; }
  let trkHtml = '', trkT = 0;
  function renderTracker() {
    let h = `<div class="hd">❖ MISSIONI · L</div>`;
    const ids = QS.track.filter((id) => QS.q[id] && QS.q[id].s !== 'turned' && def(id)).slice(0, 3);
    const now = performance.now();
    for (const id of ids) {
      const d = def(id), r = rec(id);
      const cls = d.kind === 'main' ? 'main' : d.kind === 'guild' ? 'guild' : 'side';
      h += `<div class="q ${cls}${flashed[id] > now ? ' up' : ''}"><div class="t"><i>${d.kind === 'main' ? (d.ch || '').toUpperCase() : d.kind === 'guild' ? 'GILDA' : 'SECONDARIA'}</i>${esc(d.title)}</div>`;
      if (r.s === 'done') { const n = NPCS[d.turnIn]; h += n ? `<div class="o ready">? Torna da ${esc(n.name)}${distTxt(n.cur)}</div>` : `<div class="o ready">✔ Completata</div>`; }
      else {
        const stg = d.stages[r.st];
        stg.objs.forEach((o, i) => {
          if (!objActive(id, i) && stg.seq) return;
          const need = o.n || 1, ok = r.p[i] >= need;
          const pos = ok ? null : objPos(id, o, i);
          h += `<div class="o${ok ? ' ok' : ''}">${esc(objLabel(o))}${need > 1 ? ` <b>${Math.min(r.p[i], need)}/${need}</b>` : ''}${ok ? '' : distTxt(pos)}</div>`;
          if (o.t === 'escort' && ESC && ESC.tag === id + '#' + i && ESC.started) h += `<div class="hp"><i style="width:${Math.max(0, ESC.hp)}%"></i></div>`;
        });
      }
      h += '</div>';
    }
    if (!ids.length) h += `<div class="q"><div class="o" style="opacity:.7">Nessuna missione tracciata</div></div>`;
    if (h !== trkHtml) { trkHtml = h; trk.innerHTML = h; }
  }
  function distTxt(p) { if (!p || p.x == null) return ''; const d = dist(p.x, p.z); if (d < 6) return ''; return ` <u>· ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1) + ' km'}</u>`; }
  // touch button
  const touchEl = document.getElementById('touch');
  if (touchEl) {
    const b = document.createElement('div'); b.className = 'tbtn'; b.id = 'qlogb'; b.innerHTML = 'Diario';
    b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (API.state === 'play') openLog(); });
    touchEl.appendChild(b);
  }

  /* ============================================================ waypoints: compass + map markers + beam */
  const myCmp = [], myMap = [];
  function rebuildMarkers() {
    const C = API.compassMarkers, M = API.mapMarkers;
    for (const m of myCmp) { const i = C.indexOf(m); if (i >= 0) C.splice(i, 1); }
    for (const m of myMap) { const i = M.indexOf(m); if (i >= 0) M.splice(i, 1); }
    myCmp.length = 0; myMap.length = 0;
    const ids = QS.track.filter((id) => QS.q[id] && QS.q[id].s !== 'turned' && def(id)).slice(0, 3);
    for (const id of ids) {
      const d = def(id), r = rec(id);
      const col = d.kind === 'main' ? '#ffd36b' : d.kind === 'guild' ? '#58c8ff' : '#ffe7a8';
      if (r.s === 'done' || !d.stages[r.st]) { const n = NPCS[d.turnIn]; if (n && r.s === 'done') { const m = { x: n.cur.x, z: n.cur.z, label: '?', color: col, q: id, quest: true }; myCmp.push(m); myMap.push({ x: n.cur.x, z: n.cur.z, label: '? ' + d.title, color: col, quest: true }); } continue; }
      const stg = d.stages[r.st];
      stg.objs.forEach((o, i) => {
        if (r.p[i] >= (o.n || 1) || !objActive(id, i)) return;
        const p = objPos(id, o, i); if (!p) return;
        const m = { x: p.x, z: p.z, label: d.kind === 'main' ? '◆' : '◇', color: col, q: id, oi: i, quest: true };
        myCmp.push(m); myMap.push({ x: p.x, z: p.z, label: d.title, color: col, quest: true });
      });
    }
    // quest givers with "!" (only nearby-ish, to not flood the compass)
    for (const n of NPC_LIST) if ((n.mkState === 'gold' || n.mkState === 'turn') && dist(n.cur.x, n.cur.z) < 220 && !myCmp.some((m) => Math.abs(m.x - n.cur.x) < 1 && Math.abs(m.z - n.cur.z) < 1)) {
      const m = { x: n.cur.x, z: n.cur.z, label: n.mkState === 'turn' ? '?' : '!', color: '#ffd36b', quest: true }; myCmp.push(m);
    }
    for (const m of myCmp) C.push(m); for (const m of myMap) M.push(m);
  }
  function refreshMarkerPositions() {
    for (const m of myCmp) {
      if (m.q == null || m.oi == null) continue;
      const d = def(m.q), r = rec(m.q); if (!d || !r || r.s !== 'active') continue;
      const o = d.stages[r.st] && d.stages[r.st].objs[m.oi]; if (!o) continue;
      const p = objPos(m.q, o, m.oi); if (p) { m.x = p.x; m.z = p.z; }
    }
  }
  // vertical light beam on the primary objective
  const beamMat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, uniforms: { col: { value: hdr('#ffd36b', 1.6) }, a: { value: 0.0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 col; uniform float a; varying vec2 vUv; void main(){ float f = pow(1.0 - vUv.y, 1.6) * (0.5 + 0.5 * sin(vUv.x * 6.2831 * 3.0)); gl_FragColor = vec4(col * f * a, 1.0); }' });
  const beam = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 90, 12, 1, true), beamMat); beam.visible = false; beam.frustumCulled = false; API.scene.add(beam);
  function tickBeam() {
    const m = myCmp.find((x) => x.q === QS.track[0] && x.oi != null) || myCmp.find((x) => x.q === QS.track[0]);
    if (!m) { beam.visible = false; return; }
    const dd = dist(m.x, m.z);
    beam.visible = dd > 18 && dd < 600;
    if (!beam.visible) return;
    beam.position.set(m.x, API.heightAt(m.x, m.z) + 45, m.z);
    beamMat.uniforms.a.value = clamp((dd - 18) / 40, 0, 1) * 0.32;
    if (beam.userData.c !== m.color) { beam.userData.c = m.color; beamMat.uniforms.col.value.copy(hdr(m.color || '#ffd36b', 1.6)); }
  }
  // draw quest markers on the engine map (#mapc) whenever it opens
  function drawMap() {
    const c = document.getElementById('mapc'); if (!c) return;
    const x = c.getContext('2d'), MR = API.MAPR, W = (v) => (v / MR + 1) * 256;
    x.save(); x.font = 'bold 13px Georgia'; x.textAlign = 'center';
    for (const n of NPC_LIST) { if (!n.mkState || n.mkState === 'wait') continue; x.fillStyle = n.mkState === 'blue' ? '#58c8ff' : '#ffd36b'; x.strokeStyle = '#000'; x.lineWidth = 3; const t = n.mkState === 'turn' ? '?' : '!'; x.strokeText(t, W(n.cur.x), W(n.cur.z) + 4); x.fillText(t, W(n.cur.x), W(n.cur.z) + 4); }
    for (const m of myMap) {
      const px = W(m.x), pz = W(m.z);
      x.fillStyle = m.color || '#ffd36b'; x.strokeStyle = '#120d06'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(px, pz - 8); x.lineTo(px + 6, pz); x.lineTo(px, pz + 8); x.lineTo(px - 6, pz); x.closePath(); x.fill(); x.stroke();
      x.font = '11px Georgia'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(m.label, px, pz - 12); x.fillStyle = '#fff3d0'; x.fillText(m.label, px, pz - 12);
    }
    x.restore();
  }
  const mo = new MutationObserver(() => {
    const mp = document.getElementById('mapp');
    if (mp && !mp.__qobs) { mp.__qobs = true; new MutationObserver(() => { if (mp.classList.contains('open')) drawMap(); }).observe(mp, { attributes: true, attributeFilter: ['class'] }); if (mp.classList.contains('open')) drawMap(); }
  });
  mo.observe(document.body, { childList: true });

  /* ============================================================ QUEST LOG (L) */
  let logOpen = false, boardOpen = false, logTab = 'main', logSel = null;
  const logEl = document.createElement('div'); logEl.className = 'panel'; logEl.id = 'qlog';
  logEl.innerHTML = '<div class="box"><button class="qx-close">✕</button><h2 style="margin:0 0 8px">Diario delle Missioni</h2><div class="qtabs"></div><div class="qbody"><div class="qlist"></div><div class="qdet"></div></div></div>';
  document.body.appendChild(logEl);
  const LE = { tabs: logEl.querySelector('.qtabs'), list: logEl.querySelector('.qlist'), det: logEl.querySelector('.qdet') };
  logEl.querySelector('.qx-close').addEventListener('click', () => closePanels());
  logEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  function anyPanel() { return logOpen || boardOpen; }
  function closePanels() {
    if (logOpen) { logOpen = false; logEl.classList.remove('open'); }
    if (boardOpen) { boardOpen = false; boardEl.classList.remove('open'); }
    if (API.state === 'menu' && !D.open) API.state = 'play';
    blockUntil = performance.now() + 300; sfx('uiBack', { vol: 0.4 });
    markDirty();
  }
  function openLog(tab) {
    if (D.open) return;
    if (tab) logTab = tab;
    logOpen = true; logEl.classList.add('open');
    if (API.state === 'play') API.state = 'menu';
    sfx('ui'); renderLog();
  }
  function questsIn(tab) {
    const out = { act: [], av: [], fin: [] };
    const all = new Set(Object.keys(QS.q).concat(ORDER));
    for (const id of all) {
      const d = def(id); if (!d) continue;
      const kind = d.kind === 'main' ? 'main' : d.kind === 'guild' ? 'guild' : 'side';
      if (kind !== tab) continue;
      const s = stateOf(id);
      if (s === 'active' || s === 'done') out.act.push(id);
      else if (s === 'turned') out.fin.push(id);
      else if (s === 'available' && (tab !== 'guild' || d.exam != null)) out.av.push(id);
    }
    return out;
  }
  function renderLog() {
    const tabs = [['main', '◆ Principali'], ['side', '◇ Secondarie'], ['guild', '⚜ Gilda']];
    LE.tabs.innerHTML = tabs.map(([k, l]) => `<button data-t="${k}" class="${logTab === k ? 'on' : ''}">${l}</button>`).join('');
    LE.tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { logTab = b.dataset.t; logSel = null; sfx('select'); renderLog(); }));
    const L = questsIn(logTab);
    let h = '';
    if (logTab === 'guild') h += guildCardHtml(true);
    const item = (id) => { const d = def(id), s = stateOf(id), r = rec(id); return `<div class="it ${s === 'done' ? 'done' : ''} ${s === 'turned' ? 'turned' : ''} ${logSel === id ? 'sel' : ''}" data-id="${id}"><div class="n">${QS.track.includes(id) ? '❖ ' : ''}${esc(d.title)}</div><div class="s">${s === 'done' ? 'Pronta da consegnare' : s === 'turned' ? 'Completata' : s === 'available' ? 'Disponibile · ' + esc(NPCS[d.giver] ? NPCS[d.giver].name : '') : (d.ch ? d.ch + ' · ' : '') + esc(d.stages[r.st].text)}</div></div>`; };
    if (L.act.length) h += '<div class="sec">In corso</div>' + L.act.map(item).join('');
    if (L.av.length) h += '<div class="sec">Disponibili</div>' + L.av.map(item).join('');
    if (logTab === 'main') {
      const next = ORDER.find((id) => DEFS[id].kind === 'main' && !QS.q[id] && reqOk(DEFS[id]) && lockReason(DEFS[id]));
      if (next) h += `<div class="sec">Bloccata</div><div class="it"><div class="n">🔒 ${esc(DEFS[next].title)}</div><div class="s">${esc(lockReason(DEFS[next]))}</div></div>`;
    }
    if (L.fin.length) h += '<div class="sec">Completate</div>' + L.fin.map(item).join('');
    if (!L.act.length && !L.av.length && !L.fin.length) h += '<div class="muted" style="padding:10px">Nessuna missione qui. Parla con le persone contrassegnate da <b style="color:#ffd36b">!</b></div>';
    LE.list.innerHTML = h;
    LE.list.querySelectorAll('.it[data-id]').forEach((el) => el.addEventListener('click', () => { logSel = el.dataset.id; sfx('select'); renderLog(); }));
    const cg = LE.list.querySelector('.qcardg'); if (cg) cg.addEventListener('click', () => { logSel = null; renderLog(); });
    if (!logSel || !def(logSel)) logSel = L.act[0] || L.av[0] || null;
    renderDetail(logSel);
  }
  function guildCardHtml(small) {
    const G = QS.guild, R0 = RANKS[G.rank], RN = RANKS[G.rank + 1];
    if (!G.reg) return `<div class="qcardg"><div class="qrank" style="background:#555;color:#555">?</div><div><div style="color:#f3d27a">Non registrato</div><div class="muted">Parla con Elina alla Gilda degli Avventurieri (Altheria) per ottenere la Tessera.</div></div></div>`;
    const pct = RN ? clamp((G.pts - R0.pts) / (RN.pts - R0.pts), 0, 1) * 100 : 100;
    return `<div class="qcardg"><div class="qrank" style="background:radial-gradient(circle at 35% 30%,#fff,${R0.c} 55%,${shade(R0.c, -0.25)});color:${R0.c}"><span style="color:#120d06">${R0.l}</span></div>
      <div style="flex:1;min-width:0"><div style="color:#f3d27a;font-size:${small ? 14 : 16}px;letter-spacing:1px">TESSERA DELLA GILDA</div><div style="font-size:13px">${esc(pname())} · Rango ${R0.l} — ${R0.n}</div>
      <div class="muted" style="font-size:11.5px">${G.pts} Punti Gilda${RN ? ' · prossimo esame a ' + RN.pts + ' PG (Rango ' + RN.l + ')' : ' · Rango massimo'} · Incarichi completati: ${QS.stats.contracts}</div><div class="qpts"><i style="width:${pct}%"></i></div></div></div>`;
  }
  function renderDetail(id) {
    if (!id) {
      let h = '<h3>Reputazione</h3><div class="sub">Le tue azioni non passano inosservate.</div>';
      for (const k in FACTIONS) { const v = QS.rep[k] || 0; h += `<div class="ob" style="padding-left:4px">${FACTIONS[k]}: <b style="color:#e8c8ff;font-weight:normal">${v}</b> · ${repTitle(v)}</div>`; }
      if (QS.titles.length) h += `<div class="stg">Titoli</div>` + QS.titles.map((t) => `<div class="ob ok">${esc(t)}</div>`).join('');
      LE.det.innerHTML = h; return;
    }
    const d = def(id), s = stateOf(id), r = rec(id);
    let h = `<h3>${esc(d.title)}</h3><div class="sub">${d.kind === 'main' ? '◆ ' + esc(d.ch || 'Missione principale') : d.kind === 'guild' ? '⚜ Gilda' + (d.crank != null ? ' · Contratto di Rango ' + RANKS[d.crank].l : '') : '◇ Missione secondaria'} · Lv. consigliato ${d.lvl || 1}${NPCS[d.giver] ? ' · ' + esc(NPCS[d.giver].name) : ''}</div>`;
    h += `<p>${esc(d.desc || '')}</p>`;
    if (r) {
      d.stages.forEach((st, k) => {
        if (k > r.st && r.s === 'active') return;
        h += `<div class="stg">${k < r.st || r.s !== 'active' ? '✔ ' : ''}${esc(st.text)}</div>`;
        if (k === r.st && r.s === 'active') st.objs.forEach((o, i) => { const need = o.n || 1, ok = r.p[i] >= need; h += `<div class="ob ${ok ? 'ok' : ''}">${esc(objLabel(o))}${need > 1 ? ` — ${Math.min(r.p[i], need)}/${need}` : ''}${ok ? '' : distTxt(objPos(id, o, i))}</div>`; });
      });
      if (r.s === 'done' && NPCS[d.turnIn]) h += `<div class="ob" style="color:#ffd84a">Torna da ${esc(NPCS[d.turnIn].name)} per la ricompensa.</div>`;
    } else if (s === 'available') h += `<div class="ob">Parla con ${esc(NPCS[d.giver] ? NPCS[d.giver].name : '?')} per iniziare.</div>`;
    const rw = d.rew || {}, chips = [];
    if (rw.xp) chips.push(`<span style="color:#9fe8ff">✦ ${fmt(rw.xp)} XP</span>`); if (rw.gold) chips.push(`<span style="color:#ffd36b">◈ ${fmt(rw.gold)} anime</span>`);
    const gpv = rw.gp || (d.kind === 'side' ? 8 + (d.lvl | 0) : GP_MAIN[d.id] || 0);
    if (gpv) chips.push(`<span style="color:#9cff9a">⚜ ${gpv} PG</span>`); if (rw.loot) chips.push(`<span style="color:#ffb36b">⚔ ${rw.loot} oggett${rw.loot > 1 ? 'i' : 'o'} (Lv. ${rw.ilvl || 1})</span>`);
    if (rw.rank != null) chips.push(`<span style="color:${RANKS[rw.rank].c}">♜ Rango ${RANKS[rw.rank].l}</span>`);
    if (rw.rep) for (const k in rw.rep) chips.push(`<span style="color:#e8c8ff">♛ ${FACTIONS[k]} +${rw.rep[k]}</span>`);
    if (rw.title) chips.push(`<span style="color:#ffe7a8">❖ ${esc(rw.title)}</span>`);
    h += `<div class="stg">Ricompense</div><div class="rw">${chips.join('')}</div>`;
    if (r && r.s !== 'turned') {
      h += '<div class="act">';
      h += `<button data-a="track">${QS.track.includes(id) ? 'Smetti di tracciare' : 'Traccia (max 3)'}</button>`;
      if (d.kind !== 'main') h += `<button data-a="ab">Abbandona</button>`;
      h += '</div>';
    }
    LE.det.innerHTML = h;
    LE.det.querySelectorAll('button[data-a]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === 'track') { if (QS.track.includes(id)) QS.track = QS.track.filter((t) => t !== id); else { QS.track.unshift(id); if (QS.track.length > 3) QS.track.length = 3; } sfx('select'); }
      else if (b.dataset.a === 'ab') { if (b.dataset.c) { abandon(id); logSel = null; } else { b.dataset.c = '1'; b.textContent = 'Conferma abbandono'; return; } }
      markDirty(); save(); renderLog();
    }));
  }
  function repTitle(v) { return v >= 100 ? 'Venerato' : v >= 60 ? 'Onorato' : v >= 30 ? 'Rispettato' : v >= 10 ? 'Amichevole' : 'Neutrale'; }

  /* ============================================================ CONTRACT BOARD */
  const boardEl = document.createElement('div'); boardEl.className = 'panel'; boardEl.id = 'qboard';
  boardEl.innerHTML = '<div class="box"><button class="qx-close">✕</button><h2 style="margin:0 0 8px">Bacheca degli Incarichi</h2><div class="qbh"></div><div class="qgrid"></div><div class="qrow"></div></div>';
  document.body.appendChild(boardEl);
  boardEl.querySelector('.qx-close').addEventListener('click', () => closePanels());
  boardEl.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  const BE = { h: boardEl.querySelector('.qbh'), grid: boardEl.querySelector('.qgrid'), row: boardEl.querySelector('.qrow') };
  const KIND_N = { sub: ['⚔', 'Sottomissione'], hunt: ['☠', 'Caccia'], col: ['✋', 'Raccolta'], herb: ['❀', 'Raccolta'], esc: ['⛨', 'Scorta'], exp: ['✧', 'Esplorazione'], rift: ['◎', 'Crepa'], dun: ['▲', 'Dungeon'] };
  function openBoard() {
    if (D.open) return;
    if (!QS.guild.reg) { toast('Devi prima registrarti alla Gilda (parla con Elina)'); sfx('uiBack'); return; }
    refreshOffers(false);
    boardOpen = true; boardEl.classList.add('open');
    if (API.state === 'play') API.state = 'menu';
    sfx('ui'); renderBoard();
  }
  function renderBoard() {
    const G = QS.guild, act = activeContracts();
    BE.h.innerHTML = guildCardHtml(false);
    let h = '';
    for (const id of act) {
      const d = def(id), r = rec(id), [ic, kn] = KIND_N[d.contract] || ['✦', ''];
      const st = r.s === 'done' ? '<b style="color:#1a6a2a">✔ Completato — consegna</b>' : d.stages[r.st].objs.map((o, i) => `${esc(objLabel(o))} ${(o.n || 1) > 1 ? r.p[i] + '/' + o.n : ''}`).join('<br>');
      h += `<div class="qct act"><div class="rk" style="background:${RANKS[d.crank].c}">${RANKS[d.crank].l}</div><div class="ty">${ic} ${kn} · in corso</div><div class="ti">${esc(d.title)}</div><div class="de">${st}</div>
        <div class="re">${rewText(d.rew)}</div>${r.s === 'done' ? `<button data-turn="${id}">Consegna</button>` : `<button data-ab="${id}">Abbandona (−5 PG)</button>`}</div>`;
    }
    G.offers.forEach((o, k) => {
      const [ic, kn] = KIND_N[o.contract] || ['✦', ''], risk = o.crank > G.rank;
      h += `<div class="qct ${risk ? 'risk' : ''} ${o.urgent ? 'urg' : ''}"><div class="rk" style="background:${RANKS[o.crank].c}">${RANKS[o.crank].l}</div><div class="ty">${ic} ${kn}</div><div class="ti">${esc(o.title)}</div><div class="de">${esc(o.desc)}</div>
        <div class="re">Ricompensa: ${rewText(o.rew)}</div><button data-acc="${k}" ${act.length >= 3 ? 'style="opacity:.5"' : ''}>Accetta${risk ? ' (rango superiore!)' : ''}</button></div>`;
    });
    if (!h) h = '<div class="muted">La bacheca è vuota.</div>';
    BE.grid.innerHTML = h;
    const cost = 50 + G.rank * 50;
    BE.row.innerHTML = `<button data-r="1">Rinnova bacheca (${cost} anime)</button><button data-c="1">Chiudi</button>`;
    BE.grid.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => {
      if (activeContracts().length >= 3) { toast('Massimo 3 incarichi attivi'); sfx('uiBack'); return; }
      const o = G.offers.splice(+b.dataset.acc, 1)[0]; if (!o) return;
      QS.cdefs[o.id] = o; accept(o.id); G.offers.push(genContract(clamp(G.rank + (Math.random() < 0.2 ? 1 : 0), 0, 6), G.seed++)); save(); renderBoard();
    }));
    BE.grid.querySelectorAll('[data-turn]').forEach((b) => b.addEventListener('click', () => { turnIn(b.dataset.turn); renderBoard(); }));
    BE.grid.querySelectorAll('[data-ab]').forEach((b) => b.addEventListener('click', () => { if (!b.dataset.c) { b.dataset.c = '1'; b.textContent = 'Conferma'; return; } abandon(b.dataset.ab); renderBoard(); }));
    BE.row.querySelector('[data-r]').addEventListener('click', () => { if (S.runes < cost) { toast('Anime insufficienti'); sfx('uiBack'); return; } S.runes -= cost; refreshOffers(true); sfx('coin'); renderBoard(); });
    BE.row.querySelector('[data-c]').addEventListener('click', () => closePanels());
  }

  /* ============================================================ back button integration */
  const prevBack = window.SKBack;
  window.SKBack = () => { if (D.open) { if (!(D.opts && D.opts.cine)) D.close(); return true; } if (anyPanel()) { closePanels(); return true; } return prevBack ? prevBack() : false; };

  /* ============================================================ plugin hooks */
  let passT = 0, mkRebuildT = 0, huntT = 0;
  function whenFree(fn, delay) {
    const go = () => { if (API.state === 'play' && !D.open && !anyPanel() && !document.querySelector('.panel.open')) fn(); else setTimeout(go, 1200); };
    setTimeout(go, delay || 0);
  }
  function init() {
    spawnNpcs();
    QS.flags.renGone = !!(QS.q.m7 && QS.q.m7.s === 'active' && QS.q.m7.st < 2);
    if (QS.guild.reg) refreshOffers(false);
    whenFree(() => {
      for (const id in QS.q) { const d = def(id); if (d && QS.q[id].s === 'done' && !d.turnIn) turnIn(id); }
      if (!QS.q.m0) accept('m0'); else autoMain();
      checkPassive(); markDirty();
    }, 6500);
  }
  function populate() {
    RT.minions = {};
    for (const k in RT.rifts) { const rf = RT.rifts[k]; if (rf.st === 'wave' || rf.st === 'sealing') rf.st = 'idle'; }
    if (ESC) { removeEscort(); }
  }
  function update(dt) {
    const now = performance.now();
    tickNpcs(dt, now);
    tickRifts(dt);
    tickGather(dt, now);
    tickEscort(dt);
    tickAllies(dt);
    tickBarks(dt);
    tickCrater(dt);
    passT -= dt; if (passT <= 0) { passT = 0.3; checkPassive(); }
    huntT -= dt; if (huntT <= 0) { huntT = 0.8; tickHunts(); }
    mkRebuildT -= dt;
    if (dirty || mkRebuildT <= 0) { dirty = false; mkRebuildT = 2; rebuildMarkers(); } else refreshMarkerPositions();
    tickBeam();
    trkT -= dt; if (trkDirty || trkT <= 0) { trkDirty = false; trkT = 0.35; renderTracker(); }
    if (API.pressed && API.pressed('qlog')) openLog();
  }
  function interactables() {
    if (performance.now() < blockUntil || D.open) return [];
    const out = [];
    for (const n of NPC_LIST) {
      if ((n.vis && !n.vis()) || n.ally) continue;
      if (Math.abs(P.x - n.cur.x) > 4 || Math.abs(P.z - n.cur.z) > 4) continue;
      const tag = n.mkState === 'turn' ? '  ❔' : n.mkState === 'gold' || n.mkState === 'blue' ? '  ❗' : '';
      out.push({ x: n.cur.x, z: n.cur.z, r: n.id === 'elina' ? 3.2 : 2.7, label: `Parla con ${n.name}${tag}`, action: () => talk(n) });
    }
    if (Math.abs(P.x - BOARD.x) < 4 && Math.abs(P.z - BOARD.z) < 4) out.push({ x: BOARD.x, z: BOARD.z, r: 2.8, label: 'Bacheca degli Incarichi  📜', action: () => openBoard() });
    // gather nodes
    for (const tag in RT.gathers) {
      const [id, si] = tag.split('#'), i = +si, stg = stageOf(id); if (!stg) continue;
      const o = stg.objs[i]; if (!o || o.t !== 'gather') continue;
      for (const n of RT.gathers[tag].nodes) if (n.mesh && Math.abs(P.x - n.x) < 3 && Math.abs(P.z - n.z) < 3) out.push({ x: n.x, z: n.z, r: 2.4, label: 'Raccogli: ' + o.item, action: () => pickNode(id, i, o, n) });
    }
    if (ESC && !ESC.started && Math.abs(P.x - ESC.x) < 4 && Math.abs(P.z - ESC.z) < 4) out.push({ x: ESC.x, z: ESC.z, r: 3, label: ESC.o.who === 'biscotto' ? 'Prendi Biscotto 🐈' : 'Parla con ' + ESC.name, action: () => { ESC.started = true; toast(`${ESC.name} ti segue!`); sfx('select'); markDirty(); } });
    return out;
  }
  function onKill(e, absorbed) { try { onKillQ(e, absorbed); } catch (err) { console.error(err); } }
  function hudHook() { /* tracker is updated in update(); nothing per-frame here */ }

  // debug / QA helper: jump a quest to a given stage (used by tests and by other modules for scripted events)
  function jump(id, st) {
    const d = def(id); if (!d) return false;
    if (QS.q[id]) cleanupStage(id);
    QS.q[id] = { s: 'active', st: clamp(st | 0, 0, d.stages.length - 1), p: [], pk: [], t: Date.now() };
    if (!QS.track.includes(id)) QS.track.unshift(id);
    if (QS.track.length > 3) QS.track.length = 3;
    startStage(id, true); markDirty(); save(); return true;
  }
  API.quests = { accept, stateOf, turnIn, openLog, openBoard, def, defs: DEFS, npcs: NPCS, rank: () => QS.guild.rank, progress, talk: (id) => NPCS[id] && talk(NPCS[id]), D, refreshOffers, QS, jump, genContract, escort: () => ESC };
  API.register({ id: 'quests3d', init, populate, update, interactables, onKill, hud: hudHook });
})();
