// Cuerpos del vuelo: la Tierra y la Luna. Módulo PURO (sin Phaser ni DOM).
//
// La gravedad se calcula como en Space Flight Simulator, con "zonas de influencia" (cónicas enlazadas):
//   · fuera de la zona de influencia de la Luna sólo atrae la Tierra;
//   · dentro, sólo atrae la Luna (y la nave acompaña a la Luna en su vuelta alrededor de la Tierra).
// Así, cerca de cada cuerpo la trayectoria es una órbita limpia (elipse o hipérbola) que se puede dibujar y predecir.
// Es una simplificación: en la realidad las dos gravedades actúan siempre a la vez.
//
// Todo vive en el plano del juego, con la Tierra en el origen. La Luna gira en círculo, en el mismo sentido
// en que salen los cohetes hacia el este (horario en este plano).

export const EARTH = {
  MU: 3.986004418e14, // m³/s²
  R: 6371000, // m
  SOI: 9.24e8, // m: zona de influencia de la Tierra frente al Sol
};

export const MOON = {
  MU: 4.9028e12, // m³/s²  (la Luna tiene 1/81 de la masa de la Tierra)
  R: 1737400, // m
  DIST: 384400000, // m: distancia media Tierra–Luna
  SOI: 66100000, // m: radio de su zona de influencia
  SAFE_ALT: 15000, // m: más abajo que esto hay montañas (no hay aire que frene, pero sí suelo)
  G_SURFACE: 1.62, // m/s²
};
MOON.RATE = Math.sqrt(EARTH.MU / MOON.DIST ** 3); // rad/s: da una vuelta en ~27 días
MOON.SPEED = MOON.RATE * MOON.DIST; // ~1,02 km/s
export const MOON_DIR = -1; // sentido de giro en el plano (−1 = horario, igual que la nave)

/** Ángulo (rad desde +x) de la Luna en el instante t. `moon` = { angle0 }. */
export const moonAngle = (moon, t) => moon.angle0 + MOON_DIR * MOON.RATE * t;

/** Posición y velocidad de la Luna en t. Escribe en `out` (para no crear objetos en cada paso). */
export function moonState(moon, t, out = {}) {
  const a = moonAngle(moon, t);
  const c = Math.cos(a); const s = Math.sin(a);
  out.x = MOON.DIST * c; out.y = MOON.DIST * s;
  out.vx = -MOON_DIR * MOON.SPEED * s; out.vy = MOON_DIR * MOON.SPEED * c;
  return out;
}

const M = {}; // escritorio para moonState

/** Distancia (m) al centro de la Luna. */
export function moonDistance(x, y, t, moon) {
  moonState(moon, t, M);
  return Math.hypot(x - M.x, y - M.y);
}

/** Cuerpo que manda en ese punto: 'moon' dentro de su zona de influencia; si no, 'earth'. */
export function bodyAt(x, y, t, moon) {
  if (!moon) return 'earth';
  return moonDistance(x, y, t, moon) < MOON.SOI ? 'moon' : 'earth';
}

/**
 * Aceleración de la gravedad (m/s²) en (x, y) y el instante t, según el cuerpo que manda.
 * Dentro de la zona de la Luna se suma la aceleración de la propia Luna alrededor de la Tierra: así la nave
 * "viaja con ella" y su movimiento respecto a la Luna es una órbita exacta.
 */
export function gravity(x, y, t, body, moon, out) {
  if (body === 'moon' && moon) {
    moonState(moon, t, M);
    const dx = x - M.x; const dy = y - M.y;
    const d = Math.hypot(dx, dy);
    const k = MOON.MU / (d * d * d);
    const w2 = MOON.RATE * MOON.RATE;
    out[0] = -k * dx - w2 * M.x; out[1] = -k * dy - w2 * M.y;
    return out;
  }
  const r = Math.hypot(x, y);
  const k = EARTH.MU / (r * r * r);
  out[0] = -k * x; out[1] = -k * y;
  return out;
}

/** Estado respecto al cuerpo que manda: { x, y, vx, vy, mu, R }. */
export function relativeState(x, y, vx, vy, t, body, moon, out = {}) {
  if (body === 'moon' && moon) {
    moonState(moon, t, M);
    out.x = x - M.x; out.y = y - M.y; out.vx = vx - M.vx; out.vy = vy - M.vy; out.mu = MOON.MU; out.R = MOON.R;
  } else { out.x = x; out.y = y; out.vx = vx; out.vy = vy; out.mu = EARTH.MU; out.R = EARTH.R; }
  return out;
}

/**
 * Paso máximo (s) para avanzar SIN motor y sin aire con buena precisión: una fracción pequeña del tiempo propio
 * de la órbita a esa distancia, y cada vez más corto al acercarse al borde de la zona de influencia de la Luna
 * (para cruzarlo en el momento justo).
 */
export function coastStepLimit(x, y, vx, vy, t, body, moon) {
  let d; let mu;
  if (body === 'moon' && moon) { moonState(moon, t, M); d = Math.hypot(x - M.x, y - M.y); mu = MOON.MU; } else { d = Math.hypot(x, y); mu = EARTH.MU; }
  let h = Math.min(600, Math.max(2, 0.004 * Math.sqrt((d * d * d) / mu)));
  if (moon) {
    if (body !== 'moon') moonState(moon, t, M);
    const dm = body === 'moon' ? d : Math.hypot(x - M.x, y - M.y);
    const gap = Math.abs(dm - MOON.SOI);
    const vrel = Math.hypot(vx - M.vx, vy - M.vy) + 1;
    h = Math.min(h, Math.max(2, (0.5 * gap) / vrel));
  }
  return h;
}

const K1 = [0, 0]; const K2 = [0, 0]; const K3 = [0, 0]; const K4 = [0, 0];

/**
 * Avanza `h` segundos un cuerpo SIN motor ni aire (RK4). `st` = { x, y, vx, vy, t, body } y se modifica.
 * Después del paso se revisa qué cuerpo manda (entrada o salida de la zona de influencia de la Luna).
 */
export function coastStep(st, h, moon) {
  const { x, y, vx, vy, t, body } = st;
  gravity(x, y, t, body, moon, K1);
  gravity(x + 0.5 * h * vx, y + 0.5 * h * vy, t + 0.5 * h, body, moon, K2);
  gravity(x + 0.5 * h * (vx + 0.5 * h * K1[0]), y + 0.5 * h * (vy + 0.5 * h * K1[1]), t + 0.5 * h, body, moon, K3);
  gravity(x + h * (vx + 0.5 * h * K2[0]), y + h * (vy + 0.5 * h * K2[1]), t + h, body, moon, K4);
  st.x = x + h * (vx + (h / 6) * (K1[0] + K2[0] + K3[0]));
  st.y = y + h * (vy + (h / 6) * (K1[1] + K2[1] + K3[1]));
  st.vx = vx + (h / 6) * (K1[0] + 2 * K2[0] + 2 * K3[0] + K4[0]);
  st.vy = vy + (h / 6) * (K1[1] + 2 * K2[1] + 2 * K3[1] + K4[1]);
  st.t = t + h;
  if (moon) st.body = bodyAt(st.x, st.y, st.t, moon);
  return st;
}
