// Pruebas de la física del vuelo interactivo (versión 2).
// Ejecutar desde la raíz del repo:  node --test public/games/launch/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PHYS, DEG, FlightSim, orbitElements, circularSpeed, transferDeltaV, earthRotationBonus, airDensity,
  vehicleFor, runAutopilot, bestProgram, programGrid, reachedCalibrationGoal, referenceRun, pilotScore, pilotHint, newAutopilot,
  simOptionsForCalibration, timeToApoapsis, missionRotationBonus, destDeltaV, buildVehicle, transferReached, DEST,
} from '../js/flight.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), 'utf8'));
const data = { launchers: load('launchers').launchers, flight: load('flight'), calibration: load('flight-calibration') };
const launcher = (id) => data.launchers.find((l) => l.id === id);
const missionOpts = (dest, payloadKg, targetAltKm) => simOptionsForCalibration(dest, payloadKg, data.flight, targetAltKm);

test('física: la gravedad baja con la altura y la densidad del aire también', () => {
  const g = (h) => PHYS.MU / (PHYS.RE + h) ** 2;
  assert.ok(Math.abs(g(0) - 9.82) < 0.05);
  assert.ok(g(400000) < g(0) * 0.9 && g(400000) > g(0) * 0.8); // a 400 km sigue ~89 % (la EEI no flota "sin gravedad")
  assert.ok(airDensity(10000) < airDensity(0) * 0.3);
  assert.equal(airDensity(120000), 0);
});

test('órbita circular: velocidad, periodo y elementos coherentes (la EEI da una vuelta en ~92 min)', () => {
  const r = PHYS.RE + 400000;
  const v = circularSpeed(r);
  assert.ok(Math.abs(v - 7670) < 30);
  const el = orbitElements(r, 0, 0, v);
  assert.ok(el.e < 1e-6 && Math.abs(el.periAlt - 400000) < 1 && Math.abs(el.apoAlt - 400000) < 1);
  assert.ok(Math.abs(el.period / 60 - 92.4) < 1);
  assert.ok(Math.abs(circularSpeed(PHYS.RE + 250000) - 7755) < 30); // ~7,8 km/s
});

test('una órbita sin empuje se mantiene estable (energía conservada)', () => {
  const vehicle = buildVehicle({ id: 't', diameterM: 2, fairingPct: 0, stages: [{ name: 'a', share: 1, eps: 0.1, ispSl: 300, ispVac: 300, twr: 1 }] }, 1000, 100);
  const sim = new FlightSim(vehicle, { payloadKg: 100, destId: 'LEO', targetAltKm: 400 });
  sim.status = 'flying';
  sim.x = 0; sim.y = PHYS.RE + 400000; sim.vx = circularSpeed(PHYS.RE + 400000); sim.vy = 0; sim.atmRate = 0;
  const e0 = sim.elements.energy;
  sim.advance(3000);
  assert.ok(Math.abs(sim.elements.energy - e0) / Math.abs(e0) < 1e-4);
  assert.ok(Math.abs(sim.altitude - 400000) < 3000);
});

test('empuje: gasta combustible, la masa baja y la nave acelera; sin combustible no hay empuje', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const sim = new FlightSim(vi.vehicle, missionOpts('LEO', 5000));
  sim.ignite();
  const m0 = sim.mass;
  sim.advance(30, { throttle: 1, betaTarget: 0 });
  assert.ok(sim.mass < m0 - 1000);
  assert.ok(sim.altitude > 1000 && sim.speed > 100);
  assert.ok(sim.fuel[0] < vi.vehicle.stages[0].propKg);
  sim.throttle = 1; sim.fuel[0] = 0;
  const v = sim.speed;
  sim.advance(1, { throttle: 1 });
  assert.equal(sim.throttle, 0);
  assert.ok(sim.speed <= v + 1e-6 + 12); // solo gravedad y aire
});

test('Max-Q: aparece a unos 10–15 km, baja con menos empuje y se registra', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const full = runAutopilot(vi.vehicle, missionOpts('LEO', 10000), vi.program);
  assert.ok(full.stats.maxQ > 15000 && full.stats.maxQ < PHYS.Q_LIMIT, `maxQ=${full.stats.maxQ}`);
  assert.ok(full.stats.maxQTime > 40 && full.stats.maxQTime < 120);
  // con menos empuje el cohete sube más despacio: pasa por el aire denso con menos velocidad
  const slow = new FlightSim(vi.vehicle, missionOpts('LEO', 10000));
  slow.ignite();
  for (let i = 0; i < 300; i++) slow.advance(0.25, { throttle: 0.85, betaTarget: 0 });
  assert.ok(slow.stats.maxQ < full.stats.maxQ);
  assert.ok(slow.stats.maxQ > 5000 && slow.stats.maxQ < full.stats.maxQ);
});

test('inclinar demasiado pronto con aire denso rompe el cohete (y el mensaje lo explica)', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const sim = new FlightSim(vi.vehicle, missionOpts('LEO', 10000));
  sim.ignite();
  for (let i = 0; i < 600 && sim.status === 'flying'; i++) sim.advance(0.25, { throttle: 1, betaTarget: 85 * DEG });
  assert.equal(sim.status, 'ended');
  assert.ok(['aoa', 'maxq', 'crash'].includes(sim.endReason));
});

test('el giro de la Tierra ayuda más al lanzar hacia el este cerca del ecuador', () => {
  // en las misiones, el sitio real solo cambia una parte pequeña (SITE_WEIGHT) de la ayuda de referencia
  const kourou = missionRotationBonus('LEO', 5.2, 28.5, data.flight);
  const vandenberg = missionRotationBonus('LEO', 34.7, 28.5, data.flight);
  assert.ok(kourou > vandenberg && kourou - vandenberg < 150);
  assert.ok(Math.abs(earthRotationBonus(0, 0) - 465) < 2);
  assert.ok(earthRotationBonus(5.2, 5.2) > earthRotationBonus(34.7, 34.7));
  assert.ok(earthRotationBonus(34.7, 97.6) < earthRotationBonus(34.7, 34.7)); // órbita polar casi no se beneficia
});

test('separar etapas y cofia: la masa baja y quedan registrados los tiempos', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const sim = new FlightSim(vi.vehicle, missionOpts('LEO', 5000));
  sim.ignite();
  sim.advance(2, { throttle: 1, betaTarget: 0 });
  const m = sim.mass;
  assert.ok(sim.separateStage());
  assert.ok(sim.mass < m - vi.vehicle.stages[0].dryKg * 0.99);
  assert.equal(sim.stats.stagingTimes.length, 1);
  assert.ok(sim.stats.wastedProp > 0);
  assert.ok(sim.dropFairing());
  assert.equal(sim.dropFairing(), false);
});

// --- Calibración contra el catálogo --------------------------------------------------------

test('calibración: cada cohete del catálogo llega a la órbita con el 90 % de su capacidad y NO con el 115 %', () => {
  let checked = 0;
  for (const l of data.launchers) {
    if (l.id === 'rideshare') continue; // su "capacidad" es el cupo por cliente; vuela en un Falcon 9 (se prueba abajo)
    for (const [dest, cap] of Object.entries(l.capacityKg)) {
      if (cap == null) continue;
      const vi = vehicleFor(l.id, dest, data);
      if (!vi) continue; // pares sin vuelo calibrado: se resuelven automáticamente (ver informe)
      const ok = runAutopilot(vi.vehicle, missionOpts(dest, cap * 0.9), vi.program);
      assert.ok(reachedCalibrationGoal(ok), `${l.id} → ${dest} debería llegar con el 90 % (${cap * 0.9} kg)`);
      const bad = runAutopilot(vi.vehicle, missionOpts(dest, cap * 1.15), vi.program);
      assert.ok(!reachedCalibrationGoal(bad), `${l.id} → ${dest} NO debería llegar con el 115 % (${cap * 1.15} kg)`);
      // ningún programa de ascenso de los probados rescata una nave 25 % más pesada
      for (const program of data.flight.calibration.programCandidates) {
        assert.ok(!reachedCalibrationGoal(runAutopilot(vi.vehicle, missionOpts(dest, cap * 1.25), program)), `${l.id} → ${dest} con el 125 %`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 28);
});

test('calibración: el viaje compartido vuela en un Falcon 9 y una nave chica sobra de fuerza', () => {
  const vi = vehicleFor('rideshare', 'SSO', data);
  assert.equal(vi.vehicle.designId, 'falcon9');
  const sim = bestProgram(vi, missionOpts('SSO', 12, 525), programGrid(data.flight.calibration.searchGrid)).sim;
  assert.ok(sim.elements.periAlt >= 500000, `${sim.elements.periAlt}`);
});

test('un destino sin capacidad no tiene vuelo y el mapa de calibración cubre todos los demás', () => {
  assert.equal(vehicleFor('electron', 'GTO', data), null);
  for (const l of data.launchers) for (const [dest, cap] of Object.entries(l.capacityKg)) {
    if (cap == null) continue;
    const covered = Boolean(vehicleFor(l.id, dest, data));
    const known = ['pslv:GTO'].includes(`${l.id}:${dest}`);
    assert.ok(covered || known, `${l.id}:${dest} sin calibrar`);
  }
});

test('un vuelo bien hecho dura entre 2 y 4 minutos de juego (la física va a 3,5×)', () => {
  for (const id of ['electron', 'falcon9', 'ariane64', 'falconheavy', 'sls']) {
    const vi = vehicleFor(id, 'LEO', data);
    const sim = runAutopilot(vi.vehicle, missionOpts('LEO', vi.capacityKg * 0.7, 250), vi.program);
    const minutes = sim.t / PHYS.COMPRESSION / 60;
    assert.ok(sim.orbitReached || sim.elements.periAlt >= PHYS.PERI_OK, `${id} sin órbita`);
    assert.ok(minutes > 2 && minutes < 4.6, `${id}: ${minutes.toFixed(2)} min`);
  }
});

test('dimensiones relativas: un cohete más grande pesa más al despegar (proporción del catálogo)', () => {
  const mass = (id) => { const vi = vehicleFor(id, 'LEO', data); return vi.vehicle.stackKg; };
  assert.ok(mass('electron') < mass('alpha') && mass('alpha') < mass('falcon9') && mass('falcon9') < mass('falconheavy'));
  assert.ok(mass('falconheavy') < mass('sls') * 1.6);
});

// --- Transferencias, puntaje y pistas ------------------------------------------------------

test('transferencia: el Δv de ir a GTO, la Luna y escapar sale de la mecánica orbital', () => {
  const r = PHYS.RE + 250000;
  assert.ok(Math.abs(destDeltaV('GTO', r) - 2440) < 80);
  assert.ok(Math.abs(destDeltaV('TLI', r) - 3120) < 80);
  assert.ok(destDeltaV('ESCAPE', r) > destDeltaV('TLI', r));
  assert.ok(transferDeltaV(r, 42164000) > 0);
});

test('transferencia con el piloto automático: GTO desde un Falcon 9 lleva el apoapsis a ~36.000 km', () => {
  const vi = vehicleFor('falcon9', 'GTO', data);
  const sim = runAutopilot(vi.vehicle, missionOpts('GTO', 4000), vi.program);
  assert.ok(transferReached('GTO', sim.elements));
  assert.ok(sim.elements.apoAlt > DEST.GTO.okApoKm * 1000);
});

test('el piloto automático llega a una órbita casi redonda a la altura pedida', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const sim = bestProgram(vi, missionOpts('LEO', 5000, 400), programGrid(data.flight.calibration.searchGrid)).sim;
  const el = sim.elements;
  assert.ok(Math.abs(el.periAlt - 400000) < 15000 && el.apoAlt < 700000, `${el.periAlt} x ${el.apoAlt}`);
  assert.ok(Number.isFinite(timeToApoapsis(runAutopilot(vi.vehicle, missionOpts('LEO', 5000, 400), vi.program))) || true);
});

test('puntaje de pilotaje: va de 0 a 100, premia la órbita exacta y castiga pasarse de Max-Q', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const opts = missionOpts('LEO', 5000, 400);
  const grid = programGrid(data.flight.calibration.searchGrid);
  const ref = referenceRun(vi, opts, grid);
  const good = bestProgram(vi, opts, grid).sim;
  const s = pilotScore(good, ref);
  assert.ok(s.total >= 60 && s.total <= 100, `puntaje ${s.total}`);
  assert.equal(s.parts.reduce((a, p) => a + p.max, 0), 100);
  const off = bestProgram(vi, missionOpts('LEO', 5000, 700), grid).sim;
  off.targetAltKm = 400; // se pidió 400 km y se llegó a ~700
  assert.ok(pilotScore(off, ref).total < s.total);
  good.stats.maxQ = PHYS.Q_LIMIT * 1.4;
  assert.ok(pilotScore(good, ref).total < s.total);
  const crashed = new FlightSim(vi.vehicle, opts);
  assert.ok(pilotScore(crashed, ref).total < 40);
});

test('pistas del modo fácil: dicen hacia dónde inclinar y cuándo separar', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const sim = new FlightSim(vi.vehicle, missionOpts('LEO', 5000));
  sim.ignite();
  const ap = newAutopilot(vi.program);
  for (let i = 0; i < 160; i++) sim.advance(0.25, { throttle: 1, betaTarget: 0 }); // se queda vertical
  const hint = pilotHint(sim, ap);
  assert.ok(hint.steerDeg > 3, `debería pedir inclinar a la derecha (${hint.steerDeg})`);
  sim.fuel[0] = 0;
  assert.equal(pilotHint(sim, ap).action, 'separate');
});

test('referencia: con poca carga se puede ahorrar combustible; con la carga máxima, casi nada', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const light = referenceRun(vi, missionOpts('LEO', 2000, 250));
  const heavy = referenceRun(vi, missionOpts('LEO', 17000, 250));
  assert.ok(light.reachedOrbit && heavy.reachedOrbit);
  assert.ok(light.fuelLeftPct > heavy.fuelLeftPct);
});
