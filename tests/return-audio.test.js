import assert from 'node:assert/strict';
import test from 'node:test';

test('standalone and embedded flights mix the capsule layers and play each descent effect once', async () => {
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
  const burn = tracks.get('/heat-shield-burn.mp3');
  const chute = tracks.get('/parachute-deploy.mp3');
  const splash = tracks.get('/capsule-splashdown.mp3');
  const land = tracks.get('/capsule-land-impact.mp3');
  assert.ok([wind, burn, chute, splash, land].every(track => track.preloaded));
  assert.equal(wind.loop, true);
  assert.equal(burn.loop, true);
  const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} ~ ${expected}`);
  const effects = 0.45; // default effects volume

  audio.startRocketAudio();
  assert.equal(air.paused, false);
  audio.updateRocketFlightAudio(150000);
  assert.equal(air.paused, true);
  assert.equal(space.paused, false);
  // The capsule meets the air: the engine loops stop and each layer follows its own level.
  audio.updateRocketFlightAudio(99000, { burn: 0.5, wind: 0.3 });
  assert.equal(space.paused, true);
  assert.equal(burn.paused, false);
  assert.equal(wind.paused, false);
  near(burn.volume, effects * 0.5);
  near(wind.volume, effects * 0.3);
  audio.updateRocketFlightAudio(60000, { burn: 1, wind: 0.36 });
  near(burn.volume, effects);
  assert.equal(burn.plays, 1);
  assert.equal(wind.plays, 1);
  // Friction is over: the heat-shield burn goes quiet, the wind stays and no engine roars below 100 km.
  audio.updateRocketFlightAudio(30000, { burn: 0, wind: 1 });
  assert.equal(burn.paused, true);
  assert.equal(wind.paused, false);
  assert.equal(air.paused, true);
  near(wind.volume, effects);
  audio.pauseRocketAudio(true);
  assert.equal(wind.paused, true);
  await new Promise(resolve => setImmediate(resolve));
  audio.pauseRocketAudio(false);
  assert.equal(wind.paused, false);
  assert.equal(burn.paused, true);
  audio.playEffect('parachute-deploy');
  assert.equal(chute.plays, 1);
  audio.updateRocketFlightAudio(5000, { burn: 0, wind: 0.3 });
  near(wind.volume, effects * 0.3);
  audio.stopRocketAudio();
  audio.playEffect('capsule-land-impact');
  assert.equal(wind.paused, true);
  assert.equal(chute.paused, true);
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
  embedded.updateRocketFlightAudio(99000, { burn: 1, wind: 0.4 });
  assert.equal(air.paused, true);
  assert.equal(burn.paused, false);
  assert.equal(wind.paused, false);
  near(wind.volume, effects * 0.4);
  embedded.updateRocketFlightAudio(20000, { burn: 0, wind: 0.8 });
  assert.equal(burn.paused, true);
  assert.equal(wind.paused, false);
  near(wind.volume, effects * 0.8);
  embedded.playEffect('parachute-deploy');
  assert.equal(chute.plays, 2);
  embedded.stopRocketAudio();
  embedded.playEffect('capsule-splashdown');
  assert.equal(wind.paused, true);
  assert.equal(splash.plays, 1);
  assert.equal(land.plays, 1);
  audio.stopRocketAudio();
  assert.equal(splash.paused, true);
});
