import Phaser from 'phaser';
import { createSpaceTextures, createOpenDoorTextures } from '../assets/sprites.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    this.cameras.main.setBackgroundColor('#07111d');
    createSpaceTextures(this);
    createOpenDoorTextures(this);
    this.scene.start('SpaceCenterScene');
  }
}
