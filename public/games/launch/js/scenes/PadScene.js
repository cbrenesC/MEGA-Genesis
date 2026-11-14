// Plataforma de lanzamiento: se ve el cohete, se revisan los imprevistos y se hace la cuenta regresiva.
import { app, inputs, current, reducedMotion } from '../store.js';
import { esc } from '../screens.js';
import { prepareLaunch } from '../flow.js';
import { rotateFacts } from '../ui.js';
import { fmtKg, fmtMUSD, massLike } from '../plain.js';
import { drawRocket, rocketDims } from './rocketArt.js';
import { gradientRect } from './gfx.js';

const Phaser = window.Phaser;

export class PadScene extends Phaser.Scene {
  constructor() { super('PadScene'); }

  create() {
    this.g = this.add.graphics();
    this.t = 0;
    this.state = 'prep'; // prep → ready → counting → hold → go
    this.scale.on('resize', () => this.draw());
    this.events.once('shutdown', () => { this.scale.off('resize'); this.stopFacts?.(); clearInterval(this.timer); });
    document.getElementById('ui').hidden = true;
    document.getElementById('hud').hidden = true;
    this.overlay = document.getElementById('overlay');
    this.overlay.hidden = false;
    app.nav.chrome('PadScene');
    this.renderOverlay();
    prepareLaunch().then(() => { this.state = 'ready'; this.renderOverlay(); });
    this.draw();
  }

  update(time, delta) { this.t += delta / 1000; this.draw(); }

  draw() {
    const { width: W, height: H } = this.scale;
    const g = this.g;
    g.clear();
    // cielo del amanecer
    gradientRect(g, 0, 0, W, H * 0.8, 0x1a2a52, 0xffc08a, 36);
    for (let i = 0; i < 60; i++) {
      const a = 0.25 + 0.25 * Math.sin(this.t * 1.2 + i);
      g.fillStyle(0xffffff, Math.max(0, a * (1 - ((i * 37) % 100) / 140)));
      g.fillCircle(((i * 97) % 100) / 100 * W, ((i * 53) % 100) / 100 * H * 0.45, 1.2);
    }
    const groundY = H * 0.8;
    g.fillStyle(0x23383a, 1); g.fillRect(0, groundY, W, H - groundY);
    g.fillStyle(0x1a2b2d, 1); g.fillRect(0, groundY + 14, W, H - groundY);
    // torre de servicio
    const cx = W * 0.5;
    g.fillStyle(0x38485a, 1);
    g.fillRect(cx - 78, groundY - 190, 12, 190);
    g.fillRect(cx - 78, groundY - 190, 40, 8);
    g.lineStyle(2, 0x38485a, 1);
    for (let y = 0; y < 190; y += 24) { g.beginPath(); g.moveTo(cx - 78, groundY - y); g.lineTo(cx - 40, groundY - y - 24); g.strokePath(); }
    g.fillStyle(0x4a5a6c, 1); g.fillRect(cx - 40, groundY - 6, 80, 8);
    // cohete
    if (app.vehicleInfo) {
      const scale = Math.min(2.2, (H * 0.55) / rocketDims(app.vehicleInfo.vehicle).total);
      this.drawScaledRocket(g, cx, groundY - 6, scale);
    } else {
      g.fillStyle(0x6c7a8a, 0.4); g.fillRect(cx - 12, groundY - 110, 24, 104);
    }
    // vapor de la plataforma
    if (!reducedMotion()) {
      for (let i = 0; i < 6; i++) {
        const k = (this.t * 0.4 + i / 6) % 1;
        g.fillStyle(0xffffff, 0.12 * (1 - k));
        g.fillCircle(cx + 30 + k * 60 + i * 5, groundY - 20 - k * 40, 6 + k * 14);
      }
    }
    // cuenta regresiva en el cielo
    if (this.state === 'counting' && !reducedMotion() && this.shake) this.cameras.main.shake(100, 0.002);
  }

  drawScaledRocket(g, x, y, s) {
    // Phaser Graphics no escala sin contenedor: se usa una transformación de la propia gráfica.
    if (!this.rg) this.rg = this.add.graphics();
    const rg = this.rg;
    rg.clear();
    rg.setPosition(x, y);
    rg.setScale(s);
    drawRocket(rg, app.vehicleInfo.vehicle, { stage: 0, fairing: true, throttle: this.state === 'go' ? 1 : 0, flicker: Math.random() });
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
      this.shake = true;
      setTimeout(() => app.nav.go('flight'), 700);
    };
    this.timer = setInterval(tick, 900);
    tick();
  }
}
