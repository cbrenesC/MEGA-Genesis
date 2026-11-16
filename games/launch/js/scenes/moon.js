// La Luna en pixel art: mares oscuros, tierras altas claras y cráteres, colocados más o menos donde están de verdad
// (Mar de las Lluvias, de la Serenidad, de la Tranquilidad, Océano de las Tormentas; cráteres Tycho, Copérnico…).
// Es un mapa aproximado hecho a mano, sin imágenes externas. Se dibuja como un globo visto de frente, igual que
// la Tierra de earth.js: la cara visible (longitud 0°) queda mirando hacia la Tierra, como en la realidad.

const DEG = Math.PI / 180;
export const MARE = 0; export const MARE_DARK = 1; export const HIGH = 2; export const HIGH_LIGHT = 3; export const RIM = 4; export const SHADE = 5;
// colores: mar · mar oscuro · tierras altas · tierras altas claras · borde iluminado / rayos · sombra de cráter
export const MOON_PAL = [0x7b808c, 0x666b77, 0xb4b8bf, 0xc8ccd2, 0xe6e9ec, 0x4d515b];

const hash2 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Mares: [latitud, longitud, medio alto, medio ancho] en grados (elipses).
const MARIA = [
  [33, -16, 17, 20], // Mar de las Lluvias (Imbrium)
  [28, 18, 11, 11], // Mar de la Serenidad
  [9, 31, 9, 12], // Mar de la Tranquilidad (Apolo 11)
  [17, 59, 7, 8], // Mar de las Crisis
  [-8, 51, 10, 8], // Mar de la Fecundidad
  [-15, 35, 6, 6], // Mar del Néctar
  [-21, -17, 9, 11], // Mar de las Nubes
  [-24, -39, 6, 6], // Mar de los Humores
  [18, -55, 25, 17], // Océano de las Tormentas
  [-2, -40, 12, 14],
  [56, 0, 4, 34], // Mar del Frío
  [13, 4, 4, 5], // Mar de los Vapores
  [-10, -23, 6, 7], // Mar Conocido
  [27, 148, 5, 6], // Mar de Moscú (cara oculta)
  [-19, -94, 5, 5], // Mar Oriental (cara oculta)
  [-34, 163, 4, 5], // Mar del Ingenio (cara oculta)
];
// Cráteres con nombre: [lat, lon, radio°, tipo] · tipo 1 = brillante con rayos, 2 = fondo oscuro, 0 = normal
const NAMED = [
  [-43, -11, 2.6, 1], // Tycho
  [10, -20, 2.4, 1], // Copérnico
  [8, -38, 1.4, 1], // Kepler
  [24, -47, 1.4, 1], // Aristarco
  [52, -9, 2.2, 2], // Platón
  [-58, -14, 3.6, 0], // Clavius
  [-9, 61, 2.4, 0], // Langrenus
  [-20, 129, 3.2, 2], // Tsiolkovski (cara oculta)
  [-4, -157, 6, 0], // Korolev
  [2, -129, 7, 0], // Hertzsprung
  [-36, -152, 7, 0], // Apolo
  [44, 100, 5, 0], [-50, 80, 4, 0], [60, -120, 5, 0], [-65, 150, 5, 0], [15, 170, 4.5, 0], [-12, 105, 3.5, 0],
];

/** Ruido suave (0–1): mezcla los valores de una rejilla de `cell` grados, para manchas grandes y sin cuadritos. */
function vnoise(lat, lon, cell) {
  const u = lat / cell; const v = lon / cell;
  const i = Math.floor(u); const j = Math.floor(v);
  const sm = (t) => t * t * (3 - 2 * t);
  const fu = sm(u - i); const fv = sm(v - j);
  const a = hash2(i, j); const b = hash2(i + 1, j); const c = hash2(i, j + 1); const d = hash2(i + 1, j + 1);
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
}

function angDist(lat1, lon1, lat2, lon2) {
  const dl = (lon1 - lon2) * DEG;
  const a = Math.sin(lat1 * DEG) * Math.sin(lat2 * DEG) + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, a))) / DEG;
}
const lonDiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

// cráteres pequeños repartidos por toda la Luna (más en las tierras altas y en la cara oculta)
const SMALL = [];
for (let i = 0; i < 230; i++) {
  const lat = Math.asin(hash2(i, 7) * 2 - 1) / DEG;
  const lon = hash2(i, 8) * 360 - 180;
  SMALL.push([lat, lon, 0.9 + hash2(i, 9) * hash2(i, 10) * 3.4, 0]);
}

function inMare(lat, lon) {
  for (const [la, lo, h, w] of MARIA) {
    const dy = (lat - la) / h; const dx = lonDiff(lon, lo) * Math.cos(lat * DEG) / w;
    const n = (hash2(Math.round(lat * 1.5), Math.round(lon * 1.5)) - 0.5) * 0.28;
    if (dx * dx + dy * dy < 1 + n) return dx * dx + dy * dy < 0.45 ? MARE_DARK : MARE;
  }
  return -1;
}

function classify(lat, lon) {
  let base = inMare(lat, lon);
  const mare = base >= 0;
  if (!mare) base = vnoise(lat, lon * Math.max(0.25, Math.cos(lat * DEG)), 9) * 0.7 + vnoise(lat + 40, lon + 70, 3.5) * 0.3 > 0.56 ? HIGH_LIGHT : HIGH;
  // cuenca del Polo Sur–Aitken (cara oculta): un poco más oscura
  if (!mare && angDist(lat, lon, -53, -169) < 24) base = hash2(Math.round(lat), Math.round(lon)) > 0.5 ? MARE : HIGH;
  // rayos brillantes de los cráteres jóvenes
  for (const [la, lo, r, type] of NAMED) {
    if (type !== 1) continue;
    const d = angDist(lat, lon, la, lo);
    if (d > r && d < r * 9) {
      const bearing = Math.atan2(lonDiff(lon, lo) * Math.cos(lat * DEG), lat - la);
      const ray = Math.abs(Math.sin(bearing * 4.5 + la));
      if (ray > 0.965 && hash2(Math.round(lat * 2), Math.round(lon * 2)) > d / (r * 11)) return RIM;
    }
  }
  // cráteres: fondo, borde iluminado al oeste y sombra al este (la luz llega desde la izquierda)
  for (const list of [NAMED, SMALL]) {
    for (const [la, lo, r, type] of list) {
      if (Math.abs(lat - la) > r + 1.2) continue;
      if (list === SMALL && mare && hash2(Math.round(la), Math.round(lo)) < 0.6) continue; // en los mares hay menos
      const d = angDist(lat, lon, la, lo);
      if (d > r + 0.9) continue;
      const west = lonDiff(lon, lo) * Math.cos(lat * DEG) < 0;
      if (d > r - 0.5) return west ? RIM : (type === 1 ? RIM : SHADE);
      if (type === 2) return MARE_DARK;
      if (type === 1) return west ? HIGH_LIGHT : RIM;
      return west ? SHADE : (mare ? MARE : HIGH);
    }
  }
  return base;
}

let MAP = null;
function moonMap() {
  if (MAP) return MAP;
  MAP = new Uint8Array(360 * 180);
  for (let j = 0; j < 180; j++) for (let i = 0; i < 360; i++) MAP[j * 360 + i] = classify(89.5 - j, -179.5 + i);
  return MAP;
}

/** Tipo de terreno lunar en una latitud y longitud (radianes). */
export function moonSurfaceAt(latRad, lonRad) {
  const m = moonMap();
  let j = Math.floor((Math.PI / 2 - latRad) / DEG); if (j < 0) j = 0; if (j > 179) j = 179;
  let i = Math.floor(lonRad / DEG + 180) % 360; if (i < 0) i += 360;
  return m[j * 360 + i];
}

const LON0 = -90 * DEG; // el centro de la vista: así la cara visible (longitud 0°) queda en el borde derecho del disco sin girar

/**
 * Terreno que se ve en (x, y) del disco unidad (x derecha, y arriba). `rot` = giro horario del disco (rad).
 * Con rot = 0 la cara visible mira hacia la derecha.
 */
export function moonSample(x, y, rot) {
  const c = Math.cos(rot); const s = Math.sin(rot);
  const xt = x * c - y * s; const yt = x * s + y * c;
  const z2 = 1 - xt * xt - yt * yt;
  if (z2 < 0) return HIGH;
  return moonSurfaceAt(Math.asin(Math.max(-1, Math.min(1, yt))), LON0 + Math.atan2(xt, Math.sqrt(z2)));
}
