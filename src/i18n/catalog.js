import en from './en.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };

const catalogs = { en, es };
export const supported = locale => Object.prototype.hasOwnProperty.call(catalogs, locale);
export const normalizeLanguage = locale => supported(locale) ? locale : 'en';
let active = 'es'; // Headless rules/tests retain their original default.

export function setCatalogLanguage(locale) { active = normalizeLanguage(locale); }
export function catalogLanguage() { return active; }
export function message(key, params = {}, locale = active) {
  const value = catalogs[normalizeLanguage(locale)][key] ?? en[key] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
}

/** Simulation messages share the same English/Spanish catalogs as Mission Control. */
export function simText(key, ...values) { return message(`sim.${key}`, values); }
