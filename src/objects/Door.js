export class Door {
  constructor(scene, collisionManager, { x, y, orientation = 'horizontal', label, open = true }) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.orientation = orientation;
    this.label = label;
    this.open = open;
    const horizontal = orientation === 'horizontal';
    this.visual = scene.add.image(x, y, open ? `door-${horizontal ? 'h' : 'v'}-open` : `door-${horizontal ? 'h' : 'v'}`);
    this.visual.setDepth(y + 15).setAlpha(1);
    this.visual.setScale(horizontal ? 1 : 1, horizontal ? 1 : 1);
    this.blocker = collisionManager.addDoorBlock(x, y, horizontal ? 96 : 26, horizontal ? 26 : 96, label);
    if (open) this.blocker.body.enable = false;
    this.scene.interactables.push({
      type: 'door', x, y, radius: 74,
      label: open ? `E · CERRAR ${label}` : `E · ABRIR ${label}`,
      interact: () => this.toggle(),
    });
  }

  toggle() {
    this.open = !this.open;
    const body = this.blocker.body;
    if (this.open) {
      body.enable = false;
      this.visual.setTexture(`door-${this.orientation === 'horizontal' ? 'h' : 'v'}-open`);
      this.scene.tweens.add({ targets: this.visual, alpha: 0.42, duration: 180, yoyo: true, repeat: 1 });
      this.scene.showNotice(`ACCESO ABIERTO · ${this.label.toUpperCase()}`);
    } else {
      const player = this.scene.player;
      const tooClose = player && Math.hypot(player.x - this.x, player.y - this.y) < 56;
      if (tooClose) {
        this.open = true;
        this.scene.showNotice('ALÉJATE DEL UMBRAL ANTES DE CERRAR');
        return;
      }
      body.enable = true;
      this.visual.setTexture(`door-${this.orientation === 'horizontal' ? 'h' : 'v'}`);
      this.scene.showNotice(`COMPuERTA CERRADA · ${this.label.toUpperCase()}`.toUpperCase());
    }
    const target = this.scene.interactables.find((item) => item.type === 'door' && item.x === this.x && item.y === this.y);
    if (target) target.label = this.open ? `E · CERRAR ${this.label}` : `E · ABRIR ${this.label}`;
  }
}
