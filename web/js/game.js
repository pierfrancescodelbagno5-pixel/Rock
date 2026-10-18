/* Slime Reborn — game.js: run state machine, player controller, combat rules (SK.combat),
   progression (XP, level-up cards, essences, mastery, evolution), naming, souls, shop,
   achievements, title attract mode, Android back bridge and the autoplay bot. */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2, PI = Math.PI, HALF_PI = Math.PI / 2;
  const sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, sqrt = Math.sqrt, hypot = Math.hypot;
  const min = Math.min, max = Math.max, abs = Math.abs, floor = Math.floor, round = Math.round;
  const random = Math.random, exp = Math.exp, pow = Math.pow;
  const clamp = U.clamp, rand = U.rand;
  const EMPTY = Object.freeze({});

  /* ================================================================ constants */
  const BASE_SPEED = 210;
  const DASH_TIME = 0.18, DASH_MUL = 3.2, DASH_CD = 1.6;
  const COMBO_WINDOW = 2.5;
  const ABSORB_SLOW = 0.55;
  const DEVOUR_FRAC = 0.15;
  const NAME_RANGE = 110;
  const NAME_COST = 0.4;
  const EVO_LEVELS = [8, 18, 30];
  const MAX_ENEMIES = 320;
  const AURA_RADIUS = 190, AURA_TICK = 0.25, JUDGE_EVERY = 18;
  const GOLD = '#ffd54f';

  /* ================================================================ safe helpers */
  let errBudget = 40;
  function report(tag, e) {
    if (errBudget > 0) { errBudget--; console.error('[Game:' + tag + ']', e); }
  }
  function F() { return SK.FX || null; }
  function sfx(name, o) {
    const A = SK.Audio;
    if (A && A.sfx) { try { A.sfx(name, o); } catch (e) { report('sfx', e); } }
  }
  function music(track) {
    const A = SK.Audio;
    if (A && A.music) { try { A.music(track); } catch (e) { report('music', e); } }
  }
  function duck(a, s) {
    const A = SK.Audio;
    if (A && A.duck) { try { A.duck(a, s); } catch (e) { report('duck', e); } }
  }
  function oracle(text, opts) {
    const UI = SK.UI;
    if (UI && UI.oracle) { try { UI.oracle(text, opts); } catch (e) { report('oracle', e); } }
  }
  function toast(text, color) {
    const UI = SK.UI;
    if (UI && UI.toast) { try { UI.toast(text, color); } catch (e) { report('toast', e); } }
  }
  function banner(t, s, o) {
    const UI = SK.UI;
    if (UI && UI.banner) { try { UI.banner(t, s, o); } catch (e) { report('banner', e); } }
  }
  function uiShow(name, data) {
    const UI = SK.UI;
    if (UI && UI.show) { try { return UI.show(name, data); } catch (e) { report('ui.show', e); } }
    return false;
  }
  function uiHide(name) {
    const UI = SK.UI;
    if (UI && UI.hide) { try { return UI.hide(name); } catch (e) { report('ui.hide', e); } }
    return false;
  }
  function uiOpen(name) {
    const UI = SK.UI;
    if (UI && UI.isOpen) { try { return !!UI.isOpen(name); } catch (e) { return false; } }
    return false;
  }
  function vibrate(p) { if (SK.vibrate) { try { SK.vibrate(p); } catch (e) { /* ignore */ } } }
  function shake(i, d) { if (SK.cam && SK.cam.shake) SK.cam.shake(i, d); }
  function now() { return SK.time.t; }
  function q() { return SK.quality === 'low' ? 0 : SK.quality === 'medium' ? 1 : 2; }
  function sv() { return SK.save.data; }
  function writeSave() { try { SK.save.write(); } catch (e) { /* storage unavailable */ } }
  function skillDef(id) { const S = SK.Skills; return (id && S && S.defs && S.defs[id]) || null; }
  function skillName(id) { const d = skillDef(id); return d ? d.name : String(id || '?'); }
  function skillMax(id) { const d = skillDef(id); return (d && d.maxLevel) || 5; }
  function enemyType(id) { const E = SK.Enemies; return (id && E && E.types && E.types[id]) || null; }
  function biomeDef(i) { const W = SK.World; return (W && W.biomes && W.biomes[clamp(i | 0, 0, 3)]) || null; }
  function arenaRadius() { const W = SK.World; return (W && W.radius) || 1800; }
  function stageName(p) {
    const C = SK.Character;
    if (C && C.stageName) { try { const s = C.stageName(p); if (s) return s; } catch (e) { /* fallback */ } }
    const S = SK.Slime;
    const names = (S && S.stageNames) || ['Slime', 'Slime Primordiale', 'Slime Demoniaco', 'Sovrano Slime'];
    return names[clamp((p && p.stage) | 0, 0, 3)];
  }
  function fmtPct(v) { return round(v * 100) + '%'; }
  function fmtDmg(v) { return v >= 10000 ? U.fmtNum(v) : String(max(1, round(v))); }
  function absorbRadius(p) {
    const W = SK.World;
    if (W && W.absorbRadius) { try { return W.absorbRadius(p); } catch (e) { /* fallback */ } }
    const st = (p && p.stats) || EMPTY;
    return 230 * (st.area || 1) * (st.absorbMul || 1);
  }
  function lifetime() {
    const d = sv();
    if (!d.lifetime || typeof d.lifetime !== 'object') d.lifetime = { kills: 0, absorbed: 0, named: 0, evolutions: 0 };
    return d.lifetime;
  }

  /* ================================================================ run state */
  function makeG(state) {
    return {
      state: state || 'title',
      t: 0, biome: 0, biomeT: 0,
      player: null,
      enemies: [], allies: [], projectiles: [], zones: [], pickups: [],
      boss: null,
      kills: 0, score: 0, soulsEarned: 0,
      nightmare: false,
      stats: { damageDealt: 0, absorbed: 0, named: 0, maxCombo: 0 },
      combo: 0, comboT: 0,
      portal: null,
    };
  }
  function makeRun() {
    return {
      pendingLevels: 0, pendingEvolve: 0, lvDelay: 0, lvOpen: false, lvChoices: null,
      evo: null, trans: null, fadeA: 0, fadeMode: 0,
      ended: false, finalized: false, victoryQueued: false,
      timers: [],
      auraT: 0.25, auraTick: 0, judgeT: 0, judgeCount: 0,
      hintT: 0, devourT: 0, vortexT: 0, wasAbsorbing: false,
      nameCand: null, naming: null, mpHintT: -99, slotHintT: -99, slotHintShown: false, fullHintT: -99,
      txtBudget: 12, fxKills: 0, hitSfxT: 0, critSfxT: 0, killSfxT: 0, hitstopT: -9, healAcc: 0, healTxtT: 0,
      lsAcc: 0, zoomTarget: 1, bossesDone: {}, victoryFxT: 0, achT: 0, lvFxT: -9,
      deathShown: false, startT: now(),
    };
  }

  let G = (SK.G = makeG('title'));
  let R = makeRun();
  let inited = false;
  let titleMusicStarted = false;

  /* ================================================================ timers (real time, play state only) */
  function later(delay, fn) { R.timers.push({ t: delay, fn }); }
  function tickTimers(raw) {
    const T = R.timers;
    if (!T.length) return;
    for (let i = 0; i < T.length; i++) {
      const tm = T[i];
      if (tm.done) continue;
      tm.t -= raw;
      if (tm.t <= 0) {
        tm.done = true;
        try { tm.fn(); } catch (e) { report('timer', e); }
      }
    }
    let w = 0;
    for (let i = 0; i < T.length; i++) if (!T[i].done) T[w++] = T[i];
    T.length = w;
  }

  /* ================================================================ spatial hash */
  const CELL = 96;
  let EXT = 2600, GW = 0;
  function makeTable() { return { head: null, next: new Int32Array(512), list: [], n: 0, maxR: 0, built: false }; }
  const HE = makeTable(), HA = makeTable();
  function hashInit() {
    const ext = arenaRadius() + 700;
    const gw = Math.ceil((ext * 2) / CELL);
    if (gw !== GW || !HE.head) {
      EXT = ext; GW = gw;
      HE.head = new Int32Array(GW * GW);
      HA.head = new Int32Array(GW * GW);
    }
  }
  function cellX(x) { let c = ((x + EXT) / CELL) | 0; if (c < 0) c = 0; else if (c >= GW) c = GW - 1; return c; }
  function hashAdd(T, m) {
    if (T.n >= T.next.length) { const nn = new Int32Array(T.next.length * 2); nn.set(T.next); T.next = nn; }
    const idx = cellX(m.y) * GW + cellX(m.x);
    T.list[T.n] = m;
    T.next[T.n] = T.head[idx];
    T.head[idx] = T.n;
    T.n++;
    if (m.r > T.maxR) T.maxR = m.r;
  }
  function rebuildHash() {
    hashInit();
    HE.head.fill(-1); HA.head.fill(-1);
    HE.n = HA.n = 0; HE.maxR = HA.maxR = 0;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (m && !m.dead && isFinite(m.x) && isFinite(m.y)) hashAdd(HE, m);
    }
    const A = G.allies;
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (m && !m.dead && !(m.ai && m.ai.fainted) && isFinite(m.x) && m.x > -1e5) hashAdd(HA, m);
    }
    HE.list.length = HE.n; HA.list.length = HA.n;
    HE.built = HA.built = true;
  }
  function query(x, y, r, fn, team, opts) {
    if (team && typeof team === 'object') { opts = team; team = opts.team; }
    const isAlly = team === 'ally';
    const incPassive = !!(opts && opts.includePassive);
    const T = isAlly ? HA : HE;
    if (typeof fn !== 'function' || !(r >= 0)) return;
    if (!T.built) {
      const L = isAlly ? G.allies : G.enemies;
      for (let i = 0; i < L.length; i++) {
        const m = L[i];
        if (!m || m.dead || (!isAlly && m.passive && !incPassive) || (m.ai && m.ai.fainted)) continue;
        const rr = r + (m.r || 0), dx = m.x - x, dy = m.y - y;
        if (dx * dx + dy * dy <= rr * rr) fn(m);
      }
      return;
    }
    if (!T.n) return;
    const R2 = r + T.maxR;
    const cx0 = cellX(x - R2), cx1 = cellX(x + R2), cy0 = cellX(y - R2), cy1 = cellX(y + R2);
    const head = T.head, next = T.next, list = T.list;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * GW;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let j = head[row + cx]; j !== -1; j = next[j]) {
          const m = list[j];
          if (m.dead) continue;
          if (isAlly) { if (m.ai && m.ai.fainted) continue; }
          else if (m.passive && !incPassive) continue;
          const rr = r + (m.r || 0), dx = m.x - x, dy = m.y - y;
          if (dx * dx + dy * dy <= rr * rr) fn(m);
        }
      }
    }
  }
  function nearest(x, y, maxDist, team) {
    const isAlly = team === 'ally';
    const md = maxDist == null || !(maxDist > 0) ? Infinity : maxDist;
    let best = null, bd = md === Infinity ? Infinity : md * md;
    const T = isAlly ? HA : HE;
    if (!T.built || md > 900) {
      const L = isAlly ? G.allies : G.enemies;
      for (let i = 0; i < L.length; i++) {
        const m = L[i];
        if (!m || m.dead || (!isAlly && m.passive) || (m.ai && m.ai.fainted)) continue;
        const dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = m; }
      }
      return best;
    }
    const cx0 = cellX(x - md), cx1 = cellX(x + md), cy0 = cellX(y - md), cy1 = cellX(y + md);
    const head = T.head, next = T.next, list = T.list;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * GW;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let j = head[row + cx]; j !== -1; j = next[j]) {
          const m = list[j];
          if (m.dead || (!isAlly && m.passive) || (m.ai && m.ai.fainted)) continue;
          const dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = m; }
        }
      }
    }
    return best;
  }

  /* ================================================================ combat */
  const ELEM_COL = {
    fire: '#ffab40', poison: '#b2ff59', storm: '#ea80fc', water: '#80d8ff', web: '#e0f7fa', sound: '#b3e5fc',
    shadow: '#d1c4e9', spirit: '#a7ffeb', void: '#ea80fc', nature: '#ccff90', earth: '#ffe0b2', beast: '#bbdefb', physical: '#ffffff',
  };
  const TXT = { color: '#ffffff', size: 16, crit: false, life: 0.8, rise: 40 };
  function txt(x, y, str, color, size, crit, life, rise) {
    const Fx = F();
    if (!Fx || !Fx.text) return;
    TXT.color = color; TXT.size = size; TXT.crit = !!crit; TXT.life = life || 0.8; TXT.rise = rise || 40;
    Fx.text(x, y, str, TXT);
  }

  // 0 unknown, 1 player, 2 ally, 3 enemy, 4 dot
  function srcKind(src) {
    if (src == null) return 0;
    if (typeof src === 'string') {
      if (src === 'player' || src === 'playerSkill' || src === 'skill' || src === 'summon' || src === 'imperial') return 1;
      if (src === 'ally' || src === 'companion') return 2;
      if (src === 'enemy' || src === 'boss') return 3;
      if (src === 'dot') return 4;
      return 0;
    }
    if (typeof src !== 'object') return 0;
    if (src === G.player || src.team === 'player') return 1;
    if (src.team === 'ally' || src.companion) return 2;
    if (src.team === 'enemy') return 3;
    if (src.owner === 'player') return 1;
    return 0;
  }

  function damage(target, amount, opts) {
    if (!target || target.dead || !(amount > 0) || !isFinite(amount)) return 0;
    const o = opts || EMPTY;
    const p = G.player;
    if (target === p || target.team === 'player') return damagePlayer(amount, o.source);
    if (target.ai && target.ai.fainted) return 0;
    if (!(target.hp > 0)) return 0;
    const kind = srcKind(o.source);
    const st = p && p.stats;
    let dmg = amount;
    if (kind === 1 && st) dmg *= st.dmg > 0 ? st.dmg : 1;
    let crit = o.crit;
    if (crit == null) crit = (kind === 1 || kind === 2) && st ? random() < (st.crit || 0) : false;
    if (crit) dmg *= st ? max(1.25, st.critMul || 2) : 2;
    const before = target.hp;
    target.hp = before - dmg;
    const dealt = min(dmg, before);
    target.hitFlash = 1;

    const knock = o.knock > 0 ? +o.knock : 0;
    if (knock > 0) {
      let kx = +o.kx || 0, ky = +o.ky || 0;
      if (!(kx || ky)) {
        const s = o.source;
        if (s && typeof s === 'object' && isFinite(s.x)) { kx = target.x - s.x; ky = target.y - s.y; }
        else if (p) { kx = target.x - p.x; ky = target.y - p.y; }
      }
      const l = hypot(kx, ky) || 1;
      const v = (knock * 2.2 * (crit ? 1.3 : 1)) / max(0.6, target.mass || 1);
      target.knockX = (target.knockX || 0) + (kx / l) * v;
      target.knockY = (target.knockY || 0) + (ky / l) * v;
      const kl = hypot(target.knockX, target.knockY);
      if (kl > 900) { target.knockX *= 900 / kl; target.knockY *= 900 / kl; }
    }
    if (o.status && o.status.type) applyStatus(target, o.status.type, o.status.dur, o.status.power);

    if (target.team === 'enemy' && kind !== 3) {
      G.stats.damageDealt += dealt;
      if (kind === 1 && st && st.lifesteal > 0 && p && !p.dead) {
        R.lsAcc += dealt * st.lifesteal;
        if (R.lsAcc >= 1) { const h = floor(R.lsAcc); R.lsAcc -= h; heal(p, h); }
      }
    }
    if (!o.silent) hitFeedback(target, dmg, !!crit, kind, o.element);

    if (target.hp <= 0) {
      if (target.team === 'ally') target.hp = 0;
      else kill(target, { source: o.source, crit: !!crit, element: o.element });
    }
    return dealt;
  }

  function hitFeedback(t, dmg, crit, kind, element) {
    const Fx = F();
    const tn = now();
    const vis = SK.cam.inView(t.x, t.y, 40);
    if (Fx && vis && (R.txtBudget > 0 || (crit && R.txtBudget > -4))) {
      R.txtBudget--;
      let col = kind === 3 ? '#ff8a80' : kind === 2 ? '#b9f6ca' : ELEM_COL[element] || '#ffffff';
      let size = kind === 2 || kind === 3 ? 12 : t.boss ? 19 : dmg >= 100 ? 19 : 15;
      if (t.team === 'ally') { col = '#ff8a80'; size = 11; }
      txt(t.x + rand(-7, 7), t.y - (t.r || 16) - 4, fmtDmg(dmg), col, size, crit, crit ? 0.95 : 0.75, crit ? 50 : 38);
    }
    if (Fx && vis && crit && Fx.hit) {
      const p = G.player;
      Fx.hit(t.x, t.y, '#ffd54f', p ? atan2(t.y - p.y, t.x - p.x) : 0);
    }
    if (kind !== 3) {
      if (crit && tn - R.critSfxT > 0.07) { R.critSfxT = tn; sfx('crit', { vol: 0.55, pitch: rand(0.95, 1.1) }); }
      else if (tn - R.hitSfxT > 0.05) { R.hitSfxT = tn; sfx('hit', { vol: 0.32, pitch: rand(0.88, 1.15) }); }
      const big = (crit && (t.boss || dmg >= (t.maxHp || 1) * 0.3)) || (dmg >= (t.maxHp || 1) * 0.6 && (t.maxHp || 0) > 80);
      if (big && tn - R.hitstopT > 0.2) { R.hitstopT = tn; SK.time.hitstop(crit ? 0.035 : 0.025); }
    }
  }

  function damagePlayer(amount, source) {
    const p = G.player;
    if (!p || p.dead || !(amount > 0) || !isFinite(amount)) return 0;
    if (G.state !== 'play') return 0;
    if (p.invuln > 0) return 0;
    if (SK.debug && SK.debug.godmode) { p.invuln = 0.25; return 0; }
    let a = amount * (G.nightmare ? 1.1 : 1) - ((p.stats && p.stats.armor) || 0);
    a = max(amount * 0.2, a);
    const S = SK.Skills;
    if (S && S.onPlayerHit) {
      try { const r = S.onPlayerHit(G, p, a); if (typeof r === 'number' && isFinite(r)) a = r; } catch (e) { report('onPlayerHit', e); }
    }
    if (!(a > 0)) return 0;
    p.hp -= a;
    p.invuln = 0.6;
    p.hurtT = 0.4;
    p.blinkT = 0.6;
    let ang = random() * TAU;
    if (source && typeof source === 'object' && isFinite(source.x)) ang = atan2(p.y - source.y, p.x - source.x);
    const Fx = F();
    if (Fx) {
      Fx.vignette('#ff1744', 0.38, 0.45);
      if (Fx.hit) Fx.hit(p.x, p.y, '#ff5252', ang);
      txt(p.x + rand(-6, 6), p.y - p.r - 8, '-' + fmtDmg(a), '#ff5252', 17, false, 0.8, 42);
    }
    shake(4 + min(10, (a / max(1, p.maxHp)) * 45), 0.3);
    SK.cam.kick(cos(ang) * 5, sin(ang) * 5);
    vibrate(35);
    sfx('hurt', { vol: 0.8, pitch: rand(0.92, 1.08) });
    if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, ang + PI, clamp(0.5 + (a / max(1, p.maxHp)) * 4, 0.4, 1.6)); } catch (e) { /* cosmetic */ } }
    if (p.hp <= 0) {
      p.hp = 0;
      if (p.revives > 0) doRevive();
      else playerDie();
    }
    return a;
  }

  function heal(target, amount) {
    if (!target || !(amount > 0) || target.dead) return 0;
    const before = target.hp;
    target.hp = min(target.maxHp || before + amount, before + amount);
    const h = target.hp - before;
    if (target === G.player && h > 0) {
      R.healAcc += h;
      const tn = now();
      if (R.healAcc >= 2 && tn - R.healTxtT > 0.45) {
        txt(target.x + rand(-5, 5), target.y - target.r - 14, '+' + round(R.healAcc), '#69f0ae', 14, false, 0.7, 30);
        R.healAcc = 0; R.healTxtT = tn;
      }
    }
    return h;
  }

  function applyStatus(target, type, dur, power) {
    if (!target || target.dead || target === G.player) return;
    const s = target.status;
    if (!s) return;
    dur = +dur || 0; power = +power || 0;
    if (!(dur > 0)) return;
    switch (type) {
      case 'slow':
        s.slow = max(s.slow || 0, dur);
        s.slowAmt = max(s.slowAmt || 0, clamp(power || 0.3, 0, 0.85));
        break;
      case 'burn':
        s.burn = max(s.burn || 0, dur);
        s.burnDps = max(s.burnDps || 0, power);
        break;
      case 'poison':
        s.poison = max(s.poison || 0, dur);
        s.poisonDps = max(s.poisonDps || 0, power);
        break;
      case 'stun':
        if (!target.boss) s.stun = max(s.stun || 0, dur);
        break;
      default: break;
    }
  }

  function tickStatus(m, dt) {
    if (!m || !m.status || !(dt > 0)) return;
    const s = m.status;
    let dot = 0, burnHit = false;
    if (s.burn > 0) { s.burn = max(0, s.burn - dt); dot += (s.burnDps || 0) * dt; burnHit = true; if (s.burn <= 0) s.burnDps = 0; }
    if (s.poison > 0) { s.poison = max(0, s.poison - dt); dot += (s.poisonDps || 0) * dt; if (s.poison <= 0) s.poisonDps = 0; }
    if (s.slow > 0) { s.slow = max(0, s.slow - dt); if (s.slow <= 0) s.slowAmt = 0; }
    if (s.stun > 0) s.stun = max(0, s.stun - dt);
    if (!(dot > 0) || m.dead || !(m.hp > 0) || (m.ai && m.ai.fainted)) return;
    m.hp -= dot;
    if (m.team === 'enemy') G.stats.damageDealt += dot;
    m._dot = (m._dot || 0) + dot;
    m._dotT = (m._dotT || 0) + dt;
    if (m._dotT >= 0.5) {
      if (m._dot >= 1 && R.txtBudget > 0 && SK.cam.inView(m.x, m.y, 20)) {
        R.txtBudget--;
        txt(m.x + rand(-8, 8), m.y - (m.r || 14), fmtDmg(m._dot), burnHit ? '#ffab40' : '#b2ff59', 12, false, 0.6, 24);
      }
      m._dot = 0; m._dotT = 0;
    }
    if (m.hp <= 0) {
      if (m.team === 'ally') m.hp = 0;
      else kill(m, { source: 'dot' });
    }
  }

  const DEATH_SMALL = { count: 6, color: '#ffffff', speed: [40, 140], life: [0.2, 0.45], size: [2, 4], glow: true };
  function kill(m, opts) {
    if (!m || m.dead) return;
    if (m.team === 'ally') { m.hp = 0; return; }
    const o = opts || EMPTY;
    m.hp = 0;
    m.dead = true;
    G.kills++;
    const lt = lifetime();
    lt.kills = (lt.kills | 0) + 1;
    const absorbed = !!o.absorbed;
    if (absorbed) { G.stats.absorbed++; lt.absorbed = (lt.absorbed | 0) + 1; }
    const d = sv();
    if (m.type) {
      const b = d.bestiary || (d.bestiary = {});
      const e = b[m.type] || (b[m.type] = { seen: true, kills: 0, absorbed: 0 });
      e.seen = true;
      e.kills = (e.kills | 0) + 1;
      if (absorbed) e.absorbed = (e.absorbed | 0) + 1;
    }
    G.combo++;
    G.comboT = COMBO_WINDOW;
    if (G.combo > G.stats.maxCombo) G.stats.maxCombo = G.combo;
    if (G.combo % 25 === 0) comboMilestone(G.combo);
    G.score += round((m.xp || 1) * 10 * (m.elite ? 3 : 1) * (1 + min(2, G.combo * 0.01))) + (m.boss ? 5000 : 0);

    const W = SK.World;
    if (W && W.dropLoot) { try { W.dropLoot(G, m); } catch (e) { report('dropLoot', e); } }

    const Fx = F();
    const col = (m.def && m.def.color) || '#b388ff';
    if (Fx && SK.cam.inView(m.x, m.y, 40)) {
      if (R.fxKills < (q() === 0 ? 5 : 10) && Fx.death) { R.fxKills++; Fx.death(m.x, m.y, col, m.r || 16); }
      else { DEATH_SMALL.color = col; Fx.burst(m.x, m.y, DEATH_SMALL); }
    }
    const tn = now();
    if (tn - R.killSfxT > 0.06) { R.killSfxT = tn; sfx('kill', { vol: 0.45, pitch: rand(0.9, 1.15) }); }
    if (m.elite && !m.boss) {
      SK.time.slowmo(0.4, 0.35);
      if (Fx) { Fx.flash('#fff3c4', 0.22, 0.22); if (Fx.explosion) Fx.explosion(m.x, m.y, { radius: m.r * 2.4, color: col }); }
      shake(6, 0.3);
      vibrate(25);
    }
    if (m.boss) onBossDefeated(m);
    if ((G.kills & 31) === 0) checkAchievements('kills');
  }

  function comboMilestone(n) {
    sfx('combo', { pitch: 1 + min(0.9, n / 300), vol: 0.8 });
    const col = n >= 200 ? '#ff4081' : n >= 100 ? '#ffd54f' : n >= 50 ? '#ffab40' : '#80d8ff';
    toast('Combo ×' + n + '!', col);
    const p = G.player, Fx = F();
    if (Fx && p) Fx.ring(p.x, p.y, { radius: 90 + min(160, n * 0.6), color: col, life: 0.45, width: 4 });
    if (n === 100 || n === 500) checkAchievements('combo');
  }

  /* ================================================================ player */
  function xpFor(level) { return round(5 + level * 4.5 + pow(level, 1.7)); }
  function createPlayer(cfg) {
    return {
      x: 0, y: 0, vx: 0, vy: 0, r: 22, facing: 0, team: 'player', id: 'player', mass: 3,
      charName: cfg.name, race: cfg.race, cls: cfg.cls, color: cfg.color,
      hp: 100, maxHp: 100, mp: 100, maxMp: 100, level: 1, xp: 0, xpNext: xpFor(1),
      stage: 0,
      stats: {
        dmg: 1, speed: 1, cdr: 0, area: 1, magnet: 110, armor: 0, regen: 0, crit: 0.05, critMul: 2,
        projSpeed: 1, amount: 0, mpRegen: 4, luck: 1, xpMul: 1, soulMul: 1, lifesteal: 0, absorbMul: 1,
        masteryMul: 1, maxAllies: 6, allyDmg: 1, dashCdMul: 1,
      },
      perks: {}, skills: {}, mastery: {}, slots: [null, null, null], cooldowns: {}, skillState: {},
      invuln: 0, dashCd: 0, dashT: 0, absorbing: false, absorbT: 0,
      hurtT: 0, expression: 'idle', body: null, revives: 0, dead: false,
      absorbHint: false, dashX: 1, dashY: 0, flashT: 0, happyT: 0, blinkT: 0, deathT: 0, popT: 0,
    };
  }
  function radiusFor(stage) { return 22 * (1 + 0.1 * clamp(stage | 0, 0, 3)); }
  function mulHp(p, f) {
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    p.maxHp = max(1, round(p.maxHp * f));
    p.hp = max(1, round(p.maxHp * ratio));
  }
  function makeBody(p) {
    p.body = null;
    if (p.race === 'slime' && SK.Slime && SK.Slime.createBody) {
      try { p.body = SK.Slime.createBody(p.r); } catch (e) { report('createBody', e); }
    }
  }
  function markFound(id) {
    const d = sv();
    if (!d.skillsFound) d.skillsFound = {};
    d.skillsFound[id] = true;
  }
  function bindActives(p) {
    for (const id in p.skills) {
      const def = skillDef(id);
      if (!def || def.kind !== 'active' || !(p.skills[id] > 0)) continue;
      if (p.slots.indexOf(id) >= 0) continue;
      const free = p.slots.indexOf(null);
      if (free >= 0) p.slots[free] = id;
    }
    for (let i = 0; i < 3; i++) {
      const id = p.slots[i];
      if (id && !(p.skills[id] > 0)) p.slots[i] = null;
    }
  }

  function startDash(p, mx, my, ml) {
    let dx = mx, dy = my;
    if (ml < 0.15) { dx = cos(p.facing); dy = sin(p.facing); }
    const l = hypot(dx, dy) || 1;
    p.dashX = dx / l; p.dashY = dy / l;
    p.dashT = DASH_TIME;
    p.dashCd = DASH_CD * max(0.2, p.stats.dashCdMul || 1);
    p.invuln = max(p.invuln, DASH_TIME + 0.08);
    p.facing = atan2(p.dashY, p.dashX);
    sfx('dash', { vol: 0.7, pitch: rand(0.95, 1.08) });
    const Fx = F();
    if (Fx) {
      Fx.burst(p.x - p.dashX * p.r * 0.6, p.y - p.dashY * p.r * 0.6, {
        count: q() === 0 ? 6 : 12, colors: [p.color || '#4fc3ff', '#ffffff'], speed: [60, 200], life: [0.2, 0.45],
        size: [2, 4], angle: atan2(-p.dashY, -p.dashX), spread: 1.4, glow: true, shape: 'spark',
      });
      Fx.ring(p.x, p.y, { radius: p.r * 2.4, color: p.color || '#4fc3ff', life: 0.25, width: 3 });
    }
    SK.cam.kick(-p.dashX * 4, -p.dashY * 4);
    if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, p.facing + PI, 0.9); } catch (e) { /* cosmetic */ } }
    const S = SK.Skills;
    if (S && S.onDash) { try { S.onDash(G, p); } catch (e) { report('onDash', e); } }
    vibrate(10);
  }

  const BODY_OPTS = { absorbing: false, hurt: false, dash: false, stage: 0 };
  function updateBody(p, dt) {
    if (p.race !== 'slime' || !SK.Slime || !SK.Slime.updateBody) return;
    if (!p.body) makeBody(p);
    if (!p.body) return;
    BODY_OPTS.absorbing = p.absorbing; BODY_OPTS.hurt = p.hurtT > 0; BODY_OPTS.dash = p.dashT > 0; BODY_OPTS.stage = p.stage;
    try { SK.Slime.updateBody(p.body, p.x, p.y, p.vx, p.vy, dt, BODY_OPTS); } catch (e) { report('updateBody', e); }
  }

  function updatePlayer(dt) {
    const p = G.player;
    if (!p) return;
    const st = p.stats, inp = SK.input;
    p.invuln = max(0, p.invuln - dt);
    p.dashCd = max(0, p.dashCd - dt);
    p.hurtT = max(0, p.hurtT - dt);
    p.flashT = max(0, p.flashT - dt);
    p.happyT = max(0, p.happyT - dt);
    p.blinkT = max(0, p.blinkT - dt);
    p.popT = max(0, p.popT - dt);
    if (p.dead) {
      const k = exp(-5 * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.absorbing = false;
      p.expression = 'hurt';
      updateBody(p, dt);
      return;
    }
    let mx = inp.move.x || 0, my = inp.move.y || 0;
    let ml = hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; ml = 1; }

    if (inp.pressed.dash && p.dashCd <= 0 && p.dashT <= 0) startDash(p, mx, my, ml);
    const dashing = p.dashT > 0;
    if (dashing) p.dashT = max(0, p.dashT - dt);
    p.absorbing = !!inp.down.absorb && !dashing;

    const spd = BASE_SPEED * max(0.2, st.speed || 1);
    if (dashing) {
      p.vx = p.dashX * spd * DASH_MUL;
      p.vy = p.dashY * spd * DASH_MUL;
      const Fx = F();
      if (Fx && Fx.trail) Fx.trail(p, p.color || '#4fc3ff', p.r);
    } else {
      const top = spd * (p.absorbing ? ABSORB_SLOW : 1);
      const lam = ml > 0.05 ? 13 : 9;
      p.vx = U.damp(p.vx, mx * top, lam, dt);
      p.vy = U.damp(p.vy, my * top, lam, dt);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const W = SK.World;
    if (W && W.clamp) W.clamp(p);
    if (ml > 0.15) p.facing = U.lerpAngle(p.facing, atan2(my, mx), 1 - exp(-16 * dt));

    updateAbsorb(p, dt);

    if (st.regen > 0 && p.hp < p.maxHp) p.hp = min(p.maxHp, p.hp + st.regen * dt);
    if (p.mp < p.maxMp) p.mp = min(p.maxMp, p.mp + max(0, st.mpRegen || 0) * dt);

    if (p.hurtT > 0.05) p.expression = 'hurt';
    else if (p.absorbing) p.expression = 'eat';
    else if (dashing) p.expression = 'focus';
    else if (p.happyT > 0) p.expression = 'happy';
    else if (G.combo >= 15 || (G.boss && !G.boss.dead)) p.expression = 'angry';
    else p.expression = 'idle';

    updateBody(p, dt);

    for (let i = 0; i < 3; i++) if (inp.pressed['s' + (i + 1)]) castSlot(p, i);

    updateNaming(p);
    if (p.perks.imperialAura) updateAura(p, dt);
    if (p.perks.imperialJudgement) {
      R.judgeT += dt;
      if (R.judgeT >= JUDGE_EVERY) { R.judgeT -= JUDGE_EVERY; imperialJudgement(p); }
    }
  }

  function castSlot(p, i) {
    const id = p.slots[i];
    if (!id) {
      sfx('uiBack', { vol: 0.4 });
      txt(p.x, p.y - p.r - 20, 'Slot vuoto', '#b0bec5', 13, false, 0.7, 26);
      const tn = now();
      if (!R.slotHintShown || tn - R.slotHintT > 25) {
        R.slotHintShown = true; R.slotHintT = tn;
        oracle('《Slot vuoto. Sconfiggi un boss e divora la sua essenza per ottenere un\'abilità attiva.》');
      }
      return false;
    }
    const S = SK.Skills;
    if (!S || !S.cast) return false;
    let ok = false;
    try { ok = !!S.cast(G, p, i); } catch (e) { report('cast', e); }
    if (ok) {
      p.flashT = max(p.flashT, 0.12);
      if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, p.facing, 0.7); } catch (e) { /* cosmetic */ } }
    }
    return ok;
  }

  /* ---------------------------------------------------------------- Predatore */
  const VX = { count: 1, color: '#7c4dff', speed: [100, 100], life: [0.3, 0.3], size: [1.6, 3.2], glow: true, shape: 'spark', angle: 0, spread: 0.05, drag: 0 };
  const DEV = { count: 8, color: '#7c4dff', speed: [200, 300], life: [0.22, 0.34], size: [2, 4], glow: true, shape: 'spark', angle: 0, spread: 0.35, drag: 0 };
  const DV = { n: 0 };
  const HQ = { found: false };
  function absorbColor(p) {
    const st = p.stage | 0;
    return st >= 3 ? '#ffd54f' : st === 2 ? '#e040fb' : st === 1 ? '#18ffff' : '#7c4dff';
  }
  function updateAbsorb(p, dt) {
    const absR = absorbRadius(p);
    const Fx = F();
    if (p.absorbing) {
      if (!R.wasAbsorbing) {
        sfx('absorbStart', { vol: 0.7 });
        p.absorbT = 0;
        if (Fx) Fx.ring(p.x, p.y, { radius: absR * 0.5, color: absorbColor(p), life: 0.35, width: 3 });
        if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, p.facing, 0.6); } catch (e) { /* cosmetic */ } }
      }
      p.absorbT += dt;
      if (Fx) {
        const step = q() === 0 ? 0.05 : q() === 1 ? 0.03 : 0.018;
        R.vortexT -= dt;
        let n = 0;
        while (R.vortexT <= 0 && n < 3) {
          R.vortexT += step; n++;
          const a = random() * TAU, d = absR * (0.3 + random() * 0.7);
          const x = p.x + cos(a) * d, y = p.y + sin(a) * d;
          const spd = d * 2.6;
          VX.angle = atan2(p.y - y, p.x - x) + 0.12;
          VX.speed[0] = VX.speed[1] = spd;
          VX.life[0] = VX.life[1] = (d / spd) * 0.95;
          VX.color = random() < 0.3 ? '#ffffff' : random() < 0.5 ? (p.color || '#4fc3ff') : absorbColor(p);
          Fx.burst(x, y, VX);
        }
        if (R.vortexT < -0.2) R.vortexT = 0;
      }
      R.devourT -= dt;
      if (R.devourT <= 0) {
        R.devourT = 0.05;
        DV.n = 0;
        query(p.x, p.y, absR * 0.7, devourFn, 'enemy');
      }
    } else {
      p.absorbT = 0;
    }
    R.wasAbsorbing = p.absorbing;

    R.hintT -= dt;
    if (R.hintT <= 0) {
      R.hintT = 0.12;
      let h = false;
      const P = G.pickups, r2 = absR * absR;
      for (let i = 0; i < P.length; i++) {
        const pk = P[i];
        if (!pk || pk.dead || pk.kind !== 'essence') continue;
        const dx = pk.x - p.x, dy = pk.y - p.y;
        if (dx * dx + dy * dy < r2) { h = true; break; }
      }
      if (!h) { HQ.found = false; query(p.x, p.y, absR * 0.7, hintFn, 'enemy'); h = HQ.found; }
      p.absorbHint = h;
    }
  }
  function hintFn(m) { if (!m.boss && m.hp > 0 && m.hp <= m.maxHp * DEVOUR_FRAC) HQ.found = true; }
  function devourFn(m) {
    if (DV.n >= 3 || m.dead || m.boss || m.passive) return;
    if (!(m.hp > 0) || m.hp > m.maxHp * DEVOUR_FRAC) return;
    DV.n++;
    devour(m);
  }
  function devour(m) {
    const p = G.player;
    const col = (m.def && m.def.color) || '#7c4dff';
    const Fx = F();
    const d = hypot(p.x - m.x, p.y - m.y) || 1;
    const ang = atan2(p.y - m.y, p.x - m.x);
    if (Fx) {
      DEV.color = col;
      DEV.angle = ang;
      DEV.speed[0] = d * 2.6; DEV.speed[1] = d * 3.4;
      DEV.life[0] = DEV.life[1] = 0.3;
      Fx.burst(m.x, m.y, DEV);
      Fx.ring(m.x, m.y, { radius: (m.r || 14) * 2, color: col, life: 0.25, width: 3 });
    }
    kill(m, { absorbed: true, source: 'player' });
    heal(p, 2 + p.maxHp * 0.015);
    sfx('absorb', { pitch: rand(0.9, 1.25), vol: 0.65 });
    if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, ang + PI, 0.5); } catch (e) { /* cosmetic */ } }
    p.happyT = max(p.happyT, 0.35);
    if (!sv().achievements.first_meal) unlock('first_meal');
    if ((G.stats.absorbed % 20) === 0) checkAchievements('absorb');
  }

  /* ---------------------------------------------------------------- imperial perks */
  const AU = { dmg: 6, n: 0 };
  const AU_OPTS = { source: 'playerSkill', element: 'spirit', knock: 0, silent: true };
  const AU_MOTE = { count: 1, colors: ['#ffd54f', '#fff59d', '#ffffff'], speed: [10, 40], life: [0.6, 1.1], size: [1.4, 2.8], gravity: -50, glow: true, shape: 'star' };
  const AU_SPARK = { color: '#ffd54f', life: 0.25 };
  function auraFn(m) {
    damage(m, AU.dmg, AU_OPTS);
    if (!m.dead) applyStatus(m, 'slow', AURA_TICK * 1.8, 0.35);
    const Fx = F();
    if (Fx && AU.n++ < 3 && Fx.spark) Fx.spark(m.x, m.y, random() * TAU, AU_SPARK);
  }
  function updateAura(p, dt) {
    R.auraT -= dt;
    if (R.auraT > 0) return;
    R.auraT += AURA_TICK;
    if (R.auraT < 0) R.auraT = AURA_TICK;
    R.auraTick++;
    AU.dmg = 6 * p.level;
    AU.n = 0;
    AU_OPTS.silent = (R.auraTick & 3) !== 0;
    const rad = AURA_RADIUS * (p.stats.area || 1);
    query(p.x, p.y, rad, auraFn, 'enemy');
    const Fx = F();
    if (Fx) {
      const n = q() === 0 ? 1 : q() === 1 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const a = random() * TAU, d = sqrt(random()) * rad;
        Fx.burst(p.x + cos(a) * d, p.y + sin(a) * d, AU_MOTE);
      }
    }
  }
  const JUDGE_LINES = ['《Sentenza Imperiale.》', '《Giudizio emesso. Nessun appello.》', '《L\'Imperatore ha parlato.》', '《Verdetto: annientamento.》'];
  function imperialJudgement(p) {
    R.judgeCount++;
    const Fx = F();
    const base = 40 * p.level;
    let hits = 0;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (!m || m.dead || m.passive) continue;
      if (!SK.cam.inView(m.x, m.y, m.r || 20)) continue;
      if (Fx && hits < (q() === 0 ? 5 : 10) && Fx.beam) Fx.beam(m.x, m.y, { color: GOLD, width: (m.r || 16) * 2.2, height: 380, life: 0.7 });
      hits++;
      damage(m, m.boss ? base * 0.25 : base, { source: 'playerSkill', element: 'spirit', knock: 220, crit: m.boss ? false : undefined });
    }
    if (Fx) {
      Fx.flash(GOLD, 0.5, 0.55);
      Fx.ring(p.x, p.y, { radius: 720, color: GOLD, life: 0.9, width: 14 });
      Fx.ring(p.x, p.y, { radius: 420, color: '#ffffff', life: 0.6, width: 6 });
      if (Fx.lightRays) Fx.lightRays(p.x, p.y, { color: '#ffe082', count: 14, radius: 620, life: 1.2 });
    }
    sfx('thunder', { vol: 0.9, pitch: 0.85 });
    sfx('explosion', { vol: 0.6 });
    shake(10, 0.5);
    SK.time.hitstop(0.05);
    vibrate([20, 30, 40]);
    if (R.judgeCount === 1 || R.judgeCount % 3 === 0) oracle(U.choice(JUDGE_LINES), { important: true });
  }

  /* ---------------------------------------------------------------- revive & death */
  function doRevive() {
    const p = G.player;
    p.revives--;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.invuln = 2.5;
    p.flashT = 0.6;
    p.popT = 0.6;
    const Fx = F();
    if (Fx) {
      Fx.flash('#ffffff', 0.8, 0.6);
      if (Fx.evolveBurst) Fx.evolveBurst(p.x, p.y, GOLD);
      Fx.ring(p.x, p.y, { radius: 340, color: GOLD, life: 0.6, width: 10 });
      if (Fx.heal) Fx.heal(p.x, p.y);
    }
    const dmg = 80 + 15 * p.level;
    REV.p = p; REV.dmg = dmg;
    query(p.x, p.y, 340, reviveFn, 'enemy');
    SK.time.slowmo(0.3, 0.8);
    shake(14, 0.6);
    vibrate([40, 40, 80]);
    sfx('heal', { vol: 1 });
    sfx('evolve', { vol: 0.6, pitch: 1.2 });
    oracle('《Nucleo ricostruito. Rinascite rimaste: ' + p.revives + '.》', { important: true });
  }
  const REV = { p: null, dmg: 0 };
  const REV_OPTS = { source: 'playerSkill', element: 'spirit', knock: 420, kx: 0, ky: 0 };
  function reviveFn(m) {
    REV_OPTS.kx = m.x - REV.p.x; REV_OPTS.ky = m.y - REV.p.y;
    damage(m, m.boss ? REV.dmg * 0.3 : REV.dmg, REV_OPTS);
  }
  function playerDie() {
    const p = G.player;
    p.dead = true;
    p.deathT = 0;
    p.absorbing = false;
    p.expression = 'hurt';
    SK.time.slowmo(0.25, 1.4);
    const Fx = F();
    if (Fx) {
      if (Fx.death) Fx.death(p.x, p.y, p.color || '#4fc3ff', p.r * 1.6);
      Fx.flash('#ff1744', 0.45, 0.6);
      Fx.vignette('#000000', 0.6, 1.4);
      Fx.burst(p.x, p.y, { count: 30, colors: [p.color || '#4fc3ff', '#ffffff'], speed: [80, 320], life: [0.6, 1.3], size: [2, 5], glow: true, gravity: 120 });
    }
    shake(14, 0.8);
    vibrate([60, 40, 120]);
    sfx('hurt', { pitch: 0.6, vol: 1 });
    duck(0.7, 2);
    if (p.body && SK.Slime && SK.Slime.poke) { try { SK.Slime.poke(p.body, -HALF_PI, 1.6); } catch (e) { /* cosmetic */ } }
  }

  /* ================================================================ naming */
  function namedCount() {
    let n = 0;
    const A = G.allies;
    for (let i = 0; i < A.length; i++) if (A[i] && !A[i].companion) n++;
    return n;
  }
  function findNameCandidate(p) {
    let best = null, bd = Infinity;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (!m || m.dead || !m.passive || !m.nameable) continue;
      const dx = m.x - p.x, dy = m.y - p.y, lim = NAME_RANGE + (m.r || 0);
      const d2 = dx * dx + dy * dy;
      if (d2 < lim * lim && d2 < bd) { bd = d2; best = m; }
    }
    return best;
  }
  function updateNaming(p) {
    const cand = findNameCandidate(p);
    R.nameCand = cand;
    const btn = SK.input.button && SK.input.button('name');
    if (btn) { btn.visible = !!cand; btn.enabled = true; }
    if (cand && SK.input.pressed.name) tryName(cand);
  }
  function sanitizeName(s) {
    return String(s == null ? '' : s).replace(/[<>&"'`\\/{}[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }
  function tryName(m) {
    const p = G.player;
    if (!p || p.dead || !m || m.dead || !m.passive || G.state !== 'play') return false;
    const tn = now();
    if (namedCount() >= (p.stats.maxAllies | 0)) {
      sfx('uiBack');
      if (tn - R.fullHintT > 8) { R.fullHintT = tn; oracle('《Capacità del legame esaurita: non puoi guidare altri alleati (' + (p.stats.maxAllies | 0) + ').》'); }
      return false;
    }
    const cost = p.maxMp * NAME_COST;
    if (p.mp < cost - 1e-6) {
      sfx('uiBack');
      txt(p.x, p.y - p.r - 20, 'MP insufficienti', '#82b1ff', 14, false, 0.8, 28);
      if (tn - R.mpHintT > 6) { R.mpHintT = tn; oracle('《Magicule insufficienti. Servono ' + round(cost) + ' MP per assegnare un nome.》'); }
      return false;
    }
    const suggestion = randomName();
    const UI = SK.UI;
    if ((SK.debug && SK.debug.autoplay) || !UI || !UI.namingDialog) { confirmName(m, suggestion); return true; }
    G.state = 'dialog';
    R.naming = m;
    sfx('ui');
    const done = () => { R.naming = null; if (G.state === 'dialog') G.state = 'play'; };
    try {
      UI.namingDialog(m, suggestion, (name) => { done(); confirmName(m, name); }, done);
    } catch (e) { report('namingDialog', e); done(); confirmName(m, suggestion); }
    return true;
  }
  function confirmName(m, name) {
    const p = G.player;
    if (!p || p.dead || !m || m.dead || m.team !== 'enemy' || G.enemies.indexOf(m) < 0) return false;
    if (namedCount() >= (p.stats.maxAllies | 0)) return false;
    const nm = sanitizeName(name) || randomName();
    const cost = p.maxMp * NAME_COST;
    if (p.mp < cost - 1e-6) return false;
    p.mp -= cost;
    const E = SK.Enemies;
    let ok = false;
    if (E && E.makeAlly) { try { ok = !!E.makeAlly(G, m, nm); } catch (e) { report('makeAlly', e); } }
    if (!ok) {
      const i = G.enemies.indexOf(m);
      if (i >= 0) G.enemies.splice(i, 1);
      m.team = 'ally'; m.passive = false; m.nameable = false; m.name = nm; m.evolved = true;
      m.maxHp = round(m.maxHp * 3); m.hp = m.maxHp;
      if (G.allies.indexOf(m) < 0) G.allies.push(m);
      sfx('name');
    }
    const N = SK.Nation;
    if (N && N.onNamed) { try { N.onNamed(nm, m.type); } catch (e) { report('Nation.onNamed', e); } }
    G.stats.named++;
    const lt = lifetime();
    lt.named = (lt.named | 0) + 1;
    const def = m.def || enemyType(m.type) || EMPTY;
    const form = def.allyName ? def.allyName : 'un tuo fedele alleato';
    oracle('《Nome assegnato: ' + nm + '. Il legame dell\'anima è stabilito: ora è ' + form + '.》', { important: G.stats.named === 1 });
    const Fx = F();
    if (Fx) {
      if (Fx.sparkle) Fx.sparkle(m.x, m.y - m.r, GOLD);
      txt(m.x, m.y - m.r - 24, nm, GOLD, 18, false, 1.4, 34);
    }
    p.happyT = 1.5;
    vibrate(25);
    checkAchievements('name');
    return true;
  }

  /* ================================================================ random names */
  const SYL_A = ['Gor', 'Ka', 'Sel', 'Mor', 'Va', 'Ty', 'Lu', 'Bran', 'Ze', 'Fi', 'Al', 'Dra', 'No', 'Ser', 'Quel', 'Ar', 'Bel', 'Cor', 'Fen', 'Il', 'Jor', 'Mi', 'Or', 'Pa', 'Ru', 'Sa', 'Ta', 'Vel', 'Ys', 'Zor', 'Ae', 'Eli', 'Gal', 'Ne', 'Ol', 'Pyr', 'Rha', 'Sil', 'Tor', 'Ul', 'Kre', 'Dho', 'Ema', 'Fa', 'Gri', 'Lo', 'Nim', 'Ri'];
  const SYL_B = ['ta', 'gu', 'ra', 'li', 'do', 've', 'na', 'sa', 'mo', 'ka', 'le', 'ro', 'ni', 'za', 'ma', 'bel', 'dan', 'lin', 'the', 'vi', 'go', 'ri', 'nu', 'ze'];
  const SYL_C = ['ra', 'nn', 'th', 'l', 's', 'ar', 'en', 'o', 'a', 'is', 'el', 'ix', 'on', 'um', 'yr', 'ia', 'ek', 'an', 'or', 'ius', 'ard', 'ine', 'eth'];
  const NAME_BLOCK = ['rimuru', 'benimaru', 'shuna', 'shion', 'souei', 'soei', 'gobta', 'ranga', 'rigurd', 'riguru', 'milim', 'veldora', 'diablo', 'geld', 'gabiru', 'hakurou', 'kurobe', 'shizu', 'treyni', 'rigur', 'gobzo', 'gobichi', 'kaijin', 'ramiris', 'clayman', 'hinata', 'gazel', 'leon', 'guy', 'luminus', 'dagruel', 'carrion', 'frey', 'veldanava', 'ciel', 'raphael', 'tempest'];
  function randomName() {
    for (let tries = 0; tries < 12; tries++) {
      const a = U.choice(SYL_A);
      const roll = random();
      let n;
      if (roll < 0.4) n = a + U.choice(SYL_B);
      else if (roll < 0.75) n = a + U.choice(SYL_C);
      else n = a + U.choice(SYL_B) + U.choice(SYL_C);
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
      if (n.length < 3 || n.length > 10) continue;
      if (/(.)\1\1/.test(n)) continue;
      const low = n.toLowerCase();
      let bad = false;
      for (let i = 0; i < NAME_BLOCK.length; i++) if (low === NAME_BLOCK[i] || (NAME_BLOCK[i].length > 4 && low.indexOf(NAME_BLOCK[i]) === 0)) { bad = true; break; }
      if (!bad) return n;
    }
    return U.choice(['Gorta', 'Velin', 'Korra', 'Sildan', 'Mirael', 'Zornar']);
  }

  /* ================================================================ skills & essences */
  function essenceFor(m) {
    if (!m) return null;
    if (m.essence && skillDef(m.essence)) return m.essence;
    const def = m.def || enemyType(m.type) || EMPTY;
    if (def.biome === 'demon' && !m.boss) {
      const p = G.player;
      if (!p) return null;
      let pick = null, cnt = 0, fallback = null, fcnt = 0;
      for (const id in p.skills) {
        if (!(p.skills[id] > 0) || !skillDef(id)) continue;
        fcnt++; if (random() * fcnt < 1) fallback = id;
        if (p.skills[id] < skillMax(id)) { cnt++; if (random() * cnt < 1) pick = id; }
      }
      return pick || fallback;
    }
    return null;
  }

  function grantSkill(skillId, opts) {
    const p = G.player;
    const def = skillDef(skillId);
    if (!p || !def) return false;
    const o = opts || EMPTY;
    const cur = p.skills[skillId] | 0;
    const mx = skillMax(skillId);
    const Fx = F();
    if (!cur) {
      p.skills[skillId] = clamp(o.level | 0 || 1, 1, mx);
      p.mastery[skillId] = 0;
      markFound(skillId);
      let slotMsg = '';
      if (def.kind === 'active') {
        if (p.slots.indexOf(skillId) < 0) {
          let idx = p.slots.indexOf(null);
          if (idx < 0) {
            idx = 2;
            slotMsg = ' Sostituisce ' + skillName(p.slots[2]) + ' nello slot 3.';
          } else slotMsg = ' Assegnata allo slot ' + (idx + 1) + '.';
          p.slots[idx] = skillId;
        }
        if (p.cooldowns) p.cooldowns[skillId] = 0;
      }
      const unique = def.kind === 'active' || !!o.boss;
      oracle('《Analisi completata. Abilità ' + (unique ? 'unica ' : '') + 'acquisita: ' + def.name + '.' + slotMsg + '》', { important: unique });
      if (Fx) {
        if (Fx.lightRays) Fx.lightRays(p.x, p.y, { color: def.color || '#80d8ff', count: 10, radius: 220, life: 1.0 });
        Fx.ring(p.x, p.y, { radius: 120, color: def.color || '#80d8ff', life: 0.5, width: 6 });
        if (Fx.sparkle) Fx.sparkle(p.x, p.y - p.r, def.color || '#80d8ff');
      }
      txt(p.x, p.y - p.r - 26, def.name + '!', def.color || '#80d8ff', 17, false, 1.3, 40);
      sfx('skillGet');
      vibrate(30);
      p.happyT = 1.2;
      p.flashT = 0.25;
      checkAchievements('skills');
      return true;
    }
    if (cur >= mx) return false;
    p.skills[skillId] = min(mx, cur + max(1, o.levels | 0 || 1));
    txt(p.x, p.y - p.r - 24, def.name + ' Lv ' + p.skills[skillId], def.color || '#80d8ff', 15, false, 1.1, 36);
    if (Fx) Fx.ring(p.x, p.y, { radius: 80, color: def.color || '#80d8ff', life: 0.4, width: 4 });
    sfx('skillGet', { pitch: 1.15, vol: 0.8 });
    return true;
  }

  function absorbEssence(skillId, from) {
    const p = G.player;
    const def = skillDef(skillId);
    if (!p || !def) return;
    G.stats.absorbed++;
    const lt = lifetime();
    lt.absorbed = (lt.absorbed | 0) + 1;
    markFound(skillId);
    const ft = enemyType(from);
    const fromBoss = !!(ft && ft.boss);
    const cur = p.skills[skillId] | 0;
    if (!cur) { grantSkill(skillId, { boss: fromBoss }); return; }
    const mx = skillMax(skillId);
    if (cur >= mx) {
      gainXp(max(3, p.xpNext * 0.18) / max(0.01, p.stats.xpMul || 1));
      heal(p, p.maxHp * 0.08);
      txt(p.x, p.y - p.r - 22, 'Essenza assimilata', def.color || '#b388ff', 13, false, 0.9, 30);
      return;
    }
    const gain = max(0.25, p.stats.masteryMul || 1);
    p.mastery[skillId] = (p.mastery[skillId] || 0) + gain;
    let ups = 0;
    while (p.mastery[skillId] >= 4 && cur + ups < mx) { p.mastery[skillId] -= 4; ups++; }
    if (ups > 0) {
      p.skills[skillId] = min(mx, cur + ups);
      if (p.skills[skillId] >= mx) p.mastery[skillId] = 0;
      oracle('《Maestria completata. ' + def.name + ' sale al Lv ' + p.skills[skillId] + (p.skills[skillId] >= mx ? ' (MAX)' : '') + '.》');
      const Fx = F();
      if (Fx) {
        Fx.ring(p.x, p.y, { radius: 110, color: def.color || '#b388ff', life: 0.45, width: 5 });
        if (Fx.sparkle) Fx.sparkle(p.x, p.y - p.r, def.color || '#b388ff');
      }
      sfx('skillGet', { pitch: 1.25 });
      p.happyT = 0.8;
    } else {
      txt(p.x, p.y - p.r - 22, def.name + ' · Maestria ' + floor(p.mastery[skillId]) + '/4', def.color || '#b388ff', 13, false, 1.0, 30);
    }
  }

  function chestReward(pk) {
    const p = G.player;
    if (!p) return;
    const ups = [];
    for (const id in p.skills) if (p.skills[id] > 0 && p.skills[id] < skillMax(id) && skillDef(id)) ups.push(id);
    let msg;
    if (ups.length && random() < 0.65) {
      const id = U.choice(ups);
      grantSkill(id);
      msg = 'Forziere: ' + skillName(id) + ' Lv ' + p.skills[id];
    } else {
      p.stats.dmg *= 1.05;
      heal(p, p.maxHp * 0.3);
      p.mp = min(p.maxMp, p.mp + p.maxMp * 0.3);
      msg = 'Forziere: Danno +5% e cure';
    }
    const souls = 5 * (p.stats.soulMul || 1);
    G.soulsEarned += souls;
    gainXp(max(4, p.xpNext * 0.25) / max(0.01, p.stats.xpMul || 1));
    toast(msg + ' · +' + round(souls) + ' Anime', '#ffd54f');
    G.score += 250;
  }

  function onPickup(pk) {
    const p = G.player;
    if (!pk || !p || p.dead) return;
    switch (pk.kind) {
      case 'xp': gainXp(+pk.value || 1); break;
      case 'essence': absorbEssence(pk.skillId, pk.from); break;
      case 'heart': heal(p, 10 + p.maxHp * 0.2); break;
      case 'magicule': {
        const before = p.mp;
        p.mp = min(p.maxMp, p.mp + p.maxMp * 0.35);
        const g = p.mp - before;
        if (g >= 1) txt(p.x, p.y - p.r - 14, '+' + round(g) + ' MP', '#82b1ff', 13, false, 0.7, 28);
        break;
      }
      case 'chest': chestReward(pk); break;
      case 'soul': {
        const v = (+pk.value || 1) * (p.stats.soulMul || 1);
        G.soulsEarned += v;
        G.score += round(v * 20);
        break;
      }
      default: break;
    }
  }

  /* ================================================================ XP & level-up */
  function gainXp(amount) {
    const p = G.player;
    if (!p || p.dead || !(amount > 0)) return;
    p.xp += amount * (p.stats.xpMul || 1);
    let guard = 0;
    while (p.xp >= p.xpNext && guard++ < 50) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      R.pendingLevels++;
      heal(p, p.maxHp * 0.08);
      for (let i = 0; i < EVO_LEVELS.length; i++) {
        if (p.level === EVO_LEVELS[i]) {
          const target = i + 1;
          if (target > p.stage && target > R.pendingEvolve) R.pendingEvolve = target;
        }
      }
      if (p.level === 30) checkAchievements('level');
    }
    if (guard > 0) levelUpFx(p);
  }
  function levelUpFx(p) {
    const tn = now();
    if (tn - R.lvFxT < 0.25) return;
    R.lvFxT = tn;
    const Fx = F();
    if (Fx) {
      if (Fx.levelUpBurst) Fx.levelUpBurst(p.x, p.y);
      else {
        Fx.ring(p.x, p.y, { radius: 130, color: GOLD, life: 0.55, width: 7 });
        Fx.burst(p.x, p.y, { count: 24, colors: [GOLD, '#ffffff', '#80d8ff'], speed: [80, 260], life: [0.4, 0.9], size: [2, 4], glow: true, shape: 'star' });
      }
    }
    sfx('levelup');
    p.flashT = 0.3;
    p.happyT = 1;
    p.popT = 0.4;
    SK.time.slowmo(0.45, 0.25);
    if (R.lvDelay <= 0) R.lvDelay = 0.3;
  }

  const RARITIES = ['comune', 'raro', 'epico', 'leggendario'];
  const STAT_CARDS = [
    { stat: 'dmg', title: 'Furia del Predatore', vals: [0.08, 0.14, 0.22, 0.35], desc: (v) => 'Danno +' + fmtPct(v), apply: (p, v) => { p.stats.dmg *= 1 + v; } },
    { stat: 'maxHp', title: 'Gelatina Robusta', vals: [0.1, 0.18, 0.28, 0.45], desc: (v) => 'PV massimi +' + fmtPct(v) + ' e cura completa del bonus', apply: (p, v) => { const add = p.maxHp * v; p.maxHp = round(p.maxHp + add); p.hp = min(p.maxHp, p.hp + add); } },
    { stat: 'speed', title: 'Scivolata Rapida', vals: [0.05, 0.08, 0.12, 0.18], desc: (v) => 'Velocità +' + fmtPct(v), apply: (p, v) => { p.stats.speed *= 1 + v; } },
    { stat: 'cdr', title: 'Flusso di Magicule', vals: [0.04, 0.06, 0.09, 0.13], desc: (v) => 'Ricarica abilità −' + fmtPct(v), ok: (p) => p.stats.cdr < 0.6, apply: (p, v) => { p.stats.cdr = min(0.6, p.stats.cdr + v); } },
    { stat: 'area', title: 'Espansione', vals: [0.08, 0.13, 0.2, 0.3], desc: (v) => 'Area delle abilità e del Predatore +' + fmtPct(v), apply: (p, v) => { p.stats.area *= 1 + v; } },
    { stat: 'magnet', title: 'Attrazione', vals: [0.2, 0.35, 0.55, 0.9], desc: (v) => 'Raggio di raccolta +' + fmtPct(v), apply: (p, v) => { p.stats.magnet *= 1 + v; } },
    { stat: 'crit', title: 'Occhio Critico', vals: [0.03, 0.05, 0.08, 0.12], desc: (v) => 'Probabilità di critico +' + fmtPct(v), ok: (p) => p.stats.crit < 0.9, apply: (p, v) => { p.stats.crit = min(0.9, p.stats.crit + v); } },
    { stat: 'regen', title: 'Rigenerazione Cellulare', vals: [0.5, 1, 1.6, 2.5], desc: (v) => 'Rigenerazione +' + v + ' PV/s', apply: (p, v) => { p.stats.regen += v; } },
    { stat: 'mpRegen', title: 'Sorgente Interiore', vals: [1, 1.8, 2.8, 4], desc: (v) => 'Rigenerazione MP +' + v + '/s e MP massimi +' + round(v * 6), apply: (p, v) => { p.stats.mpRegen += v; p.maxMp = round(p.maxMp + v * 6); p.mp = min(p.maxMp, p.mp + v * 6); } },
    { stat: 'amount', title: 'Moltiplicazione', vals: [1, 1, 1, 2], minRarity: 2, desc: (v) => '+' + v + (v > 1 ? ' proiettili' : ' proiettile') + ' per abilità', ok: (p) => p.stats.amount < 4, apply: (p, v) => { p.stats.amount += v; } },
    { stat: 'armor', title: 'Pelle di Roccia', vals: [1, 1, 2, 3], desc: (v) => 'Armatura +' + v, ok: (p) => p.stats.armor < 15, apply: (p, v) => { p.stats.armor += v; } },
    { stat: 'lifesteal', title: 'Sete Vitale', vals: [0.01, 0.02, 0.03, 0.05], minRarity: 1, desc: (v) => 'Rubavita +' + fmtPct(v), ok: (p) => p.stats.lifesteal < 0.25, apply: (p, v) => { p.stats.lifesteal += v; } },
  ];
  function rollRarity(luck) {
    const l = max(0.5, luck || 1);
    const w0 = 60, w1 = 28, w2 = 10 * l, w3 = 2.5 * l;
    let r = random() * (w0 + w1 + w2 + w3);
    if ((r -= w0) < 0) return 0;
    if ((r -= w1) < 0) return 1;
    if ((r -= w2) < 0) return 2;
    return 3;
  }
  function buildChoices() {
    const p = G.player;
    const st = p.stats;
    const luck = st.luck || 1;
    let count = 3;
    if (random() < clamp((luck - 1) * 2, 0, 1)) count = 4;
    const skillCards = [];
    for (const id in p.skills) {
      const L = p.skills[id] | 0;
      const def = skillDef(id);
      if (!def || L <= 0 || L >= skillMax(id)) continue;
      let desc = '';
      try { desc = def.levelDesc ? String(def.levelDesc(L + 1) || '') : ''; } catch (e) { desc = ''; }
      skillCards.push({
        id: 'skill:' + id, title: def.name, desc: desc || def.desc || 'Potenzia l\'abilità.',
        rarity: L + 1 >= skillMax(id) ? 'epico' : L >= 2 ? 'raro' : 'comune',
        icon: { skillId: id }, tag: 'Lv ' + (L + 1), _kind: 'skill', _skill: id,
      });
    }
    U.shuffle(skillCards);
    const statPool = [];
    for (let i = 0; i < STAT_CARDS.length; i++) {
      const c = STAT_CARDS[i];
      if (c.ok && !c.ok(p)) continue;
      statPool.push(c);
    }
    U.shuffle(statPool);
    const out = [];
    if (random() < 0.06 * luck) {
      const S = SK.Skills;
      const autos = (S && S.autoIds) || [];
      const fresh = [];
      for (let i = 0; i < autos.length; i++) if (!(p.skills[autos[i]] > 0) && skillDef(autos[i])) fresh.push(autos[i]);
      if (fresh.length) {
        const id = U.choice(fresh);
        const def = skillDef(id);
        out.push({ id: 'new:' + id, title: def.name, desc: def.desc || 'Una nuova abilità automatica.', rarity: 'leggendario', icon: { skillId: id }, tag: 'NUOVO', _kind: 'new', _skill: id });
      }
    }
    let si = 0, ti = 0;
    while (out.length < count && (si < skillCards.length || ti < statPool.length)) {
      const wantSkill = si < skillCards.length && (ti >= statPool.length || random() < 0.55);
      if (wantSkill) out.push(skillCards[si++]);
      else {
        const c = statPool[ti++];
        let r = rollRarity(luck);
        if (c.minRarity && r < c.minRarity) r = c.minRarity;
        const v = c.vals[r];
        out.push({ id: 'stat:' + c.stat, title: c.title, desc: c.desc(v), rarity: RARITIES[r], icon: { stat: c.stat }, _kind: 'stat', _card: c, _val: v });
      }
    }
    if (!out.length) out.push(potionCard());
    return out;
  }
  function potionCard() {
    return { id: 'potion', title: 'Pozione di Gelatina', desc: 'Recupera il 40% dei PV e 30 MP.', rarity: 'comune', icon: { stat: 'potion' }, _kind: 'potion' };
  }
  function applyChoice(c) {
    const p = G.player;
    if (!p) return;
    const ch = c || potionCard();
    switch (ch._kind) {
      case 'skill':
      case 'new':
        grantSkill(ch._skill);
        break;
      case 'stat':
        try { ch._card.apply(p, ch._val); } catch (e) { report('statCard', e); }
        txt(p.x, p.y - p.r - 22, ch.title, '#ffe082', 14, false, 1.0, 34);
        break;
      default:
        heal(p, p.maxHp * 0.4);
        p.mp = min(p.maxMp, p.mp + 30);
        break;
    }
    const Fx = F();
    if (Fx) Fx.ring(p.x, p.y, { radius: 90, color: ch.rarity === 'leggendario' ? GOLD : '#80d8ff', life: 0.4, width: 4 });
  }
  function openLevelUp() {
    const p = G.player;
    if (!p || R.lvOpen) return;
    G.state = 'levelup';
    R.lvOpen = true;
    R.lvBotT = 0;
    const choices = buildChoices();
    R.lvChoices = choices;
    const UI = SK.UI;
    if (UI && UI.levelUp) {
      try { UI.levelUp(choices, (choice) => onLevelPick(choice)); return; } catch (e) { report('ui.levelUp', e); }
    }
    onLevelPick(choices[0]);
  }
  function onLevelPick(choice) {
    if (!R.lvOpen) return;
    R.lvOpen = false;
    R.lvChoices = null;
    applyChoice(choice);
    R.pendingLevels = max(0, R.pendingLevels - 1);
    if (G.state === 'levelup') G.state = 'play';
    if (R.pendingLevels > 0) R.lvDelay = 0.12;
    SK.input.clear();
  }

  /* ================================================================ evolution */
  const EVO_COL = ['#4fc3ff', '#18ffff', '#e040fb', '#ffd54f'];
  function startEvolve(target) {
    const p = G.player;
    R.pendingEvolve = 0;
    if (!p || p.dead || target <= p.stage) return;
    G.state = 'evolve';
    const col = EVO_COL[clamp(target, 0, 3)];
    R.evo = { t: 0, target, applied: false, step: 0, color: col, zoom0: SK.cam.zoomMul || 1 };
    p.absorbing = false;
    p.vx = p.vy = 0;
    p.dashT = 0;
    sfx('evolve');
    duck(0.5, 3.4);
    vibrate([20, 50, 20]);
    const Fx = F();
    if (Fx) {
      if (Fx.converge) Fx.converge(p.x, p.y, { radius: 260, count: 44, color: col, life: 0.9 });
      if (Fx.beam) Fx.beam(p.x, p.y, { color: col, width: 90, height: 520, life: 1.6 });
      if (Fx.lightRays) Fx.lightRays(p.x, p.y, { color: col, count: 10, radius: 320, life: 1.6 });
    }
    SK.input.clear();
  }
  function updateEvolve(raw) {
    const e = R.evo, p = G.player;
    if (!e || !p) { G.state = 'play'; R.evo = null; return; }
    e.t += raw;
    const cam = SK.cam;
    if (e.t < 0.8) cam.zoomMul = U.lerp(e.zoom0, 1.45, U.ease.outCubic(e.t / 0.8));
    else if (e.t < 2.4) cam.zoomMul = 1.45 + (e.applied ? 0.08 * exp(-(e.t - 1.55) * 4) : 0);
    else cam.zoomMul = U.lerp(1.45, 1, U.ease.inOutCubic(clamp((e.t - 2.4) / 0.6, 0, 1)));
    const Fx = F();
    if (Fx && Fx.converge) {
      if (e.step === 0 && e.t >= 0.5) { e.step = 1; Fx.converge(p.x, p.y, { radius: 220, count: 36, color: '#ffffff', life: 0.7 }); }
      if (e.step === 1 && e.t >= 1.0) { e.step = 2; Fx.converge(p.x, p.y, { radius: 180, count: 40, color: e.color, life: 0.5 }); sfx('absorbStart', { pitch: 1.4, vol: 0.6 }); }
    }
    if (!e.applied && e.t >= 1.55) applyEvolution(e);
    p.flashT = e.applied ? max(0, 0.6 - (e.t - 1.55)) : min(0.9, e.t / 1.55);
    p.expression = e.applied ? 'happy' : 'focus';
    updateBody(p, raw);
    if (Fx) Fx.update(raw * 0.8);
    const UI = SK.UI;
    if (UI && UI.update) { try { UI.update(raw); } catch (err) { report('ui.update', err); } }
    cam.follow(p.x, p.y, raw);
    if (e.t >= 3.0) {
      R.evo = null;
      G.state = 'play';
      cam.zoomMul = 1;
      p.invuln = max(p.invuln, 1.2);
      SK.time.slowmo(0.5, 0.4);
      SK.input.clear();
    }
  }
  const EVO_OPTS = { source: 'playerSkill', element: 'spirit', knock: 380, kx: 0, ky: 0, crit: true };
  function applyEvolution(e) {
    const p = G.player;
    e.applied = true;
    const from = p.stage | 0;
    p.stage = max(p.stage | 0, e.target);
    mulHp(p, 1.25);
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.stats.dmg *= 1.12;
    p.stats.speed *= 1.06;
    p.r = radiusFor(p.stage);
    makeBody(p);
    p.popT = 0.8;
    const lt = lifetime();
    lt.evolutions = (lt.evolutions | 0) + 1;
    const Fx = F();
    if (Fx) {
      if (Fx.evolveBurst) Fx.evolveBurst(p.x, p.y, e.color);
      Fx.flash('#ffffff', 0.85, 0.5);
      Fx.ring(p.x, p.y, { radius: 700, color: e.color, life: 0.8, width: 16 });
      Fx.ring(p.x, p.y, { radius: 380, color: '#ffffff', life: 0.55, width: 8 });
    }
    shake(14, 0.7);
    vibrate([40, 30, 80]);
    sfx('explosion', { vol: 0.7, pitch: 0.8 });
    const nm = stageName(p);
    banner('EVOLUZIONE!', nm, { color: e.color, duration: 2.6 });
    oracle('《Evoluzione completata. Nuova forma: ' + nm + '. Tutti i parametri sono aumentati.》', { important: true });
    const base = 30 + 10 * p.level;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (!m || m.dead || m.passive || !SK.cam.inView(m.x, m.y, 60)) continue;
      EVO_OPTS.kx = m.x - p.x; EVO_OPTS.ky = m.y - p.y;
      damage(m, m.boss ? base * 0.3 : base, EVO_OPTS);
    }
    if (from < 1 && p.stage >= 1) unlock('evolve1');
    if (p.stage >= 3) unlock('evolve3');
  }

  /* ================================================================ bosses, biomes, victory */
  const BOSS_LINES = {
    abyss_serpent: '《Minaccia eliminata: Serpe Nera degli Abissi. Il sigillo della caverna si sta dissolvendo.》',
    alpha_wolf: '《Il Lupo Alfa è caduto. La Luna Cremisi si spegne e la foresta respira di nuovo.》',
    orc_tyrant: '《Il Tiranno degli Orchi è stato annientato. La sua fame ora ti appartiene.》',
    demon_lord: '《Il Re Demone Caduto è stato sconfitto. Un nuovo sovrano sorge: tu.》',
  };
  function onBossDefeated(boss) {
    if (!boss) return;
    const key = boss.type + ':' + boss.id;
    if (R.bossesDone[key]) return;
    R.bossesDone[key] = true;
    const p = G.player;
    const Fx = F();
    if (Fx) {
      if (Fx.explosion) Fx.explosion(boss.x, boss.y, { radius: (boss.r || 60) * 2.6, color: (boss.def && boss.def.color) || '#ff1744', shake: 0 });
      Fx.flash('#ffffff', 0.7, 0.5);
      Fx.ring(boss.x, boss.y, { radius: 520, color: (boss.def && boss.def.color) || '#ff1744', life: 0.8, width: 14 });
      if (Fx.lightRays) Fx.lightRays(boss.x, boss.y, { color: '#fff59d', count: 14, radius: 420, life: 1.5 });
    }
    SK.time.slowmo(0.25, 1.2);
    shake(16, 1);
    vibrate([60, 40, 60, 40, 120]);
    sfx('bossDie');
    const N = SK.Nation;
    if (N && N.onBossDefeated) { try { N.onBossDefeated(boss.type); } catch (e) { report('Nation.onBossDefeated', e); } }
    oracle(BOSS_LINES[boss.type] || '《Minaccia di classe calamità eliminata.》', { important: true });
    unlock('boss_' + boss.type);
    if (p) { p.invuln = max(p.invuln, 2.5); p.happyT = 2; }
    later(1.2, () => { if (G.boss === boss) G.boss = null; });
    if (boss.type === 'demon_lord' || (G.biome | 0) >= 3) {
      R.victoryQueued = true;
      if (p) p.invuln = 99;
      later(2, victory);
    } else {
      later(2.6, () => {
        const W = SK.World;
        if (W && W.spawnPortal && !W.portal && G.state !== 'title') {
          try { W.spawnPortal(G, boss.x, boss.y); } catch (e) { report('spawnPortal', e); }
        }
      });
    }
  }

  function nextBiome() {
    if (G.state === 'transition' || G.state === 'title' || R.ended) return;
    if ((G.biome | 0) >= 3) { victory(); return; }
    const p = G.player;
    G.state = 'transition';
    R.trans = { t: 0 };
    R.fadeMode = 1;
    const bonus = (15 + 15 * (G.biome | 0)) * ((p && p.stats.soulMul) || 1);
    G.soulsEarned += bonus;
    G.score += 1000 * ((G.biome | 0) + 1);
    toast('Bioma completato! +' + round(bonus) + ' Anime', '#e1bee7');
    sfx('portal', { pitch: 0.8 });
    SK.input.clear();
  }
  function updateTransition(raw) {
    const tr = R.trans;
    if (!tr) { G.state = 'play'; return; }
    tr.t += raw;
    R.fadeA = clamp(tr.t / 1.0, 0, 1);
    const Fx = F();
    if (Fx) Fx.update(raw);
    if (tr.t >= 1.0) {
      R.trans = null;
      const p = G.player;
      const Sk = SK.Skills;
      if (Sk && Sk.clear) { try { Sk.clear(); } catch (e) { report('Skills.clear', e); } }
      if (Fx) Fx.clear();
      const W = SK.World;
      const nb = min(3, (G.biome | 0) + 1);
      if (W && W.reset) { try { W.reset(); } catch (e) { report('World.reset', e); } }
      if (W && W.startBiome) { try { W.startBiome(G, nb); } catch (e) { report('startBiome', e); G.biome = nb; G.biomeT = 0; } }
      else { G.biome = nb; G.biomeT = 0; }
      G.boss = null;
      G.portal = null;
      if (p) {
        p.vx = p.vy = 0;
        p.invuln = 2;
        heal(p, p.maxHp * 0.3);
        p.mp = min(p.maxMp, p.mp + p.maxMp * 0.5);
        p.absorbing = false;
        makeBody(p);
      }
      let hasCompanion = false;
      for (let i = 0; i < G.allies.length; i++) {
        const a = G.allies[i];
        if (!a) continue;
        if (a.companion) hasCompanion = true;
        if (a.ai && a.ai.fainted) a.ai.faintT = 0.05;
      }
      if (!hasCompanion) {
        const N = SK.Nation;
        if (N && N.spawnCompanions) { try { N.spawnCompanions(G); } catch (e) { report('spawnCompanions', e); } }
      }
      const d = sv();
      if ((d.best.biome | 0) < nb + 1) d.best.biome = nb + 1;
      writeSave();
      G.state = 'play';
      R.fadeMode = -1;
      R.fadeA = 1;
      SK.cam.zoomMul = 1;
      SK.input.clear();
    }
  }

  function victory() {
    if (R.ended) return;
    R.ended = true;
    G.state = 'victory';
    const p = G.player;
    const d = sv();
    d.wins = (d.wins | 0) + 1;
    d.nightmare = true;
    const bonus = 150 * ((p && p.stats.soulMul) || 1) * (G.nightmare ? 2 : 1);
    G.soulsEarned += bonus;
    G.score += 25000;
    unlock('win');
    if (G.nightmare) unlock('win_nightmare');
    const summary = finalizeRun(true);
    music('victory');
    sfx('victory');
    const Fx = F();
    if (Fx && p) {
      Fx.flash('#fff8e1', 0.8, 0.8);
      if (Fx.lightRays) Fx.lightRays(p.x, p.y, { color: GOLD, count: 18, radius: 700, life: 2.4 });
    }
    if (SK.input.button) { const b = SK.input.button('name'); if (b) b.visible = false; }
    uiShow('victory', summary);
  }

  function gameOver() {
    if (R.ended) return;
    R.ended = true;
    G.state = 'gameover';
    const summary = finalizeRun(false);
    music(null);
    sfx('gameover');
    if (SK.input.button) { const b = SK.input.button('name'); if (b) b.visible = false; }
    uiShow('gameover', summary);
  }

  function finalizeRun(won) {
    const p = G.player;
    const d = sv();
    const best = d.best || (d.best = { time: 0, kills: 0, level: 0, biome: 0, score: 0 });
    const souls = max(0, round(G.soulsEarned));
    const summary = {
      won: !!won, time: G.t, kills: G.kills, level: p ? p.level : 1, score: round(G.score), souls,
      biome: G.biome | 0, stage: p ? p.stage : 0, stageName: p ? stageName(p) : '',
      absorbed: G.stats.absorbed, named: G.stats.named, maxCombo: G.stats.maxCombo, damage: round(G.stats.damageDealt),
      newRecord: false,
    };
    if (R.finalized) { summary.souls = 0; return summary; }
    R.finalized = true;
    summary.newRecord = G.t > 5 && (round(G.score) > (best.score | 0) || G.t > (best.time || 0));
    d.souls = (d.souls | 0) + souls;
    d.totalSouls = (d.totalSouls | 0) + souls;
    best.time = max(best.time || 0, G.t);
    best.kills = max(best.kills | 0, G.kills);
    best.level = max(best.level | 0, p ? p.level : 1);
    best.biome = max(best.biome | 0, (G.biome | 0) + 1);
    best.score = max(best.score | 0, round(G.score));
    checkAchievements('end');
    writeSave();
    return summary;
  }

  /* ================================================================ shop */
  const shopItems = [
    { id: 'vitality', name: 'Vitalità', desc: '+10% PV massimi per livello.', maxLevel: 10, cost: (l) => round(25 * pow(1.4, l)), apply(p, l) { mulHp(p, 1 + 0.1 * l); p.hp = p.maxHp; } },
    { id: 'power', name: 'Potenza', desc: '+6% danno per livello.', maxLevel: 10, cost: (l) => round(30 * pow(1.42, l)), apply(p, l) { p.stats.dmg *= 1 + 0.06 * l; } },
    { id: 'agility', name: 'Agilità', desc: '+4% velocità e −6% ricarica dello scatto per livello.', maxLevel: 5, cost: (l) => round(40 * pow(1.6, l)), apply(p, l) { p.stats.speed *= 1 + 0.04 * l; p.stats.dashCdMul *= max(0.4, 1 - 0.06 * l); } },
    { id: 'magicule', name: 'Riserva di Magicule', desc: '+15 MP massimi e +0,8 MP/s per livello.', maxLevel: 5, cost: (l) => round(35 * pow(1.55, l)), apply(p, l) { p.maxMp += 15 * l; p.mp = p.maxMp; p.stats.mpRegen += 0.8 * l; } },
    { id: 'greed', name: 'Avidità', desc: '+12% Anime ottenute per livello.', maxLevel: 5, cost: (l) => round(60 * pow(1.7, l)), apply(p, l) { p.stats.soulMul *= 1 + 0.12 * l; } },
    { id: 'magnet', name: 'Magnetismo', desc: '+20% raggio di raccolta per livello.', maxLevel: 5, cost: (l) => round(20 * pow(1.5, l)), apply(p, l) { p.stats.magnet *= 1 + 0.2 * l; } },
    { id: 'revive', name: 'Rinascita', desc: '+1 rinascita per corsa: risorgi con PV pieni e un\'onda d\'urto.', maxLevel: 2, cost: (l) => (l <= 0 ? 250 : 700), apply(p, l) { p.revives += l; } },
    { id: 'wisdom', name: 'Saggezza', desc: '+8% esperienza ottenuta per livello.', maxLevel: 5, cost: (l) => round(40 * pow(1.6, l)), apply(p, l) { p.stats.xpMul *= 1 + 0.08 * l; } },
    { id: 'armor', name: 'Corazza di Gelatina', desc: '+1 armatura per livello: riduce ogni colpo subito.', maxLevel: 5, cost: (l) => round(50 * pow(1.65, l)), apply(p, l) { p.stats.armor += l; } },
    { id: 'luck', name: 'Fortuna', desc: '+10% fortuna per livello: carte più rare, più bottino, 4ª carta.', maxLevel: 5, cost: (l) => round(45 * pow(1.6, l)), apply(p, l) { p.stats.luck *= 1 + 0.1 * l; } },
  ];

  /* ================================================================ achievements */
  const achievements = [
    { id: 'first_meal', name: 'Primo Boccone', desc: 'Divora il tuo primo mostro con il Predatore.' },
    { id: 'evolve1', name: 'Metamorfosi', desc: 'Raggiungi la prima evoluzione.' },
    { id: 'evolve3', name: 'Forma Suprema', desc: 'Raggiungi l\'ultima evoluzione.' },
    { id: 'name1', name: 'Il Potere del Nome', desc: 'Dai il nome al tuo primo mostro.' },
    { id: 'name5', name: 'Padre della Nazione', desc: 'Dai il nome a 5 mostri in totale.' },
    { id: 'absorb100', name: 'Stomaco Senza Fondo', desc: 'Divora 100 tra mostri ed essenze in totale.' },
    { id: 'combo100', name: 'Catena Furiosa', desc: 'Raggiungi una combo di 100.' },
    { id: 'combo500', name: 'Tempesta Inarrestabile', desc: 'Raggiungi una combo di 500.' },
    { id: 'kills1000', name: 'Mietitore di Mostri', desc: 'Sconfiggi 1000 mostri in totale.' },
    { id: 'level30', name: 'Leggenda Vivente', desc: 'Raggiungi il livello 30 in una corsa.' },
    { id: 'skills10', name: 'Collezionista di Essenze', desc: 'Scopri 10 abilità diverse.' },
    { id: 'boss_abyss_serpent', name: 'Domatore degli Abissi', desc: 'Sconfiggi la Serpe Nera degli Abissi.' },
    { id: 'boss_alpha_wolf', name: 'Luna Spezzata', desc: 'Sconfiggi il Lupo Alfa della Luna Cremisi.' },
    { id: 'boss_orc_tyrant', name: 'Fine della Tirannia', desc: 'Sconfiggi il Tiranno degli Orchi.' },
    { id: 'boss_demon_lord', name: 'Ammazzademoni', desc: 'Sconfiggi il Re Demone Caduto.' },
    { id: 'married', name: 'Promessa Eterna', desc: 'Celebra il tuo primo matrimonio nella Nazione.' },
    { id: 'win', name: 'Nuovo Re Demone', desc: 'Completa una corsa.' },
    { id: 'win_nightmare', name: 'Incubo Domato', desc: 'Completa una corsa in modalità Incubo.' },
    { id: 'souls1000', name: 'Tesoriere delle Anime', desc: 'Accumula 1000 Anime in totale.' },
  ];
  const ACH_BY_ID = {};
  for (let i = 0; i < achievements.length; i++) ACH_BY_ID[achievements[i].id] = achievements[i];
  function unlock(id) {
    const a = ACH_BY_ID[id];
    if (!a) return false;
    const d = sv();
    if (!d.achievements) d.achievements = {};
    if (d.achievements[id]) return false;
    d.achievements[id] = true;
    writeSave();
    if (G.state !== 'title') {
      toast('Obiettivo sbloccato: ' + a.name, GOLD);
      sfx('chest', { vol: 0.5, pitch: 1.3 });
    }
    return true;
  }
  function checkAchievements() {
    const d = sv();
    const lt = lifetime();
    const p = G.player;
    if (G.stats.maxCombo >= 100) unlock('combo100');
    if (G.stats.maxCombo >= 500) unlock('combo500');
    if ((lt.kills | 0) >= 1000) unlock('kills1000');
    if ((lt.absorbed | 0) >= 100) unlock('absorb100');
    if ((lt.named | 0) >= 1 || G.stats.named >= 1) unlock('name1');
    if ((lt.named | 0) >= 5) unlock('name5');
    if (p && p.level >= 30) unlock('level30');
    if (p && p.stage >= 1 && p.cls !== 'pierfrancesco' && (lt.evolutions | 0) >= 1) unlock('evolve1');
    if (p && p.stage >= 3) unlock('evolve3');
    let found = 0;
    if (d.skillsFound) for (const k in d.skillsFound) if (d.skillsFound[k]) found++;
    if (found >= 10) unlock('skills10');
    if ((d.totalSouls | 0) >= 1000) unlock('souls1000');
    if (d.nation && (d.nation.weddings | 0) >= 1) unlock('married');
  }

  /* ================================================================ run lifecycle */
  function cleanupModules() {
    const Fx = F();
    if (Fx && Fx.clear) { try { Fx.clear(); } catch (e) { report('FX.clear', e); } }
    const S = SK.Skills;
    if (S && S.clear) { try { S.clear(); } catch (e) { report('Skills.clear', e); } }
    const E = SK.Enemies;
    if (E && E.clear) { try { E.clear(); } catch (e) { report('Enemies.clear', e); } }
    const W = SK.World;
    if (W && W.reset) { try { W.reset(); } catch (e) { report('World.reset', e); } }
    const t = SK.time;
    t.hitstopT = 0; t.slowT = 0; t.slowScale = 1;
    SK.cam.zoomMul = 1;
    HE.built = HA.built = false;
  }
  function normCfg(cfg) {
    const base = sv().character || {};
    const c = cfg && typeof cfg === 'object' ? cfg : base;
    const C = SK.Character;
    let race = c.race || base.race || 'slime';
    if (C && C.races && !C.races[race]) race = 'slime';
    let cls = c.cls != null ? c.cls : base.cls;
    if (C && C.classes && cls && !C.classes[cls]) cls = null;
    const color = /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? c.color : base.color || '#4fc3ff';
    const name = sanitizeName(c.name || base.name) || 'Pierfrancesco';
    return { name, race, cls: cls || null, color, nightmare: !!c.nightmare };
  }
  function newRun(cfg) {
    const c = normCfg(cfg);
    cleanupModules();
    const UI = SK.UI;
    if (UI && UI.hideAll) { try { UI.hideAll(); } catch (e) { report('ui.hideAll', e); } }
    const C = SK.Character;
    if (C && C.isOpen && C.closeCreator) { try { if (C.isOpen()) C.closeCreator(false, true); } catch (e) { report('closeCreator', e); } }

    G = SK.G = makeG('play');
    R = makeRun();
    G.nightmare = c.nightmare && !!sv().nightmare;
    const p = createPlayer(c);
    G.player = p;

    if (C && C.applyRace) { try { C.applyRace(p); } catch (e) { report('applyRace', e); } }
    if (C && C.applyClass) { try { C.applyClass(p); } catch (e) { report('applyClass', e); } }
    const ups = sv().upgrades || {};
    for (let i = 0; i < shopItems.length; i++) {
      const it = shopItems[i];
      const lv = clamp(ups[it.id] | 0, 0, it.maxLevel);
      if (lv > 0) { try { it.apply(p, lv); } catch (e) { report('shop.apply', e); } }
    }
    const N = SK.Nation;
    if (N && N.applyBonuses) { try { N.applyBonuses(p); } catch (e) { report('Nation.applyBonuses', e); } }

    const race = C && C.races && C.races[p.race];
    const start = (race && race.startSkill) || (p.race === 'slime' ? 'water_blade' : null);
    if (start && skillDef(start) && !(p.skills[start] > 0)) { p.skills[start] = 1; p.mastery[start] = 0; }
    if (p.race === 'wolf' && skillDef('needle_storm') && !(p.skills.needle_storm > 0)) { p.skills.needle_storm = 1; p.mastery.needle_storm = 0; }
    let hasAuto = false;
    for (const id in p.skills) { const d = skillDef(id); if (d && d.kind === 'auto' && p.skills[id] > 0) hasAuto = true; }
    if (!hasAuto && skillDef('water_blade')) { p.skills.water_blade = 1; p.mastery.water_blade = 0; }
    for (const id in p.skills) { if (!(p.mastery[id] >= 0)) p.mastery[id] = 0; if (p.skills[id] > 0) markFound(id); }
    bindActives(p);
    p.stats.cdr = clamp(p.stats.cdr, 0, 0.6);
    p.maxHp = max(1, round(p.maxHp));
    p.maxMp = max(10, round(p.maxMp));
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    p.stage = clamp(p.stage | 0, 0, 3);
    p.r = radiusFor(p.stage);
    p.xpNext = xpFor(p.level);
    makeBody(p);

    const d = sv();
    d.runs = (d.runs | 0) + 1;
    writeSave();

    const startB = clamp((SK.debug && SK.debug.startBiome) | 0, 0, 3);
    const W = SK.World;
    if (W && W.startBiome) { try { W.startBiome(G, startB); } catch (e) { report('startBiome', e); G.biome = startB; } }
    else G.biome = startB;
    if (N && N.spawnCompanions) { try { N.spawnCompanions(G); } catch (e) { report('spawnCompanions', e); } }

    SK.cam.snap(p.x, p.y);
    SK.cam.zoomMul = 1;
    SK.input.enabled = true;
    SK.input.clear();
    const nb = SK.input.button && SK.input.button('name');
    if (nb) nb.visible = false;
    R.fadeMode = -1;
    R.fadeA = 1;
    p.invuln = 1.5;
    p.popT = 0.6;
    later(1.2, () => {
      if (G.player === p) oracle('《Avvio completato. Benvenuto, ' + p.charName + '. Forma attuale: ' + stageName(p) + '. Predatore pronto.》');
    });
    BOT.t = 0;
    return G;
  }

  function pause() {
    if (G.state !== 'play') return false;
    G.state = 'paused';
    if (!uiOpen('pause')) uiShow('pause');
    return true;
  }
  function resume() {
    if (G.state !== 'paused') return false;
    G.state = 'play';
    if (uiOpen('pause')) uiHide('pause');
    SK.input.clear();
    SK.input.enabled = true;
    return true;
  }
  function quitToTitle() {
    if (G.player && G.state !== 'title' && !R.finalized) finalizeRun(false);
    cleanupModules();
    G = SK.G = makeG('title');
    R = makeRun();
    TITLE.t = 0; TITLE.biome = -1; TITLE.stageShow = -1;
    const nb = SK.input.button && SK.input.button('name');
    if (nb) nb.visible = false;
    SK.input.clear();
    if (!uiOpen('title')) uiShow('title');
    music('title');
    BOT.t = 0;
    return true;
  }

  /* ================================================================ title attract mode */
  const TITLE = { t: 0, biome: -1, stageShow: -1, stageT: 0, gradKey: '', gradL: null, gradV: null };
  const TITLE_BIOME_TIME = 16;
  function updateTitle(raw) {
    TITLE.t += raw;
    const bi = floor(TITLE.t / TITLE_BIOME_TIME) % 4;
    if (bi !== TITLE.biome) {
      TITLE.biome = bi;
      G.biome = bi;
      const Fx = F();
      if (Fx && Fx.clear) Fx.clear();
    }
    const t = TITLE.t;
    const R0 = arenaRadius() * 0.45;
    SK.cam.zoomMul = 1.05;
    SK.cam.snap(cos(t * 0.045 + bi * 1.7) * R0, sin(t * 0.032 + bi) * R0 * 0.7);
    const Fx = F();
    const b = biomeDef(bi);
    if (Fx) {
      if (b && Fx.ambient) { try { Fx.ambient(b, raw); } catch (e) { report('ambient', e); } }
      Fx.update(raw);
    }
    const UI = SK.UI;
    if (UI && UI.update) { try { UI.update(raw); } catch (e) { report('ui.update', e); } }
  }
  function titleCharacter() {
    const c = sv().character || {};
    return { name: c.name || 'Pierfrancesco', race: c.race || 'slime', cls: c.cls || null, color: c.color || '#4fc3ff' };
  }
  function renderTitle(ctx) {
    const W = SK.W, H = SK.H, t = TITLE.t;
    const b = biomeDef(G.biome);
    ctx.fillStyle = (b && b.palette && b.palette.bg) || '#07060f';
    ctx.fillRect(0, 0, W, H);
    const cam = SK.cam;
    const Wd = SK.World;
    cam.begin(ctx);
    if (Wd && Wd.renderBackground) { try { Wd.renderBackground(ctx, G); } catch (e) { report('title.bg', e); } }
    const Fx = F();
    if (Fx) { try { Fx.render(ctx); } catch (e) { report('title.fx', e); } }
    if (Wd && Wd.renderForeground && q() > 0) { try { Wd.renderForeground(ctx, G); } catch (e) { report('title.fg', e); } }
    cam.end(ctx);

    const key = W + 'x' + H;
    if (TITLE.gradKey !== key) {
      TITLE.gradKey = key;
      const gl = ctx.createLinearGradient(0, 0, W * 0.62, 0);
      gl.addColorStop(0, 'rgba(4,2,14,0.82)');
      gl.addColorStop(0.55, 'rgba(4,2,14,0.35)');
      gl.addColorStop(1, 'rgba(4,2,14,0)');
      TITLE.gradL = gl;
      const gv = ctx.createRadialGradient(W * 0.5, H * 0.5, min(W, H) * 0.3, W * 0.5, H * 0.5, max(W, H) * 0.75);
      gv.addColorStop(0, 'rgba(0,0,0,0)');
      gv.addColorStop(1, 'rgba(0,0,0,0.7)');
      TITLE.gradV = gv;
    }
    ctx.fillStyle = TITLE.gradV; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = TITLE.gradL; ctx.fillRect(0, 0, W, H);

    // biome crossfade
    const local = t % TITLE_BIOME_TIME;
    const fade = local < 0.9 ? 1 - local / 0.9 : local > TITLE_BIOME_TIME - 0.9 ? (local - (TITLE_BIOME_TIME - 0.9)) / 0.9 : 0;

    // hero portrait (right half)
    const ch = titleCharacter();
    const cyc = floor(t / 7) % 4;
    const stage = ch.cls === 'pierfrancesco' ? max(1, cyc) : cyc;
    if (stage !== TITLE.stageShow) {
      if (TITLE.stageShow >= 0) TITLE.stageT = t;
      TITLE.stageShow = stage;
    }
    const size = min(H * 0.62, W * 0.36);
    const px = W * 0.72, py = H * 0.54 + sin(t * 1.3) * size * 0.02;
    const col = EVO_COL[stage] || ch.color;
    if (Fx && Fx.drawGlow) {
      Fx.drawGlow(ctx, px, py, size * 0.75, ch.color, 0.28 + 0.06 * sin(t * 2));
      Fx.drawGlow(ctx, px, py + size * 0.05, size * 0.45, col, 0.22);
    }
    // rotating rune ring behind the hero
    ctx.save();
    ctx.translate(px, py + size * 0.26);
    ctx.scale(1, 0.32);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = U.rgba(col, 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.48, 0, TAU); ctx.stroke();
    ctx.strokeStyle = U.rgba(ch.color, 0.25);
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = t * 0.4 + (i / 12) * TAU;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.4, a, a + 0.3);
      ctx.stroke();
    }
    ctx.restore();
    const Ch = SK.Character;
    let drawn = false;
    if (Ch && Ch.renderPortrait) {
      try { Ch.renderPortrait(ctx, px, py, size, ch.race, stage, ch.color, t, { cls: ch.cls, demo: true, key: 'title' }); drawn = true; } catch (e) { report('title.portrait', e); }
    }
    if (!drawn && SK.Slime && SK.Slime.renderPortrait) {
      try { SK.Slime.renderPortrait(ctx, px, py, size, stage, t, { color: ch.color, crown: ch.cls === 'pierfrancesco' }); } catch (e) { report('title.slime', e); }
    }
    // evolution showcase pulse
    const st = t - TITLE.stageT;
    if (TITLE.stageT > 0 && st < 0.9) {
      const k = st / 0.9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = U.rgba(col, (1 - k) * 0.8);
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(px, py, size * (0.25 + k * 0.5), 0, TAU); ctx.stroke();
      if (Fx && Fx.drawGlow) Fx.drawGlow(ctx, px, py, size * 0.6, '#ffffff', (1 - k) * 0.5);
      ctx.restore();
    }
    // caption
    const fs = clamp(round(size * 0.075), 13, 24);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + fs + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    const cy = py + size * 0.47;
    ctx.strokeText(ch.name, px, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch.name, px, cy);
    ctx.font = '600 ' + round(fs * 0.72) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const sn = stageName({ race: ch.race, stage, cls: ch.cls });
    ctx.strokeText(sn, px, cy + fs * 1.05);
    ctx.fillStyle = col;
    ctx.fillText(sn, px, cy + fs * 1.05);
    ctx.restore();

    if (fade > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + fade.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (Fx && Fx.renderScreen) { try { Fx.renderScreen(ctx); } catch (e) { report('title.screen', e); } }
  }

  /* ================================================================ main update */
  function updatePlay(dt, raw) {
    const p = G.player;
    tickTimers(raw);
    if (R.fadeMode < 0) { R.fadeA = max(0, R.fadeA - raw / 0.8); if (R.fadeA <= 0) R.fadeMode = 0; }
    if (!p) return;
    if (dt > 0) {
      G.t += dt;
      rebuildHash();
      const W = SK.World;
      if (W && W.update) { try { W.update(G, dt); } catch (e) { report('World.update', e); } }
      if (G.state !== 'play') return;
      try { updatePlayer(dt); } catch (e) { report('player', e); }
      if (G.state !== 'play' && G.state !== 'dialog') return;
      const S = SK.Skills;
      if (S && S.update) { try { S.update(G, dt); } catch (e) { report('Skills.update', e); } }
      const E = SK.Enemies;
      if (E && E.update) { try { E.update(G, dt); } catch (e) { report('Enemies.update', e); } }
      removeDead();
      if (G.combo > 0) { G.comboT -= dt; if (G.comboT <= 0) { G.combo = 0; G.comboT = 0; } }
    }
    const Fx = F();
    if (Fx) { try { Fx.update(dt); } catch (e) { report('FX.update', e); } }
    const UI = SK.UI;
    if (UI && UI.update) { try { UI.update(raw); } catch (e) { report('UI.update', e); } }
    const bossOn = !!(G.boss && !G.boss.dead);
    R.zoomTarget = bossOn ? 0.9 : 1;
    if (G.state === 'play') SK.cam.zoomMul = U.damp(SK.cam.zoomMul || 1, R.zoomTarget, 3, raw);
    SK.cam.follow(p.x + p.vx * 0.12, p.y + p.vy * 0.12, dt > 0 ? dt : raw * 0.05);

    if (p.dead) {
      p.deathT += raw;
      if (p.deathT >= 1.2 && !R.ended) gameOver();
      return;
    }
    if (G.state !== 'play') return;
    if (R.pendingEvolve > (p.stage | 0)) { startEvolve(R.pendingEvolve); return; }
    if (R.pendingLevels > 0 && !R.victoryQueued) {
      R.lvDelay -= raw;
      if (R.lvDelay <= 0) { R.lvDelay = 0; openLevelUp(); }
    }
  }

  function removeDead() {
    const E = G.enemies;
    let w = 0;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (m && !m.dead) E[w++] = m;
    }
    E.length = w;
    if (E.length > MAX_ENEMIES + 20) {
      let excess = E.length - MAX_ENEMIES;
      for (let i = 0; i < E.length && excess > 0; i++) {
        const m = E[i];
        if (m.boss || m.elite || m.passive || SK.cam.inView(m.x, m.y, 80)) continue;
        m.dead = true; excess--;
      }
      let w2 = 0;
      for (let i = 0; i < E.length; i++) if (!E[i].dead) E[w2++] = E[i];
      E.length = w2;
    }
    if (G.boss && G.boss.dead && !R.bossesDone[G.boss.type + ':' + G.boss.id]) onBossDefeated(G.boss);
    const A = G.allies;
    let wa = 0;
    for (let i = 0; i < A.length; i++) {
      const m = A[i];
      if (m && (m.team === 'ally' || m.companion || !m.dead)) A[wa++] = m;
    }
    A.length = wa;
  }

  function update(dt, rawDt) {
    const raw = rawDt > 0 ? rawDt : dt > 0 ? dt : 0;
    R.txtBudget = q() === 0 ? 6 : q() === 1 ? 9 : 13;
    R.fxKills = 0;
    try {
      switch (G.state) {
        case 'title':
          updateTitle(raw);
          break;
        case 'play':
          if (SK.input.pressed.pause && G.player && !G.player.dead) { pause(); break; }
          updatePlay(dt, raw);
          break;
        case 'evolve':
          updateEvolve(raw);
          break;
        case 'transition':
          updateTransition(raw);
          break;
        case 'levelup':
        case 'dialog': {
          const Fx = F();
          if (Fx) Fx.update(raw * 0.4);
          if (G.player) updateBody(G.player, raw * 0.5);
          const UI = SK.UI;
          if (UI && UI.update) UI.update(raw);
          if (G.state === 'levelup' && !R.lvOpen) G.state = 'play';
          break;
        }
        case 'paused': {
          const UI = SK.UI;
          if (UI && UI.update) UI.update(raw);
          break;
        }
        case 'gameover':
        case 'victory': {
          const Fx = F();
          if (G.state === 'victory' && Fx) victoryFireworks(raw, Fx);
          if (Fx) Fx.update(dt > 0 ? dt : raw);
          const UI = SK.UI;
          if (UI && UI.update) UI.update(raw);
          if (G.player) SK.cam.follow(G.player.x, G.player.y, raw);
          break;
        }
        default: break;
      }
      if (G.state !== 'play' && G.state !== 'title') {
        const nb = SK.input.button && SK.input.button('name');
        if (nb && G.state !== 'levelup' && G.state !== 'dialog' && G.state !== 'paused') nb.visible = false;
      }
      if (SK.debug && SK.debug.autoplay) botUpdate(raw);
    } catch (e) {
      report('update', e);
    }
  }

  const FW = { count: 26, colors: null, speed: [80, 300], life: [0.7, 1.4], size: [2, 4], gravity: 90, glow: true, shape: 'star', drag: 1.5 };
  const FW_COLS = [['#ffd54f', '#fff59d', '#ffffff'], ['#e040fb', '#ff80ab', '#ffffff'], ['#18ffff', '#80d8ff', '#ffffff'], ['#69f0ae', '#b9f6ca', '#ffffff']];
  function victoryFireworks(raw, Fx) {
    R.victoryFxT -= raw;
    if (R.victoryFxT > 0) return;
    R.victoryFxT = q() === 0 ? 0.6 : 0.32;
    const v = SK.cam.view;
    const x = rand(v.x0 + 60, v.x1 - 60), y = rand(v.y0 + 40, U.lerp(v.y0, v.y1, 0.6));
    FW.colors = U.choice(FW_COLS);
    FW.count = q() === 0 ? 14 : 26;
    Fx.burst(x, y, FW);
    Fx.ring(x, y, { radius: 90, color: FW.colors[0], life: 0.5, width: 3 });
    sfx('explosion', { vol: 0.25, pitch: rand(1.3, 1.7) });
  }

  /* ================================================================ render */
  const PO = { facing: 0, expression: 'idle', absorbing: false, absorbT: 0, flash: 0, alpha: 1, scale: 1, stage: 0 };
  const DASH_PATTERN = [12, 16], NO_DASH = [];
  function renderPlayer(ctx, p) {
    let alpha = 1, scale = 1;
    if (p.dead) {
      const k = clamp(p.deathT / 1.2, 0, 1);
      alpha = 1 - U.ease.inCubic(k);
      scale = 1 + k * 0.5;
      if (alpha <= 0.01) return;
    } else if (p.blinkT > 0 && p.invuln > 0 && p.dashT <= 0) {
      alpha = (floor(SK.time.t * 18) & 1) ? 0.45 : 1;
    }
    if (p.popT > 0) scale *= 1 + 0.18 * sin((p.popT / 0.8) * PI) * (p.popT / 0.8);
    PO.facing = p.facing;
    PO.expression = p.expression;
    PO.absorbing = p.absorbing;
    PO.absorbT = p.absorbT;
    PO.flash = clamp(p.flashT * 3, 0, 1);
    PO.alpha = alpha;
    PO.scale = scale;
    PO.stage = p.stage;
    const C = SK.Character;
    if (C && C.renderPlayer) { C.renderPlayer(ctx, p, PO); return; }
    const S = SK.Slime;
    if (S && S.render) {
      S.render(ctx, p, { stage: p.stage, color: p.color, facing: p.facing, expression: p.expression, absorbing: p.absorbing, absorbT: p.absorbT, alpha, scale, flash: PO.flash, crown: !!p.perks.crown });
      return;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color || '#4fc3ff';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * scale, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function renderAbsorbField(ctx, p) {
    const k = min(1, p.absorbT * 4);
    if (k <= 0.01) return;
    const R0 = absorbRadius(p);
    const t = SK.time.t;
    const col = absorbColor(p);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const Fx = F();
    if (Fx && Fx.drawGlow) Fx.drawGlow(ctx, p.x, p.y, R0 * 0.55, col, 0.14 * k);
    ctx.strokeStyle = U.rgba(col, 0.28 * k);
    ctx.lineWidth = 2.5;
    if (ctx.setLineDash) { ctx.setLineDash(DASH_PATTERN); ctx.lineDashOffset = -t * 70; }
    ctx.beginPath(); ctx.arc(p.x, p.y, R0, 0, TAU); ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash(NO_DASH);
    ctx.strokeStyle = U.rgba(col, 0.16 * k);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, R0 * 0.7, 0, TAU); ctx.stroke();
    if (q() > 0) {
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = U.rgba(i === 1 ? '#ffffff' : col, 0.13 * k);
        ctx.beginPath();
        for (let s = 0; s <= 14; s++) {
          const f = s / 14;
          const a = -t * 3 + i * (TAU / 3) + f * 2.6;
          const rr = R0 * (1 - f * 0.88);
          const x = p.x + cos(a) * rr, y = p.y + sin(a) * rr;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function renderCocoon(ctx, p, e) {
    const t = e.t;
    const k = e.applied ? max(0, 1 - (t - 1.55) / 0.35) : min(1, t / 1.2);
    if (k <= 0.01) return;
    const col = e.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const Fx = F();
    const rr = p.r * (2.6 - k * 0.8);
    if (Fx && Fx.drawGlow) {
      Fx.drawGlow(ctx, p.x, p.y, rr * 2.4, col, 0.55 * k);
      Fx.drawGlow(ctx, p.x, p.y, rr * 1.2, '#ffffff', 0.5 * k);
    }
    const T = SK.time.t;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(T * (1.5 + i * 0.6) * (i & 1 ? -1 : 1) + i);
      ctx.scale(1, 0.38 + 0.1 * i);
      ctx.strokeStyle = U.rgba(i & 1 ? '#ffffff' : col, 0.55 * k);
      ctx.lineWidth = 3 - i * 0.4;
      ctx.beginPath(); ctx.arc(0, 0, rr * (1 + i * 0.12), 0, TAU); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function renderWorld(ctx) {
    const p = G.player;
    const cam = SK.cam;
    const W = SK.World, S = SK.Skills, E = SK.Enemies, Fx = F();
    cam.begin(ctx);
    if (W && W.renderBackground) { try { W.renderBackground(ctx, G); } catch (e) { report('r.bg', e); } }
    if (S && S.renderZones) { try { S.renderZones(ctx, G); } catch (e) { report('r.zones', e); } }
    if (W && W.renderPickups) { try { W.renderPickups(ctx, G); } catch (e) { report('r.pickups', e); } }
    if (p && p.absorbing && !p.dead) { try { renderAbsorbField(ctx, p); } catch (e) { report('r.absorb', e); } }
    if (E && E.render) { try { E.render(ctx, G); } catch (e) { report('r.enemies', e); } }
    const evo = G.state === 'evolve' ? R.evo : null;
    if (evo) {
      const v = cam.view;
      const a = evo.t < 0.6 ? evo.t / 0.6 : evo.t > 2.4 ? max(0, 1 - (evo.t - 2.4) / 0.6) : 1;
      ctx.fillStyle = 'rgba(4,2,12,' + (0.62 * a).toFixed(3) + ')';
      ctx.fillRect(v.x0 - 40, v.y0 - 40, v.x1 - v.x0 + 80, v.y1 - v.y0 + 80);
    }
    if (p) { try { renderPlayer(ctx, p); } catch (e) { report('r.player', e); } }
    if (evo && p) { try { renderCocoon(ctx, p, evo); } catch (e) { report('r.cocoon', e); } }
    if (S && S.render) { try { S.render(ctx, G); } catch (e) { report('r.skills', e); } }
    if (Fx) { try { Fx.render(ctx); } catch (e) { report('r.fx', e); } }
    if (W && W.renderForeground) { try { W.renderForeground(ctx, G); } catch (e) { report('r.fg', e); } }
    cam.end(ctx);
    if (Fx && Fx.renderScreen) { try { Fx.renderScreen(ctx); } catch (e) { report('r.screen', e); } }
  }
  function render(ctx) {
    try {
      if (G.state === 'title') { renderTitle(ctx); return; }
      const b = biomeDef(G.biome);
      ctx.fillStyle = (b && b.palette && b.palette.bg) || '#07060f';
      ctx.fillRect(0, 0, SK.W, SK.H);
      renderWorld(ctx);
      const evo = G.state === 'evolve' ? R.evo : null;
      if (evo) {
        const k = evo.t < 0.4 ? U.ease.outCubic(evo.t / 0.4) : evo.t > 2.6 ? max(0, 1 - (evo.t - 2.6) / 0.4) : 1;
        const bh = SK.H * 0.09 * k;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, SK.W, bh);
        ctx.fillRect(0, SK.H - bh, SK.W, bh);
      } else {
        const UI = SK.UI;
        if (UI && UI.renderHUD) { try { UI.renderHUD(ctx, G); } catch (e) { report('r.hud', e); } }
      }
      if (R.fadeA > 0.002) {
        ctx.fillStyle = 'rgba(0,0,0,' + clamp(R.fadeA, 0, 1).toFixed(3) + ')';
        ctx.fillRect(0, 0, SK.W, SK.H);
      }
    } catch (e) {
      report('render', e);
    }
  }

  /* ================================================================ autoplay bot */
  const BOT = { t: 0, move: { x: 0, y: 0 }, down: { absorb: false, dash: false, s1: false, s2: false, s3: false, name: false, pause: false }, castT: 0, wander: random() * TAU };
  const TAPS = ['dash', 's1', 's2', 's3', 'name'];
  function botIdle() {
    BOT.move.x = 0; BOT.move.y = 0;
    for (const k in BOT.down) BOT.down[k] = false;
  }
  function botTap(id) { if (!BOT.prevDown || !BOT.prevDown[id]) BOT.down[id] = true; }
  function botUpdate(raw) {
    const inp = SK.input;
    inp.botMove = BOT.move;
    inp.botDown = BOT.down;
    if (!BOT.prevDown) BOT.prevDown = {};
    for (let i = 0; i < TAPS.length; i++) {
      const id = TAPS[i];
      BOT.prevDown[id] = BOT.down[id];
      if (BOT.down[id]) BOT.down[id] = false;
    }
    BOT.t += raw;
    switch (G.state) {
      case 'title':
        botIdle();
        if (BOT.t > 1 && !(SK.Character && SK.Character.isOpen && SK.Character.isOpen())) { BOT.t = 0; newRun(sv().character); }
        return;
      case 'gameover':
      case 'victory':
        botIdle();
        if (BOT.t > 2) { BOT.t = 0; newRun(sv().character); }
        return;
      case 'levelup':
        botIdle();
        if (R.lvOpen && R.lvChoices) {
          R.lvBotT = (R.lvBotT || 0) + raw;
          if (R.lvBotT >= 0.3) {
            const c = R.lvChoices[0];
            uiHide('levelup');
            onLevelPick(c);
          }
        }
        return;
      case 'paused':
        botIdle();
        resume();
        return;
      case 'play':
        BOT.t = 0;
        botPlay(raw);
        return;
      default:
        botIdle();
    }
  }
  function botPlay(dt) {
    const p = G.player;
    if (!p || p.dead) { botIdle(); return; }
    let ax = 0, ay = 0, near = 0, close = 0, bossNear = false;
    const E = G.enemies;
    for (let i = 0; i < E.length; i++) {
      const m = E[i];
      if (!m || m.dead || m.passive) continue;
      const dx = p.x - m.x, dy = p.y - m.y;
      const reach = 260 + (m.r || 0);
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = sqrt(d2) || 1;
      const w = 1 - d / reach;
      const mul = m.boss ? 3.2 : m.elite ? 1.8 : 1;
      ax += (dx / d) * w * w * 3 * mul;
      ay += (dy / d) * w * w * 3 * mul;
      if (d < 140 + m.r) near++;
      if (d < 70 + m.r) close++;
      if (m.boss) bossNear = true;
    }
    const PR = G.projectiles;
    for (let i = 0; i < PR.length; i++) {
      const pr = PR[i];
      if (!pr || pr.dead || pr.team !== 'enemy') continue;
      const dx = p.x - pr.x, dy = p.y - pr.y, d2 = dx * dx + dy * dy;
      if (d2 > 130 * 130) continue;
      const d = sqrt(d2) || 1;
      ax += (dx / d) * 2 * (1 - d / 130);
      ay += (dy / d) * 2 * (1 - d / 130);
    }
    const Z = G.zones;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      if (!z || z.dead || z.team !== 'enemy') continue;
      const dx = p.x - z.x, dy = p.y - z.y, rr = (z.r || 60) + 40, d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      const d = sqrt(d2) || 1;
      ax += (dx / d) * 2.5; ay += (dy / d) * 2.5;
    }
    const W = SK.World;
    const portal = W && W.portal;
    let tx = 0, ty = 0, tw = 0;
    if (portal && !portal.entered) { tx = portal.x; ty = portal.y; tw = 4; }
    else {
      const cost = p.maxMp * NAME_COST;
      if (p.mp >= cost && namedCount() < (p.stats.maxAllies | 0)) {
        let bd = 520 * 520;
        for (let i = 0; i < E.length; i++) {
          const m = E[i];
          if (!m || m.dead || !m.passive || !m.nameable) continue;
          const dx = m.x - p.x, dy = m.y - p.y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; tx = m.x; ty = m.y; tw = 1.6; }
        }
      }
      if (!tw) {
        let bd = 440 * 440;
        const P = G.pickups;
        const wantHeal = p.hp < p.maxHp * 0.7;
        for (let i = 0; i < P.length; i++) {
          const pk = P[i];
          if (!pk || pk.dead) continue;
          if (pk.kind === 'heart' && !wantHeal) continue;
          const pri = pk.kind === 'essence' || pk.kind === 'chest' ? 0.45 : pk.kind === 'heart' ? 0.6 : 1;
          const dx = pk.x - p.x, dy = pk.y - p.y, d2 = (dx * dx + dy * dy) * pri;
          if (d2 < bd) { bd = d2; tx = pk.x; ty = pk.y; tw = 1.3; }
        }
      }
    }
    if (tw) {
      const dx = tx - p.x, dy = ty - p.y, d = hypot(dx, dy) || 1;
      ax += (dx / d) * tw;
      ay += (dy / d) * tw;
    }
    const cd = hypot(p.x, p.y) || 1;
    const AR = arenaRadius();
    ax += (-p.y / cd) * 0.55; ay += (p.x / cd) * 0.55;
    if (cd > AR * 0.45) { const k = (cd / AR - 0.45) * 4; ax -= (p.x / cd) * k; ay -= (p.y / cd) * k; }
    BOT.wander += (random() - 0.5) * dt * 2;
    ax += cos(BOT.wander) * 0.15; ay += sin(BOT.wander) * 0.15;
    const l = hypot(ax, ay);
    if (l > 0.05) { BOT.move.x = ax / l; BOT.move.y = ay / l; }
    else { BOT.move.x = 0; BOT.move.y = 0; }

    BOT.down.absorb = !!p.absorbHint && close < 3 && !(portal && !portal.entered);
    if (p.dashCd <= 0 && (close >= 3 || (p.hp < p.maxHp * 0.35 && close >= 1))) botTap('dash');
    BOT.castT -= dt;
    if (BOT.castT <= 0 && (near >= 3 || bossNear)) {
      const S = SK.Skills;
      for (let i = 0; i < 3; i++) {
        const id = p.slots[i];
        const def = skillDef(id);
        if (!def) continue;
        let ready = true;
        if (S && S.cooldownRatio) { try { ready = S.cooldownRatio(p, id) >= 1; } catch (e) { ready = false; } }
        if (ready && p.mp >= (def.mpCost || 0)) { botTap('s' + (i + 1)); BOT.castT = 0.35; break; }
      }
    }
    const nb = SK.input.button && SK.input.button('name');
    if (nb && nb.visible && R.nameCand && p.mp >= p.maxMp * NAME_COST && namedCount() < (p.stats.maxAllies | 0)) botTap('name');
  }

  /* ================================================================ Android back */
  window.SKBack = function () {
    try {
      const N = SK.Nation;
      if (N && typeof N.isOpen === 'function' && N.isOpen()) {
        let handled = false;
        if (typeof N.back === 'function') { try { handled = !!N.back(); } catch (e) { report('Nation.back', e); } }
        if (!handled) uiShow('title');
        return true;
      }
      const C = SK.Character;
      if (C && typeof C.isOpen === 'function' && C.isOpen()) {
        let handled = false;
        if (typeof C.back === 'function') { try { handled = C.back() !== false; } catch (e) { report('Character.back', e); } }
        if (!handled) { if (C.closeCreator) C.closeCreator(true); uiShow('title'); }
        return true;
      }
      const UI = SK.UI;
      if (UI && typeof UI.back === 'function' && UI.back()) return true;
      switch (G.state) {
        case 'play': pause(); return true;
        case 'paused': resume(); return true;
        case 'levelup': case 'dialog': case 'evolve': case 'transition': return true;
        case 'gameover': case 'victory': quitToTitle(); return true;
        case 'title': default: return false;
      }
    } catch (e) {
      report('SKBack', e);
      return G.state !== 'title';
    }
  };

  /* ================================================================ init */
  function onGesture() {
    if (titleMusicStarted) return;
    titleMusicStarted = true;
    if (G.state === 'title') music('title');
  }
  function init() {
    if (inited) return;
    inited = true;
    G = SK.G = makeG('title');
    R = makeRun();
    lifetime();
    const W = SK.World;
    if (W && W.prewarm) { try { W.prewarm(0); } catch (e) { report('prewarm', e); } }
    const nb = SK.input.button && SK.input.button('name');
    if (nb) nb.visible = false;
    if (SK.events) {
      SK.events.on('gesture', onGesture);
      SK.events.on('resize', () => { TITLE.gradKey = ''; });
    }
    uiShow('title');
    try { checkAchievements('init'); } catch (e) { report('ach', e); }
  }

  /* ================================================================ exports */
  SK.combat = {
    damage,
    damagePlayer,
    kill,
    heal,
    applyStatus,
    tickStatus,
    query,
    nearest,
    rebuild: rebuildHash,
  };

  SK.Game = {
    init,
    newRun,
    update,
    render,
    pause,
    resume,
    quitToTitle,
    nextBiome,
    onPickup,
    onBossDefeated,
    randomName,
    tryName,
    grantSkill,
    gainXp,
    botUpdate,
    essenceFor,
    absorbRadius,
    xpFor,
    shopItems,
    achievements,
    unlock,
    victory,
    get state() { return G.state; },
  };
})(window.SK);
