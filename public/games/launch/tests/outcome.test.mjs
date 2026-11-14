// Pruebas del puente entre el vuelo interactivo y las reglas del juego (resultado, eventos, contrato v2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluateLauncher } from '../js/rules.js';
import { FlightSim, vehicleFor, runAutopilot, referenceRun, bestProgram, programGrid, PHYS } from '../js/flight.js';
import { planFlightEvents, resolveFlight, resolveAutomatic, hohmannDv } from '../js/outcome.js';
import { buildLaunchOutput, SCHEMA_VERSION } from '../js/state.js';
import { massLike, speedLike, costLike, oneInN, fmtMUSD, fmtKg } from '../js/plain.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), 'utf8'));
const data = {
  launchers: load('launchers').launchers, sites: load('sites').sites, orbits: load('orbits').orbits, rules: load('rules'),
  flight: load('flight'), calibration: load('flight-calibration'), glossary: load('glossary').terms, facts: load('facts').facts,
};
const scenarios = load('mock-missions').scenarios;
const inputsFor = (id, difficulty = 'normal') => {
  const s = structuredClone(scenarios.find((x) => x.id === id));
  return { difficulty, spacecraft: s.spacecraft, orbit: s.orbit, budget: s.budget, schedule: s.schedule };
};
const setup = (scenario, launcherId, difficulty = 'normal') => {
  const inputs = inputsFor(scenario, difficulty);
  const evaluation = evaluateLauncher(data.launchers.find((l) => l.id === launcherId), data, inputs);
  const vi = vehicleFor(launcherId, inputs.orbit.type, data);
  const opts = { payloadKg: evaluation.launchMassKg, destId: inputs.orbit.type, targetAltKm: inputs.orbit.altitudeKm ?? 400, latDeg: evaluation.site.latitudeDeg, incDeg: inputs.orbit.inclinationDeg ?? evaluation.site.latitudeDeg, events: [] };
  return { inputs, evaluation, vi, opts };
};

test('eventos del vuelo: misma semilla = mismos imprevistos; sin eventos no hay nada', () => {
  const { inputs, evaluation } = setup('smallsat', 'alpha');
  const a = planFlightEvents(evaluation, data, inputs, { seed: 7, stageCount: 2 });
  const b = planFlightEvents(evaluation, data, inputs, { seed: 7, stageCount: 2 });
  assert.deepEqual(a, b);
  const off = planFlightEvents(evaluation, data, inputs, { seed: 7, eventsEnabled: false });
  assert.equal(off.pre.length + off.flightEvents.length, 0);
  // con muchas semillas aparecen todos los tipos en un cohete poco confiable (Alpha)
  const kinds = new Set();
  for (let seed = 1; seed < 400; seed++) for (const e of planFlightEvents(evaluation, data, inputs, { seed }).flightEvents) kinds.add(e.kind);
  assert.deepEqual([...kinds].sort(), ['engineOut', 'fatal', 'gust']);
});

test('la frecuencia de fallas graves sigue a la confiabilidad (Falcon 9 casi nunca, Alpha seguido)', () => {
  const count = (launcherId) => {
    const { inputs, evaluation } = setup('smallsat', launcherId);
    let fails = 0;
    for (let seed = 1; seed <= 1000; seed++) if (planFlightEvents(evaluation, data, inputs, { seed }).flightEvents.some((e) => e.kind === 'fatal')) fails++;
    return fails;
  };
  assert.ok(count('falcon9') < 30);
  assert.ok(count('alpha') > 150);
});

test('vuelo bien hecho: éxito, órbita lograda y puntaje alto', () => {
  const { inputs, evaluation, vi, opts } = setup('oceans', 'falcon9');
  const plan = planFlightEvents(evaluation, data, inputs, { seed: 1, eventsEnabled: false });
  const grid = programGrid(data.flight.calibration.searchGrid);
  const sim = bestProgram(vi, opts, grid).sim;
  const r = resolveFlight({ sim, plan, evaluation, inputs, data, ref: referenceRun(vi, opts, grid) });
  assert.equal(r.result, 'exito', JSON.stringify(r.story));
  assert.ok(r.achievedOrbit.periapsisKm > 600);
  assert.ok(r.flightData.pilotScore >= 60, `puntaje ${r.flightData.pilotScore}`);
  assert.ok(r.flightData.durationSeconds > 120 && r.flightData.durationSeconds < 480);
  assert.ok(r.story.length > 0);
});

test('una falla grave programada destruye el cohete con una explicación', () => {
  const { inputs, evaluation, vi, opts } = setup('smallsat', 'falcon9');
  const plan = { pre: [], seed: 3, eventsEnabled: true, flightEvents: [{ kind: 'fatal', stage: 0, frac: 0.3, text: 'Falla', meta: { id: 'failure', phase: 'maxq', label: 'Falla del cohete', severity: 'fatal', explain: 'x', where: 'en Max-Q' } }] };
  const sim = new FlightSim(vi.vehicle, { ...opts, events: plan.flightEvents });
  sim.ignite();
  for (let i = 0; i < 2000 && sim.status === 'flying'; i++) sim.advance(0.25, { throttle: 1, betaTarget: Math.min(60, i / 2) * Math.PI / 180 });
  const r = resolveFlight({ sim, plan, evaluation, inputs, data });
  assert.equal(r.result, 'falla');
  assert.equal(r.lifetimeYears, 0);
  assert.ok(r.events.some((e) => e.id === 'failure' && e.explain));
});

test('quedarse sin llegar a la órbita es una falla que explica el punto más bajo', () => {
  const { inputs, evaluation, vi, opts } = setup('smallsat', 'falcon9');
  const plan = { pre: [], seed: 1, eventsEnabled: true, flightEvents: [] };
  const sim = new FlightSim(vi.vehicle, opts);
  sim.ignite();
  for (let i = 0; i < 200; i++) sim.advance(0.25, { throttle: 1, betaTarget: 0 });
  sim.finish('finished');
  const r = resolveFlight({ sim, plan, evaluation, inputs, data });
  assert.equal(r.result, 'falla');
  assert.ok(r.events.some((e) => e.id === 'noOrbit' || e.id === 'crash'));
});

test('el pilotaje cuenta: una órbita muy corrida baja la vida útil y deja un éxito parcial', () => {
  const { inputs, evaluation, vi, opts } = setup('smallsat', 'falcon9');
  const plan = { pre: [], seed: 1, eventsEnabled: true, flightEvents: [] };
  const lowTarget = runAutopilot(vi.vehicle, { ...opts, targetAltKm: 180 }, vi.program); // órbita de 180 km en vez de 550
  const r = resolveFlight({ sim: lowTarget, plan, evaluation, inputs, data, ref: referenceRun(vi, opts) });
  assert.ok(r.lifetimeYears < evaluation.lifetimeYears);
  assert.ok(r.flightData.pilotScore < 80);
  assert.ok(['exito_parcial', 'exito'].includes(r.result));
  assert.ok(hohmannDv(PHYS.RE + 180e3, PHYS.RE + 550e3) > 150);
});

test('los eventos de la plataforma se cobran: el clima suma dinero y días', () => {
  const { inputs, evaluation, vi, opts } = setup('smallsat', 'falcon9');
  const plan = { pre: [{ id: 'weather', phase: 'countdown', label: 'Clima', consequence: 'x', explain: 'y', costMUSD: 0.45, delayDays: 3, severity: 'minor' }], seed: 1, eventsEnabled: true, flightEvents: [] };
  const sim = runAutopilot(vi.vehicle, opts, vi.program);
  const r = resolveFlight({ sim, plan, evaluation, inputs, data, ref: referenceRun(vi, opts) });
  assert.equal(r.extraCostMUSD, 0.45);
  assert.equal(r.delayDays, 3);
});

test('par sin vuelo calibrado: se resuelve con las reglas del catálogo y se marca como automático', () => {
  const { inputs, evaluation } = setup('geo', 'pslv', 'dificil');
  const r = resolveAutomatic(evaluation, data, inputs, { seed: 5, eventsEnabled: false });
  assert.equal(r.automatic, true);
  assert.equal(r.result, 'exito');
});

test('contrato de salida v2: schemaVersion 2, conserva los campos de la v1 y agrega `flight`', () => {
  const { inputs, evaluation, vi, opts } = setup('smallsat', 'falcon9');
  const plan = planFlightEvents(evaluation, data, inputs, { seed: 1, eventsEnabled: false });
  const sim = runAutopilot(vi.vehicle, opts, vi.program);
  const flight = resolveFlight({ sim, plan, evaluation, inputs, data, ref: referenceRun(vi, opts) });
  const out = buildLaunchOutput({ status: 'lanzado', inputs, sources: {}, evaluation, flight, eventsEnabled: false });
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(out.schemaVersion, 2);
  for (const key of ['module', 'status', 'difficulty', 'launcher', 'site', 'cost', 'budgetAfterMUSD', 'mass', 'schedule', 'targetOrbit', 'achievedOrbit', 'result', 'lifetimeYears', 'events', 'seed', 'requests', 'teamReview']) assert.ok(key in out, `falta ${key}`);
  for (const key of ['maxAltitudeKm', 'apoapsisKm', 'periapsisKm', 'fuelLeftPct', 'stagingTimes', 'pilotScore']) assert.ok(key in out.flight, `falta flight.${key}`);
  assert.doesNotThrow(() => JSON.stringify(out));
  const before = buildLaunchOutput({ status: 'seleccionado', inputs, sources: {}, evaluation });
  assert.equal(before.flight, null);
});

// --- Lenguaje para secundaria ---------------------------------------------------------------

test('comparaciones cotidianas: masa, velocidad y costo', () => {
  assert.match(massLike(950), /carro pequeño/);
  assert.match(massLike(60000), /buses escolares/);
  assert.match(speedLike(7.8), /Costa Rica.*58 segundos/);
  assert.match(costLike(75), /300 casas/);
  assert.equal(oneInN(0.1), '1 de cada 10');
  assert.match(fmtMUSD(2200), /mil millones/);
  assert.equal(fmtKg(63800), '63,8 toneladas');
});

test('textos: sin fórmulas ni siglas sueltas en el detalle principal y con términos explicados', () => {
  const { inputs } = setup('smallsat', 'falcon9');
  for (const launcher of data.launchers) {
    const e = evaluateLauncher(launcher, data, inputs);
    for (const c of e.checks) {
      assert.ok(!/Δv|ΔV|Δi|=\s*\d/.test(c.detail), `${launcher.id}/${c.id}: fórmula en el detalle: ${c.detail}`);
      assert.ok(!/\br = |sen\(|e\^/.test(c.detail + c.why), `${launcher.id}/${c.id}: fórmula en la pantalla principal`);
      assert.ok(!/\bapoapsis\b/i.test(c.detail) || /punto más alto/i.test(c.detail), `${c.id}: usa apoapsis sin explicarlo`);
      assert.ok(c.why.split(/[.!?]\s/).length <= 4, `${launcher.id}/${c.id}: explicación muy larga`);
    }
  }
  for (const [id, t] of Object.entries(data.glossary)) {
    assert.ok(t.text.split(/[.!?]\s/).length <= 4, `glosario ${id} muy largo`);
    assert.ok(t.more, `glosario ${id} sin "Ver más"`);
  }
  assert.ok(data.facts.length >= 3 && data.facts.length <= 6);
});
