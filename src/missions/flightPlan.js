import { DIFFICULTIES, resolveInputs } from '../../games/launch/js/state.js';
import { buildRequests, evaluateAll, getDifficulty } from '../../games/launch/js/rules.js';
import { vehicleFor } from '../../games/launch/js/flight.js';

export const PAYLOAD_FIELDS = {
  massKg: [0.01, 100000, '0.01'], diameterM: [0.01, 20, '0.01'],
  heightM: [0.01, 30, '0.01'], propellantKg: [0, 99999, '0.01'],
};
export const newFlightPlan = (data) => ({
  scenarioId: data.mocks.defaultScenario, difficulty: 'normal', payload: {}, budgetMUSD: null,
  targetMonths: null, launcherId: null, siteId: null, offloadKg: 0, rocketFuelPct: 100, events: null, teamMode: false, acks: {}, notes: '', approved: false,
});
const inRange = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

export function reviewFlightPlan(data, plan = {}) {
  const defaults = newFlightPlan(data);
  const scenario = data.mocks.scenarios.find(s => s.id === plan.scenarioId)
    ?? data.mocks.scenarios.find(s => s.id === defaults.scenarioId);
  const difficulty = DIFFICULTIES.includes(plan.difficulty) ? plan.difficulty : defaults.difficulty;
  const rules = getDifficulty(data.rules, difficulty);
  const events = typeof plan.events === 'boolean' ? plan.events : rules.eventsDefaultOn;
  const spacecraft = { ...scenario.spacecraft };
  const budget = { ...scenario.budget };
  const schedule = { ...scenario.schedule };
  for (const [key, [min, max]] of Object.entries(PAYLOAD_FIELDS)) {
    if (inRange(plan.payload?.[key], min, max)) spacecraft[key] = plan.payload[key];
  }
  if (inRange(plan.budgetMUSD, budget.committedMUSD, 10000)) budget.totalMUSD = plan.budgetMUSD;
  if (Number.isInteger(plan.targetMonths) && inRange(plan.targetMonths, 1, 120)) schedule.monthsToTargetDate = plan.targetMonths;
  const validPayload = spacecraft.propellantKg < spacecraft.massKg &&
    spacecraft.propellantKg >= (spacecraft.reservedPropellantKg ?? 0) &&
    spacecraft.massKg - spacecraft.propellantKg >= spacecraft.instruments.reduce((sum, i) => sum + i.massKg, 0);
  const resolved = resolveInputs(data, {
    scenarioId: scenario.id, difficulty,
    shared: { spacecraft, budget, schedule, orbit: { target: scenario.orbit } },
  });
  for (const key of ['spacecraft', 'budget', 'schedule', 'orbit']) resolved.sources[key] = 'estacion';
  const offloadKg = inRange(plan.offloadKg, 0, 99999) ? plan.offloadKg : 0;
  const options = typeof plan.launcherId === 'string' && data.launchers.some(l => l.id === plan.launcherId)
    ? { [plan.launcherId]: { siteId: plan.siteId, propellantOffloadKg: offloadKg } } : {};
  const evaluations = evaluateAll(data, resolved.inputs, options);
  const selected = evaluations.find(e => e.launcherId === plan.launcherId) ?? null;
  const simulated = selected && Boolean(vehicleFor(selected.launcherId, scenario.orbit.type, data));
  const requiredRoles = selected && plan.teamMode === true
    ? [...new Set(['spacecraft', 'mission', ...buildRequests(selected, resolved.inputs).map(r => r.toRole)])]
    : [];
  const reason = !validPayload ? 'payload' : !selected ? 'launcher' : !selected.compatible ? 'compatibility' : !simulated ? 'simulation' : requiredRoles.some(role => plan.acks?.[role] !== true) ? 'team' : null;
  const rocketFuelPct = inRange(plan.rocketFuelPct, 75, 100) ? plan.rocketFuelPct : 100;
  return { resolved, evaluations, options, selected, difficulty, rules, events, rocketFuelPct, requiredRoles, reason,
    ready: reason === null && plan.approved === true };
}
