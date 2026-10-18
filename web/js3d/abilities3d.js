/* Slime Reborn — Terre Spezzate: abilities3d.js
 * Predatore ability system (absorb every ability), projectiles, new monsters (bat, spider, viper, fire spirit,
 * mini-boss Serpe della Tempesta) and the Dragon mimicry form. Plugin for game3d.js (see docs/PLUGIN3D.md). */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE;
  const { P, S, scene, heightAt, emit, sfx, hdr, std, mesh, pivot, sph, coneG, cap, BOX, rand, lerp, clamp, angDiff, TAU } = API;
  const LOW = API.quality === 'low', HIGH = API.quality === 'high';
  const toast = (t) => API.toast(t);
  const oracle = (t, gold) => { if (typeof API.oracle === 'function') API.oracle(t, gold); else setTimeout(() => API.toast(t), 650); };
  const dmgNum = (x, y, z, v, cls) => { if (typeof API.dmgNum === 'function') API.dmgNum(x, y, z, v, cls); };
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const V1 = new T.Vector3(), V2 = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  const CC = {};
  const col = (h) => CC[h] || (CC[h] = new T.Color(h));
  let clock = 0;

  /* ================================================================ particles (own systems: directional jets + smoke) */
  function PSys(max, additive) {
    const pos = new Float32Array(max * 3), cl = new Float32Array(max * 3), size = new Float32Array(max), D = new Float32Array(max * 11);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(cl, 3));
    geo.setAttribute('size', new T.BufferAttribute(size, 1));
    const pts = new T.Points(geo, API.pointMat(additive));
    pts.frustumCulled = false; pts.renderOrder = additive ? 3 : 2; scene.add(pts);
    let n = 0;
    function add(x, y, z, vx, vy, vz, life, r, g, b, sz, grav, drag) {
      if (n >= max) return;
      const i = n++, o = i * 11;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      D[o] = vx; D[o + 1] = vy; D[o + 2] = vz; D[o + 3] = life; D[o + 4] = life;
      D[o + 5] = r; D[o + 6] = g; D[o + 7] = b; D[o + 8] = sz; D[o + 9] = grav; D[o + 10] = drag;
      size[i] = 0;
    }
    function update(dt) {
      for (let i = 0; i < n; i++) {
        const o = i * 11;
        D[o + 3] -= dt;
        if (D[o + 3] <= 0) {
          n--;
          if (i !== n) { pos.copyWithin(i * 3, n * 3, n * 3 + 3); D.copyWithin(o, n * 11, n * 11 + 11); }
          i--; continue;
        }
        const dr = Math.max(0, 1 - D[o + 10] * dt);
        D[o] *= dr; D[o + 2] *= dr; D[o + 1] = D[o + 1] * dr - D[o + 9] * dt;
        pos[i * 3] += D[o] * dt; pos[i * 3 + 1] += D[o + 1] * dt; pos[i * 3 + 2] += D[o + 2] * dt;
        const k = D[o + 3] / D[o + 4];
        if (additive) {
          cl[i * 3] = D[o + 5] * k; cl[i * 3 + 1] = D[o + 6] * k; cl[i * 3 + 2] = D[o + 7] * k;
          size[i] = D[o + 8] * (0.35 + 0.65 * k);
        } else {
          cl[i * 3] = D[o + 5]; cl[i * 3 + 1] = D[o + 6]; cl[i * 3 + 2] = D[o + 7];
          size[i] = D[o + 8] * (1.7 - 0.7 * k) * Math.min(1, k * 3.5);
        }
      }
      geo.setDrawRange(0, n);
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true;
    }
    return { add, update, clear() { n = 0; geo.setDrawRange(0, 0); } };
  }
  const FXA = PSys(LOW ? 420 : 1000, true), FXN = PSys(LOW ? 120 : 280, false);
  function spark(x, y, z, vx, vy, vz, life, h, k, sz, grav, drag) { const c = col(h); FXA.add(x, y, z, vx, vy, vz, life, c.r * k, c.g * k, c.b * k, sz, grav || 0, drag || 0); }
  function smoke(x, y, z, vx, vy, vz, life, h, sz, grav) { const c = col(h); FXN.add(x, y, z, vx, vy, vz, life, c.r, c.g, c.b, sz, grav || 0, 1.6); }
  function burst(x, y, z, n, h, k, speed, life, sz, grav) {
    if (LOW) n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, u = rand(-1, 1), s = Math.sqrt(1 - u * u), v = speed * rand(0.4, 1);
      spark(x, y, z, Math.cos(a) * s * v, u * v + speed * 0.3, Math.sin(a) * s * v, life * rand(0.6, 1.1), h, k, sz * rand(0.6, 1.3), grav, 2);
    }
  }

  /* ================================================================ procedural textures */
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return new T.CanvasTexture(c);
  }
  let seed = 1234567;
  const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const RUNE_TEX = canvasTex(256, 256, (x) => {
    x.translate(128, 128); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); };
    ring(122, 4); ring(113, 1.6); ring(78, 3); ring(71, 1.4); ring(36, 2.4);
    x.lineWidth = 2.4;
    for (let k = 0; k < 2; k++) {
      x.beginPath();
      for (let i = 0; i <= 3; i++) { const a = k * Math.PI / 3 + i * TAU / 3 - Math.PI / 2; const px = Math.cos(a) * 110, py = Math.sin(a) * 110; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 22; i++) {
      x.save(); x.rotate((i / 22) * TAU); x.translate(0, -95); x.lineWidth = 2.3; x.beginPath();
      const strokes = 2 + ((srnd() * 3) | 0);
      for (let k = 0; k < strokes; k++) { x.moveTo((srnd() - 0.5) * 13, (srnd() - 0.5) * 14); x.lineTo((srnd() - 0.5) * 13, (srnd() - 0.5) * 14); }
      if (srnd() < 0.4) { x.moveTo(4, 0); x.arc(0, 0, 4, 0, TAU); }
      x.stroke(); x.restore();
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; x.beginPath(); x.arc(Math.cos(a) * 54, Math.sin(a) * 54, 5, 0, TAU); x.fill(); }
    x.beginPath(); x.arc(0, 0, 9, 0, TAU); x.fill();
  });
  const PILLAR_TEX = canvasTex(64, 128, (x, w, h) => {
    for (let i = 0; i < w; i++) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.37) * Math.sin(i * 0.13 + 1));
      const gr = x.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, `rgba(255,255,255,${(0.35 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(255,255,255,${a.toFixed(3)})`);
      x.fillStyle = gr; x.fillRect(i, 0, 1, h);
    }
  });
  const WEB_TEX = canvasTex(256, 256, (x) => {
    x.translate(128, 128); x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 2.4;
    const N = 12;
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 124, Math.sin(a) * 124); x.stroke(); }
    x.lineWidth = 1.8;
    for (let r = 14; r < 122; r += 12) {
      x.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU, rr = r + (srnd() - 0.5) * 3, px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        if (!i) x.moveTo(px, py);
        else { const m = ((i - 0.5) / N) * TAU; x.quadraticCurveTo(Math.cos(m) * r * 0.86, Math.sin(m) * r * 0.86, px, py); }
      }
      x.stroke();
    }
  });
  const SPIRAL_TEX = canvasTex(256, 256, (x) => {
    x.translate(128, 128);
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(-128, -128, 256, 256);
    x.lineCap = 'round';
    for (let k = 0; k < 6; k++) {
      let px = 0, py = 0;
      for (let r = 4; r < 124; r += 3) {
        const a = (k * TAU) / 6 + r * 0.045, nx = Math.cos(a) * r, ny = Math.sin(a) * r;
        if (r > 4) { x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.lineWidth = 2 + 9 * (1 - r / 124); x.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - r / 130)).toFixed(3)})`; x.stroke(); }
        px = nx; py = ny;
      }
    }
  });

  /* ================================================================ shared geometry + materials */
  const FLAT = new T.PlaneGeometry(2, 2); FLAT.rotateX(-Math.PI / 2);
  const RINGG = new T.RingGeometry(0.86, 1, 56); RINGG.rotateX(-Math.PI / 2);
  const TORG = new T.TorusGeometry(1, 0.035, 4, 56); TORG.rotateX(Math.PI / 2);
  const CYLO = new T.CylinderGeometry(1, 1, 1, 22, 1, true); CYLO.translate(0, 0.5, 0);
  const THREADG = new T.CylinderGeometry(0.03, 0.03, 1, 5, 1, true); THREADG.translate(0, 0.5, 0);
  const addMat = (hex, k, map, op) => new T.MeshBasicMaterial({ color: hdr(hex, k), map: map || null, transparent: true, opacity: op == null ? 1 : op,
    blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
  const glowSprite = (hex, k, s) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr(hex, k), transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    sp.scale.set(s, s, 1); return sp;
  };
  const basic = (hex, k) => new T.MeshBasicMaterial({ color: hdr(hex, k) });

  /* ================================================================ pooled FX: rings, magic circle, pillar, dome, vortex, webs, threads */
  const RINGS = [];
  function ring(x, y, z, r0, r1, dur, hex, k, geo) {
    geo = geo || RINGG;
    let o = null;
    for (const r of RINGS) if (r.t <= 0 && r.m.geometry === geo) { o = r; break; }
    if (!o) {
      if (RINGS.length > 28) return null;
      const m = new T.Mesh(geo, addMat('#ffffff', 1)); m.visible = false; m.renderOrder = 4; scene.add(m);
      o = { m, t: 0 }; RINGS.push(o);
    }
    o.t = o.dur = dur; o.r0 = r0; o.r1 = r1;
    o.m.material.color.copy(col(hex)).multiplyScalar(k);
    o.m.position.set(x, y, z); o.m.scale.set(r0, 1, r0); o.m.visible = true; o.m.material.opacity = 1;
    return o;
  }
  function updateRings(dt) {
    for (const o of RINGS) {
      if (o.t <= 0) continue;
      o.t -= dt;
      const p = 1 - Math.max(0, o.t) / o.dur, e = 1 - (1 - p) * (1 - p);
      const s = lerp(o.r0, o.r1, e); o.m.scale.set(s, 1, s); o.m.material.opacity = (1 - p) * (1 - p);
      if (o.t <= 0) o.m.visible = false;
    }
  }
  // magic circle under the caster
  const MC = { a: new T.Mesh(FLAT, addMat('#ffffff', 1, RUNE_TEX, 0)), b: new T.Mesh(FLAT, addMat('#ffffff', 1, RUNE_TEX, 0)), t: 0, dur: 1 };
  MC.a.visible = MC.b.visible = false; MC.a.renderOrder = MC.b.renderOrder = 4; scene.add(MC.a, MC.b);
  function magicCircle(hex) {
    MC.t = MC.dur = 1.0;
    MC.a.material.color.copy(col(hex)).multiplyScalar(2.4); MC.b.material.color.copy(col(hex)).multiplyScalar(3.2);
    MC.a.visible = MC.b.visible = true;
  }
  function updateMagic(dt, gy) {
    if (MC.t <= 0) return;
    MC.t -= dt;
    const p = 1 - Math.max(0, MC.t) / MC.dur;
    const op = p < 0.12 ? p / 0.12 : 1 - sstep(0.55, 1, p);
    const big = P.form === 'dragon' ? 1.9 : 1;
    const x = Math.min(1, p / 0.2) - 1, s = 2.6 * big * (1 + 2.70158 * x * x * x + 1.70158 * x * x);
    MC.a.position.set(P.x, gy + 0.12, P.z); MC.b.position.set(P.x, gy + 0.16 + p * 1.2, P.z);
    MC.a.scale.setScalar(s); MC.b.scale.setScalar(s * 0.55);
    MC.a.rotation.y += dt * 1.8; MC.b.rotation.y -= dt * 3.2;
    MC.a.material.opacity = op; MC.b.material.opacity = op * 0.85;
    if (MC.t <= 0) MC.a.visible = MC.b.visible = false;
  }
  // golden light pillar (ability acquired)
  const PIL = { m: new T.Mesh(CYLO, addMat('#ffd36b', 2.6, PILLAR_TEX, 0)), t: 0 };
  PIL.m.visible = false; PIL.m.renderOrder = 5; scene.add(PIL.m);
  function pillar() {
    PIL.t = 2.4; PIL.m.visible = true;
    const gy = heightAt(P.x, P.z);
    ring(P.x, gy + 0.2, P.z, 0.5, 9, 1.1, '#ffd36b', 3);
    ring(P.x, gy + 0.25, P.z, 0.5, 5, 0.8, '#fff3c0', 3);
    burst(P.x, gy + 1, P.z, 50, '#ffd36b', 2.6, 9, 1.2, 0.35, -2);
    API.flashLight.color.set('#ffd36b'); API.flashLight.intensity = 70; API.flashLight.position.set(P.x, gy + 4, P.z);
    API.setShake(0.25);
  }
  function updatePillar(dt, gy) {
    if (PIL.t <= 0) return;
    PIL.t -= dt;
    const k = PIL.t / 2.4, w = 1.4 * (0.4 + 0.6 * sstep(0, 0.15, 1 - k)) * (0.6 + 0.4 * k);
    PIL.m.position.set(P.x, gy - 0.5, P.z); PIL.m.scale.set(w, 36 * sstep(0, 0.12, 1 - k + 0.001), w);
    PIL.m.material.opacity = Math.min(1, k * 2.2); PIL.m.rotation.y += dt * 2;
    if (Math.random() < dt * 30) spark(P.x + rand(-1, 1), gy + rand(0, 3), P.z + rand(-1, 1), 0, rand(4, 9), 0, 1.2, '#ffd36b', 2.4, 0.3, 0, 0);
    if (PIL.t <= 0) PIL.m.visible = false;
  }
  // darkened sky dome for Tempesta Nera
  const DOME = new T.Mesh(new T.SphereGeometry(820, 18, 10), new T.MeshBasicMaterial({ color: '#05030c', transparent: true, opacity: 0, side: T.BackSide, depthWrite: false, fog: false }));
  DOME.visible = false; DOME.renderOrder = -5; scene.add(DOME);
  // the engine recomputes the fog colour every frame after the hooks run: scale it at the source while the storm is active
  const FOGK = { k: 1 };
  if (scene.fog && scene.fog.color) {
    const fc = scene.fog.color, base = T.Color.prototype.multiplyScalar;
    fc.multiplyScalar = function (v) { return base.call(this, v * FOGK.k); };
  }
  // storm vignette (cheap DOM overlay under the HUD)
  const VIG = document.createElement('div');
  VIG.style.cssText = 'position:fixed;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 55%, rgba(14,8,32,0) 25%, rgba(10,6,24,.55) 70%, rgba(4,2,12,.92) 100%);';
  { const v = document.getElementById('view'); if (v && v.parentNode) v.parentNode.insertBefore(VIG, v.nextSibling); else document.body.appendChild(VIG); }
  // breath cone (Respiro Velenoso / dragon fire)
  const STREAK_TEX = canvasTex(64, 128, (x, w, h) => {
    for (let i = 0; i < 26; i++) {
      const sx = srnd() * w, sw = 1 + srnd() * 4, y0 = srnd() * h, len = 20 + srnd() * 60;
      const gr = x.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${(0.4 + srnd() * 0.6).toFixed(2)})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(sx, y0, sw, len); if (y0 + len > h) x.fillRect(sx, y0 - h, sw, len);
    }
  });
  STREAK_TEX.wrapS = STREAK_TEX.wrapT = T.RepeatWrapping;
  const CONEG = new T.ConeGeometry(1, 1, 18, 1, true); CONEG.rotateX(-Math.PI / 2); CONEG.translate(0, 0, 0.5);
  const BCONE = new T.Mesh(CONEG, addMat('#5dff3a', 1.4, STREAK_TEX, 0)); BCONE.visible = false; BCONE.renderOrder = 4; scene.add(BCONE);
  // devouring vortex (Fame Insaziabile)
  const VX = { a: new T.Mesh(FLAT, addMat('#b04dff', 2.2, SPIRAL_TEX, 0)), b: new T.Mesh(FLAT, addMat('#ff4dd2', 2.8, RUNE_TEX, 0)) };
  VX.a.visible = VX.b.visible = false; VX.a.renderOrder = VX.b.renderOrder = 4; scene.add(VX.a, VX.b);
  // webs (Filo d'Acciaio)
  const WEBS = [];
  function web(e, dur) {
    let w = null;
    for (const o of WEBS) if (o.t <= 0) { w = o; break; }
    if (!w) {
      if (WEBS.length >= 8) return;
      const g = new T.Group();
      const disc = new T.Mesh(FLAT, addMat('#dfeaff', 1.8, WEB_TEX, 0.9)); disc.renderOrder = 4;
      const coc = new T.Mesh(CYLO, addMat('#cfe0ff', 1.5, WEB_TEX, 0.8)); coc.renderOrder = 4;
      g.add(disc, coc); g.visible = false; scene.add(g);
      w = { g, disc, coc, t: 0 }; WEBS.push(w);
    }
    w.e = e; w.t = w.dur = dur; w.g.visible = true;
    const r = e.d.r + 0.45;
    w.disc.scale.setScalar(r * 2.4); w.coc.scale.set(r, e.d.boss ? 4 : e.type === 'bat' ? 1 : 1.9, r);
    w.coc.position.y = e.type === 'bat' ? 0.4 : 0;
  }
  function updateWebs(dt) {
    for (const w of WEBS) {
      if (w.t <= 0) continue;
      w.t -= dt;
      if (w.e.dead) w.t = Math.min(w.t, 0.3);
      const k = clamp(w.t / 0.35, 0, 1), grow = clamp((w.dur - w.t) / 0.2, 0, 1);
      w.g.position.set(w.e.x, w.e.y + 0.06, w.e.z);
      w.disc.material.opacity = 0.9 * k * grow; w.coc.material.opacity = 0.75 * k * grow;
      w.coc.scale.y = Math.max(0.01, w.coc.scale.y);
      w.coc.rotation.y += dt * 0.6;
      if (w.t <= 0) w.g.visible = false;
    }
  }
  // glowing threads (lines between two points)
  const LINES = [];
  function takeLine(hex, k) {
    let l = null;
    for (const o of LINES) if (!o.on) { l = o; break; }
    if (!l) { const m = new T.Mesh(THREADG, addMat('#ffffff', 1)); m.renderOrder = 4; scene.add(m); l = { m, on: false }; LINES.push(l); }
    l.on = true; l.t = -1; l.e = null; l.m.visible = true; l.m.material.opacity = 1;
    l.m.material.color.copy(col(hex || '#e8f4ff')).multiplyScalar(k || 3);
    return l;
  }
  function setLine(m, ax, ay, az, bx, by, bz) {
    V1.set(bx - ax, by - ay, bz - az);
    const L = V1.length() || 0.001; V1.multiplyScalar(1 / L);
    m.quaternion.setFromUnitVectors(UP, V1); m.position.set(ax, ay, az); m.scale.set(1, L, 1);
  }
  function updateLines(dt) {
    for (const l of LINES) {
      if (!l.on || l.t < 0) continue;
      l.t -= dt;
      if (l.e) setLine(l.m, P.x, heightAt(P.x, P.z) + P.y + 0.9, P.z, l.e.x, aimY(l.e), l.e.z);
      l.m.material.opacity = clamp(l.t / 0.5, 0, 1);
      if (l.t <= 0) { l.on = false; l.m.visible = false; }
    }
  }

  /* ================================================================ projectiles (player abilities + enemy ranged attacks) */
  const aimY = (e) => e.y + (e.d.boss ? e.d.r * 0.9 : e.type === 'bat' ? 2.4 : e.type === 'flame' ? 1.7 : 1.1);
  const PROJ = [], PFREE = [], MPOOL = {};
  const WATER_GEO = new T.TorusGeometry(0.72, 0.1, 5, 18, Math.PI * 1.2); WATER_GEO.rotateX(Math.PI / 2);
  const WATER_GEO2 = new T.TorusGeometry(0.56, 0.045, 4, 16, Math.PI * 1.05); WATER_GEO2.rotateX(Math.PI / 2);
  const ORB_GEO = new T.IcosahedronGeometry(1, 1);
  const PK = {
    water: {
      build() { const g = new T.Group(); g.add(new T.Mesh(WATER_GEO, addMat('#36c8ff', 2.4))); g.add(new T.Mesh(WATER_GEO2, addMat('#e6fbff', 3.2))); g.add(glowSprite('#4fd8ff', 1.1, 1.6)); return g; },
      tick(p, dt) {
        p.m.rotation.y += dt * 22; p.m.rotation.z = Math.sin(p.age * 9 + p.seed) * 0.35;
        if (Math.random() < dt * (LOW ? 25 : 50)) spark(p.x, p.y, p.z, rand(-1, 1), rand(-0.5, 1.5), rand(-1, 1), 0.45, '#7fe6ff', 2, 0.28, 4, 1);
      },
      hit(p, e) {
        API.hitEnemy(e, p.dmg, 12, p.vx / p.sp, p.vz / p.sp);
        burst(p.x, p.y, p.z, 14, '#7fe6ff', 2.4, 7, 0.6, 0.35, 9);
        ring(p.x, aimY(e) - 0.3, p.z, 0.3, 2.2, 0.35, '#7fe6ff', 2.2, TORG);
      },
      end(p) { burst(p.x, p.y, p.z, 6, '#7fe6ff', 1.6, 4, 0.5, 0.3, 9); },
    },
    flame: {
      build() {
        const g = new T.Group();
        const core = new T.Mesh(ORB_GEO, new T.MeshBasicMaterial({ color: '#0c0414' })); core.scale.setScalar(0.42); g.add(core);
        const shell = new T.Mesh(ORB_GEO, new T.MeshBasicMaterial({ color: hdr('#9a4dff', 2.6), side: T.BackSide, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        shell.scale.setScalar(0.62); g.add(shell);
        const cor = glowSprite('#ff7a1a', 2.6, 2.8); g.add(cor);
        const cor2 = glowSprite('#7a2dff', 2, 1.6); g.add(cor2);
        g.userData = { core, shell, cor };
        return g;
      },
      tick(p, dt) {
        const u = p.m.userData, f = 1 + Math.sin(p.age * 40) * 0.08 + Math.sin(p.age * 23) * 0.06;
        u.shell.scale.setScalar(0.62 * f); u.cor.scale.set(2.8 * f, 2.8 * f, 1); u.core.rotation.y += dt * 6;
        const n = LOW ? 1 : 3;
        for (let i = 0; i < n; i++) {
          spark(p.x + rand(-0.3, 0.3), p.y + rand(-0.3, 0.3), p.z + rand(-0.3, 0.3), -p.vx * 0.12 + rand(-1, 1), rand(0.5, 2), -p.vz * 0.12 + rand(-1, 1), 0.5, i ? '#ff8a2a' : '#8a3dff', 2.4, 0.5, -1, 1);
        }
        if (Math.random() < dt * 8) smoke(p.x, p.y, p.z, rand(-0.5, 0.5), 1, rand(-0.5, 0.5), 0.8, '#1a0a22', 0.9, -0.5);
      },
      hit(p, e) { explodeFlame(p, e); },
      end(p) { explodeFlame(p, null); },
    },
    thread: {
      build() { const g = new T.Group(); const h = new T.Mesh(new T.OctahedronGeometry(0.2, 0), basic('#eef6ff', 3.4)); g.add(h); g.add(glowSprite('#cfe8ff', 1.6, 1.3)); return g; },
      tick(p, dt) {
        p.m.rotation.y += dt * 14; p.m.rotation.x += dt * 9;
        if (p.line) setLine(p.line.m, P.x, heightAt(P.x, P.z) + P.y + 0.9, P.z, p.x, p.y, p.z);
        if (Math.random() < dt * 30) spark(p.x, p.y, p.z, 0, 0, 0, 0.3, '#cfe8ff', 2, 0.2, 0, 0);
      },
      hit(p, e) {
        API.hitEnemy(e, p.dmg, 10, 0, 0);
        rootEnemy(e, (e.d.boss ? 1.2 : 3) + (p.lv - 1) * 0.3);
        if (p.line) { p.line.e = e; p.line.t = 0.7; p.line = null; }
        burst(e.x, aimY(e), e.z, 18, '#e8f4ff', 2.6, 6, 0.5, 0.25, 0);
        ring(e.x, e.y + 0.15, e.z, 0.4, e.d.r + 2.4, 0.4, '#dfeaff', 2.4);
        sfx('web');
      },
      end(p) { if (p.line) { p.line.t = 0.3; p.line.e = null; p.line = null; } },
    },
    efire: {
      build() { const g = new T.Group(); const o = new T.Mesh(ORB_GEO, basic('#ffb04a', 3.6)); o.scale.setScalar(0.3); g.add(o); g.add(glowSprite('#ff6a1a', 2.2, 2.2)); return g; },
      tick(p, dt) {
        if (Math.random() < dt * (LOW ? 20 : 45)) spark(p.x, p.y, p.z, rand(-0.8, 0.8), rand(0.5, 2), rand(-0.8, 0.8), 0.5, Math.random() < 0.5 ? '#ff7a1a' : '#ffd36b', 2.4, 0.32, -1, 1);
      },
      hitP(p) {
        API.hurtPlayer(p.dmg, p.x - p.vx * 0.2, p.z - p.vz * 0.2);
        burst(p.x, p.y, p.z, 20, '#ff8a2a', 2.6, 7, 0.6, 0.4, 3); sfx('fire');
      },
      end(p) { burst(p.x, p.y, p.z, 12, '#ff8a2a', 2.2, 5, 0.5, 0.35, 3); },
    },
  };
  function takeMesh(kind) {
    const a = MPOOL[kind] || (MPOOL[kind] = []);
    const m = a.pop() || PK[kind].build();
    if (!m.parent) scene.add(m);
    m.visible = true; return m;
  }
  function fire(kind, o) {
    const p = PFREE.pop() || {};
    p.kind = kind; p.m = takeMesh(kind);
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx; p.vy = o.vy || 0; p.vz = o.vz;
    p.sp = o.speed; p.turn = o.turn || 0; p.tgt = o.target || null; p.life = o.life || 2; p.dmg = o.dmg || 0;
    p.enemy = !!o.enemy; p.r = o.r || 0.8; p.age = 0; p.lv = o.lv || 1; p.line = null; p.seed = Math.random() * 6; p.src = o.src || null;
    p.m.position.set(p.x, p.y, p.z);
    PROJ.push(p);
    return p;
  }
  function killProj(i) {
    const p = PROJ[i];
    p.m.visible = false; MPOOL[p.kind].push(p.m); p.m = null; p.tgt = null; p.src = null;
    PROJ[i] = PROJ[PROJ.length - 1]; PROJ.pop(); PFREE.push(p);
  }
  function updateProj(dt) {
    const en = API.enemies;
    for (let i = PROJ.length - 1; i >= 0; i--) {
      const p = PROJ[i], K = PK[p.kind];
      p.age += dt; p.life -= dt;
      let has = false, tx = 0, ty = 0, tz = 0;
      if (p.enemy) { if (p.turn && !P.dead) { has = true; tx = P.x; ty = heightAt(P.x, P.z) + P.y + 0.9; tz = P.z; } }
      else if (p.tgt && !p.tgt.dead) { has = true; tx = p.tgt.x; ty = aimY(p.tgt); tz = p.tgt.z; }
      if (has && p.turn) {
        const dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, L = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, dt * p.turn);
        p.vx += (dx / L * p.sp - p.vx) * k; p.vy += (dy / L * p.sp - p.vy) * k; p.vz += (dz / L * p.sp - p.vz) * k;
        const s = Math.hypot(p.vx, p.vy, p.vz) || 1; p.vx *= p.sp / s; p.vy *= p.sp / s; p.vz *= p.sp / s;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.m.position.set(p.x, p.y, p.z);
      K.tick(p, dt);
      const gh = heightAt(p.x, p.z);
      if (p.y < gh + 0.2) { if (p.age > 0.15 && !has) { K.end(p); killProj(i); continue; } p.y = gh + 0.2; if (p.vy < 0) p.vy = 0; }
      let done = false;
      if (p.enemy) {
        if (!P.dead && P.iframe <= 0 && API.state === 'play') {
          const dx = P.x - p.x, dz = P.z - p.z, py = heightAt(P.x, P.z) + P.y + 0.8;
          if (dx * dx + dz * dz < (p.r + 0.7) * (p.r + 0.7) && Math.abs(py - p.y) < 1.8) { K.hitP(p); done = true; }
        }
      } else {
        for (const e of en) {
          if (e.dead || e.passive) continue;
          const dx = e.x - p.x, dz = e.z - p.z, rr = e.d.r + p.r;
          if (dx * dx + dz * dz < rr * rr && Math.abs(aimY(e) - p.y) < 2 + e.d.r) { K.hit(p, e); done = true; break; }
        }
      }
      if (!done && p.life <= 0) { K.end(p); done = true; }
      if (done) killProj(i);
    }
  }
  function clearProj() { for (let i = PROJ.length - 1; i >= 0; i--) { if (PROJ[i].line) { PROJ[i].line.on = false; PROJ[i].line.m.visible = false; } killProj(i); } }
  function explodeFlame(p, direct) {
    const R = 4.5;
    for (const e of API.enemies) {
      if (e.dead || e.passive) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z) - e.d.r;
      if (d < R) { const a = Math.atan2(e.x - p.x, e.z - p.z); API.hitEnemy(e, p.dmg * (e === direct ? 1 : 0.7), 30, Math.sin(a) * 2, Math.cos(a) * 2); burnEnemy(e, 3, p.dmg * 0.06); }
    }
    const gy = heightAt(p.x, p.z);
    ring(p.x, gy + 0.25, p.z, 0.6, R + 2, 0.5, '#ff7a1a', 2.8);
    ring(p.x, p.y, p.z, 0.4, R + 1, 0.45, '#9a4dff', 3, TORG);
    burst(p.x, p.y, p.z, 40, '#ff8a2a', 2.8, 11, 0.8, 0.55, 2);
    burst(p.x, p.y, p.z, 26, '#8a3dff', 2.6, 8, 0.9, 0.5, 0);
    for (let i = 0; i < (LOW ? 5 : 12); i++) smoke(p.x + rand(-1, 1), p.y + rand(-0.5, 1), p.z + rand(-1, 1), rand(-2, 2), rand(1, 3), rand(-2, 2), rand(1, 1.6), i % 2 ? '#1a0a22' : '#2a1030', rand(1.4, 2.4), -0.6);
    API.flashLight.color.set('#ff7a1a'); API.flashLight.intensity = 80; API.flashLight.position.set(p.x, p.y + 2, p.z);
    API.setShake(0.35); sfx('explosion');
  }

  /* ================================================================ enemy status: root, stun, poison/burn */
  function rootEnemy(e, t) {
    if (e.dead) return;
    e.stagger = Math.max(e.stagger || 0, t); e.atk = null; e.vx = e.vz = 0; e._root = t;
    web(e, t);
  }
  function stunEnemy(e, t) { if (e.dead) return; e.stagger = Math.max(e.stagger || 0, t); e.atk = null; e._stun = t; }
  function poisonEnemy(e, t, dps) { if (e.dead) return; e._psn = Math.max(e._psn || 0, t); e._pdps = Math.max(e._pdps || 0, dps); e._pcol = '#7dff4a'; }
  function burnEnemy(e, t, dps) { if (e.dead) return; if ((e._psn || 0) > 0 && e._pcol === '#7dff4a') return; e._psn = Math.max(e._psn || 0, t); e._pdps = dps; e._pcol = '#ff8a2a'; }
  function quiet(e, dmg, cls) {
    if (e.dead || dmg <= 0) return;
    API.hitEnemyQuiet(e, dmg);
    dmgNum(e.x, aimY(e) + 1, e.z, dmg, cls || '');
  }
  function updateStatus(dt) {
    for (const e of API.enemies) {
      if (e.dead) { e._psn = e._root = e._stun = 0; continue; }
      if (e._psn > 0) {
        e._psn -= dt; e._pt = (e._pt || 0) - dt;
        if (e._pt <= 0) { e._pt = 0.5; quiet(e, Math.max(1, Math.round(e._pdps * 0.5))); }
        if (Math.random() < dt * (LOW ? 6 : 12)) {
          const y = aimY(e);
          spark(e.x + rand(-0.6, 0.6) * (e.d.r + 0.2), y + rand(-0.4, 0.6), e.z + rand(-0.6, 0.6) * (e.d.r + 0.2), rand(-0.3, 0.3), rand(0.8, 1.8), rand(-0.3, 0.3), 0.8, e._pcol, 2, rand(0.16, 0.3), -0.6, 0);
        }
        if (e._psn <= 0) e._pdps = 0;
      }
      if (e._root > 0) { e._root -= dt; e.atk = null; e.vx *= 0.5; e.vz *= 0.5; if (e.stagger < 0.05) e.stagger = 0.05; }
      if (e._stun > 0) {
        e._stun -= dt;
        if (Math.random() < dt * 10) { const a = clock * 6 + Math.random(); spark(e.x + Math.cos(a) * 0.6, aimY(e) + 1.1, e.z + Math.sin(a) * 0.6, 0, 0.3, 0, 0.4, '#e2c8ff', 2.6, 0.22, 0, 0); }
      }
    }
    // the player: viper poison (never lethal)
    if (P._psn > 0) {
      P._psn -= dt;
      if (!P.dead && P.hp > 1) P.hp = Math.max(1, P.hp - P._pdps * dt);
      if (Math.random() < dt * 10) spark(P.x + rand(-0.6, 0.6), heightAt(P.x, P.z) + P.y + rand(0.4, 1.6), P.z + rand(-0.6, 0.6), 0, rand(0.8, 1.6), 0, 0.8, '#7dff4a', 2, 0.22, -0.6, 0);
    }
  }

  /* ================================================================ ability registry */
  const DEFS = {
    water_blade: { name: "Lama d'Acqua", icon: '🌊', color: '#4fd8ff', cost: 12, cd: 1.1, desc: "Scaglia tre mezzelune d'acqua rotanti che inseguono i nemici." },
    black_lightning: { name: 'Fulmine Nero', icon: 'ϟ', color: '#b388ff', cost: 30, cd: 2.2, selfCost: true, desc: 'Un fulmine nero che salta tra i nemici vicini.' },
    shadow_motion: { name: "Movimento d'Ombra", icon: '🌑', color: '#8a6bff', cost: 20, cd: 4, desc: "Ti dissolvi nell'ombra e riappari alle spalle del bersaglio con un colpo devastante." },
    ultrasonic: { name: 'Onda Ultrasonica', icon: '〰️', color: '#e2c8ff', cost: 18, cd: 5, desc: 'Anelli di suono che feriscono e stordiscono i nemici attorno a te.' },
    steel_thread: { name: "Filo d'Acciaio", icon: '🕸️', color: '#cfe8ff', cost: 15, cd: 6, desc: 'Un filo lucente che immobilizza il bersaglio in una ragnatela per 3 secondi.' },
    poison_breath: { name: 'Respiro Velenoso', icon: '☠️', color: '#7dff4a', cost: 20, cd: 5, desc: 'Un getto di veleno a cono che corrode i nemici nel tempo.' },
    black_flame: { name: 'Fiamma Nera', icon: '🔥', color: '#ff7a1a', cost: 25, cd: 3, desc: 'Una sfera di fiamma nera dalla corona arancione che esplode al contatto.' },
    gluttony: { name: 'Fame Insaziabile', icon: '🌀', color: '#c04dff', cost: 40, cd: 14, desc: 'Un vortice divoratore che attira i nemici entro 12 m e divora quelli indeboliti.' },
    storm: { name: 'Tempesta Nera', icon: '🌩️', color: '#7c6bff', cost: 45, cd: 18, desc: 'Per 4 secondi fulmini neri piovono sui nemici attorno a te.' },
    body_armor: { name: "Corazza d'Acciaio", icon: '🛡️', color: '#a8b8cc', passive: true, cost: 0, cd: 0, desc: 'Passiva: riduce del 30% i danni subiti.' },
    sword_arts: { name: 'Arte della Spada', icon: '⚔️', color: '#ffd36b', passive: true, cost: 0, cd: 0, desc: 'Passiva: +20% danni in mischia.' },
  };
  const ORDER = ['water_blade', 'black_lightning', 'shadow_motion', 'ultrasonic', 'steel_thread', 'poison_breath', 'black_flame', 'gluttony', 'storm', 'body_armor', 'sword_arts'];
  for (const id of ORDER) DEFS[id].id = id;
  // which monster grants which ability (bosses on any kill, others when devoured)
  const SRC = { wolf: 'shadow_motion', bat: 'ultrasonic', spider: 'steel_thread', viper: 'poison_breath', flame: 'black_flame', knight: 'body_armor',
    soldier: 'sword_arts', tyrant: 'gluttony', dragon: 'storm', serpent: 'black_lightning' };
  const MAXLV = 5;
  const CD = {};
  const lv = (id) => (S.abil && S.abil[id]) || 0;
  const mul = (l) => 1 + 0.25 * (l - 1);
  let owned = [], passives = [];
  function refreshOwned() {
    owned = ORDER.filter((id) => lv(id) > 0 && !DEFS[id].passive);
    passives = ORDER.filter((id) => lv(id) > 0 && DEFS[id].passive);
    if (!S.abilSel || !lv(S.abilSel) || DEFS[S.abilSel].passive) S.abilSel = owned[0] || 'water_blade';
  }
  function grant(id, silent) {
    const d = DEFS[id]; if (!d) return;
    const cur = lv(id);
    if (cur >= MAXLV) return;
    S.abil[id] = cur + 1;
    if (!cur && !d.passive && !silent) S.abilSel = id;
    refreshOwned(); API.saveS();
    if (silent) return;
    if (!cur) { oracle('《Analisi completata. Abilità unica acquisita: ' + d.name + '》', true); sfx('skillGet'); pillar(); }
    else { oracle('《Abilità rafforzata: ' + d.name + ' Lv ' + (cur + 1) + '》', true); sfx('levelup'); ring(P.x, heightAt(P.x, P.z) + 0.2, P.z, 0.5, 5, 0.7, '#ffd36b', 2.6); burst(P.x, heightAt(P.x, P.z) + 1, P.z, 24, '#ffd36b', 2.4, 6, 0.9, 0.3, -2); }
  }

  /* ================================================================ casting */
  let castT = 0;
  const CAST_DUR = 0.45;
  function target(range) {
    const L = API.input && API.input.lock;
    if (L && !L.dead && Math.hypot(L.x - P.x, L.z - P.z) < range + L.d.r) return L;
    let best = null, bs = 1e9;
    for (const e of API.enemies) {
      if (e.dead || e.passive) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r;
      if (d > range) continue;
      const s = d + Math.abs(angDiff(P.rot, Math.atan2(e.x - P.x, e.z - P.z))) * 6;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  const face = (e) => { if (e) P.rot = Math.atan2(e.x - P.x, e.z - P.z); };
  const mouthY = () => heightAt(P.x, P.z) + P.y + (P.form === 'dragon' ? 2.6 : P.form === 'human' ? 1.5 : P.form === 'wolf' ? 1.4 : 1.0);
  // ongoing ability states
  const SM = { t: 0, e: null, dmg: 0 };
  const US = { on: false, t: 0, n: 0, id: 0, lv: 1, waves: [{ x: 0, z: 0, age: -1 }, { x: 0, z: 0, age: -1 }, { x: 0, z: 0, age: -1 }] };
  const BR = { t: 0, tick: 0, lv: 1, kind: 'poison', snd: 0 };
  const GL = { t: 0, lv: 1, tick: 0 };
  const ST = { t: 0, lv: 1, tick: 0, dark: 0 };
  const CAST = {
    water_blade(l) {
      const tgt = target(30); face(tgt);
      const y = mouthY() + 0.1;
      for (let i = 0; i < 3; i++) {
        const a = P.rot + (i - 1) * 0.5;
        fire('water', { x: P.x + Math.sin(a) * 0.9, y, z: P.z + Math.cos(a) * 0.9, vx: Math.sin(a) * 16, vy: 2.5 - Math.abs(i - 1) * 1.5, vz: Math.cos(a) * 16,
          speed: 20, turn: tgt ? 4.5 + i * 0.4 : 0, target: tgt, life: 1.5, dmg: 40 * P.dmg * mul(l), r: 0.9, lv: l });
      }
      burst(P.x + Math.sin(P.rot), y, P.z + Math.cos(P.rot), 18, '#7fe6ff', 2.2, 6, 0.5, 0.3, 6);
      sfx('water'); return true;
    },
    black_lightning(l) {
      const fp = P.fp;
      API.castLightning();
      if (P.fp === fp) return false;
      let k = l - 1;
      if (k > 0) for (const e of API.enemies) {
        if (k <= 0) break;
        if (e.dead || e.passive || Math.hypot(e.x - P.x, e.z - P.z) > 18) continue;
        API.bolt(e.x + rand(-2, 2), aimY(e) + 22, e.z + rand(-2, 2), e.x, aimY(e), e.z, '#7c4dff');
        API.hitEnemy(e, 45 * P.dmg * (l - 1), 15, 0, 0); k--;
      }
      return true;
    },
    shadow_motion(l) {
      const e = target(20);
      if (!e) { toast('Nessun bersaglio'); return false; }
      const gy0 = heightAt(P.x, P.z);
      shadowPuff(P.x, gy0, P.z);
      const back = e.rot + Math.PI, dd = e.d.r + 1.4;
      P.x = e.x + Math.sin(back) * dd; P.z = e.z + Math.cos(back) * dd; P.vx = P.vz = 0;
      face(e); P.iframe = Math.max(P.iframe, 0.4);
      shadowPuff(P.x, heightAt(P.x, P.z), P.z);
      SM.t = 0.14; SM.e = e; SM.dmg = 115 * P.dmg * mul(l);
      sfx('dash'); return true;
    },
    ultrasonic(l) {
      US.on = true; US.t = 0; US.n = 0; US.id++; US.lv = l;
      for (const w of US.waves) w.age = -1;
      sfx('sonic'); API.setShake(0.15); return true;
    },
    steel_thread(l) {
      const e = target(26);
      if (!e) { toast('Nessun bersaglio'); return false; }
      face(e);
      const y = mouthY();
      const p = fire('thread', { x: P.x + Math.sin(P.rot) * 0.8, y, z: P.z + Math.cos(P.rot) * 0.8, vx: Math.sin(P.rot) * 40, vy: 0, vz: Math.cos(P.rot) * 40,
        speed: 44, turn: 14, target: e, life: 1, dmg: 22 * P.dmg * mul(l), r: 0.7, lv: l });
      p.line = takeLine('#e8f4ff', 3.2);
      sfx('web'); return true;
    },
    poison_breath(l) {
      BR.t = 1.4; BR.tick = 0; BR.lv = l; BR.kind = 'poison'; BR.snd = 0;
      sfx('poison'); return true;
    },
    black_flame(l) {
      const tgt = target(30); face(tgt);
      const y = mouthY() + 0.3;
      fire('flame', { x: P.x + Math.sin(P.rot) * 1.1, y, z: P.z + Math.cos(P.rot) * 1.1, vx: Math.sin(P.rot) * 16, vy: 1, vz: Math.cos(P.rot) * 16,
        speed: 17, turn: tgt ? 3.5 : 0, target: tgt, life: 1.8, dmg: 105 * P.dmg * mul(l), r: 1, lv: l });
      burst(P.x, y, P.z, 16, '#ff7a1a', 2.4, 5, 0.5, 0.35, -1);
      sfx('fire'); return true;
    },
    gluttony(l) {
      GL.t = 2.8; GL.lv = l; GL.tick = 0;
      VX.a.visible = VX.b.visible = true;
      sfx('gluttony'); API.setShake(0.4); return true;
    },
    storm(l) {
      ST.t = 4; ST.lv = l; ST.tick = 0;
      DOME.visible = true;
      sfx('thunder'); API.setShake(0.5); return true;
    },
  };
  function cast() {
    refreshOwned();
    const id = S.abilSel, d = DEFS[id];
    if (!d || !lv(id) || d.passive) { toast('Nessuna abilità attiva'); return; }
    if (CD[id] > 0) { toast(d.name + ': in ricarica'); sfx('uiBack'); return; }
    if (P.fp < d.cost) { toast('FP insufficienti'); sfx('uiBack'); return; }
    const ok = CAST[id](lv(id));
    if (ok === false) return;
    if (!d.selfCost) P.fp -= d.cost;
    CD[id] = d.cd; castT = CAST_DUR;
    magicCircle(d.color);
    const gy = heightAt(P.x, P.z);
    ring(P.x, gy + 0.2, P.z, 0.6, 3.6, 0.45, d.color, 2.2);
    for (let i = 0; i < (LOW ? 6 : 14); i++) { const a = rand(0, TAU); spark(P.x + Math.cos(a) * 2.4, gy + 0.2, P.z + Math.sin(a) * 2.4, 0, rand(3, 6), 0, 0.6, d.color, 2.4, 0.28, 0, 0); }
  }
  API.castSkill = cast;

  function shadowPuff(x, gy, z) {
    for (let i = 0; i < (LOW ? 8 : 18); i++) smoke(x + rand(-0.8, 0.8), gy + rand(0.2, 1.8), z + rand(-0.8, 0.8), rand(-2, 2), rand(0.5, 2.5), rand(-2, 2), rand(0.7, 1.2), i % 3 ? '#120a1e' : '#2a1a40', rand(1.2, 2.2), -0.4);
    burst(x, gy + 1, z, 16, '#8a6bff', 2.2, 5, 0.6, 0.3, 0);
    ring(x, gy + 0.2, z, 0.4, 3, 0.4, '#6a4dff', 2);
  }
  function updateAbilities(dt, gy) {
    for (const id in CD) if (CD[id] > 0) CD[id] = Math.max(0, CD[id] - dt);
    // Movimento d'Ombra: delayed heavy strike after the blink
    if (SM.t > 0) {
      SM.t -= dt;
      if (SM.t <= 0 && SM.e && !SM.e.dead) {
        const e = SM.e, a = Math.atan2(e.x - P.x, e.z - P.z);
        face(e);
        API.hitEnemy(e, SM.dmg, 70, Math.sin(a) * 1.5, Math.cos(a) * 1.5);
        stunEnemy(e, e.d.boss ? 0.3 : 0.8);
        ring(e.x, aimY(e), e.z, 0.5, 4.5, 0.35, '#8a6bff', 3, TORG);
        burst(e.x, aimY(e), e.z, 34, '#8a6bff', 2.8, 10, 0.6, 0.4, 2);
        for (let i = 0; i < 10; i++) { const k = i / 9 - 0.5; spark(e.x + Math.cos(P.rot) * k * 3, aimY(e) + k * 1.5, e.z - Math.sin(P.rot) * k * 3, 0, 0, 0, 0.3, '#d8c8ff', 3.4, 0.5, 0, 0); }
        API.setHitstop(0.09); API.setShake(0.4); sfx('slash');
        SM.e = null;
      }
    }
    // Onda Ultrasonica: three expanding sound rings
    if (US.on) {
      US.t += dt;
      while (US.n < 3 && US.t >= US.n * 0.16) {
        const w = US.waves[US.n]; w.x = P.x; w.z = P.z; w.age = 0;
        ring(P.x, gy + 1.0, P.z, 0.8, 11.5, 0.62, '#e2c8ff', 2.2, TORG);
        ring(P.x, gy + 0.2, P.z, 0.8, 11, 0.62, '#b08cff', 0.8);
        US.n++;
      }
      let live = false;
      for (let k = 0; k < 3; k++) {
        const w = US.waves[k];
        if (w.age < 0) continue;
        w.age += dt;
        if (w.age > 0.62) { w.age = -1; continue; }
        live = true;
        const p = w.age / 0.62, r = 0.8 + 10.7 * (1 - (1 - p) * (1 - p)), stamp = US.id * 4 + k;
        for (const e of API.enemies) {
          if (e.dead || e.passive || e._us === stamp) continue;
          const d = Math.hypot(e.x - w.x, e.z - w.z) - e.d.r;
          if (d < r) {
            e._us = stamp;
            API.hitEnemy(e, 20 * P.dmg * mul(US.lv), 18, 0, 0);
            if (k === 0) stunEnemy(e, e.d.boss ? 0.5 : 1.6 + 0.2 * (US.lv - 1));
            ring(e.x, aimY(e) + 0.4, e.z, 0.3, 1.6, 0.3, '#e2c8ff', 2.4, TORG);
          }
        }
      }
      if (!live && US.n >= 3) US.on = false;
    }
    // breath cones: Respiro Velenoso (ability) and dragon fire breath (dragon form heavy)
    if (BR.t > 0) {
      BR.t -= dt; BR.tick -= dt; BR.snd -= dt;
      const isFire = BR.kind === 'fire';
      if (isFire && P.form !== 'dragon') BR.t = 0;
      let mx, my, mz;
      if (isFire && DF) { DF.head.updateMatrixWorld(true); V2.set(0, -0.1, 1.0); DF.head.localToWorld(V2); mx = V2.x; my = V2.y; mz = V2.z; }
      else { mx = P.x + Math.sin(P.rot) * 0.9; my = mouthY(); mz = P.z + Math.cos(P.rot) * 0.9; }
      const n = LOW ? 3 : 7, sp = isFire ? 20 : 13;
      const op = Math.min(1, (isFire ? 1.2 : 1.4) - BR.t) * 4, len = isFire ? 12 : 9.5;
      BCONE.visible = true; BCONE.position.set(mx, my, mz); BCONE.rotation.set(0, P.rot, 0);
      BCONE.scale.set(len * 0.36, len * 0.3, len * Math.min(1, op + 0.3));
      BCONE.material.opacity = Math.min(1, op, BR.t * 3) * 0.75;
      BCONE.material.color.copy(col(isFire ? '#ff7a1a' : '#5dff3a')).multiplyScalar(isFire ? 1.8 : 1.3);
      STREAK_TEX.offset.y -= dt * 2.6; STREAK_TEX.offset.x += dt * 0.3;
      for (let i = 0; i < n; i++) {
        const a = P.rot + rand(-0.32, 0.32), s = sp * rand(0.65, 1.1);
        const h = isFire ? (Math.random() < 0.3 ? '#fff0b0' : Math.random() < 0.6 ? '#ff9a2a' : '#ff5a1a') : (Math.random() < 0.3 ? '#d8ff6a' : '#5dff3a');
        spark(mx, my, mz, Math.sin(a) * s, rand(-1.5, 1.5) + (isFire ? -1 : 0.6), Math.cos(a) * s, rand(0.45, 0.7), h, isFire ? 2.6 : 2.4, rand(0.8, 1.6) * (isFire ? 1.4 : 1), isFire ? -1 : 2, 1.2);
      }
      if (Math.random() < dt * (isFire ? 10 : 22)) { const d = rand(2, 7), a = P.rot + rand(-0.3, 0.3); smoke(mx + Math.sin(a) * d, my - rand(0, 0.6), mz + Math.cos(a) * d, Math.sin(a) * 3, rand(0, 0.8), Math.cos(a) * 3, rand(0.9, 1.5), isFire ? '#2a1a14' : (Math.random() < 0.5 ? '#3f7a24' : '#2c5a1a'), rand(1.4, 2.4), -0.3); }
      if (BR.snd <= 0) { BR.snd = 0.45; sfx(isFire ? 'fire' : 'poison'); }
      if (BR.tick <= 0) {
        BR.tick = isFire ? 0.15 : 0.2;
        const range = isFire ? 12 : 10, arc = isFire ? 0.5 : 0.45;
        for (const e of API.enemies) {
          if (e.dead || e.passive) continue;
          const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r;
          if (d > range) continue;
          if (Math.abs(angDiff(P.rot, Math.atan2(e.x - P.x, e.z - P.z))) > arc + Math.min(0.6, e.d.r / Math.max(1, d + e.d.r))) continue;
          if (isFire) { quiet(e, Math.round(22 * P.dmg), 'crit'); burnEnemy(e, 3, 10 * P.dmg); e.flash = 0.1; }
          else { poisonEnemy(e, 6, 14 * P.dmg * mul(BR.lv)); quiet(e, Math.round(4 * P.dmg * mul(BR.lv))); }
        }
        if (isFire) { API.flashLight.color.set('#ff8a2a'); API.flashLight.intensity = 45; API.flashLight.position.set(mx + Math.sin(P.rot) * 4, my, mz + Math.cos(P.rot) * 4); API.setShake(0.12); }
      }
    }
    if (BR.t <= 0 && BCONE.visible) BCONE.visible = false;
    // Fame Insaziabile: devouring vortex
    if (GL.t > 0) {
      GL.t -= dt; GL.tick -= dt;
      const p = 1 - GL.t / 2.8, op = Math.min(1, p * 6) * Math.min(1, GL.t * 2.5);
      VX.a.position.set(P.x, gy + 0.35, P.z); VX.b.position.set(P.x, gy + 0.4, P.z);
      VX.a.scale.setScalar(12 * (0.3 + 0.7 * Math.min(1, p * 4))); VX.b.scale.setScalar(4.5 + Math.sin(clock * 8) * 0.3);
      VX.a.rotation.y += dt * 7; VX.b.rotation.y -= dt * 4;
      VX.a.material.opacity = op * 0.95; VX.b.material.opacity = op;
      for (let i = 0; i < (LOW ? 3 : 7); i++) {
        const a = rand(0, TAU), r = rand(6, 12), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        const ta = a + 1.2, sp = r * 1.6;
        spark(x, gy + rand(0.3, 2.5), z, -Math.cos(a) * sp + Math.cos(ta) * 4, rand(-0.5, 0.5), -Math.sin(a) * sp + Math.sin(ta) * 4, 0.6, Math.random() < 0.5 ? '#c04dff' : '#ff4dd2', 2.4, 0.35, 0, 0);
      }
      API.setShake(0.12);
      const healK = 0.08;
      for (const e of API.enemies) {
        if (e.dead || e.passive || e.d.boss) continue;
        const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
        if (d > 12 + e.d.r) continue;
        const pull = (14 - d) * 2.2;
        e.vx += (dx / (d || 1)) * pull * dt * 2.5; e.vz += (dz / (d || 1)) * pull * dt * 2.5;
        e.engaged = true; e.atk = null;
        if (GL.tick <= 0) quiet(e, Math.round(18 * P.dmg * mul(GL.lv)));
        if (!e.dead && d < 4 + e.d.r && e.hp < e.maxHp * (0.45 + 0.05 * (GL.lv - 1))) {
          API.killEnemy(e, true); S.essences = (S.essences || 0) + 1; API.recalc(false);
          P.hp = Math.min(P.maxHp, P.hp + P.maxHp * healK); sfx('absorb');
          dmgNum(P.x, gy + 2.4, P.z, '+' + Math.round(P.maxHp * healK), 'heal');
          burst(P.x, gy + 1, P.z, 14, '#ff4dd2', 2.4, 4, 0.6, 0.3, -1);
        }
      }
      if (GL.tick <= 0) GL.tick = 0.4;
      if (GL.t <= 0) VX.a.visible = VX.b.visible = false;
    }
    // Tempesta Nera: black lightning rain + darkened sky
    if (ST.t > 0 || ST.dark > 0) {
      if (ST.t > 0) {
        ST.t -= dt; ST.tick -= dt; ST.dark = Math.min(1, ST.dark + dt * 3);
        if (ST.tick <= 0) {
          ST.tick = LOW ? 0.22 : 0.15;
          let tgt = null, tries = 0;
          const list = API.enemies;
          while (!tgt && tries++ < 6 && list.length) { const e = list[(Math.random() * list.length) | 0]; if (!e.dead && !e.passive && Math.hypot(e.x - P.x, e.z - P.z) < 24) tgt = e; }
          if (!tgt) for (const e of list) if (!e.dead && !e.passive && Math.hypot(e.x - P.x, e.z - P.z) < 24) { tgt = e; break; }
          let x, z;
          if (tgt) { x = tgt.x; z = tgt.z; } else { const a = rand(0, TAU), r = rand(5, 20); x = P.x + Math.cos(a) * r; z = P.z + Math.sin(a) * r; }
          const y = tgt ? aimY(tgt) : heightAt(x, z);
          API.bolt(x + rand(-4, 4), y + 30, z + rand(-4, 4), x, y, z, '#6a3dff');
          ring(x, heightAt(x, z) + 0.2, z, 0.4, 3.5, 0.35, '#8a6bff', 2.6);
          burst(x, y, z, 12, '#9a7bff', 2.6, 8, 0.5, 0.3, 4);
          if (tgt) API.hitEnemy(tgt, 62 * P.dmg * mul(ST.lv) * (tgt.d.boss ? 0.6 : 1), 20, 0, 0);
          if (Math.random() < 0.45) sfx('thunder');
          API.setShake(0.2);
        }
      } else ST.dark = Math.max(0, ST.dark - dt * 1.2);
      DOME.position.copy(API.camera.position);
      const flick = Math.random() < 0.08 ? 0.35 : 0;
      DOME.material.opacity = ST.dark * (0.78 - flick);
      DOME.visible = ST.dark > 0.001;
      FOGK.k = 1 - 0.7 * ST.dark + flick * 0.8;
      VIG.style.opacity = (ST.dark * (flick ? 0.4 : 1)).toFixed(3);
      if (Math.random() < dt * 20 * ST.dark) smoke(P.x + rand(-14, 14), gy + rand(4, 9), P.z + rand(-14, 14), rand(-1, 1), 0, rand(-1, 1), 2, '#0a0612', 4, 0);
    }
  }

  /* ================================================================ new monsters */
  const BAT_WING = (() => {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.16, 0.95, 0.18, 0.08, 1.35, 0, -0.3, 0, 0, 0.16, 1.35, 0, -0.3, 0.85, -0.04, -0.42,
      0, 0, 0.16, 0.85, -0.04, -0.42, 0.42, 0, -0.32, 0, 0, 0.16, 0.42, 0, -0.32, 0, 0, -0.22], 3));
    g.computeVertexNormals(); return g;
  })();
  function seg(parent, x0, y0, x1, y1, r, mat) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    return mesh(parent, cap(r, L), mat, (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(-dx, dy));
  }
  function batModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const fur = std('#2b2034', 0.9), mem = std('#53305e', 0.75, 0, { side: T.DoubleSide }), eye = basic('#ff2f5a', 4.5), white = std('#f2eadf', 0.4);
    mesh(g, sph(0.3, 10, 8), fur, 0, 0, 0, 0, 0, 0, 1, 1.05, 1.3);
    mesh(g, sph(0.18, 8, 6), std('#4a3456', 0.9), 0, -0.1, 0.05, 0, 0, 0, 1, 0.8, 1.2);
    const head = pivot(g, 0, 0.16, 0.34);
    mesh(head, sph(0.21, 10, 8), fur, 0, 0, 0, 0, 0, 0, 1, 0.92, 1);
    for (const sx of [-1, 1]) {
      mesh(head, coneG(0.08, 0.32, 4), fur, sx * 0.12, 0.24, -0.03, -0.2, 0, sx * -0.35);
      mesh(head, sph(0.045, 6, 5), eye, sx * 0.085, 0.04, 0.17);
      mesh(head, coneG(0.022, 0.09, 4), white, sx * 0.05, -0.12, 0.15, Math.PI, 0, 0);
    }
    mesh(head, sph(0.06, 6, 5), std('#1a1220', 0.5), 0, -0.02, 0.2);
    const wingL = pivot(g, -0.2, 0.08, 0), wingR = pivot(g, 0.2, 0.08, 0);
    for (const [W, sx] of [[wingL, -1], [wingR, 1]]) {
      const m = mesh(W, BAT_WING, mem, 0, 0, 0); m.scale.x = sx;
      mesh(W, cap(0.025, 0.95), fur, sx * 0.5, 0.1, 0.1, 0, 0, sx * (Math.PI / 2 - 0.18));
      mesh(W, coneG(0.03, 0.14, 4), white, sx * 0.97, 0.22, 0.08, 0, 0, -sx * 0.6);
    }
    for (const sx of [-1, 1]) mesh(g, cap(0.03, 0.18), fur, sx * 0.1, -0.32, -0.2, 0.5, 0, 0);
    g.position.y = 2.4;
    return { root, g, head, wl: wingL, wr: wingR, s: 1, hy: 2.4, animate: batAnimate };
  }
  function batAnimate(e, dt, anim, wind, act) {
    const m = e.model, t = e.t;
    const base = e.stagger > 0 ? 1.0 : 2.3 + Math.sin(t * 2.3 + e.wander) * 0.35;
    let y = base;
    if (e.atk) y = act > 0 ? base - Math.sin(Math.min(1, act) * Math.PI) * 1.75 : base + wind * 0.7;
    m.hy = lerp(m.hy, y, Math.min(1, dt * 9));
    m.g.position.y = m.hy;
    const fs = e.atk ? (act > 0 ? 8 : 26) : e.stagger > 0 ? 30 : 15, fl = Math.sin(t * fs) * (e.atk && act > 0 ? 0.25 : 0.95);
    m.wl.rotation.z = fl; m.wr.rotation.z = -fl;
    m.wl.rotation.y = e.atk && act > 0 ? -0.7 : 0; m.wr.rotation.y = -m.wl.rotation.y;
    m.g.rotation.x = e.atk ? (act > 0 ? 0.6 : -0.35 * wind) : 0.08;
    m.g.rotation.z = Math.sin(t * 1.7 + e.wander) * 0.18;
    if (e.atk && act > 0 && Math.random() < dt * 30) spark(e.x, e.y + m.hy, e.z, 0, 0, 0, 0.35, '#b04dff', 2, 0.25, 0, 0);
  }
  function spiderModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const steel = std('#6d7788', 0.28, 0.9), dark = std('#2a2f3a', 0.45, 0.7), eye = basic('#46e0ff', 4.2), glow = basic('#46e0ff', 2), fang = std('#d8dde6', 0.2, 0.9);
    const body = pivot(g, 0, 0.78, 0);
    mesh(body, sph(0.4, 10, 8), steel, 0, 0, 0.22, 0, 0, 0, 1, 0.78, 1.1);
    const abd = pivot(body, 0, 0.1, -0.3);
    mesh(abd, sph(0.6, 12, 10), dark, 0, 0.12, -0.42, 0, 0, 0, 1, 0.82, 1.22);
    for (let i = 0; i < 3; i++) mesh(abd, BOX, glow, 0, 0.6 - i * 0.07, -0.18 - i * 0.3, 0.35 + i * 0.25, 0, 0, 0.42 - i * 0.08, 0.025, 0.06);
    for (let i = 0; i < 4; i++) mesh(abd, coneG(0.06, 0.26, 4), steel, (i % 2 ? 1 : -1) * 0.22, 0.55, -0.15 - i * 0.22, -0.3, 0, (i % 2 ? -1 : 1) * 0.3);
    const eyes = [[0, 0.2, 0.6, 0.075], [-0.1, 0.17, 0.58, 0.06], [0.1, 0.17, 0.58, 0.06], [-0.17, 0.1, 0.54, 0.045], [0.17, 0.1, 0.54, 0.045], [-0.06, 0.28, 0.54, 0.04], [0.06, 0.28, 0.54, 0.04], [0, 0.1, 0.62, 0.04]];
    for (const [x, y, z, r] of eyes) mesh(body, sph(r, 6, 5), eye, x, y, z);
    const fangs = [];
    for (const sx of [-1, 1]) { const f = pivot(body, sx * 0.1, -0.12, 0.55); mesh(f, coneG(0.05, 0.28, 4), fang, 0, -0.12, 0.02, Math.PI - 0.2, 0, 0); fangs.push(f); }
    const legs = [], ZS = [0.4, 0.2, 0.0, -0.2], FAN = [0.6, 0.2, -0.2, -0.6];
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const hip = pivot(body, sx * 0.28, 0, ZS[k]);
      const base = sx > 0 ? -FAN[k] : Math.PI + FAN[k];
      hip.rotation.y = base;
      const up = pivot(hip, 0, 0, 0);
      seg(up, 0, 0, 0.72, 0.5, 0.065, steel);
      mesh(up, sph(0.08, 6, 5), dark, 0.72, 0.5, 0);
      const knee = pivot(up, 0.72, 0.5, 0);
      seg(knee, 0, 0, 0.42, -1.22, 0.045, dark);
      mesh(knee, coneG(0.045, 0.16, 4), glow, 0.43, -1.25, 0, Math.PI, 0, 0);
      legs.push({ hip, up, knee, base, ph: (k + (sx > 0 ? 1 : 0)) % 2 });
    }
    return { root, g, body, abd, fangs, sl: legs, legs: [], tail: new T.Object3D(), s: 1, animate: spiderAnimate };
  }
  function spiderAnimate(e, dt, anim, wind, act) {
    const m = e.model, t = e.t, walk = anim === 'walk' || (e.atk && act > 0 && act < 1);
    const ph = t * (e.atk ? 20 : 13);
    for (let i = 0; i < 8; i++) {
      const L = m.sl[i], o = L.ph * Math.PI;
      L.hip.rotation.y = L.base + (walk ? Math.sin(ph + o) * 0.3 : Math.sin(t * 1.5 + i) * 0.03);
      L.up.rotation.z = walk ? Math.max(0, Math.cos(ph + o)) * 0.4 : 0;
      L.knee.rotation.z = e._root > 0 ? 0.5 : 0;
    }
    if (e.atk && act === 0) { m.sl[0].up.rotation.z = m.sl[4].up.rotation.z = 1.0 * wind; m.sl[1].up.rotation.z = m.sl[5].up.rotation.z = 0.5 * wind; }
    m.body.position.y = 0.78 + (walk ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(t * 2 + e.wander) * 0.02) - (e._root > 0 ? 0.25 : 0);
    m.body.rotation.x = e.atk ? (act > 0 ? 0.2 : -0.5 * wind) : 0;
    m.abd.rotation.x = Math.sin(t * 3) * 0.07;
    const fo = e.atk ? (act > 0 ? -0.1 : 0.5 * wind) : Math.sin(t * 6) * 0.08;
    m.fangs[0].rotation.y = fo; m.fangs[1].rotation.y = -fo;
  }
  // segmented bodies (viper + serpent): each segment follows the one before it along the path
  function updateChain(e, m, dt, swing) {
    const n = m.segs.length, s = Math.sin(e.rot), c = Math.cos(e.rot);
    if (!e._cx) {
      e._cx = new Float32Array(n); e._cz = new Float32Array(n);
      for (let i = 0; i < n; i++) { e._cx[i] = e.x - s * (m.neck + (i + 1) * m.sp); e._cz[i] = e.z - c * (m.neck + (i + 1) * m.sp); }
    }
    const hx = m.g.position.x, hz = m.g.position.z - m.neck;
    let px = e.x + hx * c + hz * s, pz = e.z - hx * s + hz * c;
    const cx = e._cx, cz = e._cz;
    for (let i = 0; i < n; i++) {
      const dx = cx[i] - px, dz = cz[i] - pz, d = Math.hypot(dx, dz);
      if (d > 0.0001) { const k = m.sp / d; cx[i] = px + dx * k; cz[i] = pz + dz * k; }
      px = cx[i]; pz = cz[i];
    }
    const hy = m.g.position.y, px2 = -c, pz2 = s; // perpendicular (right side)
    let qx = e.x, qz = e.z;
    for (let i = 0; i < n; i++) {
      let wx = cx[i], wz = cz[i];
      if (swing) { const k = Math.max(0, (i - n * 0.3) / (n * 0.7)); wx += px2 * swing * k * k * 5; wz += pz2 * swing * k * k * 5; }
      const r = m.rad[i], lift = i < m.liftN ? (hy - r) * Math.pow(1 - (i + 1) / (m.liftN + 1), 1.3) : 0;
      const wy = heightAt(wx, wz) + r * 0.75 + lift;
      const dx = wx - e.x, dz = wz - e.z, sg = m.segs[i];
      sg.position.set(dx * c - dz * s, wy - e.y, dx * s + dz * c);
      sg.rotation.y = Math.atan2(qx - wx, qz - wz) - e.rot;
      qx = wx; qz = wz;
    }
  }
  function viperModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const sk = std('#3d5a2a', 0.5, 0.1), belly = std('#c2b874', 0.7), band = std('#1f2c18', 0.55), eye = basic('#d8ff3a', 4.5), glow = basic('#7dff4a', 2.4);
    g.position.y = 0.42;
    const head = pivot(g, 0, 0, 0);
    mesh(head, sph(0.3, 10, 8), sk, 0, 0, 0.1, 0, 0, 0, 0.95, 0.58, 1.4);
    mesh(head, coneG(0.06, 0.18, 4), sk, 0, 0.12, -0.1, -0.6, 0, 0);
    for (const sx of [-1, 1]) {
      mesh(head, sph(0.055, 6, 5), eye, sx * 0.16, 0.09, 0.26);
      mesh(head, coneG(0.028, 0.16, 4), std('#f4efe0', 0.3), sx * 0.08, -0.12, 0.4, Math.PI, 0, 0);
    }
    const jaw = pivot(head, 0, -0.07, 0.0);
    mesh(jaw, sph(0.2, 8, 6), belly, 0, -0.03, 0.22, 0, 0, 0, 0.9, 0.35, 1.4);
    const tongue = pivot(head, 0, -0.06, 0.45);
    mesh(tongue, BOX, basic('#ff3b5c', 1.6), 0, 0, 0.12, 0, 0, 0, 0.025, 0.012, 0.26);
    const segs = [], rad = [], n = LOW ? 8 : 11;
    for (let i = 0; i < n; i++) {
      const r = 0.27 * (1 - (i / n) * 0.72);
      const s = mesh(root, sph(1, 8, 6), i % 3 === 1 ? band : sk, 0, 0, 0, 0, 0, 0, r, r * 0.78, r * 1.45);
      if (i % 3 === 1) mesh(s, sph(0.22, 6, 4), glow, 0, 0.78, 0);
      if (i === n - 1) mesh(s, coneG(0.5, 1.6, 5), sk, 0, 0, -1.2, -Math.PI / 2, 0, 0);
      segs.push(s); rad.push(r);
    }
    return { root, g, head, jaw, tongue, segs, rad, sp: 0.38, neck: 0.25, liftN: 0, s: 1, wig: 0, animate: viperAnimate };
  }
  function viperAnimate(e, dt, anim, wind, act) {
    const m = e.model, t = e.t;
    m.wig = lerp(m.wig, anim === 'walk' ? 1 : 0.25, Math.min(1, dt * 4));
    let hy = 0.42, hz = 0, rx = 0, jaw = 0.05;
    if (e.atk) {
      if (act > 0) { hz = Math.sin(Math.min(1, act) * Math.PI) * 0.6; rx = 0.35; jaw = 0.7 * (1 - act); }
      else { hy += wind * 0.55; hz = -wind * 0.45; rx = -0.6 * wind; jaw = 0.75 * wind; }
      if (!e.atk.pz && e.atk.hit && e.atk.def.poison && P.hitFlash > 0.18 && Math.hypot(P.x - e.x, P.z - e.z) < 4) { e.atk.pz = true; P._psn = 4; P._pdps = 7; toast('Sei avvelenato!'); }
    }
    m.g.position.set(Math.sin(t * 7 + e.wander) * 0.3 * m.wig, hy + Math.sin(t * 2) * 0.03, hz);
    m.g.rotation.y = Math.cos(t * 7 + e.wander) * 0.35 * m.wig;
    m.g.rotation.x = rx; m.jaw.rotation.x = jaw;
    const fl = (t * 1.3 + e.wander) % 2;
    m.tongue.scale.z = fl < 0.25 ? Math.sin(fl / 0.25 * Math.PI) : 0.01;
    m.tongue.rotation.y = Math.sin(t * 30) * 0.2;
    updateChain(e, m, dt, 0);
  }
  function serpentModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const sc = std('#1b1d2a', 0.35, 0.55), belly = std('#3b3550', 0.6, 0.2), horn = std('#d9d2e6', 0.35, 0.3), eye = basic('#8ec5ff', 5), rune = basic('#7c8cff', 2.6), glow = basic('#b388ff', 2);
    g.position.y = 2.6;
    const hd = pivot(g, 0, 0, 0);
    mesh(hd, sph(0.95, 12, 10), sc, 0, 0, 0.2, 0, 0, 0, 1, 0.72, 1.35);
    mesh(hd, sph(0.55, 10, 8), sc, 0, -0.08, 1.15, 0, 0, 0, 0.95, 0.6, 1.1);
    for (const sx of [-1, 1]) {
      mesh(hd, coneG(0.16, 1.5, 5), horn, sx * 0.5, 0.55, -0.55, -2.2, 0, sx * 0.35);
      mesh(hd, coneG(0.1, 0.8, 4), horn, sx * 0.7, 0.2, -0.3, -1.9, 0, sx * 0.9);
      mesh(hd, sph(0.13, 8, 6), eye, sx * 0.45, 0.22, 0.85, 0, 0, 0, 1.3, 0.7, 1);
      mesh(hd, coneG(0.07, 0.42, 4), horn, sx * 0.24, -0.38, 1.45, Math.PI - 0.1, 0, 0);
    }
    for (let i = 0; i < 4; i++) mesh(hd, coneG(0.12, 0.5, 4), horn, 0, 0.66 - i * 0.05, 0.4 - i * 0.38, -0.5, 0, 0);
    const jaw = pivot(hd, 0, -0.4, 0.3);
    mesh(jaw, sph(0.5, 10, 8), belly, 0, -0.06, 0.65, 0, 0, 0, 0.9, 0.38, 1.3);
    for (const sx of [-1, 1]) mesh(jaw, coneG(0.06, 0.32, 4), horn, sx * 0.25, 0.12, 1.1, 0, 0, 0);
    const mouthGlow = glowSprite('#8ec5ff', 0.01, 1.8); mouthGlow.position.set(0, -0.3, 1.3); hd.add(mouthGlow);
    const segs = [], rad = [], n = LOW ? 10 : 14;
    for (let i = 0; i < n; i++) {
      const r = 1.0 * (1 - (i / n) * 0.72);
      const s = mesh(root, sph(1, 10, 8), sc, 0, 0, 0, 0, 0, 0, r, r * 0.82, r * 1.3);
      mesh(s, coneG(0.28, 0.9, 4), horn, 0, 0.95, -0.15, -0.45, 0, 0);
      if (i % 2 === 0) for (const sx of [-1, 1]) mesh(s, BOX, rune, sx * 0.86, 0.15, 0, 0, 0, sx * 0.3, 0.05, 0.12, 0.6);
      mesh(s, sph(0.8, 8, 6), belly, 0, -0.32, 0, 0, 0, 0, 1, 0.55, 1);
      if (i === n - 1) { mesh(s, coneG(0.45, 2.4, 5), sc, 0, 0, -1.6, -Math.PI / 2, 0, 0); mesh(s, coneG(0.5, 0.9, 4), glow, 0, 0.5, -2.4, -0.3, 0, 0, 0.4, 1, 1); }
      segs.push(s); rad.push(r);
    }
    return { root, g, hd, jaw, mouthGlow, segs, rad, sp: 1.45, neck: 0.7, liftN: 4, s: 1, wig: 0, swing: 0, animate: serpentAnimate };
  }
  function serpentAnimate(e, dt, anim, wind, act) {
    const m = e.model, t = e.t, a = e.atk, nm = a ? a.def.name : '';
    m.wig = lerp(m.wig, anim === 'walk' ? 1 : 0.35, Math.min(1, dt * 3));
    let hy = 2.6 + Math.sin(t * 1.6) * 0.25, hz = 0, rx = Math.sin(t * 1.1) * 0.06, jaw = 0.08 + Math.sin(t * 2.3) * 0.05, swing = 0, glow = 0;
    if (nm === 'bite') {
      if (act > 0) { hz = Math.sin(Math.min(1, act) * Math.PI) * 1.8; hy -= 0.8 * Math.sin(Math.min(1, act) * Math.PI); rx = 0.45; jaw = 0.9 * (1 - act); }
      else { hy += wind * 1.0; hz = -wind * 1.6; rx = -0.55 * wind; jaw = 0.9 * wind; }
    } else if (nm === 'tail') {
      swing = act > 0 ? Math.sin(Math.min(1, act) * Math.PI) * 1.3 : -wind * 0.55;
      rx = -0.2 * wind;
      if (act > 0 && !a.fx) { a.fx = true; ring(e.x, e.y + 0.3, e.z, 1, 12, 0.6, '#8ec5ff', 2.4); ring(e.x, e.y + 1.2, e.z, 1, 11, 0.6, '#b388ff', 2.2, TORG); }
    } else if (nm === 'storm' || nm === 'storm2') {
      hy += wind * 1.6 - (act > 0 ? 0.4 : 0); rx = -0.75 * wind; jaw = 0.95 * wind; glow = wind;
      if (wind > 0.2 && wind < 1 && Math.random() < dt * 40) {
        const ang = Math.random() * TAU;
        spark(e.x + Math.cos(ang) * 4, e.y + hy + rand(-1, 3), e.z + Math.sin(ang) * 4, -Math.cos(ang) * 6, rand(-1, 1), -Math.sin(ang) * 6, 0.5, Math.random() < 0.5 ? '#8ec5ff' : '#b388ff', 2.8, 0.4, 0, 0);
      }
      if (act > 0 && !a.fx) { a.fx = true; API.bolt(e.x, e.y + hy + 1, e.z, e.x + rand(-3, 3), e.y + 40, e.z + rand(-3, 3), '#8ec5ff'); }
    }
    m.swing = lerp(m.swing, swing, Math.min(1, dt * 14));
    m.g.position.set(Math.sin(t * 1.4 + e.wander) * 0.5 * (0.5 + m.wig), hy, hz);
    m.g.rotation.y = Math.cos(t * 1.4 + e.wander) * 0.25 * m.wig;
    m.g.rotation.x = rx; m.jaw.rotation.x = jaw;
    const mg = m.mouthGlow.material.color;
    mg.copy(col('#8ec5ff')).multiplyScalar(0.01 + glow * 3 + (e.phase > 1 ? 0.6 + Math.sin(t * 9) * 0.3 : 0));
    updateChain(e, m, dt, m.swing);
    if (e.phase > 1 && Math.random() < dt * 6) { const i = (Math.random() * m.segs.length) | 0; spark(e._cx[i], e.y + 1.5, e._cz[i], rand(-2, 2), rand(1, 4), rand(-2, 2), 0.4, '#8ec5ff', 3, 0.35, 0, 1); }
  }
  function serpentUpdate(e) {
    if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2; toast('La Serpe scatena la tempesta!'); sfx('bossRoar'); API.setShake(0.6);
      oracle('《Allerta: la Serpe sta accumulando energia elettrica. Mantieni le distanze dai fulmini.》');
    }
    return false;
  }
  const FLAME_CORE = new T.IcosahedronGeometry(0.42, 0), FLAME_IN = new T.IcosahedronGeometry(0.22, 0);
  function flameModel() {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    g.position.y = 1.7;
    const core = mesh(g, FLAME_CORE, new T.MeshBasicMaterial({ color: hdr('#ff6a10', 1.7), transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }), 0, 0, 0);
    core.castShadow = false;
    mesh(g, FLAME_IN, basic('#fff2b0', 5), 0, 0, 0).castShadow = false;
    const halo = glowSprite('#ff5a1a', 0.9, 2.3); g.add(halo);
    for (const sx of [-1, 1]) mesh(g, BOX, new T.MeshBasicMaterial({ color: '#1a0500' }), sx * 0.13, 0.06, 0.43, 0, 0, sx * 0.25, 0.08, 0.15, 0.03);
    const shards = pivot(g, 0, 0, 0), shardMat = std('#3a1206', 0.4, 0.2, { emissive: hdr('#ff4a10', 1.7) });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mesh(shards, coneG(0.13, 0.6, 4), shardMat, Math.cos(a) * 0.8, Math.sin(i * 2.1) * 0.25, Math.sin(a) * 0.8, 0, -a, 0.25); }
    const crown = pivot(g, 0, 0.35, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; mesh(crown, coneG(0.09, 0.5, 4), shardMat, Math.cos(a) * 0.25, 0.15, Math.sin(a) * 0.25, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
    return { root, g, core, shards, crown, halo, s: 1, animate: flameAnimate };
  }
  function flameAnimate(e, dt, anim, wind, act) {
    const m = e.model, t = e.t, a = e.atk;
    m.g.position.y = 1.7 + Math.sin(t * 2.2 + e.wander) * 0.22 - (e._root > 0 ? 0.6 : 0);
    m.shards.rotation.y += dt * (a ? 7 : 2.5); m.shards.position.y = Math.sin(t * 3) * 0.08;
    m.crown.rotation.y -= dt * 3; m.core.rotation.x += dt * 1.3; m.core.rotation.y += dt * 2;
    const charge = a && a.def.ranged && act === 0 ? wind : 0, pulse = 1 + Math.sin(t * 11) * 0.06 + charge * 0.6;
    m.core.scale.setScalar(pulse);
    m.halo.scale.set(2.3 * pulse, 2.3 * pulse, 1);
    const gx = e.x, gy = e.y + m.g.position.y, gz = e.z;
    if (Math.random() < dt * (LOW ? 5 : 11)) spark(gx + rand(-0.4, 0.4), gy + 0.2, gz + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3), 0.7, Math.random() < 0.5 ? '#ff7a1a' : '#ffd36b', 2.2, 0.3, -1, 0);
    if (charge > 0.1 && Math.random() < dt * 30) { const an = Math.random() * TAU; spark(gx + Math.cos(an) * 1.6, gy, gz + Math.sin(an) * 1.6, -Math.cos(an) * 4, 0, -Math.sin(an) * 4, 0.35, '#ffd36b', 2.8, 0.25, 0, 0); }
    if (a && a.hit && !a.fired) {
      a.fired = true;
      if (a.def.ranged) {
        const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1, py = heightAt(P.x, P.z) + 0.9;
        const sp = 15, vy = (py - gy) / (d / sp);
        fire('efire', { x: gx + dx / d * 0.7, y: gy, z: gz + dz / d * 0.7, vx: dx / d * sp, vy, vz: dz / d * sp, speed: sp, turn: 1.3, life: 2.6, dmg: a.def.dmg, r: 0.5, enemy: true });
        sfx('fire', { vol: 0.5 });
      } else {
        ring(e.x, e.y + 0.3, e.z, 0.5, 4, 0.4, '#ff7a1a', 2.6);
        burst(gx, gy, gz, 24, '#ff8a2a', 2.6, 8, 0.5, 0.4, 1);
      }
    }
  }

  /* ================================================================ Dragon mimicry form */
  let DF = null, prevForm = P.form, dragonFx = 0;
  function buildDragonForm() {
    const m = API.dragonModel();
    const glow = basic('#8ec5ff', 2.6);
    for (let i = 0; i < 6; i++) mesh(m.g, BOX, glow, 0, 3.05 - Math.abs(i - 2) * 0.05, 1.05 - i * 0.48, 0, 0, 0, 0.06, 0.06, 0.26);
    for (const W of [m.wingL, m.wingR]) { const sx = W === m.wingL ? -1 : 1; mesh(W, sph(0.12, 6, 5), glow, sx * 5.6, 0.75, -0.2); }
    m.root.scale.setScalar(0.42);
    m.root.visible = false; scene.add(m.root);
    m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return m;
  }
  function enterDragon() {
    P.form = 'dragon'; P.formFx = 0.5; dragonFx = 0.8;
    const gy = heightAt(P.x, P.z);
    emit(P.x, gy + 1.5, P.z, 80, '#8ec5ff', { speed: 8, up: 3, grav: 0, life: 1.3 });
    ring(P.x, gy + 0.2, P.z, 0.6, 9, 0.7, '#8ec5ff', 2.8);
    ring(P.x, gy + 2, P.z, 0.6, 7, 0.6, '#b388ff', 2.6, TORG);
    API.bolt(P.x + rand(-2, 2), gy + 35, P.z + rand(-2, 2), P.x, gy + 1, P.z, '#8ec5ff');
    API.flashLight.color.set('#8ec5ff'); API.flashLight.intensity = 90; API.flashLight.position.set(P.x, gy + 4, P.z);
    API.setShake(0.5); sfx('evolve'); sfx('thunder');
    oracle('《Mimetismo: ' + API.FORM_NAMES.dragon + '》', true);
  }
  // transform() only cycles slime/human/wolf: after the last of those comes the dragon. The 'form' input is
  // intercepted before the engine sees it when the next form must be the dragon (keeps the Oracle message clean).
  let wantDragon = false;
  function dragonNext() {
    if (!S.forms.dragon || P.form === 'dragon' || P.atk || P.roll > 0 || API.state !== 'play') return false;
    const list = ['slime', 'human', 'wolf'].filter((f) => S.forms[f]);
    return P.form === list[list.length - 1];
  }
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'KeyT' && !ev.repeat && dragonNext()) { ev.stopImmediatePropagation(); wantDragon = true; }
  }, true);
  function hookFormButton() {
    const b = API.buttons.form;
    if (!b) return;
    b.addEventListener('pointerdown', (ev) => {
      if (!dragonNext()) return;
      ev.stopImmediatePropagation(); ev.stopPropagation(); wantDragon = true; b.classList.add('on');
      try { window.SK.vibrate(10); } catch (er) { /* optional */ }
    }, true);
  }
  function updateDragon(dt, gy) {
    if (wantDragon) { wantDragon = false; if (dragonNext()) enterDragon(); }
    else if (API.pressed('form') && S.forms.dragon && prevForm !== 'dragon' && !P.atk && P.roll <= 0) {
      // fallback if the interception did not run: the engine already cycled back, override to the dragon
      const list = ['slime', 'human', 'wolf'].filter((f) => S.forms[f]);
      if (prevForm === list[list.length - 1]) enterDragon();
    }
    prevForm = P.form;
    const on = P.form === 'dragon';
    if (!on) { if (DF) DF.root.visible = false; if (BR.kind === 'fire') BR.t = 0; return; }
    if (!DF) DF = buildDragonForm();
    API.slime.visible = false; API.human.root.visible = false; API.wolfForm.root.visible = false;
    const m = DF, sp = Math.hypot(P.vx, P.vz), t = clock;
    dragonFx = Math.max(0, dragonFx - dt);
    const pop = 1 + Math.sin(Math.min(1, dragonFx * 1.25) * Math.PI) * 0.3;
    let sc = 0.42 * pop;
    const ck = castT > 0 ? Math.sin((1 - castT / CAST_DUR) * Math.PI) : 0;
    m.root.visible = true;
    m.root.position.set(P.x, gy + P.y, P.z); m.root.rotation.y = P.rot;
    m.root.scale.set(sc * (1 - ck * 0.06), sc * (1 + ck * 0.18), sc * (1 - ck * 0.06));
    const walk = Math.min(1, sp / 6), ph = t * (sp > 9 ? 11 : 7);
    m.legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + i * Math.PI / 2 + (i > 1 ? Math.PI : 0)) * 0.6 * walk; });
    const air = P.y > 0.05, flapSp = air ? 12 : sp > 9 ? 9 : sp > 1 ? 4 : 1.6, flapA = air ? 0.75 : sp > 9 ? 0.55 : 0.28;
    const flap = Math.sin(t * flapSp) * flapA;
    m.wingL.rotation.z = flap + (air || sp > 9 ? 0.05 : 0.45); m.wingR.rotation.z = -m.wingL.rotation.z;
    m.wingL.rotation.y = sp > 9 ? 0.35 : 0.1; m.wingR.rotation.y = -m.wingL.rotation.y;
    m.tail.rotation.y = Math.sin(t * 2.2) * 0.3; m.tail2.rotation.y = Math.sin(t * 2.2 - 0.7) * 0.4; m.tail3.rotation.y = Math.sin(t * 2.2 - 1.4) * 0.5;
    m.g.position.y = air ? 0 : Math.abs(Math.sin(ph)) * 0.05 * walk;
    m.g.rotation.x = P.roll > 0 ? Math.sin((1 - P.roll / 0.45) * Math.PI) * 0.35 : 0;
    m.g.rotation.z = P.roll > 0 ? Math.sin((1 - P.roll / 0.45) * Math.PI) * 0.6 : 0;
    let neck = Math.sin(t * 1.2) * 0.06 - ck * 0.4, jaw = 0.05 + Math.sin(t * 0.8) * 0.03;
    if (P.atk) {
      const k = P.atk.t / P.atk.dur;
      if (P.atk.heavy) { neck = k < 0.6 ? -0.7 * (k / 0.6) : 0.3; jaw = k < 0.6 ? 0.2 : 0.6; }
      else { neck = k < 0.35 ? -0.5 * (k / 0.35) : lerp(0.6, 0, (k - 0.35) / 0.65); jaw = k < 0.35 ? 0.6 * (k / 0.35) : 0.1; }
    }
    if (BR.t > 0 && BR.kind === 'fire') { neck = 0.3; jaw = 0.6; }
    m.neck.rotation.x = neck; m.jaw.rotation.x = jaw;
    if (sp > 9 && Math.random() < dt * 30) spark(P.x + rand(-1, 1), gy + rand(0.5, 2.5), P.z + rand(-1, 1), 0, 0.5, 0, 0.4, '#8ec5ff', 2.4, 0.3, 0, 0);
    if (Math.random() < dt * 3) { const a = rand(0, TAU); spark(P.x + Math.cos(a) * 1.5, gy + 2.6, P.z + Math.sin(a) * 1.5, 0, 0, 0, 0.25, '#b388ff', 3, 0.35, 0, 0); }
  }
  function startDragonBreath() {
    BR.t = 1.2; BR.tick = 0; BR.kind = 'fire'; BR.lv = 1; BR.snd = 0;
    API.setShake(0.3); sfx('magma');
  }

  /* ================================================================ world: camps, the Serpe's lake, night bats */
  const CAMPS = [
    { t: 'bat', x: 86, z: 66, n: 4 }, { t: 'bat', x: 125, z: -95, n: 3 }, { t: 'spider', x: -30, z: 125, n: 3 }, { t: 'spider', x: 205, z: 55, n: 2 }, { t: 'bat', x: -100, z: -160, n: 3 },
    { t: 'spider', x: -380, z: -95, n: 4 }, { t: 'spider', x: -545, z: 70, n: 3 }, { t: 'viper', x: -350, z: 150, n: 5 }, { t: 'viper', x: -455, z: 285, n: 4 },
    { t: 'viper', x: -585, z: -45, n: 4 }, { t: 'viper', x: -300, z: 15, n: 3 }, { t: 'bat', x: -470, z: 95, n: 3 }, { t: 'spider', x: -420, z: 380, n: 3 },
    { t: 'flame', x: 420, z: 75, n: 4 }, { t: 'flame', x: 530, z: -135, n: 4 }, { t: 'flame', x: 615, z: 25, n: 3 }, { t: 'flame', x: 330, z: -215, n: 3 }, { t: 'flame', x: 470, z: 225, n: 3 },
  ];
  const LAKE = { x: -260, z: -380, r: 15, y: 0, g: null, sx: -250, sz: -372 };
  function buildLake() {
    // pick the deepest basin near the requested spot so the water sits naturally in the terrain
    let best = null, bs = -1e9;
    for (let ox = -40; ox <= 40; ox += 10) for (let oz = -40; oz <= 40; oz += 10) {
      const cx = -260 + ox, cz = -380 + oz, h0 = heightAt(cx, cz);
      let sum = 0, mn = 1e9;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, h = heightAt(cx + Math.cos(a) * 16, cz + Math.sin(a) * 16); sum += h; mn = Math.min(mn, h); }
      const score = (sum / 12 - h0) * 2 + (mn - h0) - Math.hypot(ox, oz) * 0.03;
      if (score > bs) { bs = score; best = { x: cx, z: cz }; }
    }
    LAKE.x = best.x; LAKE.z = best.z;
    let mn = 1e9;
    for (let r = 0; r <= LAKE.r * 0.8; r += 3) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; mn = Math.min(mn, heightAt(LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r)); }
    LAKE.y = mn + 0.45;
    const g = new T.Group();
    const water = new T.Mesh(new T.CircleGeometry(LAKE.r * 1.25, 40), new T.MeshStandardMaterial({ color: '#16304a', roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.88, emissive: '#06142a', envMapIntensity: 1.5 }));
    water.rotation.x = -Math.PI / 2; water.position.set(LAKE.x, LAKE.y, LAKE.z); water.receiveShadow = true; g.add(water);
    const stoneM = std('#3b3f4a', 0.85, 0.1), runeM = basic('#7c8cff', 2.4);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3, r = LAKE.r * 1.35 + 3, x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r, h = 3 + (i % 3);
      const s = mesh(g, BOX, stoneM, x, heightAt(x, z) + h / 2 - 0.3, z, rand(-0.08, 0.08), a, rand(-0.08, 0.08), 1.1, h, 0.8);
      mesh(s, BOX, runeM, 0, 0.1, 0.52, 0, 0, 0, 0.18, 0.6, 0.05);
      API.COLL.push({ x, z, r: 0.9 });
    }
    LAKE.sx = LAKE.x + 6; LAKE.sz = LAKE.z + 4;
    scene.add(g); LAKE.g = g;
  }
  let serpMarks = null;
  function serpentMarkers(on) {
    if (on && !serpMarks) {
      serpMarks = [{ x: LAKE.x, z: LAKE.z, label: '☠', color: '#8ec5ff' }, { x: LAKE.x, z: LAKE.z, label: 'Serpe della Tempesta', color: '#8ec5ff' }];
      API.compassMarkers.push(serpMarks[0]); API.mapMarkers.push(serpMarks[1]);
    } else if (!on && serpMarks) {
      let i = API.compassMarkers.indexOf(serpMarks[0]); if (i >= 0) API.compassMarkers.splice(i, 1);
      i = API.mapMarkers.indexOf(serpMarks[1]); if (i >= 0) API.mapMarkers.splice(i, 1);
      serpMarks = null;
    }
  }
  const NIGHT = { t: 6 };
  function despawn(e) {
    scene.remove(e.model.root); if (e.bar) scene.remove(e.bar.bg, e.bar.fg);
    const i = API.enemies.indexOf(e); if (i >= 0) API.enemies.splice(i, 1);
  }
  function updateWorld(dt) {
    // decorations: hide when far
    if (LAKE.g) LAKE.g.visible = Math.hypot(P.x - LAKE.x, P.z - LAKE.z) < 170;
    const night = Math.sin(API.DAY.t * TAU) < -0.08;
    NIGHT.t -= dt;
    if (NIGHT.t <= 0) {
      NIGHT.t = 4;
      let alive = 0;
      for (let i = API.enemies.length - 1; i >= 0; i--) {
        const e = API.enemies[i];
        if (!e.nightBat) continue;
        const d = Math.hypot(e.x - P.x, e.z - P.z);
        if ((e.dead && e.deadT > 2.5) || (!night && !e.engaged && d > 35) || d > 220) despawn(e);
        else if (!e.dead) alive++;
      }
      const bossFight = API.enemies.some((e) => e.d.boss && e.engaged && !e.dead);
      if (night && !bossFight && alive < (LOW ? 3 : 5) && Math.random() < 0.5) {
        const a = rand(0, TAU), r = rand(40, 60), x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (Math.hypot(x, z) < API.MAPR - 30) for (let k = 0; k < 2; k++) API.spawn('bat', x + rand(-4, 4), z + rand(-4, 4), { nightBat: true });
      }
    }
    for (const e of API.enemies) {
      if (!e.dead) continue;
      if (e.type === 'bat' && !e.absorbed) e.model.g.position.y = Math.max(0.35, e.model.g.position.y - dt * 7);
      else if (e.type === 'spider' && !e.absorbed) for (const L of e.model.sl) L.up.rotation.z = lerp(L.up.rotation.z, -0.9, Math.min(1, dt * 6));
    }
  }

  /* ================================================================ input: 1-9 select, cycle button */
  function select(id) {
    if (!lv(id) || DEFS[id].passive) return;
    if (S.abilSel !== id) { S.abilSel = id; API.saveS(); }
  }
  window.addEventListener('keydown', (ev) => {
    if (API.state !== 'play' || ev.repeat) return;
    const m = /^Digit([1-9])$/.exec(ev.code);
    if (!m) return;
    const id = owned[+m[1] - 1];
    if (id) { select(id); sfx('select'); }
  });

  /* ================================================================ plugin */
  API.register({
    id: 'abilities3d',
    init() {
      if (!S.abil || typeof S.abil !== 'object') S.abil = {};
      if (!S.abil.water_blade) S.abil.water_blade = 1;
      if (API.mythic && !S.abil.black_lightning) { S.abil.black_lightning = 1; if (!S.abilSel) S.abilSel = 'black_lightning'; }
      // retroactive rewards for bosses beaten before this module existed
      if (S.bosses.tyrant && !S.abil.gluttony) S.abil.gluttony = 1;
      if (S.bosses.dragon && !S.abil.storm) S.abil.storm = 1;
      if (S.bosses.serpent && !S.abil.black_lightning) S.abil.black_lightning = 1;
      if (S.bosses.dragon) S.forms.dragon = true;
      refreshOwned();
      API.saveS();
      const TY = API.TYPES;
      TY.bat = { name: 'Pipistrello Abissale', hp: 50, r: 0.6, speed: 6.2, aggro: 18, runes: 32, build: batModel,
        attacks: [{ name: 'swoop', range: 4.5, windup: 0.5, active: 0.35, recover: 0.7, dmg: 28, reach: 2.2, arc: 1.4, lunge: 13 }] };
      TY.spider = { name: "Ragno d'Acciaio", hp: 120, r: 0.95, speed: 4.6, aggro: 16, runes: 70, poise: 30, build: spiderModel,
        attacks: [{ name: 'lunge', range: 5.5, windup: 0.5, active: 0.25, recover: 0.7, dmg: 42, reach: 2.6, arc: 1.2, lunge: 14 },
          { name: 'bite', range: 2.6, windup: 0.35, active: 0.2, recover: 0.5, dmg: 30, reach: 2.4, arc: 1.2 }] };
      TY.viper = { name: 'Vipera delle Paludi', hp: 85, r: 0.7, speed: 4.2, aggro: 14, runes: 55, build: viperModel,
        attacks: [{ name: 'bite', range: 3.2, windup: 0.45, active: 0.2, recover: 0.6, dmg: 30, reach: 2.6, arc: 1.2, lunge: 10, poison: true }] };
      TY.flame = { name: 'Spirito di Fiamma', hp: 75, r: 0.7, speed: 3.2, aggro: 22, runes: 60, build: flameModel,
        attacks: [{ name: 'fireball', range: 15, windup: 0.75, active: 0.1, recover: 0.9, dmg: 45, reach: -99, arc: 0, ranged: true },
          { name: 'nova', range: 3, windup: 0.6, active: 0.2, recover: 0.8, dmg: 40, reach: 3.2, arc: TAU }] };
      TY.serpent = { name: 'Serpe della Tempesta', boss: true, hp: 1100, r: 2.0, speed: 5.2, aggro: 30, runes: 2600, poise: 260, build: serpentModel, update: serpentUpdate,
        attacks: [
          { name: 'bite', range: 7, windup: 0.65, active: 0.25, recover: 0.7, dmg: 95, reach: 4, arc: 1.1, lunge: 15 },
          { name: 'tail', range: 8, windup: 0.85, active: 0.3, recover: 0.8, dmg: 80, reach: 8, arc: TAU, wave: 11 },
          { name: 'storm', range: 30, minRange: 6, windup: 1.0, active: 0.1, recover: 1.0, dmg: 70, bolts: 5 },
          { name: 'storm2', range: 30, windup: 0.8, active: 0.1, recover: 0.9, dmg: 70, bolts: 8, phase2: true },
        ] };
      API.FORM.dragon = { speed: 1.3, dmg: 1.6, reach: 1.4, cam: 2.6 };
      API.FORM_NAMES.dragon = 'Drago della Tempesta';
      buildLake();
      if (API.buttons.skill) API.buttons.skill.innerHTML = 'Abilità';
      API.addButton('abilnext', '⟲', 66, 236, 18);
      hookFormButton();
      API.abilities = {
        defs: DEFS, order: ORDER,
        owned: () => owned,
        passives: () => passives,
        selected: () => S.abilSel,
        select,
        cooldown: (id) => (CD[id] > 0 && DEFS[id] && DEFS[id].cd ? CD[id] / DEFS[id].cd : 0),
        cost: (id) => (DEFS[id] ? DEFS[id].cost : 0),
        level: (id) => lv(id),
        grant, cast,
      };
      API.fireProjectile = fire;
      API.rootEnemy = rootEnemy;
    },
    populate() {
      clearProj();
      for (const w of WEBS) { w.t = 0; w.g.visible = false; }
      for (const l of LINES) { l.on = false; l.m.visible = false; }
      SM.e = null; SM.t = 0; GL.t = 0; BR.t = 0; ST.t = 0; US.on = false;
      VX.a.visible = VX.b.visible = false;
      for (const c of CAMPS) for (let i = 0; i < c.n; i++) API.spawn(c.t, c.x + rand(-9, 9), c.z + rand(-9, 9));
      if (!S.bosses.serpent) { API.spawn('serpent', LAKE.sx, LAKE.sz, { rot: rand(0, TAU) }); serpentMarkers(true); }
      else serpentMarkers(false);
    },
    update(dt) {
      clock += dt;
      const gy = heightAt(P.x, P.z);
      if (API.pressed('abilnext') && owned.length) {
        const i = owned.indexOf(S.abilSel);
        select(owned[(i + 1) % owned.length]); sfx('select');
        const d = DEFS[S.abilSel]; toast(d.icon + ' ' + d.name + ' · Lv ' + lv(S.abilSel));
      }
      updateDragon(dt, gy);
      // cast anticipation: the slime stretches up
      if (castT > 0) {
        castT -= dt;
        const k = Math.sin((1 - Math.max(0, castT) / CAST_DUR) * Math.PI);
        if (P.form === 'slime') { API.body.scale.y *= 1 + 0.45 * k; API.body.scale.x *= 1 - 0.16 * k; API.body.scale.z *= 1 - 0.16 * k; }
        else if (P.form === 'human') API.human.root.scale.y *= 1 + 0.12 * k;
        else if (P.form === 'wolf') API.wolfForm.root.scale.y *= 1 + 0.15 * k;
      }
      updateAbilities(dt, gy);
      updateProj(dt);
      updateStatus(dt);
      updateWorld(dt);
      updateRings(dt); updateMagic(dt, gy); updatePillar(dt, gy); updateWebs(dt); updateLines(dt);
      FXA.update(dt); FXN.update(dt);
    },
    onKill(e, absorbed) {
      const id = SRC[e.type];
      if (id && (absorbed || e.d.boss)) grant(id);
      if (e.type === 'dragon' && !S.forms.dragon) {
        S.forms.dragon = true; API.saveS();
        setTimeout(() => { oracle('《Analisi completata. Mimetismo acquisito: Drago della Tempesta》', true); toast('Mimetismo: dalla forma Lupo premi di nuovo per diventare Drago'); }, 2600);
      }
      if (e.type === 'serpent') serpentMarkers(false);
    },
    onHurt(dmg) {
      if (lv('body_armor')) dmg *= 0.7 - 0.03 * (lv('body_armor') - 1);
      if (P.form === 'dragon') dmg *= 0.85;
      return dmg;
    },
    onMelee(base, atk) {
      if (lv('sword_arts')) base *= 1.2 + 0.04 * (lv('sword_arts') - 1);
      if (P.form === 'dragon' && atk) {
        if (atk.heavy) startDragonBreath();
        else {
          const gy = heightAt(P.x, P.z), fx = P.x + Math.sin(P.rot) * 3, fz = P.z + Math.cos(P.rot) * 3;
          burst(fx, gy + 1.6, fz, 18, '#8ec5ff', 2.6, 7, 0.4, 0.35, 0);
          ring(fx, gy + 1.4, fz, 0.4, 3, 0.25, '#8ec5ff', 2.6, TORG);
        }
      }
      return base;
    },
  });
})();
