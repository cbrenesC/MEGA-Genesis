import { CREW_GUIDE } from '../crew/guideFlow.js';
import { PRIMARY_MISSION, primaryMissionCompleted } from '../missions/missionTransfer.js';

const colors = {
  mission: 'teal', rocket: 'teal', payload: 'teal', review: 'teal',
  mobility: 'purple', science: 'purple', power: 'purple', comms: 'purple',
  launch: 'blue', rover: 'blue',
};
export const MEDALS = Object.freeze([
  ...CREW_GUIDE.filter(step => !step.mission),
  ...CREW_GUIDE.filter(step => step.mission),
].map(({ id, stationId, stationNameKey }) => Object.freeze({ id, stationId, stationNameKey, color: colors[id] })).concat([
  Object.freeze({ id: 'lunarGold', color: 'gold' }),
  Object.freeze({ id: 'roverGold', color: 'gold' }),
]));
const known = new Set(MEDALS.map(({ id }) => id));
const stations = new Map(MEDALS.filter(medal => medal.stationId).map(({ stationId, id }) => [stationId, id]));

export function medalForStation(stationId) {
  return stations.get(stationId);
}

export function restoreMedals(save) {
  if (Array.isArray(save?.medals)) return new Set(save.medals.filter(id => known.has(id)));
  // Legacy saves recorded guided confirmations (including cargo-prefixed steps),
  // but could not prove confirmations outside the guide or failed simulations.
  const medals = new Set();
  for (const key of Array.isArray(save?.guideProgress) ? save.guideProgress : []) {
    if (typeof key !== 'string') continue;
    const id = key.replace(/^cargo:/, '');
    if (known.has(id) && id !== 'lunarGold' && id !== 'roverGold') medals.add(id);
  }
  const completed = Array.isArray(save?.completedMissions) ? save.completedMissions : [];
  if (completed.includes('launch')) medals.add('launch');
  if (completed.includes(PRIMARY_MISSION)) medals.add('launch').add('lunarGold');
  if (completed.includes('rover')) medals.add('rover').add('roverGold');
  return medals;
}

export function awardMedal(medals, id) {
  if (!known.has(id) || medals.has(id)) return false;
  medals.add(id);
  return true;
}

export function simulationMedals(active, report) {
  if (!active || active.testReturn || report?.mission !== active.mission) return [];
  if (active.mission === 'launch') {
    if (!active.plan?.scenarioId || report.scenarioId !== active.plan.scenarioId
      || !['exito', 'exito_parcial', 'falla'].includes(report.result)) return [];
    return primaryMissionCompleted(active.plan, report) ? ['launch', 'lunarGold'] : ['launch'];
  }
  if (active.mission === 'rover' && typeof report.success === 'boolean') {
    return report.success ? ['rover', 'roverGold'] : ['rover'];
  }
  return [];
}

export const hasAllMedals = medals => MEDALS.every(({ id }) => medals.has(id));
