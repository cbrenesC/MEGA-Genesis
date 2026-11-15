// Módulo lunar (Phaser 3). Phaser dibuja el terreno y el rover; las pantallas de decisión y el HUD son HTML.
//   Briefing → Construcción → Exploración (recoger → analizar → transmitir) → Resultados
// Toda la lógica vive en rules.js; aquí solo se lee el estado y se dibuja.
import {
  LIMITS, WORLD, RULES, CATEGORIES, COMPONENTS, RECOMMENDED_BUILD, SAMPLE_DEFS,
  emptyBuild, selectComponent, computeBuild, validateBuild, createMission, step, startAction, availability,
  progress, evaluate, snapshot, restoreMission, fmt,
} from './rules.js';
import { roverCanvas, terrainCanvas, sampleCanvas } from './art.js';

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
  $('pause').hidden = true; app.paused = false; app.virt.clear(); hintMsg = null;
  const sm = app.game.scene;
  if (name === 'explore') { sm.stop('BackdropScene'); sm.stop('ExploreScene'); sm.start('ExploreScene'); }
  else if (app.game.isBooted) { sm.stop('ExploreScene'); if (!sm.isActive('BackdropScene')) sm.start('BackdropScene'); }
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
  app.paused = p; $('pause').hidden = !p; app.virt.clear(); app.keys.clear();
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
$('dpad').addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-dir]'); if (!b) return; e.preventDefault(); app.virt.add('arrow' + b.dataset.dir); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('dpad').addEventListener(ev, (e) => { const b = e.target.closest && e.target.closest('[data-dir]'); if (b) app.virt.delete('arrow' + b.dataset.dir); else if (ev !== 'pointerup') app.virt.clear(); }, true);
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
      this.g.fillGradientStyle(0x050b16, 0x050b16, 0x0b2447, 0x0b2447, 1).fillRect(0, 0, w, h);
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
    if (!m) { go('build'); return; }
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
function renderBriefing() {
  const saved = store.get(SAVE_KEY), canContinue = !!restoreMission(saved);
  $('screen-briefing').innerHTML = `<div class="wrap">
    <section class="panel hero"><span class="kicker">MISIÓN 02 · SUPERFICIE LUNAR</span>
      <h1>Envío de rover a la Luna</h1>
      <p class="lead">Diseña un rover dentro de un límite de <b>${LIMITS.mass} kg</b> y <b>${LIMITS.credits} créditos</b>, aterriza y conduce hasta las muestras. Recoge, analiza y transmite los datos de <b>${RULES.sampleGoal} muestras distintas</b> antes de que se acabe la energía o el tiempo.</p>
      <div class="row" style="margin-top:14px"><button class="primary" data-cmd="build">Construir rover</button>${canContinue ? '<button data-cmd="continue">Continuar misión guardada</button>' : ''}</div>
    </section>
    <div class="grid2">
      <section class="panel"><h2>Objetivos</h2><ul class="list">
        <li><b>Recoger:</b> acércate a una muestra (menos de ${RULES.collectRange} px) y mantén el rover quieto ${RULES.collectTime} s.</li>
        <li><b>Analizar:</b> el instrumento estudia una muestra recogida (consume energía y tiempo).</li>
        <li><b>Transmitir:</b> envía los datos analizados. Solo las muestras transmitidas completan la misión.</li>
        <li>Evita cráteres y rocas; la batería nunca baja de cero ni supera su capacidad.</li></ul></section>
      <section class="panel"><h2>Reglas de energía</h2><ul class="list">
        <li>Moverse consume energía según chasis y ruedas.</li>
        <li>El panel solar recarga <b>solo con el rover detenido</b>.</li>
        <li>Sin energía suficiente, la acción se bloquea y se te explica por qué.</li>
        <li>Tiempo máximo de exploración: ${RULES.timeLimit / 60} minutos.</li></ul></section>
    </div>
    <section class="panel"><h2>Controles</h2><div class="row"><span><kbd>WASD</kbd> / <kbd>←↑↓→</kbd> mover</span><span><kbd>E</kbd> recoger</span><span><kbd>F</kbd> analizar</span><span><kbd>T</kbd> transmitir</span><span><kbd>P</kbd> pausa</span><span class="muted">En móvil: cruceta y botones en pantalla.</span></div></section></div>`;
}
$('screen-briefing').addEventListener('click', (e) => { const c = e.target.closest('[data-cmd]'); if (!c) return; if (c.dataset.cmd === 'build') go('build'); else if (c.dataset.cmd === 'continue') continueSaved(); });

const factsFor = {
  chassis: (c) => `Velocidad ${c.speed} px/s · consumo al moverse ${fmt(c.moveDraw)} u/s`,
  wheels: (c) => `Velocidad ×${c.speedMul} · consumo ×${c.drawMul} · daño por choques ×${c.bumpMul}`,
  battery: (c) => `Capacidad ${c.capacity} u`,
  solar: (c) => `Recarga +${fmt(c.gen)} u/s con el rover detenido`,
  instrument: (c) => `${c.analysisTime} s · ${c.analysisEnergy} u por análisis · valor científico ×${c.quality}`,
  camera: (c) => `Consumo ${fmt(c.draw, 2)} u/s · valor de datos ×${c.dataMul}`,
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
    <div class="row"><button class="primary" data-cmd="retry">Reintentar con este rover</button><button data-cmd="rebuild">Modificar rover</button><button data-cmd="home">Volver al briefing</button></div></div>`;
}
$('screen-results').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cmd]'); if (!c) return;
  if (c.dataset.cmd === 'retry') beginMission(); else if (c.dataset.cmd === 'rebuild') go('build'); else if (c.dataset.cmd === 'home') go('briefing');
});

// ---------- Arranque ----------
const saved = store.get(BUILD_KEY);
if (saved && typeof saved === 'object') { let b = emptyBuild(); for (const cat of CATEGORIES) b = selectComponent(b, cat.id, saved[cat.id]); app.build = b; }
app.game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#050b16', pixelArt: true, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, scene: [BackdropScene, ExploreScene] });
window.__rover = { app, go, tryAction, setPaused, SAMPLE_DEFS, flash };
go('briefing');
