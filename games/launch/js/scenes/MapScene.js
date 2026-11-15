import Phaser from 'phaser';
// Mapa de la órbita: vista desde arriba de la Tierra con la trayectoria proyectada.
// Responde una pregunta: ¿tu órbita "cierra" (te quedas dando vueltas) o vas a caer?

import { PHYS, DEST, DEG, orbitElements, transferWindow, timeToApoapsis } from '../flight.js';
import { app } from '../store.js';
import { gradientRect } from './gfx.js';

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '—');
const fmtKm = (m) => `${Math.round(m / 1000).toLocaleString('es')} km`;

export class MapScene extends Phaser.Scene {
  constructor() { super('MapScene'); }

  create() {
    this.g = this.add.graphics();
    const style = { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#eaf4ff', backgroundColor: 'rgba(5,12,24,.75)', padding: { x: 6, y: 3 } };
    this.txt = {};
    for (const k of ['apo', 'peri', 'impact', 'rocket', 'window', 'target']) this.txt[k] = this.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(5);
    this.status = this.add.text(0, 0, '', { ...style, fontSize: '17px', align: 'center', padding: { x: 12, y: 8 }, wordWrap: { width: 480 } }).setOrigin(0.5, 1).setDepth(6);
    this.stars = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3 }));
  }

  update() {
    const sim = app.sim;
    if (!sim) return;
    const { width: W, height: H } = this.scale;
    const g = this.g;
    g.clear();
    gradientRect(g, 0, 0, W, H, 0x03060f, 0x0a1426, 16);
    for (const s of this.stars) { g.fillStyle(0xffffff, 0.5); g.fillCircle(s.x * W, s.y * H, s.r); }

    const el = sim.elements;
    const R = PHYS.RE;
    const tAlt = sim.targetAltKm * 1000;
    const farthest = Math.max(el.hyper || el.ra > 8e7 ? R * 4 : el.ra, R + tAlt, sim.r, R * 1.4);
    const cx = W * 0.5; const cy = H * 0.54;
    const scale = (Math.min(W * 0.46, H * 0.4)) / Math.min(farthest * 1.08, R * 6.5);
    const P = (x, y) => [cx + x * scale, cy - y * scale];

    // Tierra y atmósfera
    for (let i = 4; i >= 0; i--) { g.fillStyle(0x4aa8ff, 0.05 * (5 - i)); g.fillCircle(cx, cy, (R + 100000 + i * 40000) * scale); }
    g.fillStyle(0x1d5da8, 1); g.fillCircle(cx, cy, R * scale);
    g.fillStyle(0x2f7a46, 0.9); g.fillEllipse(cx - R * scale * 0.25, cy - R * scale * 0.2, R * scale * 0.55, R * scale * 0.35);
    g.fillEllipse(cx + R * scale * 0.3, cy + R * scale * 0.3, R * scale * 0.4, R * scale * 0.3);
    g.lineStyle(2, 0x9fdcff, 0.9); g.strokeCircle(cx, cy, R * scale);
    // límite del aire (150 km)
    g.lineStyle(1, 0xffd24a, 0.6); this.dashed(g, cx, cy, (R + PHYS.PERI_OK) * scale);
    // órbita objetivo
    g.lineStyle(2, 0x73ddcf, 0.8); this.dashed(g, cx, cy, (R + tAlt) * scale);
    const [tx, ty] = P(-(R + tAlt) * Math.SQRT1_2, -(R + tAlt) * Math.SQRT1_2);
    this.setLabel('target', tx - 10, ty + 24, `Órbita pedida: ${Math.round(tAlt / 1000)} km`);

    // trayectoria proyectada
    const p = el.h * el.h / PHYS.MU;
    const closes = el.periAlt >= PHYS.PERI_OK;
    const col = closes ? 0x4fd18b : 0xff6b6b;
    const dir = el.ccw ? 1 : -1;
    const nuMax = el.hyper ? Math.acos(-1 / el.e) * 0.985 : Math.PI;
    let prev = null;
    g.lineStyle(3, col, 0.95);
    const N = 360;
    for (let i = 0; i <= N; i++) {
      const nu = -nuMax + (2 * nuMax * i) / N;
      const r = p / (1 + el.e * Math.cos(nu));
      if (r <= 0 || r > 2.2e9) { prev = null; continue; }
      const ang = el.periAngle + dir * nu;
      const x = r * Math.cos(ang); const y = r * Math.sin(ang);
      const inside = r < R;
      const pt = P(x, y);
      if (prev && !inside && !prev.inside) { g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(pt[0], pt[1]); g.strokePath(); }
      prev = { x: pt[0], y: pt[1], inside };
    }
    // puntos de impacto
    this.txt.impact.setText('');
    if (!closes && !el.hyper && el.periAlt < 0 && Math.abs((p / R - 1) / Math.max(el.e, 1e-9)) <= 1) {
      const nuHit = Math.acos((p / R - 1) / el.e);
      const ang = el.periAngle + dir * nuHit; // rama de bajada (después del apoapsis)
      const [ix, iy] = P(R * Math.cos(ang), R * Math.sin(ang));
      g.lineStyle(4, 0xff3b3b, 1); g.beginPath(); g.moveTo(ix - 9, iy - 9); g.lineTo(ix + 9, iy + 9); g.moveTo(ix + 9, iy - 9); g.lineTo(ix - 9, iy + 9); g.strokePath();
      this.setLabel('impact', ix, iy - 12, '💥 Aquí caerías');
    }
    // punto más alto y más bajo
    const apoAng = el.periAngle + Math.PI;
    if (!el.hyper) {
      const [ax, ay] = P(el.ra * Math.cos(apoAng), el.ra * Math.sin(apoAng));
      g.fillStyle(0xffd24a, 1); g.fillCircle(ax, ay, 6);
      this.setLabel('apo', ax, ay - 10, `Punto más alto: ${fmtKm(el.apoAlt)} · en ${mmss(timeToApoapsis(sim))}`);
    } else this.setLabel('apo', -999, -999, '');
    if (el.rp > R * 0.9) {
      const [qx, qy] = P(el.rp * Math.cos(el.periAngle), el.rp * Math.sin(el.periAngle));
      g.fillStyle(closes ? 0x4fd18b : 0xff6b6b, 1); g.fillCircle(qx, qy, 6);
      this.setLabel('peri', qx, qy - 10, `Punto más bajo: ${fmtKm(el.periAlt)}`);
    } else this.setLabel('peri', -999, -999, '');

    // ventana de transferencia
    const d = DEST[sim.destId];
    this.txt.window.setText('');
    if (d.kind === 'transfer' && sim.orbitReached) {
      const w = transferWindow(sim);
      if (w) {
        const r = sim.r;
        g.lineStyle(7, 0xffa24a, 0.95);
        g.beginPath();
        const steps = 30;
        for (let i = 0; i <= steps; i++) {
          const a = w.start + (w.arc * i) / steps;
          const [qx, qy] = P(r * Math.cos(a), r * Math.sin(a));
          i ? g.lineTo(qx, qy) : g.moveTo(qx, qy);
        }
        g.strokePath();
        const [wx, wy] = P(r * Math.cos(w.windowAngle), r * Math.sin(w.windowAngle));
        g.fillStyle(0xffa24a, 1); g.fillCircle(wx, wy, 7);
        this.setLabel('window', wx, wy - 12, w.waitS > 2 ? `Aquí enciendes · faltan ${mmss(w.waitS)}` : '¡Enciende ahora!');
      }
    }

    // cohete
    const [rx, ry] = P(sim.x, sim.y);
    const va = Math.atan2(-sim.vy, sim.vx);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(rx + Math.cos(va) * 11, ry + Math.sin(va) * 11, rx + Math.cos(va + 2.5) * 8, ry + Math.sin(va + 2.5) * 8, rx + Math.cos(va - 2.5) * 8, ry + Math.sin(va - 2.5) * 8);
    this.setLabel('rocket', rx, ry - 12, 'Tú');

    // mensaje de estado
    let text;
    if (d.kind === 'transfer' && sim.orbitReached) {
      text = sim.stats.transfer ? '🚀 Transferencia en marcha: mira cómo se estira tu órbita.' : '✔ Estás en órbita. Para el siguiente paso, enciende la transferencia dentro de la marca naranja.';
    } else if (closes) text = '✔ ¡Tu órbita cierra! Te quedas dando vueltas a la Tierra.';
    else if (el.hyper) text = '⚠ Vas tan rápido que escapas de la Tierra.';
    else text = `✖ Tu órbita no cierra: el punto más bajo (${fmtKm(el.periAlt)}) está dentro de la Tierra o del aire. Sigue acelerando de lado.`;
    this.status.setText(text).setPosition(W / 2, H - (W < 700 ? 215 : 150));
    this.status.setColor(closes || el.hyper ? '#bff5d6' : '#ffc4c4');
  }

  setLabel(key, x, y, text) {
    const t = this.txt[key];
    t.setText(text); t.setPosition(x, y); t.setVisible(Boolean(text));
  }

  dashed(g, cx, cy, r) {
    const n = 90;
    for (let i = 0; i < n; i += 2) {
      const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2;
      g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokePath();
    }
  }
}
