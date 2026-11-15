export const ROOM = { width: 1280, height: 864, left: 34, right: 1246, top: 36, bottom: 835 };
export const SPAWN = { x: 640, y: 750 };
export const DISPLAY = { x: 640, y: 171, width: 728, height: 188, accessX: 640, accessY: 333 };
export const STATIONS = [
  { x: 451, y: 322, id: 'launch', mission: 'launch' },
  { x: 829, y: 322, id: 'rover', mission: 'rover' },
  { x: 259, y: 431, id: 'objectives', setup: 'launch', part: 'mission' },
  { x: 451, y: 431, id: 'requirements', setup: 'launch', part: 'payload' },
  { x: 259, y: 573, id: 'systems', setup: 'launch', part: 'vehicle' },
  { x: 451, y: 573, id: 'testing', setup: 'launch', part: 'review' },
  { x: 829, y: 431, id: 'architecture', setup: 'rover', part: 'mobility' },
  { x: 1021, y: 431, id: 'design', setup: 'rover', part: 'power' },
  { x: 829, y: 573, id: 'ground', setup: 'rover', part: 'science' },
  { x: 1021, y: 573, id: 'operations', setup: 'rover', part: 'comms' },
];
