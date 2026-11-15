import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import en from '../src/i18n/en.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };
import { CREW } from '../src/crew/roster.js';

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
  const pattern = /data-i18n(?:-aria|-title|-alt|-content|-label)?="([^"]+)"|(?:\bt|showNotice|setLoadingStatus|message|addLabel|addRoomPlaque|addSectorTag)\('((?:[a-z]+\.)+[\w.]+)'/g;
  for (const file of ['index.html', ...scan('src'), ...scan('games')]) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(pattern)) {
      const key = match[1] || match[2];
      assert.ok(Object.hasOwn(en, key), `${file}: ${key}`);
    }
  }
  for (const id of ['objectives', 'requirements', 'architecture', 'design', 'systems', 'testing', 'ground', 'operations', 'launch', 'rover']) {
    for (const suffix of ['title', 'text']) assert.ok(Object.hasOwn(en, `lesson.${id}.${suffix}`));
  }
  for (let i = 1; i <= 14; i++) assert.ok(Object.hasOwn(en, 'briefing.cue' + String(i).padStart(2, '0')));
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
  assert.equal(storageAccesses, 0);
});
