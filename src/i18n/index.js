import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import { getPreferences, updatePreferences } from '../welcome/core/consent.js';

const catalogs = { en, es };
const supported = (locale) => Object.prototype.hasOwnProperty.call(catalogs, locale);
export const normalizeLanguage = (locale) => supported(locale) ? locale : 'en';
const requestedLanguage = new URL(location.href).searchParams.get('lang');
let language = supported(requestedLanguage) ? requestedLanguage : normalizeLanguage(getPreferences().language);

export const getLanguage = () => language;

export function t(key, params = {}, locale = language) {
  const value = catalogs[normalizeLanguage(locale)][key] ?? en[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}

const numberFormats = new Map();
export function formatNumber(value, digits = 0) {
  const key = `${language}:${digits}`;
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(language === 'es' ? 'es-CR' : 'en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }));
  }
  return numberFormats.get(key).format(value);
}

const localizedAttributes = {
  i18nAria: 'aria-label',
  i18nTitle: 'title',
  i18nAlt: 'alt',
  i18nContent: 'content',
  i18nLabel: 'label',
};
const selector = '[data-i18n],[data-i18n-aria],[data-i18n-title],[data-i18n-alt],[data-i18n-content],[data-i18n-label],[data-locale-link],[data-language-picker]';

export function localizeDOM(root = document) {
  const nodes = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
  for (const node of nodes) {
    if (node.dataset.i18n) node.textContent = t(node.dataset.i18n);
    for (const [dataKey, attribute] of Object.entries(localizedAttributes)) {
      if (node.dataset[dataKey]) node.setAttribute(attribute, t(node.dataset[dataKey]));
    }
    if (node.hasAttribute('data-language-picker')) node.value = language;
    if (node.hasAttribute('data-locale-link')) {
      const url = new URL(node.getAttribute('href'), location.href);
      url.searchParams.set('lang', language);
      node.href = url.pathname + url.search + url.hash;
    }
  }
  if (root === document) document.documentElement.lang = language;
}

export function setLanguage(locale, { remember = true } = {}) {
  language = normalizeLanguage(locale);
  if (remember) updatePreferences({ language });
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', language);
    history.replaceState(history.state, '', url);
  }
  localizeDOM();
  window.dispatchEvent(new CustomEvent('sms-language-changed', { detail: { language } }));
}

export function onLanguageChange(listener) {
  window.addEventListener('sms-language-changed', listener);
  return () => window.removeEventListener('sms-language-changed', listener);
}

export function bindLanguagePickers() {
  document.querySelectorAll('[data-language-picker]').forEach((picker) => {
    picker.addEventListener('change', () => setLanguage(picker.value));
  });
}

export function localizeTextObjects(scene, objects) {
  const remove = onLanguageChange(() => {
    for (const [textObject, key] of objects) textObject.setText(t(key));
  });
  scene.events.once('shutdown', remove);
}
