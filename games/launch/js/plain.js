// Formatos y frases para explicar números a estudiantes de secundaria.
// Funciones puras (sin DOM): se prueban con Node.
//
// Los PESOS se muestran siempre con su valor real (kg o toneladas), sin comparaciones con objetos:
// un cohete pesa cientos de toneladas y compararlo con carros o elefantes confunde más de lo que ayuda.

const nf = (value, digits = 0) => value.toLocaleString('es', { maximumFractionDigits: digits });

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
  return value >= 10000 ? `${nf(value / 1000, 1)} toneladas` : `${nf(value)} kg`;
}

/** Vida de la nave en palabras. Las misiones con tripulación (ida y vuelta) duran días, no años. */
export function lifeText(spacecraft, years) {
  if (spacecraft?.missionDays) return years > 0 ? `${spacecraft.missionDays} días de misión` : 'misión sin completar';
  return `${years} / ${spacecraft.designLifetimeYears} años`;
}

export function fmtMUSD(m) {
  if (Math.abs(m) >= 1000) return `${nf(m / 1000, 2)} mil millones de dólares`;
  if (Math.abs(m) < 1) return `${nf(m * 1000, 0)} mil dólares`;
  return `${nf(m, m % 1 ? 1 : 0)} millones de dólares`;
}

export const fmtPct = (fraction) => `${nf(fraction * 100, 1)} %`;

/** Frase de velocidad: "a 7,8 km/s cruzarías Costa Rica en 58 segundos". */
export function speedLike(kmS) {
  if (!(kmS > 0.3)) return '';
  const seconds = COSTA_RICA_KM / kmS;
  const time = seconds < 90 ? `${nf(seconds)} segundos` : `${nf(seconds / 60, 1)} minutos`;
  return `A ${nf(kmS, 1)} km/s cruzarías Costa Rica de punta a punta en ${time}`;
}

/** Frase de costo: "lo mismo que unas 300 casas". */
export function costLike(musd) {
  if (musd < 0.02) return 'menos que un celular';
  if (musd < 0.1) return `como ${nf(musd * 1000 / 25, 0)} carros nuevos`.replace('como 1 carros', 'como 1 carro');
  const houses = musd / HOUSE_MUSD;
  if (houses < 1.8) return 'como una casa sencilla';
  const n = houses < 10 ? Math.round(houses) : houses < 100 ? Math.round(houses / 5) * 5 : Math.round(houses / 50) * 50;
  return `lo mismo que unas ${nf(n)} casas`;
}

/** Probabilidad como frecuencia: 0,10 → "1 de cada 10". */
export function oneInN(probability) {
  if (probability <= 0) return 'casi nunca';
  const n = Math.max(1, Math.round(1 / probability));
  return n === 1 ? 'siempre' : `1 de cada ${nf(n)}`;
}

/** "de cada 100 lanzamientos, 92 salen bien". */
export function outOfHundred(reliability) {
  return `de cada 100 lanzamientos, ${nf(Math.round(reliability * 100))} salen bien`;
}

/** Porcentaje de masa que usa la nave dentro de lo que puede subir el cohete, en palabras. */
export function usesPart(fraction) {
  if (fraction < 0.3) return 'menos de la tercera parte';
  if (fraction < 0.55) return 'casi la mitad';
  if (fraction < 0.8) return 'más de la mitad';
  if (fraction < 0.95) return 'casi todo';
  return 'prácticamente todo';
}

/** Versión corta para espacios chicos: 17,5 M US$ · 2,2 mil M US$. */
export function fmtMUSDShort(m) {
  if (Math.abs(m) >= 1000) return `${nf(m / 1000, 1)} mil M US$`;
  if (Math.abs(m) < 1) return `${nf(m * 1000, 0)} mil US$`;
  return `${nf(m, 1)} M US$`;
}
