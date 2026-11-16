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
for (const sound of [rocketLand, rocketSpace]) {
  sound.loop = true;
  sound.preload = 'auto';
}
let activeRocket = null;
let rocketPaused = false;
let rocketRunning = false;
let rocketAltitude = 0;
const ATMOSPHERE_EDGE_M = 100000;

// Start fetching every launch sound while the player is still in mission setup.
const launchSounds = [thruster, rocketLand, rocketSpace];
const effectSounds = {
  'stage-separation': new Audio('/stage-separation.mp3'),
};
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

function syncRocket() {
  if (isEmbedded) return;
  const prefs = preferences();
  const target = rocketAltitude < ATMOSPHERE_EDGE_M ? rocketLand : rocketSpace;
  if (!rocketRunning || rocketPaused || !audioUnlocked || !prefs.audio) {
    for (const sound of [rocketLand, rocketSpace]) sound.pause();
    return;
  }
  if (activeRocket !== target) {
    activeRocket?.pause();
    if (activeRocket) activeRocket.currentTime = 0;
    activeRocket = target;
    activeRocket.currentTime = 0;
  }
  target.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  if (target.paused) void target.play().catch(() => {});
}
export function setSimulationMusicDucked(ducked) {
  simulationDucked = Boolean(ducked);
  if (relayAudio('duck', simulationDucked)) return;
  syncMusic();
}
export function startRocketAudio() {
  if (relayAudio('rocket-start')) return;
  rocketRunning = true;
  rocketPaused = false;
  rocketAltitude = 0;
  syncRocket();
}
export function updateRocketAltitude(altitude) {
  if (relayAudio('altitude', altitude)) return;
  rocketAltitude = Math.max(0, Number(altitude) || 0);
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
  for (const sound of [rocketLand, rocketSpace]) {
    sound.pause();
    sound.currentTime = 0;
  }
}


function preferences() {
  return getPreferences();
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
    case 'rocket-start': startRocketAudio(); break;
    case 'rocket-stop': stopRocketAudio(); break;
    case 'rocket-pause': pauseRocketAudio(value); break;
    case 'altitude': updateRocketAltitude(value); break;
  }
});

window.addEventListener('sms-preferences-changed', () => {
  syncMusic();
  syncThruster();
  syncRocket();
});
window.addEventListener('sms-consent-changed', () => {
  syncMusic();
  syncThruster();
  syncRocket();
});
const unlockAudio = () => {
  audioUnlocked = true;
  syncMusic();
  syncThruster();
  syncRocket();
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
  const prefs = preferences();
  if (!prefs.audio) return;
  const sound = effectSounds[name];
  if (!sound) return;
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
  simulationDucked = false;
}
