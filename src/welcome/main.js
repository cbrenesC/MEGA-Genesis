
import { mountTitleOverlay } from './ui/titleOverlay.js';
import { showCredits } from './ui/creditsDialog.js';
import { audio } from './core/audio.js';

import { installSettingsDialog } from './ui/settingsDialog.js';
import { getPreferences, updatePreferences, hasStorageConsent, acceptStorageConsent, declineStorageConsent, persistPreferencesAfterConsent } from './core/consent.js';
import { preloadAssets, assetUrl, persistAssetCache } from './core/assetLoader.js';
import { getLanguage, setLanguage, translateSync, localizeDOM, restoreTranslationCache, prepareLanguage } from './i18n/index.js';

const MIN_LOADING_MS = 3000;
const startedAt = performance.now();
let game = null;
let gameReady = false;
let assetsReady = false;
let startedSequence = false;
window.__SMS_INTRO_COMPLETE__ = false;

const boot = document.getElementById('boot');
const bootInner = boot.querySelector('.boot-inner');
const bootProgress = boot.querySelector('.boot-progress__fill');
const bootStatus = boot.querySelector('.boot-status');
const brands = document.getElementById('boot-brands');
const setup = document.getElementById('boot-setup');
const consent = document.getElementById('boot-consent');
const intro = document.getElementById('boot-intro');
const localizing = document.getElementById('boot-localizing');
const introVideo = document.getElementById('logo-intro-video');
const firstVisit = !hasStorageConsent();

function setLoadingStatus(span, fraction) {
  if (bootStatus) bootStatus.textContent = translateSync(span);
  if (bootProgress) bootProgress.style.width = `${Math.round(Math.max(0,Math.min(.98,fraction))*100)}%`;
}
setLoadingStatus('DESCARGANDO RECURSOS', 0);

function onLoadProgress(progress) {
  const fraction = progress.phase === 'download'
    ? progress.ratio * .86
    : progress.phase === 'decode' ? .91
    : progress.phase === 'render' ? .95 : .97;
  const labels = {
    download:'DESCARGANDO RECURSOS',
    decode:'PREPARANDO AUDIO Y VIDEO',
    render:'RENDERIZANDO ENTORNOS',
    ready:'SISTEMAS LISTOS',
  };
  setLoadingStatus(labels[progress.phase] || progress.detail, fraction);
}

window.addEventListener('sms-language-changed', () => {
  localizeDOM(document);
  if (!assetsReady) setLoadingStatus('DESCARGANDO RECURSOS', Number.parseFloat(bootProgress?.style.width || '0') / 100);
});

const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));

async function showStage(stage) {
  stage.hidden = false;
  await new Promise(resolve => requestAnimationFrame(() => {
    stage.classList.add('is-visible');
    window.setTimeout(resolve, 500);
  }));
}
async function hideStage(stage) {
  if (!stage || stage.hidden) return;
  stage.classList.remove('is-visible');
  if (stage === bootInner) stage.classList.add('is-fading');
  await delay(460);
  stage.hidden = true;
}
function waitForClick(element) {
  return new Promise(resolve => element.addEventListener('click',resolve,{once:true}));
}

function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width,screen.height)<1024;
}
async function showDeviceTips() {
  const rotate = document.getElementById('boot-rotate-hint');
  if (rotate) rotate.hidden = !(isMobile() && window.innerHeight > window.innerWidth);
  const tip = () => {if (rotate) rotate.hidden = !(isMobile() && window.innerHeight > window.innerWidth);};
  window.addEventListener('resize',tip);
  await showStage(brands);
  await delay(isMobile()?2600:1900);
  await hideStage(brands);
  window.removeEventListener('resize',tip);
}

function installSetupControls() {
  const language = document.getElementById('boot-language');
  language.value = getLanguage();
  language.addEventListener('change', async () => {
    await setLanguage(language.value);
    localizeDOM(setup);
  });
  for (const key of ['audio', 'animations']) {
    const toggle = document.getElementById(key === 'audio' ? 'setup-audio' : 'setup-animations');
    toggle.checked = getPreferences()[key];
    toggle.addEventListener('change', () => {
      updatePreferences({[key]: toggle.checked});
      if (key === 'audio') audio.setMuted(!toggle.checked);
    });
  }
  for (const key of ['musicVolume','effectsVolume']) {
    const input = setup.querySelector(`[name="${key}"]`);
    const output = document.getElementById(key === 'musicVolume' ? 'setup-music-value' : 'setup-effects-value');
    input.value = Math.round(getPreferences()[key]*100);
    output.textContent = `${input.value}%`;
    input.addEventListener('input', () => {
      output.textContent = `${input.value}%`;
      updatePreferences({[key]: Number(input.value)/100});
      audio.syncVolumes();
    });
  }
}

async function showFirstDialog() {
  installSetupControls();
  await showStage(setup);
  localizeDOM(setup);
  await waitForClick(document.getElementById('setup-continue'));
  await hideStage(setup);
}

async function showSecondDialog() {
  const terms = document.getElementById('consent-terms');
  const accept = document.getElementById('consent-accept');
  const decline = document.getElementById('consent-decline');
  terms.checked = false;
  accept.disabled = true;
  decline.disabled = true;
  terms.addEventListener('change', () => {
    accept.disabled = !terms.checked;
    decline.disabled = !terms.checked;
  });
  await showStage(consent);
  localizeDOM(consent);
  const choice = await Promise.race([
    waitForClick(accept).then(()=>'accept'),
    waitForClick(decline).then(()=>'decline'),
  ]);
  if (choice === 'accept') {
    acceptStorageConsent();
    persistPreferencesAfterConsent();
    // The bytes are already in memory; now it is permitted to write cache.
    setLoadingStatus('ALMACENANDO RECURSOS', .98);
    await persistAssetCache();
  } else {
    declineStorageConsent();
  }
  audio.setMuted(!getPreferences().audio);
  audio.unlockPlayback();
  await hideStage(consent);
}

async function prepareEntireLanguage() {
  const lang = getLanguage();
  if (lang === 'es') return;
  // Traducciones fijas y en caché quedan listas antes de enseñar cualquier
  // ventana; lo restante se prepara como lote, sin cambios progresivos.
  if (localizing) await showStage(localizing);
  const fill = document.getElementById('boot-localizing-fill');
  const info = document.getElementById('boot-localizing-label');
  try {
    const result = await prepareLanguage(lang, {
      includeGame: true,
      onProgress: ratio => {
        if (fill) fill.style.width = `${Math.round(100 * ratio)}%`;
      },
    });
    if (info) info.textContent = result.missing > 0
      ? translateSync('IDIOMA PREPARADO · ALGUNOS TEXTOS NO DISPONIBLES')
      : translateSync('IDIOMA LISTO');
    if (fill) fill.style.width = '100%';
  } catch (error) {
    console.warn('La traducción integral no está disponible; se utilizarán los catálogos locales.', error);
  }
  localizeDOM(document);
  window.dispatchEvent(new CustomEvent('sms-language-changed', { detail:{language:lang} }));
  await delay(400);
  if (localizing) await hideStage(localizing);
}

async function playLogoIntro() {
  if (!getPreferences().animations) return;
  const introAvailable = await fetch('/logo-intro.mp4', { method: 'HEAD' }).then(r => r.ok && (r.headers.get('content-type') || '').includes('video')).catch(() => false);
  if (!introAvailable) return;
  introVideo.src = assetUrl('/logo-intro.mp4');
  introVideo.preload = 'auto';
  introVideo.volume = Math.min(.16,getPreferences().musicVolume);
  introVideo.muted = !getPreferences().audio;
  await showStage(intro);
  const ended = new Promise(resolve => {
    const stop = () => {
      introVideo.removeEventListener('ended',stop);
      introVideo.removeEventListener('error',stop);
      resolve();
    };
    introVideo.addEventListener('ended',stop);
    introVideo.addEventListener('error',stop);
  });
  void introVideo.play().catch(async () => {
    introVideo.muted=true;
    try { await introVideo.play(); }
    catch { introVideo.dispatchEvent(new Event('error')); }
  });
  // La intro se reproduce completa; el límite de seguridad solo evita un bloqueo
  // por codecs incompatibles o un archivo dañado.
  const safety = Number.isFinite(introVideo.duration) && introVideo.duration > 0
    ? Math.max(25000, (introVideo.duration + 8) * 1000) : 90000;
  await Promise.race([ended,delay(safety)]);
  introVideo.pause();
  await hideStage(intro);
}

async function runWelcome() {
  if (startedSequence || !gameReady || !assetsReady) return;
  startedSequence=true;
  const elapsed=performance.now()-startedAt;
  if (elapsed<MIN_LOADING_MS) await delay(MIN_LOADING_MS-elapsed);
  boot.classList.add('ready');
  bootProgress.style.width='100%';
  setLoadingStatus('SISTEMAS LISTOS',.98);
  bootProgress.style.width='100%';
  await delay(350);
  await hideStage(bootInner);
  if (firstVisit) {
    await showDeviceTips();
    await showFirstDialog();
    await showSecondDialog();
    await prepareEntireLanguage();
    await playLogoIntro();
  } else {
    // Jugadores recurrentes también reciben todas las traducciones antes del menú.
    await prepareEntireLanguage();
  }
  window.__SMS_INTRO_COMPLETE__=true;
  window.dispatchEvent(new Event('sms-intro-complete'));
  boot.classList.add('hidden');
}

function tryWelcome() {
  void runWelcome().catch(error=>{
    console.error('Error en la bienvenida',error);
    window.__SMS_INTRO_COMPLETE__=true;
    window.dispatchEvent(new Event('sms-intro-complete'));
    boot.classList.add('hidden');
  });
}

window.addEventListener('sms-ready',()=>{
  gameReady=true;
  if (assetsReady) tryWelcome();
  else setLoadingStatus('PREPARANDO AUDIO Y VIDEO',.91);
});
preloadAssets(onLoadProgress).then(()=>{
  assetsReady=true;
  restoreTranslationCache();
  if (gameReady) tryWelcome();
  else setLoadingStatus('RENDERIZANDO ENTORNOS',.96);
}).catch(error=>{
  console.error('Error al precargar recursos',error);
  assetsReady=true;
  tryWelcome();
});

installSettingsDialog();
function updateMotionPreference() {
  document.documentElement.classList.toggle('sms-reduced-animations',!getPreferences().animations);
}
window.addEventListener('sms-preferences-changed',updateMotionPreference);
updateMotionPreference();
localizeDOM(document);


/* MEGA Genesis integration: Phaser map is created by the host entrypoint. */
window.addEventListener('mega-map-ready', () => window.dispatchEvent(new Event('sms-ready')));
if (window.__MEGA_MAP_READY__) queueMicrotask(() => window.dispatchEvent(new Event('sms-ready')));
window.addEventListener('sms-intro-complete', () => {
  const adapter = {
    events: { on(){}, off(){}, once(){} },
    newGame() { window.__MEGA_ENTER_MAP__?.(); },
    continueGame() { window.__MEGA_ENTER_MAP__?.(); },
    openInfo(type) {
      if (type === 'credits') {
        showCredits();
      } else if (type === 'controls') {
        window.alert('WASD o flechas: mover. E: interactuar. ESC: pausa.');
      }
    }
  };
  mountTitleOverlay(adapter);
});
