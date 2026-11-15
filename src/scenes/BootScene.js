import Phaser from 'phaser';
import { createControlRoomArt } from '../map/controlRoomArt.js';
import { createAstronautAnimations, createCrewTextures } from '../crew/textures.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    this.cameras.main.setBackgroundColor('#07111d');
    createCrewTextures(this);
    createControlRoomArt(this);
    createAstronautAnimations(this);
    this.scene.start('SpaceCenterScene');
  }
}
