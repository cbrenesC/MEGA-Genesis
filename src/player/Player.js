import Phaser from 'phaser';
import { GAME } from '../config.js';
import { getPreferences } from '../welcome/core/consent.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'top-astro-down-0');
    this.setOrigin(.5, .85).setScale(2).setDepth(y + 6);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.body.setSize(10, 7);
    this.body.setOffset(5, 12);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(GAME.playerSpeed, GAME.playerSpeed);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,E,ESC');
    this.facing = 'down';
  }

  update() {
    const mobile = this.scene.mobileDirection;
    let x = Number(this.cursors.right.isDown || this.keys.D.isDown || mobile.x > 0)
      - Number(this.cursors.left.isDown || this.keys.A.isDown || mobile.x < 0);
    let y = Number(this.cursors.down.isDown || this.keys.S.isDown || mobile.y > 0)
      - Number(this.cursors.up.isDown || this.keys.W.isDown || mobile.y < 0);
    if (x || y) {
      const horizontal = x < 0 ? 'left' : 'right';
      const vertical = y < 0 ? 'up' : 'down';
      if (!y || (x && (this.facing === 'left' || this.facing === 'right'))) this.facing = horizontal;
      else this.facing = vertical;

      if (getPreferences().animations) this.play(`crew-astro-walk-${this.facing}`, true);
      else this.setIdlePose();

      if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      this.body.setVelocity(x * GAME.playerSpeed, y * GAME.playerSpeed);
    } else {
      this.body.stop();
      this.setIdlePose();
    }
    this.setDepth(this.y + 6);
  }

  setIdlePose() {
    this.anims.stop();
    const key = `top-astro-${this.facing}-0`;
    if (this.texture.key !== key) this.setTexture(key);
  }
}
