// Flujo del lanzamiento: prepara el cohete y los imprevistos, y traduce el vuelo terminado a resultado.

import { vehicleFor, withPilotMargin, withSpacecraft, returnCraft, COAST_DV, FlightSim, programGrid, programScore, runAutopilot, missionRotationBonus, PHYS } from './flight.js';
import { planFlightEvents, resolveFlight, resolveAutomatic } from './outcome.js';
import { windowDelayRisk, windowGustEvents } from './launchWeather.js';
import { app, inputs, current, currentOutput, writeLaunch } from './store.js';
import { MISSION_COMPLETE } from '../../../src/missions/missionTransfer.js';

/** Datos de la misión que necesita el simulador. */
export function missionOptions() {
  const e = current();
  const inp = inputs();
  const dest = inp.orbit.type;
  const cal = app.data.flight.calibration[dest];
  const orbitKind = ['LEO', 'SSO'].includes(dest);
  const targetAltKm = orbitKind ? (e.fixedOrbit?.altitudeKm ?? inp.orbit.altitudeKm ?? cal.parkingAltKm) : cal.parkingAltKm;
  const lat = Math.abs(e.site.latitudeDeg);
  const incDeg = orbitKind ? (e.fixedOrbit?.inclinationDeg ?? inp.orbit.inclinationDeg ?? lat) : lat;
  return { payloadKg: e.launchMassKg, fuelFraction: app.rocketFuelPct / 100, destId: dest, targetAltKm, latDeg: lat, incDeg, v0: missionRotationBonus(dest, lat, incDeg, app.data.flight) };
}

/**
 * Arma el cohete y los imprevistos. Calcula (en pedacitos, para no trabar la pantalla) el programa de
 * ascenso del piloto automático que mejor sirve a esta misión: se usa en las pistas y en el modo fácil.
 */
export async function prepareLaunch() {
  const e = current();
  const dest = inputs().orbit.type;
  const vi = vehicleFor(e.launcherId, dest, app.data);
  // margen de combustible para pilotar a mano (más generoso en los niveles fáciles)
  if (vi) vi.vehicle = withPilotMargin(vi.vehicle, app.data.flight.calibration.pilotMargin?.[inputs().difficulty] ?? 1);
  app.vehicleInfo = vi;
  app.opts = missionOptions();
  // Ventana de lanzamiento elegida en el planificador de clima: sus condiciones influyen en el vuelo.
  //   · la probabilidad de que el clima detenga la cuenta sale del semáforo de la ventana (no del riesgo fijo del sitio);
  //   · si hay ráfagas fuertes, el cohete recibe empujones de viento mientras sube por el aire.
  const lw = app.launchWindow;
  const forEvents = lw && e.probabilities?.weather != null && windowDelayRisk(lw.status) != null
    ? { ...e, probabilities: { ...e.probabilities, weather: windowDelayRisk(lw.status) } } : e;
  app.plan = planFlightEvents(forEvents, app.data, inputs(), { seed: app.seed, eventsEnabled: app.eventsEnabled, stageCount: vi ? vi.vehicle.stages.length : 2 });
  if (lw && app.eventsEnabled) {
    let s = (app.seed * 2654435761) >>> 0;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    app.plan.flightEvents.push(...windowGustEvents(lw.conditions, rng));
  }
  app.lunar = vi ? lunarSetup(vi) : null;
  app.reference = null;
  if (!vi) return;
  const grid = programGrid(app.data.flight.calibration.searchGrid);
  const transfer = ['GTO', 'TLI', 'ESCAPE'].includes(app.opts.destId);
  // cada programa se prueba de dos formas
  // (apagar y redondear arriba, o inserción directa), siempre con la quemada final que sostiene la altura (hold)
  const list = [vi.program, ...grid].flatMap((p) => [{ ...p, hold: true }, { ...p, hold: true, coastDv: COAST_DV }]).map((p) => (transfer ? { ...p, waitWindow: true } : p));
  let best = null;
  for (let i = 0; i < list.length; i += 10) {
    for (const program of list.slice(i, i + 10)) {
      const sim = runAutopilot(vi.vehicle, { ...app.opts, events: [] }, program);
      const score = flightPlanScore(sim, app.opts);
      if (!best || score > best.score) best = { program, score, sim };
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  app.reference = { program: best.program, fuelLeftPct: best.sim.fuelLeftPct, reachedOrbit: best.sim.elements.periAlt >= PHYS.PERI_OK };
}

/** Puntaje de un plan de vuelo: primero llegar y quedar cerca de la órbita pedida; a igualdad, el que gasta menos. */
export function flightPlanScore(sim, opts) {
  const base = programScore(sim, opts);
  const transfer = ['GTO', 'TLI', 'ESCAPE'].includes(opts.destId);
  // órbitas: 1 % de combustible ≈ 2 km de error de órbita. Transferencias: sólo desempata entre planes que llegan igual.
  return base + (transfer ? Math.min(sim.fuelLeftPct, 50) * 0.001 : sim.fuelLeftPct * 2000);
}

/**
 * Misión de ida y vuelta a la Luna: al cohete se le suma la nave (módulo de servicio + cápsula con escudo y paracaídas)
 * y se coloca la Luna de modo que la ventana de salida se abra unos tres cuartos de hora después de llegar a la órbita.
 * Devuelve { vehicle, opts } o null si la misión no es de este tipo.
 */
export function lunarSetup(vi) {
  const e = current();
  const craftDef = returnCraft(inputs().spacecraft, e.offloadKg ?? 0);
  if (!craftDef) return null;
  const k = app.data.flight.calibration.pilotMargin?.[inputs().difficulty] ?? 1;
  const vehicle = withSpacecraft(vi.vehicle, craftDef, k);
  const jitter = (((app.seed * 2246822519) >>> 0) % 1000) / 1000 - 0.5;
  return { vehicle, craftDef, opts: { ...app.opts, payloadKg: craftDef.capsuleKg, craft: vehicle.craft, profile: 'lunarReturn', moon: { angle0: 2.36 + jitter * 0.5 } } };
}

export function createSim() {
  const vi = app.vehicleInfo;
  const lunar = app.lunar;
  const sim = new FlightSim(lunar ? lunar.vehicle : vi.vehicle, { ...(lunar ? lunar.opts : app.opts), events: app.plan.flightEvents });
  app.sim = sim;
  return sim;
}

/** Cierra el vuelo: calcula el resultado, lo guarda y avisa a los demás módulos. */
export function finishFlight(sim) {
  const e = current();
  if (sim) {
    if (sim.status === 'flying') sim.finish('finished');
    app.flight = resolveFlight({ sim, plan: app.plan, evaluation: e, inputs: inputs(), data: app.data, ref: app.reference, autopilotUsed: app.autopilotUsed });
  } else {
    app.flight = resolveAutomatic(e, app.data, inputs(), { seed: app.seed, eventsEnabled: app.eventsEnabled });
  }
  writeLaunch(currentOutput('lanzado'));
  if (window.parent !== window) window.parent.postMessage({ type: MISSION_COMPLETE, mission: 'launch' }, location.origin);
  return app.flight;
}

/** Otro intento: en el nivel fácil es gratis; en los demás hay que pagar otro cohete. */
export function prepareRetry() {
  const e = current();
  if (inputs().difficulty !== 'facil') app.previousAttemptsMUSD += e.totalCostMUSD;
  app.attempts += 1;
  app.flight = null;
  app.sim = null;
  app.seed = Math.floor(Math.random() * 999999) + 1;
  app.autopilotUsed = false;
}
