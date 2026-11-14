export const GAME = {
  title: 'Space Mission · Complejo orbital',
  background: '#07111d',
  tileSize: 32,
  columns: 40,
  rows: 30,
  worldWidth: 40 * 32,
  worldHeight: 30 * 32,
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
  { id: 'control', code: 'LCC · 01', title: 'Launch Control Center', shortTitle: 'MISSION CONTROL', subtitle: 'Explore the consoles. Press E to learn or launch a mission.', x: 128, y: 128, width: 1024, height: 704, floor: 2 },
];
export const CORRIDORS = [];
