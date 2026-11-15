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

export const PHYS = {
  MU: 3.986004418e14, // m³/s²  (parámetro gravitacional de la Tierra)
  RE: 6371000, // m
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
};

export const DEG = Math.PI / 180;
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

export function orbitElements(x, y, vx, vy) {
  const mu = PHYS.MU;
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
    periAlt: rp - PHYS.RE,
    apoAlt: ra - PHYS.RE,
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
  GTO: { kind: 'transfer', apoKm: 35786, okApoKm: 30000, windowTolDeg: 70, windowDeg: 200, label: 'la órbita alargada que llega a 36.000 km' },
  TLI: { kind: 'transfer', apoKm: 384400, okApoKm: 370000, windowTolDeg: 35, windowDeg: 120, label: 'el camino hacia la Luna' },
  ESCAPE: { kind: 'transfer', apoKm: Infinity, okApoKm: Infinity, windowTolDeg: 35, windowDeg: 300, label: 'la salida de la Tierra' },
};

/** ¿La órbita ya es (casi) circular a la altura pedida? El punto más bajo llegó a la altura objetivo. */
export function orbitGoalMet(el, tAltM) {
  return !el.hyper && el.periAlt >= Math.max(PHYS.PERI_OK, tAltM - 6000);
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
    this.fuel = vehicle.stages.map((s) => s.propKg);
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
  }

  get mass() {
    let m = this.payloadKg + (this.fairing ? this.vehicle.fairingKg : 0);
    for (let i = this.stage; i < this.vehicle.stages.length; i++) m += this.vehicle.stages[i].dryKg + this.fuel[i];
    return m;
  }

  get r() { return Math.hypot(this.x, this.y); }
  get altitude() { return this.r - PHYS.RE; }
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

  /** Dirección del eje del cohete (vector unitario). */
  attitude(x = this.x, y = this.y, vx = this.vx, vy = this.vy) {
    if (this.mode === 'prograde') {
      const v = Math.hypot(vx, vy) || 1;
      return [vx / v, vy / v];
    }
    const r = Math.hypot(x, y);
    const ux = x / r; const uy = y / r; // vertical local
    const ex = uy; const ey = -ux; // este
    return [Math.cos(this.beta) * ux + Math.sin(this.beta) * ex, Math.cos(this.beta) * uy + Math.sin(this.beta) * ey];
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
    this.addLog('Despegue: ¡motores encendidos!', 'ok');
  }

  addLog(text, kind = 'info') {
    this.log.push({ t: this.t, text, kind });
    this.notice = { t: this.t, text, kind };
  }

  setMode(mode) { this.mode = mode; }

  /** Separa la etapa actual (el jugador pulsa "Separar etapa"). */
  separateStage() {
    if (this.status !== 'flying' || this.stage >= this.stageCount) return false;
    const s = this.vehicle.stages[this.stage];
    const frac = this.fuel[this.stage] / s.propKg;
    this.stats.wastedProp += this.fuel[this.stage];
    this.stats.stagingTimes.push({ stage: this.stage + 1, t: Math.round(this.t), fuelLeftPct: Math.round(frac * 100), altitudeKm: Math.round(this.altitude / 1000) });
    this.addLog(`Etapa ${this.stage + 1} separada${frac > 0.04 ? ` (¡todavía le quedaba ${Math.round(frac * 100)} % de combustible!)` : ''}.`, frac > 0.04 ? 'warn' : 'ok');
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
    if (this.stage >= this.stageCount) { this.throttle = 0; }
    return true;
  }

  /** Cociente empuje/peso ahora mismo (con el acelerador actual y el Isp de esta altura). */
  thrustToWeight(throttle = this.throttle) {
    const stage = this.currentStage;
    if (!stage || this.engineOut) return 0;
    const pr = pressureRatio(this.altitude);
    const isp = stage.ispVac + (stage.ispSl - stage.ispVac) * pr;
    const thrust = throttle * stage.mdot * (this.thrustMult[this.stage] ?? 1) * isp * PHYS.G0;
    return thrust / (this.mass * (PHYS.MU / (this.r * this.r)));
  }

  dropFairing() {
    if (this.status !== 'flying' || !this.fairing) return false;
    const { q } = this.aero();
    this.stats.fairingTime = this.t;
    this.stats.fairingQ = q;
    this.stats.fairingAlt = this.altitude;
    this.fairing = false;
    this.lastSeparation = { kind: 'fairing', massKg: this.vehicle.fairingKg, x: this.x, y: this.y, vx: this.vx, vy: this.vy, axis: this.attitude(), t: this.t };
    if (q > 800) this.addLog('Cofia soltada con aire todavía denso: daña la nave.', 'warn');
    else this.addLog('Cofia soltada: la nave ya ve el espacio.', 'ok');
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
      const maxH = burning || inAir || this.status === 'pad' ? 0.1 : 2;
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
      const pr = pressureRatio(this.altitude);
      const isp = stage.ispVac + (stage.ispSl - stage.ispVac) * pr;
      mdot = this.throttle * stage.mdot * (this.thrustMult[this.stage] ?? 1);
      const burned = Math.min(mdot * dt, this.fuel[this.stage]);
      mdot = burned / dt;
      thrust = mdot * isp * PHYS.G0;
      this.fuel[this.stage] -= burned;
      this.stats.burnSeconds += dt;
      if (this.fuel[this.stage] <= 1e-6) {
        this.fuel[this.stage] = 0;
        if (this.stage === this.stageCount - 1 || true) this.addLog(`Etapa ${this.stage + 1} sin combustible.`, 'info');
      }
    }
    const massMid = mass0 - 0.5 * mdot * dt;

    // --- integración RK4 con empuje y masa constantes durante el paso
    const accel = (x, y, vx, vy) => {
      const r = Math.hypot(x, y);
      const g = PHYS.MU / (r * r * r);
      let ax = -g * x; let ay = -g * y;
      if (thrust > 0) {
        const [dx, dy] = this.attitude(x, y, vx, vy);
        ax += (thrust / massMid) * dx; ay += (thrust / massMid) * dy;
      }
      const h = r - PHYS.RE;
      if (h < PHYS.ATM_TOP) {
        const rho = airDensity(h);
        const [rx, ry] = this.relVelocity(x, y, vx, vy);
        const v = Math.hypot(rx, ry);
        if (v > 0.5 && rho > 0) {
          const [dx, dy] = this.attitude(x, y, vx, vy);
          const sinA = Math.sqrt(Math.max(0, 1 - clamp((dx * rx + dy * ry) / v, -1, 1) ** 2));
          const k = 0.5 * rho * v * this.vehicle.cdA * (1 + 6 * sinA * sinA) / massMid;
          ax -= k * rx; ay -= k * ry;
        }
      }
      return [ax, ay];
    };
    const { x, y, vx, vy } = this;
    const [k1x, k1y] = accel(x, y, vx, vy);
    const [k2x, k2y] = accel(x + 0.5 * dt * vx, y + 0.5 * dt * vy, vx + 0.5 * dt * k1x, vy + 0.5 * dt * k1y);
    const [k3x, k3y] = accel(x + 0.5 * dt * (vx + 0.5 * dt * k1x), y + 0.5 * dt * (vy + 0.5 * dt * k1y), vx + 0.5 * dt * k2x, vy + 0.5 * dt * k2y);
    const [k4x, k4y] = accel(x + dt * (vx + 0.5 * dt * k2x), y + dt * (vy + 0.5 * dt * k2y), vx + dt * k3x, vy + dt * k3y);
    this.x += dt * (vx + (dt / 6) * (k1x + k2x + k3x));
    this.y += dt * (vy + (dt / 6) * (k1y + k2y + k3y));
    this.vx += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    this.vy += (dt / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    this.t += dt;

    // --- suelo
    if (this.r < PHYS.RE) {
      const ux = this.x / this.r; const uy = this.y / this.r;
      const vr = this.vx * ux + this.vy * uy;
      if (!this.grounded && (vr < -15 || this.altitude < -50)) {
        this.destroy('crash', 'El cohete volvió a caer contra la Tierra.');
        return;
      }
      // en la plataforma: se queda quieto hasta que el empuje supere al peso
      this.x = ux * PHYS.RE; this.y = uy * PHYS.RE;
      if (vr < 0) { this.vx -= vr * ux; this.vy -= vr * uy; }
      if (this.grounded) { this.vx = this.v0 * uy; this.vy = -this.v0 * ux; }
    }
    if (this.grounded && this.altitude > 0.5) this.grounded = false; // ya se despegó de la plataforma

    // --- aerodinámica y estadísticas
    const aero = this.aero();
    this.lastQ = aero.q;
    if (aero.q > this.stats.maxQ) { this.stats.maxQ = aero.q; this.stats.maxQTime = this.t; }
    const qa = aero.q * Math.sin(aero.alpha);
    if (qa > this.stats.maxQalpha) this.stats.maxQalpha = qa;
    if (aero.q > PHYS.Q_LIMIT) this.stats.overQSeconds += dt;
    if (aero.q > 3000 && aero.alpha > 12 * DEG) this.stats.aoaSeconds += dt;
    this.stats.maxAlt = Math.max(this.stats.maxAlt, this.altitude);
    if (aero.q > PHYS.Q_LIMIT * PHYS.Q_BREAK_FACTOR) {
      this.destroy('maxq', 'El aire apretó demasiado fuerte al cohete y se rompió (Max-Q).');
      return;
    }
    if (qa > PHYS.QALPHA_BREAK) {
      this.destroy('aoa', 'El cohete giró de lado con mucho aire y se partió. ¡Inclina de a poquito!');
      return;
    }

    // --- ¿ya hay órbita?
    const el = this.elements;
    const wasReached = this.orbitReached;
    this.orbitReached = el.periAlt >= PHYS.PERI_OK && this.altitude > PHYS.ATM_TOP * 0.8;
    if (this.orbitReached && !wasReached) {
      this.stats.orbitTime = this.t;
      this.addLog(`¡Órbita! Punto más bajo ${Math.round(el.periAlt / 1000)} km.`, 'ok');
    }
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
        this.addLog(`¡Ráfaga de viento! Te empujó ${Math.abs(e.deg)}° ${e.deg > 0 ? 'a la derecha' : 'a la izquierda'}.`, 'warn');
      } else if (e.kind === 'engineOut') {
        this.thrustMult[this.stage] = e.thrustMult;
        this.addLog(`Un motor perdió fuerza: la etapa ${this.stage + 1} empuja ${Math.round(e.thrustMult * 100)} %. Gasta combustible con cuidado.`, 'bad');
      } else if (e.kind === 'fatal') {
        this.destroy('failure', e.text ?? 'Falla del cohete: se perdió la señal.');
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
      const vrDes = clamp(Math.min(Math.sqrt(2 * ap.decel * Math.max(0, tAlt - alt)), ap.slope * Math.max(vt, 1000)), -50, 4000);
      const sinPhi = clamp(gEff / a + (vrDes - vr) / (a * 5), -0.3, 1);
      out.betaTarget = Math.PI / 2 - Math.asin(sinPhi);
      out.throttle = clamp(30 / Math.max(a, 1e-3), 0.25, 1); // con poca carga sobra fuerza: se baja el acelerador para apagar con precisión
      const apoReady = !el.hyper && el.apoAlt >= tAlt - (ap.apoLead ?? 12000);
      if (apoReady) {
        out.throttle = 0; out.hint = 'cut';
        ap.phase = 'coast';
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
    // quemada de circularización: empuja hacia adelante hasta que el punto más bajo alcanza la altura pedida
    out.mode = 'prograde';
    const aNow = stage && !sim.engineOut ? (stage.mdot * stage.ispVac * PHYS.G0 * (sim.thrustMult[sim.stage] ?? 1)) / sim.mass : 1;
    out.throttle = clamp(CIRC_ACCEL / Math.max(aNow, 1e-3), 0.1, 1);
    if (orbitGoalMet(sim.elements, tAlt) || (sim.engineOut && sim.stage >= sim.stageCount - 1) || sim.t - ap.circStart > 900) {
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
  sim.addLog('Encendido de transferencia: el cohete sigue su dirección de avance.', 'ok');
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
    if (reached && winOk) { orbit = W.orbit; orbitNote = 'Hiciste la transferencia a tiempo y con la fuerza justa.'; }
    else if (reached) { orbit = W.orbit * 0.55; orbitNote = 'Tuviste la fuerza, pero encendiste fuera de la ventana.'; }
    else if (el.periAlt >= PHYS.PERI_OK) {
      const frac = el.hyper ? 1 : clamp(el.apoAlt / (d.okApoKm * 1000), 0, 1);
      orbit = W.orbit * 0.45 * frac; orbitNote = 'Llegaste a la órbita de espera, pero la transferencia no alcanzó.';
    } else { orbit = 0; orbitNote = 'No llegaste a una órbita estable.'; }
  } else if (el.periAlt >= PHYS.PERI_OK) {
    const err = (Math.abs(el.periAlt - tAlt) + Math.abs((el.hyper ? 1e7 : el.apoAlt) - tAlt)) / 2;
    orbit = W.orbit * clamp(1 - err / 250000, 0.2, 1);
    orbitNote = err < 25000 ? 'Tu órbita quedó casi perfecta.' : err < 100000 ? 'Tu órbita quedó cerca de la altura pedida.' : 'Tu órbita quedó lejos de la altura pedida.';
  } else {
    orbit = 0; orbitNote = 'No llegaste a una órbita estable.';
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
      { id: 'orbit', label: 'Qué tan cerca quedaste de tu órbita', points: Math.round(orbit), max: W.orbit, note: orbitNote },
      { id: 'fuel', label: 'Combustible que te sobró', points: Math.round(fuel), max: W.fuel, note: `Te quedó ${Math.round(sim.fuelLeftPct)} % del combustible (el piloto automático deja ~${Math.round(ref.fuelLeftPct)} %).` },
      { id: 'maxq', label: 'Cuidar el momento de más presión del aire (Max-Q)', points: Math.round(maxq), max: W.maxq, note: sim.stats.maxQ > PHYS.Q_LIMIT ? 'Pasaste el límite de presión del aire. La próxima vez baja el empuje.' : 'No pasaste el límite de presión del aire.' },
      { id: 'staging', label: 'Separar bien las etapas y la cofia', points: Math.round(staging), max: W.staging, note: wastedFrac > 0.02 ? 'Soltaste una etapa con combustible adentro.' : 'Separaste las etapas en buen momento.' },
    ],
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
  const design = designForDest({ id: designId, ...base }, destId);
  const vehicle = buildVehicle(design, entry.stackKg, entry.capacityKg);
  vehicle.designId = designId;
  return { vehicle, entry, program: entry.program, capacityKg: entry.capacityKg };
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
  for (const h1 of spec.h1) for (const p of spec.p) for (const decel of spec.decel) for (const slope of spec.slope) out.push({ h1, p, decel, slope });
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
