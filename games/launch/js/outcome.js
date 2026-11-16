import { simText } from "../../../src/i18n/catalog.js";
// Une el vuelo interactivo (flight.js) con las reglas del juego (rules.js).
//
//  - planFlightEvents(): decide, con la semilla, qué imprevistos habrá (clima, falsa alarma,
//    ráfaga de viento, motor que pierde fuerza, falla grave) ANTES de despegar.
//  - resolveFlight(): cuando termina el vuelo, traduce lo que pasó a resultado del juego
//    (éxito / éxito parcial / falla), órbita lograda, vida útil, costo y datos de vuelo.
//
// Funciones puras: se prueban con Node.

import { PHYS, DEST, DEG, windowErrorDeg, pilotScore, destDeltaV, circularSpeed, transferReached, wasDestroyed } from './flight.js';
import { createRng, getDifficulty, operationalPropellant, lifetimeAfterLoss, propellantForDeltaV, simulateLaunch } from './rules.js';
import { fmtKg, fmtMUSD } from './plain.js';

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Δv (m/s) de una transferencia Hohmann entre dos órbitas circulares. */
export function hohmannDv(r1, r2) {
  const a = (r1 + r2) / 2;
  const v1 = circularSpeed(r1); const v2 = circularSpeed(r2);
  const vt1 = Math.sqrt(PHYS.MU * (2 / r1 - 1 / a));
  const vt2 = Math.sqrt(PHYS.MU * (2 / r2 - 1 / a));
  return Math.abs(vt1 - v1) + Math.abs(v2 - vt2);
}

// En qué etapa y en qué punto de su quemada ocurre cada tipo de falla grave.
const FAIL_POINTS = {
  liftoff: { stage: 0, frac: 0.04, label: simText("flight.just-after-liftoff") },
  maxq: { stage: 0, frac: 0.3, label: simText("flight.at-maximum-dynamic-pressure-max-q") },
  staging: { stage: 0, frac: 0.96, label: simText("flight.during-first-stage-separation") },
  fairing: { stage: 1, frac: 0.15, label: simText("flight.during-fairing-separation") },
  insertion: { stage: 99, frac: 0.6, label: simText("flight.just-before-reaching-orbit") },
};

/**
 * @returns {{ pre:object[], flightEvents:object[], seed:number, eventsEnabled:boolean }}
 *   pre = eventos de la plataforma (se cobran antes de despegar);
 *   flightEvents = eventos para FlightSim (kind: gust | engineOut | fatal), con `meta` para el informe.
 */
export function planFlightEvents(evaluation, data, inputs, { seed = 1, eventsEnabled = true, stageCount = 2 } = {}) {
  const rng = createRng(seed);
  const rules = data.rules;
  const ev = rules.events;
  const diff = getDifficulty(rules, inputs.difficulty);
  const p = evaluation.probabilities;
  const randBetween = (min, max) => min + rng() * (max - min);
  const pre = [];
  const flightEvents = [];

  if (eventsEnabled) {
    if (p.weather != null && rng() < p.weather) {
      const days = Math.round(randBetween(ev.weather.minDays, ev.weather.maxDays));
      const cost = round(days * ev.weather.costMUSDPerDay, 2);
      pre.push({ id: 'weather', phase: 'countdown', label: ev.weather.label, consequence: simText("flight.bad-weather-at-0-delayed-the-launch-by", evaluation.site.name, days, fmtMUSD(cost)), explain: ev.weather.explain, costMUSD: cost, delayDays: days, severity: 'minor' });
    }
    if (p.minorAnomaly != null && rng() < p.minorAnomaly) {
      const a = ev.minorAnomaly;
      pre.push({ id: 'minorAnomaly', phase: 'countdown', label: a.label, consequence: simText("flight.the-rocket-was-inspected-adding-0-days-and", a.delayDays, fmtMUSD(a.costMUSD)), explain: a.explain, costMUSD: a.costMUSD, delayDays: a.delayDays, severity: 'minor' });
    }
    if (p.failure != null && rng() < p.failure) {
      if (rng() < (diff.partialFailureShare ?? 0)) {
        const stage = Math.min(stageCount - 1, Math.floor(rng() * stageCount));
        const mult = round(randBetween(0.5, 0.7), 2);
        flightEvents.push({ kind: 'engineOut', stage, frac: round(randBetween(0.15, 0.55), 2), thrustMult: mult,
          meta: { id: 'partialFailure', phase: stage === 0 ? 'liftoff' : 'insertion', label: ev.engineOut.label, severity: 'major', explain: ev.engineOut.explain } });
      } else {
        const keys = Object.keys(FAIL_POINTS);
        const phase = keys[Math.floor(rng() * keys.length)];
        const fp = FAIL_POINTS[phase];
        flightEvents.push({ kind: 'fatal', stage: Math.min(fp.stage, stageCount - 1), frac: fp.frac, text: simText("flight.rocket-failure-0-signal-lost", fp.label),
          meta: { id: 'failure', phase, label: ev.failure.label, severity: 'fatal', explain: ev.failure.explain, where: fp.label } });
      }
    }
    if (p.orbitOffset != null && rng() < p.orbitOffset) {
      const deg = round(randBetween(6, 10), 1) * (rng() < 0.5 ? -1 : 1);
      flightEvents.push({ kind: 'gust', atT: Math.round(randBetween(35, 70)), deg,
        meta: { id: 'orbitOffset', phase: 'maxq', label: ev.orbitOffset.label, severity: 'moderate', explain: ev.orbitOffset.explain } });
    }
  }
  return { pre, flightEvents, seed, eventsEnabled };
}

/** Costos y retrasos de los eventos de la plataforma. */
export function preLaunchTotals(plan) {
  return plan.pre.reduce((acc, e) => ({ costMUSD: acc.costMUSD + (e.costMUSD ?? 0), delayDays: acc.delayDays + (e.delayDays ?? 0) }), { costMUSD: 0, delayDays: 0 });
}

/**
 * Traduce un vuelo terminado al resultado del juego.
 * @param {object} args { sim, plan, evaluation, inputs, data, ref, autopilotUsed }
 */
export function resolveFlight({ sim, plan, evaluation, inputs, data, ref, autopilotUsed = false }) {
  const rules = data.rules;
  const sc = inputs.spacecraft;
  const destId = inputs.orbit.type;
  const d = DEST[destId];
  const el = sim.elements;
  const totals = preLaunchTotals(plan);
  const events = plan.pre.map((e) => ({ ...e }));
  const story = [];

  for (const fe of sim.events) {
    if (!fe.done || !fe.meta) continue;
    const m = fe.meta;
    let consequence;
    if (fe.kind === 'gust') consequence = simText("flight.a-gust-pushed-the-rocket-0-1-you", Math.abs(fe.deg), fe.deg > 0 ? simText("flight.to-the-right") : simText("flight.to-the-left"));
    else if (fe.kind === 'engineOut') consequence = simText("flight.a-stage-0-engine-delivered-only-1-thrust", fe.stage + 1, Math.round(fe.thrustMult * 100));
    else consequence = simText("flight.the-rocket-failed-0-and-the-spacecraft-was", m.where);
    events.push({ id: m.id, phase: m.phase, label: m.label, consequence, explain: m.explain, severity: m.severity });
  }

  const apoKm = el.hyper ? Infinity : el.apoAlt / 1000;
  const periKm = el.periAlt / 1000;
  const parts = pilotScore(sim, ref ?? { fuelLeftPct: 5 });
  const stagingTimes = sim.stats.stagingTimes.map((s) => ({ stage: s.stage, tSeconds: round(s.t / PHYS.COMPRESSION, 0), altitudeKm: s.altitudeKm, fuelLeftPct: s.fuelLeftPct }));

  const base = {
    events, seed: plan.seed, eventsEnabled: plan.eventsEnabled,
    extraCostMUSD: round(totals.costMUSD, 2), delayDays: totals.delayDays,
    plannedLifetimeYears: evaluation.lifetimeYears,
    flightData: {
      maxAltitudeKm: Math.round(sim.stats.maxAlt / 1000),
      apoapsisKm: Number.isFinite(apoKm) ? Math.round(apoKm) : null,
      periapsisKm: Math.round(periKm),
      fuelLeftPct: round(sim.fuelLeftPct, 1),
      stagingTimes,
      maxQKPa: round(sim.stats.maxQ / 1000, 1),
      durationSeconds: Math.round(sim.t / PHYS.COMPRESSION),
      pilotScore: parts.total,
      pilotScoreParts: parts.parts.map((p) => ({ id: p.id, points: p.points, max: p.max })),
      autopilot: autopilotUsed,
    },
    pilot: parts,
  };

  const lunar = sim.profile === 'lunarReturn';
  if (lunar) base.flightData.lunar = lunarFlightData(sim);
  const destroyed = wasDestroyed(sim);
  if (destroyed) {
    const afterEntry = lunar && sim.mission.entry;
    const reasons = {
      'crash-moon': () => ({ id: 'crash', phase: 'insertion', label: simText("lunarFlight.the-spacecraft-struck-the-moon"), consequence: simText("lunarFlight.the-trajectory-dipped-below-the-lunar-surface"), explain: simText("lunarFlight.pass-above-the-lunar-terrain-and-brake-near"), severity: 'fatal' }),
      burn: () => ({ id: 'reentry', phase: 'insertion', label: simText("lunarFlight.the-spacecraft-burned-up-during-reentry-2"), consequence: sim.capsuleOnly ? simText("lunarFlight.the-heat-shield-was-consumed-after-a-shallow") : simText("lunarFlight.the-spacecraft-entered-with-the-service-module-still"), explain: simText("lunarFlight.a-capsule-returning-from-the-moon-can-enter"), severity: 'fatal' }),
      gforce: () => ({ id: 'reentry', phase: 'insertion', label: simText("lunarFlight.the-capsule-entered-too-steeply"), consequence: simText("lunarFlight.deceleration-exceeded-0-g-beyond-what-the-capsule", Math.round(sim.craft?.gBreak ?? 20)), explain: simText("lunarFlight.a-steep-entry-causes-abrupt-deceleration-in-dense"), severity: 'fatal' }),
      failure: () => null, // ya está en los eventos
      maxq: () => ({ id: 'structural', phase: 'maxq', label: simText("lunarFlight.the-rocket-broke-apart-under-dynamic-pressure-max"), consequence: simText("lunarFlight.dynamic-pressure-exceeded-the-structural-limit"), explain: simText("lunarFlight.about-a-minute-into-flight-the-air-is"), severity: 'fatal' }),
      aoa: () => ({ id: 'structural', phase: 'maxq', label: simText("lunarFlight.the-rocket-broke-apart-while-turning"), consequence: simText("lunarFlight.the-rocket-turned-too-fast-in-dense-air"), explain: simText("lunarFlight.in-dense-air-stay-close-to-vertical-tilt"), severity: 'fatal' }),
      crash: () => (afterEntry
        ? { id: 'crash', phase: 'insertion', label: simText("lunarFlight.the-capsule-reached-the-surface-too-fast"), consequence: sim.chute?.torn ? simText("lunarFlight.the-parachutes-deployed-at-excessive-speed-and-tore") : sim.chute ? simText("lunarFlight.the-parachutes-deployed-too-late-to-slow-the") : simText("lunarFlight.the-parachutes-did-not-open"), explain: simText("lunarFlight.air-slows-the-capsule-to-about-100-m"), severity: 'fatal' }
        : { id: 'crash', phase: 'insertion', label: simText("lunarFlight.the-rocket-fell-back-to-earth"), consequence: simText("lunarFlight.it-did-not-build-enough-sideways-speed-to"), explain: simText("lunarFlight.getting-to-orbit-takes-more-than-altitude-you"), severity: 'fatal' }),
    };
    const extra = reasons[sim.endReason]?.();
    if (extra) events.push(extra);
    story.push(sim.log.at(-1)?.text ?? simText("lunarFlight.the-rocket-was-lost"));
    return { ...base, result: 'falla', headline: lunar && sim.mission.leo ? simText("lunarFlight.the-spacecraft-was-lost") : simText("lunarFlight.the-rocket-was-lost-2"), achievedOrbit: lunar ? lunarAchieved(sim) : null, lifetimeYears: 0, story, failureKind: sim.endReason };
  }
  if (lunar && sim.mission.leo) return resolveLunar({ sim, base, events, story, sc });

  // --- el cohete sobrevivió: ¿llegó a la órbita?
  const parkingOk = el.periAlt >= PHYS.PERI_OK;
  if (!parkingOk) {
    events.push({ id: 'noOrbit', phase: 'insertion', label: simText("flight.you-did-not-reach-orbit"), consequence: periKm < 0 ? simText("flight.your-lowest-point-was-0-km-underground-so", Math.abs(Math.round(periKm)).toLocaleString('es')) : simText("flight.your-lowest-point-was-0-km-still-inside", Math.round(periKm)),
      explain: simText("flight.for-a-stable-orbit-the-lowest-point-periapsis"), severity: 'fatal' });
    story.push(periKm < 0 ? simText("flight.your-lowest-point-was-0-km-underground-the", Math.abs(Math.round(periKm)).toLocaleString('es')) : simText("flight.your-lowest-point-was-0-km-inside-the", Math.round(periKm)));
    return { ...base, result: 'falla', headline: simText("flight.you-did-not-reach-orbit"), achievedOrbit: null, lifetimeYears: 0, story, failureKind: 'no-orbit' };
  }

  const targetKm = (evaluation.fixedOrbit?.altitudeKm ?? inputs.orbit.altitudeKm ?? sim.targetAltKm) ?? 400;
  const incl = evaluation.fixedOrbit?.inclinationDeg ?? inputs.orbit.inclinationDeg ?? null;
  const launchMass = evaluation.launchMassKg;
  const ops = operationalPropellant(sc);
  const hasEngine = ops > 0 && sc.ispS;
  let lostPropKg = evaluation.offloadKg + evaluation.gtoExtraPropKg;
  let extraLossPct = 0;
  let achieved;
  let headline;
  let reachedWithCorrection = false;
  let transferCorrected = false;
  let transferCorrectionCovered = true;

  if (d.kind === 'transfer') {
    const reached = transferReached(destId, el);
    const win = windowErrorDeg(sim);
    const winOk = win == null || win <= d.windowTolDeg; // sin encendido propio (la ascensión ya alcanzó la energía) no hay ventana que fallar
    if (reached && winOk) {
      achieved = { type: destId, altitudeKm: null, inclinationDeg: incl, note: simText("flight.you-timed-the-transfer-burn-correctly-0", d.label) };
      headline = simText("flight.transfer-burn-on-target");
      story.push(simText("flight.you-ignited-only-0-from-the-ideal-point", Math.round(win), d.label));
    } else if (reached) {
      const dvFix = 350;
      const kg = hasEngine ? propellantForDeltaV(launchMass, dvFix, sc.ispS, rules.physics.g0) : 0;
      transferCorrected = true;
      transferCorrectionCovered = Boolean(hasEngine && kg <= Math.max(0, ops - lostPropKg));
      if (hasEngine) lostPropKg += kg; else extraLossPct += 30;
      achieved = { type: destId, altitudeKm: null, inclinationDeg: incl, note: simText("flight.you-had-enough-thrust-but-ignited-0-off", Math.round(win ?? 0)) };
      headline = simText("flight.you-ignited-outside-the-transfer-window");
      story.push(simText("flight.you-ignited-0-away-from-the-ideal-point", Math.round(win ?? 0), dvFix, fmtKg(kg)));
      events.push({ id: 'missedWindow', phase: 'insertion', label: simText("flight.ignition-outside-the-transfer-window"), consequence: simText("flight.the-spacecraft-needs-0-of-its-own-fuel", fmtKg(kg)), explain: simText("flight.the-best-point-to-leave-orbit-depends-on"), severity: 'moderate' });
    } else {
      // se quedó en la órbita de espera: la nave debe hacer el resto con su motor
      const dvRest = destDeltaV(destId, el.r);
      const kg = hasEngine ? propellantForDeltaV(launchMass, dvRest, sc.ispS, rules.physics.g0) : Infinity;
      if (!hasEngine || kg > ops) {
        events.push({ id: 'noTransfer', phase: 'insertion', label: simText("flight.transfer-not-achieved"), consequence: simText("flight.the-spacecraft-remained-in-low-earth-orbit-without"), explain: simText("flight.reaching-the-moon-or-another-planet-takes-a"), severity: 'fatal' });
        story.push(simText("flight.you-stayed-in-the-parking-orbit-and-the"));
        return { ...base, result: 'falla', headline: simText("flight.you-did-not-leave-low-earth-orbit"), achievedOrbit: { type: 'LEO', altitudeKm: Math.round((periKm + (Number.isFinite(apoKm) ? apoKm : periKm)) / 2), inclinationDeg: incl, note: simText("flight.parking-orbit") }, lifetimeYears: 0, story, failureKind: 'no-transfer' };
      }
      lostPropKg += kg;
      achieved = { type: 'LEO', altitudeKm: Math.round((periKm + (Number.isFinite(apoKm) ? apoKm : periKm)) / 2), inclinationDeg: incl, note: simText("flight.the-rocket-stayed-in-the-parking-orbit-the") };
      headline = simText("flight.you-stayed-in-the-parking-orbit");
      story.push(simText("flight.you-did-not-complete-the-transfer-the-spacecraft", fmtKg(kg)));
      events.push({ id: 'partialTransfer', phase: 'insertion', label: simText("flight.incomplete-transfer"), consequence: simText("flight.the-spacecraft-uses-0-of-propellant-to-reach", fmtKg(kg)), explain: simText("flight.every-kilogram-used-to-reach-the-target-is"), severity: 'major' });
    }
  } else {
    const meanKm = (periKm + apoKm) / 2;
    const ra = PHYS.RE + apoKm * 1000;
    const r2 = PHYS.RE + targetKm * 1000;
    // 1) redondear la órbita en su punto más alto; 2) subir o bajar hasta la altura pedida.
    const aEll = (ra + PHYS.RE + periKm * 1000) / 2;
    const dvRound = Math.abs(circularSpeed(ra) - Math.sqrt(PHYS.MU * (2 / ra - 1 / aEll)));
    const dvFix = dvRound + (Math.abs(r2 - ra) < 8000 ? 0 : hohmannDv(ra, r2));
    let kg = 0;
    if (dvFix > 15) {
      if (hasEngine) { kg = propellantForDeltaV(launchMass, dvFix, sc.ispS, rules.physics.g0); lostPropKg += kg; }
      else extraLossPct += clamp(dvFix / 8, 0, 40);
    }
    achieved = { type: destId, altitudeKm: Math.round(meanKm), periapsisKm: Math.round(periKm), apoapsisKm: Math.round(apoKm), inclinationDeg: incl,
      note: dvFix > 15
        ? (hasEngine ? simText("flight.you-reached-a-0-1-km-orbit-the", Math.round(periKm), Math.round(apoKm), fmtKg(kg)) : simText("flight.you-reached-a-0-1-km-orbit-and", Math.round(periKm), Math.round(apoKm)))
        : simText("flight.you-reached-your-target-orbit-0-1-km", Math.round(periKm), Math.round(apoKm)) };
    reachedWithCorrection = dvFix > 15;
    headline = dvFix > 15 ? simText("flight.you-reached-an-orbit-slightly-off-target") : simText("flight.nearly-perfect-orbit");
    story.push(simText("flight.you-reached-0-km-at-the-lowest-point", Math.round(periKm), Math.round(apoKm), targetKm));
    if (dvFix > 15 && hasEngine) story.push(simText("flight.correcting-it-costs-roughly-0-m-s-or", Math.round(dvFix), fmtKg(kg)));
    if (dvFix > 15 && !hasEngine) story.push(simText("flight.without-an-engine-the-spacecraft-stays-in-that"));
  }

  let lifetime = lifetimeAfterLoss(sc, lostPropKg) * (1 - extraLossPct / 100);
  lifetime = round(lifetime, 1);
  const planned = evaluation.lifetimeYears;
  const lossPct = planned > 0 ? ((planned - lifetime) / planned) * 100 : 0;
  const partialEvent = events.some((e) => e.id === 'partialFailure');
  const result = lossPct >= rules.outcome.partialIfLifetimeLossPct || partialEvent && lossPct > 5 ? 'exito_parcial' : 'exito';
  if (partialEvent) story.push(simText("flight.the-engine-that-lost-power-made-the-rocket"));
  if (result === 'exito_parcial' && lossPct >= rules.outcome.partialIfLifetimeLossPct) story.push(simText("flight.the-spacecraft-will-last-0-years-instead-of", lifetime, planned, Math.round(lossPct)));
  return { ...base, result, headline: result === 'exito' && reachedWithCorrection ? simText("flight.you-reached-orbit") : headline, achievedOrbit: achieved, transferCorrected, transferCorrectionCovered, lifetimeYears: lifetime, story, lossPct: round(lossPct, 0) };
}

// ---------------------------------------------------------------------------
// Misión lunar de ida y vuelta
// ---------------------------------------------------------------------------

const lunarAchieved = (sim) => {
  const o = sim.mission?.bestOrbit;
  return o ? { type: 'LUNA', periapsisKm: Math.round(o.periKm), apoapsisKm: Math.round(o.apoKm), altitudeKm: Math.round((o.periKm + o.apoKm) / 2), inclinationDeg: null, note: simText("lunarFlight.orbit-around-the-moon-2") } : null;
};

/** Datos del viaje para el informe y para el siguiente equipo. */
export function lunarFlightData(sim) {
  const m = sim.mission; const st = sim.stats;
  return {
    days: round(sim.t / 86400, 1),
    reached: ['leo', 'tli', 'soi', 'lunarOrbit', 'tei', 'left', 'entry', 'landed'].filter((k) => m[k]),
    lunarOrbitKm: m.bestOrbit ? { periapsis: Math.round(m.bestOrbit.periKm), apoapsis: Math.round(m.bestOrbit.apoKm) } : null,
    lunarRevs: round(m.lunarRevs, 1),
    closestToMoonKm: Number.isFinite(m.minMoonAlt) ? Math.round(m.minMoonAlt / 1000) : null,
    entrySpeedKmS: st.entrySpeed != null ? round(st.entrySpeed / 1000, 1) : null,
    entryAngleDeg: st.entryAngleDeg != null ? round(st.entryAngleDeg, 1) : null,
    maxG: round(st.maxG ?? 0, 1),
    peakHeatWcm2: Math.round((st.maxHeat ?? 0) / 1e4),
    shieldLeftPct: Math.round(sim.heat.shieldLeft * 100),
    chuteSpeedMs: st.chuteSpeed != null ? Math.round(st.chuteSpeed) : null,
    landingSpeedMs: sim.landing ? round(sim.landing.speed, 1) : null,
  };
}

/** Resultado de una misión lunar que no terminó destruida. */
function resolveLunar({ sim, base, events, story, sc }) {
  const m = sim.mission; const st = sim.stats;
  const achievedOrbit = lunarAchieved(sim);
  const km = (v) => Math.round(v).toLocaleString('es');
  story.push(simText("lunarFlight.the-journey-lasted-0-days", base.flightData.lunar.days.toLocaleString('es')));
  if (m.bestOrbit) story.push(simText("lunarFlight.you-reached-a-0-1-km-lunar-orbit-2", km(m.bestOrbit.periKm), km(m.bestOrbit.apoKm), m.lunarRevs.toLocaleString('es', { maximumFractionDigits: 1 })));
  else if (m.soi) story.push(simText("lunarFlight.you-passed-within-0-km-of-the-moon-2", km(m.minMoonAlt / 1000)));
  if (sim.landing) {
    const gLim = sim.craft?.gLimit ?? 9;
    story.push(simText("lunarFlight.the-capsule-entered-at-0-km-s-peaked", (st.entrySpeed / 1000).toLocaleString('es', { maximumFractionDigits: 1 }), st.maxG.toLocaleString('es', { maximumFractionDigits: 1 }), Math.round((1 - sim.heat.shieldLeft) * 100), sim.landing.speed.toLocaleString('es', { maximumFractionDigits: 1 })));
    const rough = st.maxG > gLim + 4;
    if (st.maxG > gLim) events.push({ id: 'highG', phase: 'insertion', label: simText("lunarFlight.rough-reentry"), consequence: simText("lunarFlight.the-crew-experienced-0-g-the-target-is", st.maxG.toFixed(1), gLim), explain: simText("lunarFlight.a-steep-entry-causes-sudden-deceleration-a-course"), severity: rough ? 'major' : 'moderate' });
    if (m.lunarOrbit && !rough) return { ...base, result: 'exito', headline: simText("lunarFlight.mission-accomplished-you-reached-the-moon-and-returned"), achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    if (m.lunarOrbit) return { ...base, result: 'exito_parcial', headline: simText("lunarFlight.you-made-it-to-the-moon-and-back"), achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    if (m.soi) {
      events.push({ id: 'flyby', phase: 'insertion', label: simText("lunarFlight.lunar-flyby-without-orbit-insertion"), consequence: simText("lunarFlight.the-spacecraft-passed-around-the-moon-and-returned"), explain: simText("lunarFlight.brake-at-closest-approach-to-enter-lunar-orbit"), severity: 'major' });
      return { ...base, result: 'exito_parcial', headline: simText("lunarFlight.you-flew-around-the-moon-and-returned-safely"), achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    }
    events.push({ id: 'noMoon', phase: 'insertion', label: simText("lunarFlight.the-spacecraft-did-not-reach-the-moon"), consequence: simText("lunarFlight.the-capsule-returned-safely-from-earth-orbit"), explain: simText("lunarFlight.reaching-the-moon-requires-a-sustained-translunar-burn"), severity: 'major' });
    return { ...base, result: 'exito_parcial', headline: simText("lunarFlight.the-capsule-returned-safely-but-did-not-reach"), achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
  }
  // el vuelo terminó con la nave todavía en el espacio
  const where = sim.body === 'moon' ? (m.lunarOrbit ? simText("lunarFlight.in-orbit-around-the-moon") : simText("lunarFlight.near-the-moon")) : m.left ? simText("lunarFlight.on-its-way-home") : m.tli ? simText("lunarFlight.on-its-way-to-the-moon") : simText("lunarFlight.in-orbit-around-earth");
  events.push({ id: 'notBack', phase: 'insertion', label: simText("lunarFlight.the-spacecraft-did-not-return-to-earth"), consequence: simText("lunarFlight.the-flight-ended-with-the-spacecraft-0", where), explain: simText("lunarFlight.a-crewed-mission-is-not-over-until-the"), severity: m.tli ? 'fatal' : 'major' });
  story.push(simText("lunarFlight.the-flight-ended-with-the-spacecraft-0", where));
  if (!m.tli) return { ...base, result: 'exito_parcial', headline: simText("lunarFlight.you-stayed-in-earth-orbit"), achievedOrbit: { type: 'LEO', altitudeKm: Math.round((m.parking.periKm + m.parking.apoKm) / 2), inclinationDeg: null, note: simText("lunarFlight.parking-orbit-2") }, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
  return { ...base, result: 'falla', headline: simText("lunarFlight.the-spacecraft-did-not-make-it-home"), achievedOrbit, lifetimeYears: 0, story, failureKind: 'not-back' };
}

/** Cuando un par cohete-destino no tiene vuelo calibrado, el resultado se calcula con las reglas del catálogo. */
export function resolveAutomatic(evaluation, data, inputs, { seed = 1, eventsEnabled = true } = {}) {
  const r = simulateLaunch(evaluation, data, inputs, { seed, eventsEnabled });
  return {
    ...r,
    headline: r.result === 'exito' ? simText("flight.you-reached-orbit") : r.result === 'exito_parcial' ? simText("flight.you-made-it-but-not-everything-went-to") : simText("flight.the-rocket-was-lost-2"),
    story: r.events.map((e) => e.consequence),
    flightData: null,
    pilot: null,
    automatic: true,
  };
}
