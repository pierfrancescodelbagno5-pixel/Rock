# Slime Reborn — Terre Spezzate (Unreal Engine 5)

La versione Unreal Engine 5 del gioco. Il mondo è generato interamente dal codice C++ al
primo avvio, quindi non servono file grafici esterni. Il progetto usa:

- **Lumen** per l'illuminazione globale
- **Virtual Shadow Maps** per le ombre
- cielo fisico con atmosfera e **nuvole volumetriche**
- ciclo giorno/notte
- nebbia volumetrica

> ⚠️ Non ho potuto compilarlo nell'ambiente in cui l'ho scritto, perché lì Unreal non c'è.
> Il codice è stato scritto e ricontrollato con attenzione, ma alla prima compilazione
> potrebbero comparire errori. Se succede, copia il messaggio di errore e incollamelo:
> lo correggo subito.

---

## 1. Cosa ti serve

| Cosa | Dettagli |
|---|---|
| **Unreal Engine 5** | Versione 5.3, 5.4 o 5.5, installata da Epic Games Launcher |
| **Visual Studio 2022** (Community va bene, è gratis) | Nell'installer spunta: **"Sviluppo di giochi con C++"** e, nei dettagli a destra, **"Unreal Engine installer"** e un **Windows 10/11 SDK** |
| Scheda video | DirectX 12. Consigliata RTX 2060 / RX 6600 o superiore per Lumen fluido |
| Spazio su disco | Circa 5 GB per il progetto compilato e la cache degli shader |

## 2. Scaricare il progetto

Scarica la cartella `unreal/SlimeReborn` dal repository GitHub, dal branch
`claude/slime-ken-android-game-enhmzm`:

- **ZIP:** su GitHub scegli il branch → **Code** → **Download ZIP**, poi estrai solo la cartella `unreal/SlimeReborn`.
- **Git:** usa questo comando:
  `git clone -b claude/slime-ken-android-game-enhmzm https://github.com/pierfrancescodelbagno5-pixel/Rock.git`

Metti la cartella in un percorso **corto e senza spazi strani**, per esempio `C:\Giochi\SlimeReborn`.

## 3. Prima apertura

1. Fai **clic destro** su `SlimeReborn.uproject` → **"Switch Unreal Engine version..."**,
   scegli la tua versione di UE5 e premi **OK**.
2. Fai ancora **clic destro** su `SlimeReborn.uproject` → **"Generate Visual Studio project files"**.
3. Fai **doppio clic** su `SlimeReborn.uproject`. Comparirà il messaggio
   *"The following modules are missing or built with a different engine version... Would you like to rebuild them now?"*:
   rispondi **Sì**. La compilazione richiede 1–5 minuti.
   - Se compare *"could not be compiled. Try rebuilding from source manually"*:
     1. Apri `SlimeReborn.sln` con Visual Studio 2022.
     2. In alto scegli **Development Editor** e **Win64**.
     3. Premi **Compila → Compila soluzione** (Ctrl+Maiusc+B).
     4. Copia gli errori della finestra **Elenco errori** e mandameli.
4. Alla prima apertura l'editor compila gli shader. Può richiedere **10–30 minuti**, ma solo la prima volta.
5. All'avvio parte da solo lo script `Content/Python/init_unreal.py`, che crea 4 materiali in `Content/SR`:
   - colori con variazione
   - magia luminosa
   - slime gelatinoso trasparente
   - acqua

   Nel **Output Log** vedrai `Slime Reborn: 4 materiali creati`. Se non succede:
   1. Abilita **Edit → Plugins → "Python Editor Script Plugin"**. È già attivo nel `.uproject`.
   2. Usa **Tools → Execute Python Script...** e scegli `Content/Python/init_unreal.py`.

   Senza questi materiali il gioco funziona lo stesso, ma con colori più piatti.

## 4. Giocare

- Premi **Play** (Alt+P) nell'editor e **clicca nella finestra** per catturare il mouse.
- Per le prestazioni migliori: freccia accanto a Play → **Standalone Game**.
- Al primo avvio la generazione del mondo blocca il gioco per qualche secondo: terreno di 3,2 km, migliaia di
  alberi e la città di Altheria.

### Comandi

| Tastiera / mouse | Gamepad | Azione |
|---|---|---|
| WASD | Levetta sinistra | Muoversi |
| Mouse | Levetta destra | Camera |
| Spazio | A | Salto (nel menu: inizia la partita) |
| Shift | L3 | Corsa (consuma stamina) |
| Q | B | Schivata con invulnerabilità |
| Clic sinistro | X | Attacco (combo da 3 colpi) |
| Clic destro | Y | Attacco pesante |
| R | LB | Usa l'abilità selezionata |
| T | RT | Abilità successiva |
| 1–9 | — | Scegli abilità / classe nel menu / Grazia nel viaggio rapido |
| E | RB | **Predazione**: divora un nemico sconfitto e ruba la sua abilità |
| G | D-pad giù | **Mimetismo**: Slime → Umano → Lupo Tempesta |
| F | D-pad su | Parla / compra / riposa alla Grazia |
| H | D-pad sinistra | Pozione curativa |
| Clic rotella | R3 | Aggancia il bersaglio |
| Rotella | — | Zoom della camera |
| I / Tab | — | Inventario (1–9 equipaggia, T cambia pagina) |
| F1 | Select | Aiuto con tutti i comandi |
| Invio / C | Start | Nuova partita / Continua (nel menu) |

## 5. Cosa contiene questa versione (Fase 1)

- **Menu iniziale** con 4 classi:
  - Slime Predatore
  - Spadaccino
  - Arcimago
  - **L'Imperatore Infinito**: la tua classe mitica, Pierfrancesco Del Bagno. Ha tutte le forme e tutte le abilità, XP doppia e Divoratore.
- **Open world** di circa 3,2 × 3,2 km con 6 regioni, coste e mare:
  - Piane di Altheria
  - Foresta di Jura
  - Calanchi Cremisi
  - Passi del Nord e Vette dell'Eterno Gelo
  - Prati Meridionali
  - Palude delle Squame
- **Altheria, la città reale**, abitata da circa 70 NPC con cui puoi parlare:
  - mura e torri, tre porte
  - circa 100 case
  - castello, cattedrale, Gilda degli Avventurieri, fabbro, taverna, mercato
  - fontana e lanterne che si accendono di notte
- **NPC speciali:**
  - Brann (missioni)
  - Elia (pozioni)
  - Torvin (potenziamento dell'arma)
  - Lyra (cure e storia)
  - le guardie
  - un bardo
- **Slime con le abilità dell'anime, ma con nomi originali:**
  - **Predatore**: ogni nemico divorato dà vita massima e, se ce l'ha, la sua abilità
  - **Mimetismo**: forma umana e forma Lupo Tempesta (quest'ultima si sblocca divorando un lupo)
- **9 abilità:**
  - Lama d'Acqua
  - Palla di Fuoco
  - Soffio Infuocato
  - Fulmine Nero (a catena)
  - Onda Sismica
  - Lama Oscura
  - Filo Vincolante
  - Rigenerazione
  - Divoratore
- **7 tipi di nemici**, con intelligenza artificiale, attacchi annunciati e livelli che crescono allontanandosi dalla città:
  - Goblin
  - Lupi Tempesta
  - Ragni Tessitori
  - Orchi
  - Uomini Lucertola (lanciano fuoco)
  - Cavalieri Caduti
  - **Re degli Orchi**: boss con barra della vita, seconda fase "Fame" e onde d'urto
- **Combattimento in stile soulslike:**
  - stamina, schivata con frame di invulnerabilità, combo e attacco pesante
  - aggancio del bersaglio, hit-stop, scossa della camera, numeri del danno e colpi critici
- **Progressione:**
  - livelli ed esperienza
  - oro e pozioni
  - arma potenziabile fino a +10
  - 7 missioni a catena della Gilda
- **8 Grazie dorate**: scoperta, riposo, salvataggio e viaggio rapido. Se muori rinasci all'ultima Grazia.
- **Interfaccia completa:**
  - barre di vita, mana e stamina
  - bussola con segnalini delle missioni e delle Grazie, ora del giorno e nome della regione
  - tracker delle missioni
  - messaggi del **Saggio**
  - barra delle abilità con i tempi di ricarica
  - dialoghi
  - schermata di morte "SEI CADUTO"
- **Salvataggio automatico** (alla Grazia, quando sali di livello e quando completi una missione) e opzione **Continua**.

### Novità della Fase 2

- **Bottino:** i nemici lasciano armi, armature e anelli con 5 rarità (Comune → Leggendario) e statistiche casuali: attacco, difesa, vita, mana e critico.
  - Si raccolgono passandoci sopra; il primo oggetto di ogni tipo si equipaggia da solo.
  - Con **I** apri l'inventario; Elia, al mercato, compra tutto il bottino che hai nella borsa.
- **Nuoto** in laghi e mare, con consumo di stamina. Il mare aperto oltre la costa ti respinge.
- **Nuova classe: Arciere.** Attacca da lontano, con Freccia Perforante e Pioggia di Frecce.
- **Compagne:** Kaede (spadaccina oni, alla Gilda), Liora (maga elfica, alla cattedrale) e Rhea (cacciatrice kemonomimi, alla taverna).
  - Parla con loro per far crescere l'affetto: a 15 si uniscono al gruppo e combattono al tuo fianco.
  - A 90, con 300 oro per l'anello, puoi chiedere di sposarle (ognuna dà +8% vita e attacco). È una storia romantica, senza contenuti espliciti.
- **Torre dei Mille Piani:** la torre viola fuori dalla porta est.
  - Ogni piano è un labirinto di 9 stanze: sconfiggi tutti i nemici per aprire il portale dorato verso il piano successivo.
  - Ogni 5 piani c'è un **Campione** e un checkpoint; il portale blu ti riporta fuori.
  - Ci sono 5 ambientazioni: pietra, ghiaccio, lava, cristallo e giungla.

## 6. Creare il gioco `.exe` per Windows

1. Nell'editor apri **Platforms → Windows → Package Project** (in UE 5.3 è *File → Package Project → Windows*).
2. Scegli una cartella di destinazione. Al termine troverai `Windows/SlimeReborn.exe`.
3. Copia l'intera cartella `Windows` dove vuoi: il gioco parte da lì.

## 7. Personalizzare il mondo (opzionale)

Il mondo è l'attore **SR World**, creato in automatico. Per modificarne i parametri:

1. **File → New Level → Empty Level** e salvalo come `Content/Maps/Main`.
2. Trascina **SR World** dal pannello *Place Actors* (cerca "SR World") nel livello.
3. Nei dettagli puoi cambiare questi parametri:
   - `DayLengthMinutes`: durata del giorno in minuti
   - `TimeOfDay`: ora iniziale
   - `TerrainQuadsPerChunk`: dettaglio del terreno
   - `FoliageDensity`: quantità di vegetazione. Abbassala se il gioco scatta.
4. In **Project Settings → Maps & Modes** imposta `Main` come *Game Default Map* ed *Editor Startup Map*.

Se il gioco è lento: **Settings → Engine Scalability Settings → High/Medium** nell'editor, oppure abbassa `FoliageDensity`.

## 8. Prossime fasi

- **Fase 2:**
  - dungeon a piani e Torre del Mago
  - compagni e romance (non esplicita)
  - più classi e razze
  - inventario con armi e armature
  - nuoto
  - effetti Niagara
  - modelli realistici gratuiti da **Fab / Quixel Megascans** al posto delle forme base
- **Fase 3:**
  - forma Drago
  - città sotterranea e altre città
  - eventi del mondo
  - comandi touch per **Android** (richiede Android Studio e NDK configurati in Unreal)

## 9. Se qualcosa non va

- **Errori di compilazione:** copia il testo dalla finestra *Elenco errori* di Visual Studio o dall'*Output Log* e mandamelo.
- **Il gioco parte ma è tutto grigio o bianco:** mancano i materiali → vedi il punto 3.5.
- **Il personaggio non si muove:** clicca dentro la finestra di gioco per dare il fuoco a tastiera e mouse.
