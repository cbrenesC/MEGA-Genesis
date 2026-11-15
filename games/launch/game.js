import { formatNumber, t, onLanguageChange } from '../../src/i18n/index.js';
import { initializeGamePage } from '../../src/i18n/gamePage.js';

initializeGamePage();

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const start = document.getElementById('start');
const log = document.getElementById('log');
const telemetry = document.getElementById('telemetry');
const inputs = Object.fromEntries(['fuel', 'thrust', 'angle'].map(key => [key, document.getElementById(key)]));
const stars = Array.from({ length: 65 }, (_, i) => ({ x: i * 97 % 640, y: i * 179 % 500 }));
let state = 'ready';
let altitude = 0, speed = 0, fuel = +inputs.fuel.value, x = 320, clock = 0, last = 0;
let messageKey = 'launch.objective';

function message(key) {
  messageKey = key;
  log.textContent = t(key);
}
onLanguageChange(() => message(messageKey));

for (const [key, input] of Object.entries(inputs)) {
  const output = document.getElementById(key + 'Value');
  input.addEventListener('input', () => {
    output.textContent = input.value;
    if (key === 'fuel' && state === 'ready') fuel = +input.value;
  });
}

function resetFlight() {
  altitude = speed = clock = 0;
  x = 320;
  fuel = +inputs.fuel.value;
}

start.addEventListener('click', () => {
  state = 'flight';
  resetFlight();
  for (const input of Object.values(inputs)) input.disabled = true;
  start.disabled = true;
  message('launch.authorized');
});

document.getElementById('reset').addEventListener('click', () => {
  state = 'ready';
  resetFlight();
  for (const input of Object.values(inputs)) input.disabled = false;
  start.disabled = false;
  message('launch.ready');
});

function advance(dt) {
  clock += dt;
  const power = +inputs.thrust.value / 100;
  const angle = +inputs.angle.value * Math.PI / 180;
  fuel = Math.max(0, fuel - dt * (.65 + power * .65));
  const acceleration = power * 24 * (fuel > 0 ? 1 : 0) * Math.cos(angle) - 9.81;
  speed = Math.max(-80, speed + acceleration * dt);
  altitude = Math.max(0, altitude + speed * dt * .12);
  x += Math.sin(angle) * speed * dt * .08;

  if (Math.abs(x - 320) > 210) {
    state = 'failed';
    message('launch.offCourse');
  } else if (altitude >= 100) {
    state = 'won';
    message('launch.success');
  } else if ((altitude === 0 && clock > 4 && speed <= 0) || (fuel === 0 && speed <= 0)) {
    state = 'failed';
    message('launch.failure');
  }
}

function frame(time) {
  const dt = Math.min((time - last) / 1000 || 0, .05);
  last = time;
  if (state === 'flight') advance(dt);

  ctx.fillStyle = altitude > 45 ? '#06101e' : '#153753';
  ctx.fillRect(0, 0, 640, 560);
  ctx.fillStyle = '#eaf7ff';
  for (const star of stars) ctx.fillRect(star.x, star.y, 2, 2);
  ctx.fillStyle = '#647681';
  ctx.fillRect(0, 540 + altitude * 4, 640, 30);

  ctx.save();
  ctx.translate(x, Math.max(90, 470 - altitude * 3.4));
  ctx.rotate(+inputs.angle.value * Math.PI / 180);
  ctx.fillStyle = '#edf2f5';
  ctx.fillRect(-12, -46, 24, 76);
  ctx.fillStyle = '#e66b4c';
  ctx.beginPath();
  ctx.moveTo(-12, -46);
  ctx.lineTo(0, -70);
  ctx.lineTo(12, -46);
  ctx.fill();
  ctx.fillRect(-25, 12, 13, 22);
  ctx.fillRect(12, 12, 13, 22);
  ctx.fillStyle = '#62c7e6';
  ctx.fillRect(-7, -27, 14, 14);
  if (state === 'flight' && fuel > 0) {
    ctx.fillStyle = '#ffc66b';
    ctx.fillRect(-8, 30, 16, 20 + Math.random() * 24);
  }
  ctx.restore();

  const reading = { altitude: formatNumber(altitude, 1), speed: formatNumber(speed, 1), fuel: formatNumber(fuel) };
  ctx.fillStyle = '#e8f6ff';
  ctx.font = '17px monospace';
  ctx.fillText(t('launch.canvasTitle'), 18, 30);
  ctx.fillText(t('launch.altitude', reading), 18, 58);
  ctx.fillText(t('launch.fuel', { fuel: formatNumber(fuel, 1) }), 18, 83);
  const nextTelemetry = t('launch.telemetry', reading);
  if (telemetry.textContent !== nextTelemetry) telemetry.textContent = nextTelemetry;
  requestAnimationFrame(frame);
}

message(messageKey);
requestAnimationFrame(frame);
