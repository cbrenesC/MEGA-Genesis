import { simText } from "../../../src/i18n/catalog.js";
// Read-only flight resources and results. Mission preparation lives in Mission Control.
import { buildRequests, matchReferenceMission } from './rules.js';
import { ROLES } from './state.js';
import { fmtKg, fmtMUSD, fmtMUSDShort, lifeText } from './plain.js';
import { t, formatNumber } from '../../../src/i18n/index.js';
import { app, inputs, current, currentOutput } from './store.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Estados con ícono + texto (no dependen solo del color).
export const STATUS = {
  green: { icon: '✔', get text() { return simText("flight.comfortable-margin"); }, cls: 'green' },
  yellow: { icon: '⚠', get text() { return simText("flight.tight-margin"); }, cls: 'yellow' },
  red: { icon: '▲', get text() { return simText("flight.risky-margin"); }, cls: 'red' },
  blocked: { icon: '✖', get text() { return simText("flight.does-not-fit"); }, cls: 'red' },
};
const RESULT_TEXT = {
  exito: { icon: '✔', get title() { return simText("flight.success-the-spacecraft-reached-its-target"); }, get text() { return simText("flight.the-launch-vehicle-did-its-job-review-the"); } },
  exito_parcial: { icon: '◐', get title() { return simText("flight.partial-success-you-made-it-but-at-a"); }, get text() { return simText("flight.the-spacecraft-survived-but-it-lost-some-service"); } },
  falla: { icon: '✖', get title() { return simText("flight.mission-lost"); }, get text() { return simText("flight.this-flight-did-not-succeed-real-mission-teams"); } },
};

// Misión lunar de ida y vuelta: el éxito no es "quedar en órbita" sino volver a casa.
const RESULT_TEXT_LUNAR = {
  exito: { icon: '✔', get title() { return simText("lunarFlight.success-the-crew-reached-the-moon-and-returned"); }, get text() { return simText("lunarFlight.you-completed-the-round-trip-earth-orbit-lunar"); } },
  exito_parcial: { icon: '◐', get title() { return simText("lunarFlight.partial-success-the-mission-was-not-fully-completed"); }, get text() { return simText("lunarFlight.a-milestone-was-missed-or-the-flight-was"); } },
  falla: { icon: '✖', title: 'Misión perdida', get text() { return simText("lunarFlight.the-lunar-trip-has-several-milestones-review-where"); } },
};

const sourceTag = (key) => (app.resolved.sources[key] === 'estacion'
  ? `<span class="tag shared">${simText("flight.mission-control")}</span>`
  : app.resolved.sources[key] === 'compartido'
  ? `<span class="tag shared" title="${simText("flight.data-provided-by-another-team-in-the-game")}">${simText("flight.from-another-team")}</span>`
  : app.resolved.sources[key] === 'mock' ? `<span class="tag mock" title="${simText("flight.practice-data-the-responsible-team-has-not-provided")}">${simText("flight.practice-data")}</span>` : '');

export function renderResult() {
  const e = current();
  const f = app.flight;
  if (!e || !f) return `<p>${simText("flight.no-result-yet")}</p>`;
  const sc = inputs().spacecraft;
  const out = currentOutput('lanzado');
  const fd = f.flightData;
  const lunar = fd?.lunar ?? null;
  const txt = (lunar ? RESULT_TEXT_LUNAR : RESULT_TEXT)[f.result];
  const ao = f.achievedOrbit;
  const orbitText = ao
    ? (ao.periapsisKm != null ? `${ao.periapsisKm} × ${ao.apoapsisKm} km${ao.type === 'LUNA' ? ` (${simText("flight.moon")})` : ''}` : `${esc(ao.type)}${ao.altitudeKm != null ? ` · ${ao.altitudeKm} km` : ''}`) + (ao.inclinationDeg != null && inputs().orbit.type !== 'GTO' ? ` · ${ao.inclinationDeg}°` : '')
    : simText("flight.none");
  const pilot = f.pilot;
  const match = matchReferenceMission(app.data.missions, inputs().orbit.type, sc.massKg, e.launcherId);
  const m = match.closest;
  const free = inputs().difficulty === 'facil';

  const score = pilot ? `
  <article class="card">
    <h2>${simText("flight.flight-score")} <span class="score">${pilot.total}</span><small>/100</small></h2>
    <ul class="score-parts">${pilot.parts.map((p) => `<li><div class="sp-head"><span>${esc(p.label)}</span><b>${p.points} / ${p.max}</b></div><div class="sp-bar"><i style="width:${(p.points / p.max) * 100}%"></i></div><small>${esc(p.note)}</small></li>`).join('')}</ul>
    <details><summary>${simText("flight.how-is-this-score-calculated")}</summary>
      ${pilot.how ? `<p>${esc(pilot.how)}</p>` : `<p>${simText("flight.you-can-earn-up-to-100-points")} <b>50</b> ${simText("flight.for-how-closely-your-trajectory-matched-the-mission")} <b>25</b> ${simText("flight.for-fuel-remaining")} <b>15</b> ${simText("flight.for-staying-below-the-air-pressure-limit-max")} <b>10</b> ${simText("flight.for-separating-stages-and-the-fairing-at-the")}</p>
      <p class="more"><b>${simText("flight.learn-more")}</b> ${simText("flight.fuel-is-compared-with-the-autopilot-on-the")}</p>`}
    </details>
    ${fd?.autopilot ? `<p class="muted">${simText("flight.you-used-autopilot-flying-manually-earns-more-points")}</p>` : ''}
  </article>` : '';

  const dash = (v, unit = '') => (v == null ? '—' : `${v.toLocaleString('es')}${unit}`);
  const flightCard = lunar ? `
  <article class="card">
    <h2>${simText("lunarFlight.your-journey-data")}</h2>
    <div class="kpis">
      <div class="kpi"><span>${simText("lunarFlight.journey-duration")}</span><b>${dash(lunar.days, simText("lunarFlight.days"))}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.lunar-orbit")}</span><b>${lunar.lunarOrbitKm ? `${lunar.lunarOrbitKm.periapsis} × ${lunar.lunarOrbitKm.apoapsis} km` : '—'}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.lunar-revolutions")}</span><b>${lunar.lunarOrbitKm ? dash(lunar.lunarRevs) : '—'}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.closest-approach-to-the-moon")}</span><b>${dash(lunar.closestToMoonKm, ' km')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.reentry-speed")}</span><b>${dash(lunar.entrySpeedKmS, ' km/s')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.peak-g-load")}</span><b>${lunar.entrySpeedKmS == null ? '—' : dash(lunar.maxG, ' g')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.peak-heat-shield-flux")}</span><b>${lunar.entrySpeedKmS == null ? '—' : dash(lunar.peakHeatWcm2, ' W/cm²')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.heat-shield-remaining")}</span><b>${lunar.entrySpeedKmS == null ? '—' : dash(lunar.shieldLeftPct, ' %')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.speed-at-parachute-deployment")}</span><b>${dash(lunar.chuteSpeedMs, ' m/s')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.splashdown-speed")}</span><b>${dash(lunar.landingSpeedMs, ' m/s')}</b></div>
      <div class="kpi"><span>${simText("lunarFlight.peak-dynamic-pressure-ascent")}</span><b>${fd.maxQKPa} kPa</b></div>
      <div class="kpi"><span>${simText("lunarFlight.fuel-remaining")}</span><b>${fd.fuelLeftPct} %</b></div>
    </div>
    ${fd.stagingTimes.length ? `<p class="muted">${simText("lunarFlight.stage-separations-0", fd.stagingTimes.map((s) => `${s.stage > (fd.stagingTimes.length - 1) && lunar.reached.includes('left') ? simText("lunarFlight.service-module-2") : simText("lunarFlight.stage-0", s.stage)} (${s.altitudeKm.toLocaleString('es')} km)`).join(' · '))}</p>` : ''}
  </article>` : fd ? `
  <article class="card">
    <h2>${simText("flight.your-flight-data")}</h2>
    <div class="kpis">
      <div class="kpi"><span>${simText("flight.maximum-altitude")}</span><b>${fd.maxAltitudeKm} km</b></div>
      <div class="kpi"><span>${simText("flight.highest-point-apoapsis")}</span><b>${fd.apoapsisKm ?? '—'} km</b></div>
      <div class="kpi"><span>${simText("flight.lowest-point-periapsis")}</span><b>${fd.periapsisKm} km</b></div>
      <div class="kpi"><span>${simText("flight.fuel-remaining")}</span><b>${fd.fuelLeftPct} %</b></div>
      <div class="kpi"><span>${simText("flight.maximum-dynamic-pressure")}</span><b>${fd.maxQKPa} kPa</b></div>
      <div class="kpi"><span>${simText("flight.duration")}</span><b>${Math.floor(fd.durationSeconds / 60)} min ${fd.durationSeconds % 60} s</b></div>
    </div>
    ${fd.stagingTimes.length ? `<p class="muted">${simText("flight.stage-separations-0", fd.stagingTimes.map((s) => simText("flight.stage-0-at-1-s-2-km", s.stage, s.tSeconds, s.altitudeKm)).join(' · '))}</p>` : ''}
  </article>` : `<article class="card"><p class="muted">${simText("flight.this-rocket-and-destination-do-not-yet-have")}</p></article>`;

  const delivery = app.delivery;
  const canRetry = delivery ? !delivery.delivered && (free || out.budgetAfterMUSD >= e.totalCostMUSD) : f.result !== 'exito';
  const campaignCard = delivery ? `
    <article class="card result ${delivery.delivered ? 'exito' : 'falla'}">
      <h2>${esc(t(delivery.delivered ? 'campaign.delivered' : 'campaign.notDelivered'))}</h2>
      <p>${esc(t(delivery.delivered ? 'campaign.landingModel' : `station.campaign.failed.${delivery.reason}`))}</p>
      <p>${esc(t('campaign.flightSummary', { launcher: delivery.launcher, site: delivery.site, payload: formatNumber(delivery.payloadKg), cost: formatNumber(delivery.costMUSD, 2), budget: formatNumber(delivery.budgetMUSD) }))}</p>
    </article>` : '';

  return `
  ${campaignCard}
  <article class="card result ${f.result}">
    <h2><span class="ico">${txt.icon}</span> ${txt.title}</h2>
    <p class="lead">${esc(f.headline ?? '')}</p>
    <p>${txt.text}</p>
    ${f.story?.length ? `<ul class="story">${f.story.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    <div class="kpis">
      <div class="kpi"><span>${simText("flight.rocket")}</span><b>${esc(e.launcher.name)}</b></div>
      <div class="kpi"><span>${simText("flight.trajectory-achieved")}</span><b>${orbitText}</b></div>
      <div class="kpi"><span>${simText(sc.missionDays ? 'flight.planned-duration' : 'flight.spacecraft-service-life')}</span><b>${lifeText(sc, f.lifetimeYears)}</b></div>
      <div class="kpi"><span>${simText("flight.launch-cost")}</span><b>${fmtMUSD(out.cost.totalMUSD)}</b></div>
      <div class="kpi"><span>${simText("flight.budget-remaining")}</span><b class="${out.budgetAfterMUSD < 0 ? 'status-red' : ''}">${fmtMUSD(out.budgetAfterMUSD)}</b></div>
      <div class="kpi"><span>${simText("flight.launch")}</span><b>${simText('flight.month-0', e.date.launchMonth)}${f.delayDays ? simText("flight.0-days", f.delayDays) : ''}</b></div>
    </div>
  </article>
  ${score}${flightCard}
  <div class="grid-2">
    <article class="card"><h2>${simText("flight.what-happened-and-why-it-matters")}</h2>${f.events.length
      ? `<ul class="log">${f.events.map((ev) => `<li class="${ev.severity}"><b>${esc(ev.label)}</b> — ${esc(ev.consequence)}<small>${esc(ev.explain)}</small></li>`).join('')}</ul>`
      : `<p>${simText('flight.no-events')}${f.eventsEnabled ? '' : simText("flight.random-events-were-off-in-practice-mode")}</p>`}</article>
    <article class="card"><h2>${simText("flight.similar-real-missions")}</h2>
      ${m ? `<p>${simText("flight.your-flight-was-similar-to")} <b>${esc(m.name)}</b> ${simText("flight.0-about-1-2-which-used", m.year, fmtKg(m.massKg), esc(m.orbit))} <b>${esc(m.launcher)}</b>${m.launcherId === e.launcherId ? simText("flight.the-same-rocket-you-chose") : '.'}</p><p class="muted">${esc(m.note)}</p>` : ''}
      ${match.sameLauncher ? `<p>${simText("flight.another-mission-using-this-rocket-was")} <b>${esc(match.sameLauncher.name)}</b> ${simText("flight.0-about-1", match.sameLauncher.year, fmtKg(match.sameLauncher.massKg))}</p>` : ''}
      <p class="muted">${simText("flight.masses-are-rounded-from-publicly-available-mission-information")}</p></article>
  </div>
  <article class="card">
    <h2>${simText("flight.handoff-to-the-next-team")}</h2>
    <p>${simText("flight.you-can-view-or-copy-the-flight-data", out.schemaVersion)}</p>
    ${out.requests.length ? `<h3>${simText("flight.notes-for-other-roles")}</h3><ul>${out.requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : ''}
    <details><summary>${simText("flight.view-the-complete-flight-data-json")}</summary><pre class="json" id="output-json">${esc(JSON.stringify(out, null, 2))}</pre></details>
    <div class="actions">
      <button id="copy-json">${simText("flight.copy-flight-data")}</button>
      ${canRetry ? `<button class="primary" id="retry">${free ? simText("flight.try-again-free-on-easy") : simText("flight.buy-another-launch-0-more", fmtMUSD(e.totalCostMUSD))}</button>` : ''}
      <button id="return-control">${simText("flight.return-to-mission-control")}</button>
    </div>
    ${canRetry && !free ? `<p class="muted">${simText("flight.a-retry-means-paying-for-another-rocket-and")}</p>` : ''}
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
      <span class="pill" title="${simText('flight.budget-remaining')}: ${fmtMUSD(remaining)}"><b>💲</b> ${fmtMUSDShort(remaining)}</span>
      <span class="pill ${st ? `status-${st.cls}` : ''}" title="${simText("flight.payload-capacity-remaining")}"><b>⚖</b> ${e ? `${st.icon} ${e.marginPct} %` : '—'}</span>
      <span class="pill" title="${simText("flight.launch-month")}"><b>📅</b> ${e ? simText("flight.month-0", e.date.launchMonth) : simText("flight.month-0", schedule.monthsToTargetDate)}</span>
      <span class="pill" title="${simText(sc.missionDays ? 'flight.duration-in-days' : 'flight.spacecraft-service-life-in-years')}"><b>⏳</b> ${sc.missionDays ? `${sc.missionDays} d` : `${lifetime}/${sc.designLifetimeYears} a`}</span>
    </div>`;
  }
  return `
    <div class="res">
      <h3>${simText("flight.budget")}</h3>
      <div class="stack"><i class="others" style="width:${pct(budget.committedMUSD)}"></i><i class="launch" style="width:${pct(launchCost)}"></i><i class="events" style="width:${pct(eventsCost)}"></i></div>
      <div class="row"><span>${simText("flight.total")}</span><b>${fmtMUSD(budget.totalMUSD)}</b></div>
      <div class="row"><span>${simText(app.campaign ? 'flight.committed-campaign' : 'flight.other-teams')}${app.previousAttemptsMUSD ? simText("flight.previous-attempts") : ''}</span><b>−${fmtMUSD(budget.committedMUSD)}</b></div>
      <div class="row"><span>${simText('flight.rocket')}${e?.delayCostMUSD ? simText("flight.delay") : ''}</span><b>${e ? `−${fmtMUSD(launchCost)}` : '—'}</b></div>
      ${eventsCost ? `<div class="row"><span>${simText("flight.unexpected-events")}</span><b>−${fmtMUSD(eventsCost)}</b></div>` : ''}
      <div class="row total"><span>${simText("flight.remaining")}</span><b class="${remaining < 0 ? 'status-red' : ''}">${fmtMUSD(remaining)}</b></div>
    </div>
    <div class="res">
      <h3>⚖ ${simText('flight.weight')} ${sourceTag('spacecraft')}</h3>
      <div class="row"><span>${simText("flight.spacecraft-at-liftoff")}</span><b>${fmtKg(e ? e.launchMassKg : sc.massKg)}</b></div>
      <div class="row"><span>${simText("flight.payload-capacity")}</span><b>${e ? fmtKg(e.capacityKg) : '—'}</b></div>
      <div class="row"><span>${simText("flight.margin")}</span><b class="${st ? `status-${st.cls}` : ''}">${e ? `${st.icon} ${e.marginPct} %` : '—'}</b></div>
    </div>
    <div class="res">
      <h3>📅 Tiempo ${sourceTag('schedule')}</h3>
      <div class="row"><span>${simText("flight.target")}</span><b>${simText('flight.month-0', schedule.monthsToTargetDate)}</b></div>
      <div class="row"><span>${simText("flight.launch")}</span><b class="${e?.date.delayMonths ? 'status-yellow' : ''}">${e ? simText("flight.month-0-1", e.date.launchMonth, f?.delayDays ? ` + ${f.delayDays} d` : '') : '—'}</b></div>
    </div>
    <div class="res">
      <h3>${simText("flight.service-life-and-risk")}</h3>
      <div class="row"><span>${simText(sc.missionDays ? 'flight.planned-duration' : 'flight.spacecraft-service-life')}</span><b>${lifeText(sc, f ? lifetime : sc.designLifetimeYears)}</b></div>
      <div class="row"><span>${simText("flight.out-of-100-launches")}</span><b>${e ? simText("flight.0-succeed", Math.round(e.reliability * 100)) : '—'}</b></div>
      <div class="row"><span>${simText("flight.result")}</span><b>${f ? { exito: simText("flight.success"), exito_parcial: simText("flight.partial"), falla: simText("flight.failed") }[f.result] : app.confirmed ? simText("flight.ready-to-launch") : simText("flight.pending")}</b></div>
    </div>
    <div class="res unaffected"><h3>${simText("flight.power-communications-data")}</h3><div>${simText("flight.the-rocket-does-not-directly-change-these-resources")}</div></div>
    ${requests.length ? `<div class="res requests"><h3>${simText("flight.notes-for-other-roles-2")}</h3><ul>${requests.map((r) => `<li><span class="role-chip">${esc(r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul></div>` : ''}`;
}

export function bindScreens(root, nav) {
  root.onclick = (event) => {
    const button = event.target.closest('button');
    if (button?.id === 'retry') nav.retry();
    if (button?.id === 'return-control') nav.exit();
    if (button?.id === 'copy-json') {
      const text = document.getElementById('output-json')?.textContent ?? '';
      if (!navigator.clipboard) { button.textContent = simText("flight.copy-failed"); return; }
      navigator.clipboard.writeText(text).then(() => { button.textContent = simText("flight.copied"); }, () => { button.textContent = simText("flight.copy-failed"); });
    }
  };
}
