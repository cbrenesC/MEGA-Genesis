// Pruebas del despegue, la cámara y las piezas sueltas (fases de vuelo, separación de etapas).
// Ejecutar desde la raíz del repo:  node --test public/games/launch/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PHYS, FlightSim, vehicleFor, runAutopilot, orbitElements, circularSpeed, withPilotMargin, orbitGoalMet, COAST_DV } from '../js/flight.js';
import {
  phaseOf, cameraScale, anchorFraction, FlightCamera, skyProgress, makeDebris, stepDebris, cullReason,
  angleFromVertical, toCameraFrame, groundDistance, thrustAccelG, focusEnvelope, CAMERA,
} from '../js/world.js';

const load = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), 'utf8'));
const data = { launchers: load('launchers').launchers, flight: load('flight'), calibration: load('flight-calibration') };

function freshSim(launcher = 'falcon9', dest = 'LEO', payloadKg = 5000) {
  const vi = vehicleFor(launcher, dest, data);
  const c = data.flight.calibration[dest];
  return new FlightSim(vi.vehicle, { payloadKg, destId: dest, targetAltKm: c.parkingAltKm, latDeg: 28.5, incDeg: 28.5 });
}

// --- 1 · el cohete detenido en la plataforma -------------------------------------------------

test('1 · en la plataforma: sin encender no se mueve ni pierde combustible', () => {
  const sim = freshSim();
  assert.equal(sim.status, 'pad');
  assert.equal(sim.grounded, true);
  const f0 = sim.fuelLeftKg;
  sim.advance(30, { throttle: 1 });
  assert.equal(sim.altitude, 0);
  assert.equal(sim.fuelLeftKg, f0);
  assert.equal(phaseOf(sim.altitude, { grounded: sim.grounded }), 'pad');
});

test('2 · motores con poco empuje: el cohete NO despega (empuje menor que el peso)', () => {
  const sim = freshSim();
  sim.ignite();
  const twFull = sim.thrustToWeight(1);
  assert.ok(twFull > 1.05 && twFull < 2.2, `empuje/peso a tope = ${twFull}`);
  const low = 0.85 / twFull; // 85 % del peso
  sim.throttle = low;
  const f0 = sim.fuelLeftKg;
  for (let i = 0; i < 100; i++) sim.advance(0.2, { throttle: low });
  assert.ok(sim.altitude < 0.5, `no debe subir: ${sim.altitude} m`);
  assert.equal(sim.grounded, true);
  assert.ok(sim.fuelLeftKg < f0, 'los motores sí gastan combustible');
  // y el suelo lo sostiene: no hay velocidad vertical
  assert.ok(Math.abs(sim.radialSpeed) < 1e-6);
});

test('3 · despegue correcto: al superar el peso se desprende y acelera según empuje, masa y gravedad', () => {
  const sim = freshSim();
  sim.ignite();
  let liftT = null; const samples = [];
  for (let i = 0; i < 400; i++) {
    sim.advance(0.1, { throttle: 1, betaTarget: 0 });
    if (liftT == null && sim.altitude > 1) liftT = sim.t;
    if (i % 50 === 0) samples.push([sim.t, sim.altitude, sim.radialSpeed]);
  }
  assert.ok(liftT != null && liftT < 6, `despegó a los ${liftT} s`);
  assert.equal(sim.grounded, false);
  assert.ok(sim.altitude > 500);
  // la aceleración vertical coincide con empuje/masa − gravedad (aire aparte): comprobación de coherencia
  const a = (sim.radialSpeed - samples.at(-1)[2]) / (sim.t - samples.at(-1)[0]);
  assert.ok(a > 0.5 && a < 60, `aceleración ${a}`);
  // sube de forma continua: la velocidad vertical crece
  assert.ok(samples.at(-1)[2] > samples[1][2]);
});

test('4 · el suelo se aleja de forma continua (la escala de la cámara nunca salta)', () => {
  let prev = cameraScale(0);
  for (let h = 1; h < 5e6; h *= 1.01) {
    const s = cameraScale(h);
    assert.ok(s >= prev - 1e-12, `la escala no baja (${h} m)`);
    assert.ok(s / prev < 1.05, `sin saltos de escala en ${h} m: ${s / prev}`);
    prev = s;
  }
  // distancia del suelo en píxeles: arranca en 0 con la plataforma, crece sin parar y se queda en una franja al borde
  const D = (h) => h / cameraScale(h);
  assert.ok(D(0.001) < 0.01);
  let last = 0;
  for (let h = 1; h < 3000; h *= 1.1) { assert.ok(D(h) >= last - 1e-9, 'el suelo solo se aleja'); last = D(h); }
  assert.ok(D(100) > 40 && D(400) > 0.9 * 72, 'a los 400 m el suelo ya está lejos');
  // la plataforma se achica: escala relativa 1/mpp
  assert.ok(cameraScale(0) / cameraScale(500) < 0.25);
  // en el espacio la escala queda fija y la Tierra sale de la pantalla (queda muy por debajo del cohete)
  assert.equal(cameraScale(200000), cameraScale(CAMERA.freezeAlt));
  assert.ok(D(30000) < 80, 'en la atmósfera todavía se ve el suelo');
  assert.ok(D(100000) > 140 && D(250000) > 350, 'en el espacio la Tierra ya no está en pantalla');
  assert.ok(anchorFraction(0) > anchorFraction(3000));
});

test('5 · fases de vuelo según la altura real, con histéresis y sin parpadeo', () => {
  assert.equal(phaseOf(0, { grounded: true }), 'pad');
  assert.equal(phaseOf(10), 'liftoff');
  assert.equal(phaseOf(5000), 'atmosphere');
  assert.equal(phaseOf(60000), 'upper');
  assert.equal(phaseOf(150000), 'space');
  // histéresis: cerca del límite no cambia de fase si venía de arriba
  assert.equal(phaseOf(99000, { prev: 'space' }), 'space');
  assert.equal(phaseOf(90000, { prev: 'space' }), 'upper');
  // el cielo se oscurece de forma monótona con la altura y no depende de temporizadores
  let last = -1;
  for (let h = 0; h <= 200000; h += 500) { const s = skyProgress(h); assert.ok(s >= last - 1e-9); last = s; }
  assert.ok(skyProgress(0) < 0.01 && skyProgress(150000) > 0.99);
});

test('6 · cámara: sigue suave, sin teletransportes, y la sacudida es de píxeles enteros', () => {
  const cam = new FlightCamera();
  let alt = 0; let prev = cam.mpp;
  for (let i = 0; i < 6000; i++) {
    alt += 120 * (1 / 60) * 3.5; // ~ ascenso
    cam.update(alt, 1.2, 1 / 60);
    assert.ok(cam.mpp / prev < 1.05 && cam.mpp / prev >= 1);
    prev = cam.mpp;
  }
  cam.kick(0.8);
  const [x, y] = cam.shakeOffset(() => 0.9);
  assert.ok(Number.isInteger(x) && Number.isInteger(y));
});

// --- Separación de etapas ----------------------------------------------------------------------

function flyToStageEnd(sim) {
  sim.ignite();
  for (let i = 0; i < 4000 && !sim.engineOut; i++) sim.advance(0.25, { throttle: 1, betaTarget: Math.min(1.2, sim.altitude / 90000) });
  return sim;
}

test('7 · separación: la pieza hereda posición y velocidad y se conserva el momento', () => {
  const sim = flyToStageEnd(freshSim());
  const before = { x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy, mass: sim.mass };
  const [ax, ay] = sim.attitude();
  assert.ok(sim.separateStage());
  const s = sim.lastSeparation;
  assert.equal(s.kind, 'stage');
  assert.equal(s.x, before.x); assert.equal(s.y, before.y);
  // mismo vector de velocidad + un empujoncito pequeño hacia atrás (a lo largo del eje)
  const dvx = s.vx - before.vx; const dvy = s.vy - before.vy;
  const dvAlong = dvx * ax + dvy * ay;
  assert.ok(dvAlong < 0 && Math.abs(dvAlong) <= PHYS.SEP_SPEED, `empujoncito ${dvAlong} m/s`);
  assert.ok(Math.abs(dvx * ay - dvy * ax) < 1e-9, 'el empujón va por el eje, no de lado');
  // momento total conservado
  const mRest = sim.mass;
  const px0 = before.mass * before.vx;
  const px1 = s.massKg * s.vx + mRest * sim.vx;
  assert.ok(Math.abs(px1 - px0) / Math.abs(px0) < 1e-6, 'momento conservado');
  assert.ok(Math.abs(before.mass - (s.massKg + mRest)) < 1e-6, 'la masa se reparte');
});

test('8-10 · trayectoria balística de la etapa: gravedad real, sin giro, orientación fija', () => {
  const sim = flyToStageEnd(freshSim());
  sim.separateStage();
  const d = makeDebris(sim.lastSeparation, { w: 8, h: 20 });
  const axis0 = [...d.axis];
  const r0 = Math.hypot(d.x, d.y);
  const v0 = Math.hypot(d.vx, d.vy);
  // estado del cohete principal sin tocar durante la caída de la pieza
  const rocket = { x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy };
  let maxAlt = d.y; let landed = false;
  for (let i = 0; i < 3000 && !d.dead; i++) { stepDebris(d, 1, sim.atmRate); maxAlt = Math.max(maxAlt, Math.hypot(d.x, d.y)); }
  assert.deepEqual(d.axis, axis0, 'la orientación no cambia (sin giro aleatorio)');
  assert.ok(!('spin' in d) && !('rot' in d), 'la pieza no tiene velocidad de giro');
  assert.equal(sim.x, rocket.x); assert.equal(sim.vy, rocket.vy);
  // vuela balística: puede subir un poco antes de caer, y termina cayendo por la gravedad hacia la Tierra
  assert.ok(maxAlt >= r0 - 1);
  assert.ok(d.dead && d.deadReason === 'impact', 'cae y toca la Tierra');
  void v0; void landed;
});

test('11 · en el vacío la pieza conserva su energía (movimiento orbital kepleriano)', () => {
  const sim = freshSim();
  sim.status = 'flying'; sim.grounded = false;
  sim.x = 0; sim.y = PHYS.RE + 300000; sim.vx = circularSpeed(PHYS.RE + 300000); sim.vy = 0; sim.atmRate = 0;
  sim.lastSeparation = { kind: 'stage', massKg: 3000, x: sim.x, y: sim.y, vx: sim.vx - 1.5, vy: 0, axis: [1, 0], t: 0, index: 0 };
  const d = makeDebris(sim.lastSeparation, {});
  const e0 = orbitElements(d.x, d.y, d.vx, d.vy).energy;
  for (let i = 0; i < 1500; i++) stepDebris(d, 2, 0);
  const e1 = orbitElements(d.x, d.y, d.vx, d.vy).energy;
  assert.ok(Math.abs(e1 - e0) / Math.abs(e0) < 1e-6, `deriva de energía ${(e1 - e0) / e0}`);
  assert.ok(!d.dead);
});

test('12 · cofia: las dos mitades se abren hacia lados opuestos y no giran', () => {
  const sim = freshSim();
  sim.ignite();
  sim.advance(20, { throttle: 1, betaTarget: 0 });
  assert.ok(sim.dropFairing());
  const L = makeDebris(sim.lastSeparation, { side: -1 }); const R = makeDebris(sim.lastSeparation, { side: 1 });
  const rel = Math.hypot(L.vx - R.vx, L.vy - R.vy);
  assert.ok(Math.abs(rel - 2 * PHYS.FAIRING_SPEED) < 1e-6);
  assert.deepEqual(L.axis, R.axis);
});

test('13 · limpieza: se borran las piezas caídas, lejanas o viejas', () => {
  const rocket = { x: 0, y: PHYS.RE + 100000 };
  const d = { x: 0, y: PHYS.RE + 100000, dead: false, age: 10 };
  assert.equal(cullReason(d, rocket), null);
  assert.equal(cullReason({ ...d, dead: true, deadReason: 'impact' }, rocket), 'impact');
  assert.equal(cullReason({ ...d, age: 5000 }, rocket), 'age');
  assert.equal(cullReason({ ...d, x: 9e6 }, rocket), 'far');
});

test('14 · marco de cámara: "arriba" es la vertical del cohete, no de la pantalla', () => {
  const th = 1.2; const R = PHYS.RE + 50000;
  const rx = R * Math.cos(th); const ry = R * Math.sin(th);
  const above = toCameraFrame(rx * 1.001, ry * 1.001, rx, ry);
  assert.ok(above.up > 0 && Math.abs(above.east) < 1e-6);
  const ang = angleFromVertical([Math.cos(th), Math.sin(th)], rx, ry);
  assert.ok(Math.abs(ang) < 1e-9, 'un eje vertical se ve vertical');
  assert.equal(groundDistance(Math.PI / 2, 0, 7e-5), 0);
  assert.ok(Math.abs(groundDistance(Math.PI / 2 - 7e-5 * 100, 100, 7e-5)) < 1e-6, 'el suelo gira con la Tierra');
});

test('15 · aceleración propulsiva: crece al quemar combustible (masa baja)', () => {
  const sim = freshSim();
  sim.ignite(); sim.throttle = 1;
  const a0 = thrustAccelG(sim);
  for (let i = 0; i < 300; i++) sim.advance(0.25, { throttle: 1, betaTarget: 0.3 });
  assert.ok(thrustAccelG(sim) > a0);
});

test('16 · reinicio: un vuelo nuevo no hereda estado del anterior', () => {
  const a = freshSim();
  a.ignite();
  for (let i = 0; i < 400; i++) a.advance(0.25, { throttle: 1, betaTarget: 0.2 });
  a.separateStage();
  const b = freshSim();
  assert.equal(b.status, 'pad'); assert.equal(b.grounded, true); assert.equal(b.lastSeparation, null);
  assert.equal(b.stage, 0); assert.equal(b.t, 0); assert.equal(b.altitude, 0);
  assert.ok(runAutopilot(b.vehicle, { payloadKg: 5000, destId: 'LEO', targetAltKm: 250, latDeg: 28.5, incDeg: 28.5 }, data.calibration.vehicles.falcon9.LEO.program).elements.periAlt > 0);
});

test('17 · acercamiento de la separación: sube y baja suave y siempre vuelve a la escala normal', () => {
  const cam = new FlightCamera(72);
  cam.reset(40000);
  const base = cam.mpp;
  cam.kickFocus(6);
  let min = base; let prev = base;
  for (let i = 0; i < 600; i++) { cam.update(40000, 0, 1 / 60); min = Math.min(min, cam.mpp); assert.ok(Math.abs(cam.mpp / prev - 1) < 0.09, 'sin saltos'); prev = cam.mpp; }
  assert.ok(min < base / 4, 'se acerca de verdad');
  assert.ok(Math.abs(cam.mpp - base) / base < 1e-9, 'vuelve a la escala normal');
  assert.equal(focusEnvelope(Infinity), 0);
});

test('18 · caída sin combustible: la velocidad de caída NO depende de hacia dónde mira la punta', () => {
  const fall = (beta) => {
    const sim = freshSim();
    sim.status = 'flying'; sim.grounded = false; sim.fuel = sim.fuel.map(() => 0);
    sim.x = 0; sim.y = PHYS.RE + 40000; sim.vx = sim.atmRate * sim.y; sim.vy = 0; sim.beta = beta;
    // se sostiene la punta en ese ángulo (como si el jugador la aguantara) para comparar sólo la resistencia
    for (let i = 0; i < 300 && sim.status === 'flying'; i++) { sim.beta = beta; sim.advance(0.2, { steer: 0, betaTarget: beta }); }
    return { alt: sim.altitude, vr: sim.radialSpeed };
  };
  const up = fall(0); const side = fall(Math.PI / 2); const down = fall(Math.PI);
  assert.ok(Math.abs(up.vr - side.vr) < 1e-6 && Math.abs(up.vr - down.vr) < 1e-6, `caída igual: ${up.vr} / ${side.vr} / ${down.vr}`);
  assert.ok(Math.abs(up.alt - side.alt) < 1e-3);
  assert.ok(up.vr < -100, 'y sí cae');
});

test('19 · sin empuje y con aire, la punta se alinea sola con el viento (como una flecha)', () => {
  const sim = freshSim();
  sim.status = 'flying'; sim.grounded = false; sim.fuel = sim.fuel.map(() => 0);
  sim.x = 0; sim.y = PHYS.RE + 30000; sim.vx = sim.atmRate * sim.y; sim.vy = -600; sim.beta = 0.6;
  for (let i = 0; i < 200 && sim.status === 'flying'; i++) sim.advance(0.2, { steer: 0 });
  assert.ok(Math.abs(Math.abs(sim.beta) - Math.PI) < 0.1, `punta hacia abajo: ${sim.beta}`);
});

test('20 · margen de pilotaje: mismo empuje y peso, el combustible dura más y sobra para la órbita', () => {
  const vi = vehicleFor('falcon9', 'LEO', data);
  const k = data.flight.calibration.pilotMargin.normal;
  const boosted = withPilotMargin(vi.vehicle, k);
  const a = boosted.stages[0]; const b = vi.vehicle.stages[0];
  assert.ok(Math.abs(a.mdot * a.ispSl - b.mdot * b.ispSl) / (b.mdot * b.ispSl) < 1e-9, 'mismo empuje');
  assert.equal(a.propKg, b.propKg);
  assert.ok(data.flight.calibration.pilotMargin.facil >= k && k >= data.flight.calibration.pilotMargin.dificil && data.flight.calibration.pilotMargin.dificil > 1);
  // con la carga máxima del catálogo: sin margen casi no sobra; con margen sobra y la órbita queda redonda
  const opts = { payloadKg: vi.capacityKg, destId: 'LEO', targetAltKm: 250, latDeg: 28.5, incDeg: 28.5 };
  const base = runAutopilot(vi.vehicle, opts, vi.program);
  const runs = [vi.program, { ...vi.program, coastDv: COAST_DV }].map((p) => runAutopilot(boosted, opts, p));
  const easy = runs.sort((x, y) => y.fuelLeftPct - x.fuelLeftPct)[0];
  assert.ok(easy.elements.periAlt >= PHYS.PERI_OK, 'llega a la órbita');
  assert.ok(easy.fuelLeftPct > base.fuelLeftPct + 0.8, `sobra más: ${base.fuelLeftPct} → ${easy.fuelLeftPct}`);
  assert.ok(easy.elements.apoAlt - easy.elements.periAlt < 60000, 'órbita casi redonda, sin estirar el otro lado');
});

test('21 · órbita lista: también vale una órbita redonda un poco más baja (no hay que quemar todo el combustible)', () => {
  const R = PHYS.RE;
  const el = (periKm, apoKm) => { const rp = R + periKm * 1000; const ra = R + apoKm * 1000; const a = (rp + ra) / 2; const v = Math.sqrt(PHYS.MU * (2 / ra - 1 / a)); return orbitElements(0, ra, v, 0); };
  assert.equal(orbitGoalMet(el(246, 252), 250000), true, 'llegó a la altura pedida');
  assert.equal(orbitGoalMet(el(232, 238), 250000), true, 'redonda, un poco más abajo');
  assert.equal(orbitGoalMet(el(160, 238), 250000), false, 'todavía ovalada');
  assert.equal(orbitGoalMet(el(120, 125), 250000), false, 'redonda pero dentro de la atmósfera');
});

test('22 · zoom del jugador: suave, con límites, y permite volver a ver la Tierra entera desde el espacio', () => {
  const cam = new FlightCamera(72);
  cam.reset(250000);
  const base = cam.mpp;
  let prev = cam.mpp;
  for (let i = 0; i < 40; i++) { // alejar todo lo que se pueda, un paso cada 0,2 s
    cam.zoom(-1);
    for (let k = 0; k < 12; k++) { cam.update(250000, 0, 1 / 60); assert.ok(cam.mpp / prev < 1.08 && cam.mpp >= prev - 1e-9, 'sin saltos'); prev = cam.mpp; }
  }
  for (let i = 0; i < 300; i++) cam.update(250000, 0, 1 / 60);
  assert.ok(Math.abs(cam.mpp - CAMERA.maxMpp) / CAMERA.maxMpp < 1e-3, 'tope: la Tierra entera cabe en pantalla');
  assert.ok(PHYS.RE / cam.mpp < 40 && cam.zoomOut > 100);
  for (let i = 0; i < 80; i++) cam.zoom(1); // acercar todo
  for (let i = 0; i < 300; i++) cam.update(250000, 0, 1 / 60);
  assert.ok(Math.abs(cam.mpp - CAMERA.mpp0) < 1e-3, 'tope: el cohete de cerca');
  cam.resetZoom();
  for (let i = 0; i < 300; i++) cam.update(250000, 0, 1 / 60);
  assert.ok(Math.abs(cam.mpp - base) / base < 1e-3, 'vuelve a la vista normal');
});
