// Motor de reglas del módulo LAUNCH.
// Funciones puras: no tocan el DOM ni el almacenamiento, así se pueden probar con
// `node --test` y reutilizar desde otros módulos. Ninguna cifra de juego está escrita
// aquí: todo sale de los archivos de data/ (launchers, sites, orbits, rules).

import { fmtKg, fmtMUSD, fmtPct, massLike, speedLike, costLike, oneInN, outOfHundred, usesPart } from './plain.js';
export { fmtKg, fmtMUSD, fmtPct };

export const ORBIT_ORDER = ['LEO', 'SSO', 'GTO', 'TLI', 'ESCAPE'];
export const FLIGHT_PHASES = [
  { id: 'countdown', label: 'Cuenta regresiva', t: -10 },
  { id: 'liftoff', label: 'Despegue', t: 0 },
  { id: 'maxq', label: 'Momento de más presión del aire (Max-Q)', t: 70 },
  { id: 'staging', label: 'Separar etapas', t: 160 },
  { id: 'fairing', label: 'Soltar la punta (cofia)', t: 210 },
  { id: 'insertion', label: 'Llegar a la órbita', t: 520 },
  { id: 'deploy', label: 'Abrir la nave', t: 600 },
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
    ? { id: 'orbit', status: 'fail', label: 'Destino',
      detail: `${launcher.name} no llega hasta ${place}: no tiene fuerza para un viaje tan largo. Prueba un cohete más grande.`,
      why: 'Para ir más lejos hace falta mucha más velocidad, y eso significa mucho más combustible. Un cohete pequeño se queda sin fuerza antes de llegar.',
      more: `Presupuesto de velocidad (delta-v) aproximado desde el suelo: ${orbitDef.deltaVKmS} km/s. Valor típico de libros de mecánica orbital.`, term: 'orbita-alta' }
    : { id: 'orbit', status: 'ok', label: 'Destino',
      detail: `Sí llega hasta ${place}. Puede subir hasta ${fmtKg(cap.baseCapacityKg)} (${massLike(cap.baseCapacityKg)}).`,
      why: `Llegar hasta ahí pide un presupuesto de velocidad (delta-v) de unos ${orbitDef.deltaVKmS} km/s. ${speedLike(7.8)}: así de rápido hay que ir solo para quedarse en órbita.`,
      more: `Δv aproximado desde el suelo, con las pérdidas por gravedad y aire: ${orbitDef.deltaVKmS} km/s. Capacidad: ${launcher.sources?.capacityKg ?? 'ver data/launchers.json'}.`, term: 'delta-v' });

  // 2. Inclinación y sitio (o la órbita fija de un viaje compartido).
  if (fixedOrbit) {
    const dInc = target.inclinationDeg != null ? Math.abs(fixedOrbit.inclinationDeg - target.inclinationDeg) : 0;
    const dAlt = target.altitudeKm != null ? Math.abs(fixedOrbit.altitudeKm - target.altitudeKm) : 0;
    const off = diff.inclinationRules && (dInc > 5 || dAlt > 100);
    checks.push({ id: 'inclination', status: off ? 'warn' : 'ok', label: 'Órbita exacta',
      detail: off
        ? `En un viaje compartido te dejan en la órbita de la misión principal (${fixedOrbit.altitudeKm} km de altura, ${fixedOrbit.inclinationDeg}° de inclinación), que no es la que pediste (${target.altitudeKm ?? '—'} km y ${target.inclinationDeg ?? '—'}°).`
        : `Vas en el cohete de otra misión: tu órbita será de ${fixedOrbit.altitudeKm} km de altura y ${fixedOrbit.inclinationDeg}° de inclinación, y coincide con lo que necesitas.`,
      why: 'En un viaje compartido no eliges la órbita. Si no coincide con la que necesita la ciencia, el equipo de ciencia tiene que aceptar el cambio.', term: 'rideshare' });
  } else if (diff.inclinationRules && orbitDef.needsInclination && target.inclinationDeg != null) {
    if (cap.inclinationBlocked) {
      checks.push({ id: 'inclination', status: 'fail', label: 'Inclinación de la órbita',
        detail: `Desde ${site.name} no se puede lanzar hacia una órbita con ${target.inclinationDeg}° de inclinación: el cohete pasaría sobre zonas con gente. Prueba otro sitio o un cohete que despegue de otro lugar.`,
        why: 'Cada sitio solo puede lanzar en ciertas direcciones, para que el cohete (y sus pedazos) siempre caigan al mar.',
        more: `Rango permitido en este sitio: de ${site.inclinationRangeDeg[0]}° a ${site.inclinationRangeDeg[1]}° (simplificado para el juego).`, term: 'inclinacion' });
    } else if (cap.planeChangeDeg > 0) {
      checks.push({ id: 'inclination', status: 'warn', label: 'Inclinación de la órbita',
        detail: `Esa órbita queda más cerca del ecuador que ${site.name} (${Math.abs(site.latitudeDeg)}° de latitud). Para lograrla hay que girar la órbita ${cap.planeChangeDeg}°, y eso gasta mucho combustible: el cohete solo puede llevar el ${Math.round(cap.factor * 100)} % de su carga normal.`,
        why: 'Girar una órbita es una de las maniobras más caras que existen. Por eso las misiones cerca del ecuador prefieren sitios cerca del ecuador.',
        more: `Giro de ${cap.planeChangeDeg}° ⇒ Δv extra de ${cap.planeChangeDvKmS} km/s. Fórmula: Δv = 2·v·sen(Δi/2), con v = ${data.rules.physics.leoOrbitalSpeedKmS} km/s.`, term: 'inclinacion' });
    } else {
      checks.push({ id: 'inclination', status: 'ok', label: 'Inclinación de la órbita',
        detail: `Desde ${site.name} sí puedes llegar a una órbita con ${target.inclinationDeg}° de inclinación, sin gastar combustible extra.`,
        why: 'Desde un sitio de lanzamiento es fácil llegar a órbitas igual de inclinadas que su latitud, o más. Hacerlas menos inclinadas sale caro.', term: 'inclinacion' });
    }
  }

  // 3. Peso de la nave y margen.
  if (cap.baseCapacityKg != null && !cap.inclinationBlocked) {
    const label = { green: 'Margen cómodo', yellow: 'Margen justo', red: 'Margen arriesgado', blocked: 'No cabe' }[mStatus];
    checks.push({ id: 'mass', status: mStatus === 'blocked' ? 'fail' : mStatus === 'green' ? 'ok' : 'warn', color: mStatus, label: `Peso de tu nave · ${label}`,
      detail: marginKg >= 0
        ? `Tu nave pesa ${massLike(launchMassKg)} (${fmtKg(launchMassKg)}). El cohete puede subir ${fmtKg(capacityKg)}, así que ocupa ${usesPart(launchMassKg / capacityKg)} y te sobran ${fmtKg(marginKg)} (${round(marginPct, 1)} %).`
        : `Tu nave es demasiado pesada para este cohete: pesa ${fmtKg(-marginKg)} más de lo que puede subir. Prueba un cohete más grande o pídele al equipo de la nave que le quite peso.`,
      why: `Casi todas las naves engordan mientras las construyen (cables, tornillos, cambios de diseño). Por eso conviene dejar al menos ${thresholds.greenPct} de cada 100 kg libres.`,
      more: `margen = capacidad − masa de la nave = ${fmtKg(capacityKg)} − ${fmtKg(launchMassKg)}. Semáforo: verde ≥ ${thresholds.greenPct} %, amarillo ≥ ${thresholds.yellowPct} %.`, term: 'margen' });
  }

  // 4. Que la nave entre en la punta del cohete.
  const fits = sc.diameterM <= launcher.fairing.diameterM && sc.heightM <= launcher.fairing.heightM;
  checks.push({ id: 'fairing', status: fits ? 'ok' : 'fail', label: 'Espacio en la punta (cofia)',
    detail: fits
      ? `Tu nave doblada (${sc.diameterM} m de ancho × ${sc.heightM} m de alto) cabe en la punta que la protege (cofia): hay ${launcher.fairing.diameterM} m × ${launcher.fairing.heightM} m.`
      : `Tu nave doblada (${sc.diameterM} m × ${sc.heightM} m) no cabe en la punta del cohete (cofia), que mide ${launcher.fairing.diameterM} m × ${launcher.fairing.heightM} m. Prueba un cohete con la punta más grande o pide un diseño más plegable.`,
    why: 'No basta con que el cohete aguante el peso: la nave también tiene que entrar físicamente en la punta, bien doblada.', term: 'cofia' });

  // 4b. Confiabilidad: no bloquea, pero avisa si el riesgo es alto.
  const warnBelow = rules.reliability?.warnBelow ?? 0.9;
  const failOdds = oneInN(1 - launcher.reliability);
  checks.push({ id: 'reliability', status: launcher.reliability < warnBelow ? 'warn' : 'ok', label: 'Seguridad del cohete',
    detail: launcher.reliability < warnBelow
      ? `Con este cohete, ${outOfHundred(launcher.reliability)}. Falla ${failOdds}. Es mucho riesgo para una nave que solo tienes una vez.`
      : `Con este cohete, ${outOfHundred(launcher.reliability)}. Falla ${failOdds}: es bastante seguro.`,
    why: 'Un cohete barato pero poco probado puede salir caro si hay que construir otra nave. Para un CubeSat barato puede valer la pena; para una misión grande, casi nunca.',
    more: `Confiabilidad usada en el juego: ${launcher.reliability} (${launcher.sources?.reliability ?? 'ver data/launchers.json'}).`, term: 'confiabilidad' });

  // 5. Presupuesto.
  const budgetStatus = budgetAfter < 0 ? 'fail' : budgetAfter < inputs.budget.totalMUSD * 0.05 ? 'warn' : 'ok';
  checks.push({ id: 'budget', status: budgetStatus, label: 'Dinero',
    detail: budgetAfter < 0
      ? `Este lanzamiento cuesta ${fmtMUSD(totalCost)} (${costLike(totalCost)}) y solo tienes ${fmtMUSD(available)}. Busca un cohete más barato o pide más dinero al equipo de dirección.`
      : `Este lanzamiento cuesta ${fmtMUSD(totalCost)} (${costLike(totalCost)})${date.delayCostMUSD ? `, y ${fmtMUSD(date.delayCostMUSD)} son por llegar tarde` : ''}. Tienes ${fmtMUSD(available)}, así que te quedarían ${fmtMUSD(budgetAfter)}.`,
    why: budgetStatus === 'warn' ? 'Te quedaría muy poco dinero para imprevistos de los otros equipos.' : 'El dinero del cohete sale del mismo presupuesto que los instrumentos y las operaciones.', term: 'presupuesto' });

  // 6. Calendario y ventana.
  checks.push({ id: 'schedule', status: date.delayMonths > 0 ? 'warn' : 'ok', label: 'Fecha',
    detail: `El primer cupo libre es dentro de ${date.availableMonth} meses${date.waitedForWindow ? `, pero el mejor momento para viajar a ese destino empieza en el mes ${date.launchMonth}` : ''}. Querías salir en el mes ${inputs.schedule.monthsToTargetDate}.${date.delayMonths > 0 ? ` Llegarías ${date.delayMonths} meses tarde.` : ' ¡Llegas a tiempo!'}`,
    why: date.waitedForWindow ? 'Si pierdes ese momento, hay que esperar a que los planetas vuelvan a acomodarse bien (en Marte, unos 26 meses).' : 'Los cohetes tienen lista de espera. Llegar tarde atrasa la ciencia y mantiene al equipo cobrando sin volar.', term: 'ventana' });

  // 7. GTO desde latitud alta (solo difícil).
  if (gtoExtraDvMs > 0) {
    checks.push({ id: 'gto', status: gtoExtraDvMs > 100 ? 'warn' : 'ok', label: 'Costo extra para tu nave',
      detail: `Lanzar desde ${Math.abs(site.latitudeDeg)}° de latitud obliga a tu nave a hacer ${gtoExtraDvMs} m/s más de maniobra que si saliera del ecuador. Gastará unos ${fmtKg(gtoExtraPropKg)} de combustible y vivirá ${lifetimeYears} años.`,
      why: 'El cohete deja la órbita inclinada igual que la latitud del sitio. Enderezarla hasta el ecuador lo paga la nave con su propio combustible.', term: 'gto' });
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
  const names = (list) => list.slice(0, 3).map((e) => `${e.launcher.name} (${fmtMUSD(e.totalCostMUSD)}, sobra ${e.marginPct} % de peso)`).join('; ');

  if (failed.size && byCost.length) {
    out.push({ kind: 'launcher', role: 'launch', text: `Prueba otro cohete que sí sirva: ${names(byCost)}.` });
  }
  if (failed.has('orbit')) {
    const reachable = ORBIT_ORDER.filter((id) => (evaluation.launcher.capacityKg[id] ?? 0) >= sc.massKg);
    if (reachable.length) out.push({ kind: 'orbit', role: 'science', text: `Con ${evaluation.launcher.name} tu nave sí podría ir a: ${reachable.join(', ')}. Cambiar de destino cambia la ciencia, así que coméntalo con el equipo de ciencia.` });
  }
  if (failed.has('mass') || evaluation.marginStatus === 'red') {
    const goalPct = (data.rules.massMargin[inputs.difficulty] ?? data.rules.massMargin.normal).greenPct;
    const needKg = Math.ceil(evaluation.launchMassKg - evaluation.capacityKg * (1 - goalPct / 100));
    const deficitKg = Math.ceil(Math.max(0, -evaluation.marginKg));
    const target = failed.has('mass') ? deficitKg : needKg;
    if (target > 0) {
      const instrument = [...(sc.instruments ?? [])].sort((a, b) => a.massKg - b.massKg).find((i) => i.massKg >= target);
      out.push({ kind: 'mass', role: 'spacecraft', amountKg: target, text: `Pídele al equipo de la nave que le quite ${fmtKg(target)} de peso${failed.has('mass') ? ' para que entre en este cohete' : ` para dejar un margen de ${goalPct} %`}${instrument ? ` (por ejemplo, sin "${instrument.name}", que pesa ${fmtKg(instrument.massKg)}; habría menos ciencia)` : ' (estructura más liviana, baterías más chicas o un instrumento menos)'}.` });
      const ops = operationalPropellant(sc);
      const extraOffload = target;
      if (diff.propellantOffload && ops > 0 && evaluation.offloadKg + extraOffload <= ops) {
        const life = round(lifetimeAfterLoss(sc, evaluation.offloadKg + extraOffload + evaluation.gtoExtraPropKg), 1);
        out.push({ kind: 'offload', role: 'spacecraft', amountKg: extraOffload, text: `Otra salida: cargar ${fmtKg(extraOffload)} menos de combustible. La nave entra, pero vivirá menos: de ${sc.designLifetimeYears} años baja a ${life}.` });
      }
    }
  }
  if (failed.has('fairing')) {
    const bigger = byCost.filter((e) => e.launcher.fairing.diameterM >= sc.diameterM);
    out.push({ kind: 'fairing', role: 'spacecraft', text: `Rediseña la nave para que se doble más (paneles y antenas que se despliegan)${bigger.length ? ` o usa un cohete con la punta más grande: ${names(bigger)}` : ''}.` });
  }
  if (failed.has('inclination')) {
    out.push({ kind: 'site', role: 'launch', text: diff.siteChoice ? 'Prueba otro sitio de lanzamiento para el mismo cohete, o un cohete que despegue más cerca del ecuador (Kourou, Kwajalein).' : 'Elige un cohete que despegue desde un sitio con la dirección adecuada.' });
  }
  if (failed.has('budget')) {
    const cheaper = byCost.filter((e) => e.budgetAfterMUSD >= 0);
    out.push({ kind: 'budget', role: 'mission', text: `${cheaper.length ? `Estos sí te alcanzan: ${names(cheaper)}. ` : ''}O pídele más dinero al equipo de dirección (tendrían que recortar otra parte).` });
  }
  if (evaluation.date.delayMonths > 0) {
    const sooner = others.filter((e) => e.date.delayMonths < evaluation.date.delayMonths).sort((a, b) => a.date.launchMonth - b.date.launchMonth);
    if (sooner.length) out.push({ kind: 'schedule', role: 'launch', text: `Para no llegar tarde, mira: ${names(sooner)}.` });
  }
  if (evaluation.marginStatus === 'yellow' && !failed.size) {
    out.push({ kind: 'margin', role: 'spacecraft', text: 'El margen está justo. Avisa al equipo de la nave: si la nave engorda, tienen que consultarte antes.' });
  }
  return out;
}

// Pedidos que el módulo deja a otros roles en el estado compartido.
export function buildRequests(evaluation, inputs) {
  const requests = [];
  const sc = inputs.spacecraft;
  if (evaluation.offloadKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'propellant-offload', amountKg: evaluation.offloadKg, text: `Vas a despegar con ${fmtKg(evaluation.offloadKg)} menos de combustible, así que la nave vivirá ${evaluation.lifetimeYears} años (diseñada para ${sc.designLifetimeYears}).` });
  }
  if (evaluation.marginStatus === 'yellow' || evaluation.marginStatus === 'red') {
    requests.push({ toRole: 'spacecraft', type: 'mass-cap', amountKg: Math.max(0, Math.floor(evaluation.marginKg)), text: `Casi no sobra peso (${evaluation.marginPct} %): la nave no puede engordar más de ${fmtKg(Math.max(0, evaluation.marginKg))}.` });
  }
  if (evaluation.fixedOrbit) {
    requests.push({ toRole: 'science', type: 'orbit-change', text: `Viaje compartido: tu órbita será de ${evaluation.fixedOrbit.altitudeKm} km de altura y ${evaluation.fixedOrbit.inclinationDeg}° de inclinación.` });
  }
  if (evaluation.gtoExtraPropKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'extra-delta-v', amountKg: evaluation.gtoExtraPropKg, text: `La nave tendrá que hacer ${evaluation.gtoExtraDvMs} m/s más de maniobra para quedarse fija sobre el ecuador.` });
  }
  if (evaluation.date.delayMonths > 0) {
    requests.push({ toRole: 'mission', type: 'schedule-delay', text: `El lanzamiento sale ${evaluation.date.delayMonths} meses después de la fecha que querían.` });
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
  const achieved = { type: inputs.orbit.type, altitudeKm: base.altitudeKm ?? null, inclinationDeg: base.inclinationDeg ?? null, note: 'Llegaste a la órbita que querías.' };
  if (inputs.orbit.type === 'GTO') achieved.inclinationDeg = round(Math.abs(evaluation.site.latitudeDeg), 1);

  if (eventsEnabled) {
    if (p.weather != null && rng() < p.weather) {
      const days = Math.round(randBetween(ev.weather.minDays, ev.weather.maxDays));
      const cost = round(days * ev.weather.costMUSDPerDay, 2);
      delayDays += days; extraCost += cost;
      events.push({ id: 'weather', phase: 'countdown', label: ev.weather.label, consequence: `Hubo mal clima en ${evaluation.site.name}: esperaron ${days} días y costó ${fmtMUSD(cost)} más.`, explain: ev.weather.explain, costMUSD: cost, delayDays: days, severity: 'minor' });
    }
    if (p.minorAnomaly != null && rng() < p.minorAnomaly) {
      const a = ev.minorAnomaly;
      delayDays += a.delayDays; extraCost += a.costMUSD;
      events.push({ id: 'minorAnomaly', phase: 'countdown', label: a.label, consequence: `Revisaron el cohete: ${a.delayDays} días de retraso y ${fmtMUSD(a.costMUSD)} más.`, explain: a.explain, costMUSD: a.costMUSD, delayDays: a.delayDays, severity: 'minor' });
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
        achieved.note = `La nave corrigió su órbita con su propio motor y gastó ${fmtKg(kg)} de combustible.`;
        consequence = `El cohete dejó la nave un poco corrida. La nave la corrigió con su motor (${dv} m/s) y gastó ${fmtKg(kg)} de combustible.`;
      } else {
        extraLifetimeLossPct += o.noPropulsionLifetimeLossPct;
        achieved.note = 'La nave no tiene motor para corregir, así que se queda en esta órbita algo distinta.';
        consequence = `La nave no tiene motor para corregirse y pierde cerca de ${o.noPropulsionLifetimeLossPct} % de su vida útil (la órbita decae antes o los datos sirven menos).`;
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
      achieved.note = 'La última etapa se apagó antes de tiempo. La nave usó gran parte de su combustible para subir sola a la órbita correcta.';
      events.push({ id: 'partialFailure', phase: 'insertion', label: 'Falla parcial: quedaste en una órbita más baja', consequence: `La nave sube con su propio motor y pierde cerca de ${lossPct} % de su vida útil.`, explain: ev.failure.explain, severity: 'major' });
    } else {
      failed = true;
      achieved.note = 'Sin motor propio, la nave no pudo subir y volvió a entrar en la atmósfera.';
      events.push({ id: 'partialFailure', phase: 'insertion', label: 'Falla parcial: órbita demasiado baja', consequence: 'La nave no tiene motor para subir sola, así que se perdió.', explain: ev.failure.explain, severity: 'fatal' });
    }
  }
  if (failed && !events.some((e) => e.severity === 'fatal')) {
    const phase = FLIGHT_PHASES.find((ph) => ph.id === failurePhase);
    events.push({ id: 'failure', phase: failurePhase, label: ev.failure.label, consequence: `El cohete falló durante «${phase.label}» y la nave se perdió.`, explain: ev.failure.explain, severity: 'fatal' });
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
