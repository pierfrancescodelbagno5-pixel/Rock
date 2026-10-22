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
  S = Object.assign({ runes: 0, level: 1, vig: 10, end: 10, mnd: 10, str: 10, grace: 0, bosses: {}, flasks: 4, stain: null, essences: 0, found: { 0: true }, forms: { slime: true, human: true } }, S || {});
  const saveS = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };
  const mythic = ch.cls === 'pierfrancesco';
  const plugins = [];
  const API = {};
  const hook = (name, ...args) => { for (const pl of plugins) if (pl[name]) { try { pl[name](...args); } catch (err) { console.error('[plugin ' + (pl.id || '?') + '.' + name + ']', err); } } };
  const chain = (name, v, ...args) => { for (const pl of plugins) if (pl[name]) { try { v = pl[name](v, ...args); } catch (err) { console.error(err); } } return v; };
  const CLS = {
    pierfrancesco: { hp: 3, st: 2, fp: 2, dmg: 3 }, guerriero: { hp: 1.3, st: 1.2, fp: 1, dmg: 1.1 },
    arcimago: { hp: 1, st: 1, fp: 1.6, dmg: 1.05 }, predatore: { hp: 1.1, st: 1.1, fp: 1.1, dmg: 1.1 }, evocatore: { hp: 1, st: 1, fp: 1.3, dmg: 1 },
  }[ch.cls] || { hp: 1, st: 1, fp: 1, dmg: 1 };

  /* ------------------------------------------------------------ renderer + post-processing */
  const quality = main.settings.quality || 'high';
  const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const isGL2 = renderer.capabilities.isWebGL2;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : quality === 'medium' ? 1.25 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping; // only used when post-processing is off
  $('view').appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(new T.Color('#b9a37a'), quality === 'low' ? 0.0078 : 0.0052);
  const camera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2400);
  const VS_FS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const POST = (() => {
    const enabled = quality !== 'low';
    const fsCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsScene = new T.Scene();
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2)); quad.frustumCulled = false; fsScene.add(quad);
    const type = isGL2 ? T.HalfFloatType : T.UnsignedByteType;
    const mk = (w, h, ms) => new T.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type, samples: ms || 0, minFilter: T.LinearFilter, magFilter: T.LinearFilter });
    let rtMain = null, a = null, b = null, c = null, d = null;
    const sm = (frag, uniforms) => new T.ShaderMaterial({ uniforms, vertexShader: VS_FS, fragmentShader: frag, depthTest: false, depthWrite: false });
    const bright = sm('uniform sampler2D tex; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + 0.8, l), 1.0); }',
      { tex: { value: null }, thr: { value: 0.9 } });
    const blur = sm('uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 s = texture2D(tex, vUv).rgb * 0.227;' +
      's += (texture2D(tex, vUv + dir * 1.385).rgb + texture2D(tex, vUv - dir * 1.385).rgb) * 0.316;' +
      's += (texture2D(tex, vUv + dir * 3.231).rgb + texture2D(tex, vUv - dir * 3.231).rgb) * 0.070; gl_FragColor = vec4(s, 1.0); }',
      { tex: { value: null }, dir: { value: new T.Vector2() } });
    const comp = sm(`uniform sampler2D tex, b1, b2; uniform float strength, exposure, vig, hurt, time, sat, rays; uniform vec2 sunPos; uniform vec3 tint; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      void main(){
        vec3 c = texture2D(tex, vUv).rgb;
        c += (texture2D(b1, vUv).rgb * 0.8 + texture2D(b2, vUv).rgb * 1.4) * strength;
        if (rays > 0.001) {
          vec2 dlt = (vUv - sunPos) / 28.0; vec2 cu = vUv; float dec = 1.0; vec3 acc = vec3(0.0);
          for (int i = 0; i < 28; i++) { cu -= dlt; acc += texture2D(b2, cu).rgb * dec; dec *= 0.94; }
          c += acc * rays * 0.06;
        }
        c = aces(c * tint * exposure);
        float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, sat);
        vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * vig * 2.4;
        c = mix(c, vec3(0.5, 0.0, 0.0), hurt * smoothstep(0.15, 0.8, length(q)));
        c = pow(max(c, 0.0), vec3(1.0 / 2.2));
        c += (fract(sin(dot(vUv * 913.0 + time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(c, 1.0); }`,
      { tex: { value: null }, b1: { value: null }, b2: { value: null }, strength: { value: 0.6 }, exposure: { value: 1 }, vig: { value: 0.38 },
        tint: { value: new T.Color(1, 1, 1) }, hurt: { value: 0 }, time: { value: 0 }, sat: { value: 1.1 }, rays: { value: 0 }, sunPos: { value: new T.Vector2(0.5, 0.8) } });
    function size() {
      if (!enabled) return;
      const pr = renderer.getPixelRatio(), w = Math.floor(window.innerWidth * pr), h = Math.floor(window.innerHeight * pr);
      [rtMain, a, b, c, d].forEach((r) => r && r.dispose());
      rtMain = mk(w, h, isGL2 && quality === 'high' ? 4 : 0);
      a = mk(w >> 2, h >> 2); b = mk(w >> 2, h >> 2); c = mk(w >> 3, h >> 3); d = mk(w >> 3, h >> 3);
    }
    function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
    function render(t) {
      if (!enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      renderer.setRenderTarget(rtMain); renderer.render(scene, camera);
      bright.uniforms.tex.value = rtMain.texture; pass(bright, a);
      blur.uniforms.tex.value = a.texture; blur.uniforms.dir.value.set(1 / a.width, 0); pass(blur, b);
      blur.uniforms.tex.value = b.texture; blur.uniforms.dir.value.set(0, 1 / a.height); pass(blur, a);
      blur.uniforms.tex.value = a.texture; blur.uniforms.dir.value.set(1 / c.width, 0); pass(blur, c);
      blur.uniforms.tex.value = c.texture; blur.uniforms.dir.value.set(0, 1 / c.height); pass(blur, d);
      blur.uniforms.tex.value = d.texture; blur.uniforms.dir.value.set(2 / c.width, 0); pass(blur, c);
      blur.uniforms.tex.value = c.texture; blur.uniforms.dir.value.set(0, 2 / c.height); pass(blur, d);
      comp.uniforms.tex.value = rtMain.texture; comp.uniforms.b1.value = a.texture; comp.uniforms.b2.value = d.texture; comp.uniforms.time.value = t % 100;
      pass(comp, null);
    }
    size();
    return { render, size, comp, enabled };
  })();
  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    POST.size(); partU.uScale.value = window.innerHeight * renderer.getPixelRatio() * 0.5;
  }
  window.addEventListener('resize', () => setTimeout(onResize, 50));

  /* ------------------------------------------------------------ sky, sun, moon, stars, day/night */
  const skyU = { top: { value: new T.Color() }, horizon: { value: new T.Color() }, ground: { value: new T.Color('#2a2418') },
    sunDir: { value: new T.Vector3(0, 1, 0) }, sunCol: { value: new T.Color() }, night: { value: 0 }, time: { value: 0 } };
  const skyMat = new T.ShaderMaterial({ uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 top, horizon, ground, sunCol, sunDir; uniform float night, time; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > 0.0 ? mix(horizon, top, pow(clamp(y, 0.0, 1.0), 0.5)) : mix(horizon, ground, clamp(-y * 5.0, 0.0, 1.0));
        vec3 sd = normalize(sunDir); float s = max(dot(d, sd), 0.0);
        c += sunCol * (pow(s, 1400.0) * 40.0 + pow(s, 16.0) * 0.5 + pow(s, 3.0) * 0.18) * smoothstep(-0.15, 0.05, sd.y);
        if (night > 0.001) {
          vec2 g = floor(vec2(atan(d.z, d.x) * 160.0, asin(clamp(y, -1.0, 1.0)) * 160.0));
          float st = step(0.9965, h21(g)) * smoothstep(0.0, 0.25, y);
          c += vec3(st) * night * (0.6 + 0.4 * sin(time * 2.0 + h21(g + 7.0) * 50.0)) * 2.5;
          float m = max(dot(d, -sd), 0.0);
          c += vec3(0.8, 0.88, 1.0) * (pow(m, 3000.0) * 12.0 + pow(m, 40.0) * 0.3) * night;
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.5, 0.8))) * 4.0, 2.0)) * smoothstep(0.0, 0.4, y);
          c += vec3(0.25, 0.22, 0.45) * band * night * 0.35;
        }
        gl_FragColor = vec4(c, 1.0); }` });
  const sky = new T.Mesh(new T.SphereGeometry(2000, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  // drifting clouds
  const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 14; i++) { const gx = 20 + Math.random() * 88, gy = 24 + Math.random() * 18, r = 12 + Math.random() * 18;
      const g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 64); }
    return new T.CanvasTexture(c); })();
  const clouds = [];
  for (let i = 0; i < (quality === 'low' ? 10 : 22); i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.7 }));
    const sc = 220 + Math.random() * 260; s.scale.set(sc, sc * 0.45, 1);
    s.userData = { a: Math.random() * TAU, r: 500 + Math.random() * 900, h: 260 + Math.random() * 220, v: 0.004 + Math.random() * 0.006 };
    clouds.push(s); scene.add(s);
  }
  const hemi = new T.HemisphereLight('#ffe9c0', '#3a3020', 1.0); scene.add(hemi);
  const sun = new T.DirectionalLight('#ffd9a0', 2.4);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(quality === 'high' ? 4096 : 1024, quality === 'high' ? 4096 : 1024);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 320 });
  scene.add(sun, sun.target);
  const flashLight = new T.PointLight('#b388ff', 0, 34, 1.6);
  scene.add(flashLight);
  // environment reflections generated from the sky
  const pmrem = new T.PMREMGenerator(renderer);
  const envScene = new T.Scene(); envScene.add(new T.Mesh(new T.SphereGeometry(50, 24, 12), skyMat));
  let envRT = null, envTimer = 0;
  const DAY = { t: 0.32, len: 600 };
  const C = (h) => new T.Color(h);
  const SKYPAL = {
    dayTop: C('#4a78bd'), dayHor: C('#ead6a6'), duskTop: C('#2f3770'), duskHor: C('#ff8c4a'), nightTop: C('#03050f'), nightHor: C('#141c36'),
    sunDay: C('#fff1d0'), sunDusk: C('#ff9a50'),
  };
  const regionFog = new T.Color('#b9a37a');
  const tmpA = new T.Color(), tmpB = new T.Color(), sunV = new T.Vector3(), sunScr = new T.Vector3();
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let nightAmt = 0;
  function updateDay(dt, cx, cy, cz) {
    DAY.t = (DAY.t + dt / DAY.len) % 1;
    const ang = DAY.t * TAU;
    sunV.set(Math.cos(ang) * 0.75, Math.sin(ang), 0.35 + Math.cos(ang) * 0.15).normalize();
    const el = sunV.y, day = sstep(-0.1, 0.3, el), dusk = clamp(1 - Math.abs(el - 0.04) / 0.22, 0, 1);
    nightAmt = 1 - sstep(-0.22, 0.02, el);
    tmpA.copy(SKYPAL.nightTop).lerp(SKYPAL.dayTop, day).lerp(SKYPAL.duskTop, dusk * 0.6);
    tmpB.copy(SKYPAL.nightHor).lerp(SKYPAL.dayHor, day).lerp(SKYPAL.duskHor, dusk * 0.75);
    skyU.top.value.copy(tmpA); skyU.horizon.value.copy(tmpB);
    skyU.sunDir.value.copy(sunV); skyU.sunCol.value.copy(SKYPAL.sunDay).lerp(SKYPAL.sunDusk, dusk);
    skyU.night.value = nightAmt; skyU.time.value += dt;
    // fog = horizon tinted by region
    scene.fog.color.copy(tmpB).lerp(regionFog, 0.45 * (0.3 + day * 0.7)).multiplyScalar(0.55 + day * 0.45);
    // sun by day, moon by night
    if (el > -0.05) {
      sun.position.set(cx + sunV.x * 120, cy + Math.max(0.15, sunV.y) * 120, cz + sunV.z * 120);
      sun.color.copy(SKYPAL.sunDay).lerp(SKYPAL.sunDusk, dusk); sun.intensity = 0.35 + 1.9 * day;
    } else {
      sun.position.set(cx - sunV.x * 120, cy - sunV.y * 120, cz - sunV.z * 120);
      sun.color.set('#9db7ff'); sun.intensity = 0.55 * nightAmt;
    }
    sun.target.position.set(cx, cy, cz);
    hemi.intensity = 0.25 + 0.5 * day; hemi.color.copy(tmpB).lerp(C('#ffffff'), 0.3); hemi.groundColor.set(nightAmt > 0.5 ? '#141820' : '#3a3020');
    POST.comp.uniforms.tint.value.setRGB(1 - nightAmt * 0.25, 1 - nightAmt * 0.12, 1 + nightAmt * 0.1);
    POST.comp.uniforms.exposure.value = 0.88 + nightAmt * 0.4;
    { // screen-space god rays toward the sun
      const sp = sunScr.copy(sunV).multiplyScalar(1500).add(camera.position).project(camera);
      const vis = sp.z < 1 && Math.abs(sp.x) < 1.8 && Math.abs(sp.y) < 1.8 ? 1 : 0;
      POST.comp.uniforms.sunPos.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      const want = quality === 'high' ? vis * day * 0.9 : quality === 'medium' ? vis * day * 0.5 : 0;
      POST.comp.uniforms.rays.value = lerp(POST.comp.uniforms.rays.value, want, Math.min(1, dt * 3 + 0.02));
      if (API.waterNormal) { API.waterNormal.offset.x += dt * 0.015; API.waterNormal.offset.y += dt * 0.01; }
    }
    sky.position.set(cx, cy, cz);
    for (const s of clouds) {
      const u = s.userData; u.a += u.v * dt * 0.05;
      s.position.set(cx + Math.cos(u.a) * u.r, u.h, cz + Math.sin(u.a) * u.r);
      s.material.color.copy(tmpB).lerp(C('#ffffff'), day * 0.5).multiplyScalar(0.4 + day * 0.9);
    }
    envTimer -= dt;
    if (quality !== 'low' && envTimer <= 0) {
      envTimer = quality === 'high' ? 8 : 20;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 0.1, 200);
      scene.environment = envRT.texture;
    }
  }

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
    if (API.pocket && API.pocket.contains(x, z)) return API.pocket.heightAt ? API.pocket.heightAt(x, z) : API.pocket.h;
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
  // wind (shared by trees and grass)
  const windU = { uTime: { value: 0 }, uPlayer: { value: new T.Vector3() } };
  function sway(mat, amount, grass) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windU.uTime; sh.uniforms.uPlayer = windU.uPlayer;
      sh.vertexShader = 'uniform float uTime; uniform vec3 uPlayer;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 ip = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float hw = ${grass ? 'position.y * position.y' : 'max(position.y + 1.2, 0.0) * 0.45'};
        float ph = uTime * ${grass ? '2.4' : '1.0'} + ip.x * 0.13 + ip.z * 0.09;
        float gust = 0.6 + 0.4 * sin(uTime * 0.35 + ip.x * 0.01);
        ${grass ? 'float fd = length(ip.xz - uPlayer.xz); transformed *= clamp((36.0 - fd) / 9.0, 0.0, 1.0);' : ''}
        transformed.x += sin(ph) * ${amount.toFixed(3)} * hw * gust;
        transformed.z += cos(ph * 0.83) * ${(amount * 0.6).toFixed(3)} * hw * gust;
        ${grass && isGL2 ? `vec2 pd = ip.xz - uPlayer.xz; float pk = clamp(1.0 - length(pd) / 1.7, 0.0, 1.0);
        vec3 pl = transpose(mat3(instanceMatrix)) * vec3(pd.x, 0.0, pd.y);
        transformed.xz += normalize(pl.xz + vec2(0.0001)) * pk * hw * 0.8; transformed.y -= pk * hw * 0.35;` : ''}
      `);
    };
    mat.customProgramCacheKey = () => 'sway' + amount + (grass ? 'g' : 't');
    return mat;
  }
  const hdr = (hex, k) => new T.Color(hex).multiplyScalar(k);
  {
    const seg = quality === 'low' ? 170 : quality === 'medium' ? 260 : 340;
    const g = new T.PlaneGeometry(MAPR * 2.3, MAPR * 2.3, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, cols = [];
    const rock = new T.Color('#7a7064'), dirt = new T.Color('#6e5a3a'), snow = new T.Color('#eef3f8');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z);
      p.setY(i, h);
      const n = vnoise(x * 0.05, z * 0.05), n2 = vnoise(x * 0.31, z * 0.31);
      const rk = regionAt(x + (vnoise(x * 0.02, z * 0.02) - 0.5) * 100, z + (vnoise(z * 0.02, x * 0.02) - 0.5) * 100), R = REGIONS[rk];
      const c = new T.Color(R.ground[0]).lerp(new T.Color(R.ground[1]), n);
      c.multiplyScalar(0.88 + n2 * 0.24);
      if (h > 9) c.lerp(rk === 'north' ? snow : rock, clamp((h - 9) / 10, 0, 1));
      if (rk === 'north' && h > 22) c.lerp(snow, 0.8);
      if (n < 0.25 && rk !== 'north') c.lerp(dirt, 0.45);
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const detail = (() => {
      // procedural ground detail: albedo grain + derived normal map (tileable value noise)
      const N = 256, cv = document.createElement('canvas'), nv = document.createElement('canvas');
      cv.width = cv.height = nv.width = nv.height = N;
      const cx = cv.getContext('2d'), nx = nv.getContext('2d'), a = cx.createImageData(N, N), b = nx.createImageData(N, N), H = new Float32Array(N * N);
      const tn = (x, y, f) => { // tileable noise
        const X = x * f, Y = y * f, xi = Math.floor(X), yi = Math.floor(Y), xf = X - xi, yf = Y - yi, w = f;
        const hh = (i, j) => hash(((i % w) + w) % w, ((j % w) + w) % w);
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        return lerp(lerp(hh(xi, yi), hh(xi + 1, yi), u), lerp(hh(xi, yi + 1), hh(xi + 1, yi + 1), u), v);
      };
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N;
        const h = tn(u, v, 8) * 0.45 + tn(u, v, 32) * 0.35 + tn(u, v, 64) * 0.2;
        H[y * N + x] = h;
        const g = 0.78 + h * 0.34 + (hash(x, y) - 0.5) * 0.08;
        const o = (y * N + x) * 4; a.data[o] = a.data[o + 1] = a.data[o + 2] = Math.min(255, g * 230); a.data[o + 3] = 255;
      }
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)], hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
        const nx0 = -hx * 3.2, ny0 = -hy * 3.2, nz0 = 1, l = Math.hypot(nx0, ny0, nz0), o = (y * N + x) * 4;
        b.data[o] = (nx0 / l * 0.5 + 0.5) * 255; b.data[o + 1] = (ny0 / l * 0.5 + 0.5) * 255; b.data[o + 2] = (nz0 / l * 0.5 + 0.5) * 255; b.data[o + 3] = 255;
      }
      cx.putImageData(a, 0, 0); nx.putImageData(b, 0, 0);
      const t1 = new T.CanvasTexture(cv), t2 = new T.CanvasTexture(nv);
      for (const t of [t1, t2]) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(260, 260); t.anisotropy = 4; }
      t1.colorSpace = T.SRGBColorSpace;
      return { map: t1, normal: t2 };
    })();
    const terrainMat = quality === 'low'
      ? new T.MeshLambertMaterial({ vertexColors: true, flatShading: true })
      : new T.MeshStandardMaterial({ vertexColors: true, map: detail.map, normalMap: detail.normal, normalScale: new T.Vector2(0.9, 0.9), roughness: 0.94, metalness: 0, envMapIntensity: 0.35 });
    const m = new T.Mesh(g, terrainMat);
    m.receiveShadow = true;
    scene.add(m);
    // water: storm lake (north) and swamp pools (west), reflecting the sky
    const WATERN = detail.normal.clone(); WATERN.repeat.set(6, 6); WATERN.needsUpdate = true; API.waterNormal = WATERN;
    const water = (x, z, r, col) => {
      const w = new T.Mesh(new T.CircleGeometry(r, 48), new T.MeshStandardMaterial({ color: col, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.88, envMapIntensity: 1.6,
        normalMap: WATERN, normalScale: new T.Vector2(0.35, 0.35) }));
      w.rotation.x = -Math.PI / 2; w.position.set(x, heightAt(x, z) + 0.18, z); w.receiveShadow = true; scene.add(w);
      return w;
    };
    water(LOC.dragon.x - 34, LOC.dragon.z + 12, 26, '#2a5f7c');
    for (let i = 0; i < 9; i++) { const x = -330 - Math.random() * 300, z = -150 + Math.random() * 420; if (Math.hypot(x, z) < MAPR - 40) water(x, z, 7 + Math.random() * 12, '#2c3b2a'); }
  }

  /* ------------------------------------------------------------ props */
  const COLL = []; // static circle colliders {x,z,r}
  const lam = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: c, flatShading: true }, o || {}));
  const std = (c, rough, metal, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: rough == null ? 0.7 : rough, metalness: metal || 0, flatShading: true }, o || {}));
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
  function instanced(geo, mat, list, shadow) {
    if (!list.length) return null;
    const im = new T.InstancedMesh(geo, mat, list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
      m4.compose(v.set(it.x, it.y, it.z), q, sc.set(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m4);
      if (it.c) im.setColorAt(i, new T.Color(it.c));
    });
    im.castShadow = shadow !== false; im.receiveShadow = true;
    scene.add(im);
    return im;
  }
  {
    const L = { trunk: [], round: [], pine: [], pineSnow: [], dead: [], branch: [], willow: [], shroom: [], rocks: [], lava: [], crystal: [] };
    const pick = (cs) => cs[(Math.random() * cs.length) | 0];
    scatter(quality === 'low' ? 650 : 1250, (x, z) => {
      const y = heightAt(x, z), s = rand(0.8, 1.7), rk = regionAt(x, z), ry = rand(0, TAU);
      if (rk === 'north') {
        L.trunk.push({ x, y: y + 1.6 * s, z, sx: s * 0.8, sy: s * 0.75, sz: s * 0.8, ry });
        for (let k = 0; k < 3; k++) L.pine.push({ x, y: y + (3.2 + k * 1.9) * s, z, sx: s * (1.25 - k * 0.3), sy: s * 1.1, sz: s * (1.25 - k * 0.3), ry: ry + k, c: pick(['#24432f', '#2d4f36', '#1f3b2a']) });
        L.pineSnow.push({ x, y: y + 7.6 * s, z, sx: s * 0.42, sy: s * 0.5, sz: s * 0.42, ry });
      } else if (rk === 'east') {
        const tilt = rand(-0.25, 0.25);
        L.dead.push({ x, y: y + 2.2 * s, z, sx: s * 0.8, sy: s, sz: s * 0.8, rz: tilt, ry });
        for (let k = 0; k < 3; k++) L.branch.push({ x: x + Math.cos(ry + k * 2.1) * 0.7 * s, y: y + (3 + k * 0.7) * s, z: z + Math.sin(ry + k * 2.1) * 0.7 * s, sx: s * 0.5, sy: s * 0.6, sz: s * 0.5, rz: 0.9 * (k % 2 ? 1 : -1), ry: ry + k * 2.1 });
        if (Math.random() < 0.3) L.round.push({ x, y: y + 5 * s, z, sx: s * 0.8, sy: s * 0.7, sz: s * 0.8, ry, c: pick(REGIONS.east.crowns) });
      } else if (rk === 'west') {
        L.trunk.push({ x, y: y + 2 * s, z, sx: s * 1.1, sy: s * 0.95, sz: s * 1.1, ry });
        L.willow.push({ x, y: y + 4.8 * s, z, sx: s * 1.5, sy: s * 0.7, sz: s * 1.5, ry, c: pick(REGIONS.west.crowns) });
        if (Math.random() < 0.7) for (let k = 0; k < 3; k++) L.shroom.push({ x: x + rand(-2.5, 2.5), y: y + 0.25, z: z + rand(-2.5, 2.5), sx: rand(0.2, 0.45), sy: rand(0.2, 0.4), sz: rand(0.2, 0.45), c: pick(['#7cf7ff', '#b6ff6a', '#e48bff']) });
      } else {
        L.trunk.push({ x, y: y + 2.2 * s, z, sx: s, sy: s, sz: s, ry });
        L.round.push({ x, y: y + 5.2 * s, z, sx: s * rand(0.9, 1.3), sy: s * rand(0.8, 1.15), sz: s * rand(0.9, 1.3), ry, c: pick(REGIONS.center.crowns) });
        if (Math.random() < 0.6) L.round.push({ x: x + rand(-1.4, 1.4), y: y + 6.6 * s, z: z + rand(-1.4, 1.4), sx: s * 0.7, sy: s * 0.65, sz: s * 0.7, ry: ry + 1, c: pick(REGIONS.center.crowns) });
      }
      COLL.push({ x, z, r: 0.7 * s });
      return true;
    });
    scatter(quality === 'low' ? 380 : 700, (x, z) => {
      const s = rand(0.6, 2.8), rk = regionAt(x, z);
      L.rocks.push({ x, y: heightAt(x, z) + s * 0.35, z, sx: s, sy: s * rand(0.55, 1.05), sz: s * rand(0.8, 1.3), rx: rand(0, 1), ry: rand(0, 6),
        c: rk === 'east' ? pick(['#4a3a36', '#3b2f2c']) : rk === 'north' ? pick(['#9aa3ad', '#c8d0d8']) : rk === 'west' ? pick(['#4f5446', '#5a5a4e']) : pick(['#8b8274', '#9c9282', '#7a7266']) });
      COLL.push({ x, z, r: s * 0.9 });
      return true;
    });
    // glowing lava fissures (east) and ice crystals (north)
    scatter(quality === 'low' ? 60 : 120, (x, z) => {
      const rk = regionAt(x, z);
      if (rk === 'east') { L.lava.push({ x, y: heightAt(x, z) + 0.05, z, sx: rand(0.3, 0.7), sy: 0.12, sz: rand(5, 14), ry: rand(0, TAU) }); return true; }
      if (rk === 'north') { L.crystal.push({ x, y: heightAt(x, z) + 1, z, sx: rand(0.5, 1), sy: rand(1.4, 3), sz: rand(0.5, 1), rx: rand(-0.3, 0.3), ry: rand(0, TAU) }); return true; }
      return false;
    });
    const crownGeo = new T.IcosahedronGeometry(2.6, 1);
    instanced(new T.CylinderGeometry(0.26, 0.48, 4.4, 7), lam('#5a4330'), L.trunk);
    instanced(crownGeo, sway(lam('#ffffff'), 0.22), L.round);
    instanced(new T.ConeGeometry(2.2, 3.2, 8), sway(lam('#ffffff'), 0.12), L.pine);
    instanced(new T.ConeGeometry(2.2, 2.2, 8), lam('#f4f8fc'), L.pineSnow, false);
    instanced(new T.CylinderGeometry(0.18, 0.42, 4.4, 6), lam('#3a2a24'), L.dead);
    instanced(new T.CylinderGeometry(0.06, 0.14, 2.2, 5), lam('#3a2a24'), L.branch, false);
    instanced(new T.SphereGeometry(2.4, 10, 6), sway(lam('#ffffff'), 0.3), L.willow);
    instanced(new T.SphereGeometry(1, 8, 5, 0, TAU, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.2, 2.2) }), L.shroom, false);
    instanced(new T.DodecahedronGeometry(1, 0), lam('#ffffff'), L.rocks);
    instanced(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: hdr('#ff6a1a', 3.2) }), L.lava, false);
    instanced(new T.OctahedronGeometry(1, 0), std('#9fdcff', 0.1, 0.2, { transparent: true, opacity: 0.85, emissive: hdr('#4fb3ff', 0.6) }), L.crystal);
  }
  // ruins: broken pillars, arches and statues
  const stone = std('#a59c88', 0.9, 0);
  function pillar(x, z, h, broken) {
    const y = heightAt(x, z);
    const m = new T.Mesh(new T.CylinderGeometry(0.7, 0.8, h, 10), stone);
    m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true;
    if (broken) m.rotation.z = rand(-0.08, 0.08);
    const cap = new T.Mesh(new T.BoxGeometry(1.9, 0.4, 1.9), stone); cap.position.y = h / 2 + 0.2; cap.castShadow = true;
    if (!broken || Math.random() < 0.5) m.add(cap);
    scene.add(m); COLL.push({ x, z, r: 0.9 });
  }
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; pillar(LOC.ruins.x + Math.cos(a) * 12, LOC.ruins.z + Math.sin(a) * 12, rand(3, 8), true); }
  for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; pillar(LOC.arena.x + Math.cos(a) * (LOC.arena.r + 1.5), LOC.arena.z + Math.sin(a) * (LOC.arena.r + 1.5), i % 3 ? 10 : 6, false); }
  {
    // arena floor tiles and braziers
    const fl = new T.Mesh(new T.CylinderGeometry(LOC.arena.r, LOC.arena.r, 0.3, 32), std('#6d6458', 0.85));
    fl.position.set(LOC.arena.x, heightAt(LOC.arena.x, LOC.arena.z) + 0.05, LOC.arena.z); fl.receiveShadow = true; scene.add(fl);
  }
  // golden giant tree on the horizon
  {
    const g = new T.Group(), gold = new T.MeshBasicMaterial({ color: hdr('#ffcf5a', 1.7), fog: false, transparent: true, opacity: 0.93 });
    const trunk = new T.MeshBasicMaterial({ color: hdr('#e0a640', 1.2), fog: false });
    for (let i = 0; i < 6; i++) {
      const c = new T.Mesh(new T.CylinderGeometry(8 - i, 10 - i, 40, 7), trunk);
      c.position.set(Math.sin(i) * 3, 20 + i * 36, Math.cos(i) * 3); c.rotation.z = Math.sin(i * 1.7) * 0.15; g.add(c);
    }
    for (let i = 0; i < 30; i++) {
      const l = new T.Mesh(new T.IcosahedronGeometry(rand(24, 46), 0), gold);
      const a = rand(0, TAU), r = rand(10, 95);
      l.position.set(Math.cos(a) * r, rand(160, 290), Math.sin(a) * r * 0.6); g.add(l);
    }
    const halo = new T.Sprite(new T.SpriteMaterial({ map: null, color: hdr('#ffd36b', 0.5), transparent: true, opacity: 0.25, depthWrite: false, fog: false, blending: T.AdditiveBlending }));
    halo.scale.set(520, 420, 1); halo.position.set(0, 220, 0); g.add(halo);
    g.position.set(-60, -30, -900);
    scene.add(g);
  }

  /* ------------------------------------------------------------ grass (chunked around the player, wind + bending) */
  const GRASS = { size: 34, per: quality === 'high' ? 2600 : 1500, ring: 1, chunks: new Map(), pool: [] };
  const grassGeo = (() => {
    const g = new T.BufferGeometry(), w = 0.07;
    g.setAttribute('position', new T.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, 0.55, 0.02, w * 0.6, 0.55, 0.02, 0, 1, 0.08], 3));
    g.setAttribute('color', new T.Float32BufferAttribute([0.35, 0.35, 0.35, 0.35, 0.35, 0.35, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.15, 1.15, 1.15], 3));
    g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    g.setAttribute('normal', new T.Float32BufferAttribute([0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3, 0, 1, 0.3], 3)); // lit like the ground
    return g;
  })();
  const grassMat = sway(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), 0.35, true);
  const GCOL = { center: ['#7f8f3c', '#a8923f', '#6a8434', '#bfa660'], north: ['#8e9c80', '#a7b39a'], east: ['#8a4a2e', '#a8642f', '#6e3a26'], west: ['#3f5a32', '#4f4a5e', '#2f4a2a'] };
  function buildChunk(cx, cz) {
    const im = GRASS.pool.pop() || new T.InstancedMesh(grassGeo, grassMat, GRASS.per);
    im.receiveShadow = true; im.frustumCulled = false;
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    let n = 0;
    for (let i = 0; i < GRASS.per; i++) {
      const x = (cx + Math.random()) * GRASS.size, z = (cz + Math.random()) * GRASS.size;
      const rk = regionAt(x, z), h = heightAt(x, z);
      if (Math.hypot(x, z) > MAPR - 25 || h > 26 || (rk === 'north' && Math.random() < 0.93) || (rk === 'east' && Math.random() < 0.5)) continue;
      if (Math.hypot(x - LOC.arena.x, z - LOC.arena.z) < LOC.arena.r + 1) continue;
      const s = rand(0.32, 0.75) * (rk === 'west' ? 1.4 : 1);
      e.set(rand(-0.15, 0.15), rand(0, TAU), rand(-0.15, 0.15)); q.setFromEuler(e);
      m4.compose(v.set(x, h, z), q, sc.set(s * rand(0.8, 1.4), s * rand(0.8, 1.3), s));
      im.setMatrixAt(n, m4);
      col.set(GCOL[rk][(Math.random() * GCOL[rk].length) | 0]).multiplyScalar(rand(0.85, 1.12));
      im.setColorAt(n, col); n++;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    scene.add(im);
    return im;
  }
  function updateGrass(px, pz) {
    if (quality === 'low') return;
    const cx = Math.floor(px / GRASS.size), cz = Math.floor(pz / GRASS.size), want = new Set();
    for (let i = -GRASS.ring; i <= GRASS.ring; i++) for (let j = -GRASS.ring; j <= GRASS.ring; j++) want.add((cx + i) + ',' + (cz + j));
    for (const [k, im] of GRASS.chunks) if (!want.has(k)) { scene.remove(im); GRASS.pool.push(im); GRASS.chunks.delete(k); }
    let built = 0;
    for (const k of want) if (!GRASS.chunks.has(k) && built < 1) { const [a, b] = k.split(',').map(Number); GRASS.chunks.set(k, buildChunk(a, b)); built++; }
  }

  /* ------------------------------------------------------------ particles (HDR, per-particle size) */
  const PMAX = 1400;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), parts = [];
  const pGeo = new T.BufferGeometry();
  pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new T.BufferAttribute(pCol, 3));
  pGeo.setAttribute('size', new T.BufferAttribute(pSize, 1));
  const partU = { uScale: { value: window.innerHeight * renderer.getPixelRatio() * 0.5 } };
  const PVS = 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uScale / -mv.z, 0.0, 96.0); gl_Position = projectionMatrix * mv; }';
  const pointMat = (additive) => new T.ShaderMaterial({ uniforms: partU, vertexShader: PVS, transparent: true, depthWrite: false,
    blending: additive ? T.AdditiveBlending : T.NormalBlending,
    fragmentShader: additive
      ? 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a * a * 1.6, 1.0); }'
      : 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.2, d); gl_FragColor = vec4(vC, a * 0.9); }' });
  const pts = new T.Points(pGeo, pointMat(true));
  pts.frustumCulled = false;
  scene.add(pts);
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const tmpC = new T.Color();
  function emit(x, y, z, n, color, o) {
    o = o || {};
    tmpC.set(color);
    const k = o.bright || 1.6;
    if (quality === 'low') n = Math.ceil(n * 0.5);
    for (let i = 0; i < n; i++) {
      if (parts.length >= PMAX) parts.shift();
      const sp = o.speed || 6;
      const life = rand(0.4, 1) * (o.life || 1);
      parts.push({ x, y, z, vx: rand(-1, 1) * sp, vy: rand(o.up ? 0.5 : -1, 1) * sp + (o.up || 0), vz: rand(-1, 1) * sp,
        life, max: life, r: tmpC.r * k, g: tmpC.g * k, b: tmpC.b * k, grav: o.grav == null ? 9 : o.grav, size: (o.size || 0.45) * rand(0.6, 1.4) });
    }
  }
  function updateParticles(dt) {
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const dr = Math.max(0, 1 - dt * 2); p.vx *= dr; p.vz *= dr;
    }
    for (const p of parts) {
      const k = p.life / p.max;
      pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z;
      pCol[n * 3] = p.r * k; pCol[n * 3 + 1] = p.g * k; pCol[n * 3 + 2] = p.b * k;
      pSize[n] = p.size * (0.4 + 0.6 * k);
      n++;
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; pGeo.attributes.size.needsUpdate = true;
  }
  /* weather around the camera: leaves, snow, embers, spores, fireflies */
  const WMAX = quality === 'low' ? 160 : quality === 'medium' ? 320 : 520;
  const wPos = new Float32Array(WMAX * 3), wCol = new Float32Array(WMAX * 3), wSize = new Float32Array(WMAX), wData = [];
  const wGeo = new T.BufferGeometry();
  wGeo.setAttribute('position', new T.BufferAttribute(wPos, 3)); wGeo.setAttribute('color', new T.BufferAttribute(wCol, 3)); wGeo.setAttribute('size', new T.BufferAttribute(wSize, 1));
  const wSoft = new T.Points(wGeo, pointMat(false)); wSoft.frustumCulled = false; scene.add(wSoft);
  const glowGeo = new T.BufferGeometry(), gPos = new Float32Array(160 * 3), gCol = new Float32Array(160 * 3), gSize = new Float32Array(160), gData = [];
  glowGeo.setAttribute('position', new T.BufferAttribute(gPos, 3)); glowGeo.setAttribute('color', new T.BufferAttribute(gCol, 3)); glowGeo.setAttribute('size', new T.BufferAttribute(gSize, 1));
  const wGlow = new T.Points(glowGeo, pointMat(true)); wGlow.frustumCulled = false; scene.add(wGlow);
  for (let i = 0; i < WMAX; i++) wData.push({ x: 0, y: -999, z: 0, ph: Math.random() * TAU, sp: rand(0.6, 1.4) });
  for (let i = 0; i < 160; i++) gData.push({ x: 0, y: -999, z: 0, ph: Math.random() * TAU, sp: rand(0.6, 1.4) });
  const WEATHER = {
    center: { soft: ['#d9a441', '#c77a2c', '#e8c35a'], fall: 1.1, size: 0.22, glowDay: null, glowNight: '#ffe27a' },
    north: { soft: ['#ffffff', '#eaf2ff'], fall: 2.2, size: 0.16, glowDay: null, glowNight: '#bfe3ff' },
    east: { soft: ['#5a4038', '#3b302c'], fall: 0.7, size: 0.18, glowDay: '#ff7a2a', glowNight: '#ff7a2a', rise: true },
    west: { soft: ['#9aa68a', '#7a8a6a'], fall: 0.25, size: 0.12, glowDay: '#b6ff6a', glowNight: '#9dff7a' },
  };
  function updateWeather(dt, cx, cy, cz, rk) {
    const W = WEATHER[rk], R = 40, time = skyU.time.value;
    for (let i = 0; i < WMAX; i++) {
      const p = wData[i];
      if (p.y < cy - 8 || p.y > cy + 30 || Math.abs(p.x - cx) > R || Math.abs(p.z - cz) > R || p.rk !== rk) {
        p.x = cx + rand(-R, R); p.z = cz + rand(-R, R); p.y = p.rk === rk ? cy + rand(15, 28) : cy + rand(-6, 26); p.rk = rk;
        tmpC.set(W.soft[(Math.random() * W.soft.length) | 0]); p.r = tmpC.r; p.g = tmpC.g; p.b = tmpC.b;
      }
      p.y -= W.fall * p.sp * dt; p.ph += dt * 2;
      p.x += (Math.sin(p.ph) * 0.8 + 0.6) * dt * (rk === 'north' ? 1.5 : 1); p.z += Math.cos(p.ph * 0.7) * 0.5 * dt;
      wPos[i * 3] = p.x; wPos[i * 3 + 1] = p.y; wPos[i * 3 + 2] = p.z;
      const lit = 0.35 + 0.65 * (1 - nightAmt);
      wCol[i * 3] = p.r * lit; wCol[i * 3 + 1] = p.g * lit; wCol[i * 3 + 2] = p.b * lit; wSize[i] = W.size * p.sp;
    }
    const gc = nightAmt > 0.4 ? W.glowNight : W.glowDay, gn = gc ? (W.rise ? 160 : Math.round(160 * (nightAmt > 0.4 ? 1 : 0.4))) : 0;
    if (gc) tmpC.set(gc);
    for (let i = 0; i < 160; i++) {
      const p = gData[i];
      if (i >= gn) { gPos[i * 3 + 1] = -9999; continue; }
      if (Math.abs(p.x - cx) > 30 || Math.abs(p.z - cz) > 30 || p.y > cy + 18 || p.y < cy - 6) { p.x = cx + rand(-30, 30); p.z = cz + rand(-30, 30); p.y = heightAt(p.x, p.z) + rand(0.3, W.rise ? 1 : 4); }
      p.ph += dt * p.sp;
      if (W.rise) p.y += dt * 1.8 * p.sp; else { p.x += Math.sin(p.ph) * dt * 0.8; p.y += Math.sin(p.ph * 1.3) * dt * 0.4; p.z += Math.cos(p.ph * 0.9) * dt * 0.8; }
      const tw = W.rise ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + p.ph * 3));
      gPos[i * 3] = p.x; gPos[i * 3 + 1] = p.y; gPos[i * 3 + 2] = p.z;
      gCol[i * 3] = tmpC.r * 2.5 * tw; gCol[i * 3 + 1] = tmpC.g * 2.5 * tw; gCol[i * 3 + 2] = tmpC.b * 2.5 * tw; gSize[i] = (W.rise ? 0.18 : 0.28) * p.sp;
    }
    wGeo.attributes.position.needsUpdate = wGeo.attributes.color.needsUpdate = wGeo.attributes.size.needsUpdate = true;
    glowGeo.attributes.position.needsUpdate = glowGeo.attributes.color.needsUpdate = glowGeo.attributes.size.needsUpdate = true;
  }

  /* ------------------------------------------------------------ graces & markers */
  function makeGrace(g) {
    const y = heightAt(g.x, g.z);
    const m = new T.Mesh(new T.OctahedronGeometry(0.35, 0), new T.MeshBasicMaterial({ color: hdr('#ffe08a', 3) }));
    m.position.set(g.x, y + 1.3, g.z); scene.add(m);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: dot, color: hdr('#ffcf5a', 2.2), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    halo.scale.set(4, 4, 1); halo.position.copy(m.position); scene.add(halo);
    return Object.assign({ y, mesh: m, halo }, g);
  }
  const graceObjs = LOC.grace.map(makeGrace);
  function addGrace(x, z, name) {
    const g = { x, z, name };
    LOC.grace.push(g); graceObjs.push(makeGrace(g));
    return graceObjs.length - 1;
  }
  function teleport(x, z) {
    P.x = x; P.z = z; P.vx = P.vz = 0; P.y = 0;
    camPos.set(x, heightAt(x, z) + 6, z + 10);
  }
  let stainMesh = null;
  function placeStain() {
    if (stainMesh) { scene.remove(stainMesh); stainMesh = null; }
    if (!S.stain) return;
    stainMesh = new T.Sprite(new T.SpriteMaterial({ map: dot, color: hdr('#7dffb0', 2.5), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
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
    form: 'slime', formFx: 0, roll: 0, iframe: 0, atk: null, combo: 0, comboT: 0, stun: 0, stCd: 0, dead: false, absorb: 0, auraT: 0, judT: 18, hitFlash: 0,
  };
  function recalc(full) {
    P.maxHp = Math.round((300 + (S.vig - 10) * 28) * CLS.hp);
    P.maxFp = Math.round((80 + (S.mnd - 10) * 9) * CLS.fp);
    P.maxSt = Math.round((90 + (S.end - 10) * 5) * CLS.st);
    P.dmg = (1 + (S.str - 10) * 0.06) * CLS.dmg * (1 + S.essences * 0.02);
    hook('recalc', P, full);
    if (full) { P.hp = P.maxHp; P.fp = P.maxFp; P.st = P.maxSt; P.flasks = S.flasks; }
  }
  recalc(true);
  const slime = new T.Group();
  const slimeEyes = [];
  const bodyMat = new T.MeshPhysicalMaterial({ color: ch.color || '#4fc3ff', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    transparent: true, opacity: 0.86, emissive: '#06182a', envMapIntensity: 1.1, sheen: 0.15, sheenColor: new T.Color('#9fe8ff') });
  const body = new T.Mesh(new T.SphereGeometry(1, 40, 28), bodyMat);
  body.castShadow = true; slime.add(body);
  const core = new T.Mesh(new T.IcosahedronGeometry(0.28, 0), new T.MeshBasicMaterial({ color: hdr(mythic ? '#ffd54f' : '#c8f4ff', 2.2) }));
  core.position.set(0, -0.15, 0); body.add(core);
  const eyeMat = new T.MeshStandardMaterial({ color: '#0b0e18', roughness: 0.1 }), shine = new T.MeshBasicMaterial({ color: hdr('#ffffff', 2) });
  for (const sx of [-0.32, 0.32]) {
    const e = new T.Mesh(new T.SphereGeometry(0.17, 16, 12), eyeMat);
    e.scale.set(0.8, 1.3, 0.6); e.position.set(sx, 0.18, 0.86); body.add(e); slimeEyes.push(e);
    const s = new T.Mesh(new T.SphereGeometry(0.055, 8, 6), shine); s.position.set(sx + 0.05, 0.29, 0.96); body.add(s);
    const s2 = new T.Mesh(new T.SphereGeometry(0.025, 6, 5), shine); s2.position.set(sx - 0.04, 0.1, 0.97); body.add(s2);
  }
  const mouth = new T.Mesh(new T.SphereGeometry(0.16, 14, 10), new T.MeshBasicMaterial({ color: '#2a0f1e' }));
  mouth.position.set(0, -0.12, 0.9); mouth.scale.set(1, 0.18, 0.35); body.add(mouth);
  const cheekMat = new T.MeshBasicMaterial({ color: '#ff8fb0', transparent: true, opacity: 0.45 });
  for (const sx of [-0.55, 0.55]) { const c = new T.Mesh(new T.SphereGeometry(0.11, 8, 6), cheekMat); c.scale.set(1, 0.55, 0.3); c.position.set(sx, -0.02, 0.8); body.add(c); }
  if (mythic || (main.best && main.best.level >= 30)) {
    const crown = new T.Group(), gm = new T.MeshStandardMaterial({ color: '#ffcf40', metalness: 0.9, roughness: 0.2, emissive: '#3a2400' });
    crown.add(new T.Mesh(new T.CylinderGeometry(0.42, 0.46, 0.22, 12, 1, true), gm));
    for (let i = 0; i < 5; i++) {
      const sp = new T.Mesh(new T.ConeGeometry(0.09, 0.3, 5), gm);
      const a = (i / 5) * TAU; sp.position.set(Math.cos(a) * 0.43, 0.22, Math.sin(a) * 0.43); crown.add(sp);
      const gem = new T.Mesh(new T.OctahedronGeometry(0.05, 0), new T.MeshBasicMaterial({ color: hdr(['#ff3b6b', '#4fc3ff', '#7cff6a', '#b388ff', '#ffd54f'][i], 2.5) }));
      gem.position.set(Math.cos(a) * 0.46, 0.02, Math.sin(a) * 0.46); crown.add(gem);
    }
    crown.position.y = 1.15; slime.add(crown); P.crown = crown;
  }
  const auraRing = new T.Mesh(new T.RingGeometry(5.6, 6, 64), new T.MeshBasicMaterial({ color: hdr('#ffd54f', 1.6), transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
  auraRing.rotation.x = -Math.PI / 2; auraRing.visible = mythic; scene.add(auraRing);
  const blade = new T.Mesh(new T.TorusGeometry(2.1, 0.1, 6, 32, Math.PI * 0.9), new T.MeshBasicMaterial({ color: hdr('#9ff3ff', 2.6), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  blade.rotation.x = -Math.PI / 2; scene.add(blade);
  const vortex = new T.Mesh(new T.RingGeometry(0.5, 5, 48, 1, 0, TAU), new T.MeshBasicMaterial({ color: hdr('#7c4dff', 1.8), transparent: true, opacity: 0, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  vortex.rotation.x = -Math.PI / 2; scene.add(vortex);
  scene.add(slime);

  /* ------------------------------------------------------------ model kit */
  const BOX = new T.BoxGeometry(1, 1, 1);
  const GEO = {};
  const cap = (r, l) => GEO['c' + r + '_' + l] || (GEO['c' + r + '_' + l] = new T.CapsuleGeometry(r, l, 3, 8));
  const sph = (r, w, h) => GEO['s' + r + '_' + (w || 10)] || (GEO['s' + r + '_' + (w || 10)] = new T.SphereGeometry(r, w || 10, h || 8));
  const coneG = (r, h, n) => GEO['k' + r + '_' + h + '_' + (n || 6)] || (GEO['k' + r + '_' + h + '_' + (n || 6)] = new T.ConeGeometry(r, h, n || 6));
  function mesh(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
    m.castShadow = true; parent.add(m); return m;
  }
  function part(parent, mat, sx, sy, sz, x, y, z) { return mesh(parent, BOX, mat, x, y, z, 0, 0, 0, sx, sy, sz); }
  function pivot(parent, x, y, z) { const g = new T.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  const HPAL = {
    goblin: { skin: '#6d8a3a', cloth: '#5a4630', metal: '#8a8f98', eye: '#ffcf3a' },
    knight: { skin: '#2a2d36', cloth: '#4a1c26', metal: '#4d5361', eye: '#ff3b2f' },
    tyrant: { skin: '#7b6a52', cloth: '#5a2a1e', metal: '#6a5a48', eye: '#ff7a1a' },
  };
  function humanoid(kind, s) {
    const pal = HPAL[kind], root = new T.Group(), g = new T.Group(); g.scale.setScalar(s); root.add(g);
    const sk = std(pal.skin, 0.8), cl = std(pal.cloth, 0.95), mt = std(pal.metal, 0.32, 0.85), eye = new T.MeshBasicMaterial({ color: hdr(pal.eye, 3) });
    const armored = kind !== 'goblin';
    const legL = pivot(g, -0.2, 1.0, 0), legR = pivot(g, 0.2, 1.0, 0);
    for (const L of [legL, legR]) { mesh(L, cap(0.13, 0.6), armored ? mt : sk, 0, -0.44, 0); mesh(L, BOX, armored ? mt : cl, 0, -0.93, 0.07, 0, 0, 0, 0.26, 0.16, 0.38); }
    mesh(g, BOX, cl, 0, 1.06, 0, 0, 0, 0, 0.64, 0.3, 0.38);
    const torso = mesh(g, sph(0.42, 12, 10), armored ? mt : sk, 0, 1.52, 0, 0, 0, 0, 1.05, 1.12, 0.7);
    if (armored) {
      mesh(g, BOX, mt, 0, 1.55, 0.2, 0.08, 0, 0, 0.62, 0.62, 0.12);
      mesh(g, BOX, cl, 0, 0.82, 0.22, 0, 0, 0, 0.4, 0.7, 0.04);
      for (const sx of [-1, 1]) mesh(g, sph(0.24, 10, 8), mt, sx * 0.5, 1.9, 0, 0, 0, sx * 0.3, 1.25, 0.8, 1.2);
    } else {
      mesh(g, BOX, cl, 0, 1.45, 0, 0, 0, 0, 0.7, 0.55, 0.48);
      mesh(g, BOX, cl, 0, 0.82, 0.18, 0, 0, 0, 0.5, 0.45, 0.06);
    }
    const head = pivot(g, 0, 2.18, 0.02);
    mesh(head, sph(0.27, 12, 10), sk, 0, 0, 0, 0, 0, 0, 1, kind === 'goblin' ? 0.95 : 1.05, 1);
    if (kind === 'goblin') {
      for (const sx of [-1, 1]) mesh(head, coneG(0.09, 0.46), sk, sx * 0.33, 0.05, -0.02, 0, 0, -sx * 1.25);
      mesh(head, coneG(0.06, 0.2), sk, 0, -0.04, 0.3, 1.5, 0, 0);
      for (const sx of [-1, 1]) mesh(head, sph(0.05, 6, 5), eye, sx * 0.11, 0.06, 0.24);
      mesh(head, BOX, std('#e8e0c8', 0.6), 0, -0.15, 0.23, 0, 0, 0, 0.16, 0.04, 0.03);
    } else if (kind === 'knight') {
      mesh(head, new T.CylinderGeometry(0.3, 0.31, 0.46, 10), mt, 0, 0.04, 0);
      mesh(head, coneG(0.31, 0.28, 10), mt, 0, 0.4, 0);
      mesh(head, BOX, eye, 0, 0.04, 0.29, 0, 0, 0, 0.36, 0.05, 0.03);
      mesh(head, coneG(0.05, 0.5), cl, 0, 0.62, -0.05, -0.4, 0, 0);
    } else {
      for (const sx of [-1, 1]) { const hp = pivot(head, sx * 0.24, 0.16, 0); mesh(hp, coneG(0.09, 0.7), std('#e0d6c0', 0.5), sx * 0.2, 0.25, -0.05, -0.3, 0, -sx * 0.9); }
      for (const sx of [-1, 1]) mesh(head, sph(0.05, 6, 5), eye, sx * 0.1, 0.04, 0.25);
      mesh(head, BOX, std('#4a3a2a', 0.9), 0, -0.24, 0.12, 0.2, 0, 0, 0.32, 0.3, 0.16);
      const crownI = new T.CylinderGeometry(0.29, 0.29, 0.1, 10, 1, true);
      mesh(head, crownI, mt, 0, 0.2, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mesh(head, coneG(0.04, 0.16), mt, Math.cos(a) * 0.29, 0.3, Math.sin(a) * 0.29); }
    }
    const armL = pivot(g, -0.58, 1.9, 0), armR = pivot(g, 0.58, 1.9, 0);
    for (const A of [armL, armR]) { mesh(A, cap(kind === 'tyrant' ? 0.15 : 0.11, 0.55), armored ? mt : sk, 0, -0.38, 0); mesh(A, sph(0.12, 8, 6), armored ? mt : sk, 0, -0.78, 0); }
    let weapon;
    if (kind === 'tyrant') {
      weapon = pivot(armR, 0, -0.82, 0.1);
      mesh(weapon, new T.CylinderGeometry(0.06, 0.06, 2.6, 6), std('#3a2a1e', 0.9), 0, -1.1, 0);
      mesh(weapon, BOX, mt, 0, -2.45, 0, 0, 0, 0, 0.7, 0.45, 0.45);
      for (const sx of [-1, 1]) mesh(weapon, coneG(0.12, 0.35), mt, sx * 0.45, -2.45, 0, 0, 0, -sx * Math.PI / 2);
    } else if (kind === 'knight') {
      weapon = pivot(armR, 0, -0.82, 0.1);
      mesh(weapon, BOX, std('#c9a24a', 0.3, 0.9), 0, -0.05, 0, 0, 0, 0, 0.36, 0.06, 0.1);
      mesh(weapon, BOX, std('#c9ced8', 0.15, 1), 0, -0.95, 0, 0, 0, 0, 0.09, 1.7, 0.03);
    } else {
      weapon = pivot(armR, 0, -0.82, 0.1);
      mesh(weapon, cap(0.035, 0.3), std('#3a2a1e', 0.9), 0, -0.05, 0);
      mesh(weapon, BOX, mt, 0.06, -0.62, 0, 0, 0, 0, 0.22, 0.9, 0.04);
    }
    let cape = null;
    if (armored) {
      cape = pivot(g, 0, 1.98, -0.28);
      const cg = new T.PlaneGeometry(0.95, 1.55, 1, 4); cg.translate(0, -0.78, 0);
      mesh(cape, cg, std(pal.cloth, 0.95, 0, { side: T.DoubleSide }), 0, 0, 0);
    }
    return { root, g, legL, legR, armL, armR, torso, head, weapon, s, cape };
  }
  function wolfModel(pal) {
    pal = pal || { fur: '#4b4740', dark: '#2b2824', eye: '#ffcc33' };
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const fur = std(pal.fur, 0.95), dark = std(pal.dark, 0.95), eye = new T.MeshBasicMaterial({ color: hdr(pal.eye, 3) });
    mesh(g, cap(0.32, 0.85), fur, 0, 0.95, -0.05, Math.PI / 2, 0, 0);
    mesh(g, sph(0.42, 10, 8), dark, 0, 1.08, 0.45, 0, 0, 0, 1, 1.05, 1.05);
    const head = pivot(g, 0, 1.28, 0.88);
    mesh(head, sph(0.25, 10, 8), fur, 0, 0, 0, 0, 0, 0, 1, 0.9, 1.1);
    mesh(head, cap(0.11, 0.28), dark, 0, -0.06, 0.3, Math.PI / 2, 0, 0);
    mesh(head, sph(0.05, 6, 5), std('#080808', 0.3), 0, -0.02, 0.5);
    for (const sx of [-1, 1]) { mesh(head, coneG(0.08, 0.22, 4), fur, sx * 0.13, 0.25, -0.05, -0.2, 0, sx * 0.2); mesh(head, sph(0.04, 6, 5), eye, sx * 0.1, 0.05, 0.2); }
    const legs = [];
    for (const [x, z] of [[-0.2, 0.5], [0.2, 0.5], [-0.2, -0.5], [0.2, -0.5]]) { const l = pivot(g, x, 0.78, z); mesh(l, cap(0.075, 0.5), dark, 0, -0.35, 0); mesh(l, sph(0.09, 6, 5), dark, 0, -0.68, 0.04); legs.push(l); }
    const tail = pivot(g, 0, 1.1, -0.72); mesh(tail, cap(0.09, 0.55), fur, 0, 0, -0.32, Math.PI / 2, 0, 0);
    return { root, g, legs, tail, head, s: 1 };
  }
  function dragonModel() {
    const root = new T.Group(), g = new T.Group(); g.scale.setScalar(2.6); root.add(g);
    const sc = std('#3f4e66', 0.5, 0.3), belly = std('#a99a7a', 0.8), horn = std('#e0d8c6', 0.45), eye = new T.MeshBasicMaterial({ color: hdr('#9fd8ff', 4) });
    const mem = std('#5e3a46', 0.85, 0, { side: T.DoubleSide });
    mesh(g, cap(0.95, 2.1), sc, 0, 2.2, 0, Math.PI / 2, 0, 0);
    mesh(g, cap(0.72, 1.7), belly, 0, 1.78, 0.1, Math.PI / 2, 0, 0, 1, 1, 0.75);
    for (let i = 0; i < 7; i++) mesh(g, coneG(0.16, 0.55, 4), horn, 0, 3.15 - Math.abs(i - 2) * 0.05, 1.3 - i * 0.48, -0.3, 0, 0);
    const neck = pivot(g, 0, 2.6, 1.4);
    mesh(neck, cap(0.42, 0.9), sc, 0, 0.45, 0.45, 0.9, 0, 0);
    const head = pivot(neck, 0, 1.0, 1.15);
    mesh(head, sph(0.5, 12, 10), sc, 0, 0, 0, 0, 0, 0, 0.9, 0.72, 1.25);
    mesh(head, cap(0.28, 0.55), sc, 0, -0.08, 0.72, Math.PI / 2, 0, 0, 1, 1, 0.8);
    const jaw = pivot(head, 0, -0.22, 0.2); mesh(jaw, cap(0.22, 0.6), belly, 0, -0.05, 0.45, Math.PI / 2, 0, 0, 1, 1, 0.6);
    for (const sx of [-1, 1]) {
      mesh(head, coneG(0.1, 0.9, 5), horn, sx * 0.3, 0.32, -0.45, -2.3, 0, sx * 0.2);
      mesh(head, sph(0.07, 6, 5), eye, sx * 0.28, 0.12, 0.42);
    }
    const legs = [];
    for (const [x, z] of [[-0.8, 1.1], [0.8, 1.1], [-0.8, -1.1], [0.8, -1.1]]) { const l = pivot(g, x, 1.75, z); mesh(l, cap(0.3, 0.9), sc, 0, -0.75, 0); mesh(l, sph(0.32, 8, 6), sc, 0, -1.55, 0.12, 0, 0, 0, 1, 0.55, 1.3); legs.push(l); }
    const tail = pivot(g, 0, 2.15, -1.55); mesh(tail, cap(0.42, 1.0), sc, 0, 0, -0.7, Math.PI / 2, 0, 0);
    const tail2 = pivot(tail, 0, 0, -1.35); mesh(tail2, cap(0.3, 1.0), sc, 0, 0, -0.65, Math.PI / 2, 0, 0);
    const tail3 = pivot(tail2, 0, 0, -1.3); mesh(tail3, cap(0.18, 0.9), sc, 0, 0, -0.55, Math.PI / 2, 0, 0); mesh(tail3, coneG(0.35, 0.6, 4), horn, 0, 0, -1.2, -Math.PI / 2, 0, 0, 1, 1, 0.3);
    const wingGeo = new T.BufferGeometry();
    wingGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.6, 6, 0.8, -0.2, 5.2, 0, -2.6, 0, 0, 0.6, 5.2, 0, -2.6, 2.6, -0.2, -2.2, 0, 0, 0.6, 2.6, -0.2, -2.2, 0, 0, -1.2], 3));
    wingGeo.computeVertexNormals();
    const wingL = pivot(g, -0.75, 3.0, 0.4), wingR = pivot(g, 0.75, 3.0, 0.4);
    for (const [W, sx] of [[wingL, -1], [wingR, 1]]) {
      const m = mesh(W, wingGeo, mem, 0, 0, 0); m.scale.x = sx;
      mesh(W, cap(0.08, 5.6), horn, sx * 3, 0.42, 0.2, 0, 0, sx * (Math.PI / 2 - 0.13));
      mesh(W, cap(0.05, 2.8), horn, sx * 5.6, 0.4, -1.3, 0.25, 0, 0);
    }
    return { root, g, neck, head, jaw, legs, tail, tail2, tail3, wingL, wingR, s: 2.6 };
  }
  const TYPES = {
    soldier: { name: 'Soldato Goblin', hp: 90, r: 0.7, speed: 3.4, aggro: 16, runes: 40, build: () => humanoid('goblin', 1),
      attacks: [{ range: 2.4, windup: 0.55, active: 0.18, recover: 0.6, dmg: 45, reach: 2.6, arc: 1.4 }] },
    wolf: { name: 'Lupo Famelico', hp: 60, r: 0.7, speed: 6.5, aggro: 20, runes: 35, build: wolfModel,
      attacks: [{ range: 3.5, windup: 0.35, active: 0.25, recover: 0.5, dmg: 35, reach: 2.4, arc: 1.2, lunge: 11 }] },
    knight: { name: 'Cavaliere Oscuro', hp: 320, r: 0.9, speed: 2.8, aggro: 15, runes: 220, poise: 60, build: () => humanoid('knight', 1.25),
      attacks: [{ range: 3, windup: 0.8, active: 0.2, recover: 0.7, dmg: 80, reach: 3.3, arc: 1.6 }, { range: 3, windup: 0.5, active: 0.2, recover: 0.4, dmg: 55, reach: 3.2, arc: 1.2, combo: 2 }] },
    tyrant: { name: 'Gorvan, Tiranno Caduto', boss: true, hp: 3200, r: 1.8, speed: 4, aggro: 60, runes: 4000, poise: 400, build: () => humanoid('tyrant', 3),
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
  /* ------------------------------------------------------------ Mimetismo: player forms */
  const human = (() => {
    const root = new T.Group(), g = new T.Group(); root.add(g);
    const skin = std('#f3dccb', 0.7), coat = std('#f2f5fa', 0.55), trim = std('#d9b44a', 0.25, 0.9), dark = std('#1e2230', 0.6);
    const hair = std(ch.color || '#7fd4ff', 0.4), eye = new T.MeshBasicMaterial({ color: hdr('#ffcc33', 2.6) });
    const legL = pivot(g, -0.13, 0.95, 0), legR = pivot(g, 0.13, 0.95, 0);
    for (const L of [legL, legR]) { mesh(L, cap(0.085, 0.62), dark, 0, -0.42, 0); mesh(L, BOX, dark, 0, -0.88, 0.05, 0, 0, 0, 0.17, 0.14, 0.3); mesh(L, BOX, trim, 0, -0.8, 0.05, 0, 0, 0, 0.18, 0.03, 0.31); }
    mesh(g, BOX, dark, 0, 1.0, 0, 0, 0, 0, 0.36, 0.2, 0.22);
    const torso = mesh(g, cap(0.19, 0.32), coat, 0, 1.38, 0, 0, 0, 0, 1.3, 1, 0.85);
    mesh(g, new T.CylinderGeometry(0.27, 0.44, 0.62, 12, 1, true), std('#f2f5fa', 0.55, 0, { side: T.DoubleSide }), 0, 0.9, 0);
    mesh(g, new T.CylinderGeometry(0.255, 0.27, 0.06, 12), trim, 0, 1.18, 0);
    mesh(g, new T.CylinderGeometry(0.12, 0.16, 0.1, 10), trim, 0, 1.66, 0);
    mesh(g, BOX, trim, 0, 1.38, 0.17, 0, 0, 0, 0.04, 0.42, 0.02);
    const coatTail = pivot(g, 0, 1.12, -0.2);
    const ctg = new T.PlaneGeometry(0.5, 0.7, 1, 3); ctg.translate(0, -0.35, 0);
    mesh(coatTail, ctg, std('#f2f5fa', 0.55, 0, { side: T.DoubleSide }), 0, 0, 0);
    const head = pivot(g, 0, 1.9, 0);
    mesh(head, sph(0.2, 16, 12), skin, 0, 0, 0, 0, 0, 0, 0.95, 1.08, 0.98);
    mesh(head, sph(0.225, 16, 12), hair, 0, 0.06, -0.035, 0, 0, 0, 1.05, 1, 1.05);
    for (let i = 0; i < 5; i++) mesh(head, coneG(0.055, 0.2, 4), hair, -0.12 + i * 0.06, 0.12, 0.16, 2.9, 0, (i - 2) * 0.12);
    for (const sx of [-1, 1]) { mesh(head, cap(0.04, 0.3), hair, sx * 0.17, -0.08, 0.06); mesh(head, sph(0.035, 8, 6), eye, sx * 0.075, 0.0, 0.185, 0, 0, 0, 1, 1.25, 0.5); }
    const hairP = pivot(head, 0, 0.06, -0.14);
    mesh(hairP, cap(0.12, 0.5), hair, 0, -0.32, -0.02, 0, 0, 0, 1.55, 1, 0.8);
    const armL = pivot(g, -0.3, 1.62, 0), armR = pivot(g, 0.3, 1.62, 0);
    for (const A of [armL, armR]) { mesh(A, cap(0.07, 0.48), coat, 0, -0.3, 0); mesh(A, BOX, trim, 0, -0.52, 0, 0, 0, 0, 0.16, 0.04, 0.16); mesh(A, sph(0.065, 8, 6), skin, 0, -0.62, 0); }
    const sword = pivot(armR, 0, -0.66, 0.04);
    mesh(sword, BOX, trim, 0, 0, 0, 0, 0, 0, 0.3, 0.05, 0.09);
    mesh(sword, cap(0.03, 0.18), dark, 0, 0.14, 0);
    const bl = mesh(sword, BOX, new T.MeshBasicMaterial({ color: hdr('#9ff3ff', 1.8) }), 0, -0.8, 0, 0, 0, 0, 0.07, 1.5, 0.025);
    mesh(sword, coneG(0.05, 0.16, 4), bl.material, 0, -1.62, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.35);
    if (mythic) {
      const gm = new T.MeshStandardMaterial({ color: '#ffcf40', metalness: 0.9, roughness: 0.2, emissive: '#3a2400' });
      const crown = mesh(head, new T.CylinderGeometry(0.2, 0.22, 0.09, 12, 1, true), gm, 0, 0.27, -0.02);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; mesh(crown, coneG(0.04, 0.14, 4), gm, Math.cos(a) * 0.21, 0.1, Math.sin(a) * 0.21); }
    }
    root.visible = false; scene.add(root);
    return { root, g, legL, legR, armL, armR, head, sword, blade: bl, torso, hair: hairP, tail: coatTail };
  })();
  const wolfForm = (() => {
    const m = wolfModel({ fur: '#2c3f5e', dark: '#1a2236', eye: '#8ec5ff' });
    const glow = new T.MeshBasicMaterial({ color: hdr('#6aa8ff', 2.2) });
    for (let i = 0; i < 4; i++) mesh(m.g, BOX, glow, 0, 1.28, 0.5 - i * 0.35, 0, 0, 0, 0.05, 0.04, 0.22);
    mesh(m.head, coneG(0.05, 0.35, 4), std('#dfe8ff', 0.3, 0.6), 0, 0.28, 0.12, -0.4, 0, 0);
    m.root.scale.setScalar(1.35);
    m.root.visible = false; scene.add(m.root);
    return m;
  })();
  const FORM_NAMES = { slime: 'Slime', human: 'Forma Umana', wolf: 'Lupo Tempesta' };
  const FORM = { slime: { speed: 1, dmg: 1, reach: 0, cam: 1.4 }, human: { speed: 1.08, dmg: 1.3, reach: 0.9, cam: 1.8 }, wolf: { speed: 1.55, dmg: 1.1, reach: -0.2, cam: 1.5 } };
  const pillarGeo = new T.CylinderGeometry(1.2, 1.6, 30, 24, 1, true);
  function lightPillar(x, z, color, life) {
    const m = new T.Mesh(pillarGeo, new T.MeshBasicMaterial({ color: hdr(color, 2.2), transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
    m.position.set(x, heightAt(x, z) + 15, z); scene.add(m);
    fx.push({ kind: 'pillar', m, t: life || 0.9, max: life || 0.9 });
  }
  function transform() {
    const list = ['slime', 'human', 'wolf', 'dragon'].filter((f) => S.forms[f] && FORM[f]);
    const next = list[(list.indexOf(P.form) + 1) % list.length];
    if (next === P.form || P.atk || P.roll > 0) return;
    P.form = next; P.formFx = 0.5;
    const gy = heightAt(P.x, P.z);
    emit(P.x, gy + 1.2, P.z, 70, next === 'human' ? '#bfefff' : next === 'wolf' ? '#6aa8ff' : '#4fc3ff', { speed: 6, up: 2, grav: 0, life: 1.2 });
    shockwave(P.x, P.z, 4, 0, '#bfefff');
    flashLight.color.set('#bfefff'); flashLight.intensity = 50; flashLight.position.set(P.x, gy + 3, P.z);
    sfx('skillGet'); oracle('《Mimetismo: ' + FORM_NAMES[next] + '》');
    lightPillar(P.x, P.z, next === 'wolf' ? '#6aa8ff' : '#bfefff');
  }

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
    hook('onSpawn', e);
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
    hook('populate');
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
    const curve = new T.CatmullRomCurve3(pts);
    const col = new T.Color(color || '#c9a0ff');
    const l = new T.Mesh(new T.TubeGeometry(curve, 24, 0.09, 4), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(3.2), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    const core = new T.Mesh(new T.TubeGeometry(curve, 24, 0.035, 3), new T.MeshBasicMaterial({ color: new T.Color(4, 4, 4), transparent: true, depthWrite: false }));
    l.add(core);
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
      } else if (f.kind === 'pillar') {
        f.t -= dt; const k = f.t / f.max; f.m.material.opacity = 0.8 * k; f.m.scale.set(1 + (1 - k) * 0.6, 1, 1 + (1 - k) * 0.6); f.m.rotation.y += dt * 2;
        if (f.t <= 0) { scene.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); }
      } else if (f.kind === 'line') {
        f.t -= dt; f.m.material.opacity = f.t / 0.3; f.m.children[0].material.opacity = f.t / 0.3;
        if (f.t <= 0) { scene.remove(f.m); f.m.geometry.dispose(); f.m.children[0].geometry.dispose(); fx.splice(i, 1); }
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
  const KEYS = { KeyT: 'form', ShiftLeft: 'run', KeyM: 'map', KeyJ: 'light', KeyK: 'heavy', Space: 'roll', KeyQ: 'lock', KeyR: 'flask', KeyE: 'interact', KeyF: 'skill', KeyG: 'absorb', Escape: 'pause', KeyP: 'pause' };
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
    if (joy.id >= 0 && e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.42 && performance.now() - (joy.t || 0) > 250) { joy.id = -1; } // stale joystick: take over
    if (e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.42 && joy.id < 0) {
      joy.t = performance.now();
      joy.id = e.pointerId; joy.ox = joy.x = e.clientX; joy.oy = joy.y = e.clientY;
      joyEl.style.display = 'block'; joyEl.style.left = joy.ox + 'px'; joyEl.style.top = joy.oy + 'px';
    } else if (look.id < 0) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; look.moved = 0; }
    view.setPointerCapture(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; joy.t = performance.now(); }
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
  window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
  const resetInput = () => { input.keys = {}; joy.id = -1; look.id = -1; joyEl.style.display = 'none'; };
  window.addEventListener('blur', resetInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetInput(); });
  view.addEventListener('contextmenu', (e) => { e.preventDefault(); press('heavy'); });
  // on-screen buttons
  const touchEl = $('touch');
  const BTN = [['light', 'Attacco', 66, 96, 34, 'big'], ['heavy', 'Colpo<br>pesante', 140, 60, 26], ['roll', 'Schiva', 140, 140, 28],
    ['skill', 'Fulmine<br>Nero', 66, 178, 24], ['absorb', 'Preda-<br>tore', 214, 104, 24], ['flask', 'Cura', 28, 252, 21], ['lock', 'Mira', 214, 178, 21], ['run', 'Corri', 214, 36, 21], ['form', 'Mime-<br>tismo', 140, 220, 23]];
  const buttons = {};
  function addButton(k, label, rx, by, r, cls) {
    const b = document.createElement('div');
    b.className = 'tbtn' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    Object.assign(b.style, { width: r * 2 + 'px', height: r * 2 + 'px', right: `calc(${rx - r}px + env(safe-area-inset-right))`, bottom: by - r + 'px' });
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); press(k); b.classList.add('on'); try { SK.Audio.init(); SK.Audio.resume(); } catch (er) { /* ignore */ } SK.vibrate(10); });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off);
    touchEl.appendChild(b); buttons[k] = b;
    return b;
  }
  for (const [k, label, rx, by, r, cls] of BTN) addButton(k, label, rx, by, r, cls);
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
  // Oracle: analytical inner voice, typewriter + queue
  const ORC = { q: [], cur: null, i: 0, t: 0, hold: 0, el: $('oracle'), txt: $('oracle').querySelector('.txt') };
  function oracle(text, gold) {
    if (ORC.cur && ORC.cur.text === text) return;
    if (ORC.q.length > 4) ORC.q.shift();
    ORC.q.push({ text, gold });
  }
  function updateOracle(dt) {
    if (!ORC.cur) {
      if (!ORC.q.length) return;
      ORC.cur = ORC.q.shift(); ORC.i = 0; ORC.t = 0; ORC.hold = 0;
      ORC.el.className = 'show' + (ORC.cur.gold ? ' gold' : ''); ORC.txt.textContent = ''; sfx('oracle');
    }
    const c = ORC.cur;
    if (ORC.i < c.text.length) {
      ORC.t += dt * 42;
      while (ORC.t >= 1 && ORC.i < c.text.length) { ORC.t -= 1; ORC.i++; }
      ORC.txt.textContent = c.text.slice(0, ORC.i);
    } else {
      ORC.hold += dt;
      if (ORC.hold > 2.2 + c.text.length * 0.025) { ORC.el.className = ''; ORC.cur = null; }
    }
  }
  // floating damage numbers (pooled DOM)
  const DMG = [], dmgLayer = $('dmg'), tmpV3 = new T.Vector3();
  for (let i = 0; i < 28; i++) { const d = document.createElement('div'); d.style.display = 'none'; dmgLayer.appendChild(d); DMG.push({ el: d, t: 0 }); }
  let dmgI = 0;
  function dmgNum(x, y, z, val, cls) {
    const o = DMG[dmgI++ % DMG.length];
    o.x = x + rand(-0.4, 0.4); o.y = y; o.z = z + rand(-0.4, 0.4); o.t = 0.9; o.vy = 2.2;
    o.el.className = cls || ''; o.el.textContent = typeof val === 'number' ? Math.round(val) : val; o.el.style.display = 'block';
    o.el.style.fontSize = (cls === 'crit' ? 22 : 15) + 'px';
  }
  function updateDmg(dt) {
    for (const o of DMG) {
      if (o.t <= 0) continue;
      o.t -= dt; o.y += o.vy * dt; o.vy *= 0.95;
      if (o.t <= 0) { o.el.style.display = 'none'; continue; }
      tmpV3.set(o.x, o.y, o.z).project(camera);
      if (tmpV3.z > 1) { o.el.style.display = 'none'; continue; }
      const pop = o.t > 0.75 ? 1 + (o.t - 0.75) * 3 : 1;
      o.el.style.display = 'block';
      o.el.style.transform = `translate(${((tmpV3.x + 1) / 2) * innerWidth}px, ${((1 - tmpV3.y) / 2) * innerHeight}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
      o.el.style.left = '0px'; o.el.style.top = '0px'; o.el.style.opacity = Math.min(1, o.t * 3).toFixed(2);
    }
  }
  // compass
  const compassEl = $('compass'), CMP = [];
  for (let i = 0; i < 26; i++) { const e = document.createElement('i'); compassEl.appendChild(e); CMP.push(e); }
  const CARD = [['N', Math.PI], ['NE', Math.PI * 0.75], ['E', Math.PI / 2], ['SE', Math.PI / 4], ['S', 0], ['SO', -Math.PI / 4], ['O', -Math.PI / 2], ['NO', -Math.PI * 0.75]];
  function updateCompass() {
    const fwd = input.yaw + Math.PI;
    let n = 0;
    const put = (ang, text, cls) => {
      if (n >= CMP.length) return;
      const rel = angDiff(fwd, ang);
      if (Math.abs(rel) > Math.PI * 0.45) return;
      const e = CMP[n++];
      e.style.display = 'block'; e.className = cls; if (e.textContent !== text) e.textContent = text;
      e.style.left = (50 - (rel / (Math.PI * 0.45)) * 50).toFixed(2) + '%';
    };
    for (const [t, a] of CARD) put(a, t, t.length > 1 ? 'd' : '');
    const mk = (x, z) => Math.atan2(x - P.x, z - P.z);
    graceObjs.forEach((g, i) => { if (S.found[i] && Math.hypot(g.x - P.x, g.z - P.z) > 8) put(mk(g.x, g.z), '✦', 'g'); });
    if (!S.bosses.tyrant) put(mk(LOC.arena.x, LOC.arena.z), '☠', 'b');
    if (!S.bosses.dragon) put(mk(LOC.dragon.x, LOC.dragon.z), '☠', 'b');
    if (S.stain) put(mk(S.stain.x, S.stain.z), '◆', 'c');
    for (const m of API.compassMarkers || []) put(mk(m.x, m.z), m.label || '•', 'g');
    for (let i = n; i < CMP.length; i++) CMP[i].style.display = 'none';
  }
  // ability bar
  const abilEl = $('abil'), abilName = $('abilname');
  let abilKey = '';
  const FALLBACK_AB = { owned: () => ['black_lightning'], selected: () => 'black_lightning', select() {}, cooldown: () => 0, cost: () => 30,
    defs: { black_lightning: { name: 'Fulmine Nero', icon: 'ϟ', color: '#b388ff' } } };
  function updateAbilBar() {
    const AB = API.abilities || FALLBACK_AB;
    let owned = []; try { owned = AB.owned() || []; } catch (e) { owned = []; }
    const key = owned.join(',');
    if (key !== abilKey) {
      abilKey = key; abilEl.innerHTML = '';
      owned.forEach((id, i) => {
        const d = AB.defs[id] || { name: id, icon: '?', color: '#fff' };
        const sl = document.createElement('div'); sl.className = 'sl'; sl.dataset.id = id;
        sl.innerHTML = `<em>${i + 1}</em><span style="color:${d.color};text-shadow:0 0 8px ${d.color}">${d.icon || '✦'}</span><div class="cd"></div><small>${AB.cost(id) || ''}</small>`;
        sl.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); AB.select(id); sfx('select'); });
        abilEl.appendChild(sl);
      });
    }
    const sel = AB.selected();
    for (const sl of abilEl.children) {
      const id = sl.dataset.id, cd = AB.cooldown(id) || 0, low = (AB.cost(id) || 0) > P.fp;
      sl.classList.toggle('cur', id === sel); sl.classList.toggle('lowfp', low);
      sl.querySelector('.cd').style.background = cd > 0 ? `conic-gradient(rgba(0,0,0,.72) ${(cd * 360).toFixed(0)}deg, transparent 0)` : 'none';
    }
    const d = AB.defs[sel];
    const label = d ? `${d.name}  ·  ${AB.cost(sel) || 0} FP` : '';
    if (abilName.textContent !== label) abilName.textContent = label;
  }
  const FORM_ICON = { slime: '💧', human: '⚔️', wolf: '🐺', dragon: '🐉' };
  const runesEl = $('runes');
  let hudLast = {};
  function setText(el, key, txt) { if (hudLast[key] !== txt) { hudLast[key] = txt; el.textContent = txt; } }
  function hud() {
    const W = (v) => Math.min(26, 10 + v / 60) + 'vw';
    $('hp').style.width = W(P.maxHp); $('fp').style.width = W(P.maxFp); $('st').style.width = W(P.maxSt * 2);
    $('hp').querySelector('i').style.width = (100 * Math.max(0, P.hp) / P.maxHp) + '%'; $('hp').querySelector('b').style.width = (100 * Math.max(0, P.hp) / P.maxHp) + '%';
    $('fp').querySelector('i').style.width = (100 * P.fp / P.maxFp) + '%'; $('fp').querySelector('b').style.width = (100 * P.fp / P.maxFp) + '%';
    $('st').querySelector('i').style.width = (100 * Math.max(0, P.st) / P.maxSt) + '%';
    setText($('hp').querySelector('span'), 'hp', `${Math.max(0, Math.ceil(P.hp))} / ${P.maxHp}`);
    setText($('fp').querySelector('span'), 'fp', `${Math.floor(P.fp)} / ${P.maxFp}`);
    const pt = $('portrait');
    const pk = (FORM_ICON[P.form] || '💧') + S.level;
    if (hudLast.portrait !== pk) { hudLast.portrait = pk; pt.innerHTML = `${FORM_ICON[P.form] || '💧'}<b>${S.level}</b>`; }
    setText($('flask'), 'flask', `⚗ Gelatina Cremisi ×${P.flasks}${mythic ? '   ·   ♛ Imperatore Infinito' : ''}${P.sprint ? '   ·   » Corsa' : ''}`);
    const rn = `${Math.floor(S.runes).toLocaleString('it-IT')}`;
    if (hudLast.runes !== rn) { hudLast.runes = rn; runesEl.innerHTML = `${rn} <small>anime</small>`; }
    const hh = Math.floor((DAY.t * 24 + 6) % 24), mm = Math.floor(((DAY.t * 24 + 6) % 1) * 60 / 10) * 10;
    setText($('tod'), 'tod', `${REGIONS[curRegion].name}  ·  ${hh >= 6 && hh < 19 ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    const boss = enemies.find((e) => e.d.boss && e.engaged && !e.dead);
    $('boss').style.display = boss ? 'block' : 'none';
    if (boss) {
      setText($('boss').querySelector('.name'), 'boss', boss.d.name + (boss.phase > 1 ? '  ✦' : ''));
      $('boss').querySelector('i').style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + '%';
      $('boss').querySelector('b').style.width = (100 * Math.max(0, boss.hp) / boss.maxHp) + '%';
    }
    const ret = $('reticle'), lk = $('locked');
    if (input.lock && !input.lock.dead) {
      const v = tmpV3.set(input.lock.x, input.lock.y + (input.lock.d.boss ? 4 : 1.4), input.lock.z).project(camera);
      const vis = v.z < 1;
      ret.style.display = lk.style.display = vis ? 'block' : 'none';
      const sx = ((v.x + 1) / 2) * innerWidth, sy = ((1 - v.y) / 2) * innerHeight;
      ret.style.left = sx + 'px'; ret.style.top = sy + 'px';
      lk.style.left = sx + 'px'; lk.style.top = (sy - 14) + 'px';
      if (!input.lock.d.boss) setText(lk, 'lock', input.lock.d.name); else lk.style.display = 'none';
    } else { ret.style.display = 'none'; lk.style.display = 'none'; }
    updateCompass();
    updateAbilBar();
    hook('hud');
  }

  /* ------------------------------------------------------------ combat */
  function hurtPlayer(dmg, fx0, fz0) {
    if (P.dead || P.iframe > 0 || state !== 'play') return;
    dmg = chain('onHurt', dmg, fx0, fz0);
    if (SK.debug.godmode) dmg = 0;
    P.hp -= dmg; P.hitFlash = 0.25; P.stun = 0.35; P.atk = null;
    if (dmg > 0) dmgNum(P.x, heightAt(P.x, P.z) + P.y + 2.2, P.z, dmg, 'pl');
    const a = Math.atan2(P.x - fx0, P.z - fz0);
    P.vx = Math.sin(a) * 9; P.vz = Math.cos(a) * 9;
    shake = 0.5; sfx('hurt'); SK.vibrate(40);
    emit(P.x, heightAt(P.x, P.z) + P.y + 1, P.z, 18, '#ff5252', { speed: 6 });
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
    dmgNum(e.x, e.y + (e.d.boss ? 5.5 : 2.2), e.z, dmg, crit ? 'crit' : '');
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
    e.absorbed = !!absorbed;
    if (absorbed && e.type === 'wolf' && !S.forms.wolf) { S.forms.wolf = true; setTimeout(() => oracle('《Analisi completata. Mimetismo acquisito: Lupo Tempesta》', true), 1200); }
    hook('onKill', e, !!absorbed, gain);
    if (e.d.boss) {
      S.bosses[e.type] = true;
      main.souls = (main.souls || 0) + 100; main.totalSouls = (main.totalSouls || 0) + 100; SK.save.write();
      fogWall.visible = false;
      setTimeout(() => { bigMsg('NEMICO ABBATTUTO', 'gold', 4); sfx('victory'); music('forest'); }, 900);
      setTimeout(() => toast(`+${gain.toLocaleString('it-IT')} anime · +100 Anime al regno principale`), 3200);
      if (S.bosses.tyrant && S.bosses.dragon) setTimeout(() => { bigMsg('SIGNORE DELLE TERRE SPEZZATE', 'gold', 5); }, 6000);
    } else if (absorbed) oracle('《Essenza assimilata. Potere +2%》');
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
    const F = FORM[P.form], a = P.atk, reach = (a.heavy ? 4 : 3.2) + F.reach, arc = a.heavy ? Math.PI : 1.2;
    const base = chain('onMelee', (a.heavy ? 70 : [32, 36, 48][P.combo]) * P.dmg * F.dmg, a);
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
    blade.position.set(P.x, heightAt(P.x, P.z) + P.y + 1, P.z); blade.rotation.z = -P.rot + Math.PI * 0.05 + (P.combo % 2 ? 0.4 : -0.4);
    emit(P.x + Math.sin(P.rot) * 2, heightAt(P.x, P.z) + P.y + 1, P.z + Math.cos(P.rot) * 2, any ? 10 : 6, '#9ff3ff', { speed: 5 });
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
    let px = P.x, py = heightAt(P.x, P.z) + P.y + 1.5, pz = P.z;
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
    vortex.position.set(P.x, heightAt(P.x, P.z) + P.y + 0.2, P.z); vortex.rotation.z += dt * 8; vortex.material.opacity = 0.55;
    if (Math.random() < 0.6) {
      const a = rand(0, TAU), r = rand(3, 6);
      parts.push({ x: P.x + Math.cos(a) * r, y: heightAt(P.x, P.z) + P.y + 0.6, z: P.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 2, vy: 0, vz: -Math.sin(a) * r * 2, life: 0.45, max: 0.45, r: 1.4, g: 0.8, b: 2.6, grav: 0, size: 0.35 });
    }
    for (const e of enemies) {
      if (e.dead || e.d.boss) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d < 6) {
        const a = Math.atan2(P.x - e.x, P.z - e.z);
        e.vx += Math.sin(a) * dt * 20; e.vz += Math.cos(a) * dt * 20;
        if (e.hp < e.maxHp * 0.3 || (mythic && e.hp < e.maxHp * 0.6)) {
          if (e.type === 'wolf' && !S.forms.wolf) { S.forms.wolf = true; setTimeout(() => oracle('《Analisi completata. Mimetismo acquisito: Lupo Tempesta》', true), 1200); } killEnemy(e, true); S.essences++; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.15); recalc(false); sfx('absorb');
        }
      }
    }
  }
  function drinkFlask() {
    if (P.flasks <= 0) { toast('Nessuna Gelatina rimasta'); return; }
    if (P.atk || P.roll > 0) return;
    P.flasks--; dmgNum(P.x, heightAt(P.x, P.z) + 2.2, P.z, '+' + Math.round(Math.min(P.maxHp - P.hp, P.maxHp * 0.55)), 'heal'); P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.55); sfx('heal');
    emit(P.x, heightAt(P.x, P.z) + P.y + 1, P.z, 24, '#ff6b6b', { speed: 2, up: 3, grav: 0 });
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
      if (pr.skill && !P.atk) { if (API.castSkill) API.castSkill(); else castLightning(); }
      if (pr.absorb) startAbsorb();
      if (pr.flask) drinkFlask();
    }
    if (pr.lock) toggleLock();
    if (pr.form) transform();
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
      if (running) { P.st -= dt * (P.form === 'wolf' ? 3 : 9); P.stCd = 0.5; if (Math.random() < dt * 20) emit(P.x, heightAt(P.x, P.z) + 0.2, P.z, 1, '#d8c39a', { speed: 1.5, up: 1 }); }
      const sp = 7 * FORM[P.form].speed * (P.absorb > 0 ? 0.5 : 1) * (mythic ? 1.25 : 1) * (running ? 1.85 : 1);
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
    const R = Math.hypot(P.x, P.z); if (R > MAPR - 5 && !(API.pocket && API.pocket.contains(P.x, P.z))) { P.x *= (MAPR - 5) / R; P.z *= (MAPR - 5) / R; }
    if (fogWall.visible) {
      const dx = P.x - LOC.arena.x, dz = P.z - LOC.arena.z, d = Math.hypot(dx, dz), m = LOC.arena.r - 1;
      if (d > m) { P.x = LOC.arena.x + (dx / d) * m; P.z = LOC.arena.z + (dz / d) * m; }
    }
    // vertical (jump for heavy attack)
    P.vy -= 30 * dt; P.y = Math.max(0, P.y + P.vy * dt); if (P.y === 0) P.vy = 0;
    const gy = heightAt(P.x, P.z);
    updateAbsorb(dt);

    // form visuals
    const sp = Math.hypot(P.vx, P.vz), t = performance.now() / 1000;
    slime.visible = P.form === 'slime'; human.root.visible = P.form === 'human'; wolfForm.root.visible = P.form === 'wolf';
    P.formFx = Math.max(0, P.formFx - dt);
    const pop = 1 + Math.sin(Math.min(1, P.formFx * 2) * Math.PI) * 0.25;
    if (P.form === 'human') {
      const h = human, k = P.atk ? P.atk.t / P.atk.dur : 0, walk = sp > 1 ? Math.sin(t * (sp > 9 ? 14 : 10)) * Math.min(1, sp / 7) : 0;
      h.root.position.set(P.x, gy + P.y, P.z); h.root.rotation.y = P.rot; h.root.scale.setScalar(pop);
      h.legL.rotation.x = walk * 0.8; h.legR.rotation.x = -walk * 0.8; h.armL.rotation.x = -walk * 0.6;
      if (P.atk) {
        if (P.atk.heavy) { h.g.rotation.y = k * TAU; h.armR.rotation.x = -1.5; h.armR.rotation.z = 0; }
        else { const dir = P.combo % 2 ? -1 : 1; h.g.rotation.y = 0; h.armR.rotation.x = -1.4; h.armR.rotation.z = lerp(1.6 * dir, -1.4 * dir, Math.min(1, k * 2.2)); }
      } else { h.g.rotation.y = 0; h.armR.rotation.x = walk * 0.5 - 0.15; h.armR.rotation.z = 0; }
      h.g.rotation.x = P.roll > 0 ? (1 - P.roll / 0.45) * TAU : 0; h.g.position.y = P.roll > 0 ? 0.3 : Math.abs(walk) * 0.05;
      h.blade.material.color.setRGB(P.atk ? 3.4 : 1.1, P.atk ? 4.2 : 2.6, P.atk ? 4.4 : 2.9);
      h.hair.rotation.x = 0.12 + Math.min(0.7, sp * 0.07) + Math.sin(t * 4) * 0.04; h.tail.rotation.x = 0.1 + Math.min(0.9, sp * 0.09) + Math.sin(t * 5) * 0.05;
    } else if (P.form === 'wolf') {
      const w = wolfForm, gal = sp > 1 ? t * (sp > 9 ? 18 : 13) : 0;
      w.root.position.set(P.x, gy + P.y, P.z); w.root.rotation.y = P.rot; w.root.scale.setScalar(1.35 * pop);
      w.legs.forEach((l, i) => { l.rotation.x = sp > 1 ? Math.sin(gal + (i % 2) * Math.PI + (i > 1 ? 1 : 0)) * 0.9 : 0; });
      w.tail.rotation.x = 0.5 + Math.sin(t * 8) * 0.2; w.g.rotation.x = P.atk ? -Math.sin(P.atk.t / P.atk.dur * Math.PI) * 0.4 : 0;
      if (sp > 9 && Math.random() < dt * 25) emit(P.x, gy + 0.6, P.z, 1, '#8ec5ff', { speed: 1, up: 1, grav: 0 });
    }
    slime.position.set(P.x, gy + P.y + 0.85, P.z);
    slime.rotation.y = P.rot;
    let sx = 1 + Math.sin(t * 3) * 0.03, syv = 1 - Math.sin(t * 3) * 0.03;
    if (sp > 1) { const b = Math.abs(Math.sin(t * 12)) * 0.12; syv -= b; sx += b * 0.6; slime.position.y += Math.abs(Math.sin(t * 12)) * 0.25; }
    if (P.roll > 0) { syv = 0.6; sx = 1.3; body.rotation.x += dt * 20; } else body.rotation.x = lerp(body.rotation.x % TAU, 0, dt * 10);
    if (P.atk) { const k = P.atk.t / P.atk.dur; sx += Math.sin(k * Math.PI) * 0.25; syv -= Math.sin(k * Math.PI) * 0.15; }
    if (P.absorb > 0) { sx = 1.25 + Math.sin(t * 30) * 0.05; syv = 0.85; }
    // blink, mouth, rest glow, dust
    P.blinkT = (P.blinkT || 3) - dt;
    const blink = P.blinkT < 0.12 ? 0.12 : 1; if (P.blinkT < 0) P.blinkT = rand(2.2, 5);
    for (const e of slimeEyes) e.scale.y = lerp(e.scale.y, 1.3 * blink * (P.hitFlash > 0 ? 0.4 : 1), Math.min(1, dt * 30));
    const mOpen = P.absorb > 0 ? 1 : P.atk ? 0.55 : 0.18;
    mouth.scale.set(lerp(mouth.scale.x, P.absorb > 0 ? 2.2 : 1, dt * 12), lerp(mouth.scale.y, mOpen, dt * 14), 0.35);
    if (P.restT > 0) { P.restT -= dt; syv *= 0.7; sx *= 1.18; if (Math.random() < 0.6) emit(P.x + rand(-1, 1), gy + 0.3, P.z + rand(-1, 1), 1, '#ffd36b', { speed: 0.3, up: 2.5, grav: -1, life: 1.4 }); }
    P.dustT = (P.dustT || 0) - dt;
    if (sp > 4.5 && P.y === 0 && P.dustT <= 0) { P.dustT = sp > 10 ? 0.07 : 0.16; emit(P.x - Math.sin(P.rot) * 0.6, gy + 0.15, P.z - Math.cos(P.rot) * 0.6, 2, curRegion === 'north' ? '#e8f0ff' : '#b8a37a', { speed: 1.2, up: 1, grav: 1, life: 0.6, size: 0.6, bright: 0.45 }); }
    body.scale.set(sx * pop, syv * pop, sx * pop);
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
        oracle('《Sentenza Imperiale.》', true);
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
      if (e.absorbed) { // spiral into the Predatore's mouth
        const k = Math.min(1, e.deadT / 0.7), py = heightAt(P.x, P.z) + P.y + 0.9, ang = e.deadT * 14, rad = (1 - k) * 2.2;
        m.root.position.set(lerp(e.x, P.x, k * k) + Math.cos(ang) * rad, lerp(e.y, py, k) + Math.sin(k * Math.PI) * 1.4, lerp(e.z, P.z, k * k) + Math.sin(ang) * rad);
        m.root.rotation.y += dt * 20; m.root.scale.setScalar(Math.max(0.01, (1 - k) * (e.scale0 || 1)));
        if (Math.random() < 0.6) emit(m.root.position.x, m.root.position.y, m.root.position.z, 1, '#b388ff', { speed: 1, grav: 0, size: 0.5 });
        if (k >= 1) m.root.visible = false;
        return;
      }
      const k = Math.min(1, e.deadT / 0.45), quad = !!(m.legs && !m.legL);
      if (quad) m.g.rotation.z = k * Math.PI / 2; else m.g.rotation.x = -k * Math.PI / 2 * (d.boss ? 0.9 : 1);
      if (e.deadT > 0.7) {
        const s2 = Math.max(0.01, 1 - (e.deadT - 0.7) * 0.9);
        m.root.position.y = e.y - (e.deadT - 0.7) * (d.boss ? 1.2 : 0.8); m.root.scale.setScalar(s2 * (e.scale0 || 1));
        if (Math.random() < 0.7) emit(e.x + rand(-1, 1) * d.r, e.y + rand(0.2, 1.5) * (d.boss ? 3 : 1), e.z + rand(-1, 1) * d.r, 1, '#ffd36b', { speed: 0.6, up: 1.5, grav: -1, life: 1.2 });
      }
      if (e.deadT > 1.8) m.root.visible = false;
      return;
    }
    if (d.update && d.update(e, dt, API)) return;
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.cd -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    if (e.passive) { e.engaged = false; }
    else if (!e.engaged && dist < d.aggro && !P.dead) {
      if (d.boss && e.type === 'tyrant' && Math.hypot(P.x - LOC.arena.x, P.z - LOC.arena.z) > LOC.arena.r - 2) { /* wait inside the arena */ }
      else {
        e.engaged = true;
        if (d.boss) {
          if (e.type === 'tyrant') fogWall.visible = true;
          music(e.type === 'dragon' ? 'finalboss' : 'boss'); sfx('bossRoar'); bigMsg(d.name, 'place', 3);
          if (!e.introDone) { e.introDone = true; cine = { e, t: 0, dur: 3.2 }; state = 'cine'; input.lock = e; }
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
      if (ph === 'wind' && !a.tell && a.t > a.def.windup * 0.45 && (d.boss || a.def.dmg >= 60)) {
        a.tell = true;
        const hx = e.x + Math.sin(e.rot) * d.r * 0.8, hz = e.z + Math.cos(e.rot) * d.r * 0.8, hy = e.y + (d.boss ? d.r * 2.2 : 2.4);
        emit(hx, hy, hz, 10, '#ff3b2f', { speed: 2.5, grav: 0, life: 0.35, size: 0.9, bright: 3 });
        emit(hx, hy, hz, 1, '#ffffff', { speed: 0, grav: 0, life: 0.25, size: d.boss ? 4 : 2, bright: 3 });
      }
      if (ph === 'act' && a.def.lunge && !a.lunged) { a.lunged = true; e.vx = Math.sin(e.rot) * a.def.lunge; e.vz = Math.cos(e.rot) * a.def.lunge; }
      if (ph === 'act' && a.def.breath) {
        const hx = e.x + Math.sin(e.rot) * 9, hz = e.z + Math.cos(e.rot) * 9;
        for (let i = 0; i < 4; i++) parts.push({ x: hx, y: e.y + 6, z: hz, vx: Math.sin(e.rot + rand(-0.3, 0.3)) * 22, vy: rand(-6, -2), vz: Math.cos(e.rot + rand(-0.3, 0.3)) * 22, life: 0.8, max: 0.8, r: 3, g: rand(1.0, 1.8), b: 0.25, grav: 0, size: rand(0.8, 1.6) });
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
      if (m.cape) m.cape.rotation.x = 0.12 + (anim === 'walk' ? 0.4 : 0) + Math.sin(t * 3 + e.wander) * 0.06;
    } else if (m.wingL) { // dragon
      const flap = Math.sin(t * (a && a.def.name === 'storm' ? 8 : 2)) * 0.5;
      m.wingL.rotation.z = flap + 0.2; m.wingR.rotation.z = -flap - 0.2;
      m.legs.forEach((l, i) => { l.rotation.x = anim === 'walk' ? Math.sin(t * 5 + i * Math.PI / 2) * 0.5 : 0; });
      m.neck.rotation.x = a && a.def.name === 'bite' ? (act > 0 ? lerp(-0.6, 0.6, act) : -0.6 * wind) : a && a.def.breath ? 0.35 : Math.sin(t) * 0.08;
      m.g.position.y = a && a.def.name === 'stomp' ? (act > 0 ? 0 : wind * 2.5) : 0;
      m.tail.rotation.y = Math.sin(t * 1.5) * 0.3; m.tail2.rotation.y = Math.sin(t * 1.5 - 0.6) * 0.35; m.tail3.rotation.y = Math.sin(t * 1.5 - 1.2) * 0.45;
      m.jaw.rotation.x = a && (a.def.breath || a.def.name === 'bite') ? (a.def.breath ? 0.55 : (act > 0 ? 0.1 : wind * 0.6)) : 0.05 + Math.sin(t * 0.7) * 0.03;
    } else if (m.legs) { // wolf
      m.legs.forEach((l, i) => { l.rotation.x = anim === 'walk' || (a && act > 0) ? Math.sin(t * 14 + (i % 2) * Math.PI + (i > 1 ? 1 : 0)) * 0.8 : 0; });
      m.tail.rotation.x = 0.4 + Math.sin(t * 6) * 0.2; m.g.rotation.x = a ? (act > 0 ? 0.3 : -0.25 * wind) : 0;
    }
    if (m.animate) m.animate(e, dt, anim, wind, act, API);
    if (anim === 'idle' && m.head && !m.wingL) m.head.rotation.y = Math.sin(t * 0.6 + e.wander) * 0.45;
    if (e.flash > 0 && m.g) m.g.rotation.x -= e.flash * 2.2;
    if (anim === 'idle') m.root.position.y += Math.sin(t * 2.2 + e.wander) * 0.03;
    const fl = e.flash > 0;
    m.root.traverse((o) => { if (o.isMesh && o.material.emissive) { if (fl) o.material.emissive.setRGB(0.9, 0.9, 0.9); else if (o.userData.em) o.material.emissive.copy(o.userData.em); else { o.userData.em = o.material.emissive.clone(); } } });
    if (e.phase > 1 && Math.random() < 0.2) emit(e.x + rand(-2, 2), e.y + rand(1, 6), e.z + rand(-2, 2), 1, e.type === 'dragon' ? '#8ec5ff' : '#ff7043', { speed: 1, up: 2, grav: -1 });
  }

  /* ------------------------------------------------------------ grace / death / flow */
  let cine = null, stuckT = 0;
  let state = 'play', fadeT = 0, curRegion = regionAt(P.x, P.z);
  const fogTarget = new T.Color(REGIONS[curRegion].fog); regionFog.copy(fogTarget);
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
    P.restT = 1.6; lightPillar(graceObjs[i].x, graceObjs[i].z, '#ffd36b', 1.4);
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
        else { const cost = LVCOST(); if (S.runes < cost) return; S.runes -= cost; S[k]++; S.level++; recalc(true); sfx('levelup'); emit(P.x, heightAt(P.x, P.z) + 0.5, P.z, 40, '#ffd36b', { speed: 2, up: 6, grav: -2, life: 1.4 }); shockwave(P.x, P.z, 6, 0, '#ffd36b'); oracle('《Livello aumentato: ' + S.level + '》'); }
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
      Corri (consuma stamina) · Mappa: viaggio rapido tra le Luci di Grazia scoperte<br>Mimetismo: trasformati in Forma Umana (spada, più danno) o in Lupo Tempesta (dopo averne divorato uno)<br>Fulmine Nero (FP) · Predatore (divora i nemici indeboliti) · Cura (Gelatina Cremisi)<br>Tastiera: WASD, J/K, Spazio, Q, F, G, R, E, frecce<br>
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
    camLook.set(P.x, gy + P.y + FORM[P.form].cam, P.z);
    if (input.lock && !input.lock.dead) camLook.lerp(new T.Vector3(input.lock.x, input.lock.y + (input.lock.d.boss ? 3 : 1), input.lock.z), 0.3);
    camera.lookAt(camLook);
  }

  /* ------------------------------------------------------------ main loop */
  let last = performance.now(), bot = { t: 0 };
  const perf = { acc: 0, n: 0, last: performance.now(), max: pixelRatio };
  /* sword trail ribbon (human form) */
  const TRAIL_N = 16;
  const trailPos = new Float32Array(TRAIL_N * 2 * 3), trailA = new Float32Array(TRAIL_N * 2), trail = [];
  const trailGeo = new T.BufferGeometry();
  trailGeo.setAttribute('position', new T.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('alpha', new T.BufferAttribute(trailA, 1));
  { const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
  const trailMesh = new T.Mesh(trailGeo, new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
    uniforms: { col: { value: new T.Color(1.4, 3.2, 3.6) } },
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 col; varying float vA; void main(){ gl_FragColor = vec4(col * vA, 1.0); }' }));
  trailMesh.frustumCulled = false; scene.add(trailMesh);
  const tvA = new T.Vector3(), tvB = new T.Vector3();
  function updateTrail(dt) {
    for (const p of trail) p.age += dt;
    while (trail.length && trail[0].age > 0.18) trail.shift();
    if (P.form === 'human' && P.atk && human.root.visible) {
      human.root.updateMatrixWorld(true);
      tvA.set(0, -0.15, 0); human.sword.localToWorld(tvA); tvB.set(0, -1.6, 0); human.sword.localToWorld(tvB);
      trail.push({ a: tvA.clone(), b: tvB.clone(), age: 0 });
      if (trail.length > TRAIL_N) trail.shift();
    }
    const n = trail.length;
    trailMesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = trail[Math.min(i, n - 1)], k = i < n ? (1 - p.age / 0.18) * (i / n) : 0;
      trailPos.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      trailA[i * 2] = k * 0.2; trailA[i * 2 + 1] = k;
    }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.attributes.alpha.needsUpdate = true;
  }
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
      regionFog.lerp(fogTarget, Math.min(1, dt * 0.6));
      graceObjs.forEach((g, i) => { if (!S.found[i] && Math.hypot(P.x - g.x, P.z - g.z) < 14) { S.found[i] = true; saveS(); toast('Luce di Grazia scoperta: ' + g.name); sfx('skillGet'); } });
      if (input.pressed.map) openMap();
      const gi = nearGrace();
      const pr = $('prompt');
      let act = gi >= 0 ? { label: 'Riposa alla Luce di Grazia ✦', action: () => openGrace(gi), d: 0 } : null;
      for (const pl of plugins) if (pl.interactables) {
        let list = []; try { list = pl.interactables() || []; } catch (err) { console.error(err); }
        for (const it of list) { const d = Math.hypot(P.x - it.x, P.z - it.z); if (d < (it.r || 3) && (!act || d < act.d)) act = { label: it.label, action: it.action, d }; }
      }
      if (act) { pr.style.display = 'block'; if (pr.textContent !== act.label) pr.textContent = act.label; if (input.pressed.interact) act.action(); }
      else pr.style.display = 'none';
      hook('update', dt);
      if (S.stain && Math.hypot(P.x - S.stain.x, P.z - S.stain.z) < 2) { S.runes += S.stain.runes; toast(`Anime recuperate: ${S.stain.runes.toLocaleString('it-IT')}`); S.stain = null; placeStain(); sfx('coin'); saveS(); }
      if (Math.random() < dt * 3) { const g = graceObjs[(Math.random() * graceObjs.length) | 0]; emit(g.x + rand(-0.5, 0.5), g.y + 1, g.z + rand(-0.5, 0.5), 1, '#ffd36b', { speed: 0.3, up: 1.5, grav: -0.5, life: 2 }); }
    } else if (state === 'cine' && cine) {
      cine.t += dt;
      const e = cine.e, k = cine.t / cine.dur, ang = e.rot + Math.PI * 0.35 + k * 1.3, R = e.d.r * 3.2 + 9;
      const cy = e.y + e.d.r * 0.6 + 1.5;
      camera.position.set(e.x + Math.sin(ang) * R, cy + (1 - k) * 3, e.z + Math.cos(ang) * R);
      camera.lookAt(e.x, e.y + e.d.r * 1.3 + 1, e.z);
      if (cine.t < 0.1 || Math.random() < dt * 4) { shake = 0.4; emit(e.x + rand(-3, 3), e.y + 0.5, e.z + rand(-3, 3), 4, e.type === 'dragon' ? '#8ec5ff' : '#d8b46a', { speed: 4, up: 3 }); }
      if (e.model.jaw) e.model.jaw.rotation.x = 0.6; if (e.model.armR) e.model.armR.rotation.x = -2.4 * Math.min(1, k * 3);
      if (cine.t >= cine.dur) { state = 'play'; cine = null; camPos.copy(camera.position); }
    } else if (state === 'dead') {
      body.scale.set(lerp(body.scale.x, 1.9, dt * 2), lerp(body.scale.y, 0.12, dt * 2), lerp(body.scale.z, 1.9, dt * 2));
      slime.position.y = lerp(slime.position.y, heightAt(P.x, P.z) + 0.15, dt * 2);
      fadeT -= dt;
      for (const e of enemies) updateEnemy(e, dt * 0.3);
      if (fadeT < 1.4) $('fade').style.opacity = 1;
      if (fadeT <= 0) respawn();
    }
    if (state !== 'play') updateFx(dt);
    updateParticles(dt);
    if (state !== 'cine') updateCamera(Math.max(dt, 0.001));
    {
      const gy = heightAt(P.x, P.z);
      windU.uTime.value += dt; windU.uPlayer.value.set(P.x, gy, P.z);
      updateDay(dt, P.x, gy, P.z);
      updateGrass(P.x, P.z);
      updateWeather(dt, camera.position.x, camera.position.y, camera.position.z, curRegion);
      updateTrail(dt);
      const wantFov = (P.sprint && Math.hypot(P.vx, P.vz) > 9 ? 70 : 62) + (P.roll > 0 ? 3 : 0);
      if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov = lerp(camera.fov, wantFov, Math.min(1, dt * 4)); camera.updateProjectionMatrix(); }
      // adaptive resolution: keep the game fluid on weaker phones
      perf.acc += (now - perf.last) / 1000; perf.last = now; perf.n++;
      if (perf.acc > 3) {
        const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
        if (avg > 1 / 30 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio * 0.85); renderer.setPixelRatio(pixelRatio); onResize(); }
        else if (avg < 1 / 55 && pixelRatio < perf.max) { pixelRatio = Math.min(perf.max, pixelRatio * 1.08); renderer.setPixelRatio(pixelRatio); onResize(); }
      }
    }
    graceObjs.forEach((g, i) => { g.mesh.rotation.y += dt * 1.5; g.mesh.position.y = g.y + 1.3 + Math.sin(now / 600 + i) * 0.15; });
    if (stainMesh) stainMesh.material.opacity = 0.6 + Math.sin(now / 200) * 0.3;
    if (fogWall.visible) fogWall.material.opacity = 0.14 + Math.sin(now / 300) * 0.05;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').classList.remove('show'); }
    hud(); updateOracle(Math.max(dt, 1 / 60)); updateDmg(Math.max(dt, 1 / 60));
    if (state === 'menu') {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const nothingOpen = !el || el === renderer.domElement || el === document.body || el.id === 'view';
      if (!nothingOpen) stuckT = 0; else if (!stuckT) stuckT = now; else if (now - stuckT > 800) { state = 'play'; stuckT = 0; resetInput(); }
    } else stuckT = 0;
    POST.comp.uniforms.hurt.value = Math.max(P.hitFlash * 3, P.hp > 0 && P.hp < P.maxHp * 0.25 ? 0.22 + 0.12 * Math.sin(now / 160) : 0);
    POST.render(now / 1000);
    input.pressed = {};
    requestAnimationFrame(frame);
  }

  populate(); placeStain();
  camPos.set(P.x, heightAt(P.x, P.z) + 6, P.z + 10);
  requestAnimationFrame((n) => { last = n; requestAnimationFrame(frame); });
  setTimeout(() => { $('fade').style.opacity = 0; bigMsg('TERRE SPEZZATE', 'place', 3.5); }, 200);
  setTimeout(() => oracle(`《Benvenuto, ${ch.name}. Analisi del territorio completata: le Luci di Grazia ✦ ti guideranno.》`), 3800);
  let audioOn = false;
  SK.events.on('gesture', () => { if (audioOn) return; audioOn = true; try { SK.Audio.init(); SK.Audio.setVolumes(main.settings.music, main.settings.sfx); music('forest'); } catch (e) { /* ignore */ } });
  window.addEventListener('pointerdown', function once() { SK.events.emit('gesture'); window.removeEventListener('pointerdown', once); });
  window.addEventListener('keydown', function once() { SK.events.emit('gesture'); window.removeEventListener('keydown', once); });
  Object.assign(API, { P, S, enemies, openMap, DAY, transform, plugins, TYPES, FORM, FORM_NAMES, LOC, REGIONS, FLAT, COLL, MAPR, graceObjs,
    scene, camera, renderer, T, main, ch, mythic, quality, input, windU, flashLight, emit, shockwave, bolt, strikeAt, spawn, hitEnemy, hitEnemyQuiet, killEnemy,
    hurtPlayer, heightAt, regionAt, toast, bigMsg, sfx, music, saveS, recalc, castLightning, useStamina, mesh, part, pivot, cap, sph, coneG, std, lam, hdr, BOX,
    humanoid, wolfModel, dragonModel, slime, human, wolfForm, body, dot, pointMat, populate, rand, lerp, clamp, angDiff, TAU,
    get state() { return state; }, set state(v) { state = v; },
    pressed: (id) => !!input.pressed[id], setShake: (v) => { shake = Math.max(shake, v); }, setHitstop: (v) => { hitstop = Math.max(hitstop, v); },
    register(pl) { plugins.push(pl); try { if (pl.init) pl.init(API); if (pl.populate) pl.populate(); } catch (err) { console.error('[plugin init ' + pl.id + ']', err); } },
    addButton, buttons, mapMarkers: [], compassMarkers: [], oracle, dmgNum, addGrace, teleport, lightPillar, dmgNum2: dmgNum, openGrace: (i) => openGrace(i) });
  window.SK3D = API;
})();
