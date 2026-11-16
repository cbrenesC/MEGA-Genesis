import assert from 'node:assert/strict';
import test from 'node:test';

test('standalone and embedded flights switch loops and play each capsule impact once', async () => {
  const origin = 'https://example.test';
  const mixer = new EventTarget();
  Object.assign(mixer, { parent: mixer, location: { origin } });
  globalThis.window = mixer;
  globalThis.document = Object.assign(new EventTarget(), { cookie: '' });
  const tracks = new Map();
  globalThis.Audio = class extends EventTarget {
    constructor(src) {
      super();
      this.paused = true;
      this.plays = 0;
      tracks.set(src, this);
    }
    load() { this.preloaded = true; }
    pause() { this.paused = true; }
    play() { this.paused = false; this.plays++; return Promise.resolve(); }
  };
  const audio = await import('../src/welcome/core/gameAudio.js');
  mixer.dispatchEvent(new Event('pointerdown'));
  const air = tracks.get('/rocket-land.mp3');
  const space = tracks.get('/rocket-space.mp3');
  const wind = tracks.get('/reentry-wind.mp3');
  const splash = tracks.get('/capsule-splashdown.mp3');
  const land = tracks.get('/capsule-land-impact.mp3');
  assert.ok([wind, splash, land].every(track => track.preloaded));
  assert.equal(wind.loop, true);

  audio.startRocketAudio();
  assert.equal(air.paused, false);
  audio.updateRocketFlightAudio(150000, false);
  assert.equal(air.paused, true);
  assert.equal(space.paused, false);
  audio.updateRocketFlightAudio(101000, true);
  audio.updateRocketFlightAudio(99000, true);
  assert.equal(space.paused, true);
  assert.equal(wind.plays, 1);
  audio.pauseRocketAudio(true);
  assert.equal(wind.paused, true);
  await new Promise(resolve => setImmediate(resolve));
  audio.pauseRocketAudio(false);
  assert.equal(wind.paused, false);
  audio.stopRocketAudio();
  audio.playEffect('capsule-land-impact');
  assert.equal(wind.paused, true);
  assert.equal(land.plays, 1);

  const child = new EventTarget();
  const parent = {
    postMessage(data, targetOrigin) {
      assert.equal(targetOrigin, origin);
      mixer.dispatchEvent(new MessageEvent('message', { origin, data }));
    },
  };
  globalThis.window = Object.assign(child, { parent, location: { origin } });
  const embedded = await import('../src/welcome/core/gameAudio.js?embedded');
  await new Promise(resolve => setImmediate(resolve));
  embedded.startRocketAudio();
  embedded.updateRocketFlightAudio(101000, true);
  assert.equal(wind.paused, false);
  embedded.stopRocketAudio();
  embedded.playEffect('capsule-splashdown');
  assert.equal(wind.paused, true);
  assert.equal(splash.plays, 1);
  assert.equal(land.plays, 1);
  audio.stopRocketAudio();
  assert.equal(splash.paused, true);
});
