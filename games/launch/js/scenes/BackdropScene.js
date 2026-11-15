import Phaser from 'phaser';
// Base de las escenas de decisión: un fondo de estrellas y de Tierra dibujado con Phaser,
// y un panel HTML encima con la información y los botones.

import { app, reducedMotion } from '../store.js';
import { bindScreens } from '../screens.js';
import { gradientRect } from './gfx.js';


export class BackdropScene extends Phaser.Scene {
  create() {
    this.stars = [];
    const { width, height } = this.scale;
    for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.9, r: Math.random() * 1.4 + 0.3, p: Math.random() * 6.28, s: 0.4 + Math.random() * 1.2 });
    this.g = this.add.graphics();
    this.t = 0;
    this.scale.on('resize', () => this.draw(0));
    this.draw(0);
    this.mount();
    this.events.once('shutdown', () => { this.scale.off('resize'); });
  }

  update(time, delta) {
    if (!reducedMotion()) { this.t += delta / 1000; this.draw(this.t); }
  }

  draw(t) {
    const { width, height } = this.scale;
    const g = this.g;
    g.clear();
    gradientRect(g, 0, 0, width, height, 0x050b16, 0x0b1a2e, 20);
    for (const s of this.stars) {
      const a = 0.35 + 0.35 * Math.sin(t * s.s + s.p);
      g.fillStyle(0xdbe9ff, Math.max(0.1, a));
      g.fillCircle(s.x * width, s.y * height, s.r);
    }
    // limbo de la Tierra
    const R = Math.max(width, height) * 1.4;
    const cx = width * 0.5; const cy = height + R * 0.86;
    for (let i = 5; i >= 0; i--) { g.fillStyle(0x4aa8ff, 0.035 * (6 - i)); g.fillCircle(cx, cy, R + i * 9); }
    g.fillStyle(0x0b2a4a, 1); g.fillCircle(cx, cy, R);
    g.fillStyle(0x12456f, 0.7); g.fillCircle(cx - R * 0.08, cy - R * 0.02, R * 0.985);
    g.lineStyle(2, 0x8fd3ff, 0.55); g.beginPath(); g.arc(cx, cy, R, -Math.PI, 0); g.strokePath();
  }

  /** Cada escena de decisión define render(). */
  render() { return ''; }

  mount() {
    const ui = document.getElementById('ui');
    ui.hidden = false;
    document.getElementById('hud').hidden = true;
    ui.innerHTML = this.render();
    ui.scrollTop = 0;
    bindScreens(ui, app.nav);
    app.nav.chrome(this.scene.key);
  }
}
