// Panel de control del vuelo (HTML encima del canvas), compacto y según el momento del vuelo.
//
// Lo que se ve siempre: altura, velocidad, combustible y la palanca de empuje. Lo demás aparece sólo cuando sirve:
//   · plataforma / despegue → empuje y empuje/peso (¿ya supera el peso?), estado de la etapa
//   · atmósfera             → presión del aire (sólo si importa) y la inclinación
//   · espacio               → punto más alto y más bajo, y el modo de navegación
// Los datos secundarios van en un panel desplegable «Datos». Los íconos son pixel art (SVG sin suavizado).

import { PHYS } from './flight.js';
import { esc } from './screens.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (v, d = 0) => v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d });

const TERM = (id, label) => `<button class="term" data-term="${id}" aria-label="${esc(label)}">?</button>`;

// Íconos de 8×8: cada letra es un píxel de color.
const ICONS = {
  alt: ['...##...', '..####..', '.######.', '...##...', '...##...', '...##...', '########', '........'],
  spd: ['........', '..####..', '.#....#.', '#..##..#', '#.####.#', '#......#', '.#....#.', '..####..'],
  fuel: ['..####..', '.#....#.', '.#.##.#.', '.#.##.#.', '.#....#.', '.######.', '.######.', '........'],
  pwr: ['...#....', '..##....', '.###.#..', '.#####..', '#######.', '.#####..', '..###...', '...#....'],
  stg: ['...##...', '..####..', '..####..', '..####..', '..####..', '.######.', '.#.##.#.', '..#..#..'],
  orbit: ['..####..', '.#....#.', '#..##..#', '#.####.#', '#..##..#', '.#....#.', '..####..', '........'],
  twr: ['...##...', '..####..', '.######.', '...##...', '...##...', '########', '########', '........'],
};
export const icon = (name, color = 'currentColor') => {
  const rows = ICONS[name]; if (!rows) return '';
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
  return `<svg class="px-ico" viewBox="0 0 8 8" width="16" height="16" fill="${color}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
};

const PHASE_NAME = { pad: 'En la plataforma', liftoff: 'Despegue', atmosphere: 'Vuelo atmosférico', upper: 'Atmósfera superior', space: 'Espacio' };

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
    this.phase = 'pad';
    this.eventTimer = null;
    this.build();
    this.bind();
  }

  build() {
    const { stageNames, difficulty, transfer } = this.opts;
    this.root.dataset.phase = 'pad';
    this.root.innerHTML = `
    <div class="hud-top">
      <div class="hud-main">
        <div class="phase-chip" id="phase" aria-live="polite">${icon('stg')}<span id="phase-name">${PHASE_NAME.pad}</span></div>
        <div class="telemetry" id="tele" aria-label="Telemetría">
          <div class="t-item t-big"><span class="t-label">${icon('alt')} Altura</span><b id="t-alt">0 m</b></div>
          <div class="t-item t-big"><span class="t-label">${icon('spd')} Velocidad</span><b id="t-speed">0 m/s</b></div>
          <div class="t-item only-ground"><span class="t-label">${icon('twr')} Empuje/peso ${TERM('throttle', '¿Qué es empuje contra peso?')}</span><b id="t-twr">0,00</b></div>
          <div class="t-item t-q" id="q-item" hidden><span class="t-label">Presión aire ${TERM('maxq', '¿Qué es Max-Q?')}</span><b id="t-q">0</b><div class="qbar" aria-hidden="true"><i id="t-qbar"></i><u></u><s></s></div></div>
          <div class="t-item only-orbit"><span class="t-label">Punto más alto ${TERM('apoapsis', '¿Qué es el punto más alto (apoapsis)?')}</span><b id="t-apo">—</b></div>
          <div class="t-item only-orbit"><span class="t-label">Punto más bajo ${TERM('periapsis', '¿Qué es el punto más bajo (periapsis)?')}</span><b id="t-peri">—</b></div>
        </div>
        <details class="more" id="more"><summary>Más datos</summary>
          <div class="more-body">
            <div class="t-item"><span class="t-label">Ángulo</span><b id="t-angle">0°</b></div>
            <div class="t-item"><span class="t-label">Tiempo</span><b id="t-time">T+0:00</b></div>
            <div class="t-item"><span class="t-label">Presión del aire</span><b id="t-q2">0 kPa</b></div>
            <div class="t-item"><span class="t-label">Punto más alto</span><b id="t-apo2">—</b></div>
            <div class="t-item"><span class="t-label">Punto más bajo</span><b id="t-peri2">—</b></div>
            <div class="fuel" id="fuel" aria-label="Combustible por etapa">${stageNames.map((n, i) => `<div class="f-row" data-stage="${i}"><span>${esc(n)}</span><div class="f-bar"><i></i></div><b>100 %</b></div>`).join('')}</div>
          </div>
        </details>
      </div>
      <div class="hud-tools">
        <div class="warp" role="group" aria-label="Velocidad del tiempo">
          <button data-warp="1" class="is-on" title="Tiempo normal (1)">1×</button><button data-warp="2" title="Doble de rápido (2)">2×</button><button data-warp="5" title="Cinco veces más rápido (3)">5×</button>
          <button id="b-jump" title="Saltar hasta el punto más alto de tu órbita (J)" hidden>⏩ Saltar</button>
        </div>
        <div class="zoom" role="group" aria-label="Zoom de la cámara"><button id="b-zoom-out" title="Alejar la cámara (−)">−</button><button id="b-zoom-in" title="Acercar la cámara (+)">+</button></div>
        <button id="b-map" class="tool" title="Ver tu órbita desde arriba (M)">🌍 <span>Mapa</span></button>
        ${difficulty === 'facil' ? '<button id="b-auto" class="tool" aria-pressed="false" title="Que el piloto automático vuele por ti (P)">🤖 <span class="tl">Piloto automático:</span> <b class="auto-state">no</b></button>' : ''}
        <button id="b-pause" class="tool" title="Pausa (Esc)">⏸</button>
      </div>
    </div>
    <div class="hud-event" id="hud-event" aria-live="assertive"></div>
    <div class="hud-msg" id="hud-msg" role="status" aria-live="polite"></div>
    <div class="hud-left">
      <div class="th-label">${icon('pwr')}<span>Empuje ${TERM('throttle', '¿Qué es el empuje?')}</span><b id="th-val">0 %</b></div>
      <div class="throttle" id="throttle" role="slider" aria-label="Empuje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <div class="tr-fill" id="tr-fill"></div><div class="tr-live" id="tr-live"></div><div class="tr-suggest" id="tr-suggest" hidden><span>sugerido</span></div><div class="tr-knob" id="tr-knob"></div>
        <div class="tr-ticks"><i>100</i><i>50</i><i>0</i></div>
      </div>
      <div class="th-btns"><button id="th-max" title="Empuje al máximo (Z)">MÁX</button><button id="th-off" title="Apagar motor (X)">APAGAR</button></div>
    </div>
    <div class="hud-attitude" id="attitude" aria-hidden="true"><svg viewBox="-50 -50 100 100" shape-rendering="crispEdges"><circle r="44" class="att-ring"/><line x1="-44" y1="0" x2="44" y2="0" class="att-horizon"/><g id="att-hint" hidden><line x1="0" y1="0" x2="0" y2="-40" class="att-ghost"/></g><g id="att-rocket"><path d="M0,-38 L7,-8 L7,22 L-7,22 L-7,-8 Z" class="att-body"/></g></svg><small id="att-label">0°</small></div>
    <div class="hud-bottom">
      <div class="fuel-compact" id="fuel-compact" aria-label="Combustible">
        <div class="fc-head">${icon('fuel')}<span>Combustible</span><b id="fc-total">100 %</b></div>
        <div class="f-bar big"><i id="fc-bar"></i></div>
        <div class="fc-stage">${icon('stg')}<span id="fc-stage">Etapa 1</span><b id="fc-stage-pct">100 %</b></div>
      </div>
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
    $('#b-zoom-in', root).addEventListener('click', () => this.h.zoom?.(1));
    $('#b-zoom-out', root).addEventListener('click', () => this.h.zoom?.(-1));
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
      if (ev.target.closest?.('input, textarea, select, summary')) return;
      const k = ev.key;
      if (['ArrowLeft', 'a', 'A'].includes(k)) { this.controls.left = true; ev.preventDefault(); }
      else if (['ArrowRight', 'd', 'D'].includes(k)) { this.controls.right = true; ev.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'Shift') { this.keys.add('up'); ev.preventDefault(); }
      else if (k === 'ArrowDown' || k === 'Control') { this.keys.add('down'); ev.preventDefault(); }
      else if (k === ' ') { this.h.separate(); ev.preventDefault(); }
      else if (k === 'f' || k === 'F') this.h.fairing();
      else if (k === 'm' || k === 'M') this.h.map();
      else if (k === '+' || k === '=') this.h.zoom?.(1);
      else if (k === '-' || k === '_') this.h.zoom?.(-1);
      else if (k === '0') this.h.zoom?.(0);
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
    clearTimeout(this.eventTimer);
    this.root.innerHTML = '';
  }

  /** Fase del vuelo: la interfaz muestra sólo lo que hace falta en ese momento. */
  setPhase(phase) {
    this.phase = phase;
    this.root.dataset.phase = phase;
    $('#phase-name', this.root).textContent = PHASE_NAME[phase] ?? phase;
  }

  /** Aviso corto de un evento importante (despegue, separación, espacio…). Desaparece solo. */
  event(text, kind = 'info') {
    const el = $('#hud-event', this.root);
    if (!el) return;
    el.className = 'hud-event';
    void el.offsetWidth; // reinicia la animación
    el.textContent = text;
    el.className = `hud-event show ${kind}`;
    clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => { el.className = 'hud-event'; }, 2600);
  }

  /** Empuje real del motor (marca delgada sobre la palanca): útil durante el encendido, antes de que el motor llegue a lo pedido. */
  setLive({ throttle }) {
    const live = $('#tr-live', this.root);
    if (live) { live.style.bottom = `${Math.round(throttle * 100)}%`; live.hidden = false; }
    $('#th-val', this.root).textContent = `${Math.round(throttle * 100)} %`;
  }

  setThrottle(v) {
    this.controls.throttle = Math.min(1, Math.max(0, v));
    this.drawThrottle();
  }

  drawThrottle() {
    const pct = Math.round(this.controls.throttle * 100);
    $('#tr-fill', this.root).style.height = `${pct}%`;
    $('#tr-knob', this.root).style.bottom = `calc(${pct}% - 12px)`;
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
    btn.querySelector('.auto-state').textContent = this.controls.autopilot ? 'sí' : 'no';
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
    const phase = ctx.phase ?? this.phase;
    const km = t.altKm;
    $('#t-alt', root).textContent = km < 10 ? `${fmt(km * 1000)} m` : `${fmt(km, km < 100 ? 1 : 0)} km`;
    // velocidad: respecto al suelo y al aire abajo, y respecto al espacio arriba (se mezclan sin saltos entre 40 y 100 km)
    const [rvx, rvy] = sim.relVelocity();
    const mixF = Math.min(1, Math.max(0, (sim.altitude - 40000) / 60000));
    const v = Math.hypot(rvx * (1 - mixF) + sim.vx * mixF, rvy * (1 - mixF) + sim.vy * mixF);
    $('#t-speed', root).textContent = v < 1000 ? `${fmt(v)} m/s` : `${fmt(v / 1000, 2)} km/s`;
    const apo = Number.isFinite(t.apoKm) ? `${fmt(t.apoKm)} km` : 'sin límite';
    const peri = t.periKm < 0 ? 'bajo tierra' : `${fmt(t.periKm)} km`; // sin órbita todavía
    $('#t-apo', root).textContent = apo; $('#t-apo2', root).textContent = apo;
    $('#t-peri', root).textContent = peri; $('#t-peri2', root).textContent = peri;
    $('#t-peri', root).className = t.periKm * 1000 >= PHYS.PERI_OK ? 'good' : '';
    $('#t-angle', root).textContent = `${fmt(t.betaDeg)}°`;
    const secs = Math.floor(t.t);
    $('#t-time', root).textContent = `T+${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    // empuje contra peso: lo que decide si el cohete despega
    const twrEl = $('#t-twr', root);
    const tw = sim.thrustToWeight(Math.max(this.controls.throttle, sim.throttle));
    twrEl.textContent = fmt(tw, 2);
    twrEl.className = tw >= 1 ? 'good' : tw > 0 ? 'q-warn' : '';

    // presión del aire: sólo se muestra cuando importa (o en un aviso)
    const q = t.q / 1000;
    const qState = t.q > PHYS.Q_LIMIT ? 'bad' : t.q > PHYS.Q_WARN ? 'warn' : 'ok';
    const showQ = t.q > 3000 && sim.altitude < PHYS.ATM_TOP;
    $('#q-item', root).hidden = !showQ;
    const qEl = $('#t-q', root);
    const qTxt = `${q < 0.05 ? '0' : fmt(q, 1)} kPa ${qState === 'bad' ? '✖' : qState === 'warn' ? '⚠' : ''}`;
    qEl.textContent = qTxt; qEl.className = `q-${qState}`;
    $('#t-q2', root).textContent = qTxt;
    $('#t-qbar', root).style.width = `${Math.min(100, (t.q / (PHYS.Q_LIMIT * PHYS.Q_BREAK_FACTOR)) * 100)}%`;

    // actitud (sólo mientras se pilotea dentro de la atmósfera)
    $('#att-rocket', root).setAttribute('transform', `rotate(${t.betaDeg.toFixed(1)})`);
    $('#att-label', root).textContent = `${fmt(t.betaDeg)}°`;
    const hint = $('#att-hint', root);
    if (ctx.recommendBetaDeg != null) { hint.removeAttribute('hidden'); hint.setAttribute('transform', `rotate(${ctx.recommendBetaDeg.toFixed(1)})`); } else hint.setAttribute('hidden', '');

    // combustible: barra total + etapa actual (el detalle por etapa está en «Más datos»)
    root.querySelectorAll('.f-row').forEach((row) => {
      const i = Number(row.dataset.stage);
      const st = sim.vehicle.stages[i];
      const frac = i < sim.stage ? 0 : sim.fuel[i] / st.propKg;
      row.classList.toggle('is-active', i === sim.stage && sim.status === 'flying');
      row.classList.toggle('is-gone', i < sim.stage);
      row.querySelector('i').style.width = `${Math.max(0, frac * 100)}%`;
      row.querySelector('b').textContent = i < sim.stage ? '✔ soltada' : `${Math.round(frac * 100)} %`;
    });
    const totalPct = Math.round(sim.fuelLeftPct);
    $('#fc-total', root).textContent = `${totalPct} %`;
    const bar = $('#fc-bar', root);
    bar.style.width = `${Math.max(0, Math.min(100, sim.fuelLeftPct))}%`;
    bar.className = totalPct < 12 ? 'low' : '';
    const cur = sim.stage < sim.stageCount ? sim.stage : sim.stageCount - 1;
    const stagePct = sim.stage >= sim.stageCount ? 0 : Math.round(sim.stageFuelFrac * 100);
    $('#fc-stage', root).textContent = sim.stage >= sim.stageCount ? 'Sin etapas' : `Etapa ${cur + 1} de ${sim.stageCount}${sim.engineOut ? ' · vacía' : ''}`;
    $('#fc-stage-pct', root).textContent = `${stagePct} %`;
    $('#fuel-compact', root).classList.toggle('is-empty', sim.engineOut);

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

    const sg = $('#tr-suggest', root);
    if (ctx.suggestThrottle != null) { sg.hidden = false; sg.style.bottom = `${Math.round(ctx.suggestThrottle * 100)}%`; sg.querySelector('span').textContent = `sugerido ${Math.round(ctx.suggestThrottle * 100)} %`; } else sg.hidden = true;
    // marca del empuje real del motor (sube hasta lo pedido)
    const live = $('#tr-live', root);
    live.hidden = !(sim.status === 'flying' && Math.abs(sim.throttle - this.controls.throttle) > 0.02);
    live.style.bottom = `${Math.round(sim.throttle * 100)}%`;
    if (!live.hidden) $('#th-val', root).textContent = `${Math.round(sim.throttle * 100)} / ${Math.round(this.controls.throttle * 100)} %`;
    else if (sim.status === 'flying') $('#th-val', root).textContent = `${Math.round(this.controls.throttle * 100)} %`;
    // el deslizador sigue al piloto automático / apagado de motor
    if (ctx.followThrottle != null && Math.abs(ctx.followThrottle - this.controls.throttle) > 0.01) this.setThrottle(ctx.followThrottle);
    sim.status === 'flying' && $('#throttle', root).classList.toggle('is-limit', sim.engineOut);
    void phase;
  }
}
