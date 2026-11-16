import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import en from '../src/i18n/en.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };
import { CREW } from '../src/crew/roster.js';
import { MEDALS } from '../src/medals/progress.js';
import { catalogLanguage, localizedNumber, setCatalogLanguage } from '../src/i18n/catalog.js';
import { localizeLaunchData } from '../games/launch/js/localizeData.js';
import { reviewFlightPlan } from '../src/missions/flightPlan.js';
import { missionUrl } from '../src/missions/missionTransfer.js';
import { renderLaunchStation } from '../src/missions/launchStationUI.js';

const parameters = (value) => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();

test('both catalogs contain the same keys and interpolation parameters', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.trim(), key);
    assert.ok(es[key].trim(), key);
    assert.deepEqual(parameters(value), parameters(es[key]), key);
  }
});

function scan(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? scan(path) : /\.(html|js)$/.test(path) ? [path] : [];
  });
}

test('static UI references use valid translation keys', () => {
  const attribute = /data-i18n(?:-aria|-title|-alt|-content|-label)?="([^"]+)"/g;
  const call = /\b(t|simText|showNotice|setLoadingStatus|message|addLabel|addRoomPlaque|addSectorTag)\(\s*(['"])([a-z]\w*(?:\.[\w-]+)+)\2/g;
  for (const file of ['index.html', ...scan('src'), ...scan('games')]) {
    const text = readFileSync(file, 'utf8');
    const keys = [
      ...[...text.matchAll(attribute)].map(([, key]) => key),
      ...[...text.matchAll(call)].map(([, fn, , key]) => fn === 'simText' ? `sim.${key}` : key),
    ];
    for (const key of keys) assert.ok(Object.hasOwn(en, key), `${file}: ${key}`);
  }
  for (const id of ['objectives', 'requirements', 'architecture', 'design', 'systems', 'testing', 'ground', 'operations', 'launch', 'rover']) {
    for (const suffix of ['title', 'text']) assert.ok(Object.hasOwn(en, `lesson.${id}.${suffix}`));
  }
  for (let i = 1; i <= 14; i++) assert.ok(Object.hasOwn(en, 'briefing.cue' + String(i).padStart(2, '0')));
  for (const medal of MEDALS) {
    assert.ok(Object.hasOwn(en, `medals.name.${medal.id}`));
    if (medal.stationNameKey) assert.ok(Object.hasOwn(en, medal.stationNameKey));
    if (!medal.stationNameKey || ['launch', 'rover'].includes(medal.id)) {
      assert.ok(Object.hasOwn(en, `medals.requirement.${medal.id}`));
    }
  }
});

const loadFlightData = name => JSON.parse(readFileSync(new URL(`../games/launch/data/${name}.json`, import.meta.url)));
const flightData = {
  mocks: loadFlightData('mock-missions'), launchers: loadFlightData('launchers').launchers,
  sites: loadFlightData('sites').sites, orbits: loadFlightData('orbits').orbits,
  rules: loadFlightData('rules'), flight: loadFlightData('flight'), calibration: loadFlightData('flight-calibration'),
};

test('catalogs cover names and references in the launch data, including alternate transfer stages', () => {
  const keys = [];
  for (const launcher of flightData.launchers) {
    keys.push(`flightData.rocket.${launcher.id}.name`);
    for (const field of Object.keys(launcher.sources)) {
      keys.push(`flightData.rocket.${launcher.id}.sources.${field}`, `sim.station.source-field.${field}`);
    }
    for (const quality of Object.values(launcher.dataQuality)) keys.push(`sim.station.source-quality.${quality}`);
  }
  for (const site of flightData.sites) keys.push(`flightData.site.${site.id}.name`);
  for (const scenario of flightData.mocks.scenarios) keys.push(`flightData.mock.${scenario.id}.label`);
  for (const vehicle of Object.values(flightData.flight.vehicles)) {
    for (const stage of [...(vehicle.stages ?? []), ...(vehicle.transferStages ?? [])]) {
      keys.push(`flightData.stage.${stage.nameKey}`);
    }
  }
  for (const key of keys) for (const catalog of [en, es]) assert.ok(Object.hasOwn(catalog, key), key);
});

test('rocket catalog, review and flight budget render cleanly in both languages', async () => {
  globalThis.location ??= { href: 'https://example.test/?lang=es' };
  globalThis.document ??= { cookie: '' };
  const { app } = await import('../games/launch/js/store.js');
  const { renderResources } = await import('../games/launch/js/screens.js');
  const original = catalogLanguage();
  const plan = { scenarioId: 'moonReturn', launcherId: 'falcon9', difficulty: 'facil', teamMode: true };
  try {
    for (const [locale, catalog] of [['en', en], ['es', es]]) {
      setCatalogLanguage(locale);
      const data = localizeLaunchData(flightData);
      const view = reviewFlightPlan(data, plan);
      const context = { data, plan, view, translate: key => catalog[key] };
      Object.assign(app, { data, resolved: view.resolved, evaluations: view.evaluations, selectedId: 'falcon9' });
      const budget = renderResources();
      const station = renderLaunchStation('review', context, '');
      const rockets = renderLaunchStation('vehicle', context, '');
      assert.match(budget, /<span>Total<\/span>/);
      assert.doesNotMatch(budget + station + rockets, /(?:sim\.(?:flight|station)\.|availabilityMonths)/);
      assert.ok(station.includes(catalog['flightData.rocket.falcon9.sources.costMUSD']));
      assert.ok(station.includes(catalog['sim.flight.role.spacecraft']));
      assert.ok(rockets.includes(catalog['sim.station.choose-your-rocket']));
      assert.ok(budget.includes(catalog['sim.flight.schedule']));
      assert.equal(data.flight.vehicles.electron.transferStages.at(-1).name, catalog['flightData.stage.transfer-photon']);
      assert.equal(localizedNumber(1.25, 2), locale === 'en' ? '1.25' : '1,25');
      assert.equal(new URL(missionUrl('launch', locale, plan), 'https://example.test').searchParams.get('lang'), locale);
      assert.equal(new URL(missionUrl('rover', locale, {}), 'https://example.test').searchParams.get('lang'), locale);
    }
  } finally {
    setCatalogLanguage(original);
  }
});

test('the renamed crew retain distinct roles and short patrol routes', () => {
  assert.deepEqual(Object.fromEntries(CREW.map(({ id, name }) => [id, name])), {
    kade: 'Durman', rios: 'Josué', vega: 'Luis Eduardo', sol: 'Johana',
  });
  for (const { route } of CREW) {
    assert.ok(route.length >= 2);
    assert.equal(new Set(route.map(point => point.join(','))).size, route.length);
  }
});

test('each crew member has a role and three briefing sentences in both languages', () => {
  assert.equal(CREW.length, 4);
  assert.equal(new Set(CREW.map(member => member.id)).size, CREW.length);
  for (const { id, source } of CREW) {
    assert.match(new URL(source).hostname, /(^|\.)nasa\.gov$/);
    for (const catalog of [en, es]) {
      assert.ok(catalog[`crew.${id}.role`]);
      assert.equal(catalog[`crew.${id}.text`].split(/(?<=[.!?])\s+/).length, 3, id);
    }
  }
});

test('language changes update text, accessibility labels and links without storage consent', async () => {
  const attributes = new Map([['href', '/games/launch/?difficulty=normal#simulator'], ['data-locale-link', '']]);
  const node = {
    dataset: { i18n: 'common.startMission', i18nAria: 'launch.canvas' },
    hasAttribute: (key) => attributes.has(key),
    getAttribute: (key) => attributes.get(key),
    setAttribute: (key, value) => attributes.set(key, value),
    set href(value) { attributes.set('href', value); },
  };
  let storageAccesses = 0;
  const state = {};
  let navigatedTo;
  globalThis.location = { href: 'https://example.test/?lang=es', protocol: 'https:' };
  globalThis.document = { cookie: '', documentElement: {}, querySelectorAll: () => [node] };
  globalThis.localStorage = { getItem() { storageAccesses++; }, setItem() { storageAccesses++; } };
  globalThis.history = { state, replaceState: (_, _title, url) => { navigatedTo = url.href; } };
  globalThis.window = new EventTarget();

  const { getLanguage, localizeDOM, onLanguageChange, setLanguage, t } = await import('../src/i18n/index.js');
  assert.equal(getLanguage(), 'es');
  localizeDOM();
  assert.equal(node.textContent, 'Iniciar misión');
  assert.equal(attributes.get('aria-label'), 'Simulación de lanzamiento espacial');
  assert.equal(attributes.get('href'), '/games/launch/?difficulty=normal&lang=es#simulator');

  let updated = 0;
  const unsubscribe = onLanguageChange(() => { updated++; });
  setLanguage('en');
  unsubscribe();
  assert.equal(updated, 1);
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(node.textContent, 'Start mission');
  assert.equal(attributes.get('href'), '/games/launch/?difficulty=normal&lang=en#simulator');
  assert.equal(navigatedTo, 'https://example.test/?lang=en');
  assert.equal(t('rover.telemetry', { battery: 78, count: 0 }, 'es'), 'Batería 78% · Muestras 0/3');
  globalThis.location.href = 'https://example.test/?mode=practice#plan';
  setLanguage('es');
  assert.equal(navigatedTo, 'https://example.test/?mode=practice&lang=es#plan');
  assert.equal(storageAccesses, 0);
});
