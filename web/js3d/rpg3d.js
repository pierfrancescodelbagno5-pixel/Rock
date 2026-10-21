/* Slime Reborn — Terre Spezzate 3D · rpg3d.js — the RPG core.
 * Character creation (classes), levels & experience to 99, attributes, enemy levels by region, class skills & basic magic,
 * procedural loot (rarities, affixes, Italian names, canvas icons), world loot pickups, inventory / equipment / status window,
 * shops and the Academy trainer. Provides API.rpg (see docs/PLUGIN3D.md "v1 expansion contracts").
 * Plugin for game3d.js — classic script, THREE global (r160). */
(function () {
  'use strict';
  const API = window.SK3D;
  if (!API) return;
  const T = window.THREE, SK = window.SK || {};
  const { P, S, scene, heightAt, rand, lerp, clamp, angDiff, TAU, std, hdr } = API;
  const LOW = API.quality === 'low', HIGH = API.quality === 'high';
  const $ = (id) => document.getElementById(id);
  const sfx = (n, o) => { try { API.sfx(n, o); } catch (e) { /* audio optional */ } };
  const oracle = (t, gold) => { try { if (typeof API.oracle === 'function') API.oracle(t, gold); else API.toast(t); } catch (e) { /* ignore */ } };
  const toast = (t) => { try { API.toast(t); } catch (e) { /* ignore */ } };
  const dmgNum = (x, y, z, v, cls) => { if (typeof API.dmgNum === 'function') API.dmgNum(x, y, z, v, cls); };
  const evt = (name, data) => { try { if (SK.events) SK.events.emit(name, data); } catch (e) { console.error(e); } };
  const fmt = (n) => Math.floor(n).toLocaleString('it-IT');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const METRO = { x: 0, z: 470, r: 125 };
  const KEY3D = 'slimeReborn.3d.v1';

  /* ================================================================ data: attributes, classes */
  const ATTR = [
    { k: 'FOR', n: 'Forza', d: 'Danni di spade e spadoni, vita' },
    { k: 'DES', n: 'Destrezza', d: 'Danni di archi e pugnali, critico, schivata, stamina' },
    { k: 'INT', n: 'Intelligenza', d: 'Danni di bastoni, tomi e incantesimi, FP' },
    { k: 'VIT', n: 'Vitalità', d: 'Vita massima, stamina' },
    { k: 'SAG', n: 'Saggezza', d: 'FP massimi, potere delle cure, rigenerazione FP' },
  ];
  const CLASSES = {
    guerriero: { n: 'Guerriero', t: 'Lama Indomita', icon: 'greatsword', color: '#e0523a', w: 'spadone', off: null, main: 'FOR',
      at: { FOR: 16, DES: 10, INT: 5, VIT: 15, SAG: 6 }, mul: { hp: 1.12, fp: 0.85, dmg: 1.05 },
      look: { coat: '#6e2620', trim: '#c9a24a', dark: '#2a2420', hat: 'helm' },
      desc: 'Evocato da un altro mondo con un corpo forgiato dalla battaglia. Brandisce uno spadone a due mani, travolge le schiere con il Turbine d\'Acciaio e scatena la Furia Cremisi.' },
    paladino: { n: 'Paladino', t: 'Scudo della Cattedrale', icon: 'shield', color: '#ffd36b', w: 'spada', off: 'scudo', main: 'FOR',
      at: { FOR: 13, DES: 8, INT: 7, VIT: 14, SAG: 13 }, mul: { hp: 1.15, fp: 1.05, dmg: 1 },
      look: { coat: '#e8e2d0', trim: '#e0b84a', dark: '#3a3a48', hat: 'circlet' },
      desc: 'Eroe convocato dal Rituale della Cattedrale. Spada e scudo, benedizioni che curano e una luce sacra che giudica i demoni.' },
    mago: { n: 'Mago Elementale', t: 'Erede dei Tre Elementi', icon: 'staff', color: '#5fb8ff', w: 'bastone', off: null, main: 'INT',
      at: { FOR: 5, DES: 8, INT: 18, VIT: 9, SAG: 14 }, mul: { hp: 0.92, fp: 1.35, dmg: 1 },
      look: { coat: '#1f3570', trim: '#8fd0ff', dark: '#151a30', hat: 'wizard' },
      desc: 'Reincarnato con un\'affinità innata a fuoco, ghiaccio e fulmine. Il suo bastone scaglia dardi arcani; i suoi incantesimi fanno piovere meteore.' },
    arciere: { n: 'Arciere', t: 'Occhio del Falco', icon: 'bow', color: '#7ed35a', w: 'arco', off: null, main: 'DES',
      at: { FOR: 8, DES: 18, INT: 7, VIT: 10, SAG: 8 }, mul: { hp: 0.96, fp: 1, dmg: 1 },
      look: { coat: '#2f5a2a', trim: '#b89a5a', dark: '#2a2218', hat: 'hood' },
      desc: 'Cacciatore delle foreste di confine. Frecce perforanti, piogge di dardi, trappole esplosive e uno spirito falco che non manca mai il bersaglio.' },
    assassino: { n: 'Assassino', t: 'Ombra Senza Nome', icon: 'daggers', color: '#b06bff', w: 'pugnali', off: null, main: 'DES',
      at: { FOR: 9, DES: 17, INT: 6, VIT: 9, SAG: 6 }, mul: { hp: 0.92, fp: 0.95, dmg: 1.05 }, crit: 0.08,
      look: { coat: '#1a1622', trim: '#8a6bff', dark: '#0c0a10', hat: 'mask' },
      desc: 'Membro di una gilda che non esiste. Pugnali gemelli, passi d\'ombra, veleni e furtività: i suoi colpi critici non lasciano testimoni.' },
    evocatore: { n: 'Evocatore', t: 'Custode dei Patti', icon: 'tome', color: '#c06bff', w: 'tomo', off: null, main: 'INT',
      at: { FOR: 5, DES: 7, INT: 15, VIT: 10, SAG: 16 }, mul: { hp: 0.94, fp: 1.3, dmg: 1 },
      look: { coat: '#3a1f52', trim: '#d0a0ff', dark: '#1a1024', hat: 'halo' },
      desc: 'Studioso di patti proibiti. Lega spiriti lupo, golem di pietra e legioni spettrali che combattono al suo fianco.' },
    slime: { n: 'Slime Predatore', t: 'Il Mostro più Debole', icon: 'slime', color: '#4fc3ff', w: null, off: null, main: 'ANY',
      at: { FOR: 11, DES: 11, INT: 11, VIT: 11, SAG: 11 }, mul: { hp: 1, fp: 1.05, dmg: 1 },
      look: null,
      desc: 'Reincarnato come il più debole dei mostri... con l\'abilità unica Predatore. Divora i nemici, analizza le loro abilità e le imita. Mimetismo: Slime, Umano, Lupo, Drago.' },
    imperatore: { n: 'L\'Imperatore Infinito', t: 'Pierfrancesco Del Bagno', icon: 'crown', color: '#ffcf40', w: 'spadone', off: null, main: 'ANY', mythic: true,
      at: { FOR: 25, DES: 25, INT: 25, VIT: 25, SAG: 25 }, mul: { hp: 1.2, fp: 1.5, dmg: 1.2 }, crit: 0.1,
      look: { coat: '#f4ead0', trim: '#ffcf40', dark: '#2a1e08', hat: 'none' },
      desc: 'Pierfrancesco Del Bagno — L\'Imperatore Infinito. Ogni classe, ogni incantesimo, ogni forma. Un\'aura d\'oro che piega la realtà. Danni e vita ×3. Il mondo si inchina.' },
  };
  const CLASS_ORDER = ['guerriero', 'paladino', 'mago', 'arciere', 'assassino', 'evocatore', 'slime', 'imperatore'];
  // 2D-game classes → suggested 3D class
  const FROM2D = { guerriero: 'guerriero', arcimago: 'mago', predatore: 'slime', evocatore: 'evocatore', pierfrancesco: 'imperatore' };

  /* ================================================================ data: rarities, item bases, affixes */
  const RAR = [
    { n: 'Comune', c: '#cfc8b8', k: 1, aff: 0, price: 1, beam: 0 },
    { n: 'Non comune', c: '#5fd35a', k: 1.12, aff: 1, price: 2.2, beam: 3.5 },
    { n: 'Raro', c: '#4f9dff', k: 1.28, aff: 2, price: 4.5, beam: 6 },
    { n: 'Epico', c: '#b45cff', k: 1.48, aff: 3, price: 9, beam: 9 },
    { n: 'Leggendario', c: '#ff9a1f', k: 1.75, aff: 4, price: 20, beam: 13 },
    { n: 'Mitico', c: '#ff3b5c', k: 2.15, aff: 5, price: 50, beam: 18 },
  ];
  const SLOTS = [
    { k: 'weapon', n: 'Arma', ic: 'sword' }, { k: 'off', n: 'Mano sinistra', ic: 'shield' }, { k: 'head', n: 'Testa', ic: 'helm' },
    { k: 'chest', n: 'Torso', ic: 'chest' }, { k: 'hands', n: 'Mani', ic: 'gloves' }, { k: 'feet', n: 'Piedi', ic: 'boots' },
    { k: 'neck', n: 'Collo', ic: 'amulet' }, { k: 'ring1', n: 'Anello I', ic: 'ring' }, { k: 'ring2', n: 'Anello II', ic: 'ring' },
  ];
  const MAT = {
    metal: ['di Ferro', 'd\'Acciaio', 'di Mithril', 'd\'Adamantio', 'd\'Oricalco', 'di Scaglia di Drago', 'dei Cieli'],
    wood: ['di Frassino', 'di Tasso', 'd\'Ebano', 'di Legnolunare', 'di Legnodrago', 'di Radice Antica', 'dell\'Albero del Mondo'],
    leather: ['di Cuoio', 'di Pelle Borchiata', 'di Pelle di Viverna', 'di Seta d\'Ombra', 'di Scaglia di Drago', 'di Tessuto Astrale', 'dei Cieli'],
    jewel: ['d\'Argento', 'd\'Oro', 'di Platino', 'di Mithril', 'di Cristallo Runico', 'di Stella Cadente', 'del Firmamento'],
    tome: ['Consunto', 'Rilegato', 'Runico', 'Antico', 'Proibito', 'Primordiale', 'Infinito'],
  };
  const BASES = {
    spada: { n: 'Spada', g: 1, slot: 'weapon', ic: 'sword', mat: 'metal', dmg: 10, stat: 'FOR' },
    spadone: { n: 'Spadone', g: 0, slot: 'weapon', ic: 'greatsword', mat: 'metal', dmg: 15, stat: 'FOR', two: true },
    pugnali: { n: 'Pugnali', g: 2, slot: 'weapon', ic: 'daggers', mat: 'metal', dmg: 8, stat: 'DES', crit: 4 },
    arco: { n: 'Arco', g: 0, slot: 'weapon', ic: 'bow', mat: 'wood', dmg: 11, stat: 'DES', two: true },
    bastone: { n: 'Bastone', g: 0, slot: 'weapon', ic: 'staff', mat: 'wood', dmg: 7, stat: 'INT', spell: 10, two: true },
    tomo: { n: 'Tomo', g: 0, slot: 'weapon', ic: 'tome', mat: 'tome', dmg: 6, stat: 'INT', spell: 14 },
    scudo: { n: 'Scudo', g: 0, slot: 'off', ic: 'shield', mat: 'metal', arm: 10, block: 8 },
    elmo: { n: 'Elmo', g: 0, slot: 'head', ic: 'helm', mat: 'metal', arm: 5 },
    corazza: { n: 'Corazza', g: 1, slot: 'chest', ic: 'chest', mat: 'metal', arm: 10, hp: 20 },
    guanti: { n: 'Guanti', g: 2, slot: 'hands', ic: 'gloves', mat: 'leather', arm: 3 },
    stivali: { n: 'Stivali', g: 2, slot: 'feet', ic: 'boots', mat: 'leather', arm: 3 },
    anello: { n: 'Anello', g: 0, slot: 'ring', ic: 'ring', mat: 'jewel' },
    amuleto: { n: 'Amuleto', g: 0, slot: 'neck', ic: 'amulet', mat: 'jewel' },
    // consumables (stackable)
    pozione: { n: 'Pozione di Cura', cons: true, ic: 'potion', col: '#e8323c', heal: 0.35, price: 40, d: 'Ripristina il 35% della vita.' },
    pozione2: { n: 'Pozione di Cura Superiore', cons: true, ic: 'potion', col: '#ff2f6a', heal: 0.6, price: 160, lv: 12, d: 'Ripristina il 60% della vita.' },
    pozione3: { n: 'Elisir della Fenice', cons: true, ic: 'potion', col: '#ffb02e', heal: 1, price: 480, lv: 28, d: 'Ripristina tutta la vita e i FP.' },
    etere: { n: 'Pozione d\'Etere', cons: true, ic: 'potion', col: '#3b7bff', fp: 0.5, price: 60, d: 'Ripristina il 50% dei FP.' },
    tonico: { n: 'Tonico del Berserker', cons: true, ic: 'potion', col: '#ff7a1a', buff: 'tonic', price: 150, lv: 5, d: '+25% danni per 60 secondi.' },
    pelle: { n: 'Pozione Pelle di Pietra', cons: true, ic: 'potion', col: '#9aa3ad', buff: 'stone', price: 150, lv: 5, d: '-25% danni subiti per 60 secondi.' },
    ritorno: { n: 'Pergamena del Ritorno', cons: true, ic: 'scroll', col: '#ffd36b', ret: true, price: 120, d: 'Ti riporta alla Piazza delle Mille Stelle di Altheria.' },
    sapienza: { n: 'Tomo della Sapienza', cons: true, ic: 'book', col: '#7fd4ff', xpb: 0.35, price: 1200, lv: 10, d: 'Conferisce il 35% dell\'esperienza necessaria al prossimo livello.' },
    gelatina: { n: 'Gelatina Cremisi', cons: true, ic: 'potion', col: '#ff4d6d', flask: true, price: 300, d: 'Ricarica una Gelatina Cremisi (tasto Cura).' },
    oblio: { n: 'Fiala dell\'Oblio', cons: true, ic: 'potion', col: '#c0c8ff', respec: true, price: 2500, d: 'Azzera attributi e abilità: ridistribuisci tutti i punti.' },
  };
  const WEAPON_BASES = ['spada', 'spadone', 'pugnali', 'arco', 'bastone', 'tomo'];
  const ARMOR_BASES = ['scudo', 'elmo', 'corazza', 'guanti', 'stivali'];
  const JEWEL_BASES = ['anello', 'amuleto'];
  // affixes: value(il) → rolled number, adjective forms [m, f, m.pl] and a suffix
  const AFF = {
    FOR: { n: 'Forza', f: (l) => 1 + l * 0.24, a: ['Possente', 'Possente', 'Possenti'], s: 'del Leone' },
    DES: { n: 'Destrezza', f: (l) => 1 + l * 0.24, a: ['Agile', 'Agile', 'Agili'], s: 'del Falco' },
    INT: { n: 'Intelligenza', f: (l) => 1 + l * 0.24, a: ['Arcano', 'Arcana', 'Arcani'], s: 'del Saggio' },
    VIT: { n: 'Vitalità', f: (l) => 1 + l * 0.24, a: ['Robusto', 'Robusta', 'Robusti'], s: 'dell\'Orso' },
    SAG: { n: 'Saggezza', f: (l) => 1 + l * 0.24, a: ['Mistico', 'Mistica', 'Mistici'], s: 'della Luna' },
    crit: { n: '% Critico', f: (l) => 1 + l * 0.05, a: ['Preciso', 'Precisa', 'Precisi'], s: 'dell\'Aquila', pct: true, max: 12 },
    critd: { n: '% Danno critico', f: (l) => 6 + l * 0.35, a: ['Spietato', 'Spietata', 'Spietati'], s: 'del Carnefice', pct: true },
    fire: { n: ' Danni da fuoco', f: (l) => 3 + l * 1.1, a: ['Ardente', 'Ardente', 'Ardenti'], s: 'della Fenice', el: '#ff7a1a' },
    ice: { n: ' Danni da gelo', f: (l) => 3 + l * 1.1, a: ['Gelido', 'Gelida', 'Gelidi'], s: 'dell\'Inverno', el: '#8fe0ff' },
    shock: { n: ' Danni da fulmine', f: (l) => 3 + l * 1.1, a: ['Fulminante', 'Fulminante', 'Fulminanti'], s: 'della Tempesta', el: '#b9a0ff' },
    ls: { n: '% Rubavita', f: (l) => 1 + l * 0.04, a: ['Vampirico', 'Vampirica', 'Vampirici'], s: 'del Vampiro', pct: true, max: 8 },
    hp: { n: ' Vita', f: (l) => 12 + l * 6, a: ['Vigoroso', 'Vigorosa', 'Vigorosi'], s: 'del Titano' },
    fp: { n: ' FP', f: (l) => 6 + l * 2, a: ['Etereo', 'Eterea', 'Eterei'], s: 'delle Stelle' },
    arm: { n: ' Armatura', f: (l) => 3 + l * 1.2, a: ['Temprato', 'Temprata', 'Temprati'], s: 'della Fortezza' },
    dmgp: { n: '% Danni', f: (l) => 2 + l * 0.13, a: ['Feroce', 'Feroce', 'Feroci'], s: 'del Drago', pct: true },
    spell: { n: '% Potere magico', f: (l) => 3 + l * 0.18, a: ['Incantato', 'Incantata', 'Incantati'], s: 'dell\'Arcimago', pct: true },
    xp: { n: '% Esperienza', f: (l) => 3 + l * 0.08, a: ['Erudito', 'Erudita', 'Eruditi'], s: 'del Viandante', pct: true },
    gold: { n: '% Anime raccolte', f: (l) => 5 + l * 0.2, a: ['Prospero', 'Prospera', 'Prosperi'], s: 'del Mercante', pct: true },
    regen: { n: ' Rigenerazione/s', f: (l) => 0.6 + l * 0.09, a: ['Rigenerante', 'Rigenerante', 'Rigeneranti'], s: 'della Fonte', dec: true },
    dodge: { n: '% Schivata', f: (l) => 1 + l * 0.04, a: ['Sfuggente', 'Sfuggente', 'Sfuggenti'], s: 'del Vento', pct: true, max: 8 },
  };
  const AFF_BY = {
    weapon: ['FOR', 'DES', 'INT', 'crit', 'critd', 'fire', 'ice', 'shock', 'ls', 'dmgp', 'spell'],
    armor: ['FOR', 'DES', 'INT', 'VIT', 'SAG', 'hp', 'fp', 'arm', 'regen', 'dodge'],
    jewel: ['FOR', 'DES', 'INT', 'VIT', 'SAG', 'crit', 'critd', 'ls', 'xp', 'gold', 'hp', 'fp', 'dmgp', 'spell', 'dodge', 'fire', 'ice', 'shock'],
  };
  // legendary / mythic item powers (procs)
  const POWERS = {
    nova: { n: 'Nova Ardente', d: '12% di probabilità a colpo: esplosione di fuoco attorno al bersaglio.', slots: ['weapon', 'ring', 'neck'], col: '#ff7a1a' },
    chain: { n: 'Arco Voltaico', d: '15% di probabilità a colpo: un fulmine rimbalza su 3 nemici.', slots: ['weapon', 'ring', 'neck'], col: '#b9a0ff' },
    frost: { n: 'Morso del Gelo', d: '15% di probabilità a colpo: congela il bersaglio per 2 s.', slots: ['weapon', 'hands'], col: '#8fe0ff' },
    vamp: { n: 'Sete Eterna', d: '20% di probabilità a colpo: recuperi il 4% della vita.', slots: ['weapon', 'ring', 'neck', 'chest'], col: '#ff4a6a' },
    echo: { n: 'Eco della Lama', d: '20% di probabilità a colpo: una lama spettrale ripete il colpo.', slots: ['weapon', 'hands'], col: '#d8c8ff' },
    star: { n: 'Stella Cadente', d: '10% di probabilità a colpo: una stella precipita sul bersaglio.', slots: ['weapon', 'neck'], col: '#ffe08a', mythic: true },
    thorns: { n: 'Spine Runiche', d: 'Riflette il 35% dei danni subiti a chi ti colpisce.', slots: ['chest', 'off', 'head'], col: '#c8a060' },
    guard: { n: 'Ultimo Baluardo', d: 'Sotto il 30% di vita: barriera automatica (ricarica 40 s).', slots: ['chest', 'off', 'head', 'feet'], col: '#6fc8ff' },
    wind: { n: 'Passo del Vento', d: '+25% stamina massima e schivata +4%.', slots: ['feet', 'hands', 'ring'], col: '#a0ffb0' },
  };
  const SYL_A = ['Ael', 'Vor', 'Kael', 'Myr', 'Zeph', 'Ith', 'Sol', 'Nyx', 'Dra', 'Ery', 'Tal', 'Mor', 'Vel', 'Aur', 'Syl', 'Gal', 'Fen', 'Lum'];
  const SYL_B = ['dris', 'morn', 'ath', 'ion', 'yss', 'oth', 'vain', 'grim', 'andor', 'iel', 'unir', 'ax', 'eth', 'ora', 'ven', 'gard'];
  const MYTHIC_SUF = ['dei Mille Mondi', 'dell\'Ultimo Re', 'del Cielo Spezzato', 'dell\'Eternità', 'del Primo Eroe'];

  /* ================================================================ state */
  let R = null; // = S.rpg
  const CLS = () => CLASSES[(R && R.cls) || 'slime'] || CLASSES.slime;
  const isSlimeLike = () => !R || R.cls === 'slime' || R.cls === 'imperatore';
  function blankRPG(cls, name) {
    const C = CLASSES[cls];
    return { v: 1, cls, name: name || (API.ch && API.ch.name) || 'Viandante', lv: 1, xp: 0, at: Object.assign({}, C.at), pts: 0, sp: 0,
      inv: new Array(40).fill(null), eq: {}, learned: {}, bar: [], uid: 1, reg: {}, gr: 0, kills: 0, deaths: 0, gold0: 0, t0: Date.now(), shop: 0, title: C.t };
  }
  function sanitize() {
    if (!R) return;
    if (!CLASSES[R.cls] || (R.cls === 'imperatore' && !API.mythic)) R.cls = 'slime';
    R.at = Object.assign({ FOR: 10, DES: 10, INT: 10, VIT: 10, SAG: 10 }, R.at || {});
    if (!Array.isArray(R.inv)) R.inv = [];
    while (R.inv.length < 40) R.inv.push(null);
    if (R.inv.length > 40) R.inv.length = 40;
    R.eq = R.eq || {}; R.learned = R.learned || {}; R.bar = Array.isArray(R.bar) ? R.bar : []; R.reg = R.reg || {};
    R.lv = clamp(R.lv | 0 || 1, 1, 99); R.xp = Math.max(0, +R.xp || 0); R.uid = R.uid || 1;
  }

  /* ================================================================ levels & experience */
  const MAXLV = 99;
  const xpNext = (l) => Math.round(90 * Math.pow(l, 1.7) + 60 * l);
  function giveXP(n, x, z, quiet) {
    if (!R || !(n > 0)) return 0;
    n = Math.round(n * (1 + (ST.xp || 0) / 100));
    if (R.lv >= MAXLV) return 0;
    R.xp += n;
    if (!quiet && x != null) dmgNum(x, heightAt(x, z) + 3, z, '+' + fmt(n) + ' EXP', 'xp');
    let ups = 0;
    while (R.lv < MAXLV && R.xp >= xpNext(R.lv)) { R.xp -= xpNext(R.lv); R.lv++; R.pts += 5; R.sp += 1; ups++; }
    if (R.lv >= MAXLV) R.xp = 0;
    if (ups) levelUpFx(ups);
    xpFlash = 0.6;
    API.saveS();
    return n;
  }
  function levelUpFx(ups) {
    const gy = heightAt(P.x, P.z);
    API.lightPillar(P.x, P.z, '#ffd36b', 2.2);
    setTimeout(() => API.lightPillar(P.x, P.z, '#fff3c0', 1.4), 250);
    API.emit(P.x, gy + 0.5, P.z, 70, '#ffd36b', { speed: 3, up: 8, grav: -2, life: 1.8, size: 0.5, bright: 2.4 });
    API.shockwave(P.x, P.z, 9, 0, '#ffd36b');
    if (API.flashLight) { API.flashLight.color.set('#ffd36b'); API.flashLight.intensity = 80; API.flashLight.position.set(P.x, gy + 3, P.z); }
    API.bigMsg('LIVELLO ' + R.lv, 'gold', 3.2);
    sfx('levelup'); API.setShake(0.25);
    oracle(`《Livello aumentato》 Livello ${R.lv} · +${5 * ups} punti attributo · +${ups} punt${ups > 1 ? 'i' : 'o'} abilità`, true);
    API.recalc(false); P.hp = P.maxHp; P.fp = P.maxFp; P.st = P.maxSt;
    unlockSkills(true);
    evt('3d:levelup', { level: R.lv });
    if (R.pts >= 5 && R.lv <= 3) setTimeout(() => toast('Premi C (o «Stato») per assegnare i punti attributo'), 3600);
  }

  /* ================================================================ enemy levels by region */
  let curFloor = 1;
  function regionLevel(x, z) {
    if (API.pocket && API.pocket.contains && API.pocket.contains(x, z)) return clamp(Math.round(4 + curFloor * 1.6), 1, 99);
    if (x > 2500 || z > 2500) return clamp(Math.round(4 + curFloor * 1.6), 1, 99);
    const rk = API.regionAt(x, z);
    if (rk === 'north') return Math.round(35 + 25 * clamp((-z - 280) / 420, 0, 1));
    if (rk === 'east') return Math.round(20 + 20 * clamp((x - 260) / 440, 0, 1));
    if (rk === 'west') return Math.round(10 + 15 * clamp((-x - 260) / 440, 0, 1));
    const d = Math.hypot(x - METRO.x, z - METRO.z);
    return Math.round(1 + 9 * clamp((d - 140) / 520, 0, 1));
  }
  const BOSS_LV = { tyrant: 30, dragon: 60, serpent: 26 };
  const hpMul = (L, boss) => 1 + (L - 1) * (boss ? 0.075 : 0.16);
  const dmgMul = (L, boss) => 1 + (L - 1) * (boss ? 0.045 : 0.075);
  function enemyLevel(e) { return (e && e.level) || 1; }
  function onSpawn(e) {
    if (!e || !e.d) return;
    if (e.passive && !e.d.boss && e.level == null) { e.level = 1; return; }
    let L = e.level;
    if (L == null) {
      if (e.d.boss) L = BOSS_LV[e.type] || clamp(regionLevel(e.x, e.z) + 6, 1, 99);
      else L = clamp(regionLevel(e.x, e.z) + ((Math.random() * 3) | 0) - 1, 1, 99);
    }
    e.level = L;
    const boss = !!e.d.boss;
    let hm = hpMul(L, boss), dm = dmgMul(L, boss);
    if (!boss && e.elite == null && L >= 3 && Math.random() < 0.07) e.elite = true;
    if (e.elite) {
      hm *= 2.6; dm *= 1.35;
      const s = 1.22; e.model.root.scale.setScalar(s); e.scale0 = s;
      e.model.root.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) m.material.emissive.set('#401004'); });
    }
    e.maxHp = Math.round((e.maxHp || e.d.hp) * hm); e.hp = e.maxHp;
    e.dmgMul = dm;
    if (e.poise != null && !boss) e.poise = Math.round(e.poise * (1 + (L - 1) * 0.02));
  }
  function attackerAt(x, z) {
    let best = null, bd = 14;
    for (const e of API.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.z - z) - (e.d.r || 1);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ================================================================ items */
  const affVal = (k, il, q) => {
    const A = AFF[k]; let v = A.f(il) * (0.55 + 0.45 * q);
    if (A.max) v = Math.min(A.max, v);
    return A.pct || A.dec ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v));
  };
  function rollRarity(boost) {
    const b = boost || 0, r = Math.random();
    const w = [0.52 - b * 0.12, 0.28, 0.13 + b * 0.05, 0.055 + b * 0.04, 0.013 + b * 0.02, 0.002 + b * 0.008];
    let s = 0; for (const x of w) s += Math.max(0, x);
    let acc = 0;
    for (let i = 0; i < w.length; i++) { acc += Math.max(0, w[i]) / s; if (r <= acc) return Math.max(i, b >= 2 ? 2 : b >= 1 ? 1 : 0); }
    return 0;
  }
  function makeItem(base, il, r, forceAff) {
    const B = BASES[base]; if (!B) return null;
    il = clamp(Math.round(il || 1), 1, 99);
    const it = { u: R ? R.uid++ : Math.floor(Math.random() * 1e9), b: base, il };
    if (B.cons) { it.q = 1; it.r = 0; return it; }
    it.r = clamp(r == null ? 0 : r, 0, 5);
    const pool = B.slot === 'weapon' ? AFF_BY.weapon : B.slot === 'ring' || B.slot === 'neck' ? AFF_BY.jewel : AFF_BY.armor;
    const n = RAR[it.r].aff, a = [], used = {};
    if (forceAff) for (const k of forceAff) if (AFF[k] && !used[k]) { used[k] = 1; a.push([k, affVal(k, il, Math.random())]); }
    let guard = 0;
    while (a.length < n && guard++ < 40) {
      const k = pick(pool); if (used[k]) continue;
      used[k] = 1; a.push([k, affVal(k, il, Math.random())]);
    }
    if (it.r >= 4) {
      for (const x of a) x[1] = typeof x[1] === 'number' && AFF[x[0]].pct ? Math.round(x[1] * 1.25 * 10) / 10 : Math.round(x[1] * 1.25);
      const opts = Object.keys(POWERS).filter((k) => POWERS[k].slots.includes(B.slot) && (!POWERS[k].mythic || it.r === 5));
      if (opts.length) it.p = pick(opts);
    }
    it.a = a;
    it.n = genName(it);
    return it;
  }
  function genName(it) {
    const B = BASES[it.b]; if (!B) return '?';
    if (B.cons) return B.n;
    const tier = Math.min(6, Math.floor(it.il / 14));
    const mat = MAT[B.mat][tier];
    const g = B.g || 0;
    const adj = (k) => (AFF[k] ? AFF[k].a[g] : '');
    const suf = (k) => (AFF[k] ? AFF[k].s : '');
    const nm = B.mat === 'tome' ? `${B.n} ${mat}` : `${B.n} ${mat}`;
    const a = it.a || [];
    if (it.r === 0 || !a.length) return nm;
    if (it.r === 1) return `${B.n} ${adj(a[0][0])}`;
    if (it.r <= 3) return `${B.n} ${adj(a[0][0])} ${suf(a[1] ? a[1][0] : a[0][0])}`;
    const h = (it.u * 2654435761) >>> 0;
    const proper = SYL_A[h % SYL_A.length] + SYL_B[(h >>> 8) % SYL_B.length];
    if (it.r === 4) return `${proper}, ${B.n} ${suf(a[0][0])}`;
    return `${proper}, ${B.n} ${MYTHIC_SUF[(h >>> 16) % MYTHIC_SUF.length]}`;
  }
  const itemName = (it) => (it ? it.n || genName(it) : '');
  function baseStats(it) {
    const B = BASES[it.b], k = RAR[it.r || 0].k, o = {};
    if (B.dmg) o.wdmg = Math.round(B.dmg * (1 + it.il * 0.09) * k);
    if (B.spell) o.wspell = Math.round(B.spell * (1 + it.il * 0.012) * k);
    if (B.arm) o.arm = Math.round(B.arm * (1 + it.il * 0.1) * k);
    if (B.hp) o.hp = Math.round(B.hp * (1 + it.il * 0.12) * k);
    if (B.crit) o.crit = B.crit;
    if (B.block) o.block = Math.round(B.block + it.il * 0.1);
    return o;
  }
  function itemValue(it) {
    const B = BASES[it.b]; if (!B) return 0;
    if (B.cons) return B.price;
    return Math.round((12 + it.il * it.il * 0.55 + it.il * 9) * RAR[it.r || 0].price * (B.slot === 'weapon' ? 1.25 : 1));
  }
  const sellValue = (it) => Math.max(1, Math.round(itemValue(it) * (BASES[it.b] && BASES[it.b].cons ? 0.4 : 0.28)));
  function slotOf(it) { const B = BASES[it.b]; return B ? B.slot : null; }
  function rollLoot(il, boost) {
    il = clamp(Math.round(il || (R ? R.lv : 1)), 1, 99);
    const r = Math.random();
    if (r < 0.2) { // consumables
      const opts = ['pozione', 'pozione', 'etere', 'gelatina'];
      if (il >= 12) opts.push('pozione2', 'tonico', 'pelle');
      if (il >= 28) opts.push('pozione3');
      if (Math.random() < 0.05) opts.push('sapienza');
      return makeItem(pick(opts), il);
    }
    let base;
    const u = Math.random();
    if (u < 0.42) base = Math.random() < 0.45 && R && CLS().w ? CLS().w : pick(WEAPON_BASES);
    else if (u < 0.85) base = pick(ARMOR_BASES);
    else base = pick(JEWEL_BASES);
    if (base === 'scudo' && R && CLS().w && BASES[CLS().w].two && Math.random() < 0.5) base = pick(['elmo', 'corazza', 'guanti', 'stivali']);
    return makeItem(base, il + ((Math.random() * 3) | 0) - 1, rollRarity(boost || 0));
  }
  function freeSlot() { return R.inv.indexOf(null); }
  function addToInv(it) {
    const B = BASES[it.b];
    if (B.cons) {
      const ex = R.inv.find((x) => x && x.b === it.b);
      if (ex) { ex.q = (ex.q || 1) + (it.q || 1); return true; }
    }
    const i = freeSlot(); if (i < 0) return false;
    R.inv[i] = it; return true;
  }
  function giveItem(itemOrId, silent) {
    if (!R) return null;
    let it = itemOrId;
    if (typeof itemOrId === 'string') {
      const B = BASES[itemOrId]; if (!B) return null;
      it = B.cons ? makeItem(itemOrId, R.lv) : makeItem(itemOrId, R.lv, 1);
    }
    if (!it || !BASES[it.b]) return null;
    if (!it.u) it.u = R.uid++;
    if (!it.n && !BASES[it.b].cons) it.n = genName(it);
    if (!addToInv(it)) { toast('Zaino pieno!'); sfx('uiBack'); return null; }
    if (!silent) {
      const c = RAR[it.r || 0].c;
      lootFeed(it);
      sfx(it.r >= 4 ? 'skillGet' : it.r >= 2 ? 'chest' : 'pickup');
      if (it.r >= 4) oracle(`《Oggetto ${RAR[it.r].n.toLowerCase()} ottenuto: ${itemName(it)}》`, true);
      void c;
    }
    evt('3d:item', { item: it });
    API.saveS(); invDirty = true;
    return it;
  }
  function giveGold(n, x, z) {
    n = Math.round(n || 0); if (!n) return;
    S.runes += n;
    if (x != null) dmgNum(x, heightAt(x, z) + 2.4, z, '+' + fmt(n) + ' ◈', 'gold');
    API.saveS();
  }

  /* ================================================================ derived stats (equipment + attributes) */
  const ST = {}; // computed totals
  function computeStats() {
    for (const k in ST) delete ST[k];
    if (!R) return ST;
    for (const a of ATTR) ST[a.k] = R.at[a.k] || 10;
    const add = (k, v) => { ST[k] = (ST[k] || 0) + v; };
    for (const s of SLOTS) {
      const it = R.eq[s.k]; if (!it || !BASES[it.b]) continue;
      const b = baseStats(it);
      for (const k in b) add(k, b[k]);
      for (const [k, v] of it.a || []) add(k, v);
    }
    const C = CLS();
    const w = R.eq.weapon && BASES[R.eq.weapon.b];
    let main = w ? ST[w.stat] : C.main === 'ANY' ? Math.max(ST.FOR, ST.DES, ST.INT) : ST[C.main];
    if (R.cls === 'imperatore') main = Math.max(ST.FOR, ST.DES, ST.INT);
    ST.main = main;
    ST.critC = clamp(0.03 + (C.crit || 0) + (ST.DES - 10) * 0.0022 + (ST.crit || 0) / 100, 0, 0.75);
    ST.critM = 1.6 + (ST.critd || 0) / 100;
    ST.dodgeC = clamp((ST.DES - 10) * 0.0012 + (ST.dodge || 0) / 100 + (R.cls === 'assassino' ? 0.05 : 0), 0, 0.35);
    ST.spellM = 1 + ((ST.spell || 0) + (ST.wspell || 0)) / 100 + Math.max(0, ST.INT - 10) * 0.012;
    ST.healM = 1 + Math.max(0, ST.SAG - 10) * 0.015;
    ST.elem = (ST.fire || 0) + (ST.ice || 0) + (ST.shock || 0);
    ST.pow = {};
    for (const sl of SLOTS) { const it = R.eq[sl.k]; if (it && it.p && POWERS[it.p]) ST.pow[it.p] = (ST.pow[it.p] || 0) + 1; }
    if (ST.pow.wind) ST.dodgeC = Math.min(0.4, ST.dodgeC + 0.04);
    return ST;
  }
  function recalc(Pp, full) {
    if (!R) return;
    computeStats();
    const C = CLS(), L = R.lv;
    P.maxHp = Math.round((P.maxHp + (ST.VIT - 10) * 14 + (ST.FOR - 10) * 3 + (L - 1) * 10 + (ST.hp || 0)) * C.mul.hp);
    P.maxFp = Math.round((P.maxFp + (ST.SAG - 10) * 5 + (ST.INT - 10) * 2 + (L - 1) * 2 + (ST.fp || 0)) * C.mul.fp);
    P.maxSt = Math.round((P.maxSt + (ST.DES - 10) * 1.2 + (ST.VIT - 10) * 0.6 + (L - 1) * 0.5) * (ST.pow && ST.pow.wind ? 1.25 : 1));
    P.dmg *= C.mul.dmg * (1 + Math.max(-5, ST.main - 10) * 0.012) * (1 + (ST.wdmg || 0) / 60) * (1 + (ST.dmgp || 0) / 100);
    P.crit = ST.critC;
    if (!full) { P.hp = Math.min(P.hp, P.maxHp); P.fp = Math.min(P.fp, P.maxFp); P.st = Math.min(P.st, P.maxSt); }
    weaponDirty = true;
  }

  /* ================================================================ canvas icons (items, class emblems) */
  const ICON = {};
  function rr(x, X, y, w, h, r) { x.beginPath(); x.moveTo(X + r, y); x.arcTo(X + w, y, X + w, y + h, r); x.arcTo(X + w, y + h, X, y + h, r); x.arcTo(X, y + h, X, y, r); x.arcTo(X, y, X + w, y, r); x.closePath(); }
  function metalGrad(x, x0, y0, x1, y1, r) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    const base = r >= 5 ? ['#fff4c0', '#ffcf40', '#a8741a'] : r >= 4 ? ['#fff0d0', '#e8b860', '#8a5a20'] : ['#ffffff', '#c9ced8', '#6a707c'];
    g.addColorStop(0, base[0]); g.addColorStop(0.5, base[1]); g.addColorStop(1, base[2]); return g;
  }
  function glyph(x, kind, r, acc, col) {
    // draws in a 64×64 box
    const gold = '#d9b44a', wood = '#7a5230', leather = '#6b4428';
    x.lineJoin = 'round'; x.lineCap = 'round';
    const glow = (c, b) => { x.shadowColor = c; x.shadowBlur = b; };
    const noGlow = () => { x.shadowBlur = 0; };
    switch (kind) {
      case 'sword': case 'greatsword': {
        const big = kind === 'greatsword';
        x.save(); x.translate(32, 32); x.rotate(Math.PI / 4);
        const bw = big ? 9 : 6, bl = big ? 46 : 38;
        glow(acc, r >= 2 ? 8 : 0);
        x.fillStyle = metalGrad(x, -bw / 2, 0, bw / 2, 0, r);
        x.beginPath(); x.moveTo(-bw / 2, 10); x.lineTo(-bw / 2, 10 - bl + 6); x.lineTo(0, 10 - bl); x.lineTo(bw / 2, 10 - bl + 6); x.lineTo(bw / 2, 10); x.closePath(); x.fill();
        noGlow(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, 8); x.lineTo(0, 12 - bl); x.stroke();
        x.fillStyle = gold; x.fillRect(big ? -12 : -9, 9, big ? 24 : 18, 4);
        x.fillStyle = leather; x.fillRect(-2, 13, 4, big ? 12 : 10);
        x.fillStyle = gold; x.beginPath(); x.arc(0, big ? 27 : 25, 3, 0, TAU); x.fill();
        if (r >= 2) { x.fillStyle = acc; x.beginPath(); x.arc(0, 11, 2, 0, TAU); x.fill(); }
        x.restore(); break;
      }
      case 'daggers': {
        for (const s of [-1, 1]) {
          x.save(); x.translate(32 + s * 7, 34); x.rotate(s * 0.55);
          glow(acc, r >= 2 ? 6 : 0);
          x.fillStyle = metalGrad(x, -3, 0, 3, 0, r);
          x.beginPath(); x.moveTo(-3, 4); x.lineTo(-3, -16); x.lineTo(0, -24); x.lineTo(3, -16); x.lineTo(3, 4); x.closePath(); x.fill(); noGlow();
          x.fillStyle = gold; x.fillRect(-6, 4, 12, 3); x.fillStyle = leather; x.fillRect(-1.5, 7, 3, 9);
          x.restore();
        }
        break;
      }
      case 'bow': {
        x.save(); x.translate(32, 32); x.rotate(-Math.PI / 4);
        glow(acc, r >= 2 ? 6 : 0);
        x.strokeStyle = r >= 4 ? '#e8b860' : wood; x.lineWidth = 5;
        x.beginPath(); x.arc(-14, 0, 26, -1.05, 1.05); x.stroke(); noGlow();
        x.strokeStyle = '#f0ead8'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-14 + 26 * Math.cos(-1.05), 26 * Math.sin(-1.05)); x.lineTo(-14 + 26 * Math.cos(1.05), 26 * Math.sin(1.05)); x.stroke();
        x.strokeStyle = '#d8d0b8'; x.lineWidth = 2; x.beginPath(); x.moveTo(-2, 0); x.lineTo(22, 0); x.stroke();
        x.fillStyle = metalGrad(x, 20, -3, 26, 3, r); x.beginPath(); x.moveTo(26, 0); x.lineTo(20, -4); x.lineTo(20, 4); x.fill();
        x.fillStyle = acc; x.fillRect(-4, -3, 4, 6);
        x.restore(); break;
      }
      case 'staff': {
        x.save(); x.translate(32, 32); x.rotate(Math.PI / 4);
        x.fillStyle = wood; x.fillRect(-2.5, -18, 5, 44);
        x.fillStyle = gold; x.fillRect(-4, -18, 8, 3);
        glow(acc, 14); x.fillStyle = acc; x.beginPath(); x.arc(0, -25, 7, 0, TAU); x.fill();
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(-2, -27, 2.5, 0, TAU); x.fill(); noGlow();
        x.strokeStyle = gold; x.lineWidth = 2; x.beginPath(); x.moveTo(-6, -16); x.quadraticCurveTo(-10, -26, -3, -33); x.moveTo(6, -16); x.quadraticCurveTo(10, -26, 3, -33); x.stroke();
        x.restore(); break;
      }
      case 'tome': case 'book': {
        x.save(); x.translate(32, 33); x.rotate(-0.12);
        x.fillStyle = '#efe6cc'; x.fillRect(-15, -19, 32, 40);
        x.fillStyle = kind === 'book' ? '#2a4a7a' : r >= 4 ? '#5a2a10' : '#3a1f52'; x.fillRect(-18, -21, 32, 42);
        x.strokeStyle = gold; x.lineWidth = 2; x.strokeRect(-15, -18, 26, 36);
        glow(acc, 10); x.strokeStyle = acc; x.lineWidth = 2;
        x.beginPath(); x.arc(-2, 0, 7, 0, TAU); x.moveTo(-2, -10); x.lineTo(-2, 10); x.moveTo(-12, 0); x.lineTo(8, 0); x.stroke(); noGlow();
        x.restore(); break;
      }
      case 'shield': {
        x.save(); x.translate(32, 32);
        x.fillStyle = metalGrad(x, -20, -20, 20, 20, r);
        x.beginPath(); x.moveTo(0, -24); x.lineTo(19, -17); x.lineTo(17, 4); x.quadraticCurveTo(10, 18, 0, 26); x.quadraticCurveTo(-10, 18, -17, 4); x.lineTo(-19, -17); x.closePath(); x.fill();
        x.strokeStyle = gold; x.lineWidth = 2.5; x.stroke();
        x.fillStyle = r >= 2 ? acc : '#8a2a2a'; x.beginPath(); x.moveTo(0, -18); x.lineTo(13, -13); x.lineTo(12, 3); x.quadraticCurveTo(7, 13, 0, 19); x.quadraticCurveTo(-7, 13, -12, 3); x.lineTo(-13, -13); x.closePath(); x.fill();
        glow('#fff', 6); x.fillStyle = '#fff3d0'; x.fillRect(-2, -12, 4, 24); x.fillRect(-9, -4, 18, 4); noGlow();
        x.restore(); break;
      }
      case 'helm': {
        x.save(); x.translate(32, 34);
        x.fillStyle = metalGrad(x, -18, -18, 18, 18, r);
        x.beginPath(); x.moveTo(-17, 14); x.lineTo(-17, -4); x.quadraticCurveTo(-17, -22, 0, -23); x.quadraticCurveTo(17, -22, 17, -4); x.lineTo(17, 14); x.lineTo(6, 14); x.lineTo(6, 2); x.lineTo(-6, 2); x.lineTo(-6, 14); x.closePath(); x.fill();
        x.fillStyle = '#10141c'; x.fillRect(-13, -6, 26, 4);
        x.strokeStyle = gold; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -23); x.lineTo(0, -4); x.stroke();
        if (r >= 2) { glow(acc, 8); x.fillStyle = acc; x.beginPath(); x.arc(0, -16, 3, 0, TAU); x.fill(); noGlow(); }
        x.restore(); break;
      }
      case 'chest': {
        x.save(); x.translate(32, 32);
        x.fillStyle = metalGrad(x, -20, -20, 20, 20, r);
        x.beginPath(); x.moveTo(-10, -22); x.lineTo(-22, -16); x.lineTo(-20, -2); x.lineTo(-14, 0); x.lineTo(-14, 22); x.lineTo(14, 22); x.lineTo(14, 0); x.lineTo(20, -2); x.lineTo(22, -16); x.lineTo(10, -22); x.quadraticCurveTo(0, -14, -10, -22); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -14); x.lineTo(0, 22); x.moveTo(-14, 8); x.lineTo(14, 8); x.stroke();
        x.strokeStyle = gold; x.lineWidth = 2; x.strokeRect(-14, 18, 28, 4);
        if (r >= 2) { glow(acc, 8); x.fillStyle = acc; x.beginPath(); x.arc(0, -4, 3.5, 0, TAU); x.fill(); noGlow(); }
        x.restore(); break;
      }
      case 'gloves': {
        x.save(); x.translate(32, 34);
        x.fillStyle = r >= 3 ? metalGrad(x, -14, -14, 14, 14, r) : leather;
        x.beginPath(); x.moveTo(-12, 20); x.lineTo(-12, -6); x.lineTo(-10, -18); x.lineTo(-6, -18); x.lineTo(-5, -6); x.lineTo(-4, -22); x.lineTo(0, -22); x.lineTo(1, -6); x.lineTo(3, -20); x.lineTo(7, -20); x.lineTo(7, -4); x.lineTo(14, -10); x.lineTo(16, -6); x.lineTo(10, 6); x.lineTo(10, 20); x.closePath(); x.fill();
        x.fillStyle = gold; x.fillRect(-13, 14, 24, 5);
        if (r >= 2) { glow(acc, 6); x.fillStyle = acc; x.fillRect(-6, 2, 10, 3); noGlow(); }
        x.restore(); break;
      }
      case 'boots': {
        x.save(); x.translate(30, 32);
        x.fillStyle = r >= 3 ? metalGrad(x, -14, -14, 14, 14, r) : leather;
        x.beginPath(); x.moveTo(-10, -22); x.lineTo(6, -22); x.lineTo(6, 8); x.lineTo(20, 12); x.quadraticCurveTo(24, 20, 18, 22); x.lineTo(-10, 22); x.closePath(); x.fill();
        x.fillStyle = gold; x.fillRect(-11, -22, 18, 4); x.fillRect(-11, 18, 31, 4);
        if (r >= 2) { glow(acc, 6); x.fillStyle = acc; x.beginPath(); x.arc(-2, -6, 3, 0, TAU); x.fill(); noGlow(); }
        x.restore(); break;
      }
      case 'ring': {
        x.save(); x.translate(32, 36);
        x.strokeStyle = metalGrad(x, -14, -14, 14, 14, Math.max(4, r)); x.lineWidth = 5;
        x.beginPath(); x.ellipse(0, 4, 14, 12, 0, 0, TAU); x.stroke();
        glow(acc, 12); x.fillStyle = acc; x.beginPath(); x.moveTo(0, -18); x.lineTo(8, -9); x.lineTo(0, -1); x.lineTo(-8, -9); x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,.8)'; x.beginPath(); x.moveTo(0, -16); x.lineTo(3, -11); x.lineTo(-3, -11); x.closePath(); x.fill(); noGlow();
        x.restore(); break;
      }
      case 'amulet': {
        x.save(); x.translate(32, 30);
        x.strokeStyle = '#c9b27a'; x.lineWidth = 2; x.setLineDash([3, 2]);
        x.beginPath(); x.arc(0, -10, 18, 0.2, Math.PI - 0.2); x.stroke(); x.setLineDash([]);
        x.fillStyle = metalGrad(x, -10, 0, 10, 20, Math.max(4, r)); x.beginPath(); x.arc(0, 14, 10, 0, TAU); x.fill();
        glow(acc, 12); x.fillStyle = acc; x.beginPath(); x.arc(0, 14, 6, 0, TAU); x.fill(); noGlow();
        x.restore(); break;
      }
      case 'potion': {
        x.save(); x.translate(32, 34);
        x.fillStyle = 'rgba(220,240,255,.25)'; x.strokeStyle = 'rgba(230,240,255,.85)'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(-5, -20); x.lineTo(-5, -9); x.arc(0, 6, 16, -Math.PI / 2 - 0.32, Math.PI * 1.5 + 0.32 - TAU, false); x.lineTo(5, -20); x.closePath();
        x.beginPath(); x.arc(0, 6, 16, 0, TAU); x.fill(); x.stroke();
        x.fillRect(-5, -20, 10, 12); x.strokeRect(-5, -20, 10, 12);
        glow(col, 12); x.fillStyle = col; x.beginPath(); x.arc(0, 6, 13, -0.15, Math.PI + 0.15); x.fill(); noGlow();
        x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(-6, 0, 3, 6, 0.4, 0, TAU); x.fill();
        x.fillStyle = '#8a5a30'; x.fillRect(-6, -26, 12, 7);
        x.restore(); break;
      }
      case 'scroll': {
        x.save(); x.translate(32, 32); x.rotate(-0.4);
        x.fillStyle = '#e8d8a8'; x.fillRect(-16, -12, 32, 24);
        x.fillStyle = '#c8b078'; x.beginPath(); x.arc(-16, 0, 6, 0, TAU); x.arc(16, 0, 6, 0, TAU); x.fill();
        glow(col, 8); x.strokeStyle = col; x.lineWidth = 1.5; for (let i = -6; i <= 6; i += 4) { x.beginPath(); x.moveTo(-10, i); x.lineTo(10, i); x.stroke(); } noGlow();
        x.fillStyle = '#b02020'; x.beginPath(); x.arc(0, 10, 4, 0, TAU); x.fill();
        x.restore(); break;
      }
      case 'slime': {
        x.save(); x.translate(32, 36);
        const g = x.createRadialGradient(-6, -8, 2, 0, 0, 24); g.addColorStop(0, '#d8f6ff'); g.addColorStop(0.4, '#4fc3ff'); g.addColorStop(1, '#0d5f9a');
        glow('#4fc3ff', 12); x.fillStyle = g;
        x.beginPath(); x.moveTo(-22, 16); x.quadraticCurveTo(-24, -20, 0, -22); x.quadraticCurveTo(24, -20, 22, 16); x.quadraticCurveTo(0, 22, -22, 16); x.fill(); noGlow();
        x.fillStyle = '#0b0e18'; x.beginPath(); x.ellipse(-7, -2, 3, 5, 0, 0, TAU); x.ellipse(7, -2, 3, 5, 0, 0, TAU); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(-6, -4, 1.3, 0, TAU); x.arc(8, -4, 1.3, 0, TAU); x.fill();
        x.restore(); break;
      }
      case 'crown': {
        x.save(); x.translate(32, 36);
        glow('#ffcf40', 16); x.fillStyle = metalGrad(x, -20, -20, 20, 20, 5);
        x.beginPath(); x.moveTo(-22, 12); x.lineTo(-24, -14); x.lineTo(-12, -2); x.lineTo(0, -22); x.lineTo(12, -2); x.lineTo(24, -14); x.lineTo(22, 12); x.closePath(); x.fill(); noGlow();
        for (const [gx, c] of [[-12, '#ff3b6b'], [0, '#4fc3ff'], [12, '#7cff6a']]) { x.fillStyle = c; x.beginPath(); x.arc(gx, 5, 3.5, 0, TAU); x.fill(); }
        x.restore(); break;
      }
      default: break;
    }
  }
  function iconURL(it) {
    const B = BASES[it.b] || {}, r = it.r || 0, key = it.b + '|' + r;
    if (ICON[key]) return ICON[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), rc = RAR[r].c;
    const bg = x.createRadialGradient(32, 28, 4, 32, 32, 44);
    bg.addColorStop(0, B.cons ? 'rgba(60,50,40,.9)' : `${rc}55`); bg.addColorStop(1, 'rgba(8,6,4,.95)');
    x.fillStyle = bg; rr(x, 1, 1, 62, 62, 8); x.fill();
    glyph(x, B.ic, r, rc, B.col || rc);
    return (ICON[key] = c.toDataURL());
  }
  function emblemURL(cls, size) {
    const key = 'cls|' + cls + '|' + (size || 96);
    if (ICON[key]) return ICON[key];
    const C = CLASSES[cls], s = size || 96, c = document.createElement('canvas'); c.width = c.height = s;
    const x = c.getContext('2d'); x.scale(s / 64, s / 64);
    const g = x.createRadialGradient(32, 26, 3, 32, 32, 34); g.addColorStop(0, C.color + 'aa'); g.addColorStop(0.6, '#1a1408'); g.addColorStop(1, '#0a0806');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(32, 2); x.lineTo(60, 10); x.lineTo(57, 38); x.quadraticCurveTo(48, 56, 32, 62); x.quadraticCurveTo(16, 56, 7, 38); x.lineTo(4, 10); x.closePath(); x.fill();
    x.strokeStyle = '#d6ba78'; x.lineWidth = 2; x.stroke();
    x.strokeStyle = C.color; x.lineWidth = 1; x.beginPath(); x.moveTo(32, 6); x.lineTo(56, 13); x.lineTo(53, 37); x.quadraticCurveTo(45, 52, 32, 58); x.quadraticCurveTo(19, 52, 11, 37); x.lineTo(8, 13); x.closePath(); x.stroke();
    x.save(); x.translate(32, 32); x.scale(0.78, 0.78); x.translate(-32, -32);
    glyph(x, C.icon, cls === 'imperatore' ? 5 : 3, C.color, C.color);
    x.restore();
    return (ICON[key] = c.toDataURL());
  }

  /* ================================================================ world loot pickups */
  const PICK = [], PICKMAX = 40;
  const PGEO = { weapon: new T.OctahedronGeometry(0.32, 0), armor: new T.BoxGeometry(0.42, 0.42, 0.42), jewel: new T.TorusGeometry(0.22, 0.07, 6, 14), cons: new T.SphereGeometry(0.22, 10, 8),
    beam: new T.CylinderGeometry(0.16, 0.34, 1, 10, 1, true), coin: new T.CylinderGeometry(0.2, 0.2, 0.05, 12) };
  PGEO.beam.translate(0, 0.5, 0);
  const PMAT = RAR.map((r, i) => ({
    item: std(r.c, 0.3, 0.6, { emissive: hdr(r.c, 0.4 + i * 0.25) }),
    beam: new T.MeshBasicMaterial({ color: hdr(r.c, 1.4 + i * 0.3), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }),
    glow: new T.SpriteMaterial({ map: API.dot, color: hdr(r.c, 1.6 + i * 0.3), transparent: true, depthWrite: false, blending: T.AdditiveBlending }),
  }));
  const coinMat = std('#ffcf40', 0.25, 0.95, { emissive: hdr('#ffb000', 0.6) });
  function dropLoot(x, z, il, boost, item) {
    const it = item || rollLoot(il, boost);
    if (!it) return null;
    if (PICK.length >= PICKMAX) removePick(0);
    const B = BASES[it.b], r = it.r || 0, M = PMAT[r];
    const g = new T.Group();
    const cat = B.cons ? 'cons' : B.slot === 'weapon' ? 'weapon' : B.slot === 'ring' || B.slot === 'neck' ? 'jewel' : 'armor';
    const m = new T.Mesh(PGEO[cat], B.cons ? std(B.col, 0.2, 0.1, { emissive: hdr(B.col, 0.8) }) : M.item);
    if (cat === 'weapon') m.scale.set(0.6, 1.6, 0.6);
    m.castShadow = true; g.add(m);
    const glow = new T.Sprite(M.glow); glow.scale.setScalar(1.2 + r * 0.25); g.add(glow);
    let beam = null;
    if (RAR[r].beam > 0) { beam = new T.Mesh(PGEO.beam, M.beam); beam.scale.set(1, RAR[r].beam, 1); g.add(beam); }
    const y = heightAt(x, z);
    g.position.set(x, y, z); scene.add(g);
    const p = { it, g, m, beam, glow, x, z, y, t: 0, vy: 5 + Math.random() * 2, h: 1.2, vx: rand(-2, 2), vz: rand(-2, 2) };
    PICK.push(p);
    if (r >= 3) { API.emit(x, y + 1, z, 20 + r * 6, RAR[r].c, { speed: 4, up: 5, grav: 2, life: 1.2, bright: 2.2 }); sfx(r >= 4 ? 'skillGet' : 'chest', { vol: 0.6 }); }
    return it;
  }
  function removePick(i) {
    const p = PICK[i]; if (!p) return;
    scene.remove(p.g);
    if (p.m.material !== PMAT[p.it.r || 0].item && p.m.material !== coinMat) p.m.material.dispose();
    PICK.splice(i, 1);
  }
  function collectPick(i) {
    const p = PICK[i]; if (!p) return;
    if (p.gold) { giveGold(p.gold, p.x, p.z); sfx('coin'); removePick(i); return; }
    const got = giveItem(p.it);
    if (got) { API.emit(p.x, p.y + 1, p.z, 16, RAR[p.it.r || 0].c, { speed: 3, up: 4, grav: 4, life: 0.7 }); removePick(i); }
  }
  function dropGold(x, z, amount) {
    if (PICK.length >= PICKMAX) removePick(0);
    const g = new T.Group(), m = new T.Mesh(PGEO.coin, coinMat); m.rotation.x = Math.PI / 2; m.castShadow = true; g.add(m);
    const glow = new T.Sprite(PMAT[4].glow); glow.scale.setScalar(0.9); g.add(glow);
    const y = heightAt(x, z); g.position.set(x, y, z); scene.add(g);
    PICK.push({ gold: amount, it: { r: 0 }, g, m, glow, x, z, y, t: 0, vy: 6, h: 0.6, vx: rand(-3, 3), vz: rand(-3, 3) });
  }
  const FEED = [];
  function lootFeed(it) {
    const box = $('rpgfeed'); if (!box) return;
    const d = document.createElement('div');
    d.className = 'lf';
    d.innerHTML = `<img src="${iconURL(it)}"><span style="color:${RAR[it.r || 0].c}">${esc(itemName(it))}</span>${it.q > 1 ? ' ×' + it.q : ''}`;
    box.appendChild(d);
    FEED.push({ d, t: 4 });
    while (FEED.length > 5) { const o = FEED.shift(); o.d.remove(); }
  }
  function updatePickups(dt) {
    for (let i = PICK.length - 1; i >= 0; i--) {
      const p = PICK[i];
      p.t += dt;
      if (p.h > 0.01 || p.vy > 0) { // pop out
        p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2;
        p.vy -= 18 * dt; p.h += p.vy * dt;
        if (p.h < 0.6 && p.vy < 0) { p.h = 0.6; p.vy = 0; p.vx = p.vz = 0; }
        p.y = heightAt(p.x, p.z);
      }
      const d = Math.hypot(P.x - p.x, P.z - p.z);
      if (p.gold) {
        if (d < 7 && p.t > 0.6) { const k = Math.min(1, dt * 9); p.x = lerp(p.x, P.x, k); p.z = lerp(p.z, P.z, k); p.y = heightAt(p.x, p.z); }
        if (d < 1.2 && p.t > 0.6) { collectPick(i); continue; }
      } else if (d < 1.5 && p.t > 0.8 && !P.dead) { collectPick(i); continue; }
      const far = d > 120; p.g.visible = !far;
      if (far) continue;
      p.g.position.set(p.x, p.y + p.h + Math.sin(p.t * 2.4) * 0.12, p.z);
      p.m.rotation.y += dt * 1.8; p.m.rotation.z = Math.sin(p.t) * 0.2;
      if (p.beam) { p.beam.position.y = -p.h; p.beam.material.opacity = 0.4 + Math.sin(p.t * 3) * 0.12; }
      p.glow.material.opacity = 0.75 + Math.sin(p.t * 4) * 0.25;
      if (p.it.r >= 4 && Math.random() < dt * 6) API.emit(p.x + rand(-0.5, 0.5), p.y + 0.3, p.z + rand(-0.5, 0.5), 1, RAR[p.it.r].c, { speed: 0.4, up: 3, grav: -1, life: 1.4, bright: 2.4 });
    }
    for (let i = FEED.length - 1; i >= 0; i--) { const o = FEED[i]; o.t -= dt; if (o.t < 1) o.d.style.opacity = Math.max(0, o.t).toFixed(2); if (o.t <= 0) { o.d.remove(); FEED.splice(i, 1); } }
  }

  /* ================================================================ class look: outfit tint, headgear, weapons on the human model */
  const H = API.human;
  const LOOK = { coat: [], trim: [], dark: [], built: false, hats: {}, weaponR: null, weaponL: null, back: null, key: '' };
  let weaponDirty = true;
  const WM = {
    steel: std('#c9ced8', 0.2, 0.95), darkSteel: std('#4a505c', 0.35, 0.85), gold: std('#d9b44a', 0.22, 0.95), wood: std('#6b4a2a', 0.75, 0),
    darkWood: std('#3a2618', 0.8, 0), leather: std('#5a3a22', 0.85, 0), cloth: std('#efe6cc', 0.9, 0), string: new T.MeshBasicMaterial({ color: '#f0ead8' }),
  };
  const glowMats = {};
  const glowM = (c, k) => { const key = c + k; return glowMats[key] || (glowMats[key] = new T.MeshBasicMaterial({ color: hdr(c, k), toneMapped: false })); };
  const addM = (c, k, o) => new T.MeshBasicMaterial({ color: hdr(c, k), transparent: true, opacity: o == null ? 1 : o, depthWrite: false, blending: T.AdditiveBlending });
  function collectLook() {
    if (LOOK.built || !H) return;
    LOOK.built = true;
    const seen = new Set();
    H.root.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color || seen.has(o.material)) return;
      seen.add(o.material);
      const h = o.material.color.getHexString();
      if (h === 'f2f5fa') LOOK.coat.push(o.material); else if (h === 'd9b44a') LOOK.trim.push(o.material); else if (h === '1e2230') LOOK.dark.push(o.material);
    });
    LOOK.orig = { coat: '#f2f5fa', trim: '#d9b44a', dark: '#1e2230' };
    const M = API.mesh, cap = API.cap, sph = API.sph, cone = API.coneG;
    const head = H.head;
    // headgear
    const helm = new T.Group(); head.add(helm);
    M(helm, sph(0.235, 14, 10), WM.steel, 0, 0.05, -0.01, 0, 0, 0, 1, 0.95, 1.05);
    M(helm, API.BOX, WM.darkSteel, 0, 0.0, 0.2, 0, 0, 0, 0.3, 0.05, 0.05);
    M(helm, API.BOX, WM.gold, 0, 0.2, 0.0, 0, 0, 0, 0.05, 0.14, 0.42);
    for (const s of [-1, 1]) M(helm, cone(0.05, 0.3, 6), WM.cloth, s * 0.22, 0.2, 0, 0, 0, -s * 0.9);
    LOOK.hats.helm = helm;
    const circ = new T.Group(); head.add(circ);
    M(circ, new T.TorusGeometry(0.21, 0.018, 6, 24), WM.gold, 0, 0.1, 0, Math.PI / 2 - 0.15, 0, 0);
    M(circ, new T.OctahedronGeometry(0.035, 0), glowM('#7fd4ff', 2.6), 0, 0.14, 0.2);
    LOOK.hats.circlet = circ;
    const wiz = new T.Group(); head.add(wiz);
    const hatMat = std('#1f3570', 0.8);
    M(wiz, new T.CylinderGeometry(0.4, 0.4, 0.03, 20), hatMat, 0, 0.16, 0);
    const tip = new T.Group(); tip.position.set(0, 0.17, 0); wiz.add(tip);
    M(tip, new T.ConeGeometry(0.22, 0.6, 14), hatMat, 0, 0.3, -0.04, -0.18, 0, 0);
    M(wiz, new T.TorusGeometry(0.205, 0.025, 6, 20), WM.gold, 0, 0.19, 0, Math.PI / 2, 0, 0);
    M(wiz, new T.OctahedronGeometry(0.04, 0), glowM('#ffe08a', 3), 0.12, 0.3, 0.17);
    wiz.userData.mat = hatMat; LOOK.hats.wizard = wiz;
    const hood = new T.Group(); head.add(hood);
    const hoodMat = std('#2f5a2a', 0.95, 0, { side: T.DoubleSide });
    M(hood, new T.SphereGeometry(0.26, 14, 10, 0, TAU, 0, Math.PI * 0.62), hoodMat, 0, 0.05, -0.03, -0.25, 0, 0, 1, 1.05, 1.08);
    M(hood, cone(0.12, 0.3, 6), hoodMat, 0, 0.06, -0.26, -2.1, 0, 0);
    hood.userData.mat = hoodMat; LOOK.hats.hood = hood;
    const mask = new T.Group(); head.add(mask);
    const maskMat = std('#141018', 0.9, 0, { side: T.DoubleSide });
    M(mask, new T.SphereGeometry(0.265, 14, 10, 0, TAU, 0, Math.PI * 0.6), maskMat, 0, 0.05, -0.03, -0.3, 0, 0, 1, 1.05, 1.08);
    M(mask, API.BOX, maskMat, 0, -0.08, 0.15, 0, 0, 0, 0.32, 0.13, 0.12);
    M(mask, API.BOX, glowM('#b06bff', 2.4), 0, 0.02, 0.215, 0, 0, 0, 0.2, 0.012, 0.01);
    LOOK.hats.mask = mask;
    const halo = new T.Group(); head.add(halo);
    M(halo, new T.TorusGeometry(0.26, 0.012, 6, 32), glowM('#d0a0ff', 2.6), 0, 0.42, -0.05, Math.PI / 2 - 0.2, 0, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; M(halo, new T.OctahedronGeometry(0.03, 0), glowM('#c06bff', 3), Math.cos(a) * 0.26, 0.42 + Math.sin(a) * 0.05, Math.sin(a) * 0.26 - 0.05); }
    LOOK.hats.halo = halo;
    for (const k in LOOK.hats) LOOK.hats[k].visible = false;
    // shoulder pauldrons + cape (warrior / paladin / emperor)
    LOOK.paul = [];
    for (const A of [H.armL, H.armR]) {
      const p = new T.Group(); A.add(p);
      M(p, new T.SphereGeometry(0.13, 10, 8, 0, TAU, 0, Math.PI / 2), WM.steel, 0, -0.02, 0, 0, 0, 0, 1.1, 0.8, 1.1);
      M(p, new T.TorusGeometry(0.12, 0.015, 4, 14), WM.gold, 0, -0.02, 0, Math.PI / 2, 0, 0);
      p.visible = false; LOOK.paul.push(p);
    }
    const cape = new T.Group(); cape.position.set(0, 1.62, -0.17); H.g.add(cape);
    const cg = new T.PlaneGeometry(0.62, 1.25, 1, 5); cg.translate(0, -0.62, 0);
    LOOK.capeMat = std('#8a1c24', 0.9, 0, { side: T.DoubleSide });
    M(cape, cg, LOOK.capeMat, 0, 0, 0);
    cape.visible = false; LOOK.cape = cape;
    // quiver
    const q = new T.Group(); q.position.set(0.12, 1.42, -0.2); q.rotation.z = 0.35; H.g.add(q);
    M(q, new T.CylinderGeometry(0.07, 0.06, 0.55, 10), WM.leather, 0, 0, 0);
    for (let i = 0; i < 5; i++) { M(q, new T.CylinderGeometry(0.008, 0.008, 0.3, 4), WM.wood, (i % 3 - 1) * 0.03, 0.38, ((i / 3) | 0) * 0.03 - 0.015); M(q, API.BOX, glowM('#ffffff', 1.4), (i % 3 - 1) * 0.03, 0.5, ((i / 3) | 0) * 0.03 - 0.015, 0, 0, 0, 0.005, 0.07, 0.035); }
    q.visible = false; LOOK.quiver = q;
    // mythic golden halo ring around the body
    LOOK.aura = new T.Mesh(new T.TorusGeometry(0.75, 0.02, 6, 48), addM('#ffcf40', 2.4, 0.8));
    LOOK.aura.rotation.x = Math.PI / 2; LOOK.aura.visible = false; H.g.add(LOOK.aura);
  }
  function applyLook() {
    collectLook();
    if (!H || !R) return;
    const C = CLS(), L = C.look;
    const col = (arr, c) => { for (const m of arr) m.color.set(c); };
    if (L) { col(LOOK.coat, L.coat); col(LOOK.trim, L.trim); col(LOOK.dark, L.dark); }
    else { col(LOOK.coat, LOOK.orig.coat); col(LOOK.trim, LOOK.orig.trim); col(LOOK.dark, LOOK.orig.dark); }
    for (const k in LOOK.hats) LOOK.hats[k].visible = !!(L && L.hat === k);
    if (LOOK.hats.wizard.visible) LOOK.hats.wizard.userData.mat.color.set(L.coat);
    if (LOOK.hats.hood.visible) LOOK.hats.hood.userData.mat.color.set(L.coat);
    const armored = R.cls === 'guerriero' || R.cls === 'paladino' || R.cls === 'imperatore';
    for (const p of LOOK.paul) p.visible = armored;
    LOOK.cape.visible = R.cls === 'paladino' || R.cls === 'imperatore' || R.cls === 'guerriero';
    LOOK.capeMat.color.set(R.cls === 'paladino' ? '#e8e2d0' : R.cls === 'imperatore' ? '#8a1020' : '#6e1a14');
    LOOK.quiver.visible = R.cls === 'arciere';
    LOOK.aura.visible = R.cls === 'imperatore';
    weaponDirty = true;
  }
  function clearWeapon(g) { if (!g) return; g.parent && g.parent.remove(g); g.traverse((o) => { if (o.isMesh && o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); }); }
  function buildWeapon(kind, rar, left) {
    const M = API.mesh, g = new T.Group(), rc = RAR[rar || 0].c, gk = 1.4 + (rar || 0) * 0.45;
    const glow = glowM(rc, gk);
    if (kind === 'spadone' || kind === 'spada' || kind === 'imperiale') {
      const big = kind !== 'spada', gold = kind === 'imperiale';
      const L = big ? 1.75 : 1.25, W = big ? 0.13 : 0.085;
      M(g, API.cap(0.032, big ? 0.32 : 0.2), WM.leather, 0, big ? 0.17 : 0.12, 0);
      M(g, API.sph(0.05, 8, 6), WM.gold, 0, big ? 0.38 : 0.27, 0);
      M(g, API.BOX, gold ? WM.gold : WM.gold, 0, 0, 0, 0, 0, 0, big ? 0.46 : 0.32, 0.06, 0.1);
      for (const s of [-1, 1]) M(g, API.sph(0.035, 6, 5), glow, s * (big ? 0.24 : 0.17), 0, 0);
      const bladeMat = gold ? std('#ffd86a', 0.12, 1, { emissive: hdr('#ff9a1a', 0.35) }) : WM.steel;
      M(g, API.BOX, bladeMat, 0, -L / 2 - 0.03, 0, 0, 0, 0, W, L, 0.03);
      M(g, API.coneG(W * 0.72, 0.22, 4), bladeMat, 0, -L - 0.13, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.3);
      M(g, API.BOX, gold ? glowM('#ffcf40', 3) : glow, 0, -L / 2 + 0.02, 0, 0, 0, 0, W * 0.22, L * 0.82, 0.036);
      if ((rar || 0) >= 3 || gold) for (const s of [-1, 1]) M(g, API.BOX, gold ? glowM('#fff2b0', 2.8) : glow, s * W * 0.5, -L / 2 - 0.03, 0, 0, 0, 0, 0.012, L * 0.95, 0.034);
      g.userData.len = L; g.userData.trail = big ? 1.15 : 0.85;
    } else if (kind === 'pugnali') {
      M(g, API.cap(0.025, 0.14), WM.leather, 0, 0.08, 0);
      M(g, API.BOX, WM.gold, 0, 0, 0, 0, 0, 0, 0.18, 0.04, 0.07);
      M(g, API.BOX, WM.steel, 0, -0.27, 0, 0, 0, 0.05, 0.065, 0.48, 0.022);
      M(g, API.coneG(0.045, 0.14, 4), WM.steel, 0.012, -0.57, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.3);
      M(g, API.BOX, glow, 0, -0.27, 0, 0, 0, 0.05, 0.016, 0.42, 0.026);
      g.userData.len = 0.6; g.userData.trail = 0.42;
    } else if (kind === 'bastone') {
      M(g, new T.CylinderGeometry(0.028, 0.034, 1.95, 8), WM.wood, 0, 0.12, 0);
      M(g, new T.CylinderGeometry(0.045, 0.03, 0.08, 8), WM.gold, 0, -0.84, 0);
      const head = new T.Group(); head.position.y = 1.12; g.add(head);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; M(head, API.coneG(0.025, 0.28, 4), WM.gold, Math.cos(a) * 0.08, 0.08, Math.sin(a) * 0.08, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      M(head, new T.TorusGeometry(0.08, 0.016, 5, 14), WM.gold, 0, -0.04, 0, Math.PI / 2, 0, 0);
      const orb = M(head, new T.IcosahedronGeometry(0.11, 1), glowM(rc === RAR[0].c ? '#7fd4ff' : rc, 2.6), 0, 0.14, 0);
      const spr = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr(rc === RAR[0].c ? '#7fd4ff' : rc, 2), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      spr.scale.setScalar(0.8); spr.position.y = 0.14; head.add(spr);
      g.userData.orb = orb; g.userData.spr = spr; g.userData.tip = head; g.userData.upright = true; g.userData.trail = 0.001;
    } else if (kind === 'tomo') {
      const book = new T.Group(); g.add(book); book.position.set(0, 0.05, 0.22);
      M(book, API.BOX, std(rar >= 4 ? '#5a2a10' : '#3a1f52', 0.7, 0.1), 0, 0, 0, 0, 0, 0, 0.3, 0.38, 0.07);
      M(book, API.BOX, WM.cloth, 0.012, 0, 0, 0, 0, 0, 0.28, 0.36, 0.075);
      M(book, API.BOX, WM.gold, -0.15, 0, 0, 0, 0, 0, 0.02, 0.38, 0.075);
      M(book, new T.TorusGeometry(0.07, 0.012, 4, 16), glowM(rc === RAR[0].c ? '#d0a0ff' : rc, 2.6), 0, 0, 0.04);
      const spr = new T.Sprite(new T.SpriteMaterial({ map: API.dot, color: hdr(rc === RAR[0].c ? '#c06bff' : rc, 1.4), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      spr.scale.setScalar(0.7); book.add(spr);
      g.userData.book = book; g.userData.upright = true; g.userData.trail = 0.001;
    } else if (kind === 'scettro') {
      M(g, new T.CylinderGeometry(0.02, 0.026, 0.7, 6), WM.darkWood, 0, -0.1, 0);
      M(g, new T.OctahedronGeometry(0.07, 0), glowM('#c06bff', 2.8), 0, 0.32, 0, 0, 0, 0, 1, 1.6, 1);
      M(g, new T.TorusGeometry(0.06, 0.01, 4, 12), WM.gold, 0, 0.26, 0, Math.PI / 2, 0, 0);
      g.userData.trail = 0.001;
    } else if (kind === 'arco') {
      const R0 = 0.66, bow = new T.Group(); g.add(bow);
      const geo = new T.TorusGeometry(R0, 0.022, 5, 20, Math.PI * 0.9); geo.rotateZ(-Math.PI * 0.45); geo.rotateY(-Math.PI / 2); geo.translate(0, 0, -R0 + 0.04);
      M(bow, geo, rar >= 4 ? WM.gold : WM.wood, 0, 0, 0);
      M(bow, API.BOX, WM.leather, 0, 0, 0.04, 0, 0, 0, 0.05, 0.16, 0.05);
      const ey = Math.sin(Math.PI * 0.45) * R0, ez = Math.cos(Math.PI * 0.45) * R0 - R0 + 0.04;
      for (const s of [-1, 1]) M(bow, API.sph(0.025, 6, 5), glow, 0, s * ey, ez);
      const str = M(bow, new T.CylinderGeometry(0.004, 0.004, 1, 3), WM.string, 0, 0, ez);
      str.scale.y = ey * 2;
      bow.userData = { ey, ez, str };
      g.userData.bow = bow; g.userData.upright = true; g.userData.trail = 0.001;
    } else if (kind === 'scudo') {
      const sh = new T.Shape();
      sh.moveTo(0, 0.42); sh.lineTo(0.3, 0.32); sh.lineTo(0.28, -0.06); sh.quadraticCurveTo(0.18, -0.38, 0, -0.55); sh.quadraticCurveTo(-0.18, -0.38, -0.28, -0.06); sh.lineTo(-0.3, 0.32); sh.closePath();
      const geo = new T.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 1 });
      const s = new T.Group(); g.add(s);
      M(s, geo, std(rar >= 2 ? '#2a3a6a' : '#7a2020', 0.5, 0.4), 0, 0, 0);
      const rim = new T.EdgesGeometry(geo, 30);
      const rl = new T.LineSegments(rim, new T.LineBasicMaterial({ color: '#e0c060' })); s.add(rl);
      M(s, API.BOX, WM.gold, 0, -0.03, 0.075, 0, 0, 0, 0.07, 0.62, 0.02);
      M(s, API.BOX, WM.gold, 0, 0.12, 0.075, 0, 0, 0, 0.42, 0.07, 0.02);
      M(s, new T.OctahedronGeometry(0.05, 0), glowM(rc === RAR[0].c ? '#ffe08a' : rc, 2.6), 0, 0.12, 0.1);
      s.rotation.y = -0.75; s.position.set(-0.12, 0.05, 0.06);
      g.userData.shield = s; g.userData.trail = 0.001;
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function refreshWeapons() {
    weaponDirty = false;
    if (!H || !R) return;
    const C = CLS();
    const w = R.eq.weapon, off = R.eq.off;
    let kindR = null, kindL = null, rarR = w ? w.r : 0, rarL = off ? off.r : 0;
    const wk = w ? w.b : null;
    if (R.cls === 'slime') kindR = null;
    else if (R.cls === 'imperatore') { kindR = wk || 'imperiale'; if (kindR === 'spadone' || kindR === 'spada') kindR = 'imperiale'; rarR = Math.max(rarR, 5); }
    else kindR = wk || C.w;
    if (kindR === 'arco') { kindL = 'arco'; kindR = null; rarL = rarR; }
    else if (kindR === 'tomo') { kindL = 'tomo'; kindR = 'scettro'; rarL = rarR; }
    else if (kindR === 'pugnali') kindL = 'pugnali';
    if (!kindL && off && BASES[off.b] && BASES[off.b].slot === 'off' && kindR !== 'spadone' && kindR !== 'bastone' && kindR !== 'imperiale') kindL = 'scudo';
    if (!kindL && !off && R.cls === 'paladino' && kindR === 'spada') { kindL = 'scudo'; rarL = 0; }
    const key = [kindR, rarR, kindL, rarL, R.cls].join('|');
    if (key === LOOK.key) return;
    LOOK.key = key;
    clearWeapon(LOOK.weaponR); clearWeapon(LOOK.weaponL); LOOK.weaponR = LOOK.weaponL = null;
    const useOwn = R.cls !== 'slime';
    if (H.sword) {
      // keep the original glowing blade only for the slime's human form; the class weapons replace it
      for (const c of H.sword.children) c.visible = !useOwn;
    }
    if (kindR) { const g = buildWeapon(kindR, rarR, false); g.position.set(0, -0.66, 0.04); H.armR.add(g); LOOK.weaponR = g; }
    if (kindL) { const g = buildWeapon(kindL, rarL, true); g.position.set(0, -0.66, 0.04); H.armL.add(g); LOOK.weaponL = g; if (kindL === 'pugnali') g.rotation.y = Math.PI; }
    // sword trail length follows the weapon (scale the hidden engine sword pivot)
    if (H.sword && useOwn) { const tl = LOOK.weaponR && LOOK.weaponR.userData.trail != null ? LOOK.weaponR.userData.trail : 0.001; H.sword.scale.setScalar(tl); }
    else if (H.sword) H.sword.scale.setScalar(1);
  }
  const ARMQ = new T.Quaternion(), ARME = new T.Euler();
  function animateWeapons(dt, t) {
    if (!H || !R || !H.root.visible) return;
    const atk = P.atk, k = atk ? atk.t / atk.dur : 0, ranged = R.cls === 'arciere' || R.cls === 'mago' || R.cls === 'evocatore' || (R.eq.weapon && ['arco', 'bastone', 'tomo'].includes(R.eq.weapon.b));
    const wr = LOOK.weaponR, wl = LOOK.weaponL;
    if (wl && wl.userData.bow) {
      // archer pose: left arm points forward when shooting/aiming, bow stays vertical
      const aim = atk ? Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) : (API.input && API.input.lock ? 0.6 : 0);
      H.armL.rotation.x = lerp(H.armL.rotation.x, -1.45 * aim - 0.1, 1); H.armL.rotation.z = -0.1 * aim;
      H.armR.rotation.x = lerp(H.armR.rotation.x, -1.3 * aim, 1); H.armR.rotation.z = 0.5 * aim;
      wl.rotation.x = -H.armL.rotation.x; wl.rotation.z = 0;
      const b = wl.userData.bow.userData; b.str.position.z = b.ez - (atk && k < 0.45 ? k * 0.5 : 0);
    } else if (wl && wl.userData.shield) {
      if (!atk) { H.armL.rotation.x = -0.55; H.armL.rotation.z = 0.25; }
      else { H.armL.rotation.x = -0.9; H.armL.rotation.z = 0.35; }
    } else if (wl && wl.userData.book) {
      H.armL.rotation.x = -0.75; H.armL.rotation.z = 0.12;
      wl.rotation.x = -H.armL.rotation.x - 0.35;
      const bk = wl.userData.book; bk.position.y = 0.05 + Math.sin(t * 2.2) * 0.03; bk.rotation.y = Math.sin(t * 1.3) * 0.15;
    } else if (wl && R.eq.weapon && R.eq.weapon.b === 'pugnali' || (wl && !R.eq.weapon && CLS().w === 'pugnali')) {
      if (atk && P.combo % 2) { H.armL.rotation.x = -1.4; H.armL.rotation.z = lerp(-1.4, 1.2, Math.min(1, k * 2.2)); }
    }
    if (wr && wr.userData.upright) {
      // staff: keep upright, tip forward while casting
      const want = atk ? Math.sin(Math.min(1, k * 1.8) * Math.PI) * 1.25 : 0;
      if (ranged && atk) { H.armR.rotation.x = -1.2 * Math.sin(Math.min(1, k * 1.5) * Math.PI) - 0.2; H.armR.rotation.z = 0; }
      wr.rotation.x = -H.armR.rotation.x + want; wr.rotation.z = -H.armR.rotation.z;
      if (wr.userData.orb) { wr.userData.orb.rotation.y += dt * 2; wr.userData.spr.scale.setScalar(0.7 + Math.sin(t * 5) * 0.08 + (atk ? 0.5 : 0)); }
    } else if (ranged && atk && wr) { H.armR.rotation.x = -1.3; H.armR.rotation.z = 0; }
    if (LOOK.cape && LOOK.cape.visible) { const sp = Math.hypot(P.vx, P.vz); LOOK.cape.rotation.x = 0.08 + Math.min(0.9, sp * 0.09) + Math.sin(t * 4) * 0.04; }
    if (LOOK.aura && LOOK.aura.visible) { LOOK.aura.rotation.z += dt * 1.5; LOOK.aura.position.y = 0.9 + Math.sin(t * 2) * 0.35; }
    void ARMQ; void ARME;
  }

  /* ================================================================ UI: styles */
  const CSS = `
#rpgx{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(0,0,0,.35),rgba(0,0,0,.72));
 font-family:"Palatino Linotype","Book Antiqua",Georgia,serif;color:#efe3c0;pointer-events:auto}
#rpgx.on{display:flex}
#rpgx .rw{position:relative;width:min(98vw,940px);height:min(96vh,600px);display:flex;flex-direction:column;background:linear-gradient(#1f1a11,#0d0a06);
 border:1px solid rgba(220,190,120,.65);box-shadow:0 0 40px rgba(240,190,90,.18),inset 0 0 40px rgba(0,0,0,.65);border-radius:4px;overflow:hidden}
#rpgx .rw::before,#rpgx .rw::after{content:'';position:absolute;width:26px;height:26px;border:2px solid #d6ba78;pointer-events:none}
#rpgx .rw::before{left:3px;top:3px;border-right:0;border-bottom:0}#rpgx .rw::after{right:3px;bottom:3px;border-left:0;border-top:0}
#rpgx .rw.blue{background:linear-gradient(rgba(8,20,40,.97),rgba(3,8,18,.98));border-color:rgba(120,200,255,.75);box-shadow:0 0 34px rgba(80,180,255,.35),inset 0 0 40px rgba(40,120,200,.12);color:#d8f1ff}
#rpgx .rw.blue::before,#rpgx .rw.blue::after{border-color:#7fd4ff}
#rpgx .rh{display:flex;align-items:flex-end;gap:2px;padding:6px 52px 0 12px;border-bottom:1px solid rgba(220,190,120,.3);flex:none}
#rpgx .rw.blue .rh{border-color:rgba(120,200,255,.3)}
#rpgx .rt{padding:8px 14px 7px;font-size:15px;color:#b8a57a;cursor:pointer;border:1px solid transparent;border-bottom:0;border-radius:4px 4px 0 0;letter-spacing:1px;white-space:nowrap}
#rpgx .rt.on{color:#ffe7a8;background:rgba(255,220,140,.08);border-color:rgba(220,190,120,.4)}
#rpgx .rw.blue .rt{color:#7fa8c8}#rpgx .rw.blue .rt.on{color:#bfe9ff;background:rgba(120,200,255,.1);border-color:rgba(120,200,255,.4)}
#rpgx .rtitle{margin-left:auto;font-size:13px;color:#a8987a;padding-bottom:8px;white-space:nowrap}
#rpgx .rx{position:absolute;right:6px;top:5px;width:40px;height:36px;font-size:20px;line-height:34px;text-align:center;color:#efe3c0;border:1px solid rgba(220,190,120,.45);
 background:rgba(60,48,26,.6);border-radius:3px;cursor:pointer;z-index:2}
#rpgx .rb{flex:1;min-height:0;display:flex;gap:10px;padding:8px 10px 10px;overflow:auto}
#rpgx .col{display:flex;flex-direction:column;min-width:0;min-height:0}
#rpgx .sec{font-size:12px;letter-spacing:2px;color:#c9b27a;margin:2px 0 5px;text-transform:uppercase}
#rpgx .rw.blue .sec{color:#7fd4ff}
#rpgx .grid{display:grid;grid-template-columns:repeat(8,var(--c,44px));grid-auto-rows:var(--c,44px);gap:3px}
#rpgx .cell{position:relative;border:1px solid rgba(214,186,120,.28);background:rgba(0,0,0,.42);border-radius:4px;cursor:pointer;box-shadow:inset 0 0 8px rgba(0,0,0,.8)}
#rpgx .cell img{position:absolute;inset:1px;width:calc(100% - 2px);height:calc(100% - 2px);border-radius:3px;pointer-events:none}
#rpgx .cell b{position:absolute;right:2px;bottom:0;font-size:11px;color:#fff;text-shadow:0 0 3px #000,0 0 2px #000;font-weight:normal}
#rpgx .cell i{position:absolute;left:2px;top:0;font-size:9px;color:#d8c79a;font-style:normal;text-shadow:0 0 3px #000}
#rpgx .cell.sel{outline:2px solid #fff;outline-offset:-1px;box-shadow:0 0 12px rgba(255,255,255,.5)}
#rpgx .cell.eqd::after{content:'E';position:absolute;right:2px;top:0;font-size:9px;color:#7dffb0}
#rpgx .cell.up::before{content:'▲';position:absolute;left:2px;bottom:0;font-size:10px;color:#7dff7d;text-shadow:0 0 3px #000;z-index:1}
#rpgx .cell .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6a5c40;text-align:center;line-height:1}
#rpgx .doll{display:grid;grid-template-columns:repeat(3,50px);grid-auto-rows:50px;gap:5px;align-content:start;justify-content:center;position:relative}
#rpgx .doll .cell{--c:50px}
#rpgx .doll .fig{grid-column:2;grid-row:2 / span 2;border-radius:6px;display:flex;align-items:center;justify-content:center;
 background:radial-gradient(circle at 50% 40%,rgba(255,220,140,.12),transparent 70%)}
#rpgx .doll .fig img{width:100%;opacity:.95}
#rpgx .det{flex:1 1 240px;min-width:220px;background:rgba(0,0,0,.35);border:1px solid rgba(214,186,120,.22);border-radius:4px;padding:8px 10px;overflow:auto;font-size:13px;line-height:1.4}
#rpgx .det h3{margin:0 0 2px;font-weight:normal;font-size:16px}
#rpgx .det .m{color:#a8987a;font-size:12px}
#rpgx .det .st{color:#fff3d6}#rpgx .det .af{color:#9fd8ff}#rpgx .det .up{color:#7dff7d}#rpgx .det .dn{color:#ff7a6a}
#rpgx .det hr{border:0;border-top:1px solid rgba(214,186,120,.22);margin:6px 0}
#rpgx .btns{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
#rpgx .bt{flex:1 1 auto;min-width:86px;padding:8px 10px;font:inherit;font-size:14px;color:#efe3c0;background:rgba(60,48,26,.7);border:1px solid rgba(220,190,120,.45);border-radius:3px;cursor:pointer;text-align:center}
#rpgx .bt:active,#rpgx .bt.on{background:rgba(140,110,50,.7)}
#rpgx .bt.pri{border-color:rgba(255,210,120,.9);box-shadow:0 0 10px rgba(255,190,90,.3)}
#rpgx .bt.off{opacity:.4;pointer-events:none}
#rpgx .rw.blue .bt{color:#d8f1ff;background:rgba(20,60,100,.55);border-color:rgba(120,200,255,.5)}
#rpgx .bar2{height:8px;background:rgba(0,0,0,.55);border:1px solid rgba(214,186,120,.4);border-radius:2px;overflow:hidden;margin:2px 0 4px}
#rpgx .bar2 i{display:block;height:100%}
#rpgx .rw.blue .bar2{border-color:rgba(120,200,255,.45)}
#rpgx .kv{display:flex;justify-content:space-between;gap:8px;padding:2px 0;border-bottom:1px dotted rgba(120,200,255,.14);font-size:13px}
#rpgx .kv b{font-weight:normal;color:#fff}
#rpgx .att{display:flex;align-items:center;gap:6px;padding:3px 0}
#rpgx .att .an{flex:1}#rpgx .att .an small{display:block;font-size:10.5px;color:#7fa8c8}
#rpgx .att .av{min-width:44px;text-align:right;font-size:16px;color:#fff}
#rpgx .att .ap{width:40px;height:34px;padding:0;font-size:20px;min-width:0;flex:none}
#rpgx .sk{display:flex;align-items:center;gap:8px;padding:5px 6px;border:1px solid rgba(120,200,255,.18);border-radius:4px;margin-bottom:4px;background:rgba(10,30,60,.35)}
#rpgx .sk .si{width:38px;height:38px;flex:none;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:21px;background:rgba(0,0,0,.5);border:1px solid rgba(120,200,255,.4)}
#rpgx .sk.lock{opacity:.45}
#rpgx .sk .sn{flex:1;min-width:0}#rpgx .sk .sn small{display:block;font-size:11px;color:#9fc0d8;line-height:1.25}
#rpgx .sk .bt{min-width:44px;flex:none;padding:6px 8px;font-size:13px}
#rpgx .shopi{display:flex;align-items:center;gap:8px;padding:4px;border:1px solid rgba(214,186,120,.2);border-radius:4px;margin-bottom:3px;cursor:pointer;background:rgba(0,0,0,.25)}
#rpgx .shopi.sel{border-color:#fff}
#rpgx .shopi img{width:40px;height:40px;flex:none}
#rpgx .shopi .pn{flex:1;min-width:0;font-size:13px;line-height:1.2}#rpgx .shopi .pn small{color:#a8987a;font-size:11px}
#rpgx .shopi .pr{color:#ffe08a;font-size:14px;white-space:nowrap}
#rpgx .gold{color:#ffe08a}
#rpgx .scroll{overflow:auto;min-height:0;flex:1}
@media (max-width:760px){#rpgx .grid{--c:38px}#rpgx .doll{grid-template-columns:repeat(3,42px);grid-auto-rows:42px}#rpgx .rt{padding:7px 9px;font-size:13px}#rpgx .det{min-width:180px}}
@media (max-height:420px){#rpgx .grid{--c:36px}#rpgx .doll{grid-template-columns:repeat(3,40px);grid-auto-rows:40px;gap:4px}}
#rpgfeed{position:fixed;right:calc(14px + env(safe-area-inset-right));bottom:42px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;pointer-events:none;z-index:5}
#rpgfeed .lf{display:flex;align-items:center;gap:6px;background:linear-gradient(90deg,transparent,rgba(0,0,0,.65));padding:2px 8px 2px 18px;font-size:13px;text-shadow:0 1px 2px #000;
 font-family:"Palatino Linotype",Georgia,serif;animation:lfin .35s ease-out}
#rpgfeed .lf img{width:22px;height:22px}
@keyframes lfin{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
#dmg div.xp{color:#d9b0ff;font-size:13px!important;text-shadow:0 0 6px rgba(160,100,255,.8),0 1px 2px #000}
#dmg div.gold{color:#ffe08a;font-size:13px!important}
#xpb{height:6px!important;margin-top:1px}#xpb i{background:linear-gradient(90deg,#8a5cff,#d9a8ff)}#xpb.fl i{background:linear-gradient(90deg,#ffe08a,#fff6d0)}
#xpb span{top:-3px!important;font-size:8.5px!important}
#flask{top:66px!important}
#rpglv{position:absolute;left:calc(70px + env(safe-area-inset-left));top:83px;font-size:11px;color:#d9c8ff;text-shadow:0 1px 2px #000;letter-spacing:.5px;white-space:nowrap}
#rpglv b{color:#ffe7a8;font-weight:normal}
#rpgnew{position:fixed;inset:0;z-index:46;display:none;font-family:"Palatino Linotype","Book Antiqua",Georgia,serif;color:#efe3c0;pointer-events:auto;
 background:radial-gradient(ellipse 30% 62% at 50% 52%,rgba(0,0,0,0),rgba(0,0,0,.2) 55%,rgba(4,3,2,.9) 100%)}
#rpgnew.on{display:block}
#rpgnew .nt{position:absolute;left:0;right:0;top:4px;text-align:center;font-size:clamp(17px,3.2vw,30px);letter-spacing:6px;color:#f3d27a;text-shadow:0 0 18px rgba(255,200,90,.45),0 2px 4px #000;pointer-events:none}
#rpgnew .nt small{display:block;font-size:11px;letter-spacing:3px;color:#c9b27a}
#rpgnew .nl,#rpgnew .nr{position:absolute;top:50px;bottom:8px;width:min(31vw,300px);overflow:auto}
#rpgnew .nl{left:calc(8px + env(safe-area-inset-left));display:grid;grid-template-columns:1fr 1fr;gap:5px;align-content:start}
#rpgnew .nr{right:calc(8px + env(safe-area-inset-right));background:linear-gradient(rgba(24,18,10,.9),rgba(10,8,5,.94));border:1px solid rgba(220,190,120,.55);border-radius:4px;padding:9px 11px;display:flex;flex-direction:column;overflow:hidden}
#rpgnew .nrd{flex:1;min-height:0;overflow:auto;padding-right:2px}
#rpgnew .nc{flex:none;text-align:center;padding-top:7px;border-top:1px solid rgba(220,190,120,.25);margin-top:5px}
#rpgnew .cc{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px 5px;cursor:pointer;text-align:center;background:linear-gradient(rgba(20,15,8,.92),rgba(20,15,8,.75));border:1px solid rgba(220,190,120,.3);border-radius:4px}
#rpgnew .cc img{width:42px;height:42px;flex:none}
#rpgnew .cc .cn{font-size:13px;line-height:1.1}#rpgnew .cc .cn small{display:block;font-size:10px;color:#a8987a;margin-top:1px}
#rpgnew .cc.on{border-color:#f3d27a;box-shadow:0 0 14px rgba(255,200,90,.35),inset 0 0 12px rgba(255,200,90,.15);background:linear-gradient(rgba(70,52,20,.95),rgba(30,22,10,.85))}
#rpgnew .cc.my{border-color:rgba(255,207,64,.8);animation:myth 2s infinite;grid-column:1 / span 2;flex-direction:row;justify-content:center;gap:8px}
@keyframes myth{50%{box-shadow:0 0 18px rgba(255,207,64,.65)}}
#rpgnew h2{margin:0;font-weight:normal;font-size:19px;letter-spacing:1px;line-height:1.1}
#rpgnew .ds{font-size:12.5px;line-height:1.38;color:#d8c9a2;margin:6px 0}
#rpgnew .sb{display:flex;align-items:center;gap:6px;font-size:12px;margin:1px 0}
#rpgnew .sb span{width:82px;color:#c9b27a}#rpgnew .sb .bar2{flex:1;height:7px;background:rgba(0,0,0,.6);border:1px solid rgba(214,186,120,.35)}#rpgnew .sb .bar2 i{display:block;height:100%}
#rpgnew .sb b{width:22px;text-align:right;font-weight:normal}
#rpgnew .sk{display:flex;align-items:center;gap:6px;font-size:12.5px;margin:2px 0}#rpgnew .sk em{font-style:normal;font-size:16px;width:22px;text-align:center}#rpgnew .sk small{color:#a8987a;margin-left:auto}
#rpgnew input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;text-align:center;padding:6px 9px;background:rgba(11,9,5,.88);color:#ffe7a8;border:1px solid #d6ba78;border-radius:3px;outline:none;user-select:text;-webkit-user-select:text;margin:0 0 6px}
#rpgnew .go{display:block;width:100%;padding:10px;font:inherit;font-size:17px;letter-spacing:2px;color:#1a1206;background:linear-gradient(#ffe08a,#c9962e);border:1px solid #fff0c0;border-radius:3px;cursor:pointer;box-shadow:0 0 18px rgba(255,200,90,.45)}
#rpgnew .cancel{display:block;width:100%;margin-top:5px;padding:6px;font:inherit;font-size:13px;color:#efe3c0;background:rgba(60,48,26,.7);border:1px solid rgba(220,190,120,.4);border-radius:3px;cursor:pointer}
#rpgnew .lbl{font-size:10px;letter-spacing:3px;color:#c9b27a;text-shadow:0 1px 3px #000;margin-bottom:2px;text-align:left}
#rpgnew .nc .row2{display:flex;gap:6px;align-items:center}#rpgnew .nc .row2 input{margin:0;flex:1;min-width:0}
#rpgnew .go{margin-top:6px}
#rpgtip{position:fixed;z-index:70;display:none;pointer-events:none;width:250px;padding:8px 10px;font:13px/1.4 "Palatino Linotype",Georgia,serif;color:#efe3c0;
 background:linear-gradient(rgba(24,18,10,.97),rgba(10,8,5,.97));border:1px solid rgba(220,190,120,.7);border-radius:4px;box-shadow:0 0 18px rgba(0,0,0,.7)}
#rpgtip h3{margin:0 0 2px;font-weight:normal;font-size:15px}#rpgtip .m{color:#a8987a;font-size:12px}#rpgtip .st{color:#fff3d6}#rpgtip .af{color:#9fd8ff}
#rpgtip .up{color:#7dff7d}#rpgtip .dn{color:#ff7a6a}#rpgtip hr{border:0;border-top:1px solid rgba(214,186,120,.22);margin:5px 0}
#rpgcf{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:"Palatino Linotype",Georgia,serif;pointer-events:auto}
#rpgcf.on{display:flex}#rpgcf .box{text-align:center;max-width:min(92vw,420px)}
`;
  function injectCSS() {
    if ($('rpgcss')) return;
    const st = document.createElement('style'); st.id = 'rpgcss'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* ================================================================ UI: confirm dialog */
  function confirmBox(text, yes, no) {
    let el = $('rpgcf');
    if (!el) { el = document.createElement('div'); el.id = 'rpgcf'; el.innerHTML = '<div class="box"><div class="t" style="font-size:15px;line-height:1.45;margin-bottom:10px"></div><button class="y">Conferma</button><button class="n">Annulla</button></div>'; document.body.appendChild(el); }
    el.querySelector('.t').innerHTML = text;
    el.classList.add('on');
    const y = el.querySelector('.y'), n = el.querySelector('.n');
    y.onclick = (ev) => { ev.stopPropagation(); el.classList.remove('on'); sfx('select'); if (yes) yes(); };
    n.onclick = (ev) => { ev.stopPropagation(); el.classList.remove('on'); sfx('uiBack'); if (no) no(); };
  }

  /* ================================================================ HUD: XP bar, level badge */
  let xpFlash = 0, potT = 0;
  const HUDS = { last: '' };
  function buildHUD() {
    const bars = document.querySelector('#hud .bars');
    if (bars && !$('xpb')) {
      const b = document.createElement('div'); b.className = 'bar'; b.id = 'xpb'; b.innerHTML = '<i></i><span></span>'; bars.appendChild(b);
    }
    if (!$('rpglv')) { const d = document.createElement('div'); d.id = 'rpglv'; $('hud').appendChild(d); }
    if (!$('rpgfeed')) { const d = document.createElement('div'); d.id = 'rpgfeed'; document.body.appendChild(d); }
  }
  function hud() {
    const now = performance.now(), dt = Math.min(0.1, (now - (hud.t || now)) / 1000); hud.t = now;
    menuTick(dt);
    if (!R) return;
    const xb = $('xpb');
    if (xb) {
      const need = xpNext(R.lv), pct = R.lv >= MAXLV ? 100 : (100 * R.xp) / need;
      const w = $('hp') ? $('hp').style.width : '20vw';
      if (xb.style.width !== w) xb.style.width = w;
      xb.querySelector('i').style.width = pct.toFixed(1) + '%';
      const tx = R.lv >= MAXLV ? 'MAX' : `${fmt(R.xp)} / ${fmt(need)}`;
      if (xb._t !== tx) { xb._t = tx; xb.querySelector('span').textContent = tx; }
      if (xpFlash > 0) { xpFlash -= dt; xb.classList.toggle('fl', xpFlash > 0 && (xpFlash * 8 | 0) % 2 === 0); } else if (xb.classList.contains('fl')) xb.classList.remove('fl');
    }
    const lv = $('rpglv');
    if (lv) {
      const C = CLS(), hint = (R.pts > 0 ? ` · <b>+${R.pts} punti</b>` : '') + (R.sp > 0 ? ` · <b>+${R.sp} abilità</b>` : '');
      const s = `Lv <b>${R.lv}</b> · ${esc(C.n)}${hint}`;
      if (HUDS.last !== s) { HUDS.last = s; lv.innerHTML = s; }
    }
    potT -= dt;
    if (potT <= 0) {
      potT = 0.5;
      let n = 0; for (const it of R.inv) if (it && BASES[it.b] && BASES[it.b].heal) n += it.q || 1;
      const b = API.buttons && API.buttons.rpgpot;
      if (b && b._n !== n) { b._n = n; b.innerHTML = `🧪<small style="position:absolute;right:2px;bottom:0;font-size:10px;color:#fff">${n}</small>`; b.style.opacity = n ? '' : '0.5'; }
    }
    const pb = document.querySelector('#portrait b');
    if (pb && pb.textContent !== String(R.lv)) pb.textContent = R.lv;
    // enemy level next to the locked name / boss name
    const L = API.input && API.input.lock;
    const lk = $('locked');
    if (L && !L.dead && lk && lk.style.display !== 'none' && !L.d.boss) {
      const want = `${L.elite ? '★ Campione · ' : ''}${L.d.name}  · Lv ${enemyLevel(L)}`;
      if (lk.textContent !== want) { lk.textContent = want; lk.style.color = levelColor(enemyLevel(L)); }
    }
    const bn = document.querySelector('#boss .name');
    if (bn && $('boss').style.display !== 'none') {
      const boss = API.enemies.find((e) => e.d.boss && e.engaged && !e.dead);
      if (boss && bn.textContent.indexOf('Lv ') < 0) bn.textContent = bn.textContent + '   · Lv ' + enemyLevel(boss);
    }
  }
  function levelColor(L) {
    const d = L - (R ? R.lv : 1);
    return d >= 8 ? '#ff4a3a' : d >= 4 ? '#ff9a3a' : d >= -3 ? '#ffffff' : d >= -8 ? '#9fe89a' : '#9a9a9a';
  }

  /* ================================================================ panels: inventory / status / skills / shop / trainer */
  const UI = { open: false, tab: 'inv', sel: null, shop: null, shopSel: null, prevState: 'play' };
  let invDirty = true;
  function panelRoot() {
    let el = $('rpgx');
    if (el) return el;
    el = document.createElement('div'); el.id = 'rpgx';
    el.innerHTML = '<div class="rw"><div class="rh"></div><div class="rx">✕</div><div class="rb"></div></div>';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.querySelector('.rx').addEventListener('click', () => closePanel());
    el.addEventListener('click', (ev) => { if (ev.target === el) closePanel(); });
    return el;
  }
  function openPanel(tab, shop) {
    if (!R) return;
    if (API.state === 'dead' || API.state === 'cine') return;
    if (!UI.open) UI.prevState = API.state === 'menu' ? 'play' : API.state;
    UI.open = true; UI.tab = tab; UI.shop = shop || null; UI.sel = null; UI.shopSel = null;
    if (API.state === 'play') API.state = 'menu';
    if (API.input) API.input.lock = null;
    panelRoot().classList.add('on');
    sfx('ui', { vol: 0.6 });
    render();
  }
  function closePanel() {
    if (!UI.open) return;
    UI.open = false; UI.shop = null;
    const el = $('rpgx'); if (el) el.classList.remove('on');
    hideTip();
    if (API.state === 'menu') API.state = 'play';
    sfx('uiBack', { vol: 0.5 });
    API.saveS();
  }
  function tabs(list, cur) {
    return list.map(([k, n]) => `<div class="rt${k === cur ? ' on' : ''}" data-tab="${k}">${n}</div>`).join('');
  }
  function render() {
    const el = panelRoot(), rw = el.querySelector('.rw'), rh = el.querySelector('.rh'), rb = el.querySelector('.rb');
    const blue = UI.tab === 'stat' || UI.tab === 'skill' || UI.tab === 'train';
    rw.classList.toggle('blue', blue);
    const gold = `<span class="rtitle">◈ <span class="gold">${fmt(S.runes)}</span> anime</span>`;
    if (UI.tab === 'shop') rh.innerHTML = tabs([['shop', SHOPS[UI.shop] ? SHOPS[UI.shop].n : 'Negozio'], ['sell', 'Vendi']], 'shop') + gold;
    else if (UI.tab === 'sell') rh.innerHTML = tabs([['shop', SHOPS[UI.shop] ? SHOPS[UI.shop].n : 'Negozio'], ['sell', 'Vendi']], 'sell') + gold;
    else if (UI.tab === 'train') rh.innerHTML = tabs([['train', 'Accademia di Magia']], 'train') + gold;
    else rh.innerHTML = tabs([['inv', '🎒 Zaino'], ['stat', '《 Stato 》'], ['skill', '✦ Abilità']], UI.tab) + gold;
    rh.querySelectorAll('.rt').forEach((t) => t.addEventListener('click', () => { UI.tab = t.dataset.tab; UI.sel = null; sfx('select', { vol: 0.5 }); render(); }));
    if (UI.tab === 'inv' || UI.tab === 'sell') rb.innerHTML = invHTML(UI.tab === 'sell');
    else if (UI.tab === 'stat') rb.innerHTML = statHTML();
    else if (UI.tab === 'skill') rb.innerHTML = skillHTML();
    else if (UI.tab === 'shop') rb.innerHTML = shopHTML();
    else if (UI.tab === 'train') rb.innerHTML = trainHTML();
    bindPanel(rb);
    invDirty = false;
  }
  // ---------- inventory
  function eqFor(it) {
    const s = slotOf(it); if (!s) return null;
    if (s === 'ring') return R.eq.ring1 && R.eq.ring2 ? R.eq.ring1 : null;
    return R.eq[s] || null;
  }
  function isUpgrade(it) {
    const B = BASES[it.b]; if (!B || B.cons) return false;
    const cur = eqFor(it);
    if (!cur) return canEquip(it) === true;
    return canEquip(it) === true && itemScore(it) > itemScore(cur) * 1.05;
  }
  function itemScore(it) {
    const b = baseStats(it), B = BASES[it.b], C = CLS();
    let s = (b.wdmg || 0) * 3 + (b.arm || 0) * 1.5 + (b.hp || 0) * 0.3 + (b.wspell || 0);
    for (const [k, v] of it.a || []) {
      const w = ['FOR', 'DES', 'INT'].includes(k) ? (C.main === 'ANY' || C.main === k ? 2.6 : 1) : k === 'VIT' || k === 'SAG' ? 2 : k === 'hp' ? 0.3 : k === 'fp' ? 0.4 : k === 'spell' ? (C.main === 'INT' ? 3 : 1) : AFF[k] && AFF[k].pct ? 2.5 : 1;
      s += v * w;
    }
    if (B && B.slot === 'weapon' && C.main !== 'ANY' && B.stat !== C.main) s *= 0.55;
    return s;
  }
  function canEquip(it) {
    const B = BASES[it.b]; if (!B || B.cons) return 'Non equipaggiabile';
    if (B.slot === 'off') {
      const w = R.eq.weapon && BASES[R.eq.weapon.b];
      if (w && w.two) return 'Richiede la mano sinistra libera (arma a due mani)';
    }
    return true;
  }
  function equip(idx) {
    const it = R.inv[idx]; if (!it) return;
    const ok = canEquip(it); if (ok !== true) { toast(ok); sfx('uiBack'); return; }
    const B = BASES[it.b];
    let slot = B.slot;
    if (slot === 'ring') slot = !R.eq.ring1 ? 'ring1' : !R.eq.ring2 ? 'ring2' : 'ring1';
    const old = R.eq[slot] || null;
    R.eq[slot] = it; R.inv[idx] = old;
    if (slot === 'weapon' && B.two && R.eq.off) { const f = freeSlot(); if (f >= 0) { R.inv[f] = R.eq.off; R.eq.off = null; } }
    API.recalc(false); sfx('shield', { vol: 0.5 }); weaponDirty = true; UI.sel = { inv: idx };
    API.saveS(); render();
  }
  function unequip(slot) {
    const it = R.eq[slot]; if (!it) return;
    const f = freeSlot(); if (f < 0) { toast('Zaino pieno'); return; }
    R.inv[f] = it; R.eq[slot] = null;
    API.recalc(false); sfx('uiBack', { vol: 0.5 }); weaponDirty = true; UI.sel = { inv: f };
    API.saveS(); render();
  }
  function useItem(idx) {
    const it = R.inv[idx]; if (!it) return false;
    const B = BASES[it.b]; if (!B || !B.cons) return false;
    if (API.state === 'dead') return false;
    const gy = heightAt(P.x, P.z);
    if (B.heal) {
      if (P.hp >= P.maxHp && !B.fp && it.b !== 'pozione3') { toast('Vita già al massimo'); return false; }
      const h = Math.round(P.maxHp * B.heal * ST.healM); P.hp = Math.min(P.maxHp, P.hp + h);
      if (it.b === 'pozione3') P.fp = P.maxFp;
      dmgNum(P.x, gy + 2.2, P.z, '+' + h, 'heal'); API.emit(P.x, gy + 1, P.z, 26, B.col, { speed: 2, up: 3, grav: 0 }); sfx('heal');
    } else if (B.fp) { P.fp = Math.min(P.maxFp, P.fp + P.maxFp * B.fp); API.emit(P.x, gy + 1, P.z, 24, B.col, { speed: 2, up: 3, grav: 0 }); sfx('heal'); }
    else if (B.buff) { BUFF[B.buff] = 60; toast(B.n + ': attivo per 60 s'); sfx('skillGet'); API.emit(P.x, gy + 1, P.z, 30, B.col, { speed: 3, up: 4, grav: 0 }); }
    else if (B.ret) {
      if (API.enemies.some((e) => e.d.boss && e.engaged && !e.dead)) { toast('Non durante uno scontro!'); return false; }
      closePanel(); API.lightPillar(P.x, P.z, '#ffd36b', 1.4); sfx('portal');
      const f = $('fade'); if (f) f.style.opacity = 1;
      setTimeout(() => { API.teleport(METRO.x, METRO.z + 8); if (f) f.style.opacity = 0; API.bigMsg('Altheria', 'place', 2.5); }, 800);
    } else if (B.xpb) giveXP(Math.round(xpNext(R.lv) * B.xpb), P.x, P.z);
    else if (B.flask) { if (P.flasks >= S.flasks) { toast('Gelatine già cariche'); return false; } P.flasks++; sfx('heal'); toast('Gelatina Cremisi ricaricata'); }
    else if (B.respec) { respec(true); }
    it.q = (it.q || 1) - 1;
    if (it.q <= 0) R.inv[idx] = null;
    API.saveS(); invDirty = true;
    return true;
  }
  function quickPotion() {
    if (!R) return;
    const order = P.hp < P.maxHp * 0.45 ? ['pozione3', 'pozione2', 'pozione'] : ['pozione', 'pozione2', 'pozione3'];
    for (const b of order) { const i = R.inv.findIndex((x) => x && x.b === b); if (i >= 0) { if (useItem(i)) return; return; } }
    toast('Nessuna pozione di cura nello zaino');
  }
  function sortInv() {
    const ord = { weapon: 0, off: 1, head: 2, chest: 3, hands: 4, feet: 5, neck: 6, ring: 7 };
    const list = R.inv.filter(Boolean);
    list.sort((a, b) => {
      const A = BASES[a.b], B = BASES[b.b];
      if (!!A.cons !== !!B.cons) return A.cons ? 1 : -1;
      if (A.cons) return a.b < b.b ? -1 : 1;
      return (ord[A.slot] - ord[B.slot]) || (b.r - a.r) || (b.il - a.il);
    });
    R.inv = list.concat(new Array(40 - list.length).fill(null));
    UI.sel = null; sfx('select'); render();
  }
  function statLines(it) {
    const b = baseStats(it), out = [];
    if (b.wdmg) out.push(['Danno arma', b.wdmg, 'wdmg']);
    if (b.wspell) out.push(['Potere magico', '+' + b.wspell + '%', 'wspell', b.wspell]);
    if (b.arm) out.push(['Armatura', b.arm, 'arm']);
    if (b.hp) out.push(['Vita', '+' + b.hp, 'hp', b.hp]);
    if (b.crit) out.push(['Critico', '+' + b.crit + '%', 'crit', b.crit]);
    if (b.block) out.push(['Parata', b.block + '%', 'block', b.block]);
    return out;
  }
  const affText = (k, v) => `+${v}${AFF[k].n.startsWith(' ') || AFF[k].n.startsWith('%') ? AFF[k].n : ' ' + AFF[k].n}`;
  function detailHTML(it, where) {
    if (!it) return '<div class="m">Seleziona un oggetto per vederne i dettagli.<br><br>Tocca un oggetto, poi Equipaggia / Usa. Doppio tocco: azione rapida.<br><br>Tasti: <b>I</b> zaino · <b>C</b> stato · <b>U</b> abilità · <b>H</b> pozione</div>';
    const B = BASES[it.b], rc = RAR[it.r || 0].c;
    let h = `<h3 style="color:${B.cons ? '#ffe7a8' : rc}">${esc(itemName(it))}</h3>`;
    if (B.cons) {
      h += `<div class="m">Consumabile${it.q > 1 ? ' · ×' + it.q : ''}</div><hr><div>${esc(B.d || '')}</div>`;
    } else {
      const sl = SLOTS.find((s) => s.k === (B.slot === 'ring' ? 'ring1' : B.slot));
      h += `<div class="m">${RAR[it.r].n} · ${sl ? sl.n : ''}${B.two ? ' (due mani)' : ''} · Livello oggetto ${it.il}</div><hr>`;
      const cmp = where === 'eq' ? null : eqFor(it);
      const cb = cmp ? baseStats(cmp) : {};
      for (const [n, v, k, raw] of statLines(it)) {
        const val = raw != null ? raw : v;
        let diff = '';
        if (cmp || where !== 'eq') { const d = val - (cb[k] || 0); if (d) diff = ` <span class="${d > 0 ? 'up' : 'dn'}">(${d > 0 ? '+' : ''}${d})</span>`; }
        h += `<div class="st">${n}: <b>${v}</b>${diff}</div>`;
      }
      for (const [k, v] of it.a || []) h += `<div class="af">${affText(k, v)}</div>`;
      if (it.p && POWERS[it.p]) h += `<div style="color:${POWERS[it.p].col};margin-top:4px">✦ ${POWERS[it.p].n}<br><span style="font-size:12px;color:#d8c9a2">${POWERS[it.p].d}</span></div>`;
      if (it.r >= 4) h += `<div class="m" style="color:${rc};margin-top:4px;font-style:italic">${it.r === 5 ? '«Forgiato prima che i mondi fossero divisi.»' : '«Un nome che i bardi ricordano ancora.»'}</div>`;
      if (cmp) {
        h += `<hr><div class="m">Equipaggiato: <span style="color:${RAR[cmp.r].c}">${esc(itemName(cmp))}</span></div>`;
        const ds = itemScore(it) - itemScore(cmp);
        h += `<div class="${ds >= 0 ? 'up' : 'dn'}">${ds >= 0 ? '▲ Migliore' : '▼ Peggiore'} (${ds >= 0 ? '+' : ''}${Math.round(ds)} punteggio)</div>`;
      }
      const ce = canEquip(it); if (ce !== true) h += `<div class="dn" style="margin-top:4px">${ce}</div>`;
    }
    h += `<hr><div class="m">Valore: <span class="gold">${fmt(itemValue(it))}</span> · Vendita: <span class="gold">${fmt(sellValue(it))}</span> anime</div>`;
    return h;
  }
  function invHTML(selling) {
    const sel = UI.sel;
    let doll = '';
    const at = { head: [2, 1], neck: [3, 1], weapon: [1, 2], off: [3, 2], chest: [1, 3], hands: [3, 3], ring1: [1, 4], feet: [2, 4], ring2: [3, 4] };
    for (const s of SLOTS) {
      const it = R.eq[s.k], [c, r] = at[s.k];
      const on = sel && sel.eq === s.k ? ' sel' : '';
      doll += `<div class="cell${on}" data-eq="${s.k}" style="grid-column:${c};grid-row:${r};${it ? `border-color:${RAR[it.r].c}` : ''}">${it ? `<img src="${iconURL(it)}">` : `<div class="ph">${s.n}</div>`}</div>`;
    }
    doll += `<div class="fig" style="grid-column:2;grid-row:2 / span 2"><img src="${emblemURL(R.cls, 96)}"></div>`;
    let grid = '';
    R.inv.forEach((it, i) => {
      const on = sel && sel.inv === i ? ' sel' : '', up = it && isUpgrade(it) ? ' up' : '';
      grid += `<div class="cell${on}${up}" data-inv="${i}" style="${it ? `border-color:${BASES[it.b].cons ? 'rgba(214,186,120,.4)' : RAR[it.r].c}` : ''}">${it ? `<img src="${iconURL(it)}">${it.q > 1 ? `<b>${it.q}</b>` : ''}${!BASES[it.b].cons ? `<i>${it.il}</i>` : ''}` : ''}</div>`;
    });
    const it = sel ? (sel.inv != null ? R.inv[sel.inv] : R.eq[sel.eq]) : null;
    let btn = '';
    if (it) {
      const B = BASES[it.b];
      if (selling) btn += `<div class="bt pri" data-act="sell">Vendi (+${fmt(sellValue(it) * (B.cons ? it.q || 1 : 1))})</div>`;
      else if (sel.eq) btn += '<div class="bt pri" data-act="uneq">Rimuovi</div>';
      else if (B.cons) btn += '<div class="bt pri" data-act="use">Usa</div>';
      else btn += `<div class="bt pri${canEquip(it) === true ? '' : ' off'}" data-act="equip">Equipaggia</div>`;
      if (!selling && sel.inv != null) btn += `<div class="bt" data-act="drop">Recupera (+${fmt(Math.ceil(sellValue(it) * 0.5))})</div>`;
    }
    const used = R.inv.filter(Boolean).length;
    return `<div class="col" style="flex:none"><div class="sec">Equipaggiamento</div><div class="doll">${doll}</div>
      <div class="m" style="font-size:11.5px;color:#a8987a;margin-top:6px;text-align:center">Danni ×${P.dmg.toFixed(2)} · Arm. ${Math.round(ST.arm || 0)}<br>Vita ${P.maxHp} · FP ${P.maxFp}</div></div>
      <div class="col" style="flex:none"><div class="sec">Zaino ${used}/40 ${selling ? '· tocca per vendere' : ''}</div><div class="grid">${grid}</div>
      <div class="btns"><div class="bt" data-act="sort">Ordina</div>${selling ? '<div class="bt" data-act="sellall">Vendi comuni</div>' : ''}</div></div>
      <div class="det">${detailHTML(it, sel && sel.eq ? 'eq' : 'inv')}<div class="btns">${btn}</div></div>`;
  }
  // ---------- status window
  function statHTML() {
    const C = CLS(), need = xpNext(R.lv);
    const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    let atts = '';
    for (const a of ATTR) {
      const base = R.at[a.k], tot = ST[a.k] || base, bonus = tot - base;
      atts += `<div class="att"><div class="an">${a.n} <span style="color:#7fd4ff">(${a.k})</span><small>${a.d}</small></div><div class="av">${tot}${bonus ? `<small style="font-size:11px;color:#7dffb0"> +${bonus}</small>` : ''}</div>
        <div class="bt ap${R.pts > 0 ? ' pri' : ' off'}" data-att="${a.k}">+</div></div>`;
    }
    const rank = API.guildRank ? API.guildRank() : (S.guild && S.guild.rank) || (S.quests && S.quests.rank) || 'F';
    const titles = [C.t, R.lv >= 10 ? 'Veterano' : null, R.lv >= 30 ? 'Eroe del Regno' : null, R.lv >= 60 ? 'Leggenda Vivente' : null, S.bosses && S.bosses.tyrant ? 'Uccisore di Tiranni' : null, S.bosses && S.bosses.dragon ? 'Ammazzadraghi' : null].filter(Boolean);
    const uniq = API.abilities ? API.abilities.order.filter((id) => API.abilities.level(id) > 0 && !(SKILLS[id])).map((id) => API.abilities.defs[id].name) : [];
    const played = Math.max(1, Math.round((Date.now() - (R.t0 || Date.now())) / 60000));
    return `<div class="col" style="flex:1 1 250px;min-width:230px">
        <div style="display:flex;gap:10px;align-items:center"><img src="${emblemURL(R.cls, 96)}" style="width:62px;height:62px">
        <div><div style="font-size:19px;color:#fff">${esc(R.name)}</div><div style="color:#7fd4ff;font-size:13px">${esc(C.n)} · «${esc(titles[titles.length - 1])}»</div>
        <div style="font-size:12px;color:#9fc0d8">Rango Gilda: <b style="color:#ffe7a8">${esc(rank)}</b> · Razza: ${R.cls === 'slime' ? 'Slime' : 'Umano (evocato)'}</div></div></div>
        <div class="sec" style="margin-top:8px">《 Livello ${R.lv} 》</div>
        <div class="bar2"><i style="width:${R.lv >= MAXLV ? 100 : (100 * R.xp / need).toFixed(1)}%;background:linear-gradient(90deg,#8a5cff,#d9a8ff)"></i></div>
        <div style="font-size:12px;color:#9fc0d8">Esperienza ${fmt(R.xp)} / ${fmt(need)}</div>
        ${kv('Vita', `${Math.ceil(P.hp)} / ${P.maxHp}`)}${kv('FP (mana)', `${Math.floor(P.fp)} / ${P.maxFp}`)}${kv('Stamina', P.maxSt)}
        ${kv('Anime (oro)', fmt(S.runes))}${kv('Nemici sconfitti', fmt(R.kills || 0))}${kv('Tempo di gioco', played + ' min')}
        <div class="sec" style="margin-top:8px">Titoli</div><div style="font-size:12.5px;color:#d8f1ff">${titles.map(esc).join(' · ')}</div>
        ${uniq.length ? `<div class="sec" style="margin-top:8px">Abilità Uniche</div><div style="font-size:12.5px;color:#d8f1ff">${uniq.map(esc).join(' · ')}</div>` : ''}
      </div>
      <div class="col" style="flex:1 1 260px;min-width:240px"><div class="sec">Attributi · <span style="color:#ffe7a8">${R.pts} punti disponibili</span></div>${atts}
        <div class="btns"><div class="bt" data-act="newgame" style="font-size:12px">Nuova partita…</div></div></div>
      <div class="col" style="flex:1 1 210px;min-width:200px"><div class="sec">Statistiche derivate</div>
        ${kv('Moltiplicatore danni', '×' + P.dmg.toFixed(2))}${kv('Danno arma', ST.wdmg || 0)}${kv('Potere magico', '×' + ST.spellM.toFixed(2))}
        ${kv('Probabilità critico', (ST.critC * 100).toFixed(1) + '%')}${kv('Danno critico', '×' + ST.critM.toFixed(2))}${kv('Armatura', Math.round(ST.arm || 0))}
        ${kv('Riduzione danni', (armorRed(R.lv) * 100).toFixed(0) + '%')}${kv('Schivata', (ST.dodgeC * 100).toFixed(1) + '%')}${kv('Parata (scudo)', (ST.block || 0) + '%')}
        ${kv('Rubavita', (ST.ls || 0) + '%')}${kv('Danni elementali', '+' + Math.round(ST.elem))}${kv('Rigenerazione', (ST.regen || 0).toFixed(1) + '/s')}
        ${kv('Bonus esperienza', '+' + (ST.xp || 0) + '%')}${kv('Bonus anime', '+' + (ST.gold || 0) + '%')}${kv('Potere cure', '×' + ST.healM.toFixed(2))}
      </div>`;
  }
  const armorRed = (L) => clamp((ST.arm || 0) / ((ST.arm || 0) + 50 + 10 * L), 0, 0.75);
  // ---------- skills tab (filled by the skills section)
  function skillHTML() { return skillsPanelHTML(); }
  const FINE = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function tipEl() { let t = $('rpgtip'); if (!t) { t = document.createElement('div'); t.id = 'rpgtip'; document.body.appendChild(t); } return t; }
  function hideTip() { const t = $('rpgtip'); if (t) t.style.display = 'none'; }
  function bindTips(rb) {
    if (!FINE) return;
    const show = (ev, it, where) => {
      if (!it) return hideTip();
      const t = tipEl(); t.innerHTML = detailHTML(it, where); t.style.display = 'block';
      const r = t.getBoundingClientRect(), x = Math.min(innerWidth - r.width - 8, ev.clientX + 16), y = Math.min(innerHeight - r.height - 8, Math.max(8, ev.clientY - 20));
      t.style.left = x + 'px'; t.style.top = y + 'px';
    };
    rb.querySelectorAll('[data-inv]').forEach((c) => { c.addEventListener('mousemove', (ev) => show(ev, R.inv[+c.dataset.inv], 'inv')); c.addEventListener('mouseleave', hideTip); });
    rb.querySelectorAll('[data-eq]').forEach((c) => { c.addEventListener('mousemove', (ev) => show(ev, R.eq[c.dataset.eq], 'eq')); c.addEventListener('mouseleave', hideTip); });
    rb.querySelectorAll('[data-buy]').forEach((c) => { c.addEventListener('mousemove', (ev) => show(ev, stockFor(UI.shop)[+c.dataset.buy], 'shop')); c.addEventListener('mouseleave', hideTip); });
  }
  function bindPanel(rb) {
    hideTip(); bindTips(rb);
    rb.querySelectorAll('[data-inv]').forEach((c) => {
      c.addEventListener('click', () => {
        const i = +c.dataset.inv;
        if (UI.sel && UI.sel.inv === i) { // double tap → quick action
          const it = R.inv[i];
          if (it) { if (UI.tab === 'sell') sellIdx(i); else if (BASES[it.b].cons) { useItem(i); render(); } else equip(i); }
          return;
        }
        UI.sel = R.inv[i] ? { inv: i } : null; sfx('select', { vol: 0.35 }); render();
      });
    });
    rb.querySelectorAll('[data-eq]').forEach((c) => c.addEventListener('click', () => {
      const k = c.dataset.eq;
      if (UI.sel && UI.sel.eq === k && R.eq[k]) { unequip(k); return; }
      UI.sel = R.eq[k] ? { eq: k } : null; sfx('select', { vol: 0.35 }); render();
    }));
    rb.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => doAct(b.dataset.act, b)));
    rb.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => {
      if (R.pts <= 0) return;
      R.at[b.dataset.att]++; R.pts--; API.recalc(false); sfx('select'); API.saveS(); render();
    }));
    rb.querySelectorAll('[data-sk]').forEach((b) => b.addEventListener('click', () => skillAct(b.dataset.sk, b.dataset.op)));
    rb.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.buy;
      if (UI.shopSel === i) { buy(i); return; }
      UI.shopSel = i; sfx('select', { vol: 0.35 }); render();
    }));
    rb.querySelectorAll('[data-learn]').forEach((b) => b.addEventListener('click', () => learn(b.dataset.learn)));
  }
  function sellIdx(i) {
    const it = R.inv[i]; if (!it) return;
    const n = BASES[it.b].cons ? it.q || 1 : 1, v = sellValue(it) * n;
    S.runes += v; R.inv[i] = null; UI.sel = null; sfx('coin'); toast(`Venduto: ${itemName(it)} (+${fmt(v)})`); API.saveS(); render();
  }
  function doAct(a) {
    const sel = UI.sel;
    if (a === 'buy') { if (UI.shopSel != null) buy(UI.shopSel); return; }
    if (a === 'respec') { const c = respecCost(); if (S.runes < c) { toast('Anime insufficienti'); return; } confirmBox(`Riassegnare tutti i punti per <b class="gold">${fmt(c)}</b> anime?`, () => respec(false)); return; }
    if (a === 'sort') return sortInv();
    if (a === 'newgame') return askNewGame();
    if (a === 'sellall') {
      let tot = 0;
      R.inv.forEach((it, i) => { if (it && !BASES[it.b].cons && it.r === 0) { tot += sellValue(it); R.inv[i] = null; } });
      if (tot) { S.runes += tot; sfx('coin'); toast('Oggetti comuni venduti: +' + fmt(tot)); } else toast('Nessun oggetto comune da vendere');
      API.saveS(); render(); return;
    }
    if (!sel) return;
    if (a === 'equip') equip(sel.inv);
    else if (a === 'uneq') unequip(sel.eq);
    else if (a === 'use') { useItem(sel.inv); if (!R.inv[sel.inv]) UI.sel = null; if (UI.open) render(); }
    else if (a === 'sell') sellIdx(sel.inv);
    else if (a === 'drop') {
      const it = R.inv[sel.inv]; if (!it) return;
      const v = Math.ceil(sellValue(it) * 0.5) * (BASES[it.b].cons ? it.q || 1 : 1);
      const go = () => { R.inv[sel.inv] = null; S.runes += v; UI.sel = null; sfx('absorb', { vol: 0.6 }); API.saveS(); render(); };
      if (it.r >= 3) confirmBox(`Recuperare <b style="color:${RAR[it.r].c}">${esc(itemName(it))}</b> per ${fmt(v)} anime?<br><small>L'oggetto verrà distrutto.</small>`, go); else go();
    }
  }

  /* ================================================================ shops */
  const SHOPS = {
    weapons: { n: '⚔ Armeria', who: 'Armaiolo', kinds: WEAPON_BASES, cons: [] },
    armor: { n: '🛡 Corazzeria', who: 'Corazzaio', kinds: ARMOR_BASES, cons: [] },
    magic: { n: '✦ Emporio Arcano', who: 'Incantatrice', kinds: ['bastone', 'tomo', 'anello', 'amuleto', 'anello', 'amuleto'], cons: ['etere', 'sapienza', 'oblio'] },
    potions: { n: '⚗ Alchimista', who: 'Alchimista', kinds: [], cons: ['pozione', 'pozione2', 'pozione3', 'etere', 'tonico', 'pelle', 'gelatina'] },
    general: { n: '🎒 Bottega', who: 'Mercante', kinds: ['spada', 'arco', 'elmo', 'guanti', 'stivali', 'anello'], cons: ['pozione', 'etere', 'ritorno', 'gelatina'] },
  };
  const STOCK = {};
  function stockFor(kind) {
    const K = SHOPS[kind]; if (!K) return [];
    const stamp = (R.shop || 0) + ':' + R.lv;
    if (STOCK[kind] && STOCK[kind].stamp === stamp) return STOCK[kind].list;
    const list = [];
    for (const c of K.cons) { const B = BASES[c]; if (!B.lv || R.lv >= B.lv) list.push(makeItem(c, R.lv)); }
    const n = K.kinds.length ? (kind === 'general' ? 5 : 8) : 0;
    const cw = CLS().w;
    for (let i = 0; i < n; i++) {
      let b = pick(K.kinds);
      if (i === 0 && cw && K.kinds.includes(cw)) b = cw;
      const r = Math.random() < 0.05 ? 3 : Math.random() < 0.25 ? 2 : Math.random() < 0.55 ? 1 : 0;
      list.push(makeItem(b, R.lv + ((Math.random() * 3) | 0) - (i < 2 ? 0 : 1), r));
    }
    STOCK[kind] = { stamp, list };
    return list;
  }
  const buyPrice = (it) => Math.round(itemValue(it) * (BASES[it.b].cons ? 1 : 1.15));
  function shopHTML() {
    const list = stockFor(UI.shop), K = SHOPS[UI.shop];
    let h = '';
    list.forEach((it, i) => {
      if (!it) return;
      const B = BASES[it.b], p = buyPrice(it), can = S.runes >= p;
      h += `<div class="shopi${UI.shopSel === i ? ' sel' : ''}" data-buy="${i}"><img src="${iconURL(it)}"><div class="pn"><span style="color:${B.cons ? '#ffe7a8' : RAR[it.r].c}">${esc(itemName(it))}</span><br>
        <small>${B.cons ? esc(B.d || '') : `${RAR[it.r].n} · Lv ${it.il}${isUpgrade(it) ? ' · <span style="color:#7dff7d">▲ migliore</span>' : ''}`}</small></div><div class="pr" style="${can ? '' : 'color:#a05040'}">◈ ${fmt(p)}</div></div>`;
    });
    const it = UI.shopSel != null ? list[UI.shopSel] : null;
    const p = it ? buyPrice(it) : 0;
    return `<div class="col scroll" style="flex:1 1 320px;min-width:260px"><div class="sec">${K ? K.who : ''} · merce per il livello ${R.lv}</div>${h || '<div class="m">Nessuna merce.</div>'}</div>
      <div class="det">${it ? detailHTML(it, 'shop') : '<div class="m">«Benvenuto, avventuriero! Dai un\'occhiata alla merce.»<br><br>Tocca un oggetto per i dettagli, tocca di nuovo per comprarlo.</div>'}
      ${it ? `<div class="btns"><div class="bt pri${S.runes >= p ? '' : ' off'}" data-act="buy">Compra (◈ ${fmt(p)})</div></div>` : ''}</div>`;
  }
  function buy(i) {
    const list = stockFor(UI.shop), it = list[i]; if (!it) return;
    const p = buyPrice(it);
    if (S.runes < p) { toast('Anime insufficienti'); sfx('uiBack'); return; }
    const B = BASES[it.b];
    const copy = JSON.parse(JSON.stringify(it)); copy.u = R.uid++;
    if (!addToInv(copy)) { toast('Zaino pieno!'); sfx('uiBack'); return; }
    S.runes -= p;
    if (!B.cons) { list[i] = null; UI.shopSel = null; }
    sfx('coin'); toast('Acquistato: ' + itemName(copy));
    evt('3d:item', { item: copy });
    API.saveS(); render();
  }
  function openShop(kind) {
    if (!SHOPS[kind]) kind = 'general';
    openPanel('shop', kind);
  }

  /* ================================================================ skills (class magic + Academy basics) */
  const SKILLS = {}; // id → { cls: [classes], lv: unlock level, basic?, price?, def, cast }
  const BUFF = { warcry: 0, berserk: 0, sacred: 0, barrier: 0, poison: 0, stealth: 0, tonic: 0, stone: 0, light: 0 };
  function skillsPanelHTML() {
    const ids = classSkillIds();
    const AB = API.abilities;
    let h = '';
    for (const id of ids) {
      const s = SKILLS[id]; if (!s) continue;
      const lv = AB ? AB.level(id) : 0, unlocked = lv > 0, inBar = R.bar.includes(id);
      h += `<div class="sk${unlocked ? '' : ' lock'}"><div class="si" style="color:${s.def.color};text-shadow:0 0 8px ${s.def.color}">${s.def.icon}</div>
        <div class="sn">${esc(s.def.name)} ${unlocked ? `<span style="color:#ffe7a8">Lv ${lv}/5</span>` : `<span style="color:#ff9a8a">${s.basic ? 'Accademia' : 'Livello ' + s.lv}</span>`}
        <small>${esc(s.def.desc)} · ${s.def.cost} FP · ${s.def.cd}s</small></div>
        ${unlocked ? `<div class="bt${R.sp > 0 && lv < 5 ? ' pri' : ' off'}" data-sk="${id}" data-op="up">+</div><div class="bt${inBar ? ' on' : ''}" data-sk="${id}" data-op="bar">${inBar ? '✔ Barra' : 'Barra'}</div>` : ''}</div>`;
    }
    const other = AB ? AB.order.filter((id) => !SKILLS[id] && AB.level(id) > 0 && !AB.defs[id].passive && allowedOther(id)) : [];
    let o = '';
    for (const id of other) {
      const d = AB.defs[id], inBar = R.bar.includes(id);
      o += `<div class="sk"><div class="si" style="color:${d.color};text-shadow:0 0 8px ${d.color}">${d.icon}</div><div class="sn">${esc(d.name)} <span style="color:#ffe7a8">Lv ${AB.level(id)}/5</span><small>${esc(d.desc || '')}</small></div>
        <div class="bt${inBar ? ' on' : ''}" data-sk="${id}" data-op="bar">${inBar ? '✔ Barra' : 'Barra'}</div></div>`;
    }
    return `<div class="col scroll" style="flex:1 1 380px;min-width:280px"><div class="sec">Abilità di classe · <span style="color:#ffe7a8">${R.sp} punti abilità</span> · barra ${R.bar.length}/9</div>${h || '<div class="m">Nessuna abilità di classe.</div>'}
      ${o ? `<div class="sec" style="margin-top:8px">Abilità uniche (Predatore / Boss)</div>${o}` : ''}</div>
      <div class="det" style="flex:0 1 230px"><div class="sec">Come funziona</div><div class="m" style="color:#9fc0d8">Le abilità di classe si sbloccano salendo di livello. Ogni livello dà 1 punto abilità: spendilo con <b>+</b> per potenziare un'abilità (max Lv 5).<br><br>
      La barra in basso mostra fino a 9 abilità: scegli con <b>Barra</b>. Seleziona con 1-9 o toccando l'icona, lancia con <b>F</b> / «Abilità».<br><br>
      Gli incantesimi di base (Dardo Magico, Cura Minore, Barriera, Luce) si imparano all'<b>Accademia di Magia</b> a nord della piazza di Altheria.</div></div>`;
  }
  function skillAct(id, op) {
    const AB = API.abilities; if (!AB) return;
    if (op === 'up') {
      if (R.sp <= 0 || AB.level(id) <= 0 || AB.level(id) >= 5) return;
      R.sp--; AB.grant(id); sfx('levelup', { vol: 0.6 });
    } else if (op === 'bar') {
      const i = R.bar.indexOf(id);
      if (i >= 0) R.bar.splice(i, 1);
      else { if (R.bar.length >= 9) { toast('Barra piena (max 9)'); return; } R.bar.push(id); }
      sfx('select'); barDirty();
    }
    API.saveS(); render();
  }
  function classSkillIds() {
    const out = [];
    for (const id in SKILLS) { const s = SKILLS[id]; if (s.basic || R.cls === 'imperatore' || s.cls.includes(R.cls)) out.push(id); }
    out.sort((a, b) => (SKILLS[a].basic ? 1 : 0) - (SKILLS[b].basic ? 1 : 0) || SKILLS[a].lv - SKILLS[b].lv);
    return out;
  }
  const SLIME_ONLY = { water_blade: 1, shadow_motion: 1, ultrasonic: 1, steel_thread: 1, poison_breath: 1, black_flame: 1 };
  function allowedOther(id) { return isSlimeLike() || !SLIME_ONLY[id]; }
  function unlockSkills(announce) {
    const AB = API.abilities; if (!AB || !R) return;
    for (const id in SKILLS) {
      const s = SKILLS[id];
      if (s.basic) continue;
      if (!(R.cls === 'imperatore' || s.cls.includes(R.cls))) continue;
      if ((R.lv >= s.lv || R.cls === 'imperatore') && AB.level(id) <= 0) {
        AB.grant(id, !announce);
        if (R.bar.length < 9 && !R.bar.includes(id)) R.bar.push(id);
      }
    }
    syncBar();
  }
  function trainHTML() {
    const AB = API.abilities;
    let h = '';
    for (const id in SKILLS) {
      const s = SKILLS[id]; if (!s.basic) continue;
      const known = AB && AB.level(id) > 0, can = R.lv >= s.lv && S.runes >= s.price;
      h += `<div class="sk${known ? '' : R.lv >= s.lv ? '' : ' lock'}"><div class="si" style="color:${s.def.color};text-shadow:0 0 8px ${s.def.color}">${s.def.icon}</div>
        <div class="sn">${esc(s.def.name)} ${known ? `<span style="color:#7dffb0">Appreso · Lv ${AB.level(id)}</span>` : `<span style="color:#ffe08a">◈ ${fmt(s.price)}</span> <span style="color:#9fc0d8">· Lv ${s.lv}+</span>`}
        <small>${esc(s.def.desc)} · ${s.def.cost} FP</small></div>${known ? '' : `<div class="bt${can ? ' pri' : ' off'}" data-learn="${id}">Impara</div>`}</div>`;
    }
    const rc = respecCost();
    return `<div class="col scroll" style="flex:1 1 380px;min-width:280px"><div class="sec">Magie di base · Maestra Elowen, Arcimaga dell'Accademia</div>${h}</div>
      <div class="det" style="flex:0 1 250px"><div class="sec">Riassegnazione</div><div class="m" style="color:#9fc0d8">«Ogni anima può riscrivere il proprio cammino... a un prezzo.»<br><br>Azzera gli attributi ai valori della classe e restituisce tutti i punti attributo e abilità.</div>
      <div class="btns"><div class="bt${S.runes >= rc ? ' pri' : ' off'}" data-act="respec">Riassegna (◈ ${fmt(rc)})</div></div>
      <hr><div class="m" style="color:#9fc0d8">Le abilità apprese qui vanno nella barra (scheda Abilità, tasto U).</div></div>`;
  }
  const respecCost = () => Math.round(200 + R.lv * R.lv * 12);
  function respec(free) {
    if (!free) { const c = respecCost(); if (S.runes < c) { toast('Anime insufficienti'); return; } S.runes -= c; }
    const C = CLS(), AB = API.abilities;
    R.at = Object.assign({}, C.at); R.pts = (R.lv - 1) * 5;
    let sp = R.lv - 1;
    if (AB) for (const id in SKILLS) { const l = AB.level(id); if (l > 1) { S.abil[id] = 1; } }
    R.sp = sp - 0; // all skill points back (skill levels reset to 1)
    if (AB && AB.grant) { /* refresh internal lists */ AB.select(S.abilSel); }
    API.recalc(false); sfx('evolve'); oracle('《Cammino riscritto. Punti attributo e abilità restituiti.》', true);
    API.saveS(); if (UI.open) render();
  }
  function learn(id) {
    const s = SKILLS[id], AB = API.abilities; if (!s || !AB) return;
    if (AB.level(id) > 0) return;
    if (R.lv < s.lv) { toast('Livello insufficiente'); return; }
    if (S.runes < s.price) { toast('Anime insufficienti'); sfx('uiBack'); return; }
    S.runes -= s.price; R.learned[id] = 1;
    AB.grant(id);
    if (R.bar.length < 9 && !R.bar.includes(id)) R.bar.push(id);
    barDirty(); syncBar(); API.saveS(); render();
  }
  function openTrainer() { openPanel('train'); }

  /* ================================================================ combat kit: helpers, scheduler, FX pools */
  const V3 = new T.Vector3();
  const aimY = (e) => e.y + (e.d.boss ? e.d.r * 0.9 : 1.1) * (e.scale0 || 1);
  const hostile = (e) => !e.dead && (!e.passive || e._rpgHide);
  const SPOW = (lv) => P.dmg * (ST.spellM || 1) * (1 + 0.18 * ((lv || 1) - 1)) * (BUFF.tonic > 0 ? 1.25 : 1) * (BUFF.warcry > 0 ? 1.2 : 1);
  function target(range) {
    const L = API.input && API.input.lock;
    if (L && !L.dead && Math.hypot(L.x - P.x, L.z - P.z) < range + L.d.r) return L;
    let best = null, bs = 1e9;
    for (const e of API.enemies) {
      if (!hostile(e)) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r;
      if (d > range) continue;
      const s = d + Math.abs(angDiff(P.rot, Math.atan2(e.x - P.x, e.z - P.z))) * 6;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  const face = (e) => { if (e) P.rot = Math.atan2(e.x - P.x, e.z - P.z); };
  function handPos(o) {
    o = o || { x: 0, y: 0, z: 0 };
    const gy = heightAt(P.x, P.z);
    o.x = P.x + Math.sin(P.rot) * 0.9; o.y = gy + P.y + (P.form === 'slime' ? 1.0 : P.form === 'dragon' ? 2.6 : 1.45); o.z = P.z + Math.cos(P.rot) * 0.9;
    return o;
  }
  const HP0 = { x: 0, y: 0, z: 0 };
  function aimPoint(range) {
    const e = target(range);
    if (e) { face(e); return { x: e.x, z: e.z, e }; }
    return { x: P.x + Math.sin(P.rot) * range * 0.55, z: P.z + Math.cos(P.rot) * range * 0.55, e: null };
  }
  function hitE(e, dmg, poise, kx, kz) { if (!e || e.dead) return; API.hitEnemy(e, Math.max(1, dmg), poise || 10, kx || 0, kz || 0); }
  function areaHit(x, z, r, dmg, poise, color, each) {
    let n = 0;
    for (const e of API.enemies) {
      if (!hostile(e)) continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > r + e.d.r) continue;
      const k = d > 0.01 ? 1 / d : 0;
      hitE(e, dmg, poise, dx * k, dz * k); n++;
      if (color) API.emit(e.x, aimY(e), e.z, 8, color, { speed: 5, life: 0.6 });
      if (each) each(e);
    }
    return n;
  }
  const TIM = [];
  const after = (t, fn) => { TIM.push({ t, fn }); };
  function heal(amount, color) {
    const h = Math.round(amount * (ST.healM || 1));
    P.hp = Math.min(P.maxHp, P.hp + h);
    const gy = heightAt(P.x, P.z);
    dmgNum(P.x, gy + 2.3, P.z, '+' + h, 'heal');
    API.emit(P.x, gy + 0.5, P.z, 30, color || '#8cff9a', { speed: 1.5, up: 4, grav: -1, life: 1.2 });
    sfx('heal');
  }
  function stunE(e, t) { if (!e || e.dead) return; e.stagger = Math.max(e.stagger || 0, e.d.boss ? t * 0.25 : t); if (!e.d.boss) e.atk = null; }
  // shared sprite / glow materials
  const SPM = {};
  const sprMat = (c, k) => SPM[c + k] || (SPM[c + k] = new T.SpriteMaterial({ map: API.dot, color: hdr(c, k), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  const spr = (c, k, s) => { const sp = new T.Sprite(sprMat(c, k)); sp.scale.setScalar(s); return sp; };
  // expanding ground rings
  const RINGG = new T.RingGeometry(0.86, 1, 48); RINGG.rotateX(-Math.PI / 2);
  const RINGS = [];
  function ringFx(x, y, z, r0, r1, dur, color, k) {
    let o = RINGS.find((q) => q.t >= q.dur);
    if (!o) { if (RINGS.length > 24) return; const m = new T.Mesh(RINGG, new T.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); m.renderOrder = 3; scene.add(m); o = { m, t: 0, dur: 0 }; RINGS.push(o); }
    o.m.material.color.copy(hdr(color, (k || 2.2) * 0.75)); o.m.position.set(x, y, z); o.t = 0; o.dur = dur; o.r0 = r0; o.r1 = r1; o.m.visible = true;
  }
  function updateRings(dt) {
    for (const o of RINGS) {
      if (o.t >= o.dur) continue;
      o.t += dt; const k = Math.min(1, o.t / o.dur), e = 1 - (1 - k) * (1 - k);
      o.m.scale.setScalar(lerp(o.r0, o.r1, e)); o.m.material.opacity = 1 - k;
      if (o.t >= o.dur) o.m.visible = false;
    }
  }
  // runic circle texture for zones / traps / casting
  const RUNE = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.translate(128, 128); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
    const ring = (r, w) => { x.lineWidth = w; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); };
    ring(122, 5); ring(112, 1.5); ring(84, 3); ring(40, 2);
    x.lineWidth = 2.5;
    for (let k = 0; k < 2; k++) { x.beginPath(); for (let i = 0; i <= 4; i++) { const a = k * Math.PI / 4 + i * TAU / 4; const px = Math.cos(a) * 112, py = Math.sin(a) * 112; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    let sd = 7;
    const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 24; i++) {
      x.save(); x.rotate((i / 24) * TAU); x.translate(0, -98); x.lineWidth = 2.2; x.beginPath();
      for (let k = 0; k < 3; k++) { x.moveTo((rn() - 0.5) * 12, (rn() - 0.5) * 12); x.lineTo((rn() - 0.5) * 12, (rn() - 0.5) * 12); }
      x.stroke(); x.restore();
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; x.beginPath(); x.arc(Math.cos(a) * 62, Math.sin(a) * 62, 5, 0, TAU); x.fill(); }
    return new T.CanvasTexture(c);
  })();
  const DECALG = new T.PlaneGeometry(2, 2); DECALG.rotateX(-Math.PI / 2);
  function decal(color, k) { const m = new T.Mesh(DECALG, new T.MeshBasicMaterial({ map: RUNE, color: hdr(color, (k || 1.6) * 0.6), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); m.renderOrder = 2; scene.add(m); return m; }
  function freeDecal(m) { if (!m) return; scene.remove(m); m.material.dispose(); }

  /* ---------------------------------------------------------------- projectiles (own pool) */
  const PG = {
    shaft: new T.CylinderGeometry(0.016, 0.016, 1, 5).rotateX(Math.PI / 2),
    head: new T.ConeGeometry(0.045, 0.16, 4).rotateX(Math.PI / 2).translate(0, 0, 0.56),
    fl: new T.BoxGeometry(0.006, 0.09, 0.2).translate(0, 0, -0.42),
    ico: new T.IcosahedronGeometry(1, 1), oct: new T.OctahedronGeometry(1, 0), dode: new T.DodecahedronGeometry(1, 0),
    wing: (() => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.4, 1.6, 0.25, -0.2, 1.3, 0, -0.7, 0, 0, 0.4, 1.3, 0, -0.7, 0, 0, -0.5], 3)); g.computeVertexNormals(); return g; })(),
    crescent: new T.TorusGeometry(1.1, 0.09, 4, 24, Math.PI * 0.9).rotateX(Math.PI / 2).rotateY(Math.PI * 0.05),
    hammerHead: new T.BoxGeometry(0.42, 0.26, 0.26), handle: new T.CylinderGeometry(0.03, 0.03, 0.6, 6),
  };
  const PJ = [], PJPOOL = {};
  const PJK = {
    arrow: { trail: '#e8ffd0', build() { const g = new T.Group(); g.add(new T.Mesh(PG.shaft, WM.wood)); g.add(new T.Mesh(PG.head, WM.steel)); const f1 = new T.Mesh(PG.fl, glowM('#ffffff', 1.4)); g.add(f1); const f2 = f1.clone(); f2.rotation.z = Math.PI / 2; g.add(f2); const s = spr('#d8ffb0', 2, 0.6); s.position.z = 0.55; g.add(s); return g; } },
    fire: { trail: '#ff7a1a', build() { const g = new T.Group(); const c = new T.Mesh(PG.ico, glowM('#ffb050', 3.2)); c.scale.setScalar(0.3); g.add(c); g.add(spr('#ff5a10', 2.6, 2.2)); g.add(spr('#ffd080', 2, 0.9)); return g; } },
    ice: { trail: '#9fe8ff', build() { const g = new T.Group(); const c = new T.Mesh(PG.oct, glowM('#d8f8ff', 2.8)); c.scale.set(0.16, 0.16, 0.85); g.add(c); g.add(spr('#5fc8ff', 2.2, 1.6)); return g; } },
    arcane: { trail: '#b08aff', build() { const g = new T.Group(); const c = new T.Mesh(PG.ico, glowM('#e6d0ff', 3)); c.scale.setScalar(0.15); g.add(c); g.add(spr('#8a5cff', 2.4, 1.3)); return g; } },
    spirit: { trail: '#d090ff', build() { const g = new T.Group(); const c = new T.Mesh(PG.ico, glowM('#f0d8ff', 2.6)); c.scale.setScalar(0.17); g.add(c); g.add(spr('#c060ff', 2.2, 1.6)); return g; } },
    holy: { trail: '#ffe08a', spin: 16, build() { const g = new T.Group(); const h = new T.Mesh(PG.handle, WM.darkWood); g.add(h); const hh = new T.Mesh(PG.hammerHead, glowM('#ffe7a0', 2.6)); hh.position.y = 0.3; g.add(hh); g.add(spr('#ffcf40', 2.2, 1.8)); g.scale.setScalar(1.6); return g; } },
    phoenix: { trail: '#ff8a2a', build() { const g = new T.Group(); const b = new T.Mesh(PG.ico, glowM('#ffd080', 3)); b.scale.set(0.35, 0.3, 0.8); g.add(b); const wm = new T.MeshBasicMaterial({ color: hdr('#ff8a2a', 2.6), side: T.DoubleSide, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }); const wl = new T.Mesh(PG.wing, wm), wr = new T.Mesh(PG.wing, wm); wr.scale.x = -1; g.add(wl, wr); g.userData.wl = wl; g.userData.wr = wr; g.add(spr('#ff6a10', 2.4, 4)); g.scale.setScalar(1.6); return g; } },
    meteor: { trail: '#ff6a1a', build() { const g = new T.Group(); const r = new T.Mesh(PG.dode, std('#3a2418', 0.9, 0, { emissive: hdr('#ff4a10', 1.1) })); r.scale.setScalar(1.3); g.add(r); g.add(spr('#ff5a10', 2.6, 7)); g.add(spr('#ffd080', 2, 3)); return g; } },
    shard: { build() { const c = new T.Mesh(PG.oct, glowM('#dff8ff', 2.4)); c.scale.set(0.12, 0.5, 0.12); return c; } },
    crescent: { trail: '#ffe08a', build() { const g = new T.Group(); g.add(new T.Mesh(PG.crescent, glowM('#ffd860', 3))); g.add(spr('#ffcf40', 2, 2.4)); return g; } },
  };
  function takePJ(kind) {
    const pool = PJPOOL[kind] || (PJPOOL[kind] = []);
    let m = pool.pop();
    if (!m) { m = PJK[kind].build(); scene.add(m); }
    m.visible = true;
    return m;
  }
  function shoot(kind, o) {
    const p = { kind, m: takePJ(kind), x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy || 0, vz: o.vz, sp: o.sp || Math.hypot(o.vx, o.vy || 0, o.vz), life: o.life || 2, age: 0,
      dmg: o.dmg || 0, r: o.r || 0.7, pierce: o.pierce || 0, tgt: o.tgt || null, turn: o.turn || 0, grav: o.grav || 0, onHit: o.onHit || null, onEnd: o.onEnd || null,
      poise: o.poise || 10, vis: !!o.vis, ret: o.ret || 0, hit: new Set(), ground: o.ground !== false, color: o.color || PJK[kind].trail, scale: o.scale || 1 };
    p.m.position.set(p.x, p.y, p.z); p.m.scale.setScalar((p.m.userData.s0 || (p.m.userData.s0 = p.m.scale.x)) * p.scale);
    PJ.push(p);
    return p;
  }
  function shootAt(kind, e, speed, o, ang) {
    const h = handPos(HP0);
    let dx, dy, dz;
    if (e) { dx = e.x - h.x; dy = aimY(e) - h.y; dz = e.z - h.z; } else { dx = Math.sin(P.rot); dy = 0.02; dz = Math.cos(P.rot); }
    if (ang) { const c = Math.cos(ang), s = Math.sin(ang), nx = dx * c + dz * s, nz = -dx * s + dz * c; dx = nx; dz = nz; }
    const L = Math.hypot(dx, dy, dz) || 1;
    return shoot(kind, Object.assign({ x: h.x, y: h.y, z: h.z, vx: dx / L * speed, vy: dy / L * speed, vz: dz / L * speed, sp: speed, tgt: e }, o || {}));
  }
  function killPJ(i) { const p = PJ[i]; p.m.visible = false; PJPOOL[p.kind].push(p.m); PJ.splice(i, 1); }
  function updatePJ(dt) {
    const pgy = heightAt(P.x, P.z) + P.y + 1.3;
    for (let i = PJ.length - 1; i >= 0; i--) {
      const p = PJ[i];
      p.age += dt; p.life -= dt;
      if (p.ret && p.age > p.ret) {
        if (!p.back) { p.back = true; p.hit.clear(); }
        const dx = P.x - p.x, dy = pgy - p.y, dz = P.z - p.z, L = Math.hypot(dx, dy, dz) || 1;
        p.vx = dx / L * p.sp * 1.15; p.vy = dy / L * p.sp * 1.15; p.vz = dz / L * p.sp * 1.15;
        if (L < 1.4) { killPJ(i); continue; }
        p.life = Math.max(p.life, 0.2);
      } else if (p.tgt && p.turn) {
        if (p.tgt.dead) p.tgt = null;
        else {
          const dx = p.tgt.x - p.x, dy = aimY(p.tgt) - p.y, dz = p.tgt.z - p.z, L = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, dt * p.turn);
          p.vx += (dx / L * p.sp - p.vx) * k; p.vy += (dy / L * p.sp - p.vy) * k; p.vz += (dz / L * p.sp - p.vz) * k;
          const s = Math.hypot(p.vx, p.vy, p.vz) || 1; p.vx *= p.sp / s; p.vy *= p.sp / s; p.vz *= p.sp / s;
        }
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const m = p.m;
      m.position.set(p.x, p.y, p.z);
      if (PJK[p.kind].spin) { m.rotation.x += dt * PJK[p.kind].spin; m.rotation.y = Math.atan2(p.vx, p.vz); }
      else { V3.set(p.x + p.vx, p.y + p.vy, p.z + p.vz); m.lookAt(V3); }
      if (p.kind === 'phoenix') { const f = Math.sin(p.age * 18) * 0.6; m.userData.wl.rotation.z = f; m.userData.wr.rotation.z = -f; }
      const tr = PJK[p.kind].trail;
      if (tr && Math.random() < dt * (LOW ? 20 : 45)) API.emit(p.x, p.y, p.z, 1, p.color || tr, { speed: 0.6, grav: 0, life: p.kind === 'meteor' || p.kind === 'phoenix' ? 0.8 : 0.35, size: p.kind === 'meteor' ? 1.4 : 0.35, bright: 2.2 });
      let done = false;
      if (p.ground && p.age > 0.08 && p.y < heightAt(p.x, p.z) + 0.15) { if (p.onEnd) p.onEnd(p); done = true; }
      if (!done && !p.vis) {
        for (const e of API.enemies) {
          if (!hostile(e) || p.hit.has(e)) continue;
          const dx = e.x - p.x, dz = e.z - p.z, rr2 = e.d.r * (e.scale0 || 1) + p.r;
          if (dx * dx + dz * dz < rr2 * rr2 && Math.abs(aimY(e) - p.y) < 1.8 + e.d.r) {
            p.hit.add(e);
            if (p.dmg) { const L = Math.hypot(p.vx, p.vz) || 1; hitE(e, p.dmg, p.poise, p.vx / L, p.vz / L); }
            if (p.onHit) p.onHit(p, e);
            if (p.pierce-- <= 0) { done = true; break; }
          }
        }
      }
      if (!done && p.life <= 0) { if (p.onEnd) p.onEnd(p); done = true; }
      if (done) killPJ(i);
    }
  }
  function explode(x, y, z, r, dmg, color, poise) {
    areaHit(x, z, r, dmg, poise || 30, null);
    API.emit(x, y, z, LOW ? 30 : 60, color, { speed: r * 2.6, up: 3, grav: 4, life: 0.9, size: 0.6, bright: 2.6 });
    ringFx(x, heightAt(x, z) + 0.2, z, 0.5, r * 1.15, 0.45, color, 2.6);
    if (API.flashLight) { API.flashLight.color.set(color); API.flashLight.intensity = 35; API.flashLight.position.set(x, y + 2, z); }
    sfx('explosion', { vol: 0.7 }); API.setShake(0.25);
  }

  /* ---------------------------------------------------------------- allies (summons) */
  const ALLY = [];
  const ghostMats = {};
  const ghost = (c) => ghostMats[c] || (ghostMats[c] = new T.MeshStandardMaterial({ color: c, emissive: hdr(c, 0.9), transparent: true, opacity: 0.6, roughness: 0.35, metalness: 0.1, flatShading: true, depthWrite: false }));
  function golemModel() {
    const M = API.mesh, root = new T.Group(), g = new T.Group(); root.add(g);
    const rock = std('#6e665a', 0.95), dark = std('#4a443c', 0.95), rune = glowM('#ff9a3a', 2.6);
    M(g, PG.dode, rock, 0, 1.75, 0, 0.2, 0.3, 0, 0.85, 0.95, 0.65);
    M(g, PG.dode, dark, 0, 1.05, 0, 0, 0, 0, 0.6, 0.45, 0.5);
    const head = API.pivot(g, 0, 2.6, 0.12); M(head, PG.dode, rock, 0, 0, 0, 0, 0, 0, 0.36, 0.32, 0.34);
    for (const s of [-1, 1]) M(head, API.BOX, rune, s * 0.12, 0.02, 0.3, 0, 0, 0, 0.09, 0.04, 0.03);
    M(g, API.BOX, rune, 0, 1.8, 0.6, 0, 0, 0, 0.12, 0.5, 0.04); M(g, API.BOX, rune, 0, 1.85, 0.6, 0, 0, 0, 0.36, 0.08, 0.04);
    const armL = API.pivot(g, -0.95, 2.1, 0), armR = API.pivot(g, 0.95, 2.1, 0);
    for (const A of [armL, armR]) { M(A, PG.dode, rock, 0, -0.45, 0, 0, 0, 0, 0.32, 0.5, 0.32); M(A, PG.dode, dark, 0, -1.05, 0.05, 0, 0, 0, 0.42, 0.38, 0.42); }
    const legL = API.pivot(g, -0.4, 0.9, 0), legR = API.pivot(g, 0.4, 0.9, 0);
    for (const L of [legL, legR]) M(L, PG.dode, dark, 0, -0.45, 0, 0, 0, 0, 0.3, 0.48, 0.32);
    g.scale.setScalar(1.25);
    return { root, g, head, armL, armR, legL, legR };
  }
  function falconModel() {
    const M = API.mesh, root = new T.Group(), g = new T.Group(); root.add(g);
    const fe = std('#8a5a2a', 0.8), wh = std('#f0e6d0', 0.8), gold = glowM('#ffd36b', 3);
    M(g, PG.ico, fe, 0, 0, 0, 0, 0, 0, 0.22, 0.2, 0.45);
    M(g, PG.ico, wh, 0, 0.12, 0.38, 0, 0, 0, 0.15, 0.15, 0.16);
    M(g, API.coneG(0.05, 0.14, 4), std('#ffc040', 0.4), 0, 0.1, 0.56, Math.PI / 2, 0, 0);
    for (const s of [-1, 1]) M(g, API.sph(0.025, 6, 5), gold, s * 0.08, 0.17, 0.48);
    const wl = API.pivot(g, -0.15, 0.05, 0), wr = API.pivot(g, 0.15, 0.05, 0);
    M(wl, API.BOX, fe, -0.45, 0, -0.05, 0, 0, 0, 0.9, 0.03, 0.34); M(wr, API.BOX, fe, 0.45, 0, -0.05, 0, 0, 0, 0.9, 0.03, 0.34);
    M(wl, API.BOX, gold, -0.85, 0, -0.1, 0, 0, 0, 0.12, 0.035, 0.2); M(wr, API.BOX, gold, 0.85, 0, -0.1, 0, 0, 0, 0.12, 0.035, 0.2);
    M(g, API.BOX, fe, 0, 0, -0.55, 0, 0, 0, 0.26, 0.03, 0.3);
    g.add(spr('#ffd36b', 1.6, 1.4));
    g.scale.setScalar(1.3);
    return { root, g, wl, wr };
  }
  function summon(kind, lv, life) {
    const same = ALLY.filter((a) => a.kind === kind), cap = kind === 'knight' ? 4 : kind === 'wolf' ? 2 : 1;
    while (same.length >= cap) { const o = same.shift(); dismiss(ALLY.indexOf(o)); }
    let m;
    if (kind === 'wolf') { m = API.wolfModel({ fur: '#7fd8ff', dark: '#3a8ac0', eye: '#ffffff' }); m.root.traverse((o) => { if (o.isMesh) o.material = o.material.color && o.material.color.r > 0.9 && o.material.color.g > 0.9 ? o.material : ghost('#6fd0ff'); }); m.root.scale.setScalar(1.15); }
    else if (kind === 'knight') { m = API.humanoid('knight', 1.05); m.root.traverse((o) => { if (o.isMesh) o.material = ghost('#b080ff'); }); }
    else if (kind === 'golem') m = golemModel();
    else m = falconModel();
    const a = rand(0, TAU), x = P.x + Math.cos(a) * 2.5, z = P.z + Math.sin(a) * 2.5;
    scene.add(m.root);
    const al = { kind, m, x, z, y: heightAt(x, z), rot: P.rot, t: life, max: life, lv, cd: 0.5, tgt: null, atkT: 0, h: kind === 'falcon' ? 3.5 : 0, idx: ALLY.length, wob: rand(0, 6) };
    ALLY.push(al);
    const gy = heightAt(x, z);
    API.emit(x, gy + 1, z, 40, kind === 'golem' ? '#ff9a3a' : kind === 'falcon' ? '#ffd36b' : kind === 'wolf' ? '#6fd0ff' : '#b080ff', { speed: 4, up: 4, grav: 0, life: 1 });
    ringFx(x, gy + 0.15, z, 0.4, 3, 0.6, kind === 'golem' ? '#ff9a3a' : '#c06bff', 2.4);
    if (kind === 'golem') API.lightPillar(x, z, '#ff9a3a', 0.8);
    return al;
  }
  function dismiss(i) {
    const a = ALLY[i]; if (!a) return;
    API.emit(a.x, a.y + 1 + a.h, a.z, 24, '#c9a8ff', { speed: 3, up: 3, grav: 0, life: 0.8 });
    scene.remove(a.m.root);
    ALLY.splice(i, 1);
  }
  function updateAllies(dt, t) {
    for (let i = ALLY.length - 1; i >= 0; i--) {
      const a = ALLY[i], m = a.m;
      a.t -= dt;
      if (a.t <= 0 || P.dead) { dismiss(i); continue; }
      if (!a.tgt || a.tgt.dead || a.tgt.passive || Math.hypot(a.tgt.x - P.x, a.tgt.z - P.z) > 28) {
        a.tgt = null; let bd = 22;
        for (const e of API.enemies) { if (e.dead || e.passive) continue; const d = Math.hypot(e.x - a.x, e.z - a.z); if (d < bd && Math.hypot(e.x - P.x, e.z - P.z) < 24) { bd = d; a.tgt = e; } }
      }
      let tx, tz, moving = false;
      const reach = a.kind === 'golem' ? 2.6 : a.kind === 'falcon' ? 1.6 : 1.9;
      const speed = a.kind === 'golem' ? 5.5 : a.kind === 'falcon' ? 14 : a.kind === 'wolf' ? 11 : 7.5;
      a.cd -= dt; a.atkT = Math.max(0, a.atkT - dt);
      if (a.tgt) {
        tx = a.tgt.x; tz = a.tgt.z;
        const d = Math.hypot(tx - a.x, tz - a.z) - a.tgt.d.r;
        if (d > reach) moving = true;
        else if (a.cd <= 0) {
          const pw = SPOW(a.lv);
          a.atkT = 0.4;
          if (a.kind === 'golem') { a.cd = 1.7; after(0.25, () => { if (!a.tgt) return; areaHit(a.x + Math.sin(a.rot) * 1.6, a.z + Math.cos(a.rot) * 1.6, 3.6, 52 * pw, 45, '#ff9a3a'); ringFx(a.x + Math.sin(a.rot) * 1.6, heightAt(a.x, a.z) + 0.2, a.z + Math.cos(a.rot) * 1.6, 0.5, 4, 0.5, '#ff9a3a', 2); API.setShake(0.15); sfx('explosion', { vol: 0.35 }); }); }
          else if (a.kind === 'falcon') { a.cd = 1.3; hitE(a.tgt, 34 * pw, 12, 0, 0); API.emit(a.tgt.x, aimY(a.tgt), a.tgt.z, 12, '#ffd36b', { speed: 5, life: 0.5 }); }
          else if (a.kind === 'wolf') { a.cd = 0.85; hitE(a.tgt, 30 * pw, 14, Math.sin(a.rot), Math.cos(a.rot)); API.emit(a.tgt.x, aimY(a.tgt), a.tgt.z, 10, '#6fd0ff', { speed: 5, life: 0.5 }); }
          else { a.cd = 1.0; hitE(a.tgt, 26 * pw, 16, Math.sin(a.rot), Math.cos(a.rot)); API.emit(a.tgt.x, aimY(a.tgt), a.tgt.z, 10, '#b080ff', { speed: 5, life: 0.5 }); }
        }
      } else {
        const ang = P.rot + Math.PI + (a.idx % 2 ? 0.9 : -0.9) + ((a.idx / 2) | 0) * 0.5;
        tx = P.x + Math.sin(ang) * 3; tz = P.z + Math.cos(ang) * 3;
        if (Math.hypot(tx - a.x, tz - a.z) > 1.5) moving = true;
      }
      const want = Math.atan2(tx - a.x, tz - a.z);
      a.rot += angDiff(a.rot, want) * Math.min(1, dt * 8);
      const sp = moving ? speed * (Math.hypot(tx - a.x, tz - a.z) > 12 ? 1.6 : 1) : 0;
      a.x += Math.sin(a.rot) * sp * dt; a.z += Math.cos(a.rot) * sp * dt;
      if (Math.hypot(a.x - P.x, a.z - P.z) > 40) { a.x = P.x + rand(-2, 2); a.z = P.z + rand(-2, 2); }
      a.y = heightAt(a.x, a.z);
      let hy = 0;
      if (a.kind === 'falcon') { hy = a.atkT > 0 ? lerp(3.4, 1.2, Math.sin(a.atkT / 0.4 * Math.PI)) : 3.4 + Math.sin(t * 2 + a.wob) * 0.4; const f = Math.sin(t * (moving ? 16 : 9)) * 0.7; m.wl.rotation.z = f; m.wr.rotation.z = -f; }
      m.root.position.set(a.x, a.y + hy, a.z); m.root.rotation.y = a.rot;
      const ph = t * (a.kind === 'golem' ? 6 : 12);
      if (m.legs) m.legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(ph + (k % 2) * Math.PI + (k > 1 ? 1 : 0)) * 0.8 : 0; });
      if (m.legL) { const sw = moving ? Math.sin(ph) * 0.6 : 0; m.legL.rotation.x = sw; m.legR.rotation.x = -sw; if (m.armL) m.armL.rotation.x = -sw * 0.6; if (m.armR) m.armR.rotation.x = a.atkT > 0 ? -2.2 * Math.sin(a.atkT / 0.4 * Math.PI) : sw * 0.6; if (a.kind === 'golem' && a.atkT > 0) m.armL.rotation.x = m.armR.rotation.x; }
      if (m.tail) m.tail.rotation.x = 0.4 + Math.sin(t * 6) * 0.2;
      const fade = a.t < 1.5 ? a.t / 1.5 : 1;
      if (a.kind !== 'golem') m.root.scale.setScalar((a.kind === 'wolf' ? 1.15 : a.kind === 'falcon' ? 1 : 1) * (0.4 + 0.6 * fade));
      if (Math.random() < dt * 4) API.emit(a.x + rand(-0.5, 0.5), a.y + 0.6 + hy, a.z + rand(-0.5, 0.5), 1, a.kind === 'golem' ? '#ff9a3a' : a.kind === 'wolf' ? '#6fd0ff' : a.kind === 'falcon' ? '#ffd36b' : '#b080ff', { speed: 0.4, up: 1.2, grav: -0.5, life: 1 });
    }
  }

  /* ---------------------------------------------------------------- zones, traps, DoTs, orbs, timed actions */
  const ZONES = [], TRAPS = [], DOTS = [], ORBS = [];
  const ACT = { kind: null, t: 0, n: 0, lv: 1 };
  function zone(kind, x, z, r, dur, tick, color, lv) {
    const m = decal(color, kind === 'rain' ? 1.2 : 1.8); m.position.set(x, heightAt(x, z) + 0.12, z); m.scale.setScalar(r);
    const zz = { kind, x, z, r, t: dur, max: dur, tick, acc: 0, color, lv, m };
    ZONES.push(zz); return zz;
  }
  function updateZones(dt, t) {
    for (let i = ZONES.length - 1; i >= 0; i--) {
      const zn = ZONES[i];
      zn.t -= dt; zn.acc += dt;
      const fade = Math.min(1, zn.t / 0.6, (zn.max - zn.t) / 0.3);
      zn.m.material.opacity = 0.85 * Math.max(0, fade); zn.m.rotation.y += dt * 0.4;
      const gy = heightAt(zn.x, zn.z);
      if (zn.kind === 'blizzard' && Math.random() < dt * (LOW ? 10 : 24)) {
        const a = rand(0, TAU), rr0 = Math.sqrt(Math.random()) * zn.r, x = zn.x + Math.cos(a) * rr0, z = zn.z + Math.sin(a) * rr0;
        shoot('shard', { x: x - 2, y: gy + 14, z, vx: 4, vy: -26, vz: 0, life: 1.2, vis: true, onEnd: (p) => API.emit(p.x, heightAt(p.x, p.z) + 0.3, p.z, 4, '#cff6ff', { speed: 3, up: 2, life: 0.4 }) });
      }
      if (zn.kind === 'rain' && Math.random() < dt * (LOW ? 12 : 30)) {
        const a = rand(0, TAU), rr0 = Math.sqrt(Math.random()) * zn.r, x = zn.x + Math.cos(a) * rr0, z = zn.z + Math.sin(a) * rr0;
        shoot('arrow', { x: x - 1.5, y: gy + 16, z: z - 1, vx: 2, vy: -34, vz: 1.4, life: 1, vis: true, onEnd: (p) => API.emit(p.x, heightAt(p.x, p.z) + 0.2, p.z, 3, '#e8ffd0', { speed: 2, up: 2, life: 0.35 }) });
      }
      if (zn.kind === 'consecrate' && Math.random() < dt * 14) { const a = rand(0, TAU), rr0 = Math.random() * zn.r; API.emit(zn.x + Math.cos(a) * rr0, gy + 0.2, zn.z + Math.sin(a) * rr0, 1, '#ffe08a', { speed: 0.3, up: 2.5, grav: -1, life: 1.3, bright: 2.2 }); }
      if (zn.acc >= zn.tick) {
        zn.acc -= zn.tick;
        const pw = SPOW(zn.lv);
        if (zn.kind === 'consecrate') {
          areaHit(zn.x, zn.z, zn.r, 16 * pw, 6, '#ffe08a');
          if (Math.hypot(P.x - zn.x, P.z - zn.z) < zn.r && P.hp < P.maxHp) { const h = Math.round(P.maxHp * 0.018 * (ST.healM || 1)); P.hp = Math.min(P.maxHp, P.hp + h); dmgNum(P.x, heightAt(P.x, P.z) + 2.2, P.z, '+' + h, 'heal'); }
        } else if (zn.kind === 'blizzard') areaHit(zn.x, zn.z, zn.r, 20 * pw, 8, '#bff4ff', (e) => { if (!e.d.boss) e.stagger = Math.max(e.stagger || 0, 0.25); });
        else if (zn.kind === 'rain') areaHit(zn.x, zn.z, zn.r, 19 * pw, 6, null);
      }
      if (zn.t <= 0) { freeDecal(zn.m); ZONES.splice(i, 1); }
    }
    void t;
  }
  function updateTraps(dt, t) {
    for (let i = TRAPS.length - 1; i >= 0; i--) {
      const tr = TRAPS[i];
      tr.t -= dt; tr.arm -= dt;
      tr.m.rotation.y += dt * 2; tr.m.material.opacity = tr.arm > 0 ? 0.3 : 0.6 + Math.sin(t * 8) * 0.3;
      let fire = tr.t <= 0;
      if (tr.arm <= 0 && !fire) for (const e of API.enemies) { if (!e.dead && !e.passive && Math.hypot(e.x - tr.x, e.z - tr.z) < 2.3 + e.d.r) { fire = true; break; } }
      if (fire) {
        const gy = heightAt(tr.x, tr.z);
        if (tr.t > 0) { explode(tr.x, gy + 0.8, tr.z, 4.6, 125 * SPOW(tr.lv), '#ffb040', 60); areaHit(tr.x, tr.z, 4.6, 0, 0, null, (e) => stunE(e, 2)); }
        freeDecal(tr.m); TRAPS.splice(i, 1);
      }
    }
  }
  function addDot(e, dur, dps, color) {
    const ex = DOTS.find((d) => d.e === e && d.color === color);
    if (ex) { ex.t = dur; ex.dps = Math.max(ex.dps, dps); return; }
    DOTS.push({ e, t: dur, dps, color, acc: 0 });
  }
  function updateDots(dt) {
    for (let i = DOTS.length - 1; i >= 0; i--) {
      const d = DOTS[i];
      if (d.e.dead) { DOTS.splice(i, 1); continue; }
      d.t -= dt; d.acc += dt;
      if (Math.random() < dt * 10) API.emit(d.e.x + rand(-0.4, 0.4), aimY(d.e), d.e.z + rand(-0.4, 0.4), 1, d.color, { speed: 0.5, up: 1.5, grav: -1, life: 0.7 });
      if (d.acc >= 0.5) { d.acc -= 0.5; const v = Math.round(d.dps * 0.5); API.hitEnemyQuiet(d.e, v); dmgNum(d.e.x, aimY(d.e) + 1, d.e.z, v, ''); }
      if (d.t <= 0) DOTS.splice(i, 1);
    }
  }
  function updateOrbs(dt, t) {
    if (!ORBS.length) return;
    const gy = heightAt(P.x, P.z) + P.y;
    for (let i = ORBS.length - 1; i >= 0; i--) {
      const o = ORBS[i];
      o.t -= dt; o.cd -= dt;
      const a = t * 2.4 + o.ph;
      o.m.position.set(P.x + Math.cos(a) * 1.5, gy + 1.5 + Math.sin(t * 3 + o.ph) * 0.2, P.z + Math.sin(a) * 1.5);
      if (o.cd <= 0) {
        let tg = null, bd = 16;
        for (const e of API.enemies) { if (e.dead || e.passive) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; tg = e; } }
        if (tg) {
          o.cd = 9e9; o.t = 0;
          const dx = tg.x - o.m.position.x, dz = tg.z - o.m.position.z, L = Math.hypot(dx, dz) || 1;
          shoot('arcane', { x: o.m.position.x, y: o.m.position.y, z: o.m.position.z, vx: dx / L * 18, vy: 2, vz: dz / L * 18, sp: 20, tgt: tg, turn: 7, life: 2.5, dmg: 46 * SPOW(o.lv), r: 0.8, color: '#c070ff',
            onHit: (p, e) => API.emit(e.x, aimY(e), e.z, 14, '#c070ff', { speed: 5, life: 0.5 }) });
          sfx('spirit', { vol: 0.5 });
        }
      }
      if (o.t <= 0) { scene.remove(o.m); ORBS.splice(i, 1); }
    }
  }
  // buff visuals: dome, light orb, berserk aura
  const DOME = new T.Mesh(new T.IcosahedronGeometry(1.6, 2), new T.MeshBasicMaterial({ color: hdr('#ffd36b', 0.9), transparent: true, opacity: 0.25, depthWrite: false, blending: T.AdditiveBlending, wireframe: true }));
  DOME.visible = false; scene.add(DOME);
  const LIGHTORB = spr('#fff6d0', 2.6, 1.1); LIGHTORB.visible = false; scene.add(LIGHTORB);
  let orbLight = null;
  function updateBuffFx(dt, t) {
    const gy = heightAt(P.x, P.z) + P.y;
    const dome = BUFF.sacred > 0 || BUFF.barrier > 0;
    DOME.visible = dome;
    if (dome) {
      DOME.position.set(P.x, gy + 1, P.z); DOME.rotation.y += dt * 0.6; DOME.rotation.x = Math.sin(t) * 0.1;
      DOME.material.color.copy(hdr(BUFF.sacred > 0 ? '#ffd36b' : '#6fc8ff', 0.9));
      const left = Math.max(BUFF.sacred, BUFF.barrier);
      DOME.material.opacity = (0.22 + Math.sin(t * 6) * 0.05) * (left < 1 ? left : 1);
      DOME.scale.setScalar(P.form === 'dragon' ? 2.2 : 1);
    }
    if (BUFF.berserk > 0 && Math.random() < dt * 20) API.emit(P.x + rand(-0.6, 0.6), gy + rand(0.3, 1.8), P.z + rand(-0.6, 0.6), 1, '#ff3b2f', { speed: 0.6, up: 2.2, grav: -1, life: 0.7, bright: 2.6 });
    if (BUFF.warcry > 0 && Math.random() < dt * 6) API.emit(P.x + rand(-0.6, 0.6), gy + 0.2, P.z + rand(-0.6, 0.6), 1, '#ffb040', { speed: 0.3, up: 2, grav: -1, life: 0.8 });
    if (BUFF.poison > 0 && Math.random() < dt * 8) API.emit(P.x + Math.sin(P.rot) * 0.6, gy + 1.1, P.z + Math.cos(P.rot) * 0.6, 1, '#7dff5a', { speed: 0.3, up: -0.5, grav: 2, life: 0.6 });
    if (BUFF.stealth > 0 && Math.random() < dt * 14) API.emit(P.x + rand(-0.5, 0.5), gy + rand(0.2, 1.8), P.z + rand(-0.5, 0.5), 1, '#5a3a8a', { speed: 0.3, up: 0.8, grav: -0.5, life: 0.9, bright: 1.2 });
    if (BUFF.stealth <= 0 && STEALTHED.length) endStealth();
    LIGHTORB.visible = BUFF.light > 0;
    if (BUFF.light > 0) {
      const ox = P.x + Math.sin(t * 0.8) * 1.2, oz = P.z + Math.cos(t * 0.8) * 1.2, oy = gy + 2.6 + Math.sin(t * 2) * 0.2;
      LIGHTORB.position.set(ox, oy, oz); LIGHTORB.scale.setScalar(1 + Math.sin(t * 5) * 0.1);
      if (!LOW) {
        if (!orbLight) { orbLight = new T.PointLight('#fff1c8', 0, 26, 1.4); scene.add(orbLight); }
        orbLight.position.set(ox, oy, oz); orbLight.intensity = 26 * Math.min(1, BUFF.light);
      }
    } else if (orbLight) orbLight.intensity = 0;
  }
  const STEALTHED = [];
  function endStealth() {
    for (const e of STEALTHED) if (e._rpgHide) { e.passive = false; e._rpgHide = false; }
    STEALTHED.length = 0; BUFF.stealth = 0;
  }
  // spikes (Spaccaterra) & giant sword (Lama del Cielo)
  const SPIKEG = new T.ConeGeometry(0.7, 3, 5); SPIKEG.translate(0, 1.5, 0);
  const SPIKEM = std('#7a6a58', 0.95, 0, { emissive: hdr('#ff6a1a', 0.25) });
  const SPIKES = [];
  function spike(x, z) {
    let s = SPIKES.find((q) => q.t <= 0);
    if (!s) { const m = new T.Mesh(SPIKEG, SPIKEM); m.castShadow = true; scene.add(m); s = { m, t: 0 }; SPIKES.push(s); }
    s.t = 1.1; s.m.visible = true; s.m.position.set(x, heightAt(x, z) - 3, z); s.m.rotation.set(rand(-0.25, 0.25), rand(0, TAU), rand(-0.25, 0.25)); s.m.scale.setScalar(rand(0.8, 1.3));
    API.emit(x, heightAt(x, z) + 0.3, z, 10, '#b89a70', { speed: 5, up: 4, grav: 9, life: 0.7, size: 0.5, bright: 0.8 });
  }
  function updateSpikes(dt) {
    for (const s of SPIKES) {
      if (s.t <= 0) continue;
      s.t -= dt;
      const k = 1.1 - s.t, gy = heightAt(s.m.position.x, s.m.position.z);
      s.m.position.y = gy - 3 + (k < 0.12 ? k / 0.12 * 3 : s.t < 0.35 ? 3 * (s.t / 0.35) : 3);
      if (s.t <= 0) s.m.visible = false;
    }
  }
  const BIGSWORD = (() => {
    const g = new T.Group();
    const steel = std('#d8dde8', 0.15, 1, { emissive: hdr('#4f9dff', 0.15) });
    API.mesh(g, API.BOX, steel, 0, 0, 0, 0, 0, 0, 1.3, 11, 0.28);
    API.mesh(g, API.coneG(0.92, 1.8, 4), steel, 0, -6.4, 0, Math.PI, Math.PI / 4, 0, 1, 1, 0.3);
    API.mesh(g, API.BOX, glowM('#9fe0ff', 3.2), 0, -0.4, 0, 0, 0, 0, 0.28, 10, 0.32);
    API.mesh(g, API.BOX, WM.gold, 0, 5.6, 0, 0, 0, 0, 4.2, 0.6, 0.8);
    API.mesh(g, API.BOX, WM.leather, 0, 7.4, 0, 0, 0, 0, 0.45, 3, 0.45);
    API.mesh(g, API.sph(0.5, 10, 8), glowM('#ffe08a', 3), 0, 9.1, 0);
    g.add(spr('#7fd4ff', 1.1, 6));
    g.visible = false; scene.add(g);
    return { g, t: 0, x: 0, z: 0 };
  })();
  function updateBigSword(dt) {
    const B = BIGSWORD; if (!B.g.visible) return;
    B.t += dt;
    const gy = heightAt(B.x, B.z);
    if (B.t < 0.28) B.g.position.y = gy + 36 - (B.t / 0.28) * 31.5;
    else B.g.position.y = gy + 4.5 - Math.max(0, B.t - 1.4) * 4;
    if (B.t > 2.6) B.g.visible = false;
  }
  function updateAct(dt, t) {
    if (!ACT.kind) return;
    ACT.t += dt;
    const gy = heightAt(P.x, P.z);
    if (ACT.kind === 'spin') {
      if (H && H.root.visible) H.g.rotation.y = ACT.t * 24;
      while (ACT.n < 6 && ACT.t >= ACT.n * 0.2) {
        ACT.n++;
        areaHit(P.x, P.z, 4.6, 26 * SPOW(ACT.lv), 14, '#ffb080');
        ringFx(P.x, gy + 1, P.z, 1, 4.8, 0.3, '#ff9a5a', 2.4); sfx('slash', { vol: 0.6 });
      }
      for (let k = 0; k < 2; k++) { const a = ACT.t * 24 + k * Math.PI; API.emit(P.x + Math.sin(a) * 2.6, gy + 1.1, P.z + Math.cos(a) * 2.6, 1, '#ffd0a0', { speed: 0.5, grav: 0, life: 0.25, size: 0.5, bright: 2.6 }); }
      if (ACT.t >= 1.25) { ACT.kind = null; if (H) H.g.rotation.y = 0; }
    } else if (ACT.kind === 'dance') {
      while (ACT.n < 7 && ACT.t >= ACT.n * 0.14) {
        ACT.n++;
        const tg = target(5);
        if (tg) { face(tg); P.x = lerp(P.x, tg.x - Math.sin(P.rot) * (tg.d.r + 1.2), 0.5); P.z = lerp(P.z, tg.z - Math.cos(P.rot) * (tg.d.r + 1.2), 0.5); }
        areaHit(P.x + Math.sin(P.rot) * 1.4, P.z + Math.cos(P.rot) * 1.4, 3.2, 21 * SPOW(ACT.lv), 10, '#d8b0ff');
        const a = rand(0, TAU); API.bolt(P.x + Math.cos(a) * 2, gy + 1.6, P.z + Math.sin(a) * 2, P.x - Math.cos(a) * 2, gy + 0.6, P.z - Math.sin(a) * 2, '#c9a0ff');
        sfx('slash', { vol: 0.5 }); P.iframe = Math.max(P.iframe, 0.15);
        if (H && H.root.visible) { H.armR.rotation.x = -1.4; H.armL.rotation.x = -1.4; }
      }
      if (ACT.t >= 1.0) ACT.kind = null;
    }
    void t;
  }

  /* ---------------------------------------------------------------- skill definitions */
  function defSkill(id, cls, lv, def, cast, extra) { SKILLS[id] = Object.assign({ cls, lv, def, cast }, extra || {}); }
  const need = (e) => { if (!e) { toast('Nessun bersaglio'); return false; } return true; };
  // — Guerriero
  defSkill('g_turbine', ['guerriero'], 1, { name: 'Turbine d\'Acciaio', icon: '🌀', color: '#ff8a50', cost: 16, cd: 5, desc: 'Ruoti con lo spadone per 1,2 s colpendo tutti i nemici attorno.' },
    (lv) => { ACT.kind = 'spin'; ACT.t = 0; ACT.n = 0; ACT.lv = lv; P.iframe = Math.max(P.iframe, 0.3); return true; });
  defSkill('g_grido', ['guerriero'], 3, { name: 'Grido di Guerra', icon: '📯', color: '#ffb040', cost: 20, cd: 18, desc: '+30% danni per 10 s e stordisce i nemici vicini.' },
    (lv) => {
      BUFF.warcry = 10 + 2 * (lv - 1);
      areaHit(P.x, P.z, 10, 6 * SPOW(lv), 60, null, (e) => stunE(e, 1.4));
      API.shockwave(P.x, P.z, 10, 0, '#ffb040'); API.setShake(0.35); sfx('howl'); toast('Grido di Guerra: +30% danni');
      return true;
    });
  defSkill('g_spacca', ['guerriero'], 6, { name: 'Spaccaterra', icon: '⛰️', color: '#d8a060', cost: 26, cd: 8, desc: 'Un fendente che squarcia il terreno: una fila di spuntoni di roccia erompe davanti a te.' },
    (lv) => {
      const e = target(16); face(e); P.vy = 8;
      const r0 = P.rot, x0 = P.x, z0 = P.z;
      after(0.3, () => {
        API.setShake(0.4); sfx('explosion', { vol: 0.6 });
        for (let i = 0; i < 7; i++) after(i * 0.06, () => {
          const d = 2.4 + i * 2.1, x = x0 + Math.sin(r0) * d, z = z0 + Math.cos(r0) * d;
          spike(x, z); spike(x + rand(-0.8, 0.8), z + rand(-0.8, 0.8));
          areaHit(x, z, 2.2, 70 * SPOW(lv), 45, '#d8a060');
        });
      });
      return true;
    });
  defSkill('g_furia', ['guerriero'], 10, { name: 'Furia Cremisi', icon: '🔥', color: '#ff3b2f', cost: 30, cd: 30, desc: 'Per 12 s: +50% danni e 10% rubavita, ma subisci il 15% di danni in più.' },
    (lv) => { BUFF.berserk = 12 + 2 * (lv - 1); API.lightPillar(P.x, P.z, '#ff3b2f', 1.2); sfx('bossRoar', { vol: 0.5 }); API.setShake(0.3); oracle('《Furia Cremisi attivata》'); return true; });
  defSkill('g_lama', ['guerriero'], 15, { name: 'Lama del Cielo Spezzato', icon: '🗡️', color: '#7fd4ff', cost: 50, cd: 22, desc: 'Una spada colossale precipita dal cielo sul bersaglio.' },
    (lv) => {
      const ap = aimPoint(26), x = ap.x, z = ap.z, gy = heightAt(x, z);
      ringFx(x, gy + 0.2, z, 6.5, 6.6, 0.75, '#ff4a3a', 1.6);
      const B = BIGSWORD; B.x = x; B.z = z; B.t = 0; B.g.position.set(x, gy + 36, z); B.g.rotation.set(0, P.rot, 0.04); B.g.visible = true;
      after(0.28, () => { explode(x, gy + 1, z, 6.5, 230 * SPOW(lv), '#9fe0ff', 140); API.setShake(0.8); API.shockwave(x, z, 12, 0, '#9fe0ff'); for (let i = 0; i < 4; i++) API.bolt(x + rand(-1, 1), gy + 20, z + rand(-1, 1), x + rand(-6, 6), gy, z + rand(-6, 6), '#9fe0ff'); });
      return true;
    });
  // — Paladino
  defSkill('p_luce', ['paladino'], 1, { name: 'Luce Curativa', icon: '✚', color: '#ffe9a0', cost: 24, cd: 8, desc: 'Ripristina il 25% della vita (scala con Saggezza).' },
    (lv) => { if (P.hp >= P.maxHp) { toast('Vita già al massimo'); return false; } heal(P.maxHp * (0.25 + 0.05 * (lv - 1)), '#ffe9a0'); API.lightPillar(P.x, P.z, '#ffe9a0', 1.2); return true; });
  defSkill('p_scudo', ['paladino'], 3, { name: 'Scudo Sacro', icon: '🛡️', color: '#ffd36b', cost: 24, cd: 20, desc: 'Una cupola di luce riduce i danni subiti del 60% per 7 s.' },
    (lv) => { BUFF.sacred = 6 + lv; sfx('shield'); ringFx(P.x, heightAt(P.x, P.z) + 0.2, P.z, 0.5, 3, 0.5, '#ffd36b', 2.6); return true; });
  defSkill('p_giudizio', ['paladino'], 6, { name: 'Giudizio', icon: '⚖️', color: '#fff0a0', cost: 30, cd: 7, desc: 'Colonne di luce sacra puniscono il bersaglio e i nemici vicini.' },
    (lv) => {
      const ap = aimPoint(24), gy = heightAt(ap.x, ap.z);
      ringFx(ap.x, gy + 0.2, ap.z, 5.5, 5.6, 0.3, '#fff0a0', 2);
      after(0.25, () => {
        API.lightPillar(ap.x, ap.z, '#fff0a0', 1);
        areaHit(ap.x, ap.z, 5.5, 105 * SPOW(lv), 50, '#fff0a0', (e) => { API.bolt(e.x, aimY(e) + 22, e.z, e.x, aimY(e), e.z, '#ffe08a'); });
        sfx('thunder', { vol: 0.6 }); API.setShake(0.3);
      });
      return true;
    });
  defSkill('p_martello', ['paladino'], 10, { name: 'Martello Celeste', icon: '🔨', color: '#ffcf40', cost: 22, cd: 5, desc: 'Scagli un martello di luce che trapassa i nemici e torna nella tua mano.' },
    (lv) => { const e = target(22); face(e); shootAt('holy', e, 22, { dmg: 62 * SPOW(lv), pierce: 99, ret: 0.65, life: 3, r: 1.1, poise: 30, ground: false }); sfx('spirit'); return true; });
  defSkill('p_consacra', ['paladino'], 15, { name: 'Terra Consacrata', icon: '☀️', color: '#ffe08a', cost: 45, cd: 25, desc: 'Consacri il terreno per 9 s: cura chi vi sta sopra e brucia i nemici.' },
    (lv) => { zone('consecrate', P.x, P.z, 6.5, 8 + lv, 0.5, '#ffe08a', lv); ringFx(P.x, heightAt(P.x, P.z) + 0.3, P.z, 1, 7, 0.6, '#ffe08a', 2); sfx('heal'); return true; });
  // — Mago Elementale
  defSkill('m_fuoco', ['mago'], 1, { name: 'Palla di Fuoco', icon: '🔥', color: '#ff7a1a', cost: 18, cd: 2.5, desc: 'Una sfera di fuoco che esplode all\'impatto (area).' },
    (lv) => {
      const e = target(30); face(e);
      const boom = (p) => explode(p.x, p.y, p.z, 3.6, 92 * SPOW(lv), '#ff7a1a', 30);
      shootAt('fire', e, 22, { dmg: 0, turn: e ? 3 : 0, life: 2, r: 0.8, onHit: boom, onEnd: boom });
      sfx('fire'); return true;
    });
  defSkill('m_ghiaccio', ['mago'], 3, { name: 'Lancia di Ghiaccio', icon: '❄️', color: '#8fe0ff', cost: 18, cd: 4, desc: 'Una lancia gelida che trapassa fino a 5 nemici e li congela.' },
    (lv) => { const e = target(32); face(e); shootAt('ice', e, 36, { dmg: 82 * SPOW(lv), pierce: 4, life: 1.2, r: 0.7, poise: 30, onHit: (p, en) => { stunE(en, 1.6 + 0.2 * lv); API.emit(en.x, aimY(en), en.z, 16, '#bff4ff', { speed: 5, life: 0.6 }); } }); sfx('water'); return true; });
  defSkill('m_fulmine', ['mago'], 6, { name: 'Catena di Fulmini', icon: '⚡', color: '#b9a0ff', cost: 26, cd: 6, desc: 'Un fulmine che rimbalza su un massimo di 5 nemici.' },
    (lv) => {
      const first = target(24); if (!need(first)) return false; face(first);
      const h = handPos(HP0); let px = h.x, py = h.y, pz = h.z, cur = first;
      const hit = new Set();
      for (let i = 0; i < 4 + lv && cur; i++) {
        hit.add(cur);
        const ty = aimY(cur);
        API.bolt(px, py, pz, cur.x, ty, cur.z, '#b9a0ff');
        hitE(cur, 78 * SPOW(lv) * Math.pow(0.88, i), 20, 0, 0); stunE(cur, 0.4);
        API.emit(cur.x, ty, cur.z, 12, '#d8c8ff', { speed: 6, life: 0.4 });
        px = cur.x; py = ty; pz = cur.z;
        let nx = null, bd = 11;
        for (const e of API.enemies) { if (e.dead || e.passive || hit.has(e)) continue; const d = Math.hypot(e.x - px, e.z - pz); if (d < bd) { bd = d; nx = e; } }
        cur = nx;
      }
      sfx('thunder'); API.setShake(0.2); return true;
    });
  defSkill('m_meteora', ['mago'], 12, { name: 'Meteora', icon: '☄️', color: '#ff5a1a', cost: 52, cd: 16, desc: 'Evochi una meteora infuocata che devasta un\'ampia area.' },
    (lv) => {
      const ap = aimPoint(30), x = ap.x, z = ap.z, gy = heightAt(x, z);
      ringFx(x, gy + 0.2, z, 7, 7.1, 1.1, '#ff5a1a', 1.8);
      const d0 = decal('#ff5a1a', 1.4); d0.position.set(x, gy + 0.12, z); d0.scale.setScalar(7);
      const sx = x - 14, sy = gy + 42, sz = z - 10, T0 = 1.0;
      shoot('meteor', { x: sx, y: sy, z: sz, vx: (x - sx) / T0, vy: (gy - sy) / T0, vz: (z - sz) / T0, life: T0 + 0.2, vis: true, ground: true,
        onEnd: () => { freeDecal(d0); explode(x, gy + 1, z, 7, 250 * SPOW(lv), '#ff6a1a', 150); API.setShake(0.9); API.shockwave(x, z, 13, 0, '#ff8a3a'); API.emit(x, gy + 1, z, LOW ? 40 : 90, '#3a2a20', { speed: 9, up: 6, grav: 6, life: 1.6, size: 1, bright: 0.5 }); } });
      sfx('meteor'); return true;
    });
  defSkill('m_tormenta', ['mago'], 18, { name: 'Tormenta Glaciale', icon: '🌨️', color: '#cff6ff', cost: 48, cd: 20, desc: 'Una bufera di schegge di ghiaccio sferza l\'area per 6 s, rallentando i nemici.' },
    (lv) => { const ap = aimPoint(26); zone('blizzard', ap.x, ap.z, 7, 5 + lv * 0.5, 0.35, '#9fe8ff', lv); sfx('water'); return true; });
  // — Arciere
  defSkill('a_perforante', ['arciere'], 1, { name: 'Freccia Perforante', icon: '➶', color: '#c8ff90', cost: 14, cd: 3, desc: 'Una freccia caricata che trapassa ogni nemico sulla sua traiettoria.' },
    (lv) => { const e = target(40); face(e); shootAt('arrow', e, 60, { dmg: 115 * SPOW(lv), pierce: 8, life: 1, r: 0.8, poise: 35, scale: 1.6, color: '#d8ff90' }); sfx('needle'); API.setShake(0.1); return true; });
  defSkill('a_pioggia', ['arciere'], 3, { name: 'Pioggia di Frecce', icon: '🏹', color: '#e8ffd0', cost: 28, cd: 10, desc: 'Centinaia di frecce piovono sull\'area per 3 s.' },
    (lv) => { const ap = aimPoint(30); for (let i = 0; i < 6; i++) shootAt('arrow', null, 40, { vy: 30, vis: true, life: 0.5, ground: false }, rand(-0.3, 0.3)); after(0.35, () => zone('rain', ap.x, ap.z, 5.5, 2.6 + 0.3 * lv, 0.3, '#e8ffd0', lv)); sfx('needle'); return true; });
  defSkill('a_trappola', ['arciere'], 6, { name: 'Trappola Esplosiva', icon: '💥', color: '#ffb040', cost: 18, cd: 5, desc: 'Piazzi una trappola runica che esplode e immobilizza i nemici (max 3).' },
    (lv) => {
      if (TRAPS.length >= 3) { const o = TRAPS.shift(); freeDecal(o.m); }
      const x = P.x + Math.sin(P.rot) * 2.2, z = P.z + Math.cos(P.rot) * 2.2, m = decal('#ffb040', 2); m.position.set(x, heightAt(x, z) + 0.1, z); m.scale.setScalar(1.3);
      TRAPS.push({ x, z, t: 45, arm: 0.6, lv, m }); sfx('web'); return true;
    });
  defSkill('a_multiplo', ['arciere'], 10, { name: 'Tiro a Ventaglio', icon: '🎯', color: '#a0ffb0', cost: 24, cd: 6, desc: 'Scocchi un ventaglio di 8 frecce.' },
    (lv) => { const e = target(30); face(e); const n = 7 + lv; for (let i = 0; i < n; i++) shootAt('arrow', null, 46, { dmg: 42 * SPOW(lv), pierce: 1, life: 0.9, r: 0.6 }, (i / (n - 1) - 0.5) * 1.1); sfx('needle'); return true; });
  defSkill('a_falco', ['arciere'], 15, { name: 'Spirito del Falco', icon: '🦅', color: '#ffd36b', cost: 38, cd: 30, desc: 'Evochi uno spirito falco che si avventa sui nemici per 20 s.' },
    (lv) => { summon('falcon', lv, 18 + 3 * lv); sfx('howl', { vol: 0.5 }); return true; });
  // — Assassino
  defSkill('s_ombra', ['assassino'], 1, { name: 'Passo d\'Ombra', icon: '👤', color: '#8a6bff', cost: 16, cd: 5, desc: 'Ti teletrasporti alle spalle del bersaglio e lo pugnali (critico garantito).' },
    (lv) => {
      const e = target(20); if (!need(e)) return false;
      const puff = (x, z) => API.emit(x, heightAt(x, z) + 1, z, 30, '#3a2060', { speed: 3, up: 1, grav: 0, life: 0.8, size: 0.8, bright: 1 });
      puff(P.x, P.z);
      const back = e.rot + Math.PI, dd = e.d.r + 1.3;
      P.x = e.x + Math.sin(back) * dd; P.z = e.z + Math.cos(back) * dd; P.vx = P.vz = 0; face(e); P.iframe = Math.max(P.iframe, 0.4);
      puff(P.x, P.z); sfx('dash');
      after(0.12, () => { if (e.dead) return; hitE(e, 130 * SPOW(lv) * (ST.critM || 1.6), 60, Math.sin(P.rot), Math.cos(P.rot)); ringFx(e.x, aimY(e), e.z, 0.5, 3.5, 0.3, '#8a6bff', 3); API.setHitstop(0.08); dmgNum(e.x, aimY(e) + 1.6, e.z, 'CRITICO', 'crit'); });
      return true;
    });
  defSkill('s_lame', ['assassino'], 3, { name: 'Lame Danzanti', icon: '⚔️', color: '#d8b0ff', cost: 24, cd: 8, desc: 'Una raffica di 7 fendenti fulminei sui nemici vicini.' },
    (lv) => { ACT.kind = 'dance'; ACT.t = 0; ACT.n = 0; ACT.lv = lv; return true; });
  defSkill('s_veleno', ['assassino'], 6, { name: 'Veleno Letale', icon: '☠️', color: '#7dff5a', cost: 18, cd: 20, desc: 'Per 15 s i tuoi colpi avvelenano i nemici (danni nel tempo).' },
    (lv) => { BUFF.poison = 15; ST.poisonLv = lv; sfx('poison'); toast('Lame avvelenate'); return true; });
  defSkill('s_velo', ['assassino'], 10, { name: 'Velo d\'Ombra', icon: '🌫️', color: '#5a3a8a', cost: 28, cd: 25, desc: 'Diventi invisibile per 7 s: i nemici ti perdono di vista. Il primo colpo infligge danni ×3.' },
    (lv) => {
      BUFF.stealth = 6 + lv;
      for (const e of API.enemies) if (!e.dead && !e.d.boss && !e.passive && Math.hypot(e.x - P.x, e.z - P.z) < 40) { e.passive = true; e._rpgHide = true; e.engaged = false; e.atk = null; STEALTHED.push(e); }
      if (API.input) API.input.lock = null;
      API.emit(P.x, heightAt(P.x, P.z) + 1, P.z, 50, '#2a1a40', { speed: 4, up: 1, grav: 0, life: 1.2, size: 1, bright: 0.8 }); sfx('dash'); toast('Sei nell\'ombra');
      return true;
    });
  defSkill('s_esecuzione', ['assassino'], 15, { name: 'Esecuzione', icon: '⚰️', color: '#ff3b5c', cost: 34, cd: 12, desc: 'Un colpo mortale: danni ×3 ai nemici sotto il 35% di vita.' },
    (lv) => {
      const e = target(7); if (!need(e)) return false; face(e);
      const dd = e.d.r + 1.1; P.x = e.x - Math.sin(P.rot) * dd; P.z = e.z - Math.cos(P.rot) * dd;
      const low = e.hp < e.maxHp * 0.35;
      hitE(e, 230 * SPOW(lv) * (low ? 3 : 1), 120, Math.sin(P.rot), Math.cos(P.rot));
      const y = aimY(e);
      API.bolt(e.x - 2, y + 2, e.z, e.x + 2, y - 2, e.z, '#ff3b5c'); API.bolt(e.x + 2, y + 2, e.z, e.x - 2, y - 2, e.z, '#ff3b5c');
      API.setHitstop(0.16); API.setShake(0.5); sfx('crit'); if (low) dmgNum(e.x, y + 2, e.z, 'ESECUZIONE', 'crit');
      return true;
    });
  // — Evocatore
  defSkill('e_lupo', ['evocatore'], 1, { name: 'Spirito Lupo', icon: '🐺', color: '#6fd0ff', cost: 28, cd: 12, desc: 'Evochi uno spirito lupo che combatte al tuo fianco per 30 s (max 2).' },
    (lv) => { summon('wolf', lv, 25 + 5 * lv); sfx('howl'); return true; });
  defSkill('e_sfere', ['evocatore'], 3, { name: 'Sfere Arcane', icon: '🔮', color: '#c070ff', cost: 24, cd: 10, desc: 'Tre sfere orbitano attorno a te e si scagliano sui nemici.' },
    (lv) => { for (let i = 0; i < 3 + (lv >= 3 ? 1 : 0); i++) { const m = spr('#c070ff', 2.6, 1); scene.add(m); ORBS.push({ m, t: 15, cd: 0.6 + i * 0.5, ph: (i / 3) * TAU, lv }); } sfx('spirit'); return true; });
  defSkill('e_golem', ['evocatore'], 6, { name: 'Golem di Pietra', icon: '🗿', color: '#ff9a3a', cost: 42, cd: 30, desc: 'Evochi un golem di pietra runica che schiaccia i nemici per 35 s.' },
    (lv) => { summon('golem', lv, 30 + 5 * lv); sfx('explosion', { vol: 0.5 }); API.setShake(0.3); return true; });
  defSkill('e_fenice', ['evocatore'], 12, { name: 'Fenice', icon: '🕊️', color: '#ff8a2a', cost: 38, cd: 12, desc: 'Una fenice di fiamma attraversa i nemici incendiandoli.' },
    (lv) => { const e = target(30); face(e); shootAt('phoenix', e, 26, { dmg: 95 * SPOW(lv), pierce: 99, life: 1.5, r: 1.8, ground: false, onHit: (p, en) => addDot(en, 4, 18 * SPOW(lv), '#ff8a2a') }); sfx('fire'); return true; });
  defSkill('e_legione', ['evocatore'], 18, { name: 'Legione Spettrale', icon: '👻', color: '#b080ff', cost: 58, cd: 40, desc: 'Quattro cavalieri spettrali giurano fedeltà e combattono per 18 s.' },
    (lv) => { for (let i = 0; i < 4; i++) after(i * 0.15, () => summon('knight', lv, 15 + 2 * lv)); sfx('spirit'); oracle('《Patto della Legione sigillato》'); return true; });
  // — Academy basics (any class)
  defSkill('b_dardo', [], 1, { name: 'Dardo Magico', icon: '✨', color: '#b08aff', cost: 10, cd: 1.5, desc: 'Tre dardi arcani a ricerca automatica.' },
    (lv) => { const e = target(30); face(e); for (let i = 0; i < 3; i++) after(i * 0.08, () => shootAt('arcane', e, 22, { dmg: 22 * SPOW(lv), turn: e ? 6 : 0, life: 2, r: 0.7, vy: 3 + i }, (i - 1) * 0.35)); sfx('spirit', { vol: 0.6 }); return true; },
    { basic: true, price: 100 });
  defSkill('b_cura', [], 2, { name: 'Cura Minore', icon: '💚', color: '#8cff9a', cost: 18, cd: 10, desc: 'Ripristina il 15% della vita.' },
    (lv) => { if (P.hp >= P.maxHp) { toast('Vita già al massimo'); return false; } heal(P.maxHp * (0.15 + 0.03 * (lv - 1))); return true; }, { basic: true, price: 250 });
  defSkill('b_barriera', [], 4, { name: 'Barriera', icon: '🔷', color: '#6fc8ff', cost: 22, cd: 20, desc: 'Uno scudo arcano riduce i danni del 40% per 6 s.' },
    (lv) => { BUFF.barrier = 6 + lv; sfx('shield'); return true; }, { basic: true, price: 500 });
  defSkill('b_luce', [], 1, { name: 'Luce', icon: '💡', color: '#fff6d0', cost: 8, cd: 30, desc: 'Un globo di luce ti segue per 2 minuti e acceca i nemici vicini.' },
    (lv) => { BUFF.light = 120; areaHit(P.x, P.z, 8, 1, 0, '#fff6d0', (e) => stunE(e, 1.5)); if (API.flashLight) { API.flashLight.color.set('#fff6d0'); API.flashLight.intensity = 80; API.flashLight.position.set(P.x, heightAt(P.x, P.z) + 3, P.z); } sfx('skillGet', { vol: 0.5 }); void lv; return true; },
    { basic: true, price: 80 });
  function registerSkills() {
    const AB = API.abilities; if (!AB) return;
    for (const id in SKILLS) { const s = SKILLS[id]; AB.register(id, s.def, (lv) => s.cast(lv)); }
  }

  /* ---------------------------------------------------------------- melee modifiers, ranged basic attacks, damage taken */
  function rangedKind() {
    const w = R.eq.weapon ? R.eq.weapon.b : CLS().w;
    if (P.form !== 'human') return null;
    if (w === 'arco') return 'bow';
    if (w === 'bastone') return 'staff';
    if (w === 'tomo') return 'tome';
    return null;
  }
  const ELEMS = ['fire', 'ice', 'shock'];
  function meleeMod(base, atk) {
    let mul = 1;
    if (BUFF.warcry > 0) mul *= 1.3;
    if (BUFF.berserk > 0) mul *= 1.5;
    if (BUFF.tonic > 0) mul *= 1.25;
    let crit = Math.random() < (ST.critC || 0);
    if (BUFF.stealth > 0) { mul *= 3; crit = true; endStealth(); dmgNum(P.x, heightAt(P.x, P.z) + 2.8, P.z, 'Colpo dall\'ombra!', 'crit'); }
    if (crit) mul *= ST.critM || 1.6;
    base = base * mul + (ST.elem || 0) * (atk && atk.heavy ? 1.6 : 1);
    const heavy = !!(atk && atk.heavy), rk = rangedKind();
    const gy = heightAt(P.x, P.z);
    if (rk) {
      const e = target(34); if (e) face(e);
      if (rk === 'bow') {
        const ph = (p, en) => procs(en, base);
        if (heavy) for (let i = -1; i <= 1; i++) shootAt('arrow', e, 50, { dmg: base * 0.75, pierce: 1, life: 1, r: 0.6, onHit: i === 0 ? ph : null }, i * 0.14);
        else shootAt('arrow', e, 52, { dmg: base * 1.05, life: 1, r: 0.6, turn: e ? 2 : 0, onHit: ph });
        sfx('needle', { vol: 0.5 });
      } else if (rk === 'staff') {
        const el = ELEMS[P.combo % 3], col = el === 'fire' ? '#ff7a1a' : el === 'ice' ? '#8fe0ff' : '#b9a0ff';
        if (heavy) { const boom = (p) => explode(p.x, p.y, p.z, 3.2, base * 0.9, col, 30); shootAt(el === 'ice' ? 'ice' : el === 'fire' ? 'fire' : 'arcane', e, 24, { dmg: 0, turn: e ? 3 : 0, life: 1.6, r: 0.8, onHit: boom, onEnd: boom, color: col, scale: 1.4 }); }
        else shootAt('arcane', e, 30, { dmg: base * 1.05, turn: e ? 4 : 0, life: 1.4, r: 0.6, color: col, onHit: (p, en) => { API.emit(en.x, aimY(en), en.z, 8, col, { speed: 4, life: 0.4 }); procs(en, base); } });
        sfx('spirit', { vol: 0.4 });
      } else {
        const n = heavy ? 3 : 1;
        for (let i = 0; i < n; i++) shootAt('spirit', e, 22, { dmg: base * (heavy ? 0.6 : 1), turn: e ? 5 : 0, life: 2, r: 0.6, onHit: i === 0 ? (p, en) => procs(en, base) : null }, (i - (n - 1) / 2) * 0.4);
        sfx('spirit', { vol: 0.4 });
      }
      if (crit) dmgNum(P.x + Math.sin(P.rot) * 2, gy + 2.4, P.z + Math.cos(P.rot) * 2, 'Critico!', 'crit');
      return base * 0.15;
    }
    // melee side effects: lifesteal, poison, elemental sparks, crit flash, imperial crescent
    const F = API.FORM[P.form] || { reach: 0 }, reach = (heavy ? 4 : 3.2) + F.reach, arc = heavy ? Math.PI : 1.2;
    let n = 0, firstHit = null;
    for (const e of API.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z) - e.d.r; if (d > reach) continue;
      if (Math.abs(angDiff(P.rot, Math.atan2(e.x - P.x, e.z - P.z))) > arc) continue;
      n++; if (!firstHit) firstHit = e;
      if (BUFF.poison > 0) addDot(e, 4, 12 * SPOW(ST.poisonLv || 1), '#7dff5a');
      if (ST.elem > 0) { const k = ST.fire >= ST.ice && ST.fire >= ST.shock ? AFF.fire.el : ST.ice >= ST.shock ? AFF.ice.el : AFF.shock.el; API.emit(e.x, aimY(e), e.z, 6, k, { speed: 4, life: 0.4, bright: 2.4 }); }
      if (crit) dmgNum(e.x, aimY(e) + 1.8, e.z, 'Critico!', 'crit');
    }
    if (firstHit) procs(firstHit, base);
    const ls = (ST.ls || 0) / 100 + (BUFF.berserk > 0 ? 0.1 : 0);
    if (ls > 0 && n) { const h = Math.round(base * ls * n * (R.cls === 'imperatore' ? 1 : 1)); if (h > 0) { P.hp = Math.min(P.maxHp, P.hp + h); if (h > 4) dmgNum(P.x, gy + 2.2, P.z, '+' + h, 'heal'); } }
    if (R.cls === 'imperatore' && heavy && P.form === 'human') { const e = target(30); shootAt('crescent', e, 30, { dmg: base * 0.8, pierce: 99, life: 0.8, r: 1.6, ground: false }); }
    return base;
  }
  const PCD = { guard: 0 };
  function procs(e, base) {
    const pw = ST.pow; if (!pw || e.dead) return;
    const y = aimY(e);
    if (pw.nova && Math.random() < 0.12) explode(e.x, y, e.z, 4, base * 0.9, '#ff7a1a', 30);
    if (pw.chain && Math.random() < 0.15) {
      let cur = e, px = P.x, py = heightAt(P.x, P.z) + 1.5, pz = P.z; const hit = new Set();
      for (let i = 0; i < 3 && cur; i++) {
        hit.add(cur); API.bolt(px, py, pz, cur.x, aimY(cur), cur.z, '#b9a0ff'); hitE(cur, base * 0.6, 10, 0, 0);
        px = cur.x; py = aimY(cur); pz = cur.z; let nx = null, bd = 10;
        for (const o of API.enemies) { if (!hostile(o) || hit.has(o)) continue; const d = Math.hypot(o.x - px, o.z - pz); if (d < bd) { bd = d; nx = o; } }
        cur = nx;
      }
      sfx('thunder', { vol: 0.4 });
    }
    if (pw.frost && Math.random() < 0.15) { stunE(e, 2); API.emit(e.x, y, e.z, 20, '#bff4ff', { speed: 4, life: 0.6 }); ringFx(e.x, e.y + 0.2, e.z, 0.4, 2.5, 0.4, '#8fe0ff', 2); }
    if (pw.vamp && Math.random() < 0.2) { const h = Math.round(P.maxHp * 0.04); P.hp = Math.min(P.maxHp, P.hp + h); API.emit(e.x, y, e.z, 10, '#ff4a6a', { speed: 2, life: 0.6 }); }
    if (pw.echo && Math.random() < 0.2) after(0.18, () => { if (e.dead) return; hitE(e, base * 0.5, 8, 0, 0); API.bolt(e.x - 1.5, y + 1.5, e.z, e.x + 1.5, y - 1, e.z, '#d8c8ff'); });
    if (pw.star && Math.random() < 0.1) {
      const gy = heightAt(e.x, e.z), x = e.x, z = e.z;
      shoot('meteor', { x: x - 6, y: gy + 30, z: z - 4, vx: 6 / 0.7, vy: -30 / 0.7, vz: 4 / 0.7, life: 0.9, vis: true, scale: 0.5, onEnd: () => explode(x, gy + 1, z, 4.5, base * 1.6, '#ffe08a', 60) });
    }
  }
  function hurtMul() {
    let m = 1;
    if (BUFF.sacred > 0) m *= 0.4;
    if (BUFF.barrier > 0) m *= 0.6;
    if (BUFF.stone > 0) m *= 0.75;
    if (BUFF.berserk > 0) m *= 1.15;
    if (BUFF.stealth > 0) endStealth();
    return m;
  }
  function clearCombat() {
    for (let i = PJ.length - 1; i >= 0; i--) killPJ(i);
    while (ALLY.length) dismiss(ALLY.length - 1);
    for (const z of ZONES) freeDecal(z.m); ZONES.length = 0;
    for (const t of TRAPS) freeDecal(t.m); TRAPS.length = 0;
    for (const o of ORBS) scene.remove(o.m); ORBS.length = 0;
    DOTS.length = 0; TIM.length = 0; ACT.kind = null; STEALTHED.length = 0;
    if (BIGSWORD) BIGSWORD.g.visible = false;
  }
  function updateSkills(dt, t) {
    for (let i = TIM.length - 1; i >= 0; i--) { const q = TIM[i]; q.t -= dt; if (q.t <= 0) { TIM.splice(i, 1); try { q.fn(); } catch (err) { console.error(err); } } }
    updateAct(dt, t);
    updatePJ(dt);
    updateAllies(dt, t);
    updateZones(dt, t);
    updateTraps(dt, t);
    updateDots(dt);
    updateOrbs(dt, t);
    updateRings(dt);
    updateSpikes(dt);
    updateBigSword(dt);
    updateBuffFx(dt, t);
    if (R && R.cls === 'imperatore' && Math.random() < dt * 10) { const gy = heightAt(P.x, P.z); const a = rand(0, TAU); API.emit(P.x + Math.cos(a) * 1.1, gy + rand(0.2, 2), P.z + Math.sin(a) * 1.1, 1, '#ffcf40', { speed: 0.3, up: 1.6, grav: -1, life: 1.1, bright: 2.6 }); }
  }

  /* ================================================================ ability bar filtering (class view of abilities3d) */
  let origOwned = null, barCache = null, barT = 0;
  function barList() {
    const now = performance.now();
    if (barCache && now - barT < 250) return barCache;
    barT = now; barCache = computeBar(); return barCache;
  }
  const barDirty = () => { barCache = null; };
  function computeBar() {
    const AB = API.abilities; if (!AB || !R) return origOwned ? origOwned() : [];
    const own = origOwned ? origOwned() : [];
    const ok = (id) => AB.level(id) > 0 && AB.defs[id] && !AB.defs[id].passive && (SKILLS[id] || allowedOther(id));
    // auto-add newly obtained abilities (absorbed / boss rewards) while there is room
    R.seen = R.seen || {};
    for (const id of own) if (!R.seen[id]) { R.seen[id] = 1; if (ok(id) && R.bar.length < 9 && !R.bar.includes(id)) R.bar.push(id); }
    return R.bar.filter(ok);
  }
  function syncBar() {
    const AB = API.abilities; if (!AB || !R) return;
    barDirty();
    const list = barList();
    if (list.length && !list.includes(S.abilSel)) S.abilSel = list[0];
  }
  function installAbilityHooks() {
    const AB = API.abilities;
    if (!AB || AB._rpg) return;
    AB._rpg = true;
    origOwned = AB.owned;
    AB.owned = () => barList();
    const g0 = AB.grant;
    AB.grant = function (id, silent) { const r = g0.call(AB, id, silent); barDirty(); return r; };
  }

  /* ================================================================ character creation */
  const NEW = { open: false, sel: 'guerriero', t: 0, prevForm: 'slime', yaw0: 0 };
  function openCreation(isNew) {
    injectCSS();
    let el = $('rpgnew');
    if (!el) { el = document.createElement('div'); el.id = 'rpgnew'; document.body.appendChild(el); el.addEventListener('pointerdown', (ev) => ev.stopPropagation()); }
    NEW.open = true; NEW.isNew = !!isNew;
    NEW.sel = (R && R.cls) || FROM2D[API.ch && API.ch.cls] || 'guerriero';
    if (NEW.sel === 'imperatore' && !API.mythic) NEW.sel = 'guerriero';
    NEW.name = (R && R.name) || (API.ch && API.ch.name) || 'Viandante';
    NEW.prevForm = P.form;
    if (UI.open) closePanel();
    API.state = 'menu';
    if (API.input) { API.input.lock = null; NEW.yaw0 = API.input.yaw; NEW.pitch0 = API.input.pitch; }
    el.classList.add('on');
    hudVis(false);
    if (!R && !NEW.isNew0) { API.teleport(METRO.x, METRO.z + 6); P.rot = 0; }
    renderCreation();
    previewClass(NEW.sel);
  }
  function renderCreation() {
    const el = $('rpgnew'); if (!el) return;
    const list = API.mythic ? ['imperatore'].concat(CLASS_ORDER.filter((k) => k !== 'imperatore')) : CLASS_ORDER.filter((k) => k !== 'imperatore');
    const C = CLASSES[NEW.sel];
    let cards = '';
    for (const k of list) {
      const c = CLASSES[k];
      cards += `<div class="cc${k === NEW.sel ? ' on' : ''}${c.mythic ? ' my' : ''}" data-c="${k}"><img src="${emblemURL(k, 80)}"><div class="cn" style="${c.mythic ? 'color:#ffcf40' : ''}">${esc(c.n)}<small>${esc(c.t)}</small></div></div>`;
    }
    let bars = '';
    for (const a of ATTR) { const v = C.at[a.k]; bars += `<div class="sb"><span>${a.n}</span><div class="bar2"><i style="width:${Math.min(100, v * 4)}%;background:linear-gradient(90deg,${C.color}88,${C.color})"></i></div><b>${v}</b></div>`; }
    let sk = '';
    const ids = Object.keys(SKILLS).filter((id) => !SKILLS[id].basic && (NEW.sel === 'imperatore' ? SKILLS[id].lv <= 1 : SKILLS[id].cls.includes(NEW.sel)));
    ids.sort((a, b) => SKILLS[a].lv - SKILLS[b].lv);
    for (const id of ids.slice(0, NEW.sel === 'imperatore' ? 6 : 5)) { const s = SKILLS[id]; sk += `<div class="sk"><em style="color:${s.def.color};text-shadow:0 0 6px ${s.def.color}">${s.def.icon}</em>${esc(s.def.name)}<small>Lv ${s.lv}</small></div>`; }
    if (NEW.sel === 'slime') sk = '<div class="sk"><em style="color:#b388ff">🌀</em>Predatore: divora e copia le abilità<small>sempre</small></div><div class="sk"><em style="color:#7fe6ff">🌊</em>Lama d\'Acqua<small>Lv 1</small></div><div class="sk"><em style="color:#bfefff">🎭</em>Mimetismo: Slime · Umano · Lupo · Drago<small>evolve</small></div>';
    if (NEW.sel === 'imperatore') sk = '<div class="sk"><em style="color:#ffcf40">♛</em>Tutte le abilità di tutte le classi<small>∞</small></div>' + sk + '<div class="sk"><em style="color:#ffcf40">☀</em>Aura d\'oro · Sentenza Imperiale<small>sempre</small></div>';
    const wName = C.w ? BASES[C.w].n + (C.off ? ' e ' + BASES[C.off].n : '') : 'Il proprio corpo (Predatore)';
    el.innerHTML = `<div class="nt">${NEW.isNew ? 'NUOVA PARTITA' : R ? 'CAMBIA CLASSE' : 'LA TUA RINASCITA'}<small>Scegli la tua classe · ogni mondo ti ha portato qui</small></div>
      <div class="nl">${cards}</div>
      <div class="nr"><div class="nrd"><div style="display:flex;gap:9px;align-items:center"><img src="${emblemURL(NEW.sel, 96)}" style="width:52px;height:52px"><div><h2 style="color:${C.color}">${esc(C.n)}</h2><div style="font-size:11.5px;color:#a8987a">${esc(C.t)}<br>Arma: ${esc(wName)}</div></div></div>
        <div class="ds">${esc(C.desc)}</div>${bars}<div style="font-size:10.5px;letter-spacing:2px;color:#c9b27a;margin:7px 0 2px">ABILITÀ DISTINTIVE</div>${sk}</div>
      <div class="nc"><div class="lbl">IL TUO NOME</div><input id="rpgname" maxlength="22" value="${esc(NEW.name)}" autocomplete="off" spellcheck="false"><button class="go" id="rpggo">Inizia l'avventura</button>${NEW.canCancel ? '<button class="cancel" id="rpgcancel">Annulla</button>' : ''}</div></div>`;
    el.querySelectorAll('.cc').forEach((c) => c.addEventListener('click', () => { NEW.name = $('rpgname').value || NEW.name; NEW.sel = c.dataset.c; sfx('select'); renderCreation(); previewClass(NEW.sel); }));
    const inp = $('rpgname');
    inp.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.code === 'Enter') startGame(); });
    inp.addEventListener('keyup', (ev) => ev.stopPropagation());
    inp.addEventListener('input', () => { NEW.name = inp.value; });
    $('rpggo').addEventListener('click', startGame);
    if ($('rpgcancel')) $('rpgcancel').addEventListener('click', () => closeCreation());
  }
  function previewClass(cls) {
    // temporary look for the 3D preview
    const keep = R;
    const tmp = R ? Object.assign({}, R, { cls, eq: {} }) : Object.assign(blankRPG(cls), { eq: {} });
    R = tmp; applyLook(); LOOK.key = ''; refreshWeapons(); R = keep;
    NEW.t = 0; sfx('skillGet', { vol: 0.4 });
    const gy = heightAt(P.x, P.z);
    API.emit(P.x, gy + 1, P.z, 30, CLASSES[cls].color, { speed: 3, up: 3, grav: 0, life: 1 });
  }
  function menuTick(dt) {
    if (!NEW.open) return;
    NEW.t += dt;
    const cls = NEW.sel, slimeP = cls === 'slime';
    const inp = API.input;
    // camera in front of the character, model slightly closer to the camera
    if (inp) { inp.yaw = P.rot + Math.sin(NEW.t * 0.25) * 0.08; inp.pitch = 0.02; }
    const gy = heightAt(P.x, P.z);
    const fx = Math.sin(P.rot), fz = Math.cos(P.rot);
    const mx = P.x + fx * 3.0, mz = P.z + fz * 3.0, my = heightAt(mx, mz);
    const face = P.rot + Math.sin(NEW.t * 0.6) * 0.55;
    API.slime.visible = slimeP; H.root.visible = !slimeP;
    if (API.wolfForm) API.wolfForm.root.visible = false;
    if (slimeP) {
      API.slime.position.set(mx, my + 0.85 + Math.abs(Math.sin(NEW.t * 3)) * 0.12, mz); API.slime.rotation.y = face;
      API.body.scale.set(1 + Math.sin(NEW.t * 3) * 0.04, 1 - Math.sin(NEW.t * 3) * 0.04, 1 + Math.sin(NEW.t * 3) * 0.04);
    } else {
      H.root.position.set(mx, my, mz); H.root.rotation.y = face; H.root.scale.setScalar(1);
      H.g.rotation.set(0, 0, 0); H.g.position.y = Math.sin(NEW.t * 2) * 0.015;
      H.legL.rotation.x = 0.05; H.legR.rotation.x = -0.05;
      H.armL.rotation.set(0, 0, 0.12); H.armR.rotation.set(-0.15 + Math.sin(NEW.t * 1.5) * 0.05, 0, -0.12);
      H.head.rotation.y = Math.sin(NEW.t * 0.7) * 0.2;
      if (LOOK.weaponR && LOOK.weaponR.userData.upright) LOOK.weaponR.rotation.x = -H.armR.rotation.x;
      if (LOOK.weaponL && LOOK.weaponL.userData.bow) LOOK.weaponL.rotation.x = -H.armL.rotation.x;
      if (LOOK.weaponL && LOOK.weaponL.userData.book) { H.armL.rotation.x = -0.75; LOOK.weaponL.rotation.x = 0.4; }
      if (LOOK.weaponL && LOOK.weaponL.userData.shield) { H.armL.rotation.x = -0.5; H.armL.rotation.z = 0.25; }
      if (LOOK.aura && LOOK.aura.visible) { LOOK.aura.rotation.z += dt * 1.5; LOOK.aura.position.y = 0.9 + Math.sin(NEW.t * 2) * 0.35; }
    }
    if (Math.random() < dt * 8) { const a = rand(0, TAU); API.emit(mx + Math.cos(a) * 1.2, my + 0.1, mz + Math.sin(a) * 1.2, 1, CLASSES[cls].color, { speed: 0.3, up: 2.2, grav: -0.6, life: 1.6, bright: 2 }); }
    void gy;
  }
  function hudVis(on) {
    for (const id of ['hud', 'touch']) { const e = $(id); if (e) e.style.visibility = on ? '' : 'hidden'; }
    const tw = $('twv'); if (tw && !on) tw.style.visibility = 'hidden'; else if (tw) tw.style.visibility = '';
  }
  function closeCreation() {
    NEW.open = false; hudVis(true);
    const el = $('rpgnew'); if (el) el.classList.remove('on');
    if (API.input && NEW.yaw0 != null) { API.input.yaw = P.rot + Math.PI; API.input.pitch = 0.35; }
    applyLook(); LOOK.key = ''; refreshWeapons(); applyForms();
    API.state = 'play';
  }
  function startGame() {
    const cls = NEW.sel;
    const name = (($('rpgname') && $('rpgname').value) || NEW.name || 'Viandante').trim().slice(0, 22) || 'Viandante';
    const first = !R;
    if (R && R.cls !== cls && !NEW.isNew) {
      // changing class on an existing save keeps the level but resets attributes / gear look
      R.cls = cls; R.at = Object.assign({}, CLASSES[cls].at); R.pts = (R.lv - 1) * 5; R.name = name;
    } else if (!R || NEW.isNew) {
      R = S.rpg = blankRPG(cls, name);
      starterKit(cls);
    }
    R.name = name; if (API.ch) API.ch.name = name;
    S.rpg = R; sanitize();
    applyForms(); unlockSkills(false); syncBar();
    API.recalc(true);
    API.saveS();
    closeCreation();
    sfx('evolve'); API.lightPillar(P.x, P.z, CLASSES[cls].color, 2);
    const C = CLS();
    // new characters start in Altheria, the City of a Thousand Worlds
    if (first || NEW.isNew) {
      const gi = API.graceObjs ? API.graceObjs.findIndex((g) => /Mille Stelle/.test(g.name)) : -1;
      if (gi >= 0) { S.grace = gi; S.found[gi] = true; }
      API.teleport(METRO.x, METRO.z + 6); P.rot = Math.PI; if (API.input) API.input.yaw = 0;
      setTimeout(() => API.bigMsg('ALTHERIA', 'place', 3.5), 400);
    }
    setTimeout(() => oracle(`《Reincarnazione completata. Classe: ${C.n}. Benvenuto, ${name}.》`, true), 900);
    setTimeout(() => oracle('《Finestra di Stato: tasto C · Zaino: I · Abilità: U · Pozione: H》'), 5200);
    API.saveS();
  }
  function starterKit(cls) {
    const C = CLASSES[cls];
    if (C.w) { const w = makeItem(C.w, 1, cls === 'imperatore' ? 5 : 0); R.eq.weapon = w; }
    if (C.off) R.eq.off = makeItem(C.off, 1, 0);
    R.eq.chest = makeItem('corazza', 1, 0);
    const p = makeItem('pozione', 1); p.q = 3; R.inv[0] = p;
    const e = makeItem('etere', 1); e.q = 1; R.inv[1] = e;
    if (cls === 'imperatore') { R.inv[2] = makeItem('anello', 5, 5); R.inv[3] = makeItem('amuleto', 5, 4); const t = makeItem('ritorno', 1); t.q = 3; R.inv[4] = t; }
    R.learned = {};
  }
  function quickStart(cls) {
    R = S.rpg = blankRPG(cls); starterKit(cls); sanitize();
    applyForms(); unlockSkills(false); syncBar(); applyLook(); refreshWeapons(); API.recalc(true); API.saveS();
  }
  function askNewGame() {
    confirmBox('Iniziare una <b>nuova partita</b>?<br><small>Tutti i progressi delle Terre Spezzate (livello, oggetti, boss, missioni) verranno cancellati.</small>', () => {
      try { localStorage.removeItem(KEY3D); localStorage.setItem('slimeReborn.3d.new', '1'); } catch (e) { /* ignore */ }
      location.reload();
    });
  }
  function applyForms() {
    if (!R) return;
    if (isSlimeLike()) {
      if (R.formsBak) { S.forms = Object.assign({}, R.formsBak, S.forms); delete R.formsBak; }
      if (R.cls === 'imperatore') { S.forms.human = true; if (P.form === 'slime' && !NEW.open) P.form = 'human'; }
      if (API.buttons.absorb) API.buttons.absorb.style.display = '';
      if (API.buttons.form) API.buttons.form.style.display = '';
    } else {
      if (!R.formsBak) R.formsBak = Object.assign({}, S.forms);
      for (const k in S.forms) if (k !== 'human') delete S.forms[k];
      S.forms.human = true;
      P.form = 'human';
      if (API.buttons.absorb) API.buttons.absorb.style.display = 'none';
      if (API.buttons.form) API.buttons.form.style.display = 'none';
    }
  }

  /* ================================================================ input */
  function onKey(ev) {
    if (ev.repeat) return;
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    if (NEW.open) return;
    const c = ev.code;
    if ($('rpgcf') && $('rpgcf').classList.contains('on')) { if (c === 'Escape') $('rpgcf').querySelector('.n').click(); return; }
    if (UI.open) {
      if (c === 'Escape' || (c === 'KeyI' && UI.tab === 'inv') || (c === 'KeyC' && UI.tab === 'stat') || (c === 'KeyU' && UI.tab === 'skill')) { ev.stopPropagation(); closePanel(); return; }
      if (c === 'KeyI' && !UI.shop) { UI.tab = 'inv'; UI.sel = null; render(); }
      else if (c === 'KeyC' && !UI.shop) { UI.tab = 'stat'; render(); }
      else if (c === 'KeyU' && !UI.shop) { UI.tab = 'skill'; render(); }
      return;
    }
    if (API.state !== 'play' || !R) return;
    if (c === 'KeyI') openPanel('inv');
    else if (c === 'KeyC') openPanel('stat');
    else if (c === 'KeyU') openPanel('skill');
    else if (c === 'KeyH') quickPotion();
  }
  function onKeyCapture(ev) {
    if (API.state !== 'play' || !R || NEW.open || UI.open) return;
    if (ev.target && ev.target.tagName === 'INPUT') return;
    const c = ev.code;
    if (!isSlimeLike() && (c === 'KeyG' || c === 'KeyT')) { ev.stopImmediatePropagation(); return; }
    const m = /^Digit([1-9])$/.exec(c);
    if (m && API.abilities) {
      ev.stopImmediatePropagation();
      if (ev.repeat) return;
      const list = barList(), id = list[+m[1] - 1];
      if (id) { API.abilities.select(id); sfx('select'); }
    }
  }

  /* ================================================================ misc runtime */
  let prevSel = null, regionT = 0, foundN = -1, regenAcc = 0;
  function trackDiscovery(dt) {
    regionT -= dt;
    if (regionT > 0) return;
    regionT = 1;
    const n = Object.keys(S.found || {}).length;
    if (foundN >= 0 && n > foundN) { giveXP(80 + regionLevel(P.x, P.z) * 40, P.x, P.z); oracle('《Luce di Grazia registrata. Esperienza ottenuta.》'); }
    foundN = n;
    const rk = API.regionAt(P.x, P.z);
    if (!R.reg[rk]) { R.reg[rk] = 1; if (Object.keys(R.reg).length > 1) { giveXP(200 + regionLevel(P.x, P.z) * 60, P.x, P.z); oracle(`《Nuova regione scoperta: ${API.REGIONS[rk].name}. Livello consigliato: ${regionLevel(P.x, P.z)}》`); } API.saveS(); }
  }

  /* ================================================================ plugin */
  API.register({
    id: 'rpg3d',
    init() {
      injectCSS(); buildHUD();
      R = S.rpg || null;
      if (R) { sanitize(); if (API.ch) API.ch.name = R.name || API.ch.name; }
      installAbilityHooks();
      registerSkills();
      if (R) { applyForms(); unlockSkills(false); syncBar(); applyLook(); refreshWeapons(); API.recalc(true); }
      window.addEventListener('keydown', onKeyCapture, true);
      window.addEventListener('keydown', onKey);
      // touch buttons: a small row under the status bars (top-left), clear of the joystick and the quest tracker
      const tb = [['rpgchar', 'Stato', 12], ['rpginv', '🎒', 58], ['rpgpot', '🧪', 104]];
      for (const [id, label, left] of tb) {
        const b = API.addButton(id, label, 100, 100, 20);
        if (!b) continue;
        Object.assign(b.style, { right: 'auto', bottom: 'auto', left: `calc(${left}px + env(safe-area-inset-left))`, top: '102px', fontSize: id === 'rpgchar' ? '11px' : '17px' });
      }
      const prevBack = window.SKBack;
      window.SKBack = () => {
        if ($('rpgcf') && $('rpgcf').classList.contains('on')) { $('rpgcf').querySelector('.n').click(); return true; }
        if (NEW.open) { if (NEW.canCancel) closeCreation(); return true; }
        if (UI.open) { closePanel(); return true; }
        return prevBack ? prevBack() : false;
      };
      // "Nuova partita" inside the engine pause menu
      const pbox = $('pause') && $('pause').querySelector('.box');
      if (pbox && window.MutationObserver) {
        new MutationObserver(() => {
          if (pbox.querySelector('#p-new') || !pbox.querySelector('#p-go')) return;
          const b = document.createElement('button'); b.id = 'p-new'; b.textContent = 'Nuova partita (scegli la classe)';
          b.addEventListener('click', () => { $('pause').classList.remove('open'); API.state = 'play'; askNewGame(); });
          const st = document.createElement('button'); st.id = 'p-stat'; st.textContent = 'Finestra di Stato / Zaino';
          st.addEventListener('click', () => { $('pause').classList.remove('open'); API.state = 'play'; openPanel('stat'); });
          pbox.insertBefore(st, pbox.querySelector('#p-menu')); pbox.insertBefore(b, pbox.querySelector('#p-menu'));
        }).observe(pbox, { childList: true });
      }
      // grace menu: the engine's rune "Livello" becomes "Benedizioni"; add the adventurer level and a Status button
      const gbox = $('grace') && $('grace').querySelector('.box');
      if (gbox && window.MutationObserver) {
        new MutationObserver(() => {
          if (!R || gbox.querySelector('#g-stat') || !gbox.querySelector('#g-go')) return;
          const mu = gbox.querySelectorAll('.muted');
          if (mu[0]) mu[0].innerHTML = mu[0].innerHTML.replace(/Livello (\d+)/, 'Benedizioni $1');
          if (mu[1]) mu[1].innerHTML = mu[1].innerHTML.replace('Costo prossimo livello', 'Costo prossima benedizione');
          const info = document.createElement('div'); info.className = 'muted'; info.style.cssText = 'text-align:center;color:#9fd8ff;margin:2px 0 6px';
          info.innerHTML = `《 ${esc(R.name)} · ${esc(CLS().n)} · Livello ${R.lv} 》${R.pts ? ` · <b style="color:#ffe7a8">${R.pts} punti attributo</b>` : ''}`;
          if (mu[1]) mu[1].after(info);
          const b = document.createElement('button'); b.id = 'g-stat'; b.textContent = '《 Finestra di Stato 》';
          b.addEventListener('click', () => { $('grace').classList.remove('open'); API.state = 'play'; openPanel('stat'); });
          gbox.insertBefore(b, gbox.querySelector('#g-go'));
        }).observe(gbox, { childList: true });
      }
      if (SK.events) SK.events.on('3d:floor', (d) => { if (d && d.floor) curFloor = d.floor; });
      let fresh = false; try { fresh = localStorage.getItem('slimeReborn.3d.new') === '1'; localStorage.removeItem('slimeReborn.3d.new'); } catch (e) { /* ignore */ }
      if (!R) {
        const qs = new URLSearchParams(location.search), forced = qs.get('cls');
        if (forced && CLASSES[forced] && (forced !== 'imperatore' || API.mythic)) quickStart(forced);
        else if ((SK.debug && (SK.debug.autoplay || SK.debug.godmode)) && !qs.has('newgame')) quickStart(FROM2D[API.ch && API.ch.cls] === 'imperatore' && !API.mythic ? 'slime' : FROM2D[API.ch && API.ch.cls] || 'slime');
        else setTimeout(() => openCreation(fresh), 700);
      }
      if (R) setTimeout(() => oracle(`《Status: ${R.name} · ${CLS().n} · Livello ${R.lv}》`), 6500);
      // re-scale enemies spawned before this plugin registered
      for (const e of API.enemies) if (e.level == null) onSpawn(e);
    },
    populate() {
      if (R) R.shop = (R.shop || 0) + 1;
      clearCombat();
      for (const e of API.enemies) if (e.level == null) onSpawn(e);
    },
    update(dt) {
      if (!R) return;
      const t = performance.now() / 1000;
      if (!isSlimeLike()) { if (P.form !== 'human') P.form = 'human'; if (P.absorb > 0) P.absorb = 0; }
      if (weaponDirty) refreshWeapons();
      animateWeapons(dt, t);
      updatePickups(dt);
      updateSkills(dt, t);
      trackDiscovery(dt);
      // ability bar: keep the selection inside the class bar
      if (API.abilities) {
        const list = barList();
        if (API.pressed('abilnext') && list.length && prevSel) { const i = list.indexOf(prevSel); S.abilSel = list[(i + 1) % list.length]; const d = API.abilities.defs[S.abilSel]; toast(d.icon + ' ' + d.name); }
        if (list.length && !list.includes(S.abilSel)) S.abilSel = list[0];
        prevSel = S.abilSel;
      }
      for (const k in BUFF) if (BUFF[k] > 0) BUFF[k] = Math.max(0, BUFF[k] - dt);
      if (PCD.guard > 0) PCD.guard -= dt;
      if (ST.regen && P.hp > 0 && P.hp < P.maxHp) { regenAcc += ST.regen * dt; if (regenAcc >= 1) { P.hp = Math.min(P.maxHp, P.hp + Math.floor(regenAcc)); regenAcc -= Math.floor(regenAcc); } }
      if (P.fp < P.maxFp) P.fp = Math.min(P.maxFp, P.fp + dt * (0.6 + Math.max(0, (ST.SAG || 10) - 10) * 0.05));
      if (API.pressed('rpginv')) openPanel('inv');
      else if (API.pressed('rpgchar')) openPanel('stat');
      else if (API.pressed('rpgpot')) quickPotion();
    },
    interactables() {
      const out = [];
      if (!R) return out;
      for (const p of PICK) if (!p.gold && Math.abs(p.x - P.x) < 3 && Math.abs(p.z - P.z) < 3) out.push({ x: p.x, z: p.z, r: 2.6, label: 'Raccogli: ' + itemName(p.it), action: () => { const i = PICK.indexOf(p); if (i >= 0) collectPick(i); } });
      return out;
    },
    onSpawn,
    onKill(e, absorbed, runes) {
      if (!R || !e || !e.d) return;
      const L = enemyLevel(e), boss = !!e.d.boss;
      let xp = (e.d.hp * 0.35 + e.d.runes * 0.5) * (1 + (L - 1) * 0.3) * (boss ? 2.5 : 1) * (e.elite ? 2.5 : 1);
      const diff = R.lv - L;
      if (diff > 5) xp *= Math.max(0.1, 1 - (diff - 5) * 0.12); else if (diff < 0) xp *= 1 + Math.min(0.5, -diff * 0.05);
      if (e.passive) xp *= 0.2;
      R.kills = (R.kills || 0) + 1;
      giveXP(Math.max(1, Math.round(xp)), e.x, e.z);
      const extra = Math.round((e.d.runes || 0) * (L - 1) * 0.12 * (1 + (ST.gold || 0) / 100) * (e.elite ? 2 : 1));
      if (extra > 0) S.runes += extra;
      // loot
      const il = L;
      if (boss) {
        for (let i = 0; i < 3; i++) setTimeout(() => dropLoot(e.x + rand(-3, 3), e.z + rand(-3, 3), il + 2, i === 0 ? 3 : 2), 600 + i * 250);
        for (let i = 0; i < 6; i++) dropGold(e.x + rand(-2, 2), e.z + rand(-2, 2), Math.round(e.d.runes * 0.05 * (1 + L * 0.1)));
      } else {
        const ch = (e.elite ? 0.85 : e.type === 'knight' ? 0.32 : 0.16) * (absorbed ? 0.6 : 1);
        if (Math.random() < ch) dropLoot(e.x, e.z, il, e.elite ? 1 : 0);
        if (Math.random() < 0.25) dropGold(e.x, e.z, Math.round(5 + L * 3 + Math.random() * L * 2));
        if (e.elite) for (let i = 0; i < 3; i++) dropGold(e.x + rand(-1, 1), e.z + rand(-1, 1), Math.round(10 + L * 4));
      }
      evt('3d:kill', { type: e.type, level: L, boss, elite: !!e.elite });
      void runes;
    },
    onHurt(dmg, fx, fz) {
      if (!R || !(dmg > 0)) return dmg;
      const src = attackerAt(fx, fz);
      const L = src ? enemyLevel(src) : regionLevel(P.x, P.z);
      dmg *= src && src.dmgMul ? src.dmgMul : dmgMul(L, false);
      if (Math.random() < (ST.dodgeC || 0)) { dmgNum(P.x, heightAt(P.x, P.z) + 2.3, P.z, 'Schivata!', ''); sfx('dash', { vol: 0.5 }); return 0; }
      if (ST.block && Math.random() < ST.block / 100) { dmg *= 0.35; dmgNum(P.x, heightAt(P.x, P.z) + 2.6, P.z, 'Parata', ''); sfx('shield', { vol: 0.6 }); }
      dmg *= 1 - armorRed(L);
      dmg *= hurtMul();
      dmg = Math.max(1, Math.round(dmg));
      if (ST.pow) {
        if (ST.pow.thorns && src && !src.dead) { const v = Math.round(dmg * 0.35); API.hitEnemyQuiet(src, v); dmgNum(src.x, aimY(src) + 1, src.z, v, ''); API.emit(src.x, aimY(src), src.z, 6, '#c8a060', { speed: 3, life: 0.4 }); }
        if (ST.pow.guard && PCD.guard <= 0 && P.hp - dmg < P.maxHp * 0.3) { PCD.guard = 40; BUFF.barrier = Math.max(BUFF.barrier, 5); oracle('《Ultimo Baluardo attivato》'); sfx('shield'); }
      }
      return dmg;
    },
    onMelee(base, atk) {
      if (!R) return base;
      return meleeMod(base, atk);
    },
    recalc,
    hud,
  });

  /* ================================================================ public API */
  API.rpg = {
    get level() { return R ? R.lv : 1; },
    get xp() { return R ? R.xp : 0; },
    get xpNext() { return R ? xpNext(R.lv) : xpNext(1); },
    get gold() { return S.runes; },
    giveXP: (n, x, z) => giveXP(n, x, z),
    giveGold: (n) => giveGold(n),
    giveItem: (it) => giveItem(it),
    rollLoot: (il, boost) => rollLoot(il, boost),
    dropLoot: (x, z, il, boost, item) => dropLoot(x, z, il, boost, item),
    itemName,
    openShop, openTrainer,
    openInventory: () => openPanel('inv'),
    openCharacter: () => openPanel('stat'),
    openSkills: () => openPanel('skill'),
    newGame: () => askNewGame(),
    setLevel(n) { if (!R) return; n = clamp(n | 0, 1, MAXLV); const d = n - R.lv; R.lv = n; R.xp = 0; if (d > 0) { R.pts += d * 5; R.sp += d; } unlockSkills(false); API.recalc(true); API.saveS(); },
    cls: () => (R ? R.cls : null),
    classes: CLASSES,
    enemyLevel,
    regionLevel,
    stats: () => ST,
    items: { BASES, RAR, makeItem, iconURL, value: itemValue },
    isOpen: () => UI.open || NEW.open,
  };
})();
