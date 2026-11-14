// Integración del módulo LAUNCH con el resto del juego.
//
// El repositorio todavía no tiene un estado compartido entre módulos (el mapa de Phaser
// y los minijuegos son independientes). Para no inventar un sistema paralelo complejo,
// este módulo usa lo mínimo que ofrece el navegador: un único objeto JSON en
// localStorage bajo SHARED_KEY, dividido en secciones por módulo.
//
//   - LEE (si existen): mission, spacecraft, orbit, budget, schedule, team.
//   - ESCRIBE solo: launch.
//
// Si una sección no existe, se usa el escenario simulado (mock) de data/mock-missions.json
// y la interfaz lo marca como "MOCK". Ver LAUNCH_CHANGES.md, sección 7, para el formato.

export const SHARED_KEY = 'spaceMission.state.v1';
export const LAUNCH_EVENT = 'spacemission:launch-updated';
// Versión 2: se agregan los datos del vuelo interactivo (campo `flight`) y la forma en que terminó (`result`, `events`).
// Los campos de la versión 1 se mantienen igual, así que un módulo que lea la versión 1 sigue funcionando.
export const SCHEMA_VERSION = 2;
export const DIFFICULTIES = ['facil', 'normal', 'dificil'];
export const ROLES = {
  launch: 'Lanzamiento y planificación de la misión',
  spacecraft: 'Nave e instrumentos',
  science: 'Ciencia / Objetivo y órbita',
  mission: 'Dirección de misión (presupuesto y calendario)',
};

export async function loadData(base = './data/') {
  const names = ['launchers', 'sites', 'orbits', 'rules', 'reference-missions', 'glossary', 'mock-missions', 'flight', 'flight-calibration', 'facts'];
  const files = await Promise.all(names.map(async (name) => {
    const response = await fetch(`${base}${name}.json`);
    if (!response.ok) throw new Error(`No se pudo cargar data/${name}.json (${response.status})`);
    return response.json();
  }));
  const [launchers, sites, orbits, rules, missions, glossary, mocks, flight, calibration, facts] = files;
  return {
    launchers: launchers.launchers,
    sites: sites.sites,
    orbits: orbits.orbits,
    rules,
    missions: missions.missions,
    glossary: glossary.terms,
    mocks,
    flight,
    calibration,
    facts: facts.facts,
  };
}

export function readShared() {
  try {
    return JSON.parse(localStorage.getItem(SHARED_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

// Escribe solo la sección "launch" y conserva intactas las de los demás módulos.
export function writeLaunch(launch) {
  const shared = readShared();
  shared.launch = launch;
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
  } catch {
    // Almacenamiento lleno o bloqueado (modo privado): el módulo sigue funcionando en memoria.
  }
  window.dispatchEvent(new CustomEvent(LAUNCH_EVENT, { detail: launch }));
}

export function clearLaunch() {
  const shared = readShared();
  delete shared.launch;
  try { localStorage.setItem(SHARED_KEY, JSON.stringify(shared)); } catch { /* sin almacenamiento */ }
}

// Otra pestaña (otro rol u otro módulo) cambió el estado compartido.
export function onSharedChange(callback) {
  window.addEventListener('storage', (event) => {
    if (event.key === SHARED_KEY) callback(readShared());
  });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const validSpacecraft = (s) => s && isNum(s.massKg) && s.massKg > 0;
const validOrbit = (o) => o && typeof o.type === 'string';
const validBudget = (b) => b && isNum(b.totalMUSD);
const validSchedule = (s) => s && isNum(s.monthsToTargetDate);

/**
 * Arma las entradas del módulo combinando el estado compartido con el mock elegido.
 * Prioridad: parámetros de URL (para pruebas) > estado compartido > mock.
 * Devuelve { inputs, sources, scenario } donde sources dice de dónde vino cada dato.
 */
export function resolveInputs(data, { scenarioId, difficulty, shared = readShared(), params = new URLSearchParams() } = {}) {
  const scenarios = data.mocks.scenarios;
  const scenario = scenarios.find((s) => s.id === (params.get('scenario') ?? scenarioId))
    ?? scenarios.find((s) => s.id === data.mocks.defaultScenario)
    ?? scenarios[0];
  const sources = {};
  const pick = (key, value, valid, fallback) => {
    if (!params.get('scenario') && valid(value)) { sources[key] = 'compartido'; return structuredClone(value); }
    sources[key] = 'mock';
    return structuredClone(fallback);
  };

  const spacecraft = pick('spacecraft', shared.spacecraft, validSpacecraft, scenario.spacecraft);
  spacecraft.propellantKg ??= 0;
  spacecraft.ispS ??= 0;
  spacecraft.diameterM ??= 1;
  spacecraft.heightM ??= 1;
  spacecraft.designLifetimeYears ??= 3;
  spacecraft.instruments ??= [];

  const orbit = pick('orbit', shared.orbit?.target, validOrbit, scenario.orbit);
  const budget = pick('budget', shared.budget, validBudget, scenario.budget);
  budget.committedMUSD ??= 0;
  const schedule = pick('schedule', shared.schedule, validSchedule, scenario.schedule);
  schedule.nextWindowMonths ??= 0;

  const level = params.get('difficulty') ?? difficulty ?? shared.mission?.difficulty ?? 'normal';
  sources.difficulty = params.get('difficulty') || difficulty ? 'jugador' : shared.mission?.difficulty ? 'compartido' : 'mock';

  return {
    scenario,
    sources,
    inputs: {
      missionName: shared.mission?.name ?? spacecraft.name ?? scenario.label,
      objective: shared.mission?.objective ?? scenario.objective,
      difficulty: DIFFICULTIES.includes(level) ? level : 'normal',
      spacecraft,
      orbit,
      budget,
      schedule,
      team: shared.team ?? null,
    },
  };
}

/** Construye el objeto que este módulo entrega al siguiente (sección "launch"). */
export function buildLaunchOutput({ status, inputs, sources, evaluation, flight = null, requests = [], teamReview = null, eventsEnabled = true }) {
  const e = evaluation;
  const eventsCost = flight?.extraCostMUSD ?? 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    module: 'launch',
    status, // 'seleccionado' (lanzador confirmado) | 'lanzado' (simulación terminada)
    updatedAt: new Date().toISOString(),
    difficulty: inputs.difficulty,
    inputSources: sources,
    launcher: { id: e.launcher.id, name: e.launcher.name, provider: e.launcher.provider, fictional: e.launcher.fictional, reliability: e.reliability },
    site: { id: e.site.id, name: e.site.name, latitudeDeg: e.site.latitudeDeg },
    cost: {
      launchMUSD: e.launchCostMUSD,
      delayMUSD: e.delayCostMUSD,
      eventsMUSD: eventsCost,
      totalMUSD: Math.round((e.totalCostMUSD + eventsCost) * 100) / 100,
    },
    budgetAfterMUSD: Math.round((e.budgetAfterMUSD - eventsCost) * 100) / 100,
    mass: {
      spacecraftKg: inputs.spacecraft.massKg,
      launchMassKg: e.launchMassKg,
      propellantOffloadKg: e.offloadKg,
      capacityKg: e.capacityKg,
      marginKg: Math.round(e.marginKg),
      marginPct: e.marginPct,
      marginStatus: e.marginStatus,
    },
    schedule: { launchMonth: e.date.launchMonth, delayMonths: e.date.delayMonths, waitedForWindow: e.date.waitedForWindow, extraDelayDays: flight?.delayDays ?? 0 },
    targetOrbit: inputs.orbit,
    achievedOrbit: flight ? flight.achievedOrbit : null,
    result: flight ? flight.result : null, // 'exito' | 'exito_parcial' | 'falla' | null
    lifetimeYears: { design: inputs.spacecraft.designLifetimeYears, beforeLaunch: e.lifetimeYears, afterLaunch: flight ? flight.lifetimeYears : null },
    events: flight ? flight.events.map(({ explain, ...rest }) => rest) : [],
    eventsEnabled,
    seed: flight?.seed ?? null,
    flight: flight?.flightData ?? null,
    requests,
    teamReview,
  };
}
