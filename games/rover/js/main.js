// Módulo lunar (Phaser 3). Phaser dibuja el terreno y el rover; las pantallas de decisión y el HUD son HTML.
//   Briefing → Construcción → Exploración (recoger → analizar → transmitir) → Resultados
// Toda la lógica vive en rules.js; aquí solo se lee el estado y se dibuja.
import {
  WORLD, RULES, SAMPLE_DEFS,
  emptyBuild, validateBuild, createMission, step, startAction, availability,
  progress, evaluate, snapshot, restoreMission, fmt,
} from './rules.js';
import { roverCanvas, terrainCanvas, sampleCanvas } from './art.js';
import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import { getLanguage, localizeDOM, t } from '../../../src/i18n/index.js';
import { hasStorageConsent } from '../../../src/welcome/core/consent.js';
import { readMissionPlan, returnToControl, ROVER_SAVE_KEY as SAVE_KEY } from '../../../src/missions/missionTransfer.js';

const $ = (id) => document.getElementById(id);
const exitMission = () => returnToControl(getLanguage());
const store = {
  get(k) { try { return hasStorageConsent() ? JSON.parse(localStorage.getItem(k)) : null; } catch { return null; } },
  set(k, v) { try { if (hasStorageConsent()) localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { if (hasStorageConsent()) localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const TINTS = { S1: '#6ce2cf', S2: '#ffd166', S3: '#9eb8ff', S4: '#ff97c8' };

export const app = { screen: 'waiting', build: emptyBuild(), mission: null, result: null, paused: false, game: null, keys: new Set(), virt: new Set() };
const sceneOf = () => app.game && app.game.scene.getScene('ExploreScene');

// ---------- Avisos ----------
let toastTimer = 0, hintMsg = null;
function flash(msg, kind = 'ok') {
  const t = $('toast'); t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  hintMsg = { msg, kind, until: performance.now() + 2600 };
}

// ---------- Navegación ----------
const STEPS = [['explore', 'Exploración'], ['results', 'Resultados']];
export function go(name) {
  app.screen = name; document.body.dataset.screen = name;
  document.querySelectorAll('[data-screen-id]').forEach((el) => { el.hidden = el.dataset.screenId !== name; });
  const idx = STEPS.findIndex((s) => s[0] === name);
  $('steps').innerHTML = STEPS.map((s, i) => `<span class="${i === idx ? 'on' : i < idx ? 'done' : ''}"><b>${i + 1}</b>${s[1]}</span>`).join('');
  $('pause').hidden = true; app.paused = false; directions.clear(); app.virt.clear(); hintMsg = null;
  const sm = app.game?.scene;
  if (name === 'explore') { sm.stop('BackdropScene'); sm.stop('ExploreScene'); sm.start('ExploreScene'); }
  else if (app.game?.isBooted) { sm.stop('ExploreScene'); if (!sm.isActive('BackdropScene')) sm.start('BackdropScene'); }
  if (name === 'results') renderResults();
  if (name !== 'explore') { const s = document.querySelector(`[data-screen-id="${name}"]`); if (s) s.scrollTop = 0; }
}

// ---------- Misión: ciclo de vida ----------
function beginMission() {
  const v = validateBuild(app.build);
  if (!v.ok) { flash(v.reasons[0], 'bad'); return false; } // se revalida: no depende solo del botón
  app.mission = createMission(app.build); app.result = null; go('explore'); saveNow(); return true;
}
function saveNow() { const m = app.mission; if (m && (m.phase === 'explore' || m.phase === 'landing')) store.set(SAVE_KEY, snapshot(m)); }
function setPaused(p) {
  if (app.screen !== 'explore' || !app.mission || app.mission.phase === 'success' || app.mission.phase === 'failed') return;
  app.paused = p; $('pause').hidden = !p; directions.clear(); app.virt.clear(); app.keys.clear();
  const sc = sceneOf(); if (sc?.sys.isActive()) p ? sc.tweens.pauseAll() : sc.tweens.resumeAll();
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
  const m = app.mission, s = ev.sampleId && m.samples.find((x) => x.id === ev.sampleId);
  if (ev.type === 'landed') flash('Aterrizaje exitoso. Explora y recoge muestras.');
  else if (ev.type === 'collected') { flash(`Muestra ${s.id} recogida (${s.kind}). Falta analizarla.`); saveNow(); }
  else if (ev.type === 'analyzed') { flash(`Análisis de ${s.id} completado. Ya puedes transmitirlo.`); saveNow(); }
  else if (ev.type === 'transmitted') { flash(`Datos de ${s.id} transmitidos.`); saveNow(); }
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
  if (k === 'e') tryAction('collect'); else if (k === 'f') tryAction('analyze'); else if (k === 't') tryAction('transmit');
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
  else if (c.dataset.cmd === 'exit') { saveNow(); exitMission(); }
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
  else if (m.action) { msg = `${m.action.label} de ${m.action.sampleId}: ${Math.round(m.action.progress * 100)} %. No te muevas (se cancelaría).`; kind = 'ok'; }
  else if (m.noPower) { msg = 'Sin energía: no puedes moverte. El panel solar recarga con el rover detenido.'; kind = 'bad'; }
  else if (hintMsg && hintMsg.until > performance.now()) { msg = hintMsg.msg; kind = hintMsg.kind; }
  else if (availability(m, 'collect').ok) { msg = 'Muestra al alcance: pulsa E para recogerla.'; kind = 'ok'; }
  else if (m.samples.some((s) => s.state === 'collected')) msg = 'Tienes muestras sin analizar: pulsa F.';
  else if (m.samples.some((s) => s.state === 'analyzed')) msg = 'Hay análisis listos: pulsa T para transmitirlos.';
  else msg = 'Conduce con WASD / flechas hasta una muestra brillante.';
  if (msg + kind !== lastHint) { const h = $('hud-hint'); h.textContent = msg; h.className = 'hint ' + kind; lastHint = msg + kind; }
  for (const b of $('actions').querySelectorAll('[data-action]')) {
    const av = availability(m, b.dataset.action);
    b.classList.toggle('is-blocked', !av.ok && !(m.action && m.action.type === b.dataset.action));
    b.classList.toggle('is-busy', !!m.action && m.action.type === b.dataset.action);
    b.setAttribute('aria-disabled', String(!av.ok)); b.title = av.ok ? '' : av.reason;
  }
}

// ---------- Escenas Phaser ----------
class BackdropScene extends Phaser.Scene {
  constructor() { super('BackdropScene'); }
  create() {
    this.g = this.add.graphics(); this.stars = [];
    this.draw = () => {
      const w = this.scale.width, h = this.scale.height; this.g.clear();
      // Phaser's Canvas renderer does not support Graphics gradients.
      const bands = 32;
      for (let i = 0; i < bands; i++) {
        const f = i / (bands - 1);
        const color = Phaser.Display.Color.GetColor(5 + Math.round(6 * f), 11 + Math.round(25 * f), 22 + Math.round(49 * f));
        this.g.fillStyle(color, 1).fillRect(0, Math.floor(i * h / bands), w, Math.ceil(h / bands));
      }
      let a = 7; const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
      for (let i = 0; i < 120; i++) { const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h * .75), s = rnd() > .9 ? 3 : 2; this.g.fillStyle(rnd() > .8 ? 0x6ce2cf : 0xeaf4ff, .3 + rnd() * .6).fillRect(x, y, s, s); }
      const r = Math.max(w, h) * .9; this.g.fillStyle(0x2c3746, 1).fillCircle(w * .5, h + r * .82, r);
      this.g.fillStyle(0x4a586c, 1).fillCircle(w * .5, h + r * .82, r - 6);
      this.g.fillStyle(0x3d4756, 1).fillCircle(w * .5, h + r * .82, r - 12);
      for (let i = 0; i < 16; i++) { const x = rnd() * w, y = h - rnd() * h * .14, d = 6 + rnd() * 20; this.g.fillStyle(0x28313f, 1).fillEllipse(x, y, d * 2, d * .7); }
    };
    this.draw(); this.scale.on('resize', this.draw);
    this.events.once('shutdown', () => this.scale.off('resize', this.draw));
  }
}

class ExploreScene extends Phaser.Scene {
  constructor() { super('ExploreScene'); }
  create() {
    const m = app.mission;
    if (!m) { go('waiting'); return; }
    this.m = m; this.finished = false; this.lastSave = 0; this.sprites = new Map();
    const T = this.textures;
    if (!T.exists('terrain')) T.addCanvas('terrain', terrainCanvas());
    for (const [id, c] of Object.entries(TINTS)) if (!T.exists('sample-' + id)) T.addCanvas('sample-' + id, sampleCanvas(3, c));
    if (T.exists('rover')) T.remove('rover');
    T.addCanvas('rover', roverCanvas(m.build, 4));
    this.add.image(0, 0, 'terrain').setOrigin(0);
    // Muestras: una representación por id, con interacción propia.
    for (const s of m.samples) {
      if (s.state !== 'available') continue; // al cargar un guardado, las recogidas no se dibujan
      const glow = this.add.circle(s.x, s.y, 20, 0x6ce2cf, .22);
      const img = this.add.image(s.x, s.y, 'sample-' + s.id).setData('sampleId', s.id);
      img.setInteractive(new Phaser.Geom.Circle(12, 12, 30), Phaser.Geom.Circle.Contains);
      img.input.cursor = 'pointer';
      img.on('pointerdown', () => tryAction('collect'));
      this.tweens.add({ targets: glow, alpha: .5, scale: 1.4, yoyo: true, repeat: -1, duration: 900 });
      this.tweens.add({ targets: img, y: s.y - 3, yoyo: true, repeat: -1, duration: 700 });
      this.sprites.set(s.id, { img, glow });
    }
    this.shadow = this.add.ellipse(m.rover.x, m.rover.y + 20, 52, 12, 0x000000, .35);
    this.rover = this.add.image(m.rover.x, m.rover.y, 'rover').setOrigin(.5, .72).setScale(.6);
    this.bar = this.add.graphics().setDepth(5);
    const cam = this.cameras.main; cam.setBounds(0, 0, WORLD.w, WORLD.h); cam.setBackgroundColor('#050b16'); cam.startFollow(this.rover, true, .12, .12);
    this.layout = () => {
      const top = $('hud-top').getBoundingClientRect().bottom, bot = window.innerHeight - $('hud-bottom').getBoundingClientRect().top;
      const w = window.innerWidth, h = Math.max(60, window.innerHeight - top - bot);
      cam.setViewport(0, top, w, h); cam.setZoom(Math.min(1.3, Math.max(.7, Math.min(w / 900, h / 560))));
    };
    this.layout(); this.scale.on('resize', this.layout); window.addEventListener('resize', this.layout);
    this.ro = new ResizeObserver(this.layout); this.ro.observe($('hud-top')); this.ro.observe($('hud-bottom'));
    this.events.once('shutdown', () => { this.scale.off('resize', this.layout); window.removeEventListener('resize', this.layout); this.ro.disconnect(); });
    if (app.paused) this.tweens.pauseAll();
    this.syncVisuals(); refreshHud();
  }
  syncVisuals() {
    const m = this.m, r = m.rover;
    // Lo dibujado se deriva del estado: una muestra deja de existir en el terreno en cuanto su estado cambia.
    for (const [id, o] of [...this.sprites]) {
      if (m.samples.find((s) => s.id === id).state === 'available') continue;
      o.img.disableInteractive(); this.tweens.killTweensOf([o.img, o.glow]);
      const pop = this.add.image(o.img.x, o.img.y, 'sample-' + id).setDepth(6);
      this.tweens.add({ targets: pop, y: pop.y - 40, scale: 1.8, alpha: 0, duration: 500, onComplete: () => pop.destroy() });
      o.img.destroy(); o.glow.destroy(); this.sprites.delete(id);
    }
    const drop = m.phase === 'landing' ? Math.pow(1 - m.t / RULES.landingTime, 2) * 280 : 0;
    this.rover.setPosition(r.x, r.y - drop).setFlipX(r.facing < 0);
    this.shadow.setPosition(r.x, r.y + 20).setScale(1 - drop / 500);
    this.bar.clear();
    if (m.action) {
      const w = 56, x = r.x - w / 2, y = r.y - 46;
      this.bar.fillStyle(0x050b16, .9).fillRect(x - 1, y - 1, w + 2, 8).fillStyle(m.action.type === 'collect' ? 0xffd166 : 0x6ce2cf, 1).fillRect(x, y, w * Math.min(1, m.action.progress), 6);
    }
  }
  update(_t, delta) {
    if (!this.m || this.finished) return;
    if (!app.paused) {
      for (const ev of step(this.m, readInput(), delta / 1000)) onEvent(ev);
      this.lastSave += delta; if (this.lastSave > 5000) { this.lastSave = 0; saveNow(); }
    }
    this.syncVisuals(); refreshHud();
    if (this.m.phase === 'success' || this.m.phase === 'failed') { this.finished = true; finishMission(); }
  }
}

// ---------- Pantallas HTML ----------
function renderResults() {
  const r = app.result; if (!r) { go('waiting'); return; }
  const p = r.progress;
  $('screen-results').innerHTML = `<div class="wrap">
    <section class="panel hero"><span class="kicker">${r.success ? 'MISIÓN COMPLETADA' : 'MISIÓN NO COMPLETADA'}</span>
      <h1 class="${r.success ? 'ok' : 'bad'}">${r.success ? '¡Datos recibidos en la Tierra!' : 'No se alcanzó el objetivo'}</h1>
      <p class="lead">${r.explanation}</p>
      <p class="score" style="margin-top:12px">${r.score} pts${r.success ? ' · ' + r.rating : ''}</p></section>
    <div class="grid2"><section class="panel"><h2>Puntuación</h2><table class="bd">${r.breakdown.map((b) => `<tr><td>${b.label}</td><td class="${b.points < 0 ? 'bad' : ''}">${b.points > 0 ? '+' : ''}${b.points}</td></tr>`).join('')}<tr class="tot"><td>Total</td><td>${r.score}</td></tr></table></section>
      <section class="panel"><h2>Resumen</h2><div class="stats"><span>Recogidas</span><b>${p.collected}</b><span>Analizadas</span><b>${p.analyzed} / ${p.goal}</b><span>Transmitidas</span><b>${p.transmitted} / ${p.goal}</b><span>Batería final</span><b>${r.energyPct} %</b><span>Tiempo</span><b>${fmt(r.elapsed, 0)} s</b><span>Choques</span><b>${r.bumps}</b><span>Masa / costo</span><b>${fmt(r.stats.mass)} kg · ${r.stats.cost} cr</b></div></section></div>
    <section class="panel"><h2>Cómo mejorar</h2><ul class="list">${r.suggestions.map((s) => `<li>${s}</li>`).join('')}</ul>
      <p class="muted" style="margin-top:8px;font-size:.85rem">Puntuación y sugerencias calculadas con reglas fijas a partir de tu partida; no hay decisiones arbitrarias.</p></section>
    <div class="row"><button class="primary" data-cmd="retry">Reintentar con este rover</button><button data-cmd="exit">Volver al centro de control</button></div></div>`;
}
$('screen-results').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  if (c.dataset.cmd === 'retry') beginMission(); else if (c.dataset.cmd === 'exit') exitMission();
});

// ---------- Arranque ----------
const params = new URLSearchParams(location.search);
const saved = params.get('resume') === '1' ? restoreMission(store.get(SAVE_KEY)) : null;
const plan = saved?.build ?? readMissionPlan(location.hash);
document.querySelectorAll('[data-mission-exit]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  saveNow();
  exitMission();
}));
localizeDOM(document.querySelector('.topbar'));

if (validateBuild(plan).ok) {
  app.build = plan;
  app.game = new Phaser.Game({
    type: Phaser.CANVAS, parent: 'game', backgroundColor: '#050b16', pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    scene: [BackdropScene, ExploreScene],
    callbacks: { postBoot(game) {
      app.game = game;
      if (saved) {
        app.mission = saved;
        go('explore');
        setPaused(true);
      } else beginMission();
    } },
  });
  window.__rover = { app, go, tryAction, setPaused, SAMPLE_DEFS, flash };
} else {
  $('screen-waiting').textContent = t('station.prepareFirst');
  go('waiting');
}
