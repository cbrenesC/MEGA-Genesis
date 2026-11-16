import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STATIONS } from '../src/map/controlRoomLayout.js';
import { newFlightPlan, reviewFlightPlan } from '../src/missions/flightPlan.js';
import { missionUrl, PRIMARY_MISSION, readMissionPlan } from '../src/missions/missionTransfer.js';
import { FlightSim, vehicleFor } from '../games/launch/js/flight.js';
import { RECOMMENDED_BUILD, validateBuild, createMission, startAction, availability, RULES } from '../games/rover/js/rules.js';
import en from '../src/i18n/en.json' with { type: 'json' };
import es from '../src/i18n/es.json' with { type: 'json' };

const load = name => JSON.parse(readFileSync(new URL(`../games/launch/data/${name}.json`, import.meta.url)));
const data = {
  mocks: load('mock-missions'), launchers: load('launchers').launchers, orbits: load('orbits').orbits,
  sites: load('sites').sites, rules: load('rules'), calibration: load('flight-calibration'), flight: load('flight'),
};

test('New games prioritize the crewed round trip and start on Easy', () => {
  const plan = newFlightPlan(data);
  assert.equal(plan.scenarioId, PRIMARY_MISSION);
  assert.equal(plan.difficulty, 'facil');
  const draft = reviewFlightPlan(data, plan);
  assert.equal(draft.events, false);
  assert.equal(draft.resolved.inputs.spacecraft.return.profile, 'lunarReturn');
  const approved = { ...plan, launcherId: 'falconheavy', approved: true };
  const url = new URL(missionUrl('launch', 'en', approved), 'https://example.org');
  const review = reviewFlightPlan(data, readMissionPlan(url.hash));
  assert.equal(review.ready, true);
  assert.equal(review.selected.launchMassKg, 16000);
});

test('Only the two yellow consoles can start simulations and all eight preparation stations are labeled', () => {
  const yellow = STATIONS.filter(station => station.mission);
  assert.deepEqual(yellow.map(s => s.mission), ['launch', 'rover']);
  assert.ok(yellow.every(s => !s.setup));
  const launch = STATIONS.filter(s => s.setup === 'launch');
  const rover = STATIONS.filter(s => s.setup === 'rover');
  assert.deepEqual(launch.map(s => s.part), ['mission','payload','vehicle','review']);
  assert.deepEqual(rover.map(s => s.part), ['mobility','power','science','comms']);
  assert.ok(Math.max(...launch.map(s => s.x)) < Math.min(...rover.map(s => s.x)));
  for (const s of [...launch, ...rover]) for (const lang of [en, es]) {
    assert.ok(lang[`station.title.${s.part}`]); assert.ok(lang[`station.short.${s.part}`]);
  }
});

test('Launch needs a compatible, playable and confirmed plan for every preset', () => {
  for (const scenario of data.mocks.scenarios) {
    const draft = { ...newFlightPlan(data), scenarioId: scenario.id };
    assert.equal(reviewFlightPlan(data, draft).reason, 'launcher');
    const choices = reviewFlightPlan(data, draft).evaluations;
    const rocket = choices.find(e => e.compatible && vehicleFor(e.launcherId, scenario.orbit.type, data));
    assert.ok(rocket, scenario.id);
    const plan = { ...draft, launcherId: rocket.launcherId };
    assert.equal(reviewFlightPlan(data, plan).ready, false);
    assert.equal(reviewFlightPlan(data, { ...plan, approved: true }).ready, true, scenario.id);
  }
});

test('Launch validation carries fuel, dimensions, site and budget from the stations', () => {
  const plan = { ...newFlightPlan(data), scenarioId: 'smallsat', difficulty: 'normal', launcherId: 'electron', approved: true, payload: {
    massKg: 181, propellantKg: 16, diameterM: 0.91, heightM: 1.19,
  }, budgetMUSD: 65, targetMonths: 10, offloadKg: 2, siteId: 'mahia', rocketFuelPct: 90, events: false };
  const review = reviewFlightPlan(data, plan);
  assert.equal(review.ready, true);
  assert.deepEqual(Object.fromEntries(Object.keys(plan.payload).map(k => [k, review.resolved.inputs.spacecraft[k]])), plan.payload);
  assert.equal(review.selected.launchMassKg, 179);
  assert.equal(review.selected.siteId, 'mahia');
  assert.equal(review.resolved.inputs.budget.totalMUSD, 65);
  assert.equal(review.resolved.inputs.schedule.monthsToTargetDate, 10);
  assert.equal(review.events, false);
  const { vehicle } = vehicleFor(review.selected.launcherId, review.resolved.inputs.orbit.type, data);
  const sim = new FlightSim(vehicle, { payloadKg: review.selected.launchMassKg, fuelFraction: review.rocketFuelPct / 100 });
  assert.equal(sim.stageFuelFrac, 0.9);
  assert.equal(sim.payloadKg, 179);
  assert.equal(reviewFlightPlan(data, { ...plan, payload: { massKg: 10 } }).reason, 'payload');
  assert.equal(reviewFlightPlan(data, { ...plan, payload: { diameterM: 20 } }).reason, 'compatibility');
});

test('Launch team mode requires every requested approval', () => {
  const plan = { ...newFlightPlan(data), scenarioId: 'smallsat', difficulty: 'normal', launcherId: 'electron', teamMode: true, approved: true };
  const draft = reviewFlightPlan(data, plan);
  assert.ok(draft.requiredRoles.includes('mission'));
  assert.equal(draft.reason, 'team');
  assert.equal(reviewFlightPlan(data, { ...plan, acks: Object.fromEntries(draft.requiredRoles.map(role => [role,true])) }).ready, true);
});

test('Station plans cross the map-to-simulation boundary without browser storage', () => {
  const rover = { ...RECOMMENDED_BUILD, battery: 'grande', solar: 'basico' };
  const url = new URL(missionUrl('rover', 'es', rover, { resume: true }), 'https://example.org');
  assert.equal(url.pathname, '/games/rover/');
  assert.equal(url.searchParams.get('lang'), 'es');
  assert.equal(url.searchParams.get('resume'), '1');
  const plan = readMissionPlan(url.hash);
  assert.deepEqual(plan, rover);
  assert.equal(createMission(plan).battery, 150);
  assert.equal(validateBuild({ ...plan, wheels: null }).ok, false);
  assert.equal(readMissionPlan('#%'), null);
  assert.equal(readMissionPlan('#%5B%5D'), null);
  assert.throws(() => missionUrl('unknown', 'en', {}), /Unknown mission/);
});

test('Launch stations restore briefing cards, rocket comparisons, fairing and checks without starting a flight', async () => {
  const { renderLaunchStation } = await import('../src/missions/launchStationUI.js');
  const plan = { ...newFlightPlan(data), scenarioId: 'smallsat', difficulty: 'normal', launcherId: 'electron', teamMode: true };
  const context = { data, plan, view: reviewFlightPlan(data, plan), translate: key => es[key] };
  const html = Object.fromEntries(['mission','payload','vehicle','review'].map(part =>
    [part, renderLaunchStation(part, context, '<div data-fields></div>')]));
  assert.match(html.mission, /class="screen-grid"/);
  assert.match(html.mission, /<optgroup label="MISIÓN PRINCIPAL">\s*<option value="moonReturn"/);
  const lunar = newFlightPlan(data);
  const briefing = renderLaunchStation('mission', { ...context, plan: lunar, view: reviewFlightPlan(data, lunar), translate: key => en[key] }, '');
  assert.match(briefing, /<option value="moonReturn" selected>/);
  assert.match(briefing, /lunar orbit → return to Earth → reentry → parachutes and splashdown/);
  assert.doesNotMatch(briefing, /station\.scenario\.moonReturn/);
  assert.equal((html.mission.match(/name="difficulty"/g) ?? []).length, 3);
  assert.match(html.mission, /Cámara infrarroja/);
  assert.match(html.payload, /15 kg/);
  assert.match(html.vehicle, /class="catalog"/);
  assert.match(html.vehicle, /class="capbar"/);
  assert.match(html.vehicle, /<table>/);
  assert.match(html.vehicle, /data-select="electron"[^>]*aria-pressed="true"/);
  assert.match(html.review, /class="fairing-svg"/);
  assert.match(html.review, /¿Por qué importa\?/);
  assert.match(html.review, /data-ack="mission"/);
  for (const station of Object.values(html)) assert.doesNotMatch(station, /data-go="(?:pad|flight)"|data-launch/);
  const waiting = renderLaunchStation('review', { data, plan, view: reviewFlightPlan(data) }, '<div data-fields></div>');
  assert.match(waiting, /Elegí un cohete/);
});

test('Rover stations restore component cards, tradeoffs and live resource totals with the active rules', async () => {
  const { renderRoverStation } = await import('../src/missions/roverStationUI.js');
  const translate = (key, params = {}) => (en[key] ?? key).replace(/\{(\w+)\}/g, (_, param) => params[param]);
  const render = (part, build) => renderRoverStation(part, build, { translate, number: (n, digits) => n.toFixed(digits) });
  const full = render('mobility', RECOMMENDED_BUILD);
  assert.match(full, /Light chassis/);
  assert.match(full, /Fast and efficient/);
  assert.match(full, /data-component="chassis" data-option="ligero"[^>]*aria-pressed="true"/);
  assert.match(full, /class="reason ok"/);
  assert.match(full, /106 \/ 145 kg/);
  assert.match(full, /82 \/ 85 M US\$/);
  assert.match(full, /data-rover-preview/);
  assert.doesNotMatch(full, /data-component="solar"|data-launch/);
  const incomplete = render('power', {});
  assert.match(incomplete, /Recharge \+1.2 u\/s while stopped/);
  assert.match(incomplete, /class="reason bad"/);
  assert.doesNotMatch(incomplete, /station\.trade\./);
});

test('Science and comms consoles expose the camera, scanner and data-link stats actually used by the rover', async () => {
  const { renderRoverStation } = await import('../src/missions/roverStationUI.js');
  const render = (part, plan, dictionary) => renderRoverStation(part, plan, {
    translate: (key, params = {}) => (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, param) => params[param]),
    number: (n, digits) => n.toFixed(digits),
  });
  const build = { ...RECOMMENDED_BUILD, camera: 'hd', comms: 'baja' };
  const url = new URL(missionUrl('rover', 'en', build), 'https://example.org');
  const m = createMission(readMissionPlan(url.hash));
  m.phase = 'explore';
  const poi = m.photos[1];
  Object.assign(m.rover, { x: poi.x, y: poi.y });
  assert.equal(startAction(m, 'photo').ok, true);
  const photoSeconds = m.action.duration.toFixed(1);
  const photoEnergy = (m.action.drawPerSec * m.action.duration).toFixed(1);
  const science = render('science', m.build, en);
  assert.ok(science.includes(`Photo capture</span><b>${photoSeconds} s · ${photoEnergy} u`));
  assert.ok(science.includes(`${m.photos.length} points of interest (C) within ${RULES.photoRange} px`));
  assert.ok(render('science', m.build, es).includes(`hasta ${RULES.scanRange} px`));
  m.action = null;
  assert.equal(availability(m, 'scan').cost, RULES.scanEnergy);
  assert.ok(science.includes(`takes ${RULES.scanTime} s and ${RULES.scanEnergy} u per scan`));
  poi.state = 'captured';
  assert.equal(startAction(m, 'transmit').ok, true);
  const txSeconds = m.action.duration.toFixed(2);
  const txEnergy = (m.action.drawPerSec * m.action.duration).toFixed(1);
  const comms = render('comms', m.build, en);
  assert.ok(comms.includes(`Photo uplink</span><b>${txSeconds} s · ${txEnergy} u`));
  assert.ok(comms.includes(`Earth confirms each packet after ${RULES.ackTime.toFixed(1)} s`));
  assert.match(render('comms', m.build, es), /Enlace con la Tierra/);
  for (const console of [science, comms]) assert.doesNotMatch(console, /data-launch|undefined/);
});
