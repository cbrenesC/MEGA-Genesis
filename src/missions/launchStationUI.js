import { simText } from "../i18n/catalog.js";
// Preparation UI ported from feature/launch. A station renders one original panel
// against the live flight plan instead of mounting the game's old setup scenes.
import { buildRequests, buildSuggestions, operationalPropellant, tradeHighlights } from '../../games/launch/js/rules.js';
import { DIFFICULTIES, ROLES } from '../../games/launch/js/state.js';
import { fmtKg, fmtMUSD, fmtPct, costLike } from '../../games/launch/js/plain.js';
import { lunarRoverScenario } from './lunarCampaign.js';
import { PRIMARY_MISSION } from './missionTransfer.js';
import { hasFlight } from './flightPlan.js';

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Estados con ícono + texto (no dependen solo del color).
export const STATUS = {
  green: { icon: '✔', get text() { return simText("station.comfortable-margin"); }, cls: 'green' },
  yellow: { icon: '⚠', get text() { return simText("station.tight-margin"); }, cls: 'yellow' },
  red: { icon: '▲', get text() { return simText("station.risky-margin"); }, cls: 'red' },
  blocked: { icon: '✖', get text() { return simText("station.does-not-fit"); }, cls: 'red' },
};
const CHECK_ICON = { ok: { icon: '✔', cls: 'green', get word() { return simText("station.pass"); } }, warn: { icon: '⚠', cls: 'yellow', get word() { return simText("station.caution"); } }, fail: { icon: '✖', cls: 'red', get word() { return simText("station.issue"); } } };
const SHORT_FAIL = { get orbit() { return simText("station.cannot-reach-this-destination"); }, get mass() { return simText("station.exceeds-payload-capacity"); }, get fairing() { return simText("station.does-not-fit-the-fairing"); }, get budget() { return simText("station.exceeds-budget"); }, get inclination() { return simText("station.cannot-reach-that-inclination"); } };
const sourceTag = () => `<span class="tag mock">${simText("station.mission-profile")}</span>`;

const termBtn = (id, label = simText("station.what-does-this-mean")) => `<button class="term" data-term="${id}" aria-label="${esc(label)}">?</button>`;

// ---------------------------------------------------------------------------
// 1. Misión
// ---------------------------------------------------------------------------

function renderBriefing({ data, plan, view, translate }, fields) {
  const label = key => esc(translate(`station.${key}`));
  const { spacecraft: sc, orbit, budget, schedule, missionName, objective, team } = view.resolved.inputs;
  const od = data.orbits.find(o => o.id === orbit.type);
  const players = team?.players ?? [];
  const main = view.resolved.scenario.id === PRIMARY_MISSION;
  const option = s => `<option value="${esc(s.id)}" ${s.id === view.resolved.scenario.id ? 'selected' : ''}>${label(`scenario.${s.id}`)}</option>`;
  const mainScenario = data.mocks.scenarios.find(s => s.id === PRIMARY_MISSION);
  const roverScenario = lunarRoverScenario(data);
  const practices = data.mocks.scenarios.filter(s => s.id !== PRIMARY_MISSION);
  return `
  <div class="screen-grid">
    <article class="card hero">
      <span class="kicker">${label(main ? 'profile.primary' : view.campaign ? 'profile.secondary' : 'profile.practice')}</span>
      <h2>${main ? label('scenario.moonReturn') : esc(missionName)}</h2>
      <p class="lead">${main ? label('lunarObjective') : esc(objective)}</p>

      <dl class="facts">
        <dt>${simText('station.spacecraft')} ${sourceTag('spacecraft')}</dt><dd><b>${esc(sc.name ?? '—')}</b> ${simText("station.weighs-with-fuel", fmtKg(sc.massKg))}</dd>
        <dt>${simText("station.folded-size")}</dt><dd>${simText('station.folded-dimensions', sc.diameterM, sc.heightM)}</dd>
        <dt>${simText("station.fuel")}</dt><dd>${fmtKg(sc.propellantKg)}${sc.propellantKg ? main ? ` (${esc(translate('station.returnFuelReserve', { fuel: fmtKg(sc.reservedPropellantKg) }))})` : simText("station.0-available-for-orbital-operations", fmtKg(operationalPropellant(sc))) : simText("station.this-spacecraft-has-no-engine")}</dd>
        <dt>${simText(sc.missionDays ? 'flight.duration' : 'station.design-life')}</dt><dd>${sc.missionDays ? simText('flight.days-quantity', sc.missionDays) : simText('flight.year-count', sc.designLifetimeYears)}</dd>
        <dt>${simText(sc.return ? 'station.spacecraft-parts' : 'station.instruments')}</dt><dd>${sc.instruments.length ? sc.instruments.map((i) => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') : '—'}</dd>
        ${main ? `<dt>${simText('station.flight-plan')}</dt><dd>${label('lunarStages')}</dd>` : ''}
        <dt>${simText('flight.destination')} ${sourceTag('orbit')}</dt><dd>${esc(od?.name ?? orbit.type)}${orbit.altitudeKm != null && od?.needsInclination ? simText("station.0-km-altitude", orbit.altitudeKm) : ''}${orbit.inclinationDeg != null && od?.needsInclination ? simText("station.0-inclination", orbit.inclinationDeg) : ''}</dd>
        <dt>${simText('flight.budget-2')} ${sourceTag('budget')}</dt><dd>${simText('station.budget-line', fmtMUSD(budget.totalMUSD), costLike(budget.totalMUSD), fmtMUSD(budget.committedMUSD))}</dd>
        <dt>${simText('flight.schedule')} ${sourceTag('schedule')}</dt><dd>${simText("station.target-launch-in-0-months", schedule.monthsToTargetDate)}</dd>
        ${players.length ? `<dt>${simText("station.team")}</dt><dd>${players.map((p) => `${esc(p.name)} (${esc(ROLES[p.role] ?? p.role)})`).join(', ')}</dd>` : ''}
      </dl>
    </article>
    <article class="card">
      <h2>${simText("station.before-you-begin")}</h2>
      <label class="field"><span>${label('field.scenario')}</span>
        <select id="scenario" data-focus="scenario">
          ${mainScenario ? `<optgroup label="${label('profile.primary')}">${option(mainScenario)}</optgroup>` : ''}
          ${roverScenario ? `<optgroup label="${label('profile.secondary')}">${option(roverScenario)}</optgroup>` : ''}
          <optgroup label="${label('profile.practices')}">${practices.map(option).join('')}</optgroup>
        </select>
        <small>${simText("station.every-profile-has-its-own-spacecraft-instruments-and")}</small></label>
      <fieldset class="field difficulty"><legend>${label('field.difficulty')}</legend>
        ${DIFFICULTIES.map((level) => {
          const d = data.rules.difficulty[level];
          return `<label class="choice"><input type="radio" name="difficulty" data-focus="difficulty-${level}" value="${level}" ${level === view.difficulty ? 'checked' : ''}> <span><b>${label(`difficulty.${level}`)}</b><small>${esc(d.description)}</small></span></label>`;
        }).join('')}
      </fieldset>
      <label class="check-row"><input type="checkbox" id="team-mode" data-focus="team" ${plan.teamMode ? 'checked' : ''}> <span><b>${label('field.team')}.</b> ${simText("station.other-roles-sign-off-before-you-confirm-the")}</span></label>
      <p class="muted">${simText("station.all-figures-are")} <b>${simText("station.approximate-values-for-the-game")}</b>${simText("station.open-a-rocket-to-see-its-sources")}</p>
      ${fields}
      <p class="muted">${simText("station.next-configure-the-payload-and-rocket-at-their")}</p>
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
    highlights.cheapest === id && simText("station.lowest-cost"),
    highlights.mostReliable === id && simText("station.most-reliable"),
    highlights.mostMargin === id && simText("station.most-payload-margin"),
    highlights.soonest === id && simText("station.earliest-launch"),
  ].filter(Boolean).map((t) => `<span class="tag highlight">${t}</span>`).join('');
  const list = onlyCompatible ? view.evaluations.filter((e) => e.compatible) : view.evaluations;

  const cards = list.length ? list.map((e) => {
    const l = e.launcher;
    const playable = hasFlight(e.launcherId, orbit.type, data);
    const fails = e.checks.filter((c) => c.status === 'fail').map((c) => SHORT_FAIL[c.id]).filter(Boolean);
    const usage = e.capacityKg > 0 ? Math.min(100, (e.launchMassKg / e.capacityKg) * 100) : 100;
    const st = STATUS[e.marginStatus];
    const capText = e.baseCapacityKg == null ? simText("station.cannot-reach-this-destination-2")
      : simText("station.your-spacecraft-0-out-of-1-payload-capacity", fmtKg(e.launchMassKg), fmtKg(e.capacityKg));
    return `
      <div class="lv ${e.launcherId === view.selected?.launcherId ? 'is-selected' : ''} ${e.compatible ? '' : 'is-locked'}">
        <h3>${esc(l.name)}</h3>
        <div class="provider">${esc(l.provider)}</div>
        ${l.liftoffMassKg ? `<div class="provider" title="${esc(l.sources?.liftoffMassKg ?? '')}">${simText("station.0-metric-tons-at-liftoff", Math.round(l.liftoffMassKg / 1000).toLocaleString('es'))}</div>` : ''}
        <div class="tags"><span class="tag class">${esc(l.class)}</span>${l.fictional ? `<span class="tag fict" title="${simText("station.partially-fictional-configuration")}">${simText("station.partly-fictional")}</span>` : ''}${e.compatible ? tagFor(e.launcherId) : ''}</div>
        <p>${esc(l.summary)}</p>
        <div class="capbar" role="img" aria-label="${esc(capText)}"><i class="${st.cls}" style="width:${usage}%"></i></div>
        <div class="capbar-label">${esc(capText)}</div>
        <dl>
          <dt>${simText("station.cost")}</dt><dd>${fmtMUSD(e.launchCostMUSD)}${e.delayCostMUSD ? ` <small class="status-yellow">${simText("station.0-for-a-1-month-delay", fmtMUSD(e.delayCostMUSD), e.date.delayMonths)}</small>` : ''}</dd>
          <dt>${simText('station.reliability')} ${termBtn('confiabilidad', simText("station.what-does-rocket-reliability-mean"))}</dt><dd>${simText('flight.0-succeed', fmtPct(l.reliability))}</dd>
          <dt>Punta (cofia) ${termBtn('cofia', simText("station.what-is-the-fairing"))}</dt><dd>${l.fairing.diameterM} × ${l.fairing.heightM} m</dd>
          <dt>${simText("station.first-available-slot")}</dt><dd>${simText("station.in-0-months", l.availabilityMonths)}</dd>
        </dl>
        <div class="status ${e.compatible ? `status-${st.cls}` : 'status-red'}">${e.compatible ? simText("station.0-compatible-1-2", st.icon, st.text.toLowerCase(), e.marginPct) : simText("station.not-compatible-0", fails.join(', '))}</div>
        ${!playable && e.compatible ? `<p class="muted">${simText("station.this-combination-has-no-interactive-flight-model")}</p>` : ''}
        <button type="button" data-select="${esc(l.id)}" data-focus="rocket-${esc(l.id)}" aria-pressed="${e.launcherId === view.selected?.launcherId}" class="${e.compatible && playable ? 'primary' : ''}">${e.launcherId === view.selected?.launcherId ? simText("station.rocket-selected") : e.compatible && playable ? simText("station.choose-rocket") : simText("station.select-to-review")}</button>
      </div>`;
  }).join('') : `<p class="muted">${simText("station.no-rockets-at-this-difficulty-work-for-your")}</p>`;

  const ok = view.evaluations.filter((e) => e.compatible);
  const best = (key, pickMax) => (ok.length ? (pickMax ? Math.max(...ok.map(key)) : Math.min(...ok.map(key))) : null);
  const cell = (e, key, pickMax, text) => `<td class="${ok.length > 1 && key(e) === best(key, pickMax) ? 'best' : ''}">${text}</td>`;
  const table = ok.length ? `<table>
      <thead><tr><th>${simText("station.rocket")}</th><th>${simText("station.cost")}</th><th>${simText("station.remaining")}</th><th>${simText("station.margin")}</th><th>${simText("station.reliability")}</th><th>${simText("station.launch-in")}</th><th>${simText("station.spacecraft-service-life")}</th></tr></thead>
      <tbody>${ok.map((e) => `<tr>
        <td><span class="dot ${STATUS[e.marginStatus].cls}"></span>${esc(e.launcher.name)}</td>
        ${cell(e, (x) => x.totalCostMUSD, false, fmtMUSD(e.totalCostMUSD))}
        ${cell(e, (x) => x.budgetAfterMUSD, true, fmtMUSD(e.budgetAfterMUSD))}
        ${cell(e, (x) => x.marginPct, true, `${e.marginPct} %`)}
        ${cell(e, (x) => x.reliability, true, fmtPct(e.reliability))}
        ${cell(e, (x) => x.date.launchMonth, false, simText("station.month-0-1", e.date.launchMonth, e.date.delayMonths ? ` (+${e.date.delayMonths})` : ''))}
        ${cell(e, (x) => x.lifetimeYears, true, view.resolved.inputs.spacecraft.missionDays ? simText('flight.days-quantity', view.resolved.inputs.spacecraft.missionDays) : simText('flight.year-count', e.lifetimeYears))}
      </tr>`).join('')}</tbody></table>` : `<p class="status-red">${simText("station.no-options-are-compatible-yet-pick-a-rocket")}</p>`;

  return `
  <article class="card">
    <h2>Tu destino: ${esc(od.name)} ${termBtn('orbita-alta', simText("station.why-is-a-higher-orbit-more-expensive"))}</h2>
    <p>${esc(od.plain)} <span class="muted">Ejemplos: ${esc(od.examples)}</span></p>
    <p class="muted">${simText("station.how-much-change-in-speed-does-each-destination", termBtn('delta-v', simText("station.what-is-delta-v")))}</p>
    <div class="dv-bars">${data.orbits.map((o) => `
      <div class="dv-row ${o.id === orbit.type ? 'is-target' : ''}"><span>${o.id === orbit.type ? '▶ ' : ''}${esc(o.name)}</span><span class="bar"><i style="width:${(o.deltaVKmS / maxDv) * 100}%"></i></span><span>${o.deltaVKmS} km/s</span></div>`).join('')}
    </div>
  </article>
  <div class="catalog-toolbar">
    <h2>Elige tu cohete ${termBtn('carga-util', simText("station.what-is-payload-capacity"))}</h2>
    <label class="check-row"><input type="checkbox" id="only-compatible" data-focus="only-compatible" ${onlyCompatible ? 'checked' : ''}> ${simText("station.show-compatible-rockets-only")}</label>
  </div>
  <div class="catalog">${cards}</div>
  ${fields}
  <article class="card">
    <h2>Compara tus opciones ${termBtn('trade', simText("station.why-compare"))}</h2>
    <p class="muted">${simText("station.there-is-no-single-right-answer-each-rocket")}</p>
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
  return `<svg class="fairing-svg" viewBox="0 0 320 220" role="img" aria-label="Tu nave dentro de la punta del cohete: ${fits ? simText("station.fits") : simText("station.does-not-fit-2")}">
    <path d="M${cx - fw / 2},${base} L${cx - fw / 2},${base - fh + nose} Q${cx - fw / 2},${base - fh} ${cx},${base - fh} Q${cx + fw / 2},${base - fh} ${cx + fw / 2},${base - fh + nose} L${cx + fw / 2},${base} Z" fill="rgba(115,221,207,.08)" stroke="#73ddcf" stroke-dasharray="4 3"/>
    <rect x="${cx - sw / 2}" y="${base - sh}" width="${sw}" height="${sh}" fill="${fits ? 'rgba(79,209,139,.55)' : 'rgba(255,93,93,.6)'}" stroke="#eaf4ff"/>
    <line x1="10" y1="${base}" x2="310" y2="${base}" stroke="#2f4c63"/>
    <text x="8" y="16" fill="#9db6c4" font-size="11" font-family="monospace">${simText("station.rocket-fairing-0-1-m", f.diameterM, f.heightM)}</text>
    <text x="8" y="30" fill="${fits ? '#4fd18b' : '#ff7b7b'}" font-size="11" font-family="monospace">${fits ? '✔' : '✖'} Tu nave ${sc.diameterM}×${sc.heightM} m</text>
  </svg>`;
}

function renderCheck({ data, plan, view }, fields) {
  const e = view.selected;
  if (!e) return `<article class="card"><h2>${simText("station.flight-review")}</h2><p>${simText("station.choose-a-rocket-at-its-station-first")}</p>${fields}</article>`;
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
    <p>${simText("station.site")} <b>${esc(e.site.name)}</b> (${Math.abs(e.site.latitudeDeg)}° de latitud ${e.site.latitudeDeg < 0 ? simText("station.south") : simText("station.north")}, ${esc(e.site.country)}) ${termBtn('inclinacion', simText("station.why-does-the-site-matter"))}</p>
    <details><summary>${simText("station.learn-more-sources-for-this-rocket-s-figures")}</summary>
      <ul>${Object.entries(l.sources).map(([k, v]) => `<li><b>${esc(k)}</b> (${esc(l.dataQuality?.[k] ?? 'aproximada')}): ${esc(v)}</li>`).join('')}
      <li><b>availabilityMonths</b> ${simText("station.0-an-approximate-value-for-the-game", esc(l.dataQuality?.availabilityMonths ?? 'estimada'))}</li></ul>
    </details>
  </article>`;

  const mass = `
  <article class="card">
    <h2>${simText('station.margin-heading')} ${termBtn('margen', simText("station.what-is-payload-margin"))}</h2>
    ${e.baseCapacityKg == null || e.capacityKg <= 0
      ? `<p class="status-red">${simText("station.this-rocket-cannot-carry-a-payload-to-the", e.capacityKg <= 0 && e.baseCapacityKg != null ? simText("station.from-this-site") : '')}</p>`
      : `<div class="big-number status-${st.cls}"><span class="ico">${st.icon}</span> ${e.marginKg >= 0 ? '+' : '−'}${fmtKg(Math.abs(e.marginKg))} <small>(${e.marginPct} % · ${st.text.toLowerCase()})</small></div>
      <div class="gauge" style="--g:${greenEnd}%;--y:${yellowEnd}%"><span class="cap">${simText('station.capacity', fmtKg(e.capacityKg))}</span><div class="marker" style="left:calc(${Math.min(100, usage)}% - 1px)"><span>Tu nave ${fmtKg(e.launchMassKg)}${usage > 100 ? simText("station.over-capacity") : ''}</span></div></div>
      <p class="station-gauge-value">${simText("station.your-spacecraft")} <b>${fmtKg(e.launchMassKg)}</b>${usage > 100 ? simText("station.over-capacity-2") : ''}</p>
      <div class="gauge-legend"><span><span class="dot green"></span>${simText("station.0-or-more-comfortable", thresholds.greenPct)}</span><span><span class="dot yellow"></span>${simText("station.0-1-tight", thresholds.yellowPct, thresholds.greenPct)}</span><span><span class="dot red"></span>${simText("station.less-than-0-risky", thresholds.yellowPct)}</span></div>
      <p class="muted">${simText("station.spacecraft-often-gain-10-to-30-mass-during")}</p>`}
  </article>
  <article class="card"><h2>${simText('station.fairing-check')} ${termBtn('cofia', simText("station.what-is-the-fairing"))}</h2>${fairingSvg(e, sc)}</article>`;

  const checks = `
  <article class="card">
    <h2>${simText("station.flight-review")}</h2>
    <ul class="checks">${e.checks.map((c) => { const ci = CHECK_ICON[c.status]; return `
      <li class="${c.status}"><span class="icon status-${ci.cls}" title="${ci.word}"><span class="ico">${ci.icon}</span><small>${ci.word}</small></span>
        <div><b>${esc(c.label)}</b><p>${esc(c.detail)}</p>
        <details><summary>${simText("station.why-does-this-matter")}</summary><p>${esc(c.why)}</p>${c.more ? `<p class="more"><b>${simText("station.learn-more")}</b> ${esc(c.more)}</p>` : ''}${c.term ? `<button class="term" data-term="${c.term}" aria-label="${simText("station.more-information")}">?</button>` : ''}</details></div>
      </li>`; }).join('')}</ul>
  </article>`;

  const sug = suggestions.length ? `
  <article class="card suggestions">
    <h2>${e.compatible ? simText("station.ways-to-improve-this-option") : simText("station.this-rocket-does-not-work-yet-what-can")}</h2>
    <ul>${suggestions.map((s) => `<li><span class="role-chip">${esc(ROLES[s.role] ?? s.role)}</span>${esc(s.text)}</li>`).join('')}</ul>
    <p class="muted">${simText("station.several-options-may-work-each-trades-off-a")}</p>
  </article>` : '';

  const team = plan.teamMode ? `
  <article class="card team">
    <h2>${simText("station.team-review")}</h2>
    <p class="muted">${simText("station.this-choice-affects-other-roles-discuss-it-together")}</p>
    ${requests.length ? `<ul>${requests.map((r) => `<li><span class="role-chip">${esc(ROLES[r.toRole] ?? r.toRole)}</span>${esc(r.text)}</li>`).join('')}</ul>` : `<p>${simText("station.no-specific-requests-for-other-roles")}</p>`}
    <div class="acks">${roles.map((role) => `<label class="check-row"><input type="checkbox" data-ack="${role}" data-focus="ack-${role}" ${plan.acks?.[role] ? 'checked' : ''}> ${simText("station.sign-off-from")} <b>${esc(ROLES[role])}</b></label>`).join('')}</div>
    <textarea id="team-notes" maxlength="240" placeholder="${simText("station.discussion-notes-why-did-you-choose-this-rocket")}">${esc(plan.notes)}</textarea>
  </article>` : '';

  return `${header}<div class="grid-2">${mass}</div>${checks}${sug}${team}${fields}`;
}

function renderPayload({ view }, fields) {
  const sc = view.resolved.inputs.spacecraft;
  return `<div class="screen-grid">
    <article class="card hero">
      <span class="kicker">${simText("station.spacecraft-and-instruments")}</span><h2>${esc(sc.name)}</h2>
      <dl class="facts">
        <dt>${simText("station.folded-size-2")}</dt><dd>${simText('station.folded-dimensions', sc.diameterM, sc.heightM)}</dd>
        <dt>${simText("station.mass-with-fuel")}</dt><dd>${fmtKg(sc.massKg)}</dd>
        <dt>${simText("station.fuel")}</dt><dd>${simText('station.propellant-operating', fmtKg(sc.propellantKg), fmtKg(operationalPropellant(sc)))}</dd>
        <dt>${simText("station.reserve")}</dt><dd>${simText('station.propellant-reserved', fmtKg(sc.reservedPropellantKg ?? 0))}</dd>
        <dt>${simText(sc.missionDays ? 'flight.duration' : 'station.design-life')}</dt><dd>${sc.missionDays ? simText('flight.days-quantity', sc.missionDays) : simText('flight.year-count', sc.designLifetimeYears)}</dd>
        <dt>${simText(sc.return ? 'station.spacecraft-parts' : 'station.instruments')}</dt><dd>${sc.instruments.map(i => `${esc(i.name)} (${fmtKg(i.massKg)})`).join(', ') || '—'}</dd>
      </dl>
    </article>
    <article class="card"><h2>${simText("station.adjust-the-payload")}</h2>${fields}</article>
  </div>
  ${view.selected ? `<article class="card"><h2>${simText('station.fairing-check')} ${termBtn('cofia')}</h2>${fairingSvg(view.selected, sc)}</article>` : ''}`;
}

export function renderLaunchStation(part, context, fields) {
  return { mission: renderBriefing, payload: renderPayload, vehicle: renderCatalog, review: renderCheck }[part](context, fields);
}

export function rocketControlsSummary(view) {
  const e = view.selected;
  const { spacecraft: sc } = view.resolved.inputs;
  return `<p>${simText("station.remove")} <b>${fmtKg(e.offloadKg)}</b> ${simText("station.of-propellant-your-spacecraft-launches-at")} <b>${fmtKg(e.launchMassKg)}</b> ${simText("station.and-will-last-about")} <b class="${e.lifetimeYears < sc.designLifetimeYears ? 'status-yellow' : ''}">${simText('flight.year-count', e.lifetimeYears)}</b> ${simText("station.instead-of-0", sc.designLifetimeYears)}</p>
    <p class="muted">${simText("station.only-propellant-for-orbital-operations-can-be-removed", fmtKg(operationalPropellant(sc)))}</p>`;
}
