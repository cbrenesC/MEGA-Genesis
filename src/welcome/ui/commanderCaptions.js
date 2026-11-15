import { getLanguage, onLanguageChange, t } from '../../i18n/index.js';

// Timings follow the original briefing. Both transcripts live in the shared catalogs.
const cueTimes = [
  [0, 2.05], [2.30, 3.99], [4.16, 7.98], [8.12, 10.10],
  [10.24, 12.50], [12.68, 15.05], [15.24, 16.54], [16.68, 19.10],
  [19.16, 20.95], [21.14, 22.65], [22.84, 25.10], [25.24, 27.12],
  [27.26, 28.55], [28.65, 30.15],
];

export function installCommanderCaptions(video, button) {
  if (typeof globalThis.VTTCue !== 'function' || typeof video.addTextTrack !== 'function') {
    button.hidden = true;
    return;
  }

  const tracks = {
    en: video.addTextTrack('captions', 'English', 'en'),
    es: video.addTextTrack('subtitles', 'Español', 'es'),
  };
  for (const [language, track] of Object.entries(tracks)) {
    cueTimes.forEach(([start, end], i) => {
      const key = 'briefing.cue' + String(i + 1).padStart(2, '0');
      const cue = new VTTCue(start, end, t(key, {}, language));
      cue.size = 88;
      cue.line = -2;
      track.addCue(cue);
    });
  }

  let enabled = true;
  const update = () => {
    const currentLanguage = getLanguage();
    for (const [language, track] of Object.entries(tracks)) {
      track.mode = enabled && language === currentLanguage ? 'showing' : 'disabled';
    }
    button.setAttribute('aria-pressed', String(enabled));
  };
  button.addEventListener('click', () => {
    enabled = !enabled;
    update();
  });
  onLanguageChange(update);
  update();
}
