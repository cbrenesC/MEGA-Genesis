import { simText } from "../../../src/i18n/catalog.js";
import Phaser from 'phaser';
// Control Room hands a confirmed plan to the countdown, flight and results scenes.
import { app } from './store.js';
import { renderResources } from './screens.js';
import { bindGlossary } from './ui.js';
import { prepareRetry } from './flow.js';
import { evaluateAll } from './rules.js';
import { getLanguage, localizeDOM, t } from '../../../src/i18n/index.js';
import { PRIMARY_MISSION, returnToControl } from '../../../src/missions/missionTransfer.js';
import { BootScene } from './scenes/BootScene.js';
import { ResultScene } from './scenes/panels.js';
import { PadScene } from './scenes/PadScene.js';
import { FlightScene } from './scenes/FlightScene.js';
import { MapScene } from './scenes/MapScene.js';
import { startGameplayMusic } from '../../../src/welcome/core/gameAudio.js';

const $ = (id) => document.getElementById(id);
const SCENES = { pad: 'PadScene', flight: 'FlightScene', result: 'ResultScene' };
const STEPS = [['pad', simText("flight.launch-pad")], ['flight', simText("flight.flight")], ['result', simText("flight.result")]];
let currentStep = 'pad';

export function exitMission() { returnToControl(getLanguage()); }

function stopAllExcept(keep) {
  for (const key of [...Object.values(SCENES), 'MapScene']) {
    if (key !== keep && app.game.scene.isActive(key)) app.game.scene.stop(key);
  }
}

app.nav = {
  go(step) {
    const key = SCENES[step];
    if (!app.confirmed || !key) return;
    currentStep = step;
    stopAllExcept(key);
    app.game.scene.start(key);
  },
  chrome(sceneKey) {
    currentStep = Object.keys(SCENES).find(step => SCENES[step] === sceneKey) ?? currentStep;
    renderChrome(sceneKey);
  },
  retry() {
    const previous = app.previousAttemptsMUSD;
    prepareRetry();
    app.resolved.inputs.budget.committedMUSD += app.previousAttemptsMUSD - previous;
    app.evaluations = evaluateAll(app.data, app.resolved.inputs, app.options);
    app.nav.go('pad');
  },
  exit: exitMission,
};

function renderChrome(sceneKey) {
  if (!app.data) return;
  const profile = app.resolved.scenario.id;
  const brand = $('mission-brand');
  brand.removeAttribute('data-i18n');
  brand.textContent = t(profile === PRIMARY_MISSION ? 'missionFlight.lunarBrand' : `station.scenario.${profile}`);
  const stepsEl = $('steps');
  const reached = (s) => STEPS.findIndex(([k]) => k === s);
  stepsEl.innerHTML = STEPS.map(([key, label], i) => {
    const on = key === currentStep;
    const done = i < reached(currentStep);
    return `<span class="step ${on ? 'is-active' : ''} ${done ? 'is-done' : ''}" ${on ? 'aria-current="step"' : ''}><b>${done ? '✔' : i + 1}</b><span>${label}</span></span>`;
  }).join('');
  $('res-pills').innerHTML = renderResources({ compact: true });
  const full = $('resources');
  const panelLike = ['ResultScene', 'PadScene'].includes(sceneKey);
  full.hidden = !panelLike;
  full.innerHTML = renderResources();
  document.body.dataset.scene = sceneKey;
}

document.querySelectorAll('[data-mission-exit]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  exitMission();
}));
bindGlossary();
localizeDOM();

app.game = new Phaser.Game({
  type: Phaser.CANVAS, // Canvas 2D: dibujos vectoriales simples, funciona igual en cualquier celular o computadora
  parent: 'game',
  backgroundColor: '#050b16',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  render: { antialias: false, pixelArt: true, roundPixels: true }, // pixel art nítido: sin suavizado de imágenes
  fps: { target: 60 },
  scene: [BootScene, PadScene, FlightScene, MapScene, ResultScene],
});
startGameplayMusic();
window.__launch = { app, nav: app.nav }; // ayuda para probar desde la consola
