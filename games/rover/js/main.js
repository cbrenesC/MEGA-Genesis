import { simText } from "../../../src/i18n/catalog.js";
// Módulo lunar (Phaser 3). Phaser dibuja el terreno y el rover; las pantallas de decisión y el HUD son HTML.
//   Consolas del centro de control → Aterrizaje y exploración → Resultados
// Toda la lógica vive en rules.js; aquí solo se lee el estado y se dibuja.
import {
  WORLD, RULES, SAMPLE_DEFS,
  emptyBuild, validateBuild, createMission, step, startAction, availability,
  progress, evaluate, snapshot, restoreMission, fmt, fmtCost, dataPackets, allAcked,
} from './rules.js';
import { roverCanvas, terrainCanvas, sampleCanvas, poiCanvas, earthCanvas, skyCanvas, lightCanvas, iceSpots } from './art.js';
import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import { formatNumber, getLanguage, localizeDOM, t } from '../../../src/i18n/index.js';
import { getPreferences, hasStorageConsent } from '../../../src/welcome/core/consent.js';
import { playableDelivery, sameRoverBuild } from '../../../src/missions/lunarCampaign.js';
import { MISSION_COMPLETE, ROVER_PROGRESS, readMissionPlan, returnToControl, ROVER_SAVE_KEY as SAVE_KEY } from '../../../src/missions/missionTransfer.js';

const $ = (id) => document.getElementById(id);
const exitMission = () => returnToControl(getLanguage());
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const animateCamera = () => !reducedMotion.matches && getPreferences().animations;
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
const STEPS = [['explore', simText("rover.exploration")], ['results', simText("rover.results")]];
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
  if (name === 'results') renderResults();
  if (name !== 'explore') { const s = document.querySelector(`[data-screen-id="${name}"]`); if (s) s.scrollTop = 0; }
}

// ---------- Misión: ciclo de vida ----------
function beginMission() {
  const v = validateBuild(app.build);
  if (!v.ok) { flash(v.reasons[0], 'bad'); return false; } // se revalida: no depende solo del botón
  app.mission = createMission(app.build); app.mission.campaignRun = app.campaign?.runId ?? null; app.result = null; go('explore'); saveNow(); return true;
}
function saveNow() {
  const m = app.mission;
  if (!m || (m.phase !== 'explore' && m.phase !== 'landing')) return;
  const progress = snapshot(m);
  store.set(SAVE_KEY, progress);
  if (window.parent !== window) window.parent.postMessage({ type: ROVER_PROGRESS, snapshot: progress }, location.origin);
}
function setPaused(p) {
  if (app.screen !== 'explore' || !app.mission || app.mission.phase === 'success' || app.mission.phase === 'failed') return;
  app.paused = p; $('pause').hidden = !p; directions.clear(); app.virt.clear(); app.keys.clear();
  const sc = sceneOf(); if (sc?.sys.isActive()) p ? sc.tweens.pauseAll() : sc.tweens.resumeAll();
  if (p) saveNow();
}
function finishMission() {
  app.result = evaluate(app.mission);
  store.del(SAVE_KEY);
  if (window.parent !== window) window.parent.postMessage({ type: MISSION_COMPLETE, mission: 'rover', success: app.result.success }, location.origin);
  go('results');
}

function tryAction(type) {
  const m = app.mission;
  if (app.screen !== 'explore' || app.paused || !m) return;
  const r = startAction(m, type);
  if (!r.ok) flash(r.reason, 'warn');
}
function onEvent(ev) {
  const m = app.mission, obj = ev.targetId && (m.samples.find((x) => x.id === ev.targetId) || m.photos.find((x) => x.id === ev.targetId));
  const sc = sceneOf(); if (sc && sc.fxEvent) sc.fxEvent(ev);
  if (ev.type === 'landed') flash(simText("rover.successful-landing-explore-scan-and-collect-samples"));
  else if (ev.type === 'collected') { flash(simText("rover.sample-0-collected-1-analyze-it-next", obj.id, obj.kind)); saveNow(); }
  else if (ev.type === 'analyzed') { flash(simText("rover.analysis-of-0-is-complete-you-can-now", obj.id)); saveNow(); }
  else if (ev.type === 'photographed') { flash(simText("rover.photo-of-0-saved-transmit-it-to-earn", obj.name)); saveNow(); }
  else if (ev.type === 'transmitted') { flash(simText("rover.0-from-1-sent-waiting-for-earth-s", obj.name ? simText("rover.photo") : simText("rover.data"), obj.id)); saveNow(); }
  else if (ev.type === 'scanned') { flash(ev.found.length ? simText("rover.scanner-0-hidden-sample-s-detected", ev.found.length) : simText("rover.scanner-nothing-new-within") + RULES.scanRange + simText("rover.px"), ev.found.length ? 'ok' : 'warn'); saveNow(); }
  else if (ev.type === 'success') flash(simText("rover.objective-met-waiting-for-final-confirmation-from-earth"));
  else if (ev.type === 'action-failed') flash(ev.reason, 'warn');
  else if (ev.type === 'bump') flash(simText("rover.obstacle-steer-around-craters-and-rocks"), 'warn');
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
  else if (c.dataset.cmd === 'restart') beginMission();
  else if (c.dataset.cmd === 'exit') { saveNow(); exitMission(); }
});

// ---------- HUD ----------
let lastHud = '', lastHint = '';
function refreshHud() {
  const m = app.mission; if (!m) return;
  const p = progress(m), cap = m.stats.capacity, pct = Math.round((m.battery / cap) * 100);
  const cls = pct <= 15 ? 'bad' : pct <= 35 ? 'warn' : '';
  const left = Math.max(0, Math.ceil(RULES.timeLimit - m.elapsed));
  const html = `<div class="stat energy"><span>${simText("rover.energy")}</span><b>${fmt(m.battery, 0)} / ${cap} u · ${pct} %</b><div class="bar ${cls}"><i style="width:${pct}%"></i></div></div>
    <div class="stat"><span>${simText("rover.analyzed")}</span><b>${p.analyzed} / ${p.goal}</b></div>
    <div class="stat"><span>${simText("rover.transmitted")}</span><b>${p.transmitted} / ${p.goal}</b></div>
    <div class="stat"><span>${simText("rover.collected")}</span><b>${p.collected}</b></div>
    <div class="stat"><span>${simText("rover.time")}</span><b>${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b></div>`;
  if (html !== lastHud) { $('hud-stats').innerHTML = html; lastHud = html; }
  // Hint contextual
  let msg, kind = '';
  if (m.phase === 'landing') msg = simText("rover.automatic-landing-in-progress");
  else if (m.action) { msg = simText("rover.0-1-2-do-not-move-or-the", m.action.label, m.action.targetId ? simText("rover.on") + m.action.targetId : '', Math.round(m.action.progress * 100)); kind = 'ok'; }
  else if (m.noPower) { msg = simText("rover.out-of-energy-stop-moving-so-the-solar"); kind = 'bad'; }
  else if (hintMsg && hintMsg.until > performance.now()) { msg = hintMsg.msg; kind = hintMsg.kind; }
  else if (availability(m, 'collect').ok) { msg = simText("rover.sample-in-range-press-e-to-collect-it"); kind = 'ok'; }
  else if (availability(m, 'photo').ok) { msg = simText("rover.0-is-in-range-press-c-to-take", availability(m, 'photo').target.name); kind = 'ok'; }
  else if (m.samples.some((s) => s.state === 'collected')) msg = simText("rover.you-have-samples-to-analyze-press-f");
  else if (m.samples.some((s) => s.state === 'analyzed') || m.photos.some(p => p.state === 'captured')) msg = simText("rover.analyses-or-photos-are-ready-press-t-to");
  else if (m.samples.some((s) => s.hidden && !s.revealed) && p.collected >= 1) msg = simText("rover.some-samples-are-still-hidden-press-r-to");
  else msg = simText("rover.drive-with-wasd-or-arrows-look-for-glowing");
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
let lastData = '', earthIcon;
function renderData(m) {
  const pk = dataPackets(m), strip = $('hud-data');
  strip.hidden = pk.length === 0; if (!pk.length) { lastData = ''; return; }
  const tx = m.action && m.action.type === 'transmit' ? m.action : null;
  const pendingAck = Math.min(...Object.values(m.acks), 1);
  let linkPct = 0, linkTxt = simText("rover.0-antenna-on-standby", m.build.comms === 'alta' ? simText("rover.high-gain") : m.build.comms === 'media' ? simText('rover.mid-gain') : simText("rover.low-gain")), linkCls = '';
  if (tx) { linkPct = Math.round(tx.progress * 100); linkTxt = simText("rover.transmitting-0-1", tx.targetId, linkPct); linkCls = 'is-tx'; }
  else if (pendingAck < 1) { linkPct = Math.round(pendingAck * 100); linkTxt = simText("rover.receiving-confirmation-0", linkPct); linkCls = 'is-rx'; }
  else if (Object.keys(m.acks).length) { linkPct = 100; linkTxt = simText("rover.last-transmission-confirmed"); linkCls = 'is-ok'; }
  const html = `<div class="pkt link ${linkCls}"><div class="pkt-h"><span class="pkt-id"><canvas id="earth-ico" width="22" height="22" aria-hidden="true"></canvas> ${simText("rover.earth-link")}</span><b>${linkPct} %</b></div><div class="bar"><i style="width:${linkPct}%"></i></div><div class="pkt-s">${linkTxt}</div></div>`
    + pk.map((k) => `<div class="pkt ${k.kind} ${k.active ? 'is-active' : ''} ${k.overall >= 100 ? 'is-done' : ''}" title="${k.title}"><div class="pkt-h"><span class="pkt-id">${k.kind === 'photo' ? '📷' : '🪨'} ${k.id}</span><b>${k.overall} %</b></div>
      <div class="pkt-t">${k.title}</div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${k.overall}" aria-label="${simText('rover.packet-progress', k.title)}"><i style="width:${k.overall}%"></i></div>
      <div class="pkt-s">${k.stage}${k.active || (k.state === 'transmitted' && k.pct < 100) ? ' · ' + k.pct + ' %' : ''}</div></div>`).join('');
  if (html !== lastData) {
    const scroll = strip.scrollLeft;
    strip.innerHTML = html;
    strip.scrollLeft = scroll;
    lastData = html;
    earthIcon ??= earthCanvas(22);
    $('earth-ico').getContext('2d').drawImage(earthIcon, 0, 0);
  }
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
    if (!m) { go('waiting'); return; }
    this.m = m; this.finished = false; this.endT = 0; this.lastSave = 0; this.sprites = new Map(); this.pois = new Map(); this.dustT = 0; this.puffs = 0; this.lastTrack = { x: m.rover.x, y: m.rover.y };
    const T = this.textures;
    if (!T.exists('terrain')) T.addCanvas('terrain', terrainCanvas());
    for (const [id, c] of Object.entries(TINTS)) if (!T.exists('sample-' + id)) T.addCanvas('sample-' + id, sampleCanvas(3, c));
    if (!T.exists('poi')) T.addCanvas('poi', poiCanvas(3));
    // cuatro cuadros del rover: sólo cambian las ruedas (giran al avanzar)
    for (let f = 0; f < 4; f++) { const key = f ? 'rover' + f : 'rover'; if (T.exists(key)) T.remove(key); T.addCanvas(key, roverCanvas(m.build, 4, f)); }
    if (T.exists('tracks')) T.remove('tracks');
    this.tracks = T.createCanvas('tracks', WORLD.w, WORLD.h);
    this.add.image(0, 0, 'terrain').setOrigin(0);
    this.add.image(0, 0, 'tracks').setOrigin(0);
    // Luz del Sol rasante sobre todo el terreno (cálida arriba-izquierda, penumbra abajo-derecha)
    if (!T.exists('sunlight')) T.addCanvas('sunlight', lightCanvas());
    this.add.image(0, 0, 'sunlight').setOrigin(0).setDisplaySize(WORLD.w, WORLD.h).setDepth(.5);
    this.ambience();
    for (const p of m.photos) if (p.state === 'available') this.makePoi(p);
    for (const s of m.samples) if (s.state === 'available' && s.revealed) this.makeSample(s, false);
    // Sombra larga del rover (Sol bajo) y faros que iluminan el suelo por delante
    this.shadow = this.add.ellipse(m.rover.x, m.rover.y + 20, 74, 14, 0x000000, .46).setDepth(2);
    this.beam = this.add.graphics().setDepth(1.5);
    this.plume = this.add.graphics().setDepth(2.5);
    this.rover = this.add.image(m.rover.x, m.rover.y, 'rover').setOrigin(.5, .9).setScale(.72).setDepth(3);
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
    if (app.paused) this.tweens.pauseAll();
    this.syncVisuals(); refreshHud();
  }
  // Vida del escenario: hielo que destella en las sombras de los cráteres, baliza del módulo, luces del borde del cráter
  // y la sombra de un orbitador que cruza de vez en cuando. Sólo decoración: no toca las reglas.
  ambience() {
    const calm = !animateCamera();
    for (const sp of iceSpots()) {
      const q = this.add.rectangle(sp.x, sp.y, sp.big ? 4 : 3, sp.big ? 4 : 3, sp.big ? 0xd6f1ff : 0x8fd0f5, .9).setDepth(.6);
      if (!calm) this.tweens.add({ targets: q, alpha: .15, duration: 700 + Math.random() * 1600, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
    }
    const lander = this.m.photos.find((p) => p.id === 'P1');
    if (lander) {
      const beacon = this.add.rectangle(lander.x, lander.y - 4, 5, 5, 0xff5959, 1).setDepth(1.2);
      const halo = this.add.circle(lander.x, lander.y - 4, 14, 0xff5959, .25).setDepth(1.1);
      if (!calm) { this.tweens.add({ targets: beacon, alpha: .1, duration: 520, yoyo: true, repeat: -1 }); this.tweens.add({ targets: halo, alpha: 0, scale: 2.2, duration: 1040, repeat: -1 }); }
    }
    if (!calm) this.time.addEvent({ delay: 26000, loop: true, startAt: 18000, callback: () => { // sombra del orbitador que retransmite a la Tierra
      const y = 120 + Math.random() * (WORLD.h - 240), sat = this.add.container(-60, y).setDepth(.7).setAlpha(.32);
      sat.add([this.add.rectangle(0, 0, 14, 8, 0x000000), this.add.rectangle(-16, 0, 14, 5, 0x000000), this.add.rectangle(16, 0, 14, 5, 0x000000)]);
      this.tweens.add({ targets: sat, x: WORLD.w + 60, y: y + 160, duration: 5200, onComplete: () => sat.destroy() });
    } });
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
    else if (ev.type === 'photographed') { if (animateCamera()) this.cameras.main.flash(220, 255, 255, 255); const p = this.m.photos.find((x) => x.id === ev.targetId); this.burst(p.x, p.y, [0xffd166, 0xffffff], 12, 55); }
    else if (ev.type === 'transmitted') this.ping(r.x, r.y - 30, 0xffd166, 150);
    else if (ev.type === 'scanned') for (const id of ev.found) { const s = this.m.samples.find((x) => x.id === id); this.ping(s.x, s.y, 0x6ce2cf, 140); }
    else if (ev.type === 'bump' && animateCamera()) this.cameras.main.shake(120, .004);
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
    const frame = r.moving ? Math.floor(ex * 14) % 4 : 0, key = frame ? 'rover' + frame : 'rover';
    if (this.rover.texture.key !== key) this.rover.setTexture(key);
    this.rover.setPosition(r.x, r.y + 14 - drop + (r.moving ? Math.round(Math.sin(ex * 18)) : 0)).setFlipX(r.facing < 0).setAngle(r.moving ? Math.sin(ex * 9) * .8 : 0);
    this.shadow.setPosition(r.x + 10 + drop * .5, r.y + 22 + drop * .5).setScale(1 - drop / 500).setAlpha(.46 - drop / 800);
    // Faros: cono de luz hacia donde mira el rover (se apaga sin energía)
    const beam = this.beam; beam.clear();
    if (m.phase !== 'landing' && !m.noPower) {
      const f = r.facing > 0 ? 1 : -1, bx = r.x + f * 26, by = r.y + 6;
      beam.fillStyle(0xfff3c4, .1).fillTriangle(bx, by - 4, bx + f * 120, by - 34, bx + f * 120, by + 40);
      beam.fillStyle(0xfff3c4, .1).fillTriangle(bx, by - 2, bx + f * 78, by - 16, bx + f * 78, by + 24);
    }
    // Descenso: llama del motor bajo el rover y anillo de polvo que crece al acercarse al suelo
    const plume = this.plume; plume.clear();
    if (drop > 2) {
      const k = Math.min(1, drop / 280), fl = 26 + Math.sin(ex * 60) * 6;
      plume.fillStyle(0xff7a3d, .9).fillTriangle(r.x - 9, r.y - drop + 16, r.x + 9, r.y - drop + 16, r.x, r.y - drop + 16 + fl);
      plume.fillStyle(0xffe08a, .95).fillTriangle(r.x - 5, r.y - drop + 16, r.x + 5, r.y - drop + 16, r.x, r.y - drop + 16 + fl * .6);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.2832 + ex * 2, rad = (1 - k) * 90 + 14; plume.fillStyle(0xb9b5a8, .5 * (1 - k)).fillRect(r.x + Math.cos(a) * rad - 3, r.y + 16 + Math.sin(a) * rad * .35 - 3, 6, 6); }
    }
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
      const ctx = this.tracks.getContext();
      const dx = r.x - this.lastTrack.x, dy = r.y - this.lastTrack.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      for (const side of [-1, 1]) { // dos rodadas paralelas, con el borde iluminado
        const tx = Math.round((r.x + nx * side * 12) / 3) * 3, ty = Math.round((r.y + 14 + ny * side * 7) / 3) * 3;
        ctx.fillStyle = 'rgba(6,8,14,.42)'; ctx.fillRect(tx, ty, 6, 3);
        ctx.fillStyle = 'rgba(220,214,200,.16)'; ctx.fillRect(tx - 3, ty - 3, 6, 3);
      }
      this.tracks.refresh(); this.lastTrack = { x: r.x, y: r.y };
    }
    this.dustT += delta; if (this.dustT > 110 && this.puffs < 30) {
      this.dustT = 0; this.puffs++;
      // en la Luna no hay aire: el polvo sale en arco y cae, no queda flotando
      const q = this.add.rectangle(r.x - r.facing * 22 + (Math.random() - .5) * 8, r.y + 18, 6, 6, Math.random() > .5 ? 0xc9c6bd : 0x8e8d8a, .7).setDepth(2);
      this.tweens.add({ targets: q, x: q.x - r.facing * (14 + Math.random() * 18), duration: 520, onComplete: () => { q.destroy(); this.puffs--; } });
      this.tweens.add({ targets: q, y: q.y - 12 - Math.random() * 8, duration: 260, yoyo: true, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: q, alpha: 0, delay: 300, duration: 220 });
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
const escReport = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function campaignReport(r) {
  const d = app.campaign;
  if (!d) return '';
  const tr = (key, params) => escReport(t(key, params));
  const n = (value, decimals = 0) => formatNumber(value, decimals);
  const received = r.packets.filter(packet => packet.state === 'transmitted' && packet.overall === 100 && (app.mission.acks[packet.id] ?? 1) === 1);
  const samples = received.filter(packet => packet.kind === 'sample').length;
  const photos = received.length - samples;
  const build = app.mission.build;
  return `<section class="panel">
    <h2>${tr('campaign.report')}</h2>
    <p>${tr('campaign.flightSummary', { launcher: d.launcher, site: d.site, payload: n(d.payloadKg), cost: n(d.costMUSD, 2), budget: n(d.budgetMUSD) })}</p>
    <p>${tr(received.length ? 'campaign.receivedSummary' : 'campaign.receivedNone', { samples, photos })}</p>
    ${received.length ? `<ul class="list">${received.map(p => `<li>${escReport(p.id)} · ${escReport(p.title)}</li>`).join('')}</ul>` : ''}
    <h3>${tr('campaign.decisions')}</h3>
    <ul class="list">
      <li>${tr('campaign.margin', { margin: n(d.marginKg, 1), budget: n(d.budgetMUSD - d.costMUSD, 2) })}</li>
      <li>${tr(d.corrected ? 'campaign.correction' : 'campaign.cleanTransfer')}</li>
      <li>${tr('campaign.roverChoices', { instrument: t(`station.component.instrument.${build.instrument}`), antenna: t(`station.component.comms.${build.comms}`), analysis: n(r.stats.analysisTime, 1), tx: n(r.stats.txTime, 1), energy: n(r.stats.txEnergy, 1) })}</li>
      <li>${tr('campaign.energyUsed', { remaining: r.energyPct, solar: n(r.stats.solar, 1) })}</li>
    </ul>
  </section>`;
}

function renderResults() {
  const r = app.result; if (!r) { go('waiting'); return; }
  const p = r.progress, bars = r.packets.map((k) => `<div class="pkt res ${k.kind} ${k.overall >= 100 ? 'is-done' : ''}"><div class="pkt-h"><span class="pkt-id">${k.kind === 'photo' ? '📷' : '🪨'} ${k.id} · ${k.title}</span><b>${k.overall} %</b></div><div class="bar"><i style="width:${k.overall}%"></i></div><div class="pkt-s">${k.overall >= 100 ? simText("rover.received-on-earth-3") : k.stage}</div></div>`).join('');
  $('screen-results').innerHTML = `<div class="wrap">
    <section class="panel hero"><div class="hero-row"><div><span class="kicker">${r.success ? simText("rover.mission-complete") : simText("rover.mission-incomplete")}</span>
      <h1 class="${r.success ? 'ok' : 'bad'}">${r.success ? simText("rover.data-received-on-earth") : simText("rover.objective-not-met")}</h1>
      <p class="lead">${r.explanation}</p>
      <p class="score" style="margin-top:12px">${r.score} pts${r.success ? ' · ' + r.rating : ''}</p></div>
      <img class="earth" alt="${simText("rover.earth")}" width="112" height="112" src="${earthCanvas(56).toDataURL()}"></div></section>
    <div class="grid2"><section class="panel"><h2>${simText("rover.objectives")}</h2><ul class="objs">${r.objectives.map((o) => `<li class="${o.done ? 'done' : ''}"><span class="chk">${o.done ? '✔' : '○'}</span>${o.label}${o.main ? ` <span class="chip">${simText("rover.primary")}</span>` : ''}</li>`).join('')}</ul></section>
      <section class="panel"><h2>${simText("rover.score")}</h2><table class="bd">${r.breakdown.map((b) => `<tr><td>${b.label}</td><td class="${b.points < 0 ? 'bad' : ''}">${b.points > 0 ? '+' : ''}${b.points}</td></tr>`).join('')}<tr class="tot"><td>${t('common.total')}</td><td>${r.score}</td></tr></table></section></div>
    ${campaignReport(r)}
    <section class="panel"><h2>${simText("rover.data-report")}</h2>${bars ? `<div class="res-pkts">${bars}</div>` : `<p class="muted">${simText("rover.no-data-collected")}</p>`}</section>
    <div class="grid2"><section class="panel"><h2>${simText("rover.summary")}</h2><div class="stats"><span>${simText("rover.collected")}</span><b>${p.collected}</b><span>${simText("rover.analyzed")}</span><b>${p.analyzed} / ${p.goal}</b><span>${simText("rover.transmitted")}</span><b>${p.transmitted} / ${p.goal}</b><span>${simText("rover.photos-transmitted")}</span><b>${p.photosTransmitted} / ${p.photoTotal}</b><span>${simText("rover.hidden-samples-found")}</span><b>${p.discovered} / ${p.hiddenTotal}</b><span>${simText("rover.final-battery")}</span><b>${r.energyPct} %</b><span>${simText("rover.time")}</span><b>${fmt(r.elapsed, 0)} s</b><span>${simText("rover.collisions")}</span><b>${r.bumps}</b><span>${simText("rover.mass-cost")}</span><b>${fmt(r.stats.mass)} kg · ${fmtCost(r.stats.cost)}</b></div></section>
    <section class="panel"><h2>${simText("rover.how-to-improve")}</h2><ul class="list">${r.suggestions.map((s) => `<li>${s}</li>`).join('')}</ul>
      <p class="muted" style="margin-top:8px;font-size:.85rem">${simText("rover.the-score-and-suggestions-follow-the-same-rules")}</p></section></div>
    <div class="row"><button class="primary" data-cmd="retry">${simText("rover.try-again-with-this-rover")}</button><button data-cmd="exit">${simText("rover.return-to-mission-control")}</button></div></div>`;
}
$('screen-results').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  if (c.dataset.cmd === 'retry') beginMission(); else if (c.dataset.cmd === 'exit') exitMission();
});

// ---------- Arranque ----------
const params = new URLSearchParams(location.search);
const plan = readMissionPlan(location.hash);
const campaign = plan?.campaign;
const validCampaign = playableDelivery(campaign) && sameRoverBuild(campaign.build, plan);
const savedGame = params.get('resume') === '1' ? restoreMission(plan?.progress ?? store.get(SAVE_KEY)) : null;
const saved = savedGame && sameRoverBuild(savedGame.build, plan)
  && (savedGame.campaignRun ?? null) === (campaign?.runId ?? null) ? savedGame : null;
app.campaign = validCampaign ? campaign : null;
document.querySelectorAll('[data-mission-exit]').forEach(button => button.addEventListener('click', event => {
  event.preventDefault();
  saveNow();
  exitMission();
}));
localizeDOM();

if (validateBuild(plan).ok && (!campaign || validCampaign)) {
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
