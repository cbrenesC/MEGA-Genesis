// Low-frequency telemetry and status LEDs kept in phase with the map clock.
export class ConsoleActivity {
  constructor(scene, stations, racks) {
    this.stations = stations;
    this.racks = racks;
    this.overlay = scene.add.graphics().setDepth(870).setVisible(false);
    this.step = null;
  }

  update(time, animate) {
    if (!animate) {
      this.overlay.setVisible(false);
      this.step = null;
      return;
    }
    const step = Math.floor(time / 160);
    if (this.step === step) return;
    this.step = step;
    const g = this.overlay.clear().setVisible(true);

    for (const [i, { x, y, mission }] of this.stations.entries()) {
      const left = x - 78;
      const top = Math.round(y - 44 * 2 * .84);
      const sweep = ((step + i * 3) % 18) * 2;
      g.fillStyle(0xa5ecfb, .28).fillRect(left + 35 + sweep, top + 16, 2, 18);
      g.fillStyle(mission ? 0xffcc83 : 0xa9ef9d, .72);
      for (let bar = 0; bar < 4; bar++) {
        const height = 2 + ((step * (bar + 2) + i * 7) % 6) * 2;
        g.fillRect(left + 77 + bar * 10, top + 22 - height, 2, height);
      }
      if ((step + i * 3) % 14 < 4) g.fillStyle(0xd2fff0, .84).fillRect(left + 120, top + 28, 4, 2);
    }

    for (const [i, { x, y }] of this.racks.entries()) {
      const top = Math.round(y - 59 * 2 * .84);
      const slot = (step + i * 2) % 5;
      const ledY = top + 36 + slot * 14;
      const ledX = Math.round(x - 12 + (step % 4) * 5);
      g.fillStyle(0x8eb972, .22).fillRect(ledX - 3, ledY - 2, 9, 6);
      g.fillStyle(slot === 4 ? 0xffc879 : 0xc2ff88, .85).fillRect(ledX, ledY, 4, 2);
    }
  }
}
