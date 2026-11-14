/**
 * Consentimiento para almacenamiento local de partidas y preferencias.
 * La cookie registra únicamente la aceptación; partidas y ajustes se guardan
 * en localStorage y nunca se persisten si no hay consentimiento.
 */
const CONSENT_COOKIE = 'sms_storage_consent';
const PREFERENCES_KEY = 'sms_preferences_v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
let sessionDecision = null;

export const DEFAULT_PREFERENCES = Object.freeze({ language: 'en', audio: true, animations: true, musicVolume: 0.18, effectsVolume: 0.45 });

export function hasStorageConsent() {
  if (sessionDecision !== null) return sessionDecision;
  return document.cookie.split(';').some(part => part.trim() === `${CONSENT_COOKIE}=accepted`);
}

export function hasConsentDecision() {
  return sessionDecision !== null || hasStorageConsent();
}

export function acceptStorageConsent() {
  sessionDecision = true;
  document.cookie = `${CONSENT_COOKIE}=accepted; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  window.dispatchEvent(new CustomEvent('sms-consent-changed', { detail: { accepted: true } }));
}

export function declineStorageConsent() {
  sessionDecision = false;
  // No crear cookies ni información persistente en caso de rechazo.
  window.dispatchEvent(new CustomEvent('sms-consent-changed', { detail: { accepted: false } }));
}

export function loadPreferences() {
  if (!hasStorageConsent()) return { ...DEFAULT_PREFERENCES };
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    // Migración de la preferencia anterior «video» a «animaciones/video».
    if (saved.animations === undefined && typeof saved.video === 'boolean') saved.animations = saved.video;
    return { ...DEFAULT_PREFERENCES, ...saved };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

let sessionPreferences = { ...loadPreferences() };

export function getPreferences() {
  return { ...sessionPreferences };
}

export function updatePreferences(next) {
  sessionPreferences = { ...sessionPreferences, ...next };
  if (hasStorageConsent()) {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(sessionPreferences)); }
    catch (error) { console.warn('No fue posible guardar las preferencias', error); }
  }
  window.dispatchEvent(new CustomEvent('sms-preferences-changed', { detail: getPreferences() }));
  return getPreferences();
}

export function persistPreferencesAfterConsent() {
  if (!hasStorageConsent()) return;
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(sessionPreferences)); }
  catch (error) { console.warn('No fue posible guardar las preferencias', error); }
}

export function clearPreferences() {
  sessionPreferences = { ...DEFAULT_PREFERENCES };
  if (hasStorageConsent()) {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
      // El formato anterior solo guardaba muted; descartar esos ajustes.
      localStorage.removeItem('sms_settings_v3');
    } catch (error) {
      console.warn('No fue posible borrar las preferencias', error);
    }
  }
  window.dispatchEvent(new CustomEvent('sms-preferences-changed', { detail: getPreferences() }));
  return getPreferences();
}
