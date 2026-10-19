# Terre Spezzate 3D — plugin API (window.SK3D)

`web/js3d/game3d.js` is the engine (Three.js r160 classic script, `THREE` global). Feature modules live in their own
files, loaded after it in `web/3d.html`, and register with `SK3D.register({ id, init(API), populate(), update(dt), ... })`.
Never edit game3d.js — use the hooks. Read game3d.js for exact behaviour when unsure.

## Hooks (all optional)
- `init(API)` once at registration; `populate()` at start and every time the world respawns (resting at a grace, dying).
  Remove/re-create your own entities there if needed (enemies in `API.enemies` are cleared by the engine before populate).
- `update(dt)` every frame while `API.state === 'play'` (after player/enemies update).
- `interactables()` → `[{ x, z, r, label, action }]`; the engine shows the nearest one in range as the tap-able prompt
  (also key E) and calls `action()`.
- `onKill(e, absorbed, runesGained)` when an enemy dies (`absorbed` = devoured by Predatore).
- `onHurt(dmg, fromX, fromZ)` → return modified damage taken by the player (passives).
- `onMelee(baseDamage, atk)` → return modified melee damage.
- `API.castSkill = () => {}` — if set, the "skill" button (key F) calls it instead of the built-in Black Lightning.

## Useful API members
State: `P` (player: x,z,y (jump height), rot, vx,vz, hp,maxHp, fp,maxFp, st,maxSt, dmg, form, atk, roll, iframe, absorb, dead),
`S` (persistent save; add your own keys, then `saveS()`), `enemies` (array; enemy fields: type, d (TYPES def), model, x,z,y, rot, hp, maxHp,
engaged, dead, passive, stagger, flash, vx,vz, phase, t, wander), `state` (get/set: 'play' | 'menu' | 'dead'; set 'menu' to freeze the game
while a dialog is open, set back to 'play' to resume), `main` (2D save: `main.nation`, `main.souls`), `ch` (character: name, race, cls, color),
`mythic` (user's broken class), `quality`.
World: `scene, camera, renderer, T` (THREE), `heightAt(x,z)`, `regionAt(x,z)` → 'center'|'north'|'east'|'west', `REGIONS`, `LOC`,
`FLAT` (push `{x,z,r,h: heightAt(x,z)}` BEFORE terrain exists only — too late for plugins; instead place things on `heightAt`), `COLL` (push static
circle colliders `{x,z,r}` for the player), `MAPR` (720, map radius), `graceObjs`, `DAY` (`DAY.t` 0..1 day cycle).
Enemies: `TYPES` (add new types: `{ name, hp, r, speed, aggro, runes, poise?, boss?, build: () => model, attacks: [{ range, windup, active, recover,
dmg, reach, arc, lunge?, wave?, breath?, bolts?, daggers?, combo? }], update?(e, dt, API) → true to skip default AI }`), `spawn(type, x, z, opts)` →
enemy, model contract: `{ root: Group, g: Group (posed body), head?, legs?/legL.., animate?(e, dt, anim, wind, act, API) }`.
`hitEnemy(e, dmg, poiseDmg, kx, kz)`, `hitEnemyQuiet(e, dmg)`, `killEnemy(e, absorbed)`, `hurtPlayer(dmg, fromX, fromZ)`.
FX: `emit(x,y,z,n,color,{speed,up,grav,life,size,bright})` (HDR additive particles — values >1 bloom), `shockwave(x,z,maxR,dmg,color)`,
`bolt(x1,y1,z1,x2,y2,z2,color)`, `strikeAt(x,z,dmg,delay,fromBoss)`, `flashLight` (PointLight), `setShake(v)`, `setHitstop(v)`,
`hdr(hex, k)` (HDR colour for glow/bloom), `dot` (soft round texture), `pointMat(additive)`.
Model kit: `mesh(parent, geo, mat, x,y,z, rx,ry,rz, sx,sy,sz)`, `part(parent, mat, sx,sy,sz, x,y,z)` (box), `pivot(parent,x,y,z)`,
`cap(r,len)` capsule geo, `sph(r,w,h)`, `coneG(r,h,n)`, `BOX`, `std(color, rough, metal, extra)` MeshStandard flat-shaded, `lam(color)`,
`humanoid(kind 'goblin'|'knight'|'tyrant', scale)`, `wolfModel({fur,dark,eye})`, `dragonModel()`. Player models: `slime`, `body`, `human`, `wolfForm`;
forms: `FORM` / `FORM_NAMES` / `S.forms` / `transform()` (cycles unlocked forms).
UI: `toast(text)`, `bigMsg(text, 'place'|'gold'|'death', seconds)`, `sfx(name)` (names: hit crit kill hurt heal pickup levelup dash water fire thunder
poison web sonic needle slash magma spirit meteor howl gluttony absorbStart absorb skillGet evolve bossRoar bossDie explosion shield name chest coin
warning portal ui uiBack select gameover victory oracle combo), `music(track)`, `pressed(id)` (one-frame button edge), `addButton(id, html, right, bottom, r)`
(round touch button; press → `pressed(id)` true for one frame), `buttons` (existing: light heavy roll skill absorb flask lock run form),
`mapMarkers` / `compassMarkers` (push `{x, z, label, color}`), `SK3D.oracle(text, gold)` (Oracle panel, added by the HUD — guard if missing).
DOM: `#hud` overlay; append your own panels to `document.body` with inline/own `<style>`; use class `panel`/`box` from 3d.html for modal dialogs.

## v1 expansion contracts (shared by rpg3d / quests3d / metropolis3d / dungeon3d)
Additional engine hooks: `recalc(P, full)` (after base stats are computed, before refill — add equipment/level bonuses to
P.maxHp/maxFp/maxSt/dmg), `onSpawn(e)` (every spawned enemy — scale by level), `API.addGrace(x, z, name)` → index (new rest point),
`API.teleport(x, z)`, `API.lightPillar(x, z, color, life)`, `API.openGrace(i)`, `API.pocket` (set to
`{ contains(x,z) → bool, h, heightAt?(x,z) }` to create an off-map instanced area: heightAt and the map clamp honour it),
`API.abilities.register(id, def{name, icon, color, cost, cd, desc}, castFn(level) → false to cancel)` then `API.abilities.grant(id)`.
Event bus between modules: `SK.events.on(name, fn)` / `SK.events.emit(name, data)` with names `'3d:levelup' {level}`, `'3d:item' {item}`,
`'3d:talk' {npcId}`, `'3d:quest' {id, state}`, `'3d:floor' {floor}`, `'3d:enterCity'`, `'3d:kill' {type, level}`.

### World layout (fixed coordinates)
- METROPOLIS "Altheria, Città dei Mille Mondi": centre (0, 470), wall radius 125, gates N (0,345) S (0,595) E (125,470) W (-125,470).
  The player starts here on a new game (metropolis3d adds a grace "Piazza delle Mille Stelle" at (0, 470) and sets it as spawn).
  Reserved spots (keep them free of buildings; other modules place NPCs there):
  Plaza radius 28 around (0,470); Guild Hall entrance (30, 452) — building north-east of plaza (quests3d places receptionist +
  quest board in front of it at (30, 448)); Shops street west: weapons (-34, 456), armour (-34, 468), magic (-34, 480),
  potions (-34, 492), general (-22, 500) — metropolis3d builds the shop buildings and puts a shopkeeper NPC whose talk action calls
  `API.rpg && API.rpg.openShop(kind)` with kind 'weapons'|'armor'|'magic'|'potions'|'general'; Academy of Magic north (0, 395)
  (class trainer: `API.rpg.openTrainer()`); Royal Castle south (0, 560) (main-quest king NPC placed by quests3d at (0, 540));
  Cathedral east (60, 500); Arena west (-70, 520); Tavern (40, 485).
- TOWER "Torre dei Mille Piani" entrance outside the east gate at (175, 470) (dungeon3d builds the tower exterior & portal).
  Pocket area for floors: x,z in [3000, 3600].
- Existing: goblin village (-45,75), Valdoria (60,230) + other towns (towns3d), graces, bosses (tyrant arena (430,-230), dragon (-120,-590)).
  Avoid placing new things on them. Remove hostile enemies inside the metropolis in populate().

### RPG API (owned by rpg3d.js) — other modules must guard `if (API.rpg)`
`API.rpg = { level, xp, xpNext, gold (getter = S.runes), giveXP(n, x?, z?), giveGold(n), giveItem(itemOrId) → item, rollLoot(ilvl, boost?) → item,
dropLoot(x, z, ilvl, boost?) (spawns a world loot pickup), itemName(item), openShop(kind), openTrainer(), openInventory(), openCharacter(),
cls() → class id, classes, enemyLevel(e) }`. Currency = `S.runes` (shown as "anime").
