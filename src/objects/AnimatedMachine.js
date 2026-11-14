export class AnimatedMachine {
  constructor(scene, { x, y, texture, type = 'server', scale = 1, depth = null, sprite = null }) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.type = type;
    this.sprite = sprite ?? scene.add.image(x, y, texture).setScale(scale);
    this.sprite.setDepth(depth ?? y + 18);
    this.attachAmbientDetail();
  }

  attachAmbientDetail() {
    const scene = this.scene;
    if (this.type === 'server' || this.type === 'status') {
      const lightColors = ['#5ce4da', '#ff9a54', '#62b8db'];
      [-13, 1, 15].forEach((offset, index) => {
        const lamp = scene.add.image(this.x + offset, this.y - 26, 'warning-light');
        lamp.setTint(lightColors[index]).setScale(.62).setDepth(this.y + 26);
        scene.tweens.add({ targets: lamp, alpha: .22, duration: 660 + index * 170, yoyo: true, repeat: -1, delay: index * 140 });
      });
    }
    if (this.type === 'fan') {
      const rotor = scene.add.image(this.x, this.y, 'fan-blades').setScale(.73).setDepth(this.y + 21);
      scene.tweens.add({ targets: rotor, angle: 360, duration: 3100, repeat: -1 });
    }
    if (this.type === 'robot-arm') {
      scene.tweens.add({ targets: this.sprite, angle: { from: -2, to: 2 }, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const spark = scene.add.image(this.x + 21, this.y - 28, 'warning-light').setTint('#ffb064').setScale(.38).setDepth(this.y + 35).setAlpha(0);
      scene.tweens.add({ targets: spark, alpha: { from: 0, to: .95 }, duration: 110, yoyo: true, repeat: -1, repeatDelay: 2400 + Math.random() * 1100 });
    }
    if (this.type === 'steam') {
      this.emitSteam();
    }
  }

  emitSteam() {
    const puff = this.scene.add.image(this.x, this.y, 'steam-puff').setDepth(this.y + 12).setAlpha(0).setScale(.35);
    const reset = () => {
      if (!puff.active) return;
      puff.setPosition(this.x + (Math.random() * 10 - 5), this.y).setAlpha(.24).setScale(.3);
      this.scene.tweens.add({
        targets: puff, y: this.y - 34 - Math.random() * 20, x: this.x + (Math.random() * 16 - 8),
        alpha: 0, scale: .9 + Math.random() * .4, duration: 1750 + Math.random() * 500,
        ease: 'Sine.easeOut', onComplete: reset,
      });
    };
    this.scene.time.delayedCall(Math.random() * 1700, reset);
  }

  destroy() { this.sprite?.destroy(); }
}
