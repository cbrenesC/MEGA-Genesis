// Pruebas del motor de reglas del módulo LAUNCH.
// Ejecutar desde la raíz del repo:  node --test public/games/launch/tests/
// No necesitan dependencias: usan node:test y leen los mismos JSON que el juego.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createRng, evaluateLauncher, evaluateAll, simulateLaunch, buildSuggestions, buildRequests,
  planeChangeDeltaV, gtoToGeoDeltaV, propellantForDeltaV, marginStatus, matchReferenceMission, tradeHighlights,
} from '../js/rules.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), 'utf8'));
const data = {
  launchers: load('launchers').launchers,
  sites: load('sites').sites,
  orbits: load('orbits').orbits,
  rules: load('rules'),
  missions: load('reference-missions').missions,
};
const scenarios = load('mock-missions').scenarios;
const inputsFor = (id, difficulty = 'normal') => {
  const s = structuredClone(scenarios.find((x) => x.id === id));
  return { difficulty, spacecraft: s.spacecraft, orbit: s.orbit, budget: s.budget, schedule: s.schedule };
};
const launcher = (id) => data.launchers.find((l) => l.id === id);

test('los datos son coherentes: cada lanzador tiene fuentes, sitios válidos y capacidad decreciente con la energía', () => {
  for (const l of data.launchers) {
    assert.ok(l.sources && l.dataQuality, `${l.id} sin fuentes`);
    for (const s of l.sites) assert.ok(data.sites.some((x) => x.id === s), `${l.id}: sitio ${s} inexistente`);
    const c = l.capacityKg;
    if (c.LEO && c.GTO) assert.ok(c.GTO < c.LEO, `${l.id}: GTO debería ser menor que LEO`);
    if (c.TLI && c.ESCAPE) assert.ok(c.ESCAPE <= c.TLI, `${l.id}: escape debería ser <= TLI`);
  }
  for (const level of Object.keys(data.rules.difficulty)) {
    for (const id of data.rules.difficulty[level].launchers) assert.ok(launcher(id), `${level}: lanzador ${id} inexistente`);
  }
});

test('física simplificada: valores de referencia', () => {
  // Girar 28,5° en LEO cuesta ~3,8 km/s.
  assert.ok(Math.abs(planeChangeDeltaV(28.5, 7.8) - 3.84) < 0.05);
  // GTO→GEO: ~1,47 km/s desde el ecuador y ~1,83 km/s desde Florida.
  assert.ok(Math.abs(gtoToGeoDeltaV(0, data.rules.physics) - 1.47) < 0.01);
  assert.ok(Math.abs(gtoToGeoDeltaV(28.5, data.rules.physics) - 1.83) < 0.02);
  assert.equal(propellantForDeltaV(1000, 0, 300), 0);
  assert.ok(propellantForDeltaV(1000, 100, 300) > 30 && propellantForDeltaV(1000, 100, 300) < 35);
});

test('semáforo del margen de masa', () => {
  const t = data.rules.massMargin.normal;
  assert.equal(marginStatus(-1, t), 'blocked');
  assert.equal(marginStatus(2, t), 'red');
  assert.equal(marginStatus(10, t), 'yellow');
  assert.equal(marginStatus(30, t), 'green');
});

test('la capacidad cambia con la órbita: Falcon 9 sirve para PACE en SSO pero no para un orbitador marciano', () => {
  const oceans = evaluateLauncher(launcher('falcon9'), data, inputsFor('oceans'));
  assert.equal(oceans.compatible, true);
  assert.equal(oceans.marginStatus, 'green');
  const mars = evaluateLauncher(launcher('falcon9'), data, inputsFor('mars'));
  assert.equal(mars.compatible, false);
  assert.ok(mars.checks.find((c) => c.id === 'mass').status === 'fail');
});

test('un lanzador pequeño no llega a destinos altos y lo explica', () => {
  const e = evaluateLauncher(launcher('electron'), data, inputsFor('geo'));
  assert.equal(e.compatible, false);
  const orbit = e.checks.find((c) => c.id === 'orbit');
  assert.equal(orbit.status, 'fail');
  assert.ok(orbit.why.length > 10);
});

test('la cofia también limita: la nave GEO no cabe en Vega C aunque fuera liviana', () => {
  const e = evaluateLauncher(launcher('vegac'), data, inputsFor('geo'));
  assert.equal(e.checks.find((c) => c.id === 'fairing').status, 'fail');
});

test('presupuesto: Electron es demasiado caro para el CubeSat, el viaje compartido no', () => {
  const inputs = inputsFor('cubesat');
  assert.equal(evaluateLauncher(launcher('electron'), data, inputs).checks.find((c) => c.id === 'budget').status, 'fail');
  const ride = evaluateLauncher(launcher('rideshare'), data, inputs);
  assert.equal(ride.compatible, true);
  assert.equal(ride.launchCostMUSD, data.launchers.find((l) => l.id === 'rideshare').minCostMUSD);
});

test('inclinación: una órbita ecuatorial desde Florida reduce mucho la capacidad (caso IXPE)', () => {
  const e = evaluateLauncher(launcher('falcon9'), data, inputsFor('equatorial'));
  assert.ok(e.planeChangeDeg > 27);
  assert.ok(e.capacityKg < e.baseCapacityKg * 0.4);
  assert.equal(e.compatible, true);
  // Desde Nueva Zelanda (39°) Electron no puede con 300 kg a 0,5°.
  assert.equal(evaluateLauncher(launcher('electron'), data, inputsFor('equatorial')).compatible, false);
  // En fácil no se aplican reglas de inclinación.
  assert.equal(evaluateLauncher(launcher('falcon9'), data, inputsFor('equatorial', 'facil')).planeChangeDeg, 0);
});

test('ventanas: Falcon Heavy llega tarde a la ventana de Marte y el retraso cuesta dinero', () => {
  const fh = evaluateLauncher(launcher('falconheavy'), data, inputsFor('mars'));
  assert.equal(fh.date.waitedForWindow, true);
  assert.equal(fh.date.launchMonth, 40);
  assert.ok(fh.delayCostMUSD > 0);
  const ariane = evaluateLauncher(launcher('ariane64'), data, inputsFor('mars'));
  assert.equal(ariane.date.launchMonth, 14);
  assert.equal(ariane.date.delayMonths, 0);
});

test('difícil: lanzar a GTO lejos del ecuador le cuesta vida útil a la nave', () => {
  const fromKourou = evaluateLauncher(launcher('ariane64'), data, inputsFor('geo', 'dificil'));
  const fromFlorida = evaluateLauncher(launcher('falconheavy'), data, inputsFor('geo', 'dificil'));
  assert.ok(fromFlorida.gtoExtraDvMs > fromKourou.gtoExtraDvMs);
  assert.ok(fromFlorida.lifetimeYears < fromKourou.lifetimeYears);
});

test('cargar menos combustible reduce masa y vida útil', () => {
  const inputs = inputsFor('mars');
  const normal = evaluateLauncher(launcher('ariane64'), data, inputs);
  const offload = evaluateLauncher(launcher('ariane64'), data, inputs, { propellantOffloadKg: 150 });
  assert.equal(offload.launchMassKg, normal.launchMassKg - 150);
  assert.ok(offload.lifetimeYears < normal.lifetimeYears);
  // No se puede descargar el combustible reservado para llegar a destino.
  const tooMuch = evaluateLauncher(launcher('ariane64'), data, inputs, { propellantOffloadKg: 5000 });
  assert.equal(tooMuch.offloadKg, 300);
  // En fácil no existe esta opción.
  assert.equal(evaluateLauncher(launcher('falcon9'), data, inputsFor('mars', 'facil'), { propellantOffloadKg: 100 }).offloadKg, 0);
});

test('sugerencias: si no es compatible se proponen alternativas concretas', () => {
  const inputs = inputsFor('mars');
  const all = evaluateAll(data, inputs);
  const f9 = all.find((e) => e.launcherId === 'falcon9');
  const s = buildSuggestions(f9, all, data, inputs);
  assert.ok(s.some((x) => x.kind === 'launcher'));
  assert.ok(s.some((x) => x.kind === 'mass' && x.amountKg > 0));
});

test('hay más de una respuesta correcta: varios lanzadores compatibles con distintos puntos fuertes', () => {
  const all = evaluateAll(data, inputsFor('smallsat'));
  assert.ok(all.filter((e) => e.compatible).length >= 3);
  const h = tradeHighlights(all);
  // El más barato, el más confiable y el de más margen no son todos el mismo.
  assert.ok(new Set([h.cheapest, h.mostReliable, h.mostMargin]).size >= 2);
});

test('pedidos para otros roles', () => {
  const inputs = inputsFor('mars');
  const e = evaluateLauncher(launcher('ariane64'), data, inputs, { propellantOffloadKg: 100 });
  const r = buildRequests(e, inputs);
  assert.ok(r.some((x) => x.toRole === 'spacecraft' && x.type === 'propellant-offload'));
});

test('simulación: semilla reproducible, sin eventos = éxito, y la confiabilidad pesa', () => {
  const inputs = inputsFor('smallsat');
  const e = evaluateLauncher(launcher('alpha'), data, inputs);
  const a = simulateLaunch(e, data, inputs, { seed: 42 });
  const b = simulateLaunch(e, data, inputs, { seed: 42 });
  assert.deepEqual(a, b);
  const calm = simulateLaunch(e, data, inputs, { seed: 42, eventsEnabled: false });
  assert.equal(calm.result, 'exito');
  assert.equal(calm.events.length, 0);

  const failures = (id) => {
    const ev = evaluateLauncher(launcher(id), data, inputs);
    let n = 0;
    for (let seed = 1; seed <= 2000; seed += 1) if (simulateLaunch(ev, data, inputs, { seed }).result === 'falla') n += 1;
    return n / 2000;
  };
  const alphaFail = failures('alpha');
  const rideFail = failures('rideshare');
  assert.ok(alphaFail > 0.15 && alphaFail < 0.4, `alpha ${alphaFail}`);
  assert.ok(rideFail < 0.03, `rideshare ${rideFail}`);
});

test('simulación: resultados posibles y órbita alcanzada', () => {
  const inputs = inputsFor('lunar', 'dificil');
  const e = evaluateLauncher(launcher('falcon9'), data, inputs);
  const seen = new Set();
  for (let seed = 1; seed <= 3000; seed += 1) {
    const r = simulateLaunch(e, data, inputs, { seed });
    seen.add(r.result);
    if (r.result === 'falla') assert.equal(r.achievedOrbit, null);
    else assert.ok(r.achievedOrbit && r.lifetimeYears > 0);
  }
  assert.ok(seen.has('exito') && seen.has('exito_parcial'));
  assert.ok(createRng(7)() === createRng(7)());
});

test('misión de referencia de NASA parecida', () => {
  const m = matchReferenceMission(data.missions, 'ESCAPE', 6000, 'falconheavy');
  assert.equal(m.closest.id, 'clipper');
  const small = matchReferenceMission(data.missions, 'TLI', 25, 'electron');
  assert.equal(small.closest.id, 'capstone');
});
