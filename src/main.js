import Phaser from 'phaser';
import { GAME } from './config.js';
import { BootScene } from './scenes/BootScene.js';
import { SpaceCenterScene } from './scenes/SpaceCenterScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import './ui/app.css';

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
commanderOverlay.setAttribute('aria-label', 'Introducción del comandante');
commanderOverlay.innerHTML = `
  <div class="commander-intro__panel">
    <div class="commander-intro__top"><span>◈ MISSION CONTROL // COMMANDER BRIEFING</span><span>● LIVE</span></div>
    <div class="commander-intro__screen">
  <video id="commander-intro-video" src="/intro_comander.mp4" autoplay playsinline preload="auto" disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" aria-label="Mensaje del comandante"></video>
    <button type="button" id="commander-skip" aria-label="Saltar introducción">SALTAR ▶▶</button>
    </div>
  </div>
  <div class="commander-intro__fallback" hidden>
    <p>COMMANDER TRANSMISSION READY</p>
    <button type="button" id="commander-retry">▶ INICIAR TRANSMISIÓN</button>
  </div>`;
document.getElementById('app').append(commanderOverlay);
const commanderVideo = document.getElementById('commander-intro-video');
let commanderStarted = false;
let commanderClosing = false;
const COMMANDER_FADE_MS = 550;
function enterMissionMap() {
  if (commanderClosing || commanderOverlay.hidden) return;
  commanderClosing = true;
  commanderOverlay.classList.remove('commander-intro--visible');
  commanderOverlay.classList.add('commander-intro--leaving');
  commanderVideo.volume = 0;
  window.setTimeout(() => {
    commanderVideo.pause();
    commanderOverlay.hidden = true;
    commanderOverlay.classList.remove('commander-intro--leaving');
  document.getElementById('settings-toggle')?.setAttribute('hidden', '');
  document.getElementById('boot')?.classList.add('hidden');
  const scene = game.scene.getScene('SpaceCenterScene');
    scene?.input?.keyboard?.resetKeys?.();
  }, COMMANDER_FADE_MS);
}
document.getElementById('commander-skip').addEventListener('click', enterMissionMap);
document.getElementById('commander-retry').addEventListener('click', () => { commanderVideo.muted = false; void commanderVideo.play(); });
commanderVideo.addEventListener('ended', enterMissionMap);
commanderVideo.addEventListener('error', () => {
  const fallback = commanderOverlay.querySelector('.commander-intro__fallback');
  fallback.hidden = false;
  fallback.querySelector('p').textContent = 'TRANSMISSION UNAVAILABLE';
});
window.__MEGA_ENTER_MAP__ = () => {
  if (commanderStarted) return;
  commanderStarted = true;
  const screen = document.getElementById('space-title-overlay');
  if (screen) {
    screen.querySelectorAll('video,audio').forEach(media => {
      media.pause(); media.removeAttribute('src'); media.load();
    });
    screen.remove();
  }
  document.getElementById('boot')?.classList.add('hidden');
  commanderOverlay.hidden = false;
  commanderOverlay.classList.remove('commander-intro--leaving');
  // Two frames guarantee the browser paints the initial transparent state.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    commanderOverlay.classList.add('commander-intro--visible');
  }));
  const prefs = window.__SMS_GET_PREFERENCES__?.();
  commanderVideo.muted = prefs?.audio === false;
  commanderVideo.volume = Math.min(1, Math.max(0, prefs?.musicVolume ?? 0.8));
  commanderVideo.currentTime = 0;
  void commanderVideo.play().catch(() => {
    // Browsers may block autoplay with sound; retry muted automatically.
    commanderVideo.muted = true;
    void commanderVideo.play().catch(() => {
      commanderOverlay.querySelector('.commander-intro__fallback').hidden = false;
    });
  });
};
import('./welcome/main.js').then(() => {
  // Phaser has already been instantiated. Never wait for a potentially missed boot event.
  window.__MEGA_MAP_READY__ = true;
  window.dispatchEvent(new Event('mega-map-ready'));
}).catch(error => console.error('No se pudo cargar la bienvenida original',error));

document.getElementById('fullscreen-button')?.addEventListener('click', () => {
  if (!game.scale.isFullscreen) game.scale.startFullscreen();
  else game.scale.stopFullscreen();
});

document.getElementById('resume-button')?.addEventListener('click', () => {
  const pause = game.scene.getScene('PauseScene');
  if (pause?.scene.isActive()) pause.resumeExploration();
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

window.addEventListener('beforeunload', () => game.destroy(true));

