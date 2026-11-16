import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { activeStationStep, CREW_GUIDE, nextGuideStep } from '../src/crew/guideFlow.js';
import { readGameSession, writeGameSession, clearGameSession } from '../src/missions/gameSession.js';
import { LUNAR_ROVER, playableDelivery } from '../src/missions/lunarCampaign.js';
import { PREPARATION_KEY, ROVER_SAVE_KEY, PRIMARY_MISSION, primaryMissionCompleted, MISSION_COMPLETE, MISSION_EXIT, ROVER_PROGRESS } from '../src/missions/missionTransfer.js';

function makeStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

test('a fresh browser has no game to resume until the first start', () => {
  const storage = makeStorage();
  assert.equal(readGameSession(storage), null);
  storage.setItem(PREPARATION_KEY, 'not JSON');
  assert.equal(readGameSession(storage), null);
  storage.setItem(PREPARATION_KEY, '{"rover":{"camera":null}}');
  assert.equal(readGameSession(storage), null);
  assert.equal(writeGameSession(storage, {}), true);
  assert.deepEqual(readGameSession(storage), { started: true });
});

test('a session restores map position, guide progress, and active simulation', () => {
  const storage = makeStorage();
  const data = {
    position: { x: 829, y: 483 },
    guideProgress: ['mission', 'rocket'],
    guideConversations: ['luis-launch-plan'],
    completedMissions: [],
    launch: { scenarioId: PRIMARY_MISSION, approved: true },
    rover: { camera: 'hd' },
    activeMission: { mission: 'launch', plan: { scenarioId: PRIMARY_MISSION, approved: true } },
  };
  writeGameSession(storage, data);
  const loaded = readGameSession(storage);
  assert.deepEqual(loaded, { ...data, started: true });
  assert.equal(nextGuideStep(new Set(loaded.guideProgress), loaded.completedMissions, { main: true }).id, 'payload');
  storage.setItem(ROVER_SAVE_KEY, '{}');
  clearGameSession(storage);
  assert.equal(readGameSession(storage), null);
  assert.equal(storage.getItem(ROVER_SAVE_KEY), null);
});

test('the station confirmation applies to the requested console after its conversation', () => {
  const first = CREW_GUIDE[0];
  assert.equal(activeStationStep(first, first.stationId, () => false), null);
  assert.equal(activeStationStep(first, 'another-console', () => true), null);
  assert.equal(activeStationStep(first, first.stationId, key => key === first.talkKey), first);
  const flight = CREW_GUIDE.find(step => step.mission === 'launch');
  assert.equal(activeStationStep(flight, flight.stationId, () => true), null);
});

test('the main guide requires lunar return and the rover campaign has its own route', () => {
  const main = { main: true };
  const steps = new Set();
  assert.equal(nextGuideStep(steps, [], main).id, 'mission');
  const prepared = new Set(['mission', 'rocket', 'payload', 'review']);
  assert.equal(nextGuideStep(prepared, [], { practice: true }).id, 'mission');
  assert.equal(nextGuideStep(prepared, ['launch', 'rover'], main).id, PRIMARY_MISSION);
  assert.equal(nextGuideStep(prepared, [PRIMARY_MISSION], main), null);
  assert.equal(nextGuideStep(steps, [PRIMARY_MISSION], { campaign: true }).id, 'mission');
});

test('a practice flight, an incomplete return or a rough reentry does not complete the main mission', () => {
  const plan = { scenarioId: PRIMARY_MISSION };
  const report = { ...plan, result: 'exito', reached: ['lunarOrbit', 'landed'] };
  assert.equal(primaryMissionCompleted(plan, report), true);
  assert.equal(primaryMissionCompleted({ scenarioId: 'smallsat' }, report), false);
  assert.equal(primaryMissionCompleted(plan, { ...report, scenarioId: 'lunar' }), false);
  assert.equal(primaryMissionCompleted(plan, { ...report, reached: ['lunarOrbit'] }), false);
  assert.equal(primaryMissionCompleted(plan, { ...report, reached: ['landed'] }), false);
  assert.equal(primaryMissionCompleted(plan, { ...report, result: 'exito_parcial' }), false);
  assert.equal(primaryMissionCompleted(plan, { ...report, result: 'falla' }), false);
  assert.equal(primaryMissionCompleted(plan, {}), false);
});

test('Mission Control accepts a successful retry from the same flight frame', () => {
  const source = readFileSync(new URL('../src/missions/StationPreparation.js', import.meta.url), 'utf8');
  const StationPreparation = new Function('hasStorageConsent', 'emptyBuild', 'window', 'location',
    'MISSION_COMPLETE', 'MISSION_EXIT', 'PRIMARY_MISSION', 'primaryMissionCompleted', 'playableDelivery', 'LUNAR_ROVER', 'ROVER_PROGRESS',
    source.replace(/^import .*;\n/gm, '').replace('export class', 'class') + '\nreturn StationPreparation;')(
    () => false, () => ({}), { addEventListener() {} }, { origin: 'https://example.test' },
    MISSION_COMPLETE, MISSION_EXIT, PRIMARY_MISSION, primaryMissionCompleted, playableDelivery, LUNAR_ROVER, ROVER_PROGRESS,
  );
  const completed = [];
  const preparation = new StationPreparation({ onMissionCompleted: id => completed.push(id) });
  const frame = {};
  preparation.frame = { contentWindow: frame };
  preparation.frameMission = 'launch';
  preparation.activeMission = { mission: 'launch', plan: { scenarioId: PRIMARY_MISSION } };
  const attempt = (result, reached, source = frame) => preparation.onMessage({
    source, origin: 'https://example.test',
    data: { type: MISSION_COMPLETE, mission: 'launch', scenarioId: PRIMARY_MISSION, result, reached },
  });
  attempt('falla', ['lunarOrbit']);
  assert.equal(preparation.activeMission.resultShown, true);
  assert.deepEqual(completed, []);
  attempt('exito', ['lunarOrbit', 'landed'], {});
  assert.deepEqual(completed, []);
  attempt('exito', ['lunarOrbit', 'landed']);
  attempt('exito', ['lunarOrbit', 'landed']);
  assert.deepEqual(completed, [PRIMARY_MISSION]);
  assert.deepEqual(preparation.completedMissions, [PRIMARY_MISSION]);
});
