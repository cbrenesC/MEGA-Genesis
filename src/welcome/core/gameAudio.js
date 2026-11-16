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
const rocketTracks = { air: rocketLand, space: rocketSpace, reentry: reentryWind };
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
for (const sound of Object.values(rocketTracks)) {
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
for (const sound of Object.values(rocketTracks)) {
  sound.addEventListener('canplay', () => { if (activeRocket === sound) syncRocket(); });
  sound.addEventListener('error', () => console.warn('Rocket audio failed to load:', sound.currentSrc, sound.error?.code));
}

let rocketPaused = false;
let rocketRunning = false;
let rocketMode = 'air';
const ATMOSPHERE_EDGE_M = 100000;

// Start fetching every launch sound while the player is still in mission setup.
const launchSounds = [thruster, ...Object.values(rocketTracks), roverSound, ...Object.values(crewVoices)];
const effectSounds = {
  'stage-separation': new Audio('/stage-separation.mp3'),
  'capsule-splashdown': new Audio('/capsule-splashdown.mp3'),
  'capsule-land-impact': new Audio('/capsule-land-impact.mp3'),
};
const capsuleImpactSounds = [effectSounds['capsule-splashdown'], effectSounds['capsule-land-impact']];
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
  const target = rocketTracks[rocketMode];
  if (!rocketRunning || rocketPaused || !audioUnlocked || !prefs.audio) {
    for (const sound of Object.values(rocketTracks)) sound.pause();
    return;
  }
  if (activeRocket !== target) {
    activeRocket?.pause();
    activeRocket = target;
  }
  target.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  playRocketTrack(target);
}
export function setSimulationMusicDucked(ducked) {
  simulationDucked = Boolean(ducked);
  if (relayAudio('duck', simulationDucked)) return;
  syncMusic();
}
export function startRocketAudio() {
  rocketMode = 'air';
  if (relayAudio('rocket-start')) return;
  preloadLaunchAudio();
  for (const sound of Object.values(rocketTracks)) sound.currentTime = 0;
  rocketRunning = true;
  rocketPaused = false;
  syncRocket();
}
export function updateRocketFlightAudio(altitude, reentry) {
  setRocketMode(reentry ? 'reentry' : altitude < ATMOSPHERE_EDGE_M ? 'air' : 'space');
}
function setRocketMode(mode) {
  if (!Object.hasOwn(rocketTracks, mode) || rocketMode === mode) return;
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
  for (const sound of [...Object.values(rocketTracks), ...capsuleImpactSounds]) {
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
    case 'flight-effect': playEffect(value); break;
  }
});

window.addEventListener('sms-preferences-changed', () => {
  syncMusic();
  syncThruster();
  syncRocket();
  syncRover();
  syncCrewVoice();
  if (!preferences().audio) for (const sound of capsuleImpactSounds) sound.pause();
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
  const isImpact = capsuleImpactSounds.includes(sound);
  if (isImpact && relayAudio('flight-effect', name)) return;
  const prefs = preferences();
  if (!prefs.audio || (isImpact && !audioUnlocked)) return;
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
