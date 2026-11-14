// Panel de control del vuelo (HTML encima del canvas): telemetría, empuje, giro, separar etapa, mapa y tiempo.
// Inspirado en la idea de los simuladores de vuelo espacial móviles (controles grandes, datos claros),
// pero con diseño y textos propios.

import { PHYS } from './flight.js';
import { esc } from './screens.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (v, d = 0) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

const TERM = (id, label) => `<button class="term" data-term="${id}" aria-label="${esc(label)}">?</button>`;

export class Hud {
  /**
   * @param {HTMLElement} root  contenedor #hud
   * @param {object} handlers   { separate, fairing, map, warp(n), autopilot(bool), finish, prograde(bool), transfer, jumpApo, pause }
   * @param {object} opts       { difficulty, destKind, stageNames[], hasAutopilot, transfer }
   */
  constructor(root, handlers, opts) {
    this.root = root;
    this.h = handlers;
    this.opts = opts;
    this.controls = { left: false, right: false, throttle: 0, autopilot: false, prograde: false };
    this.warp = 1;
    this.keys = new Set();
    this.build();
    this.bind();
  }

  build() {
    const { stageNames, difficulty, transfer } = this.opts;
    this.root.innerHTML = `
    <div class="hud-top">
      <div class="telemetry" id="tele" aria-label="Telemetría">
        <div class="t-item"><span class="t-label">Altura</span><b id="t-alt">0</b></div>
        <div class="t-item"><span class="t-label">Velocidad</span><b id="t-speed">0</b></div>
        <div class="t-item"><span class="t-label">Ángulo</span><b id="t-angle">0°</b></div>
        <div class="t-item"><span class="t-label">Punto más alto ${TERM('apoapsis', '¿Qué es el punto más alto (apoapsis)?')}</span><b id="t-apo">—</b></div>
        <div class="t-item"><span class="t-label">Punto más bajo ${TERM('periapsis', '¿Qué es el punto más bajo (periapsis)?')}</span><b id="t-peri">—</b></div>
        <div class="t-item t-q"><span class="t-label">Presión del aire ${TERM('maxq', '¿Qué es Max-Q?')}</span><b id="t-q">0</b><div class="qbar" aria-hidden="true"><i id="t-qbar"></i><u></u><s></s></div></div>
        <div class="t-item"><span class="t-label">Tiempo</span><b id="t-time">T+0:00</b></div>
      </div>
      <div class="hud-tools">
        <div class="warp" role="group" aria-label="Velocidad del tiempo">
          <button data-warp="1" class="is-on" title="Tiempo normal (1)">1×</button><button data-warp="2" title="Doble de rápido (2)">2×</button><button data-warp="5" title="Cinco veces más rápido (3)">5×</button>
          <button id="b-jump" title="Saltar hasta el punto más alto de tu órbita (J)" hidden>⏩ Saltar</button>
        </div>
        <button id="b-map" class="tool" title="Ver tu órbita desde arriba (M)">🌍 Mapa</button>
        ${difficulty === 'facil' ? '<button id="b-auto" class="tool" aria-pressed="false" title="Que el piloto automático vuele por ti (P)">🤖 Piloto automático: <span>no</span></button>' : ''}
        <button id="b-pause" class="tool" title="Pausa (Esc)">⏸</button>
      </div>
    </div>
    <div class="hud-msg" id="hud-msg" role="status" aria-live="polite"></div>
    <div class="hud-left">
      <div class="throttle" id="throttle" role="slider" aria-label="Empuje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <div class="tr-fill" id="tr-fill"></div><div class="tr-knob" id="tr-knob"></div>
        <div class="tr-ticks"><i>100</i><i>50</i><i>0</i></div>
      </div>
      <div class="th-label">Empuje ${TERM('throttle', '¿Qué es el empuje?')}<b id="th-val">0 %</b></div>
      <div class="th-btns"><button id="th-max" title="Empuje al máximo (Z)">MÁX</button><button id="th-off" title="Apagar motor (X)">APAGAR</button></div>
    </div>
    <div class="hud-attitude" aria-hidden="true"><svg viewBox="-50 -50 100 100"><circle r="44" class="att-ring"/><line x1="-44" y1="0" x2="44" y2="0" class="att-horizon"/><g id="att-hint" hidden><line x1="0" y1="0" x2="0" y2="-40" class="att-ghost"/></g><g id="att-rocket"><path d="M0,-38 L7,-8 L7,22 L-7,22 L-7,-8 Z" class="att-body"/></g></svg><small id="att-label">0°</small></div>
    <div class="hud-bottom">
      <div class="fuel" id="fuel" aria-label="Combustible por etapa">${stageNames.map((n, i) => `<div class="f-row" data-stage="${i}"><span>${esc(n)}</span><div class="f-bar"><i></i></div><b>100 %</b></div>`).join('')}</div>
      <div class="hud-actions">
        <div class="steer" role="group" aria-label="Girar el cohete">
          <button id="b-left" class="big-btn" aria-label="Girar a la izquierda (A)">◀ <small>Izq.</small></button>
          <button id="b-right" class="big-btn" aria-label="Girar a la derecha (D)">▶ <small>Der.</small></button>
        </div>
        <button id="b-sep" class="big-btn sep" title="Separar la etapa (Espacio)">✂ Separar etapa <small>Espacio</small></button>
        <button id="b-fairing" class="big-btn" title="Soltar la punta que protege la nave (F)">📦 Soltar cofia <small>F</small></button>
        <button id="b-prograde" class="big-btn" aria-pressed="false" title="Apuntar hacia donde vas (R)">🧭 Mirar adelante <small>R</small></button>
        ${transfer ? '<button id="b-transfer" class="big-btn transfer" hidden>🚀 Encender transferencia</button>' : ''}
        <button id="b-finish" class="big-btn finish" hidden>✔ Terminar vuelo</button>
      </div>
    </div>`;
  }

  bind() {
    const root = this.root;
    const press = (el, down) => ['pointerdown'].forEach((e) => el.addEventListener(e, (ev) => { ev.preventDefault(); down(true); el.setPointerCapture?.(ev.pointerId); }));
    const hold = (el, key) => {
      const set = (v) => { this.controls[key] = v; el.classList.toggle('is-down', v); };
      press(el, set);
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((e) => el.addEventListener(e, () => set(false)));
    };
    hold($('#b-left', root), 'left');
    hold($('#b-right', root), 'right');
    $('#b-sep', root).addEventListener('click', () => this.h.separate());
    $('#b-fairing', root).addEventListener('click', () => this.h.fairing());
    $('#b-map', root).addEventListener('click', () => this.h.map());
    $('#b-pause', root).addEventListener('click', () => this.h.pause());
    $('#b-finish', root).addEventListener('click', () => this.h.finish());
    $('#b-jump', root).addEventListener('click', () => this.h.jumpApo());
    $('#b-prograde', root).addEventListener('click', () => this.togglePrograde());
    $('#b-transfer', root)?.addEventListener('click', () => this.h.transfer());
    root.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', () => this.setWarp(Number(b.dataset.warp))));
    $('#b-auto', root)?.addEventListener('click', () => this.toggleAuto());
    $('#th-max', root).addEventListener('click', () => this.setThrottle(1));
    $('#th-off', root).addEventListener('click', () => this.setThrottle(0));

    // Deslizador de empuje (arrastrar con el dedo o el mouse, o con el teclado)
    const track = $('#throttle', root);
    const fromPointer = (ev) => {
      const r = track.getBoundingClientRect();
      this.setThrottle(1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)));
    };
    let dragging = false;
    track.addEventListener('pointerdown', (ev) => { dragging = true; track.setPointerCapture(ev.pointerId); fromPointer(ev); ev.preventDefault(); });
    track.addEventListener('pointermove', (ev) => { if (dragging) fromPointer(ev); });
    ['pointerup', 'pointercancel'].forEach((e) => track.addEventListener(e, () => { dragging = false; }));
    track.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') { this.setThrottle(this.controls.throttle + 0.05); ev.preventDefault(); }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') { this.setThrottle(this.controls.throttle - 0.05); ev.preventDefault(); }
    });

    // Teclado
    this.onKeyDown = (ev) => {
      if (ev.target.closest?.('input, textarea, select')) return;
      const k = ev.key;
      if (['ArrowLeft', 'a', 'A'].includes(k)) { this.controls.left = true; ev.preventDefault(); }
      else if (['ArrowRight', 'd', 'D'].includes(k)) { this.controls.right = true; ev.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'Shift') { this.keys.add('up'); ev.preventDefault(); }
      else if (k === 'ArrowDown' || k === 'Control') { this.keys.add('down'); ev.preventDefault(); }
      else if (k === ' ') { this.h.separate(); ev.preventDefault(); }
      else if (k === 'f' || k === 'F') this.h.fairing();
      else if (k === 'm' || k === 'M') this.h.map();
      else if (k === 'z' || k === 'Z') this.setThrottle(1);
      else if (k === 'x' || k === 'X') this.setThrottle(0);
      else if (k === 'r' || k === 'R') this.togglePrograde();
      else if (k === 'j' || k === 'J') this.h.jumpApo();
      else if (k === 'p' || k === 'P') this.toggleAuto();
      else if (['1', '2', '3'].includes(k)) this.setWarp([1, 2, 5][Number(k) - 1]);
    };
    this.onKeyUp = (ev) => {
      const k = ev.key;
      if (['ArrowLeft', 'a', 'A'].includes(k)) this.controls.left = false;
      else if (['ArrowRight', 'd', 'D'].includes(k)) this.controls.right = false;
      else if (k === 'ArrowUp' || k === 'Shift') this.keys.delete('up');
      else if (k === 'ArrowDown' || k === 'Control') this.keys.delete('down');
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.root.innerHTML = '';
  }

  setThrottle(v) {
    this.controls.throttle = Math.min(1, Math.max(0, v));
    this.drawThrottle();
  }

  drawThrottle() {
    const pct = Math.round(this.controls.throttle * 100);
    $('#tr-fill', this.root).style.height = `${pct}%`;
    $('#tr-knob', this.root).style.bottom = `calc(${pct}% - 14px)`;
    $('#th-val', this.root).textContent = `${pct} %`;
    const tr = $('#throttle', this.root);
    tr.setAttribute('aria-valuenow', String(pct));
  }

  setWarp(n) {
    this.warp = n;
    this.h.warp(n);
    this.root.querySelectorAll('[data-warp]').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.warp) === n));
  }

  toggleAuto(force) {
    const btn = $('#b-auto', this.root);
    if (!btn) return;
    this.controls.autopilot = force ?? !this.controls.autopilot;
    btn.setAttribute('aria-pressed', String(this.controls.autopilot));
    btn.querySelector('span').textContent = this.controls.autopilot ? 'sí' : 'no';
    btn.classList.toggle('is-on', this.controls.autopilot);
    this.h.autopilot(this.controls.autopilot);
  }

  togglePrograde(force) {
    this.controls.prograde = force ?? !this.controls.prograde;
    $('#b-prograde', this.root).setAttribute('aria-pressed', String(this.controls.prograde));
    $('#b-prograde', this.root).classList.toggle('is-on', this.controls.prograde);
    this.h.prograde(this.controls.prograde);
  }

  message(text, kind = 'info') {
    const el = $('#hud-msg', this.root);
    if (el.dataset.text === text && el.dataset.kind === kind) return;
    el.dataset.text = text; el.dataset.kind = kind;
    el.className = `hud-msg ${text ? kind : ''}`;
    el.innerHTML = text ? `<span class="m-ico">${{ info: 'ℹ', ok: '✔', warn: '⚠', bad: '✖', hint: '➜' }[kind] ?? 'ℹ'}</span><span>${esc(text)}</span>` : '';
  }

  /** Teclas de empuje con Shift/Ctrl o flechas arriba/abajo (se llama cada cuadro). */
  tickKeys(dt) {
    if (this.keys.has('up')) this.setThrottle(this.controls.throttle + dt * 0.6);
    if (this.keys.has('down')) this.setThrottle(this.controls.throttle - dt * 0.6);
  }

  get steer() { return (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0); }

  update(sim, ctx) {
    const t = sim.telemetry();
    const root = this.root;
    const km = t.altKm;
    $('#t-alt', root).textContent = km < 10 ? `${fmt(km * 1000)} m` : `${fmt(km, km < 100 ? 1 : 0)} km`;
    const v = t.speedKmS * 1000;
    $('#t-speed', root).textContent = v < 1000 ? `${fmt(v)} m/s` : `${fmt(t.speedKmS, 2)} km/s`;
    $('#t-angle', root).textContent = `${fmt(t.betaDeg)}°`;
    $('#t-apo', root).textContent = Number.isFinite(t.apoKm) ? `${fmt(t.apoKm)} km` : 'sin límite';
    $('#t-peri', root).textContent = `${fmt(t.periKm)} km`;
    const peri = $('#t-peri', root);
    peri.className = t.periKm * 1000 >= PHYS.PERI_OK ? 'good' : '';
    const q = t.q / 1000;
    const qEl = $('#t-q', root);
    const qState = t.q > PHYS.Q_LIMIT ? 'bad' : t.q > PHYS.Q_WARN ? 'warn' : 'ok';
    qEl.textContent = `${q < 0.05 ? '0' : fmt(q, 1)} kPa ${qState === 'bad' ? '✖' : qState === 'warn' ? '⚠' : ''}`;
    qEl.className = `q-${qState}`;
    $('#t-qbar', root).style.width = `${Math.min(100, (t.q / (PHYS.Q_LIMIT * PHYS.Q_BREAK_FACTOR)) * 100)}%`;
    const secs = Math.floor(t.t);
    $('#t-time', root).textContent = `T+${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // actitud
    $('#att-rocket', root).setAttribute('transform', `rotate(${t.betaDeg.toFixed(1)})`);
    $('#att-label', root).textContent = `${fmt(t.betaDeg)}°`;
    const hint = $('#att-hint', root);
    if (ctx.recommendBetaDeg != null) { hint.removeAttribute('hidden'); hint.setAttribute('transform', `rotate(${ctx.recommendBetaDeg.toFixed(1)})`); } else hint.setAttribute('hidden', '');

    // combustible
    root.querySelectorAll('.f-row').forEach((row) => {
      const i = Number(row.dataset.stage);
      const st = sim.vehicle.stages[i];
      const frac = i < sim.stage ? 0 : sim.fuel[i] / st.propKg;
      row.classList.toggle('is-active', i === sim.stage && sim.status === 'flying');
      row.classList.toggle('is-gone', i < sim.stage);
      row.querySelector('i').style.width = `${Math.max(0, frac * 100)}%`;
      row.querySelector('b').textContent = i < sim.stage ? '✔ soltada' : `${Math.round(frac * 100)} %`;
    });

    // botones según el momento
    const stagesLeft = sim.stage < sim.stageCount - 1;
    const sep = $('#b-sep', root);
    sep.disabled = sim.stage >= sim.stageCount - 0 || sim.status !== 'flying';
    sep.classList.toggle('pulse', Boolean(ctx.pulseSep));
    sep.firstChild.textContent = stagesLeft ? '✂ Separar etapa ' : '✂ Soltar última etapa ';
    const fair = $('#b-fairing', root);
    fair.disabled = !sim.fairing || sim.status !== 'flying';
    fair.classList.toggle('pulse', Boolean(ctx.pulseFairing));
    fair.hidden = !sim.fairing;
    $('#b-jump', root).hidden = !ctx.canJump;
    const fin = $('#b-finish', root);
    fin.hidden = !ctx.canFinish;
    fin.classList.toggle('pulse', Boolean(ctx.pulseFinish));
    const tr = $('#b-transfer', root);
    if (tr) { tr.hidden = !ctx.canTransfer; tr.classList.toggle('pulse', Boolean(ctx.pulseTransfer)); }
    $('#b-prograde', root).hidden = !ctx.canProgradeMode;

    // el deslizador sigue al piloto automático / apagado de motor
    if (ctx.followThrottle != null && Math.abs(ctx.followThrottle - this.controls.throttle) > 0.01) this.setThrottle(ctx.followThrottle);
    sim.status === 'flying' && $('#throttle', root).classList.toggle('is-limit', sim.engineOut);
  }
}
