import assert from 'node:assert/strict';
import test from 'node:test';
import { activeStationStep, CREW_GUIDE, nextGuideStep } from '../src/crew/guideFlow.js';
import { readGameSession, writeGameSession, clearGameSession } from '../src/missions/gameSession.js';
import { PREPARATION_KEY, ROVER_SAVE_KEY } from '../src/missions/missionTransfer.js';

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
    guideProgress: ['mission', 'launch', 'mobility'],
    guideConversations: ['luis-launch-plan', 'johana-rover-plan'],
    completedMissions: ['launch'],
    launch: { approved: true },
    rover: { camera: 'hd' },
    activeMission: { mission: 'rover', plan: { camera: 'hd' } },
  };
  writeGameSession(storage, data);
  const loaded = readGameSession(storage);
  assert.deepEqual(loaded, { ...data, started: true });
  assert.equal(nextGuideStep(new Set(loaded.guideProgress), loaded.completedMissions).id, 'science');
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

test('finishing the launch sends the player to Johana even if they skipped launch prep', () => {
  const steps = new Set();
  assert.equal(nextGuideStep(steps, []).id, 'mission');
  const next = nextGuideStep(steps, ['launch']);
  assert.equal(next.id, 'mobility');
  assert.equal(next.crewId, 'sol');
  assert.equal(nextGuideStep(new Set(['launch']), []).id, 'mobility');
  assert.equal(nextGuideStep(steps, ['launch', 'rover']), null);
});
