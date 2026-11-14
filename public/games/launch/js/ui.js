// Render de la interfaz (HTML como texto + delegación de eventos en main.js).
// Todo lo que se pinta viene de `ctx = { data, input, state }`; aquí no hay reglas de juego.
import * as E from './engine.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('es');
const LEVEL = { green: { icon: '●', label: 'Margen sano' }, yellow: { icon: '●', label: 'Margen justo' }, red: { icon: '●', label: 'No cabe' } };
const ICON = { ok: '✔', warn: '▲', fail: '✖' };
const CLASS_LABEL = { rideshare: 'Rideshare', small: 'Pequeño', medium: 'Mediano', 'medium-heavy': 'Mediano-pesado', heavy: 'Pesado', 'super-heavy': 'Súper pesado' };

/** Término con tooltip (hover/foco) tomado del glosario. */
export function term(data, key, label) {
  const g = data.glossary[key];
  if (!g) return esc(label ?? key);
  return `<span class="term" tabindex="0" role="note" data-tip="${esc(g.short)}">${esc(label ?? g.title)}</span>`;
}

const why = (text) => `<details class="why"><summary>¿Por qué?</summary><p>${esc(text)}</p></details>`;

export function massBar(mass) {
  const pct = Math.min(100, mass.usage_pct);
  const lv = LEVEL[mass.level];
  return `<div class="massbar ${mass.level}" role="img" aria-label="Uso de capacidad ${mass.usage_pct} %. ${lv.label}.">
    <div class="fill" style="width:${pct}%"></div><div class="mark" style="left:${Math.min(100, 100 / 1.15)}%" title="Con un margen del 15 % llegarías aquí"></div>
  </div>`;
}

// ---------- Misión recibida ----------
export function renderMission(el, ctx) {
  const { input, data, state } = ctx;
  const sc = input.spacecraft, orbit = data.config.orbits[input.target_orbit.id];
  const inc = input.target_orbit.inclination_deg ?? orbit.inclination_deg;
  el.innerHTML = `
    <h2><span class="num">1</span> Tu misión (datos que recibe el lanzamiento)</h2>
    <p class="muted">${state.source === 'mock' ? '⚠ Datos de práctica (mock). Cuando los otros módulos estén listos, llegarán de ellos.' : 'Datos recibidos del resto de la misión.'}</p>
    <dl class="facts">
      <div><dt>Nave</dt><dd>${esc(sc.name || 'Nave')}</dd></div>
      <div><dt>${term(data, 'payload_capacity', 'Masa total')}</dt><dd>${fmt(sc.mass_kg)} kg</dd></div>
      <div><dt>Tamaño plegado</dt><dd>${sc.dimensions ? `${sc.dimensions.diameter_m} × ${sc.dimensions.height_m} m` : '—'}</dd></div>
      <div><dt>Órbita objetivo</dt><dd>${term(data, orbit.id.toLowerCase(), orbit.id)} · ${fmt(orbit.altitude_km)} km${inc != null ? ` · ${inc}°` : ''}</dd></div>
      <div><dt>${term(data, 'cost', 'Presupuesto')}</dt><dd>${fmt(input.budget_musd)} M$</dd></div>
      <div><dt>Fecha límite</dt><dd>${input.deadline_months != null ? input.deadline_months + ' meses' : '—'}</dd></div>
      <div><dt>Vida útil de diseño</dt><dd>${sc.design_life_years ? sc.design_life_years + ' años' : '—'}</dd></div>
      <div><dt>Combustible</dt><dd>${sc.fuel_kg ? fmt(sc.fuel_kg) + ' kg' : '—'}</dd></div>
    </dl>
    <p class="learn">💡 ${esc(data.glossary.delta_v.title)}: ${esc(data.glossary.delta_v.short)} Llegar a <strong>${esc(orbit.id)}</strong> cuesta unos <strong>${fmt(orbit.delta_v_ms)} m/s</strong> de delta-v desde el suelo.</p>`;
}

// ---------- Catálogo ----------
export function renderCatalog(el, ctx) {
  const { data, input, state } = ctx;
  const diff = data.config.difficulty[input.difficulty];
  const rec = diff.guided ? E.recommend(data, input) : null;
  const cards = E.visibleLaunchers(data, input.difficulty).map((l) => {
    const r = state.reports[l.id];
    const orbitId = input.target_orbit.id;
    const level = r.compatible ? r.mass.level : 'red';
    const blocked = !r.compatible;
    const failReason = r.checks.find((c) => c.status === 'fail')?.title;
    const cap = r.mass.capacity_kg;
    return `<button type="button" class="lcard ${level} ${blocked ? 'blocked' : ''} ${state.choice.launcher_id === l.id ? 'selected' : ''}" data-action="select-launcher" data-id="${l.id}" aria-pressed="${state.choice.launcher_id === l.id}">
      <span class="lhead"><strong>${esc(l.name)}</strong><span class="tag">${CLASS_LABEL[l.class]}</span>${l.id === rec ? '<span class="tag rec">Recomendado</span>' : ''}${l.fictional ? '<span class="tag">Ficticio</span>' : ''}</span>
      <span class="ltag">${esc(l.tagline)}</span>
      <span class="lrow"><span>${term(data, 'cost', 'Costo')}</span><b>${fmt(r.cost_musd)} M$</b></span>
      <span class="lrow"><span>Capacidad a ${orbitId}</span><b>${cap ? fmt(cap) + ' kg' : '—'}</b></span>
      <span class="lrow"><span>${term(data, 'reliability', 'Confiabilidad')}</span><b>${Math.round(l.reliability * 100)} %</b></span>
      ${cap ? massBar(r.mass) : ''}
      <span class="lstate ${level}">${blocked ? '🔒 ' + esc(failReason) : LEVEL[level].icon + ' ' + LEVEL[level].label + ` (${r.mass.margin_pct >= 0 ? '+' : ''}${r.mass.margin_pct} %)`}</span>
    </button>`;
  }).join('');
  el.innerHTML = `
    <h2><span class="num">2</span> Elige un vehículo de lanzamiento</h2>
    <p class="muted">Compara opciones: no hay una única respuesta correcta. Los 🔒 no son compatibles, pero puedes tocarlos para ver por qué.</p>
    <p class="disclaimer">Cifras <strong>simplificadas y aproximadas</strong> con fines educativos; las fuentes están en cada ficha y en <code>data/launchers.json</code>.</p>
    <div class="lgrid">${cards}</div>`;
}

// ---------- Informe de compatibilidad ----------
export function renderReport(el, ctx) {
  const { data, input, state } = ctx;
  const r = state.report;
  if (!r) { el.innerHTML = `<h2><span class="num">3</span> ¿Funciona esta combinación?</h2><p class="muted">Elige un lanzador para ver la verificación.</p>`; return; }
  const l = E.getLauncher(data, r.launcher_id), diff = data.config.difficulty[input.difficulty], orbit = data.config.orbits[r.orbit_id];
  const siteOpts = diff.choose_site && l.sites.length > 1
    ? `<label class="field">Sitio de lanzamiento <select data-action="set-site">${l.sites.map((s) => `<option value="${s}" ${s === r.site_id ? 'selected' : ''}>${esc(data.config.sites[s].name)} (lat ${data.config.sites[s].latitude_deg}°)</option>`).join('')}</select></label>` : `<p class="muted">Sitio: ${esc(data.config.sites[r.site_id].name)} (latitud ${data.config.sites[r.site_id].latitude_deg}°). ${esc(data.config.sites[r.site_id].note)}</p>`;
  const incCtl = diff.choose_inclination && orbit.inclination_editable
    ? `<label class="field">${term(data, 'inclination', 'Inclinación')} objetivo: <output>${r.inclination_deg}°</output><input type="range" min="0" max="90" step="0.5" value="${r.inclination_deg}" data-action="set-inclination"></label>` : '';
  const m = r.mass;
  el.innerHTML = `
    <h2><span class="num">3</span> ¿Funciona ${esc(l.name)} para tu misión?</h2>
    ${siteOpts}${incCtl}
    <div class="verdict ${r.compatible ? m.level : 'red'}">${r.compatible ? (m.level === 'green' ? '✔ Compatible con margen sano' : '▲ Compatible, pero con poca holgura') : '✖ No compatible'}</div>
    <div class="massblock">
      <div class="massnums">
        <div><span>Masa a lanzar</span><b>${fmt(m.payload_kg)} kg</b><small>nave + adaptador ${m.adapter_kg} kg</small></div>
        <div><span>Capacidad a ${r.orbit_id}</span><b>${fmt(m.capacity_kg)} kg</b><small>base ${fmt(m.base_capacity_kg)} kg</small></div>
        <div class="${m.level}"><span>${term(data, 'mass_margin', 'Margen de masa')}</span><b>${m.margin_kg >= 0 ? '+' : ''}${fmt(m.margin_kg)} kg</b><small>${m.margin_pct} % sobre la nave</small></div>
      </div>
      ${m.capacity_kg ? massBar(m) : ''}
      <p class="legend"><span class="dot green"></span> ≥ 15 % sano <span class="dot yellow"></span> 0–15 % justo <span class="dot red"></span> negativo: no cabe</p>
      ${why(data.glossary.mass_margin.why)}
    </div>
    <ul class="checks">${r.checks.map((c) => `<li class="${c.status}"><span class="ico">${ICON[c.status]}</span><div><strong>${esc(c.title)}</strong><p>${esc(c.detail)}</p>${why(c.why)}</div></li>`).join('')}</ul>
    ${r.capacity_notes.length ? `<p class="muted">Ajustes: ${r.capacity_notes.map(esc).join(' ')}</p>` : ''}
    ${r.suggestions.length ? `<div class="suggest"><h3>${r.compatible ? 'Para pensar' : 'Qué puedes hacer'}</h3><ul>${r.suggestions.map((s) => `<li><span class="role">${esc(roleName(data, s.role))}</span> ${esc(s.text)}${(s.launcher_ids || []).map((id) => ` <button type="button" class="chip" data-action="select-launcher" data-id="${id}">Ver ${esc(E.getLauncher(data, id).name)}</button>`).join('')}</li>`).join('')}</ul></div>` : ''}
    <p class="learn">💡 <strong>${esc(l.name)}:</strong> ${esc(l.learn)}</p>
    <details class="why"><summary>Fuentes y datos de ${esc(l.name)}</summary><ul>${l.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul><p class="muted">Confiabilidad: ${esc(l.reliability_basis)}</p>${l.estimated_fields?.length ? `<p class="muted">Estimado por el equipo: ${l.estimated_fields.map(esc).join(', ')}.</p>` : ''}</details>`;
}

const roleName = (data, id) => data.config.roles.find((r) => r.id === id)?.short ?? id;

// ---------- Comparación (trade study) ----------
export function renderCompare(el, ctx) {
  const { data, state } = ctx;
  const rows = Object.values(state.reports);
  const okRows = rows.filter((r) => r.compatible);
  const best = {
    cheap: okRows.length ? okRows.reduce((a, b) => (a.cost_musd <= b.cost_musd ? a : b)).launcher_id : null,
    safe: okRows.length ? okRows.reduce((a, b) => (a.reliability.p_success >= b.reliability.p_success ? a : b)).launcher_id : null,
    room: okRows.length ? okRows.reduce((a, b) => (a.mass.margin_pct >= b.mass.margin_pct ? a : b)).launcher_id : null,
  };
  const key = state.sort;
  const val = { cost: (r) => r.cost_musd, risk: (r) => -r.reliability.p_success, margin: (r) => -r.mass.margin_pct };
  const sorted = [...rows].sort((a, b) => (Number(!a.compatible) - Number(!b.compatible)) || val[key](a) - val[key](b));
  el.innerHTML = `
    <h2><span class="num">4</span> Compara: ¿qué sacrificas con cada opción?</h2>
    <p class="muted">Ordenar por: ${[['cost', 'Costo'], ['risk', 'Seguridad'], ['margin', 'Margen']].map(([k, t]) => `<button type="button" class="chip ${key === k ? 'on' : ''}" data-action="sort" data-key="${k}">${t}</button>`).join(' ')}</p>
    <div class="tablewrap"><table><thead><tr><th>Lanzador</th><th>Estado</th><th>Costo</th><th>Margen</th><th>P(éxito)</th><th>Plazo</th><th>Compromiso</th></tr></thead><tbody>
    ${sorted.map((r) => { const l = E.getLauncher(data, r.launcher_id); const tags = [r.launcher_id === best.cheap && 'Más barato', r.launcher_id === best.safe && 'Más seguro', r.launcher_id === best.room && 'Más margen'].filter(Boolean);
      return `<tr class="${r.compatible ? r.mass.level : 'red'} ${state.choice.launcher_id === r.launcher_id ? 'selected' : ''}" data-action="select-launcher" data-id="${r.launcher_id}" tabindex="0"><td>${esc(l.name)}</td><td>${r.compatible ? LEVEL[r.mass.level].label : '🔒 ' + esc(r.checks.find((c) => c.status === 'fail').title)}</td><td>${fmt(r.cost_musd)} M$</td><td>${r.mass.capacity_kg ? r.mass.margin_pct + ' %' : '—'}</td><td>${Math.round(r.reliability.p_success * 100)} %</td><td>${l.lead_time_months} m</td><td>${tags.map((t) => `<span class="tag rec">${t}</span>`).join(' ')}</td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="learn">💡 ${okRows.length > 1 ? `Hay <strong>${okRows.length}</strong> lanzadores que sirven para esta misión: elegir es decidir qué te importa más (dinero, seguridad o margen para crecer).` : okRows.length === 1 ? 'Solo un lanzador cumple todo. Si quieres más opciones, cambia la masa, la órbita o el presupuesto.' : 'Ningún lanzador cumple todo con estos datos. Revisa las sugerencias de cada uno: hay que cambiar la nave, la órbita o el presupuesto.'}</p>`;
}

// ---------- Panel de recursos (lateral) ----------
export function renderResources(el, ctx) {
  const { data, input, state } = ctx;
  const r = state.report, res = state.result;
  const budget = input.budget_musd;
  const spent = res ? res.cost_musd : r?.cost_musd ?? 0;
  const left = budget - spent;
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  const lvl = left < 0 ? 'red' : pct > 60 ? 'yellow' : 'green';
  el.innerHTML = `
    <h2>Recursos de la misión</h2>
    <div class="res"><div class="rl"><span>${term(data, 'cost', 'Presupuesto')}</span><b>${fmt(Math.round(left * 100) / 100)} M$ libres</b></div>
      <div class="bar ${lvl}"><div style="width:${pct}%"></div></div><small>${fmt(Math.round(spent * 100) / 100)} de ${fmt(budget)} M$ en lanzamiento${res && res.cost_breakdown.extra_musd ? ` (incluye +${res.cost_breakdown.extra_musd} M$ por imprevistos)` : ''}</small></div>
    ${r && r.mass.capacity_kg ? `<div class="res"><div class="rl"><span>${term(data, 'mass_margin', 'Margen de masa')}</span><b>${r.mass.margin_kg >= 0 ? '+' : ''}${fmt(r.mass.margin_kg)} kg</b></div>${massBar(r.mass)}<small>${r.mass.margin_pct} % · uso ${r.mass.usage_pct} %</small></div>` : ''}
    ${r ? `<div class="res"><div class="rl"><span>${term(data, 'reliability', 'Prob. de éxito')}</span><b>${(r.reliability.p_success * 100).toFixed(1)} %</b></div><div class="bar ${r.reliability.p_success > 0.95 ? 'green' : r.reliability.p_success > 0.85 ? 'yellow' : 'red'}"><div style="width:${r.reliability.p_success * 100}%"></div></div><small>De cada 100 lanzamientos así, ~${Math.round(r.reliability.p_fail * 100)} perderían la nave.</small></div>
    <div class="res"><div class="rl"><span>${term(data, 'lead_time', 'Plazo de reserva')}</span><b>${E.getLauncher(data, r.launcher_id).lead_time_months} meses</b></div><small>${input.deadline_months != null ? `Fecha límite: ${input.deadline_months} meses` : 'Sin fecha límite'}</small></div>` : '<p class="muted">Elige un lanzador para ver su impacto.</p>'}
    ${res ? `<div class="res"><div class="rl"><span>Vida útil esperada</span><b>${res.spacecraft_delta.remaining_life_years} años</b></div><small>Combustible restante: ${fmt(res.spacecraft_delta.remaining_fuel_kg)} kg${res.delay_days ? ` · retraso ${res.delay_days} días` : ''}</small></div>` : ''}`;
}

// ---------- Equipo ----------
export function renderTeam(el, ctx) {
  const { data, state } = ctx;
  const r = state.report;
  const notices = r ? E.roleNotices(data, ctx.input, r) : null;
  const roles = data.config.roles;
  const stats = Object.values(state.team);
  const obj = stats.filter((s) => s.v === 'object').length, ok = stats.filter((s) => s.v === 'ok').length;
  el.innerHTML = `
    <h2>Modo equipo</h2>
    <p class="muted">Tu rol: <strong>${esc(roles[0].name)}</strong>. ${state.solo ? 'Juegas solo: tú cubres todos los roles, pero ve qué significa para cada uno.' : 'Cada rol ve esta decisión y responde.'}</p>
    <ul class="roles">${roles.map((ro) => {
      const st = state.team[ro.id];
      return `<li><div class="rname">${esc(ro.name)}${ro.owner ? ' <span class="tag rec">decide</span>' : ''}</div>
        ${notices ? `<ul class="rn">${notices[ro.id].map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        ${ro.owner ? '' : `<div class="vote"><button type="button" class="chip ${st?.v === 'ok' ? 'on' : ''}" data-action="vote" data-role="${ro.id}" data-v="ok" aria-pressed="${st?.v === 'ok'}">👍 De acuerdo</button><button type="button" class="chip ${st?.v === 'object' ? 'on warn' : ''}" data-action="vote" data-role="${ro.id}" data-v="object" aria-pressed="${st?.v === 'object'}">✋ Objeción</button></div>
        ${st?.v === 'object' ? `<input class="note" type="text" maxlength="120" placeholder="¿Qué te preocupa?" value="${esc(st.note || '')}" data-action="vote-note" data-role="${ro.id}">` : ''}`}</li>`; }).join('')}</ul>
    <p class="muted">${ok} de acuerdo · ${obj} objeción(es). Las objeciones se envían junto con la decisión.</p>`;
}

// ---------- Secuencia y resultado ----------
export function renderLaunchPanel(el, ctx) {
  const { state } = ctx;
  const r = state.report;
  const disabled = !r || !r.compatible || state.running;
  const warn = Object.values(state.team).some((s) => s.v === 'object');
  el.innerHTML = `
    <h2><span class="num">5</span> Lanza y observa</h2>
    ${r ? `<p class="muted">Se lanzará la nave con <strong>${esc(E.getLauncher(ctx.data, r.launcher_id).name)}</strong> hacia ${esc(r.orbit_id)}. Probabilidad de éxito: <strong>${(r.reliability.p_success * 100).toFixed(1)} %</strong>.</p>` : ''}
    ${warn ? '<p class="warnline">✋ Hay objeciones del equipo: coméntenlas antes de lanzar.</p>' : ''}
    <div class="actions"><button type="button" class="primary" data-action="launch" ${disabled ? 'disabled' : ''}>${state.running ? 'Lanzando…' : '🚀 INICIAR LANZAMIENTO'}</button>
    <button type="button" data-action="skip" ${state.running ? '' : 'hidden'}>Saltar animación</button></div>
    <canvas id="seq" width="640" height="480" aria-label="Animación del lanzamiento"></canvas>
    <div id="caption" class="caption" role="status" aria-live="polite">${state.result ? '' : 'Elige un lanzador compatible y pulsa iniciar.'}</div>
    <ol id="phases" class="phases">${ctx.data.config.timeline.phases.map((p) => `<li data-ph="${p.id}">${esc(p.label)}</li>`).join('')}</ol>`;
}

export function renderResult(el, ctx) {
  const { data, input, state } = ctx;
  const r = state.result;
  if (!r) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const titles = { success: '✔ Éxito', partial: '▲ Éxito parcial', failure: '✖ Falla: misión perdida' };
  const ach = r.achieved_orbit, tgt = r.target_orbit;
  const ref = !r.mission_lost ? E.similarMission(data, tgt.id, input.spacecraft.mass_kg) : null;
  const refL = ref ? E.getLauncher(data, ref.launcher_id) : null;
  el.innerHTML = `
    <h2>Resultado del lanzamiento</h2>
    <div class="verdict ${r.status === 'success' ? 'green' : r.status === 'partial' ? 'yellow' : 'red'}">${titles[r.status]}</div>
    <dl class="facts">
      <div><dt>Lanzador</dt><dd>${esc(r.launcher.name)}</dd></div>
      <div><dt>Costo total</dt><dd>${r.cost_musd} M$ ${r.cost_breakdown.extra_musd ? `<small>(+${r.cost_breakdown.extra_musd} extra)</small>` : ''}</dd></div>
      <div><dt>Presupuesto restante</dt><dd>${r.budget_remaining_musd} M$</dd></div>
      <div><dt>Órbita lograda</dt><dd>${ach ? `${esc(ach.id)} · ${fmt(ach.altitude_km)} km${ach.deviation_pct ? ` (planeada ${fmt(tgt.altitude_km)})` : ' (como se planeó)'}` : 'Ninguna'}</dd></div>
      <div><dt>Combustible perdido</dt><dd>${r.spacecraft_delta.fuel_lost_kg} kg</dd></div>
      <div><dt>Vida útil perdida</dt><dd>${r.spacecraft_delta.life_lost_years} años</dd></div>
      <div><dt>Retraso</dt><dd>${r.delay_days} días</dd></div>
    </dl>
    ${r.events.length ? `<h3>Qué pasó y por qué importa</h3><ul class="events">${r.events.map((e) => `<li class="${e.severity}"><strong>${esc(e.title)}</strong> <span class="muted">(${esc(data.config.timeline.phases.find((p) => p.id === e.phase).label)})</span><p>${esc(e.text)}</p><p class="learn">💡 ${esc(e.learn)}</p></li>`).join('')}</ul>` : '<p class="learn">💡 Sin incidentes: la nave llegó exactamente donde se planeó. Aun así, un lanzamiento perfecto no era seguro: la probabilidad de éxito era ' + (r.reliability.p_success * 100).toFixed(1) + ' %.</p>'}
    ${ref ? `<p class="refm">🛰 Tu lanzamiento se parece a <strong>${esc(ref.name)}</strong> (~${fmt(ref.mass_kg)} kg a ${esc(tgt.id)}), que usó <strong>${esc(ref.real_launcher)}</strong>. ${esc(ref.note)} <span class="muted">(${refL.id === r.launcher.id ? 'Elegiste un lanzador parecido.' : 'Aquí elegiste ' + esc(r.launcher.name) + ': es otra solución válida con otros compromisos.'})</span></p>` : ''}
    <div class="actions"><button type="button" class="primary" data-action="confirm">Confirmar y enviar al siguiente módulo</button><button type="button" data-action="reset">Volver a elegir</button></div>
    ${state.published ? '<p class="okline">✔ Resultado publicado para el siguiente módulo.</p>' : ''}
    <details class="why"><summary>Datos que entrega este módulo (JSON)</summary><pre>${esc(JSON.stringify(state.output, null, 2))}</pre></details>`;
}

// ---------- Panel de mocks ----------
export function renderMock(el, ctx, presets) {
  const { input, state } = ctx;
  if (state.source !== 'mock') { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<summary>Panel de práctica (mock de otros módulos)</summary>
    <div class="mockgrid">
      <label class="field">Misión de ejemplo <select data-action="preset">${Object.entries(presets).map(([k, p]) => `<option value="${k}" ${state.preset === k ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      <label class="field">Dificultad <select data-action="difficulty">${Object.entries(ctx.data.config.difficulty).map(([k, d]) => `<option value="${k}" ${input.difficulty === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}</select></label>
      <label class="field">Masa de la nave (kg) <input type="number" min="1" step="10" value="${input.spacecraft.mass_kg}" data-action="mass"></label>
      <label class="field">Presupuesto (M$) <input type="number" min="1" step="5" value="${input.budget_musd}" data-action="budget"></label>
      <label class="field">Órbita <select data-action="orbit">${Object.values(ctx.data.config.orbits).map((o) => `<option value="${o.id}" ${input.target_orbit.id === o.id ? 'selected' : ''}>${o.id}</option>`).join('')}</select></label>
    </div>
    <p class="muted">Cambia la masa y mira cómo cambia qué lanzadores sirven. <a href="arcade.html">Minijuego arcade (versión anterior)</a></p>`;
}
