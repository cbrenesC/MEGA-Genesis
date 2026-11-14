// Plataforma de lanzamiento: se ve el cohete, se revisan los imprevistos y se hace la cuenta regresiva.
import { app, inputs, current, reducedMotion } from '../store.js';
import { esc } from '../screens.js';
import { prepareLaunch } from '../flow.js';
import { rotateFacts } from '../ui.js';
import { fmtKg, fmtMUSD, massLike } from '../plain.js';
import { PixelView, FlightRenderer } from './render.js';
import { ParticleSystem } from '../particles.js';
import { CAMERA } from '../world.js';
import { PHYS } from '../flight.js';

// Cohete genérico para dibujar la plataforma cuando el par cohete/destino no tiene simulador.
const GENERIC = { id: 'generic', diameterM: 3, stackKg: 60000, fairingKg: 400, stages: [{ dryKg: 3500, propKg: 38000 }, { dryKg: 700, propKg: 9000 }] };

const Phaser = window.Phaser;

export class PadScene extends Phaser.Scene {
  constructor() { super('PadScene'); }

  create() {
    this.t = 0;
    this.state = 'prep'; // prep → ready → counting → hold → go
    this.go = 0;
    this.vehicle = app.vehicleInfo?.vehicle ?? GENERIC;
    this.view = new PixelView(this, 'padView');
    this.view.fit(this.scale.width, this.scale.height);
    this.renderer = new FlightRenderer(this.vehicle);
    this.particles = new ParticleSystem();
    this.onResize = () => this.view.fit(this.scale.width, this.scale.height);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.view.destroy(); this.stopFacts?.(); clearInterval(this.timer); });
    document.getElementById('ui').hidden = true;
    document.getElementById('hud').hidden = true;
    this.overlay = document.getElementById('overlay');
    this.overlay.hidden = false;
    app.nav.chrome('PadScene');
    this.renderOverlay();
    prepareLaunch().then(() => { this.state = 'ready'; this.renderOverlay(); });
    this.draw();
  }

  update(time, delta) {
    const dt = Math.min(delta, 100) / 1000;
    this.t += dt;
    this.draw(dt);
  }

  /** Plataforma en pixel art: la misma imagen del despegue, con vapor mientras se prepara y llamas al encender. */
  draw(dt = 0) {
    if (!this.view?.ctx) return;
    const view = this.view;
    const reduced = reducedMotion();
    const ignite = this.state === 'go';
    this.go = ignite ? Math.min(1, this.go + dt / 1.4) : 0;
    const spool = 0.75 * this.go * this.go * (3 - 2 * this.go);
    if (!reduced && dt > 0) {
      if (this.state === 'counting' || this.state === 'hold') { if (Math.random() < 0.25) this.particles.add('gas', -34 + Math.random() * 14, 2 + Math.random() * 4, 4 + Math.random() * 6, 8 + Math.random() * 6, { size: 3, life: 4 }); }
      if (ignite) this.particles.padBillow({ x: 0, throttle: spool, strength: 0.6 });
      this.particles.step(dt * 3);
    }
    const S = {
      time: this.t, reduced, alt: 0, mpp: CAMERA.mpp0, baseY: view.viewH * 0.8 + view.margin, groundS: 0, starShift: 0,
      stage: 0, fairing: true, throttle: spool, engineOn: ignite, betaShown: 0, flicker: Math.random(), airFade: 1, hideRocket: false,
      debris: [], particles: this.particles, rx: 0, ry: PHYS.RE, flowX: 0, flowY: 0, flowPhaseX: 0, flowPhaseY: 0, streakAlpha: 0, prograde: null, recommend: null,
    };
    this.renderer.draw(view.ctx, view.W, view.H, S);
    const a = ignite && !reduced ? Math.round(this.go * 1.5) : 0;
    view.present(a ? Math.round((Math.random() * 2 - 1) * a) : 0, a ? Math.round((Math.random() * 2 - 1) * a) : 0);
  }

  renderOverlay() {
    const e = current();
    const inp = inputs();
    const ov = this.overlay;
    const ready = this.state === 'ready';
    const noSim = !app.vehicleInfo && this.state !== 'prep';
    const pre = app.plan?.pre ?? [];
    ov.innerHTML = `
      <div class="pad-card">
        <span class="kicker">PLATAFORMA DE LANZAMIENTO · ${esc(e.site.name)}</span>
        <h2>${esc(e.launcher.name)} con ${esc(inp.spacecraft.name ?? 'tu nave')}</h2>
        <p>Tu nave pesa ${massLike(e.launchMassKg)} (${fmtKg(e.launchMassKg)}) y va hacia <b>${esc(e.orbitDef.short ?? e.orbitDef.name)}</b>.
        ${this.state === 'prep' ? '<br><span class="muted">Revisando el cohete y el clima…</span>' : ''}</p>
        ${this.state === 'ready' && pre.length ? `<ul class="log">${pre.map((p) => `<li class="${p.severity}"><b>${esc(p.label)}</b> — ${esc(p.consequence)}</li>`).join('')}</ul>` : ''}
        ${noSim && this.state === 'ready' ? '<p class="muted">Para este cohete y este destino todavía no hay simulador de vuelo: el resultado se calcula automáticamente.</p>' : ''}
        <div class="countdown" id="countdown" aria-live="assertive">${this.cdText ?? ''}</div>
        <div class="actions">
          <button data-go="check" ${this.state === 'counting' || this.state === 'hold' ? 'disabled' : ''}>← Volver a revisar</button>
          <button class="primary big" id="start-count" ${ready ? '' : 'disabled'}>${ready ? '🚀 ¡Iniciar la cuenta regresiva!' : 'Preparando…'}</button>
        </div>
        ${app.attempts ? `<p class="muted">Intento número ${app.attempts + 1}${inp.difficulty === 'facil' ? ' (gratis en el nivel fácil)' : ''}.</p>` : ''}
        <div class="fact" id="pad-fact"></div>
      </div>`;
    this.stopFacts?.();
    this.stopFacts = rotateFacts(document.getElementById('pad-fact'));
    document.getElementById('start-count')?.addEventListener('click', () => this.startCountdown());
    ov.querySelector('[data-go]')?.addEventListener('click', (ev) => { app.nav.go(ev.currentTarget.dataset.go); });
  }

  startCountdown() {
    this.state = 'counting';
    document.getElementById('start-count').disabled = true;
    let n = 5;
    const hold = (app.plan?.pre ?? []).find((p) => p.id === 'weather' || p.id === 'minorAnomaly');
    let holdDone = false;
    const el = () => document.getElementById('countdown');
    const tick = () => {
      if (n === 3 && hold && !holdDone) {
        holdDone = true;
        this.state = 'hold';
        el().innerHTML = `<span class="hold">⏸ CUENTA EN ESPERA</span><small>${esc(hold.label)}: ${esc(hold.consequence)}</small>`;
        clearInterval(this.timer);
        setTimeout(() => { this.state = 'counting'; this.timer = setInterval(tick, 900); el().textContent = 'Seguimos…'; }, 3200);
        return;
      }
      if (n > 0) { el().textContent = `T − ${n}`; n--; return; }
      clearInterval(this.timer);
      el().textContent = '¡DESPEGUE!';
      this.state = 'go';
      setTimeout(() => app.nav.go('flight'), 700);
    };
    this.timer = setInterval(tick, 900);
    tick();
  }
}
