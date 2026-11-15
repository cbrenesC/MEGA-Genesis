import Phaser from 'phaser';
// Mapa de la órbita: vista desde arriba de la Tierra con la trayectoria proyectada.
// Responde una pregunta: ¿tu órbita "cierra" (te quedas dando vueltas) o vas a caer?
//
// Se dibuja igual que el vuelo: en el lienzo pequeño de pixel art (render.js), con la misma Tierra de earth.js
// (continentes y nubes reales, con el sitio de lanzamiento donde está la plataforma).

import { PHYS, DEST, transferWindow, timeToApoapsis } from '../flight.js';
import { app, current } from '../store.js';
import { PixelView, drawGlobe, clipDisc, ring, line, disc } from './render.js';
import { globeView } from './earth.js';

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '—');
const fmtKm = (m) => `${Math.round(m / 1000).toLocaleString('es')} km`;
const D2R = Math.PI / 180;
const AU = 1.496e11;
const smooth01 = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

// Sistema Solar para el mapa (sólo se DIBUJA: la física del juego usa únicamente la gravedad de la Tierra).
// a = radio de la órbita alrededor del Sol (m) · L = posición aproximada en su órbita (grados, hacia el año 2000)
// r = radio del planeta (m) · soi = radio de su zona de influencia gravitacional (m)
const EARTH_L = 100;
const PLANETS = [
  { id: 'mercurio', name: 'Mercurio', a: 0.387 * AU, L: 252, r: 2.44e6, soi: 1.12e8, color: '#b0a79a' },
  { id: 'venus', name: 'Venus', a: 0.723 * AU, L: 182, r: 6.05e6, soi: 6.16e8, color: '#e8c97a' },
  { id: 'marte', name: 'Marte', a: 1.524 * AU, L: 355, r: 3.39e6, soi: 5.77e8, color: '#d9603a' },
  { id: 'jupiter', name: 'Júpiter', a: 5.203 * AU, L: 34, r: 6.99e7, soi: 4.82e10, color: '#d8a878' },
  { id: 'saturno', name: 'Saturno', a: 9.537 * AU, L: 50, r: 5.82e7, soi: 5.45e10, color: '#e6d39a', rings: true },
  { id: 'urano', name: 'Urano', a: 19.19 * AU, L: 313, r: 2.54e7, soi: 5.18e10, color: '#9fe0e6' },
  { id: 'neptuno', name: 'Neptuno', a: 30.07 * AU, L: 305, r: 2.46e7, soi: 8.66e10, color: '#4f78e0' },
];
const SUN = { x: -AU * Math.cos(EARTH_L * D2R), y: -AU * Math.sin(EARTH_L * D2R), r: 6.96e8 };
const MOON = { dist: 3.844e8, r: 1.737e6, soi: 6.61e7 };
const EARTH_SOI = 9.24e8;
export const MAP_ZOOM = { min: 3e-6, max: 40 };

const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class MapScene extends Phaser.Scene {
  constructor() { super('MapScene'); }

  create() {
    this.view = new PixelView(this, 'mapView');
    this.view.fit(this.scale.width, this.scale.height);
    this.onResize = () => this.view.fit(this.scale.width, this.scale.height);
    this.scale.on('resize', this.onResize);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize); this.view.destroy(); });
    const site = current()?.site;
    this.globe = globeView(site?.id, site?.latitudeDeg);
    // mismas letras que el panel del vuelo (monoespaciadas, en caja oscura con borde)
    const style = { fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", fontSize: '13px', color: '#eaf4ff', backgroundColor: 'rgba(6,13,26,.9)', padding: { x: 6, y: 3 } };
    this.txt = {};
    for (const k of ['apo', 'peri', 'impact', 'rocket', 'window', 'target', 'moon', 'soi', 'sun', 'earth', ...PLANETS.map((p) => p.id)]) this.txt[k] = this.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(5);
    this.status = this.add.text(0, 0, '', { ...style, fontSize: '16px', align: 'center', padding: { x: 12, y: 8 }, wordWrap: { width: 480 } }).setOrigin(0.5, 1).setDepth(6);
    this.scaleTxt = this.add.text(0, 0, '', { ...style, fontSize: '12px', color: '#9db6c4' }).setOrigin(0, 0).setDepth(6);
    this.stars = Array.from({ length: 150 }, (_, i) => ({ x: hash(i, 31), y: hash(i, 32), b: 0.3 + 0.7 * hash(i, 33), big: hash(i, 34) > 0.93 }));
  }

  update() {
    const sim = app.sim;
    if (!sim || !this.view?.ctx) return;
    const { width: W, height: H } = this.scale;
    const view = this.view; const ctx = view.ctx; const px = view.px; const m = view.margin;
    const LW = view.W; const LH = view.H;
    ctx.imageSmoothingEnabled = false;
    // fondo: espacio y estrellas
    ctx.fillStyle = '#04070f'; ctx.fillRect(0, 0, LW, LH);
    for (const s of this.stars) {
      const x = Math.floor(s.x * LW); const y = Math.floor(s.y * LH);
      ctx.fillStyle = `rgba(255,255,255,${(0.75 * s.b).toFixed(2)})`; ctx.fillRect(x, y, 1, 1);
      if (s.big) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
    }

    const el = sim.elements;
    const R = PHYS.RE;
    const tAlt = sim.targetAltKm * 1000;
    const farthest = Math.max(el.hyper || el.ra > 8e7 ? R * 4 : el.ra, R + tAlt, sim.r, R * 1.4);
    const cx = W * 0.5; const cy = H * 0.54;
    // zoom del jugador (rueda, pellizco o botones): al acercar, el mapa se centra en el cohete
    const z = app.mapZoom ?? 1;
    this.zoomShown = Math.exp(Math.log(this.zoomShown ?? z) + (Math.log(z) - Math.log(this.zoomShown ?? z)) * 0.25); // suave en escala logarítmica
    const zs = this.zoomShown;
    const scale = ((Math.min(W * 0.46, H * 0.4)) / Math.min(farthest * 1.08, R * 6.5)) * zs; // px de pantalla por metro
    const ft = Math.min(1, Math.max(0, (zs - 1.15) / 1.6)); const follow = ft * ft * (3 - 2 * ft);
    // al alejar muchísimo, el centro del mapa pasa suavemente de la Tierra al Sol (para ver todo el Sistema Solar)
    const toSun = smooth01((Math.log10(1 / zs) - 3.2) / 0.8);
    const ox = sim.x * follow + SUN.x * toSun; const oy = sim.y * follow + SUN.y * toSun;
    const S = (x, y) => [cx + (x - ox) * scale, cy - (y - oy) * scale]; // mundo → pantalla (para las etiquetas)
    const P = (x, y) => { const [sx, sy] = S(x, y); return [sx / px + m, sy / px + m]; }; // mundo → lienzo pequeño
    const k = scale / px; // píxeles del lienzo por metro
    const [ex, ey] = P(0, 0); // centro de la Tierra
    const visible = (x, y, pad = 40) => x > -pad && y > -pad && x < LW + pad && y < LH + pad;

    const hide = (...keys) => { for (const key of keys) this.setLabel(key, -999, -999, ''); };
    const dot = (wx, wy, rWorld, color, minR = 1) => { const [x, y] = P(wx, wy); const r = Math.max(minR, rWorld * k); if (visible(x, y, r + 4)) { if (r <= 1.2) { ctx.fillStyle = color; ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); } else clipDisc(ctx, x, y, r, LW, LH, color); } return [x, y]; };
    const label = (key, wx, wy, text, dy = -8) => { const [sx, sy] = S(wx, wy); if (sx > -60 && sy > 0 && sx < W + 60 && sy < H + 30) this.setLabel(key, sx, sy + dy, text); else hide(key); };

    // ---- Sistema Solar (sólo dibujo): Sol, órbitas de los planetas y sus zonas de influencia
    const auPx = AU * k; // 1 unidad astronómica en píxeles del lienzo
    if (auPx > 0.6 && auPx < 60000) {
      const [sunX, sunY] = P(SUN.x, SUN.y);
      ring(ctx, sunX, sunY, auPx, LW, LH, '#2f7fd0'); // órbita de la Tierra
      for (const pl of PLANETS) {
        const orbitPx = pl.a * k;
        if (orbitPx < 2) { hide(pl.id); continue; }
        ring(ctx, sunX, sunY, orbitPx, LW, LH, '#4a5d78');
        const wx = SUN.x + pl.a * Math.cos(pl.L * D2R); const wy = SUN.y + pl.a * Math.sin(pl.L * D2R);
        const [bx, by] = P(wx, wy);
        if (pl.soi * k > 3) ring(ctx, bx, by, pl.soi * k, LW, LH, pl.color, 24); // zona de influencia
        dot(wx, wy, pl.r, pl.color, 1.5);
        if (pl.rings && visible(bx, by)) { ctx.fillStyle = pl.color; ctx.fillRect(Math.round(bx) - 3, Math.round(by), 7, 1); }
        if (orbitPx > 14) label(pl.id, wx, wy, pl.name); else hide(pl.id);
      }
      // el Sol
      ctx.globalAlpha = 0.25; dot(SUN.x, SUN.y, SUN.r * 2.2, '#ffd24a', 5); ctx.globalAlpha = 1;
      dot(SUN.x, SUN.y, SUN.r, '#fff3b0', 3);
      if (auPx > 2.5) label('sun', SUN.x, SUN.y, 'Sol', -10); else hide('sun');
    } else hide('sun', ...PLANETS.map((pl) => pl.id));

    // ---- la Luna, su órbita y las zonas de influencia de la Tierra y de la Luna
    const moonPx = MOON.dist * k;
    if (moonPx > 2 && moonPx < 60000) {
      ring(ctx, ex, ey, moonPx, LW, LH, '#8f9bb0'); // órbita de la Luna
      // la Luna se dibuja donde llega la transferencia del juego (frente a la ventana de encendido)
      const ma = ((DEST.TLI?.windowDeg ?? 120) + 180) * D2R;
      const mx = MOON.dist * Math.cos(ma); const my = MOON.dist * Math.sin(ma);
      const [mpx, mpy] = P(mx, my);
      if (MOON.soi * k > 3) ring(ctx, mpx, mpy, MOON.soi * k, LW, LH, '#c9d3df', 16);
      dot(mx, my, MOON.r, '#d7dde6', 1.5);
      if (moonPx > 20) label('moon', mx, my, MOON.soi * k > 12 ? 'Luna · zona de influencia' : 'Luna'); else hide('moon');
    } else hide('moon');
    const soiPx = EARTH_SOI * k;
    if (soiPx > 5 && soiPx < 60000) {
      ring(ctx, ex, ey, soiPx, LW, LH, '#4fb4ff', 48);
      if (soiPx > 40) label('soi', 0, EARTH_SOI, 'Zona de influencia de la Tierra (924.000 km)'); else hide('soi');
    } else hide('soi');
    if (R * k < 3 && auPx > 10) label('earth', 0, 0, 'Tierra', -8); else hide('earth');

        // atmósfera (velos azules) y Tierra real: gira con el suelo, con el sitio de lanzamiento bajo la plataforma
    ctx.globalAlpha = 0.14; clipDisc(ctx, ex, ey, (R + 220000) * k, LW, LH, '#4f9bff');
    ctx.globalAlpha = 0.22; clipDisc(ctx, ex, ey, (R + 100000) * k, LW, LH, '#8fd0ff');
    ctx.globalAlpha = 1;
    if (R * k >= 2) {
      drawGlobe(ctx, LW, LH, ex, ey, R * k, sim.atmRate * sim.t - this.globe.siteAngle, this.globe.lon0);
      ring(ctx, ex, ey, R * k, LW, LH, '#bfe3ff');
    } else { ctx.fillStyle = '#3f8fe0'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3); }
    const near = (R + tAlt) * k > 6; // de cerca se ven los detalles de la órbita; de lejos estorban
    // límite del aire (150 km) y órbita pedida, a trazos
    if (near) {
      ring(ctx, ex, ey, (R + PHYS.PERI_OK) * k, LW, LH, '#ffd24a', 60);
      ring(ctx, ex, ey, (R + tAlt) * k, LW, LH, '#73ddcf', 40);
      const [tx, ty] = S(-(R + tAlt) * Math.SQRT1_2, -(R + tAlt) * Math.SQRT1_2);
      this.setLabel('target', tx - 10, ty + 24, `Órbita pedida: ${Math.round(tAlt / 1000)} km`);
    } else hide('target');

    // trayectoria proyectada (verde si cierra, roja si no)
    const p = el.h * el.h / PHYS.MU;
    const closes = el.periAlt >= PHYS.PERI_OK;
    const col = closes ? '#4fd18b' : '#ff6b6b';
    const dir = el.ccw ? 1 : -1;
    const nuMax = el.hyper ? Math.acos(-1 / el.e) * 0.985 : Math.PI;
    let prev = null;
    const N = 480;
    for (let i = 0; i <= N; i++) {
      const nu = -nuMax + (2 * nuMax * i) / N;
      const r = p / (1 + el.e * Math.cos(nu));
      if (r <= 0 || r > 2.2e9) { prev = null; continue; }
      const ang = el.periAngle + dir * nu;
      const pt = P(r * Math.cos(ang), r * Math.sin(ang));
      const inside = r < R;
      if (prev && !inside && !prev.inside && (visible(pt[0], pt[1], 400) || visible(prev.x, prev.y, 400))) {
        line(ctx, prev.x, prev.y, pt[0], pt[1], col);
        line(ctx, prev.x, prev.y + 1, pt[0], pt[1] + 1, col); // 2 px de grosor
      }
      prev = { x: pt[0], y: pt[1], inside };
    }
    // punto de impacto
    this.txt.impact.setText('');
    if (!closes && !el.hyper && el.periAlt < 0 && Math.abs((p / R - 1) / Math.max(el.e, 1e-9)) <= 1) {
      const nuHit = Math.acos((p / R - 1) / el.e);
      const ang = el.periAngle + dir * nuHit; // rama de bajada (después del apoapsis)
      const [ix, iy] = P(R * Math.cos(ang), R * Math.sin(ang));
      for (const o of [0, 1]) { line(ctx, ix - 3 + o, iy - 3, ix + 3 + o, iy + 3, '#ff3b3b'); line(ctx, ix + 3 + o, iy - 3, ix - 3 + o, iy + 3, '#ff3b3b'); }
      const [sx, sy] = S(R * Math.cos(ang), R * Math.sin(ang));
      this.setLabel('impact', sx, sy - 12, '💥 Aquí caerías');
    }
    // punto más alto y más bajo
    const apoAng = el.periAngle + Math.PI;
    if (!el.hyper) {
      const [ax, ay] = P(el.ra * Math.cos(apoAng), el.ra * Math.sin(apoAng));
      if (visible(ax, ay)) { disc(ctx, ax, ay, 2, '#ffd24a'); ring(ctx, ax, ay, 3, LW, LH, '#0b1424'); }
      const [sx, sy] = S(el.ra * Math.cos(apoAng), el.ra * Math.sin(apoAng));
      if (el.ra * k > 6) this.setLabel('apo', sx, sy - 10, `Punto más alto: ${fmtKm(el.apoAlt)} · en ${mmss(timeToApoapsis(sim))}`); else hide('apo');
    } else this.setLabel('apo', -999, -999, '');
    if (el.rp > R * 0.9) {
      const [qx, qy] = P(el.rp * Math.cos(el.periAngle), el.rp * Math.sin(el.periAngle));
      if (visible(qx, qy)) { disc(ctx, qx, qy, 2, closes ? '#4fd18b' : '#ff6b6b'); ring(ctx, qx, qy, 3, LW, LH, '#0b1424'); }
      const [sx, sy] = S(el.rp * Math.cos(el.periAngle), el.rp * Math.sin(el.periAngle));
      if (near) this.setLabel('peri', sx, sy - 10, `Punto más bajo: ${fmtKm(el.periAlt)}`); else hide('peri');
    } else this.setLabel('peri', -999, -999, '');

    // ventana de transferencia
    const d = DEST[sim.destId];
    this.txt.window.setText('');
    if (d.kind === 'transfer' && sim.orbitReached && near) {
      const w = transferWindow(sim);
      if (w) {
        const r = sim.r;
        const steps = 60;
        for (let i = 0; i <= steps; i++) {
          const a = w.start + (w.arc * i) / steps;
          const [qx, qy] = P(r * Math.cos(a), r * Math.sin(a));
          if (visible(qx, qy)) disc(ctx, qx, qy, 1, '#ffa24a');
        }
        const [wx, wy] = P(r * Math.cos(w.windowAngle), r * Math.sin(w.windowAngle));
        if (visible(wx, wy)) disc(ctx, wx, wy, 3, '#ffa24a');
        const [sx, sy] = S(r * Math.cos(w.windowAngle), r * Math.sin(w.windowAngle));
        this.setLabel('window', sx, sy - 12, w.waitS > 2 ? `Aquí enciendes · faltan ${mmss(w.waitS)}` : '¡Enciende ahora!');
      }
    }

    // cohete: la misma marca que en el vuelo con la cámara alejada, con una flecha hacia donde va
    const [rx0, ry0] = P(sim.x, sim.y);
    const rx = Math.round(rx0); const ry = Math.round(ry0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(rx - 1, ry - 1, 3, 3);
    ctx.fillStyle = '#73ddcf';
    for (const [dx, dy] of [[-4, -1], [-4, 0], [-4, 1], [4, -1], [4, 0], [4, 1], [-1, -4], [0, -4], [1, -4], [-1, 4], [0, 4], [1, 4]]) ctx.fillRect(rx + dx, ry + dy, 1, 1);
    const sp = Math.hypot(sim.vx, sim.vy) || 1;
    line(ctx, rx + (sim.vx / sp) * 5, ry - (sim.vy / sp) * 5, rx + (sim.vx / sp) * 10, ry - (sim.vy / sp) * 10, '#ffffff');
    const [srx, sry] = S(sim.x, sim.y);
    this.setLabel('rocket', srx, sry - 16, R * k >= 3 || auPx <= 10 ? 'Tú' : ''); // de lejos, la etiqueta «Tierra» ya marca dónde estás
    view.present(0, 0);
    // escala del mapa: cuánto mide un trozo de pantalla
    const barM = 80 / scale; // metros que caben en 80 px de pantalla
    const barTxt = barM > AU * 0.5 ? `${(barM / AU).toLocaleString('es', { maximumFractionDigits: 1 })} UA` : barM > 2e9 ? `${Math.round(barM / 1e9).toLocaleString('es')} millones de km` : `${Math.round(barM / 1000).toLocaleString('es')} km`;
    this.scaleTxt.setText(`├─ ${barTxt} ─┤  ·  aleja (−) para ver la Luna y el Sistema Solar`).setPosition(12, H - (W < 700 ? 250 : 190));

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
    t.setText(text); t.setPosition(Math.round(x), Math.round(y)); t.setVisible(Boolean(text));
  }
}
