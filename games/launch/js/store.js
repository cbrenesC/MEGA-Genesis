// Estado del juego (versión 2): una sola fuente de verdad que comparten todas las escenas de Phaser.
// La lógica de decisión (compatibilidad, costos, riesgos) vive en rules.js; aquí solo se guarda
// qué eligió el jugador y se recalcula lo que depende de eso.

import { evaluateAll, buildRequests, getDifficulty } from './rules.js';
import { resolveInputs, buildLaunchOutput, writeLaunch, clearLaunch } from './state.js';

export const randomSeed = () => Math.floor(Math.random() * 999999) + 1;

export const app = {
  data: null,
  scenarioId: null,
  difficulty: null,
  teamMode: false,
  selectedId: null,
  options: {}, // por lanzador: { siteId, propellantOffloadKg }
  confirmed: false,
  eventsEnabled: true,
  seed: randomSeed(),
  plan: null, // imprevistos programados (outcome.planFlightEvents)
  flight: null, // resultado del vuelo (outcome.resolveFlight)
  autopilotUsed: false,
  acks: {},
  notes: '',
  onlyCompatible: false,
  previousAttemptsMUSD: 0,
  attempts: 0,
  resolved: null,
  evaluations: [],
  game: null, // Phaser.Game
  sim: null, // FlightSim en curso
  vehicleInfo: null,
  reference: null,
};

export function recompute() {
  const resolved = resolveInputs(app.data, { scenarioId: app.scenarioId, difficulty: app.difficulty, params: new URLSearchParams(location.search) });
  app.scenarioId = resolved.scenario.id;
  // Si ya se compró un lanzamiento que falló, ese dinero sigue gastado.
  resolved.inputs.budget.committedMUSD += app.previousAttemptsMUSD;
  app.resolved = resolved;
  app.evaluations = evaluateAll(app.data, resolved.inputs, app.options);
  if (app.selectedId && !app.evaluations.some((e) => e.launcherId === app.selectedId)) app.selectedId = null;
}

export const inputs = () => app.resolved.inputs;
export const diff = () => getDifficulty(app.data.rules, inputs().difficulty);
export const current = () => app.evaluations.find((e) => e.launcherId === app.selectedId) ?? null;
export const orbitDef = () => app.data.orbits.find((o) => o.id === inputs().orbit.type);

// Cualquier cambio de decisión invalida la confirmación y el vuelo anterior.
export function invalidateDecision() {
  app.confirmed = false;
  app.flight = null;
  app.plan = null;
  app.sim = null;
  app.acks = {};
}

export function requiredRoles(evaluation) {
  const roles = new Set(['spacecraft', 'mission']);
  for (const r of buildRequests(evaluation, inputs())) roles.add(r.toRole);
  roles.delete('launch');
  return [...roles];
}

export function teamApproved(evaluation) {
  if (!app.teamMode) return true;
  return requiredRoles(evaluation).every((role) => app.acks[role]);
}

export function currentOutput(status) {
  const e = current();
  if (!e) return null;
  return buildLaunchOutput({
    status,
    inputs: inputs(),
    sources: app.resolved.sources,
    evaluation: e,
    flight: app.flight,
    requests: buildRequests(e, inputs()),
    teamReview: app.teamMode ? { acks: { ...app.acks }, notes: app.notes, requiredRoles: requiredRoles(e) } : null,
    eventsEnabled: app.eventsEnabled,
  });
}

export { writeLaunch, clearLaunch };

// Preferencias de accesibilidad
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Memoria ligera del navegador (puede fallar en modo privado: el juego funciona igual).
export const remember = {
  get(key) { try { return localStorage.getItem(`launch.v2.${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`launch.v2.${key}`, value); } catch { /* sin almacenamiento */ } },
};
