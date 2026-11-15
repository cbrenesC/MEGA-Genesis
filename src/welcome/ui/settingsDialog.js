import { audio } from '../core/audio.js';
import {
  hasStorageConsent, getPreferences, updatePreferences,
  acceptStorageConsent, persistPreferencesAfterConsent, clearPreferences,
} from '../core/consent.js';
import { setLanguage, getLanguage, onLanguageChange, t } from '../../i18n/index.js';

export function installSettingsDialog() {
  const button = document.getElementById('settings-toggle');
  const dialog = document.getElementById('settings-dialog');
  if (!button || !dialog) return;

  function render() {
    const prefs = getPreferences();
    dialog.querySelector('[name="language"]').value = getLanguage();
    for (const key of ['audio', 'animations']) {
      dialog.querySelector(`[name="${key}"]`).checked = prefs[key];
    }
    for (const key of ['musicVolume', 'effectsVolume']) {
      dialog.querySelector(`[name="${key}"]`).value = Math.round(prefs[key] * 100);
      dialog.querySelector(`[data-value="${key}"]`).textContent = `${Math.round(prefs[key] * 100)}%`;
    }
    dialog.querySelector('.settings-storage-status').textContent = t(hasStorageConsent() ? 'settings.storageAllowed' : 'settings.storageDisabled');
    dialog.querySelector('[data-action="allow-storage"]').hidden = hasStorageConsent();
  }

  const open = () => {
    render();
    dialog.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    dialog.querySelector('[name="language"]').focus();
    window.dispatchEvent(new CustomEvent('sms-settings-toggled', { detail: { open: true } }));
  };
  const close = () => {
    dialog.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.focus();
    window.dispatchEvent(new CustomEvent('sms-settings-toggled', { detail: { open: false } }));
  };

  button.addEventListener('click', () => dialog.hidden ? open() : close());
  dialog.querySelector('[data-action="close-settings"]').addEventListener('click', close);
  dialog.querySelector('[data-action="allow-storage"]').addEventListener('click', () => {
    updatePreferences({ language: getLanguage() });
    acceptStorageConsent();
    persistPreferencesAfterConsent();
    render();
  });
  dialog.querySelector('[data-action="clear-preferences"]').addEventListener('click', () => {
    if (!window.confirm(t('settings.confirmClear'))) return;
    clearPreferences();
    audio.syncVolumes();
    setLanguage(getPreferences().language, { remember: false });
  });

  onLanguageChange(render);

  for (const control of dialog.querySelectorAll('input[name]')) {
    const update = () => {
      const value = control.type === 'range' ? Number(control.value) / 100 : control.checked;
      const prefs = updatePreferences({ [control.name]: value });
      if (control.name === 'audio') {
        audio.setMuted(!prefs.audio);
        if (prefs.audio) audio.unlockPlayback();
      } else {
        audio.syncVolumes();
      }
      render();
    };
    control.addEventListener(control.type === 'range' ? 'input' : 'change', update);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.hidden) {
      event.stopImmediatePropagation();
      close();
    }
  }, true);

  window.addEventListener('sms-preferences-changed', () => {
    if (!dialog.hidden) render();
  });
  window.addEventListener('sms-consent-changed', () => {
    if (!dialog.hidden) render();
  });

  window.__SMS_SETTINGS__ = { open, close };
}
