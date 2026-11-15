import { formatNumber, t, onLanguageChange } from '../../src/i18n/index.js';
import { initializeGamePage } from '../../src/i18n/gamePage.js';

initializeGamePage();

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const telemetry = document.getElementById('telemetry');
const keys = new Set();
const craters = [
  { x: 180, y: 150, r: 45 }, { x: 390, y: 320, r: 52 },
  { x: 470, y: 125, r: 38 }, { x: 130, y: 400, r: 35 },
];
const samples = [
  { x: 315, y: 130, done: false }, { x: 530, y: 430, done: false },
  { x: 105, y: 270, done: false },
];
const states = { ready: 'rover.readyState', landing: 'rover.landingState', drive: 'rover.driveState', won: 'rover.winState', failed: 'rover.failState' };
let mode = 'ready', x = 320, y = 460, battery = 100, last = 0, landingTimer;
let messageKey = 'rover.select';

function message(key) {
  messageKey = key;
  const text = t(key);
  if (status.textContent !== text) status.textContent = text;
}
onLanguageChange(() => message(messageKey));

function reset() {
  clearTimeout(landingTimer);
  keys.clear();
  mode = 'ready';
  x = 320;
  y = 460;
  battery = 100;
  samples.forEach(sample => { sample.done = false; });
  message('rover.select');
}

document.getElementById('start').addEventListener('click', () => {
  reset();
  mode = 'landing';
  message('rover.landing');
  landingTimer = setTimeout(() => {
    mode = 'drive';
    message('rover.landed');
  }, 1600);
});
document.getElementById('reset').addEventListener('click', reset);

const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);
window.addEventListener('keydown', event => {
  if (event.target.closest?.('select, input, textarea, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (!movementKeys.has(key)) return;
  event.preventDefault();
  keys.add(key);
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
document.querySelectorAll('[data-dir]').forEach(button => {
  const key = 'arrow' + button.dataset.dir;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    keys.add(key);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel']) {
    button.addEventListener(event, () => keys.delete(key));
  }
});

function drive(dt) {
  const dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  if (dx || dy) {
    const magnitude = Math.hypot(dx, dy);
    const nextX = Math.max(18, Math.min(622, x + dx / magnitude * 90 * dt));
    const nextY = Math.max(18, Math.min(502, y + dy / magnitude * 90 * dt));
    if (craters.some(crater => Math.hypot(nextX - crater.x, nextY - crater.y) < crater.r + 13)) {
      battery = Math.max(0, battery - 8 * dt);
      message('rover.obstacle');
    } else {
      x = nextX;
      y = nextY;
      battery = Math.max(0, battery - 1.8 * dt);
    }
  }

  for (const sample of samples) {
    if (!sample.done && Math.hypot(x - sample.x, y - sample.y) < 22) {
      sample.done = true;
      message('rover.sample');
    }
  }
  if (samples.every(sample => sample.done)) {
    mode = 'won';
    message('rover.success');
  } else if (battery <= 0) {
    mode = 'failed';
    message('rover.failure');
  }
}

function frame(time) {
  const dt = Math.min((time - last) / 1000 || 0, .05);
  last = time;
  if (mode === 'drive') drive(dt);

  ctx.fillStyle = '#26303a';
  ctx.fillRect(0, 0, 640, 520);
  ctx.fillStyle = '#34404a';
  for (let i = 0; i < 120; i++) ctx.fillRect(i * 127 % 640, i * 89 % 520, 3, 3);
  for (const crater of craters) {
    ctx.beginPath();
    ctx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
    ctx.fillStyle = '#121c27';
    ctx.fill();
    ctx.strokeStyle = '#61707b';
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.fillStyle = '#6ce2cf';
  for (const sample of samples) if (!sample.done) ctx.fillRect(sample.x - 7, sample.y - 7, 14, 14);
  ctx.fillStyle = '#e9e4d6';
  ctx.fillRect(x - 16, y - 11, 32, 22);
  ctx.fillStyle = '#5c9fb7';
  ctx.fillRect(x - 7, y - 8, 14, 12);
  ctx.fillStyle = '#121923';
  ctx.fillRect(x - 17, y + 9, 11, 9);
  ctx.fillRect(x + 7, y + 9, 11, 9);
  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.fillText(t('rover.canvasTitle'), 16, 28);
  ctx.fillText(t('rover.status', { state: t(states[mode]) }), 16, 50);
  const nextTelemetry = t('rover.telemetry', { battery: formatNumber(battery), count: samples.filter(s => s.done).length });
  if (telemetry.textContent !== nextTelemetry) telemetry.textContent = nextTelemetry;
  requestAnimationFrame(frame);
}

message(messageKey);
requestAnimationFrame(frame);
