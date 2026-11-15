// Módulo lunar (Phaser 3). Phaser dibuja el terreno y el rover; las pantallas de decisión y el HUD son HTML.
//   Briefing → Construcción → Exploración (recoger → analizar → transmitir) → Resultados
// Toda la lógica vive en rules.js; aquí solo se lee el estado y se dibuja.
import {
  LIMITS, WORLD, RULES, PHOTO_DEFS, CATEGORIES, COMPONENTS, RECOMMENDED_BUILD, SAMPLE_DEFS,
  emptyBuild, selectComponent, computeBuild, validateBuild, createMission, step, startAction, availability,
  progress, evaluate, snapshot, restoreMission, fmt, dataPackets, allAcked,
} from './rules.js';
import { roverCanvas, terrainCanvas, sampleCanvas, poiCanvas, earthCanvas, skyCanvas } from './art.js';
import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import { localizeDOM } from '../../../src/i18n/index.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'megaGenesis.rover.save.v1', BUILD_KEY = 'megaGenesis.rover.build.v1';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const TINTS = { S1: '#6ce2cf', S2: '#ffd166', S3: '#9eb8ff', S4: '#ff97c8' };

export const app = { screen: 'briefing', build: emptyBuild(), mission: null, result: null, paused: false, game: null, keys: new Set(), virt: new Set() };
const sceneOf = () => app.game && app.game.scene.getScene('ExploreScene');

// ---------- Avisos ----------
let toastTimer = 0, hintMsg = null;
function flash(msg, kind = 'ok') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  hintMsg = { msg, kind, until: performance.now() + 2600 };
}

// ---------- Navegación ----------
const STEPS = [['briefing', 'Misión'], ['build', 'Construcción'], ['explore', 'Exploración'], ['results', 'Resultados']];
export function go(name) {
  app.screen = name; document.body.dataset.screen = name;
  document.querySelectorAll('[data-screen-id]').forEach((el) => { el.hidden = el.dataset.screenId !== name; });
  const idx = STEPS.findIndex((s) => s[0] === name);
  $('steps').innerHTML = STEPS.map((s, i) => `<span class="${i === idx ? 'on' : i < idx ? 'done' : ''}"><b>${i + 1}</b>${s[1]}</span>`).join('');
  clearTimeout(toastTimer); $('toast').hidden = true;
  $('pause').hidden = true; app.paused = false; directions.clear(); app.virt.clear(); hintMsg = null;
  const sm = app.game?.scene;
  if (name === 'explore') { sm.stop('BackdropScene'); sm.stop('ExploreScene'); sm.start('ExploreScene'); }
  else if (app.game?.isBooted) { sm.stop('ExploreScene'); if (!sm.isActive('BackdropScene')) sm.start('BackdropScene'); }
  if (name === 'briefing') renderBriefing();
  if (name === 'build') renderBuild();
  if (name === 'results') renderResults();
  if (name !== 'explore') { const s = document.querySelector(`[data-screen-id="${name}"]`); if (s) s.scrollTop = 0; }
}

// ---------- Misión: ciclo de vida ----------
function beginMission() {
  const v = validateBuild(app.build);
  if (!v.ok) { flash(v.reasons[0], 'bad'); return false; } // se revalida: no depende solo del botón
  app.mission = createMission(app.build); app.result = null; store.del(SAVE_KEY); go('explore'); return true;
}
function continueSaved() {
  const m = restoreMission(store.get(SAVE_KEY));
  if (!m) { store.del(SAVE_KEY); flash('El guardado no es válido y se descartó.', 'warn'); renderBriefing(); return; }
  app.build = m.build; app.mission = m; app.result = null; go('explore'); setPaused(true);
}
function saveNow() { const m = app.mission; if (m && (m.phase === 'explore' || m.phase === 'landing')) store.set(SAVE_KEY, snapshot(m)); }
function setPaused(p) {
  if (app.screen !== 'explore' || !app.mission || app.mission.phase === 'success' || app.mission.phase === 'failed') return;
  app.paused = p; $('pause').hidden = !p; directions.clear(); app.virt.clear(); app.keys.clear();
  const sc = sceneOf(); if (sc && sc.tweens) p ? sc.tweens.pauseAll() : sc.tweens.resumeAll();
  if (p) saveNow();
}
function finishMission() { app.result = evaluate(app.mission); store.del(SAVE_KEY); go('results'); }

function tryAction(type) {
  const m = app.mission;
  if (app.screen !== 'explore' || app.paused || !m) return;
  const r = startAction(m, type);
  if (!r.ok) flash(r.reason, 'warn');
}
function onEvent(ev) {
  const m = app.mission, obj = ev.targetId && (m.samples.find((x) => x.id === ev.targetId) || m.photos.find((x) => x.id === ev.targetId));
  const sc = sceneOf(); if (sc && sc.fxEvent) sc.fxEvent(ev);
  if (ev.type === 'landed') flash('Aterrizaje exitoso. Explora, escanea y recoge muestras.');
  else if (ev.type === 'collected') { flash(`Muestra ${obj.id} recogida (${obj.kind}). Falta analizarla.`); saveNow(); }
  else if (ev.type === 'analyzed') { flash(`Análisis de ${obj.id} completado. Ya puedes transmitirlo.`); saveNow(); }
  else if (ev.type === 'photographed') { flash(`Foto de «${obj.name}» guardada. Transmítela para ganar puntos.`); saveNow(); }
  else if (ev.type === 'transmitted') { flash(`${obj.name ? 'Foto' : 'Datos'} de ${obj.id} enviados. Esperando confirmación de la Tierra…`); saveNow(); }
  else if (ev.type === 'scanned') { flash(ev.found.length ? `Escáner: ${ev.found.length} muestra(s) oculta(s) detectada(s).` : 'Escáner: no se detecta nada nuevo en 320 px a la redonda.', ev.found.length ? 'ok' : 'warn'); saveNow(); }
  else if (ev.type === 'success') flash('¡Objetivo cumplido! Esperando la última confirmación de la Tierra…');
  else if (ev.type === 'action-failed') flash(ev.reason, 'warn');
  else if (ev.type === 'bump') flash('Obstáculo: evita cráteres y rocas.', 'warn');
}

// ---------- Entrada ----------
const MOVE = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
function readInput() {
  let dx = 0, dy = 0;
  for (const k of [...app.keys, ...app.virt]) { const v = MOVE[k]; if (v) { dx += v[0]; dy += v[1]; } }
  return { dx: Math.sign(dx), dy: Math.sign(dy) };
}
// Los oyentes globales se registran UNA sola vez; las escenas no añaden oyentes de teclado propios.
window.addEventListener('keydown', (e) => {
  if (app.screen !== 'explore' || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') { e.preventDefault(); if (!e.repeat) setPaused(!app.paused); return; }
  if (app.paused) return;
  if (MOVE[k]) { e.preventDefault(); app.keys.add(k); return; }
  if (e.repeat) return; // mantener pulsada la tecla no repite la acción
  if (k === 'e') tryAction('collect'); else if (k === 'f') tryAction('analyze'); else if (k === 't') tryAction('transmit'); else if (k === 'c') tryAction('photo'); else if (k === 'r') tryAction('scan');
});
window.addEventListener('keyup', (e) => app.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { app.keys.clear(); app.virt.clear(); setPaused(true); });
window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
const directions = new Map();
function updateTouchDirections() {
  app.virt.clear();
  for (const direction of directions.values()) app.virt.add(direction);
}
$('dpad').addEventListener('pointerdown', (e) => {
  const button = e.target.closest('[data-dir]');
  if (!button || app.paused || app.screen !== 'explore') return;
  e.preventDefault();
  button.setPointerCapture(e.pointerId);
  directions.set(e.pointerId, 'arrow' + button.dataset.dir);
  updateTouchDirections();
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('dpad').addEventListener(event, (e) => {
    if (directions.delete(e.pointerId)) updateTouchDirections();
  });
}
$('actions').addEventListener('click', (e) => { const b = e.target.closest('[data-action]'); if (b) tryAction(b.dataset.action); });
$('btn-pause').addEventListener('click', () => setPaused(true));
$('pause').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  if (c.dataset.cmd === 'resume') setPaused(false);
  else if (c.dataset.cmd === 'restart') { app.mission = createMission(app.build); store.del(SAVE_KEY); go('explore'); }
  else if (c.dataset.cmd === 'rebuild') { store.del(SAVE_KEY); app.mission = null; go('build'); }
});

// ---------- HUD ----------
let lastHud = '', lastHint = '';
function refreshHud() {
  const m = app.mission; if (!m) return;
  const p = progress(m), cap = m.stats.capacity, pct = Math.round((m.battery / cap) * 100);
  const cls = pct <= 15 ? 'bad' : pct <= 35 ? 'warn' : '';
  const left = Math.max(0, Math.ceil(RULES.timeLimit - m.elapsed));
  const html = `<div class="stat energy"><span>Energía</span><b>${fmt(m.battery, 0)} / ${cap} u · ${pct} %</b><div class="bar ${cls}"><i style="width:${pct}%"></i></div></div>
    <div class="stat"><span>Analizadas</span><b>${p.analyzed} / ${p.goal}</b></div>
    <div class="stat"><span>Transmitidas</span><b>${p.transmitted} / ${p.goal}</b></div>
    <div class="stat"><span>Recogidas</span><b>${p.collected}</b></div>
    <div class="stat"><span>Tiempo</span><b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b></div>`;
  if (html !== lastHud) { $('hud-stats').innerHTML = html; lastHud = html; }
  // Hint contextual
  let msg, kind = '';
  if (m.phase === 'landing') msg = 'Aterrizaje automático en curso…';
  else if (m.action) { msg = `${m.action.label}${m.action.targetId ? ' de ' + m.action.targetId : ''}: ${Math.round(m.action.progress * 100)} %. No te muevas (se cancelaría).`; kind = 'ok'; }
  else if (m.noPower) { msg = 'Sin energía: no puedes moverte. El panel solar recarga con el rover detenido.'; kind = 'bad'; }
  else if (hintMsg && hintMsg.until > performance.now()) { msg = hintMsg.msg; kind = hintMsg.kind; }
  else if (availability(m, 'collect').ok) { msg = 'Muestra al alcance: pulsa E para recogerla.'; kind = 'ok'; }
  else if (availability(m, 'photo').ok) { msg = `«${availability(m, 'photo').target.name}» al alcance: pulsa C para fotografiar.`; kind = 'ok'; }
  else if (m.samples.some((s) => s.state === 'collected')) msg = 'Tienes muestras sin analizar: pulsa F.';
  else if (m.samples.some((s) => s.state === 'analyzed')) msg = 'Hay análisis listos: pulsa T para transmitirlos.';
  else if (m.samples.some((s) => s.hidden && !s.revealed) && p.collected >= 1) msg = 'Quedan muestras ocultas: pulsa R para escanear el subsuelo.';
  else msg = 'Conduce con WASD / flechas. Busca muestras brillantes, puntos de interés y usa el escáner (R).';
  if (msg + kind !== lastHint) { const h = $('hud-hint'); h.textContent = msg; h.className = 'hint ' + kind; lastHint = msg + kind; }
  renderData(m);
  for (const b of $('actions').querySelectorAll('[data-action]')) {
    const av = availability(m, b.dataset.action);
    b.classList.toggle('is-blocked', !av.ok && !(m.action && m.action.type === b.dataset.action));
    b.classList.toggle('is-busy', !!m.action && m.action.type === b.dataset.action);
    b.setAttribute('aria-disabled', String(!av.ok)); b.title = av.ok ? '' : av.reason;
  }
}

// Centro de datos: cada muestra/foto es un paquete con barra 0–100 % de recorrido (recogida → análisis → envío → recibido).
let lastData = '';
function renderData(m) {
  const pk = dataPackets(m), strip = $('hud-data');
  strip.hidden = pk.length === 0; if (!pk.length) { lastData = ''; return; }
  const tx = m.action && m.action.type === 'transmit' ? m.action : null;
  const pendingAck = Math.min(...Object.values(m.acks), 1);
  let linkPct = 0, linkTxt = `Antena ${m.build.comms === 'alta' ? 'de alta ganancia' : m.build.comms === 'media' ? 'media' : 'de baja ganancia'} en espera`, linkCls = '';
  if (tx) { linkPct = Math.round(tx.progress * 100); linkTxt = `Transmitiendo ${tx.targetId}… ${linkPct} %`; linkCls = 'is-tx'; }
  else if (pendingAck < 1) { linkPct = Math.round(pendingAck * 100); linkTxt = `Recibiendo confirmación… ${linkPct} %`; linkCls = 'is-rx'; }
  else if (Object.keys(m.acks).length) { linkPct = 100; linkTxt = 'Última transmisión confirmada ✔'; linkCls = 'is-ok'; }
  const html = `<div class="pkt link ${linkCls}"><div class="pkt-h"><span class="pkt-id"><canvas id="earth-ico" width="22" height="22" aria-hidden="true"></canvas> Enlace Tierra</span><b>${linkPct} %</b></div><div class="bar"><i style="width:${linkPct}%"></i></div><div class="pkt-s">${linkTxt}</div></div>`
    + pk.map((k) => `<div class="pkt ${k.kind} ${k.active ? 'is-active' : ''} ${k.overall >= 100 ? 'is-done' : ''}" title="${k.title}"><div class="pkt-h"><span class="pkt-id">${k.kind === 'photo' ? '📷' : '🪨'} ${k.id}</span><b>${k.overall} %</b></div>
      <div class="pkt-t">${k.title}</div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${k.overall}" aria-label="Progreso de ${k.title}"><i style="width:${k.overall}%"></i></div>
      <div class="pkt-s">${k.stage}${k.active || (k.state === 'transmitted' && k.pct < 100) ? ' · ' + k.pct + ' %' : ''}</div></div>`).join('');
  if (html !== lastData) { strip.innerHTML = html; lastData = html; const c = $('earth-ico'); if (c) c.getContext('2d').drawImage(earthCanvas(22), 0, 0); }
}

// ---------- Escenas Phaser ----------
class BackdropScene extends Phaser.Scene {
  constructor() { super('BackdropScene'); }
  create() {
    this.deco = [];
    const build = () => {
      this.deco.forEach((o) => o.destroy()); this.deco = [];
      if (this.img) this.img.destroy();
      const w = Math.max(2, this.scale.width), h = Math.max(2, this.scale.height);
      if (this.textures.exists('sky')) this.textures.remove('sky');
      this.textures.addCanvas('sky', skyCanvas(w, h));
      this.img = this.add.image(0, 0, 'sky').setOrigin(0).setDisplaySize(w, h);
      let a = 3; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for (let i = 0; i < 26; i++) { // estrellas que titilan
        const st = this.add.rectangle(rnd() * w, rnd() * h * .7, 3, 3, rnd() > .7 ? 0x6ce2cf : 0xffffff, .9);
        this.tweens.add({ targets: st, alpha: .1, duration: 600 + rnd() * 1800, yoyo: true, repeat: -1, delay: rnd() * 1500 });
        this.deco.push(st);
      }
    };
    this.shoot = () => { // estrella fugaz ocasional
      const w = this.scale.width, h = this.scale.height, x = Math.random() * w * .7, y = Math.random() * h * .3;
      const t = this.add.rectangle(x, y, 26, 2, 0xeaf4ff, 1).setRotation(.45);
      this.tweens.add({ targets: t, x: x + 280, y: y + 140, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    };
    build();
    this.time.addEvent({ delay: 4500, loop: true, callback: this.shoot });
    let tm = 0; this.onResize = () => { clearTimeout(tm); tm = setTimeout(() => { if (this.sys.isActive()) build(); }, 120); };
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { clearTimeout(tm); this.scale.off('resize', this.onResize); });
  }
}

class ExploreScene extends Phaser.Scene {
  constructor() { super('ExploreScene'); }
  create() {
    const m = app.mission;
    if (!m) { go('build'); return; }
    this.m = m; this.finished = false; this.endT = 0; this.lastSave = 0; this.sprites = new Map(); this.pois = new Map(); this.dustT = 0; this.puffs = 0; this.lastTrack = { x: m.rover.x, y: m.rover.y };
    const T = this.textures;
    if (!T.exists('terrain')) T.addCanvas('terrain', terrainCanvas());
    for (const [id, c] of Object.entries(TINTS)) if (!T.exists('sample-' + id)) T.addCanvas('sample-' + id, sampleCanvas(3, c));
    if (!T.exists('poi')) T.addCanvas('poi', poiCanvas(3));
    if (T.exists('rover')) T.remove('rover');
    T.addCanvas('rover', roverCanvas(m.build, 4));
    if (T.exists('tracks')) T.remove('tracks');
    this.tracks = T.createCanvas('tracks', WORLD.w, WORLD.h);
    this.add.image(0, 0, 'terrain').setOrigin(0);
    this.add.image(0, 0, 'tracks').setOrigin(0);
    for (const p of m.photos) if (p.state === 'available') this.makePoi(p, false);
    for (const s of m.samples) if (s.state === 'available' && s.revealed) this.makeSample(s, false);
    this.shadow = this.add.ellipse(m.rover.x, m.rover.y + 20, 56, 13, 0x000000, .4).setDepth(2);
    this.rover = this.add.image(m.rover.x, m.rover.y, 'rover').setOrigin(.5, .72).setScale(.6).setDepth(3);
    this.fx = this.add.graphics().setDepth(5);
    const cam = this.cameras.main; cam.setBounds(0, 0, WORLD.w, WORLD.h); cam.setBackgroundColor('#050b16'); cam.startFollow(this.rover, true, .12, .12);
    this.layout = () => {
      const top = $('hud-top').getBoundingClientRect().bottom, bot = window.innerHeight - $('hud-bottom').getBoundingClientRect().top;
      const w = window.innerWidth, h = Math.max(60, window.innerHeight - top - bot);
      document.documentElement.style.setProperty('--stage-top', Math.round(top + 10) + 'px');
      cam.setViewport(0, top, w, h); cam.setZoom(Math.min(1.3, Math.max(.7, Math.min(w / 900, h / 560))));
    };
    this.layout(); this.scale.on('resize', this.layout); window.addEventListener('resize', this.layout);
    this.ro = new ResizeObserver(this.layout); this.ro.observe($('hud-top')); this.ro.observe($('hud-bottom'));
    this.events.once('shutdown', () => { this.scale.off('resize', this.layout); window.removeEventListener('resize', this.layout); this.ro.disconnect(); });
    this.syncVisuals(); refreshHud();
  }
  makeSample(s, animate) {
    const tint = Phaser.Display.Color.HexStringToColor(TINTS[s.id] || '#6ce2cf').color;
    const ring = this.add.circle(s.x, s.y + 6, 12).setStrokeStyle(2, tint, .9).setDepth(1);
    const glow = this.add.circle(s.x, s.y + 4, 22, tint, .2).setDepth(1);
    const img = this.add.image(s.x, s.y, 'sample-' + s.id).setDepth(2).setData('sampleId', s.id);
    img.setInteractive(new Phaser.Geom.Circle(15, 18, 32), Phaser.Geom.Circle.Contains); img.input.cursor = 'pointer';
    img.on('pointerdown', () => tryAction('collect'));
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 1500, repeat: -1 });
    this.tweens.add({ targets: glow, alpha: .5, scale: 1.35, yoyo: true, repeat: -1, duration: 900 });
    this.tweens.add({ targets: img, y: s.y - 4, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    if (animate) { img.setScale(0).setAlpha(0); this.tweens.add({ targets: img, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' }); }
    this.sprites.set(s.id, { img, glow, ring });
  }
  makePoi(p) {
    const mark = this.add.image(p.x, p.y, 'poi').setDepth(1).setAlpha(.9);
    const label = this.add.text(p.x, p.y - 48, p.name, { fontFamily: '"Press Start 2P", monospace', fontSize: '9px', color: '#ffd166', backgroundColor: '#050b16cc', padding: { x: 6, y: 4 } }).setOrigin(.5).setDepth(6).setAlpha(0);
    this.tweens.add({ targets: mark, scale: 1.18, alpha: .55, yoyo: true, repeat: -1, duration: 800 });
    this.pois.set(p.id, { mark, label });
  }
  burst(x, y, colors, n = 10, spread = 60, life = 600) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.2832, d = spread * (.4 + Math.random() * .6), c = colors[i % colors.length];
      const q = this.add.rectangle(x, y, 5, 5, c, 1).setDepth(6);
      this.tweens.add({ targets: q, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 10, alpha: 0, scale: .3, duration: life * (.7 + Math.random() * .6), onComplete: () => q.destroy() });
    }
  }
  ping(x, y, color, size = 120) {
    const c = this.add.circle(x, y, 8).setStrokeStyle(3, color, 1).setDepth(5);
    this.tweens.add({ targets: c, scale: size / 8, alpha: 0, duration: 800, onComplete: () => c.destroy() });
  }
  fxEvent(ev) { // reacciones visuales a los eventos de las reglas (no modifican el estado)
    const r = this.m.rover;
    if (ev.type === 'landed') { this.ping(r.x, r.y + 14, 0xcfd8e3, 220); this.burst(r.x, r.y + 14, [0x7f8ea2, 0xaab6c6, 0x5d6b7f], 22, 130, 900); }
    else if (ev.type === 'collected') { const s = this.m.samples.find((x) => x.id === ev.targetId); this.burst(s.x, s.y, [0xffd166, 0x6ce2cf, 0xffffff], 14, 50); }
    else if (ev.type === 'analyzed') this.ping(r.x, r.y, 0x6ce2cf, 100);
    else if (ev.type === 'photographed') { this.cameras.main.flash(220, 255, 255, 255); const p = this.m.photos.find((x) => x.id === ev.targetId); this.burst(p.x, p.y, [0xffd166, 0xffffff], 12, 55); }
    else if (ev.type === 'transmitted') this.ping(r.x, r.y - 30, 0xffd166, 150);
    else if (ev.type === 'scanned') for (const id of ev.found) { const s = this.m.samples.find((x) => x.id === id); this.ping(s.x, s.y, 0x6ce2cf, 140); }
    else if (ev.type === 'bump') this.cameras.main.shake(120, .004);
    else if (ev.type === 'success') this.burst(r.x, r.y - 10, [0x6ce2cf, 0xffd166, 0xffffff, 0x9eb8ff], 46, 190, 1400);
  }
  syncVisuals() {
    const m = this.m, r = m.rover, ex = m.elapsed;
    // Lo dibujado se deriva del estado: una muestra/foto deja de existir en el terreno en cuanto su estado cambia.
    for (const [id, o] of [...this.sprites]) {
      if (m.samples.find((s) => s.id === id).state === 'available') continue;
      o.img.disableInteractive(); this.tweens.killTweensOf([o.img, o.glow, o.ring]);
      const pop = this.add.image(o.img.x, o.img.y, 'sample-' + id).setDepth(6);
      this.tweens.add({ targets: pop, y: pop.y - 46, scale: 1.9, alpha: 0, duration: 520, onComplete: () => pop.destroy() });
      o.img.destroy(); o.glow.destroy(); o.ring.destroy(); this.sprites.delete(id);
    }
    for (const s of m.samples) if (s.state === 'available' && s.revealed && !this.sprites.has(s.id)) this.makeSample(s, true); // el escáner la revela
    for (const [id, o] of [...this.pois]) {
      const p = m.photos.find((x) => x.id === id);
      if (p.state !== 'available') { this.tweens.killTweensOf(o.mark); o.mark.destroy(); o.label.destroy(); this.pois.delete(id); continue; }
      const d = Math.hypot(r.x - p.x, r.y - p.y); o.label.setAlpha(Phaser.Math.Clamp(1 - (d - 90) / 240, 0, 1));
    }
    const drop = m.phase === 'landing' ? Math.pow(1 - m.t / RULES.landingTime, 2) * 280 : 0;
    this.rover.setPosition(r.x, r.y - drop).setFlipX(r.facing < 0).setAngle(r.moving ? Math.sin(ex * 22) * 1.2 : 0);
    this.shadow.setPosition(r.x, r.y + 20).setScale(1 - drop / 500).setAlpha(.4 - drop / 900);
    // Efectos por acción (dependen solo del estado, así que la pausa los congela)
    const fx = this.fx; fx.clear();
    const a = m.action;
    if (a) {
      const w = 60, x = r.x - w / 2, y = r.y - 50, col = a.type === 'collect' ? 0xffd166 : a.type === 'photo' ? 0xffffff : 0x6ce2cf;
      fx.fillStyle(0x050b16, .92).fillRect(x - 2, y - 2, w + 4, 10).fillStyle(col, 1).fillRect(x, y, w * Math.min(1, a.progress), 6);
      for (let i = 1; i < 4; i++) fx.fillStyle(0x050b16, .8).fillRect(x + (w * i) / 4, y, 1, 6);
      if (a.type === 'scan') for (let k = 0; k < 2; k++) { const t = (a.progress * 1.5 + k * .5) % 1; fx.lineStyle(3, 0x6ce2cf, (1 - t) * .9).strokeCircle(r.x, r.y, RULES.scanRange * t); }
      else if (a.type === 'transmit') for (let k = 0; k < 3; k++) { const t = (ex * 1.4 + k / 3) % 1; fx.lineStyle(3, 0xffd166, 1 - t).beginPath().arc(r.x + 14 * (r.facing > 0 ? 1 : -1), r.y - 26, 10 + t * 70, -2.6, -.55).strokePath(); fx.fillStyle(0xffd166, 1 - t).fillRect(r.x + 14 * (r.facing > 0 ? 1 : -1) + t * 20, r.y - 40 - t * 120, 5, 5); }
      else if (a.type === 'analyze') { const t = (a.progress * 3) % 1; fx.lineStyle(2, 0x6ce2cf, 1 - t).strokeCircle(r.x, r.y + 12, 20 + t * 40); fx.fillStyle(0xff7b7b, .85).fillRect(r.x + (r.facing > 0 ? 24 : -26), r.y - 2 + Math.sin(ex * 40) * 6, 3, 18); }
      else if (a.type === 'collect') { const s = m.samples.find((x) => x.id === a.targetId); if (s) { const sz = 34 * (1 - a.progress) + 12; fx.lineStyle(3, 0xffd166, 1).strokeRect(s.x - sz, s.y - sz, sz * 2, sz * 2); } }
      else if (a.type === 'photo') { const p = m.photos.find((x) => x.id === a.targetId); if (p) { const sz = 50 * (1 - a.progress) + 16; fx.lineStyle(3, 0xffffff, 1); for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fx.beginPath().moveTo(p.x + ox * sz, p.y + oy * (sz - 10)).lineTo(p.x + ox * sz, p.y + oy * sz).lineTo(p.x + ox * (sz - 10), p.y + oy * sz).strokePath(); } }
    }
  }
  trail(delta) { // huellas de las ruedas y polvo; solo cuando el rover se mueve de verdad
    const m = this.m, r = m.rover; if (!r.moving) return;
    if (Math.hypot(r.x - this.lastTrack.x, r.y - this.lastTrack.y) >= 7) {
      const ctx = this.tracks.getContext(); ctx.fillStyle = 'rgba(8,12,20,.32)';
      for (const ox of [-16, 8]) ctx.fillRect(Math.round((r.x + ox) / 3) * 3, Math.round((r.y + 12) / 3) * 3, 6, 3);
      this.tracks.refresh(); this.lastTrack = { x: r.x, y: r.y };
    }
    this.dustT += delta; if (this.dustT > 110 && this.puffs < 30) {
      this.dustT = 0; this.puffs++;
      const q = this.add.rectangle(r.x - r.facing * 22 + (Math.random() - .5) * 8, r.y + 18, 7, 7, 0xaeb9c9, .55).setDepth(2);
      this.tweens.add({ targets: q, x: q.x - r.facing * 18, y: q.y - 8, scale: 2.2, alpha: 0, duration: 650, onComplete: () => { q.destroy(); this.puffs--; } });
    }
  }
  update(_t, delta) {
    if (!this.m || this.finished) return;
    if (!app.paused) {
      for (const ev of step(this.m, readInput(), delta / 1000)) onEvent(ev);
      this.lastSave += delta; if (this.lastSave > 5000) { this.lastSave = 0; saveNow(); }
      this.trail(delta);
      if (this.m.phase === 'success' || this.m.phase === 'failed') this.endT += delta / 1000;
    }
    this.syncVisuals(); refreshHud();
    const m = this.m; // al terminar se espera a que la Tierra confirme la última transmisión (máx. 3 s)
    if ((m.phase === 'success' && ((allAcked(m) && this.endT > .9) || this.endT > 3)) || (m.phase === 'failed' && this.endT > .6)) { this.finished = true; finishMission(); }
  }
}

// ---------- Pantallas HTML ----------
function renderBriefing() {
  const saved = store.get(SAVE_KEY), canContinue = !!restoreMission(saved);
  $('screen-briefing').innerHTML = `<div class="wrap">
    <section class="panel hero"><div class="hero-row"><div><span class="kicker">MISIÓN 02 · SUPERFICIE LUNAR</span>
      <h1>Envío de rover a la Luna</h1>
      <p class="lead">Diseña un rover dentro de un límite de <b>${LIMITS.mass} kg</b> y <b>${LIMITS.credits} créditos</b>, aterriza y explora. Recoge, analiza y transmite los datos de <b>${RULES.sampleGoal} muestras distintas</b> antes de que se acabe la energía o el tiempo… y sigue explorando para ganar puntos extra.</p>
      <div class="row" style="margin-top:14px"><button class="primary" data-cmd="build">Construir rover</button>${canContinue ? '<button data-cmd="continue">Continuar misión guardada</button>' : ''}</div></div>
      <img class="earth" alt="La Tierra, a 384 000 km" width="112" height="112" src="${earthCanvas(56).toDataURL()}"></div>
    </section>
    <section class="panel"><h2>Qué puedes hacer con el rover</h2><div class="acts">
      <div class="act"><kbd>E</kbd><b>Recoger</b><span>Acércate a una muestra (menos de ${RULES.collectRange} px) y espera ${RULES.collectTime} s.</span></div>
      <div class="act"><kbd>F</kbd><b>Analizar</b><span>El instrumento estudia la muestra. Barra de análisis 0–100 %.</span></div>
      <div class="act"><kbd>T</kbd><b>Transmitir</b><span>Envía datos a la Tierra y espera su confirmación. Solo cuentan las muestras transmitidas.</span></div>
      <div class="act"><kbd>C</kbd><b>Fotografiar</b><span>Hay ${PHOTO_DEFS.length} puntos de interés: módulo, bandera, monolito y borde de cráter. Cada foto transmitida suma puntos.</span></div>
      <div class="act"><kbd>R</kbd><b>Escanear</b><span>El radar de subsuelo (${RULES.scanRange} px) revela muestras ocultas que no se ven a simple vista.</span></div>
      <div class="act"><kbd>P</kbd><b>Pausa</b><span>Detiene la simulación, el reloj y las acciones en curso.</span></div></div></section>
    <div class="grid2">
      <section class="panel"><h2>Objetivos</h2><ul class="list">
        <li><b>Principal:</b> analizar y transmitir ${RULES.sampleGoal} muestras únicas.</li>
        <li><b>Secundario:</b> fotografiar y transmitir 2 puntos de interés.</li>
        <li><b>Secundario:</b> descubrir una muestra oculta con el escáner.</li>
        <li><b>Maestría:</b> terminar sin choques y con 50 % de batería.</li></ul></section>
      <section class="panel"><h2>Reglas de energía</h2><ul class="list">
        <li>Moverse y cada acción consumen energía según tu configuración.</li>
        <li>El panel solar recarga <b>solo con el rover detenido</b>.</li>
        <li>Sin energía suficiente, la acción se bloquea y se te explica por qué.</li>
        <li>Tiempo máximo de exploración: ${RULES.timeLimit / 60} minutos.</li></ul></section>
    </div>
    <section class="panel"><h2>Movimiento</h2><div class="row"><span><kbd>WASD</kbd> / <kbd>←↑↓→</kbd> mover</span><span class="muted">En móvil: cruceta y botones en pantalla.</span></div></section></div>`;
}
$('screen-briefing').addEventListener('click', (e) => { const c = e.target.closest('[data-cmd]'); if (!c) return; if (c.dataset.cmd === 'build') go('build'); else if (c.dataset.cmd === 'continue') continueSaved(); });

const factsFor = {
  chassis: (c) => `Velocidad ${c.speed} px/s · consumo al moverse ${fmt(c.moveDraw)} u/s`,
  wheels: (c) => `Velocidad ×${c.speedMul} · consumo ×${c.drawMul} · daño por choques ×${c.bumpMul}`,
  battery: (c) => `Capacidad ${c.capacity} u`,
  solar: (c) => `Recarga +${fmt(c.gen)} u/s con el rover detenido`,
  instrument: (c) => `${c.analysisTime} s · ${c.analysisEnergy} u por análisis · valor científico ×${c.quality}`,
  camera: (c) => `Consumo ${fmt(c.draw, 2)} u/s · datos ×${c.dataMul} · foto ${c.photoTime} s y ${fmt(c.photoEnergy)} u`,
  comms: (c) => `${c.txTime} s · ${c.txEnergy} u por transmisión`,
};
function renderBuild() {
  const cats = CATEGORIES.map((cat) => `<section class="panel" aria-labelledby="h-${cat.id}"><h3 id="h-${cat.id}">${cat.label}</h3>
    <div class="opts" role="radiogroup" aria-labelledby="h-${cat.id}" data-cat="${cat.id}">${COMPONENTS[cat.id].map((c) => `
      <button type="button" class="opt" role="radio" aria-checked="false" data-cat="${cat.id}" data-id="${c.id}">
        <span class="tag">✓ ELEGIDO</span><b class="name">${c.name}</b>
        <span class="nums"><span class="chip">${c.mass} kg</span><span class="chip">${c.cost} cr</span></span>
        <span class="facts">${factsFor[cat.id](c)}</span><span class="trade">${c.trade}</span></button>`).join('')}</div></section>`).join('');
  $('screen-build').innerHTML = `<div class="wrap"><div class="build"><div class="cats">${cats}</div>
    <aside class="side"><section class="panel"><h3>Vista previa</h3><div class="preview"><canvas id="preview" width="204" height="156" aria-label="Vista previa del rover"></canvas></div></section>
    <section class="panel"><h3>Recursos</h3><div id="resources"></div><div id="reason" class="reason" role="status"></div>
      <div class="stack" style="margin-top:12px"><button type="button" id="start" class="primary start-btn" data-cmd="start">Iniciar misión</button>
      <div class="row"><button type="button" data-cmd="recommended">Usar configuración recomendada</button><button type="button" data-cmd="clear">Vaciar</button></div>
      <button type="button" class="ghost" data-cmd="back">← Volver al briefing</button></div></section></aside></div></div>`;
  updateBuild();
}
function setBuild(b) { app.build = b; store.set(BUILD_KEY, b); updateBuild(); }
function updateBuild() {
  const v = validateBuild(app.build), st = v.stats;
  document.querySelectorAll('#screen-build .opts').forEach((grp) => {
    const sel = app.build[grp.dataset.cat]; let first = true;
    grp.querySelectorAll('.opt').forEach((o) => {
      const on = o.dataset.id === sel; o.classList.toggle('is-selected', on); o.setAttribute('aria-checked', String(on));
      o.tabIndex = on || (!sel && first) ? 0 : -1; first = false;
    });
  });
  const meter = (label, val, max, unit) => { const r = val / max, c = r > 1 ? 'bad' : r > .9 ? 'warn' : ''; return `<div class="meter"><div class="top"><span>${label}</span><b class="${c}">${fmt(val)} / ${max} ${unit}</b></div><div class="bar ${c}"><i style="width:${Math.min(100, r * 100)}%"></i></div></div>`; };
  const dash = (x, f) => (x ? f(x) : '—');
  $('resources').innerHTML = meter('Masa', st.mass, LIMITS.mass, 'kg') + meter('Presupuesto', st.cost, LIMITS.credits, 'cr') + `<div class="stats">
    <span>Batería</span><b>${dash(st.capacity, (x) => x + ' u')}</b>
    <span>Generación solar</span><b>${dash(st.solar, (x) => '+' + fmt(x) + ' u/s')}</b>
    <span>Consumo al moverse</span><b>${dash(st.moveDraw, (x) => fmt(x + st.idleDraw, 2) + ' u/s')}</b>
    <span>Velocidad</span><b>${dash(st.speed, (x) => fmt(x) + ' px/s')}</b>
    <span>Análisis</span><b>${dash(st.analysisTime, (x) => x + ' s · ' + st.analysisEnergy + ' u')}</b>
    <span>Transmisión</span><b>${dash(st.txTime, (x) => x + ' s · ' + st.txEnergy + ' u')}</b></div>`;
  const cv = $('preview'), g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height); g.drawImage(roverCanvas(app.build, 6), 0, 0, cv.width, cv.height);
  const btn = $('start'); btn.setAttribute('aria-disabled', String(!v.ok));
  const rs = $('reason'); rs.className = 'reason ' + (v.ok ? 'ok' : 'bad');
  rs.innerHTML = v.ok ? 'Configuración válida: lista para despegar.' : v.reasons.map((r) => `<div>${r}</div>`).join('');
}
$('screen-build').addEventListener('click', (e) => {
  const o = e.target.closest('.opt');
  if (o) { setBuild(selectComponent(app.build, o.dataset.cat, o.dataset.id)); return; }
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  const cmd = c.dataset.cmd;
  if (cmd === 'start') { if (validateBuild(app.build).ok) beginMission(); else flash(validateBuild(app.build).reasons[0], 'bad'); }
  else if (cmd === 'recommended') setBuild({ ...emptyBuild(), ...RECOMMENDED_BUILD });
  else if (cmd === 'clear') setBuild(emptyBuild());
  else if (cmd === 'back') go('briefing');
});
$('screen-build').addEventListener('keydown', (e) => {
  const grp = e.target.closest && e.target.closest('.opts'); if (!grp || !e.target.classList.contains('opt')) return;
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return;
  e.preventDefault(); const list = [...grp.querySelectorAll('.opt')], i = list.indexOf(e.target), n = list[(i + d + list.length) % list.length];
  setBuild(selectComponent(app.build, n.dataset.cat, n.dataset.id)); grp.querySelector(`[data-id="${n.dataset.id}"]`).focus();
});

function renderResults() {
  const r = app.result; if (!r) { go('build'); return; }
  const p = r.progress, bars = r.packets.map((k) => `<div class="pkt res ${k.kind} ${k.overall >= 100 ? 'is-done' : ''}"><div class="pkt-h"><span class="pkt-id">${k.kind === 'photo' ? '📷' : '🪨'} ${k.id} · ${k.title}</span><b>${k.overall} %</b></div><div class="bar"><i style="width:${k.overall}%"></i></div><div class="pkt-s">${k.overall >= 100 ? 'Recibido en la Tierra ✔' : k.stage}</div></div>`).join('');
  $('screen-results').innerHTML = `<div class="wrap">
    <section class="panel hero"><div class="hero-row"><div><span class="kicker">${r.success ? 'MISIÓN COMPLETADA' : 'MISIÓN NO COMPLETADA'}</span>
      <h1 class="${r.success ? 'ok' : 'bad'}">${r.success ? '¡Datos recibidos en la Tierra!' : 'No se alcanzó el objetivo'}</h1>
      <p class="lead">${r.explanation}</p>
      <p class="score" style="margin-top:12px">${r.score} pts${r.success ? ' · ' + r.rating : ''}</p></div>
      <img class="earth" alt="La Tierra" width="112" height="112" src="${earthCanvas(56).toDataURL()}"></div></section>
    <div class="grid2"><section class="panel"><h2>Objetivos</h2><ul class="objs">${r.objectives.map((o) => `<li class="${o.done ? 'done' : ''}"><span class="chk">${o.done ? '✔' : '○'}</span>${o.label}${o.main ? ' <span class="chip">principal</span>' : ''}</li>`).join('')}</ul></section>
      <section class="panel"><h2>Puntuación</h2><table class="bd">${r.breakdown.map((b) => `<tr><td>${b.label}</td><td class="${b.points < 0 ? 'bad' : ''}">${b.points > 0 ? '+' : ''}${b.points}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td>${r.score}</td></tr></table></section></div>
    <section class="panel"><h2>Informe de datos</h2>${bars ? `<div class="res-pkts">${bars}</div>` : '<p class="muted">No se recogió ningún dato.</p>'}</section>
    <div class="grid2"><section class="panel"><h2>Resumen</h2><div class="stats"><span>Recogidas</span><b>${p.collected}</b><span>Analizadas</span><b>${p.analyzed} / ${p.goal}</b><span>Transmitidas</span><b>${p.transmitted} / ${p.goal}</b><span>Fotos transmitidas</span><b>${p.photosTransmitted} / ${p.photoTotal}</b><span>Ocultas descubiertas</span><b>${p.discovered} / ${p.hiddenTotal}</b><span>Batería final</span><b>${r.energyPct} %</b><span>Tiempo</span><b>${fmt(r.elapsed, 0)} s</b><span>Choques</span><b>${r.bumps}</b><span>Masa / costo</span><b>${fmt(r.stats.mass)} kg · ${r.stats.cost} cr</b></div></section>
    <section class="panel"><h2>Cómo mejorar</h2><ul class="list">${r.suggestions.map((s) => `<li>${s}</li>`).join('')}</ul>
      <p class="muted" style="margin-top:8px;font-size:.85rem">Puntuación y sugerencias calculadas con reglas fijas a partir de tu partida; no hay decisiones arbitrarias.</p></section></div>
    <div class="row"><button class="primary" data-cmd="retry">Reintentar con este rover</button><button data-cmd="rebuild">Modificar rover</button><button data-cmd="home">Volver al briefing</button></div></div>`;
}
$('screen-results').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  if (c.dataset.cmd === 'retry') beginMission(); else if (c.dataset.cmd === 'rebuild') go('build'); else if (c.dataset.cmd === 'home') go('briefing');
});

// ---------- Arranque ----------
const saved = store.get(BUILD_KEY);
if (saved && typeof saved === 'object') { let b = emptyBuild(); for (const cat of CATEGORIES) b = selectComponent(b, cat.id, saved[cat.id]); app.build = b; }
app.game = new Phaser.Game({ type: Phaser.CANVAS, parent: 'game', backgroundColor: '#050b16', pixelArt: true, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: [BackdropScene, ExploreScene] });
window.__rover = { app, go, tryAction, setPaused, SAMPLE_DEFS, flash };
localizeDOM(document.querySelector('.topbar'));
go('briefing');
