// MOCKS temporales: simulan lo que entregarán los módulos de nave, instrumentos,
// órbita y presupuesto. Cuando esos módulos existan, integration.js los leerá
// y este archivo solo servirá para el modo de práctica.
export const MOCK_PRESETS = {
  cubesat: {
    label: 'CubeSat 6U (estudiantil)',
    spacecraft: { name: 'CubeSat 6U', mass_kg: 10, fuel_kg: 1, design_life_years: 1, dimensions: { diameter_m: 0.25, height_m: 0.4 },
      instruments: [{ id: 'cam', name: 'Cámara', mass_kg: 2 }] },
    target_orbit: { id: 'SSO' }, budget_musd: 5, deadline_months: 12,
  },
  smallsat: {
    label: 'Smallsat de observación (180 kg)',
    spacecraft: { name: 'EarthWatch-1', mass_kg: 180, fuel_kg: 25, design_life_years: 3, dimensions: { diameter_m: 0.9, height_m: 1.3 },
      instruments: [{ id: 'cam', name: 'Cámara multiespectral', mass_kg: 35 }, { id: 'ir', name: 'Sensor infrarrojo', mass_kg: 20 }] },
    target_orbit: { id: 'SSO' }, budget_musd: 25, deadline_months: 18,
  },
  science: {
    label: 'Observatorio científico (1 800 kg)',
    spacecraft: { name: 'Observatorio Polar', mass_kg: 1800, fuel_kg: 300, design_life_years: 5, dimensions: { diameter_m: 2.4, height_m: 4.5 },
      instruments: [{ id: 'radar', name: 'Radar de apertura sintética', mass_kg: 420 }, { id: 'spec', name: 'Espectrómetro', mass_kg: 180 }, { id: 'cam', name: 'Cámara de alta resolución', mass_kg: 150 }] },
    target_orbit: { id: 'SSO' }, budget_musd: 90, deadline_months: 24,
  },
  geosat: {
    label: 'Satélite geoestacionario (5 000 kg)',
    spacecraft: { name: 'GeoCom-1', mass_kg: 5000, fuel_kg: 1500, design_life_years: 15, dimensions: { diameter_m: 2.8, height_m: 5.5 },
      instruments: [{ id: 'tx', name: 'Transpondedores', mass_kg: 600 }, { id: 'ant', name: 'Antenas desplegables', mass_kg: 350 }] },
    target_orbit: { id: 'GTO' }, budget_musd: 160, deadline_months: 30,
  },
  lunar: {
    label: 'Sonda lunar (900 kg)',
    spacecraft: { name: 'Selene-Probe', mass_kg: 900, fuel_kg: 400, design_life_years: 2, dimensions: { diameter_m: 1.8, height_m: 2.4 },
      instruments: [{ id: 'spec', name: 'Espectrómetro de neutrones', mass_kg: 60 }, { id: 'lidar', name: 'Altímetro láser', mass_kg: 45 }] },
    target_orbit: { id: 'TLI' }, budget_musd: 120, deadline_months: 36,
  },
  telescope: {
    label: 'Telescopio grande (6 200 kg)',
    spacecraft: { name: 'Deep-Telescope', mass_kg: 6200, fuel_kg: 300, design_life_years: 10, dimensions: { diameter_m: 4.5, height_m: 12.5 },
      instruments: [{ id: 'mirror', name: 'Espejo segmentado', mass_kg: 1500 }, { id: 'ir', name: 'Instrumentos infrarrojos', mass_kg: 700 }] },
    target_orbit: { id: 'TLI' }, budget_musd: 400, deadline_months: 48,
  },
};

export const MOCK_DEFAULT = 'science';

export function mockInput(presetId = MOCK_DEFAULT, difficulty = 'normal') {
  const p = structuredClone(MOCK_PRESETS[presetId]);
  return { ...p, difficulty, source: 'mock' };
}
