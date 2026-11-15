// Pixel art generado por código (sin imágenes externas). Lo usan tanto la vista previa del constructor
// (canvas 2D normal) como las texturas de Phaser, así el rover de la previsualización es el mismo del terreno.
import { CRATERS, ROCKS, WORLD } from './rules.js';

export const ROVER_GRID = { w: 34, h: 26 };

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Dibuja el rover según la configuración elegida (solo lo elegido; lo que falta se ve como hueco punteado).
export function drawRover(ctx, build, px = 4) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * px, y * px, w * px, h * px); };
  ctx.imageSmoothingEnabled = false;
  const ch = build && build.chassis, wh = build && build.wheels, ba = build && build.battery, so = build && build.solar;
  const ins = build && build.instrument, ca = build && build.camera, co = build && build.comms;
  // Chasis
  if (ch === 'ligero') { R(7, 11, 20, 5, '#d5dde8'); R(7, 11, 20, 1, '#f1f5fa'); R(7, 15, 20, 1, '#9aa7b8'); }
  else if (ch === 'estandar') { R(6, 10, 22, 6, '#b3bfce'); R(6, 10, 22, 1, '#dbe3ee'); R(6, 15, 22, 1, '#7f8ea2'); R(9, 12, 2, 2, '#7f8ea2'); }
  else if (ch === 'reforzado') { R(5, 9, 24, 8, '#8d9fb5'); R(5, 9, 24, 1, '#bcc9d9'); R(5, 16, 24, 1, '#5d6f86'); for (let i = 0; i < 5; i++) R(7 + i * 5, 11, 2, 4, '#5d6f86'); }
  else { ctx.strokeStyle = '#4a6a82'; ctx.setLineDash([px, px]); ctx.strokeRect(6 * px, 10 * px, 22 * px, 6 * px); ctx.setLineDash([]); }
  // Batería: celdas menta dentro del chasis (3 / 4 / 6)
  if (ba) { const n = ba === 'pequena' ? 3 : ba === 'media' ? 4 : 6; for (let i = 0; i < n; i++) R(12 + i * 2.5, 12, 2, 2, '#6ce2cf'); }
  // Ruedas
  const wy = ch === 'reforzado' ? 17 : 16;
  const wheel = (cx) => {
    if (wh === 'ligeras') { R(cx - 2, wy, 4, 4, '#1b2330'); R(cx - 1, wy + 1, 2, 2, '#56657a'); }
    else if (wh === 'todoterreno') { R(cx - 3, wy - 1, 6, 6, '#141b26'); R(cx - 2, wy, 4, 4, '#56657a'); R(cx - 3, wy - 1, 1, 1, '#9fb0c4'); R(cx + 2, wy - 1, 1, 1, '#9fb0c4'); R(cx - 3, wy + 4, 1, 1, '#9fb0c4'); R(cx + 2, wy + 4, 1, 1, '#9fb0c4'); }
    else if (wh === 'estandar') { R(cx - 2.5, wy - .5, 5, 5, '#1b2330'); R(cx - 1.5, wy + .5, 3, 3, '#56657a'); }
  };
  if (wh) { wheel(9); wheel(17); wheel(25); }
  else { ctx.strokeStyle = '#4a6a82'; ctx.setLineDash([px, px]); for (const cx of [9, 17, 25]) ctx.strokeRect((cx - 2) * px, 16 * px, 4 * px, 4 * px); ctx.setLineDash([]); }
  // Panel solar (sobre el chasis, inclinado como una repisa)
  if (so) {
    const w = so === 'basico' ? 8 : so === 'medio' ? 12 : 16, x0 = 17 - w / 2, y0 = 6;
    R(16.5, y0 + 2, 1, 3, '#7f8ea2');
    R(x0, y0, w, 2, '#2f6bff'); R(x0, y0, w, 1, '#6fa0ff');
    for (let i = 2; i < w; i += 3) R(x0 + i, y0, 1, 2, '#173d8f');
  }
  // Mástil y cámara (atrás)
  if (ca) { R(8, 4, 1, 6, '#7f8ea2'); const big = ca === 'hd'; R(big ? 6 : 7, big ? 2 : 3, big ? 5 : 3, big ? 3 : 2, '#2a3444'); R(big ? 9 : 9, big ? 3 : 3.5, 1, 1, '#6ce2cf'); }
  // Comunicaciones (antena)
  if (co) {
    if (co === 'baja') { R(27, 2, 1, 8, '#c9d4e2'); R(26, 2, 3, 1, '#ffd166'); }
    else if (co === 'media') { R(27, 5, 1, 5, '#7f8ea2'); R(25, 3, 5, 2, '#e6edf6'); R(26, 5, 3, 1, '#9aa7b8'); }
    else { R(27, 6, 1, 4, '#7f8ea2'); R(23, 2, 9, 3, '#e6edf6'); R(24, 5, 7, 1, '#9aa7b8'); R(27, 1, 1, 1, '#ff7b7b'); }
  }
  // Instrumento (brazo frontal)
  if (ins) {
    R(28, 12, 3, 1, '#7f8ea2');
    if (ins === 'espectrometro') { R(30, 11, 3, 3, '#2a3444'); R(32, 12, 1, 1, '#6ce2cf'); }
    else if (ins === 'taladro') { R(30, 10, 2, 5, '#2a3444'); R(30.5, 15, 1, 3, '#cfd8e3'); R(31, 18, 0.01, 0.01, '#cfd8e3'); }
    else { R(30, 11, 3, 3, '#2a3444'); R(32, 12, 2, 1, '#ff7b7b'); }
  }
}

export function roverCanvas(build, px = 4) {
  const c = document.createElement('canvas'); c.width = ROVER_GRID.w * px; c.height = ROVER_GRID.h * px;
  drawRover(c.getContext('2d'), build, px); return c;
}

// Terreno lunar en pixel art: se pinta a 1/4 de resolución y se amplía sin suavizado.
export function terrainCanvas() {
  const S = 4, gw = WORLD.w / S, gh = WORLD.h / S, rnd = prng(2024);
  const small = document.createElement('canvas'); small.width = gw; small.height = gh;
  const g = small.getContext('2d');
  g.fillStyle = '#3d4756'; g.fillRect(0, 0, gw, gh);
  for (let i = 0; i < gw * gh * 0.09; i++) { const x = rnd() * gw | 0, y = rnd() * gh | 0; g.fillStyle = rnd() > .5 ? '#465162' : '#343e4c'; g.fillRect(x, y, 1 + (rnd() * 2 | 0), 1); }
  for (let i = 0; i < 140; i++) { const x = rnd() * gw | 0, y = rnd() * gh | 0; g.fillStyle = '#566377'; g.fillRect(x, y, 1, 1); }
  const disc = (cx, cy, r, color) => { g.fillStyle = color; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } };
  for (const c of CRATERS) {
    const cx = c.x / S, cy = c.y / S, r = c.r / S;
    disc(cx + 2, cy + 2, r + 2, '#2b3340');   // sombra del borde
    disc(cx, cy, r + 1, '#7a889b');           // reborde claro
    disc(cx, cy, r - 1, '#18202c');           // fondo oscuro
    disc(cx + 1, cy + 1, r * .55, '#10161f');
    for (let i = 0; i < 10; i++) { const a = rnd() * 6.28, d = (r + 2) * (0.8 + rnd() * .3); g.fillStyle = '#93a0b2'; g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 1, 1); }
  }
  for (const k of ROCKS) { const cx = k.x / S, cy = k.y / S, r = k.r / S; disc(cx + 1, cy + 1, r, '#232b37'); disc(cx, cy, r, '#6d7a8c'); disc(cx - 1, cy - 1, Math.max(1, r * .45), '#9aa7b8'); }
  // Viñeta del borde (límite del terreno)
  g.fillStyle = 'rgba(5,11,22,.55)'; g.fillRect(0, 0, gw, 3); g.fillRect(0, gh - 3, gw, 3); g.fillRect(0, 0, 3, gh); g.fillRect(gw - 3, 0, 3, gh);
  const big = document.createElement('canvas'); big.width = WORLD.w; big.height = WORLD.h;
  const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(small, 0, 0, WORLD.w, WORLD.h);
  return big;
}

// Cristal de muestra 8x8 a escala `px`; el color cambia por muestra para distinguirlas.
export function sampleCanvas(px = 3, tint = '#6ce2cf') {
  const c = document.createElement('canvas'); c.width = 8 * px; c.height = 8 * px;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const map = ['...ww...', '..wTT...', '.wTTTT..', 'wTTTTTd.', 'TTTTTTdd', '.TTTTdd.', '..TTdd..', '...dd...'];
  const col = { w: '#ffffff', T: tint, d: '#1f8f84' };
  map.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x * px, y * px, px, px); } }));
  return c;
}
