// Netlify Function: intermediario entre el juego y la Meteomatics Weather API.
//
//   GET /.netlify/functions/meteomatics?site=ksc[&days=7][&step=3]
//
// Por qué existe: las credenciales de Meteomatics (METEOMATICS_USERNAME / METEOMATICS_PASSWORD, variables de
// entorno de Netlify) nunca deben llegar al navegador. El juego llama a esta función y ella llama a Meteomatics.
//
// Seguridad y cuidado del cupo (la cuenta de NASA Space Apps permite 1.000 consultas por día):
//   · sólo acepta sitios de lanzamiento conocidos (las coordenadas están aquí, no las manda el cliente):
//     no sirve como proxy abierto;
//   · dos consultas a Meteomatics (máximo 10 parámetros cada una) traen todas las horas del pronóstico;
//   · la respuesta se guarda 30 minutos en memoria y se marca como cacheable para el navegador y la CDN.
//
// API de Meteomatics (documentación: https://www.meteomatics.com/en/api/getting-started/):
//   https://api.meteomatics.com/{inicio}--{fin}:PT{n}H/{parámetros}/{lat},{lon}/json   (autenticación HTTP Basic)
// Respuesta: { data: [ { parameter, coordinates: [ { dates: [ { date, value } ] } ] } ] }

const SITES = {
  ksc: { lat: 28.57, lon: -80.65 },
  vsfb: { lat: 34.63, lon: -120.61 },
  kourou: { lat: 5.24, lon: -52.77 },
  mahia: { lat: -39.26, lon: 177.86 },
  wallops: { lat: 37.94, lon: -75.47 },
  sdsc: { lat: 13.72, lon: 80.23 },
  kwaj: { lat: 9.05, lon: 167.74 },
};

// campo del juego → parámetro de Meteomatics (con su unidad). `required` = sin él no hay planificador.
export const PARAMETERS = [
  { key: 'tempC', param: 't_2m:C', required: true },
  { key: 'windMs', param: 'wind_speed_10m:ms', required: true },
  { key: 'windDirDeg', param: 'wind_dir_10m:d' },
  { key: 'gustMs', param: 'wind_gusts_10m_1h:ms' },
  { key: 'precipMm', param: 'precip_1h:mm', required: true },
  { key: 'precipProbPct', param: 'prob_precip_1h:p' },
  { key: 'humidityPct', param: 'relative_humidity_2m:p' },
  { key: 'pressureHpa', param: 'msl_pressure:hPa' },
  { key: 'cloudPct', param: 'total_cloud_cover:p' },
  { key: 'lightning', param: 'lightning_strikes_10km_1h:x' },
  { key: 'visibilityKm', param: 'visibility:km' },
];

export const MAX_PARAMS = 10; // límite de la cuenta de NASA Space Apps: 10 parámetros por consulta (comprobado)
const CACHE_MS = 30 * 60 * 1000;
const cache = new Map(); // clave → { at, body }

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': status === 200 ? 'public, max-age=900, s-maxage=1800' : 'no-store', ...extra },
});

const isoHour = (d) => `${d.toISOString().slice(0, 13)}:00:00Z`;

/** Arma la dirección de la consulta. Se exporta para probarla. */
export function buildUrl(site, params, start, days, stepHours) {
  const end = new Date(start.getTime() + days * 86400000);
  return `https://api.meteomatics.com/${isoHour(start)}--${isoHour(end)}:PT${stepHours}H/${params.map((p) => p.param).join(',')}/${site.lat},${site.lon}/json`;
}

/** Convierte la respuesta de Meteomatics en una lista de horas { time, tempC, windMs, … }. Se exporta para probarla. */
export function normalize(payload, params) {
  const hours = new Map();
  for (const series of payload?.data ?? []) {
    const def = params.find((p) => p.param === series.parameter);
    if (!def) continue;
    for (const { date, value } of series.coordinates?.[0]?.dates ?? []) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= -666) continue; // −666 / −999 = "sin dato" en Meteomatics
      if (!hours.has(date)) hours.set(date, { time: date });
      hours.get(date)[def.key] = value;
    }
  }
  return [...hours.values()].sort((a, b) => a.time.localeCompare(b.time));
}

export default async (request) => {
  if (request.method !== 'GET') return json(405, { error: 'method', message: 'Sólo GET.' });
  const url = new URL(request.url);
  const siteId = url.searchParams.get('site') ?? '';
  const site = SITES[siteId];
  if (!site) return json(400, { error: 'site', message: 'Sitio de lanzamiento desconocido.' });
  const days = Math.min(10, Math.max(1, Number.parseInt(url.searchParams.get('days') ?? '7', 10) || 7));
  const stepHours = [1, 3, 6].includes(Number(url.searchParams.get('step'))) ? Number(url.searchParams.get('step')) : 3;

  const user = process.env.METEOMATICS_USERNAME;
  const pass = process.env.METEOMATICS_PASSWORD;
  if (!user || !pass) return json(503, { error: 'credentials', message: 'Faltan METEOMATICS_USERNAME y METEOMATICS_PASSWORD en las variables de entorno.' });

  const key = `${siteId}|${days}|${stepHours}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(200, { ...hit.body, cached: true });

  const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  const start = new Date();
  const fail = (status, error, message, extra) => Object.assign(new Error(message), { reply: json(status, { error, message }, extra) });

  /** Una consulta a Meteomatics con un grupo de parámetros (máximo MAX_PARAMS). Devuelve { hours, unavailable }. */
  const fetchGroup = async (group) => {
    let params = [...group];
    const unavailable = [];
    // Si la cuenta no incluye algún parámetro, Meteomatics responde 404 nombrándolo: se quita y se reintenta.
    for (let attempt = 0; attempt <= group.length && params.length; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 9000);
      let res;
      try { res = await fetch(buildUrl(site, params, start, days, stepHours), { headers: { authorization: auth, accept: 'application/json' }, signal: ctl.signal }); } finally { clearTimeout(timer); }
      if (res.ok) return { hours: normalize(await res.json(), params), unavailable };
      const text = (await res.text()).slice(0, 400);
      if (res.status === 401 || (res.status === 403 && !/parameters/i.test(text))) throw fail(502, 'auth', 'Meteomatics rechazó las credenciales (¿vencieron?).');
      if (res.status === 429) throw fail(429, 'rate-limit', 'Se alcanzó el límite de consultas de Meteomatics. Prueba más tarde.', { 'retry-after': res.headers.get('retry-after') ?? '600' });
      const missing = res.status === 404 || res.status === 400 ? params.find((p) => text.includes(p.param) || text.includes(p.param.split(':')[0])) : null;
      if (missing && !missing.required) { unavailable.push(missing.key); params = params.filter((p) => p !== missing); continue; }
      throw fail(502, 'upstream', 'Meteomatics respondió con un error.');
    }
    return { hours: [], unavailable };
  };

  try {
    // La cuenta acepta como máximo MAX_PARAMS parámetros por consulta: se piden en grupos y se unen por hora.
    const groups = [];
    for (let i = 0; i < PARAMETERS.length; i += MAX_PARAMS) groups.push(PARAMETERS.slice(i, i + MAX_PARAMS));
    const results = await Promise.all(groups.map(fetchGroup));
    const byTime = new Map();
    for (const r of results) for (const h of r.hours) byTime.set(h.time, { ...(byTime.get(h.time) ?? {}), ...h });
    const hours = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
    if (!hours.length) return json(502, { error: 'empty', message: 'Meteomatics no devolvió pronóstico para ese sitio.' });
    const body = { source: 'meteomatics', site: siteId, lat: site.lat, lon: site.lon, generatedAt: new Date().toISOString(), stepHours, days, hours, unavailable: results.flatMap((r) => r.unavailable) };
    cache.set(key, { at: Date.now(), body });
    return json(200, body);
  } catch (err) {
    if (err?.reply) return err.reply;
    return json(504, { error: err?.name === 'AbortError' ? 'timeout' : 'network', message: 'No se pudo conectar con Meteomatics.' });
  }
};
