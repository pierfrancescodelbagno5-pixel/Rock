/* Slime Reborn — Terre Spezzate 3D · towns3d.js
 * Settlements (Valdoria, the capital of the Nation, plus four villages), talkable villagers with roles
 * (merchant, blacksmith, elder + quests, innkeeper, guards, children), naming monsters into evolved allies
 * (Hobgoblin / Lupo Tempesta) that follow and fight, and the romance system with the six companions of the
 * Nation (visual-novel dialogue, gifts, dates, party, proposal and wedding cinematic).
 * Plugin for game3d.js — see docs/PLUGIN3D.md. Classic script, THREE global (r160). */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE, SK = window.SK || {};
  const { rand, lerp, clamp, angDiff, TAU, std, lam, hdr } = API;
  const Q = API.quality, LOW = Q === 'low', HIGH = Q === 'high';
  const PI = Math.PI;
  const sfx = (n, o) => { try { API.sfx(n, o); } catch (e) { /* audio optional */ } };
  const oracle = (t, gold) => { try { if (API.oracle) API.oracle(t, gold); else API.toast(t); } catch (e) { API.toast(t); } };
  const saveMain = () => { try { if (SK.save) SK.save.write(); } catch (e) { /* storage optional */ } };
  const fmtN = (n) => Math.floor(n).toLocaleString('it-IT');

  /* deterministic layout RNG (towns look the same on every visit) */
  let seed = 917331;
  function rnd() { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const rr = (a, b) => a + rnd() * (b - a);
  const rpick = (a) => a[(rnd() * a.length) | 0];
  const pick = (a) => a[(Math.random() * a.length) | 0];

  /* ------------------------------------------------------------ exact terrain surface
   * heightAt() is the smooth noise; the rendered terrain is a flat-shaded grid that linearly interpolates it.
   * groundAt() reproduces the grid triangles so props sit exactly on the visible ground. */
  const GSEG = LOW ? 170 : 250, GSIZE = API.MAPR * 2.3, GCELL = GSIZE / GSEG, GHALF = GSIZE / 2;
  const vCache = new Map();
  function vH(ix, iz) { const k = ix * 4096 + iz; let h = vCache.get(k); if (h === undefined) { h = API.heightAt(ix * GCELL - GHALF, iz * GCELL - GHALF); vCache.set(k, h); } return h; }
  function groundAt(x, z) {
    const gx = (x + GHALF) / GCELL, gz = (z + GHALF) / GCELL, ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    if (fx + fz <= 1) { const ha = vH(ix, iz); return ha + (vH(ix + 1, iz) - ha) * fx + (vH(ix, iz + 1) - ha) * fz; }
    const hc = vH(ix + 1, iz + 1); return hc + (vH(ix, iz + 1) - hc) * (1 - fx) + (vH(ix + 1, iz) - hc) * (1 - fz);
  }
  function nightAmt() {
    const a = API.DAY.t * TAU, x = Math.cos(a) * 0.75, y = Math.sin(a), z = 0.35 + Math.cos(a) * 0.15;
    const t = clamp((y / Math.hypot(x, y, z) + 0.22) / 0.24, 0, 1);
    return 1 - t * t * (3 - 2 * t);
  }

  /* ------------------------------------------------------------ shared geometry & materials */
  const GEO = {
    box: API.BOX, sph: new T.SphereGeometry(1, 10, 8), sphLo: new T.SphereGeometry(1, 7, 5), ico: new T.IcosahedronGeometry(1, 0),
    ico1: new T.IcosahedronGeometry(1, 1), dode: new T.DodecahedronGeometry(1, 0), oct: new T.OctahedronGeometry(1, 0),
    cyl: new T.CylinderGeometry(1, 1, 1, 8), cyl6: new T.CylinderGeometry(1, 1, 1, 6), cyl12: new T.CylinderGeometry(1, 1, 1, 12),
    cone: new T.ConeGeometry(1, 1, 8), cone4: new T.ConeGeometry(1, 1, 4), cone6: new T.ConeGeometry(1, 1, 6), cone12: new T.ConeGeometry(1, 1, 12),
    tor: new T.TorusGeometry(1, 0.12, 6, 18), prism: null, plane: new T.PlaneGeometry(1, 1),
  };
  GEO.prism = (() => {
    const A = [-0.5, 0, -0.5], B = [-0.5, 0, 0.5], C = [-0.5, 1, 0], D = [0.5, 0, -0.5], E = [0.5, 0, 0.5], F = [0.5, 1, 0];
    const tris = [A, B, C, D, F, E, B, E, F, B, F, C, A, C, F, A, F, D, A, D, E, A, E, B];
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(tris.flat(), 3)); g.computeVertexNormals(); return g;
  })();
  const MAT = {
    inst: lam('#ffffff'),
    metal: std('#ffffff', 0.4, 0.6),
    glow: new T.MeshBasicMaterial({ color: 0xffffff }),
    win: new T.MeshStandardMaterial({ color: '#27313f', roughness: 0.22, metalness: 0.35, emissive: new T.Color(0, 0, 0), flatShading: true }),
    lamp: new T.MeshBasicMaterial({ color: new T.Color('#6a5a40') }),
    ground: new T.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    water: new T.MeshStandardMaterial({ color: '#3a9fc4', roughness: 0.04, metalness: 0.45, transparent: true, opacity: 0.84, emissive: new T.Color('#0b3e52'), envMapIntensity: 1.4 }),
    fire: new T.MeshBasicMaterial({ color: hdr('#ff6a1a', 3.2), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }),
    fireCore: new T.MeshBasicMaterial({ color: hdr('#ffd36b', 3.6), transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }),
    add: (hex, k, op) => new T.MeshBasicMaterial({ color: hdr(hex, k), transparent: true, opacity: op == null ? 0.8 : op, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }),
    VC: new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    VCS: new T.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, metalness: 0.05 }),
    VG: new T.MeshBasicMaterial({ vertexColors: true }),
  };

  /* ------------------------------------------------------------ merge kit: many coloured parts → one mesh */
  const _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _v = new T.Vector3(), _s = new T.Vector3(), _n3 = new T.Matrix3();
  const NI = new WeakMap();
  function nonIdx(g) { let r = NI.get(g); if (!r) { r = g.index ? g.toNonIndexed() : g; if (!r.attributes.normal) r.computeVertexNormals(); NI.set(g, r); } return r; }
  function Kit() { this.items = []; }
  Kit.prototype.add = function (geo, col, x, y, z, sx, sy, sz, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    if (sx == null) sx = 1; if (sy == null) sy = sx; if (sz == null) sz = sx;
    const m = new T.Matrix4().compose(_v.set(x || 0, y || 0, z || 0), _q, _s.set(sx, sy, sz));
    this.items.push({ g: nonIdx(geo), m, c: col && col.isColor ? col : new T.Color(col) });
    return this;
  };
  Kit.prototype.geo = function () {
    let n = 0; for (const it of this.items) n += it.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const it of this.items) {
      const P = it.g.attributes.position, N = it.g.attributes.normal; _n3.getNormalMatrix(it.m);
      for (let i = 0; i < P.count; i++, o++) {
        _v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(it.m); pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        _v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(_n3).normalize(); nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
        col[o * 3] = it.c.r; col[o * 3 + 1] = it.c.g; col[o * 3 + 2] = it.c.b;
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  };
  Kit.prototype.mesh = function (mat, parent, shadow) {
    if (!this.items.length) return null;
    const m = new T.Mesh(this.geo(), mat); m.castShadow = shadow !== false && !LOW; m.receiveShadow = false;
    if (parent) parent.add(m); return m;
  };
  function piv(parent, x, y, z) { const g = new T.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }

  /* ------------------------------------------------------------ settlements */
  const TOWNS = [];
  function Town(id, name, x, z, r, color) {
    Object.assign(this, { id, name, x, z, r, color, L: new Map(), halos: [], fires: [], smokes: [], sparks: [], anims: [], nodes: [], foot: [], dist: 0, near: false });
    this.group = new T.Group(); API.scene.add(this.group);
    TOWNS.push(this);
  }
  Town.prototype.put = function (key, geo, mat, x, y, z, ry, sx, sy, sz, c, rx, rz, noShadow) {
    let l = this.L.get(key); if (!l) { l = { geo, mat, items: [], shadow: !noShadow }; this.L.set(key, l); }
    l.items.push({ x, y, z, ry: ry || 0, rx: rx || 0, rz: rz || 0, sx, sy, sz, c });
  };
  Town.prototype.done = function () {
    const m4 = new T.Matrix4(), e = new T.Euler(0, 0, 0, 'YXZ'), q = new T.Quaternion(), v = new T.Vector3(), s = new T.Vector3(), col = new T.Color();
    for (const l of this.L.values()) {
      const im = new T.InstancedMesh(l.geo, l.mat, l.items.length);
      l.items.forEach((it, i) => {
        e.set(it.rx, it.ry, it.rz, 'YXZ'); q.setFromEuler(e);
        m4.compose(v.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz)); im.setMatrixAt(i, m4);
        col.set(it.c == null ? 0xffffff : it.c); im.setColorAt(i, col);
      });
      im.castShadow = l.shadow && !LOW; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
    this.L.clear();
    if (this.halos.length) {
      const n = this.halos.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
      this.halos.forEach((h, i) => { pos.set([h.x, h.y, h.z], i * 3); size[i] = h.s; });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('size', new T.BufferAttribute(size, 1));
      this.haloPts = new T.Points(g, API.pointMat(true)); this.haloPts.frustumCulled = false; this.haloPts.visible = false;
      this.group.add(this.haloPts);
    }
  };
  // helpers in a building's local frame (local +z = front/door)
  function Frame(x, z, ry) { this.x = x; this.z = z; this.ry = ry; this.c = Math.cos(ry); this.s = Math.sin(ry); }
  Frame.prototype.wx = function (lx, lz) { return this.x + lx * this.c + lz * this.s; };
  Frame.prototype.wz = function (lx, lz) { return this.z - lx * this.s + lz * this.c; };
  const COLL = API.COLL;
  function collRect(F, w, d) {
    const along = w >= d, L = along ? w : d, r = (along ? d : w) / 2, n = Math.max(1, Math.ceil((L - 2 * r) / (r * 1.1)) + 1);
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : -L / 2 + r + (L - 2 * r) * i / (n - 1);
      COLL.push({ x: F.wx(along ? k : 0, along ? 0 : k), z: F.wz(along ? k : 0, along ? 0 : k), r: r * 1.05 });
    }
  }
  function footMinMax(F, w, d) {
    let mn = 1e9, mx = -1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const g = groundAt(F.wx(i * w / 2, j * d / 2), F.wz(i * w / 2, j * d / 2)); if (g < mn) mn = g; if (g > mx) mx = g; }
    return [mn, mx];
  }

  /* ------------------------------------------------------------ ground decals that hug the terrain */
  const _a = new T.Vector3(), _b = new T.Vector3();
  function pushTri(pos, col, a, b, c, cl) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]); _a.cross(_b);
    if (_a.y < 0) { const t = b; b = c; c = t; }
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) col.push(cl.r, cl.g, cl.b);
  }
  function decalMesh(TW, pos, col) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new T.Mesh(g, MAT.ground); m.receiveShadow = true; TW.group.add(m); return m;
  }
  const _cl = new T.Color();
  function shade(cols, k) { _cl.set(rpick(cols)).multiplyScalar(k == null ? rr(0.9, 1.08) : k); return _cl; }
  function ribbon(TW, pts, w, cols, closed, lift) {
    lift = lift == null ? 0.08 : lift;
    const S = [], n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 1.5));
      for (let j = 0; j < k; j++) S.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    S.push(closed ? S[0] : pts[n - 1]);
    const across = w > 3 ? 3 : 1, pos = [], col = [];
    let prev = null;
    for (let i = 0; i < S.length; i++) {
      const p = S[i], q = S[Math.min(i + 1, S.length - 1)], o = S[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const cur = [];
      for (let k = 0; k <= across; k++) { const f = (k / across - 0.5) * w, x = p[0] - dz * f, z = p[1] + dx * f; cur.push([x, groundAt(x, z) + lift, z]); }
      if (prev) for (let k = 0; k < across; k++) { const c = shade(cols); pushTri(pos, col, prev[k], prev[k + 1], cur[k + 1], c); pushTri(pos, col, prev[k], cur[k + 1], cur[k], c); }
      prev = cur;
    }
    return decalMesh(TW, pos, col);
  }
  function disc(TW, cx, cz, R, cols, ringCols, lift) {
    lift = lift == null ? 0.11 : lift;
    const rings = Math.max(2, Math.ceil(R / 1.5)), pos = [], col = [];
    let inner = [[cx, groundAt(cx, cz) + lift, cz]];
    for (let r = 1; r <= rings; r++) {
      const rad = R * r / rings, segs = Math.max(10, Math.round(TAU * rad / 1.7)), ring = [];
      for (let i = 0; i < segs; i++) { const a = i / segs * TAU, x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad; ring.push([x, groundAt(x, z) + lift, z]); }
      const rc = ringCols && ringCols[r] ? [ringCols[r]] : cols;
      // stitch inner (n1) and outer (n2) rings
      const n1 = inner.length, n2 = ring.length;
      let i1 = 0, i2 = 0;
      while (i1 < n1 || i2 < n2) {
        const a1 = n1 === 1 ? 0 : i1 / n1, a2 = i2 / n2;
        const c = shade(rc);
        if (n1 === 1 || (a2 <= a1 && i2 < n2) || i1 >= n1) { pushTri(pos, col, inner[i1 % n1], ring[i2 % n2], ring[(i2 + 1) % n2], c); i2++; if (n1 === 1 && i2 >= n2) break; }
        else { pushTri(pos, col, inner[i1 % n1], ring[i2 % n2], inner[(i1 + 1) % n1], c); i1++; }
      }
      inner = ring;
    }
    return decalMesh(TW, pos, col);
  }

  /* ------------------------------------------------------------ prop builders */
  const WALLC = ['#efe6d2', '#e8d9b5', '#f2e2c4', '#d9c9a8', '#ead2c2', '#d4dde0', '#f0e0d0', '#e3cfa1', '#dcc7b0'];
  const ROOFC = ['#a8432e', '#8e3a2a', '#b5552f', '#56637a', '#4a5568', '#7a4a2a', '#9b3b3b', '#3f6b5a', '#b06a35', '#5e4a7a'];
  const WOOD = '#5a3e2a', DARKWOOD = '#3e2a1e', STONE = '#8d8577';
  function windowAt(TW, F, lx, y, lz, ry, big) {
    const x = F.wx(lx, lz), z = F.wz(lx, lz);
    TW.put('win', GEO.box, MAT.win, x, y, z, F.ry + ry, big ? 1.0 : 0.75, big ? 1.1 : 0.85, 0.12, null, 0, 0, true);
    TW.put('trim', GEO.box, MAT.inst, x, y - (big ? 0.62 : 0.5), z, F.ry + ry, big ? 1.25 : 1.0, 0.12, 0.24, '#e9e1cf', 0, 0, true);
    TW.put('trim', GEO.box, MAT.inst, x, y + (big ? 0.6 : 0.48), z, F.ry + ry, big ? 1.15 : 0.9, 0.1, 0.18, DARKWOOD, 0, 0, true);
  }
  function house(TW, x, z, ry, w, d, h, o) {
    o = o || {};
    const F = new Frame(x, z, ry), [mn, mx] = footMinMax(F, w + 0.6, d + 0.6), base = mx + 0.25, fh = base - mn + 1.4;
    TW.put('stone', GEO.box, MAT.inst, x, base - fh / 2, z, ry, w + 0.5, fh, d + 0.5, o.stone || STONE);
    const wc = o.wall || rpick(WALLC), rc = o.roof || rpick(ROOFC);
    TW.put('wall', GEO.box, MAT.inst, x, base + h / 2, z, ry, w, h, d, wc);
    if (o.timber !== false) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) TW.put('beam', GEO.box, MAT.inst, F.wx(sx * w / 2, sz * d / 2), base + h / 2, F.wz(sx * w / 2, sz * d / 2), ry, 0.3, h + 0.02, 0.3, DARKWOOD);
      TW.put('beam', GEO.box, MAT.inst, x, base + (h > 5.4 ? h * 0.5 : h + 0.05), z, ry, w + 0.08, 0.24, d + 0.08, DARKWOOD);
    }
    const rh = d * (o.flat ? 0.18 : 0.62);
    TW.put('roof', GEO.prism, MAT.inst, x, base + h, z, ry, w + 0.9, rh, d + 1.0, rc);
    TW.put('roofEdge', GEO.box, MAT.inst, x, base + h + rh + 0.05, z, ry, w + 1.0, 0.16, 0.3, new T.Color(rc).multiplyScalar(0.7));
    if (o.chimney !== false && rnd() < 0.65) {
      const cx = F.wx(w * 0.28, -d * 0.18), cz = F.wz(w * 0.28, -d * 0.18);
      TW.put('stone', GEO.box, MAT.inst, cx, base + h + rh * 0.55, cz, ry, 0.62, rh * 0.9 + 1.0, 0.62, '#7a7066');
      TW.smokes.push({ x: cx, y: base + h + rh * 1.05 + 0.5, z: cz });
    }
    const dx = F.wx(o.doorX || 0, d / 2 + 0.04), dz = F.wz(o.doorX || 0, d / 2 + 0.04);
    TW.put('door', GEO.box, MAT.inst, dx, base + 1.05, dz, ry, 1.15, 2.1, 0.14, o.door || rpick(['#5a3a22', '#4a2e1a', '#6b4226', '#3d4a5a', '#5a2a2a']));
    TW.put('trim', GEO.box, MAT.inst, dx, base + 2.18, dz, ry, 1.4, 0.16, 0.22, DARKWOOD, 0, 0, true);
    TW.put('stone', GEO.box, MAT.inst, F.wx(o.doorX || 0, d / 2 + 0.5), base - 0.12, F.wz(o.doorX || 0, d / 2 + 0.5), ry, 1.6, 0.3, 0.8, '#9a9182');
    const rows = h > 5.4 ? [base + h * 0.3, base + h * 0.75] : [base + h * 0.58];
    rows.forEach((y, ri) => {
      if (w > 4.4) for (const sx of [-1, 1]) windowAt(TW, F, sx * w * 0.3, y, d / 2 + 0.02, 0);
      else if (ri) windowAt(TW, F, 0, y, d / 2 + 0.02, 0);
      for (const sx of [-1, 1]) windowAt(TW, F, sx * (w / 2 + 0.02), y, 0, PI / 2);
      windowAt(TW, F, 0, y, -d / 2 - 0.02, 0);
    });
    if (o.flowers !== false && rnd() < 0.6) for (const sx of [-1, 1]) {
      if (w <= 4.4) break;
      const fx = F.wx(sx * w * 0.3, d / 2 + 0.25), fz = F.wz(sx * w * 0.3, d / 2 + 0.25);
      TW.put('trim', GEO.box, MAT.inst, fx, rows[0] - 0.62, fz, ry, 1.0, 0.25, 0.3, '#6b4a2a', 0, 0, true);
      for (let i = 0; i < 4; i++) TW.put('flower', GEO.sphLo, MAT.inst, F.wx(sx * w * 0.3 + (i - 1.5) * 0.24, d / 2 + 0.28), rows[0] - 0.42, F.wz(sx * w * 0.3 + (i - 1.5) * 0.24, d / 2 + 0.28), 0, 0.13, 0.13, 0.13, rpick(['#ff5a7a', '#ffd23f', '#ff8a3d', '#c77dff', '#ffffff']), 0, 0, true);
    }
    collRect(F, w + 0.6, d + 0.6);
    TW.foot.push({ x, z, r: Math.max(w, d) * 0.6 });
    return { F, base, h, rh };
  }
  function hut(TW, x, z, r, h, ry, wallC, roofC) {
    const g = groundAt(x, z), F = new Frame(x, z, ry);
    TW.put('hutWall', GEO.cyl, MAT.inst, x, g + h / 2 - 0.4, z, ry, r, h + 0.8, r, wallC || '#7a5a3a');
    TW.put('thatch', GEO.cone, MAT.inst, x, g + h + r * 0.6, z, ry + 0.3, r * 1.4, r * 1.25, r * 1.4, roofC || rpick(['#c9a24a', '#b8913f', '#d8b25a']));
    TW.put('thatch', GEO.cone, MAT.inst, x, g + h + r * 1.25, z, ry, r * 0.5, r * 0.5, r * 0.5, '#a0782f');
    TW.put('door', GEO.box, MAT.inst, F.wx(0, r * 0.97), g + 0.8, F.wz(0, r * 0.97), ry, 0.9, 1.6, 0.2, '#3a2416');
    TW.put('beam', GEO.cyl6, MAT.inst, F.wx(0, r + 0.2), g + h + 0.05, F.wz(0, r + 0.2), ry, 0.08, 0.08, 1.1, DARKWOOD, PI / 2);
    COLL.push({ x, z, r: r + 0.2 }); TW.foot.push({ x, z, r: r + 0.5 });
  }
  function logCabin(TW, x, z, ry, w, d) {
    const F = new Frame(x, z, ry), [mn, mx] = footMinMax(F, w, d), base = mx + 0.1, n = 6, lr = 0.24, h = n * lr * 2;
    TW.put('stone', GEO.box, MAT.inst, x, base - (base - mn + 1) / 2, z, ry, w + 0.4, base - mn + 1, d + 0.4, '#7d7a76');
    for (let i = 0; i < n; i++) {
      const y = base + lr + i * lr * 2, c = (i % 2 ? '#6e4a2c' : '#7d5634');
      for (const sz of [-1, 1]) TW.put('log', GEO.cyl, MAT.inst, F.wx(0, sz * d / 2), y, F.wz(0, sz * d / 2), ry, lr, w + 0.6, lr, c, 0, PI / 2);
      for (const sx of [-1, 1]) TW.put('log', GEO.cyl, MAT.inst, F.wx(sx * w / 2, 0), y + lr, F.wz(sx * w / 2, 0), ry + PI / 2, lr, d + 0.6, lr, c, 0, PI / 2);
    }
    TW.put('wall', GEO.box, MAT.inst, x, base + h / 2, z, ry, w - 0.2, h, d - 0.2, '#5e3f26');
    TW.put('roof', GEO.prism, MAT.inst, x, base + h + lr, z, ry, w + 1.2, d * 0.62, d + 1.3, '#4a3424');
    TW.put('snow', GEO.prism, MAT.inst, x, base + h + lr + 0.22, z, ry, w + 1.3, d * 0.6, d + 1.25, '#f3f7fb');
    TW.put('stone', GEO.box, MAT.inst, F.wx(w * 0.3, 0), base + h + d * 0.5, F.wz(w * 0.3, 0), ry, 0.6, 1.8, 0.6, '#6f6a66');
    TW.smokes.push({ x: F.wx(w * 0.3, 0), y: base + h + d * 0.5 + 1.1, z: F.wz(w * 0.3, 0) });
    TW.put('door', GEO.box, MAT.inst, F.wx(0, d / 2 + 0.2), base + 1.0, F.wz(0, d / 2 + 0.2), ry, 1.1, 2.0, 0.14, '#3e2a1e');
    for (const sx of [-1, 1]) windowAt(TW, F, sx * w * 0.3, base + h * 0.55, d / 2 + 0.22, 0);
    for (const sx of [-1, 1]) windowAt(TW, F, sx * (w / 2 + 0.22), base + h * 0.55, 0, PI / 2);
    collRect(F, w + 0.8, d + 0.8); TW.foot.push({ x, z, r: Math.max(w, d) * 0.6 });
  }
  function stoneHouse(TW, x, z, ry, w, d, h) {
    const F = new Frame(x, z, ry), [mn, mx] = footMinMax(F, w, d), base = mx + 0.1;
    TW.put('stoneW', GEO.box, MAT.inst, x, (base + h + mn - 1) / 2, z, ry, w, base + h - mn + 1, d, rpick(['#8a5a48', '#7a4e40', '#946352', '#6e4a3e']));
    TW.put('stoneW', GEO.box, MAT.inst, x, base + h + 0.15, z, ry, w + 0.3, 0.3, d + 0.3, '#5a3a30');
    for (let i = 0; i < Math.round(w / 0.9); i++) for (const sz of [-1, 1]) TW.put('stoneW', GEO.box, MAT.inst, F.wx(-w / 2 + 0.45 + i * 0.9, sz * d / 2), base + h + 0.55, F.wz(-w / 2 + 0.45 + i * 0.9, sz * d / 2), ry, 0.5, 0.5, 0.3, '#5a3a30');
    TW.put('door', GEO.box, MAT.inst, F.wx(0, d / 2 + 0.03), base + 1.05, F.wz(0, d / 2 + 0.03), ry, 1.1, 2.1, 0.12, '#3a2216');
    TW.put('cloth', GEO.box, MAT.inst, F.wx(0, d / 2 + 0.7), base + 2.5, F.wz(0, d / 2 + 0.7), ry, w * 0.7, 0.08, 1.5, rpick(['#b0301e', '#8a1c1c', '#c2452a']), -0.35);
    for (const sx of [-1, 1]) windowAt(TW, F, sx * w * 0.3, base + h * 0.6, d / 2 + 0.02, 0);
    windowAt(TW, F, w / 2 + 0.02, base + h * 0.6, 0, PI / 2);
    collRect(F, w + 0.4, d + 0.4); TW.foot.push({ x, z, r: Math.max(w, d) * 0.6 });
  }
  function stiltHouse(TW, x, z, ry, w, d) {
    const F = new Frame(x, z, ry), [mn, mx] = footMinMax(F, w, d), base = mx + 2.3, h = 3.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const px = F.wx(sx * (w / 2 - 0.2), sz * (d / 2 - 0.2)), pz = F.wz(sx * (w / 2 - 0.2), sz * (d / 2 - 0.2)), g = groundAt(px, pz);
      TW.put('log', GEO.cyl6, MAT.inst, px, (g - 0.8 + base) / 2, pz, 0, 0.2, base - g + 0.8, 0.2, '#4a3a2a');
    }
    TW.put('plank', GEO.box, MAT.inst, x, base - 0.1, z, ry, w + 1.6, 0.2, d + 1.6, '#6b5238');
    TW.put('wall', GEO.box, MAT.inst, x, base + h / 2, z, ry, w, h, d, rpick(['#7a6a4e', '#6e6448', '#857252']));
    TW.put('roof', GEO.prism, MAT.inst, x, base + h, z, ry, w + 1.0, d * 0.7, d + 1.1, rpick(['#4a5a2a', '#5a4a6b', '#3f5a3a']));
    TW.put('door', GEO.box, MAT.inst, F.wx(0, d / 2 + 0.04), base + 1.0, F.wz(0, d / 2 + 0.04), ry, 1.0, 1.9, 0.12, '#3a2a1a');
    for (const sx of [-1, 1]) windowAt(TW, F, sx * (w / 2 + 0.02), base + h * 0.55, 0, PI / 2);
    windowAt(TW, F, w * 0.3, base + h * 0.55, d / 2 + 0.02, 0);
    // ladder
    const lx = F.wx(-w * 0.3, d / 2 + 1.1), lz = F.wz(-w * 0.3, d / 2 + 1.1), lg = groundAt(lx, lz);
    for (const sx of [-0.3, 0.3]) TW.put('log', GEO.cyl6, MAT.inst, F.wx(-w * 0.3 + sx, d / 2 + 1.1), (lg + base) / 2, F.wz(-w * 0.3 + sx, d / 2 + 1.1), 0, 0.06, base - lg, 0.06, '#5a4630');
    for (let y = lg + 0.4; y < base; y += 0.45) TW.put('plank', GEO.box, MAT.inst, lx, y, lz, ry, 0.7, 0.07, 0.1, '#6b5238');
    TW.put('lantern', GEO.box, MAT.lamp, F.wx(w * 0.5 + 0.5, d / 2 + 0.6), base + 1.6, F.wz(w * 0.5 + 0.5, d / 2 + 0.6), ry, 0.3, 0.4, 0.3, null, 0, 0, true);
    TW.halos.push({ x: F.wx(w * 0.5 + 0.5, d / 2 + 0.6), y: base + 1.6, z: F.wz(w * 0.5 + 0.5, d / 2 + 0.6), s: 2.6, c: '#c8ff6a' });
    collRect(F, w + 1.2, d + 1.2); TW.foot.push({ x, z, r: Math.max(w, d) * 0.7 });
  }
  function lampPost(TW, x, z, ry, col) {
    const g = groundAt(x, z);
    TW.put('pole', GEO.cyl6, MAT.metal, x, g + 1.6, z, 0, 0.07, 3.2, 0.07, '#26262c');
    TW.put('pole', GEO.cyl6, MAT.metal, x, g + 0.15, z, 0, 0.18, 0.3, 0.18, '#26262c');
    TW.put('pole', GEO.cone4, MAT.metal, x, g + 3.62, z, ry + PI / 4, 0.32, 0.25, 0.32, '#26262c');
    TW.put('lantern', GEO.box, MAT.lamp, x, g + 3.3, z, ry, 0.3, 0.42, 0.3, null, 0, 0, true);
    TW.halos.push({ x, y: g + 3.3, z, s: 3.2, c: col || '#ffc46b' });
    COLL.push({ x, z, r: 0.25 });
  }
  const CROWNS = ['#5f8f3a', '#6b9a3f', '#7aa64a', '#4f7f34', '#8aa846', '#c9a23c'];
  function tree(TW, x, z, s, kind) {
    const g = groundAt(x, z);
    if (kind === 'pine') {
      TW.put('trunk', GEO.cyl6, MAT.inst, x, g + 1.2 * s, z, 0, 0.25 * s, 2.4 * s, 0.25 * s, '#4a3424');
      for (let k = 0; k < 3; k++) TW.put('crown', GEO.cone, MAT.inst, x, g + (2.6 + k * 1.5) * s, z, k, (2.0 - k * 0.5) * s, 2.4 * s, (2.0 - k * 0.5) * s, rpick(['#24432f', '#2d4f36', '#1f3b2a']));
      TW.put('snow', GEO.cone, MAT.inst, x, g + 6.1 * s, z, 0, 0.6 * s, 0.9 * s, 0.6 * s, '#f4f8fc');
    } else {
      TW.put('trunk', GEO.cyl6, MAT.inst, x, g + 1.4 * s, z, 0, 0.22 * s, 2.8 * s, 0.22 * s, '#5a4330');
      TW.put('crown', GEO.ico1, MAT.inst, x, g + 3.6 * s, z, rr(0, 6), 1.7 * s, 1.45 * s, 1.7 * s, kind || rpick(CROWNS));
      TW.put('crown', GEO.ico, MAT.inst, x + 0.7 * s, g + 4.4 * s, z - 0.3 * s, rr(0, 6), 1.0 * s, 0.9 * s, 1.0 * s, kind || rpick(CROWNS));
    }
    COLL.push({ x, z, r: 0.45 * s }); TW.foot.push({ x, z, r: 1.6 * s });
  }
  function bush(TW, x, z, s, flowers) {
    const g = groundAt(x, z);
    TW.put('crown', GEO.ico, MAT.inst, x, g + 0.4 * s, z, rr(0, 6), 0.9 * s, 0.65 * s, 0.9 * s, rpick(['#4f7f34', '#5f8f3a', '#3f6b2e']));
    if (flowers) for (let i = 0; i < 5; i++) { const a = rr(0, TAU); TW.put('flower', GEO.sphLo, MAT.inst, x + Math.cos(a) * 0.6 * s, g + rr(0.6, 0.9) * s, z + Math.sin(a) * 0.6 * s, 0, 0.13, 0.13, 0.13, flowers, 0, 0, true); }
  }
  function barrel(TW, x, z, s) { const g = groundAt(x, z); TW.put('barrel', GEO.cyl12, MAT.inst, x, g + 0.5 * s, z, rr(0, 6), 0.42 * s, 1.0 * s, 0.42 * s, '#7a5232'); TW.put('pole', GEO.cyl12, MAT.metal, x, g + 0.75 * s, z, 0, 0.44 * s, 0.07, 0.44 * s, '#3a3a40'); TW.put('pole', GEO.cyl12, MAT.metal, x, g + 0.25 * s, z, 0, 0.44 * s, 0.07, 0.44 * s, '#3a3a40'); COLL.push({ x, z, r: 0.45 * s }); }
  function crate(TW, x, z, s, ry) { const g = groundAt(x, z); TW.put('crate', GEO.box, MAT.inst, x, g + 0.4 * s, z, ry || 0, 0.8 * s, 0.8 * s, 0.8 * s, '#8a6a42'); }
  // campfire / brazier: animated flames + particles
  function fire(TW, x, z, y, s, logs) {
    const g = y == null ? groundAt(x, z) : y;
    if (logs) {
      for (let i = 0; i < 4; i++) TW.put('log', GEO.cyl6, MAT.inst, x, g + 0.15, z, i * PI / 4, 0.12 * s, 1.3 * s, 0.12 * s, '#3a2618', PI / 2 - 0.25);
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; TW.put('rock', GEO.dode, MAT.inst, x + Math.cos(a) * 0.95 * s, g + 0.1, z + Math.sin(a) * 0.95 * s, a, 0.28 * s, 0.22 * s, 0.28 * s, '#6e6a64'); }
      COLL.push({ x, z, r: 0.9 * s });
    }
    const grp = new T.Group(); grp.position.set(x, g + (logs ? 0.2 : 0), z); TW.group.add(grp);
    const fl = [];
    for (let i = 0; i < 3; i++) { const m = new T.Mesh(GEO.cone6, i ? MAT.fire : MAT.fireCore); m.position.set((i - 1) * 0.18 * s, 0.4 * s, (i % 2) * 0.12 * s); m.scale.set(0.3 * s, 0.9 * s, 0.3 * s); grp.add(m); fl.push(m); }
    TW.fires.push({ x, y: g + 0.5 * s + (logs ? 0.2 : 0), z, s, fl, ph: rr(0, 6) });
    TW.halos.push({ x, y: g + 0.9 * s, z, s: 4.5 * s, c: '#ff8a3a', always: true });
  }
  // emblem textures (banner of the Nation: a crowned slime)
  function emblemTex(w, h, bg, fg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.lineWidth = Math.max(3, w * 0.04); x.strokeRect(w * 0.06, w * 0.06, w * 0.88, h - w * 0.12);
    const cx = w / 2, cy = h * 0.52, r = Math.min(w, h) * 0.26;
    x.fillStyle = fg; x.beginPath(); x.moveTo(cx - r, cy + r * 0.6); x.quadraticCurveTo(cx - r * 1.1, cy - r * 0.9, cx, cy - r); x.quadraticCurveTo(cx + r * 1.1, cy - r * 0.9, cx + r, cy + r * 0.6); x.closePath(); x.fill();
    x.fillStyle = bg; x.beginPath(); x.arc(cx - r * 0.35, cy - r * 0.05, r * 0.14, 0, TAU); x.arc(cx + r * 0.35, cy - r * 0.05, r * 0.14, 0, TAU); x.fill();
    x.fillStyle = fg; x.beginPath(); const cy2 = cy - r * 1.05;
    x.moveTo(cx - r * 0.6, cy2); x.lineTo(cx - r * 0.6, cy2 - r * 0.5); x.lineTo(cx - r * 0.3, cy2 - r * 0.25); x.lineTo(cx, cy2 - r * 0.6); x.lineTo(cx + r * 0.3, cy2 - r * 0.25); x.lineTo(cx + r * 0.6, cy2 - r * 0.5); x.lineTo(cx + r * 0.6, cy2); x.closePath(); x.fill();
    if (h > w * 1.2) { x.beginPath(); x.moveTo(0, h); x.lineTo(w / 2, h * 0.9); x.lineTo(w, h); x.fillStyle = 'rgba(0,0,0,1)'; x.globalCompositeOperation = 'destination-out'; x.fill(); x.globalCompositeOperation = 'source-over'; }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  const FLAGMAT = {};
  function flagMat(kind, horiz) {
    const key = kind + (horiz ? 'h' : 'v');
    if (FLAGMAT[key]) return FLAGMAT[key];
    const pal = { nation: ['#1d3a8a', '#ffd36b'], crimson: ['#8a1c1c', '#f0c070'], goblin: ['#4a5a2a', '#e8d070'] }[kind];
    return (FLAGMAT[key] = new T.MeshLambertMaterial({ map: horiz ? emblemTex(192, 128, pal[0], pal[1]) : emblemTex(128, 192, pal[0], pal[1]), side: T.DoubleSide, transparent: true, alphaTest: 0.5 }));
  }
  const flagGeo = (() => { const g = new T.PlaneGeometry(1.5, 1, 4, 1); g.translate(0.75, -0.5, 0); return g; })();
  const bannerGeo = (() => { const g = new T.PlaneGeometry(1, 1.5, 1, 4); g.translate(0, -0.75, 0); return g; })();
  function flag(TW, x, y, z, ry, s, kind, pole) {
    if (pole) { TW.put('pole', GEO.cyl6, MAT.metal, x, y - pole / 2 + 0.2, z, 0, 0.06, pole, 0.06, '#c9a24a'); }
    const m = new T.Mesh(flagGeo, flagMat(kind, true)); m.position.set(x, y, z); m.rotation.set(0, ry, 0); m.scale.set(s, s, 1); m.castShadow = !LOW;
    TW.group.add(m); TW.anims.push({ m, base: ry, ph: rr(0, 6), k: 'flag' });
  }
  function banner(TW, x, y, z, ry, s, kind) {
    const m = new T.Mesh(bannerGeo, flagMat(kind)); m.position.set(x, y, z); m.rotation.y = ry; m.scale.set(s, s, 1);
    TW.group.add(m); TW.anims.push({ m, base: 0, ph: rr(0, 6), k: 'banner' });
  }

  function signTex(text, icon, bg) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 112; const x = c.getContext('2d');
    x.fillStyle = bg || '#5a3a22'; x.fillRect(0, 0, 256, 112); x.strokeStyle = '#d9b44a'; x.lineWidth = 6; x.strokeRect(5, 5, 246, 102);
    x.fillStyle = '#ffe7a8'; x.font = 'bold 34px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(icon ? icon + ' ' + text : text, 128, 58);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  }
  function sign(TW, x, y, z, ry, text, icon, bg) {
    const m = new T.Mesh(new T.PlaneGeometry(2.2, 0.96), new T.MeshLambertMaterial({ map: signTex(text, icon, bg), side: T.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; TW.group.add(m);
    TW.anims.push({ m, base: 0, ph: rr(0, 6), k: 'sign' });
  }
  function stall(TW, x, z, ry, c1, c2) {
    const F = new Frame(x, z, ry), g = groundAt(x, z);
    TW.put('wood', GEO.box, MAT.inst, x, g + 0.5, z, ry, 2.8, 1.0, 1.0, '#7a5232');
    TW.put('wood', GEO.box, MAT.inst, x, g + 1.02, z, ry, 3.0, 0.08, 1.15, '#8e6a42');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) TW.put('wood', GEO.box, MAT.inst, F.wx(sx * 1.4, sz * 0.7 - 0.3), g + (sz > 0 ? 1.25 : 1.5), F.wz(sx * 1.4, sz * 0.7 - 0.3), ry, 0.12, sz > 0 ? 2.5 : 3.0, 0.12, '#5a3e2a');
    for (let i = 0; i < 4; i++) TW.put('cloth', GEO.box, MAT.inst, F.wx(-1.12 + i * 0.75, -0.25), g + 2.75, F.wz(-1.12 + i * 0.75, -0.25), ry, 0.75, 0.06, 2.1, i % 2 ? c2 : c1, 0.28);
    const goods = ['#e53935', '#ff9800', '#8bc34a', '#ffeb3b', '#7e57c2', '#26c6da', '#8d6e63', '#f06292'];
    for (let i = 0; i < 7; i++) {
      const gx = F.wx(-1.1 + i * 0.37, 0.15 + (i % 2) * 0.2), gz = F.wz(-1.1 + i * 0.37, 0.15 + (i % 2) * 0.2);
      if (i % 3 === 0) TW.put('goods', GEO.box, MAT.inst, gx, g + 1.18, gz, ry + i, 0.28, 0.24, 0.28, rpick(goods), 0, 0, true);
      else TW.put('goods', GEO.sphLo, MAT.inst, gx, g + 1.17, gz, 0, 0.14, 0.14, 0.14, rpick(goods), 0, 0, true);
    }
    collRect(F, 3.1, 1.4); TW.foot.push({ x, z, r: 2 });
    return F;
  }
  function totem(TW, x, z, ry) {
    const g = groundAt(x, z);
    TW.put('wood', GEO.box, MAT.inst, x, g + 0.6, z, ry, 0.8, 1.6, 0.8, '#6e4a2c');
    TW.put('wood', GEO.box, MAT.inst, x, g + 1.9, z, ry, 0.95, 1.0, 0.95, '#a0522d');
    TW.put('wood', GEO.box, MAT.inst, x, g + 2.85, z, ry, 0.85, 0.9, 0.85, '#3f7a5a');
    const F = new Frame(x, z, ry);
    for (const sx of [-1, 1]) {
      TW.put('wood', GEO.box, MAT.inst, F.wx(sx * 0.85, 0), g + 3.0, F.wz(sx * 0.85, 0), ry, 0.9, 0.18, 0.5, '#c9a24a', 0, sx * 0.35);
      TW.put('glowI', GEO.box, MAT.glow, F.wx(sx * 0.22, 0.48), g + 2.0, F.wz(sx * 0.22, 0.48), ry, 0.18, 0.12, 0.05, hdr('#9dff6a', 2.6), 0, 0, true);
      TW.put('glowI', GEO.box, MAT.glow, F.wx(sx * 0.2, 0.43), g + 2.95, F.wz(sx * 0.2, 0.43), ry, 0.15, 0.15, 0.05, hdr('#ffd23f', 2.4), 0, 0, true);
    }
    TW.put('wood', GEO.cone4, MAT.inst, F.wx(0, 0.6), g + 2.75, F.wz(0, 0.6), ry, 0.15, 0.4, 0.15, '#e0c060', PI / 2);
    TW.put('wood', GEO.cone4, MAT.inst, x, g + 3.6, z, ry, 0.5, 0.6, 0.5, '#c9a24a');
    COLL.push({ x, z, r: 0.6 });
  }

  /* ============================================================ VALDORIA, CAPITALE DELLA NAZIONE */
  const VAL = { x: 60, z: 230, R: 64 };
  const at = (a, r, c) => [(c || VAL).x + Math.cos(a) * r, (c || VAL).z + Math.sin(a) * r];
  const faceC = (a) => Math.atan2(-Math.cos(a), -Math.sin(a)); // ry so the local front (+z) faces the centre
  const SPOT = {}; // companion home spots
  function buildValdoria() {
    const TW = new Town('valdoria', 'Valdoria, Capitale della Nazione', VAL.x, VAL.z, 74, '#ffd36b');
    const cx = VAL.x, cz = VAL.z, R = VAL.R;
    const COB = ['#a59c88', '#9a917e', '#b0a690', '#8f8676', '#a39684'], ROAD = ['#9c8c70', '#a8987a', '#8f8064', '#a39272'];
    // --- ground: plaza, palace square, ring road, avenues, alleys, royal road
    disc(TW, cx, cz, 15.8, COB, { 3: '#cfc3a5', 7: '#cfc3a5', 11: '#7d7466' }, 0.12);
    disc(TW, cx, cz + 27.5, 10.5, COB, { 2: '#e0cfa6', 5: '#cfc3a5', 7: '#7d7466' }, 0.13);
    const ring = []; for (let i = 0; i < 56; i++) ring.push(at(i / 56 * TAU, 30));
    ribbon(TW, ring, 3.8, ROAD, true, 0.08);
    ribbon(TW, [[cx, cz - R - 16], [cx, cz - 15]], 5.6, ROAD, false, 0.095);
    ribbon(TW, [[cx, cz + 15], [cx, cz + 19]], 5, ROAD, false, 0.095);
    for (const a of [0, PI]) ribbon(TW, [at(a, 15.2), at(a, 39)], 2.6, ROAD, false, 0.1);
    for (const a of [-PI / 4, -3 * PI / 4]) ribbon(TW, [at(a, 31.5), at(a, 41)], 2.4, ROAD, false, 0.1);
    const rd = []; for (let i = 0; i <= 18; i++) { const t = i / 18; rd.push([lerp(cx, 8, t) - Math.sin(t * PI) * 24, lerp(cz - R - 16, 22, t)]); }
    ribbon(TW, rd, 4, ROAD, false, 0.08);
    // reserved lots
    TW.foot.push({ x: cx, z: cz + 45, r: 17 }, { x: cx, z: cz + 27.5, r: 11 }, { x: cx, z: cz, r: 16.5 });
    for (let z = cz - R; z < cz - 15; z += 4) TW.foot.push({ x: cx, z, r: 4 });
    for (const a of [0, PI]) for (let r = 16; r < 40; r += 3) { const [x, z] = at(a, r); TW.foot.push({ x, z, r: 2 }); }
    for (const a of [-PI / 4, -3 * PI / 4]) for (let r = 31; r < 42; r += 3) { const [x, z] = at(a, r); TW.foot.push({ x, z, r: 1.8 }); }
    const spots = { aurelia: [PI, 45], lyra: [0, 45], kiara: [-PI / 4, 47.5], selene: [-3 * PI / 4, 47.5] };
    for (const k in spots) { const [x, z] = at(spots[k][0], spots[k][1]); SPOT[k] = { x, z, ry: faceC(spots[k][0]) }; TW.foot.push({ x, z, r: 7.5 }); }
    SPOT.nerissa = { x: cx + 5.2, z: cz + 4.6, ry: Math.atan2(-5.2, -4.6) + PI };
    SPOT.morgana = { x: cx + 7.5, z: cz + 30, ry: -PI / 2 - 0.5 };
    // --- walls with towers and the northern gate
    const N = 24, gateA = -PI / 2, verts = [];
    for (let i = 0; i < N; i++) verts.push(at(gateA + PI / N + i * TAU / N, R));
    const wallPiece = (x1, z1, x2, z2) => {
      const L = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(-(z2 - z1), x2 - x1), parts = Math.max(1, Math.round(L / 5.6)), l = L / parts;
      for (let k = 0; k < parts; k++) {
        const ax = lerp(x1, x2, k / parts), az = lerp(z1, z2, k / parts), bx = lerp(x1, x2, (k + 1) / parts), bz = lerp(z1, z2, (k + 1) / parts);
        let mn = 1e9, mx = -1e9; for (let j = 0; j <= 4; j++) { const g = groundAt(lerp(ax, bx, j / 4), lerp(az, bz, j / 4)); mn = Math.min(mn, g); mx = Math.max(mx, g); }
        const top = mx + 5.8, bot = mn - 1.6, mx2 = (ax + bx) / 2, mz2 = (az + bz) / 2;
        let nx = mx2 - cx, nz = mz2 - cz; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
        TW.put('wallS', GEO.box, MAT.inst, mx2, (top + bot) / 2, mz2, ry, l + 0.3, top - bot, 1.8, rpick(['#b8ad98', '#ada290', '#c2b8a2', '#b2a690']));
        TW.put('wallS', GEO.box, MAT.inst, mx2, top + 0.1, mz2, ry, l + 0.35, 0.22, 2.1, '#978d7b');
        const nm = Math.max(1, Math.floor(l / 1.4));
        for (let m = 0; m < nm; m++) { const f = (m + 0.5) / nm; TW.put('wallS', GEO.box, MAT.inst, lerp(ax, bx, f) + nx * 0.78, top + 0.6, lerp(az, bz, f) + nz * 0.78, ry, 0.7, 0.8, 0.45, '#a89e8a'); }
        for (let j = 0; j <= Math.ceil(l / 2); j++) { const f = j / Math.ceil(l / 2); COLL.push({ x: lerp(ax, bx, f), z: lerp(az, bz, f), r: 1.25 }); }
      }
    };
    const tower = (x, z, r, h, roofC, flagK) => {
      const g = groundAt(x, z); let mn = g; for (let a = 0; a < 6; a++) mn = Math.min(mn, groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
      TW.put('tower', GEO.cyl12, MAT.inst, x, (g + h + mn - 1.6) / 2, z, 0, r, g + h - mn + 1.6, r, '#c3b8a2');
      TW.put('tower', GEO.cyl12, MAT.inst, x, g + h + 0.2, z, 0, r + 0.4, 0.55, r + 0.4, '#9a907e');
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; TW.put('wallS', GEO.box, MAT.inst, x + Math.cos(a) * (r + 0.15), g + h + 0.85, z + Math.sin(a) * (r + 0.15), Math.atan2(-Math.cos(a), -Math.sin(a)), 0.6, 0.8, 0.45, '#a89e8a'); }
      TW.put('roof', GEO.cone12, MAT.inst, x, g + h + 0.55 + r * 0.95, z, 0, r + 0.7, r * 1.9, r + 0.7, roofC || '#34446e');
      const ang = Math.atan2(z - cz, x - cx);
      for (const da of [0, PI]) { const a = ang + da; TW.put('win', GEO.box, MAT.win, x + Math.cos(a) * r, g + h * 0.62, z + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a)), 0.4, 1.0, 0.2, null, 0, 0, true); }
      if (flagK) flag(TW, x, g + h + r * 1.9 + 2.3, z, rr(0, TAU), 1.1, flagK, 1.8);
      COLL.push({ x, z, r: r + 0.25 });
    };
    for (let i = 0; i < N - 1; i++) wallPiece(verts[i][0], verts[i][1], verts[i + 1][0], verts[i + 1][1]);
    const M = at(gateA, R * Math.cos(PI / N)), tg = [1, 0], GW = 5.2;
    const gL = [M[0] - tg[0] * GW, M[1] - tg[1] * GW], gR = [M[0] + tg[0] * GW, M[1] + tg[1] * GW];
    wallPiece(verts[N - 1][0], verts[N - 1][1], gL[0] - 2.8, gL[1]);
    wallPiece(gR[0] + 2.8, gR[1], verts[0][0], verts[0][1]);
    verts.forEach((v, i) => tower(v[0], v[1], 2.5, 8.4, i % 2 ? '#34446e' : '#7a3030', i % 3 === 0 ? 'nation' : null));
    for (const p of [gL, gR]) tower(p[0], p[1], 3, 11, '#34446e', 'nation');
    {
      const g = groundAt(M[0], M[1]);
      TW.put('wallS', GEO.box, MAT.inst, M[0], g + 8.3, M[1], 0, GW * 2 - 2, 3.4, 2.6, '#bcb19c');
      for (let m = 0; m < 6; m++) TW.put('wallS', GEO.box, MAT.inst, M[0] - 3.6 + m * 1.45, g + 10.4, M[1] - 1.1, 0, 0.7, 0.8, 0.45, '#a89e8a');
      for (let b = 0; b < 6; b++) TW.put('iron', GEO.box, MAT.metal, M[0] - 2.5 + b, g + 6.1, M[1], 0, 0.1, 1.6, 0.1, '#2a2a30');
      TW.put('iron', GEO.box, MAT.metal, M[0], g + 5.5, M[1], 0, 5.4, 0.12, 0.12, '#2a2a30');
      banner(TW, M[0] - 2.2, g + 9.6, M[1] - 1.35, PI, 1.5, 'nation');
      banner(TW, M[0] + 2.2, g + 9.6, M[1] - 1.35, PI, 1.5, 'nation');
      lampPost(TW, M[0] - 4.2, M[1] - 3, 0); lampPost(TW, M[0] + 4.2, M[1] - 3, 0);
      SPOT.gate = { x: M[0], z: M[1] };
    }
    // --- palace (front faces north, toward the plaza)
    {
      const PF = new Frame(cx, cz + 45, PI), [mn, mx] = footMinMax(PF, 28, 20), base = mx + 0.5;
      TW.put('stone', GEO.box, MAT.inst, cx, (base + mn - 1.6) / 2, cz + 45, PI, 28, base - mn + 1.6, 18, '#b8ad98');
      TW.put('palace', GEO.box, MAT.inst, cx, base + 4.5, cz + 45, PI, 24, 9, 12, '#ece4d2');
      TW.put('palace', GEO.box, MAT.inst, cx, base + 9.1, cz + 45, PI, 24.4, 0.3, 12.4, '#cfc3a5');
      TW.put('roof', GEO.prism, MAT.inst, cx, base + 9.2, cz + 45, PI, 25, 4.6, 13, '#2b3a6b');
      TW.put('palace', GEO.box, MAT.inst, PF.wx(0, -3.5), base + 8.5, PF.wz(0, -3.5), PI, 10, 17, 8, '#f2ead8');
      TW.put('roof', GEO.cone4, MAT.inst, PF.wx(0, -3.5), base + 20.5, PF.wz(0, -3.5), PI + PI / 4, 8.4, 7, 7.4, '#2b3a6b');
      TW.put('gold', GEO.cone6, MAT.metal, PF.wx(0, -3.5), base + 25.2, PF.wz(0, -3.5), 0, 0.35, 2.4, 0.35, '#e6c25a');
      flag(TW, PF.wx(0, -3.5), base + 28.8, PF.wz(0, -3.5), 0.6, 1.8, 'nation', 3.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const tx = PF.wx(sx * 12, sz * 6.5), tz = PF.wz(sx * 12, sz * 6.5);
        TW.put('palace', GEO.cyl12, MAT.inst, tx, (base + 15 + mn - 1.6) / 2, tz, 0, 2.4, base + 15 - mn + 1.6, 2.4, '#ece4d2');
        TW.put('palace', GEO.cyl12, MAT.inst, tx, base + 15.2, tz, 0, 2.75, 0.5, 2.75, '#cfc3a5');
        TW.put('roof', GEO.cone12, MAT.inst, tx, base + 18.1, tz, 0, 3.0, 5.4, 3.0, '#2b3a6b');
        TW.put('gold', GEO.cone6, MAT.metal, tx, base + 21.2, tz, 0, 0.2, 1.2, 0.2, '#e6c25a');
        flag(TW, tx, base + 23.6, tz, rr(0, 6), 1.2, 'nation', 2.4);
        for (const y of [5, 9.5, 13]) TW.put('win', GEO.box, MAT.win, PF.wx(sx * 12, sz * 6.5 + 2.4), base + y, PF.wz(sx * 12, sz * 6.5 + 2.4), PI, 0.55, 1.3, 0.2, null, 0, 0, true);
        COLL.push({ x: tx, z: tz, r: 2.7 });
      }
      for (const y of [3, 6.6]) for (const lx of [-10, -7.8, 7.8, 10]) windowAt(TW, PF, lx, base + y, 6.02, 0, true);
      for (const y of [11.5, 14.5]) for (const lx of [-2.6, 0, 2.6]) windowAt(TW, PF, lx, base + y, 0.52, 0, true);
      for (let i = 0; i < 6; i++) { const lx = -5 + i * 2; TW.put('palace', GEO.cyl12, MAT.inst, PF.wx(lx, 7.6), base + 3, PF.wz(lx, 7.6), 0, 0.42, 6, 0.42, '#f6f0e2'); COLL.push({ x: PF.wx(lx, 7.6), z: PF.wz(lx, 7.6), r: 0.5 }); }
      TW.put('palace', GEO.box, MAT.inst, PF.wx(0, 7.4), base + 6.3, PF.wz(0, 7.4), PI, 12.6, 0.7, 2.2, '#e0d6c0');
      TW.put('roof', GEO.prism, MAT.inst, PF.wx(0, 7.4), base + 6.65, PF.wz(0, 7.4), PI + PI / 2, 2.4, 1.9, 13, '#2b3a6b');
      TW.put('door', GEO.box, MAT.inst, PF.wx(0, 6.05), base + 2.4, PF.wz(0, 6.05), PI, 3.0, 4.8, 0.2, '#4a2a1a');
      TW.put('gold', GEO.box, MAT.metal, PF.wx(0, 6.12), base + 4.9, PF.wz(0, 6.12), PI, 3.4, 0.3, 0.2, '#e6c25a');
      TW.put('gold', GEO.box, MAT.metal, PF.wx(0, 6.14), base + 2.4, PF.wz(0, 6.14), PI, 0.12, 4.6, 0.12, '#e6c25a');
      const gF = groundAt(PF.wx(0, 11), PF.wz(0, 11)), steps = Math.max(2, Math.ceil((base - gF + 0.3) / 0.32));
      for (let k = 0; k < steps; k++) { const top = base - (k + 1) * (base - gF + 0.2) / steps; TW.put('stone', GEO.box, MAT.inst, PF.wx(0, 9.3 + k * 0.7), (top + gF - 1) / 2 + 0.16, PF.wz(0, 9.3 + k * 0.7), PI, 12 - k * 0.3, top - gF + 1.3, 0.75, k % 2 ? '#c9bea6' : '#d4c9b0'); }
      for (const lx of [-8.5, 8.5, -11.3, 11.3]) banner(TW, PF.wx(lx, 6.1), base + 8.6, PF.wz(lx, 6.1), PI, 1.6, 'nation');
      collRect(PF, 25, 13); collRect(new Frame(PF.wx(0, -3.5), PF.wz(0, -3.5), PI), 10.5, 8.5);
      SPOT.palace = { x: PF.wx(0, 10.5), z: PF.wz(0, 10.5), base };
    }
    // --- plaza: fountain with the statue of the Slime Sovereign
    {
      const g0 = groundAt(cx, cz), stoneM = lam('#c9bea6'), grp = new T.Group(); grp.position.set(cx, g0, cz); TW.group.add(grp);
      const add = (geo, mat, y, sx, sy, sz) => { const m = new T.Mesh(geo, mat); m.position.y = y; m.scale.set(sx, sy, sz); m.castShadow = !LOW; m.receiveShadow = true; grp.add(m); return m; };
      add(GEO.cyl12, stoneM, -0.3, 3.75, 1.5, 3.75);
      add(new T.CylinderGeometry(3.75, 3.75, 0.5, 24, 1, true), lam('#b8ad98'), 0.7, 1, 1, 1).material.side = T.DoubleSide;
      const rim = add(new T.RingGeometry(3.3, 3.95, 28), lam('#ddd2b8'), 0.96, 1, 1, 1); rim.rotation.x = -PI / 2; rim.material.side = T.DoubleSide;
      const w1 = add(new T.CircleGeometry(3.32, 28), MAT.water, 0.72, 1, 1, 1); w1.rotation.x = -PI / 2;
      add(GEO.cyl12, stoneM, 1.75, 0.5, 2.2, 0.5);
      add(new T.CylinderGeometry(1.45, 0.45, 0.55, 16), stoneM, 2.95, 1, 1, 1);
      const w2 = add(new T.CircleGeometry(1.3, 18), MAT.water, 3.2, 1, 1, 1); w2.rotation.x = -PI / 2;
      const statue = new T.Group(); statue.position.y = 3.55; grp.add(statue);
      const sm = new T.Mesh(GEO.sph, std('#7fd8ff', 0.15, 0.1, { emissive: hdr('#1a6a9a', 0.25) })); sm.scale.set(0.62, 0.5, 0.62); sm.position.y = 0.25; sm.castShadow = !LOW; statue.add(sm);
      for (const sx of [-1, 1]) { const e = new T.Mesh(GEO.sphLo, lam('#10141f')); e.scale.set(0.07, 0.11, 0.05); e.position.set(sx * 0.2, 0.33, 0.55); statue.add(e); }
      const cr = new T.Mesh(new T.CylinderGeometry(0.3, 0.34, 0.16, 8, 1, true), std('#ffcf40', 0.25, 0.9)); cr.position.y = 0.78; cr.material.side = T.DoubleSide; statue.add(cr);
      for (let i = 0; i < 5; i++) { const sp = new T.Mesh(GEO.cone4, cr.material); const a = i / 5 * TAU; sp.position.set(Math.cos(a) * 0.3, 0.92, Math.sin(a) * 0.3); sp.scale.set(0.06, 0.18, 0.06); statue.add(sp); }
      const ripples = [];
      for (let i = 0; i < 3; i++) { const r = new T.Mesh(new T.RingGeometry(0.85, 1, 32), MAT.add('#bff3ff', 0.9, 0.5)); r.rotation.x = -PI / 2; r.position.y = 0.75; grp.add(r); ripples.push({ m: r, t: i / 3 }); }
      TW.fountain = { x: cx, y: g0, z: cz, ripples, statue };
      COLL.push({ x: cx, z: cz, r: 4.0 });
      SPOT.fountain = { x: cx, z: cz };
    }
    // --- market stalls around the fountain
    const AWN = [['#c62828', '#f5f5f5'], ['#1565c0', '#fff8e1'], ['#2e7d32', '#fffde7'], ['#f9a825', '#5d4037'], ['#6a1b9a', '#f3e5f5'], ['#d84315', '#fff3e0'], ['#00838f', '#e0f7fa'], ['#ad1457', '#fce4ec']];
    TW.stalls = [];
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) * PI / 4, [x, z] = at(a, 10.6); TW.stalls.push({ a, F: stall(TW, x, z, faceC(a), AWN[k][0], AWN[k][1]) }); }
    // benches & flower beds around the plaza
    for (let k = 0; k < 8; k++) {
      const a = k * PI / 4 + PI / 8 + 0.16, [x, z] = at(a, 17.4); bush(TW, x, z, 1.1, rpick(['#ff5a7a', '#ffd23f', '#c77dff', '#ffffff', '#ff8a3d']));
      const [lx, lz] = at(k * PI / 4 + PI / 8 - 0.12, 16.8); lampPost(TW, lx, lz, 0);
    }
    // --- tavern & blacksmith
    {
      const a = -PI / 2 + PI / 8, [x, z] = at(a, 23.5), ry = faceC(a);
      const H = house(TW, x, z, ry, 9.5, 7, 6.4, { wall: '#ead2a8', roof: '#7a3b2a', door: '#6b3a1a', chimney: false, flowers: false });
      const F = H.F;
      TW.put('stone', GEO.box, MAT.inst, F.wx(3.2, -1), H.base + 6.4 + 2.4, F.wz(3.2, -1), ry, 0.8, 3.0, 0.8, '#7a7066');
      TW.smokes.push({ x: F.wx(3.2, -1), y: H.base + 10.4, z: F.wz(3.2, -1) });
      TW.put('beam', GEO.box, MAT.inst, F.wx(-3.3, 4.3), H.base + 3.4, F.wz(-3.3, 4.3), ry, 0.12, 0.12, 1.6, DARKWOOD);
      sign(TW, F.wx(-3.3, 4.9), H.base + 2.7, F.wz(-3.3, 4.9), ry + PI / 2, 'LOCANDA', '🍺');
      for (const sx of [-1.3, 1.3]) { TW.put('lantern', GEO.box, MAT.lamp, F.wx(sx, 3.75), H.base + 2.5, F.wz(sx, 3.75), ry, 0.28, 0.38, 0.28, null, 0, 0, true); TW.halos.push({ x: F.wx(sx, 3.75), y: H.base + 2.5, z: F.wz(sx, 3.75), s: 2.6, c: '#ffb35a' }); }
      barrel(TW, F.wx(2.8, 4.6), F.wz(2.8, 4.6), 1); barrel(TW, F.wx(3.7, 4.2), F.wz(3.7, 4.2), 1); barrel(TW, F.wx(3.2, 4.4), F.wz(3.2, 4.4), 0.8);
      const bx = F.wx(-1.8, 5.1), bz = F.wz(-1.8, 5.1), bg = groundAt(bx, bz);
      TW.put('wood', GEO.box, MAT.inst, bx, bg + 0.45, bz, ry, 1.8, 0.1, 0.5, '#7a5232'); for (const sx of [-0.75, 0.75]) TW.put('wood', GEO.box, MAT.inst, F.wx(-1.8 + sx, 5.1), bg + 0.22, F.wz(-1.8 + sx, 5.1), ry, 0.1, 0.45, 0.45, '#5a3e2a');
      SPOT.tavern = { x: F.wx(0.9, 5.3), z: F.wz(0.9, 5.3), ry };
    }
    {
      const a = -PI / 2 - PI / 8, [x, z] = at(a, 23.5), ry = faceC(a), F = new Frame(x, z, ry), [mn, mx] = footMinMax(F, 8, 6.5), base = mx + 0.15;
      TW.put('stone', GEO.box, MAT.inst, x, (base + mn - 1) / 2, z, ry, 8.2, base - mn + 1, 6.6, '#8a8276');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) TW.put('beam', GEO.box, MAT.inst, F.wx(sx * 3.7, sz * 2.8), base + 1.8, F.wz(sx * 3.7, sz * 2.8), ry, 0.35, 3.6, 0.35, DARKWOOD);
      TW.put('wall', GEO.box, MAT.inst, F.wx(0, -2.9), base + 1.5, F.wz(0, -2.9), ry, 7.4, 3, 0.4, '#a89c88');
      TW.put('roof', GEO.prism, MAT.inst, x, base + 3.6, z, ry, 8.8, 2.4, 7.4, '#5a4a3a');
      TW.put('stone', GEO.box, MAT.inst, F.wx(-2.4, -1.6), base + 0.7, F.wz(-2.4, -1.6), ry, 2.2, 1.4, 1.8, '#6e665c');
      TW.put('glowI', GEO.box, MAT.glow, F.wx(-2.4, -1.5), base + 1.42, F.wz(-2.4, -1.5), ry, 1.7, 0.1, 1.3, hdr('#ff5a1a', 2.8), 0, 0, true);
      TW.put('stone', GEO.box, MAT.inst, F.wx(-2.4, -2.1), base + 4.4, F.wz(-2.4, -2.1), ry, 1.0, 4.6, 1.0, '#6e665c');
      TW.smokes.push({ x: F.wx(-2.4, -2.1), y: base + 7, z: F.wz(-2.4, -2.1) });
      fire(TW, F.wx(-2.4, -1.4), F.wz(-2.4, -1.4), base + 1.42, 0.55, false);
      const ax = F.wx(0.9, 0.8), az = F.wz(0.9, 0.8);
      TW.put('iron', GEO.box, MAT.metal, ax, base + 0.35, az, ry, 0.5, 0.7, 0.5, '#2e2e34');
      TW.put('iron', GEO.box, MAT.metal, ax, base + 0.8, az, ry, 1.0, 0.25, 0.45, '#4a4c56');
      TW.put('iron', GEO.cone4, MAT.metal, F.wx(1.55, 0.8), base + 0.8, F.wz(1.55, 0.8), ry, 0.18, 0.4, 0.18, '#4a4c56', 0, -PI / 2);
      TW.sparks.push({ x: ax, y: base + 1.0, z: az });
      for (let i = 0; i < 5; i++) { TW.put('iron', GEO.box, MAT.metal, F.wx(1 + i * 0.45, -2.55), base + 1.5, F.wz(1 + i * 0.45, -2.55), ry, 0.08, 1.4, 0.04, '#c9ced8', 0.05); TW.put('gold', GEO.box, MAT.metal, F.wx(1 + i * 0.45, -2.55), base + 0.75, F.wz(1 + i * 0.45, -2.55), ry, 0.26, 0.05, 0.08, '#c9a24a'); }
      TW.put('wood', GEO.box, MAT.inst, F.wx(1.9, -2.6), base + 2.25, F.wz(1.9, -2.6), ry, 2.6, 0.12, 0.2, '#5a3e2a');
      barrel(TW, F.wx(3.0, 1.6), F.wz(3.0, 1.6), 0.9);
      TW.put('stone', GEO.cyl12, MAT.inst, F.wx(-3.0, 1.9), base + 0.65, F.wz(-3.0, 1.9), ry, 0.6, 0.18, 0.6, '#9a948a', 0, PI / 2);
      sign(TW, F.wx(3.95, 3.0), base + 2.6, F.wz(3.95, 3.0), ry, 'FUCINA', '⚒');
      collRect(new Frame(F.wx(-2.4, -1.6), F.wz(-2.4, -1.6), ry), 2.4, 2.0); collRect(new Frame(F.wx(0, -2.9), F.wz(0, -2.9), ry), 7.6, 0.6);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) COLL.push({ x: F.wx(sx * 3.7, sz * 2.8), z: F.wz(sx * 3.7, sz * 2.8), r: 0.35 });
      COLL.push({ x: ax, z: az, r: 0.55 });
      TW.foot.push({ x, z, r: 5.5 });
      SPOT.smith = { x: F.wx(0.9, 1.75), z: F.wz(0.9, 1.75), ry: ry + PI };
    }
    // --- houses: inner ring + two outer rows
    for (const a of [-PI / 8, PI / 8, PI - PI / 8, PI + PI / 8]) { const [x, z] = at(a, 22.5); house(TW, x, z, faceC(a), rr(5.6, 6.6), rr(4.8, 5.6), rr(3.4, 4.2)); }
    let houses = 6;
    for (const [rad, step, off] of [[41.5, 10.2, 0], [53, 11.6, 0.5]]) {
      const n = Math.floor(TAU * rad / step);
      for (let i = 0; i < n; i++) {
        const a = (i + off) / n * TAU - PI;
        if (Math.abs(angDiff(a, -PI / 2)) < 0.17 || Math.abs(angDiff(a, PI / 2)) < 0.62) continue;
        const [x, z] = at(a, rad + rr(-0.8, 0.8)), w = rr(5, 7), d = rr(4.4, 5.8), two = rnd() < 0.25;
        if (TW.foot.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + Math.max(w, d) * 0.62)) continue;
        if (rnd() < 0.1) { tree(TW, x, z, rr(1, 1.3)); continue; }
        house(TW, x, z, faceC(a) + rr(-0.08, 0.08), w, d, two ? rr(5.8, 6.4) : rr(3.2, 4.3));
        houses++;
      }
    }
    TW.houses = houses;
    // --- lamps along avenue and ring road, palace square
    for (let z = cz - R + 8; z < cz - 16; z += 10) for (const sx of [-1, 1]) lampPost(TW, cx + sx * 3.7, z, 0);
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.11; if (Math.abs(angDiff(a, PI / 2)) < 0.3) continue; const [x, z] = at(a, 32.6); lampPost(TW, x, z, 0); }
    for (const sx of [-1, 1]) for (const dz of [20, 33]) lampPost(TW, cx + sx * 9.6, cz + dz, 0);
    // --- wedding arch on the palace square
    {
      const ax = cx, az = cz + 25.5, g = groundAt(ax, az);
      for (const sx of [-1, 1]) { TW.put('palace', GEO.cyl12, MAT.inst, ax + sx * 1.9, g + 1.5, az, 0, 0.16, 3.0, 0.16, '#f6f0e2'); COLL.push({ x: ax + sx * 1.9, z: az, r: 0.25 }); }
      for (let i = 0; i <= 10; i++) {
        const t = i / 10 * PI, x = ax - Math.cos(t) * 1.9, y = g + 3.0 + Math.sin(t) * 1.4;
        TW.put('palace', GEO.box, MAT.inst, x, y, az, 0, 0.42, 0.22, 0.22, '#f6f0e2', 0, -(t - PI / 2) * 0.9);
        for (let k = 0; k < 2; k++) TW.put('flower', GEO.sphLo, MAT.inst, x + rr(-0.15, 0.15), y + rr(-0.12, 0.2), az + (k ? 0.18 : -0.18), 0, 0.15, 0.15, 0.15, rpick(['#ffb3c8', '#ffffff', '#ff7aa2', '#ffe082']), 0, 0, true);
      }
      SPOT.altar = { x: ax, z: az };
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) bush(TW, cx + sx * (6.5 + k * 1.6), cz + 34.5, 0.9, sx > 0 ? '#d81b60' : '#ffffff');
      const bx = cx + 8.8, bz = cz + 31.5, bg = groundAt(bx, bz);
      TW.put('wood', GEO.box, MAT.inst, bx, bg + 0.46, bz, PI / 2, 2.0, 0.1, 0.55, '#3a2a30'); TW.put('wood', GEO.box, MAT.inst, bx + 0.3, bg + 0.85, bz, PI / 2, 2.0, 0.7, 0.08, '#3a2a30');
    }
    // --- companion corners
    {
      const S0 = SPOT.aurelia; disc(TW, S0.x, S0.z, 6, ['#c8b48a', '#bfa97e', '#d2bf96'], null, 0.1);
      const F = new Frame(S0.x, S0.z, S0.ry);
      for (const lx of [-3, 0, 3]) { const x = F.wx(lx, -3.4), z = F.wz(lx, -3.4), g = groundAt(x, z); TW.put('wood', GEO.cyl6, MAT.inst, x, g + 0.9, z, 0, 0.1, 1.8, 0.1, '#6b4a2a'); TW.put('wood', GEO.cyl6, MAT.inst, x, g + 1.5, z, S0.ry, 0.07, 1.2, 0.07, '#6b4a2a', 0, PI / 2); TW.put('cloth', GEO.sph, MAT.inst, x, g + 1.3, z, 0, 0.32, 0.42, 0.3, '#c9a86a'); TW.put('cloth', GEO.sph, MAT.inst, x, g + 2.0, z, 0, 0.2, 0.22, 0.2, '#c9a86a'); COLL.push({ x, z, r: 0.4 }); }
      const rx = F.wx(4.2, 1), rz = F.wz(4.2, 1), rg = groundAt(rx, rz);
      TW.put('wood', GEO.box, MAT.inst, rx, rg + 1.0, rz, S0.ry + PI / 2, 2, 0.12, 0.12, '#5a3e2a');
      for (let i = 0; i < 4; i++) TW.put('iron', GEO.box, MAT.metal, F.wx(4.2, 0.25 + i * 0.5), rg + 0.9, F.wz(4.2, 0.25 + i * 0.5), S0.ry, 0.06, 1.6, 0.03, '#c9ced8', 0.12);
      flag(TW, F.wx(-4.5, 2), groundAt(F.wx(-4.5, 2), F.wz(-4.5, 2)) + 4.2, F.wz(-4.5, 2), S0.ry, 1, 'crimson', 4.2);
    }
    {
      const S0 = SPOT.lyra, F = new Frame(S0.x, S0.z, S0.ry);
      disc(TW, S0.x, S0.z, 5.5, ['#7d9a46', '#87a34f'], null, 0.1);
      for (const lx of [-3, 0, 3]) {
        const x = F.wx(lx, -4.2), z = F.wz(lx, -4.2), g = groundAt(x, z);
        TW.put('wood', GEO.box, MAT.inst, x, g + 0.7, z + 0.2, S0.ry, 0.1, 1.4, 0.1, '#6b4a2a', -0.3);
        [['#f5f5f5', 0.7], ['#e53935', 0.55], ['#1e88e5', 0.4], ['#ffd23f', 0.22]].forEach(([c, r], i) => TW.put('target', GEO.cyl12, MAT.inst, x, g + 1.3, z, S0.ry, r, 0.08 + i * 0.02, r, c, PI / 2 - 0.25));
        COLL.push({ x, z, r: 0.6 });
      }
      for (const lx of [-4.6, 4.6]) { const x = F.wx(lx, 1.5), z = F.wz(lx, 1.5), g = groundAt(x, z); TW.put('hay', GEO.cyl12, MAT.inst, x, g + 0.45, z, S0.ry, 0.55, 1.1, 0.55, '#d8b45a', 0, PI / 2); COLL.push({ x, z, r: 0.7 }); }
    }
    {
      const S0 = SPOT.kiara, F = new Frame(S0.x, S0.z, S0.ry);
      disc(TW, S0.x, S0.z, 5.5, ['#9a917e', '#a59c88'], null, 0.1);
      const tx = F.wx(0, -3.2), tz = F.wz(0, -3.2), tgnd = groundAt(tx, tz);
      for (const sx of [-1.6, 1.6]) { TW.put('torii', GEO.cyl12, MAT.inst, F.wx(sx, -3.2), tgnd + 1.9, F.wz(sx, -3.2), 0, 0.2, 3.8, 0.2, '#d32f2f'); COLL.push({ x: F.wx(sx, -3.2), z: F.wz(sx, -3.2), r: 0.3 }); }
      TW.put('torii', GEO.box, MAT.inst, tx, tgnd + 3.95, tz, S0.ry, 4.6, 0.3, 0.42, '#1a1a1a');
      TW.put('torii', GEO.box, MAT.inst, tx, tgnd + 3.3, tz, S0.ry, 3.8, 0.22, 0.3, '#d32f2f');
      for (const sx of [-2.6, 2.6]) {
        const x = F.wx(sx, -1), z = F.wz(sx, -1), g = groundAt(x, z);
        TW.put('stone', GEO.box, MAT.inst, x, g + 0.35, z, S0.ry, 0.6, 0.7, 0.6, '#a39b8e');
        TW.put('stone', GEO.box, MAT.inst, x, g + 1.05, z, S0.ry, 0.5, 0.7, 0.5, '#b3ab9e');
        TW.put('fox', GEO.cone4, MAT.inst, x, g + 1.7, z, S0.ry + PI / 4, 0.25, 0.6, 0.25, '#f2efe8');
        TW.put('glowI', GEO.box, MAT.glow, x, g + 1.05, z, S0.ry, 0.3, 0.3, 0.52, hdr('#ff9a3c', 2.2), 0, 0, true);
        TW.halos.push({ x, y: g + 1.05, z, s: 2.4, c: '#ff9a3c' });
        COLL.push({ x, z, r: 0.45 });
      }
      const ox = F.wx(0, -4.4), oz = F.wz(0, -4.4), og = groundAt(ox, oz);
      TW.put('wood', GEO.box, MAT.inst, ox, og + 0.45, oz, S0.ry, 1.2, 0.9, 0.7, '#8a3a24');
      TW.put('roof', GEO.prism, MAT.inst, ox, og + 0.9, oz, S0.ry, 1.5, 0.5, 1.0, '#2a2a2a');
    }
    {
      const S0 = SPOT.selene, F = new Frame(S0.x, S0.z, S0.ry);
      disc(TW, S0.x, S0.z, 5.5, ['#6e6880', '#7a748c', '#655f78'], { 3: '#9f7bff' }, 0.1);
      const ox = F.wx(0, -3.4), oz = F.wz(0, -3.4), og = groundAt(ox, oz);
      TW.put('obelisk', GEO.box, MAT.inst, ox, og + 2.2, oz, S0.ry, 1.0, 4.4, 1.0, '#2a2438');
      TW.put('obelisk', GEO.cone4, MAT.inst, ox, og + 4.75, oz, S0.ry + PI / 4, 0.72, 0.7, 0.72, '#2a2438');
      for (let i = 0; i < 6; i++) TW.put('glowI', GEO.box, MAT.glow, F.wx((i % 2 ? 0.18 : -0.18), -2.89), og + 0.8 + i * 0.6, F.wz((i % 2 ? 0.18 : -0.18), -2.89), S0.ry, 0.28, 0.12, 0.04, hdr('#7df9ff', 2.6), 0, 0, true);
      COLL.push({ x: ox, z: oz, r: 0.8 });
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, x = S0.x + Math.cos(a) * 5, z = S0.z + Math.sin(a) * 5, g = groundAt(x, z); if (i === 2 || i === 3) continue; TW.put('stone', GEO.box, MAT.inst, x, g + 0.6, z, a, 0.5, 1.2 + (i % 3) * 0.3, 0.4, '#8a8496'); COLL.push({ x, z, r: 0.4 }); }
      const crystals = [];
      for (let i = 0; i < 3; i++) { const m = new T.Mesh(GEO.oct, MAT.add('#b388ff', 2.4, 0.9)); m.scale.set(0.22, 0.4, 0.22); TW.group.add(m); crystals.push(m); }
      TW.anims.push({ k: 'crystals', list: crystals, x: ox, y: og + 5.6, z: oz });
    }
    // --- trees and bushes inside the walls, some outside
    let trees = 0;
    for (let t = 0; t < 260 && trees < 30; t++) {
      const a = rr(-PI, PI), rad = rr(34, 60), [x, z] = at(a, rad);
      if (Math.abs(rad - 30) < 3.5 || (Math.abs(x - cx) < 5 && z < cz)) continue;
      if (TW.foot.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 2)) continue;
      if (rnd() < 0.35) bush(TW, x, z, rr(0.8, 1.2), rnd() < 0.5 ? rpick(['#ff5a7a', '#ffd23f', '#c77dff', '#ffffff']) : null); else tree(TW, x, z, rr(0.9, 1.3));
      trees++;
    }
    for (let t = 0; t < 80; t++) { const a = rr(-PI, PI), rad = rr(70, 92), [x, z] = at(a, rad); if (Math.abs(angDiff(a, -PI / 2)) < 0.18) continue; if (rnd() < 0.5) tree(TW, x, z, rr(1, 1.5)); }
    TW.done();
    // villager road graph
    const nodes = [];
    const addN = (x, z) => { nodes.push({ x, z, n: [] }); return nodes.length - 1; };
    const link = (a, b) => { nodes[a].n.push(b); nodes[b].n.push(a); };
    const plaza = [], ringN = [];
    for (let k = 0; k < 8; k++) plaza.push(addN(...at(k * PI / 4, 14.2)));
    for (let k = 0; k < 16; k++) ringN.push(addN(...at(k * PI / 8, 30)));
    for (let k = 0; k < 8; k++) link(plaza[k], plaza[(k + 1) % 8]);
    for (let k = 0; k < 16; k++) link(ringN[k], ringN[(k + 1) % 16]);
    for (const k of [0, 2, 4, 6]) link(plaza[k], ringN[k * 2]);
    const av1 = addN(cx, cz - 40), av2 = addN(cx, cz - 52); link(ringN[12], av1); link(av1, av2);
    link(ringN[0], addN(...at(0, 38.5))); link(ringN[8], addN(...at(PI, 38.5)));
    TW.nodes = nodes;
    return TW;
  }

  /* ============================================================ VILLAGES */
  function ringNodes(TW, r, n) {
    const nodes = [];
    for (let i = 0; i < n; i++) { const [x, z] = at(i / n * TAU, r, TW); nodes.push({ x, z, n: [(i + n - 1) % n, (i + 1) % n] }); }
    TW.nodes = nodes;
  }
  const GOB = { x: -45, z: 75 }, DEN = { x: -200, z: 100 };
  function buildGoblinVillage() {
    const TW = new Town('goblin', 'Villaggio Goblin', GOB.x, GOB.z, 26, '#9dff6a'), cx = GOB.x, cz = GOB.z;
    disc(TW, cx, cz, 9.5, ['#8a7148', '#7d6640', '#957a4e'], null, 0.1);
    const gates = [Math.atan2(VAL.z - cz, VAL.x - cx), Math.atan2(-cz, -cx)];
    for (const ga of gates) { const [x1, z1] = at(ga, 9, TW), [x2, z2] = at(ga, 32, TW); ribbon(TW, [[x1, z1], [x2, z2]], 2.6, ['#8a7148', '#7d6640'], false, 0.09); }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * TAU + 0.45, rad = 14 + rr(-0.6, 1.4), [x, z] = at(a, rad, TW);
      if (gates.some((g) => Math.abs(angDiff(a, g)) < 0.3)) continue;
      hut(TW, x, z, rr(2.3, 2.8), rr(2.0, 2.5), faceC(a));
    }
    fire(TW, cx, cz, null, 1.3, true);
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.15, [x, z] = at(a, 8.6, TW); totem(TW, x, z, faceC(a)); }
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * TAU; if (gates.some((g) => Math.abs(angDiff(a, g)) < 0.16)) continue;
      const [x, z] = at(a, 20.5 + Math.sin(i * 1.7) * 0.3, TW), g = groundAt(x, z);
      TW.put('stake', GEO.cone6, MAT.inst, x, g + 1.0, z, a, 0.2, 2.6 + (i % 3) * 0.3, 0.2, i % 2 ? '#6e4a2c' : '#7d5634', 0, Math.sin(i) * 0.08);
      if (i % 2 === 0) COLL.push({ x, z, r: 0.5 });
    }
    for (const ga of gates) for (const s of [-1, 1]) {
      const [x, z] = at(ga + s * 0.19, 20.8, TW), g = groundAt(x, z);
      TW.put('wood', GEO.cyl6, MAT.inst, x, g + 1.4, z, 0, 0.12, 2.8, 0.12, '#4a3424');
      fire(TW, x, z, g + 2.9, 0.4, false);
      COLL.push({ x, z, r: 0.3 });
    }
    for (let i = 0; i < 10; i++) { const a = rr(0, TAU), [x, z] = at(a, rr(16.5, 18.5), TW); if (TW.foot.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.6)) continue; const g = groundAt(x, z); TW.put('pot', GEO.sph, MAT.inst, x, g + 0.3, z, 0, 0.35, 0.4, 0.35, rpick(['#8a5a3a', '#7a4a2a', '#a0703a'])); }
    for (let i = 0; i < 2; i++) { const a = i * PI + 1.1, [x, z] = at(a, 17.5, TW), g = groundAt(x, z), ry = faceC(a);
      for (const sx of [-1, 1]) TW.put('wood', GEO.cyl6, MAT.inst, x + Math.cos(ry) * sx * 0.9, g + 0.9, z - Math.sin(ry) * sx * 0.9, 0, 0.07, 1.8, 0.07, '#5a3e2a');
      TW.put('wood', GEO.cyl6, MAT.inst, x, g + 1.75, z, ry, 0.05, 2.0, 0.05, '#5a3e2a', 0, PI / 2);
      for (let k = 0; k < 3; k++) TW.put('cloth', GEO.box, MAT.inst, x + Math.cos(ry) * (k - 1) * 0.55, g + 1.35, z - Math.sin(ry) * (k - 1) * 0.55, ry, 0.35, 0.7, 0.05, rpick(['#a0522d', '#c9a24a', '#6b8e23'])); }
    flag(TW, cx + 3, groundAt(cx + 3, cz - 5) + 5, cz - 5, 0, 1, 'goblin', 5);
    TW.done(); ringNodes(TW, 5.6, 8);
    return TW;
  }
  function buildWolfDen() {
    const TW = new Town('den', 'Tana dei Lupi', DEN.x, DEN.z, 16, '#8ec5ff'), cx = DEN.x, cz = DEN.z;
    disc(TW, cx, cz, 7, ['#6e6450', '#7a6e58', '#665c48'], null, 0.1);
    for (let i = 0; i < 14; i++) {
      const a = PI + 0.4 + i / 13 * (PI - 0.8) * 1.2, rad = 9 + (i % 3) * 1.4, [x, z] = at(a, rad, TW), s = rr(1.6, 3.2), g = groundAt(x, z);
      TW.put('rock', GEO.dode, MAT.inst, x, g + s * 0.45, z, rr(0, 6), s, s * rr(0.7, 1.1), s, rpick(['#7a7266', '#8b8274', '#6e665c']), rr(0, 1));
      COLL.push({ x, z, r: s * 0.85 });
    }
    const [lx, lz] = at(-PI / 2, 9.5, TW), lg = groundAt(lx, lz);
    TW.put('rock', GEO.dode, MAT.inst, lx, lg + 2.4, lz, 0.4, 3.6, 1.1, 2.4, '#7a7266'); COLL.push({ x: lx, z: lz, r: 2.6 });
    for (let i = 0; i < 6; i++) { const [x, z] = at(rr(0, TAU), rr(2, 5.5), TW), g = groundAt(x, z); TW.put('bone', GEO.cyl6, MAT.inst, x, g + 0.08, z, rr(0, 6), 0.06, rr(0.5, 0.9), 0.06, '#e8e0cc', PI / 2); }
    for (let i = 0; i < 4; i++) { const [x, z] = at(i / 4 * TAU + 0.5, 12.5, TW); tree(TW, x, z, rr(1.1, 1.4)); }
    TW.done(); ringNodes(TW, 4, 6);
    return TW;
  }
  function buildLucciole() {
    const C = { x: -350, z: 140 }, TW = new Town('lucciole', 'Borgo delle Lucciole', C.x, C.z, 32, '#c8ff6a');
    const ringP = []; for (let i = 0; i < 40; i++) ringP.push(at(i / 40 * TAU, 9.5, C));
    ribbon(TW, ringP, 2.2, ['#6b5238', '#5e4830', '#77603f'], true, 0.22);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3, [x, z] = at(a, rr(16, 18.5), C); stiltHouse(TW, x, z, faceC(a), rr(4.2, 5.2), rr(3.8, 4.6)); const [px, pz] = at(a, 11.5, C); ribbon(TW, [[px, pz], at(a, 14, C)], 1.6, ['#6b5238', '#5e4830'], false, 0.2); }
    // great willow with hanging lanterns
    const g = groundAt(C.x, C.z);
    TW.put('trunk', GEO.cyl6, MAT.inst, C.x, g + 2.4, C.z, 0, 0.6, 4.8, 0.6, '#3e3226');
    TW.put('crown', GEO.sph, MAT.inst, C.x, g + 6.2, C.z, 0, 4.4, 2.6, 4.4, '#4a5a2a');
    TW.put('crown', GEO.sph, MAT.inst, C.x + 1, g + 7.6, C.z - 0.6, 0, 2.6, 1.8, 2.6, '#5e3f6a');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU, x = C.x + Math.cos(a) * 3.6, z = C.z + Math.sin(a) * 3.6;
      TW.put('crown', GEO.cyl6, MAT.inst, x, g + 4.6, z, 0, 0.05, 2.4, 0.05, '#3f5a32');
      TW.put('lantern', GEO.box, MAT.lamp, x, g + 3.3, z, a, 0.3, 0.4, 0.3, null, 0, 0, true);
      TW.halos.push({ x, y: g + 3.3, z, s: 2.4, c: '#c8ff6a' });
    }
    COLL.push({ x: C.x, z: C.z, r: 0.9 });
    for (let i = 0; i < 6; i++) { const [x, z] = at(i / 6 * TAU + 0.25, 11.3, C); lampPost(TW, x, z, 0, '#b6ff6a'); }
    for (let i = 0; i < 40; i++) { const [x, z] = at(rr(0, TAU), rr(21, 29), C), gg = groundAt(x, z); TW.put('reed', GEO.cone4, MAT.inst, x, gg + 0.7, z, rr(0, 6), 0.08, rr(1.2, 2), 0.08, rpick(['#6b7a3a', '#5a6a32', '#7a8a4a']), rr(-0.15, 0.15)); }
    for (let i = 0; i < 8; i++) { const [x, z] = at(rr(0, TAU), rr(22, 30), C), gg = groundAt(x, z); TW.put('shroom', GEO.sphLo, MAT.glow, x, gg + 0.2, z, 0, rr(0.2, 0.4), 0.22, rr(0.2, 0.4), hdr(rpick(['#7cf7ff', '#b6ff6a', '#e48bff']), 2), 0, 0, true); }
    TW.fireflies = { x: C.x, z: C.z };
    TW.done(); ringNodes(TW, 9.5, 8);
    return TW;
  }
  function buildGelido() {
    const C = { x: 40, z: -420 }, TW = new Town('gelido', 'Rifugio Gelido', C.x, C.z, 32, '#bfe3ff');
    disc(TW, C.x, C.z, 8, ['#e8eef4', '#dfe7ee', '#f0f4f8'], null, 0.1);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5, [x, z] = at(a, rr(14, 16), C); logCabin(TW, x, z, faceC(a), rr(5, 6), rr(4.2, 5)); }
    fire(TW, C.x, C.z, null, 1.4, true);
    { // snowman
      const [x, z] = at(2.2, 6, C), g = groundAt(x, z);
      TW.put('snow', GEO.sph, MAT.inst, x, g + 0.55, z, 0, 0.62, 0.58, 0.62, '#f4f8fc'); TW.put('snow', GEO.sph, MAT.inst, x, g + 1.35, z, 0, 0.45, 0.42, 0.45, '#f4f8fc'); TW.put('snow', GEO.sph, MAT.inst, x, g + 1.95, z, 0, 0.32, 0.3, 0.32, '#f4f8fc');
      const ry = Math.atan2(C.x - x, C.z - z);
      TW.put('carrot', GEO.cone6, MAT.inst, x + Math.sin(ry) * 0.38, g + 1.95, z + Math.cos(ry) * 0.38, ry, 0.06, 0.3, 0.06, '#ff7a1a', PI / 2);
      TW.put('hat', GEO.cyl12, MAT.inst, x, g + 2.32, z, 0, 0.26, 0.35, 0.26, '#222'); TW.put('hat', GEO.cyl12, MAT.inst, x, g + 2.16, z, 0, 0.38, 0.04, 0.38, '#222');
      TW.put('cloth', GEO.cyl12, MAT.inst, x, g + 1.66, z, 0, 0.36, 0.12, 0.36, '#c62828');
      COLL.push({ x, z, r: 0.6 });
    }
    for (let i = 0; i < 3; i++) { const [x, z] = at(i * 2.1 + 0.9, 9.5, C), g = groundAt(x, z); for (let k = 0; k < 6; k++) TW.put('log', GEO.cyl6, MAT.inst, x + (k % 3 - 1) * 0.3, g + 0.18 + Math.floor(k / 3) * 0.3, z, i, 0.15, 1.3, 0.15, '#6e4a2c', 0, PI / 2); COLL.push({ x, z, r: 0.8 }); }
    for (let i = 0; i < 6; i++) { const [x, z] = at(i / 6 * TAU, 10.8, C); lampPost(TW, x, z, 0, '#ffd08a'); }
    for (let i = 0; i < 26; i++) { const [x, z] = at(rr(0, TAU), rr(21, 32), C); if (TW.foot.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 1.5)) continue; tree(TW, x, z, rr(1.0, 1.5), 'pine'); }
    TW.done(); ringNodes(TW, 8.5, 8);
    return TW;
  }
  function buildCremisi() {
    const C = { x: 520, z: 40 }, TW = new Town('cremisi', 'Avamposto Cremisi', C.x, C.z, 34, '#ff7a3a');
    disc(TW, C.x, C.z, 9, ['#7a4a3a', '#6e4234', '#84503e'], { 4: '#5a3a30' }, 0.1);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.2, [x, z] = at(a, rr(15, 17.5), C); stoneHouse(TW, x, z, faceC(a), rr(5, 6.4), rr(4.4, 5.4), rr(3.4, 4.2)); }
    { // watchtower
      const [x, z] = at(-2.3, 23, C), g = groundAt(x, z), H = 9;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { TW.put('log', GEO.cyl6, MAT.inst, x + sx * 1.4, g + H / 2, z + sz * 1.4, 0, 0.2, H + 1, 0.2, '#4a3424', sz * 0.05, sx * 0.05); COLL.push({ x: x + sx * 1.4, z: z + sz * 1.4, r: 0.3 }); }
      TW.put('plank', GEO.box, MAT.inst, x, g + H, z, 0, 3.8, 0.3, 3.8, '#5a3e2a');
      for (let k = 0; k < 4; k++) TW.put('plank', GEO.box, MAT.inst, x + [0, 0, 1.8, -1.8][k], g + H + 0.6, z + [1.8, -1.8, 0, 0][k], k < 2 ? 0 : PI / 2, 3.8, 0.9, 0.12, '#6b4a2c');
      TW.put('roof', GEO.cone4, MAT.inst, x, g + H + 3.2, z, PI / 4, 3.2, 1.8, 3.2, '#8a1c1c');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) TW.put('log', GEO.cyl6, MAT.inst, x + sx * 1.6, g + H + 1.4, z + sz * 1.6, 0, 0.08, 2.2, 0.08, '#4a3424');
      fire(TW, x, z, g + H + 0.4, 0.8, false);
      flag(TW, x, g + H + 5.6, z, 0.4, 1.4, 'crimson', 1.5);
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4, [x, z] = at(a, 10.5, C), g = groundAt(x, z); TW.put('stone', GEO.cyl6, MAT.inst, x, g + 0.5, z, 0, 0.45, 1.0, 0.45, '#5a3a30'); TW.put('iron', GEO.cyl12, MAT.metal, x, g + 1.1, z, 0, 0.55, 0.25, 0.55, '#2a2a30'); fire(TW, x, z, g + 1.2, 0.6, false); COLL.push({ x, z, r: 0.6 }); }
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 1.2, [x, z] = at(a, 23, C), g = groundAt(x, z); TW.put('tent', GEO.cone4, MAT.inst, x, g + 1.2, z, a, 2.2, 2.4, 2.2, rpick(['#8a1c1c', '#a0301e', '#6e1a1a'])); COLL.push({ x, z, r: 1.8 }); TW.foot.push({ x, z, r: 2.4 }); }
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; if (Math.abs(angDiff(a, PI)) < 0.25 || Math.abs(angDiff(a, 0.5)) < 0.2) continue; const [x, z] = at(a, 28, C), g = groundAt(x, z); TW.put('stake', GEO.cone6, MAT.inst, x, g + 0.9, z, a, 0.16, 2.2, 0.16, '#3e2a1e', 0, 0.5); if (i % 2 === 0) COLL.push({ x, z, r: 0.45 }); }
    for (const a of [PI - 0.35, PI + 0.35]) { const [x, z] = at(a, 28.5, C); flag(TW, x, groundAt(x, z) + 5.2, z, PI, 1.3, 'crimson', 5.2); }
    TW.done(); ringNodes(TW, 9.5, 8);
    return TW;
  }

  /* ============================================================ CHARACTER MODELS */
  const SKINS = ['#f5d6c0', '#e8b896', '#c68c5f', '#8d5a3b', '#f1c7a5', '#d9a27a', '#fbe0cc'];
  const HAIRS = ['#2b1d14', '#4a2f1d', '#7a4a24', '#c99a52', '#e8d7a0', '#9a3b1f', '#1a1a1a', '#5a3a2a'];
  const CLOTHS = ['#7a2e2e', '#2e4a7a', '#3f6b3a', '#7a6a2e', '#5a3a6b', '#8a5a2e', '#2e6b6b', '#6b2e4a', '#9a8a6a', '#455a64', '#b0643a', '#4a6a8a'];
  const PANTS = ['#4a3a2a', '#3a3a44', '#5a4a3a', '#2e3440', '#6b5a44'];
  /* villager: 6 meshes (body, head, 2 arms, 2 legs) of merged vertex-coloured parts */
  function villagerModel(o) {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const kid = o.role === 'bambino', sc = kid ? 0.62 : o.tall || 1;
    g.scale.setScalar(sc);
    const skin = new T.Color(o.skin), cl = new T.Color(o.cloth), pa = new T.Color(o.pants), hair = new T.Color(o.hair), shoe = new T.Color('#2a1e16');
    const legL = piv(g, -0.11, 0.92, 0), legR = piv(g, 0.11, 0.92, 0);
    for (const L of [legL, legR]) { const k = new Kit(); k.add(API.cap(0.085, 0.58), pa, 0, -0.42, 0); k.add(GEO.box, shoe, 0, -0.86, 0.04, 0.16, 0.12, 0.28); k.mesh(MAT.VC, L); }
    const body = new Kit();
    body.add(GEO.box, pa, 0, 0.98, 0, 0.34, 0.22, 0.22);
    body.add(API.cap(0.19, 0.3), cl, 0, 1.3, 0, 1.15 * (o.burly ? 1.15 : 1), 1, 0.78);
    body.add(GEO.box, '#3a2a1e', 0, 1.08, 0, 0.42, 0.07, 0.28);
    body.add(GEO.cyl6, skin, 0, 1.5, 0, 0.06, 0.12, 0.06);
    if (o.female) body.add(GEO.cone, o.dress || cl, 0, 0.74, 0, 0.36, 0.64, 0.3);
    if (o.apron) body.add(GEO.box, o.apron, 0, 1.0, 0.17, 0.32, 0.62, 0.03);
    if (o.armor) { body.add(GEO.box, '#8a8f98', 0, 1.32, 0.05, 0.44, 0.42, 0.34); body.add(GEO.box, '#1d3a8a', 0, 1.12, 0.17, 0.3, 0.42, 0.03); for (const sx of [-1, 1]) body.add(GEO.sph, '#8a8f98', sx * 0.25, 1.45, 0, 0.12, 0.09, 0.13); }
    if (o.cape) body.add(GEO.box, o.cape, 0, 1.05, -0.17, 0.4, 0.85, 0.04, 0.08);
    body.mesh(MAT.VC, g);
    const head = piv(g, 0, 1.56, 0), hk = new Kit(), hs = kid ? 1.22 : 1;
    hk.add(GEO.sph, skin, 0, 0.12 * hs, 0, 0.15 * hs, 0.165 * hs, 0.15 * hs);
    for (const sx of [-1, 1]) hk.add(GEO.box, '#1a1410', sx * 0.055 * hs, 0.13 * hs, 0.135 * hs, 0.032, 0.042, 0.02);
    hk.add(GEO.box, new T.Color(o.skin).multiplyScalar(0.9), 0, 0.09 * hs, 0.15 * hs, 0.035, 0.05, 0.04);
    const st = o.hairStyle;
    if (st !== 'bald') hk.add(GEO.sph, hair, 0, 0.16 * hs, -0.018, 0.158 * hs, 0.14 * hs, 0.16 * hs);
    if (st === 'long' || st === 'bun' || st === 'braid') hk.add(API.cap(0.11, 0.26), hair, 0, -0.02 * hs, -0.09 * hs, 1.25 * hs, 1, 0.7);
    if (st === 'bun') hk.add(GEO.sph, hair, 0, 0.3 * hs, -0.08, 0.075, 0.075, 0.075);
    if (st === 'braid') hk.add(API.cap(0.04, 0.4), hair, 0.1, -0.22, 0.02, 1, 1, 1, 0.1, 0, 0.15);
    if (st === 'short' || st === 'spiky') for (let i = 0; i < 4; i++) hk.add(GEO.cone4, hair, (-0.075 + i * 0.05) * hs, 0.24 * hs, 0.1 * hs, 0.04, 0.12, 0.04, 2.6, 0, 0);
    if (o.beard) hk.add(GEO.box, o.beard, 0, 0.0, 0.11, 0.2, 0.15, 0.1);
    const hat = o.hat;
    if (hat === 'straw') { hk.add(GEO.cyl12, '#d8b45a', 0, 0.27, 0, 0.3, 0.03, 0.3); hk.add(GEO.cyl12, '#d8b45a', 0, 0.33, 0, 0.15, 0.12, 0.15); hk.add(GEO.cyl12, '#8a2a2a', 0, 0.3, 0, 0.155, 0.03, 0.155); }
    else if (hat === 'cap') hk.add(GEO.sph, o.hatC || '#5a2a2a', 0.02, 0.26, -0.01, 0.17, 0.08, 0.17);
    else if (hat === 'helmet') { hk.add(GEO.sph, '#9aa0aa', 0, 0.2, 0, 0.17, 0.13, 0.17); hk.add(GEO.box, '#9aa0aa', 0, 0.1, 0.16, 0.03, 0.12, 0.03); hk.add(GEO.cone4, '#1d3a8a', 0, 0.36, 0, 0.04, 0.14, 0.04); }
    else if (hat === 'hood') { hk.add(GEO.sph, o.hatC || '#5a4a6b', 0, 0.15, -0.03, 0.19, 0.2, 0.19); }
    else if (hat === 'kerchief') hk.add(GEO.sph, o.hatC || '#c62828', 0, 0.2, -0.02, 0.165, 0.11, 0.17);
    else if (hat === 'fur') { hk.add(GEO.cyl12, '#e8e0cc', 0, 0.27, 0, 0.17, 0.14, 0.17); }
    hk.mesh(MAT.VC, head);
    const armL = piv(g, -0.27, 1.44, 0), armR = piv(g, 0.27, 1.44, 0);
    for (const A of [armL, armR]) {
      const k = new Kit(); k.add(API.cap(0.062, 0.4), o.armor ? '#8a8f98' : cl, 0, -0.26, 0); k.add(GEO.sph, skin, 0, -0.52, 0, 0.06);
      if (A === armR && o.tool === 'spear') { k.add(GEO.cyl6, '#5a3e2a', 0, -0.4, 0.06, 0.025, 2.3, 0.025); k.add(GEO.cone4, '#c9ced8', 0, 0.85, 0.06, 0.06, 0.25, 0.03); }
      if (A === armR && o.tool === 'hammer') { k.add(GEO.cyl6, '#5a3e2a', 0, -0.62, 0.15, 0.025, 0.45, 0.025, PI / 2); k.add(GEO.box, '#4a4c56', 0, -0.62, 0.38, 0.12, 0.2, 0.1); }
      if (A === armR && o.tool === 'cane') { k.add(GEO.cyl6, '#6b4a2a', 0, -0.95, 0.05, 0.025, 0.9, 0.025); }
      if (A === armR && o.tool === 'mug') { k.add(GEO.cyl12, '#c9a24a', 0, -0.6, 0.1, 0.06, 0.13, 0.06); k.add(GEO.cyl12, '#fff7e0', 0, -0.53, 0.1, 0.055, 0.02, 0.055); }
      if (A === armL && o.tool === 'basket') { k.add(GEO.cyl12, '#b88a4a', 0, -0.62, 0.12, 0.13, 0.12, 0.13); k.add(GEO.sph, '#e53935', 0.03, -0.55, 0.12, 0.05); k.add(GEO.sph, '#8bc34a', -0.04, -0.55, 0.14, 0.05); }
      k.mesh(MAT.VC, A);
    }
    if (o.hunch) g.rotation.x = 0.12;
    root.traverse((m) => { if (m.isMesh) m.castShadow = HIGH; });
    return { root, g, legL, legR, armL, armR, head, s: sc };
  }

  /* heroines: distinct low-poly models of the six companions (palettes match the 2D portraits) */
  const HERO = {
    aurelia: { skin: '#ffe2d2', hair: '#d81f3c', hair2: '#78102a', eye: '#ffb300', top: '#3a1520', top2: '#9b1c30', skirt: '#2a0f16', trim: '#ffcf5a', legs: '#2a1a1e', style: 'ponytail', len: 0.62 },
    nerissa: { skin: '#eaf4ff', hair: '#22c3b4', hair2: '#0b5f6a', eye: '#29b6f6', top: '#e9fbff', top2: '#1f9e93', skirt: '#147a8a', trim: '#b2fff4', legs: '#eaf4ff', style: 'long', len: 0.95, long: true },
    kiara: { skin: '#ffe8d6', hair: '#ff9636', hair2: '#a9480f', eye: '#ffb000', top: '#fff3e6', top2: '#c62828', skirt: '#c62828', trim: '#ffd54f', legs: '#fff3e6', style: 'long', len: 0.55 },
    morgana: { skin: '#f7eef3', hair: '#2b1a3d', hair2: '#100818', eye: '#ff1744', top: '#151019', top2: '#8b0f2a', skirt: '#5a0f24', trim: '#c8cbe0', legs: '#151019', style: 'long', len: 0.9, long: true },
    lyra: { skin: '#ffe9da', hair: '#ffd54f', hair2: '#b98400', eye: '#43a047', top: '#2e7d32', top2: '#7b4f2c', skirt: '#7b4f2c', trim: '#c5e1a5', legs: '#3e2a1a', style: 'ponytail', len: 0.6, short: true },
    selene: { skin: '#7d5b6f', hair: '#e4e7f7', hair2: '#8e94c4', eye: '#c39bff', top: '#1f1840', top2: '#3b2f7a', skirt: '#1f1840', trim: '#c5cae9', legs: '#1f1840', style: 'long', len: 0.85, long: true, rune: '#7df9ff' },
  };
  function heroineModel(id) {
    const H = HERO[id], root = new T.Group(), g = new T.Group(); root.add(g);
    const glowMat = new T.MeshBasicMaterial({ vertexColors: true }), M = MAT.VCS;
    const skin = new T.Color(H.skin), hair = new T.Color(H.hair), hair2 = new T.Color(H.hair2), top = new T.Color(H.top), top2 = new T.Color(H.top2), trim = new T.Color(H.trim);
    const legL = piv(g, -0.095, 0.9, 0), legR = piv(g, 0.095, 0.9, 0);
    for (const L of [legL, legR]) {
      const k = new Kit(); k.add(API.cap(0.07, 0.56), H.legs, 0, -0.4, 0);
      k.add(API.cap(0.078, 0.26), id === 'nerissa' ? '#e9fbff' : '#2a1e1a', 0, -0.72, 0.01); k.add(GEO.box, id === 'nerissa' ? '#e9fbff' : '#2a1e1a', 0, -0.86, 0.06, 0.13, 0.08, 0.24);
      if (id === 'lyra' || id === 'aurelia') k.add(GEO.cyl12, trim, 0, -0.55, 0, 0.085, 0.04, 0.085);
      k.mesh(M, L);
    }
    const body = piv(g, 0, 0.95, 0), bk = new Kit(), gk = new Kit();
    bk.add(GEO.box, H.skirt, 0, 0.0, 0, 0.3, 0.18, 0.2);
    bk.add(API.cap(0.145, 0.26), top, 0, 0.32, 0, 1.12, 1, 0.8);
    bk.add(GEO.box, top2, 0, 0.12, 0, 0.32, 0.1, 0.24);
    bk.add(GEO.cyl6, skin, 0, 0.55, 0, 0.05, 0.1, 0.05);
    const skirtL = H.long ? 0.95 : H.short ? 0.36 : 0.62;
    bk.add(GEO.cone12, H.skirt, 0, -skirtL / 2 + 0.05, 0, H.long ? 0.42 : 0.3, skirtL, H.long ? 0.36 : 0.26);
    bk.add(GEO.cyl12, trim, 0, -skirtL + 0.08, 0, H.long ? 0.4 : 0.285, 0.035, H.long ? 0.34 : 0.25);
    const head = piv(body, 0, 0.6, 0), hk = new Kit(), hg = new Kit();
    hk.add(GEO.sph, skin, 0, 0.13, 0, 0.135, 0.15, 0.135);
    hk.add(GEO.box, new T.Color(H.skin).multiplyScalar(0.8), 0, 0.06, 0.13, 0.04, 0.012, 0.01);
    hk.add(GEO.sph, '#ff8fa8', -0.075, 0.09, 0.105, 0.025, 0.015, 0.01); hk.add(GEO.sph, '#ff8fa8', 0.075, 0.09, 0.105, 0.025, 0.015, 0.01);
    const eyes = piv(head, 0, 0.125, 0.122), ek = new Kit();
    for (const sx of [-1, 1]) { ek.add(GEO.box, hdr(H.eye, 1.3), sx * 0.05, 0, 0, 0.038, 0.05, 0.015); ek.add(GEO.box, hdr('#ffffff', 1.6), sx * 0.05 + 0.008, 0.012, 0.004, 0.012, 0.014, 0.01); ek.add(GEO.box, '#1a1014', sx * 0.05, 0.03, 0.002, 0.05, 0.01, 0.012); }
    ek.mesh(glowMat, eyes, false);
    // hair cap, bangs, side locks
    hk.add(GEO.sph, hair, 0, 0.165, -0.012, 0.148, 0.14, 0.15);
    for (let i = 0; i < 6; i++) hk.add(GEO.cone4, i % 2 ? hair : hair2, -0.1 + i * 0.04, 0.215, 0.11, 0.035, 0.13, 0.03, 2.7, 0, (i - 2.5) * 0.08);
    for (const sx of [-1, 1]) hk.add(API.cap(0.035, 0.22), hair, sx * 0.13, 0.04, 0.03, 1, 1, 1, 0, 0, sx * 0.1);
    if (id === 'aurelia') for (const sx of [-1, 1]) { hk.add(GEO.cone6, '#f4ead8', sx * 0.07, 0.31, 0.07, 0.035, 0.2, 0.035, -0.5, 0, -sx * 0.35); hg.add(GEO.cone6, hdr('#ff4d5e', 1.8), sx * 0.104, 0.395, 0.03, 0.016, 0.06, 0.016, -0.5, 0, -sx * 0.35); }
    if (id === 'nerissa') for (const sx of [-1, 1]) hk.add(GEO.cone4, '#5fe0d0', sx * 0.16, 0.12, -0.02, 0.012, 0.2, 0.08, 0, 0, -sx * 1.25);
    if (id === 'kiara') for (const sx of [-1, 1]) { hk.add(GEO.cone4, hair, sx * 0.085, 0.33, -0.02, 0.06, 0.16, 0.035, 0, 0, -sx * 0.25); hk.add(GEO.cone4, '#fff3e6', sx * 0.085, 0.32, -0.005, 0.035, 0.1, 0.02, 0, 0, -sx * 0.25); }
    if (id === 'lyra' || id === 'selene' || id === 'morgana') for (const sx of [-1, 1]) hk.add(GEO.cone4, skin, sx * 0.16, 0.13, -0.01, 0.025, 0.2, 0.02, 0, 0, -sx * 1.3);
    if (id === 'morgana') { hk.add(GEO.cyl12, '#c8cbe0', 0, 0.27, 0.0, 0.14, 0.025, 0.14); for (let i = -2; i <= 2; i++) hk.add(GEO.cone4, '#c8cbe0', i * 0.045, 0.3 - Math.abs(i) * 0.012, 0.12, 0.015, 0.08 - Math.abs(i) * 0.015, 0.012); hg.add(GEO.oct, hdr('#ff1744', 2.4), 0, 0.29, 0.135, 0.025, 0.035, 0.015); }
    if (id === 'selene') { for (const sx of [-1, 1]) { hk.add(GEO.tor, '#c5cae9', sx * 0.05, 0.125, 0.135, 0.032, 0.032, 0.02); hg.add(GEO.box, hdr(H.rune, 2.2), sx * 0.085, 0.07, 0.11, 0.008, 0.04, 0.01, 0, 0, sx * 0.4); } }
    hk.mesh(M, head); hg.mesh(glowMat, head, false);
    const hairB = piv(head, 0, 0.2, -0.08), hb = new Kit();
    if (H.style === 'ponytail') { hb.add(GEO.sph, hair, 0, 0.05, -0.04, 0.06); hb.add(API.cap(0.07, H.len), hair, 0, -H.len / 2, -0.07, 1, 1, 0.8, 0.25); hb.add(GEO.cone6, hair2, 0, -H.len - 0.05, -0.12, 0.05, 0.15, 0.05, PI + 0.25); }
    else { hb.add(API.cap(0.12, H.len), hair, 0, -H.len / 2 - 0.04, -0.03, 1.15, 1, 0.55); hb.add(GEO.cone6, hair2, 0, -H.len - 0.12, -0.04, 0.1, 0.18, 0.06, PI); if (id === 'selene') hb.add(API.cap(0.035, 0.6), hair2, 0.09, -0.4, 0.02); }
    hb.mesh(M, hairB);
    // outfit details
    if (id === 'aurelia') { bk.add(GEO.box, top2, 0, 0.32, 0.11, 0.06, 0.32, 0.02); for (const sx of [-1, 1]) bk.add(GEO.box, trim, sx * 0.16, 0.48, 0, 0.12, 0.05, 0.22); bk.add(GEO.box, '#ffcf5a', 0, 0.12, 0.125, 0.08, 0.06, 0.02); }
    if (id === 'nerissa') { for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.8; bk.add(GEO.sph, '#ffffff', Math.sin(a) * 0.1, 0.5 - Math.cos(a) * 0.04, 0.09 + Math.cos(a) * 0.02, 0.018); } bk.add(GEO.box, top2, 0, 0.3, 0.115, 0.26, 0.1, 0.02); }
    if (id === 'kiara') { bk.add(GEO.box, top2, 0, 0.3, 0.115, 0.05, 0.3, 0.02); gk.add(GEO.sph, hdr('#ffd54f', 1.5), 0, 0.5, 0.11, 0.035); }
    if (id === 'morgana') { for (const sx of [-1, 1]) bk.add(GEO.box, '#151019', sx * 0.13, 0.62, -0.05, 0.08, 0.22, 0.03, -0.2, 0, sx * 0.4); bk.add(GEO.box, top2, 0, 0.36, 0.115, 0.2, 0.2, 0.02); gk.add(GEO.oct, hdr('#ff1744', 2.2), 0, 0.45, 0.13, 0.03); }
    if (id === 'lyra') { bk.add(GEO.box, '#7b4f2c', 0, 0.3, 0, 0.36, 0.06, 0.26, 0, 0, 0.6); bk.add(GEO.cyl12, '#6b4a2a', 0.08, 0.38, -0.16, 0.06, 0.48, 0.06, 0, 0, -0.35); for (let i = 0; i < 3; i++) bk.add(GEO.box, '#f5f5f5', 0.17 + i * 0.02, 0.64, -0.16 - (i - 1) * 0.02, 0.025, 0.08, 0.012, 0, 0, -0.35); }
    if (id === 'selene') { bk.add(GEO.box, top2, 0, 0.32, 0.115, 0.1, 0.34, 0.02); for (const sx of [-1, 1]) bk.add(GEO.box, '#c5cae9', sx * 0.06, 0.55, 0.0, 0.04, 0.14, 0.2, 0, 0, sx * 0.3); gk.add(GEO.box, hdr(H.rune, 2.4), 0, 0.12, 0.13, 0.16, 0.015, 0.01); }
    bk.mesh(M, body); gk.mesh(glowMat, body, false);
    const armL = piv(body, -0.2, 0.47, 0), armR = piv(body, 0.2, 0.47, 0);
    let weapon = null;
    for (const A of [armL, armR]) {
      const k = new Kit(), kg = new Kit(), sleeve = id === 'nerissa' || id === 'kiara' ? top : id === 'lyra' ? skin : top;
      k.add(API.cap(0.045, 0.4), sleeve, 0, -0.24, 0); k.add(GEO.sph, skin, 0, -0.48, 0, 0.045);
      if (id === 'kiara') k.add(GEO.cone12, '#fff3e6', 0, -0.35, 0, 0.1, 0.3, 0.1);
      if (id === 'morgana') k.add(API.cap(0.048, 0.18), '#151019', 0, -0.4, 0);
      if (id === 'selene') kg.add(GEO.box, hdr(H.rune, 2.2), 0, -0.3, 0.045, 0.012, 0.12, 0.01);
      if (A === armR && id === 'aurelia') { k.add(GEO.box, '#1a1014', 0, -0.5, 0.12, 0.04, 0.04, 0.25); k.add(GEO.box, '#ffcf5a', 0, -0.5, 0.25, 0.12, 0.05, 0.03); kg.add(GEO.box, hdr('#ff5a3c', 2.2), 0, -0.5, 0.75, 0.025, 0.05, 0.95); }
      if (A === armL && id === 'lyra') { k.add(GEO.tor, '#7b4f2c', 0, -0.48, 0.05, 0.55, 0.55, 0.3, 0, PI / 2, 0); kg.add(GEO.box, hdr('#e8ffd0', 1.2), 0, -0.48, -0.06, 0.005, 1.0, 0.005); }
      if (A === armR && id === 'selene') { k.add(GEO.cyl6, '#3a2a4a', 0, -0.5, 0.05, 0.025, 1.6, 0.025); kg.add(GEO.oct, hdr('#b388ff', 2.6), 0, 0.36, 0.05, 0.08, 0.13, 0.08); }
      if (A === armR && id === 'morgana') { k.add(GEO.cone12, '#e0e0f0', 0, -0.47, 0.09, 0.05, 0.08, 0.05, PI); k.add(GEO.cyl6, '#e0e0f0', 0, -0.55, 0.09, 0.008, 0.1, 0.008); kg.add(GEO.cyl12, hdr('#b0123c', 1.1), 0, -0.44, 0.09, 0.04, 0.02, 0.04); }
      if (A === armR && id === 'nerissa') { k.add(GEO.cyl6, '#e9fbff', 0, -0.5, 0.05, 0.02, 1.5, 0.02); kg.add(GEO.cone4, hdr('#36d8ff', 2.2), 0, 0.3, 0.05, 0.06, 0.2, 0.02); for (const sx of [-1, 1]) kg.add(GEO.cone4, hdr('#36d8ff', 2.2), sx * 0.07, 0.22, 0.05, 0.03, 0.14, 0.02, 0, 0, -sx * 0.3); }
      k.mesh(M, A); kg.mesh(glowMat, A, false);
    }
    // cape (Morgana), tails (Kiara), orbs / wisps
    let cape = null; const tails = [], orbs = [];
    if (id === 'morgana') { cape = piv(body, 0, 0.55, -0.1); const k = new Kit(); k.add(GEO.box, '#100818', 0, -0.62, -0.03, 0.56, 1.3, 0.025); k.add(GEO.box, '#8b0f2a', 0, -0.62, 0.0, 0.5, 1.24, 0.02); k.mesh(M, cape); }
    if (id === 'kiara') for (let i = 0; i < 5; i++) { const t = piv(g, 0, 0.82, -0.14); t.rotation.set(0.9, (i - 2) * 0.42, 0); const k = new Kit(); k.add(API.cap(0.085, 0.45), hair, 0, 0, -0.32, 1, 1, 1, PI / 2); k.add(GEO.sph, '#fff3e6', 0, 0, -0.64, 0.08, 0.08, 0.1); k.mesh(M, t); tails.push(t); }
    if (id === 'nerissa' || id === 'kiara' || id === 'selene') for (let i = 0; i < (id === 'selene' ? 4 : 3); i++) {
      const m = new T.Mesh(id === 'selene' ? GEO.oct : GEO.sphLo, MAT.add(id === 'nerissa' ? '#36d8ff' : id === 'kiara' ? '#ff9a3c' : '#9f7bff', 2.4, 0.9));
      m.scale.setScalar(id === 'selene' ? 0.06 : 0.08); root.add(m); orbs.push(m);
    }
    root.traverse((m) => { if (m.isMesh && m.material !== glowMat && !m.material.blending) m.castShadow = !LOW; });
    return { root, g, legL, legR, armL, armR, head, body, eyes, hairB, cape, tails, orbs, glowMat, s: 1 };
  }

  /* goblin / hobgoblin / wolves built from the engine's model kit */
  const HOBMAT = { steel: std('#c9ced8', 0.3, 0.85), blue: std('#1d3a8a', 0.8), gold: std('#e6c25a', 0.3, 0.9), plume: std('#ff5a3c', 0.7) };
  function goblinModel() {
    const m = API.humanoid('goblin', 0.92);
    if (m.weapon) m.weapon.visible = false;
    API.mesh(m.g, GEO.box, std('#8a6a3a', 0.9), 0, 1.0, 0.0, 0, 0, 0, 0.7, 0.35, 0.45);
    return m;
  }
  const SKINC = new T.Color('#6d8a3a');
  function hobgoblinModel() {
    const m = API.humanoid('goblin', 1.22);
    m.root.traverse((o) => { if (o.isMesh && o.material.color && o.material.color.equals(SKINC)) o.material.color.set('#8fae5c'); });
    const g = m.g;
    API.mesh(g, GEO.box, HOBMAT.steel, 0, 1.55, 0.18, 0.08, 0, 0, 0.66, 0.6, 0.16);
    API.mesh(g, GEO.box, HOBMAT.blue, 0, 1.12, 0.22, 0, 0, 0, 0.5, 0.6, 0.04);
    API.mesh(g, GEO.box, HOBMAT.gold, 0, 1.2, 0.245, 0, 0, 0, 0.16, 0.16, 0.02);
    for (const sx of [-1, 1]) API.mesh(g, GEO.sph, HOBMAT.steel, sx * 0.5, 1.92, 0, 0, 0, sx * 0.3, 0.26, 0.17, 0.26);
    API.mesh(m.head, GEO.sph, HOBMAT.steel, 0, 0.1, -0.02, 0, 0, 0, 0.3, 0.22, 0.3);
    API.mesh(m.head, GEO.cone6, HOBMAT.plume, 0, 0.35, -0.08, -0.4, 0, 0, 0.07, 0.35, 0.12);
    const cape = API.pivot(g, 0, 1.95, -0.25); const cg = new T.PlaneGeometry(0.9, 1.3, 1, 3); cg.translate(0, -0.65, 0);
    API.mesh(cape, cg, std('#1d3a8a', 0.9, 0, { side: T.DoubleSide }), 0, 0, 0); m.cape = cape;
    if (m.weapon) { m.weapon.clear(); API.mesh(m.weapon, GEO.box, HOBMAT.gold, 0, -0.05, 0, 0, 0, 0, 0.3, 0.06, 0.1); API.mesh(m.weapon, GEO.box, HOBMAT.steel, 0, -0.75, 0, 0, 0, 0, 0.08, 1.3, 0.03); }
    return m;
  }
  function wildWolfModel() { return API.wolfModel({ fur: '#8a8274', dark: '#5a544a', eye: '#ffd27a' }); }
  function stormWolfModel() {
    const m = API.wolfModel({ fur: '#22324f', dark: '#121a2c', eye: '#9fd8ff' });
    const glow = new T.MeshBasicMaterial({ color: hdr('#5aa0ff', 2.6) });
    for (let i = 0; i < 4; i++) API.mesh(m.g, GEO.box, glow, 0, 1.3, 0.5 - i * 0.35, 0, 0, 0, 0.05, 0.04, 0.22);
    for (const sx of [-1, 1]) API.mesh(m.g, GEO.box, glow, sx * 0.3, 1.0, 0.1, 0, 0, sx * 0.4, 0.03, 0.03, 0.5);
    API.mesh(m.head, GEO.cone4, std('#dfe8ff', 0.3, 0.6), 0, 0.3, 0.1, -0.4, 0, 0, 0.06, 0.36, 0.06);
    m.root.scale.setScalar(1.4);
    return m;
  }

  /* floating name label / marker sprites */
  function labelSprite(text, color, sub) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(text, 256, sub ? 48 : 64); x.fillStyle = color || '#ffe7a8'; x.fillText(text, 256, sub ? 48 : 64);
    if (sub) { x.font = '30px Georgia, serif'; x.lineWidth = 7; x.strokeText(sub, 256, 100); x.fillStyle = '#e9dfc4'; x.fillText(sub, 256, 100); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(2.8, 0.7, 1); s.renderOrder = 5;
    API.scene.add(s); return s;
  }
  const BANG = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
    x.font = 'bold 110px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 10; x.strokeStyle = '#3a2400'; x.strokeText('!', 32, 66); x.fillStyle = '#ffd36b'; x.fillText('!', 32, 66);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return new T.SpriteMaterial({ map: t, color: new T.Color(1.6, 1.5, 1.2), transparent: true, depthWrite: false });
  })();

  /* ============================================================ DIALOGUE DATA (Italian) */
  const LINES = {
    cittadino: [
      "Dicono che un tempo il nostro Sovrano fosse solo una goccia di gelatina in una caverna. Ora guarda Valdoria! ...Oh! Maestà {P}! Fate finta che non abbia detto «goccia».",
      "Il pane di Valdoria è il più morbido delle Terre Spezzate. Il fornaio giura che è «ispirato alla consistenza di Sua Maestà». Non so se sia un complimento.",
      "A est, oltre le Terre Cremisi, Gorvan il Tiranno Caduto attende nella sua arena. Era un re giusto, prima che la corona gli divorasse il cuore.",
      "Hai sentito il tuono a nord, la notte? È il Drago della Tempesta Antica che si rigira nel sonno sulla Vetta della Tempesta. Se tuona tre volte, chiudi le finestre e non fare domande.",
      "Mio cugino giura di aver sentito una voce nella testa dire «Analisi completata». Poi abbiamo scoperto che era il pappagallo del mercante.",
      "L'Oracolo che guida Sua Maestà non sbaglia mai un calcolo. Sbaglia solo le battute. Ma quello, credo, lo fa apposta.",
      "Un consiglio da vecchio soldato: quando un nemico vacilla, non finirlo con la spada. Usa il Predatore! Divorato rende il doppio delle anime... e una bella essenza.",
      "I goblin del villaggio a nord-ovest sono pacifici, solo... senza nome. Qui un nome cambia tutto: chi lo riceve si evolve. Ma costa magicule, eh.",
      "Le Luci di Grazia ✦ sono doni dell'Albero Dorato. Riposa lì e diventerai più forte. Il riposo è un'arte marziale sottovalutata.",
      "Hanno messo la statua del Sovrano in cima alla fontana. È così somigliante che i bambini cercano di abbracciarla. E rimbalzano.",
      "Ieri un lupo è entrato in città. Gli abbiamo dato una ciotola di stufato. Ora fa la guardia alla panetteria e si fa chiamare «Signor Biscotto».",
      "Prima di partire per le Terre Cremisi fai scorta di Gelatina Cremisi dal mercante. E prega che il Tiranno abbia mal di schiena.",
      "Se cadi in battaglia, le tue anime restano dove sei caduto, in una macchia verde. Torna a prenderle! Qui nessuno ruba... credo.",
      "Mia figlia vuole sposare un'elfa arciera. Mio figlio un drago. Io voglio solo che qualcuno ripari il tetto.",
      "Valdoria non ha mai avuto mura così alte. Ora la notte dormo tranquillo. Tranne quando russa il fabbro.",
      "La kitsune del santuario fa scherzi a chiunque. Ieri ha trasformato il mio cappello in una pannocchia. Era un bel cappello.",
      "Sapevi che puoi divorare un lupo e prenderne la forma? Mimetismo, lo chiamano. Mio marito ci prova da anni con il gatto. Senza successo.",
      "Lungo la Via Reale, verso nord, si arriva alle Rovine del Risveglio. Lì, dicono, tutto è cominciato. Con un «blop».",
      "Quando c'è il sole, la regina della notte resta all'ombra del palazzo. Dice che è per la carnagione. Io dico che le piace guardare la piazza.",
    ],
    guardia: [
      "Tutto tranquillo, Maestà. Le mura reggono, il cancello è sorvegliato. Nessun mostro ostile entra a Valdoria finché ci siamo noi.",
      "Ho visto cavalieri oscuri tra le rovine a est della Chiesa della Gelatina. Armature nere, occhi rossi. Quando alzano la spada... schiva!",
      "Gorvan attacca con onde d'urto che corrono sul terreno. Il consiglio della guarnigione: rotola attraverso l'onda, non scappare all'indietro.",
      "Il Drago della Tempesta, quando è ferito, chiama fulmini dal cielo. Guarda a terra: dove compare il cerchio rosso, non restare.",
      "Turno di guardia di dodici ore. Ma per il Sovrano Slime questo e altro. ...Un giorno libero? No? Giusto, giusto.",
      "Il capitano dice che gli Hobgoblin che hai nominato combattono meglio di dieci reclute. Io dico che mangiano come venti.",
    ],
    bambino: [
      "Maestà! Maestà! Fai di nuovo la forma di gelatina! Boing boing!",
      "Da grande voglio diventare un Hobgoblin! La mamma dice che non si può. Ma ho già scelto il nome!",
      "Giochiamo a Predatore! Tu sei il mostro e io ti mangio! ...Aspetta, non funziona così?",
      "Ho trovato una lucciola gigante! Ah no, era la lanterna della guardia.",
      "Il fabbro dice che se mangio le verdure diventerò forte come Aurelia. Ma lei mangia solo onigiri!",
      "La regina vampira dà sempre caramelle ai bambini. Dice che «il sangue è sopravvalutato». Non ho capito, ma erano buone.",
    ],
    lucciole: [
      "Le lucciole del borgo si accendono solo per chi ha il cuore buono. O una lanterna. Spesso le due cose coincidono.",
      "Viviamo su palafitte perché la palude si alza a ogni luna. E perché gli spiriti del fango odiano le scale.",
      "Nella Palude dei Sussurri le voci ti chiamano per nome. Non rispondere. Mai. Neanche se dicono che hai vinto qualcosa.",
      "Più a sud-ovest vagano cavalieri oscuri che hanno smarrito la strada... e l'anima. Stai alla larga, o portati qualche Gelatina.",
    ],
    gelido: [
      "Benvenuto al Rifugio Gelido! Togliti la neve di dosso... ah, sei di gelatina. Allora attento a non diventare un sorbetto.",
      "Lassù, sulla Vetta della Tempesta, dorme il Drago della Tempesta Antica. Quando si sveglia, il cielo diventa viola.",
      "I lupi bianchi del passo cacciano in branco. Uno lo affronti. Sei ti fanno affrontare il destino.",
      "Il nostro stufato di radici scalda le ossa. Tu non hai ossa? Scalda... qualcos'altro, allora.",
    ],
    cremisi: [
      "Avamposto Cremisi, ultima difesa prima della Soglia del Tiranno. Se prosegui verso nord, preparati al peggio.",
      "Gorvan era il nostro re. Ha divorato un'anima corrotta e ne è stato divorato a sua volta. Tu divori di continuo, Maestà... stai attento.",
      "La terra qui è rossa per via del ferro. O del sangue. Diciamo ferro, è più rassicurante.",
      "Le fessure di lava si accendono di notte. Bellissime da guardare, pessime da calpestare.",
    ],
    anziano: [
      "Molto tempo fa l'Albero Dorato teneva unite queste terre. Quando il suo potere si incrinò, il mondo si spezzò in quattro regioni. Da qui il nome: Terre Spezzate.",
      "L'Oracolo che parla nella tua mente, {P}, non è una semplice voce: è la Saggezza Analitica che ogni Predatore porta con sé. Fidati dei suoi calcoli... ma non chiedergli consigli d'amore.",
      "Due grandi ombre gravano sulla Nazione: Gorvan, il Tiranno Caduto, a est; e il Drago della Tempesta Antica, a nord. Abbattile, e le Terre Spezzate avranno un solo signore.",
      "Dare un nome a un mostro significa legare la sua anima alla tua. Lui si evolve, tu perdi un po' di magicule. Un prezzo giusto, per una famiglia.",
    ],
  };
  const GREET = {
    mercante: "Benvenuto alla bancarella di {N}, Maestà! Merce fresca, prezzi onesti... beh, quasi onesti.",
    fabbro: "Il fuoco della fucina non si spegne mai, come la mia voglia di martellare! Vuoi che rinforzi il tuo... ehm... corpo gelatinoso? Ho un metodo.",
    locandiere: "Benvenuto alla Locanda della Gelatina Danzante! Letto caldo, zuppa bollente e nessuna domanda sui mostri che ti seguono.",
    anziano: "Ah, {P}. Siediti, se una gelatina può sedersi. Questo vecchio ha storie da raccontare... e qualche favore da chiedere.",
  };
  const ROLE_NAME = { cittadino: 'Cittadino', cittadina: 'Cittadina', guardia: 'Guardia', bambino: 'Bambino', bambina: 'Bambina', mercante: 'Mercante', fabbro: 'Fabbro', anziano: 'Anziano', locandiere: 'Locandiere', locandiera: 'Locandiera', cacciatore: 'Cacciatore', pescatrice: 'Pescatrice', soldato: 'Soldato' };
  const NAMES_M = ['Bertoldo', 'Ottone', 'Gualtiero', 'Anselmo', 'Baldovino', 'Ugolino', 'Tebaldo', 'Rinaldo', 'Corrado', 'Ilario', 'Sigismondo', 'Manfredo', 'Ruggero', 'Leopoldo', 'Fiorenzo', 'Ermanno'];
  const NAMES_F = ['Gisella', 'Rosalba', 'Mirella', 'Brunilde', 'Ondina', 'Ilda', 'Clotilde', 'Fiammetta', 'Ortensia', 'Viola', 'Adelaide', 'Melisenda', 'Teodora', 'Ginevra', 'Lucrezia', 'Beatrice'];
  const NAMES_K = ['Pippo', 'Nina', 'Tobia', 'Lilla', 'Gigi', 'Mela', 'Nico', 'Bice'];
  const GOB_LINES = ["Gu-gu? Tu... grande slime. Noi... senza nome. Tu dare nome?", "Goblin ha fame. Goblin ha freddo. Goblin... vuole nome!", "Grande slime profuma di magicule. Goblin rispetta. Goblin si inchina. Goblin cade."];
  const WOLF_LINES = ["(Il lupo ti annusa con curiosità e scodinzola piano. Nei suoi occhi brilla una scintilla di intelligenza.)", "(Il lupo inclina la testa. Sembra aspettare qualcosa da te... forse un nome.)"];
  const ALLY_LINES = {
    hobgoblin: ["{N} al tuo servizio, Maestà! Il mio nome è il tuo dono più grande.", "Da quando ho un nome, vedo i colori più brillanti. E i nemici più piccoli.", "Ordina e {N} obbedisce! Ma prima... c'è qualcosa da mangiare?"],
    lupo: ["(Il Lupo Tempesta {N} ulula fiero, e scintille azzurre gli corrono sul pelo.)", "(Ti si strofina contro, quasi facendoti rotolare. Il pelo crepita di elettricità.)"],
  };
  const SYL_A = ['Gor', 'Bal', 'Ru', 'Ka', 'Zek', 'Mor', 'Tal', 'Vir', 'Dra', 'Fen', 'Lu', 'Gal', 'Ser', 'Ond', 'Bri', 'Kor', 'Ash', 'Nyl', 'Tor', 'Gru', 'Vel', 'Ix', 'Pell', 'Rok'];
  const SYL_B = ['bo', 'tar', 'dun', 'iel', 'ak', 'ros', 'mir', 'gan', 'vek', 'ion', 'dil', 'or', 'ash', 'ek', 'ulf', 'ren', 'zo', 'ard', 'ix', 'un'];
  const WOLF_A = ['Zanna', 'Tuono', 'Brezza', 'Lampo', 'Ombra', 'Notte', 'Saetta', 'Nembo', 'Raffica', 'Cielo'];
  const WOLF_B = ['Blu', 'd\'Argento', 'Lunare', 'del Nord', 'Celeste', 'Scura', 'Ardente', 'Gelida'];
  function genName(kind) {
    if (kind === 'lupo') return pick(WOLF_A) + ' ' + pick(WOLF_B);
    let n = pick(SYL_A) + pick(SYL_B); if (Math.random() < 0.3) n += pick(['', 'a', 'o', 'us', 'an']);
    return n;
  }
  /* fallback companion data when nation.js is missing */
  const FALLBACK_COMP = [
    ['aurelia', 'Aurelia', 'Oni', 'Lama Cremisi del Clan Oni', '#ff4d5e'], ['nerissa', 'Nerissa', 'Fanciulla del Mare', 'Voce delle Maree Profonde', '#2ee6d6'],
    ['kiara', 'Kiara', 'Kitsune', 'Volpe delle Nove Code', '#ff9a3c'], ['morgana', 'Morgana', 'Vampira', 'Regina della Notte Eterna', '#e0244f'],
    ['lyra', 'Lyra', 'Elfa', "Freccia del Vento d'Argento", '#9ccc65'], ['selene', 'Selene', 'Elfa Oscura', 'Custode delle Rune Stellari', '#b388ff'],
  ].map(([id, name, race, title, color]) => ({ id, name, race, title, color, bio: '', likes: [], dates: {},
    lines: { meet: ['Piacere di conoscerti, {P}.'], t0: ['Ciao, {P}.'], t1: ['[happy]Che bello vederti, {P}!'], t2: ['[love]Mi sei mancato, {P}.'], married: ['[love]Bentornato a casa, {P}.'],
      gift: { love: ['[love]È perfetto!'], like: ['[happy]Grazie!'], ok: ['Grazie, {P}.'] }, poke: ['?'], proposal: ['[love]Sì!'], vow: '[love]Ti amerò per sempre, {P}.' } }));
  const NATION = () => (SK.Nation && Array.isArray(SK.Nation.companions) ? SK.Nation : null);
  const COMPS = () => (NATION() ? NATION().companions : FALLBACK_COMP);
  const COMP = (id) => COMPS().find((c) => c.id === id);
  const GIFTS = () => (NATION() && NATION().gifts) || [{ id: 'dolci', name: 'Dolcetti al Miele', desc: 'Morbidi e dorati.', cost: 20 }, { id: 'fiori', name: 'Bouquet di Rose Lunari', desc: 'Brillano di notte.', cost: 25 }];
  const DATES = () => (NATION() && NATION().dates) || [];
  const SPOUSE_BONUS = {
    aurelia: '+15% danno in mischia', nerissa: 'rigenerazione della vita', kiara: '12% di probabilità di schivare i colpi',
    morgana: '+5% rubavita sui colpi in mischia', lyra: 'frecce extra durante gli attacchi', selene: 'rigenerazione FP e −8% danni subiti',
  };

  /* ============================================================ UI: dialogue box / visual novel panel */
  const pname = () => (API.ch && API.ch.name) || 'Viandante';
  const UI = { open: false, o: null, lines: [], li: 0, full: '', shown: 0, typing: false, done: null, waiting: false, mood: 'idle', t: 0, blockUntil: 0, acts: [] };
  const E = {};
  function buildUI() {
    if (E.root) return;
    const st = document.createElement('style');
    st.textContent = `
#twv{position:fixed;inset:0;z-index:45;display:none;pointer-events:none;font-family:"Palatino Linotype","Book Antiqua",Georgia,serif}
#twv.on{display:block}#twv.vn{pointer-events:auto}
#twv .twp{position:absolute;left:1vw;bottom:0;height:min(94vh,560px);aspect-ratio:9/10;display:none;filter:drop-shadow(0 0 22px rgba(0,0,0,.65))}
#twv.vn .twp{display:block}
#twv .twb{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:min(94vw,760px);pointer-events:auto;box-sizing:border-box;
 background:linear-gradient(rgba(24,18,10,.95),rgba(10,8,5,.97));border:1px solid rgba(220,190,120,.6);border-radius:4px;color:#efe3c0;
 box-shadow:0 0 30px rgba(0,0,0,.6),inset 0 0 22px rgba(240,190,90,.07);padding:9px 15px 10px}
#twv.vn .twb{left:auto;right:2vw;transform:none;width:min(58vw,640px);bottom:3vh;max-height:88vh;overflow:auto}
#twv .twh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:3px;border-bottom:1px solid rgba(220,190,120,.25);padding-bottom:3px}
#twv .twn{font-size:18px;letter-spacing:1px;color:#ffe7a8;text-shadow:0 0 8px rgba(0,0,0,.6)}
#twv .tws{font-size:12px;color:#a8987a}
#twv .twhe{margin-left:auto;font-size:15px;letter-spacing:1px;white-space:nowrap}
#twv .twt{font-size:15.5px;line-height:1.45;min-height:3em;white-space:pre-wrap;padding-top:3px}
#twv .twt.nar{font-style:italic;color:#c9bb96}
#twv .twnx{text-align:right;font-size:11px;color:#d6ba78;height:12px;animation:twbl 1s infinite}
@keyframes twbl{50%{opacity:.15}}
#twv .twa{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
#twv .twa button{flex:1 1 30%;min-width:128px;padding:6px 9px;font:inherit;font-size:14px;color:#efe3c0;background:rgba(60,48,26,.68);border:1px solid rgba(220,190,120,.45);
 cursor:pointer;text-align:left;border-radius:3px;line-height:1.2}
#twv .twa button small{display:block;font-size:11px;color:#b8a57a;margin-top:1px}
#twv .twa button.off{opacity:.42}
#twv .twa button:active{background:rgba(140,110,50,.6)}
#twv .twa button.pri{border-color:rgba(255,200,120,.85);box-shadow:0 0 10px rgba(255,190,90,.25)}
#twv .twa input{flex:1 1 100%;font:inherit;font-size:19px;padding:7px 10px;background:#0b0905;color:#ffe7a8;border:1px solid #d6ba78;border-radius:3px;outline:none;user-select:text;-webkit-user-select:text}
#twvow{position:fixed;left:50%;top:13%;transform:translateX(-50%);width:min(84vw,720px);z-index:44;text-align:center;color:#fff3e6;font-size:17px;line-height:1.5;
 font-family:"Palatino Linotype",Georgia,serif;text-shadow:0 0 6px #000,0 0 16px rgba(255,110,160,.7);pointer-events:none;opacity:0;transition:opacity .8s;
 background:radial-gradient(ellipse at center,rgba(20,6,16,.55),transparent 70%);padding:10px 18px}
#twvow.on{opacity:1}#twvow b{display:block;color:#ffb3c8;font-size:13px;letter-spacing:3px;margin-bottom:3px;font-weight:normal}`;
    document.head.appendChild(st);
    const r = E.root = document.createElement('div'); r.id = 'twv';
    r.innerHTML = '<canvas class="twp" width="360" height="400"></canvas><div class="twb"><div class="twh"><span class="twn"></span><span class="tws"></span><span class="twhe"></span></div><div class="twt"></div><div class="twnx">▼</div><div class="twa"></div></div>';
    document.body.appendChild(r);
    E.canvas = r.querySelector('.twp'); E.ctx = E.canvas.getContext('2d'); E.box = r.querySelector('.twb');
    E.name = r.querySelector('.twn'); E.sub = r.querySelector('.tws'); E.hearts = r.querySelector('.twhe'); E.text = r.querySelector('.twt'); E.next = r.querySelector('.twnx'); E.acts = r.querySelector('.twa');
    E.box.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target.closest('button') || ev.target.tagName === 'INPUT') return; advance(); });
    E.canvas.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); advance(); });
    E.vow = document.createElement('div'); E.vow.id = 'twvow'; document.body.appendChild(E.vow);
    window.addEventListener('keydown', (ev) => {
      if (!UI.open) return;
      if (ev.target && ev.target.tagName === 'INPUT') { if (ev.code === 'Enter' && UI.enter) UI.enter(); return; }
      ev.stopPropagation();
      if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'KeyE') { ev.preventDefault(); if (ev.repeat) return; if (UI.waiting && !UI.typing && UI.acts.length === 1) { pressAct(0); return; } advance(); }
      else if (ev.code === 'Escape' || ev.code === 'KeyP') uiClose();
      else if (/^Digit[1-9]$/.test(ev.code) && UI.waiting) pressAct(+ev.code.slice(5) - 1);
    }, true);
  }
  const heartsHTML = (a, m) => `<span style="color:#ff5c86;text-shadow:0 0 6px rgba(255,80,130,.6)">${'♥'.repeat(a)}</span><span style="color:#4a3c48">${'♥'.repeat(Math.max(0, 10 - a))}</span>${m ? ' 💍' : ''}`;
  function parseLine(raw) {
    let s = String(raw), spk = 'c', mood = null;
    if (s.startsWith('n:')) { spk = 'n'; s = s.slice(2); } else if (s.startsWith('p:')) { spk = 'p'; s = s.slice(2); }
    const mm = /^@(\w+):/.exec(s); if (mm) { spk = 'o'; s = s.slice(mm[0].length); }
    const md = /^\[(\w+)\]/.exec(s); if (md) { mood = md[1]; s = s.slice(md[0].length); }
    s = s.replace(/\{P\}/g, pname()).replace(/\{N\}/g, (UI.o && UI.o.N) || '').replace(/\{C\}/g, '').replace(/\{L\}/g, '');
    return { spk, mood, txt: s.trim() };
  }
  function uiShow(o) {
    buildUI();
    if (UI.open && UI.o && UI.o.onClose && UI.o !== o) { try { UI.o.onClose(); } catch (e) { /* ignore */ } }
    UI.open = true; UI.o = o; UI.waiting = false; UI.done = null; UI.mood = 'idle'; UI.acts = [];
    E.root.className = 'on' + (o.portrait ? ' vn' : '');
    E.root.style.background = o.portrait ? (o.bg || `radial-gradient(circle at 24% 62%, ${o.color}55, rgba(6,5,10,.86) 64%)`) : '';
    E.sub.textContent = o.sub || ''; E.acts.innerHTML = ''; E.text.textContent = '';
    setHearts();
    if (API.state === 'play') API.state = 'menu';
    API.input.lock = null;
    sfx('ui', { vol: 0.5 });
    startTick();
  }
  function setHearts() { const o = UI.o; E.hearts.innerHTML = o && o.hearts != null ? heartsHTML(typeof o.hearts === 'function' ? o.hearts() : o.hearts, o.married && o.married()) : ''; }
  function setBg(css) { if (E.root && UI.o && UI.o.portrait) E.root.style.background = css || `radial-gradient(circle at 24% 62%, ${UI.o.color}55, rgba(6,5,10,.86) 64%)`; }
  function uiSay(lines, done) {
    if (!UI.open) return;
    UI.lines = (Array.isArray(lines) ? lines : [lines]).map(parseLine); UI.li = 0; UI.done = done || null; UI.waiting = false; UI.acts = []; E.acts.innerHTML = '';
    showLine();
  }
  function showLine() {
    const L = UI.lines[UI.li];
    UI.full = L.txt; UI.shown = 0; UI.typing = true; if (L.mood) UI.mood = L.mood; else if (L.spk === 'c') UI.mood = UI.o.mood0 || 'idle';
    E.text.className = 'twt' + (L.spk === 'n' ? ' nar' : '');
    E.name.textContent = L.spk === 'p' ? pname() : L.spk === 'n' ? '' : UI.o.name;
    E.name.style.color = L.spk === 'p' ? '#9fe8ff' : UI.o.color || '#ffe7a8';
    E.text.textContent = ''; E.next.style.visibility = 'hidden';
  }
  function advance() {
    if (!UI.open) return;
    if (UI.typing) { UI.shown = UI.full.length; return; }
    if (UI.waiting) return;
    if (UI.li < UI.lines.length - 1) { UI.li++; showLine(); sfx('ui', { vol: 0.25 }); return; }
    if (!UI.done) uiClose();
  }
  function uiActions(list) {
    if (!UI.open) return;
    UI.waiting = true; UI.acts = list; E.acts.innerHTML = ''; E.next.style.visibility = 'hidden';
    list.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = (a.off ? 'off' : '') + (a.pri ? ' pri' : '');
      b.innerHTML = `${a.t}${a.s ? `<small>${a.s}</small>` : ''}`;
      b.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
      b.addEventListener('click', (ev) => { ev.stopPropagation(); pressAct(i); });
      E.acts.appendChild(b);
    });
  }
  function pressAct(i) {
    const a = UI.acts[i]; if (!a || !UI.waiting) return;
    if (a.off) { API.toast(typeof a.off === 'string' ? a.off : 'Non disponibile'); sfx('uiBack'); return; }
    UI.waiting = false; sfx('select'); a.fn();
  }
  function uiPrompt(title, value, reroll, ok, cancel) {
    UI.waiting = true; E.acts.innerHTML = ''; UI.acts = [];
    const inp = document.createElement('input'); inp.maxLength = 18; inp.value = value; inp.placeholder = 'Nome';
    inp.addEventListener('keydown', (ev) => ev.stopPropagation()); inp.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    E.acts.appendChild(inp);
    const mk = (t, s, fn, pri) => { const b = document.createElement('button'); b.className = pri ? 'pri' : ''; b.innerHTML = t + (s ? `<small>${s}</small>` : ''); b.addEventListener('pointerdown', (ev) => ev.stopPropagation()); b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); }); E.acts.appendChild(b); };
    const go = () => { const v = inp.value.replace(/[<>{}]/g, '').trim().slice(0, 18); UI.enter = null; inp.blur(); ok(v || reroll()); };
    UI.enter = go;
    mk('🎲 Altro nome', 'Generatore di nomi', () => { inp.value = reroll(); sfx('ui'); });
    mk('✒ Nomina', title, go, true);
    mk('Annulla', '', () => { UI.enter = null; inp.blur(); cancel(); });
    setTimeout(() => { try { inp.focus({ preventScroll: true }); inp.select(); } catch (e) { /* ignore */ } }, 60);
  }
  function uiClose() {
    if (!UI.open) return;
    UI.open = false; UI.waiting = false; UI.typing = false; UI.enter = null;
    if (E.root) { E.root.className = ''; E.root.style.background = ''; }
    const o = UI.o; UI.o = null;
    if (o && o.onClose) { try { o.onClose(); } catch (e) { console.error(e); } }
    if (API.state === 'menu' && !WED) API.state = 'play';
    UI.blockUntil = performance.now() + 450;
    sfx('uiBack', { vol: 0.4 });
  }
  function uiUpdate(dt, now) {
    if (UI.typing) {
      const before = Math.floor(UI.shown);
      UI.shown = Math.min(UI.full.length, UI.shown + dt * 52);
      const n = Math.floor(UI.shown);
      if (n !== before) { E.text.textContent = UI.full.slice(0, n); if (UI.o.portrait && n % 4 === 0) sfx('ui', { vol: 0.05, pitch: 1.8 }); }
      if (n >= UI.full.length) {
        UI.typing = false; E.text.textContent = UI.full;
        if (UI.li >= UI.lines.length - 1 && UI.done) { const d = UI.done; UI.done = null; d(); }
        else E.next.style.visibility = 'visible';
      }
    }
    if (UI.o && UI.o.portrait && E.root.className.indexOf('vn') >= 0) {
      UI.t += dt;
      if ((UI.pf = (UI.pf || 0) + 1) % 2 === 0) {
        const c = E.ctx; c.clearRect(0, 0, 360, 400);
        const N = NATION();
        if (N && N.drawPortrait) { try { N.drawPortrait(UI.o.portrait, c, 180, 214, 392, UI.t, UI.mood || 'idle', { talk: UI.typing }); } catch (e) { /* ignore */ } }
        else { c.fillStyle = UI.o.color; c.beginPath(); c.arc(180, 200, 120, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 120px Georgia'; c.textAlign = 'center'; c.fillText(UI.o.name[0], 180, 245); }
      }
    }
  }
  let tickOn = false, tickLast = 0;
  function startTick() { if (tickOn) return; tickOn = true; tickLast = performance.now(); requestAnimationFrame(tick); }
  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - tickLast) / 1000)); tickLast = now;
    try {
      if (UI.open) uiUpdate(dt, now);
      if (API.state === 'menu') animWorld(dt, false);
    } catch (e) { console.error('[towns3d tick]', e); }
    if (UI.open || API.state === 'menu') requestAnimationFrame(tick); else tickOn = false;
  }

  /* ============================================================ WORLD STATE */
  const S = API.S, P = API.P;
  if (!Array.isArray(S.allies)) S.allies = [];
  S.forge = S.forge | 0;
  S.tw = Object.assign({ day: 0, talk: {}, date: {}, met: {}, party: [], q: {}, shop: { flask: 0, frag: 0 } }, S.tw || {});
  if (!Array.isArray(S.tw.party)) S.tw.party = [];
  const saveAll = () => { API.saveS(); saveMain(); };
  function nat() {
    const m = API.main; if (!m.nation || typeof m.nation !== 'object') m.nation = {};
    const n = m.nation; if (!n.companions || typeof n.companions !== 'object') n.companions = {};
    if (!(n.rings >= 0)) n.rings = 0; if (!(n.weddings >= 0)) n.weddings = 0; return n;
  }
  function cst(id) {
    const N = NATION(); if (N && N.state) { try { return N.state(id); } catch (e) { /* fall back */ } }
    const n = nat(); let c = n.companions[id]; if (!c || typeof c !== 'object') c = n.companions[id] = {};
    c.affinity = clamp(Math.floor(+c.affinity || 0), 0, 10); c.married = !!c.married; c.unlocked = !!c.unlocked; if (c.married) c.affinity = 10;
    return c;
  }
  const married = (id) => { const c = nat().companions[id]; return !!(c && c.married); };
  const NPCS = [], BEASTS = [], ALLIES = [], HEROES = {}, HLIST = [], FXL = [], PROJ = [], ROCKETS = [], FOL = [];
  let WED = null, curTown = null, lastDayT = API.DAY.t, slowT = 0, nightK = -1;
  const blocked = () => UI.open || WED || performance.now() < UI.blockUntil || API.state !== 'play';
  const dist2P = (x, z) => Math.hypot(P.x - x, P.z - z);
  const followers = () => S.allies.filter((a) => a.follow).length + S.tw.party.length;

  /* ------------------------------------------------------------ effects: rings, light pillars, projectiles */
  const RINGG = new T.RingGeometry(0.86, 1, 40), PILLG = new T.CylinderGeometry(1, 1, 1, 18, 1, true);
  function ringFx(x, z, maxR, color, dur) {
    const m = new T.Mesh(RINGG, MAT.add(color, 2.4, 0.9)); m.rotation.x = -PI / 2; m.position.set(x, groundAt(x, z) + 0.25, z); API.scene.add(m);
    FXL.push({ k: 'ring', m, t: 0, dur: dur || 0.6, maxR });
  }
  function pillarFx(x, z, color, dur, r) {
    const g = groundAt(x, z), m = new T.Mesh(PILLG, MAT.add(color, 1.3, 0.32)); m.position.set(x, g, z); API.scene.add(m);
    const c = new T.Mesh(PILLG, MAT.add('#ffffff', 1.5, 0.4)); m.add(c); c.scale.set(0.35, 1, 0.35);
    FXL.push({ k: 'pillar', m, t: 0, dur: dur || 2.4, r: r || 1.4, g });
  }
  function updateFxl(dt) {
    for (let i = FXL.length - 1; i >= 0; i--) {
      const f = FXL[i]; f.t += dt; const k = f.t / f.dur;
      if (f.k === 'ring') { const r = 0.5 + f.maxR * Math.sqrt(k); f.m.scale.set(r, r, r); f.m.material.opacity = 0.9 * (1 - k); }
      else { const h = Math.min(1, f.t * 2.5) * 40; f.m.scale.set(f.r * (1 - k * 0.6), h, f.r * (1 - k * 0.6)); f.m.position.y = f.g + h / 2; f.m.material.opacity = 0.32 * Math.min(1, (1 - k) * 2.5); f.m.rotation.y += dt * 2; }
      if (k >= 1) { API.scene.remove(f.m); f.m.material.dispose(); if (f.m.children[0]) f.m.children[0].material.dispose(); FXL.splice(i, 1); }
    }
  }
  const PDEF = {
    spear: { geo: GEO.cone4, mat: MAT.add('#7fe8ff', 3, 0.95), sc: [0.07, 0.8, 0.07], speed: 30, col: '#7fe8ff' },
    fox: { geo: GEO.sph, mat: MAT.add('#ff9a3c', 3.4, 0.95), sc: [0.24, 0.3, 0.24], speed: 15, col: '#ffb060', wob: 1.6 },
    bat: { geo: GEO.oct, mat: new T.MeshBasicMaterial({ color: hdr('#b0123c', 1.6) }), sc: [0.34, 0.05, 0.16], speed: 17, col: '#ff3b6b', wob: 1.1, flap: true },
    arrow: { geo: GEO.box, mat: new T.MeshBasicMaterial({ color: hdr('#d8ffb0', 2.2) }), sc: [0.04, 0.04, 0.9], speed: 42, col: '#c5ff8a' },
    star: { geo: GEO.oct, mat: MAT.add('#c39bff', 3.4, 0.95), sc: [0.22, 0.22, 0.22], speed: 22, col: '#b388ff', spin: true },
  };
  const PPOOL = {};
  function shoot(kind, x, y, z, tgt, dmg, loud) {
    const D = PDEF[kind], pool = PPOOL[kind] || (PPOOL[kind] = []);
    let m = pool.pop(); if (!m) { m = new T.Mesh(D.geo, D.mat); m.scale.set(D.sc[0], D.sc[1], D.sc[2]); }
    m.position.set(x, y, z); m.visible = true; API.scene.add(m);
    PROJ.push({ kind, D, m, x, y, z, tgt, dmg, t: 0, ph: rand(0, 6), loud, sx: rand(-1, 1) });
  }
  const _lv = new T.Vector3();
  function updateProj(dt) {
    for (let i = PROJ.length - 1; i >= 0; i--) {
      const p = PROJ[i], e = p.tgt; p.t += dt;
      const tx = e.x, ty = e.y + (e.d.boss ? 3 : 1.1), tz = e.z;
      let dx = tx - p.x, dy = ty - p.y, dz = tz - p.z; const d = Math.hypot(dx, dy, dz) || 1;
      const step = p.D.speed * dt; dx /= d; dy /= d; dz /= d;
      p.x += dx * step; p.y += dy * step; p.z += dz * step;
      let ox = 0, oy = 0;
      if (p.D.wob) { const w = Math.sin(p.t * 9 + p.ph) * p.D.wob * Math.min(1, d / 4); ox = -dz * w * p.sx; oy = Math.cos(p.t * 7 + p.ph) * 0.3; }
      p.m.position.set(p.x + ox, p.y + oy, p.z + (p.D.wob ? dx * Math.sin(p.t * 9 + p.ph) * p.D.wob * 0.3 : 0));
      _lv.set(tx, ty, tz); p.m.lookAt(_lv);
      if (p.kind === 'spear') p.m.rotateX(PI / 2);
      if (p.D.spin) p.m.rotation.z += p.t * 12;
      if (p.D.flap) p.m.scale.x = p.D.sc[0] * (0.6 + Math.abs(Math.sin(p.t * 26)) * 0.8);
      if (Math.random() < 0.6) API.emit(p.m.position.x, p.m.position.y, p.m.position.z, 1, p.D.col, { speed: 0.4, grav: 0, life: 0.35, size: 0.3, bright: 2 });
      if (d < 0.8 || e.dead || p.t > 2.5) {
        if (!e.dead && d < 1.6) {
          const kx = dx, kz = dz;
          if (p.loud) API.hitEnemy(e, p.dmg, 10, kx, kz); else { API.hitEnemyQuiet(e, p.dmg); e.vx += kx * 2; e.vz += kz * 2; }
          API.emit(p.x, p.y, p.z, 14, p.D.col, { speed: 5, life: 0.6, size: 0.4, bright: 2.4 });
        }
        API.scene.remove(p.m); PPOOL[p.kind].push(p.m); PROJ.splice(i, 1);
      }
    }
  }
  function updateRockets(dt) {
    for (let i = ROCKETS.length - 1; i >= 0; i--) {
      const r = ROCKETS[i]; r.t += dt; r.y += r.vy * dt; r.vy -= 6 * dt;
      API.emit(r.x, r.y, r.z, 1, '#ffe7a8', { speed: 0.3, grav: 2, life: 0.5, size: 0.25, bright: 2 });
      if (r.t > r.life) {
        API.emit(r.x, r.y, r.z, LOW ? 40 : 70, r.col, { speed: 11, grav: 3.5, life: 1.7, size: 0.55, bright: 3 });
        API.emit(r.x, r.y, r.z, 20, '#ffffff', { speed: 5, grav: 2, life: 1.0, size: 0.4, bright: 3 });
        sfx('explosion', { vol: 0.18 }); ROCKETS.splice(i, 1);
      }
    }
  }

  /* ------------------------------------------------------------ villagers */
  function roleLabel(role, f) {
    if (role === 'cittadino') return f ? 'Cittadina' : 'Cittadino';
    if (role === 'bambino') return f ? 'Bambina' : 'Bambino';
    if (role === 'locandiere') return f ? 'Locandiera' : 'Locandiere';
    return ROLE_NAME[role] || role;
  }
  function makeLook(o) {
    const f = !!o.female, hair = pick(HAIRS);
    return Object.assign({
      female: f, skin: pick(SKINS), hair, cloth: pick(CLOTHS), pants: pick(PANTS), dress: f ? pick(CLOTHS) : null,
      hairStyle: f ? pick(['long', 'bun', 'braid', 'long']) : pick(['short', 'spiky', 'short', 'bald']),
      hat: Math.random() < 0.4 ? pick(f ? ['kerchief', 'straw', 'kerchief'] : ['cap', 'straw', 'hood']) : null, hatC: pick(CLOTHS),
      beard: !f && Math.random() < 0.3 ? hair : null, tool: !f || Math.random() < 0.7 ? null : 'basket',
    }, o.look || {});
  }
  function spawnVillager(TW, o) {
    const female = o.female != null ? o.female : Math.random() < 0.5;
    const lk = makeLook(Object.assign({}, o, { female }));
    const m = villagerModel(Object.assign({ role: o.role }, lk)); API.scene.add(m.root);
    const name = o.name || (o.role === 'bambino' ? pick(NAMES_K) : female ? pick(NAMES_F) : pick(NAMES_M));
    const npc = { m, TW, role: o.role, pool: o.pool, name, female, sub: o.sub || roleLabel(o.role, female), x: o.x, z: o.z, rot: o.ry || rand(0, TAU),
      post: o.post ? { x: o.x, z: o.z, ry: o.ry || 0 } : null, state: 'idle', t: rand(0.5, 4), speed: o.role === 'bambino' ? rand(2.4, 3) : rand(1.1, 1.5),
      node: -1, prev: -1, tx: o.x, tz: o.z, ph: rand(0, 6), hy: 0, last: '', cheer: 0, gather: null, anim: o.anim || null, at: rand(0, 5), greet: o.greet || null };
    npc.ia = { x: npc.x, z: npc.z, r: 2.5, label: `Parla con ${name} (${npc.sub})`, action: () => talkNpc(npc) };
    NPCS.push(npc);
    return npc;
  }
  function nearestNode(TW, x, z) { let b = 0, bd = 1e9; TW.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; b = i; } }); return b; }
  function pickTarget(e, TW) {
    const N = TW.nodes; if (!N.length) return;
    if (e.node < 0) e.node = nearestNode(TW, e.x, e.z);
    else { const nb = N[e.node].n; let nx = nb[(Math.random() * nb.length) | 0]; if (nx === e.prev && nb.length > 1) nx = nb[(Math.random() * nb.length) | 0]; e.prev = e.node; e.node = nx; }
    e.tx = N[e.node].x + rand(-0.7, 0.7); e.tz = N[e.node].z + rand(-0.7, 0.7);
  }
  function walkTo(e, dt, tx, tz, speed) {
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return true;
    const a = Math.atan2(dx, dz); e.rot += angDiff(e.rot, a) * Math.min(1, dt * 6);
    const s = Math.min(d, speed * dt); e.x += Math.sin(e.rot) * s; e.z += Math.cos(e.rot) * s;
    return false;
  }
  function lookAtPlayer(m, e, dt, range) {
    const d = dist2P(e.x, e.z);
    const want = d < (range || 7) ? clamp(angDiff(e.rot, Math.atan2(P.x - e.x, P.z - e.z)), -1.1, 1.1) : Math.sin(e.ph * 0.35) * 0.35;
    m.head.rotation.y += (want - m.head.rotation.y) * Math.min(1, dt * 4);
  }
  function updateNpc(n, dt, logic) {
    const m = n.m; n.ph += dt;
    let moving = false;
    if (logic) {
      if (n.state === 'talk') { n.rot += angDiff(n.rot, Math.atan2(P.x - n.x, P.z - n.z)) * Math.min(1, dt * 6); }
      else if (n.gather) { if (!walkTo(n, dt, n.gather.x, n.gather.z, n.speed * 2)) moving = true; else n.rot += angDiff(n.rot, n.gather.ry) * Math.min(1, dt * 4); }
      else if (n.post) {
        const d = Math.hypot(n.x - n.post.x, n.z - n.post.z);
        if (d > 0.3) { walkTo(n, dt, n.post.x, n.post.z, n.speed); moving = true; } else n.rot += angDiff(n.rot, n.post.ry) * Math.min(1, dt * 3);
      } else if (n.state === 'walk') {
        if (dist2P(n.x, n.z) < 1.3 && Math.abs(angDiff(n.rot, Math.atan2(P.x - n.x, P.z - n.z))) < 0.8) { /* wait for the player to pass */ }
        else if (walkTo(n, dt, n.tx, n.tz, n.speed)) { n.state = 'idle'; n.t = n.role === 'bambino' ? rand(0.3, 1.5) : rand(1.5, 6); } else moving = true;
      } else { n.t -= dt; if (n.t <= 0) { pickTarget(n, n.TW); n.state = 'walk'; } }
    }
    const y = groundAt(n.x, n.z);
    m.root.position.set(n.x, y, n.z); m.root.rotation.y = n.rot;
    if (moving) {
      const k = n.speed * (n.gather ? 2 : 1), sw = Math.sin(n.ph * (4 + k * 2.2)) * Math.min(0.75, 0.35 + k * 0.15);
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.7; m.armR.rotation.x = sw * 0.7; m.g.position.y = Math.abs(sw) * 0.06;
      m.armL.rotation.z = 0; m.armR.rotation.z = 0;
    } else {
      m.legL.rotation.x *= 0.8; m.legR.rotation.x *= 0.8; m.g.position.y = 0;
      const br = Math.sin(n.ph * 1.8) * 0.04;
      m.armL.rotation.x = br; m.armR.rotation.x = -br; m.armL.rotation.z = 0.06; m.armR.rotation.z = -0.06;
      if (n.anim === 'hammer') {
        const c = (n.ph * 1.6) % 1, up = c < 0.6 ? c / 0.6 : 1 - (c - 0.6) / 0.4;
        m.armR.rotation.x = -0.4 - up * 1.9; m.armL.rotation.x = -0.5;
        if (c > 0.97 && !n.hit) { n.hit = true; const sp = n.TW.sparks[0]; if (sp && dist2P(sp.x, sp.z) < 45) { API.emit(sp.x, sp.y, sp.z, 10, '#ffb04a', { speed: 4.5, up: 2.5, grav: 12, life: 0.55, size: 0.16, bright: 3 }); if (dist2P(sp.x, sp.z) < 14) sfx('hit', { vol: 0.12 }); } }
        if (c < 0.5) n.hit = false;
      } else if (n.anim === 'wave' && dist2P(n.x, n.z) < 9 && n.state !== 'talk') { m.armR.rotation.x = -2.6; m.armR.rotation.z = -0.3 + Math.sin(n.ph * 9) * 0.35; }
      if (n.cheer > 0) { n.cheer -= dt; m.g.position.y = Math.abs(Math.sin(n.ph * 7)) * 0.25; m.armL.rotation.x = -2.8; m.armR.rotation.x = -2.8; m.armL.rotation.z = 0.3; m.armR.rotation.z = -0.3; }
      else if (n.role === 'bambino' && Math.sin(n.ph * 0.9 + n.at) > 0.7) m.g.position.y = Math.abs(Math.sin(n.ph * 8)) * 0.18;
      if (n.state === 'talk') { m.armR.rotation.x = -0.6 + Math.sin(n.ph * 5) * 0.25; m.armR.rotation.z = -0.15; }
    }
    lookAtPlayer(m, n, dt, n.state === 'talk' ? 20 : 6);
  }
  function talkNpc(n) {
    if (blocked()) return;
    n.state = 'talk';
    uiShow({ name: n.name, sub: n.sub, color: '#ffe7a8', N: n.name, onClose: () => { n.state = 'idle'; n.t = rand(1, 2.5); } });
    const greet = n.greet || GREET[n.role];
    if (n.role === 'mercante') uiSay([greet], () => shopMenu(n));
    else if (n.role === 'fabbro') uiSay([greet], () => forgeMenu(n));
    else if (n.role === 'anziano') uiSay([greet], () => elderMenu(n));
    else if (n.role === 'locandiere') uiSay([greet], () => innMenu(n));
    else chat(n);
  }
  function lineFrom(n, pool) { let s = pick(pool), k = 0; while (pool.length > 1 && s === n.last && k++ < 6) s = pick(pool); n.last = s; return s; }
  function chat(n) {
    const pool = LINES[n.pool || n.role] || LINES.cittadino;
    uiSay([lineFrom(n, pool)], () => uiActions([{ t: '💬 Raccontami altro', fn: () => chat(n) }, { t: 'Arrivederci', fn: uiClose }]));
  }
  /* --- merchant */
  function shopMenu(n) {
    const fc = 800 + 400 * S.tw.shop.flask, fr = 1500 + 600 * S.tw.shop.frag, rings = nat().rings;
    uiActions([
      { t: `⚗ Gelatina Cremisi — ${fmtN(fc)} anime`, s: `+1 carica di cura (ora ${S.flasks})`, off: S.flasks >= 14 ? 'Hai già il massimo di Gelatine.' : S.runes < fc ? 'Anime insufficienti.' : null,
        fn: () => { S.runes -= fc; S.flasks++; P.flasks++; S.tw.shop.flask++; API.saveS(); sfx('coin'); API.emit(P.x, groundAt(P.x, P.z) + 1.2, P.z, 18, '#ff6b6b', { speed: 2, up: 3, grav: 0 });
          uiSay([pick(["Ecco a te! Fresca di giornata. Non chiedermi di che cosa.", "Agitare prima dell'uso. O dopo. Comunque funziona."])], () => shopMenu(n)); } },
      { t: `✦ Frammento d'Anima — ${fmtN(fr)} anime`, s: '+1 livello a una statistica a scelta', off: S.runes < fr ? 'Anime insufficienti.' : null, fn: () => fragMenu(n, fr) },
      { t: `💍 Anello di Magicule — 3.000 anime`, s: `Serve per una proposta di matrimonio (ne hai ${rings})`, off: S.runes < 3000 ? 'Anime insufficienti.' : null,
        fn: () => { S.runes -= 3000; nat().rings++; saveAll(); sfx('chest'); oracle('《Anello di Magicule ottenuto. Probabilità di arrossire: 100%.》', true);
          uiSay(["Un Anello di Magicule! Brilla come le guance di chi lo riceve. Chi è la fortunata, Maestà? ...Non dirmelo, voglio indovinare."], () => shopMenu(n)); } },
      { t: 'Arrivederci', fn: uiClose },
    ]);
  }
  function fragMenu(n, cost) {
    const st = [['vig', 'Vigore', 'più vita'], ['mnd', 'Mente', 'più FP'], ['end', 'Tempra', 'più stamina'], ['str', 'Forza', 'più danno']];
    uiActions(st.map(([k, nm, d]) => ({ t: `${nm} ${S[k]} → ${S[k] + 1}`, s: d, fn: () => {
      if (S.runes < cost) { API.toast('Anime insufficienti.'); return; }
      S.runes -= cost; S[k]++; S.level++; S.tw.shop.frag++; API.recalc(false); API.saveS(); sfx('levelup');
      API.emit(P.x, groundAt(P.x, P.z) + 0.6, P.z, 40, '#ffd36b', { speed: 2, up: 6, grav: -2, life: 1.4 }); ringFx(P.x, P.z, 5, '#ffd36b');
      oracle(`《Frammento d'Anima assorbito. ${nm} +1 · Livello ${S.level}》`);
      uiSay(["Ottimo acquisto! Sento già la tua aura più... aurosa."], () => shopMenu(n));
    } })).concat([{ t: 'Indietro', fn: () => shopMenu(n) }]));
  }
  /* --- blacksmith */
  const forgeCost = () => Math.round(1200 * Math.pow(S.forge + 1, 1.6));
  function forgeMenu(n) {
    const lv = S.forge, c = forgeCost();
    uiActions([
      { t: `⚒ Rinforza (Lv ${lv} → ${lv + 1}) — ${fmtN(c)} anime`, s: `Danno +10% per livello (ora +${lv * 10}%)`, off: lv >= 10 ? 'La tua forza ha raggiunto il limite della fucina.' : S.runes < c ? 'Anime insufficienti.' : null,
        fn: () => {
          S.runes -= c; S.forge++; API.saveS(); sfx('levelup'); API.setShake(0.25);
          const sp = n.TW.sparks[0] || { x: n.x, y: groundAt(n.x, n.z) + 1, z: n.z };
          API.emit(sp.x, sp.y, sp.z, 60, '#ffb04a', { speed: 7, up: 4, grav: 10, life: 0.8, size: 0.2, bright: 3.2 });
          API.emit(P.x, groundAt(P.x, P.z) + 1, P.z, 30, '#ff8a3a', { speed: 3, up: 3, grav: -1, life: 1.2 }); ringFx(P.x, P.z, 4, '#ff8a3a');
          oracle(`《Potenziamento della fucina: danno +${S.forge * 10}%》`);
          uiSay([pick(["Clang! Clang! ...Fatto! Senti come vibra? Quello è potere. O forse è il mio braccio.", "Il metallo canta! Il tuo corpo gelatinoso ora taglia come una lama. Non chiedermi come: segreto di bottega.", "Un colpo per la Nazione, uno per il Sovrano e uno... perché mi piace martellare. Ecco fatto!"])], () => forgeMenu(n));
        } },
      { t: '💬 Due chiacchiere', fn: () => uiSay([pick(["Gorvan portava un'ascia grande quanto la mia fucina. Se lo affronti, rinforzati prima. Molto prima.", "Il segreto di una buona lama? Fuoco, pazienza e un Sovrano che paga in anticipo. Ah, ah!", "Un tempo forgiavo spade per il Tiranno. Ora forgio per chi protegge. Il ferro, giuro, suona più felice."])], () => forgeMenu(n)) },
      { t: 'Arrivederci', fn: uiClose },
    ]);
  }
  /* --- elder & quests */
  const QUESTS = [
    { id: 'lupi', name: 'Caccia ai Lupi', desc: 'Abbatti 10 lupi famelici nelle terre selvagge.', need: 10, reward: 2000, prog: () => (S.tw.q.lupi && S.tw.q.lupi.n) || 0 },
    { id: 'luci', name: 'Le Luci di Grazia', desc: 'Trova tutte le Luci di Grazia ✦ delle Terre Spezzate.', need: API.LOC.grace.length, reward: 5000, prog: () => Object.keys(S.found).filter((k) => S.found[k]).length },
    { id: 'tiranno', name: 'La Caduta del Tiranno', desc: 'Sconfiggi Gorvan, il Tiranno Caduto, nelle Terre Cremisi.', need: 1, reward: 8000, prog: () => (S.bosses.tyrant ? 1 : 0) },
    { id: 'drago', name: 'Il Cuore della Tempesta', desc: 'Sconfiggi il Drago della Tempesta Antica sulla Vetta.', need: 1, reward: 12000, prog: () => (S.bosses.dragon ? 1 : 0) },
  ];
  function elderMenu(n) {
    uiActions([
      { t: '📜 Raccontami del mondo', fn: () => uiSay([lineFrom(n, LINES.anziano)], () => elderMenu(n)) },
      { t: '🗡 Incarichi', s: questSummary(), fn: () => questMenu(n) },
      { t: 'Arrivederci', fn: uiClose },
    ]);
  }
  function questSummary() { const on = QUESTS.filter((q) => S.tw.q[q.id] && !S.tw.q[q.id].done).length, ready = QUESTS.filter((q) => S.tw.q[q.id] && !S.tw.q[q.id].done && q.prog() >= q.need).length; return ready ? `${ready} da consegnare!` : on ? `${on} in corso` : 'Nuovi incarichi disponibili'; }
  function questMenu(n) {
    const list = QUESTS.map((q) => {
      const st = S.tw.q[q.id], p = Math.min(q.need, q.prog());
      if (!st) return { t: `Accetta: ${q.name}`, s: `${q.desc} · Ricompensa ${fmtN(q.reward)} anime`, fn: () => { S.tw.q[q.id] = { n: 0, done: false }; API.saveS(); sfx('skillGet'); oracle(`《Incarico accettato: ${q.name}》`); uiSay([`Che gli spiriti ti guidino, ${pname()}. ${q.desc} Torna da me quando avrai finito.`], () => questMenu(n)); } };
      if (st.done) return { t: `✓ ${q.name}`, s: 'Completato', off: 'Incarico già completato.' };
      if (p >= q.need) return { t: `🎁 Consegna: ${q.name}`, s: `Ricompensa: ${fmtN(q.reward)} anime`, pri: true, fn: () => {
        st.done = true; S.runes += q.reward; API.saveS(); sfx('victory'); API.bigMsg('INCARICO COMPLETATO', 'gold', 3);
        API.emit(P.x, groundAt(P.x, P.z) + 1, P.z, 50, '#ffd36b', { speed: 4, up: 5, grav: -1, life: 1.6 }); ringFx(P.x, P.z, 6, '#ffd36b');
        uiSay([`Straordinario! Le storie parleranno di questo giorno. Ecco ${fmtN(q.reward)} anime: le ho messe da parte per... beh, per te.`], () => questMenu(n)); } };
      return { t: `${q.name} — ${p}/${q.need}`, s: q.desc, off: `${q.name}: ${p}/${q.need}` };
    });
    uiActions(list.concat([{ t: 'Indietro', fn: () => elderMenu(n) }]));
  }
  /* --- innkeeper */
  function innMenu(n) {
    uiActions([
      { t: '🛏 Riposa', s: 'Vita, FP e Gelatine al massimo (gratis per Sua Maestà)', fn: () => innRest(n, false) },
      { t: '🌙 Dormi fino al mattino', s: 'Riposa e salta la notte', fn: () => innRest(n, true) },
      { t: '🍲 Zuppa della casa — 60 anime', s: 'Una scodella fumante e un consiglio', off: S.runes < 60 ? 'Anime insufficienti.' : null, fn: () => {
        S.runes -= 60; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.3); API.saveS(); sfx('heal');
        uiSay([pick(["Zuppa di radici del nord e funghi della palude. Il segreto è non chiedere quale fungo.", "Ecco! Calda calda. Gli Hobgoblin ne mangiano tre scodelle a testa. Uno ha provato a mangiare anche la scodella.", "Dicono che la Kitsune venga qui di nascosto per il tofu fritto. Io non ho visto niente. Niente!"])], () => innMenu(n)); } },
      { t: 'Arrivederci', fn: uiClose },
    ]);
  }
  function innRest(n, morning) {
    P.hp = P.maxHp; P.fp = P.maxFp; P.flasks = S.flasks; P.st = P.maxSt;
    if (morning) { const t = API.DAY.t; if (t > 0.27) S.tw.day++; API.DAY.t = 0.27; lastDayT = 0.27; }
    API.saveS(); sfx('heal'); setTimeout(() => sfx('coin', { vol: 0.4 }), 350);
    API.emit(P.x, groundAt(P.x, P.z) + 0.6, P.z, 40, '#8cff9a', { speed: 1.5, up: 3, grav: -1, life: 1.6 });
    uiSay([morning ? "Buongiorno, Maestà! Hai dormito come un sasso. Un sasso molto morbido e un po' appiccicoso." : "Riposato? Hai russato in gelatinese, ma con molta eleganza."], () => innMenu(n));
  }

  /* ------------------------------------------------------------ peaceful goblins & wolves, naming */
  function spawnBeast(kind, idx, TW) {
    const src = (kind === 'gob' ? 'g' : 'w') + idx;
    if (S.allies.some((a) => a.src === src)) return;
    const m = kind === 'gob' ? goblinModel() : wildWolfModel(); API.scene.add(m.root);
    const nd = TW.nodes[idx % TW.nodes.length];
    const bang = new T.Sprite(BANG); bang.scale.set(0.42, 0.84, 1); API.scene.add(bang);
    const b = { kind, src, m, TW, x: nd.x, z: nd.z, rot: rand(0, TAU), state: 'idle', t: rand(0.5, 3), speed: kind === 'gob' ? 1.3 : 1.7, node: -1, prev: -1, tx: nd.x, tz: nd.z, ph: rand(0, 6), bang, naming: null };
    b.ia = { x: b.x, z: b.z, r: 2.6, label: kind === 'gob' ? 'Parla con il goblin senza nome' : 'Avvicinati al lupo selvatico', action: () => talkBeast(b) };
    BEASTS.push(b);
  }
  function updateBeast(b, dt, logic) {
    const m = b.m; b.ph += dt;
    let moving = false;
    if (b.naming) {
      const k = b.naming.t; m.root.position.y = groundAt(b.x, b.z) + Math.min(1.4, k * 1.1) + Math.sin(k * 6) * 0.05; m.root.rotation.y += dt * (2 + k * 9);
      b.bang.visible = false; return;
    }
    if (logic) {
      if (b.state === 'talk') b.rot += angDiff(b.rot, Math.atan2(P.x - b.x, P.z - b.z)) * Math.min(1, dt * 5);
      else if (b.state === 'walk') { if (walkTo(b, dt, b.tx, b.tz, b.speed)) { b.state = 'idle'; b.t = rand(1.5, 5); } else moving = true; }
      else { b.t -= dt; if (b.t <= 0) { pickTarget(b, b.TW); b.state = 'walk'; } }
    }
    const y = groundAt(b.x, b.z); m.root.position.set(b.x, y, b.z); m.root.rotation.y = b.rot;
    if (b.kind === 'gob') {
      const sw = moving ? Math.sin(b.ph * 8) * 0.6 : 0; m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.6; m.armR.rotation.x = moving ? sw * 0.6 : Math.sin(b.ph * 1.7) * 0.08;
      m.root.position.y += moving ? Math.abs(sw) * 0.05 : Math.sin(b.ph * 2.2) * 0.02;
      if (!moving && b.state !== 'talk' && dist2P(b.x, b.z) < 8) { m.armR.rotation.x = -2.5; m.armR.rotation.z = Math.sin(b.ph * 8) * 0.3; } else m.armR.rotation.z = 0;
    } else {
      m.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(b.ph * 12 + (i % 2) * PI + (i > 1 ? 1 : 0)) * 0.7 : 0; });
      m.tail.rotation.x = 0.4 + Math.sin(b.ph * (dist2P(b.x, b.z) < 8 ? 14 : 4)) * 0.25; m.tail.rotation.y = Math.sin(b.ph * 10) * (dist2P(b.x, b.z) < 8 ? 0.5 : 0.1);
    }
    lookAtPlayer(m, b, dt, 8);
    b.bang.visible = m.root.visible && !UI.open; b.bang.position.set(b.x, y + (b.kind === 'gob' ? 2.75 : 2.3) + Math.abs(Math.sin(b.ph * 3)) * 0.18, b.z);
  }
  function talkBeast(b) {
    if (blocked()) return;
    b.state = 'talk';
    uiShow({ name: b.kind === 'gob' ? 'Goblin senza nome' : 'Lupo selvatico', sub: b.kind === 'gob' ? 'Pacifico · senza nome' : 'Pacifico · Tana dei Lupi', color: b.kind === 'gob' ? '#c5ff8a' : '#bcd3ec', onClose: () => { if (!b.naming) { b.state = 'idle'; b.t = 1; } } });
    const cost = Math.round(P.maxFp * 0.3);
    uiSay([pick(b.kind === 'gob' ? GOB_LINES : WOLF_LINES)], () => uiActions([
      { t: '✒ Dai un nome', s: `Il nominare consuma magicule (${cost} FP, il 30% del massimo)`, pri: true, fn: () => nameFlow(b, cost) },
      { t: 'Lascia stare', fn: uiClose },
    ]));
  }
  function nameFlow(b, cost) {
    const kind = b.kind === 'gob' ? 'hobgoblin' : 'lupo';
    if (P.fp < cost) { UI.o.name = 'Oracolo'; UI.o.color = '#7fd4ff'; uiSay([`《Magicule insufficienti. Il nominare consuma il 30% degli FP massimi: ne servono ${cost}, ne hai ${Math.floor(P.fp)}.》`], () => uiActions([{ t: 'Capito', fn: uiClose }])); return; }
    uiSay([b.kind === 'gob' ? 'n:Il goblin ti guarda con occhi enormi e speranzosi. Che nome gli darai?' : 'n:Il lupo si siede composto, le orecchie dritte. Che nome gli darai?'], () =>
      uiPrompt(`Costa ${cost} FP`, genName(kind), () => genName(kind), (name) => { uiClose(); doNaming(b, name, cost); }, () => uiClose()));
  }
  function doNaming(b, name, cost) {
    if (P.fp < cost) return;
    P.fp -= cost; b.naming = { t: 0, name, done: false };
    sfx('name'); oracle('《Il nominare consuma magicule.》');
    pillarFx(b.x, b.z, b.kind === 'gob' ? '#c5ff8a' : '#7fb8ff', 3.2, 1.6);
    API.flashLight.color.set(b.kind === 'gob' ? '#c5ff8a' : '#8ec5ff'); API.flashLight.intensity = 40; API.flashLight.position.set(b.x, groundAt(b.x, b.z) + 3, b.z);
    API.setShake(0.15);
  }
  function updateNaming(b, dt) {
    const nm = b.naming; nm.t += dt;
    const g = groundAt(b.x, b.z);
    if (Math.random() < 0.9) { const a = rand(0, TAU), r = rand(2.5, 4.5); API.emit(b.x + Math.cos(a) * r, g + rand(0.3, 3), b.z + Math.sin(a) * r, 1, b.kind === 'gob' ? '#d8ffb0' : '#9fd8ff', { speed: 0.2, grav: -1.5, life: 0.7, size: 0.4, bright: 2.4 }); }
    API.flashLight.intensity = Math.max(API.flashLight.intensity, 25 + nm.t * 20); API.flashLight.position.set(b.x, g + 3, b.z);
    if (nm.t > 1.6 && !nm.done) {
      nm.done = true;
      API.scene.remove(b.m.root); API.scene.remove(b.bang);
      const kind = b.kind === 'gob' ? 'hobgoblin' : 'lupo';
      const rec = { name: nm.name, kind, src: b.src, follow: followers() < 6 };
      S.allies.push(rec); API.saveS();
      try { if (NATION() && NATION().onNamed) NATION().onNamed(nm.name, kind === 'lupo' ? 'wolf' : 'goblin'); } catch (e) { /* optional */ }
      const a = spawnAlly(rec, b.x, b.z); a.pop = 0.6;
      API.emit(b.x, g + 1.4, b.z, LOW ? 60 : 110, kind === 'lupo' ? '#7fb8ff' : '#d8ffb0', { speed: 9, up: 4, grav: 2, life: 1.3, size: 0.5, bright: 2.8 });
      ringFx(b.x, b.z, 9, kind === 'lupo' ? '#7fb8ff' : '#ffe08a', 0.8); ringFx(b.x, b.z, 5, '#ffffff', 0.5);
      API.flashLight.intensity = 90; API.setShake(0.55); API.setHitstop(0.06); sfx('evolve');
      oracle(kind === 'lupo' ? '《Il lupo si evolve in Lupo Tempesta!》' : '《Il goblin si evolve in Hobgoblin!》', true);
      API.bigMsg(`«${nm.name}»`, 'gold', 2.6);
      setTimeout(() => API.toast(rec.follow ? `${nm.name} si unisce al tuo seguito!` : `${nm.name} ti attenderà al villaggio (seguito al completo).`), 1800);
      const i = BEASTS.indexOf(b); if (i >= 0) BEASTS.splice(i, 1);
    }
  }

  /* ------------------------------------------------------------ named allies (Hobgoblin, Lupo Tempesta) */
  function spawnAlly(rec, x, z) {
    const wolf = rec.kind === 'lupo', m = wolf ? stormWolfModel() : hobgoblinModel(); API.scene.add(m.root);
    const label = labelSprite(rec.name, wolf ? '#9fd8ff' : '#c5ff8a', wolf ? 'Lupo Tempesta' : 'Hobgoblin');
    const a = { rec, wolf, m, label, x, z, rot: rand(0, TAU), atk: null, cd: rand(0.5, 1.2), scan: 0, tgt: null, ph: rand(0, 6), home: wolf ? DEN : GOB, node: -1, prev: -1, tx: x, tz: z, state: 'idle', t: 1,
      speed: wolf ? 10 : 7.6, reach: wolf ? 2.3 : 2.5, dmg: wolf ? 17 : 22, hy: wolf ? 2.75 : 3.55, pop: 0, hits: 0 };
    a.ia = { x, z, r: 2.4, label: `Parla con ${rec.name}`, action: () => talkAlly(a) };
    ALLIES.push(a); return a;
  }
  function talkAlly(a) {
    if (blocked()) return;
    a.talk = true;
    uiShow({ name: a.rec.name, sub: a.wolf ? 'Lupo Tempesta · alleato' : 'Hobgoblin · alleato', color: a.wolf ? '#9fd8ff' : '#c5ff8a', N: a.rec.name, onClose: () => { a.talk = false; } });
    const opts = () => [
      a.rec.follow ? { t: '🏠 Aspetta al villaggio', s: 'Torna a casa e riposa', fn: () => { a.rec.follow = false; a.node = -1; API.saveS(); uiSay([a.wolf ? '(Abbaia una volta e corre verso la tana.)' : 'Agli ordini! Terrò il fuoco acceso per te, Maestà.'], () => uiActions([{ t: 'Arrivederci', fn: uiClose }])); } }
        : { t: '⚔ Seguimi', s: `Seguito: ${followers()}/6`, off: followers() >= 6 ? 'Il tuo seguito è al completo (massimo 6).' : null, fn: () => { a.rec.follow = true; API.saveS(); uiSay([a.wolf ? '(Ulula di gioia e ti si mette al fianco.)' : 'Finalmente! La mia lama è tua, Maestà!'], () => uiActions([{ t: 'Andiamo', fn: uiClose }])); } },
      { t: 'Arrivederci', fn: uiClose },
    ];
    uiSay([pick(ALLY_LINES[a.rec.kind] || ALLY_LINES.hobgoblin)], () => uiActions(opts()));
  }
  const SLOTS = [[-2.0, -2.0], [2.0, -2.0], [-3.6, -3.8], [3.6, -3.8], [-1.3, -5.4], [1.3, -5.4]];
  function slotPos(i) {
    const s = SLOTS[i % 6], c = Math.cos(P.rot), sn = Math.sin(P.rot);
    return [P.x + s[0] * c + s[1] * sn, P.z - s[0] * sn + s[1] * c];
  }
  function findTarget(e, range) {
    let best = null, bd = range;
    for (const en of API.enemies) {
      if (en.dead || en.passive || !en.model.root.visible) continue;
      const d = Math.hypot(en.x - e.x, en.z - e.z) - en.d.r;
      if (d < bd && Math.hypot(en.x - P.x, en.z - P.z) < 24) { bd = d; best = en; }
    }
    return best;
  }
  /* shared follower brain for allies and companions; returns movement speed */
  function followBrain(e, slot, dt, atkFn, ranged) {
    const [fx, fz] = slotPos(slot), dP = dist2P(e.x, e.z);
    if (dP > 40) { // teleport back beside the player
      API.emit(e.x, groundAt(e.x, e.z) + 1, e.z, 20, '#bfefff', { speed: 3, up: 2, grav: 0, life: 0.6 });
      e.x = fx; e.z = fz; e.atk = null; e.tgt = null;
      API.emit(e.x, groundAt(e.x, e.z) + 1, e.z, 26, '#bfefff', { speed: 3, up: 2, grav: 0, life: 0.7 }); ringFx(e.x, e.z, 2.5, '#bfefff', 0.4);
      return 0;
    }
    e.cd -= dt; e.scan -= dt;
    if (e.scan <= 0) { e.scan = 0.35; if (!e.tgt || e.tgt.dead || Math.hypot(e.tgt.x - P.x, e.tgt.z - P.z) > 26) e.tgt = findTarget(e, 16); }
    if (e.atk) {
      e.atk.t += dt; const tg = e.atk.tgt;
      if (!tg.dead) e.rot += angDiff(e.rot, Math.atan2(tg.x - e.x, tg.z - e.z)) * Math.min(1, dt * 10);
      if (!e.atk.hit && e.atk.t >= e.atk.wind) { e.atk.hit = true; if (!tg.dead) atkFn(e, tg); }
      if (e.atk.t >= e.atk.wind + 0.45) { e.atk = null; e.cd = rand(0.9, 1.5); }
      return 0;
    }
    if (e.tgt && !e.tgt.dead) {
      const tg = e.tgt, d = Math.hypot(tg.x - e.x, tg.z - e.z) - tg.d.r, want = ranged ? 9 : e.reach;
      if (d > want) { walkTo(e, dt, tg.x, tg.z, e.speed * 1.1); return e.speed; }
      e.rot += angDiff(e.rot, Math.atan2(tg.x - e.x, tg.z - e.z)) * Math.min(1, dt * 8);
      if (e.cd <= 0) e.atk = { t: 0, wind: ranged ? 0.38 : 0.3, hit: false, tgt: tg };
      return 0;
    }
    const d = Math.hypot(fx - e.x, fz - e.z);
    if (d > 0.6) { const sp = Math.min(17, e.speed * (0.45 + d / 5)); walkTo(e, dt, fx, fz, sp); return sp; }
    e.rot += angDiff(e.rot, P.rot) * Math.min(1, dt * 3);
    return 0;
  }
  function allyStrike(a, tg) {
    const dmg = a.dmg * Math.max(1, P.dmg) * rand(0.9, 1.1), kx = Math.sin(a.rot), kz = Math.cos(a.rot);
    a.hits++;
    if (a.hits % 3 === 0) API.hitEnemy(tg, dmg * 1.3, 12, kx, kz);
    else { API.hitEnemyQuiet(tg, dmg); tg.vx += kx * 3; tg.vz += kz * 3; sfx('hit', { vol: 0.3 }); }
    const y = groundAt(a.x, a.z) + 1.2;
    API.emit(a.x + kx * 1.6, y, a.z + kz * 1.6, 10, a.wolf ? '#8ec5ff' : '#e8f4ff', { speed: 5, life: 0.4, size: 0.35, bright: 2.4 });
    if (a.wolf) API.emit(tg.x, tg.y + 1, tg.z, 8, '#5aa0ff', { speed: 6, life: 0.3, size: 0.3, bright: 3 });
  }
  function updateAlly(a, dt, logic, slot) {
    const m = a.m; a.ph += dt;
    let sp = 0;
    if (logic && !a.talk) {
      if (a.rec.follow && slot >= 0) sp = followBrain(a, slot, dt, allyStrike, false);
      else { // at home
        a.atk = null;
        const hd = Math.hypot(a.x - a.home.x, a.z - a.home.z);
        if (hd > 30) { a.x = a.home.x + rand(-3, 3); a.z = a.home.z + rand(-3, 3); }
        if (a.state === 'walk') { if (walkTo(a, dt, a.tx, a.tz, a.wolf ? 2.2 : 1.4)) { a.state = 'idle'; a.t = rand(2, 6); } else sp = a.wolf ? 2.2 : 1.4; }
        else { a.t -= dt; if (a.t <= 0) { const TW = a.wolf ? TOWNS.find((t) => t.id === 'den') : TOWNS.find((t) => t.id === 'goblin'); pickTarget(a, TW); a.state = 'walk'; } }
      }
    } else if (a.talk) a.rot += angDiff(a.rot, Math.atan2(P.x - a.x, P.z - a.z)) * Math.min(1, dt * 5);
    const y = groundAt(a.x, a.z);
    m.root.position.set(a.x, y, a.z); m.root.rotation.y = a.rot;
    if (a.pop > 0) { a.pop -= dt; const k = 1 + Math.sin((1 - a.pop / 0.6) * PI) * 0.35; m.root.scale.setScalar((a.wolf ? 1.4 : 1) * k); } else if (a.wolf) m.root.scale.setScalar(1.4);
    const at = a.atk, wind = at ? Math.min(1, at.t / at.wind) : 0, act = at && at.t > at.wind ? Math.min(1, (at.t - at.wind) / 0.15) : 0;
    if (!a.wolf) {
      const sw = sp > 0.3 ? Math.sin(a.ph * (sp > 4 ? 13 : 8)) * Math.min(0.8, 0.3 + sp * 0.08) : 0;
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.6;
      m.armR.rotation.x = at ? (act > 0 ? lerp(-2.6, 1.0, act) : -2.6 * wind) : sw * 0.6 - 0.15;
      m.g.rotation.x = at && act > 0 ? 0.25 : 0; m.g.position.y = sp > 0.3 ? Math.abs(sw) * 0.08 : Math.sin(a.ph * 2.2) * 0.02;
      if (m.cape) m.cape.rotation.x = 0.12 + Math.min(0.8, sp * 0.08) + Math.sin(a.ph * 3) * 0.06;
    } else {
      const gal = sp > 0.3 ? a.ph * (sp > 5 ? 17 : 11) : 0;
      m.legs.forEach((l, i) => { l.rotation.x = sp > 0.3 ? Math.sin(gal + (i % 2) * PI + (i > 1 ? 1 : 0)) * 0.85 : 0; });
      m.tail.rotation.x = 0.5 + Math.sin(a.ph * 7) * 0.2; m.g.rotation.x = at ? (act > 0 ? 0.3 : -0.3 * wind) : 0;
      if (at && act > 0) m.g.position.z = act * 0.6; else m.g.position.z = 0;
      if (sp > 6 && Math.random() < dt * 20) API.emit(a.x, y + 0.7, a.z, 1, '#8ec5ff', { speed: 1, up: 1, grav: 0, life: 0.4 });
    }
    if (!at && sp < 0.3) lookAtPlayer(m, a, dt, 6);
    const d = dist2P(a.x, a.z);
    a.label.visible = m.root.visible && d < 28 && !UI.open; a.label.position.set(a.x, y + a.hy, a.z);
  }

  /* ------------------------------------------------------------ companions (romance) */
  function spawnHero(id) {
    const comp = COMP(id); if (!comp) return;
    const m = heroineModel(id); API.scene.add(m.root);
    const sp = SPOT[id];
    const h = { id, comp, m, x: sp.x, z: sp.z, rot: sp.ry, home: sp, atk: null, cd: 1, scan: 0, tgt: null, ph: rand(0, 6), blink: rand(2, 5), bt: 0, greetT: 20, talking: false,
      speed: 8.2, reach: 2.6, label: null, labelKey: '', ranged: id !== 'aurelia', practice: rand(4, 9), prac: 0 };
    h.ia = { x: h.x, z: h.z, r: 2.8, label: `Parla con ${comp.name} ♥`, action: () => talkHero(h) };
    HEROES[id] = h; HLIST.push(h);
    refreshHeroLabel(h);
  }
  function refreshHeroLabel(h) {
    const c = cst(h.id), key = c.affinity + (c.married ? 'm' : '');
    if (key === h.labelKey) return; h.labelKey = key;
    if (h.label) { API.scene.remove(h.label); h.label.material.map.dispose(); h.label.material.dispose(); }
    h.label = labelSprite(h.comp.name, h.comp.color, c.married ? '💍 Consorte di ' + pname() : S.tw.met[h.id] ? '♥ ' + c.affinity + '/10' : h.comp.title);
    h.label.scale.set(2.4, 0.6, 1);
  }
  const inParty = (id) => S.tw.party.indexOf(id) >= 0;
  function heroStrike(h, tg) {
    const c = cst(h.id), dmg = (26 + c.affinity * 3) * (c.married ? 1.4 : 1) * Math.max(1, P.dmg) * 0.85;
    const y = groundAt(h.x, h.z) + 1.3, hx = h.x + Math.sin(h.rot) * 0.5, hz = h.z + Math.cos(h.rot) * 0.5;
    switch (h.id) {
      case 'aurelia': {
        API.hitEnemy(tg, dmg * 1.3, 18, Math.sin(h.rot), Math.cos(h.rot));
        for (let i = 0; i < 9; i++) { const a = h.rot - 0.9 + i * 0.22; API.emit(h.x + Math.sin(a) * 1.8, y, h.z + Math.cos(a) * 1.8, 3, i % 2 ? '#ff5a3c' : '#ffb04a', { speed: 2, up: 2, grav: -2, life: 0.5, size: 0.45, bright: 3 }); }
        ringFx(tg.x, tg.z, 3, '#ff5a3c', 0.35); sfx('fire', { vol: 0.5 }); break;
      }
      case 'nerissa': for (let i = 0; i < 3; i++) setTimeout(() => { if (!tg.dead) shoot('spear', hx, y + 0.6 + i * 0.2, hz, tg, dmg * 0.45, i === 0); }, i * 110); sfx('water', { vol: 0.5 }); break;
      case 'kiara': for (let i = 0; i < 2; i++) shoot('fox', hx, y + 0.4, hz, tg, dmg * 0.6, i === 0); sfx('fire', { vol: 0.4 }); break;
      case 'morgana': for (let i = 0; i < 4; i++) shoot('bat', hx, y + 0.3 + i * 0.15, hz, tg, dmg * 0.32, i === 0); sfx('sonic', { vol: 0.4 }); P.hp = Math.min(P.maxHp, P.hp + dmg * 0.05); break;
      case 'lyra': { const n = married('lyra') ? 3 : 2; for (let i = 0; i < n; i++) setTimeout(() => { if (!tg.dead) shoot('arrow', hx, y + 0.3, hz, tg, dmg * 0.55, i === 0); }, i * 90); sfx('needle', { vol: 0.5 }); break; }
      case 'selene': {
        shoot('star', hx, y + 1.0, hz, tg, dmg * 0.7, true);
        const ty = tg.y + (tg.d.boss ? 3 : 1); setTimeout(() => { if (tg.dead) return; API.bolt(tg.x + rand(-2, 2), ty + 18, tg.z + rand(-2, 2), tg.x, ty, tg.z, '#c39bff'); API.hitEnemyQuiet(tg, dmg * 0.4); API.emit(tg.x, ty, tg.z, 16, '#c39bff', { speed: 6, life: 0.6, bright: 3 }); }, 260);
        sfx('spirit', { vol: 0.5 }); break;
      }
    }
  }
  function animHero(h, dt, sp) {
    const m = h.m, t = (h.ph += dt), id = h.id, y = groundAt(h.x, h.z);
    m.root.position.set(h.x, y, h.z); m.root.rotation.y = h.rot;
    const at = h.atk, wind = at ? Math.min(1, at.t / at.wind) : 0, act = at && at.t > at.wind ? Math.min(1, (at.t - at.wind) / 0.15) : 0;
    if (sp > 0.3) {
      const sw = Math.sin(t * (sp > 4 ? 12 : 8)) * Math.min(0.75, 0.3 + sp * 0.07);
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.6; m.armR.rotation.x = sw * 0.6; m.g.position.y = Math.abs(sw) * 0.06;
      m.body.rotation.x = Math.min(0.2, sp * 0.02); m.body.rotation.z = 0; m.armL.rotation.z = 0.1; m.armR.rotation.z = -0.1;
    } else {
      m.legL.rotation.x *= 0.85; m.legR.rotation.x *= 0.85; m.g.position.y = 0; m.body.rotation.x *= 0.9;
      m.body.rotation.z = Math.sin(t * 0.6) * 0.035;
      m.armL.rotation.x = Math.sin(t * 1.3) * 0.04; m.armR.rotation.x = -Math.sin(t * 1.3) * 0.04; m.armL.rotation.z = 0.12 + Math.sin(t * 1.1) * 0.03; m.armR.rotation.z = -0.12 - Math.sin(t * 1.1) * 0.03;
      if (id === 'aurelia') { m.armR.rotation.x = -0.45 + Math.sin(t * 1.2) * 0.05; m.armR.rotation.z = -0.25; m.armL.rotation.z = 0.35; }
      if (id === 'lyra') { m.armL.rotation.x = -0.35; m.armL.rotation.z = 0.25; }
      if (id === 'selene') { m.armR.rotation.x = -0.25; m.armL.rotation.x = -0.9 + Math.sin(t * 2) * 0.08; m.armL.rotation.z = 0.35; }
      if (id === 'morgana') { m.armR.rotation.x = -1.15 + Math.sin(t * 0.8) * 0.06; m.armR.rotation.z = 0.25; m.armL.rotation.z = 0.06; }
      if (id === 'nerissa') { m.armR.rotation.x = -0.2; m.armL.rotation.z = 0.45 + Math.sin(t * 1.5) * 0.1; m.armL.rotation.x = -0.3; }
      if (id === 'kiara') { m.armL.rotation.x = 0.45; m.armR.rotation.x = 0.45; m.armL.rotation.z = 0.25; m.armR.rotation.z = -0.25; }
      // occasional signature flourish (practice) when idle at home
      if (!h.talking && !inParty(id) && !WED) { h.practice -= dt; if (h.practice <= 0) { h.prac = 1.2; h.practice = rand(6, 11); } }
      if (h.prac > 0) {
        h.prac -= dt; const k = 1 - h.prac / 1.2;
        if (id === 'aurelia') { m.armR.rotation.x = -2.6 + Math.sin(k * PI) * 3.2; m.body.rotation.y = Math.sin(k * TAU) * 0.6; if (k > 0.45 && k < 0.6) API.emit(h.x + Math.sin(h.rot) * 1.2, y + 1.2, h.z + Math.cos(h.rot) * 1.2, 2, '#ff5a3c', { speed: 2, up: 1, grav: -2, life: 0.5, bright: 3 }); }
        else if (id === 'kiara') m.g.position.y = Math.sin(k * PI) * 0.6;
        else if (id === 'lyra') { m.armL.rotation.x = -1.5; m.armR.rotation.x = -1.4 - Math.sin(k * PI) * 0.4; m.armR.rotation.z = 0.3; }
        else if (id === 'selene') { m.armR.rotation.x = -1.8 * Math.sin(k * PI); if (Math.random() < 0.4) API.emit(h.x, y + 2.2, h.z, 1, '#c39bff', { speed: 1.2, up: 1, grav: -0.5, life: 0.8, bright: 3 }); }
        else if (id === 'nerissa') { m.armL.rotation.x = -2.4 * Math.sin(k * PI); m.armR.rotation.x = -0.2 - 1.2 * Math.sin(k * PI); if (Math.random() < 0.4) API.emit(h.x, y + 1.6, h.z, 1, '#7fe8ff', { speed: 1, up: 2, grav: 3, life: 0.8, bright: 2 }); }
        else if (id === 'morgana') { m.body.rotation.y = Math.sin(k * PI) * 0.5; }
      } else m.body.rotation.y *= 0.9;
    }
    if (at) {
      if (id === 'aurelia') { m.armR.rotation.x = act > 0 ? lerp(-2.7, 0.9, act) : -2.7 * wind; m.armR.rotation.z = act > 0 ? lerp(-0.6, 0.5, act) : -0.6 * wind; m.body.rotation.y = act > 0 ? lerp(0.5, -0.4, act) : 0.5 * wind; }
      else if (id === 'lyra') { m.armL.rotation.x = -1.55; m.armL.rotation.z = 0; m.armR.rotation.x = -1.5; m.armR.rotation.z = 0.5 * (1 - act); }
      else { m.armR.rotation.x = -1.6 * Math.max(wind, 1 - act * 0.5); m.armL.rotation.x = id === 'morgana' ? -1.2 * wind : -0.8 * wind; }
    }
    // breathing, look-at, hair, tails, cape, blink, orbs
    m.body.scale.y = 1 + Math.sin(t * 2.1) * 0.012;
    const d = dist2P(h.x, h.z);
    const want = (d < 9 || h.talking) && !at && sp < 0.3 ? clamp(angDiff(h.rot, Math.atan2(P.x - h.x, P.z - h.z)), -1.0, 1.0) : Math.sin(t * 0.37) * 0.25;
    m.head.rotation.y += (want - m.head.rotation.y) * Math.min(1, dt * 4); m.head.rotation.x = (d < 4 ? 0.12 : 0) + Math.sin(t * 0.9) * 0.03;
    m.head.rotation.z = Math.sin(t * 0.5) * 0.04 + (h.talking ? Math.sin(t * 2) * 0.03 : 0);
    m.hairB.rotation.x = 0.05 + Math.sin(t * 1.4) * 0.05 + Math.min(0.5, sp * 0.05); m.hairB.rotation.z = Math.sin(t * 0.9) * 0.06;
    m.tails.forEach((tl, i) => { tl.rotation.x = 0.85 + Math.sin(t * 1.7 + i) * 0.14 - Math.min(0.4, sp * 0.04); tl.rotation.z = Math.sin(t * 2.2 + i * 0.8) * 0.28; });
    if (m.cape) m.cape.rotation.x = 0.06 + Math.min(0.7, sp * 0.07) + Math.sin(t * 1.1) * 0.04;
    h.blink -= dt; if (h.blink < 0) { m.eyes.scale.y = 0.12; if (h.blink < -0.12) { h.blink = rand(2.2, 5); m.eyes.scale.y = 1; } }
    for (let i = 0; i < m.orbs.length; i++) { const o = m.orbs[i], a = t * 1.3 + i * TAU / m.orbs.length; o.position.set(Math.cos(a) * 0.75, 1.15 + Math.sin(t * 2 + i) * 0.22, Math.sin(a) * 0.75); o.rotation.y = t * 2; }
    if (id === 'selene') m.glowMat.color.setScalar(0.75 + Math.sin(t * 2.4) * 0.35);
    if (id === 'aurelia' && Math.random() < dt * 4 && d < 30) { m.armR.updateMatrixWorld(); _lv.set(0, -0.5, 0.9 + Math.random() * 0.7); m.armR.localToWorld(_lv); API.emit(_lv.x, _lv.y, _lv.z, 1, '#ff6a2a', { speed: 0.4, up: 1, grav: -1.5, life: 0.5, size: 0.3, bright: 2.6 }); }
    if (h.label) { h.label.visible = m.root.visible && d < 16 && !UI.open; h.label.position.set(h.x, y + 2.25, h.z); }
  }
  function updateHero(h, dt, logic, slot) {
    let sp = 0;
    if (logic && !h.talking && !(WED && WED.h === h)) {
      if (inParty(h.id) && slot >= 0) sp = followBrain(h, slot, dt, heroStrike, h.ranged);
      else {
        h.atk = null;
        const d = Math.hypot(h.x - h.home.x, h.z - h.home.z);
        if (d > 60) { h.x = h.home.x; h.z = h.home.z; }
        else if (d > 0.3) { walkTo(h, dt, h.home.x, h.home.z, 3.2); sp = 3.2; }
        else h.rot += angDiff(h.rot, h.home.ry) * Math.min(1, dt * 2);
        if (married(h.id) && !UI.open && dist2P(h.x, h.z) < 6.5) {
          h.greetT -= dt;
          if (h.greetT <= 0) { h.greetT = 150; const L = parseLine(pick((h.comp.lines && h.comp.lines.married) || ['Bentornato, {P}.'])); API.toast(`💍 ${h.comp.name}: «${L.txt.length > 70 ? L.txt.slice(0, 68) + '…' : L.txt}»`); API.emit(h.x, groundAt(h.x, h.z) + 2.2, h.z, 12, '#ff7aa2', { speed: 1.2, up: 1.5, grav: -0.6, life: 1.2, bright: 2 }); }
        }
      }
    } else if (h.talking) h.rot += angDiff(h.rot, Math.atan2(P.x - h.x, P.z - h.z)) * Math.min(1, dt * 5);
    animHero(h, dt, sp);
  }
  function tierLines(comp, c) { const L = comp.lines || {}; return c.married ? L.married : c.affinity >= 7 ? L.t2 : c.affinity >= 4 ? L.t1 : L.t0; }
  function addAff(h, g) {
    const c = cst(h.id), before = c.affinity;
    c.affinity = clamp(before + g, 0, 10); if (c.married) c.affinity = 10;
    saveAll(); setHearts(); refreshHeroLabel(h);
    const real = c.affinity - before;
    if (real > 0) {
      API.emit(h.x, groundAt(h.x, h.z) + 2, h.z, 10 + real * 8, '#ff7aa2', { speed: 1.6, up: 2, grav: -0.8, life: 1.4, size: 0.5, bright: 2.4 });
      sfx(real >= 2 ? 'name' : 'select'); API.toast(`${h.comp.name}  ${'♥'.repeat(real)} +${real}`);
      if (before < 3 && c.affinity >= 3) setTimeout(() => API.toast(`⚔ ${h.comp.name} ora può seguirti in battaglia!`), 1400);
      if (before < 10 && c.affinity >= 10 && !c.married) setTimeout(() => oracle(`《Affinità massima con ${h.comp.name}. Un Anello di Magicule potrebbe... cambiare tutto.》`, true), 1600);
    }
    return real;
  }
  function talkHero(h) {
    if (blocked()) return;
    const comp = h.comp, c = cst(h.id);
    h.talking = true;
    uiShow({ name: comp.name, sub: `${comp.title} · ${comp.race}`, color: comp.color, portrait: h.id, hearts: () => cst(h.id).affinity, married: () => married(h.id), onClose: () => { h.talking = false; }, mood0: c.married || c.affinity >= 7 ? 'love' : c.affinity >= 4 ? 'happy' : 'idle' });
    if (!S.tw.met[h.id]) {
      S.tw.met[h.id] = true; c.unlocked = true; c.seen = true; c.isNew = false; saveAll(); refreshHeroLabel(h);
      uiSay(((comp.lines && comp.lines.meet) || ['Piacere, {P}.']).concat(['n:' + (comp.bio || '').split('. ').slice(0, 2).join('. ') + '.']), () => heroMenu(h));
    } else uiSay([pick(tierLines(comp, c) || ['Ciao, {P}.'])], () => heroMenu(h));
  }
  function heroMenu(h) {
    const comp = h.comp, c = cst(h.id), day = S.tw.day, talked = S.tw.talk[h.id] === day, dated = S.tw.date[h.id] === day, party = inParty(h.id);
    const n = nat(), ds = availDates(h);
    const acts = [
      { t: '💬 Parla', s: talked || c.married || c.affinity >= 10 ? 'Due chiacchiere' : '+1 ♥ (una volta al giorno)', fn: () => {
        const gain = !talked && !c.married && c.affinity < 10; S.tw.talk[h.id] = day; API.saveS();
        uiSay([pick(tierLines(comp, c) || ['…'])], () => { if (gain) addAff(h, 1); heroMenu(h); });
      } },
      { t: '🎁 Regala', s: 'Un pensiero conquista il cuore', fn: () => giftMenu(h) },
      { t: '🌙 Appuntamento', s: dated ? 'Avete già avuto un appuntamento oggi' : ds.length ? `${fmtN(ds[0].cost * 10)} anime · scena romantica` : 'Serve più affinità',
        off: dated ? `${comp.name} vuole rivederti domani.` : !ds.length ? 'Serve più affinità (almeno 1 ♥).' : S.runes < ds[0].cost * 10 ? 'Anime insufficienti.' : null, fn: () => startDate(h, ds[0]) },
      party ? { t: '🏠 Torna a Valdoria', s: 'Lasciala riposare in città', fn: () => { S.tw.party.splice(S.tw.party.indexOf(h.id), 1); API.saveS(); uiSay(['[happy]Ti aspetto qui. Torna tutto intero, {P}... o tutto gelatina.'], () => heroMenu(h)); } }
        : { t: '⚔ Porta con te', s: `Combatte al tuo fianco · seguito ${followers()}/6`, off: c.affinity < 3 ? 'Serve almeno 3 ♥ di affinità.' : followers() >= 6 ? 'Il tuo seguito è al completo (massimo 6).' : null,
          fn: () => { S.tw.party.push(h.id); API.saveS(); ringFx(h.x, h.z, 3, comp.color); API.emit(h.x, groundAt(h.x, h.z) + 1, h.z, 30, comp.color, { speed: 3, up: 3, grav: -1, life: 1 }); uiSay([(comp.lines && comp.lines.battle) || '[happy]Andiamo!'], () => heroMenu(h)); } },
    ];
    if (!c.married) acts.push({ t: '💍 Proponi', s: c.affinity < 10 ? `Serve affinità 10 ♥ (ora ${c.affinity})` : n.rings < 1 ? 'Serve un Anello di Magicule (Mercante, 3.000 anime)' : `Hai ${n.rings} anello/i`,
      pri: c.affinity >= 10 && n.rings > 0, off: c.affinity < 10 ? `L'affinità con ${comp.name} deve essere al massimo (10 ♥).` : n.rings < 1 ? 'Ti serve un Anello di Magicule: lo vende il Mercante di Valdoria.' : null,
      fn: () => uiSay(['p:' + pick(['Vorrei passare ogni giorno al tuo fianco. Mi sposeresti?', 'Questo anello è fatto di magicule... e di tutto quello che provo per te. Mi sposi?'])].concat((comp.lines && comp.lines.proposal) || ['[love]Sì!']), () => startWedding(h)) });
    acts.push({ t: 'Arrivederci', fn: uiClose });
    uiActions(acts);
  }
  function giftMenu(h) {
    const comp = h.comp, likes = comp.likes || [];
    const list = GIFTS().map((g) => {
      const cost = g.cost * 20;
      return { t: `${g.name} — ${fmtN(cost)} anime`, s: g.desc + (cst(h.id).affinity >= 6 && likes[0] === g.id ? ' ★' : ''), off: S.runes < cost ? 'Anime insufficienti.' : null, fn: () => {
        S.runes -= cost; API.saveS(); sfx('coin');
        const tier = likes[0] === g.id ? 'love' : likes.indexOf(g.id) >= 0 ? 'like' : 'ok', gain = { love: 3, like: 2, ok: 1 }[tier];
        const pool = (comp.lines && comp.lines.gift && comp.lines.gift[tier]) || ['Grazie, {P}!'];
        cst(h.id).gifts = (cst(h.id).gifts || 0) + 1;
        uiSay([pick(pool)], () => { addAff(h, gain); heroMenu(h); });
      } };
    });
    uiActions(list.concat([{ t: 'Indietro', fn: () => heroMenu(h) }]));
  }
  function availDates(h) {
    const c = cst(h.id), dd = h.comp.dates || {};
    const list = DATES().filter((d) => dd[d.id] && c.affinity >= Math.max(1, d.req));
    list.sort((a, b) => (!!(c.datesDone && c.datesDone[a.id]) - !!(c.datesDone && c.datesDone[b.id])) || b.req - a.req);
    return list;
  }
  const DATE_BG = { lago: 'radial-gradient(circle at 70% 18%, rgba(220,235,255,.55) 0 3%, transparent 4%), linear-gradient(#0b1430, #1d2f5a 55%, #2a4a6a)', taverna: 'radial-gradient(circle at 30% 60%, rgba(255,170,80,.45), rgba(40,18,6,.92) 70%)', alba: 'linear-gradient(#ffb38a, #f78fb3 40%, #6a4a8a)', lanterne: 'radial-gradient(circle at 20% 30%, rgba(255,170,60,.6) 0 1%, transparent 2%), radial-gradient(circle at 60% 20%, rgba(255,170,60,.6) 0 1%, transparent 2%), radial-gradient(circle at 80% 40%, rgba(255,170,60,.6) 0 1.2%, transparent 2.2%), linear-gradient(#120a2a, #3a1a4a)' };
  function startDate(h, d) {
    const comp = h.comp, c = cst(h.id), sc = comp.dates[d.id], cost = d.cost * 10;
    if (S.runes < cost) return;
    S.runes -= cost; S.tw.date[h.id] = S.tw.day; API.saveS(); sfx('portal', { vol: 0.5 });
    setBg(DATE_BG[d.id]);
    const ch = sc.choices.slice().sort((a, b) => b.g - a.g), two = [ch[0], ch[1 + ((Math.random() * (ch.length - 1)) | 0)]].sort(() => Math.random() - 0.5);
    uiSay([`n:— ${d.name} —`].concat(sc.intro, [sc.ask]), () => uiActions(two.map((o) => ({ t: o.t, fn: () => {
      uiSay(['p:' + o.t, o.r], () => {
        c.dates = (c.dates || 0) + 1; if (!c.datesDone || typeof c.datesDone !== 'object') c.datesDone = {}; c.datesDone[d.id] = true;
        addAff(h, o.g);
        uiSay([`n:La serata finisce troppo presto. ${o.g >= 3 ? `${comp.name} sorride come non l'avevi mai vista sorridere.` : o.g >= 2 ? `${comp.name} ti saluta con un sorriso.` : `${comp.name} sospira... ma resta comunque al tuo fianco.`}`], () => { setBg(null); heroMenu(h); });
      });
    } }))));
  }

  /* ------------------------------------------------------------ wedding cinematic */
  function startWedding(h) {
    const n = nat(); if (n.rings < 1) return;
    n.rings--; saveMain();
    WED = { h, t: -1, step: 0, comp: h.comp, vow: '', typed: 0, fw: 0 };
    uiClose(); API.state = 'menu'; startTick();
    const fade = document.getElementById('fade'); if (fade) fade.style.opacity = 1;
    setTimeout(() => {
      const A = SPOT.altar;
      P.x = A.x - 1.0; P.z = A.z; P.vx = P.vz = 0; P.rot = PI / 2; P.atk = null;
      h.x = A.x + 1.0; h.z = A.z; h.rot = -PI / 2; h.atk = null; h.talking = false;
      API.input.yaw = PI; API.input.pitch = 0.22; API.input.lock = null;
      // the town gathers to watch
      const V = TOWNS[0]; let k = 0;
      for (const npc of NPCS) {
        if (npc.TW !== V || npc.post) continue;
        const a = PI + 0.35 + (k % 9) * 0.29, r = 6.5 + Math.floor(k / 9) * 1.8; k++;
        npc.gather = { x: A.x + Math.cos(a) * r, z: A.z - 1.5 + Math.sin(a) * r * 0.75 - 2, ry: 0 };
        npc.gather.ry = Math.atan2(A.x - npc.gather.x, A.z - npc.gather.z); npc.x = npc.gather.x + rand(-0.5, 0.5); npc.z = npc.gather.z + rand(-0.5, 0.5);
      }
      for (const o of HLIST) if (o !== h && S.tw.met[o.id]) { const j = HLIST.indexOf(o); o.x = A.x - 5 + j * 2; o.z = A.z - 4.5; o.rot = 0; o.atk = null; }
      for (const a of ALLIES) if (a.rec.follow) { a.x = A.x + rand(-6, 6); a.z = A.z - rand(5, 8); a.atk = null; }
      WED.vow = parseLine(h.comp.lines && h.comp.lines.vow ? h.comp.lines.vow : '[love]Ti amerò per sempre, {P}.').txt;
      WED.t = 0; API.state = 'play'; if (fade) fade.style.opacity = 0;
      API.bigMsg('Piazza del Palazzo', 'place', 2.2);
    }, 1500);
  }
  function updateWedding(dt) {
    const W = WED; if (W.t < 0) return;
    W.t += dt; const A = SPOT.altar, h = W.h;
    P.x = A.x - 1.0; P.z = A.z; P.vx = P.vz = 0; P.rot = PI / 2;
    h.x = A.x + 1.0; h.z = A.z; h.rot = -PI / 2;
    const g = groundAt(A.x, A.z);
    if (Math.random() < dt * (LOW ? 10 : 22)) API.emit(A.x + rand(-9, 9), g + rand(6, 10), A.z + rand(-7, 5), 1, pick(['#ffb3c8', '#ffffff', '#ff7aa2', '#ffd6e4']), { speed: 0.7, up: 0, grav: 0.7, life: 4, size: 0.32, bright: 1.15 });
    const vowEl = E.vow;
    if (W.step === 0 && W.t > 1.0) { W.step = 1; sfx('portal', { vol: 0.6 }); vowEl.className = 'on'; W.typed = 0; }
    if (W.step === 1) {
      W.typed = Math.min(W.vow.length, W.typed + dt * 34);
      vowEl.innerHTML = `<b>${W.comp.name.toUpperCase()}</b>«${W.vow.slice(0, Math.floor(W.typed))}»`;
      if (W.typed >= W.vow.length) { W.step = 2; W.t2 = W.t; }
    }
    if (W.step === 2 && W.t > W.t2 + 2.6) { W.step = 3; W.t3 = W.t; W.pv = `Lo giuro. Oggi, domani e in ogni giorno che verrà, ${W.comp.name}.`; W.typed = 0; }
    if (W.step === 3) {
      W.typed = Math.min(W.pv.length, W.typed + dt * 34);
      vowEl.innerHTML = `<b>${pname().toUpperCase()}</b>«${W.pv.slice(0, Math.floor(W.typed))}»`;
      if (W.typed >= W.pv.length && W.t > W.t3 + 3.2) {
        W.step = 4; W.t4 = W.t;
        const c = cst(h.id); c.married = true; c.affinity = 10; c.unlocked = true; nat().weddings++; saveAll(); refreshHeroLabel(h);
        pillarFx(A.x, A.z, '#ffd36b', 3, 2.4); ringFx(A.x, A.z, 12, '#ffd36b', 1); ringFx(A.x, A.z, 7, '#ff7aa2', 0.8);
        API.flashLight.color.set('#ffd6a0'); API.flashLight.intensity = 120; API.flashLight.position.set(A.x, g + 4, A.z);
        API.emit(A.x, g + 2, A.z, LOW ? 70 : 140, '#ff7aa2', { speed: 7, up: 5, grav: 1.5, life: 2, size: 0.5, bright: 2.6 });
        API.setShake(0.3); sfx('victory'); sfx('name');
        API.bigMsg('Sposati!', 'gold', 4.5);
        vowEl.innerHTML = `<b>💍</b>${W.comp.name} e ${pname()} sono ora uniti per sempre.`;
        for (const npc of NPCS) if (npc.gather) npc.cheer = 7;
      }
    }
    if (W.step === 4) {
      W.fw -= dt;
      if (W.fw <= 0 && W.t < W.t4 + 8) { W.fw = rand(0.25, 0.6); ROCKETS.push({ x: A.x + rand(-14, 14), y: g + 2, z: A.z + rand(4, 18), vy: rand(16, 22), t: 0, life: rand(0.9, 1.3), col: pick(['#ff7aa2', '#ffd36b', '#7fe8ff', '#c39bff', '#9dff6a', '#ff5a3c']) }); sfx('dash', { vol: 0.2 }); }
      if (W.t > W.t4 + 9.5) {
        vowEl.className = '';
        API.toast(`💍 Bonus sposa di ${W.comp.name}: ${SPOUSE_BONUS[h.id] || 'un cuore pieno'}`);
        oracle(`《Legame nuziale stabilito con ${W.comp.name}. Potere condiviso attivato.》`, true);
        for (const npc of NPCS) npc.gather = null;
        WED = null;
      }
    }
  }

  /* ------------------------------------------------------------ per-frame world animation */
  let animT = 0;
  const _hc = new T.Color();
  function updateNight() {
    const n = nightAmt();
    MAT.win.emissive.setRGB(2.7 * n, 1.55 * n, 0.7 * n);
    MAT.lamp.color.setRGB(0.42 + 3.6 * n, 0.36 + 2.6 * n, 0.25 + 1.2 * n);
    if (Math.abs(n - nightK) < 0.02) return;
    nightK = n;
    for (const TW of TOWNS) {
      if (!TW.haloPts) continue;
      const col = TW.haloPts.geometry.attributes.color; let any = false;
      TW.halos.forEach((h, i) => { const k = h.always ? 0.45 + n * 1.3 : n * 1.8; if (k > 0.02) any = true; _hc.set(h.c).multiplyScalar(k); col.setXYZ(i, _hc.r, _hc.g, _hc.b); });
      col.needsUpdate = true; TW.haloPts.visible = any;
    }
  }
  function townAnims(TW, dt) {
    for (const a of TW.anims) {
      if (a.k === 'flag') a.m.rotation.y = a.base + Math.sin(animT * 2.2 + a.ph) * 0.22 + Math.sin(animT * 5.3 + a.ph) * 0.05;
      else if (a.k === 'banner') a.m.rotation.x = Math.sin(animT * 1.4 + a.ph) * 0.07;
      else if (a.k === 'sign') a.m.rotation.z = Math.sin(animT * 1.1 + a.ph) * 0.06;
      else if (a.k === 'crystals') a.list.forEach((m, i) => { const ang = animT * 0.8 + i * TAU / 3; m.position.set(a.x + Math.cos(ang) * 1.1, a.y + Math.sin(animT * 1.6 + i) * 0.3, a.z + Math.sin(ang) * 1.1); m.rotation.y = animT * 2; });
    }
    const F = TW.fountain;
    if (F) {
      for (const r of F.ripples) { r.t = (r.t + dt * 0.45) % 1; const s = 0.4 + r.t * 2.9; r.m.scale.set(s, s, s); r.m.material.opacity = 0.45 * (1 - r.t); }
      F.statue.scale.set(1 + Math.sin(animT * 2.4) * 0.03, 1 - Math.sin(animT * 2.4) * 0.03, 1 + Math.sin(animT * 2.4) * 0.03);
    }
    if (TW.dist > TW.r + 70) return; // particles only nearby
    for (const f of TW.fires) {
      for (let i = 0; i < f.fl.length; i++) { const m = f.fl[i], k = 0.75 + 0.3 * Math.sin(animT * 13 + i * 2.1 + f.ph) + 0.15 * Math.sin(animT * 23 + i); m.scale.y = 0.9 * f.s * k; m.rotation.y = animT * (i + 1); }
      if (Math.random() < dt * 12 && dist2P(f.x, f.z) < 70) API.emit(f.x + rand(-0.2, 0.2) * f.s, f.y, f.z + rand(-0.2, 0.2) * f.s, 1, Math.random() < 0.5 ? '#ff7a2a' : '#ffb04a', { speed: 0.5, up: 2 * f.s + 0.6, grav: -1.2, life: 0.7, size: 0.3 * f.s + 0.12, bright: 2.4 });
    }
    TW.smokeT = (TW.smokeT || 0) - dt;
    if (TW.smokeT <= 0 && TW.smokes.length) { TW.smokeT = 0.3; const s = TW.smokes[(Math.random() * TW.smokes.length) | 0]; if (dist2P(s.x, s.z) < 75) API.emit(s.x, s.y, s.z, 1, '#a8a29a', { speed: 0.3, up: 1.1, grav: -0.3, life: 2.6, size: 1.0, bright: 0.45 }); }
    if (F && TW.dist < 70) {
      if (Math.random() < dt * 30) { const a = rand(0, TAU); API.emit(F.x + Math.cos(a) * 0.12, F.y + 4.45, F.z + Math.sin(a) * 0.12, 1, '#bfefff', { speed: 1.4, up: 3.2, grav: 9, life: 0.85, size: 0.2, bright: 1.3 }); }
      if (Math.random() < dt * 24) { const a = rand(0, TAU); API.emit(F.x + Math.cos(a) * 1.4, F.y + 3.2, F.z + Math.sin(a) * 1.4, 1, '#9fe8ff', { speed: 0.4, grav: 9, life: 0.45, size: 0.17, bright: 1.1 }); }
    }
    if (TW.fireflies && TW.dist < 60 && Math.random() < dt * (3 + nightK * 9)) { const x = TW.x + rand(-24, 24), z = TW.z + rand(-24, 24); API.emit(x, groundAt(x, z) + rand(0.5, 2.8), z, 1, '#c8ff6a', { speed: 0.25, up: 0.15, grav: -0.05, life: 2.8, size: 0.28, bright: 2.8 }); }
  }
  function animWorld(dt, logic) {
    animT += dt;
    updateNight();
    for (const TW of TOWNS) {
      TW.dist = dist2P(TW.x, TW.z); TW.group.visible = TW.dist < TW.r + 175; TW.near = TW.dist < TW.r + 110;
      if (TW.group.visible) townAnims(TW, dt);
    }
    for (const n of NPCS) { const vis = n.TW.near && dist2P(n.x, n.z) < 105; n.m.root.visible = vis; if (vis) updateNpc(n, dt, logic); }
    for (let i = BEASTS.length - 1; i >= 0; i--) { const b = BEASTS[i]; const vis = b.TW.near; b.m.root.visible = vis; if (!vis) { b.bang.visible = false; continue; } if (logic && b.naming) updateNaming(b, dt); if (BEASTS[i] === b) updateBeast(b, dt, logic); }
    let slot = 0;
    for (const a of ALLIES) a.slot = a.rec.follow ? slot++ : -1;
    for (const h of HLIST) h.slot = inParty(h.id) ? slot++ : -1;
    for (const a of ALLIES) { const vis = a.slot >= 0 || dist2P(a.x, a.z) < 110; a.m.root.visible = vis; if (vis) updateAlly(a, dt, logic, a.slot); else a.label.visible = false; }
    for (const h of HLIST) { const vis = h.slot >= 0 || dist2P(h.x, h.z) < 110 || (WED && WED.h === h); h.m.root.visible = vis; if (vis) updateHero(h, dt, logic, h.slot); else if (h.label) h.label.visible = false; }
    updateFxl(dt);
  }

  /* ------------------------------------------------------------ settlements are safe */
  function purgeSettlements() {
    const en = API.enemies;
    for (let i = en.length - 1; i >= 0; i--) {
      const e = en[i]; if (e.d.boss) continue;
      for (const TW of TOWNS) if (Math.hypot(e.x - TW.x, e.z - TW.z) < TW.r + 4) {
        API.scene.remove(e.model.root); if (e.bar) API.scene.remove(e.bar.bg, e.bar.fg);
        if (API.input.lock === e) API.input.lock = null;
        en.splice(i, 1); break;
      }
    }
  }
  function guardSettlements() {
    for (const e of API.enemies) {
      if (e.dead || e.engaged || e.d.boss) continue;
      for (const TW of TOWNS) { const dx = e.x - TW.x, dz = e.z - TW.z, d = Math.hypot(dx, dz); if (d < TW.r) { const k = (TW.r + 1) / (d || 1); e.x = TW.x + dx * k; e.z = TW.z + dz * k; break; } }
    }
  }
  function slowChecks() {
    for (const TW of TOWNS) {
      const d = TW.dist;
      if (d < TW.r * 0.8 && curTown !== TW) { curTown = TW; API.bigMsg(TW.name, 'place', 2.6); if (TW.id === 'valdoria' && !S.tw.visited) { S.tw.visited = true; API.saveS(); setTimeout(() => oracle('《Valdoria, capitale della tua Nazione. Abitanti: felici. Livello di gelatina nelle statue: elevato.》'), 2200); } }
      else if (curTown === TW && d > TW.r + 6) curTown = null;
    }
    const q = S.tw.q.luci, Q = QUESTS[1];
    if (q && !q.done && !q.told && Q.prog() >= Q.need) { q.told = true; API.saveS(); oracle("《Incarico completato: Le Luci di Grazia. Torna dall'Anziano di Valdoria.》", true); }
    for (const id of ['tiranno', 'drago']) { const qq = S.tw.q[id], QQ = QUESTS.find((x) => x.id === id); if (qq && !qq.done && !qq.told && QQ.prog() >= 1) { qq.told = true; API.saveS(); setTimeout(() => oracle(`《Incarico completato: ${QQ.name}. L'Anziano vorrà saperlo.》`, true), 5000); } }
  }

  /* ------------------------------------------------------------ villager roster */
  function spawnRoster() {
    const [V, Gb, , Lu, Ge, Cr] = TOWNS, cx = VAL.x, cz = VAL.z;
    const st0 = V.stalls[0].F;
    spawnVillager(V, { role: 'mercante', name: 'Baldovino', female: false, x: st0.wx(0, -1.25), z: st0.wz(0, -1.25), ry: st0.ry, post: true, anim: 'wave', look: { apron: '#e8e0cc', hat: 'cap', hatC: '#c62828', burly: true, hairStyle: 'short' } });
    for (const k of [3, 5]) { const F = V.stalls[k].F; spawnVillager(V, { role: 'cittadino', sub: 'Venditrice', female: true, x: F.wx(0, -1.25), z: F.wz(0, -1.25), ry: F.ry, post: true, anim: k === 3 ? 'wave' : null }); }
    spawnVillager(V, { role: 'fabbro', name: 'Gualtiero', female: false, x: SPOT.smith.x, z: SPOT.smith.z, ry: SPOT.smith.ry, post: true, anim: 'hammer', look: { hairStyle: 'bald', beard: '#5a3a2a', apron: '#4a2e1a', tool: 'hammer', burly: true, hat: null, skin: '#d9a27a', cloth: '#6b4a2a' } });
    spawnVillager(V, { role: 'anziano', name: 'Ser Anselmo', female: false, x: cx - 4.7, z: cz - 4.7, ry: Math.atan2(-1, -1), post: true, look: { hairStyle: 'short', hair: '#e8e8e8', beard: '#f2f2f2', cloth: '#4a3a6b', pants: '#3a2e44', tool: 'cane', hunch: true, cape: '#2e2440', hat: null } });
    spawnVillager(V, { role: 'locandiere', name: 'Rosalba', female: true, x: SPOT.tavern.x, z: SPOT.tavern.z, ry: SPOT.tavern.ry, post: true, anim: 'wave', look: { apron: '#f5f0e6', hairStyle: 'bun', tool: 'mug', cloth: '#8a3a2a', hat: null } });
    const guard = { armor: true, hat: 'helmet', tool: 'spear', cloth: '#1d3a8a', pants: '#2e3440', hairStyle: 'short', beard: null };
    for (const sx of [-1, 1]) spawnVillager(V, { role: 'guardia', name: sx < 0 ? 'Ottone' : 'Brunilde', female: sx > 0, x: SPOT.gate.x + sx * 3.4, z: SPOT.gate.z + 4.8, ry: PI, post: true, look: guard });
    for (let i = 0; i < 2; i++) { const nd = V.nodes[8 + i * 6]; spawnVillager(V, { role: 'guardia', female: i === 1, x: nd.x, z: nd.z, look: guard }); }
    for (let i = 0; i < 4; i++) { const nd = V.nodes[i * 2]; spawnVillager(V, { role: 'bambino', female: i % 2 === 1, x: nd.x, z: nd.z }); }
    for (let i = 0; i < 10; i++) { const nd = V.nodes[(i * 5 + 3) % V.nodes.length]; spawnVillager(V, { role: 'cittadino', female: i % 2 === 0, x: nd.x + rand(-1, 1), z: nd.z + rand(-1, 1) }); }
    // villages
    const n0 = Lu.nodes[0];
    spawnVillager(Lu, { role: 'mercante', name: 'Ondina', sub: 'Pescatrice e mercante', female: true, x: n0.x, z: n0.z, ry: Math.atan2(Lu.x - n0.x, Lu.z - n0.z), post: true, anim: 'wave', look: { hat: 'straw', cloth: '#2e6b6b' },
      greet: 'Pesce fresco, Gelatine, anelli e chiacchiere! La pescatrice {N} vende di tutto, tranne la palude. Quella è gratis.' });
    for (let i = 0; i < 3; i++) { const nd = Lu.nodes[2 + i * 2]; spawnVillager(Lu, { role: 'cittadino', pool: 'lucciole', female: i === 1, x: nd.x, z: nd.z, look: { hat: i === 2 ? 'hood' : 'straw', hatC: '#4a5a2a' } }); }
    const g0 = Ge.nodes[1];
    spawnVillager(Ge, { role: 'locandiere', name: 'Ilda', sub: 'Locandiera del Rifugio', female: true, x: g0.x, z: g0.z, ry: Math.atan2(Ge.x - g0.x, Ge.z - g0.z), post: true, anim: 'wave', look: { hat: 'fur', cloth: '#6b2e2e', apron: '#e8e0cc' },
      greet: 'Benvenuto al Rifugio Gelido! Qui il fuoco è sempre acceso e la zuppa sempre bollente. Togliti la neve di dosso... ah, sei di gelatina. Allora non congelarti.' });
    spawnVillager(Ge, { role: 'cittadino', name: 'Bruno', sub: 'Cacciatore', pool: 'gelido', female: false, x: Ge.nodes[4].x, z: Ge.nodes[4].z, look: { hat: 'fur', cloth: '#5a4a3a', beard: '#4a2f1d', tool: null } });
    for (let i = 0; i < 2; i++) { const nd = Ge.nodes[3 + i * 3]; spawnVillager(Ge, { role: 'cittadino', pool: 'gelido', female: i === 0, x: nd.x, z: nd.z, look: { hat: 'fur', cloth: pick(['#6b2e2e', '#2e4a7a', '#3f6b3a']) } }); }
    const c0 = Cr.nodes[2];
    spawnVillager(Cr, { role: 'fabbro', name: 'Ferrante', female: false, x: c0.x, z: c0.z, ry: Math.atan2(Cr.x - c0.x, Cr.z - c0.z), post: true, look: { hairStyle: 'short', beard: '#2b1d14', apron: '#4a2e1a', tool: 'hammer', burly: true, cloth: '#7a2e2e' },
      greet: "Ferrante, fabbro dell'Avamposto. Qui le lame servono davvero: la Soglia del Tiranno è a un passo. Vuoi un rinforzo?" });
    for (let i = 0; i < 2; i++) { const nd = Cr.nodes[4 + i * 2]; spawnVillager(Cr, { role: 'guardia', sub: 'Soldato', pool: 'cremisi', female: i === 1, x: nd.x, z: nd.z, look: Object.assign({}, guard, { cloth: '#8a1c1c' }) }); }
    spawnVillager(Cr, { role: 'cittadino', pool: 'cremisi', female: true, x: Cr.nodes[7].x, z: Cr.nodes[7].z, look: { hat: 'kerchief', hatC: '#8a1c1c' } });
    void Gb;
  }

  /* ------------------------------------------------------------ interaction list (reused, no per-frame allocation of objects) */
  const IA = [];
  function interactables() {
    IA.length = 0;
    if (UI.open || WED) return IA;
    const still = Math.hypot(P.vx, P.vz) < 1.2;
    for (const n of NPCS) if (n.m.root.visible && Math.abs(n.x - P.x) < 4 && Math.abs(n.z - P.z) < 4) { n.ia.x = n.x; n.ia.z = n.z; IA.push(n.ia); }
    for (const b of BEASTS) if (!b.naming && b.m.root.visible && Math.abs(b.x - P.x) < 4 && Math.abs(b.z - P.z) < 4) { b.ia.x = b.x; b.ia.z = b.z; IA.push(b.ia); }
    for (const a of ALLIES) if (!a.atk && Math.abs(a.x - P.x) < 4 && Math.abs(a.z - P.z) < 4 && (a.slot < 0 || still)) { a.ia.x = a.x; a.ia.z = a.z; a.ia.r = a.slot < 0 ? 2.4 : 1.9; IA.push(a.ia); }
    for (const h of HLIST) if (!h.atk && Math.abs(h.x - P.x) < 4 && Math.abs(h.z - P.z) < 4 && (h.slot < 0 || still)) { h.ia.x = h.x; h.ia.z = h.z; h.ia.r = h.slot < 0 ? 2.8 : 1.9; IA.push(h.ia); }
    return IA;
  }

  /* ============================================================ REGISTER */
  let built = false;
  API.register({
    id: 'towns3d',
    init() {
      const t0 = performance.now();
      buildValdoria(); buildGoblinVillage(); buildWolfDen(); buildLucciole(); buildGelido(); buildCremisi();
      spawnRoster();
      const gobT = TOWNS[1], denT = TOWNS[2];
      for (let i = 0; i < 6; i++) spawnBeast('gob', i, gobT);
      for (let i = 0; i < 3; i++) spawnBeast('wolf', i, denT);
      for (const id of ['aurelia', 'nerissa', 'kiara', 'morgana', 'lyra', 'selene']) spawnHero(id);
      for (const TW of TOWNS) {
        API.mapMarkers.push({ x: TW.x, z: TW.z, label: TW.name, color: TW.color });
        if (TW.id !== 'den') API.compassMarkers.push({ x: TW.x, z: TW.z, label: TW.id === 'valdoria' ? '♛' : '⌂', color: TW.color });
      }
      const prevBack = window.SKBack;
      window.SKBack = () => { if (UI.open) { uiClose(); return true; } if (WED) return true; return prevBack ? prevBack() : false; };
      API.towns = { TOWNS, NPCS, BEASTS, ALLIES, HEROES, SPOT, VAL, groundAt, talkHero, talkNpc, nameFlow, doNaming, startWedding, UI, uiClose, nightAmt, cst };
      built = true;
      console.log('[towns3d] built in ' + Math.round(performance.now() - t0) + ' ms · houses in Valdoria: ' + TOWNS[0].houses + ' · villagers: ' + NPCS.length);
    },
    populate() {
      if (!built) return;
      purgeSettlements();
      if (!this.spawned) {
        this.spawned = true;
        S.allies.forEach((rec, i) => { const home = rec.kind === 'lupo' ? DEN : GOB; spawnAlly(rec, home.x + rand(-4, 4), home.z + rand(-4, 4)); void i; });
      }
      let slot = 0;
      for (const a of ALLIES) if (a.rec.follow) { const p = slotPos(slot++); a.x = p[0]; a.z = p[1]; a.atk = null; a.tgt = null; }
      for (const h of HLIST) if (inParty(h.id)) { const p = slotPos(slot++); h.x = p[0]; h.z = p[1]; h.atk = null; h.tgt = null; }
    },
    update(dt) {
      if (UI.open && API.state === 'play' && !WED) uiClose();
      if (API.DAY.t < lastDayT - 0.5) { S.tw.day++; API.saveS(); }
      lastDayT = API.DAY.t;
      slowT -= dt; if (slowT <= 0) { slowT = 0.5; guardSettlements(); slowChecks(); }
      animWorld(dt, true);
      updateProj(dt); updateRockets(dt);
      if (WED) updateWedding(dt);
      if (!P.dead) {
        if (married('nerissa')) P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.006 * dt);
        if (married('selene')) P.fp = Math.min(P.maxFp, P.fp + 2 * dt);
      }
    },
    interactables,
    onKill(e, absorbed, gain) {
      if (e.type === 'wolf') {
        const q = S.tw.q.lupi;
        if (q && !q.done && q.n < 10) { q.n++; API.saveS(); API.toast(`Caccia ai Lupi: ${q.n}/10`); if (q.n >= 10) oracle("《Incarico completato: Caccia ai Lupi. Torna dall'Anziano di Valdoria.》", true); }
      }
      if (married('kiara') && gain > 0) S.runes += Math.round(gain * 0.12);
    },
    onMelee(base) {
      let m = base * (1 + 0.1 * (S.forge | 0));
      if (married('aurelia')) m *= 1.15;
      if (married('morgana')) P.hp = Math.min(P.maxHp, P.hp + m * 0.05);
      if (married('lyra') && Math.random() < 0.25) {
        let best = null, bd = 18; for (const e of API.enemies) { if (e.dead || e.passive) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; best = e; } }
        if (best) shoot('arrow', P.x, groundAt(P.x, P.z) + 1.6, P.z, best, m * 0.3, false);
      }
      return m;
    },
    onHurt(dmg) { return married('selene') ? dmg * 0.92 : dmg; },
  });
})();
