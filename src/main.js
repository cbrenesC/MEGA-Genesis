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

const loading = document.getElementById('loading-screen');
game.events.once('ready', () => window.setTimeout(() => loading?.classList.add('is-gone'), 500));

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

/* Welcome flow adapted from the demogame intro for the MEGA-Genesis map. */
const welcome = document.getElementById('welcome-overlay');
const welcomeLoader = document.getElementById('welcome-loader');
const welcomeSetup = document.getElementById('welcome-setup');
const welcomeConsent = document.getElementById('welcome-consent');
const welcomeTitle = document.getElementById('welcome-title');
const welcomeStatus = document.getElementById('welcome-status');
const welcomeFill = document.getElementById('welcome-progress-fill');
const welcomeStart = performance.now();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const savedPrefs = (() => { try { return JSON.parse(localStorage.getItem('mega-genesis-preferences') || '{}'); } catch { return {}; } })();
const welcomePrefs = { language: 'en', audio: true, animations: true, music: 18, effects: 45, ...savedPrefs };
const hasConsent = (() => { try { return localStorage.getItem('mega-genesis-consent') === 'yes'; } catch { return false; } })();
const showWelcome = element => { element.hidden = false; };
const hideWelcome = element => { element.hidden = true; };
function syncWelcomeSettings() {
  for (const [id,key] of [['welcome-language','language'],['welcome-audio','audio'],['welcome-animations','animations'],['welcome-music','music'],['welcome-effects','effects']]) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = welcomePrefs[key];
    else el.value = welcomePrefs[key];
    el.addEventListener('input', () => {
      welcomePrefs[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      if (el.type === 'range') document.getElementById(id+'-value').textContent = el.value + '%';
      if (hasConsent) { try { localStorage.setItem('mega-genesis-preferences', JSON.stringify(welcomePrefs)); } catch {} }
    });
  }
}
syncWelcomeSettings();
document.getElementById('welcome-terms')?.addEventListener('change', event => {
  document.getElementById('welcome-accept').disabled = !event.target.checked;
});
const clickOnce = id => new Promise(resolve => document.getElementById(id).addEventListener('click', resolve, { once: true }));
async function runWelcomeSequence() {
  const stages = [['DESCARGANDO RECURSOS',18],['PREPARANDO AUDIO Y VIDEO',45],['RENDERIZANDO ENTORNOS',75],['SISTEMAS LISTOS',100]];
  let index = 0;
  const timer = setInterval(() => {
    const stage = stages[Math.min(index++, stages.length - 1)];
    welcomeStatus.textContent = stage[0];
    welcomeFill.style.width = stage[1] + '%';
  }, 600);
  await new Promise(resolve => {
    if (game.isBooted) resolve();
    else game.events.once('ready',resolve);
  });
  await wait(Math.max(0, 3000 - (performance.now() - welcomeStart)));
  clearInterval(timer);
  welcomeStatus.textContent = 'SISTEMAS LISTOS';
  welcomeFill.style.width = '100%';
  await wait(250);
  hideWelcome(welcomeLoader);
  if (!hasConsent) {
    showWelcome(welcomeSetup);
    await clickOnce('welcome-continue');
    hideWelcome(welcomeSetup);
    showWelcome(welcomeConsent);
    const consentChoice = await Promise.race([clickOnce('welcome-accept'),clickOnce('welcome-decline')].map((promise,index)=>promise.then(()=>index)));
    const accepted = consentChoice === 0;
    if (accepted) {
      try {
        localStorage.setItem('mega-genesis-consent','yes');
        localStorage.setItem('mega-genesis-preferences',JSON.stringify(welcomePrefs));
      } catch {}
    }
    hideWelcome(welcomeConsent);
  }
  showWelcome(welcomeTitle);
}
runWelcomeSequence().catch(error => {
  console.error('Welcome sequence failed',error);
  hideWelcome(welcomeLoader); hideWelcome(welcomeSetup); hideWelcome(welcomeConsent);
  showWelcome(welcomeTitle);
});
document.getElementById('welcome-play')?.addEventListener('click', () => {
  welcome.classList.add('welcome-exit');
  setTimeout(() => { welcome.hidden = true; }, 450);
});
document.getElementById('welcome-settings')?.addEventListener('click', () => {
  hideWelcome(welcomeTitle);
  showWelcome(welcomeSetup);
  document.getElementById('welcome-continue').addEventListener('click', () => {
    hideWelcome(welcomeSetup); showWelcome(welcomeTitle);
    if (hasConsent) { try { localStorage.setItem('mega-genesis-preferences',JSON.stringify(welcomePrefs)); } catch {} }
  }, { once: true });
});
