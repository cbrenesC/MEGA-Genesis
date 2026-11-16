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
  PHYS, DEG, DEST, applyAutopilot, autopilotStep, orbitGoalMet, newAutopilot, startTransferBurn, trackTransfer, transferWindow, timeToApoapsis, pressureRatio,
} from '../flight.js';
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
      transfer: () => this.doTransfer(),
    }, {
      difficulty: this.diffLevel,
      stageNames: this.vehicle.stages.map((s) => s.name),
      transfer: this.destKind === 'transfer',
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
        <div class="actions"><button id="p-exit">Volver al centro de control</button><button class="primary big" id="p-resume">▶ Seguir volando</button></div></div>`;
      document.getElementById('p-resume').onclick = () => this.togglePause();
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
      this.hud.event(`ETAPA ${sep.index + 1} SEPARADA`, 'ok');
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

  ux() { return this.sim.x / this.sim.r; }
  uy() { return this.sim.y / this.sim.r; }

  /** Posición y velocidad del cohete en el marco del suelo (este, altura): ahí viven el humo y la plataforma. */
  groundFrame() {
    const s = this.sim;
    return {
      E: groundDistance(s.angle, s.t, s.atmRate),
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
      if (this.endTimer > 2.8 && !this.leaving) { this.leaving = true; finishFlight(sim); app.nav.go('result'); }
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

    // mundo: piezas sueltas y partículas avanzan con el mismo tiempo físico que el cohete
    const physW = Math.min(phys, 30);
    for (const d of this.debris) stepDebris(d, physW, sim.atmRate);
    this.cullDebris();
    this.emitEffects(physW);
    this.particles.step(Math.min(phys, 6));

    // fase de vuelo según la altura real
    const phase = phaseOf(sim.altitude, { grounded: sim.grounded, prev: this.phase });
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
    if (!this.maxQAnnounced && q > 8000 && q < sim.stats.maxQ * 0.9) { this.maxQAnnounced = true; this.hud.event('MAX-Q SUPERADO', 'ok'); }
    if (sim.orbitReached && !this.orbitAnnounced) { this.orbitAnnounced = true; this.hud.event('¡ÓRBITA!', 'ok'); }
    return follow;
  }

  onPhase(next) {
    const first = this.phase === 'pad' && next === 'liftoff';
    this.phase = next;
    this.hud.setPhase(next);
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
        this.particles.add('smoke', groundDistance(g, this.sim.t, this.sim.atmRate), 0, 0, 4, { size: 4, life: 6 });
      }
      return false;
    });
  }

  /** Fuego, humo y nube de la plataforma según el empuje y el aire que queda. */
  emitEffects(phys) {
    const sim = this.sim;
    const g = this.groundFrame();
    const thr = sim.engineOut ? 0 : sim.throttle;
    const air = pressureRatio(sim.altitude);
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
    const bad = ['failure', 'maxq', 'aoa', 'crash'].includes(sim.endReason);
    if (bad) {
      this.explode();
      this.hud.message(sim.log.at(-1)?.text ?? 'El cohete se perdió.', 'bad');
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

  // ------------------------------------------------------------------ dibujo

  drawFrame(dt) {
    if (this.mapOpen) return;
    const sim = this.sim;
    const view = this.view;
    const W = view.viewW; const H = view.viewH;
    const alt = Math.max(0, sim.altitude);
    // la cámara sigue con suavidad: escala por altura real, y un pequeño retraso al acelerar fuerte
    this.accelSmooth += (thrustAccelG(sim) - this.accelSmooth) * (1 - Math.exp(-dt * 4));
    this.cam.update(alt, this.accelSmooth, dt);
    const mpp = this.cam.mpp;
    const ux = this.ux(); const uy = this.uy();
    const [ax, ay] = sim.attitude();
    const betaShown = Math.atan2(ax * uy - ay * ux, ax * ux + ay * uy);
    const groundS = groundDistance(sim.angle, sim.t, sim.atmRate);

    // velocidad respecto al aire, para las rayas de velocidad (sólo donde hay aire)
    const [rvx, rvy] = sim.relVelocity();
    const east = rvx * uy - rvy * ux; const up = rvx * ux + rvy * uy;
    const k = (this.paused || sim.status !== 'flying' ? 0 : PHYS.COMPRESSION * this.warp) / mpp;
    const flowX = -east * k; const flowY = up * k;
    this.flow.px = (this.flow.px + flowX * dt) % 4096; this.flow.py = (this.flow.py + flowY * dt) % 4096;
    const q = sim.lastQ;

    const throttle = this.ignition ? this.spool : sim.status === 'flying' ? sim.throttle * (sim.engineOut ? 0 : 1) : 0;
    const S = {
      time: performance.now() / 1000,
      reduced: this.reduced,
      alt, mpp, baseY: anchorY(alt, mpp, H) - this.cam.lag, groundS,
      starShift: (Math.PI / 2 - sim.angle) * 600,
      stage: Math.min(sim.stage, this.vehicle.stages.length), fairing: sim.fairing,
      throttle, engineOn: Boolean(this.ignition) || (sim.status === 'flying' && !sim.engineOut),
      betaShown, flicker: Math.random(), airFade: pressureRatio(alt),
      weather: this.weather, windE: this.weather ? windEastMs(this.weather) * (performance.now() / 1000 - this.t0) : 0,
      hideRocket: this.exploded, focus: this.cam.focusT < Infinity, zoomOut: this.cam.zoomOut,
      debris: this.debris, particles: this.particles, rx: sim.x, ry: sim.y,
      flowX, flowY, flowPhaseX: this.flow.px, flowPhaseY: this.flow.py,
      streakAlpha: clamp(q / 2500, 0, 1) * smooth(20, 90, Math.hypot(flowX, flowY)),
      prograde: null, recommend: this.recommendRad ?? null,
    };
    if (sim.status === 'flying' && Math.hypot(sim.radialSpeed, sim.tangentSpeed) > 60 && !this.exploded) S.prograde = Math.atan2(sim.tangentSpeed, sim.radialSpeed);
    this.renderer.flameFrame = Math.floor(S.time * 14);
    const ctx = view.ctx;
    this.renderer.draw(ctx, view.W, view.H, shiftState(S, view.margin));
    const [ox, oy] = this.reduced ? [0, 0] : this.cam.shakeOffset();
    view.present(ox, oy);
  }
}

/** El lienzo tiene un margen para la sacudida: se corre el dibujo para que (0,0) sea la esquina del margen. */
function shiftState(S, margin) {
  return { ...S, baseY: S.baseY + margin, shiftX: margin };
}
