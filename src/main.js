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
    <div class="commander-intro__header"><span>◈ MISSION CONTROL // TRANSMISSION 001</span><span class="commander-intro__signal">● LIVE</span></div>
    <div class="commander-intro__display">
      <video id="commander-intro-video" src="/intro comander.mp4" playsinline preload="auto" controls></video>
      <div class="commander-intro__scanlines" aria-hidden="true"></div>
    </div>
    <div class="commander-intro__footer">
      <div><strong>COMMANDER BRIEFING</strong><small>MISSION STATUS: AWAITING DEPLOYMENT</small></div>
      <button type="button" id="commander-continue">CONTINUE ▶</button>
    </div>
    <p class="commander-intro__hint">Watch the briefing or continue directly to the mission.</p>
  </div>`;
document.getElementById('app').append(commanderOverlay);
const commanderVideo = document.getElementById('commander-intro-video');
let commanderStarted = false;
function enterMissionMap() {
  commanderVideo.pause();
  commanderOverlay.hidden = true;
  document.getElementById('settings-toggle')?.setAttribute('hidden', '');
  document.getElementById('boot')?.classList.add('hidden');
  const scene = game.scene.getScene('SpaceCenterScene');
  scene?.input?.keyboard?.resetKeys?.();
}
document.getElementById('commander-continue').addEventListener('click', enterMissionMap);
commanderVideo.addEventListener('ended', enterMissionMap);
commanderVideo.addEventListener('error', () => {
  commanderOverlay.querySelector('.commander-intro__hint').textContent =
    'Video unavailable. Select CONTINUE to enter the mission.';
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
  const prefs = window.__SMS_GET_PREFERENCES__?.();
  commanderVideo.muted = prefs?.audio === false;
  commanderVideo.volume = Math.min(1, Math.max(0, prefs?.musicVolume ?? 0.8));
  commanderVideo.currentTime = 0;
  void commanderVideo.play().catch(() => {
    commanderOverlay.querySelector('.commander-intro__hint').textContent =
      'Press play to watch the briefing, or CONTINUE to enter the mission.';
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

