// Animación de la secuencia de lanzamiento en un <canvas> 2D.
// Solo dibuja: el resultado (eventos, falla, órbita alcanzada) ya viene calculado por
// rules.simulateLaunch, así la animación nunca decide nada por su cuenta.

import { FLIGHT_PHASES } from './rules.js';

// Momento (en segundos de animación) en que empieza cada fase y telemetría aproximada
// que se muestra en pantalla (valores típicos, solo ilustrativos).
const TIMELINE = {
  countdown: { at: 0, alt: 0, vel: 0 },
  liftoff: { at: 3, alt: 0, vel: 0 },
  maxq: { at: 5, alt: 12, vel: 0.5 },
  staging: { at: 7, alt: 70, vel: 2.3 },
  fairing: { at: 8.5, alt: 115, vel: 2.7 },
  insertion: { at: 11, alt: 200, vel: 7.8 },
  deploy: { at: 12.5, alt: 200, vel: 7.8 },
  end: { at: 14.5, alt: 200, vel: 7.8 },
};
const HOLD_SECONDS = 2.2;
const PALETTE = { sky: '#153753', space: '#050c17', ground: '#3b4d3a', pad: '#647681', text: '#e8f6ff', cyan: '#73ddcf', orange: '#ff974f', red: '#ff5d5d', yellow: '#ffd166' };

export class LaunchSequence {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 97) % canvas.width, y: (i * 173) % canvas.height, s: i % 3 === 0 ? 2 : 1 }));
    this.raf = null;
    this.drawIdle();
  }

  /**
   * @param {object} opts { launcher, flight, orbitType, reducedMotion, onPhase(id), onEvent(event), onDone() }
   */
  play(opts) {
    this.stop();
    this.opts = opts;
    const hold = opts.flight.events.some((e) => e.phase === 'countdown') ? HOLD_SECONDS : 0;
    this.hold = hold;
    this.failAt = opts.flight.result === 'falla' && opts.flight.failurePhase && !opts.flight.events.some((e) => e.id === 'partialFailure')
      ? TIMELINE[opts.flight.failurePhase].at + hold + 0.6
      : null;
    if (opts.flight.result === 'falla' && opts.flight.events.some((e) => e.id === 'partialFailure')) this.failAt = TIMELINE.insertion.at + hold + 0.4;
    this.duration = (this.failAt ?? TIMELINE.end.at + hold) + (this.failAt ? 2 : 0);
    this.firedPhases = new Set();
    this.firedEvents = new Set();
    this.start = performance.now();
    this.speed = opts.reducedMotion ? 3 : 1;
    const tick = (now) => {
      const t = ((now - this.start) / 1000) * this.speed;
      this.update(t);
      this.draw(t);
      if (t < this.duration) this.raf = requestAnimationFrame(tick);
      else this.finish();
    };
    this.raf = requestAnimationFrame(tick);
  }

  skip() {
    if (!this.opts) return;
    this.stop();
    this.update(this.duration);
    this.draw(this.duration);
    this.finish();
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  finish() {
    this.stop();
    const done = this.opts?.onDone;
    this.opts = { ...this.opts, onDone: null };
    done?.();
  }

  // Avisa a la interfaz cuando empieza cada fase o aparece un evento.
  update(t) {
    const { flight, onPhase, onEvent } = this.opts;
    for (const phase of FLIGHT_PHASES) {
      const at = TIMELINE[phase.id].at + (phase.id === 'countdown' ? 0 : this.hold);
      if (t >= at && !this.firedPhases.has(phase.id) && (this.failAt == null || at < this.failAt)) {
        this.firedPhases.add(phase.id);
        onPhase?.(phase.id);
      }
    }
    flight.events.forEach((event, index) => {
      let at;
      if (event.phase === 'countdown') at = 0.8 + index * 0.4;
      else if (event.severity === 'fatal') at = this.failAt ?? TIMELINE.insertion.at + this.hold;
      else at = TIMELINE[event.phase].at + this.hold + 0.5;
      if (t >= at && !this.firedEvents.has(index)) {
        this.firedEvents.add(index);
        onEvent?.(event);
      }
    });
  }

  // Altura (0..1) del cohete en pantalla y telemetría interpolada para el tiempo t.
  telemetry(t) {
    const flightT = t - this.hold;
    const keys = ['liftoff', 'maxq', 'staging', 'fairing', 'insertion', 'end'];
    if (flightT < TIMELINE.liftoff.at) return { alt: 0, vel: 0, clock: flightT - TIMELINE.liftoff.at, progress: 0 };
    for (let i = 0; i < keys.length - 1; i += 1) {
      const a = TIMELINE[keys[i]];
      const b = TIMELINE[keys[i + 1]];
      if (flightT <= b.at) {
        const k = (flightT - a.at) / (b.at - a.at);
        const ease = k * k * (3 - 2 * k);
        return { alt: a.alt + (b.alt - a.alt) * ease, vel: a.vel + (b.vel - a.vel) * ease, clock: (flightT - TIMELINE.liftoff.at) * 50, progress: Math.min(1, (flightT - TIMELINE.liftoff.at) / (TIMELINE.insertion.at - TIMELINE.liftoff.at)) };
      }
    }
    return { alt: TIMELINE.end.alt, vel: TIMELINE.end.vel, clock: (flightT - TIMELINE.liftoff.at) * 50, progress: 1 };
  }

  drawIdle(message = 'Confirma un lanzador y pulsa LANZAR') {
    const { ctx, canvas } = this;
    this.background(0);
    this.pad(canvas.height - 60);
    this.rocket(canvas.width * 0.35, canvas.height - 60, { stage1: true, fairing: true, heavy: false, flame: false });
    ctx.fillStyle = PALETTE.text;
    ctx.font = '16px monospace';
    ctx.fillText('SPACE MISSION // LAUNCH', 18, 30);
    ctx.fillStyle = PALETTE.cyan;
    ctx.fillText(message, 18, 56);
  }

  background(alt) {
    const { ctx, canvas } = this;
    const k = Math.min(1, alt / 90);
    const mix = (a, b) => Math.round(a + (b - a) * k);
    ctx.fillStyle = `rgb(${mix(21, 5)},${mix(55, 12)},${mix(83, 23)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(232,247,255,${0.25 + k * 0.75})`;
    for (const s of this.stars) ctx.fillRect(s.x, s.y, s.s, s.s);
  }

  pad(groundY) {
    const { ctx, canvas } = this;
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    ctx.fillStyle = PALETTE.pad;
    ctx.fillRect(canvas.width * 0.35 - 40, groundY - 4, 80, 8);
    ctx.fillStyle = '#9aa7ae';
    ctx.fillRect(canvas.width * 0.35 + 26, groundY - 120, 8, 116);
    for (let y = groundY - 116; y < groundY - 4; y += 14) ctx.fillRect(canvas.width * 0.35 + 18, y, 16, 2);
  }

  rocket(x, baseY, { stage1, upper = true, fairing, heavy, flame, scale = 1 }) {
    const { ctx } = this;
    const s = scale;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(baseY));
    if (stage1) {
      ctx.fillStyle = '#edf2f5';
      ctx.fillRect(-7 * s, -70 * s, 14 * s, 70 * s);
      ctx.fillStyle = '#2b3b4a';
      ctx.fillRect(-7 * s, -36 * s, 14 * s, 3 * s);
      if (heavy) {
        ctx.fillStyle = '#d9e1e6';
        ctx.fillRect(-17 * s, -52 * s, 9 * s, 52 * s);
        ctx.fillRect(8 * s, -52 * s, 9 * s, 52 * s);
      }
      if (flame) {
        ctx.fillStyle = PALETTE.yellow;
        ctx.fillRect(-5 * s, 0, 10 * s, (14 + Math.random() * 16) * s);
        ctx.fillStyle = PALETTE.orange;
        ctx.fillRect(-3 * s, 0, 6 * s, (22 + Math.random() * 18) * s);
        if (heavy) {
          ctx.fillStyle = PALETTE.yellow;
          ctx.fillRect(-15 * s, 0, 6 * s, (10 + Math.random() * 12) * s);
          ctx.fillRect(9 * s, 0, 6 * s, (10 + Math.random() * 12) * s);
        }
      }
    }
    if (!upper) { ctx.restore(); return; }
    const top = stage1 ? -70 * s : 0;
    // Segunda etapa
    ctx.fillStyle = '#e3eaee';
    ctx.fillRect(-6 * s, top - 26 * s, 12 * s, 26 * s);
    if (!stage1 && flame) {
      ctx.fillStyle = PALETTE.cyan;
      ctx.fillRect(-3 * s, top, 6 * s, (8 + Math.random() * 10) * s);
    }
    // Cofia o nave al descubierto
    if (fairing) {
      ctx.fillStyle = '#f4f7f9';
      ctx.fillRect(-8 * s, top - 46 * s, 16 * s, 20 * s);
      ctx.beginPath();
      ctx.moveTo(-8 * s, top - 46 * s);
      ctx.lineTo(0, top - 62 * s);
      ctx.lineTo(8 * s, top - 46 * s);
      ctx.fill();
    } else {
      ctx.fillStyle = '#d4a84b';
      ctx.fillRect(-5 * s, top - 38 * s, 10 * s, 12 * s);
      ctx.fillStyle = '#3d7fb5';
      ctx.fillRect(-13 * s, top - 35 * s, 7 * s, 5 * s);
      ctx.fillRect(6 * s, top - 35 * s, 7 * s, 5 * s);
    }
    ctx.restore();
  }

  explosion(x, y, k) {
    const { ctx } = this;
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const r = 6 + k * 70 * ((i % 4) + 1) / 4;
      ctx.fillStyle = i % 3 ? PALETTE.orange : PALETTE.yellow;
      ctx.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 5, 5);
    }
  }

  orbitInset(t) {
    const { ctx, canvas } = this;
    const { flight, orbitType } = this.opts;
    const w = 210;
    const h = 150;
    const x0 = canvas.width - w - 14;
    const y0 = 14;
    ctx.fillStyle = 'rgba(6,16,30,.85)';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#3d6378';
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const cx = x0 + w / 2;
    const cy = y0 + h / 2 + 8;
    ctx.fillStyle = '#2f6fa3';
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4c9a5c';
    ctx.fillRect(cx - 8, cy - 10, 10, 8);
    ctx.fillRect(cx + 4, cy + 4, 8, 6);
    // Órbita objetivo (punteada)
    const rx = orbitType === 'LEO' || orbitType === 'SSO' ? 34 : 90;
    const ry = orbitType === 'LEO' || orbitType === 'SSO' ? 34 : 44;
    const ox = orbitType === 'LEO' || orbitType === 'SSO' ? 0 : rx - 32;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = PALETTE.cyan;
    ctx.beginPath(); ctx.ellipse(cx + ox, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '11px monospace';
    ctx.fillText(`OBJETIVO: ${orbitType}`, x0 + 8, y0 + 16);
    const insertionAt = TIMELINE.insertion.at + this.hold;
    if (t >= insertionAt && flight.achievedOrbit) {
      const offset = flight.events.some((e) => e.id === 'orbitOffset' || e.id === 'partialFailure');
      ctx.strokeStyle = offset ? PALETTE.yellow : '#9cff9c';
      const shrink = flight.events.some((e) => e.id === 'partialFailure') ? 0.75 : offset ? 1.08 : 1;
      ctx.beginPath(); ctx.ellipse(cx + ox * shrink, cy, rx * shrink, ry * shrink, offset ? 0.12 : 0, 0, Math.PI * 2); ctx.stroke();
      const a = (t - insertionAt) * 1.6;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + ox * shrink + Math.cos(a) * rx * shrink - 2, cy + Math.sin(a) * ry * shrink - 2, 4, 4);
      ctx.fillStyle = offset ? PALETTE.yellow : '#9cff9c';
      ctx.fillText(offset ? 'ÓRBITA DISTINTA' : 'EN ÓRBITA', x0 + 8, y0 + h - 8);
    }
  }

  draw(t) {
    const { ctx, canvas } = this;
    const { flight, launcher } = this.opts;
    const tel = this.telemetry(t);
    const failed = this.failAt != null && t >= this.failAt;
    const heavy = ['falconheavy', 'ariane64', 'sls'].includes(launcher.id);
    this.background(tel.alt);

    // El suelo baja a medida que el cohete sube (la cámara lo sigue).
    const groundY = canvas.height - 60 + Math.min(tel.alt * 30, 2000);
    if (groundY < canvas.height) this.pad(groundY);

    const flightT = t - this.hold;
    const rocketX = canvas.width * 0.35 + tel.progress * canvas.width * 0.25;
    const rocketY = Math.max(canvas.height * 0.55, canvas.height - 60 - Math.min(tel.alt * 30, canvas.height));
    const staged = flightT >= TIMELINE.staging.at;
    const fairingOff = flightT >= TIMELINE.fairing.at;
    const deployed = flightT >= TIMELINE.deploy.at;
    const burning = flightT >= TIMELINE.liftoff.at && flightT < TIMELINE.insertion.at && !failed;

    // Primera etapa que cae después de la separación
    if (staged && !failed) {
      const k = flightT - TIMELINE.staging.at;
      this.rocket(rocketX - k * 12, rocketY + 6 + k * 70, { stage1: true, upper: false, fairing: false, heavy, flame: false });
    }
    // Mitades de la cofia
    if (fairingOff && !failed && flightT < TIMELINE.fairing.at + 2) {
      const k = flightT - TIMELINE.fairing.at;
      ctx.fillStyle = '#f4f7f9';
      ctx.fillRect(rocketX - 14 - k * 30, rocketY - 120 + k * 50, 6, 18);
      ctx.fillRect(rocketX + 10 + k * 30, rocketY - 120 + k * 50, 6, 18);
    }

    if (!failed) {
      if (deployed) {
        const k = Math.min(1, (flightT - TIMELINE.deploy.at) / 1.5);
        this.rocket(rocketX - k * 30, rocketY + (staged ? -70 : 0) + k * 30, { stage1: false, fairing: false, heavy, flame: false });
        ctx.save();
        ctx.translate(rocketX + k * 30, rocketY - 30 - k * 20);
        ctx.fillStyle = '#d4a84b'; ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#3d7fb5'; ctx.fillRect(-6 - 18 * k, -3, 18 * k, 6); ctx.fillRect(6, -3, 18 * k, 6);
        ctx.restore();
      } else {
        const shake = burning && !this.opts.reducedMotion && flightT < TIMELINE.staging.at ? (Math.random() - 0.5) * 2 : 0;
        if (staged) this.rocket(rocketX + shake, rocketY - 70, { stage1: false, fairing: !fairingOff, heavy, flame: burning });
        else this.rocket(rocketX + shake, rocketY, { stage1: true, fairing: !fairingOff, heavy, flame: burning });
      }
    } else {
      this.explosion(rocketX, rocketY - 60, Math.min(1, (t - this.failAt) / 1.2));
    }

    // Max-Q: anillo de condensación alrededor del cohete
    if (!failed && flightT >= TIMELINE.maxq.at && flightT < TIMELINE.maxq.at + 1) {
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath(); ctx.ellipse(rocketX, rocketY - 50, 26, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }

    // Retención por clima o anomalía durante la cuenta regresiva
    if (this.hold && t < this.hold) {
      ctx.fillStyle = PALETTE.yellow;
      ctx.font = 'bold 22px monospace';
      ctx.fillText('CUENTA EN ESPERA (HOLD)', canvas.width * 0.08, canvas.height * 0.4);
      ctx.fillStyle = 'rgba(160,190,210,.35)';
      for (let i = 0; i < 60; i += 1) ctx.fillRect((i * 53 + t * 300) % canvas.width, (i * 97 + t * 500) % canvas.height, 1, 8);
    }

    // Telemetría
    ctx.fillStyle = PALETTE.text;
    ctx.font = '15px monospace';
    const clock = flightT < TIMELINE.liftoff.at ? `T-${Math.max(0, Math.ceil(-tel.clock * 3.3))}` : `T+${Math.floor(tel.clock)} s`;
    ctx.fillText(`${launcher.name.toUpperCase()}`, 16, 26);
    ctx.fillText(this.hold && t < this.hold ? 'T-10 · HOLD' : clock, 16, 48);
    ctx.fillText(`ALT ${tel.alt.toFixed(0)} km`, 16, 70);
    ctx.fillText(`VEL ${tel.vel.toFixed(1)} km/s`, 16, 92);
    if (failed) {
      ctx.fillStyle = PALETTE.red;
      ctx.font = 'bold 22px monospace';
      ctx.fillText('SE PERDIÓ LA SEÑAL', 16, canvas.height - 20);
    }
    this.orbitInset(t);
  }
}
