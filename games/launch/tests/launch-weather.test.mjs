// Pruebas del planificador de clima del lanzamiento (Meteomatics): evaluación GO / CAUTION / NO-GO, mejor ventana,
// lectura de la API, caché, modo simulación e influencia en el vuelo.
// Ejecutar desde la raíz del repo:  node --test games/launch/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GO, CAUTION, NO_GO, CRITERIA, evaluateConditions, buildWindows, recommendWindow, bestPerDay, siteLocal,
  simulatedForecast, loadForecast, clearForecastCache, windowDelayRisk, windowGustEvents,
} from '../js/launchWeather.js';
import { weatherFromConditions } from '../js/weather.js';
import { normalize, buildUrl, PARAMETERS, MAX_PARAMS } from '../../../netlify/functions/meteomatics.mjs';

const calm = { tempC: 22, windMs: 3, windDirDeg: 90, gustMs: 6, precipMm: 0, precipProbPct: 5, humidityPct: 60, pressureHpa: 1018, cloudPct: 10, lightning: 0, visibilityKm: 40 };

test('semáforo: GO con buen tiempo, CAUTION con viento moderado, NO-GO con rayos, lluvia fuerte o mucho viento', () => {
  const good = evaluateConditions(calm);
  assert.equal(good.status, GO); assert.ok(good.score >= 85 && good.score <= 100); assert.equal(good.reasons.length, 0);
  const windy = evaluateConditions({ ...calm, gustMs: 12.5 });
  assert.equal(windy.status, CAUTION); assert.ok(windy.score <= 79 && windy.score > 39); assert.equal(windy.reasons[0].id, 'gust');
  for (const bad of [{ lightning: 2 }, { precipMm: 4 }, { gustMs: 22 }, { visibilityKm: 1 }, { tempC: -8 }]) {
    const r = evaluateConditions({ ...calm, ...bad });
    assert.equal(r.status, NO_GO, JSON.stringify(bad)); assert.ok(r.score <= 39);
  }
  // nubes y probabilidad de lluvia restan puntos pero nunca dan NO-GO por sí solas
  assert.equal(evaluateConditions({ ...calm, cloudPct: 100, precipProbPct: 95 }).status, CAUTION);
  // peor tiempo = menos puntos
  assert.ok(evaluateConditions({ ...calm, gustMs: 9 }).score < good.score);
});

test('datos faltantes: no se inventan; el factor queda "sin dato" y la puntuación usa sólo lo que hay', () => {
  const { lightning, visibilityKm, gustMs, ...partial } = calm;
  const r = evaluateConditions(partial);
  assert.deepEqual(r.unavailable.sort(), ['lightning', 'visibility']);
  assert.equal(r.status, GO);
  assert.equal(r.factors.find((f) => f.id === 'gust').usedFallback, true, 'sin ráfagas se usa el viento sostenido');
  assert.equal(evaluateConditions({}).status, null);
  assert.ok(CRITERIA._about.includes('No son reglas oficiales de NASA'));
});

test('ventanas: se evalúa lo peor dentro de la ventana, se descartan las pasadas y se recomienda la mejor', () => {
  const now = new Date('2026-11-16T00:00:00Z');
  const at = (h, extra = {}) => ({ time: new Date(now.getTime() + h * 3600000).toISOString().replace('.000Z', 'Z'), ...calm, ...extra });
  const hours = [at(-6), at(0, { gustMs: 13 }), at(3), at(6, { precipMm: 5 }), at(9), at(12, { gustMs: 4, cloudPct: 0 }), at(15, { gustMs: 4, cloudPct: 0 })];
  const w = buildWindows(hours, { now, siteId: 'ksc' });
  assert.equal(w.length, 6, 'la ventana de hace 6 horas ya pasó');
  assert.equal(w[0].status, CAUTION);
  assert.equal(w[1].status, NO_GO, 'la ventana de las +3 h incluye la lluvia fuerte de las +6 h');
  assert.equal(w[1].conditions.precipMm, 5);
  const best = recommendWindow(w);
  assert.equal(best.status, GO); assert.equal(best.time, hours[5].time, 'gana la de menos viento');
  assert.equal(recommendWindow([]), null);
  const days = bestPerDay(w, 'ksc');
  assert.ok(days.length >= 1 && days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day)));
  assert.deepEqual(siteLocal('2026-11-16T19:00:00Z', 'ksc'), { date: '2026-11-16', clock: '14:00', weekday: 1 });
  // empate: gana la ventana más próxima
  const tie = recommendWindow(buildWindows([at(3), at(6), at(9)], { now, siteId: 'ksc' }));
  assert.equal(tie.time, at(3).time);
});

test('API de Meteomatics: dirección de la consulta, lectura de la respuesta y valores "sin dato"', () => {
  const url = buildUrl({ lat: 28.57, lon: -80.65 }, PARAMETERS.slice(0, MAX_PARAMS), new Date('2026-11-15T22:40:00Z'), 7, 3);
  assert.ok(url.startsWith('https://api.meteomatics.com/2026-11-15T22:00:00Z--2026-11-22T22:00:00Z:PT3H/t_2m:C,wind_speed_10m:ms,'));
  assert.ok(url.endsWith('/28.57,-80.65/json'));
  assert.equal(MAX_PARAMS, 10); assert.ok(url.split('/')[4].split(',').length <= MAX_PARAMS);
  for (const key of ['tempC', 'windMs', 'windDirDeg', 'gustMs', 'precipMm', 'humidityPct', 'pressureHpa']) assert.ok(PARAMETERS.some((p) => p.key === key), key);
  const series = (parameter, values) => ({ parameter, coordinates: [{ lat: 28.57, lon: -80.65, dates: values.map(([date, value]) => ({ date, value })) }] });
  const hours = normalize({ status: 'OK', data: [
    series('t_2m:C', [['2026-11-16T00:00:00Z', 21.8], ['2026-11-16T03:00:00Z', 20.1]]),
    series('wind_gusts_10m_1h:ms', [['2026-11-16T00:00:00Z', 6.8], ['2026-11-16T03:00:00Z', -999]]),
    series('otro_parametro:x', [['2026-11-16T00:00:00Z', 1]]),
  ] }, PARAMETERS);
  assert.deepEqual(hours, [{ time: '2026-11-16T00:00:00Z', tempC: 21.8, gustMs: 6.8 }, { time: '2026-11-16T03:00:00Z', tempC: 20.1 }]);
  assert.deepEqual(normalize({}, PARAMETERS), []);
});

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const reply = (status, body, type = 'application/json') => ({ ok: status >= 200 && status < 300, status, headers: { get: () => type }, json: async () => body });

test('caché y fallos: una sola consulta por sitio; si la API no está, modo simulación claramente marcado', async () => {
  const now = new Date('2026-11-16T00:00:00Z');
  const real = { source: 'meteomatics', site: 'ksc', hours: [{ time: '2026-11-16T03:00:00Z', ...calm }], unavailable: [] };
  let calls = 0;
  clearForecastCache();
  const storage = fakeStorage();
  const ok = async () => { calls++; return reply(200, real); };
  const a = await loadForecast('ksc', { fetchFn: ok, storage, now });
  const b = await loadForecast('ksc', { fetchFn: ok, storage, now: new Date(now.getTime() + 10 * 60000) });
  assert.equal(a.source, 'meteomatics'); assert.equal(b.source, 'meteomatics'); assert.equal(calls, 1, 'la segunda vez sale de la caché');
  clearForecastCache();
  await loadForecast('ksc', { fetchFn: ok, storage, now: new Date(now.getTime() + 20 * 60000) });
  assert.equal(calls, 1, 'tras recargar la página, sale de sessionStorage');
  await loadForecast('ksc', { fetchFn: ok, storage, now: new Date(now.getTime() + 45 * 60000) });
  assert.equal(calls, 2, 'pasados 30 minutos se vuelve a pedir');

  const cases = [
    [async () => reply(503, { error: 'credentials' }), 'credentials'],
    [async () => reply(429, { error: 'rate-limit' }), 'rate-limit'],
    [async () => reply(200, '<html>', 'text/html'), 'offline'],
    [async () => { throw new Error('sin red'); }, 'network'],
    [async () => reply(200, { source: 'meteomatics', hours: [] }), 'upstream'],
  ];
  for (const [fetchFn, reason] of cases) {
    clearForecastCache();
    const f = await loadForecast('kourou', { fetchFn, storage: fakeStorage(), now });
    assert.equal(f.source, 'simulation', reason); assert.equal(f.reason, reason);
    assert.ok(f.hours.length > 40 && buildWindows(f.hours, { now, siteId: 'kourou' }).length > 40);
  }
  const s1 = simulatedForecast('ksc', now); const s2 = simulatedForecast('ksc', now);
  assert.deepEqual(s1.hours, s2.hours, 'la simulación es repetible');
  assert.equal(s1.source, 'simulation');
});

test('influencia en el vuelo: el semáforo cambia la espera por clima y el viento fuerte da ráfagas', () => {
  assert.ok(windowDelayRisk(GO) < windowDelayRisk(CAUTION) && windowDelayRisk(CAUTION) < windowDelayRisk(NO_GO));
  assert.equal(windowDelayRisk('otra'), null);
  let s = 7; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  assert.deepEqual(windowGustEvents({ ...calm, gustMs: 6 }, rng), []);
  const mild = windowGustEvents({ ...calm, gustMs: 11 }, rng); const strong = windowGustEvents({ ...calm, gustMs: 21 }, rng);
  assert.ok(mild.length >= 1 && strong.length > mild.length && strong.length <= CRITERIA.gusts.maxCount);
  for (const e of strong) { assert.equal(e.kind, 'gust'); assert.ok(Math.abs(e.deg) <= CRITERIA.gusts.maxDeg && e.atT > 15 && e.meta.id === 'windGust'); }
  assert.ok(Math.max(...strong.map((e) => Math.abs(e.deg))) > Math.max(...mild.map((e) => Math.abs(e.deg))));
  // y lo que se ve: de noche si a esa hora es de noche en el sitio, con lluvia si se pronostica lluvia
  const night = weatherFromConditions({ ...calm, precipMm: 2, cloudPct: 95 }, 'ksc', new Date('2026-11-16T06:00:00Z'), 'x');
  const day = weatherFromConditions(calm, 'ksc', new Date('2026-11-16T17:00:00Z'), 'x');
  assert.equal(night.isDay, false); assert.equal(night.label, 'lluvia'); assert.equal(day.isDay, true); assert.equal(day.label, 'despejado');
  assert.equal(weatherFromConditions({ ...calm, lightning: 3 }, 'ksc', new Date(), 'x').thunder, true);
});
