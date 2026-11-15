// Read-only flight resources and results. Mission preparation lives in Mission Control.
import { buildRequests, matchReferenceMission } from './rules.js';
import { ROLES } from './state.js';
import { fmtKg, fmtMUSD, fmtMUSDShort } from './plain.js';
import { app, inputs, current, currentOutput } from './store.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Estados con ícono + texto (no dependen solo del color).
export const STATUS = {
  green: { icon: '✔', text: 'Margen cómodo', cls: 'green' },
  yellow: { icon: '⚠', text: 'Margen justo', cls: 'yellow' },
  red: { icon: '▲', text: 'Margen arriesgado', cls: 'red' },
  blocked: { icon: '✖', text: 'No cabe', cls: 'red' },
};
const RESULT_TEXT = {
  exito: { icon: '✔', title: '¡Éxito! Tu nave está en órbita', text: 'El cohete cumplió y tu nave llegó. Pasa al siguiente equipo con la órbita y la vida útil que ves abajo.' },
  exito_parcial: { icon: '◐', title: 'Éxito parcial: llegaste, pero con costos', text: 'Tu nave sobrevivió, pero algo no salió perfecto: perdió vida útil o quedó en una órbita distinta. El siguiente equipo debe saberlo.' },
  falla: { icon: '✖', title: 'Misión perdida', text: 'Esta vez no se pudo. Pasa en la vida real, incluso a los mejores equipos: de cada falla se aprende mucho. Mira abajo qué pasó y qué cambiarías.' },
};

const sourceTag = (key) => (app.resolved.sources[key] === 'estacion'
  ? '<span class="tag shared">centro de control</span>'
  : app.resolved.sources[key] === 'compartido'
  ? '<span class="tag shared" title="Dato recibido de otro equipo del juego">de otro equipo</span>'
  : app.resolved.sources[key] === 'mock' ? '<span class="tag mock" title="Dato de práctica: el equipo que lo da todavía no lo publicó">dato de práctica</span>' : '');

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
    <p>Podés consultar o copiar los datos de este vuelo (versión ${out.schemaVersion}).</p>
    ${out.requests.length ? `<h3>Avisos para otros roles</h3><ul>${out.requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : ''}
    <details><summary>Para los curiosos: ver los datos exactos (JSON)</summary><pre class="json" id="output-json">${esc(JSON.stringify(out, null, 2))}</pre></details>
    <div class="actions">
      <button id="copy-json">Copiar los datos</button>
      ${f.result !== 'exito' ? `<button class="primary" id="retry">${free ? 'Intentar otra vez (gratis en nivel fácil)' : `Comprar otro lanzamiento (${fmtMUSD(e.totalCostMUSD)} más)`}</button>` : ''}
      <button id="return-control">Volver al centro de control</button>
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
  const pct = (v) => `${budget.totalMUSD > 0 ? Math.max(0, Math.min(100, (v / budget.totalMUSD) * 100)) : 0}%`;
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

export function bindScreens(root, nav) {
  root.onclick = (event) => {
    const button = event.target.closest('button');
    if (button?.id === 'retry') nav.retry();
    if (button?.id === 'return-control') nav.exit();
    if (button?.id === 'copy-json') {
      const text = document.getElementById('output-json')?.textContent ?? '';
      if (!navigator.clipboard) { button.textContent = 'No se pudo copiar'; return; }
      navigator.clipboard.writeText(text).then(() => { button.textContent = '¡Copiado!'; }, () => { button.textContent = 'No se pudo copiar'; });
    }
  };
}
