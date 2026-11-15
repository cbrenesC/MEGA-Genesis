// Mundo del vuelo: fases, cámara y piezas sueltas. Módulo PURO (sin Phaser ni DOM), para poder probarlo con Node.
//
//   - phaseOf(): en qué fase de vuelo está el cohete según su ALTURA REAL simulada (no por temporizadores).
//   - cameraScale(): metros por píxel según la altura. Es continua y creciente: el suelo se aleja, el
//     planeta se hace pequeño y curvo, sin saltos ni teletransportes.
//   - Debris: pedazos que se sueltan (etapas, mitades de cofia). Son cuerpos físicos: heredan posición y
//     velocidad del cohete, reciben el empujoncito de separación, caen con la gravedad real y NO giran.
//   - Los cálculos usan coordenadas de MUNDO (centro de la Tierra en el origen), nunca coordenadas de pantalla.

import { PHYS, airDensity } from './flight.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------------------
// Fases de vuelo (por altura real, con histéresis para que no parpadeen)
// ---------------------------------------------------------------------------

export const PHASES = ['pad', 'liftoff', 'atmosphere', 'upper', 'space'];
export const PHASE_LABEL = { pad: 'En la plataforma', liftoff: 'Despegue', atmosphere: 'Vuelo en la atmósfera', upper: 'Atmósfera superior', space: 'Espacio' };
// Altura (m) a partir de la cual empieza cada fase.
export const PHASE_START = { liftoff: 0.5, atmosphere: 800, upper: 40000, space: PHYS.ATM_TOP };
const HYST = 0.03; // 3 %: para volver a una fase anterior hay que bajar un poco más

/** @param prev fase anterior (o null). Devuelve la fase para la altura `alt` (m) y el estado del cohete. */
export function phaseOf(alt, { grounded = false, prev = null } = {}) {
  if (grounded) return 'pad';
  const idx = (p) => PHASES.indexOf(p);
  let target = 'liftoff';
  if (alt >= PHASE_START.space) target = 'space';
  else if (alt >= PHASE_START.upper) target = 'upper';
  else if (alt >= PHASE_START.atmosphere) target = 'atmosphere';
  if (prev && idx(prev) > idx(target) && idx(prev) > 0) {
    // bajando de fase: solo si pasó el margen de histéresis
    const limit = PHASE_START[prev] * (1 - HYST);
    if (alt >= limit) return prev;
  }
  return target;
}

// ---------------------------------------------------------------------------
// Cámara: escala (m por píxel de pantalla) en función de la altura
// ---------------------------------------------------------------------------

// La distancia en pantalla entre el cohete y el suelo es D(h):
//   · al despegar crece rápido (el suelo se aleja de verdad y la plataforma se achica): DMAX·(1 − e^(−h/h0));
//   · a partir de ~30 km baja hasta casi la mitad: la cámara se acerca al planeta, su curva se cierra y se ve el borde;
//   · mucho más lejos (Luna, escape) vuelve a subir despacio y la Tierra queda como una esfera chica y distante.
// De ahí sale la escala (metros por píxel) = h / D(h): continua y estrictamente creciente.
export const CAMERA = { mpp0: 1.4, dMaxFrac: 0.36 };

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Píxeles (del lienzo pequeño) entre la base del cohete y el suelo según la altura. `dMax` = máximo al subir por la atmósfera. */
export function groundGapPx(alt, dMax = 72, mpp0 = CAMERA.mpp0) {
  const h = Math.max(0, alt);
  const h0 = mpp0 * dMax;
  const base = dMax * (1 - Math.exp(-h / h0));
  const orbit = 1 - 0.55 * smoothstep(30000, 150000, h);
  const far = 1 + 0.5 * smoothstep(3e5, 8e6, h);
  return base * orbit * far;
}

/** Metros por píxel del lienzo pequeño a esa altura. */
export function cameraScale(alt, dMax = 72, mpp0 = CAMERA.mpp0) {
  const h = Math.max(0, alt);
  if (h < 1e-3) return mpp0;
  return h / groundGapPx(h, dMax, mpp0);
}

/** Dónde está el cohete en la pantalla (fracción de la altura): al despegar abajo; luego sube un poco. */
export function anchorFraction(alt) {
  const t = clamp(alt / 1500, 0, 1);
  const s = t * t * (3 - 2 * t);
  return 0.8 - 0.26 * s;
}

const FOCUS_IN = 0.7; const FOCUS_HOLD = 1.6; const FOCUS_OUT = 2.4; const FOCUS_TOTAL = FOCUS_IN + FOCUS_HOLD + FOCUS_OUT;
/** 0 = sin acercamiento, 1 = acercamiento completo: sube, se sostiene y baja con suavizado. */
export function focusEnvelope(t) {
  if (!(t < FOCUS_TOTAL)) return 0;
  const sm = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
  if (t < FOCUS_IN) return sm(t / FOCUS_IN);
  if (t < FOCUS_IN + FOCUS_HOLD) return 1;
  return 1 - sm((t - FOCUS_IN - FOCUS_HOLD) / FOCUS_OUT);
}

/**
 * Cámara con movimiento suave. Trabaja en logaritmo de la escala para que el alejamiento sea parejo,
 * y guarda una pequeña "inercia" vertical (el cohete se adelanta un poco al acelerar fuerte).
 */
export class FlightCamera {
  constructor(dMax = 72) { this.dMax = dMax; this.logMpp = Math.log(cameraScale(0, dMax)); this.lag = 0; this.shake = 0; this.focusT = Infinity; this.focusK = 1; }

  /** Salta a una altura sin suavizar (al reiniciar). */
  reset(alt = 0) { this.logMpp = Math.log(cameraScale(alt, this.dMax)); this.lag = 0; this.shake = 0; this.focusT = Infinity; }

  /** Metros por píxel que se dibujan: la escala por altura, con un acercamiento suave al soltar una pieza. */
  get mpp() { return Math.max(CAMERA.mpp0, Math.exp(this.logMpp - Math.log(this.focusK) * focusEnvelope(this.focusT))); }

  /** Acerca la cámara (factor k, p. ej. 6×) para que se vea cómo la pieza se aleja; vuelve sola, sin saltos. */
  kickFocus(k = 6) { this.focusT = 0; this.focusK = Math.max(1, k); }

  /** @param accelG aceleración propulsiva en g (suavizada) · dt segundos reales */
  update(alt, accelG, dt) {
    const target = Math.log(cameraScale(alt, this.dMax));
    const k = 1 - Math.exp(-dt * 9); // sigue rápido pero sin saltos
    this.logMpp += (target - this.logMpp) * k;
    const lagTarget = clamp(accelG, 0, 4) * 0.9; // píxeles de pantalla que se queda atrás el cohete
    this.lag += (lagTarget - this.lag) * (1 - Math.exp(-dt * 3));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.focusT < FOCUS_TOTAL) this.focusT += dt; else this.focusT = Infinity;
  }

  /** Suma sacudida (0–1). Se queda con la mayor. */
  kick(amount) { this.shake = Math.max(this.shake, clamp(amount, 0, 1)); }

  /** Desplazamiento entero (en píxeles del lienzo pequeño) de la sacudida. */
  shakeOffset(rand = Math.random) {
    if (this.shake < 0.02) return [0, 0];
    const a = Math.round(this.shake * 2.2);
    return [Math.round((rand() * 2 - 1) * a), Math.round((rand() * 2 - 1) * a)];
  }
}

// ---------------------------------------------------------------------------
// Colores del cielo según la altura real
// ---------------------------------------------------------------------------

/** Progreso 0–1 del cielo: 0 = día azul, 1 = negro del espacio. Sigue la densidad del aire (baja con la altura). */
export function skyProgress(alt) {
  const h = Math.max(0, alt);
  const base = 1 - Math.exp(-h / 30000); // 10 km ≈ 0,28 · 30 km ≈ 0,63 · 80 km ≈ 0,93
  return clamp(base + clamp((h - 90000) / 40000, 0, 1) * (1 - base), 0, 1);
}

/** Cuántas estrellas se ven (0–1) y con qué brillo. */
export function starVisibility(alt) {
  return clamp((alt - 22000) / 55000, 0, 1);
}

// ---------------------------------------------------------------------------
// Piezas sueltas (etapas y cofia): física balística en el mundo
// ---------------------------------------------------------------------------

// Coeficiente balístico (kg por m² de resistencia): mientras más alto, menos la frena el aire.
export const DEBRIS_BALLISTIC = { stage: 2600, fairing: 90 };

/**
 * Crea una pieza a partir de lo que devolvió FlightSim (lastSeparation).
 * La orientación se guarda como vector del eje en el MUNDO y NO cambia: sin giro, sin torque.
 * @param sep   sim.lastSeparation
 * @param opts  { side: -1|1 (mitades de cofia), w, h, color, id }
 */
export function makeDebris(sep, opts = {}) {
  const [ax, ay] = sep.axis;
  let vx = sep.vx; let vy = sep.vy;
  if (sep.kind === 'fairing' && opts.side) {
    // las mitades se abren hacia los lados (perpendicular al eje) con un poco de empuje hacia atrás
    const px = ay; const py = -ax; // "derecha" del eje
    vx += opts.side * PHYS.FAIRING_SPEED * px - 0.35 * ax;
    vy += opts.side * PHYS.FAIRING_SPEED * py - 0.35 * ay;
  }
  return {
    id: opts.id ?? 0,
    kind: sep.kind,
    side: opts.side ?? 0,
    x: sep.x, y: sep.y, vx, vy,
    axis: [ax, ay], // orientación fija en el mundo
    massKg: sep.massKg,
    ballistic: DEBRIS_BALLISTIC[sep.kind] ?? 1000,
    age: 0, dead: false, deadReason: null,
    w: opts.w ?? 8, h: opts.h ?? 12, index: sep.index ?? 0,
  };
}

/** Aceleración (m/s²) de una pieza en el mundo: gravedad + un poco de aire (que gira con la Tierra). */
export function debrisAccel(d, atmRate) {
  const r = Math.hypot(d.x, d.y);
  const g = PHYS.MU / (r * r * r);
  let ax = -g * d.x; let ay = -g * d.y;
  const h = r - PHYS.RE;
  if (h < PHYS.ATM_TOP) {
    const rho = airDensity(h);
    const rx = d.vx - atmRate * d.y; const ry = d.vy + atmRate * d.x;
    const v = Math.hypot(rx, ry);
    if (v > 0.1 && rho > 0) {
      const k = (0.5 * rho * v) / d.ballistic;
      ax -= k * rx; ay -= k * ry;
    }
  }
  return [ax, ay];
}

/** Avanza una pieza `dt` segundos físicos (se subdivide solo). Sin rotación: solo posición y velocidad. */
export function stepDebris(d, dt, atmRate = 0) {
  if (d.dead) return;
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, Math.hypot(d.x, d.y) - PHYS.RE < PHYS.ATM_TOP ? 0.2 : 2);
    // velocity-Verlet: conserva bien la energía en trayectorias balísticas
    const [a0x, a0y] = debrisAccel(d, atmRate);
    d.x += d.vx * h + 0.5 * a0x * h * h;
    d.y += d.vy * h + 0.5 * a0y * h * h;
    const [a1x, a1y] = debrisAccel(d, atmRate);
    d.vx += 0.5 * (a0x + a1x) * h;
    d.vy += 0.5 * (a0y + a1y) * h;
    d.age += h;
    left -= h;
    if (Math.hypot(d.x, d.y) < PHYS.RE) { d.dead = true; d.deadReason = 'impact'; break; }
  }
}

/** ¿Se puede borrar? Cayó, está muy lejos del cohete o ya es demasiado vieja. Devuelve el motivo o null. */
export function cullReason(d, rocket, { maxAge = 2400, maxDist = 6e6 } = {}) {
  if (d.dead) return d.deadReason ?? 'dead';
  if (d.age > maxAge) return 'age';
  if (Math.hypot(d.x - rocket.x, d.y - rocket.y) > maxDist) return 'far';
  return null;
}

/** Ángulo (rad) del eje de la pieza respecto a la vertical local de un observador en (ox, oy). */
export function angleFromVertical(axis, ox, oy) {
  const r = Math.hypot(ox, oy) || 1;
  const ux = ox / r; const uy = oy / r;
  return Math.atan2(axis[0] * uy - axis[1] * ux, axis[0] * ux + axis[1] * uy);
}

/** Pasa una posición del mundo a "metros respecto al cohete" en el marco de la cámara (x = derecha/este, y = arriba). */
export function toCameraFrame(px, py, rocketX, rocketY) {
  const r = Math.hypot(rocketX, rocketY) || 1;
  const ux = rocketX / r; const uy = rocketY / r;
  const dx = px - rocketX; const dy = py - rocketY;
  return { east: dx * uy - dy * ux, up: dx * ux + dy * uy };
}

/**
 * Distancia por el suelo (m) del cohete al sitio de lanzamiento, en el marco que gira con la Tierra.
 * El suelo (plataforma, nubes) está fijo en ese marco; el cohete se mueve en el marco inercial.
 */
export function groundDistance(angle, t, atmRate) {
  const padAngle = Math.PI / 2 - atmRate * t;
  return PHYS.RE * (padAngle - angle);
}

/** Aceleración propulsiva en g (empuje / masa, sin gravedad ni aire): para la sensación de potencia. */
export function thrustAccelG(sim) {
  if (sim.status !== 'flying' || sim.engineOut) return 0;
  const gLocal = PHYS.MU / (sim.r * sim.r);
  return (sim.thrustToWeight() * gLocal) / PHYS.G0;
}
