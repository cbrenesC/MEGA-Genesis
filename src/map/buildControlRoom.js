import { DISPLAY, ROOM, STATIONS } from './controlRoomLayout.js';
import { MediaScreen } from '../objects/MediaScreen.js';
import { ConsoleActivity } from './ConsoleActivity.js';
import { localizeTextObjects, t } from '../i18n/index.js';

export function buildControlRoom(scene, collision) {
  scene.add.image(0, 0, 'lcc-shell').setOrigin(0).setScale(2).setDepth(-100);

  collision.addRect(ROOM.left, 432, 36, 864, 'west bulkhead');
  collision.addRect(ROOM.right, 432, 36, 864, 'east bulkhead');
  collision.addRect(640, 152, 1280, 216, 'north bulkhead and panoramic display');
  collision.addRect(640, ROOM.bottom, 1280, 57, 'south bulkhead');

  function prop(key, x, y, body, depth = y + 4) {
    const image = scene.add.image(x, y, key).setOrigin(.5, .84).setScale(2).setDepth(depth);
    if (body) collision.addRect(x, y - 3, ...body, key);
    return image;
  }

  prop('lcc-main-desk', 640, 311, [365, 23], 285);
  const localizedLabels = [];
  for (const { x, y, mission } of STATIONS) {
    prop(mission ? 'lcc-lead-station' : 'lcc-station', x, y, [138, 44]);
    // Tucked under the workstation, but kept out of the approach path.
    prop('lcc-chair', x - 32, y + 28, [24, 14]);
    if (mission) {
      const key = `room.station.${mission}`;
      const identifier = scene.add.text(x + 11, y + 28, t(key), {
        fontFamily: 'monospace', fontSize: '11px', fontStyle: 'bold',
        color: '#ffead2', backgroundColor: '#243445',
        padding: { x: 5, y: 3 },
      }).setOrigin(.5).setDepth(y + 40);
      localizedLabels.push([identifier, key]);
    }
  }

  const rackPositions = [1044, 1100, 1156].map(x => ({ x, y: 263 }));
  for (const [i, { x, y }] of rackPositions.entries()) {
    const rack = prop('lcc-rack-' + i, x, y, [46, 40]);
    rack.setScale(1.66, 2);
  }
  prop('lcc-cabinet', 1202, 263, [49, 34]);

  for (const x of [261, 1019]) {
    prop('lcc-sofa', x, 712, [174, 38]);
    prop('lcc-table', x, 772, [92, 27]);
  }
  for (const x of [515, 765]) prop('lcc-trough', x, 787, [128, 25]);
  for (const [x, y] of [[101, 265], [1165, 367], [96, 699], [1184, 699], [126, 408]]) {
    prop('lcc-plant', x, y, [39, 22]);
  }

  scene.consoleActivity = new ConsoleActivity(scene, STATIONS, rackPositions);
  localizeTextObjects(scene, localizedLabels);
  return new MediaScreen(scene, DISPLAY);
}
