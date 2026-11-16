import { simText } from "../../../src/i18n/catalog.js";
// Motor de reglas del módulo LAUNCH.
// Funciones puras: no tocan el DOM ni el almacenamiento, así se pueden probar con
// `node --test` y reutilizar desde otros módulos. Ninguna cifra de juego está escrita
// aquí: todo sale de los archivos de data/ (launchers, sites, orbits, rules).

import { fmtKg, fmtMUSD, fmtPct, speedLike, costLike, oneInN, outOfHundred, usesPart } from './plain.js';
export { fmtKg, fmtMUSD, fmtPct };

export const ORBIT_ORDER = ['LEO', 'SSO', 'GTO', 'TLI', 'ESCAPE'];
export const FLIGHT_PHASES = [
  { id: 'countdown', get label() { return simText("flight.countdown"); }, t: -10 },
  { id: 'liftoff', get label() { return simText("flight.liftoff"); }, t: 0 },
  { id: 'maxq', get label() { return simText("flight.maximum-dynamic-pressure-max-q"); }, t: 70 },
  { id: 'staging', get label() { return simText("flight.stage-separation"); }, t: 160 },
  { id: 'fairing', get label() { return simText("flight.fairing-separation"); }, t: 210 },
  { id: 'insertion', get label() { return simText("flight.orbital-insertion"); }, t: 520 },
  { id: 'deploy', get label() { return simText("flight.spacecraft-deployment"); }, t: 600 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// Generador pseudoaleatorio con semilla (mulberry32). La misma semilla repite el mismo
// lanzamiento: útil para que un equipo revise lo que pasó o para corregir en clase.
export function createRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDifficulty(rules, level) {
  return rules.difficulty[level] ?? rules.difficulty.normal;
}

export function launchersForDifficulty(data, level) {
  const allowed = getDifficulty(data.rules, level).launchers;
  return data.launchers.filter((launcher) => allowed.includes(launcher.id));
}

// ---------------------------------------------------------------------------
// Física simplificada
// ---------------------------------------------------------------------------

// Ecuación del cohete: combustible que gasta una nave de masa m0 (kg) para cambiar su
// velocidad en dvMs (m/s) con un motor de impulso específico ispS (s).
export function propellantForDeltaV(m0Kg, dvMs, ispS, g0 = 9.80665) {
  if (!ispS || dvMs <= 0) return 0;
  return m0Kg * (1 - Math.exp(-dvMs / (ispS * g0)));
}

// Δv para cambiar el plano de una órbita circular en Δi grados: Δv = 2·v·sin(Δi/2).
export function planeChangeDeltaV(deltaIncDeg, orbitalSpeedKmS) {
  return 2 * orbitalSpeedKmS * Math.sin((Math.abs(deltaIncDeg) * Math.PI) / 360);
}

// Δv que necesita la nave para pasar de GTO a GEO, combinando el aumento de velocidad
// en el apogeo con el giro de plano desde la inclinación de lanzamiento (ley de cosenos).
export function gtoToGeoDeltaV(inclinationDeg, physics) {
  const va = physics.gtoApogeeSpeedKmS;
  const vg = physics.geoSpeedKmS;
  const i = (Math.abs(inclinationDeg) * Math.PI) / 180;
  return Math.sqrt(va * va + vg * vg - 2 * va * vg * Math.cos(i));
}

// Combustible "de operación": el que no hace falta para llegar a la órbita final y que,
// en este modelo simplificado, es proporcional a los años de vida útil.
export function operationalPropellant(spacecraft) {
  return Math.max(0, (spacecraft.propellantKg ?? 0) - (spacecraft.reservedPropellantKg ?? 0));
}

// Vida útil que queda si la nave pierde lostKg de combustible de operación.
export function lifetimeAfterLoss(spacecraft, lostKg) {
  const ops = operationalPropellant(spacecraft);
  const design = spacecraft.designLifetimeYears ?? 0;
  if (ops <= 0) return design;
  return design * clamp((ops - lostKg) / ops, 0, 1);
}

// ---------------------------------------------------------------------------
// Costo, calendario y sitio
// ---------------------------------------------------------------------------

export function launchCostMUSD(launcher, massKg) {
  if (launcher.pricing === 'por-kg') {
    return round(Math.max(launcher.minCostMUSD ?? 0, (massKg * launcher.costPerKgUSD) / 1e6), 2);
  }
  return launcher.costMUSD;
}

// Mes de lanzamiento: el primer cupo del lanzador, y si el destino tiene ventanas
// (Marte cada ~26 meses), la primera ventana posterior a ese cupo.
export function planLaunchDate({ launcher, orbitDef, schedule, diff }) {
  const available = launcher.availabilityMonths;
  let launchMonth = available;
  let waitedForWindow = false;
  const window = orbitDef?.window;
  if (diff.launchWindows && window && window.everyMonths > 1) {
    let next = schedule.nextWindowMonths ?? 0;
    while (next < available) next += window.everyMonths;
    waitedForWindow = next > available;
    launchMonth = next;
  }
  const delayMonths = Math.max(0, launchMonth - (schedule.monthsToTargetDate ?? launchMonth));
  return {
    availableMonth: available,
    launchMonth,
    waitedForWindow,
    delayMonths,
    delayCostMUSD: round(delayMonths * (diff.delayCostMUSDPerMonth ?? 0), 2),
  };
}

// Capacidad efectiva desde un sitio: si la inclinación pedida es menor que la latitud
// del sitio, la etapa superior tiene que "girar" la órbita y pierde capacidad según la
// ecuación del cohete (factor = e^(-Δv/ve)).
export function siteCapacity({ launcher, site, orbitDef, target, diff, physics }) {
  const base = launcher.capacityKg[orbitDef.id];
  const result = { baseCapacityKg: base, capacityKg: base, factor: 1, planeChangeDeg: 0, planeChangeDvKmS: 0, inclinationBlocked: false };
  if (base == null) return result;
  const usesInclination = diff.inclinationRules && orbitDef.needsInclination && target.inclinationDeg != null && launcher.pricing !== 'por-kg';
  if (!usesInclination) return result;
  const [minInc, maxInc] = site.inclinationRangeDeg;
  if (target.inclinationDeg > maxInc) {
    result.inclinationBlocked = true;
    result.capacityKg = 0;
    return result;
  }
  if (target.inclinationDeg < minInc) {
    result.planeChangeDeg = round(minInc - target.inclinationDeg, 1);
    result.planeChangeDvKmS = round(planeChangeDeltaV(result.planeChangeDeg, physics.leoOrbitalSpeedKmS), 2);
    result.factor = Math.exp(-result.planeChangeDvKmS / physics.upperStageExhaustKmS);
    result.capacityKg = Math.floor(base * result.factor);
  }
  return result;
}

// Elige el mejor sitio del lanzador para este objetivo: el de más capacidad efectiva y,
// a igualdad, el de menos riesgo de clima.
export function bestSiteId({ launcher, sites, orbitDef, target, diff, physics }) {
  const candidates = launcher.sites.map((id) => sites.find((s) => s.id === id)).filter(Boolean);
  candidates.sort((a, b) => {
    const ca = siteCapacity({ launcher, site: a, orbitDef, target, diff, physics });
    const cb = siteCapacity({ launcher, site: b, orbitDef, target, diff, physics });
    const cap = (cb.capacityKg ?? -1) - (ca.capacityKg ?? -1);
    if (cap !== 0) return cap;
    if (orbitDef.id === 'GTO') return Math.abs(a.latitudeDeg) - Math.abs(b.latitudeDeg);
    return a.weatherRisk - b.weatherRisk;
  });
  return candidates[0]?.id;
}

export function marginStatus(marginPct, thresholds) {
  if (marginPct < 0) return 'blocked';
  if (marginPct < thresholds.yellowPct) return 'red';
  if (marginPct < thresholds.greenPct) return 'yellow';
  return 'green';
}

// ---------------------------------------------------------------------------
// Evaluación completa de un lanzador para la misión actual
// ---------------------------------------------------------------------------

/**
 * @param {object} launcher  entrada de launchers.json
 * @param {object} data      { launchers, sites, orbits, rules }
 * @param {object} inputs    entradas del módulo (ver state.js)
 * @param {object} [options] { siteId, propellantOffloadKg }
 */
export function evaluateLauncher(launcher, data, inputs, options = {}) {
  const { rules } = data;
  const diff = getDifficulty(rules, inputs.difficulty);
  const physics = rules.physics;
  const thresholds = rules.massMargin[inputs.difficulty] ?? rules.massMargin.normal;
  const sc = inputs.spacecraft;
  const target = inputs.orbit;
  const orbitDef = data.orbits.find((o) => o.id === target.type);

  const siteId = diff.siteChoice && options.siteId && launcher.sites.includes(options.siteId)
    ? options.siteId
    : bestSiteId({ launcher, sites: data.sites, orbitDef, target, diff, physics });
  const site = data.sites.find((s) => s.id === siteId);

  const opsProp = operationalPropellant(sc);
  const offloadKg = diff.propellantOffload ? clamp(options.propellantOffloadKg ?? 0, 0, opsProp) : 0;
  const launchMassKg = sc.massKg - offloadKg;

  const cap = siteCapacity({ launcher, site, orbitDef, target, diff, physics });
  const capacityKg = cap.capacityKg ?? 0;
  const marginKg = capacityKg - launchMassKg;
  const marginPct = capacityKg > 0 ? (marginKg / capacityKg) * 100 : -100;
  const mStatus = cap.baseCapacityKg == null || cap.inclinationBlocked ? 'blocked' : marginStatus(marginPct, thresholds);

  const launchCost = launchCostMUSD(launcher, launchMassKg);
  const date = planLaunchDate({ launcher, orbitDef, schedule: inputs.schedule, diff });
  const totalCost = round(launchCost + date.delayCostMUSD, 2);
  const available = round(inputs.budget.totalMUSD - inputs.budget.committedMUSD, 2);
  const budgetAfter = round(available - totalCost, 2);

  // Empujón extra que paga la nave para llegar a GEO si se lanza lejos del ecuador.
  let gtoExtraDvMs = 0;
  let gtoExtraPropKg = 0;
  if (orbitDef.id === 'GTO' && diff.gtoLatitudePenalty) {
    const dvSite = gtoToGeoDeltaV(Math.abs(site.latitudeDeg), physics);
    const dvEquator = gtoToGeoDeltaV(0, physics);
    gtoExtraDvMs = Math.round((dvSite - dvEquator) * 1000);
    const massAfterRaise = launchMassKg - (sc.reservedPropellantKg ?? 0);
    gtoExtraPropKg = round(propellantForDeltaV(Math.max(massAfterRaise, 1), gtoExtraDvMs, sc.ispS, physics.g0), 0);
  }
  const lifetimeYears = round(lifetimeAfterLoss(sc, offloadKg + gtoExtraPropKg), 1);

  const fixedOrbit = launcher.fixedOrbit?.[target.type] ?? null;
  const checks = [];
  const place = orbitDef.short ?? orbitDef.name;

  // 1. ¿Llega a ese destino?
  checks.push(cap.baseCapacityKg == null
    ? { id: 'orbit', status: 'fail', label: simText("flight.destination"),
      detail: simText("flight.0-cannot-reach-1-it-needs-more-energy", launcher.name, place),
      why: simText("flight.distant-targets-require-more-change-in-speed-and"),
      more: simText("flight.approximate-speed-change-budget-delta-v-from-earth", orbitDef.deltaVKmS), term: 'orbita-alta' }
    : { id: 'orbit', status: 'ok', label: simText("flight.destination"),
      detail: simText("flight.reaches-payload", place, fmtKg(cap.baseCapacityKg)),
      why: simText("flight.reaching-this-destination-takes-about-0-km-s", orbitDef.deltaVKmS, speedLike(7.8)),
      more: simText("flight.approximate-delta-v-from-earth-including-gravity-and", orbitDef.deltaVKmS, launcher.sources?.capacityKg ?? simText("flight.see-data-launchers-json")), term: 'delta-v' });

  // 2. Inclinación y sitio (o la órbita fija de un viaje compartido).
  if (fixedOrbit) {
    const dInc = target.inclinationDeg != null ? Math.abs(fixedOrbit.inclinationDeg - target.inclinationDeg) : 0;
    const dAlt = target.altitudeKm != null ? Math.abs(fixedOrbit.altitudeKm - target.altitudeKm) : 0;
    const off = diff.inclinationRules && (dInc > 5 || dAlt > 100);
    checks.push({ id: 'inclination', status: off ? 'warn' : 'ok', label: simText("flight.exact-orbit"),
      detail: off
        ? simText("flight.a-rideshare-drops-you-into-the-primary-mission", fixedOrbit.altitudeKm, fixedOrbit.inclinationDeg, target.altitudeKm ?? '—', target.inclinationDeg ?? '—')
        : simText("flight.the-primary-mission-s-rocket-puts-you-into", fixedOrbit.altitudeKm, fixedOrbit.inclinationDeg),
      why: simText("flight.a-rideshare-does-not-offer-a-choice-of"), term: 'rideshare' });
  } else if (diff.inclinationRules && orbitDef.needsInclination && target.inclinationDeg != null) {
    if (cap.inclinationBlocked) {
      checks.push({ id: 'inclination', status: 'fail', label: simText("flight.orbital-inclination-2"),
        detail: simText("flight.you-cannot-launch-from-0-into-a-1-2", site.name, target.inclinationDeg),
        why: simText("flight.launch-sites-only-permit-certain-flight-directions-to-2"),
        more: simText("flight.allowed-inclination-from-this-site-0-to-1", site.inclinationRangeDeg[0], site.inclinationRangeDeg[1]), term: 'inclinacion' });
    } else if (cap.planeChangeDeg > 0) {
      checks.push({ id: 'inclination', status: 'warn', label: simText("flight.orbital-inclination-2"),
        detail: simText("flight.this-orbit-is-closer-to-the-equator-than", site.name, Math.abs(site.latitudeDeg), cap.planeChangeDeg, Math.round(cap.factor * 100)),
        why: simText("flight.plane-changes-are-expensive-in-fuel-near-equatorial"),
        more: simText("flight.plane-change-of-0-requires-1-km-s", cap.planeChangeDeg, cap.planeChangeDvKmS, data.rules.physics.leoOrbitalSpeedKmS), term: 'inclinacion' });
    } else {
      checks.push({ id: 'inclination', status: 'ok', label: simText("flight.orbital-inclination-2"),
        detail: simText('flight.inclination-allowed', site.name, target.inclinationDeg),
        why: simText('flight.inclination-easy'), term: 'inclinacion' });
    }
  }

  // 3. Peso de la nave y margen.
  if (cap.baseCapacityKg != null && !cap.inclinationBlocked) {
    const label = { green: simText("flight.comfortable-margin"), yellow: simText("flight.tight-margin"), red: simText("flight.risky-margin"), blocked: simText("flight.does-not-fit") }[mStatus];
    checks.push({ id: 'mass', status: mStatus === 'blocked' ? 'fail' : mStatus === 'green' ? 'ok' : 'warn', color: mStatus, label: simText("flight.spacecraft-mass-0-2", label),
      detail: marginKg >= 0
        ? simText("flight.mass-margin-summary", fmtKg(launchMassKg), fmtKg(capacityKg), usesPart(launchMassKg / capacityKg), fmtKg(marginKg), round(marginPct, 1))
        : simText("flight.your-payload-is-0-too-heavy-for-this", fmtKg(-marginKg)),
      why: simText("flight.spacecraft-often-get-heavier-during-development-try-to", thresholds.greenPct),
      more: simText("flight.margin-capacity-payload-mass-0-1-green-2-2", fmtKg(capacityKg), fmtKg(launchMassKg), thresholds.greenPct, thresholds.yellowPct), term: 'margen' });
  }

  // 4. Que la nave entre en la punta del cohete.
  const fits = sc.diameterM <= launcher.fairing.diameterM && sc.heightM <= launcher.fairing.heightM;
  checks.push({ id: 'fairing', status: fits ? 'ok' : 'fail', label: simText("flight.payload-fairing-2"),
    detail: fits
      ? simText("flight.your-folded-spacecraft-0-m-wide-1-m-2", sc.diameterM, sc.heightM, launcher.fairing.diameterM, launcher.fairing.heightM)
      : simText("flight.your-folded-spacecraft-0-m-1-m-does", sc.diameterM, sc.heightM, launcher.fairing.diameterM, launcher.fairing.heightM),
    why: simText("flight.the-payload-must-not-only-meet-the-mass-3"), term: 'cofia' });

  // 4b. Confiabilidad: no bloquea, pero avisa si el riesgo es alto.
  const warnBelow = rules.reliability?.warnBelow ?? 0.9;
  const failOdds = oneInN(1 - launcher.reliability);
  checks.push({ id: 'reliability', status: launcher.reliability < warnBelow ? 'warn' : 'ok', label: simText("flight.rocket-reliability"),
    detail: launcher.reliability < warnBelow
      ? simText("flight.with-this-rocket-0-it-fails-1-that", outOfHundred(launcher.reliability), failOdds)
      : simText("flight.with-this-rocket-0-it-fails-1-so-2", outOfHundred(launcher.reliability), failOdds),
    why: simText("flight.a-low-cost-less-tested-rocket-can-become-2"),
    more: simText("flight.reliability-used-by-the-game-0-1", launcher.reliability, launcher.sources?.reliability ?? simText("flight.see-data-launchers-json")), term: 'confiabilidad' });

  // 5. Presupuesto.
  const budgetStatus = budgetAfter < 0 ? 'fail' : budgetAfter < inputs.budget.totalMUSD * 0.05 ? 'warn' : 'ok';
  checks.push({ id: 'budget', status: budgetStatus, label: simText("flight.budget-2"),
    detail: budgetAfter < 0
      ? simText("flight.this-launch-costs-0-1-but-you-only", fmtMUSD(totalCost), costLike(totalCost), fmtMUSD(available))
      : simText("flight.this-launch-costs-0-1-2-you-have", fmtMUSD(totalCost), costLike(totalCost), date.delayCostMUSD ? simText("flight.including-0-in-delay-costs", fmtMUSD(date.delayCostMUSD)) : '', fmtMUSD(available), fmtMUSD(budgetAfter)),
    why: budgetStatus === 'warn' ? simText("flight.that-leaves-little-money-for-unexpected-costs-2") : simText("flight.the-rocket-shares-the-same-budget-as-instruments-2"), term: 'presupuesto' });

  // 6. Calendario y ventana.
  checks.push({ id: 'schedule', status: date.delayMonths > 0 ? 'warn' : 'ok', label: simText("flight.schedule"),
    detail: simText("flight.the-first-slot-is-in-0-months-1", date.availableMonth, date.waitedForWindow ? simText("flight.but-the-best-transfer-window-opens-in-month", date.launchMonth) : '', inputs.schedule.monthsToTargetDate, date.delayMonths > 0 ? simText("flight.you-would-be-0-months-late", date.delayMonths) : simText("flight.you-are-on-schedule-2")),
    why: date.waitedForWindow ? simText("flight.missing-the-transfer-window-can-mean-waiting-for-2") : simText("flight.rockets-have-waiting-lists-delays-postpone-science-operations-2"), term: 'ventana' });

  // 7. GTO desde latitud alta (solo difícil).
  if (gtoExtraDvMs > 0) {
    checks.push({ id: 'gto', status: gtoExtraDvMs > 100 ? 'warn' : 'ok', label: simText("flight.extra-cost-for-the-spacecraft-2"),
      detail: simText("flight.launching-from-0-latitude-adds-1-m-s", Math.abs(site.latitudeDeg), gtoExtraDvMs, fmtKg(gtoExtraPropKg), lifetimeYears),
      why: simText("flight.the-rocket-leaves-the-spacecraft-in-an-inclined-2"), term: 'gto' });
  }

  const compatible = checks.every((c) => c.status !== 'fail');
  return {
    launcherId: launcher.id, launcher, site, siteId, orbitDef, compatible, checks,
    capacityKg, baseCapacityKg: cap.baseCapacityKg, planeChangeDeg: cap.planeChangeDeg, capacityFactor: cap.factor,
    launchMassKg, offloadKg, marginKg, marginPct: round(marginPct, 1), marginStatus: mStatus,
    launchCostMUSD: launchCost, delayCostMUSD: date.delayCostMUSD, totalCostMUSD: totalCost, availableBudgetMUSD: available, budgetAfterMUSD: budgetAfter,
    date, reliability: launcher.reliability, gtoExtraDvMs, gtoExtraPropKg, lifetimeYears, fixedOrbit,
    probabilities: eventProbabilities({ launcher, site, marginStatus: mStatus }, rules, diff),
  };
}

export function evaluateAll(data, inputs, optionsById = {}) {
  return launchersForDifficulty(data, inputs.difficulty).map((launcher) => evaluateLauncher(launcher, data, inputs, optionsById[launcher.id]));
}

// Etiquetas de "trade study": muestran que no hay una única respuesta correcta.
export function tradeHighlights(evaluations) {
  const ok = evaluations.filter((e) => e.compatible);
  if (!ok.length) return {};
  const pick = (score) => ok.reduce((best, e) => (score(e) > score(best) ? e : best)).launcherId;
  return {
    cheapest: pick((e) => -e.totalCostMUSD),
    mostReliable: pick((e) => e.reliability),
    mostMargin: pick((e) => e.marginPct),
    soonest: pick((e) => -e.date.launchMonth),
  };
}

// ---------------------------------------------------------------------------
// Sugerencias cuando algo no es compatible (o es arriesgado)
// ---------------------------------------------------------------------------

export function buildSuggestions(evaluation, allEvaluations, data, inputs) {
  const out = [];
  const diff = getDifficulty(data.rules, inputs.difficulty);
  const sc = inputs.spacecraft;
  const failed = new Set(evaluation.checks.filter((c) => c.status === 'fail').map((c) => c.id));
  const others = allEvaluations.filter((e) => e.launcherId !== evaluation.launcherId && e.compatible);
  const byCost = [...others].sort((a, b) => a.totalCostMUSD - b.totalCostMUSD);
  const names = (list) => list.slice(0, 3).map((e) => simText("flight.0-1-2-payload-margin", e.launcher.name, fmtMUSD(e.totalCostMUSD), e.marginPct)).join('; ');

  if (failed.size && byCost.length) {
    out.push({ kind: 'launcher', role: 'launch', text: simText("flight.try-a-compatible-rocket-0", names(byCost)) });
  }
  if (failed.has('orbit')) {
    const reachable = ORBIT_ORDER.filter((id) => (evaluation.launcher.capacityKg[id] ?? 0) >= sc.massKg);
    if (reachable.length) out.push({ kind: 'orbit', role: 'science', text: simText("flight.with-0-your-spacecraft-could-reach-1-check", evaluation.launcher.name, reachable.join(', ')) });
  }
  if (failed.has('mass') || evaluation.marginStatus === 'red') {
    const goalPct = (data.rules.massMargin[inputs.difficulty] ?? data.rules.massMargin.normal).greenPct;
    const needKg = Math.ceil(evaluation.launchMassKg - evaluation.capacityKg * (1 - goalPct / 100));
    const deficitKg = Math.ceil(Math.max(0, -evaluation.marginKg));
    const target = failed.has('mass') ? deficitKg : needKg;
    if (target > 0) {
      const instrument = [...(sc.instruments ?? [])].sort((a, b) => a.massKg - b.massKg).find((i) => i.massKg >= target);
      out.push({ kind: 'mass', role: 'spacecraft', amountKg: target, text: simText("flight.ask-the-spacecraft-team-to-cut-0-of", fmtKg(target), failed.has('mass') ? simText("flight.to-fit-this-rocket") : simText("flight.to-leave-a-margin-of-0", goalPct), instrument ? simText("flight.for-example-remove-0-which-weighs-1-at", instrument.name, fmtKg(instrument.massKg)) : simText("flight.try-a-lighter-structure-smaller-batteries-or-fewer")) });
      const ops = operationalPropellant(sc);
      const extraOffload = target;
      if (diff.propellantOffload && ops > 0 && evaluation.offloadKg + extraOffload <= ops) {
        const life = round(lifetimeAfterLoss(sc, evaluation.offloadKg + extraOffload + evaluation.gtoExtraPropKg), 1);
        out.push({ kind: 'offload', role: 'spacecraft', amountKg: extraOffload, text: simText("flight.another-option-carry-0-less-propellant-the-spacecraft", fmtKg(extraOffload), sc.designLifetimeYears, life) });
      }
    }
  }
  if (failed.has('fairing')) {
    const bigger = byCost.filter((e) => e.launcher.fairing.diameterM >= sc.diameterM);
    out.push({ kind: 'fairing', role: 'spacecraft', text: simText("flight.redesign-the-spacecraft-to-fold-more-compactly-0", bigger.length ? simText("flight.or-use-a-rocket-with-a-larger-fairing", names(bigger)) : '') });
  }
  if (failed.has('inclination')) {
    out.push({ kind: 'site', role: 'launch', text: diff.siteChoice ? simText("flight.try-another-site-for-this-rocket-or-a") : simText("flight.pick-a-rocket-that-launches-in-the-right") });
  }
  if (failed.has('budget')) {
    const cheaper = byCost.filter((e) => e.budgetAfterMUSD >= 0);
    out.push({ kind: 'budget', role: 'mission', text: simText("flight.0-you-can-also-ask-mission-management-to-2", cheaper.length ? simText("flight.these-rockets-are-within-budget-0", names(cheaper)) : '') });
  }
  if (evaluation.date.delayMonths > 0) {
    const sooner = others.filter((e) => e.date.delayMonths < evaluation.date.delayMonths).sort((a, b) => a.date.launchMonth - b.date.launchMonth);
    if (sooner.length) out.push({ kind: 'schedule', role: 'launch', text: simText("flight.to-stay-on-schedule-consider-0", names(sooner)) });
  }
  if (evaluation.marginStatus === 'yellow' && !failed.size) {
    out.push({ kind: 'margin', role: 'spacecraft', text: simText("flight.mass-margin-is-tight-the-spacecraft-team-needs") });
  }
  return out;
}

// Pedidos que el módulo deja a otros roles en el estado compartido.
export function buildRequests(evaluation, inputs) {
  const requests = [];
  const sc = inputs.spacecraft;
  if (evaluation.offloadKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'propellant-offload', amountKg: evaluation.offloadKg, text: simText("flight.you-will-launch-with-0-less-fuel-the", fmtKg(evaluation.offloadKg), evaluation.lifetimeYears, sc.designLifetimeYears) });
  }
  if (evaluation.marginStatus === 'yellow' || evaluation.marginStatus === 'red') {
    requests.push({ toRole: 'spacecraft', type: 'mass-cap', amountKg: Math.max(0, Math.floor(evaluation.marginKg)), text: simText("flight.payload-margin-is-tight-0-the-spacecraft-can-2", evaluation.marginPct, fmtKg(Math.max(0, evaluation.marginKg))) });
  }
  if (evaluation.fixedOrbit) {
    requests.push({ toRole: 'science', type: 'orbit-change', text: simText("flight.rideshare-orbit-0-km-altitude-at-1-inclination", evaluation.fixedOrbit.altitudeKm, evaluation.fixedOrbit.inclinationDeg) });
  }
  if (evaluation.gtoExtraPropKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'extra-delta-v', amountKg: evaluation.gtoExtraPropKg, text: simText("flight.the-spacecraft-needs-another-0-m-s-of-2", evaluation.gtoExtraDvMs) });
  }
  if (evaluation.date.delayMonths > 0) {
    requests.push({ toRole: 'mission', type: 'schedule-delay', text: simText("flight.the-launch-is-0-months-later-than-planned-2", evaluation.date.delayMonths) });
  }
  return requests;
}

// ---------------------------------------------------------------------------
// Eventos aleatorios y simulación del lanzamiento
// ---------------------------------------------------------------------------

export function eventProbabilities({ launcher, site, marginStatus: mStatus }, rules, diff) {
  const ev = rules.events;
  const p = {};
  const enabled = new Set(diff.events);
  if (enabled.has('weather')) p.weather = site?.weatherRisk ?? 0;
  if (enabled.has('minorAnomaly')) p.minorAnomaly = Math.min(ev.minorAnomaly.maxProbability, ev.minorAnomaly.factor * (1 - launcher.reliability));
  if (enabled.has('failure')) p.failure = 1 - launcher.reliability;
  if (enabled.has('orbitOffset')) p.orbitOffset = ev.orbitOffset.baseProbability + (mStatus === 'red' ? ev.orbitOffset.extraIfRed : mStatus === 'yellow' ? ev.orbitOffset.extraIfYellow : 0);
  for (const key of Object.keys(p)) p[key] = round(p[key], 3);
  return p;
}

/**
 * Simula un lanzamiento. Con eventsEnabled=false todo sale según lo planeado
 * (modo práctica): se informa la probabilidad, pero no se tira el dado.
 */
export function simulateLaunch(evaluation, data, inputs, { seed = 1, eventsEnabled = true } = {}) {
  const rng = createRng(seed);
  const rules = data.rules;
  const ev = rules.events;
  const diff = getDifficulty(rules, inputs.difficulty);
  const sc = inputs.spacecraft;
  const p = evaluation.probabilities;
  const randBetween = (min, max) => min + rng() * (max - min);
  const events = [];
  let extraCost = 0;
  let delayDays = 0;
  let failed = false;
  let partial = false;
  let failurePhase = null;
  let lostPropKg = evaluation.offloadKg + evaluation.gtoExtraPropKg;
  let extraLifetimeLossPct = 0;

  const base = evaluation.fixedOrbit ?? inputs.orbit;
  const achieved = { type: inputs.orbit.type, altitudeKm: base.altitudeKm ?? null, inclinationDeg: base.inclinationDeg ?? null, note: simText("flight.you-reached-the-target-orbit") };
  if (inputs.orbit.type === 'GTO') achieved.inclinationDeg = round(Math.abs(evaluation.site.latitudeDeg), 1);

  if (eventsEnabled) {
    if (p.weather != null && rng() < p.weather) {
      const days = Math.round(randBetween(ev.weather.minDays, ev.weather.maxDays));
      const cost = round(days * ev.weather.costMUSDPerDay, 2);
      delayDays += days; extraCost += cost;
      events.push({ id: 'weather', phase: 'countdown', label: ev.weather.label, consequence: simText("flight.bad-weather-at-0-delayed-the-launch-by", evaluation.site.name, days, fmtMUSD(cost)), explain: ev.weather.explain, costMUSD: cost, delayDays: days, severity: 'minor' });
    }
    if (p.minorAnomaly != null && rng() < p.minorAnomaly) {
      const a = ev.minorAnomaly;
      delayDays += a.delayDays; extraCost += a.costMUSD;
      events.push({ id: 'minorAnomaly', phase: 'countdown', label: a.label, consequence: simText("flight.the-rocket-was-inspected-adding-0-days-and", a.delayDays, fmtMUSD(a.costMUSD)), explain: a.explain, costMUSD: a.costMUSD, delayDays: a.delayDays, severity: 'minor' });
    }
    if (p.failure != null && rng() < p.failure) {
      if (rng() < (diff.partialFailureShare ?? 0)) {
        partial = true;
        failurePhase = 'insertion';
      } else {
        failed = true;
        const phases = ['liftoff', 'maxq', 'staging', 'fairing', 'insertion'];
        failurePhase = phases[Math.floor(rng() * phases.length)];
      }
    }
    if (!failed && !partial && p.orbitOffset != null && rng() < p.orbitOffset) {
      const o = ev.orbitOffset;
      const dv = Math.round(randBetween(o.minCorrectionMS, o.maxCorrectionMS));
      const dAlt = Math.round(randBetween(5, 40)) * (rng() < 0.5 ? -1 : 1);
      const dInc = round(randBetween(0.05, 0.4), 2) * (rng() < 0.5 ? -1 : 1);
      if (achieved.altitudeKm != null) achieved.altitudeKm += dAlt;
      if (achieved.inclinationDeg != null) achieved.inclinationDeg = round(achieved.inclinationDeg + dInc, 2);
      let consequence;
      if (operationalPropellant(sc) > 0 && sc.ispS) {
        const kg = round(propellantForDeltaV(evaluation.launchMassKg, dv, sc.ispS, rules.physics.g0), 1);
        lostPropKg += kg;
        achieved.note = simText("flight.the-spacecraft-corrected-its-orbit-with-its-own", fmtKg(kg));
        consequence = simText("flight.the-rocket-was-slightly-off-target-the-spacecraft", dv, fmtKg(kg));
      } else {
        extraLifetimeLossPct += o.noPropulsionLifetimeLossPct;
        achieved.note = simText("flight.without-an-engine-the-spacecraft-stays-in-a-2");
        consequence = simText("flight.the-spacecraft-cannot-correct-its-orbit-and-loses", o.noPropulsionLifetimeLossPct);
      }
      events.push({ id: 'orbitOffset', phase: 'insertion', label: o.label, consequence, explain: o.explain, deltaVMs: dv, severity: 'moderate' });
    }
  }

  const plannedLifetime = evaluation.lifetimeYears;
  let lifetime = lifetimeAfterLoss(sc, lostPropKg) * (1 - extraLifetimeLossPct / 100);

  if (partial) {
    const [lo, hi] = ev.failure.partialLifetimeLossPct;
    const lossPct = Math.round(randBetween(lo, hi));
    const canRecover = operationalPropellant(sc) > 0;
    if (achieved.altitudeKm != null) achieved.altitudeKm = Math.round(achieved.altitudeKm * 0.6);
    if (canRecover) {
      lifetime *= 1 - lossPct / 100;
      achieved.note = simText("flight.the-final-stage-shut-down-early-the-spacecraft");
      events.push({ id: 'partialFailure', phase: 'insertion', label: simText("flight.partial-failure-you-reached-a-lower-orbit-2"), consequence: simText("flight.the-spacecraft-raises-its-orbit-with-its-own", lossPct), explain: ev.failure.explain, severity: 'major' });
    } else {
      failed = true;
      achieved.note = simText("flight.without-its-own-engine-the-spacecraft-could-not-2");
      events.push({ id: 'partialFailure', phase: 'insertion', label: simText("flight.partial-failure-orbit-too-low"), consequence: simText("flight.the-spacecraft-had-no-engine-to-raise-its-2"), explain: ev.failure.explain, severity: 'fatal' });
    }
  }
  if (failed && !events.some((e) => e.severity === 'fatal')) {
    const phase = FLIGHT_PHASES.find((ph) => ph.id === failurePhase);
    events.push({ id: 'failure', phase: failurePhase, label: ev.failure.label, consequence: simText("flight.the-rocket-failed-during-0-and-the-spacecraft", phase.label), explain: ev.failure.explain, severity: 'fatal' });
  }

  lifetime = failed ? 0 : round(lifetime, 1);
  const lossPct = plannedLifetime > 0 ? ((plannedLifetime - lifetime) / plannedLifetime) * 100 : 0;
  const result = failed ? 'falla' : partial || lossPct >= rules.outcome.partialIfLifetimeLossPct ? 'exito_parcial' : 'exito';
  return {
    result,
    failurePhase,
    events,
    achievedOrbit: failed ? null : achieved,
    lifetimeYears: lifetime,
    plannedLifetimeYears: plannedLifetime,
    extraCostMUSD: round(extraCost, 2),
    delayDays,
    seed,
    eventsEnabled,
  };
}

// ---------------------------------------------------------------------------
// Comparación con misiones reales de NASA
// ---------------------------------------------------------------------------

export function matchReferenceMission(missions, orbitType, massKg, launcherId) {
  const sameOrbit = missions.filter((m) => m.orbit === orbitType);
  const pool = sameOrbit.length ? sameOrbit : missions;
  const distance = (m) => Math.abs(Math.log(m.massKg / Math.max(massKg, 1)));
  const closest = [...pool].sort((a, b) => distance(a) - distance(b))[0];
  const sameLauncher = pool.filter((m) => m.launcherId === launcherId).sort((a, b) => distance(a) - distance(b))[0] ?? null;
  return { closest, sameLauncher: sameLauncher && sameLauncher.id !== closest?.id ? sameLauncher : null };
}
