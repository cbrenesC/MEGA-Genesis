import { PHYS } from './flight.js';

// Entra unos instantes antes del límite físico, con un tope para que el viento
// no suene durante el trayecto por el vacío.
export function playsReentryWind(sim) {
  if (sim.status !== 'flying' || sim.body !== 'earth' || !sim.capsuleOnly) return false;
  if (sim.stats.entryT != null && sim.altitude <= PHYS.ATM_TOP) return true;
  const descent = -sim.radialSpeed;
  return descent > 0 && sim.stats.maxAlt > PHYS.ATM_TOP * 1.5 && sim.speed > PHYS.ENTRY_SPEED
    && sim.altitude <= PHYS.ATM_TOP + Math.min(8000, descent * 4);
}

export function capsuleImpactEffect(sim, onWater) {
  if (sim.status !== 'ended' || sim.body !== 'earth' || !sim.capsuleOnly
    || (!sim.landing && sim.endReason !== 'crash')) return null;
  return onWater() ? 'capsule-splashdown' : 'capsule-land-impact';
}
