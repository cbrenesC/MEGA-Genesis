import { message } from '../i18n/catalog.js';
import { CATEGORIES, COMPONENTS, LIMITS, validateBuild } from '../../games/rover/js/rules.js';

export const LUNAR_ROVER = 'lunar-rover';
export const LUNAR_LANDER = Object.freeze({
  dryKg: 850, propellantKg: 840, reserveKg: 700, costMUSD: 280,
  diameterM: 2.5, heightM: 3.5,
});

export function lunarRoverScenario(data) {
  const lunar = data.mocks.scenarios.find(s => s.id === 'lunar');
  if (!lunar) return null;
  const l = LUNAR_LANDER;
  return {
    ...lunar, id: LUNAR_ROVER, label: message('station.scenario.lunar-rover'),
    objective: message('flightData.mock.lunar-rover.objective'),
    spacecraft: {
      ...lunar.spacecraft, name: 'Selene Rover', massKg: l.dryKg + l.propellantKg,
      propellantKg: l.propellantKg, reservedPropellantKg: l.reserveKg,
      diameterM: l.diameterM, heightM: l.heightM, instruments: [],
    },
    budget: { totalMUSD: 550, committedMUSD: l.costMUSD },
  };
}

/** A group can be confirmed before other groups are complete, within the global limits. */
export function roverGroupReady(build, group) {
  if (!group?.every(id => COMPONENTS[id].some(option => option.id === build?.[id]))) return false;
  const { stats } = validateBuild(build);
  return stats.mass <= LIMITS.mass && stats.cost <= LIMITS.budgetMUSD;
}

export const snapshotRoverBuild = build => Object.fromEntries(CATEGORIES.map(({ id }) => [id, build?.[id] ?? null]));
export const sameRoverBuild = (a, b) => Boolean(a && b && CATEGORIES.every(({ id }) => a[id] === b[id]));

export function makeLunarDelivery({ runId, build, flight, evaluation, inputs }) {
  if (!runId || !validateBuild(build).ok || !flight || !evaluation || inputs?.orbit?.type !== 'TLI') return null;
  const cost = Math.round((inputs.budget.committedMUSD + evaluation.totalCostMUSD + (flight.extraCostMUSD ?? 0)) * 100) / 100;
  let reason = null;
  if (flight.result === 'falla' || flight.achievedOrbit?.type !== 'TLI') reason = 'transfer';
  else if (flight.transferCorrectionCovered === false) reason = 'fuel';
  else if (cost > inputs.budget.totalMUSD) reason = 'budget';
  return {
    runId, delivered: reason === null, reason, build: snapshotRoverBuild(build),
    launcher: evaluation.launcher.name, site: evaluation.site.name, costMUSD: cost,
    budgetMUSD: inputs.budget.totalMUSD, payloadKg: evaluation.launchMassKg,
    marginKg: evaluation.marginKg ?? (evaluation.capacityKg - evaluation.launchMassKg),
    fuelPct: flight.flightData?.fuelLeftPct ?? null, corrected: Boolean(flight.transferCorrected),
  };
}

export function acceptsDelivery(delivery, plan) {
  return Boolean(plan?.campaignRun && delivery?.runId === plan.campaignRun && sameRoverBuild(delivery.build, plan.roverBuild)
    && typeof delivery.delivered === 'boolean');
}

export function playableDelivery(delivery) {
  return Boolean(delivery?.delivered === true && delivery.runId && validateBuild(delivery.build).ok);
}
