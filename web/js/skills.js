/* Slime Reborn — SK.Skills: the 17 skills, projectile system and ground zones for both teams. */
window.SK = window.SK || {};
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, atan2 = Math.atan2, sqrt = Math.sqrt, abs = Math.abs;
  const min = Math.min, max = Math.max, floor = Math.floor, random = Math.random, hypot = Math.hypot;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rnd = (a, b) => a + random() * (b - a);
  const outCubic = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  const inQuad = (t) => t * t;
  const outBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  /** Deterministic hash 0..1 (seeded decoration, no per-frame randomness). */
  function h1(n) { const s = sin(n * 127.1 + 311.7) * 43758.5453; return s - floor(s); }

  /* ================================================== defensive wrappers */
  const NOOP = function () {};
  const NOFX = {};
  ['drawGlow', 'burst', 'spark', 'ring', 'text', 'lightning', 'slash', 'trail', 'flash', 'vignette', 'explosion',
    'sparkle', 'beam', 'hit', 'heal', 'death', 'converge', 'after', 'lightRays'].forEach((n) => { NOFX[n] = NOOP; });
  function fx() { return SK.FX || NOFX; }
  function sfx(name, opts) { const A = SK.Audio; if (A && A.sfx) { try { A.sfx(name, opts); } catch (e) { /* audio is optional */ } } }
  function qual() { return SK.quality === 'low' ? 0 : SK.quality === 'medium' ? 1 : 2; }
  /** Decorative emission gate: thins optional particles on lower quality. */
  function deco() { const q = qual(); return q === 2 || (q === 1 ? random() < 0.7 : random() < 0.4); }
  function camIn(x, y, m) { const c = SK.cam; return c && c.inView ? c.inView(x, y, m) : true; }
  function shake(i, d) { if (SK.cam && SK.cam.shake) SK.cam.shake(i, d); }
  function kick(dx, dy) { if (SK.cam && SK.cam.kick) SK.cam.kick(dx, dy); }
  function hitstop(s) { if (SK.time && SK.time.hitstop) SK.time.hitstop(s); }
  function pokeBody(p, ang, s) { const S = SK.Slime; if (S && S.poke && p && p.body) { try { S.poke(p.body, ang, s); } catch (e) { /* body optional */ } } }

  function spr(color, radius) { const F = SK.FX; return F && F.glowSprite ? F.glowSprite(color, radius) : null; }
  function softSpr(color, radius) {
    const F = SK.FX;
    if (F && F.softSprite) return F.softSprite(color, radius);
    return F && F.glowSprite ? F.glowSprite(color, radius) : null;
  }
  /** Draw a cached glow sprite; the caller sets the composite mode ('lighter' for glows). */
  function glowAt(ctx, x, y, radius, color, alpha) {
    if (!(alpha > 0.004) || !(radius > 0.5)) return;
    const s = spr(color, radius);
    if (!s) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  }
  function softAt(ctx, x, y, radius, color, alpha) {
    if (!(alpha > 0.004) || !(radius > 0.5)) return;
    const s = softSpr(color, radius);
    if (!s) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  }

  function alive(m) { return !!m && !m.dead && m.hp > 0; }
  function dealDamage(m, amount, opts) {
    const c = SK.combat;
    if (c && c.damage) { try { return c.damage(m, amount, opts) || 0; } catch (e) { console.error(e); return 0; } }
    m.hp -= amount; m.hitFlash = 0.12;
    if (m.hp <= 0) m.dead = true;
    return amount;
  }
  function hurtPlayer(amount, source) {
    const c = SK.combat;
    if (c && c.damagePlayer) { try { return c.damagePlayer(amount, source) || 0; } catch (e) { console.error(e); } }
    return 0;
  }
  function applyStatus(m, type, dur, power) {
    if (!m || !type) return;
    const c = SK.combat;
    if (c && c.applyStatus) { c.applyStatus(m, type, dur, power); return; }
    const s = m.status;
    if (!s) return;
    if (type === 'slow') { s.slow = max(s.slow || 0, dur); s.slowAmt = max(s.slowAmt || 0, power); }
    else if (type === 'burn') { s.burn = max(s.burn || 0, dur); s.burnDps = max(s.burnDps || 0, power); }
    else if (type === 'poison') { s.poison = max(s.poison || 0, dur); s.poisonDps = max(s.poisonDps || 0, power); }
    else if (type === 'stun') s.stun = max(s.stun || 0, dur);
  }
  function killM(m, opts) {
    const c = SK.combat;
    if (c && c.kill) { try { c.kill(m, opts); } catch (e) { console.error(e); } }
    if (!m.dead) { m.hp = 0; m.dead = true; }
  }
  function healTarget(t, amount) {
    if (!t || !(amount > 0)) return;
    const c = SK.combat;
    if (c && c.heal) { c.heal(t, amount); return; }
    t.hp = min(t.maxHp || t.hp + amount, t.hp + amount);
  }

  /* ========================================================== targeting */
  function query(G, x, y, r, fn, team) {
    const c = SK.combat;
    if (c && c.query) { c.query(x, y, r, fn, team || 'enemy'); return; }
    const list = team === 'ally' ? G.allies : G.enemies;
    if (!list) return;
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m || m.dead || (team !== 'ally' && m.passive)) continue;
      const dx = m.x - x, dy = m.y - y;
      if (dx * dx + dy * dy <= r2) fn(m);
    }
  }

  // k-nearest collector (insertion sort into fixed buffers, no allocations)
  const candM = [], candD = [];
  let candK = 1, candN = 0, cqx = 0, cqy = 0;
  function candCb(m) {
    if (!alive(m) || m.passive) return;
    const dx = m.x - cqx, dy = m.y - cqy, d = dx * dx + dy * dy;
    if (candN === candK && d >= candD[candN - 1]) return;
    let i = candN < candK ? candN++ : candN - 1;
    while (i > 0 && candD[i - 1] > d) { candM[i] = candM[i - 1]; candD[i] = candD[i - 1]; i--; }
    candM[i] = m; candD[i] = d;
  }
  function nearestK(G, x, y, range, k) {
    candK = clamp(k | 0, 1, 16); candN = 0; cqx = x; cqy = y;
    query(G, x, y, range, candCb, 'enemy');
    const b = G.boss;
    if (b && alive(b) && b.team === 'enemy' && !b.passive) {
      let found = false;
      for (let i = 0; i < candN; i++) if (candM[i] === b) { found = true; break; }
      if (!found && hypot(b.x - x, b.y - y) - (b.r || 0) < range) candCb(b);
    }
    return candN;
  }
  function nearest(G, x, y, range) { return nearestK(G, x, y, range, 1) ? candM[0] : null; }

  // radius gatherer (collect first, act after — never damage inside a hash query)
  const GB = [], GB2 = [];
  let gBuf = GB, gN = 0, gX = 0, gY = 0, gR = 0, gPad = 1;
  function gatherCb(m) {
    if (!m || m.dead || !(m.hp > 0) || m.passive) return;
    const dx = m.x - gX, dy = m.y - gY, rr = gR + (m.r || 16) * gPad;
    if (dx * dx + dy * dy > rr * rr) return;
    if (gN < 256) gBuf[gN++] = m;
  }
  function gather(G, x, y, r, team, buf, pad) {
    gBuf = buf || GB; gN = 0; gX = x; gY = y; gR = r; gPad = pad == null ? 1 : pad;
    const tm = team || 'enemy';
    query(G, x, y, r + 70, gatherCb, tm);
    const b = G.boss;
    if (tm === 'enemy' && b && b.team === 'enemy' && (b.r || 0) > 55) {
      let found = false;
      for (let i = 0; i < gN; i++) if (gBuf[i] === b) { found = true; break; }
      if (!found) gatherCb(b);
    }
    return gN;
  }

  // every visible enemy (meteor, black lightning)
  const viewM = [];
  let viewN = 0;
  function viewCb(m) {
    if (!alive(m) || m.passive) return;
    if (!camIn(m.x, m.y, -24)) return;
    if (viewN < 128) viewM[viewN++] = m;
  }
  function collectView(G) {
    viewN = 0;
    const c = SK.cam, p = G.player;
    if (c && c.view && c.view.x1 > c.view.x0) {
      const v = c.view;
      query(G, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, hypot(v.x1 - v.x0, v.y1 - v.y0) / 2 + 20, viewCb, 'enemy');
    } else if (p) query(G, p.x, p.y, 520, viewCb, 'enemy');
    return viewN;
  }

  /* ============================================================== stats */
  const DEF_STATS = { dmg: 1, area: 1, amount: 0, projSpeed: 1, cdr: 0, allyDmg: 1 };
  function st(p) { return (p && p.stats) || DEF_STATS; }
  function areaOf(p) { const a = st(p).area; return a > 0 ? a : 1; }
  function amountOf(p) { return clamp(st(p).amount | 0, 0, 6); }
  function pspd(p) { const v = st(p).projSpeed; return v > 0 ? v : 1; }
  function cdMul(p) { return 1 - clamp(+st(p).cdr || 0, 0, 0.75); }
  function lvl(p, id) { return (p && p.skills && p.skills[id]) | 0; }
  function sstate(p, id, init) {
    if (!p.skillState) p.skillState = {};
    let s = p.skillState[id];
    if (!s) { s = init(); p.skillState[id] = s; }
    return s;
  }

  /* ========================================================== scheduler */
  const sched = [];
  let clock = 0;
  function later(delay, fn) { if (sched.length < 160) sched.push({ t: delay, fn }); }
  function updateSched(dt) {
    for (let i = sched.length - 1; i >= 0; i--) {
      if (i >= sched.length) continue;
      const s = sched[i];
      s.t -= dt;
      if (s.t <= 0) {
        sched.splice(i, 1);
        try { s.fn(); } catch (e) { console.error(e); }
      }
    }
  }

  // local player slow (enemy webs / sticky projectiles): positional correction after the player moved
  let pSlowAmt = 0, pSlowT = 0;
  function slowPlayer(amount, dur) {
    pSlowAmt = max(pSlowT > 0 ? pSlowAmt : 0, clamp(amount || 0.4, 0, 0.7));
    pSlowT = max(pSlowT, dur || 0.5);
  }
  function updatePlayerSlow(p, dt) {
    if (pSlowT <= 0 || !p || p.dead) return;
    pSlowT -= dt;
    p.x -= (p.vx || 0) * dt * pSlowAmt;
    p.y -= (p.vy || 0) * dt * pSlowAmt;
    if (deco() && random() < dt * 8) fx().burst(p.x + rnd(-14, 14), p.y + rnd(-10, 10), { count: 1, color: '#e1d5ff', speed: [10, 30], life: [0.3, 0.5], size: [1.5, 2.5], shape: 'spark' });
  }

  /* ========================================================= projectiles */
  const MAX_PROJ = 700;
  const pool = [];
  const PROJ_DEF = { id: 'projectile', name: 'Proiettile' };
  const KIND_COLOR = {
    water: '#4fc3ff', needle: '#fff176', web: '#e1d5ff', fire: '#ff9100', magma: '#ff7043', spirit: '#a7ffeb',
    shadow: '#7c4dff', orb: '#ff5252', rock: '#8d6e63', bolt: '#ffee58', dark: '#b388ff', arrow: '#c5e1a5',
  };
  const ELEMENT_KIND = {
    water: 'water', sound: 'orb', web: 'web', fire: 'fire', poison: 'orb', earth: 'rock', shadow: 'shadow',
    nature: 'needle', storm: 'bolt', spirit: 'spirit', beast: 'orb', void: 'dark', physical: 'rock',
  };
  function makeProj() {
    return {
      id: 0, x: 0, y: 0, vx: 0, vy: 0, r: 8, dmg: 0, team: 'player', element: null, life: 1, maxLife: 1, t: 0,
      pierce: 0, homing: 0, kind: 'orb', color: '#fff', knock: 120, status: null, onHit: null, onExpire: null,
      dead: false, target: null, hits: new Array(24), nh: 0, spin: 0, rot: 0, skill: null, source: null, owner: null,
      def: PROJ_DEF, trail: new Float32Array(20), tn: 0, th: 0, tt: 0, grow: 0, seed: 0, data: null, accel: 0,
      drag: 0, rt: 0, pt: 0, vis: false, crit: undefined, maxSpeed: 0,
    };
  }
  function releaseProj(p) {
    p.target = null; p.owner = null; p.source = null; p.onHit = null; p.onExpire = null; p.status = null; p.data = null;
    if (pool.length < 500) pool.push(p);
  }

  /** spawnProjectile(opts) — contract §5.4; extra opts: spin, grow, accel, drag, target, skill, owner, source, data, crit, rot. */
  function spawnProjectile(o) {
    const G = SK.G;
    if (!G || !o) return null;
    if (!G.projectiles) G.projectiles = [];
    const list = G.projectiles;
    if (list.length >= MAX_PROJ) {
      // recycle the oldest projectile of the same team (keeps the newest action readable)
      let idx = -1;
      for (let i = 0; i < list.length; i++) if (list[i].team === (o.team || 'player')) { idx = i; break; }
      if (idx < 0) return null;
      list[idx].dead = true; list[idx].life = 0;
      const old = list[idx];
      list[idx] = list[list.length - 1]; list.pop();
      releaseProj(old);
    }
    const p = pool.length ? pool.pop() : makeProj();
    p.id = U.uid();
    p.x = +o.x || 0; p.y = +o.y || 0; p.vx = +o.vx || 0; p.vy = +o.vy || 0;
    p.r = o.r > 0 ? +o.r : 8;
    p.dmg = +o.dmg || 0;
    p.team = o.team === 'enemy' ? 'enemy' : 'player';
    p.element = o.element || null;
    p.life = p.maxLife = o.life > 0 ? +o.life : 2.5;
    p.t = 0;
    p.pierce = o.pierce === Infinity ? 9999 : (o.pierce | 0);
    p.homing = +o.homing || 0;
    p.kind = o.kind || ELEMENT_KIND[o.element] || 'orb';
    p.color = o.color || KIND_COLOR[p.kind] || '#ffffff';
    p.knock = o.knock == null ? 120 : +o.knock;
    p.status = o.status || null;
    p.onHit = typeof o.onHit === 'function' ? o.onHit : null;
    p.onExpire = typeof o.onExpire === 'function' ? o.onExpire : null;
    p.owner = o.owner || (o.source && typeof o.source === 'object' ? o.source : null);
    p.source = o.source || (p.team === 'player' ? 'playerSkill' : (p.owner || 'enemy'));
    p.skill = o.skill || null;
    p.target = o.target || null;
    p.nh = 0; p.dead = false;
    p.rot = o.rot != null ? +o.rot : atan2(p.vy, p.vx);
    p.spin = +o.spin || 0;
    p.tn = 0; p.th = 0; p.tt = 0; p.pt = 0; p.rt = 0;
    p.grow = +o.grow || 0; p.accel = +o.accel || 0; p.drag = +o.drag || 0;
    p.maxSpeed = +o.maxSpeed || 0;
    p.seed = random() * 1000;
    p.data = o.data == null ? null : o.data;
    p.crit = o.crit;
    p.vis = false;
    list.push(p);
    return p;
  }

  function updateProjectiles(G, dt) {
    const list = G.projectiles;
    if (!list || !list.length) return;
    const pl = G.player;
    for (let i = list.length - 1; i >= 0; i--) {
      if (i >= list.length) continue;
      const p = list[i];
      if (!p.dead) stepProj(G, p, pl, dt);
      if (p.dead) {
        const last = list.pop();
        if (last !== p) {
          const j = list.indexOf(p);
          if (j >= 0) list[j] = last; else list.push(last);
        }
        releaseProj(p);
      }
    }
  }

  function stepProj(G, p, pl, dt) {
    p.t += dt;
    p.life -= dt;
    if (p.life <= 0) { expireProj(G, p); return; }
    if (p.homing > 0) {
      let tx = 0, ty = 0, has = false;
      if (p.team === 'player') {
        if (!alive(p.target) || p.target.team !== 'enemy') {
          p.target = null;
          p.rt -= dt;
          if (p.rt <= 0) { p.rt = 0.12; p.target = nearest(G, p.x, p.y, 480); }
        }
        if (p.target) { tx = p.target.x; ty = p.target.y; has = true; }
      } else if (pl && !pl.dead) { tx = pl.x; ty = pl.y; has = true; }
      if (has) {
        const sp = hypot(p.vx, p.vy) || 1;
        const a = atan2(p.vy, p.vx);
        let d = U.angleDiff(a, atan2(ty - p.y, tx - p.x));
        const turn = p.homing * dt;
        if (d > turn) d = turn; else if (d < -turn) d = -turn;
        p.vx = cos(a + d) * sp; p.vy = sin(a + d) * sp;
      }
    }
    if (p.accel) {
      const k = 1 + p.accel * dt;
      p.vx *= k; p.vy *= k;
      if (p.maxSpeed > 0) {
        const sp = hypot(p.vx, p.vy);
        if (sp > p.maxSpeed) { p.vx *= p.maxSpeed / sp; p.vy *= p.maxSpeed / sp; }
      }
    }
    if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (p.grow) p.r = max(1, p.r + p.grow * dt);
    p.tt += dt;
    if (p.tt >= 0.016) {
      p.tt = 0;
      const tr = p.trail, h = p.th * 2;
      tr[h] = p.x; tr[h + 1] = p.y;
      p.th = (p.th + 1) % 10;
      if (p.tn < 10) p.tn++;
    }
    if (!camIn(p.x, p.y, 760)) { p.dead = true; return; }
    projParticles(p, dt);
    if (p.team === 'player') collidePlayerProj(G, p);
    else collideEnemyProj(G, p, pl);
  }

  function expireProj(G, p) {
    p.dead = true;
    if (camIn(p.x, p.y, 40)) {
      const F = fx();
      switch (p.kind) {
        case 'water': F.burst(p.x, p.y, { count: 5, color: '#81d4fa', speed: [30, 110], life: [0.2, 0.4], size: [1.5, 3], shape: 'drop', gravity: 160 }); break;
        case 'fire': case 'magma': F.burst(p.x, p.y, { count: 5, colors: ['#ffab40', '#ff6d00'], speed: [20, 90], life: [0.25, 0.5], size: [2, 4], shape: 'glow', colorEnd: '#3e2723' }); break;
        case 'spirit': F.burst(p.x, p.y, { count: 6, color: '#a7ffeb', speed: [20, 80], life: [0.3, 0.6], size: [1.5, 3], glow: true }); break;
        case 'dark': case 'shadow': F.burst(p.x, p.y, { count: 4, color: '#7c4dff', speed: [10, 50], life: [0.3, 0.6], size: [4, 8], shape: 'smoke' }); break;
        default: break;
      }
    }
    if (p.onExpire) { try { p.onExpire(p, G); } catch (e) { console.error(e); } }
  }

  /** Small per-kind particle emission while flying (droplets, embers, wisps). */
  function projParticles(p, dt) {
    p.pt -= dt;
    if (p.pt > 0) return;
    let iv = 0;
    switch (p.kind) {
      case 'water': iv = 0.05; break;
      case 'magma': case 'fire': iv = 0.035; break;
      case 'spirit': iv = 0.07; break;
      case 'dark': case 'shadow': iv = 0.06; break;
      default: return;
    }
    p.pt = iv * (qual() === 2 ? 1 : qual() === 1 ? 1.5 : 2.5);
    if (!camIn(p.x, p.y, 30)) return;
    const F = fx();
    switch (p.kind) {
      case 'water':
        F.burst(p.x, p.y, { count: 1, color: '#81d4fa', speed: [10, 40], life: [0.25, 0.45], size: [1.4, 2.8], shape: 'drop', gravity: 140, drag: 3 });
        break;
      case 'magma':
      case 'fire':
        F.burst(p.x + rnd(-3, 3), p.y + rnd(-3, 3), { count: 1, colors: ['#ffd180', '#ff9100', '#ff3d00'], speed: [10, 50], life: [0.25, 0.55], size: [1.5, 3.2], glow: true, colorEnd: '#5d1a00', gravity: -40, angle: atan2(-p.vy, -p.vx), spread: 1.2 });
        break;
      case 'spirit':
        F.burst(p.x, p.y, { count: 1, color: '#e0f7fa', speed: [5, 25], life: [0.3, 0.6], size: [1.2, 2.2], glow: true });
        break;
      default:
        F.burst(p.x, p.y, { count: 1, color: p.kind === 'dark' ? '#4a148c' : '#311b92', speed: [5, 20], life: [0.35, 0.6], size: [4, 7], shape: 'smoke' });
        break;
    }
  }

  function pickTarget(p, buf, n) {
    let best = null, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const m = buf[i];
      let seen = false;
      for (let j = 0; j < p.nh; j++) if (p.hits[j] === m.id) { seen = true; break; }
      if (seen) continue;
      const d = (m.x - p.x) * (m.x - p.x) + (m.y - p.y) * (m.y - p.y);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  function collidePlayerProj(G, p) {
    const n = gather(G, p.x, p.y, p.r, 'enemy', GB2);
    if (!n) return;
    const m = pickTarget(p, GB2, n);
    if (!m) return;
    if (p.nh < 24) p.hits[p.nh++] = m.id;
    const sp = hypot(p.vx, p.vy) || 1;
    const kx = p.vx / sp, ky = p.vy / sp;
    dealDamage(m, p.dmg, { source: p.source || 'playerSkill', skill: p.skill, element: p.element, knock: p.knock, kx, ky, crit: p.crit });
    if (p.status) applyStatus(m, p.status.type, p.status.dur, p.status.power);
    impactFX(p, m.x - kx * (m.r || 16) * 0.6, m.y - ky * (m.r || 16) * 0.6, atan2(ky, kx));
    if (p.onHit) { try { p.onHit(p, m, G); } catch (e) { console.error(e); } }
    p.pierce--;
    if (p.pierce < 0) p.dead = true;
  }

  function collideEnemyProj(G, p, pl) {
    if (pl && !pl.dead && !(pl.invuln > 0)) {
      const rr = p.r + (pl.r || 22) * 0.8;
      const dx = pl.x - p.x, dy = pl.y - p.y;
      if (dx * dx + dy * dy < rr * rr) {
        hurtPlayer(p.dmg, p.owner || p);
        if (p.status && p.status.type === 'slow') slowPlayer(p.status.power || 0.4, p.status.dur || 1);
        else if (p.kind === 'web') slowPlayer(0.4, 1.2);
        impactFX(p, p.x, p.y, atan2(p.vy, p.vx));
        if (p.onHit) { try { p.onHit(p, pl, G); } catch (e) { console.error(e); } }
        p.pierce--;
        if (p.pierce < 0) { p.dead = true; return; }
      }
    }
    if (G.allies && G.allies.length) {
      const n = gather(G, p.x, p.y, p.r, 'ally', GB2);
      if (!n) return;
      const m = pickTarget(p, GB2, n);
      if (!m) return;
      if (p.nh < 24) p.hits[p.nh++] = m.id;
      const sp = hypot(p.vx, p.vy) || 1;
      dealDamage(m, p.dmg, { source: p.owner || 'enemy', element: p.element, knock: p.knock, kx: p.vx / sp, ky: p.vy / sp, crit: false });
      if (p.status) applyStatus(m, p.status.type, p.status.dur, p.status.power);
      impactFX(p, p.x, p.y, atan2(p.vy, p.vx));
      if (p.onHit) { try { p.onHit(p, m, G); } catch (e) { console.error(e); } }
      p.pierce--;
      if (p.pierce < 0) p.dead = true;
    }
  }

  function impactFX(p, x, y, ang) {
    if (!camIn(x, y, 40)) return;
    const F = fx();
    const back = ang + PI;
    switch (p.kind) {
      case 'water':
        F.burst(x, y, { count: 7, colors: ['#e1f5fe', '#4fc3ff', '#0288d1'], speed: [60, 200], life: [0.2, 0.45], size: [1.5, 3.5], shape: 'drop', gravity: 260, angle: back, spread: 2.4 });
        F.ring(x, y, { radius: 22, color: '#81d4fa', life: 0.22, width: 2.5 });
        break;
      case 'needle':
        F.spark(x, y, back + rnd(-0.6, 0.6), { color: '#fff59d', speed: [180, 320], life: [0.1, 0.2] });
        F.spark(x, y, back + rnd(-0.6, 0.6), { color: '#ffffff', speed: [140, 260], life: [0.08, 0.16] });
        break;
      case 'web':
        F.burst(x, y, { count: 8, color: '#f3e5f5', speed: [40, 140], life: [0.2, 0.4], size: [1, 2], shape: 'spark' });
        break;
      case 'fire': case 'magma':
        F.burst(x, y, { count: 9, colors: ['#fff59d', '#ffab40', '#ff3d00'], speed: [60, 220], life: [0.2, 0.5], size: [2, 4.5], glow: true, colorEnd: '#4e1500' });
        F.ring(x, y, { radius: 26, color: '#ff9100', life: 0.25, width: 3 });
        break;
      case 'spirit':
        F.burst(x, y, { count: 8, colors: ['#ffffff', '#a7ffeb', '#64ffda'], speed: [40, 160], life: [0.25, 0.55], size: [1.5, 3], glow: true });
        F.ring(x, y, { radius: 24, color: '#a7ffeb', life: 0.3, width: 2 });
        break;
      case 'rock':
        F.burst(x, y, { count: 7, colors: ['#a1887f', '#6d4c41', '#4e342e'], speed: [60, 180], life: [0.25, 0.5], size: [2, 4], shape: 'square', gravity: 300 });
        F.burst(x, y, { count: 3, color: '#8d6e63', speed: [10, 40], life: [0.4, 0.7], size: [6, 10], shape: 'smoke' });
        break;
      case 'bolt':
        F.burst(x, y, { count: 7, colors: ['#ffffff', p.color], speed: [100, 260], life: [0.1, 0.25], size: [1.5, 2.5], shape: 'spark' });
        break;
      case 'dark': case 'shadow':
        F.burst(x, y, { count: 8, colors: ['#b388ff', '#7c4dff', '#311b92'], speed: [50, 170], life: [0.25, 0.5], size: [2, 4], glow: true });
        F.ring(x, y, { radius: 24, color: '#7c4dff', life: 0.28, width: 3 });
        break;
      default:
        if (F.hit) F.hit(x, y, p.color, ang);
        break;
    }
  }

  /* =============================================================== zones */
  const ZONE_COLOR = { web: '#e1d5ff', mist: '#8bc34a', fire: '#ff6d00', shadow: '#7c4dff', vortex: '#aa00ff', warning: '#ff3d00', crater: '#ff6d00' };
  const ZONE_ELEMENT = { web: 'web', mist: 'poison', fire: 'fire', shadow: 'shadow', vortex: 'void', crater: 'fire' };
  const zonePool = [];

  /** spawnZone(opts) — contract §5.4; extra opts: onEnd, follow, devour, heal, tickRate, skill, owner, source, knock. */
  function spawnZone(o) {
    const G = SK.G;
    if (!G || !o) return null;
    if (!G.zones) G.zones = [];
    const list = G.zones;
    if (list.length >= 180) {
      let idx = -1;
      for (let i = 0; i < list.length; i++) if (list[i].kind !== 'warning' && !list[i].onEnd) { idx = i; break; }
      if (idx < 0) return null;
      const old = list[idx];
      list[idx] = list[list.length - 1]; list.pop();
      releaseZone(old);
    }
    const z = zonePool.length ? zonePool.pop() : {};
    z.id = U.uid();
    z.x = +o.x || 0; z.y = +o.y || 0;
    z.r = o.r > 0 ? +o.r : 60;
    z.life = z.maxLife = o.life > 0 ? +o.life : 3;
    z.t = 0;
    z.team = o.team === 'enemy' ? 'enemy' : (o.team || 'player');
    z.kind = o.kind || 'mist';
    z.dps = +o.dps || 0;
    z.slow = +o.slow || 0;
    z.status = o.status || null;
    z.color = o.color || ZONE_COLOR[z.kind] || '#ffffff';
    z.pull = +o.pull || 0;
    z.onEnd = typeof o.onEnd === 'function' ? o.onEnd : null;
    z.follow = o.follow || null;
    z.devour = !!o.devour;
    z.heal = +o.heal || 0;
    z.tickRate = o.tickRate > 0 ? +o.tickRate : (z.kind === 'vortex' ? 0.2 : 0.3);
    z.tick = random() * 0.1;
    z.skill = o.skill || null;
    z.owner = o.owner || null;
    z.source = o.source || (z.team === 'enemy' ? (z.owner || 'enemy') : 'playerSkill');
    z.element = o.element || ZONE_ELEMENT[z.kind] || null;
    z.knock = +o.knock || 0;
    z.seed = floor(random() * 997);
    z.pt = 0;
    z.dead = false;
    z.data = o.data == null ? null : o.data;
    list.push(z);
    return z;
  }
  function releaseZone(z) {
    z.onEnd = null; z.follow = null; z.owner = null; z.source = null; z.status = null; z.data = null;
    if (zonePool.length < 200) zonePool.push(z);
  }

  function updateZones(G, dt) {
    const list = G.zones;
    if (!list || !list.length) return;
    const pl = G.player;
    for (let i = list.length - 1; i >= 0; i--) {
      if (i >= list.length) continue;
      const z = list[i];
      if (!z.dead) stepZone(G, z, pl, dt);
      if (z.dead) {
        const last = list.pop();
        if (last !== z) {
          const j = list.indexOf(z);
          if (j >= 0) list[j] = last; else list.push(last);
        }
        releaseZone(z);
      }
    }
  }

  function stepZone(G, z, pl, dt) {
    z.t += dt;
    z.life -= dt;
    if (z.follow && !z.follow.dead) { z.x = z.follow.x; z.y = z.follow.y; }
    if (z.life <= 0) {
      z.dead = true;
      if (z.onEnd) { try { z.onEnd(z, G); } catch (e) { console.error(e); } }
      return;
    }
    zoneParticles(z, dt);
    if (z.kind === 'warning') return;
    if (z.pull > 0) pullZone(G, z, dt);
    if (z.team === 'enemy' && z.slow > 0 && pl && !pl.dead) {
      const dx = pl.x - z.x, dy = pl.y - z.y, rr = z.r + (pl.r || 22) * 0.5;
      if (dx * dx + dy * dy < rr * rr) slowPlayer(z.slow, 0.15);
    }
    z.tick -= dt;
    if (z.tick <= 0) { z.tick += z.tickRate; tickZone(G, z, pl); }
  }

  function tickZone(G, z, pl) {
    const tr = z.tickRate;
    if (z.team === 'enemy') {
      if (z.dps > 0 && pl && !pl.dead && !(pl.invuln > 0)) {
        const dx = pl.x - z.x, dy = pl.y - z.y, rr = z.r + (pl.r || 22) * 0.5;
        if (dx * dx + dy * dy < rr * rr) hurtPlayer(z.dps * max(tr, 0.5), z.owner || z);
      }
      if (G.allies && G.allies.length && (z.dps > 0 || z.slow > 0)) {
        const n = gather(G, z.x, z.y, z.r, 'ally', GB, 0.5);
        for (let i = 0; i < n; i++) {
          const m = GB[i];
          if (z.dps > 0) dealDamage(m, z.dps * tr, { source: z.owner || 'enemy', element: z.element, silent: true, crit: false });
          if (z.slow > 0) applyStatus(m, 'slow', tr + 0.25, z.slow);
          if (z.status) applyStatus(m, z.status.type, z.status.dur, z.status.power);
        }
      }
      return;
    }
    if (!(z.dps > 0) && !(z.slow > 0) && !z.status) return;
    const n = gather(G, z.x, z.y, z.r, 'enemy', GB, 0.5);
    if (!n) return;
    const dmgMul = (pl && pl.stats && pl.stats.dmg) || 1;
    const tickDmg = z.dps * tr;
    const loud = z.kind === 'vortex' || z.kind === 'crater';
    for (let i = 0; i < n; i++) {
      const m = GB[i];
      if (!alive(m)) continue;
      if (z.devour && !m.boss) {
        if (m.hp <= tickDmg * dmgMul * 1.1 || m.hp < (m.maxHp || m.hp) * 0.12) { devour(G, z, m); continue; }
      }
      if (z.slow > 0) applyStatus(m, 'slow', tr + 0.25, z.slow);
      if (z.status) applyStatus(m, z.status.type, z.status.dur, z.status.power);
      if (tickDmg > 0) {
        const dx = m.x - z.x, dy = m.y - z.y, d = hypot(dx, dy) || 1;
        dealDamage(m, tickDmg, { source: z.source || 'playerSkill', skill: z.skill, element: z.element, silent: !loud, knock: z.knock, kx: dx / d, ky: dy / d });
      }
    }
  }

  function pullZone(G, z, dt) {
    const R = z.r * 1.3;
    const n = gather(G, z.x, z.y, R, 'enemy', GB, 0);
    for (let i = 0; i < n; i++) {
      const m = GB[i];
      const dx = z.x - m.x, dy = z.y - m.y, d = hypot(dx, dy) || 1;
      if (d < 3) continue;
      const mass = m.boss ? 10 : max(0.6, m.mass || 1);
      const k = z.pull * (0.45 + 0.75 * (1 - d / R)) / sqrt(mass);
      let step = k * dt;
      if (step > d - 3) step = max(0, d - 3);
      const ux = dx / d, uy = dy / d;
      m.x += ux * step - uy * step * 0.45;
      m.y += uy * step + ux * step * 0.45;
    }
  }

  function devour(G, z, m) {
    const pl = G.player;
    const mx = m.x, my = m.y, col = (m.def && m.def.color) || '#b388ff';
    killM(m, { absorbed: true, source: 'playerSkill', skill: z.skill || 'gluttony', devoured: true });
    if (pl && !pl.dead) healTarget(pl, z.heal + (pl.maxHp || 100) * 0.008);
    if (camIn(mx, my, 40)) {
      const F = fx();
      F.burst(mx, my, { count: 10, colors: ['#ea80fc', col, '#4a148c'], speed: [40, 160], life: [0.3, 0.6], size: [2, 4], glow: true, angle: atan2(z.y - my, z.x - mx), spread: 1.4 });
      F.converge(z.x, z.y, { radius: max(20, hypot(mx - z.x, my - z.y)), count: 6, color: '#e040fb', life: 0.35, size: 2 });
    }
    sfx('absorb', { vol: 0.35, pitch: rnd(0.9, 1.3) });
  }

  function zoneParticles(z, dt) {
    z.pt -= dt;
    if (z.pt > 0) return;
    let iv = 0;
    switch (z.kind) {
      case 'fire': iv = 0.09; break;
      case 'crater': iv = 0.14; break;
      case 'vortex': iv = 0.05; break;
      case 'shadow': iv = 0.22; break;
      case 'mist': iv = 0.3; break;
      default: return;
    }
    z.pt = iv * (qual() === 2 ? 1 : qual() === 1 ? 1.6 : 2.8);
    if (!camIn(z.x, z.y, z.r)) return;
    const F = fx();
    const a = random() * TAU, d = sqrt(random()) * z.r * 0.85;
    const x = z.x + cos(a) * d, y = z.y + sin(a) * d * 0.9;
    switch (z.kind) {
      case 'fire':
        F.burst(x, y, { count: 1, colors: ['#ffd180', '#ff9100', '#ff3d00'], speed: [20, 60], life: [0.35, 0.7], size: [1.5, 3.5], glow: true, gravity: -90, colorEnd: '#4e1500' });
        break;
      case 'crater':
        F.burst(x, y, { count: 1, color: '#3e2723', speed: [8, 24], life: [0.6, 1.1], size: [6, 12], shape: 'smoke', gravity: -30 });
        if (random() < 0.5) F.burst(x, y, { count: 1, color: '#ffab40', speed: [20, 50], life: [0.3, 0.6], size: [1.2, 2.4], glow: true, gravity: -80 });
        break;
      case 'vortex': {
        const ra = random() * TAU, rr = z.r * rnd(0.8, 1.25);
        F.converge(z.x, z.y, { radius: rr, count: 2, color: random() < 0.5 ? '#e040fb' : '#7c4dff', life: 0.45, size: rnd(1.5, 3) });
        if (random() < 0.3) F.burst(z.x + cos(ra) * rr, z.y + sin(ra) * rr, { count: 1, color: '#12001f', speed: [5, 15], life: [0.5, 0.8], size: [8, 14], shape: 'smoke' });
        break;
      }
      case 'shadow':
        F.burst(x, y, { count: 1, colors: ['#b388ff', '#651fff'], speed: [8, 24], life: [0.4, 0.8], size: [1.5, 2.5], glow: true, gravity: -50 });
        break;
      case 'mist':
        F.burst(x, y, { count: 1, color: z.color, speed: [4, 14], life: [0.8, 1.4], size: [10, 18], shape: 'smoke', gravity: -10 });
        break;
      default: break;
    }
  }

  /* ======================================================== sonic waves */
  const waves = [];
  function spawnWave(o) {
    if (waves.length >= 40) return;
    waves.push({
      x: o.x, y: o.y, follow: o.follow || null, r: 0, R: o.R, t: -(o.delay || 0), life: o.life || 0.5,
      dmg: o.dmg, knock: o.knock || 200, color: o.color || '#b388ff', stun: o.stun || 0, hit: new Set(), skill: o.skill || 'sonic_wave',
    });
  }
  function updateWaves(G, dt) {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      const wasNeg = w.t < 0;
      w.t += dt;
      if (w.t < 0) continue;
      if (w.follow && !w.follow.dead) { w.x = w.follow.x; w.y = w.follow.y; }
      if (wasNeg) {
        sfx('sonic', { vol: 0.45, pitch: rnd(0.95, 1.1) });
        fx().ring(w.x, w.y, { radius: w.R * 0.35, color: '#ede7f6', life: 0.18, width: 3 });
      }
      const k = clamp(w.t / w.life, 0, 1);
      w.r = w.R * outCubic(k);
      if (k < 1) {
        const n = gather(G, w.x, w.y, w.r, 'enemy', GB, 1);
        for (let j = 0; j < n; j++) {
          const m = GB[j];
          if (w.hit.has(m.id)) continue;
          w.hit.add(m.id);
          const dx = m.x - w.x, dy = m.y - w.y, d = hypot(dx, dy) || 1;
          dealDamage(m, w.dmg, { source: 'playerSkill', skill: w.skill, element: 'sound', knock: w.knock, kx: dx / d, ky: dy / d });
          if (w.stun > 0) applyStatus(m, 'stun', w.stun, 1);
          if (camIn(m.x, m.y, 20)) fx().burst(m.x - dx / d * (m.r || 14), m.y - dy / d * (m.r || 14), { count: 3, color: '#d1c4e9', speed: [80, 180], life: [0.12, 0.25], size: [1.2, 2.2], shape: 'spark', angle: atan2(dy, dx), spread: 0.8 });
        }
      }
      if (w.t >= w.life + 0.22) waves.splice(i, 1);
    }
  }

  /* ========================================================= meteors */
  const falls = [];
  function spawnMeteor(G, x, y, o) {
    if (falls.length >= 30) return;
    const dur = o.dur || 0.85;
    falls.push({
      x, y, t: 0, dur, R: o.R, dmg: o.dmg, lv: o.lv, size: o.size || 18, sx: x - rnd(180, 300), sy: y - rnd(520, 620),
      rot: random() * TAU, seed: random() * 100, pt: 0, craterDps: o.craterDps, burn: o.burn,
    });
    spawnZone({ x, y, r: o.R, life: dur, kind: 'warning', team: 'player', color: '#ff9100' });
    sfx('meteor', { vol: 0.5, pitch: rnd(0.9, 1.1) });
  }
  function fallPos(f, out) {
    const k = clamp(f.t / f.dur, 0, 1);
    const e = k * k * (0.4 + 0.6 * k);
    out.x = f.sx + (f.x - f.sx) * e;
    out.y = f.sy + (f.y - f.sy) * e;
    return k;
  }
  const tmpPos = { x: 0, y: 0 };
  function updateFalls(G, dt) {
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i];
      f.t += dt;
      f.rot += dt * 5;
      fallPos(f, tmpPos);
      f.pt -= dt;
      if (f.pt <= 0 && f.t < f.dur) {
        f.pt = qual() === 2 ? 0.02 : 0.045;
        if (camIn(tmpPos.x, tmpPos.y, 80)) {
          const ang = atan2(f.sy - f.y, f.sx - f.x);
          fx().burst(tmpPos.x, tmpPos.y, { count: 2, colors: ['#fff59d', '#ffab40', '#ff3d00'], speed: [30, 120], life: [0.25, 0.55], size: [3, 7], glow: true, angle: ang, spread: 0.7, colorEnd: '#3e1000' });
          if (random() < 0.5) fx().burst(tmpPos.x, tmpPos.y, { count: 1, color: '#4e342e', speed: [20, 60], life: [0.5, 0.9], size: [8, 14], shape: 'smoke', angle: ang, spread: 0.5 });
        }
      }
      if (f.t >= f.dur) {
        falls.splice(i, 1);
        meteorImpact(G, f);
      }
    }
  }
  function meteorImpact(G, f) {
    const F = fx();
    F.explosion(f.x, f.y, { radius: f.R, color: '#ff6d00' });
    F.burst(f.x, f.y, { count: 10, colors: ['#5d4037', '#3e2723', '#8d6e63'], speed: [120, 320], life: [0.4, 0.8], size: [2.5, 5], shape: 'square', gravity: 520 });
    F.ring(f.x, f.y, { radius: f.R * 1.6, color: '#ffcc80', life: 0.45, width: 4 });
    sfx('explosion', { vol: 0.75, pitch: rnd(0.85, 1.05) });
    const pl = G.player;
    const near = pl ? hypot(pl.x - f.x, pl.y - f.y) : 0;
    shake(near < 400 ? 7 : 4, 0.3);
    const n = gather(G, f.x, f.y, f.R, 'enemy', GB, 0.6);
    for (let i = 0; i < n; i++) {
      const m = GB[i];
      const dx = m.x - f.x, dy = m.y - f.y, d = hypot(dx, dy) || 1;
      const fall = 1 - 0.4 * clamp(d / f.R, 0, 1);
      dealDamage(m, f.dmg * fall, { source: 'playerSkill', skill: 'meteor', element: 'fire', knock: 280, kx: dx / d, ky: dy / d });
      applyStatus(m, 'burn', 2.5, f.burn);
    }
    if (n >= 5) hitstop(0.035);
    spawnZone({ x: f.x, y: f.y, r: f.R * 0.75, life: 2.6 + f.lv * 0.2, kind: 'crater', team: 'player', dps: f.craterDps, status: { type: 'burn', dur: 1.5, power: f.burn * 0.5 }, skill: 'meteor' });
  }

  /* ===================================================== cleave arcs */
  const arcs = [];
  function addArc(follow, ang, R, span, life, color) {
    if (arcs.length >= 16) arcs.shift();
    arcs.push({ follow, x: follow.x, y: follow.y, ang, R, span, t: 0, life, color, dir: random() < 0.5 ? 1 : -1 });
  }
  function updateArcs(dt) {
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.t += dt;
      if (a.follow && !a.follow.dead) { a.x = a.follow.x; a.y = a.follow.y; }
      if (a.t >= a.life) arcs.splice(i, 1);
    }
  }

  /* ================================================= spectral wolves */
  const summons = [];
  function spawnWolf(G, pl, i, n, lv, life) {
    if (summons.length >= 14) return;
    const a = TAU * i / n + rnd(-0.2, 0.2);
    const x = pl.x + cos(a) * 46, y = pl.y + sin(a) * 46;
    const w = {
      kind: 'wolf', x, y, vx: cos(a) * 120, vy: sin(a) * 120, face: a, t: 0, life, maxLife: life, state: 'spawn', st: 0.4,
      target: null, last: null, dmg: (16 + 9 * lv) * ((st(pl).allyDmg > 0 ? st(pl).allyDmg : 1)), lv, slot: i, n, run: random() * TAU,
      seed: random() * 10, alpha: 0, scale: 1, hx: new Float32Array(8), hn: 0, hh: 0, ht: 0, lunge: 0, hitDone: false, glowT: 0,
    };
    summons.push(w);
    const F = fx();
    F.burst(x, y, { count: 12, colors: ['#e3f2fd', '#82b1ff', '#448aff'], speed: [40, 160], life: [0.3, 0.7], size: [2, 4], glow: true });
    F.ring(x, y, { radius: 40, color: '#82b1ff', life: 0.35, width: 3 });
  }
  function wolfTarget(G, w, pl) {
    const k = nearestK(G, w.x, w.y, 420, 3);
    let pick = null;
    for (let i = 0; i < k; i++) {
      const m = candM[i];
      if (pl && hypot(m.x - pl.x, m.y - pl.y) > 560) continue;
      if (m === w.last && k > 1) continue;
      pick = m; break;
    }
    return pick;
  }
  function updateSummons(G, pl, dt) {
    for (let i = summons.length - 1; i >= 0; i--) {
      const w = summons[i];
      w.t += dt;
      w.life -= dt;
      w.ht += dt;
      if (w.ht >= 0.035) {
        w.ht = 0;
        w.hx[w.hh * 2] = w.x; w.hx[w.hh * 2 + 1] = w.y;
        w.hh = (w.hh + 1) % 4;
        if (w.hn < 4) w.hn++;
      }
      if (w.life <= 0 || !pl) {
        summons.splice(i, 1);
        if (camIn(w.x, w.y, 30)) fx().burst(w.x, w.y, { count: 10, colors: ['#e3f2fd', '#82b1ff'], speed: [30, 120], life: [0.4, 0.8], size: [1.5, 3], glow: true, gravity: -60 });
        continue;
      }
      w.alpha = min(1, w.t / 0.35) * min(1, w.life / 0.45);
      let spd = hypot(w.vx, w.vy);
      switch (w.state) {
        case 'spawn':
          w.st -= dt;
          w.vx *= 0.9; w.vy *= 0.9;
          if (w.st <= 0) w.state = 'seek';
          break;
        case 'seek': {
          if (!alive(w.target) || w.target.team !== 'enemy') w.target = wolfTarget(G, w, pl);
          const m = w.target;
          if (m) {
            const dx = m.x - w.x, dy = m.y - w.y, d = hypot(dx, dy) || 1;
            const sp = 330;
            w.vx = U.damp(w.vx, dx / d * sp, 8, dt);
            w.vy = U.damp(w.vy, dy / d * sp, 8, dt);
            if (d < 150 + (m.r || 16)) { w.state = 'crouch'; w.st = 0.12; }
          } else {
            const oa = clock * 0.8 + TAU * w.slot / w.n;
            const tx = pl.x + cos(oa) * 72, ty = pl.y + sin(oa) * 60;
            const dx = tx - w.x, dy = ty - w.y, d = hypot(dx, dy);
            const sp = min(380, d * 4);
            w.vx = U.damp(w.vx, d > 1 ? dx / d * sp : 0, 6, dt);
            w.vy = U.damp(w.vy, d > 1 ? dy / d * sp : 0, 6, dt);
          }
          break;
        }
        case 'crouch': {
          w.st -= dt;
          w.vx *= 0.8; w.vy *= 0.8;
          const m = w.target;
          if (!alive(m)) { w.state = 'seek'; break; }
          w.face = U.lerpAngle(w.face, atan2(m.y - w.y, m.x - w.x), min(1, dt * 20));
          if (w.st <= 0) {
            const a = atan2(m.y - w.y, m.x - w.x);
            w.vx = cos(a) * 920; w.vy = sin(a) * 920;
            w.state = 'lunge'; w.st = 0.3; w.hitDone = false;
            if (camIn(w.x, w.y, 20)) fx().burst(w.x, w.y, { count: 4, color: '#82b1ff', speed: [40, 100], life: [0.2, 0.4], size: [3, 6], shape: 'smoke', angle: a + PI, spread: 0.8 });
          }
          break;
        }
        case 'lunge': {
          w.st -= dt;
          const m = w.target;
          if (alive(m) && !w.hitDone) {
            const dx = m.x - w.x, dy = m.y - w.y, d = hypot(dx, dy) || 1;
            if (d < (m.r || 16) + 20) {
              w.hitDone = true;
              dealDamage(m, w.dmg, { source: 'playerSkill', skill: 'wolf_howl', element: 'beast', knock: 220, kx: dx / d, ky: dy / d });
              if (w.lv >= 4) applyStatus(m, 'slow', 1.2, 0.35);
              const F = fx();
              F.slash(m.x, m.y, atan2(dy, dx) + PI * 0.5, { radius: 26 + (m.r || 16) * 0.6, arc: 2.2, color: '#82b1ff', life: 0.16, width: 5 });
              F.burst(m.x, m.y, { count: 6, colors: ['#ffffff', '#82b1ff'], speed: [80, 200], life: [0.15, 0.35], size: [1.5, 3], shape: 'spark', angle: atan2(dy, dx), spread: 1.2 });
              sfx('slash', { vol: 0.3, pitch: rnd(1.2, 1.5) });
              w.vx *= -0.35; w.vy *= -0.35;
              w.last = m;
              w.state = 'recover'; w.st = 0.22;
              break;
            }
          }
          w.vx *= Math.exp(-2.5 * dt); w.vy *= Math.exp(-2.5 * dt);
          if (w.st <= 0) { w.state = 'recover'; w.st = 0.12; w.last = m; }
          break;
        }
        case 'recover':
          w.st -= dt;
          w.vx *= Math.exp(-6 * dt); w.vy *= Math.exp(-6 * dt);
          if (w.st <= 0) { w.state = 'seek'; w.target = null; }
          break;
        default: w.state = 'seek';
      }
      w.x += w.vx * dt; w.y += w.vy * dt;
      if (pl && hypot(w.x - pl.x, w.y - pl.y) > 700) {
        // leashed: blink back next to the master in a puff of spirit light
        fx().burst(w.x, w.y, { count: 6, color: '#82b1ff', speed: [30, 90], life: [0.3, 0.5], size: [2, 3], glow: true });
        w.x = pl.x + rnd(-40, 40); w.y = pl.y + rnd(-40, 40); w.vx = w.vy = 0; w.state = 'spawn'; w.st = 0.2;
      }
      spd = hypot(w.vx, w.vy);
      if (spd > 20 && w.state !== 'crouch') w.face = U.lerpAngle(w.face, atan2(w.vy, w.vx), min(1, dt * 12));
      w.run += dt * (4 + spd * 0.035);
    }
  }

  /* ===================================================== auto skills */
  function webLand(p, target, G) {
    const pl = (G || SK.G).player;
    const lv = p.data || 1, a = areaOf(pl);
    const x = target && target.x != null ? target.x : p.x, y = target && target.y != null ? target.y : p.y;
    spawnZone({ x, y, r: (54 + 9 * lv) * a, life: 3.2 + 0.5 * lv, kind: 'web', team: 'player', slow: 0.35 + 0.07 * lv, dps: 2 + 2 * lv, skill: 'sticky_web', color: '#e1d5ff' });
    fx().burst(x, y, { count: 10, color: '#f3e5f5', speed: [60, 180], life: [0.2, 0.4], size: [1, 2], shape: 'spark' });
    sfx('web', { vol: 0.35, pitch: rnd(0.9, 1.15) });
  }
  function webExpire(p, G) { webLand(p, null, G); }

  const AUTO = {
    water_blade(G, p, lv) {
      const n = min(9, 1 + floor(lv / 2) + amountOf(p));
      const k = nearestK(G, p.x, p.y, 560, n);
      if (!k) return false;
      const sp = 400 * pspd(p), r = 11 * (0.5 + 0.5 * areaOf(p));
      const dmg = 9 + 5 * (lv - 1);
      const pierce = lv >= 5 ? 2 : lv >= 3 ? 1 : 0;
      let a0 = 0;
      for (let i = 0; i < n; i++) {
        const m = candM[i % k];
        const a = atan2(m.y - p.y, m.x - p.x) + (i - (n - 1) / 2) * 0.32;
        if (i === 0) a0 = a;
        spawnProjectile({
          x: p.x + cos(a) * 16, y: p.y + sin(a) * 16, vx: cos(a) * sp, vy: sin(a) * sp, r, dmg, team: 'player', element: 'water',
          life: 1.7, pierce, homing: 4.4, kind: 'water', color: '#4fc3ff', knock: 90, spin: 17, skill: 'water_blade', target: m,
        });
      }
      fx().burst(p.x + cos(a0) * 18, p.y + sin(a0) * 18, { count: 5, colors: ['#e1f5fe', '#4fc3ff'], speed: [40, 120], life: [0.15, 0.3], size: [1.5, 3], shape: 'drop', angle: a0, spread: 1.2 });
      pokeBody(p, a0, 0.35);
      sfx('water', { vol: 0.45, pitch: rnd(0.92, 1.15) });
      return true;
    },

    sonic_wave(G, p, lv) {
      const R = (150 + 22 * lv) * areaOf(p);
      if (!nearest(G, p.x, p.y, R)) return false;
      const n = min(4, 1 + (lv >= 4 ? 1 : 0) + amountOf(p));
      for (let i = 0; i < n; i++) {
        spawnWave({ x: p.x, y: p.y, follow: p, R: R * (1 - i * 0.06), life: 0.5, delay: i * 0.17, dmg: 7 + 4 * lv, knock: 220 + 22 * lv, color: '#b388ff', stun: lv >= 5 ? 0.3 : 0 });
      }
      pokeBody(p, random() * TAU, 0.5);
      return true;
    },

    sticky_web(G, p, lv) {
      const n = min(6, 1 + floor((lv - 1) / 2) + amountOf(p));
      const k = nearestK(G, p.x, p.y, 470, n);
      if (!k) return false;
      const sp = 360 * pspd(p);
      for (let i = 0; i < n; i++) {
        const m = candM[i % k];
        const jx = i >= k ? rnd(-50, 50) : 0, jy = i >= k ? rnd(-50, 50) : 0;
        const tx = m.x + (m.vx || 0) * 0.25 + jx, ty = m.y + (m.vy || 0) * 0.25 + jy;
        const d = hypot(tx - p.x, ty - p.y) || 1, a = atan2(ty - p.y, tx - p.x);
        spawnProjectile({
          x: p.x, y: p.y, vx: cos(a) * sp, vy: sin(a) * sp, r: 10, dmg: 4 + 2 * lv, team: 'player', element: 'web',
          life: clamp(d / sp, 0.12, 1.4), kind: 'web', color: '#e1d5ff', knock: 30, spin: 6, skill: 'sticky_web',
          data: lv, onHit: webLand, onExpire: webExpire,
        });
      }
      sfx('web', { vol: 0.4 });
      return true;
    },

    needle_storm(G, p, lv) {
      const m = nearest(G, p.x, p.y, 520);
      if (!m) return false;
      const s = sstate(p, 'needle_storm', () => ({ q: 0, t: 0, target: null, n: 0 }));
      s.q = min(30, 4 + lv + amountOf(p) * 2);
      s.t = 0; s.target = m; s.n = 0;
      return true;
    },

    thorn_ring(G, p, lv, dt) { orbiters(G, p, lv, dt, 'thorn_ring'); return 'cont'; },
    magma_orb(G, p, lv, dt) { orbiters(G, p, lv, dt, 'magma_orb'); return 'cont'; },

    cleave(G, p, lv) {
      const range = (105 + 12 * lv) * areaOf(p);
      const m = nearest(G, p.x, p.y, range + 30);
      if (!m) return false;
      const arc = 2.0 + 0.12 * lv;
      const toM = atan2(m.y - p.y, m.x - p.x);
      const facing = p.facing || 0;
      const ang = abs(U.angleDiff(facing, toM)) <= arc / 2 ? facing : toM;
      const dmg = 22 + 13 * lv;
      doCleave(G, p, ang, range, arc, dmg, lv, 1);
      const extra = min(3, amountOf(p));
      for (let j = 0; j < extra; j++) {
        const off = j === 0 ? PI : (j === 1 ? PI / 2 : -PI / 2);
        later(0.12 * (j + 1), () => { if (!p.dead) doCleave(G, p, ang + off, range * 0.9, arc, dmg * 0.8, lv, j % 2 ? 1 : -1); });
      }
      return true;
    },

    poison_mist(G, p, lv) {
      const n = min(6, 1 + floor(lv / 2) + amountOf(p));
      const k = nearestK(G, p.x, p.y, 420, n);
      if (!k) return false;
      const a = areaOf(p);
      for (let i = 0; i < n; i++) {
        let x, y;
        if (i < k) { const m = candM[i]; x = m.x + (m.vx || 0) * 0.3; y = m.y + (m.vy || 0) * 0.3; }
        else { const an = random() * TAU, d = rnd(60, 150); x = p.x + cos(an) * d; y = p.y + sin(an) * d; }
        spawnZone({
          x, y, r: (62 + 8 * lv) * a, life: 3.6 + 0.5 * lv, kind: 'mist', team: 'player', dps: 5 + 3.5 * lv,
          status: { type: 'poison', dur: 2.5, power: 2 + 1.5 * lv }, color: '#8bc34a', skill: 'poison_mist',
        });
        fx().burst(x, y, { count: 8, colors: ['#ccff90', '#8bc34a', '#33691e'], speed: [30, 110], life: [0.5, 0.9], size: [8, 16], shape: 'smoke' });
      }
      sfx('poison', { vol: 0.5, pitch: rnd(0.9, 1.1) });
      return true;
    },

    spirit_orbs(G, p, lv) {
      const n = min(10, 2 + floor(lv / 2) + amountOf(p));
      const k = nearestK(G, p.x, p.y, 600, n);
      if (!k) return false;
      const sp = 210 * pspd(p);
      for (let i = 0; i < n; i++) {
        const a = TAU * i / n + clock * 1.3;
        spawnProjectile({
          x: p.x + cos(a) * 20, y: p.y + sin(a) * 20, vx: cos(a) * sp, vy: sin(a) * sp, r: 9 * (0.6 + 0.4 * areaOf(p)),
          dmg: 8 + 5 * lv, team: 'player', element: 'spirit', life: 3.6, pierce: lv >= 5 ? 1 : 0, homing: 5.2, accel: 1.1,
          maxSpeed: 520 * pspd(p), kind: 'spirit', color: '#a7ffeb', knock: 70, skill: 'spirit_orbs', target: candM[i % k],
        });
      }
      fx().ring(p.x, p.y, { radius: 46, color: '#a7ffeb', life: 0.35, width: 2 });
      sfx('spirit', { vol: 0.45, pitch: rnd(0.95, 1.1) });
      return true;
    },

    fire_breath(G, p, lv) {
      const range = (150 + 16 * lv) * areaOf(p);
      const m = nearest(G, p.x, p.y, range + 40);
      if (!m) return false;
      const s = sstate(p, 'fire_breath', () => ({ t: 0, dur: 0, ang: 0, tick: 0, lv: 1, range: 0, half: 0.4, zone: false }));
      s.dur = s.t = 0.65 + 0.05 * lv;
      s.ang = atan2(m.y - p.y, m.x - p.x);
      s.tick = 0; s.lv = lv; s.range = range; s.half = 0.42 + 0.03 * lv; s.zone = false; s.n = 0;
      sfx('fire', { vol: 0.6 });
      pokeBody(p, s.ang + PI, 0.6);
      return true;
    },

    meteor(G, p, lv) {
      if (!collectView(G)) return false;
      const n = min(8, 1 + floor(lv / 2) + amountOf(p));
      const R = (75 + 8 * lv) * areaOf(p);
      for (let i = 0; i < n; i++) {
        const m = viewM[floor(random() * viewN)];
        const x = m.x + (m.vx || 0) * 0.6 + rnd(-20, 20), y = m.y + (m.vy || 0) * 0.6 + rnd(-20, 20);
        const o = { R, dmg: 38 + 22 * lv, lv, size: 16 + lv * 1.5, craterDps: 5 + 3 * lv, burn: 3 + 2 * lv, dur: 0.85 };
        if (i === 0) spawnMeteor(G, x, y, o);
        else later(i * 0.2, () => spawnMeteor(G, x, y, o));
      }
      return true;
    },
  };
  const AUTO_IDS = ['water_blade', 'sonic_wave', 'sticky_web', 'needle_storm', 'thorn_ring', 'magma_orb', 'cleave', 'poison_mist', 'spirit_orbs', 'fire_breath', 'meteor'];
  const PASSIVE_IDS = ['regen', 'body_armor', 'shadow_step'];
  const ACTIVE_IDS = ['black_lightning', 'wolf_howl', 'gluttony'];

  function doCleave(G, p, ang, range, arc, dmg, lv, dir) {
    const F = fx();
    F.slash(p.x, p.y, ang, { radius: range * 0.92, arc, color: '#ff1744', life: 0.24, width: 20 + 2 * lv, dir });
    F.slash(p.x, p.y, ang, { radius: range * 0.78, arc: arc * 0.9, color: '#ffffff', life: 0.14, width: 7, dir });
    addArc(p, ang, range, arc, 0.3, '#ff1744');
    for (let i = 0; i < 5; i++) {
      const a = ang - arc / 2 + arc * (i + 0.5) / 5;
      F.spark(p.x + cos(a) * range * 0.85, p.y + sin(a) * range * 0.85, a + PI / 2 * dir, { color: '#ffcdd2', speed: [160, 300], life: [0.12, 0.22] });
    }
    kick(cos(ang) * 7, sin(ang) * 7);
    shake(3, 0.15);
    pokeBody(p, ang, 0.8);
    sfx('slash', { vol: 0.7, pitch: rnd(0.85, 1.05) });
    const n = gather(G, p.x, p.y, range, 'enemy', GB, 0.8);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const m = GB[i];
      const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1;
      const tol = Math.asin(clamp((m.r || 16) / d, 0, 1));
      if (abs(U.angleDiff(ang, atan2(dy, dx))) > arc / 2 + tol) continue;
      dealDamage(m, dmg, { source: 'playerSkill', skill: 'cleave', element: 'physical', knock: 320, kx: dx / d, ky: dy / d });
      if (lv >= 4) applyStatus(m, 'stun', 0.25, 1);
      hits++;
    }
    if (hits >= 4) hitstop(0.045);
  }

  /* ----------------------------------------------------------- orbiters */
  function orbitInit() { return { ang: 0, n: 0, R: 0, cd: new Map(), prune: 0, pt: 0, size: 1, pos: new Float32Array(32) }; }
  function orbiters(G, p, lv, dt, id) {
    const s = sstate(p, id, orbitInit);
    const a = areaOf(p);
    const thorn = id === 'thorn_ring';
    let n, R, speed, dmg, hitR, cdT;
    if (thorn) {
      n = min(8, 2 + floor(lv / 2) + amountOf(p));
      R = (78 + 6 * lv) * a;
      speed = 2.4 + 0.18 * lv;
      dmg = 6 + 4 * lv;
      hitR = 18 * (0.6 + 0.4 * a);
      cdT = 0.45;
    } else {
      n = min(7, 1 + Math.ceil(lv / 2) + amountOf(p));
      R = (115 + 8 * lv) * a * (0.82 + 0.22 * sin(clock * 1.6));
      speed = -(1.8 + 0.1 * lv);
      dmg = 10 + 6 * lv;
      hitR = (12 + lv) * sqrt(a);
      cdT = 0.6;
    }
    s.n = n; s.R = R; s.size = thorn ? 1 + 0.08 * lv : hitR;
    s.ang += speed * dt;
    s.prune -= dt;
    if (s.prune <= 0) {
      s.prune = 2;
      for (const [k, v] of s.cd) if (v < clock) s.cd.delete(k);
    }
    s.pt -= dt;
    const emit = s.pt <= 0;
    if (emit) s.pt = thorn ? 0.14 : 0.035;
    const F = fx();
    for (let i = 0; i < n; i++) {
      const oa = s.ang + TAU * i / n;
      const ox = p.x + cos(oa) * R, oy = p.y + sin(oa) * R;
      s.pos[i * 2] = ox; s.pos[i * 2 + 1] = oy;
      if (emit && deco() && camIn(ox, oy, 20)) {
        if (thorn) F.burst(ox, oy, { count: 1, colors: ['#9ccc65', '#558b2f', '#c5e1a5'], speed: [10, 40], life: [0.5, 0.9], size: [2, 3.5], shape: 'drop', gravity: 50, drag: 2, spin: 6 });
        else F.burst(ox, oy, { count: 1, colors: ['#ffd180', '#ff9100', '#ff3d00'], speed: [15, 45], life: [0.3, 0.6], size: [1.5, 3.5], glow: true, colorEnd: '#4e1500', angle: oa + (speed > 0 ? -PI / 2 : PI / 2), spread: 0.9 });
      }
      const k = gather(G, ox, oy, hitR, 'enemy', GB, 1);
      for (let j = 0; j < k; j++) {
        const m = GB[j];
        const next = s.cd.get(m.id);
        if (next !== undefined && next > clock) continue;
        s.cd.set(m.id, clock + cdT);
        const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1;
        if (thorn) {
          dealDamage(m, dmg, { source: 'playerSkill', skill: id, element: 'nature', knock: 150, kx: dx / d, ky: dy / d });
          if (lv >= 4) applyStatus(m, 'slow', 0.8, 0.35);
          if (camIn(m.x, m.y, 20)) F.burst(m.x, m.y, { count: 4, colors: ['#c5e1a5', '#7cb342'], speed: [60, 150], life: [0.2, 0.45], size: [1.5, 3], shape: 'drop', angle: oa + PI / 2, spread: 1.6 });
        } else {
          dealDamage(m, dmg, { source: 'playerSkill', skill: id, element: 'fire', knock: 110, kx: dx / d, ky: dy / d });
          applyStatus(m, 'burn', 2.2, 2 + 1.5 * lv);
          if (camIn(m.x, m.y, 20)) {
            F.burst(m.x, m.y, { count: 6, colors: ['#fff59d', '#ff9100', '#ff3d00'], speed: [60, 180], life: [0.2, 0.45], size: [2, 4], glow: true, colorEnd: '#3e1000' });
            F.ring(ox, oy, { radius: hitR * 2.2, color: '#ff9100', life: 0.22, width: 3 });
          }
          sfx('magma', { vol: 0.25, pitch: rnd(0.9, 1.2) });
        }
      }
    }
  }

  /* --------------------------------------------- channels (per frame) */
  function updateChannels(G, p, dt) {
    const ss = p.skillState;
    // needle bursts
    const ns = ss.needle_storm;
    if (ns && ns.q > 0) {
      ns.t -= dt;
      const lv = clamp(lvl(p, 'needle_storm'), 1, 5);
      while (ns.t <= 0 && ns.q > 0) {
        if (!alive(ns.target)) ns.target = nearest(G, p.x, p.y, 560);
        if (!ns.target) { ns.q = 0; break; }
        const m = ns.target;
        const a = atan2(m.y - p.y, m.x - p.x) + rnd(-0.13, 0.13);
        const sp = 760 * pspd(p);
        const off = rnd(-6, 6);
        spawnProjectile({
          x: p.x + cos(a) * 14 - sin(a) * off, y: p.y + sin(a) * 14 + cos(a) * off, vx: cos(a) * sp, vy: sin(a) * sp, r: 5,
          dmg: 4 + 2.2 * lv, team: 'player', element: 'physical', life: 0.75, pierce: lv >= 4 ? 1 : 0, kind: 'needle',
          color: '#fff176', knock: 40, skill: 'needle_storm',
        });
        if (ns.n % 3 === 0) sfx('needle', { vol: 0.3, pitch: rnd(0.95, 1.2) });
        ns.n++;
        ns.q--;
        ns.t += 0.045;
      }
    }
    // fire breath channel
    const fb = ss.fire_breath;
    if (fb && fb.t > 0) {
      fb.t -= dt;
      const m = nearest(G, p.x, p.y, fb.range + 60);
      if (m) fb.ang = U.lerpAngle(fb.ang, atan2(m.y - p.y, m.x - p.x), min(1, dt * 4));
      const ox = p.x + cos(fb.ang) * (p.r || 22) * 0.8, oy = p.y + sin(fb.ang) * (p.r || 22) * 0.8;
      if (camIn(ox, oy, fb.range)) {
        fx().burst(ox, oy, {
          count: qual() === 2 ? 4 : 2, colors: ['#fff59d', '#ffca28', '#ff6d00', '#ff3d00'], colorEnd: '#3e1a0b', angle: fb.ang,
          spread: fb.half * 1.7, speed: [fb.range * 1.5, fb.range * 2.3], life: [0.3, 0.48], size: [5, 9], sizeEnd: 2.6, sizeMode: 'grow',
          drag: 1.4, shape: 'glow', add: true,
        });
        if (deco()) fx().burst(ox, oy, { count: 1, color: '#4e342e', angle: fb.ang, spread: fb.half, speed: [fb.range, fb.range * 1.6], life: [0.5, 0.8], size: [8, 14], shape: 'smoke' });
      }
      shake(1.2, 0.08);
      fb.tick -= dt;
      if (fb.tick <= 0) {
        fb.tick += 0.1;
        fb.n++;
        const n = gather(G, p.x, p.y, fb.range, 'enemy', GB, 0.6);
        for (let i = 0; i < n; i++) {
          const e = GB[i];
          const dx = e.x - p.x, dy = e.y - p.y, d = hypot(dx, dy) || 1;
          const tol = Math.asin(clamp((e.r || 16) / d, 0, 1));
          if (abs(U.angleDiff(fb.ang, atan2(dy, dx))) > fb.half + tol) continue;
          dealDamage(e, 3 + 1.8 * fb.lv, { source: 'playerSkill', skill: 'fire_breath', element: 'fire', knock: 40, kx: dx / d, ky: dy / d, silent: fb.n % 2 === 0 });
          applyStatus(e, 'burn', 2.5, 2 + 1.5 * fb.lv);
        }
      }
      if (!fb.zone && fb.t < fb.dur * 0.5) {
        fb.zone = true;
        const zx = p.x + cos(fb.ang) * fb.range * 0.68, zy = p.y + sin(fb.ang) * fb.range * 0.68;
        spawnZone({ x: zx, y: zy, r: (45 + 5 * fb.lv) * areaOf(p), life: 2.2 + 0.3 * fb.lv, kind: 'fire', team: 'player', dps: 4 + 3 * fb.lv, status: { type: 'burn', dur: 1.5, power: 1 + fb.lv }, skill: 'fire_breath' });
      }
    }
    // shadow trail while dashing
    const sh = ss.shadow_step;
    if (sh && sh.trail > 0) {
      sh.trail -= dt;
      const lv = clamp(lvl(p, 'shadow_step'), 1, 5);
      const a = areaOf(p);
      const d = hypot(p.x - sh.lx, p.y - sh.ly);
      if (d >= 20 * a) {
        sh.lx = p.x; sh.ly = p.y;
        spawnZone({ x: p.x, y: p.y, r: (24 + 2 * lv) * a, life: 1.5 + 0.25 * lv, kind: 'shadow', team: 'player', dps: 9 + 6 * lv, skill: 'shadow_step', slow: lv >= 4 ? 0.3 : 0 });
      }
      sh.ft -= dt;
      if (sh.ft <= 0) { sh.ft = 0.03; fx().trail(p, '#7c4dff', p.r || 22); }
    }
  }

  /* ----------------------------------------------------------- passives */
  const ARMOR_BY_LV = [0, 1, 2, 3, 5, 6];
  function armorInit() { return { applied: 0, shield: false, t: 2.5, rt: 12, flash: 0, rot: 0, breakT: 0 }; }
  function shadowInit() { return { factor: 1, trail: 0, lx: 0, ly: 0, ft: 0 }; }
  function regenInit() { return { acc: 0, fx: 1 }; }
  function updatePassives(G, p, dt) {
    const sk = p.skills;
    const lr = clamp(sk.regen | 0, 0, 5);
    if (lr > 0 && p.hp < p.maxHp) {
      const s = sstate(p, 'regen', regenInit);
      let rate = 0.5 + 0.55 * lr + (p.maxHp || 100) * 0.0025 * lr;
      if (p.hp < p.maxHp * 0.3) rate *= 2;
      const before = p.hp;
      p.hp = min(p.maxHp, p.hp + rate * dt);
      s.acc += p.hp - before;
      s.fx -= dt;
      if (s.fx <= 0) {
        s.fx = 1.1;
        if (s.acc >= 1 && camIn(p.x, p.y, 40)) {
          fx().burst(p.x, p.y - 6, { count: 3, colors: ['#b9f6ca', '#69f0ae'], speed: [20, 50], life: [0.6, 0.9], size: [3, 5], shape: 'plus', gravity: -70, radius: (p.r || 22) * 0.8 });
        }
        s.acc = 0;
      }
    }
    const la = clamp(sk.body_armor | 0, 0, 5);
    if (la > 0) {
      const s = sstate(p, 'body_armor', armorInit);
      const want = ARMOR_BY_LV[la];
      if (s.applied !== want && p.stats) { p.stats.armor = (p.stats.armor || 0) + (want - s.applied); s.applied = want; }
      s.rt = (15 - 1.6 * la) * cdMul(p);
      if (!s.shield) {
        s.t -= dt;
        if (s.t <= 0) {
          s.shield = true; s.flash = 1;
          sfx('shield', { vol: 0.4, pitch: 1.25 });
          fx().ring(p.x, p.y, { radius: (p.r || 22) * 2.2, color: '#ffcc80', life: 0.4, width: 3 });
        }
      }
      s.flash = max(0, s.flash - dt * 2);
      s.breakT = max(0, s.breakT - dt);
      s.rot += dt * 0.7;
    }
    const ls = clamp(sk.shadow_step | 0, 0, 5);
    if (ls > 0) {
      const s = sstate(p, 'shadow_step', shadowInit);
      const factor = 1 - 0.07 * ls;
      if (s.factor !== factor && p.stats) {
        p.stats.dashCdMul = (p.stats.dashCdMul > 0 ? p.stats.dashCdMul : 1) / (s.factor || 1) * factor;
        s.factor = factor;
      }
    }
  }

  function onDash(G, player) {
    const p = player || (G && G.player);
    if (!p) return;
    const lv = clamp(lvl(p, 'shadow_step'), 0, 5);
    if (!lv) return;
    G = G || SK.G;
    const s = sstate(p, 'shadow_step', shadowInit);
    s.trail = max(0.24, (p.dashT || 0.22) + 0.06);
    s.lx = p.x; s.ly = p.y; s.ft = 0;
    p.invuln = max(p.invuln || 0, 0.3 + 0.05 * lv);
    const F = fx();
    F.burst(p.x, p.y, { count: 10, colors: ['#b388ff', '#651fff', '#1a0033'], speed: [40, 160], life: [0.3, 0.6], size: [4, 9], shape: 'smoke' });
    F.ring(p.x, p.y, { radius: 50, color: '#7c4dff', life: 0.3, width: 3 });
    spawnZone({ x: p.x, y: p.y, r: (24 + 2 * lv) * areaOf(p), life: 1.5 + 0.25 * lv, kind: 'shadow', team: 'player', dps: 9 + 6 * lv, skill: 'shadow_step' });
    if (lv >= 3) {
      const R = 75 * areaOf(p);
      const n = gather(G, p.x, p.y, R, 'enemy', GB, 0.6);
      for (let i = 0; i < n; i++) {
        const m = GB[i];
        const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1;
        dealDamage(m, 10 + 6 * lv, { source: 'playerSkill', skill: 'shadow_step', element: 'shadow', knock: 160, kx: dx / d, ky: dy / d });
      }
      F.ring(p.x, p.y, { radius: R, color: '#b388ff', life: 0.3, width: 4, fill: true, alpha: 0.5 });
    }
  }

  function onPlayerHit(G, player, amount) {
    const p = player || (G && G.player);
    if (!p || !(amount > 0)) return amount;
    const la = clamp(lvl(p, 'body_armor'), 0, 5);
    if (!la) return amount;
    const s = p.skillState && p.skillState.body_armor;
    if (!s || !s.shield) return amount;
    s.shield = false;
    s.t = s.rt = (15 - 1.6 * la) * cdMul(p);
    s.breakT = 0.5;
    p.invuln = max(p.invuln || 0, 0.45);
    const F = fx();
    F.burst(p.x, p.y, { count: 16, colors: ['#ffe0b2', '#c8a26b', '#8d6e63', '#5d4037'], speed: [120, 300], life: [0.35, 0.7], size: [2.5, 5], shape: 'square', gravity: 380, spin: 10 });
    F.ring(p.x, p.y, { radius: (p.r || 22) * 3, color: '#ffcc80', life: 0.35, width: 5 });
    F.text(p.x, p.y - (p.r || 22) - 20, 'PARATO!', { color: '#ffd180', size: 16, life: 0.8 });
    sfx('shield', { vol: 0.75 });
    shake(4, 0.2);
    G = G || SK.G;
    if (la >= 5 && G) {
      const R = 120 * areaOf(p);
      const n = gather(G, p.x, p.y, R, 'enemy', GB, 0.6);
      for (let i = 0; i < n; i++) {
        const m = GB[i];
        const dx = m.x - p.x, dy = m.y - p.y, d = hypot(dx, dy) || 1;
        dealDamage(m, 30 + 4 * (p.level || 1), { source: 'playerSkill', skill: 'body_armor', element: 'earth', knock: 280, kx: dx / d, ky: dy / d });
      }
      F.ring(p.x, p.y, { radius: R, color: '#a1887f', life: 0.4, width: 8, fill: true, alpha: 0.5 });
    }
    return 0;
  }

  /* ===================================================== active skills */
  function strikeBolt(G, lv, dmg, chainN, R) {
    const pl = G.player;
    if (!pl) return;
    let x, y, target = null;
    if (collectView(G)) {
      target = viewM[floor(random() * viewN)];
      x = target.x; y = target.y;
    } else {
      const a = random() * TAU, d = rnd(80, 260);
      x = pl.x + cos(a) * d; y = pl.y + sin(a) * d;
    }
    const F = fx();
    const sx = x + rnd(-90, 90), sy = y - 600;
    F.lightning(sx, sy, x, y, { color: '#12001f', width: 10, life: 0.38, branches: 3 });
    F.lightning(sx, sy, x, y, { color: '#d1b3ff', width: 3.5, life: 0.3, branches: 2 });
    F.ring(x, y, { radius: R, color: '#b388ff', life: 0.35, width: 5 });
    F.ring(x, y, { radius: R * 0.55, color: '#ffffff', life: 0.18, width: 3 });
    F.burst(x, y, { count: 12, colors: ['#ffffff', '#d1b3ff', '#7c4dff', '#311b92'], speed: [120, 340], life: [0.15, 0.4], size: [1.5, 3], shape: 'spark' });
    F.burst(x, y, { count: 4, color: '#1a0033', speed: [20, 60], life: [0.5, 0.9], size: [10, 18], shape: 'smoke' });
    F.flash('#b388ff', 0.12, 0.08);
    shake(5, 0.2);
    sfx('thunder', { vol: 0.6, pitch: rnd(0.85, 1.15) });
    const n = gather(G, x, y, R, 'enemy', GB, 0.6);
    for (let i = 0; i < n; i++) {
      const m = GB[i];
      const dx = m.x - x, dy = m.y - y, d = hypot(dx, dy) || 1;
      dealDamage(m, dmg, { source: 'playerSkill', skill: 'black_lightning', element: 'storm', knock: 160, kx: dx / d, ky: dy / d });
      applyStatus(m, 'stun', 0.5, 1);
    }
    // chain through nearby foes
    const k = nearestK(G, x, y, 200 * areaOf(pl), chainN + 1);
    if (!k) return;
    const chain = candM.slice(0, k);
    let px = x, py = y, c = 0;
    for (let i = 0; i < chain.length && c < chainN; i++) {
      const m = chain[i];
      if (m === target) continue;
      const fromX = px, fromY = py;
      later(0.05 * (c + 1), () => {
        if (!alive(m)) return;
        F.lightning(fromX, fromY, m.x, m.y, { color: '#7c4dff', width: 3, life: 0.25, branches: 1 });
        F.lightning(fromX, fromY, m.x, m.y, { color: '#ffffff', width: 1.2, life: 0.18, branches: 0 });
        dealDamage(m, dmg * 0.55, { source: 'playerSkill', skill: 'black_lightning', element: 'storm', knock: 60, kx: 0, ky: 0 });
        applyStatus(m, 'stun', 0.3, 1);
        F.burst(m.x, m.y, { count: 5, colors: ['#ffffff', '#b388ff'], speed: [80, 200], life: [0.1, 0.25], size: [1.2, 2.2], shape: 'spark' });
      });
      px = m.x; py = m.y;
      c++;
    }
  }

  const CAST = {
    black_lightning(G, p, lv) {
      const strikes = 6 + 2 * lv + amountOf(p);
      const dmg = 55 + 32 * lv, chainN = 2 + lv, R = 70 * areaOf(p);
      const F = fx();
      F.flash('#4a148c', 0.4, 0.3);
      F.vignette('#12001f', 0.55, 1.6);
      F.ring(p.x, p.y, { radius: 180, color: '#7c4dff', life: 0.5, width: 6 });
      F.converge(p.x, p.y, { radius: 110, count: 14, color: '#b388ff', life: 0.35, size: 2.5 });
      shake(9, 0.5);
      sfx('thunder', { vol: 0.9, pitch: 0.75 });
      if (SK.Audio && SK.Audio.duck) SK.Audio.duck(0.5, 1.2);
      pokeBody(p, -PI / 2, 1.2);
      for (let i = 0; i < strikes; i++) later(0.12 + i * 0.1, () => strikeBolt(G, lv, dmg, chainN, R));
      return true;
    },

    wolf_howl(G, p, lv) {
      const n = min(8, 3 + floor(lv / 2) + amountOf(p));
      const life = 10 + lv;
      const F = fx();
      F.ring(p.x, p.y, { radius: 240, color: '#82b1ff', life: 0.8, width: 6 });
      F.ring(p.x, p.y, { radius: 140, color: '#e3f2fd', life: 0.5, width: 3, delay: 0.1 });
      F.burst(p.x, p.y, { count: 24, colors: ['#e3f2fd', '#82b1ff', '#2962ff'], speed: [80, 260], life: [0.4, 0.9], size: [2, 4], glow: true });
      F.flash('#82b1ff', 0.18, 0.25);
      shake(5, 0.4);
      sfx('howl', { vol: 0.9 });
      pokeBody(p, -PI / 2, 1);
      for (let i = 0; i < n; i++) later(0.08 + i * 0.07, () => { if (!p.dead) spawnWolf(G, p, i, n, lv, life); });
      return true;
    },

    gluttony(G, p, lv) {
      const a = areaOf(p);
      let x = p.x + cos(p.facing || 0) * 110, y = p.y + sin(p.facing || 0) * 110;
      const m = nearest(G, p.x, p.y, 320);
      if (m) {
        const d = hypot(m.x - p.x, m.y - p.y) || 1, dd = clamp(d, 90, 220);
        x = p.x + (m.x - p.x) / d * dd; y = p.y + (m.y - p.y) / d * dd;
      }
      const R = (140 + 15 * lv) * a;
      spawnZone({
        x, y, r: R, life: 4 + 0.5 * lv, kind: 'vortex', team: 'player', pull: 240 + 35 * lv, dps: 26 + 16 * lv,
        tickRate: 0.2, devour: true, heal: 2 + lv, color: '#aa00ff', skill: 'gluttony', knock: 0,
      });
      const F = fx();
      F.flash('#2a0040', 0.35, 0.3);
      F.ring(x, y, { radius: R * 1.3, color: '#e040fb', life: 0.5, width: 7 });
      F.converge(x, y, { radius: R * 1.4, count: 20, color: '#ea80fc', life: 0.5, size: 3 });
      shake(7, 0.45);
      sfx('gluttony', { vol: 0.9 });
      if (SK.Audio && SK.Audio.duck) SK.Audio.duck(0.4, 1.5);
      pokeBody(p, atan2(y - p.y, x - p.x), 1.2);
      return true;
    },
  };

  function cast(G, player, slotIndex) {
    G = G || SK.G;
    const p = player || (G && G.player);
    if (!p || p.dead || !G) return false;
    const id = p.slots && p.slots[slotIndex];
    if (!id) return false;
    const def = DEFS[id];
    if (!def || def.kind !== 'active' || !CAST[id]) return false;
    const lv = clamp(lvl(p, id) || 1, 1, 5);
    if (!p.cooldowns) p.cooldowns = {};
    if (!p.skillState) p.skillState = {};
    if ((p.cooldowns[id] || 0) > 0) { sfx('uiBack', { vol: 0.35 }); return false; }
    const cost = def.mpCost || 0;
    if ((p.mp || 0) < cost) {
      sfx('uiBack');
      fx().text(p.x, p.y - (p.r || 22) - 18, 'MP!', { color: '#4fc3ff', size: 18, life: 0.7 });
      return false;
    }
    p.mp -= cost;
    try { CAST[id](G, p, lv); } catch (e) { console.error(e); }
    p.cooldowns[id] = def.cooldown(lv, p);
    if (SK.events) SK.events.emit('skillCast', { id, level: lv });
    return true;
  }

  /* ============================================================ update */
  let curG = null;
  function clear() {
    waves.length = 0; falls.length = 0; summons.length = 0; arcs.length = 0; sched.length = 0;
    pSlowT = 0; pSlowAmt = 0;
    const G = SK.G;
    if (G) {
      if (G.projectiles) { for (const p of G.projectiles) releaseProj(p); G.projectiles.length = 0; }
      if (G.zones) { for (const z of G.zones) releaseZone(z); G.zones.length = 0; }
    }
  }
  function ensureRun(G) {
    if (G !== curG) {
      curG = G;
      waves.length = 0; falls.length = 0; summons.length = 0; arcs.length = 0; sched.length = 0;
      pSlowT = 0; pSlowAmt = 0;
    }
    if (!G.projectiles) G.projectiles = [];
    if (!G.zones) G.zones = [];
  }

  let lastPlayer = null;
  function update(G, dt) {
    G = G || SK.G;
    if (!G) return;
    ensureRun(G);
    if (!(dt > 0)) dt = 0;
    clock += dt;
    updateSched(dt);
    const p = G.player;
    if (p !== lastPlayer) {
      lastPlayer = p;
      waves.length = 0; falls.length = 0; summons.length = 0; arcs.length = 0; sched.length = 0;
    }
    if (p && !p.dead) {
      if (!p.cooldowns) p.cooldowns = {};
      if (!p.skillState) p.skillState = {};
      if (!p.skills) p.skills = {};
      const cds = p.cooldowns, sk = p.skills;
      for (let i = 0; i < ACTIVE_IDS.length; i++) {
        const id = ACTIVE_IDS[i];
        if (cds[id] > 0) cds[id] = max(0, cds[id] - dt);
      }
      updatePassives(G, p, dt);
      if (dt > 0) {
        for (let i = 0; i < AUTO_IDS.length; i++) {
          const id = AUTO_IDS[i];
          const lv = sk[id] | 0;
          if (lv <= 0) continue;
          const c = cds[id] || 0;
          if (c > 0) { cds[id] = c - dt; continue; }
          let r = false;
          try { r = AUTO[id](G, p, min(lv, 5), dt); } catch (e) { console.error(e); r = false; }
          if (r === 'cont') cds[id] = 0;
          else if (r) cds[id] = DEFS[id].cooldown(lv, p);
          else cds[id] = 0.2;
        }
        updateChannels(G, p, dt);
      }
    }
    updatePlayerSlow(p, dt);
    if (dt > 0) {
      updateProjectiles(G, dt);
      updateZones(G, dt);
      updateWaves(G, dt);
      updateFalls(G, dt);
      updateSummons(G, p, dt);
      updateArcs(dt);
    }
  }

  function cooldownRatio(player, id) {
    const def = DEFS[id];
    if (!def || !player) return 1;
    const lv = clamp(lvl(player, id) || 1, 1, 5);
    if (id === 'body_armor') {
      const s = player.skillState && player.skillState.body_armor;
      if (!s || s.shield) return 1;
      return clamp(1 - s.t / (s.rt || def.cooldown(lv, player)), 0, 1);
    }
    const rem = (player.cooldowns && player.cooldowns[id]) || 0;
    if (rem <= 0) return 1;
    const full = def.cooldown(lv, player);
    if (!(full > 0)) return 1;
    return clamp(1 - rem / full, 0, 1);
  }

  function ownedOf(player, kind) {
    const out = [];
    if (!player || !player.skills) return out;
    for (const id in player.skills) {
      const d = DEFS[id];
      if (d && d.kind === kind && player.skills[id] > 0) out.push(id);
    }
    return out;
  }

  /* ========================================================= rendering */
  function crescentPath(ctx, R, span, inner) {
    // outer arc around +x, inner arc from a circle shifted toward -x (tips meet)
    const cx = -R * inner;
    const tx = R * cos(span), ty = R * sin(span);
    const ri = hypot(tx - cx, ty);
    const ai = atan2(ty, tx - cx);
    ctx.beginPath();
    ctx.arc(0, 0, R, -span, span, false);
    ctx.arc(cx, 0, ri, ai, -ai, true);
    ctx.closePath();
  }

  function projAlpha(p) { return min(1, p.t / 0.06) * min(1, p.life / 0.12); }

  function renderProjectiles(ctx, G) {
    const list = G.projectiles;
    if (!list || !list.length) return;
    const q = qual();
    // pass 1 — additive glows and light trails
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.vis = !p.dead && camIn(p.x, p.y, p.r * 4 + 30);
      if (!p.vis) continue;
      const a = projAlpha(p);
      switch (p.kind) {
        case 'water': {
          glowAt(ctx, p.x, p.y, p.r * 2.6, '#29b6f6', 0.5 * a);
          if (q > 0) trailGlows(ctx, p, '#4fc3ff', p.r * 0.7, 0.35 * a, 2);
          break;
        }
        case 'needle': {
          const sp = hypot(p.vx, p.vy) || 1, L = min(34, sp * 0.035);
          ctx.globalAlpha = 0.35 * a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x - p.vx / sp * L, p.y - p.vy / sp * L); ctx.lineTo(p.x, p.y); ctx.stroke();
          glowAt(ctx, p.x, p.y, 9, p.color, 0.5 * a);
          break;
        }
        case 'web': glowAt(ctx, p.x, p.y, p.r * 2.2, '#b39ddb', 0.35 * a); break;
        case 'fire': {
          glowAt(ctx, p.x, p.y, p.r * 3.2, '#ff6d00', 0.6 * a);
          if (q > 0) trailGlows(ctx, p, '#ff3d00', p.r * 1.1, 0.4 * a, 2);
          break;
        }
        case 'magma': {
          glowAt(ctx, p.x, p.y, p.r * 3.4, '#ff3d00', 0.55 * a);
          if (q > 0) trailGlows(ctx, p, '#ff6d00', p.r * 0.9, 0.35 * a, 2);
          break;
        }
        case 'spirit': {
          trailGlows(ctx, p, p.color, p.r * 1.1, 0.55 * a, 1);
          glowAt(ctx, p.x, p.y, p.r * 3, '#18ffff', 0.45 * a);
          break;
        }
        case 'dark': case 'shadow': glowAt(ctx, p.x, p.y, p.r * 3, p.kind === 'dark' ? '#aa00ff' : '#7c4dff', 0.5 * a); break;
        case 'bolt': glowAt(ctx, p.x, p.y, p.r * 3, p.color, 0.5 * a); break;
        case 'rock': break;
        case 'arrow': glowAt(ctx, p.x, p.y, p.r * 2, p.color, 0.3 * a); break;
        default: glowAt(ctx, p.x, p.y, p.r * 2.8, p.color, 0.55 * a); break;
      }
    }
    // pass 2 — solid bodies
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.vis) continue;
      ctx.globalAlpha = projAlpha(p);
      drawProjBody(ctx, p);
    }
    // pass 3 — hot cores
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.vis) continue;
      const a = projAlpha(p);
      switch (p.kind) {
        case 'fire': case 'magma': glowAt(ctx, p.x, p.y, p.r * 1.2, '#ffe082', 0.8 * a); break;
        case 'spirit': glowAt(ctx, p.x, p.y, p.r * 1.1, '#ffffff', 0.7 * a); break;
        case 'bolt': case 'orb': glowAt(ctx, p.x, p.y, p.r * 1.1, '#ffffff', 0.6 * a); break;
        case 'dark': glowAt(ctx, p.x, p.y, p.r * 1.4, '#e040fb', 0.35 * a); break;
        default: break;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function trailGlows(ctx, p, color, size, alpha, step) {
    const n = p.tn, tr = p.trail;
    for (let j = 1; j <= n; j += step) {
      const idx = ((p.th - j + 10) % 10) * 2;
      const k = 1 - j / (n + 1);
      glowAt(ctx, tr[idx], tr[idx + 1], size * (0.4 + 0.6 * k), color, alpha * k);
    }
  }

  function drawProjBody(ctx, p) {
    const x = p.x, y = p.y, r = p.r;
    switch (p.kind) {
      case 'water': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        crescentPath(ctx, r * 1.3, 2.1, 0.32);
        ctx.fillStyle = '#29b6f6'; ctx.fill();
        crescentPath(ctx, r * 1.12, 1.7, 0.18);
        ctx.fillStyle = '#b3e5fc'; ctx.fill();
        ctx.restore();
        break;
      }
      case 'needle': {
        const sp = hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, L = min(22, sp * 0.022);
        ctx.strokeStyle = '#fffde7'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - ux * L, y - uy * L); ctx.lineTo(x + ux * 3, y + uy * 3); ctx.stroke();
        break;
      }
      case 'web': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.strokeStyle = 'rgba(243,229,245,0.9)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.moveTo(0, 0); ctx.lineTo(cos(a) * r * 1.3, sin(a) * r * 1.3); }
        for (let ring = 1; ring <= 2; ring++) {
          const rr = r * 0.55 * ring;
          for (let i = 0; i <= 6; i++) { const a = i * TAU / 6; if (i === 0) ctx.moveTo(cos(a) * rr, sin(a) * rr); else ctx.lineTo(cos(a) * rr, sin(a) * rr); }
        }
        ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'fire': {
        const a = atan2(p.vy, p.vx), w = 1 + 0.15 * sin(p.t * 40 + p.seed);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = '#ff6d00';
        ctx.beginPath(); ctx.arc(0, 0, r, -PI / 2, PI / 2, false); ctx.quadraticCurveTo(-r * 1.4, r * 0.5, -r * 2.4 * w, 0); ctx.quadraticCurveTo(-r * 1.4, -r * 0.5, 0, -r); ctx.fill();
        ctx.fillStyle = '#ffd54f';
        ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.6, -PI / 2, PI / 2, false); ctx.quadraticCurveTo(-r * 0.7, r * 0.3, -r * 1.4 * w, 0); ctx.quadraticCurveTo(-r * 0.7, -r * 0.3, r * 0.15, -r * 0.6); ctx.fill();
        ctx.restore();
        break;
      }
      case 'magma': {
        ctx.fillStyle = '#4e1c0a';
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot + p.t * 2);
        ctx.strokeStyle = '#ffab40'; ctx.lineWidth = max(1, r * 0.16); ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + h1(p.seed + i); ctx.moveTo(cos(a) * r * 0.15, sin(a) * r * 0.15); ctx.lineTo(cos(a + 0.4) * r * 0.55, sin(a + 0.4) * r * 0.55); ctx.lineTo(cos(a + 0.1) * r * 0.9, sin(a + 0.1) * r * 0.9); }
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'spirit': {
        const a = atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = 'rgba(224,247,250,0.92)';
        ctx.beginPath(); ctx.arc(0, 0, r * 0.7, -PI / 2, PI / 2, false);
        ctx.quadraticCurveTo(-r * 1.1, r * 0.6 + sin(p.t * 18) * r * 0.25, -r * 1.9, sin(p.t * 12) * r * 0.3);
        ctx.quadraticCurveTo(-r * 1.1, -r * 0.6, 0, -r * 0.7); ctx.fill();
        if (r >= 7) {
          ctx.fillStyle = '#004d40';
          ctx.beginPath(); ctx.arc(r * 0.25, -r * 0.25, r * 0.12, 0, TAU); ctx.arc(r * 0.25, r * 0.25, r * 0.12, 0, TAU); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'dark': case 'shadow': {
        const n = p.tn, tr = p.trail;
        ctx.fillStyle = p.kind === 'dark' ? '#1a0026' : '#120024';
        for (let j = 2; j <= n; j += 2) {
          const idx = ((p.th - j + 10) % 10) * 2, k = 1 - j / (n + 1);
          ctx.globalAlpha = 0.45 * k * projAlpha(p);
          ctx.beginPath(); ctx.arc(tr[idx], tr[idx + 1], r * (0.4 + 0.5 * k), 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = projAlpha(p);
        ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, TAU); ctx.fill();
        ctx.strokeStyle = p.kind === 'dark' ? '#e040fb' : '#b388ff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, r * 0.85 + sin(p.t * 20) * 0.8, 0, TAU); ctx.stroke();
        break;
      }
      case 'rock': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot + p.t * 6);
        ctx.fillStyle = '#6d4c41'; ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * TAU / 7, rr = r * (0.78 + 0.32 * h1(p.seed + i)); if (i === 0) ctx.moveTo(cos(a) * rr, sin(a) * rr); else ctx.lineTo(cos(a) * rr, sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.3, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'bolt': {
        const sp = hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, L = r * 2.6;
        ctx.strokeStyle = p.color; ctx.lineWidth = 3.2; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(x - ux * L, y - uy * L);
        for (let i = 1; i <= 3; i++) { const k = i / 3, j = (random() - 0.5) * r * 1.1; ctx.lineTo(x - ux * L * (1 - k) - uy * j, y - uy * L * (1 - k) + ux * j); }
        ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke();
        break;
      }
      case 'arrow': {
        const a = atan2(p.vy, p.vx);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.strokeStyle = '#efebe9'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 2.2, 0); ctx.lineTo(r * 0.6, 0); ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(r * 0.4, -r * 0.55); ctx.lineTo(r * 0.4, r * 0.55); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-r * 2.2, 0); ctx.lineTo(-r * 2.7, -r * 0.5); ctx.lineTo(-r * 1.7, 0); ctx.lineTo(-r * 2.7, r * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
        break;
      }
      default: {
        ctx.fillStyle = U.mix(p.color, '#ffffff', 0.45);
        ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, TAU); ctx.fill();
        ctx.strokeStyle = p.color; ctx.lineWidth = 1.5; ctx.stroke();
        break;
      }
    }
  }

  /* -------------------------------------------------------------- zones */
  const DASH = [10, 8], NODASH = [];
  function renderZones(ctx, G) {
    const list = G && G.zones;
    if (!list || !list.length) return;
    const q = qual();
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      if (z.dead || !camIn(z.x, z.y, z.r * 1.4 + 20)) continue;
      const fadeIn = min(1, z.t / 0.25), fadeOut = min(1, z.life / 0.5);
      const a = fadeIn * fadeOut;
      ctx.save();
      switch (z.kind) {
        case 'warning': drawWarning(ctx, z); break;
        case 'web': drawWebZone(ctx, z, a, q); break;
        case 'mist': drawMist(ctx, z, a, q); break;
        case 'fire': drawFireZone(ctx, z, a, q); break;
        case 'crater': drawCrater(ctx, z, a, q); break;
        case 'shadow': drawShadowZone(ctx, z, a, q); break;
        case 'vortex': drawVortexZone(ctx, z, q); break;
        default:
          softAt(ctx, z.x, z.y, z.r * 1.1, z.color, 0.45 * a);
          ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = z.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
          break;
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawWarning(ctx, z) {
    const k = clamp(z.t / z.maxLife, 0, 1);
    const pulse = 0.5 + 0.5 * sin(z.t * (9 + 22 * k));
    const col = z.color, x = z.x, y = z.y, r = z.r * (0.9 + 0.1 * outBack(min(1, z.t / 0.18)));
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.07 + 0.05 * pulse;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.14 + 0.2 * k;
    ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.fill();
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.5 + 0.4 * pulse;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.6 + 0.4 * k;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, max(1, r * k), 0, TAU); ctx.stroke();
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = -z.t * 40;
    ctx.globalAlpha = 0.35 + 0.3 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 7, 0, TAU); ctx.stroke();
    ctx.setLineDash(NODASH);
    // inward chevrons
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2 + PI / 4, d = r + 16 - 6 * pulse;
      const cx = x + cos(a) * d, cy = y + sin(a) * d;
      ctx.moveTo(cx + cos(a + 2.4) * 8, cy + sin(a + 2.4) * 8);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + cos(a - 2.4) * 8, cy + sin(a - 2.4) * 8);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * (0.5 + 0.6 * k), col, (0.15 + 0.35 * k) * (0.6 + 0.4 * pulse));
  }

  function drawWebZone(ctx, z, a, q) {
    const s = outBack(min(1, z.t / 0.3));
    const r = z.r * s, x = z.x, y = z.y, n = 10, seed = z.seed;
    ctx.globalAlpha = 0.07 * a;
    ctx.fillStyle = '#d1c4e9';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.62 * a;
    ctx.strokeStyle = '#ede7f6';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = i * TAU / n + (h1(seed + i) - 0.5) * 0.3;
      const rr = r * (0.88 + 0.12 * h1(seed + i * 3));
      ctx.moveTo(x, y); ctx.lineTo(x + cos(ang) * rr, y + sin(ang) * rr);
    }
    for (let ring = 1; ring <= 4; ring++) {
      const rr = r * ring / 4.4;
      for (let i = 0; i <= n; i++) {
        const ii = i % n;
        const ang = ii * TAU / n + (h1(seed + ii) - 0.5) * 0.3;
        const px = x + cos(ang) * rr, py = y + sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else {
          const pa = (ii - 0.5) * TAU / n + (h1(seed + ii) - 0.5) * 0.15 - (i === n ? 0 : 0);
          const sag = rr * 0.86;
          ctx.quadraticCurveTo(x + cos(pa) * sag, y + sin(pa) * sag, px, py);
        }
      }
    }
    ctx.stroke();
    if (q > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const ang = (i * 3 + 1) * TAU / n + (h1(seed + i * 3 + 1) - 0.5) * 0.3;
        const k = (z.t * 0.6 + i * 0.33) % 1;
        glowAt(ctx, x + cos(ang) * r * k, y + sin(ang) * r * k, 7, '#ffffff', 0.5 * a * sin(k * PI));
      }
    }
  }

  function drawMist(ctx, z, a, q) {
    const grow = outBack(min(1, z.t / 0.4));
    const x = z.x, y = z.y, r = z.r * grow, t = z.t, seed = z.seed;
    const dark = '#33691e';
    softAt(ctx, x, y, r * 1.15, dark, 0.35 * a);
    const n = q === 2 ? 7 : q === 1 ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const ang = h1(seed + i) * TAU + t * 0.3 * (i % 2 ? 1 : -1);
      const d = r * 0.42 * h1(seed + i * 7);
      const pr = r * (0.52 + 0.14 * sin(t * 1.7 + i * 1.3));
      softAt(ctx, x + cos(ang) * d, y + sin(ang) * d * 0.85, pr, i % 3 === 0 ? '#c6ff00' : z.color, 0.26 * a);
    }
    // bubbles rising and popping
    ctx.strokeStyle = '#ccff90';
    ctx.lineWidth = 1.2;
    const bn = q === 0 ? 3 : 6;
    for (let i = 0; i < bn; i++) {
      const ph = (t * 0.75 + h1(seed + i * 13)) % 1;
      const bx = x + (h1(seed + i * 5) - 0.5) * r * 1.2, by = y + (h1(seed + i * 11) - 0.5) * r * 0.9 - ph * 16;
      const br = 1.5 + 4 * ph;
      ctx.globalAlpha = a * (ph < 0.85 ? 0.7 : (1 - ph) / 0.15 * 0.7);
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 0.9, '#76ff03', 0.12 * a);
  }

  function drawFireZone(ctx, z, a, q) {
    const x = z.x, y = z.y, r = z.r * outBack(min(1, z.t / 0.25)), t = z.t, seed = z.seed;
    softAt(ctx, x, y, r * 1.1, '#1a0700', 0.55 * a);
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 1.2, '#ff3d00', (0.35 + 0.1 * sin(t * 13)) * a);
    const n = q === 2 ? 9 : q === 1 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const ang = h1(seed + i) * TAU, d = r * 0.75 * sqrt(h1(seed + i * 3));
      const fx0 = x + cos(ang) * d, fy0 = y + sin(ang) * d * 0.8;
      const hgt = (10 + 12 * h1(seed + i * 7)) * (0.75 + 0.35 * sin(t * (9 + i) + i)) * (r / 50);
      const w = hgt * 0.38;
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = '#ff6d00';
      ctx.beginPath(); ctx.moveTo(fx0 - w, fy0); ctx.quadraticCurveTo(fx0 - w * 0.6, fy0 - hgt * 0.6, fx0 + sin(t * 7 + i) * w * 0.5, fy0 - hgt);
      ctx.quadraticCurveTo(fx0 + w * 0.6, fy0 - hgt * 0.6, fx0 + w, fy0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath(); ctx.moveTo(fx0 - w * 0.45, fy0); ctx.quadraticCurveTo(fx0, fy0 - hgt * 0.75, fx0 + w * 0.45, fy0); ctx.closePath(); ctx.fill();
    }
  }

  function drawCrater(ctx, z, a, q) {
    const x = z.x, y = z.y, r = z.r, seed = z.seed, heat = min(1, z.life / z.maxLife * 1.4);
    softAt(ctx, x, y, r * 1.25, '#0d0400', 0.8 * a);
    ctx.globalAlpha = 0.55 * a;
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 0.9, '#ff3d00', 0.5 * heat * a);
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = (0.5 + 0.3 * sin(z.t * 6)) * heat * a;
    ctx.beginPath();
    const n = q === 0 ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const ang = i * TAU / n + h1(seed + i) * 0.6;
      ctx.moveTo(x + cos(ang) * r * 0.12, y + sin(ang) * r * 0.12);
      let px = 0, py = 0;
      for (let j = 1; j <= 3; j++) {
        const dd = r * (0.12 + 0.24 * j), ja = ang + (h1(seed + i * 7 + j) - 0.5) * 0.5;
        px = x + cos(ja) * dd; py = y + sin(ja) * dd;
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
    glowAt(ctx, x, y, r * 0.35, '#ffd180', 0.6 * heat * a);
  }

  function drawShadowZone(ctx, z, a, q) {
    const x = z.x, y = z.y, r = z.r * (0.6 + 0.4 * outCubic(min(1, z.t / 0.2))), t = z.t;
    softAt(ctx, x, y, r * 1.35, '#0a0014', 0.85 * a);
    ctx.globalAlpha = 0.4 * a;
    ctx.strokeStyle = '#7c4dff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const ang = i * TAU / 20, rr = r * (0.92 + 0.08 * sin(ang * 5 + t * 6));
      if (i === 0) ctx.moveTo(x + cos(ang) * rr, y + sin(ang) * rr); else ctx.lineTo(x + cos(ang) * rr, y + sin(ang) * rr);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 1.1, '#651fff', 0.22 * a);
    if (q > 0) {
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.9 + i * 0.5) % 1;
        glowAt(ctx, x + (h1(z.seed + i) - 0.5) * r, y - ph * 18, 5, '#b388ff', 0.6 * a * sin(ph * PI));
      }
    }
  }

  function drawVortexZone(ctx, z, q) {
    const intro = outBack(min(1, z.t / 0.45)), outro = min(1, z.life / 0.45);
    const s = intro * (0.2 + 0.8 * outro);
    const x = z.x, y = z.y, r = z.r * s, t = z.t;
    if (r < 2) return;
    softAt(ctx, x, y, r * 1.3, '#05000a', 0.9);
    // spiral arms
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 1.25, '#6a1b9a', 0.4);
    const arms = q === 0 ? 3 : 5, segs = q === 0 ? 10 : 16, rot = t * 3.2;
    ctx.lineCap = 'round';
    for (let k = 0; k < arms; k++) {
      const base = k * TAU / arms + rot;
      ctx.strokeStyle = k % 2 ? '#e040fb' : '#7c4dff';
      ctx.beginPath();
      for (let j = 0; j <= segs; j++) {
        const f = j / segs;
        const rr = r * (1 - f * 0.88);
        const ang = base + f * 3.4;
        const px = x + cos(ang) * rr, py = y + sin(ang) * rr;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = max(1.5, r * 0.035);
      ctx.stroke();
    }
    // rim
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = '#ea80fc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) {
      const ang = i * TAU / 36, rr = r * (1 + 0.035 * sin(ang * 6 - t * 9));
      if (i === 0) ctx.moveTo(x + cos(ang) * rr, y + sin(ang) * rr); else ctx.lineTo(x + cos(ang) * rr, y + sin(ang) * rr);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const S = SK.Slime;
    if (S && S.drawVortex) { try { S.drawVortex(ctx, x, y, r * 0.42, SK.time ? SK.time.t : t); } catch (e) { /* optional */ } }
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(x, y, r * 0.14, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glowAt(ctx, x, y, r * 0.3, '#e040fb', 0.35 + 0.15 * sin(t * 10));
  }

  /* ------------------------------------------- render above entities */
  function render(ctx, G) {
    G = G || SK.G;
    if (!G) return;
    const p = G.player;
    ctx.save();
    if (p && !p.dead && p.skillState) {
      const ss = p.skillState;
      if (lvl(p, 'thorn_ring') > 0 && ss.thorn_ring) drawThorns(ctx, p, ss.thorn_ring);
      if (lvl(p, 'magma_orb') > 0 && ss.magma_orb) drawMagmaOrbs(ctx, p, ss.magma_orb);
      if (ss.fire_breath && ss.fire_breath.t > 0) drawBreath(ctx, p, ss.fire_breath);
      if (lvl(p, 'body_armor') > 0 && ss.body_armor) drawShield(ctx, p, ss.body_armor);
    }
    drawWaves(ctx);
    drawArcs(ctx);
    drawSummons(ctx);
    renderProjectiles(ctx, G);
    drawFalls(ctx);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawThorns(ctx, p, s) {
    const n = s.n, R = s.R, sz = s.size;
    if (!n || !(R > 0)) return;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#66bb6a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = s.ang + TAU * i / n;
      glowAt(ctx, p.x + cos(a) * R, p.y + sin(a) * R, 22 * sz, '#76ff03', 0.22);
    }
    ctx.globalCompositeOperation = 'source-over';
    const segA = 0.42;
    for (let i = 0; i < n; i++) {
      const a = s.ang + TAU * i / n;
      // vine body (trailing arc behind the head)
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1b5e20';
      ctx.lineWidth = 7 * sz;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, a - segA, a, false); ctx.stroke();
      ctx.strokeStyle = '#66bb6a';
      ctx.lineWidth = 3 * sz;
      ctx.beginPath(); ctx.arc(p.x, p.y, R + sin(clock * 9 + i) * 1.5, a - segA * 0.92, a, false); ctx.stroke();
      // thorns
      ctx.fillStyle = '#dcedc8';
      ctx.beginPath();
      for (let j = 0; j < 5; j++) {
        const ta = a - segA * (j + 0.5) / 5, out = j % 2 ? -1 : 1;
        const bx = p.x + cos(ta) * R, by = p.y + sin(ta) * R;
        const nx = cos(ta) * out, ny = sin(ta) * out;
        const tx = -sin(ta), ty = cos(ta);
        ctx.moveTo(bx + tx * 3 * sz + nx * 2 * sz, by + ty * 3 * sz + ny * 2 * sz);
        ctx.lineTo(bx + nx * 9 * sz, by + ny * 9 * sz);
        ctx.lineTo(bx - tx * 3 * sz + nx * 2 * sz, by - ty * 3 * sz + ny * 2 * sz);
      }
      ctx.fill();
      // leaf at the head
      const hx = p.x + cos(a) * R, hy = p.y + sin(a) * R;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(a + PI / 2 + sin(clock * 6 + i) * 0.3);
      ctx.fillStyle = '#9ccc65';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6 * sz, -6 * sz, 0, -14 * sz); ctx.quadraticCurveTo(-6 * sz, -6 * sz, 0, 0); ctx.fill();
      ctx.strokeStyle = '#33691e'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -12 * sz); ctx.stroke();
      ctx.restore();
    }
  }

  function drawMagmaOrbs(ctx, p, s) {
    const n = s.n, R = s.R, r = s.size;
    if (!n || !(R > 0)) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = '#ff6d00';
    ctx.lineWidth = 2;
    ctx.setLineDash(DASH);
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
    ctx.setLineDash(NODASH);
    for (let i = 0; i < n; i++) {
      const x = s.pos[i * 2], y = s.pos[i * 2 + 1];
      // comet tail along the orbit
      for (let j = 1; j <= 4; j++) {
        const ta = s.ang + TAU * i / n + 0.07 * j;
        glowAt(ctx, p.x + cos(ta) * R, p.y + sin(ta) * R, r * (2.2 - j * 0.35), '#ff3d00', 0.35 - j * 0.07);
      }
      glowAt(ctx, x, y, r * 3.4, '#ff6d00', 0.55 + 0.1 * sin(clock * 11 + i));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const x = s.pos[i * 2], y = s.pos[i * 2 + 1];
      ctx.fillStyle = '#3b1206';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff9100';
      ctx.lineWidth = max(1, r * 0.17);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const rot = clock * 2.5 + i;
      for (let k = 0; k < 4; k++) {
        const a = rot + k * TAU / 4 + h1(i * 4 + k) * 0.8;
        ctx.moveTo(x + cos(a) * r * 0.1, y + sin(a) * r * 0.1);
        ctx.lineTo(x + cos(a + 0.5) * r * 0.55, y + sin(a + 0.5) * r * 0.55);
        ctx.lineTo(x + cos(a + 0.2) * r * 0.92, y + sin(a + 0.2) * r * 0.92);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) glowAt(ctx, s.pos[i * 2], s.pos[i * 2 + 1], r * 1.3, '#ffe082', 0.65);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBreath(ctx, p, fb) {
    const k = fb.t / fb.dur;
    const env = min(1, (1 - k) / 0.15) * min(1, k / 0.2);
    const ox = p.x + cos(fb.ang) * (p.r || 22) * 0.8, oy = p.y + sin(fb.ang) * (p.r || 22) * 0.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 * env;
    ctx.fillStyle = '#ff6d00';
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, fb.range, fb.ang - fb.half, fb.ang + fb.half); ctx.closePath(); ctx.fill();
    for (let i = 1; i <= 4; i++) {
      const d = fb.range * i / 4.6, w = 0.5 + 0.12 * sin(clock * 30 + i * 2);
      glowAt(ctx, ox + cos(fb.ang) * d, oy + sin(fb.ang) * d, 18 + d * fb.half * w, i < 2 ? '#ffd180' : '#ff6d00', 0.45 * env);
    }
    glowAt(ctx, ox, oy, 20, '#fff59d', 0.8 * env);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawShield(ctx, p, s) {
    const R = (p.r || 22) * 1.6;
    if (s.shield) {
      const pulse = 0.5 + 0.5 * sin(clock * 3);
      ctx.globalCompositeOperation = 'lighter';
      glowAt(ctx, p.x, p.y, R * 1.5, '#ffab40', 0.12 + 0.08 * pulse + 0.4 * s.flash);
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6; i++) {
        const a = s.rot + i * TAU / 6;
        const px = p.x + cos(a) * R, py = p.y + sin(a) * R * 0.92;
        ctx.globalAlpha = 0.5 + 0.2 * pulse + 0.3 * s.flash;
        ctx.fillStyle = 'rgba(176,132,84,0.55)';
        ctx.strokeStyle = '#ffe0b2';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ha = a + k * TAU / 6;
          const hx = px + cos(ha) * 7.5, hy = py + sin(ha) * 7.5;
          if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 0.18 + 0.12 * pulse;
      ctx.strokeStyle = '#ffcc80';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.stroke();
    } else if (s.breakT > 0) {
      const k = s.breakT / 0.5;
      ctx.globalAlpha = k * 0.7;
      ctx.strokeStyle = '#ffe0b2';
      ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * (1 + (1 - k) * 0.8), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawWaves(ctx) {
    if (!waves.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      if (w.t < 0 || w.r < 2) continue;
      const k = clamp(w.t / (w.life + 0.22), 0, 1);
      const a = Math.pow(1 - k, 1.2);
      // outer distorted ring
      ctx.strokeStyle = w.color;
      ctx.globalAlpha = 0.55 * a;
      ctx.lineWidth = 2 + 7 * (1 - k);
      ctx.beginPath();
      const seg = 40;
      for (let j = 0; j <= seg; j++) {
        const ang = j * TAU / seg;
        const rr = w.r + sin(ang * 7 + w.t * 30) * 3 * (1 - k);
        const px = w.x + cos(ang) * rr, py = w.y + sin(ang) * rr;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      // inner refracted echo
      ctx.strokeStyle = '#e8eaf6';
      ctx.globalAlpha = 0.4 * a;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.9, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7c4dff';
      ctx.globalAlpha = 0.22 * a;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r * 0.8, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawArcs(ctx) {
    if (!arcs.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < arcs.length; i++) {
      const s = arcs[i];
      const reveal = outCubic(min(1, s.t / 0.1));
      const fade = s.t < 0.08 ? 1 : 1 - inQuad((s.t - 0.08) / (s.life - 0.08));
      if (fade <= 0.01) continue;
      const a0 = s.ang - s.span / 2 * s.dir, sweep = s.span * reveal * s.dir;
      const N = 18;
      ctx.beginPath();
      for (let j = 0; j <= N; j++) {
        const f = j / N, ang = a0 + sweep * f, w = sin(PI * f) * s.R * 0.34 * (0.6 + 0.4 * fade);
        const rr = s.R + w * 0.15;
        const px = s.x + cos(ang) * rr, py = s.y + sin(ang) * rr;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      for (let j = N; j >= 0; j--) {
        const f = j / N, ang = a0 + sweep * f, w = sin(PI * f) * s.R * 0.34 * (0.6 + 0.4 * fade);
        const rr = s.R - w;
        ctx.lineTo(s.x + cos(ang) * rr, s.y + sin(ang) * rr);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 0.9 * fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.R * 1.04, s.dir > 0 ? a0 : a0 + sweep, s.dir > 0 ? a0 + sweep : a0);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawFalls(ctx) {
    if (!falls.length) return;
    for (let i = 0; i < falls.length; i++) {
      const f = falls[i];
      const k = fallPos(f, tmpPos);
      const x = tmpPos.x, y = tmpPos.y, r = f.size;
      // ground shadow
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(f.x, f.y, r * (0.6 + 0.8 * k), r * (0.3 + 0.4 * k), 0, 0, TAU); ctx.fill();
      // flaming tail
      ctx.globalCompositeOperation = 'lighter';
      const dx = f.sx - f.x, dy = f.sy - f.y, dl = hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
      for (let j = 5; j >= 1; j--) {
        const d = j * r * 0.9;
        glowAt(ctx, x + ux * d, y + uy * d, r * (2.1 - j * 0.28), j > 2 ? '#ff3d00' : '#ff9100', 0.5 - j * 0.06);
      }
      glowAt(ctx, x, y, r * 3, '#ff6d00', 0.6);
      // rock
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot);
      ctx.fillStyle = '#3e2723';
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = j * TAU / 8, rr = r * (0.8 + 0.3 * h1(f.seed + j));
        if (j === 0) ctx.moveTo(cos(a) * rr, sin(a) * rr); else ctx.lineTo(cos(a) * rr, sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffab40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const a = j * 2.1 + h1(f.seed + 9 + j);
        ctx.moveTo(cos(a) * r * 0.2, sin(a) * r * 0.2);
        ctx.lineTo(cos(a + 0.4) * r * 0.6, sin(a + 0.4) * r * 0.6);
        ctx.lineTo(cos(a + 0.1) * r * 0.85, sin(a + 0.1) * r * 0.85);
      }
      ctx.stroke();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      glowAt(ctx, x - ux * r * 0.3, y - uy * r * 0.3, r * 1.1, '#ffe082', 0.55);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------- spectral wolves */
  function drawSummons(ctx) {
    if (!summons.length) return;
    for (let i = 0; i < summons.length; i++) {
      const w = summons[i];
      if (!camIn(w.x, w.y, 60)) continue;
      const fast = w.state === 'lunge';
      ctx.globalCompositeOperation = 'lighter';
      glowAt(ctx, w.x, w.y, 44, '#448aff', 0.35 * w.alpha);
      if (fast || hypot(w.vx, w.vy) > 300) {
        for (let j = 1; j <= w.hn; j++) {
          const idx = ((w.hh - j + 4) % 4) * 2;
          drawWolf(ctx, w.hx[idx], w.hx[idx + 1], w.face, w.run - j * 0.3, w.alpha * (0.35 - j * 0.07), w.state, w.t, true);
        }
      }
      drawWolf(ctx, w.x, w.y, w.face, w.run, w.alpha, w.state, w.t, false);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function drawWolf(ctx, x, y, face, run, alpha, state, t, ghost) {
    if (alpha <= 0.02) return;
    const spawnK = min(1, t / 0.4);
    const crouch = state === 'crouch' ? 0.85 : 1;
    const stretch = state === 'lunge' ? 1.18 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(face);
    ctx.scale(stretch * (0.5 + 0.5 * spawnK), crouch / stretch * (0.5 + 0.5 * spawnK));
    const sw = sin(run), sw2 = sin(run + PI);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // legs
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = '#82b1ff';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(9, -6); ctx.lineTo(13 + sw * 6, -12);
    ctx.moveTo(9, 6); ctx.lineTo(13 + sw2 * 6, 12);
    ctx.moveTo(-10, -6); ctx.lineTo(-13 + sw2 * 6, -12);
    ctx.moveTo(-10, 6); ctx.lineTo(-13 + sw * 6, 12);
    ctx.stroke();
    // tail
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#448aff';
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.quadraticCurveTo(-24, sin(run * 0.7) * 6, -33, sin(run * 0.7 + 1) * 9); ctx.stroke();
    // torso
    ctx.globalAlpha = alpha * (ghost ? 0.5 : 0.55);
    ctx.fillStyle = '#5c8dff';
    ctx.beginPath(); ctx.ellipse(-2, 0, 17, 9, 0, 0, TAU); ctx.fill();
    // head
    ctx.beginPath();
    ctx.moveTo(10, -7); ctx.lineTo(21, -7.5); ctx.lineTo(31, -2.5); ctx.lineTo(32, 0); ctx.lineTo(31, 2.5); ctx.lineTo(21, 7.5); ctx.lineTo(10, 7); ctx.closePath();
    ctx.fill();
    // ears
    ctx.beginPath();
    ctx.moveTo(14, -6); ctx.lineTo(10, -14); ctx.lineTo(19, -7);
    ctx.moveTo(14, 6); ctx.lineTo(10, 14); ctx.lineTo(19, 7);
    ctx.fill();
    if (!ghost) {
      // rim light
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = '#e3f2fd';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.ellipse(-2, 0, 17, 9, 0, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(10, -7); ctx.lineTo(21, -7.5); ctx.lineTo(31, -2.5); ctx.lineTo(32, 0); ctx.lineTo(31, 2.5); ctx.lineTo(21, 7.5); ctx.lineTo(10, 7);
      ctx.stroke();
      // back stripe / spine wisps
      ctx.strokeStyle = '#bbdefb';
      ctx.globalAlpha = alpha * 0.5;
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(-2, sin(run) * 2, 10, 0); ctx.stroke();
      // glowing eyes
      ctx.globalAlpha = 1;
      glowAt(ctx, 24, -3.5, 4.5, '#ffffff', alpha);
      glowAt(ctx, 24, 3.5, 4.5, '#ffffff', alpha);
      glowAt(ctx, 0, 0, 22, '#82b1ff', 0.25 * alpha);
    }
    ctx.restore();
  }

  /* ============================================================= icons */
  // Icons are drawn once per (skill, pixel size) into a cached canvas in a unit space
  // (badge radius 1), then blitted; only a cheap animated shine is drawn live.
  const iconCache = new Map();
  const OUT = 'rgba(0,0,0,0.55)';
  function outlineFill(g, fill, w) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = OUT; g.lineWidth = w || 0.16; g.stroke();
    g.fillStyle = fill; g.fill();
  }
  function outlineStroke(g, col, w) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = OUT; g.lineWidth = w + 0.1; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
  }
  function drawBadge(g, col) {
    const dark = U.mix(col, '#000000', 0.74), mid = U.mix(col, '#000000', 0.38), light = U.mix(col, '#ffffff', 0.5);
    const gr = g.createRadialGradient(-0.25, -0.35, 0.05, 0, 0, 1);
    gr.addColorStop(0, mid); gr.addColorStop(1, dark);
    g.beginPath(); g.arc(0, 0, 0.95, 0, TAU);
    g.fillStyle = gr; g.fill();
    g.lineWidth = 0.08; g.strokeStyle = col; g.stroke();
    g.beginPath(); g.arc(0, 0, 0.83, 0, TAU);
    g.lineWidth = 0.025; g.strokeStyle = U.rgba(light, 0.4); g.stroke();
    const gl = g.createRadialGradient(0, 0, 0.1, 0, 0, 0.9);
    gl.addColorStop(0, U.rgba(light, 0.28)); gl.addColorStop(1, U.rgba(light, 0));
    g.fillStyle = gl;
    g.beginPath(); g.arc(0, 0, 0.9, 0, TAU); g.fill();
  }
  function glossTop(g) {
    g.beginPath(); g.ellipse(0, -0.52, 0.6, 0.26, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.fill();
  }

  const SYM = {
    water_blade(g) {
      g.save(); g.rotate(-0.75);
      crescentPath(g, 0.62, 2.15, 0.36); outlineFill(g, '#b3e5fc');
      crescentPath(g, 0.5, 1.7, 0.2); g.fillStyle = '#ffffff'; g.fill();
      g.restore();
      g.beginPath(); g.moveTo(-0.42, 0.22); g.quadraticCurveTo(-0.28, 0.42, -0.42, 0.55); g.quadraticCurveTo(-0.56, 0.42, -0.42, 0.22);
      outlineFill(g, '#4fc3ff', 0.1);
    },
    sonic_wave(g) {
      g.beginPath(); g.arc(0, 0, 0.13, 0, TAU); outlineFill(g, '#ede7f6');
      for (let i = 1; i <= 3; i++) {
        const r = 0.12 + i * 0.19;
        g.beginPath(); g.arc(0, 0, r, -0.75, 0.75); outlineStroke(g, i === 2 ? '#d1c4e9' : '#ffffff', 0.09);
        g.beginPath(); g.arc(0, 0, r, PI - 0.75, PI + 0.75); outlineStroke(g, i === 2 ? '#d1c4e9' : '#ffffff', 0.09);
      }
    },
    sticky_web(g) {
      g.beginPath();
      const n = 8;
      for (let i = 0; i < n; i++) { const a = i * TAU / n + 0.2; g.moveTo(0, 0); g.lineTo(cos(a) * 0.72, sin(a) * 0.72); }
      for (let ring = 1; ring <= 3; ring++) {
        const rr = ring * 0.22;
        for (let i = 0; i <= n; i++) {
          const a = (i % n) * TAU / n + 0.2, px = cos(a) * rr, py = sin(a) * rr;
          if (i === 0) g.moveTo(px, py);
          else { const pa = (i - 0.5) * TAU / n + 0.2; g.quadraticCurveTo(cos(pa) * rr * 0.82, sin(pa) * rr * 0.82, px, py); }
        }
      }
      outlineStroke(g, '#f3e5f5', 0.05);
      g.beginPath(); g.arc(0, 0, 0.09, 0, TAU); outlineFill(g, '#ffffff', 0.08);
    },
    needle_storm(g) {
      g.save(); g.rotate(-0.78);
      for (let i = -1; i <= 1; i++) {
        const y = i * 0.27, x0 = -0.62 + abs(i) * 0.18;
        g.beginPath(); g.moveTo(x0 + 1.15, y); g.lineTo(x0, y - 0.065); g.lineTo(x0 + 0.08, y); g.lineTo(x0, y + 0.065); g.closePath();
        outlineFill(g, '#fff59d', 0.1);
        g.beginPath(); g.moveTo(x0 - 0.05, y); g.lineTo(x0 - 0.28, y); outlineStroke(g, 'rgba(255,245,157,0.6)', 0.04);
      }
      g.restore();
    },
    thorn_ring(g) {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8, b = 0.13;
        g.moveTo(cos(a - b) * 0.5, sin(a - b) * 0.5); g.lineTo(cos(a) * 0.8, sin(a) * 0.8); g.lineTo(cos(a + b) * 0.5, sin(a + b) * 0.5);
      }
      outlineFill(g, '#dcedc8', 0.1);
      g.beginPath(); g.arc(0, 0, 0.5, 0, TAU); outlineStroke(g, '#2e7d32', 0.17);
      g.beginPath(); g.arc(0, 0, 0.5, 0, TAU); g.strokeStyle = '#81c784'; g.lineWidth = 0.07; g.stroke();
      g.save(); g.translate(0.05, -0.08); g.rotate(-0.6);
      g.beginPath(); g.moveTo(0, 0.22); g.quadraticCurveTo(0.2, 0, 0, -0.26); g.quadraticCurveTo(-0.2, 0, 0, 0.22);
      outlineFill(g, '#9ccc65', 0.08);
      g.restore();
    },
    magma_orb(g) {
      g.save(); g.rotate(-0.4);
      g.beginPath(); g.ellipse(0, 0, 0.72, 0.3, 0, 0, TAU); outlineStroke(g, 'rgba(255,171,64,0.75)', 0.05);
      g.restore();
      g.beginPath(); g.arc(0, 0, 0.4, 0, TAU); outlineFill(g, '#4e1c0a');
      g.beginPath();
      g.moveTo(-0.05, -0.05); g.lineTo(-0.22, -0.18); g.lineTo(-0.3, -0.05);
      g.moveTo(-0.05, -0.05); g.lineTo(0.12, -0.25);
      g.moveTo(-0.05, -0.05); g.lineTo(0.08, 0.1); g.lineTo(0.25, 0.14);
      g.moveTo(0.08, 0.1); g.lineTo(-0.02, 0.3);
      g.strokeStyle = '#ffab40'; g.lineWidth = 0.06; g.lineCap = 'round'; g.stroke();
      g.beginPath(); g.arc(0.6, 0.22, 0.12, 0, TAU); outlineFill(g, '#ff9100', 0.08);
    },
    cleave(g) {
      g.save(); g.rotate(-2.3);
      crescentPath(g, 0.7, 1.95, 0.22); outlineFill(g, '#ffcdd2');
      crescentPath(g, 0.62, 1.6, 0.1); g.fillStyle = '#ffffff'; g.fill();
      g.restore();
      g.beginPath(); g.moveTo(0.38, 0.5); g.lineTo(0.62, 0.3); g.moveTo(0.2, 0.62); g.lineTo(0.42, 0.44);
      outlineStroke(g, '#ff8a80', 0.05);
    },
    poison_mist(g) {
      const C = [[-0.36, 0.1, 0.27], [0.02, -0.1, 0.36], [0.38, 0.1, 0.26]];
      g.lineJoin = 'round';
      for (const c of C) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, TAU); g.strokeStyle = OUT; g.lineWidth = 0.16; g.stroke(); }
      g.beginPath(); g.rect(-0.6, 0.08, 1.2, 0.28); g.stroke();
      g.fillStyle = '#c5e1a5';
      for (const c of C) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, TAU); g.fill(); }
      g.beginPath(); g.rect(-0.6, 0.08, 1.2, 0.28); g.fill();
      g.fillStyle = '#33691e';
      g.beginPath(); g.arc(-0.12, 0.02, 0.07, 0, TAU); g.arc(0.14, 0.02, 0.07, 0, TAU); g.fill();
      g.beginPath(); g.arc(-0.3, -0.5, 0.07, 0, TAU); g.arc(0.42, -0.42, 0.05, 0, TAU);
      outlineFill(g, '#ccff90', 0.06);
      g.beginPath(); g.moveTo(0.1, 0.4); g.quadraticCurveTo(0.2, 0.58, 0.1, 0.66); g.quadraticCurveTo(0, 0.58, 0.1, 0.4);
      outlineFill(g, '#76ff03', 0.07);
    },
    spirit_orbs(g) {
      g.beginPath();
      g.moveTo(-0.42, 0.5); g.lineTo(-0.42, -0.08); g.arc(0, -0.08, 0.42, PI, 0, false); g.lineTo(0.42, 0.5);
      g.quadraticCurveTo(0.35, 0.34, 0.21, 0.5); g.quadraticCurveTo(0.1, 0.36, 0, 0.5); g.quadraticCurveTo(-0.1, 0.36, -0.21, 0.5); g.quadraticCurveTo(-0.35, 0.34, -0.42, 0.5);
      g.closePath();
      outlineFill(g, '#e0f7fa');
      g.fillStyle = '#004d40';
      g.beginPath(); g.ellipse(-0.15, -0.08, 0.07, 0.11, 0, 0, TAU); g.ellipse(0.15, -0.08, 0.07, 0.11, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(0, 0.16, 0.06, 0.08, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(0.55, -0.5, 0.07, 0, TAU); g.arc(-0.6, -0.42, 0.05, 0, TAU); g.fillStyle = '#a7ffeb'; g.fill();
    },
    fire_breath(g) {
      g.beginPath();
      g.moveTo(0, 0.68);
      g.bezierCurveTo(-0.55, 0.62, -0.62, 0.05, -0.2, -0.3);
      g.bezierCurveTo(-0.15, -0.05, -0.05, 0, 0.0, 0.0);
      g.bezierCurveTo(-0.05, -0.35, 0.1, -0.6, 0.12, -0.78);
      g.bezierCurveTo(0.55, -0.4, 0.62, 0.0, 0.5, 0.3);
      g.bezierCurveTo(0.42, 0.55, 0.25, 0.68, 0, 0.68);
      g.closePath();
      outlineFill(g, '#ff9100');
      g.beginPath();
      g.moveTo(0.02, 0.6); g.bezierCurveTo(-0.3, 0.55, -0.3, 0.15, -0.02, -0.08); g.bezierCurveTo(0.05, 0.12, 0.2, 0.0, 0.18, -0.2);
      g.bezierCurveTo(0.42, 0.1, 0.35, 0.58, 0.02, 0.6); g.closePath();
      g.fillStyle = '#ffeb3b'; g.fill();
      g.beginPath(); g.ellipse(0.04, 0.4, 0.1, 0.14, 0, 0, TAU); g.fillStyle = '#fffde7'; g.fill();
    },
    meteor(g) {
      g.beginPath();
      g.moveTo(0.05, 0.02); g.lineTo(-0.72, -0.5); g.lineTo(-0.1, 0.0); g.lineTo(-0.5, -0.72); g.lineTo(0.02, -0.05);
      g.lineTo(-0.2, -0.3); g.lineTo(0.3, 0.05); g.closePath();
      outlineFill(g, '#ffab40', 0.12);
      g.beginPath(); g.arc(0.22, 0.22, 0.32, 0, TAU); outlineFill(g, '#8d6e63');
      g.fillStyle = '#5d4037';
      g.beginPath(); g.arc(0.14, 0.14, 0.08, 0, TAU); g.arc(0.34, 0.3, 0.06, 0, TAU); g.arc(0.3, 0.06, 0.04, 0, TAU); g.fill();
      g.beginPath(); g.arc(0.22, 0.22, 0.32, -2.6, -0.9); g.strokeStyle = '#ffcc80'; g.lineWidth = 0.06; g.stroke();
    },
    regen(g) {
      g.beginPath();
      g.moveTo(0, 0.64); g.bezierCurveTo(-0.95, 0.02, -0.5, -0.78, 0, -0.3); g.bezierCurveTo(0.5, -0.78, 0.95, 0.02, 0, 0.64); g.closePath();
      outlineFill(g, '#b9f6ca');
      g.beginPath();
      g.rect(-0.08, -0.22, 0.16, 0.52); g.rect(-0.26, -0.04, 0.52, 0.16);
      g.fillStyle = '#00c853'; g.fill();
    },
    body_armor(g) {
      g.beginPath();
      g.moveTo(0, -0.72); g.lineTo(0.56, -0.5); g.lineTo(0.52, 0.08); g.quadraticCurveTo(0.42, 0.5, 0, 0.74);
      g.quadraticCurveTo(-0.42, 0.5, -0.52, 0.08); g.lineTo(-0.56, -0.5); g.closePath();
      outlineFill(g, '#d7ccc8');
      g.beginPath();
      g.moveTo(0, -0.55); g.lineTo(0.38, -0.4); g.lineTo(0.36, 0.06); g.quadraticCurveTo(0.28, 0.36, 0, 0.55);
      g.quadraticCurveTo(-0.28, 0.36, -0.36, 0.06); g.lineTo(-0.38, -0.4); g.closePath();
      g.fillStyle = '#a1887f'; g.fill();
      g.beginPath(); g.moveTo(-0.3, -0.2); g.lineTo(-0.05, -0.05); g.lineTo(0.05, -0.3); g.moveTo(-0.05, -0.05); g.lineTo(0.1, 0.25); g.lineTo(0.3, 0.12);
      g.strokeStyle = '#5d4037'; g.lineWidth = 0.05; g.stroke();
      g.beginPath(); g.arc(0, -0.05, 0.1, 0, TAU); g.fillStyle = '#ffcc80'; g.fill();
    },
    shadow_step(g) {
      g.fillStyle = 'rgba(179,136,255,0.25)';
      g.beginPath(); g.arc(-0.42, 0.06, 0.24, 0, TAU); g.fill();
      g.fillStyle = 'rgba(179,136,255,0.45)';
      g.beginPath(); g.arc(-0.12, 0.03, 0.29, 0, TAU); g.fill();
      g.beginPath(); g.arc(0.25, 0, 0.34, 0, TAU); outlineFill(g, '#1a0033');
      g.beginPath(); g.arc(0.25, 0, 0.34, -1.2, 1.2); g.strokeStyle = '#b388ff'; g.lineWidth = 0.07; g.stroke();
      g.beginPath(); g.ellipse(0.36, -0.06, 0.1, 0.05, -0.3, 0, TAU); g.fillStyle = '#e040fb'; g.fill();
      g.beginPath(); g.moveTo(-0.72, -0.32); g.lineTo(-0.3, -0.32); g.moveTo(-0.78, 0.38); g.lineTo(-0.36, 0.38);
      outlineStroke(g, '#b388ff', 0.05);
    },
    black_lightning(g) {
      g.beginPath();
      g.moveTo(0.12, -0.84); g.lineTo(-0.42, 0.1); g.lineTo(-0.04, 0.1); g.lineTo(-0.18, 0.84); g.lineTo(0.44, -0.16); g.lineTo(0.04, -0.16); g.lineTo(0.3, -0.84);
      g.closePath();
      g.lineJoin = 'miter';
      g.strokeStyle = '#000000'; g.lineWidth = 0.2; g.stroke();
      g.fillStyle = '#e1bee7'; g.fill();
      g.beginPath();
      g.moveTo(0.14, -0.6); g.lineTo(-0.2, 0.0); g.lineTo(0.08, 0.0); g.lineTo(-0.02, 0.45);
      g.strokeStyle = '#4a148c'; g.lineWidth = 0.06; g.stroke();
    },
    wolf_howl(g) {
      g.beginPath();
      g.moveTo(-0.6, -0.76); g.lineTo(-0.26, -0.4); g.lineTo(0.26, -0.4); g.lineTo(0.6, -0.76); g.lineTo(0.58, -0.08);
      g.lineTo(0.4, 0.26); g.lineTo(0.14, 0.6); g.lineTo(0, 0.72); g.lineTo(-0.14, 0.6); g.lineTo(-0.4, 0.26); g.lineTo(-0.58, -0.08);
      g.closePath();
      outlineFill(g, '#bbdefb');
      g.fillStyle = '#5c8dff';
      g.beginPath(); g.moveTo(-0.5, -0.6); g.lineTo(-0.32, -0.38); g.lineTo(-0.5, -0.3); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0.5, -0.6); g.lineTo(0.32, -0.38); g.lineTo(0.5, -0.3); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(-0.14, 0.2); g.lineTo(0, 0.58); g.lineTo(0.14, 0.2); g.closePath();
      g.fillStyle = '#e3f2fd'; g.fill();
      g.fillStyle = '#0d47a1';
      g.beginPath(); g.moveTo(-0.36, -0.12); g.lineTo(-0.12, -0.04); g.lineTo(-0.3, 0.02); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0.36, -0.12); g.lineTo(0.12, -0.04); g.lineTo(0.3, 0.02); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(0, 0.5, 0.08, 0.06, 0, 0, TAU); g.fill();
    },
    gluttony(g) {
      g.beginPath(); g.arc(0, 0, 0.64, 0, TAU); outlineFill(g, '#12001f');
      g.beginPath(); g.arc(0, 0, 0.64, 0, TAU); g.strokeStyle = '#ea80fc'; g.lineWidth = 0.07; g.stroke();
      g.beginPath();
      for (let i = 0; i < 2; i++) {
        const b = i * PI;
        for (let j = 0; j <= 14; j++) { const f = j / 14, a = b + f * 3.2, r = 0.46 * (1 - f * 0.85); const px = cos(a) * r, py = sin(a) * r; if (j === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      }
      g.strokeStyle = '#aa00ff'; g.lineWidth = 0.06; g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -2.5 + i * 0.5;
        g.moveTo(cos(a - 0.17) * 0.62, sin(a - 0.17) * 0.62); g.lineTo(cos(a) * 0.36, sin(a) * 0.36); g.lineTo(cos(a + 0.17) * 0.62, sin(a + 0.17) * 0.62);
        const b = 0.75 + i * 0.4;
        g.moveTo(cos(b - 0.15) * 0.62, sin(b - 0.15) * 0.62); g.lineTo(cos(b) * 0.4, sin(b) * 0.4); g.lineTo(cos(b + 0.15) * 0.62, sin(b + 0.15) * 0.62);
      }
      g.fill();
      g.beginPath(); g.arc(0, 0, 0.08, 0, TAU); g.fillStyle = '#e040fb'; g.fill();
    },
  };

  function iconCanvas(id, px) {
    const key = id + '|' + px;
    let c = iconCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    if (g) {
      g.translate(px / 2, px / 2);
      g.scale(px / 2, px / 2);
      const def = DEFS[id];
      drawBadge(g, def.color);
      try { SYM[id](g); } catch (e) { console.error(e); }
      glossTop(g);
    }
    if (iconCache.size > 160) iconCache.delete(iconCache.keys().next().value);
    iconCache.set(key, c);
    return c;
  }

  function makeIconDrawer(id) {
    return function drawIcon(ctx, x, y, size, t) {
      if (!ctx || !(size > 0)) return;
      const dpr = SK.DPR || 1;
      const px = clamp(Math.ceil(size * dpr / 8) * 8, 16, 256);
      const c = iconCanvas(id, px);
      ctx.drawImage(c, x - size / 2, y - size / 2, size, size);
      if (size >= 20) {
        const a0 = (t || 0) * 1.4 + id.length;
        const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pa * 0.35;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = max(1, size * 0.045);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x, y, size * 0.44, a0, a0 + 0.8); ctx.stroke();
        ctx.globalAlpha = pa;
        ctx.globalCompositeOperation = pc;
      }
    };
  }

  /* ============================================================== defs */
  function cdLin(base, per, minV) {
    return function (level, player) {
      const l = clamp(level | 0 || 1, 1, 5);
      return max(minV, base - per * (l - 1)) * cdMul(player);
    };
  }
  function zeroCd() { return 0; }
  function descFn(list) {
    return function (level) {
      const l = level | 0;
      if (l > list.length) return 'Livello massimo raggiunto.';
      return list[clamp(l, 1, list.length) - 1];
    };
  }

  const RAW = [
    {
      id: 'water_blade', name: "Lama d'Acqua", kind: 'auto', element: 'water', color: '#4fc3ff', source: null,
      desc: "Mezzelune d'acqua rotanti inseguono il nemico più vicino.",
      levels: ["Mezzelune d'acqua rotanti inseguono il nemico più vicino.", '+1 lama, +5 danni.', '+5 danni, le lame perforano 1 nemico.', '+1 lama, +5 danni, ricarica più rapida.', '+5 danni, perforano 2 nemici.'],
      cooldown: cdLin(1.25, 0.07, 0.5),
    },
    {
      id: 'sonic_wave', name: 'Onda Sonica', kind: 'auto', element: 'sound', color: '#b388ff', source: 'bat',
      desc: "Un'onda d'urto circolare respinge e ferisce i nemici vicini.",
      levels: ["Un'onda d'urto circolare respinge e ferisce i nemici vicini.", '+4 danni, raggio +22, spinta più forte.', '+4 danni, raggio +22, ricarica più rapida.', "Doppia onda: un'eco segue la prima.", "+4 danni, le onde stordiscono per un istante."],
      cooldown: cdLin(2.8, 0.18, 1),
    },
    {
      id: 'sticky_web', name: 'Filo Vischioso', kind: 'auto', element: 'web', color: '#d1c4e9', source: 'cave_spider',
      desc: 'Spara ragnatele che lasciano trappole rallentanti a terra.',
      levels: ['Spara ragnatele che lasciano trappole rallentanti a terra.', 'Trappole più ampie e durature, rallentamento +7%.', '+1 ragnatela per raffica.', 'Le trappole corrodono: +2 danni al secondo, +7% rallentamento.', '+1 ragnatela, trappole enormi.'],
      cooldown: cdLin(3.0, 0.2, 1.2),
    },
    {
      id: 'needle_storm', name: 'Tempesta di Aculei', kind: 'auto', element: 'physical', color: '#ffee58', source: 'killer_hornet',
      desc: 'Raffiche rapidissime di pungiglioni contro il nemico più vicino.',
      levels: ['Raffiche rapidissime di pungiglioni contro il nemico più vicino.', '+1 aculeo per raffica, +2 danni.', '+1 aculeo, ricarica più rapida.', 'Gli aculei perforano 1 nemico, +2 danni.', '+1 aculeo, +2 danni, raffiche continue.'],
      cooldown: cdLin(1.9, 0.12, 0.7),
    },
    {
      id: 'thorn_ring', name: 'Anello di Spine', kind: 'auto', element: 'nature', color: '#66bb6a', source: 'treant',
      desc: 'Rampicanti spinosi orbitano attorno a te ferendo chi tocchi.',
      levels: ['Rampicanti spinosi orbitano attorno a te ferendo chi tocchi.', '+1 rampicante, +4 danni.', 'Orbita più ampia e veloce, +4 danni.', '+1 rampicante, le spine intrappolano (rallentano).', '+1 rampicante, +4 danni, orbita vorticosa.'],
      cooldown: zeroCd,
    },
    {
      id: 'magma_orb', name: 'Sfere di Magma', kind: 'auto', element: 'fire', color: '#ff7043', source: 'magma_golem',
      desc: 'Sfere di lava pulsanti ruotano attorno a te e incendiano i nemici.',
      levels: ['Sfere di lava pulsanti ruotano attorno a te e incendiano i nemici.', '+6 danni, ustione più intensa.', '+1 sfera, orbita più ampia.', '+6 danni, sfere più grandi.', '+1 sfera, ustione devastante.'],
      cooldown: zeroCd,
    },
    {
      id: 'cleave', name: 'Fendente Brutale', kind: 'auto', element: 'physical', color: '#ff5252', source: 'orc_warrior',
      desc: 'Un enorme fendente a mezzaluna davanti a te, con forte spinta.',
      levels: ['Un enorme fendente a mezzaluna davanti a te, con forte spinta.', '+13 danni, arco più ampio.', '+13 danni, portata maggiore, ricarica più rapida.', 'I nemici colpiti restano storditi.', '+13 danni, arco gigantesco.'],
      cooldown: cdLin(2.4, 0.15, 1),
    },
    {
      id: 'poison_mist', name: 'Nebbia Velenosa', kind: 'auto', element: 'poison', color: '#8bc34a', source: 'toxic_shroom',
      desc: 'Rilascia nubi tossiche che avvelenano chi vi resta dentro.',
      levels: ['Rilascia nubi tossiche che avvelenano chi vi resta dentro.', '+1 nube, veleno più forte.', 'Nubi più ampie e durature.', '+1 nube, +3 danni al secondo.', 'Veleno letale, nubi enormi.'],
      cooldown: cdLin(3.4, 0.22, 1.4),
    },
    {
      id: 'spirit_orbs', name: 'Spiriti Erranti', kind: 'auto', element: 'spirit', color: '#a7ffeb', source: 'specter',
      desc: 'Fuochi fatui spettrali vagano e inseguono i nemici.',
      levels: ['Fuochi fatui spettrali vagano e inseguono i nemici.', '+1 spirito, +5 danni.', '+5 danni, ricarica più rapida.', '+1 spirito, +5 danni.', 'Gli spiriti attraversano 1 nemico.'],
      cooldown: cdLin(2.3, 0.12, 0.9),
    },
    {
      id: 'fire_breath', name: 'Soffio di Fuoco', kind: 'auto', element: 'fire', color: '#ff9100', source: 'salamander',
      desc: 'Un cono di fiamme incendia i nemici e lascia il terreno in fiamme.',
      levels: ['Un cono di fiamme incendia i nemici e lascia il terreno in fiamme.', 'Cono più lungo e ampio, +2 danni.', 'Soffio più lungo, terreno ardente più vasto.', '+2 danni, ustione più intensa.', 'Fiamme infernali: cono enorme.'],
      cooldown: cdLin(3.2, 0.18, 1.4),
    },
    {
      id: 'meteor', name: 'Pioggia di Meteore', kind: 'auto', element: 'fire', color: '#ff6e40', source: 'fire_imp',
      desc: "Meteore infuocate si schiantano sui nemici, lasciando crateri ardenti.",
      levels: ["Meteore infuocate si schiantano sui nemici, lasciando crateri ardenti.", '+1 meteora, +22 danni.', 'Esplosioni più ampie, ricarica più rapida.', '+1 meteora, +22 danni.', 'Crateri roventi e pioggia incessante.'],
      cooldown: cdLin(4.4, 0.3, 2),
    },
    {
      id: 'regen', name: 'Rigenerazione Istantanea', kind: 'passive', element: 'water', color: '#69f0ae', source: 'wild_slime',
      desc: 'Rigeneri salute continuamente; il doppio quando sei in pericolo.',
      levels: ['Rigeneri salute continuamente; il doppio quando sei in pericolo.', 'Rigenerazione aumentata.', 'Rigenerazione aumentata.', 'Rigenerazione aumentata.', 'Rigenerazione massima: quasi immortale.'],
      cooldown: zeroCd,
    },
    {
      id: 'body_armor', name: 'Corazza di Roccia', kind: 'passive', element: 'earth', color: '#c8a26b', source: 'rock_crab',
      desc: 'Armatura extra e uno scudo di pietra che para un colpo.',
      levels: ['Armatura +1 e uno scudo di pietra che para un colpo.', 'Armatura +2, lo scudo si ricarica prima.', 'Armatura +3, ricarica più rapida.', 'Armatura +5, ricarica più rapida.', 'Armatura +6: lo scudo esplode respingendo i nemici.'],
      cooldown: function (level, player) { const l = clamp(level | 0 || 1, 1, 5); return (15 - 1.6 * l) * cdMul(player); },
    },
    {
      id: 'shadow_step', name: "Passo d'Ombra", kind: 'passive', element: 'shadow', color: '#7c4dff', source: 'dire_wolf',
      desc: "Lo scatto lascia una scia d'ombra dannosa e ti rende intoccabile.",
      levels: ["Lo scatto lascia una scia d'ombra dannosa e ti rende intoccabile.", 'Ricarica dello scatto −7%, scia più letale.', "Lo scatto sprigiona un'esplosione d'ombra.", 'La scia rallenta i nemici.', 'Ricarica scatto −35% totale, ombre letali.'],
      cooldown: zeroCd,
    },
    {
      id: 'black_lightning', name: 'Fulmine Nero', kind: 'active', element: 'storm', color: '#9c27b0', source: 'abyss_serpent', mpCost: 30,
      desc: 'Una tempesta di fulmini neri si abbatte sui nemici e si propaga a catena.',
      levels: ['Una tempesta di fulmini neri si abbatte sui nemici e si propaga a catena.', '+2 fulmini, +32 danni.', '+2 fulmini, catena più lunga.', '+32 danni, ricarica più rapida.', 'Apocalisse: +2 fulmini, catena massima.'],
      cooldown: cdLin(14, 1, 6),
    },
    {
      id: 'wolf_howl', name: 'Ululato Lunare', kind: 'active', element: 'beast', color: '#448aff', source: 'alpha_wolf', mpCost: 35,
      desc: 'Evoca un branco di lupi spettrali che sbranano i nemici.',
      levels: ['Evoca un branco di lupi spettrali che sbranano i nemici.', '+1 lupo, morsi più forti.', 'Branco più duraturo e feroce.', '+1 lupo, i morsi rallentano.', 'Branco leggendario: lupi più forti e numerosi.'],
      cooldown: cdLin(24, 1.5, 10),
    },
    {
      id: 'gluttony', name: 'Fame Insaziabile', kind: 'active', element: 'void', color: '#aa00ff', source: 'orc_tyrant', mpCost: 50,
      desc: 'Un vortice divoratore risucchia i nemici: chi muore viene assorbito e ti cura.',
      levels: ['Un vortice divoratore risucchia i nemici: chi muore viene assorbito e ti cura.', 'Vortice più ampio e potente.', 'Attrazione più forte, dura di più.', '+16 danni, cura maggiore.', 'Fame assoluta: vortice colossale.'],
      cooldown: cdLin(32, 2, 14),
    },
  ];

  const DEFS = {};
  for (const r of RAW) {
    DEFS[r.id] = {
      id: r.id, name: r.name, desc: r.desc, kind: r.kind, element: r.element, color: r.color, maxLevel: 5,
      source: r.source, mpCost: r.mpCost || 0, levels: r.levels,
      levelDesc: descFn(r.levels), cooldown: r.cooldown, drawIcon: makeIconDrawer(r.id),
    };
  }

  SK.Skills = {
    defs: DEFS,
    ids: RAW.map((r) => r.id),
    autoIds: AUTO_IDS,
    passiveIds: PASSIVE_IDS,
    activeIds: ACTIVE_IDS,
    update,
    cast,
    onDash,
    onPlayerHit,
    spawnProjectile,
    spawnZone,
    render,
    renderZones,
    cooldownRatio,
    ownedAuto: (p) => ownedOf(p, 'auto'),
    ownedPassive: (p) => ownedOf(p, 'passive'),
    ownedActive: (p) => ownedOf(p, 'active'),
    clear,
    summons: () => summons,
    count: () => ({
      projectiles: (SK.G && SK.G.projectiles ? SK.G.projectiles.length : 0), zones: (SK.G && SK.G.zones ? SK.G.zones.length : 0),
      waves: waves.length, meteors: falls.length, wolves: summons.length, pool: pool.length,
    }),
  };
})(window.SK);
