// Módulo LAUNCH, versión 2: un juego de Phaser 3 con escenas separadas.
//
//   Boot → Briefing (misión) → Hangar (catálogo y revisión) → Pad (plataforma y cuenta regresiva)
//        → Flight (vuelo interactivo) ⇄ Map (órbita) → Result (resultado)
//
// Phaser dibuja el mundo (estrellas, Tierra, cohete, mapa); las pantallas de decisión y los controles
// son HTML encima del canvas, para que los botones sean grandes y accesibles en celular.

import { app, current, recompute, invalidateDecision, clearLaunch, inputs } from './store.js';
import { renderResources, resetForNewInputs } from './screens.js';
import { bindGlossary } from './ui.js';
import { prepareRetry } from './flow.js';
import { BootScene } from './scenes/BootScene.js';
import { BriefingScene, HangarScene, ResultScene } from './scenes/panels.js';
import { PadScene } from './scenes/PadScene.js';
import { FlightScene } from './scenes/FlightScene.js';
import { MapScene } from './scenes/MapScene.js';

const $ = (id) => document.getElementById(id);
const PANEL = { briefing: 'BriefingScene', catalog: 'HangarScene', check: 'HangarScene', result: 'ResultScene' };
const SCENE_STEP = { BriefingScene: 'briefing', HangarScene: null, PadScene: 'pad', FlightScene: 'flight', ResultScene: 'result' };
const STEPS = [
  ['briefing', 'Misión'], ['catalog', 'Cohete'], ['check', 'Revisión'], ['pad', 'Plataforma'], ['flight', 'Vuelo'], ['result', 'Resultado'],
];
let currentStep = 'briefing';

function allowed(step) {
  if (step === 'check') return Boolean(app.selectedId);
  if (step === 'pad') return app.confirmed;
  if (step === 'flight') return false; // solo se entra desde la cuenta regresiva
  if (step === 'result') return Boolean(app.flight);
  return true;
}

function stopAllExcept(keep) {
  for (const key of ['BriefingScene', 'HangarScene', 'PadScene', 'FlightScene', 'MapScene', 'ResultScene']) {
    if (key !== keep && app.game.scene.isActive(key)) app.game.scene.stop(key);
  }
}

app.nav = {
  go(step) {
    if (!allowed(step) && step !== 'flight') return;
    currentStep = step;
    const key = PANEL[step] ?? (step === 'pad' ? 'PadScene' : 'FlightScene');
    stopAllExcept(key);
    if (key === 'HangarScene') {
      const scene = app.game.scene.getScene('HangarScene');
      if (app.game.scene.isActive('HangarScene')) { scene.view = step; scene.mount(); } else app.game.scene.start('HangarScene', { view: step });
    } else if (app.game.scene.isActive(key)) {
      app.game.scene.stop(key); app.game.scene.start(key);
    } else app.game.scene.start(key);
    window.scrollTo(0, 0);
  },
  refresh({ keepFocus } = {}) {
    const scene = ['BriefingScene', 'HangarScene', 'ResultScene'].map((k) => app.game.scene.getScene(k)).find((s) => s.scene.isActive());
    if (!scene) return;
    const ui = $('ui');
    const top = ui.scrollTop;
    scene.mount();
    ui.scrollTop = top;
    if (keepFocus) {
      const el = document.getElementById(keepFocus);
      if (el) el.focus({ preventScroll: true });
    }
  },
  chrome(sceneKey) {
    if (SCENE_STEP[sceneKey]) currentStep = SCENE_STEP[sceneKey];
    else if (sceneKey === 'HangarScene' && currentStep !== 'check') currentStep = 'catalog';
    renderChrome(sceneKey);
  },
  retry() {
    prepareRetry();
    recompute();
    invalidateDecision();
    app.confirmed = true;
    app.nav.go('pad');
    // el lanzador sigue elegido: se vuelve a la plataforma con otro número de suerte (semilla)
    app.confirmed = true;
  },
  reset() {
    app.selectedId = null; app.options = {}; app.previousAttemptsMUSD = 0; app.attempts = 0;
    invalidateDecision(); clearLaunch(); recompute();
    app.nav.go('briefing');
  },
};

function renderChrome(sceneKey) {
  if (!app.data) return;
  const stepsEl = $('steps');
  const reached = (s) => STEPS.findIndex(([k]) => k === s);
  stepsEl.innerHTML = STEPS.map(([key, label], i) => {
    const on = key === currentStep;
    const done = i < reached(currentStep);
    const can = allowed(key) && key !== 'flight' && sceneKey !== 'FlightScene';
    return `<button data-step="${key}" class="${on ? 'is-active' : ''} ${done ? 'is-done' : ''}" ${can ? '' : 'disabled'} ${on ? 'aria-current="step"' : ''}><b>${done ? '✔' : i + 1}</b><span>${label}</span></button>`;
  }).join('');
  $('res-pills').innerHTML = renderResources({ compact: true });
  const full = $('resources');
  const panelLike = ['BriefingScene', 'HangarScene', 'ResultScene', 'PadScene'].includes(sceneKey);
  full.hidden = !panelLike;
  full.innerHTML = renderResources();
  document.body.dataset.scene = sceneKey;
}

$('steps').addEventListener('click', (event) => {
  const b = event.target.closest('button[data-step]');
  if (b && !b.disabled) app.nav.go(b.dataset.step);
});

bindGlossary();

if (!window.Phaser) {
  $('boot-error').hidden = false;
  $('boot-error').textContent = 'No se pudo cargar Phaser (vendor/phaser.min.js).';
} else {
  const Phaser = window.Phaser;
  app.game = new Phaser.Game({
    type: Phaser.CANVAS, // Canvas 2D: dibujos vectoriales simples, funciona igual en cualquier celular o computadora
    parent: 'game',
    backgroundColor: '#050b16',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    render: { antialias: false, pixelArt: true, roundPixels: true }, // pixel art nítido: sin suavizado de imágenes
    fps: { target: 60 },
    scene: [BootScene, BriefingScene, HangarScene, PadScene, FlightScene, MapScene, ResultScene],
  });
  window.__launch = { app, nav: app.nav }; // ayuda para probar desde la consola
}
