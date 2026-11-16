import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { nextGuideStep } from '../src/crew/guideFlow.js';
import { catalogLanguage, setCatalogLanguage, simText } from '../src/i18n/catalog.js';
import { newFlightPlan, reviewFlightPlan } from '../src/missions/flightPlan.js';
import { LUNAR_LANDER, LUNAR_ROVER, acceptsDelivery, makeLunarDelivery, playableDelivery, roverGroupReady } from '../src/missions/lunarCampaign.js';
import { missionUrl, readMissionPlan } from '../src/missions/missionTransfer.js';
import { FlightSim, missionRotationBonus, runAutopilot, vehicleFor, withPilotMargin } from '../games/launch/js/flight.js';
import { planFlightEvents, resolveFlight } from '../games/launch/js/outcome.js';
import { localizeLaunchData } from '../games/launch/js/localizeData.js';
import { createMission, evaluate, RECOMMENDED_BUILD, RULES, restoreMission, snapshot, startAction, step } from '../games/rover/js/rules.js';

const load = name => JSON.parse(readFileSync(new URL(`../games/launch/data/${name}.json`, import.meta.url)));
const data = {
  mocks: load('mock-missions'), launchers: load('launchers').launchers, orbits: load('orbits').orbits,
  sites: load('sites').sites, rules: load('rules'), calibration: load('flight-calibration'),
  flight: load('flight'), missions: load('reference-missions').missions, facts: load('facts').facts,
  glossary: load('glossary').terms,
};
const plan = { ...newFlightPlan(data), scenarioId: LUNAR_ROVER, campaignRun: 'moon-test', launcherId: 'falcon9',
  difficulty: 'facil', approved: true, events: false, roverBuild: RECOMMENDED_BUILD };
const assess = p => reviewFlightPlan(data, { ...plan, ...p });

test('all four rover consoles accept their valid choices and reject missing or over-budget designs', () => {
  for (const group of [['chassis','wheels'],['instrument','camera'],['battery','solar'],['comms']]) {
    const partial = Object.fromEntries(group.map(id => [id, RECOMMENDED_BUILD[id]]));
    assert.equal(roverGroupReady(partial, group), true);
    assert.equal(roverGroupReady({}, group), false);
    assert.equal(roverGroupReady(RECOMMENDED_BUILD, group), true);
    assert.equal(roverGroupReady({ ...RECOMMENDED_BUILD, camera: 'hd' }, group), false);
  }
});

test('approved lunar plan uses the real rover build, mass and cost across modules', () => {
  const url = new URL(missionUrl('launch', 'en', { ...plan, payload: { massKg: 1 } }), 'https://example.org');
  const review = reviewFlightPlan(data, readMissionPlan(url.hash));
  assert.equal(review.ready, true);
  assert.equal(review.resolved.inputs.orbit.type, 'TLI');
  assert.equal(review.selected.launchMassKg, LUNAR_LANDER.dryKg + LUNAR_LANDER.propellantKg + 106);
  assert.equal(review.resolved.inputs.budget.committedMUSD, LUNAR_LANDER.costMUSD + 82);
  const lighter = assess({ roverBuild: { ...RECOMMENDED_BUILD, wheels: 'ligeras' } });
  assert.equal(lighter.selected.launchMassKg, review.selected.launchMassKg - 4);
  assert.equal(lighter.selected.budgetAfterMUSD, review.selected.budgetAfterMUSD + 2);
  assert.equal(assess({ roverBuild: {} }).reason, 'lunarRover');
  assert.equal(assess({ budgetMUSD: 410 }).reason, 'compatibility');
  assert.equal(assess({ launcherId: 'electron' }).ready, false);
  assert.equal(assess({ scenarioId: 'smallsat', launcherId: 'electron', roverBuild: {} }).ready, true);
});

test('campaign guide sends the player to build the rover before flight and waits for a delivery', () => {
  const steps = new Set(['mission']);
  const campaign = { campaign: true, delivered: false };
  assert.equal(nextGuideStep(steps, [], campaign).id, 'mobility');
  for (const step of ['mobility','science','power','comms','rocket','payload','review','launch']) steps.add(step);
  assert.equal(nextGuideStep(steps, ['launch'], campaign).id, 'launch');
  campaign.delivered = true;
  assert.equal(nextGuideStep(steps, ['launch'], campaign).id, 'rover');
  assert.equal(nextGuideStep(steps, ['launch', 'rover'], campaign), null);
});

test('deterministic flight reaches the Moon, authorizes the delivered build, and finishes with three Earth-confirmed samples', () => {
  const review = assess();
  const { inputs } = review.resolved;
  const e = review.selected;
  const { vehicle, program } = vehicleFor(e.launcherId, 'TLI', data);
  const latDeg = Math.abs(e.site.latitudeDeg);
  const opts = { payloadKg: e.launchMassKg, destId: 'TLI', latDeg, incDeg: latDeg,
    targetAltKm: 250, v0: missionRotationBonus('TLI', latDeg, latDeg, data.flight) };
  const liveVehicle = withPilotMargin(vehicle, data.flight.calibration.pilotMargin.facil);
  const events = planFlightEvents(e, data, inputs, { eventsEnabled: false, seed: 1 });
  const flight = resolveFlight({
    sim: runAutopilot(liveVehicle, opts, { ...program, hold: true, waitWindow: true }),
    plan: events, evaluation: e, inputs, data, autopilotUsed: true,
  });
  assert.equal(flight.achievedOrbit?.type, 'TLI');
  const deliveryArgs = { runId: plan.campaignRun, build: plan.roverBuild, evaluation: e, inputs };
  const delivery = makeLunarDelivery({ ...deliveryArgs, flight });
  assert.equal(delivery.delivered, true);
  assert.equal(acceptsDelivery(delivery, plan), true);
  assert.equal(acceptsDelivery({ ...delivery, runId: 'old-run' }, plan), false);
  assert.equal(acceptsDelivery({ ...delivery, build: { ...delivery.build, wheels: 'ligeras' } }, plan), false);

  const failure = resolveFlight({ sim: new FlightSim(liveVehicle, opts), plan: events, evaluation: e, inputs, data });
  assert.equal(playableDelivery(makeLunarDelivery({ ...deliveryArgs, flight: failure })), false);
  assert.equal(makeLunarDelivery({ ...deliveryArgs, flight: { ...flight, transferCorrectionCovered: false } }).reason, 'fuel');
  assert.equal(makeLunarDelivery({ ...deliveryArgs, flight: { ...flight, extraCostMUSD: 200 } }).reason, 'budget');

  const decoded = readMissionPlan(new URL(missionUrl('rover', 'en', { ...delivery.build, campaign: delivery }), 'https://example.org').hash);
  assert.equal(playableDelivery(decoded.campaign), true);
  const rover = createMission(decoded);
  rover.campaignRun = delivery.runId;
  const run = (seconds) => { for (let t = 0; t < seconds; t += RULES.maxDt) step(rover, { dx: 0, dy: 0 }, RULES.maxDt); };
  const action = (type, seconds) => { assert.equal(startAction(rover, type).ok, true, type); run(seconds + 0.1); };
  run(RULES.landingTime + 0.1);
  for (const target of rover.samples.slice(0, 3)) {
    rover.rover.x = target.x; rover.rover.y = target.y;
    if (target.hidden) action('scan', RULES.scanTime);
    action('collect', RULES.collectTime);
    action('analyze', rover.stats.analysisTime);
    action('transmit', rover.stats.txTime);
    run(RULES.ackTime + 0.1);
  }
  assert.equal(evaluate(rover).success, true);
  assert.equal(evaluate(rover).packets.filter(p => p.kind === 'sample' && p.overall === 100).length, 3);

  const pending = createMission(decoded);
  pending.campaignRun = delivery.runId;
  pending.samples[0].state = 'transmitted';
  pending.acks.S1 = 0.5;
  const saved = restoreMission(snapshot(pending));
  assert.equal(saved.campaignRun, delivery.runId);
  assert.equal(saved.acks.S1, 0.5);
});

test('English and Spanish localize operation results and educational data without changing engineering inputs', () => {
  const previous = catalogLanguage();
  try {
    const p = { ...plan, scenarioId: 'smallsat', launcherId: 'electron' };
    setCatalogLanguage('en');
    const en = localizeLaunchData(data);
    const enReview = reviewFlightPlan(en, p);
    assert.equal(enReview.resolved.inputs.objective, 'Detect wildfires from space every day.');
    assert.equal(enReview.selected.orbitDef.name, 'Sun-synchronous polar orbit (SSO)');
    assert.match(enReview.selected.checks.find(c => c.id === 'fairing').detail, /fits in the protective fairing/);
    assert.equal(en.glossary.throttle.title, 'Thrust and throttle');
    assert.equal(simText('flight.preparing-pad'), 'Preparing the launch pad…');
    assert.equal(simText('rover.action-transmit'), 'Transmit');
    assert.match(evaluate(createMission(RECOMMENDED_BUILD)).explanation, /^Mission incomplete/);
    assert.match(simText('flight.0-metric-tons', 12), /^12 metric tons$/);
    setCatalogLanguage('es');
    const esReview = reviewFlightPlan(localizeLaunchData(data), p);
    assert.match(esReview.resolved.inputs.objective, /^Detectar incendios/);
    assert.equal(esReview.selected.launchMassKg, enReview.selected.launchMassKg);
    assert.equal(esReview.selected.totalCostMUSD, enReview.selected.totalCostMUSD);
    assert.equal(simText('rover.action-transmit'), 'Transmitir');
    assert.match(evaluate(createMission(RECOMMENDED_BUILD)).explanation, /^Misión no completada/);
  } finally { setCatalogLanguage(previous); }
});
