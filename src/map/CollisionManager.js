export class CollisionManager {
  constructor(scene) {
    this.scene = scene;
    this.solids = scene.physics.add.staticGroup();
    this.colliders = [];
  }

  addRect(x, y, width, height, label = 'obstacle') {
    const block = this.scene.add.rectangle(x, y, width, height, 0xffffff, 0);
    block.setName(label).setVisible(false).setActive(true);
    this.scene.physics.add.existing(block, true);
    block.body.setSize(width, height);
    block.body.updateFromGameObject();
    this.solids.add(block);
    this.colliders.push(block);
    return block;
  }

  addPerimeter(width, height) {
    const edge = 48;
    this.addRect(width / 2, 12, width, 24, 'northern boundary');
    this.addRect(width / 2, height - 12, width, 24, 'southern boundary');
    this.addRect(12, height / 2, 24, height, 'western boundary');
    this.addRect(width - 12, height / 2, 24, height, 'eastern boundary');
  }

  addDoorBlock(x, y, width, height, label) {
    return this.addRect(x, y, width, height, `door · ${label}`);
  }
}
