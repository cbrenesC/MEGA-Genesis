export const PRIMARY_MISSION = 'moonReturn';
export const ROVER_PROGRESS = 'mega:rover-progress';
export const MISSION_EXIT = 'mega:mission-exit';
export const MISSION_COMPLETE = 'mega:mission-complete';
export const ROVER_SAVE_KEY = 'megaGenesis.rover.save.v1';
export const PREPARATION_KEY = 'megaGenesis.stationPlans.v1';

export function primaryMissionCompleted(plan, report) {
  return plan?.scenarioId === PRIMARY_MISSION && report?.scenarioId === PRIMARY_MISSION
    && report.result === 'exito' && Array.isArray(report.reached)
    && report.reached.includes('lunarOrbit') && report.reached.includes('landed');
}

export function missionUrl(mission, language, plan, { resume = false } = {}) {
  if (mission !== 'launch' && mission !== 'rover') throw new Error('Unknown mission');
  const params = new URLSearchParams({ lang: language, embedded: '1' });
  if (resume) params.set('resume', '1');
  return `/games/${mission}/?${params}#${encodeURIComponent(JSON.stringify(plan))}`;
}

export function readMissionPlan(hash) {
  try {
    const plan = JSON.parse(decodeURIComponent(hash.slice(1)));
    return plan && typeof plan === 'object' && !Array.isArray(plan) ? plan : null;
  } catch {
    return null;
  }
}

export function returnToControl(language) {
  if (window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1') window.parent.postMessage({ type: MISSION_EXIT }, location.origin);
  else location.assign('/?' + new URLSearchParams({ lang: language }));
}
