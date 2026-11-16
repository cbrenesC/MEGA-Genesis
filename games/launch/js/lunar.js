import { simText } from "../../../src/i18n/catalog.js";
// Misión lunar de ida y vuelta: predicción de la trayectoria y guía de cada maniobra. Módulo PURO (sin Phaser ni DOM).
//
// La misión, como las de verdad (Apolo 8, Artemis), tiene estas etapas:
//   1. órbita de espera alrededor de la Tierra
//   2. inyección translunar: un encendido largo que estira la órbita hasta la Luna
//   3. viaje (3–5 días) con una pequeña corrección de rumbo
//   4. frenado al pasar por detrás de la Luna para quedar en órbita lunar
//   5. inyección de regreso: otro encendido para escapar de la Luna y caer hacia la Tierra
//   6. soltar el módulo de servicio, reentrada con el escudo térmico, paracaídas y amerizaje
//
// Aquí no se mueve la simulación: sólo se PREDICE (propagando la trayectoria sin motor) y se RECOMIENDA.
// El mapa dibuja la predicción; el piloto automático y los cortes automáticos de motor la usan para apagar a tiempo.

import { PHYS, DEG, orbitElements, transferDeltaV, newAutopilot, applyAutopilot } from './flight.js';
import { EARTH, MOON, MOON_DIR, moonAngle, moonState, coastStep, coastStepLimit, relativeState } from './bodies.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const TAU = Math.PI * 2;
const DAY = 86400;

// Metas de la misión (alturas en metros). Son valores del juego, inspirados en las misiones reales.
export const LUNAR = {
  PERI_TARGET: 110000, // altura a la que conviene pasar por la Luna (Apolo: ~110 km)
  PERI_MIN: 40000, PERI_MAX: 900000, // pasar entre estas alturas permite frenar y quedar en órbita
  ORBIT_ALT: 110000, // órbita lunar pedida
  ORBIT_ROUND: 60000, // diferencia máxima entre punto alto y bajo para llamarla "redonda"
  // Corredor de reentrada, medido como el punto más bajo que tendría la órbita si no hubiera aire:
  //   · ~60 km → la cápsula frena con unas 7 veces la gravedad (como las misiones Apolo)
  //   · menos de ~45 km → entra muy empinada y la fuerza g se dispara (por debajo de ~27 km se rompe)
  //   · más de ~68 km → entra tan rasante que rebota en el aire y da otra vuelta: el escudo trabaja demasiado tiempo
  ENTRY_TARGET: 60000,
  ENTRY_MIN: 45000, ENTRY_MAX: 68000,
  SM_SEP_ALT: 2500000, // altura sobre la Tierra a la que se suelta el módulo de servicio al volver
  CHUTE_ALT: 7000, CHUTE_SPEED: 240, // paracaídas: por debajo de esta altura y de esta velocidad
};

// ---------------------------------------------------------------------------
// Predicción: adónde va la nave si no se toca nada
// ---------------------------------------------------------------------------

/** Estado "plano" de la simulación para propagarlo aparte. */
export const stateOf = (sim) => ({ x: sim.x, y: sim.y, vx: sim.vx, vy: sim.vy, t: sim.t, body: sim.body });

/** El mismo estado con un empujón instantáneo de `dv` m/s hacia adelante (negativo = hacia atrás), respecto al cuerpo que manda. */
export function nudged(st, moon, dv) {
  const q = relativeState(st.x, st.y, st.vx, st.vy, st.t, st.body, moon, {});
  const v = Math.hypot(q.vx, q.vy) || 1;
  return { ...st, vx: st.vx + (q.vx / v) * dv, vy: st.vy + (q.vy / v) * dv };
}

const Q = {};
const MSt = {};

/**
 * Propaga la trayectoria SIN motor ni aire hasta que pasa algo definitivo.
 * Devuelve:
 *   segs      tramos { body, pts:[x0,y0,t0, x1,y1,t1…], t0, t1 }. Los tramos 'moon' van en coordenadas RESPECTO A LA LUNA.
 *   encounter { t, moonAngle } entrada a la zona de influencia de la Luna (si ocurre)
 *   moon      { periAlt, apoAlt, hyper, closed, impact, dir, tPeri, speedPeri } órbita respecto a la Luna (si entra o ya está)
 *   exit      { t } salida de la zona de la Luna
 *   earth     { periAlt, apoAlt, hyper } órbita alrededor de la Tierra al final de lo predicho
 *   entry     { t, speed, angleDeg } llegada al aire de la Tierra (100 km), si ocurre
 *   end       'entry' | 'earthOrbit' | 'lunarOrbit' | 'moonImpact' | 'escape' | 'time'
 */
export function propagate(st0, moon, { maxDays = 16, keepPath = true, maxSteps = 9000 } = {}) {
  const st = { ...st0 };
  const out = { segs: [], encounter: null, moon: null, exit: null, earth: null, entry: null, end: 'time', t0: st0.t };
  const tEnd = st.t + maxDays * DAY;
  let seg = null; let swept = 0; let lastA = 0; let lastRr = 0; let segSteps = 0;
  const open = () => {
    relativeState(st.x, st.y, st.vx, st.vy, st.t, st.body, moon, Q);
    seg = { body: st.body, pts: keepPath ? [Q.x, Q.y, st.t] : [], t0: st.t, t1: st.t };
    out.segs.push(seg);
    swept = 0; lastA = Math.atan2(Q.y, Q.x); lastRr = Q.x * Q.vx + Q.y * Q.vy; segSteps = 0;
    const el = orbitElements(Q.x, Q.y, Q.vx, Q.vy, Q.mu, Q.R);
    if (st.body === 'moon') {
      out.moon = {
        periAlt: el.periAlt, apoAlt: el.apoAlt, hyper: el.hyper, e: el.e, dir: el.ccw ? 1 : -1,
        closed: !el.hyper && el.ra < MOON.SOI * 0.9, impact: el.rp < MOON.R, tPeri: null, speedPeri: Math.sqrt(Math.max(0, 2 * (el.energy + MOON.MU / el.rp))),
        rp: el.rp, periAngle: el.periAngle,
      };
      if (lastRr >= 0) out.moon.tPeri = st.t; // ya pasó el punto más bajo
    } else out.earth = { periAlt: el.periAlt, apoAlt: el.apoAlt, hyper: el.hyper, rp: el.rp, ra: el.ra, ccw: el.ccw };
  };
  open();
  for (let i = 0; i < maxSteps && st.t < tEnd; i++) {
    const body = st.body;
    const h = coastStepLimit(st.x, st.y, st.vx, st.vy, st.t, body, moon);
    coastStep(st, h, moon);
    seg.t1 = st.t; segSteps++;
    if (st.body !== body) {
      // cruzó el borde de la zona de influencia
      if (st.body === 'moon') { if (!out.encounter) out.encounter = { t: st.t, moonAngle: moonAngle(moon, st.t) }; } else out.exit = { t: st.t };
      open();
      continue;
    }
    relativeState(st.x, st.y, st.vx, st.vy, st.t, body, moon, Q);
    if (keepPath) seg.pts.push(Q.x, Q.y, st.t);
    const a = Math.atan2(Q.y, Q.x);
    swept += Math.abs(wrap(a - lastA)); lastA = a;
    const rr = Q.x * Q.vx + Q.y * Q.vy;
    const d = Math.hypot(Q.x, Q.y);
    if (body === 'moon') {
      if (lastRr < 0 && rr >= 0 && out.moon && out.moon.tPeri == null) out.moon.tPeri = st.t - h * (rr / (rr - lastRr + 1e-9));
      if (d < MOON.R) { out.end = 'moonImpact'; break; }
      if (out.moon?.closed && swept >= TAU) { out.end = 'lunarOrbit'; break; }
    } else {
      if (d < EARTH.R + PHYS.ATM_TOP && rr < 0) {
        const v = Math.hypot(Q.vx, Q.vy);
        out.entry = { t: st.t, speed: v, angleDeg: Math.asin(clamp(-rr / (d * v), -1, 1)) / DEG };
        out.end = 'entry'; break;
      }
      if (d > EARTH.SOI) { out.end = 'escape'; break; }
      if (swept >= TAU && segSteps > 8) { out.end = 'earthOrbit'; break; }
    }
    lastRr = rr;
  }
  return out;
}

/** Predicción desde el estado actual de la simulación. */
export const predict = (sim, opts) => (sim.moon ? propagate(stateOf(sim), sim.moon, opts) : null);

/**
 * Altura de paso por la Luna con signo: positiva si la nave rodea la Luna en el sentido "de frenado natural"
 * (el mismo sentido en que gira la Luna alrededor de la Tierra), negativa en el contrario. null si no hay encuentro.
 */
export function signedPass(pred) {
  if (!pred?.moon) return null;
  return (pred.moon.rp - MOON.R) * (pred.moon.dir === MOON_DIR ? 1 : -1);
}

// ---------------------------------------------------------------------------
// En qué parte de la misión está la nave
// ---------------------------------------------------------------------------

export const LUNAR_PHASES = ['ascent', 'parking', 'toMoon', 'approach', 'lunarOrbit', 'departing', 'toEarth', 'entry', 'descent', 'landed'];
export const LUNAR_PHASE_LABEL = {
  ascent: simText("lunarFlight.climbing-to-orbit"), parking: simText("lunarFlight.parking-orbit"), toMoon: simText("lunarFlight.heading-to-the-moon"), approach: simText("lunarFlight.approaching-the-moon"),
  lunarOrbit: simText("lunarFlight.lunar-orbit"), departing: simText("lunarFlight.leaving-the-moon"), toEarth: simText("lunarFlight.returning-to-earth"), entry: simText('lunarFlight.reentry'),
  descent: simText("lunarFlight.parachute-descent"), landed: simText('lunarFlight.splashdown'),
};

/** Fase de la misión según lo que ya pasó de verdad (diario de la simulación) y dónde está la nave. */
export function lunarPhase(sim) {
  const m = sim.mission;
  if (!m) return 'ascent';
  if (sim.landing) return 'landed';
  if (sim.body === 'moon') {
    if (m.tei) return 'departing';
    const el = sim.bodyElements;
    if (m.lunarOrbit && !el.hyper) return 'lunarOrbit';
    return 'approach';
  }
  if (!m.leo) return 'ascent';
  if (sim.stats.entryT != null && sim.altitude < PHYS.ATM_TOP) return sim.chute || (sim.altitude < 25000 && sim.aero().v < 600) ? 'descent' : 'entry';
  if (m.left) return 'toEarth';
  if (m.tli) return 'toMoon';
  return 'parking';
}

// ---------------------------------------------------------------------------
// Ventanas: cuándo conviene encender
// ---------------------------------------------------------------------------

const mod = (a, n) => ((a % n) + n) % n;

/** Segundos de encendido para conseguir `dv` con la etapa actual (ecuación del cohete). */
export function burnSeconds(sim, dv) {
  const st = sim.currentStage;
  if (!st || sim.fuel[sim.stage] <= 0 || dv <= 0) return 0;
  const ve = st.ispVac * PHYS.G0;
  const m0 = sim.mass;
  return (m0 * (1 - Math.exp(-dv / ve))) / st.mdot;
}

// Inyección translunar: la nave tiene que encender cuando la Luna está "atrasada" unos 66° respecto al punto
// opuesto de la órbita: es lo que la Luna avanza durante los días de viaje. `lead` mide ese ángulo.
export const TLI = { LEAD_IDEAL: 66 * DEG, LEAD_MIN: 47 * DEG, LEAD_MAX: 96 * DEG };

/**
 * Ventana de la inyección translunar desde la órbita de espera.
 * @returns {{ lead, waitS, open, burnS, dvNeed, startAngle, endAngle, idealAngle, rate }}
 */
export function tliWindow(sim) {
  const el = sim.elements;
  const r = sim.r;
  const omega = Math.abs(el.h) / (r * r);
  const rate = omega - MOON.RATE; // la nave gana este ángulo a la Luna cada segundo
  const lead = mod(-MOON_DIR * (moonAngle(sim.moon, sim.t) - sim.angle - Math.PI), TAU);
  const open = lead >= TLI.LEAD_MIN && lead <= TLI.LEAD_MAX;
  const waitS = open && lead >= TLI.LEAD_IDEAL - 4 * DEG ? 0 : mod(TLI.LEAD_IDEAL - lead, TAU) / rate;
  const dvNeed = transferDeltaV(r, MOON.DIST);
  const burnS = burnSeconds(sim, dvNeed);
  // ángulos (en el plano) de la órbita donde se abre, conviene y se cierra la ventana
  const at = (L) => sim.angle + MOON_DIR * mod(L - lead, TAU);
  return { lead, waitS, open, burnS, dvNeed, startAngle: at(TLI.LEAD_MIN), idealAngle: at(TLI.LEAD_IDEAL), endAngle: at(TLI.LEAD_MAX), rate, arc: omega * burnS };
}

/** Frenado en la Luna: cuánto falta para el punto más bajo y cuánto dura el encendido. */
export function loiPoint(sim, pred) {
  const pm = pred?.moon;
  if (!pm || pm.closed || pm.tPeri == null) return null;
  const vCirc = Math.sqrt(MOON.MU / pm.rp);
  const dv = Math.max(0, pm.speedPeri - vCirc);
  const burnS = burnSeconds(sim, dv);
  const eta = pm.tPeri - sim.t;
  return { eta, dv, burnS, waitS: eta - burnS / 2, periAlt: pm.periAlt, passed: eta <= 0 };
}

/** Velocidad de salida de la Luna (m/s, "en el infinito") para caer hasta la altura de reentrada. */
export function returnExcessSpeed() {
  const rp = EARTH.R + LUNAR.ENTRY_TARGET;
  const a = (MOON.DIST + rp) / 2;
  return MOON.SPEED - Math.sqrt(EARTH.MU * (2 / MOON.DIST - 1 / a));
}

/**
 * Ventana de la inyección de regreso desde la órbita lunar: hay que salir de la Luna "hacia atrás" (al revés de como
 * la Luna avanza), para quedarse casi sin velocidad respecto a la Tierra y caer hacia ella.
 * @returns {{ waitS, burnS, dv, angle, open }}  angle = punto de la órbita lunar (respecto a la Luna) donde encender
 */
export function teiWindow(sim) {
  const q = sim.rel();
  const el = orbitElements(q.x, q.y, q.vx, q.vy, MOON.MU, MOON.R);
  if (el.hyper) return null;
  const dir = el.ccw ? 1 : -1;
  const r = el.r;
  const vInf = returnExcessSpeed();
  const e = 1 + (r * vInf * vInf) / MOON.MU;
  const thetaInf = Math.acos(-1 / e);
  const dv = Math.sqrt(vInf * vInf + (2 * MOON.MU) / r) - Math.hypot(q.vx, q.vy);
  const burnS = burnSeconds(sim, dv);
  const n = Math.sqrt(MOON.MU / (el.a * el.a * el.a));
  const tExit = (0.8 * MOON.SOI) / vInf;
  const ms = moonState(sim.moon, sim.t + tExit, MSt);
  const outAngle = Math.atan2(-ms.vy, -ms.vx); // dirección de salida: contra el avance de la Luna
  const angle = outAngle - dir * thetaInf; // punto de la órbita donde va el centro del encendido
  const now = Math.atan2(q.y, q.x);
  const toGo = mod((angle - now) * dir, TAU);
  const half = (burnS / 2) * n; // el encendido empieza medio arco antes
  let wait = (toGo - half) / n;
  if (wait < -TEI.LATE_S) wait += TAU / n;
  return { waitS: Math.max(0, wait), open: wait <= 0, burnS, dv, angle, startAngle: angle - dir * half, dir, period: TAU / n };
}
export const TEI = { LATE_S: 150 }; // segundos de tolerancia: se puede encender hasta este tiempo después del punto ideal

// ---------------------------------------------------------------------------
// Maniobras guiadas: el juego orienta la nave, regula el motor y lo apaga en el momento justo
// ---------------------------------------------------------------------------

// Cuánto cambia el resultado por cada m/s de empuje (valores típicos, sólo para regular el acelerador al final).
const SENS = { tli: 6e6, tei: 7e4 };

function fullAccel(sim) {
  const st = sim.currentStage;
  if (!st || sim.engineOut) return 0;
  return (st.mdot * st.ispVac * PHYS.G0 * (sim.thrustMult[sim.stage] ?? 1)) / sim.mass;
}
const throttleFor = (sim, accel) => { const a = fullAccel(sim); return a > 0 ? clamp(accel / a, 0.003, 1) : 0; };

/** Empieza una maniobra guiada: 'tli' | 'loi' | 'tei' | 'mcc'. */
export function startBurn(sim, kind, extra = {}) {
  const burn = { kind, t0: sim.t, v0: sim.bodySpeed, dv: 0, done: false, result: null, ...extra };
  sim.burn = burn;
  if (kind === 'tli') sim.stats.transfer = { startT: sim.t, startAngle: sim.angle, arc: 0, midAngle: null, dv: 0, active: true, lead: tliWindow(sim).lead };
  return burn;
}

/**
 * Control de la maniobra en curso. Devuelve { mode, throttle, done, readout } y NO toca la simulación.
 * `readout` = lo que se va logrando (para mostrarlo): { passKm } · { apoKm, periKm } · { perigeeKm }.
 */
export function burnControl(sim) {
  const b = sim.burn;
  if (!b || b.done) return null;
  const out = { mode: 'prograde', throttle: 1, done: false, readout: null, result: null };
  const empty = sim.engineOut;
  if (b.kind === 'tli') {
    const el = sim.elements;
    if (sim.body !== 'earth') { out.done = true; out.result = 'ok'; return finish(sim, out); }
    if (!el.hyper && el.ra < 0.5 * MOON.DIST) { out.throttle = 1; if (empty) { out.throttle = 0; } return out; }
    const pred = propagate(stateOf(sim), sim.moon, { keepPath: false });
    const sp = signedPass(pred);
    out.readout = { passKm: sp == null ? null : sp / 1000 };
    if (sp == null) {
      // todavía no hay encuentro: se sigue empujando con suavidad; si la órbita ya pasa de largo, no lo habrá
      if (el.hyper || el.ra > 1.6 * MOON.DIST) { out.done = true; out.result = 'noEncounter'; return finish(sim, out); }
      out.throttle = throttleFor(sim, 3);
    } else if (sp <= LUNAR.PERI_TARGET + 15000) { out.done = true; out.result = sp > LUNAR.PERI_MIN ? 'ok' : 'low'; return finish(sim, out); } else out.throttle = throttleFor(sim, clamp((sp - LUNAR.PERI_TARGET) / (SENS.tli * 2), 0.004, 3));
    if (empty) out.throttle = 0;
    return out;
  }
  if (b.kind === 'loi') {
    out.mode = 'retrograde';
    if (sim.body !== 'moon') { out.done = true; out.result = 'left'; return finish(sim, out); }
    const q = sim.rel();
    const el = orbitElements(q.x, q.y, q.vx, q.vy, MOON.MU, MOON.R);
    const v = Math.hypot(q.vx, q.vy);
    const vCirc = Math.sqrt(MOON.MU / el.r);
    out.readout = { apoKm: el.hyper ? null : el.apoAlt / 1000, periKm: el.periAlt / 1000 };
    const closed = !el.hyper && el.ra < MOON.SOI * 0.9;
    if (v <= vCirc * 1.0005 || (closed && el.apoAlt - el.periAlt < 6000)) { out.done = true; out.result = 'ok'; return finish(sim, out); }
    out.throttle = throttleFor(sim, clamp((v - vCirc) / 2.5, 0.02, 50));
    if (empty) { out.throttle = 0; if (sim.stage >= sim.stageCount - 1) { out.done = true; out.result = closed ? 'ok' : 'empty'; return finish(sim, out); } }
    return out;
  }
  if (b.kind === 'tei') {
    if (sim.body !== 'moon') { out.done = true; out.result = 'ok'; return finish(sim, out); }
    const q = sim.rel();
    const el = orbitElements(q.x, q.y, q.vx, q.vy, MOON.MU, MOON.R);
    if (!el.hyper && el.ra < MOON.SOI * 0.8) { if (empty) out.throttle = 0; return out; }
    const pred = propagate(stateOf(sim), sim.moon, { keepPath: false });
    const peri = pred.exit && pred.earth ? pred.earth.periAlt : null;
    out.readout = { perigeeKm: peri == null ? null : peri / 1000 };
    if (peri != null && pred.earth.ccw === (MOON_DIR > 0) && peri <= LUNAR.ENTRY_TARGET + 2500) { out.done = true; out.result = 'ok'; return finish(sim, out); }
    if (peri != null && pred.earth.ccw !== (MOON_DIR > 0)) { out.done = true; out.result = 'over'; return finish(sim, out); }
    out.throttle = peri == null ? 1 : throttleFor(sim, clamp((peri - LUNAR.ENTRY_TARGET) / (SENS.tei * 2), 0.01, 50));
    if (empty) { out.throttle = 0; if (sim.stage >= sim.stageCount - 1) { out.done = true; out.result = 'empty'; return finish(sim, out); } }
    return out;
  }
  if (b.kind === 'mcc') {
    // corrección de rumbo: empujoncitos hacia adelante o hacia atrás hasta que la predicción dé en el blanco
    const pred = propagate(stateOf(sim), sim.moon, { keepPath: false });
    const val = mccValue(pred, b.goal);
    out.readout = b.goal === 'moon' ? { passKm: val == null ? null : val / 1000 } : { perigeeKm: val == null ? null : val / 1000 };
    const target = b.goal === 'moon' ? LUNAR.PERI_TARGET : LUNAR.ENTRY_TARGET;
    const tol = b.goal === 'moon' ? 6000 : 1200;
    if (val != null && Math.abs(val - target) <= tol) { out.done = true; out.result = 'ok'; return finish(sim, out); }
    // sensibilidad: se mide probando un empujoncito de 1 m/s en la predicción
    if (b.sensT == null || sim.t - b.sensT > 600 || b.sens == null) {
      const st = stateOf(sim);
      const probe = (dv) => mccValue(propagate(nudged(st, sim.moon, dv), sim.moon, { keepPath: false }), b.goal);
      const step = b.goal === 'moon' ? 0.5 : 2;
      const vp = probe(step); const vm = probe(-step);
      b.sensT = sim.t;
      if (val != null && vp != null && vm != null) b.sens = (vp - vm) / (2 * step);
      else if (val == null) {
        // no hay encuentro o regreso: se busca qué empujón lo consigue
        let found = null;
        for (const dv of [2, -2, 6, -6, 15, -15, 40, -40]) { const v = probe(dv); if (v != null) { found = dv; break; } }
        b.sens = null; b.blind = found;
        if (found == null) { out.done = true; out.result = 'lost'; return finish(sim, out); }
      } else b.sens = vp != null ? (vp - val) / step : (val - vm) / step;
    }
    if (val == null) { out.mode = b.blind > 0 ? 'prograde' : 'retrograde'; out.throttle = throttleFor(sim, 1.5); b.sensT = null; } else {
      const need = (target - val) / b.sens; // m/s (con signo) que faltan
      out.mode = need >= 0 ? 'prograde' : 'retrograde';
      out.throttle = throttleFor(sim, clamp(Math.abs(need) / 3, 0.004, 3));
    }
    if (empty) { out.throttle = 0; if (sim.stage >= sim.stageCount - 1) { out.done = true; out.result = 'empty'; return finish(sim, out); } }
    return out;
  }
  return null;
}

function finish(sim, out) {
  const b = sim.burn;
  b.done = true; b.result = out.result; b.endT = sim.t; b.dv = Math.abs(sim.bodySpeed - b.v0);
  if (b.kind === 'tli' && sim.stats.transfer) { sim.stats.transfer.active = false; sim.stats.transfer.endT = sim.t; }
  out.throttle = 0;
  return out;
}

/** Lo que mide una corrección de rumbo: el paso por la Luna (con signo) o el punto más bajo de vuelta en la Tierra. */
export function mccValue(pred, goal) {
  if (!pred) return null;
  if (goal === 'moon') return signedPass(pred);
  // regreso: vale el punto más bajo del tramo final alrededor de la Tierra, si la nave vuelve girando "hacia adelante"
  if (!pred.earth || pred.earth.hyper) return null;
  if (pred.end === 'lunarOrbit' || pred.end === 'moonImpact') return null;
  return pred.earth.ccw === (MOON_DIR > 0) ? pred.earth.periAlt : -pred.earth.periAlt - 2 * EARTH.R;
}

/** ¿Hace falta corregir el rumbo? Devuelve { goal, value, target, ok } o null si no hay nada que corregir aquí. */
export function courseCheck(sim, pred) {
  const ph = lunarPhase(sim);
  if (ph === 'toMoon') {
    const v = signedPass(pred);
    return { goal: 'moon', value: v, target: LUNAR.PERI_TARGET, ok: v != null && v >= LUNAR.PERI_MIN && v <= LUNAR.PERI_MAX, fine: v != null && Math.abs(v - LUNAR.PERI_TARGET) < 40000 };
  }
  if (ph === 'toEarth' || ph === 'departing') {
    const v = mccValue(pred, 'earth');
    return { goal: 'earth', value: v, target: LUNAR.ENTRY_TARGET, ok: v != null && v >= LUNAR.ENTRY_MIN && v <= LUNAR.ENTRY_MAX, fine: v != null && Math.abs(v - LUNAR.ENTRY_TARGET) < 4000 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Plan de vuelo: qué toca ahora y cuánto falta (lo usan las pistas, el botón «Saltar» y el piloto automático)
// ---------------------------------------------------------------------------

/** Guarda la última predicción para no recalcularla en cada cuadro. */
export function newGuide() { return { pred: null, predT: -Infinity, predKey: '', plan: null }; }

/** Predicción con el camino completo (para el mapa). Se recalcula cuando la nave cambió de rumbo o pasó un rato. */
export function guidePrediction(sim, g, maxAge = 20) {
  if (!sim.moon) return null;
  const key = `${sim.body}|${sim.stage}|${sim.throttle > 0.001 ? sim.t : 0}`;
  if (g.pred && key === g.predKey && Math.abs(sim.t - g.predT) <= maxAge) return g.pred;
  g.pred = propagate(stateOf(sim), sim.moon, { keepPath: true });
  g.predT = sim.t; g.predKey = key;
  return g.pred;
}

/**
 * Qué conviene hacer ahora. No toca la simulación.
 * @returns {{ phase, action, eta, window, check, pred }}
 *   action = 'ascent' | 'fairing' | 'waitTli' | 'tli' | 'sepUpper' | 'mcc' | 'coast' | 'waitLoi' | 'loi' | 'orbit' | 'waitTei' | 'tei'
 *            | 'sepService' | 'entry' | 'chute' | 'done' | 'burning'
 *   eta    = segundos (físicos) hasta el próximo momento importante (para saltar en el tiempo sin pasarse)
 */
export function lunarPlan(sim, g) {
  const phase = lunarPhase(sim);
  const m = sim.mission;
  const plan = { phase, action: 'coast', eta: Infinity, window: null, check: null, pred: null };
  if (sim.burn && !sim.burn.done) { plan.action = 'burning'; plan.eta = 0; plan.burn = sim.burn.kind; return plan; }
  if (phase === 'ascent') { plan.action = 'ascent'; plan.eta = 0; return plan; }
  if (phase === 'landed') { plan.action = 'done'; plan.eta = 0; return plan; }
  const service = Boolean(sim.currentStage?.service);
  if (phase === 'parking') {
    if (sim.fairing) { plan.action = 'fairing'; plan.eta = 0; return plan; }
    const w = tliWindow(sim);
    plan.window = w;
    plan.action = w.waitS <= 0 ? 'tli' : 'waitTli';
    plan.eta = w.waitS;
    return plan;
  }
  const pred = guidePrediction(sim, g);
  plan.pred = pred;
  // `limit` = segundos hasta el próximo cambio físico (llegar a la Luna, pasar por su punto más bajo, salir de su zona,
  // entrar al aire): al acelerar el tiempo nunca se salta más allá, aunque haya una maniobra pendiente.
  const until = (t) => (t != null && t > sim.t ? t - sim.t : Infinity);
  plan.limit = Math.min(sim.body === 'earth' ? until(pred.encounter?.t) : Infinity, sim.body === 'moon' && !pred.moon?.closed ? Math.min(until(pred.moon?.tPeri), until(pred.exit?.t)) : Infinity, sim.body === 'earth' && !pred.encounter ? until(pred.entry?.t) : Infinity);
  if (phase === 'toMoon') {
    plan.check = courseCheck(sim, pred);
    const sinceTli = sim.t - (sim.burn?.endT ?? m.tliT ?? sim.t);
    if (!service && sim.stage < sim.stageCount - 1 && sinceTli > 60) { plan.action = 'sepUpper'; plan.eta = 0; return plan; }
    const toEnc = pred.encounter ? pred.encounter.t - sim.t : Infinity;
    // la corrección se hace con calma: un par de horas después de la inyección, y otra vez más cerca si hace falta
    const far = sim.r > 6e7;
    if (far && plan.check && !plan.check.fine && !(g.mccMoon >= 2)) { plan.action = 'mcc'; plan.goal = 'moon'; plan.eta = 0; return plan; }
    plan.action = 'coast';
    plan.eta = far ? toEnc : Math.max(0, (6.2e7 - sim.r) / Math.max(sim.radialSpeed, 100));
    return plan;
  }
  if (phase === 'approach') {
    const lp = loiPoint(sim, pred);
    plan.window = lp;
    if (!lp) { plan.action = 'coast'; plan.eta = 600; return plan; }
    if (lp.passed && !m.lunarOrbit) { plan.action = 'loi'; plan.eta = 0; plan.late = true; return plan; }
    plan.action = lp.waitS <= 0 ? 'loi' : 'waitLoi';
    plan.eta = Math.max(0, lp.waitS);
    return plan;
  }
  if (phase === 'lunarOrbit') {
    const w = teiWindow(sim);
    plan.window = w;
    if (!w) { plan.action = 'orbit'; plan.eta = 600; return plan; }
    plan.action = w.open ? 'tei' : 'waitTei';
    plan.eta = w.waitS;
    return plan;
  }
  if (phase === 'departing') {
    plan.check = courseCheck(sim, pred);
    plan.action = 'coast';
    plan.eta = pred.exit ? Math.max(0, pred.exit.t - sim.t) : 3600;
    return plan;
  }
  if (phase === 'toEarth') {
    plan.check = courseCheck(sim, pred);
    const toEntry = pred.entry ? pred.entry.t - sim.t : Infinity;
    const alt = sim.altitude;
    const settle = sim.t - (m.leftT ?? sim.t) > 1800;
    if (!sim.capsuleOnly && plan.check && !plan.check.fine && settle && alt > 4e6 && !(g.mccEarth >= 3) && (g.mccEarthAlt == null || alt < g.mccEarthAlt * 0.5)) { plan.action = 'mcc'; plan.goal = 'earth'; plan.eta = 0; return plan; }
    if (!sim.capsuleOnly && alt < LUNAR.SM_SEP_ALT && sim.radialSpeed < 0) { plan.action = 'sepService'; plan.eta = 0; return plan; }
    plan.action = 'coast';
    // se salta hasta el próximo punto de control: media distancia (por si hay que corregir), separación o reentrada
    const vr = Math.max(-sim.radialSpeed, 50);
    const toSep = sim.capsuleOnly ? toEntry : (alt - LUNAR.SM_SEP_ALT) / vr;
    const toHalf = g.mccEarthAlt != null && alt > 8e6 ? (alt - g.mccEarthAlt * 0.5) / vr : Infinity;
    plan.eta = Math.max(0, Math.min(toEntry, toSep > 0 ? toSep : toEntry, toHalf > 0 ? toHalf : Infinity, settle ? Infinity : 1800));
    return plan;
  }
  if (phase === 'entry') { plan.action = 'entry'; plan.eta = 0; return plan; }
  if (phase === 'descent') {
    const can = sim.capsuleOnly && !sim.chute && sim.altitude < LUNAR.CHUTE_ALT && sim.aero().v < LUNAR.CHUTE_SPEED;
    plan.action = sim.chute ? 'descent' : can ? 'chute' : 'entry';
    plan.eta = 0;
    return plan;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Piloto automático de toda la misión
// ---------------------------------------------------------------------------

/** @param program programa de ascenso (el mismo que usa el piloto automático de las demás misiones) */
export function newLunarAutopilot(program = {}) {
  return { base: newAutopilot({ ...program, waitWindow: true }), guide: newGuide(), minRevs: 1, plan: null };
}

/**
 * Un paso del piloto automático: ejecuta separaciones, encendidos y paracaídas, y devuelve los controles
 * { throttle, betaTarget, done, eta, plan } para advance(). `eta` dice cuánto se puede saltar en el tiempo.
 */
export function lunarAutopilotStep(sim, ap) {
  const g = ap.guide;
  // si se enciende cuando la nave ya está en órbita (la llevó el jugador), no hay subida que hacer
  if (sim.mission.leo && ap.base.phase === 'ascent') ap.base.phase = 'window';
  // subida: el piloto automático de siempre, hasta la órbita de espera
  if (!sim.mission.leo || !['window', 'transfer'].includes(ap.base.phase)) {
    const c = applyAutopilot(sim, ap.base);
    if (!['window', 'transfer'].includes(ap.base.phase)) return { throttle: c.throttle, betaTarget: c.betaTarget, done: false, eta: 0, plan: { phase: 'ascent', action: 'ascent' } };
  }
  // maniobra en curso
  if (sim.burn && !sim.burn.done) {
    if (sim.engineOut && sim.stage < sim.stageCount - 1) { sim.separateStage(); return { throttle: 0, betaTarget: null, done: false, eta: 0, plan: { phase: lunarPhase(sim), action: 'burning' } }; }
    const c = burnControl(sim);
    if (sim.mode !== c.mode) sim.setMode(c.mode);
    if (c.done) { if (sim.burn.kind === 'mcc') { if (sim.burn.goal === 'moon') g.mccMoon = (g.mccMoon ?? 0) + 1; else { g.mccEarth = (g.mccEarth ?? 0) + 1; g.mccEarthAlt = sim.altitude; } } g.pred = null; }
    return { throttle: c.throttle, betaTarget: null, done: false, eta: 0, plan: { phase: lunarPhase(sim), action: 'burning', burn: sim.burn.kind, readout: c.readout } };
  }
  const plan = lunarPlan(sim, g);
  ap.plan = plan;
  const out = { throttle: 0, betaTarget: null, done: false, eta: plan.eta, plan };
  switch (plan.action) {
    case 'fairing': sim.dropFairing(); out.eta = 0; break;
    case 'tli': startBurn(sim, 'tli'); out.eta = 0; break;
    case 'sepUpper': sim.separateStage(); g.pred = null; out.eta = 0; break;
    case 'mcc': startBurn(sim, 'mcc', { goal: plan.goal }); out.eta = 0; break;
    case 'loi': startBurn(sim, 'loi'); out.eta = 0; break;
    case 'tei':
      if (sim.mission.lunarRevs >= ap.minRevs) { startBurn(sim, 'tei'); out.eta = 0; } else out.eta = Math.min(600, Math.max(30, plan.window.period * (ap.minRevs - sim.mission.lunarRevs)));
      break;
    case 'waitTei': if (sim.mission.lunarRevs < ap.minRevs) out.eta = Math.min(plan.eta, 900); break;
    case 'sepService': sim.separateStage(); g.pred = null; out.eta = 0; break;
    case 'chute': sim.deployChute(); out.eta = 0; break;
    case 'done': out.done = true; break;
    default: break;
  }
  if (sim.mode !== 'prograde' && !sim.capsuleOnly && plan.action !== 'entry') sim.setMode('prograde'); // mientras espera, mira hacia adelante
  return out;
}

/** Vuela la misión completa con el piloto automático (para las pruebas y para comprobar que la misión se puede cumplir). */
export function runLunarAutopilot(sim, program = {}, { maxSteps = 400000, minRevs = 1, onStep = null } = {}) {
  const ap = newLunarAutopilot(program);
  ap.minRevs = minRevs;
  if (sim.status === 'pad') sim.ignite();
  let steps = 0;
  while (sim.status === 'flying' && steps++ < maxSteps) {
    const c = lunarAutopilotStep(sim, ap);
    if (c.done) break;
    const inAir = sim.body === 'earth' && sim.altitude < PHYS.ATM_TOP * 1.2;
    const burning = c.throttle > 0 || sim.throttle > 0.001;
    let dt;
    if (burning) dt = sim.burn && !sim.burn.done ? 0.05 : 0.25;
    else if (inAir || c.plan.phase === 'ascent') dt = 0.25;
    else dt = clamp((c.eta ?? 0) * 0.5, 0.25, 3600);
    sim.advance(dt, { throttle: c.throttle, betaTarget: sim.mode === 'manual' ? c.betaTarget : null });
    if (onStep) onStep(sim, c, dt);
  }
  return { sim, ap, steps };
}
