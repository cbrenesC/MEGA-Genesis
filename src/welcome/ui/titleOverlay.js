const readSave = () => null;
const getBest = () => null;
import { getPreferences } from '../core/consent.js';
import { assetUrl } from '../core/assetLoader.js';
import { localizeDOM } from '../i18n/index.js';

// UI nativa inspirada en spacemiss: NO se rasteriza ni se amplía con Phaser.
export function mountTitleOverlay(scene) {
  document.getElementById('space-title-overlay')?.remove();
  const hasSave = Boolean(readSave());
  const best = getBest();

  const screen = document.createElement('section');
  screen.id = 'space-title-overlay';
  screen.className = 'space-title';
  screen.setAttribute('aria-label', 'Pantalla de inicio de Space Mission');
  screen.innerHTML = `
    <video class="space-title__video" autoplay muted loop playsinline preload="auto" aria-hidden="true">
      <source src="/title-background.mp4" type="video/mp4" />
    </video>
    <audio class="space-title__music" src="/title-music.mp3" preload="auto" loop aria-hidden="true"></audio>
    <div class="space-title__video-error" role="status" hidden>El video de fondo no está disponible. Verifica public/title-background.mp4.</div>
    <div class="space-title__gradient" aria-hidden="true"></div>
    <div class="space-title__layout">
      <div class="space-title__content">
        <p class="space-title__kicker">PROGRAMA ESPACIAL · NIVEL 1</p>
        <h1 class="space-title__name"><span>SPACE</span><span>MISSION</span></h1>
        <p class="space-title__subtitle">COORDINACIÓN Y DESPEGUE</p>
        <div class="space-title__rule" aria-hidden="true"></div>
        <p class="space-title__description">
          El cohete espera en la plataforma. Explora el centro espacial,
          diseña la nave, carga el propelente, repara los sistemas averiados,
          elige una ventana segura y firma la autorización final.
        </p>
        <div class="space-title__actions">
          <button type="button" class="space-title__button space-title__button--primary" data-title-action="start">JUGAR AHORA</button>
          <button type="button" class="space-title__button" data-title-action="continue" ${hasSave ? '' : 'disabled'}>${hasSave ? 'CONTINUAR MISIÓN' : 'SIN PARTIDA GUARDADA'}</button>
          <button type="button" class="space-title__button space-title__button--subtle" data-title-action="controls">CONTROLES</button>
          <button type="button" class="space-title__button space-title__button--subtle" data-title-action="credits">CRÉDITOS</button>
        </div>
        ${best ? `<p class="space-title__best">MEJOR PUNTUACIÓN: ${Math.round(best.score).toLocaleString('es-ES')} / 100</p>` : ''}
        <p class="space-title__meta">WASD O FLECHAS · E INTERACTUAR · I INVENTARIO · ESC PAUSA</p>
      </div>
    </div>
  `;

  document.getElementById('app').append(screen);

  const video = screen.querySelector('video');
  const music = screen.querySelector('audio.space-title__music');
  const videoError = screen.querySelector('.space-title__video-error');
  const VIDEO_VOLUME = 0.12;
  video.volume = VIDEO_VOLUME;
  let screenIsActive = true;
  let mediaUnlocked = false;

  video.addEventListener('error', () => {
    if (videoError) videoError.hidden = false;
    console.error('No se pudo reproducir public/title-background.mp4.');
  });
  music.addEventListener('error', () => {
    console.error('No se pudo cargar public/title-music.mp3.');
  });

  function syncMedia() {
    const prefs = getPreferences();
    const permitted = window.__SMS_INTRO_COMPLETE__ && screenIsActive;
    const videoSource = assetUrl('/title-background.mp4');
    const musicSource = assetUrl('/title-music.mp3');
    if (video.dataset.source !== videoSource) {
      video.dataset.source = videoSource;
      video.src = videoSource;
      video.load();
    }
    if (music.dataset.source !== musicSource) {
      music.dataset.source = musicSource;
      music.src = musicSource;
      music.load();
    }
    // Respetar preferencias aunque el jugador haya elegido no guardar datos.
    if (permitted && prefs.animations) {
      video.hidden = false;
      video.muted = !prefs.audio || !mediaUnlocked;
      void video.play().catch(() => {});
    } else {
      video.pause();
      video.muted = true;
      video.hidden = true;
    }
    music.volume = prefs.audio ? prefs.musicVolume : 0;
    if (permitted && prefs.audio) {
      void music.play().catch(() => {});
    } else {
      music.pause();
    }
  }

  const refreshMedia = () => syncMedia();
  // Un navegador puede bloquear audio automático incluso si el jugador
  // autorizó el almacenamiento en una visita anterior. Reintentar en
  // cualquier gesto real del usuario mientras esté abierta esta pantalla.
  const unlockOnGesture = () => {
    mediaUnlocked = true;
    if (window.__SMS_INTRO_COMPLETE__ && screenIsActive) syncMedia();
  };
  window.addEventListener('sms-consent-changed', refreshMedia);
  window.addEventListener('sms-preferences-changed', refreshMedia);
  window.addEventListener('sms-intro-complete', refreshMedia);
  window.addEventListener('pointerdown', unlockOnGesture);
  window.addEventListener('keydown', unlockOnGesture);
  syncMedia();
  localizeDOM(screen);

  const actions = {
    start: () => scene.newGame(),
    continue: () => hasSave && scene.continueGame(),
    controls: () => scene.openInfo('controls'),
    credits: () => scene.openInfo('credits'),
  };

  for (const button of screen.querySelectorAll('[data-title-action]')) {
    button.addEventListener('click', event => {
      if (button.disabled) return;
      if (button.dataset.titleAction === 'start' || button.dataset.titleAction === 'continue') {
        remove();
      }
      actions[button.dataset.titleAction]?.(event);
    });
  }

  const hide = () => {
    screenIsActive = false;
    screen.hidden = true;
    syncMedia();
  };
  const show = () => {
    screenIsActive = true;
    screen.hidden = false;
    syncMedia();
  };
  const remove = () => {
    screenIsActive = false;
    video.pause();
    music.pause();
    video.querySelector('source')?.remove();
    for (const media of [video, music]) {
      media.removeAttribute('src');
      media.load();
    }
    window.removeEventListener('sms-consent-changed', refreshMedia);
    window.removeEventListener('sms-preferences-changed', refreshMedia);
    window.removeEventListener('sms-intro-complete', refreshMedia);
    window.removeEventListener('pointerdown', unlockOnGesture);
    window.removeEventListener('keydown', unlockOnGesture);
    screen.remove();
  };
  scene.events.on('pause', hide);
  scene.events.on('resume', show);
  scene.events.once('shutdown', () => {
    scene.events.off('pause', hide);
    scene.events.off('resume', show);
    remove();
  });
  return screen;
}
