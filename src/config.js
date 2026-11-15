import { ROOM } from './map/controlRoomLayout.js';

export const GAME = {
  background: '#07111d',
  tileSize: 32,
  columns: 40,
  rows: 27,
  worldWidth: ROOM.width,
  worldHeight: ROOM.height,
  viewWidth: 1440,
  viewHeight: 900,
  playerSpeed: 186,
  media: {
    // Para contenido local: { src: '/media/tutorial.webp', type: 'image' }
    // o { src: '/media/simulacion.mp4', type: 'video' } en public/media/.
    src: '',
    type: '',
    // Optional key from both language catalogs for a shared opening announcement.
    announcementKey: '',
  },
};

export const ZONES = [
  { id: 'control', code: 'LCC · 01', title: 'map.room', shortTitle: 'map.zone', subtitle: 'map.roomHelp', x: ROOM.left, y: ROOM.top, width: ROOM.right - ROOM.left, height: ROOM.bottom - ROOM.top, floor: 2 },
];
export const CORRIDORS = [];
