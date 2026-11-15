// Calibración del vuelo contra el catálogo.
//
//   node public/games/launch/tests/calibrate.mjs
//
// Cada cohete pesa lo que pesa de verdad (liftoffMassKg de data/launchers.json, dato publicado). Para cada
// lanzador y destino con capacidad, busca la eficiencia de motores (ispK) más baja con la que el PILOTO
// AUTOMÁTICO lleva esa capacidad al destino (ver calibrateIsp() en js/flight.js) y guarda el resultado
// en data/flight-calibration.json.
// Hay que volver a correrlo cada vez que cambie la física o los diseños de data/flight.json.
// tests/flight.test.mjs comprueba que lo guardado siga siendo válido.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calibrateIsp, designForDest } from '../js/flight.js';

const path = (name) => fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
const flightData = JSON.parse(readFileSync(path('flight'), 'utf8'));
const launchers = JSON.parse(readFileSync(path('launchers'), 'utf8')).launchers;
const out = { _about: 'Generado por tests/calibrate.mjs. stackKg = masa de las etapas (peso real publicado al despegue menos carga y cofia); ispK = eficiencia de motores calibrada; program = programa de inclinación del piloto automático que lo logra. No editar a mano.', generatedWith: 'flight.js v3 (masa real)', vehicles: {} };

for (const launcher of launchers) {
  const designId = flightData.vehicles[launcher.id]?.vehicleOf ?? launcher.id;
  const design = { id: designId, ...flightData.vehicles[designId] };
  const source = launchers.find((l) => l.id === designId);
  out.vehicles[launcher.id] = {};
  for (const [dest, cap] of Object.entries(source.capacityKg)) {
    if (cap == null) continue;
    if (launcher.id !== designId && out.vehicles[designId]?.[dest]) { out.vehicles[launcher.id][dest] = out.vehicles[designId][dest]; continue; }
    const t0 = Date.now();
    const r = calibrateIsp(designForDest(design, dest), dest, cap, source.liftoffMassKg, flightData);
    if (!r) { console.log(`✖ ${launcher.id} ${dest}: no se pudo calibrar`); continue; }
    out.vehicles[launcher.id][dest] = r;
    console.log(`✔ ${launcher.id.padEnd(12)} ${dest.padEnd(6)} cap ${String(cap).padStart(6)} kg → etapas ${String(r.stackKg).padStart(8)} kg · ispK ${r.ispK} (${Date.now() - t0} ms)`);
  }
}
writeFileSync(path('flight-calibration'), `${JSON.stringify(out, null, 1)}\n`);
console.log('Guardado data/flight-calibration.json');
