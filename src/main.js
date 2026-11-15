import Phaser from 'phaser';
import { GAME } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { SpaceCenterScene } from './scenes/SpaceCenterScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { getPreferences } from './welcome/core/consent.js';
import { localizeDOM, t } from './i18n/index.js';
import { installCommanderCaptions } from './welcome/ui/commanderCaptions.js';
import './ui/app.css';

localizeDOM();

const gameContainer = document.getElementById('game-container');
gameContainer.inert = true;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: GAME.background,
  width: GAME.viewWidth,
  height: GAME.viewHeight,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  render: { pixelArt: true, roundPixels: true, antialias: false, powerPreference: 'high-performance' },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.viewWidth,
    height: GAME.viewHeight,
    expandParent: false,
    fullscreenTarget: 'app',
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false, gravity: { x: 0, y: 0 }, fps: 60 },
  },
  scene: [BootScene, SpaceCenterScene, PauseScene],
});

const commanderOverlay = document.createElement('section');
commanderOverlay.id = 'commander-intro';
commanderOverlay.className = 'commander-intro';
commanderOverlay.hidden = true;
commanderOverlay.setAttribute('role', 'dialog');
commanderOverlay.setAttribute('aria-modal', 'true');
commanderOverlay.dataset.i18nAria = 'briefing.title';
commanderOverlay.innerHTML = `
  <div class="commander-intro__panel">
    <div class="commander-intro__top"><span data-i18n="briefing.header">◈ MISSION CONTROL // COMMANDER BRIEFING</span><span data-i18n="briefing.live">● LIVE</span></div>
    <div class="commander-intro__screen">
      <video id="commander-intro-video" playsinline preload="none" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" data-i18n-aria="briefing.video"></video>
      <button type="button" id="commander-captions" aria-pressed="true" data-i18n="briefing.captions">Captions</button>
      <button type="button" id="commander-skip" data-i18n-aria="briefing.skipLabel" data-i18n="briefing.skip">Skip ▶▶</button>
      <div class="commander-intro__fallback" hidden>
        <p role="status" data-i18n="briefing.ready">Commander transmission ready</p>
        <button type="button" id="commander-retry" data-i18n="briefing.retry">▶ Play transmission</button>
      </div>
    </div>
  </div>`;
document.getElementById('app').append(commanderOverlay);
localizeDOM(commanderOverlay);
const commanderVideo = document.getElementById('commander-intro-video');
installCommanderCaptions(commanderVideo, document.getElementById('commander-captions'));
let commanderStarted = false;
let commanderClosing = false;
const COMMANDER_FADE_MS = 550;
function unlockMissionMap() {
  gameContainer.inert = false;
  const scene = game.scene.getScene('SpaceCenterScene');
  scene?.input?.keyboard?.resetKeys?.();
  scene?.input?.keyboard?.enableGlobalCapture();
  gameContainer.focus({ preventScroll: true });
}

function enterMissionMap() {
  if (commanderClosing || commanderOverlay.hidden) return;
  commanderClosing = true;
  commanderOverlay.classList.remove('commander-intro--visible');
  commanderOverlay.classList.add('commander-intro--leaving');
  commanderVideo.pause();
  window.setTimeout(() => {
    commanderOverlay.hidden = true;
    commanderOverlay.classList.remove('commander-intro--leaving');
    unlockMissionMap();
  }, COMMANDER_FADE_MS);
}

const skipBriefing = document.getElementById('commander-skip');
const retryBriefing = document.getElementById('commander-retry');
const briefingFallback = commanderOverlay.querySelector('.commander-intro__fallback');
skipBriefing.addEventListener('click', enterMissionMap);
retryBriefing.addEventListener('click', async () => {
  if (commanderClosing) return;
  commanderVideo.muted = !getPreferences().audio;
  try {
    await commanderVideo.play();
    briefingFallback.hidden = true;
    skipBriefing.focus();
  } catch {
    briefingFallback.hidden = false;
  }
});
commanderVideo.addEventListener('ended', enterMissionMap);
commanderVideo.addEventListener('error', () => {
  briefingFallback.hidden = false;
  const status = briefingFallback.querySelector('p');
  status.dataset.i18n = 'briefing.unavailable';
  status.textContent = t(status.dataset.i18n);
  retryBriefing.hidden = true;
});
window.__MEGA_ENTER_MAP__ = () => {
  if (commanderStarted) return;
  commanderStarted = true;
  document.getElementById('boot')?.classList.add('hidden');
  const prefs = getPreferences();
  if (!prefs.animations) {
    unlockMissionMap();
    return;
  }
  commanderOverlay.hidden = false;
  skipBriefing.focus({ preventScroll: true });
  // Two frames guarantee the browser paints the initial transparent state.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!commanderClosing) commanderOverlay.classList.add('commander-intro--visible');
  }));
  commanderVideo.muted = !prefs.audio;
  commanderVideo.volume = prefs.musicVolume;
  commanderVideo.src = '/intro_comander.mp4';
  void commanderVideo.play().catch(async () => {
    if (commanderClosing) return;
    // Some browsers allow inline autoplay only when muted.
    commanderVideo.muted = true;
    try {
      await commanderVideo.play();
    } catch {
      if (!commanderClosing) briefingFallback.hidden = false;
    }
  });
};
import('./welcome/main.js').then(() => {
  window.__MEGA_MAP_READY__ = true;
  window.dispatchEvent(new Event('mega-map-ready'));
}).catch(error => {
  console.error('No se pudo cargar la bienvenida original', error);
  document.getElementById('boot')?.classList.add('hidden');
  unlockMissionMap();
});

document.getElementById('fullscreen-button')?.addEventListener('click', () => {
  if (!game.scale.isFullscreen) game.scale.startFullscreen();
  else game.scale.stopFullscreen();
});

document.addEventListener('fullscreenchange', () => {
  const fullscreen = document.getElementById('fullscreen-button');
  const key = document.fullscreenElement ? 'map.exitFullscreen' : 'map.fullscreen';
  fullscreen.dataset.i18nAria = fullscreen.dataset.i18nTitle = key;
  localizeDOM(fullscreen);
});

document.getElementById('mobile-pause')?.addEventListener('click', () => {
  const scene = game.scene.getScene('SpaceCenterScene');
  if (scene?.scene.isActive()) scene.pauseExploration();
});

document.querySelectorAll('[data-move]').forEach((button) => {
  const direction = button.dataset.move;
  const start = (event) => { event.preventDefault(); game.scene.getScene('SpaceCenterScene')?.setMobileDirection(direction, true); };
  const end = (event) => { event.preventDefault(); game.scene.getScene('SpaceCenterScene')?.setMobileDirection(direction, false); };
  button.addEventListener('pointerdown', start);
  for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(eventName, end);
});

document.getElementById('mobile-interact')?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  game.scene.getScene('SpaceCenterScene')?.interact();
});

window.addEventListener('sms-settings-toggled', ({ detail }) => {
  const keyboard = game.scene.getScene('SpaceCenterScene')?.input?.keyboard;
  if (!keyboard) return;
  keyboard.resetKeys();
  if (detail.open || gameContainer.inert) keyboard.disableGlobalCapture();
  else keyboard.enableGlobalCapture();
});

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) game.destroy(true);
});

