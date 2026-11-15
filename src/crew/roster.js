// Roles and character designs are carried over from demogame's BaseWorld.
const handbook = 'https://science.nasa.gov/wp-content/uploads/2023/04/nasa_systems_engineering_handbook_0.pdf';

export const CREW = [
  { id: 'kade', name: 'Kade', texture: 'top-npc-technician', x: 121, y: 548, accent: '#a1e8aa',
    source: 'https://standards.nasa.gov/standard/NASA/NASA-STD-4010' },
  { id: 'rios', name: 'Ríos', texture: 'top-npc-engineer', x: 1159, y: 548, accent: '#ffc996', source: handbook },
  { id: 'vega', name: 'Vega', texture: 'top-npc-director', x: 475, y: 694, accent: '#a9cdff', source: handbook },
  { id: 'sol', name: 'Sol', texture: 'top-npc-scientist', x: 805, y: 694, accent: '#f3d6f0',
    source: 'https://www.nasa.gov/reference/environmental-control-and-life-support-systems-eclss/' },
];
