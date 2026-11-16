import { simText } from "../../../../src/i18n/catalog.js";
import Phaser from 'phaser';
// Vuelo interactivo: vista lateral 2D en pixel art, controles táctiles y de teclado, telemetría y pistas.
//
// Capas (cada una separada de las demás):
//   · SIMULACIÓN  → flight.js (pura, tiempo fijo): física del cohete.  world.js / particles.js: piezas sueltas, cámara y humo.
//   · PRESENTACIÓN → render.js (dibuja el mundo en un lienzo pequeño) y esta escena (arma el "estado de dibujo").
//   · INTERFAZ    → hud.js (HTML encima del canvas).
//
// El mundo vive en coordenadas de MUNDO (centro de la Tierra en el origen). La cámara se coloca sobre el cohete y
// la escala (metros por píxel) depende de la ALTURA real simulada: el suelo se aleja, el cielo cambia, la Tierra
// se curva y se hace chica. Nada depende de temporizadores ni hay saltos de posición.

import {
  PHYS, DEG, DEST, applyAutopilot, autopilotStep, orbitGoalMet, newAutopilot, startTransferBurn, trackTransfer, transferWindow, timeToApoapsis, pressureRatio, wasDestroyed,
} from '../flight.js';
import { EARTH, MOON, moonState, moonAngle } from '../bodies.js';
import { LUNAR, LUNAR_PHASE_LABEL, newGuide, lunarPlan, newLunarAutopilot, lunarAutopilotStep, startBurn, burnControl, signedPass } from '../lunar.js';
import { globeSample } from './earth.js';
import { app, inputs, current, reducedMotion } from '../store.js';
import { pauseGameplayMusic, playEffect, resumeGameplayMusic, setThruster, startRocketAudio, updateRocketFlightAudio, pauseRocketAudio, stopRocketAudio, setSimulationMusicDucked } from '../../../../src/welcome/core/gameAudio.js';
import { capsuleAudioLevels, capsuleImpactEffect, chuteEffect } from '../returnAudio.js';
import { createSim, finishFlight } from '../flow.js';
import { Hud } from '../hud.js';
import { esc } from '../screens.js';
import { toast } from '../ui.js';
import {
  phaseOf, PHASE_LABEL, FlightCamera, anchorY, CAMERA, makeDebris, stepDebris, cullReason, groundDistance, thrustAccelG,
} from '../world.js';
import { windEastMs } from '../weather.js';
import { ParticleSystem } from '../particles.js';
import { MAP_ZOOM } from './MapScene.js';
import { PixelView, FlightRenderer } from './render.js';
import { stageDebris, fairingSprite, rocketDims } from './rocketArt.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const FIXED_DT = 1 / 60; // paso fijo de la simulación (s reales)
const MAX_STEPS = 4; // máximo de pasos por cuadro para no "espiralizar" si el equipo va lento
const IGNITION_S = 2.6; // s reales de encendido en la plataforma antes de soltar los anclajes
const SPOOL_END = 0.7; // acelerador con el que termina el encendido (la física decide cuándo despega)
const MAX_DEBRIS = 10;

const WARP_JUMP = 60000; // «Saltar»: hasta 60.000 veces más rápido (los días de viaje pasan en un par de segundos)
const WARP_LEAD = 14; // s físicos antes del momento importante en que el tiempo vuelve a correr normal
const SPACE_FRAME_ALT = 180000; // m: arriba de esto el humo ya no vive "sobre el suelo" sino junto a la nave
const wrapPi = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const fmtDur = (s) => {
  if (!Number.isFinite(s)) return '—';
  if (s >= 2 * 86400) return simText("lunarFlight.0-days", (s / 86400).toLocaleString('es', { maximumFractionDigits: 1 }));
  if (s >= 2 * 3600) return simText("lunarFlight.0-hours", Math.round(s / 3600));
  if (s >= 120) return simText("lunarFlight.0-minutes", Math.round(s / 60));
  return simText("lunarFlight.0-seconds", Math.max(0, Math.round(s)));
};
const kmTxt = (m) => `${Math.round(m / 1000).toLocaleString('es')} km`;
const MILESTONES = [
  ['tli', simText("lunarFlight.bound-for-the-moon"), 'ok'], ['soi', simText("lunarFlight.moon-s-sphere-of-influence"), 'ok'], ['lunarOrbit', simText("lunarFlight.lunar-orbit-2"), 'ok'],
  ['tei', simText("lunarFlight.heading-home"), 'ok'], ['left', simText("lunarFlight.back-in-earth-s-sphere-of-influence"), 'info'], ['entry', simText("lunarFlight.reentry-2"), 'warn'], ['landed', null, 'ok'],
];

const EVENT_TEXT = {
  liftoff: [simText("flight.liftoff-2"), 'ok'],
  atmosphere: [simText("flight.tower-clear-atmospheric-flight"), 'info'],
  upper: [simText("flight.upper-atmosphere-2"), 'info'],
  space: [simText("flight.space-vacuum"), 'ok'],
};

export class FlightScene extends Phaser.Scene {
  constructor() { super('FlightScene'); }

  create() {
    this.reduced = reducedMotion();
    document.getElementById('ui').hidden = true;
    document.getElementById('overlay').hidden = true;
    app.nav.chrome('FlightScene');
    this.W = 0;
    // Par sin simulador calibrado: se resuelve de forma automática.
    if (!app.vehicleInfo) {
      finishFlight(null);
      app.nav.go('result');
      return;
    }
    const sim = createSim();
    // QA-only entry point: exercise real capsule aerodynamics, parachutes,
    // reentry audio and landing without replaying the outbound lunar journey.
    this.returnTest = new URLSearchParams(location.search).get('testReturn') === '1' && Boolean(sim.mission);
    if (this.returnTest) {
      sim.t = 5 * 86400;
      // Same path as a real return from the Moon: an ellipse from lunar distance whose lowest point
      // (ignoring the air) is the entry target, picked up shortly before it meets the atmosphere.
      // A steeper or slower entry breaks the capsule apart long before the parachutes can open.
      const rp = PHYS.RE + LUNAR.ENTRY_TARGET; const ra = MOON.DIST; const r = PHYS.RE + 125000;
      const v = Math.sqrt(PHYS.MU * (2 / r - 2 / (rp + ra)));
      const vt = Math.sqrt((PHYS.MU * rp * ra * 2) / (rp + ra)) / r;
      const vr = Math.sqrt(v * v - vt * vt);
      // The descent covers about 1,760 km of ground. Starting 3,410 km before the launch site brings
      // the capsule down in the middle of the wide ocean west of it (on the game's globe, open water
      // runs from 1,100 to 2,200 km away), so the test ends in a splashdown.
      const a0 = Math.PI / 2 - sim.atmRate * sim.t + 3410000 / PHYS.RE;
      const ux = Math.cos(a0); const uy = Math.sin(a0);
      sim.x = r * ux;
      sim.y = r * uy;
      sim.vx = vt * uy - vr * ux; // tangential speed points east (clockwise), radial speed points down
      sim.vy = -vt * ux - vr * uy;
      sim.grounded = false;
      sim.status = 'flying';
      sim.stage = sim.stageCount;
      sim.fuel.fill(0);
      sim.fairing = false;
      sim.throttle = 0;
      sim.stats.maxAlt = 400000;
      Object.assign(sim.mission, {
        leo: true, tli: true, soi: true, lunarOrbit: true, tei: true, left: true,
        parking: { periKm: 200, apoKm: 250 }, // el puntaje final describe la órbita de espera
      });
    }
    this.sim = sim;
    this.vehicle = sim.vehicle;
    this.dims = rocketDims(this.vehicle);
    this.diffLevel = inputs().difficulty;
    this.destKind = DEST[sim.destId].kind;
    this.ap = newAutopilot({ ...(app.reference?.program ?? app.vehicleInfo.program), waitWindow: true });
    this.shadow = newAutopilot(app.reference?.program ?? app.vehicleInfo.program);
    this.warp = 1;
    this.autoWarp = null;
    this.capsuleAudio = { burn: 0, wind: 0 }; // fuerza actual (suavizada) del escudo térmico y del viento
    this.chuteHeard = sim.chuteState;
    this.paused = true;
    this.ended = false;
    this.endTimer = 0;
    this.leaving = false;
    this.exploded = false;
    this.hintState = {};
    this.acc = 0;
    this.lastNoticeT = undefined;
    this.noticeUntil = 0;
    this.ignition = null; // { t } mientras los motores se encienden en la plataforma
    this.spool = 0;
    this.phase = 'pad';
    this.seenSep = null;
    this.maxQAnnounced = false;
    this.orbitAnnounced = false;
    this.accelSmooth = 0;
    this.flow = { px: 0, py: 0 };
    this.prevNozzle = null;
    this.debris = [];
    this.particles = new ParticleSystem();
    this.weather = app.weather ?? null; // clima real del sitio (se consulta en la plataforma); fijo durante el vuelo
    this.t0 = performance.now() / 1000;
    app.autopilotUsed = false;
    // misión lunar de ida y vuelta: guía, piloto automático de toda la misión y estado de la cámara
    this.lunar = Boolean(sim.mission);
    this.guide = this.lunar ? newGuide() : null;
    this.lap = this.lunar ? newLunarAutopilot(app.reference?.program ?? app.vehicleInfo.program) : null;
    this.plan = null; this.horizon = Infinity; this.jumpEta = 0; this.burnReadout = null;
    this.seenMilestone = {};
    this.camBody = 'earth'; this.upOffset = 0; this.upBlendT = Infinity;
    this.spaceFrame = false; this.craftT = null; this.splashed = false;
    app.lunarView = this.lunar ? { guide: this.guide, plan: null } : null;

    // lienzo pixel art + dibujo + cámara
    this.view = new PixelView(this, 'flightView');
    this.view.fit(this.scale.width, this.scale.height);
    this.renderer = new FlightRenderer(this.vehicle, { id: current().site?.id, latDeg: current().site?.latitudeDeg });
    this.cam = new FlightCamera(this.dMax());
    this.onResize = () => { this.view.fit(this.scale.width, this.scale.height); this.cam.dMax = this.dMax(); this.cam.reset(Math.max(0, this.sim.altitude)); };
    this.scale.on('resize', this.onResize);

    // HUD
    const hudEl = document.getElementById('hud');
    hudEl.hidden = false;
    this.hud = new Hud(hudEl, {
      separate: () => this.doSeparate(),
      fairing: () => this.doFairing(),
      map: () => this.toggleMap(),
      zoom: (dir) => this.zoom(dir),
      pause: () => this.togglePause(),
      finish: () => this.finish(),
      jumpApo: () => this.doJump(),
      warp: (n) => { this.warp = n; this.autoWarp = null; },
      autopilot: (on) => { app.autopilotUsed = app.autopilotUsed || on; if (on) toast(simText("flight.autopilot-is-on-you-can-turn-it-off"), 'info'); },
      prograde: (on) => this.sim.setMode(on ? 'prograde' : 'manual'),
      attitude: (mode) => { if (this.sim.burn && !this.sim.burn.done) this.cancelBurn(); this.sim.setMode(mode); },
      chute: () => this.doChute(),
      transfer: () => (this.lunar ? this.doManeuver() : this.doTransfer()),
    }, {
      difficulty: this.diffLevel,
      stageNames: this.vehicle.stages.map((s) => s.name),
      transfer: this.destKind === 'transfer',
      lunar: this.lunar,
    });
    this.hud.setThrottle(1);
    this.hud.setPhase('pad');
    this.onEsc = (ev) => { if (ev.key === 'Escape') this.togglePause(); };
    window.addEventListener('keydown', this.onEsc);
    // zoom con la rueda del mouse y con dos dedos (pellizco), en la vista de vuelo y en el mapa
    app.mapZoom = 1;
    this.onWheel = (ev) => {
      if (ev.target.closest?.('.more, .overlay, .ui, .popover')) return;
      ev.preventDefault();
      this.zoomBy(Math.exp(clamp(ev.deltaY, -120, 120) * 0.0025));
    };
    window.addEventListener('wheel', this.onWheel, { passive: false });
    this.touches = new Map(); this.pinchDist = 0;
    const gameEl = document.getElementById('game');
    const dist = () => { const [a, b] = [...this.touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.onPtrDown = (ev) => { if (ev.pointerType !== 'touch') return; this.touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); if (this.touches.size === 2) this.pinchDist = dist(); };
    this.onPtrMove = (ev) => {
      if (!this.touches.has(ev.pointerId)) return;
      this.touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.touches.size === 2 && this.pinchDist > 0) { const d = dist(); if (d > 0) { this.zoomBy(this.pinchDist / d); this.pinchDist = d; } }
    };
    this.onPtrUp = (ev) => { this.touches.delete(ev.pointerId); this.pinchDist = 0; };
    this.gameEl = gameEl;
    gameEl.style.touchAction = 'none';
    gameEl.addEventListener('pointerdown', this.onPtrDown);
    window.addEventListener('pointermove', this.onPtrMove);
    window.addEventListener('pointerup', this.onPtrUp);
    window.addEventListener('pointercancel', this.onPtrUp);
    this.events.once('shutdown', () => this.cleanup());

    setSimulationMusicDucked(true);
    startRocketAudio();
    if (this.returnTest) {
      this.paused = false;
      this.ignition = null;
      this.phase = 'entry';
      this.hud.message('RETURN TEST · Earth reentry / capsule descent', 'info');
    } else this.begin();
  }

  dMax() { return CAMERA.dMaxFrac * this.view.viewH; }

  cleanup() {
    window.removeEventListener('keydown', this.onEsc);
    window.removeEventListener('wheel', this.onWheel);
    this.gameEl?.removeEventListener('pointerdown', this.onPtrDown);
    window.removeEventListener('pointermove', this.onPtrMove);
    window.removeEventListener('pointerup', this.onPtrUp);
    window.removeEventListener('pointercancel', this.onPtrUp);
    this.scale.off('resize', this.onResize);
    stopRocketAudio();
    setSimulationMusicDucked(false);
    resumeGameplayMusic();
    setThruster(0);
    this.hud?.destroy();
    this.view?.destroy();
    this.particles?.clear();
    this.debris = [];
    document.getElementById('hud').hidden = true;
    document.getElementById('overlay').hidden = true;
    this.mapOpen = false;
    if (this.scene.isActive('MapScene')) this.scene.stop('MapScene');
  }

  // ------------------------------------------------------------------ flujo

  /** Estado 1: encendido en la plataforma. El cohete sigue apoyado; luego la física decide cuándo despega. */
  begin() {
    this.paused = false;
    this.ignition = { t: 0 };
    this.spool = 0;
    this.hud.message(simText("flight.engines-igniting-the-rocket-is-still-held-on"), 'info');
    this.hud.event(simText("flight.ignition"), 'info');
  }

  togglePause() {
    if (this.ended || (this.sim.status === 'pad' && !this.ignition)) return;
    this.paused = !this.paused;
    pauseRocketAudio(this.paused);
    if (this.paused) pauseGameplayMusic();
    else resumeGameplayMusic();
    const ov = document.getElementById('overlay');
    if (this.paused) {
      ov.hidden = false;
      ov.innerHTML = `<div class="tutorial" role="dialog" aria-label="${simText("flight.pause")}"><span class="kicker">${simText("flight.paused")}</span><h2>${simText("flight.flight-paused")}</h2><p>${simText("flight.the-rocket-is-holding-engines-and-the-clock")}</p>
        <div class="actions"><button id="p-exit">${simText("flight.return-to-mission-control")}</button>${this.lunar && this.sim.mission.leo && this.sim.status === 'flying' ? `<button id="p-end" title="${simText("lunarFlight.end-the-flight-at-the-spacecraft-s-current")}">${simText("lunarFlight.end-mission-here")}</button>` : ''}<button class="primary big" id="p-resume">${simText("flight.resume-flight")}</button></div></div>`;
      document.getElementById('p-resume').onclick = () => this.togglePause();
      const end = document.getElementById('p-end');
      if (end) end.onclick = () => { this.togglePause(); this.finish(); };
      document.getElementById('p-exit').onclick = () => { this.paused = false; ov.hidden = true; app.sim = null; app.nav.exit(); };
    } else { ov.hidden = true; ov.innerHTML = ''; }
  }

  /** Zoom por pasos (botones y teclas + / −; 0 vuelve a la vista normal). */
  zoom(dir) {
    if (dir === 0) { if (this.mapOpen) app.mapZoom = 1; else this.cam.resetZoom(); return; }
    this.zoomBy(dir > 0 ? 1 / CAMERA.zoomStep : CAMERA.zoomStep);
  }

  /** Zoom continuo: f > 1 aleja, f < 1 acerca. Actúa sobre el mapa si está abierto; si no, sobre la cámara del vuelo. */
  zoomBy(f) {
    if (this.mapOpen) app.mapZoom = clamp((app.mapZoom ?? 1) / (f > 1 ? f * f : f < 1 ? f * f : 1), MAP_ZOOM.min, MAP_ZOOM.max); // en el mapa el zoom va al doble de paso: hay mucho que recorrer
    else this.cam.zoomFactor(f);
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) { this.scene.launch('MapScene'); this.scene.bringToTop('MapScene'); } else this.scene.stop('MapScene');
    this.view.setVisible(!this.mapOpen);
    document.getElementById('b-map').classList.toggle('is-on', this.mapOpen);
  }

  doSeparate() {
    if (this.paused || this.ignition || this.sim.status !== 'flying') return;
    if (this.sim.stage >= this.sim.stageCount) return;
    this.sim.separateStage(); // las piezas se crean en collectSeparation() a partir de los datos físicos de la simulación
    this.collectSeparation();
  }

  doFairing() {
    if (this.paused || this.ignition || this.sim.status !== 'flying') return;
    this.sim.dropFairing();
    this.collectSeparation();
  }

  /** Convierte lo que soltó la simulación (etapa o cofia) en cuerpos físicos independientes, con humo y destello. */
  collectSeparation() {
    const sep = this.sim.lastSeparation;
    if (!sep || sep === this.seenSep) return;
    this.seenSep = sep;
    const mpp = this.cam.mpp;
    const [ax, ay] = sep.axis;
    const make = (spr, extra) => {
      // la pieza sale desde su lugar en el cohete: centro a `centerFromBase` píxeles de la tobera, a lo largo del eje
      const along = spr.centerFromBase * mpp;
      return makeDebris({ ...sep, x: sep.x + ax * along - ay * (extra.lateral ?? 0) * mpp, y: sep.y + ay * along + ax * (extra.lateral ?? 0) * mpp }, { side: extra.side ?? 0, index: sep.index });
    };
    if (sep.kind === 'stage') {
      playEffect('stage-separation');
      // una etapa entera, o los dos propulsores laterales (cada uno se abre hacia su lado)
      for (const piece of stageDebris(this.vehicle, sep.index)) this.debris.push(make(piece, { side: piece.side, lateral: piece.lateral }));
      this.cam.kick(0.5);
      if (this.sim.altitude > 1500) this.cam.kickFocus(6);
      this.hud.event(this.vehicle.stages[sep.index]?.service ? simText("lunarFlight.service-module-separated") : simText('flight.stage-0-separated', sep.index + 1), 'ok');
    } else {
      for (const side of [-1, 1]) this.debris.push(make(fairingSprite(this.vehicle, side), { side, lateral: side * (this.dims.hw / 2 + 0.5) }));
      this.cam.kick(0.25);
      if (this.sim.altitude > 1500) this.cam.kickFocus(4);
      this.hud.event(simText("flight.fairing-released"), 'ok');
    }
    while (this.debris.length > MAX_DEBRIS) this.debris.shift();
    // destello y gases en el punto de separación
    const g = this.groundFrame();
    const aE = ax * this.uy() - ay * this.ux(); const aU = ax * this.ux() + ay * this.uy();
    this.particles.separation({ x: g.E, y: g.U, vx: g.vE, vy: g.vU, axis: { x: aE, y: aU }, strength: sep.kind === 'stage' ? 1 : 0.6 });
  }

  doJump() {
    if (this.sim.status !== 'flying' || this.sim.throttle > 0.01) { this.hud.message(simText('flight.cut-the-engines-before-skipping-ahead'), 'warn'); return; }
    if (this.lunar && this.sim.mission.leo) {
      if (!(this.jumpEta > WARP_LEAD + 4)) { toast(simText("lunarFlight.there-is-nothing-to-wait-for-it-is"), 'info'); return; }
      this.autoWarp = 'plan';
      return;
    }
    this.autoWarp = this.destKind === 'transfer' && this.sim.orbitReached && !this.sim.stats.transfer ? 'window' : 'apo';
  }

  doTransfer() {
    if (this.sim.stats.transfer || !this.sim.orbitReached) return;
    startTransferBurn(this.sim);
    this.hud.togglePrograde(true);
    this.hud.setThrottle(1);
    this.autoWarp = null; this.warp = 1;
    this.hud.setWarp(1);
  }

  finish() {
    if (this.ended) return;
    this.sim.finish('finished');
  }

  // ------------------------------------------------------------------ geometría del mundo

  /** Vertical local (vector unitario): desde el centro del cuerpo que manda (la Tierra o la Luna) hacia la nave. */
  upVec() {
    const s = this.sim;
    if (s.body === 'moon') { const q = s.rel(); const r = Math.hypot(q.x, q.y) || 1; return [q.x / r, q.y / r]; }
    return [s.x / s.r, s.y / s.r];
  }
  ux() { return this.upVec()[0]; }
  uy() { return this.upVec()[1]; }

  /** Distancia por el suelo hasta la plataforma. En las misiones largas se mide por el camino corto (da la vuelta al planeta). */
  groundS() {
    const s = this.sim;
    if (!this.lunar) return groundDistance(s.angle, s.t, s.atmRate);
    return PHYS.RE * wrapPi(Math.PI / 2 - s.atmRate * s.t - s.angle);
  }

  /** Posición y velocidad del cohete en el marco del suelo (este, altura): ahí viven el humo y la plataforma. */
  groundFrame() {
    const s = this.sim;
    if (this.spaceFrame) return { E: 0, U: 0, vE: 0, vU: 0 }; // en el espacio profundo: marco que acompaña a la nave
    return {
      E: this.groundS(),
      U: Math.max(0, s.altitude),
      vE: s.tangentSpeed - s.atmRate * s.r,
      vU: s.radialSpeed,
    };
  }

  // ------------------------------------------------------------------ cada cuadro

  update(time, delta) {
    if (!this.sim) return;
    const dt = Math.min(delta, 100) / 1000;
    this.hud.tickKeys(dt);
    const sim = this.sim;
    let followThrottle = null;
    if (this.lunar && sim.mission.leo && sim.status === 'flying' && !this.hud.controls.autopilot) {
      // plan de la misión: qué toca y cuánto falta (una vez por cuadro; la predicción se guarda mientras nada cambie)
      // jumpEta = cuánto falta para la próxima acción (hasta ahí llega «Saltar»);
      // horizon = hasta dónde se puede acelerar el tiempo a mano sin saltarse nada.
      this.plan = lunarPlan(sim, this.guide);
      this.jumpEta = this.plan.eta;
      this.horizon = this.plan.eta > 0 ? this.plan.eta : (this.plan.limit ?? Infinity);
    }
    if (!this.paused) {
      // paso fijo: la física no depende de los cuadros por segundo
      this.acc = Math.min(this.acc + dt, FIXED_DT * MAX_STEPS);
      while (this.acc >= FIXED_DT) {
        this.acc -= FIXED_DT;
        if (this.ignition) this.stepIgnition(FIXED_DT);
        else if (sim.status === 'flying') followThrottle = this.step(FIXED_DT);
      }
    }
    const enginePower = this.paused || this.ended || sim.engineOut ? 0 : this.ignition ? this.spool : sim.status === 'flying' ? sim.throttle : 0;
    setThruster(enginePower);
    if (sim.status !== 'ended' && !this.paused) this.updateFlightAudio(dt);
    this.updateHints(followThrottle);
    this.drawFrame(dt);
    if (sim.status === 'ended' && !this.ended) this.onEnded();
    if (this.ended) {
      this.endTimer += dt;
      if (this.endTimer > (sim.landing ? 7 : 2.8) && !this.leaving) { this.leaving = true; finishFlight(sim); app.nav.go('result'); }
    }
  }

  /** Estado 1 · en la plataforma: llamas, humo y vibración que crecen; el cohete NO se mueve. */
  stepIgnition(dt) {
    const ig = this.ignition;
    ig.t += dt;
    const k = clamp(ig.t / IGNITION_S, 0, 1);
    this.spool = SPOOL_END * k * k * (3 - 2 * k) + (k < 1 ? 0 : 0);
    const air = 1;
    this.particles.padBillow({ x: 0, throttle: this.spool, strength: 0.5 + k * 0.8 });
    const g = this.groundFrame();
    this.particles.exhaust({ from: { x: g.E, y: 0 }, to: { x: g.E, y: 0 }, vel: { x: 0, y: 0 }, axis: { x: 0, y: 1 }, throttle: this.spool, air, dt: dt * PHYS.COMPRESSION });
    this.particles.step(dt * PHYS.COMPRESSION * 0.6);
    if (!this.reduced) this.cam.kick(0.1 + 0.5 * this.spool);
    this.hud.setLive({ throttle: this.spool });
    if (ig.t >= IGNITION_S) {
      this.ignition = null;
      this.sim.ignite();
      // los motores ya estaban rugiendo: la física parte desde ese empuje y decide cuándo supera al peso
      this.sim.throttle = Math.min(this.hud.controls.throttle, SPOOL_END);
      this.hud.message(simText("flight.engines-at-full-thrust-the-rocket-lifts-off"), 'ok');
    }
  }

  step(dt) {
    const sim = this.sim;
    const hud = this.hud;
    let ctl;
    let follow = null;
    if (this.lunar) return this.stepLunar(dt);
    if (hud.controls.autopilot) {
      const c = applyAutopilot(sim, this.ap);
      ctl = { throttle: c.throttle, betaTarget: sim.mode === 'prograde' ? null : c.betaTarget };
      follow = c.throttle;
      if (c.done) { hud.toggleAuto(false); this.hud.message(simText("flight.autopilot-has-finished-review-your-orbit-and-select"), 'ok'); }
    } else {
      ctl = { steer: hud.steer, throttle: hud.controls.throttle };
    }
    let warp = this.warp;
    let phys = dt * PHYS.COMPRESSION * warp;
    if (this.autoWarp) {
      const stop = this.autoWarpStop();
      if (stop.eta <= stop.lead || sim.throttle > 0.01) { this.autoWarp = null; }
      else phys = Math.min(dt * PHYS.COMPRESSION * 120, stop.eta - stop.lead);
    }
    if (sim.altitude < PHYS.ATM_TOP && phys > dt * PHYS.COMPRESSION * 5.01) phys = dt * PHYS.COMPRESSION * 5;
    sim.advance(phys, ctl);
    trackTransfer(sim);
    const tr = sim.stats.transfer;
    if (tr && !tr.active && sim.throttle > 0 && !hud.controls.autopilot) { hud.setThrottle(0); this.hud.togglePrograde(false); }
    this.collectSeparation(); // también cuando separa el piloto automático

    this.stepWorld(phys);
    this.afterStep(phys);
    return follow;
  }

  /** Lo que pasa después de cada paso de física, igual para todas las misiones: fase, avisos, sacudida y carteles. */
  afterStep(phys) {
    const sim = this.sim;
    const phase = sim.body === 'moon' ? 'space' : phaseOf(sim.altitude, { grounded: sim.grounded, prev: this.phase });
    if (phase !== this.phase) this.onPhase(phase);

    // rastro de mensajes importantes de la simulación
    if (sim.notice && sim.notice.t !== this.lastNoticeT) {
      this.lastNoticeT = sim.notice.t;
      this.hud.message(sim.notice.text, sim.notice.kind === 'bad' ? 'bad' : sim.notice.kind === 'warn' ? 'warn' : sim.notice.kind === 'ok' ? 'ok' : 'info');
      this.noticeUntil = performance.now() + 4500;
      if (sim.notice.kind === 'warn' && !this.reduced) this.cam.kick(0.4);
    }
    // sacudida: motores al ras del suelo y Max-Q
    const q = sim.lastQ;
    if (!this.reduced) {
      if (sim.altitude < 1500 && sim.throttle > 0.05) this.cam.kick(0.12 + 0.3 * sim.throttle * (1 - sim.altitude / 1500));
      if (q > PHYS.Q_WARN * 0.8) this.cam.kick(0.2 + 0.4 * smooth(PHYS.Q_WARN, PHYS.Q_LIMIT, q));
    }
    if (!this.maxQAnnounced && sim.stats.entryT == null && q > 8000 && q < sim.stats.maxQ * 0.9) { this.maxQAnnounced = true; this.hud.event(simText('flight.max-q-passed'), 'ok'); }
    if (sim.orbitReached && !this.orbitAnnounced) { this.orbitAnnounced = true; this.hud.event(simText('flight.orbit-reached'), 'ok'); }
    if (sim.mission) {
      for (const [key, text, kind] of MILESTONES) if (sim.mission[key] && !this.seenMilestone[key]) { this.seenMilestone[key] = true; this.hud.event(text ?? (this.onWater() ? simText("lunarFlight.splashdown-2") : simText("lunarFlight.touchdown")), kind); if (!this.reduced && key !== 'left') this.cam.kick(0.3); }
      if (sim.chute && !this.seenMilestone.chute) { this.seenMilestone.chute = true; this.hud.event(sim.chute.torn ? simText("lunarFlight.parachutes-torn") : simText("lunarFlight.parachutes-deployed"), sim.chute.torn ? 'bad' : 'ok'); if (!this.reduced) this.cam.kick(0.5); }
      // reentrada: la cápsula vibra con el frenado
      if (!this.reduced && sim.gNow > 1.5 && sim.stats.entryT != null) this.cam.kick(Math.min(0.7, sim.gNow / 12));
    }
    void phys;
  }

  /** Mundo: piezas sueltas y partículas avanzan con el mismo tiempo físico que el cohete. */
  stepWorld(phys) {
    const sim = this.sim;
    const physW = Math.min(phys, 30);
    const world = sim.moon ? { moon: sim.moon, t: sim.t, body: sim.body } : null;
    for (const d of this.debris) stepDebris(d, physW, sim.atmRate, world);
    this.cullDebris();
    // en el espacio profundo el humo vive en un marco que acompaña a la nave (no hay suelo ni aire de referencia)
    const space = sim.body === 'moon' || sim.altitude > SPACE_FRAME_ALT;
    if (space !== this.spaceFrame) { this.spaceFrame = space; this.particles.clear(); this.particles.vacuum = space; this.prevNozzle = null; }
    this.emitEffects(physW);
    this.particles.step(Math.min(phys, 6));
  }

  // ------------------------------------------------------------------ misión lunar

  /** Un paso de la misión lunar: piloto automático, maniobra guiada o mando manual, con el tiempo acelerado sin pasarse. */
  stepLunar(dt) {
    const sim = this.sim; const hud = this.hud;
    let ctl; let follow = null;
    const auto = hud.controls.autopilot;
    if (auto) {
      const c = lunarAutopilotStep(sim, this.lap);
      ctl = { throttle: c.throttle, betaTarget: sim.mode === 'manual' ? c.betaTarget : null };
      follow = c.throttle;
      this.burnReadout = c.plan?.readout ?? null;
      if (c.plan?.phase && c.plan.phase !== 'ascent' && c.plan.action !== 'burning') { this.plan = c.plan; this.jumpEta = c.eta; this.horizon = c.eta > 0 ? c.eta : (c.plan.limit ?? Infinity); }
      // con el piloto automático, las esperas largas se saltan solas
      if (sim.mission.leo && c.eta > 90 && sim.throttle < 0.01 && !this.autoWarp) this.autoWarp = 'plan';
      hud.setAttitude(sim.capsuleOnly ? 'manual' : sim.mode, true);
      if (c.done && !this.ended) hud.toggleAuto(false);
    } else if (sim.burn && !sim.burn.done) {
      // maniobra guiada que pidió el jugador: el juego orienta la nave, regula el motor y lo apaga a tiempo
      const c = burnControl(sim);
      if (sim.mode !== c.mode) sim.setMode(c.mode);
      hud.setAttitude(c.mode, true);
      ctl = { throttle: c.throttle }; follow = c.throttle;
      this.burnReadout = c.readout;
      if (c.done) this.onBurnDone(sim.burn);
    } else { ctl = { steer: hud.steer, throttle: hud.controls.throttle }; this.burnReadout = null; }

    // tiempo: normal, acelerado (hasta 5000×) o «Saltar» hasta el próximo momento importante
    const burning = sim.throttle > 0.01 || (ctl.throttle ?? 0) > 0.01;
    const inAir = sim.body === 'earth' && sim.altitude < PHYS.ATM_TOP;
    if ((burning || inAir) && this.warp > 5) { this.warp = 5; hud.setWarp(5); }
    if (burning && this.autoWarp) this.autoWarp = null;
    let phys = dt * PHYS.COMPRESSION * this.warp;
    const horizon = this.horizon;
    if (this.autoWarp) {
      // «Saltar»: avanza hasta un poco antes de la próxima acción y vuelve al tiempo normal
      const eta = this.jumpEta ?? 0;
      if (!(eta > WARP_LEAD + 0.5) || burning) { this.autoWarp = null; this.warp = 1; hud.setWarp(1); } else phys = Math.min(dt * PHYS.COMPRESSION * WARP_JUMP, Math.max(eta - WARP_LEAD, phys), Math.max(60, eta * 0.2));
    } else if (this.warp > 5 && Number.isFinite(horizon)) {
      if (horizon <= WARP_LEAD) { this.warp = 1; hud.setWarp(1); phys = dt * PHYS.COMPRESSION; toast(simText("lunarFlight.normal-speed-restored-a-key-event-is-approaching"), 'info'); } else phys = Math.min(phys, horizon - WARP_LEAD);
    }
    if (inAir && phys > dt * PHYS.COMPRESSION * 5.01) phys = dt * PHYS.COMPRESSION * 5;
    const t0 = sim.t;
    sim.advance(phys, ctl);
    this.horizon -= sim.t - t0;
    if (this.jumpEta != null) this.jumpEta -= sim.t - t0;
    trackTransfer(sim);
    this.collectSeparation();
    this.stepWorld(phys);
    this.afterStep(phys);
    return follow;
  }

  /** El botón de maniobra: hace la que toca ahora (ir a la Luna, corregir, frenar o volver) o detiene la que está en curso. */
  doManeuver() {
    const sim = this.sim;
    if (this.paused || sim.status !== 'flying' || !sim.mission.leo) return;
    if (this.hud.controls.autopilot) { toast(simText("lunarFlight.autopilot-is-in-control-turn-it-off-p"), 'info'); return; }
    if (sim.burn && !sim.burn.done) { this.cancelBurn(); toast(simText("lunarFlight.maneuver-stopped"), 'info'); return; }
    const plan = lunarPlan(sim, this.guide);
    if (sim.capsuleOnly) return;
    if (sim.engineOut) { toast(sim.stage < sim.stageCount - 1 ? simText("lunarFlight.this-stage-has-no-fuel-separate-it-space") : simText("lunarFlight.the-service-module-ran-out-of-propellant"), 'warn'); return; }
    let kind = null; let extra = {};
    const wait = (what) => toast(simText("lunarFlight.not-yet-0-in-1-select-skip-ahead", what, fmtDur(plan.eta)), 'info');
    switch (plan.phase) {
      case 'parking':
        if (sim.fairing) sim.dropFairing();
        if (plan.window && !plan.window.open) { wait(simText("lunarFlight.the-lunar-transfer-window-opens")); return; }
        kind = 'tli'; break;
      case 'toMoon': kind = 'mcc'; extra = { goal: 'moon' }; break;
      case 'approach':
        if (plan.action === 'waitLoi' && plan.eta > 45) { wait(simText("lunarFlight.brake-at-the-lowest-point")); return; }
        kind = 'loi'; break;
      case 'lunarOrbit':
        if (plan.action === 'waitTei' && plan.eta > 20) { wait(simText("lunarFlight.the-return-window-opens")); return; }
        kind = 'tei'; break;
      case 'departing': case 'toEarth': kind = 'mcc'; extra = { goal: 'earth' }; break;
      default: return;
    }
    startBurn(sim, kind, extra);
    this.autoWarp = null; this.warp = 1; this.hud.setWarp(1);
    this.hud.event({ tli: simText("lunarFlight.translunar-injection-2"), loi: simText("lunarFlight.lunar-orbit-insertion"), tei: simText("lunarFlight.return-burn"), mcc: simText("lunarFlight.course-correction") }[kind], 'info');
  }

  cancelBurn() {
    const b = this.sim.burn;
    if (!b || b.done) return;
    b.done = true; b.result = 'cancel'; b.endT = this.sim.t;
    if (this.sim.stats.transfer) this.sim.stats.transfer.active = false;
    this.hud.setThrottle(0);
    this.guide.pred = null;
  }

  /** Fin de una maniobra guiada: apaga el motor y cuenta cómo quedó. */
  onBurnDone(b) {
    const sim = this.sim;
    this.hud.setThrottle(0);
    this.guide.pred = null;
    if (b.kind === 'mcc') { if (b.goal === 'moon') this.guide.mccMoon = (this.guide.mccMoon ?? 0) + 1; else { this.guide.mccEarth = (this.guide.mccEarth ?? 0) + 1; this.guide.mccEarthAlt = sim.altitude; } }
    const msg = {
      tli: { ok: simText("lunarFlight.translunar-injection-complete-the-trajectory-now-passes-near"), low: simText("lunarFlight.translunar-injection-complete-but-the-trajectory-passes-too"), noEncounter: simText("lunarFlight.the-burn-finished-but-its-timing-left-the") },
      loi: { ok: simText("lunarFlight.braking-complete-you-are-in-lunar-orbit"), empty: simText("lunarFlight.fuel-ran-out-before-the-braking-burn-finished"), left: simText("lunarFlight.the-spacecraft-left-the-moon-s-sphere-of") },
      tei: { ok: simText("lunarFlight.return-burn-complete-the-trajectory-heads-toward-earth"), over: simText("lunarFlight.you-overshot-slightly-correct-the-return-trajectory"), empty: simText("lunarFlight.fuel-ran-out-during-the-return-burn") },
      mcc: { ok: simText("lunarFlight.course-corrected"), empty: simText("lunarFlight.fuel-ran-out-during-the-course-correction"), lost: simText("lunarFlight.no-suitable-correction-is-available-from-here") },
    }[b.kind]?.[b.result] ?? simText("lunarFlight.maneuver-complete");
    this.hud.message(msg, b.result === 'ok' ? 'ok' : 'warn');
    this.noticeUntil = performance.now() + 5000;
    this.hud.setAttitude('prograde'); // queda mirando hacia adelante
  }

  /**
   * Sonido del vuelo en este cuadro. El cohete suena según la altura; la cápsula que regresa, según la física:
   * el escudo térmico ruge mientras se calienta y el viento acompaña toda la caída (ver returnAudio.js).
   */
  updateFlightAudio(dt) {
    const sim = this.sim;
    const levels = capsuleAudioLevels(sim);
    const mix = this.capsuleAudio;
    if (levels) {
      // se acerca de a poco al valor que toca, para que nada entre ni salga de golpe
      const k = 1 - Math.exp(-dt * 4);
      mix.burn += (levels.burn - mix.burn) * k;
      mix.wind += (levels.wind - mix.wind) * k;
    } else { mix.burn = 0; mix.wind = 0; }
    updateRocketFlightAudio(sim.body === 'moon' ? Infinity : sim.altitude, levels ? mix : null);
    const chute = sim.chuteState;
    const effect = chuteEffect(this.chuteHeard, chute);
    this.chuteHeard = chute;
    if (effect) playEffect(effect);
  }

  doChute() {
    if (this.paused || this.sim.status !== 'flying') return;
    const r = this.sim.deployChute();
    if (r === 'attached') toast(simText("lunarFlight.release-the-service-module-first-the-parachutes-are"), 'warn');
  }

  onPhase(next) {
    const first = this.phase === 'pad' && next === 'liftoff';
    const returning = Boolean(this.sim.mission?.leo); // de vuelta del espacio, las fases de altura ya no son "la subida"
    this.phase = next;
    this.hud.setPhase(next);
    if (returning) return;
    const [text, kind] = EVENT_TEXT[next] ?? [PHASE_LABEL[next], 'info'];
    if (first) this.cam.kick(0.6);
    this.hud.event(text, kind);
  }

  cullDebris() {
    const rocket = { x: this.sim.x, y: this.sim.y };
    this.debris = this.debris.filter((d) => {
      const why = cullReason(d, rocket);
      if (!why) return true;
      if (why === 'impact') {
        const g = Math.atan2(d.y, d.x);
        if (!this.spaceFrame) this.particles.add('smoke', this.lunar ? PHYS.RE * wrapPi(Math.PI / 2 - this.sim.atmRate * this.sim.t - g) : groundDistance(g, this.sim.t, this.sim.atmRate), 0, 0, 4, { size: 4, life: 6 });
      }
      return false;
    });
  }

  /** Fuego, humo y nube de la plataforma según el empuje y el aire que queda. */
  emitEffects(phys) {
    const sim = this.sim;
    const g = this.groundFrame();
    const thr = sim.engineOut ? 0 : sim.throttle;
    const air = sim.body === 'moon' ? 0 : pressureRatio(sim.altitude);
    const cur = { x: g.E, y: g.U };
    const [ax, ay] = sim.attitude();
    const axis = { x: ax * this.uy() - ay * this.ux(), y: ax * this.ux() + ay * this.uy() };
    if (thr > 0.04) {
      // la nube de la plataforma sólo mientras los motores están cerca del suelo
      if (sim.altitude < 220) this.particles.padBillow({ x: 0, throttle: thr, strength: (1 - sim.altitude / 220) * (this.reduced ? 0.4 : 1) });
      this.particles.exhaust({ from: this.prevNozzle ?? cur, to: cur, vel: { x: g.vE, y: g.vU }, axis, throttle: thr, air, dt: phys });
    }
    this.prevNozzle = cur;
  }

  autoWarpStop() {
    const sim = this.sim;
    if (this.autoWarp === 'window') {
      const w = transferWindow(sim);
      return { eta: w ? w.waitS : 0, lead: w ? w.burnS / 2 + 4 : 4 };
    }
    const el = sim.elements;
    const eta = timeToApoapsis(sim);
    const stage = sim.currentStage;
    const dv = Math.max(0, Math.sqrt(PHYS.MU / el.ra) - Math.sqrt(PHYS.MU * (2 / el.ra - 1 / el.a)));
    const a = stage && stage.mdot > 0 ? Math.min(12, (stage.mdot * stage.ispVac * PHYS.G0) / sim.mass) : 8;
    return { eta, lead: dv / Math.max(1, a) / 2 + 5 };
  }

  onEnded() {
    this.ended = true;
    this.endTimer = 0;
    const sim = this.sim;
    stopRocketAudio();
    const impact = capsuleImpactEffect(sim, () => this.onWater());
    if (impact) playEffect(impact);
    const bad = wasDestroyed(sim);
    if (bad) {
      this.explode();
      this.hud.message(sim.log.at(-1)?.text ?? simText('flight.the-rocket-was-lost'), 'bad');
    } else if (sim.landing) {
      // amerizaje: salpicadura y la cápsula flotando mientras llega el barco
      if (!this.spaceFrame && this.onWater()) this.particles.splash({ x: this.groundS(), y: 0, n: this.reduced ? 14 : 46 });
      if (!this.reduced) this.cam.kick(0.5);
      this.hud.message(simText("lunarFlight.0-at-1-m-s-the-crew-is", this.onWater() ? simText("lunarFlight.splashdown-3") : simText("lunarFlight.touchdown-2"), sim.landing.speed.toFixed(1)), 'ok');
    } else this.hud.message(sim.orbitReached ? simText('flight.flight-complete-let-s-see-how-you-did') : simText('flight.flight-complete'), 'ok');
  }

  explode() {
    const g = this.groundFrame();
    this.particles.explosion({ x: g.E, y: g.U + this.dims.total * 0.5 * this.cam.mpp, vx: g.vE * 0.3, vy: g.vU * 0.3, n: this.reduced ? 30 : 90 });
    if (!this.reduced) this.cam.kick(1);
    this.exploded = true;
  }

  // ------------------------------------------------------------------ pistas

  updateHints(followThrottle) {
    if (this.lunar && this.sim.mission.leo) { this.updateLunarHints(followThrottle); return; }
    const sim = this.sim;
    const hud = this.hud;
    const level = this.diffLevel;
    const out = autopilotStep(sim, this.shadow);
    const ctx = { followThrottle, canProgradeMode: sim.altitude > 70000 && sim.status === 'flying', phase: this.phase };
    const transfer = this.destKind === 'transfer';
    const tr = sim.stats.transfer;
    const empty = sim.engineOut && sim.stage < sim.stageCount - 1;
    const lastEmpty = sim.engineOut && sim.stage >= sim.stageCount - 1;
    ctx.canJump = sim.status === 'flying' && sim.altitude > PHYS.ATM_TOP && sim.throttle < 0.01 && !(tr && tr.active);
    ctx.canFinish = sim.status === 'flying' && (sim.orbitReached || lastEmpty || (transfer && tr && !tr.active));
    ctx.canTransfer = transfer && sim.orbitReached && !tr && sim.status === 'flying';
    const el = sim.elements;
    const tAlt = sim.targetAltKm * 1000;
    const circular = orbitGoalMet(el, tAlt);
    const phase = this.shadow.phase;
    let msg = null; let kind = 'hint';
    const warnings = [];
    if (sim.lastQ > PHYS.Q_LIMIT) warnings.push([simText("flight.dynamic-pressure-is-too-high-reduce-thrust-now"), 'bad']);
    else if (sim.lastQ > PHYS.Q_WARN) warnings.push([simText("flight.high-dynamic-pressure-max-q-reduce-thrust-slightly"), 'warn']);
    if (lastEmpty && !sim.orbitReached && sim.status === 'flying') warnings.push([simText("flight.you-ran-out-of-fuel-before-reaching-orbit"), 'bad']);
    // en la plataforma con poco empuje: el cohete pesa más de lo que empuja
    if (sim.status === 'flying' && sim.grounded && !this.ignition) {
      const twNow = sim.thrustToWeight(Math.max(hud.controls.throttle, sim.throttle * 0.999));
      if (hud.controls.throttle > 0.02 && twNow < 1) warnings.push([simText("flight.thrust-0-times-the-rocket-s-weight-is", twNow.toFixed(2)), 'warn']);
    }

    // recomendaciones (más detalladas en fácil, solo pistas visuales en normal)
    ctx.recommendBetaDeg = null;
    ctx.suggestThrottle = level !== 'dificil' && sim.status === 'flying' && !sim.engineOut && out.throttle > 0.02 && out.throttle < 0.98 ? out.throttle : null;
    if (level !== 'dificil' && sim.mode === 'manual' && out.betaTarget != null && !sim.engineOut) ctx.recommendBetaDeg = out.betaTarget / DEG;
    this.recommendRad = ctx.recommendBetaDeg != null && sim.status === 'flying' ? ctx.recommendBetaDeg * DEG : null;
    if (level !== 'dificil') {
      if (empty) { ctx.pulseSep = true; }
      if (sim.fairing && sim.altitude > 70000 && sim.aero().q < 100) ctx.pulseFairing = true;
      if (circular && sim.throttle > 0.02 && !transfer) ctx.pulseFinish = true;
      if (circular && transfer && !tr) ctx.pulseTransfer = false;
      if (ctx.canFinish && !transfer && (sim.orbitReached && circular)) ctx.pulseFinish = true;
    }
    if (level === 'facil') {
      const diffDeg = ctx.recommendBetaDeg != null ? ctx.recommendBetaDeg - sim.beta / DEG : 0;
      if (empty) msg = simText("flight.separate-the-stage-now-space-bar");
      else if (ctx.pulseFairing) msg = simText("flight.release-the-fairing-the-air-is-thin-enough");
      else if (tr?.active) msg = simText("flight.transfer-burn-in-progress-wait-for-the-maneuver");
      else if (ctx.canTransfer && transfer) {
        const w = transferWindow(sim);
        msg = w && w.waitS <= w.burnS / 2 + 4 ? simText("flight.now-select-start-transfer-burn") : simText("flight.transfer-window-in-0-skip-ahead-and-wait", mmss(w?.waitS ?? 0));
        ctx.pulseTransfer = Boolean(w && w.waitS <= w.burnS / 2 + 4);
      } else if (ctx.canFinish && transfer && tr && !tr.active) msg = simText("flight.transfer-complete-select-finish-flight");
      else if (phase === 'coast' && sim.throttle > 0.02) msg = simText("flight.cut-the-engines-x-your-highest-point-has", Math.round(tAlt / 1000));
      else if (phase === 'coast') msg = simText("flight.coast-to-the-highest-point-select-skip-ahead");
      else if (phase === 'circ' && !circular) msg = sim.mode === 'prograde' ? simText("flight.press-r-to-turn-off-prograde-lock-then") : simText("flight.apply-thrust-0-and-follow-the-yellow-arrow", out.throttle < 0.98 ? simText("flight.at-0-the-suggested-mark", Math.round(out.throttle * 100)) : simText("flight.at-100"));
      else if (circular && sim.throttle > 0.02) msg = simText("flight.your-orbit-is-circular-cut-the-engines-x");
      else if (circular) msg = simText("flight.orbit-reached-select-finish-flight");
      else if (phase === 'ascent' && ctx.recommendBetaDeg != null) {
        if (sim.altitude < 1500) msg = simText("flight.keep-climbing-vertically-for-a-few-seconds-the");
        else if (Math.abs(diffDeg) > 3) msg = simText("flight.tilt-0-to-the-1-now", Math.round(Math.abs(diffDeg)), diffDeg > 0 ? simText("flight.right-2") : simText("flight.left-2"));
        else msg = simText("flight.great-hold-that-angle");
      }
    } else if (level === 'normal') {
      if (empty) msg = simText("flight.a-stage-ran-out-of-fuel");
      else if (phase === 'coast' && sim.throttle > 0.02) msg = simText("flight.your-highest-point-has-reached-the-target-altitude");
      else if (circular) msg = simText("flight.your-orbit-is-circular-cut-the-engines-and");
    }
    if (warnings.length) { [msg, kind] = warnings[0]; }
    // si hay un aviso reciente de la simulación, se deja unos segundos
    if (this.noticeUntil && performance.now() < this.noticeUntil && !warnings.length) { /* no pisar el aviso */ } else if (msg !== undefined && !this.ignition) hud.message(msg ?? '', msg ? (kind === 'hint' ? 'hint' : kind) : 'info');
    if (this.ignition) { ctx.phase = 'pad'; }
    hud.update(sim, ctx);
  }

  /** Pistas, botones y lecturas de la misión lunar (después de llegar a la órbita de espera). */
  updateLunarHints(followThrottle) {
    const sim = this.sim; const hud = this.hud; const level = this.diffLevel;
    const m = sim.mission;
    const plan = this.plan ?? lunarPlan(sim, this.guide);
    const flying = sim.status === 'flying';
    const burning = Boolean(sim.burn && !sim.burn.done);
    const auto = hud.controls.autopilot;
    const inSpace = sim.body === 'moon' || sim.altitude > PHYS.ATM_TOP;
    const reentry = sim.stats.entryT != null || (m.left && sim.body === 'earth' && sim.altitude < 600000) || sim.capsuleOnly;
    const service = Boolean(sim.currentStage?.service);
    const emptyStage = sim.engineOut && sim.stage < sim.stageCount - 1;
    const ctx = {
      followThrottle, phase: this.phase,
      canProgradeMode: flying && !sim.capsuleOnly && inSpace,
      canJump: flying && inSpace && sim.throttle < 0.01 && !burning && this.jumpEta > WARP_LEAD + 4,
      canWarpHigh: flying && (sim.body === 'moon' || sim.altitude > 150000) && sim.throttle < 0.01 && !burning,
      canFinish: flying && !reentry && ((sim.capsuleOnly && (sim.body !== 'earth' || sim.elements.periAlt > PHYS.ATM_TOP)) || (sim.engineOut && sim.stage >= sim.stageCount - 1 && !sim.capsuleOnly)),
      canChute: flying && sim.capsuleOnly && !sim.chute && sim.body === 'earth' && sim.altitude < 40000,
      reentry, maneuver: null, readout: null, recommendBetaDeg: null, suggestThrottle: null,
    };
    this.recommendRad = null;
    const ph = sim.landing ? 'landed' : plan.phase; const act = sim.landing ? 'done' : plan.action;
    const hints = level !== 'dificil';

    // --- botón de maniobra
    if (flying && !sim.capsuleOnly && !auto) {
      if (burning) ctx.maneuver = { label: simText("lunarFlight.stop-maneuver"), ready: true, active: true };
      else if (ph === 'parking') ctx.maneuver = { label: simText("lunarFlight.go-to-the-moon"), ready: act === 'tli', pulse: hints && act === 'tli' };
      else if (ph === 'toMoon' && plan.check && !plan.check.fine && act !== 'sepUpper') ctx.maneuver = { label: simText("lunarFlight.correct-course"), ready: true, pulse: hints && act === 'mcc' };
      else if (ph === 'approach') ctx.maneuver = { label: simText("lunarFlight.brake-at-the-moon"), ready: act === 'loi', pulse: hints && act === 'loi' };
      else if (ph === 'lunarOrbit') ctx.maneuver = { label: simText("lunarFlight.return-to-earth"), ready: act === 'tei', pulse: hints && act === 'tei' };
      else if ((ph === 'toEarth' || ph === 'departing') && plan.check && !plan.check.fine) ctx.maneuver = { label: simText("lunarFlight.correct-course"), ready: true, pulse: hints && act === 'mcc' };
    }

    // --- lectura: lo que la trayectoria promete ahora mismo
    const passRead = (km) => {
      if (km == null) return { label: simText("lunarFlight.lunar-approach"), value: simText("lunarFlight.no-encounter"), kind: 'bad', goal: 'ideal: 110 km' };
      const alt = Math.abs(km);
      if (km < 0 && alt < 1) return { label: simText("lunarFlight.lunar-approach"), value: 'choca', kind: 'bad', goal: 'ideal: 110 km' };
      const kind = km >= LUNAR.PERI_MIN / 1000 && km <= LUNAR.PERI_MAX / 1000 ? (Math.abs(km - 110) < 40 ? 'good' : 'warn') : 'bad';
      return { label: simText("lunarFlight.lunar-approach"), value: km < 0 ? simText("lunarFlight.0-km-far-side-approach", Math.round(alt).toLocaleString('es')) : `${Math.round(km).toLocaleString('es')} km`, kind, goal: 'ideal: 110 km' };
    };
    const periRead = (km) => {
      if (km == null) return { label: simText("lunarFlight.lowest-point-on-return"), value: simText("lunarFlight.no-return"), kind: 'bad', goal: 'ideal: 60 km' };
      const kind = km >= LUNAR.ENTRY_MIN / 1000 && km <= LUNAR.ENTRY_MAX / 1000 ? (Math.abs(km - 60) <= 5 ? 'good' : 'warn') : 'bad';
      return { label: simText("lunarFlight.lowest-point-on-return"), value: km < -5000 ? simText("lunarFlight.overshoot") : `${Math.round(km).toLocaleString('es')} km`, kind, goal: 'ideal: 60 km' };
    };
    const r = this.burnReadout;
    if (burning && r) {
      if ('passKm' in r) ctx.readout = passRead(r.passKm);
      else if ('perigeeKm' in r) ctx.readout = periRead(r.perigeeKm);
      else if ('periKm' in r) ctx.readout = { label: simText("lunarFlight.lunar-orbit"), value: r.apoKm == null ? simText("lunarFlight.0-km-unbound", Math.round(r.periKm)) : `${Math.round(r.periKm)} × ${Math.round(r.apoKm).toLocaleString('es')} km`, kind: r.apoKm != null && r.apoKm - r.periKm < 80 ? 'good' : 'warn', goal: 'redonda' };
    } else if (plan.check && flying) ctx.readout = plan.check.goal === 'moon' ? passRead(plan.check.value == null ? null : plan.check.value / 1000) : periRead(plan.check.value == null ? null : plan.check.value / 1000);
    else if (ph === 'approach' && plan.window) ctx.readout = { label: simText("lunarFlight.lowest-point-above-the-moon"), value: plan.window.periAlt < 0 ? 'choca' : kmTxt(plan.window.periAlt), kind: plan.window.periAlt > LUNAR.PERI_MIN ? 'good' : 'bad', goal: `en ${fmtDur(plan.window.eta)}` };
    if (ctx.readout) ctx.readout.text = `${ctx.readout.label}|${ctx.readout.value}|${ctx.readout.goal ?? ''}|${ctx.readout.kind ?? ''}`;

    // --- mensajes
    let msg = null; let kind = 'hint';
    const warn = [];
    if (emptyStage && flying) { ctx.pulseSep = hints; warn.push([simText("lunarFlight.this-stage-is-out-of-fuel-separate-it"), 'warn']); }
    if (act === 'entry' && !sim.capsuleOnly) { ctx.pulseSep = true; warn.push([simText("lunarFlight.release-the-service-module-now-space-the-heat"), 'bad']); }
    if (sim.capsuleOnly && sim.gNow > (sim.craft.gLimit ?? 9)) warn.push([simText("lunarFlight.high-deceleration-0-g", sim.gNow.toFixed(1)), 'warn']);
    if (ph === 'approach' && plan.window && plan.window.periAlt < LUNAR.PERI_MIN / 2 && !burning) warn.push([simText("lunarFlight.the-trajectory-passes-dangerously-close-to-or-into"), 'bad']);
    if (auto) msg = ph === 'landed' ? null : simText("lunarFlight.autopilot-0", LUNAR_PHASE_LABEL[ph].toLowerCase());
    else if (burning) {
      msg = { tli: simText("lunarFlight.translunar-injection-the-engines-burn-until-the-trajectory"), loi: simText("lunarFlight.braking-to-reach-lunar-orbit-the-engines-shut"), tei: simText("lunarFlight.return-burn-the-engines-run-until-the-trajectory"), mcc: simText("lunarFlight.correcting-course-with-short-burns") }[sim.burn.kind];
      kind = 'info';
    } else if (hints) {
      const jump = simText("lunarFlight.select-skip-ahead-to-reach-that-point");
      switch (act) {
        case 'fairing': ctx.pulseFairing = true; msg = simText("lunarFlight.release-the-fairing-f-the-spacecraft-is-already"); break;
        case 'waitTli': msg = simText("lunarFlight.you-are-in-parking-orbit-the-lunar-transfer", fmtDur(plan.eta), jump); break;
        case 'tli': msg = simText("lunarFlight.the-window-is-open-select-go-to-the"); break;
        case 'sepUpper': ctx.pulseSep = true; msg = simText("lunarFlight.the-upper-stage-is-finished-separate-it-space"); break;
        case 'mcc': msg = plan.goal === 'moon' ? simText("lunarFlight.the-trajectory-is-slightly-off-target-select-correct") : simText("lunarFlight.the-return-trajectory-needs-an-adjustment-select-correct"); break;
        case 'waitLoi': msg = simText("lunarFlight.you-will-pass-0-above-the-moon-brake", kmTxt(plan.window.periAlt), fmtDur(plan.eta), jump); break;
        case 'loi': msg = plan.late ? simText("lunarFlight.you-passed-the-lowest-point-select-brake-at") : simText("lunarFlight.now-select-brake-at-the-moon-to-enter"); break;
        case 'waitTei': msg = simText("lunarFlight.you-are-in-lunar-orbit-zoom-out-to", fmtDur(plan.eta), jump); break;
        case 'tei': msg = simText("lunarFlight.the-return-window-is-open-select-return-to"); break;
        case 'sepService': ctx.pulseSep = true; msg = simText("lunarFlight.release-the-service-module-space-the-capsule-enters"); break;
        case 'entry': msg = sim.stats.entryT != null ? simText("lunarFlight.the-heat-shield-protects-the-capsule-as-the") : simText("lunarFlight.the-capsule-is-falling-toward-the-atmosphere-wait"); kind = 'info'; break;
        case 'chute': ctx.pulseChute = true; msg = simText("lunarFlight.deploy-the-parachutes-c-2"); break;
        case 'descent': msg = sim.chute?.torn ? simText("lunarFlight.the-parachutes-tore") : simText("lunarFlight.parachutes-deployed-the-capsule-is-descending-toward-the"); kind = 'info'; break;
        case 'coast':
          if (ph === 'toMoon') msg = plan.pred?.encounter ? simText("lunarFlight.heading-for-the-moon-you-enter-its-sphere", fmtDur(plan.pred.encounter.t - sim.t), jump) : simText("lunarFlight.your-trajectory-does-not-encounter-the-moon");
          else if (ph === 'departing') msg = simText("lunarFlight.leaving-the-moon-s-sphere-of-influence-0", fmtDur(plan.eta), jump);
          else if (ph === 'toEarth') msg = plan.pred?.entry ? simText("lunarFlight.heading-home-reentry-is-in-0-1", fmtDur(plan.pred.entry.t - sim.t), jump) : simText("lunarFlight.your-trajectory-misses-earth-s-atmosphere-correct-course");
          kind = 'info'; break;
        default: break;
      }
    } else if (act === 'chute') ctx.pulseChute = false;
    if (level === 'dificil' && !burning && !auto) {
      // sin pistas paso a paso: sólo se avisa qué fase es y los datos (la lectura de arriba sigue visible)
      if (act === 'waitTli' || act === 'tli') msg = act === 'tli' ? simText("lunarFlight.the-translunar-window-is-open") : simText("lunarFlight.translunar-window-in-0", fmtDur(plan.eta));
      else if (act === 'waitLoi' || act === 'loi') msg = act === 'loi' ? simText("lunarFlight.braking-point") : simText("lunarFlight.lowest-point-in-0", fmtDur(plan.eta));
      else if (act === 'waitTei' || act === 'tei') msg = act === 'tei' ? simText("lunarFlight.the-return-window-is-open") : simText("lunarFlight.return-window-in-0", fmtDur(plan.eta));
      kind = 'info';
    }
    if (warn.length) [msg, kind] = warn[0];
    if (!(this.noticeUntil && performance.now() < this.noticeUntil && !warn.length)) hud.message(msg ?? '', msg ? kind : 'info');
    hud.setPhaseLabel(LUNAR_PHASE_LABEL[ph] ?? '');
    if (app.lunarView) { app.lunarView.plan = plan; app.lunarView.readout = ctx.readout; }
    hud.update(sim, ctx);
  }

  // ------------------------------------------------------------------ dibujo

  drawFrame(dt) {
    if (this.mapOpen) return;
    const sim = this.sim;
    const view = this.view;
    const W = view.viewW; const H = view.viewH;
    const onMoon = sim.body === 'moon';
    const alt = Math.max(0, onMoon ? sim.bodyAltitude : sim.altitude);
    // la cámara sigue con suavidad: escala por altura real, y un pequeño retraso al acelerar fuerte
    this.accelSmooth += (thrustAccelG(sim) - this.accelSmooth) * (1 - Math.exp(-dt * 4));
    this.cam.update(alt, this.accelSmooth, dt);
    const mpp = this.cam.mpp;
    // "arriba" en pantalla = la vertical local del cuerpo que manda. Al cambiar de cuerpo (entrar o salir de la zona
    // de la Luna) la vista gira con suavidad en vez de saltar.
    const [ux0, uy0] = this.upVec();
    const upTarget = Math.atan2(uy0, ux0);
    if (sim.body !== this.camBody) { this.upOffset = wrapPi((this.lastUp ?? upTarget) - upTarget); this.upBlendT = 0; this.camBody = sim.body; }
    this.upBlendT += dt;
    const blend = this.upBlendT < 2.5 ? 1 - smooth(0, 2.5, this.upBlendT) : 0;
    const up = upTarget + this.upOffset * blend;
    this.lastUp = up;
    const ux = Math.cos(up); const uy = Math.sin(up);
    const [ax, ay] = sim.attitude();
    const betaShown = Math.atan2(ax * uy - ay * ux, ax * ux + ay * uy);
    const groundS = this.groundS();

    // velocidad respecto al aire, para las rayas de velocidad (sólo donde hay aire)
    const [rvx, rvy] = sim.relVelocity();
    const east = rvx * uy - rvy * ux; const upV = rvx * ux + rvy * uy;
    const k = (this.paused || sim.status !== 'flying' || onMoon ? 0 : PHYS.COMPRESSION * Math.min(this.warp, 5)) / mpp;
    const flowX = -east * k; const flowY = upV * k;
    this.flow.px = (this.flow.px + flowX * dt) % 4096; this.flow.py = (this.flow.py + flowY * dt) % 4096;
    const q = sim.lastQ;

    const throttle = this.ignition ? this.spool : sim.status === 'flying' ? sim.throttle * (sim.engineOut ? 0 : 1) : 0;
    const far = this.lunar && Math.abs(groundS) > 80000; // lejos de la plataforma (al volver): otro paisaje y otro clima
    const R = onMoon ? MOON.R : PHYS.RE;
    const S = {
      time: performance.now() / 1000,
      reduced: this.reduced,
      body: sim.body,
      alt, mpp, baseY: this.anchorFor(alt, mpp, H, R, dt) - this.cam.lag, groundS,
      starShift: (Math.PI / 2 - up) * 600,
      stage: Math.min(sim.stage, this.vehicle.stages.length), fairing: sim.fairing,
      throttle, engineOn: Boolean(this.ignition) || (sim.status === 'flying' && !sim.engineOut),
      betaShown, flicker: Math.random(), airFade: onMoon ? 0 : pressureRatio(alt),
      weather: far || sim.t > 6 * 3600 ? null : this.weather, windE: this.weather ? windEastMs(this.weather) * (performance.now() / 1000 - this.t0) : 0,
      hideRocket: this.exploded, focus: this.cam.focusT < Infinity, zoomOut: this.cam.zoomOut,
      debris: this.debris, particles: this.particles, rx: sim.x, ry: sim.y,
      flowX, flowY, flowPhaseX: this.flow.px, flowPhaseY: this.flow.py,
      streakAlpha: clamp(q / 2500, 0, 1) * smooth(20, 90, Math.hypot(flowX, flowY)),
      prograde: null, recommend: this.recommendRad ?? null,
    };
    if (this.spaceFrame) { S.pE = 0; S.pU = 0; }
    if (this.lunar) this.lunarDrawState(S, sim, up, far, dt);
    // marca de "hacia dónde vas", respecto al cuerpo que manda
    const qv = onMoon ? sim.rel() : sim;
    const vr = qv.vx * ux + qv.vy * uy; const vt = qv.vx * uy - qv.vy * ux;
    if (sim.status === 'flying' && Math.hypot(vr, vt) > 60 && !this.exploded && !sim.capsuleOnly) S.prograde = Math.atan2(vt, vr);
    this.renderer.flameFrame = Math.floor(S.time * 14);
    const ctx = view.ctx;
    this.renderer.draw(ctx, view.W, view.H, shiftState(S, view.margin));
    const [ox, oy] = this.reduced ? [0, 0] : this.cam.shakeOffset();
    view.present(ox, oy);
  }

  /**
   * Altura en pantalla de la base de la nave. La cápsula que vuelve se dibuja un poco más arriba que el cohete al
   * despegar, para que el mar se vea llegar desde abajo durante todo el descenso (el cambio es suave).
   */
  anchorFor(alt, mpp, H, R, dt) {
    const normal = anchorY(alt, mpp, H, R);
    const want = this.sim.capsuleOnly && this.sim.body === 'earth' && this.sim.stats.entryT != null ? 1 : 0;
    this.landBlend = (this.landBlend ?? 0) + (want - (this.landBlend ?? 0)) * (1 - Math.exp(-dt * 1.5));
    return normal + (H * 0.56 - normal) * this.landBlend * (alt < 60000 ? 1 : 0);
  }

  /** ¿Lo que hay bajo la nave es mar? (se mira en el mismo globo que se dibuja; cerca de la plataforma, al este hay mar) */
  onWater() {
    const gs = this.groundS();
    if (Math.abs(gs) <= 80000) return gs > 250;
    const globe = this.renderer.globe;
    return (globeSample(0, 0.9995, -gs / PHYS.RE - globe.siteAngle, globe.lon0) & 7) === 0;
  }

  /** Datos de dibujo propios de la misión lunar: la Luna y la Tierra a lo lejos, la cápsula, el calor y el mar. */
  lunarDrawState(S, sim, up, far, dt) {
    const onMoon = sim.body === 'moon';
    const ms = moonState(sim.moon, sim.t, {});
    const toEarth = moonAngle(sim.moon, sim.t) + Math.PI; // dirección Luna → Tierra: hacia ahí mira la cara visible
    const moonRotFor = (upAngle) => upAngle - toEarth - Math.PI / 2;
    S.skyBodies = [];
    if (onMoon) {
      S.moonRot = moonRotFor(up);
      // la Tierra, pequeña y azul, en la dirección en que está de verdad
      const w = Math.atan2(-sim.y, -sim.x);
      S.skyBodies.push({ kind: 'earth', ang: up - w, r: clamp((EARTH.R / sim.r) * 300, 4, 9), rot: sim.atmRate * sim.t });
    } else if (sim.altitude > 120000) {
      const dx = ms.x - sim.x; const dy = ms.y - sim.y; const d = Math.hypot(dx, dy);
      const w = Math.atan2(dy, dx);
      S.skyBodies.push({ kind: 'moon', ang: up - w, r: clamp((MOON.R / d) * 300, 2.5, 13), rot: moonRotFor(up) });
    }
    // lejos de la plataforma, el suelo es lo que haya ahí de verdad (se mira en el mismo globo que se dibuja)
    S.far = far;
    if (far) {
      const rot = -S.groundS / PHYS.RE - this.renderer.globe.siteAngle;
      S.farKind = globeSample(0, 0.9995, rot, this.renderer.globe.lon0) & 7;
      S.shipE = 170 + (sim.landing ? Math.max(0, 60 - this.endTimer * 12) : 60);
    }
    // la nave
    const chute = sim.chuteState;
    const dtc = sim.chute ? sim.t - sim.chute.t0 : 0;
    const hot = sim.stats.entryT != null && sim.altitude < PHYS.ATM_TOP && !sim.landing;
    S.craft = {
      capsuleOnly: sim.capsuleOnly, chute, drogueOpen: clamp(dtc / 2, 0, 1), chuteOpen: clamp((dtc - PHYS.CHUTE_DROGUE_S) / PHYS.CHUTE_OPEN_S, 0, 1),
      heat: hot ? clamp(sim.heat.flux / 9e5, 0, 1) : 0, landed: Boolean(sim.landing),
    };
    // al quedar sola, la nave "se acerca": pasa del tamaño que tenía sobre el cohete a su dibujo detallado
    const alone = sim.stage >= (this.vehicle.rocketStages ?? Infinity);
    if (alone && this.craftT == null) this.craftT = 0;
    if (this.craftT != null && this.craftT < 2) {
      this.craftT += dt;
      const e = smooth(0, 1.8, this.craftT);
      S.craftScale = 0.5 + 0.5 * e;
      S.craftLift = (this.dims.total + this.dims.bell - this.dims.fairingH) * (1 - e);
    }
  }
}

/** El lienzo tiene un margen para la sacudida: se corre el dibujo para que (0,0) sea la esquina del margen. */
function shiftState(S, margin) {
  return { ...S, baseY: S.baseY + margin, shiftX: margin };
}
