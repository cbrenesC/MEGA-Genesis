// La Tierra de verdad, en pequeño: un mapa del mundo (tierra, desierto, hielo, mar) con el que se pinta el planeta
// cuando la cámara se aleja. Es un mapa aproximado hecho a mano (franjas de 5° de latitud): alcanza para reconocer
// los continentes en pixel art. No usa imágenes externas.
//
// El planeta se dibuja como un globo visto de frente (proyección ortográfica). El globo se orienta para que el sitio
// de lanzamiento real quede justo en el borde, en el punto donde está la plataforma, y gira junto con el suelo.

const DEG = Math.PI / 180;

// Tierra firme por franja de latitud (de norte a sur, cada 5°): pares [lonOeste, lonEste] en grados.
const LAND = [
  /* 85..90 N */ [],
  /* 80..85 */ [[-90, -62], [-70, -18], [15, 25], [50, 62]],
  /* 75..80 */ [[-120, -75], [-72, -18], [12, 28], [55, 68], [95, 106]],
  /* 70..75 */ [[-125, -70], [-58, -20], [20, 30], [52, 58], [68, 145], [-162, -142]],
  /* 65..70 */ [[-166, -62], [-53, -22], [12, 180], [-180, -170]],
  /* 60..65 */ [[-165, -95], [-78, -64], [-50, -40], [-22, -14], [5, 165], [165, 172]],
  /* 55..60 */ [[-160, -153], [-135, -94], [-78, -60], [-6, -2], [8, 18], [21, 140], [156, 163]],
  /* 50..55 */ [[-130, -56], [-10, 1], [4, 142], [156, 160]],
  /* 45..50 */ [[-125, -60], [-2, 140]],
  /* 40..45 */ [[-124, -70], [-9, 3], [8, 29], [41, 49], [53, 132], [140, 145]],
  /* 35..40 */ [[-123, -75], [-9, 0], [14, 17], [20, 45], [54, 122], [126, 129], [136, 141]],
  /* 30..35 */ [[-120, -77], [-9, 11], [12, 25], [30, 122], [130, 136]],
  /* 25..30 */ [[-115, -97], [-82, -80], [-13, 35], [36, 122]],
  /* 20..25 */ [[-110, -97], [-84, -76], [-17, 37], [38, 59], [68, 117], [120, 122]],
  /* 15..20 */ [[-105, -88], [-74, -68], [-17, 39], [42, 55], [73, 86], [94, 109], [120, 122]],
  /* 10..15 */ [[-92, -83], [-17, 51], [75, 80], [98, 109], [121, 125]],
  /* 5..10 */ [[-85, -60], [-13, 48], [80, 82], [98, 103], [122, 126]],
  /* 0..5 */ [[-78, -50], [-8, 2], [9, 45], [97, 104], [109, 118]],
  /* -5..0 */ [[-81, -35], [9, 42], [100, 105], [110, 117], [119, 123], [130, 141]],
  /* -10..-5 */ [[-80, -35], [12, 40], [106, 114], [138, 150]],
  /* -15..-10 */ [[-77, -37], [13, 40], [130, 137], [142, 144]],
  /* -20..-15 */ [[-74, -39], [12, 40], [44, 50], [122, 146]],
  /* -25..-20 */ [[-70, -41], [14, 35], [43, 48], [114, 150]],
  /* -30..-25 */ [[-71, -48], [15, 33], [114, 153]],
  /* -35..-30 */ [[-72, -52], [18, 30], [115, 124], [134, 152]],
  /* -40..-35 */ [[-73, -57], [140, 150], [174, 178]],
  /* -45..-40 */ [[-74, -63], [145, 148], [170, 176]],
  /* -50..-45 */ [[-75, -66], [167, 171]],
  /* -55..-50 */ [[-74, -68]],
  /* -60..-55 */ [],
  /* -65..-60 */ [[-62, -57]],
  /* -70..-65 */ [[-66, -60], [40, 160]],
  /* -75..-70 */ [[-180, 180]],
  /* -80..-75 */ [[-180, 180]],
  /* -85..-80 */ [[-180, 180]],
  /* -90..-85 */ [[-180, 180]],
];

// Desiertos y zonas secas (para dar color): [latSur, latNorte, lonOeste, lonEste]
const DRY = [[14, 33, -17, 40], [13, 32, 38, 60], [24, 36, 44, 70], [36, 48, 55, 110], [-31, -19, 118, 142], [-28, -18, 13, 24], [22, 34, -116, -102], [-27, -17, -71, -68]];

export const SITE_LON = { ksc: -80.6, vsfb: -120.6, kourou: -52.8, mahia: 177.9, wallops: -75.5, sdsc: 80.2, kwaj: 167.7 };

export const OCEAN = 0; export const GREEN = 1; export const SAND = 2; export const ICE = 3; export const CLOUD = 8;

const hash2 = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function rowLand(row, lon) {
  const list = LAND[Math.min(LAND.length - 1, Math.max(0, row))];
  for (const [a, b] of list) if (lon >= a && lon <= b) return true;
  return false;
}

/** Tipo de superficie en (lat, lon) en grados, con la costa un poco irregular para que no se vea "a cuadros". */
function classify(lat, lon) {
  // la costa se interpola entre la franja de esta latitud y la vecina, y se le suma un poco de ruido
  const f = (90 - lat) / 5 - 0.5;
  const r0 = Math.floor(f); const t = f - r0;
  const jl = (hash2(Math.round(lat * 2), Math.round(lon * 2)) - 0.5) * 2.4;
  const pick = hash2(Math.round(lon * 3), Math.round(lat * 3) + 77) < t ? r0 + 1 : r0;
  let l = lon + jl; if (l > 180) l -= 360; if (l < -180) l += 360;
  if (!rowLand(pick, l)) return OCEAN;
  if (lat > 66 || lat < -62 || (lat > 60 && l > -60 && l < -18)) return ICE; // casquetes y Groenlandia
  for (const [s, n, w, e] of DRY) if (lat >= s && lat <= n && l >= w && l <= e) return SAND;
  return GREEN;
}

// Mapa del mundo ya calculado: 1 celda por grado (360 × 180). Se arma una sola vez.
let MAP = null;
function worldMap() {
  if (MAP) return MAP;
  MAP = new Uint8Array(360 * 180);
  for (let j = 0; j < 180; j++) for (let i = 0; i < 360; i++) MAP[j * 360 + i] = classify(89.5 - j, -179.5 + i);
  return MAP;
}

/** Tipo de superficie (OCEAN / GREEN / SAND / ICE) en una latitud y longitud en radianes. */
export function surfaceAt(latRad, lonRad) {
  const m = worldMap();
  let j = Math.floor((Math.PI / 2 - latRad) / DEG); if (j < 0) j = 0; if (j > 179) j = 179;
  let i = Math.floor(lonRad / DEG + 180) % 360; if (i < 0) i += 360;
  return m[j * 360 + i];
}

/**
 * Orientación del globo para un sitio de lanzamiento: el centro de la vista queda 90° al este del sitio, sobre el
 * ecuador, así que el sitio cae justo en el borde del disco. Devuelve { lon0, siteAngle }:
 * siteAngle = ángulo del sitio en el borde, medido desde "arriba" en sentido horario (rad).
 */
export function globeView(siteId, latDeg) {
  const lonSite = SITE_LON[siteId] ?? -80.6;
  const lat = (latDeg ?? 28.5) * DEG;
  return { lon0: (lonSite + 90) * DEG, siteAngle: Math.atan2(-Math.cos(lat), Math.sin(lat)) };
}

/**
 * Punto del globo que se ve en (x, y) del disco unidad (x derecha, y arriba; dentro del círculo de radio 1).
 * `rot` = giro del disco en sentido horario (rad). Devuelve el tipo de superficie (con el bit CLOUD si hay nube).
 */
export function globeSample(x, y, rot, lon0) {
  const c = Math.cos(rot); const s = Math.sin(rot);
  // deshace el giro del disco
  const xt = x * c - y * s; const yt = x * s + y * c;
  const z2 = 1 - xt * xt - yt * yt;
  if (z2 < 0) return OCEAN;
  const lat = Math.asin(Math.max(-1, Math.min(1, yt)));
  const lon = lon0 + Math.atan2(xt, Math.sqrt(z2));
  const cls = surfaceAt(lat, lon);
  // nubes: jirones alargados que siguen más o menos la latitud
  const la = lat / DEG; const lo = lon / DEG;
  const streak = Math.sin(la * 0.55 + Math.sin(lo * 0.07 + la * 0.05) * 2.2 + Math.sin(lo * 0.021) * 3);
  const cloud = streak > 0.94 && hash2(Math.floor(la / 3), Math.floor(lo / 9)) > 0.45;
  return cloud ? cls | CLOUD : cls;
}
