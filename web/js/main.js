/* Slime Reborn — boot. */
(function (SK) {
  'use strict';

  function fatal(err) {
    console.error(err);
    const box = document.getElementById('boot-error');
    if (box && SK.debug && SK.debug.enabled) {
      box.hidden = false;
      box.textContent = 'Errore: ' + (err && err.message ? err.message : err);
    }
  }

  function boot() {
    const save = SK.save.load();
    SK.setQuality(save.settings.quality);

    // Audio must be unlocked by a user gesture (autoplay policy).
    const unlock = () => {
      try {
        SK.Audio.init();
        SK.Audio.setVolumes(save.settings.music, save.settings.sfx);
        SK.Audio.resume();
      } catch (e) { console.error(e); }
    };
    SK.events.on('gesture', unlock);

    SK.events.on('hidden', () => {
      try { SK.Audio.suspend(); } catch (e) { /* ignore */ }
      if (SK.G && SK.G.state === 'play') SK.Game.pause();
    });
    SK.events.on('visible', () => { try { SK.Audio.resume(); } catch (e) { /* ignore */ } });

    SK.UI.init();
    SK.Game.init();
    SK.loop.start(
      (dt, rawDt) => SK.Game.update(dt, rawDt),
      (ctx) => SK.Game.render(ctx)
    );
  }

  window.addEventListener('error', (e) => fatal(e.error || e.message));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.SK);
