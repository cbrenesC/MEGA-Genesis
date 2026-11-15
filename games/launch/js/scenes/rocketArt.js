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
// Cómo es cada cohete (colores y rasgos que lo hacen reconocible)
// ---------------------------------------------------------------------------

const WHITE = ['#f7fbff', '#dbe4ee', '#b4c1d1', '#8392a8', '#566379'];
const BLACK = ['#5b6573', '#3b434f', '#272d37', '#181c23', '#0e1116'];
const CARBON = ['#6b7480', '#4a525e', '#343b46', '#22272f', '#14181e'];
const ORANGE = ['#f8b068', '#e88f3e', '#cb722a', '#a0551d', '#703a13'];
const CREAM = PAL.fairing;

// parallel = la etapa 0 del simulador son propulsores laterales (se dibujan a los lados del núcleo, no debajo)
const STYLES = {
  // Falcon 9: blanco, inter-etapa negra, patas de aterrizaje y aletas de rejilla
  falcon9: { hull: WHITE, upper: WHITE, fairing: WHITE, interstage: 3, legs: true, gridFins: true, logo: '#2f6fd0' },
  // Falcon Heavy: tres núcleos de Falcon; los laterales con punta cónica
  falconheavy: { hull: WHITE, upper: WHITE, fairing: WHITE, interstage: 3, legs: true, gridFins: true, logo: '#2f6fd0', parallel: { hFrac: 0.9, wFrac: 1, pal: WHITE, nose: 3, legs: true, gridFins: true } },
  // Electron: todo de fibra de carbono negra, con letras blancas
  electron: { hull: BLACK, upper: BLACK, fairing: BLACK, stripe: '#e8eef5', fairingBand: '#c9d3df' },
  // Alpha (Firefly): cuerpo de carbono oscuro y cofia blanca
  alpha: { hull: CARBON, upper: CARBON, fairing: WHITE, stripe: '#ff8a3d' },
  // Pegasus XL: blanco, con ala delta y cola (se lanza desde un avión)
  pegasus: { hull: WHITE, upper: WHITE, fairing: WHITE, wing: true, stripe: '#1c3f8f' },
  // PSLV: blanco con franjas granate y propulsores pequeños alrededor de la base
  pslv: { hull: WHITE, upper: WHITE, fairing: WHITE, bands: '#8a2f2c', strapOns: { hFrac: 0.55, pal: WHITE, cap: '#8a2f2c' }, fairingBand: '#8a2f2c' },
  // Vega C: blanco, delgado abajo y con cofia ancha
  vegac: { hull: WHITE, upper: WHITE, fairing: WHITE, bands: '#20262f', hammer: 1, logo: '#2a8f4a' },
  // Ariane 6 (A64): núcleo blanco, propulsores sólidos con punta y cofia larga
  ariane64: { hull: WHITE, upper: WHITE, fairing: WHITE, logo: '#1c3f8f', bands: '#20262f', parallel: { hFrac: 0.5, wFrac: 0.6, pal: WHITE, nose: 3, cap: '#20262f' } },
  // SLS: núcleo naranja (espuma aislante), dos propulsores blancos y la torre de escape arriba
  sls: { hull: ORANGE, core: ORANGE, upper: WHITE, fairing: WHITE, spike: true, parallel: { hFrac: 0.86, wFrac: 0.45, pal: WHITE, nose: 3, cap: '#20262f' } },
  default: { hull: PAL.hull, upper: PAL.hull, fairing: CREAM },
};
export const rocketStyle = (vehicle) => STYLES[vehicle.designId ?? vehicle.id] ?? STYLES[vehicle.id] ?? STYLES.default;

// ---------------------------------------------------------------------------
// Medidas
// ---------------------------------------------------------------------------

/** Medidas del cohete en píxeles del lienzo pequeño (proporcionales al catálogo, pero siempre caben en pantalla). */
export function rocketDims(vehicle) {
  const lg = Math.log10(Math.max(vehicle.stackKg, 1000));
  const total = Math.round(Math.max(30, Math.min(50, 30 + (20 * (lg - 4)) / 2.7)));
  const hw = Math.round(Math.max(2, Math.min(6, 1.5 + vehicle.diameterM * 0.55)));
  const fairingH = Math.round(total * 0.24);
  const bodyH = total - fairingH;
  const masses = vehicle.stages.map((s) => s.dryKg + s.propKg);
  const sum = masses.reduce((a, b) => a + b, 0);
  const stageH = masses.map((m) => Math.max(4, Math.round((m / sum) * bodyH)));
  // ajusta para que sumen exactamente bodyH
  let diff = bodyH - stageH.reduce((a, b) => a + b, 0);
  for (let i = 0, guard = 0; diff !== 0 && guard < 400; i = (i + 1) % stageH.length, guard++) { const sg = Math.sign(diff); if (stageH[i] + sg >= 4) { stageH[i] += sg; diff -= sg; } }
  return { total, w: hw * 2 + 1, hw, fairingH, stageH, bodyH, bell: 3 };
}

/** Geometría completa del cohete dentro de su lienzo: dónde va cada etapa, los propulsores laterales y las toberas. */
function layout(vehicle) {
  return memo(`layout|${vehicle.id}|${vehicle.stackKg}|${vehicle.stages.length}`, () => {
    const d = rocketDims(vehicle);
    const st = rocketStyle(vehicle);
    const n = vehicle.stages.length;
    const par = st.parallel && n >= 2 ? st.parallel : null;
    // etapas de arriba hacia abajo: la última va arriba
    const tops = []; let y = d.fairingH;
    for (let i = n - 1; i >= 0; i--) { tops[i] = y; y += d.stageH[i]; }
    const bottom = d.fairingH + d.bodyH; // y (sin margen) del borde inferior del cuerpo
    // cada etapa como bloque { top, h }: con propulsores laterales el núcleo ocupa también el alto de la "etapa 0"
    const seg = vehicle.stages.map((_, i) => ({ top: tops[i], h: d.stageH[i] }));
    let side = null;
    if (par) {
      seg[1] = { top: tops[1], h: d.stageH[1] + d.stageH[0] };
      const bhw = Math.max(1, Math.round(d.hw * par.wFrac));
      const bh = Math.max(6, Math.round(seg[1].h * par.hFrac));
      seg[0] = { top: bottom - bh, h: bh };
      side = { hw: bhw, h: bh, top: bottom - bh, off: d.hw + 1 + bhw, ...par };
    }
    const so = !par && st.strapOns ? { hw: 1, h: Math.max(5, Math.round(d.stageH[0] * st.strapOns.hFrac)), ...st.strapOns } : null;
    const extra = Math.max(Math.min(4, d.hw) + 1, side ? side.hw * 2 + 2 : 0, so ? 4 : 0, st.wing ? d.hw + 5 : 0, st.legs ? 3 : 0);
    const W = d.w + extra * 2 + 6;
    const H = d.total + d.bell + 2;
    const x0 = Math.floor((W - d.w) / 2);
    return { d, st, n, par, side, so, seg, tops, bottom, W, H, x0, cx: x0 + d.hw, hwF: d.hw + (st.hammer ?? 0) };
  });
}

// ---------------------------------------------------------------------------
// Piezas del dibujo
// ---------------------------------------------------------------------------

function body(g, cx, top, h, hw, pal) {
  for (let y = 0; y < h; y++) for (let x = -hw; x <= hw; x++) g.set(cx + x, top + y, shade(pal, hw === 0 ? 0 : x / hw));
}
function band(g, cx, y, hw, color, dark = PAL.metal[2]) { for (let x = -hw; x <= hw; x++) g.set(cx + x, y, x > hw * 0.45 ? dark : color); }
function bell(g, cx, y, hw, rows) {
  const bw = Math.max(1, Math.round(hw * 0.62));
  for (let r = 0; r < rows; r++) {
    const half = bw + (r === rows - 1 ? 1 : 0);
    for (let x = -half; x <= half; x++) g.set(cx + x, y + r, r === rows - 1 ? PAL.metal[2] : shade(PAL.metal, x / Math.max(1, half)));
  }
  g.set(cx, y + rows - 1, PAL.glow);
}
function cone(g, cx, top, h, hw, pal) {
  for (let r = 0; r < h; r++) { const half = Math.round((hw * (r + 1)) / h); for (let x = -half; x <= half; x++) g.set(cx + x, top + r, shade(pal, hw === 0 ? 0 : x / Math.max(1, hw))); }
}
function legsAndFins(g, cx, top, h, hw, st) {
  if (st.legs) for (let k = 0; k < Math.min(5, h - 1); k++) { g.set(cx - hw - 1, top + h - 1 - k, BLACK[2]); g.set(cx + hw + 1, top + h - 1 - k, BLACK[3]); if (k < 2) { g.set(cx - hw - 2, top + h - 1 - k, BLACK[2]); g.set(cx + hw + 2, top + h - 1 - k, BLACK[3]); } }
  if (st.gridFins) { g.set(cx - hw - 1, top + 1, PAL.metal[1]); g.set(cx + hw + 1, top + 1, PAL.metal[2]); g.set(cx - hw - 2, top + 1, PAL.metal[1]); g.set(cx + hw + 2, top + 1, PAL.metal[2]); }
}

/** Un propulsor lateral (o los dos, uno a cada lado del eje cx). */
function sideBooster(g, cx, L, sides = [-1, 1], withBell = true) {
  const s = L.side; const d = L.d;
  for (const sd of sides) {
    const bx = cx + sd * s.off;
    const nose = Math.min(s.nose ?? 0, s.h - 3);
    body(g, bx, s.top + nose, s.h - nose, s.hw, s.pal);
    if (nose) cone(g, bx, s.top, nose, s.hw, s.pal);
    if (s.cap) band(g, bx, s.top + nose, s.hw, s.cap, s.cap);
    if (s.hw >= 2) for (let yy = s.top + nose + 3; yy < s.top + s.h - 2; yy += 5) band(g, bx, yy, s.hw, s.pal[2], s.pal[3]);
    legsAndFins(g, bx, s.top + nose, s.h - nose, s.hw, { legs: s.legs && sd !== 0, gridFins: s.gridFins });
    if (withBell) bell(g, bx, s.top + s.h, s.hw, d.bell);
  }
}

/** Una etapa "en serie" (o el núcleo): cuerpo, franjas, logo y detalles propios del cohete. */
function stageBody(g, L, i, top, cx, withBell) {
  const { d, st, par, so } = L;
  const { h } = L.seg[i];
  const isFirst = i === 0 || (par && i === 1); // la etapa que toca el suelo
  const isTop = i === L.n - 1;
  const pal = isFirst ? (st.core ?? st.hull) : (st.upper ?? st.hull);
  const hw = d.hw - (!isFirst && d.hw > 3 && st.hammer ? 1 : 0);
  body(g, cx, top, h, hw, pal);
  // anillo de unión arriba y abajo
  band(g, cx, top, hw, pal[3], pal[4]);
  if (h > 5) band(g, cx, top + h - 1, hw, pal[3], pal[4]);
  if (isFirst) {
    // inter-etapa negra (Falcon), franjas, logo
    if (st.interstage) for (let k = 0; k < Math.min(st.interstage, h - 4); k++) band(g, cx, top + k, hw, BLACK[1], BLACK[3]);
    if (st.bands) { band(g, cx, top + 2, hw, st.bands, st.bands); if (h > 12) band(g, cx, top + Math.round(h * 0.55), hw, st.bands, st.bands); }
    if (st.stripe) for (let k = 0; k < Math.min(5, h - 6); k++) g.set(cx - Math.max(0, hw - 2), top + 4 + k * 2, st.stripe);
    if (st.logo && h > 10) { g.set(cx - 1, top + Math.round(h * 0.4), st.logo); g.set(cx, top + Math.round(h * 0.4) + 1, st.logo); g.set(cx - 1, top + Math.round(h * 0.4) + 2, st.logo); }
    legsAndFins(g, cx, top + (st.interstage ?? 0), h - (st.interstage ?? 0), hw, st);
    // ala delta y cola (Pegasus)
    if (st.wing) {
      const wy = top + Math.round(h * 0.45);
      for (let k = 0; k < 5; k++) for (let o = 1; o <= 5 - k; o++) { g.set(cx - hw - o, wy + 4 - k + (o > 3 ? 0 : 0), BLACK[1]); g.set(cx + hw + o, wy + 4 - k, BLACK[2]); }
      for (let k = 0; k < 3; k++) for (let o = 1; o <= 3 - k; o++) { g.set(cx - hw - o, top + h - 1 - k, PAL.metal[1]); g.set(cx + hw + o, top + h - 1 - k, PAL.metal[2]); }
    }
    // propulsores pequeños pegados a la base (PSLV): no son una etapa aparte, se van con la primera
    if (so) for (const sd of [-1, 1]) {
      const bx = cx + sd * (hw + 2);
      body(g, bx, top + h - so.h, so.h, 1, so.pal);
      g.set(bx, top + h - so.h - 1, so.cap); band(g, bx, top + h - so.h, 1, so.cap, so.cap);
      g.set(bx, top + h, PAL.metal[2]);
    }
  } else {
    if (st.stripe && h > 5) g.set(cx - Math.max(0, hw - 2), top + 2, st.stripe);
    if (isTop && st.bands && h > 6) band(g, cx, top + h - 3, hw, st.bands, st.bands);
  }
  // remaches
  for (let yy = (isFirst ? 6 : 3); yy < h - 2; yy += 4) g.set(cx + Math.ceil(hw / 3), top + yy, pal[3]);
  if (withBell) bell(g, cx, top + h, hw, d.bell);
}

function fairingRows(L, r) {
  const fh = L.d.fairingH; const hwF = L.hwF;
  const t = (r + 0.7) / fh;
  return Math.min(hwF, Math.round(hwF * Math.sqrt(1 - (1 - t) * (1 - t))));
}

// ---------------------------------------------------------------------------
// Cohete completo (se redibuja solo cuando cambia la etapa o la cofia)
// ---------------------------------------------------------------------------

/**
 * Sprite del cohete con las etapas que quedan (stage = primera etapa que sigue) y con o sin cofia.
 * Devuelve { canvas, cx, cy, base, dims, tops, nozzleY, flameHw }: (cx, cy) = centro de giro; nozzleY = y de la tobera encendida.
 */
export function rocketSprite(vehicle, stage, fairing) {
  return memo(`rocket|${vehicle.id}|${vehicle.stackKg}|${stage}|${fairing}`, () => {
    const L = layout(vehicle);
    const { d, st, par, cx } = L;
    const g = new Grid(L.W, L.H);
    const firstSerial = par ? 1 : 0; // primera etapa "en serie" (el núcleo si hay propulsores laterales)
    // propulsores laterales (detrás del núcleo) mientras la etapa 0 siga puesta
    if (par && stage === 0) sideBooster(g, cx, L);
    const lowest = Math.max(stage, firstSerial);
    for (let i = L.n - 1; i >= lowest; i--) stageBody(g, L, i, L.seg[i].top, cx, i === lowest);
    // cofia o nave
    if (fairing) {
      const fh = d.fairingH; const pal = st.fairing ?? CREAM;
      for (let r = 0; r < fh; r++) { const half = fairingRows(L, r); for (let x = -half; x <= half; x++) g.set(cx + x, r, shade(pal, half === 0 ? 0 : x / Math.max(1, L.hwF))); }
      band(g, cx, fh - 1, L.hwF, pal[3], pal[4]);
      if (st.fairingBand) band(g, cx, Math.round(fh * 0.6), fairingRows(L, Math.round(fh * 0.6)), st.fairingBand, st.fairingBand);
      if (st.logo) g.set(cx - 1, Math.round(fh * 0.55), st.logo);
      if (st.spike) { g.set(cx, 0, PAL.metal[0]); g.set(cx, 1, PAL.metal[0]); g.set(cx, 2, PAL.metal[1]); for (let x = -1; x <= 1; x++) g.set(cx + x, 3, WHITE[1]); }
    } else {
      const bh = Math.max(5, Math.round(d.fairingH * 0.7));
      const bw = Math.max(1, Math.round(d.hw * 0.7));
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
    const base = 1 + d.total + d.bell; // y de la punta de la tobera más baja (canvas con margen de 1 px)
    const s = Math.min(stage, L.n - 1);
    const burning = L.seg[Math.max(s, firstSerial)];
    const nozzleY = 1 + burning.top + burning.h + d.bell;
    const flameHw = par && stage === 0 ? d.hw + L.side.hw * 2 : d.hw;
    return { canvas: built, cx: cx + 1, cy: 1 + d.fairingH + Math.round(d.bodyH / 2), base, dims: d, tops: L.tops, nozzleY, flameHw };
  });
}

/**
 * Piezas que se sueltan al separar la etapa `index`: una etapa entera, o los dos propulsores laterales.
 * Cada una: { canvas, cx, cy, centerFromBase (px desde la tobera del cohete hasta su centro), side, lateral (px hacia un lado) }.
 */
export function stageDebris(vehicle, index) {
  return memo(`debris|${vehicle.id}|${vehicle.stackKg}|${index}`, () => {
    const L = layout(vehicle);
    const { d, par } = L;
    const baseY = d.total + d.bell; // sin margen
    if (par && index === 0) {
      const s = L.side;
      return [-1, 1].map((sd) => {
        const g = new Grid(s.hw * 2 + 5, s.h + d.bell + 1);
        const bx = s.hw + 2;
        sideBooster(g, bx - sd * s.off, { ...L, side: { ...s, top: 0 } }, [sd]);
        return { canvas: g.build(), cx: bx + 1, cy: 1 + Math.round(s.h / 2), centerFromBase: baseY - (s.top + s.h / 2), side: sd, lateral: sd * s.off, w: s.hw * 2 + 5, h: s.h };
      });
    }
    const seg = L.seg[index];
    const extra = Math.floor((L.W - d.w) / 2);
    const g = new Grid(L.W, seg.h + d.bell + 1);
    stageBody(g, L, index, 0, extra + d.hw, true);
    band(g, extra + d.hw, 0, d.hw, PAL.metal[1], PAL.metal[2]); // la parte de arriba queda abierta
    return [{ canvas: g.build(), cx: extra + d.hw + 1, cy: 1 + Math.round(seg.h / 2), centerFromBase: baseY - (seg.top + seg.h / 2), side: 0, lateral: 0, w: L.W, h: seg.h }];
  });
}

/** Sprite de la pieza suelta de la etapa `index` (side ≠ 0 = propulsor lateral de ese lado). */
export function stageSprite(vehicle, index, side = 0) {
  const list = stageDebris(vehicle, index);
  return list.find((p) => p.side === side) ?? list[0];
}

/** Una mitad de la cofia (side −1 izquierda, +1 derecha). */
export function fairingSprite(vehicle, side) {
  return memo(`fairing|${vehicle.id}|${vehicle.stackKg}|${side}`, () => {
    const L = layout(vehicle);
    const { d, st } = L;
    const fh = d.fairingH; const hw = L.hwF; const pal = st.fairing ?? CREAM;
    const g = new Grid(hw + 1, fh);
    // el eje del cohete queda en el borde interior de la mitad
    for (let r = 0; r < fh; r++) {
      const half = fairingRows(L, r);
      for (let k = 0; k <= half; k++) {
        const x = side < 0 ? hw - k : k; // borde interior en x=hw (izquierda) o x=0 (derecha)
        g.set(x, r, shade(pal, side < 0 ? -0.5 - (k / Math.max(1, hw)) * 0.3 : 0.2 + (k / Math.max(1, hw)) * 0.8));
      }
    }
    for (let k = 0; k <= hw; k++) g.set(side < 0 ? hw - k : k, fh - 1, pal[3]);
    const baseY = d.total + d.bell;
    return { canvas: g.build(), cx: (side < 0 ? hw : 0) + 1, cy: 1 + Math.round(fh / 2), centerFromBase: baseY - fh / 2, w: hw + 1, h: fh };
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
// Plataforma de lanzamiento (a escala del cohete, se aleja en el primer kilómetro)
// ---------------------------------------------------------------------------

/**
 * Complejo de lanzamiento, inspirado en los reales (LC-39 / SLC-40): losa de hormigón con foso de llamas, torre de
 * servicio con brazos, cuatro torres pararrayos con sus cables, torre de agua, tanques de combustible y hangar.
 * (cx, groundY) = punto del suelo justo debajo del cohete.
 */
export function padSprite(vehicle) {
  return memo(`pad|${vehicle.id}|${vehicle.stackKg}`, () => {
    const d = rocketDims(vehicle);
    const L = layout(vehicle);
    const half = Math.floor((L.W - 6) / 2); // medio ancho del cohete con propulsores
    const towerH = Math.round(d.total * 1.12);
    const mastH = Math.round(d.total * 1.5);
    const reach = half + 34; // distancia de las torres pararrayos lejanas
    const W = reach * 2 + 150; const H = mastH + 16;
    const g = new Grid(W, H);
    const cx = reach + 78;
    const gy = H - 1; // y del suelo
    const steel = ['#9aa9bb', '#6c7c90', '#44546a', '#2c3848'];
    const conc = ['#c9d0d8', '#a3adb8', '#7c8794', '#59636f'];
    const vline = (x, y0, y1, c) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) g.set(x, y, c); };

    // --- hangar de integración (lejos, a la izquierda) con su camino hasta la plataforma
    const hx = cx - reach - 70;
    g.rect(hx, gy - 15, 34, 15, '#b8c2cd'); g.rect(hx, gy - 15, 34, 2, '#e3e9ef'); g.rect(hx + 24, gy - 15, 10, 15, '#8d99a6');
    g.rect(hx + 5, gy - 10, 12, 10, '#5c6875'); g.rect(hx + 6, gy - 9, 10, 9, '#3d4753'); // portón
    for (let k = 0; k < 3; k++) g.rect(hx + 21 + k * 4, gy - 11, 2, 2, '#7cc4ff'); // ventanas
    vline(hx - 3, gy - 22, gy, steel[1]); g.rect(hx - 2, gy - 22, 4, 3, '#e0483e'); // bandera
    g.rect(hx + 34, gy - 1, cx - hx - 34, 1, conc[2]); // camino

    // --- losa de hormigón, mesa de lanzamiento y foso de llamas (sale hacia la derecha)
    g.rect(cx - half - 26, gy - 2, half * 2 + 60, 2, conc[1]);
    g.rect(cx - half - 26, gy - 2, half * 2 + 60, 1, conc[0]);
    g.rect(cx - half - 4, gy - 7, half * 2 + 9, 5, conc[2]);
    g.rect(cx - half - 4, gy - 7, half * 2 + 9, 1, conc[0]);
    g.rect(cx - half - 1, gy - 5, half * 2 + 3, 5, '#161c28'); // foso
    g.rect(cx + half + 5, gy - 4, 16, 2, '#161c28'); // canal del foso
    for (let k = 0; k < 5; k++) g.set(cx + half + 5 + k * 3, gy - 5, conc[3]);
    g.rect(cx - half - 5, gy - 7, 2, 7, conc[3]); g.rect(cx + half + 4, gy - 7, 2, 5, conc[3]);

    // --- torre de servicio (celosía) con brazos y grúa
    const tx = cx - half - 13;
    for (let y = 0; y < towerH; y++) {
      g.set(tx, gy - 7 - y, steel[0]); g.set(tx + 1, gy - 7 - y, steel[1]);
      g.set(tx + 6, gy - 7 - y, steel[1]); g.set(tx + 7, gy - 7 - y, steel[2]);
      const k = y % 6; g.set(tx + 2 + (k < 4 ? k : 6 - k), gy - 7 - y, steel[2]);
      if (y % 6 === 0) g.rect(tx + 1, gy - 7 - y, 6, 1, steel[1]); // pisos
    }
    g.rect(tx - 1, gy - 7 - towerH, 10, 2, steel[0]);
    g.rect(tx + 2, gy - 9 - towerH, 12, 1, steel[1]); g.set(tx + 13, gy - 8 - towerH, steel[2]); // grúa
    for (const frac of [0.3, 0.62, 0.88]) {
      const ay = gy - 7 - Math.round(towerH * frac);
      g.rect(tx + 8, ay, cx - half - tx - 8, 2, steel[0]);
      g.rect(tx + 8, ay + 2, cx - half - tx - 8, 1, steel[3]);
    }
    g.rect(tx + 8, gy - 7 - Math.round(towerH * 0.88) - 2, 4, 2, '#e8eef5'); // sala blanca

    // --- cuatro torres pararrayos (dos a cada lado) y sus cables
    const masts = [cx - reach, cx - half - 22, cx + half + 22, cx + reach];
    for (const mx of masts) {
      for (let y = 0; y < mastH; y++) {
        const w = y < mastH * 0.75 ? Math.max(0, Math.round(2 * (1 - y / (mastH * 0.75)))) : 0;
        g.set(mx - w, gy - 2 - y, steel[1]); g.set(mx + w, gy - 2 - y, steel[2]);
        if (w > 0 && y % 4 === 0) g.rect(mx - w, gy - 2 - y, w * 2 + 1, 1, steel[2]);
      }
      g.set(mx, gy - 2 - mastH, '#ff5959');
    }
    const sag = (x0, x1) => { for (let x = x0 + 2; x < x1 - 1; x += 2) { const t = (x - x0) / (x1 - x0); g.set(x, gy - 2 - mastH + 1 + Math.round(5 * 4 * t * (1 - t)), steel[2]); } };
    sag(masts[0], masts[1]); sag(masts[2], masts[3]);

    // --- torre de agua (para amortiguar el ruido) y tanques de combustible, a la derecha
    const wx = cx + reach + 16; const wh = Math.round(d.total * 0.8);
    vline(wx - 3, gy - wh + 6, gy, steel[1]); vline(wx + 3, gy - wh + 6, gy, steel[2]); vline(wx, gy - wh + 8, gy, steel[2]);
    for (let y = gy - wh + 12; y < gy; y += 6) g.rect(wx - 3, y, 7, 1, steel[2]);
    for (let r = -5; r <= 4; r++) { const w = Math.round(Math.sqrt(30 - r * r)); for (let x = -w; x <= w; x++) g.set(wx + x, gy - wh + 2 + r, shade(['#ffffff', '#e6ecf3', '#c0cbd8', '#8a99ac', '#566679'], x / Math.max(1, w))); }
    g.rect(wx - 5, gy - wh + 2, 11, 1, '#2f6fd0');
    const sx = wx + 20;
    for (let r = -6; r <= 6; r++) { const w = Math.round(Math.sqrt(42 - r * r)); for (let x = -w; x <= w; x++) g.set(sx + x, gy - 10 + r, shade(['#ffffff', '#e6ecf3', '#c0cbd8', '#8a99ac', '#566679'], x / Math.max(1, w))); }
    g.rect(sx - 4, gy - 4, 2, 4, steel[2]); g.rect(sx + 3, gy - 4, 2, 4, steel[2]);
    g.rect(sx + 10, gy - 6, 14, 5, '#dfe6ee'); g.rect(sx + 10, gy - 6, 14, 1, '#ffffff'); g.rect(sx + 10, gy - 2, 14, 1, '#8a99ac'); // tanque horizontal
    g.rect(sx + 12, gy - 1, 2, 1, steel[2]); g.rect(sx + 20, gy - 1, 2, 1, steel[2]);
    // poste de luces
    const lx = cx + half + 12; vline(lx, gy - 18, gy - 2, steel[1]); g.rect(lx - 2, gy - 20, 5, 2, '#fff3a8');
    return { canvas: g.build(), cx: cx + 1, groundY: gy + 1, w: W + 2, h: H + 2 };
  });
}

/** Edificios lejanos propios de cada sitio (por ejemplo el gran edificio de ensamblaje de Cabo Cañaveral). */
export function landmarkSprite(kind) {
  return memo(`landmark|${kind}`, () => {
    const g = new Grid(64, 60);
    const gy = 59;
    if (kind === 'vab') {
      // Edificio de Ensamblaje de Vehículos: caja enorme gris con puertas altas, bandera y logo
      g.rect(6, gy - 52, 44, 52, '#cfd6dd'); g.rect(6, gy - 52, 44, 2, '#eef2f6'); g.rect(40, gy - 52, 10, 52, '#9aa5b1');
      for (const dx of [12, 26]) { g.rect(dx, gy - 44, 9, 44, '#7d8894'); g.rect(dx + 1, gy - 43, 7, 43, '#5c6772'); for (let y = gy - 40; y < gy; y += 6) g.rect(dx + 1, y, 7, 1, '#7d8894'); }
      g.rect(8, gy - 50, 3, 1, '#e0483e'); g.rect(8, gy - 49, 3, 1, '#ffffff'); g.rect(8, gy - 48, 3, 1, '#e0483e'); g.rect(8, gy - 50, 1, 2, '#2f6fd0'); // bandera pintada
      g.rect(42, gy - 46, 5, 5, '#2f6fd0'); g.set(44, gy - 44, '#ffffff'); // logo
      g.rect(50, gy - 14, 12, 14, '#b8c2cd'); g.rect(50, gy - 14, 12, 1, '#e3e9ef'); // centro de control
    } else {
      // edificio de control genérico con antena
      g.rect(10, gy - 12, 30, 12, '#b8c2cd'); g.rect(10, gy - 12, 30, 2, '#e3e9ef'); g.rect(32, gy - 12, 8, 12, '#8d99a6');
      for (let k = 0; k < 5; k++) g.rect(13 + k * 4, gy - 8, 2, 2, '#7cc4ff');
      for (let y = 0; y < 14; y++) g.set(46, gy - y, '#6c7c90');
      for (let r = -3; r <= 3; r++) { const w = 3 - Math.abs(r); for (let x = -w; x <= w; x++) g.set(46 + x, gy - 17 + r, '#e6ecf3'); }
    }
    return { canvas: g.build(), cx: 32, groundY: gy + 2, w: 66, h: 62 };
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
