// Pixel art generado por código (sin imágenes externas). Lo usan tanto la vista previa del constructor
// (canvas 2D normal) como las texturas de Phaser, así el rover de la previsualización es el mismo del terreno.
import { CRATERS, ROCKS, WORLD, PHOTO_DEFS, START } from './rules.js';
import { globeSample, CLOUD } from '../../launch/js/scenes/earth.js'; // la misma Tierra (continentes reales) que el módulo de lanzamiento

export const ROVER_GRID = { w: 34, h: 26 };

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- El rover ----------
// Pixel art detallado sobre una rejilla de 68×52 (el doble de la rejilla lógica de 34×26): suspensión de balancín,
// ruedas con llanta y radios que giran, cuerpo con lámina dorada y paneles, panel solar con celdas, mástil con cámara
// estéreo, antena y brazo con el instrumento. Cada pieza elegida se ve distinta; lo que falta aparece como hueco punteado.
// Todo lleva contorno oscuro de 1 px y luz desde arriba-izquierda, como el resto del juego.
const HD = 2, GW = ROVER_GRID.w * HD, GH = ROVER_GRID.h * HD, GROUND = 50, INK = '#0b1424';
const METAL = ['#eef2f7', '#c9d3df', '#9aa7b8', '#6c7a8d', '#47546a'];
const FOIL = ['#f7df95', '#e3b552', '#c08f2f', '#8c6a22'];
const WHEEL_X = [13, 34, 55];

function roverGrid(build, frame = 0) {
  const cells = new Array(GW * GH).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < GW && y < GH) cells[y * GW + x] = c; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
  const line = (x0, y0, x1, y1, c, thick = 1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; for (let t = 0; t < thick; t++) set(x, y + t, c); } };
  const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * .6) set(cx + x, cy + y, c); };
  const noiseAt = (x, y) => ((Math.imul(x * 374761393 ^ y * 668265263, 1274126177) >>> 0) % 100) / 100;
  const b = build || {};
  const ch = b.chassis, wh = b.wheels, ba = b.battery, so = b.solar, ins = b.instrument, ca = b.camera, co = b.comms;
  const ghosts = [];

  // --- medidas del cuerpo según el chasis
  const body = ch === 'ligero' ? { x: 14, w: 40, top: 23, h: 9 } : ch === 'reforzado' ? { x: 10, w: 48, top: 19, h: 14 } : { x: 12, w: 44, top: 21, h: 11 };
  const deck = body.top; // y de la cubierta
  const wr = wh === 'todoterreno' ? 8 : wh === 'ligeras' ? 6 : 7;
  const wy = GROUND - wr;

  // --- suspensión de balancín (detrás de las ruedas)
  if (ch && wh) {
    const px = 34, py = body.top + body.h - 1;
    line(px - 12, py + 3, WHEEL_X[2], wy, METAL[3], 2); line(px - 12, py + 3, 23, py + 5, METAL[3], 2); // balancín principal
    line(23, py + 5, WHEEL_X[0], wy, METAL[4], 2); line(23, py + 5, WHEEL_X[1], wy, METAL[4], 2);       // bogie trasero
    disc(px - 12, py + 3, 1, METAL[1]); disc(23, py + 5, 1, METAL[1]);
  }

  // --- ruedas
  const wheel = (cx) => {
    const tire = '#161c26', tread = '#2f3947';
    disc(cx, wy, wr, tire);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * 6.2832 + frame * .2; if (k % 2 === 0) set(cx + Math.cos(a) * wr, wy + Math.sin(a) * wr, tread); }
    if (wh === 'todoterreno') for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.2832 + frame * .2; set(cx + Math.cos(a) * (wr + 1), wy + Math.sin(a) * (wr + 1), '#8fa0b5'); set(cx + Math.cos(a) * (wr - 1), wy + Math.sin(a) * (wr - 1), '#3b4656'); }
    const rim = wr - (wh === 'ligeras' ? 2 : 3);
    disc(cx, wy, rim, wh === 'ligeras' ? '#b9c5d3' : '#8fa0b5');
    disc(cx, wy, rim - 1, wh === 'ligeras' ? '#3a4352' : '#5a6779');   // las ligeras son de malla: se ve a través
    for (let k = 0; k < 3; k++) { const a = (k / 3) * 3.1416 + frame * .26; line(cx - Math.cos(a) * (rim - 1), wy - Math.sin(a) * (rim - 1), cx + Math.cos(a) * (rim - 1), wy + Math.sin(a) * (rim - 1), wh === 'ligeras' ? '#dfe6ee' : '#c9d3df'); }
    disc(cx, wy, 1, '#eef2f7'); set(cx, wy, '#ffd166');
    set(cx - Math.round(wr * .6), wy - Math.round(wr * .6), '#56657a');   // brillo de la luz
  };
  if (wh) WHEEL_X.forEach(wheel); else for (const cx of WHEEL_X) ghosts.push([cx - 6, GROUND - 13, 12, 12]);

  // --- cuerpo (chasis): paneles blancos arriba, lámina dorada aislante abajo
  if (ch) {
    const { x, w, top, h } = body, split = Math.ceil(h * .55);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const pos = i / (w - 1);
      if (j < split) set(x + i, top + j, j === 0 ? METAL[0] : pos > .9 ? METAL[2] : pos < .06 ? METAL[0] : METAL[1]);
      else { const n = noiseAt(x + i, top + j); set(x + i, top + j, j === h - 1 ? FOIL[3] : n > .8 ? FOIL[0] : n > .35 ? FOIL[1] : FOIL[2]); }
    }
    rect(x, top + split - 1, w, 1, METAL[3]);                                   // junta
    for (let i = 8; i < w - 4; i += 9) rect(x + i, top + 1, 1, split - 2, METAL[2]); // líneas de panel
    for (let i = 4; i < w - 2; i += 9) set(x + i, top + 2, METAL[3]);               // remaches
    rect(x + w - 2, top + 2, 2, 2, '#fff3a8'); set(x + w - 1, top + 2, '#ffffff'); // faro delantero
    rect(x, top + 2, 1, 2, '#ff5959');                                             // luz trasera
    rect(x + 3, top + 3, 3, 2, '#2f6bff'); set(x + 4, top + 3, '#6ce2cf');          // insignia de la misión
    if (ch === 'reforzado') { for (let i = 3; i < w - 2; i += 7) rect(x + i, top + split, 2, h - split - 1, FOIL[3]); rect(x - 2, top + h - 4, 2, 4, METAL[3]); rect(x + w, top + h - 4, 2, 4, METAL[3]); rect(x - 2, top + h - 4, 2, 1, METAL[1]); rect(x + w, top + h - 4, 2, 1, METAL[1]); } // costillas y parachoques
    if (ch === 'ligero') for (let i = 6; i < w - 6; i += 4) set(x + i, top + split + 1, FOIL[3]);                                   // aligeramientos
    rect(x + 6, top + h, w - 12, 1, METAL[4]);                                     // quilla
  } else ghosts.push([12, 21, 44, 11]);

  // --- batería: fila de celdas menta con su marco
  if (ba && ch) {
    const n = ba === 'pequena' ? 3 : ba === 'media' ? 4 : 6, bx = body.x + body.w - 8 - n * 3, by = body.top + Math.ceil(body.h * .55) - 4;
    rect(bx - 1, by - 1, n * 3 + 1, 4, METAL[4]);
    for (let i = 0; i < n; i++) { rect(bx + i * 3, by, 2, 2, '#6ce2cf'); set(bx + i * 3, by, '#c8fff5'); }
  }

  // --- panel solar: plano inclinado con celdas, marco y soporte
  if (so) {
    const w = so === 'basico' ? 18 : so === 'medio' ? 26 : 34, x0 = 34 - Math.round(w / 2), y0 = deck - 9;
    line(34, deck - 1, 34, y0 + 5, METAL[3], 1); line(33, deck - 1, 29, y0 + 6, METAL[4], 1); line(35, deck - 1, 39, y0 + 5, METAL[4], 1);
    for (let i = 0; i < w; i++) {
      const y = y0 + 4 - Math.round(i * .16);                                      // inclinado hacia el Sol
      const edge = i === 0 || i === w - 1, div = i % 4 === 0;
      set(x0 + i, y - 3, edge ? METAL[0] : '#b9d6ff');                              // canto iluminado
      set(x0 + i, y - 2, edge ? METAL[1] : div ? '#173d8f' : (i % 8 < 4 ? '#4f8bff' : '#3f7dff'));
      set(x0 + i, y - 1, edge ? METAL[1] : div ? '#173d8f' : (i % 8 < 4 ? '#3f7dff' : '#2f6bff'));
      set(x0 + i, y, edge ? METAL[1] : '#173d8f');                                  // fila divisoria de celdas
      set(x0 + i, y + 1, edge ? METAL[1] : div ? '#173d8f' : '#2459d6');
      set(x0 + i, y + 2, METAL[2]);                                                 // marco inferior
    }
    set(x0 + 2, y0 + 2, '#ffffff'); set(x0 + 3, y0 + 2, '#dbeaff'); set(x0 + 2, y0 + 3, '#dbeaff'); // destello del Sol
  }

  // --- mástil con cámara (atrás)
  if (ca) {
    const mx = (ch ? body.x : 12) + 6, hd = ca === 'hd';
    line(mx, deck - 1, mx, hd ? 5 : 8, METAL[2], 1); set(mx + 1, deck - 2, METAL[3]); set(mx - 1, deck - 2, METAL[3]);
    if (hd) { rect(mx - 4, 1, 10, 5, '#232c3a'); rect(mx - 4, 1, 10, 1, '#56657a'); rect(mx - 3, 3, 2, 2, '#6ce2cf'); set(mx - 3, 3, '#e6fffb'); rect(mx + 2, 3, 2, 2, '#6ce2cf'); set(mx + 2, 3, '#e6fffb'); rect(mx - 1, 2, 2, 1, FOIL[1]); set(mx + 5, 2, '#ff5959'); }
    else { rect(mx - 2, 5, 6, 4, '#2a3444'); rect(mx - 2, 5, 6, 1, '#56657a'); rect(mx + 1, 6, 2, 2, '#6ce2cf'); set(mx + 1, 6, '#e6fffb'); }
  }

  // --- comunicaciones (delante): varilla, plato pequeño o plato grande orientable
  if (co) {
    const ax = (ch ? body.x + body.w : 56) - 7;
    if (co === 'baja') { line(ax, deck - 1, ax, 6, METAL[1], 1); rect(ax - 1, 5, 3, 1, '#ffd166'); set(ax, 4, '#ff5959'); set(ax + 1, 12, METAL[3]); set(ax - 1, 16, METAL[3]); }
    else {
      const r = co === 'alta' ? 8 : 5, cy = co === 'alta' ? 9 : 12;
      line(ax, deck - 1, ax, cy + 2, METAL[3], 1); disc(ax, cy + 2, 1, METAL[2]);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y), side = -x * .55 + y * .84; if (d <= r + .4 && d >= r - 2.2 && side > -.5) set(ax + x, cy + y, d > r - 1 ? METAL[2] : METAL[0]); }  // cuenco abierto hacia arriba-derecha
      line(ax, cy + 1, ax + Math.round(r * .55), cy - Math.round(r * .8), METAL[3], 1);                                       // soporte del receptor
      set(ax + Math.round(r * .55), cy - Math.round(r * .8), co === 'alta' ? '#ff5959' : '#ffd166');
      if (co === 'alta') { set(ax + Math.round(r * .55) + 1, cy - Math.round(r * .8), '#ffb3b3'); rect(ax - 1, cy + 3, 3, 1, FOIL[1]); }
    }
  }

  // --- brazo con el instrumento (delante)
  if (ins) {
    const sx = (ch ? body.x + body.w : 56) - 1, sy = (ch ? body.top : 21) + 5;
    line(sx, sy, sx + 5, sy - 4, METAL[2], 2); disc(sx, sy, 1, METAL[0]);            // hombro y primer tramo
    disc(sx + 5, sy - 4, 1, METAL[0]);                                                // codo
    line(sx + 5, sy - 4, sx + 9, sy + 1, METAL[3], 2);
    const tx = sx + 9, ty = sy + 1;
    if (ins === 'espectrometro') { rect(tx - 2, ty, 6, 5, '#2a3444'); rect(tx - 2, ty, 6, 1, '#56657a'); rect(tx, ty + 2, 2, 2, '#6ce2cf'); set(tx, ty + 2, '#e6fffb'); set(tx + 3, ty + 4, FOIL[1]); }
    else if (ins === 'taladro') { rect(tx - 2, ty - 1, 5, 5, '#2a3444'); rect(tx - 2, ty - 1, 5, 1, '#56657a'); set(tx + 2, ty, '#ffd166'); for (let k = 0; k < 9; k++) { set(tx, ty + 4 + k, k % 2 ? METAL[1] : METAL[3]); set(tx + (k % 2 ? 1 : -1), ty + 4 + k, METAL[2]); } set(tx, ty + 13, METAL[0]); }
    else { rect(tx - 2, ty, 6, 4, '#2a3444'); rect(tx - 2, ty, 6, 1, '#56657a'); rect(tx + 4, ty + 1, 2, 2, '#ff5959'); set(tx + 5, ty + 1, '#ffd3d3'); for (let k = 0; k < 4; k++) set(tx + 6 + k, ty + 3 + k * 2, k % 2 ? '#ff7b7b' : '#ffb3b3'); }
  }
  return { cells, ghosts };
}

// Dibuja el rover según la configuración elegida. `px` = tamaño de un píxel de la rejilla lógica de 34×26
// (el dibujo usa el doble de resolución); `frame` gira las ruedas.
export function drawRover(ctx, build, px = 4, frame = 0) {
  const u = px / HD, { cells, ghosts } = roverGrid(build, frame);
  ctx.imageSmoothingEnabled = false;
  const at = (x, y) => (x < 0 || y < 0 || x >= GW || y >= GH ? null : cells[y * GW + x]);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let c = at(x, y);
    if (!c && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) c = INK;   // contorno
    if (c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x * u), Math.round(y * u), Math.ceil(u), Math.ceil(u)); }
  }
  if (ghosts.length) { ctx.strokeStyle = '#4a6a82'; ctx.lineWidth = Math.max(1, u); ctx.setLineDash([u * 2, u * 2]); for (const [x, y, w, h] of ghosts) ctx.strokeRect(x * u, y * u, w * u, h * u); ctx.setLineDash([]); }
}

export function roverCanvas(build, px = 4, frame = 0) {
  const c = document.createElement('canvas'); c.width = ROVER_GRID.w * px; c.height = ROVER_GRID.h * px;
  drawRover(c.getContext('2d'), build, px, frame); return c;
}

// ---------- Terreno lunar ----------
// Se calcula un campo de "brillo" a 1/4 de resolución (luz desde arriba a la izquierda), se cuantiza a una rampa de
// 9 grises azulados con tramado ordenado y se amplía sin suavizado: aspecto pixel art con relieve real.
const RAMP = ['#161c27', '#1e2633', '#283241', '#343f50', '#415065', '#505f76', '#62738b', '#778aa2', '#92a5bb', '#b4c3d4'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const hexRamp = (list) => list.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
// Dos tipos de suelo, como en la Luna real: tierras altas claras (anortosita, gris cálido) y mares oscuros (basalto, gris azulado).
const RAMP_HIGH = hexRamp(['#15161b', '#202127', '#2d2e35', '#3d3e45', '#505157', '#66666b', '#7e7d80', '#989693', '#b5b2aa', '#d6d1c4']);
const RAMP_MARE = hexRamp(['#0e131c', '#151c28', '#1d2634', '#273242', '#323f52', '#3f4e63', '#4f5f76', '#63748c', '#7c8da5', '#9aabc0']);
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
      const floor = .9 + shade * 3.6 + nz * .9; // el borde proyecta sombra arriba-izquierda; el fondo se aclara hacia la luz
      L[i] = L[i] + (floor - L[i]) * clampf(amp * 1.4, 0, 1);
      if (opts.peak && d < .17) L[i] = 3.2 + (-lit) * 1.1 + nz;
      else if (opts.peak && d < .26) L[i] = Math.max(L[i], 1.4 + lit * .5);
    } else if (d < 1.0) {                                // pared interior: la cara hacia la luz (abajo-derecha) se ilumina
      const w = (d - .8) / .2;
      const wall = 1.8 + w * (2.4 + 3.0 * lit);
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
// Roca iluminada desde arriba-izquierda con sombra LARGA hacia abajo-derecha (Sol bajo, como cerca del polo lunar).
function stampRock(L, gw, gh, cx, cy, r, long = 2.4) {
  const reach = r * (1.2 + long);
  for (let y = Math.floor(cy - r * 2); y <= Math.ceil(cy + reach + r); y++) for (let x = Math.floor(cx - r * 2); x <= Math.ceil(cx + reach + r); x++) {
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const i = y * gw + x, dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / r;
    if (d < 1) { const lit = -(dx + dy) / (1.4142 * (Math.hypot(dx, dy) || 1)); L[i] = 6.4 + lit * 2.6 * Math.min(1, d + .2) - (d > .8 ? 1.2 : 0); continue; }
    // sombra: a lo largo de la diagonal, se afina y se aclara con la distancia
    const along = (dx + dy) / 1.4142, across = Math.abs(dx - dy) / 1.4142;
    if (along > 0 && along < reach && across < r * (1 - along / (reach * 1.15))) L[i] = Math.min(L[i], 1.3 + 2.2 * (along / reach) ** 1.5);
  }
}
// Macizo montañoso del borde del terreno: cara iluminada, cara en sombra y cresta.
function stampPeak(L, gw, gh, cx, cy, r, noise) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r * 2.2); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r * 2.2); x++) {
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const i = y * gw + x, dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy) || .001, d = dist / r;
    if (d < 1) {
      const h = 1 - d, lit = -(dx + dy) / (1.4142 * dist), nz = noise(x * .5, y * .5, 2) - .5;
      L[i] = 4.6 + lit * (1.6 + 2.6 * h) + h * 1.4 + nz * 1.6 + (Math.abs(dx - dy) < .8 ? 1 : 0);
    } else { const along = (dx + dy) / 1.4142, across = Math.abs(dx - dy) / 1.4142; if (along > 0 && along < r * 2 && across < r * (1 - along / (r * 2.3))) L[i] = Math.min(L[i], .4 + 1.2 * (along / (r * 2))); }
  }
}

function prngAt(seed) { return prng(seed); }
/** Destellos de hielo de agua en el fondo siempre en sombra de los cráteres grandes (coordenadas del mundo). */
export function iceSpots() {
  const rnd = prngAt(909), out = [];
  for (const c of CRATERS) { if (c.r < 76) continue;
    for (let k = 0; k < 9; k++) { const a = 3.3 + rnd() * 1.9, d = c.r * (.12 + rnd() * .5); out.push({ x: Math.round(c.x + Math.cos(a) * d), y: Math.round(c.y + Math.sin(a) * d), big: rnd() > .7 }); } }
  return out;
}
// Grieta sinuosa (rima) al este del terreno: sólo decorativa.
const RILLE = [[1530, 30], [1562, 210], [1502, 390], [1556, 575], [1512, 760], [1560, 970]];

export function terrainCanvas() {
  const S = 4, gw = WORLD.w / S, gh = WORLD.h / S, rnd = prng(2024), noise = makeNoise(11);
  const L = new Float32Array(gw * gh), M = new Float32Array(gw * gh), Hh = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) Hh[y * gw + x] = noise(x / 46, y / 46, 4) * .7 + noise(x / 14, y / 14, 3) * .3;
  const hAt = (x, y) => Hh[clampf(y, 0, gh - 1) * gw + clampf(x, 0, gw - 1)];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const n = noise(x / 46, y / 46, 4) * .62 + noise(x / 9, y / 9, 3) * .38;
    const mare = noise(x / 110 + 17, y / 110 + 5, 3);                  // «mares» de basalto, extensos y más oscuros
    const m = clampf((mare - .46) * 7, 0, 1); M[y * gw + x] = m;
    let v = 4.7 + (n - .5) * 3.0 - m * 1.5;
    v += (hAt(x - 1, y - 1) - hAt(x + 1, y + 1)) * 15;                 // relieve: las laderas hacia la luz se aclaran
    v += (BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) * .85;                // tramado ordenado
    L[y * gw + x] = v;
  }
  // Crestas arrugadas de los mares (bandas claras y largas)
  for (let k = 0; k < 5; k++) { let x = rnd() * gw, y = rnd() * gh, a = rnd() * 6.28;
    for (let t = 0; t < 70; t++) { a += (rnd() - .5) * .5; x += Math.cos(a); y += Math.sin(a); const xi = x | 0, yi = y | 0; if (xi < 1 || yi < 1 || xi >= gw - 1 || yi >= gh - 1) break; if (M[yi * gw + xi] > .4) { L[yi * gw + xi] += 1; L[(yi + 1) * gw + xi + 1] -= .8; } } }
  // Zona de aterrizaje chamuscada por el motor de descenso (radial)
  const sx = START.x / S, sy = START.y / S;
  for (let y = Math.floor(sy - 22); y <= sy + 22; y++) for (let x = Math.floor(sx - 22); x <= sx + 22; x++) {
    if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
    const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy) / 20; if (d > 1) continue;
    const a = Math.atan2(dy, dx), streak = .6 + .4 * Math.sin(a * 11 + noise(x * .2, y * .2, 1) * 6);
    L[y * gw + x] -= (1 - d) * (1.6 + streak * .9);
  }
  // Rima: canal oscuro con la pared este iluminada
  for (let s0 = 0; s0 < RILLE.length - 1; s0++) { const [ax, ay] = RILLE[s0], [bx, by] = RILLE[s0 + 1];
    for (let t = 0; t <= 1; t += .004) { const u = t * t * (3 - 2 * t), x = Math.round((ax + (bx - ax) * u) / S + Math.sin((ay + (by - ay) * t) / 60) * 1.5), y = Math.round((ay + (by - ay) * t) / S);
      if (y < 0 || y >= gh) continue;
      for (const [o, dv] of [[-2, -.5], [-1, -1.9], [0, -2.6], [1, -1.6], [2, 1.5], [3, .7]]) { const xx = x + o; if (xx >= 0 && xx < gw) L[y * gw + xx] = dv < 0 ? Math.min(L[y * gw + xx], 3.4 + dv) : Math.max(L[y * gw + xx], 4.4 + dv); } } }
  // Cráteres pequeños decorativos (sin colisión)
  for (let i = 0; i < 240; i++) {
    const x = rnd() * gw, y = rnd() * gh, r = 1.2 + Math.pow(rnd(), 2.4) * 5.5;
    if (CRATERS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S * 1.4 + r) || ROCKS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S + r)) continue;
    stampCrater(L, gw, gh, x, y, r, noise, rnd, { amp: .8 });
  }
  for (const c of CRATERS) stampCrater(L, gw, gh, c.x / S, c.y / S, c.r / S, noise, rnd, { rays: true, ejecta: true, peak: c.r >= 80, terraces: c.r >= 90 });
  // Fondo de los cráteres grandes: sombra permanente (ahí se conserva el hielo)
  for (const c of CRATERS) { if (c.r < 76) continue; const cx = c.x / S, cy = c.y / S, r = c.r / S;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / r; if (d < .62 && dx + dy < -r * .12) L[y * gw + x] = Math.min(L[y * gw + x], .3 + d * 1.2); } }
  // Bloques expulsados alrededor de los cráteres grandes (decorativos, pequeños)
  for (const c of CRATERS) for (let k = 0; k < 16; k++) { const a = rnd() * 6.2832, d = (c.r / S) * (1.28 + rnd() * .7); stampRock(L, gw, gh, c.x / S + Math.cos(a) * d, c.y / S + Math.sin(a) * d, .7 + rnd() * .9, 2); }
  for (const k of ROCKS) stampRock(L, gw, gh, k.x / S, k.y / S, k.r / S, 2.6);
  for (let i = 0; i < 90; i++) { const x = rnd() * gw, y = rnd() * gh; if (!CRATERS.some((c) => Math.hypot(x - c.x / S, y - c.y / S) < c.r / S * 1.3)) stampRock(L, gw, gh, x, y, .7 + rnd() * 1.1, 1.5); } // guijarros
  // Cordillera del borde y viñeta del límite del terreno
  for (let i = 0; i < 64; i++) { const side = i % 4, t = rnd(), r = 3 + rnd() * 3.2;
    const x = side === 0 ? t * gw : side === 1 ? t * gw : side === 2 ? rnd() * 1.5 : gw - rnd() * 1.5, y = side === 0 ? rnd() * 1.5 : side === 1 ? gh - rnd() * 1.5 : t * gh;
    stampPeak(L, gw, gh, x, y, r, noise); }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const e = Math.min(x, y, gw - 1 - x, gh - 1 - y); if (e < 12) L[y * gw + x] -= Math.pow(1 - e / 12, 2) * 2.4; }

  const small = document.createElement('canvas'); small.width = gw; small.height = gh;
  const g = small.getContext('2d'), img = g.createImageData(gw, gh);
  for (let i = 0; i < L.length; i++) {
    const x = i % gw, y = (i / gw) | 0;
    const ramp = M[i] > BAYER[(y & 3) * 4 + (x & 3)] / 16 + .03 ? RAMP_MARE : RAMP_HIGH;   // el borde entre mar y tierras altas se trama
    const c = ramp[clampf(Math.round(L[i]), 0, ramp.length - 1)]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // Destellos de polvo brillante
  for (let i = 0; i < 200; i++) { g.fillStyle = rnd() > .5 ? '#c9c6bd' : '#7f8ea2'; g.fillRect(rnd() * gw | 0, rnd() * gh | 0, 1, 1); }
  // Hielo de agua en las sombras permanentes y un parche de suelo anaranjado (vidrio volcánico, como el que halló el Apolo 17)
  for (const sp of iceSpots()) { g.fillStyle = sp.big ? '#d6f1ff' : '#7fc4ee'; g.fillRect(Math.round(sp.x / S), Math.round(sp.y / S), 1, 1); if (sp.big) { g.fillStyle = '#5aa6d6'; g.fillRect(Math.round(sp.x / S) + 1, Math.round(sp.y / S), 1, 1); } }
  for (let k = 0; k < 14; k++) { g.fillStyle = k % 3 ? '#a8713c' : '#c98a4a'; g.fillRect(Math.round(1318 / S + (rnd() - .5) * 7), Math.round(884 / S + (rnd() - .5) * 4), 1, 1); }
  for (const p of PHOTO_DEFS) paintLandmark(g, p, S);
  const big = document.createElement('canvas'); big.width = WORLD.w; big.height = WORLD.h;
  const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(small, 0, 0, WORLD.w, WORLD.h);
  return big;
}

/** Luz del Sol bajo sobre todo el terreno: más clara arriba a la izquierda, penumbra abajo a la derecha (tramada). */
export function lightCanvas() {
  const S = 8, gw = WORLD.w / S, gh = WORLD.h / S;
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const g = c.getContext('2d'), img = g.createImageData(gw, gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const t = (x / gw + y / gh) / 2, i = (y * gw + x) * 4, dth = BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5;
    const dark = clampf((t - .42) * 1.5 + dth * .12, 0, 1), warm = clampf((.3 - t) * 1.6 + dth * .1, 0, 1);
    if (warm > 0) { img.data[i] = 255; img.data[i + 1] = 236; img.data[i + 2] = 200; img.data[i + 3] = Math.round(warm * 5) / 5 * 30; }
    else { img.data[i] = 4; img.data[i + 1] = 8; img.data[i + 2] = 24; img.data[i + 3] = Math.round(dark * 6) / 6 * 58; }
  }
  g.putImageData(img, 0, 0);
  return c;
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

// Planeta Tierra en pixel art con los CONTINENTES REALES (mismo mapa que el módulo de lanzamiento), nubes y la
// parte de noche: desde la Luna la Tierra se ve con fases.
const EARTH_COL = { 0: [31, 95, 174], 1: [63, 143, 74], 2: [194, 164, 101], 3: [238, 244, 250] };
export function earthCanvas(size = 64) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d'), r = size / 2 - 1;
  const img = g.createImageData(size, size);
  const lon0 = -55 * Math.PI / 180;                                          // se ven América, el Atlántico y África
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x - r - 1) / r, dy = (y - r - 1) / r, d = Math.hypot(dx, dy), i = (y * size + x) * 4;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d * d);
    const s = globeSample(dx, -dy, .22, lon0);
    let col = s & CLOUD ? [240, 246, 252] : EARTH_COL[s & 7];
    const light = clampf(-(dx * .62 + dy * .45) * 1.05 + nz * .5 + .12, .07, 1.12);
    const q = Math.round(light * 5) / 5;                                    // sombreado en bandas (pixel art)
    if (d > .93) col = [col[0] * .6 + 60, col[1] * .6 + 90, col[2] * .6 + 110]; // borde azulado: la atmósfera
    img.data[i] = Math.min(255, col[0] * q); img.data[i + 1] = Math.min(255, col[1] * q); img.data[i + 2] = Math.min(255, col[2] * q); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Cielo para la espera y los resultados: estrellas por capas, Vía Láctea tramada, la Tierra real con halo, dos
// cordilleras con el Sol rasante, llanura con cráteres en perspectiva, rocas con sombra larga, módulo, rover y huellas.
export function skyCanvas(w, h) {
  const S = 3, gw = Math.ceil(w / S), gh = Math.ceil(h / S), rnd = prng(77), noise = makeNoise(31);
  const small = document.createElement('canvas'); small.width = gw; small.height = gh;
  const g = small.getContext('2d'), img = g.createImageData(gw, gh);
  const top = [2, 5, 13], bot = [9, 24, 52];
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const t = y / gh, i = (y * gw + x) * 4;
    const band = Math.max(0, 1 - Math.abs((x / gw * .6 + y / gh * .8) - .62) * 5.2);             // banda diagonal de la Vía Láctea
    const mw = band * noise(x / 14, y / 14, 4) * (BAYER[(y & 3) * 4 + (x & 3)] / 16 + .25);
    for (let k = 0; k < 3; k++) img.data[i + k] = top[k] + (bot[k] - top[k]) * t * t + mw * [78, 66, 104][k];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const R = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh))); };
  for (let i = 0; i < gw * gh / 130; i++) {                                                          // estrellas
    const x = rnd() * gw | 0, y = rnd() * gh * .78 | 0, k = rnd(); R(x, y, 1, 1, k > .93 ? '#ffd9a0' : k > .82 ? '#a8d8ff' : k > .4 ? '#eaf4ff' : '#6f83a2');
    if (k > .965) { g.fillStyle = 'rgba(234,244,255,.45)'; g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
  }
  // La Tierra (continentes reales) con halo
  const es = Math.round(Math.min(gw, gh) * .26), ex = Math.round(gw * .78), ey = Math.round(gh * .24);
  for (let k = 6; k >= 1; k--) { g.fillStyle = `rgba(80,160,255,${.03 * (7 - k)})`; g.beginPath(); g.arc(ex, ey, es / 2 + k * 3, 0, 6.2832); g.fill(); }
  g.drawImage(earthCanvas(es), ex - es / 2, ey - es / 2);
  // Dos cordilleras: el Sol llega rasante desde la izquierda (caras claras a la izquierda, sombras a la derecha)
  const hy = Math.round(gh * .74);
  const ridge = (base, amp, scale, seedOff, dark, mid, lit) => {
    const hs = []; for (let x = -6; x < gw + 6; x++) hs.push(amp * (noise(x / scale + seedOff, seedOff, 3) * 1.5 + Math.abs(Math.sin(x / (scale * 1.7) + seedOff)) * .5));
    for (let x = 0; x < gw; x++) {
      const hgt = Math.round(hs[x + 6]), slope = hs[x + 6] - hs[x + 1];                                 // pendiente suavizada (5 px)
      const y0 = base - hgt, sunny = slope > .4;                                                        // sube hacia la derecha = cara que mira al Sol
      R(x, y0, 1, base - y0 + 2, dark);
      R(x, y0, 1, Math.max(1, Math.round(hgt * (sunny ? .45 : .25))), sunny ? lit : mid);
      if (sunny && ((x + y0) & 1)) R(x, y0 + Math.round(hgt * .45), 1, Math.max(1, Math.round(hgt * .15)), lit);  // trama entre luz y sombra
      R(x, y0, 1, 1, sunny ? '#e6e2d6' : mid);
    }
  };
  ridge(hy + 2, gh * .13, 26, 3.1, '#1a2130', '#2a3345', '#5f6877');
  ridge(hy + 4, gh * .06, 30, 9.7, '#232b3a', '#394456', '#8a8d8e');
  // Llanura
  for (let y = hy; y < gh; y++) for (let x = 0; x < gw; x++) { const n = noise(x / 16, (y - hy) / 4, 3) + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) * .32 - (y - hy) / (gh - hy) * .12; R(x, y, 1, 1, n > .64 ? '#7c7b78' : n > .5 ? '#5f6066' : n > .36 ? '#484b55' : '#353945'); }
  R(0, hy - 1, gw, 1, '#b9b5a8');                                                                      // línea de luz del horizonte
  for (let i = 0; i < 30; i++) {                                                                       // cráteres en perspectiva
    const cy = hy + 4 + Math.pow(rnd(), 1.4) * (gh - hy - 6), k = (cy - hy) / (gh - hy), cx = rnd() * gw, cr = 2 + k * (4 + rnd() * 12);
    g.fillStyle = '#1b202b'; g.beginPath(); g.ellipse(cx, cy, cr, cr * .3, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#2b313d'; g.beginPath(); g.ellipse(cx + cr * .2, cy + cr * .06, cr * .7, cr * .2, 0, 0, 6.2832); g.fill();
    R(cx - cr * .1, cy - cr * .3 - 1, cr * 1.05, 1, '#c9c6bd'); R(cx + cr * .75, cy - cr * .12, cr * .3, 1, '#a9a69c');
  }
  for (let i = 0; i < 34; i++) {                                                                       // rocas con sombra larga
    const y = hy + 3 + rnd() * (gh - hy - 4), k = (y - hy) / (gh - hy), x = rnd() * gw, s = 1 + Math.round(k * 3 * rnd());
    R(x + s, y, s * 4, 1, 'rgba(8,10,18,.6)'); R(x, y - s + 1, s, s, '#8e8d8a'); R(x, y - s + 1, s, 1, '#dcd8cc');
  }
  // Módulo de aterrizaje (lámina dorada, patas, antena) y bandera
  const lx = Math.round(gw * .2), ly = hy + Math.round((gh - hy) * .3);
  R(lx - 2, ly, 26, 1, 'rgba(8,10,18,.6)');
  R(lx - 7, ly - 9, 14, 7, '#8c6a22'); R(lx - 6, ly - 8, 12, 5, '#d9a441'); R(lx - 6, ly - 8, 12, 1, '#f6dc8a'); R(lx - 6, ly - 8, 2, 5, '#eec35f');
  R(lx - 3, ly - 13, 6, 4, '#b8c2cd'); R(lx - 3, ly - 13, 6, 1, '#eef2f6'); R(lx + 1, ly - 12, 1, 1, '#6ce2cf');
  for (const sd of [-1, 1]) { R(lx + sd * 8 - (sd < 0 ? 1 : 0), ly - 3, 1, 3, '#9aa7b8'); R(lx + sd * 9 - (sd < 0 ? 2 : 0), ly - 1, 3, 1, '#cfd8e3'); R(lx + sd * 5, ly - 4, 4, 1, '#7f8ea2'); }
  R(lx + 4, ly - 17, 1, 5, '#9aa7b8'); R(lx + 2, ly - 19, 5, 2, '#e6edf6'); R(lx + 4, ly - 20, 1, 1, '#ff7b7b');
  R(lx + 16, ly - 12, 1, 12, '#e9eef5'); R(lx + 17, ly - 12, 6, 4, '#6ce2cf'); R(lx + 17, ly - 12, 6, 1, '#b8fff4');
  // Rover a lo lejos con sus huellas
  const rx = Math.round(gw * .52), ry = hy + Math.round((gh - hy) * .46);
  for (let t = 0; t < 46; t += 2) { R(lx + 22 + (rx - lx - 26) * (t / 46), ly + (ry - ly) * (t / 46), 1, 1, 'rgba(8,10,18,.55)'); R(lx + 22 + (rx - lx - 26) * (t / 46), ly + 2 + (ry - ly) * (t / 46), 1, 1, 'rgba(8,10,18,.4)'); }
  R(rx + 3, ry + 1, 14, 1, 'rgba(8,10,18,.6)');
  R(rx - 5, ry - 4, 10, 3, '#b3bfce'); R(rx - 5, ry - 4, 10, 1, '#e6edf6'); R(rx - 4, ry - 6, 8, 1, '#2f6bff'); R(rx - 4, ry - 7, 8, 1, '#6fa0ff');
  for (const ox of [-4, 0, 4]) R(rx + ox - 1, ry - 1, 2, 2, '#141b26');
  R(rx - 4, ry - 9, 1, 3, '#7f8ea2'); R(rx - 5, ry - 10, 3, 1, '#2a3444'); R(rx + 4, ry - 8, 1, 2, '#7f8ea2'); R(rx + 3, ry - 9, 3, 1, '#e6edf6');
  const big = document.createElement('canvas'); big.width = gw * S; big.height = gh * S;
  const b = big.getContext('2d'); b.imageSmoothingEnabled = false; b.drawImage(small, 0, 0, big.width, big.height);
  return big;
}
