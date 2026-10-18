/* Slime Reborn — SK.UI: DOM menus & overlays (title, shop, bestiary, codex, settings, credits,
   pause, game over, victory, level-up cards, naming dialog, oracle, banners, toasts) + canvas HUD. */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, abs = Math.abs, floor = Math.floor, round = Math.round;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  const RARITY_LABEL = { comune: 'Comune', raro: 'Raro', epico: 'Epico', leggendario: 'Leggendario', mitico: 'Mitico' };
  const BIOME_FALLBACK = [
    { id: 'cave', name: 'Caverna Sigillata', subtitle: '' },
    { id: 'forest', name: 'Foresta di Smeraldo', subtitle: '' },
    { id: 'volcano', name: 'Vulcano Cremisi', subtitle: '' },
    { id: 'demon', name: 'Cittadella dei Demoni', subtitle: '' },
  ];
  const BIOME_ORDER = ['cave', 'forest', 'volcano', 'demon'];
  const ELEMENT_LABEL = {
    water: 'Acqua', sound: 'Suono', web: 'Ragnatela', fire: 'Fuoco', poison: 'Veleno', earth: 'Terra', shadow: 'Ombra',
    nature: 'Natura', storm: 'Tempesta', spirit: 'Spirito', beast: 'Bestia', void: 'Vuoto', physical: 'Fisico',
  };
  const KIND_LABEL = { auto: 'Automatica', passive: 'Passiva', active: 'Attiva' };
  const STAGE_RING = ['#4fc3ff', '#3ef0d0', '#ff4f8b', '#ffd54f'];
  const STAGE_FALLBACK = ['Slime', 'Slime Primordiale', 'Slime Demoniaco', 'Sovrano Slime'];

  const STAT_GLYPH = {
    dmg: 'sword', power: 'sword', maxHp: 'heart', hp: 'heart', vitality: 'heart', speed: 'speed', agility: 'speed',
    cdr: 'hourglass', area: 'area', magnet: 'magnet', crit: 'crit', critMul: 'crit', regen: 'regen', mpRegen: 'mp',
    maxMp: 'mp', mp: 'mp', magicule: 'mp', amount: 'amount', projSpeed: 'amount', armor: 'shield', luck: 'clover',
    xpMul: 'gem', xp: 'gem', wisdom: 'book', soulMul: 'soul', souls: 'soul', greed: 'coin', lifesteal: 'drop',
    absorbMul: 'vortex', masteryMul: 'rune', maxAllies: 'paw', allyDmg: 'paw', dashCdMul: 'wind', heal: 'potion',
    potion: 'potion', revive: 'revive', revives: 'revive',
  };
  const GLYPH_COLOR = {
    heart: '#ff4f7b', regen: '#69f0ae', sword: '#cfe8ff', speed: '#64ffda', hourglass: '#ffd54f', area: '#b388ff',
    magnet: '#ff5252', crit: '#ffd740', mp: '#4fc3ff', amount: '#ffab40', shield: '#90caf9', clover: '#69f0ae',
    gem: '#40c4ff', book: '#ce93d8', soul: '#b388ff', coin: '#ffca28', revive: '#ffd54f', potion: '#ff4f8b',
    skull: '#eceff1', clock: '#b3e5fc', lock: '#90a4ae', wind: '#80deea', crown: '#ffd54f', quill: '#ffe082',
    pause: '#ffffff', play: '#ffffff', star: '#ffd54f', castle: '#b388ff', bag: '#ffb74d', paw: '#4fc3ff',
    rune: '#7c4dff', gear: '#b0bec5', scroll: '#ffe0b2', vortex: '#3ef0d0', drop: '#ff1744', trophy: '#ffd54f',
  };
  const SHOP_GLYPH = {
    vitality: 'heart', power: 'sword', agility: 'speed', magicule: 'mp', greed: 'coin', magnet: 'magnet',
    revive: 'revive', wisdom: 'book', armor: 'shield', luck: 'clover',
  };
  const KEY_HINT = { absorb: 'E', dash: 'SPAZIO', s1: '1', s2: '2', s3: '3', name: 'F', pause: 'ESC' };
  const NUM_STR = [];
  for (let i = 0; i < 100; i++) NUM_STR.push(String(i));
  const numStr = (n) => (n >= 0 && n < 100 ? NUM_STR[n | 0] : String(n | 0));

  const TIPS = [
    'Tieni premuto PREDATORE per divorare le essenze e rubare le abilità dei mostri.',
    'Dai un nome ai mostri erranti per trasformarli in alleati fedeli.',
    'Ogni 4 essenze di un\'abilità già conosciuta ne aumentano il livello.',
    'Evolvi ai livelli 8, 18 e 30 per ottenere poteri sempre più grandi.',
    'Le Anime raccolte sbloccano potenziamenti permanenti nel Negozio.',
    'Nella tua Nazione puoi stringere legami con le compagne che hai liberato.',
    'Lo scatto ti rende invulnerabile per un istante: usalo per attraversare i nemici.',
    'I nemici d\'élite hanno un bordo dorato e lasciano forzieri preziosi.',
    'I mostri sotto il 15% di vita possono essere divorati interi dal Predatore.',
    'Le abilità attive costano MP: tieni d\'occhio la barra blu.',
  ];

  /* ============================================================== helpers */
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  function sfx(name, opts) { try { if (SK.Audio && SK.Audio.sfx) SK.Audio.sfx(name, opts); } catch (e) { /* audio optional */ } }
  function saveData() { return (SK.save && SK.save.data) || {}; }
  function writeSave() { try { if (SK.save) SK.save.write(); } catch (e) { /* storage optional */ } }
  function settings() { return saveData().settings || {}; }
  function safe(fn) { try { return fn(); } catch (e) { console.error(e); return undefined; } }
  function biomeInfo(i) {
    const list = SK.World && SK.World.biomes;
    const idx = clamp((i | 0), 0, 3);
    return (list && list[idx]) || BIOME_FALLBACK[idx];
  }
  function biomeNameById(id) {
    const list = (SK.World && SK.World.biomes) || BIOME_FALLBACK;
    for (const b of list) if (b.id === id) return b.name;
    for (const b of BIOME_FALLBACK) if (b.id === id) return b.name;
    return id || '';
  }
  function skillDefs() { return (SK.Skills && SK.Skills.defs) || {}; }
  function enemyTypes() { return (SK.Enemies && SK.Enemies.types) || {}; }
  function stageName(player) {
    if (!player) return '';
    try { if (SK.Character && SK.Character.stageName) { const s = SK.Character.stageName(player); if (s) return s; } } catch (e) { /* fallback */ }
    const names = (SK.Slime && SK.Slime.stageNames) || STAGE_FALLBACK;
    return names[clamp(player.stage | 0, 0, names.length - 1)] || '';
  }
  function fmtTime(sec) { return U.fmtTime(sec || 0); }
  function fmtInt(v) { return String(Math.round(v)); }
  function fmtBig(v) { return U.fmtNum(v || 0); }
  function randomName() {
    try { if (SK.Game && SK.Game.randomName) { const n = SK.Game.randomName(); if (n) return String(n); } } catch (e) { /* local fallback */ }
    const a = ['Ri', 'Ga', 'Shu', 'Ben', 'Ran', 'Gob', 'Mi', 'Ka', 'Zel', 'Tor', 'Lu', 'Ve', 'Sor', 'Ari', 'Nox'];
    const b = ['mu', 'ru', 'ga', 'ta', 'ri', 'na', 'do', 'ko', 'en', 'il', 'ar', 'to'];
    const c = ['', 'n', 'ro', 'ta', 'el', 'us', 'ia', 'go'];
    return U.choice(a) + U.choice(b) + U.choice(c);
  }

  /* ---------------------------------------------------------------- DOM */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(parent, ...kids) {
    for (const k of kids) if (k) parent.appendChild(k);
    return parent;
  }
  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // reflow so the CSS animation restarts
    node.classList.add(cls);
  }

  /* ------------------------------------------------------------- canvas */
  function uiDpr() {
    const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return min(d, SK.quality === 'low' ? 1 : 2);
  }
  /** Canvas whose drawing space is cssW×cssH. cssSized=true lets the stylesheet decide the display size. */
  function makeCanvas(cssW, cssH, cls, cssSized) {
    const c = document.createElement('canvas');
    const dpr = uiDpr();
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    if (!cssSized) { c.style.width = cssW + 'px'; c.style.height = cssH + 'px'; }
    if (cls) c.className = cls;
    c._dpr = dpr; c._w = cssW; c._h = cssH;
    return c;
  }
  function prep(c) {
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c._dpr, 0, 0, c._dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return ctx;
  }
  function glyphCanvas(kind, size, color, cssSized) {
    const c = makeCanvas(size, size, 'sk-glyph', cssSized);
    const ctx = prep(c);
    drawGlyph(ctx, kind, size / 2, size / 2, size * 0.9, color, 0);
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function capsule(ctx, x, y, w, h) { roundRect(ctx, x, y, w, h, h / 2); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function glow(ctx, x, y, r, color, alpha) {
    if (!(alpha > 0.01) || !(r > 0)) return;
    if (SK.FX && SK.FX.drawGlow) { try { SK.FX.drawGlow(ctx, x, y, r, color, alpha); return; } catch (e) { /* fallback below */ } }
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pa * alpha * 0.35;
    ctx.fillStyle = color;
    circle(ctx, x, y, r * 0.6); ctx.fill();
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
  }

  /* ============================================================== glyphs */
  const darkCache = new Map(), lightCache = new Map();
  function darkOf(c) { let d = darkCache.get(c); if (!d) { d = U.mix(c, '#000000', 0.62); darkCache.set(c, d); } return d; }
  function lightOf(c) { let d = lightCache.get(c); if (!d) { d = U.mix(c, '#ffffff', 0.55); lightCache.set(c, d); } return d; }
  function hi(ctx, x, y, rx, ry, rot) {
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * 0.38;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = pa;
  }
  function fillStroke(ctx, fill, stroke) {
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.stroke();
  }
  function heartPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0.86);
    ctx.bezierCurveTo(-1.0, 0.18, -0.95, -0.78, -0.46, -0.78);
    ctx.bezierCurveTo(-0.16, -0.78, 0, -0.52, 0, -0.38);
    ctx.bezierCurveTo(0, -0.52, 0.16, -0.78, 0.46, -0.78);
    ctx.bezierCurveTo(0.95, -0.78, 1.0, 0.18, 0, 0.86);
    ctx.closePath();
  }
  function dropPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.95);
    ctx.bezierCurveTo(0.3, -0.5, 0.68, -0.12, 0.68, 0.3);
    ctx.arc(0, 0.3, 0.68, 0, PI);
    ctx.bezierCurveTo(-0.68, -0.12, -0.3, -0.5, 0, -0.95);
    ctx.closePath();
  }
  function starPath(ctx, n, ro, ri, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? ri : ro;
      const a = rot + (i / (n * 2)) * TAU - PI / 2;
      if (i === 0) ctx.moveTo(cos(a) * r, sin(a) * r); else ctx.lineTo(cos(a) * r, sin(a) * r);
    }
    ctx.closePath();
  }
  function doubleStroke(ctx, w, dark, col) {
    ctx.lineWidth = w * 1.45; ctx.strokeStyle = dark; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
  }

  /** Procedural vector icon in a unit box centered at x,y (size = box width). */
  function drawGlyph(ctx, kind, x, y, size, color, t) {
    const col = color || GLYPH_COLOR[kind] || '#4fc3ff';
    const dk = darkOf(col), lt = lightOf(col);
    t = t || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 2, size / 2);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.11;
    switch (kind) {
      case 'heart':
        heartPath(ctx); fillStroke(ctx, col, dk); hi(ctx, -0.42, -0.38, 0.2, 0.13, -0.6);
        break;
      case 'regen':
        heartPath(ctx); fillStroke(ctx, col, dk);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-0.1, -0.42, 0.2, 0.74); ctx.fillRect(-0.37, -0.15, 0.74, 0.2);
        break;
      case 'sword':
        ctx.rotate(PI / 4);
        ctx.beginPath();
        ctx.moveTo(0, -1.05); ctx.lineTo(0.18, -0.8); ctx.lineTo(0.18, 0.36); ctx.lineTo(-0.18, 0.36); ctx.lineTo(-0.18, -0.8); ctx.closePath();
        fillStroke(ctx, col, darkOf(col));
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(0, -0.86); ctx.lineTo(0, 0.28); ctx.stroke();
        ctx.lineWidth = 0.1;
        roundRect(ctx, -0.46, 0.34, 0.92, 0.17, 0.06); fillStroke(ctx, '#ffd54f', '#6d4c00');
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(-0.08, 0.5, 0.16, 0.34);
        circle(ctx, 0, 0.92, 0.11); fillStroke(ctx, '#ffd54f', '#6d4c00');
        break;
      case 'speed':
        for (let i = 0; i < 2; i++) {
          const ox = -0.32 + i * 0.52;
          ctx.beginPath(); ctx.moveTo(ox - 0.28, -0.58); ctx.lineTo(ox + 0.22, 0); ctx.lineTo(ox - 0.28, 0.58);
          doubleStroke(ctx, 0.24, dk, i ? col : lt);
        }
        ctx.beginPath(); ctx.moveTo(-0.98, -0.25); ctx.lineTo(-0.72, -0.25); ctx.moveTo(-0.98, 0.25); ctx.lineTo(-0.78, 0.25);
        ctx.lineWidth = 0.1; ctx.strokeStyle = col; ctx.stroke();
        break;
      case 'hourglass':
        ctx.beginPath();
        ctx.moveTo(-0.48, -0.72); ctx.lineTo(0.48, -0.72); ctx.lineTo(0.08, 0); ctx.lineTo(0.48, 0.72); ctx.lineTo(-0.48, 0.72); ctx.lineTo(-0.08, 0); ctx.closePath();
        fillStroke(ctx, 'rgba(220,240,255,0.35)', lt);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-0.3, -0.5); ctx.lineTo(0.3, -0.5); ctx.lineTo(0.03, -0.08); ctx.lineTo(-0.03, -0.08); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0.25); ctx.lineTo(0.4, 0.66); ctx.lineTo(-0.4, 0.66); ctx.closePath(); ctx.fill();
        roundRect(ctx, -0.66, -0.94, 1.32, 0.2, 0.08); fillStroke(ctx, '#a1887f', '#3e2723');
        roundRect(ctx, -0.66, 0.74, 1.32, 0.2, 0.08); fillStroke(ctx, '#a1887f', '#3e2723');
        break;
      case 'area':
        ctx.lineWidth = 0.1;
        ctx.strokeStyle = col; ctx.globalAlpha *= 0.5; circle(ctx, 0, 0, 0.9); ctx.stroke(); ctx.globalAlpha *= 2;
        ctx.strokeStyle = lt; circle(ctx, 0, 0, 0.6); ctx.stroke();
        circle(ctx, 0, 0, 0.3); fillStroke(ctx, col, dk);
        for (let i = 0; i < 4; i++) {
          const a = i * PI / 2 + PI / 4;
          ctx.beginPath(); ctx.moveTo(cos(a) * 0.62, sin(a) * 0.62); ctx.lineTo(cos(a) * 0.95, sin(a) * 0.95);
          ctx.strokeStyle = lt; ctx.stroke();
        }
        break;
      case 'magnet':
        ctx.beginPath(); ctx.moveTo(-0.5, -0.62); ctx.lineTo(-0.5, 0.05); ctx.arc(0, 0.05, 0.5, PI, 0, true); ctx.lineTo(0.5, -0.62);
        doubleStroke(ctx, 0.38, dk, col);
        ctx.fillStyle = '#eceff1'; ctx.strokeStyle = '#37474f'; ctx.lineWidth = 0.07;
        ctx.fillRect(-0.72, -0.96, 0.44, 0.3); ctx.strokeRect(-0.72, -0.96, 0.44, 0.3);
        ctx.fillRect(0.28, -0.96, 0.44, 0.3); ctx.strokeRect(0.28, -0.96, 0.44, 0.3);
        break;
      case 'crit':
        starPath(ctx, 8, 1, 0.42, t * 0.5); fillStroke(ctx, col, dk);
        circle(ctx, 0, 0, 0.26); ctx.fillStyle = '#ffffff'; ctx.fill();
        break;
      case 'mp':
        dropPath(ctx); fillStroke(ctx, col, dk); hi(ctx, -0.25, 0.1, 0.13, 0.22, 0.3);
        starPath(ctx, 4, 0.26, 0.09, 0); ctx.fillStyle = '#ffffff'; ctx.translate(0.12, 0.38); ctx.fill();
        break;
      case 'drop':
        dropPath(ctx); fillStroke(ctx, col, dk); hi(ctx, -0.25, 0.1, 0.13, 0.22, 0.3);
        break;
      case 'amount':
        for (let i = -1; i <= 1; i++) {
          ctx.save(); ctx.rotate(i * 0.45);
          ctx.beginPath(); ctx.moveTo(0, 0.85); ctx.lineTo(0, -0.45); doubleStroke(ctx, 0.14, dk, col);
          ctx.beginPath(); ctx.moveTo(0, -0.98); ctx.lineTo(0.24, -0.55); ctx.lineTo(-0.24, -0.55); ctx.closePath();
          ctx.lineWidth = 0.08; fillStroke(ctx, lt, dk);
          ctx.restore();
        }
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(0, -0.95); ctx.lineTo(0.78, -0.66); ctx.lineTo(0.7, 0.14);
        ctx.quadraticCurveTo(0.55, 0.7, 0, 0.98); ctx.quadraticCurveTo(-0.55, 0.7, -0.7, 0.14); ctx.lineTo(-0.78, -0.66); ctx.closePath();
        fillStroke(ctx, col, dk);
        ctx.beginPath(); ctx.moveTo(0, -0.62); ctx.lineTo(0.46, -0.44); ctx.lineTo(0.42, 0.1); ctx.quadraticCurveTo(0.32, 0.46, 0, 0.66);
        ctx.quadraticCurveTo(-0.32, 0.46, -0.42, 0.1); ctx.lineTo(-0.46, -0.44); ctx.closePath();
        ctx.strokeStyle = lt; ctx.lineWidth = 0.08; ctx.stroke();
        hi(ctx, -0.32, -0.42, 0.18, 0.1, -0.4);
        break;
      case 'clover':
        ctx.beginPath(); ctx.moveTo(0.05, 0.1); ctx.quadraticCurveTo(0.2, 0.7, 0.55, 0.98);
        ctx.lineWidth = 0.13; ctx.strokeStyle = '#2e7d32'; ctx.stroke();
        ctx.lineWidth = 0.09;
        for (let i = 0; i < 4; i++) {
          const a = i * PI / 2 + PI / 4;
          circle(ctx, cos(a) * 0.38, sin(a) * 0.38 - 0.08, 0.36); fillStroke(ctx, col, dk);
        }
        circle(ctx, 0, -0.08, 0.12); ctx.fillStyle = lt; ctx.fill();
        break;
      case 'gem':
        ctx.beginPath(); ctx.moveTo(0, -0.95); ctx.lineTo(0.75, -0.22); ctx.lineTo(0, 0.95); ctx.lineTo(-0.75, -0.22); ctx.closePath();
        fillStroke(ctx, col, dk);
        ctx.beginPath(); ctx.moveTo(-0.75, -0.22); ctx.lineTo(0.75, -0.22); ctx.moveTo(0, -0.95); ctx.lineTo(-0.28, -0.22); ctx.lineTo(0, 0.95); ctx.lineTo(0.28, -0.22); ctx.closePath();
        ctx.strokeStyle = lt; ctx.lineWidth = 0.06; ctx.stroke();
        hi(ctx, -0.28, -0.42, 0.14, 0.09, -0.7);
        break;
      case 'book':
        roundRect(ctx, -0.72, -0.85, 1.44, 1.7, 0.14); fillStroke(ctx, col, dk);
        ctx.fillStyle = '#fff8e1'; ctx.fillRect(0.5, -0.7, 0.14, 1.4);
        ctx.fillStyle = dk; ctx.fillRect(-0.72, -0.85, 0.2, 1.7);
        starPath(ctx, 4, 0.34, 0.1, t * 0.4); ctx.fillStyle = '#fff59d'; ctx.save(); ctx.translate(0.0, -0.05); ctx.fill(); ctx.restore();
        break;
      case 'soul': {
        const wv = sin(t * 6) * 0.12;
        ctx.beginPath();
        ctx.moveTo(wv, -1);
        ctx.bezierCurveTo(0.25 + wv, -0.6, 0.72, -0.32, 0.68, 0.26);
        ctx.arc(0, 0.26, 0.68, 0, PI);
        ctx.bezierCurveTo(-0.72, -0.1, -0.2 + wv, -0.35, wv, -1);
        ctx.closePath();
        fillStroke(ctx, col, dk);
        circle(ctx, 0, 0.3, 0.38); ctx.fillStyle = lt; ctx.fill();
        ctx.fillStyle = '#1a0f3a';
        ctx.beginPath(); ctx.ellipse(-0.17, 0.26, 0.08, 0.12, 0, 0, TAU); ctx.ellipse(0.17, 0.26, 0.08, 0.12, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'coin':
        circle(ctx, 0, 0, 0.86); fillStroke(ctx, col, '#7a4f00');
        circle(ctx, 0, 0, 0.6); ctx.strokeStyle = '#b37400'; ctx.lineWidth = 0.08; ctx.stroke();
        starPath(ctx, 4, 0.38, 0.13, 0); ctx.fillStyle = '#fff3c4'; ctx.fill();
        hi(ctx, -0.36, -0.4, 0.2, 0.11, -0.7);
        break;
      case 'revive':
        ctx.beginPath(); ctx.ellipse(0, -0.5, 0.3, 0.38, 0, 0, TAU); doubleStroke(ctx, 0.2, dk, col);
        ctx.beginPath(); ctx.moveTo(0, -0.12); ctx.lineTo(0, 0.95); ctx.moveTo(-0.6, 0.08); ctx.lineTo(0.6, 0.08);
        doubleStroke(ctx, 0.22, dk, col);
        break;
      case 'potion':
        ctx.save();
        ctx.beginPath(); ctx.moveTo(-0.18, -0.62); ctx.lineTo(-0.18, -0.3); ctx.arc(0, 0.28, 0.66, -PI / 2 - 0.28, -PI / 2 + 0.28, true);
        ctx.lineTo(0.18, -0.62); ctx.closePath();
        ctx.fillStyle = 'rgba(200,230,255,0.25)'; ctx.fill();
        ctx.clip();
        ctx.fillStyle = col; ctx.fillRect(-1, 0.05 + sin(t * 3) * 0.04, 2, 1);
        ctx.restore();
        circle(ctx, 0, 0.28, 0.66); ctx.strokeStyle = '#e1f5fe'; ctx.lineWidth = 0.1; ctx.stroke();
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(-0.22, -0.96, 0.44, 0.3);
        ctx.fillStyle = 'rgba(225,245,254,0.8)'; ctx.fillRect(-0.16, -0.66, 0.32, 0.3);
        hi(ctx, -0.3, 0.05, 0.12, 0.2, 0.4);
        break;
      case 'skull':
        ctx.beginPath(); ctx.arc(0, -0.15, 0.74, PI * 0.82, PI * 0.18 + TAU);
        ctx.lineTo(0.42, 0.62); ctx.lineTo(-0.42, 0.62); ctx.closePath();
        fillStroke(ctx, col, '#263238');
        ctx.fillStyle = '#10121f';
        ctx.beginPath(); ctx.ellipse(-0.3, -0.12, 0.19, 0.23, 0.2, 0, TAU); ctx.ellipse(0.3, -0.12, 0.19, 0.23, -0.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0.14); ctx.lineTo(0.09, 0.32); ctx.lineTo(-0.09, 0.32); ctx.closePath(); ctx.fill();
        ctx.fillRect(-0.2, 0.46, 0.06, 0.16); ctx.fillRect(-0.03, 0.46, 0.06, 0.16); ctx.fillRect(0.14, 0.46, 0.06, 0.16);
        break;
      case 'clock':
        circle(ctx, 0, 0, 0.82); fillStroke(ctx, 'rgba(10,20,40,0.6)', col);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.55); ctx.moveTo(0, 0); ctx.lineTo(0.38, 0.12);
        ctx.lineWidth = 0.13; ctx.strokeStyle = col; ctx.stroke();
        break;
      case 'lock':
        ctx.beginPath(); ctx.arc(0, -0.3, 0.4, PI, 0); ctx.lineTo(0.4, 0); ctx.moveTo(-0.4, 0); ctx.lineTo(-0.4, -0.3);
        doubleStroke(ctx, 0.17, '#263238', '#b0bec5');
        roundRect(ctx, -0.62, -0.08, 1.24, 0.98, 0.16); fillStroke(ctx, col, dk);
        circle(ctx, 0, 0.3, 0.13); ctx.fillStyle = '#1b1f2e'; ctx.fill();
        ctx.fillRect(-0.05, 0.3, 0.1, 0.3);
        break;
      case 'wind':
        ctx.lineWidth = 0.15;
        for (let i = 0; i < 3; i++) {
          const yy = -0.5 + i * 0.5, len = i === 1 ? 0.62 : 0.38, sx = -0.95 + (i === 1 ? 0 : 0.18);
          const ph = sin(t * 4 + i) * 0.06;
          ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(len + ph, yy);
          ctx.arc(len + ph, yy - 0.2, 0.2, PI / 2, -PI * 0.75, true);
          doubleStroke(ctx, 0.15, dk, i === 1 ? lt : col);
        }
        break;
      case 'crown':
        ctx.beginPath();
        ctx.moveTo(-0.86, 0.5); ctx.lineTo(-0.86, -0.45); ctx.lineTo(-0.42, -0.02); ctx.lineTo(0, -0.78);
        ctx.lineTo(0.42, -0.02); ctx.lineTo(0.86, -0.45); ctx.lineTo(0.86, 0.5); ctx.closePath();
        fillStroke(ctx, col, '#7a4f00');
        ctx.fillStyle = '#b37400'; ctx.fillRect(-0.86, 0.36, 1.72, 0.2);
        circle(ctx, 0, -0.78, 0.13); ctx.fillStyle = '#ff4f8b'; ctx.fill();
        circle(ctx, -0.86, -0.45, 0.11); ctx.fillStyle = '#4fc3ff'; ctx.fill();
        circle(ctx, 0.86, -0.45, 0.11); ctx.fill();
        circle(ctx, 0, 0.17, 0.12); ctx.fillStyle = '#69f0ae'; ctx.fill();
        hi(ctx, -0.45, 0.2, 0.18, 0.07, 0);
        break;
      case 'quill':
        ctx.rotate(-PI / 5);
        ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(0.55, -0.25, 0.08, 0.62); ctx.lineTo(-0.08, 0.62); ctx.quadraticCurveTo(-0.55, -0.25, 0, -1); ctx.closePath();
        fillStroke(ctx, col, dk);
        ctx.beginPath(); ctx.moveTo(0, -0.8); ctx.lineTo(0, 0.98); ctx.lineWidth = 0.07; ctx.strokeStyle = dk; ctx.stroke();
        break;
      case 'pause':
        roundRect(ctx, -0.52, -0.62, 0.34, 1.24, 0.1); ctx.fillStyle = col; ctx.fill();
        roundRect(ctx, 0.18, -0.62, 0.34, 1.24, 0.1); ctx.fill();
        break;
      case 'play':
        ctx.beginPath(); ctx.moveTo(-0.5, -0.75); ctx.lineTo(0.8, 0); ctx.lineTo(-0.5, 0.75); ctx.closePath();
        fillStroke(ctx, col, dk);
        break;
      case 'castle':
        ctx.beginPath();
        ctx.moveTo(-0.85, 0.9); ctx.lineTo(-0.85, -0.35); ctx.lineTo(-0.65, -0.35); ctx.lineTo(-0.65, -0.2); ctx.lineTo(-0.45, -0.2); ctx.lineTo(-0.45, -0.35);
        ctx.lineTo(-0.3, -0.35); ctx.lineTo(-0.3, -0.62); ctx.lineTo(0, -0.88); ctx.lineTo(0.3, -0.62); ctx.lineTo(0.3, -0.35);
        ctx.lineTo(0.45, -0.35); ctx.lineTo(0.45, -0.2); ctx.lineTo(0.65, -0.2); ctx.lineTo(0.65, -0.35); ctx.lineTo(0.85, -0.35); ctx.lineTo(0.85, 0.9); ctx.closePath();
        fillStroke(ctx, col, dk);
        ctx.fillStyle = '#140b2e'; ctx.beginPath(); ctx.moveTo(-0.2, 0.9); ctx.lineTo(-0.2, 0.45); ctx.arc(0, 0.45, 0.2, PI, 0); ctx.lineTo(0.2, 0.9); ctx.fill();
        ctx.fillStyle = '#ffd54f'; ctx.fillRect(-0.06, -0.3, 0.12, 0.16);
        break;
      case 'bag':
        ctx.beginPath(); ctx.moveTo(-0.3, -0.55); ctx.quadraticCurveTo(-0.95, 0.0, -0.75, 0.6); ctx.quadraticCurveTo(-0.6, 0.95, 0, 0.95);
        ctx.quadraticCurveTo(0.6, 0.95, 0.75, 0.6); ctx.quadraticCurveTo(0.95, 0.0, 0.3, -0.55); ctx.closePath();
        fillStroke(ctx, col, dk);
        ctx.beginPath(); ctx.moveTo(-0.3, -0.55); ctx.lineTo(-0.45, -0.9); ctx.lineTo(0.45, -0.9); ctx.lineTo(0.3, -0.55); ctx.closePath(); fillStroke(ctx, lt, dk);
        ctx.fillStyle = '#7a4f00'; ctx.fillRect(-0.36, -0.6, 0.72, 0.1);
        circle(ctx, 0, 0.3, 0.26); fillStroke(ctx, '#ffd54f', '#7a4f00');
        break;
      case 'paw':
        ctx.beginPath(); ctx.ellipse(0, 0.38, 0.46, 0.38, 0, 0, TAU); fillStroke(ctx, col, dk);
        circle(ctx, -0.66, -0.12, 0.2); fillStroke(ctx, col, dk);
        circle(ctx, -0.25, -0.55, 0.21); fillStroke(ctx, col, dk);
        circle(ctx, 0.25, -0.55, 0.21); fillStroke(ctx, col, dk);
        circle(ctx, 0.66, -0.12, 0.2); fillStroke(ctx, col, dk);
        break;
      case 'rune':
        ctx.rotate(t * 0.6);
        circle(ctx, 0, 0, 0.84); fillStroke(ctx, 'rgba(30,10,70,0.55)', col);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = i * TAU / 3 - PI / 2; if (i) ctx.lineTo(cos(a) * 0.62, sin(a) * 0.62); else ctx.moveTo(cos(a) * 0.62, sin(a) * 0.62); }
        ctx.closePath(); ctx.strokeStyle = lt; ctx.lineWidth = 0.09; ctx.stroke();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circle(ctx, cos(a) * 0.84, sin(a) * 0.84, 0.09); ctx.fillStyle = lt; ctx.fill(); }
        circle(ctx, 0, 0, 0.16); ctx.fillStyle = '#ffffff'; ctx.fill();
        break;
      case 'gear':
        ctx.rotate(t * 0.4);
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a0 = (i / 16) * TAU, a1 = ((i + 1) / 16) * TAU, r = i % 2 ? 0.66 : 0.92;
          ctx.arc(0, 0, r, a0, a1);
        }
        ctx.closePath(); fillStroke(ctx, col, dk);
        circle(ctx, 0, 0, 0.3); ctx.fillStyle = '#141833'; ctx.fill();
        break;
      case 'scroll':
        roundRect(ctx, -0.62, -0.78, 1.24, 1.56, 0.08); fillStroke(ctx, col, '#6d4c41');
        ctx.beginPath(); ctx.ellipse(0, -0.8, 0.78, 0.16, 0, 0, TAU); fillStroke(ctx, lt, '#6d4c41');
        ctx.beginPath(); ctx.ellipse(0, 0.8, 0.78, 0.16, 0, 0, TAU); fillStroke(ctx, lt, '#6d4c41');
        ctx.strokeStyle = 'rgba(109,76,65,0.7)'; ctx.lineWidth = 0.07;
        ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-0.38, -0.4 + i * 0.26); ctx.lineTo(0.38 - (i % 2) * 0.18, -0.4 + i * 0.26); } ctx.stroke();
        break;
      case 'vortex':
        ctx.rotate(t * 3);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.arc(0, 0, 0.85 - i * 0.24, i * 2.1, i * 2.1 + PI * 1.25);
          ctx.lineWidth = 0.15 - i * 0.02; ctx.strokeStyle = i === 1 ? lt : col; ctx.stroke();
        }
        circle(ctx, 0, 0, 0.16); ctx.fillStyle = '#05060f'; ctx.fill();
        break;
      case 'trophy':
        ctx.beginPath(); ctx.moveTo(-0.6, -0.8); ctx.lineTo(0.6, -0.8); ctx.lineTo(0.5, -0.1); ctx.quadraticCurveTo(0.4, 0.3, 0, 0.32); ctx.quadraticCurveTo(-0.4, 0.3, -0.5, -0.1); ctx.closePath();
        fillStroke(ctx, col, '#7a4f00');
        ctx.beginPath(); ctx.arc(-0.62, -0.45, 0.24, PI * 0.5, PI * 1.5); ctx.moveTo(0.62, -0.69); ctx.arc(0.62, -0.45, 0.24, -PI * 0.5, PI * 0.5);
        ctx.lineWidth = 0.1; ctx.strokeStyle = col; ctx.stroke();
        ctx.fillStyle = '#b37400'; ctx.fillRect(-0.1, 0.3, 0.2, 0.32);
        roundRect(ctx, -0.45, 0.6, 0.9, 0.28, 0.06); fillStroke(ctx, col, '#7a4f00');
        hi(ctx, -0.3, -0.5, 0.1, 0.22, 0);
        break;
      default:
        starPath(ctx, 5, 0.95, 0.42, 0); fillStroke(ctx, col, dk); hi(ctx, -0.2, -0.25, 0.16, 0.1, -0.5);
        break;
    }
    ctx.restore();
  }

  /* ======================================================= anim registry */
  let inited = false;
  let root = null;
  const ownEls = new Set();
  const anims = [];
  let animAcc = 0;
  let loopOn = false, lastTick = 0;

  /** Registers a canvas to redraw every UI frame while `screen` is visible. */
  function animate(screen, canvas, draw) {
    anims.push({ screen, canvas, draw, broken: false });
    // draw first frame immediately so nothing pops in empty
    try { draw(prep(canvas), canvas._w, canvas._h, now() / 1000); } catch (e) { console.error(e); }
    ensureLoop();
  }
  function stopAnims(screen) {
    for (let i = anims.length - 1; i >= 0; i--) if (anims[i].screen === screen) anims.splice(i, 1);
  }
  function tickAnims(dt, T) {
    if (!anims.length) return;
    const step = SK.quality === 'low' ? 1 / 20 : SK.quality === 'medium' ? 1 / 30 : 0;
    animAcc += dt;
    if (step && animAcc < step) return;
    animAcc = 0;
    for (let i = 0; i < anims.length; i++) {
      const a = anims[i];
      if (a.broken || !screenVisible(a.screen)) continue;
      try { a.draw(prep(a.canvas), a.canvas._w, a.canvas._h, T); } catch (e) { a.broken = true; console.error(e); }
    }
  }

  function ensureLoop() {
    if (loopOn || !inited || typeof requestAnimationFrame !== 'function') return;
    loopOn = true;
    lastTick = now();
    requestAnimationFrame(uiTick);
  }
  function uiTick() {
    const n = now();
    const dt = clamp((n - lastTick) / 1000, 0, 0.1);
    lastTick = n;
    const T = n / 1000;
    try {
      tickOracle(dt);
      tickBanner(dt);
      tickToasts(dt);
      tickCounts(dt);
      tickAnims(dt, T);
      tickTitle(dt);
      tickWatch(dt);
    } catch (e) { console.error(e); }
    if (loopBusy()) requestAnimationFrame(uiTick);
    else loopOn = false;
  }
  function loopBusy() {
    return anims.length > 0 || !!oracle.cur || oracle.queue.length > 0 || !!banner.cur || banner.queue.length > 0 ||
      toasts.length > 0 || counts.length > 0 || (screens.title && screens.title.open) || watch.active;
  }

  /* ========================================================= count-ups */
  const counts = [];
  function countUp(node, to, opts) {
    opts = opts || {};
    counts.push({
      el: node, from: +opts.from || 0, to: +to || 0, t: 0, dur: opts.dur != null ? opts.dur : 0.6, delay: opts.delay || 0,
      fmt: opts.fmt || fmtInt, onStart: opts.onStart || null, onEnd: opts.onEnd || null, started: false, screen: opts.screen || null,
    });
    if (!opts.delay) node.textContent = (opts.fmt || fmtInt)(+opts.from || 0);
    ensureLoop();
  }
  function tickCounts(dt) {
    for (let i = 0; i < counts.length; i++) {
      const c = counts[i];
      if (c.delay > 0) { c.delay -= dt; if (c.delay > 0) continue; }
      if (!c.started) { c.started = true; if (c.onStart) safe(c.onStart); }
      c.t += dt;
      const k = c.dur > 0 ? clamp(c.t / c.dur, 0, 1) : 1;
      c.el.textContent = c.fmt(c.from + (c.to - c.from) * U.ease.outCubic(k));
      if (k >= 1) {
        c.el.textContent = c.fmt(c.to);
        counts.splice(i, 1); i--;
        if (c.onEnd) safe(c.onEnd);
      }
    }
  }
  function finishCounts(screen) {
    for (const c of counts) if (!screen || c.screen === screen) { c.delay = 0; c.t = c.dur + 1; }
  }
  function dropCounts(screen) {
    for (let i = counts.length - 1; i >= 0; i--) if (counts[i].screen === screen) counts.splice(i, 1);
  }

  /* ====================================================== screen manager */
  const screens = {};
  const SUB = ['shop', 'bestiary', 'skills', 'settings', 'credits'];
  const BASE = ['title', 'pause', 'gameover', 'victory'];
  const ALL = BASE.concat(SUB);
  const builders = {};
  const refreshers = {};

  function createScreen(name, cls, z) {
    const e = el('div', 'sk-screen sk-own ' + (cls || ''));
    e.dataset.screen = name;
    e.style.zIndex = String(z);
    root.appendChild(e);
    ownEls.add(e);
    screens[name] = { el: e, open: false, covered: false, parent: null, openT: 0, clearTimer: 0 };
  }
  function screenVisible(name) {
    if (name === 'levelup') return lv.open;
    if (name === 'naming') return nm.open;
    if (name === 'confirm') return cf.open;
    const sc = screens[name];
    return !!(sc && sc.open && !sc.covered);
  }
  function subOpen() {
    for (const k of SUB) if (screens[k] && screens[k].open) return k;
    return null;
  }
  function menuOpen() {
    for (const k of ALL) if (screens[k] && screens[k].open) return true;
    return false;
  }
  function anyBlocking() { return menuOpen() || lv.open || nm.open || cf.open; }
  function isOpen(name) {
    if (!inited) return false;
    if (name == null) return anyBlocking();
    if (name === 'levelup') return lv.open;
    if (name === 'naming') return nm.open;
    if (name === 'confirm') return cf.open;
    if (name === 'oracle') return !!oracle.cur;
    if (name === 'banner') return !!banner.cur;
    const sc = screens[name];
    return !!(sc && sc.open);
  }
  function blockInput() {
    if (!SK.input) return;
    SK.input.enabled = false;
    try { SK.input.clear(); } catch (e) { /* ignore */ }
  }
  function unblockIfIdle() {
    if (!SK.input || anyBlocking()) return;
    try { SK.input.clear(); } catch (e) { /* ignore */ }
    SK.input.enabled = true;
  }
  function setCovered(name, v) {
    const sc = screens[name];
    if (!sc || !sc.open) return;
    sc.covered = v;
    sc.el.classList.toggle('covered', v);
  }

  function show(name, data) {
    if (!inited) init();
    const sc = screens[name];
    if (!sc) return false;
    if (SUB.indexOf(name) >= 0) {
      const parent = screens.pause.open ? 'pause' : screens.title.open ? 'title' : null;
      for (const k of SUB) if (k !== name && screens[k].open) closeScreen(k, true);
      sc.parent = parent;
      if (parent) setCovered(parent, true);
    } else {
      for (const k of SUB) if (screens[k].open) closeScreen(k, true);
      if (name === 'title') { for (const k of BASE) if (k !== 'title' && screens[k].open) closeScreen(k, true); watchStop(); }
      else if (name === 'gameover' || name === 'victory') { for (const k of BASE) if (k !== name && screens[k].open) closeScreen(k, true); }
      else if (name === 'pause' && screens.title.open) closeScreen('title', true);
      if (name !== 'pause') { closeLevelUp(true); closeNaming(true); closeConfirm(true); }
    }
    if (sc.clearTimer) { clearTimeout(sc.clearTimer); sc.clearTimer = 0; }
    stopAnims(name);
    dropCounts(name);
    sc.el.textContent = '';
    sc.open = true;
    sc.covered = false;
    sc.openT = now();
    sc.el.classList.remove('covered');
    if (builders[name]) { try { builders[name](sc.el, data || {}); } catch (e) { console.error(e); } }
    sc.el.classList.add('active');
    blockInput();
    ensureLoop();
    return true;
  }
  function closeScreen(name, internal) {
    const sc = screens[name];
    if (!sc || !sc.open) return false;
    sc.open = false;
    sc.covered = false;
    sc.el.classList.remove('active', 'covered');
    stopAnims(name);
    dropCounts(name);
    const parent = sc.parent;
    sc.parent = null;
    if (parent && screens[parent] && screens[parent].open) {
      setCovered(parent, false);
      if (refreshers[parent]) safe(() => refreshers[parent](screens[parent].el));
    }
    const node = sc.el;
    if (typeof setTimeout === 'function') sc.clearTimer = setTimeout(() => { sc.clearTimer = 0; if (!sc.open) node.textContent = ''; }, 340);
    if (!internal) unblockIfIdle();
    return true;
  }
  function hide(name) {
    if (!inited) return false;
    let r = false;
    if (name === 'levelup') { r = lv.open; closeLevelUp(); }
    else if (name === 'naming') { r = nm.open; closeNaming(); }
    else if (name === 'confirm') { r = cf.open; closeConfirm(); }
    else r = closeScreen(name, true);
    unblockIfIdle();
    return r;
  }
  function hideAll() {
    if (!inited) return;
    for (const k of SUB) closeScreen(k, true);
    for (const k of BASE) closeScreen(k, true);
    closeLevelUp(true);
    closeNaming(true);
    closeConfirm();
    watchStop();
    unblockIfIdle();
  }

  /* ------------------------------------------- foreign-screen watchdog */
  // When Gioca / Nazione hand control to another module's DOM screen, keep an eye on it so the
  // player never ends up on an empty title (if that module closes without calling show('title')).
  const watch = { active: false, t: 0, grace: 0 };
  function watchStart() { watch.active = true; watch.t = 0; watch.grace = 1.2; ensureLoop(); }
  function watchStop() { watch.active = false; }
  function foreignVisible() {
    const lists = [root ? root.children : [], document.body ? document.body.children : []];
    for (const list of lists) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (ownEls.has(c) || c === root || c.hidden) continue;
        const id = c.id;
        if (id === 'game' || id === 'ui' || id === 'rotate-hint' || id === 'boot-error') continue;
        const tag = c.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;
        if (!c.getClientRects || c.getClientRects().length === 0) continue;
        const cs = typeof getComputedStyle === 'function' ? getComputedStyle(c) : null;
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05)) continue;
        return c;
      }
    }
    return null;
  }
  function tickWatch(dt) {
    if (!watch.active) return;
    watch.t += dt;
    if (watch.t < watch.grace) return;
    if (screens.title.open || menuOpen()) { watchStop(); return; }
    if (SK.G && SK.G.state && SK.G.state !== 'title') { watchStop(); return; }
    if (watch.t < watch.grace + 0.4) return;
    watch.grace = watch.t;
    if (!foreignVisible()) { watchStop(); show('title'); }
  }

  /* ============================================================ widgets */
  function button(label, cls, onClick, opts) {
    opts = opts || {};
    const b = el('button', 'sk-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    if (opts.glyph) b.appendChild(glyphCanvas(opts.glyph, 22, opts.glyphColor));
    if (label != null) b.appendChild(el('span', null, label));
    let last = 0;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = now();
      if (n - last < 260 || b.disabled) return;
      last = n;
      sfx(opts.sfx || 'ui');
      try { if (onClick) onClick(e); } catch (err) { console.error(err); }
    });
    return b;
  }
  function soulsPill(screen) {
    const pill = el('div', 'sk-pill souls');
    const c = makeCanvas(22, 22);
    const b = el('b', null, String(saveData().souls | 0));
    add(pill, c, b, el('span', null, 'Anime'));
    pill._num = b;
    animate(screen, c, (ctx, w, h, T) => drawGlyph(ctx, 'soul', w / 2, h / 2, w * 0.9, null, T));
    return pill;
  }
  function pageHeader(titleText, name, titleCls) {
    const h = el('div', 'sk-header');
    const back = button(null, 'icon back ghost', () => closeScreen(name), { sfx: 'uiBack' });
    back.setAttribute('aria-label', 'Indietro');
    add(h, back, el('h1', 'sk-title' + (titleCls ? ' ' + titleCls : ''), titleText));
    return h;
  }
  function silhouette(ctx, w, h) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#0b0d22';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#8fa3dc';
    ctx.font = '900 ' + round(h * 0.32) + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', w / 2, h / 2);
    ctx.restore();
  }
  function drawMonsterPortrait(ctx, w, h, typeId, T, known) {
    let drawn = false;
    if (SK.Enemies && SK.Enemies.renderPortrait && enemyTypes()[typeId]) {
      SK.Enemies.renderPortrait(ctx, typeId, w / 2, h / 2 + h * 0.03, min(w, h) * 0.96, T);
      drawn = true;
    }
    if (!drawn) {
      const def = enemyTypes()[typeId];
      const col = (def && def.color) || '#7c8db5';
      glow(ctx, w / 2, h / 2, w * 0.45, col, 0.35);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(w / 2, h * 0.56 + sin(T * 3) * 2, w * 0.26, h * 0.22, 0, 0, TAU); ctx.fill();
    }
    if (!known) silhouette(ctx, w, h);
  }
  function drawHeroPortrait(ctx, w, h, p, T, mood) {
    const ch = saveData().character || {};
    const race = p.race || ch.race || 'slime';
    const color = p.color || ch.color;
    const stage = p.stage | 0;
    if (SK.Character && SK.Character.renderPortrait) {
      SK.Character.renderPortrait(ctx, w / 2, h / 2, w * 0.92, race, stage, color, T);
    } else if (SK.Slime && SK.Slime.renderPortrait) {
      const crown = !!(p.perks && (p.perks.imperialAura || p.perks.imperialJudgement)) || (p.cls || ch.cls) === 'pierfrancesco';
      SK.Slime.renderPortrait(ctx, w / 2, h / 2, w * 0.92, stage, T, { color, crown, expression: mood });
    }
  }
  function costOf(item, lvl) {
    let c = 0;
    try { c = typeof item.cost === 'function' ? item.cost(lvl) : +item.cost; } catch (e) { c = 0; }
    if (!(c >= 0)) c = 50 * (lvl + 1);
    return Math.round(c);
  }

  /* ============================================================== TITLE */
  const titleState = { tipT: 0, tipI: 0, tipEl: null, soulsShown: -1, pill: null, rec: null, hero: null };

  function recordNode(d) {
    const b = d.best || {};
    const node = el('div', 'sk-record');
    if (!(b.time > 0) && !(b.kills > 0)) { node.textContent = 'Nessun record: inizia la tua leggenda!'; return node; }
    const parts = [
      ['Record ', fmtTime(b.time)], [' · ', fmtBig(b.kills || 0)], [' uccisioni · Lv ', String(b.level || 1)],
      [' · ', biomeInfo(b.biome || 0).name],
    ];
    for (const [txt, val] of parts) { node.appendChild(document.createTextNode(txt)); node.appendChild(el('b', null, val)); }
    return node;
  }
  function heroNode(d) {
    const ch = d.character || {};
    const node = el('div', 'sk-hero-chip');
    const C = SK.Character;
    const race = C && C.races && C.races[ch.race];
    const cls = C && C.classes && C.classes[ch.cls];
    node.appendChild(document.createTextNode('Eroe: '));
    node.appendChild(el('b', null, ch.name || 'Senza nome'));
    const extra = [race && race.name, cls && cls.name].filter(Boolean).join(' · ');
    if (extra) node.appendChild(document.createTextNode(' · ' + extra));
    return node;
  }
  builders.title = (scr) => {
    const d = saveData();
    const tbar = el('div', 'sk-tbar sk-in');
    const pill = soulsPill('title');
    const right = el('div', 'right');
    const rec = recordNode(d);
    const tags = el('div');
    if ((d.wins | 0) > 0) tags.appendChild(el('span', 'sk-tag gold', 'Vittorie: ' + d.wins));
    if (d.nightmare) { tags.appendChild(document.createTextNode(' ')); tags.appendChild(el('span', 'sk-tag boss', 'Incubo sbloccato')); }
    add(right, rec, tags);
    add(tbar, pill, right);

    const wrap = el('div', 'sk-logo-wrap sk-in');
    const float = el('div', 'sk-logo-float');
    const logo = el('h1', 'sk-logo');
    add(logo, el('span', 'l1', 'SLIME'), el('span', 'l2', 'REBORN'));
    add(float, logo, el('div', 'sk-logo-sub', "L'Ascesa del Predatore"));
    const hero = heroNode(d);
    add(wrap, float, hero);

    const menu = el('div', 'sk-menu sk-in');
    const play = button('Gioca', 'primary big pulse shine play', onPlay, { glyph: 'play', sfx: 'select' });
    const row = el('div', 'row');
    add(row,
      button('Nazione', '', onNation, { glyph: 'castle' }),
      button('Negozio', '', () => show('shop'), { glyph: 'bag' }),
      button('Bestiario', '', () => show('bestiary'), { glyph: 'paw' }),
      button('Abilità', '', () => show('skills'), { glyph: 'rune' }),
      button('Impostazioni', '', () => show('settings'), { glyph: 'gear' }),
      button('Crediti', '', () => show('credits'), { glyph: 'scroll' }));
    const tip = el('div', 'sk-tip');
    titleState.tipI = (Math.random() * TIPS.length) | 0;
    tip.textContent = TIPS[titleState.tipI];
    titleState.tipT = 0;
    add(menu, play, row, tip);
    add(scr, tbar, wrap, menu, el('div', 'sk-ver', 'v1.0 · Slime Reborn'));

    titleState.pill = pill; titleState.rec = rec; titleState.hero = hero; titleState.tipEl = tip;
    const souls = d.souls | 0;
    if (titleState.soulsShown < 0 || titleState.soulsShown === souls) pill._num.textContent = String(souls);
    else countUp(pill._num, souls, { from: titleState.soulsShown, dur: 0.9, screen: 'title' });
    titleState.soulsShown = souls;
    try { if (SK.Audio && SK.Audio.music) SK.Audio.music('title'); } catch (e) { /* audio optional */ }
  };
  refreshers.title = () => {
    const d = saveData();
    const souls = d.souls | 0;
    if (titleState.pill && titleState.soulsShown !== souls) {
      countUp(titleState.pill._num, souls, { from: titleState.soulsShown < 0 ? souls : titleState.soulsShown, dur: 0.7, screen: 'title' });
      restartAnim(titleState.pill, 'bump');
    }
    titleState.soulsShown = souls;
    if (titleState.rec && titleState.rec.parentNode) { const r = recordNode(d); titleState.rec.parentNode.replaceChild(r, titleState.rec); titleState.rec = r; }
    if (titleState.hero && titleState.hero.parentNode) { const h = heroNode(d); titleState.hero.parentNode.replaceChild(h, titleState.hero); titleState.hero = h; }
  };
  function tickTitle(dt) {
    const sc = screens.title;
    if (!sc || !sc.open || sc.covered || !titleState.tipEl) return;
    titleState.tipT += dt;
    if (titleState.tipT > 6.5 && !titleState.tipEl.classList.contains('fade')) titleState.tipEl.classList.add('fade');
    if (titleState.tipT > 7.1) {
      titleState.tipT = 0;
      titleState.tipI = (titleState.tipI + 1) % TIPS.length;
      titleState.tipEl.textContent = TIPS[titleState.tipI];
      titleState.tipEl.classList.remove('fade');
    }
  }
  function onPlay() {
    const startRun = (cfg) => safe(() => { if (SK.Game && SK.Game.newRun) SK.Game.newRun(cfg || saveData().character); });
    const C = SK.Character;
    if (C && typeof C.openCreator === 'function') {
      closeScreen('title', true);
      try { C.openCreator(startRun); watchStart(); } catch (e) { console.error(e); startRun(saveData().character); }
    } else if (SK.Game && SK.Game.newRun) {
      closeScreen('title', true);
      startRun(saveData().character);
    } else {
      toast('Il gioco non è ancora pronto', '#ff8a80');
    }
  }
  function onNation() {
    if (SK.Nation && typeof SK.Nation.open === 'function') {
      closeScreen('title', true);
      try { SK.Nation.open(); watchStart(); } catch (e) { console.error(e); show('title'); }
    } else {
      toast('La Nazione non è ancora disponibile', '#b388ff');
    }
  }

  /* =============================================================== SHOP */
  builders.shop = (scr) => {
    const d = saveData();
    if (!d.upgrades) d.upgrades = {};
    const page = el('div', 'sk-page sk-in');
    const head = pageHeader('Negozio delle Anime', 'shop');
    const pill = soulsPill('shop');
    head.appendChild(pill);
    const info = el('div', 'sk-muted', 'Potenziamenti permanenti applicati a ogni nuova partita. Spendi le Anime raccolte sconfiggendo i mostri.');
    info.style.fontSize = '0.82em';
    const scroll = el('div', 'sk-scroll');
    scroll.style.flex = '1 1 auto';
    scroll.style.minHeight = '0';
    const grid = el('div', 'sk-grid');
    const items = (SK.Game && Array.isArray(SK.Game.shopItems)) ? SK.Game.shopItems : [];
    const cards = [];
    if (!items.length) grid.appendChild(el('div', 'sk-muted', 'Il mercante non è ancora arrivato… torna più tardi.'));
    const refreshAll = () => { for (const c of cards) c._upd(); };
    for (const item of items) { const c = shopCard(item, pill, refreshAll); cards.push(c); grid.appendChild(c); }
    scroll.appendChild(grid);
    const foot = el('div', 'sk-header');
    foot.style.justifyContent = 'flex-end';
    foot.style.minHeight = '0';
    const spent = totalSpent(items);
    if (spent > 0) {
      foot.appendChild(button('Rimborsa tutto (' + fmtBig(spent) + ')', 'small ghost', () => {
        confirmDialog('Rimborso', 'Annullare tutti i potenziamenti e recuperare ' + fmtBig(spent) + ' Anime?', () => {
          const dd = saveData();
          dd.souls = (dd.souls | 0) + spent;
          dd.upgrades = {};
          writeSave();
          sfx('coin');
          toast('+' + fmtBig(spent) + ' Anime recuperate', '#d7c2ff');
          show('shop');
        }, { yesLabel: 'Rimborsa' });
      }, { sfx: 'ui' }));
    }
    add(page, head, info, scroll, foot);
    scr.appendChild(page);
  };
  function totalSpent(items) {
    const d = saveData();
    let sum = 0;
    for (const it of items) {
      const lvl = (d.upgrades && d.upgrades[it.id]) | 0;
      for (let l = 0; l < lvl; l++) sum += costOf(it, l);
    }
    return sum;
  }
  function shopCard(item, pill, refreshAll) {
    const card = el('div', 'sk-card sk-shop-item');
    const ic = el('div', 'ic');
    ic.appendChild(glyphCanvas(SHOP_GLYPH[item.id] || STAT_GLYPH[item.id] || 'star', 40));
    const txt = el('div', 'txt');
    const pips = el('div', 'sk-pips');
    const maxL = Math.max(1, item.maxLevel | 0 || 1);
    for (let i = 0; i < maxL; i++) pips.appendChild(el('i'));
    add(txt, el('div', 'nm', item.name || item.id), el('div', 'ds', item.desc || ''), pips);
    const buy = el('button', 'sk-btn small buy');
    buy.type = 'button';
    const bl = el('span'), bc = el('small');
    add(buy, bl, bc);
    add(card, ic, txt, buy);
    card._upd = () => {
      const d = saveData();
      const lvl = (d.upgrades && d.upgrades[item.id]) | 0;
      for (let i = 0; i < pips.children.length; i++) pips.children[i].classList.toggle('on', i < lvl);
      if (lvl >= maxL) {
        card.classList.add('maxed');
        buy.className = 'sk-btn small buy gold';
        bl.textContent = 'MAX';
        bc.textContent = 'Completo';
      } else {
        const cost = costOf(item, lvl);
        const poor = (d.souls | 0) < cost;
        buy.className = 'sk-btn small buy ' + (poor ? 'ghost poor' : 'primary');
        bl.textContent = 'Compra';
        bc.textContent = fmtBig(cost) + ' anime';
      }
    };
    let last = 0;
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      const n = now();
      if (n - last < 200) return;
      last = n;
      const d = saveData();
      if (!d.upgrades) d.upgrades = {};
      const lvl = d.upgrades[item.id] | 0;
      if (lvl >= maxL) { sfx('uiBack'); return; }
      const cost = costOf(item, lvl);
      if ((d.souls | 0) < cost) {
        sfx('uiBack');
        restartAnim(card, 'sk-shake');
        toast('Anime insufficienti', '#ff8a80');
        return;
      }
      const before = d.souls | 0;
      d.souls = before - cost;
      d.upgrades[item.id] = lvl + 1;
      writeSave();
      sfx('coin');
      sfx('select', { pitch: 1 + lvl * 0.07 });
      if (SK.vibrate) SK.vibrate(12);
      restartAnim(card, 'bought');
      refreshAll();
      const pip = pips.children[lvl];
      if (pip) restartAnim(pip, 'pop');
      const fl = el('div', 'sk-float', '-' + fmtBig(cost));
      fl.style.right = '18px';
      fl.style.top = '6px';
      card.appendChild(fl);
      setTimeout(() => fl.remove(), 950);
      countUp(pill._num, d.souls, { from: before, dur: 0.45, screen: 'shop' });
      restartAnim(pill, 'bump');
      if (lvl + 1 >= maxL) toast((item.name || 'Potenziamento') + ' al massimo!', '#ffd54f');
    });
    card._upd();
    return card;
  }

  /* =========================================================== BESTIARY */
  function knownEnemy(id) {
    const e = (saveData().bestiary || {})[id];
    return !!(e && ((e.seen | 0) > 0 || (e.kills | 0) > 0 || (e.absorbed | 0) > 0));
  }
  function sortedEnemyIds() {
    const types = enemyTypes();
    const ids = Object.keys(types);
    const bi = (id) => { const k = BIOME_ORDER.indexOf(types[id].biome); return k < 0 ? 9 : k; };
    return ids.map((id, i) => ({ id, i })).sort((a, b) => (bi(a.id) - bi(b.id)) || ((types[a.id].boss ? 1 : 0) - (types[b.id].boss ? 1 : 0)) || (a.i - b.i)).map((o) => o.id);
  }
  builders.bestiary = (scr) => {
    const types = enemyTypes();
    const ids = sortedEnemyIds();
    const page = el('div', 'sk-page sk-in');
    const head = pageHeader('Bestiario', 'bestiary');
    const nKnown = ids.filter(knownEnemy).length;
    const prog = el('div', 'sk-progress');
    add(prog, document.createTextNode('Scoperti '), el('b', null, nKnown + ' / ' + ids.length));
    head.appendChild(prog);
    const split = el('div', 'sk-split');
    const scroll = el('div', 'sk-scroll');
    const detail = el('div', 'sk-panel sk-detail');
    add(split, scroll, detail);
    add(page, head, split);
    scr.appendChild(page);
    if (!ids.length) { scroll.appendChild(el('div', 'sk-muted', 'Nessuna creatura registrata.')); return; }

    let mHp = 1, mDmg = 1, mSpd = 1;
    for (const id of ids) { const t = types[id]; if (t.boss) continue; mHp = max(mHp, t.hp || 0); mDmg = max(mDmg, t.dmg || 0); mSpd = max(mSpd, t.speed || 0); }

    const sel = { id: null, card: null };
    const big = makeCanvas(130, 130, 'big', true);
    animate('bestiary', big, (ctx, w, h, T) => { if (sel.id) drawMonsterPortrait(ctx, w, h, sel.id, T, knownEnemy(sel.id)); });
    const info = el('div');
    info.style.display = 'flex'; info.style.flexDirection = 'column'; info.style.gap = '8px';
    add(detail, big, info);

    const select = (id, card) => {
      if (sel.card) sel.card.classList.remove('sel');
      sel.id = id; sel.card = card;
      if (card) card.classList.add('sel');
      info.textContent = '';
      const t = types[id];
      const known = knownEnemy(id);
      const rec = (saveData().bestiary || {})[id] || {};
      info.appendChild(el('h3', null, known ? t.name : '???'));
      const tags = el('div', 'tags');
      tags.appendChild(el('span', 'sk-tag cyan', biomeNameById(t.biome)));
      if (t.boss) tags.appendChild(el('span', 'sk-tag boss', 'Boss'));
      if (known && t.nameable) tags.appendChild(el('span', 'sk-tag gold', 'Nominabile'));
      info.appendChild(tags);
      info.appendChild(el('p', null, known ? (t.desc || '') : 'Non hai ancora incontrato questa creatura. Esplora i biomi per registrarla.'));
      const s3 = el('div', 'sk-stats3');
      for (const [lbl, v] of [['Avvistati', rec.seen], ['Sconfitti', rec.kills], ['Divorati', rec.absorbed]]) {
        const cell = el('div'); add(cell, el('b', null, fmtBig(v | 0)), el('span', null, lbl)); s3.appendChild(cell);
      }
      info.appendChild(s3);
      if (known) {
        const bars = el('div', 'sk-bars');
        const rel = (v, m) => clamp((v || 0) / m, 0.05, 1);
        for (const [lbl, r] of [['Vita', t.boss ? 1 : rel(t.hp, mHp)], ['Danno', t.boss ? 1 : rel(t.dmg, mDmg)], ['Velocità', rel(t.speed, mSpd)]]) {
          const row = el('div', 'b'); const bar = el('i'); bar.style.setProperty('--w', round(r * 100) + '%');
          add(row, el('span', null, lbl), bar); bars.appendChild(row);
        }
        info.appendChild(bars);
        if (t.nameable && t.allyName) info.appendChild(el('p', null, 'Forma alleata: ' + t.allyName));
      }
      const ess = el('div', 'sk-ess');
      const def = t.essence ? skillDefs()[t.essence] : null;
      const foundSkill = def && (saveData().skillsFound || {})[t.essence];
      if (def) {
        const ic = makeCanvas(30, 30);
        const c2 = prep(ic);
        if (def.drawIcon) safe(() => def.drawIcon(c2, 15, 15, 28, 0));
        if (!foundSkill) silhouette(c2, 30, 30);
        add(ess, ic, el('span', null, 'Essenza: ' + (foundSkill ? def.name : '???')));
      } else if (t.biome === 'demon' && !t.boss) {
        add(ess, glyphCanvas('soul', 30), el('span', null, 'Essenza: riflette un\'abilità che già possiedi'));
      } else {
        add(ess, glyphCanvas('lock', 30, '#5f6b8f'), el('span', null, 'Nessuna essenza'));
      }
      info.appendChild(ess);
    };

    let firstCard = null, firstId = null;
    for (const biome of BIOME_ORDER.concat(['?'])) {
      const list = ids.filter((id) => (biome === '?' ? BIOME_ORDER.indexOf(types[id].biome) < 0 : types[id].biome === biome));
      if (!list.length) continue;
      scroll.appendChild(el('div', 'sk-h2', biome === '?' ? 'Altro' : biomeNameById(biome)));
      const grid = el('div', 'sk-bgrid');
      for (const id of list) {
        const t = types[id];
        const known = knownEnemy(id);
        const rec = (saveData().bestiary || {})[id] || {};
        const card = el('div', 'sk-card clickable sk-bcard' + (t.boss ? ' boss' : '') + (known ? '' : ' unknown'));
        const cv = makeCanvas(70, 70, null, true);
        animate('bestiary', cv, (ctx, w, h, T) => drawMonsterPortrait(ctx, w, h, id, T + id.length, known));
        add(card, cv, el('div', 'nm', known ? t.name : '???'), el('div', 'ct', known ? fmtBig(rec.kills | 0) + ' sconfitti' : '—'));
        card.addEventListener('click', () => { sfx('ui'); select(id, card); });
        grid.appendChild(card);
        if (!firstCard || (known && !knownEnemy(firstId))) { if (!firstCard || !knownEnemy(firstId)) { firstCard = card; firstId = id; } }
      }
      scroll.appendChild(grid);
    }
    if (firstCard) select(firstId, firstCard);
  };

  /* ======================================================= SKILL CODEX */
  builders.skills = (scr) => {
    const defs = skillDefs();
    const ids = ((SK.Skills && SK.Skills.ids) || Object.keys(defs)).filter((id) => defs[id]);
    const found = saveData().skillsFound || {};
    const page = el('div', 'sk-page sk-in');
    const head = pageHeader('Codice delle Abilità', 'skills');
    const nFound = ids.filter((id) => found[id]).length;
    const prog = el('div', 'sk-progress');
    add(prog, document.createTextNode('Scoperte '), el('b', null, nFound + ' / ' + ids.length));
    head.appendChild(prog);
    const split = el('div', 'sk-split');
    const scroll = el('div', 'sk-scroll');
    const detail = el('div', 'sk-panel sk-detail');
    add(split, scroll, detail);
    add(page, head, split);
    scr.appendChild(page);
    if (!ids.length) { scroll.appendChild(el('div', 'sk-muted', 'Nessuna abilità registrata.')); return; }

    const sel = { id: null, card: null };
    const big = makeCanvas(130, 130, 'big', true);
    animate('skills', big, (ctx, w, h, T) => {
      if (!sel.id) return;
      const def = defs[sel.id];
      glow(ctx, w / 2, h / 2, w * 0.5, def.color || '#4fc3ff', found[sel.id] ? 0.45 : 0.12);
      if (def.drawIcon) def.drawIcon(ctx, w / 2, h / 2 + sin(T * 2) * 3, w * 0.7, T);
      if (!found[sel.id]) silhouette(ctx, w, h);
    });
    const info = el('div');
    info.style.display = 'flex'; info.style.flexDirection = 'column'; info.style.gap = '8px';
    add(detail, big, info);

    const select = (id, card) => {
      if (sel.card) sel.card.classList.remove('sel');
      sel.id = id; sel.card = card;
      if (card) card.classList.add('sel');
      info.textContent = '';
      const def = defs[id];
      const known = !!found[id];
      info.appendChild(el('h3', null, known ? def.name : '???'));
      const tags = el('div', 'tags');
      tags.appendChild(el('span', 'sk-tag' + (def.kind === 'active' ? ' gold' : def.kind === 'passive' ? '' : ' cyan'), KIND_LABEL[def.kind] || def.kind));
      if (known && def.element) {
        const tg = el('span', 'sk-tag', ELEMENT_LABEL[def.element] || def.element);
        if (def.color) { tg.style.color = def.color; tg.style.borderColor = def.color; }
        tags.appendChild(tg);
      }
      info.appendChild(tags);
      info.appendChild(el('p', null, known ? (def.desc || '') : 'Abilità sconosciuta. Divora l\'essenza della creatura giusta per apprenderla.'));
      const src = def.source && enemyTypes()[def.source];
      if (src) info.appendChild(el('p', null, 'Origine: ' + (knownEnemy(def.source) ? src.name : '???')));
      else if (def.source == null && known) info.appendChild(el('p', null, 'Origine: abilità innata'));
      if (known && def.kind === 'active' && def.mpCost) info.appendChild(el('p', null, 'Costo: ' + def.mpCost + ' MP'));
      if (known) {
        const lvls = Array.isArray(def.levels) ? def.levels : null;
        const ul = el('ul', 'sk-lvlist');
        const maxL = def.maxLevel || 5;
        for (let L = 1; L <= maxL; L++) {
          let txt = lvls ? lvls[L - 1] : null;
          if (!txt && L > 1 && def.levelDesc) txt = safe(() => def.levelDesc(L - 1));
          if (!txt) continue;
          const li = el('li');
          add(li, el('b', null, 'Lv ' + L), document.createTextNode(String(txt)));
          ul.appendChild(li);
        }
        if (ul.children.length) info.appendChild(ul);
      }
    };

    let first = null;
    const groups = [['auto', 'Abilità automatiche'], ['passive', 'Abilità passive'], ['active', 'Abilità uniche (attive)']];
    for (const [kind, label] of groups) {
      const list = ids.filter((id) => defs[id].kind === kind);
      if (!list.length) continue;
      scroll.appendChild(el('div', 'sk-h2', label));
      const grid = el('div', 'sk-bgrid');
      for (const id of list) {
        const def = defs[id];
        const known = !!found[id];
        const card = el('div', 'sk-card clickable sk-bcard small' + (known ? '' : ' unknown'));
        if (known && def.color) card.style.setProperty('--rc', U.rgba(def.color, 0.55));
        const cv = makeCanvas(54, 54, null, true);
        animate('skills', cv, (ctx, w, h, T) => {
          if (def.drawIcon) def.drawIcon(ctx, w / 2, h / 2, w * 0.86, T);
          if (!known) silhouette(ctx, w, h);
        });
        add(card, cv, el('div', 'nm', known ? def.name : '???'), el('div', 'ct', KIND_LABEL[def.kind] || ''));
        card.addEventListener('click', () => { sfx('ui'); select(id, card); });
        grid.appendChild(card);
        if (!first || (known && !found[first.id])) { if (!first || !found[first.id]) first = { id, card }; }
      }
      scroll.appendChild(grid);
    }
    if (first) select(first.id, first.card);
  };

  /* ============================================================ SETTINGS */
  function applyQualityClass() {
    if (!root) return;
    root.classList.remove('q-high', 'q-medium', 'q-low');
    root.classList.add('q-' + (SK.quality || 'high'));
  }
  function rangeRow(label, sub, value, onInput, onChange) {
    const row = el('div', 'sk-row');
    const lb = el('label');
    add(lb, document.createTextNode(label), sub ? el('small', null, sub) : null);
    const input = el('input', 'sk-range');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
    input.value = String(round(clamp(value, 0, 1) * 100));
    const val = el('span', 'sk-val', input.value + '%');
    const paint = () => { input.style.setProperty('--v', input.value + '%'); val.textContent = input.value + '%'; };
    paint();
    input.addEventListener('input', () => { paint(); onInput(+input.value / 100); });
    input.addEventListener('change', () => { paint(); onChange(+input.value / 100); });
    add(row, lb, input, val);
    return row;
  }
  function switchRow(label, sub, on, onToggle) {
    const row = el('div', 'sk-row');
    const lb = el('label');
    add(lb, document.createTextNode(label), sub ? el('small', null, sub) : null);
    const sw = el('button', 'sk-switch' + (on ? ' on' : ''));
    sw.type = 'button';
    sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    sw.addEventListener('click', () => {
      const v = !sw.classList.contains('on');
      sw.classList.toggle('on', v);
      sw.setAttribute('aria-pressed', v ? 'true' : 'false');
      sfx(v ? 'select' : 'uiBack');
      onToggle(v);
    });
    add(row, lb, sw);
    return row;
  }
  builders.settings = (scr) => {
    const fromPause = screens.settings.parent === 'pause';
    const s = settings();
    const page = el('div', 'sk-page sk-in');
    const head = pageHeader('Impostazioni', 'settings');
    const scroll = el('div', 'sk-scroll');
    scroll.style.flex = '1 1 auto'; scroll.style.minHeight = '0';
    const panel = el('div', 'sk-panel sk-settings sk-in2');
    const setVol = () => safe(() => { if (SK.Audio && SK.Audio.setVolumes) SK.Audio.setVolumes(s.music, s.sfx); });
    let lastPreview = 0;
    panel.appendChild(el('div', 'sk-h2', 'Audio'));
    panel.appendChild(rangeRow('Musica', 'Volume della colonna sonora', s.music != null ? s.music : 0.6,
      (v) => { s.music = v; setVol(); }, (v) => { s.music = v; setVol(); writeSave(); }));
    panel.appendChild(rangeRow('Effetti sonori', 'Colpi, abilità e interfaccia', s.sfx != null ? s.sfx : 0.8,
      (v) => { s.sfx = v; setVol(); const n = now(); if (n - lastPreview > 120) { lastPreview = n; sfx('ui'); } },
      (v) => { s.sfx = v; setVol(); writeSave(); sfx('select'); }));
    panel.appendChild(el('div', 'sk-h2', 'Gioco'));
    panel.appendChild(switchRow('Vibrazione', 'Feedback aptico su colpi e pulsanti', s.vibration !== false, (v) => {
      s.vibration = v; writeSave(); if (v && SK.vibrate) SK.vibrate(40);
    }));
    const qRow = el('div', 'sk-row');
    const qLb = el('label');
    add(qLb, document.createTextNode('Qualità grafica'), el('small', null, 'Riduci se il gioco rallenta'));
    const seg = el('div', 'sk-seg');
    for (const [q, lbl] of [['high', 'Alta'], ['medium', 'Media'], ['low', 'Bassa']]) {
      const b = el('button', (s.quality || 'high') === q ? 'on' : '', lbl);
      b.type = 'button';
      b.addEventListener('click', () => {
        for (const o of seg.children) o.classList.remove('on');
        b.classList.add('on');
        s.quality = q;
        safe(() => { if (SK.setQuality) SK.setQuality(q); else SK.quality = q; });
        applyQualityClass();
        hud.key = '';
        writeSave();
        sfx('select');
      });
      seg.appendChild(b);
    }
    add(qRow, qLb, seg);
    panel.appendChild(qRow);
    panel.appendChild(switchRow('Mostra FPS', 'Contatore dei fotogrammi al secondo', !!s.showFps, (v) => { s.showFps = v; writeSave(); }));
    if (!fromPause) {
      panel.appendChild(el('div', 'sk-h2', 'Dati'));
      const rr = el('div', 'sk-row');
      const lb = el('label');
      add(lb, document.createTextNode('Cancella salvataggio'), el('small', null, 'Anime, potenziamenti, bestiario e Nazione verranno azzerati'));
      rr.appendChild(lb);
      rr.appendChild(button('Cancella', 'small danger', () => {
        confirmDialog('Cancellare tutto?', 'Questa azione è irreversibile: tutti i progressi andranno perduti.', () => {
          safe(() => SK.save.reset());
          titleState.soulsShown = 0;
          sfx('explosion', { vol: 0.5 });
          toast('Salvataggio cancellato', '#ff8a80');
        }, { danger: true, yesLabel: 'Cancella' });
      }, { sfx: 'ui' }));
      panel.appendChild(rr);
    }
    panel.appendChild(el('div', 'sk-h2', 'Comandi'));
    const keys = el('div', 'sk-keys');
    const kb = [['WASD / Frecce', 'muovi'], ['Spazio', 'scatto'], ['E / Shift', 'Predatore'], ['1 2 3', 'abilità'], ['F', 'dai un nome'], ['Esc', 'pausa']];
    kb.forEach(([k, v], i) => { if (i) keys.appendChild(document.createTextNode(' · ')); keys.appendChild(el('kbd', null, k)); keys.appendChild(document.createTextNode(' ' + v)); });
    keys.appendChild(el('br'));
    keys.appendChild(document.createTextNode('Touch: trascina a sinistra per muoverti, usa i pulsanti a destra per le azioni.'));
    panel.appendChild(keys);
    scroll.appendChild(panel);
    add(page, head, scroll);
    scr.appendChild(page);
  };

  /* ============================================================= CREDITS */
  builders.credits = (scr) => {
    const d = saveData();
    const page = el('div', 'sk-page sk-in');
    const head = pageHeader('Crediti', 'credits');
    const scroll = el('div', 'sk-scroll');
    scroll.style.flex = '1 1 auto'; scroll.style.minHeight = '0';
    const box = el('div', 'sk-panel sk-credits');
    const lines = [
      ['h', 'SLIME REBORN'],
      ['sub', "L'Ascesa del Predatore"],
      ['p', 'Un action-roguelite originale: risvegliati come slime, divora i mostri, rubane i poteri ed evolvi fino a diventare un Re Demone.'],
      ['role', 'Realizzato con'], ['who', 'Claude Code · Anthropic'],
      ['role', 'Grafica, musica ed effetti'], ['who', '100% procedurali — nessun asset esterno'],
      ['role', 'Ispirazione'], ['who', 'Il genere fantasy dei mostri reincarnati'],
      ['role', 'Tributo'], ['trib', 'Dedicato a Pierfrancesco Del Bagno, l\'Imperatore Infinito.'],
      ['role', 'Le tue statistiche'],
      ['who', 'Partite: ' + (d.runs | 0) + ' · Vittorie: ' + (d.wins | 0) + ' · Anime totali: ' + fmtBig(d.totalSouls | 0)],
      ['p', 'Grazie per aver giocato!'],
    ];
    lines.forEach(([kind, text], i) => {
      let n;
      if (kind === 'h') n = el('h2', 'sk-title', text);
      else if (kind === 'sub') n = el('p', 'sk-subtitle', text);
      else if (kind === 'role') n = el('p', 'role', text);
      else if (kind === 'who') n = el('p', 'who', text);
      else if (kind === 'trib') n = el('p', 'tribute', text);
      else n = el('p', 'sk-muted', text);
      n.style.setProperty('--i', String(i));
      box.appendChild(n);
    });
    const crown = makeCanvas(48, 48);
    crown.style.alignSelf = 'center';
    crown.style.setProperty('--i', '10');
    animate('credits', crown, (ctx, w, h, T) => {
      glow(ctx, w / 2, h / 2, w * 0.5, '#ffb300', 0.35 + 0.15 * sin(T * 2));
      drawGlyph(ctx, 'crown', w / 2, h / 2 + sin(T * 2) * 2, w * 0.7, null, T);
    });
    box.insertBefore(crown, box.children[10] || null);
    scroll.appendChild(box);
    add(page, head, scroll);
    scr.appendChild(page);
  };

  /* =============================================================== PAUSE */
  builders.pause = (scr) => {
    const G = SK.G || {};
    const p = G.player || {};
    const panel = el('div', 'sk-panel sk-modal sk-pause');
    panel.appendChild(el('h1', 'sk-title', 'Pausa'));
    panel.appendChild(el('p', 'sk-subtitle', biomeInfo(G.biome | 0).name + ' · ' + stageName(p)));
    const chips = el('div', 'chips');
    const chip = (v, l) => { const c = el('div', 'chip'); add(c, el('b', null, v), el('span', null, l)); return c; };
    add(chips, chip(fmtTime(G.t || 0), 'Tempo'), chip(fmtBig(G.kills | 0), 'Uccisioni'), chip('Lv ' + (p.level || 1), 'Livello'), chip(fmtBig(G.soulsEarned | 0), 'Anime'));
    panel.appendChild(chips);
    const defs = skillDefs();
    const row = el('div', 'sk-iconrow');
    if (p.skills) {
      for (const id in p.skills) {
        const def = defs[id];
        if (!def) continue;
        const wrap = el('div', 'si');
        const cv = makeCanvas(38, 38);
        safe(() => def.drawIcon && def.drawIcon(prep(cv), 19, 19, 36, 0));
        wrap.title = def.name;
        add(wrap, cv, el('b', null, String(p.skills[id] | 0)));
        row.appendChild(wrap);
      }
    }
    if (row.children.length) panel.appendChild(row);
    const acts = el('div', 'acts');
    add(acts,
      button('Riprendi', 'primary', resumeGame, { glyph: 'play', sfx: 'select' }),
      button('Impostazioni', 'ghost', () => show('settings'), { glyph: 'gear' }),
      button('Abbandona', 'danger', () => confirmDialog('Abbandonare la partita?', 'Tornerai al menu principale e la corsa attuale terminerà.', quitRun, { danger: true, yesLabel: 'Abbandona' }), { sfx: 'ui' }));
    panel.appendChild(acts);
    scr.appendChild(panel);
  };
  function resumeGame() {
    for (const k of SUB) closeScreen(k, true);
    closeScreen('pause', true);
    closeConfirm();
    unblockIfIdle();
    safe(() => { if (SK.Game && SK.Game.resume) SK.Game.resume(); });
  }
  function quitRun() {
    hideAll();
    safe(() => { if (SK.Game && SK.Game.quitToTitle) SK.Game.quitToTitle(); });
    if (!screens.title.open) show('title');
  }
  function retryRun() {
    const cfg = saveData().character;
    hideAll();
    safe(() => { if (SK.Game && SK.Game.newRun) SK.Game.newRun(cfg); });
  }

  /* ===================================================== GAMEOVER/VICTORY */
  const FLAVOR_LOSS = [
    'Il tuo nucleo si è dissolto… ma l\'anima ricorda ogni battaglia.',
    'Anche la gelatina più tenace a volte si sbriciola. Rialzati!',
    'L\'Oracolo annota: «Sconfitta registrata. Probabilità di rivincita: alta».',
    'I mostri festeggiano, ma solo fino al tuo ritorno.',
  ];
  function buildEnd(scr, data, win) {
    const name = win ? 'victory' : 'gameover';
    const G = SK.G || {};
    const p = G.player || {};
    const st = G.stats || {};
    const d = saveData();
    scr.appendChild(el('div', win ? 'sk-victory-bg' : 'sk-gameover-bg'));
    const panel = el('div', 'sk-panel sk-end ' + (win ? 'gold' : 'red'));
    panel.style.animation = 'skPopIn 0.45s cubic-bezier(.2,1.4,.4,1) both';
    const side = el('div', 'side');
    const pc = makeCanvas(150, 150, null, true);
    animate(name, pc, (ctx, w, h, T) => {
      glow(ctx, w / 2, h / 2, w * 0.55, win ? '#ffb300' : '#ff1744', win ? 0.5 : 0.25);
      drawHeroPortrait(ctx, w, h, p, T, win ? 'happy' : 'hurt');
      if (!win) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#ff1744';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      } else {
        drawGlyph(ctx, 'crown', w / 2, h * 0.14 + sin(T * 2) * 3, w * 0.24, null, T);
      }
    });
    add(side, pc, el('div', 'sk-tag ' + (win ? 'gold' : 'boss'), stageName(p) || (win ? 'Re Demone' : 'Slime')));
    const main = el('div', 'main');
    main.appendChild(el('h1', 'sk-title ' + (win ? 'gold' : 'red'), win ? 'Vittoria!' : 'Sconfitta'));
    main.appendChild(el('p', 'flavor', win ? 'Il Re Demone è caduto: il tuo nome risuonerà in ogni era.' : U.choice(FLAVOR_LOSS)));
    if (win && d.nightmare && (d.wins | 0) <= 1) main.appendChild(el('span', 'sk-tag boss sk-newrec', 'Modalità Incubo sbloccata!'));
    const list = el('div', 'sk-statlist');
    const rows = [
      ['Tempo', data.time != null ? data.time : G.t || 0, fmtTime],
      ['Uccisioni', data.kills != null ? data.kills : G.kills | 0, fmtBig],
      ['Livello', data.level != null ? data.level : p.level || 1, fmtInt],
      ['Evoluzione', stageName(p), null],
      ['Bioma', ((G.biome | 0) + 1) + '/4 · ' + biomeInfo(G.biome | 0).name, null],
      ['Danni inflitti', st.damageDealt || 0, fmtBig],
      ['Essenze divorate', st.absorbed | 0, fmtInt],
      ['Mostri nominati', st.named | 0, fmtInt],
      ['Combo massima', st.maxCombo | 0, fmtInt],
      ['Punteggio', data.score != null ? data.score : G.score || 0, fmtBig],
    ];
    let delay = 0.45;
    rows.forEach(([lbl, v, fmt], i) => {
      const row = el('div', 'sk-stat');
      const b = el('b', null, fmt ? fmt(0) : String(v));
      add(row, el('span', null, lbl), b);
      list.appendChild(row);
      const onStart = () => { row.classList.add('on'); sfx('xp', { pitch: 0.9 + i * 0.05, vol: 0.45 }); };
      if (fmt) countUp(b, +v || 0, { delay, dur: 0.5, fmt, screen: name, onStart });
      else countUp(b, 0, { delay, dur: 0, fmt: () => String(v), screen: name, onStart });
      delay += 0.13;
    });
    main.appendChild(list);
    const soulsBox = el('div', 'sk-soulsbig');
    const sc = makeCanvas(34, 34);
    animate(name, sc, (ctx, w, h, T) => drawGlyph(ctx, 'soul', w / 2, h / 2, w * 0.92, null, T));
    const sb = el('b', null, '0');
    add(soulsBox, sc, sb, el('span', null, 'Anime ottenute'));
    main.appendChild(soulsBox);
    const souls = data.souls != null ? +data.souls : G.soulsEarned | 0;
    countUp(sb, souls, {
      delay: delay + 0.15, dur: 0.9, screen: name, fmt: fmtBig,
      onStart: () => { soulsBox.classList.add('on'); if (souls > 0) sfx('coin'); },
      onEnd: () => { if (souls > 0) { sfx('pickup'); soulsBox.style.animation = 'none'; void soulsBox.offsetWidth; soulsBox.style.animation = 'skPop 0.45s cubic-bezier(.3,1.8,.5,1)'; } },
    });
    const best = d.best || {};
    const rec = data.newRecord != null ? !!data.newRecord : ((G.t || 0) > 5 && (G.t || 0) >= (best.time || 0) - 0.05);
    if (rec) {
      const nr = el('span', 'sk-tag gold sk-newrec', 'Nuovo record!');
      nr.style.visibility = 'hidden';
      main.appendChild(nr);
      countUp(el('i'), 0, { delay: delay + 1.1, dur: 0, screen: name, onStart: () => { nr.style.visibility = 'visible'; restartAnim(nr, 'sk-newrec'); sfx('levelup', { vol: 0.6 }); } });
    }
    const acts = el('div', 'acts locked');
    add(acts,
      button('Riprova', 'primary', retryRun, { glyph: 'play', sfx: 'select' }),
      button('Menu', 'ghost', quitRun, { sfx: 'uiBack' }));
    main.appendChild(acts);
    setTimeout(() => acts.classList.remove('locked'), 850);
    add(panel, side, main);
    scr.appendChild(panel);
    scr.onclick = (e) => { if (!acts.contains(e.target)) finishCounts(name); };
    if (SK.debug && SK.debug.autoplay) {
      setTimeout(() => {
        if ((screens.gameover.open || screens.victory.open) && SK.G && (SK.G.state === 'gameover' || SK.G.state === 'victory')) retryRun();
      }, 3500 / max(1, SK.debug.speed || 1));
    }
  }
  builders.gameover = (scr, data) => buildEnd(scr, data, false);
  builders.victory = (scr, data) => buildEnd(scr, data, true);

  /* ============================================================= CONFIRM */
  const cf = { open: false, el: null, yes: null, no: null };
  function confirmDialog(title, msg, onYes, opts) {
    if (!inited) init();
    closeConfirm(true);
    opts = opts || {};
    const wrap = el('div', 'sk-screen sk-own sk-center sk-dim active');
    wrap.style.zIndex = '60';
    const panel = el('div', 'sk-panel sk-modal' + (opts.danger ? ' red' : ''));
    const h = el('h2', 'sk-title' + (opts.danger ? ' red' : ''), title);
    h.style.fontSize = '1.5em';
    add(panel, h, msg ? el('p', 'msg', msg) : null);
    const acts = el('div', 'acts');
    const doNo = () => { closeConfirm(); if (opts.onNo) safe(opts.onNo); };
    const doYes = () => { closeConfirm(); if (onYes) safe(onYes); };
    add(acts,
      button(opts.noLabel || 'Annulla', 'ghost', doNo, { sfx: 'uiBack' }),
      button(opts.yesLabel || 'Conferma', opts.danger ? 'danger' : 'primary', doYes, { sfx: 'select' }));
    panel.appendChild(acts);
    wrap.appendChild(panel);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) { sfx('uiBack'); doNo(); } });
    root.appendChild(wrap);
    ownEls.add(wrap);
    cf.open = true; cf.el = wrap; cf.yes = doYes; cf.no = doNo;
    blockInput();
  }
  function closeConfirm(silent) {
    if (!cf.open) return;
    cf.open = false;
    const w = cf.el;
    cf.el = null; cf.yes = null; cf.no = null;
    if (w) {
      w.classList.remove('active');
      setTimeout(() => { w.remove(); ownEls.delete(w); }, 320);
    }
    if (!silent) unblockIfIdle();
  }

  /* ============================================================= LEVEL UP */
  const lv = { open: false, el: null, cards: [], choices: null, onPick: null, lockUntil: 0, hl: -1, token: 0, picked: false };

  function levelUp(choices, onPick) {
    if (!inited) init();
    if (lv.open || lv.el) closeLevelUp(true);
    const list = Array.isArray(choices) ? choices.slice(0, 4) : [];
    if (!list.length) { safe(() => onPick && onPick(null, -1)); return; }
    const tok = ++lv.token;
    lv.open = true; lv.picked = false; lv.choices = list; lv.onPick = onPick || null; lv.hl = -1; lv.cards = [];
    const touch = !!(SK.input && SK.input.touchUsed);
    const wrap = el('div', 'sk-levelup sk-own locked' + (touch ? ' touch' : ''));
    wrap.style.zIndex = '45';
    const p = (SK.G && SK.G.player) || {};
    const head = el('div', 'sk-lvhead');
    add(head,
      el('h1', 'sk-title gold', 'Livello superiore!'),
      el('div', 'sub', 'Livello ' + (p.level || 1) + ' · ' + (touch ? 'Tocca una carta' : 'Scegli una carta (1-' + list.length + ')')));
    const row = el('div', 'sk-lvcards');
    const defs = skillDefs();
    list.forEach((ch, i) => {
      const rar = RARITY_LABEL[ch.rarity] ? ch.rarity : 'comune';
      const card = el('div', 'sk-lvcard r-' + rar);
      card.style.setProperty('--i', String(i));
      const inner = el('div', 'in');
      inner.appendChild(el('div', 'key', String(i + 1)));
      if (ch.tag) {
        const isNew = /nuov/i.test(String(ch.tag));
        inner.appendChild(el('div', 'tg' + (isNew ? ' new' : ''), String(ch.tag)));
      }
      const ic = el('div', 'ic');
      const cv = makeCanvas(76, 76, null, true);
      ic.appendChild(cv);
      const icon = ch.icon || {};
      const def = icon.skillId ? defs[icon.skillId] : null;
      const gkind = icon.stat ? (STAT_GLYPH[icon.stat] || icon.stat) : (ch.id && STAT_GLYPH[ch.id]) || 'star';
      const rcol = rar === 'leggendario' ? '#ffb300' : rar === 'epico' ? '#b388ff' : rar === 'raro' ? '#4fc3ff' : rar === 'mitico' ? '#ff5cf0' : '#b0bec5';
      animate('levelup', cv, (ctx, w, h, T) => {
        const gc = rar === 'mitico' ? STAGE_RING[(floor(T * 3) % 4 + 4) % 4] : (def && def.color) || GLYPH_COLOR[gkind] || rcol;
        glow(ctx, w / 2, h / 2, w * 0.5, gc, 0.42 + 0.14 * sin(T * 3 + i));
        const bob = sin(T * 2.2 + i * 0.9) * 2.5;
        if (def && def.drawIcon) def.drawIcon(ctx, w / 2, h / 2 + bob, w * 0.8, T);
        else drawGlyph(ctx, gkind, w / 2, h / 2 + bob, w * 0.68, null, T);
      });
      add(inner, ic, el('div', 'rr', RARITY_LABEL[rar]), el('div', 'tt', ch.title || ''), el('div', 'ds', ch.desc || ''));
      card.appendChild(inner);
      card.addEventListener('click', (e) => { e.stopPropagation(); pickCard(i); });
      card.addEventListener('pointerenter', () => setHl(i));
      row.appendChild(card);
      lv.cards.push(card);
      setTimeout(() => { if (lv.token === tok && lv.open) sfx('ui', { pitch: 0.9 + i * 0.14, vol: 0.55 }); }, 140 + i * 120);
    });
    add(wrap, head, row);
    root.appendChild(wrap);
    ownEls.add(wrap);
    lv.el = wrap;
    lv.lockUntil = now() + 350;
    setTimeout(() => { if (lv.token === tok && !lv.picked) wrap.classList.remove('locked'); }, 360);
    blockInput();
    ensureLoop();
    if (SK.debug && SK.debug.autoplay) {
      setTimeout(() => { if (lv.open && lv.token === tok) { lv.lockUntil = 0; pickCard(0); } }, 700 / max(1, SK.debug.speed || 1));
    }
  }
  function setHl(i) {
    if (!lv.open || lv.picked) return;
    lv.hl = i;
    for (let k = 0; k < lv.cards.length; k++) lv.cards[k].classList.toggle('hl', k === i);
  }
  function pickCard(i) {
    if (!lv.open || lv.picked || i < 0 || i >= lv.cards.length) return;
    if (now() < lv.lockUntil) return;
    lv.picked = true;
    const tok = lv.token;
    const choice = lv.choices[i];
    const cb = lv.onPick;
    sfx('select');
    if (SK.vibrate) SK.vibrate(15);
    lv.cards.forEach((c, k) => { c.classList.remove('hl'); c.classList.add(k === i ? 'picked' : 'discard'); });
    if (lv.el) lv.el.classList.add('locked');
    setTimeout(() => {
      if (lv.token !== tok) return;
      closeLevelUp(true);
      safe(() => { if (cb) cb(choice, i); });
      unblockIfIdle();
    }, 380);
  }
  function closeLevelUp(silent) {
    if (!lv.open && !lv.el) return;
    lv.open = false;
    lv.token++;
    stopAnims('levelup');
    const w = lv.el;
    lv.el = null; lv.cards = []; lv.choices = null; lv.onPick = null;
    if (w) {
      w.classList.add('out');
      setTimeout(() => { w.remove(); ownEls.delete(w); }, 320);
    }
    if (!silent) unblockIfIdle();
  }

  /* =============================================================== NAMING */
  const nm = { open: false, el: null, input: null, token: 0, confirm: null, cancel: null };

  function namingDialog(monster, suggestedName, onConfirm, onCancel) {
    if (!inited) init();
    if (nm.open) closeNaming(true);
    const tok = ++nm.token;
    const m = monster || {};
    const def = m.def || enemyTypes()[m.type] || {};
    const suggested = String(suggestedName || randomName()).slice(0, 16);
    const wrap = el('div', 'sk-screen sk-own sk-center sk-dim sk-naming active');
    wrap.style.zIndex = '55';
    const panel = el('div', 'sk-panel sk-modal gold');
    const pt = el('div', 'pt');
    const cv = makeCanvas(120, 120, null, true);
    pt.appendChild(cv);
    animate('naming', cv, (ctx, w, h, T) => {
      glow(ctx, w / 2, h / 2, w * 0.5, '#ffd54f', 0.3 + 0.12 * sin(T * 2.5));
      if (m.type && enemyTypes()[m.type]) drawMonsterPortrait(ctx, w, h, m.type, T, true);
      else drawGlyph(ctx, 'paw', w / 2, h / 2, w * 0.5, def.color || '#4fc3ff', T);
      ctx.save();
      ctx.globalAlpha = 0.85;
      for (let k = 0; k < 3; k++) {
        const a = T * 1.4 + k * TAU / 3;
        drawGlyph(ctx, 'star', w / 2 + cos(a) * w * 0.42, h / 2 + sin(a) * h * 0.16 - h * 0.3, w * 0.09, '#ffe082', T);
      }
      ctx.restore();
    });
    const col = el('div', 'col');
    const h = el('h2', 'sk-title gold', 'Dai un Nome');
    h.style.fontSize = '1.5em';
    h.style.textAlign = 'left';
    const kind = def.name || 'La creatura';
    const becomes = def.allyName ? ' Diventerà un ' + def.allyName + ' e' : ' Diventerà tua alleata e';
    const txt = el('p', null, kind + ' ti osserva incuriosito.' + becomes + ' combatterà al tuo fianco per sempre.');
    const cost = el('p', 'sk-gold-text', 'Conferire un Nome consuma il 40% dei tuoi MP.');
    cost.style.fontSize = '0.74em';
    const inrow = el('div', 'inrow');
    const input = el('input', 'sk-input');
    input.type = 'text';
    input.value = suggested;
    input.maxLength = 16;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Nome');
    const dice = button('🎲', 'icon gold sk-dice', () => {
      input.value = randomName().slice(0, 16);
      restartAnim(dice, 'spin');
    }, { sfx: 'select' });
    dice.setAttribute('aria-label', 'Rinomina');
    dice.title = 'Rinomina';
    add(inrow, input, dice);
    const confirm = () => {
      if (!nm.open || nm.token !== tok) return;
      let name = String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, 16);
      if (!name) name = suggested;
      closeNaming(true);
      safe(() => { if (onConfirm) onConfirm(name); });
      unblockIfIdle();
    };
    const cancel = () => {
      if (!nm.open || nm.token !== tok) return;
      closeNaming(true);
      safe(() => { if (onCancel) onCancel(); });
      unblockIfIdle();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sfx('select'); confirm(); }
      else if (e.key === 'Escape') { e.preventDefault(); sfx('uiBack'); cancel(); }
      e.stopPropagation();
    });
    input.addEventListener('focus', () => wrap.classList.add('typing'));
    input.addEventListener('blur', () => wrap.classList.remove('typing'));
    const acts = el('div', 'acts');
    add(acts,
      button('Annulla', 'ghost', cancel, { sfx: 'uiBack' }),
      button('Dai il Nome', 'gold shine', confirm, { glyph: 'crown', glyphColor: '#7a4f00', sfx: 'select' }));
    add(col, h, txt, cost, inrow, acts);
    add(panel, pt, col);
    wrap.appendChild(panel);
    root.appendChild(wrap);
    ownEls.add(wrap);
    nm.open = true; nm.el = wrap; nm.input = input; nm.confirm = confirm; nm.cancel = cancel;
    blockInput();
    ensureLoop();
    if (!(SK.input && SK.input.touchUsed)) setTimeout(() => { if (nm.open && nm.token === tok) { try { input.focus(); input.select(); } catch (e) { /* ignore */ } } }, 60);
    if (SK.debug && SK.debug.autoplay) setTimeout(confirm, 600 / max(1, SK.debug.speed || 1));
  }
  function closeNaming(silent) {
    if (!nm.open) return;
    nm.open = false;
    nm.token++;
    stopAnims('naming');
    const w = nm.el;
    if (nm.input) { try { nm.input.blur(); } catch (e) { /* ignore */ } }
    nm.el = null; nm.input = null; nm.confirm = null; nm.cancel = null;
    if (w) {
      w.classList.remove('active');
      setTimeout(() => { w.remove(); ownEls.delete(w); }, 320);
    }
    if (!silent) unblockIfIdle();
  }

  /* =============================================================== ORACLE */
  const oracle = { el: null, tx: null, cur: null, queue: [], i: 0, acc: 0, hold: 0, phase: -1, outT: 0 };

  function showOracle(text, opts) {
    if (!inited) init();
    if (text == null || text === '') return;
    opts = opts || {};
    const msg = { text: String(text), important: !!opts.important, duration: +opts.duration || 0 };
    if (oracle.cur && oracle.phase < 2 && oracle.cur.text === msg.text) return;
    for (const q of oracle.queue) if (q.text === msg.text) return;
    if (msg.important) {
      let k = 0;
      while (k < oracle.queue.length && oracle.queue[k].important) k++;
      oracle.queue.splice(k, 0, msg);
    } else oracle.queue.push(msg);
    while (oracle.queue.length > 5) {
      let k = -1;
      for (let j = 0; j < oracle.queue.length; j++) if (!oracle.queue[j].important) { k = j; break; }
      oracle.queue.splice(k < 0 ? 0 : k, 1);
    }
    if (!oracle.cur || oracle.phase === 2) nextOracle();
    ensureLoop();
  }
  function nextOracle() {
    const m = oracle.queue.shift();
    const e = oracle.el;
    if (!m) {
      if (oracle.cur && oracle.phase !== 2) {
        oracle.phase = 2; oracle.outT = 0.36;
        e.classList.remove('show'); e.classList.add('hide');
      }
      return;
    }
    oracle.cur = m; oracle.i = 0; oracle.acc = 0; oracle.phase = 0;
    e.classList.remove('hide', 'done');
    e.classList.toggle('important', m.important);
    oracle.tx.textContent = '';
    restartAnim(e, 'show');
    sfx('oracle', m.important ? { vol: 1 } : { vol: 0.7 });
    if (m.important) safe(() => { if (SK.Audio && SK.Audio.duck) SK.Audio.duck(0.45, 2.5); });
  }
  function tickOracle(dt) {
    const m = oracle.cur;
    if (!m) return;
    if (oracle.phase === 0) {
      oracle.acc += dt * (m.important ? 38 : 46);
      const n = min(m.text.length, floor(oracle.acc));
      if (n !== oracle.i) { oracle.i = n; oracle.tx.textContent = m.text.slice(0, n); }
      if (n >= m.text.length) {
        oracle.phase = 1;
        oracle.el.classList.add('done');
        let hold = m.duration > 0 ? m.duration : clamp(1.5 + m.text.length * 0.032, 2.2, 5.5) * (m.important ? 1.3 : 1);
        if (oracle.queue.length) hold = min(hold, 1.3 + m.text.length * 0.012);
        oracle.hold = hold;
      }
    } else if (oracle.phase === 1) {
      oracle.hold -= dt;
      if (oracle.queue.length && oracle.hold > 1.4) oracle.hold = 1.4;
      if (oracle.hold <= 0) nextOracle();
    } else if (oracle.phase === 2) {
      oracle.outT -= dt;
      if (oracle.outT <= 0) {
        oracle.el.classList.remove('hide', 'show', 'done');
        oracle.cur = null; oracle.phase = -1;
        if (oracle.queue.length) nextOracle();
      }
    }
  }

  /* =============================================================== BANNER */
  const banner = { el: null, tt: null, st: null, cur: null, queue: [], t: 0, phase: -1, outT: 0 };

  function showBanner(title, subtitle, opts) {
    if (!inited) init();
    opts = opts || {};
    const ttl = String(title == null ? '' : title);
    const color = typeof opts.color === 'string' && opts.color ? opts.color : '#4fc3ff';
    const danger = opts.danger != null ? !!opts.danger : (/attenzione|boss|⚠/i.test(ttl) || /^#?ff(1|3|4|5)/i.test(color));
    const msg = { title: ttl, sub: subtitle == null ? '' : String(subtitle), color, danger, duration: +opts.duration > 0 ? +opts.duration : 2.6 };
    if (banner.cur && banner.phase === 0) {
      if (msg.danger && !banner.cur.danger) { banner.queue.length = 0; startBanner(msg); return; }
      if (banner.cur.title === msg.title) return;
      banner.queue.push(msg);
      if (banner.queue.length > 3) banner.queue.shift();
      if (banner.t > 1.1) banner.t = max(banner.t, banner.cur.duration - 0.6);
    } else if (banner.cur) {
      banner.queue.push(msg);
    } else startBanner(msg);
    ensureLoop();
  }
  function startBanner(m) {
    const e = banner.el;
    banner.cur = m; banner.t = 0; banner.phase = 0;
    e.style.setProperty('--bc', m.color);
    banner.tt.textContent = m.title;
    banner.st.textContent = m.sub;
    banner.st.style.display = m.sub ? '' : 'none';
    e.classList.remove('out');
    e.classList.toggle('danger', m.danger);
    restartAnim(e, 'show');
  }
  function tickBanner(dt) {
    const m = banner.cur;
    if (!m) return;
    banner.t += dt;
    if (banner.phase === 0) {
      if (banner.t >= m.duration) { banner.phase = 1; banner.outT = 0.5; banner.el.classList.add('out'); }
    } else if (banner.phase === 1) {
      banner.outT -= dt;
      if (banner.outT <= 0) {
        banner.el.classList.remove('show', 'out', 'danger');
        banner.cur = null; banner.phase = -1;
        const n = banner.queue.shift();
        if (n) startBanner(n);
      }
    }
  }

  /* =============================================================== TOASTS */
  const toasts = [];
  let toastBox = null;

  function toast(text, color) {
    if (!inited) init();
    if (text == null || text === '') return;
    const s = String(text);
    const last = toasts[toasts.length - 1];
    if (last && !last.out && last.text === s && last.t < 1.4) {
      last.n++;
      last.t = 0;
      last.el.textContent = s + '  ×' + last.n;
      restartAnim(last.el, 'bump');
      return;
    }
    const e = el('div', 'sk-toast', s);
    e.style.setProperty('--tc', typeof color === 'string' && color ? color : '#ffffff');
    toastBox.appendChild(e);
    toasts.push({ el: e, text: s, t: 0, life: 2.3, n: 1, out: false, outT: 0 });
    let alive = 0;
    for (let i = toasts.length - 1; i >= 0; i--) {
      if (toasts[i].out) continue;
      alive++;
      if (alive > 4) { toasts[i].out = true; toasts[i].outT = 0.3; toasts[i].el.classList.add('out'); }
    }
    ensureLoop();
  }
  function tickToasts(dt) {
    for (let i = 0; i < toasts.length; i++) {
      const o = toasts[i];
      o.t += dt;
      if (!o.out) {
        if (o.t >= o.life) { o.out = true; o.outT = 0.36; o.el.classList.add('out'); }
      } else {
        o.outT -= dt;
        if (o.outT <= 0) { o.el.remove(); toasts.splice(i, 1); i--; }
      }
    }
  }

  /* ========================================================== KEYS & BACK */
  function consumeInput() {
    if (!SK.input) return;
    try { SK.input.clear(); } catch (e) { /* ignore */ }
    SK.input.pressed = {};
  }
  function onKey(e) {
    if (!inited || !e || e.repeat) return;
    const code = e.code;
    if (cf.open) {
      if (code === 'Escape' || code === 'Backspace') { sfx('uiBack'); if (cf.no) cf.no(); }
      else if (code === 'Enter' || code === 'NumpadEnter') { sfx('select'); if (cf.yes) cf.yes(); }
      else return;
      consumeInput();
      return;
    }
    if (nm.open) {
      if (code === 'Enter' || code === 'NumpadEnter') { sfx('select'); if (nm.confirm) nm.confirm(); }
      else if (code === 'Escape') { sfx('uiBack'); if (nm.cancel) nm.cancel(); }
      else return;
      consumeInput();
      return;
    }
    if (lv.open) {
      const dm = /^(?:Digit|Numpad)([1-4])$/.exec(code);
      const n = lv.cards.length;
      if (dm) { const k = +dm[1] - 1; if (k < n) { setHl(k); pickCard(k); } }
      else if (code === 'ArrowLeft' || code === 'KeyA') { setHl(lv.hl <= 0 ? n - 1 : lv.hl - 1); sfx('ui', { vol: 0.5 }); }
      else if (code === 'ArrowRight' || code === 'KeyD') { setHl(lv.hl < 0 || lv.hl >= n - 1 ? 0 : lv.hl + 1); sfx('ui', { vol: 0.5 }); }
      else if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && lv.hl >= 0) pickCard(lv.hl);
      consumeInput();
      return;
    }
    const sub = subOpen();
    if (sub) {
      if (code === 'Escape' || code === 'Backspace') { sfx('uiBack'); closeScreen(sub); consumeInput(); }
      return;
    }
    if (screens.pause && screens.pause.open) {
      if (code === 'Escape' || code === 'KeyP') { sfx('select'); resumeGame(); consumeInput(); }
      return;
    }
    const end = screens.gameover.open ? screens.gameover : screens.victory.open ? screens.victory : null;
    if (end && (code === 'Enter' || code === 'NumpadEnter')) {
      if (now() - end.openT > 900) { sfx('select'); retryRun(); }
      consumeInput();
    }
  }
  function back() {
    if (!inited) return false;
    if (cf.open) { sfx('uiBack'); if (cf.no) cf.no(); return true; }
    if (nm.open) { sfx('uiBack'); if (nm.cancel) nm.cancel(); return true; }
    const sub = subOpen();
    if (sub) { sfx('uiBack'); closeScreen(sub); return true; }
    if (lv.open) return true;
    if (screens.pause.open) { sfx('select'); resumeGame(); return true; }
    if (screens.gameover.open || screens.victory.open) { sfx('uiBack'); quitRun(); return true; }
    return false;
  }

  /* ================================================================== HUD */
  const hud = {
    key: '', W: 0, H: 0, dpr: 0, q: '', s: 1, ins: { l: 0, r: 0, t: 0, b: 0 }, probe: null, t: 0,
    hp: 1, hpLag: 1, hpLagT: 0, hpFlash: 0, heal: -1, lastHp: -1, lastMaxHp: 0, shake: 0, hpStr: '', hpKey: -1,
    mp: 1, xp: 0, lastLevel: -1, lvPop: 0, lvStr: '1',
    stageKey: '', stageStr: '',
    bossOn: false, bossRef: null, bossLag: 1, bossLagT: 0, bossIntro: 0, bossHit: 0, bossLast: 0, bossName: '', bossPct: -1, bossPctStr: '',
    combo: 0, lastCombo: 0, comboPop: 0, comboMax: 2, comboFade: 0, comboFadeStr: '', comboStr: '',
    kills: -1, killsStr: '0', killsW: 0, killsPop: 0,
    timeSec: -1, timeStr: '0:00',
    dashMax: 0.8, lastDash: 0, dashPulse: 0, dashPrevR: 1,
    slotPrev: [1, 1, 1], slotPulse: [0, 0, 0],
    skillSeen: {}, skillPop: {},
    fps: -1, fpsStr: '',
    allyRR: 0,
  };
  const discCache = new Map(), spriteCache = new Map(), gradCache = new Map(), rowIcons = new Map(), slotIcons = new Map(), allyCache = new Map();
  const BIOME_LBL = ['1/4', '2/4', '3/4', '4/4'];
  const KEY_W = {};
  const STAGE_COLS = STAGE_RING;

  function readInsets() {
    const p = hud.probe;
    if (!p || typeof getComputedStyle !== 'function') return;
    try {
      const cs = getComputedStyle(p);
      hud.ins.t = parseFloat(cs.paddingTop) || 0;
      hud.ins.r = parseFloat(cs.paddingRight) || 0;
      hud.ins.b = parseFloat(cs.paddingBottom) || 0;
      hud.ins.l = parseFloat(cs.paddingLeft) || 0;
    } catch (e) { /* ignore */ }
    hud.key = '';
  }

  function layout(ctx) {
    const W = SK.W, H = SK.H, I = hud.ins;
    hud.W = W; hud.H = H; hud.dpr = SK.DPR || 1; hud.q = SK.quality; hud.key = 'ok';
    const s = clamp(min(W, H) / 400, 0.8, 1.35);
    hud.s = s;
    hud.x0 = I.l + 12 * s;
    hud.y0 = I.t + 14 * s;
    hud.badgeR = 19 * s;
    hud.bx = hud.x0 + hud.badgeR;
    hud.by = hud.y0 + hud.badgeR;
    hud.barX = hud.bx + hud.badgeR + 9 * s;
    hud.hpW = clamp(W * 0.22, 130, 280);
    hud.hpH = 15 * s;
    hud.hpY = hud.y0 + 1 * s;
    hud.mpW = hud.hpW * 0.8;
    hud.mpH = 8 * s;
    hud.mpY = hud.hpY + hud.hpH + 5 * s;
    hud.stageY = hud.mpY + hud.mpH + 10 * s;
    hud.rowY = hud.y0 + hud.badgeR * 2 + 16 * s;
    hud.iconS = 22 * s;
    hud.allyR = 14 * s;
    hud.cx = W / 2;
    hud.timerY = I.t + 22 * s;
    hud.progW = min(190 * s, W * 0.24);
    hud.progH = 6 * s;
    hud.progY = hud.timerY + 15 * s;
    hud.bossW = min(W * 0.46, 520 * s);
    hud.bossH = 12 * s;
    hud.bossY = hud.timerY + 30 * s;
    const f = (wgt, px) => wgt + ' ' + round(px) + 'px ' + FONT;
    hud.fTimer = f('900', 21 * s);
    hud.fSmall = f('800', 9.5 * s);
    hud.fTiny = f('900', 8.5 * s);
    hud.fBar = f('800', 9.5 * s);
    hud.fBadge = f('900', 15 * s);
    hud.fStage = f('800', 10.5 * s);
    hud.fKills = f('900', 17 * s);
    hud.fCombo = 'italic ' + f('900', 28 * s);
    hud.fBoss = f('900', 12.5 * s);
    hud.fCd = f('900', 13 * s);
    hud.fKey = f('900', 9 * s);
    discCache.clear(); spriteCache.clear(); gradCache.clear(); rowIcons.clear(); slotIcons.clear(); allyCache.clear();
    hud.killsStr = ''; hud.kills = -1; hud.stageKey = ''; hud.hpKey = -1;
    ctx.save();
    ctx.font = hud.fKey;
    for (const k in KEY_HINT) KEY_W[k] = ctx.measureText(KEY_HINT[k]).width + 8 * s;
    ctx.restore();
  }

  /* --------------------------------------------------------- sprite cache */
  function offCanvas(cssW, cssH) {
    const c = document.createElement('canvas');
    const d = hud.dpr || 1;
    c.width = Math.max(1, Math.ceil(cssW * d));
    c.height = Math.max(1, Math.ceil(cssH * d));
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    c._w = cssW; c._h = cssH;
    return { c, g };
  }
  function discSprite(r, color) {
    const key = color + (r | 0);
    let c = discCache.get(key);
    if (c) return c;
    const pad = 4, m = r + pad;
    const o = offCanvas(m * 2, m * 2);
    const g = o.g;
    const gr = g.createRadialGradient(m, m - r * 0.4, r * 0.08, m, m, r);
    gr.addColorStop(0, U.rgba(color, 0.42));
    gr.addColorStop(0.5, 'rgba(14,18,46,0.74)');
    gr.addColorStop(1, 'rgba(5,7,20,0.86)');
    g.fillStyle = gr;
    circle(g, m, m, r); g.fill();
    const lw = max(1.6, r * 0.075);
    g.lineWidth = lw;
    g.strokeStyle = U.rgba(color, 0.9);
    circle(g, m, m, r - lw / 2); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    circle(g, m, m, r * 0.8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.13)';
    g.beginPath(); g.ellipse(m, m - r * 0.48, r * 0.6, r * 0.27, 0, 0, TAU); g.fill();
    c = o.c; c._m = m;
    discCache.set(key, c);
    return c;
  }
  function drawDisc(ctx, x, y, r, color) {
    const c = discSprite(r, color);
    ctx.drawImage(c, x - c._m, y - c._m, c._m * 2, c._m * 2);
  }
  function joySprite(kind, r) {
    const key = kind + (r | 0);
    let c = spriteCache.get(key);
    if (c) return c;
    const m = r + 6;
    const o = offCanvas(m * 2, m * 2);
    const g = o.g;
    if (kind === 'base') {
      const gr = g.createRadialGradient(m, m, r * 0.2, m, m, r);
      gr.addColorStop(0, 'rgba(79,195,255,0.02)');
      gr.addColorStop(0.75, 'rgba(79,195,255,0.08)');
      gr.addColorStop(1, 'rgba(79,195,255,0.22)');
      g.fillStyle = gr;
      circle(g, m, m, r); g.fill();
      g.lineWidth = 2.5; g.strokeStyle = 'rgba(160,225,255,0.55)';
      circle(g, m, m, r - 1.5); g.stroke();
      g.lineWidth = 1; g.strokeStyle = 'rgba(160,225,255,0.18)';
      circle(g, m, m, r * 0.62); g.stroke();
      g.fillStyle = 'rgba(190,235,255,0.5)';
      for (let i = 0; i < 4; i++) {
        g.save(); g.translate(m, m); g.rotate(i * PI / 2);
        g.beginPath(); g.moveTo(r * 0.78, -r * 0.09); g.lineTo(r * 0.9, 0); g.lineTo(r * 0.78, r * 0.09); g.closePath(); g.fill();
        g.restore();
      }
    } else {
      const gr = g.createRadialGradient(m - r * 0.3, m - r * 0.35, r * 0.1, m, m, r);
      gr.addColorStop(0, 'rgba(235,250,255,0.95)');
      gr.addColorStop(0.35, 'rgba(120,215,255,0.85)');
      gr.addColorStop(1, 'rgba(30,90,200,0.85)');
      g.fillStyle = gr;
      circle(g, m, m, r); g.fill();
      g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.7)';
      circle(g, m, m, r - 0.75); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.ellipse(m - r * 0.28, m - r * 0.4, r * 0.32, r * 0.17, -0.5, 0, TAU); g.fill();
    }
    c = o.c; c._m = m;
    spriteCache.set(key, c);
    return c;
  }
  function vgrad(ctx, name, h, stops) {
    const key = name + (h | 0);
    let g = gradCache.get(key);
    if (g) return g;
    g = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    gradCache.set(key, g);
    return g;
  }
  function hgrad(ctx, name, w, stops) {
    const key = name + (w | 0);
    let g = gradCache.get(key);
    if (g) return g;
    g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    gradCache.set(key, g);
    return g;
  }
  const HP_STOPS = [0, '#ffa3bf', 0.45, '#ff3d6e', 1, '#a30d38'];
  const HP_LOW_STOPS = [0, '#ffb199', 0.45, '#ff1744', 1, '#7f0022'];
  const MP_STOPS = [0, '#b5ecff', 0.45, '#3a9cff', 1, '#1a3fb0'];
  const BOSS_STOPS = [0, '#ff9e80', 0.45, '#e0143c', 1, '#6d0019'];
  const BOSS_RAGE_STOPS = [0, '#ff9cff', 0.45, '#c2129f', 1, '#4a0040'];
  const XP_STOPS = [0, '#3ef0d0', 0.5, '#4fc3ff', 1, '#b388ff'];
  const PROG_STOPS = [0, '#ffe082', 0.6, '#ff9100', 1, '#ff1744'];

  function iconCanvas(cache, id, size) {
    let c = cache.get(id);
    if (c) return c;
    const def = skillDefs()[id];
    const o = offCanvas(size, size);
    try { if (def && def.drawIcon) def.drawIcon(o.g, size / 2, size / 2, size, 0); else drawGlyph(o.g, 'star', size / 2, size / 2, size * 0.8, null, 0); } catch (e) { drawGlyph(o.g, 'star', size / 2, size / 2, size * 0.8, null, 0); }
    c = o.c;
    cache.set(id, c);
    return c;
  }

  /* -------------------------------------------------------------- widgets */
  function gelBar(ctx, x, y, w, h, ratio, lag, grad, lagColor, t, bubbles, shine) {
    ctx.save();
    ctx.translate(x, y);
    capsule(ctx, -1.5, -1.5, w + 3, h + 3);
    ctx.fillStyle = 'rgba(3,4,14,0.8)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
    capsule(ctx, 0, 0, w, h);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, 0, w, h);
    if (lag > ratio) { ctx.fillStyle = lagColor; ctx.fillRect(w * ratio, 0, w * (lag - ratio), h); }
    const fw = w * ratio;
    if (fw > 0) {
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, fw, h);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(0, h * 0.13, fw, h * 0.24);
      if (bubbles && SK.quality !== 'low' && h > 6) {
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        for (let i = 0; i < 4; i++) {
          const bx = ((i * 0.29 + t * 0.05 * (1 + i * 0.35)) % 1) * fw;
          const by = h * (0.6 + 0.2 * sin(t * 2.2 + i * 1.7));
          circle(ctx, bx, by, h * (0.07 + 0.04 * (i & 1)));
          ctx.fill();
        }
      }
      if (shine >= 0 && shine <= 1) {
        const sx = -h * 2 + shine * (fw + h * 4);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(sx, h); ctx.lineTo(sx + h * 0.7, 0); ctx.lineTo(sx + h * 1.5, 0); ctx.lineTo(sx + h * 0.8, h);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(fw - 1.5, 0, 1.5, h);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 1; i < 4; i++) ctx.fillRect(w * i / 4 - 0.5, h * 0.55, 1, h * 0.45);
    ctx.restore();
    ctx.restore();
  }
  function outlinedText(ctx, str, x, y, fill, lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  /* ---------------------------------------------------------- player panel */
  function drawPlayerPanel(ctx, p, dt, t) {
    const s = hud.s;
    const maxHp = max(1, p.maxHp || 1), hp = clamp(p.hp || 0, 0, maxHp);
    const ratio = hp / maxHp;
    if (hud.lastHp < 0) { hud.lastHp = hp; hud.hpLag = ratio; }
    if (hp < hud.lastHp - 0.01) { hud.hpFlash = 1; hud.shake = min(1, hud.shake + 0.6); hud.hpLagT = 0.45; }
    else if (hp > hud.lastHp + 0.5 && maxHp === hud.lastMaxHp) hud.heal = 0;
    hud.lastHp = hp; hud.lastMaxHp = maxHp;
    hud.hp = U.damp(hud.hp, ratio, 18, dt);
    if (hud.hpLag < hud.hp) hud.hpLag = hud.hp;
    else if (hud.hpLagT > 0) hud.hpLagT -= dt;
    else hud.hpLag = max(hud.hp, hud.hpLag - dt * 0.55);
    hud.hpFlash = max(0, hud.hpFlash - dt * 3);
    hud.shake = max(0, hud.shake - dt * 3.5);
    if (hud.heal >= 0) { hud.heal += dt * 1.6; if (hud.heal > 1) hud.heal = -1; }
    const maxMp = max(1, p.maxMp || 1);
    hud.mp = U.damp(hud.mp, clamp((p.mp || 0) / maxMp, 0, 1), 14, dt);
    const xpR = clamp((p.xp || 0) / max(1, p.xpNext || 1), 0, 1);
    hud.xp = (p.level | 0) !== hud.lastLevel ? xpR : U.damp(hud.xp, xpR, 10, dt);
    if (hud.lastLevel >= 0 && (p.level | 0) > hud.lastLevel) hud.lvPop = 1;
    if ((p.level | 0) !== hud.lastLevel) { hud.lastLevel = p.level | 0; hud.lvStr = numStr(p.level | 0); }
    hud.lvPop = max(0, hud.lvPop - dt * 1.6);

    const low = ratio < 0.3;
    const sx = hud.shake > 0 ? sin(t * 70) * hud.shake * 3 * s : 0;
    const stage = clamp(p.stage | 0, 0, 3);
    const ring = STAGE_COLS[stage];

    // top XP bar (full width)
    const I = hud.ins;
    const xw = SK.W - I.l - I.r, xh = max(3, 4.5 * s);
    ctx.save();
    ctx.translate(I.l, I.t + 1);
    ctx.fillStyle = 'rgba(3,4,14,0.65)';
    ctx.fillRect(0, 0, xw, xh);
    ctx.fillStyle = hgrad(ctx, 'xp', xw, XP_STOPS);
    ctx.fillRect(0, 0, xw * hud.xp, xh);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, 0, xw * hud.xp, xh * 0.35);
    ctx.restore();
    glow(ctx, I.l + xw * hud.xp, I.t + 1 + xh / 2, 14 * s * (1 + hud.lvPop), '#7fe0ff', 0.55 + hud.lvPop * 0.4);
    if (hud.lvPop > 0) {
      ctx.globalAlpha = hud.lvPop * 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(I.l, I.t + 1, xw, xh);
      ctx.globalAlpha = 1;
    }

    // level badge
    const bx = hud.bx + sx, by = hud.by;
    const R = hud.badgeR * (1 + 0.22 * U.ease.outBack(min(1, hud.lvPop * 1.2)) * (hud.lvPop > 0 ? 1 : 0));
    glow(ctx, bx, by, R * 2.1, ring, 0.3 + 0.45 * hud.lvPop);
    circle(ctx, bx, by, R);
    ctx.fillStyle = 'rgba(8,10,28,0.92)';
    ctx.fill();
    ctx.lineWidth = 3.2 * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    circle(ctx, bx, by, R - 1.6 * s); ctx.stroke();
    ctx.strokeStyle = ring;
    ctx.beginPath(); ctx.arc(bx, by, R - 1.6 * s, -PI / 2, -PI / 2 + TAU * max(0.001, hud.xp)); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = hud.fTiny;
    ctx.fillStyle = 'rgba(200,220,255,0.75)';
    ctx.fillText('LV', bx, by - R * 0.42);
    ctx.font = hud.fBadge;
    outlinedText(ctx, hud.lvStr, bx, by + R * 0.16, '#ffffff', 3);

    // HP
    const hx = hud.barX + sx, hy = hud.hpY;
    if (low) glow(ctx, hx + hud.hpW * 0.2, hy + hud.hpH / 2, hud.hpH * 2.6, '#ff1744', 0.25 + 0.25 * sin(t * 8));
    const hgr = vgrad(ctx, low ? 'hpl' : 'hp', hud.hpH, low ? HP_LOW_STOPS : HP_STOPS);
    gelBar(ctx, hx, hy, hud.hpW, hud.hpH, hud.hp, hud.hpLag, hgr, 'rgba(255,236,242,0.85)', t, true, hud.heal);
    if (hud.hpFlash > 0) {
      ctx.save(); ctx.globalAlpha = hud.hpFlash * 0.7;
      capsule(ctx, hx, hy, hud.hpW, hud.hpH); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    // heart icon on bar start
    const hb = low ? 1 + 0.18 * max(0, sin(t * 9)) : 1;
    drawGlyph(ctx, 'heart', hx - 1 * s, hy + hud.hpH / 2, hud.hpH * 1.45 * hb, '#ff4f7b', t);
    const hk = (hp | 0) * 100000 + (maxHp | 0);
    if (hk !== hud.hpKey) { hud.hpKey = hk; hud.hpStr = Math.ceil(hp) + ' / ' + Math.round(maxHp); }
    ctx.font = hud.fBar;
    ctx.textAlign = 'right';
    outlinedText(ctx, hud.hpStr, hx + hud.hpW - 6 * s, hy + hud.hpH / 2 + 0.5, '#ffffff', 2.5);

    // MP
    const my = hud.mpY;
    gelBar(ctx, hx, my, hud.mpW, hud.mpH, hud.mp, 0, vgrad(ctx, 'mp', hud.mpH, MP_STOPS), 'rgba(0,0,0,0)', t * 1.3, true, -1);
    drawGlyph(ctx, 'mp', hx - 1 * s, my + hud.mpH / 2, hud.mpH * 1.6, '#4fc3ff', t);

    // stage + name
    const skey = stage + '|' + (p.race || '') + '|' + (p.charName || '');
    if (skey !== hud.stageKey) {
      hud.stageKey = skey;
      const sn = stageName(p);
      hud.stageStr = (p.charName ? p.charName + ' · ' : '') + sn;
    }
    ctx.textAlign = 'left';
    ctx.font = hud.fStage;
    outlinedText(ctx, hud.stageStr, hx + 2 * s, hud.stageY, ring, 2.5);
  }

  /* ------------------------------------------------------------ skill row */
  function drawSkillRow(ctx, p, dt, t) {
    const defs = skillDefs();
    if (!p.skills) return hud.rowY;
    const s = hud.s, S = hud.iconS, gap = 6 * s;
    const maxX = SK.W / 2 - hud.progW / 2 - 18 * s;
    let x = hud.x0, y = hud.rowY, count = 0;
    ctx.textAlign = 'center';
    for (const id in p.skills) {
      const def = defs[id];
      if (!def || def.kind === 'active') continue;
      const L = p.skills[id] | 0;
      if (L <= 0) continue;
      const seen = hud.skillSeen[id];
      if (seen !== L) { if (seen !== undefined || hud.t > 1) hud.skillPop[id] = 1; hud.skillSeen[id] = L; }
      let pop = hud.skillPop[id] || 0;
      if (pop > 0) { pop = max(0, pop - dt * 1.8); hud.skillPop[id] = pop; }
      if (x + S > maxX && count > 0) { x = hud.x0; y += S + 12 * s; }
      const cx = x + S / 2, cy = y + S / 2;
      const sc = 1 + 0.35 * sin(min(1, (1 - pop)) * PI) * (pop > 0 ? 1 : 0);
      if (pop > 0) glow(ctx, cx, cy, S * 1.4, def.color || '#4fc3ff', pop * 0.9);
      roundRect(ctx, x - 2, y - 2, S + 4, S + 4, 6 * s);
      ctx.fillStyle = 'rgba(6,8,24,0.72)';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = def.color ? U.rgba(def.color, 0.65) : 'rgba(130,200,255,0.5)';
      ctx.stroke();
      const ic = iconCanvas(rowIcons, id, S);
      const dw = S * sc;
      ctx.drawImage(ic, cx - dw / 2, cy - dw / 2, dw, dw);
      const maxed = L >= (def.maxLevel || 5);
      ctx.font = hud.fTiny;
      const lx = x + S - 1, ly = y + S - 1;
      circle(ctx, lx, ly, 6.5 * s);
      ctx.fillStyle = maxed ? '#ffb300' : '#0b1030';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = maxed ? '#fff3c4' : 'rgba(79,195,255,0.9)';
      ctx.stroke();
      ctx.fillStyle = maxed ? '#2a1600' : '#ffffff';
      ctx.fillText(maxed ? 'M' : numStr(L), lx, ly + 0.5);
      x += S + gap;
      count++;
    }
    return count ? y + S : hud.rowY - 10 * s;
  }

  /* --------------------------------------------------------------- allies */
  function drawAllyPortrait(o, m, size, T) {
    const g = o.g, c = o.c, d = hud.dpr || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    const r = size / 2;
    g.save();
    circle(g, r, r, r);
    g.clip();
    const col = (m.def && m.def.color) || '#4fc3ff';
    const gr = g.createRadialGradient(r, r * 0.8, 1, r, r, r);
    gr.addColorStop(0, U.rgba(col, 0.45));
    gr.addColorStop(1, 'rgba(6,8,22,0.95)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    let ok = false;
    try {
      if (!m.companion && SK.Enemies && SK.Enemies.renderPortrait && enemyTypes()[m.type]) {
        SK.Enemies.renderPortrait(g, m.type, r, r * 1.08, size * 1.15, T);
        ok = true;
      } else if (m.def && typeof m.def.draw === 'function') {
        g.save();
        g.translate(r, r * 1.04);
        g.scale(r * 0.66, r * 0.66);
        m.def.draw(g, m, T);
        g.restore();
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      g.fillStyle = col;
      g.beginPath(); g.ellipse(r, r * 1.1, r * 0.55, r * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffffff';
      circle(g, r - r * 0.2, r, r * 0.12); g.fill();
      circle(g, r + r * 0.2, r, r * 0.12); g.fill();
    }
    g.restore();
  }
  function drawAllies(ctx, G, dt, t, topY) {
    const allies = G.allies;
    if (!allies || !allies.length) return;
    const s = hud.s, R = hud.allyR, size = R * 2;
    const y = topY + 10 * s + R;
    let x = hud.x0 + R;
    const n = min(allies.length, 8);
    // refresh one portrait per frame (round robin), 5 Hz per ally at most
    hud.allyRR = (hud.allyRR + 1) % max(1, n);
    for (let i = 0; i < n; i++) {
      const m = allies[i];
      if (!m) continue;
      let entry = allyCache.get(m);
      if (!entry) { entry = { o: offCanvas(size, size), t: -1 }; allyCache.set(m, entry); }
      if (entry.t < 0 || (i === hud.allyRR && hud.t - entry.t > (SK.quality === 'low' ? 0.6 : 0.2))) {
        drawAllyPortrait(entry.o, m, size, hud.t);
        entry.t = hud.t;
      }
      const fainted = !!(m.ai && m.ai.fainted) || m.dead;
      const comp = !!m.companion;
      const col = comp ? '#ff80ab' : '#69f0ae';
      ctx.globalAlpha = fainted ? 0.4 : 1;
      if (!fainted) glow(ctx, x, y, R * 1.7, comp ? ((m.def && m.def.color) || col) : col, 0.22 + 0.08 * sin(t * 3 + i));
      ctx.drawImage(entry.o.c, x - R, y - R, size, size);
      const hr = clamp((m.hp || 0) / max(1, m.maxHp || 1), 0, 1);
      ctx.lineWidth = 2.6 * s;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      circle(ctx, x, y, R + 1.5 * s); ctx.stroke();
      ctx.strokeStyle = fainted ? '#78909c' : hr < 0.3 ? '#ff5252' : col;
      ctx.beginPath(); ctx.arc(x, y, R + 1.5 * s, -PI / 2, -PI / 2 + TAU * (fainted ? 1 - clamp(((m.ai && m.ai.faintT) || 0) / 20, 0, 1) : hr)); ctx.stroke();
      ctx.globalAlpha = 1;
      if (fainted && m.ai) {
        ctx.font = hud.fTiny;
        ctx.textAlign = 'center';
        outlinedText(ctx, numStr(Math.ceil(m.ai.faintT || 0)), x, y, '#cfd8dc', 2.5);
      } else if (comp) {
        drawGlyph(ctx, 'heart', x + R * 0.75, y - R * 0.75, R * 0.62, '#ff4f8b', t);
      }
      x += size + 7 * s;
    }
    if (allies.length > n) {
      ctx.font = hud.fSmall;
      ctx.textAlign = 'left';
      outlinedText(ctx, '+' + (allies.length - n), x - R + 2 * s, y, '#b9f6ca', 2.5);
    }
    if (allyCache.size > 24) {
      for (const k of allyCache.keys()) if (allies.indexOf(k) < 0) allyCache.delete(k);
    }
  }

  /* ---------------------------------------------------------- top center */
  function drawTopCenter(ctx, G, dt, t) {
    const s = hud.s, cx = hud.cx;
    const sec = (G.t || 0) | 0;
    if (sec !== hud.timeSec) { hud.timeSec = sec; hud.timeStr = U.fmtTime(sec); }
    ctx.textAlign = 'center';
    ctx.font = hud.fTimer;
    outlinedText(ctx, hud.timeStr, cx, hud.timerY, '#eaf2ff', 4);
    if (hud.bossOn) return;
    const b = biomeInfo(G.biome | 0);
    const dur = (b && b.duration) || 0;
    if (!(dur > 0)) return;
    const r = clamp((G.biomeT || 0) / dur, 0, 1);
    const w = hud.progW, h = hud.progH, x = cx - w / 2, y = hud.progY;
    ctx.save();
    ctx.translate(x, y);
    capsule(ctx, -1, -1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(3,4,14,0.75)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
    if (r > 0) {
      capsule(ctx, 0, 0, max(h, w * r), h);
      ctx.fillStyle = hgrad(ctx, 'prog', w, PROG_STOPS);
      ctx.fill();
    }
    ctx.restore();
    if (r > 0) glow(ctx, x + w * r, y + h / 2, 9 * s, '#ffb300', 0.6);
    ctx.font = hud.fTiny;
    ctx.textAlign = 'right';
    outlinedText(ctx, BIOME_LBL[clamp(G.biome | 0, 0, 3)], x - 7 * s, y + h / 2 + 0.5, 'rgba(210,225,255,0.85)', 2.5);
    const near = r >= 0.85;
    const pulse = near ? 1 + 0.18 * max(0, sin(t * (r >= 1 ? 12 : 7))) : 1;
    if (near) glow(ctx, x + w + 10 * s, y + h / 2, 16 * s * pulse, '#ff1744', r >= 1 ? 0.75 : 0.45);
    drawGlyph(ctx, 'skull', x + w + 10 * s, y + h / 2, 14 * s * pulse, near ? '#ffcdd2' : '#cfd8dc', t);
  }

  /* --------------------------------------------------------------- boss */
  function drawBoss(ctx, G, dt, t) {
    const b = G.boss;
    if (!hud.bossOn || !b) { hud.bossRef = null; return; }
    const s = hud.s;
    if (hud.bossRef !== b) {
      hud.bossRef = b; hud.bossLag = 1; hud.bossIntro = 0; hud.bossHit = 0; hud.bossLast = b.hp; hud.bossPct = -1;
      hud.bossName = (b.name || (b.def && b.def.name) || 'Boss');
    }
    const maxHp = max(1, b.maxHp || 1);
    const ratio = clamp((b.hp || 0) / maxHp, 0, 1);
    hud.bossIntro = min(1, hud.bossIntro + dt * 0.9);
    const intro = U.ease.outCubic(hud.bossIntro);
    if (b.hp < hud.bossLast - 0.01) { hud.bossHit = 1; hud.bossLagT = 0.35; }
    hud.bossLast = b.hp;
    const shown = min(ratio, intro);
    if (hud.bossLag < shown) hud.bossLag = shown;
    else if (hud.bossLagT > 0) hud.bossLagT -= dt;
    else hud.bossLag = max(shown, hud.bossLag - dt * 0.4);
    hud.bossHit = max(0, hud.bossHit - dt * 5);
    const rage = !!b.enraged || ratio < 0.5;
    const w = hud.bossW, h = hud.bossH, x = hud.cx - w / 2;
    const y = hud.bossY - (1 - intro) * 18 * s;
    ctx.globalAlpha = min(1, hud.bossIntro * 3);
    glow(ctx, hud.cx, y + h / 2, w * 0.32, rage ? '#d500f9' : '#ff1744', 0.18 + 0.1 * sin(t * (rage ? 7 : 3)));
    gelBar(ctx, x, y, w, h, shown, hud.bossLag, vgrad(ctx, rage ? 'bossr' : 'boss', h, rage ? BOSS_RAGE_STOPS : BOSS_STOPS), 'rgba(255,240,200,0.85)', t, false, -1);
    if (hud.bossHit > 0) {
      ctx.save(); ctx.globalAlpha *= hud.bossHit * 0.35;
      capsule(ctx, x, y, w * shown, h); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    // phase pips (50% enrage, 25% final phase for the Demon Lord)
    const marks = b.type === 'demon_lord' ? 2 : 1;
    for (let k = 0; k < marks; k++) {
      const th = k === 0 ? 0.5 : 0.25;
      const px = x + w * th, py = y + h / 2;
      const lit = ratio <= th;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(PI / 4);
      const d = h * (lit ? 0.62 : 0.5);
      ctx.fillStyle = lit ? '#ffd54f' : 'rgba(20,10,30,0.9)';
      ctx.fillRect(-d / 2, -d / 2, d, d);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = lit ? '#fff8e1' : 'rgba(255,213,79,0.8)';
      ctx.strokeRect(-d / 2, -d / 2, d, d);
      ctx.restore();
      if (lit) glow(ctx, px, py, h * 1.3, '#ffb300', 0.5);
    }
    drawGlyph(ctx, 'skull', x - 12 * s, y + h / 2, 18 * s * (1 + 0.1 * sin(t * (rage ? 9 : 4))), rage ? '#f8bbd0' : '#eceff1', t);
    ctx.textAlign = 'center';
    ctx.font = hud.fBoss;
    outlinedText(ctx, hud.bossName, hud.cx, y - 8 * s, rage ? '#ffb3f0' : '#ffd6dc', 3);
    const pct = Math.ceil(ratio * 100);
    if (pct !== hud.bossPct) { hud.bossPct = pct; hud.bossPctStr = pct + '%'; }
    ctx.font = hud.fTiny;
    ctx.textAlign = 'left';
    outlinedText(ctx, hud.bossPctStr, x + w + 6 * s, y + h / 2 + 0.5, '#ffffff', 2.5);
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------ kills & combo */
  function drawKillsCombo(ctx, G, dt, t) {
    const s = hud.s, I = hud.ins;
    const pb = SK.input && SK.input.button ? SK.input.button('pause') : null;
    const rx = pb && pb.visible ? pb.x - pb.r - 12 * s : SK.W - I.r - 16 * s;
    const ky = pb ? pb.y : I.t + 34 * s;
    const kills = G.kills | 0;
    ctx.font = hud.fKills;
    if (kills !== hud.kills) {
      if (hud.kills >= 0 && kills > hud.kills) hud.killsPop = min(1, hud.killsPop + 0.35);
      hud.kills = kills;
      hud.killsStr = U.fmtNum(kills);
      hud.killsW = ctx.measureText(hud.killsStr).width;
    }
    hud.killsPop = max(0, hud.killsPop - dt * 4);
    const ks = 1 + 0.18 * hud.killsPop;
    ctx.textAlign = 'right';
    ctx.save();
    ctx.translate(rx, ky);
    ctx.scale(ks, ks);
    outlinedText(ctx, hud.killsStr, 0, 0, '#ffffff', 3.5);
    ctx.restore();
    drawGlyph(ctx, 'skull', rx - hud.killsW * ks - 11 * s, ky, 15 * s, '#eceff1', t);

    // combo meter
    const c = G.combo | 0;
    if (c > hud.lastCombo) {
      hud.comboPop = 1;
      hud.comboMax = max(0.4, G.comboT || hud.comboMax);
      hud.comboStr = 'x' + c;
    } else if (c === 0 && hud.lastCombo >= 3) {
      hud.comboFade = 1; hud.comboFadeStr = hud.comboStr;
    }
    hud.lastCombo = c;
    hud.comboPop = max(0, hud.comboPop - dt * 4);
    hud.comboFade = max(0, hud.comboFade - dt * 2.2);
    const cx = SK.W - I.r - 18 * s, cy = ky + 42 * s;
    let str = null, alpha = 1, scale = 1, k = 0;
    if (c >= 3) {
      str = hud.comboStr;
      scale = 1 + 0.42 * U.ease.outCubic(hud.comboPop);
      k = clamp((G.comboT || 0) / hud.comboMax, 0, 1);
    } else if (hud.comboFade > 0) {
      str = hud.comboFadeStr; alpha = hud.comboFade; scale = 0.8 + 0.2 * hud.comboFade;
    }
    if (!str) return;
    const n = c >= 3 ? c : 0;
    const col = n >= 100 ? STAGE_COLS[(floor(t * 8) % 4 + 4) % 4] : n >= 50 ? '#ff5cf0' : n >= 25 ? '#ff9100' : n >= 10 ? '#ffd54f' : '#7fe0ff';
    ctx.globalAlpha = alpha;
    if (n >= 10) glow(ctx, cx - 30 * s, cy, 42 * s * scale, col, 0.25 + 0.3 * hud.comboPop);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.rotate(-0.06);
    ctx.font = hud.fCombo;
    ctx.textAlign = 'right';
    outlinedText(ctx, str, 0, 0, col, 5);
    ctx.restore();
    ctx.font = hud.fTiny;
    ctx.textAlign = 'right';
    outlinedText(ctx, 'COMBO', cx, cy + 17 * s, '#ffffff', 2.5);
    if (c >= 3) {
      const bw = 64 * s, bh = 3 * s, bx = cx - bw, by = cy + 25 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = col;
      ctx.fillRect(bx + bw * (1 - k), by, bw * k, bh);
    }
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- joystick */
  function drawJoystick(ctx, t) {
    const inp = SK.input;
    if (!inp || !inp.touchUsed || inp.enabled === false) return;
    const j = inp.joy, s = hud.s, R = j.r || 62 * s, I = hud.ins;
    let ox, oy, kx, ky, mag = 0, ang = 0, a;
    if (j.active) {
      ox = j.ox; oy = j.oy;
      let dx = j.x - ox, dy = j.y - oy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      kx = ox + dx; ky = oy + dy;
      mag = min(1, l / R); ang = Math.atan2(dy, dx);
      a = 1;
    } else {
      ox = I.l + 34 * s + R; oy = SK.H - I.b - 30 * s - R;
      kx = ox; ky = oy + sin(t * 2) * 2 * s;
      a = 0.3;
    }
    ctx.globalAlpha = a;
    const base = joySprite('base', R);
    ctx.drawImage(base, ox - base._m, oy - base._m, base._m * 2, base._m * 2);
    if (mag > 0.15) {
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = 'rgba(127,224,255,' + (0.35 + mag * 0.55).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(ox, oy, R - 2 * s, ang - 0.55, ang + 0.55); ctx.stroke();
    }
    const kr = R * 0.42;
    glow(ctx, kx, ky, kr * 2.2, '#4fc3ff', 0.25 + mag * 0.45);
    const knob = joySprite('knob', kr);
    ctx.drawImage(knob, kx - knob._m, ky - knob._m, knob._m * 2, knob._m * 2);
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- buttons */
  function cooldownSweep(ctx, x, y, r, ratio, color) {
    if (ratio >= 1) return;
    ctx.fillStyle = 'rgba(3,5,16,0.66)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r * 0.9, -PI / 2 + ratio * TAU, -PI / 2 + TAU);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = max(2, r * 0.1);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r * 0.93, -PI / 2, -PI / 2 + ratio * TAU); ctx.stroke();
  }
  function keyChip(ctx, id, x, y) {
    const k = KEY_HINT[id];
    if (!k) return;
    const s = hud.s, w = KEY_W[id] || 16 * s, h = 13 * s;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 4 * s);
    ctx.fillStyle = 'rgba(8,10,28,0.88)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.stroke();
    ctx.font = hud.fKey;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(k, x, y + 0.5);
  }
  function drawButtons(ctx, G, p, dt, t) {
    const inp = SK.input;
    if (!inp || !inp.buttons) return;
    const s = hud.s, desktop = !inp.touchUsed, defs = skillDefs();
    // dash cooldown bookkeeping
    const dcd = p.dashCd || 0;
    if (dcd > hud.lastDash + 0.02) hud.dashMax = max(0.15, dcd);
    hud.lastDash = dcd;
    const dashR = dcd > 0 ? clamp(1 - dcd / hud.dashMax, 0, 1) : 1;
    if (dashR >= 1 && hud.dashPrevR < 1) hud.dashPulse = 1;
    hud.dashPrevR = dashR;
    hud.dashPulse = max(0, hud.dashPulse - dt * 2.5);
    for (let bi = 0; bi < inp.buttons.length; bi++) {
      const b = inp.buttons[bi];
      if (!b.visible) continue;
      const id = b.id;
      const pr = b.down ? 0.9 : 1;
      const r = b.r * pr, x = b.x, y = b.y;
      ctx.globalAlpha = b.enabled === false ? 0.4 : 1;
      if (id === 'absorb') {
        const hint = !!p.absorbHint, act = !!p.absorbing || !!b.down;
        const col = '#3ef0d0';
        if (hint || act) {
          const pulse = 0.5 + 0.5 * sin(t * 7);
          glow(ctx, x, y, r * 2.2, col, act ? 0.75 : 0.3 + 0.35 * pulse);
          if (!act) {
            const rk = (t * 1.1) % 1;
            ctx.save();
            ctx.globalAlpha *= (1 - rk) * 0.85;
            ctx.lineWidth = 3 * s;
            ctx.strokeStyle = col;
            circle(ctx, x, y, r * (1.02 + rk * 0.55)); ctx.stroke();
            ctx.restore();
          }
        }
        drawDisc(ctx, x, y, r, col);
        const sp = act ? 2.4 : hint ? 1.2 : 0.35;
        if (act && SK.Slime && SK.Slime.drawVortex && SK.quality !== 'low') {
          try { SK.Slime.drawVortex(ctx, x, y, r * 0.5, t); } catch (e) { drawGlyph(ctx, 'vortex', x, y, r * 1.1, col, t * sp); }
        } else drawGlyph(ctx, 'vortex', x, y, r * (hint ? 1.12 + 0.08 * sin(t * 7) : 1.05), col, t * sp);
        // fangs: the Predatore "mouth"
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha *= 0.85;
        for (let k = -1; k <= 1; k += 2) {
          ctx.beginPath();
          ctx.moveTo(x + k * r * 0.22, y - r * 0.5); ctx.lineTo(x + k * r * 0.1, y - r * 0.5); ctx.lineTo(x + k * r * 0.16, y - r * 0.3);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = b.enabled === false ? 0.4 : 1;
        ctx.font = hud.fTiny;
        ctx.textAlign = 'center';
        outlinedText(ctx, 'PREDATORE', x, y + r + 8 * s, hint ? '#a7ffeb' : 'rgba(220,240,255,0.8)', 2.5);
        if (desktop) keyChip(ctx, id, x + r * 0.72, y - r * 0.72);
      } else if (id === 'dash') {
        const col = '#80deea';
        if (hud.dashPulse > 0) glow(ctx, x, y, r * 1.9, col, hud.dashPulse * 0.8);
        drawDisc(ctx, x, y, r, col);
        drawGlyph(ctx, 'wind', x, y, r * 1.05, col, t);
        cooldownSweep(ctx, x, y, r, dashR, col);
        if (desktop) keyChip(ctx, id, x, y + r + 6 * s);
      } else if (id === 's1' || id === 's2' || id === 's3') {
        const si = id.charCodeAt(1) - 49;
        const sid = p.slots ? p.slots[si] : null;
        const def = sid ? defs[sid] : null;
        if (!def) {
          ctx.globalAlpha *= 0.65;
          drawDisc(ctx, x, y, r, '#5f6b8f');
          drawGlyph(ctx, 'lock', x, y, r * 0.95, '#90a4ae', t);
          hud.slotPrev[si] = 1;
        } else {
          const col = def.color || '#4fc3ff';
          let ratio = 1;
          try { ratio = SK.Skills && SK.Skills.cooldownRatio ? SK.Skills.cooldownRatio(p, sid) : 1; } catch (e) { ratio = 1; }
          if (!(ratio >= 0)) ratio = 1;
          const noMp = (def.mpCost || 0) > (p.mp || 0);
          if (ratio >= 1 && hud.slotPrev[si] < 1) hud.slotPulse[si] = 1;
          hud.slotPrev[si] = ratio;
          hud.slotPulse[si] = max(0, hud.slotPulse[si] - dt * 2.2);
          const ready = ratio >= 1 && !noMp;
          if (ready) glow(ctx, x, y, r * 1.8, col, 0.22 + 0.12 * sin(t * 4 + si) + hud.slotPulse[si] * 0.6);
          drawDisc(ctx, x, y, r, ready ? col : '#5f6b8f');
          if (SK.quality === 'high') def.drawIcon(ctx, x, y, r * 1.3, t);
          else { const ic = iconCanvas(slotIcons, sid, r * 1.3); ctx.drawImage(ic, x - r * 0.65, y - r * 0.65, r * 1.3, r * 1.3); }
          if (noMp) {
            ctx.save();
            circle(ctx, x, y, r * 0.9);
            if (SK.quality !== 'low') { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
            ctx.fillStyle = 'rgba(16,30,80,0.5)';
            ctx.fill();
            ctx.restore();
            ctx.font = hud.fTiny;
            ctx.textAlign = 'center';
            outlinedText(ctx, 'MP', x, y + r * 0.5, '#82b1ff', 2.5);
          }
          cooldownSweep(ctx, x, y, r, ratio, col);
          const rem = p.cooldowns ? p.cooldowns[sid] || 0 : 0;
          if (ratio < 1 && rem > 0) {
            ctx.font = hud.fCd;
            ctx.textAlign = 'center';
            outlinedText(ctx, rem >= 1 ? numStr(Math.ceil(rem)) : rem.toFixed(1), x, y + 0.5, '#ffffff', 3);
          }
          if (hud.slotPulse[si] > 0) {
            const k = 1 - hud.slotPulse[si];
            ctx.save();
            ctx.globalAlpha *= hud.slotPulse[si];
            ctx.lineWidth = 3 * s;
            ctx.strokeStyle = '#ffffff';
            circle(ctx, x, y, r * (1 + k * 0.6)); ctx.stroke();
            ctx.restore();
          }
        }
        if (desktop) keyChip(ctx, id, x + r * 0.7, y - r * 0.7);
      } else if (id === 'name') {
        const col = '#ffd54f';
        const pulse = 0.5 + 0.5 * sin(t * 5);
        glow(ctx, x, y, r * (1.9 + pulse * 0.4), col, 0.35 + pulse * 0.3);
        drawDisc(ctx, x, y, r, col);
        drawGlyph(ctx, 'quill', x + r * 0.08, y + r * 0.1, r * 0.95, '#ffe082', t);
        drawGlyph(ctx, 'crown', x, y - r * 0.55 - pulse * 2 * s, r * 0.55, col, t);
        ctx.font = hud.fTiny;
        ctx.textAlign = 'center';
        outlinedText(ctx, 'NOME', x, y + r + 8 * s, '#ffe082', 2.5);
        if (desktop) keyChip(ctx, id, x + r * 0.72, y - r * 0.72);
      } else if (id === 'pause') {
        ctx.globalAlpha *= 0.9;
        drawDisc(ctx, x, y, r, '#9aa9cc');
        drawGlyph(ctx, 'pause', x, y, r * 0.9, '#ffffff', t);
      } else {
        drawDisc(ctx, x, y, r, '#4fc3ff');
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFps(ctx) {
    if (!settings().showFps) return;
    const f = (SK.debug && SK.debug.fps) | 0;
    if (f !== hud.fps) { hud.fps = f; hud.fpsStr = f + ' FPS'; }
    const s = hud.s;
    ctx.font = hud.fSmall;
    ctx.textAlign = 'left';
    outlinedText(ctx, hud.fpsStr, hud.ins.l + 8 * s, SK.H - hud.ins.b - 8 * s, f >= 50 ? '#69f0ae' : f >= 30 ? '#ffd54f' : '#ff5252', 2.5);
  }

  function renderHUD(ctx, G) {
    if (!ctx || !G || !G.player || G.state === 'title') return;
    if (!inited) init();
    const p = G.player;
    if (hud.key === '' || SK.W !== hud.W || SK.H !== hud.H || (SK.DPR || 1) !== hud.dpr || SK.quality !== hud.q) layout(ctx);
    const dt = clamp((SK.time && SK.time.rawDt) || 1 / 60, 0, 0.1);
    hud.t += dt;
    const t = hud.t;
    const bossOn = !!(G.boss && !G.boss.dead && (G.boss.hp || 0) > 0);
    if (bossOn !== hud.bossOn) { hud.bossOn = bossOn; if (root) root.classList.toggle('boss-on', bossOn); }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawPlayerPanel(ctx, p, dt, t);
    const rowBottom = drawSkillRow(ctx, p, dt, t);
    drawAllies(ctx, G, dt, t, rowBottom);
    drawTopCenter(ctx, G, dt, t);
    drawBoss(ctx, G, dt, t);
    drawKillsCombo(ctx, G, dt, t);
    drawJoystick(ctx, t);
    drawButtons(ctx, G, p, dt, t);
    drawFps(ctx);
    ctx.restore();
  }

  /* ============================================================ lifecycle */
  function update(dt) {
    if (!inited) return;
    const G = SK.G;
    const bossOn = !!(G && G.boss && !G.boss.dead && (G.boss.hp || 0) > 0);
    if (bossOn !== hud.bossOn) { hud.bossOn = bossOn; if (root) root.classList.toggle('boss-on', bossOn); }
    if (G && G.state === 'title' && hud.lastHp >= 0) {
      // reset HUD smoothing between runs
      hud.lastHp = -1; hud.lastLevel = -1; hud.lvPop = 0; hud.hp = 1; hud.hpLag = 1; hud.mp = 1; hud.xp = 0;
      hud.lastCombo = 0; hud.comboFade = 0; hud.kills = -1; hud.skillSeen = {}; hud.skillPop = {}; allyCache.clear();
    }
    if (oracle.cur || banner.cur || toasts.length) ensureLoop();
  }

  function init() {
    if (inited) return SK.UI;
    inited = true;
    root = document.getElementById('ui');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ui';
      document.body.appendChild(root);
    }
    applyQualityClass();
    createScreen('title', 'sk-title-screen', 10);
    createScreen('pause', 'dim sk-center', 20);
    createScreen('gameover', 'dim sk-center', 30);
    createScreen('victory', 'dim sk-center', 30);
    for (const k of SUB) createScreen(k, 'solid', 40);

    oracle.el = el('div', 'sk-oracle sk-own');
    oracle.tx = el('div', 'tx');
    add(oracle.el, el('div', 'lbl', '《Oracolo》'), oracle.tx);
    banner.el = el('div', 'sk-banner sk-own');
    banner.tt = el('h2', 'tt');
    banner.st = el('p', 'st');
    const band = el('div', 'band');
    add(band, banner.tt, banner.st);
    add(banner.el, el('div', 'bar t'), el('div', 'bar b'), band);
    toastBox = el('div', 'sk-toasts sk-own');
    const probe = el('div', 'sk-own');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    hud.probe = probe;
    for (const n of [oracle.el, banner.el, toastBox, probe]) { root.appendChild(n); ownEls.add(n); }

    if (SK.events) {
      SK.events.on('key', onKey);
      SK.events.on('resize', () => { readInsets(); });
    }
    readInsets();
    return SK.UI;
  }

  function refresh(name) {
    if (!inited) return;
    if (name && refreshers[name] && screens[name] && screens[name].open) safe(() => refreshers[name](screens[name].el));
    else if (!name) for (const k in refreshers) if (screens[k] && screens[k].open) safe(() => refreshers[k](screens[k].el));
  }

  SK.UI = {
    init,
    show,
    hide,
    hideAll,
    isOpen,
    back,
    levelUp,
    oracle: showOracle,
    banner: showBanner,
    toast,
    namingDialog,
    confirm: confirmDialog,
    renderHUD,
    update,
    refresh,
    drawGlyph,
    get root() { return root; },
  };
})(window.SK);
