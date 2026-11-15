const DEPTH = 1400;

export class InteractionSignal {
  constructor(scene) {
    this.icon = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.zone = scene.add.zone(0, 0, 46, 44).setOrigin(.5).setDepth(DEPTH);
    this.zone.on('pointerup', () => scene.interact());
    this.active = null;
  }

  update(target, time = 0, animate = false) {
    if (!target) return this.hide();

    if (target !== this.active) {
      this.active = target;
      const warm = target.markerStyle === 'crew';
      const border = warm ? 0xffdf9d : 0x9ce6e9;
      const graphic = this.icon.clear();
      graphic.fillStyle(0x102332, .75).fillRect(-12, -12, 26, 24);
      graphic.fillStyle(border).fillRect(-12, -13, 24, 22);
      graphic.fillTriangle(-5, 8, 5, 8, 0, 14);
      graphic.fillStyle(0x193045).fillRect(-9, -10, 18, 16);
      graphic.fillStyle(border);
      if (warm) {
        for (const x of [-6, -1, 4]) graphic.fillRect(x, -4, 3, 3);
      } else {
        graphic.fillRect(-4, -7, 2, 11);
        graphic.fillRect(-3, -7, 7, 2);
        graphic.fillRect(-3, -3, 6, 2);
        graphic.fillRect(-3, 2, 7, 2);
      }
      this.icon.setVisible(true);
      this.zone.setInteractive({ useHandCursor: true });
    }
    const bob = animate ? Math.round(Math.sin(time / 210) * 3) : 0;
    const y = target.y + target.markerY + bob;
    this.icon.setPosition(target.x, y);
    this.zone.setPosition(target.x, y);
  }

  hide() {
    if (!this.active) return;
    this.active = null;
    this.icon.setVisible(false);
    this.zone.disableInteractive();
  }
}
