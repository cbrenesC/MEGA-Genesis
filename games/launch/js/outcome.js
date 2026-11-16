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
  liftoff: { stage: 0, frac: 0.04, label: 'justo después de despegar' },
  maxq: { stage: 0, frac: 0.3, label: 'en el momento de más presión del aire (Max-Q)' },
  staging: { stage: 0, frac: 0.96, label: 'al separar la primera etapa' },
  fairing: { stage: 1, frac: 0.15, label: 'al soltar la punta (cofia)' },
  insertion: { stage: 99, frac: 0.6, label: 'cuando ya casi llegabas a la órbita' },
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
      pre.push({ id: 'weather', phase: 'countdown', label: ev.weather.label, consequence: `Hubo mal clima en ${evaluation.site.name}: esperaron ${days} días y costó ${fmtMUSD(cost)} más.`, explain: ev.weather.explain, costMUSD: cost, delayDays: days, severity: 'minor' });
    }
    if (p.minorAnomaly != null && rng() < p.minorAnomaly) {
      const a = ev.minorAnomaly;
      pre.push({ id: 'minorAnomaly', phase: 'countdown', label: a.label, consequence: `Revisaron el cohete: ${a.delayDays} días de retraso y ${fmtMUSD(a.costMUSD)} más.`, explain: a.explain, costMUSD: a.costMUSD, delayDays: a.delayDays, severity: 'minor' });
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
        flightEvents.push({ kind: 'fatal', stage: Math.min(fp.stage, stageCount - 1), frac: fp.frac, text: `Falla del cohete ${fp.label}: se perdió la señal.`,
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
    if (fe.kind === 'gust') consequence = `Una ráfaga te empujó ${Math.abs(fe.deg)}° ${fe.deg > 0 ? 'a la derecha' : 'a la izquierda'}. Había que corregir la inclinación.`;
    else if (fe.kind === 'engineOut') consequence = `Un motor de la etapa ${fe.stage + 1} empujó solo ${Math.round(fe.thrustMult * 100)} % durante el resto de su quemada.`;
    else consequence = `El cohete falló ${m.where}: la nave se perdió.`;
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
      'crash-moon': () => ({ id: 'crash', phase: 'insertion', label: 'La nave chocó contra la Luna', consequence: 'Su trayectoria pasaba por debajo de la superficie lunar.', explain: 'Al llegar a la Luna hay que pasar por encima de sus montañas y frenar justo en el punto más bajo. Con una corrección de rumbo a mitad de camino se sube ese punto.', severity: 'fatal' }),
      burn: () => ({ id: 'reentry', phase: 'insertion', label: 'La nave se quemó en la reentrada', consequence: sim.capsuleOnly ? 'El escudo térmico se gastó: la entrada fue tan rasante que la cápsula rebotó y pasó demasiado tiempo en el aire caliente.' : 'Entró al aire con el módulo de servicio todavía puesto: el escudo térmico quedó tapado.', explain: 'Al volver de la Luna la cápsula entra al aire a 11 km/s (40.000 km/h). El aire se comprime delante y se calienta más que la superficie del Sol; sólo el escudo térmico, puesto por delante, lo aguanta.', severity: 'fatal' }),
      gforce: () => ({ id: 'reentry', phase: 'insertion', label: 'La cápsula entró demasiado empinada', consequence: `Frenó con más de ${Math.round(sim.craft?.gBreak ?? 20)} veces la gravedad y no aguantó.`, explain: 'Si la cápsula entra muy de punta, el aire denso la frena de golpe. El punto más bajo de la trayectoria tiene que quedar a unos 60 km de altura: así el frenado dura varios minutos y es soportable.', severity: 'fatal' }),
      failure: () => null, // ya está en los eventos
      maxq: () => ({ id: 'structural', phase: 'maxq', label: 'El cohete se rompió por la presión del aire (Max-Q)', consequence: 'Pasaste el límite de presión del aire y la estructura no aguantó.', explain: 'Cerca del primer minuto el aire todavía es denso y el cohete ya va muy rápido. Bajar un poco el empuje en ese momento lo cuida.', severity: 'fatal' }),
      aoa: () => ({ id: 'structural', phase: 'maxq', label: 'El cohete se partió al girar de lado', consequence: 'Inclinaste muy rápido con el aire denso: el viento de costado lo partió.', explain: 'Cuando el aire es denso, el cohete tiene que ir casi derecho. Inclina de a poquito y deja que la gravedad haga el giro.', severity: 'fatal' }),
      crash: () => (afterEntry
        ? { id: 'crash', phase: 'insertion', label: 'La cápsula llegó demasiado rápido a la superficie', consequence: sim.chute?.torn ? 'Los paracaídas se abrieron cuando la cápsula todavía iba muy rápido y se rompieron.' : sim.chute ? 'Los paracaídas se abrieron demasiado tarde y no alcanzaron a frenarla.' : 'No se abrieron los paracaídas.', explain: 'El aire frena la cápsula hasta unos 100 m/s. Para tocar el agua a 9 m/s hacen falta los paracaídas, abiertos por debajo de 7 km de altura y cuando la cápsula ya va despacio.', severity: 'fatal' }
        : { id: 'crash', phase: 'insertion', label: 'El cohete volvió a caer', consequence: 'No alcanzó la velocidad lateral para quedarse en órbita y cayó.', explain: 'Para quedarte en órbita no basta con subir: tienes que ir de lado a unos 7,8 km/s. Si el cohete solo sube, vuelve a caer.', severity: 'fatal' }),
    };
    const extra = reasons[sim.endReason]?.();
    if (extra) events.push(extra);
    story.push(sim.log.at(-1)?.text ?? 'El cohete se perdió.');
    return { ...base, result: 'falla', headline: lunar && sim.mission.leo ? 'La nave se perdió' : 'El cohete se perdió', achievedOrbit: lunar ? lunarAchieved(sim) : null, lifetimeYears: 0, story, failureKind: sim.endReason };
  }
  if (lunar && sim.mission.leo) return resolveLunar({ sim, base, events, story, sc });

  // --- el cohete sobrevivió: ¿llegó a la órbita?
  const parkingOk = el.periAlt >= PHYS.PERI_OK;
  if (!parkingOk) {
    events.push({ id: 'noOrbit', phase: 'insertion', label: 'No llegaste a la órbita', consequence: periKm < 0 ? `Tu punto más bajo quedó ${Math.abs(Math.round(periKm)).toLocaleString('es')} km por debajo del suelo: la trayectoria choca con la Tierra.` : `Tu punto más bajo quedó en ${Math.round(periKm)} km: dentro del aire. La nave va a caer.`,
      explain: 'Para quedarte en órbita, el punto más bajo (periapsis) tiene que quedar sobre la atmósfera, a más de unos 150 km. Para eso hay que acelerar de lado, no solo subir.', severity: 'fatal' });
    story.push(periKm < 0 ? `Tu punto más bajo quedó ${Math.abs(Math.round(periKm)).toLocaleString('es')} km por debajo del suelo: tu trayectoria choca con la Tierra. Faltó acelerar de lado.` : `Tu punto más bajo quedó en ${Math.round(periKm)} km, dentro del aire. La nave no se quedó en órbita.`);
    return { ...base, result: 'falla', headline: 'No llegaste a la órbita', achievedOrbit: null, lifetimeYears: 0, story, failureKind: 'no-orbit' };
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

  if (d.kind === 'transfer') {
    const reached = transferReached(destId, el);
    const win = windowErrorDeg(sim);
    const winOk = win == null || win <= d.windowTolDeg; // sin encendido propio (la ascensión ya alcanzó la energía) no hay ventana que fallar
    if (reached && winOk) {
      achieved = { type: destId, altitudeKm: null, inclinationDeg: incl, note: `Hiciste el encendido de transferencia en el momento justo: ${d.label}.` };
      headline = '¡Transferencia perfecta!';
      story.push(`Encendiste el motor a solo ${Math.round(win)}° del punto ideal y tomaste ${d.label}.`);
    } else if (reached) {
      const dvFix = 350;
      const kg = hasEngine ? propellantForDeltaV(launchMass, dvFix, sc.ispS, rules.physics.g0) : 0;
      if (hasEngine) lostPropKg += kg; else extraLossPct += 30;
      achieved = { type: destId, altitudeKm: null, inclinationDeg: incl, note: `Tuviste la fuerza, pero encendiste a ${Math.round(win ?? 0)}° de la ventana: la nave tuvo que corregir el rumbo con su propio motor.` };
      headline = 'Encendiste fuera de la ventana';
      story.push(`Encendiste ${Math.round(win ?? 0)}° lejos del punto ideal. La nave corrige el rumbo con su propio motor (unos ${dvFix} m/s) y gasta ${fmtKg(kg)} de combustible.`);
      events.push({ id: 'missedWindow', phase: 'insertion', label: 'Encendido fuera de la ventana', consequence: `La nave tiene que corregir el rumbo y gasta combustible propio (${fmtKg(kg)}).`, explain: 'El mejor momento para salir de la órbita depende de dónde está tu destino. Si te adelantas o te atrasas, hay que corregir después, y eso gasta combustible.', severity: 'moderate' });
    } else {
      // se quedó en la órbita de espera: la nave debe hacer el resto con su motor
      const dvRest = destDeltaV(destId, el.r);
      const kg = hasEngine ? propellantForDeltaV(launchMass, dvRest, sc.ispS, rules.physics.g0) : Infinity;
      if (!hasEngine || kg > ops) {
        events.push({ id: 'noTransfer', phase: 'insertion', label: 'No hiciste la transferencia', consequence: 'Te quedaste en la órbita baja y la nave no tiene combustible para hacer el resto del viaje.', explain: 'Para ir a la Luna o a otro planeta hace falta un empujón grande desde la órbita baja. Sin él, la nave se queda cerca de la Tierra.', severity: 'fatal' });
        story.push('Te quedaste en la órbita de espera y la nave no puede hacer sola el resto del camino.');
        return { ...base, result: 'falla', headline: 'No saliste de la órbita baja', achievedOrbit: { type: 'LEO', altitudeKm: Math.round((periKm + (Number.isFinite(apoKm) ? apoKm : periKm)) / 2), inclinationDeg: incl, note: 'Órbita de espera.' }, lifetimeYears: 0, story, failureKind: 'no-transfer' };
      }
      lostPropKg += kg;
      achieved = { type: 'LEO', altitudeKm: Math.round((periKm + (Number.isFinite(apoKm) ? apoKm : periKm)) / 2), inclinationDeg: incl, note: 'Te quedaste en la órbita de espera: la nave hace sola el resto del viaje.' };
      headline = 'Te quedaste en la órbita de espera';
      story.push(`No completaste la transferencia. La nave termina el viaje con su motor y gasta ${fmtKg(kg)} de combustible.`);
      events.push({ id: 'partialTransfer', phase: 'insertion', label: 'Transferencia incompleta', consequence: `La nave gasta ${fmtKg(kg)} de combustible para llegar sola.`, explain: 'Cada kilogramo de combustible que usa la nave para llegar es uno que ya no sirve para alargar su vida.', severity: 'major' });
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
        ? (hasEngine ? `Tu órbita quedó en ${Math.round(periKm)} × ${Math.round(apoKm)} km. La nave la corrige con su motor y gasta ${fmtKg(kg)} de combustible.` : `Tu órbita quedó en ${Math.round(periKm)} × ${Math.round(apoKm)} km y la nave no tiene motor para corregirla.`)
        : `Llegaste a la órbita que querías: ${Math.round(periKm)} × ${Math.round(apoKm)} km.` };
    headline = dvFix > 15 ? 'Llegaste a la órbita, un poco corrida' : '¡Órbita casi perfecta!';
    story.push(`Tu órbita quedó en ${Math.round(periKm)} km (punto más bajo) × ${Math.round(apoKm)} km (punto más alto). Querías ${targetKm} km.`);
    if (dvFix > 15 && hasEngine) story.push(`Corregirla cuesta unos ${Math.round(dvFix)} m/s de la nave, es decir ${fmtKg(kg)} de combustible que ya no servirá para alargar su vida.`);
    if (dvFix > 15 && !hasEngine) story.push('Como la nave no tiene motor, se queda en esa órbita y pierde parte de su vida útil.');
  }

  let lifetime = lifetimeAfterLoss(sc, lostPropKg) * (1 - extraLossPct / 100);
  lifetime = round(lifetime, 1);
  const planned = evaluation.lifetimeYears;
  const lossPct = planned > 0 ? ((planned - lifetime) / planned) * 100 : 0;
  const partialEvent = events.some((e) => e.id === 'partialFailure');
  const result = lossPct >= rules.outcome.partialIfLifetimeLossPct || partialEvent && lossPct > 5 ? 'exito_parcial' : 'exito';
  if (partialEvent) story.push('El motor que perdió fuerza obligó a gastar más combustible, y se nota en la órbita.');
  if (result === 'exito_parcial' && lossPct >= rules.outcome.partialIfLifetimeLossPct) story.push(`La nave vivirá ${lifetime} años en vez de ${planned} (pierde ${Math.round(lossPct)} %).`);
  return { ...base, result, headline: result === 'exito' && headline.startsWith('Llegaste') ? '¡Llegaste a la órbita!' : headline, achievedOrbit: achieved, lifetimeYears: lifetime, story, lossPct: round(lossPct, 0) };
}

// ---------------------------------------------------------------------------
// Misión lunar de ida y vuelta
// ---------------------------------------------------------------------------

const lunarAchieved = (sim) => {
  const o = sim.mission?.bestOrbit;
  return o ? { type: 'LUNA', periapsisKm: Math.round(o.periKm), apoapsisKm: Math.round(o.apoKm), altitudeKm: Math.round((o.periKm + o.apoKm) / 2), inclinationDeg: null, note: 'Órbita alrededor de la Luna.' } : null;
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
  story.push(`El viaje duró ${base.flightData.lunar.days.toLocaleString('es')} días.`);
  if (m.bestOrbit) story.push(`Estuviste en órbita lunar de ${km(m.bestOrbit.periKm)} × ${km(m.bestOrbit.apoKm)} km y diste ${m.lunarRevs.toLocaleString('es', { maximumFractionDigits: 1 })} vueltas a la Luna.`);
  else if (m.soi) story.push(`Pasaste a ${km(m.minMoonAlt / 1000)} km de la Luna.`);
  if (sim.landing) {
    const gLim = sim.craft?.gLimit ?? 9;
    story.push(`La cápsula entró al aire a ${(st.entrySpeed / 1000).toLocaleString('es', { maximumFractionDigits: 1 })} km/s, soportó ${st.maxG.toLocaleString('es', { maximumFractionDigits: 1 })} veces la gravedad, gastó ${Math.round((1 - sim.heat.shieldLeft) * 100)} % del escudo térmico y tocó la superficie a ${sim.landing.speed.toLocaleString('es', { maximumFractionDigits: 1 })} m/s.`);
    const rough = st.maxG > gLim + 4;
    if (st.maxG > gLim) events.push({ id: 'highG', phase: 'insertion', label: 'Reentrada muy brusca', consequence: `La tripulación soportó ${st.maxG.toFixed(1)} veces la gravedad (lo cómodo es menos de ${gLim}).`, explain: 'Mientras más empinada entra la cápsula, más de golpe la frena el aire. Con una corrección de rumbo en el viaje de vuelta se elige un ángulo más suave.', severity: rough ? 'major' : 'moderate' });
    if (m.lunarOrbit && !rough) return { ...base, result: 'exito', headline: '¡Misión cumplida: fuiste a la Luna y volviste!', achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    if (m.lunarOrbit) return { ...base, result: 'exito_parcial', headline: 'Fuiste a la Luna y volviste, pero la reentrada fue muy brusca', achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    if (m.soi) {
      events.push({ id: 'flyby', phase: 'insertion', label: 'Sobrevuelo de la Luna sin entrar en órbita', consequence: 'La nave rodeó la Luna y volvió, pero no frenó para quedarse dando vueltas.', explain: 'Para quedar en órbita lunar hay que frenar justo al pasar por el punto más cercano a la Luna. Así volvió a casa la tripulación del Apolo 13, que tuvo que cancelar su alunizaje.', severity: 'major' });
      return { ...base, result: 'exito_parcial', headline: 'Rodeaste la Luna y volviste a salvo, sin entrar en órbita', achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
    }
    events.push({ id: 'noMoon', phase: 'insertion', label: 'La nave no llegó a la Luna', consequence: 'La cápsula volvió a salvo desde la órbita de la Tierra.', explain: 'Para ir a la Luna hace falta la inyección translunar: un encendido largo en el momento en que la Luna está en el lugar correcto.', severity: 'major' });
    return { ...base, result: 'exito_parcial', headline: 'La cápsula volvió a salvo, pero no llegó a la Luna', achievedOrbit, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
  }
  // el vuelo terminó con la nave todavía en el espacio
  const where = sim.body === 'moon' ? (m.lunarOrbit ? 'en órbita alrededor de la Luna' : 'cerca de la Luna') : m.left ? 'en el camino de vuelta' : m.tli ? 'en el camino hacia la Luna' : 'en órbita alrededor de la Tierra';
  events.push({ id: 'notBack', phase: 'insertion', label: 'La nave no volvió a la Tierra', consequence: `El vuelo terminó con la nave ${where}.`, explain: 'Una misión con tripulación no termina al llegar: termina cuando la cápsula está de vuelta en el agua. Faltaron la inyección de regreso, la reentrada y los paracaídas.', severity: m.tli ? 'fatal' : 'major' });
  story.push(`El vuelo terminó con la nave ${where}.`);
  if (!m.tli) return { ...base, result: 'exito_parcial', headline: 'Te quedaste en la órbita de la Tierra', achievedOrbit: { type: 'LEO', altitudeKm: Math.round((m.parking.periKm + m.parking.apoKm) / 2), inclinationDeg: null, note: 'Órbita de espera.' }, lifetimeYears: sc.designLifetimeYears, story, lossPct: 0 };
  return { ...base, result: 'falla', headline: 'La nave no volvió a casa', achievedOrbit, lifetimeYears: 0, story, failureKind: 'not-back' };
}

/** Cuando un par cohete-destino no tiene vuelo calibrado, el resultado se calcula con las reglas del catálogo. */
export function resolveAutomatic(evaluation, data, inputs, { seed = 1, eventsEnabled = true } = {}) {
  const r = simulateLaunch(evaluation, data, inputs, { seed, eventsEnabled });
  return {
    ...r,
    headline: r.result === 'exito' ? '¡Llegaste a la órbita!' : r.result === 'exito_parcial' ? 'Llegaste, pero algo no salió perfecto' : 'El cohete se perdió',
    story: r.events.map((e) => e.consequence),
    flightData: null,
    pilot: null,
    automatic: true,
  };
}
