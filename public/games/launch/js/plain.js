// Comparaciones y formatos para explicar números a estudiantes de secundaria.
// Funciones puras (sin DOM): se prueban con Node.
//
// Idea: primero la imagen cotidiana, después el número. Todas las equivalencias son
// aproximadas y están pensadas para entender el orden de magnitud, no para medir.

const nf = (value, digits = 0) => value.toLocaleString('es', { maximumFractionDigits: digits });

// Objetos de referencia para la masa (kg). Valores típicos, redondeados.
export const MASS_REFERENCES = [
  { kg: 2, one: 'una laptop', many: 'laptops', g: 'f' },
  { kg: 70, one: 'una persona adulta', many: 'personas adultas', g: 'f' },
  { kg: 950, one: 'un carro pequeño', many: 'carros pequeños', g: 'm' },
  { kg: 5000, one: 'un elefante africano', many: 'elefantes africanos', g: 'm' },
  { kg: 12000, one: 'un bus escolar', many: 'buses escolares', g: 'm' },
];

// Una casa sencilla ≈ 250.000 USD (dato aproximado para el juego).
export const HOUSE_MUSD = 0.25;
// Costa Rica mide unos 450 km de largo (de la frontera norte a la sur, en línea recta).
export const COSTA_RICA_KM = 450;

export function fmtNumber(value, digits = 0) {
  return nf(value, digits);
}

export function fmtKg(kg) {
  const value = Math.round(kg);
  return value >= 10000 ? `${nf(value / 1000, 1)} toneladas` : `${nf(value)} kg`;
}

export function fmtMUSD(m) {
  if (Math.abs(m) >= 1000) return `${nf(m / 1000, 2)} mil millones de dólares`;
  if (Math.abs(m) < 1) return `${nf(m * 1000, 0)} mil dólares`;
  return `${nf(m, m % 1 ? 1 : 0)} millones de dólares`;
}

export const fmtPct = (fraction) => `${nf(fraction * 100, 1)} %`;

/** "casi lo mismo que un carro pequeño", "como unos 10 elefantes africanos"… */
export function massLike(kg) {
  if (kg < 1) return 'menos que una botella de agua';
  if (kg < 2) return 'como una laptop';
  let ref = MASS_REFERENCES[0];
  for (const r of MASS_REFERENCES) if (kg >= r.kg * 0.85) ref = r;
  const n = kg / ref.kg;
  if (n < 1.15) return `casi lo mismo que ${ref.one}`;
  if (n < 1.9) return `como ${ref.one} y medio`;
  const rounded = n < 10 ? Math.round(n) : Math.round(n / 5) * 5;
  return `como ${ref.g === 'f' ? 'unas' : 'unos'} ${nf(rounded)} ${ref.many}`;
}

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
