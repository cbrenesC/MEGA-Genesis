// Roles and character designs are carried over from demogame's BaseWorld.
const handbook = 'https://science.nasa.gov/wp-content/uploads/2023/04/nasa_systems_engineering_handbook_0.pdf';

export const CREW = [
  { id: 'kade', name: 'Durman', texture: 'top-npc-technician', route: [[121, 548], [121, 612], [159, 612]], accent: '#a1e8aa',
    source: 'https://standards.nasa.gov/standard/NASA/NASA-STD-4010' },
  { id: 'rios', name: 'Josué', texture: 'top-npc-engineer', route: [[1159, 548], [1159, 612], [1121, 612]], accent: '#ffc996', source: handbook },
  { id: 'vega', name: 'Luis Eduardo', texture: 'top-npc-director', route: [[475, 694], [536, 694], [536, 726]], accent: '#a9cdff', source: handbook },
  { id: 'sol', name: 'Johana', texture: 'top-npc-scientist', route: [[805, 694], [744, 694], [744, 726]], accent: '#f3d6f0',
    source: handbook },
];
