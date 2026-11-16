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
  const localizeStages = stages => stages.map(stage => ({
    ...stage, name: translate(`stage.${stage.nameKey}`, stage.name),
  }));
  return {
    ...data,
    launchers: map(data.launchers, 'rocket', ['name', 'provider', 'class', 'summary'])?.map(launcher => ({
      ...launcher,
      sources: fields(launcher.sources ?? {}, `rocket.${launcher.id}.sources`, Object.keys(launcher.sources ?? {})),
    })),
    sites: map(data.sites, 'site', ['name', 'country', 'weatherNote', 'source']),
    orbits: map(data.orbits, 'orbit', ['name', 'short', 'plain', 'examples']),
    facts: map(data.facts, 'fact', ['text', 'source']),
    missions: map(data.missions, 'reference', ['name', 'note']),
    glossary: record(data.glossary, 'glossary', ['title', 'text', 'more', 'formula']),
    rules: {
      ...data.rules,
      difficulty: record(data.rules.difficulty, 'difficulty', ['description', 'label']),
      events: record(data.rules.events, 'event', ['label', 'explain']),
    },
    flight: data.flight && {
      ...data.flight,
      vehicles: Object.fromEntries(Object.entries(data.flight.vehicles ?? {}).map(([id, vehicle]) => [
        id, {
          ...vehicle,
          ...(vehicle.stages && { stages: localizeStages(vehicle.stages) }),
          ...(vehicle.transferStages && { transferStages: localizeStages(vehicle.transferStages) }),
        },
      ])),
    },
    mocks: {
      ...data.mocks,
      scenarios: data.mocks.scenarios.map(scenario => ({
        ...scenario, ...fields(scenario, `mock.${scenario.id}`, ['label', 'objective']),
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
