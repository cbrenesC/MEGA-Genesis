// Controlador del módulo de lanzamiento: estado, eventos y orquestación.
import { loadGameData, browserReadJson } from './data.js';
import * as E from './engine.js';
import { loadInput, publishResult, team as teamStore } from './integration.js';
import { MOCK_PRESETS, MOCK_DEFAULT, mockInput } from './mock.js';
import { LaunchSequence } from './sequence.js';
import * as UI from './ui.js';

const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

const state = {
  source: 'mock', preset: params.get('preset') || MOCK_DEFAULT,
  choice: { launcher_id: null, site_id: null },
  reports: {}, report: null, result: null, output: null, published: false, running: false,
  sort: 'cost', team: {}, solo: true,
};
let data, input, seq = null;
const ctx = () => ({ data, input, state });

async function init() {
  try {
    data = await loadGameData(browserReadJson);
  } catch (err) {
    $('app').innerHTML = `<p class="warnline">No se pudieron cargar los datos (${UI.esc(err.message)}). Abre esta página desde el servidor del proyecto (<code>npm run dev</code>), no desde un archivo local.</p>`;
    return;
  }
  const loaded = loadInput(data, { preset: state.preset, difficulty: params.get('difficulty') || 'normal' });
  input = loaded.input; state.source = loaded.source;
  if (!MOCK_PRESETS[state.preset]) state.preset = MOCK_DEFAULT;
  if (loaded.problems.length) console.warn('[launch] entrada compartida inválida, se usan mocks:', loaded.problems);
  state.team = teamStore.load();
  bind();
  recompute();
}

/** Recalcula informes y repinta todo (excepto la animación en curso). */
function recompute() {
  const vis = E.visibleLaunchers(data, input.difficulty).map((l) => l.id);
  if (state.choice.launcher_id && !vis.includes(state.choice.launcher_id)) state.choice = { launcher_id: null, site_id: null };
  state.reports = Object.fromEntries(E.evaluateAll(data, input).map((r) => [r.launcher_id, r]));
  state.report = state.choice.launcher_id ? E.checkCompatibility(data, input, state.choice) : null;
  if (state.report) state.reports[state.choice.launcher_id] = state.report;
  renderAll();
}

function renderAll() {
  const c = ctx();
  $('difficulty-badge').textContent = data.config.difficulty[input.difficulty].label;
  renderGuide();
  UI.renderMock($('mock-panel'), c, MOCK_PRESETS);
  UI.renderMission($('step-mission'), c);
  UI.renderCatalog($('step-catalog'), c);
  UI.renderReport($('step-check'), c);
  UI.renderCompare($('step-compare'), c);
  if (!state.running) { UI.renderLaunchPanel($('step-launch'), c); UI.renderResult($('step-result'), c); }
  UI.renderResources($('res-panel'), c);
  UI.renderTeam($('team-panel'), c);
}

function renderGuide() {
  const g = $('guide'), diff = data.config.difficulty[input.difficulty];
  if (!diff.guided) { g.hidden = true; return; }
  g.hidden = false;
  const r = state.report;
  g.innerHTML = '🧭 <strong>Modo guiado.</strong> ' + (state.result ? 'Revisa qué pasó y confirma para continuar.'
    : !r ? 'Paso 1: mira cuánto pesa tu nave y a qué órbita va. Paso 2: elige un lanzador (el verde = cabe con margen sano).'
    : !r.compatible ? 'Este lanzador no sirve todavía. Lee el “¿Por qué?” y las sugerencias, o prueba otro.'
    : 'Todo en orden. Compara con las otras opciones o pulsa lanzar.');
}

function resetResult() { state.result = null; state.output = null; state.published = false; }

// ---------- Eventos ----------
function bind() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
    if (state.running && t.dataset.action !== 'skip') return;
    const a = t.dataset.action;
    if (a === 'select-launcher') { state.choice = { launcher_id: t.dataset.id, site_id: null }; resetResult(); recompute(); }
    else if (a === 'sort') { state.sort = t.dataset.key; renderAll(); }
    else if (a === 'vote') { vote(t.dataset.role, t.dataset.v); }
    else if (a === 'launch') launch();
    else if (a === 'skip') seq?.skip();
    else if (a === 'confirm') confirm();
    else if (a === 'reset') { resetResult(); recompute(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('tr[data-action]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });
  document.addEventListener('change', (e) => {
    const t = e.target, a = t.dataset?.action;
    if (!a || state.running) return;
    if (a === 'set-site') { state.choice.site_id = t.value; resetResult(); recompute(); }
    else if (a === 'preset') { state.preset = t.value; input = { ...mockInput(t.value, input.difficulty) }; state.choice = { launcher_id: null, site_id: null }; resetResult(); recompute(); }
    else if (a === 'difficulty') { input.difficulty = t.value; resetResult(); recompute(); }
    else if (a === 'orbit') { input.target_orbit = { id: t.value }; resetResult(); recompute(); }
    else if (a === 'mass') { input.spacecraft.mass_kg = Math.max(1, Number(t.value) || 1); resetResult(); recompute(); }
    else if (a === 'budget') { input.budget_musd = Math.max(0.1, Number(t.value) || 1); resetResult(); recompute(); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target, a = t.dataset?.action;
    if (a === 'set-inclination') { input.target_orbit = { ...input.target_orbit, inclination_deg: Number(t.value) }; resetResult(); recompute(); }
    else if (a === 'vote-note') { state.team[t.dataset.role] = { ...state.team[t.dataset.role], note: t.value }; teamStore.save(state.team); }
  });
}

function vote(role, v) {
  const cur = state.team[role];
  state.team[role] = cur?.v === v ? { v: null } : { v, note: cur?.note || '' };
  teamStore.save(state.team);
  UI.renderTeam($('team-panel'), ctx());
  if (!state.running) UI.renderLaunchPanel($('step-launch'), ctx());
}

// ---------- Lanzamiento ----------
function launch() {
  if (!state.report?.compatible || state.running) return;
  resetResult();
  const seed = (input.seed ?? (Date.now() & 0x7fffffff));
  const result = E.simulateLaunch(data, input, state.choice, seed);
  state.running = true;
  $('step-result').hidden = true;
  UI.renderLaunchPanel($('step-launch'), ctx());
  const launcher = E.getLauncher(data, state.choice.launcher_id);
  const cap = $('caption'), list = $('phases');
  seq = new LaunchSequence($('seq'), {
    launcher, result, reduced,
    onPhase: (ph, i) => {
      [...list.children].forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('now', k === i); li.classList.toggle('bad', k === i && ph.state === 'fail'); li.classList.toggle('warn', k === i && ph.state === 'warn'); });
      const evs = result.events.filter((e) => e.phase === ph.id);
      cap.innerHTML = `<strong>${UI.esc(ph.label)}</strong> — ${UI.esc(ph.text)}${evs.map((e) => `<div class="evt ${e.severity}">⚠ ${UI.esc(e.title)}: ${UI.esc(e.text)}</div>`).join('')}`;
    },
    onDone: () => {
      state.running = false; state.result = result;
      const review = Object.fromEntries(Object.entries(state.team).filter(([, s]) => s.v).map(([r, s]) => [r, { vote: s.v, note: s.note || '' }]));
      state.output = E.buildOutput(result, state.report, Object.keys(review).length ? review : null);
      const btn = document.querySelector('[data-action="launch"]');
      if (btn) { btn.disabled = false; btn.textContent = '🚀 Lanzar de nuevo (práctica)'; }
      document.querySelector('[data-action="skip"]')?.setAttribute('hidden', '');
      UI.renderResult($('step-result'), ctx());
      UI.renderResources($('res-panel'), ctx());
      renderGuide();
      $('step-result').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    },
  });
  seq.start();
}

function confirm() {
  if (!state.output) return;
  publishResult(state.output);
  state.published = true;
  UI.renderResult($('step-result'), ctx());
}

init();
