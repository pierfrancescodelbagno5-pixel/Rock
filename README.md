# Slime Reborn — L'Ascesa del Predatore

Action-roguelite per Android ispirato al genere "slime reincarnato": divora i mostri col **Predatore**, ruba le loro abilità, dai un nome ai mostri per farli diventare alleati, evolvi fino a Re Demone, costruisci la tua **Nazione** e sposa le tue compagne.

## Installa
Scarica **[SlimeReborn.apk](SlimeReborn.apk)** sul telefono e aprilo (consenti "installa da origini sconosciute").

## Contenuti
- 5 razze (Slime, Oni, Lupo d'Ombra, Draconide, Vampiro) × 4 evoluzioni, 5 classi + la classe mitica **Pierfrancesco Del Bagno — L'Imperatore Infinito**
- 17 abilità, 21 mostri, 4 boss, 4 biomi, negozio permanente, bestiario
- Nazione con 6 compagne: affinità, regali, appuntamenti, matrimoni multipli
- Grafica, musica ed effetti generati interamente dal codice

## Terre Spezzate 3D
Modalità action-RPG 3D low-poly (dal menu: **Terre Spezzate 3D**): **mondo aperto** di ~1,4 km con 4 regioni (Pianure Dorate, Vette Gelide, Terre Cremisi, Palude dei Sussurri), 9 Luci di Grazia da scoprire, mappa con viaggio rapido, corsa, 14 accampamenti nemici, Luci di Grazia per riposare e salire di livello, schivata con stamina, aggancio del bersaglio, Fulmine Nero, Predatore, anime perse alla morte da recuperare, Mimetismo (Slime ⇄ Forma Umana con spada ⇄ Lupo Tempesta, sbloccato divorando un lupo), due boss (Gorvan il Tiranno Caduto e il Drago della Tempesta Antica).


### Novità Terre Spezzate
- Grafica: bloom, tone mapping ACES, cielo con sole/luna/stelle, ciclo giorno-notte, riflessi, erba al vento, alberi per regione, meteo (foglie, neve, braci, lucciole), modelli dettagliati.
- **Predatore**: ogni mostro divorato dona la sua abilità (Lama d'Acqua, Fulmine Nero, Movimento d'Ombra, Onda Ultrasonica, Filo d'Acciaio, Respiro Velenoso, Fiamma Nera, Corazza d'Acciaio, Arte della Spada, Fame Insaziabile, Tempesta Nera) con l'Oracolo che le analizza.
- Nuovi mostri (pipistrelli, ragni, vipere, spiriti di fiamma) e il mini-boss Serpe della Tempesta; forma Drago dopo il boss.
- **Valdoria**, la capitale, e 4 villaggi con abitanti con cui parlare, mercante, fabbro, anziano con missioni, locanda.
- **Dai un nome** ai goblin e ai lupi: evolvono e ti seguono come alleati.
- Le 6 compagne in 3D: dialoghi, regali, appuntamenti, porta con te, matrimonio (anche più spose).
- HUD nuovo: ritratto, bussola, Oracolo, barra abilità con ricarica, numeri del danno.


### Versione 1 (RPG completo)
- Inizi nella metropoli **Altheria, Città dei Mille Mondi**: centinaia di abitanti, quartieri di mondi diversi, castello, cattedrale, accademia di magia, arena, gilda, negozi, taverna, canali.
- **Classi**: Guerriero, Paladino, Mago Elementale, Arciere, Assassino, Evocatore, Slime Predatore (trasformazioni) e la classe mitica Pierfrancesco Del Bagno.
- **Livelli ed esperienza** fino al 99, attributi, magie e abilità di classe, **armi, armature, loot** con rarità e affissi, inventario, negozi, maestro di magia.
- **Missioni**: storia principale a capitoli, missioni secondarie, **Gilda degli Avventurieri** con ranghi F→S e contratti.
- **Torre dei Mille Piani**: dungeon a piani procedurali con trappole, forzieri, boss ogni 5 piani.
- Versione PC: `SlimeReborn-PC.zip` con **SlimeReborn.exe** (Windows), più Linux e macOS.

## Versione PC
Scarica **[SlimeReborn-PC.zip](SlimeReborn-PC.zip)**, estrai la cartella e avvia **SlimeReborn.exe** (Windows 10/11). Tieni `resources.neu` nella stessa cartella.

## Versione Unreal Engine 5
Progetto C++ in **[unreal/SlimeReborn](unreal/SlimeReborn)**: mondo aperto generato dal codice, illuminazione Lumen, nuvole volumetriche, città di Altheria, slime con Predatore e Mimetismo, 4 classi, boss e missioni. Lo apri e lo compili con UE 5.3–5.5 e Visual Studio 2022: istruzioni passo passo in **[LEGGIMI.md](unreal/SlimeReborn/LEGGIMI.md)**.

## Comandi
Touch: joystick a sinistra, pulsanti a destra (Predatore, Scatto, 3 abilità). Tastiera: WASD, Spazio, E, 1/2/3, F, Esc.

## Sviluppo
- Gioco web: `web/` (apri `web/index.html`; `?debug&autoplay&speed=3` per il bot)
- Test: `node tools/smoke-test.mjs --menus`
- APK: `./gradlew assembleRelease` (serve Android SDK). CI: `.github/workflows/android.yml`
- Architettura: `docs/ARCHITECTURE.md`
