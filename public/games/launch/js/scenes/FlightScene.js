// Vuelo interactivo: vista lateral 2D del cohete, controles táctiles y de teclado, telemetría y pistas.
//
// El mundo se dibuja desde el cohete: "arriba" es siempre la vertical del lugar donde está. El cielo
// pasa de azul a negro con la altura y, desde unos 50 km, se ve cómo se curva la Tierra.
// La física está en flight.js (pura); aquí solo se dibuja y se leen los controles.

import {
  PHYS, DEG, DEST, applyAutopilot, autopilotStep, newAutopilot, startTransferBurn, trackTransfer, transferWindow, timeToApoapsis,
} from '../flight.js';
import { app, inputs, current, reducedMotion, remember } from '../store.js';
import { createSim, finishFlight } from '../flow.js';
import { Hud } from '../hud.js';
import { esc } from '../screens.js';
import { drawRocket, drawPiece, rocketDims } from './rocketArt.js';
import { toast } from '../ui.js';
import { gradientRect, lerpColor } from './gfx.js';

const Phaser = window.Phaser;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const TUTORIAL = [
  { title: '1 · Empuje', text: 'La barra de la izquierda (o las teclas Shift y Ctrl, o ↑ y ↓) controla qué tan fuerte empujan los motores. Empieza al 100 %: ¡despegas!' },
  { title: '2 · Inclina de a poquito', text: 'Con ◀ ▶ (o A y D) giras el cohete. Primero sube derecho; después inclínalo hacia la derecha poco a poco. Para quedarte en órbita necesitas ir muy rápido de lado, no solo subir.' },
  { title: '3 · Separa las etapas', text: 'Cuando una etapa se queda sin combustible, pulsa «Separar etapa» (barra espaciadora). Cuando ya casi no haya aire, suelta la cofia con el botón 📦.' },
  { title: '4 · Mira tu órbita', text: 'El botón 🌍 Mapa te muestra tu órbita desde arriba y te dice si «cierra» o si vas a caer. Con ⏩ puedes acelerar el tiempo en las partes largas.' },
];

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
    this.ap = newAutopilot(app.reference?.program ?? app.vehicleInfo.program);
    this.shadow = newAutopilot(app.reference?.program ?? app.vehicleInfo.program);
    this.warp = 1;
    this.autoWarp = null;
    this.paused = true;
    this.ended = false;
    this.endTimer = 0;
    this.pieces = [];
    this.hintState = {};
    app.autopilotUsed = false;

    // capas de dibujo
    this.bg = this.add.graphics();
    this.world = this.add.graphics();
    this.ghost = this.add.graphics();
    this.rocketG = this.add.graphics();
    this.rocketCenter = this.dims.total / 2;
    this.stars = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3, p: Math.random() * 6 }));
    this.clouds = Array.from({ length: 46 }, () => ({ s: (Math.random() - 0.35) * 70000, h: 1200 + Math.random() * 9000, w: 400 + Math.random() * 1600 }));
    this.makeTextures();

    // HUD
    const hudEl = document.getElementById('hud');
    hudEl.hidden = false;
    this.hud = new Hud(hudEl, {
      separate: () => this.doSeparate(),
      fairing: () => this.doFairing(),
      map: () => this.toggleMap(),
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
    this.onEsc = (ev) => { if (ev.key === 'Escape') this.togglePause(); };
    window.addEventListener('keydown', this.onEsc);
    this.events.once('shutdown', () => this.cleanup());

    if (!remember.get('tutorial')) this.showTutorial(0);
    else this.begin();
  }

  cleanup() {
    window.removeEventListener('keydown', this.onEsc);
    this.hud?.destroy();
    document.getElementById('hud').hidden = true;
    document.getElementById('overlay').hidden = true;
    this.mapOpen = false;
    if (this.scene.isActive('MapScene')) this.scene.stop('MapScene');
  }

  makeTextures() {
    if (this.textures.exists('spark')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillCircle(6, 6, 6);
    g.generateTexture('spark', 12, 12);
    g.destroy();
  }

  // ------------------------------------------------------------------ flujo

  begin() {
    this.paused = false;
    this.sim.ignite();
    this.hud.setThrottle(1);
    if (!this.reduced) this.cameras.main.shake(700, 0.003);
    this.hud.message('¡Despegue! Sube derecho y empieza a inclinar de a poquito.', 'ok');
  }

  showTutorial(i) {
    const ov = document.getElementById('overlay');
    ov.hidden = false;
    const step = TUTORIAL[i];
    ov.innerHTML = `<div class="tutorial" role="dialog" aria-label="Tutorial"><span class="kicker">TUTORIAL · ${i + 1} DE ${TUTORIAL.length}</span><h2>${esc(step.title)}</h2><p>${esc(step.text)}</p>
      <div class="actions"><button id="tut-skip">Saltar</button><button class="primary big" id="tut-next">${i === TUTORIAL.length - 1 ? '¡A volar! 🚀' : 'Siguiente →'}</button></div></div>`;
    const done = () => { remember.set('tutorial', '1'); ov.hidden = true; ov.innerHTML = ''; this.begin(); };
    document.getElementById('tut-skip').onclick = done;
    document.getElementById('tut-next').onclick = () => (i === TUTORIAL.length - 1 ? done() : this.showTutorial(i + 1));
  }

  togglePause() {
    if (this.ended || this.sim.status === 'pad') return;
    this.paused = !this.paused;
    const ov = document.getElementById('overlay');
    if (this.paused) {
      ov.hidden = false;
      ov.innerHTML = `<div class="tutorial" role="dialog" aria-label="Pausa"><span class="kicker">PAUSA</span><h2>Vuelo en pausa</h2><p>Tu cohete espera. Los motores y el tiempo están congelados.</p>
        <div class="actions"><button id="p-exit">Salir al hangar</button><button class="primary big" id="p-resume">▶ Seguir volando</button></div></div>`;
      document.getElementById('p-resume').onclick = () => this.togglePause();
      document.getElementById('p-exit').onclick = () => { this.paused = false; ov.hidden = true; app.sim = null; app.nav.go('check'); };
    } else { ov.hidden = true; ov.innerHTML = ''; }
  }

  toggleMap() {
    this.mapOpen = !this.mapOpen;
    if (this.mapOpen) { this.scene.launch('MapScene'); this.scene.bringToTop('MapScene'); } else this.scene.stop('MapScene');
    this.world.setVisible(!this.mapOpen); this.bg.setVisible(!this.mapOpen); this.rocketG.setVisible(!this.mapOpen); this.ghost.setVisible(!this.mapOpen);
    document.getElementById('b-map').classList.toggle('is-on', this.mapOpen);
  }

  doSeparate() {
    if (this.paused || this.sim.status !== 'flying') return;
    const i = this.sim.stage;
    if (i >= this.sim.stageCount) return;
    const before = { x: this.sim.x, y: this.sim.y, vx: this.sim.vx, vy: this.sim.vy };
    if (this.sim.separateStage()) {
      this.spawnPiece({ ...before, kind: 'stage', w: this.dims.w / 2, h: this.dims.stageH[i], color: [0xe9eef5, 0xc9d3df, 0xaebccb, 0x93a6ba][i % 4], dv: -4 });
      if (!this.reduced) this.cameras.main.shake(250, 0.003);
    }
  }

  doFairing() {
    if (this.paused || this.sim.status !== 'flying') return;
    const before = { x: this.sim.x, y: this.sim.y, vx: this.sim.vx, vy: this.sim.vy };
    if (this.sim.dropFairing()) {
      for (const dir of [-1, 1]) this.spawnPiece({ ...before, kind: 'fairing', dir, w: this.dims.w / 2, h: this.dims.fairingH, color: 0xfff3e0, dv: 2.5, side: dir });
    }
  }

  spawnPiece({ x, y, vx, vy, kind, w, h, color, dir = 1, dv = 0, side = 0 }) {
    const r = Math.hypot(x, y);
    const ux = x / r; const uy = y / r; const ex = uy; const ey = -ux;
    const g = this.add.graphics();
    this.pieces.push({ g, x, y, vx: vx + dv * ux + side * 2.5 * ex, vy: vy + dv * uy + side * 2.5 * ey, rot: kind === 'fairing' ? 0 : 0, spin: (kind === 'fairing' ? side : 0.4) * (0.4 + Math.random()), kind, w, h, color, dir, life: 0, beta: this.sim.beta });
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

  // ------------------------------------------------------------------ cada cuadro

  update(time, delta) {
    if (!this.sim) return;
    const dt = Math.min(delta, 50) / 1000;
    this.hud.tickKeys(dt);
    const sim = this.sim;
    let followThrottle = null;
    if (!this.paused && sim.status === 'flying') followThrottle = this.step(dt);
    this.updateHints(followThrottle);
    this.draw(dt);
    if (sim.status === 'ended' && !this.ended) this.onEnded();
    if (this.ended) {
      this.endTimer += dt;
      if (this.endTimer > 2.4 && !this.leaving) { this.leaving = true; finishFlight(sim); app.nav.go('result'); }
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
    // rastro de mensajes importantes de la simulación
    if (sim.notice && sim.notice.t !== this.lastNoticeT) {
      this.lastNoticeT = sim.notice.t;
      this.hud.message(sim.notice.text, sim.notice.kind === 'bad' ? 'bad' : sim.notice.kind === 'warn' ? 'warn' : sim.notice.kind === 'ok' ? 'ok' : 'info');
      this.noticeUntil = performance.now() + 4500;
      if (sim.notice.kind === 'warn' && !this.reduced) this.cameras.main.shake(300, 0.004);
    }
    // sacudida del Max-Q
    const q = sim.lastQ;
    if (!this.reduced && q > PHYS.Q_WARN * 0.8 && Math.random() < 0.06) this.cameras.main.shake(140, 0.0012 + 0.0015 * smooth(PHYS.Q_WARN, PHYS.Q_LIMIT, q));
    return follow;
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
    const { width: W, height: H } = this.scale;
    if (!this.emitter) this.emitter = this.add.particles(0, 0, 'spark', { speed: { min: 60, max: 360 }, lifespan: 1100, scale: { start: 1.3, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xff7a3d, 0xffd24a, 0xffffff], quantity: 70, emitting: false });
    this.emitter.explode(80, this.rx, this.ry);
    if (!this.reduced) this.cameras.main.shake(700, 0.01);
    this.exploded = true;
  }

  // ------------------------------------------------------------------ pistas

  updateHints(followThrottle) {
    const sim = this.sim;
    const hud = this.hud;
    const level = this.diffLevel;
    const out = autopilotStep(sim, this.shadow);
    const ctx = { followThrottle, canProgradeMode: sim.altitude > 70000 && sim.status === 'flying' };
    const transfer = this.destKind === 'transfer';
    const tr = sim.stats.transfer;
    const empty = sim.engineOut && sim.stage < sim.stageCount - 1;
    const lastEmpty = sim.engineOut && sim.stage >= sim.stageCount - 1;
    ctx.canJump = sim.status === 'flying' && sim.altitude > PHYS.ATM_TOP && sim.throttle < 0.01 && !(tr && tr.active);
    ctx.canFinish = sim.status === 'flying' && (sim.orbitReached || lastEmpty || (transfer && tr && !tr.active));
    ctx.canTransfer = transfer && sim.orbitReached && !tr && sim.status === 'flying';
    const el = sim.elements;
    const tAlt = sim.targetAltKm * 1000;
    const circular = !el.hyper && el.periAlt >= Math.max(PHYS.PERI_OK, tAlt - 6000);
    const phase = this.shadow.phase;
    let msg = null; let kind = 'hint';
    const warnings = [];
    if (sim.lastQ > PHYS.Q_LIMIT) warnings.push(['¡Demasiada presión del aire! Baja el empuje ya.', 'bad']);
    else if (sim.lastQ > PHYS.Q_WARN) warnings.push(['Mucha presión del aire (Max-Q): baja un poco el empuje.', 'warn']);
    if (lastEmpty && !sim.orbitReached && sim.status === 'flying') warnings.push(['Te quedaste sin combustible y todavía no estás en órbita.', 'bad']);

    // recomendaciones (más detalladas en fácil, solo pistas visuales en normal)
    ctx.recommendBetaDeg = null;
    if (level !== 'dificil' && sim.mode === 'manual' && out.betaTarget != null && !sim.engineOut) ctx.recommendBetaDeg = out.betaTarget / DEG;
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
      else if (phase === 'circ' && !circular) msg = sim.mode === 'prograde' ? `¡Ahora empuja al 100 %! Hasta que tu punto más bajo llegue a ${Math.round(tAlt / 1000)} km.` : '¡Ahora! Pulsa 🧭 Mirar adelante (R) y empuja al 100 %.';
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
    if (this.noticeUntil && performance.now() < this.noticeUntil && !warnings.length) { /* no pisar el aviso */ } else if (msg !== undefined) hud.message(msg ?? '', msg ? (kind === 'hint' ? 'hint' : kind) : 'info');
    hud.update(sim, ctx);
  }

  // ------------------------------------------------------------------ dibujo

  anchor() {
    const { width: W, height: H } = this.scale;
    const alt = Math.max(0, this.sim.altitude);
    return { cx: W * 0.5, cy: H * (0.74 - 0.2 * smooth(0, 4000, alt)) };
  }

  draw(dt) {
    const sim = this.sim;
    const { width: W, height: H } = this.scale;
    const alt = Math.max(0, sim.altitude);
    const mpp = 0.6 + alt * 0.012;
    const { cx, cy } = this.anchor();
    const R = PHYS.RE;
    const theta = sim.angle;
    const ux = Math.cos(theta); const uy = Math.sin(theta);
    const sRocket = R * (Math.PI / 2 - theta); // distancia recorrida sobre el suelo (m)
    const t = performance.now() / 1000;

    // cielo
    const skyT = smooth(1000, 90000, alt);
    const top = lerpColor(0x3f8fe0, 0x01030a, clamp(skyT * 1.15, 0, 1));
    const bot = lerpColor(0xa9d8ff, 0x050b18, skyT);
    const bg = this.bg;
    bg.clear();
    gradientRect(bg, 0, 0, W, H, top, bot, 40);
    const starA = smooth(25000, 75000, alt);
    if (starA > 0.01) {
      for (const s of this.stars) {
        const tw = this.reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 1.5 + s.p);
        bg.fillStyle(0xffffff, starA * tw * 0.9);
        bg.fillCircle(((s.x * W - sRocket / 4e4) % W + W) % W, s.y * H * 0.85, s.r);
      }
    }
    // Sol
    const sunA = 1 - skyT * 0.4;
    bg.fillStyle(0xfff6c8, 0.9 * sunA); bg.fillCircle(W * 0.82, H * 0.16, 26);
    bg.fillStyle(0xfff6c8, 0.18 * sunA); bg.fillCircle(W * 0.82, H * 0.16, 62);

    const g = this.world;
    g.clear();
    // atmósfera (anillo azul) y Tierra
    const sagitta = (Rr, s) => { const q = Rr * Rr - s * s; return q <= 0 ? Infinity : (s * s) / (Rr + Math.sqrt(q)); };
    const poly = (Rr, lift) => {
      const pts = [];
      for (let x = -20; x <= W + 20; x += 14) {
        const s = (x - cx) * mpp;
        const sag = sagitta(Rr, s);
        pts.push({ x, y: sag === Infinity ? H * 6 : cy + (alt - lift + sag) / mpp });
      }
      return pts;
    };
    const fillPoly = (pts, color, alpha) => {
      g.fillStyle(color, alpha);
      g.beginPath(); g.moveTo(pts[0].x, H + 40);
      for (const p of pts) g.lineTo(p.x, Math.min(p.y, H + 40));
      g.lineTo(pts.at(-1).x, H + 40); g.closePath(); g.fillPath();
    };
    const atmA = 1 - smooth(60000, 140000, alt) * 0.4;
    if (alt > 8000) {
      fillPoly(poly(R + 110000, 110000), 0x5fb4ff, 0.10 * atmA);
      fillPoly(poly(R + 55000, 55000), 0x7cc8ff, 0.16 * atmA);
    }
    const land = lerpColor(0x2f6b3a, 0x2368b0, smooth(0, 40000, alt));
    fillPoly(poly(R, 0), land, 1);
    // bruma del horizonte
    const hz = poly(R, 0);
    g.lineStyle(3, 0xbfe3ff, 0.55 * atmA);
    g.beginPath(); hz.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.strokePath();

    // nubes
    if (alt < 30000) {
      for (const c of this.clouds) {
        const x = cx + (c.s - sRocket) / mpp;
        if (x < -200 || x > W + 200) continue;
        const y = cy - (c.h - alt) / mpp;
        const w = Math.max(6, c.w / mpp);
        g.fillStyle(0xffffff, 0.55 * (1 - smooth(14000, 30000, alt)));
        g.fillEllipse(x, y, w, w * 0.32);
        g.fillEllipse(x + w * 0.3, y - w * 0.08, w * 0.7, w * 0.3);
      }
    }
    // plataforma y torre
    if (alt < 20000) {
      const px = cx + (0 - sRocket) / mpp;
      if (px > -150 && px < W + 150) {
        const ground = cy + alt / mpp;
        g.fillStyle(0x4a5a6c, 1); g.fillRect(px - 40, ground - 4, 80, 8);
        g.fillStyle(0x38485a, 1); g.fillRect(px - 62, ground - 150, 10, 150);
        g.lineStyle(2, 0x38485a, 1);
        for (let yy = 0; yy < 150; yy += 25) { g.beginPath(); g.moveTo(px - 62, ground - yy); g.lineTo(px - 52, ground - yy - 25); g.strokePath(); }
      }
    }

    // pedazos que caen
    const physDt = dt * PHYS.COMPRESSION * (this.paused || sim.status !== 'flying' ? 0 : this.warp);
    for (const p of this.pieces) {
      if (physDt > 0) {
        const steps = Math.max(1, Math.ceil(physDt / 0.5));
        const h = physDt / steps;
        for (let i = 0; i < steps; i++) {
          const r = Math.hypot(p.x, p.y);
          const gg = PHYS.MU / (r * r * r);
          p.vx -= gg * p.x * h; p.vy -= gg * p.y * h;
          p.x += p.vx * h; p.y += p.vy * h;
        }
        p.rot += p.spin * physDt * 0.25;
        p.life += physDt;
      }
      const dx = p.x - sim.x; const dy = p.y - sim.y;
      const sx = cx + (dx * uy - dy * ux) / mpp;
      const sy = cy - this.rocketCenter - (dx * ux + dy * uy) / mpp;
      p.g.clear();
      p.g.setPosition(sx, sy);
      p.g.setRotation(sim.beta + p.rot);
      drawPiece(p.g, p);
      p.g.setVisible(!this.mapOpen && sx > -200 && sx < W + 200 && sy > -200 && sy < H + 200);
    }
    this.pieces = this.pieces.filter((p) => { if (p.life > 900 || Math.hypot(p.x, p.y) < PHYS.RE - 50) { p.g.destroy(); return false; } return true; });

    // cohete
    const rg = this.rocketG;
    const rcx = cx;
    const rcy = cy - this.rocketCenter;
    this.rx = rcx; this.ry = rcy;
    rg.clear();
    if (!this.exploded) {
      rg.setPosition(rcx, rcy);
      // ángulo mostrado: dirección real del eje del cohete respecto a la vertical
      const [ax, ay] = sim.attitude();
      const betaShown = Math.atan2(ax * uy - ay * ux, ax * ux + ay * uy);
      rg.setRotation(betaShown);
      drawRocket(rg, this.vehicle, { stage: sim.stage, fairing: sim.fairing, throttle: sim.status === 'flying' ? sim.throttle * (sim.engineOut ? 0 : 1) : 0, flicker: this.reduced ? 0.5 : Math.random() }, this.rocketCenter);
    }

    // marcadores: dirección de avance y ángulo recomendado
    const gh = this.ghost;
    gh.clear();
    if (sim.status === 'flying' && !this.exploded) {
      const vr = sim.radialSpeed; const vt = sim.tangentSpeed;
      if (Math.hypot(vr, vt) > 60) {
        const ang = Math.atan2(vt, vr);
        const mx = rcx + Math.sin(ang) * 86; const my = rcy - Math.cos(ang) * 86;
        gh.lineStyle(2, 0x73ddcf, 0.95); gh.strokeCircle(mx, my, 8);
        gh.beginPath(); gh.moveTo(mx - 12, my); gh.lineTo(mx - 8, my); gh.moveTo(mx + 8, my); gh.lineTo(mx + 12, my); gh.moveTo(mx, my - 12); gh.lineTo(mx, my - 8); gh.strokePath();
      }
      if (this.diffLevel !== 'dificil' && sim.mode === 'manual') {
        const out = autopilotStep(sim, { ...this.shadow });
        if (out.betaTarget != null && !sim.engineOut) {
          const a = out.betaTarget;
          gh.lineStyle(3, 0xffd24a, 0.9);
          const x0 = rcx + Math.sin(a) * 60; const y0 = rcy - Math.cos(a) * 60;
          const x1 = rcx + Math.sin(a) * 120; const y1 = rcy - Math.cos(a) * 120;
          gh.beginPath(); gh.moveTo(x0, y0); gh.lineTo(x1, y1); gh.strokePath();
          gh.fillStyle(0xffd24a, 0.95); gh.fillTriangle(x1, y1, x1 - Math.cos(a) * 7 - Math.sin(a) * 9, y1 - Math.sin(a) * 7 + Math.cos(a) * 9, x1 + Math.cos(a) * 7 - Math.sin(a) * 9, y1 + Math.sin(a) * 7 + Math.cos(a) * 9);
        }
      }
    }
  }
}
