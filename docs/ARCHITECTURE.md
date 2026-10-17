# Slime Reborn — L'Ascesa del Predatore · Architecture contract

This document is the **binding contract** between the game's modules. Every module
author codes against exactly these names, signatures and data shapes. If you need
something another module does not expose here, implement a local fallback inside
your own module instead of inventing a call into someone else's.

The game is an original action-roguelite (top-down, "survivor-like" with active
skills) inspired by the *reincarnated slime* fantasy genre: a slime awakens in a
sealed cave, devours monsters with its **Predatore** skill to steal their
abilities, **names** wandering monsters to turn them into allies, and **evolves**
until it becomes a Demon Lord. All names/characters are original. UI language:
**Italian**.

## 1. Tech constraints

* Plain HTML5 Canvas 2D + DOM overlay. **No libraries, no build step, no ES
  modules** (the Android WebView loads `file:///android_asset/index.html`; ES
  modules break on `file://`). Every file is a classic script wrapped in an IIFE
  that attaches to the global `window.SK` namespace.
* `'use strict'` inside every IIFE. ES2020 syntax is fine (arrow functions,
  classes, optional chaining, `??`). No top-level `await`.
* No external assets (no images, fonts, audio files). Everything is drawn
  procedurally and synthesized with WebAudio. Emoji are allowed in DOM UI only
  (not required), never as the main visual of an entity.
* Target: 60 fps on a mid-range Android phone with ~250 enemies + ~600
  particles. **Never use `ctx.shadowBlur`** in per-frame code (very slow on
  Android). For glows use `SK.FX.glowSprite()` (cached radial-gradient canvases)
  drawn with `globalCompositeOperation = 'lighter'`. Avoid per-frame object
  allocation in hot loops when easy (pools, reuse).
* Respect `SK.quality` (`'high' | 'medium' | 'low'`): on `low` halve particle
  counts and skip optional decorative passes.
* Screen is landscape. All screen-space sizes are CSS pixels; the context is
  pre-scaled by DPR by `core.js`, so draw in CSS px.

## 2. Files & load order

```
web/index.html          (core team)   canvas#game + div#ui overlay, script tags
web/css/style.css       (ui.js owner) all DOM UI styling
web/js/core.js          (core team)   SK.util, SK.events, canvas, SK.cam, SK.time, SK.input, SK.save, SK.loop, SK.vibrate, SK.debug
web/js/audio.js         SK.Audio
web/js/fx.js            SK.FX
web/js/slime.js         SK.Slime
web/js/skills.js        SK.Skills
web/js/enemies.js       SK.Enemies
web/js/world.js         SK.World
web/js/ui.js            SK.UI
web/js/character.js     SK.Character  (races, classes, non-slime player rendering, character creator screen)
web/js/nation.js        SK.Nation     (nation hub: companions, affinity, dates, marriage, spouse bonuses)
web/css/character.css   (character.js owner)
web/css/nation.css      (nation.js owner)
web/js/game.js          SK.Game, SK.G, SK.combat
web/js/main.js          (core team)   boot
```

Modules may reference each other **only inside functions** (never at load
time), so load order only matters for `core.js` first and `main.js` last.

## 3. core.js (already written — read it)

* `SK.util` (`U` by convention: `const U = SK.util;`): `TAU, clamp, lerp,
  invLerp, remap, rand(a,b), randi(a,b), chance(p), choice(arr), weighted(arr,
  weightFn), shuffle(arr), dist, dist2, angle(ax,ay,bx,by), angleDiff(a,b),
  lerpAngle(a,b,t), approach(v,target,step), damp(a,b,lambda,dt), ease.{outCubic,
  inCubic, inOutCubic, outBack, outElastic, outQuad, inOutSine}, hexToRgb(hex),
  rgba(hex,a), mix(hexA,hexB,t) -> '#rrggbb', fmtTime(sec), fmtNum(n), uid()`.
* `SK.events.on(name, fn)`, `off(name, fn)`, `emit(name, data)`.
* `SK.canvas`, `SK.ctx`, `SK.W`, `SK.H` (CSS px), `SK.DPR`, `SK.quality`.
* `SK.cam` — `{x, y, zoom}`; `follow(tx, ty, dt)`, `snap(x,y)`,
  `shake(intensity, duration)`, `kick(dx, dy)` (directional punch),
  `begin(ctx)` / `end(ctx)` (push/pop world transform incl. shake),
  `toScreen(wx, wy) -> {x,y}`, `toWorld(sx, sy) -> {x,y}`,
  `inView(x, y, margin)`, `view` = `{x0,y0,x1,y1}` (world rect, updated by
  `follow`/`snap`), `zoomMul` (game may tween it, e.g. evolution cut-in).
  Base zoom makes the short screen side show ~620 world units.
* `SK.time` — `t` (real seconds since boot, never paused), `gameT` (scaled game
  seconds), `scale` (debug multiplier), `hitstop(seconds)`, `slowmo(factor,
  seconds)`. The loop hands `dt` (already scaled; 0 during hitstop) to
  `SK.Game.update(dt, rawDt)`.
* `SK.input` — `move` `{x, y}` (length 0..1), `down[id]`, `pressed[id]` (one
  frame edge), `released[id]`, `joy` `{active, ox, oy, x, y}` (screen px, for
  drawing the floating joystick), `buttons` — array of `{id, x, y, r, visible,
  enabled, down, icon}` in screen px laid out by core (ids: `'absorb'`,
  `'dash'`, `'s1'`, `'s2'`, `'s3'`, `'name'`, `'pause'`). Game sets
  `visible`/`enabled`; HUD draws them. `SK.input.enabled` (false while DOM menus
  are open). Keyboard: WASD/arrows move, Space=dash, E or Shift=absorb,
  1/2/3 or J/K/L = s1/s2/s3, F or N = name, Esc/P = pause.
  `SK.input.botMove` / `SK.input.botDown` can be set by the autoplay bot.
* `SK.save.data` (see shape below), `SK.save.load()`, `SK.save.write()`,
  `SK.save.reset()`.
* `SK.vibrate(msOrPattern)` — respects settings, uses the native bridge when
  present.
* `SK.debug` — `{enabled, autoplay, speed, godmode, startBiome, fps}` from URL
  query `?debug&autoplay&speed=4&god&biome=2`.

### Save data shape (`SK.save.data`)

```js
{
  version: 1,
  souls: 0,            // spendable meta currency ("Anime")
  totalSouls: 0,
  upgrades: {},        // { [shopUpgradeId]: level }
  best: { time: 0, kills: 0, level: 0, biome: 0, score: 0 },
  runs: 0, wins: 0,
  bestiary: {},        // { [enemyTypeId]: { seen, kills, absorbed } }
  skillsFound: {},     // { [skillId]: true }
  achievements: {},    // { [achId]: true }
  nightmare: false,    // unlocked after first win
  character: { name: 'Pierfrancesco', race: 'slime', cls: 'pierfrancesco', color: '#4fc3ff' }, // last created hero (owned by SK.Character)
  nation: {            // owned by SK.Nation
    companions: {},    // { [companionId]: { unlocked, affinity /*0..10*/, married, dates, talkedRun } }
    citizens: [],      // [{ name, type }] named monsters that joined the nation
    rings: 0, activeCompanion: null, weddings: 0,
  },
  settings: { music: 0.6, sfx: 0.8, vibration: true, quality: 'high', showFps: false }
}
```

## 4. Global run state `SK.G` (owned by game.js)

```js
SK.G = {
  state: 'title',      // 'title'|'play'|'paused'|'levelup'|'evolve'|'dialog'|'transition'|'gameover'|'victory'
  t: 0,                // seconds of play this run
  biome: 0,            // index into SK.World.biomes
  biomeT: 0,           // seconds spent in the current biome
  player: Player,
  enemies: [],         // Monster[] with team 'enemy' (incl. passive nameables and bosses)
  allies: [],          // Monster[] with team 'ally'
  projectiles: [],     // owned by SK.Skills (player AND enemy projectiles)
  zones: [],           // owned by SK.Skills (ground effects: webs, mist, fire...)
  pickups: [],         // owned by SK.World
  boss: null,          // current boss Monster or null
  kills: 0, score: 0, soulsEarned: 0,
  nightmare: false,
  stats: { damageDealt: 0, absorbed: 0, named: 0, maxCombo: 0 },
  combo: 0, comboT: 0,
}
```

### Player (created by `SK.Game`)

```js
{
  x, y, vx, vy, r: 22, facing: 0 /*radians*/, team: 'player',
  charName, race /*SK.Character race id*/, cls /*class id*/, color /*custom body hex*/,
  hp, maxHp, mp, maxMp, level: 1, xp: 0, xpNext,
  stage: 0,                 // evolution 0..3
  stats: {                  // multipliers / flat values, mutated by cards, shop, evolution
    dmg: 1, speed: 1, cdr: 0 /*0..0.6*/, area: 1, magnet: 110 /*world px*/,
    armor: 0 /*flat dmg reduction*/, regen: 0 /*hp/s*/, crit: 0.05, critMul: 2,
    projSpeed: 1, amount: 0 /*extra projectiles*/, mpRegen: 4, luck: 1, xpMul: 1, soulMul: 1,
    lifesteal: 0 /*fraction of damage dealt healed*/, absorbMul: 1 /*Predatore radius*/,
    masteryMul: 1 /*mastery per essence*/, maxAllies: 6, allyDmg: 1, dashCdMul: 1,
  },
  perks: {},                // { [perkId]: true } class/race special rules (e.g. 'imperialAura')
  skills: {},               // { [skillId]: level } — all owned skills (auto, active, passive)
  mastery: {},              // { [skillId]: essences absorbed toward next level }
  slots: [null, null, null],// active skill ids bound to s1..s3
  cooldowns: {},            // { [skillId]: seconds remaining } — managed by SK.Skills
  skillState: {},           // { [skillId]: any } — private per-skill runtime state for SK.Skills
  invuln: 0, dashCd: 0, dashT: 0, absorbing: false, absorbT: 0,
  hurtT: 0, expression: 'idle', body: SlimeBody, revives: 0, dead: false,
}
```

### Monster (created by `SK.Enemies.spawn`)

```js
{
  id, type /*typeId*/, def /*SK.Enemies.types[type]*/, team: 'enemy'|'ally',
  x, y, vx, vy, r, hp, maxHp, dmg, speed, mass,
  elite: false, boss: false,
  passive: false,     // wandering nameable monster: does not attack, not auto-targeted
  nameable: false, name: null, evolved: false,
  status: { slow: 0, slowAmt: 0, burn: 0, burnDps: 0, poison: 0, poisonDps: 0, stun: 0 },
  hitFlash: 0, knockX: 0, knockY: 0, t: 0, ai: {}, dead: false,
  xp, essence /*skillId|null*/, scale: 1,
}
```

## 5. Module APIs

### 5.1 SK.Audio (audio.js)

* `init()` — create AudioContext lazily; safe to call many times; called on
  first user gesture by main.js. All other calls must be no-ops before init.
* `sfx(name, opts?)` — `opts: {vol, pitch, pan}`. Names (all must exist):
  `hit, crit, kill, hurt, heal, pickup, xp, levelup, dash, water, fire,
  thunder, poison, web, sonic, needle, slash, magma, spirit, meteor, howl,
  gluttony, absorbStart, absorb, skillGet, evolve, bossRoar, bossDie, explosion,
  shield, name, chest, coin, warning, portal, ui, uiBack, select, gameover,
  victory, oracle, combo`. Must rate-limit identical sounds (e.g. ≥30 ms apart,
  max ~8 voices of the same name) so 200 hits per second don't clip.
* `music(track)` — tracks: `'title','cave','forest','volcano','demon','boss',
  'finalboss','victory', null` (stop). Procedural, looping, crossfades ~1 s,
  look-ahead scheduler (setInterval ~25 ms + `currentTime` scheduling).
* `setVolumes(music, sfx)` (0..1), `suspend()`, `resume()`,
  `duck(amount, seconds)` (temporarily lower music, e.g. for oracle/evolution).

### 5.2 SK.FX (fx.js)

World-space effects (drawn inside camera transform) unless noted.

* `glowSprite(color, radius) -> HTMLCanvasElement` (cached by key; draw centered
  with `ctx.drawImage(spr, x - spr.width/2, y - spr.height/2)`).
* `drawGlow(ctx, x, y, radius, color, alpha)` — convenience: additive glow.
* `burst(x, y, opts)` — opts `{count=12, color|colors, speed=[60,220],
  life=[0.3,0.8], size=[2,5], gravity=0, drag=2, glow=false,
  shape:'circle'|'spark'|'square'|'star'|'drop'|'ring', spread=TAU, angle=0,
  shrink=true}`.
* `spark(x, y, angle, opts)` — single directional streak.
* `ring(x, y, opts)` — expanding shockwave `{radius=80, color, life=0.4,
  width=6, fill=false}`.
* `text(x, y, str, opts)` — floating damage/info number `{color='#fff',
  size=16, crit=false, life=0.8, rise=40}` (crit = bigger, yellow, pop).
* `lightning(x1, y1, x2, y2, opts)` — jagged bolt `{color='#b388ff', width=3,
  life=0.25, branches=2}`.
* `slash(x, y, angle, opts)` — crescent arc `{radius=60, arc=2.2, color,
  life=0.2, width=10}`.
* `trail(entity, color, size)` — optional afterimage helper (spawns fading
  ghost circles).
* `flash(color, alpha, duration)` — full-screen flash (screen space).
* `vignette(color, alpha, duration)` — e.g. red when hurt.
* `ambient(biome, dt)` — spawn biome ambient particles around the camera
  (`biome` is a `SK.World.biomes[i]` object; use `biome.ambient`:
  `'motes'|'fireflies'|'embers'|'souls'`, colors from `biome.palette`).
* `clear()` — remove everything (new run).
* `update(dt)`, `render(ctx)` (world space, after entities),
  `renderScreen(ctx)` (screen space: flashes, vignettes, low-HP pulse, color
  grading; reads `SK.G.player` hp ratio to pulse red when <30%).
* `count()` — live particle count (debug).

### 5.3 SK.Slime (slime.js)

* `createBody(radius) -> SlimeBody` — soft body (ring of ~16 verlet points with
  springs + pressure) used for jelly squash/stretch and wobble.
* `updateBody(body, x, y, vx, vy, dt, opts)` — opts `{absorbing, hurt, dash,
  stage, landing}`; impulses: `poke(body, angle, strength)` for hits.
* `render(ctx, ent, opts)` — draws a slime at `ent.x, ent.y` with
  `ent.body` if present (else a procedural blob). opts `{stage=0, palette,
  facing, expression:'idle'|'happy'|'angry'|'hurt'|'eat'|'focus',
  absorbing=false, absorbT=0, alpha=1, scale=1, t, flash=0}`. Includes: drop
  shadow, translucent gelatin body with gradient + rim light + specular
  highlight, inner core glow, cute expressive eyes (blink, look toward facing,
  pupils dilate when absorbing), mouth that opens into a swirling vortex when
  absorbing, per-stage cosmetics (stage1 inner crystal core + orbiting motes,
  stage2 small horns + golden eyes + dark aura, stage3 crown + ethereal wings +
  rotating rune rings).
* `palettes` — array indexed by stage `{body, light, dark, core, eye, aura}`
  plus extra named palettes for wild slime enemies (`palettes.wild`,
  `palettes.ally`).
* `renderPortrait(ctx, x, y, size, stage, t)` — standalone (screen space) for
  title screen / menus / evolution cut-in. No body object needed.
* `stageNames` — `['Slime', 'Slime Primordiale', 'Slime Demoniaco', 'Sovrano Slime']`.
* `opts.color` (custom hex from the character creator) recolors the body
  (derive light/dark/core shades from it); `opts.crown` forces the stage-3
  crown (used by the mythic class).

### 5.4 SK.Skills (skills.js)

Owns all skill definitions, the projectile system (`SK.G.projectiles`) and
ground zones (`SK.G.zones`) for both teams.

* `defs` — `{ [skillId]: SkillDef }`:
  ```js
  { id, name, desc /* short Italian */, kind: 'auto'|'active'|'passive',
    element: 'water'|'sound'|'web'|'fire'|'poison'|'earth'|'shadow'|'nature'|'storm'|'spirit'|'beast'|'void'|'physical',
    color, maxLevel /*5 for auto/passive, 5 for active*/, source /*enemyTypeId*/,
    levelDesc(level) -> string /* what the NEXT level adds, Italian */,
    cooldown(level, player) -> seconds, mpCost /*active only*/,
    drawIcon(ctx, x, y, size, t)  /* procedural icon, screen space, used by HUD & menus */ }
  ```
  Required skill ids (exactly these):
  * auto: `water_blade` (starting skill, homing spinning water crescents at
    nearest enemy), `sonic_wave` (periodic expanding ring, knockback),
    `sticky_web` (shoots webs that leave slowing zones), `needle_storm` (rapid
    bursts of stingers), `thorn_ring` (orbiting thorny vines), `magma_orb`
    (orbiting fireballs), `cleave` (periodic big melee arc slash in facing
    direction), `poison_mist` (drops toxic clouds), `spirit_orbs` (homing ghost
    wisps), `fire_breath` (periodic flame cone toward nearest enemy, burn),
    `meteor` (meteors crash on random enemies on screen).
  * passive: `regen` (hp regen), `body_armor` (armor + periodic shield that
    absorbs one hit), `shadow_step` (dash leaves damaging shadow trail, shorter
    dash cooldown, i-frames).
  * active (bound to slots, cost MP): `black_lightning` (chain lightning
    storm, huge damage), `wolf_howl` (summon 3+ spectral wolves for 10 s),
    `gluttony` (giant devouring vortex: pulls enemies in, heavy damage, kills
    heal the player and are counted as absorbed).
* `ownedAuto(player)` etc. are optional helpers.
* `update(G, dt)` — tick cooldowns, fire every owned `auto` skill, apply
  passives, update projectiles/zones, collide projectiles with targets (team
  aware) using `SK.combat.query`, call `SK.combat.damage` / `SK.combat.damagePlayer`.
* `cast(G, player, slotIndex) -> boolean` — try to cast the active skill bound
  to that slot (checks cooldown & MP, deducts MP, starts cooldown).
* `onDash(G, player)` — hook called by game.js when the player dashes
  (shadow_step uses it).
* `onPlayerHit(G, player, amount) -> amount` — passives can reduce/absorb
  damage (body_armor shield). Return the final amount.
* `spawnProjectile(opts) -> proj` — generic; opts `{x, y, vx, vy, r, dmg, team:
  'player'|'enemy', element, life, pierce=0, homing=0, kind /*render style:
  'water','needle','web','fire','magma','spirit','shadow','orb','rock','bolt',
  'dark'*/, color, knock=120, status /*{type, dur, power}*/, onHit, onExpire}`.
  Enemy attacks use this with `team: 'enemy'` (hits player and allies).
* `spawnZone(opts) -> zone` — `{x, y, r, life, team, kind:'web'|'mist'|'fire'|
  'shadow'|'vortex'|'warning', dps, slow, status, color, pull}`. `'warning'` is a
  non-damaging telegraph circle that enemies/bosses use before an attack
  (`opts.onEnd` callback when it expires).
* `render(ctx, G)` — draw zones (under entities) is `renderZones(ctx, G)`;
  projectiles `render(ctx, G)` (above entities).
* `cooldownRatio(player, skillId) -> 0..1` (1 = ready) for HUD.

### 5.5 SK.Enemies (enemies.js)

* `types` — `{ [typeId]: TypeDef }`:
  ```js
  { id, name /*Italian*/, desc, biome: 'cave'|'forest'|'volcano'|'demon',
    hp, speed, dmg, r, mass, xp, essence /*skillId|null*/, color,
    behavior: 'chase'|'swoop'|'ranged'|'charge'|'tank'|'swarm'|'blink'|'boss',
    nameable /*can spawn as passive wanderer*/, allyName /*evolved form name when named*/,
    boss /*bool*/, souls /*meta reward on kill*/,
    draw(ctx, m, t) /* draws the monster centered at 0,0 facing +x, unit scale = m.r */ }
  ```
  Required type ids:
  * cave: `bat` (essence sonic_wave), `cave_spider` (sticky_web),
    `wild_slime` (regen), `rock_crab` (body_armor); boss `abyss_serpent`
    ("Serpe Nera degli Abissi", essence `black_lightning`).
  * forest: `dire_wolf` (shadow_step), `goblin` (null; often nameable),
    `killer_hornet` (needle_storm), `treant` (thorn_ring), `toxic_shroom`
    (poison_mist); boss `alpha_wolf` ("Lupo Alfa della Luna Cremisi", essence
    `wolf_howl`).
  * volcano: `salamander` (fire_breath), `magma_golem` (magma_orb),
    `orc_warrior` (cleave), `fire_imp` (meteor); boss `orc_tyrant` ("Tiranno
    degli Orchi", essence `gluttony`).
  * demon: `specter` (spirit_orbs), `demon_knight` (null), `gargoyle` (null),
    `dark_mage` (null) — null-essence monsters in this biome drop an essence of
    a random skill the player already owns (handled by game.js); final boss
    `demon_lord` ("Re Demone Caduto", essence null).
* `spawn(G, typeId, x, y, opts?) -> Monster` — opts `{elite, passive,
  nameable, hpMul, dmgMul}`; pushes to `G.enemies`; elites are bigger, golden
  outline, ×4 hp, drop a chest.
* `spawnBoss(G, typeId) -> Monster` — spawns near the player off-screen with an
  entrance; sets `G.boss`. Bosses have ≥3 attack patterns using telegraphed
  `SK.Skills.spawnZone({kind:'warning'})` + projectiles + minion summons, and
  an enraged phase under 50% hp. `m.def.name` is shown by the HUD boss bar.
* `makeAlly(G, monster, name)` — moves it from `G.enemies` to `G.allies`,
  `team='ally'`, `passive=false`, `name=name`, `evolved=true` (bigger, stronger,
  aura, ×3 hp, full heal). Allies follow the player, attack nearby enemies
  (melee contact or type-specific), respawn 20 s after "fainting" (hp 0) next
  to the player. Max allies enforced by game.js (`player.stats.maxAllies`).
  Ally damage × `player.stats.allyDmg`. **Generic allies:** if an ally's
  `def.attack(G, m, target, dt)` exists, call it instead of contact damage
  (used by SK.Nation companions, which push their own monster-shaped objects
  into `G.allies` with a custom `def` that has `draw`, `attack`, `name`).
  Allies with `m.companion === true` never despawn and use `def.draw`.
* `update(G, dt)` — AI for enemies and allies, steering + separation, contact
  damage (`SK.combat.damagePlayer` for enemies touching the player,
  `SK.combat.damage` for enemies touching allies and vice versa with per-pair
  cooldown), status ticking via `SK.combat.tickStatus(m, dt)`, knockback decay,
  boss patterns. Do NOT remove dead monsters — game.js does.
* `render(ctx, G)` — draws all enemies and allies (cull with `SK.cam.inView`):
  soft shadow, body via `def.draw`, hit flash (white), status tints (burn
  orange flicker, poison green bubbles, slow blue frost, stun stars), elite
  aura, passive wanderer "!" sparkle + "?" bubble, ally name labels and green
  ring, small hp bar when damaged (not for bosses — HUD draws those).
* `renderPortrait(ctx, typeId, x, y, size, t)` — screen-space portrait for the
  bestiary.

### 5.6 SK.World (world.js)

* `biomes` — array of 4:
  ```js
  { id: 'cave'|'forest'|'volcano'|'demon', name, subtitle, music, boss /*typeId*/,
    duration /*seconds before boss*/, enemies: [{type, weight, from /*biomeT sec*/}],
    palette: { bg, ground, ground2, accent, fog, light, ambient: [colors] },
    ambient: 'motes'|'fireflies'|'embers'|'souls', radius /*arena radius*/ }
  ```
  Names: "Caverna Sigillata", "Foresta di Smeraldo", "Vulcano Cremisi",
  "Cittadella dei Demoni".
* `startBiome(G, index)` — reset arena, generate decor (seeded), set
  `G.biome`, `G.biomeT=0`, place player at center, start music, show banner via
  `SK.UI.banner`.
* `update(G, dt)` — wave director (spawn rate & composition scale with
  `biomeT`, `G.t`, nightmare), spawn off-screen ring around the camera,
  periodic elite spawns, passive nameable wanderers (goblins often in forest),
  boss warning (`SK.UI.banner` + `SK.Audio.sfx('warning')`) then
  `SK.Enemies.spawnBoss` when `biomeT >= duration`, pause regular spawns during
  boss (allow small trickle), clamp entities inside the arena circle, pickups
  physics (magnet toward player within `player.stats.magnet`; **essences are
  only pulled by the Predatore vortex** when `player.absorbing` within
  `absorbRadius` = 230 × `stats.area`, otherwise they bob and fade after 14 s),
  portal after boss death.
* `spawnPickup(G, kind, x, y, opts) -> pickup` — kinds `'xp'` (`opts.value`;
  visual tier by value: blue/green/red/rainbow crystals), `'essence'`
  (`opts.skillId`, `opts.from` typeId; colored by skill, shows skill icon),
  `'heart'`, `'magicule'` (mana), `'chest'`, `'soul'`. On collect it calls
  `SK.Game.onPickup(pickup)` and removes it.
* Pickup shape: `{id, kind, x, y, vx, vy, value, skillId, from, t /*age*/, life, dead}`.
* `dropLoot(G, monster)` — called by game.js on kill (essence skill id =
  `SK.Game.essenceFor(monster)`, which returns `monster.essence` or, for
  null-essence demon monsters, a random owned skill, or null): xp crystals (merge
  values), essence if `monster.essence` (chance: 100% boss, 35% normal, 100%
  elite), occasional heart/magicule, chest for elites, souls.
* `spawnPortal(G, x, y)` — glowing portal; when the player enters it calls
  `SK.Game.nextBiome()`.
* `renderBackground(ctx, G)` — ground (procedural tiles/noise patches cached
  into an offscreen canvas per biome), decor under entities (crystals, roots,
  lava cracks, runes), arena boundary.
* `renderPickups(ctx, G)`, `renderForeground(ctx, G)` (tall decor tops, fog,
  light shafts, the portal), `minimapData(G)` optional.
* `clamp(ent)` keep inside arena.

### 5.7 SK.UI (ui.js + css/style.css)

DOM overlay `#ui` for menus, canvas for HUD.

* `init()` — build DOM screens; called once by main.js.
* `show(screen, data?)` / `hide(screen)` — screens: `'title'` (animated title
  over the canvas: big logo "SLIME REBORN" + "L'Ascesa del Predatore", buttons
  Gioca (→ `SK.Character.openCreator(cfg => SK.Game.newRun(cfg))`) /
  Nazione (→ `SK.Nation.open()`) / Negozio / Bestiario / Abilità /
  Impostazioni / Crediti, souls
  counter, best record; slime portrait animation behind via canvas),
  `'shop'`, `'bestiary'`, `'skills'` (skill codex from `SK.save.data.skillsFound`),
  `'settings'`, `'credits'`, `'pause'` (Riprendi / Impostazioni / Abbandona),
  `'gameover'` (stats + souls earned + Riprova / Menu), `'victory'`.
  While any blocking screen is visible set `SK.input.enabled = false`.
* `levelUp(choices, onPick)` — show 3 (or 4) animated cards; choice objects
  from game.js: `{id, title, desc, rarity:'comune'|'raro'|'epico'|'leggendario',
  icon: {skillId}|{stat}, tag /* 'NUOVO'|'Lv 3' etc */}`. Supports keyboard
  1/2/3 and tap. Cards flip in with stagger; rarity glows.
* `oracle(text, opts?)` — the "Oracolo" voice (the slime's analytical inner
  voice). Top-center panel `《Oracolo》` with typewriter text, queued, auto
  hide; `opts.important` = bigger/gold.
* `banner(title, subtitle, opts?)` — big cinematic center text (biome intro,
  "ATTENZIONE: BOSS", "EVOLUZIONE!"); `opts.color`, `opts.duration`.
* `toast(text, color)` — small transient line (e.g. "+1 Anima").
* `namingDialog(monster, suggestedName, onConfirm, onCancel)` — modal: monster
  portrait, editable text input pre-filled, "Rinomina" dice button generating a
  new name via `SK.Game.randomName()`, confirm "Dai il Nome". Mobile friendly.
* `renderHUD(ctx, G)` — screen space, canvas: HP bar (gel style, red/pink,
  smooth lag bar), MP bar (blue), XP bar (full-width thin bottom/top with level
  badge), stage name, timer, kill counter, combo meter, biome progress /
  boss timer, boss HP bar (big, with name & phase), ally portraits w/ hp,
  floating joystick (`SK.input.joy`), touch buttons from `SK.input.buttons`
  with skill icons (`SK.Skills.defs[id].drawIcon`), cooldown sweeps
  (`SK.Skills.cooldownRatio`), MP insufficient tint, locked slots, "Predatore"
  button pulsing when essences are near (`G.player.absorbHint`), owned
  auto/passive skills row with levels, FPS when `settings.showFps`.
* `update(dt)` — internal animations.

### 5.8 SK.Game & SK.combat (game.js)

* `SK.Game.init()` (called once by main.js after `SK.UI.init()`: sets
  `SK.G.state='title'`, shows the title screen, starts title music on first
  gesture), `SK.Game.newRun(cfg?)` (cfg = `{name, race, cls, color}`; default
  `SK.save.data.character`; builds the player, then applies in order: base
  stats → `SK.Character.applyRace(player)` → `SK.Character.applyClass(player)`
  → shop upgrades → `SK.Nation.applyBonuses(player)`; after `startBiome` calls
  `SK.Nation.spawnCompanions(G)`), `update(dt, rawDt)`, `render(ctx)`, `pause()`,
  `resume()`, `quitToTitle()`, `nextBiome()`, `onPickup(pickup)`,
  `onBossDefeated(boss)`, `randomName() -> string` (syllable generator, Italian/
  fantasy flavor), `tryName(monster)`, `grantSkill(skillId, opts)` (acquire or
  level), `gainXp(amount)`, `botUpdate(dt)` (autoplay bot when
  `SK.debug.autoplay`).
* Update order in `update(dt)` during `'play'`:
  `World.update → player update (movement, dash, absorb, regen, mp) →
  Skills.update → Enemies.update → remove dead + loot → FX.update → UI.update →
  cam.follow`.
* Render order in `render(ctx)`: clear → `cam.begin` →
  `World.renderBackground` → `Skills.renderZones` → `World.renderPickups` →
  `Enemies.render` → player (`SK.Character.renderPlayer(ctx, player, opts)`,
which delegates to `SK.Slime.render` for the slime race) → `Skills.render` →
  `FX.render` → `World.renderForeground` → `cam.end` → `FX.renderScreen` →
  `UI.renderHUD`. In `'title'` state render an animated attract background
  (World background of a random biome slowly panning + slime portrait +
  ambient FX).
* `SK.combat`:
  * `damage(target, amount, opts) -> dealt` — opts `{source, element, crit
    (bool|undefined = roll with player stats when source is player/ally/
    playerSkill), knock /*px*/, kx, ky /*direction*/, silent, status}` — applies
    `player.stats.dmg`, crits, hit flash, knockback (mass aware), damage number
    via `SK.FX.text`, sfx (rate limited), hitstop on crit/big hits, combo
    counter, kill handling (`kill(target, opts)`).
  * `damagePlayer(amount, source) -> dealt` — armor, `SK.Skills.onPlayerHit`,
    invulnerability frames (0.6 s), godmode, hurt vignette, camera shake,
    vibration, `Slime.poke`, death → revive or game over.
  * `kill(m, opts)` — marks dead, stats, bestiary, `SK.World.dropLoot`,
    burst FX, combo, boss → `onBossDefeated`.
  * `heal(target, amount)`, `applyStatus(target, type, dur, power)` (types
    `'burn','poison','slow','stun'`), `tickStatus(m, dt)` (dot damage).
  * `query(x, y, r, fn, team='enemy')` — spatial-hash query of monsters of a
    team (`'enemy'` excludes passive wanderers unless `opts.includePassive`)
    within radius; calls `fn(m)`. The hash is rebuilt once per frame by game.js.
  * `nearest(x, y, maxDist, team='enemy') -> Monster|null`.
* Progression rules:
  * XP curve `xpNext = round(5 + level*4.5 + level^1.7)`.
  * Evolution at levels 8, 18, 30 → stages 1, 2, 3: cinematic (state
    `'evolve'`, slow-mo, darken, cocoon of light, `SK.UI.banner('EVOLUZIONE!')`,
    oracle text, shockwave that damages everything on screen, full heal, big
    stat boosts, `SK.Audio.sfx('evolve')`).
  * Predatore (hold `absorb`): slime opens a vortex mouth; pulls essences/xp in
    `absorbRadius`; monsters below 15% hp (non-boss) inside 70% of the radius
    are devoured (killed, count as absorbed, small heal); move speed ×0.55.
    Absorbing an essence of an unknown skill → acquires it (oracle:
    "《Analisi completata. Abilità acquisita: X》"), known skill → +1 mastery;
    every 4 mastery → +1 skill level. Boss essences grant the active skill and
    auto-bind it to a free slot.
  * Naming: passive nameable wanderers near the player (< 110 px) show the
    `name` button; naming costs 40% of max MP, opens `SK.UI.namingDialog`,
    then `SK.Enemies.makeAlly`. Max 6 allies. Oracle comments.
  * Level-up choices: 3 cards (4 with luck) mixing new-level upgrades for owned
    skills and stat cards (`dmg`, `maxHp`, `speed`, `cdr`, `area`, `magnet`,
    `crit`, `regen`, `mpRegen`, `amount`) with rarity rolls; fallback "Pozione
    di Gelatina" heal.
  * Souls: per kill `def.souls` (default 0, elites 2, bosses 25), ×
    `stats.soulMul`; saved at run end.
  * Shop upgrades (ids) owned by game.js & displayed by ui.js via
    `SK.Game.shopItems` — `[{id, name, desc, maxLevel, cost(level), apply(player, level)}]`:
    `vitality, power, agility, magicule, greed, magnet, revive, wisdom,
    armor, luck`.
  * Achievements optional (`SK.Game.achievements` list), shown by ui.js.

### 5.9 SK.Character (character.js + css/character.css)

Character creation: name, race, class, color — plus per-race evolution lines.

* `races` — `{ [raceId]: { id, name, desc, stages: [4 Italian stage names],
  bonusDesc, startSkill, colors: [default swatches], apply(player) } }`.
  Required races (each with a distinct look and 4 evolution stages):
  * `slime` — Slime → Slime Primordiale → Slime Demoniaco → Sovrano Slime.
    Predatore radius +30%, +1 hp/s regen. Start skill `water_blade`.
  * `oni` — Giovane Oni → Oni Guerriero → Signore Oni → Divinità Oni. +25%
    damage, −8% speed, start `cleave` (+`water_blade` is NOT given).
  * `wolf` — Cucciolo d'Ombra → Lupo Tempesta → Lupo Celeste → Re dei Lupi
    Divini. +20% speed, dash cooldown −35%, start `shadow_step` + `needle_storm`.
  * `dragon` — Cucciolo di Drago → Viverna → Drago Antico → Drago
    Primordiale. +35% max HP, +2 armor, start `fire_breath`.
  * `vampire` — Novizio della Notte → Vampiro → Signore Vampiro →
    Progenitore. 6% lifesteal, start `spirit_orbs`.
* `classes` — `{ [classId]: { id, name, rarity, desc, perksDesc: [..], apply(player) } }`:
  * `predatore` — Predatore: Predatore radius +40%, mastery ×2.
  * `guerriero` — Guerriero: +30% max HP, +2 armor, +1 `cleave` level (grants it).
  * `arcimago` — Arcimago: +25% area, −15% cooldowns, +30 max MP, +3 MP/s.
  * `evocatore` — Evocatore: +3 max allies, allies +60% damage, starts with
    `wolf_howl` bound to slot 1.
  * `pierfrancesco` — **"Pierfrancesco Del Bagno"**, rarity `'mitico'`,
    title "L'Imperatore Infinito". The most broken class in the game, a
    personal tribute: ×3 damage, ×3 max HP, +50% speed, cdr 0.5, crit 0.5,
    critMul 3, xpMul 2, soulMul 3, 3 revives, absorbMul 2, masteryMul 4,
    maxAllies +6, all three slots pre-filled (`black_lightning`, `wolf_howl`,
    `gluttony` at Lv 1), perks `imperialAura` (golden aura: continuous damage
    in 190 px × area and enemies inside are slowed; game.js implements via
    `SK.combat` every 0.25 s) and `imperialJudgement` (every 18 s a
    screen-wide golden judgement nuke: `SK.FX.flash('#ffd54f')`, big ring,
    damage to all enemies in view = 40 × level × dmg; bosses take 25%). Starts
    at evolution stage 1 and always wears a crown + golden/violet palette
    tint. Card in the creator has an animated golden holographic frame.
* `applyRace(player)`, `applyClass(player)` — mutate stats/skills/slots/perks.
* `stageName(player) -> string`.
* `renderPlayer(ctx, player, opts)` — world space; for `slime` delegate to
  `SK.Slime.render(ctx, player, {...opts, color: player.color, crown})`; for
  other races draw an animated procedural top-down creature in the custom
  color whose look changes per `player.stage` (oni: horns grow, armor, flaming
  hair at stage 3; wolf: mane, lightning stripes, starry fur, divine halo;
  dragon: wings appear at stage 1 and grow, flame breath idle embers; vampire:
  cape, bat wings, blood-moon aura). Must handle `opts.absorbing` (a dark
  vortex at the mouth), `opts.flash`, `opts.alpha`, dash stretch via
  `player.dashT`, hurt shake via `player.hurtT`. Bobbing walk animation from
  speed.
* `renderPortrait(ctx, x, y, size, raceId, stage, color, t)` — screen space.
* `openCreator(onStart)` — full-screen DOM creator (inside `#ui`): name text
  input (prefilled from save, "🎲" random via `SK.Game.randomName()`), race
  carousel with a live animated preview canvas, the 4 evolution stage names
  listed, class cards (the mythic one stands out), color swatches + hue
  slider, summary of bonuses, big "INIZIA L'AVVENTURA" button → saves to
  `SK.save.data.character` and calls `onStart(cfg)`; "Indietro" →
  `SK.UI.show('title')`. Sets `SK.input.enabled=false` while open.

### 5.10 SK.Nation (nation.js + css/nation.css)

The meta hub "La Tua Nazione" — a non-explicit, PG-13 romance & nation
system. **No sexual content anywhere** — romance is dialogue, gifts, dates,
weddings and fireworks only.

* `companions` — 6 original characters, each `{ id, name, race, title, bio,
  color, unlock: {boss: bossTypeId} | {souls: n}, spouseBonus: {stat,
  value, label}, likes: [giftIds], lines: {...}, drawPortrait(ctx, x, y,
  size, t, mood) , combat: {kind, ...} }`:
  * `aurelia` — Oni guerriera dai capelli cremisi (freed by beating
    `orc_tyrant`) — bonus +15% damage.
  * `nerissa` — fanciulla naga dei mari profondi (freed by `abyss_serpent`) —
    bonus +2 hp/s regen.
  * `kiara` — kitsune a nove code (freed by `alpha_wolf`) — +12% speed, +20% luck.
  * `morgana` — regina vampira (freed by `demon_lord`) — +5% lifesteal.
  * `lyra` — arciera elfa (unlock 150 souls) — +1 projectile (`amount`).
  * `selene` — maga elfa oscura (unlock 250 souls) — −10% cooldowns, +20 MP.
* `open()` — DOM hub screen: animated night-sky village banner, citizens list
  (`SK.save.data.nation.citizens`), companion cards with procedural portrait
  canvases and heart meters (0–10). Per companion: Parla (free once per run,
  +1 heart, random line by affinity tier), Regalo (gift shop: flowers,
  jewels, sweets, books… cost souls, +1..+3 hearts by `likes`), Appuntamento
  (dates: "Passeggiata al lago di luna", "Cena alla taverna", "Allenamento
  all'alba", "Festival delle lanterne" — short visual-novel scene with
  portrait, typewriter dialogue, 2 choices with different affinity results),
  Porta in battaglia (set `activeCompanion`, needs ≥3 hearts), Anello
  (buy "Anello di Magicule" for 300 souls) and Proponi (10 hearts + a ring →
  wedding cutscene: petals, fireworks canvas, vows dialogue, "Sposati!"
  banner). **Multiple spouses are allowed**; on each new wedding existing
  spouses comment (light, funny, supportive). Married companions show a ring
  icon. Unlocking boss companions: `SK.Nation.onBossDefeated(bossTypeId)`
  (called by game.js) → first time shows an oracle message "X si è unita
  alla tua Nazione!".
* `onNamed(name, typeId)` — game.js calls it when a monster is named; adds
  to `citizens` (cap 60).
* `applyBonuses(player)` — each married companion's spouseBonus applied to
  `player.stats` (+ for `regen`, `amount`, `mpMax` etc.).
* `spawnCompanions(G)` — spawns the active companion (if any, ≥3 hearts) as
  an ally object in `G.allies` with `companion: true`, a custom `def` (`{name,
  draw(ctx, m, t), attack(G, m, target, dt)}`): humanoid chibi top-down
  fighter in her color with a signature attack (aurelia: flaming sword
  slashes; nerissa: water spears; kiara: fox-fire orbs; morgana: blood bats;
  lyra: piercing arrows; selene: dark star bolts) using
  `SK.Skills.spawnProjectile` / `SK.combat.damage`. Spouses deal +50% damage.
  Stats scale with affinity.
* `runBonusesText() -> string[]` for the creator/title summary.

### 5.11 Android bridge & misc globals

* game.js defines `window.SKBack = () => boolean` — called by the Android back
  button: closes the top DOM sub-screen / pauses the run / returns `false` on
  the title screen (the app then goes to background).
* `window.SKNative.vibrate(ms)` may exist (Android `addJavascriptInterface`).
* `#rotate-hint` (shown via CSS media query in portrait) and `#boot-error`
  are styled in style.css.
* game.js sets `G.player.absorbHint` (bool: essences or devourable monsters
  within the absorb radius) and the `name` button visibility each frame;
  HUD reads `G.player.slots[i]` to draw the s1..s3 icons.

## 6. Visual direction

Dark, saturated "neon fantasy": deep backgrounds, luminous gelatinous slime,
additive glows, lots of juicy feedback (squash & stretch, hit flashes,
screen shake, hitstop, particles on everything, damage numbers, combo
counter). Palette per biome: cave = indigo/teal crystals, forest = emerald
with gold fireflies, volcano = black rock + orange/crimson lava, demon = violet
and blood red. The slime is azure/cyan at stage 0.

## 7. Testing hooks

* `?debug&autoplay&speed=4` must run a full unattended session without errors:
  the bot auto-starts a run, moves, absorbs, casts, picks the first level-up
  card, names monsters with the suggested name, enters portals, and restarts
  after game over.
* `tools/smoke-test.mjs` (Playwright) loads the page, runs autoplay, fails on
  any `pageerror`/`console.error`, saves screenshots.
