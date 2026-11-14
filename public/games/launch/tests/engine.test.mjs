// Pruebas del motor. Ejecutar:  node --test public/games/launch/tests/
// (sin dependencias: usa node:test, incluido en Node ≥ 18).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadGameData } from '../js/data.js';
import { MOCK_PRESETS, mockInput } from '../js/mock.js';
import * as E from '../js/engine.js';

const readJson = async (n) => JSON.parse(await readFile(fileURLToPath(new URL(`../data/${n}`, import.meta.url)), 'utf8'));
const data = await loadGameData(readJson);

test('catálogo: todos los lanzadores tienen fuentes y cifras coherentes', () => {
  assert.ok(data.launchers.length >= 8);
  for (const l of data.launchers) {
    assert.ok(l.sources.length > 0, `${l.id} sin fuentes`);
    assert.ok(l.reliability > 0 && l.reliability < 1);
    for (const s of l.sites) assert.ok(data.config.sites[s], `${l.id}: sitio ${s} no existe`);
    assert.ok(l.sites.includes(l.reference_site));
    for (const k of Object.keys(l.payload_kg)) assert.ok(data.config.orbits[k]);
    // Más alto = menos carga (cuando ambas existen)
    const p = l.payload_kg;
    if (p.LEO && p.GTO) assert.ok(p.LEO > p.GTO, `${l.id}: LEO debe superar a GTO`);
    if (p.GTO && p.TLI) assert.ok(p.GTO >= p.TLI, `${l.id}: GTO debe ser ≥ TLI`);
  }
});

test('capacidad: cambia según la órbita', () => {
  const f9 = E.getLauncher(data, 'falcon9');
  const leo = E.capacityFor(data, f9, 'LEO', 'cape').kg;
  const gto = E.capacityFor(data, f9, 'GTO', 'cape').kg;
  assert.equal(leo, 17500);
  assert.equal(gto, 5500);
});

test('capacidad: sitio no permitido y órbita inalcanzable', () => {
  const f9 = E.getLauncher(data, 'falcon9');
  assert.equal(E.capacityFor(data, f9, 'GTO', 'vandenberg').siteAllowed, false);
  const el = E.getLauncher(data, 'electron');
  assert.equal(E.capacityFor(data, el, 'GTO', 'mahia').reachable, false);
});

test('plano: inclinación menor que la latitud penaliza la carga', () => {
  const f9 = E.getLauncher(data, 'falcon9');
  const normal = E.capacityFor(data, f9, 'LEO', 'cape', 51.6).kg;
  const low = E.capacityFor(data, f9, 'LEO', 'cape', 10).kg;
  assert.ok(low < normal);
});

test('compatibilidad: observatorio de 1 800 kg a SSO cabe en Vega C con margen verde', () => {
  const input = mockInput('science');
  const r = E.checkCompatibility(data, input, { launcher_id: 'vega_c' });
  assert.equal(r.compatible, true);
  assert.equal(r.mass.capacity_kg, 2200);
  assert.equal(r.mass.payload_kg, 1854);
  assert.equal(r.mass.margin_kg, 346);
  // 346/1854 = 18.7 % → verde
  assert.equal(r.mass.level, 'green');
});

test('compatibilidad: Electron no lleva 1 800 kg y explica por qué + sugiere alternativas', () => {
  const r = E.checkCompatibility(data, mockInput('science'), { launcher_id: 'electron' });
  assert.equal(r.compatible, false);
  assert.equal(r.mass.level, 'red');
  assert.ok(r.mass.margin_kg < 0);
  const ids = r.suggestions.map((s) => s.id);
  assert.ok(ids.includes('drop_instruments') || ids.includes('other_launcher'));
  assert.ok(ids.includes('other_launcher'));
  const mass = r.checks.find((c) => c.id === 'mass');
  assert.equal(mass.status, 'fail');
  assert.ok(mass.why.length > 20);
});

test('compatibilidad: Falcon 9 a LEO vs GTO cambia el margen (misma nave)', () => {
  const i = mockInput('geosat');
  const gto = E.checkCompatibility(data, i, { launcher_id: 'falcon9' });
  // 5 000 + 150 de adaptador = 5 150 kg; capacidad GTO 5 500 → margen amarillo
  assert.equal(gto.mass.level, 'yellow');
  const leo = E.checkCompatibility(data, { ...i, target_orbit: { id: 'LEO' } }, { launcher_id: 'falcon9' });
  assert.equal(leo.mass.level, 'green');
});

test('cofia: la nave debe caber', () => {
  const i = mockInput('telescope');
  const r = E.checkCompatibility(data, i, { launcher_id: 'falcon_heavy' });
  assert.equal(r.checks.find((c) => c.id === 'fairing').status, 'fail');
});

test('presupuesto: SLS rompe el presupuesto', () => {
  const r = E.checkCompatibility(data, mockInput('lunar'), { launcher_id: 'sls_block1' });
  assert.equal(r.checks.find((c) => c.id === 'budget').status, 'fail');
});

test('costo: el rideshare cobra por kg con mínimo', () => {
  const l = E.getLauncher(data, 'rideshare_sso');
  assert.equal(E.launchCost(l, 10), 0.3);
  assert.equal(E.launchCost(l, 200), 1.3);
});

test('confiabilidad: margen justo la reduce', () => {
  const l = E.getLauncher(data, 'falcon9');
  assert.ok(E.effectiveReliability(data.config, l, 2) < E.effectiveReliability(data.config, l, 30));
  assert.equal(E.effectiveReliability(data.config, l, 30), l.reliability);
});

test('simulación: misma semilla → mismo resultado; la salida tiene el formato esperado', () => {
  const i = mockInput('science', 'hard');
  const a = E.simulateLaunch(data, i, { launcher_id: 'vega_c' }, 42);
  const b = E.simulateLaunch(data, i, { launcher_id: 'vega_c' }, 42);
  assert.deepEqual(a, b);
  const out = E.buildOutput(a, null);
  for (const k of ['status', 'launcher', 'cost_musd', 'achieved_orbit', 'spacecraft_delta', 'events', 'budget_remaining_musd']) assert.ok(k in out, k);
  assert.ok(['success', 'partial', 'failure'].includes(out.status));
});

test('simulación: lanzar algo incompatible lanza error', () => {
  assert.throws(() => E.simulateLaunch(data, mockInput('science'), { launcher_id: 'electron' }, 1));
});

test('simulación Monte Carlo: la tasa de éxito se parece a la confiabilidad', () => {
  const i = mockInput('smallsat', 'normal');
  const N = 4000;
  let ok = 0;
  for (let s = 1; s <= N; s++) if (E.simulateLaunch(data, i, { launcher_id: 'alpha' }, s).status !== 'failure') ok++;
  const rate = ok / N;
  const expected = E.checkCompatibility(data, i, { launcher_id: 'alpha' }).reliability.p_success;
  assert.ok(Math.abs(rate - expected) < 0.03, `tasa ${rate} vs esperada ${expected}`);
});

test('timeline: una falla corta la secuencia en la fase del fallo', () => {
  const i = mockInput('smallsat', 'normal');
  let found = null;
  for (let s = 1; s < 400 && !found; s++) {
    const r = E.simulateLaunch(data, i, { launcher_id: 'alpha' }, s);
    if (r.status === 'failure') found = r;
  }
  assert.ok(found, 'se esperaba al menos una falla en 400 intentos');
  const last = found.timeline.at(-1);
  assert.equal(last.state, 'fail');
  assert.equal(found.mission_lost, true);
});

test('dificultad fácil limita el catálogo y recomienda un lanzador', () => {
  const i = mockInput('cubesat', 'easy');
  const vis = E.visibleLaunchers(data, 'easy').map((l) => l.id);
  assert.ok(!vis.includes('sls_block1'));
  const rec = E.recommend(data, i);
  assert.ok(rec && vis.includes(rec));
});

test('misión de referencia: devuelve la más parecida de la misma órbita', () => {
  const m = E.similarMission(data, 'TLI', 6000);
  assert.ok(m.name.includes('Europa') || m.name.includes('Webb'));
  assert.equal(E.similarMission(data, 'GTO', 5000).orbit, 'GTO');
});

test('todos los presets mock son válidos', () => {
  for (const id of Object.keys(MOCK_PRESETS)) {
    const i = mockInput(id);
    const all = E.evaluateAll(data, i);
    assert.ok(all.length > 0);
  }
});
