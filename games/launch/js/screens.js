// Pantallas de decisión del juego (HTML encima del canvas de Phaser):
// Misión (Briefing) → Hangar (catálogo y revisión) → Plataforma → Vuelo → Resultado.
// Aquí solo se arma el HTML y se conectan los botones; las reglas están en rules.js.

import {
  buildSuggestions, buildRequests, tradeHighlights, matchReferenceMission, operationalPropellant,
} from './rules.js';
import { ROLES, DIFFICULTIES } from './state.js';
import { fmtKg, fmtMUSD, fmtMUSDShort, fmtPct, massLike, costLike } from './plain.js';
import {
  app, inputs, diff, current, orbitDef, recompute, invalidateDecision, requiredRoles, teamApproved, currentOutput, writeLaunch, clearLaunch, randomSeed,
} from './store.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Estados con ícono + texto (no dependen solo del color).
export const STATUS = {
  green: { icon: '✔', text: 'Margen cómodo', cls: 'green' },
  yellow: { icon: '⚠', text: 'Margen justo', cls: 'yellow' },
  red: { icon: '▲', text: 'Margen arriesgado', cls: 'red' },
  blocked: { icon: '✖', text: 'No cabe', cls: 'red' },
};
const CHECK_ICON = { ok: { icon: '✔', cls: 'green', word: 'Bien' }, warn: { icon: '⚠', cls: 'yellow', word: 'Ojo' }, fail: { icon: '✖', cls: 'red', word: 'Problema' } };
const SHORT_FAIL = { orbit: 'no llega a ese destino', mass: 'tu nave pesa demasiado', fairing: 'tu nave no cabe en la punta', budget: 'no alcanza el dinero', inclination: 'no puede lanzar a esa inclinación' };
const RESULT_TEXT = {
  exito: { icon: '✔', title: '¡Éxito! Tu nave está en órbita', text: 'El cohete cumplió y tu nave llegó. Pasa al siguiente equipo con la órbita y la vida útil que ves abajo.' },
  exito_parcial: { icon: '◐', title: 'Éxito parcial: llegaste, pero con costos', text: 'Tu nave sobrevivió, pero algo no salió perfecto: perdió vida útil o quedó en una órbita distinta. El siguiente equipo debe saberlo.' },
  falla: { icon: '✖', title: 'Misión perdida', text: 'Esta vez no se pudo. Pasa en la vida real, incluso a los mejores equipos: de cada falla se aprende mucho. Mira abajo qué pasó y qué cambiarías.' },
};

const sourceTag = (key) => (app.resolved.sources[key] === 'compartido'
  ? '<span class="tag shared" title="Dato recibido de otro equipo del juego">de otro equipo</span>'
  : app.resolved.sources[key] === 'mock' ? '<span class="tag mock" title="Dato de práctica: el equipo que lo da todavía no lo publicó">dato de práctica</span>' : '');

const termBtn = (id, label = '¿Qué es esto?') => `<button class="term" data-term="${id}" aria-label="${esc(label)}">?</button>`;

// ---------------------------------------------------------------------------
// 1. Misión
// ---------------------------------------------------------------------------

export function renderBriefing() {
  const { spacecraft: sc, orbit, budget, schedule } = inputs();
  const od = orbitDef();
  const players = inputs().team?.players ?? [];
  const anyMock = Object.values(app.resolved.sources).includes('mock');
  return `
  <div class="screen-grid">
    <article class="card hero">
      <span class="kicker">TU MISIÓN</span>
      <h2>${esc(inputs().missionName)}</h2>
      <p class="lead">${esc(inputs().objective)}</p>
      <p>Tu trabajo: elegir el cohete, comprobar que tu nave quepa, y <b>pilotear el lanzamiento</b> hasta la órbita. Decidas lo que decidas, afecta el dinero, el tiempo y la vida de tu nave.</p>
      <dl class="facts">
        <dt>Nave ${sourceTag('spacecraft')}</dt><dd><b>${esc(sc.name ?? '—')}</b> pesa ${massLike(sc.massKg)} (${fmtKg(sc.massKg)}) con combustible.</dd>
        <dt>Tamaño doblada</dt><dd>${sc.diameterM} m de ancho × ${sc.heightM} m de alto</dd>
        <dt>Combustible</dt><dd>${fmtKg(sc.propellantKg)}${sc.propellantKg ? ` (${fmtKg(operationalPropellant(sc))} sirven para mantenerse en órbita)` : ' — esta nave no tiene motor propio'}</dd>
        <dt>Vida de diseño</dt><dd>${sc.designLifetimeYears} años</dd>
        <dt>Instrumentos</dt><dd>${sc.instruments.length ? sc.instruments.map((i) => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') : '—'}</dd>
        <dt>Destino ${sourceTag('orbit')}</dt><dd>${esc(od?.name ?? orbit.type)}${orbit.altitudeKm != null && od?.needsInclination ? ` · ${orbit.altitudeKm} km de altura` : ''}${orbit.inclinationDeg != null && od?.needsInclination ? ` · ${orbit.inclinationDeg}° de inclinación` : ''}</dd>
        <dt>Dinero ${sourceTag('budget')}</dt><dd>${fmtMUSD(budget.totalMUSD)} en total (${costLike(budget.totalMUSD)}); otros equipos ya apartaron ${fmtMUSD(budget.committedMUSD)}.</dd>
        <dt>Fecha ${sourceTag('schedule')}</dt><dd>Meta: lanzar dentro de ${schedule.monthsToTargetDate} meses.</dd>
        ${players.length ? `<dt>Equipo</dt><dd>${players.map((p) => `${esc(p.name)} (${esc(ROLES[p.role] ?? p.role)})`).join(', ')}</dd>` : ''}
      </dl>
    </article>
    <article class="card">
      <h2>Antes de empezar</h2>
      ${anyMock ? `<label class="field"><span>Misión de práctica</span>
        <select id="scenario">${app.data.mocks.scenarios.map((s) => `<option value="${s.id}" ${s.id === app.scenarioId ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <small>Se usa mientras los otros equipos no publican sus datos.</small></label>` : ''}
      <fieldset class="field difficulty"><legend>Dificultad</legend>
        ${DIFFICULTIES.map((level) => {
          const d = app.data.rules.difficulty[level];
          return `<label class="choice"><input type="radio" name="difficulty" value="${level}" ${level === inputs().difficulty ? 'checked' : ''}> <span><b>${d.label}</b><small>${esc(d.description)}</small></span></label>`;
        }).join('')}
      </fieldset>
      <label class="check-row"><input type="checkbox" id="team-mode" ${app.teamMode ? 'checked' : ''}> <span><b>Modo equipo.</b> Antes de confirmar, los otros roles dan su visto bueno.</span></label>
      <p class="muted">Todas las cifras son <b>datos aproximados para el juego</b>. Las fuentes están en cada cohete.</p>
      <div class="actions"><button class="primary big" data-go="catalog">Elegir el cohete →</button></div>
    </article>
  </div>`;
}

// ---------------------------------------------------------------------------
// 2. Hangar: catálogo
// ---------------------------------------------------------------------------

export function renderCatalog() {
  const od = orbitDef();
  const { orbit } = inputs();
  const maxDv = Math.max(...app.data.orbits.map((o) => o.deltaVKmS));
  const highlights = app.evaluations.filter((e) => e.compatible).length > 1 ? tradeHighlights(app.evaluations) : {};
  const tagFor = (id) => [
    highlights.cheapest === id && '💲 Más barato',
    highlights.mostReliable === id && '🛡 Más seguro',
    highlights.mostMargin === id && '⚖ Más espacio libre',
    highlights.soonest === id && '⏱ Sale antes',
  ].filter(Boolean).map((t) => `<span class="tag highlight">${t}</span>`).join('');
  const list = app.onlyCompatible ? app.evaluations.filter((e) => e.compatible) : app.evaluations;

  const cards = list.length ? list.map((e) => {
    const l = e.launcher;
    const fails = e.checks.filter((c) => c.status === 'fail').map((c) => SHORT_FAIL[c.id]).filter(Boolean);
    const usage = e.capacityKg > 0 ? Math.min(100, (e.launchMassKg / e.capacityKg) * 100) : 100;
    const st = STATUS[e.marginStatus];
    const capText = e.baseCapacityKg == null ? 'No llega a ese destino'
      : `Tu nave: ${fmtKg(e.launchMassKg)} de ${fmtKg(e.capacityKg)} que puede subir`;
    return `
      <div class="lv ${e.launcherId === app.selectedId ? 'is-selected' : ''} ${e.compatible ? '' : 'is-locked'}">
        <h3>${esc(l.name)}</h3>
        <div class="provider">${esc(l.provider)}</div>
        <div class="tags"><span class="tag class">${esc(l.class)}</span>${l.fictional ? '<span class="tag fict" title="Configuración parcialmente inventada">en parte inventado</span>' : ''}${e.compatible ? tagFor(e.launcherId) : ''}</div>
        <p>${esc(l.summary)}</p>
        <div class="capbar" role="img" aria-label="${esc(capText)}"><i class="${st.cls}" style="width:${usage}%"></i></div>
        <div class="capbar-label">${esc(capText)}${e.baseCapacityKg != null ? ` (${massLike(e.capacityKg)})` : ''}</div>
        <dl>
          <dt>Cuesta</dt><dd>${fmtMUSD(e.launchCostMUSD)}${e.delayCostMUSD ? ` <small class="status-yellow">+ ${fmtMUSD(e.delayCostMUSD)} por llegar ${e.date.delayMonths} meses tarde</small>` : ''}</dd>
          <dt>Seguridad ${termBtn('confiabilidad', '¿Qué significa seguridad del cohete?')}</dt><dd>${fmtPct(l.reliability)} salen bien</dd>
          <dt>Punta (cofia) ${termBtn('cofia', '¿Qué es la cofia?')}</dt><dd>${l.fairing.diameterM} × ${l.fairing.heightM} m</dd>
          <dt>Primer cupo</dt><dd>en ${l.availabilityMonths} meses</dd>
        </dl>
        <div class="status ${e.compatible ? `status-${st.cls}` : 'status-red'}">${e.compatible ? `${st.icon} Sirve · ${st.text.toLowerCase()} (${e.marginPct} %)` : `✖ No sirve: ${fails.join(', ')}`}</div>
        <button data-select="${l.id}" class="${e.compatible ? 'primary' : ''}">${e.compatible ? 'Elegir y revisar →' : 'Ver por qué no sirve'}</button>
      </div>`;
  }).join('') : '<p class="muted">Ningún cohete de este nivel sirve para tu misión. Quita el filtro para ver por qué y qué se puede cambiar.</p>';

  const ok = app.evaluations.filter((e) => e.compatible);
  const best = (key, pickMax) => (ok.length ? (pickMax ? Math.max(...ok.map(key)) : Math.min(...ok.map(key))) : null);
  const cell = (e, key, pickMax, text) => `<td class="${ok.length > 1 && key(e) === best(key, pickMax) ? 'best' : ''}">${text}</td>`;
  const table = ok.length ? `<table>
      <thead><tr><th>Cohete</th><th>Cuesta</th><th>Te queda</th><th>Espacio libre</th><th>Seguridad</th><th>Sale en</th><th>Vida de la nave</th></tr></thead>
      <tbody>${ok.map((e) => `<tr>
        <td><span class="dot ${STATUS[e.marginStatus].cls}"></span>${esc(e.launcher.name)}</td>
        ${cell(e, (x) => x.totalCostMUSD, false, fmtMUSD(e.totalCostMUSD))}
        ${cell(e, (x) => x.budgetAfterMUSD, true, fmtMUSD(e.budgetAfterMUSD))}
        ${cell(e, (x) => x.marginPct, true, `${e.marginPct} %`)}
        ${cell(e, (x) => x.reliability, true, fmtPct(e.reliability))}
        ${cell(e, (x) => x.date.launchMonth, false, `mes ${e.date.launchMonth}${e.date.delayMonths ? ` (+${e.date.delayMonths})` : ''}`)}
        ${cell(e, (x) => x.lifetimeYears, true, `${e.lifetimeYears} años`)}
      </tr>`).join('')}</tbody></table>` : '<p class="status-red">Todavía ninguna opción sirve. Elige un cohete para ver qué habría que cambiar.</p>';

  return `
  <article class="card">
    <h2>Tu destino: ${esc(od.name)} ${termBtn('orbita-alta', '¿Por qué una órbita alta cuesta más?')}</h2>
    <p>${esc(od.plain)} <span class="muted">Ejemplos: ${esc(od.examples)}</span></p>
    <p class="muted">¿Cuánta velocidad hay que ganar para llegar a cada destino? Es el presupuesto de velocidad (delta-v) ${termBtn('delta-v', '¿Qué es delta-v?')}:</p>
    <div class="dv-bars">${app.data.orbits.map((o) => `
      <div class="dv-row ${o.id === orbit.type ? 'is-target' : ''}"><span>${o.id === orbit.type ? '▶ ' : ''}${esc(o.name)}</span><span class="bar"><i style="width:${(o.deltaVKmS / maxDv) * 100}%"></i></span><span>${o.deltaVKmS} km/s</span></div>`).join('')}
    </div>
  </article>
  <div class="catalog-toolbar">
    <h2>Elige tu cohete ${termBtn('carga-util', '¿Qué es la capacidad de carga?')}</h2>
    <label class="check-row"><input type="checkbox" id="only-compatible" ${app.onlyCompatible ? 'checked' : ''}> Mostrar solo los que sirven</label>
  </div>
  <div class="catalog">${cards}</div>
  <article class="card">
    <h2>Compara tus opciones ${termBtn('trade', '¿Por qué comparar?')}</h2>
    <p class="muted">No hay una única respuesta correcta: cada cohete gana en algo y pierde en otra cosa. Lo mejor de cada columna está marcado.</p>
    <div class="table-wrap">${table}</div>
  </article>
  <div class="actions"><button data-go="briefing">← Volver a la misión</button></div>`;
}

// ---------------------------------------------------------------------------
// 3. Hangar: revisión
// ---------------------------------------------------------------------------

function fairingSvg(e) {
  const sc = inputs().spacecraft;
  const f = e.launcher.fairing;
  const H = Math.max(f.heightM, sc.heightM) * 1.15;
  const W = Math.max(f.diameterM, sc.diameterM) * 1.6;
  const scale = Math.min(300 / W, 200 / H);
  const fw = f.diameterM * scale; const fh = f.heightM * scale;
  const sw = sc.diameterM * scale; const sh = sc.heightM * scale;
  const cx = 160; const base = 210;
  const nose = Math.min(fh * 0.35, fw * 0.9);
  const fits = sc.diameterM <= f.diameterM && sc.heightM <= f.heightM;
  return `<svg class="fairing-svg" viewBox="0 0 320 220" role="img" aria-label="Tu nave dentro de la punta del cohete: ${fits ? 'cabe' : 'no cabe'}">
    <path d="M${cx - fw / 2},${base} L${cx - fw / 2},${base - fh + nose} Q${cx - fw / 2},${base - fh} ${cx},${base - fh} Q${cx + fw / 2},${base - fh} ${cx + fw / 2},${base - fh + nose} L${cx + fw / 2},${base} Z" fill="rgba(115,221,207,.08)" stroke="#73ddcf" stroke-dasharray="4 3"/>
    <rect x="${cx - sw / 2}" y="${base - sh}" width="${sw}" height="${sh}" fill="${fits ? 'rgba(79,209,139,.55)' : 'rgba(255,93,93,.6)'}" stroke="#eaf4ff"/>
    <line x1="10" y1="${base}" x2="310" y2="${base}" stroke="#2f4c63"/>
    <text x="8" y="16" fill="#9db6c4" font-size="11" font-family="monospace">Punta del cohete ${f.diameterM}×${f.heightM} m</text>
    <text x="8" y="30" fill="${fits ? '#4fd18b' : '#ff7b7b'}" font-size="11" font-family="monospace">${fits ? '✔' : '✖'} Tu nave ${sc.diameterM}×${sc.heightM} m</text>
  </svg>`;
}

export function renderCheck() {
  const e = current();
  if (!e) return '<p>Elige un cohete primero.</p>';
  const sc = inputs().spacecraft;
  const d = diff();
  const l = e.launcher;
  const thresholds = app.data.rules.massMargin[inputs().difficulty];
  const siteOptions = l.sites.map((id) => app.data.sites.find((s) => s.id === id)).filter(Boolean);
  const st = STATUS[e.marginStatus];
  const usage = e.capacityKg > 0 ? (e.launchMassKg / e.capacityKg) * 100 : 100;
  const greenEnd = 100 - thresholds.greenPct; const yellowEnd = 100 - thresholds.yellowPct;
  const ops = operationalPropellant(sc);
  const suggestions = buildSuggestions(e, app.evaluations, app.data, inputs());
  const approved = teamApproved(e);
  const requests = app.teamMode ? buildRequests(e, inputs()) : [];
  const roles = app.teamMode ? requiredRoles(e) : [];

  const header = `
  <article class="card">
    <h2>${esc(l.name)} <span class="muted">· ${esc(l.provider)}</span></h2>
    <p>${esc(l.summary)}</p>
    <p>${d.siteChoice && siteOptions.length > 1
      ? `<label class="field inline"><span>Sitio de lanzamiento ${termBtn('inclinacion', '¿Por qué importa el sitio?')}</span><select id="site-select">${siteOptions.map((s) => `<option value="${s.id}" ${s.id === e.siteId ? 'selected' : ''}>${esc(s.name)} · ${Math.abs(s.latitudeDeg)}° ${s.latitudeDeg < 0 ? 'S' : 'N'}</option>`).join('')}</select></label>`
      : `Sitio: <b>${esc(e.site.name)}</b> (${Math.abs(e.site.latitudeDeg)}° de latitud ${e.site.latitudeDeg < 0 ? 'sur' : 'norte'}, ${esc(e.site.country)})${d.siteChoice ? '' : ' — se eligió solo, el mejor para tu misión.'}`}</p>
    <details><summary>Ver más: fuentes de las cifras de este cohete</summary>
      <ul>${Object.entries(l.sources).map(([k, v]) => `<li><b>${esc(k)}</b> (${esc(l.dataQuality?.[k] ?? 'aproximada')}): ${esc(v)}</li>`).join('')}
      <li><b>availabilityMonths</b> (${esc(l.dataQuality?.availabilityMonths ?? 'estimada')}): dato aproximado para el juego.</li></ul>
    </details>
  </article>`;

  const mass = `
  <article class="card">
    <h2>¿Cuánto espacio libre queda? ${termBtn('margen', '¿Qué es el margen de peso?')}</h2>
    ${e.baseCapacityKg == null || e.capacityKg <= 0
      ? `<p class="status-red">✖ Este cohete no puede llevar nada a ese destino${e.capacityKg <= 0 && e.baseCapacityKg != null ? ' desde este sitio' : ''}. Prueba otro cohete o cambia de sitio.</p>`
      : `<div class="big-number status-${st.cls}"><span class="ico">${st.icon}</span> ${e.marginKg >= 0 ? '+' : '−'}${fmtKg(Math.abs(e.marginKg))} <small>(${e.marginPct} % · ${st.text.toLowerCase()})</small></div>
      <div class="gauge" style="--g:${greenEnd}%;--y:${yellowEnd}%"><span class="cap">PUEDE SUBIR ${fmtKg(e.capacityKg)}</span><div class="marker" style="left:calc(${Math.min(100, usage)}% - 1px)"><span>Tu nave ${fmtKg(e.launchMassKg)}${usage > 100 ? ' ⚠ se pasa' : ''}</span></div></div>
      <div class="gauge-legend"><span><span class="dot green"></span>✔ ${thresholds.greenPct} % o más libre: cómodo</span><span><span class="dot yellow"></span>⚠ ${thresholds.yellowPct}–${thresholds.greenPct} %: justo</span><span><span class="dot red"></span>▲ menos de ${thresholds.yellowPct} %: arriesgado</span></div>
      <p class="muted">Las naves suelen engordar entre un 10 % y un 30 % mientras las construyen. Sin espacio libre, cualquier cambio te obliga a buscar otro cohete a última hora.</p>`}
  </article>
  <article class="card"><h2>¿Cabe en la punta? ${termBtn('cofia', '¿Qué es la cofia?')}</h2>${fairingSvg(e)}</article>`;

  const checks = `
  <article class="card">
    <h2>Revisión del cohete</h2>
    <ul class="checks">${e.checks.map((c) => { const ci = CHECK_ICON[c.status]; return `
      <li class="${c.status}"><span class="icon status-${ci.cls}" title="${ci.word}"><span class="ico">${ci.icon}</span><small>${ci.word}</small></span>
        <div><b>${esc(c.label)}</b><p>${esc(c.detail)}</p>
        <details><summary>¿Por qué importa?</summary><p>${esc(c.why)}</p>${c.more ? `<p class="more"><b>Ver más:</b> ${esc(c.more)}</p>` : ''}${c.term ? `<button class="term" data-term="${c.term}" aria-label="Más información">?</button>` : ''}</details></div>
      </li>`; }).join('')}</ul>
  </article>`;

  const offload = d.propellantOffload && ops > 0 ? `
  <article class="card">
    <h2>Opción: cargar menos combustible ${termBtn('propelente', '¿Qué significa?')}</h2>
    <input type="range" id="offload" min="0" max="${Math.floor(ops)}" step="${Math.max(1, Math.round(ops / 100))}" value="${e.offloadKg}" aria-label="Combustible que no se carga, en kilos">
    <p>No cargar <b>${fmtKg(e.offloadKg)}</b> de combustible: tu nave despega con <b>${fmtKg(e.launchMassKg)}</b> y vivirá unos <b class="${e.lifetimeYears < sc.designLifetimeYears ? 'status-yellow' : ''}">${e.lifetimeYears} años</b> (en vez de ${sc.designLifetimeYears}).</p>
    <p class="muted">Solo se puede quitar el combustible para operar (${fmtKg(ops)}); el que la nave necesita para llegar a su órbita final no se toca. El equipo de la nave se entera de esta decisión.</p>
  </article>` : '';

  const sug = suggestions.length ? `
  <article class="card suggestions">
    <h2>${e.compatible ? 'Ideas para mejorar esta opción' : 'Este cohete no sirve todavía. ¿Qué puedes hacer?'}</h2>
    <ul>${suggestions.map((s) => `<li><span class="role-chip">${esc(ROLES[s.role] ?? s.role)}</span>${esc(s.text)}</li>`).join('')}</ul>
    <p class="muted">Varias opciones pueden servir: cada una sacrifica algo distinto (dinero, ciencia, vida de la nave o tiempo).</p>
  </article>` : '';

  const team = app.teamMode ? `
  <article class="card team">
    <h2>Revisión del equipo</h2>
    <p class="muted">Esta decisión afecta a otros roles. Muéstrenla en pantalla y discútanla: cada rol da su visto bueno.</p>
    ${requests.length ? `<ul>${requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : '<p>No hay pedidos especiales para otros roles.</p>'}
    <div class="acks">${roles.map((role) => `<label class="check-row"><input type="checkbox" data-ack="${role}" ${app.acks[role] ? 'checked' : ''}> Visto bueno de <b>${esc(ROLES[role])}</b></label>`).join('')}</div>
    <textarea id="team-notes" placeholder="Notas de la discusión: ¿por qué eligieron este cohete? ¿qué descartaron?">${esc(app.notes)}</textarea>
  </article>` : '';

  const why = !e.compatible ? 'Bloqueado: arregla los puntos en rojo o elige otro cohete.' : !approved ? 'Falta el visto bueno de todos los roles.' : app.confirmed ? 'Listo. Ve a la plataforma.' : '';
  return `${header}<div class="grid-2">${mass}</div>${checks}${offload}${sug}${team}
  <div class="actions">
    <button data-go="catalog">← Cambiar de cohete</button>
    ${app.confirmed
      ? '<button class="primary big" data-go="pad">Ir a la plataforma 🚀</button>'
      : `<button class="primary big" id="confirm" ${!e.compatible || !approved ? 'disabled' : ''}>Confirmar este cohete</button>`}
    <span class="muted">${esc(why)}</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// 6. Resultado
// ---------------------------------------------------------------------------

export function renderResult() {
  const e = current();
  const f = app.flight;
  if (!e || !f) return '<p>Todavía no hay resultado.</p>';
  const sc = inputs().spacecraft;
  const out = currentOutput('lanzado');
  const txt = RESULT_TEXT[f.result];
  const ao = f.achievedOrbit;
  const orbitText = ao
    ? (ao.periapsisKm != null ? `${ao.periapsisKm} × ${ao.apoapsisKm} km` : `${esc(ao.type)}${ao.altitudeKm != null ? ` · ${ao.altitudeKm} km` : ''}`) + (ao.inclinationDeg != null && inputs().orbit.type !== 'GTO' ? ` · ${ao.inclinationDeg}°` : '')
    : 'ninguna';
  const fd = f.flightData;
  const pilot = f.pilot;
  const match = matchReferenceMission(app.data.missions, inputs().orbit.type, sc.massKg, e.launcherId);
  const m = match.closest;
  const free = inputs().difficulty === 'facil';

  const score = pilot ? `
  <article class="card">
    <h2>Tu puntaje de pilotaje: <span class="score">${pilot.total}</span><small>/100</small></h2>
    <ul class="score-parts">${pilot.parts.map((p) => `<li><div class="sp-head"><span>${esc(p.label)}</span><b>${p.points} / ${p.max}</b></div><div class="sp-bar"><i style="width:${(p.points / p.max) * 100}%"></i></div><small>${esc(p.note)}</small></li>`).join('')}</ul>
    <details><summary>¿Cómo se calcula este puntaje?</summary>
      <p>Sumas hasta 100 puntos: <b>50</b> por qué tan cerca quedó tu órbita de la que pedía la misión, <b>25</b> por el combustible que te sobró, <b>15</b> por no pasarte del límite de presión del aire (Max-Q) y <b>10</b> por separar bien las etapas y la cofia.</p>
      <p class="more"><b>Ver más:</b> el combustible se compara con lo que deja el piloto automático en la misma misión (con la mitad ya es puntaje completo). Max-Q: se descuenta de forma gradual hasta 1,5 veces el límite de 40 kPa.</p>
    </details>
    ${fd?.autopilot ? '<p class="muted">Usaste el piloto automático: en las misiones difíciles, pilotear tú mismo da más puntos.</p>' : ''}
  </article>` : '';

  const flightCard = fd ? `
  <article class="card">
    <h2>Datos de tu vuelo</h2>
    <div class="kpis">
      <div class="kpi"><span>Altura máxima</span><b>${fd.maxAltitudeKm} km</b></div>
      <div class="kpi"><span>Punto más alto (apoapsis)</span><b>${fd.apoapsisKm ?? '—'} km</b></div>
      <div class="kpi"><span>Punto más bajo (periapsis)</span><b>${fd.periapsisKm} km</b></div>
      <div class="kpi"><span>Combustible que sobró</span><b>${fd.fuelLeftPct} %</b></div>
      <div class="kpi"><span>Presión máxima del aire</span><b>${fd.maxQKPa} kPa</b></div>
      <div class="kpi"><span>Duración</span><b>${Math.floor(fd.durationSeconds / 60)} min ${fd.durationSeconds % 60} s</b></div>
    </div>
    ${fd.stagingTimes.length ? `<p class="muted">Separaciones: ${fd.stagingTimes.map((s) => `etapa ${s.stage} a los ${s.tSeconds} s (${s.altitudeKm} km)`).join(' · ')}.</p>` : ''}
  </article>` : '<article class="card"><p class="muted">Para este cohete y este destino todavía no hay simulador de vuelo, así que el resultado se calculó automáticamente con las probabilidades del cohete.</p></article>';

  return `
  <article class="card result ${f.result}">
    <h2><span class="ico">${txt.icon}</span> ${txt.title}</h2>
    <p class="lead">${esc(f.headline ?? '')}</p>
    <p>${txt.text}</p>
    ${f.story?.length ? `<ul class="story">${f.story.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="kpis">
      <div class="kpi"><span>Cohete</span><b>${esc(e.launcher.name)}</b></div>
      <div class="kpi"><span>Órbita lograda</span><b>${orbitText}</b></div>
      <div class="kpi"><span>Vida de la nave</span><b>${f.lifetimeYears} / ${sc.designLifetimeYears} años</b></div>
      <div class="kpi"><span>Costo del lanzamiento</span><b>${fmtMUSD(out.cost.totalMUSD)}</b></div>
      <div class="kpi"><span>Dinero que queda</span><b class="${out.budgetAfterMUSD < 0 ? 'status-red' : ''}">${fmtMUSD(out.budgetAfterMUSD)}</b></div>
      <div class="kpi"><span>Lanzamiento</span><b>mes ${e.date.launchMonth}${f.delayDays ? ` + ${f.delayDays} días` : ''}</b></div>
    </div>
  </article>
  ${score}${flightCard}
  <div class="grid-2">
    <article class="card"><h2>Qué pasó y por qué importa</h2>${f.events.length
      ? `<ul class="log">${f.events.map((ev) => `<li class="${ev.severity}"><b>${esc(ev.label)}</b> — ${esc(ev.consequence)}<small>${esc(ev.explain)}</small></li>`).join('')}</ul>`
      : `<p>Sin imprevistos.${f.eventsEnabled ? '' : ' (Los imprevistos estaban apagados: modo práctica.)'}</p>`}</article>
    <article class="card"><h2>Misiones reales parecidas</h2>
      ${m ? `<p>Tu lanzamiento se parece al de <b>${esc(m.name)}</b> (${m.year}, unos ${fmtKg(m.massKg)}, ${esc(m.orbit)}), que usó <b>${esc(m.launcher)}</b>${m.launcherId === e.launcherId ? ': ¡el mismo cohete que elegiste!' : '.'}</p><p class="muted">${esc(m.note)}</p>` : ''}
      ${match.sameLauncher ? `<p>Con tu mismo cohete también voló <b>${esc(match.sameLauncher.name)}</b> (${match.sameLauncher.year}, unos ${fmtKg(match.sameLauncher.massKg)}).</p>` : ''}
      <p class="muted">Pesos aproximados, tomados de las páginas públicas de cada misión.</p></article>
  </div>
  <article class="card">
    <h2>Entrega al siguiente equipo</h2>
    <p>Tu resultado quedó guardado para los demás módulos (<code>localStorage["spaceMission.state.v1"].launch</code>, versión ${out.schemaVersion}).</p>
    ${out.requests.length ? `<h3>Avisos para otros roles</h3><ul>${out.requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : ''}
    <details><summary>Para los curiosos: ver los datos exactos (JSON)</summary><pre class="json" id="output-json">${esc(JSON.stringify(out, null, 2))}</pre></details>
    <div class="actions">
      <button id="copy-json">Copiar los datos</button>
      ${f.result !== 'exito' ? `<button class="primary" id="retry">${free ? 'Intentar otra vez (gratis en nivel fácil)' : `Comprar otro lanzamiento (${fmtMUSD(e.totalCostMUSD)} más)`}</button>` : ''}
      <button id="change-decision">Cambiar de cohete</button>
      <button id="reset-all">Empezar de nuevo</button>
    </div>
    ${f.result !== 'exito' && !free ? '<p class="muted">Intentar otra vez significa pagar otro cohete (y, en la vida real, construir otra nave): por eso se elige con cuidado desde el principio.</p>' : ''}
  </article>`;
}

// ---------------------------------------------------------------------------
// Panel de recursos (siempre visible)
// ---------------------------------------------------------------------------

export function renderResources({ compact = false } = {}) {
  const { budget, schedule, spacecraft: sc } = inputs();
  const e = current();
  const f = app.flight;
  const launchCost = e ? e.totalCostMUSD : 0;
  const eventsCost = f?.extraCostMUSD ?? 0;
  const remaining = Math.round((budget.totalMUSD - budget.committedMUSD - launchCost - eventsCost) * 100) / 100;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / budget.totalMUSD) * 100))}%`;
  const requests = e ? buildRequests(e, inputs()) : [];
  const st = e ? STATUS[e.marginStatus] : null;
  const lifetime = f ? f.lifetimeYears : e ? e.lifetimeYears : sc.designLifetimeYears;
  if (compact) {
    return `<div class="pills">
      <span class="pill" title="Dinero que te queda: ${fmtMUSD(remaining)}"><b>💲</b> ${fmtMUSDShort(remaining)}</span>
      <span class="pill ${st ? `status-${st.cls}` : ''}" title="Espacio libre en el cohete"><b>⚖</b> ${e ? `${st.icon} ${e.marginPct} %` : '—'}</span>
      <span class="pill" title="Mes de lanzamiento"><b>📅</b> ${e ? `mes ${e.date.launchMonth}` : `mes ${schedule.monthsToTargetDate}`}</span>
      <span class="pill" title="Vida de la nave en años"><b>⏳</b> ${lifetime}/${sc.designLifetimeYears} a</span>
    </div>`;
  }
  return `
    <div class="res">
      <h3>💲 Dinero</h3>
      <div class="stack"><i class="others" style="width:${pct(budget.committedMUSD)}"></i><i class="launch" style="width:${pct(launchCost)}"></i><i class="events" style="width:${pct(eventsCost)}"></i></div>
      <div class="row"><span>Total</span><b>${fmtMUSD(budget.totalMUSD)}</b></div>
      <div class="row"><span>Otros equipos${app.previousAttemptsMUSD ? ' + intentos anteriores' : ''}</span><b>−${fmtMUSD(budget.committedMUSD)}</b></div>
      <div class="row"><span>Cohete${e?.delayCostMUSD ? ' + retraso' : ''}</span><b>${e ? `−${fmtMUSD(launchCost)}` : '—'}</b></div>
      ${eventsCost ? `<div class="row"><span>Imprevistos</span><b>−${fmtMUSD(eventsCost)}</b></div>` : ''}
      <div class="row total"><span>Te queda</span><b class="${remaining < 0 ? 'status-red' : ''}">${fmtMUSD(remaining)}</b></div>
    </div>
    <div class="res">
      <h3>⚖ Peso ${sourceTag('spacecraft')}</h3>
      <div class="row"><span>Tu nave al despegar</span><b>${fmtKg(e ? e.launchMassKg : sc.massKg)}</b></div>
      <div class="row"><span>El cohete puede subir</span><b>${e ? fmtKg(e.capacityKg) : '—'}</b></div>
      <div class="row"><span>Espacio libre</span><b class="${st ? `status-${st.cls}` : ''}">${e ? `${st.icon} ${e.marginPct} %` : '—'}</b></div>
    </div>
    <div class="res">
      <h3>📅 Tiempo ${sourceTag('schedule')}</h3>
      <div class="row"><span>Meta</span><b>mes ${schedule.monthsToTargetDate}</b></div>
      <div class="row"><span>Lanzamiento</span><b class="${e?.date.delayMonths ? 'status-yellow' : ''}">${e ? `mes ${e.date.launchMonth}${f?.delayDays ? ` + ${f.delayDays} d` : ''}` : '—'}</b></div>
    </div>
    <div class="res">
      <h3>⏳ Vida y riesgo</h3>
      <div class="row"><span>Vida de la nave</span><b>${lifetime} / ${sc.designLifetimeYears} años</b></div>
      <div class="row"><span>De cada 100 lanzamientos</span><b>${e ? `${Math.round(e.reliability * 100)} salen bien` : '—'}</b></div>
      <div class="row"><span>Resultado</span><b>${f ? { exito: '✔ Éxito', exito_parcial: '◐ Parcial', falla: '✖ Falla' }[f.result] : app.confirmed ? 'Listo para lanzar' : 'Pendiente'}</b></div>
    </div>
    <div class="res unaffected"><h3>Potencia · Comunicaciones · Datos</h3><div>El cohete no los cambia directamente; los manejan otros equipos.</div></div>
    ${requests.length ? `<div class="res requests"><h3>Avisos a otros roles</h3><ul>${requests.map((r) => `<li><span class="role-chip">${esc(r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul></div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Eventos de los controles de las pantallas
// ---------------------------------------------------------------------------

/**
 * Conecta los controles dentro de `root`. `nav.go(key)` cambia de escena y `nav.refresh()` repinta.
 */
export function bindScreens(root, nav) {
  root.onclick = (event) => {
    const t = event.target.closest('button, a, [data-go], [data-select]');
    if (!t) return;
    if (t.dataset.go) nav.go(t.dataset.go);
    else if (t.dataset.select) { selectLauncher(t.dataset.select); nav.go('check'); }
    else if (t.id === 'confirm') { app.confirmed = true; writeLaunch(currentOutput('seleccionado')); nav.refresh(); }
    else if (t.id === 'copy-json') {
      const text = document.getElementById('output-json')?.textContent ?? '';
      navigator.clipboard?.writeText(text).then(() => { t.textContent = '¡Copiado!'; }, () => { t.textContent = 'No se pudo copiar'; });
    } else if (t.id === 'retry') nav.retry();
    else if (t.id === 'change-decision') { invalidateDecision(); app.selectedId = null; nav.go('catalog'); }
    else if (t.id === 'reset-all') nav.reset();
  };
  root.onchange = (event) => {
    const t = event.target;
    if (t.id === 'scenario') { app.scenarioId = t.value; resetForNewInputs(); nav.refresh(); }
    else if (t.name === 'difficulty') { app.difficulty = t.value; resetForNewInputs(); nav.refresh(); }
    else if (t.id === 'team-mode') { app.teamMode = t.checked; invalidateDecision(); nav.refresh(); }
    else if (t.id === 'only-compatible') { app.onlyCompatible = t.checked; nav.refresh(); }
    else if (t.id === 'site-select') { setOption('siteId', t.value); nav.refresh(); }
    else if (t.dataset?.ack) { app.acks[t.dataset.ack] = t.checked; nav.refresh(); }
    else if (t.id === 'team-notes') app.notes = t.value;
  };
  root.oninput = (event) => {
    const t = event.target;
    if (t.id === 'offload') { setOption('propellantOffloadKg', Number(t.value)); nav.refresh({ keepFocus: 'offload' }); }
    else if (t.id === 'team-notes') app.notes = t.value;
  };
}

export function setOption(key, value) {
  const id = app.selectedId;
  if (!id) return;
  app.options[id] = { ...(app.options[id] ?? {}), [key]: value };
  invalidateDecision();
  recompute();
}

function selectLauncher(id) {
  if (app.selectedId !== id) { app.selectedId = id; invalidateDecision(); }
}

export function resetForNewInputs() {
  app.selectedId = null;
  app.options = {};
  app.previousAttemptsMUSD = 0;
  app.attempts = 0;
  app.seed = randomSeed();
  invalidateDecision();
  clearLaunch();
  recompute();
  app.eventsEnabled = diff().eventsDefaultOn;
}
