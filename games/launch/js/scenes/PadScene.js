import Phaser from 'phaser';
import { preloadLaunchAudio, startLaunchCountdownAudio, stopLaunchCountdownAudio, setSimulationMusicDucked } from '../../../../src/welcome/core/gameAudio.js';
// Plataforma de lanzamiento: se ve el cohete, se revisan los imprevistos y se hace la cuenta regresiva.
import { app, inputs, current, reducedMotion } from '../store.js';
import { esc } from '../screens.js';
import { prepareLaunch } from '../flow.js';
import { rotateFacts } from '../ui.js';
import { fmtKg, massLike } from '../plain.js';
import { PixelView, FlightRenderer } from './render.js';
import { ParticleSystem } from '../particles.js';
import { CAMERA } from '../world.js';
import { loadSiteWeather, describeWeather, windEastMs, weatherFromConditions } from '../weather.js';
import { siteLocal } from '../launchWeather.js';
import { t } from '../../../../src/i18n/index.js';
import { PHYS, vehicleFor, fuelSummary } from '../flight.js';

// Cohete genérico para dibujar la plataforma cuando el par cohete/destino no tiene simulador.
const GENERIC = { id: 'generic', diameterM: 3, stackKg: 60000, fairingKg: 400, stages: [{ dryKg: 3500, propKg: 38000 }, { dryKg: 700, propKg: 9000 }] };


export class PadScene extends Phaser.Scene {
  constructor() { super('PadScene'); }

  create() {
    preloadLaunchAudio();
    setSimulationMusicDucked(true);
    this.t = 0;
    this.cdText = '';
    this.state = 'prep'; // prep → ready → counting → hold → go
    this.go = 0;
    this.vehicle = vehicleFor(current().launcherId, inputs().orbit.type, app.data)?.vehicle ?? GENERIC;
    this.view = new PixelView(this, 'padView');
    this.view.fit(this.scale.width, this.scale.height);
    this.renderer = new FlightRenderer(this.vehicle, { id: current().site?.id, latDeg: current().site?.latitudeDeg });
    this.particles = new ParticleSystem();
    this.onResize = () => this.view.fit(this.scale.width, this.scale.height);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.view.destroy(); this.stopFacts?.(); clearInterval(this.timer); clearTimeout(this.nextTick); });
    document.getElementById('ui').hidden = true;
    document.getElementById('hud').hidden = true;
    this.overlay = document.getElementById('overlay');
    this.overlay.hidden = false;
    app.nav.chrome('PadScene');
    this.renderOverlay();
    // clima real del sitio en este momento (si no hay conexión: día/noche real y clima típico del mes)
    app.weather = null;
    const site = current().site;
    const lw = app.launchWindow;
    // con una ventana elegida en el planificador, se dibuja el clima previsto para ESA fecha y hora
    if (lw) app.weather = weatherFromConditions(lw.conditions, site?.id, new Date(lw.time), lw.source === 'meteomatics' ? 'pronóstico de Meteomatics para la ventana elegida' : 'MODO SIMULACIÓN (no son datos reales)');
    else loadSiteWeather(site?.id, { seed: app.seed }).then((w) => {
      if (!this.scene.isActive() || this.state === 'go') return;
      app.weather = w;
      const el = document.getElementById('pad-weather');
      if (el) el.textContent = describeWeather(w, site?.name ?? 'el sitio');
    });
    const preparation = {};
    this.preparation = preparation;
    prepareLaunch().then(() => {
      if (this.preparation !== preparation || !this.scene.isActive()) return;
      this.state = 'ready';
      this.renderOverlay();
      this.startCountdown();
    }).catch(() => {
      if (this.preparation !== preparation || !this.scene.isActive()) return;
      this.state = 'error';
      this.renderOverlay();
    });
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
      weather: app.weather, windE: app.weather ? windEastMs(app.weather) * this.t : 0,
      debris: [], particles: this.particles, rx: 0, ry: PHYS.RE, flowX: 0, flowY: 0, flowPhaseX: 0, flowPhaseY: 0, streakAlpha: 0, prograde: null, recommend: null,
    };
    this.renderer.draw(view.ctx, view.W, view.H, S);
    const a = ignite && !reduced ? Math.round(this.go * 1.5) : 0;
    view.present(a ? Math.round((Math.random() * 2 - 1) * a) : 0, a ? Math.round((Math.random() * 2 - 1) * a) : 0);
  }

  /** Ventana de lanzamiento elegida en el planificador de clima (fecha y hora del sitio, semáforo y puntuación). */
  windowLine() {
    const lw = app.launchWindow;
    const l = siteLocal(lw.time, current().site?.id);
    return t('pad.window', { when: `${l.date} ${l.clock}`, status: lw.status, score: lw.score, source: t(lw.source === 'meteomatics' ? 'pad.window.real' : 'pad.window.sim') });
  }

  /** Peso real del cohete y combustible cargado (en toneladas). */
  fuelLine() {
    const info = app.vehicleInfo ?? vehicleFor(current().launcherId, inputs().orbit.type, app.data);
    if (!info) return ` Combustible inicial del cohete: <b>${app.rocketFuelPct} %</b>.`;
    const f = fuelSummary(info.vehicle, current().launchMassKg, app.rocketFuelPct / 100);
    const tons = (kg) => (Math.round(kg / 100) / 10).toLocaleString('es');
    return `<br>El cohete completo pesa <b>${tons(f.liftoffKg)} toneladas</b> al despegar, con <b>${tons(f.propKg)} t</b> de combustible (${app.rocketFuelPct} % del tanque).`;
  }

  renderOverlay() {
    const e = current();
    const inp = inputs();
    const ov = this.overlay;
    const noSim = !app.vehicleInfo && this.state !== 'prep';
    const pre = app.plan?.pre ?? [];
    ov.innerHTML = `
      <div class="pad-card">
        <span class="kicker">PLATAFORMA DE LANZAMIENTO · ${esc(e.site.name)}</span>
        <h2>${esc(e.launcher.name)} con ${esc(inp.spacecraft.name ?? 'tu nave')}</h2>
        <p>Tu nave pesa ${massLike(e.launchMassKg)} (${fmtKg(e.launchMassKg)}) y va hacia <b>${esc(e.orbitDef.short ?? e.orbitDef.name)}</b>.${this.fuelLine()}
        ${this.state === 'prep' ? '<br><span class="muted">Revisando el cohete y el clima…</span>' : ''}</p>
        ${this.state === 'ready' && pre.length ? `<ul class="log">${pre.map((p) => `<li class="${p.severity}"><b>${esc(p.label)}</b> — ${esc(p.consequence)}</li>`).join('')}</ul>` : ''}
        ${noSim && this.state === 'ready' ? '<p class="muted">Para este cohete y este destino todavía no hay simulador de vuelo: el resultado se calcula automáticamente.</p>' : ''}
        ${app.launchWindow ? `<p><b>${esc(this.windowLine())}</b></p>` : ''}
        <p class="muted" id="pad-weather">${app.weather ? esc(describeWeather(app.weather, e.site.name)) : 'Consultando el clima real del sitio…'}</p>
        <div class="countdown" id="countdown" aria-live="assertive">${this.cdText ?? ''}</div>
        ${this.state === 'error' ? '<p role="alert">No se pudo preparar el vuelo. Vuelve al centro de control.</p>' : ''}
        <div class="actions"><button type="button" id="pad-exit">← Volver al centro de control</button></div>
        ${app.attempts ? `<p class="muted">Intento número ${app.attempts + 1}${inp.difficulty === 'facil' ? ' (gratis en el nivel fácil)' : ''}.</p>` : ''}
        <div class="fact" id="pad-fact"></div>
      </div>`;
    this.stopFacts?.();
    this.stopFacts = rotateFacts(document.getElementById('pad-fact'));
    document.getElementById('pad-exit').onclick = () => { stopLaunchCountdownAudio(); app.nav.exit(); };
  }

  startCountdown() {
    this.state = 'counting';
    startLaunchCountdownAudio();
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
        this.nextTick = setTimeout(() => { this.state = 'counting'; this.timer = setInterval(tick, 900); el().textContent = 'Seguimos…'; }, 3200);
        return;
      }
      if (n > 0) { el().textContent = `T − ${n}`; n--; return; }
      clearInterval(this.timer);
      el().textContent = '¡DESPEGUE!';
      this.state = 'go';
      this.nextTick = setTimeout(() => app.nav.go('flight'), 700);
    };
    this.timer = setInterval(tick, 900);
    tick();
  }
}
