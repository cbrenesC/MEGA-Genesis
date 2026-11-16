import { localizedNumber, simText } from "../../../src/i18n/catalog.js";
// Física del vuelo interactivo del módulo LAUNCH (versión 2).
//
// Es un módulo PURO (sin Phaser ni DOM): lo usa la escena de vuelo para mover el cohete y
// las pruebas de Node para comprobar que la física es coherente con el catálogo.
//
// Modelo (2D, plano de la órbita, con la Tierra en el origen):
//   - Gravedad real: g = μ / r²  (baja con la altura).
//   - Empuje: depende del acelerador (0–100 %), del impulso específico (Isp, que sube al salir
//     de la atmósfera) y se dirige según el ángulo del cohete respecto a la vertical local.
//   - Masa: baja al quemar combustible; cada etapa soltada se lleva su estructura.
//   - Aire: densidad exponencial, resistencia ½·ρ·v²·Cd·A (crece si el cohete va "de costado")
//     y presión dinámica q = ½·ρ·v² (Max-Q).
//   - Escala de tiempo: el reloj del juego corre COMPRESSION veces más rápido que el real
//     (un ascenso de ~9 min dura ~2,6 min). Se simula física real; solo se acelera el tiempo.
//
// Ninguna cifra de cohete está escrita aquí: sale de data/flight.json (diseños) y de
// data/flight-calibration.json (tamaños calibrados contra la capacidad del catálogo).

import { EARTH, MOON, moonState, gravity, relativeState, bodyAt, coastStepLimit } from './bodies.js';

export const PHYS = {
  MU: EARTH.MU, // m³/s²  (parámetro gravitacional de la Tierra)
  RE: EARTH.R, // m
  G0: 9.80665,
  RHO0: 1.225, // kg/m³ al nivel del mar
  H_SCALE: 7500, // m (altura de escala de la atmósfera)
  ATM_TOP: 100000, // m: arriba de esto el aire ya no cuenta
  EARTH_ROT: 465.1, // m/s en el ecuador
  COMPRESSION: 3.5, // 1 s de juego = 3,5 s de física
  PERI_OK: 150000, // m: periapsis mínimo para decir "ya estás en órbita"
  Q_WARN: 30000, // Pa: aviso amarillo
  Q_LIMIT: 40000, // Pa: la estructura aguanta hasta aquí sin castigo
  Q_BREAK_FACTOR: 1.6, // arriba de LIMIT·1,6 el cohete se rompe
  QALPHA_BREAK: 24000, // Pa: presión × ángulo de ataque (sin(α)): si pasa, se rompe
  TURN_RATE: (3 * Math.PI) / 180, // rad/s físicos que gira el cohete con A/D
  THROTTLE_RATE: 1.2, // fracción por segundo físico
  CD: 0.3,
  SEP_SPEED: 1.6, // m/s: velocidad relativa con la que los resortes/gases empujan la etapa suelta lejos del cohete
  FAIRING_SPEED: 2.2, // m/s: cada mitad de la cofia se abre hacia un lado
  // --- regreso a la Tierra (sólo naves con cápsula) ---
  HEAT_K: 8e-5, // flujo de calor en la punta roma: q = K·√ρ·v³ (W/m², fórmula de Sutton–Graves simplificada)
  HEAT_BARE: 9e4, // W/m²: lo que aguanta una nave SIN escudo térmico por delante antes de empezar a dañarse
  BARE_LOAD: 6e6, // J/m²: calor acumulado con el que se destruye una nave sin escudo
  ENTRY_SPEED: 2500, // m/s: por encima de esto, entrar al aire es una "reentrada"
  LAND_SPEED: 12, // m/s: velocidad máxima para tocar el agua o el suelo sin romperse
  CHUTE_MAX_ALT: 30000, // m: más arriba el aire es tan fino que el paracaídas no se abre
  CHUTE_MAX_SPEED: 320, // m/s: más rápido que esto, el paracaídas se rompe al abrirse
  CHUTE_DROGUE_S: 14, // s: los paracaídas pequeños (de frenado) trabajan solos este tiempo
  CHUTE_OPEN_S: 10, // s: lo que tardan en inflarse los paracaídas principales
};

export const DEG = Math.PI / 180;
const MS = {}; // escritorio: estado de la Luna
const GV = [0, 0]; // escritorio: gravedad
const NO_AIR = { q: 0, alpha: 0, v: 0, rho: 0 };

/** Diario de una misión lunar de ida y vuelta: cada meta se marca cuando la física dice que se cumplió. */
export function newMissionLog() {
  return {
    leo: false, leoT: null, parking: null, // órbita de espera alrededor de la Tierra
    tli: false, tliT: null, // la órbita ya llega hasta la Luna
    soi: false, soiT: null, minMoonAlt: Infinity, // entró en la zona de influencia de la Luna
    lunarOrbit: false, lunarOrbitT: null, orbit: null, bestOrbit: null, revAngle: 0, lunarRevs: 0, lastA: null,
    tei: false, teiT: null, // escapó de la Luna para volver
    left: false, leftT: null, entry: false, landed: false, moonCrash: false,
  };
}
// Dos formas de llegar a la órbita (parámetro `coastDv` del programa de ascenso):
//   · clásica (coastDv = ∞, la de la calibración): apagar cuando el punto más alto llega a la altura, esperar y redondear arriba;
//   · inserción directa (coastDv = COAST_DV): si para redondear falta más que eso, NO se apaga: se sigue empujando casi
//     horizontal sosteniendo la altura. Gasta menos cuando el ascenso quedó muy empinado.
export const COAST_DV = 350; // m/s
const CIRC_ACCEL = 12; // m/s²: aceleración máxima de la quemada de circularización del piloto automático
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

export const airDensity = (h) => (h > PHYS.ATM_TOP ? 0 : PHYS.RHO0 * Math.exp(-Math.max(h, 0) / PHYS.H_SCALE));
export const pressureRatio = (h) => (h > PHYS.ATM_TOP ? 0 : Math.exp(-Math.max(h, 0) / PHYS.H_SCALE));

/** Bonus de velocidad por el giro de la Tierra al lanzar hacia una inclinación (m/s). */
export function earthRotationBonus(latDeg, incDeg) {
  const c = Math.cos(latDeg * DEG);
  if (c < 1e-6) return 0;
  // Acimut del lanzamiento (desde el norte): sin A = cos i / cos φ. La Tierra se mueve hacia el este
  // a EARTH_ROT·cos φ en el sitio; la parte que ayuda es la que va en la dirección del lanzamiento.
  const sinA = clamp(Math.cos(incDeg * DEG) / c, -1, 1);
  return PHYS.EARTH_ROT * c * sinA;
}

// ---------------------------------------------------------------------------
// Elementos orbitales a partir de posición y velocidad
// ---------------------------------------------------------------------------

export function orbitElements(x, y, vx, vy, mu = PHYS.MU, R = PHYS.RE) {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const energy = v2 / 2 - mu / r;
  const h = x * vy - y * vx;
  const rv = x * vx + y * vy;
  const ex = ((v2 - mu / r) * x - rv * vx) / mu;
  const ey = ((v2 - mu / r) * y - rv * vy) / mu;
  const e = Math.hypot(ex, ey);
  const hyper = energy >= 0;
  const a = hyper ? Infinity : -mu / (2 * energy);
  const rp = hyper ? (h * h) / mu / (1 + e) : a * (1 - e);
  const ra = hyper ? Infinity : a * (1 + e);
  return {
    r, energy, e, a, rp, ra, h, hyper,
    periAlt: rp - R,
    apoAlt: ra - R,
    period: hyper ? Infinity : 2 * Math.PI * Math.sqrt((a * a * a) / mu),
    // ángulo (rad) del periapsis medido desde +x, para dibujar la elipse
    periAngle: Math.atan2(ey, ex),
    ccw: h >= 0,
  };
}

export const circularSpeed = (r) => Math.sqrt(PHYS.MU / r);

/** Δv (m/s) de una quemada prograde desde una órbita circular de radio r1 hasta tener apoapsis ra. */
export function transferDeltaV(r1, ra) {
  const a = (r1 + ra) / 2;
  const vPeri = Math.sqrt(PHYS.MU * (2 / r1 - 1 / a));
  return vPeri - circularSpeed(r1);
}

// ---------------------------------------------------------------------------
// Destinos: cuándo se considera lograda la órbita
// ---------------------------------------------------------------------------

export const DEST = {
  LEO: { kind: 'orbit' },
  SSO: { kind: 'orbit' },
  GTO: { kind: 'transfer', apoKm: 35786, okApoKm: 30000, windowTolDeg: 70, windowDeg: 200, get label() { return simText("flight.the-elliptical-transfer-toward-36-000-km"); } },
  TLI: { kind: 'transfer', apoKm: 384400, okApoKm: 370000, windowTolDeg: 35, windowDeg: 120, get label() { return simText("flight.the-transfer-toward-the-moon"); } },
  ESCAPE: { kind: 'transfer', apoKm: Infinity, okApoKm: Infinity, windowTolDeg: 35, windowDeg: 300, get label() { return simText("flight.the-departure-trajectory-from-earth"); } },
};

export const ROUND_GAP = 15000; // m: diferencia máxima entre el punto más alto y el más bajo para decir "órbita redonda"

/**
 * ¿La órbita ya está lista? Vale cuando el punto más bajo llegó a la altura pedida, o cuando la órbita ya quedó
 * redonda sobre la atmósfera aunque sea un poco más abajo: seguir empujando ahí ya no la redondea más,
 * sólo estira el otro lado y quema el combustible que queda.
 */
export function orbitGoalMet(el, tAltM) {
  if (el.hyper) return false;
  if (el.periAlt >= Math.max(PHYS.PERI_OK, tAltM - 6000)) return true;
  return el.periAlt >= PHYS.PERI_OK && el.apoAlt - el.periAlt <= ROUND_GAP;
}

export function transferReached(destId, el) {
  const d = DEST[destId];
  if (!d || d.kind !== 'transfer') return false;
  if (destId === 'ESCAPE') return el.hyper && el.periAlt >= PHYS.PERI_OK;
  return el.periAlt >= PHYS.PERI_OK && (el.hyper || el.apoAlt >= d.okApoKm * 1000);
}

// ---------------------------------------------------------------------------
// Vehículo: arma las etapas a partir del diseño y de la masa calibrada
// ---------------------------------------------------------------------------

/**
 * @param {object} design  data/flight.json → vehicles[id] (etapas relativas)
 * @param {number} stackKg masa total de etapas (calibrada)
 * @param {number} calPayloadKg  carga con la que se calibró (define empuje y cofia)
 */
export function buildVehicle(design, stackKg, calPayloadKg) {
  const fairingKg = Math.round(design.fairingPct * calPayloadKg);
  const masses = design.stages.map((s) => s.share * stackKg);
  const vehicle = { id: design.id, name: design.name, diameterM: design.diameterM, fairingKg, stages: [], stackKg, calPayloadKg };
  vehicle.cdA = PHYS.CD * Math.PI * (design.diameterM / 2) ** 2;
  design.stages.forEach((s, i) => {
    const mass = masses[i];
    const dry = mass * s.eps;
    const prop = mass - dry;
    // masa cuando se enciende esta etapa (con carga de calibración)
    const above = masses.slice(i).reduce((a, b) => a + b, 0) + fairingKg + calPayloadKg;
    const ispRef = i === 0 ? s.ispSl : s.ispVac;
    vehicle.stages.push({
      name: s.name, dryKg: dry, propKg: prop, ispVac: s.ispVac, ispSl: s.ispSl,
      mdot: (s.twr * above) / ispRef, // kg/s a 100 %
    });
  });
  return vehicle;
}

/**
 * Nave con cápsula para misiones de ida y vuelta: agrega el MÓDULO DE SERVICIO como una etapa más (la última) y
 * deja lista la cápsula (escudo térmico y paracaídas). La carga del simulador pasa a ser sólo la cápsula.
 * @param sc  { capsuleKg, serviceDryKg, propellantKg, ispS, thrustN, capsuleCdA, chuteCdA, drogueCdA, shieldLoad, gLimit, gBreak }
 * @param ispK  margen de pilotaje del módulo de servicio (mismo empuje, el combustible rinde k veces más)
 */
export function withSpacecraft(vehicle, sc, ispK = 1) {
  const isp = sc.ispS * ispK;
  const service = { name: sc.serviceName ?? simText("lunarFlight.service-module"), service: true, dryKg: sc.serviceDryKg, propKg: sc.propellantKg, ispVac: isp, ispSl: isp, mdot: sc.thrustN / (isp * PHYS.G0) };
  const craft = {
    name: sc.name ?? simText("lunarFlight.capsule"), capsuleKg: sc.capsuleKg,
    cdA: sc.capsuleCdA ?? 22, drogueCdA: sc.drogueCdA ?? 60, chuteCdA: sc.chuteCdA ?? 1100,
    shieldLoad: sc.shieldLoad ?? 2.4e8, gLimit: sc.gLimit ?? 9, gBreak: sc.gBreak ?? 20,
  };
  return { ...vehicle, stages: [...vehicle.stages, service], rocketStages: vehicle.stages.length, craft };
}

/**
 * Datos de la nave de ida y vuelta de una misión (o null si la nave no vuelve).
 * Salen de la nave de la misión (data/mock-missions.json → spacecraft.return): lo que no es combustible ni
 * módulo de servicio es la cápsula. `offloadKg` = combustible que se decidió no cargar.
 */
export function returnCraft(spacecraft, offloadKg = 0) {
  const r = spacecraft?.return;
  if (!r || r.profile !== 'lunarReturn') return null;
  const propellantKg = Math.max(0, (spacecraft.propellantKg ?? 0) - offloadKg);
  const capsuleKg = Math.max(r.capsuleKg, spacecraft.massKg - (spacecraft.propellantKg ?? 0) - r.serviceDryKg);
  return { ...r, name: spacecraft.name, capsuleKg, propellantKg, ispS: spacecraft.ispS };
}

/** Δv (m/s) que le queda a la nave con el combustible de la etapa actual (ecuación del cohete). */
export function stageDeltaV(sim) {
  const st = sim.currentStage;
  if (!st || sim.fuel[sim.stage] <= 0) return 0;
  const m0 = sim.mass;
  return st.ispVac * PHYS.G0 * Math.log(m0 / (m0 - sim.fuel[sim.stage]));
}

export const vehicleMassKg = (vehicle, payloadKg) => vehicle.fairingKg + payloadKg + vehicle.stages.reduce((a, s) => a + s.dryKg + s.propKg, 0);

// ---------------------------------------------------------------------------
// Simulación del vuelo
// ---------------------------------------------------------------------------

export class FlightSim {
  /**
   * @param {object} vehicle  salida de buildVehicle
   * @param {object} opts { payloadKg, latDeg, incDeg, destId, targetAltKm, events[] }
   */
  constructor(vehicle, opts) {
    this.vehicle = vehicle;
    this.payloadKg = opts.payloadKg;
    this.destId = opts.destId ?? 'LEO';
    this.targetAltKm = opts.targetAltKm ?? 250;
    this.events = (opts.events ?? []).map((e) => ({ ...e, done: false }));
    this.latDeg = opts.latDeg ?? 28.5;
    this.incDeg = opts.incDeg ?? 28.5;
    // Velocidad que regala el giro de la Tierra. `opts.v0` permite fijarla (ver flow.js).
    this.v0 = opts.v0 ?? earthRotationBonus(this.latDeg, this.incDeg);
    this.atmRate = this.v0 / PHYS.RE; // rad/s con la que gira el aire
    this.t = 0;
    this.x = 0; this.y = PHYS.RE; this.vx = this.v0; this.vy = 0;
    this.beta = 0; // rad desde la vertical local; + = hacia el este (derecha)
    this.grounded = true; // apoyado en la plataforma: se mueve con el suelo hasta que el empuje supera al peso
    this.lastSeparation = null; // datos físicos de la última pieza soltada (ver separateStage)
    this.throttle = 0;
    this.stage = 0;
    const fuelFraction = Number.isFinite(opts.fuelFraction) ? clamp(opts.fuelFraction, 0.75, 1) : 1;
    this.fuel = vehicle.stages.map((s) => s.propKg * fuelFraction);
    this.fairing = true;
    this.mode = 'manual'; // 'manual' | 'prograde' (quemada de transferencia)
    this.status = 'pad'; // pad | flying | ended
    this.endReason = null;
    this.thrustMult = vehicle.stages.map(() => 1);
    this.log = [];
    this.stats = {
      maxQ: 0, maxQTime: 0, maxAlt: 0, maxQalpha: 0, overQSeconds: 0,
      stagingTimes: [], wastedProp: 0, fairingTime: null, fairingQ: null, fairingAlt: null,
      burnSeconds: 0, transfer: null, orbitTime: null, aoaSeconds: 0,
    };
    this.notice = null;
    this.lastQ = 0;
    this.orbitReached = false;
    this.initialPropKg = this.fuel.reduce((a, b) => a + b, 0);
    this.refTime = null;
    // --- misión lunar de ida y vuelta (opcional): la Luna, la cápsula y el diario de la misión
    this.moon = opts.moon ? { angle0: opts.moon.angle0 ?? 0 } : null;
    this.body = 'earth'; // cuerpo cuya gravedad manda: 'earth' | 'moon'
    this.craft = opts.craft ?? null; // { name, capsuleKg, cdA, chuteCdA, drogueCdA, shieldLoad, gLimit }
    this.profile = opts.profile ?? null; // 'lunarReturn' = órbita, Luna, órbita lunar, regreso y amerizaje
    this.chute = null; // { t0 } cuando se abren los paracaídas · { torn: true } si se rompieron
    this.heat = { flux: 0, load: 0, bare: 0, shieldLeft: 1 }; // calor de la reentrada
    this.gNow = 0; // fuerza g que siente la nave ahora (empuje + aire)
    this.landing = null; // { speed, t } al tocar la superficie con suavidad
    if (this.craft) Object.assign(this.stats, { maxG: 0, maxHeat: 0, entrySpeed: null, entryAngleDeg: null, entryT: null, chuteT: null, chuteSpeed: null, smSepT: null });
    this.mission = this.profile === 'lunarReturn' ? newMissionLog() : null;
  }

  get mass() {
    let m = this.payloadKg + (this.fairing ? this.vehicle.fairingKg : 0);
    for (let i = this.stage; i < this.vehicle.stages.length; i++) m += this.vehicle.stages[i].dryKg + this.fuel[i];
    return m;
  }

  get r() { return Math.hypot(this.x, this.y); }
  /** Altura sobre la Tierra (m). Para la altura sobre el cuerpo que manda, ver bodyAltitude. */
  get altitude() { return this.r - PHYS.RE; }
  /** Posición y velocidad respecto al cuerpo que manda (la Tierra o la Luna). */
  rel() { return relativeState(this.x, this.y, this.vx, this.vy, this.t, this.body, this.moon, {}); }
  /** Altura (m) sobre la superficie del cuerpo que manda. */
  get bodyAltitude() { if (this.body !== 'moon') return this.altitude; const q = this.rel(); return Math.hypot(q.x, q.y) - MOON.R; }
  /** Velocidad (m/s) respecto al cuerpo que manda. */
  get bodySpeed() { if (this.body !== 'moon') return this.speed; const q = this.rel(); return Math.hypot(q.vx, q.vy); }
  /** Órbita respecto al cuerpo que manda (alturas medidas sobre su superficie). */
  get bodyElements() { if (this.body !== 'moon') return this.elements; const q = this.rel(); return orbitElements(q.x, q.y, q.vx, q.vy, MOON.MU, MOON.R); }
  /** ¿Queda sólo la cápsula? (ya se soltaron todas las etapas y el módulo de servicio) */
  get capsuleOnly() { return Boolean(this.craft) && this.stage >= this.stageCount; }
  /** Área de frenado (Cd·A, m²): el cohete, o la cápsula con sus paracaídas. */
  get dragArea() {
    if (!this.capsuleOnly) return this.vehicle.cdA;
    const c = this.craft;
    if (!this.chute || this.chute.torn) return c.cdA;
    const dt = this.t - this.chute.t0;
    const open = clamp((dt - PHYS.CHUTE_DROGUE_S) / PHYS.CHUTE_OPEN_S, 0, 1);
    return c.cdA + c.drogueCdA * clamp(dt / 2, 0, 1) + (c.chuteCdA - c.drogueCdA) * open * open * (3 - 2 * open);
  }
  /** Paracaídas: 'none' | 'drogue' (los pequeños) | 'opening' | 'main' | 'torn'. */
  get chuteState() {
    if (!this.chute) return 'none';
    if (this.chute.torn) return 'torn';
    const dt = this.t - this.chute.t0;
    return dt < PHYS.CHUTE_DROGUE_S ? 'drogue' : dt < PHYS.CHUTE_DROGUE_S + PHYS.CHUTE_OPEN_S ? 'opening' : 'main';
  }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get radialSpeed() { return (this.x * this.vx + this.y * this.vy) / this.r; }
  get tangentSpeed() { return (this.y * this.vx - this.x * this.vy) / this.r; } // + = hacia el este
  get elements() { return orbitElements(this.x, this.y, this.vx, this.vy); }
  /** Ángulo de la posición alrededor de la Tierra (rad desde +x). */
  get angle() { return Math.atan2(this.y, this.x); }
  get stageCount() { return this.vehicle.stages.length; }
  get currentStage() { return this.vehicle.stages[this.stage] ?? null; }
  get stageFuelFrac() { const s = this.currentStage; return s ? this.fuel[this.stage] / s.propKg : 0; }
  get fuelLeftKg() { return this.fuel.slice(this.stage).reduce((a, b) => a + b, 0); }
  get fuelLeftPct() { return this.initialPropKg > 0 ? (this.fuelLeftKg / this.initialPropKg) * 100 : 0; }
  get engineOut() { return this.stage >= this.stageCount || this.fuel[this.stage] <= 0; }

  /**
   * Dirección del eje del cohete (vector unitario).
   * 'prograde' = hacia donde va · 'retrograde' = al revés (para frenar) · 'manual' = ángulo `beta` desde la vertical local.
   * Cerca de la Luna, "hacia donde va" y "vertical" se miden respecto a la Luna.
   */
  attitude(x = this.x, y = this.y, vx = this.vx, vy = this.vy, t = this.t) {
    if (this.body === 'moon') {
      moonState(this.moon, t, MS);
      x -= MS.x; y -= MS.y; vx -= MS.vx; vy -= MS.vy;
    }
    if (this.mode === 'prograde' || this.mode === 'retrograde') {
      const v = (Math.hypot(vx, vy) || 1) * (this.mode === 'retrograde' ? -1 : 1);
      return [vx / v, vy / v];
    }
    const r = Math.hypot(x, y);
    const ux = x / r; const uy = y / r; // vertical local
    const ex = uy; const ey = -ux; // este
    return [Math.cos(this.beta) * ux + Math.sin(this.beta) * ex, Math.cos(this.beta) * uy + Math.sin(this.beta) * ey];
  }

  /** Ángulo `beta` (desde la vertical local del cuerpo que manda) que corresponde a un eje dado en el mundo. */
  betaOf(ax, ay) {
    const q = this.rel();
    const r = Math.hypot(q.x, q.y) || 1;
    const ux = q.x / r; const uy = q.y / r;
    return Math.atan2(ax * uy - ay * ux, ax * ux + ay * uy);
  }

  /** Velocidad del cohete respecto al aire (que gira con la Tierra). */
  relVelocity(x = this.x, y = this.y, vx = this.vx, vy = this.vy) {
    return [vx - this.atmRate * y, vy + this.atmRate * x];
  }

  /** Presión dinámica (Pa) y ángulo de ataque (rad) ahora mismo. */
  aero() {
    const h = this.altitude;
    const rho = airDensity(h);
    const [rx, ry] = this.relVelocity();
    const v = Math.hypot(rx, ry);
    const q = 0.5 * rho * v * v;
    let alpha = 0;
    if (v > 15 && rho > 0) {
      const [ax, ay] = this.attitude();
      alpha = Math.acos(clamp((ax * rx + ay * ry) / v, -1, 1));
    }
    return { q, alpha, v, rho };
  }

  ignite() {
    if (this.status !== 'pad') return;
    this.status = 'flying';
    this.t = 0;
    this.throttle = 0;
    this.addLog(simText("flight.liftoff-engines-ignited"), 'ok');
  }

  addLog(text, kind = 'info') {
    this.log.push({ t: this.t, text, kind });
    this.notice = { t: this.t, text, kind };
  }

  /** Cambia el modo de orientación. Al volver a 'manual' el cohete conserva hacia dónde estaba mirando. */
  setMode(mode) {
    if (mode === this.mode) return;
    if (mode === 'manual') { const [ax, ay] = this.attitude(); this.mode = 'manual'; this.beta = this.betaOf(ax, ay); return; }
    this.mode = mode;
  }

  /** Separa la etapa actual (el jugador pulsa "Separar etapa"). */
  separateStage() {
    if (this.status !== 'flying' || this.stage >= this.stageCount) return false;
    const s = this.vehicle.stages[this.stage];
    const frac = this.fuel[this.stage] / s.propKg;
    this.stats.wastedProp += this.fuel[this.stage];
    this.stats.stagingTimes.push({ stage: this.stage + 1, t: Math.round(this.t), fuelLeftPct: Math.round(frac * 100), altitudeKm: Math.round(this.altitude / 1000) });
    const isService = Boolean(s.service);
    if (isService) {
      if (this.craft) this.stats.smSepT = this.t;
      this.addLog(simText("lunarFlight.service-module-released-only-the-capsule-remains-with"), 'ok');
    } else if (this.vehicle.stages[this.stage + 1]?.service && this.mission?.tli) {
      // después de la inyección hacia la Luna la etapa superior ya cumplió: soltarla es lo correcto aunque le sobre combustible
      this.stats.wastedProp -= this.fuel[this.stage];
      this.addLog(simText("lunarFlight.upper-stage-separated-the-spacecraft-continues-on-its"), 'ok');
    } else this.addLog(simText('flight.stage-0-separated-1', this.stage + 1, frac > 0.04 ? simText('flight.it-still-had-0-fuel', Math.round(frac * 100)) : ''), frac > 0.04 ? 'warn' : 'ok');
    // La pieza suelta es un cuerpo aparte: se lleva la posición, la velocidad y la orientación del cohete
    // y recibe un empujoncito de separación. Se conserva el momento: el cohete recibe el empujoncito contrario.
    const axis = this.attitude();
    const stageKg = s.dryKg + this.fuel[this.stage];
    this.stage += 1;
    const restKg = this.mass;
    const share = stageKg / Math.max(stageKg + restKg, 1);
    const dvStage = -PHYS.SEP_SPEED * (1 - share);
    this.lastSeparation = { kind: 'stage', index: this.stage - 1, massKg: stageKg, x: this.x, y: this.y, vx: this.vx + dvStage * axis[0], vy: this.vy + dvStage * axis[1], axis, t: this.t };
    const dvRocket = PHYS.SEP_SPEED * share;
    this.vx += dvRocket * axis[0]; this.vy += dvRocket * axis[1];
    if (this.stage >= this.stageCount) { this.throttle = 0; if (this.mode !== 'manual') this.setMode('manual'); }
    return true;
  }

  /**
   * Abre los paracaídas de la cápsula: primero los pequeños de frenado y, unos segundos después, los principales.
   * Sólo se abren donde ya hay aire (abajo de 30 km), y hay que esperar a que la cápsula frene: lo normal es abrirlos
   * por debajo de 7 km, cuando ya va a menos de 240 m/s. Abiertos demasiado rápido, se rompen.
   * Devuelve 'ok' | 'torn' | motivo por el que no se abrieron.
   */
  deployChute() {
    if (this.status !== 'flying' || !this.craft) return 'none';
    if (!this.capsuleOnly) return 'attached';
    if (this.chute) return 'already';
    if (this.body !== 'earth' || this.altitude > PHYS.CHUTE_MAX_ALT) { this.addLog(simText("lunarFlight.it-is-too-early-to-deploy-the-air"), 'warn'); return 'high'; }
    const v = this.aero().v;
    this.stats.chuteT = this.t; this.stats.chuteSpeed = v; this.stats.chuteAlt = this.altitude;
    if (v > PHYS.CHUTE_MAX_SPEED) {
      this.chute = { torn: true, t0: this.t };
      this.addLog(simText("lunarFlight.parachutes-deployed-at-0-m-s-they-were", Math.round(v)), 'bad');
      return 'torn';
    }
    this.chute = { t0: this.t };
    this.addLog(simText("lunarFlight.drogue-chutes-deployed-the-main-parachutes-will-open"), 'ok');
    return 'ok';
  }

  /** Cociente empuje/peso ahora mismo (con el acelerador actual y el Isp de esta altura). */
  thrustToWeight(throttle = this.throttle) {
    const stage = this.currentStage;
    if (!stage || this.engineOut) return 0;
    const pr = pressureRatio(this.altitude);
    const isp = stage.ispVac + (stage.ispSl - stage.ispVac) * pr;
    const thrust = throttle * stage.mdot * (this.thrustMult[this.stage] ?? 1) * isp * PHYS.G0;
    const q = this.body === 'moon' ? this.rel() : null;
    const gLocal = q ? MOON.MU / (q.x * q.x + q.y * q.y) : PHYS.MU / (this.r * this.r);
    return thrust / (this.mass * gLocal);
  }

  dropFairing() {
    if (this.status !== 'flying' || !this.fairing) return false;
    const { q } = this.aero();
    this.stats.fairingTime = this.t;
    this.stats.fairingQ = q;
    this.stats.fairingAlt = this.altitude;
    this.fairing = false;
    this.lastSeparation = { kind: 'fairing', massKg: this.vehicle.fairingKg, x: this.x, y: this.y, vx: this.vx, vy: this.vy, axis: this.attitude(), t: this.t };
    if (q > 800) this.addLog(simText("flight.fairing-released-in-dense-air-the-spacecraft-was"), 'warn');
    else this.addLog(simText("flight.fairing-released-the-spacecraft-is-exposed-to-space"), 'ok');
    return true;
  }

  destroy(reason, text) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endReason = reason;
    this.throttle = 0;
    this.addLog(text, 'bad');
  }

  finish(reason = 'finished') {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endReason = reason;
    this.throttle = 0;
  }

  /** Avanza dtS segundos FÍSICOS (ya multiplicados por compresión y aceleración del tiempo). */
  advance(dtS, controls = {}) {
    let remaining = dtS;
    while (remaining > 1e-9 && this.status !== 'ended') {
      const burning = this.throttle > 0.001 && !this.engineOut;
      const inAir = this.altitude < PHYS.ATM_TOP;
      // con motor o con aire, pasos cortos; en el vacío y sin motor, tan largos como permite la órbita
      const maxH = burning || inAir || this.status === 'pad' ? 0.1 : coastStepLimit(this.x, this.y, this.vx, this.vy, this.t, this.body, this.moon);
      const h = Math.min(remaining, maxH);
      this.substep(h, controls);
      remaining -= h;
    }
  }

  substep(dt, controls) {
    if (this.status === 'pad') return;
    // --- controles del jugador / piloto automático
    if (controls.betaTarget != null && this.mode === 'manual') {
      this.beta += clamp(wrap(controls.betaTarget - this.beta), -PHYS.TURN_RATE * dt, PHYS.TURN_RATE * dt);
    } else if (controls.steer && this.mode === 'manual') {
      this.beta = wrap(this.beta + clamp(controls.steer, -1, 1) * PHYS.TURN_RATE * dt);
    }
    // Sin empuje y con aire, el cohete se comporta como una flecha: la punta se alinea sola con el viento
    // (estabilidad aerodinámica). Mientras más presión del aire, más rápido se endereza.
    // La cápsula sola hace lo contrario: es estable con la base (el escudo térmico) por delante.
    const capsule = this.capsuleOnly;
    if (this.mode === 'manual' && this.body === 'earth' && !this.grounded && (capsule || (this.engineOut && !controls.steer && controls.betaTarget == null))) {
      const [rx, ry] = this.relVelocity();
      const v = Math.hypot(rx, ry);
      const q = 0.5 * airDensity(this.altitude) * v * v;
      if (v > 30 && q > (capsule ? 15 : 150)) {
        const r = this.r; const ux = this.x / r; const uy = this.y / r;
        let betaAir = Math.atan2(rx * uy - ry * ux, rx * ux + ry * uy);
        if (capsule) betaAir = wrap(betaAir + Math.PI);
        const rate = PHYS.TURN_RATE * Math.min(capsule ? 10 : 3, q / (capsule ? 200 : 1500));
        this.beta = wrap(this.beta + clamp(wrap(betaAir - this.beta), -rate * dt, rate * dt));
      }
    }
    if (controls.throttle != null) {
      const target = clamp(controls.throttle, 0, 1);
      this.throttle += clamp(target - this.throttle, -PHYS.THROTTLE_RATE * dt, PHYS.THROTTLE_RATE * dt);
    }
    if (this.engineOut) this.throttle = 0;

    this.processEvents();
    if (this.status === 'ended') return;

    // --- empuje y consumo
    const stage = this.currentStage;
    let thrust = 0;
    let mdot = 0;
    const mass0 = this.mass;
    if (stage && this.throttle > 0.001 && this.fuel[this.stage] > 0) {
      const pr = this.body === 'earth' ? pressureRatio(this.altitude) : 0;
      const isp = stage.ispVac + (stage.ispSl - stage.ispVac) * pr;
      mdot = this.throttle * stage.mdot * (this.thrustMult[this.stage] ?? 1);
      const burned = Math.min(mdot * dt, this.fuel[this.stage]);
      mdot = burned / dt;
      thrust = mdot * isp * PHYS.G0;
      this.fuel[this.stage] -= burned;
      this.stats.burnSeconds += dt;
      if (this.fuel[this.stage] <= 1e-6) {
        this.fuel[this.stage] = 0;
        this.addLog(stage.service ? simText("lunarFlight.the-service-module-ran-out-of-propellant") : simText('flight.stage-0-is-out-of-fuel', this.stage + 1), 'info');
      }
    }
    const massMid = mass0 - 0.5 * mdot * dt;

    // --- integración RK4 con empuje y masa constantes durante el paso
    const body = this.body; const moon = this.moon;
    const cdA = this.dragArea;
    const onEarth = body === 'earth';
    const accel = (x, y, vx, vy, tt) => {
      gravity(x, y, tt, body, moon, GV);
      let ax = GV[0]; let ay = GV[1];
      if (thrust > 0) {
        const [dx, dy] = this.attitude(x, y, vx, vy, tt);
        ax += (thrust / massMid) * dx; ay += (thrust / massMid) * dy;
      }
      if (onEarth) {
        const h = Math.hypot(x, y) - PHYS.RE;
        if (h < PHYS.ATM_TOP) {
          const rho = airDensity(h);
          const [rx, ry] = this.relVelocity(x, y, vx, vy);
          const v = Math.hypot(rx, ry);
          if (v > 0.5 && rho > 0) {
            // La resistencia NO depende de hacia dónde mira la punta: así la caída es pareja y predecible.
            // (Ir de costado con mucho aire sigue siendo peligroso: lo castiga el límite de presión × ángulo.)
            const k = 0.5 * rho * v * cdA / massMid;
            ax -= k * rx; ay -= k * ry;
          }
        }
      }
      return [ax, ay];
    };
    const { x, y, vx, vy } = this;
    const t0 = this.t;
    const [k1x, k1y] = accel(x, y, vx, vy, t0);
    const [k2x, k2y] = accel(x + 0.5 * dt * vx, y + 0.5 * dt * vy, vx + 0.5 * dt * k1x, vy + 0.5 * dt * k1y, t0 + 0.5 * dt);
    const [k3x, k3y] = accel(x + 0.5 * dt * (vx + 0.5 * dt * k1x), y + 0.5 * dt * (vy + 0.5 * dt * k1y), vx + 0.5 * dt * k2x, vy + 0.5 * dt * k2y, t0 + 0.5 * dt);
    const [k4x, k4y] = accel(x + dt * (vx + 0.5 * dt * k2x), y + dt * (vy + 0.5 * dt * k2y), vx + dt * k3x, vy + dt * k3y, t0 + dt);
    this.x += dt * (vx + (dt / 6) * (k1x + k2x + k3x));
    this.y += dt * (vy + (dt / 6) * (k1y + k2y + k3y));
    this.vx += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    this.vy += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    this.t += dt;

    // --- ¿cambió el cuerpo que manda? (entrada o salida de la zona de influencia de la Luna)
    if (moon) {
      const nb = bodyAt(this.x, this.y, this.t, moon);
      if (nb !== this.body) this.switchBody(nb);
      if (this.body === 'moon') {
        moonState(moon, this.t, MS);
        if (Math.hypot(this.x - MS.x, this.y - MS.y) < MOON.R) {
          if (this.mission) this.mission.moonCrash = true;
          this.destroy('crash-moon', simText("lunarFlight.the-spacecraft-struck-the-lunar-surface"));
          return;
        }
      }
    }

    // --- suelo
    if (this.body === 'earth' && this.r < PHYS.RE) {
      const ux = this.x / this.r; const uy = this.y / this.r;
      const vr = this.vx * ux + this.vy * uy;
      if (!this.grounded && this.capsuleOnly) {
        // la cápsula toca el agua (o el suelo): con paracaídas llega despacio; sin ellos, se rompe
        const [rx, ry] = this.relVelocity();
        const hit = Math.hypot(rx, ry);
        this.x = ux * PHYS.RE; this.y = uy * PHYS.RE;
        if (hit <= PHYS.LAND_SPEED) {
          this.landing = { speed: hit, t: this.t };
          if (this.mission) this.mission.landed = true;
          this.addLog(simText("lunarFlight.the-capsule-touched-down-at-0-m-s", localizedNumber(hit, 1, 1)), 'ok');
          this.finish('splashdown');
        } else {
          this.destroy('crash', this.chute && !this.chute.torn ? simText("lunarFlight.the-capsule-reached-the-surface-at-0-m", Math.round(hit)) : simText("lunarFlight.the-capsule-hit-the-surface-at-0-m", Math.round(hit)));
        }
        return;
      }
      if (!this.grounded && (vr < -15 || this.altitude < -50)) {
        this.destroy('crash', simText("flight.the-rocket-fell-back-to-earth-2"));
        return;
      }
      // en la plataforma: se queda quieto hasta que el empuje supere al peso
      this.x = ux * PHYS.RE; this.y = uy * PHYS.RE;
      if (vr < 0) { this.vx -= vr * ux; this.vy -= vr * uy; }
      if (this.grounded) { this.vx = this.v0 * uy; this.vy = -this.v0 * ux; }
    }
    if (this.grounded && this.altitude > 0.5) this.grounded = false; // ya se despegó de la plataforma

    // --- aerodinámica y estadísticas
    const aero = this.body === 'earth' ? this.aero() : NO_AIR;
    this.lastQ = aero.q;
    // fuerza g que se siente a bordo: todo lo que no es gravedad (empuje y freno del aire)
    const dragF = aero.q * cdA;
    this.gNow = (thrust + dragF) / Math.max(this.mass, 1) / PHYS.G0;
    this.stats.maxAlt = Math.max(this.stats.maxAlt, this.altitude);
    const craft = this.craft;
    // reentrada: la nave vuelve del espacio y entra al aire a gran velocidad
    if (craft && this.stats.entryT == null && this.body === 'earth' && this.altitude < PHYS.ATM_TOP && this.stats.maxAlt > PHYS.ATM_TOP * 1.5 && aero.v > PHYS.ENTRY_SPEED && this.radialSpeed < 0) {
      this.stats.entryT = this.t; this.stats.entrySpeed = aero.v;
      this.stats.entryAngleDeg = Math.asin(clamp(-this.radialSpeed / Math.max(this.speed, 1), -1, 1)) / DEG;
      if (this.mission) this.mission.entry = true;
      this.addLog(simText("lunarFlight.reentry-the-spacecraft-enters-the-atmosphere-at-0", localizedNumber(aero.v / 1000, 1, 1)), 'warn');
    }
    const reentry = Boolean(craft) && this.stats.entryT != null;
    if (!reentry) {
      if (aero.q > this.stats.maxQ) { this.stats.maxQ = aero.q; this.stats.maxQTime = this.t; }
      const qa = aero.q * Math.sin(aero.alpha);
      if (qa > this.stats.maxQalpha) this.stats.maxQalpha = qa;
      if (aero.q > PHYS.Q_LIMIT) this.stats.overQSeconds += dt;
      if (aero.q > 3000 && aero.alpha > 12 * DEG) this.stats.aoaSeconds += dt;
      if (aero.q > PHYS.Q_LIMIT * PHYS.Q_BREAK_FACTOR) {
        this.destroy('maxq', simText('flight.the-rocket-broke-apart-under-dynamic-pressure-max-2'));
        return;
      }
      if (qa > PHYS.QALPHA_BREAK) {
        this.destroy('aoa', simText('flight.the-rocket-turned-sideways-in-dense-air-and'));
        return;
      }
    } else {
      // calor: crece con la raíz de la densidad del aire y con el CUBO de la velocidad
      const flux = PHYS.HEAT_K * Math.sqrt(aero.rho) * aero.v * aero.v * aero.v;
      this.heat.flux = flux;
      if (flux > this.stats.maxHeat) this.stats.maxHeat = flux;
      if (this.gNow > this.stats.maxG) this.stats.maxG = this.gNow;
      if (this.capsuleOnly) {
        this.heat.load += flux * dt;
        this.heat.shieldLeft = Math.max(0, 1 - this.heat.load / craft.shieldLoad);
        if (this.heat.shieldLeft <= 0) { this.destroy('burn', simText("lunarFlight.the-heat-shield-was-completely-consumed-and-the")); return; }
        if (this.gNow > craft.gBreak) { this.destroy('gforce', simText("lunarFlight.the-capsule-entered-too-steeply-and-broke-apart", Math.round(this.gNow))); return; }
      } else if (flux > PHYS.HEAT_BARE) {
        // sin el escudo por delante (el módulo de servicio o una etapa siguen puestos) el calor destruye la nave
        this.heat.bare += (flux - PHYS.HEAT_BARE) * dt;
        if (this.heat.bare > PHYS.BARE_LOAD) { this.destroy('burn', simText("lunarFlight.the-spacecraft-burned-up-because-the-heat-shield")); return; }
      }
    }

    // --- ¿ya hay órbita?
    if (this.body === 'earth') {
      const el = this.elements;
      const wasReached = this.orbitReached;
      this.orbitReached = el.periAlt >= PHYS.PERI_OK && this.altitude > PHYS.ATM_TOP * 0.8;
      if (this.orbitReached && !wasReached && !(this.mission && this.mission.leo)) {
        this.stats.orbitTime = this.t;
        this.addLog(simText('flight.orbit-reached-lowest-point-0-km', Math.round(el.periAlt / 1000)), 'ok');
      }
    }
    if (this.mission) this.trackMission();
  }

  /** Cambia el cuerpo que manda sin que el cohete gire: conserva hacia dónde miraba en el espacio. */
  switchBody(next) {
    const [ax, ay] = this.attitude();
    this.body = next;
    if (this.mode === 'manual') this.beta = this.betaOf(ax, ay);
    if (next === 'moon') this.addLog(simText("lunarFlight.you-entered-the-moon-s-sphere-of-influence"), 'ok');
    else this.addLog(simText("lunarFlight.you-left-the-moon-s-sphere-of-influence"), 'info');
  }

  /** Diario de la misión lunar: anota cada meta cuando se cumple de verdad (según la física, no por tiempo). */
  trackMission() {
    const m = this.mission;
    if (this.body === 'earth') {
      const el = this.elements;
      if (!m.leo && this.orbitReached) { m.leo = true; m.leoT = this.t; m.parking = { periKm: el.periAlt / 1000, apoKm: el.apoAlt / 1000 }; }
      if (m.leo && !m.tli && !m.soi && (el.hyper || el.ra > 0.75 * MOON.DIST)) { m.tli = true; m.tliT = this.t; this.addLog(simText("lunarFlight.bound-for-the-moon-the-orbit-now-reaches"), 'ok'); }
      if (m.soi && !m.left) { m.left = true; m.leftT = this.t; if (m.lunarOrbit) m.tei = true; }
      m.lastA = null;
      return;
    }
    const q = this.rel();
    const el = orbitElements(q.x, q.y, q.vx, q.vy, MOON.MU, MOON.R);
    if (!m.soi) { m.soi = true; m.soiT = this.t; m.tli = true; }
    const alt = el.r - MOON.R;
    if (alt < m.minMoonAlt) m.minMoonAlt = alt;
    const closed = !el.hyper && el.periAlt >= MOON.SAFE_ALT && el.ra < MOON.SOI * 0.9;
    const a = Math.atan2(q.y, q.x);
    if (closed) {
      if (!m.lunarOrbit) { m.lunarOrbit = true; m.lunarOrbitT = this.t; this.addLog(simText("lunarFlight.lunar-orbit-reached-lowest-point-0-km-above", Math.round(el.periAlt / 1000)), 'ok'); }
      m.orbit = { periKm: el.periAlt / 1000, apoKm: el.apoAlt / 1000 };
      if (!m.bestOrbit || m.orbit.apoKm - m.orbit.periKm < m.bestOrbit.apoKm - m.bestOrbit.periKm) m.bestOrbit = { ...m.orbit };
      if (m.lastA != null) { m.revAngle += Math.abs(wrap(a - m.lastA)); m.lunarRevs = m.revAngle / (2 * Math.PI); }
    } else if (m.lunarOrbit && el.hyper && !m.tei) { m.tei = true; m.teiT = this.t; this.addLog(simText("lunarFlight.heading-home-the-spacecraft-is-escaping-the-moon"), 'ok'); }
    m.lastA = a;
  }

  processEvents() {
    for (const e of this.events) {
      if (e.done) continue;
      let fire = false;
      if (e.kind === 'gust') fire = this.t >= e.atT && this.altitude > 2000;
      else if (e.stage != null) {
        const s = this.vehicle.stages[e.stage];
        fire = this.stage === e.stage && s && this.fuel[e.stage] <= s.propKg * (1 - e.frac) && this.throttle > 0.05;
      }
      if (!fire) continue;
      e.done = true;
      e.firedAt = this.t;
      if (e.kind === 'gust') {
        this.beta = wrap(this.beta + e.deg * DEG);
        this.addLog(simText("flight.wind-gust-the-rocket-was-pushed-0-1", Math.abs(e.deg), e.deg > 0 ? simText("flight.to-the-right") : simText("flight.to-the-left")), 'warn');
      } else if (e.kind === 'engineOut') {
        this.thrustMult[this.stage] = e.thrustMult;
        this.addLog(simText("flight.an-engine-lost-power-stage-0-is-delivering", this.stage + 1, Math.round(e.thrustMult * 100)), 'bad');
      } else if (e.kind === 'fatal') {
        this.destroy('failure', e.text ?? simText("flight.rocket-failure-signal-lost"));
      }
    }
  }

  /** Estado resumido para telemetría. */
  telemetry() {
    const el = this.elements;
    const a = this.aero();
    return {
      t: this.t, altKm: this.altitude / 1000, speedKmS: this.speed / 1000,
      speedRelMs: a.v, vSpeedMs: this.radialSpeed, hSpeedMs: this.tangentSpeed,
      betaDeg: this.beta / DEG, throttle: this.throttle,
      apoKm: el.hyper ? Infinity : el.apoAlt / 1000, periKm: el.periAlt / 1000,
      q: a.q, alphaDeg: a.alpha / DEG, mass: this.mass,
      stage: this.stage, stageFuelFrac: this.stageFuelFrac, fuelLeftPct: this.fuelLeftPct,
      twr: this.thrustToWeight(),
      body: this.body, g: this.gNow, shieldLeft: this.heat.shieldLeft, heatFlux: this.heat.flux, chute: this.chuteState,
    };
  }
}

// ---------------------------------------------------------------------------
// Quemada de transferencia (GTO, Luna, escape)
// ---------------------------------------------------------------------------

/** Datos de la ventana: ángulo donde conviene estar a mitad de la quemada. */
export function transferWindow(sim) {
  const d = DEST[sim.destId];
  if (!d || d.kind !== 'transfer') return null;
  const el = sim.elements;
  const stage = sim.currentStage;
  const r = el.r;
  const v = Math.hypot(sim.vx, sim.vy);
  const dvNeed = destDeltaV(sim.destId, r, v);
  // tiempo de quemada con el empuje actual (ecuación del cohete)
  let burnS = 0;
  if (stage && sim.fuel[sim.stage] > 0) {
    const ve = stage.ispVac * PHYS.G0;
    const m0 = sim.mass;
    const thrust = stage.mdot * ve;
    const m1 = m0 * Math.exp(-dvNeed / ve);
    burnS = (m0 - m1) / (thrust / ve);
  }
  const omega = v / r;
  const arc = omega * burnS; // rad que recorre la nave quemando
  const windowAngle = d.windowDeg * DEG; // ángulo de la ventana (en el plano del juego)
  const start = windowAngle - arc / 2;
  // progreso futuro: cuántos segundos faltan para llegar al ángulo de inicio
  const dir = el.ccw ? 1 : -1;
  let toGo = (wrap((start - sim.angle) * dir) + 2 * Math.PI) % (2 * Math.PI);
  const waitS = toGo / omega;
  return { windowAngle, start, arc, burnS, dvNeed, waitS, omega, ccw: el.ccw };
}

/** Δv que necesita una nave circular a radio r (velocidad v) para el destino. */
export function destDeltaV(destId, r, v = circularSpeed(r)) {
  if (destId === 'GTO') return transferDeltaV(r, 42164000);
  if (destId === 'TLI') return transferDeltaV(r, 384400000);
  if (destId === 'ESCAPE') return Math.sqrt(2 * PHYS.MU / r + 3000 * 3000) - v; // v∞ ≈ 3 km/s
  return 0;
}

/** Error (grados) entre el punto medio de la quemada y el centro de la ventana. */
export function windowErrorDeg(sim) {
  const tr = sim.stats.transfer;
  if (!tr || tr.midAngle == null) return null;
  const d = DEST[sim.destId];
  return Math.abs(wrap(tr.midAngle - d.windowDeg * DEG)) / DEG;
}

// ---------------------------------------------------------------------------
// Piloto automático (también es la referencia de la calibración)
// ---------------------------------------------------------------------------

// Programa de inclinación de la primera parte del ascenso: el cohete empieza vertical y se va
// "acostando" con la altura (ángulo desde la vertical = 90° · ((h − h0)/(h1 − h0))^p).
// h1 = altura a la que llegaría a horizontal; p = qué tan pronto se inclina (menor = más pronto).
// h2 = altura desde la que el piloto automático corrige con guiado de lazo cerrado:
// pide una velocidad vertical que se apaga justo al llegar a la altura objetivo
// (decel = frenado vertical que se permite, en m/s²; slope = máxima inclinación de subida).
export function newAutopilot(params = {}) {
  return { h0: 1500, h1: params.h1 ?? 100000, p: params.p ?? 0.6, h2: 80000, decel: params.decel ?? 2, slope: 0.4, emptyFor: 0, transferStarted: false, phase: 'ascent', ...params };
}

/** Ángulo (rad desde la vertical) que pide el programa de inclinación a esta altura (m). */
export function pitchProgram(ap, alt) {
  const x = clamp((alt - ap.h0) / (ap.h1 - ap.h0), 0, 1);
  return (Math.PI / 2) * Math.pow(x, ap.p);
}

/** Qué haría un buen piloto ahora mismo. Devuelve controles y órdenes de separación. */
export function autopilotStep(sim, ap) {
  const out = { throttle: 1, betaTarget: null, separate: false, fairing: false, transfer: false, hint: null, done: false, mode: null };
  const tAlt = sim.targetAltKm * 1000;
  const alt = sim.altitude;
  const el = sim.elements;
  const stage = sim.currentStage;
  const { q } = sim.aero();
  ap.phase ??= 'ascent';

  // etapa vacía → separar (con una pausa corta, como la cuenta del ingeniero)
  if (sim.engineOut && sim.stage < sim.stageCount - 1) {
    ap.emptyFor = (ap.emptyFor ?? 0) + 1;
    if (ap.emptyFor > 4) { out.separate = true; ap.emptyFor = 0; }
    out.throttle = 0;
    out.hint = 'sep';
  } else ap.emptyFor = 0;

  // cofia: cuando ya casi no hay aire
  if (sim.fairing && alt > 70000 && q < 100) { out.fairing = true; out.hint = out.hint ?? 'fairing'; }

  if (ap.phase === 'ascent') {
    if (alt <= ap.h2) {
      // parte baja: vertical, luego se "acuesta" siguiendo el programa de inclinación
      out.betaTarget = pitchProgram(ap, alt);
      // "cubeta" de Max-Q: baja el acelerador si hay demasiada presión
      out.throttle = clamp(1 - (q - PHYS.Q_WARN * 0.85) / (PHYS.Q_WARN * 0.5), 0.55, 1);
    } else {
      // bucle cerrado: sube en diagonal hasta que el punto más alto (apoapsis) llega a la altura pedida
      const vr = sim.radialSpeed; const vt = sim.tangentSpeed;
      const r = sim.r;
      const gEff = PHYS.MU / (r * r) - (vt * vt) / r;
      const a = stage && !sim.engineOut ? (stage.mdot * stage.ispVac * PHYS.G0 * (sim.thrustMult[sim.stage] ?? 1)) / sim.mass : 1;
      // velocidad vertical deseada: sube frenando para llegar "plano" a la altura pedida (y baja suave si se pasó)
      const vrDes = alt <= tAlt
        ? clamp(Math.min(Math.sqrt(2 * ap.decel * (tAlt - alt)), ap.slope * Math.max(vt, 1000)), 0, 4000)
        : -Math.min(50, Math.sqrt(2 * ap.decel * (alt - tAlt)));
      const sinPhi = clamp(gEff / a + (vrDes - vr) / (a * 5), -0.3, 1);
      out.betaTarget = Math.PI / 2 - Math.asin(sinPhi);
      out.throttle = clamp(30 / Math.max(a, 1e-3), 0.25, 1); // con poca carga sobra fuerza: se baja el acelerador para apagar con precisión
      const apoReady = !el.hyper && el.apoAlt >= tAlt - (ap.apoLead ?? 12000);
      if (apoReady) {
        // ¿Cuánta velocidad faltaría en el punto más alto para redondear la órbita?
        const dvCirc = Math.max(0, circularSpeed(el.ra) - Math.sqrt(PHYS.MU * (2 / el.ra - 1 / el.a)));
        if (orbitGoalMet(el, tAlt) || (el.periAlt >= PHYS.PERI_OK && vt >= circularSpeed(r))) {
          // inserción directa terminada: ya hay órbita
          out.throttle = 0; out.hint = 'cut';
          ap.phase = 'circ'; ap.circStart = sim.t; ap.direct = true;
        } else if (dvCirc <= (ap.coastDv ?? Infinity)) {
          // falta poco: se apaga, se espera al punto más alto y se redondea con un empujón corto
          out.throttle = 0; out.hint = 'cut';
          ap.phase = 'coast';
        }
        // Si falta mucho NO se apaga: apagar y caer desde el punto más alto gasta el combustible peleando con la
        // gravedad. Se sigue empujando casi horizontal, sosteniendo la altura, hasta tener velocidad de órbita.
      }
    }
  }
  if (ap.phase === 'coast') {
    // se espera, con el cohete mirando hacia adelante, hasta estar cerca del punto más alto
    out.throttle = 0; out.mode = 'prograde'; out.hint = 'coast';
    const dv = Math.max(0, circularSpeed(el.ra) - Math.sqrt(PHYS.MU * (2 / Math.max(el.ra, 1) - 1 / el.a)));
    const aFull = stage && stage.mdot > 0 ? (stage.mdot * stage.ispVac * PHYS.G0 * (sim.thrustMult[sim.stage] ?? 1)) / sim.mass : 1;
    const burnS = dv / Math.max(0.5, Math.min(aFull, CIRC_ACCEL)); // la quemada de circularización usa como máximo CIRC_ACCEL m/s²
    const eta = timeToApoapsis(sim);
    if (eta <= burnS / 2 + 1 || sim.radialSpeed < 0) { ap.phase = 'circ'; ap.circStart = sim.t; }
  }
  if (ap.phase === 'circ') {
    // Quemada para redondear la órbita. Con `hold` (el juego) no se empuja "a ciegas" hacia adelante: el cohete apunta
    // casi horizontal y levanta la punta lo justo para NO caer mientras gana velocidad de lado. Así, aunque el ascenso
    // haya quedado empinado o se llegue tarde, el combustible se convierte en velocidad de órbita y no en estirar el otro lado.
    const vr = sim.radialSpeed; const vt = sim.tangentSpeed; const r = sim.r;
    const aNow = stage && !sim.engineOut ? (stage.mdot * stage.ispVac * PHYS.G0 * (sim.thrustMult[sim.stage] ?? 1)) / sim.mass : 1;
    const gEff = PHYS.MU / (r * r) - (vt * vt) / r;
    const vrDes = clamp((tAlt - alt) / 60, -40, 40); // se acerca despacio a la altura pedida
    const missing = circularSpeed(r) - vt; // velocidad de lado que falta
    if (ap.hold) {
      out.throttle = missing > 250 ? clamp(30 / Math.max(aNow, 1e-3), 0.25, 1) : clamp(CIRC_ACCEL / Math.max(aNow, 1e-3), 0.1, 1);
      const sinPhi = clamp(gEff / (aNow * Math.max(out.throttle, 0.1)) + (vrDes - vr) / (aNow * 8), -0.35, 0.8);
      out.mode = 'manual';
      out.betaTarget = Math.PI / 2 - Math.asin(sinPhi);
    } else {
      // forma clásica (la de la calibración): empujar exactamente hacia adelante. Es la más barata si se llega
      // justo al punto más alto y falta poco; con un ascenso imperfecto conviene `hold`.
      out.mode = 'prograde';
      out.throttle = clamp(CIRC_ACCEL / Math.max(aNow, 1e-3), 0.1, 1);
    }
    const orbiting = el.periAlt >= PHYS.PERI_OK && missing <= 0;
    if (ap.direct || orbitGoalMet(el, tAlt) || orbiting || (sim.engineOut && sim.stage >= sim.stageCount - 1) || sim.t - ap.circStart > 900) {
      out.throttle = 0; out.hint = 'cut';
      if (sim.destId in { GTO: 1, TLI: 1, ESCAPE: 1 }) { ap.phase = ap.waitWindow ? 'window' : 'transfer'; out.transfer = !ap.waitWindow; } else out.done = true;
    }
  }
  if (ap.phase === 'window') {
    // la nave espera, mirando hacia adelante, hasta que empieza la ventana de transferencia
    out.mode = 'prograde'; out.throttle = 0; out.hint = 'window';
    const w = transferWindow(sim);
    if (!w || w.waitS <= 1.5) { ap.phase = 'transfer'; out.transfer = true; out.throttle = 1; }
  }
  if (ap.phase === 'transfer') {
    out.transfer = true; out.mode = 'prograde'; out.throttle = 1;
    const spent = sim.engineOut && sim.stage >= sim.stageCount - 1;
    if (transferReached(sim.destId, sim.elements) || spent) { out.throttle = 0; out.done = true; }
    else if (sim.engineOut) out.throttle = 0; // se separa la etapa vacía y sigue la siguiente
  }
  return out;
}

/** Segundos que faltan para llegar al punto más alto de la órbita (apoapsis). */
export function timeToApoapsis(sim) {
  const el = sim.elements;
  if (el.hyper || el.e < 1e-4) return Infinity;
  const ex = Math.cos(el.periAngle); const ey = Math.sin(el.periAngle);
  const rx = sim.x / el.r; const ry = sim.y / el.r;
  const dirSign = el.ccw ? 1 : -1;
  // verdadera anomalía: ángulo desde el periapsis en el sentido del movimiento
  let nu = Math.atan2(ex * ry - ey * rx, ex * rx + ey * ry) * dirSign;
  if (nu < 0) nu += 2 * Math.PI;
  const E = 2 * Math.atan2(Math.sqrt(1 - el.e) * Math.sin(nu / 2), Math.sqrt(1 + el.e) * Math.cos(nu / 2));
  let M = E - el.e * Math.sin(E);
  if (M < 0) M += 2 * Math.PI;
  const n = Math.sqrt(PHYS.MU / (el.a * el.a * el.a));
  let dM = Math.PI - M;
  if (dM < 0) dM += 2 * Math.PI;
  return dM / n;
}

/** Ejecuta las órdenes del piloto automático en la simulación. Devuelve controles para advance(). */
export function applyAutopilot(sim, ap) {
  const o = autopilotStep(sim, ap);
  if (o.separate) sim.separateStage();
  if (o.fairing) sim.dropFairing();
  if (o.mode && sim.mode !== o.mode) sim.setMode(o.mode);
  if (o.transfer && !ap.transferStarted) { startTransferBurn(sim); ap.transferStarted = true; }
  return { betaTarget: o.betaTarget, throttle: o.throttle, done: o.done, hint: o.hint };
}

export function startTransferBurn(sim) {
  const tw = transferWindow(sim);
  sim.setMode('prograde');
  sim.stats.transfer = { startT: sim.t, startAngle: sim.angle, arc: tw?.arc ?? 0, midAngle: null, dv: 0, active: true };
  sim.addLog(simText("flight.transfer-burn-started-the-rocket-follows-its-current"), 'ok');
}

/** Actualiza datos de la quemada de transferencia (punto medio y fin). */
export function trackTransfer(sim) {
  const tr = sim.stats.transfer;
  if (!tr || !tr.active) return;
  const el = sim.elements;
  if (tr.startSpeed == null) tr.startSpeed = sim.speed;
  tr.dv = sim.speed - tr.startSpeed;
  if (tr.midAngle == null) {
    // punto medio estimado: ángulo de inicio + mitad del arco previsto
    const dir = el.ccw ? 1 : -1;
    tr.midAngle = wrap(tr.startAngle + dir * tr.arc / 2);
  }
  if (transferReached(sim.destId, el) || sim.engineOut || sim.throttle < 0.001) {
    if (transferReached(sim.destId, el) || sim.engineOut) { tr.active = false; tr.endT = sim.t; }
  }
}

/**
 * Corre una misión completa con el piloto automático (para calibrar, probar y puntuar).
 * Devuelve el simulador terminado.
 */
export function runAutopilot(vehicle, opts, apParams = {}, maxT = null) {
  const sim = new FlightSim(vehicle, opts);
  const ap = newAutopilot(apParams);
  sim.ignite();
  let doneFor = 0;
  const limit = maxT ?? (apParams.waitWindow ? 14000 : 3000);
  while (sim.status === 'flying' && sim.t < limit) {
    // mientras solo se espera (órbita sin motor) se avanza con pasos largos
    const waiting = sim.throttle < 0.01 && sim.altitude > PHYS.ATM_TOP && (ap.phase === 'coast' || ap.phase === 'window');
    const dt = waiting ? 2 : 0.25;
    const c = applyAutopilot(sim, ap);
    sim.advance(dt, { throttle: c.throttle, betaTarget: sim.mode === 'prograde' ? null : c.betaTarget });
    trackTransfer(sim);
    if (c.done) doneFor += dt;
    if (doneFor > 1) { sim.finish('finished'); break; }
    // sin combustible y sin órbita: se acabó
    if (sim.engineOut && sim.stage >= sim.stageCount - 1 && !sim.orbitReached && sim.radialSpeed < 0 && sim.altitude < 120000) break;
    if (sim.engineOut && sim.stage >= sim.stageCount - 1) { doneFor += dt; }
  }
  if (sim.status === 'flying') sim.finish('finished');
  return sim;
}

// ---------------------------------------------------------------------------
// Puntaje de pilotaje (0–100)
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = { orbit: 50, fuel: 25, maxq: 15, staging: 10 };

/**
 * @param {FlightSim} sim  vuelo terminado
 * @param {object} ref     { fuelLeftPct } resultado del piloto automático con la misma carga
 */
export function pilotScore(sim, ref = { fuelLeftPct: 10 }) {
  if (sim.profile === 'lunarReturn') return lunarScore(sim);
  const el = sim.elements;
  const d = DEST[sim.destId];
  const W = SCORE_WEIGHTS;
  const tAlt = sim.targetAltKm * 1000;
  let orbit = 0;
  let orbitNote;
  if (d.kind === 'transfer') {
    const reached = transferReached(sim.destId, el);
    const win = windowErrorDeg(sim);
    const winOk = win != null && win <= d.windowTolDeg;
    if (reached && winOk) { orbit = W.orbit; orbitNote = simText("flight.you-timed-the-transfer-correctly-and-delivered-the"); }
    else if (reached) { orbit = W.orbit * 0.55; orbitNote = simText("flight.you-had-enough-thrust-but-ignited-outside-the"); }
    else if (el.periAlt >= PHYS.PERI_OK) {
      const frac = el.hyper ? 1 : clamp(el.apoAlt / (d.okApoKm * 1000), 0, 1);
      orbit = W.orbit * 0.45 * frac; orbitNote = simText("flight.you-reached-parking-orbit-but-did-not-complete");
    } else { orbit = 0; orbitNote = simText("flight.you-did-not-reach-a-stable-orbit"); }
  } else if (el.periAlt >= PHYS.PERI_OK) {
    const err = (Math.abs(el.periAlt - tAlt) + Math.abs((el.hyper ? 1e7 : el.apoAlt) - tAlt)) / 2;
    orbit = W.orbit * clamp(1 - err / 250000, 0.2, 1);
    orbitNote = err < 25000 ? simText("flight.your-orbit-was-almost-perfect") : err < 100000 ? simText("flight.your-orbit-was-close-to-the-target-altitude") : simText("flight.your-orbit-was-far-from-the-target-altitude");
  } else {
    orbit = 0; orbitNote = simText("flight.you-did-not-reach-a-stable-orbit");
  }
  // Con la mitad del combustible que deja el piloto automático ya se lleva el puntaje completo.
  const fuel = W.fuel * clamp(ref.fuelLeftPct > 1 ? sim.fuelLeftPct / (ref.fuelLeftPct * 0.5) : sim.fuelLeftPct > 0 ? 1 : 0.6, 0, 1) * (orbit > 0 ? 1 : 0);
  const over = sim.stats.maxQ > PHYS.Q_LIMIT ? clamp((sim.stats.maxQ - PHYS.Q_LIMIT) / (PHYS.Q_LIMIT * 0.5), 0, 1) : 0;
  const maxq = W.maxq * (1 - over);
  const wastedFrac = sim.initialPropKg > 0 ? sim.stats.wastedProp / sim.initialPropKg : 0;
  const badFairing = sim.stats.fairingQ != null && sim.stats.fairingQ > 800 ? 0.4 : 0;
  const staging = W.staging * clamp(1 - wastedFrac * 6 - badFairing - Math.min(0.3, sim.stats.aoaSeconds / 60), 0, 1);
  const total = Math.round(orbit + fuel + maxq + staging);
  return {
    total: clamp(total, 0, 100),
    parts: [
      { id: 'orbit', label: simText("flight.how-closely-you-matched-the-target"), points: Math.round(orbit), max: W.orbit, note: orbitNote },
      { id: 'fuel', label: simText("flight.fuel-remaining-2"), points: Math.round(fuel), max: W.fuel, note: simText("flight.you-had-0-fuel-remaining-autopilot-leaves-about", Math.round(sim.fuelLeftPct), Math.round(ref.fuelLeftPct)) },
      { id: 'maxq', label: simText("flight.staying-below-maximum-dynamic-pressure-max-q"), points: Math.round(maxq), max: W.maxq, note: sim.stats.maxQ > PHYS.Q_LIMIT ? simText("flight.you-exceeded-the-pressure-limit-reduce-thrust-next") : simText("flight.you-stayed-within-the-pressure-limit") },
      { id: 'staging', label: simText("flight.clean-stage-and-fairing-separation"), points: Math.round(staging), max: W.staging, note: wastedFrac > 0.02 ? simText("flight.you-released-a-stage-that-still-had-fuel") : simText("flight.you-separated-stages-at-the-right-time") },
    ],
  };
}

export const LUNAR_SCORE = { leo: 15, moon: 15, lunarOrbit: 25, back: 15, landing: 30 };
const DESTROYED = ['failure', 'maxq', 'aoa', 'crash', 'crash-moon', 'burn', 'gforce'];
/** ¿El vuelo terminó con la nave destruida? */
export const wasDestroyed = (sim) => DESTROYED.includes(sim.endReason);

/** Puntaje (0–100) de la misión lunar de ida y vuelta: cada parte premia una meta cumplida y qué tan bien quedó. */
export function lunarScore(sim) {
  const m = sim.mission; const W = LUNAR_SCORE; const st = sim.stats;
  const km = (v) => localizedNumber(v);
  const parts = [];
  parts.push({ id: 'leo', label: simText("lunarFlight.earth-parking-orbit"), points: m.leo ? W.leo : 0, max: W.leo,
    note: m.leo ? simText("lunarFlight.you-reached-a-0-1-km-orbit", km(m.parking.periKm), km(m.parking.apoKm)) : simText("lunarFlight.you-did-not-reach-a-stable-orbit-around") });
  parts.push({ id: 'moon', label: simText("lunarFlight.translunar-injection"), points: m.soi ? W.moon : m.tli ? Math.round(W.moon * 0.5) : 0, max: W.moon,
    note: m.soi ? simText("lunarFlight.you-fired-inside-the-window-and-the-trajectory") : m.tli ? simText("lunarFlight.your-orbit-reached-lunar-distance-but-the-moon") : simText("lunarFlight.you-did-not-perform-the-translunar-injection") });
  let orbitPts = 0; let orbitNote = simText("lunarFlight.you-did-not-reach-the-moon");
  if (m.bestOrbit) {
    const diff = m.bestOrbit.apoKm - m.bestOrbit.periKm; const mean = (m.bestOrbit.apoKm + m.bestOrbit.periKm) / 2;
    const q = 0.5 * clamp(1 - Math.max(0, diff - 60) / 2000, 0, 1) + 0.5 * clamp(1 - Math.max(0, Math.abs(mean - 110) - 30) / 1500, 0, 1);
    orbitPts = W.lunarOrbit * (0.6 + 0.4 * q);
    orbitNote = simText("lunarFlight.you-reached-a-0-1-km-lunar-orbit", km(m.bestOrbit.periKm), km(m.bestOrbit.apoKm), diff <= 60 ? simText("lunarFlight.nearly-circular") : simText("lunarFlight.an-orbit-closer-to-circular-and-to-110"));
  } else if (m.soi) {
    orbitPts = W.lunarOrbit * 0.3;
    orbitNote = m.moonCrash ? simText("lunarFlight.the-spacecraft-reached-the-moon-but-collided-with") : simText("lunarFlight.you-passed-within-0-km-of-the-moon", km(m.minMoonAlt / 1000));
  }
  parts.push({ id: 'lunarOrbit', label: simText("lunarFlight.orbit-around-the-moon"), points: Math.round(orbitPts), max: W.lunarOrbit, note: orbitNote });
  const landed = Boolean(sim.landing);
  const back = m.left && (m.entry || landed) ? W.back : m.left ? W.back * 0.5 : m.tei ? W.back * 0.3 : 0;
  parts.push({ id: 'back', label: simText("lunarFlight.trans-earth-injection"), points: Math.round(back), max: W.back,
    note: m.left && (m.entry || landed) ? simText("lunarFlight.you-left-the-moon-on-a-trajectory-that") : m.left ? simText("lunarFlight.you-left-the-moon-but-your-trajectory-missed") : m.tei ? simText("lunarFlight.you-escaped-lunar-orbit-but-the-flight-ended") : simText("lunarFlight.you-did-not-perform-the-return-burn") });
  let land = 0; let landNote = simText("lunarFlight.the-capsule-did-not-reach-the-surface");
  if (landed) {
    const gLim = sim.craft?.gLimit ?? 9;
    const gPart = clamp(1 - (st.maxG - gLim) / 6, 0, 1);
    const shieldPart = clamp(sim.heat.shieldLeft / 0.3, 0, 1);
    land = W.landing * (0.6 + 0.2 * gPart + 0.2 * shieldPart);
    landNote = simText("lunarFlight.splashdown-at-0-m-s-reentry-peaked-at", localizedNumber(sim.landing.speed, 1, 1), localizedNumber(st.maxG, 1, 1), st.maxG > gLim ? simText("lunarFlight.too-high-for-the-crew-try-a-shallower") : '', Math.round((1 - sim.heat.shieldLeft) * 100));
  } else if (sim.endReason === 'burn') landNote = simText("lunarFlight.the-spacecraft-burned-up-during-reentry");
  else if (sim.endReason === 'gforce') landNote = simText("lunarFlight.the-capsule-entered-too-steeply-and-could-not");
  else if (sim.endReason === 'crash' && m.entry) landNote = simText("lunarFlight.the-capsule-survived-reentry-but-reached-the-surface");
  parts.push({ id: 'landing', label: simText("lunarFlight.reentry-parachutes-and-splashdown"), points: Math.round(land), max: W.landing, note: landNote });
  const total = parts.reduce((a, p2) => a + p2.points, 0);
  return {
    total: clamp(total, 0, 100), parts,
    how: simText("lunarFlight.up-to-100-points-0-for-earth-orbit", W.leo, W.moon, W.lunarOrbit, W.back, W.landing),
  };
}

// ---------------------------------------------------------------------------
// Calibración contra el catálogo
// ---------------------------------------------------------------------------

/** Opciones de simulación para el vuelo de calibración de un destino. */
export function simOptionsForCalibration(destId, payloadKg, flightData, targetAltKm = null) {
  const c = flightData.calibration[destId];
  return { payloadKg, destId, targetAltKm: targetAltKm ?? c.parkingAltKm, latDeg: c.latDeg ?? flightData.calibration.latDeg, incDeg: c.incDeg ?? flightData.calibration.incDeg, events: [] };
}

/** ¿Se logró el destino de calibración? (órbita circular a la altura pedida, o transferencia) */
export function reachedCalibrationGoal(sim) {
  const el = sim.elements;
  if (DEST[sim.destId].kind === 'transfer') return transferReached(sim.destId, el);
  // Misma regla que en el juego: la órbita cuenta cuando el punto más bajo queda sobre la atmósfera (150 km).
  // La capacidad del catálogo es el peso máximo con el que se logra eso; mientras más cerca de ese límite,
  // menos combustible sobra para redondear la órbita a la altura pedida.
  return el.periAlt >= PHYS.PERI_OK;
}

/** Prueba los programas de ascenso candidatos; devuelve el primero que llega (o null). */
export function autopilotSucceeds(design, stackKg, calPayloadKg, payloadKg, destId, flightData, programs) {
  const vehicle = buildVehicle(design, stackKg, calPayloadKg);
  const opts = simOptionsForCalibration(destId, payloadKg, flightData);
  for (const program of programs) {
    const sim = runAutopilot(vehicle, opts, program);
    if (reachedCalibrationGoal(sim)) return { ok: true, program, sim };
  }
  return { ok: false, program: programs[0], sim: null };
}

/**
 * Busca la masa de etapas más chica con la que el piloto automático lleva `capacityKg`
 * al destino (bisección en escala logarítmica). Devuelve { stackKg, program }.
 */
export function calibrate(design, destId, capacityKg, flightData) {
  const programs = flightData.calibration.programCandidates;
  // Se busca un tamaño que funcione (sube de a poco: un cohete gigante con carga chica se rompe por Max-Q).
  let lo = capacityKg * 0.3; let hi = capacityKg * 6; let found = false;
  for (let k = 0; k < 24 && !found; k++) {
    if (autopilotSucceeds(design, hi, capacityKg, capacityKg, destId, flightData, programs).ok) found = true;
    else { lo = hi; hi *= 1.45; }
  }
  if (!found) return null;
  let best = programs;
  for (let i = 0; i < 30; i++) {
    const mid = Math.sqrt(lo * hi);
    const r = autopilotSucceeds(design, mid, capacityKg, capacityKg, destId, flightData, best);
    if (r.ok) { hi = mid; best = [r.program, ...programs.filter((p) => p !== r.program)]; } else lo = mid;
    if (hi / lo < 1.002) break;
  }
  const final = autopilotSucceeds(design, hi, capacityKg, capacityKg, destId, flightData, best);
  return { stackKg: Math.round(hi), program: final.program, capacityKg };
}

export const FUEL_RANGE = { minPct: 75, maxPct: 100 }; // cuánto combustible se permite cargar (% del tanque lleno)

/**
 * Resumen de la carga de combustible elegida: cuánto combustible lleva, cuánto pesa el cohete completo al despegar
 * y con cuánta fuerza despega (empuje / peso; tiene que ser mayor que 1).
 */
export function fuelSummary(vehicle, payloadKg, fuelFraction = 1) {
  const f = clamp(fuelFraction, FUEL_RANGE.minPct / 100, 1);
  const fullKg = vehicle.stages.reduce((a, st) => a + st.propKg, 0);
  const propKg = fullKg * f;
  const liftoffKg = vehicleMassKg(vehicle, payloadKg) - (fullKg - propKg);
  const s0 = vehicle.stages[0];
  const twr = (s0.mdot * s0.ispSl) / liftoffKg;
  return { fuelFraction: f, fullKg, propKg, liftoffKg, twr };
}

/** El mismo diseño con motores k veces más (o menos) eficientes. El empuje no cambia: sólo cuánto dura el combustible. */
export function scaleDesignIsp(design, k = 1) {
  if (k === 1) return design;
  return { ...design, stages: design.stages.map((st) => ({ ...st, ispSl: st.ispSl * k, ispVac: st.ispVac * k })) };
}

/**
 * Calibración con la MASA REAL del cohete. La masa de las etapas queda fija (peso publicado al despegue menos la
 * carga y la cofia) y se busca la eficiencia de los motores (ispK) más baja con la que el piloto automático lleva
 * justo la capacidad del catálogo. Así el cohete pesa lo que pesa de verdad y sube lo que dice el catálogo.
 */
export function calibrateIsp(design, destId, capacityKg, liftoffKg, flightData, firstProgram = null) {
  const programs = flightData.calibration.programCandidates;
  const stackKg = Math.round(liftoffKg - capacityKg - design.fairingPct * capacityKg);
  const tryK = (k, list) => autopilotSucceeds(scaleDesignIsp(design, k), stackKg, capacityKg, capacityKg, destId, flightData, list);
  let best = firstProgram ? [firstProgram, ...programs] : programs;
  let lo = 0.4; let hi = 0.4; let found = null;
  for (let k = 0.5; k <= 2.4 && !found; k *= 1.12) { const r = tryK(k, best); if (r.ok) { found = r; hi = k; } else lo = k; }
  if (!found) return null;
  best = [found.program, ...programs.filter((p) => p !== found.program)];
  for (let i = 0; i < 22 && hi / lo > 1.0015; i++) {
    const mid = Math.sqrt(lo * hi);
    const r = tryK(mid, best);
    if (r.ok) { hi = mid; best = [r.program, ...programs.filter((p) => p !== r.program)]; } else lo = mid;
  }
  const final = tryK(hi, best);
  return { stackKg, liftoffKg, ispK: Math.round(hi * 10000) / 10000, program: final.program, capacityKg };
}

/** Diseño que se usa para un destino: los cohetes chicos agregan una etapa de transferencia en destinos lejanos. */
export function designForDest(design, destId) {
  const transfer = DEST[destId]?.kind === 'transfer';
  return transfer && design.transferStages ? { ...design, stages: design.transferStages, variant: 'transfer' } : design;
}

// ---------------------------------------------------------------------------
// Cohete listo para volar (usa la calibración guardada)
// ---------------------------------------------------------------------------

/**
 * Arma el cohete de un lanzador para un destino. Devuelve null si ese par no está calibrado
 * (en ese caso el juego resuelve el vuelo automáticamente con las reglas del catálogo).
 * @param {object} data  { launchers, flight, calibration }
 */
export function vehicleFor(launcherId, destId, data) {
  const entry = data.calibration?.vehicles?.[launcherId]?.[destId];
  if (!entry) return null;
  const designId = data.flight.vehicles[launcherId]?.vehicleOf ?? launcherId;
  const base = data.flight.vehicles[designId];
  if (!base) return null;
  const design = scaleDesignIsp(designForDest({ id: designId, ...base }, destId), entry.ispK ?? 1);
  const vehicle = buildVehicle(design, entry.stackKg, entry.capacityKg);
  vehicle.designId = designId;
  vehicle.liftoffKg = entry.liftoffKg ?? null; // masa real publicada del cohete completo al despegar
  return { vehicle, entry, program: entry.program, capacityKg: entry.capacityKg };
}

/**
 * Margen de pilotaje: una persona gasta más combustible que el piloto automático con el que se calibró el cohete.
 * A las etapas superiores se les da motores más eficientes (Isp × k) con el MISMO empuje (gasto ÷ k): el cohete pesa y
 * empuja igual, pero ese combustible dura k veces más. k sale de data/flight.json → calibration.pilotMargin[dificultad].
 */
export function withPilotMargin(vehicle, k = 1) {
  if (!(k > 1)) return vehicle;
  // La primera etapa queda igual (el paso por el aire y el Max-Q no cambian); el margen va en las etapas de arriba.
  const from = vehicle.stages.length > 1 ? 1 : 0;
  return { ...vehicle, pilotMargin: k, stages: vehicle.stages.map((s, i) => (i < from ? s : { ...s, ispVac: s.ispVac * k, ispSl: s.ispSl * k, mdot: s.mdot / k })) };
}

/** Opciones de FlightSim para una misión real (sitio, inclinación y órbita pedidas). */
export function simOptionsForMission({ payloadKg, destId, targetAltKm, latDeg, incDeg, events }) {
  return { payloadKg, destId, targetAltKm, latDeg, incDeg: incDeg ?? latDeg, events: events ?? [] };
}

/**
 * Velocidad inicial por el giro de la Tierra para una misión. La capacidad del catálogo ya incluye la
 * geometría típica de cada destino (por ejemplo, las órbitas polares salen "contra" el giro), así que
 * se parte de la geometría de referencia de la calibración y solo se deja pasar una parte pequeña
 * de la diferencia con el sitio real (SITE_WEIGHT): Kourou ayuda un poco más que Vandenberg, sin romper el catálogo.
 */
export const SITE_WEIGHT = 0.25;
export function missionRotationBonus(destId, latDeg, incDeg, flightData) {
  const c = flightData.calibration[destId] ?? {};
  const ref = earthRotationBonus(c.latDeg ?? flightData.calibration.latDeg, c.incDeg ?? flightData.calibration.incDeg);
  const actual = earthRotationBonus(latDeg, incDeg);
  return ref + SITE_WEIGHT * (actual - ref);
}

/** Vuelo de referencia del piloto automático con la carga real (para puntuar y para las pistas). */
export function referenceRun(vehicleInfo, missionOpts, candidates = null) {
  const best = candidates ? bestProgram(vehicleInfo, missionOpts, candidates) : null;
  const sim = best ? best.sim : runAutopilot(vehicleInfo.vehicle, { ...missionOpts, events: [] }, vehicleInfo.program);
  return { fuelLeftPct: sim.fuelLeftPct, reachedOrbit: sim.elements.periAlt >= PHYS.PERI_OK, sim, program: best?.program ?? vehicleInfo.program };
}

// ---------------------------------------------------------------------------
// Pistas para el modo fácil (y la guía visual del modo normal)
// ---------------------------------------------------------------------------

/**
 * Qué conviene hacer ahora. No toca la simulación.
 * @returns {{ steerDeg:number|null, recommendBetaDeg:number|null, action:string|null, key:string|null, throttleMax:number }}
 */
export function pilotHint(sim, ap) {
  const copy = { ...ap };
  const o = autopilotStep(sim, copy);
  const out = { steerDeg: null, recommendBetaDeg: null, action: null, key: null, throttleMax: 1 };
  if (sim.mode === 'manual' && o.betaTarget != null && !sim.engineOut) {
    out.recommendBetaDeg = o.betaTarget / DEG;
    out.steerDeg = wrap(o.betaTarget - sim.beta) / DEG;
  }
  out.throttleMax = o.throttle > 0 ? o.throttle : 1;
  if (sim.engineOut && sim.stage < sim.stageCount - 1) { out.action = 'separate'; out.key = 'sep'; }
  else if (sim.fairing && sim.altitude > 70000 && sim.aero().q < 100) { out.action = 'fairing'; out.key = 'fairing'; }
  else if (o.hint === 'cut' || o.done) { out.action = 'cut'; out.key = 'cut'; }
  return out;
}

/**
 * Elige, entre los programas de ascenso conocidos, el que deja la órbita más cerca de la pedida
 * con esta carga. Sirve para el piloto automático del modo fácil, las pistas y la referencia del puntaje.
 */
export function programGrid(spec) {
  const out = [];
  for (const h1 of spec.h1) for (const p of spec.p) for (const decel of spec.decel) for (const slope of spec.slope) for (const apoLead of spec.apoLead ?? [12000]) out.push(apoLead === 12000 ? { h1, p, decel, slope } : { h1, p, decel, slope, apoLead });
  return out;
}

/** Qué tan buena fue una corrida del piloto automático para esta misión (más alto = mejor). */
export function programScore(sim, missionOpts) {
  const el = sim.elements;
  const tAlt = missionOpts.targetAltKm * 1000;
  if (DEST[missionOpts.destId].kind === 'transfer') {
    return transferReached(missionOpts.destId, el) ? 1 : el.periAlt >= PHYS.PERI_OK ? 0.4 : 0;
  }
  if (el.periAlt < PHYS.PERI_OK) return -1e9;
  return -(Math.abs(el.periAlt - tAlt) + Math.abs(Math.min(el.hyper ? 1e8 : el.apoAlt, 1e8) - tAlt)) / 2;
}

export function bestProgram(vehicleInfo, missionOpts, candidates) {
  let best = null;
  const list = [vehicleInfo.program, ...candidates.filter((c) => c !== vehicleInfo.program)];
  for (const program of list) {
    const sim = runAutopilot(vehicleInfo.vehicle, { ...missionOpts, events: [] }, program);
    const score = programScore(sim, missionOpts);
    if (!best || score > best.score) best = { program, score, sim };
  }
  return best;
}
