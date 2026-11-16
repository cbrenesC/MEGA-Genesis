import { message } from '../../../src/i18n/catalog.js';

const translate = (key, fallback) => {
  const id = `flightData.${key}`;
  const localized = message(id);
  return localized === id ? fallback : localized;
};
const fields = (object, key, keys) => Object.fromEntries(keys
  .filter(name => name in object)
  .map(name => [name, translate(`${key}.${name}`, object[name])]));

/** Localize explanations at read time without changing IDs or numeric inputs. */
export function localizeLaunchData(data) {
  const map = (list, prefix, keys) => list?.map(item => ({ ...item, ...fields(item, `${prefix}.${item.id}`, keys) }));
  const record = (dict, prefix, keys) => Object.fromEntries(Object.entries(dict ?? {})
    .map(([id, item]) => [id, { ...item, ...fields(item, `${prefix}.${id}`, keys) }]));
  return {
    ...data,
    launchers: map(data.launchers, 'rocket', ['provider', 'class', 'summary']),
    sites: map(data.sites, 'site', ['country', 'weatherNote', 'source']),
    orbits: map(data.orbits, 'orbit', ['name', 'short', 'plain', 'examples']),
    facts: map(data.facts, 'fact', ['text', 'source']),
    missions: map(data.missions, 'reference', ['name', 'note']),
    glossary: record(data.glossary, 'glossary', ['title', 'text', 'more', 'formula']),
    rules: {
      ...data.rules,
      difficulty: record(data.rules.difficulty, 'difficulty', ['description', 'label']),
      events: record(data.rules.events, 'event', ['label', 'explain']),
    },
    mocks: {
      ...data.mocks,
      scenarios: data.mocks.scenarios.map(scenario => ({
        ...scenario, objective: translate(`mock.${scenario.id}.objective`, scenario.objective),
        spacecraft: {
          ...scenario.spacecraft,
          instruments: scenario.spacecraft.instruments.map(instrument => ({
            ...instrument, name: translate(`mock.${scenario.id}.${instrument.id}`, instrument.name),
          })),
        },
      })),
    },
  };
}
