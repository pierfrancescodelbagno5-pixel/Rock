/* Slime Reborn — enemies.js
 * SK.Enemies (contract §5.5): monster type table, spawning, AI behaviours (chase, swoop,
 * ranged, charge, tank, swarm, blink), boss pattern scripts, ally / companion AI and fully
 * procedural animated rendering.
 *
 * Drawing convention: every type's draw(ctx, m, t) works in "unit space" — the renderer
 * translates to the monster, orients it (rotate for top-down creatures, horizontal flip for
 * humanoids) and scales the context by m.r, so 1 unit = m.r px and the creature faces +x.
 */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2, PI = Math.PI, HALF_PI = Math.PI / 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const sqrt = Math.sqrt, atan2 = Math.atan2, floor = Math.floor, hypot = Math.hypot, exp = Math.exp;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const EMPTY = Object.freeze({});
  const EMPTY_ARR = Object.freeze([]);
  const PARK = -1e6; // fainted allies are parked here so nothing can target them

  /* ================================================================ shared module state */
  let HQ = true;        // quality !== 'low'
  let DETAIL = true;    // per-monster detail flag (glows, small decorations)
  let CUR_PX = 20;      // pixel size of one draw unit for the monster being drawn (glow resolution)
  let ZOOM = 1;

  /* ---------------------------------------------------------------- colour tint (flash, frost, rage) */
  let TL = 0;           // tint level 0..8
  let TCOL = '#ffffff';
  let TMAP = null;
  const tintMaps = new Map();
  function setTint(color, amt) {
    const lv = color ? clamp(Math.round(amt * 8), 0, 8) : 0;
    TL = lv;
    if (!lv) return;
    TCOL = color;
    TMAP = tintMaps.get(color);
    if (!TMAP) { TMAP = new Map(); tintMaps.set(color, TMAP); }
  }
  /** Tinted colour (hex in → hex out). All monster palette colours go through this. */
  function tc(hex) {
    if (!TL) return hex;
    let arr = TMAP.get(hex);
    if (!arr) { arr = []; TMAP.set(hex, arr); }
    return arr[TL] || (arr[TL] = U.mix(hex, TCOL, TL / 8));
  }

  /* ---------------------------------------------------------------- unit-space drawing helpers */
  function circle(ctx, x, y, r, col) {
    ctx.fillStyle = tc(col);
    ctx.beginPath(); ctx.arc(x, y, r > 0 ? r : 0.001, 0, TAU); ctx.fill();
  }
  function oval(ctx, x, y, rx, ry, rot, col) {
    ctx.fillStyle = tc(col);
    ctx.beginPath(); ctx.ellipse(x, y, abs(rx) || 0.001, abs(ry) || 0.001, rot || 0, 0, TAU); ctx.fill();
  }
  function seg(ctx, x1, y1, x2, y2, w, col) {
    ctx.strokeStyle = tc(col); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function tri(ctx, x1, y1, x2, y2, x3, y3, col) {
    ctx.fillStyle = tc(col);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill();
  }
  /** Additive glow in unit space; sprite resolution follows the real pixel size. */
  function ug(ctx, x, y, ur, col, a) {
    if (!DETAIL || !(a > 0.01) || !(ur > 0)) return;
    const F = SK.FX;
    if (!F || !F.glowSprite) return;
    const spr = F.glowSprite(col, clamp(ur * CUR_PX, 4, 220));
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * (a > 1 ? 1 : a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(spr, x - ur, y - ur, ur * 2, ur * 2);
    ctx.globalAlpha = pa;
    ctx.globalCompositeOperation = pc;
  }
  /** World-space additive glow (screen-ish sizes). */
  function wglow(ctx, x, y, r, col, a) {
    const F = SK.FX;
    if (!HQ || !F || !F.drawGlow || !(a > 0.01)) return;
    F.drawGlow(ctx, x, y, r, col, a);
  }
  /** Two-tone crystal shard (diamond) from (x,y) pointing at angle ang. */
  function shard(ctx, x, y, len, wid, ang, cA, cB) {
    const c = cos(ang), s = sin(ang);
    const tx = x + c * len, ty = y + s * len;
    const mx = x + c * len * 0.3, my = y + s * len * 0.3;
    ctx.fillStyle = tc(cA);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(mx - s * wid, my + c * wid); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc(cB);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(mx + s * wid, my - c * wid); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
  }
  /** Flame tongue: tip at top. */
  function flame(ctx, x, y, w, h, tipX, tipY, col) {
    ctx.fillStyle = tc(col);
    ctx.beginPath();
    ctx.moveTo(x + tipX, y - h + tipY);
    ctx.bezierCurveTo(x + w * 0.9, y - h * 0.45, x + w * 1.05, y + w * 0.4, x, y + w * 0.75);
    ctx.bezierCurveTo(x - w * 1.05, y + w * 0.4, x - w * 0.9, y - h * 0.45, x + tipX, y - h + tipY);
    ctx.fill();
  }
  function starPath(ctx, x, y, R, r, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * PI) / n;
      const rr = i & 1 ? r : R;
      if (i === 0) ctx.moveTo(x + cos(a) * rr, y + sin(a) * rr);
      else ctx.lineTo(x + cos(a) * rr, y + sin(a) * rr);
    }
    ctx.closePath();
  }
  /** Glowing eye: glow + iris + glint. */
  function eye(ctx, x, y, r, col, glowA) {
    ug(ctx, x, y, r * 4, col, glowA);
    circle(ctx, x, y, r, col);
    circle(ctx, x + r * 0.3, y - r * 0.3, r * 0.35, '#ffffff');
  }

  /* ================================================================ other-module wrappers */
  function fxBurst(x, y, o) { const F = SK.FX; if (F && F.burst) F.burst(x, y, o); }
  function fxRing(x, y, o) { const F = SK.FX; if (F && F.ring) F.ring(x, y, o); }
  function fxCall(name, a, b, c, d, e) {
    const F = SK.FX;
    if (F && typeof F[name] === 'function') return F[name](a, b, c, d, e);
    return undefined;
  }
  function sfx(name, o) { const A = SK.Audio; if (A && A.sfx) A.sfx(name, o); }
  function shake(i, d) { if (SK.cam && SK.cam.shake) SK.cam.shake(i, d); }
  function banner(t, s, o) { const UI = SK.UI; if (UI && typeof UI.banner === 'function') UI.banner(t, s, o); }
  function worldClamp(m) { const W = SK.World; if (W && typeof W.clamp === 'function') W.clamp(m); }
  function onScreen(x, y, mg) { return !SK.cam || !SK.cam.inView || SK.cam.inView(x, y, mg); }

  function hurtPlayer(amount, src) {
    const C = SK.combat;
    if (C && C.damagePlayer && amount > 0) return C.damagePlayer(amount, src);
    return 0;
  }
  function hurtMon(target, amount, src, knock, kx, ky, extra) {
    const C = SK.combat;
    if (!C || !C.damage || !target || target.dead || !(amount > 0)) return 0;
    const l = hypot(kx, ky) || 1;
    return C.damage(target, amount, {
      source: src, knock: knock || 0, kx: kx / l, ky: ky / l,
      element: (extra && extra.element) || 'physical', status: extra && extra.status,
    });
  }
  function applyStatus(target, type, dur, power) {
    const C = SK.combat;
    if (C && C.applyStatus && target && !target.dead) C.applyStatus(target, type, dur, power);
  }
  function queryEnemies(G, x, y, r, fn) {
    const C = SK.combat;
    if (C && C.query) { C.query(x, y, r, fn, 'enemy'); return; }
    const E = G.enemies || EMPTY_ARR;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e || e.dead || e.passive) continue;
      const rr = r + e.r;
      if ((e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) < rr * rr) fn(e);
    }
  }

  /* ---------------------------------------------------------------- projectiles & telegraphs */
  function shootAt(x, y, a, S, team, dmg) {
    const SKL = SK.Skills;
    if (!SKL || !SKL.spawnProjectile) return null;
    const sp = S.speed || 200;
    return SKL.spawnProjectile({
      x, y, vx: cos(a) * sp, vy: sin(a) * sp, r: S.r || 8, dmg,
      team: team || 'enemy', element: S.element || 'physical', life: S.life || 3,
      pierce: S.pierce || 0, homing: S.homing || 0, kind: S.kind || 'orb', color: S.color,
      knock: S.knock != null ? S.knock : 90,
      status: S.status ? { type: S.status.type, dur: S.status.dur, power: S.status.power } : undefined,
    });
  }
  function shoot(m, a, S, team, dmg) {
    const off = m.r * 0.85;
    return shootAt(m.x + cos(a) * off, m.y + sin(a) * off, a, S, team,
      dmg != null ? dmg : m.dmg * (S.dmgMul || 0.7));
  }
  function fireShot(m, tg, S, team, dmg) {
    const a0 = atan2(tg.y - m.y, tg.x - m.x);
    const n = S.count || 1;
    for (let i = 0; i < n; i++) {
      const a = a0 + (n > 1 ? (i / (n - 1) - 0.5) * 2 * (S.spread || 0) : 0);
      shoot(m, a, S, team, dmg);
    }
    if (HQ) {
      fxBurst(m.x + cos(a0) * m.r, m.y + sin(a0) * m.r, {
        count: 5, color: S.color, speed: [40, 150], life: [0.15, 0.35], size: [1.5, 3],
        spread: 1.2, angle: a0, glow: true,
      });
    }
    if (S.sfx) sfx(S.sfx, { vol: team === 'enemy' ? 0.26 : 0.2 });
  }

  const pending = [];   // timed callbacks (boss attack resolution) in game time
  const falls = [];     // falling meteor visuals
  const fbWarns = [];   // fallback telegraph circles when SK.Skills is missing
  function later(delay, fn, owner) { pending.push({ t: delay, fn, owner: owner || null }); }
  function updatePending(dt) {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        pending[i] = pending[pending.length - 1];
        pending.pop();
        if (!p.owner || !p.owner.dead) p.fn();
      }
    }
  }
  /** Telegraph circle (SK.Skills warning zone) + optional resolution callback after `life`. */
  function warn(m, x, y, r, life, fn, color) {
    const S = SK.Skills;
    if (S && S.spawnZone) S.spawnZone({ x, y, r, life, team: 'enemy', kind: 'warning', color: color || '#ff1744', dps: 0 });
    else fbWarns.push({ x, y, r, life, t: 0, color: color || '#ff1744' });
    if (fn) later(life, fn, m);
  }
  function zone(o) { const S = SK.Skills; if (S && S.spawnZone) return S.spawnZone(o); return null; }

  /** Area damage to the player and allies (enemy-side attacks). */
  function areaHit(G, src, x, y, r, dmg, knock) {
    const p = G.player;
    if (p && !p.dead) {
      const rr = r + (p.r || 20) * 0.5, dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < rr * rr) hurtPlayer(dmg, src);
    }
    const A = G.allies || EMPTY_ARR;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!a || a.dead || (a.ai && a.ai.fainted)) continue;
      const rr = r + (a.r || 16) * 0.5, dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy < rr * rr) hurtMon(a, dmg, src, knock || 150, dx || 1, dy);
    }
  }

  /* ================================================================ shot presets */
  const SHOT = {
    web: { kind: 'web', color: '#d9fbff', speed: 230, r: 9, dmgMul: 0.6, element: 'web', life: 2.2, status: { type: 'slow', dur: 1.8, power: 0.45 }, count: 1, cd: 4.6, tele: 0.35, range: 290, min: 90, sfx: 'web' },
    spore: { kind: 'orb', color: '#b2ff59', speed: 165, r: 11, dmgMul: 0.8, element: 'poison', life: 3, status: { type: 'poison', dur: 3, power: 4 }, count: 1, cd: 3.2, tele: 0.55, range: 380, pref: 210, sfx: 'poison' },
    fire: { kind: 'fire', color: '#ff7a1a', speed: 255, r: 9, dmgMul: 0.75, element: 'fire', life: 2.4, status: { type: 'burn', dur: 2.4, power: 5 }, count: 3, spread: 0.24, cd: 2.9, tele: 0.45, range: 340, pref: 190, sfx: 'fire' },
    imp: { kind: 'fire', color: '#ffab40', speed: 240, r: 7, dmgMul: 0.6, element: 'fire', life: 2.2, status: { type: 'burn', dur: 1.5, power: 4 }, count: 1, cd: 3.8, tele: 0.35, range: 300, min: 60, sfx: 'fire' },
    dark: { kind: 'dark', color: '#b388ff', speed: 210, r: 11, dmgMul: 0.8, element: 'shadow', life: 3.2, homing: 0.6, count: 3, spread: 0.3, cd: 2.7, tele: 0.6, range: 430, pref: 250, sfx: 'spirit' },
    spirit: { kind: 'spirit', color: '#80deea', speed: 190, r: 9, dmgMul: 0.7, element: 'spirit', life: 3, homing: 0.5, count: 3, spread: 0.45, cd: 4, tele: 0.35, range: 400, sfx: 'spirit' },
    water: { kind: 'water', color: '#4fc3ff', speed: 330, r: 9, dmgMul: 1, element: 'water', life: 1.6, count: 1, cd: 1.8, tele: 0, range: 330, sfx: 'water' },
    thorn: { kind: 'needle', color: '#9ccc65', speed: 260, r: 6, dmgMul: 0.55, element: 'nature', life: 1.6 },
    rock: { kind: 'rock', color: '#a1887f', speed: 240, r: 11, dmgMul: 0.7, element: 'earth', life: 2.6 },
    voidRock: { kind: 'rock', color: '#7c4dff', speed: 230, r: 12, dmgMul: 0.75, element: 'earth', life: 2.6 },
    spit: { kind: 'dark', color: '#e040fb', speed: 270, r: 12, dmgMul: 0.75, element: 'shadow', life: 2.6 },
    moon: { kind: 'shadow', color: '#ff1744', speed: 300, r: 15, dmgMul: 0.85, element: 'beast', life: 2.4, pierce: 2 },
    orb: { kind: 'dark', color: '#b388ff', speed: 165, r: 9, dmgMul: 0.55, element: 'void', life: 4.2 },
    ring: { kind: 'orb', color: '#ea80fc', speed: 150, r: 10, dmgMul: 0.6, element: 'void', life: 5 },
  };

  /* ================================================================ type table */
  const types = {};
  function defType(id, o) {
    const d = Object.assign({
      id, name: id, desc: '', biome: 'cave', hp: 20, speed: 80, dmg: 8, r: 16, mass: 1, xp: 1,
      essence: null, color: '#ffffff', behavior: 'chase', nameable: false, allyName: null, boss: false,
      souls: 0, orient: 'flip', fly: false, shot: null, pscale: 0.3, shadowW: 1, draw: null,
    }, o);
    d.id = id;
    types[id] = d;
    return d;
  }

  /* --- Caverna Sigillata --- */
  defType('bat', {
    name: 'Pipistrello delle Caverne', biome: 'cave', behavior: 'swarm', essence: 'sonic_wave',
    desc: 'Sciami stridenti che sfrecciano nel buio. Le loro grida diventano onde soniche.',
    hp: 10, speed: 128, dmg: 6, r: 13, mass: 0.6, xp: 1, color: '#7e57c2', fly: true, pscale: 0.25,
    draw: drawBat,
  });
  defType('cave_spider', {
    name: 'Ragno di Cristallo', biome: 'cave', behavior: 'chase', essence: 'sticky_web',
    desc: 'Il suo addome di cristallo pulsa di luce. Tesse ragnatele che rallentano le prede.',
    hp: 18, speed: 96, dmg: 8, r: 15, mass: 0.9, xp: 2, color: '#40e0ff', orient: 'rotate', shot: SHOT.web,
    draw: drawSpider,
  });
  defType('wild_slime', {
    name: 'Slime Selvatico', biome: 'cave', behavior: 'chase', essence: 'regen', hop: true,
    nameable: true, allyName: 'Slime Custode', allyStyle: 'ranged', allyShot: SHOT.water,
    desc: 'Un lontano cugino gelatinoso. Rimbalza, si rigenera e non porta rancore... quasi mai.',
    hp: 26, speed: 72, dmg: 8, r: 17, mass: 1.2, xp: 2, color: '#66d17a', orient: 'none',
    draw: drawWildSlime,
  });
  defType('rock_crab', {
    name: 'Granchio di Roccia', biome: 'cave', behavior: 'tank', essence: 'body_armor',
    desc: 'Corazza di pietra viva. Lento e testardo, ma le sue chele spezzano la roccia.',
    hp: 62, speed: 50, dmg: 12, r: 22, mass: 3, xp: 4, color: '#9c8fb0', orient: 'rotate', shadowW: 1.15,
    slamFwd: true, slamR: 46, windT: 0.5, souls: 0, draw: drawCrab,
  });
  defType('abyss_serpent', {
    name: 'Serpe Nera degli Abissi', biome: 'cave', behavior: 'boss', boss: true, essence: 'black_lightning',
    desc: 'Antico guardiano sigillato nelle profondità. Comanda il fulmine nero e nuota nella roccia.',
    hp: 2400, speed: 125, dmg: 22, r: 64, mass: 30, xp: 120, souls: 25, color: '#7c4dff', orient: 'rotate',
    pscale: 0.17, draw: drawSerpentHead,
  });

  /* --- Foresta di Smeraldo --- */
  defType('dire_wolf', {
    name: 'Lupo Famelico', biome: 'forest', behavior: 'charge', essence: 'shadow_step',
    nameable: true, allyName: 'Lupo Tempesta',
    desc: 'Caccia in branco. Si acquatta, poi carica con la velocità di un\'ombra.',
    hp: 48, speed: 122, dmg: 14, r: 19, mass: 1.6, xp: 4, color: '#8fa3c7', shadowW: 1.25, pscale: 0.27,
    windT: 0.6, draw: drawDireWolf,
  });
  defType('goblin', {
    name: 'Goblin', biome: 'forest', behavior: 'chase', essence: null, nameable: true, allyName: 'Hobgoblin',
    desc: 'Piccolo, rumoroso e armato di clava. Con un nome potrebbe diventare qualcosa di più.',
    hp: 42, speed: 86, dmg: 12, r: 17, mass: 1.3, xp: 3, color: '#7cc94e', draw: drawGoblin,
  });
  defType('killer_hornet', {
    name: 'Calabrone Assassino', biome: 'forest', behavior: 'swoop', essence: 'needle_storm',
    desc: 'Ronza in cerchio, poi si lancia in picchiata col pungiglione avvelenato.',
    hp: 28, speed: 150, dmg: 12, r: 13, mass: 0.6, xp: 3, color: '#ffc107', orient: 'rotate', fly: true,
    draw: drawHornet,
  });
  defType('treant', {
    name: 'Treant Antico', biome: 'forest', behavior: 'tank', essence: 'thorn_ring',
    desc: 'Uno spirito della foresta risvegliato dall\'ira. Le sue radici stritolano gli intrusi.',
    hp: 180, speed: 42, dmg: 20, r: 30, mass: 5, xp: 9, souls: 1, color: '#66bb6a', pscale: 0.25,
    slamR: 80, windT: 0.85, onSlam: treantSlam, draw: drawTreant,
  });
  defType('toxic_shroom', {
    name: 'Fungo Tossico', biome: 'forest', behavior: 'ranged', essence: 'poison_mist',
    desc: 'Sbuffa nuvole di spore velenose. Meglio non respirargli vicino.',
    hp: 54, speed: 42, dmg: 10, r: 18, mass: 1.5, xp: 4, color: '#b2ff59', shot: SHOT.spore, draw: drawShroom,
  });
  defType('alpha_wolf', {
    name: 'Lupo Alfa della Luna Cremisi', biome: 'forest', behavior: 'boss', boss: true, essence: 'wolf_howl',
    desc: 'Re del branco sotto la luna cremisi. Il suo ululato richiama la caccia.',
    hp: 5200, speed: 160, dmg: 30, r: 66, mass: 40, xp: 250, souls: 25, color: '#ff1744', shadowW: 1.25,
    pscale: 0.25, draw: drawAlphaWolf,
  });

  /* --- Vulcano Cremisi --- */
  defType('salamander', {
    name: 'Salamandra', biome: 'volcano', behavior: 'ranged', essence: 'fire_breath',
    desc: 'Lucertola di fiamma: sputa raffiche di fuoco incandescente.',
    hp: 90, speed: 82, dmg: 18, r: 19, mass: 1.6, xp: 6, color: '#ff6d00', orient: 'rotate', shot: SHOT.fire,
    draw: drawSalamander,
  });
  defType('magma_golem', {
    name: 'Golem di Magma', biome: 'volcano', behavior: 'tank', essence: 'magma_orb',
    desc: 'Roccia fusa animata da un cuore di magma. Lento, ma ogni pugno è un\'eruzione.',
    hp: 380, speed: 42, dmg: 30, r: 32, mass: 6, xp: 14, souls: 1, color: '#ff9100', pscale: 0.26,
    slamR: 88, windT: 0.9, onSlam: golemSlam, draw: drawGolem,
  });
  defType('orc_warrior', {
    name: 'Guerriero Orco', biome: 'volcano', behavior: 'charge', essence: 'cleave',
    nameable: true, allyName: 'Orco Supremo',
    desc: 'Guerriero brutale con un\'ascia enorme. Rispetta soltanto la forza.',
    hp: 170, speed: 88, dmg: 26, r: 22, mass: 2.6, xp: 9, color: '#8bc34a', windT: 0.7, pscale: 0.27,
    draw: drawOrcWarrior,
  });
  defType('fire_imp', {
    name: 'Folletto di Fuoco', biome: 'volcano', behavior: 'swarm', essence: 'meteor',
    desc: 'Diavoletto dispettoso fatto di fiamma viva. Lancia scintille e ride sguaiato.',
    hp: 70, speed: 135, dmg: 16, r: 14, mass: 0.8, xp: 6, color: '#ff9100', fly: true, shot: SHOT.imp,
    draw: drawImp,
  });
  defType('orc_tyrant', {
    name: 'Tiranno degli Orchi', biome: 'volcano', behavior: 'boss', boss: true, essence: 'gluttony',
    desc: 'Signore della guerra degli orchi. La sua fame è leggendaria quanto la sua ascia.',
    hp: 11000, speed: 105, dmg: 42, r: 78, mass: 60, xp: 450, souls: 25, color: '#ff5722', pscale: 0.22,
    draw: drawOrcTyrant,
  });

  /* --- Cittadella dei Demoni --- */
  defType('specter', {
    name: 'Spettro', biome: 'demon', behavior: 'blink', essence: 'spirit_orbs',
    desc: 'Anima inquieta della cittadella. Svanisce e riappare alle spalle dei vivi.',
    hp: 150, speed: 100, dmg: 24, r: 18, mass: 1, xp: 10, color: '#80deea', fly: true, shot: SHOT.spirit,
    draw: drawSpecter,
  });
  defType('demon_knight', {
    name: 'Cavaliere Demoniaco', biome: 'demon', behavior: 'charge', essence: null,
    desc: 'Cavaliere in armatura maledetta. Dietro la visiera brucia un unico occhio rosso.',
    hp: 480, speed: 92, dmg: 38, r: 24, mass: 4, xp: 18, souls: 1, color: '#ff1744', windT: 0.65, pscale: 0.27,
    draw: drawKnight,
  });
  defType('gargoyle', {
    name: 'Gargoyle', biome: 'demon', behavior: 'swoop', essence: null,
    desc: 'Statua di pietra che prende vita. Piomba dall\'alto sulle prede distratte.',
    hp: 300, speed: 135, dmg: 30, r: 22, mass: 3, xp: 14, souls: 1, color: '#a19eae', fly: true, pscale: 0.24,
    draw: drawGargoyle,
  });
  defType('dark_mage', {
    name: 'Mago Oscuro', biome: 'demon', behavior: 'ranged', essence: null, blinkAway: true,
    desc: 'Stregone al servizio del Re Demone. Scaglia sfere d\'ombra e svanisce se lo avvicini.',
    hp: 230, speed: 80, dmg: 30, r: 19, mass: 1.5, xp: 15, souls: 1, color: '#b388ff', shot: SHOT.dark,
    draw: drawMage,
  });
  defType('demon_lord', {
    name: 'Re Demone Caduto', biome: 'demon', behavior: 'boss', boss: true, essence: null,
    desc: 'Il sovrano caduto della Cittadella. Il potere dell\'abisso risponde solo a lui.',
    hp: 26000, speed: 112, dmg: 55, r: 88, mass: 80, xp: 1000, souls: 60, color: '#b388ff', fly: true,
    pscale: 0.17, draw: drawDemonLord,
  });

  const bossIds = ['abyss_serpent', 'alpha_wolf', 'orc_tyrant', 'demon_lord'];

  /* ================================================================ AI state helpers */
  function initAI(m) {
    const ai = m.ai || (m.ai = {});
    if (ai._ok) return ai;
    ai._ok = true;
    if (!m.status) m.status = { slow: 0, slowAmt: 0, burn: 0, burnDps: 0, poison: 0, poisonDps: 0, stun: 0 };
    if (!(m.t >= 0)) m.t = 0;
    if (!(m.r > 0)) m.r = 18;
    if (!(m.mass > 0)) m.mass = 1;
    if (!(m.speed > 0)) m.speed = 140;
    if (!isFinite(m.vx)) m.vx = 0;
    if (!isFinite(m.vy)) m.vy = 0;
    if (!isFinite(m.knockX)) m.knockX = 0;
    if (!isFinite(m.knockY)) m.knockY = 0;
    if (!isFinite(m.facing)) m.facing = 0;
    if (!(m.hitFlash >= 0)) m.hitFlash = 0;
    if (ai.st == null) ai.st = 'move';
    ai.stT = 0;
    if (ai.cd == null) ai.cd = rand(0.8, 2.5);
    ai.scd = rand(1, 3.5);
    ai.tgt = null; ai.retgt = 0;
    ai.ph = Math.random() * 10; ai.wob = Math.random() * TAU;
    ai.flip = 1; ai.mv = 0; ai.gait = Math.random() * TAU; ai.atk = 0; ai.wind = 0;
    ai.tele = 0; ai.teleT = 0; ai.flash = 0; ai.hf = m.hitFlash; ai.lastHp = m.hp; ai.hurtT = 0;
    if (ai.spawnT == null) ai.spawnT = 1;
    ai.alpha = 1; ai.ccd = 0.3; ai.cmul = 1; ai.lockT = 0;
    ai.dir = 0; ai.len = 0; ai.lnT = 0; ai.lnOn = false;
    ai.homeX = m.x; ai.homeY = m.y; ai.wx = m.x; ai.wy = m.y; ai.wT = 0; ai.idle = false;
    ai.side = Math.random() < 0.5 ? -1 : 1;
    ai.h = 0; ai.cast = 0; ai.bk = 0; ai.bt = 0; ai.bcd = 0; ai.hop = Math.random();
    ai.mode = 'follow'; ai.acd = rand(0.2, 0.8); ai.fainted = false; ai.faintT = 0; ai.healT = 3;
    ai.emberT = 0; ai.spin = false; ai.under = 0; ai.emerge = 1; ai.portal = 0; ai.dizzy = 0;
    ai.enter = 0; ai.enterT = 0; ai.pat = null; ai.at = 0; ai.step = 0; ai.n = 0; ai.pp = 0; ai.pt = 0; ai.pw = 0;
    ai.tick = 0; ai.last = null; ai.force = null; ai.ccdA = 0;
    return ai;
  }

  function face(m, a) {
    m.facing = a;
    m.ai.flip = cos(a) < 0 ? -1 : 1;
    m.ai.lockT = 0.15;
  }
  function steer(m, dx, dy, spd, accel, dt) {
    const k = 1 - exp(-accel * dt);
    m.vx += (dx * spd - m.vx) * k;
    m.vy += (dy * spd - m.vy) * k;
  }
  function slowMul(m) {
    const s = m.status;
    if (!s || !(s.slow > 0)) return 1;
    return 1 - clamp(s.slowAmt || 0.3, 0, 0.85) * (m.boss ? 0.45 : 1);
  }

  /** Status timers: delegate to SK.combat.tickStatus (dot damage); decrement timers it left untouched. */
  function tickStatus(m, dt) {
    const s = m.status;
    if (!s) return;
    const b0 = s.burn, p0 = s.poison, l0 = s.slow, t0 = s.stun;
    const C = SK.combat;
    if (C && C.tickStatus) C.tickStatus(m, dt);
    if (s.burn > 0 && s.burn === b0) s.burn = max(0, s.burn - dt);
    if (s.poison > 0 && s.poison === p0) s.poison = max(0, s.poison - dt);
    if (s.slow > 0 && s.slow === l0) s.slow = max(0, s.slow - dt);
    if (s.stun > 0 && s.stun === t0) s.stun = max(0, s.stun - dt);
    if (m.boss) s.stun = 0;
  }

  function provoke(G, m) {
    const ai = m.ai;
    m.passive = false;
    ai.st = 'move'; ai.cd = rand(0.4, 1); ai.retgt = 0;
    fxCall('text', m.x, m.y - m.r - 8, '!', { color: '#ff5252', size: 20, life: 0.7, rise: 26 });
  }

  function preUpdate(G, m, dt) {
    const ai = m.ai;
    m.t += dt;
    if (ai.spawnT < 1) ai.spawnT = min(1, ai.spawnT + dt * 2.8);
    const hf = +m.hitFlash || 0;
    if (hf > ai.hf + 1e-4) ai.flash = 1;
    if (hf > 0) m.hitFlash = max(0, hf - dt * 4);
    ai.hf = m.hitFlash;
    if (ai.flash > 0) ai.flash = max(0, ai.flash - dt * 7);
    if (m.hp < ai.lastHp - 1e-6) {
      ai.hurtT = 0.22;
      if (m.passive && m.team === 'enemy') provoke(G, m);
    }
    ai.lastHp = m.hp;
    if (ai.hurtT > 0) ai.hurtT -= dt;
    if (ai.atk > 0) ai.atk = max(0, ai.atk - dt * 3);
    if (ai.ccd > 0) ai.ccd -= dt;
    if (ai.ccdA > 0) ai.ccdA -= dt;
    tickStatus(m, dt);
    const s = m.status;
    if (HQ && s && s.burn > 0) {
      ai.emberT -= dt;
      if (ai.emberT <= 0 && onScreen(m.x, m.y, 20)) {
        ai.emberT = 0.18;
        fxBurst(m.x + rand(-0.4, 0.4) * m.r, m.y - m.r * 0.3, {
          count: 1, colors: ['#ffab40', '#ffd54f'], speed: [10, 40], gravity: -90, life: [0.4, 0.7], size: [1.5, 2.6], glow: true,
        });
      }
    }
  }

  function integrate(G, m, dt, px, py) {
    const ai = m.ai;
    const kMul = m.boss ? 0.15 : m.def && m.def.behavior === 'tank' ? 0.5 : 1;
    const relax = min(1, dt * 12);
    m.x += (m.vx + m.knockX * kMul) * dt + px * relax;
    m.y += (m.vy + m.knockY * kMul) * dt + py * relax;
    const kd = exp(-7 * dt);
    m.knockX *= kd; m.knockY *= kd;
    if (abs(m.knockX) < 0.5) m.knockX = 0;
    if (abs(m.knockY) < 0.5) m.knockY = 0;
    const sp = hypot(m.vx, m.vy);
    ai.mv = clamp(sp / max(30, m.speed || 60), 0, 1.6);
    ai.gait += dt * (1.2 + (sp / max(6, m.r)) * 1.25);
    if (ai.gait > 1e4) ai.gait -= 1e4;
    if (ai.lockT > 0) ai.lockT -= dt;
    else if (sp > 8) {
      let f = U.lerpAngle(m.facing || 0, atan2(m.vy, m.vx), min(1, dt * 10));
      if (f > PI) f -= TAU; else if (f < -PI) f += TAU;
      m.facing = f;
      if (abs(m.vx) > 10) ai.flip = m.vx < 0 ? -1 : 1;
    }
    if (!isFinite(m.x) || !isFinite(m.y)) {
      m.x = isFinite(ai.homeX) ? ai.homeX : 0; m.y = isFinite(ai.homeY) ? ai.homeY : 0;
      m.vx = m.vy = m.knockX = m.knockY = 0;
    }
  }

  /* ================================================================ spatial grid (separation) */
  const CELL = 64, GMASK = 4095;
  const gHead = new Int32Array(GMASK + 1);
  let gNext = new Int32Array(1024);
  const gList = [];
  let gCount = 0;
  function ghash(cx, cy) { return (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & GMASK; }
  function gridAdd(m) {
    if (gCount >= gNext.length) { const nn = new Int32Array(gNext.length * 2); nn.set(gNext); gNext = nn; }
    const h = ghash(floor(m.x / CELL), floor(m.y / CELL));
    gList[gCount] = m; gNext[gCount] = gHead[h]; gHead[h] = gCount; gCount++;
  }
  function gridBuild(G) {
    gHead.fill(-1);
    gCount = 0;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (m && !m.dead && !m.boss && m.ai && !m.ai.grab) gridAdd(m);
    }
    const A = G.allies;
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (!m || m.dead) continue;
      initAI(m);
      if (!m.ai.fainted) gridAdd(m);
    }
    gList.length = gCount;
  }
  let NX = 0, NY = 0, SCX = 0, SCY = 0, SAX = 0, SAY = 0, SN = 0;
  function neighbors(G, m, swarm) {
    NX = NY = SCX = SCY = SAX = SAY = 0; SN = 0;
    const cx = floor(m.x / CELL), cy = floor(m.y / CELL);
    const mr = m.r, mm = m.mass || 1;
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let j = gHead[ghash(gx, gy)]; j !== -1; j = gNext[j]) {
          const o = gList[j];
          if (o === m) continue;
          const dx = m.x - o.x, dy = m.y - o.y;
          const d2 = dx * dx + dy * dy;
          const rr = mr + o.r;
          if (d2 < rr * rr) {
            const om = o.mass || 1;
            const w = om / (om + mm);
            if (d2 < 1e-4) { NX += (Math.random() - 0.5) * 4; NY += (Math.random() - 0.5) * 4; }
            else { const d = sqrt(d2); const push = (rr - d) * w; NX += (dx / d) * push; NY += (dy / d) * push; }
            if (m.team === 'enemy' && o.team !== 'enemy') contactAlly(G, m, o, -dx, -dy);
          }
          if (swarm && o.type === m.type && d2 < 10000) { SCX += o.x; SCY += o.y; SAX += o.vx; SAY += o.vy; SN++; }
        }
      }
    }
  }
  function contactAlly(G, m, a, dx, dy) {
    const ai = m.ai;
    if (m.passive || ai.ccd > 0 || ai.spawnT < 0.6 || ai.alpha < 0.5 || (a.ai && a.ai.fainted)) return;
    hurtMon(a, m.dmg * (ai.cmul || 1), m, 110, dx || 1, dy);
    ai.ccd = 0.7; ai.atk = 1;
  }
  function contactPlayer(G, m) {
    const p = G.player, ai = m.ai;
    if (!p || p.dead || m.passive || ai.ccd > 0 || ai.spawnT < 0.6 || ai.alpha < 0.5) return;
    const pr = (p.r || 22) * 0.8 + m.r * (m.boss ? 0.78 : 0.9);
    const dx = p.x - m.x, dy = p.y - m.y;
    if (dx * dx + dy * dy < pr * pr) {
      hurtPlayer(m.dmg * (ai.cmul || 1), m);
      ai.ccd = m.boss ? 0.8 : 0.55;
      ai.atk = 1;
      if (!m.boss) {
        const d = sqrt(dx * dx + dy * dy) || 1;
        const k = 130 / max(0.5, m.mass || 1);
        m.knockX -= (dx / d) * k; m.knockY -= (dy / d) * k;
      }
    }
  }

  /* ================================================================ spawning */
  const seenTypes = new Set();
  function markSeen(id) {
    if (seenTypes.has(id)) return;
    const sv = SK.save && SK.save.data;
    if (!sv) return;
    seenTypes.add(id);
    const b = sv.bestiary || (sv.bestiary = {});
    const e = b[id] || (b[id] = { seen: false, kills: 0, absorbed: 0 });
    if (!e.seen) e.seen = true;
  }

  function spawn(G, typeId, x, y, opts) {
    const def = types[typeId];
    if (!def || !G) return null;
    const o = opts || EMPTY;
    const elite = !!o.elite && !def.boss;
    const passive = !!o.passive && !def.boss;
    const scale = elite ? 1.35 : 1;
    const hpMul = (o.hpMul > 0 ? o.hpMul : 1) * (elite ? 4 : 1);
    const dmgMul = (o.dmgMul > 0 ? o.dmgMul : 1) * (elite ? 1.4 : 1);
    const hp = Math.max(1, Math.round(def.hp * hpMul));
    const m = {
      id: U.uid(), type: typeId, def, team: 'enemy',
      x: +x || 0, y: +y || 0, vx: 0, vy: 0, r: def.r * scale, hp, maxHp: hp, dmg: def.dmg * dmgMul,
      speed: def.speed * (elite ? 1.06 : 1) * (def.boss ? 1 : rand(0.92, 1.08)),
      mass: def.mass * (elite ? 2.2 : 1),
      elite, boss: !!def.boss, passive,
      nameable: o.nameable != null ? !!o.nameable : passive && !!def.nameable,
      name: null, evolved: false,
      status: { slow: 0, slowAmt: 0, burn: 0, burnDps: 0, poison: 0, poisonDps: 0, stun: 0 },
      hitFlash: 0, knockX: 0, knockY: 0, t: 0, ai: {}, dead: false,
      xp: def.xp * (elite ? 5 : 1), essence: def.essence || null, scale, facing: 0,
      souls: def.souls || 0, phase: def.boss ? 1 : 0, enraged: false,
    };
    initAI(m);
    m.ai.spawnT = 0;
    const p = G.player;
    if (p) { m.facing = atan2(p.y - m.y, p.x - m.x); m.ai.flip = cos(m.facing) < 0 ? -1 : 1; }
    if (!G.enemies) G.enemies = [];
    G.enemies.push(m);
    markSeen(typeId);
    if (HQ && !def.boss && onScreen(m.x, m.y, 30)) {
      fxBurst(m.x, m.y, { count: 6, color: def.color, speed: [30, 100], life: [0.25, 0.5], size: [2, 4], glow: true });
    }
    return m;
  }

  function summon(G, type, x, y) {
    const s = spawn(G, type, x, y, { hpMul: G.nightmare ? 1.6 : 1, dmgMul: G.nightmare ? 1.25 : 1 });
    if (!s) return null;
    worldClamp(s);
    s.summoned = true;
    s.xp = max(1, floor(s.xp * 0.5));
    fxRing(s.x, s.y, { radius: 48, color: s.def.color, life: 0.4, width: 4 });
    fxBurst(s.x, s.y, { count: 10, color: s.def.color, speed: [40, 170], life: [0.3, 0.6], size: [2, 4], glow: true });
    return s;
  }
  function countType(G, type) {
    let n = 0;
    const E = G.enemies || EMPTY_ARR;
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (e && !e.dead && e.type === type) n++; }
    return n;
  }

  /* ================================================================ allies */
  function makeAlly(G, m, name) {
    if (!G || !m) return null;
    if (!G.allies) G.allies = [];
    const i = G.enemies ? G.enemies.indexOf(m) : -1;
    if (i >= 0) G.enemies.splice(i, 1);
    if (G.allies.indexOf(m) < 0) G.allies.push(m);
    initAI(m);
    const def = m.def || EMPTY;
    m.team = 'ally';
    m.passive = false;
    m.nameable = false;
    m.name = name || m.name || def.allyName || 'Alleato';
    if (!m.evolved) {
      m.evolved = true;
      m.scale = (m.scale || 1) * 1.3;
      m.r *= 1.3;
      m.maxHp = Math.round(m.maxHp * 3);
      m.dmg *= 1.8;
      m.speed = max(m.speed * 1.15, 120);
      m.mass *= 1.5;
    }
    m.hp = m.maxHp;
    m.dead = false;
    const s = m.status;
    s.slow = s.burn = s.poison = s.stun = 0;
    m.knockX = m.knockY = 0;
    const ai = m.ai;
    ai.st = 'move'; ai.mode = 'follow'; ai.tgt = null; ai.fainted = false; ai.lnOn = false; ai.tele = 0;
    ai.wind = 0; ai.alpha = 1; ai.bk = 0; ai.cmul = 1; ai.lastHp = m.hp; ai.acd = 0.5;
    const col = '#69f0ae';
    fxCall('beam', m.x, m.y, { color: col, width: m.r * 3, height: 340, life: 1.1 });
    fxCall('lightRays', m.x, m.y, { color: '#b9f6ca', life: 1.1, radius: 150, follow: m, count: 8 });
    fxRing(m.x, m.y, { radius: m.r * 4, color: col, life: 0.6, width: 6 });
    fxBurst(m.x, m.y, { count: 22, colors: [col, '#ffffff', '#ffd54f'], speed: [60, 260], life: [0.4, 0.9], size: [2, 4], shape: 'star', glow: true });
    sfx('name');
    return m;
  }

  function faint(G, m) {
    const ai = m.ai || initAI(m);
    if (ai.fainted) return;
    ai.fainted = true; ai.faintT = 20; ai.fx = m.x; ai.fy = m.y;
    if (isFinite(m.x) && m.x > PARK / 2) {
      fxCall('death', m.x, m.y, (m.def && m.def.color) || '#69f0ae', m.r);
      fxCall('text', m.x, m.y - m.r, (m.name || 'Alleato') + ' è a terra!', { color: '#ffcdd2', size: 13, life: 1.4, rise: 30 });
    }
    sfx('hurt', { vol: 0.4, pitch: 0.8 });
    m.hp = 0; m.dead = false;
    m.vx = m.vy = m.knockX = m.knockY = 0;
    const s = m.status;
    if (s) s.slow = s.burn = s.poison = s.stun = 0;
    m.x = PARK; m.y = PARK;
    ai.tgt = null; ai.lnOn = false; ai.tele = 0; ai.wind = 0; ai.st = 'move';
  }
  function revive(G, m) {
    const p = G.player, ai = m.ai;
    const a = Math.random() * TAU;
    m.x = p.x + cos(a) * (46 + m.r); m.y = p.y + sin(a) * (46 + m.r);
    worldClamp(m);
    m.hp = m.maxHp; m.dead = false;
    ai.fainted = false; ai.faintT = 0; ai.spawnT = 0; ai.lastHp = m.hp; ai.mode = 'follow'; ai.alpha = 1;
    fxCall('heal', m.x, m.y);
    fxRing(m.x, m.y, { radius: 70, color: '#69f0ae', life: 0.5, width: 4 });
    fxCall('beam', m.x, m.y, { color: '#b9f6ca', width: m.r * 2.4, height: 260, life: 0.8 });
    fxCall('text', m.x, m.y - m.r - 10, (m.name || 'Alleato') + ' torna in campo!', { color: '#b9f6ca', size: 13, life: 1.3 });
    sfx('heal', { vol: 0.6 });
  }

  function findAllyTarget(G, m) {
    let best = null;
    const C = SK.combat;
    if (C && C.nearest) best = C.nearest(m.x, m.y, 260, 'enemy');
    else {
      let bd = 260 * 260;
      const E = G.enemies || EMPTY_ARR;
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (!e || e.dead || e.passive || e.boss) continue;
        const d = (e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    const b = G.boss;
    if (!best && b && !b.dead && b.team === 'enemy' && (!b.ai || (b.ai.enter <= 0 && b.ai.alpha > 0.4))) {
      if (hypot(b.x - m.x, b.y - m.y) < 260 + b.r) best = b;
    }
    if (best && (best.passive || best.dead)) best = null;
    return best;
  }

  function allyEngage(G, m, tg, dt, spd) {
    const ai = m.ai, def = m.def || EMPTY, p = G.player;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const mul = (p && p.stats && p.stats.allyDmg) || 1;
    if (typeof def.attack === 'function') {
      const want = (def.range || 120) + (tg.r || 16);
      if (d > want) steer(m, ux, uy, spd, 6, dt);
      else if (d < want * 0.45) steer(m, -ux, -uy, spd * 0.6, 4, dt);
      else steer(m, -uy * ai.side, ux * ai.side, spd * 0.35, 3, dt);
      try { def.attack(G, m, tg, dt); } catch (e) {
        if (!ai.errLogged) { ai.errLogged = true; console.error('[ally attack]', e); }
      }
      return;
    }
    ai.acd -= dt;
    const style = def.allyStyle || (def.shot ? 'ranged' : 'melee');
    if (style === 'ranged') {
      const S = def.allyShot || def.shot;
      const pref = 170;
      let mx = -uy * 0.6 * ai.side, my = ux * 0.6 * ai.side;
      if (d > pref + 30) { mx += ux; my += uy; } else if (d < pref - 50) { mx -= ux; my -= uy; }
      const l = hypot(mx, my) || 1;
      steer(m, mx / l, my / l, spd, 5, dt);
      if (ai.acd <= 0 && d < 360) {
        face(m, atan2(dy, dx));
        fireShot(m, tg, S, 'player', m.dmg * mul * (S.dmgMul || 1) * 1.1);
        ai.acd = max(0.55, (S.cd || 2) * 0.45);
        ai.atk = 1;
      }
      return;
    }
    const reach = m.r + (tg.r || 16) + 8;
    if (d > reach - 4) steer(m, ux, uy, spd * 1.15, 7, dt);
    else steer(m, 0, 0, 0, 8, dt);
    if (d < reach && ai.acd <= 0) {
      ai.acd = def.allyCd || 0.75;
      ai.atk = 1;
      face(m, atan2(dy, dx));
      const dmg = m.dmg * mul;
      if (typeof def.allyHit === 'function') def.allyHit(G, m, tg, dmg, ux, uy);
      else {
        hurtMon(tg, dmg, m, 150, ux, uy);
        fxCall('hit', tg.x - ux * tg.r * 0.6, tg.y - uy * tg.r * 0.6, def.color || '#ffffff', atan2(uy, ux));
      }
      m.vx += ux * 140; m.vy += uy * 140;
    }
  }

  /* type-specific evolved ally strikes */
  types.goblin.allyHit = function (G, m, tg, dmg, ux, uy) {
    hurtMon(tg, dmg * 1.1, m, 190, ux, uy);
    if (!tg.boss) applyStatus(tg, 'stun', 0.45, 1);
    fxRing(tg.x, tg.y, { radius: tg.r * 1.8, color: '#d7ccc8', life: 0.25, width: 4 });
    fxCall('hit', tg.x, tg.y, '#ffcc80', atan2(uy, ux));
    sfx('hit', { vol: 0.35, pitch: 0.8 });
  };
  types.orc_warrior.allyHit = function (G, m, tg, dmg, ux, uy) {
    const cx = m.x + ux * m.r * 1.1, cy = m.y + uy * m.r * 1.1;
    queryEnemies(G, cx, cy, 78, (e) => { if (!e.passive) hurtMon(e, dmg, m, 220, e.x - m.x, e.y - m.y); });
    fxCall('slash', cx, cy, atan2(uy, ux), { radius: 78, arc: 2.4, color: '#ffd54f', width: 13, life: 0.22 });
    sfx('slash', { vol: 0.4 });
  };
  types.dire_wolf.allyHit = function (G, m, tg, dmg, ux, uy) {
    hurtMon(tg, dmg, m, 160, ux, uy, { element: 'storm' });
    fxCall('hit', tg.x, tg.y, '#40c4ff', atan2(uy, ux));
    let chained = 0;
    queryEnemies(G, tg.x, tg.y, 170, (e) => {
      if (chained >= 2 || e === tg || e.passive || e.dead) return;
      chained++;
      fxCall('lightning', tg.x, tg.y, e.x, e.y, { color: '#80d8ff', width: 2.5, life: 0.22, branches: 1 });
      hurtMon(e, dmg * 0.6, m, 60, e.x - tg.x, e.y - tg.y, { element: 'storm' });
    });
    if (chained) sfx('thunder', { vol: 0.22, pitch: 1.4 });
  };

  function allyPassive(G, m, dt) {
    const ai = m.ai, p = G.player;
    if (m.type === 'wild_slime' && m.evolved && p && !p.dead && p.maxHp > 0) {
      ai.healT -= dt;
      if (ai.healT <= 0) {
        ai.healT = 4;
        if (p.hp < p.maxHp && hypot(p.x - m.x, p.y - m.y) < 220) {
          const amt = max(1, p.maxHp * 0.03);
          const C = SK.combat;
          if (C && C.heal) C.heal(p, amt); else p.hp = min(p.maxHp, p.hp + amt);
          fxCall('heal', p.x, p.y, '#69f0ae');
          fxCall('lightning', m.x, m.y, p.x, p.y, { color: '#69f0ae', width: 2, life: 0.18, branches: 0 });
        }
      }
    }
  }

  function updateAlly(G, m, dt, idx, count) {
    const ai = m.ai && m.ai._ok ? m.ai : initAI(m);
    const p = G.player;
    if (ai.fainted) {
      ai.faintT -= dt;
      m.dead = false; m.hp = 0; m.x = PARK; m.y = PARK; m.vx = m.vy = 0;
      if (ai.faintT <= 0 && p && !p.dead) revive(G, m);
      return;
    }
    if (m.dead || !(m.hp > 0)) { faint(G, m); return; }
    preUpdate(G, m, dt);
    if (m.dead || !(m.hp > 0)) { faint(G, m); return; }
    neighbors(G, m, false);
    const pushX = NX, pushY = NY;
    if (!p || p.dead) { steer(m, 0, 0, 0, 4, dt); integrate(G, m, dt, pushX, pushY); return; }
    const spd = (m.speed || 140) * slowMul(m);
    const dP = hypot(p.x - m.x, p.y - m.y);
    if (dP > 900) {
      const a = Math.random() * TAU;
      m.x = p.x + cos(a) * 80; m.y = p.y + sin(a) * 80; m.vx = m.vy = 0;
      worldClamp(m);
      fxBurst(m.x, m.y, { count: 10, color: '#69f0ae', speed: [40, 140], life: [0.3, 0.6], size: [2, 4], glow: true });
      ai.mode = 'follow';
    }
    if (ai.mode === 'return') { if (dP < 170) ai.mode = 'follow'; }
    else if (dP > 440) { ai.mode = 'return'; ai.tgt = null; }
    if (m.status && m.status.stun > 0) { steer(m, 0, 0, 0, 8, dt); integrate(G, m, dt, pushX, pushY); return; }
    ai.retgt -= dt;
    let tg = ai.tgt;
    if (tg && (tg.dead || !(tg.hp > 0) || tg.passive || tg.team !== 'enemy' || (tg.ai && tg.ai.alpha < 0.3))) tg = ai.tgt = null;
    if (ai.mode !== 'return' && (ai.retgt <= 0 || !tg)) {
      ai.retgt = rand(0.25, 0.4);
      tg = ai.tgt = findAllyTarget(G, m);
    }
    if (ai.mode === 'return') tg = null;
    if (tg) allyEngage(G, m, tg, dt, spd);
    else {
      const n = max(1, count);
      const ang = (idx / n) * TAU + (G.t || 0) * 0.12 + HALF_PI;
      const rad = 62 + m.r + (idx % 2) * 28;
      const sx = p.x + cos(ang) * rad - (p.vx || 0) * 0.12, sy = p.y + sin(ang) * rad - (p.vy || 0) * 0.12;
      const dx = sx - m.x, dy = sy - m.y, d = hypot(dx, dy);
      const k = ai.mode === 'return' ? 1.6 : clamp(d / 90, 0, 1.25);
      if (d > 6) steer(m, dx / d, dy / d, spd * k, 5, dt);
      else steer(m, 0, 0, 0, 5, dt);
    }
    allyPassive(G, m, dt);
    integrate(G, m, dt, pushX, pushY);
  }

  /* ================================================================ enemy behaviours */
  function pickTarget(G, m, dt) {
    const ai = m.ai, p = G.player;
    ai.retgt -= dt;
    let t = ai.tgt;
    if (t && (t.dead || (t.ai && t.ai.fainted) || (t !== p && t.team !== 'ally'))) t = ai.tgt = null;
    if (t === p && p.dead) t = ai.tgt = null;
    if (ai.retgt <= 0 || !t) {
      ai.retgt = rand(0.35, 0.7);
      let best = p && !p.dead ? p : null;
      let bd = best ? (best.x - m.x) * (best.x - m.x) + (best.y - m.y) * (best.y - m.y) : 1e12;
      const A = G.allies || EMPTY_ARR;
      for (let i = 0; i < A.length; i++) {
        const a = A[i];
        if (!a || a.dead || (a.ai && a.ai.fainted)) continue;
        const d = (a.x - m.x) * (a.x - m.x) + (a.y - m.y) * (a.y - m.y);
        if (d < 90000 && d < bd * 0.6) { best = a; bd = d; }
      }
      ai.tgt = best;
    }
    return ai.tgt;
  }

  function shotLogic(G, m, dt, tg, d, S) {
    const ai = m.ai;
    if (ai.tele > 0) {
      ai.teleT += dt;
      ai.tele = min(1, ai.teleT / max(0.05, S.tele));
      face(m, atan2(tg.y - m.y, tg.x - m.x));
      if (ai.teleT >= S.tele) {
        fireShot(m, tg, S, 'enemy', m.dmg * (S.dmgMul || 0.7));
        ai.tele = 0; ai.scd = S.cd * rand(0.8, 1.25); ai.atk = 1;
      }
      return true;
    }
    ai.scd -= dt;
    if (ai.scd <= 0 && d < S.range && d > (S.min || 0) && onScreen(m.x, m.y, 30)) { ai.tele = 0.001; ai.teleT = 0; }
    return ai.tele > 0;
  }

  function bIdle(G, m, dt) {
    const ai = m.ai;
    steer(m, 0, 0, 0, 3, dt);
    ai.wind = 0; ai.lnOn = false; ai.tele = 0; ai.cmul = 1;
    if (ai.bk) { ai.bk = 0; ai.alpha = 1; }
  }

  function bPassive(G, m, dt) {
    const ai = m.ai, p = G.player;
    ai.wT -= dt;
    if (ai.wT <= 0) {
      ai.wT = rand(1.6, 3.8);
      const a = Math.random() * TAU, rr = rand(20, 140);
      ai.wx = ai.homeX + cos(a) * rr; ai.wy = ai.homeY + sin(a) * rr;
      ai.idle = Math.random() < 0.3;
    }
    if (p && !p.dead) {
      const dx = p.x - m.x, dy = p.y - m.y;
      if (dx * dx + dy * dy < 170 * 170) { face(m, atan2(dy, dx)); steer(m, 0, 0, 0, 4, dt); return; }
    }
    const dx = ai.wx - m.x, dy = ai.wy - m.y, d = hypot(dx, dy);
    if (ai.idle || d < 10) steer(m, 0, 0, 0, 3, dt);
    else steer(m, dx / d, dy / d, m.speed * 0.32, 3, dt);
  }

  function bChase(G, m, dt, tg) {
    const ai = m.ai, def = m.def || EMPTY;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    let spd = m.speed * slowMul(m);
    let accel = 6;
    if (def.shot && shotLogic(G, m, dt, tg, d, def.shot)) { steer(m, 0, 0, 0, 8, dt); return; }
    if (def.hop) {
      ai.hop += dt * 1.8;
      const ph = ai.hop % 1;
      if (ph < 0.48) { spd *= 2.0 * sin((ph / 0.48) * PI) + 0.15; accel = 14; }
      else { spd *= 0.04; accel = 10; }
    }
    const w = sin(m.t * 2.3 + ai.wob) * 0.4 * min(1, d / 120);
    const mx = ux - uy * w, my = uy + ux * w;
    const l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, spd, accel, dt);
  }

  function bRanged(G, m, dt, tg) {
    const ai = m.ai, def = m.def, S = def.shot;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (ai.bk > 0) { blinkStep(G, m, dt, tg, true); return; }
    ai.bcd -= dt;
    if (def.blinkAway && d < 120 && ai.bcd <= 0 && ai.tele <= 0) { ai.bk = 1; ai.bt = 0; ai.bcd = 4.5; return; }
    const busy = shotLogic(G, m, dt, tg, d, S);
    const pref = S.pref || 220;
    let mx = 0, my = 0;
    if (d > pref + 40) { mx = ux; my = uy; } else if (d < pref - 50) { mx = -ux; my = -uy; }
    mx += -uy * 0.7 * ai.side; my += ux * 0.7 * ai.side;
    if (Math.random() < dt * 0.3) ai.side = -ai.side;
    const l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, m.speed * slowMul(m) * (busy ? 0.12 : 1), 5, dt);
  }

  function blinkStep(G, m, dt, tg, away) {
    const ai = m.ai;
    ai.bt += dt;
    steer(m, 0, 0, 0, 10, dt);
    if (ai.bk === 1) {
      ai.alpha = max(0, 1 - ai.bt / 0.3);
      if (ai.bt >= 0.3) {
        fxBurst(m.x, m.y, { count: 12, color: m.def.color, speed: [40, 160], life: [0.3, 0.6], size: [2, 4], glow: true });
        const a = away ? atan2(m.y - tg.y, m.x - tg.x) + rand(-0.9, 0.9) : Math.random() * TAU;
        const dd = away ? rand(220, 280) : rand(95, 150);
        m.x = tg.x + cos(a) * dd; m.y = tg.y + sin(a) * dd;
        worldClamp(m);
        m.vx = m.vy = m.knockX = m.knockY = 0;
        ai.bk = 2; ai.bt = 0;
        sfx('portal', { vol: 0.22, pitch: 1.6 });
        fxCall('converge', m.x, m.y, { radius: 60, count: 8, color: m.def.color, life: 0.3 });
      }
    } else {
      ai.alpha = min(1, ai.bt / 0.28);
      if (ai.bt >= 0.28) { ai.bk = 0; ai.alpha = 1; return true; }
    }
    return false;
  }

  function bBlink(G, m, dt, tg) {
    const ai = m.ai, S = m.def.shot;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (ai.bk > 0) {
      if (blinkStep(G, m, dt, tg, false) && S) { ai.tele = 0.001; ai.teleT = 0; }
      return;
    }
    if (S && ai.tele > 0) { shotLogic(G, m, dt, tg, d, S); steer(m, 0, 0, 0, 8, dt); return; }
    ai.cd -= dt;
    const w = sin(m.t * 1.7 + ai.wob) * 0.8;
    const mx = ux - uy * w, my = uy + ux * w, l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, m.speed * slowMul(m) * 0.75, 3, dt);
    if (ai.cd <= 0 && d < 520 && d > 70) { ai.bk = 1; ai.bt = 0; ai.cd = rand(3.4, 5); }
  }

  function bCharge(G, m, dt, tg) {
    const ai = m.ai, def = m.def;
    ai.stT += dt;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const sm = slowMul(m);
    switch (ai.st) {
      case 'wind': {
        const T = def.windT || 0.6;
        ai.wind = min(1, ai.stT / T);
        if (ai.stT < T * 0.6) ai.dir = U.lerpAngle(ai.dir, atan2(dy, dx), min(1, dt * 6));
        face(m, ai.dir);
        steer(m, 0, 0, 0, 10, dt);
        ai.lnT = ai.wind;
        if (ai.stT >= T) {
          ai.st = 'act'; ai.stT = 0; ai.lnOn = false; ai.wind = 0; ai.cmul = 1.35;
          sfx('dash', { vol: 0.3, pitch: 0.9 });
          if (HQ) fxBurst(m.x, m.y + m.r * 0.5, { count: 6, color: '#8d8173', speed: [30, 110], life: [0.3, 0.6], size: [2, 4], angle: ai.dir + PI, spread: 1.4 });
        }
        break;
      }
      case 'act': {
        const sp = m.speed * 4.2 * sm;
        m.vx = cos(ai.dir) * sp; m.vy = sin(ai.dir) * sp;
        face(m, ai.dir);
        if (HQ && Math.random() < dt * 22) fxCall('trail', m, def.color, m.r * 0.9);
        if (ai.stT >= min(0.6, ai.len / max(1, sp))) { ai.st = 'rec'; ai.stT = 0; ai.cmul = 1; }
        break;
      }
      case 'rec':
        steer(m, 0, 0, 0, 5, dt);
        if (ai.stT > 0.5) { ai.st = 'move'; ai.stT = 0; ai.cd = rand(2.6, 4.2); }
        break;
      default: {
        ai.cd -= dt;
        const w = sin(m.t * 1.9 + ai.wob) * 0.3;
        const mx = ux - uy * w, my = uy + ux * w, l = hypot(mx, my) || 1;
        steer(m, mx / l, my / l, m.speed * sm, 5, dt);
        if (ai.cd <= 0 && d < 300 && d > m.r + 40 && onScreen(m.x, m.y, 0)) {
          ai.st = 'wind'; ai.stT = 0; ai.dir = atan2(dy, dx); ai.lnOn = true; ai.lnT = 0;
          ai.len = min(380, d + 120);
        }
      }
    }
  }

  function bSwoop(G, m, dt, tg) {
    const ai = m.ai;
    ai.stT += dt;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const sm = slowMul(m);
    switch (ai.st) {
      case 'wind': {
        const T = 0.4;
        ai.wind = min(1, ai.stT / T);
        ai.dir = U.lerpAngle(ai.dir, atan2(dy, dx), min(1, dt * 8));
        face(m, ai.dir);
        steer(m, -ux, -uy, m.speed * 0.45 * sm, 6, dt);
        ai.lnT = ai.wind;
        if (ai.stT >= T) {
          ai.st = 'act'; ai.stT = 0; ai.wind = 0; ai.lnOn = false; ai.cmul = 1.3;
          ai.len = d + 110;
          sfx('dash', { vol: 0.22, pitch: 1.4 });
        }
        break;
      }
      case 'act': {
        const sp = m.speed * 3.1 * sm;
        m.vx = cos(ai.dir) * sp; m.vy = sin(ai.dir) * sp;
        face(m, ai.dir);
        if (HQ && Math.random() < dt * 20) fxCall('trail', m, m.def.color, m.r * 0.8);
        if (ai.stT >= min(0.6, ai.len / max(1, sp))) { ai.st = 'rec'; ai.stT = 0; ai.cmul = 1; }
        break;
      }
      case 'rec':
        steer(m, 0, 0, 0, 3, dt);
        if (ai.stT >= 0.45) { ai.st = 'move'; ai.stT = 0; ai.cd = rand(1.8, 3.2); }
        break;
      default: {
        ai.cd -= dt;
        const w = sin(m.t * 3.2 + ai.wob) * 1.0;
        const mx = ux - uy * w, my = uy + ux * w, l = hypot(mx, my) || 1;
        steer(m, mx / l, my / l, m.speed * sm, 4, dt);
        if (ai.cd <= 0 && d < 240 && d > 60 && onScreen(m.x, m.y, 0)) {
          ai.st = 'wind'; ai.stT = 0; ai.dir = atan2(dy, dx); ai.lnOn = true; ai.lnT = 0; ai.len = d + 110;
        }
      }
    }
  }

  function bSwarm(G, m, dt, tg) {
    const ai = m.ai, def = m.def;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (def.shot && shotLogic(G, m, dt, tg, d, def.shot)) { steer(m, 0, 0, 0, 4, dt); return; }
    ai.cd -= dt;
    const sm = slowMul(m);
    if (ai.st === 'act') {
      ai.stT += dt;
      steer(m, cos(ai.dir), sin(ai.dir), m.speed * 2.1 * sm, 9, dt);
      if (ai.stT > 0.38) { ai.st = 'move'; ai.stT = 0; ai.cd = rand(1.6, 3.2); }
      return;
    }
    let mx = ux, my = uy;
    if (SN > 0) {
      const cx = SCX / SN - m.x, cy = SCY / SN - m.y, cl = hypot(cx, cy) || 1;
      mx += (cx / cl) * 0.35; my += (cy / cl) * 0.35;
      const sp = max(1, m.speed);
      mx += (SAX / SN / sp) * 0.4; my += (SAY / SN / sp) * 0.4;
    }
    const fl = sin(m.t * 5.5 + ai.wob) * 0.6;
    mx += -uy * fl; my += ux * fl;
    const l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, m.speed * sm, 5, dt);
    if (ai.cd <= 0 && d < 170 && d > 40) { ai.st = 'act'; ai.stT = 0; ai.dir = atan2(dy, dx); }
  }

  function slamGeom(m) {
    const def = m.def;
    if (def.slamFwd) {
      return { x: m.x + cos(m.ai.dir) * m.r * 1.1, y: m.y + sin(m.ai.dir) * m.r * 1.1, r: def.slamR || 46 };
    }
    return { x: m.x, y: m.y, r: m.r + (def.slamR || 70) };
  }
  function bTank(G, m, dt, tg) {
    const ai = m.ai, def = m.def;
    ai.stT += dt;
    const dx = tg.x - m.x, dy = tg.y - m.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const T = def.windT || 0.8;
    switch (ai.st) {
      case 'wind':
        ai.wind = min(1, ai.stT / T);
        steer(m, 0, 0, 0, 8, dt);
        face(m, ai.dir);
        if (ai.stT >= T) { tankSlam(G, m); ai.st = 'rec'; ai.stT = 0; ai.wind = 0; ai.atk = 1; }
        break;
      case 'rec':
        steer(m, 0, 0, 0, 5, dt);
        if (ai.stT >= 0.65) { ai.st = 'move'; ai.stT = 0; ai.cd = rand(2.4, 3.8); }
        break;
      default: {
        ai.cd -= dt;
        const w = sin(m.t * 1.3 + ai.wob) * 0.2;
        const mx = ux - uy * w, my = uy + ux * w, l = hypot(mx, my) || 1;
        steer(m, mx / l, my / l, m.speed * slowMul(m), 2.5, dt);
        const reach = (def.slamFwd ? m.r * 1.1 + (def.slamR || 46) : m.r + (def.slamR || 70)) + (tg.r || 16) * 0.5;
        if (ai.cd <= 0 && d < reach) {
          ai.st = 'wind'; ai.stT = 0; ai.dir = atan2(dy, dx);
          const g = slamGeom(m);
          warn(m, g.x, g.y, g.r, T, null, def.color);
        }
      }
    }
  }
  function tankSlam(G, m) {
    const def = m.def;
    const g = slamGeom(m);
    areaHit(G, m, g.x, g.y, g.r, m.dmg * 1.3, 260);
    fxRing(g.x, g.y, { radius: g.r, color: def.color, life: 0.35, width: 6 });
    fxBurst(g.x, g.y, {
      count: 12, colors: [def.color, '#d7ccc8'], speed: [60, 220], life: [0.3, 0.6], size: [2, 4],
      shape: 'square', gravity: 300, drag: 1.5,
    });
    shake(def.slamFwd ? 2 : 5, 0.25);
    sfx(def.slamFwd ? 'slash' : 'explosion', { vol: 0.35, pitch: def.slamFwd ? 1.3 : 0.8 });
    if (typeof def.onSlam === 'function') def.onSlam(G, m, g.x, g.y, g.r);
  }
  function treantSlam(G, m, x, y) {
    const n = HQ ? 10 : 7, off = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * TAU;
      shootAt(x + cos(a) * m.r, y + sin(a) * m.r, a, SHOT.thorn, 'enemy', m.dmg * SHOT.thorn.dmgMul);
    }
    fxBurst(x, y, { count: 14, colors: ['#66bb6a', '#2e7d32', '#c5e1a5'], speed: [60, 200], life: [0.4, 0.8], size: [2, 4], shape: 'drop', gravity: 200 });
  }
  function golemSlam(G, m, x, y, r) {
    zone({ x, y, r: r * 0.75, life: 3, team: 'enemy', kind: 'fire', dps: m.dmg * 0.3, color: '#ff6d00', status: { type: 'burn', dur: 2, power: 5 } });
    fxCall('explosion', x, y, { radius: r * 0.8, color: '#ff6d00' });
    sfx('magma', { vol: 0.4 });
  }

  const BEHAVIOR = {
    chase: bChase, swoop: bSwoop, ranged: bRanged, charge: bCharge,
    tank: bTank, swarm: bSwarm, blink: bBlink,
  };

  function updateEnemy(G, m, dt) {
    const ai = m.ai && m.ai._ok ? m.ai : initAI(m);
    preUpdate(G, m, dt);
    if (m.dead) return;
    if (m.boss) { updateBoss(G, m, dt); return; }
    if (ai.grab) { m.vx = m.vy = 0; return; }
    const def = m.def || EMPTY;
    neighbors(G, m, def.behavior === 'swarm');
    const pushX = NX, pushY = NY;
    if (m.status.stun > 0) {
      steer(m, 0, 0, 0, 8, dt);
      ai.wind = 0; ai.lnOn = false; ai.tele = 0; ai.cmul = 1;
      if (ai.st !== 'move') { ai.st = 'move'; ai.stT = 0; }
      if (ai.bk) { ai.bk = 0; ai.alpha = 1; }
    } else if (m.passive) bPassive(G, m, dt);
    else {
      const tg = pickTarget(G, m, dt);
      if (!tg) bIdle(G, m, dt);
      else (BEHAVIOR[def.behavior] || bChase)(G, m, dt, tg);
    }
    integrate(G, m, dt, pushX, pushY);
    contactPlayer(G, m);
  }

  /* ================================================================ main update */
  let lastG = null, lastGT = 0;
  function resetRun() {
    pending.length = 0;
    falls.length = 0;
    fbWarns.length = 0;
  }
  function update(G, dt) {
    if (!G || !(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    if (!G.enemies) G.enemies = [];
    if (!G.allies) G.allies = [];
    if (G !== lastG || (G.t || 0) < lastGT - 0.5) resetRun();
    lastG = G; lastGT = G.t || 0;
    HQ = SK.quality !== 'low';
    updatePending(dt);
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i];
      f.t += dt;
      if (f.t >= f.dur) { falls[i] = falls[falls.length - 1]; falls.pop(); }
    }
    for (let i = fbWarns.length - 1; i >= 0; i--) {
      const w = fbWarns[i];
      w.t += dt;
      if (w.t >= w.life) { fbWarns[i] = fbWarns[fbWarns.length - 1]; fbWarns.pop(); }
    }
    gridBuild(G);
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (m && !m.dead) updateEnemy(G, m, dt);
    }
    const A = G.allies;
    const n = A.length;
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (m) updateAlly(G, m, dt, i, n);
    }
  }

  /* ================================================================ bosses: framework */
  function bossSpd(m) { return (m.enraged ? 1.2 : 1) * slowMul(m); }

  function enrage(G, m, title) {
    sfx('bossRoar');
    shake(12, 0.6);
    fxRing(m.x, m.y, { radius: m.r * 3.2, color: '#ff1744', life: 0.7, width: 10 });
    fxCall('flash', '#ff1744', 0.16, 0.35);
    fxBurst(m.x, m.y, {
      count: 24, colors: ['#ff1744', '#ff8a80', '#ffffff'], speed: [120, 420], life: [0.3, 0.8],
      size: [2, 4], shape: 'spark', glow: true,
    });
    banner(m.def.name, title, { color: '#ff5252', duration: 1.8 });
  }
  function bossPhases(G, m) {
    const ratio = m.maxHp > 0 ? m.hp / m.maxHp : 1;
    if (!m.enraged && ratio <= 0.5) {
      m.enraged = true;
      m.phase = 2;
      m.speed *= 1.15;
      m.ai.cd = min(m.ai.cd, 0.6);
      enrage(G, m, 'FURIA SCATENATA');
    }
    if (m.type === 'demon_lord' && m.phase < 3 && ratio <= 0.25) {
      m.phase = 3;
      m.ai.cd = min(m.ai.cd, 0.4);
      m.ai.force = 'eclipse';
      enrage(G, m, 'ECLISSE TOTALE');
    }
  }
  function patWeight(G, m, B, k) {
    if (B.can && !B.can(G, m, k)) return 0;
    const w = B.weights[k] || 0;
    return k === m.ai.last ? w * 0.15 : w;
  }
  function pickPattern(G, m, B) {
    let total = 0;
    for (const k in B.weights) total += patWeight(G, m, B, k);
    let r = Math.random() * total;
    for (const k in B.weights) {
      r -= patWeight(G, m, B, k);
      if (r <= 0 && patWeight(G, m, B, k) > 0) return k;
    }
    return B.fallback;
  }
  function startPattern(G, m, B) {
    const ai = m.ai;
    const name = ai.force && B.attacks[ai.force] ? ai.force : pickPattern(G, m, B);
    ai.force = null;
    ai.pat = name; ai.at = 0; ai.step = 0; ai.n = 0; ai.pp = 0; ai.pt = 0; ai.pw = 0;
    ai.tick = 0; ai.tele = 0; ai.cast = 0; ai.spin = false; ai.wind = 0;
  }
  function endPattern(m, B) {
    const ai = m.ai;
    ai.last = ai.pat; ai.pat = null;
    ai.cast = 0; ai.tele = 0; ai.wind = 0; ai.lnOn = false; ai.spin = false; ai.cmul = 1; ai.h = 0; ai.alpha = 1;
    if (ai.under > 0 && m.type !== 'abyss_serpent') ai.under = 0;
    if (ai.prey) { if (ai.prey.ai) ai.prey.ai.grab = false; ai.prey = null; }
    ai.cd = (B ? B.cd : 2) * (m.enraged ? 0.62 : 1) * rand(0.85, 1.2);
  }

  function bossPush(G, m) {
    const ai = m.ai;
    const solid = ai.h < 30 && ai.under < 0.3 && ai.alpha > 0.5 && ai.enter <= 0;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const o = E[i];
      if (!o || o === m || o.dead || o.boss || (o.ai && o.ai.grab)) continue;
      const dx = o.x - m.x, dy = o.y - m.y, rr = m.r * 0.9 + o.r;
      if (abs(dx) > rr || abs(dy) > rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = sqrt(d2) || 0.01;
      o.x = m.x + (dx / d) * rr; o.y = m.y + (dy / d) * rr;
    }
    const A = G.allies;
    for (let i = 0; i < A.length; i++) {
      const o = A[i];
      if (!o || o.dead || (o.ai && o.ai.fainted)) continue;
      const dx = o.x - m.x, dy = o.y - m.y, rr = m.r * 0.85 + o.r;
      if (abs(dx) > rr || abs(dy) > rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = sqrt(d2) || 0.01;
      o.x = m.x + (dx / d) * rr; o.y = m.y + (dy / d) * rr;
      if (solid && ai.ccdA <= 0) { hurtMon(o, m.dmg * 0.7, m, 220, dx, dy); ai.ccdA = 0.8; }
    }
  }

  function updateBoss(G, m, dt) {
    const ai = m.ai, B = BOSS[m.type], p = G.player;
    m.status.stun = 0;
    if (!B) {
      if (p && !p.dead) bChase(G, m, dt, p); else bIdle(G, m, dt);
      integrate(G, m, dt, 0, 0); contactPlayer(G, m);
      return;
    }
    if (ai.enter > 0) {
      ai.enterT += dt;
      if (m.hp < m.maxHp) m.hp = m.maxHp;
      ai.lastHp = m.hp;
      B.enter(G, m, dt, ai.enterT);
      if (ai.enterT >= B.enterDur) {
        ai.enter = 0; ai.cd = 1.0; ai.h = 0; ai.alpha = 1; ai.cast = 0; ai.emerge = 1; ai.portal = 0;
      }
      integrate(G, m, dt, 0, 0);
      if (B.post) B.post(G, m, dt);
      return;
    }
    bossPhases(G, m);
    if (ai.dizzy > 0) ai.dizzy = max(0, ai.dizzy - dt);
    if (ai.pat) {
      ai.at += dt * (m.enraged ? 1.1 : 1);
      if (!p || p.dead) endPattern(m, B);
      else if (B.attacks[ai.pat](G, m, dt, ai.at, ai)) endPattern(m, B);
    } else {
      if (p && !p.dead) B.move(G, m, dt); else steer(m, 0, 0, 0, 3, dt);
      ai.cd -= dt;
      if (ai.cd <= 0 && p && !p.dead) startPattern(G, m, B);
    }
    integrate(G, m, dt, 0, 0);
    worldClamp(m);
    if (B.post) B.post(G, m, dt);
    bossPush(G, m);
    if (ai.h < 30 && ai.under < 0.3 && ai.alpha > 0.5) contactPlayer(G, m);
  }

  /* ================================================================ boss: Serpe Nera degli Abissi */
  function serpentSegR(m, i, N) { return m.r * (0.8 - (0.52 * i) / N); }
  function serpentSteer(m, tx, ty, spd, dt, turn) {
    const ai = m.ai;
    if (ai.head == null) ai.head = m.facing || 0;
    const want = atan2(ty - m.y, tx - m.x) + sin(m.t * 2.4) * 0.5;
    ai.head += clamp(U.angleDiff(ai.head, want), -turn * dt, turn * dt);
    m.vx = cos(ai.head) * spd; m.vy = sin(ai.head) * spd;
  }
  function serpentMove(G, m, dt) {
    const ai = m.ai, p = G.player;
    ai.orb = (ai.orb || 0) + dt * 0.5 * ai.side;
    serpentSteer(m, p.x + cos(ai.orb) * 230, p.y + sin(ai.orb) * 230, m.speed * bossSpd(m), dt, 2.2);
  }
  function serpentEnter(G, m, dt, et) {
    const ai = m.ai;
    m.vx = m.vy = 0;
    if (ai.e0 !== 1 && ai.e0 !== 2) {
      ai.e0 = 1; ai.emerge = 0;
      shake(8, 1.0);
      sfx('explosion', { vol: 0.6, pitch: 0.4 });
      warn(m, m.x, m.y, m.r * 1.6, 1.0, null, '#d500f9');
    }
    if (et < 1.0) {
      ai.emerge = 0;
      if (Math.random() < dt * 14) {
        fxBurst(m.x + rand(-50, 50), m.y + rand(-50, 50), {
          count: 4, colors: ['#5d4e6d', '#8d7aa8'], speed: [60, 200], life: [0.3, 0.6], size: [2, 4],
          shape: 'square', gravity: 380, drag: 1,
        });
      }
      return;
    }
    if (ai.e0 === 1) {
      ai.e0 = 2;
      sfx('bossRoar');
      shake(14, 0.6);
      fxCall('explosion', m.x, m.y, { radius: 120, color: '#7c4dff' });
      fxRing(m.x, m.y, { radius: 240, color: '#b388ff', life: 0.7, width: 8 });
      const p = G.player;
      ai.head = (p ? atan2(p.y - m.y, p.x - m.x) : 0) + HALF_PI;
    }
    ai.emerge = min(1, (et - 1.0) / 1.2);
    ai.head += dt * 2.6;
    m.vx = cos(ai.head) * m.speed * 0.9; m.vy = sin(ai.head) * m.speed * 0.9;
  }
  function serpentPost(G, m, dt) {
    const ai = m.ai, segs = m.segs;
    if (!segs) return;
    const N = segs.length;
    if (ai.under >= 0.999 || (ai.enter > 0 && ai.emerge <= 0)) {
      for (let i = 0; i < N; i++) { segs[i].x = m.x; segs[i].y = m.y; }
      return;
    }
    const gap0 = m.r * 0.58;
    let px = m.x, py = m.y;
    for (let i = 0; i < N; i++) {
      const s = segs[i];
      const dx = s.x - px, dy = s.y - py, d = hypot(dx, dy);
      const gap = i === 0 ? gap0 * 1.1 : gap0 * (1 - (0.25 * i) / N);
      if (d > gap) { s.x = px + (dx / d) * gap; s.y = py + (dy / d) * gap; }
      px = s.x; py = s.y;
    }
    if (ai.under < 0.3 && ai.enter <= 0 && ai.ccd <= 0) {
      const p = G.player;
      if (p && !p.dead) {
        for (let i = 1; i < N; i += 2) {
          const s = segs[i];
          const rr = serpentSegR(m, i, N) * 0.85 + (p.r || 20) * 0.7;
          if ((s.x - p.x) * (s.x - p.x) + (s.y - p.y) * (s.y - p.y) < rr * rr) {
            hurtPlayer(m.dmg * 0.6, m);
            ai.ccd = 0.8;
            break;
          }
        }
      }
    }
  }
  function sTail(G, m, dt, at, ai) {
    const p = G.player;
    const tele = m.enraged ? 0.7 : 0.9;
    if (ai.step === 0) {
      ai.step = 1;
      const a0 = atan2(p.y - m.y, p.x - m.x);
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k - 2) * 0.42, d = 150 + (k % 2) * 34;
        const x = m.x + cos(a) * d, y = m.y + sin(a) * d;
        warn(m, x, y, 78, tele, () => {
          areaHit(G, m, x, y, 78, m.dmg * 1.2, 260);
          fxCall('slash', x, y, a + HALF_PI, { radius: 82, arc: 2.4, color: '#b388ff', width: 14, life: 0.25 });
          fxBurst(x, y, { count: 8, colors: ['#5d4e6d', '#b388ff'], speed: [80, 240], life: [0.3, 0.6], size: [2, 4], shape: 'square', gravity: 320 });
        }, '#d500f9');
      }
      later(tele, () => { shake(9, 0.3); sfx('slash', { vol: 0.8, pitch: 0.6 }); }, m);
    }
    if (at < tele) {
      serpentSteer(m, p.x, p.y, m.speed * 0.22, dt, 1.5);
      ai.cast = at / tele;
    } else {
      ai.cast = 0; ai.atk = 1;
      ai.head += dt * 7 * ai.side;
      m.vx = cos(ai.head) * m.speed * 0.8; m.vy = sin(ai.head) * m.speed * 0.8;
    }
    return at > tele + 0.6;
  }
  function sRain(G, m, dt, at, ai) {
    const p = G.player;
    if (ai.step === 0) {
      ai.step = 1; ai.cast = 1;
      sfx('thunder', { vol: 0.5, pitch: 0.7 });
      fxCall('converge', m.x, m.y, { radius: 150, count: 18, color: '#b388ff' });
      const n = m.enraged ? 13 : 8;
      const tele = m.enraged ? 0.75 : 0.95;
      for (let i = 0; i < n; i++) {
        later(0.15 + i * 0.12, () => {
          if (!p || p.dead) return;
          const a = Math.random() * TAU, d = i === 0 ? 0 : rand(40, 260);
          const x = p.x + cos(a) * d + (p.vx || 0) * 0.25, y = p.y + sin(a) * d + (p.vy || 0) * 0.25;
          warn(m, x, y, 60, tele, () => {
            fxCall('lightning', x + rand(-60, 60), y - 460, x, y, { color: '#b388ff', width: 5, life: 0.3, branches: 3 });
            fxCall('lightning', x + rand(-30, 30), y - 420, x, y, { color: '#ffffff', width: 2, life: 0.2, branches: 1 });
            fxRing(x, y, { radius: 70, color: '#7c4dff', life: 0.35, width: 5 });
            fxBurst(x, y, { count: 10, colors: ['#b388ff', '#ffffff'], speed: [80, 260], life: [0.2, 0.45], size: [1.5, 3], shape: 'spark' });
            areaHit(G, m, x, y, 60, m.dmg * 1.1, 160);
            sfx('thunder', { vol: 0.45 });
            shake(4, 0.15);
          }, '#7c4dff');
        }, m);
      }
    }
    serpentSteer(m, p.x, p.y, m.speed * 0.45, dt, 2);
    if (at > 1.2) ai.cast = 0;
    return at > 2.5;
  }
  function sBurrow(G, m, dt, at, ai) {
    const p = G.player;
    if (ai.step === 0) {
      ai.step = 1;
      sfx('explosion', { vol: 0.5, pitch: 0.5 });
      shake(6, 0.4);
    }
    if (ai.step === 1) {
      ai.under = min(1, at / 0.6);
      m.vx *= 0.92; m.vy *= 0.92;
      if (Math.random() < dt * 16) fxBurst(m.x, m.y, { count: 4, colors: ['#5d4e6d', '#8d7aa8'], speed: [60, 200], life: [0.3, 0.6], size: [2, 4], shape: 'square', gravity: 380 });
      if (at >= 0.6) { ai.step = 2; ai.under = 1; ai.mx = m.x; ai.my = m.y; ai.dustT = 0; }
    } else if (ai.step === 2) {
      const k = 1 - exp(-3.2 * dt);
      ai.mx += (p.x - ai.mx) * k; ai.my += (p.y - ai.my) * k;
      m.x = ai.mx; m.y = ai.my; m.vx = m.vy = 0;
      ai.dustT -= dt;
      if (ai.dustT <= 0) {
        ai.dustT = 0.08;
        fxBurst(m.x + rand(-20, 20), m.y + rand(-20, 20), { count: 3, colors: ['#5d4e6d', '#8d7aa8'], speed: [40, 140], life: [0.3, 0.5], size: [2, 4], shape: 'square', gravity: 380 });
      }
      if (at >= 2.0) {
        ai.step = 3; ai.lockAt = at;
        warn(m, m.x, m.y, 125, 0.6, null, '#d500f9');
        sfx('warning', { vol: 0.4 });
      }
    } else if (ai.step === 3) {
      m.vx = m.vy = 0;
      if (at >= ai.lockAt + 0.6) {
        ai.step = 4;
        areaHit(G, m, m.x, m.y, 125, m.dmg * 1.5, 380);
        shake(14, 0.5);
        fxCall('explosion', m.x, m.y, { radius: 110, color: '#7c4dff' });
        fxRing(m.x, m.y, { radius: 200, color: '#b388ff', life: 0.5, width: 8 });
        const n = m.enraged ? 16 : 10, off = Math.random() * TAU;
        for (let i = 0; i < n; i++) shoot(m, off + (i / n) * TAU, SHOT.voidRock, 'enemy', m.dmg * SHOT.voidRock.dmgMul);
        sfx('explosion');
        ai.head = atan2(p.y - m.y, p.x - m.x) + PI + rand(-0.5, 0.5);
      }
    } else {
      ai.under = max(0, ai.under - dt * 2.5);
      serpentSteer(m, p.x, p.y, m.speed * 0.9, dt, 3);
      if (at > ai.lockAt + 1.3) { ai.under = 0; return true; }
    }
    return false;
  }
  function sSpit(G, m, dt, at, ai) {
    const p = G.player;
    const tele = 0.5, vol = m.enraged ? 4 : 3;
    serpentSteer(m, p.x, p.y, m.speed * 0.3, dt, 3);
    if (at < tele) { ai.tele = at / tele; return false; }
    if (ai.n < vol && at >= tele + ai.n * 0.35) {
      ai.n++; ai.tele = 0; ai.atk = 1;
      const a0 = atan2(p.y - m.y, p.x - m.x), k = m.enraged ? 7 : 5;
      for (let i = 0; i < k; i++) shoot(m, a0 + (i - (k - 1) / 2) * 0.17, SHOT.spit, 'enemy', m.dmg * SHOT.spit.dmgMul);
      sfx('spirit', { vol: 0.5, pitch: 0.6 });
    }
    return at > tele + vol * 0.35 + 0.4;
  }

  /* ================================================================ boss: Lupo Alfa della Luna Cremisi */
  function wolfMove(G, m, dt) {
    const p = G.player, ai = m.ai;
    const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    let mx = -uy * ai.side, my = ux * ai.side;
    const radial = (250 - d) / 120;
    mx += ux * radial; my += uy * radial;
    const l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, m.speed * bossSpd(m), 3, dt);
    if (Math.random() < dt * 0.2) ai.side = -ai.side;
  }
  function wolfEnter(G, m, dt, et) {
    const ai = m.ai, T = 1.1;
    if (!ai.e0) {
      ai.e0 = 1;
      warn(m, ai.ex, ai.ey, 115, T, null, '#ff1744');
      sfx('howl', { vol: 0.6 });
    }
    if (et < T) {
      const q = et / T;
      m.x = lerp(ai.sx, ai.ex, q); m.y = lerp(ai.sy, ai.ey, q);
      ai.h = sin(q * PI) * 260;
      m.vx = m.vy = 0;
      face(m, atan2(ai.ey - ai.sy, ai.ex - ai.sx));
      return;
    }
    m.vx = m.vy = 0; ai.h = 0;
    if (ai.e0 === 1) {
      ai.e0 = 2;
      shake(14, 0.5);
      fxRing(m.x, m.y, { radius: 180, color: '#ff1744', life: 0.5, width: 8 });
      fxBurst(m.x, m.y, { count: 20, colors: ['#6d5d50', '#a1887f'], speed: [80, 260], life: [0.4, 0.8], size: [2, 5], shape: 'square', gravity: 300 });
      areaHit(G, m, m.x, m.y, 115, m.dmg, 300);
      sfx('explosion', { vol: 0.7, pitch: 0.8 });
    }
    if (et > T + 0.3 && ai.e0 === 2) {
      ai.e0 = 3; ai.cast = 1;
      sfx('howl'); sfx('bossRoar');
      for (let i = 0; i < 3; i++) later(i * 0.16, () => fxRing(m.x, m.y, { radius: 160 + i * 70, color: '#ff1744', life: 0.6, width: 5 }), m);
      shake(8, 0.6);
    }
    if (et > T + 1.2) ai.cast = 0;
  }
  function wPounce(G, m, dt, at, ai) {
    const p = G.player;
    const n = m.enraged ? 4 : 3;
    ai.pt += dt;
    if (ai.pp === 0) {
      if (!ai.pw) {
        ai.pw = 1;
        let tx = p.x + (p.vx || 0) * 0.35, ty = p.y + (p.vy || 0) * 0.35;
        const dx = tx - m.x, dy = ty - m.y, d = hypot(dx, dy);
        if (d > 420) { tx = m.x + (dx / d) * 420; ty = m.y + (dy / d) * 420; }
        ai.tx = tx; ai.ty = ty; ai.sx = m.x; ai.sy = m.y;
        warn(m, tx, ty, 100, 0.6, null, '#ff1744');
        face(m, atan2(ty - m.y, tx - m.x));
      }
      ai.wind = min(1, ai.pt / 0.6);
      m.vx *= 0.8; m.vy *= 0.8;
      if (ai.pt >= 0.6) { ai.pp = 1; ai.pt = 0; ai.wind = 0; ai.sx = m.x; ai.sy = m.y; sfx('dash', { vol: 0.6, pitch: 0.7 }); }
    } else if (ai.pp === 1) {
      const q = min(1, ai.pt / 0.42);
      m.x = lerp(ai.sx, ai.tx, q); m.y = lerp(ai.sy, ai.ty, q);
      m.vx = m.vy = 0;
      ai.h = sin(q * PI) * 120;
      face(m, atan2(ai.ty - ai.sy, ai.tx - ai.sx));
      if (q >= 1) {
        ai.pp = 2; ai.pt = 0; ai.h = 0; ai.atk = 1;
        areaHit(G, m, m.x, m.y, 100, m.dmg * 1.25, 320);
        shake(9, 0.3);
        fxRing(m.x, m.y, { radius: 120, color: '#ff5252', life: 0.4, width: 6 });
        fxBurst(m.x, m.y, { count: 12, colors: ['#6d5d50', '#a1887f'], speed: [60, 220], life: [0.3, 0.6], size: [2, 4], shape: 'square', gravity: 300 });
        sfx('explosion', { vol: 0.5, pitch: 1.3 });
      }
    } else {
      m.vx *= 0.8; m.vy *= 0.8;
      if (ai.pt >= (m.enraged ? 0.12 : 0.25)) {
        ai.n++; ai.pp = 0; ai.pt = 0; ai.pw = 0;
        if (ai.n >= n) return true;
      }
    }
    return false;
  }
  function wHowl(G, m, dt, at, ai) {
    if (ai.step === 0) { ai.step = 1; ai.cast = 1; }
    m.vx *= 0.85; m.vy *= 0.85;
    if (ai.step === 1 && at > 0.45) {
      ai.step = 2;
      sfx('howl');
      shake(6, 0.5);
      for (let i = 0; i < 3; i++) later(i * 0.15, () => fxRing(m.x, m.y, { radius: 150 + i * 80, color: '#ff1744', life: 0.6, width: 5 }), m);
      const k = m.enraged ? 5 : 3, off = Math.random() * TAU;
      for (let i = 0; i < k; i++) {
        const a = off + (i / k) * TAU;
        summon(G, 'dire_wolf', m.x + cos(a) * (m.r + 70), m.y + sin(a) * (m.r + 70));
      }
    }
    if (at > 1.4) ai.cast = 0;
    return at > 1.7;
  }
  function wMoon(G, m, dt, at, ai) {
    const p = G.player;
    const vol = m.enraged ? 3 : 2, tele = 0.6;
    if (ai.step === 0) {
      ai.step = 1;
      fxCall('converge', m.x, m.y, { radius: 140, count: 16, color: '#ff1744' });
      sfx('warning', { vol: 0.3, pitch: 1.2 });
    }
    m.vx *= 0.85; m.vy *= 0.85;
    face(m, atan2(p.y - m.y, p.x - m.x));
    ai.tele = at < tele ? at / tele : 0;
    if (at >= tele + ai.n * 0.45 && ai.n < vol) {
      ai.n++; ai.atk = 1;
      const a0 = atan2(p.y - m.y, p.x - m.x);
      for (let i = 0; i < 5; i++) shoot(m, a0 + (i - 2) * 0.22 + (ai.n % 2 ? 0.11 : 0), SHOT.moon, 'enemy', m.dmg * SHOT.moon.dmgMul);
      fxCall('slash', m.x + cos(a0) * m.r, m.y + sin(a0) * m.r, a0, { radius: m.r * 1.4, arc: 2.6, color: '#ff1744', width: 16, life: 0.25 });
      sfx('slash', { pitch: 0.8 });
    }
    return at > tele + vol * 0.45 + 0.4;
  }
  function wDash(G, m, dt, at, ai) {
    const p = G.player;
    const T = m.enraged ? 0.5 : 0.7;
    if (ai.step === 0) {
      ai.step = 1;
      ai.dir = atan2(p.y - m.y, p.x - m.x);
      ai.len = min(640, hypot(p.x - m.x, p.y - m.y) + 260);
      ai.lnOn = true; ai.lnT = 0;
      sfx('warning', { vol: 0.35 });
    }
    if (ai.step === 1) {
      ai.lnT = at / T; ai.wind = ai.lnT;
      if (at < T * 0.5) ai.dir = U.lerpAngle(ai.dir, atan2(p.y - m.y, p.x - m.x), min(1, dt * 5));
      face(m, ai.dir);
      m.vx *= 0.8; m.vy *= 0.8;
      if (at >= T) { ai.step = 2; ai.lnOn = false; ai.wind = 0; ai.cmul = 1.5; ai.t0 = at; ai.tick = 0; sfx('dash'); }
    } else if (ai.step === 2) {
      const sp = 1050;
      m.vx = cos(ai.dir) * sp; m.vy = sin(ai.dir) * sp;
      face(m, ai.dir);
      fxCall('trail', m, '#ff1744', m.r);
      ai.tick -= dt;
      if (ai.tick <= 0) {
        ai.tick = 0.07;
        fxCall('slash', m.x, m.y, ai.dir + HALF_PI, { radius: m.r * 1.2, arc: 1.6, color: '#ff5252', width: 8, life: 0.2 });
      }
      if (at - ai.t0 >= ai.len / sp) { ai.step = 3; ai.cmul = 1; ai.t0 = at; }
    } else {
      m.vx *= 0.85; m.vy *= 0.85;
      if (at - ai.t0 > 0.45) return true;
    }
    return false;
  }

  /* ================================================================ boss: Tiranno degli Orchi */
  function orcMove(G, m, dt) {
    const p = G.player;
    const dx = p.x - m.x, dy = p.y - m.y, d = hypot(dx, dy) || 1;
    if (d > m.r + 40) steer(m, dx / d, dy / d, m.speed * bossSpd(m), 2.5, dt);
    else steer(m, 0, 0, 0, 4, dt);
  }
  function orcEnter(G, m, dt, et) {
    const ai = m.ai, T = 1.1;
    m.vx = m.vy = 0;
    if (!ai.e0) { ai.e0 = 1; warn(m, m.x, m.y, 140, T, null, '#ff6d00'); sfx('warning', { vol: 0.4 }); }
    if (et < T) { const q = et / T; ai.h = (1 - q * q) * 700; return; }
    ai.h = 0;
    if (ai.e0 === 1) {
      ai.e0 = 2;
      shake(18, 0.6);
      fxCall('explosion', m.x, m.y, { radius: 130, color: '#ff9100' });
      fxCall('flash', '#ffab40', 0.15, 0.25);
      fxRing(m.x, m.y, { radius: 260, color: '#ffab40', life: 0.6, width: 10 });
      areaHit(G, m, m.x, m.y, 140, m.dmg, 360);
      const n = 12;
      for (let i = 0; i < n; i++) shoot(m, (i / n) * TAU, SHOT.rock, 'enemy', m.dmg * SHOT.rock.dmgMul);
      sfx('explosion');
    }
    if (et > T + 0.35 && ai.e0 === 2) {
      ai.e0 = 3; ai.cast = 1;
      sfx('bossRoar');
      shake(8, 0.6);
      fxRing(m.x, m.y, { radius: 200, color: '#ff1744', life: 0.6, width: 6 });
    }
  }
  function oSlam(G, m, dt, at, ai) {
    const tele = m.enraged ? 0.65 : 0.85;
    if (ai.step === 0) { ai.step = 1; warn(m, m.x, m.y, 175, tele, null, '#ff6d00'); }
    steer(m, 0, 0, 0, 8, dt);
    if (ai.step === 1) {
      ai.wind = min(1, at / tele);
      if (at >= tele) {
        ai.step = 2; ai.wind = 0; ai.atk = 1;
        areaHit(G, m, m.x, m.y, 175, m.dmg * 1.4, 380);
        shake(14, 0.45);
        fxCall('explosion', m.x, m.y, { radius: 120, color: '#ff9100' });
        fxRing(m.x, m.y, { radius: 175, color: '#ffab40', life: 0.4, width: 10 });
        sfx('explosion');
        for (let w = 0; w < 3; w++) {
          later(0.2 + w * 0.28, () => {
            const n = m.enraged ? 22 : 16, off = (w * 0.5 * TAU) / n;
            for (let i = 0; i < n; i++) shoot(m, off + (i / n) * TAU, SHOT.rock, 'enemy', m.dmg * SHOT.rock.dmgMul);
            fxRing(m.x, m.y, { radius: 220 + w * 60, color: '#ffab40', life: 0.5, width: 6 });
            sfx('magma', { vol: 0.35 });
          }, m);
        }
        if (m.enraged) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + Math.random(), d = rand(120, 220);
            zone({ x: m.x + cos(a) * d, y: m.y + sin(a) * d, r: 62, life: 4, team: 'enemy', kind: 'fire', dps: m.dmg * 0.35, color: '#ff6d00', status: { type: 'burn', dur: 2, power: 6 } });
          }
        }
      }
    }
    return at > tele + 1.2;
  }
  function oSpin(G, m, dt, at, ai) {
    const p = G.player;
    const T = m.enraged ? 3.2 : 2.4;
    if (ai.step === 0) { ai.step = 1; warn(m, m.x, m.y, 145, 0.7, null, '#ff6d00'); }
    if (at < 0.7) { ai.wind = at / 0.7; steer(m, 0, 0, 0, 8, dt); }
    else if (at < 0.7 + T) {
      ai.spin = true; ai.wind = 0;
      const dx = p.x - m.x, dy = p.y - m.y, d = hypot(dx, dy) || 1;
      steer(m, dx / d, dy / d, m.speed * 1.25 * bossSpd(m), 2, dt);
      ai.tick -= dt;
      if (ai.tick <= 0) {
        ai.tick = 0.22;
        areaHit(G, m, m.x, m.y, 145, m.dmg * 0.5, 300);
        fxCall('slash', m.x, m.y, (m.t * 18) % TAU, { radius: 130, arc: 2.6, color: '#eceff1', width: 12, life: 0.18 });
        sfx('slash', { vol: 0.5 });
      }
    } else {
      if (ai.spin) { ai.spin = false; ai.dizzy = 0.8; }
      steer(m, 0, 0, 0, 5, dt);
    }
    return at > 0.7 + T + 0.7;
  }
  function oSummon(G, m, dt, at, ai) {
    steer(m, 0, 0, 0, 6, dt);
    if (ai.step === 0) { ai.step = 1; ai.cast = 1; sfx('bossRoar', { vol: 0.6, pitch: 1.2 }); }
    if (ai.step === 1 && at > 0.5) {
      ai.step = 2;
      const k = m.enraged ? 4 : 3, off = Math.random() * TAU;
      for (let i = 0; i < k; i++) {
        const a = off + (i / k) * TAU;
        summon(G, 'orc_warrior', m.x + cos(a) * (m.r + 80), m.y + sin(a) * (m.r + 80));
      }
      shake(6, 0.3);
    }
    if (at > 1.1) ai.cast = 0;
    return at > 1.4;
  }
  function findPrey(G, m, R) {
    let best = null, bd = R * R;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e || e === m || e.dead || e.boss || e.passive) continue;
      const d = (e.x - m.x) * (e.x - m.x) + (e.y - m.y) * (e.y - m.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function oDevour(G, m, dt, at, ai) {
    steer(m, 0, 0, 0, 6, dt);
    if (ai.step === 0) {
      const prey = findPrey(G, m, 420);
      if (!prey) return true;
      ai.step = 1; ai.prey = prey; ai.cast = 1;
      prey.ai.grab = true;
      sfx('gluttony', { vol: 0.7 });
      fxCall('converge', m.x, m.y, { radius: 180, count: 18, color: '#69f0ae' });
      fxCall('text', m.x, m.y - m.r * 1.2, 'FAME!', { color: '#ff8a80', size: 22, life: 1 });
    }
    if (ai.step === 1) {
      const prey = ai.prey;
      if (!prey || prey.dead) {
        ai.step = 2; ai.t0 = at; ai.prey = null;
        sfx('bossRoar', { vol: 0.4, pitch: 1.3 });
        return false;
      }
      const k = 1 - exp(-4 * dt);
      prey.x += (m.x - prey.x) * k; prey.y += (m.y - prey.y) * k;
      face(m, atan2(prey.y - m.y, prey.x - m.x));
      if (at >= 0.8 || hypot(prey.x - m.x, prey.y - m.y) < m.r * 0.8) {
        const heal = min(m.maxHp * 0.12, m.maxHp * 0.06 + prey.maxHp * 0.5);
        m.hp = min(m.maxHp, m.hp + heal);
        m.ai.lastHp = m.hp;
        prey.hp = 0; prey.dead = true; prey.devoured = true; prey.ai.grab = false;
        ai.prey = null; ai.step = 2; ai.t0 = at; ai.atk = 1;
        fxCall('heal', m.x, m.y, '#69f0ae');
        fxCall('text', m.x, m.y - m.r, '+' + Math.round(heal), { color: '#69f0ae', size: 24, life: 1.1 });
        fxBurst(m.x, m.y, { count: 16, colors: ['#ff5252', '#69f0ae'], speed: [60, 220], life: [0.3, 0.7], size: [2, 4], shape: 'drop' });
        shake(6, 0.3);
        sfx('gluttony');
      }
      return false;
    }
    if (at > ai.t0 + 0.4) ai.cast = 0;
    return at > ai.t0 + 0.6;
  }

  /* ================================================================ boss: Re Demone Caduto */
  function dlMove(G, m, dt) {
    const p = G.player, ai = m.ai;
    const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    let mx = -uy * ai.side * 0.6, my = ux * ai.side * 0.6;
    const radial = (260 - d) / 140;
    mx += ux * radial; my += uy * radial;
    const l = hypot(mx, my) || 1;
    steer(m, mx / l, my / l, m.speed * 0.8 * bossSpd(m) * min(1, l), 2.5, dt);
    if (Math.random() < dt * 0.15) ai.side = -ai.side;
  }
  function dlEnter(G, m, dt, et) {
    const ai = m.ai;
    m.vx = m.vy = 0;
    if (!ai.e0) {
      ai.e0 = 1;
      fxCall('lightRays', m.x, m.y, { color: '#b388ff', life: 2.4, radius: 300, count: 12 });
      sfx('portal', { vol: 0.8, pitch: 0.6 });
      shake(5, 2);
    }
    ai.portal = et < 0.8 ? et / 0.8 : et < 2.0 ? 1 : max(0, 1 - (et - 2.0) / 0.6);
    const q = clamp((et - 0.8) / 1.2, 0, 1);
    ai.alpha = q;
    ai.h = -(1 - U.ease.outCubic(q)) * m.r * 0.8;
    if (et >= 0.8 && ai.e0 === 1) {
      ai.e0 = 2;
      sfx('bossRoar');
      fxCall('flash', '#4a148c', 0.3, 0.5);
      fxRing(m.x, m.y, { radius: 280, color: '#b388ff', life: 0.8, width: 8 });
    }
    if (et >= 1.8 && ai.e0 === 2) {
      ai.e0 = 3; ai.cast = 1;
      fxBurst(m.x, m.y, { count: 30, colors: ['#b388ff', '#ea80fc', '#ffffff'], speed: [100, 380], life: [0.4, 0.9], size: [2, 4], shape: 'star', glow: true });
      shake(10, 0.5);
    }
  }
  function dMeteors(G, m, dt, at, ai) {
    const p = G.player;
    const n = m.phase >= 3 ? 22 : m.enraged ? 16 : 10;
    if (ai.step === 0) {
      ai.step = 1; ai.cast = 1;
      sfx('meteor', { vol: 0.6, pitch: 0.7 });
      for (let i = 0; i < n; i++) {
        later(i * 0.09, () => {
          if (!p || p.dead) return;
          const a = Math.random() * TAU, d = i === 0 ? 0 : rand(30, 300);
          const x = p.x + cos(a) * d, y = p.y + sin(a) * d, life = 1.15;
          falls.push({ x, y, t: 0, dur: life, color: '#b388ff', size: 18 });
          warn(m, x, y, 66, life, () => {
            fxCall('explosion', x, y, { radius: 70, color: '#7c4dff' });
            areaHit(G, m, x, y, 66, m.dmg * 1.1, 260);
            if (HQ) zone({ x, y, r: 48, life: 2.2, team: 'enemy', kind: 'shadow', dps: m.dmg * 0.25, color: '#7c4dff' });
            sfx('meteor', { vol: 0.45 });
            shake(5, 0.2);
          }, '#d500f9');
        }, m);
      }
    }
    steer(m, 0, 0, 0, 3, dt);
    if (at > 1.0) ai.cast = 0;
    return at > n * 0.09 + 1.5;
  }
  function dSpiral(G, m, dt, at, ai) {
    const T = m.enraged ? 3.6 : 3.0;
    const arms = m.phase >= 3 ? 6 : m.enraged ? 5 : 4;
    const interval = HQ ? 0.085 : 0.11;
    if (ai.step === 0) { ai.step = 1; ai.rot = Math.random() * TAU; ai.spinDir = Math.random() < 0.5 ? -1 : 1; ai.sfxT = 0; }
    ai.cast = at < T ? 1 : 0;
    steer(m, 0, 0, 0, 4, dt);
    ai.tick -= dt;
    while (ai.tick <= 0 && at < T) {
      ai.tick += interval;
      ai.rot += 0.17 * ai.spinDir;
      if (m.enraged && at > T * 0.5) ai.rot -= 0.34 * ai.spinDir * (ai.n++ % 2);
      for (let k = 0; k < arms; k++) shoot(m, ai.rot + (k * TAU) / arms, SHOT.orb, 'enemy', m.dmg * SHOT.orb.dmgMul);
    }
    ai.sfxT -= dt;
    if (ai.sfxT <= 0 && at < T) { ai.sfxT = 0.3; sfx('spirit', { vol: 0.25, pitch: 0.7 }); }
    return at > T + 0.5;
  }
  function dBlink(G, m, dt, at, ai) {
    const p = G.player;
    const N = m.enraged ? 4 : 3;
    ai.pt += dt;
    m.vx = m.vy = 0;
    if (ai.pp === 0) {
      ai.alpha = max(0, 1 - ai.pt / 0.25);
      if (ai.pt >= 0.25) {
        fxBurst(m.x, m.y, { count: 16, colors: ['#b388ff', '#1a0b2e'], speed: [60, 200], life: [0.3, 0.6], size: [2, 5], glow: true });
        ai.tx = p.x + (p.vx || 0) * 0.2; ai.ty = p.y + (p.vy || 0) * 0.2;
        const a = Math.random() * TAU;
        m.x = ai.tx + cos(a) * 170; m.y = ai.ty + sin(a) * 170;
        worldClamp(m);
        warn(m, ai.tx, ai.ty, 105, 0.6, null, '#d500f9');
        face(m, atan2(ai.ty - m.y, ai.tx - m.x));
        sfx('portal', { vol: 0.4, pitch: 1.3 });
        ai.pp = 1; ai.pt = 0;
      }
    } else if (ai.pp === 1) {
      ai.alpha = min(1, ai.pt / 0.25);
      ai.cast = min(1, ai.pt / 0.6);
      face(m, atan2(ai.ty - m.y, ai.tx - m.x));
      if (ai.pt >= 0.6) {
        const a = atan2(ai.ty - m.y, ai.tx - m.x);
        areaHit(G, m, ai.tx, ai.ty, 105, m.dmg * 1.25, 340);
        fxCall('slash', ai.tx, ai.ty, a, { radius: 120, arc: 2.8, color: '#d500f9', width: 18, life: 0.25 });
        fxCall('slash', ai.tx, ai.ty, a, { radius: 96, arc: 2.4, color: '#ffffff', width: 6, life: 0.2 });
        m.x = lerp(m.x, ai.tx, 0.45); m.y = lerp(m.y, ai.ty, 0.45);
        sfx('slash');
        shake(7, 0.25);
        ai.pp = 2; ai.pt = 0; ai.cast = 0; ai.atk = 1;
      }
    } else if (ai.pt >= 0.18) {
      ai.n++; ai.pp = 0; ai.pt = 0;
      if (ai.n >= N) { ai.alpha = 1; return true; }
    }
    return false;
  }
  function dSpecters(G, m, dt, at, ai) {
    const p = G.player;
    steer(m, 0, 0, 0, 4, dt);
    if (ai.step === 0) { ai.step = 1; ai.cast = 1; sfx('portal', { vol: 0.6 }); }
    if (ai.step === 1 && at > 0.5) {
      ai.step = 2;
      const k = m.enraged ? 6 : 4, off = Math.random() * TAU;
      for (let i = 0; i < k; i++) {
        const a = off + (i / k) * TAU;
        const s = summon(G, 'specter', p.x + cos(a) * 230, p.y + sin(a) * 230);
        if (s) fxCall('beam', s.x, s.y, { color: '#80deea', width: 40, height: 220, life: 0.6 });
      }
    }
    if (at > 1.1) ai.cast = 0;
    return at > 1.3;
  }
  function dEclipse(G, m, dt, at, ai) {
    const p = G.player;
    steer(m, 0, 0, 0, 4, dt);
    ai.cast = 1;
    if (ai.step === 0) {
      ai.step = 1;
      fxCall('flash', '#12001f', 0.5, 0.7);
      sfx('bossRoar');
      shake(10, 0.8);
      for (let w = 0; w < 3; w++) {
        later(0.6 + w * 1.8, () => {
          if (!p || p.dead) return;
          const sp = 150, cx = p.x, cy = p.y;
          const s1x = U.randi(-1, 1), s1y = U.randi(-1, 1);
          const s2x = s1x + (Math.random() < 0.5 ? 1 : -1), s2y = s1y;
          const s3x = s1x, s3y = s1y + (Math.random() < 0.5 ? 1 : -1);
          for (let ix = -4; ix <= 4; ix++) {
            for (let iy = -4; iy <= 4; iy++) {
              if (ix * ix + iy * iy > 14) continue;
              if ((ix === s1x && iy === s1y) || (ix === s2x && iy === s2y) || (ix === s3x && iy === s3y)) continue;
              const x = cx + ix * sp, y = cy + iy * sp;
              warn(m, x, y, 86, 1.1, () => {
                areaHit(G, m, x, y, 86, m.dmg * 1.0, 220);
                fxRing(x, y, { radius: 90, color: '#d500f9', life: 0.35, width: 5 });
                if (HQ && (ix + iy) % 2 === 0) fxBurst(x, y, { count: 5, colors: ['#ea80fc', '#1a0b2e'], speed: [60, 200], life: [0.2, 0.45], size: [2, 4] });
              }, '#aa00ff');
            }
          }
          later(1.1, () => { shake(12, 0.35); sfx('explosion', { vol: 0.7, pitch: 0.6 }); fxCall('flash', '#d500f9', 0.18, 0.25); }, m);
          later(1.4, () => {
            const n = 28, gap = Math.random() * TAU;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * TAU;
              if (abs(U.angleDiff(a, gap)) < 0.55) continue;
              shoot(m, a, SHOT.ring, 'enemy', m.dmg * SHOT.ring.dmgMul);
            }
          }, m);
        }, m);
      }
    }
    return at > 6.2;
  }

  /* ================================================================ boss table */
  const BOSS = {
    abyss_serpent: {
      enterDur: 2.3, cd: 2.0, enter: serpentEnter, move: serpentMove, post: serpentPost, fallback: 'tail',
      attacks: { tail: sTail, rain: sRain, burrow: sBurrow, spit: sSpit },
      weights: { tail: 3, rain: 3, burrow: 2, spit: 2 },
    },
    alpha_wolf: {
      enterDur: 2.4, cd: 1.8, enter: wolfEnter, move: wolfMove, fallback: 'pounce',
      attacks: { pounce: wPounce, howl: wHowl, moon: wMoon, dash: wDash },
      weights: { pounce: 3, howl: 2, moon: 3, dash: 2 },
      can: (G, m, k) => k !== 'howl' || countType(G, 'dire_wolf') < 7,
    },
    orc_tyrant: {
      enterDur: 2.3, cd: 2.0, enter: orcEnter, move: orcMove, fallback: 'slam',
      attacks: { slam: oSlam, spin: oSpin, summon: oSummon, devour: oDevour },
      weights: { slam: 3, spin: 2, summon: 2, devour: 2 },
      can: (G, m, k) => {
        if (k === 'summon') return countType(G, 'orc_warrior') < 6;
        if (k === 'devour') return m.hp < m.maxHp * 0.85 && !!findPrey(G, m, 420);
        return true;
      },
    },
    demon_lord: {
      enterDur: 2.6, cd: 1.9, enter: dlEnter, move: dlMove, fallback: 'meteors',
      attacks: { meteors: dMeteors, spiral: dSpiral, blink: dBlink, specters: dSpecters, eclipse: dEclipse },
      weights: { meteors: 3, spiral: 3, blink: 2, specters: 2, eclipse: 4 },
      can: (G, m, k) => {
        if (k === 'eclipse') return m.phase >= 3 && m.ai.last !== 'eclipse';
        if (k === 'specters') return countType(G, 'specter') < 10;
        return true;
      },
    },
  };

  function spawnBoss(G, typeId) {
    const def = types[typeId];
    if (!G || !def) return null;
    const p = G.player || { x: 0, y: 0 };
    let a = Math.random() * TAU;
    if (hypot(p.x, p.y) > 300) a = atan2(-p.y, -p.x) + rand(-0.6, 0.6); // lean toward the arena centre
    const dist = 270;
    const m = spawn(G, typeId, p.x + cos(a) * dist, p.y + sin(a) * dist, {
      hpMul: G.nightmare ? 1.8 : 1, dmgMul: G.nightmare ? 1.35 : 1,
    });
    if (!m) return null;
    worldClamp(m);
    const ai = m.ai;
    m.boss = true; m.phase = 1; m.enraged = false;
    ai.spawnT = 1; ai.enter = 1; ai.enterT = 0; ai.cd = 1.5; ai.e0 = 0;
    m.facing = atan2(p.y - m.y, p.x - m.x);
    ai.flip = cos(m.facing) < 0 ? -1 : 1;
    if (typeId === 'abyss_serpent') {
      const N = SK.quality === 'low' ? 12 : 16;
      m.segs = [];
      for (let i = 0; i < N; i++) m.segs.push({ x: m.x, y: m.y });
      ai.holeX = m.x; ai.holeY = m.y; ai.emerge = 0; ai.head = m.facing;
    } else if (typeId === 'alpha_wolf') {
      ai.ex = m.x; ai.ey = m.y;
      const far = hypot(SK.W || 800, SK.H || 400) / ((SK.cam && SK.cam.zoom) || 1) * 0.6 + 120;
      ai.sx = p.x + cos(a) * far; ai.sy = p.y + sin(a) * far;
      m.x = ai.sx; m.y = ai.sy;
    } else if (typeId === 'orc_tyrant') {
      ai.h = 700;
    } else if (typeId === 'demon_lord') {
      ai.alpha = 0; ai.portal = 0;
    }
    G.boss = m;
    const A = SK.Audio;
    if (A && A.music) A.music(typeId === 'demon_lord' ? 'finalboss' : 'boss');
    return m;
  }

  /* ================================================================ rendering */
  const NOAI = { alpha: 1, spawnT: 1, flip: 1, mv: 0, gait: 0, atk: 0, wind: 0, tele: 0, flash: 0, hurtT: 0, h: 0, ph: 0, wob: 0, under: 0, emerge: 1, cast: 0, enter: 0 };

  function render(ctx, G) {
    if (!ctx || !G) return;
    HQ = SK.quality !== 'low';
    ZOOM = (SK.cam && SK.cam.zoom) || 1;
    const E = G.enemies || EMPTY_ARR, A = G.allies || EMPTY_ARR;
    const dense = E.length > 170;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (fbWarns.length) drawFallbackWarns(ctx);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < E.length; i++) {
        const m = E[i];
        if (!m || m.dead || m.boss) continue;
        if ((pass === 1) !== !!(m.def && m.def.fly)) continue;
        drawMonster(ctx, m, dense);
      }
    }
    const t = SK.time ? SK.time.gameT : 0;
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (!m || m.dead) continue;
      if (m.ai && m.ai.fainted) drawSoul(ctx, m, G, i, t);
      else drawMonster(ctx, m, false);
    }
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (m && !m.dead && m.boss) drawMonster(ctx, m, false);
    }
    if (falls.length) drawFalls(ctx);
    ctx.restore();
  }

  function pickTint(m, st, t, ai) {
    if (ai.flash > 0.05) return setTint('#ffffff', ai.flash * 0.85);
    if (st.slow > 0) return setTint('#7fd8ff', 0.32);
    if (st.burn > 0) return setTint('#ff6d00', 0.18 + 0.12 * sin(t * 20));
    if (st.poison > 0) return setTint('#76ff03', 0.2);
    if (m.enraged) return setTint('#ff1744', 0.22 + 0.08 * sin(t * 6));
    if (ai.dizzy > 0) return setTint('#fff59d', 0.15);
    return setTint(null, 0);
  }

  function drawMonster(ctx, m, dense) {
    const def = m.def || EMPTY, ai = m.ai || NOAI;
    const r = m.r > 0 ? m.r : 16;
    const isSerp = m.type === 'abyss_serpent' && !!m.segs;
    const lift = ai.h || 0;
    if (!onScreen(m.x, m.y - lift, isSerp ? r * 12 : r * 2.6 + 40)) return;
    const t = (m.t || 0) + (ai.ph || 0);
    const spT = ai.spawnT == null ? 1 : ai.spawnT;
    let alpha = ai.alpha == null ? 1 : ai.alpha;
    if (spT < 1) alpha *= min(1, spT * 2.2);
    DETAIL = HQ && (!dense || m.boss || m.team === 'ally' || m.elite);
    CUR_PX = r * ZOOM;
    const st = m.status || EMPTY;
    const fly = !!def.fly;
    const hover = fly ? r * (0.42 + 0.1 * sin(t * 3.1)) : 0;
    const bx = m.x, by = m.y - hover - lift;

    /* ---- ground layer */
    if (isSerp) drawSerpentGround(ctx, m, t);
    if (m.type === 'demon_lord' && ai.portal > 0) drawPortal(ctx, m, t, ai.portal);
    const hideBody = isSerp && (ai.under > 0.98 || (ai.enter > 0 && ai.emerge <= 0));
    if (alpha > 0.05 && !hideBody) {
      const sk = lift > 0 ? clamp(1 - lift / 700, 0.3, 1) : 1;
      ctx.globalAlpha = 0.3 * (fly ? 0.7 : 1) * (lift > 0 ? 0.5 + 0.5 * (1 - sk) + 0.3 : alpha);
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y + r * (fly ? 0.78 : 0.62), r * (fly ? 0.7 : 0.95) * (def.shadowW || 1) * sk, r * 0.32 * sk, 0, 0, TAU);
      ctx.fill();
    }
    if (m.team === 'ally') drawAllyRing(ctx, m, t, r);
    if (m.elite) wglow(ctx, bx, by, r * 2.4, '#ffd54f', (0.25 + 0.12 * sin(t * 5)) * alpha);
    if (m.boss && m.enraged) wglow(ctx, bx, by, r * 2.6, '#ff1744', (0.22 + 0.1 * sin(t * 4)) * alpha);
    if (ai.lnOn) drawTeleLine(ctx, m, t);
    if (ai.tele > 0 && def.shot && !m.boss) {
      wglow(ctx, bx + cos(m.facing || 0) * r * 0.8, by + sin(m.facing || 0) * r * 0.8, r * (0.8 + ai.tele * 1.2), def.shot.color, 0.4 + ai.tele * 0.5);
    }
    if (isSerp) drawSerpentBody(ctx, m, t, alpha);
    if (alpha <= 0.02 || hideBody) { TL = 0; ctx.globalAlpha = 1; return; }

    /* ---- body */
    const sc0 = spT >= 1 ? 1 : U.ease.outBack(spT);
    const sc = r * sc0 * (isSerp ? 0.6 + 0.4 * ai.emerge : 1);
    if (sc > 0.05) {
      pickTint(m, st, t, ai);
      const hurt = ai.hurtT > 0 ? ai.hurtT / 0.22 : 0;
      const wind = ai.wind || 0, atk = ai.atk || 0;
      let sx = 1 + hurt * 0.16 + wind * 0.1 - atk * 0.05;
      let sy = 1 - hurt * 0.13 - wind * 0.1 + atk * 0.07;
      const br = sin(t * 2.6) * 0.022;
      sy += br; sx -= br * 0.5;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx + (wind > 0.5 ? sin(t * 60) * r * 0.03 * wind : 0), by);
      const orient = def.orient || 'flip';
      if (orient === 'rotate') {
        ctx.rotate(m.facing || 0);
        const str = min(0.22, max(0, (ai.mv || 0) - 0.9) * 0.18);
        sx += str; sy -= str * 0.6;
      } else if (orient === 'flip') {
        ctx.scale(ai.flip || 1, 1);
      }
      ctx.scale(sx * sc, sy * sc);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (typeof def.draw === 'function') def.draw(ctx, m, t);
      else drawFallback(ctx, m, t);
      ctx.restore();
      TL = 0;
    }

    /* ---- overlays */
    if (ai.flash > 0.05) wglow(ctx, bx, by, r * 1.6, '#ffffff', ai.flash * 0.45 * alpha);
    ctx.globalAlpha = alpha;
    if (st.burn > 0) drawBurn(ctx, bx, by, r, t, alpha);
    if (st.poison > 0) drawPoison(ctx, bx, by, r, t, alpha);
    if (st.slow > 0) drawFrost(ctx, bx, by, r, t, alpha);
    if ((st.stun > 0 && !m.boss) || ai.dizzy > 0) drawStun(ctx, bx, by - r * 1.15, r, t, alpha);
    if (m.elite) {
      const pu = 0.5 + 0.5 * sin(t * 5);
      ctx.globalAlpha = alpha * (0.45 + 0.35 * pu);
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 1.5 + pu * 1.5;
      ctx.beginPath(); ctx.arc(bx, by, r * 1.22, 0, TAU); ctx.stroke();
      ctx.globalAlpha = alpha;
      drawCrownIcon(ctx, bx, by - r * 1.5, max(5, r * 0.42), t);
    }
    if (m.passive) drawPassiveMarks(ctx, bx, by, r, t, alpha);
    if (m.team === 'ally') drawAllyLabel(ctx, m, bx, by, r, t, alpha);
    else if (!m.boss && !m.passive && m.hp > 0 && m.hp < m.maxHp) {
      drawHpBar(ctx, bx, by - r * (m.elite ? 2.05 : 1.3) - 6, r, m.hp / m.maxHp, m.elite ? '#ffb300' : '#ff5252', alpha);
    }
    ctx.globalAlpha = 1;
  }

  function drawFallback(ctx, m, t) {
    const col = (m.def && m.def.color) || '#ff80ab';
    oval(ctx, 0, 0, 0.9, 0.85, 0, col);
    oval(ctx, -0.2, -0.3, 0.35, 0.2, -0.4, U.mix(col, '#ffffff', 0.5));
    circle(ctx, 0.3, -0.15, 0.13, '#1a1026');
    circle(ctx, 0.62, -0.15, 0.13, '#1a1026');
  }

  function drawHpBar(ctx, x, y, r, ratio, color, a) {
    const w = clamp(r * 1.8, 18, 70), h = 3.5;
    ratio = clamp(ratio, 0, 1);
    ctx.globalAlpha = 0.85 * a;
    ctx.fillStyle = '#12091c';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * ratio, h);
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 2, y, w * ratio, 1.2);
    ctx.globalAlpha = a;
  }

  function drawAllyRing(ctx, m, t, r) {
    const comp = !!m.companion;
    const col = comp ? '#ff80ab' : '#69f0ae';
    wglow(ctx, m.x, m.y, r * 1.9, comp ? (m.def && m.def.color) || col : col, 0.2 + 0.06 * sin(t * 3));
    const y = m.y + r * 0.62;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(m.x, y, r * 1.05, r * 0.38, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 2.6;
    const a0 = t * 1.5;
    ctx.beginPath(); ctx.ellipse(m.x, y, r * 1.05, r * 0.38, 0, a0, a0 + 0.9); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(m.x, y, r * 1.05, r * 0.38, 0, a0 + PI, a0 + PI + 0.9); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawAllyLabel(ctx, m, bx, by, r, t, a) {
    const def = m.def || EMPTY;
    const name = m.name || def.name || '';
    const y = by - r * 1.3 - 6;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    if (m.evolved && def.allyName && def.allyName !== name) {
      ctx.font = '600 9px sans-serif';
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#0b0614';
      ctx.strokeText(def.allyName, bx, y - 13);
      ctx.fillStyle = '#80cbc4';
      ctx.fillText(def.allyName, bx, y - 13);
    }
    ctx.font = 'bold 12px sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = '#0b0614';
    ctx.strokeText(name, bx, y);
    ctx.fillStyle = m.companion ? '#ffd6f5' : '#b9f6ca';
    ctx.fillText(name, bx, y);
    if (m.hp > 0 && m.hp < m.maxHp) drawHpBar(ctx, bx, y + 2, r, m.hp / m.maxHp, '#69f0ae', a);
  }

  function drawSoul(ctx, m, G, idx, t) {
    const p = G.player, ai = m.ai;
    if (!p) return;
    const a = idx * 1.7 + t * 0.9;
    const x = p.x + cos(a) * 52, y = p.y - 34 + sin(a * 1.3) * 8;
    if (!onScreen(x, y, 30)) return;
    const col = m.companion ? '#ff80ab' : '#69f0ae';
    wglow(ctx, x, y, 18, col, 0.5 + 0.2 * sin(t * 5));
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#e0f2f1';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    const q = 1 - clamp(ai.faintT / 20, 0, 1);
    ctx.beginPath(); ctx.arc(x, y, 9, -HALF_PI, -HALF_PI + TAU * q); ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawTeleLine(ctx, m, t) {
    const ai = m.ai;
    const L = ai.len || 200, w = m.r * 1.3, p = clamp(ai.lnT || 0, 0, 1);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ai.dir || 0);
    ctx.globalAlpha = 0.14 + 0.16 * p;
    ctx.fillStyle = '#ff1744';
    ctx.fillRect(0, -w / 2, L, w);
    ctx.globalAlpha = 0.3 + 0.3 * p;
    ctx.fillRect(0, -w / 2, L * p, w);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ff5252';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -w / 2); ctx.lineTo(L, -w / 2);
    ctx.moveTo(0, w / 2); ctx.lineTo(L, w / 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffcdd2';
    ctx.lineWidth = 2.5;
    const c = w * 0.3;
    for (let k = 0; k < 4; k++) {
      const x = ((k / 4 + t * 1.5) % 1) * (L - c) + c;
      ctx.globalAlpha = 0.6 * sin(((x - c) / (L - c)) * PI);
      ctx.beginPath(); ctx.moveTo(x - c, -c); ctx.lineTo(x, 0); ctx.lineTo(x - c, c); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFallbackWarns(ctx) {
    for (let i = 0; i < fbWarns.length; i++) {
      const w = fbWarns[i];
      const q = clamp(w.t / w.life, 0, 1);
      ctx.globalAlpha = 0.18 + 0.2 * q;
      ctx.fillStyle = w.color;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * q, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFalls(ctx) {
    for (let i = 0; i < falls.length; i++) {
      const f = falls[i];
      const q = clamp(f.t / f.dur, 0, 1), e = q * q;
      const x = f.x - 240 * (1 - e), y = f.y - 520 * (1 - e);
      if (!onScreen(x, y, 80)) continue;
      ctx.globalAlpha = 0.25 + 0.6 * q;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.size * 0.7;
      ctx.beginPath(); ctx.moveTo(x - 0.42 * 70, y - 0.91 * 70); ctx.lineTo(x, y); ctx.stroke();
      wglow(ctx, x, y, f.size * 3, f.color, 0.8);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1a0b2e';
      ctx.beginPath(); ctx.arc(x, y, f.size * 0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ea80fc';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPortal(ctx, m, t, k) {
    const r = m.r, x = m.x, y = m.y + r * 0.55;
    const e = U.ease.outBack(clamp(k, 0, 1));
    const rx = r * 1.7 * e, ry = r * 0.6 * e;
    if (rx < 1) return;
    wglow(ctx, x, y, rx * 1.6, '#7c4dff', 0.7 * k);
    ctx.globalAlpha = 0.9 * k;
    ctx.fillStyle = '#0d0018';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? '#ea80fc' : '#b388ff';
      const s = 1 - i * 0.25, a0 = t * (2 + i) * (i % 2 ? -1 : 1);
      ctx.beginPath(); ctx.ellipse(x, y, rx * s, ry * s, 0, a0, a0 + 2.2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, y, rx * s, ry * s, 0, a0 + PI, a0 + PI + 2.2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- status overlays (world space) */
  function drawBurn(ctx, x, y, r, t, a) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.2 + i / 3) % 1;
      const fx = x + sin(i * 2.3 + t * 3) * r * 0.5, fy = y - r * 0.2 - ph * r;
      const s = r * 0.32 * (1 - ph) + 1;
      ctx.globalAlpha = a * (1 - ph) * 0.85;
      ctx.fillStyle = i === 1 ? '#ffd54f' : '#ff6d00';
      ctx.beginPath();
      ctx.moveTo(fx, fy - s * 1.6);
      ctx.quadraticCurveTo(fx + s, fy, fx, fy + s * 0.6);
      ctx.quadraticCurveTo(fx - s, fy, fx, fy - s * 1.6);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
  }
  function drawPoison(ctx, x, y, r, t, a) {
    ctx.strokeStyle = '#b2ff59';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i / 3) % 1;
      const bx = x + sin(i * 2.1 + t) * r * 0.6, by = y - r * (0.1 + ph * 1.2);
      ctx.globalAlpha = a * (1 - ph) * 0.9;
      ctx.beginPath(); ctx.arc(bx, by, r * 0.1 + 1.5 + ph * 2, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = a;
  }
  function drawFrost(ctx, x, y, r, t, a) {
    wglow(ctx, x, y, r * 1.5, '#4fc3ff', 0.25 * a);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + t * 0.6;
      const cx = x + cos(ang) * r * 1.05, cy = y + sin(ang) * r * 0.75;
      const s = r * 0.16 + 1.5;
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = i % 2 ? '#e1f5fe' : '#81d4fa';
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.4); ctx.lineTo(cx + s * 0.6, cy); ctx.lineTo(cx, cy + s * 1.4); ctx.lineTo(cx - s * 0.6, cy);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = a;
  }
  function drawStun(ctx, x, y, r, t, a) {
    ctx.fillStyle = '#ffee58';
    for (let i = 0; i < 3; i++) {
      const ang = t * 4 + (i / 3) * TAU;
      const sx = x + cos(ang) * r * 0.7, sy = y + sin(ang) * r * 0.22;
      ctx.globalAlpha = a * (0.6 + 0.4 * (sin(ang) * 0.5 + 0.5));
      starPath(ctx, sx, sy, 4 + r * 0.06, 1.8, 5, ang);
      ctx.fill();
    }
    ctx.globalAlpha = a;
  }
  function drawCrownIcon(ctx, x, y, s, t) {
    const b = sin(t * 3) * s * 0.12;
    wglow(ctx, x, y + b, s * 2.4, '#ffd54f', 0.35);
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.moveTo(x - s, y + s * 0.45 + b);
    ctx.lineTo(x - s, y - s * 0.3 + b);
    ctx.lineTo(x - s * 0.5, y + s * 0.08 + b);
    ctx.lineTo(x, y - s * 0.6 + b);
    ctx.lineTo(x + s * 0.5, y + s * 0.08 + b);
    ctx.lineTo(x + s, y - s * 0.3 + b);
    ctx.lineTo(x + s, y + s * 0.45 + b);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff8f00';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ff1744';
    ctx.beginPath(); ctx.arc(x, y + s * 0.15 + b, s * 0.17, 0, TAU); ctx.fill();
  }
  function drawPassiveMarks(ctx, x, y, r, t, a) {
    const bob = sin(t * 3) * 3;
    const qx = x - r * 0.35, qy = y - r * 1.5 - 14 + bob;
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = '#f3e5f5';
    ctx.beginPath(); ctx.arc(x - r * 0.12, y - r * 1.05 + bob * 0.3, 2.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.24, y - r * 1.28 + bob * 0.6, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(qx, qy, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a148c';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', qx, qy + 0.5);
    const ex = x + r * 0.6, ey = y - r * 1.35 - 8 - bob * 0.6;
    const pu = 0.5 + 0.5 * sin(t * 6);
    wglow(ctx, ex, ey, 14 + pu * 5, '#ffd54f', 0.55 * a);
    ctx.globalAlpha = a * (0.7 + 0.3 * pu);
    ctx.fillStyle = '#fff8e1';
    starPath(ctx, ex, ey, 9 + pu * 2, 2.2, 4, t * 1.5);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ff8f00';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('!', ex, ey + 0.5);
  }

  /* ================================================================ creature drawings (unit space, facing +x) */

  /* --- Pipistrello delle Caverne (front view, flip) */
  function drawBat(ctx, m, t) {
    const ai = m.ai || NOAI;
    const dive = ai.st === 'act' ? 1 : 0;
    const fl = sin(t * (dive ? 26 : 17) + (ai.wob || 0));
    ctx.translate(0, fl * 0.07);
    const body = '#3d2c63', bone = '#1a1030';
    for (let s = -1; s <= 1; s += 2) {
      const tipY = -0.3 - 0.85 * fl, midY = -0.05 - 0.4 * fl, elbY = -0.55 - 0.55 * fl;
      ctx.fillStyle = tc(s > 0 ? '#4b3680' : '#2c1d4a');
      ctx.beginPath();
      ctx.moveTo(0.18 * s, -0.28);
      ctx.quadraticCurveTo(0.85 * s, -0.8 - 0.45 * fl, 1.72 * s, tipY);
      ctx.quadraticCurveTo(1.5 * s, tipY + 0.42, 1.3 * s, midY + 0.42);
      ctx.quadraticCurveTo(1.12 * s, midY + 0.18, 0.92 * s, midY + 0.44);
      ctx.quadraticCurveTo(0.72 * s, midY + 0.22, 0.52 * s, midY + 0.46);
      ctx.quadraticCurveTo(0.36 * s, 0.25, 0.2 * s, 0.22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = tc(bone);
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(0.22 * s, -0.24); ctx.lineTo(0.95 * s, elbY); ctx.lineTo(1.7 * s, tipY);
      ctx.moveTo(0.95 * s, elbY); ctx.lineTo(1.3 * s, midY + 0.4);
      ctx.moveTo(0.95 * s, elbY); ctx.lineTo(0.92 * s, midY + 0.42);
      ctx.stroke();
      circle(ctx, 0.95 * s, elbY, 0.05, '#7e57c2');
    }
    oval(ctx, 0, 0.02, 0.42, 0.5, 0, body);
    oval(ctx, 0.06, 0.12, 0.24, 0.3, 0, '#5a4690');
    seg(ctx, -0.1, 0.45, -0.14, 0.6, 0.06, bone);
    seg(ctx, 0.14, 0.45, 0.18, 0.6, 0.06, bone);
    const hx = 0.1, hy = -0.36;
    tri(ctx, hx - 0.3, hy - 0.04, hx - 0.26, hy - 0.64, hx - 0.05, hy - 0.2, body);
    tri(ctx, hx + 0.06, hy - 0.2, hx + 0.3, hy - 0.62, hx + 0.33, hy - 0.03, body);
    tri(ctx, hx - 0.24, hy - 0.12, hx - 0.23, hy - 0.5, hx - 0.1, hy - 0.22, '#8e5bbf');
    tri(ctx, hx + 0.1, hy - 0.22, hx + 0.27, hy - 0.5, hx + 0.27, hy - 0.1, '#8e5bbf');
    circle(ctx, hx, hy, 0.32, body);
    oval(ctx, hx + 0.17, hy + 0.08, 0.13, 0.09, 0, '#5a4690');
    eye(ctx, hx + 0.02, hy - 0.06, 0.075, '#5ef2ff', 0.6);
    eye(ctx, hx + 0.22, hy - 0.06, 0.075, '#5ef2ff', 0.6);
    tri(ctx, hx + 0.1, hy + 0.13, hx + 0.16, hy + 0.13, hx + 0.13, hy + 0.25, '#ffffff');
    tri(ctx, hx + 0.21, hy + 0.13, hx + 0.27, hy + 0.13, hx + 0.24, hy + 0.24, '#ffffff');
  }

  /* --- Ragno di Cristallo (top-down, rotate) */
  const SP_BX = [0.32, 0.14, -0.04, -0.2], SP_BASE = [0.75, 0.25, -0.25, -0.75];
  function drawSpider(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 4; i++) {
        const ph = g + i * PI * 0.5 + (s > 0 ? PI : 0);
        const sw = sin(ph) * 0.32 * (0.25 + mv) + sin(t * 2 + i) * 0.04;
        const a = s * (HALF_PI - SP_BASE[i] - sw);
        const hx = SP_BX[i], hy = s * 0.16;
        const kx = hx + cos(a) * 0.55, ky = hy + sin(a) * 0.55;
        const a2 = a + s * (i < 2 ? -0.35 : 0.35);
        const fx = kx + cos(a2) * 0.62, fy = ky + sin(a2) * 0.62;
        seg(ctx, hx, hy, kx, ky, 0.11, '#3a3158');
        seg(ctx, kx, ky, fx, fy, 0.075, '#1d1830');
        circle(ctx, kx, ky, 0.06 + max(0, cos(ph)) * 0.03 * mv, '#5c4f8a');
      }
    }
    const pulse = 0.55 + 0.45 * sin(t * 3 + (ai.wob || 0));
    oval(ctx, -0.42, 0, 0.58, 0.46, 0, '#2a2442');
    oval(ctx, -0.36, -0.06, 0.42, 0.3, 0, '#3a3260');
    ug(ctx, -0.45, 0, 1.0, '#3de0ff', 0.22 + 0.25 * pulse);
    shard(ctx, -0.25, 0, 0.45, 0.14, PI + 0.15, '#b8fbff', '#36c5e0');
    shard(ctx, -0.45, 0.12, 0.42, 0.12, PI - 0.6, '#9ff7ff', '#2aa9c9');
    shard(ctx, -0.45, -0.12, 0.42, 0.12, PI + 0.6, '#9ff7ff', '#2aa9c9');
    shard(ctx, -0.6, 0, 0.32, 0.1, PI, '#e0fdff', '#5ef2ff');
    oval(ctx, 0.3, 0, 0.3, 0.26, 0, '#2f2848');
    oval(ctx, 0.25, -0.06, 0.18, 0.12, 0, '#463c6e');
    const bite = ai.atk || 0;
    seg(ctx, 0.55, 0.08, 0.72, 0.06 - bite * 0.05, 0.07, '#5ef2ff');
    seg(ctx, 0.55, -0.08, 0.72, -0.06 + bite * 0.05, 0.07, '#5ef2ff');
    eye(ctx, 0.5, 0.07, 0.05, '#ff4081', 0.4);
    eye(ctx, 0.5, -0.07, 0.05, '#ff4081', 0.4);
    circle(ctx, 0.43, 0.15, 0.035, '#ff80ab');
    circle(ctx, 0.43, -0.15, 0.035, '#ff80ab');
  }

  /* --- Slime Selvatico (delegates to SK.Slime) */
  const SL_PROXY = { x: 0, y: 0, r: 1, vx: 0, vy: 0, id: 0, hurtT: 0, facing: 0, stage: 0 };
  const SL_OPTS = { palette: 'wild', t: 0, facing: 0, flash: 0, shadow: false, expression: 'idle', alpha: 1, crown: false, scale: 1 };
  function drawWildSlime(ctx, m, t) {
    const SL = SK.Slime;
    const ai = m.ai || NOAI;
    const ally = m.team === 'ally' || m.evolved;
    if (SL && typeof SL.render === 'function') {
      SL_PROXY.vx = m.vx || 0; SL_PROXY.vy = m.vy || 0; SL_PROXY.id = m.id || 0;
      SL_PROXY.hurtT = ai.hurtT > 0 ? ai.hurtT : 0; SL_PROXY.facing = m.facing || 0;
      SL_OPTS.palette = ally ? 'ally' : 'wild';
      SL_OPTS.t = t;
      SL_OPTS.facing = m.facing || 0;
      SL_OPTS.flash = ai.flash || 0;
      SL_OPTS.expression = ai.hurtT > 0 ? 'hurt' : m.passive || ally ? 'happy' : 'angry';
      SL_OPTS.crown = !!m.evolved;
      SL.render(ctx, SL_PROXY, SL_OPTS);
      return;
    }
    const col = ally ? '#4fc3ff' : '#66d17a';
    const hop = abs(sin(t * 5.6)) * 0.12;
    ctx.translate(0, -hop);
    ctx.fillStyle = tc(col);
    ctx.beginPath();
    ctx.moveTo(-0.95, 0.55);
    ctx.quadraticCurveTo(-1.0, -0.85, 0, -0.9);
    ctx.quadraticCurveTo(1.0, -0.85, 0.95, 0.55);
    ctx.quadraticCurveTo(0, 0.8, -0.95, 0.55);
    ctx.fill();
    oval(ctx, -0.35, -0.45, 0.25, 0.14, -0.5, '#e8ffe8');
    circle(ctx, 0.15, -0.15, 0.12, '#14301a');
    circle(ctx, 0.5, -0.15, 0.12, '#14301a');
  }

  /* --- Granchio di Roccia (top-down, rotate) */
  function finger(ctx, x, y, ang, len, w, col) {
    const c = cos(ang), s = sin(ang);
    ctx.fillStyle = tc(col);
    ctx.beginPath();
    ctx.moveTo(x - s * w, y + c * w);
    ctx.quadraticCurveTo(x + c * len * 0.6 - s * w * 1.4, y + s * len * 0.6 + c * w * 1.4, x + c * len, y + s * len);
    ctx.lineTo(x + s * w, y - c * w);
    ctx.closePath();
    ctx.fill();
  }
  function drawCrab(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const shell = '#6a5f78', shellD = '#463d52', shellL = '#8a7f9a', claw = '#7a6d88';
    for (let s = -1; s <= 1; s += 2) {
      for (let i = 0; i < 3; i++) {
        const hx = -0.28 + i * 0.22, hy = s * 0.42;
        const a = s * (HALF_PI + (1 - i) * 0.35) + sin(g * 1.4 + i * 2 + (s > 0 ? PI : 0)) * 0.25 * (0.3 + mv);
        const kx = hx + cos(a) * 0.4, ky = hy + sin(a) * 0.4;
        const fx = kx + cos(a + s * 0.5) * 0.36, fy = ky + sin(a + s * 0.5) * 0.36;
        seg(ctx, hx, hy, kx, ky, 0.11, shellD);
        seg(ctx, kx, ky, fx, fy, 0.075, shellD);
      }
    }
    const snap = (ai.atk || 0) > 0 ? abs(sin(t * 32)) : 0.5 + 0.5 * sin(t * 4 + (ai.wob || 0));
    const open = 0.12 + snap * 0.4 + (ai.wind || 0) * 0.35;
    for (let s = -1; s <= 1; s += 2) {
      seg(ctx, 0.3, s * 0.4, 0.62, s * 0.62, 0.17, shellD);
      oval(ctx, 0.82, s * 0.64, 0.25, 0.18, s * 0.3, claw);
      oval(ctx, 0.78, s * 0.58, 0.14, 0.08, s * 0.3, shellL);
      finger(ctx, 0.98, s * 0.68, s * (0.25 + open * 0.5), 0.36, 0.08, claw);
      finger(ctx, 0.98, s * 0.6, s * (0.25 - open * 0.6), 0.3, 0.065, shellL);
    }
    oval(ctx, 0, 0, 0.56, 0.74, 0, shell);
    oval(ctx, -0.05, -0.08, 0.42, 0.56, 0, shellL);
    oval(ctx, 0.0, 0.05, 0.36, 0.48, 0, shell);
    ctx.strokeStyle = tc(shellD);
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(-0.35, 0, 0.6, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.65, 0, 0.6, -0.7, 0.7); ctx.stroke();
    circle(ctx, -0.2, 0.3, 0.09, '#36c2a8');
    circle(ctx, 0.12, -0.38, 0.07, '#36c2a8');
    circle(ctx, -0.3, -0.25, 0.06, '#2a9d88');
    ug(ctx, -0.15, 0, 0.6, '#36e0c8', 0.25);
    shard(ctx, -0.1, 0.05, 0.3, 0.1, PI - 0.3, '#b2fff2', '#36c2a8');
    shard(ctx, -0.18, -0.12, 0.26, 0.09, PI + 0.4, '#b2fff2', '#2a9d88');
    seg(ctx, 0.45, 0.14, 0.64, 0.2, 0.05, shellD);
    seg(ctx, 0.45, -0.14, 0.64, -0.2, 0.05, shellD);
    circle(ctx, 0.66, 0.21, 0.07, '#120c18');
    circle(ctx, 0.66, -0.21, 0.07, '#120c18');
    circle(ctx, 0.68, 0.19, 0.025, '#80ffea');
    circle(ctx, 0.68, -0.23, 0.025, '#80ffea');
  }

  /* --- Serpe Nera degli Abissi */
  function drawSerpentSeg(ctx, i, N, t, m) {
    const pulse = 0.5 + 0.5 * sin(t * 4 - i * 0.55);
    if (i === N - 1) {
      tri(ctx, -0.4, -0.45, -1.9, 0, -0.4, 0.45, '#2a1d4a');
      tri(ctx, -0.6, -0.2, -1.7, 0, -0.6, 0.2, '#6a3fd1');
      ug(ctx, -1.2, 0, 0.8, '#7c4dff', 0.3 * pulse);
    }
    if (i % 3 === 1) {
      tri(ctx, 0.1, 0.7, -0.5, 1.25, -0.3, 0.6, '#4527a0');
      tri(ctx, 0.1, -0.7, -0.5, -1.25, -0.3, -0.6, '#4527a0');
    }
    oval(ctx, 0, 0, 1.05, 0.9, 0, '#1a1230');
    oval(ctx, -0.05, 0, 0.82, 0.6, 0, '#2a1d4a');
    ctx.strokeStyle = tc('#3d2b6b');
    ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.arc(-0.25, 0, 0.75, -1.0, 1.0); ctx.stroke();
    ctx.fillStyle = tc('#6a3fd1');
    ctx.beginPath();
    ctx.moveTo(0.35, 0); ctx.lineTo(-0.55, -0.22); ctx.lineTo(-0.4, 0); ctx.lineTo(-0.55, 0.22);
    ctx.closePath(); ctx.fill();
    ug(ctx, 0, 0, 1.1, m.enraged ? '#ff1744' : '#7c4dff', 0.16 + 0.3 * pulse);
    circle(ctx, -0.05, 0, 0.08 + 0.04 * pulse, '#d1b3ff');
  }
  function drawSerpentGround(ctx, m, t) {
    const ai = m.ai, r = m.r;
    if (ai.enter > 0 && ai.emerge < 1) {
      const hx = ai.holeX, hy = ai.holeY;
      const k = ai.enterT < 1 ? ai.enterT : 1;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#07040c';
      ctx.beginPath(); ctx.ellipse(hx, hy, r * 1.3 * k, r * 0.75 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7c4dff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * k;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + 0.3;
        const l1 = r * 1.2 * k, l2 = r * (1.9 + 0.3 * sin(i * 3.1)) * k;
        ctx.beginPath();
        ctx.moveTo(hx + cos(a) * l1, hy + sin(a) * l1 * 0.6);
        ctx.lineTo(hx + cos(a + 0.12) * (l1 + l2) * 0.5, hy + sin(a + 0.12) * (l1 + l2) * 0.3);
        ctx.lineTo(hx + cos(a) * l2, hy + sin(a) * l2 * 0.6);
        ctx.stroke();
      }
      wglow(ctx, hx, hy, r * 2, '#7c4dff', 0.35 * k);
    }
    if (ai.under > 0.3) {
      const k = ai.under;
      ctx.globalAlpha = 0.9 * k;
      ctx.fillStyle = '#3a2f45';
      ctx.beginPath(); ctx.ellipse(m.x, m.y, r * 0.95, r * 0.55, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#56486a';
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + t * 3;
        ctx.beginPath();
        ctx.arc(m.x + cos(a) * r * 0.55, m.y + sin(a) * r * 0.3 - abs(sin(t * 9 + i)) * 5, r * 0.12, 0, TAU);
        ctx.fill();
      }
      wglow(ctx, m.x, m.y, r * 1.4, '#7c4dff', 0.3 * k);
    }
    ctx.globalAlpha = 1;
  }
  function drawSerpentBody(ctx, m, t, alpha) {
    const segs = m.segs, ai = m.ai;
    const N = segs.length;
    const vis = ai.enter > 0 && ai.emerge < 1 ? floor(ai.emerge * N) : N;
    const al = alpha * (1 - (ai.under || 0));
    if (al <= 0.02 || vis <= 0) return;
    pickTint(m, m.status || EMPTY, t, ai);
    for (let i = N - 1; i >= 0; i--) {
      if (i >= vis) continue;
      const s = segs[i];
      const rr = serpentSegR(m, i, N);
      if (!onScreen(s.x, s.y, rr * 2.2)) continue;
      ctx.globalAlpha = 0.25 * al;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(s.x, s.y + rr * 0.55, rr * 0.95, rr * 0.4, 0, 0, TAU); ctx.fill();
    }
    for (let i = N - 1; i >= 0; i--) {
      if (i >= vis) continue;
      const s = segs[i];
      const prev = i === 0 ? m : segs[i - 1];
      const rr = serpentSegR(m, i, N);
      if (!onScreen(s.x, s.y, rr * 2.2)) continue;
      ctx.save();
      ctx.globalAlpha = al;
      ctx.translate(s.x, s.y);
      ctx.rotate(atan2(prev.y - s.y, prev.x - s.x));
      ctx.scale(rr, rr);
      CUR_PX = rr * ZOOM;
      drawSerpentSeg(ctx, i, N, t, m);
      ctx.restore();
    }
    TL = 0;
    CUR_PX = m.r * ZOOM;
    ctx.globalAlpha = 1;
  }
  function drawSerpentHead(ctx, m, t) {
    const ai = m.ai || NOAI;
    const open = clamp(max(ai.atk || 0, ai.cast || 0) * 0.6 + (ai.tele || 0) * 0.5, 0, 1);
    const fw = sin(t * 3) * 0.06;
    for (let s = -1; s <= 1; s += 2) {
      ctx.globalAlpha *= 0.9;
      tri(ctx, -0.1, s * 0.42, -0.85, s * (1.1 + fw), -0.55, s * 0.35, '#4527a0');
      seg(ctx, -0.15, s * 0.42, -0.7, s * (0.95 + fw), 0.04, '#7c4dff');
      ctx.globalAlpha /= 0.9;
    }
    if (open > 0.05) {
      oval(ctx, 0.35, 0, 0.7, 0.18 + open * 0.42, 0, '#2a0014');
      ug(ctx, 0.5, 0, 0.9, '#e040fb', open * 0.8);
      circle(ctx, 0.55, 0, 0.12 * open, '#ffb3ff');
    }
    for (let s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(-0.25, 0);
      ctx.rotate(s * open * 0.4);
      ctx.translate(0.25, 0);
      ctx.fillStyle = tc('#24183f');
      ctx.beginPath();
      ctx.moveTo(1.2, 0);
      ctx.quadraticCurveTo(0.95, s * 0.5, 0.35, s * 0.7);
      ctx.quadraticCurveTo(-0.25, s * 0.8, -0.5, s * 0.36);
      ctx.lineTo(-0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = tc('#3a2868');
      ctx.beginPath();
      ctx.moveTo(0.95, s * 0.04);
      ctx.quadraticCurveTo(0.6, s * 0.36, 0.0, s * 0.45);
      ctx.lineTo(-0.3, s * 0.1);
      ctx.closePath();
      ctx.fill();
      if (open > 0.1) {
        for (let k = 0; k < 4; k++) {
          const x = 0.95 - k * 0.22;
          tri(ctx, x, s * 0.02, x - 0.1, s * 0.02, x - 0.05, -s * 0.12, '#f3e5f5');
        }
      }
      ctx.fillStyle = tc('#d1c4e9');
      ctx.beginPath();
      ctx.moveTo(-0.2, s * 0.38);
      ctx.quadraticCurveTo(-0.65, s * 0.75, -1.15, s * 0.95);
      ctx.quadraticCurveTo(-0.7, s * 0.55, -0.4, s * 0.2);
      ctx.closePath();
      ctx.fill();
      tri(ctx, -0.85, s * 0.78, -1.15, s * 0.95, -0.95, s * 0.7, '#5e35b1');
      oval(ctx, 0.45, s * 0.4, 0.15, 0.075, s * 0.3, '#e040fb');
      ug(ctx, 0.45, s * 0.4, 0.45, m.enraged ? '#ff1744' : '#e040fb', 0.7);
      oval(ctx, 0.47, s * 0.4, 0.03, 0.06, s * 0.3, '#12001a');
      circle(ctx, 1.0, s * 0.12, 0.035, '#0d0818');
      ctx.restore();
    }
    for (let k = 0; k < 3; k++) tri(ctx, 0.1 - k * 0.22, -0.06, -0.12 - k * 0.22, 0, 0.1 - k * 0.22, 0.06, '#7c4dff');
  }

  /* --- Lupi (side view, flip) */
  const WOLF_PAL = { fur: '#56607a', dark: '#363d52', belly: '#8a93a8', eye: '#ffd740', mark: null, mane: false, storm: false };
  const STORM_PAL = { fur: '#b8d4f0', dark: '#6f8fb8', belly: '#e3f2fd', eye: '#40c4ff', mark: null, mane: true, storm: true };
  const ALPHA_PAL = { fur: '#2c2433', dark: '#17121d', belly: '#4a3d52', eye: '#ff1744', mark: '#ff1744', mane: true, storm: false };
  function wolfLeg(ctx, hx, ph, mv, col, w) {
    const sw = sin(ph) * 0.32 * mv;
    const lift = max(0, -cos(ph)) * 0.16 * mv;
    const kx = hx + sw * 0.5, ky = 0.42 - lift * 0.5;
    const fx = hx + sw, fy = 0.78 - lift;
    seg(ctx, hx, 0.12, kx, ky, w, col);
    seg(ctx, kx, ky, fx, fy, w * 0.8, col);
    oval(ctx, fx + 0.05, fy + 0.02, 0.09, 0.05, 0, col);
  }
  function drawWolf(ctx, m, t, P) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1.2, ai.mv || 0);
    const run = mv > 0.15 ? 1 : 0;
    const wind = ai.wind || 0, act = ai.st === 'act' || (ai.cmul || 1) > 1.2 ? 1 : 0;
    const cast = ai.cast || 0;
    const bob = sin(g * 2) * 0.05 * mv;
    ctx.translate(0, wind * 0.14 + bob);
    if (cast > 0) { ctx.translate(-0.4, 0.6); ctx.rotate(-0.45 * cast); ctx.translate(0.4, -0.6); }
    const tw = sin(t * (run ? 14 : 5)) * (0.12 + 0.1 * run);
    ctx.fillStyle = tc(P.dark);
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.22);
    ctx.quadraticCurveTo(-1.0, -0.5 + tw, -1.35, -0.4 + tw - act * 0.1);
    ctx.quadraticCurveTo(-1.0, -0.1 + tw * 0.5, -0.6, 0.06);
    ctx.closePath();
    ctx.fill();
    if (P.storm) ug(ctx, -1.2, -0.35 + tw, 0.4, '#80d8ff', 0.5);
    wolfLeg(ctx, 0.47, g + 0.6, mv, P.dark, 0.15);
    wolfLeg(ctx, -0.37, g + PI + 0.6, mv, P.dark, 0.16);
    oval(ctx, 0, 0.04, 0.72, 0.36, -0.04, P.fur);
    oval(ctx, 0.05, 0.2, 0.5, 0.15, 0, P.belly);
    oval(ctx, -0.08, -0.18, 0.55, 0.13, 0, P.dark);
    if (wind > 0.1 || act) {
      for (let k = 0; k < 5; k++) {
        const x = -0.4 + k * 0.18;
        tri(ctx, x - 0.08, -0.26, x + 0.02, -0.46 - wind * 0.08, x + 0.08, -0.26, P.dark);
      }
    }
    if (P.storm && DETAIL) {
      ctx.strokeStyle = tc('#e1f5fe');
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(-0.45, -0.2); ctx.lineTo(-0.3, 0.05); ctx.lineTo(-0.38, 0.08); ctx.lineTo(-0.22, 0.28);
      ctx.moveTo(0.05, -0.25); ctx.lineTo(0.18, 0); ctx.lineTo(0.1, 0.03); ctx.lineTo(0.25, 0.22);
      ctx.stroke();
      ug(ctx, 0, 0, 1.3, '#40c4ff', 0.25 + 0.15 * sin(t * 9));
    }
    if (P.mark) {
      ctx.strokeStyle = tc(P.mark);
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(0.1, -0.02, 0.2, -2.2, 0.9); ctx.stroke();
      ug(ctx, 0.1, -0.02, 0.5, P.mark, 0.45 + 0.2 * sin(t * 3));
    }
    wolfLeg(ctx, 0.42, g, mv, P.fur, 0.16);
    wolfLeg(ctx, -0.42, g + PI, mv, P.fur, 0.17);
    const hx = 0.78, hy = -0.28 + act * 0.1 - wind * 0.05 - cast * 0.15;
    oval(ctx, 0.55, -0.12, 0.28, 0.26, -0.6, P.fur);
    if (P.mane) {
      for (let k = 0; k < 6; k++) {
        const a = -2.6 + k * 0.42;
        const bx = 0.5 + cos(a) * 0.22, by = -0.15 + sin(a) * 0.22;
        tri(ctx, bx - 0.07, by, 0.5 + cos(a) * 0.48, -0.15 + sin(a) * 0.45, bx + 0.07, by + 0.04, P.dark);
      }
    }
    tri(ctx, hx - 0.05, hy - 0.12, hx - 0.18, hy - 0.5, hx + 0.02, hy - 0.2, P.dark);
    oval(ctx, hx, hy, 0.27, 0.23, 0, P.fur);
    tri(ctx, hx - 0.1, hy - 0.15, hx - 0.05, hy - 0.5, hx + 0.1, hy - 0.16, P.fur);
    tri(ctx, hx - 0.06, hy - 0.18, hx - 0.04, hy - 0.4, hx + 0.05, hy - 0.18, '#c48b9f');
    const open = clamp((ai.atk || 0) * 0.5 + act * 0.35 + cast * 0.45, 0, 0.7);
    ctx.save();
    ctx.translate(hx + 0.08, hy + 0.08);
    ctx.rotate(open * 0.6);
    ctx.fillStyle = tc(P.dark);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.38, 0.02); ctx.lineTo(0.34, 0.1); ctx.lineTo(0, 0.12); ctx.closePath(); ctx.fill();
    if (open > 0.1) tri(ctx, 0.22, 0.0, 0.27, 0.0, 0.25, -0.08, '#ffffff');
    ctx.restore();
    ctx.fillStyle = tc(P.fur);
    ctx.beginPath();
    ctx.moveTo(hx + 0.1, hy - 0.1); ctx.lineTo(hx + 0.5, hy + 0.02); ctx.lineTo(hx + 0.46, hy + 0.1); ctx.lineTo(hx + 0.08, hy + 0.12);
    ctx.closePath(); ctx.fill();
    if (open > 0.1) tri(ctx, hx + 0.3, hy + 0.08, hx + 0.35, hy + 0.08, hx + 0.32, hy + 0.18, '#ffffff');
    circle(ctx, hx + 0.49, hy + 0.03, 0.05, '#111111');
    eye(ctx, hx + 0.1, hy - 0.05, 0.055, P.eye, 0.7);
  }
  function drawDireWolf(ctx, m, t) { drawWolf(ctx, m, t, m.evolved ? STORM_PAL : WOLF_PAL); }
  function drawAlphaWolf(ctx, m, t) {
    const ai = m.ai || NOAI;
    ug(ctx, 0, 0, 1.8, '#ff1744', 0.18 + (ai.tele || 0) * 0.5);
    drawWolf(ctx, m, t, ALPHA_PAL);
    if (DETAIL) {
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (0.5 + 0.3 * sin(t * 2));
      ctx.strokeStyle = tc('#ff8a80');
      ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.arc(-0.3, -0.05, 0.12, -2.5, 0.6); ctx.stroke();
      ctx.globalAlpha = pa;
    }
  }

  /* --- Goblin (flip) */
  function drawGoblin(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0), evo = !!m.evolved;
    const skin = evo ? '#4f9a3a' : '#6dbb4c', skinD = evo ? '#3a7a2a' : '#4e9636';
    const step = sin(g);
    ctx.translate(0, -abs(step) * 0.07 * mv);
    seg(ctx, -0.12, 0.38, -0.18 + step * 0.14 * mv, 0.6, 0.11, skinD);
    seg(ctx, 0.12, 0.38, 0.16 - step * 0.14 * mv, 0.6, 0.11, skinD);
    oval(ctx, -0.16 + step * 0.14 * mv, 0.64, 0.15, 0.08, 0, '#3e2b1c');
    oval(ctx, 0.2 - step * 0.14 * mv, 0.64, 0.15, 0.08, 0, '#3e2b1c');
    seg(ctx, -0.25, 0.0, -0.42, 0.22 + step * 0.05, 0.1, skinD);
    ctx.fillStyle = tc('#6d4c2f');
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.04); ctx.lineTo(0.3, -0.04); ctx.lineTo(0.4, 0.42);
    ctx.lineTo(0.25, 0.36); ctx.lineTo(0.12, 0.45); ctx.lineTo(0, 0.37); ctx.lineTo(-0.14, 0.46); ctx.lineTo(-0.27, 0.37); ctx.lineTo(-0.4, 0.42);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc('#2b1d12');
    ctx.fillRect(-0.36, 0.16, 0.72, 0.08);
    circle(ctx, 0.08, 0.2, 0.05, '#ffca28');
    if (evo) {
      oval(ctx, 0.02, 0.06, 0.26, 0.16, 0, '#8d99a6');
      oval(ctx, -0.04, 0.02, 0.14, 0.06, 0, '#cfd8dc');
      oval(ctx, -0.26, -0.04, 0.14, 0.1, 0, '#78909c');
    }
    const hx = 0.06, hy = -0.4;
    const ew = sin(t * 3 + (ai.wob || 0)) * 0.05;
    tri(ctx, hx - 0.3, hy - 0.08, hx - 0.88, hy - 0.3 + ew, hx - 0.3, hy + 0.12, skin);
    tri(ctx, hx - 0.34, hy - 0.02, hx - 0.74, hy - 0.22 + ew, hx - 0.34, hy + 0.07, '#a5d67a');
    tri(ctx, hx + 0.3, hy - 0.08, hx + 0.84, hy - 0.34 - ew, hx + 0.3, hy + 0.12, skin);
    tri(ctx, hx + 0.34, hy - 0.02, hx + 0.7, hy - 0.26 - ew, hx + 0.34, hy + 0.07, '#a5d67a');
    circle(ctx, hx, hy, 0.4, skin);
    oval(ctx, hx + 0.02, hy + 0.2, 0.3, 0.14, 0, skinD);
    if (evo) {
      ctx.fillStyle = tc('#d32f2f');
      ctx.fillRect(hx - 0.38, hy - 0.24, 0.76, 0.09);
      tri(ctx, hx - 0.36, hy - 0.22, hx - 0.68, hy - 0.08 + sin(t * 8) * 0.06, hx - 0.36, hy - 0.14, '#b71c1c');
    }
    oval(ctx, hx + 0.02, hy - 0.04, 0.1, 0.085, 0, '#ffeb3b');
    oval(ctx, hx + 0.24, hy - 0.04, 0.1, 0.085, 0, '#ffeb3b');
    circle(ctx, hx + 0.06, hy - 0.03, 0.045, '#1a1a1a');
    circle(ctx, hx + 0.28, hy - 0.03, 0.045, '#1a1a1a');
    seg(ctx, hx - 0.08, hy - 0.16, hx + 0.1, hy - 0.11, 0.045, skinD);
    seg(ctx, hx + 0.16, hy - 0.11, hx + 0.34, hy - 0.17, 0.045, skinD);
    ctx.fillStyle = tc(skinD);
    ctx.beginPath(); ctx.moveTo(hx + 0.14, hy + 0.0); ctx.quadraticCurveTo(hx + 0.5, hy + 0.06, hx + 0.36, hy + 0.17); ctx.lineTo(hx + 0.16, hy + 0.12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = tc('#2a1a10');
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(hx + 0.1, hy + 0.12, 0.16, 0.3, 2.4); ctx.stroke();
    tri(ctx, hx + 0.16, hy + 0.25, hx + 0.21, hy + 0.25, hx + 0.19, hy + 0.17, '#fff8e1');
    const sw = -0.55 + 1.5 * (ai.atk || 0) - (ai.wind || 0) * 0.9 + sin(t * 2.5) * 0.1;
    ctx.save();
    ctx.translate(0.28, 0.02);
    ctx.rotate(sw);
    seg(ctx, 0, 0, 0.22, 0, 0.11, skin);
    circle(ctx, 0.24, 0, 0.08, skin);
    seg(ctx, 0.24, 0.12, 0.24, -0.25, 0.08, '#6d4c41');
    oval(ctx, 0.24, -0.5, 0.14, 0.3, 0, evo ? '#5d4037' : '#8d6e63');
    oval(ctx, 0.2, -0.56, 0.05, 0.14, 0, evo ? '#795548' : '#a1887f');
    const stud = evo ? '#cfd8dc' : '#4e342e';
    circle(ctx, 0.36, -0.45, 0.04, stud);
    circle(ctx, 0.12, -0.6, 0.04, stud);
    circle(ctx, 0.34, -0.68, 0.04, stud);
    ctx.restore();
  }

  /* --- Calabrone Assassino (top-down, rotate) */
  function drawHornet(ctx, m, t) {
    const ai = m.ai || NOAI;
    const dive = ai.st === 'act' ? 1 : 0, wind = ai.wind || 0;
    seg(ctx, 0.15, 0.15, 0.3, 0.32, 0.04, '#1a1208');
    seg(ctx, 0.05, -0.15, 0.2, -0.32, 0.04, '#1a1208');
    seg(ctx, -0.02, 0.18, -0.1, 0.36, 0.04, '#1a1208');
    oval(ctx, -0.5, 0, 0.55, 0.3, 0, '#ffb300');
    for (let k = 0; k < 3; k++) oval(ctx, -0.25 - k * 0.22, 0, 0.065, 0.28 * (1 - k * 0.2), 0, '#1a1208');
    oval(ctx, -0.45, -0.1, 0.3, 0.08, 0, '#ffe082');
    const sl = 1.38 + dive * 0.12 + wind * 0.08;
    tri(ctx, -0.98, -0.07, -sl, 0, -0.98, 0.07, '#2b1d0e');
    if (dive || wind > 0) ug(ctx, -sl + 0.08, 0, 0.35, '#ff5252', 0.6 * max(dive, wind));
    oval(ctx, 0.1, 0, 0.27, 0.24, 0, '#2a1c0c');
    oval(ctx, 0.12, 0, 0.1, 0.16, 0, '#ffca28');
    oval(ctx, 0.42, 0, 0.19, 0.21, 0, '#ffc107');
    oval(ctx, 0.47, 0.12, 0.09, 0.07, 0.3, '#b71c1c');
    oval(ctx, 0.47, -0.12, 0.09, 0.07, -0.3, '#b71c1c');
    circle(ctx, 0.5, 0.1, 0.025, '#ffcdd2');
    circle(ctx, 0.5, -0.14, 0.025, '#ffcdd2');
    const mb = (ai.atk || 0) * 0.05;
    seg(ctx, 0.58, 0.06, 0.7, 0.02 - mb, 0.04, '#1a1208');
    seg(ctx, 0.58, -0.06, 0.7, -0.02 + mb, 0.04, '#1a1208');
    seg(ctx, 0.52, 0.05, 0.78, 0.2, 0.025, '#1a1208');
    seg(ctx, 0.52, -0.05, 0.78, -0.2, 0.025, '#1a1208');
    const fl = sin(t * 70);
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * 0.42;
    for (let s = -1; s <= 1; s += 2) {
      oval(ctx, 0.0, s * 0.42, 0.42, 0.16, s * (0.35 + fl * 0.25), '#d6f5ff');
      oval(ctx, -0.15, s * 0.36, 0.3, 0.12, s * (0.6 + fl * 0.2), '#e8fbff');
    }
    if (DETAIL) {
      ctx.globalAlpha = pa * 0.18;
      for (let s = -1; s <= 1; s += 2) oval(ctx, 0.0, s * 0.42, 0.42, 0.16, s * (0.35 - fl * 0.25), '#ffffff');
    }
    ctx.globalAlpha = pa;
  }

  /* --- Treant Antico (flip) */
  function treantArm(ctx, s, sway, lift, front) {
    const bark = front ? '#5d4232' : '#4a3427';
    const sx = 0.42 * s, sy = -0.3;
    const ex = 0.98 * s, ey = -0.55 + lift + sway * s;
    seg(ctx, sx, sy, ex, ey, 0.17, bark);
    seg(ctx, (sx + ex) * 0.55, (sy + ey) * 0.5, (sx + ex) * 0.6, ey - 0.35, 0.08, bark);
    for (let k = -1; k <= 1; k++) seg(ctx, ex, ey, ex + 0.2 * s, ey + k * 0.14 + 0.05, 0.05, bark);
    circle(ctx, ex + 0.06 * s, ey - 0.14, 0.2, front ? '#43a047' : '#2e7d32');
    circle(ctx, (sx + ex) * 0.6 - 0.05 * s, ey - 0.38, 0.15, front ? '#66bb6a' : '#388e3c');
  }
  function drawTreant(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const sway = sin(t * 1.3 + (ai.wob || 0)) * 0.07;
    const lift = -(ai.wind || 0) * 0.45 + (ai.atk || 0) * 0.3;
    for (let k = -1; k <= 1; k++) {
      const st = sin(g + k * 2) * 0.06 * mv;
      seg(ctx, k * 0.3, 0.55, k * 0.52 + st, 0.86, 0.15, '#3b2a20');
      seg(ctx, k * 0.52 + st, 0.86, k * 0.68 + st, 0.84, 0.08, '#3b2a20');
    }
    treantArm(ctx, -1, sway, lift, false);
    ctx.fillStyle = tc('#5d4232');
    ctx.beginPath();
    ctx.moveTo(-0.56, 0.78);
    ctx.quadraticCurveTo(-0.36, 0.1, -0.48, -0.55);
    ctx.quadraticCurveTo(-0.2, -0.86 + sway * 0.5, 0.05, -0.8);
    ctx.quadraticCurveTo(0.4, -0.86, 0.48, -0.55);
    ctx.quadraticCurveTo(0.38, 0.1, 0.56, 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = tc('#3e2a1f');
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.3, 0.7); ctx.quadraticCurveTo(-0.2, 0.3, -0.32, 0.0);
    ctx.moveTo(0.28, 0.72); ctx.quadraticCurveTo(0.36, 0.4, 0.26, 0.15);
    ctx.moveTo(0.02, 0.75); ctx.quadraticCurveTo(-0.05, 0.5, 0.05, 0.3);
    ctx.stroke();
    ctx.strokeStyle = tc('#7a5a44');
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(-0.46, 0.6); ctx.quadraticCurveTo(-0.3, 0.1, -0.42, -0.5); ctx.stroke();
    oval(ctx, -0.25, 0.42, 0.12, 0.07, 0.3, '#33691e');
    oval(ctx, 0.3, -0.05, 0.1, 0.06, -0.3, '#33691e');
    oval(ctx, 0.02, -0.35, 0.12, 0.09, 0, '#1a120c');
    oval(ctx, 0.28, -0.35, 0.11, 0.085, 0, '#1a120c');
    eye(ctx, 0.04, -0.34, 0.045, '#76ff03', 0.6);
    eye(ctx, 0.3, -0.34, 0.045, '#76ff03', 0.6);
    ctx.fillStyle = tc('#1a120c');
    ctx.beginPath();
    ctx.moveTo(0.0, -0.1); ctx.lineTo(0.08, -0.04 - (ai.atk || 0) * 0.08); ctx.lineTo(0.16, -0.1); ctx.lineTo(0.24, -0.03); ctx.lineTo(0.32, -0.1);
    ctx.lineTo(0.28, 0.04 + (ai.atk || 0) * 0.1); ctx.lineTo(0.04, 0.04 + (ai.atk || 0) * 0.1);
    ctx.closePath(); ctx.fill();
    const sw2 = sway * 1.4;
    circle(ctx, -0.38 + sw2, -0.92, 0.3, '#2e7d32');
    circle(ctx, 0.36 + sw2, -0.92, 0.28, '#2e7d32');
    circle(ctx, -0.02 + sw2 * 1.2, -1.1, 0.36, '#43a047');
    circle(ctx, -0.22 + sw2, -0.86, 0.22, '#388e3c');
    circle(ctx, 0.22 + sw2, -0.84, 0.24, '#66bb6a');
    circle(ctx, -0.1 + sw2 * 1.2, -1.22, 0.16, '#7cb342');
    treantArm(ctx, 1, sway, lift, true);
    if (DETAIL) {
      for (let i = 0; i < 3; i++) {
        const a = t * (0.8 + i * 0.3) + i * 2.1;
        const fx = cos(a) * (0.9 + i * 0.15), fy = -0.4 + sin(a * 1.3) * 0.6;
        ug(ctx, fx, fy, 0.18, '#ffd54f', 0.7);
        circle(ctx, fx, fy, 0.035, '#fff59d');
      }
    }
  }

  /* --- Fungo Tossico (flip) */
  const SHROOM_SPOTS = [-0.45, -0.25, 0.12, 0.1, -0.5, 0.14, 0.5, -0.2, 0.1, -0.1, -0.18, 0.08, 0.32, -0.55, 0.07];
  function drawShroom(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const bob = sin(t * 3.4 + (ai.wob || 0)) * 0.05;
    const puff = ai.tele || 0;
    oval(ctx, -0.16 + sin(g) * 0.08 * mv, 0.68, 0.13, 0.08, 0, '#bfae92');
    oval(ctx, 0.18 - sin(g) * 0.08 * mv, 0.68, 0.13, 0.08, 0, '#bfae92');
    ctx.fillStyle = tc('#efe3cf');
    ctx.beginPath();
    ctx.moveTo(-0.27, 0.66); ctx.quadraticCurveTo(-0.3, 0.2, -0.22, -0.05);
    ctx.lineTo(0.22, -0.05); ctx.quadraticCurveTo(0.3, 0.2, 0.27, 0.66);
    ctx.quadraticCurveTo(0, 0.74, -0.27, 0.66);
    ctx.fill();
    oval(ctx, 0.16, 0.35, 0.08, 0.26, 0, '#d8c8ad');
    oval(ctx, 0.02, 0.22, 0.06, 0.07, 0, '#1b1020');
    oval(ctx, 0.18, 0.22, 0.06, 0.07, 0, '#1b1020');
    circle(ctx, 0.04, 0.2, 0.02, '#b2ff59');
    circle(ctx, 0.2, 0.2, 0.02, '#b2ff59');
    seg(ctx, -0.04, 0.12, 0.08, 0.15, 0.03, '#5d4d3a');
    seg(ctx, 0.13, 0.15, 0.25, 0.12, 0.03, '#5d4d3a');
    ctx.strokeStyle = tc('#5d4d3a');
    ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.arc(0.1, 0.42, 0.07, PI + 0.4, TAU - 0.4); ctx.stroke();
    ctx.save();
    ctx.translate(0, -0.12 + bob * 0.5);
    ctx.scale(1 + puff * 0.07, 1 - puff * 0.05 + bob * 0.4);
    oval(ctx, 0, 0.02, 0.8, 0.16, 0, '#4a1460');
    ctx.fillStyle = tc('#8e24aa');
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.92, 0.72, 0, PI, TAU);
    ctx.quadraticCurveTo(0, 0.18, -0.92, 0);
    ctx.fill();
    oval(ctx, -0.28, -0.42, 0.3, 0.13, -0.3, '#b65fd1');
    const sp = 0.6 + 0.4 * sin(t * 2.5 + (ai.wob || 0));
    for (let i = 0; i < SHROOM_SPOTS.length; i += 3) {
      const x = SHROOM_SPOTS[i], y = SHROOM_SPOTS[i + 1], rr = SHROOM_SPOTS[i + 2];
      ug(ctx, x, y, rr * 3, '#b2ff59', 0.25 * sp + puff * 0.4);
      circle(ctx, x, y, rr, '#b2ff59');
    }
    ctx.restore();
    if (DETAIL) {
      const pa = ctx.globalAlpha;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.6 + i / 3) % 1;
        ctx.globalAlpha = pa * (1 - ph) * (0.3 + puff * 0.5);
        circle(ctx, sin(i * 2.4 + t) * 0.6, -0.6 - ph * 0.9, 0.1 + ph * 0.18, '#9ccc65');
      }
      ctx.globalAlpha = pa;
    }
  }

  /* --- Salamandra (top-down, rotate) */
  function drawSalamander(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const body = '#ff6d00', dark = '#bf360c', light = '#ffab40';
    ug(ctx, 0, 0, 1.4, '#ff6d00', 0.35);
    const N = 7, wf = 4 + 6 * mv, amp = 0.055 * (0.3 + mv * 0.7);
    ctx.fillStyle = tc(dark);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = -0.35 - i * 0.17, y = sin(t * wf - i * 0.75) * amp * i, w = 0.2 * (1 - i / N) + 0.02;
      if (i === 0) ctx.moveTo(x, y - w); else ctx.lineTo(x, y - w);
    }
    for (let i = N; i >= 0; i--) {
      const x = -0.35 - i * 0.17, y = sin(t * wf - i * 0.75) * amp * i, w = 0.2 * (1 - i / N) + 0.02;
      ctx.lineTo(x, y + w);
    }
    ctx.closePath();
    ctx.fill();
    for (let i = 1; i < N; i += 2) {
      const x = -0.35 - i * 0.17, y = sin(t * wf - i * 0.75) * amp * i;
      circle(ctx, x, y, 0.07 * (1 - i / N) + 0.02, light);
    }
    const legs = [0.27, 1, 0, 0.27, -1, PI, -0.25, 1, PI, -0.25, -1, 0];
    for (let i = 0; i < legs.length; i += 3) {
      const hx = legs[i], s = legs[i + 1], off = legs[i + 2];
      const front = hx > 0;
      const a = s * (HALF_PI + (front ? -0.5 : 0.5)) + sin(g * 1.4 + off) * 0.45 * mv;
      const kx = hx + cos(a) * 0.28, ky = s * 0.2 + sin(a) * 0.28;
      const a2 = a + s * (front ? -0.8 : 0.8);
      const fx = kx + cos(a2) * 0.2, fy = ky + sin(a2) * 0.2;
      seg(ctx, hx, s * 0.18, kx, ky, 0.09, dark);
      seg(ctx, kx, ky, fx, fy, 0.07, dark);
      circle(ctx, fx, fy, 0.045, light);
    }
    oval(ctx, 0, 0, 0.48, 0.25, 0, body);
    circle(ctx, -0.2, 0.08, 0.06, light);
    circle(ctx, 0.05, -0.1, 0.06, light);
    circle(ctx, 0.2, 0.08, 0.05, light);
    for (let k = 0; k < 5; k++) {
      const x = -0.32 + k * 0.15, h = 0.16 + 0.07 * sin(t * 16 + k * 1.7);
      const fy = sin(t * 11 + k) * 0.03;
      ctx.fillStyle = tc(k % 2 ? '#ffd54f' : '#ff9100');
      ctx.beginPath();
      ctx.moveTo(x + 0.06, 0);
      ctx.quadraticCurveTo(x - h * 0.3, -0.08 + fy, x - h, fy);
      ctx.quadraticCurveTo(x - h * 0.3, 0.08 + fy, x + 0.06, 0);
      ctx.fill();
    }
    ug(ctx, 0, 0, 0.7, '#ffd54f', 0.3 + 0.15 * sin(t * 12));
    oval(ctx, 0.55, 0, 0.27, 0.22, 0, '#ff7a1a');
    oval(ctx, 0.73, 0, 0.14, 0.13, 0, '#ff8f2e');
    eye(ctx, 0.6, 0.14, 0.065, '#ffeb3b', 0.35);
    eye(ctx, 0.6, -0.14, 0.065, '#ffeb3b', 0.35);
    oval(ctx, 0.6, 0.14, 0.015, 0.05, 0, '#1a0a00');
    oval(ctx, 0.6, -0.14, 0.015, 0.05, 0, '#1a0a00');
    circle(ctx, 0.84, 0.05, 0.02, dark);
    circle(ctx, 0.84, -0.05, 0.02, dark);
    const tele = ai.tele || 0;
    if (tele > 0) {
      ug(ctx, 0.92, 0, 0.4 + tele * 0.5, '#ffd54f', 0.5 + tele * 0.5);
      flame(ctx, 0.95, 0.02, 0.06 + tele * 0.06, 0.2 + tele * 0.2, 0, 0, '#fff3c4');
    }
  }

  /* --- Golem di Magma (flip) */
  const GOLEM_CRACKS = [
    [-0.4, -0.3, -0.15, -0.05, -0.25, 0.3],
    [0.35, -0.5, 0.15, -0.2, 0.4, 0.1],
    [0.0, 0.15, 0.1, 0.45],
  ];
  function golemArm(ctx, s, swing, raise, front, pulse) {
    const sx = 0.58 * s, sy = -0.28;
    const ang = HALF_PI + swing * s * 0.3 - raise * (HALF_PI + 0.9);
    const ex = sx + cos(ang) * 0.5 * (s > 0 ? 1 : 0.85), ey = sy + sin(ang) * 0.5;
    const rock = front ? '#3b3036' : '#2a2226';
    oval(ctx, sx, sy, 0.22, 0.2, 0, rock);
    seg(ctx, sx, sy, ex, ey, 0.3, rock);
    circle(ctx, ex, ey + 0.05, 0.26, front ? '#46393f' : '#30272b');
    if (front) {
      ug(ctx, ex, ey + 0.05, 0.4, '#ff9100', 0.3 * pulse);
      seg(ctx, ex - 0.1, ey, ex + 0.06, ey + 0.14, 0.04, '#ffab40');
    }
  }
  function drawGolem(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const raise = ai.wind || 0, slam = ai.atk || 0;
    const pulse = 0.6 + 0.4 * sin(t * 3.2 + (ai.wob || 0));
    ctx.translate(0, -abs(sin(g * 0.8)) * 0.05 * mv + slam * 0.06);
    ug(ctx, 0, 0, 1.7, '#ff6d00', 0.22 + 0.15 * pulse);
    const st = sin(g * 0.8) * 0.08 * mv;
    oval(ctx, -0.28 + st, 0.66, 0.2, 0.17, 0, '#251d22');
    oval(ctx, 0.3 - st, 0.66, 0.2, 0.17, 0, '#251d22');
    golemArm(ctx, -1, sin(g * 0.8) * mv, raise, false, pulse);
    ctx.fillStyle = tc('#3b3036');
    ctx.beginPath();
    ctx.moveTo(-0.62, -0.35); ctx.lineTo(-0.3, -0.7); ctx.lineTo(0.3, -0.72); ctx.lineTo(0.66, -0.3);
    ctx.lineTo(0.6, 0.35); ctx.lineTo(0.2, 0.58); ctx.lineTo(-0.3, 0.56); ctx.lineTo(-0.65, 0.25);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc('#54464c');
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.38); ctx.lineTo(-0.26, -0.62); ctx.lineTo(0.26, -0.64); ctx.lineTo(0.5, -0.34); ctx.lineTo(0.05, -0.3);
    ctx.closePath(); ctx.fill();
    oval(ctx, 0.35, 0.3, 0.18, 0.12, 0.4, '#2a2226');
    const pc = ctx.globalCompositeOperation, pa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = tc(pass ? '#ffd180' : '#ff9100');
      ctx.lineWidth = pass ? 0.035 : 0.1;
      ctx.globalAlpha = pa * (pass ? 0.9 : 0.55) * pulse;
      for (let c = 0; c < GOLEM_CRACKS.length; c++) {
        const L = GOLEM_CRACKS[c];
        ctx.beginPath();
        ctx.moveTo(L[0], L[1]);
        for (let k = 2; k < L.length; k += 2) ctx.lineTo(L[k], L[k + 1]);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = pc;
    ctx.globalAlpha = pa;
    ug(ctx, 0.02, -0.1, 0.75, '#ff9100', 0.5 + 0.4 * pulse);
    circle(ctx, 0.02, -0.1, 0.17, '#ff9100');
    circle(ctx, 0.02, -0.1, 0.09, '#fff3c4');
    ctx.fillStyle = tc('#46393f');
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.62); ctx.lineTo(0.0, -0.9); ctx.lineTo(0.34, -0.92); ctx.lineTo(0.4, -0.64);
    ctx.closePath(); ctx.fill();
    ug(ctx, 0.2, -0.78, 0.3, '#ffea00', 0.8);
    seg(ctx, 0.08, -0.78, 0.17, -0.76, 0.05, '#ffea00');
    seg(ctx, 0.24, -0.76, 0.33, -0.78, 0.05, '#ffea00');
    golemArm(ctx, 1, -sin(g * 0.8) * mv, raise, true, pulse);
    if (DETAIL) {
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.7 + i * 0.5) % 1;
        const x = -0.25 + i * 0.5, y = 0.1 + ph * 0.6;
        const pa2 = ctx.globalAlpha;
        ctx.globalAlpha = pa2 * (1 - ph);
        circle(ctx, x, y, 0.05, '#ffab40');
        ctx.globalAlpha = pa2;
      }
    }
  }

  /* --- Orchi (flip) */
  function drawOrc(ctx, m, t, tyr) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0), evo = !!m.evolved;
    const skin = tyr ? '#4c6b2f' : '#5f8a3a', skinD = tyr ? '#35501f' : '#466b29';
    const metal = tyr || evo ? '#ffd54f' : '#78808a', metalD = tyr || evo ? '#c79a1e' : '#4e555e';
    const step = sin(g);
    ctx.translate(0, -abs(step) * 0.06 * mv + (ai.wind || 0) * 0.05);
    if (tyr || evo) {
      const w1 = sin(t * 3) * 0.06, w2 = sin(t * 3 + 1) * 0.08;
      ctx.fillStyle = tc(tyr ? '#7f0000' : '#b71c1c');
      ctx.beginPath();
      ctx.moveTo(-0.25, -0.45); ctx.lineTo(0.15, -0.45);
      ctx.lineTo(-0.15 + w1, 0.75); ctx.lineTo(-0.8 + w2, 0.68);
      ctx.closePath(); ctx.fill();
    }
    seg(ctx, -0.18, 0.35, -0.2 + step * 0.16 * mv, 0.66, 0.2, '#4e3b2a');
    seg(ctx, 0.18, 0.35, 0.2 - step * 0.16 * mv, 0.66, 0.2, '#4e3b2a');
    oval(ctx, -0.18 + step * 0.16 * mv, 0.72, 0.17, 0.09, 0, '#2b1f16');
    oval(ctx, 0.24 - step * 0.16 * mv, 0.72, 0.17, 0.09, 0, '#2b1f16');
    seg(ctx, -0.36, -0.2, -0.5, 0.15 + step * 0.06, 0.17, skinD);
    circle(ctx, -0.5, 0.18 + step * 0.06, 0.1, skinD);
    oval(ctx, 0, 0.02, 0.5, 0.45, 0, skin);
    ctx.strokeStyle = tc(skinD);
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.arc(-0.1, -0.12, 0.18, 0.3, 2.6); ctx.arc(0.22, -0.12, 0.18, 0.5, 2.8); ctx.stroke();
    ctx.fillStyle = tc('#3b2a1a');
    ctx.fillRect(-0.48, 0.2, 0.96, 0.1);
    circle(ctx, 0.05, 0.25, 0.08, tyr ? '#ffd54f' : '#9e9e9e');
    ctx.fillStyle = tc('#6d4c2f');
    ctx.beginPath(); ctx.moveTo(-0.2, 0.3); ctx.lineTo(0.25, 0.3); ctx.lineTo(0.15, 0.55); ctx.lineTo(-0.12, 0.55); ctx.closePath(); ctx.fill();
    if (tyr) {
      oval(ctx, -0.05, -0.38, 0.42, 0.14, 0, '#5d4037');
      for (let k = 0; k < 5; k++) circle(ctx, -0.4 + k * 0.18, -0.34, 0.08, '#6d4c41');
    }
    oval(ctx, 0.3, -0.32, 0.22, 0.16, -0.2, metal);
    oval(ctx, 0.28, -0.36, 0.12, 0.07, -0.2, metalD);
    tri(ctx, 0.22, -0.44, 0.27, -0.66, 0.33, -0.44, metalD);
    tri(ctx, 0.38, -0.42, 0.47, -0.6, 0.48, -0.38, metalD);
    const hx = 0.12, hy = -0.55;
    circle(ctx, hx, hy, 0.32, skin);
    oval(ctx, hx + 0.06, hy + 0.14, 0.3, 0.18, 0, skin);
    oval(ctx, hx + 0.08, hy + 0.2, 0.22, 0.08, 0, skinD);
    tri(ctx, hx - 0.04, hy + 0.2, hx - 0.06, hy - 0.02, hx + 0.03, hy + 0.18, '#f5f0dc');
    tri(ctx, hx + 0.2, hy + 0.2, hx + 0.24, hy - 0.02, hx + 0.27, hy + 0.18, '#f5f0dc');
    seg(ctx, hx - 0.1, hy - 0.12, hx + 0.08, hy - 0.06, 0.06, '#1f2a12');
    seg(ctx, hx + 0.14, hy - 0.06, hx + 0.3, hy - 0.12, 0.06, '#1f2a12');
    eye(ctx, hx - 0.0, hy - 0.02, 0.045, tyr && m.enraged ? '#ffffff' : '#ff5252', tyr ? 0.7 : 0.35);
    eye(ctx, hx + 0.21, hy - 0.02, 0.045, tyr && m.enraged ? '#ffffff' : '#ff5252', tyr ? 0.7 : 0.35);
    if (tyr) {
      ctx.fillStyle = tc('#ffd54f');
      ctx.beginPath();
      ctx.moveTo(hx - 0.3, hy - 0.2); ctx.lineTo(hx - 0.3, hy - 0.48); ctx.lineTo(hx - 0.15, hy - 0.34); ctx.lineTo(hx, hy - 0.58);
      ctx.lineTo(hx + 0.15, hy - 0.34); ctx.lineTo(hx + 0.3, hy - 0.48); ctx.lineTo(hx + 0.3, hy - 0.2);
      ctx.closePath(); ctx.fill();
      circle(ctx, hx, hy - 0.28, 0.05, '#ff1744');
      for (let s = -1; s <= 1; s += 2) {
        ctx.fillStyle = tc('#e0d6c8');
        ctx.beginPath();
        ctx.moveTo(hx + s * 0.26, hy - 0.22);
        ctx.quadraticCurveTo(hx + s * 0.55, hy - 0.3, hx + s * 0.6, hy - 0.62);
        ctx.quadraticCurveTo(hx + s * 0.42, hy - 0.36, hx + s * 0.22, hy - 0.32);
        ctx.closePath(); ctx.fill();
      }
    } else {
      oval(ctx, hx - 0.06, hy - 0.34, 0.1, 0.08, 0, '#1a1a1a');
      tri(ctx, hx - 0.1, hy - 0.38, hx - 0.28, hy - 0.52 + sin(t * 4) * 0.04, hx - 0.04, hy - 0.4, '#1a1a1a');
    }
    if (evo && DETAIL) {
      ctx.strokeStyle = tc('#18ffff');
      ctx.lineWidth = 0.03;
      ctx.beginPath(); ctx.moveTo(-0.3, -0.1); ctx.lineTo(-0.15, 0.05); ctx.lineTo(-0.28, 0.12); ctx.stroke();
      ug(ctx, -0.22, 0.02, 0.3, '#18ffff', 0.4);
    }
    const sw = ai.spin ? t * 18 : -1.0 + (ai.atk || 0) * 1.9 - (ai.wind || 0) * 0.6 + (ai.cast || 0) * -0.5 + sin(t * 2) * 0.05;
    ctx.save();
    ctx.translate(0.36, -0.14);
    ctx.rotate(sw);
    seg(ctx, 0, 0, 0.3, 0, 0.17, skin);
    seg(ctx, 0.32, 0.35, 0.32, -0.8, 0.07, '#5d4037');
    ctx.fillStyle = tc('#b0bec5');
    ctx.beginPath();
    ctx.moveTo(0.34, -0.55); ctx.quadraticCurveTo(0.6, -0.95, 0.82, -0.78);
    ctx.quadraticCurveTo(0.95, -0.55, 0.8, -0.32); ctx.quadraticCurveTo(0.6, -0.38, 0.34, -0.4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = tc('#eceff1');
    ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(0.82, -0.78); ctx.quadraticCurveTo(0.95, -0.55, 0.8, -0.32); ctx.stroke();
    if (tyr) {
      ctx.fillStyle = tc('#90a4ae');
      ctx.beginPath();
      ctx.moveTo(0.3, -0.55); ctx.quadraticCurveTo(0.04, -0.95, -0.18, -0.78);
      ctx.quadraticCurveTo(-0.31, -0.55, -0.16, -0.32); ctx.quadraticCurveTo(0.04, -0.38, 0.3, -0.4);
      ctx.closePath(); ctx.fill();
      ug(ctx, 0.6, -0.55, 0.3, '#ff1744', 0.6);
      circle(ctx, 0.6, -0.55, 0.05, '#ff5252');
    }
    circle(ctx, 0.32, 0, 0.1, skin);
    ctx.restore();
    if (ai.spin && DETAIL) {
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * 0.35;
      ctx.strokeStyle = tc('#eceff1');
      ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.arc(0.36, -0.14, 1.05, t * 18 - 2.2, t * 18); ctx.stroke();
      ctx.globalAlpha = pa;
    }
  }
  function drawOrcWarrior(ctx, m, t) { drawOrc(ctx, m, t, false); }
  function drawOrcTyrant(ctx, m, t) {
    ug(ctx, 0, 0, 1.6, '#ff5722', 0.15 + (m.enraged ? 0.2 : 0));
    drawOrc(ctx, m, t, true);
  }

  /* --- Folletto di Fuoco (flip) */
  function drawImp(ctx, m, t) {
    const ai = m.ai || NOAI;
    const w = ai.wob || 0;
    const f1 = sin(t * 13 + w), f2 = sin(t * 19.3 + w * 2), f3 = sin(t * 7.1 + w);
    ug(ctx, 0, 0, 1.9, '#ff6d00', 0.5 + 0.15 * f1 + (ai.tele || 0) * 0.3);
    const wf = sin(t * 24);
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc('#8d1b1b');
      ctx.beginPath();
      ctx.moveTo(s * 0.25, -0.15);
      ctx.lineTo(s * 0.95, -0.62 - wf * 0.2);
      ctx.lineTo(s * 0.78, -0.25 - wf * 0.1);
      ctx.lineTo(s * 0.62, -0.08);
      ctx.closePath();
      ctx.fill();
    }
    flame(ctx, 0, 0.1, 0.62, 1.15, f1 * 0.12, f2 * 0.08, '#ff3d00');
    flame(ctx, 0.03, 0.15, 0.46, 0.85, f2 * 0.1, f3 * 0.06, '#ff9100');
    flame(ctx, 0.05, 0.2, 0.3, 0.55, f3 * 0.08, f1 * 0.05, '#ffd54f');
    tri(ctx, -0.12, -0.38, -0.3, -0.72, -0.02, -0.42, '#3e2723');
    tri(ctx, 0.2, -0.42, 0.42, -0.72, 0.3, -0.36, '#3e2723');
    oval(ctx, 0.06, -0.08, 0.09, 0.07, -0.2, '#fff8e1');
    oval(ctx, 0.3, -0.08, 0.09, 0.07, 0.2, '#fff8e1');
    oval(ctx, 0.08, -0.08, 0.025, 0.06, 0, '#3e0000');
    oval(ctx, 0.32, -0.08, 0.025, 0.06, 0, '#3e0000');
    ctx.fillStyle = tc('#5d0000');
    ctx.beginPath();
    ctx.moveTo(0.02, 0.1); ctx.quadraticCurveTo(0.2, 0.32 + (ai.atk || 0) * 0.1, 0.4, 0.08); ctx.quadraticCurveTo(0.2, 0.18, 0.02, 0.1);
    ctx.fill();
    tri(ctx, 0.12, 0.14, 0.17, 0.14, 0.145, 0.21, '#fff8e1');
    tri(ctx, 0.24, 0.14, 0.29, 0.13, 0.27, 0.2, '#fff8e1');
    if (DETAIL) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.4 + i / 3) % 1;
        const pa = ctx.globalAlpha;
        ctx.globalAlpha = pa * (1 - ph);
        circle(ctx, sin(i * 2.7 + t * 2) * 0.4, -0.7 - ph * 0.8, 0.05 * (1 - ph) + 0.01, '#ffd54f');
        ctx.globalAlpha = pa;
      }
    }
  }

  /* --- Spettro (flip, translucent) */
  function drawSpecter(ctx, m, t) {
    const ai = m.ai || NOAI;
    const pa = ctx.globalAlpha;
    ug(ctx, 0, -0.1, 1.8, '#7c4dff', 0.4);
    ug(ctx, 0, -0.2, 1.0, '#80deea', 0.3 + (ai.tele || 0) * 0.4);
    ctx.globalAlpha = pa * (0.72 + 0.12 * sin(t * 2.3));
    ctx.fillStyle = tc('#b8a6e6');
    ctx.beginPath();
    ctx.moveTo(-0.6, -0.2);
    ctx.arc(0, -0.2, 0.6, PI, 0);
    ctx.quadraticCurveTo(0.65, 0.25, 0.45, 0.45 + sin(t * 5) * 0.05);
    for (let k = 1; k <= 4; k++) {
      const x = 0.45 - k * 0.28, y = 0.5 + sin(t * 5 + k * 1.3) * 0.1 + k * 0.06;
      ctx.quadraticCurveTo(x + 0.14, y + (k % 2 ? 0.12 : -0.12), x, y);
    }
    ctx.quadraticCurveTo(-1.0, 0.75 + sin(t * 3.5) * 0.15, -1.25, 0.55 + sin(t * 4) * 0.18);
    ctx.quadraticCurveTo(-0.85, 0.25, -0.6, -0.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = pa * 0.55;
    oval(ctx, -0.12, -0.45, 0.3, 0.15, -0.3, '#ede7ff');
    ctx.globalAlpha = pa * 0.8;
    const aw = sin(t * 3) * 0.12;
    seg(ctx, 0.45, 0.0, 0.8, 0.12 + aw, 0.08, '#b8a6e6');
    seg(ctx, -0.45, 0.05, -0.75, 0.2 - aw, 0.08, '#b8a6e6');
    ctx.globalAlpha = pa;
    oval(ctx, 0.08, -0.25, 0.1, 0.14, 0, '#120a24');
    oval(ctx, 0.34, -0.25, 0.1, 0.14, 0, '#120a24');
    eye(ctx, 0.09, -0.23, 0.04, '#80deea', 0.8);
    eye(ctx, 0.35, -0.23, 0.04, '#80deea', 0.8);
    oval(ctx, 0.22, 0.02, 0.07, 0.09 + (ai.atk || 0) * 0.08 + (ai.tele || 0) * 0.06, 0, '#120a24');
  }

  /* --- Cavaliere Demoniaco (flip) */
  function drawKnight(ctx, m, t) {
    const ai = m.ai || NOAI;
    const g = ai.gait || 0, mv = min(1, ai.mv || 0);
    const armor = '#3a3a4c', armorD = '#24242f', armorL = '#5b5b72', trim = '#b71c1c';
    const step = sin(g);
    ctx.translate(0, -abs(step) * 0.05 * mv);
    const w1 = sin(t * 3.4) * 0.08, w2 = sin(t * 3.4 + 1.3) * 0.1;
    ctx.fillStyle = tc('#5a0f1c');
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.45); ctx.lineTo(0.15, -0.45);
    ctx.lineTo(-0.18 + w1, 0.8); ctx.lineTo(-0.85 + w2 - mv * 0.15, 0.7);
    ctx.closePath(); ctx.fill();
    seg(ctx, -0.15, 0.3, -0.17 + step * 0.15 * mv, 0.7, 0.17, armorD);
    seg(ctx, 0.15, 0.3, 0.17 - step * 0.15 * mv, 0.7, 0.17, armorD);
    oval(ctx, -0.14 + step * 0.15 * mv, 0.75, 0.15, 0.08, 0, armor);
    oval(ctx, 0.21 - step * 0.15 * mv, 0.75, 0.15, 0.08, 0, armor);
    ctx.fillStyle = tc(armor);
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.45); ctx.lineTo(0.36, -0.45); ctx.lineTo(0.3, 0.25); ctx.lineTo(0, 0.4); ctx.lineTo(-0.3, 0.25);
    ctx.closePath(); ctx.fill();
    seg(ctx, 0.0, -0.4, 0.0, 0.32, 0.05, armorL);
    ctx.strokeStyle = tc(trim);
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(-0.3, 0.2); ctx.lineTo(0, 0.34); ctx.lineTo(0.28, 0.2); ctx.stroke();
    circle(ctx, -0.2, -0.3, 0.035, '#c9a23a');
    circle(ctx, 0.22, -0.3, 0.035, '#c9a23a');
    ug(ctx, 0.02, -0.1, 0.35, '#ff1744', 0.35 + 0.2 * sin(t * 4));
    circle(ctx, 0.02, -0.1, 0.06, '#ff1744');
    oval(ctx, 0.3, -0.42, 0.2, 0.15, -0.2, armorL);
    tri(ctx, 0.22, -0.52, 0.3, -0.75, 0.36, -0.52, armorD);
    tri(ctx, 0.38, -0.48, 0.5, -0.66, 0.48, -0.42, armorD);
    const hx = 0.08, hy = -0.62;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc('#1a1a22');
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.18, hy - 0.15);
      ctx.quadraticCurveTo(hx + s * 0.45, hy - 0.3, hx + s * 0.4, hy - 0.62);
      ctx.quadraticCurveTo(hx + s * 0.3, hy - 0.35, hx + s * 0.08, hy - 0.22);
      ctx.closePath(); ctx.fill();
    }
    oval(ctx, hx, hy, 0.26, 0.27, 0, armorD);
    oval(ctx, hx - 0.05, hy - 0.08, 0.14, 0.1, 0, armorL);
    ctx.fillStyle = tc('#07070c');
    ctx.fillRect(hx + 0.02, hy - 0.03, 0.24, 0.06);
    const gl = 0.6 + 0.4 * sin(t * 5);
    ug(ctx, hx + 0.17, hy, 0.38, '#ff1744', gl);
    seg(ctx, hx + 0.1, hy, hx + 0.22, hy, 0.035, '#ff5252');
    let sw;
    if (ai.st === 'act') sw = 1.45;
    else sw = -1.25 + (ai.atk || 0) * 1.9 - (ai.wind || 0) * 0.5 + sin(t * 2) * 0.04;
    ctx.save();
    ctx.translate(0.32, -0.2);
    ctx.rotate(sw);
    seg(ctx, 0, 0, 0.28, 0.02, 0.15, armor);
    circle(ctx, 0.3, 0.02, 0.08, armorD);
    seg(ctx, 0.3, 0.14, 0.3, -0.06, 0.06, '#3e2723');
    seg(ctx, 0.16, -0.06, 0.44, -0.06, 0.07, '#c9a23a');
    ctx.fillStyle = tc('#4a4f5e');
    ctx.beginPath();
    ctx.moveTo(0.24, -0.08); ctx.lineTo(0.36, -0.08); ctx.lineTo(0.34, -1.15); ctx.lineTo(0.3, -1.3); ctx.lineTo(0.26, -1.15);
    ctx.closePath(); ctx.fill();
    const pc = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    seg(ctx, 0.3, -0.15, 0.3, -1.1, 0.025, '#ff5252');
    ctx.globalCompositeOperation = pc;
    ctx.restore();
  }

  /* --- Gargoyle (flip) */
  function drawGargoyle(ctx, m, t) {
    const ai = m.ai || NOAI;
    const dive = ai.st === 'act' ? 1 : 0;
    const stone = '#7d7a88', stoneD = '#55525f', stoneL = '#a19eae';
    const fl = dive ? -0.6 : sin(t * 6 + (ai.wob || 0));
    const ws = dive ? 0.7 : 1;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc(stoneD);
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -0.3);
      ctx.lineTo(s * 1.25 * ws, -1.0 - fl * 0.2);
      ctx.lineTo(s * 1.45 * ws, -0.35 - fl * 0.25);
      ctx.quadraticCurveTo(s * 1.15 * ws, -0.35, s * 1.05 * ws, -0.05 - fl * 0.1);
      ctx.quadraticCurveTo(s * 0.8 * ws, -0.2, s * 0.65 * ws, 0.1);
      ctx.quadraticCurveTo(s * 0.5, -0.05, s * 0.32, 0.1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tc(stoneL);
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.moveTo(s * 0.22, -0.3); ctx.lineTo(s * 1.25 * ws, -1.0 - fl * 0.2);
      ctx.moveTo(s * 0.6 * ws, -0.6 - fl * 0.1); ctx.lineTo(s * 1.05 * ws, -0.05 - fl * 0.1);
      ctx.moveTo(s * 0.5 * ws, -0.5 - fl * 0.08); ctx.lineTo(s * 0.65 * ws, 0.1);
      ctx.stroke();
    }
    const tw = sin(t * 2.5) * 0.15;
    ctx.strokeStyle = tc(stoneD);
    ctx.lineWidth = 0.09;
    ctx.beginPath(); ctx.moveTo(-0.2, 0.35); ctx.quadraticCurveTo(-0.7, 0.55 + tw, -0.95, 0.3 + tw); ctx.stroke();
    tri(ctx, -0.9, 0.22 + tw, -1.12, 0.3 + tw, -0.92, 0.42 + tw, stoneD);
    oval(ctx, -0.18, 0.5, 0.15, 0.17, 0, stoneD);
    oval(ctx, 0.2, 0.5, 0.15, 0.17, 0, stoneD);
    tri(ctx, 0.25, 0.62, 0.42, 0.68, 0.28, 0.7, '#3e3c46');
    oval(ctx, 0, 0.05, 0.4, 0.46, 0, stone);
    oval(ctx, 0.05, 0.08, 0.24, 0.28, 0, stoneL);
    ctx.strokeStyle = tc(stoneD);
    ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(-0.2, -0.1); ctx.lineTo(-0.08, 0.1); ctx.lineTo(-0.15, 0.25); ctx.stroke();
    oval(ctx, -0.22, 0.32, 0.08, 0.05, 0, '#5f7a4f');
    const claw = (ai.atk || 0) * 0.15 + dive * 0.2;
    seg(ctx, 0.28, -0.05, 0.55 + claw, 0.18, 0.1, stone);
    for (let k = -1; k <= 1; k++) seg(ctx, 0.55 + claw, 0.18, 0.66 + claw, 0.2 + k * 0.06, 0.035, '#2e2c35');
    const hx = 0.12, hy = -0.48;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc('#4a4752');
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.12, hy - 0.18);
      ctx.quadraticCurveTo(hx + s * 0.18 - 0.2, hy - 0.5, hx + s * 0.05 - 0.38, hy - 0.52);
      ctx.quadraticCurveTo(hx + s * 0.12 - 0.15, hy - 0.35, hx + s * 0.02, hy - 0.16);
      ctx.closePath(); ctx.fill();
    }
    tri(ctx, hx - 0.22, hy - 0.05, hx - 0.42, hy - 0.2, hx - 0.18, hy + 0.06, stone);
    circle(ctx, hx, hy, 0.27, stone);
    oval(ctx, hx + 0.12, hy + 0.12, 0.18, 0.11, 0, stoneL);
    seg(ctx, hx - 0.08, hy - 0.1, hx + 0.32, hy - 0.08, 0.05, stoneD);
    eye(ctx, hx + 0.06, hy - 0.02, 0.05, '#ffab00', 0.7);
    eye(ctx, hx + 0.22, hy - 0.02, 0.05, '#ffab00', 0.7);
    oval(ctx, hx + 0.16, hy + 0.15, 0.1, 0.04 + (ai.atk || 0) * 0.05, 0, '#1c1a22');
    tri(ctx, hx + 0.1, hy + 0.12, hx + 0.13, hy + 0.12, hx + 0.115, hy + 0.2, '#e0e0e0');
    tri(ctx, hx + 0.2, hy + 0.12, hx + 0.23, hy + 0.12, hx + 0.215, hy + 0.2, '#e0e0e0');
  }

  /* --- Mago Oscuro (flip) */
  function drawMage(ctx, m, t) {
    const ai = m.ai || NOAI;
    const tele = ai.tele || 0;
    ctx.translate(0, sin(t * 2.2 + (ai.wob || 0)) * 0.07);
    if (DETAIL) {
      const pa = ctx.globalAlpha;
      ctx.globalAlpha = pa * (0.35 + tele * 0.4);
      ctx.strokeStyle = tc('#b388ff');
      ctx.lineWidth = 0.04;
      for (let k = 0; k < 3; k++) {
        const a0 = t * 0.8 + (k * TAU) / 3;
        ctx.beginPath(); ctx.ellipse(0, 0.82, 0.8, 0.24, 0, a0, a0 + 1.6); ctx.stroke();
      }
      ctx.globalAlpha = pa;
    }
    ctx.fillStyle = tc('#3a1f8f');
    ctx.beginPath();
    ctx.moveTo(-0.24, -0.4); ctx.lineTo(0.24, -0.4); ctx.lineTo(0.56, 0.72);
    for (let k = 1; k <= 4; k++) {
      const x = 0.56 - k * 0.29, y = 0.72 + sin(t * 4 + k) * 0.05;
      ctx.quadraticCurveTo(x + 0.14, y + 0.08, x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc('#22125a');
    ctx.beginPath(); ctx.moveTo(-0.24, -0.4); ctx.lineTo(-0.05, -0.4); ctx.lineTo(-0.2, 0.74); ctx.lineTo(-0.6, 0.72); ctx.closePath(); ctx.fill();
    seg(ctx, 0.06, -0.32, 0.12, 0.72, 0.05, '#ffca28');
    ctx.strokeStyle = tc('#ffca28');
    ctx.lineWidth = 0.035;
    ctx.beginPath(); ctx.moveTo(-0.6, 0.7); ctx.lineTo(0.56, 0.7); ctx.stroke();
    const reach = 0.12 + tele * 0.12;
    seg(ctx, 0.15, -0.22, 0.42 + reach, -0.08, 0.15, '#5532b8');
    circle(ctx, 0.5 + reach, -0.08, 0.06, '#c5b3e6');
    ctx.fillStyle = tc('#4527a0');
    ctx.beginPath();
    ctx.moveTo(0.32, -0.42); ctx.quadraticCurveTo(0.36, -0.8, 0.05, -0.98);
    ctx.quadraticCurveTo(-0.28, -1.02, -0.55, -0.72); ctx.quadraticCurveTo(-0.3, -0.72, -0.28, -0.42);
    ctx.closePath(); ctx.fill();
    oval(ctx, 0.12, -0.6, 0.16, 0.18, 0, '#08040f');
    eye(ctx, 0.07, -0.62, 0.035, '#ea80fc', 0.8);
    eye(ctx, 0.2, -0.62, 0.035, '#ea80fc', 0.8);
    const ox = 0.72 + reach, oy = -0.15 + sin(t * 3) * 0.08, orr = 0.17 + tele * 0.12;
    ug(ctx, ox, oy, 0.7 + tele * 0.8, '#7c4dff', 0.6 + tele * 0.4);
    circle(ctx, ox, oy, orr, '#4a148c');
    circle(ctx, ox, oy, orr * 0.72, '#b388ff');
    ctx.strokeStyle = tc('#ffffff');
    ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(ox, oy, orr * 0.5, t * 5, t * 5 + 2.4); ctx.stroke();
    circle(ctx, ox, oy, orr * 0.25, '#ffffff');
    for (let k = 0; k < 3; k++) {
      const a = t * 2.5 + (k * TAU) / 3;
      circle(ctx, ox + cos(a) * orr * 1.6, oy + sin(a) * orr * 0.8, 0.03, '#ea80fc');
    }
  }

  /* --- Re Demone Caduto (flip, big) */
  function drawDemonLord(ctx, m, t) {
    const ai = m.ai || NOAI;
    const en = m.enraged ? 1 : 0, p3 = (m.phase || 1) >= 3 ? 1 : 0;
    const cast = ai.cast || 0;
    ctx.translate(0, sin(t * 1.6) * 0.05);
    ug(ctx, 0, -0.1, 2.4, en ? '#d50000' : '#6a1b9a', 0.5);
    if (p3) {
      circle(ctx, 0.05, -0.75, 0.72, '#05000a');
      ctx.strokeStyle = tc('#ff9100');
      ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0.05, -0.75, 0.74, 0, TAU); ctx.stroke();
      ug(ctx, 0.05, -0.75, 1.1, '#ff6d00', 0.55 + 0.2 * sin(t * 3));
    }
    const wf = sin(t * 2.2) * 0.12;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc('#140a22');
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -0.45);
      ctx.lineTo(s * 1.25, -1.3 + wf);
      ctx.lineTo(s * 2.0, -0.7 + wf * 1.5);
      ctx.quadraticCurveTo(s * 1.7, -0.3, s * 1.5, 0.1 + wf);
      ctx.quadraticCurveTo(s * 1.25, -0.15, s * 1.05, -0.05 + wf * 0.5);
      ctx.quadraticCurveTo(s * 0.85, 0.05, s * 0.7, 0.25);
      ctx.quadraticCurveTo(s * 0.5, 0.0, s * 0.3, 0.0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tc('#4a1d6e');
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -0.45); ctx.lineTo(s * 1.25, -1.3 + wf); ctx.lineTo(s * 2.0, -0.7 + wf * 1.5);
      ctx.moveTo(s * 1.25, -1.3 + wf); ctx.lineTo(s * 1.5, 0.1 + wf);
      ctx.moveTo(s * 1.25, -1.3 + wf); ctx.lineTo(s * 1.05, -0.05 + wf * 0.5);
      ctx.moveTo(s * 1.25, -1.3 + wf); ctx.lineTo(s * 0.7, 0.25);
      ctx.stroke();
      if (DETAIL) {
        const pc = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        seg(ctx, s * 1.25, -1.3 + wf, s * 2.0, -0.7 + wf * 1.5, 0.03, en ? '#ff5252' : '#b388ff');
        ctx.globalCompositeOperation = pc;
      }
    }
    ctx.fillStyle = tc('#1b0f2b');
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.05); ctx.lineTo(0.45, -0.05); ctx.lineTo(0.62, 0.92);
    for (let k = 1; k <= 5; k++) {
      const x = 0.62 - k * 0.248, y = 0.92 + sin(t * 3 + k * 1.4) * 0.08;
      ctx.quadraticCurveTo(x + 0.12, y + 0.12, x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = tc('#2e1d47');
    ctx.beginPath();
    ctx.moveTo(-0.42, -0.55); ctx.lineTo(0.44, -0.55); ctx.lineTo(0.38, 0.05); ctx.lineTo(0, 0.2); ctx.lineTo(-0.36, 0.05);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = tc('#b388ff');
    ctx.lineWidth = 0.03;
    ctx.beginPath(); ctx.moveTo(-0.3, -0.4); ctx.lineTo(-0.1, -0.2); ctx.lineTo(-0.3, 0.0); ctx.moveTo(0.32, -0.4); ctx.lineTo(0.12, -0.2); ctx.lineTo(0.32, 0.0); ctx.stroke();
    const gp = 0.6 + 0.4 * sin(t * 3);
    ug(ctx, 0.01, -0.22, 0.55, '#ff1744', 0.5 + 0.4 * gp);
    circle(ctx, 0.01, -0.22, 0.11, '#ff1744');
    circle(ctx, -0.02, -0.25, 0.04, '#ffcdd2');
    if (p3 && DETAIL) {
      const pc = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = tc('#ffd6ff');
      ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(-0.2, -0.5); ctx.lineTo(-0.05, -0.3); ctx.lineTo(-0.18, 0.1); ctx.moveTo(0.25, -0.45); ctx.lineTo(0.1, -0.1); ctx.lineTo(0.3, 0.5); ctx.stroke();
      ctx.globalCompositeOperation = pc;
    }
    for (let s = -1; s <= 1; s += 2) {
      const hxp = s * lerp(0.62, 0.85, cast), hyp = lerp(0.15, -0.68, cast);
      seg(ctx, s * 0.45, -0.45, (s * 0.45 + hxp) * 0.55, (-0.45 + hyp) * 0.5 + 0.05, 0.16, '#2e1d47');
      seg(ctx, (s * 0.45 + hxp) * 0.55, (-0.45 + hyp) * 0.5 + 0.05, hxp, hyp, 0.13, '#3b2560');
      for (let k = -1; k <= 1; k++) seg(ctx, hxp, hyp, hxp + s * 0.1, hyp + k * 0.07 - 0.06, 0.035, '#e6dccb');
      if (cast > 0.05) {
        ug(ctx, hxp, hyp - 0.08, 0.55, en ? '#ff1744' : '#b388ff', cast);
        circle(ctx, hxp, hyp - 0.08, 0.08 * cast, '#ea80fc');
      }
      oval(ctx, s * 0.45, -0.5, 0.22, 0.17, 0, '#3b2560');
      tri(ctx, s * 0.36, -0.62, s * 0.5, -0.92, s * 0.58, -0.6, '#22142f');
      tri(ctx, s * 0.55, -0.55, s * 0.78, -0.75, s * 0.64, -0.46, '#22142f');
    }
    const hx = 0.05, hy = -0.75;
    for (let s = -1; s <= 1; s += 2) {
      ctx.fillStyle = tc('#e6dccb');
      ctx.beginPath();
      ctx.moveTo(hx + s * 0.14, hy - 0.16);
      ctx.quadraticCurveTo(hx + s * 0.7, hy - 0.25, hx + s * 0.72, hy - 0.72);
      ctx.quadraticCurveTo(hx + s * 0.55, hy - 0.4, hx + s * 0.1, hy - 0.04);
      ctx.closePath(); ctx.fill();
      tri(ctx, hx + s * 0.6, hy - 0.42, hx + s * 0.72, hy - 0.72, hx + s * 0.66, hy - 0.4, '#7d6a5a');
    }
    oval(ctx, hx, hy, 0.24, 0.27, 0, '#22142f');
    oval(ctx, hx + 0.02, hy + 0.14, 0.15, 0.1, 0, '#170c22');
    const ec = en ? '#ffffff' : '#ff1744';
    ug(ctx, hx - 0.08, hy - 0.02, 0.35, '#ff1744', 0.9);
    ug(ctx, hx + 0.12, hy - 0.02, 0.35, '#ff1744', 0.9);
    tri(ctx, hx - 0.16, hy - 0.06, hx - 0.01, hy - 0.01, hx - 0.15, hy + 0.01, ec);
    tri(ctx, hx + 0.2, hy - 0.06, hx + 0.05, hy - 0.01, hx + 0.19, hy + 0.01, ec);
    for (let k = 0; k < 5; k++) {
      const x = hx - 0.24 + k * 0.12;
      const h = 0.22 + 0.1 * sin(t * 9 + k * 1.9) + (k === 2 ? 0.1 : 0);
      ctx.globalCompositeOperation = 'lighter';
      flame(ctx, x, hy - 0.26, 0.07, h, sin(t * 7 + k) * 0.03, 0, k % 2 ? '#ea80fc' : '#b388ff');
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* ================================================================ bestiary portrait (screen space) */
  const ZERO_STATUS = Object.freeze({ slow: 0, slowAmt: 0, burn: 0, burnDps: 0, poison: 0, poisonDps: 0, stun: 0 });
  const PAI = {
    _ok: true, st: 'move', mv: 0.55, gait: 0, wob: 0, ph: 0, flash: 0, atk: 0, wind: 0, tele: 0, cast: 0,
    alpha: 1, flip: 1, hurtT: 0, spin: false, under: 0, emerge: 1, h: 0, enter: 0, cmul: 1, dizzy: 0,
  };
  const PM = {
    x: 0, y: 0, r: 1, vx: 40, vy: 0, t: 0, hp: 1, maxHp: 1, status: ZERO_STATUS, ai: PAI, facing: 0,
    def: null, type: '', elite: false, boss: false, evolved: false, team: 'enemy', passive: false,
    id: 7, segs: null, phase: 1, enraged: false,
  };
  function drawSerpentPortrait(ctx, m, t) {
    const N = 6;
    ctx.translate(1.6, 0);
    let px = 0, py = 0;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const x = -0.75 - i * 0.62, y = sin(t * 2 + i * 0.9) * 0.3;
      pts.push(x, y);
    }
    for (let i = N - 1; i >= 0; i--) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      px = i === 0 ? 0 : pts[(i - 1) * 2]; py = i === 0 ? 0 : pts[(i - 1) * 2 + 1];
      const sr = 0.8 - (0.52 * i) / N;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(atan2(py - y, px - x));
      ctx.scale(sr, sr);
      drawSerpentSeg(ctx, i, N, t, m);
      ctx.restore();
    }
    drawSerpentHead(ctx, m, t);
  }
  function renderPortrait(ctx, typeId, x, y, size, t) {
    const def = types[typeId];
    if (!ctx || !def || !(size > 0)) return;
    t = +t || 0;
    const prevTL = TL, prevDetail = DETAIL, prevPx = CUR_PX, prevHQ = HQ;
    HQ = SK.quality !== 'low';
    DETAIL = HQ;
    TL = 0;
    PAI.gait = t * 5; PAI.tele = 0.25 + 0.25 * sin(t * 1.5); PAI.cast = 0; PAI.st = 'move'; PAI.mv = 0.55;
    PAI.atk = 0; PAI.wind = 0; PAI.flash = 0; PAI.hurtT = 0;
    PM.def = def; PM.type = typeId; PM.t = t; PM.boss = !!def.boss; PM.facing = 0; PM.vx = 40; PM.vy = 0;
    PM.evolved = false; PM.team = 'enemy'; PM.passive = false; PM.enraged = false; PM.phase = 1;
    const R = size * (def.pscale || 0.3);
    PM.r = R;
    CUR_PX = R;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'source-over';
      wglow(ctx, x, y, size * 0.5, def.color, 0.28);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.78, R * 0.95 * (def.shadowW || 1), R * 0.28, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.translate(x, y + (def.fly ? -R * 0.25 + sin(t * 3) * R * 0.06 : 0));
      if (def.orient === 'rotate' && typeId !== 'abyss_serpent') ctx.rotate(-0.55);
      ctx.scale(R, R);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (typeId === 'abyss_serpent') drawSerpentPortrait(ctx, PM, t);
      else if (typeof def.draw === 'function') def.draw(ctx, PM, t);
    } finally {
      ctx.restore();
      TL = prevTL; DETAIL = prevDetail; CUR_PX = prevPx; HQ = prevHQ;
    }
  }

  /* ================================================================ misc helpers & export */
  function biomeTypes(biome) {
    const out = [];
    for (const id in types) if (types[id].biome === biome && !types[id].boss) out.push(id);
    return out;
  }
  function clear() {
    pending.length = 0;
    falls.length = 0;
    fbWarns.length = 0;
  }

  SK.Enemies = {
    // contract §5.5
    types,
    spawn,
    spawnBoss,
    makeAlly,
    update,
    render,
    renderPortrait,
    // extras
    typeIds: Object.keys(types),
    bossIds,
    biomeTypes,
    countType,
    clear,
  };
})(window.SK);
