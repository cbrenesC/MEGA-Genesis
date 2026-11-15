// Planificador de clima del lanzamiento: evalúa las ventanas de los próximos días con el pronóstico de Meteomatics
// y recomienda la mejor fecha y hora para despegar.
//
// IMPORTANTE: los umbrales de CRITERIA son CRITERIOS EDUCATIVOS SIMPLIFICADOS para este juego. NO son las reglas
// oficiales de lanzamiento de la NASA ni de ninguna agencia (las reales —"Launch Commit Criteria"— son mucho más
// detalladas y dependen de cada cohete). Se pueden ajustar aquí.
//
// Módulo sin Phaser ni DOM: se puede probar con Node. Los datos llegan por la función de Netlify
// (/.netlify/functions/meteomatics), que guarda las credenciales; aquí nunca hay credenciales.
// Si no hay datos reales se usa un MODO SIMULACIÓN, siempre marcado como tal (source: 'simulation').

import { TYPICAL, SITE_GEO, sunElevationDeg } from './weather.js';

export const GO = 'GO'; export const CAUTION = 'CAUTION'; export const NO_GO = 'NO-GO';
const RANK = { [GO]: 0, [CAUTION]: 1, [NO_GO]: 2 };

/**
 * Criterios (educativos, configurables). Cada factor:
 *   field   dato del pronóstico            weight  peso en la puntuación (0–100)
 *   go      hasta aquí es favorable        caution hasta aquí requiere revisión; más allá es NO-GO
 *   kind    'max' = mientras más bajo mejor · 'min' = mientras más alto mejor · 'range' = dentro de un rango
 *   noGo    false = este factor nunca llega a NO-GO por sí solo (sólo resta puntos)
 */
export const CRITERIA = {
  _about: 'Criterios educativos simplificados para el juego. No son reglas oficiales de NASA.',
  windowHours: 3,
  factors: [
    { id: 'gust', field: 'gustMs', fallbackField: 'windMs', unit: 'm/s', kind: 'max', go: 10, caution: 15, weight: 28 },
    { id: 'wind', field: 'windMs', unit: 'm/s', kind: 'max', go: 8, caution: 12, weight: 14 },
    { id: 'precip', field: 'precipMm', unit: 'mm/h', kind: 'max', go: 0.1, caution: 1, weight: 20 },
    { id: 'lightning', field: 'lightning', unit: '', kind: 'max', go: 0, caution: 0, weight: 16 },
    { id: 'precipProb', field: 'precipProbPct', unit: '%', kind: 'max', go: 20, caution: 50, weight: 6, noGo: false },
    { id: 'cloud', field: 'cloudPct', unit: '%', kind: 'max', go: 50, caution: 90, weight: 5, noGo: false },
    { id: 'visibility', field: 'visibilityKm', unit: 'km', kind: 'min', go: 8, caution: 3, weight: 6 },
    { id: 'temp', field: 'tempC', unit: '°C', kind: 'range', go: [5, 35], caution: [0, 38], weight: 5 },
  ],
  // Datos que se muestran pero no puntúan (informativos)
  info: ['humidityPct', 'pressureHpa', 'windDirDeg'],
  // Cómo influye la ventana elegida en la simulación (probabilidad de espera en la cuenta regresiva)
  delayRisk: { [GO]: 0.03, [CAUTION]: 0.3, [NO_GO]: 0.75 },
  // Ráfagas durante el ascenso: a partir de `fromMs` empujan al cohete; grados de desvío por cada m/s extra
  gusts: { fromMs: 9, degPerMs: 0.9, maxDeg: 12, maxCount: 3 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Evalúa un factor: { id, value, unit, status, score (0–1), available }. */
export function evaluateFactor(f, cond) {
  let value = num(cond[f.field]);
  let usedFallback = false;
  if (value == null && f.fallbackField) { value = num(cond[f.fallbackField]); usedFallback = value != null; }
  if (value == null) return { id: f.id, field: f.field, unit: f.unit, value: null, available: false, status: null, score: null, weight: f.weight };
  let status; let score;
  if (f.kind === 'range') {
    const [g0, g1] = f.go; const [c0, c1] = f.caution;
    if (value >= g0 && value <= g1) { status = GO; const mid = (g0 + g1) / 2; score = 1 - 0.25 * (Math.abs(value - mid) / ((g1 - g0) / 2)); }
    else if (value >= c0 && value <= c1) { status = CAUTION; const d = value < g0 ? (g0 - value) / (g0 - c0) : (value - g1) / (c1 - g1); score = 0.75 - 0.45 * d; }
    else { status = NO_GO; score = 0.1; }
  } else {
    // 'min' se convierte a "exceso": cuánto falta para llegar al mínimo
    const v = f.kind === 'min' ? Math.max(0, f.go - value) : value;
    const go = f.kind === 'min' ? 0 : f.go;
    const caution = f.kind === 'min' ? f.go - f.caution : f.caution;
    if (v <= go) { status = GO; score = go > 0 ? 1 - 0.25 * (v / go) : 1; }
    else if (v <= caution) { status = CAUTION; score = 0.75 - 0.45 * ((v - go) / Math.max(1e-9, caution - go)); }
    else { status = NO_GO; score = Math.max(0, 0.3 - 0.3 * ((v - caution) / Math.max(1e-9, caution || 1))); }
  }
  if (status === NO_GO && f.noGo === false) status = CAUTION;
  return { id: f.id, field: f.field, unit: f.unit, value, available: true, usedFallback, status, score: clamp(score, 0, 1), weight: f.weight };
}

/**
 * Evalúa las condiciones de una ventana. Devuelve { status, score 0–100, factors[], reasons[], unavailable[] }.
 * La puntuación es el promedio ponderado de los factores CON dato; los que no tienen dato se listan aparte y no
 * se inventan. El estado es el del peor factor.
 */
export function evaluateConditions(cond, criteria = CRITERIA) {
  const factors = criteria.factors.map((f) => evaluateFactor(f, cond));
  const have = factors.filter((f) => f.available);
  const unavailable = factors.filter((f) => !f.available).map((f) => f.id);
  if (!have.length) return { status: null, score: null, factors, reasons: [], unavailable };
  const wSum = have.reduce((a, f) => a + f.weight, 0);
  let score = (100 * have.reduce((a, f) => a + f.weight * f.score, 0)) / wSum;
  const status = have.reduce((worst, f) => (RANK[f.status] > RANK[worst] ? f.status : worst), GO);
  // la puntuación respeta el semáforo: un NO-GO nunca puntúa como una ventana buena
  if (status === NO_GO) score = Math.min(score, 39); else if (status === CAUTION) score = Math.min(score, 79);
  // razones: primero lo que frena (peor estado), luego lo mejor
  const reasons = [...have].sort((a, b) => RANK[b.status] - RANK[a.status] || a.score - b.score).filter((f) => f.status !== GO).map((f) => ({ id: f.id, status: f.status, value: f.value, unit: f.unit }));
  return { status, score: Math.round(score), factors, reasons, unavailable };
}

const WORST_MAX = ['gustMs', 'windMs', 'precipMm', 'precipProbPct', 'lightning', 'cloudPct'];

/**
 * Convierte las horas del pronóstico en ventanas de lanzamiento. Cada ventana dura `windowHours` y se evalúa con
 * lo PEOR que se espera dentro de ella (viento, lluvia, rayos) para no recomendar una hora que empeora enseguida.
 */
export function buildWindows(hours, { criteria = CRITERIA, now = new Date(), siteId = 'ksc' } = {}) {
  const list = [...hours].filter((h) => h && typeof h.time === 'string').sort((a, b) => a.time.localeCompare(b.time));
  const geo = SITE_GEO[siteId] ?? SITE_GEO.ksc;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const start = new Date(list[i].time);
    if (Number.isNaN(start.getTime()) || start.getTime() < now.getTime() - 3600000) continue; // ventanas ya pasadas
    const end = start.getTime() + criteria.windowHours * 3600000;
    const inside = list.filter((h) => { const t = new Date(h.time).getTime(); return t >= start.getTime() && t <= end; });
    const cond = { ...list[i] };
    for (const key of WORST_MAX) { const vals = inside.map((h) => num(h[key])).filter((v) => v != null); if (vals.length) cond[key] = Math.max(...vals); }
    const vis = inside.map((h) => num(h.visibilityKm)).filter((v) => v != null); if (vis.length) cond.visibilityKm = Math.min(...vis);
    delete cond.time;
    const ev = evaluateConditions(cond, criteria);
    if (ev.status == null) continue; // sin ningún dato: no se ofrece (no se inventa)
    out.push({ time: list[i].time, isDay: sunElevationDeg(geo.lat, geo.lon, start) > -3, conditions: cond, ...ev });
  }
  return out;
}

/** La mejor ventana: primero por semáforo (GO > CAUTION > NO-GO), luego por puntuación, y si empatan, la más próxima. */
export function recommendWindow(windows) {
  if (!windows.length) return null;
  return [...windows].sort((a, b) => RANK[a.status] - RANK[b.status] || b.score - a.score || a.time.localeCompare(b.time))[0];
}

/** Mejor ventana de cada día (para una lista corta), en hora local del sitio. */
export function bestPerDay(windows, siteId = 'ksc') {
  const off = (SITE_GEO[siteId]?.utc ?? 0) * 3600000;
  const days = new Map();
  for (const w of windows) {
    const day = new Date(new Date(w.time).getTime() + off).toISOString().slice(0, 10);
    const cur = days.get(day);
    if (!cur || RANK[w.status] < RANK[cur.status] || (w.status === cur.status && w.score > cur.score)) days.set(day, w);
  }
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, w]) => ({ day, ...w }));
}

/** Fecha y hora local del sitio para mostrar ("2026-11-16", "14:00"). */
export function siteLocal(time, siteId = 'ksc') {
  const d = new Date(new Date(time).getTime() + (SITE_GEO[siteId]?.utc ?? 0) * 3600000);
  return { date: d.toISOString().slice(0, 10), clock: d.toISOString().slice(11, 16), weekday: d.getUTCDay() };
}

// ---------------------------------------------------------------------------
// Datos: función de Netlify (Meteomatics) con caché, o modo simulación
// ---------------------------------------------------------------------------

export const FORECAST_ENDPOINT = '/.netlify/functions/meteomatics';
const CACHE_MS = 30 * 60 * 1000; // el pronóstico real se reutiliza 30 minutos
const RETRY_MS = 2 * 60 * 1000; // tras un fallo no se vuelve a pedir hasta pasados 2 minutos
const memory = new Map();
const storeKey = (site) => `megaGenesis.launchWeather.v1.${site}`;

/**
 * Pronóstico SIMULADO (no real): se arma con el clima típico del mes en ese sitio y una secuencia repetible.
 * Sólo se usa cuando Meteomatics no está disponible y siempre va marcado con source: 'simulation'.
 */
export function simulatedForecast(siteId, now = new Date(), { days = 7, stepHours = 3, seed = 20240 } = {}) {
  const t = TYPICAL[siteId] ?? TYPICAL.ksc;
  const geo = SITE_GEO[siteId] ?? SITE_GEO.ksc;
  let s = (seed ^ (siteId.length * 2654435761)) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const start = new Date(Math.floor(now.getTime() / 3600000) * 3600000);
  const hours = [];
  let rainLeft = 0; let wind = (t.wind / 3.6) * (0.7 + rnd() * 0.6);
  for (let i = 0; i <= (days * 24) / stepHours; i++) {
    const time = new Date(start.getTime() + i * stepHours * 3600000);
    const local = new Date(time.getTime() + geo.utc * 3600000);
    const m = local.getUTCMonth();
    if (rainLeft <= 0 && rnd() < (t.rain[m] * stepHours) / 24 * 1.6) rainLeft = 1 + Math.floor(rnd() * 3);
    const raining = rainLeft > 0; if (raining) rainLeft--;
    wind = clamp(wind + (rnd() - 0.5) * 3, 0.5, (t.wind / 3.6) * 2.6);
    const sun = sunElevationDeg(geo.lat, geo.lon, time);
    const storm = raining && (t.storms ?? []).includes(m) && rnd() > 0.6;
    hours.push({
      time: `${time.toISOString().slice(0, 13)}:00:00Z`,
      tempC: Math.round((t.temp[m] + clamp(sun / 12, -4, 5)) * 10) / 10,
      windMs: Math.round((wind + (raining ? 2 : 0)) * 10) / 10,
      windDirDeg: Math.round(rnd() * 360),
      gustMs: Math.round((wind * (1.4 + rnd() * 0.5) + (storm ? 6 : raining ? 3 : 0)) * 10) / 10,
      precipMm: raining ? Math.round((0.3 + rnd() * (storm ? 8 : 3)) * 10) / 10 : 0,
      precipProbPct: raining ? 70 + Math.round(rnd() * 25) : Math.round(t.rain[m] * 40 * rnd()),
      humidityPct: Math.round(clamp(55 + t.rain[m] * 35 + (raining ? 15 : 0) - sun / 6, 20, 100)),
      pressureHpa: Math.round(1013 - (raining ? 6 : 0) + (rnd() - 0.5) * 6),
      cloudPct: raining ? 85 + Math.round(rnd() * 15) : Math.round(rnd() * 60),
      lightning: storm ? 1 + Math.floor(rnd() * 4) : 0,
      visibilityKm: raining ? 6 + Math.round(rnd() * 6) : 20 + Math.round(rnd() * 30),
    });
  }
  return { source: 'simulation', site: siteId, generatedAt: now.toISOString(), stepHours, days, hours, unavailable: [] };
}

const valid = (f) => f && Array.isArray(f.hours) && f.hours.length > 0 && typeof f.source === 'string';

/**
 * Pronóstico del sitio. Pide los datos reales UNA vez y los guarda (memoria + sessionStorage, 30 min); nunca se
 * llama en el bucle de Phaser. Si falla, devuelve el modo simulación con el motivo en `reason`
 * ('credentials' | 'rate-limit' | 'auth' | 'network' | 'timeout' | 'upstream' | 'empty' | 'offline').
 */
export async function loadForecast(siteId, { fetchFn = globalThis.fetch, storage = globalThis.sessionStorage, now = new Date(), endpoint = FORECAST_ENDPOINT, force = false } = {}) {
  const fresh = (e) => e && now.getTime() - e.at < (e.data.source === 'meteomatics' ? CACHE_MS : RETRY_MS);
  if (!force) {
    const m = memory.get(siteId);
    if (fresh(m)) return m.data;
    try { const raw = storage?.getItem(storeKey(siteId)); const e = raw ? JSON.parse(raw) : null; if (e && valid(e.data) && fresh(e)) { memory.set(siteId, e); return e.data; } } catch { /* sin almacenamiento */ }
  }
  let data; let reason = 'network';
  try {
    if (typeof fetchFn !== 'function') throw new Error('offline');
    const res = await fetchFn(`${endpoint}?site=${encodeURIComponent(siteId)}&days=7&step=3`, { headers: { accept: 'application/json' } });
    const type = res.headers?.get?.('content-type') ?? '';
    const body = type.includes('json') ? await res.json() : null; // en desarrollo sin funciones llega HTML: no es un pronóstico
    if (res.ok && valid(body) && body.source === 'meteomatics') data = body;
    else reason = body?.error ?? (res.status === 429 ? 'rate-limit' : res.status === 404 || !body ? 'offline' : 'upstream');
  } catch (err) { reason = err?.name === 'AbortError' ? 'timeout' : 'network'; }
  if (!data) data = { ...simulatedForecast(siteId, now), reason };
  const entry = { at: now.getTime(), data };
  memory.set(siteId, entry);
  try { storage?.setItem(storeKey(siteId), JSON.stringify(entry)); } catch { /* cupo lleno o modo privado */ }
  return data;
}

export function clearForecastCache() { memory.clear(); }

// ---------------------------------------------------------------------------
// Cómo influye la ventana elegida en la simulación
// ---------------------------------------------------------------------------

/** Probabilidad de que el clima obligue a esperar en la cuenta regresiva, según el semáforo de la ventana. */
export function windowDelayRisk(status, criteria = CRITERIA) {
  return criteria.delayRisk[status] ?? null;
}

/**
 * Ráfagas de viento que sufrirá el cohete al subir por el aire, según el viento de la ventana elegida.
 * Devuelve eventos para FlightSim ({ kind: 'gust', atT, deg }): más viento = más empujones y más fuertes.
 */
export function windowGustEvents(conditions, rng = Math.random, criteria = CRITERIA) {
  const g = criteria.gusts;
  const gust = num(conditions?.gustMs) ?? num(conditions?.windMs);
  if (gust == null || gust <= g.fromMs) return [];
  const extra = gust - g.fromMs;
  const count = clamp(Math.ceil(extra / 4), 1, g.maxCount);
  const events = [];
  for (let i = 0; i < count; i++) {
    const deg = Math.round(clamp(extra * g.degPerMs * (0.7 + rng() * 0.6), 2, g.maxDeg) * 10) / 10 * (rng() < 0.5 ? -1 : 1);
    events.push({ kind: 'gust', atT: Math.round(22 + i * 16 + rng() * 10), deg, meta: { id: 'windGust', phase: 'maxq', label: 'Ráfaga de viento', severity: 'minor', explain: `En la ventana elegida se esperaban ráfagas de ${Math.round(gust)} m/s.` } });
  }
  return events;
}
