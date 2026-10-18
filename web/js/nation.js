/* Slime Reborn — L'Ascesa del Predatore · SK.Nation (nation.js)
 * "La Tua Nazione": meta hub with 6 original romanceable companions (PG-13, wholesome),
 * affinity hearts, gifts, visual-novel dates, rings, proposals, weddings with fireworks,
 * multiple spouses, spouse bonuses and companion fighters that join the run as allies.
 * Owns SK.save.data.nation. Classic script, no dependencies outside the contract. */
(function (SK) {
  'use strict';

  const U = SK.util;
  const TAU = Math.PI * 2, PI = Math.PI, HALF_PI = Math.PI / 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const hypot = Math.hypot, atan2 = Math.atan2, floor = Math.floor, sqrt = Math.sqrt;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const NOEX = Object.freeze({});

  /* ================================================================ helpers */
  function sfx(name, o) { try { if (SK.Audio && SK.Audio.sfx) SK.Audio.sfx(name, o); } catch (e) { /* audio optional */ } }
  function save() { try { SK.save.write(); } catch (e) { /* storage optional */ } }
  function data() { return SK.save.data; }
  function souls() { return floor(+data().souls || 0); }
  function spendSouls(n) {
    const d = data();
    if ((+d.souls || 0) < n) return false;
    d.souls = (+d.souls || 0) - n;
    save();
    return true;
  }
  function playerName() {
    const c = data().character;
    const n = c && c.name ? String(c.name).trim() : '';
    return n ? n.slice(0, 24) : 'Viandante';
  }
  function fmt(s, ctx) {
    let r = String(s == null ? '' : s).replace(/\{P\}/g, playerName());
    if (ctx) {
      if (ctx.N != null) r = r.replace(/\{N\}/g, ctx.N);
      if (ctx.C != null) r = r.replace(/\{C\}/g, ctx.C);
      if (ctx.L != null) r = r.replace(/\{L\}/g, ctx.L);
    }
    return r;
  }
  function fxCall(name, a, b, c, d, e) {
    const F = SK.FX;
    if (!F || typeof F[name] !== 'function') return null;
    try { return F[name](a, b, c, d, e); } catch (err) { return null; }
  }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function lowQ() { return SK.quality === 'low'; }

  /* ========================================================== save access */
  function nat() {
    const d = data();
    let n = d.nation;
    if (!n || typeof n !== 'object') n = d.nation = {};
    if (!n.companions || typeof n.companions !== 'object' || Array.isArray(n.companions)) n.companions = {};
    if (!Array.isArray(n.citizens)) n.citizens = [];
    if (!(n.rings >= 0)) n.rings = 0;
    if (n.activeCompanion === undefined) n.activeCompanion = null;
    if (!(n.weddings >= 0)) n.weddings = 0;
    return n;
  }
  function cst(id) {
    const n = nat();
    let c = n.companions[id];
    if (!c || typeof c !== 'object') c = n.companions[id] = {};
    c.unlocked = !!c.unlocked;
    c.affinity = clamp(floor(+c.affinity || 0), 0, 10);
    c.married = !!c.married;
    if (!(c.dates >= 0)) c.dates = 0;
    if (typeof c.talkedRun !== 'number') c.talkedRun = -1;
    if (typeof c.datedRun !== 'number') c.datedRun = -1;
    if (!c.datesDone || typeof c.datesDone !== 'object') c.datesDone = {};
    if (!(c.gifts >= 0)) c.gifts = 0;
    c.seen = !!c.seen;
    c.isNew = !!c.isNew;
    if (c.married) c.affinity = 10;
    return c;
  }
  function runId() { return floor(+data().runs || 0); }

  /* ================================================================ gifts */
  const GIFTS = [
    { id: 'te', name: 'Tè ai Fiori di Ciliegio', desc: 'Profumato, delicato, rilassante.', cost: 15, color: '#f8bbd0' },
    { id: 'tofu', name: 'Tofu Fritto Dorato', desc: 'Croccante fuori, morbido dentro. Leggendario.', cost: 15, color: '#ffb74d' },
    { id: 'dolci', name: 'Dolcetti al Miele di Fata', desc: 'Morbidi, dorati, irresistibili.', cost: 20, color: '#ffcc80' },
    { id: 'fiori', name: 'Bouquet di Rose Lunari', desc: 'Rose che brillano al chiaro di luna.', cost: 25, color: '#ff80ab' },
    { id: 'melagrana', name: 'Succo di Melagrana Cremisi', desc: 'Annata pregiata, servito in calice.', cost: 30, color: '#e53935' },
    { id: 'conchiglia', name: 'Conchiglia Cantante', desc: "Se l'avvicini all'orecchio, canta.", cost: 35, color: '#4dd0e1' },
    { id: 'libro', name: 'Tomo di Poesie Antiche', desc: "Versi d'amore di un'era dimenticata.", cost: 40, color: '#b39ddb' },
    { id: 'cote', name: 'Cote di Ossidiana Runica', desc: 'Rende ogni lama affilata come il primo giorno.', cost: 45, color: '#90a4ae' },
    { id: 'carillon', name: 'Carillon Stellato', desc: 'Suona una melodia sotto un cielo di stelle.', cost: 55, color: '#ffe082' },
    { id: 'piuma', name: 'Piuma di Fenice', desc: 'Calda al tatto, non smette mai di brillare.', cost: 60, color: '#ff7043' },
    { id: 'pendente', name: 'Pendente di Cristallo Abissale', desc: 'Un gioiello che pulsa di luce azzurra.', cost: 70, color: '#80deea' },
  ];
  const GIFT_BY_ID = {};
  for (const g of GIFTS) GIFT_BY_ID[g.id] = g;

  /* ================================================================ dates */
  const DATES = [
    { id: 'lago', name: 'Passeggiata al lago di luna', desc: 'Una passeggiata romantica sotto la luna piena.', req: 1, cost: 30 },
    { id: 'taverna', name: 'Cena alla taverna', desc: 'Stufato caldo, risate e candele.', req: 3, cost: 45 },
    { id: 'alba', name: "Allenamento all'alba", desc: 'Rugiada, sudore e un sole che sorge.', req: 5, cost: 40 },
    { id: 'lanterne', name: 'Festival delle lanterne', desc: 'Mille luci che salgono verso le stelle.', req: 7, cost: 60 },
  ];
  const RING_COST = 300;
  const BOSS_NAMES = {
    orc_tyrant: 'il Tiranno degli Orchi', abyss_serpent: 'la Serpe Nera degli Abissi',
    alpha_wolf: 'il Lupo Alfa della Luna Cremisi', demon_lord: 'il Re Demone Caduto',
  };
  function bossName(id) {
    try {
      const d = SK.Enemies && SK.Enemies.types && SK.Enemies.types[id];
      if (d && d.name) return d.name;
    } catch (e) { /* fall back */ }
    const n = BOSS_NAMES[id] || id;
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  /* ============================================================ companions
   * Line syntax: "n:" narrator, "p:" player, "@id:" another companion, otherwise the companion.
   * Optional leading "[mood]" (idle|happy|love|shy|angry|sad|surprised|smug). {P} = player name. */
  const COMPANIONS = [
    {
      id: 'aurelia', name: 'Aurelia', race: 'Oni', title: 'Lama Cremisi del Clan Oni', short: 'Lama Cremisi',
      color: '#ff4d5e', unlock: { boss: 'orc_tyrant' },
      spouseBonus: { stat: 'dmg', value: 0.15, label: '+15% danno' },
      likes: ['dolci', 'cote', 'pendente'],
      combat: { kind: 'flameSword', range: 26, cd: 0.72 },
      bio: "Ultima erede del clan Oni della Fiamma Rossa. Il Tiranno degli Orchi l'aveva incatenata nella sua arena, costringendola a combattere ogni notte. Orgogliosa, testarda e incapace di accettare un complimento, giura di saldare il suo debito con te... anche se non lo ammetterà mai ad alta voce.",
      lines: {
        meet: ["[angry]Le catene sono spezzate... Non ringraziarmi, non ti ho chiesto aiuto.", "[shy]...Però verrò nella tua Nazione. Qualcuno dovrà pur proteggerti, {P}."],
        t0: [
          "[angry]Hmph. Non pensare che ti debba qualcosa solo perché mi hai liberata, {P}.",
          "Se proprio vuoi stare qui, almeno non intralciare il mio allenamento.",
          "[smug]Un vero guerriero non chiacchiera. Combatte. Tu invece chiacchieri un sacco.",
          "[angry]Cosa guardi? Ho qualcosa sulle corna?!",
          "Il clan della Fiamma Rossa non si inchina a nessuno. Tienilo a mente.",
          "[shy]...Grazie per la zuppa di ieri. N-non farci l'abitudine!",
          "[sad]Il Tiranno mi faceva combattere ogni notte. Qui, almeno, si dorme in pace.",
        ],
        t1: [
          "[shy]Ti ho tenuto un posto vicino al fuoco. Solo perché era libero, chiaro?",
          "[happy]Oggi ho spaccato tre tronchi con un colpo solo! ...Volevo che lo sapessi prima di tutti.",
          "[smug]Sei più forte di quanto sembri, {P}. Per essere una creatura rinata da poco, intendo.",
          "[angry]Se qualcuno nella Nazione ti manca di rispetto, dimmelo. Ci penso io.",
          "[shy]Ho lucidato la mia spada. C'era anche il tuo nome inciso sopra. Per caso. Totalmente per caso.",
          "[happy]Allenati con me domani all'alba. Se arrivi tardi, cento giri del villaggio!",
        ],
        t2: [
          "[love]Quando non ci sei, il villaggio è troppo silenzioso. ...Non ridere!",
          "[shy]Mia madre diceva che un Oni dona il cuore una volta sola. Io... credo di averlo già fatto.",
          "[love]Combatterò al tuo fianco fino alla fine del mondo, {P}. E anche dopo.",
          "[happy]Ti ho preparato degli onigiri. Sono un po' storti. Sono fatti con amore. Mangiali e basta!",
          "[shy]Se mi tieni la mano davanti a tutti, io... io non mi oppongo. Ecco.",
          "[love]Sei la sola persona contro cui abbia mai perso. E sono felice di aver perso.",
        ],
        married: [
          "[love]Ogni mattina mi sveglio e penso: “Ho sposato la persona più testarda del mondo”. Poi sorrido.",
          "[shy]Porto l'anello anche in battaglia. Se si graffia, lo lucido. Se si rompe, ne forgio uno nuovo.",
          "[happy]Il clan della Fiamma Rossa ha di nuovo una casa. Grazie a te, {P}.",
          "[love]Ti amo. ...L'ho detto. Non chiedermelo di nuovo. Va bene, chiedimelo di nuovo.",
        ],
        gift: {
          love: ["[shy]D-dolci?! Non è che mi piacciano i dolci! ...Li mangio solo per non sprecarli. Tutti. Subito.", "[love]Come facevi a saperlo?! Nessuno doveva conoscere i miei... gusti. Grazie, {P}."],
          like: ["[happy]Hmph. Non è male. Lo terrò. Con cura.", "[smug]Hai buon occhio. Per essere te, intendo."],
          ok: ["[shy]Un regalo? Per me? ...Va bene, lo accetto. Ma solo per educazione.", "[shy]Non dovevi. Davvero. ...Però grazie."],
        },
        poke: ["[angry]Ehi! Giù le mani dalle corna!", "[shy]C-cosa c'è? Perché mi fissi così?", "[smug]Vuoi un duello? Ti avverto, non mi trattengo."],
        battle: "[smug]Finalmente! Stammi dietro, {P}, e guarda come si combatte!",
        proposal: ["[surprised]Un... un anello? Per me? Aspetta, aspetta, ho le mani sporche di fuliggine!", "[shy]Tra gli Oni, chi dona un anello deve prima battere in duello la famiglia della sposa. Ma ormai... la mia famiglia sei tu.", "[love]Sì. Sì, testa di gelatina! Mille volte sì!"],
        vow: "[love]Io, Aurelia della Fiamma Rossa, giuro sulla mia lama e sulle mie corna: nessuno ti torcerà un capello finché avrò respiro. E ogni sera ti preparerò onigiri storti. Per sempre.",
        spouseReact: ["[angry]Un altro matrimonio?! ...Va bene, {N} ha il fuoco negli occhi. Ma il primo duello del mattino resta mio!", "[smug]Benvenuta in famiglia, {N}. Regola numero uno: la colazione la cucino io."],
      },
      dates: {
        lago: {
          intro: ["n:La luna si specchia sul lago d'argento. Aurelia cammina un passo avanti, la mano sull'elsa.", "[shy]Non è un appuntamento. È una... ricognizione notturna. Il lago potrebbe nascondere nemici.", "[sad]...Però è bello. Quando ero prigioniera sognavo un posto così."],
          ask: "[shy]Tu... a cosa pensi quando guardi la luna?",
          choices: [
            { t: 'A quanto sei bella sotto la sua luce.', g: 3, r: "[shy]C-cosa?! Smettila subito! ...Ripetilo. No! Non ripeterlo!" },
            { t: 'A tutte le battaglie che vinceremo insieme.', g: 2, r: "[happy]Ecco una risposta degna di un guerriero! Te lo mostrerò io, quante ne vinceremo." },
            { t: 'Che ho fame.', g: 1, r: "[angry]...Hai rovinato il momento. Tieni, ho un onigiri. Mangialo e taci." },
          ],
        },
        taverna: {
          intro: ["n:La taverna “Il Goblin Allegro” è piena di risate e profumo di stufato.", "[smug]Ho ordinato la porzione del campione. Tre piatti. Non guardarmi così.", "[happy]Il cuoco è un goblin a cui hai dato un nome. Dice che ti deve la vita. Non è il solo a pensarlo... intendo il cuoco! Solo il cuoco!"],
          ask: "[shy]Allora... tu cosa ordini?",
          choices: [
            { t: 'Lo stesso piatto tuo. Sfida a chi finisce prima!', g: 3, r: "[happy]Ah! Ti distruggerò! ...Hai del sugo sul naso. No, lascia, faccio io." },
            { t: 'Qualcosa di leggero. E ti offro il dolce.', g: 2, r: "[shy]I-il dolce? Beh, se insisti... Lo prendo solo per non essere scortese!" },
            { t: "Ordino io per te: un'insalatina.", g: 0, r: "[angry]Un'insa... Io sono un'ONI! Gli Oni non mangiano foglie! Cameriere, altri tre piatti!" },
          ],
        },
        alba: {
          intro: ["n:L'alba tinge di rosa il campo d'addestramento. Aurelia è già lì, la spada fiammeggiante in pugno.", "[smug]In orario. Sorprendente. Pensavo dormissi ancora.", "[happy]Oggi ti insegno la Danza della Fiamma Rossa. Pochi l'hanno vista e sono vissuti per raccontarla."],
          ask: "[smug]Allora? Attacchi tu o attacco io?",
          choices: [
            { t: 'Insegnami. Voglio proteggerti anch’io.', g: 3, r: "[shy]Proteggere... me? Nessuno me l'ha mai detto. ...Va bene. Metti il piede qui. Più vicino. Ancora." },
            { t: 'Attacco io! Preparati!', g: 2, r: "[happy]Così mi piace! ...A terra in tre secondi. Ma hai spirito. In piedi, si ricomincia!" },
            { t: 'Possiamo fare colazione prima?', g: 1, r: "[angry]Colazione?! ...Ho portato del pane dolce. Ma te lo guadagni dopo cento affondi!" },
          ],
        },
        lanterne: {
          intro: ["n:Mille lanterne salgono verso il cielo. Il festival riempie la Nazione di musica e luce.", "[shy]Ho indossato lo yukata di mia madre. Non dire niente. Se ridi, ti affetto.", "[love]Si dice che chi lancia una lanterna insieme a qualcuno resterà legato a quella persona per sempre."],
          ask: "[shy]Vuoi... lanciarla con me?",
          choices: [
            { t: 'Solo se ci scriviamo sopra i nostri nomi.', g: 3, r: "[love]...Aurelia e {P}. Ecco. Ora vola, lanterna. E non tornare indietro." },
            { t: 'Sei bellissima con lo yukata.', g: 2, r: "[shy]T-ti avevo detto di non dire niente! ...Ma grazie. Lo rimetterò." },
            { t: 'Le leggende sono solo leggende.', g: 0, r: "[sad]Già... solo leggende. Allora la lancio da sola. ...No, aspetta. Tienila anche tu. Per sicurezza." },
          ],
        },
      },
    },
    {
      id: 'nerissa', name: 'Nerissa', race: 'Naga', title: 'Voce delle Maree Profonde', short: 'Voce delle Maree',
      color: '#2ee6d6', unlock: { boss: 'abyss_serpent' },
      spouseBonus: { stat: 'regen', value: 2, label: '+2 HP/s rigenerazione' },
      likes: ['conchiglia', 'carillon', 'fiori'],
      combat: { kind: 'waterSpear', range: 150, cd: 0.95 },
      bio: "Principessa naga di un regno sommerso ormai perduto. La Serpe Nera degli Abissi le aveva rubato la voce e l'aveva rinchiusa nelle caverne più buie. Gentile e malinconica, canta al tramonto per chi non ha potuto salvare. Da quando ci sei tu, però, le sue canzoni hanno cominciato a parlare di speranza.",
      lines: {
        meet: ["[sad]La mia voce... è tornata. Pensavo che non avrei mai più potuto cantare.", "[happy]Se me lo permetti, vorrei cantare per la tua Nazione. E per te, {P}."],
        t0: [
          "[sad]Il mare mi chiama ogni notte... ma laggiù non c'è più nessuno ad aspettarmi.",
          "Grazie per avermi salvata, {P}. Non so ancora come ripagarti.",
          "[shy]Scusa, stavo cantando... ti ho dato fastidio?",
          "Le conchiglie custodiscono le voci di chi le ha tenute. Ascolta... senti il mare?",
          "[sad]A volte sogno il palazzo di corallo. Poi mi sveglio, e c'è solo silenzio.",
          "[happy]Il villaggio è così pieno di vita... è strano, ma bello.",
        ],
        t1: [
          "[happy]Ho scritto una canzone nuova. Parla di una creatura che illumina le caverne buie... ti ricorda qualcuno?",
          "[shy]Riconosco il suono dei tuoi passi quando passi vicino al pozzo. Mi piace.",
          "[happy]Ho insegnato ai piccoli goblin a nuotare. Hanno paura dell'acqua, ma ridono tantissimo.",
          "[happy]Oggi il cielo ha lo stesso colore del mare dove sono nata. È un buon presagio.",
          "[shy]Ho intrecciato un braccialetto di alghe lucenti. È per te... se lo vuoi.",
          "La tristezza non se ne va mai del tutto, sai? Ma con te diventa più leggera.",
        ],
        t2: [
          "[love]Le mie canzoni ora parlano solo di te. Spero non ti dispiaccia, {P}.",
          "[shy]Tra i naga, chi canta per qualcuno ogni sera... gli sta dicendo che lo ama.",
          "[love]Non ho più nostalgia del mare. Il mio mare, adesso, sei tu.",
          "[happy]Quando ti sono vicina sento il tuo cuore battere forte. Anche il mio.",
          "[love]Se un giorno dovessi tornare negli abissi, verrei a cercarti. In ogni oceano.",
          "[shy]Mi tieni stretta un momento? Solo un momento... ancora un momento.",
        ],
        married: [
          "[love]Ogni sera canto la nostra canzone. Anche le onde si fermano ad ascoltarla.",
          "[happy]Il regno sommerso è perduto, ma ho trovato una nuova casa. Una famiglia.",
          "[shy]Mi piace guardarti mentre dormi... no, non è strano! Le naga lo fanno. Credo.",
          "[love]Il mio cuore ti appartiene come la marea appartiene alla luna.",
        ],
        gift: {
          love: ["[love]Una conchiglia che canta... sento la voce del mio mare. {P}, è il dono più bello che abbia mai ricevuto.", "[happy]Oh! Mi ricorda casa... grazie. Lo custodirò per sempre."],
          like: ["[happy]È bellissimo... grazie, davvero.", "[shy]Per me? Sei così gentile..."],
          ok: ["Grazie, {P}. Lo apprezzo tanto.", "[shy]Non dovevi... ma mi fa piacere."],
        },
        poke: ["[surprised]Oh! Mi hai fatto sobbalzare...", "[shy]Le mie pinne si muovono da sole quando sono emozionata...", "[happy]Vuoi che canti qualcosa?"],
        battle: "[happy]Le maree combatteranno con noi. Andiamo, {P}!",
        proposal: ["[surprised]Questo anello... brilla come la superficie del mare al tramonto.", "[sad]Un tempo ho perso tutto. Avevo paura di amare di nuovo.", "[love]Ma con te non ho più paura. Sì, {P}. Voglio restare al tuo fianco per sempre."],
        vow: "[love]Io, Nerissa delle Maree Profonde, ti dono la mia voce e il mio cuore. Finché il mare bacerà la riva, canterò per te. Ogni giorno. Ogni notte.",
        spouseReact: ["[happy]Che bello, {N}! Comporrò una canzone solo per te. Benvenuta nella nostra famiglia.", "[shy]Un altro matrimonio... la nostra tavola diventa sempre più grande. Mi piace tanto."],
      },
      dates: {
        lago: {
          intro: ["n:Il lago di luna è immobile. Nerissa immerge la coda nell'acqua e sospira, felice.", "[happy]L'acqua dolce è diversa dal mare... ma qui mi sento a casa lo stesso.", "[shy]Vuoi sentire una canzone? L'ho scritta io."],
          ask: "[shy]Allora... ti è piaciuta?",
          choices: [
            { t: 'Era meravigliosa. Cantala ancora, ti prego.', g: 3, r: "[love]Allora la canterò ogni notte. Solo per te." },
            { t: 'Mi hai fatto venire i brividi.', g: 2, r: "[happy]Davvero? È il complimento più bello per una cantante!" },
            { t: 'Zzz... eh? Scusa, la tua voce rilassa troppo!', g: 1, r: "[happy]Oh! Allora era una ninna nanna perfetta. Aspetta, ti copro con il mio scialle." },
          ],
        },
        taverna: {
          intro: ["n:Nella taverna, Nerissa siede composta e osserva ogni cosa con occhi curiosi.", "[surprised]Le persone di terra mangiano cose così strane... cos'è questa cosa che fuma?", "[shy]Non sono mai stata a cena con qualcuno. Non così, almeno."],
          ask: "[shy]Cosa mi consigli?",
          choices: [
            { t: 'Dividiamo una torta ai frutti di bosco.', g: 3, r: "[love]Dividere il cibo... tra i naga è un gesto da innamorati. Lo sapevi?" },
            { t: 'Ordina tutto quello che vuoi, offro io.', g: 2, r: "[happy]Tutto? Allora voglio assaggiare ogni dolce del menù!" },
            { t: 'La zuppa di pesce è ottima!', g: 0, r: "[sad]Pesce? Alcuni pesci erano miei amici... Prendo l'insalata, grazie." },
          ],
        },
        alba: {
          intro: ["n:Sulla riva del fiume, all'alba, Nerissa fa danzare l'acqua con le mani.", "[happy]La magia delle maree risponde alle emozioni. Se sono felice, l'acqua canta.", "[shy]Stamattina canta molto forte... chissà perché."],
          ask: "Vuoi provare anche tu a muovere l'acqua?",
          choices: [
            { t: 'Guidami tu le mani.', g: 3, r: "[shy]Le tue mani sono calde. Ecco, così. Senti? L'acqua si muove per tutti e due." },
            { t: 'Preferisco guardare te.', g: 2, r: "[shy]Guardare... me? Allora danzerò. Ma non distogliere lo sguardo." },
            { t: 'Scommetto che ci riesco al primo colpo!', g: 1, r: "[happy]Oh! L'acqua ti è finita tutta in faccia! Ahahah... scusa, non riesco a smettere di ridere!" },
          ],
        },
        lanterne: {
          intro: ["n:Le lanterne si riflettono sul fiume come stelle cadute.", "[sad]Nel mio regno, durante questa festa, ricordavamo chi era stato portato via dal mare.", "[happy]Quest'anno, però, voglio ricordare anche chi mi ha restituito la vita."],
          ask: "[shy]Accenderai una lanterna con me?",
          choices: [
            { t: 'Una per il tuo regno, e una per il nostro futuro.', g: 3, r: "[love]Il nostro futuro... {P}, mi hai fatta piangere. Lacrime felici, stavolta." },
            { t: 'Certo. Ti terrò la mano mentre la lasciamo andare.', g: 2, r: "[shy]La tua mano non trema. La mia sì... ma solo un po'." },
            { t: 'Facciamo una gara a chi la lancia più in alto!', g: 1, r: "[happy]Una gara con le lanterne sacre? ...La mia è salita più in alto, comunque. Ho vinto io." },
          ],
        },
      },
    },
    {
      id: 'kiara', name: 'Kiara', race: 'Kitsune', title: 'Volpe delle Nove Code', short: 'Nove Code',
      color: '#ff9a3c', unlock: { boss: 'alpha_wolf' },
      spouseBonus: { stat: 'speed', value: 0.12, label: '+12% velocità, +20% fortuna', extra: [{ stat: 'luck', value: 0.2 }] },
      likes: ['tofu', 'dolci', 'carillon'],
      combat: { kind: 'foxFire', range: 130, cd: 1.05 },
      bio: "Kitsune millenaria (o almeno così dice) che il Lupo Alfa teneva sigillata nel Santuario della Luna Cremisi. Furba, dispettosa e incredibilmente golosa di tofu fritto, adora fare scherzi a tutti, soprattutto a te. Dietro le risate, però, nasconde un cuore che non ha mai smesso di cercare qualcuno da cui tornare.",
      lines: {
        meet: ["[smug]Ohhh, chi ha spezzato il mio sigillo? Ah, sei tu! Che tenerezza!", "[happy]Ho deciso: mi trasferisco nella tua Nazione. Non accetto un no come risposta! Kon kon~"],
        t0: [
          "[smug]Kon kon~ Ti ho rubato il cuscino. Se lo rivuoi, prendimi!",
          "[happy]Lo sapevi che ho nove code? Puoi accarezzarne una. Solo una! ...Forse due.",
          "[smug]Ho trasformato il cartello del villaggio in una carota. Nessuno se n'è accorto. Ehehe.",
          "Mille anni chiusa in un santuario... sai quanto ci si annoia? Ora voglio divertirmi!",
          "[surprised]Hai del tofu fritto? No? Allora cosa ci fai qui? ...Scherzo! Più o meno.",
          "[smug]Ti seguo da tre giorni travestita da gatto. Non hai notato niente, vero?",
        ],
        t1: [
          "[happy]Ho preparato uno scherzo per il capo delle guardie. Mi aiuti? Se ci scopre, scappiamo insieme!",
          "[shy]Le mie orecchie si muovono da sole quando mi stai accanto... non guardarle!",
          "[happy]Ti ho lasciato un regalo sotto il letto! ...È una rana. Una rana portafortuna!",
          "[smug]Se mi dai un po' del tuo tempo, ti racconto una storia vera. Su una volpe e una luna.",
          "[sad]Quando tutti dormono, a volte mi sento sola. Poi penso a te, e passa.",
          "[happy]Ho imparato a fare illusioni a forma di cuore! Guarda! ...Ops, è venuto un fagiolo.",
        ],
        t2: [
          "[love]Mille anni di scherzi, e il più bello me l'ha fatto il destino: farmi incontrare te.",
          "[shy]Per le kitsune, mostrare tutte e nove le code è come dire “ti amo”. Guarda bene.",
          "[love]Non ho più voglia di fare scherzi. Beh, quasi. Voglio solo stare con te.",
          "[smug]Ho detto a tutto il villaggio che siamo fidanzati. Ah, non lo eravamo? Ora sì! Kon~",
          "[love]Le volpi sono furbe, ma con te sono diventata una sciocchina innamorata.",
          "[shy]Se ti stringo con le code non puoi scappare. È una trappola. Una trappola d'amore.",
        ],
        married: [
          "[love]Tesoro mio, tutto mio! ...Ok, ti condivido. Ma le coccole del mattino sono mie!",
          "[happy]Ho messo un'illusione sulla nostra casa: da fuori sembra un enorme tofu fritto. Bellissima, vero?",
          "[smug]Ogni mille anni una kitsune si sposa. Mi è andata benissimo, ehehe.",
          "[love]Kon kon~ Sono la tua volpe. Per sempre. Niente scherzi su questo.",
        ],
        gift: {
          love: ["[love]TOFU FRITTO DORATO?! Ti sposerei anche subito! ...L'ho detto ad alta voce? Kon~", "[happy]Lo sapevi! Sapevi che è il mio preferito! Gnam gnam~ Sei un tesoro!"],
          like: ["[happy]Uuuh, che bello! Lo nascondo nella mia tana segreta!", "[smug]Un regalo per me? Ti sto proprio conquistando, eh?"],
          ok: ["[happy]Grazie! Non è tofu, ma va bene lo stesso~", "[smug]Mmh... lo trasformerò in qualcosa di più divertente. Grazie!"],
        },
        poke: ["[smug]Ehehe, mi hai toccato la coda! Ora mi devi un tofu!", "[happy]Kon? Kon kon~!", "[surprised]Ehi! Lo scherzo lo faccio io, non tu!"],
        battle: "[happy]Che bello, un'avventura! Le mie fiamme di volpe sono pronte, kon~!",
        proposal: ["[surprised]Aspetta, aspetta... è uno scherzo? Perché se è uno scherzo è il più crudele della storia!", "[shy]Non è uno scherzo... le mie code tremano tutte e nove...", "[love]Sì! Sì sì sì! Kon kon kon~! Lo urlerò a tutta la Nazione!"],
        vow: "[love]Io, Kiara delle Nove Code, giuro di farti ridere ogni giorno, di rubarti il cuscino ogni notte e di amarti per altri mille anni. È una promessa di volpe: non si può infrangere.",
        spouseReact: ["[smug]Ooh, {N}! Benvenuta! Regola della casa: le code si accarezzano a turno. Prima io!", "[happy]Più siamo, più ci divertiamo! Preparo uno scherzo di benvenuto per {N}... uno gentile, giuro!"],
      },
      dates: {
        lago: {
          intro: ["n:Sul lago di luna, Kiara corre a pelo d'acqua saltando da una ninfea all'altra.", "[smug]Scommetto che non riesci a prendermi! Le volpi sono troppo veloci!", "[surprised]Ah... aspetta... la ninfea si muove... AH!"],
          ask: "n:Kiara perde l'equilibrio e sta per cadere nel lago!",
          choices: [
            { t: 'La afferri al volo.', g: 3, r: "[shy]...M-mi hai presa. Ehm. Puoi anche mettermi giù. ...O no. Va bene anche così." },
            { t: 'Ti tuffi con lei!', g: 2, r: "[happy]Ahahah! Che splash! Ora abbiamo i capelli pieni d'alghe! È l'appuntamento più bello di sempre!" },
            { t: 'Ridi e la guardi cadere.', g: 0, r: "[angry]SPLASH! ...Tu. Ridi. Di me. Questa me la paghi, kon!" },
          ],
        },
        taverna: {
          intro: ["n:Alla taverna, Kiara ha trasformato tutti i bicchieri in piccoli fiori.", "[smug]Cosa? Era un po' noioso. Così è più carino!", "[happy]Oh! Hanno il tofu fritto! Il cuoco è un genio!"],
          ask: "[happy]Mi fai assaggiare quello che hai ordinato?",
          choices: [
            { t: 'Ti imbocco io. Apri la bocca!', g: 3, r: "[shy]Aaam... è buonissimo. Ma non dire a nessuno che mi hai imboccata, eh!" },
            { t: 'Tieni, prendi tutto il piatto.', g: 2, r: "[happy]Davvero?! Sei un tesoro! Ti lascio un pezzetto. Uno piccolo." },
            { t: 'Neanche per sogno, è mio!', g: 1, r: "[smug]Ah sì? Allora... illusione! Ora il tuo piatto è vuoto e io ho la bocca piena. Kon~" },
          ],
        },
        alba: {
          intro: ["n:All'alba, nel bosco, Kiara medita su una roccia. Le nove code ondeggiano come fiamme.", "Shhh. Sto ascoltando la foresta. Ogni mattina mi racconta una storia diversa.", "[happy]Oggi dice che qualcuno di speciale è venuto a trovarmi."],
          ask: "[shy]Vuoi sederti con me?",
          choices: [
            { t: 'Mi siedo accanto a te e ascolto.', g: 3, r: "[love]...Senti? La foresta dice che stiamo bene insieme. La foresta non mente mai." },
            { t: 'Posso accarezzarti le code?', g: 2, r: "[shy]S-solo una! ...Va bene, tre. Ma piano, che soffro il solletico!" },
            { t: 'Meditare è noioso, andiamo a fare scherzi!', g: 1, r: "[smug]È la proposta più saggia che abbia mai sentito! Andiamo!" },
          ],
        },
        lanterne: {
          intro: ["n:Il festival delle lanterne brilla. Kiara indossa una maschera da volpe e un kimono arancione.", "[happy]È la mia festa preferita! Dolci, giochi e tanta gente da spaventare!", "[shy]Ma stasera... non voglio fare scherzi. Voglio solo camminare con te."],
          ask: "[shy]Mi tieni la mano? Così non mi perdo tra la folla...",
          choices: [
            { t: 'Te la tengo per tutta la notte.', g: 3, r: "[love]Tutta la notte... allora spero che il festival non finisca mai." },
            { t: 'Ti ho vinto questo pupazzo volpe al tiro a segno!', g: 2, r: "[happy]Una volpe di pezza! Si chiamerà Mini-Kiara. Dormirà vicino a me. Cioè, vicino a noi! Cioè... kon!" },
            { t: 'Tu ti perdi apposta per farmi preoccupare.', g: 1, r: "[smug]Ehehe, scoperta! Ma ti preoccupi per me, quindi ha funzionato~" },
          ],
        },
      },
    },
    {
      id: 'morgana', name: 'Morgana', race: 'Vampira', title: 'Regina della Notte Eterna', short: 'Regina della Notte',
      color: '#e0244f', unlock: { boss: 'demon_lord' },
      spouseBonus: { stat: 'lifesteal', value: 0.05, label: '+5% rubavita' },
      likes: ['melagrana', 'pendente', 'fiori'],
      combat: { kind: 'bloodBats', range: 135, cd: 1.15 },
      bio: "Sovrana di un antico regno della notte, imprigionata per secoli nella Cittadella dal Re Demone Caduto. Elegante, ironica e terribilmente sicura di sé, ama stuzzicarti con complimenti sfacciati solo per vederti arrossire. Ma chi conquista la sua fiducia scopre una regina capace di una lealtà eterna. Beve solo succo di melagrana.",
      lines: {
        meet: ["[smug]Mi hai liberata dalla Cittadella... che galanteria. Raramente qualcuno riesce a sorprendermi.", "[happy]Accetto il tuo invito, {P}. Una regina ha bisogno di un regno, e il tuo mi sembra... promettente."],
        t0: [
          "[smug]Oh, sei tu. Avvicinati pure, non mordo. Quasi mai.",
          "Il sangue? Che volgarità. Io bevo solo succo di melagrana, in calici di cristallo.",
          "[smug]Hai un'aura interessante, {P}. Rozza, ma interessante.",
          "[sad]Per secoli ho fissato lo stesso soffitto di pietra. Ora guardo le stelle. Si sta meglio.",
          "[happy]Il tuo villaggio è... grazioso. Gli mancano solo un castello e una regina.",
          "[smug]Arrossisci facilmente, vero? Che delizia.",
        ],
        t1: [
          "[happy]Ho fatto piantare un giardino di rose nere dietro la piazza. Passeggiaci con me, qualche volta.",
          "[smug]Ti guardavo combattere dalla torre. Elegante come un orso in pantofole. Adorabile.",
          "[shy]Nessuno mi porta il tè senza volere qualcosa in cambio. Tu sì. Perché?",
          "Una regina non dovrebbe affezionarsi ai sudditi. Ma tu non sei un suddito qualunque, vero?",
          "[happy]I miei pipistrelli ti adorano. Hanno buon gusto. L'hanno preso da me.",
          "[sad]Ho visto cadere tre imperi. Ho paura di veder cadere anche questo. Proteggilo, d'accordo?",
        ],
        t2: [
          "[love]Ho vissuto mille notti. Nessuna era luminosa come quelle passate con te.",
          "[shy]Mi hai fatta arrossire. IO. Arrossire. Non lo dirai a nessuno, vero?",
          "[love]Il mio cuore ha smesso di battere secoli fa. Da quando ti conosco, ha ricominciato.",
          "[smug]Ti ho scelto come mio consorte. Ah, non te l'avevo detto? Beh, ora lo sai.",
          "[love]Resta con me fino all'alba. Poi resta anche dopo.",
          "[shy]Ballare con me sotto la luna è un privilegio che concedo a una sola persona. Indovina chi.",
        ],
        married: [
          "[love]Mia eterna metà. Il regno della notte e la tua Nazione, finalmente uniti.",
          "[smug]Ho fatto incidere i nostri nomi sul trono. Sì, abbiamo un trono adesso. Due, anzi.",
          "[happy]Ogni sera ti verso un calice di melagrana. È il nostro piccolo rito, amore mio.",
          "[love]L'eternità non mi fa più paura. Ora ho qualcuno con cui condividerla.",
        ],
        gift: {
          love: ["[love]Succo di melagrana cremisi, dell'annata migliore... {P}, mi conosci fin troppo bene.", "[happy]Splendido. Il colore, il profumo... e il pensiero. Soprattutto il pensiero."],
          like: ["[smug]Hai buon gusto. Comincio a pensare che tu sia alla mia altezza.", "[happy]Mh. Lo terrò nella mia collezione privata. Al posto d'onore."],
          ok: ["[smug]Un pensiero gentile. Che tenerezza.", "Grazie. Le regine ricevono molti doni, ma i tuoi sono... sinceri."],
        },
        poke: ["[smug]Toccare una regina senza permesso? Che audacia. Mi piace.", "[shy]...Fallo di nuovo e potrei arrossire. Non farlo.", "[happy]Hai bisogno di attenzioni? Eccole."],
        battle: "[smug]Una danza di guerra? Accetto. Prova a starmi dietro, tesoro.",
        proposal: ["[surprised]Un anello... per me? Ho ricevuto corone, tesori, regni interi... ma mai un anello offerto con questo sguardo.", "[shy]Sto... tremando? Una regina della notte non trema.", "[love]Sì, {P}. Accetto. Che le stelle ne siano testimoni: da stanotte, la mia eternità è tua."],
        vow: "[love]Io, Morgana, Regina della Notte Eterna, rinuncio alla solitudine dei secoli. Ti giuro la mia lealtà, il mio regno e ogni notte che verrà. E prometto di non smettere mai di farti arrossire.",
        spouseReact: ["[smug]{N}, cara, benvenuta a corte. Tranquilla: il trono è abbastanza grande per tutte.", "[happy]Un altro matrimonio? Meraviglioso. Organizzerò il ballo di benvenuto per {N}. Abito da sera obbligatorio."],
      },
      dates: {
        lago: {
          intro: ["n:Il lago di luna riflette la sagoma elegante di Morgana, che passeggia con un ombrellino di pizzo nero.", "[happy]La luna piena. La mia vecchia amica. Ci conosciamo da quasi un millennio.", "[smug]Stasera, però, ti presento a lei. Comportati bene."],
          ask: "[smug]Dimmi, {P}... cosa vedi nel riflesso dell'acqua?",
          choices: [
            { t: 'Vedo una regina che non è più sola.', g: 3, r: "[shy]Sai essere pericolosamente dolce, lo sai? ...Hai ragione. Non lo sono più." },
            { t: 'Vedo la luna, e qualcosa di ancora più bello.', g: 2, r: "[smug]Banale. Prevedibile. ...Ripetilo, per favore." },
            { t: 'Vedo che tu non hai riflesso!', g: 1, r: "[angry]Sciocchezze, è solo una leggenda! Guarda, eccolo lì. ...Ok, è un po' sbiadito." },
          ],
        },
        taverna: {
          intro: ["n:Morgana entra nella taverna e cala il silenzio. Poi ordina un calice di melagrana.", "[smug]Locale rustico. Tavoli appiccicosi. Musica stonata. Adoro.", "[happy]Da regina cenavo da sola in una sala da cento posti. Questo tavolino è molto meglio."],
          ask: "[smug]Allora, intrattienimi. Raccontami qualcosa di te.",
          choices: [
            { t: 'Ti racconto della mia vita prima di rinascere in questo mondo.', g: 3, r: "[surprised]Un altro mondo? Affascinante... Continua. Non mi stancherò mai di ascoltarti." },
            { t: 'Preferisco ascoltare le tue storie.', g: 2, r: "[happy]Saggio. Ho mille anni di pettegolezzi reali. Cominciamo dal re che aveva paura delle galline..." },
            { t: 'Sfidiamoci a braccio di ferro!', g: 1, r: "[smug]Ho vinto. Ovviamente. Ma hai resistito tre secondi. Un record." },
          ],
        },
        alba: {
          intro: ["n:All'alba Morgana si ripara sotto un pergolato di glicine, avvolta in un mantello.", "[angry]L'alba. Il mio nemico naturale. Mi hai portata qui apposta, vero?", "[smug]Pazienza. Per te sopporto anche un po' di sole. Solo un po'."],
          ask: "[shy]Perché volevi vedere l'alba con me?",
          choices: [
            { t: 'Voglio condividere con te ogni momento, anche quelli difficili.', g: 3, r: "[love]...Allora guardiamola insieme. È la prima alba che vedo in tre secoli. È bellissima." },
            { t: 'Ti ho portato un ombrellone gigante!', g: 2, r: "[happy]Un ombrellone di pizzo nero... con i pipistrelli ricamati. Sono commossa. Davvero." },
            { t: 'Per vedere se brilli al sole.', g: 0, r: "[angry]Io non BRILLO. Non sono quel tipo di vampira. Hmph." },
          ],
        },
        lanterne: {
          intro: ["n:Il festival è al culmine. Morgana indossa un abito da sera cremisi e una tiara di rubini.", "[smug]Tutti mi guardano. Naturale. Ma io guardo una persona sola.", "[happy]C'è un valzer laggiù, vicino alla fontana. Una regina non balla con chiunque..."],
          ask: "[shy]...Mi concedi questo ballo?",
          choices: [
            { t: 'Con onore, mia regina.', g: 3, r: "[love]Mia regina... dillo ancora mentre balliamo. E non pestarmi i piedi." },
            { t: 'Non so ballare, ma per te ci provo.', g: 2, r: "[happy]Ti guido io. Un, due, tre... vedi? Ti serviva solo la dama giusta." },
            { t: 'Preferisco mangiare lo zucchero filato.', g: 1, r: "[smug]Zucchero filato al posto del valzer? Scandaloso. ...Dammene un pezzo." },
          ],
        },
      },
    },
    {
      id: 'lyra', name: 'Lyra', race: 'Elfa', title: "Freccia del Vento d'Argento", short: "Freccia d'Argento",
      color: '#9ccc65', unlock: { souls: 150 },
      spouseBonus: { stat: 'amount', value: 1, label: '+1 proiettile' },
      likes: ['piuma', 'dolci', 'te'],
      combat: { kind: 'arrows', range: 180, cd: 0.58 },
      bio: "Giovane arciera elfa partita dalla Foresta d'Argento per diventare la più grande avventuriera del mondo. Solare, chiacchierona e sempre di corsa, centra una ghianda a trecento passi ma inciampa regolarmente nei propri piedi. Si è unita alla tua Nazione “per una settimana”... ed è ancora qui.",
      lines: {
        meet: ["[happy]Ciao ciao! Sono Lyra: arciera, avventuriera, futura leggenda! Ho sentito che la tua Nazione cerca gente in gamba!", "[smug]Beh, eccomi qua! Resto solo una settimana. Forse due. Vedremo!"],
        t0: [
          "[happy]Buongiorno! Ho già fatto il giro del villaggio di corsa. Sette volte!",
          "Sai che riesco a colpire una ghianda a trecento passi? Ieri ho colpito il cappello del sindaco. Per sbaglio.",
          "[happy]La tua Nazione è fantastica! C'è il fiume, il bosco, il mercato... e ci sei tu!",
          "[surprised]Hai visto il mio arco? Era qui un attimo fa. ...Ah, ce l'ho in mano. Ehehe.",
          "[smug]Un giorno scriveranno ballate su di me! “Lyra e la Freccia del Destino”. Suona bene, no?",
          "[shy]Scusa se parlo tanto. Quando sono emozionata non riesco a fermarmi. E sono sempre emozionata!",
        ],
        t1: [
          "[happy]Ti ho fatto un portafortuna con le piume di grifone! Ok, sono piume di gallina. Ma colorate!",
          "[shy]Mi alleno tutti i giorni, così posso coprirti le spalle in battaglia. Solo le tue!",
          "[happy]Gara di corsa fino al mulino? Chi perde offre i biscotti!",
          "[sad]A volte mi manca la Foresta d'Argento. Poi ti vedo, e non ricordo più perché.",
          "[smug]Ho inciso il tuo nome sulle mie frecce migliori. Così ogni centro è anche un po' tuo!",
          "[happy]Lo sapevi che gli elfi vivono secoli? Ho un sacco di tempo per conoscerti meglio!",
        ],
        t2: [
          "[love]La settimana è diventata un anno. E non voglio andare via. Mai più.",
          "[shy]Quando ti vedo, il mio cuore fa come una freccia: zing! Dritto al bersaglio!",
          "[love]Ho viaggiato ovunque cercando l'avventura più grande. Era qui. Eri tu.",
          "[happy]Ho deciso: la ballata non si chiamerà “Lyra e la Freccia del Destino”. Si chiamerà “Lyra e {P}”!",
          "[shy]Per una volta sono io quella senza parole... strano, vero?",
          "[love]Quando mi sorridi inciampo. Più del solito, intendo. È colpa tua!",
        ],
        married: [
          "[love]Ogni mattina mi sveglio e penso: “È tutto vero!”. Poi faccio sette giri di corsa per la gioia!",
          "[happy]Ho appeso l'arco al muro di casa nostra. Casa nostra! Che bello dirlo!",
          "[shy]Gli elfi restano sposati per secoli. Ti avviso: avrai Lyra per un bel po'!",
          "[love]Sei la mia avventura più bella. E durerà per sempre.",
        ],
        gift: {
          love: ["[surprised]Una piuma di fenice?! Ma è leggendaria! Le mie frecce voleranno fino alla luna! {P}, sei incredibile!", "[love]La terrò per sempre, sempre, SEMPRE! Grazie grazie grazie!"],
          like: ["[happy]Che bello! Lo porto in ogni avventura!", "[happy]Per me? Eheh, mi fai sentire speciale!"],
          ok: ["[happy]Grazie mille! Sei così gentile!", "[smug]Ooh, un regalo! Lo aggiungo alla mia collezione di tesori!"],
        },
        poke: ["[happy]Eh? Gara di corsa? Ci sto!", "[surprised]Wah! Per poco non scoccavo una freccia!", "[shy]Ehehe... mi fai il solletico alle orecchie!"],
        battle: "[happy]Si va all'avventura! Arco pronto, frecce pronte, Lyra prontissima!",
        proposal: ["[surprised]Questo... è un anello? Un ANELLO? Per ME?!", "[shy]Aspetta, devo sedermi. No, devo correre. No, devo... non lo so!", "[love]Sì! Sì! Mille volte sì! È la freccia più bella che mi abbia mai colpita!"],
        vow: "[love]Io, Lyra della Foresta d'Argento, giuro di correre sempre al tuo fianco, di non sbagliare mai un colpo quando si tratta di proteggerti e di amarti per tutti i secoli che un'elfa può vivere. E anche un po' di più!",
        spouseReact: ["[happy]Evviva! {N} entra in famiglia! Faremo una festa enorme! Posso organizzare io la gara di tiro?", "[surprised]Un altro matrimonio?! Che bello! Più famiglia vuol dire più gente da sfidare a corsa!"],
      },
      dates: {
        lago: {
          intro: ["n:Al lago di luna, Lyra fa rimbalzare sassi piatti sull'acqua. Undici rimbalzi.", "[happy]Undici! Record personale! Hai visto? Hai visto?!", "[shy]Volevo mostrarti una cosa speciale stanotte. Guarda le lucciole... formano costellazioni!"],
          ask: "[happy]Proviamo a contare quante sono?",
          choices: [
            { t: "Contiamole insieme, con la testa sull'erba.", g: 3, r: "[love]...Ho perso il conto a quaranta. Stavo guardando te invece delle lucciole." },
            { t: 'Sfida: chi lancia il sasso più lontano!', g: 2, r: "[happy]Sfida accettata! ...Hai vinto tu?! Rivincita! Rivincita subito!" },
            { t: 'Sono troppe, rinuncio.', g: 1, r: "[smug]Arrendersi? Mai! Uno, due, tre... Ok, rinuncio anch'io. Ehehe." },
          ],
        },
        taverna: {
          intro: ["n:Lyra divora la terza porzione di torta di mele della serata.", "[happy]La torta di mele della taverna è la cosa più buona del mondo! Dopo i biscotti. E i pancake.", "[surprised]Oh! Ho la panna sul naso? Dove? Qui? Qui?"],
          ask: "[shy]Mi aiuti a toglierla?",
          choices: [
            { t: 'Gliela togli delicatamente con un dito.', g: 3, r: "[shy]...Grazie. Il mio cuore sta facendo zing. Molto zing." },
            { t: 'Le dici che sta benissimo così.', g: 2, r: "[happy]Allora la tengo! Nuova moda elfica: la panna sul naso!" },
            { t: 'Ti metti la panna sul naso anche tu.', g: 1, r: "[happy]Ahahah! Ora siamo uguali! Facciamoci fare un ritratto, così lo ricordiamo per sempre!" },
          ],
        },
        alba: {
          intro: ["n:All'alba il campo di tiro è coperto di rugiada. Lyra ha già scoccato cento frecce.", "[happy]Buongiorno! Oggi ti insegno a tirare con l'arco! Vedrai, è facilissimo!", "[smug]Primo: piedi larghi. Secondo: respira. Terzo: centro perfetto! ...Oh, è più difficile spiegarlo che farlo."],
          ask: "[happy]Ti sistemo la postura, va bene?",
          choices: [
            { t: 'Certo, maestra Lyra!', g: 3, r: "[love]Maestra Lyra! Che bel suono! ...Ecco, braccio più su. Perfetto! Hai talento, lo sapevo!" },
            { t: 'Facciamo un tiro in coppia: io tendo, tu miri.', g: 2, r: "[happy]Gioco di squadra! ...CENTRO! Insieme siamo imbattibili!" },
            { t: 'Tiro a occhi chiusi!', g: 1, r: "[surprised]La freccia è finita nel pagliaio! E il pagliaio... brilla? No, era il sole. Phew!" },
          ],
        },
        lanterne: {
          intro: ["n:Il festival delle lanterne. Lyra indossa un vestito verde e ha dei fiori tra i capelli.", "[shy]Mi hanno costretta a mettere un vestito... è difficile correre con questo!", "[happy]Ma guarda le lanterne! Sembrano frecce di luce che volano verso le stelle!"],
          ask: "[shy]Esprimi un desiderio con me?",
          choices: [
            { t: 'Desidero che tu resti nella mia Nazione per sempre.', g: 3, r: "[love]Ma... è lo stesso desiderio che ho espresso io! Allora si avvererà due volte!" },
            { t: 'È un segreto, sennò non si avvera.', g: 2, r: "[smug]Uffa! Va bene... ma se è quello che spero, tienilo stretto." },
            { t: 'Desidero altra torta di mele.', g: 1, r: "[happy]Ahah! Anch'io! Ok, il secondo desiderio però è serio. Promesso." },
          ],
        },
      },
    },
    {
      id: 'selene', name: 'Selene', race: 'Elfa Oscura', title: 'Custode delle Rune Stellari', short: 'Rune Stellari',
      color: '#b388ff', unlock: { souls: 250 },
      spouseBonus: { stat: 'cdr', value: 0.1, label: '−10% ricarica, +20 MP', extra: [{ stat: 'maxMp', value: 20 }] },
      likes: ['libro', 'te', 'carillon'],
      combat: { kind: 'starBolt', range: 160, cd: 1.15 },
      bio: "Maga elfa oscura esiliata dalla Città Sotterranea per aver letto i libri proibiti (tutti, in ordine alfabetico). Fredda, precisa e di poche parole, analizza ogni cosa, compresi i sentimenti, che trova “statisticamente inspiegabili”. Studia le rune stellari che brillano sulla sua pelle e, da qualche tempo, anche te.",
      lines: {
        meet: ["Selene, maga delle rune. Ho analizzato la tua Nazione: 87% di probabilità che sia adatta ai miei studi.", "[shy]Il restante 13%... dipende da te, {P}. Accetto il tuo invito."],
        t0: [
          "Sto leggendo. Se è importante, parla. Se non lo è... parla comunque, ma piano.",
          "Le rune sulla mia pelle si illuminano quando uso la magia. No, non fanno male. Sì, puoi guardarle.",
          "[smug]Ho catalogato tutti i libri della Nazione. Sono quattordici. Due sono ricettari.",
          "La tua capacità di assorbire le abilità altrui è affascinante. Dal punto di vista accademico.",
          "[sad]Nella Città Sotterranea non c'erano stelle. Qui le osservo ogni notte.",
          "Statisticamente, la tua presenza aumenta la mia frequenza cardiaca del 12%. Probabilmente è un errore di misura.",
        ],
        t1: [
          "[shy]Ho scritto una ricerca su di te. Duecento pagine. È... scientifica. Solo scientifica.",
          "[happy]Ho scoperto una nuova runa. L'ho chiamata come te. Per comodità di catalogazione.",
          "Ti ho preparato una tisana. Temperatura ideale calcolata: 78 gradi. Bevila adesso.",
          "[shy]Non sono brava con le parole che non stanno nei libri. Ma mi piace parlare con te.",
          "[smug]Avevo previsto la tua visita di oggi. Avevo ragione. Ho sempre ragione.",
          "[sad]Mi hanno esiliata per curiosità. Tu, invece, la incoraggi. Grazie.",
        ],
        t2: [
          "[love]Ho cercato in ogni libro la definizione di ciò che provo. L'unica risposta esatta è il tuo nome.",
          "[shy]La frequenza cardiaca è salita del 300%. Non è un errore di misura. Lo so da un po'.",
          "[love]Le mie rune brillano più forte quando mi stai vicino. Ho verificato. Settantadue volte.",
          "[happy]Ho smesso di leggere a cena. Preferisco guardare te. È un cambiamento statisticamente significativo.",
          "[shy]Tienimi la mano. ...È per un esperimento. Ok, non è per un esperimento.",
          "[love]In mille libri non ho mai letto una storia bella come la nostra.",
        ],
        married: [
          "[love]Ho aggiunto un capitolo alla mia ricerca: “Matrimonio: effetti collaterali positivi”. È lunghissimo.",
          "[happy]Ho calcolato la probabilità che fossimo felici insieme. 100%. Ho ricontrollato tre volte.",
          "[shy]Mi piace leggere con la testa sulla tua spalla. È la posizione di lettura ottimale.",
          "[love]Le stelle sono infinite. Il mio amore per te è un'ipotesi più grande. E dimostrata.",
        ],
        gift: {
          love: ["[surprised]Un tomo antico... con le annotazioni originali a margine. {P}, tu... tu mi capisci davvero.", "[love]Lo leggerò stanotte. Poi lo rileggerò. Poi lo leggerò a te, ad alta voce."],
          like: ["[happy]Una scelta logica e apprezzata. Grazie.", "[shy]Hai pensato a me. Questo ha un valore che non so quantificare."],
          ok: ["Grazie. Lo catalogherò con cura.", "[smug]Interessante. Non è un libro, ma lo accetto."],
        },
        poke: ["Contatto fisico registrato. Motivo?", "[shy]...Le mie rune si sono accese. Smettila. No, continua. Per la ricerca.", "[smug]Stai cercando di distrarmi dalla lettura? Funziona. Al 40%."],
        battle: "Analisi del campo completata. Rune cariche. Procediamo, {P}.",
        proposal: ["[surprised]Un anello di magicule... la struttura cristallina è perfetta. Aspetta. È... per me?", "[shy]Ho previsto molte cose nella vita. Questa no. È la prima volta che non so cosa dire.", "[love]Sì. Risposta definitiva, verificata, irrevocabile. Sì, {P}."],
        vow: "[love]Io, Selene delle Rune Stellari, che ho letto ogni libro proibito, giuro che nessuna pagina varrà quanto un giorno al tuo fianco. Ti amerò con la precisione delle stelle e con la follia che nessun libro sa spiegare.",
        spouseReact: ["[happy]Ho aggiornato l'albero genealogico della Nazione. Benvenuta, {N}. Ti ho già riservato uno scaffale.", "[smug]Statisticamente, ogni nuova sposa aumenta la felicità della casa del 23%. Benvenuta, {N}."],
      },
      dates: {
        lago: {
          intro: ["n:Sulla riva del lago di luna, Selene ha montato un telescopio d'ottone.", "Stasera è visibile la Costellazione della Gelatina Celeste. Rarissima. Ogni centoventi anni.", "[shy]Volevo... vederla con qualcuno. Con te, nello specifico."],
          ask: "[shy]Guarda nel telescopio. Cosa vedi?",
          choices: [
            { t: 'Vedo le stelle... ma le tue rune brillano di più.', g: 3, r: "[shy]Le mie rune... stanno brillando? Stanno brillando. Ignora questo dato. Anzi, no. Ricordalo." },
            { t: 'Una gelatina gigante nel cielo! Che carina!', g: 2, r: "[happy]Esatto. Le stelle formano una creatura che sorride. Ho sempre pensato che ti somigliasse." },
            { t: 'Non vedo niente, c’è il tappo.', g: 1, r: "[smug]...Hai ragione. Rimuovo il tappo. Questo episodio non comparirà nella mia ricerca." },
          ],
        },
        taverna: {
          intro: ["n:Alla taverna, Selene legge il menù come se fosse un trattato di alchimia.", "Il piatto del giorno contiene undici ingredienti. Tre non sono identificabili. Affascinante.", "[shy]Non sono mai uscita a cena con qualcuno. Ho letto un libro sull'argomento. Capitolo uno: “Fare conversazione”."],
          ask: "[shy]...Di cosa si parla, a cena?",
          choices: [
            { t: 'Dimmi qual è il tuo libro preferito.', g: 3, r: "[happy]Il preferito? Ne ho trecento. Ma stasera... il preferito è quello che sto scrivendo su di noi." },
            { t: 'Di niente. Godiamoci il silenzio insieme.', g: 2, r: "[love]Il silenzio con te non è vuoto. È... pieno. Non sapevo fosse possibile." },
            { t: 'Di quanto è buffo leggere un libro su come si cena!', g: 1, r: "[angry]Era un libro molto serio. ...Ok, era un po' buffo. Ma ha funzionato, no?" },
          ],
        },
        alba: {
          intro: ["n:All'alba, nel cerchio di pietre, le rune di Selene fluttuano nell'aria come lucciole.", "La magia è più stabile all'alba. Le linee di energia si allineano.", "[shy]Oggi ti insegno un incantesimo. Uno semplice. Uno... che ho creato io."],
          ask: "Ripeti la formula dopo di me e unisci la tua mana alla mia.",
          choices: [
            { t: 'Le prendi le mani e chiudi gli occhi.', g: 3, r: "[love]...Ha funzionato. Guarda: un fiore di luce. L'incantesimo si chiama “Legame”. L'ho inventato pensando a te." },
            { t: 'Ci metti tutta la tua energia!', g: 2, r: "[surprised]Troppa mana! Abbiamo creato... una tempesta di petali. Tecnicamente è un fallimento. Ma è bellissimo." },
            { t: 'Sbagli la formula apposta per farla ridere.', g: 1, r: "[smug]Hai trasformato un sasso in una rana. ...Pfff. Non stavo ridendo. Era una reazione allergica." },
          ],
        },
        lanterne: {
          intro: ["n:Al festival, Selene osserva le lanterne con un taccuino in mano.", "Calcolo traiettorie. Vento da nord-est. La tua lanterna e la mia voleranno vicine per circa 2,3 chilometri.", "[shy]...Non è vero. L'ho inventato. Volevo solo una scusa per lanciarne una con te."],
          ask: "[shy]Allora... la lanciamo?",
          choices: [
            { t: 'Facciamo in modo che volino vicine per sempre.', g: 3, r: "[love]Le ho legate con un filo di magia. Ora voleranno insieme, oltre ogni calcolo." },
            { t: 'Hai inventato una scusa? Proprio tu?!', g: 2, r: "[shy]Anche le menti razionali hanno le loro debolezze. La mia... sei tu." },
            { t: "Scrivo una formula sulla lanterna!", g: 1, r: "[happy]La formula dell'amore? Non esiste. ...Ma questa ci si avvicina molto." },
          ],
        },
      },
    },
  ];
  const BY_ID = {};
  for (const c of COMPANIONS) BY_ID[c.id] = c;

  const WEDDING_INTRO = [
    "n:Sotto un arco di fiori di luna, tutta la Nazione si è riunita. Persino i goblin si sono lavati la faccia.",
    "n:{C} avanza lungo il sentiero di petali, splendida nel suo abito nuziale.",
  ];
  const PLAYER_VOW = "p:Io, {P}, prometto di proteggerti, di farti sorridere ogni giorno e di camminare al tuo fianco in ogni mondo e in ogni vita.";
  const WEDDING_SEAL = "n:Gli anelli vengono scambiati. Un bacio sulla mano sigilla la promessa, tra gli applausi di tutti!";

  /* ============================================================ glow cache */
  const glowCache = new Map();
  function glowSpr(color) {
    let c = glowCache.get(color);
    if (c) return c;
    if (SK.FX && typeof SK.FX.glowSprite === 'function') {
      try { c = SK.FX.glowSprite(color, 64); } catch (e) { c = null; }
    }
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      rg.addColorStop(0, U.rgba(color, 1));
      rg.addColorStop(0.25, U.rgba(color, 0.55));
      rg.addColorStop(0.6, U.rgba(color, 0.14));
      rg.addColorStop(1, U.rgba(color, 0));
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
    }
    glowCache.set(color, c);
    return c;
  }
  function glowAt(ctx, x, y, r, color, a) {
    if (!(a > 0.003) || !(r > 0)) return;
    const spr = glowSpr(color);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
    ctx.globalCompositeOperation = op;
  }

  /* ========================================================= draw helpers */
  function ell(ctx, x, y, rx, ry, rot, fill) {
    ctx.beginPath();
    ctx.ellipse(x, y, max(0.01, rx), max(0.01, ry), rot || 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
    ctx.closePath();
  }
  function star4(ctx, x, y, r, color, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha *= a;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
    ctx.globalAlpha /= a;
  }
  function blinkAmt(t, ph) {
    const period = 3.4 + (ph % 1) * 1.6;
    const l = (t + ph * 7.3) % period;
    if (l < 0.13) return sin((l / 0.13) * PI);
    if (ph % 0.5 < 0.2 && l > 0.32 && l < 0.45) return sin(((l - 0.32) / 0.13) * PI); // occasional double blink
    return 0;
  }
  function vgrad(ctx, y0, y1, a, b, c) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, a);
    if (c) { g.addColorStop(0.55, b); g.addColorStop(1, c); } else g.addColorStop(1, b);
    return g;
  }

  /* ======================================================= portrait styles */
  const STY = {
    aurelia: {
      ph: 0.13, skin: '#ffe2d2', skinSh: '#f0b49c', hair: '#d81f3c', hairDk: '#78102a', hairLt: '#ff8a65',
      eye: '#ffb300', eyeDk: '#a83c00', eyeLt: '#ffe082', pupil: '#3a0d00', lash: '#4a0d18', brow: '#8a1426',
      outfit: '#3a1520', outfit2: '#9b1c30', trim: '#ffcf5a', lip: '#c94a5d', aura: '#ff5a3c',
      back: 'spiky', bangs: 'spiky', ears: 'none', fang: true, blush: '#ff5c7a',
    },
    nerissa: {
      ph: 0.57, skin: '#eaf4ff', skinSh: '#bcd3ec', hair: '#22c3b4', hairDk: '#0b5f6a', hairLt: '#a7fff2',
      eye: '#29b6f6', eyeDk: '#0d3c8c', eyeLt: '#b3ecff', pupil: '#06224a', lash: '#0b3a48', brow: '#11707a',
      outfit: '#e9fbff', outfit2: '#1f9e93', trim: '#b2fff4', lip: '#e07a96', aura: '#36d8ff',
      back: 'wavy', bangs: 'soft', ears: 'fin', blush: '#ff7aa2',
    },
    kiara: {
      ph: 0.29, skin: '#ffe8d6', skinSh: '#f2bf9f', hair: '#ff9636', hairDk: '#a9480f', hairLt: '#ffe0a0',
      eye: '#ffb000', eyeDk: '#b33600', eyeLt: '#fff1a8', pupil: '#3d1200', lash: '#5a1d05', brow: '#a9480f',
      outfit: '#c62828', outfit2: '#fff3e6', trim: '#ffd54f', lip: '#d65a5a', aura: '#ff9a3c',
      back: 'fluffy', bangs: 'side', ears: 'fox', fang: true, blush: '#ff6f7f',
    },
    morgana: {
      ph: 0.81, skin: '#f7eef3', skinSh: '#d8c3d2', hair: '#2b1a3d', hairDk: '#100818', hairLt: '#8a64b8',
      eye: '#ff1744', eyeDk: '#6d0012', eyeLt: '#ff8a9c', pupil: '#2a0008', lash: '#120610', brow: '#2b1a3d',
      outfit: '#151019', outfit2: '#8b0f2a', trim: '#c8cbe0', lip: '#b0123c', aura: '#d0103e',
      back: 'long', bangs: 'hime', ears: 'pointy', fang: true, blush: '#ff5c86',
    },
    lyra: {
      ph: 0.44, skin: '#ffe9da', skinSh: '#f0c2a6', hair: '#ffd54f', hairDk: '#b98400', hairLt: '#fffbd0',
      eye: '#43a047', eyeDk: '#14502a', eyeLt: '#c5f5a0', pupil: '#062610', lash: '#5a3c05', brow: '#b07a00',
      outfit: '#2e7d32', outfit2: '#7b4f2c', trim: '#c5e1a5', lip: '#e0707a', aura: '#a5e05a',
      back: 'ponytail', bangs: 'soft', ears: 'elf', freckles: true, blush: '#ff7f8a',
    },
    selene: {
      ph: 0.71, skin: '#7d5b6f', skinSh: '#5a3e51', hair: '#e4e7f7', hairDk: '#8e94c4', hairLt: '#ffffff',
      eye: '#c39bff', eyeDk: '#4b1aa0', eyeLt: '#efe0ff', pupil: '#1c0640', lash: '#1e1028', brow: '#c9cdea',
      outfit: '#1f1840', outfit2: '#3b2f7a', trim: '#c5cae9', lip: '#c56a8c', aura: '#9f7bff',
      back: 'straight', bangs: 'blunt', ears: 'elf', glasses: true, runes: '#7df9ff', blush: '#ff6fae',
    },
  };

  /* ---------------------------------------------------------- back layers */
  function backFx(id, S, ctx, t, mood, ex) {
    const q = !lowQ();
    if (id === 'aurelia') {
      if (q) for (let i = 0; i < 7; i++) {
        const p = (t * 0.22 + i * 0.143) % 1;
        const x = -40 + ((i * 37) % 80) + sin(t * 2 + i) * 4, y = 46 - p * 90;
        ctx.globalAlpha = (1 - p) * 0.8;
        ell(ctx, x, y, 1.3, 1.3, 0, i % 2 ? '#ffb74d' : '#ff5a3c');
      }
      ctx.globalAlpha = 1;
    } else if (id === 'nerissa') {
      for (let i = 0; i < (q ? 9 : 4); i++) {
        const p = (t * 0.16 + i * 0.111) % 1;
        const x = -44 + ((i * 29) % 88) + sin(t * 1.6 + i * 2) * 3, y = 50 - p * 100;
        ctx.globalAlpha = 0.55 * sin(p * PI);
        ctx.strokeStyle = '#b3f5ff'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'kiara') {
      // nine tails, five visible in a fan behind the shoulders
      const n = 7;
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1);
        const a = -PI + 0.35 + k * (PI - 0.7) + sin(t * 1.4 + i * 0.9) * 0.07;
        const L = 58 + (i % 2) * 6;
        const bx = 0, by = 40;
        const tx = bx + cos(a) * L, ty = by + sin(a) * L;
        const nx = -sin(a), ny = cos(a);
        ctx.beginPath();
        ctx.moveTo(bx - nx * 4, by - ny * 4);
        ctx.quadraticCurveTo(bx + cos(a) * L * 0.5 - nx * 15, by + sin(a) * L * 0.5 - ny * 15, tx, ty);
        ctx.quadraticCurveTo(bx + cos(a) * L * 0.5 + nx * 15, by + sin(a) * L * 0.5 + ny * 15, bx + nx * 4, by + ny * 4);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? S.hair : U.mix(S.hair, S.hairDk, 0.25);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(bx + cos(a) * L * 0.86, by + sin(a) * L * 0.86, 8, 5.5, a, 0, TAU);
        ctx.fillStyle = '#fff7ee'; ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        const a = t * 0.9 + i * TAU / 3;
        const x = cos(a) * 42, y = -8 + sin(a) * 18;
        glowAt(ctx, x, y, 11, '#ff9a3c', 0.55);
        ell(ctx, x, y, 2.4, 3.2, 0, '#fff3d6');
      }
    } else if (id === 'morgana') {
      // high cape collar
      ctx.beginPath();
      ctx.moveTo(-40, 52); ctx.lineTo(-38, 26); ctx.quadraticCurveTo(-46, -6, -36, -26);
      ctx.quadraticCurveTo(-24, -4, -16, 24); ctx.lineTo(16, 24);
      ctx.quadraticCurveTo(24, -4, 36, -26); ctx.quadraticCurveTo(46, -6, 38, 26); ctx.lineTo(40, 52); ctx.closePath();
      ctx.fillStyle = '#0d0910'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-36, 22); ctx.quadraticCurveTo(-41, -4, -34, -20); ctx.quadraticCurveTo(-25, -2, -19, 22); ctx.closePath();
      ctx.moveTo(36, 22); ctx.quadraticCurveTo(41, -4, 34, -20); ctx.quadraticCurveTo(25, -2, 19, 22); ctx.closePath();
      ctx.fillStyle = S.outfit2; ctx.fill();
      if (!lowQ()) for (let i = 0; i < 3; i++) {
        const a = t * 0.7 + i * 2.1;
        const x = cos(a) * 46, y = -30 + sin(a * 1.3) * 10;
        const f = sin(t * 14 + i) * 2.4;
        ctx.fillStyle = 'rgba(30,8,24,0.8)';
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 4, y - 3 - f, x - 8, y - 1);
        ctx.quadraticCurveTo(x - 4, y + 1, x, y + 2); ctx.quadraticCurveTo(x + 4, y + 1, x + 8, y - 1);
        ctx.quadraticCurveTo(x + 4, y - 3 - f, x, y); ctx.fill();
      }
    } else if (id === 'lyra') {
      // quiver behind right shoulder
      ctx.save();
      ctx.translate(30, 22); ctx.rotate(0.45);
      ctx.fillStyle = '#6d4426'; ctx.fillRect(-5, -24, 10, 34);
      ctx.fillStyle = '#c5e1a5';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-3 + i * 3, -24); ctx.lineTo(-5 + i * 3, -33); ctx.lineTo(-1 + i * 3, -33); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // ponytail
      const sw = sin(t * 1.7) * 4;
      ctx.beginPath();
      ctx.moveTo(10, -36);
      ctx.bezierCurveTo(40, -40, 44 + sw, 0, 34 + sw, 34);
      ctx.bezierCurveTo(30 + sw, 14, 26, -12, 8, -24);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -40, 34, S.hair, S.hairDk);
      ctx.fill();
      ctx.strokeStyle = U.rgba(S.hairLt, 0.6); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(20, -32); ctx.quadraticCurveTo(36, -18, 34 + sw, 14); ctx.stroke();
    } else if (id === 'selene') {
      ctx.save();
      ctx.translate(0, -10);
      ctx.rotate(t * 0.25);
      const a = 0.35 + 0.15 * sin(t * 2);
      ctx.strokeStyle = U.rgba(S.runes, a); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 41, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const an = i * TAU / 12;
        const x = cos(an) * 43.5, y = sin(an) * 43.5;
        ctx.save(); ctx.translate(x, y); ctx.rotate(an);
        ctx.beginPath();
        if (i % 3 === 0) { ctx.moveTo(-2, -2); ctx.lineTo(2, 2); ctx.moveTo(2, -2); ctx.lineTo(-2, 2); }
        else if (i % 3 === 1) { ctx.moveTo(0, -2.5); ctx.lineTo(0, 2.5); ctx.moveTo(-1.5, 0); ctx.lineTo(1.5, 0); }
        else { ctx.arc(0, 0, 1.5, 0, TAU); }
        ctx.stroke(); ctx.restore();
      }
      ctx.restore();
      glowAt(ctx, 0, -10, 55, S.runes, 0.12 + 0.05 * sin(t * 2));
    }
    if (ex.veil) {
      ctx.beginPath();
      ctx.moveTo(-26, -36); ctx.bezierCurveTo(-52, -10, -54, 30, -50, 56); ctx.lineTo(50, 56);
      ctx.bezierCurveTo(54, 30, 52, -10, 26, -36); ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  /* ------------------------------------------------------------ back hair */
  function backHair(S, ctx, t) {
    const sw = sin(t * 1.3 + S.ph * 9) * 1.6;
    ctx.beginPath();
    if (S.back === 'spiky') {
      ctx.moveTo(-28, -14);
      ctx.bezierCurveTo(-38, 4, -42, 28, -40 + sw, 52);
      const pts = [-30, 44, -22, 56, -12, 46, -2, 57, 8, 46, 18, 56, 28, 45, 40 + sw, 52];
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.bezierCurveTo(42, 28, 38, 4, 28, -14);
    } else if (S.back === 'wavy') {
      ctx.moveTo(-28, -14);
      ctx.bezierCurveTo(-40 + sw, 0, -34 - sw, 20, -42 + sw, 38);
      ctx.quadraticCurveTo(-46, 52, -34, 56);
      for (let i = 0; i < 6; i++) { const x0 = -34 + i * 11.3; ctx.quadraticCurveTo(x0 + 5.6, 62 + (i % 2) * 2, x0 + 11.3, 56); }
      ctx.quadraticCurveTo(46, 52, 42 - sw, 38);
      ctx.bezierCurveTo(34 + sw, 20, 40 - sw, 0, 28, -14);
    } else if (S.back === 'fluffy') {
      ctx.moveTo(-28, -14);
      ctx.bezierCurveTo(-44, 0, -46, 18, -38, 30);
      ctx.lineTo(-30, 26); ctx.lineTo(-26, 36); ctx.lineTo(-18, 28); ctx.lineTo(18, 28); ctx.lineTo(26, 36); ctx.lineTo(30, 26); ctx.lineTo(38, 30);
      ctx.bezierCurveTo(46, 18, 44, 0, 28, -14);
    } else if (S.back === 'ponytail') {
      ctx.moveTo(-28, -14);
      ctx.bezierCurveTo(-34, 0, -32, 10, -28, 16); ctx.lineTo(28, 16);
      ctx.bezierCurveTo(32, 10, 34, 0, 28, -14);
    } else if (S.back === 'straight') {
      ctx.moveTo(-28, -14); ctx.lineTo(-35, 56); ctx.lineTo(35, 56); ctx.lineTo(28, -14);
    } else {
      ctx.moveTo(-28, -14);
      ctx.bezierCurveTo(-38, 6, -42, 30, -40 + sw, 56); ctx.lineTo(40 - sw, 56);
      ctx.bezierCurveTo(42, 30, 38, 6, 28, -14);
    }
    ctx.bezierCurveTo(30, -48, -30, -48, -28, -14);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, -46, 56, S.hair, S.hairDk);
    ctx.fill();
    // strand lines
    ctx.strokeStyle = U.rgba(S.hairDk, 0.45); ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-30, 0); ctx.quadraticCurveTo(-34, 24, -32 + sw, 46);
    ctx.moveTo(30, 0); ctx.quadraticCurveTo(34, 24, 32 - sw, 46);
    ctx.stroke();
  }

  /* --------------------------------------------------------------- body */
  function drawBody(id, S, ctx, t, ex) {
    // neck
    ctx.fillStyle = S.skinSh;
    ctx.fillRect(-6.5, 12, 13, 22);
    ell(ctx, 0, 21, 8, 4, 0, U.rgba('#000000', 0.12));
    // shoulders
    ctx.beginPath();
    ctx.moveTo(-48, 58);
    ctx.bezierCurveTo(-46, 40, -32, 32, -13, 30);
    ctx.lineTo(13, 30);
    ctx.bezierCurveTo(32, 32, 46, 40, 48, 58);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 28, 58, U.mix(S.outfit, '#ffffff', 0.12), S.outfit);
    ctx.fill();
    if (id === 'aurelia') {
      ctx.beginPath(); ctx.moveTo(-9, 30); ctx.lineTo(0, 40); ctx.lineTo(9, 30); ctx.closePath(); ctx.fillStyle = S.skinSh; ctx.fill();
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-14, 30); ctx.lineTo(0, 45); ctx.lineTo(14, 30); ctx.stroke();
      for (const sd of [-1, 1]) {
        ell(ctx, sd * 34, 40, 14, 9, sd * 0.35, S.outfit2);
        ctx.strokeStyle = S.trim; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(sd * 34, 40, 14, 9, sd * 0.35, PI * 1.05, PI * 1.95); ctx.stroke();
        ell(ctx, sd * 34, 38, 2, 2, 0, S.trim);
      }
    } else if (id === 'nerissa') {
      ctx.fillStyle = S.outfit2;
      ctx.beginPath(); ctx.moveTo(-48, 58); ctx.bezierCurveTo(-46, 42, -36, 36, -24, 33); ctx.lineTo(-18, 58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(48, 58); ctx.bezierCurveTo(46, 42, 36, 36, 24, 33); ctx.lineTo(18, 58); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = U.rgba(S.trim, 0.7); ctx.lineWidth = 0.9;
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sd * (30 + i * 4), 42 + (i % 2) * 5, 3, PI, TAU); ctx.stroke();
      }
      for (let i = 0; i <= 8; i++) {
        const a = PI * 0.15 + (i / 8) * PI * 0.7;
        ell(ctx, cos(a) * 14, 26 + sin(a) * 12, 1.7, 1.7, 0, '#ffffff');
      }
      ell(ctx, 0, 38.5, 2.6, 2.6, 0, '#ffc1e3');
    } else if (id === 'kiara') {
      ctx.fillStyle = S.outfit2;
      ctx.beginPath(); ctx.moveTo(-14, 30); ctx.lineTo(-7, 30); ctx.lineTo(10, 58); ctx.lineTo(2, 58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(14, 30); ctx.lineTo(7, 30); ctx.lineTo(-4, 47); ctx.lineTo(-8, 41); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-7, 30); ctx.lineTo(10, 58); ctx.moveTo(7, 30); ctx.lineTo(-6, 50); ctx.stroke();
      ctx.fillStyle = S.trim;
      ctx.fillRect(-48, 53, 96, 3);
      ell(ctx, 22, 50, 2.6, 2.6, 0, S.trim);
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(22, 52); ctx.quadraticCurveTo(24 + sin(t * 2) * 1.5, 56, 22, 60); ctx.stroke();
    } else if (id === 'morgana') {
      ctx.beginPath(); ctx.moveTo(-12, 30); ctx.lineTo(0, 50); ctx.lineTo(12, 30); ctx.closePath(); ctx.fillStyle = S.outfit2; ctx.fill();
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-15, 30); ctx.lineTo(0, 52); ctx.lineTo(15, 30); ctx.stroke();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.moveTo(0, 33); ctx.lineTo(4, 38); ctx.lineTo(0, 44); ctx.lineTo(-4, 38); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = S.trim; ctx.lineWidth = 0.9; ctx.stroke();
      glowAt(ctx, 0, 38, 9, '#ff1744', 0.35 + 0.2 * sin(t * 3));
      star4(ctx, 2, 35, 2.4, '#ffffff', clamp01(sin(t * 1.7) * 3 - 2));
    } else if (id === 'lyra') {
      ctx.beginPath(); ctx.moveTo(-10, 30); ctx.quadraticCurveTo(0, 38, 10, 30); ctx.lineTo(8, 34); ctx.quadraticCurveTo(0, 41, -8, 34); ctx.closePath();
      ctx.fillStyle = S.trim; ctx.fill();
      ctx.strokeStyle = S.outfit2; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-30, 33); ctx.lineTo(26, 58); ctx.stroke();
      ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-30, 31); ctx.lineTo(26, 56); ctx.stroke();
      ell(ctx, -12, 41, 3, 3, 0, '#d9b36b');
      ctx.fillStyle = '#8bc34a';
      ctx.beginPath(); ctx.ellipse(-30, 40, 5, 2.4, -0.6, 0, TAU); ctx.fill();
    } else if (id === 'selene') {
      ctx.fillStyle = U.mix(S.outfit, '#000000', 0.35);
      ctx.beginPath(); ctx.moveTo(-46, 50); ctx.bezierCurveTo(-40, 36, -26, 30, -14, 30); ctx.lineTo(-18, 36); ctx.bezierCurveTo(-28, 38, -38, 44, -42, 54); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(46, 50); ctx.bezierCurveTo(40, 36, 26, 30, 14, 30); ctx.lineTo(18, 36); ctx.bezierCurveTo(28, 38, 38, 44, 42, 54); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-13, 30); ctx.quadraticCurveTo(0, 40, 13, 30); ctx.stroke();
      ctx.fillStyle = S.outfit2; ctx.fillRect(-5, 40, 10, 8);
      ctx.strokeStyle = S.trim; ctx.lineWidth = 0.8; ctx.strokeRect(-5, 40, 10, 8);
      const ra = 0.5 + 0.4 * sin(t * 2.4);
      for (let i = 0; i < 5; i++) { ell(ctx, -36 + i * 18, 52 - (i % 2) * 3, 1, 1, 0, U.rgba(S.runes, ra)); }
      glowAt(ctx, 0, 44, 10, S.runes, ra * 0.4);
    }
  }

  /* ------------------------------------------------------------------ ears */
  function drawEars(S, ctx, t) {
    if (S.ears === 'elf' || S.ears === 'pointy') {
      const L = S.ears === 'elf' ? 1 : 0.55;
      const tw = sin(t * 0.9 + S.ph * 5) > 0.97 ? 2 : 0;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 22, -6);
        ctx.quadraticCurveTo(sd * (30 + 6 * L), -8 - 4 * L, sd * (34 + 10 * L), -14 - 10 * L - tw);
        ctx.quadraticCurveTo(sd * (30 + 4 * L), 2, sd * 22, 7);
        ctx.closePath();
        ctx.fillStyle = S.skin; ctx.fill();
        ctx.strokeStyle = S.skinSh; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sd * 24, -2); ctx.quadraticCurveTo(sd * (29 + 5 * L), -6 - 3 * L, sd * (31 + 8 * L), -11 - 8 * L); ctx.stroke();
      }
    } else if (S.ears === 'fin') {
      const f = sin(t * 2.2) * 2;
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 21, -10);
        ctx.quadraticCurveTo(sd * 34, -26 - f, sd * 42, -16 - f);
        ctx.quadraticCurveTo(sd * 37, -8, sd * 43, -2 + f * 0.5);
        ctx.quadraticCurveTo(sd * 36, 2, sd * 39, 10 + f);
        ctx.quadraticCurveTo(sd * 29, 8, sd * 21, 8);
        ctx.closePath();
        ctx.fillStyle = vgrad(ctx, -24, 12, U.rgba(S.hairLt, 0.95), U.rgba(S.hair, 0.85));
        ctx.fill();
        ctx.strokeStyle = U.rgba(S.hairDk, 0.75); ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(sd * 22, -2); ctx.lineTo(sd * 41, -16 - f);
        ctx.moveTo(sd * 22, 0); ctx.lineTo(sd * 42, -2 + f * 0.5);
        ctx.moveTo(sd * 22, 3); ctx.lineTo(sd * 38, 9 + f);
        ctx.stroke();
      }
    }
  }

  /* ------------------------------------------------------------------ face */
  function facePath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-24, -12);
    ctx.bezierCurveTo(-25, 6, -14, 19, 0, 23);
    ctx.bezierCurveTo(14, 19, 25, 6, 24, -12);
    ctx.bezierCurveTo(24, -36, -24, -36, -24, -12);
    ctx.closePath();
  }

  function drawEye(S, ctx, cx, cy, sd, blink, mood, t, lx, ly) {
    const rx = 7.3, ry = 9.4;
    let open = 1 - blink;
    if (mood === 'smug') open = min(open, 0.56);
    else if (mood === 'angry') open = min(open, 0.74);
    else if (mood === 'surprised') open = min(1.08, open * 1.08);
    if (open < 0.14) {
      ctx.strokeStyle = S.lash; ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (mood === 'happy') { ctx.moveTo(cx - rx, cy + 3); ctx.quadraticCurveTo(cx, cy - 5, cx + rx, cy + 3); }
      else { ctx.moveTo(cx - rx, cy + 1); ctx.quadraticCurveTo(cx, cy + 5, cx + rx, cy + 1); }
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + sd * rx, cy + 1); ctx.lineTo(cx + sd * (rx + 2.5), cy - 1.2); ctx.stroke();
      return;
    }
    ctx.save();
    ctx.translate(cx, cy + ry * (1 - open) * 0.55);
    ctx.scale(1, open);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save();
    ctx.clip();
    const ix = lx * 1.8, iy = ly * 1.4 + 1;
    ctx.beginPath(); ctx.ellipse(ix, iy, rx * 0.84, ry * 0.88, 0, 0, TAU);
    ctx.fillStyle = vgrad(ctx, -ry, ry, S.eyeDk, S.eye, S.eyeLt);
    ctx.fill();
    ctx.strokeStyle = U.rgba(S.eyeDk, 0.9); ctx.lineWidth = 0.9; ctx.stroke();
    const pr = mood === 'surprised' ? 0.5 : mood === 'love' ? 1.12 : 1;
    ell(ctx, ix, iy + 0.6, 2.9 * pr, 4.3 * pr, 0, S.pupil);
    ell(ctx, 0, -ry - 1, rx * 1.2, ry * 0.5, 0, 'rgba(0,0,0,0.16)');
    if (mood === 'love') {
      ctx.fillStyle = '#ffffff';
      heartPath(ctx, ix - 2.3, iy - 2.4, 3.1); ctx.fill();
      heartPath(ctx, ix + 2.6, iy + 3.6, 1.4); ctx.fill();
    } else {
      ell(ctx, ix - 2.5, iy - 3.5, 2.5, 2.8, -0.3, '#ffffff');
      ell(ctx, ix + 2.6, iy + 3.4, 1.2, 1.2, 0, 'rgba(255,255,255,0.85)');
    }
    ctx.restore();
    ctx.strokeStyle = S.lash; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, rx + 0.5, ry + 0.3, 0, PI * 1.06, PI * 1.94); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sd * rx * 0.92, -ry * 0.42); ctx.lineTo(sd * (rx + 2.8), -ry * 0.82); ctx.stroke();
    ctx.lineWidth = 0.8; ctx.globalAlpha *= 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - 0.3, ry, 0, PI * 0.25, PI * 0.75); ctx.stroke();
    ctx.restore();
  }

  function drawMouth(S, ctx, mood, t, talk) {
    const y = 15;
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = U.mix(S.lip, '#3a0a12', 0.35);
    if (talk) {
      const o = 0.3 + 0.7 * abs(sin(t * 15));
      ctx.beginPath(); ctx.ellipse(0, y + 0.5, 3.2, 1 + 2.6 * o, 0, 0, TAU);
      ctx.fillStyle = '#7a2233'; ctx.fill();
      if (o > 0.5) ell(ctx, 0, y + 1.6 * o, 1.8, 1 * o, 0, '#ff8fa3');
      return;
    }
    ctx.beginPath();
    switch (mood) {
      case 'happy':
      case 'love':
        ctx.moveTo(-4.6, y - 1.2);
        ctx.quadraticCurveTo(0, y - 0.6, 4.6, y - 1.2);
        ctx.quadraticCurveTo(0, y + (mood === 'love' ? 5 : 6.5), -4.6, y - 1.2);
        ctx.fillStyle = '#7a2233'; ctx.fill();
        ell(ctx, 0, y + 2.6, 2.2, 1.3, 0, '#ff8fa3');
        if (S.fang) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(1.6, y - 1); ctx.lineTo(3.4, y - 1); ctx.lineTo(2.5, y + 1.6); ctx.fill(); }
        return;
      case 'shy':
        ctx.moveTo(-3.4, y); ctx.quadraticCurveTo(-1.7, y - 1.4, 0, y); ctx.quadraticCurveTo(1.7, y + 1.4, 3.4, y);
        break;
      case 'angry':
        ctx.moveTo(-3.6, y + 1.4); ctx.quadraticCurveTo(0, y - 1.6, 3.6, y + 1.4);
        ctx.stroke();
        if (S.fang) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(1, y); ctx.lineTo(2.8, y + 0.6); ctx.lineTo(1.7, y + 2.6); ctx.fill(); }
        return;
      case 'sad':
        ctx.moveTo(-3, y + 1); ctx.quadraticCurveTo(0, y - 1.3, 3, y + 1);
        break;
      case 'surprised':
        ctx.ellipse(0, y + 0.6, 2.3, 3, 0, 0, TAU);
        ctx.fillStyle = '#7a2233'; ctx.fill();
        return;
      case 'smug':
        ctx.moveTo(-3.4, y + 0.4); ctx.quadraticCurveTo(1, y + 2.2, 4.6, y - 1.6);
        ctx.stroke();
        if (S.fang) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(1.4, y + 1.2); ctx.lineTo(3, y + 0.6); ctx.lineTo(2.4, y + 3); ctx.fill(); }
        return;
      default:
        ctx.moveTo(-3.2, y - 0.4); ctx.quadraticCurveTo(0, y + 2.2, 3.2, y - 0.4);
    }
    ctx.stroke();
  }

  const BROWS = {
    idle: [0, -1], happy: [-1.5, -1.8], love: [-1, -1.2], shy: [-1.8, 0.6], angry: [3, -2.2],
    sad: [-3.2, 1.2], surprised: [-3.4, -3.2], smug: [0.6, -2.2],
  };
  function drawBrows(S, ctx, mood) {
    const b = BROWS[mood] || BROWS.idle;
    ctx.strokeStyle = S.brow; ctx.lineWidth = 1.6; ctx.globalAlpha *= 0.9;
    for (const sd of [-1, 1]) {
      const inner = b[0] + (mood === 'smug' && sd > 0 ? -1.5 : 0);
      ctx.beginPath();
      ctx.moveTo(sd * 4.5, -10.5 + inner);
      ctx.quadraticCurveTo(sd * 9.5, -12.6 + (inner + b[1]) * 0.5, sd * 14.5, -10.8 + b[1]);
      ctx.stroke();
    }
    ctx.globalAlpha /= 0.9;
  }

  /* ----------------------------------------------------------- front hair */
  const BANGS = {
    spiky: { v: -15, tips: [[27, -6], [20, 9], [11, 1], [2, 11], [-8, 3], [-17, 10], [-27, -6]] },
    soft: { v: -9, tips: [[27, -4], [18, 5], [6, 0], [-4, 6], [-15, 1], [-27, -4]] },
    side: { v: -12, tips: [[27, -2], [22, 7], [12, -2], [1, 5], [-11, -5], [-21, 3], [-27, -4]] },
    hime: { v: -3, tips: [[27, -1], [13, -2], [0, -1.5], [-13, -2], [-27, -1]] },
    blunt: { v: -4, tips: [[27, 0], [14, -1], [0, 0.5], [-14, -1], [-27, 0]] },
  };
  function frontHair(S, ctx, t) {
    const B = BANGS[S.bangs] || BANGS.soft;
    const grad = vgrad(ctx, -46, 12, S.hairLt, S.hair, S.hairDk);
    // side locks
    const sw = sin(t * 1.5 + S.ph * 4) * 1.2;
    const long = S.bangs === 'hime' || S.bangs === 'blunt' ? 10 : 0;
    ctx.fillStyle = grad;
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 28, -14);
      ctx.quadraticCurveTo(sd * 31, 8, sd * (24 + sw * sd), 24 + long);
      ctx.quadraticCurveTo(sd * 22, 8, sd * 19, -6);
      ctx.closePath();
      ctx.fill();
    }
    // bangs cap
    ctx.beginPath();
    ctx.moveTo(-28, -6);
    ctx.bezierCurveTo(-33, -48, 33, -48, 28, -6);
    let px = B.tips[0][0];
    for (let i = 0; i < B.tips.length; i++) {
      const tx = B.tips[i][0], ty = B.tips[i][1];
      if (i === 0) { ctx.lineTo(tx, ty); px = tx; continue; }
      ctx.quadraticCurveTo((px + tx) * 0.5, B.v, tx, ty);
      px = tx;
    }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = U.rgba(S.hairDk, 0.35); ctx.lineWidth = 0.8;
    ctx.stroke();
    // highlight band
    ctx.strokeStyle = U.rgba(S.hairLt, 0.75); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.ellipse(0, -16, 21, 17, 0, PI * 1.16, PI * 1.42); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -16, 21, 17, 0, PI * 1.55, PI * 1.82); ctx.stroke();
    star4(ctx, -9, -31, 2.4, '#ffffff', 0.5 + 0.4 * sin(t * 2 + S.ph * 10));
  }

  /* ------------------------------------------------------- front features */
  function frontFx(id, S, ctx, t, mood, ex) {
    if (id === 'aurelia') {
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sd * 8, -33);
        ctx.quadraticCurveTo(sd * 10, -52, sd * 25, -61);
        ctx.quadraticCurveTo(sd * 20, -46, sd * 18, -31);
        ctx.closePath();
        ctx.fillStyle = vgrad(ctx, -61, -31, '#ff6e40', '#ffe0c8', '#fff7ef');
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,30,20,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sd * 9.5, -40); ctx.lineTo(sd * 18.5, -38); ctx.moveTo(sd * 11.5, -46); ctx.lineTo(sd * 19.5, -45); ctx.stroke();
      }
    } else if (id === 'kiara') {
      const tw = sin(t * 0.8) > 0.96 ? sin(t * 40) * 0.12 : 0;
      for (const sd of [-1, 1]) {
        ctx.save();
        ctx.translate(sd * 15, -34);
        ctx.rotate(sd * (0.18 + (sd > 0 ? tw : 0)));
        ctx.beginPath();
        ctx.moveTo(-sd * 10, 4); ctx.quadraticCurveTo(-sd * 2, -16, sd * 8, -28);
        ctx.quadraticCurveTo(sd * 13, -10, sd * 11, 6); ctx.closePath();
        ctx.fillStyle = vgrad(ctx, -28, 6, S.hairDk, S.hair); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-sd * 5, 3); ctx.quadraticCurveTo(sd * 1, -12, sd * 7, -20);
        ctx.quadraticCurveTo(sd * 9, -6, sd * 7, 4); ctx.closePath();
        ctx.fillStyle = '#fff1e6'; ctx.fill();
        ctx.restore();
      }
    } else if (id === 'morgana') {
      ctx.strokeStyle = S.trim; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(0, -24, 20, 9, 0, PI * 1.08, PI * 1.92); ctx.stroke();
      ctx.fillStyle = S.trim;
      const pts = [[-12, -31, 4], [0, -37, 8], [12, -31, 4]];
      for (const p of pts) {
        ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1] + 3); ctx.lineTo(p[0], p[1] - p[2]); ctx.lineTo(p[0] + 3, p[1] + 3); ctx.closePath(); ctx.fill();
      }
      ell(ctx, 0, -32, 2.6, 3.2, 0, '#ff1744');
      ell(ctx, -12, -29.5, 1.4, 1.4, 0, '#ff1744');
      ell(ctx, 12, -29.5, 1.4, 1.4, 0, '#ff1744');
      glowAt(ctx, 0, -32, 9, '#ff1744', 0.4);
      star4(ctx, 1.4, -34, 3, '#ffffff', clamp01(sin(t * 1.3 + 1) * 4 - 3));
    } else if (id === 'nerissa') {
      ctx.save(); ctx.translate(-19, -27); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.moveTo(0, 5);
      for (let i = 0; i <= 4; i++) { const a = PI + (i / 4) * PI; ctx.lineTo(cos(a) * 7, sin(a) * 7 + 1); }
      ctx.closePath(); ctx.fillStyle = '#ffc1d9'; ctx.fill();
      ctx.strokeStyle = '#e0789e'; ctx.lineWidth = 0.6;
      ctx.beginPath(); for (let i = 1; i < 4; i++) { const a = PI + (i / 4) * PI; ctx.moveTo(0, 5); ctx.lineTo(cos(a) * 6.5, sin(a) * 6.5 + 1); } ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 4; i++) ell(ctx, -12 + i * 4, -30 - sin(i) * 1.5, 1.2, 1.2, 0, '#ffffff');
    } else if (id === 'lyra') {
      ctx.save(); ctx.translate(-19, -26);
      ctx.fillStyle = '#7cb342';
      ctx.beginPath(); ctx.ellipse(-3, 0, 6, 2.6, -0.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9ccc65';
      ctx.beginPath(); ctx.ellipse(3, -1, 6, 2.6, 0.5, 0, TAU); ctx.fill();
      ell(ctx, 0, 0, 1.8, 1.8, 0, '#ffd54f');
      ctx.restore();
      if (S.freckles) {
        const fc = U.rgba('#c77b55', 0.55);
        for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) ell(ctx, sd * (13 + i * 2.2), 9 + (i % 2), 0.6, 0.6, 0, fc);
      }
    } else if (id === 'selene') {
      const ra = 0.55 + 0.4 * sin(t * 2.4);
      ctx.strokeStyle = U.rgba(S.runes, ra); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(2.5, -15.5); ctx.lineTo(0, -12); ctx.lineTo(-2.5, -15.5); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-14, 13.5); ctx.moveTo(-16.5, 10); ctx.lineTo(-16.5, 12.5); ctx.moveTo(14, 10); ctx.lineTo(14, 13.5); ctx.moveTo(16.5, 10); ctx.lineTo(16.5, 12.5); ctx.stroke();
      glowAt(ctx, 0, -15.5, 8, S.runes, ra * 0.6);
      // round glasses
      ctx.strokeStyle = '#d6d9f2'; ctx.lineWidth = 1.2;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * 10.5, 3, 9.6, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-1, 2); ctx.quadraticCurveTo(0, 0.6, 1, 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.6;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 10.5 - 5, 0); ctx.lineTo(sd * 10.5 - 1, -5); ctx.stroke(); }
    }
    if (ex.veil) {
      const cols = ['#ffffff', '#ffc1e3', '#fff3b0'];
      for (let i = 0; i < 9; i++) {
        const a = PI * 1.12 + (i / 8) * PI * 0.76;
        const x = cos(a) * 25, y = -14 + sin(a) * 25;
        ell(ctx, x, y, 3.3, 3.3, 0, cols[i % 3]);
        ell(ctx, x, y, 1.1, 1.1, 0, '#ffd54f');
      }
    }
  }

  function moodFx(S, ctx, t, mood) {
    if (mood === 'love') {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.45 + i / 3) % 1;
        const x = 26 + i * 6 + sin(t * 3 + i) * 3, y = -24 - p * 30;
        ctx.globalAlpha = sin(p * PI);
        ctx.fillStyle = i % 2 ? '#ff80ab' : '#ff4f8b';
        heartPath(ctx, x, y, 3.4 + i * 0.6); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (mood === 'angry') {
      ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 1.8;
      const s = 1 + 0.15 * sin(t * 12);
      ctx.save(); ctx.translate(23, -30); ctx.scale(s, s);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(HALF_PI);
        ctx.beginPath(); ctx.moveTo(1.5, -4.5); ctx.quadraticCurveTo(1.5, -1.5, 4.5, -1.5); ctx.stroke();
      }
      ctx.restore();
    } else if (mood === 'surprised') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        const a = -2.3 + i * 0.45;
        ctx.beginPath(); ctx.moveTo(cos(a) * 34, -12 + sin(a) * 34); ctx.lineTo(cos(a) * 41, -12 + sin(a) * 41); ctx.stroke();
      }
    } else if (mood === 'sad') {
      const p = (t * 0.5) % 1;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.fillStyle = '#9fe4ff';
      ctx.beginPath(); ctx.moveTo(-15, 9 + p * 8); ctx.quadraticCurveTo(-17, 13 + p * 8, -15, 14 + p * 8); ctx.quadraticCurveTo(-13, 13 + p * 8, -15, 9 + p * 8); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (mood === 'happy') {
      star4(ctx, 30, -30, 3.4, '#fff59d', 0.5 + 0.5 * sin(t * 4));
      star4(ctx, -32, -22, 2.6, '#ffffff', 0.5 + 0.5 * sin(t * 4 + 2));
    } else if (mood === 'shy') {
      ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(26, -22); ctx.quadraticCurveTo(29, -17, 26, -14); ctx.quadraticCurveTo(23, -17, 26, -22); ctx.stroke();
    }
  }

  /** drawPortrait(ctx, x, y, size, t, mood, ex): bust centered on (x,y) inside a size x size box.
   *  ex (optional): {talk, veil, look:{x,y}} */
  function drawPortraitFor(id, ctx, x, y, size, t, mood, ex) {
    const S = STY[id];
    if (!S || !ctx || !(size > 0)) return;
    t = +t || 0; mood = mood || 'idle'; ex = ex || NOEX;
    ctx.save();
    ctx.translate(x, y);
    const k = size / 100;
    ctx.scale(k, k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const breath = sin(t * 2.1 + S.ph * 6);
    glowAt(ctx, 0, -4, 64, S.aura, 0.26 + 0.06 * sin(t * 1.7 + S.ph));
    ctx.translate(0, 3);
    ctx.scale(0.9, 0.9);
    ctx.save();
    ctx.translate(0, breath * 0.5);
    backFx(id, S, ctx, t, mood, ex);
    ctx.restore();
    const tilt = sin(t * 0.8 + S.ph * 3) * 0.035 + (mood === 'shy' ? 0.06 : mood === 'smug' ? -0.05 : 0);
    const headY = -1 + breath * 0.8;
    ctx.save();
    ctx.translate(0, headY + 26); ctx.rotate(tilt); ctx.translate(0, -26);
    backHair(S, ctx, t);
    ctx.restore();
    ctx.save();
    ctx.translate(0, breath * 0.4);
    drawBody(id, S, ctx, t, ex);
    ctx.restore();
    ctx.save();
    ctx.translate(0, headY + 26); ctx.rotate(tilt); ctx.translate(0, -26);
    drawEars(S, ctx, t);
    facePath(ctx);
    ctx.fillStyle = vgrad(ctx, -30, 24, S.skin, S.skin, U.mix(S.skin, S.skinSh, 0.55));
    ctx.fill();
    ell(ctx, 0, -18, 22, 9, 0, U.rgba(S.hairDk, 0.12));
    // blush
    const ba = mood === 'love' ? 0.62 : mood === 'shy' ? 0.7 : mood === 'happy' ? 0.36 : mood === 'angry' ? 0.3 : 0.2;
    ctx.globalAlpha = ba;
    ell(ctx, -15, 10, 5.4, 2.8, 0, S.blush);
    ell(ctx, 15, 10, 5.4, 2.8, 0, S.blush);
    ctx.globalAlpha = 1;
    if (mood === 'love' || mood === 'shy') {
      ctx.strokeStyle = U.rgba(S.blush, 0.9); ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const bx = sd * (12 + i * 2.6); ctx.moveTo(bx, 11); ctx.lineTo(bx + 1.6, 8.6); }
      ctx.stroke();
    }
    // eyes
    const bl = blinkAmt(t, S.ph);
    const look = ex.look || NOEX;
    let lx = look.x != null ? look.x : sin(t * 0.37 + S.ph * 4) * 0.5, ly = look.y != null ? look.y : 0;
    if (mood === 'shy') { lx = -0.9; ly = 0.6; }
    const happyClosed = mood === 'happy' && (sin(t * 0.6 + S.ph) > 0.55);
    drawEye(S, ctx, -10.5, 2.5, -1, happyClosed ? 1 : bl, mood, t, lx, ly);
    drawEye(S, ctx, 10.5, 2.5, 1, happyClosed ? 1 : bl, mood, t, lx, ly);
    // sparkle twinkle
    const tw = sin(t * 1.3 + S.ph * 20);
    if (tw > 0.9 && !happyClosed) star4(ctx, 17, -5, 3.6, '#ffffff', (tw - 0.9) * 10);
    // nose & mouth
    ctx.strokeStyle = U.rgba(S.skinSh, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0.8, 8.6); ctx.lineTo(0, 10.2); ctx.stroke();
    drawMouth(S, ctx, mood, t, !!ex.talk);
    // hair over forehead
    frontHair(S, ctx, t);
    drawBrows(S, ctx, mood);
    frontFx(id, S, ctx, t, mood, ex);
    moodFx(S, ctx, t, mood);
    ctx.restore();
    ctx.restore();
  }

  /* ============================================================ gift icons */
  function drawGiftIcon(ctx, id, x, y, s, t) {
    const g = GIFT_BY_ID[id];
    if (!g || !ctx) return;
    t = t || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 40, s / 40);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    glowAt(ctx, 0, 0, 22, g.color, 0.35);
    switch (id) {
      case 'fiori':
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(8, 4); ctx.lineTo(3, 18); ctx.lineTo(-3, 18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#43a047'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(-6, -2); ctx.moveTo(0, 14); ctx.lineTo(0, -6); ctx.moveTo(0, 14); ctx.lineTo(6, -1); ctx.stroke();
        for (const p of [[-7, -5], [0, -10], [7, -4]]) { ell(ctx, p[0], p[1], 5, 5, 0, '#ff4f8b'); ell(ctx, p[0], p[1], 2.4, 2.4, 0, '#ffb3cf'); }
        ell(ctx, 0, 4, 3, 1.6, 0, '#ff80ab');
        break;
      case 'dolci':
        ctx.fillStyle = '#c47a3a'; ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(10, 2); ctx.lineTo(7, 15); ctx.lineTo(-7, 15); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#8d4f1c'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let i = -6; i <= 6; i += 4) { ctx.moveTo(i, 3); ctx.lineTo(i * 0.75, 14); } ctx.stroke();
        ell(ctx, 0, -2, 11, 6.5, 0, '#ffe0b2'); ell(ctx, -2, -6, 7, 5, 0, '#fff3e0');
        ell(ctx, 1, -11, 3, 3, 0, '#ff4f6d');
        break;
      case 'pendente':
        ctx.strokeStyle = '#ffe082'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-12, -16); ctx.quadraticCurveTo(0, -2, 12, -16); ctx.stroke();
        ctx.fillStyle = '#4dd0e1'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(8, 3); ctx.lineTo(0, 16); ctx.lineTo(-8, 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b2ebf2'; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 3); ctx.lineTo(0, 9); ctx.lineTo(-4, 3); ctx.closePath(); ctx.fill();
        glowAt(ctx, 0, 4, 12, '#80deea', 0.4 + 0.25 * sin(t * 3));
        break;
      case 'libro':
        ctx.fillStyle = '#5e35b1'; ctx.fillRect(-11, -13, 22, 26);
        ctx.fillStyle = '#f3e5f5'; ctx.fillRect(-9, -11, 3, 22);
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1.2; ctx.strokeRect(-11, -13, 22, 26);
        ctx.fillStyle = '#ff80ab'; heartPath(ctx, 2, 1, 5); ctx.fill();
        break;
      case 'cote':
        ctx.fillStyle = '#37474f'; ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(-8, -8); ctx.lineTo(14, -6); ctx.lineTo(9, 9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ff7043'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-2, -4); ctx.lineTo(2, 0); ctx.lineTo(6, -4); ctx.stroke();
        glowAt(ctx, 0, -2, 12, '#ff7043', 0.35 + 0.2 * sin(t * 4));
        break;
      case 'conchiglia':
        ctx.beginPath(); ctx.moveTo(0, 13);
        for (let i = 0; i <= 6; i++) { const a = PI + (i / 6) * PI; ctx.lineTo(cos(a) * 14, sin(a) * 14 + 2); }
        ctx.closePath(); ctx.fillStyle = '#ffc1d9'; ctx.fill();
        ctx.strokeStyle = '#d8648c'; ctx.lineWidth = 1;
        ctx.beginPath(); for (let i = 1; i < 6; i++) { const a = PI + (i / 6) * PI; ctx.moveTo(0, 13); ctx.lineTo(cos(a) * 13, sin(a) * 13 + 2); } ctx.stroke();
        star4(ctx, 8, -10, 3, '#ffffff', 0.5 + 0.5 * sin(t * 3));
        break;
      case 'te':
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.quadraticCurveTo(10, 12, 0, 12); ctx.quadraticCurveTo(-10, 12, -11, -2); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(12, 3, 4, -1.2, 1.2); ctx.stroke();
        ell(ctx, 0, -2, 11, 2.2, 0, '#e8a27c');
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
        for (let i = -1; i <= 1; i++) { const o = sin(t * 2 + i) * 2; ctx.beginPath(); ctx.moveTo(i * 5, -6); ctx.quadraticCurveTo(i * 5 + o, -11, i * 5, -16); ctx.stroke(); }
        ell(ctx, -4, 5, 2.4, 1.4, 0.4, '#f8bbd0');
        break;
      case 'carillon':
        ctx.fillStyle = '#6d4c41'; ctx.fillRect(-12, -2, 24, 14);
        ctx.fillStyle = '#8d6e63'; ctx.save(); ctx.translate(-12, -2); ctx.rotate(-0.5 - 0.08 * sin(t * 2)); ctx.fillRect(0, -3, 24, 3); ctx.restore();
        ctx.strokeStyle = '#ffd54f'; ctx.lineWidth = 1; ctx.strokeRect(-12, -2, 24, 14);
        star4(ctx, 4, -10, 5, '#ffe082', 0.8 + 0.2 * sin(t * 3));
        star4(ctx, -3, -14, 2.5, '#ffffff', 0.5 + 0.5 * sin(t * 5));
        break;
      case 'tofu':
        for (const p of [[-6, 3], [6, 2], [0, -6]]) {
          ctx.fillStyle = '#f6a33a';
          ctx.beginPath(); ctx.moveTo(p[0] - 7, p[1] + 5); ctx.lineTo(p[0] + 7, p[1] + 5); ctx.lineTo(p[0], p[1] - 7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffd180'; ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1] + 2); ctx.lineTo(p[0] + 2, p[1] + 2); ctx.lineTo(p[0], p[1] - 3); ctx.closePath(); ctx.fill();
        }
        break;
      case 'melagrana':
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.quadraticCurveTo(9, 4, 0, 5); ctx.quadraticCurveTo(-9, 4, -9, -12); ctx.fill();
        ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.quadraticCurveTo(8, 4, 0, 4.5); ctx.quadraticCurveTo(-8, 4, -8, -6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-1, 5, 2, 8); ctx.fillRect(-6, 13, 12, 2);
        ell(ctx, -4, -3, 1.4, 2.6, 0.3, 'rgba(255,255,255,0.5)');
        break;
      case 'piuma':
        ctx.save(); ctx.rotate(-0.6 + 0.08 * sin(t * 2));
        ctx.beginPath(); ctx.moveTo(0, 16); ctx.quadraticCurveTo(-10, 0, 0, -17); ctx.quadraticCurveTo(10, 0, 0, 16);
        ctx.fillStyle = vgrad(ctx, -17, 16, '#ffe082', '#ff7043', '#d84315'); ctx.fill();
        ctx.strokeStyle = '#fff3e0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(0, -14); ctx.stroke();
        ctx.restore();
        glowAt(ctx, 0, 0, 16, '#ff7043', 0.4 + 0.2 * sin(t * 4));
        break;
      default:
        ell(ctx, 0, 0, 10, 10, 0, g.color);
    }
    ctx.restore();
  }

  /* ======================================================= world fighter */
  function fighterGlow(ctx, x, y, r, color, a) { glowAt(ctx, x, y, r, color, a); }

  function drawFighter(id, ctx, m, t) {
    const S = STY[id];
    if (!S) return;
    const nc = m.nc || NOEX;
    const vx = m.vx || 0, vy = m.vy || 0;
    const spd = hypot(vx, vy);
    const walk = min(1, spd / 110);
    const ph = (m.t || t) * 12;
    const bob = abs(sin(ph)) * 0.07 * walk;
    const atk = clamp01(1 - ((m.t || 0) - (nc.atkAt != null ? nc.atkAt : -9)) / 0.35);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // back layer
    if (id === 'kiara') {
      for (let i = 0; i < 5; i++) {
        const a = PI + 0.5 + i * 0.3 + sin(t * 2.2 + i) * 0.12;
        const L = 0.95;
        ctx.beginPath();
        ctx.moveTo(-0.15, 0.25);
        ctx.quadraticCurveTo(-0.15 + cos(a) * L * 0.5 - 0.15, 0.25 + sin(a) * L * 0.5, -0.15 + cos(a) * L, 0.25 + sin(a) * L);
        ctx.quadraticCurveTo(-0.15 + cos(a) * L * 0.5 + 0.15, 0.25 + sin(a) * L * 0.5 + 0.2, -0.05, 0.4);
        ctx.closePath();
        ctx.fillStyle = S.hair; ctx.fill();
        ell(ctx, -0.15 + cos(a) * L * 0.88, 0.25 + sin(a) * L * 0.88, 0.13, 0.1, a, '#fff7ee');
      }
    } else if (id === 'morgana') {
      const fl = sin(t * 3) * 0.06 + walk * 0.12;
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.1); ctx.quadraticCurveTo(-0.85 - fl, 0.4, -0.7 - fl, 0.86);
      ctx.lineTo(0.2, 0.84); ctx.lineTo(0.3, -0.1); ctx.closePath();
      ctx.fillStyle = '#120a12'; ctx.fill();
      ctx.strokeStyle = S.outfit2; ctx.lineWidth = 0.06; ctx.stroke();
    } else if (id === 'lyra') {
      ctx.save(); ctx.translate(-0.32, -0.05); ctx.rotate(-0.5);
      ctx.fillStyle = '#6d4426'; ctx.fillRect(-0.1, -0.4, 0.2, 0.62);
      ctx.fillStyle = '#c5e1a5'; ctx.fillRect(-0.08, -0.52, 0.05, 0.14); ctx.fillRect(0.03, -0.5, 0.05, 0.12);
      ctx.restore();
    } else if (id === 'selene') {
      ctx.globalAlpha *= 0.6;
      ctx.strokeStyle = S.runes; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.ellipse(0, 0.82, 0.72, 0.24, 0, t * 2, t * 2 + 4.6); ctx.stroke();
      ctx.globalAlpha /= 0.6;
    }
    // legs
    const lk = sin(ph) * 0.17 * walk;
    ell(ctx, -0.17 + lk, 0.8, 0.13, 0.1, 0, id === 'nerissa' ? S.outfit2 : '#2a1d2e');
    ell(ctx, 0.19 - lk, 0.8, 0.13, 0.1, 0, id === 'nerissa' ? S.outfit2 : '#2a1d2e');
    ctx.save();
    ctx.translate(0, -bob);
    // body / dress
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.02); ctx.lineTo(0.3, -0.02);
    ctx.lineTo(0.46, 0.7); ctx.quadraticCurveTo(0, 0.84, -0.46, 0.7);
    ctx.closePath();
    ctx.fillStyle = S.outfit; ctx.fill();
    ctx.strokeStyle = S.trim; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(-0.44, 0.66); ctx.quadraticCurveTo(0, 0.8, 0.44, 0.66); ctx.stroke();
    ctx.fillStyle = S.outfit2; ctx.fillRect(-0.32, 0.22, 0.64, 0.1);
    // back arm
    ell(ctx, -0.32, 0.18, 0.09, 0.2, 0.3, S.skinSh);
    // head
    const hy = -0.58;
    ctx.beginPath(); ctx.ellipse(0, hy - 0.02, 0.6, 0.57, 0, 0, TAU); ctx.fillStyle = S.hairDk; ctx.fill();
    if (S.back === 'long' || S.back === 'straight' || S.back === 'wavy' || S.back === 'spiky') {
      ctx.beginPath();
      ctx.moveTo(-0.55, hy); ctx.quadraticCurveTo(-0.66, 0.0, -0.5 + sin(t * 2) * 0.03, 0.3);
      ctx.lineTo(0.02, 0.28); ctx.lineTo(0.0, hy); ctx.closePath();
      ctx.fillStyle = S.hair; ctx.fill();
    }
    if (S.back === 'ponytail') {
      const sw = sin(t * 3 + walk * ph * 0.2) * 0.08;
      ctx.beginPath(); ctx.moveTo(-0.35, hy - 0.3); ctx.quadraticCurveTo(-0.95, hy - 0.1 + sw, -0.75, hy + 0.45 + sw);
      ctx.quadraticCurveTo(-0.55, hy + 0.1, -0.25, hy - 0.1); ctx.closePath();
      ctx.fillStyle = S.hair; ctx.fill();
    }
    // ears
    if (S.ears === 'elf' || S.ears === 'pointy') {
      ctx.beginPath(); ctx.moveTo(-0.38, hy - 0.02); ctx.lineTo(-0.82, hy - 0.28); ctx.lineTo(-0.4, hy + 0.12); ctx.closePath(); ctx.fillStyle = S.skin; ctx.fill();
    } else if (S.ears === 'fin') {
      ctx.beginPath(); ctx.moveTo(-0.36, hy - 0.1); ctx.lineTo(-0.82, hy - 0.36); ctx.lineTo(-0.72, hy + 0.02); ctx.lineTo(-0.8, hy + 0.22); ctx.lineTo(-0.36, hy + 0.12); ctx.closePath();
      ctx.fillStyle = S.hairLt; ctx.fill();
    }
    // face
    ctx.beginPath(); ctx.ellipse(0.08, hy + 0.03, 0.45, 0.43, 0, 0, TAU); ctx.fillStyle = S.skin; ctx.fill();
    // eyes (looking toward +x)
    const bl = blinkAmt(t, S.ph);
    for (const ex2 of [0.2, 0.44]) {
      if (bl > 0.5) {
        ctx.strokeStyle = S.lash; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(ex2 - 0.07, hy + 0.04); ctx.lineTo(ex2 + 0.07, hy + 0.04); ctx.stroke();
      } else {
        ell(ctx, ex2, hy + 0.03, 0.075, 0.115, 0, S.eyeDk);
        ell(ctx, ex2 + 0.01, hy + 0.07, 0.05, 0.06, 0, S.eye);
        ell(ctx, ex2 - 0.02, hy - 0.02, 0.028, 0.034, 0, '#ffffff');
      }
    }
    ctx.globalAlpha *= 0.5;
    ell(ctx, 0.1, hy + 0.17, 0.07, 0.04, 0, S.blush);
    ell(ctx, 0.54, hy + 0.17, 0.06, 0.04, 0, S.blush);
    ctx.globalAlpha /= 0.5;
    // bangs
    ctx.beginPath();
    ctx.moveTo(-0.6, hy + 0.05);
    ctx.bezierCurveTo(-0.62, hy - 0.72, 0.6, hy - 0.78, 0.58, hy - 0.08);
    ctx.lineTo(0.52, hy - 0.16); ctx.lineTo(0.42, hy - 0.06); ctx.lineTo(0.32, hy - 0.2); ctx.lineTo(0.18, hy - 0.08);
    ctx.lineTo(0.06, hy - 0.22); ctx.lineTo(-0.12, hy - 0.06); ctx.lineTo(-0.3, hy - 0.16);
    ctx.closePath();
    ctx.fillStyle = S.hair; ctx.fill();
    ctx.strokeStyle = U.rgba(S.hairLt, 0.7); ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.arc(-0.05, hy - 0.2, 0.4, PI * 1.2, PI * 1.55); ctx.stroke();
    // features
    if (id === 'aurelia') {
      ctx.fillStyle = '#fff3e0';
      ctx.beginPath(); ctx.moveTo(-0.2, hy - 0.5); ctx.quadraticCurveTo(-0.3, hy - 0.86, -0.06, hy - 1.02); ctx.quadraticCurveTo(-0.12, hy - 0.76, 0.0, hy - 0.52); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.22, hy - 0.5); ctx.quadraticCurveTo(0.24, hy - 0.86, 0.48, hy - 0.98); ctx.quadraticCurveTo(0.36, hy - 0.74, 0.4, hy - 0.46); ctx.closePath(); ctx.fill();
    } else if (id === 'kiara') {
      ctx.fillStyle = S.hair;
      ctx.beginPath(); ctx.moveTo(-0.38, hy - 0.4); ctx.lineTo(-0.3, hy - 0.98); ctx.lineTo(-0.02, hy - 0.52); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.12, hy - 0.52); ctx.lineTo(0.42, hy - 0.98); ctx.lineTo(0.5, hy - 0.4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff1e6';
      ctx.beginPath(); ctx.moveTo(-0.3, hy - 0.48); ctx.lineTo(-0.28, hy - 0.8); ctx.lineTo(-0.12, hy - 0.54); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.22, hy - 0.54); ctx.lineTo(0.4, hy - 0.8); ctx.lineTo(0.42, hy - 0.48); ctx.closePath(); ctx.fill();
    } else if (id === 'morgana') {
      ctx.fillStyle = S.trim;
      ctx.beginPath(); ctx.moveTo(-0.2, hy - 0.5); ctx.lineTo(-0.12, hy - 0.66); ctx.lineTo(0.0, hy - 0.54); ctx.lineTo(0.08, hy - 0.76); ctx.lineTo(0.18, hy - 0.54); ctx.lineTo(0.3, hy - 0.66); ctx.lineTo(0.36, hy - 0.48); ctx.closePath(); ctx.fill();
      ell(ctx, 0.08, hy - 0.6, 0.05, 0.06, 0, '#ff1744');
    } else if (id === 'nerissa') {
      ell(ctx, -0.32, hy - 0.4, 0.1, 0.08, -0.4, '#ffc1d9');
    } else if (id === 'lyra') {
      ell(ctx, -0.34, hy - 0.42, 0.11, 0.05, -0.6, '#7cb342');
    } else if (id === 'selene') {
      ctx.strokeStyle = '#d6d9f2'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.arc(0.2, hy + 0.03, 0.13, 0, TAU); ctx.moveTo(0.57, hy + 0.03); ctx.arc(0.44, hy + 0.03, 0.13, 0, TAU); ctx.stroke();
      fighterGlow(ctx, 0.3, hy - 0.22, 0.14, S.runes, 0.5 + 0.3 * sin(t * 3));
    }
    // weapon arm
    drawWeapon(id, S, ctx, t, atk, hy);
    ctx.restore();
  }

  function drawWeapon(id, S, ctx, t, atk, hy) {
    const ax = 0.36, ay = 0.16;
    if (id === 'aurelia') {
      const base = -1.15, swing = atk > 0 ? -1.9 + U.ease.outCubic(1 - atk) * 3.1 : base + sin(t * 2) * 0.05;
      const a = atk > 0 ? swing : base;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#5d4037'; ctx.fillRect(-0.04, -0.06, 0.24, 0.12);
      ctx.fillStyle = S.trim; ctx.fillRect(0.18, -0.13, 0.06, 0.26);
      ctx.beginPath(); ctx.moveTo(0.24, -0.08); ctx.lineTo(1.2, -0.04); ctx.lineTo(1.34, 0); ctx.lineTo(1.2, 0.05); ctx.lineTo(0.24, 0.08); ctx.closePath();
      ctx.fillStyle = '#ffe0c0'; ctx.fill();
      ctx.fillStyle = '#ff7043'; ctx.fillRect(0.28, -0.025, 0.9, 0.05);
      fighterGlow(ctx, 0.8, 0, 0.75 + atk * 0.5, '#ff5a1f', 0.45 + atk * 0.5 + 0.1 * sin(t * 9));
      ctx.restore();
      ell(ctx, ax, ay, 0.1, 0.1, 0, S.skin);
    } else if (id === 'nerissa') {
      const thrust = atk > 0 ? sin(atk * PI) * 0.4 : 0;
      ctx.save(); ctx.translate(ax + thrust, ay); ctx.rotate(-0.25 + atk * 0.25);
      ctx.strokeStyle = '#b2fff4'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(-0.5, 0); ctx.lineTo(0.95, 0); ctx.stroke();
      ctx.strokeStyle = '#4dd0e1'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(0.85, -0.18); ctx.lineTo(1.12, -0.18); ctx.moveTo(0.85, -0.18); ctx.lineTo(0.85, 0.18); ctx.lineTo(1.12, 0.18); ctx.moveTo(0.95, 0); ctx.lineTo(1.25, 0); ctx.stroke();
      fighterGlow(ctx, 1.05, 0, 0.45 + atk * 0.5, '#36d8ff', 0.4 + atk * 0.5);
      ctx.restore();
      ell(ctx, ax + thrust, ay, 0.1, 0.1, 0, S.skin);
    } else if (id === 'kiara') {
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + i * TAU / 3;
        const x = cos(a) * 0.85, y = -0.2 + sin(a) * 0.4;
        fighterGlow(ctx, x, y, 0.42, '#ff9a3c', 0.6);
        ell(ctx, x, y, 0.1, 0.13, 0, '#fff3d6');
      }
      ell(ctx, ax + atk * 0.2, ay - atk * 0.2, 0.1, 0.1, 0, S.skin);
      if (atk > 0) fighterGlow(ctx, ax + 0.3, ay - 0.3, 0.6 * atk + 0.2, '#ffb74d', atk);
    } else if (id === 'morgana') {
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(-0.6 - atk * 0.6);
      ctx.strokeStyle = '#c8cbe0'; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(0.75, 0); ctx.stroke();
      ell(ctx, 0.82, 0, 0.11, 0.11, 0, '#ff1744');
      fighterGlow(ctx, 0.82, 0, 0.45 + atk * 0.6, '#ff1744', 0.5 + atk * 0.5);
      ctx.restore();
      ell(ctx, ax, ay, 0.1, 0.1, 0, S.skin);
    } else if (id === 'lyra') {
      const pull = atk > 0.5 ? (1 - atk) * 2 : atk * 0.6;
      ctx.save(); ctx.translate(ax + 0.2, ay - 0.05);
      ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, 0, 0.55, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 0.025;
      const sx = 0.55 * cos(1.2);
      ctx.beginPath(); ctx.moveTo(sx, -0.55 * sin(1.2)); ctx.lineTo(sx - 0.3 * pull, 0); ctx.lineTo(sx, 0.55 * sin(1.2)); ctx.stroke();
      if (atk < 0.6) { ctx.strokeStyle = '#d4f59a'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(sx - 0.3 * pull, 0); ctx.lineTo(0.7, 0); ctx.stroke(); }
      ctx.restore();
      ell(ctx, ax + 0.2, ay - 0.05, 0.1, 0.1, 0, S.skin);
    } else if (id === 'selene') {
      ctx.save(); ctx.translate(ax, ay);
      ctx.strokeStyle = '#4a3b7a'; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(0, 0.6); ctx.lineTo(0.05, -0.75); ctx.stroke();
      const cy = -0.85;
      ctx.fillStyle = '#e1d4ff';
      ctx.beginPath(); ctx.moveTo(0.05, cy - 0.18); ctx.lineTo(0.16, cy); ctx.lineTo(0.05, cy + 0.18); ctx.lineTo(-0.06, cy); ctx.closePath(); ctx.fill();
      fighterGlow(ctx, 0.05, cy, 0.5 + atk * 0.7, '#b388ff', 0.55 + atk * 0.45 + 0.1 * sin(t * 5));
      ctx.restore();
      ell(ctx, ax, ay, 0.1, 0.1, 0, S.skin);
    }
  }

  /* ================================================================ combat */
  function cdmg(G, m) {
    const p = G && G.player;
    const mul = (p && p.stats && p.stats.allyDmg) || 1;
    const lv = p ? max(1, p.level || 1) : 1;
    const st = p ? (p.stage || 0) : 0;
    return (m.dmg || 10) * mul * (1 + 0.07 * (lv - 1) + 0.12 * st);
  }
  function hurt(target, amt, m, knock, kx, ky, el) {
    const C = SK.combat;
    if (!C || !C.damage || !target || target.dead || !(amt > 0)) return 0;
    const l = hypot(kx, ky) || 1;
    try {
      return C.damage(target, amt, { source: m, knock: knock || 0, kx: kx / l, ky: ky / l, element: el || 'physical' }) || 0;
    } catch (e) { return 0; }
  }
  function status(target, type, dur, power) {
    const C = SK.combat;
    if (C && C.applyStatus && target && !target.dead) { try { C.applyStatus(target, type, dur, power); } catch (e) { /* ignore */ } }
  }
  function healEnt(target, amt) {
    if (!target || !(amt > 0)) return;
    const C = SK.combat;
    if (C && C.heal) { try { C.heal(target, amt); return; } catch (e) { /* fallback */ } }
    if (target.maxHp > 0) target.hp = min(target.maxHp, (target.hp || 0) + amt);
  }
  function queryE(G, x, y, r, fn) {
    const C = SK.combat;
    if (C && C.query) { try { C.query(x, y, r, fn, 'enemy'); return; } catch (e) { /* fallback */ } }
    const E = (G && G.enemies) || [];
    const r2 = r * r;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (!e || e.dead || e.passive) continue;
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= r2 + (e.r || 0) * (e.r || 0)) fn(e);
    }
  }
  function proj(o) {
    const S = SK.Skills;
    if (!S || typeof S.spawnProjectile !== 'function') return null;
    try { return S.spawnProjectile(o); } catch (e) { return null; }
  }

  function atkAurelia(G, m, tg, nc, d, ang) {
    if (d > m.r + (tg.r || 16) + 44) return false;
    const dmg = cdmg(G, m);
    const big = nc.n % 4 === 3;
    const R = big ? 125 : 86;
    const cx = m.x + cos(ang) * 24, cy = m.y + sin(ang) * 24;
    queryE(G, big ? m.x : cx, big ? m.y : cy, R, (e) => {
      if (!e || e.dead || e.passive) return;
      if (!big) {
        const a2 = atan2(e.y - m.y, e.x - m.x);
        if (abs(U.angleDiff(ang, a2)) > 1.35 && hypot(e.x - m.x, e.y - m.y) > (e.r || 16) + m.r + 8) return;
      }
      hurt(e, dmg * (big ? 1.45 : 1), m, big ? 260 : 170, e.x - m.x, e.y - m.y, 'fire');
      status(e, 'burn', 2.2, dmg * 0.18);
    });
    if (big) {
      fxCall('slash', m.x, m.y, ang, { radius: 100, arc: TAU * 0.95, color: '#ff6d3a', width: 16, life: 0.3 });
      fxCall('ring', m.x, m.y, { radius: R, color: '#ff8a50', life: 0.4, width: 7 });
      fxCall('burst', m.x, m.y, { count: lowQ() ? 10 : 22, colors: ['#ff5a1f', '#ffd54f', '#ffffff'], speed: [90, 300], life: [0.3, 0.7], size: [2, 4], shape: 'spark', glow: true });
      sfx('fire', { vol: 0.45, pitch: 1.1 });
      if (SK.cam && SK.cam.shake) SK.cam.shake(3, 0.15);
    } else {
      fxCall('slash', cx + cos(ang) * 16, cy + sin(ang) * 16, ang, { radius: 72, arc: 2.3, color: '#ff6d3a', width: 13, life: 0.22 });
      fxCall('burst', cx + cos(ang) * 30, cy + sin(ang) * 30, { count: lowQ() ? 4 : 9, colors: ['#ff8a50', '#ffd54f'], speed: [60, 200], life: [0.25, 0.5], size: [1.5, 3], angle: ang, spread: 1.4, glow: true });
    }
    sfx('slash', { vol: 0.38, pitch: 1.05 + Math.random() * 0.1 });
    return true;
  }
  function atkNerissa(G, m, tg, nc, d, ang) {
    if (d > 340) return false;
    const dmg = cdmg(G, m);
    if (nc.n % 5 === 4) {
      queryE(G, m.x, m.y, 135, (e) => {
        if (!e || e.dead || e.passive) return;
        hurt(e, dmg * 0.9, m, 290, e.x - m.x, e.y - m.y, 'water');
        status(e, 'slow', 2, 0.4);
      });
      fxCall('ring', m.x, m.y, { radius: 135, color: '#4dd0e1', life: 0.5, width: 8, fill: true });
      fxCall('burst', m.x, m.y, { count: lowQ() ? 10 : 24, colors: ['#4dd0e1', '#b2fff4', '#ffffff'], speed: [80, 260], life: [0.4, 0.8], size: [2, 4], shape: 'drop', gravity: 200, glow: true });
      sfx('water', { vol: 0.45, pitch: 0.85 });
      return true;
    }
    const n = 1 + (m.aff >= 6 ? 1 : 0) + (m.spouse ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.16;
      const ok = proj({
        x: m.x + cos(a) * m.r, y: m.y + sin(a) * m.r, vx: cos(a) * 560, vy: sin(a) * 560, r: 8, dmg,
        team: 'player', element: 'water', kind: 'water', color: '#4dd0e1', life: 0.75, pierce: 2, knock: 150,
        status: { type: 'slow', dur: 1.4, power: 0.35 }, source: m, rot: a,
      });
      if (!ok && i === 0) hurt(tg, dmg, m, 150, tg.x - m.x, tg.y - m.y, 'water');
    }
    fxCall('burst', m.x + cos(ang) * m.r * 1.4, m.y + sin(ang) * m.r * 1.4, { count: lowQ() ? 3 : 7, colors: ['#4dd0e1', '#ffffff'], speed: [60, 180], life: [0.2, 0.45], size: [1.5, 3], angle: ang, spread: 0.9, shape: 'drop' });
    sfx('water', { vol: 0.3, pitch: 1.25 });
    return true;
  }
  function atkKiara(G, m, tg, nc, d, ang) {
    if (d > 320) return false;
    const dmg = cdmg(G, m);
    const nova = nc.n % 4 === 3;
    const n = nova ? 8 : 2 + (m.aff >= 7 ? 1 : 0) + (m.spouse ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = nova ? (i / n) * TAU : ang + (i - (n - 1) / 2) * 0.55;
      const sp = nova ? 240 : 270;
      const ok = proj({
        x: m.x + cos(a) * m.r, y: m.y + sin(a) * m.r, vx: cos(a) * sp, vy: sin(a) * sp, r: 9, dmg: dmg * (nova ? 0.8 : 0.85),
        team: 'player', element: 'spirit', kind: 'spirit', color: '#ffa040', life: 1.8, homing: 6, pierce: 0, knock: 90,
        status: { type: 'burn', dur: 2, power: dmg * 0.15 }, source: m,
      });
      if (!ok && i === 0) hurt(tg, dmg, m, 90, tg.x - m.x, tg.y - m.y, 'spirit');
    }
    if (nova) fxCall('ring', m.x, m.y, { radius: 70, color: '#ffb74d', life: 0.35, width: 5 });
    fxCall('burst', m.x, m.y - 6, { count: lowQ() ? 4 : 10, colors: ['#ffb74d', '#fff3d6', '#ff80ab'], speed: [40, 160], life: [0.3, 0.6], size: [1.5, 3.5], shape: 'star', glow: true });
    sfx('spirit', { vol: 0.32, pitch: 1.3 });
    return true;
  }
  function atkMorgana(G, m, tg, nc, d, ang) {
    if (d > 320) return false;
    const dmg = cdmg(G, m);
    const p = G && G.player;
    if (nc.n % 4 === 3) {
      let healed = 0;
      queryE(G, m.x, m.y, 125, (e) => {
        if (!e || e.dead || e.passive) return;
        healed += hurt(e, dmg * 1.15, m, 200, e.x - m.x, e.y - m.y, 'shadow');
      });
      healEnt(m, max(4, healed * 0.15));
      if (p && !p.dead && healed > 0) healEnt(p, min(p.maxHp * 0.03, healed * 0.03));
      fxCall('ring', m.x, m.y, { radius: 125, color: '#ff1744', life: 0.45, width: 7, fill: true });
      fxCall('burst', m.x, m.y, { count: lowQ() ? 10 : 22, colors: ['#ff1744', '#b0123c', '#ffffff'], speed: [80, 260], life: [0.35, 0.7], size: [2, 4], glow: true });
      sfx('spirit', { vol: 0.4, pitch: 0.7 });
      return true;
    }
    const n = 3 + (m.spouse ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * 0.5;
      const ok = proj({
        x: m.x + cos(a) * m.r, y: m.y + sin(a) * m.r, vx: cos(a) * 300, vy: sin(a) * 300, r: 8, dmg: dmg * 0.7,
        team: 'player', element: 'shadow', kind: 'shadow', color: '#ff2a55', life: 1.7, homing: 4.5, pierce: 0, knock: 80, source: m,
        onHit: (pr) => {
          healEnt(m, (pr.dmg || 0) * 0.12);
          if (p && !p.dead && Math.random() < 0.35) healEnt(p, (pr.dmg || 0) * 0.04);
        },
      });
      if (!ok && i === 0) hurt(tg, dmg, m, 80, tg.x - m.x, tg.y - m.y, 'shadow');
    }
    fxCall('burst', m.x, m.y, { count: lowQ() ? 4 : 9, colors: ['#ff1744', '#2a0a18'], speed: [50, 160], life: [0.3, 0.6], size: [2, 3.5], angle: ang, spread: 1.6 });
    sfx('spirit', { vol: 0.28, pitch: 0.85 });
    return true;
  }
  function atkLyra(G, m, tg, nc, d, ang) {
    if (d > 420) return false;
    const dmg = cdmg(G, m);
    const volley = nc.n % 4 === 3;
    const n = volley ? 5 + (m.spouse ? 2 : 0) : 1 + (m.spouse ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * (volley ? 0.13 : 0.08);
      const ok = proj({
        x: m.x + cos(a) * m.r, y: m.y + sin(a) * m.r, vx: cos(a) * 820, vy: sin(a) * 820, r: 6, dmg: dmg * (volley ? 0.75 : 1),
        team: 'player', element: 'physical', kind: 'arrow', color: '#d4f59a', life: 0.75, pierce: 3, knock: 100, source: m, rot: a,
      });
      if (!ok && i === 0) hurt(tg, dmg, m, 100, tg.x - m.x, tg.y - m.y, 'physical');
    }
    if (volley) fxCall('ring', m.x + cos(ang) * 20, m.y + sin(ang) * 20, { radius: 34, color: '#d4f59a', life: 0.22, width: 3 });
    fxCall('spark', m.x + cos(ang) * m.r, m.y + sin(ang) * m.r, ang, { color: '#f1ffd6', life: 0.15 });
    sfx('needle', { vol: 0.3, pitch: volley ? 0.9 : 1.2 });
    return true;
  }
  function atkSelene(G, m, tg, nc, d, ang) {
    if (d > 360) return false;
    const dmg = cdmg(G, m);
    if (nc.n % 4 === 3) {
      let from = m, hits = 0;
      const done = [];
      for (let k = 0; k < 4 + (m.spouse ? 2 : 0); k++) {
        let best = null, bd = 270 * 270;
        queryE(G, from.x, from.y, 270, (e) => {
          if (!e || e.dead || e.passive || done.indexOf(e) >= 0) return;
          const dd = (e.x - from.x) * (e.x - from.x) + (e.y - from.y) * (e.y - from.y);
          if (dd < bd) { bd = dd; best = e; }
        });
        if (!best) break;
        done.push(best);
        fxCall('lightning', from.x, from.y, best.x, best.y, { color: '#c39bff', width: 3, life: 0.28, branches: 1 });
        hurt(best, dmg * 0.95, m, 90, best.x - from.x, best.y - from.y, 'void');
        from = best; hits++;
      }
      if (hits) sfx('thunder', { vol: 0.3, pitch: 1.3 });
      return hits > 0;
    }
    const ok = proj({
      x: m.x + cos(ang) * m.r, y: m.y + sin(ang) * m.r, vx: cos(ang) * 380, vy: sin(ang) * 380, r: 10, dmg,
      team: 'player', element: 'void', kind: 'dark', color: '#b388ff', life: 1.4, homing: 3, pierce: 0, knock: 120, source: m,
      onHit: (pr, e) => {
        queryE(G, pr.x, pr.y, 72, (e2) => {
          if (!e2 || e2 === e || e2.dead || e2.passive) return;
          hurt(e2, (pr.dmg || 0) * 0.5, m, 120, e2.x - pr.x, e2.y - pr.y, 'void');
        });
        fxCall('ring', pr.x, pr.y, { radius: 72, color: '#b388ff', life: 0.3, width: 5 });
        fxCall('burst', pr.x, pr.y, { count: lowQ() ? 5 : 12, colors: ['#b388ff', '#e1d4ff', '#7df9ff'], speed: [60, 200], life: [0.25, 0.5], size: [1.5, 3], shape: 'star', glow: true });
      },
    });
    if (!ok) hurt(tg, dmg, m, 120, tg.x - m.x, tg.y - m.y, 'void');
    fxCall('burst', m.x, m.y - m.r, { count: lowQ() ? 3 : 7, colors: ['#b388ff', '#7df9ff'], speed: [30, 120], life: [0.3, 0.6], size: [1.5, 3], shape: 'star', glow: true });
    sfx('spirit', { vol: 0.3, pitch: 1.5 });
    return true;
  }
  const ATTACKS = { aurelia: atkAurelia, nerissa: atkNerissa, kiara: atkKiara, morgana: atkMorgana, lyra: atkLyra, selene: atkSelene };

  function makeAttack(id, cd) {
    const fn = ATTACKS[id];
    return function (G, m, tg, dt) {
      const nc = m.nc || (m.nc = { cd: 0.4, n: 0, atkAt: -9 });
      nc.cd -= dt || 0;
      if (!tg || tg.dead || nc.cd > 0) return;
      const dx = tg.x - m.x, dy = tg.y - m.y;
      const d = hypot(dx, dy) || 1;
      const ang = atan2(dy, dx);
      if (!fn(G, m, tg, nc, d, ang)) return;
      nc.n++;
      nc.cd = cd * (0.9 + Math.random() * 0.2) * (m.spouse ? 0.9 : 1);
      nc.atkAt = m.t || 0;
      m.facing = ang;
      if (m.ai) { m.ai.flip = cos(ang) < 0 ? -1 : 1; m.ai.lockT = 0.25; m.ai.atk = 1; }
    };
  }

  /* ======================================================= public helpers */
  for (const comp of COMPANIONS) {
    const id = comp.id;
    comp.drawPortrait = function (ctx, x, y, size, t, mood, ex) { drawPortraitFor(id, ctx, x, y, size, t, mood, ex); };
  }
  function moodFor(c) {
    if (!c.unlocked) return 'idle';
    if (c.married) return 'love';
    if (c.affinity >= 7) return 'love';
    if (c.affinity >= 4) return 'happy';
    return 'idle';
  }
  function statusOf(c) {
    if (!c.unlocked) return { cls: 'lock', txt: 'Bloccata' };
    if (c.married) return { cls: 'wed', txt: 'Sposata 💍' };
    if (c.affinity >= 10) return { cls: 'fiance', txt: 'Fidanzata?' };
    if (c.affinity >= 7) return { cls: 'love', txt: 'Innamorata' };
    if (c.affinity >= 4) return { cls: 'friend', txt: 'Amica' };
    return { cls: 'known', txt: 'Conosciuta' };
  }
  function unlockText(comp) {
    if (comp.unlock.boss) return 'Sconfiggi ' + bossName(comp.unlock.boss);
    return 'Invitala per ' + comp.unlock.souls + ' Anime';
  }
  function compStats(c) {
    const a = c.affinity, sp = !!c.married;
    return {
      hp: Math.round((170 + a * 28) * (sp ? 1.3 : 1)),
      dmg: (11 + a * 2) * (sp ? 1.5 : 1),
      speed: 185 + a * 3,
    };
  }
  function rankInfo() {
    const n = nat();
    let sp = 0, un = 0;
    for (const comp of COMPANIONS) { const c = cst(comp.id); if (c.unlocked) un++; if (c.married) sp++; }
    const cit = n.citizens.length;
    const score = cit + un * 3 + sp * 6;
    const R = [[0, 'Accampamento'], [6, 'Villaggio'], [16, 'Borgo'], [30, 'Città'], [50, 'Regno'], [80, 'Impero Leggendario']];
    let name = R[0][1];
    for (const r of R) if (score >= r[0]) name = r[1];
    return { name, cit, sp, un };
  }

  /* ============================================================ run hooks */
  function onBossDefeated(boss) {
    const typeId = boss && typeof boss === 'object' ? boss.type : boss;
    if (!typeId) return;
    for (const comp of COMPANIONS) {
      if (comp.unlock.boss !== typeId) continue;
      const c = cst(comp.id);
      if (c.unlocked) continue;
      c.unlocked = true; c.isNew = true; c.seen = false;
      save();
      try { if (SK.UI && SK.UI.oracle) SK.UI.oracle(comp.name + ' si è unita alla tua Nazione!', { important: true }); } catch (e) { /* ui optional */ }
      try { if (SK.UI && SK.UI.toast) SK.UI.toast('💗 Nuova compagna: ' + comp.name, comp.color); } catch (e) { /* ui optional */ }
      sfx('name', { vol: 0.7 });
    }
  }
  function onNamed(name, typeId) {
    if (!name) return;
    const n = nat();
    n.citizens.push({ name: String(name).slice(0, 28), type: typeId || null });
    while (n.citizens.length > 60) n.citizens.shift();
    save();
  }
  function applyStat(p, st, stat, v) {
    if (stat === 'maxMp' || stat === 'mpMax') {
      if (typeof p.maxMp === 'number') { p.maxMp += v; p.mp = min(p.maxMp, (+p.mp || 0) + v); } else st.mpMax = (st.mpMax || 0) + v;
      return;
    }
    if (stat === 'cdr') { st.cdr = min(0.6, (+st.cdr || 0) + v); return; }
    const base = stat === 'dmg' || stat === 'speed' || stat === 'luck' ? 1 : 0;
    st[stat] = (typeof st[stat] === 'number' ? st[stat] : base) + v;
  }
  function applyBonuses(player) {
    if (!player) return;
    const st = player.stats || (player.stats = {});
    for (const comp of COMPANIONS) {
      const c = cst(comp.id);
      if (!c.married) continue;
      const b = comp.spouseBonus;
      applyStat(player, st, b.stat, b.value);
      if (b.extra) for (const x of b.extra) applyStat(player, st, x.stat, x.value);
    }
  }
  function runBonusesText() {
    const out = [];
    try {
      const n = nat();
      for (const comp of COMPANIONS) {
        const c = cst(comp.id);
        if (c.married) out.push('💍 ' + comp.name + ': ' + comp.spouseBonus.label);
      }
      const a = n.activeCompanion && BY_ID[n.activeCompanion];
      if (a) {
        const c = cst(a.id);
        if (c.unlocked && c.affinity >= 3) out.push('⚔ ' + a.name + ' combatte al tuo fianco (♥ ' + c.affinity + ')');
      }
    } catch (e) { /* save not ready */ }
    return out;
  }
  function spawnCompanions(G) {
    if (!G) return null;
    if (!Array.isArray(G.allies)) G.allies = [];
    for (let i = G.allies.length - 1; i >= 0; i--) if (G.allies[i] && G.allies[i].companion) G.allies.splice(i, 1);
    const n = nat();
    const comp = n.activeCompanion && BY_ID[n.activeCompanion];
    if (!comp) return null;
    const c = cst(comp.id);
    if (!c.unlocked || c.affinity < 3) return null;
    const st = compStats(c);
    const p = G.player || { x: 0, y: 0 };
    const a = Math.random() * TAU;
    const x = (p.x || 0) + cos(a) * 64, y = (p.y || 0) + sin(a) * 64;
    const id = comp.id;
    const def = {
      id: 'companion_' + id, name: comp.name, desc: comp.title, biome: 'cave',
      hp: st.hp, speed: st.speed, dmg: st.dmg, r: 17, mass: 2.2, xp: 0, essence: null, color: comp.color,
      behavior: 'chase', nameable: false, boss: false, souls: 0, orient: 'flip', range: comp.combat.range,
      allyName: c.married ? 'Consorte di ' + playerName() : comp.short, companion: true,
      draw: (ctx, m, t) => drawFighter(id, ctx, m, t),
      attack: makeAttack(id, comp.combat.cd),
    };
    const m = {
      id: U.uid(), type: 'companion_' + id, def, team: 'ally',
      x, y, vx: 0, vy: 0, r: 17, hp: st.hp, maxHp: st.hp, dmg: st.dmg, speed: st.speed, mass: 2.2,
      elite: false, boss: false, passive: false, nameable: false, name: comp.name, evolved: true,
      status: { slow: 0, slowAmt: 0, burn: 0, burnDps: 0, poison: 0, poisonDps: 0, stun: 0 },
      hitFlash: 0, knockX: 0, knockY: 0, t: 0, ai: {}, dead: false, xp: 0, essence: null, scale: 1,
      facing: 0, companion: true, compId: id, aff: c.affinity, spouse: c.married,
      nc: { cd: 0.6, n: 0, atkAt: -9 },
    };
    if (SK.World && typeof SK.World.clamp === 'function') { try { SK.World.clamp(m); } catch (e) { /* ignore */ } }
    G.allies.push(m);
    fxCall('beam', m.x, m.y, { color: comp.color, width: 54, height: 380, life: 1 });
    fxCall('ring', m.x, m.y, { radius: 80, color: comp.color, life: 0.5, width: 5 });
    fxCall('burst', m.x, m.y, { count: lowQ() ? 10 : 24, colors: [comp.color, '#ffffff', '#ff80ab'], speed: [60, 240], life: [0.4, 0.9], size: [2, 4], shape: 'star', glow: true });
    fxCall('text', m.x, m.y - 34, comp.name + ' si unisce alla battaglia!', { color: '#ffd6f5', size: 14, life: 1.6, rise: 30 });
    sfx('name', { vol: 0.5, pitch: 1.1 });
    return m;
  }

  /* ========================================================= scene paint */
  function rnd(i) { const x = sin(i * 127.1 + 311.7) * 43758.5453; return x - floor(x); }
  function paintStars(ctx, w, h, t, n, yMax, seed) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const x = rnd(i + seed) * w, y = rnd(i * 3.7 + seed + 9) * h * yMax;
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * sin(t * (1 + rnd(i + 50) * 2.4) + i));
      const s = 0.6 + rnd(i + 99) * 1.4;
      ctx.globalAlpha = tw * 0.9;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function paintMoon(ctx, x, y, r) {
    glowAt(ctx, x, y, r * 4.5, '#fff1c4', 0.32);
    ell(ctx, x, y, r, r, 0, '#fffbea');
    ell(ctx, x + r * 0.3, y - r * 0.2, r * 0.22, r * 0.18, 0, 'rgba(210,200,170,0.35)');
    ell(ctx, x - r * 0.35, y + r * 0.3, r * 0.16, r * 0.13, 0, 'rgba(210,200,170,0.3)');
  }
  function paintHills(ctx, w, h, baseY, amp, seed, color) {
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, baseY - rnd(seed) * amp);
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const x = (i / n) * w, y = baseY - rnd(i + seed) * amp;
      ctx.quadraticCurveTo(x - w / n / 2, y - amp * 0.35, x, y);
    }
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  function bgGrad(ctx, h, a, b, c) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, a); g.addColorStop(0.55, b); g.addColorStop(1, c);
    return g;
  }
  function paintLanterns(ctx, w, h, t, n, speed) {
    for (let i = 0; i < n; i++) {
      const sp = 0.035 + rnd(i + 7) * 0.05;
      const p = (t * sp * speed + rnd(i + 3)) % 1;
      const depth = 0.4 + rnd(i + 21) * 0.6;
      const x = rnd(i + 11) * w + sin(t * 0.6 + i) * 10 * depth;
      const y = h * 1.05 - p * h * 1.2;
      const s = 4 + depth * 7;
      const fl = 0.75 + 0.25 * sin(t * 7 + i * 3);
      glowAt(ctx, x, y, s * 3.2, '#ffab40', 0.45 * fl * depth);
      ctx.globalAlpha = 0.6 + depth * 0.4;
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.62, s * 0.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe0a3';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.15, s * 0.3, s * 0.42, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  const villageCache = { key: '', houses: null };
  function villageLayout(w) {
    const key = String(Math.round(w));
    if (villageCache.key === key) return villageCache.houses;
    const houses = [];
    let x = -10, i = 0;
    while (x < w + 20) {
      const hw = 26 + rnd(i * 2.3) * 34;
      houses.push({ x, w: hw, h: 0.18 + rnd(i * 5.1) * 0.22, roof: rnd(i + 0.7) > 0.4, win: 1 + floor(rnd(i * 9.9) * 3), ph: rnd(i) * 10 });
      x += hw + 2 + rnd(i * 1.7) * 14;
      i++;
    }
    villageCache.key = key; villageCache.houses = houses;
    return houses;
  }
  function paintVillage(ctx, w, h, t, baseY, scale, castle) {
    const H = villageLayout(w);
    ctx.fillStyle = '#0b0718';
    for (let i = 0; i < H.length; i++) {
      const b = H[i];
      const bh = b.h * scale * h;
      ctx.fillRect(b.x, baseY - bh, b.w, bh + 2);
      if (b.roof) { ctx.beginPath(); ctx.moveTo(b.x - 4, baseY - bh); ctx.lineTo(b.x + b.w / 2, baseY - bh - b.w * 0.45); ctx.lineTo(b.x + b.w + 4, baseY - bh); ctx.closePath(); ctx.fill(); }
    }
    if (castle) {
      const cx = w * 0.64, th = h * scale * 0.62;
      ctx.fillRect(cx - 12, baseY - th, 24, th);
      ctx.fillRect(cx - 30, baseY - th * 0.6, 60, th * 0.6);
      for (let k = -2; k <= 2; k++) ctx.fillRect(cx + k * 12 - 4, baseY - th * 0.6 - 7, 8, 7);
      ctx.beginPath(); ctx.moveTo(cx - 15, baseY - th); ctx.lineTo(cx, baseY - th - 22); ctx.lineTo(cx + 15, baseY - th); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#0b0718'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, baseY - th - 22); ctx.lineTo(cx, baseY - th - 36); ctx.stroke();
      ctx.fillStyle = '#ff4f8b';
      const f = sin(t * 4) * 2;
      ctx.beginPath(); ctx.moveTo(cx, baseY - th - 36); ctx.lineTo(cx + 13, baseY - th - 32 + f); ctx.lineTo(cx, baseY - th - 28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#0b0718';
    }
    for (let i = 0; i < H.length; i++) {
      const b = H[i];
      const bh = b.h * scale * h;
      for (let k = 0; k < b.win; k++) {
        const fl = 0.6 + 0.4 * sin(t * (2 + k) + b.ph);
        const wx = b.x + (k + 1) * b.w / (b.win + 1) - 2.5, wy = baseY - bh * 0.6;
        ctx.globalAlpha = fl;
        ctx.fillStyle = '#ffcf6b';
        ctx.fillRect(wx, wy, 5, 6);
        glowAt(ctx, wx + 2.5, wy + 3, 9, '#ffb74d', 0.35 * fl);
      }
    }
    ctx.globalAlpha = 1;
  }
  function paintPiazza(ctx, w, h, t) {
    ctx.fillStyle = bgGrad(ctx, h, '#120c34', '#3a1a55', '#7a3462');
    ctx.fillRect(0, 0, w, h);
    paintStars(ctx, w, h, t, lowQ() ? 30 : 60, 0.5, 3);
    paintMoon(ctx, w * 0.82, h * 0.18, h * 0.06);
    paintHills(ctx, w, h, h * 0.6, h * 0.1, 40, '#22143e');
    paintVillage(ctx, w, h, t, h * 0.74, 1.2, rankInfo().sp > 0);
    ctx.fillStyle = bgGrad(ctx, h, '#1c1030', '#140b22', '#0a0614');
    ctx.fillRect(0, h * 0.74, w, h * 0.26);
    paintLanterns(ctx, w, h * 0.8, t, lowQ() ? 6 : 12, 0.6);
  }
  function paintLago(ctx, w, h, t) {
    ctx.fillStyle = bgGrad(ctx, h * 0.6, '#060824', '#1b1650', '#3a2a6e');
    ctx.fillRect(0, 0, w, h * 0.6 + 2);
    paintStars(ctx, w, h, t, lowQ() ? 40 : 80, 0.55, 11);
    const mx = w * 0.7, my = h * 0.2, mr = h * 0.075;
    paintMoon(ctx, mx, my, mr);
    paintHills(ctx, w, h * 0.62, h * 0.58, h * 0.13, 5, '#150f35');
    paintHills(ctx, w, h * 0.62, h * 0.61, h * 0.06, 17, '#0c0922');
    const lg = ctx.createLinearGradient(0, h * 0.6, 0, h);
    lg.addColorStop(0, '#1d1a55'); lg.addColorStop(1, '#05041a');
    ctx.fillStyle = lg; ctx.fillRect(0, h * 0.6, w, h * 0.4);
    ctx.fillStyle = '#fff3c8';
    for (let i = 0; i < 16; i++) {
      const y = h * 0.62 + i * (h * 0.36 / 16);
      const ww = mr * 1.6 * (1 - i / 18) * (0.7 + 0.3 * sin(t * 3 + i * 1.7));
      ctx.globalAlpha = 0.45 * (1 - i / 17);
      ctx.fillRect(mx - ww / 2 + sin(t * 2 + i) * 3, y, ww, 2);
    }
    ctx.globalAlpha = 0.25; ctx.strokeStyle = '#9fb4ff'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const p = (t * 0.15 + i / 5) % 1;
      ctx.beginPath(); ctx.ellipse(w * (0.2 + 0.15 * i), h * 0.8, 20 + p * 60, (20 + p * 60) * 0.18, 0, 0, TAU);
      ctx.globalAlpha = 0.25 * (1 - p); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05040f';
    for (let i = 0; i < 9; i++) {
      const x = w * 0.02 + i * 9, hh = h * (0.12 + rnd(i + 70) * 0.1), sw = sin(t * 1.5 + i) * 3;
      ctx.beginPath(); ctx.moveTo(x, h); ctx.quadraticCurveTo(x + sw, h - hh * 0.5, x + sw * 1.6, h - hh); ctx.lineTo(x + 3, h); ctx.fill();
    }
    for (let i = 0; i < (lowQ() ? 6 : 14); i++) {
      const x = (rnd(i + 30) * w + sin(t * 0.5 + i) * 30) % w, y = h * (0.5 + rnd(i + 31) * 0.4) + sin(t * 0.8 + i * 2) * 14;
      const a = 0.5 + 0.5 * sin(t * 3 + i);
      glowAt(ctx, x, y, 10, '#d4ff7a', a * 0.7);
      ell(ctx, x, y, 1.4, 1.4, 0, '#f4ffd0');
    }
  }
  function paintTaverna(ctx, w, h, t) {
    ctx.fillStyle = bgGrad(ctx, h, '#3e2414', '#2a170c', '#160b05');
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    for (let i = 1; i < 14; i++) { const x = (i / 14) * w; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = '#1a0d06'; ctx.fillRect(0, h * 0.1, w, h * 0.05);
    const wx = w * 0.08, wy = h * 0.2, ww = w * 0.17, wh = h * 0.32;
    ctx.fillStyle = '#121845'; ctx.fillRect(wx, wy, ww, wh);
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    paintStars(ctx, ww, wh, t, 14, 1, 5);
    ctx.restore();
    ell(ctx, wx + ww * 0.7, wy + wh * 0.3, wh * 0.09, wh * 0.09, 0, '#fff8dc');
    ctx.strokeStyle = '#5a3420'; ctx.lineWidth = 5; ctx.strokeRect(wx, wy, ww, wh);
    ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    ctx.fillStyle = '#2a1509'; ctx.fillRect(w * 0.7, h * 0.3, w * 0.28, 6);
    const bc = ['#7cb342', '#c62828', '#5e35b1', '#ffb300', '#26a69a'];
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = bc[i % 5];
      const bx = w * 0.72 + i * w * 0.035, bh = h * (0.06 + rnd(i + 3) * 0.04);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(bx, h * 0.3 - bh, w * 0.018, bh);
      ctx.fillRect(bx + w * 0.006, h * 0.3 - bh - 6, w * 0.006, 6);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const lx = w * (0.38 + i * 0.22), ly = h * 0.22 + sin(t * 1.2 + i) * 2;
      const fl = 0.8 + 0.2 * sin(t * 9 + i * 4) + 0.1 * sin(t * 23 + i);
      ctx.strokeStyle = '#140a04'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, h * 0.15); ctx.lineTo(lx, ly - 10); ctx.stroke();
      glowAt(ctx, lx, ly, h * 0.22, '#ffa040', 0.4 * fl);
      ctx.fillStyle = '#3a210f'; ctx.fillRect(lx - 8, ly - 10, 16, 4);
      ctx.fillStyle = '#ffd27a'; ctx.globalAlpha = fl; ctx.fillRect(lx - 6, ly - 6, 12, 14); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = bgGrad(ctx, h, '#7a4a2a', '#5a3420', '#3a1f10');
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillStyle = '#9a6238'; ctx.fillRect(0, h * 0.8, w, 4);
    for (let i = 0; i < 2; i++) {
      const cx = w * (0.18 + i * 0.64), cy = h * 0.8;
      const fl = 0.85 + 0.15 * sin(t * 11 + i * 2);
      ctx.fillStyle = '#fff3e0'; ctx.fillRect(cx - 4, cy - 22, 8, 22);
      glowAt(ctx, cx, cy - 28, 40, '#ffb74d', 0.6 * fl);
      ctx.fillStyle = '#ffcc80'; ctx.beginPath(); ctx.ellipse(cx, cy - 28, 3 * fl, 6 * fl, 0, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < (lowQ() ? 6 : 16); i++) {
      const p = (t * 0.03 + rnd(i + 80)) % 1;
      const x = rnd(i + 81) * w + sin(t + i) * 10, y = h * (0.9 - p * 0.8);
      ctx.globalAlpha = 0.35 * sin(p * PI);
      ell(ctx, x, y, 1.2, 1.2, 0, '#ffe0b2');
    }
    ctx.globalAlpha = 1;
  }
  function paintAlba(ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    g.addColorStop(0, '#2b2a6b'); g.addColorStop(0.45, '#c2569a'); g.addColorStop(1, '#ffbf7a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    paintStars(ctx, w, h, t, 18, 0.2, 21);
    const sx = w * 0.5, sy = h * 0.66, sr = h * 0.13;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(t * 0.05);
    ctx.fillStyle = 'rgba(255,240,200,0.08)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-sr * 0.4, -h); ctx.lineTo(sr * 0.4, -h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    glowAt(ctx, sx, sy, sr * 4, '#ffd27a', 0.55);
    ell(ctx, sx, sy, sr, sr, 0, '#fff1c9');
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 5; i++) {
      const cx = ((rnd(i + 40) * w + t * 8 * (0.5 + rnd(i))) % (w + 200)) - 100, cy = h * (0.12 + rnd(i + 41) * 0.25);
      ell(ctx, cx, cy, 60, 12, 0, '#ffc2d9'); ell(ctx, cx + 30, cy - 6, 40, 10, 0, '#ffd9e6');
    }
    ctx.globalAlpha = 1;
    paintHills(ctx, w, h, h * 0.68, h * 0.1, 9, '#6a3460');
    paintHills(ctx, w, h, h * 0.76, h * 0.06, 33, '#3d1f45');
    ctx.fillStyle = bgGrad(ctx, h, '#2f4a24', '#22361a', '#142010');
    ctx.fillRect(0, h * 0.8, w, h * 0.2);
    ctx.fillStyle = '#1a1208';
    for (const dx of [0.14, 0.86]) {
      const x = w * dx, y = h * 0.82;
      ctx.fillRect(x - 3, y - h * 0.22, 6, h * 0.22);
      ctx.fillRect(x - 22, y - h * 0.16, 44, 6);
      ell(ctx, x, y - h * 0.25, 11, 11, 0, '#1a1208');
    }
    for (let i = 0; i < (lowQ() ? 8 : 20); i++) {
      const x = rnd(i + 60) * w, y = h * (0.82 + rnd(i + 61) * 0.16);
      star4(ctx, x, y, 2.4, '#fffbe0', clamp01(sin(t * 2 + i * 1.3)));
    }
    for (let i = 0; i < (lowQ() ? 6 : 14); i++) {
      const p = (t * 0.04 + rnd(i + 90)) % 1;
      const x = (rnd(i + 91) * w + t * 20) % w, y = h * (0.85 - p * 0.7) + sin(t * 2 + i) * 6;
      ctx.globalAlpha = 0.6 * sin(p * PI);
      ell(ctx, x, y, 2.4, 1.4, t + i, '#ffb3cf');
    }
    ctx.globalAlpha = 1;
  }
  function paintLanterne(ctx, w, h, t) {
    ctx.fillStyle = bgGrad(ctx, h, '#0a0626', '#2a0f45', '#5a1f4a');
    ctx.fillRect(0, 0, w, h);
    paintStars(ctx, w, h, t, lowQ() ? 30 : 70, 0.6, 51);
    paintLanterns(ctx, w, h, t, lowQ() ? 12 : 28, 1);
    paintVillage(ctx, w, h, t, h * 0.86, 1.4, false);
    ctx.fillStyle = '#0b0718'; ctx.fillRect(0, h * 0.86, w, h * 0.14);
    const cols = ['#ff4f8b', '#ffd54f', '#80d8ff', '#b388ff', '#69f0ae'];
    for (let s = 0; s < 2; s++) {
      const y0 = h * (0.5 + s * 0.12), sag = h * 0.06;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y0); ctx.quadraticCurveTo(w / 2, y0 + sag * 2, w, y0); ctx.stroke();
      for (let i = 0; i <= 18; i++) {
        const u = i / 18, x = u * w, y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * (y0 + sag * 2) + u * u * y0;
        const a = 0.6 + 0.4 * sin(t * 3 + i * 1.7 + s);
        const c = cols[(i + s) % 5];
        glowAt(ctx, x, y + 3, 9, c, a * 0.7);
        ell(ctx, x, y + 3, 2, 2.6, 0, c);
      }
    }
  }
  const PAINTERS = { piazza: paintPiazza, lago: paintLago, taverna: paintTaverna, alba: paintAlba, lanterne: paintLanterne };
  const LOC_TITLE = { piazza: 'La Piazza della Nazione', lago: 'Lago di Luna', taverna: 'Taverna “Il Goblin Allegro”', alba: "Campo d'addestramento all'alba", lanterne: 'Festival delle Lanterne' };

  function paintSky(ctx, w, h, t) {
    ctx.fillStyle = bgGrad(ctx, h, '#0b0a2a', '#271446', '#4a1f4f');
    ctx.fillRect(0, 0, w, h);
    paintStars(ctx, w, h, t, lowQ() ? 30 : 70, 0.8, 7);
    paintMoon(ctx, w * 0.86, h * 0.34, h * 0.17);
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#7cf3c8';
    ctx.beginPath(); ctx.moveTo(0, h * 0.35);
    for (let i = 0; i <= 8; i++) ctx.lineTo((i / 8) * w, h * (0.3 + 0.12 * sin(t * 0.4 + i * 0.9)));
    for (let i = 8; i >= 0; i--) ctx.lineTo((i / 8) * w, h * (0.42 + 0.1 * sin(t * 0.5 + i * 0.8)));
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    paintHills(ctx, w, h, h * 0.8, h * 0.18, 2, '#1a1033');
    paintVillage(ctx, w, h, t, h * 1.02, 1.1, rankInfo().sp > 0);
    paintLanterns(ctx, w, h, t, lowQ() ? 5 : 12, 1.4);
    ctx.fillStyle = 'rgba(5,4,14,0.35)';
    ctx.fillRect(0, 0, w * 0.55, h);
  }

  function drawPlayerPortrait(ctx, x, y, size, t) {
    const ch = data().character || {};
    try {
      if (SK.Character && typeof SK.Character.renderPortrait === 'function') {
        SK.Character.renderPortrait(ctx, x, y, size, ch.race || 'slime', ch.cls === 'pierfrancesco' ? 1 : 0, ch.color || '#4fc3ff', t);
        return;
      }
      if (SK.Slime && typeof SK.Slime.renderPortrait === 'function') {
        SK.Slime.renderPortrait(ctx, x, y, size, ch.cls === 'pierfrancesco' ? 1 : 0, t, { color: ch.color, crown: ch.cls === 'pierfrancesco' });
        return;
      }
    } catch (e) { /* fall through to simple blob */ }
    glowAt(ctx, x, y, size * 0.6, '#4fc3ff', 0.4);
    ell(ctx, x, y + size * 0.1, size * 0.32, size * 0.26, 0, ch.color || '#4fc3ff');
    ell(ctx, x - size * 0.1, y + size * 0.05, size * 0.04, size * 0.06, 0, '#0b1a2a');
    ell(ctx, x + size * 0.1, y + size * 0.05, size * 0.04, size * 0.06, 0, '#0b1a2a');
  }

  /* ================================================================ DOM UI */
  const ui = {
    open: false, root: null, els: {}, tab: 'compagne', view: 'hub', sel: null,
    anims: [], raf: 0, last: 0, t: 0, frame: 0,
    scene: null, vnOpen: false, vn: { comp: null, mood: 'idle', enter: 0, talk: false, pA: 0, spk: 'c', bg: 'piazza', veil: false },
    wed: null, wedScene: null, modalOpen: false, keyFn: null, lastLine: {},
    dMood: null, dMoodT: 0, dTalk: 0,
  };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function onTap(e, fn) {
    let last = 0;
    e.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const n = Date.now();
      if (n - last < 240) return;
      last = n;
      try { fn(ev); } catch (err) { console.error(err); }
    });
  }
  function cvDpr(maxD) {
    const q = SK.quality;
    let d = min(window.devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.5 : 2);
    if (maxD) d = min(d, maxD);
    return d;
  }
  function addAnim(cv, draw, opts) {
    const o = opts || NOEX;
    const a = { cv, ctx: cv.getContext('2d'), draw, w: 0, h: 0, dpr: 0, every: o.every || 1, isStatic: !!o.isStatic, maxDpr: o.maxDpr || 0, scope: o.scope || '', drawn: false };
    ui.anims.push(a);
    return a;
  }
  function measure(a) {
    const w = a.cv.clientWidth, h = a.cv.clientHeight, dpr = cvDpr(a.maxDpr);
    if (w !== a.w || h !== a.h || dpr !== a.dpr) {
      a.w = w; a.h = h; a.dpr = dpr;
      a.cv.width = max(1, Math.round(w * dpr)); a.cv.height = max(1, Math.round(h * dpr));
      a.drawn = false;
    }
  }
  function runAnims(dt) {
    const cover = ui.vnOpen || (ui.wed && ui.wed.open);
    for (let i = ui.anims.length - 1; i >= 0; i--) {
      const a = ui.anims[i];
      if (!a.cv.isConnected) { ui.anims.splice(i, 1); continue; }
      if ((a.scope === 'hub' && (ui.view !== 'hub' || cover)) || (a.scope === 'detail' && (ui.view !== 'detail' || cover)) ||
        (a.scope === 'top' && cover) || (a.scope === 'modal' && (!ui.modalOpen || cover)) ||
        (a.scope === 'vn' && !ui.vnOpen) || (a.scope === 'wed' && !(ui.wed && ui.wed.open))) continue;
      if (a.isStatic && a.drawn && ui.frame % 30 !== 0) continue;
      if (a.drawn && a.every > 1 && (ui.frame % a.every) !== 0) continue;
      if (!a.drawn || ui.frame % 20 === 0) measure(a);
      if (a.w < 2 || a.h < 2) continue;
      if (a.isStatic && a.drawn) continue;
      const ctx = a.ctx;
      ctx.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, a.w, a.h);
      try { a.draw(ctx, a.w, a.h, ui.t, dt); } catch (e) { if (!a.err) { a.err = true; console.error('[nation anim]', e); } }
      a.drawn = true;
    }
  }

  function frame(ts) {
    if (!ui.open) { ui.raf = 0; return; }
    const now = ts / 1000;
    let dt = ui.last ? now - ui.last : 1 / 60;
    ui.last = now;
    dt = clamp(dt, 0, 0.1);
    ui.t += dt; ui.frame++;
    if (SK.input) SK.input.enabled = false;
    if (ui.scene) ui.scene.update(dt);
    if (ui.wedScene) ui.wedScene.update(dt);
    if (ui.dMoodT > 0) { ui.dMoodT -= dt; if (ui.dMoodT <= 0) ui.dMood = null; }
    if (ui.dTalk > 0) ui.dTalk -= dt;
    if (ui.wed && ui.wed.open) updateWedding(dt);
    runAnims(dt);
    ui.raf = requestAnimationFrame(frame);
  }

  function toast(text, color) {
    const fx = ui.els.fx;
    if (!fx) return;
    const t = el('div', 'nt-toast', text);
    if (color) t.style.borderColor = color;
    fx.appendChild(t);
    const all = fx.querySelectorAll('.nt-toast');
    if (all.length > 3) all[0].remove();
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2600);
  }
  function rootRect() {
    const r = ui.root;
    return { w: r ? r.clientWidth : 800, h: r ? r.clientHeight : 400 };
  }
  function popHeart(n, x, y) {
    const fx = ui.els.fx;
    if (!fx) return;
    const p = el('div', 'nt-pop' + (n >= 3 ? ' big' : '') + (n <= 0 ? ' gray' : ''), n > 0 ? '+' + n + ' ♥' : '♡ ...');
    p.style.left = x + 'px'; p.style.top = y + 'px';
    fx.appendChild(p);
    setTimeout(() => p.remove(), 1600);
    const k = n > 0 ? (lowQ() ? 3 : 4 + n * 3) : 0;
    for (let i = 0; i < k; i++) {
      const m = el('div', 'nt-mini', '♥');
      m.style.left = (x + (Math.random() - 0.5) * 40) + 'px';
      m.style.top = (y + (Math.random() - 0.5) * 30) + 'px';
      m.style.setProperty('--dx', ((Math.random() - 0.5) * 220).toFixed(0) + 'px');
      m.style.setProperty('--dy', (-60 - Math.random() * 140).toFixed(0) + 'px');
      m.style.setProperty('--rot', ((Math.random() - 0.5) * 80).toFixed(0) + 'deg');
      m.style.fontSize = (0.8 + Math.random() * 0.9).toFixed(2) + 'em';
      m.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      fx.appendChild(m);
      setTimeout(() => m.remove(), 1600);
    }
  }
  function addAffinity(id, g) {
    const comp = BY_ID[id];
    const c = cst(id);
    const before = c.affinity;
    c.affinity = clamp(before + (g | 0), 0, 10);
    save();
    const real = c.affinity - before;
    if (real >= 2) sfx('name'); else if (real === 1) sfx('select'); else sfx('ui', { vol: 0.3, pitch: 0.8 });
    if (real > 0 && SK.vibrate) SK.vibrate(12);
    if (comp && before < 3 && c.affinity >= 3) setTimeout(() => toast('⚔ ' + comp.name + ' ora può seguirti in battaglia!', comp.color), 900);
    if (comp && before < 10 && c.affinity >= 10 && !c.married) setTimeout(() => toast('💍 ' + comp.name + ' è pronta per la proposta!', '#ffd54f'), 1300);
    return real;
  }
  function refreshTop(bump) {
    const E = ui.els;
    if (!E.souls) return;
    E.souls.textContent = U.fmtNum ? U.fmtNum(souls()) : String(souls());
    E.rings.textContent = String(nat().rings);
    const r = rankInfo();
    E.rank.textContent = '';
    E.rank.appendChild(document.createTextNode('Rango: '));
    E.rank.appendChild(el('b', null, r.name));
    E.rank.appendChild(document.createTextNode(' · ' + r.cit + ' cittadini · ' + r.sp + (r.sp === 1 ? ' sposa' : ' spose')));
    E.tabCit.textContent = String(r.cit);
    if (bump) {
      for (const p of [E.soulsPill, E.ringsPill]) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
    }
  }
  function heartsEl(aff, big, gold) {
    const d = el('div', 'nt-hearts' + (big ? ' big' : ''));
    for (let i = 0; i < 10; i++) d.appendChild(el('i', i < aff ? (gold ? 'on gold' : 'on') : null, '♥'));
    return d;
  }

  /* ------------------------------------------------------------ build */
  function buildRoot() {
    const root = el('div', 'nt-root q-' + (SK.quality || 'high'));
    root.id = 'nation';
    const E = ui.els = {};
    E.root = root;
    const top = el('div', 'nt-top');
    const sky = el('canvas', 'nt-sky');
    top.appendChild(sky);
    addAnim(sky, paintSky, { scope: 'top', maxDpr: 1.5, every: lowQ() ? 2 : 1 });
    const head = el('div', 'nt-head');
    const backB = el('button', 'nt-back', '‹');
    backB.type = 'button';
    backB.setAttribute('aria-label', 'Indietro');
    onTap(backB, () => { if (!back()) { sfx('uiBack'); close(); } });
    const titles = el('div', 'nt-titles');
    titles.appendChild(el('h1', null, 'La Tua Nazione'));
    E.rank = el('div', 'nt-rank');
    titles.appendChild(E.rank);
    const pills = el('div', 'nt-pills');
    E.soulsPill = el('div', 'nt-pill');
    const si = el('i', null, '✦'); si.style.color = '#d7c2ff';
    E.souls = el('span', null, '0');
    E.soulsPill.appendChild(si); E.soulsPill.appendChild(E.souls);
    E.ringsPill = el('div', 'nt-pill ring');
    E.ringsPill.appendChild(el('i', null, '💍'));
    E.rings = el('span', null, '0');
    E.ringsPill.appendChild(E.rings);
    pills.appendChild(E.soulsPill); pills.appendChild(E.ringsPill);
    head.appendChild(backB); head.appendChild(titles); head.appendChild(pills);
    top.appendChild(head);
    root.appendChild(top);

    const tabs = el('div', 'nt-tabs');
    E.tabs = {};
    const mk = (id, label) => {
      const b = el('button', 'nt-tab', label);
      b.type = 'button';
      onTap(b, () => {
        if (ui.view === 'detail') closeDetail(true);
        if (ui.tab === id) return;
        sfx('ui'); ui.tab = id; renderTab();
      });
      E.tabs[id] = b; tabs.appendChild(b);
      return b;
    };
    mk('compagne', 'Compagne');
    const cb = mk('cittadini', 'Cittadini');
    E.tabCit = el('b', null, '0'); cb.appendChild(E.tabCit);
    mk('bonus', 'Bonus');
    root.appendChild(tabs);

    const main = el('div', 'nt-main');
    E.hub = el('div', 'nt-view nt-hub');
    E.detail = el('div', 'nt-view nt-detail hidden');
    main.appendChild(E.hub); main.appendChild(E.detail);
    root.appendChild(main);

    // modal
    E.modal = el('div', 'nt-modal');
    onTap(E.modal, (ev) => { if (ev.target === E.modal) { sfx('uiBack'); closeModal(); } });
    root.appendChild(E.modal);

    // visual novel overlay
    const vn = E.vn = el('div', 'nt-vn');
    const vbg = el('canvas', 'nt-vnbg');
    vn.appendChild(vbg);
    addAnim(vbg, drawVnBg, { scope: 'vn', maxDpr: 1.25 });
    const vport = el('canvas', 'nt-vnport');
    vn.appendChild(vport);
    addAnim(vport, drawVnPortrait, { scope: 'vn', maxDpr: 1.75 });
    E.vnLoc = el('div', 'nt-vnloc', '');
    vn.appendChild(E.vnLoc);
    const skip = el('button', 'nt-vnskip', 'Avanti veloce ⏩');
    skip.type = 'button';
    onTap(skip, () => { if (ui.scene) ui.scene.skip(); });
    vn.appendChild(skip);
    E.vnChoices = el('div', 'nt-choices');
    vn.appendChild(E.vnChoices);
    const box = el('div', 'nt-vnbox');
    E.vnName = el('div', 'nt-vnname', '');
    E.vnText = el('div', 'nt-vntext', '');
    E.vnNext = el('div', 'nt-vnnext', '▼');
    box.appendChild(E.vnName); box.appendChild(E.vnText); box.appendChild(E.vnNext);
    vn.appendChild(box);
    vn.addEventListener('click', () => { if (ui.scene) ui.scene.tap(); });
    root.appendChild(vn);

    // wedding overlay
    const wd = E.wed = el('div', 'nt-wed');
    const wcv = el('canvas', 'nt-wedcv');
    wd.appendChild(wcv);
    addAnim(wcv, drawWedding, { scope: 'wed', maxDpr: 1.25 });
    E.wedBan = el('div', 'nt-wedban', 'Sposati!');
    E.wedSub = el('div', 'nt-wedsub', '');
    wd.appendChild(E.wedBan); wd.appendChild(E.wedSub);
    E.wedChoices = el('div', 'nt-choices');
    wd.appendChild(E.wedChoices);
    const wbox = el('div', 'nt-vnbox');
    E.wedName = el('div', 'nt-vnname', '');
    E.wedText = el('div', 'nt-vntext', '');
    E.wedNext = el('div', 'nt-vnnext', '▼');
    wbox.appendChild(E.wedName); wbox.appendChild(E.wedText); wbox.appendChild(E.wedNext);
    wd.appendChild(wbox);
    wd.addEventListener('click', () => { if (ui.wedScene) ui.wedScene.tap(); });
    root.appendChild(wd);

    E.fx = el('div', 'nt-fx');
    root.appendChild(E.fx);
    ui.root = root;
  }

  /* ------------------------------------------------------------- hub tabs */
  function renderTab() {
    const E = ui.els;
    if (!E.hub) return;
    for (const k in E.tabs) E.tabs[k].classList.toggle('on', k === ui.tab);
    E.hub.textContent = '';
    E.hub.scrollTop = 0;
    if (ui.tab === 'compagne') renderCompanions(E.hub);
    else if (ui.tab === 'cittadini') renderCitizens(E.hub);
    else renderBonus(E.hub);
    refreshTop();
  }
  function drawCardPortrait(comp, idx) {
    return (ctx, w, h, t) => {
      const c = cst(comp.id);
      const s = min(w, h);
      comp.drawPortrait(ctx, w / 2, h / 2 + s * 0.06, s * 1.08, t + idx * 1.7, moodFor(c));
      if (!c.unlocked) {
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(14,9,28,0.92)';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,214,232,0.8)';
        ctx.font = 'bold ' + Math.round(s * 0.36) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', w / 2, h / 2 + s * 0.02);
      }
    };
  }
  function renderCompanions(host) {
    const grid = el('div', 'nt-grid');
    COMPANIONS.forEach((comp, i) => {
      const c = cst(comp.id);
      const card = el('div', 'nt-card' + (c.unlocked ? '' : ' locked') + (c.married ? ' married' : ''));
      card.style.setProperty('--cc', comp.color);
      card.style.animationDelay = (i * 0.05).toFixed(2) + 's';
      const cv = el('canvas', 'nt-pcv');
      card.appendChild(cv);
      addAnim(cv, drawCardPortrait(comp, i), { scope: 'hub', every: lowQ() ? 3 : 1, maxDpr: 2 });
      const info = el('div', 'nt-info');
      const nm = el('div', 'nt-name', c.unlocked ? comp.name : '???');
      if (c.unlocked) nm.style.color = U.mix(comp.color, '#ffffff', 0.45);
      info.appendChild(nm);
      info.appendChild(el('div', 'nt-sub', comp.race + ' · ' + comp.title));
      info.appendChild(heartsEl(c.affinity, false, c.married));
      const tags = el('div', 'nt-tagrow');
      const s = statusOf(c);
      tags.appendChild(el('span', 'nt-tag ' + s.cls, s.txt));
      if (c.isNew) tags.appendChild(el('span', 'nt-tag new', 'Nuova!'));
      if (nat().activeCompanion === comp.id && c.unlocked) tags.appendChild(el('span', 'nt-tag fight', '⚔ In battaglia'));
      info.appendChild(tags);
      if (!c.unlocked) info.appendChild(el('div', 'nt-lockhint', '🔒 ' + unlockText(comp)));
      card.appendChild(info);
      onTap(card, () => { sfx('select'); openDetail(comp.id); });
      grid.appendChild(card);
    });
    host.appendChild(grid);
  }
  function renderCitizens(host) {
    const n = nat();
    if (!n.citizens.length) {
      const e = el('div', 'nt-empty');
      e.appendChild(el('b', null, 'Nessun cittadino, per ora.'));
      e.appendChild(el('div', null, 'Durante le spedizioni, avvicinati ai mostri erranti e usa il tasto “Nome”: chi riceve un nome giura fedeltà e si trasferisce nella tua Nazione.'));
      host.appendChild(e);
      return;
    }
    const sec = el('div', 'nt-sec');
    sec.appendChild(el('h3', null, 'Cittadini della Nazione · ' + n.citizens.length + '/60'));
    sec.appendChild(el('p', null, 'Ogni mostro a cui hai dato un nome vive qui, lavora nei campi e racconta le tue imprese alla taverna.'));
    host.appendChild(sec);
    const grid = el('div', 'nt-cits');
    const list = n.citizens.slice().reverse();
    list.forEach((cz, i) => {
      const row = el('div', 'nt-cit');
      row.style.animationDelay = min(0.6, i * 0.03).toFixed(2) + 's';
      const cv = el('canvas');
      row.appendChild(cv);
      const type = cz.type;
      addAnim(cv, (ctx, w, h, t) => {
        let ok = false;
        try {
          if (type && SK.Enemies && typeof SK.Enemies.renderPortrait === 'function') { SK.Enemies.renderPortrait(ctx, type, w / 2, h / 2, min(w, h) * 0.92, 0); ok = true; }
        } catch (e) { ok = false; }
        if (!ok) { glowAt(ctx, w / 2, h / 2, w * 0.5, '#69f0ae', 0.5); ell(ctx, w / 2, h / 2 + 3, w * 0.3, h * 0.24, 0, '#69f0ae'); }
      }, { scope: 'hub', isStatic: true, maxDpr: 2 });
      const txt = el('div');
      txt.appendChild(el('div', 'nt-name', cz.name || '???'));
      let tn = '';
      try { const d = type && SK.Enemies && SK.Enemies.types && SK.Enemies.types[type]; tn = d ? (d.allyName || d.name || '') : ''; } catch (e) { tn = ''; }
      txt.appendChild(el('div', 'nt-sub', tn || 'Cittadino'));
      row.appendChild(txt);
      grid.appendChild(row);
    });
    host.appendChild(grid);
  }
  function renderBonus(host) {
    const n = nat();
    const sec = el('div', 'nt-sec');
    sec.appendChild(el('h3', null, '💍 Bonus nuziali'));
    sec.appendChild(el('p', null, 'Ogni compagna sposata ti dona un bonus permanente, applicato all\'inizio di ogni spedizione. I matrimoni multipli sono permessi: i bonus si sommano!'));
    COMPANIONS.forEach((comp) => {
      const c = cst(comp.id);
      const row = el('div', 'nt-bonus' + (c.married ? ' on' : ''));
      const cv = el('canvas');
      row.appendChild(cv);
      addAnim(cv, (ctx, w, h, t) => {
        comp.drawPortrait(ctx, w / 2, h / 2 + 3, min(w, h) * 1.1, t, c.married ? 'love' : 'idle');
        if (!c.unlocked) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(14,9,28,0.9)'; ctx.fillRect(0, 0, w, h); ctx.restore(); }
      }, { scope: 'hub', every: 3, maxDpr: 2 });
      const txt = el('div', 'txt');
      txt.appendChild(el('b', null, (c.unlocked ? comp.name : '???') + ' — ' + comp.spouseBonus.label));
      txt.appendChild(el('small', null, c.married ? 'Attivo in ogni spedizione.' : c.unlocked ? 'Sposala per ottenerlo (10 ♥ e un Anello di Magicule).' : unlockText(comp) + ' per conoscerla.'));
      row.appendChild(txt);
      row.appendChild(el('span', 'st ' + (c.married ? 'on' : 'off'), c.married ? 'ATTIVO' : 'INATTIVO'));
      sec.appendChild(row);
    });
    host.appendChild(sec);
    const sec2 = el('div', 'nt-sec');
    sec2.appendChild(el('h3', null, '⚔ Compagna in battaglia'));
    const a = n.activeCompanion && BY_ID[n.activeCompanion];
    if (a && cst(a.id).unlocked) {
      const c = cst(a.id), st = compStats(c);
      sec2.appendChild(el('p', null, a.name + ' ti seguirà nella prossima spedizione (♥ ' + c.affinity + '). Vita ' + st.hp + ' · Danno base ' + Math.round(st.dmg) + (c.married ? ' · Bonus sposa: danno ×1,5' : '') + '. Più affinità avete, più è forte.'));
    } else {
      sec2.appendChild(el('p', null, 'Nessuna compagna scelta. Apri la scheda di una compagna con almeno 3 ♥ e tocca “Porta in battaglia”.'));
    }
    host.appendChild(sec2);
    const lines = runBonusesText();
    const sec3 = el('div', 'nt-sec');
    sec3.appendChild(el('h3', null, '✦ Riepilogo per la prossima spedizione'));
    if (!lines.length) sec3.appendChild(el('p', null, 'Nessun bonus attivo. Conquista il cuore delle tue compagne!'));
    for (const l of lines) sec3.appendChild(el('p', null, l));
    host.appendChild(sec3);
  }

  /* --------------------------------------------------------------- detail */
  function openDetail(id) {
    const E = ui.els;
    ui.sel = id; ui.view = 'detail'; ui.dMood = null; ui.dMoodT = 0; ui.dTalk = 0;
    buildDetail();
    E.hub.classList.add('hidden');
    E.detail.classList.remove('hidden');
    E.detail.scrollTop = 0;
    const c = cst(id);
    if (c.unlocked && !c.seen) {
      c.seen = true; c.isNew = false; save();
      setTimeout(() => runMeet(id), 350);
    } else if (c.isNew) { c.isNew = false; save(); }
  }
  function closeDetail(silent) {
    const E = ui.els;
    ui.view = 'hub'; ui.sel = null;
    E.detail.classList.add('hidden');
    E.hub.classList.remove('hidden');
    if (!silent) renderTab();
  }
  function baseLines(comp, c) {
    const L = comp.lines;
    return c.married ? L.married : c.affinity >= 7 ? L.t2 : c.affinity >= 4 ? L.t1 : L.t0;
  }
  function pickLine(id, pool) {
    if (!pool || !pool.length) return '';
    let s = pick(pool), k = 0;
    while (pool.length > 1 && s === ui.lastLine[id] && k++ < 6) s = pick(pool);
    ui.lastLine[id] = s;
    return s;
  }
  function parseLine(raw, ctx) {
    let s = String(raw), spk = 'c', who = null, mood = null;
    if (s.startsWith('n:')) { spk = 'n'; s = s.slice(2); }
    else if (s.startsWith('p:')) { spk = 'p'; s = s.slice(2); }
    else {
      const mm = /^@(\w+):/.exec(s);
      if (mm) { spk = 'o'; who = mm[1]; s = s.slice(mm[0].length); }
    }
    const md = /^\[(\w+)\]/.exec(s);
    if (md) { mood = md[1]; s = s.slice(md[0].length); }
    return { spk, who, mood, txt: fmt(s.trim(), ctx) };
  }
  function setBubble(raw) {
    const E = ui.els;
    if (!E.dBubble || !ui.sel) return;
    const comp = BY_ID[ui.sel];
    const L = parseLine(raw, { C: comp.name });
    const b = el('div', 'nt-bubble', L.txt);
    E.dBubble.replaceWith(b);
    E.dBubble = b;
    ui.dMood = L.mood || null; ui.dMoodT = 4;
    ui.dTalk = min(2.4, L.txt.length * 0.028);
  }
  function buildDetail() {
    const E = ui.els, id = ui.sel, comp = BY_ID[id];
    if (!comp) return;
    const c = cst(id);
    E.detail.textContent = '';
    const inner = el('div', 'nt-detail-in');
    const left = el('div', 'nt-dleft');
    const cv = el('canvas', 'nt-dport');
    left.appendChild(cv);
    addAnim(cv, (ctx, w, h, t) => {
      const cc = cst(id);
      const s = min(w, h);
      const mood = ui.dMood || moodFor(cc);
      comp.drawPortrait(ctx, w / 2, h / 2 + s * 0.04, s * 1.02, t, mood, { talk: ui.dTalk > 0 && cc.unlocked });
      if (!cc.unlocked) {
        ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(14,9,28,0.92)'; ctx.fillRect(0, 0, w, h); ctx.restore();
        ctx.fillStyle = 'rgba(255,214,232,0.8)'; ctx.font = 'bold ' + Math.round(s * 0.3) + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', w / 2, h / 2);
      }
    }, { scope: 'detail', maxDpr: 2 });
    onTap(cv, (ev) => {
      const cc = cst(id);
      if (!cc.unlocked) { sfx('uiBack'); return; }
      sfx('select', { pitch: 1.2 });
      setBubble(pickLine(id + ':poke', comp.lines.poke));
      const r = cv.getBoundingClientRect(), rr = ui.root.getBoundingClientRect();
      const x = (ev.clientX || r.left + r.width / 2) - rr.left, y = (ev.clientY || r.top + r.height / 2) - rr.top;
      for (let i = 0; i < (lowQ() ? 3 : 6); i++) {
        const m = el('div', 'nt-mini', '♥');
        m.style.left = x + 'px'; m.style.top = y + 'px';
        m.style.setProperty('--dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
        m.style.setProperty('--dy', (-40 - Math.random() * 80).toFixed(0) + 'px');
        ui.els.fx.appendChild(m);
        setTimeout(() => m.remove(), 1300);
      }
    });
    E.dHearts = el('div');
    left.appendChild(E.dHearts);
    E.dTags = el('div', 'nt-tagrow');
    E.dTags.style.justifyContent = 'center';
    left.appendChild(E.dTags);
    inner.appendChild(left);

    const right = el('div', 'nt-dright');
    const nm = el('div', 'nt-dname', c.unlocked ? comp.name : '???');
    nm.style.color = U.mix(comp.color, '#ffffff', 0.4);
    right.appendChild(nm);
    right.appendChild(el('div', 'nt-dtitle', comp.title));
    const meta = el('div', 'nt-meta');
    const addMeta = (k, v) => { const s = el('span'); s.appendChild(document.createTextNode(k + ' ')); s.appendChild(el('b', null, v)); meta.appendChild(s); };
    addMeta('Razza:', comp.race);
    addMeta('Bonus nuziale:', comp.spouseBonus.label);
    if (c.unlocked) {
      const known = [];
      if (c.affinity >= 6) known.push(GIFT_BY_ID[comp.likes[0]].name + ' ★');
      if (c.affinity >= 3) for (let i = 1; i < comp.likes.length; i++) known.push(GIFT_BY_ID[comp.likes[i]].name);
      addMeta('Le piace:', known.length ? known.join(', ') : '??? (aumenta l\'affinità per scoprirlo)');
      addMeta('Appuntamenti:', String(c.dates));
    }
    right.appendChild(meta);
    right.appendChild(el('p', 'nt-bio', c.unlocked ? comp.bio : 'Una figura misteriosa di cui si sa ancora poco. ' + unlockText(comp) + ' per incontrarla.'));
    E.dBubble = el('div', 'nt-bubble', '');
    E.dBubble.style.display = 'none';
    right.appendChild(E.dBubble);
    E.dActions = el('div', 'nt-actions');
    right.appendChild(E.dActions);
    inner.appendChild(right);
    E.detail.appendChild(inner);
    refreshDetail();
    if (c.unlocked && c.seen) setBubble(pickLine(id, baseLines(comp, c)));
  }
  function act(label, sub, cls, fn, disabledReason) {
    const b = el('button', 'nt-act' + (cls ? ' ' + cls : '') + (disabledReason ? ' dis' : ''));
    b.type = 'button';
    b.appendChild(el('b', null, label));
    if (sub) b.appendChild(el('small', null, sub));
    onTap(b, () => {
      if (disabledReason) { sfx('uiBack'); toast(disabledReason); return; }
      fn();
    });
    return b;
  }
  function refreshDetail() {
    const E = ui.els, id = ui.sel, comp = BY_ID[id];
    if (!comp || ui.view !== 'detail' || !E.dActions) return;
    const c = cst(id), n = nat(), run = runId();
    E.dHearts.textContent = '';
    E.dHearts.appendChild(heartsEl(c.affinity, true, c.married));
    E.dTags.textContent = '';
    const s = statusOf(c);
    E.dTags.appendChild(el('span', 'nt-tag ' + s.cls, s.txt));
    if (n.activeCompanion === id && c.unlocked) E.dTags.appendChild(el('span', 'nt-tag fight', '⚔ In battaglia'));
    const A = E.dActions;
    A.textContent = '';
    if (!c.unlocked) {
      if (comp.unlock.souls) {
        const cost = comp.unlock.souls;
        A.appendChild(act('Invita nella Nazione', 'Costo: ' + cost + ' Anime', 'gold', () => {
          confirmBox('Invitare ' + comp.name + '?', 'Spenderai ' + cost + ' Anime per invitare ' + comp.name + ' a vivere nella tua Nazione.', 'Invita', () => {
            if (!spendSouls(cost)) { toast('Anime insufficienti', '#ff8a80'); sfx('uiBack'); return; }
            c.unlocked = true; c.seen = true; c.isNew = false; save();
            sfx('chest'); refreshTop(true); buildDetail();
            setTimeout(() => runMeet(id), 250);
          });
        }, souls() < cost ? 'Ti servono ' + cost + ' Anime (ne hai ' + souls() + ').' : null));
      } else {
        A.appendChild(act('🔒 ' + unlockText(comp), 'Si unirà a te quando sarà libera', null, () => {}, 'Sconfiggi ' + bossName(comp.unlock.boss) + ' durante una spedizione.'));
      }
      return;
    }
    const free = c.talkedRun !== run && !c.married && c.affinity < 10;
    A.appendChild(act('💬 Parla', free ? '+1 ♥ (una volta per spedizione)' : 'Chiacchiera in compagnia', null, () => doTalk(id)));
    A.appendChild(act('🎁 Regalo', 'Dona un regalo con le Anime', null, () => openGiftModal(id)));
    const dated = c.datedRun === run;
    A.appendChild(act('🌙 Appuntamento', dated ? 'Già fatto in questa spedizione' : 'Da ' + DATES[0].cost + ' Anime', null, () => openDateModal(id),
      dated ? 'Avete già avuto un appuntamento in questa spedizione. Torna dopo la prossima avventura!' : null));
    const active = n.activeCompanion === id;
    A.appendChild(act(active ? '⚔ In battaglia' : '⚔ Porta in battaglia', active ? 'Tocca per ritirarla' : c.affinity >= 3 ? 'Combatterà al tuo fianco' : 'Richiede 3 ♥', 'fight' + (active ? ' on' : ''),
      () => toggleBattle(id), c.affinity < 3 ? 'Serve almeno 3 ♥ di affinità.' : null));
    if (!c.married) {
      A.appendChild(act('💍 Compra Anello', RING_COST + ' Anime · Anelli: ' + n.rings, 'gold', () => buyRing(),
        souls() < RING_COST ? 'Ti servono ' + RING_COST + ' Anime (ne hai ' + souls() + ').' : null));
      const ready = c.affinity >= 10 && n.rings > 0;
      A.appendChild(act('💗 Proponi', '10 ♥ + 1 Anello di Magicule', ready ? 'love' : null, () => propose(id),
        c.affinity < 10 ? 'Serve il massimo dell\'affinità (10 ♥).' : n.rings < 1 ? 'Ti serve un Anello di Magicule.' : null));
    } else {
      A.appendChild(act('💍 Sposata', 'Bonus attivo: ' + comp.spouseBonus.label, 'gold', () => { setBubble(pickLine(id, comp.lines.married)); sfx('select'); }));
    }
  }

  /* -------------------------------------------------------------- modal */
  function openModal(title, buildBody, footer) {
    const E = ui.els;
    E.modal.textContent = '';
    const box = el('div', 'nt-mbox');
    const hd = el('div', 'nt-mhead');
    hd.appendChild(el('h2', null, title));
    const x = el('button', 'nt-btn ghost', '✕');
    x.type = 'button';
    onTap(x, () => { sfx('uiBack'); closeModal(); });
    hd.appendChild(x);
    box.appendChild(hd);
    buildBody(box);
    if (footer) box.appendChild(footer);
    E.modal.appendChild(box);
    ui.modalOpen = true;
    void E.modal.offsetWidth;
    E.modal.classList.add('on');
  }
  function closeModal() {
    const E = ui.els;
    if (!E.modal) return;
    ui.modalOpen = false;
    E.modal.classList.remove('on');
    const m = E.modal;
    setTimeout(() => { if (!ui.modalOpen) m.textContent = ''; }, 260);
  }
  function confirmBox(title, text, yes, onYes) {
    const foot = el('div', 'nt-mfoot');
    const no = el('button', 'nt-btn ghost', 'Annulla');
    no.type = 'button';
    onTap(no, () => { sfx('uiBack'); closeModal(); });
    const ok = el('button', 'nt-btn gold', yes);
    ok.type = 'button';
    onTap(ok, () => { closeModal(); onYes(); });
    foot.appendChild(no); foot.appendChild(ok);
    openModal(title, (box) => { const d = el('div', 'nt-confirm'); d.appendChild(el('p', null, text)); box.appendChild(d); }, foot);
  }
  function openGiftModal(id) {
    const comp = BY_ID[id], c = cst(id);
    sfx('ui');
    openModal('Regalo per ' + comp.name + ' · ✦ ' + souls(), (box) => {
      const list = el('div', 'nt-mlist');
      for (const g of GIFTS) {
        const fav = comp.likes[0] === g.id, liked = comp.likes.indexOf(g.id) > 0;
        const reveal = (fav && c.affinity >= 6) || (liked && c.affinity >= 3);
        const b = el('button', 'nt-gift' + (souls() < g.cost ? ' poor' : '') + (reveal ? ' fav' : ''));
        b.type = 'button';
        const cv = el('canvas');
        b.appendChild(cv);
        const gid = g.id;
        addAnim(cv, (ctx, w, h, t) => drawGiftIcon(ctx, gid, w / 2, h / 2, min(w, h), t), { scope: 'modal', every: 2, maxDpr: 2 });
        const txt = el('div', 'txt');
        txt.appendChild(el('b', null, g.name + (reveal ? (fav ? ' ★' : ' ♥') : '')));
        txt.appendChild(el('small', null, g.desc));
        b.appendChild(txt);
        b.appendChild(el('span', 'cost', '✦ ' + g.cost));
        onTap(b, () => giveGift(id, g));
        list.appendChild(b);
      }
      box.appendChild(list);
    });
  }
  function giveGift(id, g) {
    const comp = BY_ID[id], c = cst(id);
    if (!spendSouls(g.cost)) { sfx('uiBack'); toast('Anime insufficienti', '#ff8a80'); return; }
    closeModal();
    c.gifts++; save();
    refreshTop(true);
    sfx('coin');
    const tier = comp.likes[0] === g.id ? 'love' : comp.likes.indexOf(g.id) > 0 ? 'like' : 'ok';
    const gain = tier === 'love' ? 3 : tier === 'like' ? 2 : 1;
    const steps = ['n:Doni a ' + comp.name + ': ' + g.name + '.', pickLine(id + ':g' + tier, comp.lines.gift[tier])];
    if (c.affinity < 10) steps.push({ gain });
    else if (!c.married) steps.push('n:Il suo cuore è già tutto tuo. Forse è il momento di un anello...');
    runScene(id, 'piazza', steps, () => refreshDetail());
  }
  function openDateModal(id) {
    const comp = BY_ID[id], c = cst(id);
    sfx('ui');
    openModal('Appuntamento con ' + comp.name, (box) => {
      const list = el('div', 'nt-mlist nt-dates');
      for (const d of DATES) {
        const lock = c.affinity < d.req;
        const b = el('button', 'nt-date' + (lock ? ' lock' : '') + (c.datesDone[d.id] ? ' done' : ''));
        b.type = 'button';
        const cv = el('canvas');
        b.appendChild(cv);
        const painter = PAINTERS[d.id];
        addAnim(cv, (ctx, w, h, t) => painter(ctx, w, h, t), { scope: 'modal', every: 2, maxDpr: 1.25 });
        const txt = el('div', 'txt');
        txt.appendChild(el('b', null, d.name + (c.datesDone[d.id] ? '  ✓×' + c.datesDone[d.id] : '')));
        txt.appendChild(el('small', null, (lock ? '🔒 Richiede ' + d.req + ' ♥ · ' : '') + d.desc + ' · ✦ ' + d.cost));
        b.appendChild(txt);
        onTap(b, () => {
          if (lock) { sfx('uiBack'); toast('Serve più affinità: ' + d.req + ' ♥'); return; }
          if (souls() < d.cost) { sfx('uiBack'); toast('Anime insufficienti', '#ff8a80'); return; }
          startDate(id, d);
        });
        list.appendChild(b);
      }
      box.appendChild(list);
    });
  }
  function startDate(id, d) {
    const comp = BY_ID[id], c = cst(id);
    if (!spendSouls(d.cost)) return;
    closeModal();
    c.datedRun = runId(); c.dates++; c.datesDone[d.id] = (c.datesDone[d.id] || 0) + 1;
    save();
    refreshTop(true);
    const D = comp.dates[d.id];
    const steps = D.intro.slice();
    steps.push(D.ask);
    steps.push({ choices: D.choices });
    runScene(id, d.id, steps, () => refreshDetail(), (ch) => {
      const g = ch.g | 0;
      return [g >= 3 ? 'n:' + comp.name + ' ti sorride come mai prima d\'ora. Il cuore batte forte a entrambi.'
        : g >= 2 ? 'n:È stato un momento speciale. ' + comp.name + ' sembra davvero felice.'
          : g >= 1 ? 'n:Non tutto è andato alla perfezione, ma ' + comp.name + ' è contenta di essere stata con te.'
            : 'n:Forse non era la risposta giusta... ma ci saranno altri appuntamenti.'];
    });
  }
  function doTalk(id) {
    const comp = BY_ID[id], c = cst(id);
    const free = c.talkedRun !== runId() && !c.married && c.affinity < 10;
    const steps = [pickLine(id, baseLines(comp, c))];
    if (free) { c.talkedRun = runId(); save(); steps.push({ gain: 1 }); }
    runScene(id, 'piazza', steps, () => refreshDetail());
  }
  function runMeet(id) {
    const comp = BY_ID[id];
    if (!comp || !ui.open) return;
    const steps = ['n:' + comp.name + ' varca le porte della tua Nazione. I cittadini si radunano curiosi.'].concat(comp.lines.meet);
    runScene(id, 'piazza', steps, () => refreshDetail());
  }
  function toggleBattle(id) {
    const comp = BY_ID[id], n = nat();
    if (n.activeCompanion === id) {
      n.activeCompanion = null; save();
      sfx('uiBack');
      toast(comp.name + ' resterà al villaggio.');
      setBubble('[sad]Va bene... ti aspetterò qui. Torna presto da me, {P}.');
    } else {
      n.activeCompanion = id; save();
      sfx('shield');
      toast('⚔ ' + comp.name + ' combatterà al tuo fianco!', comp.color);
      setBubble(comp.lines.battle);
    }
    refreshDetail();
  }
  function buyRing() {
    confirmBox('Anello di Magicule', 'Un anello forgiato con magicule pure, che brilla di luce propria. Costa ' + RING_COST + ' Anime. Serve per proporre il matrimonio.', 'Compra', () => {
      if (!spendSouls(RING_COST)) { toast('Anime insufficienti', '#ff8a80'); sfx('uiBack'); return; }
      nat().rings++; save();
      sfx('coin'); sfx('chest');
      refreshTop(true);
      toast('💍 Hai acquistato un Anello di Magicule!', '#ffd54f');
      const rr = rootRect();
      popHeart(1, rr.w * 0.5, rr.h * 0.4);
      refreshDetail();
    });
  }
  function propose(id) {
    const comp = BY_ID[id];
    confirmBox('Proposta di matrimonio', 'Vuoi chiedere a ' + comp.name + ' di sposarti? Verrà usato un Anello di Magicule.', 'Proponi 💗', () => {
      const n = nat(), c = cst(id);
      if (n.rings < 1 || c.affinity < 10 || c.married) return;
      const prev = COMPANIONS.filter((x) => x.id !== id && cst(x.id).married).map((x) => x.id);
      n.rings--; c.married = true; n.weddings++;
      save();
      refreshTop(true);
      const steps = ['n:Sotto il cielo stellato, ti inginocchi e apri uno scrigno: l\'Anello di Magicule brilla di luce propria.', 'p:' + comp.name + '... vuoi restare al mio fianco per sempre?'].concat(comp.lines.proposal);
      runScene(id, 'lago', steps, () => startWedding(id, prev), null, true);
    });
  }

  /* ========================================================= scene engine */
  function Scene(host, comp, steps, opts) {
    this.host = host; this.comp = comp; this.q = steps.slice(); this.opts = opts || NOEX;
    this.cur = null; this.full = ''; this.shown = 0; this.typing = false; this.waiting = false; this.busy = false; this.done = false;
    this.ctx = { C: BY_ID[comp] ? BY_ID[comp].name : '' };
  }
  Scene.prototype.next = function () {
    if (this.done) return;
    this.busy = false;
    while (this.q.length) {
      const s = this.q.shift();
      if (s && typeof s === 'object') {
        if (s.gain != null) { this.gain(s.gain); continue; }
        if (s.choices) { this.showChoices(s.choices); return; }
        if (typeof s.fn === 'function') { this.busy = true; this.host.nextEl.classList.remove('on'); s.fn(this); return; }
        continue;
      }
      if (s) { this.say(String(s)); return; }
    }
    this.finish();
  };
  Scene.prototype.say = function (raw) {
    const L = parseLine(raw, this.ctx);
    const H = this.host;
    this.cur = L; this.full = L.txt; this.shown = 0; this.typing = true;
    let name = '', cls = 'nt-vnname';
    if (L.spk === 'n') { name = 'Narratore'; cls += ' n'; }
    else if (L.spk === 'p') { name = playerName(); cls += ' p'; }
    else {
      const comp = BY_ID[L.spk === 'o' ? L.who : this.comp];
      name = comp ? comp.name : '';
      if (comp) H.nameEl.style.setProperty('--nc', comp.color);
    }
    H.nameEl.className = cls;
    H.nameEl.textContent = name;
    H.textEl.className = 'nt-vntext' + (L.spk === 'n' ? ' n' : '');
    H.textEl.textContent = '';
    H.nextEl.classList.remove('on');
    if (H.onSpeaker) H.onSpeaker(L);
  };
  Scene.prototype.update = function (dt) {
    if (!this.typing) return;
    const prev = floor(this.shown);
    this.shown += dt * 48;
    const n = min(this.full.length, floor(this.shown));
    if (n !== prev) {
      this.host.textEl.textContent = this.full.slice(0, n);
      if (n % 5 === 0 && this.cur && this.cur.spk !== 'n') sfx('ui', { vol: 0.05, pitch: 1.6 + Math.random() * 0.4 });
    }
    if (n >= this.full.length) this.endTyping();
  };
  Scene.prototype.endTyping = function () {
    this.typing = false;
    this.host.textEl.textContent = this.full;
    this.host.nextEl.classList.add('on');
  };
  Scene.prototype.tap = function () {
    if (this.done || this.waiting || this.busy) return;
    if (this.typing) { this.endTyping(); return; }
    this.next();
  };
  Scene.prototype.skip = function () {
    let guard = 0;
    while (!this.done && !this.waiting && !this.busy && guard++ < 60) {
      if (this.typing) this.endTyping();
      this.next();
    }
    sfx('ui', { vol: 0.3 });
  };
  Scene.prototype.gain = function (g) {
    const real = addAffinity(this.comp, g);
    const p = this.host.popPos ? this.host.popPos() : { x: 300, y: 200 };
    popHeart(real, p.x, p.y);
    if (this.host.onGain) this.host.onGain(real);
  };
  Scene.prototype.showChoices = function (list) {
    const H = this.host, box = H.choicesEl;
    this.waiting = true;
    box.textContent = '';
    H.nextEl.classList.remove('on');
    list.forEach((ch, i) => {
      const b = el('button', 'nt-choice', fmt(ch.t, this.ctx));
      b.type = 'button';
      b.style.animationDelay = (i * 0.09).toFixed(2) + 's';
      onTap(b, () => {
        if (!this.waiting) return;
        this.waiting = false;
        sfx('select');
        for (const o of box.children) o.classList.add(o === b ? 'picked' : 'gone');
        const extra = this.opts.after ? this.opts.after(ch) : [];
        this.q.unshift.apply(this.q, [ch.r, { gain: ch.g | 0 }].concat(extra));
        setTimeout(() => { box.textContent = ''; if (!this.done) this.next(); }, 380);
      });
      box.appendChild(b);
    });
  };
  Scene.prototype.finish = function () {
    if (this.done) return;
    this.done = true;
    this.host.choicesEl.textContent = '';
    if (this.host.onEnd) this.host.onEnd(this);
  };
  Scene.prototype.pickChoice = function (i) {
    const b = this.host.choicesEl.children[i];
    if (b && this.waiting) b.click();
  };

  function runScene(id, bg, steps, onDone, after, keepBg) {
    const E = ui.els;
    if (!E.vn) return;
    const comp = BY_ID[id];
    const V = ui.vn;
    V.comp = id; V.mood = moodFor(cst(id)); V.enter = 0; V.talk = false; V.spk = 'c'; V.bg = bg || 'piazza'; V.veil = false; V.pA = 0;
    E.vnLoc.textContent = LOC_TITLE[V.bg] || '';
    E.vnLoc.style.animation = 'none'; void E.vnLoc.offsetWidth; E.vnLoc.style.animation = '';
    E.vnChoices.textContent = '';
    E.vnText.textContent = ''; E.vnName.textContent = '';
    E.vn.classList.remove('out');
    E.vn.classList.add('on');
    ui.vnOpen = true;
    sfx('ui', { pitch: 1.2 });
    const host = {
      nameEl: E.vnName, textEl: E.vnText, nextEl: E.vnNext, choicesEl: E.vnChoices,
      onSpeaker(L) {
        V.spk = L.spk;
        if (L.spk === 'o' && BY_ID[L.who] && V.comp !== L.who) { V.comp = L.who; V.enter = 0; }
        else if ((L.spk === 'c') && V.comp !== id) { V.comp = id; V.enter = 0; }
        if (L.mood) V.mood = L.mood;
        else if (L.spk === 'c' || L.spk === 'o') V.mood = moodFor(cst(V.comp));
      },
      popPos() { const r = rootRect(); return { x: r.w * 0.6, y: r.h * 0.34 }; },
      onEnd() {
        ui.scene = null;
        const done = () => { if (onDone) { try { onDone(); } catch (e) { console.error(e); } } };
        if (keepBg) { done(); return; }
        E.vn.classList.add('out');
        setTimeout(() => {
          if (ui.scene) return;
          E.vn.classList.remove('on', 'out'); ui.vnOpen = false;
        }, 300);
        setTimeout(done, 120);
      },
    };
    ui.scene = new Scene(host, id, steps, { after });
    setTimeout(() => { if (ui.scene && !ui.scene.cur) ui.scene.next(); }, 260);
    if (comp && SK.Audio && SK.Audio.duck) { try { SK.Audio.duck(0.4, 0.6); } catch (e) { /* ignore */ } }
  }
  function drawVnBg(ctx, w, h, t, dt) {
    const V = ui.vn;
    const p = PAINTERS[V.bg] || paintPiazza;
    p(ctx, w, h, t);
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h * 0.5, max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    V.pA = U.damp(V.pA, V.spk === 'p' ? 1 : 0, 8, dt || 0.016);
    if (V.pA > 0.02) {
      const s = h * 0.42;
      ctx.globalAlpha = V.pA;
      glowAt(ctx, w * 0.17, h * 0.5, s * 0.8, '#4fc3ff', 0.35);
      drawPlayerPortrait(ctx, w * 0.17 - (1 - V.pA) * 40, h * 0.5, s, t);
      ctx.globalAlpha = 1;
    }
  }
  function drawVnPortrait(ctx, w, h, t, dt) {
    const V = ui.vn;
    if (!V.comp || !BY_ID[V.comp]) return;
    V.enter = min(1, V.enter + (dt || 0.016) * 2.4);
    const e = U.ease.outBack(V.enter);
    const s = min(w, h);
    const talk = !!(ui.scene && ui.scene.typing && (V.spk === 'c' || V.spk === 'o'));
    ctx.globalAlpha = clamp01(V.enter * 1.8) * (V.spk === 'p' ? 0.78 : 1);
    BY_ID[V.comp].drawPortrait(ctx, w / 2 + (1 - e) * w * 0.3, h * 0.5 + (1 - e) * 12 + (V.spk === 'p' ? 6 : 0), s, t, V.mood, { talk, veil: V.veil });
    ctx.globalAlpha = 1;
  }

  /* ============================================================== wedding */
  const FW_COLS = ['#ff4f8b', '#ffd54f', '#80d8ff', '#b388ff', '#69f0ae', '#ff8a65', '#ffffff'];
  function startWedding(id, prevSpouses) {
    const E = ui.els, comp = BY_ID[id];
    if (!comp || !E.wed) return;
    // fade VN into the wedding
    E.vn.classList.add('out');
    setTimeout(() => { E.vn.classList.remove('on', 'out'); ui.vnOpen = false; }, 400);
    const MAXP = lowQ() ? 300 : 800;
    const W = ui.wed = {
      open: true, comp: id, t: 0, cele: false, celeT: 0, fwT: 1.2, react: null, reactEnter: 0, spk: 'n', mood: 'shy',
      n: MAXP, x: new Float32Array(MAXP), y: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP),
      life: new Float32Array(MAXP), ml: new Float32Array(MAXP), col: new Uint8Array(MAXP), sz: new Float32Array(MAXP), next: 0,
      rockets: [], petals: [], w: 800, h: 400,
    };
    for (let i = 0; i < 8; i++) W.rockets.push({ on: false, x: 0, y: 0, vy: 0, ty: 0, col: 0, heart: false, t: 0 });
    for (let i = 0; i < (lowQ() ? 22 : 54); i++) W.petals.push({ x: Math.random(), y: Math.random(), vx: 0, vy: 0, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 3, s: 3 + Math.random() * 4, c: i % 3, ph: Math.random() * TAU });
    E.wedBan.classList.remove('on'); E.wedSub.classList.remove('on');
    E.wedSub.textContent = comp.name + ' & ' + playerName();
    E.wedText.textContent = ''; E.wedName.textContent = ''; E.wedChoices.textContent = '';
    E.wed.classList.remove('out');
    E.wed.classList.add('on');
    try { if (SK.Audio && SK.Audio.music) SK.Audio.music('victory'); } catch (e) { /* ignore */ }
    const steps = WEDDING_INTRO.slice();
    steps.push(comp.lines.vow, PLAYER_VOW, WEDDING_SEAL);
    steps.push({ fn: (sc) => celebrate(sc) });
    for (const sid of prevSpouses || []) {
      const sp = BY_ID[sid];
      if (sp) steps.push('@' + sid + ':' + fmt(pick(sp.lines.spouseReact), { N: comp.name }));
    }
    steps.push('[love]' + pick(['Da oggi siamo una famiglia, {P}. Non lasciarmi mai la mano.', 'È il giorno più bello della mia vita. E sarà così ogni giorno, con te.', 'Andiamo, {P}. La nostra Nazione ci aspetta.']));
    steps.push('n:' + comp.name + ' è ora tua sposa! Bonus nuziale attivo da ogni prossima spedizione: ' + comp.spouseBonus.label + '.');
    const host = {
      nameEl: E.wedName, textEl: E.wedText, nextEl: E.wedNext, choicesEl: E.wedChoices,
      onSpeaker(L) {
        W.spk = L.spk;
        if (L.spk === 'o') { if (W.react !== L.who) { W.react = L.who; W.reactEnter = 0; } W.reactMood = L.mood || 'happy'; }
        else if (L.spk === 'c') { W.mood = L.mood || 'love'; }
      },
      popPos() { const r = rootRect(); return { x: r.w * 0.62, y: r.h * 0.3 }; },
      onEnd() {
        ui.wedScene = null;
        E.wed.classList.add('out');
        setTimeout(() => {
          E.wed.classList.remove('on', 'out');
          ui.wed = null;
          try { if (SK.Audio && SK.Audio.music) SK.Audio.music('title'); } catch (e) { /* ignore */ }
          if (ui.view === 'detail' && ui.sel === id) { buildDetail(); setBubble(pickLine(id, comp.lines.married)); }
          else renderTab();
          refreshTop();
        }, 600);
      },
    };
    ui.wedScene = new Scene(host, id, steps, NOEX);
    setTimeout(() => { if (ui.wedScene && !ui.wedScene.cur) ui.wedScene.next(); }, 900);
  }
  function celebrate(sc) {
    const E = ui.els, W = ui.wed;
    if (!W) return;
    W.cele = true; W.celeT = 0; W.mood = 'happy';
    E.wedText.textContent = ''; E.wedName.textContent = '';
    E.wedBan.classList.remove('on'); void E.wedBan.offsetWidth; E.wedBan.classList.add('on');
    E.wedSub.classList.add('on');
    sfx('victory');
    if (SK.vibrate) SK.vibrate([30, 40, 60]);
    for (let i = 0; i < 4; i++) setTimeout(() => launchRocket(W, i % 2 === 0), i * 160);
    const r = rootRect();
    setTimeout(() => popHeart(10, r.w * 0.5, r.h * 0.42), 350);
    setTimeout(() => { if (ui.wedScene === sc && !sc.done) sc.next(); }, 3000);
  }
  function launchRocket(W, heart) {
    for (const R of W.rockets) {
      if (R.on) continue;
      R.on = true; R.t = 0;
      R.x = W.w * (0.12 + Math.random() * 0.76);
      R.y = W.h + 10;
      R.vy = -(W.h * (1.05 + Math.random() * 0.35));
      R.ty = W.h * (0.1 + Math.random() * 0.3);
      R.col = (Math.random() * FW_COLS.length) | 0;
      R.heart = !!heart;
      return;
    }
  }
  function explode(W, R) {
    const n = lowQ() ? 34 : (R.heart ? 70 : 60);
    const sp = W.h * (0.3 + Math.random() * 0.12);
    const c2 = (R.col + 1 + ((Math.random() * 3) | 0)) % FW_COLS.length;
    for (let i = 0; i < n; i++) {
      const k = W.next; W.next = (W.next + 1) % W.n;
      let vx, vy;
      if (R.heart) {
        const a = (i / n) * TAU;
        const hx = 16 * Math.pow(sin(a), 3), hy = -(13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a));
        vx = hx / 17 * sp; vy = hy / 17 * sp;
      } else {
        const a = Math.random() * TAU, m = sp * (0.4 + Math.random() * 0.6);
        vx = cos(a) * m; vy = sin(a) * m;
      }
      W.x[k] = R.x; W.y[k] = R.y; W.vx[k] = vx; W.vy[k] = vy;
      W.life[k] = W.ml[k] = 1 + Math.random() * 0.8;
      W.col[k] = R.heart ? 0 : (i % 3 === 0 ? c2 : R.col);
      W.sz[k] = 1.6 + Math.random() * 1.8;
    }
    sfx('explosion', { vol: 0.12, pitch: 1.5 + Math.random() * 0.4 });
  }
  function updateWedding(dt) {
    const W = ui.wed;
    W.t += dt;
    W.reactEnter = min(1, W.reactEnter + dt * 2.4);
    W.fwT -= dt;
    if (W.cele) W.celeT += dt;
    if (W.fwT <= 0) {
      W.fwT = W.cele ? (W.celeT < 6 ? 0.32 : 0.9) : 2.2;
      launchRocket(W, Math.random() < 0.3);
    }
    for (const R of W.rockets) {
      if (!R.on) continue;
      R.t += dt;
      R.y += R.vy * dt;
      R.vy += W.h * 0.7 * dt;
      if (R.y <= R.ty || R.vy > -W.h * 0.1) { R.on = false; explode(W, R); }
    }
    const drag = Math.exp(-1.4 * dt), g = W.h * 0.22 * dt;
    for (let i = 0; i < W.n; i++) {
      if (W.life[i] <= 0) continue;
      W.life[i] -= dt;
      W.vx[i] *= drag; W.vy[i] = W.vy[i] * drag + g;
      W.x[i] += W.vx[i] * dt; W.y[i] += W.vy[i] * dt;
    }
    for (const p of W.petals) {
      p.y += dt * (0.05 + p.s * 0.012);
      p.x += dt * (0.02 + sin(W.t * 1.3 + p.ph) * 0.03);
      p.r += p.vr * dt;
      if (p.y > 1.05) { p.y = -0.05; p.x = Math.random(); }
      if (p.x > 1.05) p.x = -0.05;
    }
  }
  function drawWedding(ctx, w, h, t) {
    const W = ui.wed;
    if (!W) return;
    W.w = w; W.h = h;
    const comp = BY_ID[W.comp];
    ctx.fillStyle = bgGrad(ctx, h, '#0b0726', '#2d0f3f', '#4a1640');
    ctx.fillRect(0, 0, w, h);
    paintStars(ctx, w, h, t, lowQ() ? 40 : 90, 0.7, 77);
    paintMoon(ctx, w * 0.12, h * 0.16, h * 0.06);
    if (W.cele) {
      ctx.save(); ctx.translate(w * 0.5, h * 0.45); ctx.rotate(t * 0.15);
      ctx.fillStyle = 'rgba(255,230,160,' + (0.07 * min(1, W.celeT)).toFixed(3) + ')';
      for (let i = 0; i < 14; i++) { ctx.rotate(TAU / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -w); ctx.lineTo(30, -w); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // fireworks (behind the arch)
    ctx.globalCompositeOperation = 'lighter';
    for (const R of W.rockets) {
      if (!R.on) continue;
      glowAt(ctx, R.x, R.y, 10, FW_COLS[R.col], 0.9);
      ctx.fillStyle = '#fff'; ctx.fillRect(R.x - 1.5, R.y - 1.5, 3, 6);
    }
    const hq = !lowQ();
    for (let i = 0; i < W.n; i++) {
      const L = W.life[i];
      if (L <= 0) continue;
      const a = clamp01(L / W.ml[i]);
      const c = FW_COLS[W.col[i]];
      ctx.globalAlpha = a;
      ctx.fillStyle = c;
      const s = W.sz[i];
      ctx.fillRect(W.x[i] - s / 2, W.y[i] - s / 2, s, s);
      if (hq && (i & 3) === 0) glowAt(ctx, W.x[i], W.y[i], s * 5, c, a * 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // garden silhouettes & string lights
    paintHills(ctx, w, h, h * 0.78, h * 0.12, 61, '#14081e');
    const cols = ['#ffd54f', '#ff80ab', '#ffffff'];
    for (let i = 0; i <= 22; i++) {
      const u = i / 22, x = u * w, y = h * 0.06 + sin(u * PI) * h * 0.1;
      const a = 0.6 + 0.4 * sin(t * 3 + i);
      glowAt(ctx, x, y, 10, cols[i % 3], a * 0.7);
      ell(ctx, x, y, 2, 2, 0, cols[i % 3]);
    }
    // path
    ctx.fillStyle = 'rgba(255,170,210,0.18)';
    ctx.beginPath(); ctx.moveTo(w * 0.42, h); ctx.lineTo(w * 0.47, h * 0.78); ctx.lineTo(w * 0.53, h * 0.78); ctx.lineTo(w * 0.58, h); ctx.closePath(); ctx.fill();
    // flower arch
    const ax = w * 0.5, ay = h * 0.9, aw = min(w * 0.3, h * 0.55), ah = h * 0.78;
    ctx.fillStyle = '#e8e0f0';
    ctx.fillRect(ax - aw - 8, ay - ah * 0.55, 16, ah * 0.55);
    ctx.fillRect(ax + aw - 8, ay - ah * 0.55, 16, ah * 0.55);
    ctx.strokeStyle = '#2e5e3a'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.ellipse(ax, ay - ah * 0.55, aw, ah * 0.45, 0, PI, TAU); ctx.stroke();
    const fc = ['#ff80ab', '#ffffff', '#ffd54f', '#ffb3d9'];
    const nf = lowQ() ? 16 : 30;
    for (let i = 0; i <= nf; i++) {
      const a = PI + (i / nf) * PI;
      const x = ax + cos(a) * aw, y = ay - ah * 0.55 + sin(a) * ah * 0.45 + sin(t * 2 + i) * 1.2;
      ell(ctx, x, y, 7, 7, 0, fc[i % 4]);
      ell(ctx, x, y, 2.4, 2.4, 0, '#ffd54f');
    }
    glowAt(ctx, ax, ay - ah * 0.6, ah * 0.5, '#ff80ab', 0.18 + 0.05 * sin(t * 2));
    // the couple
    const ps = h * 0.5;
    const showReact = W.react && BY_ID[W.react];
    if (showReact) {
      const e = U.ease.outBack(W.reactEnter);
      ctx.globalAlpha = clamp01(W.reactEnter * 2);
      BY_ID[W.react].drawPortrait(ctx, w * 0.3 - (1 - e) * w * 0.3, h * 0.62, ps * 1.05, t, W.reactMood || 'happy', { talk: !!(ui.wedScene && ui.wedScene.typing && W.spk === 'o') });
      ctx.globalAlpha = 1;
    } else {
      glowAt(ctx, w * 0.36, h * 0.66, ps * 0.6, '#4fc3ff', 0.3);
      drawPlayerPortrait(ctx, w * 0.36, h * 0.68, ps * 0.9, t);
    }
    const bt = !!(ui.wedScene && ui.wedScene.typing && W.spk === 'c');
    comp.drawPortrait(ctx, w * 0.62, h * 0.58, h * 0.72, t, W.mood, { veil: true, talk: bt });
    // petals
    const pc = ['#ffb3cf', '#ffffff', '#ff80ab'];
    for (const p of W.petals) {
      ctx.save();
      ctx.translate(p.x * w, p.y * h); ctx.rotate(p.r);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = pc[p.c];
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55 * (0.6 + 0.4 * abs(sin(t * 3 + p.ph))), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================ open/close */
  function onKey(e) {
    if (!ui.open || !e) return;
    const code = e.code;
    if (code === 'Escape' || code === 'Backspace') { if (!back()) { sfx('uiBack'); close(); } return; }
    const sc = ui.wedScene || ui.scene;
    if (sc) {
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') { sc.tap(); return; }
      const d = code === 'Digit1' ? 0 : code === 'Digit2' ? 1 : code === 'Digit3' ? 2 : -1;
      if (d >= 0) sc.pickChoice(d);
    }
  }
  function open() {
    if (ui.open || typeof document === 'undefined') return;
    nat();
    for (const comp of COMPANIONS) cst(comp.id);
    if (ui.root && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
    ui.anims.length = 0;
    ui.scene = null; ui.wedScene = null; ui.wed = null; ui.vnOpen = false; ui.modalOpen = false;
    buildRoot();
    const host = document.getElementById('ui') || document.body;
    host.appendChild(ui.root);
    ui.open = true; ui.view = 'hub'; ui.tab = 'compagne'; ui.sel = null; ui.last = 0;
    renderTab();
    const r = ui.root;
    requestAnimationFrame(() => { if (ui.root === r) r.classList.add('on'); });
    if (SK.input) { SK.input.enabled = false; try { SK.input.clear(); } catch (e) { /* ignore */ } }
    if (SK.events && !ui.keyFn) { ui.keyFn = onKey; SK.events.on('key', ui.keyFn); }
    sfx('portal', { vol: 0.35, pitch: 1.4 });
    if (!ui.raf) ui.raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!ui.open) return;
    ui.open = false;
    if (ui.raf) { cancelAnimationFrame(ui.raf); ui.raf = 0; }
    if (ui.keyFn && SK.events) { SK.events.off('key', ui.keyFn); ui.keyFn = null; }
    ui.scene = null; ui.wedScene = null; ui.wed = null; ui.vnOpen = false; ui.modalOpen = false;
    ui.anims.length = 0;
    const r = ui.root;
    ui.root = null; ui.els = {};
    if (r) {
      r.classList.remove('on'); r.classList.add('off');
      setTimeout(() => { if (r.parentNode) r.parentNode.removeChild(r); }, 380);
    }
    save();
    if (SK.UI && typeof SK.UI.show === 'function') { try { SK.UI.show('title'); } catch (e) { console.error(e); } }
  }
  function back() {
    if (!ui.open) return false;
    if (ui.wed && ui.wed.open) { if (ui.wedScene) ui.wedScene.tap(); return true; }
    if (ui.vnOpen) { const s = ui.scene; if (s && !s.waiting) s.tap(); return true; }
    if (ui.modalOpen) { sfx('uiBack'); closeModal(); return true; }
    if (ui.view === 'detail') { sfx('uiBack'); closeDetail(); return true; }
    return false;
  }
  function isOpen() { return ui.open; }

  SK.Nation = {
    companions: COMPANIONS,
    byId: BY_ID,
    gifts: GIFTS,
    dates: DATES,
    ringCost: RING_COST,
    open,
    close,
    back,
    isOpen,
    onBossDefeated,
    onNamed,
    applyBonuses,
    spawnCompanions,
    runBonusesText,
    drawPortrait(id, ctx, x, y, size, t, mood, ex) { drawPortraitFor(id, ctx, x, y, size, t, mood, ex); },
    drawGiftIcon,
    state: cst,
  };
})(window.SK);
