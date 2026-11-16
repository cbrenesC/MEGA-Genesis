import { DIFFICULTIES, resolveInputs } from '../../games/launch/js/state.js';
import { buildRequests, evaluateAll, getDifficulty } from '../../games/launch/js/rules.js';
import { message } from '../i18n/catalog.js';
import { validateBuild, COMPONENTS } from '../../games/rover/js/rules.js';
import { LUNAR_ROVER, lunarRoverScenario } from './lunarCampaign.js';
import { vehicleFor } from '../../games/launch/js/flight.js';

export const PAYLOAD_FIELDS = {
  massKg: [0.01, 100000, '0.01'], diameterM: [0.01, 20, '0.01'],
  heightM: [0.01, 30, '0.01'], propellantKg: [0, 99999, '0.01'],
};
export const newFlightPlan = (data) => ({
  scenarioId: data.mocks.defaultScenario, difficulty: 'normal', payload: {}, budgetMUSD: null,
  targetMonths: null, launcherId: null, siteId: null, offloadKg: 0, rocketFuelPct: 100, launchWindow: null, events: null, teamMode: false, acks: {}, notes: '', approved: false,
});
const inRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export const hasFlight = (launcherId, orbit, data) => Boolean(vehicleFor(launcherId, orbit, data));

export function reviewFlightPlan(data, plan = {}) {
  const defaults = newFlightPlan(data);
  const campaign = plan.scenarioId === LUNAR_ROVER ? lunarRoverScenario(data) : null;
  const rover = campaign ? validateBuild(plan.roverBuild) : null;
  const effectiveData = campaign ? { ...data, mocks: { ...data.mocks, scenarios: [...data.mocks.scenarios, campaign] } } : data;
  const scenario = campaign ?? data.mocks.scenarios.find(s => s.id === plan.scenarioId)
    ?? data.mocks.scenarios.find(s => s.id === defaults.scenarioId);
  const difficulty = DIFFICULTIES.includes(plan.difficulty) ? plan.difficulty : defaults.difficulty;
  const rules = getDifficulty(data.rules, difficulty);
  const events = typeof plan.events === 'boolean' ? plan.events : rules.eventsDefaultOn;
  const spacecraft = { ...scenario.spacecraft };
  const budget = { ...scenario.budget };
  const schedule = { ...scenario.schedule };
  if (campaign) {
    spacecraft.massKg += rover.stats.mass;
    budget.committedMUSD += rover.stats.cost;
    spacecraft.instruments = ['instrument', 'camera'].flatMap(id => {
      const part = COMPONENTS[id].find(option => option.id === plan.roverBuild?.[id]);
      return part ? [{ id, name: message(`station.component.${id}.${part.id}`), massKg: part.mass }] : [];
    });
  }
  if (!campaign) for (const [key, [min, max]] of Object.entries(PAYLOAD_FIELDS)) {
    if (inRange(plan.payload?.[key], min, max)) spacecraft[key] = plan.payload[key];
  }
  if (inRange(plan.budgetMUSD, campaign ? 1 : budget.committedMUSD, 10000)) budget.totalMUSD = plan.budgetMUSD;
  if (Number.isInteger(plan.targetMonths) && inRange(plan.targetMonths, 1, 120)) schedule.monthsToTargetDate = plan.targetMonths;
  const validPayload = spacecraft.propellantKg < spacecraft.massKg &&
    spacecraft.propellantKg >= (spacecraft.reservedPropellantKg ?? 0) &&
    spacecraft.massKg - spacecraft.propellantKg >= spacecraft.instruments.reduce((sum, i) => sum + i.massKg, 0);
  const resolved = resolveInputs(effectiveData, {
    scenarioId: scenario.id, difficulty,
    shared: { spacecraft, budget, schedule, orbit: { target: scenario.orbit } },
  });
  for (const key of ['spacecraft', 'budget', 'schedule', 'orbit']) resolved.sources[key] = 'estacion';
  const offloadKg = inRange(plan.offloadKg, 0, 99999) ? plan.offloadKg : 0;
  const options = typeof plan.launcherId === 'string' && data.launchers.some(l => l.id === plan.launcherId)
    ? { [plan.launcherId]: { siteId: plan.siteId, propellantOffloadKg: offloadKg } } : {};
  const evaluations = evaluateAll(data, resolved.inputs, options);
  const selected = evaluations.find(e => e.launcherId === plan.launcherId) ?? null;
  const simulated = selected && hasFlight(selected.launcherId, scenario.orbit.type, data);
  const requiredRoles = selected && plan.teamMode === true
    ? [...new Set(['spacecraft', 'mission', ...buildRequests(selected, resolved.inputs).map(r => r.toRole)])]
    : [];
  const reason = campaign && !rover.ok ? 'lunarRover' : !validPayload ? 'payload' : !selected ? 'launcher' : !selected.compatible ? 'compatibility' : !simulated ? 'simulation' : requiredRoles.some(role => plan.acks?.[role] !== true) ? 'team' : null;
  const rocketFuelPct = inRange(plan.rocketFuelPct, 75, 100) ? plan.rocketFuelPct : 100;
  // ventana de lanzamiento elegida en el planificador de clima: sólo vale para el sitio con el que se evaluó
  const lw = plan.launchWindow;
  const launchWindow = selected && lw && typeof lw === 'object' && lw.siteId === selected.siteId && typeof lw.time === 'string'
    && !Number.isNaN(Date.parse(lw.time)) && ['GO', 'CAUTION', 'NO-GO'].includes(lw.status) && lw.conditions && typeof lw.conditions === 'object'
    && ['meteomatics', 'simulation'].includes(lw.source) ? lw : null;
  return { campaign, rover, resolved, evaluations, options, selected, difficulty, rules, events, rocketFuelPct, launchWindow, requiredRoles, reason,
    ready: reason === null && plan.approved === true };
}
