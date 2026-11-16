// Estado del juego (versión 2): una sola fuente de verdad que comparten todas las escenas de Phaser.
// La lógica de decisión (compatibilidad, costos, riesgos) vive en rules.js; aquí solo se guarda
// qué eligió el jugador y se recalcula lo que depende de eso.

import { buildRequests } from './rules.js';
import { buildLaunchOutput, writeLaunch as persistLaunch } from './state.js';
import { hasStorageConsent } from '../../../src/welcome/core/consent.js';

export const randomSeed = () => Math.floor(Math.random() * 999999) + 1;

export const app = {
  data: null,
  teamMode: false,
  selectedId: null,
  options: {}, // por lanzador: { siteId, propellantOffloadKg }
  confirmed: false,
  eventsEnabled: true,
  rocketFuelPct: 100,
  launchWindow: null, // ventana elegida en el planificador de clima: { siteId, time, source, status, score, conditions }
  seed: randomSeed(),
  plan: null, // imprevistos programados (outcome.planFlightEvents)
  flight: null, // resultado del vuelo (outcome.resolveFlight)
  autopilotUsed: false,
  acks: {},
  notes: '',
  previousAttemptsMUSD: 0,
  attempts: 0,
  resolved: null,
  evaluations: [],
  game: null, // Phaser.Game
  sim: null, // FlightSim en curso
  vehicleInfo: null,
  reference: null,
  lunar: null, // misión lunar de ida y vuelta: { vehicle, craftDef, opts } (flow.lunarSetup)
  lunarView: null, // lo que comparte el vuelo con el mapa: { guide, plan, readout }
};

export const inputs = () => app.resolved.inputs;
export const current = () => app.evaluations.find((e) => e.launcherId === app.selectedId) ?? null;

export function requiredRoles(evaluation) {
  const roles = new Set(['spacecraft', 'mission']);
  for (const r of buildRequests(evaluation, inputs())) roles.add(r.toRole);
  roles.delete('launch');
  return [...roles];
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

export function writeLaunch(result) {
  if (hasStorageConsent()) persistLaunch(result);
}

// Preferencias de accesibilidad
export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
