/* Slime Reborn — SK.Character: races, classes, non-slime hero rendering, character creator. */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2;
  const HALF_PI = Math.PI / 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const EMPTY = Object.freeze({});
  const GOLD = '#ffd54f';
  const DEFAULT_CHAR = { name: 'Pierfrancesco', race: 'slime', cls: 'pierfrancesco', color: '#4fc3ff' };

  function sfx(name, opts) {
    try { if (SK.Audio && SK.Audio.sfx) SK.Audio.sfx(name, opts); } catch (e) { /* audio optional */ }
  }
  function nowT() {
    return SK.time && isFinite(SK.time.t) ? SK.time.t : (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
  }
  function validHex(c) {
    return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /* ================================================================ skills helpers */
  const SKILL_NAMES = {
    water_blade: "Lama d'Acqua", sonic_wave: 'Onda Sonica', sticky_web: 'Filo Vischioso', needle_storm: 'Tempesta di Aculei',
    thorn_ring: 'Anello di Spine', magma_orb: 'Sfere di Magma', cleave: 'Fendente Brutale', poison_mist: 'Nebbia Velenosa',
    spirit_orbs: 'Spiriti Erranti', fire_breath: 'Soffio di Fuoco', meteor: 'Pioggia di Meteore', regen: 'Rigenerazione Istantanea',
    body_armor: 'Corazza di Roccia', shadow_step: "Passo d'Ombra", black_lightning: 'Fulmine Nero', wolf_howl: 'Ululato Lunare',
    gluttony: 'Fame Insaziabile',
  };
  function skillName(id) {
    const d = SK.Skills && SK.Skills.defs && SK.Skills.defs[id];
    return (d && d.name) || SKILL_NAMES[id] || id;
  }
  function skillMax(id) {
    const d = SK.Skills && SK.Skills.defs && SK.Skills.defs[id];
    return (d && d.maxLevel) || 5;
  }
  const STAT_DEFAULTS = {
    dmg: 1, speed: 1, cdr: 0, area: 1, magnet: 110, armor: 0, regen: 0, crit: 0.05, critMul: 2, projSpeed: 1, amount: 0,
    mpRegen: 4, luck: 1, xpMul: 1, soulMul: 1, lifesteal: 0, absorbMul: 1, masteryMul: 1, maxAllies: 6, allyDmg: 1, dashCdMul: 1,
  };
  function ensure(p) {
    if (!p.stats) p.stats = {};
    for (const k in STAT_DEFAULTS) if (!isFinite(p.stats[k])) p.stats[k] = STAT_DEFAULTS[k];
    if (!p.skills) p.skills = {};
    if (!p.mastery) p.mastery = {};
    if (!Array.isArray(p.slots)) p.slots = [null, null, null];
    while (p.slots.length < 3) p.slots.push(null);
    if (!p.perks) p.perks = {};
    if (!isFinite(p.stage)) p.stage = 0;
    if (!isFinite(p.revives)) p.revives = 0;
    if (!isFinite(p.maxHp)) p.maxHp = 100;
    if (!isFinite(p.hp)) p.hp = p.maxHp;
    if (!isFinite(p.maxMp)) p.maxMp = 100;
    if (!isFinite(p.mp)) p.mp = p.maxMp;
    return p;
  }
  function grant(p, id, level) {
    const cur = p.skills[id] || 0;
    p.skills[id] = Math.min(skillMax(id), Math.max(cur, level || 1));
    if (p.mastery[id] == null) p.mastery[id] = 0;
  }
  function levelUpSkill(p, id, add) {
    const cur = p.skills[id] || 0;
    p.skills[id] = Math.min(skillMax(id), cur + (add || 1));
    if (p.mastery[id] == null) p.mastery[id] = 0;
  }
  function mulHp(p, f) {
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = Math.round(p.maxHp * f);
    p.hp = Math.max(1, Math.round(p.maxHp * ratio));
  }
  function addMp(p, n) {
    p.maxMp = Math.round(p.maxMp + n);
    p.mp = Math.min(p.maxMp, p.mp + n);
  }
  function bindSlot(p, index, id) {
    for (let i = 0; i < p.slots.length; i++) if (p.slots[i] === id && i !== index) p.slots[i] = null;
    const prev = p.slots[index];
    p.slots[index] = id;
    if (prev && prev !== id) {
      const free = p.slots.indexOf(null);
      if (free >= 0) p.slots[free] = prev;
    }
  }

  /* ======================================================================= races */
  const races = {
    slime: {
      id: 'slime', name: 'Slime',
      desc: "Una goccia di gelatina reincarnata con una fame senza fondo. Divora i mostri, ne ruba i poteri e cresce fino a diventare un Re Demone.",
      stages: ['Slime', 'Slime Primordiale', 'Slime Demoniaco', 'Sovrano Slime'],
      bonusList: ['Raggio del Predatore +30%', 'Rigenerazione +1 PV/s', "Abilità iniziale: Lama d'Acqua"],
      bonusDesc: "Raggio del Predatore +30% · Rigenerazione +1 PV/s · Inizia con Lama d'Acqua",
      startSkill: 'water_blade',
      colors: ['#4fc3ff', '#3ef0d0', '#69f0ae', '#b388ff', '#ff4f8b', '#ffd54f'],
      apply(p) {
        ensure(p);
        p.stats.absorbMul *= 1.3;
        p.stats.regen += 1;
        grant(p, 'water_blade', 1);
      },
    },
    oni: {
      id: 'oni', name: 'Oni',
      desc: "Un giovane demone cornuto nato nelle montagne di ferro. Picchia come una frana e trascina una mazza chiodata più grande di lui.",
      stages: ['Giovane Oni', 'Oni Guerriero', 'Signore Oni', 'Divinità Oni'],
      bonusList: ['Danno +25%', 'Velocità −8%', 'Abilità iniziale: Fendente Brutale'],
      bonusDesc: 'Danno +25% · Velocità −8% · Inizia con Fendente Brutale',
      startSkill: 'cleave',
      colors: ['#e5394f', '#ff7043', '#3f8cff', '#8e5bff', '#2fbf7f', '#e8e2d4'],
      apply(p) {
        ensure(p);
        p.stats.dmg *= 1.25;
        p.stats.speed *= 0.92;
        grant(p, 'cleave', 1);
      },
    },
    wolf: {
      id: 'wolf', name: "Lupo d'Ombra",
      desc: "Un cucciolo nato dall'ombra della luna. Veloce come un pensiero, scatta tra i nemici e li riempie di aculei prima che capiscano cosa è successo.",
      stages: ["Cucciolo d'Ombra", 'Lupo Tempesta', 'Lupo Celeste', 'Re dei Lupi Divini'],
      bonusList: ['Velocità +20%', 'Ricarica dello scatto −35%', "Abilità iniziali: Passo d'Ombra + Tempesta di Aculei"],
      bonusDesc: "Velocità +20% · Scatto −35% ricarica · Inizia con Passo d'Ombra e Tempesta di Aculei",
      startSkill: 'shadow_step',
      colors: ['#8fa3c7', '#4a5578', '#e8eef8', '#3a2f55', '#c99a5e', '#5fd0ff'],
      apply(p) {
        ensure(p);
        p.stats.speed *= 1.2;
        p.stats.dashCdMul *= 0.65;
        grant(p, 'shadow_step', 1);
        grant(p, 'needle_storm', 1);
      },
    },
    dragon: {
      id: 'dragon', name: 'Drago',
      desc: "Un cucciolo di drago schiuso tra le braci. Scaglie dure come l'acciaio e un respiro che diventa fiamma: cresce fino a oscurare il cielo.",
      stages: ['Cucciolo di Drago', 'Viverna', 'Drago Antico', 'Drago Primordiale'],
      bonusList: ['PV massimi +35%', 'Armatura +2', 'Abilità iniziale: Soffio di Fuoco'],
      bonusDesc: 'PV massimi +35% · Armatura +2 · Inizia con Soffio di Fuoco',
      startSkill: 'fire_breath',
      colors: ['#2fd08a', '#e53935', '#3f7bff', '#ffb300', '#7c4dff', '#1de9b6'],
      apply(p) {
        ensure(p);
        mulHp(p, 1.35);
        p.stats.armor += 2;
        grant(p, 'fire_breath', 1);
      },
    },
    vampire: {
      id: 'vampire', name: 'Vampiro',
      desc: "Un nobile della notte risvegliato dopo mille anni. Ogni colpo gli restituisce vita, e gli spiriti dei caduti danzano al suo comando.",
      stages: ['Novizio della Notte', 'Vampiro', 'Signore Vampiro', 'Progenitore'],
      bonusList: ['Rubavita 6% del danno inflitto', 'Abilità iniziale: Spiriti Erranti'],
      bonusDesc: 'Rubavita 6% · Inizia con Spiriti Erranti',
      startSkill: 'spirit_orbs',
      colors: ['#8e1b3a', '#4a148c', '#1a3a8c', '#263238', '#c62828', '#d8d2e6'],
      apply(p) {
        ensure(p);
        p.stats.lifesteal += 0.06;
        grant(p, 'spirit_orbs', 1);
      },
    },
  };
  const raceOrder = ['slime', 'oni', 'wolf', 'dragon', 'vampire'];

  /* ===================================================================== classes */
  const PIER_LORE =
    "Prima di rinascere era un uomo come tanti. Poi, nel silenzio tra due vite, Pierfrancesco Del Bagno trovò il confine di ogni cosa " +
    "e lo divorò: il concetto stesso di limite. Da allora le stelle si inchinano al suo passaggio, i Re Demoni ripassano il testamento " +
    "e persino l'Oracolo parla di lui sottovoce. Non è lui a salire di livello: è il livello che sale verso di lui.";

  const classes = {
    predatore: {
      id: 'predatore', name: 'Predatore', rarity: 'raro',
      desc: "Il cacciatore di essenze. Il suo vortice inghiotte tutto e ogni abilità divorata cresce il doppio più in fretta.",
      perksDesc: ['Raggio del Predatore +40%', 'Maestria per essenza ×2'],
      apply(p) {
        ensure(p);
        p.stats.absorbMul *= 1.4;
        p.stats.masteryMul *= 2;
      },
    },
    guerriero: {
      id: 'guerriero', name: 'Guerriero', rarity: 'raro',
      desc: "Acciaio, muscoli e testardaggine. Regge i colpi in prima linea e risponde con fendenti devastanti.",
      perksDesc: ['PV massimi +30%', 'Armatura +2', 'Fendente Brutale +1 livello'],
      apply(p) {
        ensure(p);
        mulHp(p, 1.3);
        p.stats.armor += 2;
        levelUpSkill(p, 'cleave', 1);
      },
    },
    arcimago: {
      id: 'arcimago', name: 'Arcimago', rarity: 'epico',
      desc: "Studioso dei magicule. Incantesimi più ampi, più frequenti e una riserva di mana che sembra non finire mai.",
      perksDesc: ['Area +25%', 'Ricarica abilità −15%', 'MP massimi +30', 'Rigenerazione MP +3/s'],
      apply(p) {
        ensure(p);
        p.stats.area *= 1.25;
        p.stats.cdr = Math.min(0.6, p.stats.cdr + 0.15);
        addMp(p, 30);
        p.stats.mpRegen += 3;
      },
    },
    evocatore: {
      id: 'evocatore', name: 'Evocatore', rarity: 'epico',
      desc: "Non combatte mai da solo. Comanda un esercito di mostri con nome e chiama il branco spettrale alla battaglia.",
      perksDesc: ['Alleati massimi +3', 'Danno degli alleati +60%', 'Inizia con Ululato Lunare (slot 1)'],
      apply(p) {
        ensure(p);
        p.stats.maxAllies += 3;
        p.stats.allyDmg *= 1.6;
        grant(p, 'wolf_howl', 1);
        bindSlot(p, 0, 'wolf_howl');
      },
    },
    pierfrancesco: {
      id: 'pierfrancesco', name: 'Pierfrancesco Del Bagno', title: "L'Imperatore Infinito", rarity: 'mitico',
      desc: "Il sovrano che divorò il concetto stesso di limite. La classe più potente mai esistita.",
      lore: PIER_LORE,
      perksDesc: [
        'Danno ×3 · PV massimi ×3',
        'Velocità +50% · Ricarica −50%',
        'Critico 50% · Danno critico ×3',
        'XP ×2 · Anime ×3 · 3 Rinascite',
        'Predatore ×2 · Maestria ×4 · Alleati +6',
        'Fulmine Nero, Ululato Lunare e Fame Insaziabile già pronti',
        'Aura Imperiale: brucia e rallenta i nemici vicini',
        'Giudizio Imperiale: ogni 18 s una sentenza dorata su tutto lo schermo',
        'Nasce già evoluto e porta sempre la corona',
      ],
      apply(p) {
        ensure(p);
        const s = p.stats;
        s.dmg *= 3;
        mulHp(p, 3);
        s.speed *= 1.5;
        s.cdr = Math.min(0.6, Math.max(s.cdr, 0.5));
        s.crit = Math.max(s.crit, 0.5);
        s.critMul = Math.max(s.critMul, 3);
        s.xpMul *= 2;
        s.soulMul *= 3;
        p.revives += 3;
        s.absorbMul *= 2;
        s.masteryMul *= 4;
        s.maxAllies += 6;
        grant(p, 'black_lightning', 1);
        grant(p, 'wolf_howl', 1);
        grant(p, 'gluttony', 1);
        p.slots[0] = 'black_lightning';
        p.slots[1] = 'wolf_howl';
        p.slots[2] = 'gluttony';
        p.perks.imperialAura = true;
        p.perks.imperialJudgement = true;
        p.perks.crown = true;
        p.stage = Math.max(p.stage | 0, 1);
      },
    },
  };
  const classOrder = ['pierfrancesco', 'predatore', 'guerriero', 'arcimago', 'evocatore'];
  const RARITY_LABEL = { comune: 'Comune', raro: 'Raro', epico: 'Epico', leggendario: 'Leggendario', mitico: 'MITICO' };

  function applyRace(player) {
    if (!player) return player;
    const r = races[player.race] || races.slime;
    player.race = r.id;
    r.apply(player);
    return player;
  }
  function applyClass(player) {
    if (!player) return player;
    const c = classes[player.cls];
    if (!c) { ensure(player); return player; }
    c.apply(player);
    return player;
  }
  function stageName(player) {
    if (!player) return '';
    const r = races[player.race] || races.slime;
    const st = clamp((+player.stage || 0) | 0, 0, 3);
    return r.stages[st];
  }
  function isImperial(ent) {
    return !!ent && (ent.cls === 'pierfrancesco' || !!(ent.perks && ent.perks.imperialAura));
  }
  function colorFor(ent, race) {
    return validHex(ent && ent.color) || (races[race] || races.slime).colors[0];
  }

  /* ========================================================== drawing primitives */
  let MONO = null;      // silhouette pass colour (flash / afterimage)
  let LX = -0.55, LY = -0.83; // light direction in the creature's local frame
  let PPU = 30;         // device pixels per local unit
  const OL = 0.05;      // outline half width (local units)

  function fillC(ctx, c) { ctx.fillStyle = MONO || c; ctx.fill(); }
  function strokeC(ctx, c, w) { ctx.strokeStyle = MONO || c; ctx.lineWidth = w; ctx.stroke(); }
  function E(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx > 0.0005 ? rx : 0.0005, ry > 0.0005 ? ry : 0.0005, rot || 0, 0, TAU);
  }
  function C(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r > 0.0005 ? r : 0.0005, 0, TAU); }
  function tri(c) { return { b: c, d: U.mix(c, '#07040f', 0.4), l: U.mix(c, '#ffffff', 0.4) }; }
  const GOLD_TRI = tri(GOLD);

  /** Volumetric ellipse: outline, dark base, lit region shifted toward the light, soft specular. */
  function vol(ctx, x, y, rx, ry, rot, t3, pal, D, noOutline) {
    E(ctx, x, y, rx, ry, rot);
    if (!noOutline) strokeC(ctx, pal.outline, OL * 2);
    fillC(ctx, D ? t3.d : t3.b);
    if (!D) return;
    ctx.save();
    E(ctx, x, y, rx, ry, rot);
    ctx.clip();
    E(ctx, x + LX * rx * 0.3, y + LY * ry * 0.3, rx * 0.94, ry * 0.94, rot);
    fillC(ctx, t3.b);
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.5;
    E(ctx, x + LX * rx * 0.48, y + LY * ry * 0.48, rx * 0.36, ry * 0.3, rot);
    fillC(ctx, t3.l);
    ctx.globalAlpha = a;
    ctx.restore();
  }
  /** Additive glow in local units; sprite resolution follows the on-screen size. */
  function glow(ctx, x, y, r, color, a) {
    if (MONO || !(a > 0.003) || !SK.FX || !SK.FX.glowSprite) return;
    const spr = SK.FX.glowSprite(color, clamp(r * PPU, 4, 96));
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * (a > 1 ? 1 : a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }
  function horn(ctx, bx, by, dir, len, wb, curl, t3, pal, D) {
    const cx = Math.cos(dir), cy = Math.sin(dir), px = -cy, py = cx;
    const tx = bx + cx * len + px * curl, ty = by + cy * len + py * curl;
    ctx.beginPath();
    ctx.moveTo(bx + px * wb, by + py * wb);
    ctx.quadraticCurveTo(bx + cx * len * 0.55 + px * (wb * 0.7 + curl * 0.2), by + cy * len * 0.55 + py * (wb * 0.7 + curl * 0.2), tx, ty);
    ctx.quadraticCurveTo(bx + cx * len * 0.5 - px * (wb * 0.4 - curl * 0.5), by + cy * len * 0.5 - py * (wb * 0.4 - curl * 0.5), bx - px * wb, by - py * wb);
    ctx.closePath();
    strokeC(ctx, pal.outline, OL * 1.6);
    fillC(ctx, t3.b);
    if (D && PPU * len > 6) {
      ctx.beginPath();
      ctx.moveTo(bx + px * wb * 0.5 + cx * len * 0.1, by + py * wb * 0.5 + cy * len * 0.1);
      ctx.quadraticCurveTo(bx + cx * len * 0.5 + px * wb * 0.3, by + cy * len * 0.5 + py * wb * 0.3, tx * 0.85 + bx * 0.15, ty * 0.85 + by * 0.15);
      strokeC(ctx, t3.l, wb * 0.35);
      E(ctx, bx, by, wb * 1.05, wb * 1.05, 0);
      strokeC(ctx, t3.d, wb * 0.35);
    }
  }

  /* ============================================================ palettes */
  const PALS = new Map();
  function palFor(race, color, stage, imperial) {
    const key = race + color + stage + (imperial ? 'i' : '');
    let p = PALS.get(key);
    if (p) return p;
    p = {
      outline: U.mix(color, '#05030a', 0.82), eyeWhite: '#f4f7ff', pupil: '#0b0612', eye: '#ffb300',
      aura: color, trim: '#c9a24a', accent: color,
    };
    switch (race) {
      case 'oni':
        p.skin = tri(color);
        p.hair = tri(U.mix(color, '#120814', 0.78));
        p.horn = tri(stage >= 3 ? '#fff1c4' : '#ece0c4');
        p.metal = tri(stage >= 3 ? '#d9a93a' : '#4b5268');
        p.boot = tri(U.mix(color, '#0b0712', 0.72));
        p.pelt = tri('#e5a336');
        p.wood = tri('#8a5a35');
        p.eye = ['#ffcf4a', '#ffb300', '#ff8a1a', '#fff176'][stage];
        p.eyeWhite = stage >= 2 ? '#fff3cf' : '#f4f7ff';
        p.aura = stage >= 3 ? '#ff7a1a' : U.mix(color, '#ff3d00', 0.45);
        p.accent = '#ff9100';
        break;
      case 'wolf':
        p.fur = tri(color);
        p.fur2 = tri(U.mix(color, '#ffffff', 0.55));
        p.mane = tri(stage >= 3 ? U.mix(color, '#fff2c0', 0.6) : U.mix(color, '#ffffff', 0.35));
        p.inner = '#f2a7b8';
        p.nose = '#1a1422';
        p.accent = ['#9fd8ff', '#7ff6ff', '#c2b3ff', '#ffe082'][stage];
        p.eye = ['#7fd3ff', '#7ff6ff', '#c3b0ff', '#ffd54f'][stage];
        p.aura = [U.mix(color, '#7fd3ff', 0.5), '#5fe3ff', '#8f7dff', '#ffd77a'][stage];
        break;
      case 'dragon':
        p.scale = tri(color);
        p.belly = tri(U.mix(color, '#ffd27a', 0.5));
        p.spine = tri(stage >= 3 ? '#ffb300' : U.mix(color, '#ff6d3a', 0.5));
        p.horn = tri('#eadcc0');
        p.mem = U.mix(color, '#1a0a22', 0.5);
        p.memL = U.mix(color, '#ffffff', 0.12);
        p.bone = U.mix(color, '#ffffff', 0.15);
        p.claw = '#f4ead8';
        p.eye = ['#ffd54f', '#ffca28', '#ff9100', '#fff59d'][stage];
        p.accent = '#ff9100';
        p.aura = stage >= 3 ? '#ff9100' : U.mix(color, '#ffb74d', 0.4);
        break;
      default: // vampire
        p.cape = tri(color);
        p.lining = tri('#b0102e');
        p.cloth = tri('#1d1528');
        p.skin = tri('#efe4f0');
        p.hair = tri('#1b1222');
        p.eye = ['#ff6b7d', '#ff2a48', '#ff1744', '#ff3d00'][stage];
        p.eyeWhite = '#2a0710';
        p.pupil = '#ffe0e4';
        p.mem = U.mix(color, '#12040c', 0.55);
        p.memL = U.mix(color, '#ffffff', 0.1);
        p.bone = U.mix(color, '#d0c0d8', 0.35);
        p.aura = stage >= 3 ? '#ff1744' : U.mix(color, '#ff1744', 0.5);
        p.blood = '#ff1744';
        break;
    }
    if (imperial) {
      p.aura = U.mix(p.aura, GOLD, 0.55);
      p.trim = GOLD;
      if (p.spine) p.spine = tri(U.mix(p.spine.b, GOLD, 0.6));
      if (p.mane && stage >= 2) p.mane = tri(U.mix(p.mane.b, GOLD, 0.45));
    }
    p.ghost = U.mix(p.aura, '#ffffff', 0.25);
    if (PALS.size > 240) PALS.clear();
    PALS.set(key, p);
    return p;
  }

  /* ========================================================= animation state */
  const STATES = new WeakMap();
  const GHOSTS = 5;
  function makeState() {
    const g = [];
    for (let i = 0; i < GHOSTS; i++) g.push({ x: 0, y: 0, ang: 0, life: 0, max: 1, k: 1 });
    return {
      lastT: -1, dt: 0, ang: 0, angInit: false, angVel: 0, walk: 0, wa: 0, spd: 0, look: 0,
      tail: new Float32Array(10), tailV: new Float32Array(10),
      cape: 0, capeV: 0, capeLen: 0.3, flap: 0, wingOpen: 0.4,
      blinkIn: 1 + Math.random() * 2, blink: 0, earT: 2, ear: 0,
      absorb: 0, dashK: 0, wasDash: false, squash: 0, squashV: 0, hurtPrev: 0,
      ghosts: g, ghostT: 0, ghostI: 0,
      parts: [], partI: 0, emberT: 0.3, goldT: 0, sparkT: 0.4, ringT: 0,
      cx: 0, cy: 0, ca: 1, sa: 0, kx: 1, ky: 1, R: 22,
    };
  }
  function stateFor(ent) {
    let s = STATES.get(ent);
    if (!s) { s = makeState(); STATES.set(ent, s); }
    return s;
  }
  function stepState(s, ent, o, T) {
    let dt = s.lastT < 0 ? 1 / 60 : T - s.lastT;
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    s.lastT = T;
    s.dt = dt;
    const vx = +ent.vx || 0, vy = +ent.vy || 0;
    const spd = Math.sqrt(vx * vx + vy * vy);
    s.spd = spd;
    let face = o.facing;
    if (face == null || !isFinite(face)) face = ent.facing;
    if (face == null || !isFinite(face)) face = spd > 5 ? Math.atan2(vy, vx) : s.ang;
    if (!s.angInit) { s.ang = face; s.angInit = true; }
    if (dt > 0) {
      const prev = s.ang;
      s.ang += U.angleDiff(s.ang, face) * (1 - Math.exp(-16 * dt));
      if (s.ang > Math.PI * 4 || s.ang < -Math.PI * 4) s.ang = Math.atan2(Math.sin(s.ang), Math.cos(s.ang));
      const av = clamp(U.angleDiff(prev, s.ang) / dt, -14, 14);
      s.angVel += (av - s.angVel) * (1 - Math.exp(-10 * dt));
    }
    const k = (lambda) => 1 - Math.exp(-lambda * dt);
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    const lat = -vx * sa + vy * ca;
    s.wa += (clamp(spd / 150, 0, 1) - s.wa) * k(8);
    s.walk += dt * (spd / 46) * TAU;
    if (s.walk > 1e4) s.walk -= TAU * 1000;
    s.look += (clamp(s.angVel * 0.14, -1, 1) - s.look) * k(10);

    // tail chain springs
    const wob = 2 + s.wa * 5;
    for (let i = 0; i < 10; i++) {
      const target = clamp(-s.angVel * 0.026 * (1 + i * 0.22) - lat * 0.0009 * (1 + i * 0.3), -0.34, 0.34) +
        Math.sin(T * wob - i * 0.75) * (0.045 + 0.075 * s.wa);
      s.tailV[i] += (target - s.tail[i]) * 95 * dt;
      s.tailV[i] *= Math.exp(-9 * dt);
      s.tail[i] += s.tailV[i] * dt;
    }
    // cape / hair sway
    const capeT = clamp(-lat * 0.0035 - s.angVel * 0.06, -0.8, 0.8);
    s.capeV += (capeT - s.cape) * 70 * dt;
    s.capeV *= Math.exp(-7 * dt);
    s.cape += s.capeV * dt;

    const dashing = (+ent.dashT > 0) || !!o.dash;
    s.dashK += ((dashing ? 1 : 0) - s.dashK) * k(dashing ? 26 : 10);
    s.capeLen += ((0.3 + 0.5 * s.wa + s.dashK * 0.4) - s.capeLen) * k(6);

    const absorbing = o.absorbing != null ? !!o.absorbing : !!ent.absorbing;
    s.absorb += ((absorbing ? 1 : 0) - s.absorb) * k(12);

    s.flap += dt * (2.2 + s.wa * 6 + s.dashK * 10 + s.absorb * 2);
    if (s.flap > 1e4) s.flap -= TAU * 1000;
    s.wingOpen += ((0.35 + 0.65 * Math.max(s.wa, s.dashK, s.absorb * 0.8)) - s.wingOpen) * k(5);

    s.blinkIn -= dt;
    if (s.blinkIn <= 0) {
      s.blink = 0.13;
      s.blinkIn = Math.random() < 0.18 ? 0.24 : 1.6 + Math.random() * 3.2;
    }
    if (s.blink > 0) s.blink -= dt;
    s.earT -= dt;
    if (s.earT <= 0) { s.ear = 1; s.earT = 1.8 + Math.random() * 4; }
    s.ear = Math.max(0, s.ear - dt * 5);

    if (dashing && !s.wasDash) s.squashV += 7;
    s.wasDash = dashing;
    const hurt = +ent.hurtT || 0;
    if (hurt > 0 && s.hurtPrev <= 0) s.squashV -= 6;
    s.hurtPrev = hurt;
    s.squashV += -s.squash * 170 * dt;
    s.squashV *= Math.exp(-9 * dt);
    s.squash += s.squashV * dt;

    for (let i = 0; i < GHOSTS; i++) if (s.ghosts[i].life > 0) s.ghosts[i].life -= dt;
    if (dashing && dt > 0) {
      s.ghostT -= dt;
      if (s.ghostT <= 0) {
        const g = s.ghosts[s.ghostI++ % GHOSTS];
        g.x = +ent.x || 0; g.y = +ent.y || 0; g.ang = s.ang; g.life = g.max = 0.26;
        s.ghostT = 0.035;
      }
    } else s.ghostT = 0;
  }

  /* ================================================================== particles */
  function partCap() { return SK.quality === 'low' ? 18 : SK.quality === 'medium' ? 32 : 52; }
  function spawnPart(s, x, y, vx, vy, life, size, color, kind) {
    const cap = partCap();
    const arr = s.parts;
    let p = null;
    for (let n = 0; n < arr.length; n++) {
      const q = arr[(s.partI + n) % arr.length];
      if (q.life <= 0) { p = q; s.partI = (s.partI + n + 1) % arr.length; break; }
    }
    if (!p) {
      if (arr.length < cap) { p = { x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', kind: 'gold' }; arr.push(p); }
      else return null;
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = p.max = life; p.size = size; p.color = color; p.kind = kind;
    return p;
  }
  function emitLocal(s, lx, ly, vxl, vyl, life, size, color, kind) {
    const X = lx * s.kx, Y = ly * s.ky;
    spawnPart(s, s.cx + X * s.ca - Y * s.sa, s.cy + X * s.sa + Y * s.ca, vxl * s.ca - vyl * s.sa, vxl * s.sa + vyl * s.ca, life, size, color, kind);
  }
  function updateParts(s, dt) {
    if (!(dt > 0)) return;
    const arr = s.parts;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      const dr = Math.exp(-(p.kind === 'smoke' ? 1.5 : 2.2) * dt);
      p.vx *= dr; p.vy *= dr;
      if (p.kind === 'ember' || p.kind === 'gold' || p.kind === 'smoke') p.vy -= (p.kind === 'smoke' ? 14 : 26) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  function renderParts(ctx, s, pxs) {
    const arr = s.parts;
    if (!arr.length || !SK.FX || !SK.FX.glowSprite) return;
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (p.life <= 0) continue;
      const f = p.life / p.max;
      if (p.kind === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = pa * f * 0.28;
        ctx.fillStyle = p.color;
        C(ctx, p.x, p.y, p.size * (1.8 - f));
        ctx.fill();
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      const sz = p.size * (p.kind === 'star' ? 0.6 + 0.4 * Math.sin(p.life * 30) : 0.4 + 0.6 * f);
      const gr = sz * 3.2;
      ctx.globalAlpha = pa * Math.min(1, f * 1.6) * 0.8;
      const spr = SK.FX.glowSprite(p.color, clamp(gr * pxs, 4, 48));
      ctx.drawImage(spr, p.x - gr, p.y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = pa * Math.min(1, f * 2);
      ctx.fillStyle = p.kind === 'spark' || p.kind === 'star' ? '#ffffff' : U.mix(p.color, '#ffffff', 0.55);
      if (p.kind === 'star') {
        ctx.fillRect(p.x - sz, p.y - sz * 0.18, sz * 2, sz * 0.36);
        ctx.fillRect(p.x - sz * 0.18, p.y - sz, sz * 0.36, sz * 2);
      } else {
        ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      }
    }
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }

  /* ========================================================== shared features */
  const P = {
    T: 0, walk: 0, wa: 0, breath: 0, blink: 0, absorb: 0, absorbT: 0, dashK: 0, stage: 0, lod: 2, low: false,
    expr: 'idle', look: 0, ear: 0, imperial: false, flap: 0, wingOpen: 0.5,
  };

  function eyes(ctx, x, y, sp, r, pal, kind, D) {
    if (!D || P.lod < 1) {
      if (D) { C(ctx, x, y - sp, r * 0.6); fillC(ctx, pal.eye); C(ctx, x, y + sp, r * 0.6); fillC(ctx, pal.eye); }
      return;
    }
    const open = 1 - (P.blink > 0 ? Math.sin(clamp(P.blink / 0.13, 0, 1) * Math.PI) : 0);
    for (let k = -1; k <= 1; k += 2) {
      const ey = y + sp * k;
      if (P.expr === 'hurt') {
        ctx.beginPath();
        ctx.moveTo(x + r * 0.7, ey - r * 0.75);
        ctx.lineTo(x - r * 0.4, ey);
        ctx.lineTo(x + r * 0.7, ey + r * 0.75);
        strokeC(ctx, pal.outline, r * 0.42);
        continue;
      }
      if (P.expr === 'happy' && P.absorb < 0.2) {
        ctx.beginPath();
        ctx.arc(x - r * 0.25, ey, r * 0.75, -1.1, 1.1);
        strokeC(ctx, pal.outline, r * 0.42);
        continue;
      }
      if (open < 0.2) {
        ctx.beginPath();
        ctx.moveTo(x, ey - r * 0.9);
        ctx.lineTo(x, ey + r * 0.9);
        strokeC(ctx, pal.outline, r * 0.36);
        continue;
      }
      E(ctx, x, ey, r * 0.8 * open, r, 0);
      strokeC(ctx, pal.outline, r * 0.38);
      fillC(ctx, pal.eyeWhite);
      const ir = r * (kind === 'slit' ? 0.74 : 0.64);
      const ix = x + r * 0.2 * open, iy = ey + P.look * r * 0.3;
      E(ctx, ix, iy, Math.min(ir, r * 0.72 * open), ir, 0);
      fillC(ctx, pal.eye);
      const dil = 1 + P.absorb * 0.8;
      if (kind === 'slit') E(ctx, ix + r * 0.05, iy, ir * 0.8 * open, ir * 0.2 * dil, 0);
      else C(ctx, ix + r * 0.1, iy, ir * 0.48 * dil * (0.6 + 0.4 * open));
      fillC(ctx, pal.pupil);
      if (P.lod >= 2) {
        C(ctx, x + LX * r * 0.38, ey + LY * r * 0.38, r * 0.22);
        fillC(ctx, '#ffffff');
      }
    }
  }
  function eyeGlow(ctx, x, y, sp, r, pal, a) {
    glow(ctx, x, y - sp, r * 3.2, pal.eye, a);
    glow(ctx, x, y + sp, r * 3.2, pal.eye, a);
  }
  /** Predatore vortex at the mouth + inward suction streaks. */
  function mouthVortex(ctx, mx, my, size, pal, D) {
    if (!D || P.absorb < 0.04) return;
    const a = P.absorb;
    const vr = size * (0.55 + 0.45 * a) * (1 + Math.sin(P.T * 15) * 0.05);
    glow(ctx, mx + vr * 0.4, my, vr * 3.2, '#b388ff', 0.45 * a);
    if (SK.Slime && SK.Slime.drawVortex) SK.Slime.drawVortex(ctx, mx, my, vr, P.T);
    else { C(ctx, mx, my, vr); fillC(ctx, '#12061f'); }
    if (P.lod < 1 || P.low) return;
    const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const ph = (P.T * 1.7 + i / 6) % 1;
      const d = vr + (1 - ph) * size * 3.2;
      const ang = (i - 2.5) * 0.36 + Math.sin(P.T * 3 + i) * 0.1;
      const sx = mx + Math.cos(ang) * d, sy = my + Math.sin(ang) * d;
      const ex = mx + Math.cos(ang + 0.25) * (d - size * 0.6), ey = my + Math.sin(ang + 0.25) * (d - size * 0.6);
      ctx.globalAlpha = pa * a * Math.sin(ph * Math.PI) * 0.75;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = i & 1 ? '#d1b3ff' : pal.aura;
      ctx.lineWidth = size * 0.12;
      ctx.stroke();
    }
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }

  /* ---- tail chain */
  const TP = new Float32Array(24);
  function chain(s, x0, y0, n, seg) {
    let a = Math.PI, x = x0, y = y0;
    TP[0] = x; TP[1] = y;
    for (let i = 0; i < n; i++) {
      a += s.tail[i];
      x += Math.cos(a) * seg;
      y += Math.sin(a) * seg;
      TP[(i + 1) * 2] = x;
      TP[(i + 1) * 2 + 1] = y;
    }
    return a;
  }

  /* ---- membrane wing (dragon / bat) */
  function wing(ctx, side, span, pal, bat, D, glowVeins) {
    const open = P.wingOpen, f = Math.sin(P.flap);
    const sp = span * (0.5 + 0.5 * open) * (1 + 0.17 * f * open);
    const fold = (1 - open) * 0.55;
    const ry = side * 0.24;
    const r0x = 0.1;
    const ex = r0x - 0.04 - fold * 0.25, ey = side * (0.24 + sp * 0.45);
    const wx = r0x - 0.2 - fold * 0.55, wy = side * (0.24 + sp * 0.9);
    const t1x = wx + 0.18 - fold * 0.25, t1y = side * (0.24 + sp * 1.2);
    const t2x = wx - sp * 0.38, t2y = side * (0.24 + sp * 1.04);
    const t3x = wx - sp * 0.68, t3y = side * (0.24 + sp * 0.66);
    const bx = -0.36, by = side * 0.18;
    const scal = bat ? 0.3 : 0.18;
    ctx.beginPath();
    ctx.moveTo(r0x, ry);
    ctx.lineTo(ex, ey);
    ctx.lineTo(wx, wy);
    ctx.lineTo(t1x, t1y);
    ctx.quadraticCurveTo(U.lerp(t1x, t2x, 0.5) + (wx - U.lerp(t1x, t2x, 0.5)) * scal, U.lerp(t1y, t2y, 0.5) + (wy - U.lerp(t1y, t2y, 0.5)) * scal, t2x, t2y);
    ctx.quadraticCurveTo(U.lerp(t2x, t3x, 0.5) + (wx - U.lerp(t2x, t3x, 0.5)) * scal, U.lerp(t2y, t3y, 0.5) + (wy - U.lerp(t2y, t3y, 0.5)) * scal, t3x, t3y);
    ctx.quadraticCurveTo(U.lerp(t3x, bx, 0.5) + (wx - U.lerp(t3x, bx, 0.5)) * scal * 0.8, U.lerp(t3y, by, 0.5) + (wy - U.lerp(t3y, by, 0.5)) * scal * 0.8, bx, by);
    ctx.closePath();
    strokeC(ctx, pal.outline, OL * 2);
    fillC(ctx, pal.mem);
    if (D) {
      ctx.save();
      ctx.clip();
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * 0.35;
      E(ctx, wx + LX * 0.25, wy + LY * 0.25, sp * 0.7, sp * 0.55, 0);
      fillC(ctx, pal.memL);
      ctx.globalAlpha = a;
      ctx.restore();
    }
    // bones
    ctx.beginPath();
    ctx.moveTo(r0x, ry);
    ctx.lineTo(ex, ey);
    ctx.lineTo(wx, wy);
    ctx.moveTo(wx, wy); ctx.lineTo(t1x, t1y);
    ctx.moveTo(wx, wy); ctx.lineTo(t2x, t2y);
    ctx.moveTo(wx, wy); ctx.lineTo(t3x, t3y);
    strokeC(ctx, pal.outline, 0.09);
    strokeC(ctx, pal.bone, 0.05);
    if (D) {
      C(ctx, wx, wy, 0.055);
      fillC(ctx, pal.claw || pal.bone);
      if (glowVeins && P.lod >= 1) {
        const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pa * (0.5 + 0.3 * Math.sin(P.T * 4));
        ctx.beginPath();
        ctx.moveTo(wx, wy); ctx.lineTo((t1x + t2x) * 0.5, (t1y + t2y) * 0.5);
        ctx.moveTo(wx, wy); ctx.lineTo((t2x + t3x) * 0.5, (t2y + t3y) * 0.5);
        ctx.moveTo(ex, ey); ctx.lineTo((t3x + bx) * 0.5, (t3y + by) * 0.5);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 0.035;
        ctx.stroke();
        ctx.globalAlpha = pa;
        ctx.globalCompositeOperation = pc;
      }
    }
  }

  /* ======================================================================= ONI */
  function drawClub(ctx, hx, hy, dir, st, pal, D) {
    const len = 0.62 + 0.13 * st;
    const cx = Math.cos(dir), cy = Math.sin(dir), px = -cy, py = cx;
    const w0 = 0.06, w1 = 0.12 + 0.025 * st;
    const bx = hx - cx * 0.12, by = hy - cy * 0.12;
    const tx = hx + cx * len, ty = hy + cy * len;
    const t3 = st === 0 ? pal.wood : st >= 3 ? GOLD_TRI : pal.metal;
    if (st >= 3) glow(ctx, tx, ty, 0.55, '#ff9100', 0.45 + 0.15 * Math.sin(P.T * 9));
    ctx.beginPath();
    ctx.moveTo(bx + px * w0, by + py * w0);
    ctx.lineTo(tx + px * w1, ty + py * w1);
    ctx.arc(tx, ty, w1, dir - HALF_PI, dir + HALF_PI);
    ctx.lineTo(bx - px * w0, by - py * w0);
    ctx.closePath();
    strokeC(ctx, pal.outline, OL * 2);
    fillC(ctx, t3.b);
    if (!D) return;
    ctx.beginPath();
    ctx.moveTo(bx + px * w0 * 0.3 + LX * 0.02, by + py * w0 * 0.3 + LY * 0.02);
    ctx.lineTo(tx + px * w1 * 0.4, ty + py * w1 * 0.4);
    strokeC(ctx, t3.l, 0.03);
    if (st >= 1 && P.lod >= 1) {
      for (let i = 0; i < 3; i++) {
        const f = 0.45 + i * 0.22;
        const sx = hx + cx * len * f, sy = hy + cy * len * f;
        const ww = U.lerp(w0, w1, f) * 0.9;
        C(ctx, sx + px * ww, sy + py * ww, 0.03); fillC(ctx, st >= 3 ? '#fff4c0' : '#c9cfdc');
        C(ctx, sx - px * ww, sy - py * ww, 0.03); fillC(ctx, st >= 3 ? '#fff4c0' : '#c9cfdc');
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(hx + cx * len * 0.5 + px * w1 * 0.6, hy + cy * len * 0.5 + py * w1 * 0.6);
      ctx.lineTo(hx + cx * len * 0.62 - px * w1 * 0.4, hy + cy * len * 0.62 - py * w1 * 0.4);
      strokeC(ctx, t3.d, 0.025);
    }
  }
  function oniFlames(ctx, hx, hr, s, pal) {
    const pc = ctx.globalCompositeOperation;
    glow(ctx, hx - hr * 0.8, 0, 0.9, '#ff6d00', 0.55);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + (i - 2.5) * 0.36 + s.cape * 0.4;
        const len = (pass ? 0.24 : 0.38) + 0.13 * Math.sin(P.T * 9 + i * 1.7) + P.wa * 0.22 + P.dashK * 0.2;
        const bx = hx + Math.cos(a) * hr * 0.7, by = Math.sin(a) * hr * 0.7;
        const ta = a * 0.65 + Math.PI * 0.35 + Math.sin(P.T * 6 + i) * 0.15;
        const tx = bx + Math.cos(ta) * len, ty = by + Math.sin(ta) * len;
        const w = pass ? 0.06 : 0.11;
        ctx.beginPath();
        ctx.moveTo(bx - Math.sin(a) * w, by + Math.cos(a) * w);
        ctx.quadraticCurveTo((bx + tx) * 0.5 + Math.cos(P.T * 7 + i) * 0.05, (by + ty) * 0.5, tx, ty);
        ctx.quadraticCurveTo((bx + tx) * 0.5, (by + ty) * 0.5 - Math.sin(P.T * 8 + i) * 0.05, bx + Math.sin(a) * w, by - Math.cos(a) * w);
        ctx.closePath();
        fillC(ctx, pass ? '#ffe082' : '#ff6d00');
      }
      if (!pass) ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalCompositeOperation = pc;
  }
  function drawOni(ctx, s, pal, D) {
    const st = P.stage, w = P.walk, wa = P.wa;
    // feet
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const fx = Math.sin(w + (i ? Math.PI : 0)) * 0.3 * wa - 0.02;
      vol(ctx, fx, side * 0.25, 0.19, 0.13, 0, pal.boot, pal, D);
    }
    // arms (+club in the right hand)
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const swing = -Math.sin(w + (i ? Math.PI : 0)) * 0.26 * wa;
      const hx = 0.12 + swing + P.absorb * 0.12, hy = side * (0.74 + 0.04 * st);
      ctx.beginPath();
      ctx.moveTo(0.0, side * 0.48);
      ctx.quadraticCurveTo(hx * 0.4, side * 0.8, hx, hy);
      ctx.lineCap = 'round';
      strokeC(ctx, pal.outline, 0.27);
      strokeC(ctx, D ? pal.skin.d : pal.skin.b, 0.17);
      if (side > 0) drawClub(ctx, hx, hy, 0.28 + Math.sin(w) * 0.14 * wa - P.absorb * 0.35 + P.dashK * 0.5, st, pal, D);
      vol(ctx, hx, hy, 0.15, 0.15, 0, pal.skin, pal, D);
    }
    // torso
    vol(ctx, -0.04, 0, 0.42, 0.62, 0, pal.skin, pal, D);
    if (D) {
      if (st <= 1) {
        // tiger-pelt sash
        ctx.beginPath();
        ctx.moveTo(0.22, -0.5);
        ctx.lineTo(-0.3, 0.48);
        strokeC(ctx, pal.outline, 0.22);
        strokeC(ctx, pal.pelt.b, 0.15);
        if (P.lod >= 2) {
          ctx.beginPath();
          for (let i = 1; i < 5; i++) {
            const f = i / 5, x = U.lerp(0.22, -0.3, f), y = U.lerp(-0.5, 0.48, f);
            ctx.moveTo(x - 0.06, y - 0.03);
            ctx.lineTo(x + 0.06, y + 0.03);
          }
          strokeC(ctx, '#3a2210', 0.035);
        }
      }
      if (st >= 1) {
        vol(ctx, -0.04, -0.5, 0.2, 0.19, 0, pal.metal, pal, D);
        E(ctx, -0.04, -0.5, 0.2, 0.19, 0); strokeC(ctx, pal.trim, 0.03);
      }
      if (st >= 2) {
        vol(ctx, -0.04, 0.5, 0.2, 0.19, 0, pal.metal, pal, D);
        E(ctx, -0.04, 0.5, 0.2, 0.19, 0); strokeC(ctx, pal.trim, 0.03);
        vol(ctx, 0.04, 0, 0.24, 0.36, 0, pal.metal, pal, D);
        E(ctx, 0.04, 0, 0.24, 0.36, 0); strokeC(ctx, pal.trim, 0.035);
      }
      if (st >= 3) {
        glow(ctx, 0.04, 0, 0.42, '#ff9100', 0.5 + 0.2 * Math.sin(P.T * 3));
        ctx.beginPath();
        ctx.moveTo(0.04, -0.2); ctx.lineTo(0.16, 0); ctx.lineTo(0.04, 0.2); ctx.lineTo(-0.08, 0); ctx.closePath();
        fillC(ctx, '#fff3c4');
      }
    }
    // head
    const hx = 0.1 + P.absorb * 0.06, hr = st === 0 ? 0.37 : 0.34;
    if (st >= 3 && D) oniFlames(ctx, hx, hr, s, pal);
    // hair spikes (behind cap)
    if (st < 3 || !D) {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i - 2) * 0.42 + s.cape * 0.35 * (1 - Math.abs(i - 2) * 0.2);
        const bx = hx + Math.cos(a) * hr * 0.75, by = Math.sin(a) * hr * 0.75;
        const len = 0.2 + (i === 2 ? 0.08 : 0) + 0.05 * st;
        const tx = bx + Math.cos(a) * len, ty = by + Math.sin(a) * len;
        const pxx = -Math.sin(a) * 0.1, pyy = Math.cos(a) * 0.1;
        ctx.beginPath();
        ctx.moveTo(bx + pxx, by + pyy); ctx.lineTo(tx, ty); ctx.lineTo(bx - pxx, by - pyy); ctx.closePath();
        strokeC(ctx, pal.outline, OL * 2);
        fillC(ctx, pal.hair.b);
      }
    }
    vol(ctx, hx, 0, hr, hr, 0, pal.skin, pal, D);
    // hair cap (back half)
    ctx.beginPath();
    ctx.arc(hx, 0, hr * 1.02, HALF_PI - 0.35, Math.PI * 1.5 + 0.35, false);
    ctx.quadraticCurveTo(hx + hr * 0.15, 0, hx + Math.cos(HALF_PI - 0.35) * hr * 1.02, Math.sin(HALF_PI - 0.35) * hr * 1.02);
    ctx.closePath();
    fillC(ctx, st >= 3 ? '#ff8f00' : pal.hair.b);
    if (D && P.lod >= 2) {
      ctx.beginPath();
      ctx.arc(hx - hr * 0.1, 0, hr * 0.62, Math.PI * 0.75, Math.PI * 1.25);
      strokeC(ctx, st >= 3 ? '#ffe082' : pal.hair.l, 0.04);
    }
    // horns
    const hl = [0.17, 0.26, 0.38, 0.5][st];
    if (st === 0) {
      horn(ctx, hx + 0.08, 0, Math.PI * 0.82, hl, 0.07, 0.03, pal.horn, pal, D);
    } else {
      for (let k = -1; k <= 1; k += 2) {
        const bx = hx + Math.cos(0.85) * hr * 0.62, by = k * Math.sin(0.85) * hr * 0.62;
        horn(ctx, bx, by, k * (1.35 + st * 0.12), hl, 0.07 + 0.012 * st, -k * 0.06 * st, pal.horn, pal, D);
        if (st >= 3) glow(ctx, bx + Math.cos(k * 1.7) * hl, by + Math.sin(k * 1.7) * hl, 0.22, GOLD, 0.6);
      }
    }
    // face
    const ex = hx + hr * 0.52, esp = hr * 0.42, er = 0.075;
    if (st >= 2 && D) eyeGlow(ctx, ex, 0, esp, er, pal, 0.55);
    eyes(ctx, ex, 0, esp, er, pal, 'round', D);
    if (D && P.lod >= 1 && P.expr !== 'hurt') {
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(ex - er * 1.3, k * (esp + er * 1.15));
        ctx.lineTo(ex - er * 0.2, k * (esp - er * 0.9));
        strokeC(ctx, pal.hair.d, 0.04);
      }
      // fangs
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(hx + hr * 0.86, k * 0.1);
        ctx.lineTo(hx + hr * 1.08, k * 0.065);
        ctx.lineTo(hx + hr * 0.88, k * 0.03);
        ctx.closePath();
        fillC(ctx, '#fffaf0');
      }
    }
    mouthVortex(ctx, hx + hr + 0.04, 0, 0.18, pal, D);
    if (D && st >= 3 && s.dt > 0) {
      s.emberT -= s.dt;
      if (s.emberT <= 0) {
        s.emberT = 0.07 + Math.random() * 0.12;
        emitLocal(s, hx - hr * (0.6 + Math.random() * 0.4), (Math.random() - 0.5) * hr, -30 - Math.random() * 40, (Math.random() - 0.5) * 30, 0.6 + Math.random() * 0.4, s.R * 0.06, Math.random() < 0.5 ? '#ff9100' : '#ffd54f', 'ember');
      }
    }
  }

  /* ====================================================================== WOLF */
  const STRIPES = [
    [-0.46, -0.3, -0.52, -0.12, -0.42, 0, -0.5, 0.14, -0.43, 0.3],
    [-0.18, -0.34, -0.24, -0.15, -0.13, -0.02, -0.21, 0.15, -0.14, 0.34],
    [0.1, -0.36, 0.04, -0.17, 0.14, -0.03, 0.06, 0.16, 0.12, 0.36],
  ];
  const STARS = [-0.52, -0.12, -0.36, 0.16, -0.2, -0.2, -0.04, 0.09, 0.1, -0.16, 0.22, 0.18, -0.62, 0.06, 0.0, -0.3, -0.28, -0.02, 0.18, 0.0, -0.44, -0.24, -0.1, 0.26];
  function wolfEar(ctx, hx, hr, side, len, tw, pal, D) {
    const ba = side * 1.85;
    const bx = hx + Math.cos(ba) * hr * 0.82, by = Math.sin(ba) * hr * 0.82;
    const a = side * (2.2 + tw);
    const dx = Math.cos(a), dy = Math.sin(a);
    const tx = bx + dx * len, ty = by + dy * len;
    const pw = hr * 0.42, px = -dy * pw, py = dx * pw;
    ctx.beginPath();
    ctx.moveTo(bx + px, by + py);
    ctx.quadraticCurveTo(bx + dx * len * 0.6 + px * 0.55, by + dy * len * 0.6 + py * 0.55, tx, ty);
    ctx.quadraticCurveTo(bx + dx * len * 0.5 - px * 0.5, by + dy * len * 0.5 - py * 0.5, bx - px, by - py);
    ctx.closePath();
    strokeC(ctx, pal.outline, OL * 2);
    fillC(ctx, pal.fur.b);
    if (D && P.lod >= 1) {
      ctx.beginPath();
      ctx.moveTo(bx + px * 0.45 + dx * 0.03, by + py * 0.45 + dy * 0.03);
      ctx.lineTo(bx + dx * len * 0.72, by + dy * len * 0.72);
      ctx.lineTo(bx - px * 0.45 + dx * 0.03, by - py * 0.45 + dy * 0.03);
      ctx.closePath();
      fillC(ctx, pal.inner);
    }
  }
  function drawWolf(ctx, s, pal, D) {
    const st = P.stage, cub = st === 0, w = P.walk, wa = P.wa;
    // tail
    const n = 7, seg = cub ? 0.09 : 0.13 + st * 0.008;
    const tx0 = cub ? -0.5 : -0.66;
    chain(s, tx0, 0, n, seg);
    const bush = cub ? 0.8 : st >= 2 ? 1.18 : 1;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i <= n; i++) {
        const f = i / n;
        const r = (0.16 - 0.08 * f + Math.sin(f * Math.PI) * 0.05) * bush;
        C(ctx, TP[i * 2], TP[i * 2 + 1], pass ? r : r + OL);
        fillC(ctx, pass ? (i >= n - 1 ? pal.fur2.b : D && i < 3 ? pal.fur.d : pal.fur.b) : pal.outline);
      }
    }
    if (D && st >= 3 && s.dt > 0 && Math.random() < s.dt * 9) {
      emitLocal(s, TP[n * 2], TP[n * 2 + 1], -20, (Math.random() - 0.5) * 30, 0.8, s.R * 0.06, GOLD, 'star');
    }
    // legs (diagonal gait)
    for (let j = 0; j < 4; j++) {
      const front = j < 2, side = j % 2 ? 1 : -1;
      const ph = (front === side > 0) ? 0 : Math.PI;
      const px = (front ? (cub ? 0.2 : 0.26) : (cub ? -0.32 : -0.42)) + Math.sin(w + ph) * 0.2 * wa;
      const py = side * (front ? 0.3 : 0.28) * (cub ? 0.9 : 1);
      vol(ctx, px, py, 0.13, 0.1, 0, pal.fur, pal, D);
      if (D && P.lod >= 2) {
        for (let t = -1; t <= 1; t++) { C(ctx, px + 0.1, py + t * 0.045, 0.022); fillC(ctx, pal.fur2.b); }
      }
    }
    // body
    const hipX = cub ? -0.28 : -0.36, chX = cub ? 0.1 : 0.12;
    E(ctx, hipX, 0, cub ? 0.3 : 0.38, cub ? 0.28 : 0.33, 0); strokeC(ctx, pal.outline, OL * 2);
    E(ctx, chX, 0, cub ? 0.34 : 0.42, cub ? 0.32 : 0.37, 0); strokeC(ctx, pal.outline, OL * 2);
    vol(ctx, hipX, 0, cub ? 0.3 : 0.38, cub ? 0.28 : 0.33, 0, pal.fur, pal, D, true);
    vol(ctx, chX, 0, cub ? 0.34 : 0.42, cub ? 0.32 : 0.37, 0, pal.fur, pal, D, true);
    if (D) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.55;
      E(ctx, (hipX + chX) * 0.5 - 0.05, 0, 0.42, 0.14, 0);
      fillC(ctx, pal.fur.d);
      ctx.globalAlpha = a0;
    }
    // stage 1+: storm stripes
    if (D && st >= 1 && P.lod >= 1) {
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (let i = 0; i < STRIPES.length; i++) {
        const pts = STRIPES[i];
        const fl = Math.sin(P.T * 19 + i * 2.3) > 0.55 ? 1 : 0.55;
        ctx.globalAlpha = pa * (st >= 2 ? 0.7 : 0.85) * fl;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
        ctx.strokeStyle = pal.accent;
        ctx.lineWidth = 0.06;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.022;
        ctx.stroke();
      }
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
      glow(ctx, -0.18, 0, 0.7, pal.accent, 0.25 + 0.1 * Math.sin(P.T * 11));
      if (s.dt > 0) {
        s.sparkT -= s.dt;
        if (s.sparkT <= 0) {
          s.sparkT = 0.12 + Math.random() * 0.3;
          const sp = STRIPES[(Math.random() * 3) | 0];
          const q = ((Math.random() * 5) | 0) * 2;
          emitLocal(s, sp[q], sp[q + 1], (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.25, s.R * 0.05, pal.accent, 'spark');
        }
      }
    }
    // stage 2+: starry fur
    if (D && st >= 2 && P.lod >= 1) {
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < STARS.length; i += 2) {
        const tw = 0.5 + 0.5 * Math.sin(P.T * 3.1 + i * 1.9);
        const sz = 0.018 + 0.03 * tw;
        ctx.globalAlpha = pa * (0.35 + 0.65 * tw);
        const x = STARS[i], y = STARS[i + 1];
        ctx.fillRect(x - sz, y - sz * 0.22, sz * 2, sz * 0.44);
        ctx.fillRect(x - sz * 0.22, y - sz, sz * 0.44, sz * 2);
      }
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }
    // mane
    const hx = cub ? 0.5 : 0.6, hr = cub ? 0.34 : 0.29;
    if (st >= 2) {
      const mx = 0.32, spikes = 14, r0 = st >= 3 ? 0.46 : 0.4, r1 = st >= 3 ? 0.64 : 0.54;
      ctx.beginPath();
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU + Math.sin(P.T * 2 + i) * 0.02;
        const r = (i & 1 ? r0 : r1) * (1 + (Math.cos(a) > 0.3 ? -0.25 : 0)) + (i & 1 ? 0 : Math.sin(P.T * 4 + i) * 0.015);
        const x = mx + Math.cos(a) * r * 0.85, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      strokeC(ctx, pal.outline, OL * 2);
      fillC(ctx, pal.mane.b);
      if (D) { E(ctx, mx - 0.04, 0, r0 * 0.75, r0 * 0.9, 0); fillC(ctx, pal.mane.d); }
    }
    // ears + head
    const earLen = cub ? 0.3 : 0.27 + st * 0.02;
    wolfEar(ctx, hx, hr, -1, earLen, -P.ear * 0.35 + P.absorb * 0.3, pal, D);
    wolfEar(ctx, hx, hr, 1, earLen, P.ear * 0.1 + P.absorb * 0.3, pal, D);
    vol(ctx, hx, 0, hr, hr * 0.95, 0, pal.fur, pal, D);
    const snx = hx + hr * 0.82 - P.absorb * 0.04, srx = cub ? 0.16 : 0.22, sry = cub ? 0.14 : 0.15;
    vol(ctx, snx, 0, srx, sry, 0, pal.fur2, pal, D);
    if (D) {
      E(ctx, snx + srx * 0.85, 0, 0.055, 0.07, 0);
      fillC(ctx, pal.nose);
      if (P.lod >= 2) { C(ctx, snx + srx * 0.85 + LX * 0.02, LY * 0.025, 0.018); fillC(ctx, '#8a8098'); }
    }
    const ex = hx + hr * 0.3, esp = hr * 0.5, er = cub ? 0.085 : 0.068;
    if (st >= 1 && D) eyeGlow(ctx, ex, 0, esp, er, pal, 0.3 + 0.15 * st);
    eyes(ctx, ex, 0, esp, er, pal, 'round', D);
    mouthVortex(ctx, snx + srx + 0.06, 0, 0.17, pal, D);
    // stage 3: divine halo
    if (D && st >= 3) {
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, hx - 0.05, 0, 0.9, GOLD, 0.35);
      ctx.globalAlpha = pa * 0.85;
      E(ctx, hx - 0.05, 0, hr * 1.6, hr * 1.6, 0);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.045;
      ctx.stroke();
      ctx.globalAlpha = pa * 0.5;
      E(ctx, hx - 0.05, 0, hr * 1.78, hr * 1.78, 0);
      ctx.lineWidth = 0.02;
      ctx.stroke();
      ctx.fillStyle = '#fff6d0';
      ctx.globalAlpha = pa;
      for (let i = 0; i < 6; i++) {
        const a = P.T * 0.9 + (i * TAU) / 6;
        const x = hx - 0.05 + Math.cos(a) * hr * 1.6, y = Math.sin(a) * hr * 1.6;
        ctx.beginPath();
        ctx.moveTo(x + 0.07, y); ctx.lineTo(x, y + 0.035); ctx.lineTo(x - 0.07, y); ctx.lineTo(x, y - 0.035); ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }
  }

  /* ==================================================================== DRAGON */
  function drawDragon(ctx, s, pal, D) {
    const st = P.stage, cub = st === 0, w = P.walk, wa = P.wa;
    // wings
    if (st >= 1) {
      const span = [0, 0.85, 1.2, 1.55][st];
      wing(ctx, -1, span, pal, false, D, st >= 3);
      wing(ctx, 1, span, pal, false, D, st >= 3);
    } else if (D) {
      for (let k = -1; k <= 1; k += 2) {
        const f = Math.sin(P.flap * 2.2) * 0.04;
        vol(ctx, 0.02, k * (0.36 + f), 0.12, 0.08, k * 0.5, pal.scale, pal, D);
      }
    }
    // tail
    const n = 8, seg = cub ? 0.12 : 0.15 + st * 0.012;
    const endA = chain(s, -0.42, 0, n, seg);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const wdt = U.lerp(cub ? 0.24 : 0.26, 0.05, f);
        ctx.beginPath();
        ctx.moveTo(TP[i * 2], TP[i * 2 + 1]);
        ctx.lineTo(TP[i * 2 + 2], TP[i * 2 + 3]);
        ctx.lineCap = 'round';
        strokeC(ctx, pass ? (D && i > 0 && i % 2 ? pal.scale.d : pal.scale.b) : pal.outline, pass ? wdt : wdt + OL * 2);
      }
    }
    const ex0 = TP[n * 2], ey0 = TP[n * 2 + 1];
    if (st >= 1) {
      const dx = Math.cos(endA), dy = Math.sin(endA), px = -dy, py = dx;
      const L = 0.1 + st * 0.04, Wd = 0.08 + st * 0.03;
      ctx.beginPath();
      ctx.moveTo(ex0 + dx * L * 1.8, ey0 + dy * L * 1.8);
      ctx.lineTo(ex0 + px * Wd + dx * L * 0.2, ey0 + py * Wd + dy * L * 0.2);
      ctx.lineTo(ex0 - dx * L * 0.3, ey0 - dy * L * 0.3);
      ctx.lineTo(ex0 - px * Wd + dx * L * 0.2, ey0 - py * Wd + dy * L * 0.2);
      ctx.closePath();
      strokeC(ctx, pal.outline, OL * 2);
      fillC(ctx, pal.spine.b);
    }
    if (D) {
      for (let i = 1; i < n - 1; i++) {
        const x = TP[i * 2], y = TP[i * 2 + 1];
        const a = Math.atan2(TP[i * 2 + 3] - y, TP[i * 2 + 2] - x);
        const sz = U.lerp(0.075, 0.035, i / n);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * sz * 1.5, y + Math.sin(a) * sz * 1.5);
        ctx.lineTo(x - Math.sin(a) * sz * 0.6, y + Math.cos(a) * sz * 0.6);
        ctx.lineTo(x - Math.cos(a) * sz, y - Math.sin(a) * sz);
        ctx.lineTo(x + Math.sin(a) * sz * 0.6, y - Math.cos(a) * sz * 0.6);
        ctx.closePath();
        fillC(ctx, pal.spine.b);
      }
    }
    // legs
    for (let j = 0; j < 4; j++) {
      const front = j < 2, side = j % 2 ? 1 : -1;
      const ph = (front === side > 0) ? 0 : Math.PI;
      const lx = (front ? 0.22 : -0.28) + Math.sin(w + ph) * 0.17 * wa;
      const ly = side * (cub ? 0.36 : 0.38);
      vol(ctx, lx, ly, 0.14, 0.11, 0, pal.scale, pal, D);
      if (D && P.lod >= 1) {
        for (let t = -1; t <= 1; t++) {
          ctx.beginPath();
          ctx.moveTo(lx + 0.1, ly + t * 0.05 - 0.018);
          ctx.lineTo(lx + 0.18, ly + t * 0.055);
          ctx.lineTo(lx + 0.1, ly + t * 0.05 + 0.018);
          ctx.closePath();
          fillC(ctx, pal.claw);
        }
      }
    }
    // body
    const brx = cub ? 0.44 : 0.5, bry = cub ? 0.41 : 0.37;
    vol(ctx, -0.04, 0, brx, bry, 0, pal.scale, pal, D);
    if (D && P.lod >= 2) {
      ctx.beginPath();
      for (let r = 0; r < 4; r++) {
        for (let c = -1; c <= 1; c++) {
          const x = -0.32 + r * 0.17, y = c * 0.17 + (r & 1 ? 0.08 : 0);
          if (Math.abs(y) > 0.3) continue;
          ctx.moveTo(x + Math.cos(-1.1) * 0.06, y + Math.sin(-1.1) * 0.06);
          ctx.arc(x, y, 0.06, -1.1, 1.1);
        }
      }
      strokeC(ctx, pal.scale.d, 0.022);
    }
    if (D && st >= 3) {
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa * (0.55 + 0.3 * Math.sin(P.T * 3.3));
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x = 0.25 - i * 0.17;
        ctx.moveTo(x, 0); ctx.lineTo(x - 0.1, -0.24); ctx.moveTo(x, 0); ctx.lineTo(x - 0.1, 0.24);
      }
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = 0.035;
      ctx.stroke();
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }
    // back spines
    for (let i = 0; i < 6; i++) {
      const x = 0.3 - i * 0.14, sz = (i & 1 ? 0.05 : 0.075) * (1 + st * 0.12);
      ctx.beginPath();
      ctx.moveTo(x + sz * 1.6, 0); ctx.lineTo(x, sz * 0.75); ctx.lineTo(x - sz, 0); ctx.lineTo(x, -sz * 0.75); ctx.closePath();
      strokeC(ctx, pal.outline, OL);
      fillC(ctx, pal.spine.b);
    }
    // neck + head
    const hx = (cub ? 0.66 : 0.74) + P.absorb * 0.05;
    const nsw = -P.look * 0.07;
    ctx.beginPath();
    ctx.moveTo(0.3, 0);
    ctx.quadraticCurveTo((0.3 + hx) * 0.5, nsw * 1.4, hx - 0.08, nsw);
    ctx.lineCap = 'round';
    strokeC(ctx, pal.outline, 0.3);
    strokeC(ctx, D ? pal.scale.d : pal.scale.b, 0.21);
    const hl = [0.1, 0.2, 0.3, 0.4][st];
    for (let k = -1; k <= 1; k += 2) {
      horn(ctx, hx - 0.1, nsw + k * 0.11, Math.PI - k * 0.45, hl, 0.05 + st * 0.008, k * 0.03 * st, pal.horn, pal, D);
      if (st >= 3) horn(ctx, hx - 0.02, nsw + k * 0.17, Math.PI - k * 0.95, hl * 0.55, 0.04, 0, pal.horn, pal, D);
    }
    vol(ctx, hx, nsw, cub ? 0.26 : 0.24, cub ? 0.23 : 0.2, 0, pal.scale, pal, D);
    const snx = hx + 0.2;
    vol(ctx, snx, nsw, 0.17, 0.13, 0, pal.scale, pal, D);
    if (D) {
      C(ctx, snx + 0.11, nsw - 0.05, 0.02); fillC(ctx, pal.outline);
      C(ctx, snx + 0.11, nsw + 0.05, 0.02); fillC(ctx, pal.outline);
    }
    const ex = hx + 0.05, esp = cub ? 0.12 : 0.11, er = cub ? 0.075 : 0.062;
    if (D && st >= 2) eyeGlow(ctx, ex, nsw, esp, er, pal, 0.5);
    eyes(ctx, ex, nsw, esp, er, pal, 'slit', D);
    mouthVortex(ctx, snx + 0.2, nsw, 0.16, pal, D);
    // nostril embers / smoke
    if (D && s.dt > 0) {
      s.emberT -= s.dt;
      if (s.emberT <= 0) {
        s.emberT = st >= 3 ? 0.08 + Math.random() * 0.12 : 0.25 + Math.random() * 0.45;
        const k = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.3 && !P.low) emitLocal(s, snx + 0.14, nsw + k * 0.05, 18, k * 8, 0.9, s.R * 0.09, '#6b6070', 'smoke');
        else emitLocal(s, snx + 0.14, nsw + k * 0.05, 30 + Math.random() * 30, k * (5 + Math.random() * 15), 0.5 + Math.random() * 0.4, s.R * 0.05, Math.random() < 0.6 ? '#ff9100' : '#ffd54f', 'ember');
      }
    }
  }

  /* =================================================================== VAMPIRE */
  function capePath(ctx, s, len, wid, inset) {
    const hemX = -0.12 - len;
    const sway = s.cape;
    ctx.beginPath();
    ctx.moveTo(0.12, -0.42 + inset);
    ctx.quadraticCurveTo(-0.08, -0.6 - wid * 0.15 + inset, hemX + 0.12, -wid + sway * len * 0.45 + inset);
    const N = 6;
    let px = hemX + 0.12, py = -wid + sway * len * 0.45 + inset;
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const yy = U.lerp(-wid + inset, wid - inset, f) + sway * len * 0.45 * (1 - Math.abs(f - 0.5));
      const wv = Math.sin(P.T * 5.5 + f * 7) * 0.05 * (0.35 + P.wa + P.dashK);
      const xx = hemX + Math.sin(f * Math.PI) * -0.1 + wv + (i === N ? 0.12 : 0);
      ctx.quadraticCurveTo((px + xx) * 0.5 + 0.07, (py + yy) * 0.5, xx, yy);
      px = xx; py = yy;
    }
    ctx.quadraticCurveTo(-0.08, 0.6 + wid * 0.15 - inset, 0.12, 0.42 - inset);
    ctx.closePath();
  }
  function bat(ctx, x, y, a, sz, col) {
    const f = Math.sin(P.T * 20 + x * 5) * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0.02 * sz, 0);
    ctx.quadraticCurveTo(-0.3 * sz, -(0.6 + f) * sz, -0.5 * sz, -(1 + f * 0.4) * sz);
    ctx.quadraticCurveTo(-0.28 * sz, -0.4 * sz, -0.2 * sz, 0);
    ctx.quadraticCurveTo(-0.28 * sz, 0.4 * sz, -0.5 * sz, (1 + f * 0.4) * sz);
    ctx.quadraticCurveTo(-0.3 * sz, (0.6 + f) * sz, 0.02 * sz, 0);
    ctx.closePath();
    fillC(ctx, col);
    E(ctx, 0, 0, 0.22 * sz, 0.16 * sz, 0);
    fillC(ctx, col);
    ctx.restore();
  }
  function drawVampire(ctx, s, pal, D) {
    const st = P.stage, w = P.walk, wa = P.wa;
    if (D && st >= 3) {
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      glow(ctx, -0.1, 0, 2.3, '#ff1744', 0.3 + 0.08 * Math.sin(P.T * 1.7));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa * 0.4;
      C(ctx, -0.1, 0, 1.32);
      ctx.strokeStyle = '#ff5252';
      ctx.lineWidth = 0.04;
      ctx.stroke();
      ctx.globalAlpha = pa * 0.18;
      C(ctx, -0.1, 0, 1.32);
      ctx.fillStyle = '#b71c1c';
      ctx.fill();
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }
    if (st >= 2) {
      const span = st === 2 ? 0.8 : 1.2;
      wing(ctx, -1, span, pal, true, D, false);
      wing(ctx, 1, span, pal, true, D, false);
    }
    // boots peeking out
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const fx = Math.sin(w + (i ? Math.PI : 0)) * 0.26 * wa + 0.04;
      vol(ctx, fx, side * 0.2, 0.15, 0.1, 0, pal.cloth, pal, D);
    }
    // cape: lining then outer cloth
    const len = [0.35, 0.6, 0.72, 0.85][st] + s.capeLen * 0.55;
    const wid = 0.5 + 0.05 * st + wa * 0.08;
    capePath(ctx, s, len, wid + 0.03, 0);
    strokeC(ctx, pal.outline, OL * 2);
    fillC(ctx, st >= 1 ? pal.lining.b : pal.cape.d);
    capePath(ctx, s, len - 0.07, wid, 0.04);
    fillC(ctx, pal.cape.b);
    if (D) {
      ctx.save();
      capePath(ctx, s, len - 0.07, wid, 0.04);
      ctx.clip();
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * 0.45;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(0, i * 0.12);
        ctx.quadraticCurveTo(-len * 0.5, i * 0.2 + s.cape * 0.2, -len - 0.1, i * 0.26 + s.cape * len * 0.4);
      }
      strokeC(ctx, pal.cape.d, 0.04);
      ctx.globalAlpha = a0 * 0.4;
      E(ctx, -0.25 + LX * 0.2, LY * 0.3, 0.35, 0.3, 0);
      fillC(ctx, pal.cape.l);
      ctx.globalAlpha = a0;
      ctx.restore();
      if (P.imperial || st >= 3) {
        capePath(ctx, s, len - 0.07, wid, 0.04);
        strokeC(ctx, pal.trim, 0.025);
      }
    }
    // hands
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      const hx = 0.2 - Math.sin(w + (i ? Math.PI : 0)) * 0.12 * wa + P.absorb * 0.1;
      vol(ctx, hx, side * 0.42, 0.09, 0.09, 0, pal.skin, pal, D);
    }
    // torso
    vol(ctx, 0.02, 0, 0.3, 0.44, 0, pal.cloth, pal, D);
    if (D) {
      ctx.beginPath();
      ctx.moveTo(0.3, -0.08); ctx.lineTo(0.08, 0); ctx.lineTo(0.3, 0.08);
      strokeC(ctx, pal.trim, 0.03);
      C(ctx, 0.27, 0, 0.04); fillC(ctx, '#ff1744');
    }
    // collar
    if (st >= 1) {
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(0.12, k * 0.2);
        ctx.lineTo(-0.16 - 0.04 * st, k * (0.42 + 0.04 * st));
        ctx.lineTo(-0.06, k * 0.1);
        ctx.closePath();
        strokeC(ctx, pal.outline, OL * 2);
        fillC(ctx, pal.lining.b);
        if (D) {
          ctx.beginPath();
          ctx.moveTo(0.1, k * 0.2); ctx.lineTo(-0.15 - 0.04 * st, k * (0.42 + 0.04 * st));
          strokeC(ctx, pal.cape.b, 0.035);
        }
      }
    }
    // head
    const hx = 0.08 + P.absorb * 0.05, hr = 0.27;
    vol(ctx, hx, 0, hr, hr, 0, pal.skin, pal, D);
    ctx.beginPath();
    ctx.arc(hx, 0, hr * 1.03, HALF_PI - 0.25, Math.PI * 1.5 + 0.25, false);
    ctx.quadraticCurveTo(hx + hr * 0.3, -hr * 0.25, hx + hr * 0.62, 0);
    ctx.quadraticCurveTo(hx + hr * 0.3, hr * 0.25, hx + Math.cos(HALF_PI - 0.25) * hr * 1.03, Math.sin(HALF_PI - 0.25) * hr * 1.03);
    ctx.closePath();
    strokeC(ctx, pal.outline, OL);
    fillC(ctx, pal.hair.b);
    if (D && P.lod >= 2) {
      ctx.beginPath();
      ctx.moveTo(hx + hr * 0.45, -0.04);
      ctx.quadraticCurveTo(hx - hr * 0.3, -hr * 0.4, hx - hr * 0.95, -hr * 0.2);
      ctx.moveTo(hx + hr * 0.45, 0.04);
      ctx.quadraticCurveTo(hx - hr * 0.3, hr * 0.4, hx - hr * 0.95, hr * 0.2);
      strokeC(ctx, '#4a3a5c', 0.03);
    }
    const ex = hx + hr * 0.62, esp = hr * 0.42, er = 0.06;
    if (D && st >= 1) eyeGlow(ctx, ex, 0, esp, er, pal, 0.35 + 0.12 * st);
    eyes(ctx, ex, 0, esp, er, pal, 'slit', D);
    if (D && P.lod >= 1 && P.expr !== 'hurt') {
      for (let k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.moveTo(hx + hr * 0.9, k * 0.055);
        ctx.lineTo(hx + hr * 1.12, k * 0.04);
        ctx.lineTo(hx + hr * 0.92, k * 0.015);
        ctx.closePath();
        fillC(ctx, '#ffffff');
      }
    }
    mouthVortex(ctx, hx + hr + 0.05, 0, 0.16, pal, D);
    // orbiting bats & blood
    if (D && st >= 2 && P.lod >= 1) {
      for (let i = 0; i < 2; i++) {
        const a = P.T * 1.5 + i * Math.PI;
        const r = 1.15 + Math.sin(P.T * 2 + i) * 0.1;
        bat(ctx, Math.cos(a) * r, Math.sin(a) * r, a + HALF_PI, 0.16, pal.mem);
      }
    }
    if (D && st >= 3) {
      for (let i = 0; i < 4; i++) {
        const a = -P.T * 1.2 + (i * TAU) / 4;
        const x = Math.cos(a) * 0.95, y = Math.sin(a) * 0.95;
        glow(ctx, x, y, 0.2, '#ff1744', 0.6);
        const ta = a - HALF_PI;
        ctx.beginPath();
        ctx.arc(x, y, 0.05, ta + HALF_PI, ta - HALF_PI + TAU);
        ctx.lineTo(x - Math.cos(ta) * 0.13, y - Math.sin(ta) * 0.13);
        ctx.closePath();
        fillC(ctx, pal.blood);
      }
    }
  }

  const RACE_DRAW = { oni: drawOni, wolf: drawWolf, dragon: drawDragon, vampire: drawVampire };
  const RACE_K = { oni: 1, wolf: 0.95, dragon: 0.95, vampire: 1 };
  const HEAD_X = { oni: 0.1, wolf: 0.58, dragon: 0.72, vampire: 0.08 };

  /* ============================================================ imperial layer */
  function drawSigil(ctx, x, y, r, T, alpha, low) {
    const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, 0, 0, r * 1.25, '#ffb300', 0.22 * alpha);
    ctx.globalAlpha = pa * 0.75 * alpha;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = r * 0.035;
    C(ctx, 0, 0, r); ctx.stroke();
    ctx.globalAlpha = pa * 0.45 * alpha;
    C(ctx, 0, 0, r * 0.84); ctx.stroke();
    // rotating rune ticks
    ctx.rotate(T * 0.45);
    ctx.globalAlpha = pa * 0.8 * alpha;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16;
      const c = Math.cos(a), s = Math.sin(a);
      const l = i & 1 ? 0.06 : 0.11;
      ctx.moveTo(c * r * 0.86, s * r * 0.86);
      ctx.lineTo(c * r * (0.86 + l), s * r * (0.86 + l));
    }
    ctx.lineWidth = r * 0.03;
    ctx.stroke();
    if (!low) {
      // counter-rotating hexagram (violet + gold)
      ctx.rotate(-T * 0.9);
      ctx.globalAlpha = pa * 0.55 * alpha;
      for (let t = 0; t < 2; t++) {
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = (i * TAU) / 3 + (t ? Math.PI : 0) - HALF_PI;
          const px = Math.cos(a) * r * 0.78, py = Math.sin(a) * r * 0.78;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = t ? '#b388ff' : GOLD;
        ctx.lineWidth = r * 0.025;
        ctx.stroke();
      }
      ctx.globalAlpha = pa * 0.4 * alpha;
      C(ctx, 0, 0, r * 0.4);
      ctx.strokeStyle = GOLD;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }
  function imperialLayer(ctx, ent, s, R, T, inGame) {
    const x = +ent.x || 0, y = +ent.y || 0;
    const low = SK.quality === 'low';
    drawSigil(ctx, x, y + R * 0.15, R * 1.55, T, 1, low);
    if (inGame && ent.stats) {
      const rr = 190 * (+ent.stats.area || 1);
      const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa * (0.13 + 0.05 * Math.sin(T * 2.2));
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.5;
      C(ctx, x, y, rr);
      ctx.stroke();
      if (!low) {
        ctx.globalAlpha = pa * 0.32;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        const a0 = T * 0.35;
        for (let i = 0; i < 18; i++) {
          const a = a0 + (i * TAU) / 18;
          ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          ctx.arc(x, y, rr, a, a + 0.12);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }
    // golden motes
    if (s.dt > 0) {
      const rate = low ? 4 : SK.quality === 'medium' ? 8 : 14;
      s.goldT -= s.dt * rate;
      while (s.goldT <= 0) {
        s.goldT += 1;
        const a = Math.random() * TAU, d = R * (0.9 + Math.random() * 0.7);
        spawnPart(s, x + Math.cos(a) * d, y + Math.sin(a) * d, (Math.random() - 0.5) * 12, -(18 + Math.random() * 30), 0.9 + Math.random() * 0.6, R * (0.05 + Math.random() * 0.04), Math.random() < 0.8 ? GOLD : '#d1b3ff', 'gold');
      }
      if (inGame && ent.stats && !low) {
        s.ringT -= s.dt * 5;
        while (s.ringT <= 0) {
          s.ringT += 1;
          const a = Math.random() * TAU, rr = 190 * (+ent.stats.area || 1);
          spawnPart(s, x + Math.cos(a) * rr, y + Math.sin(a) * rr, -Math.cos(a) * 12, -Math.sin(a) * 12 - 10, 0.7, R * 0.07, GOLD, 'star');
        }
      }
    }
  }

  /* ============================================================== renderPlayer */
  const SLIME_OPTS = {
    stage: 0, palette: undefined, color: null, crown: undefined, facing: undefined, expression: undefined, absorbing: false,
    absorbT: 0, alpha: 1, scale: 1, t: undefined, flash: 0, shadow: true, body: undefined, dash: false,
  };
  function shadowBlob(ctx, x, y, rx, ry, ang, a) {
    const pa = ctx.globalAlpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(rx, ry);
    if (SK.FX && SK.FX.glowSprite) {
      ctx.globalAlpha = pa * a;
      const spr = SK.FX.glowSprite('#000000', 32);
      ctx.drawImage(spr, -1.25, -1.25, 2.5, 2.5);
    } else {
      ctx.globalAlpha = pa * a * 0.6;
      C(ctx, 0, 0, 1);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = pa;
  }

  function renderPlayer(ctx, player, opts) {
    if (!ctx || !player) return;
    const o = opts || EMPTY;
    const race = races[player.race] ? player.race : 'slime';
    const imperial = isImperial(player) || !!o.imperial;
    const stage = clamp((o.stage != null ? +o.stage : +player.stage || 0) | 0, 0, 3);
    const T = o.t != null && isFinite(o.t) ? +o.t : (SK.time && isFinite(SK.time.gameT) ? SK.time.gameT : nowT());
    const alpha = o.alpha != null ? clamp(+o.alpha || 0, 0, 1) : 1;
    if (alpha <= 0.003) return;
    const s = stateFor(player);
    stepState(s, player, o, T);
    const color = colorFor(player, race);
    const R = (+player.r > 0 ? +player.r : 22) * (o.scale != null && isFinite(o.scale) ? +o.scale : 1);
    s.R = R;
    let pxs = 1;
    if (ctx.getTransform) { const m = ctx.getTransform(); pxs = Math.sqrt(m.a * m.a + m.b * m.b) || 1; }
    const inGame = !o.portrait;

    ctx.save();
    ctx.globalAlpha *= alpha;
    if (imperial) imperialLayer(ctx, player, s, R, T, inGame);

    if (race === 'slime') {
      if (SK.Slime && SK.Slime.render) {
        const so = SLIME_OPTS;
        so.stage = stage;
        so.color = imperial ? U.mix(color, GOLD, 0.12) : color;
        so.crown = imperial ? true : o.crown;
        so.facing = o.facing;
        so.expression = o.expression;
        so.absorbing = o.absorbing != null ? !!o.absorbing : !!player.absorbing;
        so.absorbT = o.absorbT != null ? o.absorbT : +player.absorbT || 0;
        so.alpha = 1;
        so.scale = o.scale != null ? o.scale : 1;
        so.t = o.t;
        so.flash = o.flash != null ? o.flash : 0;
        so.shadow = o.shadow;
        so.body = o.body;
        so.dash = o.dash != null ? o.dash : +player.dashT > 0;
        so.palette = o.palette;
        SK.Slime.render(ctx, player, so);
      }
    } else {
      drawCreature(ctx, player, s, race, stage, color, imperial, R, T, pxs, o);
    }
    updateParts(s, s.dt);
    renderParts(ctx, s, pxs);
    ctx.restore();
  }

  function drawCreature(ctx, ent, s, race, stage, color, imperial, R, T, pxs, o) {
    const pal = palFor(race, color, stage, imperial);
    const low = SK.quality === 'low';
    const k = R * RACE_K[race] * (1 + stage * 0.07);
    const x = +ent.x || 0, y = +ent.y || 0;
    const hurt = +ent.hurtT > 0 ? Math.min(1, +ent.hurtT * 3) : 0;
    const shx = hurt ? Math.sin(T * 90) * 0.07 * R * hurt : 0;
    const shy = hurt ? Math.cos(T * 77) * 0.05 * R * hurt : 0;
    const bob = -Math.abs(Math.sin(s.walk)) * 0.07 * R * s.wa;
    const flash = clamp((o.flash != null ? +o.flash : +ent.hitFlash) || 0, 0, 1);

    P.T = T; P.walk = s.walk; P.wa = s.wa; P.stage = stage; P.low = low;
    P.breath = Math.sin(T * 2.4) * (0.028 - 0.016 * s.wa);
    P.blink = s.blink > 0 ? s.blink : 0;
    P.absorb = s.absorb; P.dashK = s.dashK; P.look = s.look; P.ear = s.ear; P.imperial = imperial;
    P.flap = s.flap; P.wingOpen = s.wingOpen;
    let expr = o.expression || ent.expression || 'idle';
    if (hurt > 0.15) expr = 'hurt';
    P.expr = expr;
    PPU = pxs * k;
    P.lod = PPU < 11 ? 0 : PPU < 24 ? 1 : 2;

    // ground: shadow + aura
    shadowBlob(ctx, x, y + R * 0.2, R * (1.05 + stage * 0.08), R * (0.75 + stage * 0.05), s.ang, 0.45);
    if (!low || stage >= 2) {
      const ar = R * (1.5 + stage * 0.55) * (1 + s.absorb * 0.25);
      const aa = (0.12 + stage * 0.07) * (0.85 + 0.15 * Math.sin(T * 2)) * (1 + s.absorb * 0.6);
      if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, x, y, ar, pal.aura, aa);
    }

    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    LX = -0.55 * ca + -0.83 * sa;
    LY = 0.55 * sa + -0.83 * ca;
    const draw = RACE_DRAW[race];

    // dash afterimages
    let anyGhost = false;
    for (let i = 0; i < GHOSTS; i++) if (s.ghosts[i].life > 0) { anyGhost = true; break; }
    if (anyGhost) {
      const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
      MONO = pal.ghost;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < GHOSTS; i++) {
        const g = s.ghosts[i];
        if (g.life <= 0) continue;
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.ang);
        ctx.scale(k * 1.12, k * 0.9);
        ctx.globalAlpha = pa * 0.32 * (g.life / g.max);
        draw(ctx, s, pal, false);
        ctx.restore();
      }
      MONO = null;
      ctx.globalAlpha = pa;
      ctx.globalCompositeOperation = pc;
    }

    // main body
    const sx = (1 + s.dashK * 0.26 + s.squash * 0.14) * (1 - P.breath * 0.5);
    const sy = (1 - s.dashK * 0.16 - s.squash * 0.1) * (1 + P.breath);
    s.cx = x + shx; s.cy = y + shy + bob; s.ca = ca; s.sa = sa; s.kx = k * sx; s.ky = k * sy;
    ctx.save();
    ctx.translate(s.cx, s.cy);
    ctx.rotate(s.ang);
    ctx.scale(k * sx, k * sy);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw(ctx, s, pal, true);
    if (flash > 0.01) {
      const pa = ctx.globalAlpha;
      MONO = '#ffffff';
      ctx.globalAlpha = pa * flash * 0.85;
      draw(ctx, s, pal, false);
      MONO = null;
      ctx.globalAlpha = pa;
    }
    ctx.restore();

    if (imperial && SK.Slime && SK.Slime.drawCrown) {
      const hx = HEAD_X[race] * k * sx;
      SK.Slime.drawCrown(ctx, s.cx + ca * hx, s.cy + sa * hx - R * (0.48 + stage * 0.04) + Math.sin(T * 2.4) * R * 0.05, R * 0.6, T);
    }
  }

  /* ============================================================ renderPortrait */
  const PORTRAIT_ENTS = new Map();
  const PORTRAIT_OPTS = { t: 0, stage: 0, portrait: true, facing: 0, absorbing: false, absorbT: 0, flash: 0, expression: undefined };
  const PORTRAIT_R = { oni: 0.2, wolf: 0.19, dragon: 0.17, vampire: 0.2, slime: 0.3 };
  function portraitEnt(key, race) {
    let e = PORTRAIT_ENTS.get(key);
    if (!e) {
      e = { x: 0, y: 0, r: 20, vx: 0, vy: 0, facing: 0, stage: 0, race, color: null, cls: null, dashT: 0, hurtT: 0, absorbing: false, absorbT: 0, perks: null };
      if (PORTRAIT_ENTS.size > 64) PORTRAIT_ENTS.clear();
      PORTRAIT_ENTS.set(key, e);
    }
    return e;
  }
  /**
   * Screen-space animated hero. extra (optional): {cls, imperial, demo (idle/walk/absorb loop), key (state slot),
   * facing, absorbing, flash, expression}.
   */
  function renderPortrait(ctx, x, y, size, raceId, stage, color, t, extra) {
    if (!ctx) return;
    const ex = extra || EMPTY;
    const race = races[raceId] ? raceId : 'slime';
    const st = clamp((+stage || 0) | 0, 0, 3);
    const T = t != null && isFinite(t) ? +t : nowT();
    const sz = +size > 0 ? +size : 96;
    const imperial = ex.cls === 'pierfrancesco' || !!ex.imperial;
    const col = validHex(color) || races[race].colors[0];
    const e = portraitEnt((ex.key || 'p') + ':' + race, race);
    let walking = false, absorbing = !!ex.absorbing, absorbT = 0;
    if (ex.demo) {
      const cyc = ((T % 10) + 10) % 10;
      walking = cyc > 3.2 && cyc < 6.4;
      if (cyc > 7.2 && cyc < 8.9) { absorbing = true; absorbT = cyc - 7.2; }
    }
    const facing = ex.facing != null ? +ex.facing : -0.3 + Math.sin(T * 0.5) * 0.45 + (walking ? Math.sin(T * 1.3) * 0.5 : 0);
    e.color = col; e.stage = st; e.race = race; e.cls = imperial ? 'pierfrancesco' : null; e.facing = facing;
    e.absorbing = absorbing; e.absorbT = absorbT;
    if (race === 'slime') {
      e.x = x; e.y = y; e.r = sz * 0.3;
      const s = stateFor(e);
      stepState(s, e, EMPTY, T);
      let pxs = 1;
      if (ctx.getTransform) { const m = ctx.getTransform(); pxs = Math.sqrt(m.a * m.a + m.b * m.b) || 1; }
      ctx.save();
      if (imperial) imperialLayer(ctx, { x, y: y + sz * 0.1 }, s, sz * (st >= 3 ? 0.22 : 0.25), T, false);
      if (SK.Slime && SK.Slime.renderPortrait) {
        SK.Slime.renderPortrait(ctx, x, y, sz, st, T, {
          color: imperial ? U.mix(col, GOLD, 0.12) : col, crown: imperial ? true : undefined,
          absorbing, absorbT, flash: ex.flash || 0, expression: ex.expression,
        });
      }
      updateParts(s, s.dt);
      renderParts(ctx, s, pxs);
      ctx.restore();
      return;
    }
    e.r = sz * PORTRAIT_R[race] * (1 - st * 0.03);
    e.x = x;
    e.y = y + sz * 0.04;
    const v = walking ? 170 : 0;
    e.vx = Math.cos(facing) * v;
    e.vy = Math.sin(facing) * v;
    const o = PORTRAIT_OPTS;
    o.t = T; o.stage = st; o.facing = facing; o.absorbing = absorbing; o.absorbT = absorbT;
    o.flash = ex.flash || 0; o.expression = ex.expression;
    renderPlayer(ctx, e, o);
  }

  /** Forget the animation state of an entity (e.g. on a new run). */
  function resetState(ent) { if (ent) STATES.delete(ent); }

  /* ============================================================== class icons */
  function drawClassIcon(ctx, x, y, size, clsId, t) {
    if (!ctx) return;
    const T = t != null && isFinite(t) ? +t : nowT();
    const r = size * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const disc = (c1, c2) => {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      C(ctx, 0, 0, r * 0.94);
      ctx.fillStyle = g;
      ctx.fill();
    };
    switch (clsId) {
      case 'predatore': {
        disc('#3a2366', '#0d0618');
        if (SK.Slime && SK.Slime.drawVortex) SK.Slime.drawVortex(ctx, 0, 0, r * 0.48, T);
        ctx.fillStyle = '#f4f0ff';
        for (let k = -1; k <= 1; k += 2) {
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * r * 0.22 - r * 0.09, k * r * 0.62);
            ctx.lineTo(i * r * 0.22, k * r * 0.36);
            ctx.lineTo(i * r * 0.22 + r * 0.09, k * r * 0.62);
            ctx.fill();
          }
        }
        break;
      }
      case 'guerriero': {
        disc('#4b5268', '#141824');
        C(ctx, 0, r * 0.08, r * 0.5);
        ctx.fillStyle = '#7a3036'; ctx.fill();
        ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = r * 0.09; ctx.stroke();
        ctx.rotate(-0.75);
        ctx.fillStyle = '#e8eef8';
        ctx.beginPath();
        ctx.moveTo(-r * 0.07, r * 0.35); ctx.lineTo(-r * 0.07, -r * 0.6); ctx.lineTo(0, -r * 0.78); ctx.lineTo(r * 0.07, -r * 0.6); ctx.lineTo(r * 0.07, r * 0.35);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(-r * 0.3, r * 0.3, r * 0.6, r * 0.1);
        ctx.fillRect(-r * 0.05, r * 0.38, r * 0.1, r * 0.3);
        break;
      }
      case 'arcimago': {
        disc('#283a8a', '#080c24');
        ctx.strokeStyle = 'rgba(130,200,255,0.6)';
        ctx.lineWidth = r * 0.05;
        E(ctx, 0, 0, r * 0.7, r * 0.28, T * 0.8);
        ctx.stroke();
        ctx.strokeStyle = '#a0784a';
        ctx.lineWidth = r * 0.11;
        ctx.beginPath(); ctx.moveTo(-r * 0.45, r * 0.6); ctx.lineTo(r * 0.18, -r * 0.2); ctx.stroke();
        if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, r * 0.24, -r * 0.3, r * 0.6, '#4fc3ff', 0.8);
        ctx.fillStyle = '#e6f7ff';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i * TAU) / 10 - HALF_PI + T;
          const rr = i & 1 ? r * 0.1 : r * 0.24;
          const px = r * 0.24 + Math.cos(a) * rr, py = -r * 0.3 + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'evocatore': {
        disc('#1f5a4a', '#06150f');
        ctx.strokeStyle = '#69f0ae';
        ctx.lineWidth = r * 0.06;
        C(ctx, 0, 0, r * 0.66); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = (i * TAU) / 3 - HALF_PI + T * 0.4;
          if (i === 0) ctx.moveTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
          else ctx.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
        }
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = (i * TAU) / 3 - HALF_PI + T * 0.4;
          const px = Math.cos(a) * r * 0.66, py = Math.sin(a) * r * 0.66;
          if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, px, py, r * 0.35, '#69f0ae', 0.8);
          C(ctx, px, py, r * 0.1); ctx.fillStyle = '#e8fff4'; ctx.fill();
        }
        break;
      }
      case 'pierfrancesco': {
        disc('#5a3a0a', '#140a1e');
        if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, 0, r * 0.15, r * 1.1, '#ffb300', 0.55 + 0.2 * Math.sin(T * 3));
        ctx.beginPath();
        const a = r * 0.72;
        for (let i = 0; i <= 48; i++) {
          const th = (i / 48) * TAU;
          const d = 1 + Math.sin(th) * Math.sin(th);
          const px = (a * Math.cos(th)) / d, py = r * 0.22 + (a * Math.sin(th) * Math.cos(th)) / d;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = r * 0.2; ctx.stroke();
        ctx.strokeStyle = GOLD; ctx.lineWidth = r * 0.12; ctx.stroke();
        ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = r * 0.04; ctx.stroke();
        if (SK.Slime && SK.Slime.drawCrown) SK.Slime.drawCrown(ctx, 0, -r * 0.4, r * 0.85, T);
        break;
      }
      default:
        disc('#333', '#111');
    }
    ctx.restore();
  }

  /* ================================================================ names */
  const SYL_A = ['Ri', 'Gu', 'Ze', 'Ra', 'Shi', 'Ma', 'Lo', 'Ve', 'Ka', 'Te', 'Na', 'Bel', 'Al', 'Fio', 'Dra', 'Ser', 'Lu', 'Vi', 'Ar', 'Gal', 'Cor', 'Mor', 'Eli', 'Tor'];
  const SYL_B = ['mu', 'ru', 'na', 'ra', 'o', 'el', 'an', 'io', 'ia', 'ste', 'gor', 'dor', 'ven', 'li', 'ri', 'za', 'mi', 'to', 'ce', 'lo'];
  const SYL_C = ['', '', 'ne', 'ro', 'to', 'la', 'ra', 'do', 'us', 'ar', 'iel', 'ion'];
  function localRandomName() {
    let n = U.choice(SYL_A) + U.choice(SYL_B) + U.choice(SYL_C);
    if (n.length < 4) n += U.choice(SYL_B);
    return n.slice(0, 14);
  }
  function randomName() {
    try {
      if (SK.Game && typeof SK.Game.randomName === 'function') {
        const n = SK.Game.randomName();
        if (n && typeof n === 'string') return n.slice(0, 16);
      }
    } catch (e) { /* fall back */ }
    return localRandomName();
  }

  /* ============================================================ color helpers */
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    const hx = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + hx(r) + hx(g) + hx(b);
  }
  function hexHue(hex) {
    const c = U.hexToRgb(hex);
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-6) return 0;
    let h;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    return Math.round(((h * 60) + 360) % 360);
  }

  /* ============================================================ creator screen */
  let CR = null;
  const EXTRA_SWATCHES = ['#ffd54f', '#b388ff', '#4fc3ff', '#ff4f6d', '#f4f1ea', '#1b1b2f'];
  const CREATOR_EXTRA = { cls: null, demo: true, key: 'creator', flash: 0 };
  const MINI_EXTRA = { cls: null, demo: false, key: 'mini', facing: -0.5 };

  function isOpen() { return !!CR; }

  function openCreator(onStart) {
    if (CR) closeCreator(false);
    if (typeof document === 'undefined') return;
    const host = document.getElementById('ui') || document.body;
    const saved = Object.assign({}, DEFAULT_CHAR, (SK.save && SK.save.data && SK.save.data.character) || {});
    const sel = {
      name: String(saved.name || DEFAULT_CHAR.name).slice(0, 16),
      race: races[saved.race] ? saved.race : DEFAULT_CHAR.race,
      cls: classes[saved.cls] ? saved.cls : DEFAULT_CHAR.cls,
      color: null,
    };
    sel.color = validHex(saved.color) || races[sel.race].colors[0];

    const root = document.createElement('div');
    root.className = 'chc-root';
    root.setAttribute('role', 'dialog');
    root.innerHTML = buildHtml();
    host.appendChild(root);

    const q = (s) => root.querySelector(s);
    const qa = (s) => Array.prototype.slice.call(root.querySelectorAll(s));
    const cr = (CR = {
      root, sel, onStart, raf: 0, stage: sel.cls === 'pierfrancesco' ? 1 : 0, evoT: 0, flashT: 0, startT: 0,
      t0: nowT(), frame: 0, prevInputEnabled: SK.input ? SK.input.enabled : true, closing: false,
      cv: q('.chc-prev'), ctx: null, cw: 1, ch: 1, dpr: 1, bgKey: '', bg: null,
      minis: qa('.chc-rmini'), icons: qa('.chc-cicon'), listeners: [],
    });
    cr.ctx = cr.cv.getContext('2d');
    if (SK.input) SK.input.enabled = false;

    const nameIn = q('.chc-input');
    nameIn.value = sel.name;

    const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); cr.listeners.push([el, ev, fn, opt]); };

    on(nameIn, 'input', () => { sel.name = nameIn.value.slice(0, 16); });
    on(nameIn, 'blur', () => { sel.name = nameIn.value.trim().slice(0, 16); nameIn.value = sel.name; });
    on(q('.chc-dice'), 'click', (e) => {
      const b = e.currentTarget;
      b.classList.remove('roll'); void b.offsetWidth; b.classList.add('roll');
      sel.name = randomName();
      nameIn.value = sel.name;
      nameIn.classList.remove('pop'); void nameIn.offsetWidth; nameIn.classList.add('pop');
      sfx('ui');
    });
    on(q('.chc-back'), 'click', () => back());
    on(q('.chc-start'), 'click', () => start());
    on(cr.cv, 'pointerdown', (e) => { e.preventDefault(); setStage((cr.stage + 1) % 4, true); });
    qa('.chc-stage').forEach((b) => on(b, 'click', () => setStage(+b.dataset.st, true)));
    qa('.chc-race').forEach((b) => on(b, 'click', () => setRace(b.dataset.race)));
    qa('.chc-class').forEach((b) => on(b, 'click', () => setClass(b.dataset.cls)));
    const hue = q('.chc-hue');
    on(hue, 'input', () => { setColor(hslHex(+hue.value, 78, 58), true); });
    on(q('.chc-swatches'), 'click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('.chc-sw') : null;
      if (b) { setColor(b.dataset.c, false); sfx('ui', { pitch: 1.2 }); }
    });
    on(document, 'keydown', (e) => {
      if (!CR || CR !== cr) return;
      if (e.key === 'Escape') { e.preventDefault(); back(); }
      else if (e.key === 'Enter' && !(e.target && e.target.classList && e.target.classList.contains('chc-dice'))) {
        e.preventDefault();
        if (e.target === nameIn) nameIn.blur();
        start();
      }
    });
    on(window, 'resize', () => fit());

    function fit() {
      const dpr = Math.min(window.devicePixelRatio || 1, SK.quality === 'low' ? 1 : SK.quality === 'medium' ? 1.5 : 2);
      cr.cw = Math.max(1, cr.cv.clientWidth || 1); cr.ch = Math.max(1, cr.cv.clientHeight || 1); cr.dpr = dpr;
      cr.cv.width = Math.max(1, Math.round(cr.cw * dpr));
      cr.cv.height = Math.max(1, Math.round(cr.ch * dpr));
      cr.bgKey = '';
      for (const m of cr.minis) {
        m.width = Math.max(1, Math.round((m.clientWidth || 46) * dpr));
        m.height = Math.max(1, Math.round((m.clientHeight || 46) * dpr));
      }
      for (const c of cr.icons) {
        c.width = Math.max(1, Math.round((c.clientWidth || 40) * dpr));
        c.height = Math.max(1, Math.round((c.clientHeight || 40) * dpr));
      }
    }

    function setStage(st, fx) {
      st = clamp(st | 0, 0, 3);
      if (st === cr.stage && !fx) return;
      cr.stage = st;
      if (fx) {
        cr.evoT = 1;
        sfx(st === 0 ? 'uiBack' : 'levelup', { vol: 0.5, pitch: 0.9 + st * 0.12 });
      }
      refreshStages();
    }
    function setRace(id) {
      if (!races[id] || id === sel.race) return;
      const prevColors = races[sel.race].colors;
      const wasDefault = prevColors.indexOf(sel.color) >= 0;
      sel.race = id;
      if (wasDefault) sel.color = races[id].colors[0];
      cr.evoT = 0.7;
      sfx('select');
      refreshAll();
      const btn = q('.chc-race[data-race="' + id + '"]');
      if (btn) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
    }
    function setClass(id) {
      if (!classes[id]) return;
      const changed = id !== sel.cls;
      sel.cls = id;
      if (id === 'pierfrancesco') {
        if (cr.stage === 0) cr.stage = 1;
        cr.flashT = 1;
        sfx('skillGet', { vol: 0.6 });
      } else if (changed) sfx('select');
      refreshAll();
      const card = q('.chc-class[data-cls="' + id + '"]');
      if (card) { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
    }
    function setColor(c, fromSlider) {
      const v = validHex(c);
      if (!v) return;
      sel.color = v;
      if (!fromSlider) hue.value = String(hexHue(v));
      refreshColor();
    }

    function refreshStages() {
      const r = races[sel.race];
      qa('.chc-stage').forEach((b) => {
        const st = +b.dataset.st;
        b.classList.toggle('on', st === cr.stage);
        b.querySelector('.chc-stn').textContent = r.stages[st];
      });
      q('.chc-stname').textContent = r.stages[cr.stage];
      q('.chc-stidx').textContent = 'Stadio ' + (cr.stage + 1) + '/4';
    }
    function refreshColor() {
      root.style.setProperty('--chc-col', sel.color);
      root.style.setProperty('--chc-col2', U.mix(sel.color, '#ffffff', 0.35));
      qa('.chc-sw').forEach((b) => b.classList.toggle('on', b.dataset.c === sel.color));
      cr.bgKey = '';
    }
    function refreshSwatches() {
      const list = races[sel.race].colors.concat(EXTRA_SWATCHES.filter((c) => races[sel.race].colors.indexOf(c) < 0));
      q('.chc-swatches').innerHTML = list.map((c) =>
        '<button type="button" class="chc-sw" data-c="' + c + '" style="--sw:' + c + '" aria-label="Colore ' + c + '"></button>').join('');
      hue.value = String(hexHue(sel.color));
    }
    function refreshSummary() {
      const r = races[sel.race], c = classes[sel.cls];
      const mythic = c.rarity === 'mitico';
      let html = '<div class="chc-sumcol"><div class="chc-sumh">' + escapeHtml(r.name) + '</div><ul>' +
        r.bonusList.map((b) => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul></div>' +
        '<div class="chc-sumcol' + (mythic ? ' mythic' : '') + '"><div class="chc-sumh">' + escapeHtml(c.name) +
        (c.title ? ' <em>' + escapeHtml(c.title) + '</em>' : '') + '</div><ul>' +
        c.perksDesc.map((b) => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul></div>';
      try {
        if (SK.Nation && typeof SK.Nation.runBonusesText === 'function') {
          const nb = SK.Nation.runBonusesText();
          if (nb && nb.length) {
            html += '<div class="chc-sumcol nation"><div class="chc-sumh">Bonus della Nazione</div><ul>' +
              nb.map((b) => '<li>' + escapeHtml(b) + '</li>').join('') + '</ul></div>';
          }
        }
      } catch (e) { /* nation optional */ }
      if (c.lore) html += '<p class="chc-lore">' + escapeHtml(c.lore) + '</p>';
      q('.chc-summary').innerHTML = html;
      q('.chc-racedesc').textContent = r.desc;
    }
    function refreshAll() {
      qa('.chc-race').forEach((b) => b.classList.toggle('on', b.dataset.race === sel.race));
      qa('.chc-class').forEach((b) => b.classList.toggle('on', b.dataset.cls === sel.cls));
      root.classList.toggle('imperial', sel.cls === 'pierfrancesco');
      const startBtn = q('.chc-start');
      startBtn.classList.toggle('gold', sel.cls === 'pierfrancesco');
      startBtn.classList.toggle('primary', sel.cls !== 'pierfrancesco');
      refreshSwatches();
      refreshColor();
      refreshStages();
      refreshSummary();
    }

    function save() {
      if (!SK.save || !SK.save.data) return;
      const name = (sel.name || '').trim() || (sel.cls === 'pierfrancesco' ? DEFAULT_CHAR.name : randomName());
      sel.name = name;
      SK.save.data.character = { name, race: sel.race, cls: sel.cls, color: sel.color };
      try { SK.save.write(); } catch (e) { /* storage unavailable */ }
    }
    function back() {
      if (cr.closing) return;
      save();
      sfx('uiBack');
      closeCreator(true);
      try { if (SK.UI && SK.UI.show) SK.UI.show('title'); } catch (e) { console.error(e); }
    }
    function start() {
      if (cr.closing) return;
      save();
      const cfg = { name: sel.name, race: sel.race, cls: sel.cls, color: sel.color };
      sfx(sel.cls === 'pierfrancesco' ? 'evolve' : 'select', { vol: 0.8 });
      cr.startT = 1;
      cr.closing = true;
      root.classList.add('launch');
      setTimeout(() => {
        closeCreator(true, true);
        if (SK.input) SK.input.enabled = true;
        if (typeof onStart === 'function') {
          try { onStart(cfg); } catch (e) { console.error(e); }
        } else if (SK.Game && typeof SK.Game.newRun === 'function') {
          try { SK.Game.newRun(cfg); } catch (e) { console.error(e); }
        }
      }, 240);
    }
    cr.back = back;
    cr.start = start;

    function drawBg(ctx, w, h, t) {
      const key = sel.color + w + 'x' + h;
      if (cr.bgKey !== key) {
        const g = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
        g.addColorStop(0, U.mix(sel.color, '#05060f', 0.62));
        g.addColorStop(0.45, U.mix(sel.color, '#05060f', 0.86));
        g.addColorStop(1, '#04050c');
        cr.bg = g;
        cr.bgKey = key;
      }
      ctx.fillStyle = cr.bg;
      ctx.fillRect(0, 0, w, h);
      const low = SK.quality === 'low';
      // god rays
      if (!low) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(w * 0.5, -h * 0.1);
        for (let i = 0; i < 5; i++) {
          const a = HALF_PI + Math.sin(t * 0.3 + i * 1.7) * 0.35 + (i - 2) * 0.16;
          ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.8 + i);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - 0.05) * h * 1.4, Math.sin(a - 0.05) * h * 1.4);
          ctx.lineTo(Math.cos(a + 0.05) * h * 1.4, Math.sin(a + 0.05) * h * 1.4);
          ctx.closePath();
          ctx.fillStyle = sel.cls === 'pierfrancesco' ? '#ffe9a8' : U.mix(sel.color, '#ffffff', 0.5);
          ctx.fill();
        }
        ctx.restore();
      }
      // pedestal
      const px = w * 0.5, py = h * 0.8, prx = Math.min(w * 0.36, h * 0.5);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 0.3);
      C(ctx, 0, 0, prx);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = sel.color;
      ctx.lineWidth = 2.5;
      C(ctx, 0, 0, prx); ctx.stroke();
      ctx.globalAlpha = 0.35;
      C(ctx, 0, 0, prx * 0.8); ctx.stroke();
      ctx.rotate(t * 0.35);
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i * TAU) / 24;
        ctx.moveTo(Math.cos(a) * prx * 0.82, Math.sin(a) * prx * 0.82);
        ctx.lineTo(Math.cos(a) * prx * (i & 1 ? 0.9 : 0.96), Math.sin(a) * prx * (i & 1 ? 0.9 : 0.96));
      }
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, px, py, prx * 0.9, sel.color, 0.35);
      // rising motes
      if (!low) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = sel.cls === 'pierfrancesco' ? GOLD : U.mix(sel.color, '#ffffff', 0.5);
        for (let i = 0; i < 18; i++) {
          const ph = (t * (0.08 + (i % 5) * 0.02) + i * 0.137) % 1;
          const mx = w * (0.08 + ((i * 0.618) % 1) * 0.84) + Math.sin(t + i) * 8;
          const my = h * (1 - ph);
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6;
          const s = 1 + (i % 3);
          ctx.fillRect(mx, my, s, s);
        }
        ctx.restore();
      }
    }

    function loop() {
      if (CR !== cr) return;
      cr.raf = requestAnimationFrame(loop);
      const t = nowT() - cr.t0;
      const dt = 1 / 60;
      cr.frame++;
      const ctx = cr.ctx;
      const w = cr.cw, h = cr.ch;
      if (!ctx || w < 2 || h < 2) { fit(); return; }
      ctx.setTransform(cr.dpr, 0, 0, cr.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      drawBg(ctx, w, h, t);
      if (cr.evoT > 0) cr.evoT = Math.max(0, cr.evoT - dt * 1.6);
      if (cr.flashT > 0) cr.flashT = Math.max(0, cr.flashT - dt * 1.2);
      const size = Math.min(w * 0.98, h * 0.95);
      const pop = cr.evoT > 0 ? 1 + U.ease.outElastic(1 - cr.evoT) * 0.04 - 0.04 * cr.evoT : 1;
      CREATOR_EXTRA.cls = sel.cls;
      CREATOR_EXTRA.flash = cr.evoT > 0.55 ? (cr.evoT - 0.55) * 2 : 0;
      ctx.save();
      ctx.translate(w * 0.5, h * 0.52);
      ctx.scale(pop, pop);
      renderPortrait(ctx, 0, 0, size, sel.race, cr.stage, sel.color, t, CREATOR_EXTRA);
      ctx.restore();
      // evolution burst
      if (cr.evoT > 0) {
        const f = 1 - cr.evoT;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = cr.evoT * 0.9;
        ctx.strokeStyle = U.mix(sel.color, '#ffffff', 0.5);
        ctx.lineWidth = 3 + 6 * cr.evoT;
        C(ctx, w * 0.5, h * 0.52, size * (0.1 + f * 0.6));
        ctx.stroke();
        if (SK.FX && SK.FX.drawGlow) SK.FX.drawGlow(ctx, w * 0.5, h * 0.52, size * 0.5, '#ffffff', cr.evoT * 0.6);
        ctx.restore();
      }
      if (cr.flashT > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = cr.flashT * cr.flashT * 0.55;
        ctx.fillStyle = '#ffcf5a';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      // race minis (staggered on weaker quality)
      const every = SK.quality === 'high' ? 1 : 2;
      if (cr.frame % every === 0) {
        for (const m of cr.minis) {
          const mc = m.getContext('2d');
          if (!mc) continue;
          const rid = m.dataset.race;
          const mw = m.width, mh = m.height;
          mc.setTransform(1, 0, 0, 1, 0, 0);
          mc.clearRect(0, 0, mw, mh);
          const scale = mw / 46;
          mc.setTransform(scale, 0, 0, scale, 0, 0);
          const isSel = rid === sel.race;
          MINI_EXTRA.cls = null;
          MINI_EXTRA.key = 'mini';
          renderPortrait(mc, 23, 23, 44, rid, isSel ? cr.stage : 0, isSel ? sel.color : races[rid].colors[0], isSel ? t : t * 0.35, MINI_EXTRA);
        }
      }
      // class icons
      for (const c of cr.icons) {
        const id = c.dataset.cls;
        if (cr.frame > 2 && id !== 'pierfrancesco' && id !== sel.cls && cr.frame % 6 !== 0) continue;
        const ic = c.getContext('2d');
        if (!ic) continue;
        ic.setTransform(1, 0, 0, 1, 0, 0);
        ic.clearRect(0, 0, c.width, c.height);
        const sc = c.width / 40;
        ic.setTransform(sc, 0, 0, sc, 0, 0);
        drawClassIcon(ic, 20, 20, 38, id, t);
      }
    }

    refreshAll();
    requestAnimationFrame(() => {
      if (CR !== cr) return;
      root.classList.add('on');
      fit();
      loop();
    });
    sfx('ui');
    return cr;
  }

  function buildHtml() {
    const raceBtns = raceOrder.map((id) =>
      '<button type="button" class="chc-race" data-race="' + id + '">' +
      '<canvas class="chc-rmini" data-race="' + id + '" width="46" height="46"></canvas>' +
      '<span>' + escapeHtml(races[id].name) + '</span></button>').join('');
    const classCards = classOrder.map((id) => {
      const c = classes[id];
      const mythic = c.rarity === 'mitico';
      return '<button type="button" class="chc-class r-' + c.rarity + (mythic ? ' mythic' : '') + '" data-cls="' + id + '">' +
        (mythic ? '<span class="chc-holo"></span>' : '') +
        '<canvas class="chc-cicon" data-cls="' + id + '" width="40" height="40"></canvas>' +
        '<span class="chc-cbody"><span class="chc-cname">' + escapeHtml(c.name) + '</span>' +
        (c.title ? '<span class="chc-ctitle">' + escapeHtml(c.title) + '</span>' : '') +
        '<span class="chc-cdesc">' + escapeHtml(c.desc) + '</span></span>' +
        '<span class="chc-badge">' + RARITY_LABEL[c.rarity] + '</span></button>';
    }).join('');
    const stages = [0, 1, 2, 3].map((i) =>
      '<button type="button" class="chc-stage" data-st="' + i + '"><i>' + (i + 1) + '</i><span class="chc-stn"></span></button>').join('');
    return '' +
      '<div class="chc-head">' +
      '<button type="button" class="sk-btn ghost small chc-back">&#8249; Indietro</button>' +
      '<div class="chc-title"><b>Forgia il tuo Destino</b><small>Chi rinascerà in questo mondo?</small></div>' +
      '<div class="chc-name"><input class="sk-input chc-input" type="text" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Nome dell\'eroe" placeholder="Nome">' +
      '<button type="button" class="sk-btn icon chc-dice" aria-label="Nome casuale">&#127922;</button></div>' +
      '</div>' +
      '<div class="chc-main">' +
      '<div class="chc-left">' +
      '<div class="chc-stagewrap"><canvas class="chc-prev"></canvas>' +
      '<div class="chc-stagelabel"><b class="chc-stname"></b><span class="chc-stidx"></span></div>' +
      '<div class="chc-taphint">Tocca per evolvere</div>' +
      '<div class="chc-ribbon">&#9733; Imperatore Infinito &#9733;</div></div>' +
      '<div class="chc-stages">' + stages + '</div>' +
      '<button type="button" class="sk-btn primary big shine chc-start">INIZIA L\'AVVENTURA</button>' +
      '</div>' +
      '<div class="chc-right sk-scroll">' +
      '<section class="chc-sec"><h3>Razza</h3><div class="chc-races">' + raceBtns + '</div><p class="chc-racedesc"></p></section>' +
      '<section class="chc-sec"><h3>Classe</h3><div class="chc-classes">' + classCards + '</div></section>' +
      '<section class="chc-sec"><h3>Colore</h3><div class="chc-swatches"></div>' +
      '<input class="chc-hue" type="range" min="0" max="359" step="1" aria-label="Tonalità"></section>' +
      '<section class="chc-sec"><h3>Riepilogo</h3><div class="chc-summary"></div></section>' +
      '</div></div>';
  }

  function closeCreator(animate, keepInput) {
    const cr = CR;
    if (!cr) return;
    CR = null;
    cancelAnimationFrame(cr.raf);
    for (const [el, ev, fn, opt] of cr.listeners) {
      try { el.removeEventListener(ev, fn, opt); } catch (e) { /* ignore */ }
    }
    cr.listeners.length = 0;
    const root = cr.root;
    if (!keepInput && SK.input) SK.input.enabled = cr.prevInputEnabled;
    if (animate && root) {
      root.classList.remove('on');
      root.classList.add('off');
      setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, 300);
    } else if (root && root.parentNode) root.parentNode.removeChild(root);
  }
  /** Android back / external close: behaves like "Indietro". Returns true if the creator was open. */
  function back() {
    if (!CR) return false;
    CR.back();
    return true;
  }

  SK.Character = {
    races,
    classes,
    raceOrder,
    classOrder,
    applyRace,
    applyClass,
    stageName,
    renderPlayer,
    renderPortrait,
    drawClassIcon,
    openCreator,
    closeCreator,
    isOpen,
    back,
    randomName,
    resetState,
    lore: PIER_LORE,
  };
})(window.SK);
