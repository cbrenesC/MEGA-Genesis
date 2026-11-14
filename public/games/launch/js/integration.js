// Capa de integración con el resto del juego.
//
// HOY el repo no tiene estado compartido entre módulos (cada módulo es una página
// independiente en /games/<nombre>/). Esta capa aísla ese hecho: si otro equipo
// define un mecanismo oficial, solo hay que cambiar ESTE archivo.
//
// Convención propuesta (documentada en LAUNCH_CHANGES.md §7):
//   - ENTRADA: objeto en window.MissionState.get() o en localStorage['spacemission.mission'].
//   - SALIDA : localStorage['spacemission.launch'] + evento 'spacemission:launch-result'
//              (y window.MissionState.set('launch', ...) si existe).
// Si no hay entrada válida se usan los MOCKS de mock.js.
import { mockInput } from './mock.js';

export const KEYS = { mission: 'spacemission.mission', launch: 'spacemission.launch', team: 'spacemission.launch.team' };

const safeStorage = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

/** Valida lo mínimo para poder operar; devuelve la lista de problemas. */
export function validateInput(inp, data) {
  const errs = [];
  if (!inp || typeof inp !== 'object') return ['entrada vacía'];
  if (!(inp.spacecraft?.mass_kg > 0)) errs.push('spacecraft.mass_kg debe ser > 0');
  if (!data.config.orbits[inp.target_orbit?.id]) errs.push('target_orbit.id debe ser LEO, SSO, GTO o TLI');
  if (typeof inp.budget_musd !== 'number') errs.push('budget_musd debe ser número');
  return errs;
}

/** Devuelve { input, source:'shared'|'mock', problems } */
export function loadInput(data, { preset, difficulty } = {}) {
  const shared = (typeof window !== 'undefined' && window.MissionState?.get?.()) || safeStorage.get(KEYS.mission);
  if (shared) {
    const problems = validateInput(shared, data);
    if (!problems.length) return { input: { difficulty: 'normal', ...shared, source: 'shared' }, source: 'shared', problems: [] };
    return { input: mockInput(preset, difficulty), source: 'mock', problems };
  }
  return { input: mockInput(preset, difficulty), source: 'mock', problems: [] };
}

/** Publica la decisión/resultado para el siguiente módulo y para los demás roles. */
export function publishResult(output) {
  safeStorage.set(KEYS.launch, output);
  try { window.MissionState?.set?.('launch', output); } catch { /* otro equipo puede no soportarlo aún */ }
  window.dispatchEvent(new CustomEvent('spacemission:launch-result', { detail: output }));
  try { window.parent !== window && window.parent.postMessage({ type: 'spacemission:launch-result', payload: output }, '*'); } catch { /* sin padre */ }
}

/** Guarda/lee las aprobaciones de equipo (solo en este navegador). */
export const team = {
  load: () => safeStorage.get(KEYS.team) || {},
  save: (t) => safeStorage.set(KEYS.team, t),
};
