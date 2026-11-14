import { getPreferences } from './consent.js';
class WelcomeAudio {
  setMuted(value) { this.muted = Boolean(value); this.syncVolumes(); }
  syncVolumes() {
    const prefs = getPreferences();
    const music = document.querySelector('.space-title__music');
    if (music) music.volume = prefs.audio ? prefs.musicVolume : 0;
  }
  unlockPlayback() { const music=document.querySelector('.space-title__music'); if(music && getPreferences().audio) void music.play().catch(()=>{}); }
}
export const audio = new WelcomeAudio();
