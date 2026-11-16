import { getPreferences } from './consent.js';

const music = new Audio('/game-music.mp3');
music.loop = true;
music.preload = 'auto';
const thruster = new Audio('/lanzamiento.mp3');
thruster.loop = false;
thruster.preload = 'auto';
let wantsMusic = false;
let musicPaused = false;
let thrusterPower = 0;
const isEmbedded = window.parent !== window;
function relayAudio(action, value) {
  if (!isEmbedded) return false;
  window.parent.postMessage({ type: 'mega-launch-audio', action, value }, window.location.origin);
  return true;
}
let audioUnlocked = false;

let simulationDucked = false;
const rocketLand = new Audio('/rocket-land.mp3');
const rocketSpace = new Audio('/rocket-space.mp3');
const reentryWind = new Audio('/reentry-wind.mp3');
const heatShieldBurn = new Audio('/heat-shield-burn.mp3');
const rocketTracks = { air: rocketLand, space: rocketSpace };
// The returning capsule has no engine: it is heard as two layers, each with its own level (0-1).
// `burn` follows the heat on the shield and `wind` follows the air rushing past, so the burn
// fades out once the capsule has slowed down while the wind stays until it touches the surface.
const capsuleTracks = { burn: heatShieldBurn, wind: reentryWind };
const flightLoops = [...Object.values(rocketTracks), ...Object.values(capsuleTracks)];
const FLIGHT_MODES = ['air', 'space', 'capsule'];
const CAPSULE_SILENT = 0.02;
const capsuleLevels = { burn: 0, wind: 0 };
const level01 = value => Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 50) / 50;
const roverSound = new Audio('/rover.mp3');
const crewVoices = {
  kade: new Audio('/voice-durman.wav'),
  rios: new Audio('/voice-josue.wav'),
  vega: new Audio('/voice-luis-eduardo.wav'),
  sol: new Audio('/voice-johana.wav'),
};
for (const sound of Object.values(crewVoices)) sound.preload = 'auto';
roverSound.loop = true;
roverSound.preload = 'auto';
let roverRunning = false;
let activeCrewVoice = null;
for (const sound of flightLoops) {
  sound.loop = true;
  sound.preload = 'auto';
}
let activeRocket = null;
const rocketPending = new WeakSet();
function playRocketTrack(sound) {
  if (!sound.paused || rocketPending.has(sound)) return;
  rocketPending.add(sound);
  Promise.resolve(sound.play()).catch(error => console.warn('Rocket audio could not play:', error)).finally(() => rocketPending.delete(sound));
}
for (const sound of flightLoops) {
  sound.addEventListener('canplay', () => { if (activeRocket === sound || rocketMode === 'capsule') syncRocket(); });
  sound.addEventListener('error', () => console.warn('Rocket audio failed to load:', sound.currentSrc, sound.error?.code));
}

let rocketPaused = false;
let rocketRunning = false;
let rocketMode = 'air';
const ATMOSPHERE_EDGE_M = 100000;

// Start fetching every launch sound while the player is still in mission setup.
const launchSounds = [thruster, ...flightLoops, roverSound, ...Object.values(crewVoices)];
const effectSounds = {
  'stage-separation': new Audio('/stage-separation.mp3'),
  'parachute-deploy': new Audio('/parachute-deploy.mp3'),
  'capsule-splashdown': new Audio('/capsule-splashdown.mp3'),
  'capsule-land-impact': new Audio('/capsule-land-impact.mp3'),
};
// One-shot sounds of the capsule's descent: they play in the top window and stop with the flight.
const capsuleEffectSounds = [effectSounds['parachute-deploy'], effectSounds['capsule-splashdown'], effectSounds['capsule-land-impact']];
const clickSound = new Audio('/click.mp3');
let preloadStarted = false;
export function preloadLaunchAudio() {
  if (isEmbedded) { relayAudio('preload'); return; }
  if (preloadStarted) return;
  preloadStarted = true;
  for (const sound of [...launchSounds, ...Object.values(effectSounds), clickSound]) {
    sound.preload = 'auto';
    sound.load();
  }
}
preloadLaunchAudio();

function syncRover() {
  if (isEmbedded) return;
  const prefs = preferences();
  if (!roverRunning || !audioUnlocked || !prefs.audio) { roverSound.pause(); return; }
  roverSound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  if (roverSound.paused) void roverSound.play().catch(error => console.warn('Rover audio playback failed:', error));
}
export function startRoverAudio() {
  if (relayAudio('rover-start')) return;
  preloadLaunchAudio();
  roverRunning = true;
  roverSound.currentTime = 0;
  syncRover();
}
export function stopRoverAudio() {
  if (relayAudio('rover-stop')) return;
  roverRunning = false;
  roverSound.pause();
  roverSound.currentTime = 0;
}

function syncRocket() {
  if (isEmbedded) return;
  const prefs = preferences();
  const target = rocketTracks[rocketMode] ?? null;
  if (!rocketRunning || rocketPaused || !audioUnlocked || !prefs.audio) {
    for (const sound of flightLoops) sound.pause();
    return;
  }
  const volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  if (activeRocket !== target) {
    activeRocket?.pause();
    activeRocket = target;
  }
  if (target) {
    target.volume = volume;
    playRocketTrack(target);
  }
  for (const [name, sound] of Object.entries(capsuleTracks)) {
    const level = rocketMode === 'capsule' ? capsuleLevels[name] : 0;
    if (level < CAPSULE_SILENT) { sound.pause(); continue; }
    sound.volume = volume * level;
    playRocketTrack(sound);
  }
}
export function setSimulationMusicDucked(ducked) {
  simulationDucked = Boolean(ducked);
  if (relayAudio('duck', simulationDucked)) return;
  syncMusic();
}
export function startRocketAudio() {
  rocketMode = 'air';
  capsuleLevels.burn = 0;
  capsuleLevels.wind = 0;
  if (relayAudio('rocket-start')) return;
  preloadLaunchAudio();
  for (const sound of flightLoops) sound.currentTime = 0;
  rocketRunning = true;
  rocketPaused = false;
  syncRocket();
}
/**
 * Chooses what the flight sounds like right now. `capsule` is null while the rocket flies (engine
 * loop by altitude) or `{ burn, wind }` levels (0-1) while the capsule falls through the air.
 */
export function updateRocketFlightAudio(altitude, capsule = null) {
  if (capsule) setCapsuleLevels(capsule);
  setRocketMode(capsule ? 'capsule' : altitude < ATMOSPHERE_EDGE_M ? 'air' : 'space');
}
function setCapsuleLevels(levels) {
  const burn = level01(levels?.burn);
  const wind = level01(levels?.wind);
  if (burn === capsuleLevels.burn && wind === capsuleLevels.wind) return;
  capsuleLevels.burn = burn;
  capsuleLevels.wind = wind;
  if (relayAudio('capsule-levels', { burn, wind })) return;
  if (rocketMode === 'capsule') syncRocket();
}
function setRocketMode(mode) {
  if (!FLIGHT_MODES.includes(mode) || rocketMode === mode) return;
  rocketMode = mode;
  if (relayAudio('rocket-mode', mode)) return;
  syncRocket();
}
export function pauseRocketAudio(paused) {
  if (relayAudio('rocket-pause', paused)) return;
  rocketPaused = Boolean(paused);
  syncRocket();
}
export function stopRocketAudio() {
  if (relayAudio('rocket-stop')) return;
  rocketRunning = false;
  rocketPaused = false;
  activeRocket = null;
  for (const sound of [...flightLoops, ...capsuleEffectSounds]) {
    sound.pause();
    sound.currentTime = 0;
  }
}


function preferences() {
  return getPreferences();
}

export function playCrewVoice(crewId) {
  if (relayAudio('crew-play', crewId)) return;
  stopCrewVoice();
  const sound = crewVoices[crewId];
  const prefs = preferences();
  if (!sound || !audioUnlocked || !prefs.audio) return;
  sound.currentTime = 0;
  sound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  activeCrewVoice = sound;
  void sound.play().catch(() => {
    if (activeCrewVoice === sound) activeCrewVoice = null;
  });
}

export function stopCrewVoice() {
  if (relayAudio('crew-stop')) return;
  if (!activeCrewVoice) return;
  activeCrewVoice.pause();
  activeCrewVoice.currentTime = 0;
  activeCrewVoice = null;
}

function syncCrewVoice() {
  if (activeCrewVoice && !preferences().audio) stopCrewVoice();
}

function syncMusic() {
  const prefs = preferences();
  if (!audioUnlocked || !wantsMusic || musicPaused || !prefs.audio) {
    music.pause();
    return;
  }
  music.volume = Math.max(0, Math.min(1, (prefs.musicVolume ?? 0.18) * (simulationDucked ? 0.07 : 1)));
  void music.play().catch(() => {});
}

function syncThruster() {
  const prefs = preferences();
  if (!audioUnlocked || !prefs.audio) { thruster.pause(); return; }
  thruster.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
}

// The countdown plays once. Rocket Land overlaps during the final seconds.
export function startLaunchCountdownAudio() {
  if (relayAudio('countdown-start')) return;
  preloadLaunchAudio();
  if (!audioUnlocked || !preferences().audio) return;
  thruster.pause();
  thruster.currentTime = 0;
  syncThruster();
  void thruster.play().catch((error) => console.warn('Countdown audio could not start:', error));
}
export function stopLaunchCountdownAudio() {
  if (relayAudio('countdown-stop')) return;
  thruster.pause();
  thruster.currentTime = 0;
}
window.addEventListener('message', (event) => {
  if (isEmbedded || event.origin !== window.location.origin || event.data?.type !== 'mega-launch-audio') return;
  const { action, value } = event.data;
  switch (action) {
    case 'preload': preloadLaunchAudio(); break;
    case 'duck': setSimulationMusicDucked(value); break;
    case 'countdown-start': startLaunchCountdownAudio(); break;
    case 'countdown-stop': stopLaunchCountdownAudio(); break;
    case 'rover-start': startRoverAudio(); break;
    case 'rover-stop': stopRoverAudio(); break;
    case 'crew-play': playCrewVoice(value); break;
    case 'crew-stop': stopCrewVoice(); break;
    case 'rocket-start': startRocketAudio(); break;
    case 'rocket-stop': stopRocketAudio(); break;
    case 'rocket-pause': pauseRocketAudio(value); break;
    case 'rocket-mode': setRocketMode(value); break;
    case 'capsule-levels': setCapsuleLevels(value); break;
    case 'flight-effect': playEffect(value); break;
  }
});

window.addEventListener('sms-preferences-changed', () => {
  syncMusic();
  syncThruster();
  syncRocket();
  syncRover();
  syncCrewVoice();
  if (!preferences().audio) for (const sound of capsuleEffectSounds) sound.pause();
});
window.addEventListener('sms-consent-changed', () => {
  syncMusic();
  syncThruster();
  syncRocket();
  syncRover();
  syncCrewVoice();
});
const unlockAudio = () => {
  audioUnlocked = true;
  syncMusic();
  syncThruster();
  syncRocket();
  syncRover();
};
window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

document.addEventListener('click', event => {
  if (event.target.closest?.('button, [role="button"], input[type="button"], input[type="submit"]')) {
    playClick();
  }
}, true);

export function playClick() {
  const prefs = preferences();
  if (!prefs.audio) return;
  const sound = clickSound;
  sound.pause();
  sound.currentTime = 0;
  sound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  void sound.play().catch(() => {});
}

export function playEffect(name) {
  if (!Object.hasOwn(effectSounds, name)) return;
  const sound = effectSounds[name];
  const isCapsuleEffect = capsuleEffectSounds.includes(sound);
  if (isCapsuleEffect && relayAudio('flight-effect', name)) return;
  const prefs = preferences();
  if (!prefs.audio || (isCapsuleEffect && !audioUnlocked)) return;
  sound.pause();
  sound.currentTime = 0;
  sound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  void sound.play().catch(() => {});
}

export function setThruster(power) {
  // Engine intensity is visual only; lanzamiento.mp3 is triggered by the countdown.
  thrusterPower = Math.max(0, Math.min(1, Number(power) || 0));
}

export function startGameplayMusic() {
  wantsMusic = true;
  syncMusic();
}

export function pauseGameplayMusic() {
  musicPaused = true;
  music.pause();
}

export function resumeGameplayMusic() {
  musicPaused = false;
  syncMusic();
}

export function stopGameplayMusic() {
  wantsMusic = false;
  musicPaused = false;
  music.pause();
  setThruster(0);
  stopLaunchCountdownAudio();
  stopRocketAudio();
  stopRoverAudio();
  stopCrewVoice();
  simulationDucked = false;
}
