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
import { pauseGameplayMusic, playEffect, resumeGameplayMusic, setThruster, startRocketAudio, updateRocketAltitude, pauseRocketAudio, stopRocketAudio, setSimulationMusicDucked } from '../../../../src/welcome/core/gameAudio.js';
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
  if (s >= 2 * 86400) return `${(s / 86400).toLocaleString('es', { maximumFractionDigits: 1 })} días`;
  if (s >= 2 * 3600) return `${Math.round(s / 3600)} horas`;
  if (s >= 120) return `${Math.round(s / 60)} minutos`;
  return `${Math.max(0, Math.round(s))} segundos`;
};
const kmTxt = (m) => `${Math.round(m / 1000).toLocaleString('es')} km`;
const MILESTONES = [
  ['tli', '¡RUMBO A LA LUNA!', 'ok'], ['soi', 'ZONA DE INFLUENCIA DE LA LUNA', 'ok'], ['lunarOrbit', '¡ÓRBITA LUNAR!', 'ok'],
  ['tei', '¡RUMBO A CASA!', 'ok'], ['left', 'DE VUELTA CON LA TIERRA', 'info'], ['entry', 'REENTRADA', 'warn'], ['landed', null, 'ok'],
];

const EVENT_TEXT = {
  liftoff: ['¡DESPEGUE!', 'ok'],
  atmosphere: ['TORRE LIBRE · VUELO ATMOSFÉRICO', 'info'],
  upper: ['ATMÓSFERA SUPERIOR', 'info'],
  space: ['ESPACIO · SIN AIRE', 'ok'],
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
    this.sim = sim;
    this.vehicle = sim.vehicle;
    this.dims = rocketDims(this.vehicle);
    this.diffLevel = inputs().difficulty;
    this.destKind = DEST[sim.destId].kind;
    this.ap = newAutopilot({ ...(app.reference?.program ?? app.vehicleInfo.program), waitWindow: true });
    this.shadow = newAutopilot(app.reference?.program ?? app.vehicleInfo.program);
    this.warp = 1;
    this.autoWarp = null;
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
      autopilot: (on) => { app.autopilotUsed = app.autopilotUsed || on; if (on) toast('Piloto automático encendido. Puedes apagarlo cuando quieras.', 'info'); },
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
    this.begin();
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
    this.hud.message('Encendido de motores… el cohete sigue sujeto a la plataforma.', 'info');
    this.hud.event('ENCENDIDO', 'info');
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
      ov.innerHTML = `<div class="tutorial" role="dialog" aria-label="Pausa"><span class="kicker">PAUSA</span><h2>Vuelo en pausa</h2><p>Tu cohete espera. Los motores y el tiempo están congelados.</p>
        <div class="actions"><button id="p-exit">Volver al centro de control</button>${this.lunar && this.sim.mission.leo && this.sim.status === 'flying' ? '<button id="p-end" title="Termina el vuelo donde está la nave ahora y muestra el resultado">Terminar la misión aquí</button>' : ''}<button class="primary big" id="p-resume">▶ Seguir volando</button></div></div>`;
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
      this.hud.event(this.vehicle.stages[sep.index]?.service ? 'MÓDULO DE SERVICIO SEPARADO' : `ETAPA ${sep.index + 1} SEPARADA`, 'ok');
    } else {
      for (const side of [-1, 1]) this.debris.push(make(fairingSprite(this.vehicle, side), { side, lateral: side * (this.dims.hw / 2 + 0.5) }));
      this.cam.kick(0.25);
      if (this.sim.altitude > 1500) this.cam.kickFocus(4);
      this.hud.event('COFIA SOLTADA', 'ok');
    }
    while (this.debris.length > MAX_DEBRIS) this.debris.shift();
    // destello y gases en el punto de separación
    const g = this.groundFrame();
    const aE = ax * this.uy() - ay * this.ux(); const aU = ax * this.ux() + ay * this.uy();
    this.particles.separation({ x: g.E, y: g.U, vx: g.vE, vy: g.vU, axis: { x: aE, y: aU }, strength: sep.kind === 'stage' ? 1 : 0.6 });
  }

  doJump() {
    if (this.sim.status !== 'flying' || this.sim.throttle > 0.01) { this.hud.message('Apaga el motor para saltar en el tiempo.', 'warn'); return; }
    if (this.lunar && this.sim.mission.leo) {
      if (!(this.jumpEta > WARP_LEAD + 4)) { toast('No hay nada que esperar: es momento de actuar.', 'info'); return; }
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
    updateRocketAltitude(sim.altitude);
    pauseRocketAudio(this.paused || this.ended || sim.status === 'ended');
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
      this.hud.message('Motores al máximo. El cohete se suelta cuando el empuje supere su peso.', 'ok');
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
      if (c.done) { hud.toggleAuto(false); this.hud.message('El piloto automático terminó. ¡Revisa tu órbita y pulsa «Terminar vuelo»!', 'ok'); }
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
    if (!this.maxQAnnounced && sim.stats.entryT == null && q > 8000 && q < sim.stats.maxQ * 0.9) { this.maxQAnnounced = true; this.hud.event('MAX-Q SUPERADO', 'ok'); }
    if (sim.orbitReached && !this.orbitAnnounced) { this.orbitAnnounced = true; this.hud.event('¡ÓRBITA!', 'ok'); }
    if (sim.mission) {
      for (const [key, text, kind] of MILESTONES) if (sim.mission[key] && !this.seenMilestone[key]) { this.seenMilestone[key] = true; this.hud.event(text ?? (this.onWater() ? '¡AMERIZAJE!' : '¡ATERRIZAJE!'), kind); if (!this.reduced && key !== 'left') this.cam.kick(0.3); }
      if (sim.chute && !this.seenMilestone.chute) { this.seenMilestone.chute = true; this.hud.event(sim.chute.torn ? 'PARACAÍDAS ROTOS' : 'PARACAÍDAS ABIERTOS', sim.chute.torn ? 'bad' : 'ok'); if (!this.reduced) this.cam.kick(0.5); }
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
      if (horizon <= WARP_LEAD) { this.warp = 1; hud.setWarp(1); phys = dt * PHYS.COMPRESSION; toast('Tiempo normal: se acerca un momento importante.', 'info'); } else phys = Math.min(phys, horizon - WARP_LEAD);
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
    if (this.hud.controls.autopilot) { toast('El piloto automático está al mando. Apágalo (P) para maniobrar tú.', 'info'); return; }
    if (sim.burn && !sim.burn.done) { this.cancelBurn(); toast('Maniobra detenida.', 'info'); return; }
    const plan = lunarPlan(sim, this.guide);
    if (sim.capsuleOnly) return;
    if (sim.engineOut) { toast(sim.stage < sim.stageCount - 1 ? 'Esta etapa no tiene combustible: sepárala (Espacio) y vuelve a intentarlo.' : 'El módulo de servicio se quedó sin combustible.', 'warn'); return; }
    let kind = null; let extra = {};
    const wait = (what) => toast(`Todavía no: ${what} en ${fmtDur(plan.eta)}. Pulsa ⏩ Saltar para ir a ese momento.`, 'info');
    switch (plan.phase) {
      case 'parking':
        if (sim.fairing) sim.dropFairing();
        if (plan.window && !plan.window.open) { wait('la ventana para ir a la Luna se abre'); return; }
        kind = 'tli'; break;
      case 'toMoon': kind = 'mcc'; extra = { goal: 'moon' }; break;
      case 'approach':
        if (plan.action === 'waitLoi' && plan.eta > 45) { wait('hay que frenar al pasar por el punto más bajo,'); return; }
        kind = 'loi'; break;
      case 'lunarOrbit':
        if (plan.action === 'waitTei' && plan.eta > 20) { wait('la ventana de regreso se abre'); return; }
        kind = 'tei'; break;
      case 'departing': case 'toEarth': kind = 'mcc'; extra = { goal: 'earth' }; break;
      default: return;
    }
    startBurn(sim, kind, extra);
    this.autoWarp = null; this.warp = 1; this.hud.setWarp(1);
    this.hud.event({ tli: 'INYECCIÓN TRANSLUNAR', loi: 'FRENADO EN LA LUNA', tei: 'INYECCIÓN DE REGRESO', mcc: 'CORRECCIÓN DE RUMBO' }[kind], 'info');
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
      tli: { ok: '¡Inyección translunar lista! La trayectoria ya pasa junto a la Luna.', low: 'Inyección hecha, pero la trayectoria pasa demasiado cerca de la Luna: habrá que corregir el rumbo.', noEncounter: 'El encendido terminó, pero la trayectoria no se encuentra con la Luna: se encendió fuera de la ventana.' },
      loi: { ok: '¡Frenado completo! Estás en órbita lunar.', empty: 'Se acabó el combustible antes de terminar el frenado.', left: 'La nave salió de la zona de la Luna antes de frenar.' },
      tei: { ok: '¡Inyección de regreso lista! La trayectoria cae hacia la Tierra.', over: 'Te pasaste un poco: habrá que corregir el rumbo de vuelta.', empty: 'Se acabó el combustible durante la inyección de regreso.' },
      mcc: { ok: 'Rumbo corregido.', empty: 'Se acabó el combustible durante la corrección.', lost: 'No se encontró una corrección que sirva desde aquí.' },
    }[b.kind]?.[b.result] ?? 'Maniobra terminada.';
    this.hud.message(msg, b.result === 'ok' ? 'ok' : 'warn');
    this.noticeUntil = performance.now() + 5000;
    this.hud.setAttitude('prograde'); // queda mirando hacia adelante
  }

  doChute() {
    if (this.paused || this.sim.status !== 'flying') return;
    const r = this.sim.deployChute();
    if (r === 'attached') toast('Primero suelta el módulo de servicio: los paracaídas están en la punta de la cápsula.', 'warn');
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
    const bad = wasDestroyed(sim);
    if (bad) {
      this.explode();
      this.hud.message(sim.log.at(-1)?.text ?? 'El cohete se perdió.', 'bad');
    } else if (sim.landing) {
      // amerizaje: salpicadura y la cápsula flotando mientras llega el barco
      if (!this.spaceFrame && this.onWater()) this.particles.splash({ x: this.groundS(), y: 0, n: this.reduced ? 14 : 46 });
      if (!this.reduced) this.cam.kick(0.5);
      playEffect('rocket-land');
      this.hud.message(`${this.onWater() ? '¡Amerizaje' : '¡Aterrizaje'} a ${sim.landing.speed.toFixed(1)} m/s! La tripulación está de vuelta en casa.`, 'ok');
    } else this.hud.message(sim.orbitReached ? '¡Vuelo terminado! Vamos a ver cómo te fue…' : 'Vuelo terminado.', 'ok');
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
    if (sim.lastQ > PHYS.Q_LIMIT) warnings.push(['¡Demasiada presión del aire! Baja el empuje ya.', 'bad']);
    else if (sim.lastQ > PHYS.Q_WARN) warnings.push(['Mucha presión del aire (Max-Q): baja un poco el empuje.', 'warn']);
    if (lastEmpty && !sim.orbitReached && sim.status === 'flying') warnings.push(['Te quedaste sin combustible y todavía no estás en órbita.', 'bad']);
    // en la plataforma con poco empuje: el cohete pesa más de lo que empuja
    if (sim.status === 'flying' && sim.grounded && !this.ignition) {
      const twNow = sim.thrustToWeight(Math.max(hud.controls.throttle, sim.throttle * 0.999));
      if (hud.controls.throttle > 0.02 && twNow < 1) warnings.push([`El empuje (${twNow.toFixed(2)} veces su peso) no alcanza: ¡sube la palanca de empuje para despegar!`, 'warn']);
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
      if (empty) msg = '¡Ahora separa la etapa! (barra espaciadora)';
      else if (ctx.pulseFairing) msg = '¡Suelta la cofia (📦)! Ya casi no hay aire.';
      else if (tr?.active) msg = 'Transferencia en marcha: el cohete sigue su camino. Espera a que termine.';
      else if (ctx.canTransfer && transfer) {
        const w = transferWindow(sim);
        msg = w && w.waitS <= w.burnS / 2 + 4 ? '¡AHORA! Pulsa «Encender transferencia».' : `Ventana de transferencia en ${mmss(w?.waitS ?? 0)}. Pulsa ⏩ Saltar y espera la marca.`;
        ctx.pulseTransfer = Boolean(w && w.waitS <= w.burnS / 2 + 4);
      } else if (ctx.canFinish && transfer && tr && !tr.active) msg = '¡Transferencia lista! Pulsa «Terminar vuelo».';
      else if (phase === 'coast' && sim.throttle > 0.02) msg = `¡Apaga el motor (X)! Tu punto más alto ya llegó a ${Math.round(tAlt / 1000)} km.`;
      else if (phase === 'coast') msg = 'Deja que suba solo hasta el punto más alto. Pulsa ⏩ Saltar para ir más rápido.';
      else if (phase === 'circ' && !circular) msg = sim.mode === 'prograde' ? 'Pulsa 🧭 (R) para soltar «Mirar adelante» y sigue la flecha amarilla.' : `¡Ahora empuja${out.throttle < 0.98 ? ` con ${Math.round(out.throttle * 100)} % de fuerza (la marca «sugerido»)` : ' al 100 %'} siguiendo la flecha amarilla! Yo te aviso cuando la órbita quede redonda.`;
      else if (circular && sim.throttle > 0.02) msg = '¡Órbita redonda! Apaga el motor (X) y pulsa «Terminar vuelo».';
      else if (circular) msg = '¡Órbita lograda! Pulsa «Terminar vuelo».';
      else if (phase === 'ascent' && ctx.recommendBetaDeg != null) {
        if (sim.altitude < 1500) msg = 'Sube derecho unos segundos. Pronto te diré cuándo inclinar.';
        else if (Math.abs(diffDeg) > 3) msg = `¡Ahora inclina ${Math.round(Math.abs(diffDeg))}° a la ${diffDeg > 0 ? 'derecha' : 'izquierda'}!`;
        else msg = 'Vas muy bien: mantén ese ángulo.';
      }
    } else if (level === 'normal') {
      if (empty) msg = 'Una etapa se quedó sin combustible.';
      else if (phase === 'coast' && sim.throttle > 0.02) msg = 'Tu punto más alto ya llegó a la altura pedida: puedes apagar el motor.';
      else if (circular) msg = '¡Tu órbita es redonda! Apaga el motor y termina el vuelo.';
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
      if (burning) ctx.maneuver = { label: '■ Detener maniobra', ready: true, active: true };
      else if (ph === 'parking') ctx.maneuver = { label: '🚀 Ir a la Luna', ready: act === 'tli', pulse: hints && act === 'tli' };
      else if (ph === 'toMoon' && plan.check && !plan.check.fine && act !== 'sepUpper') ctx.maneuver = { label: '🎯 Corregir rumbo', ready: true, pulse: hints && act === 'mcc' };
      else if (ph === 'approach') ctx.maneuver = { label: '🛑 Frenar en la Luna', ready: act === 'loi', pulse: hints && act === 'loi' };
      else if (ph === 'lunarOrbit') ctx.maneuver = { label: '🏠 Volver a la Tierra', ready: act === 'tei', pulse: hints && act === 'tei' };
      else if ((ph === 'toEarth' || ph === 'departing') && plan.check && !plan.check.fine) ctx.maneuver = { label: '🎯 Corregir rumbo', ready: true, pulse: hints && act === 'mcc' };
    }

    // --- lectura: lo que la trayectoria promete ahora mismo
    const passRead = (km) => {
      if (km == null) return { label: 'Paso por la Luna', value: 'sin encuentro', kind: 'bad', goal: 'ideal: 110 km' };
      const alt = Math.abs(km);
      if (km < 0 && alt < 1) return { label: 'Paso por la Luna', value: 'choca', kind: 'bad', goal: 'ideal: 110 km' };
      const kind = km >= LUNAR.PERI_MIN / 1000 && km <= LUNAR.PERI_MAX / 1000 ? (Math.abs(km - 110) < 40 ? 'good' : 'warn') : 'bad';
      return { label: 'Paso por la Luna', value: km < 0 ? `${Math.round(alt).toLocaleString('es')} km (lado contrario)` : `${Math.round(km).toLocaleString('es')} km`, kind, goal: 'ideal: 110 km' };
    };
    const periRead = (km) => {
      if (km == null) return { label: 'Punto más bajo al volver', value: 'no vuelve', kind: 'bad', goal: 'ideal: 60 km' };
      const kind = km >= LUNAR.ENTRY_MIN / 1000 && km <= LUNAR.ENTRY_MAX / 1000 ? (Math.abs(km - 60) <= 5 ? 'good' : 'warn') : 'bad';
      return { label: 'Punto más bajo al volver', value: km < -5000 ? 'se pasa de largo' : `${Math.round(km).toLocaleString('es')} km`, kind, goal: 'ideal: 60 km' };
    };
    const r = this.burnReadout;
    if (burning && r) {
      if ('passKm' in r) ctx.readout = passRead(r.passKm);
      else if ('perigeeKm' in r) ctx.readout = periRead(r.perigeeKm);
      else if ('periKm' in r) ctx.readout = { label: 'Órbita lunar', value: r.apoKm == null ? `${Math.round(r.periKm)} km × sin cerrar` : `${Math.round(r.periKm)} × ${Math.round(r.apoKm).toLocaleString('es')} km`, kind: r.apoKm != null && r.apoKm - r.periKm < 80 ? 'good' : 'warn', goal: 'redonda' };
    } else if (plan.check && flying) ctx.readout = plan.check.goal === 'moon' ? passRead(plan.check.value == null ? null : plan.check.value / 1000) : periRead(plan.check.value == null ? null : plan.check.value / 1000);
    else if (ph === 'approach' && plan.window) ctx.readout = { label: 'Punto más bajo sobre la Luna', value: plan.window.periAlt < 0 ? 'choca' : kmTxt(plan.window.periAlt), kind: plan.window.periAlt > LUNAR.PERI_MIN ? 'good' : 'bad', goal: `en ${fmtDur(plan.window.eta)}` };
    if (ctx.readout) ctx.readout.text = `${ctx.readout.label}|${ctx.readout.value}|${ctx.readout.goal ?? ''}|${ctx.readout.kind ?? ''}`;

    // --- mensajes
    let msg = null; let kind = 'hint';
    const warn = [];
    if (emptyStage && flying) { ctx.pulseSep = hints; warn.push(['Esta etapa se quedó sin combustible: sepárala (Espacio).', 'warn']); }
    if (act === 'entry' && !sim.capsuleOnly) { ctx.pulseSep = true; warn.push(['¡Suelta el módulo de servicio YA (Espacio)! El escudo térmico tiene que ir por delante.', 'bad']); }
    if (sim.capsuleOnly && sim.gNow > (sim.craft.gLimit ?? 9)) warn.push([`Frenado muy fuerte: ${sim.gNow.toFixed(1)} veces la gravedad.`, 'warn']);
    if (ph === 'approach' && plan.window && plan.window.periAlt < LUNAR.PERI_MIN / 2 && !burning) warn.push(['¡Cuidado! La trayectoria pasa demasiado cerca de la Luna (o choca). Gira y empuja hacia afuera, o corrige antes de llegar.', 'bad']);
    if (auto) msg = ph === 'landed' ? null : `Piloto automático: ${LUNAR_PHASE_LABEL[ph].toLowerCase()}.`;
    else if (burning) {
      msg = { tli: 'Inyección translunar: el motor empuja hasta que la trayectoria pase junto a la Luna. Se apaga solo.', loi: 'Frenando para quedar en órbita lunar. El motor se apaga solo cuando la órbita quede redonda.', tei: 'Inyección de regreso: el motor empuja hasta que la trayectoria caiga hacia la Tierra. Se apaga solo.', mcc: 'Corrigiendo el rumbo con empujoncitos…' }[sim.burn.kind];
      kind = 'info';
    } else if (hints) {
      const jump = ' Pulsa ⏩ Saltar para ir a ese momento.';
      switch (act) {
        case 'fairing': ctx.pulseFairing = true; msg = '¡Suelta la cofia (F)! La nave ya está en el espacio.'; break;
        case 'waitTli': msg = `Estás en la órbita de espera. La ventana para ir a la Luna se abre en ${fmtDur(plan.eta)}.${jump} Mira el mapa (M).`; break;
        case 'tli': msg = '¡Ventana abierta! Pulsa «🚀 Ir a la Luna»: el cohete enciende y se apaga solo en el momento justo.'; break;
        case 'sepUpper': ctx.pulseSep = true; msg = 'La etapa superior ya hizo su trabajo: sepárala (Espacio). Desde aquí vuela tu nave con su módulo de servicio.'; break;
        case 'mcc': msg = plan.goal === 'moon' ? 'El rumbo quedó un poco desviado. Pulsa «🎯 Corregir rumbo» para pasar a 110 km de la Luna.' : 'El rumbo de vuelta necesita un ajuste. Pulsa «🎯 Corregir rumbo» para entrar al aire con el ángulo justo.'; break;
        case 'waitLoi': msg = `Vas a pasar a ${kmTxt(plan.window.periAlt)} de la Luna. Hay que frenar justo ahí, en ${fmtDur(plan.eta)}.${jump}`; break;
        case 'loi': msg = plan.late ? '¡Ya pasaste el punto más bajo! Pulsa «🛑 Frenar en la Luna» ahora.' : '¡Ahora! Pulsa «🛑 Frenar en la Luna» para quedar en órbita.'; break;
        case 'waitTei': msg = `¡Estás en órbita lunar! Disfruta la vista (aleja la cámara con −). La ventana de regreso se abre en ${fmtDur(plan.eta)}.${jump}`; break;
        case 'tei': msg = '¡Ventana de regreso! Pulsa «🏠 Volver a la Tierra».'; break;
        case 'sepService': ctx.pulseSep = true; msg = '¡Suelta el módulo de servicio (Espacio)! La cápsula entra sola al aire, con el escudo térmico por delante.'; break;
        case 'entry': msg = sim.stats.entryT != null ? 'Reentrada: el escudo térmico protege la cápsula mientras el aire la frena. Todavía no abras los paracaídas.' : 'La cápsula cae hacia la atmósfera. No hay nada que hacer hasta que el aire la frene.'; kind = 'info'; break;
        case 'chute': ctx.pulseChute = true; msg = '¡Abre los paracaídas (C)!'; break;
        case 'descent': msg = sim.chute?.torn ? 'Los paracaídas se rompieron…' : 'Paracaídas abiertos: la cápsula baja despacio hacia el mar.'; kind = 'info'; break;
        case 'coast':
          if (ph === 'toMoon') msg = plan.pred?.encounter ? `Rumbo a la Luna: llegas a su zona de influencia en ${fmtDur(plan.pred.encounter.t - sim.t)}.${jump}` : 'Tu trayectoria no se encuentra con la Luna.';
          else if (ph === 'departing') msg = `Saliendo de la zona de la Luna (${fmtDur(plan.eta)}).${jump}`;
          else if (ph === 'toEarth') msg = plan.pred?.entry ? `De vuelta a casa: la reentrada es en ${fmtDur(plan.pred.entry.t - sim.t)}.${jump}` : 'Tu trayectoria no llega a la atmósfera de la Tierra: corrige el rumbo.';
          kind = 'info'; break;
        default: break;
      }
    } else if (act === 'chute') ctx.pulseChute = false;
    if (level === 'dificil' && !burning && !auto) {
      // sin pistas paso a paso: sólo se avisa qué fase es y los datos (la lectura de arriba sigue visible)
      if (act === 'waitTli' || act === 'tli') msg = act === 'tli' ? 'Ventana translunar abierta.' : `Ventana translunar en ${fmtDur(plan.eta)}.`;
      else if (act === 'waitLoi' || act === 'loi') msg = act === 'loi' ? 'Punto de frenado.' : `Punto más bajo en ${fmtDur(plan.eta)}.`;
      else if (act === 'waitTei' || act === 'tei') msg = act === 'tei' ? 'Ventana de regreso abierta.' : `Ventana de regreso en ${fmtDur(plan.eta)}.`;
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
