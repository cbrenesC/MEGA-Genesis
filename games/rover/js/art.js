// Pixel art generado por código (sin imágenes externas). Lo usan tanto la vista previa del constructor
// (canvas 2D normal) como las texturas de Phaser, así el rover de la previsualización es el mismo del terreno.
import { CRATERS, ROCKS, WORLD, PHOTO_DEFS, START } from './rules.js';

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

// ---------- Terreno lunar ----------
// Se calcula un campo de "brillo" a 1/4 de resolución (luz desde arriba a la izquierda), se cuantiza a una rampa de
// 9 grises azulados con tramado ordenado y se amplía sin suavizado: aspecto pixel art con relieve real.
const RAMP = ['#161c27', '#1e2633', '#283241', '#343f50', '#415065', '#505f76', '#62738b', '#778aa2', '#92a5bb', '#b4c3d4'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const clampf = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

function makeNoise(seed) {
  const r = prng(seed), N = 256, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  const at = (x, y) => tab[((y & 255) << 8) | (x & 255)];
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
  return (x, y, oct = 4) => { let v = 0, amp = .5, f = 1, tot = 0; for (let o = 0; o < oct; o++) { v += vn(x * f, y * f) * amp; tot += amp; amp *= .5; f *= 2; } return v / tot; };
}

// Cráter con paredes iluminadas, reborde, manto de eyecciones y (opcional) pico central y rayos.
function stampCrater(L, gw, gh, cx, cy, r, noise, rnd, opts = {}) {
  const amp = opts.amp ?? 1, x0 = Math.max(0, Math.floor(cx - r * 2.6)), x1 = Math.min(gw - 1, Math.ceil(cx + r * 2.6));
  const y0 = Math.max(0, Math.floor(cy - r * 2.6)), y1 = Math.min(gh - 1, Math.ceil(cy + r * 2.6));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy) || .0001, d = dist / r, i = y * gw + x;
    const lit = (dx + dy) / (1.4142 * dist);             // +1 abajo-derecha
    const nz = noise(x * .35, y * .35, 2) - .5;
    if (d < 0.8) {                                       // suelo oscuro con sombra proyectada por el reborde
      const shade = clampf(((dx + dy) / (2 * r * .8)) + .5, 0, 1);
      const floor = .15 + shade * 1.5 + nz * .9;
      L[i] = L[i] + (floor - L[i]) * clampf(amp * 1.4, 0, 1);
      if (opts.peak && d < .17) L[i] = 3.2 + (-lit) * 1.1 + nz;
      else if (opts.peak && d < .26) L[i] = Math.max(L[i], 1.4 + lit * .5);
    } else if (d < 1.0) {                                // pared interior: la cara hacia la luz (abajo-derecha) se ilumina
      const w = (d - .8) / .2;
      const wall = 1.1 + w * (1.8 + 2.2 * lit);
      L[i] = L[i] + (wall - L[i]) * clampf(amp * 1.2, 0, 1) * (opts.terraces && ((d * 40) | 0) % 5 === 0 ? .6 : 1);
    } else if (d < 1.2) {                                // cresta del reborde
      const c = 1 - (d - 1) / .2, up = Math.max(0, -lit);
      L[i] += amp * c * (1.4 + 2.6 * up - .9 * Math.max(0, lit));
    } else if (d < 1.8) {                                // talud exterior + manto de eyecciones
      const f = 1 - (d - 1.2) / .6, up = -lit;
      L[i] += amp * f * (.55 + .9 * up + nz * 1.2);
    } else if (d < 2.6 && opts.ejecta) {
      L[i] += amp * (1 - (d - 1.8) / .8) * (nz * 1.6);
    }
  }
  if (opts.rays) { // rayos de material claro (puntos para conservar el aspecto pixelado)
    for (let k = 0; k < 22; k++) {
      const a = rnd() * 6.2832, len = r * (1.8 + rnd() * 2.2), w = 1 + (rnd() > .7 ? 1 : 0);
      for (let t = r * 1.25; t < len; t += 1) { if (rnd() < .22) continue;
        const px = Math.round(cx + Math.cos(a) * t), py = Math.round(cy + Math.sin(a) * t);
        for (let o = 0; o < w; o++) { const xx = px + o, yy = py; if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) L[yy * gw + xx] += .8 * (1 - t / len) + .15; } }
    }
  }
}
function stampRock(L, gw, gh, cx, cy, r) {
  for (let y = Math.floor(cy - r * 2); y <= Math.ceil(cy + r * 2.4); y++) for (let x = Math.floor(cx - r * 2); x <= Math.ceil(cx + r * 2.4); x++) {
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const i = y * gw + x, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / r;
    const sdx = x - (cx + r * .9), sdy = y - (cy + r * .9);                   // sombra proyectada hacia abajo-derecha
    if (Math.hypot(sdx, sdy) / (r * 1.05) < 1 && d >= 1) L[i] = Math.min(L[i], 0.2);
    if (d < 1) { const lit = -(dx + dy) / (1.4142 * (Math.hypot(dx, dy) || 1)); L[i] = 4.6 + lit * 1.6 * Math.min(1, d + .2) - (d > .8 ? .8 : 0); }
  }
}

export function terrainCanvas() {
  const S = 4, gw = WORLD.w / S, gh = WORLD.h / S, rnd = prng(2024), noise = makeNoise(11);
  const L = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let n = noise(x / 46, y / 46, 4) * .62 + noise(x / 9, y / 9, 3) * .38;
    const mare = noise(x / 110 + 17, y / 110 + 5, 3);                  // «mares» extensos más oscuros
    let v = 3.3 + (n - .5) * 3.6 - Math.max(0, mare - .5) * 5.5;
    v += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) * .85;                // tramado ordenado
    L[y * gw + x] = v;
  }
  // Zona de aterrizaje chamuscada por el motor de descenso (radial)
  const sx = START.x / S, sy = START.y / S;
  for (let y = Math.floor(sy - 22); y <= sy + 22; y++) for (let x = Math.floor(sx - 22); x <= sx + 22; x++) {
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy) / 20; if (d > 1) continue;
    const a = Math.atan2(dy, dx), streak = .6 + .4 * Math.sin(a * 11 + noise(x * .2, y * .2, 1) * 6);
    L[y * gw + x] -= (1 - d) * (1.6 + streak * .9);
  }
  // Cráteres pequeños decorativos (sin colisión)
  for (let i = 0; i < 150; i++) {
    const x = rnd() * gw, y = rnd() * gh, r = 1.4 + Math.pow(rnd(), 2.2) * 5.5;
    if (CRATERS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S * 1.4 + r) || ROCKS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S + r)) continue;
    stampCrater(L, gw, gh, x, y, r, noise, rnd, { amp: .8 });
  }
  for (const c of CRATERS) stampCrater(L, gw, gh, c.x / S, c.y / S, c.r / S, noise, rnd, { rays: true, ejecta: true, peak: c.r >= 80, terraces: c.r >= 90 });
  for (const k of ROCKS) stampRock(L, gw, gh, k.x / S, k.y / S, k.r / S);
  for (let i = 0; i < 70; i++) { const x = rnd() * gw, y = rnd() * gh; if (!CRATERS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S * 1.3)) stampRock(L, gw, gh, x, y, .8 + rnd() * 1.4); } // guijarros
  // Marco rocoso y viñeta del límite del terreno
  for (let i = 0; i < 220; i++) { const e = rnd(), x = e < .5 ? rnd() * gw : (rnd() > .5 ? rnd() * 5 : gw - rnd() * 5), y = e < .5 ? (rnd() > .5 ? rnd() * 5 : gh - rnd() * 5) : rnd() * gh; stampRock(L, gw, gh, x, y, 1.2 + rnd() * 3); }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const e = Math.min(x, y, gw - 1 - x, gh - 1 - y); if (e < 14) L[y * gw + x] -= Math.pow(1 - e / 14, 2) * 3.4; }

  const small = document.createElement('canvas'); small.width = gw; small.height = gh;
  const g = small.getContext('2d'), img = g.createImageData(gw, gh);
  for (let i = 0; i < L.length; i++) {
    const c = RAMP[clampf(Math.round(L[i]), 0, RAMP.length - 1)]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Destellos de polvo brillante
  for (let i = 0; i < 160; i++) { g.fillStyle = rnd() > .5 ? '#a9bbd0' : '#6f8199'; g.fillRect(rnd() * gw | 0, rnd() * gh | 0, 1, 1); }
  for (const p of PHOTO_DEFS) paintLandmark(g, p, S);
  const big = document.createElement('canvas'); big.width = WORLD.w; big.height = WORLD.h;
  const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(small, 0, 0, WORLD.w, WORLD.h);
  return big;
}

// Puntos de interés dibujados directamente en la rejilla del terreno.
function paintLandmark(g, p, S) {
  const cx = Math.round(p.x / S), cy = Math.round(p.y / S), R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(cx + x, cy + y, w, h); };
  if (p.kind === 'lander') {
    R(-6, -6, 17, 17, 'rgba(8,12,20,.45)');                                 // sombra
    for (const [lx, ly] of [[-9, -9], [7, -9], [-9, 7], [7, 7]]) { R(lx + (lx < 0 ? 3 : -1), ly + (ly < 0 ? 3 : -1), 6, 1, '#7f8ea2'); R(lx, ly, 3, 3, '#cfd8e3'); R(lx, ly, 3, 1, '#ffffff'); }
    R(-11, -2, 5, 5, '#2f6bff'); R(-11, -2, 5, 1, '#6fa0ff'); R(-9, -2, 1, 5, '#173d8f'); R(7, -2, 5, 5, '#2f6bff'); R(7, -2, 5, 1, '#6fa0ff'); R(9, -2, 1, 5, '#173d8f'); // paneles
    R(-6, -6, 12, 12, '#8c6a22'); R(-5, -5, 10, 10, '#d9a441'); R(-5, -5, 10, 2, '#f3cf74'); R(-5, -5, 2, 10, '#eec35f'); R(-1, -1, 3, 3, '#2b3340'); R(0, 0, 1, 1, '#6ce2cf');
  } else if (p.kind === 'flag') {
    R(1, 1, 8, 2, 'rgba(8,12,20,.4)'); R(0, -9, 1, 10, '#e9eef5'); R(1, -9, 7, 5, '#6ce2cf'); R(1, -9, 7, 1, '#b8fff4'); R(2, -7, 3, 1, '#062a28'); R(2, -6, 5, 1, '#1f8f84');
    for (let i = 0; i < 6; i++) R(-6 + i * 2, 4 + (i % 2), 1, 1, 'rgba(8,12,20,.5)'); // huellas
  } else if (p.kind === 'monolith') {
    R(1, 1, 9, 8, 'rgba(8,12,20,.5)'); R(3, 5, 7, 6, 'rgba(8,12,20,.35)');
    R(-3, -5, 6, 10, '#161b25'); R(-3, -5, 2, 10, '#59667b'); R(-1, -5, 1, 10, '#2c3545'); R(-3, -5, 6, 1, '#8798b0');
  } else if (p.kind === 'rim') {
    for (const [ox, oy] of [[-4, 0], [4, 0]]) { R(ox, oy - 6, 1, 7, '#e9eef5'); R(ox - 1, oy - 7, 3, 2, '#ffd166'); R(ox, oy + 1, 3, 1, 'rgba(8,12,20,.5)'); }
    R(-1, 1, 3, 2, '#7d8da3'); R(-2, 2, 5, 1, '#5d6b7f');
  }
}

// Cristal de muestra 10x10 a escala `px`; el color cambia por muestra y tiene facetas, brillo y base con sombra.
export function sampleCanvas(px = 3, tint = '#6ce2cf') {
  const c = document.createElement('canvas'); c.width = 10 * px; c.height = 12 * px;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const map = ['....ww....', '...wTTd...', '..wTTTTd..', '.wTTLTTTd.', '.TTLTTTTdd', '.TTTTTTddd', '..TTTTddd.', '...TTddd..', '....dd....', '..ssssss..'];
  const col = { w: '#ffffff', T: tint, L: '#ffffffaa', d: shade(tint, .62), s: 'rgba(5,10,18,.45)' };
  map.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) { g.fillStyle = col[ch]; g.fillRect(x * px, y * px + px, px, px); } }));
  return c;
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); return `rgb(${Math.round((n >> 16 & 255) * k)},${Math.round((n >> 8 & 255) * k)},${Math.round((n & 255) * k)})`; }

// Marcador de punto de interés: cuatro esquinas de visor fotográfico con punto central.
export function poiCanvas(px = 3) {
  const c = document.createElement('canvas'); c.width = 16 * px; c.height = 16 * px;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const R = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * px, y * px, w * px, h * px); };
  for (const [ox, oy, sx, sy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]]) {
    const hx = sx > 0 ? ox : ox - 4, vy = sy > 0 ? oy : oy - 1;
    R(hx, vy, 5, 1, '#ffd166'); R(ox - (sx < 0 ? 0 : 0), sy > 0 ? oy : oy - 4, 1, 5, '#ffd166');
  }
  R(7, 7, 2, 2, '#ffffff'); R(6, 7, 1, 2, '#ffd166'); R(9, 7, 1, 2, '#ffd166');
  return c;
}

// Planeta Tierra en pixel art (océanos, continentes, nubes, terminador y halo).
export function earthCanvas(size = 64) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d'), noise = makeNoise(5), r = size / 2 - 1;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - r - 1) / r, dy = (y - r - 1) / r, d = Math.hypot(dx, dy), i = (y * size + x) * 4;
    if (d > 1) continue;
    const nx = dx, ny = dy, nz = Math.sqrt(1 - d * d);
    const land = noise(nx * 2.4 + 3, ny * 2.4 + 1, 4) > .54, cloud = noise(nx * 4 + 9, ny * 4 + 2, 3) > .62;
    let col = land ? [66, 140, 84] : [28, 82, 170];
    if (land && noise(nx * 5, ny * 5, 2) > .6) col = [150, 135, 90];
    if (cloud) col = [226, 236, 246];
    const light = clampf(-(nx * .6 + ny * .5) * .9 + nz * .55 + .1, .08, 1.15);
    const q = Math.round(light * 5) / 5;                                    // sombreado en bandas (pixel art)
    img.data[i] = Math.min(255, col[0] * q); img.data[i + 1] = Math.min(255, col[1] * q); img.data[i + 2] = Math.min(255, col[2] * q); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Cielo para briefing/construcción/resultados: estrellas por capas, Vía Láctea tramada, Tierra y horizonte lunar con módulo.
export function skyCanvas(w, h) {
  const S = 3, gw = Math.ceil(w / S), gh = Math.ceil(h / S), rnd = prng(77), noise = makeNoise(31);
  const small = document.createElement('canvas'); small.width = gw; small.height = gh;
  const g = small.getContext('2d'), img = g.createImageData(gw, gh);
  const top = [3, 8, 18], bot = [11, 36, 74];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const t = y / gh, i = (y * gw + x) * 4;
    const band = Math.max(0, 1 - Math.abs((x / gw * .6 + y / gh * .8) - .62) * 5.2);             // banda diagonal de la Vía Láctea
    const mw = band * noise(x / 14, y / 14, 4) * (BAYER[(y & 3) * 4 + (x & 3)] / 16 + .25);
    for (let k = 0; k < 3; k++) img.data[i + k] = top[k] + (bot[k] - top[k]) * t * t + mw * [70, 62, 96][k];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < gw * gh / 160; i++) {                                                          // estrellas
    const x = rnd() * gw | 0, y = rnd() * gh * .8 | 0, k = rnd(); g.fillStyle = k > .93 ? '#ffd166' : k > .8 ? '#6ce2cf' : k > .4 ? '#eaf4ff' : '#7f93b2'; g.fillRect(x, y, 1, 1);
    if (k > .965) { g.fillStyle = 'rgba(234,244,255,.45)'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  // Tierra con halo
  const es = Math.round(Math.min(gw, gh) * .2), ex = Math.round(gw * .8), ey = Math.round(gh * .22);
  for (let k = 5; k >= 1; k--) { g.fillStyle = `rgba(80,160,255,${.035 * (6 - k)})`; g.beginPath(); g.arc(ex, ey, es / 2 + k * 3, 0, 6.2832); g.fill(); }
  g.drawImage(earthCanvas(es), ex - es / 2, ey - es / 2);
  // Horizonte lunar
  const hy = Math.round(gh * .8), R = Math.max(gw, gh) * 1.4;
  g.save(); g.beginPath(); g.arc(gw / 2, hy + R, R, 0, 6.2832); g.clip();
  g.fillStyle = '#4b5a70'; g.fillRect(0, hy - 2, gw, gh);
  for (let y = hy; y < gh; y++) for (let x = 0; x < gw; x++) { const n = noise(x / 12, y / 5, 3) + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) * .35; g.fillStyle = n > .62 ? '#5d6e85' : n > .45 ? '#46556b' : '#34415a'; g.fillRect(x, y, 1, 1); }
  for (let i = 0; i < 26; i++) { const cx = rnd() * gw, cy = hy + 4 + rnd() * (gh - hy), cr = 2 + rnd() * 9; g.fillStyle = '#222c3c'; g.beginPath(); g.ellipse(cx, cy, cr, cr * .32, 0, 0, 6.2832); g.fill(); g.fillStyle = '#7c8ea6'; g.fillRect(cx - cr, cy - 1, cr * .6, 1); }
  g.restore();
  g.fillStyle = '#9fb2cc'; g.fillRect(0, hy - 2, gw, 1);                                              // línea de luz del horizonte
  const lx = Math.round(gw * .22), ly = hy + 3;                                                       // módulo y bandera en silueta
  g.fillStyle = '#c9d4e2'; g.fillRect(lx - 5, ly - 6, 10, 5); g.fillStyle = '#8c6a22'; g.fillRect(lx - 4, ly - 5, 8, 1); g.fillStyle = '#7f8ea2'; g.fillRect(lx - 7, ly - 1, 14, 1); g.fillRect(lx - 6, ly - 2, 1, 2); g.fillRect(lx + 5, ly - 2, 1, 2);
  g.fillStyle = '#e9eef5'; g.fillRect(lx + 12, ly - 10, 1, 10); g.fillStyle = '#6ce2cf'; g.fillRect(lx + 13, ly - 10, 5, 3);
  const big = document.createElement('canvas'); big.width = gw * S; big.height = gh * S;
  const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(small, 0, 0, big.width, big.height);
  return big;
}
