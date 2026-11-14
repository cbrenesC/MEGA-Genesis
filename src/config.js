export const GAME = {
  title: 'Space Mission · Complejo orbital',
  background: '#07111d',
  tileSize: 32,
  columns: 84,
  rows: 62,
  worldWidth: 84 * 32,
  worldHeight: 62 * 32,
  viewWidth: 1440,
  viewHeight: 900,
  playerSpeed: 186,
  media: {
    // Para contenido local: { src: '/media/tutorial.webp', type: 'image' }
    // o { src: '/media/simulacion.mp4', type: 'video' } en public/media/.
    src: '',
    type: 'image',
  },
};

export const ZONES = [
  { id: 'control', code: 'LCC · 01', title: 'Launch Control Center', shortTitle: 'CENTRO DE CONTROL', subtitle: 'Centro de operaciones de misión', x: 128, y: 128, width: 1024, height: 704, floor: 2 },
  { id: 'engineering', code: 'ENG · 02', title: 'Construction & Engineering', shortTitle: 'INGENIERÍA', subtitle: 'Taller de construcción aeroespacial', x: 1408, y: 128, width: 1024, height: 704, floor: 3 },
  { id: 'resources', code: 'RES · 03', title: 'Resource Management', shortTitle: 'GESTIÓN DE RECURSOS', subtitle: 'Depósitos y suministros del complejo', x: 128, y: 960, width: 1024, height: 704, floor: 4 },
  { id: 'launchpad', code: 'PAD · 04', title: 'Rocket Launch Pad', shortTitle: 'PLATAFORMA DE LANZAMIENTO', subtitle: 'Complejo exterior · plataforma orbital', x: 1408, y: 896, width: 1024, height: 768, floor: 5 },
];

export const CORRIDORS = [
  { x: 1152, y: 352, width: 256, height: 192, floor: 5 },
  { x: 512, y: 832, width: 256, height: 128, floor: 5 },
  { x: 1152, y: 1120, width: 256, height: 224, floor: 5 },
  { x: 1792, y: 832, width: 224, height: 64, floor: 5 },
];
