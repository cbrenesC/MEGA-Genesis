
import { mountTitleOverlay } from './ui/titleOverlay.js';
import { showCredits } from './ui/creditsDialog.js';
import { audio } from './core/audio.js';

import { installSettingsDialog } from './ui/settingsDialog.js';
import { getPreferences, updatePreferences, hasStorageConsent, acceptStorageConsent, declineStorageConsent, persistPreferencesAfterConsent } from './core/consent.js';
import { preloadAssets, assetUrl, persistAssetCache } from './core/assetLoader.js';
import { getLanguage, localizeDOM, bindLanguagePickers, t } from '../i18n/index.js';

const MIN_LOADING_MS = 3000;
const startedAt = performance.now();
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
const introVideo = document.getElementById('logo-intro-video');
const firstVisit = !hasStorageConsent();

function setLoadingStatus(span, fraction) {
  bootStatus.dataset.i18n = span;
  bootStatus.textContent = t(span);
  if (bootProgress) bootProgress.style.width = `${Math.round(Math.max(0,Math.min(.98,fraction))*100)}%`;
}
setLoadingStatus('boot.downloading', 0);

function onLoadProgress(progress) {
  const fraction = progress.phase === 'download'
    ? progress.ratio * .86
    : progress.phase === 'decode' ? .91
    : progress.phase === 'render' ? .95 : .97;
  const labels = {
    download:'boot.downloading',
    decode:'boot.media',
    render:'boot.rendering',
    ready:'boot.ready',
  };
  setLoadingStatus(labels[progress.phase] || 'boot.downloading', fraction);
}

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
  const continued = waitForClick(document.getElementById('setup-continue'));
  localizeDOM(setup);
  await showStage(setup);
  await continued;
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
  const decision = Promise.race([
    waitForClick(accept).then(()=>'accept'),
    waitForClick(decline).then(()=>'decline'),
  ]);
  localizeDOM(consent);
  await showStage(consent);
  const choice = await decision;
  if (choice === 'accept') {
    updatePreferences({ language: getLanguage() });
    acceptStorageConsent();
    persistPreferencesAfterConsent();
    // The bytes are already in memory; now it is permitted to write cache.
    setLoadingStatus('boot.caching', .98);
    await persistAssetCache();
  } else {
    declineStorageConsent();
  }
  audio.setMuted(!getPreferences().audio);
  audio.unlockPlayback();
  await hideStage(consent);
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
  setLoadingStatus('boot.ready',.98);
  bootProgress.style.width='100%';
  await delay(350);
  await hideStage(bootInner);
  if (firstVisit) {
    await showDeviceTips();
    await showFirstDialog();
    await showSecondDialog();
    await playLogoIntro();
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
  else setLoadingStatus('boot.media',.91);
});
preloadAssets(onLoadProgress).then(()=>{
  assetsReady=true;
  if (gameReady) tryWelcome();
  else setLoadingStatus('boot.rendering',.96);
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
localizeDOM();
bindLanguagePickers();

/* MEGA Genesis integration: Phaser map is created by the host entrypoint. */
window.addEventListener('mega-map-ready', () => window.dispatchEvent(new Event('sms-ready')));
if (window.__MEGA_MAP_READY__) queueMicrotask(() => window.dispatchEvent(new Event('sms-ready')));
window.addEventListener('sms-intro-complete', () => {
  const adapter = {
    events: { on(){}, off(){}, once(){} },
    newGame(options) { window.__MEGA_ENTER_MAP__?.(options); },
    openInfo(type) {
      if (type === 'credits') {
        showCredits();
      } else if (type === 'controls') {
        window.alert(t('home.controlsHelp'));
      }
    }
  };
  mountTitleOverlay(adapter);
});
