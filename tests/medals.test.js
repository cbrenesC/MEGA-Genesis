import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDALS, awardMedal, hasAllMedals, medalForStation, restoreMedals, simulationMedals } from '../src/medals/progress.js';
import { readGameSession, writeGameSession } from '../src/missions/gameSession.js';
import { STATIONS } from '../src/map/controlRoomLayout.js';
import { PRIMARY_MISSION } from '../src/missions/missionTransfer.js';
import { message } from '../src/i18n/catalog.js';

test('all eight workstations and two simulations get distinct medals, plus two gold medals', () => {
  assert.equal(STATIONS.filter(station => station.setup).length, 8);
  assert.equal(STATIONS.filter(station => station.mission).length, 2);
  const ids = STATIONS.map(station => medalForStation(station.id));
  assert.equal(new Set(ids).size, 10);
  assert.notEqual(ids.includes(undefined), true);
  assert.deepEqual(MEDALS.filter(medal => medal.color === 'gold').map(medal => medal.id), ['lunarGold', 'roverGold']);
  for (const { id } of MEDALS) {
    for (const lang of ['en', 'es']) assert.notEqual(message(`medals.name.${id}`, {}, lang), `medals.name.${id}`);
  }
});

test('awards are unique, saved with the session, and export unlocks at 12/12', () => {
  const storage = { getItem() { return this.data; }, setItem(_, data) { this.data = data; } };
  const medals = restoreMedals();
  for (const { id } of MEDALS.slice(0, -1)) assert.equal(awardMedal(medals, id), true);
  assert.equal(awardMedal(medals, 'mission'), false);
  assert.equal(awardMedal(medals, 'invalid'), false);
  assert.equal(hasAllMedals(medals), false);
  awardMedal(medals, 'roverGold');
  assert.equal(writeGameSession(storage, { medals: [...medals] }), true);
  assert.deepEqual(restoreMedals(readGameSession(storage)), medals);
  assert.equal(hasAllMedals(medals), true);
});

test('legacy progress recovers confirmed workstations and verified successful missions', () => {
  assert.deepEqual([...restoreMedals({
    guideProgress: ['mission', 'cargo:mission', 'cargo:science', 'lunarGold', null],
    completedMissions: [PRIMARY_MISSION, 'rover'],
  })], ['mission', 'science', 'launch', 'lunarGold', 'rover', 'roverGold']);
  assert.deepEqual([...restoreMedals({ medals: [], completedMissions: ['rover'] })], []);
  assert.deepEqual([...restoreMedals({ medals: ['rover', 'unknown', 'rover'] })], ['rover']);
});

test('simulation medals distinguish finished attempts from successful lunar missions', () => {
  const launch = { mission: 'launch', plan: { scenarioId: PRIMARY_MISSION } };
  const flight = { mission: 'launch', scenarioId: PRIMARY_MISSION, reached: ['lunarOrbit', 'landed'] };
  assert.deepEqual(simulationMedals(launch, { ...flight, result: 'falla' }), ['launch']);
  assert.deepEqual(simulationMedals(launch, { ...flight, result: 'exito_parcial' }), ['launch']);
  assert.deepEqual(simulationMedals(launch, { ...flight, result: 'exito' }), ['launch', 'lunarGold']);
  assert.deepEqual(simulationMedals({ ...launch, testReturn: true }, { ...flight, result: 'exito' }), []);
  assert.deepEqual(simulationMedals(launch, { ...flight, result: 'exito', scenarioId: 'lunar' }), []);
  const rover = { mission: 'rover', plan: {} };
  assert.deepEqual(simulationMedals(rover, { mission: 'rover', success: false }), ['rover']);
  assert.deepEqual(simulationMedals(rover, { mission: 'rover', success: true }), ['rover', 'roverGold']);
  assert.deepEqual(simulationMedals(rover, { mission: 'rover' }), []);
});

test('the pixel art renders every medal in both earned and locked palettes', async () => {
  const { drawMedal } = await import('../src/medals/pixelArt.js');
  const paint = (medal, unlocked) => {
    const ops = [];
    const ctx = {
      fillRect(x, y, w, h) {
        assert.ok(x >= 0 && y >= 0 && x + w <= 144 && y + h <= 144);
        assert.equal([x, y, w, h].every(value => value % 6 === 0), true);
        ops.push([this.fillStyle, x, y, w, h]);
      },
    };
    drawMedal(ctx, medal, 0, 0, 6, unlocked);
    return ops;
  };
  for (const medal of MEDALS) assert.notDeepEqual(paint(medal, true), paint(medal, false));
  assert.equal(new Set(MEDALS.map(medal => JSON.stringify(paint(medal, true)))).size, 12);
});
