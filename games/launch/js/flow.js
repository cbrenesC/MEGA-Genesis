// Flujo del lanzamiento: prepara el cohete y los imprevistos, y traduce el vuelo terminado a resultado.

import { vehicleFor, FlightSim, programGrid, programScore, runAutopilot, missionRotationBonus, PHYS } from './flight.js';
import { planFlightEvents, resolveFlight, resolveAutomatic } from './outcome.js';
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
  app.vehicleInfo = vi;
  app.opts = missionOptions();
  app.plan = planFlightEvents(e, app.data, inputs(), { seed: app.seed, eventsEnabled: app.eventsEnabled, stageCount: vi ? vi.vehicle.stages.length : 2 });
  app.reference = null;
  if (!vi) return;
  const grid = programGrid(app.data.flight.calibration.searchGrid);
  const transfer = ['GTO', 'TLI', 'ESCAPE'].includes(app.opts.destId);
  const list = [vi.program, ...grid].map((p) => (transfer ? { ...p, waitWindow: true } : p));
  let best = null;
  for (let i = 0; i < list.length; i += 10) {
    for (const program of list.slice(i, i + 10)) {
      const sim = runAutopilot(vi.vehicle, { ...app.opts, events: [] }, program);
      const score = programScore(sim, app.opts);
      if (!best || score > best.score) best = { program, score, sim };
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  app.reference = { program: best.program, fuelLeftPct: best.sim.fuelLeftPct, reachedOrbit: best.sim.elements.periAlt >= PHYS.PERI_OK };
}

export function createSim() {
  const vi = app.vehicleInfo;
  const sim = new FlightSim(vi.vehicle, { ...app.opts, events: app.plan.flightEvents });
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
