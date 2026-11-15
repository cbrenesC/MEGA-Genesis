import { CollisionManager } from './CollisionManager.js';
import { buildControlRoom } from './buildControlRoom.js';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.collision = new CollisionManager(scene);
    this.doors = [];
  }

  build() {
    this.scene.mediaScreen = buildControlRoom(this.scene, this.collision);
  }
}
