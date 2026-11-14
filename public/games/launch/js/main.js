// Controlador de la interfaz del módulo LAUNCH.
// Flujo: 1 Misión → 2 Lanzador → 3 Compatibilidad → 4 Lanzamiento → 5 Resultado.
// La lógica de juego vive en rules.js; aquí solo se arma la interfaz y se guarda el estado.

import {
  evaluateAll, buildSuggestions, buildRequests, simulateLaunch, tradeHighlights, matchReferenceMission,
  getDifficulty, operationalPropellant, FLIGHT_PHASES, fmtKg, fmtMUSD, fmtPct,
} from './rules.js';
import { loadData, resolveInputs, writeLaunch, clearLaunch, onSharedChange, buildLaunchOutput, ROLES, DIFFICULTIES } from './state.js';
import { LaunchSequence } from './sequence.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STEPS = ['mission', 'catalog', 'check', 'launch', 'result'];
const STATUS_TEXT = { green: 'margen cómodo', yellow: 'margen justo', red: 'margen arriesgado', blocked: 'no compatible' };
const SHORT_FAIL = { orbit: 'no llega a ese destino', mass: 'la nave es demasiado pesada', fairing: 'la nave no cabe en la cofia', budget: 'no alcanza el presupuesto', inclination: 'no puede lanzar a esa inclinación' };
const RESULT_TEXT = {
  exito: { title: '✔ Éxito: la nave está en su órbita', text: 'El lanzador cumplió. La nave pasa al siguiente módulo con la órbita y la vida útil indicadas.' },
  exito_parcial: { title: '◐ Éxito parcial', text: 'La nave sobrevivió, pero algo no salió perfecto: perdió vida útil o quedó en una órbita distinta. El siguiente módulo debe tenerlo en cuenta.' },
  falla: { title: '✖ Falla: misión perdida', text: 'El lanzamiento falló y la nave se perdió. Pasa en la vida real: por eso la confiabilidad importa tanto para misiones caras y únicas.' },
};

const app = {
  data: null,
  scenarioId: null,
  difficulty: null,
  teamMode: false,
  step: 'mission',
  selectedId: null,
  options: {}, // por lanzador: { siteId, propellantOffloadKg }
  confirmed: false,
  eventsEnabled: true,
  seed: randomSeed(),
  flight: null,
  playing: false,
  acks: {},
  notes: '',
  onlyCompatible: false,
  previousAttemptsMUSD: 0,
  attempts: 0,
  resolved: null,
  evaluations: [],
};
let sequence;

function randomSeed() {
  return Math.floor(Math.random() * 999999) + 1;
}

// ---------------------------------------------------------------------------
// Estado derivado
// ---------------------------------------------------------------------------

function recompute() {
  const resolved = resolveInputs(app.data, { scenarioId: app.scenarioId, difficulty: app.difficulty, params: new URLSearchParams(location.search) });
  app.scenarioId = resolved.scenario.id;
  // Si ya se compró un lanzamiento que falló, ese dinero sigue gastado.
  resolved.inputs.budget.committedMUSD += app.previousAttemptsMUSD;
  app.resolved = resolved;
  app.evaluations = evaluateAll(app.data, resolved.inputs, app.options);
  if (app.selectedId && !app.evaluations.some((e) => e.launcherId === app.selectedId)) app.selectedId = null;
}

const inputs = () => app.resolved.inputs;
const diff = () => getDifficulty(app.data.rules, inputs().difficulty);
const current = () => app.evaluations.find((e) => e.launcherId === app.selectedId) ?? null;
const orbitDef = () => app.data.orbits.find((o) => o.id === inputs().orbit.type);

// Cualquier cambio de decisión invalida la confirmación y el vuelo anterior.
function invalidateDecision() {
  app.confirmed = false;
  app.flight = null;
  app.acks = {};
}

function requiredRoles(evaluation) {
  const roles = new Set(['spacecraft', 'mission']);
  for (const r of buildRequests(evaluation, inputs())) roles.add(r.toRole);
  roles.delete('launch');
  return [...roles];
}

function teamApproved(evaluation) {
  if (!app.teamMode) return true;
  return requiredRoles(evaluation).every((role) => app.acks[role]);
}

function currentOutput(status) {
  const e = current();
  if (!e) return null;
  return buildLaunchOutput({
    status,
    inputs: inputs(),
    sources: app.resolved.sources,
    evaluation: e,
    flight: app.flight,
    requests: buildRequests(e, inputs()),
    teamReview: app.teamMode ? { acks: { ...app.acks }, notes: app.notes, requiredRoles: requiredRoles(e) } : null,
    eventsEnabled: app.eventsEnabled,
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render() {
  renderSteps();
  renderMission();
  renderCatalog();
  renderCheck();
  renderLaunchPanel();
  renderResult();
  renderResources();
}

function stepAllowed(step) {
  if (step === 'check') return Boolean(app.selectedId);
  if (step === 'launch') return app.confirmed;
  if (step === 'result') return Boolean(app.flight) && !app.playing;
  return true;
}

function go(step) {
  if (!stepAllowed(step) || app.playing) return;
  app.step = step;
  for (const s of STEPS) $(`step-${s}`).hidden = s !== step;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderSteps() {
  const doneIndex = app.flight ? 4 : app.confirmed ? 3 : app.selectedId ? 2 : 1;
  document.querySelectorAll('.steps button').forEach((button) => {
    const step = button.dataset.step;
    const index = STEPS.indexOf(step);
    button.classList.toggle('is-active', step === app.step);
    button.classList.toggle('is-done', index < doneIndex && step !== app.step);
    button.disabled = !stepAllowed(step) || app.playing;
  });
}

const sourceTag = (key) => (app.resolved.sources[key] === 'compartido' ? '<span class="tag shared" title="Dato recibido del estado compartido del juego">COMPARTIDO</span>' : app.resolved.sources[key] === 'mock' ? '<span class="tag mock" title="Dato simulado: el módulo correspondiente aún no lo publica">MOCK</span>' : '');

function renderMission() {
  const { spacecraft: sc, orbit, budget, schedule } = inputs();
  const od = orbitDef();
  const players = inputs().team?.players ?? [];
  $('mission-card').innerHTML = `
    <h2>${esc(inputs().missionName)}</h2>
    <p class="muted">${esc(inputs().objective)}</p>
    <dl class="facts">
      <dt>Nave ${sourceTag('spacecraft')}</dt><dd>${esc(sc.name ?? '—')} · <b>${fmtKg(sc.massKg)}</b> con combustible</dd>
      <dt>Tamaño plegada</dt><dd>${sc.diameterM} m de diámetro × ${sc.heightM} m de alto</dd>
      <dt>Combustible</dt><dd>${fmtKg(sc.propellantKg)}${sc.propellantKg ? ` (${fmtKg(operationalPropellant(sc))} para operar)` : ' — sin motor propio'}</dd>
      <dt>Vida útil de diseño</dt><dd>${sc.designLifetimeYears} años</dd>
      <dt>Instrumentos</dt><dd>${sc.instruments.length ? sc.instruments.map((i) => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') : '—'}</dd>
      <dt>Órbita objetivo ${sourceTag('orbit')}</dt><dd>${esc(od?.name ?? orbit.type)}${orbit.altitudeKm != null && od?.needsInclination ? ` · ${orbit.altitudeKm} km` : ''}${orbit.inclinationDeg != null && od?.needsInclination ? ` · ${orbit.inclinationDeg}°` : ''}</dd>
      <dt>Presupuesto ${sourceTag('budget')}</dt><dd>${fmtMUSD(budget.totalMUSD)} en total · ${fmtMUSD(budget.committedMUSD)} ya comprometidos por otros equipos</dd>
      <dt>Calendario ${sourceTag('schedule')}</dt><dd>Fecha objetivo de lanzamiento: dentro de ${schedule.monthsToTargetDate} meses${od?.window && diff().launchWindows && od.window.everyMonths > 1 ? ` · próxima ventana en ${schedule.nextWindowMonths} meses` : ''}</dd>
      ${players.length ? `<dt>Equipo</dt><dd>${players.map((p) => `${esc(p.name)} (${esc(ROLES[p.role] ?? p.role)})`).join(', ')}</dd>` : ''}
    </dl>`;

  const anyMock = Object.values(app.resolved.sources).includes('mock');
  $('scenario-field').hidden = !anyMock;
  $('scenario').innerHTML = app.data.mocks.scenarios.map((s) => `<option value="${s.id}" ${s.id === app.scenarioId ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
  $('difficulty').innerHTML = '<legend>Dificultad</legend>' + DIFFICULTIES.map((level) => {
    const d = app.data.rules.difficulty[level];
    return `<label><input type="radio" name="difficulty" value="${level}" ${level === inputs().difficulty ? 'checked' : ''}> <b>${d.label}</b><small>${esc(d.description)}</small></label>`;
  }).join('');
  $('team-mode').checked = app.teamMode;
  $('role-badge').textContent = app.teamMode ? 'MODO EQUIPO · ROL: Lanzamiento / Planificación' : 'ROL: Lanzamiento / Planificación de misión';
}

function renderCatalog() {
  const od = orbitDef();
  const { orbit, spacecraft: sc } = inputs();
  const maxDv = Math.max(...app.data.orbits.map((o) => o.deltaVKmS));
  $('destination-card').innerHTML = `
    <h2>Destino: ${esc(od.name)} <button class="term" data-term="orbita-alta" aria-label="¿Por qué una órbita alta cuesta más?">?</button></h2>
    <p>${esc(od.plain)} <span class="muted">Ejemplos: ${esc(od.examples)}</span></p>
    <p class="muted">Cuánto "cuesta" llegar a cada destino, en Δv <button class="term" data-term="delta-v" aria-label="¿Qué es delta-v?">?</button> (aproximado):</p>
    <div class="dv-bars">${app.data.orbits.map((o) => `
      <div class="dv-row ${o.id === orbit.type ? 'is-target' : ''}"><span>${o.id === orbit.type ? '▶ ' : ''}${esc(o.name)}</span><span class="bar"><i style="width:${(o.deltaVKmS / maxDv) * 100}%"></i></span><span>${o.deltaVKmS} km/s</span></div>`).join('')}
    </div>
    ${diff().inclinationRules && od.needsInclination && orbit.inclinationDeg != null ? `<p class="muted">Inclinación pedida: <b>${orbit.inclinationDeg}°</b> <button class="term" data-term="inclinacion" aria-label="¿Qué es la inclinación?">?</button> — importa desde qué latitud despega el cohete.</p>` : ''}`;

  // Las etiquetas de comparación solo tienen sentido si hay al menos dos opciones válidas.
  const highlights = app.evaluations.filter((e) => e.compatible).length > 1 ? tradeHighlights(app.evaluations) : {};
  const tagFor = (id) => [
    highlights.cheapest === id && 'Más barato',
    highlights.mostReliable === id && 'Más confiable',
    highlights.mostMargin === id && 'Más margen',
    highlights.soonest === id && 'Sale antes',
  ].filter(Boolean).map((t) => `<span class="tag highlight">${t}</span>`).join('');

  const list = app.onlyCompatible ? app.evaluations.filter((e) => e.compatible) : app.evaluations;
  $('catalog').innerHTML = list.length ? list.map((e) => {
    const l = e.launcher;
    const fails = e.checks.filter((c) => c.status === 'fail').map((c) => SHORT_FAIL[c.id]).filter(Boolean);
    const usage = e.capacityKg > 0 ? Math.min(100, (e.launchMassKg / e.capacityKg) * 100) : 100;
    const capText = e.baseCapacityKg == null
      ? `No llega a ${esc(orbit.type)}`
      : `Nave ${fmtKg(e.launchMassKg)} de ${fmtKg(e.capacityKg)} posibles a ${esc(orbit.type)}${e.planeChangeDeg ? ` (reducida por inclinación)` : ''}`;
    return `
      <div class="lv ${e.launcherId === app.selectedId ? 'is-selected' : ''} ${e.compatible ? '' : 'is-locked'}">
        <h3>${esc(l.name)}</h3>
        <div class="provider">${esc(l.provider)}</div>
        <div class="tags"><span class="tag class">${esc(l.class)}</span>${l.fictional ? '<span class="tag fict" title="Configuración parcialmente ficticia: ver fuentes">PARCIALMENTE FICTICIO</span>' : ''}${l.pricing === 'por-kg' ? '<span class="tag class">viaje compartido</span>' : ''}${e.compatible ? tagFor(e.launcherId) : ''}</div>
        <p>${esc(l.summary)}</p>
        <div class="capbar" role="img" aria-label="${capText}"><i class="${e.marginStatus}" style="width:${usage}%"></i></div>
        <div class="capbar-label">${capText}</div>
        <dl>
          <dt>Costo</dt><dd>${fmtMUSD(e.launchCostMUSD)}${l.pricing === 'por-kg' ? ` <small class="muted">(${l.costPerKgUSD.toLocaleString('es')} USD/kg)</small>` : ''}${e.delayCostMUSD ? ` <small class="status-yellow">+ ${fmtMUSD(e.delayCostMUSD)} por ${e.date.delayMonths} meses de retraso</small>` : ''}</dd>
          <dt>Confiabilidad <button class="term" data-term="confiabilidad" aria-label="¿Qué es la confiabilidad?">?</button></dt><dd>${fmtPct(l.reliability)}</dd>
          <dt>Cofia <button class="term" data-term="cofia" aria-label="¿Qué es la cofia?">?</button></dt><dd>${l.fairing.diameterM} × ${l.fairing.heightM} m</dd>
          <dt>Primer cupo</dt><dd>${l.availabilityMonths} meses</dd>
        </dl>
        <div class="status ${e.compatible ? `status-${e.marginStatus}` : 'status-red'}">${e.compatible ? `<span class="dot ${e.marginStatus}"></span>Compatible · ${STATUS_TEXT[e.marginStatus]} (${e.marginPct} %)` : `✖ No sirve: ${fails.join(', ')}`}</div>
        <button data-select="${l.id}" class="${e.compatible ? 'primary' : ''}">${e.compatible ? 'Elegir y revisar →' : 'Ver por qué no sirve'}</button>
      </div>`;
  }).join('') : '<p class="muted">Ningún lanzador de este nivel sirve para la misión. Desmarca el filtro para ver por qué y qué cambiar.</p>';

  const ok = app.evaluations.filter((e) => e.compatible);
  const best = (key, pickMax) => {
    if (!ok.length) return null;
    const values = ok.map(key);
    return pickMax ? Math.max(...values) : Math.min(...values);
  };
  const cell = (e, key, pickMax, text) => `<td class="${ok.length > 1 && key(e) === best(key, pickMax) ? 'best' : ''}">${text}</td>`;
  $('trade-table').innerHTML = ok.length ? `
    <table>
      <thead><tr><th>Lanzador</th><th>Costo total</th><th>Te queda</th><th>Margen de masa</th><th>Confiabilidad</th><th>Lanza en</th><th>Vida útil</th></tr></thead>
      <tbody>${ok.map((e) => `<tr>
        <td><span class="dot ${e.marginStatus}"></span>${esc(e.launcher.name)}</td>
        ${cell(e, (x) => x.totalCostMUSD, false, fmtMUSD(e.totalCostMUSD))}
        ${cell(e, (x) => x.budgetAfterMUSD, true, fmtMUSD(e.budgetAfterMUSD))}
        ${cell(e, (x) => x.marginPct, true, `${e.marginPct} %`)}
        ${cell(e, (x) => x.reliability, true, fmtPct(e.reliability))}
        ${cell(e, (x) => x.date.launchMonth, false, `mes ${e.date.launchMonth}${e.date.delayMonths ? ` (+${e.date.delayMonths})` : ''}`)}
        ${cell(e, (x) => x.lifetimeYears, true, `${e.lifetimeYears} años`)}
      </tr>`).join('')}</tbody>
    </table>` : '<p class="status-red">Ninguna opción es compatible todavía. Elige un lanzador para ver qué habría que cambiar.</p>';
}

function fairingSvg(e) {
  const sc = inputs().spacecraft;
  const f = e.launcher.fairing;
  const H = Math.max(f.heightM, sc.heightM) * 1.15;
  const W = Math.max(f.diameterM, sc.diameterM) * 1.6;
  const scale = Math.min(300 / W, 200 / H);
  const fw = f.diameterM * scale;
  const fh = f.heightM * scale;
  const sw = sc.diameterM * scale;
  const sh = sc.heightM * scale;
  const cx = 160;
  const base = 210;
  const nose = Math.min(fh * 0.35, fw * 0.9);
  const fits = sc.diameterM <= f.diameterM && sc.heightM <= f.heightM;
  return `<svg class="fairing-svg" viewBox="0 0 320 220" role="img" aria-label="Comparación de la nave con la cofia">
    <path d="M${cx - fw / 2},${base} L${cx - fw / 2},${base - fh + nose} Q${cx - fw / 2},${base - fh} ${cx},${base - fh} Q${cx + fw / 2},${base - fh} ${cx + fw / 2},${base - fh + nose} L${cx + fw / 2},${base} Z" fill="rgba(115,221,207,.08)" stroke="#73ddcf" stroke-dasharray="4 3"/>
    <rect x="${cx - sw / 2}" y="${base - sh}" width="${sw}" height="${sh}" fill="${fits ? 'rgba(79,209,139,.55)' : 'rgba(255,93,93,.6)'}" stroke="#eaf4ff"/>
    <line x1="10" y1="${base}" x2="310" y2="${base}" stroke="#2f4c63"/>
    <text x="8" y="16" fill="#8aa6b6" font-size="11" font-family="monospace">Cofia ${f.diameterM}×${f.heightM} m</text>
    <text x="8" y="30" fill="${fits ? '#4fd18b' : '#ff5d5d'}" font-size="11" font-family="monospace">Nave ${sc.diameterM}×${sc.heightM} m</text>
  </svg>`;
}

function renderCheck() {
  const e = current();
  if (!e) return;
  const sc = inputs().spacecraft;
  const d = diff();
  const l = e.launcher;
  const thresholds = app.data.rules.massMargin[inputs().difficulty];
  const siteOptions = l.sites.map((id) => app.data.sites.find((s) => s.id === id)).filter(Boolean);

  $('check-header').innerHTML = `
    <h2>${esc(l.name)} <span class="muted">· ${esc(l.provider)}</span></h2>
    <p>${esc(l.summary)}</p>
    <p>${d.siteChoice && siteOptions.length > 1
      ? `<label class="field inline"><span>Sitio de lanzamiento <button class="term" data-term="inclinacion" aria-label="¿Por qué importa el sitio?">?</button></span><select id="site-select">${siteOptions.map((s) => `<option value="${s.id}" ${s.id === e.siteId ? 'selected' : ''}>${esc(s.name)} · ${Math.abs(s.latitudeDeg)}° ${s.latitudeDeg < 0 ? 'S' : 'N'}</option>`).join('')}</select></label>`
      : `Sitio: <b>${esc(e.site.name)}</b> (${Math.abs(e.site.latitudeDeg)}° de latitud ${e.site.latitudeDeg < 0 ? 'sur' : 'norte'}, ${esc(e.site.country)})${d.siteChoice ? '' : ' — elegido automáticamente.'}`}</p>
    <details><summary>Fuentes y calidad de las cifras de este lanzador</summary>
      <ul>${Object.entries(l.sources).map(([k, v]) => `<li><b>${esc(k)}</b> (${esc(l.dataQuality?.[k] ?? 'aproximada')}): ${esc(v)}</li>`).join('')}
      <li><b>availabilityMonths</b> (${esc(l.dataQuality?.availabilityMonths ?? 'estimada')}): valor de juego.</li></ul>
    </details>`;

  // Indicador de margen de masa
  const greenEnd = 100 - thresholds.greenPct;
  const yellowEnd = 100 - thresholds.yellowPct;
  const usage = e.capacityKg > 0 ? (e.launchMassKg / e.capacityKg) * 100 : 100;
  $('mass-card').innerHTML = `
    <h2>Margen de masa <button class="term" data-term="margen" aria-label="¿Qué es el margen de masa?">?</button></h2>
    ${e.baseCapacityKg == null || e.capacityKg <= 0
      ? `<p class="status-red">Este lanzador no puede llevar nada a ese destino${e.capacityKg <= 0 && e.baseCapacityKg != null ? ' desde este sitio' : ''}.</p>`
      : `<div class="big-number status-${e.marginStatus}">${e.marginKg >= 0 ? '+' : '−'}${fmtKg(Math.abs(e.marginKg))} <small>(${e.marginPct} %)</small></div>
      <div class="gauge" style="--g:${greenEnd}%;--y:${yellowEnd}%"><span class="cap">CAPACIDAD ${fmtKg(e.capacityKg)}</span><div class="marker" style="left:calc(${Math.min(100, usage)}% - 1px)"><span>Nave ${fmtKg(e.launchMassKg)}${usage > 100 ? ' ⚠ excede' : ''}</span></div></div>
      <div class="gauge-legend"><span><span class="dot green"></span>≥ ${thresholds.greenPct} % libre: cómodo</span><span><span class="dot yellow"></span>${thresholds.yellowPct}–${thresholds.greenPct} %: justo</span><span><span class="dot red"></span>&lt; ${thresholds.yellowPct} %: arriesgado</span></div>
      <p class="muted">¿Por qué? Las naves suelen "engordar" entre un 10 % y un 30 % mientras se diseñan y construyen. Sin margen, cualquier cambio obliga a buscar otro cohete a último momento.</p>`}`;
  $('fairing-card').innerHTML = `<h2>¿Cabe en la cofia? <button class="term" data-term="cofia" aria-label="¿Qué es la cofia?">?</button></h2>${fairingSvg(e)}`;

  const icon = { ok: '✔', warn: '⚠', fail: '✖' };
  $('checks-card').innerHTML = `
    <h2>Verificación de compatibilidad</h2>
    <ul class="checks">${e.checks.map((c) => `
      <li class="${c.status}"><span class="icon status-${c.status === 'ok' ? 'green' : c.status === 'warn' ? 'yellow' : 'red'}">${icon[c.status]}</span>
        <div><b>${esc(c.label)}</b> — ${esc(c.detail)}</div>
        <details><summary>¿Por qué?</summary>${esc(c.why)} ${c.term ? `<button class="term" data-term="${c.term}" aria-label="Más información">?</button>` : ''}</details>
      </li>`).join('')}
    </ul>`;

  // Cargar menos combustible
  const ops = operationalPropellant(sc);
  $('offload-card').hidden = !(d.propellantOffload && ops > 0);
  if (!$('offload-card').hidden) {
    const off = e.offloadKg;
    $('offload-card').innerHTML = `
      <h2>Opción: cargar menos combustible <button class="term" data-term="propelente" aria-label="¿Qué significa?">?</button></h2>
      <input type="range" id="offload" min="0" max="${Math.floor(ops)}" step="${Math.max(1, Math.round(ops / 100))}" value="${off}" aria-label="Combustible que no se carga (kg)">
      <p>No cargar <b>${fmtKg(off)}</b> de combustible → la nave despega con <b>${fmtKg(e.launchMassKg)}</b> y su vida útil esperada es <b class="${e.lifetimeYears < sc.designLifetimeYears ? 'status-yellow' : ''}">${e.lifetimeYears} años</b> (diseño: ${sc.designLifetimeYears}).</p>
      <p class="muted">Solo se puede quitar combustible de operación (${fmtKg(ops)}); el que la nave necesita para llegar a su órbita final no se toca. Esta decisión le llega al rol de Nave.</p>`;
  }

  const suggestions = buildSuggestions(e, app.evaluations, app.data, inputs());
  $('suggestions-card').hidden = !suggestions.length;
  $('suggestions-card').innerHTML = `
    <h2>${e.compatible ? 'Para mejorar esta opción' : 'No es compatible. ¿Qué se puede hacer?'}</h2>
    <ul>${suggestions.map((s) => `<li><span class="role-chip">${esc(ROLES[s.role] ?? s.role)}</span>${esc(s.text)}</li>`).join('')}</ul>
    <p class="muted">Varias opciones pueden servir: cada una sacrifica algo distinto (dinero, ciencia, vida útil o tiempo).</p>`;

  // Modo equipo: visto bueno de los roles afectados
  $('team-card').hidden = !app.teamMode;
  if (app.teamMode) {
    const requests = buildRequests(e, inputs());
    const roles = requiredRoles(e);
    $('team-card').innerHTML = `
      <h2>Revisión del equipo</h2>
      <p class="muted">Esta decisión afecta a otros roles. Muéstrenla en pantalla y discútanla: cada rol marca su visto bueno.</p>
      ${requests.length ? `<ul>${requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : '<p>No hay pedidos especiales para otros roles.</p>'}
      <div class="acks">${roles.map((role) => `<label class="check-row"><input type="checkbox" data-ack="${role}" ${app.acks[role] ? 'checked' : ''}> Visto bueno de <b>${esc(ROLES[role])}</b></label>`).join('')}</div>
      <textarea id="team-notes" placeholder="Notas de la discusión (por qué eligieron este lanzador, qué descartaron)…">${esc(app.notes)}</textarea>`;
  }

  const approved = teamApproved(e);
  $('confirm').disabled = !e.compatible || !approved || app.confirmed;
  $('confirm').textContent = app.confirmed ? '✔ Lanzador confirmado' : 'Confirmar lanzador';
  $('confirm-why').textContent = !e.compatible
    ? 'Bloqueado: resuelve los puntos en rojo o elige otro lanzador.'
    : !approved ? 'Falta el visto bueno de todos los roles afectados.'
    : app.confirmed ? 'Ya puedes ir al paso 4.' : '';
}

function renderLaunchPanel() {
  const e = current();
  if (!e) return;
  const p = e.probabilities;
  const ev = app.data.rules.events;
  const rows = [['Probabilidad de que el cohete funcione', fmtPct(e.reliability)]];
  if (app.eventsEnabled) {
    if (p.weather != null) rows.push([ev.weather.label, fmtPct(p.weather)]);
    if (p.minorAnomaly != null) rows.push([ev.minorAnomaly.label, fmtPct(p.minorAnomaly)]);
    if (p.orbitOffset != null) rows.push([ev.orbitOffset.label, fmtPct(p.orbitOffset)]);
    const clean = Object.values(p).reduce((acc, value) => acc * (1 - value), 1);
    rows.push(['<b>Sin ningún imprevisto</b>', `<b>${fmtPct(clean)}</b>`]);
  }
  $('odds').innerHTML = `<div class="odds">${rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${app.eventsEnabled ? '' : `<p class="muted">Modo práctica: el lanzamiento saldrá bien, pero recuerda que en la realidad ${esc(e.launcher.name)} falla ${fmtPct(1 - e.reliability)} de las veces.</p>`}`;
  $('events-toggle').checked = app.eventsEnabled;
  $('seed').value = app.seed;
  $('launch-btn').disabled = app.playing || !app.confirmed;
  $('launch-btn').textContent = app.flight && !app.playing ? '🚀 Lanzar de nuevo (otra semilla)' : '🚀 ¡LANZAR!';
  $('skip-btn').disabled = !app.playing;
  for (const id of ['events-toggle', 'seed', 'seed-new']) $(id).disabled = app.playing;
  if (!$('phases').children.length) $('phases').innerHTML = FLIGHT_PHASES.map((ph) => `<li data-phase="${ph.id}">${ph.label}${ph.id === 'maxq' ? ' <button class="term" data-term="maxq" aria-label="¿Qué es Max-Q?">?</button>' : ph.id === 'fairing' ? ' <button class="term" data-term="cofia" aria-label="¿Qué es la cofia?">?</button>' : ''}</li>`).join('');
}

function renderResult() {
  const e = current();
  const f = app.flight;
  if (!e || !f || app.playing) return;
  const sc = inputs().spacecraft;
  const out = currentOutput('lanzado');
  const txt = RESULT_TEXT[f.result];
  const ao = f.achievedOrbit;
  const orbitText = ao
    ? `${esc(ao.type)}${ao.altitudeKm != null ? ` · ${ao.altitudeKm} km` : ''}${ao.inclinationDeg != null ? ` · ${ao.inclinationDeg}°` : ''}`
    : 'ninguna';
  $('result-card').className = `card result ${f.result}`;
  $('result-card').innerHTML = `
    <h2>${txt.title}</h2>
    <p>${txt.text}</p>
    ${ao ? `<p class="muted">${esc(ao.note)}</p>` : ''}
    <div class="kpis">
      <div class="kpi"><span>Lanzador</span><b>${esc(e.launcher.name)}</b></div>
      <div class="kpi"><span>Órbita alcanzada</span><b>${orbitText}</b></div>
      <div class="kpi"><span>Vida útil</span><b>${f.lifetimeYears} / ${sc.designLifetimeYears} años</b></div>
      <div class="kpi"><span>Costo del lanzamiento</span><b>${fmtMUSD(out.cost.totalMUSD)}</b></div>
      <div class="kpi"><span>Presupuesto restante</span><b class="${out.budgetAfterMUSD < 0 ? 'status-red' : ''}">${fmtMUSD(out.budgetAfterMUSD)}</b></div>
      <div class="kpi"><span>Lanzamiento</span><b>mes ${e.date.launchMonth}${f.delayDays ? ` +${f.delayDays} d` : ''}</b></div>
    </div>`;

  $('result-events').innerHTML = `<h2>Qué pasó y por qué importa</h2>${f.events.length
    ? `<ul class="log">${f.events.map((ev) => `<li class="${ev.severity}"><b>${esc(ev.label)}</b> — ${esc(ev.consequence)}<small>${esc(ev.explain)}</small></li>`).join('')}</ul>`
    : `<p>Sin imprevistos.${f.eventsEnabled ? '' : ' (Eventos aleatorios desactivados: modo práctica.)'}</p>`}`;

  const match = matchReferenceMission(app.data.missions, inputs().orbit.type, sc.massKg, e.launcherId);
  const m = match.closest;
  $('reference-card').innerHTML = `<h2>Misiones reales parecidas</h2>
    ${m ? `<p>Tu lanzamiento se parece a <b>${esc(m.name)}</b> (${m.year}, ~${fmtKg(m.massKg)}, ${esc(m.orbit)}), que usó <b>${esc(m.launcher)}</b>${m.launcherId === e.launcherId ? ' — ¡el mismo lanzador que elegiste!' : '.'}${massRatioNote(sc.massKg, m.massKg)}</p><p class="muted">${esc(m.note)}</p>` : ''}
    ${match.sameLauncher ? `<p>Con tu mismo lanzador voló también <b>${esc(match.sameLauncher.name)}</b> (${match.sameLauncher.year}, ~${fmtKg(match.sameLauncher.massKg)}). <span class="muted">${esc(match.sameLauncher.note)}</span></p>` : ''}
    <p class="muted">Masas aproximadas, tomadas de las páginas públicas de cada misión.</p>`;

  $('handoff-card').innerHTML = `
    <h2>Entrega al siguiente módulo</h2>
    <p>Este resultado se guardó en el estado compartido (<code>localStorage["spaceMission.state.v1"].launch</code>). Los módulos de órbita, operaciones y nave lo leen desde ahí.</p>
    ${out.requests.length ? `<h3>Pedidos para otros roles</h3><ul>${out.requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : ''}
    <details><summary>Ver datos exactos (JSON)</summary><pre class="json" id="output-json">${esc(JSON.stringify(out, null, 2))}</pre></details>
    <div class="actions">
      <button id="copy-json">Copiar JSON</button>
      ${f.result !== 'exito' ? `<button class="primary" id="retry">Comprar otro lanzamiento (+${fmtMUSD(e.totalCostMUSD)})</button>` : ''}
      <button id="change-decision">Cambiar de lanzador</button>
      <button id="reset-all">Reiniciar módulo</button>
    </div>
    ${f.result !== 'exito' ? '<p class="muted">Reintentar significa pagar otro cohete (y en la realidad, construir otra nave): por eso se elige con cuidado desde el principio.</p>' : ''}`;
}

function massRatioNote(own, ref) {
  const ratio = own / ref;
  if (ratio >= 3) return ` (tu nave es unas ${Math.round(ratio)} veces más pesada)`;
  if (ratio <= 1 / 3) return ` (tu nave es unas ${Math.round(1 / ratio)} veces más liviana)`;
  return '';
}

function renderResources() {
  const { budget, schedule, spacecraft: sc } = inputs();
  const e = current();
  const f = app.playing ? null : app.flight; // no adelantar el resultado durante la animación
  const launchCost = e ? e.totalCostMUSD : 0;
  const eventsCost = f?.extraCostMUSD ?? 0;
  const remaining = budget.totalMUSD - budget.committedMUSD - launchCost - eventsCost;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / budget.totalMUSD) * 100))}%`;
  const requests = e ? buildRequests(e, inputs()) : [];
  $('resources').innerHTML = `
    <div class="res">
      <h3>Presupuesto ${sourceTag('budget')}</h3>
      <div class="stack"><i class="others" style="width:${pct(budget.committedMUSD)}"></i><i class="launch" style="width:${pct(launchCost)}"></i><i class="events" style="width:${pct(eventsCost)}"></i></div>
      <div class="row"><span>Total</span><b>${fmtMUSD(budget.totalMUSD)}</b></div>
      <div class="row"><span>Otros equipos${app.previousAttemptsMUSD ? ' + intentos previos' : ''}</span><b>−${fmtMUSD(budget.committedMUSD)}</b></div>
      <div class="row"><span>Lanzador${e?.delayCostMUSD ? ' + retraso' : ''}</span><b>${e ? `−${fmtMUSD(launchCost)}` : '—'}</b></div>
      ${eventsCost ? `<div class="row"><span>Imprevistos</span><b>−${fmtMUSD(eventsCost)}</b></div>` : ''}
      <div class="row total"><span>Restante</span><b class="${remaining < 0 ? 'status-red' : ''}">${fmtMUSD(Math.round(remaining * 100) / 100)}</b></div>
    </div>
    <div class="res">
      <h3>Masa ${sourceTag('spacecraft')}</h3>
      <div class="row"><span>Nave al despegar</span><b>${fmtKg(e ? e.launchMassKg : sc.massKg)}</b></div>
      <div class="row"><span>Capacidad</span><b>${e ? fmtKg(e.capacityKg) : '—'}</b></div>
      <div class="row"><span>Margen</span><b class="${e ? `status-${e.marginStatus}` : ''}">${e ? `${e.marginPct} %` : '—'}</b></div>
    </div>
    <div class="res">
      <h3>Tiempo ${sourceTag('schedule')}</h3>
      <div class="row"><span>Fecha objetivo</span><b>mes ${schedule.monthsToTargetDate}</b></div>
      <div class="row"><span>Lanzamiento</span><b class="${e?.date.delayMonths ? 'status-yellow' : ''}">${e ? `mes ${e.date.launchMonth}${f?.delayDays ? ` +${f.delayDays} d` : ''}` : '—'}</b></div>
    </div>
    <div class="res">
      <h3>Vida útil y riesgo</h3>
      <div class="row"><span>Vida útil</span><b>${f ? f.lifetimeYears : e ? e.lifetimeYears : sc.designLifetimeYears} / ${sc.designLifetimeYears} años</b></div>
      <div class="row"><span>Confiabilidad</span><b>${e ? fmtPct(e.reliability) : '—'}</b></div>
      <div class="row"><span>Resultado</span><b>${f ? { exito: 'Éxito', exito_parcial: 'Parcial', falla: 'Falla' }[f.result] : app.confirmed ? 'Listo para lanzar' : 'Pendiente'}</b></div>
    </div>
    <div class="res unaffected">
      <h3>Potencia · Comunicaciones · Datos</h3>
      <div>El lanzador no los cambia directamente; los gestionan otros módulos.</div>
    </div>
    ${requests.length ? `<div class="res requests"><h3>Avisos a otros roles</h3><ul>${requests.map((r) => `<li><span class="role-chip">${esc(r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul></div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Lanzamiento
// ---------------------------------------------------------------------------

function launch() {
  const e = current();
  if (!e || !app.confirmed || app.playing) return;
  if (app.flight) app.seed = randomSeed(); // relanzar = nueva semilla
  app.flight = simulateLaunch(e, app.data, inputs(), { seed: app.seed, eventsEnabled: app.eventsEnabled });
  app.playing = true;
  $('flight-log').innerHTML = '';
  document.querySelectorAll('#phases li').forEach((li) => { li.className = ''; });
  logLine(`Semilla ${app.seed}. ${e.launcher.name} en ${e.site.name}.`, '');
  render();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastPhase = null;
  sequence.play({
    launcher: e.launcher,
    flight: app.flight,
    orbitType: inputs().orbit.type,
    reducedMotion: reduced,
    onPhase(id) {
      if (lastPhase) document.querySelector(`#phases li[data-phase="${lastPhase}"]`).className = 'done';
      document.querySelector(`#phases li[data-phase="${id}"]`).className = 'active';
      lastPhase = id;
      logLine(FLIGHT_PHASES.find((p) => p.id === id).label, '');
    },
    onEvent(ev) {
      logLine(`${ev.label}: ${ev.consequence}`, ev.severity, ev.explain);
      if (ev.severity === 'fatal') {
        const li = document.querySelector(`#phases li[data-phase="${app.flight.failurePhase}"]`);
        if (li) li.className = 'failed';
      }
    },
    onDone() {
      if (lastPhase && app.flight.result !== 'falla') document.querySelector(`#phases li[data-phase="${lastPhase}"]`).className = 'done';
      app.playing = false;
      const out = currentOutput('lanzado');
      writeLaunch(out);
      logLine(`Resultado: ${RESULT_TEXT[app.flight.result].title}`, app.flight.result === 'falla' ? 'fatal' : app.flight.result === 'exito_parcial' ? 'moderate' : '');
      render();
      const goButton = document.createElement('button');
      goButton.className = 'primary';
      goButton.textContent = 'Ver resultado →';
      goButton.addEventListener('click', () => go('result'));
      const li = document.createElement('li');
      li.append(goButton);
      $('flight-log').append(li);
    },
  });
}

function logLine(text, severity, detail) {
  const li = document.createElement('li');
  li.className = severity ?? '';
  li.textContent = text;
  if (detail) {
    const small = document.createElement('small');
    small.textContent = detail;
    li.append(small);
  }
  $('flight-log').append(li);
  $('flight-log').scrollTop = $('flight-log').scrollHeight;
}

// ---------------------------------------------------------------------------
// Glosario (botones "?")
// ---------------------------------------------------------------------------

function showTerm(button) {
  const term = app.data.glossary[button.dataset.term];
  if (!term) return;
  const pop = $('popover');
  $('popover-title').textContent = term.title;
  $('popover-text').textContent = term.text;
  pop.hidden = false;
  const r = button.getBoundingClientRect();
  const left = Math.min(window.innerWidth - pop.offsetWidth - 10, Math.max(10, r.left - 20));
  const top = r.bottom + pop.offsetHeight + 10 > window.innerHeight ? r.top - pop.offsetHeight - 8 : r.bottom + 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(10, top)}px`;
  pop.querySelector('.popover-close').focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Eventos de la interfaz (delegados, porque el HTML se regenera)
// ---------------------------------------------------------------------------

function bind() {
  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) {
      if (!event.target.closest('#popover')) $('popover').hidden = true;
      return;
    }
    if (target.matches('.term')) { event.preventDefault(); showTerm(target); return; }
    if (target.matches('.popover-close')) { $('popover').hidden = true; return; }
    $('popover').hidden = true;
    if (target.dataset.step) go(target.dataset.step);
    else if (target.dataset.go) go(target.dataset.go);
    else if (target.dataset.select) {
      if (app.selectedId !== target.dataset.select) invalidateDecision();
      app.selectedId = target.dataset.select;
      go('check');
    } else if (target.id === 'confirm') {
      app.confirmed = true;
      writeLaunch(currentOutput('seleccionado'));
      go('launch');
    } else if (target.id === 'launch-btn') launch();
    else if (target.id === 'skip-btn') sequence.skip();
    else if (target.id === 'seed-new') { app.seed = randomSeed(); render(); }
    else if (target.id === 'copy-json') {
      navigator.clipboard?.writeText($('output-json').textContent).then(() => { target.textContent = '✔ Copiado'; }, () => { target.textContent = 'No se pudo copiar'; });
    } else if (target.id === 'retry') {
      app.previousAttemptsMUSD += current().totalCostMUSD + (app.flight?.extraCostMUSD ?? 0);
      app.attempts += 1;
      app.flight = null;
      app.seed = randomSeed();
      recompute();
      const e = current();
      if (!e?.compatible) { app.confirmed = false; go('check'); } else go('launch');
      $('flight-log').innerHTML = '';
      sequence.drawIdle(e?.compatible ? 'Nuevo cohete listo. Pulsa LANZAR.' : 'Ya no alcanza el presupuesto para otro cohete.');
    } else if (target.id === 'change-decision') {
      invalidateDecision();
      sequence.drawIdle();
      go('catalog');
    } else if (target.id === 'reset-all') {
      if (!window.confirm('¿Reiniciar el módulo de lanzamiento? Se borra la decisión guardada.')) return;
      clearLaunch();
      Object.assign(app, { selectedId: null, options: {}, previousAttemptsMUSD: 0, attempts: 0, notes: '' });
      invalidateDecision();
      recompute();
      sequence.drawIdle();
      go('mission');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('popover').hidden = true;
  });

  document.addEventListener('change', (event) => {
    const t = event.target;
    if (t.id === 'scenario') { app.scenarioId = t.value; resetForNewInputs(); }
    else if (t.name === 'difficulty') {
      app.difficulty = t.value;
      app.eventsEnabled = getDifficulty(app.data.rules, t.value).eventsDefaultOn;
      resetForNewInputs();
    } else if (t.id === 'team-mode') { app.teamMode = t.checked; app.acks = {}; if (app.confirmed) invalidateDecision(); render(); }
    else if (t.id === 'only-compatible') { app.onlyCompatible = t.checked; renderCatalog(); }
    else if (t.id === 'site-select') { setOption('siteId', t.value); }
    else if (t.id === 'events-toggle') { app.eventsEnabled = t.checked; render(); }
    else if (t.id === 'seed') { app.seed = Math.max(1, Math.floor(Number(t.value) || 1)); render(); }
    else if (t.dataset.ack) { app.acks[t.dataset.ack] = t.checked; renderCheck(); }
  });

  document.addEventListener('input', (event) => {
    const t = event.target;
    if (t.id === 'offload') setOption('propellantOffloadKg', Number(t.value), true);
    else if (t.id === 'team-notes') app.notes = t.value;
  });
}

function setOption(key, value, keepFocus = false) {
  app.options[app.selectedId] = { ...app.options[app.selectedId], [key]: value };
  invalidateDecision();
  recompute();
  render();
  if (keepFocus) $('offload')?.focus();
}

function resetForNewInputs() {
  app.selectedId = null;
  app.options = {};
  app.previousAttemptsMUSD = 0;
  invalidateDecision();
  recompute();
  sequence.drawIdle();
  render();
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

async function init() {
  try {
    app.data = await loadData();
  } catch (error) {
    $('loading').innerHTML = `No se pudieron cargar los datos del módulo (${esc(error.message)}). Abre el juego con <code>npm run dev</code> en lugar de abrir el archivo directamente.`;
    return;
  }
  recompute();
  app.eventsEnabled = diff().eventsDefaultOn;
  sequence = new LaunchSequence($('sequence'));
  $('loading').hidden = true;
  bind();
  // Si otro rol/módulo actualiza el estado compartido en otra pestaña, recalculamos.
  onSharedChange(() => {
    if (app.playing) return;
    recompute();
    render();
  });
  go('mission');
}

init();
