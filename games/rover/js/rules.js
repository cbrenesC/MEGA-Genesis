// Reglas deterministas del módulo lunar (sin Phaser, sin DOM, sin azar ni reloj real).
// Todo lo que cambia el estado de la misión pasa por aquí: la escena y la interfaz solo leen y dibujan.
// Unidades: energía en "u", potencia en "u/s", masa en kg, costo en créditos, distancia en px del terreno.

export const LIMITS = Object.freeze({ mass: 145, credits: 850 });
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
});

export const CATEGORIES = Object.freeze([
  { id: 'chassis', label: 'Chasis', required: true },
  { id: 'wheels', label: 'Ruedas', required: true },
  { id: 'battery', label: 'Batería', required: true },
  { id: 'solar', label: 'Panel solar', required: true },
  { id: 'instrument', label: 'Instrumento científico', required: true },
  { id: 'camera', label: 'Cámara', required: true },
  { id: 'comms', label: 'Comunicaciones', required: true },
]);

// Catálogo. Cada opción lleva sus números; `trade` es la consecuencia en una frase.
export const COMPONENTS = {
  chassis: [
    { id: 'ligero', name: 'Chasis ligero', mass: 38, cost: 180, speed: 80, moveDraw: 1.6, bumpMul: 1, trade: 'Rápido y eficiente, pero sin blindaje: los choques gastan más energía.' },
    { id: 'estandar', name: 'Chasis estándar', mass: 52, cost: 260, speed: 70, moveDraw: 2.0, bumpMul: 0.8, trade: 'Equilibrado en velocidad, consumo y resistencia.' },
    { id: 'reforzado', name: 'Chasis reforzado', mass: 68, cost: 340, speed: 58, moveDraw: 2.6, bumpMul: 0.4, trade: 'Aguanta choques, pero es lento, pesado y gasta más al moverse.' },
  ],
  wheels: [
    { id: 'ligeras', name: 'Ruedas ligeras', mass: 10, cost: 70, speedMul: 1.1, drawMul: 0.9, bumpMul: 1.5, trade: 'Baratas y veloces, pero sufren más en los choques.' },
    { id: 'estandar', name: 'Ruedas estándar', mass: 14, cost: 90, speedMul: 1.0, drawMul: 1.0, bumpMul: 1.0, trade: 'Opción neutra para casi cualquier terreno.' },
    { id: 'todoterreno', name: 'Ruedas todoterreno', mass: 20, cost: 150, speedMul: 0.95, drawMul: 1.15, bumpMul: 0.5, trade: 'Reducen a la mitad el daño por choques, a costa de masa y consumo.' },
  ],
  battery: [
    { id: 'pequena', name: 'Batería pequeña', mass: 10, cost: 80, capacity: 60, trade: 'Ligera, pero obliga a esperar recargas solares entre tareas.' },
    { id: 'media', name: 'Batería media', mass: 18, cost: 140, capacity: 100, trade: 'Autonomía razonable para una ruta con paradas.' },
    { id: 'grande', name: 'Batería grande', mass: 28, cost: 220, capacity: 150, trade: 'Mucha autonomía, pero pesa y consume presupuesto.' },
  ],
  solar: [
    { id: 'basico', name: 'Panel básico', mass: 6, cost: 60, gen: 0.6, trade: 'Recarga lenta: conviene una batería grande.' },
    { id: 'medio', name: 'Panel medio', mass: 11, cost: 120, gen: 1.2, trade: 'Recarga útil durante análisis y transmisiones.' },
    { id: 'avanzado', name: 'Panel avanzado', mass: 16, cost: 200, gen: 2.0, trade: 'Recarga rápida: permite una batería más pequeña.' },
  ],
  instrument: [
    { id: 'espectrometro', name: 'Espectrómetro', mass: 12, cost: 150, analysisTime: 4, analysisEnergy: 12, quality: 1.0, trade: 'Análisis equilibrado y económico.' },
    { id: 'taladro', name: 'Taladro de núcleo', mass: 22, cost: 210, analysisTime: 6, analysisEnergy: 18, quality: 1.5, trade: 'Mayor valor científico por muestra, pero lento y costoso en energía.' },
    { id: 'laser', name: 'Láser de ablación', mass: 15, cost: 190, analysisTime: 3, analysisEnergy: 15, quality: 1.2, trade: 'Análisis rápido con buen valor, a un precio medio-alto.' },
  ],
  camera: [
    { id: 'basica', name: 'Cámara básica', mass: 4, cost: 40, draw: 0.1, dataMul: 1.0, trade: 'Consumo mínimo; los paquetes de datos valen lo estándar.' },
    { id: 'hd', name: 'Cámara HD', mass: 8, cost: 90, draw: 0.3, dataMul: 1.5, trade: 'Cada transmisión vale 50 % más, pero gasta energía constantemente.' },
  ],
  comms: [
    { id: 'baja', name: 'Antena de baja ganancia', mass: 5, cost: 50, txTime: 3, txEnergy: 10, trade: 'Barata, pero transmite despacio y con más energía.' },
    { id: 'media', name: 'Antena media', mass: 9, cost: 100, txTime: 2, txEnergy: 8, trade: 'Buena relación entre tiempo, energía y masa.' },
    { id: 'alta', name: 'Antena de alta ganancia', mass: 14, cost: 170, txTime: 1.5, txEnergy: 6, trade: 'Transmisión rápida y eficiente, pero pesada y cara.' },
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
  { x: 560, y: 820, r: 18 }, { x: 1100, y: 480, r: 20 }, { x: 460, y: 560, r: 16 }, { x: 1420, y: 500, r: 18 }, { x: 900, y: 140, r: 16 },
]);
export const SAMPLE_DEFS = Object.freeze([
  { id: 'S1', kind: 'Regolito claro', x: 630, y: 260, value: 1.0 },
  { id: 'S2', kind: 'Basalto oscuro', x: 1350, y: 860, value: 1.2 },
  { id: 'S3', kind: 'Fragmento de cráter', x: 210, y: 540, value: 1.1 },
  { id: 'S4', kind: 'Polvo de alta cresta', x: 1380, y: 300, value: 0.9 },
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
    analysisTime: 0, analysisEnergy: 0, quality: 0, dataMul: 0, txTime: 0, txEnergy: 0 };
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
  if (camera) { t.idleDraw += camera.draw; t.dataMul = camera.dataMul; }
  if (instrument) { t.analysisTime = instrument.analysisTime; t.analysisEnergy = instrument.analysisEnergy; t.quality = instrument.quality; }
  if (comms) { t.txTime = comms.txTime; t.txEnergy = comms.txEnergy; }
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
  if (missing.length) reasons.push(`Falta elegir: ${missing.join(', ')}.`);
  if (stats.mass > LIMITS.mass) reasons.push(`Masa ${fmt(stats.mass)}/${LIMITS.mass} kg: reduce ${fmt(stats.mass - LIMITS.mass)} kg.`);
  if (stats.cost > LIMITS.credits) reasons.push(`Presupuesto ${stats.cost}/${LIMITS.credits} créditos: reduce ${stats.cost - LIMITS.credits}.`);
  return { ok: reasons.length === 0, reasons, missing, stats };
}
export function fmt(n, d = 1) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: d });
}

// ---------- Misión ----------

export function createMission(build) {
  const v = validateBuild(build);
  if (!v.ok) throw new Error('Configuración inválida: ' + v.reasons.join(' '));
  return {
    build: { ...emptyBuild(), ...build }, stats: v.stats,
    phase: 'landing', t: 0, elapsed: 0,
    rover: { x: START.x, y: START.y, facing: 1, moving: false, blocked: false },
    battery: v.stats.capacity, minBattery: v.stats.capacity, energyUsed: 0,
    samples: SAMPLE_DEFS.map((s) => ({ ...s, state: 'available' })),
    inventory: [], action: null, bumps: 0, distance: 0, noPower: false, endReason: null,
  };
}
export function progress(m) {
  const s = m.samples;
  return {
    collected: s.filter((x) => x.state !== 'available').length,
    analyzed: s.filter((x) => x.state === 'analyzed' || x.state === 'transmitted').length,
    transmitted: s.filter((x) => x.state === 'transmitted').length,
    goal: RULES.sampleGoal,
  };
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function blockedAt(x, y) {
  const R = RULES.roverRadius;
  if (x < R || y < R || x > WORLD.w - R || y > WORLD.h - R) return true;
  return CRATERS.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + R) || ROCKS.some((c) => Math.hypot(x - c.x, y - c.y) < c.r + R);
}

// ¿Se puede iniciar esta acción ahora? Devuelve el motivo exacto si no.
export function availability(m, type) {
  if (m.phase !== 'explore') return { ok: false, reason: m.phase === 'landing' ? 'Aterrizaje en curso.' : 'La misión ha terminado.' };
  if (m.action) return { ok: false, reason: 'Ya hay una acción en curso.' };
  const need = (cost) => (m.battery < cost ? `Energía insuficiente: necesitas ${fmt(cost)} u y tienes ${fmt(m.battery)} u. Espera la recarga solar.` : null);
  let target = null; let cost = 0;
  if (type === 'collect') {
    const free = m.samples.filter((s) => s.state === 'available');
    if (!free.length) return { ok: false, reason: 'No quedan muestras por recoger.' };
    free.sort((a, b) => dist(m.rover, a) - dist(m.rover, b));
    if (dist(m.rover, free[0]) > RULES.collectRange) return { ok: false, reason: `Acércate a una muestra (menos de ${RULES.collectRange} px). La más cercana está a ${Math.round(dist(m.rover, free[0]))} px.` };
    target = free[0]; cost = RULES.collectEnergy;
  } else if (type === 'analyze') {
    target = m.inventory.map((id) => m.samples.find((s) => s.id === id)).find((s) => s && s.state === 'collected');
    if (!target) return { ok: false, reason: m.inventory.length ? 'Todas las muestras recogidas ya están analizadas.' : 'Primero recoge una muestra.' };
    cost = m.stats.analysisEnergy;
  } else if (type === 'transmit') {
    target = m.samples.find((s) => s.state === 'analyzed');
    if (!target) return { ok: false, reason: 'No hay análisis pendientes de transmitir.' };
    cost = m.stats.txEnergy;
  } else return { ok: false, reason: 'Acción desconocida.' };
  const e = need(cost);
  if (e) return { ok: false, reason: e };
  return { ok: true, target, cost };
}
const ACTION_INFO = {
  collect: (m) => ({ duration: RULES.collectTime, energy: RULES.collectEnergy, from: 'available', to: 'collected', label: 'Recolección' }),
  analyze: (m) => ({ duration: m.stats.analysisTime, energy: m.stats.analysisEnergy, from: 'collected', to: 'analyzed', label: 'Análisis' }),
  transmit: (m) => ({ duration: m.stats.txTime, energy: m.stats.txEnergy, from: 'analyzed', to: 'transmitted', label: 'Transmisión' }),
};
export function startAction(m, type) {
  const av = availability(m, type);
  if (!av.ok) return av;
  const info = ACTION_INFO[type](m);
  m.action = { type, sampleId: av.target.id, progress: 0, duration: info.duration, drawPerSec: info.energy / info.duration, label: info.label };
  return { ok: true, target: av.target };
}
export function cancelAction(m, why) {
  if (!m.action) return null;
  const a = m.action; m.action = null; // la muestra conserva su estado: no se retira ni se cuenta nada
  return { type: 'action-failed', action: a.type, sampleId: a.sampleId, reason: why };
}

// Avanza la simulación `dt` segundos. `input` = { dx, dy } en [-1,1]. Devuelve la lista de eventos ocurridos.
export function step(m, input, dt) {
  const events = [];
  if (m.phase === 'success' || m.phase === 'failed') return events;
  dt = clamp(Number(dt) || 0, 0, RULES.maxDt);
  if (m.phase === 'landing') {
    m.t += dt;
    if (m.t >= RULES.landingTime) { m.phase = 'explore'; events.push({ type: 'landed' }); }
    return events;
  }
  m.elapsed += dt;
  const dx = clamp((input && input.dx) || 0, -1, 1), dy = clamp((input && input.dy) || 0, -1, 1);
  const wants = dx !== 0 || dy !== 0;
  if (wants && m.action) {
    const ev = cancelAction(m, 'El rover se movió: la acción se canceló y la muestra no cambió.');
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
  const before = m.battery;
  m.battery = clamp(before + (gen - draw) * dt, 0, m.stats.capacity);
  m.energyUsed += Math.max(0, (draw - gen) * dt);
  m.minBattery = Math.min(m.minBattery, m.battery);

  if (m.action) {
    if (m.battery <= 0) {
      events.push(cancelAction(m, 'Sin energía: la acción falló y la muestra no cambió.'));
    } else {
      m.action.progress += dt / m.action.duration;
      if (m.action.progress >= 1) {
        const a = m.action; m.action = null;
        const info = ACTION_INFO[a.type](m);
        const s = m.samples.find((x) => x.id === a.sampleId);
        if (s && s.state === info.from) { // protege contra doble conteo: solo la transición válida cuenta
          s.state = info.to;
          if (a.type === 'collect') m.inventory.push(s.id);
          events.push({ type: a.type === 'collect' ? 'collected' : a.type === 'analyze' ? 'analyzed' : 'transmitted', sampleId: s.id });
        }
      }
    }
  }
  if (progress(m).transmitted >= RULES.sampleGoal) { m.phase = 'success'; m.endReason = 'objetivo'; events.push({ type: 'success' }); }
  else if (m.elapsed >= RULES.timeLimit) { m.phase = 'failed'; m.endReason = 'tiempo'; events.push({ type: 'failed', reason: 'tiempo' }); }
  return events;
}

// ---------- Evaluación (determinista) ----------

export function evaluate(m) {
  const p = progress(m), st = m.stats, ok = m.phase === 'success';
  const science = Math.round(m.samples.filter((s) => s.state === 'analyzed' || s.state === 'transmitted')
    .reduce((a, s) => a + 100 * st.quality * s.value, 0));
  const data = Math.round(p.transmitted * 60 * st.dataMul);
  const energyPct = st.capacity ? Math.round((m.battery / st.capacity) * 100) : 0;
  const bonusEnergy = ok ? Math.round(energyPct * 0.5) : 0;
  const bonusTime = ok ? Math.max(0, Math.round((1 - m.elapsed / RULES.timeLimit) * 100)) : 0;
  const bonusBudget = ok ? Math.max(0, Math.floor((LIMITS.credits - st.cost) / 10)) : 0;
  const penalty = Math.min(40, m.bumps * 5);
  const score = Math.max(0, science + data + bonusEnergy + bonusTime + bonusBudget - penalty);
  const rating = !ok ? 'X' : score >= 750 ? 'A' : score >= 600 ? 'B' : 'C';
  const breakdown = [
    { label: 'Ciencia (muestras analizadas)', points: science },
    { label: 'Datos transmitidos', points: data },
    { label: 'Energía restante', points: bonusEnergy },
    { label: 'Tiempo restante', points: bonusTime },
    { label: 'Presupuesto sin gastar', points: bonusBudget },
    { label: 'Choques', points: -penalty },
  ];
  const suggestions = [];
  if (!ok && m.endReason === 'tiempo') suggestions.push('Se acabó el tiempo: planifica una ruta más corta o elige un chasis/ruedas más rápidos.');
  if (m.minBattery < st.capacity * 0.1) suggestions.push(`La batería llegó a ${fmt(m.minBattery)} u de ${st.capacity} u: usa una batería mayor o un panel más potente, y espera la recarga entre tareas.`);
  if (m.bumps > 2) suggestions.push(`Hubo ${m.bumps} choques (−${penalty} puntos): ruedas todoterreno o chasis reforzado reducen su coste de energía.`);
  if (ok && m.elapsed > RULES.timeLimit * 0.7) suggestions.push('Terminaste con poco margen de tiempo: un chasis más rápido o menos paradas mejorarían el bono de tiempo.');
  if (LIMITS.credits - st.cost >= 200) suggestions.push(`Sobraron ${LIMITS.credits - st.cost} créditos: un instrumento de más calidad o una cámara HD aumentarían la puntuación.`);
  if (ok && !suggestions.length) suggestions.push('Configuración y ruta muy equilibradas: prueba otra combinación para superar tu puntuación.');
  const explanation = ok
    ? `Misión completada: analizaste y transmitiste ${p.transmitted} muestras únicas en ${fmt(m.elapsed, 0)} s, con ${energyPct} % de batería restante. Puntuación ${score} (calificación ${rating}).`
    : `Misión no completada: se transmitieron ${p.transmitted} de ${RULES.sampleGoal} muestras necesarias (${p.analyzed} analizadas, ${p.collected} recogidas). Puntuación parcial ${score}.`;
  return { success: ok, score, rating, breakdown, suggestions, explanation, progress: p, energyPct, elapsed: m.elapsed, bumps: m.bumps, stats: st };
}

// ---------- Guardado ----------

export function snapshot(m) {
  return {
    v: 1, build: m.build, phase: m.phase, t: m.t, elapsed: m.elapsed, rover: { x: m.rover.x, y: m.rover.y, facing: m.rover.facing },
    battery: m.battery, minBattery: m.minBattery, energyUsed: m.energyUsed, bumps: m.bumps, distance: m.distance,
    inventory: [...m.inventory], samples: m.samples.map((s) => ({ id: s.id, state: s.state })),
  };
}
// Devuelve una misión válida o null si el guardado está dañado / es de otra versión.
export function restoreMission(snap) {
  try {
    if (!snap || snap.v !== 1 || !validateBuild(snap.build).ok) return null;
    if (snap.phase !== 'landing' && snap.phase !== 'explore') return null;
    const m = createMission(snap.build);
    const nums = [snap.t, snap.elapsed, snap.battery, snap.minBattery, snap.energyUsed, snap.bumps, snap.distance, snap.rover && snap.rover.x, snap.rover && snap.rover.y];
    if (!nums.every(num) || !Array.isArray(snap.samples) || snap.samples.length !== m.samples.length) return null;
    for (const s of snap.samples) {
      const target = m.samples.find((x) => x.id === s.id);
      if (!target || !SAMPLE_STATES.includes(s.state)) return null;
      target.state = s.state;
    }
    m.phase = snap.phase; m.t = Math.max(0, snap.t); m.elapsed = Math.max(0, snap.elapsed);
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
