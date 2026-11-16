import { getPreferences } from './consent.js';

const music = new Audio('/game-music.mp3');
music.loop = true;
music.preload = 'auto';
const thruster = new Audio('/thruster.mp3');
thruster.loop = true;
thruster.preload = 'auto';
let wantsMusic = false;
let musicPaused = false;
let thrusterPower = 0;
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

function syncRocket() {
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
  syncMusic();
}
export function startRocketAudio() {
  rocketRunning = true;
  rocketPaused = false;
  rocketAltitude = 0;
  syncRocket();
}
export function updateRocketAltitude(altitude) {
  rocketAltitude = Math.max(0, Number(altitude) || 0);
  syncRocket();
}
export function pauseRocketAudio(paused) {
  rocketPaused = Boolean(paused);
  syncRocket();
}
export function stopRocketAudio() {
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
  music.volume = Math.max(0, Math.min(1, (prefs.musicVolume ?? 0.18) * (simulationDucked ? 0.2 : 1)));
  void music.play().catch(() => {});
}

function syncThruster() {
  const prefs = preferences();
  if (!audioUnlocked || thrusterPower <= 0.02 || !prefs.audio) {
    thruster.pause();
    return;
  }
  thruster.volume = Math.max(0, Math.min(1, (prefs.effectsVolume ?? 0.45) * (0.2 + 0.8 * thrusterPower)));
  if (thruster.paused) void thruster.play().catch(() => {});
}

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
  const sound = new Audio('/click.mp3');
  sound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  void sound.play().catch(() => {});
}

export function playEffect(name) {
  const prefs = preferences();
  if (!prefs.audio) return;
  const files = { 'stage-separation': '/stage-separation.mp3' };
  const src = files[name];
  if (!src) return;
  const sound = new Audio(src);
  sound.volume = Math.max(0, Math.min(1, prefs.effectsVolume ?? 0.45));
  void sound.play().catch(() => {});
}

export function setThruster(power) {
  thrusterPower = Math.max(0, Math.min(1, Number(power) || 0));
  syncThruster();
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
  stopRocketAudio();
  simulationDucked = false;
}
