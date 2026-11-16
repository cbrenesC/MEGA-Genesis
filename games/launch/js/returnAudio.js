import { PHYS } from './flight.js';

// Sonidos del regreso de la cápsula. Módulo PURO: sólo decide QUÉ debe sonar y con qué fuerza a partir de la
// física del vuelo; quien reproduce los archivos es gameAudio.js.
//
// La caída por el aire se oye en dos capas:
//   · el escudo térmico "quemándose": manda el calor de la fricción. Aparece al entrar al aire, llega al máximo
//     en la parte más caliente y se apaga cuando la cápsula ya frenó y casi no se calienta;
//   · el viento de fondo: manda la fuerza del aire contra la cápsula. Sigue hasta tocar la superficie: fuerte en
//     la caída libre, más suave con los paracaídas pequeños y un soplo con los principales abiertos.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const RETURN_AUDIO = {
  BURN_MIN: 4e4, // W/m²: con menos calor que esto el escudo ya no suena
  BURN_FULL: 6e5, // W/m²: calor con el que suena a todo volumen
  WIND_FULL_Q: 3000, // Pa: presión del aire de una caída libre sin paracaídas (ahí el viento suena completo)
  WIND_DUCK: 0.65, // mientras el escudo ruge, el viento se oye así de tapado
};

/**
 * Fuerza (0–1) de los dos sonidos de la cápsula mientras cae por el aire de la Tierra: { burn, wind }.
 * Devuelve null cuando no le toca sonar (todavía en el vacío, con el módulo de servicio puesto, o ya en el suelo).
 */
export function capsuleAudioLevels(sim) {
  if (sim.status !== 'flying' || sim.body !== 'earth' || !sim.capsuleOnly || sim.altitude >= PHYS.ATM_TOP) return null;
  const heating = sim.stats.entryT != null ? sim.heat.flux : 0;
  const burn = clamp01((heating - RETURN_AUDIO.BURN_MIN) / (RETURN_AUDIO.BURN_FULL - RETURN_AUDIO.BURN_MIN)) ** 0.75;
  const wind = clamp01(sim.aero().q / RETURN_AUDIO.WIND_FULL_Q) ** 0.3 * (1 - RETURN_AUDIO.WIND_DUCK * burn);
  return { burn, wind };
}

/**
 * Efecto que toca cuando cambia el estado de los paracaídas (`sim.chuteState`): al salir los de frenado
 * (o al romperse por abrirlos demasiado rápido) y otra vez cuando se abren los principales.
 */
export function chuteEffect(before, now) {
  if (before === now) return null;
  return (before === 'none' && now !== 'none') || now === 'opening' ? 'parachute-deploy' : null;
}

/** Efecto del contacto con la superficie: amerizaje en el mar o golpe en tierra. Sólo para la cápsula. */
export function capsuleImpactEffect(sim, onWater) {
  if (sim.status !== 'ended' || sim.body !== 'earth' || !sim.capsuleOnly
    || (!sim.landing && sim.endReason !== 'crash')) return null;
  return onWater() ? 'capsule-splashdown' : 'capsule-land-impact';
}
