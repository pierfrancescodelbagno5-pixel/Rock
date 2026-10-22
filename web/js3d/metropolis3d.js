/* Slime Reborn — Terre Spezzate 3D · metropolis3d.js
 * Altheria, Città dei Mille Mondi: the walled capital where the player starts. Circular walls with towers and
 * four gatehouses, royal castle, cathedral, magic academy with floating crystals, arena, guild hall, tavern,
 * shops street, market square, canal with bridges, Japanese-style "Quartiere dei Ciliegi", elven gardens,
 * dwarven forges, 80+ houses, lamps and windows that light up at night, a living crowd (citizens, guards,
 * children, carts, pigeons), talkable named citizens and city services (shops, trainer, inn, stables, bank).
 * Plugin for game3d.js — see docs/PLUGIN3D.md. Classic script, THREE global (r160). */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE, SK = window.SK || {};
  const { lerp, clamp, angDiff, TAU, std, hdr } = API;
  const Q = API.quality, LOW = Q === 'low', HIGH = Q === 'high';
  const PI = Math.PI;
  const P = API.P, S = API.S;
  const CX = 0, CZ = 470, WALL_R = 125, RING_R = 110, PLAZA_R = 28;
  const sfx = (n, o) => { try { API.sfx(n, o); } catch (e) { /* audio optional */ } };
  const oracle = (t, gold) => { try { if (API.oracle) API.oracle(t, gold); else API.toast(t); } catch (e) { /* ignore */ } };
  const toast = (t) => { try { API.toast(t); } catch (e) { /* ignore */ } };
  const emitEv = (n, d) => { try { if (SK.events) SK.events.emit(n, d); } catch (e) { /* ignore */ } };
  const fmtN = (n) => Math.floor(n).toLocaleString('it-IT');
  const dC = (x, z) => Math.hypot(x - CX, z - CZ);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const rand = (a, b) => a + Math.random() * (b - a);

  /* deterministic layout RNG: the city looks the same on every visit */
  let seed = 470125;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rr = (a, b) => a + rnd() * (b - a);
  const rpick = (a) => a[(rnd() * a.length) | 0];

  /* ------------------------------------------------------------ exact terrain surface
   * The rendered terrain is a flat-shaded grid that linearly interpolates heightAt(); props must sit on
   * max(heightAt, grid) so neither the player (heightAt) nor the visible ground pokes through. */
  const GSEG = Q === 'low' ? 170 : Q === 'medium' ? 260 : 340, GSIZE = API.MAPR * 2.3, GCELL = GSIZE / GSEG, GHALF = GSIZE / 2;
  const vCache = new Map();
  function vH(ix, iz) { const k = ix * 8192 + iz; let h = vCache.get(k); if (h === undefined) { h = API.heightAt(ix * GCELL - GHALF, iz * GCELL - GHALF); vCache.set(k, h); } return h; }
  function groundAt(x, z) {
    const gx = (x + GHALF) / GCELL, gz = (z + GHALF) / GCELL, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    if (fx + fz <= 1) { const ha = vH(ix, iz); return ha + (vH(ix + 1, iz) - ha) * fx + (vH(ix, iz + 1) - ha) * fz; }
    const hc = vH(ix + 1, iz + 1); return hc + (vH(ix, iz + 1) - hc) * (1 - fx) + (vH(ix + 1, iz) - hc) * (1 - fz);
  }
  function gnd(x, z) { const a = API.heightAt(x, z), b = groundAt(x, z); return a > b ? a : b; }
  function nightAmt() {
    const a = API.DAY.t * TAU, x = Math.cos(a) * 0.75, y = Math.sin(a), z = 0.35 + Math.cos(a) * 0.15;
    const t = clamp((y / Math.hypot(x, y, z) + 0.22) / 0.24, 0, 1);
    return 1 - t * t * (3 - 2 * t);
  }
  const hourNow = () => (API.DAY.t * 24 + 6) % 24;

  /* ------------------------------------------------------------ shared geometry */
  const GEO = {
    box: API.BOX, sph: new T.SphereGeometry(1, 10, 7), sphLo: new T.SphereGeometry(1, 7, 5), ico: new T.IcosahedronGeometry(1, 0),
    ico1: new T.IcosahedronGeometry(1, 1), dode: new T.DodecahedronGeometry(1, 0), oct: new T.OctahedronGeometry(1, 0),
    cyl: new T.CylinderGeometry(1, 1, 1, 8), cyl6: new T.CylinderGeometry(1, 1, 1, 6), cyl12: new T.CylinderGeometry(1, 1, 1, 12), cyl16: new T.CylinderGeometry(1, 1, 1, 16),
    cone: new T.ConeGeometry(1, 1, 8), cone4: new T.ConeGeometry(1, 1, 4), cone6: new T.ConeGeometry(1, 1, 6), cone12: new T.ConeGeometry(1, 1, 12),
    tor: new T.TorusGeometry(1, 0.1, 5, 20), plane: new T.PlaneGeometry(1, 1, 6, 1), dome: new T.SphereGeometry(1, 12, 6, 0, TAU, 0, PI / 2),
    half: new T.CylinderGeometry(1, 1, 1, 10, 1, false, 0, PI), arch: null, prism: null, wedge: null,
  };
  GEO.prism = (() => { // gable volume: ridge along local X, base at y=0, top at y=1
    const A = [-0.5, 0, -0.5], B = [-0.5, 0, 0.5], C = [-0.5, 1, 0], D = [0.5, 0, -0.5], E = [0.5, 0, 0.5], F = [0.5, 1, 0];
    const tris = [A, B, C, D, F, E, B, E, F, B, F, C, A, C, F, A, F, D, A, D, E, A, E, B];
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(tris.flat(), 3)); g.computeVertexNormals(); return g;
  })();
  GEO.arch = (() => { // half-ring arch (for gates, bridges, arcades): spans x -1..1, y 0..1, depth z -0.5..0.5
    const s = new T.Shape(); s.moveTo(-1, 0); s.lineTo(-1, 1.25); s.lineTo(1, 1.25); s.lineTo(1, 0); s.lineTo(0.78, 0);
    s.absarc(0, 0, 0.78, 0, PI, false); s.lineTo(-1, 0);
    const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 8 }); g.translate(0, 0, -0.5); return g;
  })();
  // a simple humanoid-friendly limb: box with the pivot at the top
  const limbGeo = new T.BoxGeometry(1, 1, 1); limbGeo.translate(0, -0.5, 0);

  /* ------------------------------------------------------------ materials */
  const U = { uTime: { value: 0 } };
  function swayMat(mat, amt) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        `vec3 transformed = vec3(position); float swh = max(position.y, 0.0);
         transformed.x += sin(uTime * 1.3 + position.x * 0.21 + position.z * 0.17) * ${amt.toFixed(3)};
         transformed.z += cos(uTime * 1.1 + position.z * 0.19 + position.x * 0.13) * ${amt.toFixed(3)};`);
    };
    mat.customProgramCacheKey = () => 'msway' + amt;
    return mat;
  }
  function flagMat() {
    const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: T.DoubleSide, flatShading: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'uniform float uTime; attribute float aw;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        'vec3 transformed = vec3(position) + normal * (sin(uTime * 4.2 - aw * 5.5 + position.x * 0.31 + position.z * 0.27) * aw * 0.32);');
    };
    m.customProgramCacheKey = () => 'mflag';
    return m;
  }
  const MAT = {
    vc: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0.02 }),
    met: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.38, metalness: 0.72 }),
    glow: new T.MeshBasicMaterial({ vertexColors: true }),
    win: new T.MeshBasicMaterial({ vertexColors: true, color: new T.Color(0.25, 0.27, 0.33) }),
    stain: new T.MeshBasicMaterial({ vertexColors: true, color: new T.Color(0.5, 0.5, 0.5) }),
    lamp: new T.MeshBasicMaterial({ vertexColors: true, color: new T.Color(0.4, 0.4, 0.4) }),
    leaf: swayMat(new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 }), 0.09),
    flag: flagMat(),
    glass: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.82, emissive: new T.Color('#2a4a7a'), emissiveIntensity: 0.6 }),
    water: new T.MeshStandardMaterial({ color: '#3d93b5', roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.86, emissive: new T.Color('#0b3346'),
      normalMap: API.waterNormal || null, normalScale: new T.Vector2(0.55, 0.55), envMapIntensity: 1.3 }),
    fire: new T.MeshBasicMaterial({ color: hdr('#ff7a2a', 3), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }),
  };
  // soft additive glow points with a global intensity (lamp halos, crystal halos)
  const glowU = { uScale: { value: window.innerHeight * 0.5 }, uK: { value: 0 } };
  const glowMat = new T.ShaderMaterial({ uniforms: glowU, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale, uK; void main(){ vC = color * uK; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uScale / -mv.z, 0.0, 160.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a, 1.0); }' });
  const glowMatDay = glowMat.clone(); glowMatDay.uniforms = { uScale: glowU.uScale, uK: { value: 1 } };
  window.addEventListener('resize', () => { glowU.uScale.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) * 0.5; });
  glowU.uScale.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) * 0.5;

  /* procedural textures */
  function canvasTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  let tseed = 77;
  const trnd = () => { tseed = (tseed * 16807) % 2147483647; return tseed / 2147483647; };
  const cobbleTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#4a4238'; x.fillRect(0, 0, w, h);
    const rows = 10, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let cx = (r % 2) * 12 - 12;
      while (cx < w + 12) {
        const sw = 18 + trnd() * 14, l = 52 + trnd() * 34, hue = 30 + trnd() * 14;
        x.fillStyle = `hsl(${hue},${10 + trnd() * 10}%,${l * 0.62}%)`;
        const px = cx + 2, py = r * rh + 2, pw = sw - 3, ph = rh - 3;
        x.beginPath(); if (x.roundRect) x.roundRect(px, py, pw, ph, 5); else x.rect(px, py, pw, ph); x.fill();
        x.fillStyle = 'rgba(255,240,210,.10)'; x.fillRect(px + 2, py + 2, pw - 5, 3);
        x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(px + 2, py + ph - 4, pw - 4, 3);
        // wrap horizontally for tiling
        if (px + pw > w) { x.fillStyle = `hsl(${hue},12%,${l * 0.62}%)`; x.fillRect(px - w, py, pw, ph); }
        cx += sw;
      }
    }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${trnd() > 0.5 ? '255,240,220' : '0,0,0'},${0.04 + trnd() * 0.06})`; x.fillRect(trnd() * w, trnd() * h, 2, 2); }
  });
  const flagTex = null; void flagTex;
  const roadMat = new T.MeshStandardMaterial({ map: cobbleTex, roughness: 0.92, metalness: 0, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  const plazaTex = canvasTex(1024, 1024, (x, w, h) => {
    const c = w / 2;
    x.fillStyle = '#6b6152'; x.fillRect(0, 0, w, h);
    // concentric paving rings
    for (let r = 0; r < 26; r++) {
      const r0 = r * (c / 26), r1 = (r + 1) * (c / 26), n = Math.max(6, Math.floor(r * 7));
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, l = 46 + trnd() * 20;
        x.fillStyle = `hsl(${32 + trnd() * 10},${12 + trnd() * 8}%,${l}%)`;
        x.beginPath(); x.arc(c, c, r1 - 1.5, a0 + 0.004, a1 - 0.004); x.arc(c, c, Math.max(0, r0 + 1.5), a1 - 0.004, a0 + 0.004, true); x.closePath(); x.fill();
      }
    }
    // the thousand stars: gold inlaid compass star + scattered star tiles
    x.save(); x.translate(c, c);
    const star = (R, r, n, col, lw) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU - PI / 2, rad = i % 2 ? r : R; x.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } x.closePath(); x.fillStyle = col; x.fill(); if (lw) { x.lineWidth = lw; x.strokeStyle = '#3a2c14'; x.stroke(); } };
    star(c * 0.62, c * 0.2, 8, '#b8913e', 4); star(c * 0.5, c * 0.16, 8, '#e0c070', 0); star(c * 0.3, c * 0.1, 4, '#f3e2a8', 3);
    x.strokeStyle = '#d4b060'; x.lineWidth = 7; x.beginPath(); x.arc(0, 0, c * 0.7, 0, TAU); x.stroke(); x.lineWidth = 3; x.beginPath(); x.arc(0, 0, c * 0.74, 0, TAU); x.stroke();
    for (let i = 0; i < 120; i++) { const a = trnd() * TAU, r = c * (0.76 + trnd() * 0.22); x.save(); x.translate(Math.cos(a) * r, Math.sin(a) * r); x.rotate(trnd() * TAU); star(6 + trnd() * 6, 2.5, 5, trnd() > 0.5 ? '#e8cf86' : '#c9b27a', 0); x.restore(); }
    x.restore();
  });
  const plazaMat = new T.MeshStandardMaterial({ map: plazaTex, roughness: 0.75, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -10 });

  /* ------------------------------------------------------------ merge kit (many coloured parts → one mesh), chunked */
  const _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _v = new T.Vector3(), _s = new T.Vector3(), _n3 = new T.Matrix3();
  const NI = new WeakMap();
  function nonIdx(g) { let r = NI.get(g); if (!r) { r = g.index ? g.toNonIndexed() : g; if (!r.attributes.normal) r.computeVertexNormals(); NI.set(g, r); } return r; }
  function Kit(mat, weightAxis) { this.items = []; this.mat = mat; this.wAxis = weightAxis || null; this.base = new T.Matrix4(); }
  Kit.prototype.frame = function (x, y, z, ry) { _e.set(0, ry || 0, 0, 'YXZ'); _q.setFromEuler(_e); this.base.compose(_v.set(x, y, z), _q, _s.set(1, 1, 1)); return this; };
  Kit.prototype.add = function (geo, col, x, y, z, sx, sy, sz, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
    const m = new T.Matrix4().compose(_v.set(x || 0, y || 0, z || 0), _q, _s.set(sx, sy, sz)).premultiply(this.base);
    this.items.push({ g: nonIdx(geo), m, c: col && col.isColor ? col : new T.Color(col) });
    return this;
  };
  Kit.prototype.geo = function () {
    let n = 0; for (const it of this.items) n += it.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), aw = this.wAxis ? new Float32Array(n) : null;
    let o = 0;
    for (const it of this.items) {
      const Pp = it.g.attributes.position, N = it.g.attributes.normal; _n3.getNormalMatrix(it.m);
      for (let i = 0; i < Pp.count; i++, o++) {
        if (aw) aw[o] = clamp(this.wAxis === 'x' ? Pp.getX(i) + 0.5 : 0.5 - Pp.getY(i), 0, 1);
        _v.set(Pp.getX(i), Pp.getY(i), Pp.getZ(i)).applyMatrix4(it.m); pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        _v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_n3).normalize(); nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
        col[o * 3] = it.c.r; col[o * 3 + 1] = it.c.g; col[o * 3 + 2] = it.c.b;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    if (aw) g.setAttribute('aw', new T.BufferAttribute(aw, 1));
    g.computeBoundingSphere();
    return g;
  };
  Kit.prototype.mesh = function (parent, shadow, recv) {
    if (!this.items.length) return null;
    const m = new T.Mesh(this.geo(), this.mat); m.castShadow = !!shadow && !LOW; m.receiveShadow = !!recv;
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m); this.items.length = 0; return m;
  };

  /* city root groups: near (full detail) and far (silhouette landmarks) */
  const ROOT = new T.Group(); ROOT.name = 'metropolis'; API.scene.add(ROOT);
  const FAR = new T.Group(); FAR.name = 'metropolis-far'; API.scene.add(FAR);
  const CH = 56; // chunk size for frustum culling
  const CHUNKS = new Map();
  const KEYS = ['vc', 'met', 'glow', 'win', 'stain', 'lamp', 'leaf', 'flag', 'glass'];
  function kits(x, z) {
    const k = Math.floor((x + 1000) / CH) + ':' + Math.floor((z + 1000) / CH);
    let c = CHUNKS.get(k);
    if (!c) {
      c = {};
      for (const key of KEYS) c[key] = new Kit(MAT[key], key === 'flag' ? 'x' : null);
      CHUNKS.set(k, c);
    }
    return c;
  }
  function frameAll(K, x, y, z, ry) { for (const key of KEYS) K[key].frame(x, y, z, ry); return K; }
  function flushKits() {
    for (const c of CHUNKS.values()) {
      c.vc.mesh(ROOT, true, true); c.met.mesh(ROOT, true, false); c.glow.mesh(ROOT, false); c.win.mesh(ROOT, false); c.stain.mesh(ROOT, false);
      c.lamp.mesh(ROOT, false); c.leaf.mesh(ROOT, true, false); c.flag.mesh(ROOT, true, false); c.glass.mesh(ROOT, false);
    }
    CHUNKS.clear();
  }

  /* ------------------------------------------------------------ layout bookkeeping */
  const OCC = [];   // occupied oriented rectangles {x,z,hw,hd,ry} (+ margin) for procedural placement
  const ROADS = []; // {pts:[[x,z]..], w, kind}
  const SEGS = [];  // flattened road segments {ax,az,bx,bz,hw}
  const BLD = [];   // buildings (debug / map)
  const CHIMNEYS = []; // smoke sources {x,y,z}
  const LAMPS = []; // {x,y,z,c}
  const DOORS = []; // house doors (citizens come and go) {x,z}
  const NODES = []; // road graph nodes for walkers
  const BIGLIGHTS = []; // halo points always on (crystals etc)
  const colliders = []; // our own COLL entries
  function coll(x, z, r) { const c = { x, z, r, metro: true }; API.COLL.push(c); colliders.push(c); return c; }
  function collRect(x, z, w, d, ry, pad) {
    pad = pad || 0; const lw = Math.max(w, d), sw = Math.min(w, d), along = w >= d ? 0 : 1;
    const n = Math.max(1, Math.round(lw / sw * 1.25)), r = sw / 2 + pad;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (lw - sw);
      const lx = along === 0 ? t : 0, lz = along === 1 ? t : 0;
      coll(x + lx * cs + lz * sn, z - lx * sn + lz * cs, r);
    }
  }
  function occupy(x, z, w, d, ry, m) { OCC.push({ x, z, hw: w / 2 + (m || 0), hd: d / 2 + (m || 0), ry: ry || 0 }); }
  function occCircle(x, z, r) { OCC.push({ x, z, hw: r, hd: r, ry: 0 }); }
  // 2D OBB overlap (separating axis)
  function obbHit(a, b) {
    const axes = [a.ry, a.ry + PI / 2, b.ry, b.ry + PI / 2];
    const dx = b.x - a.x, dz = b.z - a.z;
    for (const ang of axes) {
      const ax = Math.cos(ang), az = -Math.sin(ang);
      const pa = Math.abs(Math.cos(a.ry) * ax - Math.sin(a.ry) * az) * a.hw + Math.abs(Math.sin(a.ry) * ax + Math.cos(a.ry) * az) * a.hd;
      const pb = Math.abs(Math.cos(b.ry) * ax - Math.sin(b.ry) * az) * b.hw + Math.abs(Math.sin(b.ry) * ax + Math.cos(b.ry) * az) * b.hd;
      if (Math.abs(dx * ax + dz * az) > pa + pb) return false;
    }
    return true;
  }
  function segDist(px, pz, s) {
    const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz;
    const t = l2 ? clamp(((px - s.ax) * vx + (pz - s.az) * vz) / l2, 0, 1) : 0;
    return Math.hypot(px - (s.ax + vx * t), pz - (s.az + vz * t));
  }
  function nearestRoad(px, pz) {
    let best = null, bd = 1e9;
    for (const s of SEGS) { const d = segDist(px, pz, s) - s.hw; if (d < bd) { bd = d; best = s; } }
    return { s: best, d: bd };
  }
  // does an oriented rect (+margin) touch any road?
  function rectHitsRoad(o, margin) {
    const cs = Math.cos(o.ry), sn = Math.sin(o.ry), R = Math.hypot(o.hw, o.hd);
    for (const s of SEGS) {
      if (segDist(o.x, o.z, s) > R + s.hw + margin) continue;
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az), n = Math.max(1, Math.ceil(L / 1.2));
      for (let i = 0; i <= n; i++) {
        const px = lerp(s.ax, s.bx, i / n) - o.x, pz = lerp(s.az, s.bz, i / n) - o.z;
        const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
        if (Math.abs(lx) < o.hw + s.hw + margin && Math.abs(lz) < o.hd + s.hw + margin) return true;
      }
    }
    return false;
  }
  function freeRect(x, z, w, d, ry, m, roadM) {
    const o = { x, z, hw: w / 2 + (m || 0), hd: d / 2 + (m || 0), ry };
    for (const b of OCC) if (Math.abs(b.x - x) < 60 && Math.abs(b.z - z) < 60 && obbHit(o, b)) return false;
    return !rectHitsRoad({ x, z, hw: w / 2, hd: d / 2, ry }, roadM == null ? 0.6 : roadM);
  }
  // ground statistics under a footprint
  function site(x, z, w, d, ry) {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    let mn = 1e9, mx = -1e9;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const lx = (i / 2) * (w / 2 + 0.6), lz = (j / 2) * (d / 2 + 0.6);
      const h = gnd(x + lx * cs + lz * sn, z - lx * sn + lz * cs);
      if (h < mn) mn = h; if (h > mx) mx = h;
    }
    return { mn, mx, y: mx + 0.18 };
  }
  // stepped stone foundation under a building (local frame already set at (x, y, z, ry))
  function plinth(K, w, d, s, col) {
    const depth = s.y - s.mn + 0.5, c = col || '#8a8274';
    K.vc.add(GEO.box, c, 0, -depth / 2, 0, w + 0.5, depth, d + 0.5);
    K.vc.add(GEO.box, shade(c, -0.12), 0, -0.06, 0, w + 0.62, 0.14, d + 0.62);
    if (depth > 1.4) K.vc.add(GEO.box, shade(c, -0.08), 0, -depth + 0.35 + 0.0, 0, w + 1.3, Math.max(0.6, depth - 1.0), d + 1.3);
  }
  // front steps from the plinth down to the ground in front of a door (local +z face)
  function steps(K, x, z, ry, s, w, d, dx, col) {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const fx = x + dx * cs + (d / 2 + 1.2) * sn, fz = z - dx * sn + (d / 2 + 1.2) * cs;
    const g = gnd(fx, fz), rise = s.y - g;
    if (rise < 0.25) return;
    const n = Math.min(8, Math.ceil(rise / 0.28)), h = rise / n;
    for (let i = 0; i < n; i++) K.vc.add(GEO.box, col || '#8f8778', dx, -h * (i + 0.5), d / 2 + 0.25 + 0.42 * (i + 0.5), w, h, 0.44);
  }
  function shade(hex, k) { const c = new T.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new T.Color('#ffffff'), k); return c; }
  const C = (h) => new T.Color(h);

  /* ------------------------------------------------------------ remove wild props inside the walls */
  function clearWilds() {
    const kill = new Set();
    API.scene.children.forEach((o) => {
      if (!o.isInstancedMesh || o.userData.metro) return;
      const m = new T.Matrix4(), p = new T.Vector3(), zero = new T.Matrix4().makeScale(0, 0, 0);
      let changed = false;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); p.setFromMatrixPosition(m);
        if (dC(p.x, p.z) < WALL_R + 6 && m.elements[0] !== 0) { o.setMatrixAt(i, zero); changed = true; kill.add(Math.round(p.x * 100) + ',' + Math.round(p.z * 100)); }
      }
      if (changed) { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere && o.computeBoundingSphere(); }
    });
    const CO = API.COLL;
    for (let i = CO.length - 1; i >= 0; i--) {
      const c = CO[i]; if (c.metro) continue;
      if (dC(c.x, c.z) < WALL_R + 6 && kill.has(Math.round(c.x * 100) + ',' + Math.round(c.z * 100))) CO.splice(i, 1);
    }
  }
  // the engine grows grass in chunks around the player: thin it out on paved city ground
  const grassSeen = new WeakMap();
  const _gm = new T.Matrix4(), _gp = new T.Vector3();
  function filterGrass() {
    if (dC(P.x, P.z) > WALL_R + 60) return;
    for (const o of API.scene.children) {
      if (!o.isInstancedMesh || o.userData.metro || !o.geometry || o.geometry.attributes.position.count !== 5) continue;
      const ver = o.instanceMatrix.version;
      if (grassSeen.get(o) === ver) continue;
      let n = 0;
      const arr = o.instanceMatrix.array, carr = o.instanceColor ? o.instanceColor.array : null;
      for (let i = 0; i < o.count; i++) {
        const x = arr[i * 16 + 12], z = arr[i * 16 + 14];
        if (dC(x, z) < WALL_R + 3 && !isGarden(x, z)) continue;
        if (n !== i) { for (let k = 0; k < 16; k++) arr[n * 16 + k] = arr[i * 16 + k]; if (carr) { carr[n * 3] = carr[i * 3]; carr[n * 3 + 1] = carr[i * 3 + 1]; carr[n * 3 + 2] = carr[i * 3 + 2]; } }
        n++;
      }
      if (n !== o.count) { o.count = n; o.instanceMatrix.needsUpdate = true; if (o.instanceColor) o.instanceColor.needsUpdate = true; }
      grassSeen.set(o, o.instanceMatrix.version);
    }
  }
  const GARDENS = []; // {x,z,r}
  function isGarden(x, z) { for (const g of GARDENS) if ((x - g.x) * (x - g.x) + (z - g.z) * (z - g.z) < g.r * g.r) return true; return false; }

  /* ------------------------------------------------------------ roads */
  function road(pts, w, kind) { const r = { pts, w, kind: kind || 'lane' }; ROADS.push(r); for (let i = 0; i < pts.length - 1; i++) SEGS.push({ ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw: w / 2, r }); return r; }
  const ringPts = (a0, a1, r) => { const out = [], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 6)); for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * (i / n)) * PI / 180; out.push([CX + Math.cos(a) * r, CZ + Math.sin(a) * r]); } return out; };
  function defineRoads() {
    // grand avenues (gate → plaza)
    road([[0, 330], [0, 350]], 8, 'main');
    road([[0, 350], [-12, 353], [-27, 362], [-27, 398], [-18, 404]], 7, 'main');
    road([[0, 350], [12, 353], [27, 362], [27, 398], [18, 404]], 7, 'main');
    road([[0, 432], [0, 443]], 8, 'main');
    road([[0, 418], [0, 432]], 9, 'bridge');
    road([[0, 398], [0, 418]], 36, 'floor');
    road([[0, 497], [0, 521]], 8, 'main');
    road([[-14, 526], [-32, 530], [-32, 578], [-8, 592], [0, 593]], 7, 'main');
    road([[14, 526], [32, 530], [32, 578], [8, 592], [0, 593]], 7, 'main');
    road([[0, 593], [0, 610]], 8, 'main');
    road([[27, 470], [122, 470], [140, 470]], 8, 'main');
    road([[-27, 473], [-116, 473], [-125, 470], [-140, 470]], 7.5, 'main');
    // inner ring road (broken by the academy and the castle)
    road(ringPts(182, 250, RING_R), 5, 'ring');
    road(ringPts(290, 358, RING_R), 5, 'ring');
    road(ringPts(2, 68, RING_R), 5, 'ring');
    road(ringPts(112, 178, RING_R), 5, 'ring');
    road([[-37.6, 366.6], [-27, 372]], 5, 'ring'); road([[37.6, 366.6], [27, 372]], 5, 'ring');
    road([[41.2, 572], [32, 568]], 5, 'ring'); road([[-41.2, 572], [-32, 568]], 5, 'ring');
    // shops street, guild forecourt, market, cathedral square
    road([[-30, 446], [-30, 497], [-12, 497]], 6, 'shop');
    road([[-27, 446], [-14, 446]], 5, 'lane');
    road([[20, 458], [44, 458]], 6, 'lane');
    road([[44, 452], [57, 447]], 5, 'lane');
    road([[72, 470], [72, 461]], 5, 'lane');
    road([[44, 474], [52, 488], [54, 518]], 5, 'lane');
    road([[90, 470], [92, 478]], 4, 'lane');
    // Japanese lane (torii path), arena lane, forge lane, elven paths
    road([[-62, 473], [-62, 440], [-60.4, 432]], 4.5, 'jp');
    road([[-60.4, 432], [-58.6, 418]], 4.5, 'bridge');
    road([[-58.6, 418], [-60, 396], [-52, 380], [-40, 372]], 4.5, 'jp');
    road([[-86, 473], [-90, 440], [-96, 420]], 4, 'lane');
    road([[-48, 473], [-52, 500], [-56, 507]], 4.5, 'lane');
    road([[-32, 548], [-48, 552], [-66, 552]], 4.5, 'forge');
    road([[32, 540], [46, 536], [58, 530], [72, 528]], 4.5, 'elf');
    road([[54, 518], [60, 528]], 4.5, 'elf');
    road([[0, 443], [0, 497]], 6, 'plaza');
    // north-east / north-west residential lanes
    road([[27, 380], [60, 384], [90, 392]], 4.5, 'lane');
    road([[-27, 380], [-44, 384]], 4.5, 'lane');
    road([[60, 384], [62, 416]], 4.5, 'lane');
    road([[62, 416], [62, 434]], 4.5, 'bridge');
    road([[62, 434], [64, 438]], 4.5, 'lane');
    road([[100, 440], [86, 446]], 4, 'lane');
    road([[-30, 446], [-29.5, 433]], 4.5, 'lane');
    road([[-29.5, 433], [-29, 417]], 3.6, 'bridge');
    road([[-29, 417], [-27.5, 404]], 4.5, 'lane');
    // paved floors (porches, terraces, courtyards, squares)
    road([[16, 450.5], [44, 450.5]], 9, 'floor');
    road([[32.5, 490], [49, 490]], 8, 'floor');
    road([[0, 521], [0, 546]], 8, 'floor');
    road([[-14, 533], [14, 533]], 4, 'floor');
    road([[54, 486], [54, 517]], 11, 'floor');
    road([[84, 478.5], [102, 478.5]], 5, 'floor');
    road([[-36, 446], [-36, 500]], 2.5, 'floor');
  }
  function ribbon(pts, w, yOff, colFn) {
    // densify the polyline and build a 3-wide strip following the terrain
    const P2 = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k < n; k++) P2.push([lerp(ax, bx, k / n), lerp(az, bz, k / n)]);
    }
    P2.push(pts[pts.length - 1]);
    const pos = [], uv = [], col = [], idx = [];
    let v = 0;
    for (let i = 0; i < P2.length; i++) {
      const a = P2[Math.max(0, i - 1)], b = P2[Math.min(P2.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz, nz = tx;
      if (i > 0) v += Math.hypot(P2[i][0] - P2[i - 1][0], P2[i][1] - P2[i - 1][1]);
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * w / 2, x = P2[i][0] + nx * o, z = P2[i][1] + nz * o;
        pos.push(x, Math.max(gnd(x, z), API.heightAt(x, z)) + yOff, z); uv.push((k / 2) * w / 4, v / 4);
        const c = colFn ? colFn(x, z) : 1; col.push(c, c, c);
      }
      if (i > 0) { const b0 = (i - 1) * 3, b1 = i * 3; idx.push(b0, b0 + 1, b1, b0 + 1, b1 + 1, b1, b0 + 1, b0 + 2, b1 + 1, b0 + 2, b1 + 2, b1 + 1); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const curbKit = () => kits(0, 0);
  function buildRoads() {
    const tint = { main: 1, ring: 0.92, lane: 0.88, shop: 1.05, jp: 0.8, forge: 0.7, elf: 1.12, plaza: 1, floor: 1.08 };
    ROADS.forEach((r, i) => {
      if (r.kind === 'bridge') return;
      const g = ribbon(r.pts, r.w, 0.07 + (i % 7) * 0.006, (x, z) => (tint[r.kind] || 1) * (0.86 + 0.14 * Math.sin(x * 0.7 + z * 1.3)));
      const m = new T.Mesh(g, roadMat); m.receiveShadow = true; m.matrixAutoUpdate = false; ROOT.add(m);
      // curbs on main avenues
      if (r.kind === 'main' || r.kind === 'shop') {
        for (let k = 0; k < r.pts.length - 1; k++) {
          const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.floor(L / 3));
          const ang = Math.atan2(bx - ax, bz - az), nx = Math.cos(ang), nz = -Math.sin(ang);
          for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n, x = lerp(ax, bx, t), z = lerp(az, bz, t);
            if (dC(x, z) < PLAZA_R + 2) continue;
            for (const sd of [-1, 1]) {
              const px = x + nx * sd * (r.w / 2 + 0.15), pz = z + nz * sd * (r.w / 2 + 0.15);
              const K = kits(px, pz); K.vc.frame(0, 0, 0, 0);
              K.vc.add(GEO.box, '#77706a', px, gnd(px, pz) + 0.1, pz, 0.32, 0.26, L / n + 0.05, 0, ang, 0);
            }
          }
        }
      }
    });
    void curbKit;
  }
  // plaza disc
  function buildPlaza() {
    const R = PLAZA_R + 2, ring = 18, seg = 48, pos = [], uv = [], idx = [];
    for (let i = 0; i <= ring; i++) for (let j = 0; j <= seg; j++) {
      const r = (i / ring) * R, a = (j / seg) * TAU, x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      pos.push(x, Math.max(gnd(x, z), API.heightAt(x, z)) + 0.12, z); uv.push(0.5 + (x - CX) / (2 * R), 0.5 - (z - CZ) / (2 * R));
    }
    for (let i = 0; i < ring; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, plazaMat); m.receiveShadow = true; ROOT.add(m);
    occCircle(CX, CZ, PLAZA_R + 1);
    // rim of carved stone and benches
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU, x = CX + Math.cos(a) * (R + 0.2), z = CZ + Math.sin(a) * (R + 0.2);
      if (nearestRoad(x, z).d < 0.5 && Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) > 0) { if (gapOnRim(x, z)) continue; }
      const K = kits(x, z); K.vc.frame(0, 0, 0, 0);
      K.vc.add(GEO.box, '#a49a88', x, gnd(x, z) + 0.2, z, 0.5, 0.5, R * TAU / 64 + 0.05, 0, -a, 0);
    }
  }
  function gapOnRim(x, z) { for (const s of SEGS) { if (s.r.kind === 'plaza') continue; if (segDist(x, z, s) < s.hw + 0.3) return true; } return false; }

  /* ------------------------------------------------------------ city wall, towers, gatehouses */
  const GATES = [{ id: 'N', x: 0, z: 345, a: -PI / 2, name: 'Porta del Nord' }, { id: 'S', x: 0, z: 595, a: PI / 2, name: 'Porta Reale (Sud)' },
    { id: 'E', x: 125, z: 470, a: 0, name: 'Porta dell\'Alba (Est)' }, { id: 'W', x: -125, z: 470, a: PI, name: 'Porta del Tramonto (Ovest)' }];
  const PORTC = [];
  function nearGateAng(a) { for (const g of GATES) { const d = Math.abs(angDiff(a, g.a)); if (d < 0.075) return g; } return null; }
  function buildWalls() {
    const n = 200, H = 9.5, TH = 3.2, stone = '#9a9282', dark = '#6f6858';
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
      if (nearGateAng(am)) continue;
      const x = CX + Math.cos(am) * WALL_R, z = CZ + Math.sin(am) * WALL_R, L = WALL_R * (a1 - a0) + 0.06;
      const g0 = gnd(x, z), K = kits(x, z); K.vc.frame(x, 0, z, -am + PI / 2);
      const base = g0 - 2.5;
      K.vc.add(GEO.box, i % 2 ? stone : shade(stone, -0.05), 0, base + (H + 2.5) / 2, 0, L, H + 2.5, TH);
      K.vc.add(GEO.box, dark, 0, g0 + 0.4, 0, L, 0.8, TH + 0.5);
      // walkway parapet + merlons on the outer side
      K.vc.add(GEO.box, shade(stone, 0.06), 0, g0 + H + 0.2, -TH / 2 + 0.2, L, 0.4, 0.5);
      if (i % 2 === 0) K.vc.add(GEO.box, stone, 0, g0 + H + 0.9, TH / 2 - 0.25, L * 0.55, 1.1, 0.5);
      K.vc.add(GEO.box, shade(stone, -0.1), 0, g0 + H - 0.05, 0, L, 0.15, TH + 0.25);
      if (i % 3 === 0) coll(x, z, 2.2);
      else coll(x, z, 2.2);
    }
    // towers every 30° (gate angles are gatehouses)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + PI / 16;
      if (nearGateAng(a) || GATES.some((g) => Math.abs(angDiff(a, g.a)) < 0.12)) continue;
      const x = CX + Math.cos(a) * WALL_R, z = CZ + Math.sin(a) * WALL_R;
      tower(x, z, 4.2, 15, k % 2 ? '#3d5f9a' : '#9a3d3d');
      coll(x, z, 4.6);
    }
    for (const g of GATES) gatehouse(g);
  }
  function tower(x, z, r, h, roof, far) {
    const g0 = gnd(x, z), K = kits(x, z); K.vc.frame(x, 0, z, 0); K.flag.frame(x, 0, z, 0); K.win.frame(x, 0, z, 0);
    K.vc.add(GEO.cyl12, '#958d7c', 0, g0 - 2 + (h + 2) / 2, 0, r, h + 2, r);
    K.vc.add(GEO.cyl12, '#857d6c', 0, g0 + 0.5, 0, r + 0.4, 1, r + 0.4);
    K.vc.add(GEO.cyl12, '#a39a88', 0, g0 + h + 0.3, 0, r + 0.55, 0.6, r + 0.55);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; K.vc.add(GEO.box, '#958d7c', Math.cos(a) * (r + 0.3), g0 + h + 1.05, Math.sin(a) * (r + 0.3), 0.8, 0.9, 0.5, 0, -a + PI / 2, 0); }
    K.vc.add(GEO.cone12, roof, 0, g0 + h + 3.6, 0, r * 0.95, 5.5, r * 0.95);
    K.met.frame(x, 0, z, 0); K.met.add(GEO.cyl6, '#c9a24a', 0, g0 + h + 7, 0, 0.06, 2, 0.06);
    K.flag.add(GEO.plane, roof, 0.75, g0 + h + 7.4, 0, 1.5, 0.8, 1);
    for (let i = 0; i < 3; i++) { const a = rr(0, TAU); K.win.add(GEO.box, rnd() < 0.7 ? '#ffc070' : '#2a2a30', Math.cos(a) * (r + 0.02), g0 + 4 + i * 3.5, Math.sin(a) * (r + 0.02), 0.5, 1, 0.12, 0, -a + PI / 2, 0); }
    if (far !== false) { const m = new T.Mesh(GEO.cone12, std(roof, 0.8)); m.position.set(x, g0 + h + 3.6, z); m.scale.set(r, 5.5, r); FAR.add(m); const b = new T.Mesh(GEO.cyl12, std('#958d7c', 0.9)); b.position.set(x, g0 + h / 2, z); b.scale.set(r, h, r); FAR.add(b); }
  }
  function gatehouse(gt) {
    const x = gt.x, z = gt.z, ry = -gt.a + PI / 2; // local z axis points outward
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, ry);
    const W = 16, D = 9, H = 13, stone = '#a1998a';
    for (const sx of [-1, 1]) {
      K.vc.add(GEO.box, stone, sx * 5.6, (H - 3) / 2 - 1.5, 0, 4.8, H, D);
      K.vc.add(GEO.cyl12, '#988f7e', sx * 7.6, H / 2 - 2, 2.6, 3, H + 4, 3);
      K.vc.add(GEO.cone12, '#7a2f2f', sx * 7.6, H + 2.4, 2.6, 3.4, 4.8, 3.4);
      coll(x + Math.cos(ry) * sx * 6 , z - Math.sin(ry) * sx * 6, 3.2);
      coll(x + Math.cos(ry) * sx * 7.6 + Math.sin(ry) * 2.6, z - Math.sin(ry) * sx * 7.6 + Math.cos(ry) * 2.6, 3.2);
      K.flag.add(GEO.plane, '#7a1e2a', sx * 3.6, H - 3, D / 2 + 0.08, 1.6, 3.6, 1, 0, 0, PI / 2);
      K.glow.add(GEO.box, hdr('#ffb050', 2.4), sx * 3.4, 4.2, D / 2 + 0.35, 0.25, 0.4, 0.25);
      LAMPS.push({ x: x + Math.cos(ry) * sx * 3.4 + Math.sin(ry) * (D / 2 + 0.4), y: g0 + 4.2, z: z - Math.sin(ry) * sx * 3.4 + Math.cos(ry) * (D / 2 + 0.4), c: '#ffb050', s: 5 });
    }
    // arch over the passage
    K.vc.add(GEO.arch, stone, 0, 0, 0, 3.2, 6.2, D);
    K.vc.add(GEO.box, stone, 0, 8.4, 0, 8, 3.2, D);
    K.vc.add(GEO.box, shade(stone, 0.08), 0, 10.2, 0, W, 0.5, D + 0.6);
    for (let i = -3; i <= 3; i++) K.vc.add(GEO.box, stone, i * 2.2, 11, D / 2, 1, 1.1, 0.6);
    // heraldry above the arch
    K.vc.add(GEO.box, '#2b3f6a', 0, 8.2, D / 2 + 0.05, 2.4, 2.4, 0.1);
    K.glow.add(GEO.oct, hdr('#ffd36b', 1.8), 0, 8.2, D / 2 + 0.15, 0.6, 0.8, 0.12);
    // portcullis (animated group)
    const pg = new T.Group(); pg.position.set(x, g0, z); pg.rotation.y = ry; ROOT.add(pg);
    const pk = new Kit(MAT.met);
    for (let i = -3; i <= 3; i++) pk.add(GEO.box, '#3a3632', i * 0.85, 3, 1.2, 0.14, 6, 0.14);
    for (let j = 0; j < 6; j++) pk.add(GEO.box, '#3a3632', 0, 0.6 + j * 1.05, 1.2, 6, 0.12, 0.12);
    for (let i = -3; i <= 3; i++) pk.add(GEO.cone4, '#3a3632', i * 0.85, -0.15, 1.2, 0.12, 0.35, 0.12, PI, 0, 0);
    const pm = pk.mesh(pg, true);
    PORTC.push({ g: pg, m: pm, y: 5.6, want: 5.6 });
    // far silhouette
    const fm = new T.Mesh(GEO.box, std('#a1998a', 0.9)); fm.position.set(x, g0 + 5, z); fm.rotation.y = ry; fm.scale.set(W, 12, D); FAR.add(fm);
  }

  /* ------------------------------------------------------------ houses */
  const ROOFS = { euro: ['#8e3b2a', '#a5482e', '#6b4a3a', '#3f4f6e', '#4a5a3a', '#7a3048', '#5a5f66', '#9a5a2a'],
    jp: ['#2f3238', '#3a2f2a', '#26303a'], elf: ['#3f7a5a', '#2f6a6a', '#6a8a4a', '#4a6a9a'], dwarf: ['#4a4038', '#5a4a3a', '#3a3a3e'] };
  const WALLS = { euro: ['#e8dcc0', '#d9c7a3', '#efe6d2', '#cdb894', '#e3d2b4', '#d8cfc0', '#c9b9a0'], jp: ['#efe8d8', '#e6dcc8'], elf: ['#f2efe6', '#e8eee6', '#eef0f4'], dwarf: ['#7d7468', '#8a7f70', '#6e665c'] };
  function districtStyle(x, z) {
    if (x < -40 && z < 466 && z > 360) return 'jp';
    if (x > 34 && z > 520) return 'elf';
    if (x < -30 && z > 540) return 'dwarf';
    return 'euro';
  }
  function house(x, z, ry, w, d, floors, style) {
    const s = site(x, z, w, d, ry), K = kits(x, z); frameAll(K, x, s.y, z, ry);
    style = style || 'euro';
    const wallC = rpick(WALLS[style]), roofC = rpick(ROOFS[style]), timber = rpick(['#4a3424', '#5a3e28', '#3a2a1e']);
    const stoneC = rpick(['#8f877a', '#9a9080', '#857c6e']);
    plinth(K, w, d, s, stoneC);
    const fh = style === 'dwarf' ? 3.4 : 3.1, H = fh * floors;
    if (style === 'jp') { jpHouse(K, w, d, floors, wallC, roofC, timber); }
    else if (style === 'elf') { elfHouse(K, w, d, floors, wallC, roofC); }
    else {
      // ground floor in stone, upper floors plaster with exposed timber
      K.vc.add(GEO.box, style === 'dwarf' ? wallC : stoneC, 0, fh / 2, 0, w, fh, d);
      for (let f = 1; f < floors; f++) {
        const jut = style === 'dwarf' ? 0 : 0.25 * f;
        K.vc.add(GEO.box, wallC, 0, fh * f + fh / 2, 0, w + jut, fh, d + jut);
        if (style !== 'dwarf') {
          K.vc.add(GEO.box, timber, 0, fh * f + 0.08, 0, w + jut + 0.08, 0.18, d + jut + 0.08);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.vc.add(GEO.box, timber, sx * (w + jut) / 2, fh * f + fh / 2, sz * (d + jut) / 2, 0.2, fh, 0.2);
          // braces on the long faces
          for (const sz of [-1, 1]) for (let b = -1; b <= 1; b += 2) K.vc.add(GEO.box, timber, b * (w + jut) * 0.3, fh * f + fh / 2, sz * ((d + jut) / 2 + 0.03), 0.14, fh * 1.08, 0.08, 0, 0, b * 0.62);
        }
      }
      // roof
      const rh = style === 'dwarf' ? 1.0 : clamp(d * 0.42, 1.6, 3.6), jut = style === 'dwarf' ? 0 : 0.25 * (floors - 1);
      const top = H, half = (d + jut) / 2 + 0.55, ang = Math.atan2(rh, half - 0.55);
      K.vc.add(GEO.prism, wallC, 0, top, 0, w + jut - 0.02, rh, d + jut - 0.02);
      const sl = half / Math.cos(ang);
      for (const sd of [-1, 1]) K.vc.add(GEO.box, roofC, 0, top + rh - (half / 2) * Math.tan(ang) + 0.1, sd * half / 2, w + jut + 0.9, 0.24, sl, sd * ang, 0, 0);
      K.vc.add(GEO.box, shade(roofC, -0.25), 0, top + rh + 0.12, 0, w + jut + 1, 0.22, 0.34);
      if (style === 'dwarf') { K.vc.add(GEO.box, shade(stoneC, -0.1), 0, top + 0.25, 0, w + 0.5, 0.5, d + 0.5); }
      // chimney
      if (rnd() < 0.85) {
        const cx = rr(-w * 0.3, w * 0.3), cz = rr(-0.2, 0.2) * d, chH = rh + 1.6;
        K.vc.add(GEO.box, '#7a6e62', cx, top + chH / 2, cz, 0.75, chH, 0.75);
        K.vc.add(GEO.box, '#5a524a', cx, top + chH + 0.1, cz, 0.95, 0.2, 0.95);
        const cs = Math.cos(ry), sn = Math.sin(ry);
        CHIMNEYS.push({ x: x + cx * cs + cz * sn, y: s.y + top + chH + 0.2, z: z - cx * sn + cz * cs, dwarf: style === 'dwarf' });
      }
      // windows + shutters + flower boxes
      for (let f = 0; f < floors; f++) {
        const jut = style === 'dwarf' ? 0 : 0.25 * f, nW = Math.max(1, Math.floor((w - 1) / 2.3));
        for (const sz of [-1, 1]) for (let i = 0; i < nW; i++) {
          const wx = (i - (nW - 1) / 2) * ((w - 1) / nW);
          if (f === 0 && sz === 1 && Math.abs(wx) < 1.1) continue; // door
          const wz = sz * ((d + jut) / 2 + 0.04), wy = fh * f + fh * 0.55;
          K.win.add(GEO.box, rnd() < 0.62 ? C('#ffcf7a').multiplyScalar(rr(0.8, 1.15)) : C('#1c1e24'), wx, wy, wz, 0.75, 0.95, 0.1);
          K.vc.add(GEO.box, timber, wx, wy - 0.56, wz + sz * 0.06, 0.95, 0.12, 0.16);
          if (style !== 'dwarf' && rnd() < 0.6) for (const sx of [-1, 1]) K.vc.add(GEO.box, rpick(['#3f5f8a', '#5a7a3a', '#8a3a2a', '#4a3424']), wx + sx * 0.6, wy, wz + sz * 0.05, 0.4, 1.0, 0.06);
          if (f > 0 && rnd() < 0.35) { K.vc.add(GEO.box, '#5a3e28', wx, wy - 0.68, wz + sz * 0.2, 0.9, 0.22, 0.3); K.leaf.frame(x, s.y, z, ry); K.leaf.add(GEO.sphLo, rpick(['#d04a5a', '#e8c040', '#c060c0', '#f08040']), wx, wy - 0.5, wz + sz * 0.2, 0.42, 0.18, 0.16); }
        }
        const nS = Math.max(0, Math.floor((d - 1) / 2.6));
        for (const sx of [-1, 1]) for (let i = 0; i < nS; i++) {
          const wz = (i - (nS - 1) / 2) * ((d - 1) / Math.max(1, nS)), wy = fh * f + fh * 0.55;
          K.win.add(GEO.box, rnd() < 0.55 ? C('#ffcf7a') : C('#1c1e24'), sx * ((w + jut) / 2 + 0.04), wy, wz, 0.1, 0.9, 0.7);
        }
      }
      // door
      K.vc.add(GEO.box, '#3a2a1e', 0, 1.05, d / 2 + 0.05, 1.15, 2.1, 0.12);
      K.vc.add(GEO.box, stoneC, 0, 2.2, d / 2 + 0.08, 1.5, 0.22, 0.18);
      K.met.add(GEO.sph, '#c9a24a', 0.38, 1.0, d / 2 + 0.14, 0.06, 0.06, 0.06);
      if (rnd() < 0.3) { K.glow.add(GEO.box, hdr('#ffb050', 2), 0.95, 2.1, d / 2 + 0.3, 0.18, 0.26, 0.18); const cs = Math.cos(ry), sn = Math.sin(ry); LAMPS.push({ x: x + 0.95 * cs + (d / 2 + 0.3) * sn, y: s.y + 2.1, z: z - 0.95 * sn + (d / 2 + 0.3) * cs, c: '#ffb050', s: 2.2 }); }
    }
    steps(K, x, z, ry, s, 1.6, d, 0, stoneC);
    collRect(x, z, w + 0.4, d + 0.4, ry, 0.05);
    const cs = Math.cos(ry), sn = Math.sin(ry);
    DOORS.push({ x: x + (d / 2 + 1.6) * sn, z: z + (d / 2 + 1.6) * cs });
    BLD.push({ x, z, w, d, ry, kind: 'house', style });
  }
  function jpHouse(K, w, d, floors, wallC, roofC, timber) {
    const fh = 3.0;
    for (let f = 0; f < floors; f++) {
      const sc = 1 - f * 0.12, ww = w * sc, dd = d * sc, y0 = f * (fh + 0.9);
      K.vc.add(GEO.box, '#3a2a22', 0, y0 + 0.2, 0, ww + 0.4, 0.4, dd + 0.4);
      K.vc.add(GEO.box, wallC, 0, y0 + fh / 2 + 0.3, 0, ww, fh, dd);
      // dark timber grid on paper walls
      for (let i = -2; i <= 2; i++) for (const sz of [-1, 1]) K.vc.add(GEO.box, '#2a1e18', i * ww / 5, y0 + fh / 2 + 0.3, sz * (dd / 2 + 0.03), 0.12, fh, 0.06);
      for (const sz of [-1, 1]) K.vc.add(GEO.box, '#2a1e18', 0, y0 + fh * 0.55 + 0.3, sz * (dd / 2 + 0.03), ww, 0.1, 0.06);
      for (let i = -1; i <= 1; i += 2) for (const sz of [-1, 1]) K.win.add(GEO.box, rnd() < 0.7 ? C('#ffd9a0') : C('#2a2a2a'), i * ww / 4, y0 + fh * 0.6 + 0.3, sz * (dd / 2 + 0.05), ww / 5.5, fh * 0.45, 0.06);
      // wide curved roof: layered slabs with upturned corners
      const ry0 = y0 + fh + 0.3, rw = ww + 2.2, rd = dd + 2.2;
      K.vc.add(GEO.box, roofC, 0, ry0 + 0.12, 0, rw, 0.24, rd);
      K.vc.add(GEO.prism, roofC, 0, ry0 + 0.2, 0, rw - 1.2, 1.5, rd - 1.6);
      K.vc.add(GEO.box, shade(roofC, -0.3), 0, ry0 + 1.72, 0, rw - 0.8, 0.22, 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.vc.add(GEO.cone4, roofC, sx * rw / 2, ry0 + 0.32, sz * rd / 2, 0.35, 0.6, 0.35, sz * 0.5, PI / 4, -sx * 0.5);
      K.vc.add(GEO.box, '#b03a2a', 0, ry0 - 0.05, 0, ww + 0.2, 0.15, dd + 0.2);
    }
    K.vc.add(GEO.box, '#2a1e18', 0, 1.2, d / 2 + 0.05, 1.4, 2.2, 0.1);
    K.lamp.add(GEO.cyl, C('#ff6a3a'), 1.3, 2.4, d / 2 + 0.6, 0.3, 0.55, 0.3);
  }
  function elfHouse(K, w, d, floors, wallC, roofC) {
    const r = Math.min(w, d) / 2, h = 3.4 * floors;
    K.vc.add(GEO.cyl12, wallC, 0, h / 2, 0, r, h, r);
    K.vc.add(GEO.cyl12, '#cfd8c8', 0, 0.3, 0, r + 0.3, 0.6, r + 0.3);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; K.vc.add(GEO.cyl6, '#d8e2d0', Math.cos(a) * r, h / 2, Math.sin(a) * r, 0.18, h, 0.18); }
    K.leaf.add(GEO.cone12, roofC, 0, h + 1.8, 0, r + 1.1, 3.8, r + 1.1);
    K.leaf.add(GEO.sphLo, shade(roofC, 0.15), 0, h + 3.9, 0, 0.6, 0.9, 0.6);
    K.glow.add(GEO.oct, hdr('#9ff3ff', 2.2), 0, h + 4.9, 0, 0.25, 0.45, 0.25);
    for (let f = 0; f < floors; f++) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; K.win.add(GEO.box, C('#bff0ff'), Math.cos(a) * (r + 0.02), f * 3.4 + 1.9, Math.sin(a) * (r + 0.02), 0.7, 1.3, 0.1, 0, -a + PI / 2, 0); }
    K.vc.add(GEO.arch, '#3a5a4a', 0, 0, r - 0.1, 0.7, 1.8, 0.3);
  }

  /* ------------------------------------------------------------ small props */
  function lampPost(x, z, style) {
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, 0);
    const h = 3.6;
    if (style === 'jp') {
      K.vc.add(GEO.box, '#8f8a80', 0, 0.3, 0, 0.7, 0.6, 0.7); K.vc.add(GEO.cyl6, '#8f8a80', 0, 1.0, 0, 0.18, 1.0, 0.18);
      K.vc.add(GEO.box, '#8f8a80', 0, 1.7, 0, 0.8, 0.5, 0.8); K.lamp.add(GEO.box, C('#ffb070'), 0, 1.7, 0, 0.5, 0.36, 0.84);
      K.vc.add(GEO.cone4, '#7f7a70', 0, 2.25, 0, 0.75, 0.55, 0.75, 0, PI / 4, 0);
      LAMPS.push({ x, y: g0 + 1.7, z, c: '#ff9a50', s: 3.2 });
      coll(x, z, 0.45); return;
    }
    if (style === 'elf') {
      K.met.add(GEO.cyl6, '#c8d8c0', 0, h / 2, 0, 0.07, h, 0.07);
      K.leaf.add(GEO.tor, '#5a8a5a', 0, h - 0.2, 0, 0.35, 0.35, 0.35, PI / 2, 0, 0);
      K.lamp.add(GEO.oct, C('#a8ffe0'), 0, h + 0.1, 0, 0.22, 0.36, 0.22);
      LAMPS.push({ x, y: g0 + h + 0.1, z, c: '#7fffd0', s: 4 });
      coll(x, z, 0.3); return;
    }
    K.met.add(GEO.cyl6, '#2a2826', 0, h / 2, 0, 0.09, h, 0.09);
    K.met.add(GEO.cyl6, '#2a2826', 0, 0.25, 0, 0.2, 0.5, 0.2);
    K.met.add(GEO.box, '#2a2826', 0, h - 0.02, 0, 0.5, 0.06, 0.5);
    K.lamp.add(GEO.box, C('#ffc070'), 0, h + 0.28, 0, 0.36, 0.5, 0.36);
    K.met.add(GEO.cone4, '#2a2826', 0, h + 0.68, 0, 0.36, 0.34, 0.36, 0, PI / 4, 0);
    LAMPS.push({ x, y: g0 + h + 0.28, z, c: '#ffb860', s: 4.4 });
    coll(x, z, 0.3);
  }
  function tree(x, z, kind, s) {
    s = s || rr(0.8, 1.25);
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, rr(0, TAU));
    if (kind === 'sakura') {
      K.vc.add(GEO.cyl6, '#4a3028', 0, 1.4 * s, 0, 0.22 * s, 2.8 * s, 0.22 * s, 0, 0, 0.15);
      for (let i = 0; i < 4; i++) K.leaf.add(GEO.ico, rpick(['#f4b8cc', '#f8c8d8', '#eaa0bc', '#ffd8e4']), rr(-1.4, 1.4) * s, (3 + rr(0, 1.2)) * s, rr(-1.4, 1.4) * s, rr(1.2, 1.7) * s, rr(0.8, 1.1) * s, rr(1.2, 1.7) * s);
    } else if (kind === 'cypress') {
      K.vc.add(GEO.cyl6, '#4a3424', 0, 0.6, 0, 0.15, 1.2, 0.15);
      K.leaf.add(GEO.cone, '#2f5030', 0, 3 * s, 0, 0.9 * s, 5 * s, 0.9 * s);
    } else if (kind === 'elf') {
      K.vc.add(GEO.cyl6, '#d8d0b8', 0, 2 * s, 0, 0.25 * s, 4 * s, 0.25 * s);
      for (let i = 0; i < 3; i++) K.leaf.add(GEO.ico, rpick(['#7ac08a', '#9ad0a0', '#6ab8a8', '#c8e890']), rr(-1, 1) * s, (4.4 + i * 0.9) * s, rr(-1, 1) * s, (1.8 - i * 0.35) * s, 1.1 * s, (1.8 - i * 0.35) * s);
    } else {
      K.vc.add(GEO.cyl6, '#5a4330', 0, 1.6 * s, 0, 0.24 * s, 3.2 * s, 0.24 * s);
      K.leaf.add(GEO.ico1, rpick(['#5a8a3a', '#6a9a40', '#4a7a3a', '#7a9a48']), 0, 4.2 * s, 0, 2.1 * s, 1.8 * s, 2.1 * s);
      if (rnd() < 0.6) K.leaf.add(GEO.ico, rpick(['#6a9a40', '#4f8238']), rr(-1, 1) * s, 5.3 * s, rr(-1, 1) * s, 1.3 * s, 1.1 * s, 1.3 * s);
    }
    coll(x, z, 0.45 * s);
  }
  function bench(x, z, ry) {
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, ry);
    K.vc.add(GEO.box, '#6a4a30', 0, 0.48, 0, 1.8, 0.1, 0.5); K.vc.add(GEO.box, '#6a4a30', 0, 0.85, -0.22, 1.8, 0.4, 0.08);
    for (const sx of [-1, 1]) K.met.add(GEO.box, '#2a2826', sx * 0.75, 0.24, 0, 0.1, 0.48, 0.5);
    coll(x, z, 0.6);
  }
  function crates(x, z) {
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, rr(0, TAU));
    K.vc.add(GEO.box, '#8a6a42', 0, 0.4, 0, 0.8, 0.8, 0.8); K.vc.add(GEO.box, '#7a5a38', 0.75, 0.3, 0.2, 0.6, 0.6, 0.6, 0, 0.4, 0);
    K.vc.add(GEO.cyl, '#6a4a2a', -0.6, 0.45, 0.4, 0.35, 0.9, 0.35);
    coll(x, z, 0.8);
  }
  function banner(x, y, z, ry, col, h) {
    const K = kits(x, z); K.flag.frame(x, y, z, ry); K.met.frame(x, y, z, ry);
    K.met.add(GEO.cyl6, '#c9a24a', 0, 0, 0, 0.05, 1.6, 0.05, 0, 0, PI / 2);
    K.flag.add(GEO.plane, col, 0, -h / 2, 0, h, 1.4, 1, 0, 0, PI / 2);
    K.flag.add(GEO.plane, '#e8c860', 0, -h / 2, 0.01, h * 0.3, 0.5, 1, 0, 0, PI / 2);
  }
  /* ------------------------------------------------------------ landmark buildings (filled in below) */
  const SERV = []; // service / named NPC interaction points
  function buildLandmarks() {
    buildPlazaCentre();
    buildGuildHall();
    buildTavern();
    buildShops();
    buildBank();
    buildAcademy();
    buildCastle();
    buildCathedral();
    buildArena();
    buildMarket();
    buildStable();
    buildJapanese();
    buildElven();
    buildForge();
    buildCanal();
  }
  /* ------------------------------------------------------------ signs (canvas text) */
  const PLANE1 = new T.PlaneGeometry(1, 1);
  const SIGNM = new Map();
  function signMat(text, o) {
    o = o || {};
    const key = text + '|' + (o.bg || '') + (o.fg || '') + (o.icon || '');
    if (SIGNM.has(key)) return SIGNM.get(key);
    const tex = canvasTex(512, 128, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, o.bg || '#4a2e1a'); g.addColorStop(1, shadeHex(o.bg || '#4a2e1a', -0.35));
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(0, i * 14 + 3, w, 2); }
      x.strokeStyle = o.fg || '#e8c060'; x.lineWidth = 7; x.strokeRect(8, 8, w - 16, h - 16); x.lineWidth = 2; x.strokeRect(18, 18, w - 36, h - 36);
      let fs = 58; x.font = `bold ${fs}px Georgia, serif`;
      const txt = (o.icon ? o.icon + ' ' : '') + text;
      while (x.measureText(txt).width > w - 60 && fs > 20) { fs -= 2; x.font = `bold ${fs}px Georgia, serif`; }
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,.8)'; x.shadowBlur = 6;
      x.fillStyle = o.fg || '#f3d27a'; x.fillText(txt, w / 2, h / 2 + 3);
    });
    tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;
    const m = new T.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.1, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.18 });
    SIGNM.set(key, m); return m;
  }
  function shadeHex(hex, k) { return '#' + shade(hex, k).getHexString(); }
  function sign(text, x, y, z, ry, w, o) {
    const m = new T.Mesh(PLANE1, signMat(text, o)); m.position.set(x, y, z); m.rotation.y = ry; m.scale.set(w, w / 4, 1);
    m.matrixAutoUpdate = false; m.updateMatrix(); ROOT.add(m);
    const b = new T.Mesh(PLANE1, signMat(text, o)); b.position.set(x - Math.sin(ry) * 0.02, y, z - Math.cos(ry) * 0.02); b.rotation.y = ry + PI; b.scale.set(w, w / 4, 1); b.matrixAutoUpdate = false; b.updateMatrix(); ROOT.add(b);
    return m;
  }
  const wp = (x, z, ry, lx, lz) => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
  function B(x, z, w, d, ry, col) { const s = site(x, z, w, d, ry), K = kits(x, z); frameAll(K, x, s.y, z, ry); if (col !== false) plinth(K, w, d, s, col); return { s, K, y: s.y }; }
  // gable roof helper (ridge along local x) at height top over a w×d box
  function gable(K, w, d, top, rh, roofC, wallC, ox, oz, over) {
    ox = ox || 0; oz = oz || 0; over = over == null ? 0.55 : over;
    const half = d / 2 + over, ang = Math.atan2(rh, d / 2), sl = half / Math.cos(ang);
    if (wallC) K.vc.add(GEO.prism, wallC, ox, top, oz, w - 0.02, rh, d - 0.02);
    for (const sd of [-1, 1]) K.vc.add(GEO.box, roofC, ox, top + rh - (half / 2) * Math.tan(ang) + 0.1, oz + sd * half / 2, w + over * 1.6, 0.26, sl, sd * ang, 0, 0);
    K.vc.add(GEO.box, shade(roofC, -0.25), ox, top + rh + 0.13, oz, w + over * 1.7, 0.22, 0.36);
  }
  function winRow(K, n, w, y, z, ww, wh, lit, dark) {
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * (w / n); K.win.add(GEO.box, rnd() < (lit == null ? 0.7 : lit) ? C('#ffcf7a') : C(dark || '#1c1e24'), x, y, z, ww, wh, 0.1); }
  }

  /* ------------------------------------------------------------ named NPCs and services */
  const NPCS = []; // {id, name, title, x, z, face, look, talk}
  function npc(o) { o.ry = Math.atan2((o.face ? o.face[0] : CX) - o.x, (o.face ? o.face[1] : CZ) - o.z); NPCS.push(o); occCircle(o.x, o.z, 1.2); return o; }
  function talkTo(n) { if (n && n.talk) n.talk(n); else toast((n && n.name) || '…'); }
  function service(x, z, label, action, r) { const s = { x, z, label, action, r: r || 3 }; SERV.push(s); return s; }

  /* ------------------------------------------------------------ plaza centre: fountain + statue + star obelisks */
  const FOUNT = { x: 0, z: 452, r: 6.6, jets: [] };
  function buildPlazaCentre() {
    const x = FOUNT.x, z = FOUNT.z, g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, 0);
    const st = '#b8ad98', dk = '#8f8572';
    // octagonal basin, two tiers
    K.vc.add(GEO.cyl, dk, 0, 0.0, 0, 6.9, 0.5, 6.9);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + PI / 8; K.vc.add(GEO.box, st, Math.cos(a) * 6.45, 0.55, Math.sin(a) * 6.45, 0.7, 0.9, 5.4, 0, -a, 0); K.vc.add(GEO.box, shade(st, 0.12), Math.cos(a) * 6.45, 1.05, Math.sin(a) * 6.45, 0.95, 0.15, 5.6, 0, -a, 0); }
    K.vc.add(GEO.cyl, '#6f6656', 0, 0.35, 0, 6.2, 0.4, 6.2);
    K.vc.add(GEO.cyl12, st, 0, 1.4, 0, 1.4, 2.2, 1.4);
    K.vc.add(GEO.cyl12, st, 0, 2.6, 0, 3.2, 0.35, 3.2);
    K.vc.add(GEO.cyl12, shade(st, 0.1), 0, 2.85, 0, 3.35, 0.15, 3.35);
    K.vc.add(GEO.cyl12, st, 0, 3.8, 0, 0.8, 2.0, 0.8);
    // lion-head spouts on the pillar
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; K.met.add(GEO.sph, '#c9a24a', Math.cos(a) * 1.42, 1.9, Math.sin(a) * 1.42, 0.32, 0.36, 0.32); }
    // statue: Aurelion, the First Summoned, raising a star
    const sx = 0, sy = 4.8;
    K.vc.add(GEO.cyl6, '#d9d2c2', sx, sy + 0.25, 0, 0.9, 0.5, 0.9);
    K.vc.add(GEO.cone, '#e0d9c8', sx, sy + 1.6, 0, 0.75, 2.4, 0.75);
    K.vc.add(GEO.box, '#e0d9c8', sx, sy + 2.55, 0, 0.75, 0.75, 0.45);
    K.vc.add(GEO.sph, '#e6dfcf', sx, sy + 3.15, 0, 0.32, 0.36, 0.32);
    K.vc.add(GEO.cone, '#d9d2c2', sx, sy + 2.9, -0.32, 0.55, 1.6, 0.25, 0.35, 0, 0);
    K.vc.add(GEO.box, '#e0d9c8', sx + 0.48, sy + 3.25, 0, 0.18, 1.3, 0.18, 0, 0, -0.35);
    K.vc.add(GEO.box, '#e0d9c8', sx - 0.5, sy + 2.2, 0.15, 0.17, 1.0, 0.17, 0.3, 0, 0.25);
    K.met.add(GEO.cyl6, '#c9a24a', sx - 0.62, sy + 2.0, 0.3, 0.05, 2.6, 0.05, 0.12, 0, 0.2);
    K.glow.add(GEO.oct, hdr('#ffe08a', 3.2), sx + 0.75, sy + 4.15, 0, 0.32, 0.45, 0.32);
    BIGLIGHTS.push({ x: x + 0.75, y: g0 + sy + 4.15, z, c: '#ffd36b', s: 7 });
    // water surfaces
    const w1 = new T.Mesh(new T.CircleGeometry(6.15, 32), MAT.water); w1.rotation.x = -PI / 2; w1.position.set(x, g0 + 0.72, z); ROOT.add(w1);
    const w2 = new T.Mesh(new T.CircleGeometry(3.1, 24), MAT.water); w2.rotation.x = -PI / 2; w2.position.set(x, g0 + 2.82, z); ROOT.add(w2);
    // animated water jets (thin translucent arcs)
    const jm = new T.MeshBasicMaterial({ color: hdr('#cfefff', 1.3), transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + PI / 8, pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new T.Vector3(Math.cos(a) * (3.2 + t * 2.4), 2.9 + Math.sin(t * PI) * 1.3 - t * 2.1, Math.sin(a) * (3.2 + t * 2.4))); }
      const jt = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.07, 4), jm); jt.position.set(x, g0, z); ROOT.add(jt); FOUNT.jets.push(jt);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU, pts = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new T.Vector3(Math.cos(a) * (1.5 + t * 1.6), 1.9 + Math.sin(t * PI) * 0.5 - t * 1.2, Math.sin(a) * (1.5 + t * 1.6))); }
      const jt = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 10, 0.09, 4), jm); jt.position.set(x, g0, z); ROOT.add(jt); FOUNT.jets.push(jt);
    }
    FOUNT.y = g0;
    coll(x, z, 6.9); occCircle(x, z, 7.5);
    // the eight star obelisks of the plaza
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + PI / 8, ox = CX + Math.cos(a) * 22, oz = CZ + Math.sin(a) * 22;
      if (nearestRoad(ox, oz).s && gapOnRim(ox, oz)) continue;
      const og = gnd(ox, oz), K2 = kits(ox, oz); frameAll(K2, ox, og, oz, -a);
      K2.vc.add(GEO.box, '#9a917f', 0, 0.3, 0, 1.3, 0.6, 1.3); K2.vc.add(GEO.cone4, '#b9b09c', 0, 2.4, 0, 0.6, 3.8, 0.6, 0, PI / 4, 0);
      K2.glow.add(GEO.oct, hdr('#9fd8ff', 2.4), 0, 4.6, 0, 0.22, 0.34, 0.22);
      BIGLIGHTS.push({ x: ox, y: og + 4.6, z: oz, c: '#9fd8ff', s: 3 });
      coll(ox, oz, 0.8); occCircle(ox, oz, 1.2);
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; const bx = CX + Math.cos(a) * 16, bz = CZ + Math.sin(a) * 16; if (Math.hypot(bx - FOUNT.x, bz - FOUNT.z) < 10 || gapOnRim(bx, bz)) continue; bench(bx, bz, -a - PI / 2); }
    BLD.push({ x, z, w: 13, d: 13, ry: 0, kind: 'fountain', name: 'Fontana di Aurelion' });
  }

  /* ------------------------------------------------------------ Guild Hall (timber hall, porch, sign) */
  function buildGuildHall() {
    const x = 30, z = 437.5, w = 28, d = 15, ry = 0;
    const { K, y, s } = B(x, z, w, d, ry, '#857c6c');
    const wood = '#5a3e28', dark = '#3a2618', plaster = '#e6d6b2', roof = '#7a3a28';
    K.vc.add(GEO.box, '#8f877a', 0, 1.8, 0, w, 3.6, d);
    K.vc.add(GEO.box, plaster, 0, 3.6 + 2.0, 0, w + 0.6, 4.0, d + 0.6);
    K.vc.add(GEO.box, dark, 0, 3.65, 0, w + 0.8, 0.3, d + 0.8);
    for (let i = 0; i <= 8; i++) for (const sz of [-1, 1]) K.vc.add(GEO.box, dark, -w / 2 - 0.3 + i * (w + 0.6) / 8, 5.6, sz * (d / 2 + 0.33), 0.26, 4.0, 0.12);
    for (let i = 0; i < 8; i++) for (const sz of [-1, 1]) K.vc.add(GEO.box, dark, -w / 2 + (i + 0.5) * (w + 0.6) / 8 - 0.3, 5.6, sz * (d / 2 + 0.36), 0.16, 4.2, 0.08, 0, 0, (i % 2 ? 0.7 : -0.7));
    gable(K, w + 0.6, d + 0.6, 7.6, 5.2, roof, plaster);
    // dormers
    for (const dx of [-8, 0, 8]) for (const sz of [-1, 1]) {
      K.vc.add(GEO.box, plaster, dx, 9.0, sz * 3.6, 2.2, 1.8, 2.2); gable(K, 2.4, 2.2, 9.9, 1.0, roof, plaster, dx, sz * 3.6, 0.3);
      K.win.add(GEO.box, C('#ffcf7a'), dx, 9.0, sz * 4.72, 1.0, 1.0, 0.1);
    }
    // bell cupola + weathervane
    K.vc.add(GEO.box, plaster, 0, 13.4, 0, 2.6, 2.4, 2.6); K.vc.add(GEO.cone4, roof, 0, 15.6, 0, 2.3, 2.2, 2.3, 0, PI / 4, 0);
    K.met.add(GEO.cyl6, '#c9a24a', 0, 17.4, 0, 0.05, 1.6, 0.05); K.met.add(GEO.box, '#c9a24a', 0.3, 17.9, 0, 0.8, 0.3, 0.04);
    K.met.add(GEO.sph, '#b08a3a', 0, 13.2, 0, 0.55, 0.6, 0.55);
    // windows
    for (const sz of [-1, 1]) { winRow(K, 8, w, 1.9, sz * (d / 2 + 0.05), 0.9, 1.3, 0.8); winRow(K, 8, w, 5.7, sz * (d / 2 + 0.36), 1.0, 1.5, 0.85); }
    // porch: posts, beams, lean-to roof (high enough for the camera to see inside)
    const pd = 9, pz0 = d / 2;
    for (const px of [-13.5, -8, 8, 13.5]) { K.vc.add(GEO.box, wood, px, 2.3, pz0 + pd - 0.3, 0.5, 4.6, 0.5); K.vc.add(GEO.box, '#8f877a', px, 0.2, pz0 + pd - 0.3, 0.8, 0.4, 0.8); coll(...wp(x, z, ry, px, pz0 + pd - 0.3), 0.45); }
    K.vc.add(GEO.box, wood, 0, 4.7, pz0 + pd - 0.3, w, 0.45, 0.5);
    const pa = Math.atan2(1.0, pd);
    K.vc.add(GEO.box, roof, 0, 5.55, pz0 + pd / 2, w + 0.8, 0.22, pd + 0.6, pa, 0, 0);
    for (let i = 0; i < 7; i++) K.vc.add(GEO.box, wood, -w / 2 + 1 + i * (w - 2) / 6, 5.2, pz0 + pd / 2, 0.22, 0.25, pd, pa, 0, 0);
    // big double door and the great sign with emblem
    K.vc.add(GEO.box, dark, 0, 1.9, d / 2 + 0.06, 3.4, 3.6, 0.15);
    K.vc.add(GEO.arch, '#7f776a', 0, 0, d / 2 + 0.1, 2.0, 3.0, 0.4);
    K.met.add(GEO.tor, '#c9a24a', -0.5, 1.8, d / 2 + 0.2, 0.18, 0.18, 0.18); K.met.add(GEO.tor, '#c9a24a', 0.5, 1.8, d / 2 + 0.2, 0.18, 0.18, 0.18);
    const [sx, sz] = wp(x, z, ry, 0, d / 2 + pd - 0.05);
    sign('GILDA DEGLI AVVENTURIERI', sx, y + 5.75, sz + 0.0, ry, 9, { bg: '#2a4a3a', fg: '#f3d27a' });
    // emblem shield above the door (inside the porch)
    K.vc.add(GEO.box, '#2a4a3a', 0, 6.4, d / 2 + 0.4, 2.2, 2.4, 0.15); K.met.add(GEO.box, '#c9a24a', 0, 6.4, d / 2 + 0.5, 0.18, 2.2, 0.06, 0, 0, 0.7); K.met.add(GEO.box, '#c9a24a', 0, 6.4, d / 2 + 0.5, 0.18, 2.2, 0.06, 0, 0, -0.7);
    // lanterns + banners
    for (const px of [-8, 8]) { K.lamp.add(GEO.box, C('#ffc070'), px, 3.9, pz0 + pd - 0.3, 0.35, 0.5, 0.35); const [lx, lz] = wp(x, z, ry, px, pz0 + pd - 0.3); LAMPS.push({ x: lx, y: y + 3.9, z: lz, c: '#ffb860', s: 4 }); }
    for (const px of [-13.6, 13.6]) banner(...[wp(x, z, ry, px, d / 2 + 0.5)[0], y + 7.2, wp(x, z, ry, px, d / 2 + 0.5)[1]], ry, '#2a5a46', 3.4);
    collRect(x, z, w + 0.8, d + 0.8, ry, 0);
    occupy(x, z + 4.5, w + 1, d + pd + 1, ry, 0.5);
    BLD.push({ x, z, w, d, ry, kind: 'guild', name: 'Gilda degli Avventurieri' });
    void s;
  }

  /* ------------------------------------------------------------ Tavern "Locanda della Luna Storta" */
  function buildTavern() {
    const x = 41, z = 500.5, w = 15, d = 10.5, ry = PI;
    const { K, y } = B(x, z, w, d, ry, '#857c6c');
    const plaster = '#e8d8b8', dark = '#3a2618', roof = '#5a3a2a';
    K.vc.add(GEO.box, '#8a8070', 0, 1.7, 0, w, 3.4, d);
    K.vc.add(GEO.box, plaster, 0, 3.4 + 1.7, 0, w + 0.5, 3.4, d + 0.5);
    K.vc.add(GEO.box, plaster, 0, 6.8 + 1.5, 0, w + 0.9, 3.0, d + 0.9);
    for (const yy of [3.4, 6.8]) K.vc.add(GEO.box, dark, 0, yy + 0.05, 0, w + (yy > 5 ? 1.0 : 0.6), 0.25, d + (yy > 5 ? 1.0 : 0.6));
    for (let i = 0; i <= 6; i++) for (const sz of [-1, 1]) { K.vc.add(GEO.box, dark, -w / 2 + i * w / 6, 5.1, sz * (d / 2 + 0.27), 0.22, 3.4, 0.1); K.vc.add(GEO.box, dark, -w / 2 + i * w / 6, 8.3, sz * (d / 2 + 0.47), 0.22, 3.0, 0.1); }
    gable(K, w + 0.9, d + 0.9, 9.8, 4.0, roof, plaster);
    for (const sz of [-1, 1]) { winRow(K, 5, w, 1.8, sz * (d / 2 + 0.05), 1.0, 1.2, 0.95); winRow(K, 5, w, 5.2, sz * (d / 2 + 0.3), 0.9, 1.3, 0.85); winRow(K, 4, w, 8.4, sz * (d / 2 + 0.5), 0.9, 1.2, 0.7); }
    // chimneys
    for (const cx of [-5, 5]) { K.vc.add(GEO.box, '#7a6e62', cx, 11.5, -1.5, 1.0, 4, 1.0); const [chx, chz] = wp(x, z, ry, cx, -1.5); CHIMNEYS.push({ x: chx, y: y + 13.6, z: chz }); }
    K.vc.add(GEO.box, dark, 0, 1.3, d / 2 + 0.06, 1.8, 2.6, 0.14);
    // hanging sign: crooked moon
    K.met.add(GEO.box, '#2a2826', 3.2, 4.0, d / 2 + 1.0, 0.08, 0.08, 2.0);
    const [sx, sz] = wp(x, z, ry, 3.2, d / 2 + 1.7);
    sign('LUNA STORTA', sx, y + 3.4, sz, ry + PI / 2, 2.6, { bg: '#2a2050', fg: '#ffe7a8', icon: '☾' });
    K.glow.add(GEO.box, hdr('#ffd36b', 1.2), 0, 7.3, d / 2 + 0.75, 0.9, 0.9, 0.05, 0, 0, 0.6);
    // terrace: tables, benches, barrels, umbrellas
    const T0 = [[-5.5, 3.2], [0.5, 3.0], [5.8, 2.6]];
    for (const [tx, tz] of T0) {
      const [wx, wz] = wp(x, z, ry, tx, d / 2 + tz + 0.6); const gy = gnd(wx, wz) - y;
      K.vc.add(GEO.cyl, '#6a4a30', tx, gy + 0.78, d / 2 + tz + 0.6, 0.75, 0.08, 0.75); K.vc.add(GEO.cyl6, '#4a3424', tx, gy + 0.4, d / 2 + tz + 0.6, 0.1, 0.8, 0.1);
      for (const bs of [-1, 1]) K.vc.add(GEO.box, '#6a4a30', tx + bs * 1.15, gy + 0.45, d / 2 + tz + 0.6, 0.35, 0.1, 1.4);
      K.met.add(GEO.cyl6, '#c9b090', tx, gy + 1.8, d / 2 + tz + 0.6, 0.04, 2.0, 0.04);
      K.flag.add(GEO.cone, rpick(['#b03a2a', '#2a6a4a', '#d8b060']), tx, gy + 2.7, d / 2 + tz + 0.6, 1.4, 0.6, 1.4);
      K.met.add(GEO.cyl6, '#d8c8a0', tx + 0.2, gy + 0.95, d / 2 + tz + 0.5, 0.08, 0.25, 0.08);
      coll(wx, wz, 0.9);
    }
    // innkeeper's outdoor bar
    for (let i = 0; i < 3; i++) K.vc.add(GEO.cyl, '#7a5a38', -1 + i * 1.0, 0.5, d / 2 + 1.3 + 0.0, 0.42, 1.0, 0.42);
    K.vc.add(GEO.box, '#5a3e28', 0, 1.05, d / 2 + 1.3, 3.4, 0.12, 0.8);
    for (const lx of [-6.8, 6.8]) { K.lamp.add(GEO.box, C('#ffc070'), lx, 2.4, d / 2 + 0.3, 0.3, 0.42, 0.3); const [ax, az] = wp(x, z, ry, lx, d / 2 + 0.35); LAMPS.push({ x: ax, y: y + 2.4, z: az, c: '#ffb860', s: 3.6 }); }
    collRect(x, z, w + 0.6, d + 0.6, ry, 0);
    occupy(x, z - 3.5, w + 1, d + 8, ry, 0.4);
    const [ix, iz] = wp(x, z, ry, 0, d / 2 + 2.5);
    BLD.push({ x, z, w, d, ry, kind: 'tavern', name: 'Locanda della Luna Storta' });
    return { ix, iz };
  }

  /* ------------------------------------------------------------ Shops street */
  const SHOPS = [
    { kind: 'weapons', name: 'Armeria "Lama d\'Argento"', sign: 'ARMERIA', icon: '⚔', x: -34, z: 456, bz: 456, col: '#6a2a24', keeper: 'Bruno Ferrabraccio' },
    { kind: 'armor', name: 'Corazzeria "Scudo di Quercia"', sign: 'CORAZZE', icon: '⛨', x: -34, z: 468, bz: 465.6, col: '#2a3e5a', keeper: 'Hilde Martelluna' },
    { kind: 'magic', name: 'Emporio Arcano "Occhio di Vetro"', sign: 'ARCANO', icon: '✦', x: -34, z: 480, bz: 481, col: '#3a2a5a', keeper: 'Mirabel Quattrolune' },
    { kind: 'potions', name: 'Alchimie "Il Calderone Felice"', sign: 'POZIONI', icon: '⚗', x: -34, z: 492, bz: 492, col: '#2a5a3a', keeper: 'Fennick Bollicina' },
    { kind: 'general', name: 'Bottega "Tutto Serve"', sign: 'BOTTEGA', icon: '⚖', x: -22, z: 500, bz: 509, col: '#5a4a2a', keeper: 'Oddone Tuttofare' },
  ];
  function buildShops() {
    for (const sh of SHOPS) {
      const west = sh.kind !== 'general';
      const w = west ? 7.2 : 12, d = west ? 9.5 : 8.5;
      const x = west ? -42.2 : -22, z = sh.bz, ry = west ? PI / 2 : PI;
      const { K, y } = B(x, z, w, d, ry, '#857c6c');
      const wallC = rpick(WALLS.euro), roof = rpick(ROOFS.euro), dark = '#3a2a1e';
      K.vc.add(GEO.box, '#8f877a', 0, 1.7, 0, w, 3.4, d);
      K.vc.add(GEO.box, wallC, 0, 3.4 + 1.6, 0, w + 0.4, 3.2, d + 0.4);
      K.vc.add(GEO.box, dark, 0, 3.45, 0, w + 0.55, 0.22, d + 0.55);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.vc.add(GEO.box, dark, sx * (w / 2 + 0.2), 5.0, sz * (d / 2 + 0.2), 0.22, 3.2, 0.22);
      gable(K, w + 0.4, d + 0.4, 6.6, 2.6, roof, wallC);
      // open shop front: big window + door
      K.win.add(GEO.box, C('#ffd9a0'), -w * 0.22, 1.7, d / 2 + 0.05, w * 0.4, 1.8, 0.1);
      K.vc.add(GEO.box, dark, w * 0.25, 1.2, d / 2 + 0.05, 1.3, 2.4, 0.12);
      winRow(K, 2, w, 5.1, d / 2 + 0.25, 0.9, 1.2, 0.8);
      // striped awning over the counter (the keeper stands between the shop and the counter)
      const kz = west ? sh.x - x : z - sh.z, cz = kz + 1.1, aw = cz - d / 2 + 0.25, stripes = 8;
      for (let i = 0; i < stripes; i++) K.flag.add(GEO.plane, i % 2 ? sh.col : '#efe2c8', -w / 2 + (i + 0.5) * (w / stripes), 3.1, d / 2 + aw / 2 + 0.2, w / stripes + 0.02, aw, 1, -PI / 2 + 0.32, 0, 0);
      for (const sx of [-1, 1]) { K.vc.add(GEO.cyl6, dark, sx * (w / 2 - 0.2), 1.45, d / 2 + aw, 0.08, 2.9, 0.08); }
      // counter + goods
      K.vc.add(GEO.box, '#6a4a30', 0, 0.5, cz, w * 0.62, 1.0, 0.7); K.vc.add(GEO.box, '#4a3424', 0, 1.04, cz, w * 0.66, 0.1, 0.85);
      const goods = sh.kind;
      for (let i = 0; i < 5; i++) {
        const gx = (i - 2) * (w * 0.12);
        if (goods === 'weapons') { K.met.add(GEO.box, '#c8ccd4', gx, 1.5, cz, 0.06, 0.9, 0.12, 0, 0, rr(-0.3, 0.3)); K.met.add(GEO.box, '#8a6a2a', gx, 1.1, cz, 0.3, 0.06, 0.08); }
        else if (goods === 'armor') { K.met.add(GEO.sph, rpick(['#9aa0a8', '#b8bcc4', '#7a5a3a']), gx, 1.3, cz, 0.28, 0.2, 0.28); }
        else if (goods === 'magic') { K.glow.add(GEO.oct, hdr(rpick(['#b388ff', '#7df9ff', '#ff7ad8']), 2), gx, 1.35, cz, 0.16, 0.24, 0.16); K.vc.add(GEO.box, rpick(['#5a2a2a', '#2a3a5a', '#3a5a2a']), gx + 0.2, 1.17, cz, 0.3, 0.12, 0.22); }
        else if (goods === 'potions') { K.glow.add(GEO.sph, hdr(rpick(['#ff5a5a', '#5a9aff', '#7aff7a', '#ffd35a']), 1.6), gx, 1.28, cz, 0.13, 0.17, 0.13); K.vc.add(GEO.cyl6, '#c8b88a', gx, 1.48, cz, 0.04, 0.12, 0.04); }
        else { K.vc.add(GEO.box, rpick(['#a07a4a', '#c8a870', '#8a6a3a']), gx, 1.25, cz, 0.35, 0.35, 0.35, 0, rr(0, 1), 0); }
      }
      // display rack / props outside
      if (goods === 'weapons') for (let i = 0; i < 4; i++) K.met.add(GEO.box, '#c8ccd4', w / 2 - 0.6, 1.2, d / 2 + 0.8 + i * 0.5, 0.06, 1.6, 0.1, 0.12, 0, 0);
      if (goods === 'armor') { K.vc.add(GEO.cyl6, '#4a3424', w / 2 - 0.9, 0.8, d / 2 + 1.6, 0.06, 1.6, 0.06); K.met.add(GEO.box, '#9aa0a8', w / 2 - 0.9, 1.4, d / 2 + 1.6, 0.6, 0.7, 0.35); K.met.add(GEO.sph, '#9aa0a8', w / 2 - 0.9, 2.0, d / 2 + 1.6, 0.22, 0.26, 0.22); }
      if (goods === 'magic') { K.glow.add(GEO.oct, hdr('#b388ff', 2.6), w / 2 - 0.8, 2.3, d / 2 + 1.2, 0.3, 0.5, 0.3); const [gx, gz] = wp(x, z, ry, w / 2 - 0.8, d / 2 + 1.2); BIGLIGHTS.push({ x: gx, y: y + 2.3, z: gz, c: '#b388ff', s: 3 }); }
      if (goods === 'potions') for (let i = 0; i < 3; i++) K.vc.add(GEO.cyl, '#7a5a38', w / 2 - 0.8, 0.45, d / 2 + 0.9 + i * 0.9, 0.4, 0.9, 0.4);
      if (goods === 'general') { crates(...wp(x, z, ry, -w / 2 + 0.6, d / 2 + 1.5)); }
      // hanging sign
      const [sx, sz] = wp(x, z, ry, -w / 2 + 0.9, d / 2 + aw + 0.2);
      sign(sh.sign, sx, y + 3.6, sz, ry, 2.8, { bg: sh.col, fg: '#f3d27a', icon: sh.icon });
      collRect(x, z, w + 0.5, d + 0.5, ry, 0);
      const [ccx, ccz] = wp(x, z, ry, 0, cz); coll(ccx, ccz, 0.55);
      occupy(x, z, w + 1, d + 1, ry, 0.3);
      const nx = sh.x, nz = sh.z;
      sh.npc = npc({ id: 'shop_' + sh.kind, name: sh.keeper, title: sh.name, x: nx, z: nz, face: west ? [nx + 6, nz] : [nx, nz - 6], look: shopLook(sh.kind), role: 'shop', kind: sh.kind });
      const [ix, iz] = west ? [nx + 3.2, nz] : [nx, nz - 3.0];
      service(ix, iz, 'Bottega: ' + sh.keeper + ' (' + sh.sign.toLowerCase() + ')', () => talkTo(sh.npc), 3.2);
      BLD.push({ x, z, w, d, ry, kind: 'shop', name: sh.name });
    }
  }
  function shopLook(kind) {
    return { weapons: { skin: '#d9a57a', cloth: '#6a2a24', hair: '#2a1a10', hat: 'none', apron: '#3a2a1e', beard: true, burly: true },
      armor: { skin: '#f0c8a8', cloth: '#2a3e5a', hair: '#c8a040', hat: 'none', apron: '#4a3a2a', burly: true },
      magic: { skin: '#f4dcc8', cloth: '#3a2a5a', hair: '#e8e8f0', hat: 'wizard', hatC: '#2a1a4a' },
      potions: { skin: '#e8c0a0', cloth: '#2a5a3a', hair: '#7a3a1a', hat: 'cap', hatC: '#3a6a3a', child: false },
      general: { skin: '#d9b08a', cloth: '#5a4a2a', hair: '#3a2a1a', hat: 'straw', hatC: '#d8c080' } }[kind];
  }

  /* ------------------------------------------------------------ Bank "Banco dei Mille Mondi" */
  function buildBank() {
    const x = -15, z = 434, w = 14, d = 9.5, ry = 0;
    const { K, y } = B(x, z, w, d, ry, '#9a9282');
    const marble = '#e8e2d4', gold = '#c9a24a';
    K.vc.add(GEO.box, marble, 0, 3.2, 0, w, 6.4, d);
    K.vc.add(GEO.box, shade(marble, -0.1), 0, 6.6, 0, w + 0.6, 0.5, d + 0.6);
    // portico with columns and pediment
    for (let i = 0; i < 6; i++) { const cx = -w / 2 + 1 + i * (w - 2) / 5; K.vc.add(GEO.cyl12, marble, cx, 3.0, d / 2 + 2.2, 0.38, 6.0, 0.38); K.vc.add(GEO.box, shade(marble, -0.08), cx, 0.15, d / 2 + 2.2, 0.95, 0.3, 0.95); K.vc.add(GEO.box, shade(marble, -0.05), cx, 6.05, d / 2 + 2.2, 0.95, 0.25, 0.95); coll(...wp(x, z, ry, cx, d / 2 + 2.2), 0.45); }
    K.vc.add(GEO.box, marble, 0, 6.5, d / 2 + 1.2, w + 0.4, 0.6, 2.8);
    K.vc.add(GEO.prism, marble, 0, 6.8, d / 2 + 1.1, w + 0.4, 2.0, 3.0, 0, PI / 2, 0);
    K.vc.add(GEO.prism, shade('#3f4f6e', 0), 0, 6.8, 0, w + 0.8, 2.4, d + 1.0);
    K.met.add(GEO.cyl12, gold, 0, 7.7, d / 2 + 2.62, 0.55, 0.08, 0.55, PI / 2, 0, 0);
    K.glow.add(GEO.oct, hdr('#ffd36b', 1.6), 0, 7.7, d / 2 + 2.7, 0.22, 0.3, 0.06);
    K.met.add(GEO.box, '#5a4a3a', 0, 1.6, d / 2 + 0.05, 2.0, 3.2, 0.15);
    K.met.add(GEO.box, gold, 0, 1.6, d / 2 + 0.14, 0.12, 3.0, 0.04);
    winRow(K, 4, w, 4.2, d / 2 + 0.05, 0.9, 1.8, 0.5);
    const [sx, sz] = wp(x, z, ry, 0, d / 2 + 2.6);
    sign('BANCO DEI MILLE MONDI', sx, y + 5.2, sz, ry, 6.0, { bg: '#1e2a40', fg: '#f3d27a' });
    collRect(x, z, w + 0.6, d + 0.6, ry, 0);
    occupy(x, z + 1.5, w + 1, d + 4, ry, 0.3);
    BLD.push({ x, z, w, d, ry, kind: 'bank', name: 'Banco dei Mille Mondi' });
  }

  /* ------------------------------------------------------------ Academy of Magic (floating crystals) */
  const ACAD = { x: 0, z: 378, crystals: [], rings: [], y: 0 };
  function buildAcademy() {
    const x = ACAD.x, z = ACAD.z, w = 40, d = 26, ry = 0;
    const { K, y } = B(x, z, w, d, ry, '#8a8296');
    ACAD.y = y;
    const stone = '#cfc8d8', dk = '#8a80a0', roof = '#3a3f6e', gold = '#c9a24a';
    // wings
    for (const sx of [-1, 1]) {
      K.vc.add(GEO.box, stone, sx * 12, 5, 0, 14, 10, d);
      gable(K, 14, d, 10, 5.5, roof, stone, sx * 12, 0);
      for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) {
        const wx = sx * 12 + (i - 1.5) * 3.2;
        K.stain.add(GEO.box, C(rpick(['#7a5aff', '#5ac8ff', '#ff7ad8', '#ffd35a'])), wx, 4.6, sz * (d / 2 + 0.05), 1.1, 3.2, 0.1);
        K.vc.add(GEO.cone4, stone, wx, 6.6, sz * (d / 2 + 0.05), 0.82, 0.9, 0.14, 0, PI / 4, 0);
        K.vc.add(GEO.box, dk, wx + 1.6, 5, sz * (d / 2 + 0.25), 0.5, 10, 0.5);
      }
      // corner turrets with pointed roofs
      for (const sz of [-1, 1]) { K.vc.add(GEO.cyl12, stone, sx * 19, 7, sz * 12.5, 1.6, 14, 1.6); K.vc.add(GEO.cone12, roof, sx * 19, 16, sz * 12.5, 2.0, 4.5, 2.0); K.glow.add(GEO.oct, hdr('#b388ff', 2), sx * 19, 18.6, sz * 12.5, 0.2, 0.35, 0.2); }
    }
    // central tower + dome + spire
    K.vc.add(GEO.cyl16, stone, 0, 11, 0, 6.5, 22, 6.5);
    K.vc.add(GEO.cyl16, dk, 0, 22.3, 0, 7.2, 0.8, 7.2);
    K.vc.add(GEO.dome, '#4a4f8e', 0, 22.6, 0, 6.3, 5.6, 6.3);
    K.vc.add(GEO.cyl12, stone, 0, 29.2, 0, 1.4, 3.2, 1.4);
    K.vc.add(GEO.cone12, roof, 0, 33.5, 0, 1.7, 5.6, 1.7);
    K.met.add(GEO.cyl6, gold, 0, 37.5, 0, 0.07, 2.5, 0.07);
    K.glow.add(GEO.oct, hdr('#c9a0ff', 3.2), 0, 39, 0, 0.5, 0.8, 0.5);
    BIGLIGHTS.push({ x, y: y + 39, z, c: '#c9a0ff', s: 9 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; K.stain.add(GEO.box, C(i % 2 ? '#7a5aff' : '#5ac8ff'), Math.cos(a) * 6.52, 15, Math.sin(a) * 6.52, 1.0, 3.6, 0.1, 0, -a + PI / 2, 0); }
    // grand entrance (south) with stairs and arch
    K.vc.add(GEO.box, stone, 0, 4.5, d / 2 + 1.0, 9, 9, 3);
    K.vc.add(GEO.arch, dk, 0, 0, d / 2 + 2.6, 2.4, 4.6, 0.6);
    K.vc.add(GEO.box, '#2a2040', 0, 2.6, d / 2 + 2.5, 3.6, 5.2, 0.1);
    K.vc.add(GEO.prism, roof, 0, 9, d / 2 + 1.0, 9.6, 3, 3.6, 0, PI / 2, 0);
    K.stain.add(GEO.cyl16, C('#9a7aff'), 0, 7.0, d / 2 + 2.56, 1.3, 0.1, 1.3, PI / 2, 0, 0);
    const [sx, sz] = wp(x, z, ry, 0, d / 2 + 2.75);
    sign('ACCADEMIA ARCANA', sx, y + 10.0, sz + 0.0, ry, 6.5, { bg: '#2a2050', fg: '#e8d8ff', icon: '✧' });
    steps(K, x, z, ry, { y, mn: y - 3 }, 7, d + 5, 0, '#a8a0b8');
    // floating crystals (animated)
    const cm = new T.MeshStandardMaterial({ color: '#b9a0ff', emissive: hdr('#7a4aff', 1.4), roughness: 0.15, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.92 });
    const cm2 = new T.MeshStandardMaterial({ color: '#a0f0ff', emissive: hdr('#3ac8ff', 1.4), roughness: 0.15, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(GEO.oct, i % 2 ? cm2 : cm); m.scale.set(1.3, 2.6, 1.3); m.castShadow = !LOW;
      ROOT.add(m); ACAD.crystals.push({ m, a: (i / 4) * TAU, r: 13, h: 24 + (i % 2) * 3, s: 1 });
    }
    for (let i = 0; i < 10; i++) { const m = new T.Mesh(GEO.oct, i % 2 ? cm : cm2); m.scale.set(0.35, 0.7, 0.35); ROOT.add(m); ACAD.crystals.push({ m, a: (i / 10) * TAU, r: 8.5, h: 30 + Math.sin(i) * 1.5, s: -1.7 }); }
    const rm = new T.MeshBasicMaterial({ color: hdr('#b388ff', 2.2), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending });
    for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.TorusGeometry(9 + i * 1.6, 0.06, 4, 64), rm); r.position.set(x, y + 25 + i * 1.2, z); ROOT.add(r); ACAD.rings.push(r); }
    // rune circle on the courtyard floor (glows at night)
    const rc = new T.Mesh(new T.RingGeometry(7.4, 7.9, 64), new T.MeshBasicMaterial({ color: hdr('#9a7aff', 1.6), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
    rc.rotation.x = -PI / 2; rc.position.set(x, gnd(x, 409) + 0.2, 409); ROOT.add(rc); ACAD.rune = rc;
    collRect(x, z, w + 1, d + 1, ry, 0);
    collRect(x, z + d / 2 + 1.5, 9.5, 3.4, ry, 0);
    occupy(x, z, w + 2, d + 6, ry, 0.5);
    BLD.push({ x, z, w, d, ry, kind: 'academy', name: 'Accademia Arcana' });
    // far silhouette
    const fm = new T.Mesh(GEO.cyl16, std(stone, 0.8)); fm.position.set(x, y + 11, z); fm.scale.set(6.5, 22, 6.5); FAR.add(fm);
    const fd = new T.Mesh(GEO.cone12, std(roof, 0.8)); fd.position.set(x, y + 30, z); fd.scale.set(5, 14, 5); FAR.add(fd);
  }

  /* ------------------------------------------------------------ Royal Castle */
  function buildCastle() {
    const x = 0, z = 565, w = 44, d = 33, ry = PI;
    const { K, y } = B(x, z, w, d, ry, '#8a8274');
    const st = '#c2b9a6', dk = '#958c78', roof = '#2f4f8a', gold = '#d4b050';
    // curtain walls
    for (const sz of [-1, 1]) K.vc.add(GEO.box, st, 0, 5, sz * (d / 2 - 1), w - 4, 10, 2.2);
    for (const sx of [-1, 1]) K.vc.add(GEO.box, st, sx * (w / 2 - 1), 5, 0, 2.2, 10, d - 4);
    for (let i = 0; i < 20; i++) { const t = (i / 19 - 0.5) * (w - 6); for (const sz of [-1, 1]) K.vc.add(GEO.box, st, t, 10.6, sz * (d / 2 - 1), 1.0, 1.2, 2.4); }
    // corner towers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tx = sx * (w / 2 - 1.5), tz = sz * (d / 2 - 1.5);
      K.vc.add(GEO.cyl12, st, tx, 8, tz, 3.4, 16, 3.4); K.vc.add(GEO.cyl12, dk, tx, 16.3, tz, 3.8, 0.6, 3.8);
      K.vc.add(GEO.cone12, roof, tx, 20.5, tz, 3.7, 8, 3.7);
      K.met.add(GEO.cyl6, gold, tx, 25.4, tz, 0.06, 2, 0.06); K.flag.add(GEO.plane, '#2f4f8a', tx + 0.8, 25.9, tz, 1.6, 0.9, 1);
      for (let k = 0; k < 3; k++) K.win.add(GEO.box, C('#ffcf7a'), tx + sx * 0.1, 5 + k * 3.6, tz + sz * 3.42, 0.6, 1.2, 0.1);
    }
    // gatehouse facing the city (local +z)
    K.vc.add(GEO.box, st, 0, 7, d / 2, 12, 14, 4);
    K.vc.add(GEO.arch, dk, 0, 0, d / 2 + 1.6, 2.6, 5.4, 1.2);
    K.met.add(GEO.box, gold, 0, 3.1, d / 2 + 1.75, 4.0, 6.0, 0.12);
    for (let i = -2; i <= 2; i++) K.met.add(GEO.box, '#8a6a20', i * 0.75, 3.1, d / 2 + 1.84, 0.1, 5.8, 0.06);
    for (const sx of [-1, 1]) { K.vc.add(GEO.cyl12, st, sx * 6.5, 9, d / 2 + 1.2, 2.2, 18, 2.2); K.vc.add(GEO.cone12, roof, sx * 6.5, 21.2, d / 2 + 1.2, 2.5, 6.5, 2.5); K.met.add(GEO.cyl6, gold, sx * 6.5, 25.3, d / 2 + 1.2, 0.05, 1.8, 0.05); }
    for (let i = -2; i <= 2; i++) K.vc.add(GEO.box, st, i * 2.4, 14.6, d / 2 + 1.6, 1.0, 1.2, 1.0);
    // royal banners on the gatehouse
    for (const sx of [-1, 1]) { K.flag.add(GEO.plane, '#2f4f8a', sx * 3.4, 9.2, d / 2 + 2.08, 6, 2.0, 1, 0, 0, PI / 2); K.flag.add(GEO.plane, gold, sx * 3.4, 9.2, d / 2 + 2.1, 5.6, 0.5, 1, 0, 0, PI / 2); }
    // the keep with spires
    K.vc.add(GEO.box, st, 0, 12, -2, 22, 24, 16);
    K.vc.add(GEO.box, dk, 0, 24.3, -2, 22.8, 0.6, 16.8);
    for (let i = 0; i < 12; i++) for (const sz of [-1, 1]) K.vc.add(GEO.box, st, -10.5 + i * (21 / 11), 25.2, -2 + sz * 8, 0.9, 1.2, 0.8);
    gable(K, 18, 12, 24.6, 6, roof, null, 0, -2, 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.vc.add(GEO.cyl12, st, sx * 11, 15, -2 + sz * 8, 2.0, 30, 2.0); K.vc.add(GEO.cone12, roof, sx * 11, 34, -2 + sz * 8, 2.4, 8, 2.4); K.met.add(GEO.cyl6, gold, sx * 11, 39, -2 + sz * 8, 0.05, 2, 0.05); K.flag.add(GEO.plane, sx > 0 ? '#2f4f8a' : '#8a1e2a', sx * 11 + 0.8, 39.4, -2 + sz * 8, 1.6, 0.9, 1); }
    K.vc.add(GEO.cyl12, st, 0, 33, -4, 3, 18, 3); K.vc.add(GEO.cone12, roof, 0, 47, -4, 3.4, 12, 3.4);
    K.met.add(GEO.cyl6, gold, 0, 54.5, -4, 0.08, 3, 0.08); K.glow.add(GEO.oct, hdr('#ffd36b', 2.8), 0, 56.3, -4, 0.5, 0.8, 0.5);
    BIGLIGHTS.push({ x: wp(x, z, ry, 0, -4)[0], y: y + 56.3, z: wp(x, z, ry, 0, -4)[1], c: '#ffd36b', s: 10 });
    for (const sz of [-1, 1]) for (let f = 0; f < 3; f++) winRow(K, 6, 20, 6 + f * 6, -2 + sz * 8.05, 1.0, 2.2, 0.75);
    K.stain.add(GEO.cyl16, C('#ffcf5a'), 0, 18, 6.1, 2.2, 0.1, 2.2, PI / 2, 0, 0);
    // facade banners
    for (const sx of [-1, 1]) { K.flag.add(GEO.plane, '#8a1e2a', sx * 6.5, 15.5, 6.1, 7, 2.2, 1, 0, 0, PI / 2); K.flag.add(GEO.plane, gold, sx * 6.5, 15.5, 6.12, 6.4, 0.6, 1, 0, 0, PI / 2); }
    // inner courtyard ground
    K.vc.add(GEO.box, '#a49a88', 0, 0.05, 0, w - 4, 0.1, d - 4);
    collRect(x, z, w + 0.6, d + 0.6, ry, 0);
    occupy(x, z, w + 2, d + 2, ry, 0.5);
    BLD.push({ x, z, w, d, ry, kind: 'castle', name: 'Castello Reale' });
    // far silhouette
    const fs = std(st, 0.85), fr = std(roof, 0.8);
    const kp = new T.Mesh(GEO.box, fs); kp.position.set(x, y + 12, z + 2); kp.scale.set(22, 24, 16); FAR.add(kp);
    const sp = new T.Mesh(GEO.cone12, fr); sp.position.set(x, y + 47, z + 4); sp.scale.set(3.4, 12, 3.4); FAR.add(sp);
    const sp2 = new T.Mesh(GEO.cyl12, fs); sp2.position.set(x, y + 33, z + 4); sp2.scale.set(3, 18, 3); FAR.add(sp2);
    // royal garden (in front of the castle): hedges, topiaries, obelisks
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const hx = sx * (6.5 + i * 0), hz = 524 + i * 7;
        const g0 = gnd(sx * 8, hz + 2.5), K2 = kits(sx * 8, hz); frameAll(K2, sx * 8, g0, hz + 2.5, 0);
        K2.leaf.add(GEO.box, '#3f6a34', 0, 0.55, 0, 6, 1.1, 1.0); K2.leaf.add(GEO.box, '#3f6a34', sx * 2.5, 0.55, 2.4, 1.0, 1.1, 4.0);
        K2.leaf.add(GEO.sph, '#4a7a3a', 0, 1.0, 1.6, 0.8, 1.2, 0.8);
        K2.leaf.add(GEO.box, rpick(['#c84a5a', '#e8c040', '#f0f0f0']), 0, 0.3, 2.5, 3.6, 0.35, 2.2);
        collRect(sx * 8, hz + 2.5, 6, 1.0, 0, 0.1); void hx;
      }
    }
    for (const sx of [-1, 1]) for (const oz of [521, 545]) { const ox = sx * 13.5, og = gnd(ox, oz), K3 = kits(ox, oz); frameAll(K3, ox, og, oz, 0); K3.vc.add(GEO.box, '#9a917f', 0, 0.5, 0, 1.4, 1.0, 1.4); K3.vc.add(GEO.cone4, '#cfc6b2', 0, 3.6, 0, 0.7, 5.2, 0.7, 0, PI / 4, 0); K3.met.add(GEO.sph, '#d4b050', 0, 6.4, 0, 0.35, 0.35, 0.35); coll(ox, oz, 0.9); occCircle(ox, oz, 1.4); }
    occupy(0, 533, 30, 26, 0, 0);
  }

  /* ------------------------------------------------------------ Cathedral (stained glass that glows at night) */
  const CATH = { x: 77, z: 506, bell: null };
  function buildCathedral() {
    const x = CATH.x, z = CATH.z, w = 16, d = 34, ry = -PI / 2; // local +z = world -x (facade faces west)
    const { K, y } = B(x, z, w + 8, d, ry, '#8a8274');
    CATH.y = y;
    const st = '#d8d0c0', dk = '#a89e8a', roof = '#3f4a5a', gold = '#d4b050';
    const SG = ['#d04060', '#4070e0', '#e0b040', '#40b070', '#a050e0', '#e07030'];
    // nave
    K.vc.add(GEO.box, st, 0, 8, 0, w, 16, d - 4);
    // side aisles
    for (const sx of [-1, 1]) {
      K.vc.add(GEO.box, dk, sx * (w / 2 + 2.2), 4.5, 0, 4.4, 9, d - 6);
      K.vc.add(GEO.box, roof, sx * (w / 2 + 2.3), 9.6, 0, 5.2, 0.3, d - 5.4, 0, 0, sx * -0.5);
      for (let i = 0; i < 6; i++) {
        const wz = -d / 2 + 5 + i * ((d - 10) / 5);
        // tall pointed stained-glass windows (nave clerestory + aisle)
        K.stain.add(GEO.box, C(SG[(i + (sx > 0 ? 0 : 3)) % SG.length]), sx * (w / 2 + 0.05), 12, wz, 0.1, 4.6, 1.5);
        K.vc.add(GEO.cone4, st, sx * (w / 2 + 0.05), 14.7, wz, 0.15, 1.2, 1.05, 0, PI / 4, 0);
        K.stain.add(GEO.box, C(SG[(i + 2) % SG.length]), sx * (w / 2 + 4.45), 4.6, wz, 0.1, 3.4, 1.2);
        // flying buttresses
        K.vc.add(GEO.box, dk, sx * (w / 2 + 5.2), 5.5, wz + 2.2, 1.1, 11, 1.1);
        K.vc.add(GEO.box, dk, sx * (w / 2 + 2.7), 12, wz + 2.2, 5.0, 0.6, 0.7, 0, 0, sx * 0.55);
        K.vc.add(GEO.cone4, dk, sx * (w / 2 + 5.2), 11.8, wz + 2.2, 0.7, 1.8, 0.7, 0, PI / 4, 0);
      }
    }
    // west facade: two bell towers + rose window + portal
    const fz = d / 2 - 2;
    for (const sx of [-1, 1]) {
      K.vc.add(GEO.box, st, sx * 6, 13, fz, 6, 26, 6);
      K.vc.add(GEO.box, dk, sx * 6, 26.3, fz, 6.6, 0.6, 6.6);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; K.vc.add(GEO.cone4, dk, sx * 6 + Math.cos(a) * 2.8, 27.8, fz + Math.sin(a) * 2.8, 0.5, 2.5, 0.5, 0, PI / 4, 0); }
      K.vc.add(GEO.cone4, roof, sx * 6, 33, fz, 3.6, 12, 3.6, 0, PI / 4, 0);
      K.met.add(GEO.cyl6, gold, sx * 6, 39.6, fz, 0.06, 1.6, 0.06); K.met.add(GEO.box, gold, sx * 6, 40, fz, 0.7, 0.08, 0.08);
      K.stain.add(GEO.box, C(SG[sx > 0 ? 1 : 4]), sx * 6, 20, fz + 3.05, 1.4, 4.4, 0.1);
      K.vc.add(GEO.arch, dk, sx * 6, 22.5, fz + 3.1, 1.4, 1.4, 0.3);
      // belfry openings + bells
      K.vc.add(GEO.box, '#1a1612', sx * 6, 23.4, fz + 3.02, 2.2, 2.6, 0.1);
      K.met.add(GEO.cone12, '#b08a3a', sx * 6, 23.3, fz + 2.3, 0.9, 1.3, 0.9);
    }
    K.vc.add(GEO.box, st, 0, 10, fz + 0.5, 6.2, 20, 5);
    K.vc.add(GEO.prism, roof, 0, 20, fz - 0.5, 6.4, 4.5, 6, 0, PI / 2, 0);
    // rose window
    K.vc.add(GEO.cyl16, dk, 0, 14, fz + 3.0, 2.7, 0.3, 2.7, PI / 2, 0, 0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; K.stain.add(GEO.box, C(SG[i % SG.length]), Math.cos(a) * 1.4, 14 + Math.sin(a) * 1.4, fz + 3.18, 1.0, 0.7, 0.06, 0, 0, a); }
    K.stain.add(GEO.cyl12, C('#ffe08a'), 0, 14, fz + 3.2, 0.7, 0.06, 0.7, PI / 2, 0, 0);
    // portal
    for (let i = 0; i < 3; i++) K.vc.add(GEO.arch, shade(dk, -0.05 * i), 0, 0, fz + 3.3 - i * 0.35, 2.4 - i * 0.3, 4.8 - i * 0.4, 0.4);
    K.vc.add(GEO.box, '#4a3020', 0, 2.3, fz + 2.5, 2.8, 4.6, 0.15);
    K.met.add(GEO.box, gold, 0, 2.3, fz + 2.6, 0.12, 4.4, 0.04);
    // proper nave roof (ridge along local z)
    K.vc.add(GEO.prism, roof, 0, 16, -1, d - 4.5, 9, w + 1.4, 0, PI / 2, 0);
    // apse (east end)
    K.vc.add(GEO.cyl12, st, 0, 7, -d / 2 + 2, 7.5, 14, 7.5);
    K.vc.add(GEO.cone12, roof, 0, 17.5, -d / 2 + 2, 8.2, 7, 8.2);
    for (let i = 0; i < 5; i++) { const a = PI + (i / 4) * PI; K.stain.add(GEO.box, C(SG[i]), Math.cos(a) * 7.52, 8, -d / 2 + 2 + Math.sin(a) * 7.52 * -1, 1.1, 4.6, 0.1, 0, -a + PI / 2, 0); }
    // crossing spire
    K.vc.add(GEO.cyl6, dk, 0, 26, -3, 2.4, 6, 2.4); K.vc.add(GEO.cone6, '#2f3a4a', 0, 36, -3, 2.6, 14, 2.6);
    K.met.add(GEO.cyl6, gold, 0, 44, -3, 0.07, 2.4, 0.07); K.glow.add(GEO.oct, hdr('#ffe08a', 2.4), 0, 45.4, -3, 0.35, 0.6, 0.35);
    const [bx, bz] = wp(x, z, ry, 0, -3); BIGLIGHTS.push({ x: bx, y: y + 45.4, z: bz, c: '#ffe08a', s: 7 });
    const [s1x, s1z] = wp(x, z, ry, 0, fz + 3.35);
    sign('CATTEDRALE DELLA GRAZIA', s1x, y + 6.0, s1z, ry, 5.6, { bg: '#3a3040', fg: '#ffe7a8', icon: '✦' });
    const [cbx, cbz] = wp(x, z, ry, 0, fz); CATH.bell = { x: cbx, z: cbz };
    collRect(x, z, w + 10, d, ry, 0);
    occupy(x, z, w + 11, d + 2, ry, 0.4);
    BLD.push({ x, z, w, d, ry, kind: 'cathedral', name: 'Cattedrale della Grazia' });
    const fs = std(st, 0.85), fr = std(roof, 0.8);
    for (const sx of [-1, 1]) { const [tx, tz] = wp(x, z, ry, sx * 6, fz); const t = new T.Mesh(GEO.box, fs); t.position.set(tx, y + 13, tz); t.scale.set(6, 26, 6); FAR.add(t); const c = new T.Mesh(GEO.cone4, fr); c.position.set(tx, y + 33, tz); c.scale.set(3.6, 12, 3.6); c.rotation.y = PI / 4; FAR.add(c); }
  }

  /* ------------------------------------------------------------ Arena */
  const ARENA = { x: -70, z: 522, r: 20 };
  function buildArena() {
    const x = ARENA.x, z = ARENA.z, R = ARENA.r, n = 28, g0c = gnd(x, z);
    const ent = Math.atan2(508 - z, -52 - x); // entrance faces the city (Lucetta's corner)
    const st = '#c8b898', dk = '#a08e70';
    let maxG = -1e9; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; maxG = Math.max(maxG, gnd(x + Math.cos(a) * R, z + Math.sin(a) * R)); }
    const top = maxG + 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, ax = x + Math.cos(a) * R, az = z + Math.sin(a) * R, gate = Math.abs(angDiff(a, ent)) < TAU / n * 0.75;
      const gi = gnd(ax, az), K = kits(ax, az); frameAll(K, ax, 0, az, -a + PI / 2);
      const L = R * TAU / n + 0.1, h = top - gi + 2;
      if (gate) {
        K.vc.add(GEO.box, st, 0, top - 2.5, 0, L, 5, 2.2);
        K.vc.add(GEO.arch, dk, 0, gi, 0, L / 2, 6.4, 2.4);
        K.flag.add(GEO.plane, '#8a1e2a', 0, top - 4.5, 1.25, 4, 2.4, 1, 0, 0, PI / 2);
        continue;
      }
      K.vc.add(GEO.box, st, 0, gi - 2 + h / 2, 0, L, h, 2.2);
      // two tiers of arches (dark openings) on the outer face
      K.vc.add(GEO.box, '#2a2218', 0, gi + 2.6, 1.12, L * 0.55, 3.4, 0.06);
      K.vc.add(GEO.cyl, '#2a2218', 0, gi + 4.3, 1.12, L * 0.275, 0.06, L * 0.275, PI / 2, 0, 0);
      K.vc.add(GEO.box, '#2a2218', 0, top - 4.5, 1.12, L * 0.5, 3, 0.06);
      K.vc.add(GEO.box, dk, L / 2, gi - 1 + (h + 0.4) / 2, 1.2, 0.6, h + 0.4, 0.4);
      K.vc.add(GEO.box, dk, 0, top - 6.8, 1.15, L + 0.05, 0.4, 0.5);
      K.vc.add(GEO.box, dk, 0, top + 0.2, 0, L + 0.05, 0.5, 2.6);
      if (i % 4 === 0) { K.met.add(GEO.cyl6, '#5a4a3a', 0, top + 2.5, 0.6, 0.08, 4.6, 0.08); K.flag.add(GEO.plane, i % 8 ? '#e8c860' : '#8a1e2a', 0.8, top + 4.2, 0.6, 1.6, 1.0, 1); }
      // seating steps inside
      for (let k = 0; k < 4; k++) K.vc.add(GEO.box, k % 2 ? '#b4a688' : '#a89a7c', 0, gi + 0.6 + k * 1.8, -1.6 - k * 0.9, L, 1.2 + k * 1.8, 1.0);
      const [cx2, cz2] = [x + Math.cos(a) * (R - 1.5), z + Math.sin(a) * (R - 1.5)];
      coll(cx2, cz2, 2.6);
    }
    // sand floor
    const R2 = R - 4.8, seg = 32, pos = [], idx = [], cols = [];
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= seg; j++) { const r = (i / 6) * R2, a = (j / seg) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; pos.push(px, gnd(px, pz) + 0.09, pz); const c = 0.85 + Math.sin(px * 3.1 + pz * 2.3) * 0.06; cols.push(0.82 * c, 0.7 * c, 0.5 * c); }
    for (let i = 0; i < 6; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
    const fl = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })); fl.receiveShadow = true; ROOT.add(fl);
    // training posts in the arena
    for (let i = 0; i < 3; i++) { const a = ent + PI + (i - 1) * 0.7, px = x + Math.cos(a) * 9, pz = z + Math.sin(a) * 9, K = kits(px, pz); frameAll(K, px, gnd(px, pz), pz, -a); K.vc.add(GEO.cyl6, '#6a4a30', 0, 1, 0, 0.18, 2, 0.18); K.vc.add(GEO.box, '#c8b070', 0, 1.5, 0, 0.7, 0.9, 0.4); K.vc.add(GEO.sph, '#c8b070', 0, 2.25, 0, 0.3, 0.32, 0.3); K.vc.add(GEO.box, '#6a4a30', 0, 1.6, 0, 1.4, 0.12, 0.12); coll(px, pz, 0.5); }
    const [sx2, sz2] = [x + Math.cos(ent) * (R + 1.3), z + Math.sin(ent) * (R + 1.3)];
    sign('ARENA DEI CAMPIONI', sx2, top - 7.6, sz2, Math.atan2(Math.cos(ent), Math.sin(ent)), 5.4, { bg: '#5a1e1a', fg: '#ffe7a8', icon: '⚔' });
    occCircle(x, z, R + 2.5);
    ARENA.y = g0c; ARENA.ent = ent; ARENA.top = top;
    BLD.push({ x, z, w: R * 2, d: R * 2, ry: 0, kind: 'arena', name: 'Arena dei Campioni' });
    const fa = new T.Mesh(new T.CylinderGeometry(R, R, 15, 24, 1, true), std(st, 0.9)); fa.material.side = T.DoubleSide; fa.position.set(x, maxG + 6.5, z); FAR.add(fa);
  }

  /* ------------------------------------------------------------ Market square with stalls */
  const MARKET = { x: 72, z: 446, r: 16, stalls: [] };
  function buildMarket() {
    const x = MARKET.x, z = MARKET.z, R = MARKET.r;
    // paved disc (cobbles)
    const seg = 40, pos = [], uv = [], idx = [], col = [];
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= seg; j++) { const r = (i / 8) * R, a = (j / seg) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; pos.push(px, Math.max(gnd(px, pz), API.heightAt(px, pz)) + 0.1, pz); uv.push(px / 4, pz / 4); col.push(1.05, 1.0, 0.95); }
    for (let i = 0; i < 8; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new T.Mesh(g, roadMat); m.receiveShadow = true; ROOT.add(m);
    occCircle(x, z, R + 0.5);
    SEGS.push({ ax: x - 0.01, az: z, bx: x + 0.01, bz: z, hw: R, r: { kind: 'floor', w: R * 2, pts: [] } });
    // market cross: a clock column
    { const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, 0); K.vc.add(GEO.cyl12, '#9a917f', 0, 0.4, 0, 1.6, 0.8, 1.6); K.vc.add(GEO.cyl6, '#b8ad98', 0, 3.4, 0, 0.45, 5.6, 0.45); K.vc.add(GEO.box, '#5a4a3a', 0, 6.8, 0, 1.4, 1.4, 1.4); for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; K.lamp.add(GEO.cyl12, C('#fff0c8'), Math.sin(a) * 0.72, 6.8, Math.cos(a) * 0.72, 0.5, 0.05, 0.5, PI / 2, a, 0); } K.vc.add(GEO.cone4, '#7a3a28', 0, 8.1, 0, 1.2, 1.2, 1.2, 0, PI / 4, 0); coll(x, z, 1.7); LAMPS.push({ x, y: g0 + 6.8, z, c: '#fff0c8', s: 4 }); }
    const COLS = [['#b03a2a', '#efe2c8'], ['#2a5a8a', '#efe2c8'], ['#2a6a3a', '#e8d070'], ['#7a2a6a', '#efe2c8'], ['#c8701a', '#fff0d0'], ['#3a3a7a', '#e8c860']];
    const GOODS = ['fruit', 'fish', 'cloth', 'pots', 'bread', 'gems', 'spice', 'flowers'];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.1, sr = i % 2 ? R - 3.2 : R - 3.6;
      const sx = x + Math.cos(a) * sr, sz = z + Math.sin(a) * sr, ry = Math.atan2(x - sx, z - sz);
      const cc = COLS[i % COLS.length], kind = GOODS[i % GOODS.length];
      stall(sx, sz, ry, cc, kind);
      MARKET.stalls.push({ x: sx + Math.sin(ry) * -0.9, z: sz + Math.cos(ry) * -0.9, ry, kind });
    }
    BLD.push({ x, z, w: R * 2, d: R * 2, ry: 0, kind: 'market', name: 'Mercato dei Mille Mondi' });
  }
  function stall(x, z, ry, cc, kind) {
    const g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, ry);
    const w = 3.2, d = 2.0, wood = '#6a4a30';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.vc.add(GEO.cyl6, wood, sx * w / 2, sz > 0 ? 1.15 : 1.45, sz * d / 2, 0.07, sz > 0 ? 2.3 : 2.9, 0.07);
    K.vc.add(GEO.box, wood, 0, 0.85, d / 2 - 0.2, w, 0.12, 0.9);
    K.vc.add(GEO.box, shade(wood, -0.2), 0, 0.42, d / 2 - 0.2, w - 0.2, 0.84, 0.8);
    // striped awning, sloped toward the customers
    for (let i = 0; i < 6; i++) K.flag.add(GEO.plane, i % 2 ? cc[0] : cc[1], -w / 2 + (i + 0.5) * (w / 6), 2.55, 0.1, w / 6 + 0.02, d + 0.9, 1, -PI / 2 + 0.25, 0, 0);
    K.flag.add(GEO.plane, cc[0], 0, 2.25, d / 2 + 0.55, w + 0.1, 0.4, 1, 0, 0, 0);
    for (let k = 0; k < 6; k++) {
      const gx = -w / 2 + 0.4 + k * (w - 0.8) / 5, gz = d / 2 - 0.2 + rr(-0.2, 0.2);
      if (kind === 'fruit') K.vc.add(GEO.sphLo, rpick(['#e04030', '#f0a020', '#80c040', '#d0d040']), gx, 1.05, gz, 0.16);
      else if (kind === 'fish') K.met.add(GEO.sphLo, '#9ab0c0', gx, 0.98, gz, 0.28, 0.07, 0.1, 0, rr(0, 1), 0);
      else if (kind === 'cloth') K.vc.add(GEO.cyl6, rpick(['#c04a6a', '#4a6ac0', '#e8c860', '#6ac08a']), gx, 1.05, gz, 0.14, 0.42, 0.14, 0, 0, PI / 2);
      else if (kind === 'pots') K.vc.add(GEO.sphLo, rpick(['#a0603a', '#8a5030', '#c08050']), gx, 1.12, gz, 0.2, 0.26, 0.2);
      else if (kind === 'bread') K.vc.add(GEO.sphLo, '#c89050', gx, 1.0, gz, 0.22, 0.12, 0.14);
      else if (kind === 'gems') K.glow.add(GEO.oct, hdr(rpick(['#ff5a8a', '#5ad8ff', '#a0ff5a', '#ffd35a', '#b388ff']), 1.8), gx, 1.05, gz, 0.09, 0.14, 0.09);
      else if (kind === 'spice') K.vc.add(GEO.cyl, rpick(['#c84a1a', '#e8b030', '#7a4a1a', '#3a7a2a']), gx, 1.0, gz, 0.2, 0.2, 0.2);
      else K.leaf.add(GEO.sphLo, rpick(['#ff6a8a', '#ffd35a', '#c070ff', '#ffffff']), gx, 1.1, gz, 0.2, 0.16, 0.2);
    }
    K.vc.add(GEO.cyl, '#7a5a38', w / 2 + 0.45, 0.4, d / 2 - 0.3, 0.32, 0.8, 0.32);
    K.vc.add(GEO.box, '#8a6a42', -w / 2 - 0.45, 0.3, d / 2 - 0.2, 0.6, 0.6, 0.6);
    collRect(x, z, w + 0.6, d, ry, 0);
  }

  /* ------------------------------------------------------------ Stable (fast travel master) */
  const STABLE = { x: 93, z: 489 };
  function buildStable() {
    const x = STABLE.x, z = STABLE.z, w = 17, d = 9, ry = PI;
    const { K, y } = B(x, z, w, d, ry, '#857c6c');
    const wood = '#7a5a38', dark = '#4a3424', roof = '#6a4a2a';
    K.vc.add(GEO.box, wood, 0, 2.4, -d / 2 + 0.3, w, 4.8, 0.6);
    for (const sx of [-1, 1]) K.vc.add(GEO.box, wood, sx * (w / 2 - 0.3), 2.4, 0, 0.6, 4.8, d);
    for (let i = 0; i < 5; i++) { const px = -w / 2 + 0.6 + i * (w - 1.2) / 4; K.vc.add(GEO.box, dark, px, 2.4, d / 2 - 0.3, 0.4, 4.8, 0.4); if (i < 4) { K.vc.add(GEO.box, dark, px + (w - 1.2) / 8, 0.7, d / 2 - 0.5, (w - 1.2) / 4 - 0.6, 1.4, 0.12); } }
    gable(K, w + 0.4, d + 0.4, 4.8, 3, roof, wood);
    K.vc.add(GEO.box, '#d8c070', -5, 0.5, -2.5, 1.6, 1.0, 1.0); K.vc.add(GEO.box, '#d8c070', -3.6, 0.5, -2.4, 1.0, 1.0, 1.4); K.vc.add(GEO.box, '#d8c070', 5.5, 0.5, -2.8, 1.2, 1.0, 1.2);
    // horses resting in the stalls
    for (let i = 0; i < 3; i++) { const hx = -4.5 + i * 4.5; horseKit(K, hx, 0, -0.5, rr(-0.3, 0.3), rpick(['#6a4a2a', '#3a2a1e', '#d8d0c0', '#8a5a2a'])); }
    const [sx, sz] = wp(x, z, ry, 0, d / 2 + 0.2);
    sign('SCUDERIE REALI · VIAGGI', sx, y + 5.2, sz, ry, 5.0, { bg: '#4a3020', fg: '#f3d27a', icon: '♞' });
    collRect(x, z, w + 0.6, d + 0.6, ry, 0);
    occupy(x, z, w + 1, d + 1, ry, 0.3);
    BLD.push({ x, z, w, d, ry, kind: 'stable', name: 'Scuderie Reali' });
  }
  function horseKit(K, x, y, z, ry, col) {
    const c = Math.cos(ry), s = Math.sin(ry), P2 = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    let p = P2(0, 0); K.vc.add(GEO.box, col, p[0], y + 1.25, p[1], 0.7, 0.75, 1.8, 0, ry, 0);
    p = P2(0, 1.0); K.vc.add(GEO.box, col, p[0], y + 1.75, p[1], 0.4, 0.9, 0.45, -0.6, ry, 0);
    p = P2(0, 1.35); K.vc.add(GEO.box, col, p[0], y + 2.05, p[1], 0.34, 0.36, 0.7, 0.3, ry, 0);
    for (const lx of [-0.25, 0.25]) for (const lz of [-0.7, 0.7]) { p = P2(lx, lz); K.vc.add(GEO.box, shade(col, -0.2), p[0], y + 0.45, p[1], 0.16, 0.9, 0.16, 0, ry, 0); }
    p = P2(0, -0.95); K.vc.add(GEO.box, '#2a2018', p[0], y + 1.1, p[1], 0.14, 0.8, 0.14, 0.4, ry, 0);
  }

  /* ------------------------------------------------------------ Quartiere dei Ciliegi (Japanese-style district) */
  const PAGODA = { x: -82, z: 404 };
  function buildJapanese() {
    // five-tier pagoda
    const x = PAGODA.x, z = PAGODA.z, ry = 0.15;
    const { K, y } = B(x, z, 10, 10, ry, '#7a7064');
    const red = '#b03a2a', dark = '#2f3238', wall = '#efe8d8';
    for (let t = 0; t < 5; t++) {
      const s = 1 - t * 0.14, h0 = t * 4.2, ww = 8 * s;
      K.vc.add(GEO.box, red, 0, h0 + 1.6, 0, ww, 3.2, ww);
      for (let i = -1; i <= 1; i++) for (const sz of [-1, 1]) { K.win.add(GEO.box, C('#ffd9a0'), i * ww / 3.2, h0 + 1.8, sz * (ww / 2 + 0.04), ww / 5, 1.6, 0.06); K.win.add(GEO.box, C('#ffd9a0'), sz * (ww / 2 + 0.04), h0 + 1.8, i * ww / 3.2, 0.06, 1.6, ww / 5); }
      const rw = ww + 3.2 - t * 0.2;
      K.vc.add(GEO.box, dark, 0, h0 + 3.4, 0, rw, 0.3, rw);
      K.vc.add(GEO.cone4, dark, 0, h0 + 3.95, 0, rw * 0.72, 1.1, rw * 0.72, 0, PI / 4, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.vc.add(GEO.cone4, dark, sx * rw / 2, h0 + 3.6, sz * rw / 2, 0.3, 0.7, 0.3, sz * 0.6, PI / 4, -sx * 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.lamp.add(GEO.box, C('#ff9a50'), sx * (rw / 2 - 0.2), h0 + 3.0, sz * (rw / 2 - 0.2), 0.22, 0.32, 0.22); }
    }
    K.met.add(GEO.cyl6, '#c9a24a', 0, 24, 0, 0.12, 6, 0.12);
    for (let i = 0; i < 6; i++) K.met.add(GEO.tor, '#c9a24a', 0, 22 + i * 0.7, 0, 0.45 - i * 0.04, 0.45 - i * 0.04, 0.45 - i * 0.04, PI / 2, 0, 0);
    K.glow.add(GEO.sph, hdr('#ffb050', 2.8), 0, 27.3, 0, 0.3, 0.3, 0.3);
    BIGLIGHTS.push({ x, y: y + 27.3, z, c: '#ffb050', s: 6 });
    collRect(x, z, 8.6, 8.6, ry, 0); occupy(x, z, 12, 12, ry, 0.5);
    BLD.push({ x, z, w: 8, d: 8, ry, kind: 'pagoda', name: 'Pagoda dei Cinque Venti' });
    const fp = new T.Mesh(GEO.cone4, std('#2f3238', 0.8)); fp.position.set(x, y + 12, z); fp.scale.set(5.5, 26, 5.5); fp.rotation.y = PI / 4 + ry; FAR.add(fp);
    // torii gates along the lane
    const lane = ROADS.find((r) => r.kind === 'jp');
    const allJp = ROADS.filter((r) => r.kind === 'jp');
    const pts = [];
    for (const r of allJp) for (let i = 0; i < r.pts.length - 1; i++) { const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); for (let t = 6; t < L - 3; t += 9) pts.push([lerp(ax, bx, t / L), lerp(az, bz, t / L), Math.atan2(bx - ax, bz - az)]); }
    void lane;
    for (const [tx, tz, ang] of pts) {
      if (dC(tx, tz) > WALL_R - 6) continue;
      const g0 = gnd(tx, tz), K2 = kits(tx, tz); frameAll(K2, tx, g0, tz, ang + PI / 2);
      const hw = 2.9;
      for (const sx of [-1, 1]) { K2.vc.add(GEO.cyl12, red, 0, 2.4, sx * hw, 0.28, 4.8, 0.28); K2.vc.add(GEO.cyl12, '#1a1a1a', 0, 0.25, sx * hw, 0.36, 0.5, 0.36); }
      K2.vc.add(GEO.box, red, 0, 4.0, 0, 0.32, 0.32, hw * 2 + 0.6);
      K2.vc.add(GEO.box, '#1a1a1a', 0, 4.9, 0, 0.5, 0.36, hw * 2 + 1.8);
      K2.vc.add(GEO.box, red, 0, 4.62, 0, 0.42, 0.2, hw * 2 + 1.4);
      K2.vc.add(GEO.box, '#1a1a1a', 0, 4.3, 0, 0.12, 0.5, 0.6);
      for (const sx of [-1, 1]) { const [cx2, cz2] = wp(tx, tz, ang + PI / 2, 0, sx * hw); coll(cx2, cz2, 0.35); }
    }
    // shrine pavilion with a great bronze bell
    { const sx = -76, sz = 452, ry2 = PI / 2 + 0.1; const { K: K3, y: y3 } = B(sx, sz, 7, 7, ry2, '#7a7064');
      for (const a of [-1, 1]) for (const b of [-1, 1]) K3.vc.add(GEO.cyl6, red, a * 2.8, 2.2, b * 2.8, 0.2, 4.4, 0.2);
      K3.vc.add(GEO.box, dark, 0, 4.5, 0, 8.4, 0.3, 8.4); K3.vc.add(GEO.cone4, dark, 0, 5.4, 0, 5.8, 1.8, 5.8, 0, PI / 4, 0);
      for (const a of [-1, 1]) for (const b of [-1, 1]) K3.vc.add(GEO.cone4, dark, a * 4.2, 4.7, b * 4.2, 0.3, 0.7, 0.3, b * 0.6, PI / 4, -a * 0.6);
      K3.met.add(GEO.cyl12, '#7a5a2a', 0, 2.6, 0, 1.1, 2.0, 1.1); K3.met.add(GEO.dome, '#7a5a2a', 0, 3.6, 0, 1.1, 0.6, 1.1); K3.met.add(GEO.box, '#5a4020', 0, 4.25, 0, 0.12, 0.6, 0.12);
      K3.vc.add(GEO.cyl6, '#8a6a3a', 1.8, 2.3, 0, 0.15, 0.15, 2.2, 0, 0, PI / 2);
      collRect(sx, sz, 6.4, 6.4, ry2, 0); occupy(sx, sz, 9, 9, ry2, 0.3);
      const [bx, bz] = [sx, sz]; JPBELL.x = bx; JPBELL.z = bz; JPBELL.y = y3;
      BLD.push({ x: sx, z: sz, w: 7, d: 7, ry: ry2, kind: 'shrine', name: 'Santuario della Campana' }); }
    // koi pond with a stone lantern ring
    { const px = -76, pz = 438, R = 5.5, g0 = gnd(px, pz); let mx = -1e9; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; mx = Math.max(mx, gnd(px + Math.cos(a) * R, pz + Math.sin(a) * R)); }
      const K4 = kits(px, pz); frameAll(K4, px, 0, pz, 0);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; K4.vc.add(GEO.dode, rpick(['#8a8478', '#9a9488', '#7a7468']), Math.cos(a) * (R + 0.2), mx + 0.1, Math.sin(a) * (R + 0.2), 0.75, 0.55, 0.75); }
      K4.vc.add(GEO.cyl16, '#3a3a34', 0, (mx + g0) / 2 - 0.6, 0, R, mx - g0 + 1.0, R);
      const wm = new T.Mesh(new T.CircleGeometry(R, 24), MAT.water); wm.rotation.x = -PI / 2; wm.position.set(px, mx + 0.2, pz); ROOT.add(wm);
      KOI.x = px; KOI.z = pz; KOI.y = mx + 0.12; KOI.r = R - 0.8;
      coll(px, pz, R + 0.4); occCircle(px, pz, R + 1.5); }
    // Daichi's noodle stand (an ex-hero turned cook): counter, noren curtains, red lanterns
    { const sx = -68.2, sz = 462, ry3 = PI / 2; const { K: K5, y: y5 } = B(sx, sz, 4.2, 2.6, ry3, false);
      K5.vc.add(GEO.box, '#5a3e28', 0, 0.55, 0.6, 4.2, 1.1, 0.9); K5.vc.add(GEO.box, '#3a2618', 0, 1.15, 0.75, 4.4, 0.1, 1.1);
      for (const a of [-1, 1]) { K5.vc.add(GEO.box, '#3a2618', a * 2.0, 1.4, -0.4, 0.16, 2.8, 0.16); K5.vc.add(GEO.box, '#3a2618', a * 2.0, 1.4, 1.2, 0.16, 2.8, 0.16); }
      K5.vc.add(GEO.box, '#2f3238', 0, 2.95, 0.4, 5.0, 0.2, 2.8); K5.vc.add(GEO.prism, '#2f3238', 0, 3.0, 0.4, 4.6, 0.8, 2.4);
      for (let i = 0; i < 4; i++) K5.flag.add(GEO.plane, '#1e2a5a', -1.5 + i, 2.4, 1.25, 0.92, 0.9, 1, 0, 0, 0);
      for (const a of [-1, 1]) { K5.lamp.add(GEO.sph, C('#ff5a3a'), a * 2.3, 2.3, 1.3, 0.22, 0.3, 0.22); const [lx, lz] = wp(sx, sz, ry3, a * 2.3, 1.3); LAMPS.push({ x: lx, y: y5 + 2.3, z: lz, c: '#ff5a3a', s: 2.8 }); }
      for (let i = 0; i < 3; i++) K5.vc.add(GEO.cyl, '#d8c8a8', -1.2 + i * 1.2, 1.28, 0.7, 0.18, 0.14, 0.18);
      K5.met.add(GEO.cyl12, '#8a8a90', 0.6, 1.5, -0.1, 0.4, 0.6, 0.4);
      for (let i = 0; i < 3; i++) K5.vc.add(GEO.cyl, '#6a4a30', -1.2 + i * 1.2, 0.35, 1.7, 0.22, 0.7, 0.22);
      const [ssx, ssz] = wp(sx, sz, ry3, 0, 1.3); sign('BRODO DEI CILIEGI', ssx, y5 + 3.35, ssz, ry3, 3.2, { bg: '#1e2a5a', fg: '#ffe7a8', icon: '♨' });
      collRect(sx, sz, 4.4, 1.4, ry3, 0); occupy(sx, sz, 5, 4, ry3, 0.3);
      CHIMNEYS.push({ x: sx + 0.1, y: y5 + 2.2, z: sz + 0.6 }); }
  }
  const JPBELL = { x: -76, z: 452, y: 0 }, KOI = { x: 0, z: 0, y: 0, r: 0, fish: [] };

  /* ------------------------------------------------------------ Giardini di Sylvaren (elven quarter) */
  const ELF = { x: 64, z: 553, motes: null };
  function buildElven() {
    const x = ELF.x, z = ELF.z, g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0 - 0.5, z, 0);
    const bark = '#d8cfb8', bark2 = '#c2b89c';
    // twisted world tree
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; K.vc.add(GEO.cyl6, i % 2 ? bark : bark2, Math.cos(a) * 1.2, 8, Math.sin(a) * 1.2, 1.1, 16, 1.1, Math.sin(a) * 0.12, a, Math.cos(a) * 0.12); }
    K.vc.add(GEO.cyl12, bark, 0, 9, 0, 2.2, 18, 2.2);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; K.vc.add(GEO.cyl6, bark2, Math.cos(a) * 3.0, 0.6, Math.sin(a) * 3.0, 0.7, 3.2, 0.7, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; K.vc.add(GEO.cyl6, bark, Math.cos(a) * 4, 17, Math.sin(a) * 4, 0.5, 8, 0.5, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    const LC = ['#5ab08a', '#7ac89a', '#4aa0a0', '#8ad0a0', '#a8e0a0'];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, r = i === 0 ? 0 : rr(4, 8); K.leaf.add(GEO.ico1, LC[i % LC.length], Math.cos(a) * r, rr(19, 25), Math.sin(a) * r, rr(4.5, 6.5), rr(2.8, 3.8), rr(4.5, 6.5)); }
    K.leaf.add(GEO.ico1, '#8ad0b0', 0, 27, 0, 5, 3, 5);
    // hanging spirit lanterns
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, r = rr(5, 8.5), ly = rr(13, 17); K.met.add(GEO.cyl6, '#c8d8c0', Math.cos(a) * r, ly + 1.2, Math.sin(a) * r, 0.02, 2.4, 0.02); K.lamp.add(GEO.oct, C('#a8ffe0'), Math.cos(a) * r, ly, Math.sin(a) * r, 0.24, 0.38, 0.24); LAMPS.push({ x: x + Math.cos(a) * r, y: g0 - 0.5 + ly, z: z + Math.sin(a) * r, c: '#7fffd0', s: 3 }); }
    coll(x, z, 3.4); occCircle(x, z, 5.5);
    GARDENS.push({ x, z, r: 18 });
    BLD.push({ x, z, w: 8, d: 8, ry: 0, kind: 'tree', name: 'Albero di Sylvaren' });
    const ft = new T.Mesh(GEO.ico1, std('#5ab08a', 0.9)); ft.position.set(x, g0 + 22, z); ft.scale.set(10, 6, 10); FAR.add(ft);
    // moon pool with crystal pillars
    const px = 82, pz = 526, R = 6; let mx = -1e9; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; mx = Math.max(mx, gnd(px + Math.cos(a) * R, pz + Math.sin(a) * R)); }
    const g1 = gnd(px, pz), K2 = kits(px, pz); frameAll(K2, px, 0, pz, 0);
    K2.vc.add(GEO.cyl16, '#e8eee6', 0, (mx + g1) / 2 - 0.4, 0, R + 0.6, mx - g1 + 1.4, R + 0.6);
    const wm = new T.Mesh(new T.CircleGeometry(R, 28), new T.MeshStandardMaterial({ color: '#5ad0e0', roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.85, emissive: hdr('#2ab0c8', 0.5), normalMap: API.waterNormal || null }));
    wm.rotation.x = -PI / 2; wm.position.set(px, mx + 0.32, pz); ROOT.add(wm);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; K2.vc.add(GEO.cyl6, '#e8eee6', Math.cos(a) * (R + 1.4), mx + 1.2, Math.sin(a) * (R + 1.4), 0.25, 2.4, 0.25); K2.glow.add(GEO.oct, hdr('#9ff3ff', 2.2), Math.cos(a) * (R + 1.4), mx + 2.8, Math.sin(a) * (R + 1.4), 0.25, 0.5, 0.25); BIGLIGHTS.push({ x: px + Math.cos(a) * (R + 1.4), y: mx + 2.8, z: pz + Math.sin(a) * (R + 1.4), c: '#9ff3ff', s: 2.6 }); coll(px + Math.cos(a) * (R + 1.4), pz + Math.sin(a) * (R + 1.4), 0.4); }
    coll(px, pz, R + 0.8); occCircle(px, pz, R + 2.2); GARDENS.push({ x: px, z: pz, r: 11 });
    BLD.push({ x: px, z: pz, w: R * 2, d: R * 2, ry: 0, kind: 'pool', name: 'Specchio della Luna' });
  }

  /* ------------------------------------------------------------ Forgia di Kharum-Dur (dwarven forges) */
  const FORGE = { fires: [], anvils: [] };
  function buildForge() {
    const halls = [{ x: -48, z: 558.5, w: 10, d: 7, ry: PI }, { x: -64, z: 545, w: 9, d: 6, ry: 0 }];
    for (const h of halls) {
      const { K, y } = B(h.x, h.z, h.w, h.d, h.ry, '#5a544c');
      const st = '#7d7468', dk = '#4a443c';
      K.vc.add(GEO.box, st, 0, 2.6, 0, h.w, 5.2, h.d);
      for (let i = 0; i < 5; i++) K.vc.add(GEO.box, i % 2 ? dk : shade(st, -0.06), 0, 0.6 + i * 1.1, h.d / 2 + 0.03, h.w + 0.02, 0.12, 0.06);
      K.vc.add(GEO.box, dk, 0, 5.5, 0, h.w + 0.8, 0.6, h.d + 0.8);
      K.vc.add(GEO.box, dk, 0, 6.1, 0, h.w - 1, 0.6, h.d - 1);
      // hexagonal rune door glowing like a furnace
      K.vc.add(GEO.cyl6, dk, 0, 1.6, h.d / 2 + 0.1, 1.4, 0.3, 1.4, PI / 2, 0, 0);
      K.glow.add(GEO.cyl6, hdr('#ff6a1a', 2.2), 0, 1.6, h.d / 2 + 0.2, 1.0, 0.1, 1.0, PI / 2, 0, 0);
      for (const sx of [-1, 1]) { K.vc.add(GEO.box, '#c9a24a', sx * 2.4, 2.2, h.d / 2 + 0.1, 0.8, 0.8, 0.12); K.glow.add(GEO.box, hdr('#ffb050', 1.6), sx * 2.4, 2.2, h.d / 2 + 0.17, 0.5, 0.5, 0.05); }
      // huge chimney stack
      K.vc.add(GEO.box, dk, h.w / 2 - 1.5, 8.5, -h.d / 2 + 1.5, 2.2, 8, 2.2);
      K.vc.add(GEO.box, '#3a3630', h.w / 2 - 1.5, 12.7, -h.d / 2 + 1.5, 2.7, 0.5, 2.7);
      K.glow.add(GEO.box, hdr('#ff5a10', 2.5), h.w / 2 - 1.5, 12.95, -h.d / 2 + 1.5, 1.6, 0.1, 1.6);
      const [cx, cz] = wp(h.x, h.z, h.ry, h.w / 2 - 1.5, -h.d / 2 + 1.5); CHIMNEYS.push({ x: cx, y: y + 13.1, z: cz, dwarf: true, big: true });
      // outdoor anvil + furnace
      const [ax, az] = wp(h.x, h.z, h.ry, -h.w / 2 - 1.3, h.d / 2 - 1.2);
      K.met.add(GEO.box, '#3a3a3e', -h.w / 2 - 1.3, 0.45, h.d / 2 - 1.2, 0.5, 0.9, 0.5); K.met.add(GEO.box, '#4a4a50', -h.w / 2 - 1.3, 1.0, h.d / 2 - 1.2, 0.45, 0.25, 1.1);
      FORGE.anvils.push({ x: ax, y: y + 1.15, z: az }); coll(ax, az, 0.6);
      K.vc.add(GEO.box, dk, h.w / 2 + 1.1, 0.8, h.d / 2 - 1.6, 1.4, 1.6, 1.6); K.glow.add(GEO.box, hdr('#ff7a1a', 3), h.w / 2 + 1.1, 0.9, h.d / 2 - 0.78, 0.9, 0.6, 0.05);
      const [fx, fz] = wp(h.x, h.z, h.ry, h.w / 2 + 1.1, h.d / 2 - 0.6); FORGE.fires.push({ x: fx, y: y + 1.0, z: fz }); LAMPS.push({ x: fx, y: y + 1.2, z: fz, c: '#ff6a1a', s: 4 });
      const [c3x, c3z] = wp(h.x, h.z, h.ry, h.w / 2 + 1.1, h.d / 2 - 1.6); coll(c3x, c3z, 0.9);
      collRect(h.x, h.z, h.w + 0.6, h.d + 0.6, h.ry, 0);
      occupy(h.x, h.z, h.w + 6, h.d + 1.5, h.ry, 0.3);
      BLD.push({ x: h.x, z: h.z, w: h.w, d: h.d, ry: h.ry, kind: 'forge', name: 'Forgia di Kharum-Dur' });
    }
    // monument: giant anvil and crossed hammers + glowing lava channel
    { const x = -40, z = 539, g0 = gnd(x, z), K = kits(x, z); frameAll(K, x, g0, z, 0.4);
      K.vc.add(GEO.box, '#5a544c', 0, 0.6, 0, 3.4, 1.2, 3.4); K.met.add(GEO.box, '#3a3a3e', 0, 1.9, 0, 1.2, 1.4, 1.0); K.met.add(GEO.box, '#4a4a52', 0, 2.9, 0, 2.8, 0.6, 1.2); K.met.add(GEO.cone4, '#4a4a52', 1.8, 2.9, 0, 0.4, 1.0, 0.4, 0, 0, -PI / 2);
      for (const s of [-1, 1]) { K.met.add(GEO.cyl6, '#6a4a2a', s * 0.4, 4.4, 0, 0.1, 3, 0.1, 0, 0, s * 0.6); K.met.add(GEO.box, '#5a5a62', s * 1.25, 5.6, 0, 1.0, 0.6, 0.6, 0, 0, s * 0.6); }
      K.glow.add(GEO.box, hdr('#ff8a2a', 2), 0, 1.25, 0, 3.0, 0.08, 3.0);
      coll(x, z, 2.2); occCircle(x, z, 3); BLD.push({ x, z, w: 3, d: 3, ry: 0, kind: 'monument', name: 'Incudine dei Padri' }); }
    // lava channel along the forge lane (glowing, with stone edges)
    const lr = ROADS.find((r) => r.kind === 'forge');
    if (lr) for (let i = 0; i < lr.pts.length - 1; i++) {
      const [ax, az] = lr.pts[i], [bx, bz] = lr.pts[i + 1], L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az), nx = Math.cos(ang), nz = -Math.sin(ang);
      for (let t = 1; t < L - 1; t += 2) {
        const px = lerp(ax, bx, t / L) + nx * (lr.w / 2 + 0.8), pz = lerp(az, bz, t / L) + nz * (lr.w / 2 + 0.8), K = kits(px, pz); frameAll(K, px, gnd(px, pz), pz, ang);
        K.vc.add(GEO.box, '#3a3630', -0.55, 0.12, 0, 0.3, 0.3, 2.05); K.vc.add(GEO.box, '#3a3630', 0.55, 0.12, 0, 0.3, 0.3, 2.05);
        K.glow.add(GEO.box, hdr('#ff6a10', 2.6 + Math.sin(t) * 0.4), 0, 0.06, 0, 0.8, 0.06, 2.05);
        if (t % 6 === 1) FORGE.fires.push({ x: px, y: gnd(px, pz) + 0.2, z: pz, lava: true });
      }
    }
  }

  /* ------------------------------------------------------------ Canal with stepped water and bridges */
  const CANAL = { z: 425, x0: -88, x1: 92, hw: 3.2, segs: [], bridges: [] };
  function canalLevel(x) { for (const s of CANAL.segs) if (x >= s.x0 && x <= s.x1) return s.lv; return -1e9; }
  function buildCanal() {
    const z = CANAL.z, hw = CANAL.hw;
    const BR = [{ x: -59.5, w: 4.6, style: 'jp' }, { x: -29.25, w: 3.8, style: 'wood' }, { x: 0, w: 9, style: 'stone' }, { x: 62, w: 4.6, style: 'stone' }];
    // segment breakpoints (bridges sit in the middle of a segment so their water is level)
    const cuts = [CANAL.x0, -76, -44, -15, 15, 36, 76, CANAL.x1];
    for (let i = 0; i < cuts.length - 1; i++) {
      const x0 = cuts[i], x1 = cuts[i + 1]; let mx = -1e9, mn = 1e9;
      for (let x = x0; x <= x1; x += 1.5) for (const dz of [-hw - 0.6, -hw / 2, 0, hw / 2, hw + 0.6]) { const h = gnd(x, z + dz); mx = Math.max(mx, h); mn = Math.min(mn, h); }
      CANAL.segs.push({ x0, x1, lv: mx + 0.25, mn });
    }
    const wmats = [];
    for (const s of CANAL.segs) {
      const L = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2;
      const K = kits(cx, z); frameAll(K, 0, 0, 0, 0);
      // stone channel walls + floor
      const bot = s.mn - 0.6, top = s.lv + 0.45;
      for (const sd of [-1, 1]) {
        K.vc.add(GEO.box, '#8f8778', cx, (bot + top) / 2, z + sd * (hw + 0.35), L + 0.02, top - bot, 0.7);
        K.vc.add(GEO.box, '#a49b8a', cx, top + 0.1, z + sd * (hw + 0.35), L + 0.04, 0.2, 0.95);
      }
      K.vc.add(GEO.box, '#4a5a5a', cx, bot + 0.2, z, L, 0.4, hw * 2);
      const wm = new T.Mesh(GEO.box, MAT.water); wm.position.set(cx, (s.lv + bot) / 2, z); wm.scale.set(L, s.lv - bot, hw * 2 + 0.02); ROOT.add(wm); wmats.push(wm);
    }
    // weirs between segments of different level (little cascades)
    CANAL.falls = [];
    for (let i = 0; i < CANAL.segs.length - 1; i++) {
      const a = CANAL.segs[i], b = CANAL.segs[i + 1], x = a.x1, hi = Math.max(a.lv, b.lv), lo = Math.min(a.lv, b.lv), K = kits(x, z); frameAll(K, 0, 0, 0, 0);
      K.vc.add(GEO.box, '#9a917f', x, hi - 0.2, z, 0.5, 0.5, hw * 2);
      if (hi - lo > 0.15) { const dir = a.lv > b.lv ? 1 : -1; const fm = new T.Mesh(GEO.box, new T.MeshBasicMaterial({ color: hdr('#e8f6ff', 1.1), transparent: true, opacity: 0.55, depthWrite: false })); fm.position.set(x + dir * 0.35, (hi + lo) / 2, z); fm.scale.set(0.12, hi - lo, hw * 2 - 0.1); ROOT.add(fm); CANAL.falls.push({ x: x + dir * 0.5, y: lo + 0.1, z }); }
    }
    // end basins with lion spouts
    for (const ex of [CANAL.x0, CANAL.x1]) { const s = ex === CANAL.x0 ? CANAL.segs[0] : CANAL.segs[CANAL.segs.length - 1], K = kits(ex, z); frameAll(K, 0, 0, 0, 0); K.vc.add(GEO.box, '#8f8778', ex, (s.mn + s.lv) / 2 + 0.6, z, 1.2, s.lv - s.mn + 2.6, hw * 2 + 1.4); K.met.add(GEO.sph, '#c9a24a', ex + (ex < 0 ? 0.7 : -0.7), s.lv + 1.2, z, 0.4, 0.45, 0.4); CANAL.falls.push({ x: ex + (ex < 0 ? 1 : -1), y: s.lv + 0.9, z, spout: true }); }
    // colliders (except at bridges)
    for (let x = CANAL.x0; x <= CANAL.x1; x += 2) {
      if (BR.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.9)) continue;
      coll(x, z, hw + 0.5);
    }
    // bridges
    for (const b of BR) {
      const lv = canalLevel(b.x), top = lv + 1.25, L = 7.5;
      const z0 = z - L, z1 = z + L, g0 = gnd(b.x, z0), g1 = gnd(b.x, z1);
      const br = { x: b.x, hw: b.w / 2, z0, z1, g0, g1, top };
      CANAL.bridges.push(br);
      const K = kits(b.x, z); frameAll(K, b.x, 0, 0, 0);
      const n = 16, deck = b.style === 'jp' ? '#b03a2a' : b.style === 'wood' ? '#7a5a38' : '#b0a794', rail = b.style === 'jp' ? '#c8402a' : b.style === 'wood' ? '#5a3e28' : '#a49b8a';
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, za = lerp(z0, z1, t0), zb = lerp(z0, z1, t1), ya = deckY(br, za), yb = deckY(br, zb);
        const zm = (za + zb) / 2, ym = (ya + yb) / 2, ang = Math.atan2(yb - ya, zb - za), len = Math.hypot(zb - za, yb - ya) + 0.05;
        K.vc.add(GEO.box, b.style === 'jp' ? '#5a3e28' : deck, 0, ym - 0.18, zm, b.w, 0.36, len, -ang, 0, 0);
        if (b.style === 'jp') K.vc.add(GEO.box, deck, 0, ym + 0.02, zm, b.w + 0.3, 0.08, len, -ang, 0, 0);
        for (const sd of [-1, 1]) {
          K.vc.add(GEO.box, rail, sd * (b.w / 2 + 0.1), ym + 0.75, zm, 0.14, 0.12, len, -ang, 0, 0);
          if (i % 2 === 0) K.vc.add(GEO.box, rail, sd * (b.w / 2 + 0.1), ym + 0.35, za, 0.16, 0.8, 0.16);
        }
      }
      for (const sd of [-1, 1]) { K.vc.add(GEO.cyl6, rail, sd * (b.w / 2 + 0.1), deckY(br, z1) + 0.6, z1, 0.18, 1.2, 0.18); K.vc.add(GEO.cyl6, rail, sd * (b.w / 2 + 0.1), deckY(br, z0) + 0.6, z0, 0.18, 1.2, 0.18); }
      if (b.style !== 'wood') { K.vc.add(GEO.arch, b.style === 'jp' ? '#5a3e28' : '#9a917f', 0, lv - 1.4, z, hw + 0.8, (top - lv) + 1.4, b.w * 0.98, 0, PI / 2, 0); }
      if (b.style === 'stone') for (const sd of [-1, 1]) { const lx = b.x + sd * (b.w / 2 + 0.1); lampPost(lx, z1 + 0.6, 'euro'); }
      for (const sd of [-1, 1]) { coll(b.x + sd * (b.w / 2 + 0.45), z, 0.45); coll(b.x + sd * (b.w / 2 + 0.45), z - 2.4, 0.45); coll(b.x + sd * (b.w / 2 + 0.45), z + 2.4, 0.45); }
    }
    occupy((CANAL.x0 + CANAL.x1) / 2, z, CANAL.x1 - CANAL.x0 + 2, hw * 2 + 3, 0, 0.2);
    BLD.push({ x: 2, z, w: CANAL.x1 - CANAL.x0, d: hw * 2, ry: 0, kind: 'canal', name: 'Canale delle Lanterne' });
  }
  function deckY(br, z) { const t = clamp((z - br.z0) / (br.z1 - br.z0), 0, 1), base = lerp(br.g0, br.g1, t); return lerp(base, Math.max(br.top, base), Math.pow(Math.sin(t * PI), 0.55)) + 0.12; }
  // walkable surface (terrain + bridge decks)
  function bridgeAt(x, z) {
    if (Math.abs(z - CANAL.z) > 8) return null;
    for (const b of CANAL.bridges) if (Math.abs(x - b.x) < b.hw + 0.2 && z > b.z0 && z < b.z1) return b;
    return null;
  }
  function surf(x, z) { const h = API.heightAt(x, z), b = bridgeAt(x, z); if (b) { const d = deckY(b, z); return d > h ? d : h; } return h; }

  /* ------------------------------------------------------------ reserved spots (other modules' NPCs) */
  const RESERVED = [[27.5, 449.6, 3], [34, 449.4, 2.5], [0, 540, 4], [-4.5, 538, 2], [4.5, 538, 2], [-15, 486, 2.5], [10, 410, 2.5], [37, 490, 2.5], [-12, 507, 2.5],
    [-27, 488, 2.5], [53, 494, 2.5], [-26, 449, 2.5], [-52, 508, 2.5], [7, 357, 2.5], [-15, 412, 2.5], [112, 478, 3], [-6, 404, 2.5], [164, 480, 3], [175, 470, 18]];

  /* ------------------------------------------------------------ procedural houses along the streets */
  function fillHouses() {
    let placed = 0;
    const tryHouse = (x, z, ry, w, d, fl) => {
      if (dC(x, z) + Math.hypot(w, d) / 2 > WALL_R - 3.5) return false;
      if (!freeRect(x, z, w, d, ry, 0.9, 0.7)) return false;
      house(x, z, ry, w, d, fl, districtStyle(x, z));
      occupy(x, z, w, d, ry, 0.4);
      placed++;
      return true;
    };
    // frontage along every road
    for (const s of SEGS) {
      if (s.r.kind === 'plaza' || s.r.kind === 'floor' || s.r.kind === 'bridge') continue;
      const L = Math.hypot(s.bx - s.ax, s.bz - s.az), ang = Math.atan2(s.bx - s.ax, s.bz - s.az);
      const tx = (s.bx - s.ax) / L, tz = (s.bz - s.az) / L;
      for (const sd of [-1, 1]) {
        let t = rr(1, 4);
        while (t < L - 2) {
          const w = rr(5.5, 9), d = rr(5.5, 8), fl = rnd() < 0.3 ? 3 : rnd() < 0.75 ? 2 : 1;
          const off = s.hw + 1.4 + d / 2, x = s.ax + tx * t + (-tz) * sd * off, z = s.az + tz * t + tx * sd * off;
          // front faces the road: local +z toward road
          const ry = ang + (sd > 0 ? -PI / 2 : PI / 2) + PI;
          if (tryHouse(x, z, ry, w, d, fl)) t += w + rr(0.6, 2.2); else t += 2.5;
        }
      }
    }
    // back-street infill
    for (let i = 0; i < 900 && placed < 150; i++) {
      const a = rr(0, TAU), r = Math.sqrt(rnd()) * (WALL_R - 8), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      const nr = nearestRoad(x, z); if (!nr.s || nr.d > 26) continue;
      const s = nr.s, vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz, t = clamp(((x - s.ax) * vx + (z - s.az) * vz) / l2, 0, 1);
      const px = s.ax + vx * t, pz = s.az + vz * t, ry = Math.atan2(px - x, pz - z);
      tryHouse(x, z, ry, rr(5, 8), rr(5, 7), rnd() < 0.5 ? 2 : 1);
    }
    return placed;
  }
  function fillProps() {
    // lamps along avenues and lanes
    for (const r of ROADS) {
      if (r.kind === 'plaza' || r.kind === 'floor' || r.kind === 'bridge') continue;
      const step = r.kind === 'main' ? 16 : 20;
      for (let k = 0; k < r.pts.length - 1; k++) {
        const [ax, az] = r.pts[k], [bx, bz] = r.pts[k + 1], L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L;
        for (let t = step / 2; t < L; t += step) {
          const sd = (Math.floor(t / step) % 2) ? 1 : -1, x = ax + tx * t - tz * sd * (r.w / 2 + 0.7), z = az + tz * t + tx * sd * (r.w / 2 + 0.7);
          if (dC(x, z) > WALL_R - 4 || dC(x, z) < PLAZA_R + 1) continue;
          if (!freeRect(x, z, 0.6, 0.6, 0, 0.2, 0.05)) continue;
          lampPost(x, z, r.kind === 'jp' ? 'jp' : r.kind === 'elf' ? 'elf' : 'euro'); occCircle(x, z, 0.6);
        }
      }
    }
    // gardens with trees and benches in the leftover space
    for (let i = 0; i < 700; i++) {
      const a = rr(0, TAU), r = Math.sqrt(rnd()) * (WALL_R - 7), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      if (!freeRect(x, z, 1.6, 1.6, 0, 0.6, 0.6)) continue;
      const st = districtStyle(x, z);
      tree(x, z, st === 'jp' ? (rnd() < 0.7 ? 'sakura' : 'cypress') : st === 'elf' ? 'elf' : rnd() < 0.25 ? 'cypress' : 'oak');
      occCircle(x, z, 1.4); GARDENS.push({ x, z, r: 3.5 });
    }
  }

  /* ------------------------------------------------------------ lamps & halos */
  let lampPts = null, cityLight = null;
  function buildHalos() {
    const all = LAMPS.concat(BIGLIGHTS);
    if (!all.length) return;
    const pos = new Float32Array(all.length * 3), col = new Float32Array(all.length * 3), size = new Float32Array(all.length), c = new T.Color();
    all.forEach((l, i) => { pos.set([l.x, l.y, l.z], i * 3); c.set(l.c || '#ffb860'); col.set([c.r * 1.6, c.g * 1.6, c.b * 1.6], i * 3); size[i] = l.s || 4; });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1));
    lampPts = new T.Points(g, glowMat); lampPts.frustumCulled = false; ROOT.add(lampPts);
    cityLight = new T.PointLight('#ffb060', 0, 26, 1.6); ROOT.add(cityLight);
  }

  /* ------------------------------------------------------------ build the whole city */
  let built = false, nHouses = 0;
  function buildCity() {
    if (built) return; built = true;
    const t0 = performance.now();
    const safe = (name, fn) => { try { return fn(); } catch (err) { console.error('[metropolis3d ' + name + ']', err); return null; } };
    safe('wilds', clearWilds);
    defineRoads();
    for (const [x, z, r] of RESERVED) occCircle(x, z, r);
    for (const d of NAMED_DEFS) occCircle(d.x, d.z, 1.6);
    for (const g of GATES) occCircle(g.x, g.z, 12);
    safe('roads', buildRoads);
    safe('plaza', buildPlaza);
    safe('walls', buildWalls);
    for (const [nm, fn] of [['plazaCentre', buildPlazaCentre], ['guild', buildGuildHall], ['tavern', buildTavern], ['shops', buildShops], ['bank', buildBank], ['academy', buildAcademy],
      ['castle', buildCastle], ['cathedral', buildCathedral], ['arena', buildArena], ['market', buildMarket], ['stable', buildStable], ['japanese', buildJapanese], ['elven', buildElven], ['forge', buildForge], ['canal', buildCanal]]) safe(nm, fn);
    nHouses = safe('houses', fillHouses) || 0;
    safe('props', fillProps);
    safe('halos', buildHalos);
    safe('flush', flushKits);
    safe('crowd', buildCrowd);
    safe('pigeons', buildPigeons);
    safe('carts', buildCarts);
    ROOT.traverse((o) => { o.userData.metro = true; });
    FAR.traverse((o) => { o.userData.metro = true; });
    API.metropolis.buildMs = Math.round(performance.now() - t0);
  }

  /* ============================================================ DIALOGUE UI (visual-novel box) */
  const DLG = { open: false, npc: null, lines: [], li: 0, full: '', shown: 0, typing: false, opts: null, after: null, t: 0, block: 0 };
  (function dlgUI() {
    const st = document.createElement('style');
    st.textContent = `
#mdlg{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%) translateY(14px);width:min(96vw,860px);z-index:62;display:none;opacity:0;transition:opacity .25s,transform .25s;pointer-events:auto}
#mdlg.on{display:block}#mdlg.vis{opacity:1;transform:translateX(-50%) translateY(0)}
#mdlg .mb{display:flex;gap:12px;align-items:stretch;padding:10px 14px 10px 10px;background:linear-gradient(rgba(29,24,16,.97),rgba(12,10,6,.97));border:1px solid rgba(220,190,120,.75);box-shadow:0 0 0 1px #000,0 0 34px rgba(240,190,90,.22),inset 0 0 24px rgba(0,0,0,.6);border-radius:3px;position:relative}
#mdlg .mb:before,#mdlg .mb:after{content:'';position:absolute;width:14px;height:14px;border:2px solid #e8c060}
#mdlg .mb:before{left:-3px;top:-3px;border-right:0;border-bottom:0}#mdlg .mb:after{right:-3px;bottom:-3px;border-left:0;border-top:0}
#mdlg canvas{width:112px;height:128px;flex:0 0 112px;border:1px solid rgba(220,190,120,.5);background:#0b0906;border-radius:2px}
#mdlg .mc{flex:1;min-width:0;display:flex;flex-direction:column}
#mdlg .mh{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;border-bottom:1px solid rgba(220,190,120,.25);padding-bottom:3px}
#mdlg .mn{font-size:19px;color:#f3d27a;letter-spacing:1px}#mdlg .ms{font-size:12.5px;color:#a8987a;font-style:italic}
#mdlg .mt{font-size:16.5px;line-height:1.42;color:#efe3c0;min-height:3.1em}
#mdlg .mt.orc{color:#bfe8ff;font-style:italic}#mdlg .mt.nar{color:#c9b98f;font-style:italic}
#mdlg .mx{align-self:flex-end;color:#e8c060;font-size:13px;animation:mdb 1s infinite}
@keyframes mdb{0%,100%{opacity:.3}50%{opacity:1}}
#mdlg .ma{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px;margin-top:6px}
#mdlg .ma button{min-height:44px;padding:6px 10px;font:inherit;font-size:15px;color:#efe3c0;background:linear-gradient(rgba(70,56,30,.75),rgba(40,32,18,.75));border:1px solid rgba(220,190,120,.5);cursor:pointer;text-align:left;border-radius:2px}
#mdlg .ma button:hover{border-color:#f3d27a;background:linear-gradient(rgba(110,86,40,.8),rgba(60,46,22,.8))}
#mdlg .ma button em{font-style:normal;color:#e8c060;margin-right:7px;font-size:12px}
#mdlg .ma button small{display:block;color:#a8987a;font-size:11.5px}
#mdlg .ma button.off{opacity:.45}
#mbub{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#mbub .b{position:absolute;transform:translate(-50%,-100%);max-width:230px;padding:5px 10px 6px;background:rgba(250,244,228,.93);color:#2a2014;font-size:12.5px;line-height:1.3;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.45);text-align:center;opacity:0;transition:opacity .35s;font-family:Georgia,serif;white-space:normal}
#mbub .b:after{content:'';position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-top-color:rgba(250,244,228,.93);border-bottom:0}
#mbub .b.show{opacity:1}#mbub .b.call{background:rgba(255,236,190,.95);font-weight:bold}
#mbub .n{position:absolute;transform:translate(-50%,-100%);font-size:12px;color:#ffe7a8;text-shadow:0 0 3px #000,0 1px 2px #000;white-space:nowrap;text-align:center;opacity:0;transition:opacity .3s}
#mbub .n small{display:block;font-size:10px;color:#cdb98a}
#mbub .n.show{opacity:1}
#mcity{position:fixed;left:50%;top:22%;transform:translateX(-50%);text-align:center;pointer-events:none;opacity:0;transition:opacity 1.4s;z-index:20;text-shadow:0 0 18px #000,0 2px 4px #000}
#mcity.show{opacity:1}
#mcity .t1{font-size:clamp(30px,6.5vw,62px);letter-spacing:10px;color:#f3d27a}
#mcity .t2{font-size:clamp(13px,2.4vw,20px);letter-spacing:5px;color:#efe3c0;margin-top:4px}
#mcity .ln{height:1px;width:min(70vw,520px);margin:8px auto;background:linear-gradient(90deg,transparent,#e8c060,transparent)}
#mbank .box{width:min(92vw,420px)}#mbank .big{font-size:26px;color:#f3d27a;text-align:center;margin:6px 0}
@media (max-height:420px){#mdlg canvas{width:84px;height:96px;flex-basis:84px}#mdlg .mt{font-size:14.5px;min-height:2.6em}#mdlg .ma button{min-height:38px;font-size:14px}#mdlg .mn{font-size:16px}}
`;
    document.head.appendChild(st);
  })();
  const dEl = document.createElement('div'); dEl.id = 'mdlg';
  dEl.innerHTML = '<div class="mb"><canvas width="224" height="256"></canvas><div class="mc"><div class="mh"><span class="mn"></span><span class="ms"></span></div><div class="mt"></div><div class="mx">▼</div><div class="ma"></div></div></div>';
  document.body.appendChild(dEl);
  const dE = { cv: dEl.querySelector('canvas'), name: dEl.querySelector('.mn'), sub: dEl.querySelector('.ms'), text: dEl.querySelector('.mt'), nx: dEl.querySelector('.mx'), acts: dEl.querySelector('.ma') };
  const dCx = dE.cv.getContext('2d');
  dEl.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target.closest('button')) return; dAdvance(); });
  const pname = () => (API.ch && API.ch.name) || 'Viandante';
  function dStart(n) {
    if (performance.now() < DLG.block) return false;
    DLG.open = true; DLG.npc = n; DLG.opts = null; DLG.after = null; DLG.t = 0;
    dEl.classList.add('on'); requestAnimationFrame(() => dEl.classList.add('vis'));
    if (API.state === 'play') API.state = 'menu';
    try { if (API.input) { API.input.lock = null; API.input.keys = {}; } } catch (e) { /* ignore */ }
    if (n && n.id) emitEv('3d:talk', { npcId: n.id });
    if (n) n.talking = true;
    sfx('ui', { vol: 0.5 });
    dTick.last = performance.now(); if (!dTick.on) { dTick.on = true; requestAnimationFrame(dTick); }
    return true;
  }
  function dSay(lines, after) {
    DLG.lines = (Array.isArray(lines) ? lines : [lines]).map((l) => {
      let s = String(l), spk = 'c';
      if (s.startsWith('o:')) { spk = 'o'; s = s.slice(2); } else if (s.startsWith('n:')) { spk = 'n'; s = s.slice(2); } else if (s.startsWith('p:')) { spk = 'p'; s = s.slice(2); }
      return { spk, txt: s.replace(/\{P\}/g, pname()) };
    });
    DLG.li = 0; DLG.after = after || null; DLG.opts = null; dE.acts.innerHTML = '';
    dShow();
  }
  function dShow() {
    const L = DLG.lines[DLG.li], n = DLG.npc;
    DLG.full = L.txt; DLG.shown = 0; DLG.typing = true; DLG.spk = L.spk;
    dE.text.className = 'mt' + (L.spk === 'o' ? ' orc' : L.spk === 'n' ? ' nar' : '');
    if (L.spk === 'o') { dE.name.textContent = '《 Oracolo 》'; dE.name.style.color = '#7fd4ff'; dE.sub.textContent = 'Abilità Unica'; sfx('oracle', { vol: 0.4 }); }
    else if (L.spk === 'p') { dE.name.textContent = pname(); dE.name.style.color = '#9fe8ff'; dE.sub.textContent = 'Tu'; }
    else if (L.spk === 'n') { dE.name.textContent = ''; dE.sub.textContent = ''; }
    else { dE.name.textContent = n ? n.name : ''; dE.name.style.color = '#f3d27a'; dE.sub.textContent = n ? n.title : ''; }
    dE.text.textContent = ''; dE.nx.style.visibility = 'hidden';
  }
  function dChoices(list) {
    DLG.opts = list; dE.acts.innerHTML = ''; dE.nx.style.visibility = 'hidden';
    list.forEach((a, i) => {
      const b = document.createElement('button'); if (a.off) b.className = 'off';
      b.innerHTML = `<em>${i + 1}</em>${a.t}${a.s ? `<small>${a.s}</small>` : ''}`;
      b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      b.addEventListener('click', (ev) => { ev.stopPropagation(); dPick(i); });
      dE.acts.appendChild(b);
    });
  }
  function dPick(i) {
    const a = DLG.opts && DLG.opts[i]; if (!a) return;
    if (a.off) { toast(typeof a.off === 'string' ? a.off : 'Non disponibile'); sfx('uiBack'); return; }
    DLG.opts = null; dE.acts.innerHTML = ''; sfx('select'); a.fn();
  }
  function dAdvance() {
    if (!DLG.open) return;
    if (DLG.typing) { DLG.shown = DLG.full.length; return; }
    if (DLG.opts) return;
    if (DLG.li < DLG.lines.length - 1) { DLG.li++; dShow(); sfx('ui', { vol: 0.2 }); return; }
    if (DLG.after) { const a = DLG.after; DLG.after = null; a(); return; }
    dClose();
  }
  function dClose(keepMenu) {
    if (!DLG.open) return;
    DLG.open = false; DLG.opts = null; dEl.classList.remove('vis');
    setTimeout(() => { if (!DLG.open) dEl.classList.remove('on'); }, 260);
    if (DLG.npc) { DLG.npc.talking = false; DLG.npc.talkCd = 6; }
    DLG.npc = null; DLG.block = performance.now() + 450;
    if (!keepMenu && API.state === 'menu') API.state = 'play';
    sfx('uiBack', { vol: 0.3 });
  }
  function dTick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - dTick.last) / 1000)); dTick.last = now;
    if (!DLG.open) { dTick.on = false; return; }
    DLG.t += dt;
    if (DLG.typing) {
      const before = Math.floor(DLG.shown); DLG.shown = Math.min(DLG.full.length, DLG.shown + dt * 52);
      const k = Math.floor(DLG.shown);
      if (k !== before) { dE.text.textContent = DLG.full.slice(0, k); if (k % 3 === 0 && DLG.spk === 'c') sfx('ui', { vol: 0.035, pitch: 1.7 }); }
      if (k >= DLG.full.length) { DLG.typing = false; dE.text.textContent = DLG.full; if (!(DLG.li >= DLG.lines.length - 1 && DLG.after && DLG.after.auto)) dE.nx.style.visibility = 'visible'; if (DLG.li >= DLG.lines.length - 1 && DLG.after && DLG.after.auto) { const a = DLG.after; DLG.after = null; a(); } }
    }
    if (((dTick.f = (dTick.f || 0) + 1) & 1) === 0) drawPortrait(dCx, DLG.spk === 'o' ? 'o' : DLG.spk === 'p' ? 'p' : DLG.npc, DLG.t, DLG.typing);
    requestAnimationFrame(dTick);
  }
  window.addEventListener('keydown', (e) => {
    if (!DLG.open) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE' || e.code === 'KeyJ') { e.preventDefault(); dAdvance(); }
    else if (/^Digit[1-9]$/.test(e.code) && DLG.opts) dPick(+e.code.slice(5) - 1);
    else if (e.code === 'Escape' || e.code === 'Backspace') dClose();
  });
  // option helper: "auto" continuation after the last line → show choices
  const thenChoices = (fn) => { const f = () => fn(); f.auto = true; return f; };
  function drawPortrait(cx, who, t, talking) {
    const W = 224, H = 256; cx.clearRect(0, 0, W, H);
    if (who === 'o') {
      const g = cx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, 150); g.addColorStop(0, '#16314a'); g.addColorStop(1, '#03070d'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      cx.save(); cx.translate(W / 2, H / 2);
      for (let i = 0; i < 4; i++) { cx.strokeStyle = `rgba(120,210,255,${0.25 + i * 0.15})`; cx.lineWidth = 2; cx.beginPath(); cx.arc(0, 0, 30 + i * 18 + Math.sin(t * 2 + i) * 3, t * (i % 2 ? 1 : -1) * 0.6, t * (i % 2 ? 1 : -1) * 0.6 + 4.6); cx.stroke(); }
      cx.fillStyle = '#bfefff'; cx.shadowColor = '#7fd4ff'; cx.shadowBlur = 24; cx.beginPath(); cx.ellipse(0, 0, 34, 16, 0, 0, TAU); cx.fill();
      cx.fillStyle = '#0b2a40'; cx.beginPath(); cx.arc(Math.sin(t) * 6, 0, 11, 0, TAU); cx.fill(); cx.restore(); cx.shadowBlur = 0; return;
    }
    if (who === 'p') {
      const col = (API.ch && API.ch.color) || '#4fc3ff';
      const g = cx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, 150); g.addColorStop(0, shadeHex(col, -0.3)); g.addColorStop(1, '#05080c'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      const sq = 1 + Math.sin(t * 3) * 0.03; cx.save(); cx.translate(W / 2, H * 0.68); cx.scale(1 / sq, sq);
      const bg = cx.createRadialGradient(-20, -50, 10, 0, -20, 110); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.25, col); bg.addColorStop(1, shadeHex(col, -0.3));
      cx.fillStyle = bg; cx.beginPath(); cx.moveTo(-88, 40); cx.bezierCurveTo(-100, -40, -50, -110, 0, -112); cx.bezierCurveTo(50, -110, 100, -40, 88, 40); cx.closePath(); cx.fill();
      const bl = (t % 3.4) < 0.12 ? 0.15 : 1; cx.fillStyle = '#0b0e18'; for (const sx of [-1, 1]) { cx.beginPath(); cx.ellipse(sx * 26, -38, 10, 15 * bl, 0, 0, TAU); cx.fill(); }
      if (talking && Math.sin(t * 20) > 0) { cx.beginPath(); cx.ellipse(0, -10, 7, 4, 0, 0, TAU); cx.fill(); }
      cx.restore(); return;
    }
    const n = who || {}, L = n.look || {};
    const bgc = L.cloth || '#6a5a40';
    const g = cx.createRadialGradient(W / 2, H * 0.35, 8, W / 2, H / 2, 170); g.addColorStop(0, shadeHex(bgc, -0.25)); g.addColorStop(1, '#070504'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    cx.fillStyle = 'rgba(255,230,170,.05)'; for (let i = 0; i < 7; i++) { cx.beginPath(); cx.arc(20 + i * 32, 26 + (i % 2) * 18, 12, 0, TAU); cx.fill(); }
    const br = Math.sin(t * 1.8) * 1.5, sk = L.skin || '#f1d2bc', hr = L.hair || '#3a2a1e', cl = L.cloth || '#5a4a3a', burly = L.burly ? 1.18 : 1, kid = L.child ? 0.8 : 1;
    cx.save(); cx.translate(W / 2, H * 0.62 + br + (L.child ? 26 : 0)); cx.scale(kid, kid);
    // shoulders / clothes
    cx.fillStyle = cl; cx.beginPath(); cx.moveTo(-95 * burly, 120); cx.quadraticCurveTo(-92 * burly, 30, -40, 18); cx.lineTo(40, 18); cx.quadraticCurveTo(92 * burly, 30, 95 * burly, 120); cx.closePath(); cx.fill();
    if (L.apron) { cx.fillStyle = L.apron; cx.fillRect(-34, 34, 68, 90); }
    if (L.armor) { cx.fillStyle = '#9aa0a8'; cx.beginPath(); cx.ellipse(-58 * burly, 40, 30, 16, -0.3, 0, TAU); cx.ellipse(58 * burly, 40, 30, 16, 0.3, 0, TAU); cx.fill(); }
    if (L.trim) { cx.strokeStyle = L.trim; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(-40, 20); cx.lineTo(0, 60); cx.lineTo(40, 20); cx.stroke(); }
    cx.fillStyle = shadeHex(sk, -0.12); cx.fillRect(-14, -6, 28, 28);
    // head
    cx.fillStyle = sk; cx.beginPath(); cx.ellipse(0, -40, 40, 47, 0, 0, TAU); cx.fill();
    if (L.ears === 'elf') { cx.beginPath(); cx.moveTo(-36, -44); cx.lineTo(-64, -66); cx.lineTo(-34, -28); cx.fill(); cx.beginPath(); cx.moveTo(36, -44); cx.lineTo(64, -66); cx.lineTo(34, -28); cx.fill(); }
    if (L.ears === 'cat') { cx.fillStyle = hr; for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(sx * 18, -80); cx.lineTo(sx * 40, -112); cx.lineTo(sx * 42, -70); cx.fill(); } }
    if (L.horns) { cx.fillStyle = '#2a2030'; for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(sx * 18, -78); cx.quadraticCurveTo(sx * 40, -112, sx * 30, -122); cx.lineTo(sx * 28, -84); cx.fill(); } }
    // hair
    cx.fillStyle = hr; cx.beginPath(); cx.ellipse(0, -66, 43, 26, 0, PI, TAU); cx.fill();
    if (L.long) { cx.fillRect(-43, -66, 14, 70); cx.fillRect(29, -66, 14, 70); }
    if (L.beard) { cx.beginPath(); cx.ellipse(0, -14, 30, 26, 0, 0, PI); cx.fill(); }
    // eyes / mouth
    const bl = (t % 3.7) < 0.12 ? 0.15 : 1;
    cx.fillStyle = '#1a1210'; for (const sx of [-1, 1]) { cx.beginPath(); cx.ellipse(sx * 15, -42, 4.5, 6 * bl, 0, 0, TAU); cx.fill(); }
    cx.strokeStyle = '#1a1210'; cx.lineWidth = 2.5; for (const sx of [-1, 1]) { cx.beginPath(); cx.moveTo(sx * 9, -54); cx.lineTo(sx * 22, -55); cx.stroke(); }
    cx.fillStyle = '#6a2a24'; if (talking && Math.sin(t * 18) > -0.2) { cx.beginPath(); cx.ellipse(0, -20, 7, 5, 0, 0, TAU); cx.fill(); } else { cx.fillRect(-7, -21, 14, 2.5); }
    cx.fillStyle = 'rgba(255,120,120,.18)'; for (const sx of [-1, 1]) { cx.beginPath(); cx.arc(sx * 24, -28, 7, 0, TAU); cx.fill(); }
    // hats
    const hc = L.hatC || '#3a2a1a';
    if (L.hat === 'wizard') { cx.fillStyle = hc; cx.beginPath(); cx.ellipse(0, -76, 62, 12, 0, 0, TAU); cx.fill(); cx.beginPath(); cx.moveTo(-34, -78); cx.lineTo(12, -168); cx.lineTo(34, -78); cx.fill(); cx.fillStyle = '#e8c060'; cx.fillRect(-34, -86, 68, 7); }
    else if (L.hat === 'straw') { cx.fillStyle = hc; cx.beginPath(); cx.ellipse(0, -78, 70, 14, 0, 0, TAU); cx.fill(); cx.beginPath(); cx.ellipse(0, -86, 36, 18, 0, PI, TAU); cx.fill(); }
    else if (L.hat === 'cap') { cx.fillStyle = hc; cx.beginPath(); cx.ellipse(0, -76, 44, 22, 0, PI, TAU); cx.fill(); }
    else if (L.hat === 'helmet') { cx.fillStyle = '#9aa0a8'; cx.beginPath(); cx.ellipse(0, -68, 46, 36, 0, PI, TAU); cx.fill(); cx.fillRect(-4, -70, 8, 30); }
    else if (L.hat === 'kasa') { cx.fillStyle = hc; cx.beginPath(); cx.moveTo(-80, -70); cx.lineTo(0, -120); cx.lineTo(80, -70); cx.fill(); }
    else if (L.hat === 'hood') { cx.fillStyle = hc; cx.beginPath(); cx.ellipse(0, -52, 50, 60, 0, PI * 0.95, TAU + 0.05); cx.fill(); }
    else if (L.hat === 'crown') { cx.fillStyle = '#e8c060'; cx.beginPath(); cx.moveTo(-30, -80); for (let i = 0; i <= 4; i++) { cx.lineTo(-30 + i * 15, i % 2 ? -94 : -108); } cx.lineTo(30, -80); cx.fill(); }
    cx.restore();
    cx.strokeStyle = 'rgba(232,192,96,.5)'; cx.lineWidth = 3; cx.strokeRect(2, 2, W - 4, H - 4);
  }

  /* ============================================================ NAMED CITIZENS, LORE AND SERVICES */
  const LORE = {
    city: ['Altheria è nata dove sette Crepe si sono chiuse nello stesso istante. Da allora ogni strada porta un po\' di un altro mondo.',
      'Dicono che sotto la Piazza delle Mille Stelle ci sia la prima Crepa mai sigillata. Le stelle del mosaico sono i nomi dei caduti.',
      'Il canale delle lanterne lo hanno scavato gli gnomi del Mondo di Rame. Ancora oggi nessuno sa dove finisca l\'acqua.',
      'Re Valerian IV non è un re guerriero, ma ha accolto profughi da sei mondi diversi. Questo, qui, vale più di cento battaglie.'],
    rumor: ['Ho sentito che al decimo piano della Torre c\'è un mercante che vende cose che non esistono ancora.',
      'Un avventuriero di rango C è tornato dalla Palude dei Sussurri parlando al contrario. Non ha più smesso.',
      'Le guardie dicono che di notte una slime blu si aggira per i tetti. Ah… sei tu?',
      'Il Tiranno del Sud una volta era un re. Ora è solo rabbia con una corona. Stai lontano dalla sua arena, se non sei pronto.',
      'All\'Accademia hanno fatto esplodere di nuovo l\'ala est. Terza volta questo mese. Pare fosse "una lezione di prudenza".',
      'Il drago della Vetta della Tempesta era il guardiano della città. Se è impazzito, qualcosa di brutto sta arrivando.'],
    demon: ['Il Signore dei Demoni Nyxareth non ha esercito. Ha solo promesse. E chi lo ascolta diventa il suo esercito.',
      'Quando una Crepa si apre, il cielo diventa viola per un istante. Se lo vedi, corri. O combatti, se sei della Gilda.'],
  };
  const ROLE_LINES = {
    citizen: ['Bella giornata per passeggiare, vero?', 'Hai visto i prezzi del pane? Colpa delle Crepe!', 'Mio cugino è stato evocato in un altro mondo. Manda cartoline… stranissime.', 'Attento ai borseggiatori vicino al mercato.', 'La Gilda cerca sempre gente coraggiosa. O disperata.', 'Uno slime che parla? In questa città ho visto di peggio.', 'Il Re ci proteggerà. Il Re e gli eroi evocati.', 'Stasera alla Luna Storta suona il bardo Lirio!', 'Sai che all\'Accademia insegnano anche agli slime? O forse era una barzelletta.', 'Io vengo dal Mondo di Vetro. Qui almeno i palazzi non tintinnano quando piove.'],
    night: ['È tardi… meglio tornare a casa.', 'Le lanterne del canale sono magiche, sai? Non si spengono mai.', 'Di notte la Cattedrale brilla come un gioiello.', 'Shh! Le guardie fanno la ronda.'],
    guard: ['Circolare, prego.', 'Niente risse in città, avventuriero.', 'La Porta è aperta giorno e notte. Le sentinelle no: quelle dormono a turno.', 'Mostri dentro le mura? Non finché ci siamo noi.', 'Ronda tranquilla, per ora.'],
    child: ['Prendimi se ci riesci!', 'Uno slime! Uno slime vero!', 'Da grande sarò un eroe evocato!', 'Mamma dice che non devo parlare con gli sconosciuti. Ma tu sei gelatina!'],
    merchant: ['Mele dolci del Mondo di Rame! Due per un\'anima!', 'Pesce fresco del canale! Freschissimo!', 'Stoffe di seta elfica, morbide come nuvole!', 'Spezie dalle Lande di Kharvos! Piccanti come un drago!', 'Gemme che brillano al buio! Ottime per le proposte di matrimonio!', 'Pane appena sfornato, croccante fuori, morbido dentro!', 'Fiori dei Giardini di Sylvaren, profumano per una settimana!', 'Vasi e ciotole! Indistruttibili! …Quasi.'],
  };
  function loreLine() { return pick(pick([LORE.city, LORE.rumor, LORE.demon, ROLE_LINES.citizen])); }
  const RANKS_IT = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
  function guildRank() { try { if (API.quests && API.quests.rank) return RANKS_IT[API.quests.rank()] || null; } catch (e) { /* ignore */ } return null; }

  // generic chatter dialogue with a menu
  function talkGeneric(n) {
    if (!dStart(n)) return;
    const menu = () => {
      const opts = [];
      for (const tp of n.topics || []) opts.push({ t: tp.t, fn: () => dSay(tp.l, thenChoices(menu)) });
      opts.push({ t: 'Arrivederci', fn: () => dClose() });
      dChoices(opts);
    };
    dSay(n.hello || [pick(ROLE_LINES.citizen)], thenChoices(menu));
  }
  function talkShop(n) {
    if (!dStart(n)) return;
    const greet = { weapons: ['Benvenuto all\'Armeria! Lame forgiate a Kharum-Dur e temprate nel canale. Taglienti come la lingua di mia suocera.'],
      armor: ['Scudi, corazze, elmi. Se ti colpiscono, almeno fallo con stile.'], magic: ['Benvenuto all\'Occhio di Vetro. Tocca pure, ma se qualcosa ti parla… non rispondere.'],
      potions: ['Pozioni! Elisir! Tonici! Il Calderone Felice ha qualcosa per ogni ferita. Quasi ogni ferita.'], general: ['Tutto Serve! Corde, torce, pergamene, sacchi… Se esiste, ce l\'ho. Se non esiste, lo ordino.'] }[n.kind] || ['Benvenuto!'];
    dSay(greet, thenChoices(() => dChoices([
      { t: 'Mostrami la merce', s: 'Compra e vendi', fn: () => { dClose(true); openShopSafe(n.kind); } },
      { t: 'Novità in città?', fn: () => dSay([pick(LORE.rumor)], thenChoices(() => dChoices([{ t: 'Mostrami la merce', fn: () => { dClose(true); openShopSafe(n.kind); } }, { t: 'Arrivederci', fn: () => dClose() }]))) },
      { t: 'Arrivederci', fn: () => dClose() },
    ])));
  }
  function openShopSafe(kind) {
    API.state = 'play';
    if (API.rpg && API.rpg.openShop) { try { API.rpg.openShop(kind); return; } catch (e) { console.error(e); } }
    toast('La bottega è chiusa per inventario. Torna più tardi!');
  }
  function talkTrainer(n) {
    if (!dStart(n)) return;
    dSay(['Benvenuto all\'Accademia Arcana, {P}. Qui insegniamo le Vie: guerriero, mago, assassino, paladino, evocatore… e qualcuna che non ha ancora un nome.', 'Vuoi affinare le tue abilità o cambiare Via?'], thenChoices(() => dChoices([
      { t: 'Allenamento e classi', s: 'Abilità, talenti, cambio classe', fn: () => { dClose(true); API.state = 'play'; if (API.rpg && API.rpg.openTrainer) { try { API.rpg.openTrainer(); } catch (e) { console.error(e); } } else toast('Il maestro è in riunione col Decano.'); } },
      { t: 'Cos\'è l\'Accademia?', fn: () => dSay(['Fu fondata da Aurelion, il Primo Evocato, la stessa figura della statua in piazza.', 'Studiamo la magia di tutti i mondi. I cristalli che fluttuano sopra la torre sono "Pensieri Solidi": memorie di maghi caduti.', 'o:《Analisi: i cristalli contengono magicule ad altissima densità. Consiglio di non tentare di divorarli. Probabilmente.》'], thenChoices(() => dChoices([{ t: 'Allenamento e classi', fn: () => { dClose(true); API.state = 'play'; if (API.rpg && API.rpg.openTrainer) API.rpg.openTrainer(); } }, { t: 'Arrivederci', fn: () => dClose() }]))) },
      { t: 'Arrivederci', fn: () => dClose() },
    ])));
  }
  function innRest(n) {
    const cost = Math.min(200, 20 + ((API.rpg && API.rpg.level) || 1) * 5);
    if (S.runes < cost) { dSay(['Mi dispiace, tesoro: una stanza costa ' + cost + ' anime. Torna quando la borsa è più pesante.'], thenChoices(() => innMenu(n))); return; }
    S.runes -= cost;
    dSay(['Stanza al piano di sopra, la terza a sinistra. Lenzuola pulite e niente fantasmi. Quasi niente fantasmi.'], () => {
      dClose(true);
      const f = document.getElementById('fade'); if (f) f.style.opacity = 1;
      API.state = 'menu';
      setTimeout(() => {
        S.grace = graceIdx; S.found[graceIdx] = true;
        try { API.recalc(true); } catch (e) { P.hp = P.maxHp; P.fp = P.maxFp; }
        P.hp = P.maxHp; P.fp = P.maxFp; P.st = P.maxSt; P.flasks = S.flasks;
        API.DAY.t = 0.015; API.saveS();
        API.teleport(n.x + 1.5, n.z + 2.5);
        if (f) f.style.opacity = 0; API.state = 'play';
        API.bigMsg('Un nuovo giorno', 'place', 2.6); sfx('heal');
        oracle('《Riposo completato. Salute e magicule ripristinate. Punto di ritorno: Piazza delle Mille Stelle.》');
        API.lightPillar(P.x, P.z, '#ffd36b', 1.2);
      }, 1300);
    });
  }
  function innMenu(n) {
    const cost = Math.min(200, 20 + ((API.rpg && API.rpg.level) || 1) * 5);
    dChoices([
      { t: 'Riposa fino al mattino', s: cost + ' anime · cura completa, punto di ritorno', fn: () => innRest(n) },
      { t: 'Ascolta le voci della locanda', fn: () => dSay([pick(LORE.rumor), pick(LORE.rumor.concat(LORE.demon))], thenChoices(() => innMenu(n))) },
      { t: 'Un boccale di sidro', s: '5 anime', off: S.runes < 5 ? 'Non hai abbastanza anime' : false, fn: () => { S.runes -= 5; API.saveS(); sfx('coin'); P.st = P.maxSt; dSay(['n:Il sidro di mele del Mondo di Rame frizza sulla lingua. Ti senti pieno di energia.', 'Offre la casa la prossima volta! …No, scherzo.'], thenChoices(() => innMenu(n))); } },
      { t: 'Arrivederci', fn: () => dClose() },
    ]);
  }
  function talkInn(n) { if (!dStart(n)) return; dSay(['Benvenuto alla Luna Storta, {P}! La luna è storta, ma i letti sono dritti.'], thenChoices(() => innMenu(n))); }
  function talkStable(n) {
    if (!dStart(n)) return;
    const first = !S.metroStable;
    const lesson = ['Ah, un nuovo viaggiatore! Ascolta il vecchio Corrado.', 'Ogni Luce di Grazia che scopri resta legata alla tua anima. Da qui posso portarti a qualunque Luce già visitata: carrozza reale, cavalli del Mondo di Vento.', 'Puoi anche farlo da solo: apri la mappa (tasto M, o il pulsante Mappa) e tocca una Luce scoperta.', 'o:《Viaggio rapido acquisito. Le Luci di Grazia scoperte sono collegate.》'];
    dSay(first ? lesson : ['Pronto a partire? I cavalli scalpitano.'], thenChoices(() => {
      if (first) { S.metroStable = true; API.saveS(); sfx('skillGet'); }
      dChoices([
        { t: 'Viaggio rapido', s: 'Apri la mappa delle Luci di Grazia', fn: () => { dClose(true); API.state = 'play'; try { API.openMap(); } catch (e) { toast('Mappa non disponibile'); } } },
        { t: 'Parlami dei cavalli', fn: () => dSay(['Questi vengono dal Mondo di Vento: zoccoli leggeri, criniere che non si annodano mai.', 'Quello grigio si chiama Tempesta. Morde solo i nobili. Ha buon gusto.'], thenChoices(() => dChoices([{ t: 'Viaggio rapido', fn: () => { dClose(true); API.state = 'play'; API.openMap(); } }, { t: 'Arrivederci', fn: () => dClose() }]))) },
        { t: 'Arrivederci', fn: () => dClose() },
      ]);
    }));
  }
  // bank: anime deposited here are safe from death
  let bankEl = null;
  function openBank() {
    if (!bankEl) {
      bankEl = document.createElement('div'); bankEl.className = 'panel'; bankEl.id = 'mbank';
      bankEl.innerHTML = '<div class="box"><h2>Banco dei Mille Mondi</h2><div class="muted" style="text-align:center">Le anime depositate sono al sicuro: non le perderai cadendo in battaglia.</div><div class="big"></div><div class="muted cur" style="text-align:center"></div><div class="row"><button data-a="d1">Deposita 100</button><button data-a="dh">Deposita metà</button><button data-a="da">Deposita tutto</button></div><div class="row"><button data-a="w1">Preleva 100</button><button data-a="wh">Preleva metà</button><button data-a="wa">Preleva tutto</button></div><button data-a="x">Chiudi</button></div>';
      document.body.appendChild(bankEl);
      bankEl.addEventListener('pointerdown', (e) => e.stopPropagation());
      bankEl.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        const a = b.dataset.a, bank = S.bank || 0, have = Math.floor(S.runes);
        let mv = 0;
        if (a === 'x') { bankEl.classList.remove('open'); API.state = 'play'; DLG.block = performance.now() + 400; sfx('uiBack'); return; }
        if (a[0] === 'd') mv = a === 'd1' ? Math.min(100, have) : a === 'dh' ? Math.floor(have / 2) : have;
        else mv = -(a === 'w1' ? Math.min(100, bank) : a === 'wh' ? Math.floor(bank / 2) : bank);
        if (!mv) { sfx('deny'); return; }
        S.runes -= mv; S.bank = bank + mv; API.saveS(); sfx('coin'); renderBank();
      }));
    }
    renderBank(); bankEl.classList.add('open'); API.state = 'menu';
  }
  function renderBank() { bankEl.querySelector('.big').textContent = fmtN(S.bank || 0) + ' anime in deposito'; bankEl.querySelector('.cur').textContent = 'Con te: ' + fmtN(S.runes) + ' anime'; }
  function talkBank(n) {
    if (!dStart(n)) return;
    dSay(['Ser Amadeo Contafiorini, al vostro servizio. Il Banco custodisce anime da quattro generazioni.', 'Ciò che lasciate qui non va perduto, nemmeno se… cadete. Un servizio molto apprezzato dagli avventurieri.'], thenChoices(() => dChoices([
      { t: 'Gestisci il deposito', s: 'Saldo: ' + fmtN(S.bank || 0) + ' anime', fn: () => { dClose(true); openBank(); } },
      { t: 'Arrivederci', fn: () => dClose() },
    ])));
  }
  function talkFortune(n) {
    if (!dStart(n)) return;
    const today = Math.floor(Date.now() / 3.6e6);
    const fortunes = ['Vedo… una scala che non finisce mai. E tu che sali, piano dopo piano.', 'Le carte dicono: un incontro con qualcuno che ha tre nomi. Uno di questi è falso.', 'La tua stella è gelatinosa. È un buon segno. Credo.', 'Attento al numero sette. O al sette di coppe. O a chi ne beve sette.', 'Una corona cadrà, e tu sarai lì a raccoglierla. O a schivarla.'];
    dSay(['Avvicinati, piccola anima liquida… Madama Zaffira legge le stelle di mille mondi.'], thenChoices(() => dChoices([
      { t: 'Leggimi il futuro', s: S.metroFortune === today ? 'Già fatto oggi' : '10 anime', off: S.metroFortune === today ? 'Le stelle parlano una volta sola al giorno' : S.runes < 10 ? 'Non hai abbastanza anime' : false,
        fn: () => { S.runes -= 10; S.metroFortune = today; API.saveS(); sfx('portal', { vol: 0.4 }); const f = pick(fortunes); const luck = Math.random() < 0.4; if (luck && API.rpg && API.rpg.giveGold) { try { API.rpg.giveGold(25); } catch (e) { /* ignore */ } } dSay(['n:Le carte girano da sole sul tavolo di velluto.', f].concat(luck ? ['…E guarda, una moneta dimenticata sotto il mazzo. È tua. Il destino è generoso, oggi.'] : []), thenChoices(() => dChoices([{ t: 'Arrivederci', fn: () => dClose() }]))); } },
      { t: 'Arrivederci', fn: () => dClose() },
    ])));
  }
  function talkCrier(n) {
    if (!dStart(n)) return;
    const r = guildRank();
    const news = ['Udite, udite! La Gilda cerca avventurieri per i contratti della settimana! Ricompense in anime e gloria!',
      'Udite! Sua Maestà Valerian IV invita tutti gli eroi evocati al castello!',
      'Notizia del giorno: la Torre dei Mille Piani ha "cresciuto" un nuovo piano durante la notte! Gli studiosi sono in subbuglio!',
      'Avviso: chi trova il gatto del Decano dell\'Accademia è pregato di non chiedergli cosa ha visto.'];
    dSay([pick(news), r ? 'E tu, rango ' + r + ' della Gilda! Il popolo parla di te!' : 'E tu, forestiero! Registrati alla Gilda, a nord-est della piazza!'], thenChoices(() => dChoices([
      { t: 'Altre notizie', fn: () => dSay([pick(news), pick(LORE.rumor)], thenChoices(() => dChoices([{ t: 'Arrivederci', fn: () => dClose() }]))) },
      { t: 'Arrivederci', fn: () => dClose() },
    ])));
  }

  const NAMED_DEFS = [
    { id: 'm_matilde', name: 'Matilde Pancalda', title: 'Locandiera della Luna Storta', x: 41, z: 494.5, face: [41, 480], role: 'inn', look: { skin: '#f0c8a8', cloth: '#8a3a2a', hair: '#a0402a', apron: '#efe2c8', long: true, robe: true }, talk: talkInn, label: 'Locanda: riposa / voci' },
    { id: 'm_corrado', name: 'Corrado Briglialunga', title: 'Maestro delle Scuderie Reali', x: 92, z: 480.5, face: [92, 470], role: 'stable', look: { skin: '#c89070', cloth: '#5a4a2a', hair: '#d8d0c0', beard: true, hat: 'straw', hatC: '#c8a860' }, talk: talkStable, label: 'Scuderie: viaggio rapido' },
    { id: 'm_ysolde', name: 'Magistra Ysolde Venturi', title: 'Maestra delle Vie (allenatrice di classe)', x: 0, z: 396.2, face: [0, 420], role: 'trainer', look: { skin: '#f4dcc8', cloth: '#3a2a6a', hair: '#1a1a2a', hat: 'wizard', hatC: '#2a1a5a', trim: '#e8c060', robe: true, long: true }, talk: talkTrainer, label: 'Accademia: allenamento e classi' },
    { id: 'm_amadeo', name: 'Ser Amadeo Contafiorini', title: 'Banchiere del Banco dei Mille Mondi', x: -15, z: 442.6, face: [-15, 460], role: 'bank', look: { skin: '#f0d0b0', cloth: '#1e2a40', hair: '#7a7a7a', trim: '#e8c060', hat: 'cap', hatC: '#1e2a40' }, talk: talkBank, label: 'Banco: deposita anime' },
    { id: 'm_gaspare', name: 'Gaspare il Banditore', title: 'Voce della Piazza', x: 9, z: 482, face: [0, 470], role: 'crier', look: { skin: '#e8b890', cloth: '#8a1e2a', hair: '#3a2a1a', hat: 'cap', hatC: '#8a1e2a', trim: '#e8c060' }, talk: talkCrier },
    { id: 'm_zaffira', name: 'Madama Zaffira', title: 'Cartomante dei Mille Mondi', x: 58, z: 462.5, face: [70, 450], role: 'fortune', look: { skin: '#d8a888', cloth: '#4a1e5a', hair: '#1a1020', hat: 'hood', hatC: '#2a1040', long: true, robe: true }, talk: talkFortune },
    { id: 'm_teodora', name: 'Archivista Teodora', title: 'Custode degli Archivi dell\'Accademia', x: 16, z: 414, face: [0, 410], look: { skin: '#f4dcc8', cloth: '#5a4a6a', hair: '#c8c8c8', robe: true, long: true },
      hello: ['Silenzio, per favore… ah, sei tu, il nuovo arrivato. Benvenuto ad Altheria.'],
      topics: [{ t: 'La Convergenza dei Mondi', l: ['Da secoli i mondi si avvicinano come pianeti in un\'orbita stretta. Quando si sfiorano, nascono le Crepe.', 'Dalle Crepe cadono persone, mostri, città intere. Altheria è fatta di questi frammenti: è per questo che la chiamano Città dei Mille Mondi.'] },
        { t: 'Gli Evocati', l: ['Quando la Convergenza si fa pericolosa, il Regno evoca eroi da altri mondi. Ren, Sora, Brann… e ora tu, in un certo senso.', 'Il primo fu Aurelion, mille anni fa. Era un semplice studente, dicono. Tornò a casa? Nessuno lo sa.'] },
        { t: 'Il Signore dei Demoni', l: LORE.demon }] },
    { id: 'm_daichi', name: 'Daichi Amamiya', title: 'Cuoco del Quartiere dei Ciliegi · ex Eroe Evocato', x: -68.7, z: 462, face: [-62, 462], look: { skin: '#f0d0a8', cloth: '#2a3a5a', hair: '#1a1a1a', apron: '#efe8d8', hat: 'none' },
      hello: ['Irasshai! Cioè… benvenuto! Vuoi una ciotola di brodo dei Ciliegi?', 'Vent\'anni fa mi hanno evocato per sconfiggere un lich. L\'ho fatto in tre giorni. Poi mi sono annoiato e ho aperto un ristorante.'],
      topics: [{ t: 'Com\'è essere evocati?', l: ['Un attimo prima stai attraversando la strada, quello dopo una principessa ti chiama "Eroe" e ti dà una spada.', 'Il segreto? Non credere a chi dice che sei il prescelto. Scegli tu cosa essere.'] },
        { t: 'Il Quartiere dei Ciliegi', l: ['Lo hanno costruito gli evocati del mio mondo, generazione dopo generazione: torii, pagode, lanterne di pietra…', 'Quando i ciliegi fioriscono, perfino le guardie si fermano a guardare.'] }] },
    { id: 'm_ayame', name: 'Sacerdotessa Ayame', title: 'Custode del Santuario della Campana', x: -71, z: 456, face: [-62, 456], look: { skin: '#f8e0d0', cloth: '#efefef', hair: '#101010', trim: '#b03a2a', long: true, robe: true },
      hello: ['La campana del santuario suona all\'alba per ricordare i Cinque Venti. Ogni vento porta un mondo con sé.'],
      topics: [{ t: 'La Pagoda dei Cinque Venti', l: ['Ogni piano della pagoda è dedicato a un vento: Tempesta, Brezza, Gelo, Cenere e Silenzio.', 'Il quinto vento, il Silenzio, soffia solo quando una Crepa si chiude. Lo sentirai, un giorno.'] },
        { t: 'Una benedizione', l: ['Che i venti ti siano favorevoli, piccolo viandante.', 'o:《Nessun effetto rilevato. Tuttavia, il morale risulta leggermente aumentato.》'] }] },
    { id: 'm_elarin', name: 'Elarin Foglialuna', title: 'Custode dei Giardini di Sylvaren', x: 58, z: 545, face: [64, 553], look: { skin: '#f4ecd8', cloth: '#3a6a4a', hair: '#e8e0b0', ears: 'elf', long: true, robe: true },
      hello: ['Shh… l\'Albero sta sognando. Gli elfi di Sylvaren lo hanno portato qui quando la loro foresta cadde in una Crepa.'],
      topics: [{ t: 'L\'Albero di Sylvaren', l: ['Ha milleduecento anni e ricorda ogni elfo che si è riposato alla sua ombra.', 'Le lanterne che pendono dai rami sono anime gentili. Non avere paura: illuminano, non giudicano.'] },
        { t: 'Gli elfi e gli umani', l: ['All\'inizio gli umani ci temevano. Poi hanno assaggiato il nostro miele. Ora ci invitano a tutti i matrimoni.'] }] },
    { id: 'm_durgan', name: 'Durgan Pietrafonda', title: 'Maestro Forgiatore di Kharum-Dur', x: -40, z: 547, face: [-48, 552], look: { skin: '#d89a7a', cloth: '#5a3a2a', hair: '#c8601a', beard: true, burly: true, apron: '#3a2a1e' },
      hello: ['Hmpf. Un altro avventuriero con le mani morbide. Anzi… tu non hai proprio mani. Interessante.'],
      topics: [{ t: 'La forgia', l: ['La Forgia di Kharum-Dur brucia da trecento anni. Il fuoco viene dalla nostra montagna, caduta in una Crepa con tutti noi dentro.', 'Ogni lama dell\'Armeria della via delle botteghe passa da qui. Se si spezza, venite a lamentarvi. Ma non si spezza.'] },
        { t: 'L\'Incudine dei Padri', l: ['Su quell\'incudine il primo re dei nani forgiò la promessa di alleanza con Altheria.', 'Si dice che chi ci batte sopra con un cuore sincero senta la voce degli antenati. Io sento solo il mal di schiena.'] }] },
    { id: 'm_cassio', name: 'Cassio Ferrante', title: 'Maestro dell\'Arena dei Campioni', x: -55, z: 503, face: [-70, 522], look: { skin: '#c88a6a', cloth: '#8a2a1a', hair: '#2a1a10', armor: true, burly: true },
      hello: ['L\'Arena dei Campioni! Qui si misura il valore, non il titolo. Neanche gli eroi evocati sono esentati.'],
      topics: [{ t: 'Sfida dell\'Arena', l: ['Ogni sera i campioni combattono per la gloria. Quando sarai pronto, entra dalla porta grande.', 'Le regole sono semplici: niente veleni, niente draghi, niente divorare l\'avversario. Sì, l\'ultima l\'ho aggiunta per te.'] },
        { t: 'Campioni famosi', l: ['Brann Durnhal ha vinto ventidue incontri di fila. Al ventitreesimo ha perso contro un gatto. Lunga storia.'] }] },
    { id: 'm_rosalba', name: 'Capitana Rosalba Ventodiferro', title: 'Comandante della Guardia Cittadina', x: 116, z: 478, face: [125, 470], look: { skin: '#e8c0a0', cloth: '#2a3e6a', hair: '#8a2a1a', armor: true, hat: 'helmet', long: true },
      hello: ['Porta dell\'Alba, Guardia Cittadina. Altheria è sicura finché queste mura restano in piedi.'],
      topics: [{ t: 'La sicurezza della città', l: ['Nessun mostro supera le mura. Se ne vedi uno dentro, è già morto: ci pensano le sentinelle sulle torri.', 'Di notte raddoppiamo le ronde con le torce. Le Crepe preferiscono il buio.'] },
        { t: 'La Torre dei Mille Piani', l: ['È spuntata fuori dalla Porta Est una mattina, cent\'anni fa. Da allora sorvegliamo l\'ingresso giorno e notte.', 'Chi sale troppo in fretta torna giù… in un modo o nell\'altro.'] }] },
    { id: 'm_mirka', name: 'Mirka', title: 'Mezzademone, profuga di Nyx', x: -20, z: 481, face: [0, 470], look: { skin: '#c8a8c0', cloth: '#2a1a2a', hair: '#e8e8f0', horns: true, long: true, hat: 'hood', hatC: '#1a1020' },
      hello: ['…Non scappi? Di solito quando vedono le corna la gente scappa.', 'Vengo da Nyx, il mondo da cui è arrivato il Signore dei Demoni. Non tutti i demoni lo seguono, sai.'],
      topics: [{ t: 'Nyxareth', l: ['Nyxareth promette a ognuno ciò che desidera di più. Ai deboli la forza, ai soli una famiglia, agli eroi… una storia in cui sono protagonisti.', 'È così che conquista: non con le armi, ma con i desideri.'] },
        { t: 'La vita ad Altheria', l: ['Il Re mi ha dato un tetto e un lavoro. Alcuni mi guardano storto, ma i bambini mi chiedono di toccare le corna. È un inizio.'] }] },
    { id: 'm_tamsin', name: 'Tamsin Codalesta', title: 'Mercante delle Terre Selvagge', x: 77, z: 440.5, face: [72, 446], look: { skin: '#f0d0b0', cloth: '#7a5a2a', hair: '#d8902a', ears: 'cat', long: true },
      hello: ['Miao! Cioè, salve! Tamsin, mercante del popolo felino delle Terre Selvagge. Le mie spezie fanno starnutire i draghi!'],
      topics: [{ t: 'Il popolo felino', l: ['Siamo arrivati con la Terza Convergenza. Agili, curiosi, pessimi a pagare le tasse.', 'Ad Altheria si sta bene: il mercato è grande, i topi sono pochi e il pesce del canale è ottimo.'] },
        { t: 'Il mercato', l: ['Il Mercato dei Mille Mondi apre all\'alba e chiude quando la Luna Storta accende le lanterne. Sedici bancarelle, sedici mondi!'] }] },
    { id: 'm_colomba', name: 'Nonna Colomba', title: 'Amica dei piccioni', x: -10, z: 459, face: [0, 452], look: { skin: '#f4dcc8', cloth: '#6a5a7a', hair: '#efefef', hat: 'hood', hatC: '#4a3a5a', robe: true },
      hello: ['Piano, piano, che spaventi i miei piccioni! Corrono tutti via quando qualcuno passa di corsa.'],
      topics: [{ t: 'I piccioni', l: ['Ognuno ha un nome. Quello è Duca, quello è Baronessa, quello grasso è Re Valerian. Non ditelo al Re.', 'Dicono che i piccioni di questa piazza discendano da un uccello di fuoco di un altro mondo. Io dico che mangiano troppo pane.'] }] },
    { id: 'm_lirio', name: 'Lirio il Menestrello', title: 'Bardo itinerante', x: 33, z: 485, face: [37, 492], look: { skin: '#f0c8a0', cloth: '#2a6a5a', hair: '#e8b040', hat: 'cap', hatC: '#6a2a5a', trim: '#e8c060' },
      hello: ['♪ C\'era una volta uno slime, gocciolante e solo… ♪ Oh! Sei proprio tu! Il protagonista della mia ballata!'],
      topics: [{ t: 'Cantami la ballata', l: ['♪ Si risvegliò tra le rovine, senza mani né spada, ♪', '♪ ma divorò il lupo e il fulmine, e si aprì la strada… ♪', '♪ Ora cammina tra mille mondi, gelatina e corona, ♪', '♪ e chi lo prende in giro, presto non ragiona! ♪', 'Grazie, grazie! Gli applausi in anime sono graditi.'] },
        { t: 'Altre storie', l: ['Conosci la leggenda del Re Gelatina? Uno slime che unì mostri e uomini in una sola nazione. A Valdoria lo venerano ancora.'] }] },
    { id: 'm_ottavio', name: 'Ottavio Saltapiani', title: 'Studioso della Torre', x: 104, z: 462, face: [125, 470], look: { skin: '#f0d8c0', cloth: '#4a4a6a', hair: '#5a4a3a', hat: 'wizard', hatC: '#4a4a6a', robe: true },
      hello: ['La Torre dei Mille Piani! Fuori dalla Porta dell\'Alba! Ogni piano un mondo diverso, ogni dieci piani un guardiano!'],
      topics: [{ t: 'Consigli per la Torre', l: ['Sali un piano alla volta. I piani multipli di cinque hanno un punto di riposo. I multipli di dieci… un guardiano molto arrabbiato.', 'E porta pozioni. Molte pozioni. Più di quelle che pensi.'] }] },
    { id: 'm_gunnar', name: 'Gunnar il Monco', title: 'Avventuriero di Rango S in pensione', x: 46.5, z: 492.6, face: [41, 489], look: { skin: '#e0b090', cloth: '#4a3a2a', hair: '#9a9a9a', beard: true, burly: true },
      hello: ['Siediti, ragazzo. O gelatina. Quarant\'anni di Gilda, e ho perso solo una mano. Un affare, a pensarci bene.'],
      topics: [{ t: 'Consigli per la Gilda', l: ['Gli incarichi del tuo rango sono la tua strada. Salta troppi gradini e cadi dalle scale.', 'Gli esami di rango sono duri, ma la paga sale. E la gente smette di chiamarti "recluta".'] },
        { t: 'Le tue avventure', l: ['Ho combattuto un kraken nel canale. Era lungo un braccio, ma era molto arrabbiato.', 'La mano? L\'ho persa contro un mimic travestito da forziere. Controlla sempre i forzieri, ragazzo.'] }] },
    { id: 'm_pietro', name: 'Pietro Scintilla', title: 'Studente dell\'Accademia', x: -18, z: 401, face: [0, 410], look: { skin: '#f0d0b0', cloth: '#3a3a6a', hair: '#6a3a1a', trim: '#c9a0ff' },
      hello: ['Non dire niente al Decano: ho fatto esplodere di nuovo il calderone. Era un incantesimo di "pulizia rapida". Ha pulito tutto. Anche il tavolo.'],
      topics: [{ t: 'La magia', l: ['La magia è magicule più volontà. Le magicule sono ovunque; la volontà… beh, quella dipende dalla colazione.', 'Tu le magicule le divori, vero? Che invidia. Io devo studiarle.'] }] },
    { id: 'm_fulvio', name: 'Fulvio il Postino', title: 'Portalettere dei quartieri', x: -28.5, z: 462, face: [-10, 466], look: { skin: '#e8c0a0', cloth: '#3a5a8a', hair: '#3a2a1a', hat: 'cap', hatC: '#3a5a8a' },
      hello: ['Consegne! Consegne in tutti i quartieri! Conosco Altheria meglio delle mie tasche.'],
      topics: [{ t: 'I quartieri della città', l: ['Al centro la Piazza delle Mille Stelle. A nord l\'Accademia Arcana, oltre il Canale delle Lanterne. A sud il Castello Reale.', 'A est la Cattedrale e la Porta dell\'Alba con la Torre. A ovest l\'Arena e la Via delle Botteghe.', 'Nord-ovest il Quartiere dei Ciliegi, sud-est i Giardini di Sylvaren, sud-ovest le forge di Kharum-Dur. Non perderti!'] }] },
    { id: 'm_nives', name: 'Nives', title: 'Bambina del Canale', x: 8, z: 433.6, face: [0, 425], look: { skin: '#f8dcc8', cloth: '#d86a8a', hair: '#e8c060', child: true, long: true },
      hello: ['Guarda! Nel canale ci sono i pesci-lanterna! Di notte si accendono!', 'Il mio papà dice che il canale non finisce mai. Io dico che finisce nel mare di un altro mondo.'] },
  ];

  /* ============================================================ CROWD (instanced humanoids) */
  const CROWD = { list: [], n: 0, IM: {}, built: false, frame: 0 };
  const SKINS = ['#f4dcc8', '#f0c8a8', '#e8b890', '#d89a7a', '#c08060', '#8a5a40', '#f8e4d4', '#e0b090'];
  const HAIRS = ['#1a1410', '#3a2a1e', '#5a3a1e', '#8a5a2a', '#c8902a', '#e8d080', '#9a9a9a', '#e8e8f0', '#6a2a1a', '#2a2a3a'];
  const CLOTHS = ['#8a3a2a', '#2a4a6a', '#3a5a3a', '#6a5a3a', '#5a2a5a', '#7a6a4a', '#2a5a5a', '#9a7a3a', '#4a4a5a', '#a05a3a', '#3a3a6a', '#6a6a6a', '#b0a080', '#7a2a3a'];
  const PANTS = ['#3a3028', '#2a2a30', '#4a3a28', '#5a4a3a', '#2a3a4a'];
  function randLook(kind) {
    const L = { skin: pick(SKINS), hair: pick(HAIRS), cloth: pick(CLOTHS), pants: pick(PANTS), robe: Math.random() < 0.38, hat: 'none', hatC: pick(['#5a3a1e', '#2a2a3a', '#7a2a2a', '#c8a860', '#3a5a3a']) };
    const r = Math.random();
    if (r < 0.12) L.hat = 'straw'; else if (r < 0.24) L.hat = 'cap'; else if (r < 0.29) L.hat = 'wizard'; else if (r < 0.36) L.hat = 'hood';
    if (kind === 'guard') { L.cloth = pick(['#2a3e6a', '#2a3a5a']); L.pants = '#2a2a30'; L.hat = 'helmet'; L.robe = false; L.armor = true; }
    if (kind === 'child') { L.robe = Math.random() < 0.4; L.hat = Math.random() < 0.2 ? 'cap' : 'none'; L.child = true; }
    return L;
  }
  function buildCrowdMeshes(N, NG) {
    const mat = new T.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02, flatShading: true });
    const metal = new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.75, flatShading: true });
    const mk = (geo, m, n) => { const im = new T.InstancedMesh(geo, m, n); im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = !LOW; im.userData.metro = true; const c = new T.Color(1, 1, 1); for (let i = 0; i < n; i++) { im.setMatrixAt(i, new T.Matrix4().makeScale(0, 0, 0)); im.setColorAt(i, c); } ROOT.add(im); return im; };
    const torso = new T.CylinderGeometry(0.19, 0.24, 1, 7); torso.translate(0, -0.5, 0);
    const robe = new T.ConeGeometry(1, 1, 8, 1, true); robe.translate(0, -0.5, 0);
    const head = new T.SphereGeometry(1, 9, 7);
    const hair = new T.SphereGeometry(1, 9, 5, 0, TAU, 0, PI * 0.56);
    const cone = new T.ConeGeometry(1, 1, 8); cone.translate(0, 0.5, 0);
    const brim = new T.CylinderGeometry(1, 1, 1, 12);
    const helm = new T.SphereGeometry(1, 9, 5, 0, TAU, 0, PI * 0.55);
    const shaft = new T.CylinderGeometry(1, 1, 1, 5); shaft.translate(0, -0.5, 0);
    const tip = new T.ConeGeometry(1, 1, 4); tip.translate(0, 0.5, 0);
    const flame = new T.ConeGeometry(1, 1, 6); flame.translate(0, 0.5, 0);
    CROWD.IM = {
      leg: mk(limbGeo, mat, N * 2), arm: mk(limbGeo, mat, N * 2), torso: mk(torso, mat, N), robe: mk(robe, mat, N), head: mk(head, mat, N), hair: mk(hair, mat, N),
      cone: mk(cone, mat, N), brim: mk(brim, mat, N), helm: mk(helm, metal, N), shaft: mk(shaft, mat, NG * 2), tip: mk(tip, metal, NG),
      flame: mk(flame, new T.MeshBasicMaterial({ color: hdr('#ffb050', 3) }), NG),
    };
    CROWD.IM.flame.castShadow = false;
    // torch halos
    const pos = new Float32Array(NG * 3), col = new Float32Array(NG * 3), size = new Float32Array(NG);
    for (let i = 0; i < NG; i++) { col[i * 3] = 2.2; col[i * 3 + 1] = 1.2; col[i * 3 + 2] = 0.45; size[i] = 3.2; pos[i * 3 + 1] = -999; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1));
    CROWD.torchPts = new T.Points(g, glowMat); CROWD.torchPts.frustumCulled = false; ROOT.add(CROWD.torchPts);
  }
  // write one part matrix: citizen frame (x,y,z,yaw) · offset · rotX(pitch) · rotZ(roll≈0) · scale
  function setM(im, i, x, y, z, cy, sy, ox, oy, oz, pitch, sx, syy, sz) {
    const e = im.instanceMatrix.array, o = i * 16, ca = Math.cos(pitch), sa = Math.sin(pitch);
    e[o] = cy * sx; e[o + 1] = 0; e[o + 2] = -sy * sx; e[o + 3] = 0;
    e[o + 4] = sy * sa * syy; e[o + 5] = ca * syy; e[o + 6] = cy * sa * syy; e[o + 7] = 0;
    e[o + 8] = sy * ca * sz; e[o + 9] = -sa * sz; e[o + 10] = cy * ca * sz; e[o + 11] = 0;
    e[o + 12] = x + cy * ox + sy * oz; e[o + 13] = y + oy; e[o + 14] = z - sy * ox + cy * oz; e[o + 15] = 1;
  }
  function zeroM(im, i) { const e = im.instanceMatrix.array, o = i * 16; for (let k = 0; k < 16; k++) e[o + k] = 0; }
  const _col = new T.Color();
  function setC(im, i, hex, k) { _col.set(hex); if (k) _col.multiplyScalar(k); im.instanceColor.setXYZ(i, _col.r, _col.g, _col.b); }

  /* road graph for walkers */
  const GN = []; // {x,z,nb:[]}
  function buildGraph() {
    const nodeAt = (x, z) => { for (const n of GN) if ((n.x - x) * (n.x - x) + (n.z - z) * (n.z - z) < 2.2 * 2.2) return n; const n = { x, z, nb: [], w: 4 }; GN.push(n); return n; };
    const link = (a, b) => { if (a !== b && a.nb.indexOf(b) < 0) { a.nb.push(b); b.nb.push(a); } };
    for (const r of ROADS) {
      if (r.kind === 'floor' && r.w > 12) continue;
      let prev = null;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 9));
        for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
          const x = lerp(ax, bx, k / n), z = lerp(az, bz, k / n);
          if (dC(x, z) > WALL_R - 3) { prev = null; continue; }
          const nd = nodeAt(x, z); nd.w = Math.max(nd.w, r.w); nd.kind = r.kind;
          if (prev) link(prev, nd); prev = nd;
        }
      }
    }
    // join road endpoints to the nearest node of another road (T-junctions)
    for (const a of GN) if (a.nb.length <= 1) {
      let best = null, bd = 7.5 * 7.5;
      for (const b of GN) { if (b === a || a.nb.indexOf(b) >= 0) continue; const d = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z); if (d < bd) { bd = d; best = b; } }
      if (best) link(a, best);
    }
    // plaza ring so walkers cross the square in many directions
    const ring = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ring.push(nodeAt(CX + Math.cos(a) * 20, CZ + Math.sin(a) * 20)); }
    for (let i = 0; i < 12; i++) { link(ring[i], ring[(i + 1) % 12]); ring[i].w = 7; ring[i].kind = 'plaza'; }
    for (const r of ring) { let best = null, bd = 1e9; for (const b of GN) { if (ring.indexOf(b) >= 0) continue; const d = Math.hypot(b.x - r.x, b.z - r.z); if (d < bd && d < 12) { bd = d; best = b; } } if (best) link(r, best); }
    // avoid the fountain
    for (const n of GN) { const d = Math.hypot(n.x - FOUNT.x, n.z - FOUNT.z); if (d < 8.5) { const k = 8.5 / (d || 1); n.x = FOUNT.x + (n.x - FOUNT.x) * k; n.z = FOUNT.z + (n.z - FOUNT.z) * k; } }
  }

  function addCitizen(o) {
    const c = Object.assign({ kind: 'walker', x: 0, z: 0, y: 0, ry: 0, s: 1, ph: Math.random() * TAU, spd: rand(1.0, 1.5), amp: 0, vis: false, active: true, lod: 0, t: Math.random() * 10, talkCd: 0, off: rand(-0.35, 0.35), bubbleT: rand(2, 12), gest: 0 }, o);
    c.look = c.look || randLook(c.kind);
    c.i = CROWD.list.length; CROWD.list.push(c);
    return c;
  }
  function pickNode(near) { if (near) { let best = null, bd = 1e9; for (const n of GN) { const d = Math.hypot(n.x - near.x, n.z - near.z); if (d < bd) { bd = d; best = n; } } return best; } return GN[(Math.random() * GN.length) | 0]; }
  function startWalk(c, a) {
    c.a = a; c.b = a.nb.length ? pick(a.nb) : a; c.u = 0;
    c.len = Math.max(0.01, Math.hypot(c.b.x - a.x, c.b.z - a.z));
  }
  function nextEdge(c) {
    const a = c.b, opts = a.nb.filter((n) => n !== c.a);
    const nb = opts.length ? pick(opts) : c.a;
    c.a = a; c.b = nb; c.u = 0; c.len = Math.max(0.01, Math.hypot(nb.x - a.x, nb.z - a.z));
    if (c.kind === 'guard' && c.leader) { /* followers copy the leader */ }
  }
  let NG_MAX = 0;
  function buildCrowd() {
    buildGraph();
    const nWalk = LOW ? 70 : Q === 'medium' ? 110 : 140;
    // walkers
    for (let i = 0; i < nWalk; i++) { const c = addCitizen({ kind: 'walker', nightKeep: Math.random() < 0.3 }); startWalk(c, pickNode()); c.u = Math.random(); }
    // guards: patrol pairs + gate sentries
    let gi = 0;
    for (let p = 0; p < 6; p++) {
      const a = pickNode(); const L = addCitizen({ kind: 'guard', spd: 1.05, gi: gi++, nightKeep: true }); startWalk(L, a); L.u = Math.random();
      const F = addCitizen({ kind: 'guard', spd: 1.05, gi: gi++, follow: L, nightKeep: true, off: L.off + 0.9 }); F.a = L.a; F.b = L.b; F.u = L.u; F.len = L.len;
    }
    for (const g of GATES) for (const sd of [-1, 1]) {
      const ry = -g.a + PI / 2, inw = -9.5; // inside the gate
      const lx = sd * 5.2, x = g.x + lx * Math.cos(ry) + inw * Math.sin(ry), z = g.z - lx * Math.sin(ry) + inw * Math.cos(ry);
      addCitizen({ kind: 'sentry', look: randLook('guard'), x, z, ry: Math.atan2(CX - g.x, CZ - g.z) + PI, gi: gi++, nightKeep: true, spear: true });
    }
    // chatting groups
    const spots = [[12, 494], [-18, 462], [20, 480], [-8, 489], [70, 470.5], [-30, 520], [38, 462], [-50, 470], [60, 520], [-34, 440], [24, 410], [-62, 445], [44, 540], [-40, 558], [80, 478], [0, 515]];
    for (const [sx, sz] of spots) {
      const n = 2 + ((Math.random() * 3) | 0), r = 0.95 + n * 0.12;
      if (!freeSpot(sx, sz, r + 0.6)) continue;
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU + rand(-0.2, 0.2); addCitizen({ kind: 'chat', x: sx + Math.cos(a) * r, z: sz + Math.sin(a) * r, ry: Math.atan2(-Math.cos(a), -Math.sin(a)), grp: sx * 1000 + sz, gk: k, gn: n, nightKeep: Math.random() < 0.25 }); }
    }
    // merchants at the market stalls
    for (const st of MARKET.stalls) addCitizen({ kind: 'merchant', x: st.x, z: st.z, ry: st.ry, merch: st.kind, look: Object.assign(randLook('walker'), { apron: pick(['#efe2c8', '#c8b090', '#7a5a3a']) }) });
    // children
    for (let k = 0; k < (LOW ? 5 : 9); k++) addCitizen({ kind: 'child', s: rand(0.58, 0.7), spd: rand(2.2, 3.0), cx: CX + rand(-8, 8), cz: CZ + rand(4, 18), cr: rand(5, 9), ca: rand(0, TAU), cdir: Math.random() < 0.5 ? 1 : -1 });
    // named NPCs
    for (const d of NAMED_DEFS) {
      if (!freeSpot(d.x, d.z, 0.6)) { /* still place: they were designed for these spots */ }
      const n = npc(Object.assign({}, d));
      SERV.push({ x: n.x, z: n.z, r: 3.3, label: 'Parla con ' + n.name + (d.label ? ' · ' + d.label : ''), action: () => talkTo(n) });
      n.talk = d.talk || talkGeneric;
    }
    for (const sh of SHOPS) if (sh.npc) sh.npc.talk = talkShop;
    for (const n of NPCS) { n.cz = addCitizen({ kind: 'npc', x: n.x, z: n.z, ry: n.ry, look: Object.assign({ pants: '#3a3028' }, n.look || randLook('walker')), s: n.look && n.look.child ? 0.66 : n.look && n.look.burly ? 1.06 : 1, named: n }); n.cz.baseRy = n.ry; coll(n.x, n.z, 0.5); }
    CROWD.n = CROWD.list.length;
    NG_MAX = CROWD.list.filter((c) => c.kind === 'guard' || c.kind === 'sentry').length;
    buildCrowdMeshes(CROWD.n, Math.max(1, NG_MAX));
    // static colours
    const I = CROWD.IM;
    for (const c of CROWD.list) {
      const L = c.look, i = c.i;
      setC(I.leg, i * 2, L.pants || '#3a3028'); setC(I.leg, i * 2 + 1, L.pants || '#3a3028');
      setC(I.arm, i * 2, L.cloth, 0.92); setC(I.arm, i * 2 + 1, L.cloth, 0.92);
      setC(I.torso, i, L.cloth); setC(I.robe, i, L.apron || L.cloth, L.apron ? 1 : 0.9); setC(I.head, i, L.skin); setC(I.hair, i, L.hair);
      setC(I.cone, i, L.hatC || '#3a2a1a'); setC(I.brim, i, L.hatC || '#3a2a1a'); setC(I.helm, i, '#a0a6b0');
    }
    let g = 0;
    for (const c of CROWD.list) if (c.kind === 'guard' || c.kind === 'sentry') { c.gs = g++; setC(I.shaft, c.gs * 2, '#5a3e28'); setC(I.shaft, c.gs * 2 + 1, '#4a3424'); setC(I.tip, c.gs, '#c8ccd4'); }
    for (const k in I) if (I[k].instanceColor) I[k].instanceColor.needsUpdate = true;
    CROWD.built = true;
  }
  function freeSpot(x, z, r) { for (const c of API.COLL) { if (Math.abs(c.x - x) > r + c.r || Math.abs(c.z - z) > r + c.r) continue; if (Math.hypot(c.x - x, c.z - z) < r + c.r) return false; } return true; }

  // per-frame crowd simulation and instancing
  const _cam = new T.Vector3();
  function updateCrowd(dt, night) {
    if (!CROWD.built) return;
    const I = CROWD.IM, list = CROWD.list, px = P.x, pz = P.z, running = P.sprint && Math.hypot(P.vx, P.vz) > 6;
    CROWD.frame++;
    const fr = CROWD.frame;
    const tpos = CROWD.torchPts.geometry.attributes.position.array;
    for (let idx = 0; idx < list.length; idx++) {
      const c = list[idx];
      const dx = c.x - px, dz = c.z - pz, d2 = dx * dx + dz * dz;
      // night: most walkers go home (switch only when far from the player to avoid popping)
      if (d2 > 38 * 38 && (fr + idx) % 30 === 0) c.active = !night || c.nightKeep || c.kind === 'npc' || c.kind === 'sentry' || (c.kind === 'merchant' ? false : c.kind === 'child' ? false : Math.random() < 0.0);
      const far = d2 > 160 * 160 || !c.active;
      if (far) { if (c.vis) { c.vis = false; hideCitizen(c); } if (!c.active) continue; }
      const lod = d2 < 50 * 50 ? 0 : 1;
      if (lod === 1 && (fr + idx) % 3 !== 0 && c.vis) { simCitizen(c, dt * 3, px, pz, d2, running, false); continue; }
      simCitizen(c, lod === 1 ? dt * 3 : dt, px, pz, d2, running, true);
      if (far) continue;
      c.vis = true;
      drawCitizen(c, I, lod, night, tpos);
    }
    for (const k in I) I[k].instanceMatrix.needsUpdate = true;
    CROWD.torchPts.geometry.attributes.position.needsUpdate = true;
  }
  function simCitizen(c, dt, px, pz, d2, running, full) {
    c.t += dt;
    if (c.talkCd > 0) c.talkCd -= dt;
    let moving = false;
    if (c.kind === 'walker' || c.kind === 'guard') {
      if (c.follow) { const L = c.follow; c.a = L.a; c.b = L.b; c.u = L.u; c.len = L.len; c.wait = L.wait; }
      else if (c.wait > 0) c.wait -= dt;
      else {
        // yield to the player
        let sp = c.spd;
        if (d2 < 2.6 * 2.6) { sp *= 0.25; c.off += (c.off >= 0 ? 1 : -1) * dt * 0.8; c.off = clamp(c.off, -0.48, 0.48); }
        c.u += (sp * dt) / c.len;
        if (c.u >= 1) { nextEdge(c); if (!c.follow && Math.random() < (c.kind === 'guard' ? 0.25 : 0.12)) c.wait = rand(1.5, 5); }
      }
      const a = c.a, b = c.b, u = clamp(c.u, 0, 1), tx = b.x - a.x, tz = b.z - a.z, tl = c.len;
      const nx = -tz / tl, nz = tx / tl, w = Math.min(a.w || 4, b.w || 4);
      const ox = c.off * w;
      c.x = a.x + tx * u + nx * ox; c.z = a.z + tz * u + nz * ox;
      const want = Math.atan2(tx, tz);
      moving = !(c.wait > 0);
      c.ry += angDiff(c.ry, moving ? want : c.ry) * Math.min(1, dt * 6);
      c.amp = lerp(c.amp, moving ? 0.55 : 0, Math.min(1, dt * 5));
    } else if (c.kind === 'child') {
      c.ca += c.cdir * dt * c.spd / c.cr;
      if (d2 < 9 && Math.random() < dt) c.cdir *= -1;
      const tx = c.cx + Math.cos(c.ca) * c.cr, tz = c.cz + Math.sin(c.ca) * c.cr;
      c.ry = Math.atan2(tx - c.x, tz - c.z) || c.ry; c.x = tx; c.z = tz; moving = true; c.amp = 0.9;
    } else {
      // standing citizens: face the player when close, idle sway, gestures
      const want = c.kind === 'npc' && d2 < 5.5 * 5.5 ? Math.atan2(px - c.x, pz - c.z) : c.kind === 'npc' ? c.baseRy : c.ry;
      if (c.kind === 'npc' || c.turn) c.ry += angDiff(c.ry, want) * Math.min(1, dt * 3);
      c.amp = lerp(c.amp, 0, Math.min(1, dt * 4));
      if (c.gest > 0) c.gest -= dt;
    }
    if (moving) c.ph += dt * (c.kind === 'child' ? 11 : 7.2) * (c.kind === 'guard' ? 0.9 : 1);
    if (full || (CROWD.frame & 7) === 0) c.y = surf(c.x, c.z);
  }
  function hideCitizen(c) {
    const I = CROWD.IM, i = c.i;
    zeroM(I.leg, i * 2); zeroM(I.leg, i * 2 + 1); zeroM(I.arm, i * 2); zeroM(I.arm, i * 2 + 1); zeroM(I.torso, i); zeroM(I.robe, i); zeroM(I.head, i); zeroM(I.hair, i); zeroM(I.cone, i); zeroM(I.brim, i); zeroM(I.helm, i);
    if (c.gs != null) { zeroM(I.shaft, c.gs * 2); zeroM(I.shaft, c.gs * 2 + 1); zeroM(I.tip, c.gs); zeroM(I.flame, c.gs); CROWD.torchPts.geometry.attributes.position.array[c.gs * 3 + 1] = -999; }
  }
  function drawCitizen(c, I, lod, night, tpos) {
    const i = c.i, s = c.s, L = c.look, cy = Math.cos(c.ry), sy = Math.sin(c.ry);
    const x = c.x, z = c.z, bob = c.amp > 0.05 ? Math.abs(Math.sin(c.ph)) * 0.05 * s : Math.sin(c.t * 1.7) * 0.006, y = c.y + bob;
    const sw = lod === 0 ? Math.sin(c.ph) * c.amp : 0, burly = L.burly ? 1.18 : 1;
    const hip = 0.84 * s;
    // legs
    setM(I.leg, i * 2, x, y, z, cy, sy, -0.1 * s, hip, 0, sw, 0.15 * s * burly, 0.84 * s, 0.17 * s);
    setM(I.leg, i * 2 + 1, x, y, z, cy, sy, 0.1 * s, hip, 0, -sw, 0.15 * s * burly, 0.84 * s, 0.17 * s);
    // torso / robe
    const sh = hip + 0.62 * s;
    setM(I.torso, i, x, y, z, cy, sy, 0, sh, 0, 0, 1.0 * s * burly, 0.64 * s, 0.85 * s * burly);
    if (L.robe || L.apron) setM(I.robe, i, x, y, z, cy, sy, 0, sh - 0.25 * s, L.apron && !L.robe ? 0.04 * s : 0, 0, (L.robe ? 0.38 : 0.27) * s * burly, (L.robe ? 1.12 : 0.75) * s, (L.robe ? 0.36 : 0.2) * s * burly);
    else zeroM(I.robe, i);
    // arms: walking swing, gestures (talking / calling / waving)
    let aL = -sw * 0.8, aR = sw * 0.8;
    if (c.kind === 'chat' || c.kind === 'merchant' || c.kind === 'npc') {
      const talking = c.gest > 0 || (c.named && c.named.talking);
      if (talking) aR = -1.0 - Math.sin(c.t * 5) * 0.35;
      else aR = Math.sin(c.t * 0.9 + i) * 0.06;
      aL = Math.sin(c.t * 0.8 + i * 1.3) * 0.05;
      if (c.kind === 'merchant' && c.gest > 0) { aL = -2.6 + Math.sin(c.t * 9) * 0.3; }
    }
    if (c.kind === 'guard' || c.kind === 'sentry') { aR = -0.35; if (night) aL = -1.1; }
    const aw = 0.11 * s * burly;
    setM(I.arm, i * 2, x, y, z, cy, sy, -0.27 * s * burly, sh - 0.04 * s, 0, aL, aw, 0.62 * s, aw * 1.1);
    setM(I.arm, i * 2 + 1, x, y, z, cy, sy, 0.27 * s * burly, sh - 0.04 * s, 0, aR, aw, 0.62 * s, aw * 1.1);
    // head + hair + hat
    const hy = sh + 0.2 * s, hr = (L.child ? 0.2 : 0.165) * s;
    setM(I.head, i, x, y, z, cy, sy, 0, hy, 0, 0, hr, hr * 1.08, hr);
    if (L.hat !== 'helmet' && L.hat !== 'hood') setM(I.hair, i, x, y, z, cy, sy, 0, hy + 0.01 * s, -0.025 * s, -0.25, hr * 1.1, hr * 1.12, hr * 1.12); else zeroM(I.hair, i);
    if (L.hat === 'wizard') { setM(I.cone, i, x, y, z, cy, sy, 0, hy + 0.1 * s, -0.01, -0.12, 0.17 * s, 0.48 * s, 0.17 * s); setM(I.brim, i, x, y, z, cy, sy, 0, hy + 0.1 * s, 0, 0, 0.3 * s, 0.02 * s, 0.3 * s); }
    else if (L.hat === 'straw') { setM(I.cone, i, x, y, z, cy, sy, 0, hy + 0.1 * s, 0, 0, 0.17 * s, 0.13 * s, 0.17 * s); setM(I.brim, i, x, y, z, cy, sy, 0, hy + 0.11 * s, 0, 0, 0.36 * s, 0.025 * s, 0.36 * s); }
    else if (L.hat === 'kasa') { setM(I.cone, i, x, y, z, cy, sy, 0, hy + 0.08 * s, 0, 0, 0.42 * s, 0.2 * s, 0.42 * s); zeroM(I.brim, i); }
    else if (L.hat === 'cap') { zeroM(I.cone, i); setM(I.brim, i, x, y, z, cy, sy, 0, hy + 0.12 * s, 0.0, -0.15, 0.19 * s, 0.06 * s, 0.21 * s); }
    else if (L.hat === 'hood') { setM(I.cone, i, x, y, z, cy, sy, 0, hy - 0.12 * s, -0.04 * s, -0.25, 0.22 * s, 0.42 * s, 0.22 * s); zeroM(I.brim, i); }
    else { zeroM(I.cone, i); zeroM(I.brim, i); }
    if (L.hat === 'helmet') setM(I.helm, i, x, y, z, cy, sy, 0, hy + 0.02 * s, 0, 0, hr * 1.25, hr * 1.3, hr * 1.25); else zeroM(I.helm, i);
    // guards: spear in the right hand, torch in the left at night
    if (c.gs != null) {
      const g = c.gs, sp = 1.0, ex = 0.3 * s, ey = sh - 0.55 * s;
      setM(I.shaft, g * 2, x, y, z, cy, sy, ex, ey + 1.5 * sp, 0.12, 0, 0.025, 2.4 * sp, 0.025);
      setM(I.tip, g, x, y, z, cy, sy, ex, ey + 1.5 * sp, 0.12, 0, 0.06, 0.24, 0.06);
      if (night) {
        setM(I.shaft, g * 2 + 1, x, y, z, cy, sy, -0.3 * s, sh + 0.25 * s, 0.42 * s, 0, 0.035, 0.65, 0.035);
        const fl = 1 + Math.sin(c.t * 17 + g) * 0.15;
        setM(I.flame, g, x, y, z, cy, sy, -0.3 * s, sh + 0.25 * s, 0.42 * s, 0, 0.09 * fl, 0.28 * fl, 0.09 * fl);
        tpos[g * 3] = x + cy * (-0.3 * s) + sy * (0.42 * s); tpos[g * 3 + 1] = y + sh + 0.4 * s; tpos[g * 3 + 2] = z - sy * (-0.3 * s) + cy * (0.42 * s);
      } else { zeroM(I.shaft, g * 2 + 1); zeroM(I.flame, g); tpos[g * 3 + 1] = -999; }
    }
  }

  /* ============================================================ SPEECH BUBBLES & NAME TAGS */
  const bubWrap = document.createElement('div'); bubWrap.id = 'mbub'; (document.getElementById('hud') || document.body).appendChild(bubWrap);
  const BUB = [], TAGS = [];
  for (let i = 0; i < 4; i++) { const e = document.createElement('div'); e.className = 'b'; bubWrap.appendChild(e); BUB.push({ e, c: null, t: 0 }); }
  for (let i = 0; i < 5; i++) { const e = document.createElement('div'); e.className = 'n'; bubWrap.appendChild(e); TAGS.push({ e, c: null }); }
  let bubT = 2;
  function lineFor(c, night) {
    if (c.kind === 'merchant') return ROLE_LINES.merchant[['fruit', 'fish', 'cloth', 'spice', 'gems', 'bread', 'flowers', 'pots'].indexOf(c.merch)] || pick(ROLE_LINES.merchant);
    if (c.kind === 'guard' || c.kind === 'sentry') return pick(ROLE_LINES.guard);
    if (c.kind === 'child') return pick(ROLE_LINES.child);
    if (night) return pick(ROLE_LINES.night.concat(ROLE_LINES.citizen));
    return Math.random() < 0.3 ? loreLine() : pick(ROLE_LINES.citizen);
  }
  function updateBubbles(dt, night) {
    const cam = API.camera, W = window.innerWidth, H = window.innerHeight;
    bubT -= dt;
    if (bubT <= 0) {
      bubT = rand(1.2, 3.2);
      const slot = BUB.find((b) => !b.c);
      if (slot) {
        let best = null, bd = 1e9;
        for (const c of CROWD.list) {
          if (!c.vis || c.kind === 'npc' || c.bubbleBusy) continue;
          const d = Math.hypot(c.x - P.x, c.z - P.z); if (d > 15 || d < 1.5) continue;
          _cam.set(c.x, c.y + 2, c.z).project(cam); if (_cam.z > 1 || Math.abs(_cam.x) > 0.85 || Math.abs(_cam.y) > 0.85) continue;
          const score = d + Math.random() * 8 - (c.kind === 'merchant' ? 4 : 0); if (score < bd) { bd = score; best = c; }
        }
        if (best) { slot.c = best; best.bubbleBusy = true; slot.t = 4.2; slot.e.textContent = lineFor(best, night); slot.e.className = 'b show' + (best.kind === 'merchant' ? ' call' : ''); best.gest = 2.5; if (best.kind === 'merchant') sfx('ui', { vol: 0.05, pitch: 0.7 }); }
      }
    }
    for (const b of BUB) {
      if (!b.c) continue;
      b.t -= dt;
      const c = b.c;
      _cam.set(c.x, c.y + 2.15 * c.s + 0.1, c.z).project(cam);
      if (b.t <= 0 || !c.vis || _cam.z > 1) { b.e.className = 'b'; c.bubbleBusy = false; b.c = null; continue; }
      b.e.style.left = ((_cam.x * 0.5 + 0.5) * W).toFixed(1) + 'px'; b.e.style.top = ((-_cam.y * 0.5 + 0.5) * H).toFixed(1) + 'px';
    }
    // name tags of nearby named NPCs
    let k = 0;
    for (const n of NPCS) {
      if (k >= TAGS.length) break;
      const d = Math.hypot(n.x - P.x, n.z - P.z); if (d > 10 || !n.cz || !n.cz.vis) continue;
      _cam.set(n.x, n.cz.y + 2.3 * n.cz.s + 0.15, n.z).project(cam); if (_cam.z > 1) continue;
      const tg = TAGS[k++];
      if (tg.c !== n) { tg.c = n; tg.e.innerHTML = n.name + '<small>' + n.title + '</small>'; }
      tg.e.className = 'n show'; tg.e.style.left = ((_cam.x * 0.5 + 0.5) * W).toFixed(1) + 'px'; tg.e.style.top = ((-_cam.y * 0.5 + 0.5) * H).toFixed(1) + 'px';
      if (BUB.some((b) => b.c && Math.hypot(b.c.x - n.x, b.c.z - n.z) < 1)) tg.e.className = 'n';
    }
    for (; k < TAGS.length; k++) { if (TAGS[k].c) { TAGS[k].e.className = 'n'; TAGS[k].c = null; } }
  }
  function hideBubbles() { for (const b of BUB) if (b.c) { b.e.className = 'b'; b.c.bubbleBusy = false; b.c = null; } for (const t of TAGS) if (t.c) { t.e.className = 'n'; t.c = null; } }

  /* ============================================================ PIGEONS */
  const PIG = { list: [], im: null };
  function buildPigeons() {
    const n = LOW ? 18 : 34;
    const g = new T.BufferGeometry();
    const kit = new Kit(null);
    kit.add(GEO.sphLo, '#8a8e98', 0, 0.12, 0, 0.1, 0.09, 0.15);
    kit.add(GEO.sphLo, '#6a7a8a', 0, 0.22, 0.1, 0.055, 0.055, 0.06);
    kit.add(GEO.cone4, '#e8b040', 0, 0.22, 0.165, 0.015, 0.04, 0.015, PI / 2, 0, 0);
    kit.add(GEO.box, '#7a7e88', -0.11, 0.14, -0.02, 0.12, 0.02, 0.16, 0, 0, 0.3);
    kit.add(GEO.box, '#7a7e88', 0.11, 0.14, -0.02, 0.12, 0.02, 0.16, 0, 0, -0.3);
    kit.add(GEO.box, '#5a5e68', 0, 0.12, -0.16, 0.08, 0.02, 0.1);
    const kg = kit.geo(); void g;
    PIG.im = new T.InstancedMesh(kg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), n);
    PIG.im.instanceMatrix.setUsage(T.DynamicDrawUsage); PIG.im.frustumCulled = false; PIG.im.userData.metro = true; ROOT.add(PIG.im);
    for (let i = 0; i < n; i++) { const p = { x: 0, y: 0, z: 0, ry: rand(0, TAU), st: 'ground', t: rand(0, 5), vx: 0, vy: 0, vz: 0, hop: 0, home: null }; landSpot(p); p.x = p.tx; p.z = p.tz; p.y = gnd(p.x, p.z) + 0.12; PIG.list.push(p); }
  }
  function landSpot(p) { for (let k = 0; k < 10; k++) { const a = rand(0, TAU), r = rand(6, 25), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r; if (Math.hypot(x - FOUNT.x, z - FOUNT.z) > 8) { p.tx = x; p.tz = z; return; } } p.tx = CX + 10; p.tz = CZ + 10; }
  const _pm = new T.Matrix4(), _pq = new T.Quaternion(), _pe = new T.Euler(), _pv = new T.Vector3(), _ps = new T.Vector3();
  function updatePigeons(dt) {
    if (!PIG.im) return;
    const near = dC(P.x, P.z) < 60;
    PIG.im.visible = near; if (!near) return;
    const spd = Math.hypot(P.vx, P.vz), scare = (P.sprint && spd > 6) || P.atk || P.roll > 0;
    let flushed = 0;
    for (let i = 0; i < PIG.list.length; i++) {
      const p = PIG.list[i];
      p.t += dt;
      const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz);
      if (p.st === 'ground') {
        if ((scare && d < 8) || d < 1.6) {
          p.st = 'fly'; p.t = 0; const k = 1 / (d || 1); p.vx = dx * k * rand(4, 7) + rand(-1, 1); p.vz = dz * k * rand(4, 7) + rand(-1, 1); p.vy = rand(5, 8); p.ry = Math.atan2(p.vx, p.vz); flushed++;
        } else {
          // peck and hop around
          p.hop -= dt;
          if (p.hop <= 0) { p.hop = rand(0.8, 3); const a = rand(0, TAU); p.vx = Math.cos(a) * 0.6; p.vz = Math.sin(a) * 0.6; p.ry = Math.atan2(p.vx, p.vz); }
          if (p.hop > 0.5) { p.vx *= 0.9; p.vz *= 0.9; }
          p.x += p.vx * dt; p.z += p.vz * dt;
          if (dC(p.x, p.z) > 27) { p.x = lerp(p.x, CX, 0.05); p.z = lerp(p.z, CZ, 0.05); }
          p.y = gnd(p.x, p.z) + 0.12 + Math.abs(Math.sin(p.t * 9)) * (p.hop > 0.5 ? 0 : 0.04);
        }
      } else if (p.st === 'fly') {
        p.vy -= dt * 1.2; if (p.t > 1.2) p.vy = Math.max(p.vy, 0.6);
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.t > rand(6, 10)) { p.st = 'return'; landSpot(p); p.t = 0; }
      } else {
        const tx = p.tx - p.x, tz = p.tz - p.z, td = Math.hypot(tx, tz), gy = gnd(p.tx, p.tz) + 0.12;
        const sp = Math.min(9, td * 0.8 + 2);
        p.x += (tx / (td || 1)) * sp * dt; p.z += (tz / (td || 1)) * sp * dt; p.y = lerp(p.y, gy + Math.min(10, td * 0.35), Math.min(1, dt * 1.5));
        p.ry = Math.atan2(tx, tz);
        if (td < 0.4 && Math.abs(p.y - gy) < 0.4) { p.st = 'ground'; p.y = gy; p.hop = 1; }
      }
      const flying = p.st !== 'ground';
      const flap = flying ? Math.sin(p.t * 26) : 0;
      _pe.set(flying ? -0.2 : 0, p.ry, flap * 0.25); _pq.setFromEuler(_pe);
      _pm.compose(_pv.set(p.x, p.y, p.z), _pq, _ps.set(1.3 + (flying ? Math.abs(flap) * 0.9 : 0), 1.3, 1.3)); PIG.im.setMatrixAt(i, _pm);
    }
    if (flushed) { sfx('dash', { vol: 0.25, pitch: 1.8 }); }
    PIG.im.instanceMatrix.needsUpdate = true;
  }

  /* ============================================================ CARTS */
  const CARTS = [];
  function buildCarts() {
    const routes = [[[118, 471.8], [30, 471.8]], [[30, 468.2], [118, 468.2]], [[-112, 474.6], [-30, 474.6]], [[-30, 471.4], [-112, 471.4]], [[1.8, 360], [1.8, 340]]];
    const n = LOW ? 3 : 4;
    for (let k = 0; k < n; k++) {
      const r = routes[k], g = new T.Group(); ROOT.add(g);
      const K = new Kit(MAT.vc), col = pick(['#6a4a2a', '#3a2a1e', '#d8d0c0', '#8a5a2a']);
      horseKit({ vc: K }, 0, 0, 1.6, 0, col);
      K.add(GEO.box, '#7a5a38', 0, 0.95, -1.1, 1.5, 0.15, 2.4); K.add(GEO.box, '#6a4a30', -0.72, 1.3, -1.1, 0.08, 0.6, 2.4); K.add(GEO.box, '#6a4a30', 0.72, 1.3, -1.1, 0.08, 0.6, 2.4); K.add(GEO.box, '#6a4a30', 0, 1.3, -2.28, 1.5, 0.6, 0.08);
      for (const sx of [-1, 1]) K.add(GEO.cyl6, '#4a3424', sx * 0.6, 1.0, 0.4, 0.04, 1.8, 0.04, PI / 2, 0, 0);
      K.add(GEO.box, rpick(['#d8c070', '#c84a2a', '#4a7a3a']), 0, 1.35, -1.3, 1.2, 0.6, 1.6);
      K.add(GEO.box, '#a08060', 0, 1.25, -0.2, 1.4, 0.12, 0.5);
      K.add(GEO.box, '#4a3a5a', 0, 1.7, -0.2, 0.45, 0.65, 0.35); K.add(GEO.sph, '#e8c0a0', 0, 2.17, -0.2, 0.16, 0.18, 0.16); K.add(GEO.cyl, '#c8a860', 0, 2.33, -0.2, 0.3, 0.04, 0.3);
      const body = K.mesh(g, true);
      const wheels = [];
      for (const sx of [-1, 1]) { const w = new T.Mesh(GEO.cyl12, MAT.vc); w.geometry = GEO.cyl12; const wm = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 0.1, 10), std('#4a3424', 0.9)); wm.rotation.z = PI / 2; const wg = new T.Group(); wg.position.set(sx * 0.82, 0.55, -1.2); wg.add(wm); g.add(wg); wheels.push(wg); void w; }
      // horse legs as separate pivots for a trot animation
      const legs = [];
      for (const lx of [-0.25, 0.25]) for (const lz of [0.9, 2.3]) { const pv = new T.Group(); pv.position.set(lx, 0.9, lz); const lm = new T.Mesh(limbGeo, std(shade(col, -0.2).getStyle(), 0.8)); lm.scale.set(0.16, 0.9, 0.16); pv.add(lm); g.add(pv); legs.push(pv); }
      CARTS.push({ g, body, wheels, legs, route: r, u: Math.random(), dir: 1, spd: 2.2, turnT: 0, x: 0, z: 0, ry: 0 });
    }
  }
  function updateCarts(dt) {
    for (const c of CARTS) {
      const [a, b] = c.route, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // stop for the player
      const ahead = Math.hypot(P.x - (c.x + Math.sin(c.ry) * 2.5), P.z - (c.z + Math.cos(c.ry) * 2.5));
      const sp = ahead < 2.8 ? 0 : c.spd;
      if (c.turnT > 0) { c.turnT -= dt; c.ry += dt * PI / 2.0; }
      else { c.u += (sp * dt / L) * c.dir; if (c.u > 1 || c.u < 0) { c.u = clamp(c.u, 0, 1); c.dir *= -1; c.turnT = 2.0; } }
      const u = c.u, x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u);
      if (c.turnT <= 0) { const tr = Math.atan2((b[0] - a[0]) * c.dir, (b[1] - a[1]) * c.dir); c.ry += angDiff(c.ry, tr) * Math.min(1, dt * 4); }
      c.x = x; c.z = z;
      const y = gnd(x, z);
      c.g.position.set(x, y, z); c.g.rotation.y = c.ry;
      const moving = sp > 0 && c.turnT <= 0, t = U.uTime.value * 7;
      for (let i = 0; i < c.legs.length; i++) c.legs[i].rotation.x = moving ? Math.sin(t + (i % 2 ? PI : 0) + (i > 1 ? PI / 2 : 0)) * 0.5 : 0;
      for (const w of c.wheels) if (moving) w.rotation.x += dt * sp / 0.55;
      // push the player out of the cart's way
      const ddx = P.x - x, ddz = P.z - z, dd = Math.hypot(ddx, ddz);
      if (dd < 2.0 && dd > 0.01) { P.x = x + ddx / dd * 2.0; P.z = z + ddz / dd * 2.0; }
    }
  }

  /* ============================================================ SMOKE, SPARKS, WATER, AMBIENCE */
  let smokeT = 0, sparkT = 0, fallT = 0, birdT = 4, forgeT = 1, fountT = 0;
  function updateFx(dt, night) {
    // chimney smoke near the player (grey puffs that rise and fade)
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = LOW ? 0.35 : 0.16;
      for (let k = 0; k < 3; k++) {
        const c = CHIMNEYS[(Math.random() * CHIMNEYS.length) | 0]; if (!c) break;
        if (Math.abs(c.x - P.x) > 70 || Math.abs(c.z - P.z) > 70) continue;
        API.emit(c.x + rand(-0.2, 0.2), c.y + 0.2, c.z + rand(-0.2, 0.2), 1, c.dwarf ? '#4a4440' : '#9a948c', { speed: 0.35, up: c.big ? 2.2 : 1.4, grav: -0.25, life: c.big ? 3.4 : 2.6, size: c.big ? 2.4 : 1.5, bright: night ? 0.12 : 0.32 });
        if (c.dwarf && Math.random() < 0.5) API.emit(c.x, c.y + 0.3, c.z, 1, '#ff8a2a', { speed: 1, up: 3, grav: 1.5, life: 0.9, size: 0.25, bright: 2.2 });
      }
    }
    // forge embers + hammer clangs
    sparkT -= dt;
    if (sparkT <= 0) {
      sparkT = 0.12;
      for (const f of FORGE.fires) if (Math.abs(f.x - P.x) < 40 && Math.abs(f.z - P.z) < 40 && Math.random() < 0.5) API.emit(f.x + rand(-0.3, 0.3), f.y + 0.3, f.z + rand(-0.3, 0.3), 1, f.lava ? '#ff6a10' : '#ffb050', { speed: 0.6, up: 2.2, grav: 0.4, life: 1.1, size: 0.3, bright: 2.4 });
    }
    forgeT -= dt;
    if (forgeT <= 0) {
      forgeT = rand(0.6, 1.4);
      for (const a of FORGE.anvils) { const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < 30) { API.emit(a.x, a.y + 0.1, a.z, 8, '#ffcf6a', { speed: 4, up: 3, grav: 6, life: 0.5, size: 0.18, bright: 3 }); sfx('hit', { vol: clamp(0.5 - d / 60, 0.05, 0.35), pitch: 1.9 }); break; } }
    }
    // canal cascades + fountain spray
    fallT -= dt;
    if (fallT <= 0) {
      fallT = 0.1;
      for (const f of CANAL.falls) if (Math.abs(f.x - P.x) < 45 && Math.abs(f.z - P.z) < 45 && Math.random() < 0.6) API.emit(f.x, f.y + 0.2, f.z + rand(-2.6, 2.6), 1, '#e8f6ff', { speed: 0.8, up: f.spout ? 0.5 : 1.2, grav: 3, life: 0.7, size: 0.35, bright: 0.8 });
      if (Math.abs(FOUNT.x - P.x) < 50 && Math.abs(FOUNT.z - P.z) < 50) {
        for (let k = 0; k < 2; k++) { const a = rand(0, TAU); API.emit(FOUNT.x + Math.cos(a) * 5.4, FOUNT.y + 1.0, FOUNT.z + Math.sin(a) * 5.4, 1, '#dff3ff', { speed: 0.6, up: 1.2, grav: 4, life: 0.5, size: 0.3, bright: 0.9 }); }
        API.emit(FOUNT.x + 0.75, FOUNT.y + 9.0, FOUNT.z, 1, '#ffe08a', { speed: 0.8, up: 0.6, grav: -0.2, life: 1.3, size: 0.35, bright: 2.4 });
      }
    }
    // fountain jets shimmer
    fountT += dt;
    for (let i = 0; i < FOUNT.jets.length; i++) { const j = FOUNT.jets[i]; const k = 1 + Math.sin(fountT * 3 + i) * 0.04; j.scale.set(k, 1 + Math.sin(fountT * 2.3 + i * 0.7) * 0.05, k); }
    // birds by day
    birdT -= dt;
    if (birdT <= 0) { birdT = rand(3, 9); if (!night && dC(P.x, P.z) < WALL_R) { const p = rand(2.4, 3.4); sfx('pickup', { vol: 0.06, pitch: p }); setTimeout(() => sfx('pickup', { vol: 0.05, pitch: p * 1.12 }), 140); } }
  }
  // bells at noon and midnight (cathedral), dawn bell of the shrine
  const BELL = { last: -1, tolls: 0, t: 0, pitch: 0.5, src: null };
  function updateBells(dt) {
    const h = Math.floor(hourNow());
    if (BELL.last < 0) BELL.last = h;
    if (h !== BELL.last) {
      BELL.last = h;
      if (h === 12 || h === 0) { BELL.tolls = 12; BELL.t = 0; BELL.pitch = 0.5; BELL.src = CATH.bell; if (dC(P.x, P.z) < 220) toast(h === 12 ? 'Le campane della Cattedrale suonano mezzogiorno' : 'Le campane suonano la mezzanotte'); }
      else if (h === 6) { BELL.tolls = 3; BELL.t = 0; BELL.pitch = 0.32; BELL.src = JPBELL; }
      else if (h === 18) { BELL.tolls = 6; BELL.t = 0; BELL.pitch = 0.62; BELL.src = CATH.bell; }
    }
    if (BELL.tolls > 0) {
      BELL.t -= dt;
      if (BELL.t <= 0) {
        BELL.t = 1.7; BELL.tolls--;
        const src = BELL.src || CATH.bell || { x: CX, z: CZ }, d = Math.hypot(src.x - P.x, src.z - P.z);
        if (d < 260) { sfx('oracle', { vol: clamp(1.1 - d / 240, 0.08, 0.9), pitch: BELL.pitch }); if (d < 80) API.setShake(0.04); }
      }
    }
  }

  /* ============================================================ DISTRICTS, ARRIVAL, MARKERS, MAP */
  function districtAt(x, z) {
    const d = dC(x, z);
    if (d > WALL_R - 1) return null;
    if (d < PLAZA_R) return 'Piazza delle Mille Stelle';
    if (x < -36 && z < 466) return 'Quartiere dei Ciliegi';
    if (Math.abs(x) <= 36 && z < 432) return 'Accademia Arcana';
    if (x > 36 && z < 466) return 'Mercato dei Mille Mondi';
    if (x >= -50 && x <= -18 && z >= 444 && z <= 515) return 'Via delle Botteghe';
    if (x > 30 && z >= 466 && z < 522) return 'Rione della Cattedrale';
    if (x > 30 && z >= 522) return 'Giardini di Sylvaren';
    if (Math.abs(x) <= 30 && z >= 505) return 'Corte Reale';
    if (x < -30 && z >= 540) return 'Forgia di Kharum-Dur';
    if (x < -18 && z >= 466) return 'Quartiere dell\'Arena';
    return 'Altheria';
  }
  const DIST = { cur: null, t: 0, inside: false, lastMsg: 0, firstEnter: true };
  function updateDistricts(dt) {
    DIST.t -= dt; if (DIST.t > 0) return; DIST.t = 0.5;
    const inside = dC(P.x, P.z) < WALL_R - 1;
    if (inside !== DIST.inside) {
      DIST.inside = inside;
      if (inside) { emitEv('3d:enterCity', { city: 'altheria' }); if (!(arrival && !arrival.shown)) showCityBanner(); }
      else if (API.state === 'play') API.bigMsg('Terre Spezzate', 'place', 2);
    }
    const dn = districtAt(P.x, P.z);
    if (dn && dn !== DIST.cur && dn !== 'Altheria') {
      const now = performance.now();
      if (DIST.cur && now - DIST.lastMsg > 6000 && API.state === 'play' && !(arrival && !arrival.shown)) { API.bigMsg(dn, 'place', 2.4); DIST.lastMsg = now; }
      DIST.cur = dn;
    } else if (!dn) DIST.cur = null;
  }
  let cityEl = null, cityT = 0;
  function showCityBanner(sub) {
    if (!cityEl) { cityEl = document.createElement('div'); cityEl.id = 'mcity'; cityEl.innerHTML = '<div class="t1">ALTHERIA</div><div class="ln"></div><div class="t2"></div>'; document.body.appendChild(cityEl); }
    cityEl.querySelector('.t2').textContent = sub || 'CITTÀ DEI MILLE MONDI';
    cityEl.classList.add('show'); clearTimeout(cityT); cityT = setTimeout(() => cityEl.classList.remove('show'), 4200);
    sfx('portal', { vol: 0.3, pitch: 0.8 });
  }
  const KEYB = [{ x: 30, z: 452, label: '⚔', name: 'Gilda' }, { x: -34, z: 474, label: '⚖', name: 'Botteghe' }, { x: 0, z: 396, label: '✧', name: 'Accademia' }, { x: 0, z: 546, label: '♛', name: 'Castello' },
    { x: 59, z: 506, label: '✝', name: 'Cattedrale' }, { x: 41, z: 492, label: '☾', name: 'Locanda' }, { x: -52, z: 509, label: '⚔', name: 'Arena' }, { x: 92, z: 480, label: '♞', name: 'Scuderie' }];
  const myCmp = [], cityMk = { x: CX, z: CZ, label: '♛ Altheria', color: '#ffd36b' };
  function setupMarkers() {
    try { API.mapMarkers.push({ x: CX, z: CZ, label: 'Altheria', color: '#ffd36b', city: true }); } catch (e) { /* ignore */ }
    for (const k of KEYB) API.mapMarkers.push({ x: k.x, z: k.z, label: k.name, color: '#efe3c0', metro: true });
  }
  let mkInside = null;
  function updateMarkers() {
    const inside = dC(P.x, P.z) < WALL_R + 10;
    if (inside === mkInside) return;
    mkInside = inside;
    const C2 = API.compassMarkers;
    for (const m of myCmp) { const i = C2.indexOf(m); if (i >= 0) C2.splice(i, 1); }
    myCmp.length = 0;
    if (inside) for (const k of KEYB) myCmp.push({ x: k.x, z: k.z, label: k.label, color: '#efe3c0' });
    else myCmp.push(cityMk);
    for (const m of myCmp) C2.push(m);
  }
  function drawCityOnMap() {
    const c = document.getElementById('mapc'); if (!c) return;
    const x = c.getContext('2d'), MR = API.MAPR, W = (v) => (v / MR + 1) * 256;
    x.save();
    x.strokeStyle = 'rgba(255,220,140,.9)'; x.lineWidth = 2.5; x.beginPath(); x.arc(W(CX), W(CZ), WALL_R / MR * 256, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(40,30,15,.35)'; x.fill();
    x.strokeStyle = 'rgba(220,200,160,.55)'; x.lineWidth = 1;
    for (const r of ROADS) { if (r.kind === 'floor' || r.kind === 'bridge') continue; x.beginPath(); r.pts.forEach((p, i) => (i ? x.lineTo(W(p[0]), W(p[1])) : x.moveTo(W(p[0]), W(p[1])))); x.stroke(); }
    x.strokeStyle = 'rgba(90,170,220,.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(W(CANAL.x0), W(CANAL.z)); x.lineTo(W(CANAL.x1), W(CANAL.z)); x.stroke();
    x.font = '11px Georgia'; x.textAlign = 'center';
    for (const k of KEYB) { x.fillStyle = '#ffe7a8'; x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeText(k.label, W(k.x), W(k.z) + 4); x.fillText(k.label, W(k.x), W(k.z) + 4); }
    x.font = 'bold 14px Georgia'; x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.85)'; x.strokeText('ALTHERIA', W(CX), W(CZ - WALL_R) - 6); x.fillStyle = '#ffd36b'; x.fillText('ALTHERIA', W(CX), W(CZ - WALL_R) - 6);
    x.restore();
  }
  function hookMap() {
    const obs = new MutationObserver(() => {
      const mp = document.getElementById('mapp');
      if (mp && !mp.__metro) { mp.__metro = true; new MutationObserver(() => { if (mp.classList.contains('open')) setTimeout(drawCityOnMap, 0); }).observe(mp, { attributes: true, attributeFilter: ['class'] }); if (mp.classList.contains('open')) drawCityOnMap(); }
    });
    obs.observe(document.body, { childList: true });
  }

  /* ------------------------------------------------------------ grace, new game start, save-index safety */
  let graceIdx = -1, BASE_GRACES = 0, arrival = null;
  function setupGrace() {
    BASE_GRACES = API.LOC.grace.length;
    graceIdx = API.graceObjs.findIndex((g) => g.name === 'Piazza delle Mille Stelle');
    if (graceIdx < 0) graceIdx = API.addGrace(CX, CZ, 'Piazza delle Mille Stelle');
    // the engine reads LOC.grace[S.grace] before plugins load: never persist an index it does not know about
    const base = BASE_GRACES, prev = S.toJSON;
    Object.defineProperty(S, 'toJSON', { configurable: true, enumerable: false, writable: true, value: function () {
      const o = prev ? prev.call(this) : Object.assign({}, this);
      if ((o.grace | 0) >= base) { o.graceExt = o.grace; o.graceExtName = API.graceObjs[o.grace] ? API.graceObjs[o.grace].name : null; o.grace = 0; }
      else { delete o.graceExt; delete o.graceExtName; }
      return o;
    } });
  }
  let restoreDone = false;
  function restoreGrace() {
    if (restoreDone) return; restoreDone = true;
    if (S.graceExt == null) return;
    let i = S.graceExtName ? API.graceObjs.findIndex((g) => g.name === S.graceExtName) : -1;
    if (i < 0 && S.graceExt < API.graceObjs.length) i = S.graceExt;
    delete S.graceExt; delete S.graceExtName;
    if (i < 0) return;
    const g0 = API.graceObjs[0];
    S.grace = i; S.found[i] = true;
    // the engine spawned the player at grace 0: move to the real rest point
    if (Math.hypot(P.x - g0.x, P.z - g0.z) < 6) { API.teleport(API.graceObjs[i].x, API.graceObjs[i].z + 3); }
  }
  function newGameStart() {
    if (S.cityStart) return;
    S.cityStart = true; S.grace = graceIdx; S.found[graceIdx] = true;
    API.teleport(CX, CZ + 4); P.rot = PI;
    try { if (API.input) API.input.yaw = 0; } catch (e) { /* ignore */ }
    API.saveS();
    arrival = { t: 0, shown: false };
  }

  /* ------------------------------------------------------------ public API + plugin */
  API.metropolis = { center: { x: CX, z: CZ }, wallR: WALL_R, buildings: BLD, roads: ROADS, gnd, inside: (x, z) => dC(x, z) < WALL_R - 2, graceIndex: () => graceIdx };

  function init() {
    setupGrace();
    buildCity();
    newGameStart();
    setupMarkers();
    hookMap();
  }
  function populate() {
    // keep hostile monsters out of the capital
    const E = API.enemies;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      if (!e || e.qtag || e.passive || e.friendly || e.ally) continue;
      if (dC(e.x, e.z) < 160) { API.scene.remove(e.model.root); if (e.bar) API.scene.remove(e.bar.bg, e.bar.fg); E.splice(i, 1); }
    }
  }
  let near = true, purgeT = 0, grassT = 0;
  const ERR = {};
  function run(name, fn, a, b) { if ((ERR[name] || 0) > 2) return; try { fn(a, b); } catch (err) { ERR[name] = (ERR[name] || 0) + 1; console.error('[metropolis3d ' + name + ']', err); } }
  function update(dt) {
    U.uTime.value += dt;
    restoreGrace();
    const d = dC(P.x, P.z);
    const showNear = d < 300, showFar = d < 520;
    if (ROOT.visible !== showNear) ROOT.visible = showNear;
    FAR.visible = showFar && !showNear;
    near = showNear;
    if (!near) { hideBubbles(); return; }
    const n = nightAmt();
    MAT.win.color.setRGB(lerp(0.22, 2.4, n), lerp(0.24, 2.1, n), lerp(0.3, 1.6, n));
    MAT.lamp.color.setRGB(lerp(0.5, 3.0, n), lerp(0.45, 2.6, n), lerp(0.4, 2.0, n));
    MAT.stain.color.setScalar(lerp(0.55, 2.2, n));
    glowU.uK.value = n * (HIGH ? 1 : 0.85);
    if (cityLight) { cityLight.intensity = n * 30; cityLight.position.set(P.x, gnd(P.x, P.z) + 5, P.z); }
    // portcullis
    for (const pc of PORTC) { pc.y = lerp(pc.y, pc.want, Math.min(1, dt * 1.2)); pc.m.position.y = pc.y; }
    // kill monsters that wander inside the walls
    purgeT -= dt;
    if (purgeT <= 0) {
      purgeT = 0.5;
      const E = API.enemies;
      for (let i = E.length - 1; i >= 0; i--) {
        const e = E[i]; if (!e || e.dead || e.qtag || e.passive || e.friendly || e.ally) continue;
        if (dC(e.x, e.z) < WALL_R - 1) { API.scene.remove(e.model.root); if (e.bar) API.scene.remove(e.bar.bg, e.bar.fg); E.splice(i, 1); }
      }
    }
    grassT -= dt; if (grassT <= 0) { grassT = 0.25; filterGrass(); }
    // walkable bridge decks: lift the player onto the planks
    const br = bridgeAt(P.x, P.z);
    if (br) { const lift = deckY(br, P.z) - API.heightAt(P.x, P.z); if (lift > 0 && P.y < lift) { P.y = lift; if (P.vy < 0) P.vy = 0; } }
    // living city
    const night = n > 0.55;
    run('crowd', updateCrowd, dt, night);
    if (d < 140) run('bubbles', updateBubbles, dt, night); else hideBubbles();
    run('pigeons', updatePigeons, dt);
    run('carts', updateCarts, dt);
    run('fx', updateFx, dt, night);
    run('bells', updateBells, dt);
    run('districts', updateDistricts, dt);
    run('markers', updateMarkers);
    for (const c of ACAD.crystals) { c.a += dt * 0.25 * c.s; c.m.position.set(ACAD.x + Math.cos(c.a) * c.r, ACAD.y + c.h + Math.sin(U.uTime.value * 1.3 + c.a * 3) * 0.6, ACAD.z + Math.sin(c.a) * c.r); c.m.rotation.y += dt * 1.2; }
    for (let i = 0; i < ACAD.rings.length; i++) { const r = ACAD.rings[i]; r.rotation.x = PI / 2 + Math.sin(U.uTime.value * 0.4 + i) * 0.25; r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1); }
    if (ACAD.rune) ACAD.rune.material.opacity = 0.25 + n * 0.55 + Math.sin(U.uTime.value * 2) * 0.08;
    if (arrival && !arrival.shown) {
      arrival.t += dt;
      const busy = API.rpg && API.rpg.isOpen && API.rpg.isOpen();
      if (arrival.t > 4.5 && !busy && API.state === 'play') {
        arrival.shown = true;
        showCityBanner();
        setTimeout(() => oracle('《Analisi completata: Altheria, la Città dei Mille Mondi. Popolazione stimata: oltre centomila anime, da almeno sette mondi diversi. Raccomandazione: registrarsi alla Gilda.》', true), 2600);
        sfx('victory', { vol: 0.5 });
      }
    }
  }
  function interactables() {
    const out = [];
    if (DLG.open || performance.now() < DLG.block) return out;
    for (const s of SERV) if (Math.abs(s.x - P.x) < 6 && Math.abs(s.z - P.z) < 6) out.push({ x: s.x, z: s.z, r: s.r || 3, label: s.label, action: s.action });
    return out;
  }
  API.metropolis.dbg = { DLG, NPCS, CROWD, SERV, PIG, CARTS, CANAL, GN, talkTo, dPick, dAdvance, dClose, districtAt };
  API.register({ id: 'metropolis3d', init, populate, update, interactables });
})();
