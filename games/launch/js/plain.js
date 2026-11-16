import { catalogLanguage, simText } from "../../../src/i18n/catalog.js";
// Formatos y frases para explicar números a estudiantes de secundaria.
// Funciones puras (sin DOM): se prueban con Node.
//
// Los PESOS se muestran siempre con su valor real (kg o toneladas), sin comparaciones con objetos:
// un cohete pesa cientos de toneladas y compararlo con carros o elefantes confunde más de lo que ayuda.

const nf = (value, digits = 0) => value.toLocaleString(catalogLanguage() === 'en' ? 'en-US' : 'es', { maximumFractionDigits: digits });

// Una casa sencilla ≈ 250.000 USD (dato aproximado para el juego).
export const HOUSE_MUSD = 0.25;
// Costa Rica mide unos 450 km de largo (de la frontera norte a la sur, en línea recta).
export const COSTA_RICA_KM = 450;

export function fmtNumber(value, digits = 0) {
  return nf(value, digits);
}

/** Peso real: kilogramos hasta 10 toneladas; de ahí en adelante, toneladas (1 tonelada = 1.000 kg). */
export function fmtKg(kg) {
  const value = Math.round(kg);
  return value >= 10000 ? simText("flight.0-metric-tons", nf(value / 1000, 1)) : `${nf(value)} kg`;
}

/** Vida de la nave en palabras. Las misiones con tripulación (ida y vuelta) duran días, no años. */
export function lifeText(spacecraft, years) {
  if (spacecraft?.missionDays) return years > 0 ? simText('flight.days-quantity', spacecraft.missionDays) : simText('flight.mission-incomplete');
  return simText('flight.year-count', years + ' / ' + spacecraft.designLifetimeYears);
}

export function fmtMUSD(m) {
  if (Math.abs(m) >= 1000) return simText("flight.0-billion-dollars", nf(m / 1000, 2));
  if (Math.abs(m) < 1) return simText("flight.0-thousand-dollars", nf(m * 1000, 0));
  return simText("flight.0-million-dollars", nf(m, m % 1 ? 1 : 0));
}

export const fmtPct = (fraction) => `${nf(fraction * 100, 1)} %`;

/** Frase de velocidad: "a 7,8 km/s cruzarías Costa Rica en 58 segundos". */
export function speedLike(kmS) {
  if (!(kmS > 0.3)) return '';
  const seconds = COSTA_RICA_KM / kmS;
  const time = seconds < 90 ? simText("flight.0-seconds", nf(seconds)) : simText("flight.0-minutes", nf(seconds / 60, 1));
  return simText("flight.at-0-km-s-you-could-cross-costa", nf(kmS, 1), time);
}

/** Frase de costo: "lo mismo que unas 300 casas". */
export function costLike(musd) {
  if (musd < 0.02) return simText("flight.less-than-a-phone-costs");
  if (musd < 0.1) {
    const cars = Math.round(musd * 1000 / 25);
    return cars === 1 ? simText("flight.about-as-much-as-one-new-car-2") : simText("flight.about-as-much-as-0-new-cars", nf(cars));
  }
  const houses = musd / HOUSE_MUSD;
  if (houses < 1.8) return simText("flight.about-as-much-as-a-modest-home");
  const n = houses < 10 ? Math.round(houses) : houses < 100 ? Math.round(houses / 5) * 5 : Math.round(houses / 50) * 50;
  return simText("flight.about-as-much-as-0-houses", nf(n));
}

/** Probabilidad como frecuencia: 0,10 → "1 de cada 10". */
export function oneInN(probability) {
  if (probability <= 0) return simText("flight.almost-never");
  const n = Math.max(1, Math.round(1 / probability));
  return n === 1 ? simText("flight.always") : simText("flight.1-in-0", nf(n));
}

/** "de cada 100 lanzamientos, 92 salen bien". */
export function outOfHundred(reliability) {
  return simText("flight.out-of-100-launches-0-succeed", nf(Math.round(reliability * 100)));
}

/** Porcentaje de masa que usa la nave dentro de lo que puede subir el cohete, en palabras. */
export function usesPart(fraction) {
  if (fraction < 0.3) return simText("flight.less-than-one-third");
  if (fraction < 0.55) return simText("flight.about-half");
  if (fraction < 0.8) return simText("flight.more-than-half");
  if (fraction < 0.95) return simText("flight.nearly-all");
  return simText("flight.practically-all");
}

/** Versión corta para espacios chicos: 17,5 M US$ · 2,2 mil M US$. */
export function fmtMUSDShort(m) {
  if (Math.abs(m) >= 1000) return simText("flight.0-billion-usd", nf(m / 1000, 1));
  if (Math.abs(m) < 1) return simText("flight.0-thousand-usd", nf(m * 1000, 0));
  return simText("flight.0-million-usd", nf(m, 1));
}
