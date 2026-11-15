// Arte pixel art del cohete, las piezas sueltas, la llama, la plataforma y las nubes.
//
// Todo se construye con píxeles enteros en un lienzo chico (1 píxel del sprite = 1 píxel del "lienzo pequeño"
// del juego, que luego se agranda con un múltiplo entero y sin suavizado). Cada sprite lleva contorno oscuro
// de 1 px, sombreado por columnas (luz desde la izquierda) y una paleta fija: así todo se ve nítido y parejo.
// Los sprites se arman una sola vez y se guardan (caché).

export const PAL = {
  line: '#0b1424', // contorno
  hull: ['#f7fbff', '#dbe4ee', '#b4c1d1', '#8392a8', '#566379'], // luz → sombra
  accent: ['#ff7a3d', '#4aa8ff', '#ffc44a', '#73ddcf'],
  fairing: ['#fffaf0', '#f3e6cc', '#d9c49f', '#a8916b', '#6e5c40'],
  metal: ['#9aa7b8', '#6c7a8d', '#47546a', '#2b3548'],
  glow: '#ff9a3c',
  panel: ['#7cc4ff', '#3a78c9', '#24508f'],
};

const cache = new Map();
const memo = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/** Rejilla de píxeles para armar un sprite: set(x, y, color) y luego build() lo convierte en canvas con contorno. */
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.cells = new Array(w * h).fill(null); }
  set(x, y, color) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = color; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.cells[y * this.w + x]; }
  rect(x, y, w, h, color) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color); }
  build(outline = PAL.line) {
    const { c, ctx } = canvas(this.w + 2, this.h + 2);
    const fill = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, 1, 1); };
    for (let y = -1; y <= this.h; y++) {
      for (let x = -1; x <= this.w; x++) {
        const v = this.get(x, y);
        if (v) fill(x, y, v);
        else if (outline && (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))) fill(x, y, outline);
      }
    }
    return c;
  }
}

/** Sombreado por columna: luz a la izquierda, sombra a la derecha. pos en [-1, 1]. */
const shade = (pal, pos) => (pos < -0.62 ? pal[0] : pos < -0.1 ? pal[1] : pos < 0.45 ? pal[2] : pos < 0.8 ? pal[3] : pal[4]);

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

/** Medidas del cohete en píxeles del lienzo pequeño (proporcionales al catálogo, pero siempre caben en pantalla). */
export function rocketDims(vehicle) {
  const lg = Math.log10(Math.max(vehicle.stackKg, 1000));
  const total = Math.round(Math.max(30, Math.min(50, 30 + (20 * (lg - 4)) / 2.7)));
  let hw = Math.round(Math.max(2, Math.min(6, 1.5 + vehicle.diameterM * 0.55)));
  const fairingH = Math.round(total * 0.24);
  const bodyH = total - fairingH;
  const masses = vehicle.stages.map((s) => s.dryKg + s.propKg);
  const sum = masses.reduce((a, b) => a + b, 0);
  let stageH = masses.map((m) => Math.max(4, Math.round((m / sum) * bodyH)));
  // ajusta para que sumen exactamente bodyH
  let diff = bodyH - stageH.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % stageH.length) { const s = Math.sign(diff); if (stageH[i] + s >= 4) { stageH[i] += s; diff -= s; } else if (stageH.every((h) => h <= 4)) break; }
  return { total, w: hw * 2 + 1, hw, fairingH, stageH, bodyH, bell: 3 };
}

// ---------------------------------------------------------------------------
// Cohete completo (se redibuja solo cuando cambia la etapa o la cofia)
// ---------------------------------------------------------------------------

function drawStageBody(g, d, i, topY, h, x0, withBell, vehicle) {
  const hw = d.hw; const cx = x0 + hw;
  const hullW = i === 0 ? hw : Math.max(2, hw - (hw > 3 ? 1 : 0) + (i === 0 ? 0 : 0));
  for (let y = 0; y < h; y++) {
    for (let x = -hullW; x <= hullW; x++) {
      const pos = hullW === 0 ? 0 : x / hullW;
      g.set(cx + x, topY + y, shade(PAL.hull, pos));
    }
  }
  // banda de color de la etapa (arriba) y anillo oscuro en la unión
  const acc = PAL.accent[i % 4];
  for (let x = -hullW; x <= hullW; x++) {
    g.set(cx + x, topY, x > hullW * 0.45 ? PAL.metal[1] : acc);
    if (h > 5) g.set(cx + x, topY + h - 1, PAL.hull[3]);
  }
  // remaches / paneles
  for (let y = 2; y < h - 1; y += 3) {
    g.set(cx - Math.floor(hullW / 2), topY + y, PAL.hull[3]);
    g.set(cx + Math.ceil(hullW / 3), topY + y + (i % 2), PAL.hull[4]);
  }
  // banda negra y blanca en la primera etapa (estética de cohete clásico)
  if (i === 0 && h > 8) for (let x = -hullW; x <= hullW; x++) { g.set(cx + x, topY + 2, x > hullW * 0.45 ? PAL.hull[4] : PAL.line); g.set(cx + x, topY + 3, x > hullW * 0.45 ? PAL.hull[4] : PAL.line); }
  // tobera
  if (withBell) {
    const bw = Math.max(1, Math.round(hullW * 0.62));
    for (let r = 0; r < d.bell; r++) {
      const half = bw + (r === d.bell - 1 ? 1 : 0);
      for (let x = -half; x <= half; x++) g.set(cx + x, topY + h + r, r === d.bell - 1 ? PAL.metal[2] : shade(PAL.metal, x / Math.max(1, half)));
    }
    g.set(cx, topY + h + d.bell - 1, PAL.glow);
  }
  // aletas de la primera etapa
  if (i === 0) {
    for (let k = 0; k < Math.min(h - 2, 7); k++) {
      const out = Math.max(1, Math.round(((k + 1) / 7) * Math.min(4, hw))) ;
      for (let o = 1; o <= out; o++) { g.set(cx - hullW - o, topY + h - 1 - k + (o > 1 ? 0 : 0), shade(PAL.metal, -0.5)); g.set(cx + hullW + o, topY + h - 1 - k, PAL.metal[2]); }
    }
  }
  void vehicle;
}

/**
 * Sprite del cohete con las etapas que quedan (stage = primera etapa que sigue) y con o sin cofia.
 * Devuelve { canvas, cx, cy, base } con (cx, cy) = centro de giro (centro del cuerpo) dentro del canvas y `base` = y de la tobera.
 */
export function rocketSprite(vehicle, stage, fairing) {
  return memo(`rocket|${vehicle.id}|${vehicle.stackKg}|${stage}|${fairing}`, () => {
    const d = rocketDims(vehicle);
    const finW = Math.min(4, d.hw) + 1;
    const W = d.w + finW * 2 + 6; // margen para paneles solares
    const H = d.total + d.bell + 2;
    const g = new Grid(W, H);
    const x0 = Math.floor((W - d.w) / 2);
    const cx = x0 + d.hw;
    // etapas de arriba hacia abajo: la última va arriba
    let y = d.fairingH;
    const tops = [];
    for (let i = vehicle.stages.length - 1; i >= 0; i--) { tops[i] = y; y += d.stageH[i]; }
    for (let i = vehicle.stages.length - 1; i >= stage; i--) drawStageBody(g, d, i, tops[i], d.stageH[i], x0, i === stage, vehicle);
    // cofia o nave
    const topW = d.hw;
    if (fairing) {
      const fh = d.fairingH;
      for (let r = 0; r < fh; r++) {
        const t = (r + 0.7) / fh;
        const half = Math.min(topW, Math.round(topW * Math.sqrt(1 - (1 - t) * (1 - t)) + (r === 0 ? 0 : 0)));
        for (let x = -half; x <= half; x++) g.set(cx + x, r, shade(PAL.fairing, half === 0 ? 0 : x / Math.max(1, topW)));
      }
      for (let x = -topW; x <= topW; x++) g.set(cx + x, fh - 1, PAL.fairing[3]);
    } else {
      const bh = Math.max(5, Math.round(d.fairingH * 0.7));
      const bw = Math.max(1, Math.round(topW * 0.7));
      for (let r = 0; r < bh; r++) for (let x = -bw; x <= bw; x++) g.set(cx + x, d.fairingH - bh + r, shade(PAL.hull, x / bw));
      g.set(cx, d.fairingH - bh + 1, '#4aa8ff'); // antena
      const pw = Math.max(3, Math.round(d.hw * 1.5));
      const py = d.fairingH - Math.ceil(bh * 0.65);
      for (let r = 0; r < 3; r++) for (let k = 0; k < pw; k++) {
        const col = (k + r) % 2 ? PAL.panel[1] : PAL.panel[0];
        g.set(cx - bw - 1 - k, py + r, col); g.set(cx + bw + 1 + k, py + r, col);
      }
    }
    const built = g.build();
    const base = 1 + d.total + d.bell; // y de la punta de la tobera (en el canvas con margen de 1 px)
    return { canvas: built, cx: cx + 1, cy: 1 + d.fairingH + Math.round(d.bodyH / 2), base, dims: d, tops };
  });
}

/** Sprite de una etapa suelta: con su tobera y (la primera) con aletas. Devuelve además qué tan arriba de la base del cohete estaba. */
export function stageSprite(vehicle, index) {
  return memo(`stage|${vehicle.id}|${vehicle.stackKg}|${index}`, () => {
    const d = rocketDims(vehicle);
    const finW = index === 0 ? Math.min(4, d.hw) + 1 : 0;
    const W = d.w + finW * 2;
    const h = d.stageH[index];
    const g = new Grid(W, h + d.bell + 1);
    const x0 = finW;
    drawStageBody(g, d, index, 0, h, x0, true, vehicle);
    // la parte de arriba de la etapa queda abierta (anillo de unión)
    for (let x = -d.hw; x <= d.hw; x++) g.set(x0 + d.hw + x, 0, PAL.metal[1]);
    const built = g.build();
    // distancia (px) desde la punta de la tobera del cohete completo hasta el centro de esta etapa
    const full = rocketSprite(vehicle, 0, true);
    const stageTop = full.tops[index];
    const centerFromBase = full.base - (1 + stageTop + h / 2);
    return { canvas: built, cx: x0 + d.hw + 1, cy: 1 + Math.round(h / 2), centerFromBase, w: W, h };
  });
}

/** Una mitad de la cofia (side −1 izquierda, +1 derecha). */
export function fairingSprite(vehicle, side) {
  return memo(`fairing|${vehicle.id}|${vehicle.stackKg}|${side}`, () => {
    const d = rocketDims(vehicle);
    const fh = d.fairingH;
    const hw = d.hw;
    const g = new Grid(hw + 1, fh);
    // el eje del cohete queda en el borde interior de la mitad
    for (let r = 0; r < fh; r++) {
      const t = (r + 0.7) / fh;
      const half = Math.min(hw, Math.round(hw * Math.sqrt(1 - (1 - t) * (1 - t))));
      for (let k = 0; k <= half; k++) {
        const x = side < 0 ? hw - k : k; // borde interior en x=hw (izquierda) o x=0 (derecha)
        g.set(x, r, shade(PAL.fairing, side < 0 ? -0.5 + (k / Math.max(1, hw)) * -0.3 : 0.2 + (k / Math.max(1, hw)) * 0.8));
      }
    }
    for (let k = 0; k <= hw; k++) g.set(side < 0 ? hw - k : k, fh - 1, PAL.fairing[3]);
    const full = rocketSprite(vehicle, 0, true);
    return { canvas: g.build(), cx: (side < 0 ? hw : 0) + 1, cy: 1 + Math.round(fh / 2), centerFromBase: full.base - (1 + fh / 2), w: hw + 1, h: fh };
  });
}

// ---------------------------------------------------------------------------
// Llama del motor
// ---------------------------------------------------------------------------

/** Llama pixel art. (cx, 0) es el punto de la tobera; crece hacia abajo. vacuum = pluma azulada y delgada. */
export function flameSprite(halfW, len, frame, vacuum) {
  return memo(`flame|${halfW}|${len}|${frame % 4}|${vacuum ? 1 : 0}`, () => {
    const W = halfW * 2 + 3; const H = len + 3;
    const g = new Grid(W, H);
    const cx = halfW + 1;
    const cols = vacuum ? ['#bfe8ff', '#ffffff', '#7cc4ff'] : ['#ff7a3d', '#ffd24a', '#ffffff'];
    const wob = (r, k) => ((r * 7 + k * 13 + (frame % 4) * 5) % 5) - 2;
    for (let r = 0; r < len; r++) {
      const t = r / len;
      const wd = Math.max(0, Math.round(halfW * (vacuum ? 0.8 : 1) * Math.pow(1 - t, vacuum ? 0.5 : 0.85)) + (r > 2 && r % 2 === frame % 2 && t > 0.4 ? -1 : 0));
      for (let x = -wd; x <= wd; x++) g.set(cx + x, r, cols[0]);
      const w2 = Math.max(0, Math.round(wd * 0.62) - (t > 0.7 ? 1 : 0));
      if (r < len * 0.8) for (let x = -w2; x <= w2; x++) g.set(cx + x, r, cols[1]);
      const w3 = Math.max(0, Math.round(wd * 0.28));
      if (r < len * 0.5) for (let x = -w3; x <= w3; x++) g.set(cx + x, r, cols[2]);
      // chispas sueltas en la punta
      if (t > 0.78 && wob(r, 1) > 1) g.set(cx + wob(r, 3), r, cols[1]);
    }
    return { canvas: g.build(null), cx: cx + 1, w: W, h: H };
  });
}

// ---------------------------------------------------------------------------
// Plataforma de lanzamiento (a escala del cohete, sale en el primer kilómetro)
// ---------------------------------------------------------------------------

export function padSprite(vehicle) {
  return memo(`pad|${vehicle.id}|${vehicle.stackKg}`, () => {
    const d = rocketDims(vehicle);
    const towerH = Math.round(d.total * 1.25);
    const W = d.w * 2 + 52; const H = towerH + 14;
    const g = new Grid(W, H);
    const cx = Math.round(W * 0.58);
    const gy = H - 1; // y del suelo
    const steel = ['#7d8ea3', '#566679', '#37465a'];
    // zócalo (mesa de lanzamiento) y foso de llamas
    g.rect(cx - d.hw - 5, gy - 6, d.w + 10, 6, '#8d99a8');
    g.rect(cx - d.hw - 5, gy - 6, d.w + 10, 1, '#c3ccd8');
    g.rect(cx - d.hw - 2, gy - 3, d.w + 4, 3, '#1b2231');
    g.rect(cx - d.hw - 5, gy - 6, 2, 6, '#566679'); g.rect(cx + d.hw + 4, gy - 6, 2, 6, '#566679');
    g.rect(cx - d.hw - 14, gy - 2, d.w + 28, 2, '#5d6b7c'); // losa
    // torre de servicio (celosía) a la izquierda
    const tx = cx - d.hw - 12;
    for (let y = 0; y < towerH; y++) {
      g.set(tx, gy - 6 - y, steel[0]); g.set(tx + 1, gy - 6 - y, steel[1]);
      g.set(tx + 6, gy - 6 - y, steel[1]); g.set(tx + 7, gy - 6 - y, steel[2]);
      const k = y % 8; if (k < 6) g.set(tx + 2 + (y % 8 < 3 ? k : 5 - k) % 5 + 1, gy - 6 - y, steel[2]);
    }
    g.rect(tx - 1, gy - 6 - towerH, 10, 2, steel[0]);
    g.rect(tx + 3, gy - 6 - towerH - 5, 1, 5, steel[1]); // pararrayos
    g.set(tx + 3, gy - 6 - towerH - 5, '#ff5959');
    // brazos de servicio hacia el cohete
    for (const frac of [0.38, 0.72]) {
      const ay = gy - 6 - Math.round(towerH * frac);
      g.rect(tx + 8, ay, cx - d.hw - tx - 8, 2, steel[0]);
      g.rect(tx + 8, ay + 2, cx - d.hw - tx - 8, 1, steel[2]);
    }
    // postes de luz y tanque de combustible a la derecha
    const lx = cx + d.hw + 16;
    for (let y = 0; y < 18; y++) g.set(lx, gy - 2 - y, steel[1]);
    g.rect(lx - 2, gy - 21, 5, 2, '#fff3a8');
    for (let r = -5; r <= 5; r++) { const w = Math.round(Math.sqrt(36 - r * r)); for (let x = -w; x <= w; x++) g.set(lx + 14 + x, gy - 10 + r - 3, shade(['#ffffff', '#e6ecf3', '#c0cbd8', '#8a99ac', '#566679'], x / Math.max(1, w))); }
    g.rect(lx + 12, gy - 3, 2, 3, steel[2]); g.rect(lx + 16, gy - 3, 2, 3, steel[2]);
    return { canvas: g.build(), cx: cx + 1, groundY: gy + 1, w: W, h: H };
  });
}

// ---------------------------------------------------------------------------
// Nubes (3 formas)
// ---------------------------------------------------------------------------

export function cloudSprite(kind) {
  return memo(`cloud|${kind}`, () => {
    const blobs = [
      [[8, 12, 7], [15, 9, 8], [23, 11, 7], [29, 13, 5], [13, 13, 6], [20, 13, 7]],
      [[10, 13, 8], [20, 10, 9], [31, 9, 8], [41, 12, 7], [49, 14, 5], [16, 15, 7], [28, 15, 8], [38, 15, 7]],
      [[6, 10, 4], [14, 9, 5], [22, 10, 4], [30, 11, 3], [10, 11, 4], [20, 11, 4]], // cirros: largos y finos
    ][kind % 3];
    const W = Math.max(...blobs.map((b) => b[0] + b[2])) + 2; const H = 26;
    const g = new Grid(W, H);
    for (const [bx, by, br] of blobs) for (let y = -br; y <= br; y++) for (let x = -br; x <= br; x++) {
      if (x * x + y * y > br * br + br * 0.4) continue;
      const yy = by + (kind === 2 ? Math.round(y * 0.55) : y);
      const lit = y < -br * 0.25 || (x < -br * 0.45 && y < br * 0.3);
      g.set(bx + x, yy, lit ? '#ffffff' : y > br * 0.4 ? '#aebfd8' : '#d7e4f4');
    }
    return { canvas: g.build(null), w: W + 2, h: H + 2 };
  });
}

export function clearArtCache() { cache.clear(); }
