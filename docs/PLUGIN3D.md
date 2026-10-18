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
