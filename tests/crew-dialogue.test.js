import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createDialogueReveal } from '../src/crew/dialogueReveal.js';
import { CREW_GUIDE, activeStationStep, nextGuideStep } from '../src/crew/guideFlow.js';
import { STATIONS } from '../src/map/controlRoomLayout.js';

function harness(text, animate = true) {
  const pending = new Map();
  const events = [];
  let id = 0;
  const dialogue = createDialogueReveal(text, {
    animate,
    onText: visible => events.push(visible),
    onReady: () => events.push('ready'),
    onConfirm: () => events.push('confirmed'),
    schedule: callback => { pending.set(++id, callback); return id; },
    cancel: key => pending.delete(key),
  });
  return { dialogue, events, pending, tick() {
    const [key, run] = pending.entries().next().value;
    pending.delete(key);
    run();
  } };
}

test('crew dialogue reveals full graphemes and only confirms after it finishes', () => {
  const h = harness('¡Sí! 🌙');
  h.tick(); h.tick();
  assert.deepEqual(h.events, ['', '¡', '¡S']);
  while (h.pending.size) h.tick();
  assert.deepEqual(h.events.slice(-2), ['¡Sí! 🌙', 'ready']);
  h.dialogue.advance(); h.dialogue.advance();
  assert.equal(h.events.filter(value => value === 'confirmed').length, 1);
});

test('Enter during typing only reveals; cancelling never confirms the conversation', () => {
  const h = harness('Next station');
  h.dialogue.advance();
  assert.deepEqual(h.events, ['', 'Next station', 'ready']);
  assert.equal(h.pending.size, 0);
  h.dialogue.abort(); h.dialogue.advance();
  assert.equal(h.events.includes('confirmed'), false);
  const aborted = harness('Still typing');
  aborted.dialogue.abort();
  assert.equal(aborted.pending.size, 0);
  assert.deepEqual(aborted.events, ['']);
});

test('reduced motion shows the full dialogue and still waits for confirmation', () => {
  const h = harness('Listo', false);
  assert.deepEqual(h.events, ['Listo', 'ready']);
  assert.equal(h.pending.size, 0);
  h.dialogue.advance();
  assert.equal(h.events.at(-1), 'confirmed');
});

test('confirming a crew dialogue closes it before showing the station beacon', async () => {
  // Use the real scene methods without booting the Phaser renderer.
  const source = readFileSync(new URL('../src/scenes/SpaceCenterScene.js', import.meta.url), 'utf8');
  const methods = source.replace(/^import .*;\n/gm, '');
  const Scene = new Function('Phaser', 'activeStationStep', 'nextGuideStep', 'STATIONS', 't', 'createDialogueReveal',
    methods.replace('export class', 'class') + '\nreturn SpaceCenterScene;')(
    { Scene: class {} }, activeStationStep, nextGuideStep, STATIONS, key => key, createDialogueReveal,
  );
  const scene = new Scene();
  const conversations = new Set();
  const elements = new Map();
  scene.terminalDialog = { querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, {});
    return elements.get(selector);
  } };
  scene.completedGuideSteps = new Set();
  scene.preparation = {
    hasGuideConversation: key => conversations.has(key),
    markGuideConversation: key => conversations.add(key),
    completeGuideStep() {},
    guideStationReady: () => true,
  };
  let closed = false;
  scene.closeTerminal = () => { assert.equal(scene.guideStation, null); closed = true; };
  scene.updateGuideBeacon();
  const [first, second] = CREW_GUIDE;
  assert.equal(scene.guideStation, null);
  scene.presentCrewDialogue({ id: first.crewId }, false);
  assert.equal(conversations.size, 0);
  assert.equal(scene.guideStation, null);
  scene.crewDialogue.advance();
  assert.equal(closed, true);
  assert.equal(scene.guideStation.id, first.stationId);
  assert.equal(scene.confirmStation({ id: first.stationId }), true);
  assert.equal(scene.currentGuideStep().id, second.id);
  assert.equal(scene.guideStation.id, second.stationId);
  assert.doesNotMatch(source, /id = 'crew-guide'|data-guide-next/);
});
