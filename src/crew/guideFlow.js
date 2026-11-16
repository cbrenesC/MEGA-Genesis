export const CREW_GUIDE = Object.freeze([
  { id: 'mission', crewId: 'vega', talkKey: 'luis-launch-plan', stationId: 'objectives', stationNameKey: 'station.title.mission', kind: 'launch-mission', taskKey: 'guide.vega.mission' },
  { id: 'rocket', crewId: 'vega', talkKey: 'luis-launch-plan', stationId: 'systems', stationNameKey: 'station.title.vehicle', kind: 'launch-rocket', taskKey: 'guide.vega.rocket' },
  { id: 'payload', crewId: 'kade', talkKey: 'durman-launch-check', stationId: 'requirements', stationNameKey: 'station.title.payload', kind: 'launch-payload', taskKey: 'guide.kade.payload' },
  { id: 'review', crewId: 'kade', talkKey: 'durman-launch-check', stationId: 'testing', stationNameKey: 'station.title.review', kind: 'launch-review', taskKey: 'guide.kade.review' },
  { id: 'launch', crewId: 'vega', talkKey: 'luis-launch', stationId: 'launch', stationNameKey: 'lesson.launch.title', kind: 'launch-simulation', mission: 'launch', taskKey: 'guide.vega.launch' },
  { id: 'mobility', crewId: 'sol', talkKey: 'johana-rover-plan', stationId: 'architecture', stationNameKey: 'station.title.mobility', kind: 'rover-group', part: 'mobility', taskKey: 'guide.sol.mobility' },
  { id: 'science', crewId: 'sol', talkKey: 'johana-rover-plan', stationId: 'ground', stationNameKey: 'station.title.science', kind: 'rover-group', part: 'science', taskKey: 'guide.sol.science' },
  { id: 'power', crewId: 'rios', talkKey: 'josue-rover-plan', stationId: 'design', stationNameKey: 'station.title.power', kind: 'rover-group', part: 'power', taskKey: 'guide.rios.power' },
  { id: 'comms', crewId: 'rios', talkKey: 'josue-rover-plan', stationId: 'operations', stationNameKey: 'station.title.comms', kind: 'rover-group', part: 'comms', taskKey: 'guide.rios.comms' },
  { id: 'rover', crewId: 'rios', talkKey: 'josue-rover-plan', stationId: 'rover', stationNameKey: 'lesson.rover.title', kind: 'rover-simulation', mission: 'rover', taskKey: 'guide.rios.rover' },
]);

const CAMPAIGN_ORDER = ['mission', 'mobility', 'science', 'power', 'comms', 'rocket', 'payload', 'review', 'launch', 'rover'];

export function nextGuideStep(completed, completedMissions, { campaign = false, delivered = false } = {}) {
  if (campaign) {
    return CAMPAIGN_ORDER.map(id => CREW_GUIDE.find(step => step.id === id)).find(step => {
      if (step.id === 'launch') return !delivered;
      if (step.id === 'rover') return delivered && !completedMissions.includes('rover');
      return !completed.has(step.id) && !delivered;
    }) ?? null;
  }
  // Retain the original flow for legacy session previews and standalone exercises.
  const launchFinished = completedMissions.includes('launch') || completed.has('launch');
  const roverFinished = completedMissions.includes('rover') || completed.has('rover');
  const launchIndex = CREW_GUIDE.findIndex(step => step.id === 'launch');
  return CREW_GUIDE.find((step, index) => !completed.has(step.id)
    && (index <= launchIndex ? !launchFinished : !roverFinished)) ?? null;
}

export function activeStationStep(step, stationId, hasConversation) {
  return step && !step.mission && step.stationId === stationId && hasConversation(step.talkKey) ? step : null;
}
