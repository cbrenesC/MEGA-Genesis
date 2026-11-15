export const ROOM = { width: 1280, height: 864, left: 34, right: 1246, top: 36, bottom: 835 };
export const SPAWN = { x: 640, y: 750 };
export const DISPLAY = { x: 640, y: 171, width: 728, height: 188, accessX: 640, accessY: 333 };
export const STATIONS = [
  { x: 451, y: 322, id: 'launch', mission: 'launch' },
  { x: 829, y: 322, id: 'rover', mission: 'rover' },
  ...[[431, ['objectives', 'requirements', 'architecture', 'design']],
    [573, ['systems', 'testing', 'ground', 'operations']]].flatMap(([y, ids]) =>
    [259, 451, 829, 1021].map((x, i) => ({ x, y, id: ids[i] }))),
];
