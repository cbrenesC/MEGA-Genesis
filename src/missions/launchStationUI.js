// Preparation UI ported from feature/launch. A station renders one original panel
// against the live flight plan instead of mounting the game's old setup scenes.
import { buildRequests, buildSuggestions, operationalPropellant, tradeHighlights } from '../../games/launch/js/rules.js';
import { DIFFICULTIES, ROLES } from '../../games/launch/js/state.js';
import { fmtKg, fmtMUSD, fmtPct, costLike } from '../../games/launch/js/plain.js';
import { hasFlight } from './flightPlan.js';

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
const sourceTag = () => '<span class="tag mock">perfil de misión</span>';

const termBtn = (id, label = '¿Qué es esto?') => `<button class="term" data-term="${id}" aria-label="${esc(label)}">?</button>`;

// ---------------------------------------------------------------------------
// 1. Misión
// ---------------------------------------------------------------------------

function renderBriefing({ data, plan, view, translate }, fields) {
  const label = key => esc(translate(`station.${key}`));
  const { spacecraft: sc, orbit, budget, schedule, missionName, objective, team } = view.resolved.inputs;
  const od = data.orbits.find(o => o.id === orbit.type);
  const players = team?.players ?? [];
  return `
  <div class="screen-grid">
    <article class="card hero">
      <span class="kicker">TU MISIÓN</span>
      <h2>${esc(missionName)}</h2>
      <p class="lead">${esc(objective)}</p>
      <p>Tu trabajo: elegir el cohete, comprobar que tu nave quepa, y <b>pilotear el lanzamiento</b> hasta la órbita. Decidas lo que decidas, afecta el dinero, el tiempo y la vida de tu nave.</p>
      <dl class="facts">
        <dt>Nave ${sourceTag('spacecraft')}</dt><dd><b>${esc(sc.name ?? '—')}</b> pesa <b>${fmtKg(sc.massKg)}</b> con combustible (es la carga que va en la punta del cohete).</dd>
        <dt>Tamaño doblada</dt><dd>${sc.diameterM} m de ancho × ${sc.heightM} m de alto</dd>
        <dt>Combustible</dt><dd>${fmtKg(sc.propellantKg)}${sc.propellantKg ? ` (${fmtKg(operationalPropellant(sc))} sirven para mantenerse en órbita)` : ' — esta nave no tiene motor propio'}</dd>
        <dt>${sc.missionDays ? 'Duración' : 'Vida de diseño'}</dt><dd>${sc.missionDays ? `${sc.missionDays} días de misión` : `${sc.designLifetimeYears} años`}</dd>
        <dt>${sc.return ? 'Partes de la nave' : 'Instrumentos'}</dt><dd>${sc.instruments.length ? sc.instruments.map((i) => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') : '—'}</dd>
        ${sc.return ? '<dt>Plan de vuelo</dt><dd>① órbita de la Tierra → ② inyección hacia la Luna → ③ frenado y órbita lunar → ④ inyección de regreso → ⑤ soltar el módulo de servicio y reentrada con el escudo térmico → ⑥ paracaídas y amerizaje.</dd>' : ''}
        <dt>Destino ${sourceTag('orbit')}</dt><dd>${esc(od?.name ?? orbit.type)}${orbit.altitudeKm != null && od?.needsInclination ? ` · ${orbit.altitudeKm} km de altura` : ''}${orbit.inclinationDeg != null && od?.needsInclination ? ` · ${orbit.inclinationDeg}° de inclinación` : ''}</dd>
        <dt>Dinero ${sourceTag('budget')}</dt><dd>${fmtMUSD(budget.totalMUSD)} en total (${costLike(budget.totalMUSD)}); otros equipos ya apartaron ${fmtMUSD(budget.committedMUSD)}.</dd>
        <dt>Fecha ${sourceTag('schedule')}</dt><dd>Meta: lanzar dentro de ${schedule.monthsToTargetDate} meses.</dd>
        ${players.length ? `<dt>Equipo</dt><dd>${players.map((p) => `${esc(p.name)} (${esc(ROLES[p.role] ?? p.role)})`).join(', ')}</dd>` : ''}
      </dl>
    </article>
    <article class="card">
      <h2>Antes de empezar</h2>
      <label class="field"><span>${label('field.scenario')}</span>
        <select id="scenario" data-focus="scenario">${data.mocks.scenarios.map((s) => `<option value="${s.id}" ${s.id === view.resolved.scenario.id ? 'selected' : ''}>${label(`scenario.${s.id}`)}</option>`).join('')}</select>
        <small>Cada perfil tiene su propia nave, instrumentos y destino.</small></label>
      <fieldset class="field difficulty"><legend>${label('field.difficulty')}</legend>
        ${DIFFICULTIES.map((level) => {
          const d = data.rules.difficulty[level];
          return `<label class="choice"><input type="radio" name="difficulty" data-focus="difficulty-${level}" value="${level}" ${level === view.difficulty ? 'checked' : ''}> <span><b>${label(`difficulty.${level}`)}</b><small>${esc(d.description)}</small></span></label>`;
        }).join('')}
      </fieldset>
      <label class="check-row"><input type="checkbox" id="team-mode" data-focus="team" ${plan.teamMode ? 'checked' : ''}> <span><b>${label('field.team')}.</b> Antes de confirmar, los otros roles dan su visto bueno.</span></label>
      <p class="muted">Todas las cifras son <b>datos aproximados para el juego</b>. Las fuentes están en cada cohete.</p>
      ${fields}
      <p class="muted">Después, configurá la carga y el cohete en sus respectivas consolas.</p>
    </article>
  </div>`;
}

// ---------------------------------------------------------------------------
// 2. Hangar: catálogo
// ---------------------------------------------------------------------------

function renderCatalog({ data, view, onlyCompatible }, fields) {
  const { orbit } = view.resolved.inputs;
  const od = data.orbits.find(o => o.id === orbit.type);
  const maxDv = Math.max(...data.orbits.map((o) => o.deltaVKmS));
  const highlights = view.evaluations.filter((e) => e.compatible).length > 1 ? tradeHighlights(view.evaluations) : {};
  const tagFor = (id) => [
    highlights.cheapest === id && '💲 Más barato',
    highlights.mostReliable === id && '🛡 Más seguro',
    highlights.mostMargin === id && '⚖ Más espacio libre',
    highlights.soonest === id && '⏱ Sale antes',
  ].filter(Boolean).map((t) => `<span class="tag highlight">${t}</span>`).join('');
  const list = onlyCompatible ? view.evaluations.filter((e) => e.compatible) : view.evaluations;

  const cards = list.length ? list.map((e) => {
    const l = e.launcher;
    const playable = hasFlight(e.launcherId, orbit.type, data);
    const fails = e.checks.filter((c) => c.status === 'fail').map((c) => SHORT_FAIL[c.id]).filter(Boolean);
    const usage = e.capacityKg > 0 ? Math.min(100, (e.launchMassKg / e.capacityKg) * 100) : 100;
    const st = STATUS[e.marginStatus];
    const capText = e.baseCapacityKg == null ? 'No llega a ese destino'
      : `Tu nave: ${fmtKg(e.launchMassKg)} de ${fmtKg(e.capacityKg)} que puede subir`;
    return `
      <div class="lv ${e.launcherId === view.selected?.launcherId ? 'is-selected' : ''} ${e.compatible ? '' : 'is-locked'}">
        <h3>${esc(l.name)}</h3>
        <div class="provider">${esc(l.provider)}</div>
        ${l.liftoffMassKg ? `<div class="provider" title="${esc(l.sources?.liftoffMassKg ?? '')}">⚖ Pesa ${Math.round(l.liftoffMassKg / 1000).toLocaleString('es')} toneladas al despegar</div>` : ''}
        <div class="tags"><span class="tag class">${esc(l.class)}</span>${l.fictional ? '<span class="tag fict" title="Configuración parcialmente inventada">en parte inventado</span>' : ''}${e.compatible ? tagFor(e.launcherId) : ''}</div>
        <p>${esc(l.summary)}</p>
        <div class="capbar" role="img" aria-label="${esc(capText)}"><i class="${st.cls}" style="width:${usage}%"></i></div>
        <div class="capbar-label">${esc(capText)}</div>
        <dl>
          <dt>Cuesta</dt><dd>${fmtMUSD(e.launchCostMUSD)}${e.delayCostMUSD ? ` <small class="status-yellow">+ ${fmtMUSD(e.delayCostMUSD)} por llegar ${e.date.delayMonths} meses tarde</small>` : ''}</dd>
          <dt>Seguridad ${termBtn('confiabilidad', '¿Qué significa seguridad del cohete?')}</dt><dd>${fmtPct(l.reliability)} salen bien</dd>
          <dt>Punta (cofia) ${termBtn('cofia', '¿Qué es la cofia?')}</dt><dd>${l.fairing.diameterM} × ${l.fairing.heightM} m</dd>
          <dt>Primer cupo</dt><dd>en ${l.availabilityMonths} meses</dd>
        </dl>
        <div class="status ${e.compatible ? `status-${st.cls}` : 'status-red'}">${e.compatible ? `${st.icon} Sirve · ${st.text.toLowerCase()} (${e.marginPct} %)` : `✖ No sirve: ${fails.join(', ')}`}</div>
        ${!playable && e.compatible ? '<p class="muted">Esta combinación no tiene vuelo interactivo.</p>' : ''}
        <button type="button" data-select="${esc(l.id)}" data-focus="rocket-${esc(l.id)}" aria-pressed="${e.launcherId === view.selected?.launcherId}" class="${e.compatible && playable ? 'primary' : ''}">${e.launcherId === view.selected?.launcherId ? '✓ Cohete seleccionado' : e.compatible && playable ? 'Elegir cohete' : 'Seleccionar para revisar'}</button>
      </div>`;
  }).join('') : '<p class="muted">Ningún cohete de este nivel sirve para tu misión. Quita el filtro para ver por qué y qué se puede cambiar.</p>';

  const ok = view.evaluations.filter((e) => e.compatible);
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
        ${cell(e, (x) => x.lifetimeYears, true, view.resolved.inputs.spacecraft.missionDays ? `${view.resolved.inputs.spacecraft.missionDays} días` : `${e.lifetimeYears} años`)}
      </tr>`).join('')}</tbody></table>` : '<p class="status-red">Todavía ninguna opción sirve. Elige un cohete para ver qué habría que cambiar.</p>';

  return `
  <article class="card">
    <h2>Tu destino: ${esc(od.name)} ${termBtn('orbita-alta', '¿Por qué una órbita alta cuesta más?')}</h2>
    <p>${esc(od.plain)} <span class="muted">Ejemplos: ${esc(od.examples)}</span></p>
    <p class="muted">¿Cuánta velocidad hay que ganar para llegar a cada destino? Es el presupuesto de velocidad (delta-v) ${termBtn('delta-v', '¿Qué es delta-v?')}:</p>
    <div class="dv-bars">${data.orbits.map((o) => `
      <div class="dv-row ${o.id === orbit.type ? 'is-target' : ''}"><span>${o.id === orbit.type ? '▶ ' : ''}${esc(o.name)}</span><span class="bar"><i style="width:${(o.deltaVKmS / maxDv) * 100}%"></i></span><span>${o.deltaVKmS} km/s</span></div>`).join('')}
    </div>
  </article>
  <div class="catalog-toolbar">
    <h2>Elige tu cohete ${termBtn('carga-util', '¿Qué es la capacidad de carga?')}</h2>
    <label class="check-row"><input type="checkbox" id="only-compatible" data-focus="only-compatible" ${onlyCompatible ? 'checked' : ''}> Mostrar solo los que sirven</label>
  </div>
  <div class="catalog">${cards}</div>
  ${fields}
  <article class="card">
    <h2>Compara tus opciones ${termBtn('trade', '¿Por qué comparar?')}</h2>
    <p class="muted">No hay una única respuesta correcta: cada cohete gana en algo y pierde en otra cosa. Lo mejor de cada columna está marcado.</p>
    <div class="table-wrap">${table}</div>
  </article>`;
}

// ---------------------------------------------------------------------------
// 3. Hangar: revisión
// ---------------------------------------------------------------------------

function fairingSvg(e, sc) {
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

function renderCheck({ data, plan, view }, fields) {
  const e = view.selected;
  if (!e) return `<article class="card"><h2>Revisión del cohete</h2><p>Elegí un cohete primero en su estación.</p>${fields}</article>`;
  const inputs = view.resolved.inputs;
  const sc = inputs.spacecraft;
  const l = e.launcher;
  const thresholds = data.rules.massMargin[view.difficulty];
  const st = STATUS[e.marginStatus];
  const usage = e.capacityKg > 0 ? (e.launchMassKg / e.capacityKg) * 100 : 100;
  const greenEnd = 100 - thresholds.greenPct; const yellowEnd = 100 - thresholds.yellowPct;
  const suggestions = buildSuggestions(e, view.evaluations, data, inputs);
  const requests = plan.teamMode ? buildRequests(e, inputs) : [];
  const roles = view.requiredRoles;

  const header = `
  <article class="card">
    <h2>${esc(l.name)} <span class="muted">· ${esc(l.provider)}</span></h2>
    <p>${esc(l.summary)}</p>
    <p>Sitio: <b>${esc(e.site.name)}</b> (${Math.abs(e.site.latitudeDeg)}° de latitud ${e.site.latitudeDeg < 0 ? 'sur' : 'norte'}, ${esc(e.site.country)}) ${termBtn('inclinacion', '¿Por qué importa el sitio?')}</p>
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
      <p class="station-gauge-value">Tu nave: <b>${fmtKg(e.launchMassKg)}</b>${usage > 100 ? ' · ⚠ supera la capacidad' : ''}</p>
      <div class="gauge-legend"><span><span class="dot green"></span>✔ ${thresholds.greenPct} % o más libre: cómodo</span><span><span class="dot yellow"></span>⚠ ${thresholds.yellowPct}–${thresholds.greenPct} %: justo</span><span><span class="dot red"></span>▲ menos de ${thresholds.yellowPct} %: arriesgado</span></div>
      <p class="muted">Las naves suelen engordar entre un 10 % y un 30 % mientras las construyen. Sin espacio libre, cualquier cambio te obliga a buscar otro cohete a última hora.</p>`}
  </article>
  <article class="card"><h2>¿Cabe en la punta? ${termBtn('cofia', '¿Qué es la cofia?')}</h2>${fairingSvg(e, sc)}</article>`;

  const checks = `
  <article class="card">
    <h2>Revisión del cohete</h2>
    <ul class="checks">${e.checks.map((c) => { const ci = CHECK_ICON[c.status]; return `
      <li class="${c.status}"><span class="icon status-${ci.cls}" title="${ci.word}"><span class="ico">${ci.icon}</span><small>${ci.word}</small></span>
        <div><b>${esc(c.label)}</b><p>${esc(c.detail)}</p>
        <details><summary>¿Por qué importa?</summary><p>${esc(c.why)}</p>${c.more ? `<p class="more"><b>Ver más:</b> ${esc(c.more)}</p>` : ''}${c.term ? `<button class="term" data-term="${c.term}" aria-label="Más información">?</button>` : ''}</details></div>
      </li>`; }).join('')}</ul>
  </article>`;

  const sug = suggestions.length ? `
  <article class="card suggestions">
    <h2>${e.compatible ? 'Ideas para mejorar esta opción' : 'Este cohete no sirve todavía. ¿Qué puedes hacer?'}</h2>
    <ul>${suggestions.map((s) => `<li><span class="role-chip">${esc(ROLES[s.role] ?? s.role)}</span>${esc(s.text)}</li>`).join('')}</ul>
    <p class="muted">Varias opciones pueden servir: cada una sacrifica algo distinto (dinero, ciencia, vida de la nave o tiempo).</p>
  </article>` : '';

  const team = plan.teamMode ? `
  <article class="card team">
    <h2>Revisión del equipo</h2>
    <p class="muted">Esta decisión afecta a otros roles. Muéstrenla en pantalla y discútanla: cada rol da su visto bueno.</p>
    ${requests.length ? `<ul>${requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : '<p>No hay pedidos especiales para otros roles.</p>'}
    <div class="acks">${roles.map((role) => `<label class="check-row"><input type="checkbox" data-ack="${role}" data-focus="ack-${role}" ${plan.acks?.[role] ? 'checked' : ''}> Visto bueno de <b>${esc(ROLES[role])}</b></label>`).join('')}</div>
    <textarea id="team-notes" maxlength="240" placeholder="Notas de la discusión: ¿por qué eligieron este cohete? ¿qué descartaron?">${esc(plan.notes)}</textarea>
  </article>` : '';

  return `${header}<div class="grid-2">${mass}</div>${checks}${sug}${team}${fields}`;
}

function renderPayload({ view }, fields) {
  const sc = view.resolved.inputs.spacecraft;
  return `<div class="screen-grid">
    <article class="card hero">
      <span class="kicker">NAVE E INSTRUMENTOS</span><h2>${esc(sc.name)}</h2>
      <dl class="facts">
        <dt>Tamaño plegado</dt><dd>${sc.diameterM} m de ancho × ${sc.heightM} m de alto</dd>
        <dt>Masa con combustible</dt><dd>${fmtKg(sc.massKg)}</dd>
        <dt>Combustible</dt><dd>${fmtKg(sc.propellantKg)} · ${fmtKg(operationalPropellant(sc))} disponibles para operar</dd>
        <dt>Reserva</dt><dd>${fmtKg(sc.reservedPropellantKg ?? 0)} reservados para llegar al destino</dd>
        <dt>${sc.missionDays ? 'Duración' : 'Vida de diseño'}</dt><dd>${sc.missionDays ? `${sc.missionDays} días de misión` : `${sc.designLifetimeYears} años`}</dd>
        <dt>${sc.return ? 'Partes de la nave' : 'Instrumentos'}</dt><dd>${sc.instruments.map(i => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') || '—'}</dd>
      </dl>
    </article>
    <article class="card"><h2>Ajusta la carga</h2>${fields}</article>
  </div>
  ${view.selected ? `<article class="card"><h2>¿Cabe en la punta? ${termBtn('cofia')}</h2>${fairingSvg(view.selected, sc)}</article>` : ''}`;
}

export function renderLaunchStation(part, context, fields) {
  return { mission: renderBriefing, payload: renderPayload, vehicle: renderCatalog, review: renderCheck }[part](context, fields);
}

export function rocketControlsSummary(view) {
  const e = view.selected;
  const { spacecraft: sc } = view.resolved.inputs;
  return `<p>No cargar <b>${fmtKg(e.offloadKg)}</b> de combustible: tu nave despega con <b>${fmtKg(e.launchMassKg)}</b> y vivirá unos <b class="${e.lifetimeYears < sc.designLifetimeYears ? 'status-yellow' : ''}">${e.lifetimeYears} años</b> (en vez de ${sc.designLifetimeYears}).</p>
    <p class="muted">Solo se puede quitar el combustible para operar (${fmtKg(operationalPropellant(sc))}); el combustible reservado para la órbita final no se toca.</p>`;
}
