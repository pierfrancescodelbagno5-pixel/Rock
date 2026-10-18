/* Slime Reborn — Terre Spezzate: 3D low-poly action RPG mode (Three.js). */
(function () {
  'use strict';
  const T = window.THREE;
  const SK = window.SK;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const sfx = (n, o) => { try { SK.Audio.sfx(n, o); } catch (e) { /* audio optional */ } };
  const music = (n) => { try { SK.Audio.music(n); } catch (e) { /* audio optional */ } };

  /* ------------------------------------------------------------ save data */
  const main = SK.save.load();
  const ch = main.character || { name: 'Pierfrancesco', race: 'slime', cls: 'pierfrancesco', color: '#4fc3ff' };
  const KEY = 'slimeReborn.3d.v1';
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
  S = Object.assign({ runes: 0, level: 1, vig: 10, end: 10, mnd: 10, str: 10, grace: 0, bosses: {}, flasks: 4, stain: null, essences: 0, found: { 0: true } }, S || {});
  const saveS = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const mythic = ch.cls === 'pierfrancesco';
  const CLS = {
    pierfrancesco: { hp: 3, st: 2, fp: 2, dmg: 3 }, guerriero: { hp: 1.3, st: 1.2, fp: 1, dmg: 1.1 },
    arcimago: { hp: 1, st: 1, fp: 1.6, dmg: 1.05 }, predatore: { hp: 1.1, st: 1.1, fp: 1.1, dmg: 1.1 }, evocatore: { hp: 1, st: 1, fp: 1.3, dmg: 1 },
  }[ch.cls] || { hp: 1, st: 1, fp: 1, dmg: 1 };

  /* ------------------------------------------------------------ renderer */
  const quality = main.settings.quality || 'high';
  const renderer = new T.WebGLRenderer({ antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  $('view').appendChild(renderer.domElement);
  const scene = new T.Scene();
  const FOG = new T.Color('#b9a37a');
  scene.fog = new T.Fog(FOG, 50, quality === 'low' ? 200 : 270);
  const camera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  // sky dome with vertex-colour gradient
  {
    const g = new T.SphereGeometry(1400, 24, 12);
    const cols = [], top = new T.Color('#5d6f9a'), mid = new T.Color('#e7c98f'), low = new T.Color('#b9a37a');
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const h = p.getY(i) / 1400, c = h > 0.15 ? mid.clone().lerp(top, Math.min(1, (h - 0.15) / 0.6)) : low.clone().lerp(mid, clamp((h + 0.1) / 0.25, 0, 1));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    scene.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })));
  }
  scene.add(new T.HemisphereLight('#ffe9c0', '#3a3020', 0.9));
  const sun = new T.DirectionalLight('#ffd9a0', 1.6);
  sun.position.set(60, 90, 40);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 250 });
  scene.add(sun, sun.target);
  const flashLight = new T.PointLight('#b388ff', 0, 30);
  scene.add(flashLight);

  /* ------------------------------------------------------------ terrain */
  function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
  }
  const FLAT = []; // {x,z,r,h}
  const MAPR = 720;
  // regions of the open world
  const REGIONS = {
    center: { name: 'Pianure Dorate', ground: ['#7d8a3c', '#b59a4a'], crowns: ['#c9a23c', '#a8a03a', '#d8b04a', '#8f9a3a'], fog: '#b9a37a' },
    north: { name: 'Vette Gelide', ground: ['#c9d3dc', '#9aa6b2'], crowns: ['#e8f0f6', '#cfdde6', '#b8c9d4'], fog: '#c3ccd6' },
    east: { name: 'Terre Cremisi', ground: ['#7a3b2c', '#a8552f'], crowns: ['#b0301e', '#d0512a', '#8a2a1c'], fog: '#b07a5e' },
    west: { name: 'Palude dei Sussurri', ground: ['#3e4a32', '#5a4a5e'], crowns: ['#4a5a2a', '#5e3f6a', '#3a4a3a'], fog: '#77806a' },
  };
  function regionAt(x, z) { return z < -280 ? 'north' : x > 260 ? 'east' : x < -260 ? 'west' : 'center'; }
  function rawH(x, z) {
    let h = 0, a = 1, f = 0.012;
    for (let i = 0; i < 4; i++) { h += (vnoise(x * f, z * f) - 0.5) * a; a *= 0.5; f *= 2.1; }
    const d = Math.hypot(x, z);
    let m = Math.max(0, -z - 300) * 0.09 * (0.6 + vnoise(x * 0.01, z * 0.01)); // northern mountains
    if (x < -260) m -= Math.min(4, (-x - 260) * 0.02); // sunken swamp
    return h * 16 + m + Math.max(0, d - (MAPR - 70)) * 0.5; // hills rise at the map edge
  }
  function heightAt(x, z) {
    let h = rawH(x, z);
    for (const f of FLAT) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r * 1.6) h = lerp(f.h, h, clamp((d - f.r) / (f.r * 0.6), 0, 1));
    }
    return h;
  }
  const LOC = {
    grace: [{ x: 0, z: 6, name: 'Rovine del Risveglio' }, { x: 78, z: 52, name: 'Chiesa della Gelatina' }, { x: -150, z: 140, name: 'Crocevia Dorato' },
      { x: 330, z: -40, name: 'Accampamento Cremisi' }, { x: 430, z: -175, name: 'Soglia del Tiranno' }, { x: -390, z: 70, name: 'Palude dei Sussurri' },
      { x: -60, z: -340, name: 'Passo Gelido' }, { x: -120, z: -520, name: 'Vetta della Tempesta' }, { x: 180, z: 300, name: 'Colline del Tramonto' }],
    camp: { x: 42, z: -28 }, wolves: { x: -58, z: 24 }, ruins: { x: 86, z: 66 },
    arena: { x: 430, z: -230, r: 24 }, dragon: { x: -120, z: -590 },
    camps: [
      { x: -170, z: 60, t: 'wolf', n: 5 }, { x: 140, z: 160, t: 'soldier', n: 6 }, { x: 240, z: 330, t: 'knight', n: 3 }, { x: -60, z: 230, t: 'soldier', n: 5 },
      { x: 360, z: 40, t: 'soldier', n: 7 }, { x: 470, z: -60, t: 'knight', n: 4 }, { x: 560, z: 120, t: 'wolf', n: 5 }, { x: 380, z: -120, t: 'soldier', n: 6 },
      { x: -420, z: -20, t: 'wolf', n: 6 }, { x: -480, z: 180, t: 'knight', n: 3 }, { x: -330, z: 260, t: 'soldier', n: 6 },
      { x: 60, z: -380, t: 'wolf', n: 6 }, { x: -200, z: -420, t: 'knight', n: 3 }, { x: 40, z: -520, t: 'soldier', n: 5 },
    ],
  };
  for (const g of LOC.grace) FLAT.push({ x: g.x, z: g.z, r: 6, h: rawH(g.x, g.z) });
  FLAT.push({ x: LOC.arena.x, z: LOC.arena.z, r: LOC.arena.r + 4, h: rawH(LOC.arena.x, LOC.arena.z) });
  FLAT.push({ x: LOC.dragon.x, z: LOC.dragon.z, r: 30, h: rawH(LOC.dragon.x, LOC.dragon.z) - 1 });
  FLAT.push({ x: LOC.camp.x, z: LOC.camp.z, r: 12, h: rawH(LOC.camp.x, LOC.camp.z) });
  for (const c of LOC.camps) FLAT.push({ x: c.x, z: c.z, r: 10, h: rawH(c.x, c.z) });
  {
    const seg = quality === 'low' ? 170 : 240;
    const g = new T.PlaneGeometry(MAPR * 2.3, MAPR * 2.3, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = [];
    const grass = new T.Color('#7d8a3c'), gold = new T.Color('#b59a4a'), rock = new T.Color('#7a7064'), dirt = new T.Color('#6e5a3a');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z);
      p.setY(i, h);
      const n = vnoise(x * 0.05, z * 0.05);
      const R = REGIONS[regionAt(x + (vnoise(x * 0.02, z * 0.02) - 0.5) * 100, z + (vnoise(z * 0.02, x * 0.02) - 0.5) * 100)];
      let c = new T.Color(R.ground[0]).lerp(new T.Color(R.ground[1]), n);
      if (h > 9) c.lerp(rock, clamp((h - 9) / 8, 0, 1));
      if (n < 0.25) c.lerp(dirt, 0.5);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new T.Mesh(g, new T.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true;
    scene.add(m);
    // lake by the dragon
    const lake = new T.Mesh(new T.CircleGeometry(26, 32), new T.MeshLambertMaterial({ color: '#3d6f86', transparent: true, opacity: 0.8 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(LOC.dragon.x - 30, heightAt(LOC.dragon.x - 30, LOC.dragon.z) + 0.15, LOC.dragon.z + 10);
    scene.add(lake);
  }

  /* ------------------------------------------------------------ props */
  const COLL = []; // static circle colliders {x,z,r}
  const lam = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {}));
  function scatter(n, fn) {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 20) {
      const x = rand(-MAPR, MAPR), z = rand(-MAPR, MAPR);
      if (Math.hypot(x, z) > MAPR - 10) continue;
      let bad = false;
      for (const f of FLAT) if (Math.hypot(x - f.x, z - f.z) < f.r + 6) { bad = true; break; }
      if (Math.hypot(x - LOC.ruins.x, z - LOC.ruins.z) < 18) bad = true;
      if (!bad && fn(x, z)) placed++;
    }
  }
  function instanced(geo, mat, list) {
    const im = new T.InstancedMesh(geo, mat, list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
      m4.compose(new T.Vector3(it.x, it.y, it.z), q, new T.Vector3(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m4);
      if (it.c) im.setColorAt(i, new T.Color(it.c));
    });
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  {
    const trunks = [], crowns = [], rocks = [];
    scatter(quality === 'low' ? 600 : 1100, (x, z) => {
      const y = heightAt(x, z), s = rand(0.8, 1.6);
      trunks.push({ x, y: y + 2.2 * s, z, sx: s, sy: s, sz: s, ry: rand(0, 6) });
      crowns.push({ x, y: y + 5.2 * s, z, sx: s * rand(0.9, 1.3), sy: s * rand(0.8, 1.2), sz: s * rand(0.9, 1.3), ry: rand(0, 6), c: ((cs) => cs[(Math.random() * cs.length) | 0])(REGIONS[regionAt(x, z)].crowns) });
      COLL.push({ x, z, r: 0.7 * s });
      return true;
    });
    scatter(quality === 'low' ? 350 : 650, (x, z) => {
      const s = rand(0.6, 2.6);
      rocks.push({ x, y: heightAt(x, z) + s * 0.4, z, sx: s, sy: s * rand(0.6, 1.1), sz: s * rand(0.8, 1.3), rx: rand(0, 1), ry: rand(0, 6) });
      COLL.push({ x, z, r: s * 0.9 });
      return true;
    });
    instanced(new T.CylinderGeometry(0.28, 0.45, 4.4, 6), lam('#5a4330'), trunks);
    instanced(new T.IcosahedronGeometry(2.6, 0), lam('#ffffff'), crowns);
    instanced(new T.DodecahedronGeometry(1, 0), lam('#837a6e'), rocks);
  }
  // ruins: broken pillars and arches
  const stone = lam('#a59c88');
  function pillar(x, z, h, broken) {
    const y = heightAt(x, z);
    const m = new T.Mesh(new T.CylinderGeometry(0.7, 0.8, h, 8), stone);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true;
    if (broken) m.rotation.z = rand(-0.08, 0.08);
    scene.add(m); COLL.push({ x, z, r: 0.9 });
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; pillar(LOC.ruins.x + Math.cos(a) * 12, LOC.ruins.z + Math.sin(a) * 12, rand(3, 8), true); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; pillar(LOC.arena.x + Math.cos(a) * (LOC.arena.r + 1.5), LOC.arena.z + Math.sin(a) * (LOC.arena.r + 1.5), i % 3 ? 9 : 5, false); }
  // golden giant tree on the horizon
  {
    const g = new T.Group(), gold = new T.MeshBasicMaterial({ color: '#ffd36b', fog: false, transparent: true, opacity: 0.92 });
    const trunk = new T.MeshBasicMaterial({ color: '#e0a640', fog: false });
    for (let i = 0; i < 6; i++) {
      const c = new T.Mesh(new T.CylinderGeometry(8 - i, 10 - i, 40, 7), trunk);
      c.position.set(Math.sin(i) * 3, 20 + i * 36, Math.cos(i) * 3); c.rotation.z = Math.sin(i * 1.7) * 0.15; g.add(c);
    }
    for (let i = 0; i < 26; i++) {
      const l = new T.Mesh(new T.IcosahedronGeometry(rand(24, 46), 0), gold);
      const a = rand(0, TAU), r = rand(10, 90);
      l.position.set(Math.cos(a) * r, rand(160, 280), Math.sin(a) * r * 0.6); g.add(l);
    }
    g.position.set(-60, -30, -620);
    scene.add(g);
  }

  /* ------------------------------------------------------------ particles */
  const PMAX = 700;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), parts = [];
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return new T.CanvasTexture(c); })();
  const pts = new T.Points(pGeo, new T.PointsMaterial({ size: 0.6, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  pts.frustumCulled = false;
  scene.add(pts);
  const tmpC = new T.Color();
  function emit(x, y, z, n, color, o) {
    o = o || {};
    tmpC.set(color);
    for (let i = 0; i < n; i++) {
      if (parts.length >= PMAX) parts.shift();
      const sp = o.speed || 6;
      parts.push({ x, y, z, vx: rand(-1, 1) * sp, vy: rand(o.up ? 0.5 : -1, 1) * sp + (o.up || 0), vz: rand(-1, 1) * sp,
        life: rand(0.4, 1) * (o.life || 1), max: 0, r: tmpC.r, g: tmpC.g, b: tmpC.b, grav: o.grav == null ? 9 : o.grav });
      parts[parts.length - 1].max = parts[parts.length - 1].life;
    }
  }
  function updateParticles(dt) {
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.97; p.vz *= 0.97;
    }
    for (const p of parts) {
      const k = p.life / p.max;
      pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z;
      pCol[n * 3] = p.r * k; pCol[n * 3 + 1] = p.g * k; pCol[n * 3 + 2] = p.b * k;
      n++;
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  /* ------------------------------------------------------------ graces & markers */
  const graceObjs = LOC.grace.map((g) => {
    const y = heightAt(g.x, g.z);
    const m = new T.Mesh(new T.OctahedronGeometry(0.35, 0), new T.MeshBasicMaterial({ color: '#ffe08a' }));
    m.position.set(g.x, y + 1.3, g.z); scene.add(m);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: dot, color: '#ffcf5a', transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(4, 4, 1); halo.position.copy(m.position); scene.add(halo);
    return Object.assign({ y, mesh: m, halo }, g);
  });
  let stainMesh = null;
  function placeStain() {
    if (stainMesh) { scene.remove(stainMesh); stainMesh = null; }
    if (!S.stain) return;
    stainMesh = new T.Sprite(new T.SpriteMaterial({ map: dot, color: '#7dffb0', transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    stainMesh.scale.set(2.4, 2.4, 1); stainMesh.position.set(S.stain.x, heightAt(S.stain.x, S.stain.z) + 0.8, S.stain.z);
    scene.add(stainMesh);
  }
  // fog wall of the boss arena
  const fogWall = new T.Mesh(new T.CylinderGeometry(LOC.arena.r, LOC.arena.r, 14, 48, 1, true),
    new T.MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
  fogWall.position.set(LOC.arena.x, heightAt(LOC.arena.x, LOC.arena.z) + 7, LOC.arena.z);
  fogWall.visible = false; scene.add(fogWall);

  /* ------------------------------------------------------------ player (the slime) */
  const P = {
    x: LOC.grace[S.grace].x, z: LOC.grace[S.grace].z + 3, y: 0, vx: 0, vz: 0, vy: 0, rot: Math.PI,
    hp: 0, maxHp: 0, fp: 0, maxFp: 0, st: 0, maxSt: 0, dmg: 1, flasks: S.flasks, r: 0.9,
    roll: 0, iframe: 0, atk: null, combo: 0, comboT: 0, stun: 0, stCd: 0, dead: false, absorb: 0, auraT: 0, judT: 18, hitFlash: 0,
  };
  function recalc(full) {
    P.maxHp = Math.round((300 + (S.vig - 10) * 28) * CLS.hp);
    P.maxFp = Math.round((80 + (S.mnd - 10) * 9) * CLS.fp);
    P.maxSt = Math.round((90 + (S.end - 10) * 5) * CLS.st);
    P.dmg = (1 + (S.str - 10) * 0.06) * CLS.dmg * (1 + S.essences * 0.02);
    if (full) { P.hp = P.maxHp; P.fp = P.maxFp; P.st = P.maxSt; P.flasks = S.flasks; }
  }
  recalc(true);
  const slime = new T.Group();
  const bodyMat = new T.MeshStandardMaterial({ color: ch.color || '#4fc3ff', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.88, emissive: '#0a2a40' });
  const body = new T.Mesh(new T.SphereGeometry(1, 28, 18), bodyMat);
  body.castShadow = true; slime.add(body);
  const core = new T.Mesh(new T.IcosahedronGeometry(0.28, 0), new T.MeshBasicMaterial({ color: mythic ? '#ffd54f' : '#c8f4ff' }));
  core.position.set(0, -0.15, 0); body.add(core);
  const eyeMat = new T.MeshBasicMaterial({ color: '#10131c' }), shine = new T.MeshBasicMaterial({ color: '#ffffff' });
  for (const sx of [-0.32, 0.32]) {
    const e = new T.Mesh(new T.SphereGeometry(0.17, 12, 10), eyeMat);
    e.scale.set(0.8, 1.25, 0.6); e.position.set(sx, 0.18, 0.86); body.add(e);
    const s = new T.Mesh(new T.SphereGeometry(0.05, 8, 6), shine); s.position.set(sx + 0.05, 0.28, 0.95); body.add(s);
  }
  if (mythic || (main.best && main.best.level >= 30)) {
    const crown = new T.Group(), gm = new T.MeshStandardMaterial({ color: '#ffcf40', metalness: 0.8, roughness: 0.25, emissive: '#5a3a00' });
    crown.add(new T.Mesh(new T.CylinderGeometry(0.42, 0.46, 0.22, 10, 1, true), gm));
    for (let i = 0; i < 5; i++) {
      const sp = new T.Mesh(new T.ConeGeometry(0.09, 0.3, 5), gm);
      const a = (i / 5) * TAU; sp.position.set(Math.cos(a) * 0.43, 0.22, Math.sin(a) * 0.43); crown.add(sp);
    }
    crown.position.y = 1.15; slime.add(crown); P.crown = crown;
  }
  const auraRing = new T.Mesh(new T.RingGeometry(5.6, 6, 48), new T.MeshBasicMaterial({ color: '#ffd54f', transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
  auraRing.rotation.x = -Math.PI / 2; auraRing.visible = mythic; scene.add(auraRing);
  const blade = new T.Mesh(new T.TorusGeometry(2.1, 0.12, 6, 24, Math.PI * 0.9), new T.MeshBasicMaterial({ color: '#9ff3ff', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  blade.rotation.x = -Math.PI / 2; scene.add(blade);
  const vortex = new T.Mesh(new T.RingGeometry(0.5, 5, 40, 1, 0, TAU), new T.MeshBasicMaterial({ color: '#7c4dff', transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  vortex.rotation.x = -Math.PI / 2; scene.add(vortex);
  scene.add(slime);

  /* ------------------------------------------------------------ enemies */
  const BOX = new T.BoxGeometry(1, 1, 1);
  function part(parent, mat, sx, sy, sz, x, y, z) {
    const m = new T.Mesh(BOX, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  }
  function pivot(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  function humanoid(skin, armor, weaponLen, s) {
    const root = new T.Group(), g = new T.Group(); g.scale.setScalar(s); root.add(g);
    const sk = lam(skin), ar = lam(armor), st = lam('#8a8f98', { flatShading: true });
    const legL = pivot(g, -0.22, 1, 0), legR = pivot(g, 0.22, 1, 0);
    part(legL, ar, 0.3, 1, 0.3, 0, -0.5, 0); part(legR, ar, 0.3, 1, 0.3, 0, -0.5, 0);
    const torso = part(g, ar, 0.9, 1, 0.5, 0, 1.5, 0);
    const head = part(g, sk, 0.55, 0.55, 0.55, 0, 2.3, 0.05);
    part(head, lam('#ff3b2f', { emissive: '#ff2010' }), 0.18, 0.08, 0.05, -0.3, 0.1, 0.55);
    part(head, lam('#ff3b2f', { emissive: '#ff2010' }), 0.18, 0.08, 0.05, 0.3, 0.1, 0.55);
    const armL = pivot(g, -0.6, 1.95, 0), armR = pivot(g, 0.6, 1.95, 0);
    part(armL, sk, 0.25, 0.9, 0.25, 0, -0.45, 0); part(armR, sk, 0.25, 0.9, 0.25, 0, -0.45, 0);
    const weapon = part(armR, st, 0.12, weaponLen, 0.12, 0, -0.9 - weaponLen / 2, 0.1);
    return { root, g, legL, legR, armL, armR, torso, head, weapon, s };
  }
  function wolfModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const fur = lam('#4b4740'), dark = lam('#2b2824');
    part(g, fur, 0.6, 0.6, 1.5, 0, 0.9, 0);
    const head = part(g, fur, 0.5, 0.45, 0.6, 0, 1.15, 0.95); part(head, dark, 0.6, 0.4, 0.5, 0, -0.2, 0.6);
    part(head, lam('#ffcc33', { emissive: '#aa7700' }), 0.9, 0.12, 0.1, 0, 0.15, 0.5);
    const legs = [];
    for (const [x, z] of [[-0.22, 0.55], [0.22, 0.55], [-0.22, -0.55], [0.22, -0.55]]) { const l = pivot(g, x, 0.7, z); part(l, dark, 0.16, 0.7, 0.16, 0, -0.35, 0); legs.push(l); }
    const tail = pivot(g, 0, 1.05, -0.75); part(tail, fur, 0.14, 0.14, 0.7, 0, 0, -0.35);
    return { root, g, legs, tail, head, s: 1 };
  }
  function dragonModel() {
    const root = new T.Group(), g = new T.Group(); g.scale.setScalar(2.6); root.add(g);
    const sc = lam('#4b5a6e'), belly = lam('#a99a7a'), horn = lam('#d8d0c0');
    part(g, sc, 1.8, 1.6, 3.6, 0, 2.2, 0); part(g, belly, 1.4, 0.5, 3, 0, 1.5, 0.1);
    const neck = pivot(g, 0, 2.6, 1.7); part(neck, sc, 0.8, 0.8, 1.8, 0, 0.6, 0.8);
    const head = pivot(neck, 0, 1.1, 1.8); part(head, sc, 0.9, 0.7, 1.3, 0, 0, 0.4);
    part(head, horn, 0.12, 0.12, 0.8, -0.3, 0.45, -0.3).rotation.x = 0.5; part(head, horn, 0.12, 0.12, 0.8, 0.3, 0.45, -0.3).rotation.x = 0.5;
    part(head, lam('#ffb74d', { emissive: '#ff6d00' }), 0.95, 0.1, 0.1, 0, 0.18, 0.7);
    const legs = [];
    for (const [x, z] of [[-0.8, 1.2], [0.8, 1.2], [-0.8, -1.2], [0.8, -1.2]]) { const l = pivot(g, x, 1.6, z); part(l, sc, 0.5, 1.6, 0.5, 0, -0.8, 0); legs.push(l); }
    const tail = pivot(g, 0, 2.2, -1.8); part(tail, sc, 0.6, 0.6, 3, 0, 0, -1.5);
    const wingGeo = new T.BufferGeometry();
    wingGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.8, 0, 0, -1.2, 5.5, 0.6, -2.2, 0, 0, 0.8, 5.5, 0.6, -2.2, 4.5, 1.2, 1.4], 3));
    wingGeo.computeVertexNormals();
    const wm = new T.MeshLambertMaterial({ color: '#6e4a4a', side: T.DoubleSide, flatShading: true });
    const wingL = pivot(g, -0.8, 3, 0), wingR = pivot(g, 0.8, 3, 0);
    const wl = new T.Mesh(wingGeo, wm); wl.scale.x = -1; wingL.add(wl); wingR.add(new T.Mesh(wingGeo, wm));
    return { root, g, neck, head, legs, tail, wingL, wingR, s: 2.6 };
  }
  const TYPES = {
    soldier: { name: 'Soldato Goblin', hp: 90, r: 0.7, speed: 3.4, aggro: 16, runes: 40, build: () => humanoid('#6d8a3a', '#5a4630', 1.2, 1),
      attacks: [{ range: 2.4, windup: 0.55, active: 0.18, recover: 0.6, dmg: 45, reach: 2.6, arc: 1.4 }] },
    wolf: { name: 'Lupo Famelico', hp: 60, r: 0.7, speed: 6.5, aggro: 20, runes: 35, build: wolfModel,
      attacks: [{ range: 3.5, windup: 0.35, active: 0.25, recover: 0.5, dmg: 35, reach: 2.4, arc: 1.2, lunge: 11 }] },
    knight: { name: 'Cavaliere Oscuro', hp: 320, r: 0.9, speed: 2.8, aggro: 15, runes: 220, poise: 60, build: () => humanoid('#2c2f3a', '#3a3d4a', 1.7, 1.25),
      attacks: [{ range: 3, windup: 0.8, active: 0.2, recover: 0.7, dmg: 80, reach: 3.3, arc: 1.6 }, { range: 3, windup: 0.5, active: 0.2, recover: 0.4, dmg: 55, reach: 3.2, arc: 1.2, combo: 2 }] },
    tyrant: { name: 'Gorvan, Tiranno Caduto', boss: true, hp: 3200, r: 1.8, speed: 4, aggro: 60, runes: 4000, poise: 400, build: () => humanoid('#7b6a52', '#4a3a2a', 2.6, 3),
      attacks: [
        { name: 'slam', range: 5.5, windup: 1.0, active: 0.2, recover: 0.9, dmg: 140, reach: 5.5, arc: 1.2, wave: 9 },
        { name: 'sweep', range: 6, windup: 0.7, active: 0.3, recover: 0.6, dmg: 110, reach: 6.5, arc: 2.8 },
        { name: 'leap', range: 16, minRange: 7, windup: 0.6, active: 0.25, recover: 1.0, dmg: 150, reach: 4.5, arc: TAU, lunge: 22, wave: 11 },
        { name: 'daggers', range: 22, windup: 0.6, active: 0.1, recover: 0.6, dmg: 60, phase2: true, daggers: 5 },
      ] },
    dragon: { name: 'Drago della Tempesta Antica', boss: true, hp: 5200, r: 4.2, speed: 4.5, aggro: 45, runes: 9000, poise: 9999, build: dragonModel,
      attacks: [
        { name: 'bite', range: 8, windup: 0.6, active: 0.2, recover: 0.6, dmg: 130, reach: 9, arc: 1.0 },
        { name: 'breath', range: 18, windup: 0.9, active: 2.2, recover: 0.8, dmg: 45, reach: 18, arc: 0.7, breath: true },
        { name: 'stomp', range: 7, windup: 0.8, active: 0.2, recover: 0.8, dmg: 120, reach: 7, arc: TAU, wave: 10 },
        { name: 'storm', range: 40, windup: 1.0, active: 0.1, recover: 1.0, dmg: 90, phase2: true, bolts: 7 },
      ] },
  };
  const enemies = [];
  const barMat = new T.SpriteMaterial({ color: '#b3261e', depthTest: false });
  const barBg = new T.SpriteMaterial({ color: '#000000', opacity: 0.6, transparent: true, depthTest: false });
  function spawn(type, x, z, o) {
    const d = TYPES[type], model = d.build();
    model.root.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); } });
    scene.add(model.root);
    const e = Object.assign({ type, d, model, x, z, y: heightAt(x, z), rot: rand(0, TAU), hp: d.hp, maxHp: d.hp, state: 'idle', t: 0, atk: null,
      home: { x, z }, cd: rand(0.5, 1.5), stagger: 0, poise: d.poise || 20, dead: false, flash: 0, phase: 1, wander: rand(0, 6), vx: 0, vz: 0 }, o || {});
    if (!d.boss) {
      const bg = new T.Sprite(barBg), fg = new T.Sprite(barMat);
      bg.center.set(0, 0.5); fg.center.set(0, 0.5); bg.renderOrder = fg.renderOrder = 10;
      e.bar = { bg, fg }; scene.add(bg, fg); bg.visible = fg.visible = false;
    }
    enemies.push(e);
    return e;
  }
  function populate() {
    for (const e of enemies) { scene.remove(e.model.root); if (e.bar) scene.remove(e.bar.bg, e.bar.fg); }
    enemies.length = 0;
    for (let i = 0; i < 7; i++) spawn('soldier', LOC.camp.x + rand(-9, 9), LOC.camp.z + rand(-9, 9));
    for (let i = 0; i < 5; i++) spawn('wolf', LOC.wolves.x + rand(-10, 10), LOC.wolves.z + rand(-10, 10));
    for (let i = 0; i < 3; i++) spawn('knight', LOC.ruins.x + rand(-6, 6), LOC.ruins.z + rand(-6, 6));
    for (const c of LOC.camps) for (let i = 0; i < c.n; i++) spawn(c.t, c.x + rand(-9, 9), c.z + rand(-9, 9));
    for (let i = 0; i < 40; i++) { const a = rand(0, TAU), r = rand(40, MAPR - 80); spawn(Math.random() < 0.55 ? 'soldier' : 'wolf', Math.cos(a) * r, Math.sin(a) * r); }
    if (!S.bosses.tyrant) spawn('tyrant', LOC.arena.x, LOC.arena.z - 8, { rot: 0 });
    if (!S.bosses.dragon) spawn('dragon', LOC.dragon.x, LOC.dragon.z, { rot: 0 });
  }

  /* ------------------------------------------------------------ effects (waves, bolts, daggers) */
  const fx = [];
  function shockwave(x, z, maxR, dmg, color) {
    const m = new T.Mesh(new T.RingGeometry(0.8, 1.4, 40), new T.MeshBasicMaterial({ color: color || '#ffd27a', transparent: true, opacity: 0.9, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, heightAt(x, z) + 0.2, z); scene.add(m);
    fx.push({ kind: 'wave', m, x, z, r: 1, maxR, dmg, hit: false });
    emit(x, heightAt(x, z) + 0.5, z, 40, color || '#d8b46a', { speed: 8, up: 3 });
  }
  function bolt(x1, y1, z1, x2, y2, z2, color) {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, j = i && i < 10 ? 1.2 : 0;
      pts.push(new T.Vector3(lerp(x1, x2, t) + rand(-j, j), lerp(y1, y2, t) + rand(-j, j), lerp(z1, z2, t) + rand(-j, j)));
    }
    const l = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: color || '#c9a0ff', transparent: true }));
    scene.add(l); fx.push({ kind: 'line', m: l, t: 0.3 });
    flashLight.color.set(color || '#b388ff'); flashLight.intensity = 60; flashLight.position.set(x2, y2 + 2, z2);
  }
  function strikeAt(x, z, dmg, delay, fromBoss) {
    const y = heightAt(x, z);
    const warn = new T.Mesh(new T.CircleGeometry(2.2, 24), new T.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0.35, depthWrite: false }));
    warn.rotation.x = -Math.PI / 2; warn.position.set(x, y + 0.15, z); scene.add(warn);
    fx.push({ kind: 'strike', m: warn, x, z, t: delay, dmg, fromBoss });
  }
  function dagger(e, ang) {
    const m = new T.Mesh(new T.ConeGeometry(0.25, 1.4, 5), new T.MeshBasicMaterial({ color: '#ffd54f' }));
    m.rotation.x = Math.PI / 2; scene.add(m);
    const y = heightAt(e.x, e.z) + 4;
    fx.push({ kind: 'dagger', m, x: e.x, y, z: e.z, vx: Math.sin(ang) * 22, vz: Math.cos(ang) * 22, t: 1.8, dmg: 60, wait: 0.5 });
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      if (f.kind === 'wave') {
        f.r += dt * 16; f.m.scale.setScalar(f.r); f.m.material.opacity = 0.9 * (1 - f.r / f.maxR);
        const d = Math.hypot(P.x - f.x, P.z - f.z);
        if (!f.hit && Math.abs(d - f.r * 1.1) < 1.2 && P.y < 0.6) { f.hit = true; hurtPlayer(f.dmg, f.x, f.z); }
        if (f.r >= f.maxR) { scene.remove(f.m); fx.splice(i, 1); }
      } else if (f.kind === 'line') {
        f.t -= dt; f.m.material.opacity = f.t / 0.3;
        if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); }
      } else if (f.kind === 'strike') {
        f.t -= dt; f.m.material.opacity = 0.2 + 0.4 * Math.abs(Math.sin(f.t * 14));
        if (f.t <= 0) {
          const y = heightAt(f.x, f.z);
          bolt(f.x + rand(-3, 3), y + 30, f.z + rand(-3, 3), f.x, y, f.z, f.fromBoss ? '#8ec5ff' : '#c9a0ff');
          emit(f.x, y + 0.5, f.z, 30, f.fromBoss ? '#8ec5ff' : '#b388ff', { speed: 9, up: 4 });
          sfx('thunder');
          if (f.fromBoss) { if (Math.hypot(P.x - f.x, P.z - f.z) < 2.6) hurtPlayer(f.dmg, f.x, f.z); }
          scene.remove(f.m); fx.splice(i, 1);
        }
      } else if (f.kind === 'dagger') {
        if (f.wait > 0) { f.wait -= dt; f.m.position.set(f.x, f.y, f.z); f.m.rotation.z = Math.atan2(f.vx, f.vz); continue; }
        f.t -= dt; f.x += f.vx * dt; f.z += f.vz * dt; f.y = lerp(f.y, heightAt(f.x, f.z) + 1, dt * 3);
        f.m.position.set(f.x, f.y, f.z);
        if (Math.hypot(P.x - f.x, P.z - f.z) < 1.2) { hurtPlayer(f.dmg, f.x - f.vx, f.z - f.vz); f.t = 0; }
        if (f.t <= 0) { scene.remove(f.m); fx.splice(i, 1); }
      }
    }
    flashLight.intensity = Math.max(0, flashLight.intensity - dt * 300);
  }

  /* ------------------------------------------------------------ input */
  const input = { mx: 0, mz: 0, keys: {}, pressed: {}, yaw: Math.PI, pitch: 0.35, lock: null };
  const press = (k) => { input.pressed[k] = true; };
  const KEYS = { ShiftLeft: 'run', KeyM: 'map', KeyJ: 'light', KeyK: 'heavy', Space: 'roll', KeyQ: 'lock', KeyR: 'flask', KeyE: 'interact', KeyF: 'skill', KeyG: 'absorb', Escape: 'pause', KeyP: 'pause' };
  window.addEventListener('keydown', (e) => {
    try { SK.Audio.init(); SK.Audio.resume(); } catch (er) { /* ignore */ }
    input.keys[e.code] = true;
    if (KEYS[e.code] && !e.repeat) press(KEYS[e.code]);
    if (e.code === 'ArrowLeft') input.yaw += 0.1; if (e.code === 'ArrowRight') input.yaw -= 0.1;
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  const view = renderer.domElement;
  const joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: -1, x: 0, y: 0 };
  const joyEl = $('joy');
  view.addEventListener('pointerdown', (e) => {
    try { SK.Audio.init(); SK.Audio.resume(); } catch (er) { /* ignore */ }
    if (e.pointerType === 'mouse' && e.button === 0 && !document.pointerLockElement && e.clientX > innerWidth * 0.4) { /* mouse: drag to look */ }
    if (e.clientX < innerWidth * 0.42 && joy.id < 0) {
      joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
      joyEl.style.display = 'block'; joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px';
    } else if (look.id < 0) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; look.moved = 0; }
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
    if (e.pointerId === look.id) {
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.x = e.clientX; look.y = e.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
      input.yaw -= dx * 0.006; input.pitch = clamp(input.pitch + dy * 0.004, -0.15, 1.1);
    }
  });
  const endPtr = (e) => {
    if (e.pointerId === joy.id) { joy.id = -1; joyEl.style.display = 'none'; }
    if (e.pointerId === look.id) { if (e.pointerType === 'mouse' && look.moved < 6) press('light'); look.id = -1; }
  };
  view.addEventListener('pointerup', endPtr); view.addEventListener('pointercancel', endPtr);
  view.addEventListener('contextmenu', (e) => { e.preventDefault(); press('heavy'); });
  // on-screen buttons
  const touchEl = $('touch');
  const BTN = [['light', 'Attacco', 66, 96, 34, 'big'], ['heavy', 'Colpo<br>pesante', 140, 60, 26], ['roll', 'Schiva', 140, 140, 28],
    ['skill', 'Fulmine<br>Nero', 66, 178, 24], ['absorb', 'Preda-<br>tore', 214, 104, 24], ['flask', 'Cura', 28, 252, 21], ['lock', 'Mira', 214, 178, 21], ['run', 'Corri', 214, 36, 21]];
  for (const [k, label, rx, by, r, cls] of BTN) {
    const b = document.createElement('div');
    b.className = 'tbtn' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    Object.assign(b.style, { width: r * 2 + 'px', height: r * 2 + 'px', right: `calc(${rx - r}px + env(safe-area-inset-right))`, bottom: by - r + 'px' });
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); press(k); b.classList.add('on'); try { SK.Audio.init(); SK.Audio.resume(); } catch (er) { /* ignore */ } SK.vibrate(10); });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
    touchEl.appendChild(b);
  }
  {
    const b = document.createElement('div');
    const mb = document.createElement('div');
    mb.className = 'tbtn'; mb.innerHTML = 'Mappa';
    Object.assign(mb.style, { width: '48px', height: '48px', right: 'calc(64px + env(safe-area-inset-right))', top: '8px' });
    mb.addEventListener('pointerdown', (e) => { e.stopPropagation(); press('map'); });
    touchEl.appendChild(mb);
    b.className = 'tbtn'; b.innerHTML = '❚❚';
    Object.assign(b.style, { width: '40px', height: '40px', right: 'calc(14px + env(safe-area-inset-right))', top: '12px' });
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); press('pause'); });
    touchEl.appendChild(b);
  }
  $('prompt').addEventListener('pointerdown', (e) => { e.stopPropagation(); press('interact'); });

  /* ------------------------------------------------------------ HUD helpers */
  let toastT = 0;
  function toast(t) { $('toast').textContent = t; $('toast').classList.add('show'); toastT = 2.6; }
  let msgT = 0;
  function bigMsg(text, cls, dur) { const m = $('msg'); m.textContent = text; m.className = cls + ' show'; msgT = dur || 3; }
  const runesEl = $('runes');
  function hud() {
    const W = (v) => Math.min(38, 12 + v / 60) + 'vw';
    $('hp').style.width = W(P.maxHp); $('fp').style.width = W(P.maxFp); $('st').style.width = W(P.maxSt * 2);
    $('hp').querySelector('i').style.width = (100 * P.hp / P.maxHp) + '%'; $('hp').querySelector('b').style.width = (100 * P.hp / P.maxHp) + '%';
    $('fp').querySelector('i').style.width = (100 * P.fp / P.maxFp) + '%'; $('fp').querySelector('b').style.width = (100 * P.fp / P.maxFp) + '%';
    $('st').querySelector('i').style.width = (100 * P.st / P.maxSt) + '%';
    $('flask').textContent = `⚗ Gelatina Cremisi ×${P.flasks}   ·   Lv ${S.level}${mythic ? '   ·   ♛ Imperatore Infinito' : ''}`;
    runesEl.innerHTML = `${Math.floor(S.runes).toLocaleString('it-IT')} <small>anime</small>`;
    const boss = enemies.find((e) => e.d.boss && e.engaged && !e.dead);
    $('boss').style.display = boss ? 'block' : 'none';
    if (boss) {
      $('boss').querySelector('.name').textContent = boss.d.name;
      $('boss').querySelector('i').style.width = (100 * boss.hp / boss.maxHp) + '%';
      $('boss').querySelector('b').style.width = (100 * boss.hp / boss.maxHp) + '%';
    }
    const ret = $('reticle');
    if (input.lock && !input.lock.dead) {
      const v = new T.Vector3(input.lock.x, input.lock.y + (input.lock.d.boss ? 4 : 1.4), input.lock.z).project(camera);
      ret.style.display = v.z < 1 ? 'block' : 'none';
      ret.style.left = ((v.x + 1) / 2) * innerWidth + 'px'; ret.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
    } else ret.style.display = 'none';
  }

  /* ------------------------------------------------------------ combat */
  function hurtPlayer(dmg, fx0, fz0) {
    if (P.dead || P.iframe > 0 || state !== 'play') return;
    if (SK.debug.godmode) dmg = 0;
    P.hp -= dmg; P.hitFlash = 0.25; P.stun = 0.35; P.atk = null;
    const a = Math.atan2(P.x - fx0, P.z - fz0);
    P.vx = Math.sin(a) * 9; P.vz = Math.cos(a) * 9;
    shake = 0.5; sfx('hurt'); SK.vibrate(40);
    emit(P.x, P.y + 1, P.z, 18, '#ff5252', { speed: 6 });
    if (P.hp <= 0) die();
  }
  function hitEnemy(e, dmg, poiseDmg, kx, kz) {
    if (e.dead) return;
    const crit = Math.random() < (mythic ? 0.35 : 0.08);
    dmg = Math.round(dmg * (crit ? 1.8 : 1) * rand(0.9, 1.1));
    e.hp -= dmg; e.flash = 0.15; e.engaged = true;
    e.poise -= poiseDmg;
    if (e.poise <= 0) { e.stagger = e.d.boss ? 1.6 : 0.7; e.poise = e.d.poise || 20; e.atk = null; e.state = 'stagger'; if (e.d.boss) toast('Postura spezzata!'); }
    if (!e.d.boss) { e.vx += kx * 5; e.vz += kz * 5; }
    emit(e.x, e.y + (e.d.boss ? 4 : 1.2), e.z, crit ? 22 : 12, crit ? '#ffd54f' : '#ffffff', { speed: 7 });
    sfx(crit ? 'crit' : 'hit');
    hitstop = crit ? 0.08 : 0.04;
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e, absorbed) {
    e.dead = true; e.deadT = 0; e.state = 'dead';
    if (e.bar) e.bar.bg.visible = e.bar.fg.visible = false;
    const gain = Math.round(e.d.runes * (mythic ? 3 : 1) * (absorbed ? 2 : 1));
    S.runes += gain;
    emit(e.x, e.y + 1, e.z, e.d.boss ? 160 : 30, absorbed ? '#b388ff' : '#ffe08a', { speed: e.d.boss ? 14 : 6, up: 3, life: 1.6 });
    sfx(e.d.boss ? 'bossDie' : 'kill');
    if (input.lock === e) input.lock = null;
    if (e.d.boss) {
      S.bosses[e.type] = true;
      main.souls = (main.souls || 0) + 100; main.totalSouls = (main.totalSouls || 0) + 100; SK.save.write();
      fogWall.visible = false;
      setTimeout(() => { bigMsg('NEMICO ABBATTUTO', 'gold', 4); sfx('victory'); music('forest'); }, 900);
      setTimeout(() => toast(`+${gain.toLocaleString('it-IT')} anime · +100 Anime al regno principale`), 3200);
      if (S.bosses.tyrant && S.bosses.dragon) setTimeout(() => { bigMsg('SIGNORE DELLE TERRE SPEZZATE', 'gold', 5); }, 6000);
    } else if (absorbed) toast('《Essenza assimilata. Potere +2%》');
    saveS();
  }
  function facingTarget(maxD, arc) {
    let best = null, bd = maxD;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r;
      if (d > bd) continue;
      const a = Math.atan2(e.x - P.x, e.z - P.z);
      if (Math.abs(angDiff(P.rot, a)) > arc) continue;
      best = e; bd = d;
    }
    return best;
  }

  /* ------------------------------------------------------------ player actions */
  function useStamina(n) { if (P.st <= 0) return false; P.st -= n; P.stCd = 0.9; return true; }
  function startAttack(heavy) {
    if (!useStamina(heavy ? 30 : 14)) return;
    if (input.lock && !input.lock.dead) P.rot = Math.atan2(input.lock.x - P.x, input.lock.z - P.z);
    P.combo = P.comboT > 0 ? (P.combo + 1) % 3 : 0;
    P.atk = { heavy, t: 0, dur: heavy ? 0.75 : 0.42, hitAt: heavy ? 0.45 : 0.16, done: false };
    sfx(heavy ? 'dash' : 'slash');
    if (heavy) P.vy = 7;
  }
  function resolveAttack() {
    const a = P.atk, reach = a.heavy ? 4 : 3.2, arc = a.heavy ? Math.PI : 1.2;
    const base = (a.heavy ? 70 : [32, 36, 48][P.combo]) * P.dmg;
    let any = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r;
      if (d > reach) continue;
      const ang = Math.atan2(e.x - P.x, e.z - P.z);
      if (Math.abs(angDiff(P.rot, ang)) > arc) continue;
      hitEnemy(e, base, a.heavy ? 40 : 14, Math.sin(ang), Math.cos(ang)); any = true;
    }
    if (a.heavy) { shockwave(P.x, P.z, 5, 0, '#9ff3ff'); shake = 0.35; }
    blade.material.opacity = 0.9;
    blade.position.set(P.x, P.y + 1, P.z); blade.rotation.z = -P.rot + Math.PI * 0.05 + (P.combo % 2 ? 0.4 : -0.4);
    emit(P.x + Math.sin(P.rot) * 2, P.y + 1, P.z + Math.cos(P.rot) * 2, any ? 10 : 6, '#9ff3ff', { speed: 5 });
  }
  function castLightning() {
    if (P.fp < 30) { toast('FP insufficienti'); sfx('uiBack'); return; }
    let target = input.lock && !input.lock.dead ? input.lock : null;
    if (!target) {
      let bd = 26;
      for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; target = e; } }
    }
    if (!target) { toast('Nessun bersaglio'); return; }
    P.fp -= 30;
    const hitList = [target];
    for (const e of enemies) { if (hitList.length >= 3) break; if (!e.dead && e !== target && Math.hypot(e.x - target.x, e.z - target.z) < 10) hitList.push(e); }
    let px = P.x, py = P.y + 1.5, pz = P.z;
    for (const e of hitList) {
      const ty = e.y + (e.d.boss ? 4 : 1.2);
      bolt(px, py, pz, e.x, ty, e.z); bolt(e.x + rand(-2, 2), ty + 25, e.z + rand(-2, 2), e.x, ty, e.z);
      hitEnemy(e, 120 * P.dmg, 35, 0, 0);
      px = e.x; py = ty; pz = e.z;
    }
    sfx('thunder'); shake = 0.3;
  }
  function startAbsorb() {
    if (P.absorb > 0 || !useStamina(20)) return;
    P.absorb = 1.2; sfx('absorbStart');
  }
  function updateAbsorb(dt) {
    if (P.absorb <= 0) { vortex.material.opacity = Math.max(0, vortex.material.opacity - dt * 3); return; }
    P.absorb -= dt;
    vortex.position.set(P.x, P.y + 0.2, P.z); vortex.rotation.z += dt * 8; vortex.material.opacity = 0.55;
    if (Math.random() < 0.6) {
      const a = rand(0, TAU), r = rand(3, 6);
      parts.push({ x: P.x + Math.cos(a) * r, y: P.y + 0.6, z: P.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2, vy: 0, vz: -Math.sin(a) * r * 2, life: 0.45, max: 0.45, r: 0.7, g: 0.4, b: 1, grav: 0 });
    }
    for (const e of enemies) {
      if (e.dead || e.d.boss) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d < 6) {
        const a = Math.atan2(P.x - e.x, P.z - e.z);
        e.vx += Math.sin(a) * dt * 20; e.vz += Math.cos(a) * dt * 20;
        if (e.hp < e.maxHp * 0.3 || (mythic && e.hp < e.maxHp * 0.6)) {
          killEnemy(e, true); S.essences++; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.15); recalc(false); sfx('absorb');
        }
      }
    }
  }
  function drinkFlask() {
    if (P.flasks <= 0) { toast('Nessuna Gelatina rimasta'); return; }
    if (P.atk || P.roll > 0) return;
    P.flasks--; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.55); sfx('heal');
    emit(P.x, P.y + 1, P.z, 24, '#ff6b6b', { speed: 2, up: 3, grav: 0 });
  }
  function toggleLock() {
    if (input.lock) { input.lock = null; return; }
    let best = null, bd = 30;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      const a = Math.atan2(e.x - P.x, e.z - P.z), facing = Math.abs(angDiff(input.yaw + Math.PI, a));
      const score = d + facing * 8;
      if (score < bd + 8 && d < 30) { bd = score - 8; best = e; }
    }
    input.lock = best;
    if (best) sfx('select');
  }

  /* ------------------------------------------------------------ player update */
  let shake = 0, hitstop = 0;
  function updatePlayer(dt) {
    // movement intent relative to camera
    let mx = 0, mz = 0;
    if (input.keys.KeyW) mz -= 1; if (input.keys.KeyS) mz += 1; if (input.keys.KeyA) mx -= 1; if (input.keys.KeyD) mx += 1;
    if (joy.id >= 0) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, l = Math.hypot(dx, dy); if (l > 6) { mx = dx / Math.max(l, 50); mz = dy / Math.max(l, 50); } }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const cy = Math.cos(input.yaw), sy = Math.sin(input.yaw);
    // camera looks along -forward; forward on screen (mz=-1) = direction from camera to player
    const wx = mx * cy + mz * sy, wz = -mx * sy + mz * cy;
    const moveAmt = Math.min(1, Math.hypot(mx, mz));

    P.iframe = Math.max(0, P.iframe - dt); P.stun = Math.max(0, P.stun - dt); P.comboT = Math.max(0, P.comboT - dt);
    P.hitFlash = Math.max(0, P.hitFlash - dt);
    P.stCd -= dt; if (P.stCd <= 0 && !P.atk && P.roll <= 0) P.st = Math.min(P.maxSt, P.st + dt * (P.absorb > 0 ? 10 : 45));

    const pr = input.pressed;
    if (!P.stun) {
      if (pr.roll && P.roll <= 0 && !P.atk && useStamina(18)) {
        const ra = moveAmt > 0.2 ? Math.atan2(wx, wz) : P.rot;
        P.roll = 0.45; P.iframe = mythic ? 0.45 : 0.32; P.rot = ra; P.vx = Math.sin(ra) * 13; P.vz = Math.cos(ra) * 13; sfx('dash');
      }
      if ((pr.light || pr.heavy) && P.roll <= 0 && (!P.atk || P.atk.t > P.atk.dur * 0.7)) startAttack(!!pr.heavy);
      if (pr.skill && !P.atk) castLightning();
      if (pr.absorb) startAbsorb();
      if (pr.flask) drinkFlask();
    }
    if (pr.lock) toggleLock();
    if (pr.run) { P.sprint = !P.sprint; toast(P.sprint ? 'Corsa attivata' : 'Corsa disattivata'); }

    if (P.roll > 0) {
      P.roll -= dt; P.vx *= 1 - dt * 2.2; P.vz *= 1 - dt * 2.2;
    } else if (P.atk) {
      const a = P.atk; a.t += dt;
      const lunge = a.t < a.hitAt ? (a.heavy ? 6 : 4) : 0;
      P.vx = Math.sin(P.rot) * lunge; P.vz = Math.cos(P.rot) * lunge;
      if (!a.done && a.t >= a.hitAt) { a.done = true; resolveAttack(); }
      if (a.t >= a.dur) { P.atk = null; P.comboT = 0.45; }
    } else if (P.stun > 0) {
      P.vx *= 1 - dt * 6; P.vz *= 1 - dt * 6;
    } else {
      const running = P.sprint && P.st > 1 && moveAmt > 0.3;
      if (running) { P.st -= dt * 9; P.stCd = 0.5; if (Math.random() < dt * 20) emit(P.x, heightAt(P.x, P.z) + 0.2, P.z, 1, '#d8c39a', { speed: 1.5, up: 1 }); }
      const sp = 7 * (P.absorb > 0 ? 0.5 : 1) * (mythic ? 1.25 : 1) * (running ? 1.85 : 1);
      P.vx = lerp(P.vx, wx * sp * moveAmt, dt * 10); P.vz = lerp(P.vz, wz * sp * moveAmt, dt * 10);
      if (moveAmt > 0.1) {
        const target = input.lock && !input.lock.dead ? Math.atan2(input.lock.x - P.x, input.lock.z - P.z) : Math.atan2(wx, wz);
        P.rot += angDiff(P.rot, target) * Math.min(1, dt * 12);
      } else if (input.lock && !input.lock.dead) P.rot += angDiff(P.rot, Math.atan2(input.lock.x - P.x, input.lock.z - P.z)) * Math.min(1, dt * 8);
    }
    P.x += P.vx * dt; P.z += P.vz * dt;
    // collisions
    for (const c of COLL) {
      const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), m = c.r + P.r;
      if (d < m && d > 0.001) { P.x = c.x + (dx / d) * m; P.z = c.z + (dz / d) * m; }
    }
    const R = Math.hypot(P.x, P.z); if (R > MAPR - 5) { P.x *= (MAPR - 5) / R; P.z *= (MAPR - 5) / R; }
    if (fogWall.visible) {
      const dx = P.x - LOC.arena.x, dz = P.z - LOC.arena.z, d = Math.hypot(dx, dz), m = LOC.arena.r - 1;
      if (d > m) { P.x = LOC.arena.x + (dx / d) * m; P.z = LOC.arena.z + (dz / d) * m; }
    }
    // vertical (jump for heavy attack)
    P.vy -= 30 * dt; P.y = Math.max(0, P.y + P.vy * dt); if (P.y === 0) P.vy = 0;
    const gy = heightAt(P.x, P.z);
    updateAbsorb(dt);

    // slime visuals
    const sp = Math.hypot(P.vx, P.vz), t = performance.now() / 1000;
    slime.position.set(P.x, gy + P.y + 0.85, P.z);
    slime.rotation.y = P.rot;
    let sx = 1 + Math.sin(t * 3) * 0.03, syv = 1 - Math.sin(t * 3) * 0.03;
    if (sp > 1) { const b = Math.abs(Math.sin(t * 12)) * 0.12; syv -= b; sx += b * 0.6; slime.position.y += Math.abs(Math.sin(t * 12)) * 0.25; }
    if (P.roll > 0) { syv = 0.6; sx = 1.3; body.rotation.x += dt * 20; } else body.rotation.x = lerp(body.rotation.x % TAU, 0, dt * 10);
    if (P.atk) { const k = P.atk.t / P.atk.dur; sx += Math.sin(k * Math.PI) * 0.25; syv -= Math.sin(k * Math.PI) * 0.15; }
    if (P.absorb > 0) { sx = 1.25 + Math.sin(t * 30) * 0.05; syv = 0.85; }
    body.scale.set(sx, syv, sx);
    bodyMat.emissive.set(P.hitFlash > 0 ? '#ff2020' : P.iframe > 0 ? '#204060' : '#0a2a40');
    if (P.crown) P.crown.rotation.y += dt;
    blade.material.opacity = Math.max(0, blade.material.opacity - dt * 4);
    if (mythic) {
      auraRing.position.set(P.x, gy + 0.15, P.z); auraRing.rotation.z += dt * 0.8;
      P.auraT -= dt;
      if (P.auraT <= 0) {
        P.auraT = 0.5;
        for (const e of enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 6 + e.d.r) hitEnemyQuiet(e, 14 * P.dmg);
        if (Math.random() < 0.7) emit(P.x + rand(-5, 5), gy + 0.3, P.z + rand(-5, 5), 2, '#ffd54f', { speed: 0.5, up: 2, grav: -1 });
      }
      P.judT -= dt;
      const near = enemies.some((e) => !e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 25);
      if (P.judT <= 0 && near) {
        P.judT = 18;
        toast('《Sentenza Imperiale.》');
        for (const e of enemies) if (!e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 25) {
          bolt(e.x, e.y + 28, e.z, e.x, e.y + 1, e.z, '#ffd54f');
          hitEnemy(e, (e.d.boss ? 0.25 : 1) * 200 * P.dmg, 50, 0, 0);
        }
        shockwave(P.x, P.z, 25, 0, '#ffd54f'); shake = 0.6; sfx('thunder');
      }
    }
  }
  function hitEnemyQuiet(e, dmg) {
    e.hp -= dmg; e.engaged = true; e.flash = 0.06;
    if (e.hp <= 0) killEnemy(e);
  }

  /* ------------------------------------------------------------ enemy AI */
  function updateEnemy(e, dt) {
    const m = e.model, d = e.d;
    if (e.dead) {
      e.deadT += dt;
      m.root.position.y = e.y - e.deadT * (d.boss ? 1.5 : 2);
      m.root.scale.setScalar(Math.max(0.01, 1 - e.deadT * 0.6));
      if (e.deadT > 1.6) m.root.visible = false;
      return;
    }
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.cd -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    if (!e.engaged && dist < d.aggro && !P.dead) {
      if (d.boss && e.type === 'tyrant' && Math.hypot(P.x - LOC.arena.x, P.z - LOC.arena.z) > LOC.arena.r - 2) { /* wait inside the arena */ }
      else {
        e.engaged = true;
        if (d.boss) {
          if (e.type === 'tyrant') fogWall.visible = true;
          music(e.type === 'dragon' ? 'finalboss' : 'boss'); sfx('bossRoar'); bigMsg(d.name, 'place', 3);
        }
      }
    }
    if (e.engaged && !d.boss && dist > d.aggro * 2.5) { e.engaged = false; }
    if (!d.boss) {
      const show = e.hp < e.maxHp && dist < 25;
      e.bar.bg.visible = e.bar.fg.visible = show;
      if (show) {
        const by = e.y + (e.type === 'knight' ? 3.6 : e.type === 'wolf' ? 2.1 : 3);
        e.bar.bg.position.set(e.x - 0.75, by, e.z); e.bar.bg.scale.set(1.5, 0.14, 1);
        e.bar.fg.position.set(e.x - 0.75, by, e.z); e.bar.fg.scale.set(1.5 * Math.max(0, e.hp / e.maxHp), 0.1, 1);
      }
    }
    if (d.boss && e.hp < e.maxHp * 0.5 && e.phase === 1) { e.phase = 2; toast(e.type === 'dragon' ? 'Il drago evoca la tempesta!' : 'Il Tiranno si infuria!'); sfx('bossRoar'); shake = 0.6; }

    let vx = 0, vz = 0, anim = 'idle';
    if (e.stagger > 0) { e.stagger -= dt; anim = 'stagger'; }
    else if (e.atk) {
      const a = e.atk; a.t += dt; anim = 'attack';
      const ph = a.t < a.def.windup ? 'wind' : a.t < a.def.windup + a.def.active ? 'act' : 'rec';
      if (ph === 'wind' && !a.def.breath) e.rot += angDiff(e.rot, toP) * Math.min(1, dt * (d.boss ? 3 : 6));
      if (ph === 'act' && a.def.lunge && !a.lunged) { a.lunged = true; e.vx = Math.sin(e.rot) * a.def.lunge; e.vz = Math.cos(e.rot) * a.def.lunge; }
      if (ph === 'act' && a.def.breath) {
        const hx = e.x + Math.sin(e.rot) * 9, hz = e.z + Math.cos(e.rot) * 9;
        for (let i = 0; i < 4; i++) parts.push({ x: hx, y: e.y + 6, z: hz, vx: Math.sin(e.rot + rand(-0.3, 0.3)) * 22, vy: rand(-6, -2), vz: Math.cos(e.rot + rand(-0.3, 0.3)) * 22, life: 0.8, max: 0.8, r: 1, g: rand(0.4, 0.7), b: 0.1, grav: 0 });
        e.rot += angDiff(e.rot, toP) * dt * 0.8;
        const pa = Math.atan2(P.x - hx, P.z - hz);
        a.tick = (a.tick || 0) - dt;
        if (a.tick <= 0 && dist < a.def.reach && Math.abs(angDiff(e.rot, pa)) < a.def.arc) { a.tick = 0.35; hurtPlayer(a.def.dmg, e.x, e.z); }
        if (Math.random() < 0.1) sfx('fire');
      }
      if (ph !== 'wind' && !a.hit) {
        a.hit = true;
        const def = a.def;
        if (def.wave) shockwave(e.x + Math.sin(e.rot) * 3, e.z + Math.cos(e.rot) * 3, def.wave, def.dmg * 0.6, '#d8b46a');
        if (def.daggers) for (let i = 0; i < def.daggers; i++) dagger(e, toP + (i - (def.daggers - 1) / 2) * 0.22);
        if (def.bolts) for (let i = 0; i < def.bolts; i++) strikeAt(P.x + rand(-7, 7) * (i ? 1 : 0), P.z + rand(-7, 7) * (i ? 1 : 0), def.dmg, 0.6 + i * 0.18, true);
        if (!def.breath && !def.bolts && !def.daggers) {
          const pa = Math.atan2(P.x - e.x, P.z - e.z);
          if (dist - P.r < def.reach + d.r * 0.5 && Math.abs(angDiff(e.rot, pa)) < def.arc / 2 + 0.2) hurtPlayer(def.dmg * (S.level > 1 ? 1 : 1), e.x, e.z);
        }
        if (d.boss) shake = Math.max(shake, 0.35);
        sfx(d.boss ? 'explosion' : 'slash', { vol: d.boss ? 1 : 0.6 });
      }
      if (a.t >= a.def.windup + a.def.active + a.def.recover) {
        if (a.def.combo && !a.chained) { e.atk = { def: a.def, t: 0, chained: true }; }
        else { e.atk = null; e.cd = d.boss ? rand(0.4, 1.1) / (e.phase) : rand(0.8, 1.8); }
      }
    } else if (e.engaged && !P.dead) {
      e.rot += angDiff(e.rot, toP) * Math.min(1, dt * 5);
      const opts = d.attacks.filter((a) => dist < a.range + d.r && (!a.minRange || dist > a.minRange) && (!a.phase2 || e.phase > 1));
      if (e.cd <= 0 && opts.length) { const def = opts[(Math.random() * opts.length) | 0]; e.atk = { def, t: 0 }; if (d.boss) sfx('warning', { vol: 0.4 }); }
      else if (dist > (d.attacks[0].range + d.r) * 0.8) { vx = Math.sin(e.rot) * d.speed * (e.phase > 1 ? 1.3 : 1); vz = Math.cos(e.rot) * d.speed * (e.phase > 1 ? 1.3 : 1); anim = 'walk'; }
      else if (!d.boss) { const s = Math.sin(e.t * 0.8 + e.wander) > 0 ? 1 : -1; vx = Math.cos(e.rot) * 1.5 * s; vz = -Math.sin(e.rot) * 1.5 * s; anim = 'walk'; }
    } else {
      // wander near home
      const hx = e.home.x - e.x, hz = e.home.z - e.z;
      if (Math.hypot(hx, hz) > 6) { const a = Math.atan2(hx, hz); e.rot += angDiff(e.rot, a) * dt * 3; vx = Math.sin(e.rot) * 1.6; vz = Math.cos(e.rot) * 1.6; anim = 'walk'; }
      else if (Math.sin(e.t * 0.4 + e.wander) > 0.3) { e.rot += dt * 0.6; vx = Math.sin(e.rot) * 1.2; vz = Math.cos(e.rot) * 1.2; anim = 'walk'; }
    }
    e.vx *= 1 - Math.min(1, dt * 5); e.vz *= 1 - Math.min(1, dt * 5);
    e.x += (vx + e.vx) * dt; e.z += (vz + e.vz) * dt;
    // separation from player & other enemies
    if (dist < d.r + P.r && dist > 0.01) { const k = (d.r + P.r - dist); e.x -= (dx / dist) * k; e.z -= (dz / dist) * k; }
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      const ox = e.x - o.x, oz = e.z - o.z, od = Math.hypot(ox, oz), mn = d.r + o.d.r;
      if (od < mn && od > 0.01) { e.x += (ox / od) * (mn - od) * 0.5; e.z += (oz / od) * (mn - od) * 0.5; }
    }
    if (e.type === 'tyrant') { const ax = e.x - LOC.arena.x, az = e.z - LOC.arena.z, ad = Math.hypot(ax, az), lim = LOC.arena.r - d.r; if (ad > lim) { e.x = LOC.arena.x + ax / ad * lim; e.z = LOC.arena.z + az / ad * lim; } }
    e.y = heightAt(e.x, e.z);
    // pose
    m.root.position.set(e.x, e.y, e.z); m.root.rotation.y = e.rot;
    const t = e.t, a = e.atk;
    const wind = a ? clamp(a.t / a.def.windup, 0, 1) : 0, act = a && a.t > a.def.windup ? clamp((a.t - a.def.windup) / (a.def.active + 0.05), 0, 1) : 0;
    if (m.legL) { // humanoid
      const sw = anim === 'walk' ? Math.sin(t * 9) * 0.6 : 0;
      m.legL.rotation.x = sw; m.legR.rotation.x = -sw; m.armL.rotation.x = -sw * 0.6;
      m.armR.rotation.x = a ? (act > 0 ? lerp(-2.6, 1.2, act) : -2.6 * wind) : sw * 0.6;
      if (a && a.def.name === 'sweep') { m.armR.rotation.z = act > 0 ? lerp(1.4, -1.4, act) : 1.4 * wind; m.armR.rotation.x = -1.4; } else m.armR.rotation.z = 0;
      m.g.position.y = a && a.def.name === 'leap' && act > 0 ? Math.sin(act * Math.PI) * 4 : 0;
      m.g.rotation.x = anim === 'stagger' ? -0.3 : a && act > 0 ? 0.2 : 0;
    } else if (m.wingL) { // dragon
      const flap = Math.sin(t * (a && a.def.name === 'storm' ? 8 : 2)) * 0.5;
      m.wingL.rotation.z = flap + 0.2; m.wingR.rotation.z = -flap - 0.2;
      m.legs.forEach((l, i) => { l.rotation.x = anim === 'walk' ? Math.sin(t * 5 + i * Math.PI / 2) * 0.5 : 0; });
      m.neck.rotation.x = a && a.def.name === 'bite' ? (act > 0 ? lerp(-0.6, 0.6, act) : -0.6 * wind) : a && a.def.breath ? 0.35 : Math.sin(t) * 0.08;
      m.g.position.y = a && a.def.name === 'stomp' ? (act > 0 ? 0 : wind * 2.5) : 0;
      m.tail.rotation.y = Math.sin(t * 1.5) * 0.4;
    } else if (m.legs) { // wolf
      m.legs.forEach((l, i) => { l.rotation.x = anim === 'walk' || (a && act > 0) ? Math.sin(t * 14 + (i % 2) * Math.PI + (i > 1 ? 1 : 0)) * 0.8 : 0; });
      m.tail.rotation.x = 0.4 + Math.sin(t * 6) * 0.2; m.g.rotation.x = a ? (act > 0 ? 0.3 : -0.25 * wind) : 0;
    }
    const fl = e.flash > 0;
    m.root.traverse((o) => { if (o.isMesh && o.material.emissive) { if (fl) o.material.emissive.setRGB(0.9, 0.9, 0.9); else if (o.userData.em) o.material.emissive.copy(o.userData.em); else { o.userData.em = o.material.emissive.clone(); } } });
    if (e.phase > 1 && Math.random() < 0.2) emit(e.x + rand(-2, 2), e.y + rand(1, 6), e.z + rand(-2, 2), 1, e.type === 'dragon' ? '#8ec5ff' : '#ff7043', { speed: 1, up: 2, grav: -1 });
  }

  /* ------------------------------------------------------------ grace / death / flow */
  let state = 'play', fadeT = 0, curRegion = 'center';
  const fogTarget = new T.Color(REGIONS.center.fog);
  /* world map with fast travel */
  let mapImg = null;
  function openMap() {
    state = 'menu';
    let panel = $('mapp');
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'panel'; panel.id = 'mapp';
      panel.innerHTML = '<div class="box" style="padding:10px;text-align:center"><canvas id="mapc" width="512" height="512" style="width:min(78vh,86vw);height:min(78vh,86vw);display:block;margin:auto;touch-action:none"></canvas><div class="muted" id="mapinfo">Tocca una Luce di Grazia scoperta per viaggiare</div><button id="mapx">Chiudi</button></div>';
      document.body.appendChild(panel);
      $('mapx').addEventListener('click', () => { panel.classList.remove('open'); state = 'play'; });
      $('mapc').addEventListener('pointerdown', (ev) => {
        const r = ev.target.getBoundingClientRect(), mx = (ev.clientX - r.left) / r.width * 2 - 1, mz = (ev.clientY - r.top) / r.height * 2 - 1;
        const wx = mx * MAPR, wz = mz * MAPR;
        const i = graceObjs.findIndex((g, k) => S.found[k] && Math.hypot(g.x - wx, g.z - wz) < 40);
        if (i < 0) return;
        if (enemies.some((e) => e.d.boss && e.engaged && !e.dead)) { $('mapinfo').textContent = 'Non puoi viaggiare durante uno scontro!'; return; }
        panel.classList.remove('open');
        $('fade').style.opacity = 1;
        setTimeout(() => { S.grace = i; P.x = graceObjs[i].x; P.z = graceObjs[i].z + 3; P.vx = P.vz = 0; camPos.set(P.x, heightAt(P.x, P.z) + 6, P.z + 10); saveS(); state = 'play'; $('fade').style.opacity = 0; bigMsg(graceObjs[i].name, 'place', 2.5); }, 900);
      });
    }
    const c = $('mapc'), x = c.getContext('2d');
    if (!mapImg) {
      mapImg = x.createImageData(128, 128);
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
        const wx = (i / 64 - 1) * MAPR, wz = (j / 64 - 1) * MAPR, h = rawH(wx, wz), R = REGIONS[regionAt(wx, wz)];
        const col = new T.Color(R.ground[0]).lerp(new T.Color('#ffffff'), clamp(h / 60, 0, 0.5)).lerp(new T.Color('#000000'), Math.hypot(wx, wz) > MAPR - 20 ? 0.7 : 0);
        const o = (j * 128 + i) * 4; mapImg.data[o] = col.r * 255; mapImg.data[o + 1] = col.g * 255; mapImg.data[o + 2] = col.b * 255; mapImg.data[o + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 128; tmp.getContext('2d').putImageData(mapImg, 0, 0);
    x.imageSmoothingEnabled = true; x.drawImage(tmp, 0, 0, 512, 512);
    const W = (v) => (v / MAPR + 1) * 256;
    x.font = '13px Georgia'; x.textAlign = 'center';
    for (const k of Object.keys(REGIONS)) {
      const pos = { center: [0, 60], north: [0, -500], east: [480, 0], west: [-480, 0] }[k];
      x.fillStyle = 'rgba(255,240,200,.75)'; x.fillText(REGIONS[k].name, W(pos[0]), W(pos[1]));
    }
    graceObjs.forEach((g, i) => { if (!S.found[i]) return; x.fillStyle = '#ffd36b'; x.beginPath(); x.arc(W(g.x), W(g.z), 7, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.fillText(g.name, W(g.x), W(g.z) - 11); });
    for (const [k, l] of [['tyrant', LOC.arena], ['dragon', LOC.dragon]]) if (!S.bosses[k]) { x.fillStyle = '#c62828'; x.font = '20px Georgia'; x.fillText('☠', W(l.x), W(l.z) + 7); x.font = '13px Georgia'; }
    if (S.stain) { x.fillStyle = '#7dffb0'; x.beginPath(); x.arc(W(S.stain.x), W(S.stain.z), 5, 0, TAU); x.fill(); }
    x.save(); x.translate(W(P.x), W(P.z)); x.rotate(-P.rot + Math.PI); x.fillStyle = '#4fc3ff'; x.strokeStyle = '#fff'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -10); x.lineTo(7, 8); x.lineTo(-7, 8); x.closePath(); x.fill(); x.stroke(); x.restore();
    panel.classList.add('open');
  }
  function nearGrace() { for (let i = 0; i < graceObjs.length; i++) if (Math.hypot(P.x - graceObjs[i].x, P.z - graceObjs[i].z) < 3.2) return i; return -1; }
  const LVCOST = () => Math.round(300 + Math.pow(S.level, 1.8) * 40);
  function openGrace(i) {
    state = 'menu'; S.grace = i; P.hp = P.maxHp; P.fp = P.maxFp; P.flasks = S.flasks; saveS(); sfx('heal');
    populate();
    const box = $('grace').querySelector('.box');
    const render = () => {
      const c = LVCOST();
      box.innerHTML = `<h2>${graceObjs[i].name}</h2><div class="muted" style="text-align:center">Luce di Grazia · Livello ${S.level} · ${Math.floor(S.runes).toLocaleString('it-IT')} anime</div>
        <div class="muted" style="text-align:center;margin-bottom:6px">Costo prossimo livello: ${c.toLocaleString('it-IT')}</div>
        ${[['vig', 'Vigore (Vita)'], ['mnd', 'Mente (FP)'], ['end', 'Tempra (Stamina)'], ['str', 'Forza (Danno)']].map(([k, n]) =>
          `<div class="row"><span>${n}: <b>${S[k]}</b></span><button data-k="${k}" ${S.runes < c ? 'disabled style="opacity:.4"' : ''}>+1</button></div>`).join('')}
        <div class="row"><span>Fiaschette: <b>${S.flasks}</b></span><button data-k="flask" ${S.runes < 1500 || S.flasks >= 10 ? 'disabled style="opacity:.4"' : ''}>+1 (1500)</button></div>
        <button id="g-go">Riprendi il viaggio</button><button id="g-menu">Torna al Regno (menu principale)</button>`;
      box.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (k === 'flask') { if (S.runes >= 1500) { S.runes -= 1500; S.flasks++; P.flasks = S.flasks; } }
        else { const cost = LVCOST(); if (S.runes < cost) return; S.runes -= cost; S[k]++; S.level++; recalc(true); sfx('levelup'); }
        saveS(); render();
      }));
      $('g-go').addEventListener('click', () => { $('grace').classList.remove('open'); state = 'play'; sfx('ui'); });
      $('g-menu').addEventListener('click', () => { saveS(); location.href = 'index.html'; });
    };
    render();
    $('grace').classList.add('open');
  }
  function die() {
    P.dead = true; state = 'dead'; P.atk = null; input.lock = null;
    bigMsg('SEI CADUTO', 'death', 4); sfx('gameover'); music(null);
    S.stain = S.runes > 0 ? { x: P.x, z: P.z, runes: S.runes } : null; S.runes = 0; saveS();
    fadeT = 4.2;
  }
  function respawn() {
    const g = LOC.grace[S.grace];
    Object.assign(P, { x: g.x, z: g.z + 3, vx: 0, vz: 0, vy: 0, y: 0, dead: false, stun: 0, roll: 0, absorb: 0 });
    recalc(true); fogWall.visible = false; populate(); placeStain();
    state = 'play'; music('forest'); $('fade').style.opacity = 0;
  }
  function openPause() {
    state = 'menu';
    const box = $('pause').querySelector('.box');
    box.innerHTML = `<h2>Terre Spezzate</h2>
      <div class="muted">Sinistra: muoviti · Destra: trascina per girare la visuale<br>Attacco / Colpo pesante · Schiva (invulnerabile) · Mira (aggancia)<br>
      Corri (consuma stamina) · Mappa: viaggio rapido tra le Luci di Grazia scoperte<br>Fulmine Nero (FP) · Predatore (divora i nemici indeboliti) · Cura (Gelatina Cremisi)<br>Tastiera: WASD, J/K, Spazio, Q, F, G, R, E, frecce<br>
      Riposa alle Luci di Grazia ✦ per salire di livello. Se cadi perdi le anime: recuperale dalla macchia verde.</div>
      <button id="p-go">Riprendi</button><button id="p-menu">Torna al Regno (menu principale)</button>`;
    $('p-go').addEventListener('click', () => { $('pause').classList.remove('open'); state = 'play'; });
    $('p-menu').addEventListener('click', () => { saveS(); location.href = 'index.html'; });
    $('pause').classList.add('open');
  }
  window.SKBack = () => { if (state === 'menu') { $('pause').classList.remove('open'); $('grace').classList.remove('open'); state = 'play'; return true; } openPause(); return true; };

  /* ------------------------------------------------------------ camera */
  const camPos = new T.Vector3(), camLook = new T.Vector3();
  function updateCamera(dt) {
    if (input.lock && !input.lock.dead) {
      const a = Math.atan2(P.x - input.lock.x, P.z - input.lock.z);
      input.yaw += angDiff(input.yaw, a) * Math.min(1, dt * 5);
      if (Math.hypot(input.lock.x - P.x, input.lock.z - P.z) > 40) input.lock = null;
    }
    const boss = enemies.some((e) => e.d.boss && e.engaged && !e.dead);
    const dist = boss ? 11 : 8, gy = heightAt(P.x, P.z);
    const tx = P.x + Math.sin(input.yaw) * Math.cos(input.pitch) * dist;
    const tz = P.z + Math.cos(input.yaw) * Math.cos(input.pitch) * dist;
    let ty = gy + P.y + 2 + Math.sin(input.pitch) * dist;
    ty = Math.max(ty, heightAt(tx, tz) + 0.8);
    camPos.lerp(new T.Vector3(tx, ty, tz), Math.min(1, dt * 10));
    camera.position.copy(camPos);
    if (shake > 0) { camera.position.x += rand(-1, 1) * shake * 0.6; camera.position.y += rand(-1, 1) * shake * 0.6; shake = Math.max(0, shake - dt * 1.5); }
    camLook.set(P.x, gy + P.y + 1.4, P.z);
    if (input.lock && !input.lock.dead) camLook.lerp(new T.Vector3(input.lock.x, input.lock.y + (input.lock.d.boss ? 3 : 1), input.lock.z), 0.3);
    camera.lookAt(camLook);
    sun.position.set(P.x + 40, gy + 80, P.z + 30); sun.target.position.set(P.x, gy, P.z);
  }

  /* ------------------------------------------------------------ main loop */
  let last = performance.now(), bot = { t: 0 };
  function botInput(dt) {
    bot.t -= dt;
    const tgt = enemies.filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    input.keys = {};
    if (tgt) {
      const d = Math.hypot(tgt.x - P.x, tgt.z - P.z);
      input.yaw = Math.atan2(P.x - tgt.x, P.z - tgt.z);
      if (d > 3 + tgt.d.r) input.keys.KeyW = true;
      else if (bot.t <= 0) { bot.t = 0.3; press(Math.random() < 0.2 ? 'roll' : Math.random() < 0.15 ? 'skill' : 'light'); }
      if (P.hp < P.maxHp * 0.35) press('flask');
    }
  }
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000) * (SK.debug.speed || 1); last = now;
    if (SK.debug.autoplay && state === 'play') botInput(dt);
    if (hitstop > 0) { hitstop -= dt; dt *= 0.05; }
    if (state === 'play') {
      if (input.pressed.pause) openPause();
      updatePlayer(dt);
      for (const e of enemies) {
        const far = !e.engaged && Math.hypot(e.x - P.x, e.z - P.z) > 130;
        if (far) { e.model.root.visible = false; if (e.bar) e.bar.bg.visible = e.bar.fg.visible = false; }
        else { if (!e.dead) e.model.root.visible = true; updateEnemy(e, dt); }
      }
      updateFx(dt);
      const rg = regionAt(P.x, P.z);
      if (rg !== curRegion) { curRegion = rg; bigMsg(REGIONS[rg].name, 'place', 3); fogTarget.set(REGIONS[rg].fog); }
      scene.fog.color.lerp(fogTarget, Math.min(1, dt * 0.6));
      graceObjs.forEach((g, i) => { if (!S.found[i] && Math.hypot(P.x - g.x, P.z - g.z) < 14) { S.found[i] = true; saveS(); toast('Luce di Grazia scoperta: ' + g.name); sfx('skillGet'); } });
      if (input.pressed.map) openMap();
      const gi = nearGrace();
      const pr = $('prompt');
      if (gi >= 0) { pr.style.display = 'block'; pr.textContent = 'Riposa alla Luce di Grazia ✦'; if (input.pressed.interact) openGrace(gi); }
      else pr.style.display = 'none';
      if (S.stain && Math.hypot(P.x - S.stain.x, P.z - S.stain.z) < 2) { S.runes += S.stain.runes; toast(`Anime recuperate: ${S.stain.runes.toLocaleString('it-IT')}`); S.stain = null; placeStain(); sfx('coin'); saveS(); }
      if (Math.random() < dt * 3) { const g = graceObjs[(Math.random() * graceObjs.length) | 0]; emit(g.x + rand(-0.5, 0.5), g.y + 1, g.z + rand(-0.5, 0.5), 1, '#ffd36b', { speed: 0.3, up: 1.5, grav: -0.5, life: 2 }); }
    } else if (state === 'dead') {
      fadeT -= dt;
      for (const e of enemies) updateEnemy(e, dt * 0.3);
      if (fadeT < 1.4) $('fade').style.opacity = 1;
      if (fadeT <= 0) respawn();
    }
    updateParticles(dt);
    updateCamera(Math.max(dt, 0.001));
    graceObjs.forEach((g, i) => { g.mesh.rotation.y += dt * 1.5; g.mesh.position.y = g.y + 1.3 + Math.sin(now / 600 + i) * 0.15; });
    if (stainMesh) stainMesh.material.opacity = 0.6 + Math.sin(now / 200) * 0.3;
    if (fogWall.visible) fogWall.material.opacity = 0.14 + Math.sin(now / 300) * 0.05;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').classList.remove('show'); }
    hud();
    renderer.render(scene, camera);
    input.pressed = {};
    requestAnimationFrame(frame);
  }

  populate(); placeStain();
  camPos.set(P.x, heightAt(P.x, P.z) + 6, P.z + 10);
  requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
  setTimeout(() => { $('fade').style.opacity = 0; bigMsg('TERRE SPEZZATE', 'place', 3.5); }, 200);
  setTimeout(() => toast(`Benvenuto, ${ch.name}. Le Luci di Grazia ✦ ti attendono.`), 3800);
  let audioOn = false;
  SK.events.on('gesture', () => { if (audioOn) return; audioOn = true; try { SK.Audio.init(); SK.Audio.setVolumes(main.settings.music, main.settings.sfx); music('forest'); } catch (e) { /* ignore */ } });
  window.addEventListener('pointerdown', function once() { SK.events.emit('gesture'); window.removeEventListener('pointerdown', once); });
  window.addEventListener('keydown', function once() { SK.events.emit('gesture'); window.removeEventListener('keydown', once); });
  window.SK3D = { P, S, enemies, openMap, get state() { return state; } };
})();
