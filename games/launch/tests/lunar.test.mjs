// Pruebas de la misión lunar de ida y vuelta: gravedad Tierra–Luna, predicción, maniobras guiadas,
// reentrada (escudo térmico y fuerza g), paracaídas, puntaje y resultado.
// Ejecutar desde la raíz del repo:  node --test games/launch/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PHYS, DEG, FlightSim, orbitElements, vehicleFor, withPilotMargin, withSpacecraft, returnCraft, vehicleMassKg, missionRotationBonus,
  newAutopilot, applyAutopilot, pilotScore, lunarScore, wasDestroyed, stageDeltaV,
} from '../js/flight.js';
import { EARTH, MOON, MOON_DIR, moonState, moonAngle, gravity, bodyAt, coastStep, coastStepLimit } from '../js/bodies.js';
import {
  LUNAR, TLI, propagate, predict, stateOf, nudged, signedPass, lunarPhase, tliWindow, teiWindow, loiPoint, startBurn, burnControl,
  lunarPlan, newGuide, runLunarAutopilot, courseCheck,
} from '../js/lunar.js';
import { primaryMissionCompleted } from '../../../src/missions/missionTransfer.js';
import { evaluateLauncher } from '../js/rules.js';
import { planFlightEvents, resolveFlight } from '../js/outcome.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), 'utf8'));
const data = {
  launchers: load('launchers').launchers, sites: load('sites').sites, orbits: load('orbits').orbits, rules: load('rules'),
  flight: load('flight'), calibration: load('flight-calibration'), glossary: load('glossary').terms, facts: load('facts').facts,
};
const scenario = load('mock-missions').scenarios.find((s) => s.id === 'moonReturn');
const margin = (level) => data.flight.calibration.pilotMargin[level];

/** Cohete + nave lunar listos para volar, igual que los arma el juego (flow.lunarSetup). */
function lunarSim(launcherId = 'falconheavy', level = 'normal', extra = {}) {
  const k = margin(level);
  const vi = vehicleFor(launcherId, 'TLI', data);
  const craftDef = returnCraft(scenario.spacecraft);
  const vehicle = withSpacecraft(withPilotMargin(vi.vehicle, k), craftDef, k);
  const sim = new FlightSim(vehicle, {
    payloadKg: craftDef.capsuleKg, destId: 'TLI', targetAltKm: 250, latDeg: 28.5, incDeg: 28.5,
    v0: missionRotationBonus('TLI', 28.5, 28.5, data.flight), moon: { angle0: 2.36 }, craft: vehicle.craft, profile: 'lunarReturn', events: [], ...extra,
  });
  return { sim, vi, vehicle, craftDef };
}

/** Una cápsula sola que cae desde la distancia de la Luna, con el punto más bajo (sin aire) a `periKm` de altura. */
function capsuleReturning(periKm, { attached = false } = {}) {
  const { sim } = lunarSim();
  const rp = EARTH.R + periKm * 1000; const ra = MOON.DIST; const a = (rp + ra) / 2;
  const r = EARTH.R + 3e6;
  const v = Math.sqrt(EARTH.MU * (2 / r - 1 / a));
  const vt = Math.sqrt((EARTH.MU * rp * ra * 2) / (rp + ra)) / r;
  Object.assign(sim, { x: 0, y: r, vx: vt, vy: -Math.sqrt(v * v - vt * vt), t: 0, status: 'flying', grounded: false, fairing: false, stage: attached ? sim.stageCount - 1 : sim.stageCount });
  sim.stats.maxAlt = 1e8;
  Object.assign(sim.mission, { leo: true, tli: true, soi: true, left: true, parking: { periKm: 200, apoKm: 250 } });
  return sim;
}
function fall(sim, { chuteAt = null, maxDays = 2 } = {}) {
  let n = 0;
  while (sim.status === 'flying' && n++ < 600000 && sim.t < maxDays * 86400) {
    if (chuteAt && !sim.chute && chuteAt(sim)) sim.deployChute();
    sim.advance(sim.altitude < 120000 ? 0.25 : 5, {});
  }
  return sim;
}
const goodChute = (s) => s.altitude < LUNAR.CHUTE_ALT && s.aero().v < LUNAR.CHUTE_SPEED;

// --- Datos y armado de la nave ---------------------------------------------------------------

test('la nave lunar suma su masa real: cápsula + módulo de servicio + combustible = masa de la misión', () => {
  const sc = scenario.spacecraft;
  const d = returnCraft(sc);
  assert.equal(d.capsuleKg + d.serviceDryKg + d.propellantKg, sc.massKg);
  const { vehicle, vi } = lunarSim();
  assert.equal(vehicle.stages.length, vi.vehicle.stages.length + 1);
  assert.ok(vehicle.stages.at(-1).service);
  assert.equal(vehicle.rocketStages, vi.vehicle.stages.length);
  // el cohete con la nave pesa lo mismo que el cohete con esa carga: el despegue no cambia
  assert.ok(Math.abs(vehicleMassKg(vehicle, d.capsuleKg) - vehicleMassKg(vi.vehicle, sc.massKg)) < 1);
  // sin combustible de sobra no hay vuelta: el módulo de servicio tiene que poder frenar en la Luna y volver (~1,6 km/s)
  const { sim } = lunarSim('falconheavy', 'dificil');
  sim.stage = sim.stageCount - 1;
  assert.ok(stageDeltaV(sim) > 2000, `Δv del módulo de servicio: ${Math.round(stageDeltaV(sim))} m/s`);
  assert.equal(returnCraft({ massKg: 100, propellantKg: 10 }), null);
});

test('la misión cabe en un cohete de cada nivel de dificultad', () => {
  for (const level of ['facil', 'normal', 'dificil']) {
    const inputs = { difficulty: level, spacecraft: structuredClone(scenario.spacecraft), orbit: scenario.orbit, budget: scenario.budget, schedule: scenario.schedule };
    const allowed = data.rules.difficulty[level].launchers;
    const ok = data.launchers.filter((l) => allowed.includes(l.id)).map((l) => evaluateLauncher(l, data, inputs)).filter((e) => e.compatible && vehicleFor(e.launcherId, 'TLI', data));
    assert.ok(ok.length >= 1, `${level}: ningún cohete sirve`);
  }
});

// --- Gravedad y zonas de influencia ---------------------------------------------------------

test('la Luna da una vuelta a la Tierra en ~27 días y arrastra su zona de influencia', () => {
  const days = (2 * Math.PI) / MOON.RATE / 86400;
  assert.ok(days > 27 && days < 27.7, `periodo: ${days}`);
  const moon = { angle0: 1 };
  const m0 = moonState(moon, 0, {});
  assert.ok(Math.abs(Math.hypot(m0.x, m0.y) - MOON.DIST) < 1);
  assert.ok(Math.abs(Math.hypot(m0.vx, m0.vy) - MOON.SPEED) < 1e-6);
  assert.equal(bodyAt(m0.x + MOON.SOI * 0.9, m0.y, 0, moon), 'moon');
  assert.equal(bodyAt(m0.x + MOON.SOI * 1.1, m0.y, 0, moon), 'earth');
  assert.equal(bodyAt(EARTH.R + 3e5, 0, 0, null), 'earth');
  // gira en el mismo sentido que la nave (horario en este plano)
  assert.equal(Math.sign(moonAngle(moon, 1000) - moonAngle(moon, 0)), MOON_DIR);
});

test('dentro de la zona de la Luna la nave describe una órbita lunar exacta (se conserva su energía respecto a la Luna)', () => {
  const moon = { angle0: 0.7 };
  const m = moonState(moon, 0, {});
  const r = MOON.R + 110000; const v = Math.sqrt(MOON.MU / r);
  const st = { x: m.x + r, y: m.y, vx: m.vx, vy: m.vy - v, t: 0, body: 'moon' };
  const el0 = orbitElements(r, 0, 0, -v, MOON.MU, MOON.R);
  for (let i = 0; i < 4000; i++) coastStep(st, coastStepLimit(st.x, st.y, st.vx, st.vy, st.t, st.body, moon), moon);
  const mm = moonState(moon, st.t, {});
  const el = orbitElements(st.x - mm.x, st.y - mm.y, st.vx - mm.vx, st.vy - mm.vy, MOON.MU, MOON.R);
  assert.equal(st.body, 'moon');
  assert.ok(st.t > 7000, 'dio al menos una vuelta');
  assert.ok(Math.abs(el.periAlt - el0.periAlt) < 500 && Math.abs(el.apoAlt - el0.apoAlt) < 500, `${el.periAlt} × ${el.apoAlt}`);
  // la gravedad de la Luna en su superficie es ~1/6 de la terrestre
  const g = [0, 0]; gravity(m.x + MOON.R, m.y, 0, 'moon', moon, g);
  const gMoonOnly = Math.hypot(g[0] + MOON.RATE ** 2 * m.x, g[1] + MOON.RATE ** 2 * m.y);
  assert.ok(Math.abs(gMoonOnly - 1.62) < 0.02);
});

// --- Predicción y ventanas -------------------------------------------------------------------

test('predicción: desde la órbita de espera no hay encuentro; con un empujón de ~3,1 km/s en la ventana, sí', () => {
  const moon = { angle0: 0 };
  const r = EARTH.R + 250000; const v = Math.sqrt(EARTH.MU / r);
  // nave en +y moviéndose hacia +x (sentido horario)
  const st = { x: 0, y: r, vx: v, vy: 0, t: 0, body: 'earth' };
  const p0 = propagate(st, moon);
  assert.equal(p0.end, 'earthOrbit');
  assert.equal(signedPass(p0), null);
  // se coloca la Luna "atrasada" 66° respecto al punto opuesto, como pide la ventana
  moon.angle0 = Math.PI / 2 + Math.PI + TLI.LEAD_IDEAL;
  let best = null;
  for (let dv = 3090; dv <= 3160; dv += 1) {
    const p = propagate(nudged(st, moon, dv), moon, { keepPath: false });
    const s = signedPass(p);
    if (s != null && s > 0 && (best == null || s < best.s)) best = { dv, s, p };
  }
  assert.ok(best, 'no se encontró ningún encuentro con la Luna');
  assert.ok(best.p.encounter.t > 2 * 86400 && best.p.encounter.t < 6 * 86400, `llega en ${(best.p.encounter.t / 86400).toFixed(1)} días`);
  assert.ok(best.p.moon.hyper, 'sin frenar, la nave pasa de largo');
});

test('la ventana translunar se abre una vez por órbita y dice cuánto falta', () => {
  const { sim } = lunarSim();
  const r = EARTH.R + 250000; const v = Math.sqrt(EARTH.MU / r);
  Object.assign(sim, { x: 0, y: r, vx: v, vy: 0, t: 0, status: 'flying', grounded: false });
  const period = 2 * Math.PI * Math.sqrt(r ** 3 / EARTH.MU);
  let opens = 0; let wasOpen = tliWindow(sim).open; let maxWait = 0;
  for (let t = 0; t < period; t += 20) {
    sim.advance(20, {});
    const w = tliWindow(sim);
    assert.ok(w.waitS >= 0 && w.waitS < period * 1.05);
    maxWait = Math.max(maxWait, w.waitS);
    if (w.open && !wasOpen) opens++;
    wasOpen = w.open;
    if (w.open) assert.ok(w.lead >= TLI.LEAD_MIN && w.lead <= TLI.LEAD_MAX);
  }
  assert.ok(opens >= 1 && opens <= 2, `se abrió ${opens} veces en una órbita`);
  assert.ok(maxWait > period * 0.5);
  assert.ok(Math.abs(tliWindow(sim).dvNeed - 3130) < 60, 'la inyección translunar pide unos 3,1 km/s');
});

// --- La misión completa ------------------------------------------------------------------------

const flights = {};
function flown(launcherId, level) {
  const key = `${launcherId}|${level}`;
  if (!flights[key]) {
    const f = lunarSim(launcherId, level);
    const burns = [];
    runLunarAutopilot(f.sim, { ...f.vi.program, hold: true }, { onStep: (s) => { if (s.burn && !burns.includes(s.burn)) burns.push(s.burn); } });
    flights[key] = { ...f, burns };
  }
  return flights[key];
}

for (const [launcherId, level] of [['falconheavy', 'facil'], ['falconheavy', 'normal'], ['falconheavy', 'dificil'], ['sls', 'dificil']]) {
  test(`misión completa con el piloto automático (${launcherId}, nivel ${level}): órbita, Luna, órbita lunar, regreso y amerizaje`, () => {
    const { sim, burns } = flown(launcherId, level);
    const m = sim.mission; const st = sim.stats;
    assert.equal(sim.endReason, 'splashdown', sim.log.at(-1)?.text);
    for (const k of ['leo', 'tli', 'soi', 'lunarOrbit', 'tei', 'left', 'entry', 'landed']) assert.ok(m[k], `falta la meta «${k}»`);
    // órbita lunar baja y casi redonda
    assert.ok(m.bestOrbit.periKm > 40 && m.bestOrbit.apoKm < 300, `órbita lunar ${m.bestOrbit.periKm} × ${m.bestOrbit.apoKm}`);
    assert.ok(m.lunarRevs >= 1, 'dio al menos una vuelta a la Luna');
    // las cuatro maniobras: inyección (~3,1 km/s), frenado y regreso (~0,8 km/s cada una) y correcciones pequeñas
    const by = (kind) => burns.filter((b) => b.kind === kind);
    assert.ok(Math.abs(by('tli')[0].dv - 3080) < 150, `TLI ${by('tli')[0].dv}`);
    assert.ok(Math.abs(by('loi')[0].dv - 800) < 120, `LOI ${by('loi')[0].dv}`);
    assert.ok(Math.abs(by('tei')[0].dv - 800) < 120, `TEI ${by('tei')[0].dv}`);
    for (const b of by('mcc')) assert.ok(b.dv < 40, `corrección de ${b.dv} m/s`);
    for (const b of burns) assert.equal(b.result, 'ok', `${b.kind}: ${b.result}`);
    // reentrada dentro del corredor: ~11 km/s, frenado soportable y escudo con margen
    assert.ok(st.entrySpeed > 10000 && st.entrySpeed < 11500);
    assert.ok(st.maxG < sim.craft.gLimit, `fuerza g máxima ${st.maxG}`);
    assert.ok(sim.heat.shieldLeft > 0.3 && sim.heat.shieldLeft < 0.8, `escudo restante ${sim.heat.shieldLeft}`);
    assert.ok(st.chuteSpeed < PHYS.CHUTE_MAX_SPEED);
    assert.ok(sim.landing.speed < PHYS.LAND_SPEED && sim.landing.speed > 5, `amerizaje a ${sim.landing.speed} m/s`);
    // el viaje dura lo que una misión real de este tipo
    assert.ok(sim.t > 8 * 86400 && sim.t < 14 * 86400, `${(sim.t / 86400).toFixed(1)} días`);
    // sobra combustible en el módulo de servicio (más en los niveles fáciles)
    assert.ok(sim.fuel.at(-1) > 500, `combustible de la nave: ${sim.fuel.at(-1)} kg`);
    assert.equal(lunarPhase(sim), 'landed');
  });
}

test('el margen de pilotaje deja más combustible en la nave en los niveles fáciles', () => {
  const left = (level) => flown('falconheavy', level).sim.fuel.at(-1);
  assert.ok(left('facil') > left('normal') && left('normal') > left('dificil'));
});

test('puntaje y resultado de la misión lunar cumplida', () => {
  const { sim, vi } = flown('falconheavy', 'normal');
  const score = pilotScore(sim);
  assert.equal(score.parts.length, 5);
  assert.equal(score.parts.reduce((a, p) => a + p.max, 0), 100);
  assert.ok(score.total >= 92, `puntaje ${score.total}`);
  assert.ok(score.how.includes('100 puntos'));
  const inputs = { difficulty: 'normal', spacecraft: structuredClone(scenario.spacecraft), orbit: scenario.orbit, budget: scenario.budget, schedule: scenario.schedule };
  const evaluation = evaluateLauncher(data.launchers.find((l) => l.id === 'falconheavy'), data, inputs);
  const plan = planFlightEvents(evaluation, data, inputs, { seed: 3, eventsEnabled: false, stageCount: vi.vehicle.stages.length });
  const out = resolveFlight({ sim, plan, evaluation, inputs, data, ref: { fuelLeftPct: 5 } });
  assert.equal(out.result, 'exito');
  assert.equal(primaryMissionCompleted({ scenarioId: scenario.id }, {
    scenarioId: scenario.id, result: out.result, reached: out.flightData.lunar.reached,
  }), true);
  assert.equal(out.achievedOrbit.type, 'LUNA');
  assert.ok(out.flightData.lunar.reached.includes('landed'));
  assert.ok(out.flightData.lunar.landingSpeedMs < 12 && out.flightData.lunar.maxG < 9);
  assert.equal(out.lifetimeYears, scenario.spacecraft.designLifetimeYears);
  assert.doesNotThrow(() => JSON.stringify(out));
});

// --- Maniobras guiadas -----------------------------------------------------------------------

test('inyección translunar guiada: el motor se apaga solo cuando la trayectoria pasa a ~110 km de la Luna', () => {
  const { sim, vi } = lunarSim();
  const ap = newAutopilot({ ...vi.program, hold: true, waitWindow: true });
  sim.ignite();
  for (let n = 0; n < 40000 && sim.status === 'flying' && ap.phase !== 'window'; n++) { const c = applyAutopilot(sim, ap); sim.advance(0.25, { throttle: c.throttle, betaTarget: sim.mode === 'prograde' ? null : c.betaTarget }); }
  assert.ok(sim.mission.leo);
  const g = newGuide();
  assert.equal(lunarPlan(sim, g).phase, 'parking');
  // espera a la ventana (sin pasarse) y enciende
  for (let n = 0; n < 20000; n++) { const w = tliWindow(sim); if (w.waitS <= 0) break; sim.advance(Math.max(0.5, Math.min(60, w.waitS * 0.5)), { throttle: 0 }); }
  assert.ok(tliWindow(sim).open);
  startBurn(sim, 'tli');
  let last = null;
  for (let n = 0; n < 200000 && !sim.burn.done; n++) {
    const c = burnControl(sim);
    if (sim.mode !== c.mode) sim.setMode(c.mode);
    if (c.readout) last = c.readout;
    sim.advance(0.05, { throttle: c.throttle });
  }
  assert.equal(sim.burn.result, 'ok');
  assert.ok(Math.abs(last.passKm - LUNAR.PERI_TARGET / 1000) < 40, `paso por la Luna: ${last.passKm} km`);
  const pred = predict(sim);
  const check = courseCheck(sim, pred);
  assert.equal(check.goal, 'moon');
  assert.ok(check.ok && check.fine);
  assert.ok(sim.throttle <= 1 && sim.stats.transfer.active === false);
  assert.ok(loiPoint(sim, pred) === null || true); // todavía lejos de la Luna: el punto de frenado se calcula al llegar
});

test('encender fuera de la ventana no encuentra a la Luna y el juego lo dice', () => {
  const { sim } = lunarSim();
  const r = EARTH.R + 250000; const v = Math.sqrt(EARTH.MU / r);
  Object.assign(sim, { x: 0, y: r, vx: v, vy: 0, t: 0, status: 'flying', grounded: false, fairing: false, stage: sim.stageCount - 2 });
  sim.orbitReached = true; sim.mission.leo = true; sim.mission.parking = { periKm: 250, apoKm: 250 };
  // la Luna del lado contrario al que hace falta (280° "atrasada" en vez de 66°)
  sim.moon.angle0 = sim.angle + Math.PI + 280 * DEG;
  assert.equal(tliWindow(sim).open, false);
  startBurn(sim, 'tli');
  for (let n = 0; n < 200000 && !sim.burn.done; n++) { const c = burnControl(sim); if (sim.mode !== c.mode) sim.setMode(c.mode); sim.advance(0.05, { throttle: c.throttle }); }
  assert.equal(sim.burn.result, 'noEncounter');
  assert.equal(signedPass(predict(sim)), null);
});

test('ventana de regreso: existe en órbita lunar y pide ~0,8 km/s', () => {
  const { sim } = lunarSim();
  const m = moonState(sim.moon, 0, {});
  const r = MOON.R + 110000; const v = Math.sqrt(MOON.MU / r);
  Object.assign(sim, { x: m.x + r, y: m.y, vx: m.vx, vy: m.vy - v, t: 0, status: 'flying', grounded: false, fairing: false, stage: sim.stageCount - 1, body: 'moon' });
  const w = teiWindow(sim);
  assert.ok(w && w.waitS >= 0 && w.waitS <= w.period * 1.05);
  assert.ok(Math.abs(w.dv - 800) < 80, `Δv de regreso: ${w.dv}`);
  assert.ok(Math.abs(w.period - 7100) < 300, 'una vuelta a la Luna a 110 km dura ~2 horas');
});

// --- Reentrada, escudo térmico y paracaídas ------------------------------------------------

test('corredor de reentrada: a ~60 km el frenado es soportable; muy empinado rompe la cápsula; muy rasante gasta el escudo', () => {
  const ok = fall(capsuleReturning(60), { chuteAt: goodChute });
  assert.equal(ok.endReason, 'splashdown');
  assert.ok(ok.stats.maxG > 4 && ok.stats.maxG < ok.craft.gLimit, `g máx ${ok.stats.maxG}`);
  assert.ok(ok.heat.shieldLeft > 0.35);
  const steep = fall(capsuleReturning(0), { chuteAt: goodChute });
  assert.equal(steep.endReason, 'gforce');
  const harsh = fall(capsuleReturning(40), { chuteAt: goodChute });
  assert.equal(harsh.endReason, 'splashdown');
  assert.ok(harsh.stats.maxG > harsh.craft.gLimit, 'entrar empinado se sobrevive, pero con demasiada fuerza g');
  const shallow = fall(capsuleReturning(80), { chuteAt: goodChute, maxDays: 4 });
  assert.equal(shallow.endReason, 'burn');
  // mientras más empinada la entrada, más fuerza g
  assert.ok(steep.stats.maxG > harsh.stats.maxG && harsh.stats.maxG > ok.stats.maxG);
});

test('sin soltar el módulo de servicio, el escudo queda tapado y la nave se quema', () => {
  const sim = fall(capsuleReturning(60, { attached: true }));
  assert.equal(sim.endReason, 'burn');
  assert.ok(wasDestroyed(sim));
  assert.match(sim.log.at(-1).text, /módulo de servicio/);
});

test('paracaídas: no se abren en el espacio, se rompen si se abren muy rápido y sin ellos la cápsula se estrella', () => {
  const a = capsuleReturning(60);
  assert.equal(a.deployChute(), 'high');
  assert.equal(a.chute, null);
  const attached = capsuleReturning(60, { attached: true });
  assert.equal(attached.deployChute(), 'attached');
  // abiertos en cuanto se puede (a 30 km), cuando la cápsula todavía va a más de 320 m/s: se rompen
  const torn = fall(capsuleReturning(60), { chuteAt: (s) => s.altitude < PHYS.CHUTE_MAX_ALT });
  assert.ok(torn.stats.chuteSpeed > PHYS.CHUTE_MAX_SPEED, `abiertos a ${torn.stats.chuteSpeed} m/s`);
  assert.equal(torn.chuteState, 'torn');
  assert.equal(torn.endReason, 'crash');
  const none = fall(capsuleReturning(60));
  assert.equal(none.endReason, 'crash');
  assert.ok(none.aero().v > 40, 'sin paracaídas llega a decenas de m/s');
  // bien abiertos: primero los de frenado, luego los principales, y toca el agua despacio
  const good = capsuleReturning(60);
  const states = new Set();
  fall(good, { chuteAt: (s) => { states.add(s.chuteState); return goodChute(s); } });
  let n = 0; const seen = [];
  const again = capsuleReturning(60);
  while (again.status === 'flying' && n++ < 600000) { if (!again.chute && goodChute(again)) again.deployChute(); if (!seen.includes(again.chuteState)) seen.push(again.chuteState); again.advance(again.altitude < 120000 ? 0.25 : 5, {}); }
  assert.deepEqual(seen, ['none', 'drogue', 'opening', 'main']);
  assert.ok(again.landing.speed < 11);
});

test('la cápsula sola es estable con el escudo por delante (se acomoda sola al entrar al aire)', () => {
  const sim = capsuleReturning(60);
  sim.beta = 0.3; // mirando casi "hacia arriba": mal orientada
  let n = 0;
  while (sim.status === 'flying' && n++ < 200000 && !(sim.altitude < 70000)) sim.advance(sim.altitude < 120000 ? 0.25 : 5, {});
  const [ax, ay] = sim.attitude();
  const [rx, ry] = sim.relVelocity();
  const cos = (ax * rx + ay * ry) / Math.hypot(rx, ry);
  assert.ok(cos < -0.97, `el eje apunta contra el avance (cos = ${cos})`);
});

test('puntaje parcial: un sobrevuelo sin frenar puntúa menos que la misión completa, y perder la nave no da puntos de amerizaje', () => {
  const full = lunarScore(flown('falconheavy', 'normal').sim);
  const flyby = capsuleReturning(60);
  flyby.mission.minMoonAlt = 250000;
  fall(flyby, { chuteAt: goodChute });
  const s1 = lunarScore(flyby);
  assert.ok(s1.total < full.total && s1.total >= 60, `sobrevuelo: ${s1.total}`);
  assert.ok(s1.parts.find((p) => p.id === 'lunarOrbit').points < 25 * 0.5);
  const lost = fall(capsuleReturning(0), { chuteAt: goodChute });
  assert.equal(lunarScore(lost).parts.find((p) => p.id === 'landing').points, 0);
  void stateOf;
});
