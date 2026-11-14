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

window.__MEGA_ENTER_MAP__ = () => {
  const screen = document.getElementById('space-title-overlay');
  if (screen) { screen.querySelectorAll('video,audio').forEach(media => { media.pause(); media.removeAttribute('src'); media.load(); }); screen.remove(); }
  document.getElementById('boot')?.classList.add('hidden');
  document.getElementById('settings-toggle')?.setAttribute('hidden','');
};
import('./welcome/main.js').then(() => {
  if (game.isBooted) window.dispatchEvent(new Event('mega-map-ready'));
  else game.events.once('ready', () => window.dispatchEvent(new Event('mega-map-ready')));
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

