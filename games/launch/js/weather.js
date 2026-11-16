import { simText } from "../../../src/i18n/catalog.js";
// Clima REAL del sitio de lanzamiento, para dibujarlo: si allá es de noche, se ve de noche; si llueve, llueve.
//
//   1) Con conexión: se pregunta el clima de ESTE momento en las coordenadas del sitio a Open-Meteo
//      (https://open-meteo.com, servicio abierto que reúne los modelos de NOAA, ECMWF y otros). Sólo se envían
//      las coordenadas del sitio de lanzamiento: ningún dato del jugador.
//   2) Sin conexión: el día o la noche se calculan con la posición real del Sol para la hora actual, y el
//      tiempo sale del clima típico del mes en ese sitio (probabilidad de día lluvioso, aproximada).
//
// El clima real es sólo visual e informativo: los retrasos por clima del juego siguen sus propias reglas.

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Coordenadas reales de cada sitio y su hora respecto a UTC (para mostrar la hora local sin conexión).
export const SITE_GEO = {
  ksc: { lat: 28.57, lon: -80.65, utc: -5 },
  vsfb: { lat: 34.63, lon: -120.61, utc: -8 },
  kourou: { lat: 5.24, lon: -52.77, utc: -3 },
  mahia: { lat: -39.26, lon: 177.86, utc: 12 },
  wallops: { lat: 37.94, lon: -75.47, utc: -5 },
  sdsc: { lat: 13.72, lon: 80.23, utc: 5.5 },
  kwaj: { lat: 9.05, lon: 167.74, utc: 12 },
};

// Clima típico por mes (enero → diciembre): probabilidad aproximada de que un día tenga lluvia, y temperatura media (°C).
export const TYPICAL = {
  ksc: { rain: [0.2, 0.2, 0.2, 0.18, 0.28, 0.45, 0.5, 0.52, 0.48, 0.3, 0.2, 0.2], temp: [16, 17, 19, 22, 25, 27, 28, 28, 27, 24, 20, 17], wind: 15, storms: [5, 6, 7, 8, 9] },
  vsfb: { rain: [0.2, 0.22, 0.2, 0.1, 0.04, 0.01, 0.01, 0.01, 0.03, 0.07, 0.12, 0.18], temp: [12, 12, 13, 13, 14, 15, 16, 17, 17, 16, 14, 12], wind: 18, fog: [5, 6, 7, 8] },
  kourou: { rain: [0.65, 0.6, 0.6, 0.7, 0.8, 0.75, 0.6, 0.4, 0.2, 0.2, 0.35, 0.6], temp: [26, 26, 26, 27, 27, 27, 27, 28, 28, 28, 27, 26], wind: 12, storms: [3, 4, 5, 6] },
  mahia: { rain: [0.3, 0.3, 0.33, 0.35, 0.4, 0.42, 0.42, 0.4, 0.36, 0.35, 0.32, 0.32], temp: [19, 19, 18, 15, 13, 11, 10, 11, 12, 14, 16, 18], wind: 24 },
  wallops: { rain: [0.32, 0.32, 0.34, 0.33, 0.33, 0.31, 0.33, 0.31, 0.27, 0.24, 0.28, 0.32], temp: [3, 4, 8, 13, 18, 23, 26, 25, 22, 16, 11, 5], wind: 17, snow: [11, 0, 1] },
  sdsc: { rain: [0.05, 0.03, 0.03, 0.05, 0.1, 0.2, 0.3, 0.35, 0.35, 0.45, 0.5, 0.25], temp: [25, 27, 29, 31, 33, 33, 31, 30, 30, 28, 26, 25], wind: 13, storms: [9, 10] },
  kwaj: { rain: [0.35, 0.3, 0.35, 0.45, 0.6, 0.65, 0.7, 0.7, 0.7, 0.7, 0.65, 0.5], temp: [28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], wind: 22 },
};

/** Altura del Sol sobre el horizonte (grados) en un lugar y momento reales. Positiva = de día. */
export function sunElevationDeg(latDeg, lonDeg, date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos((2 * Math.PI * (day + 10)) / 365.24) * DEG; // inclinación del eje según la fecha
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const hourAngle = ((utcHours + lonDeg / 15 - 12) * 15) * DEG; // hora solar local
  const lat = latDeg * DEG;
  return Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)) / DEG;
}

const pad2 = (n) => String(n).padStart(2, '0');
function localClock(siteId, date) {
  const off = SITE_GEO[siteId]?.utc ?? 0;
  const d = new Date(date.getTime() + off * 3600000);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** Texto corto del estado del tiempo (según el código de la Organización Meteorológica Mundial). */
export function weatherLabel(w) {
  if (w.thunder) return simText("flight.thunderstorm");
  if (w.snow) return simText("flight.snow");
  if (w.rainMmH >= 4) return simText("flight.heavy-rain");
  if (w.rainMmH >= 0.8) return simText("flight.rain");
  if (w.rainMmH > 0) return simText("flight.drizzle");
  if (w.fog) return simText("flight.fog");
  if (w.cloud > 0.85) return simText("flight.overcast");
  if (w.cloud > 0.4) return simText("flight.partly-cloudy");
  return simText("flight.clear");
}

function finish(w) {
  w.cloud = clamp(w.cloud, 0, 1);
  w.label = weatherLabel(w);
  w.icon = w.thunder ? '⛈' : w.snow ? '🌨' : w.rainMmH > 0 ? '🌧' : w.fog ? '🌫' : w.cloud > 0.4 ? (w.isDay ? '⛅' : '☁') : w.isDay ? '☀' : '🌙';
  return w;
}

/** Convierte la respuesta de Open-Meteo (campo `current`) en el clima que dibuja el juego. */
export function parseOpenMeteo(json) {
  const c = json?.current;
  if (!c || typeof c.weather_code !== 'number') return null;
  const code = c.weather_code;
  const rain = Number(c.precipitation ?? c.rain ?? 0) || 0;
  const snow = (Number(c.snowfall ?? 0) || 0) > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86;
  return finish({
    source: 'real',
    sourceName: simText("flight.open-meteo-live-weather"),
    isDay: c.is_day !== 0,
    cloud: (Number(c.cloud_cover ?? 0) || 0) / 100,
    // si el código dice que llueve pero la última medición marca 0, se dibuja al menos llovizna
    rainMmH: snow ? 0 : Math.max(rain, (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 ? 0.3 : 0),
    snow,
    thunder: code >= 95,
    fog: code === 45 || code === 48,
    windKmh: Number(c.wind_speed_10m ?? 0) || 0,
    windDirDeg: Number(c.wind_direction_10m ?? 0) || 0,
    tempC: Number(c.temperature_2m ?? NaN),
    code,
    localTime: typeof c.time === 'string' ? c.time.slice(11, 16) : '',
  });
}

/**
 * Clima de respaldo cuando no hay conexión: día/noche real (posición del Sol ahora) + clima típico del mes.
 * `seed` decide, de forma repetible, si hoy "toca" un día lluvioso según la probabilidad del mes.
 */
export function typicalWeather(siteId, date = new Date(), seed = 1) {
  const geo = SITE_GEO[siteId] ?? SITE_GEO.ksc;
  const t = TYPICAL[siteId] ?? TYPICAL.ksc;
  const local = new Date(date.getTime() + geo.utc * 3600000);
  const m = local.getUTCMonth();
  const r1 = (Math.imul(seed | 0, 2654435761) >>> 0) / 4294967296;
  const r2 = (Math.imul((seed | 0) + 7919, 2246822519) >>> 0) / 4294967296;
  const rainy = r1 < t.rain[m];
  const cold = t.temp[m] <= 2;
  return finish({
    source: 'typical',
    sourceName: simText("flight.typical-weather-for-this-month-offline"),
    isDay: sunElevationDeg(geo.lat, geo.lon, date) > -3,
    cloud: rainy ? 0.9 : 0.15 + r2 * 0.5,
    rainMmH: rainy && !cold ? 0.6 + r2 * 3 : 0,
    snow: rainy && cold && (t.snow ?? []).includes(m),
    thunder: rainy && (t.storms ?? []).includes(m) && r2 > 0.55,
    fog: !rainy && (t.fog ?? []).includes(m) && r2 > 0.6,
    windKmh: t.wind * (0.6 + r2 * 0.8),
    windDirDeg: 90 + r1 * 180,
    tempC: t.temp[m] + (sunElevationDeg(geo.lat, geo.lon, date) > 0 ? 3 : -3),
    code: null,
    localTime: localClock(siteId, date),
  });
}

/** Dirección de la consulta de clima actual para un sitio (sólo lleva las coordenadas del sitio). */
export function weatherUrl(siteId) {
  const geo = SITE_GEO[siteId] ?? SITE_GEO.ksc;
  return `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current=temperature_2m,is_day,precipitation,rain,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,weather_code&timezone=auto`;
}

/** Clima real del sitio ahora; si no hay conexión (o tarda más de 4 s), el de respaldo. Nunca falla. */
export async function loadSiteWeather(siteId, { seed = 1, fetchFn = globalThis.fetch, timeoutMs = 4000 } = {}) {
  try {
    if (typeof fetchFn !== 'function') throw new Error(simText("flight.fetch-unavailable"));
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    const res = await fetchFn(weatherUrl(siteId), ctl ? { signal: ctl.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const w = parseOpenMeteo(await res.json());
    if (!w) throw new Error(simText("flight.no-weather-data-returned"));
    return w;
  } catch {
    return typicalWeather(siteId, new Date(), seed);
  }
}

/** Frase para la pantalla de la plataforma. */
export function describeWeather(w, siteName) {
  const temp = Number.isFinite(w.tempC) ? ` · ${Math.round(w.tempC)} °C` : '';
  const wind = simText("flight.wind-0-km-h", Math.round(w.windKmh));
  const when = `${w.isDay ? simText("flight.daytime") : simText("flight.nighttime")}${w.localTime ? simText("flight.0-local-time", w.localTime) : ''}`;
  return simText("flight.0-1-at-2-3-4-5-6", w.icon, w.source === 'real' ? simText("flight.live-weather") : simText("flight.weather"), siteName, w.label, temp, wind, when, w.sourceName);
}

/** Componente del viento hacia el este (m/s): la dirección de un parte meteorológico dice DE DÓNDE viene el viento. */
export const windEastMs = (w) => (-Math.sin((w.windDirDeg ?? 0) * DEG) * (w.windKmh ?? 0)) / 3.6;

/**
 * Clima para DIBUJAR a partir de las condiciones de una ventana de lanzamiento elegida en el planificador
 * (pronóstico de Meteomatics o modo simulación). El día o la noche salen de la posición real del Sol a esa hora.
 * @param c { tempC, windMs, windDirDeg, gustMs, precipMm, cloudPct, lightning, visibilityKm }
 */
export function weatherFromConditions(c, siteId, date, sourceName) {
  const geo = SITE_GEO[siteId] ?? SITE_GEO.ksc;
  const cold = Number.isFinite(c.tempC) && c.tempC <= 0.5;
  const precip = Number(c.precipMm ?? 0) || 0;
  return finish({
    source: 'window',
    sourceName,
    isDay: sunElevationDeg(geo.lat, geo.lon, date) > -3,
    cloud: Number.isFinite(c.cloudPct) ? c.cloudPct / 100 : precip > 0 ? 0.9 : 0.3,
    rainMmH: cold ? 0 : precip,
    snow: cold && precip > 0,
    thunder: (Number(c.lightning ?? 0) || 0) > 0,
    fog: Number.isFinite(c.visibilityKm) && c.visibilityKm < 1,
    windKmh: (Number(c.windMs ?? 0) || 0) * 3.6,
    windDirDeg: Number(c.windDirDeg ?? 0) || 0,
    tempC: Number(c.tempC ?? NaN),
    code: null,
    localTime: localClock(siteId, date),
  });
}
