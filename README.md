# Slime Reborn — L'Ascesa del Predatore

Action-roguelite per Android ispirato al genere "slime reincarnato": divora i mostri col **Predatore**, ruba le loro abilità, dai un nome ai mostri per farli diventare alleati, evolvi fino a Re Demone, costruisci la tua **Nazione** e sposa le tue compagne.

## Installa
Scarica **[SlimeReborn.apk](SlimeReborn.apk)** sul telefono e aprilo (consenti "installa da origini sconosciute").

## Contenuti
- 5 razze (Slime, Oni, Lupo d'Ombra, Draconide, Vampiro) × 4 evoluzioni, 5 classi + la classe mitica **Pierfrancesco Del Bagno — L'Imperatore Infinito**
- 17 abilità, 21 mostri, 4 boss, 4 biomi, negozio permanente, bestiario
- Nazione con 6 compagne: affinità, regali, appuntamenti, matrimoni multipli
- Grafica, musica ed effetti generati interamente dal codice

## Comandi
Touch: joystick a sinistra, pulsanti a destra (Predatore, Scatto, 3 abilità). Tastiera: WASD, Spazio, E, 1/2/3, F, Esc.

## Sviluppo
- Gioco web: `web/` (apri `web/index.html`; `?debug&autoplay&speed=3` per il bot)
- Test: `node tools/smoke-test.mjs --menus`
- APK: `./gradlew assembleRelease` (serve Android SDK). CI: `.github/workflows/android.yml`
- Architettura: `docs/ARCHITECTURE.md`
