import { catalogLanguage, simText } from "../../../src/i18n/catalog.js";
// Reglas deterministas del módulo lunar (sin Phaser, sin DOM, sin azar ni reloj real).
// Todo lo que cambia el estado de la misión pasa por aquí: la escena y la interfaz solo leen y dibujan.
// Unidades: energía en "u", potencia en "u/s", masa en kg, distancia en px del terreno.
// Costo en MILLONES DE DÓLARES (M US$): la misma moneda que el módulo de lanzamiento. Las cifras son aproximadas
// para el juego, del orden de un rover lunar pequeño de tipo comercial (decenas de millones de dólares).

export const LIMITS = Object.freeze({ mass: 145, budgetMUSD: 85 });
/** Dinero como en el módulo de lanzamiento: millones de dólares. */
export const fmtCost = (m) => simText("rover.0-million-usd", fmt(m));
export const WORLD = Object.freeze({ w: 1600, h: 1000 });
export const START = Object.freeze({ x: 800, y: 900 });
export const RULES = Object.freeze({
  sampleGoal: 3,        // muestras únicas que hay que analizar y transmitir
  collectRange: 44,     // distancia máxima para recoger (px)
  collectTime: 1.4,     // s de recolección
  collectEnergy: 3,     // u por recolección
  timeLimit: 480,       // s de misión tras el aterrizaje
  landingTime: 2.5,     // s de aterrizaje automático
  idleDraw: 0.15,       // u/s de electrónica base
  roverRadius: 18,
  bumpDraw: 1.2,        // u/s extra al empujar contra un obstáculo
  maxDt: 0.05,
  photoTxMultiplier: 0.7, // las fotos ocupan un paquete más pequeño que las muestras
  photoRange: 90,       // distancia máxima para fotografiar un punto de interés
  scanTime: 2, scanEnergy: 5, scanRange: 320, // radar de subsuelo: revela muestras ocultas
  ackTime: 1.2,         // s que tarda la Tierra en confirmar la recepción (visual, determinista)
});

export const CATEGORIES = Object.freeze([
  { id: 'chassis', get label() { return simText("rover.chassis"); }, required: true },
  { id: 'wheels', get label() { return simText("rover.wheels"); }, required: true },
  { id: 'battery', get label() { return simText("rover.battery"); }, required: true },
  { id: 'solar', get label() { return simText("rover.solar-panel"); }, required: true },
  { id: 'instrument', get label() { return simText("rover.science-instrument"); }, required: true },
  { id: 'camera', get label() { return simText("rover.camera"); }, required: true },
  { id: 'comms', get label() { return simText("rover.communications"); }, required: true },
]);

// Catálogo. Cada opción lleva sus números; `trade` es la consecuencia en una frase.
export const COMPONENTS = {
  chassis: [
    { id: 'ligero', name: 'Chasis ligero', mass: 38, cost: 18, speed: 80, moveDraw: 1.6, bumpMul: 1, trade: 'Rápido y eficiente, pero sin blindaje: los choques gastan más energía.' },
    { id: 'estandar', name: 'Chasis estándar', mass: 52, cost: 26, speed: 70, moveDraw: 2.0, bumpMul: 0.8, trade: 'Equilibrado en velocidad, consumo y resistencia.' },
    { id: 'reforzado', name: 'Chasis reforzado', mass: 68, cost: 34, speed: 58, moveDraw: 2.6, bumpMul: 0.4, trade: 'Aguanta choques, pero es lento, pesado y gasta más al moverse.' },
  ],
  wheels: [
    { id: 'ligeras', name: 'Ruedas ligeras', mass: 10, cost: 7, speedMul: 1.1, drawMul: 0.9, bumpMul: 1.5, trade: 'Baratas y veloces, pero sufren más en los choques.' },
    { id: 'estandar', name: 'Ruedas estándar', mass: 14, cost: 9, speedMul: 1.0, drawMul: 1.0, bumpMul: 1.0, trade: 'Opción neutra para casi cualquier terreno.' },
    { id: 'todoterreno', name: 'Ruedas todoterreno', mass: 20, cost: 15, speedMul: 0.95, drawMul: 1.15, bumpMul: 0.5, trade: 'Reducen a la mitad el daño por choques, a costa de masa y consumo.' },
  ],
  battery: [
    { id: 'pequena', name: 'Batería pequeña', mass: 10, cost: 8, capacity: 60, trade: 'Ligera, pero obliga a esperar recargas solares entre tareas.' },
    { id: 'media', name: 'Batería media', mass: 18, cost: 14, capacity: 100, trade: 'Autonomía razonable para una ruta con paradas.' },
    { id: 'grande', name: 'Batería grande', mass: 28, cost: 22, capacity: 150, trade: 'Mucha autonomía, pero pesa y consume presupuesto.' },
  ],
  solar: [
    { id: 'basico', name: 'Panel básico', mass: 6, cost: 6, gen: 0.6, trade: 'Recarga lenta: conviene una batería grande.' },
    { id: 'medio', name: 'Panel medio', mass: 11, cost: 12, gen: 1.2, trade: 'Recarga útil durante análisis y transmisiones.' },
    { id: 'avanzado', name: 'Panel avanzado', mass: 16, cost: 20, gen: 2.0, trade: 'Recarga rápida: permite una batería más pequeña.' },
  ],
  instrument: [
    { id: 'espectrometro', name: 'Espectrómetro', mass: 12, cost: 15, analysisTime: 4, analysisEnergy: 12, quality: 1.0, trade: 'Análisis equilibrado y económico.' },
    { id: 'taladro', name: 'Taladro de núcleo', mass: 22, cost: 21, analysisTime: 6, analysisEnergy: 18, quality: 1.5, trade: 'Mayor valor científico por muestra, pero lento y costoso en energía.' },
    { id: 'laser', name: 'Láser de ablación', mass: 15, cost: 19, analysisTime: 3, analysisEnergy: 15, quality: 1.2, trade: 'Análisis rápido con buen valor, a un precio medio-alto.' },
  ],
  camera: [
    { id: 'basica', name: 'Cámara básica', mass: 4, cost: 4, draw: 0.1, dataMul: 1.0, photoTime: 1.2, photoEnergy: 2, trade: 'Consumo mínimo; fotos y paquetes de datos de valor estándar.' },
    { id: 'hd', name: 'Cámara HD', mass: 8, cost: 9, draw: 0.3, dataMul: 1.5, photoTime: 0.8, photoEnergy: 3.5, trade: 'Fotos más rápidas y datos que valen 50 % más, pero gasta energía constantemente.' },
  ],
  comms: [
    { id: 'baja', name: 'Antena de baja ganancia', mass: 5, cost: 5, txTime: 3, txEnergy: 10, trade: 'Barata, pero transmite despacio y con más energía.' },
    { id: 'media', name: 'Antena media', mass: 9, cost: 10, txTime: 2, txEnergy: 8, trade: 'Buena relación entre tiempo, energía y masa.' },
    { id: 'alta', name: 'Antena de alta ganancia', mass: 14, cost: 17, txTime: 1.5, txEnergy: 6, trade: 'Transmisión rápida y eficiente, pero pesada y cara.' },
  ],
};

export const RECOMMENDED_BUILD = Object.freeze({
  chassis: 'ligero', wheels: 'estandar', battery: 'media', solar: 'medio',
  instrument: 'espectrometro', camera: 'basica', comms: 'media',
});

// Terreno fijo (mismos cráteres de la versión original, reescalados) y muestras con identidad única.
export const CRATERS = Object.freeze([
  { x: 360, y: 300, r: 90 }, { x: 780, y: 620, r: 104 }, { x: 1000, y: 250, r: 76 },
  { x: 260, y: 800, r: 70 }, { x: 1250, y: 700, r: 80 },
]);
export const ROCKS = Object.freeze([
  { x: 560, y: 820, r: 18 }, { x: 460, y: 560, r: 16 }, { x: 1420, y: 500, r: 18 }, { x: 900, y: 140, r: 16 },
  { x: 1180, y: 900, r: 14 }, { x: 140, y: 300, r: 20 }, { x: 640, y: 440, r: 14 },
]);
// Puntos de interés fotografiables. Algunos son obstáculos (módulo, monolito).
export const PHOTO_DEFS = Object.freeze([
  { id: 'P1', get name() { return simText("rover.lander"); }, kind: 'lander', x: 650, y: 945, r: 36, obstacle: true },
  { id: 'P2', get name() { return simText("rover.mission-flag"); }, kind: 'flag', x: 1010, y: 810, r: 10, obstacle: false },
  { id: 'P3', get name() { return simText("rover.aurora-crater-rim"); }, kind: 'rim', x: 780, y: 516, r: 8, obstacle: false },
  { id: 'P4', get name() { return simText("rover.basalt-monolith"); }, kind: 'monolith', x: 1100, y: 480, r: 22, obstacle: true },
]);
export const PHOTO_STATES = Object.freeze(['available', 'captured', 'transmitted']);
export const SAMPLE_DEFS = Object.freeze([
  { id: 'S1', get kind() { return simText("rover.highland-anorthosite"); }, x: 630, y: 260, value: 1.0 },
  { id: 'S2', get kind() { return simText("rover.lunar-mare-basalt"); }, x: 1350, y: 860, value: 1.2 },
  { id: 'S3', get kind() { return simText("rover.impact-breccia"); }, x: 210, y: 540, value: 1.1, hidden: true },
  { id: 'S4', get kind() { return simText("rover.water-ice-bearing-regolith"); }, x: 1380, y: 300, value: 0.9, hidden: true },
]);
export const SAMPLE_STATES = Object.freeze(['available', 'collected', 'analyzed', 'transmitted']);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- Construcción ----------

export function emptyBuild() {
  const b = {};
  for (const c of CATEGORIES) b[c.id] = null;
  return b;
}
export function getComponent(cat, id) {
  return (COMPONENTS[cat] || []).find((c) => c.id === id) || null;
}
// Una sola opción por categoría: la nueva REEMPLAZA a la anterior (nunca se acumula).
export function selectComponent(build, cat, id) {
  if (!getComponent(cat, id)) return { ...emptyBuild(), ...build };
  return { ...emptyBuild(), ...build, [cat]: id };
}
// Los totales se recalculan siempre desde la configuración, jamás se suman incrementalmente.
export function computeBuild(build) {
  const pick = {};
  const t = { mass: 0, cost: 0, capacity: 0, solar: 0, speed: 0, moveDraw: 0, idleDraw: RULES.idleDraw, bumpMul: 1,
    analysisTime: 0, analysisEnergy: 0, quality: 0, dataMul: 0, txTime: 0, txEnergy: 0, photoTxTime: 0, photoTxEnergy: 0, photoTime: 0, photoEnergy: 0 };
  for (const cat of CATEGORIES) {
    const comp = getComponent(cat.id, build && build[cat.id]);
    pick[cat.id] = comp;
    if (comp) { t.mass += comp.mass; t.cost += comp.cost; }
  }
  const { chassis, wheels, battery, solar, instrument, camera, comms } = pick;
  if (battery) t.capacity = battery.capacity;
  if (solar) t.solar = solar.gen;
  if (chassis && wheels) {
    t.speed = chassis.speed * wheels.speedMul;
    t.moveDraw = chassis.moveDraw * wheels.drawMul;
    t.bumpMul = chassis.bumpMul * wheels.bumpMul;
  }
  if (camera) { t.idleDraw += camera.draw; t.dataMul = camera.dataMul; t.photoTime = camera.photoTime; t.photoEnergy = camera.photoEnergy; }
  if (instrument) { t.analysisTime = instrument.analysisTime; t.analysisEnergy = instrument.analysisEnergy; t.quality = instrument.quality; }
  if (comms) { t.txTime = comms.txTime; t.txEnergy = comms.txEnergy; t.photoTxTime = comms.txTime * RULES.photoTxMultiplier; t.photoTxEnergy = comms.txEnergy * RULES.photoTxMultiplier; }
  t.mass = Math.round(t.mass * 100) / 100;
  t.moveDraw = Math.round(t.moveDraw * 1000) / 1000;
  t.speed = Math.round(t.speed * 100) / 100;
  t.bumpMul = Math.round(t.bumpMul * 1000) / 1000;
  return t;
}
export function validateBuild(build) {
  const stats = computeBuild(build);
  const reasons = [];
  const missing = CATEGORIES.filter((c) => c.required && !getComponent(c.id, build && build[c.id])).map((c) => c.label);
  if (missing.length) reasons.push(simText("rover.still-to-choose-0", missing.join(', ')));
  if (stats.mass > LIMITS.mass) reasons.push(simText("rover.mass-0-1-kg-remove-2-kg", fmt(stats.mass), LIMITS.mass, fmt(stats.mass - LIMITS.mass)));
  if (stats.cost > LIMITS.budgetMUSD) reasons.push(simText("rover.budget-0-out-of-1-cut-2", fmtCost(stats.cost), fmtCost(LIMITS.budgetMUSD), fmtCost(stats.cost - LIMITS.budgetMUSD)));
  return { ok: reasons.length === 0, reasons, missing, stats };
}
export function fmt(n, d = 1) {
  return Number(n).toLocaleString(catalogLanguage() === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: d });
}

// ---------- Misión ----------

export function createMission(build) {
  const v = validateBuild(build);
  if (!v.ok) throw new Error(simText("rover.invalid-build") + v.reasons.join(' '));
  return {
    build: Object.fromEntries(CATEGORIES.map(({ id }) => [id, build[id]])), stats: v.stats,
    phase: 'landing', t: 0, elapsed: 0,
    rover: { x: START.x, y: START.y, facing: 1, moving: false, blocked: false },
    battery: v.stats.capacity, minBattery: v.stats.capacity, energyUsed: 0,
    samples: SAMPLE_DEFS.map((s) => ({ ...s, state: 'available', revealed: !s.hidden })),
    photos: PHOTO_DEFS.map((p) => ({ ...p, state: 'available' })), acks: {}, scans: 0,
    inventory: [], action: null, bumps: 0, distance: 0, noPower: false, endReason: null,
  };
}
export function progress(m) {
  const s = m.samples, ph = m.photos;
  return {
    collected: s.filter((x) => x.state !== 'available').length,
    analyzed: s.filter((x) => x.state === 'analyzed' || x.state === 'transmitted').length,
    transmitted: s.filter((x) => x.state === 'transmitted').length,
    goal: RULES.sampleGoal,
    photos: ph.filter((x) => x.state !== 'available').length,
    photosTransmitted: ph.filter((x) => x.state === 'transmitted').length,
    photoTotal: ph.length,
    discovered: s.filter((x) => x.hidden && x.revealed).length,
    hiddenTotal: s.filter((x) => x.hidden).length,
    scans: m.scans,
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function blockedAt(x, y) {
  const R = RULES.roverRadius;
  if (x < R || y < R || x > WORLD.w - R || y > WORLD.h - R) return true;
  return CRATERS.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + R) || ROCKS.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + R)
    || PHOTO_DEFS.some((c) => c.obstacle && Math.hypot(x - c.x, y - c.y) < c.r + R);
}

export const ACTIONS = Object.freeze(['collect', 'analyze', 'transmit', 'photo', 'scan']);
const nearest = (m, list) => [...list].sort((a, b) => dist(m.rover, a) - dist(m.rover, b));

// Qué haría la acción ahora: objetivo, coste y duración (o el motivo exacto por el que no se puede).
function plan(m, type) {
  const st = m.stats;
  if (type === 'collect') {
    const free = m.samples.filter((s) => s.state === 'available' && s.revealed);
    if (m.samples.some((s) => s.state === 'available' && !s.revealed && dist(m.rover, s) <= RULES.collectRange * 3))
      return { reason: simText("rover.the-sensors-detected-something-beneath-the-nearby-regolith") };
    if (!free.length) {
      const hid = m.samples.some((s) => s.state === 'available' && !s.revealed);
      return { reason: hid ? simText("rover.some-samples-are-still-hidden-use-the-scanner") : simText("rover.no-samples-left-to-collect") };
    }
    const n = nearest(m, free)[0];
    if (dist(m.rover, n) > RULES.collectRange) return { reason: simText("rover.move-within-0-px-of-a-sample-the", RULES.collectRange, Math.round(dist(m.rover, n))) };
    return { target: n, kind: 'sample', duration: RULES.collectTime, energy: RULES.collectEnergy, from: 'available', to: 'collected', label: simText("rover.collection") };
  }
  if (type === 'analyze') {
    const t = m.inventory.map((id) => m.samples.find((s) => s.id === id)).find((s) => s && s.state === 'collected');
    if (!t) return { reason: m.inventory.length ? simText("rover.all-collected-samples-have-been-analyzed") : simText("rover.collect-a-sample-first") };
    return { target: t, kind: 'sample', duration: st.analysisTime, energy: st.analysisEnergy, from: 'collected', to: 'analyzed', label: simText("rover.analysis") };
  }
  if (type === 'transmit') {
    const smp = m.samples.find((s) => s.state === 'analyzed');
    if (smp) return { target: smp, kind: 'sample', duration: st.txTime, energy: st.txEnergy, from: 'analyzed', to: 'transmitted', label: simText("rover.transmission") };
    const ph = m.photos.find((p) => p.state === 'captured');
    if (ph) return { target: ph, kind: 'photo', duration: st.photoTxTime, energy: st.photoTxEnergy, from: 'captured', to: 'transmitted', label: simText("rover.transmission") };
    return { reason: simText("rover.no-analyses-or-photos-ready-to-transmit") };
  }
  if (type === 'photo') {
    const free = m.photos.filter((p) => p.state === 'available');
    if (!free.length) return { reason: simText("rover.you-have-photographed-every-point-of-interest") };
    const n = nearest(m, free)[0], d = Math.max(0, dist(m.rover, n) - n.r);
    if (d > RULES.photoRange) return { reason: simText("rover.move-within-0-px-of-a-point-of", RULES.photoRange, n.name, Math.round(d)) };
    return { target: n, kind: 'photo', duration: st.photoTime, energy: st.photoEnergy, from: 'available', to: 'captured', label: simText("rover.photography") };
  }
  if (type === 'scan') return { target: null, kind: 'area', duration: RULES.scanTime, energy: RULES.scanEnergy, label: simText("rover.subsurface-scan") };
  return { reason: simText("rover.unknown-action") };
}

// ¿Se puede iniciar esta acción ahora? Devuelve el motivo exacto si no.
export function availability(m, type) {
  if (m.phase !== 'explore') return { ok: false, reason: m.phase === 'landing' ? simText("rover.landing-in-progress") : simText("rover.the-mission-is-over") };
  if (m.action) return { ok: false, reason: simText("rover.another-action-is-in-progress") };
  const p = plan(m, type);
  if (p.reason) return { ok: false, reason: p.reason };
  if (m.battery < p.energy) return { ok: false, reason: simText("rover.not-enough-energy-you-need-0-units-and", fmt(p.energy), fmt(m.battery)) };
  return { ok: true, target: p.target, cost: p.energy };
}
export function startAction(m, type) {
  const av = availability(m, type);
  if (!av.ok) return av;
  const p = plan(m, type);
  m.action = { type, kind: p.kind, targetId: p.target ? p.target.id : null, progress: 0, duration: p.duration, drawPerSec: p.energy / p.duration, label: p.label, from: p.from, to: p.to };
  return { ok: true, target: p.target };
}
export function cancelAction(m, why) {
  if (!m.action) return null;
  const a = m.action; m.action = null; // el objetivo conserva su estado: no se retira ni se cuenta nada
  return { type: 'action-failed', action: a.type, targetId: a.targetId, reason: why };
}

// Avanza la simulación `dt` segundos. `input` = { dx, dy } en [-1,1]. Devuelve la lista de eventos ocurridos.
export function step(m, input, dt) {
  const events = [];
  dt = clamp(Number(dt) || 0, 0, RULES.maxDt);
  for (const id of Object.keys(m.acks)) if (m.acks[id] < 1) m.acks[id] = Math.min(1, m.acks[id] + dt / RULES.ackTime); // confirmación de la Tierra
  if (m.phase === 'success' || m.phase === 'failed') return events;
  if (m.phase === 'landing') {
    m.t += dt;
    if (m.t >= RULES.landingTime) { m.phase = 'explore'; events.push({ type: 'landed' }); }
    return events;
  }
  m.elapsed += dt;
  const dx = clamp((input && input.dx) || 0, -1, 1), dy = clamp((input && input.dy) || 0, -1, 1);
  const wants = dx !== 0 || dy !== 0;
  if (wants && m.action) {
    const ev = cancelAction(m, simText("rover.the-rover-moved-the-action-was-canceled-and"));
    if (ev) events.push(ev);
  }
  let moved = false, blocked = false;
  m.noPower = false;
  if (wants && !m.action) {
    if (m.battery <= 0) { m.noPower = true; }
    else {
      const len = Math.hypot(dx, dy), sp = m.stats.speed * dt;
      const nx = m.rover.x + (dx / len) * sp, ny = m.rover.y + (dy / len) * sp;
      let fx = m.rover.x, fy = m.rover.y;
      if (!blockedAt(nx, ny)) { fx = nx; fy = ny; }
      else if (!blockedAt(nx, m.rover.y) && dx !== 0) { fx = nx; }
      else if (!blockedAt(m.rover.x, ny) && dy !== 0) { fy = ny; }
      moved = fx !== m.rover.x || fy !== m.rover.y;
      blocked = !moved;
      m.distance += Math.hypot(fx - m.rover.x, fy - m.rover.y);
      m.rover.x = fx; m.rover.y = fy;
      if (dx !== 0) m.rover.facing = dx > 0 ? 1 : -1;
    }
  }
  if (blocked && !m.rover.blocked) { m.bumps++; events.push({ type: 'bump' }); }
  m.rover.moving = moved; m.rover.blocked = blocked;

  // Energía: consumo según lo que se hace; recarga solar solo con el rover detenido (también durante acciones).
  let draw = m.stats.idleDraw;
  if (moved) draw += m.stats.moveDraw;
  if (blocked) draw += RULES.bumpDraw * m.stats.bumpMul;
  if (m.action) draw += m.action.drawPerSec;
  const gen = moved || blocked ? 0 : m.stats.solar;
  m.battery = clamp(m.battery + (gen - draw) * dt, 0, m.stats.capacity);
  m.energyUsed += Math.max(0, (draw - gen) * dt);
  m.minBattery = Math.min(m.minBattery, m.battery);

  if (m.action) {
    if (m.battery <= 0) {
      events.push(cancelAction(m, simText("rover.out-of-energy-the-action-failed-and-nothing")));
    } else {
      m.action.progress += dt / m.action.duration;
      if (m.action.progress >= 1) {
        const a = m.action; m.action = null;
        if (a.type === 'scan') {
          const found = m.samples.filter((s) => !s.revealed && s.state === 'available' && dist(m.rover, s) <= RULES.scanRange);
          for (const s of found) s.revealed = true;
          m.scans++;
          events.push({ type: 'scanned', found: found.map((s) => s.id) });
        } else {
          const list = a.kind === 'photo' ? m.photos : m.samples;
          const obj = list.find((x) => x.id === a.targetId);
          if (obj && obj.state === a.from) { // protege contra doble conteo: solo la transición válida cuenta
            obj.state = a.to;
            if (a.type === 'collect') m.inventory.push(obj.id);
            if (a.to === 'transmitted') m.acks[obj.id] = 0;
            const type = { collect: 'collected', analyze: 'analyzed', transmit: 'transmitted', photo: 'photographed' }[a.type];
            events.push({ type, targetId: obj.id, kind: a.kind });
          }
        }
      }
    }
  }
  if (progress(m).transmitted >= RULES.sampleGoal) { m.phase = 'success'; m.endReason = 'objetivo'; events.push({ type: 'success' }); }
  else if (m.elapsed >= RULES.timeLimit) { m.phase = 'failed'; m.endReason = 'tiempo'; events.push({ type: 'failed', reason: 'tiempo' }); }
  return events;
}
// ¿La Tierra ya confirmó todo lo transmitido? (la interfaz espera esto antes de mostrar resultados)
export const allAcked = (m) => Object.values(m.acks).every((v) => v >= 1);

// Paquetes de datos para el centro de datos: cada muestra y foto con su etapa y porcentaje 0–100.
export function dataPackets(m) {
  const out = [];
  for (const s of m.samples) {
    if (s.state === 'available') continue;
    const a = m.action && m.action.targetId === s.id ? m.action : null;
    const act = a ? Math.round(clamp(a.progress, 0, 1) * 100) : 0;
    let stage, pct, overall;
    if (s.state === 'collected') { stage = a && a.type === 'analyze' ? simText("rover.analyzing") : simText("rover.awaiting-analysis"); pct = a ? act : 0; overall = 25 + pct * 0.25; }
    else if (s.state === 'analyzed') { stage = a && a.type === 'transmit' ? simText("rover.transmitting") : simText("rover.ready-to-send"); pct = a ? act : 0; overall = 50 + pct * 0.25; }
    else { const k = Math.round((m.acks[s.id] === undefined ? 1 : m.acks[s.id]) * 100); stage = k >= 100 ? simText("rover.received-on-earth") : simText("rover.awaiting-confirmation"); pct = k; overall = 75 + k * 0.25; }
    out.push({ id: s.id, kind: 'sample', title: s.kind, stage, pct, overall: Math.round(overall), state: s.state, active: !!a });
  }
  for (const p of m.photos) {
    if (p.state === 'available') continue;
    const a = m.action && m.action.targetId === p.id ? m.action : null;
    const act = a ? Math.round(clamp(a.progress, 0, 1) * 100) : 0;
    let stage, pct, overall;
    if (p.state === 'captured') { stage = a && a.type === 'transmit' ? simText("rover.transmitting") : simText("rover.photo-ready-to-send"); pct = a ? act : 0; overall = 50 + pct * 0.25; }
    else { const k = Math.round((m.acks[p.id] === undefined ? 1 : m.acks[p.id]) * 100); stage = k >= 100 ? simText("rover.received-on-earth-2") : simText("rover.awaiting-confirmation"); pct = k; overall = 75 + k * 0.25; }
    out.push({ id: p.id, kind: 'photo', title: p.name, stage, pct, overall: Math.round(overall), state: p.state, active: !!a });
  }
  return out;
}

// ---------- Evaluación (determinista) ----------

export function evaluate(m) {
  const p = progress(m), st = m.stats, ok = m.phase === 'success';
  const science = Math.round(m.samples.filter((s) => s.state === 'analyzed' || s.state === 'transmitted')
    .reduce((a, s) => a + 100 * st.quality * s.value, 0));
  const data = Math.round(p.transmitted * 60 * st.dataMul);
  const photos = Math.round(p.photosTransmitted * 40 * st.dataMul);
  const discoveries = p.discovered * 15;
  const energyPct = st.capacity ? Math.round((m.battery / st.capacity) * 100) : 0;
  const bonusEnergy = ok ? Math.round(energyPct * 0.5) : 0;
  const bonusTime = ok ? Math.max(0, Math.round((1 - m.elapsed / RULES.timeLimit) * 100)) : 0;
  const bonusBudget = ok ? Math.max(0, Math.floor(LIMITS.budgetMUSD - st.cost)) : 0; // 1 punto por cada millón sin gastar
  const penalty = Math.min(40, m.bumps * 5);
  const score = Math.max(0, science + data + photos + discoveries + bonusEnergy + bonusTime + bonusBudget - penalty);
  const rating = !ok ? 'X' : score >= 900 ? 'A' : score >= 720 ? 'B' : 'C';
  const breakdown = [
    { label: simText("rover.science-samples-analyzed"), points: science },
    { label: simText("rover.data-transmitted"), points: data },
    { label: simText("rover.photos-transmitted"), points: photos },
    { label: simText("rover.samples-found-with-the-scanner"), points: discoveries },
    { label: simText("rover.energy-remaining"), points: bonusEnergy },
    { label: simText("rover.time-remaining"), points: bonusTime },
    { label: simText("rover.budget-remaining"), points: bonusBudget },
    { label: simText("rover.collisions"), points: -penalty },
  ];
  const objectives = [
    { label: simText("rover.transmit-0-analyzed-samples", RULES.sampleGoal), done: p.transmitted >= RULES.sampleGoal, main: true },
    { label: simText("rover.take-and-transmit-photos-of-2-points-of"), done: p.photosTransmitted >= 2 },
    { label: simText("rover.use-the-scanner-to-find-a-hidden-sample"), done: p.discovered >= 1 },
    { label: simText("rover.finish-without-collisions"), done: ok && m.bumps === 0 },
    { label: simText("rover.finish-with-at-least-50-battery"), done: ok && energyPct >= 50 },
  ];
  const suggestions = [];
  if (!ok && m.endReason === 'tiempo') suggestions.push(simText("rover.time-ran-out-plan-a-shorter-route-or"));
  if (m.minBattery < st.capacity * 0.1) suggestions.push(simText("rover.battery-fell-to-0-of-1-units-use", fmt(m.minBattery), st.capacity));
  if (m.bumps > 2) suggestions.push(simText("rover.you-hit-0-obstacles-1-points-all-terrain", m.bumps, penalty));
  if (ok && m.elapsed > RULES.timeLimit * 0.7) suggestions.push(simText("rover.you-finished-with-little-time-to-spare-a"));
  if (p.photosTransmitted < 2) suggestions.push(simText("rover.photographing-and-transmitting-points-of-interest-earns-extra"));
  if (p.discovered === 0) suggestions.push(simText("rover.you-did-not-use-the-scanner-hidden-samples") + RULES.scanRange + ' px.');
  if (LIMITS.budgetMUSD - st.cost >= 20) suggestions.push(simText("rover.you-had-0-left-a-higher-quality-instrument", fmtCost(LIMITS.budgetMUSD - st.cost)));
  if (ok && !suggestions.length) suggestions.push(simText("rover.your-build-and-route-were-well-balanced-try"));
  const explanation = ok
    ? simText("rover.mission-complete-you-analyzed-and-transmitted-0-unique", p.transmitted, fmt(m.elapsed, 0), energyPct, score, rating)
    : simText("rover.mission-incomplete-you-sent-0-of-1-required", p.transmitted, RULES.sampleGoal, p.analyzed, p.collected, score);
  return { success: ok, score, rating, breakdown, objectives, suggestions, explanation, progress: p, energyPct, elapsed: m.elapsed, bumps: m.bumps, stats: st, packets: dataPackets(m) };
}

// ---------- Guardado ----------

export function snapshot(m) {
  return {
    v: 2, build: m.build, campaignRun: m.campaignRun ?? null, phase: m.phase, t: m.t, elapsed: m.elapsed, rover: { x: m.rover.x, y: m.rover.y, facing: m.rover.facing },
    battery: m.battery, minBattery: m.minBattery, energyUsed: m.energyUsed, bumps: m.bumps, distance: m.distance, scans: m.scans,
    inventory: [...m.inventory], acks: { ...m.acks }, samples: m.samples.map((s) => ({ id: s.id, state: s.state, revealed: s.revealed })),
    photos: m.photos.map((p) => ({ id: p.id, state: p.state })),
  };
}
// Devuelve una misión válida o null si el guardado está dañado / es de otra versión.
export function restoreMission(snap) {
  try {
    if (!snap || ![1, 2].includes(snap.v) || !validateBuild(snap.build).ok) return null;
    const legacy = snap.v === 1;
    if (snap.phase !== 'landing' && snap.phase !== 'explore') return null;
    const m = createMission(snap.build);
    m.campaignRun = typeof snap.campaignRun === 'string' ? snap.campaignRun : null;
    const nums = [snap.t, snap.elapsed, snap.battery, snap.minBattery, snap.energyUsed, snap.bumps, snap.distance, snap.rover && snap.rover.x, snap.rover && snap.rover.y];
    if (!nums.every(num) || !Array.isArray(snap.samples) || snap.samples.length !== m.samples.length) return null;
    if (!legacy && (!num(snap.scans) || !Array.isArray(snap.photos) || snap.photos.length !== m.photos.length)) return null;
    const sampleIds = new Set();
    for (const s of snap.samples) {
      const target = m.samples.find((x) => x.id === s.id);
      if (!target || sampleIds.has(s.id) || !SAMPLE_STATES.includes(s.state)) return null;
      sampleIds.add(s.id);
      target.state = s.state;
      target.revealed = !target.hidden || s.revealed === true || s.state !== 'available';
    }
    const photoIds = new Set();
    for (const p of legacy ? [] : snap.photos) {
      const target = m.photos.find((x) => x.id === p.id);
      if (!target || photoIds.has(p.id) || !PHOTO_STATES.includes(p.state)) return null;
      photoIds.add(p.id);
      target.state = p.state;
      if (p.state === 'transmitted') m.acks[p.id] = num(snap.acks?.[p.id]) ? clamp(snap.acks[p.id], 0, 1) : 1;
    }
    for (const s of m.samples) if (s.state === 'transmitted') m.acks[s.id] = num(snap.acks?.[s.id]) ? clamp(snap.acks[s.id], 0, 1) : 1;
    m.phase = snap.phase; m.t = Math.max(0, snap.t); m.elapsed = Math.max(0, snap.elapsed); m.scans = legacy ? 0 : Math.max(0, Math.floor(snap.scans));
    m.rover.x = clamp(snap.rover.x, 0, WORLD.w); m.rover.y = clamp(snap.rover.y, 0, WORLD.h);
    if (blockedAt(m.rover.x, m.rover.y)) { m.rover.x = START.x; m.rover.y = START.y; }
    m.rover.facing = snap.rover.facing === -1 ? -1 : 1;
    m.battery = clamp(snap.battery, 0, m.stats.capacity); m.minBattery = clamp(snap.minBattery, 0, m.stats.capacity);
    m.energyUsed = Math.max(0, snap.energyUsed); m.bumps = Math.max(0, Math.floor(snap.bumps)); m.distance = Math.max(0, snap.distance);
    // El inventario se reconstruye desde los estados (sin duplicados, sin ids desconocidos).
    const seen = new Set();
    m.inventory = (Array.isArray(snap.inventory) ? snap.inventory : []).filter((id) => {
      const s = m.samples.find((x) => x.id === id);
      if (!s || s.state === 'available' || seen.has(id)) return false; seen.add(id); return true;
    });
    for (const s of m.samples) if (s.state !== 'available' && !seen.has(s.id)) m.inventory.push(s.id);
    return m;
  } catch { return null; }
}
