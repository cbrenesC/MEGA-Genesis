import Phaser from 'phaser';
import { GAME } from '../config.js';

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'astronaut-idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.scene = scene;
    this.setDepth(y + 30);
    this.setScale(1);
    this.body.setSize(16, 14);
    this.body.setOffset(4, 15);
    this.body.setCollideWorldBounds(true);
    this.body.setMaxVelocity(GAME.playerSpeed, GAME.playerSpeed);
    this.setOrigin(0.5, 0.72);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys('W,A,S,D,E,ESC');
    this.walking = false;
    this.stepClock = 0;
    this.frameIndex = 0;
    this.idleClock = 0;
    this.isBlinking = false;
  }

  update(time, delta) {
    let x = Number(this.cursors.right.isDown || this.keys.D.isDown) - Number(this.cursors.left.isDown || this.keys.A.isDown);
    let y = Number(this.cursors.down.isDown || this.keys.S.isDown) - Number(this.cursors.up.isDown || this.keys.W.isDown);
    const mobile = this.scene.mobileDirection ?? { x: 0, y: 0 };
    x += mobile.x;
    y += mobile.y;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    this.body.setVelocity(x * GAME.playerSpeed, y * GAME.playerSpeed);

    this.walking = Boolean(x || y);
    if (this.walking) {
      this.stepClock += delta;
      if (Math.abs(x) > 0.1) this.setFlipX(x < 0);
      if (this.stepClock >= 130) {
        this.stepClock = 0;
        this.frameIndex = (this.frameIndex + 1) % 2;
        this.setTexture(this.frameIndex ? 'astronaut-step-a' : 'astronaut-step-b');
      }
    } else {
      this.stepClock = 0;
      this.frameIndex = 0;
      this.idleClock += delta;
      if (!this.isBlinking && this.idleClock >= 2450) {
        this.isBlinking = true;
        this.idleClock = 0;
        this.setTexture('astronaut-idle-blink');
      } else if (this.isBlinking && this.idleClock >= 130) {
        this.isBlinking = false;
        this.idleClock = 0;
        this.setTexture('astronaut-idle');
      } else if (!this.isBlinking) this.setTexture('astronaut-idle');
    }
    this.setDepth(this.y + 30);
  }
}
