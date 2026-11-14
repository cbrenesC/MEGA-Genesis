// Motor de reglas del módulo LAUNCH.
// Funciones puras: no tocan el DOM ni el almacenamiento, así se pueden probar con
// `node --test` y reutilizar desde otros módulos. Ninguna cifra de juego está escrita
// aquí: todo sale de los archivos de data/ (launchers, sites, orbits, rules).

export const ORBIT_ORDER = ['LEO', 'SSO', 'GTO', 'TLI', 'ESCAPE'];
export const FLIGHT_PHASES = [
  { id: 'countdown', label: 'Cuenta regresiva', t: -10 },
  { id: 'liftoff', label: 'Despegue', t: 0 },
  { id: 'maxq', label: 'Max-Q', t: 70 },
  { id: 'staging', label: 'Separación de etapas', t: 160 },
  { id: 'fairing', label: 'Separación de cofia', t: 210 },
  { id: 'insertion', label: 'Inserción orbital', t: 520 },
  { id: 'deploy', label: 'Despliegue de la nave', t: 600 },
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

  // 1. ¿Llega a ese destino?
  checks.push(cap.baseCapacityKg == null
    ? { id: 'orbit', status: 'fail', label: 'Destino', detail: `${launcher.name} no puede llegar a ${orbitDef.name}.`, why: 'Un cohete pequeño no tiene suficiente Δv (energía) para destinos altos o lejanos, aunque la nave sea liviana.', term: 'orbita-alta' }
    : { id: 'orbit', status: 'ok', label: 'Destino', detail: `Puede llevar hasta ${fmtKg(cap.baseCapacityKg)} a ${orbitDef.name}.`, why: `Llegar a este destino cuesta unos ${orbitDef.deltaVKmS} km/s de Δv. Cuanto más alto el destino, menos masa puede llevar el mismo cohete.`, term: 'delta-v' });

  // 2. Inclinación y sitio (o la órbita fija de un viaje compartido).
  if (fixedOrbit) {
    const dInc = target.inclinationDeg != null ? Math.abs(fixedOrbit.inclinationDeg - target.inclinationDeg) : 0;
    const dAlt = target.altitudeKm != null ? Math.abs(fixedOrbit.altitudeKm - target.altitudeKm) : 0;
    const off = diff.inclinationRules && (dInc > 5 || dAlt > 100);
    checks.push({ id: 'inclination', status: off ? 'warn' : 'ok', label: 'Órbita exacta',
      detail: `Viajas a la órbita de la misión principal: ${fixedOrbit.altitudeKm} km y ${fixedOrbit.inclinationDeg}°${off ? `, distinta de la pedida (${target.altitudeKm ?? '—'} km, ${target.inclinationDeg ?? '—'}°).` : '.'}`,
      why: 'En un viaje compartido no eliges la órbita. Si no coincide con la que necesita la ciencia, el equipo de ciencia debe aceptar el cambio.', term: 'rideshare' });
  } else if (diff.inclinationRules && orbitDef.needsInclination && target.inclinationDeg != null) {
    if (cap.inclinationBlocked) {
      checks.push({ id: 'inclination', status: 'fail', label: 'Inclinación', detail: `Desde ${site.name} no se puede lanzar hacia ${target.inclinationDeg}° (rango seguro: ${site.inclinationRangeDeg[0]}°–${site.inclinationRangeDeg[1]}°).`, why: 'Los cohetes no deben sobrevolar ciudades al subir; cada sitio solo puede lanzar en ciertas direcciones.', term: 'inclinacion' });
    } else if (cap.planeChangeDeg > 0) {
      checks.push({ id: 'inclination', status: 'warn', label: 'Inclinación', detail: `La latitud de ${site.name} (${Math.abs(site.latitudeDeg)}°) obliga a girar la órbita ${cap.planeChangeDeg}°: cuesta ${cap.planeChangeDvKmS} km/s extra y la capacidad baja al ${Math.round(cap.factor * 100)} %.`, why: 'Girar el plano de una órbita es de las maniobras más caras. Por eso las misiones ecuatoriales prefieren sitios cerca del ecuador.', term: 'inclinacion' });
    } else {
      checks.push({ id: 'inclination', status: 'ok', label: 'Inclinación', detail: `${target.inclinationDeg}° se alcanza directamente desde ${site.name}.`, why: 'Desde un sitio se llega fácil a inclinaciones iguales o mayores a su latitud.', term: 'inclinacion' });
    }
  }

  // 3. Masa y margen.
  if (cap.baseCapacityKg != null && !cap.inclinationBlocked) {
    const label = { green: 'Margen cómodo', yellow: 'Margen justo', red: 'Margen arriesgado', blocked: 'No cabe' }[mStatus];
    checks.push({ id: 'mass', status: mStatus === 'blocked' ? 'fail' : mStatus === 'green' ? 'ok' : 'warn', color: mStatus, label: `Masa · ${label}`,
      detail: marginKg >= 0
        ? `Tu nave (${fmtKg(launchMassKg)}) usa el ${Math.round((launchMassKg / capacityKg) * 100)} % de la capacidad (${fmtKg(capacityKg)}). Sobran ${fmtKg(marginKg)} (${round(marginPct, 1)} %).`
        : `Tu nave (${fmtKg(launchMassKg)}) pesa ${fmtKg(-marginKg)} más de lo que el cohete puede llevar a ese destino (${fmtKg(capacityKg)}).`,
      why: `Las naves suelen ganar peso mientras se construyen. En este nivel se recomienda dejar al menos ${thresholds.greenPct} % de margen.`, term: 'margen' });
  }

  // 4. Volumen de la cofia.
  const fits = sc.diameterM <= launcher.fairing.diameterM && sc.heightM <= launcher.fairing.heightM;
  checks.push({ id: 'fairing', status: fits ? 'ok' : 'fail', label: 'Cofia',
    detail: fits
      ? `La nave plegada (${sc.diameterM} m × ${sc.heightM} m) cabe en la cofia (${launcher.fairing.diameterM} m × ${launcher.fairing.heightM} m).`
      : `La nave plegada (${sc.diameterM} m × ${sc.heightM} m) no cabe en la cofia (${launcher.fairing.diameterM} m × ${launcher.fairing.heightM} m).`,
    why: 'No basta con que el cohete pueda levantar el peso: la nave también tiene que entrar físicamente en la punta del cohete.', term: 'cofia' });

  // 5. Presupuesto.
  const budgetStatus = budgetAfter < 0 ? 'fail' : budgetAfter < inputs.budget.totalMUSD * 0.05 ? 'warn' : 'ok';
  checks.push({ id: 'budget', status: budgetStatus, label: 'Presupuesto',
    detail: `Cuesta ${fmtMUSD(totalCost)}${date.delayCostMUSD ? ` (incluye ${fmtMUSD(date.delayCostMUSD)} por retraso)` : ''}. Disponible: ${fmtMUSD(available)}. Quedaría: ${fmtMUSD(budgetAfter)}.`,
    why: budgetStatus === 'warn' ? 'Te quedaría muy poco dinero para imprevistos de los otros equipos.' : 'El dinero del lanzador sale del mismo presupuesto que los instrumentos y las operaciones.', term: 'presupuesto' });

  // 6. Calendario y ventana.
  checks.push({ id: 'schedule', status: date.delayMonths > 0 ? 'warn' : 'ok', label: 'Calendario',
    detail: `Primer cupo en ${date.availableMonth} meses${date.waitedForWindow ? `, pero la ventana hacia el destino abre en el mes ${date.launchMonth}` : ''}. Fecha objetivo: mes ${inputs.schedule.monthsToTargetDate}.${date.delayMonths > 0 ? ` Retraso: ${date.delayMonths} meses.` : ''}`,
    why: date.waitedForWindow ? 'Si pierdes la ventana, hay que esperar a que los planetas vuelvan a alinearse.' : 'Los cohetes tienen lista de espera. Llegar tarde retrasa la ciencia y mantiene al equipo cobrando sin volar.', term: 'ventana' });

  // 7. GTO desde latitud alta (solo difícil).
  if (gtoExtraDvMs > 0) {
    checks.push({ id: 'gto', status: gtoExtraDvMs > 100 ? 'warn' : 'ok', label: 'Costo para la nave (GTO→GEO)',
      detail: `Desde ${Math.abs(site.latitudeDeg)}° de latitud la nave necesita ${gtoExtraDvMs} m/s más que desde el ecuador: unos ${fmtKg(gtoExtraPropKg)} de combustible, que bajan la vida útil a ${lifetimeYears} años.`,
      why: 'El cohete deja la órbita inclinada como la latitud del sitio; enderezarla hasta el ecuador la paga la nave con su propio combustible.', term: 'gto' });
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
  const names = (list) => list.slice(0, 3).map((e) => `${e.launcher.name} (${fmtMUSD(e.totalCostMUSD)}, margen ${e.marginPct} %)`).join('; ');

  if (failed.size && byCost.length) {
    out.push({ kind: 'launcher', role: 'launch', text: `Elegir otro lanzador compatible: ${names(byCost)}.` });
  }
  if (failed.has('orbit')) {
    const reachable = ORBIT_ORDER.filter((id) => (evaluation.launcher.capacityKg[id] ?? 0) >= sc.massKg);
    if (reachable.length) out.push({ kind: 'orbit', role: 'science', text: `Con ${evaluation.launcher.name} la nave podría ir a: ${reachable.join(', ')}. Cambiar de destino cambia la ciencia: decídanlo con el rol de Ciencia/Órbita.` });
  }
  if (failed.has('mass') || evaluation.marginStatus === 'red') {
    const goalPct = (data.rules.massMargin[inputs.difficulty] ?? data.rules.massMargin.normal).greenPct;
    const needKg = Math.ceil(evaluation.launchMassKg - evaluation.capacityKg * (1 - goalPct / 100));
    const deficitKg = Math.ceil(Math.max(0, -evaluation.marginKg));
    const target = failed.has('mass') ? deficitKg : needKg;
    if (target > 0) {
      const instrument = [...(sc.instruments ?? [])].sort((a, b) => a.massKg - b.massKg).find((i) => i.massKg >= target);
      out.push({ kind: 'mass', role: 'spacecraft', amountKg: target, text: `Reducir la masa de la nave en ${fmtKg(target)}${failed.has('mass') ? ' para que entre' : ` para llegar a un margen del ${goalPct} %`}${instrument ? ` (por ejemplo, quitando "${instrument.name}", ${fmtKg(instrument.massKg)}; menos ciencia)` : ' (estructura más liviana, baterías más chicas, menos instrumentos)'}.` });
      const ops = operationalPropellant(sc);
      const extraOffload = target;
      if (diff.propellantOffload && ops > 0 && evaluation.offloadKg + extraOffload <= ops) {
        const life = round(lifetimeAfterLoss(sc, evaluation.offloadKg + extraOffload + evaluation.gtoExtraPropKg), 1);
        out.push({ kind: 'offload', role: 'spacecraft', amountKg: extraOffload, text: `Cargar ${fmtKg(extraOffload)} menos de combustible: la nave entra, pero su vida útil baja de ${sc.designLifetimeYears} a ${life} años.` });
      }
    }
  }
  if (failed.has('fairing')) {
    const bigger = byCost.filter((e) => e.launcher.fairing.diameterM >= sc.diameterM);
    out.push({ kind: 'fairing', role: 'spacecraft', text: `Rediseñar la nave para que se pliegue más (paneles y antenas desplegables)${bigger.length ? ` o usar un lanzador con cofia más grande: ${names(bigger)}` : ''}.` });
  }
  if (failed.has('inclination')) {
    out.push({ kind: 'site', role: 'launch', text: diff.siteChoice ? 'Probar otro sitio de lanzamiento del mismo cohete, o un lanzador que despegue más cerca del ecuador (Kourou, Kwajalein).' : 'Elegir un lanzador que despegue desde un sitio con la dirección adecuada.' });
  }
  if (failed.has('budget')) {
    const cheaper = byCost.filter((e) => e.budgetAfterMUSD >= 0);
    out.push({ kind: 'budget', role: 'mission', text: `${cheaper.length ? `Opciones que sí entran en el presupuesto: ${names(cheaper)}. ` : ''}O pedir más presupuesto al rol de Misión (recortando otra área).` });
  }
  if (evaluation.date.delayMonths > 0) {
    const sooner = others.filter((e) => e.date.delayMonths < evaluation.date.delayMonths).sort((a, b) => a.date.launchMonth - b.date.launchMonth);
    if (sooner.length) out.push({ kind: 'schedule', role: 'launch', text: `Para no retrasarte: ${names(sooner)}.` });
  }
  if (evaluation.marginStatus === 'yellow' && !failed.size) {
    out.push({ kind: 'margin', role: 'spacecraft', text: 'El margen es justo: avisa al equipo de nave que cualquier aumento de peso debe consultarse contigo.' });
  }
  return out;
}

// Pedidos que el módulo deja a otros roles en el estado compartido.
export function buildRequests(evaluation, inputs) {
  const requests = [];
  const sc = inputs.spacecraft;
  if (evaluation.offloadKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'propellant-offload', amountKg: evaluation.offloadKg, text: `Lanzamiento con ${fmtKg(evaluation.offloadKg)} menos de combustible: vida útil ${evaluation.lifetimeYears} años (diseño: ${sc.designLifetimeYears}).` });
  }
  if (evaluation.marginStatus === 'yellow' || evaluation.marginStatus === 'red') {
    requests.push({ toRole: 'spacecraft', type: 'mass-cap', amountKg: Math.max(0, Math.floor(evaluation.marginKg)), text: `Margen de masa ${evaluation.marginPct} %: la nave no puede crecer más de ${fmtKg(Math.max(0, evaluation.marginKg))}.` });
  }
  if (evaluation.fixedOrbit) {
    requests.push({ toRole: 'science', type: 'orbit-change', text: `Viaje compartido: la órbita será ${evaluation.fixedOrbit.altitudeKm} km / ${evaluation.fixedOrbit.inclinationDeg}°.` });
  }
  if (evaluation.gtoExtraPropKg > 0) {
    requests.push({ toRole: 'spacecraft', type: 'extra-delta-v', amountKg: evaluation.gtoExtraPropKg, text: `La nave debe aportar ${evaluation.gtoExtraDvMs} m/s extra para llegar a GEO.` });
  }
  if (evaluation.date.delayMonths > 0) {
    requests.push({ toRole: 'mission', type: 'schedule-delay', text: `El lanzamiento sale ${evaluation.date.delayMonths} meses después de la fecha objetivo.` });
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
  const achieved = { type: inputs.orbit.type, altitudeKm: base.altitudeKm ?? null, inclinationDeg: base.inclinationDeg ?? null, note: 'Órbita según lo planeado.' };
  if (inputs.orbit.type === 'GTO') achieved.inclinationDeg = round(Math.abs(evaluation.site.latitudeDeg), 1);

  if (eventsEnabled) {
    if (p.weather != null && rng() < p.weather) {
      const days = Math.round(randBetween(ev.weather.minDays, ev.weather.maxDays));
      const cost = round(days * ev.weather.costMUSDPerDay, 2);
      delayDays += days; extraCost += cost;
      events.push({ id: 'weather', phase: 'countdown', label: ev.weather.label, consequence: `${days} días de espera en ${evaluation.site.name}: +${fmtMUSD(cost)}.`, explain: ev.weather.explain, costMUSD: cost, delayDays: days, severity: 'minor' });
    }
    if (p.minorAnomaly != null && rng() < p.minorAnomaly) {
      const a = ev.minorAnomaly;
      delayDays += a.delayDays; extraCost += a.costMUSD;
      events.push({ id: 'minorAnomaly', phase: 'countdown', label: a.label, consequence: `Se revisa el cohete: +${a.delayDays} días y +${fmtMUSD(a.costMUSD)}.`, explain: a.explain, costMUSD: a.costMUSD, delayDays: a.delayDays, severity: 'minor' });
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
        achieved.note = `La nave corrigió la órbita gastando ${dv} m/s (${fmtKg(kg)} de combustible).`;
        consequence = `Corrección de ${dv} m/s: la nave gasta ${fmtKg(kg)} de combustible.`;
      } else {
        extraLifetimeLossPct += o.noPropulsionLifetimeLossPct;
        achieved.note = 'La nave no tiene motor para corregir: se queda en esta órbita algo distinta.';
        consequence = `La nave no tiene motor para corregir: pierde ~${o.noPropulsionLifetimeLossPct} % de vida útil (la órbita decae antes o los datos son menos útiles).`;
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
      achieved.note = 'La etapa superior se apagó antes de tiempo. La nave usó gran parte de su combustible para subir a la órbita correcta.';
      events.push({ id: 'partialFailure', phase: 'insertion', label: 'Falla parcial: órbita mucho más baja', consequence: `La nave sube por sus propios medios y pierde ~${lossPct} % de vida útil.`, explain: ev.failure.explain, severity: 'major' });
    } else {
      failed = true;
      achieved.note = 'Sin motor propio, la nave no pudo subir y reingresó a la atmósfera.';
      events.push({ id: 'partialFailure', phase: 'insertion', label: 'Falla parcial: órbita demasiado baja', consequence: 'La nave no tiene motor para corregir: misión perdida.', explain: ev.failure.explain, severity: 'fatal' });
    }
  }
  if (failed && !events.some((e) => e.severity === 'fatal')) {
    const phase = FLIGHT_PHASES.find((ph) => ph.id === failurePhase);
    events.push({ id: 'failure', phase: failurePhase, label: ev.failure.label, consequence: `Falla durante "${phase.label}": la nave se pierde.`, explain: ev.failure.explain, severity: 'fatal' });
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

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

export function fmtKg(kg) {
  const value = Math.round(kg);
  return value >= 10000 ? `${(value / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} t` : `${value.toLocaleString('es')} kg`;
}

export function fmtMUSD(m) {
  if (Math.abs(m) >= 1000) return `${(m / 1000).toLocaleString('es', { maximumFractionDigits: 2 })} mil MUSD`;
  return `${m.toLocaleString('es', { maximumFractionDigits: 2 })} MUSD`;
}

export function fmtPct(fraction) {
  return `${(fraction * 100).toLocaleString('es', { maximumFractionDigits: 1 })} %`;
}
