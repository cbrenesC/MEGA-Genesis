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

function preferences() {
  return getPreferences();
}

function syncMusic() {
  const prefs = preferences();
  if (!audioUnlocked || !wantsMusic || musicPaused || !prefs.audio) {
    music.pause();
    return;
  }
  music.volume = Math.max(0, Math.min(1, prefs.musicVolume ?? 0.18));
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
});
window.addEventListener('sms-consent-changed', () => {
  syncMusic();
  syncThruster();
});
const unlockAudio = () => {
  audioUnlocked = true;
  syncMusic();
  syncThruster();
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
}
