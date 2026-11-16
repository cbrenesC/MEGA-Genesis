import { simText } from "../../../../src/i18n/catalog.js";
import Phaser from 'phaser';
// Mapa de la órbita: vista desde arriba de la Tierra con la trayectoria proyectada.
// Responde una pregunta: ¿tu órbita "cierra" (te quedas dando vueltas) o vas a caer?
//
// Se dibuja igual que el vuelo: en el lienzo pequeño de pixel art (render.js), con la misma Tierra de earth.js
// (continentes y nubes reales, con el sitio de lanzamiento donde está la plataforma).

import { PHYS, DEST, transferWindow, timeToApoapsis } from '../flight.js';
import { app, current } from '../store.js';
import { PixelView, drawGlobe, drawMoonGlobe, clipDisc, ring, line, disc } from './render.js';
import { globeView } from './earth.js';
import { MOON as MOON_BODY, moonState, moonAngle } from '../bodies.js';
import { guidePrediction, signedPass } from '../lunar.js';

const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '—');
const dur = (s) => (!Number.isFinite(s) ? '—' : s >= 2 * 86400 ? simText("lunarFlight.0-days", (s / 86400).toLocaleString('es', { maximumFractionDigits: 1 })) : s >= 2 * 3600 ? `${Math.round(s / 3600)} h` : s >= 120 ? `${Math.round(s / 60)} min` : `${Math.max(0, Math.round(s))} s`);
const fmtKm = (m) => `${Math.round(m / 1000).toLocaleString('es')} km`;
const D2R = Math.PI / 180;
const AU = 1.496e11;
const smooth01 = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

// Sistema Solar para el mapa (sólo se DIBUJA: la física del juego usa únicamente la gravedad de la Tierra).
// a = radio de la órbita alrededor del Sol (m) · L = posición aproximada en su órbita (grados, hacia el año 2000)
// r = radio del planeta (m) · soi = radio de su zona de influencia gravitacional (m)
const EARTH_L = 100;
const PLANETS = [
  { id: 'mercurio', name: simText("flight.mercury"), a: 0.387 * AU, L: 252, r: 2.44e6, soi: 1.12e8, color: '#b0a79a' },
  { id: 'venus', name: 'Venus', a: 0.723 * AU, L: 182, r: 6.05e6, soi: 6.16e8, color: '#e8c97a' },
  { id: 'marte', name: simText("flight.mars"), a: 1.524 * AU, L: 355, r: 3.39e6, soi: 5.77e8, color: '#d9603a' },
  { id: 'jupiter', name: simText("flight.jupiter"), a: 5.203 * AU, L: 34, r: 6.99e7, soi: 4.82e10, color: '#d8a878' },
  { id: 'saturno', name: 'Saturno', a: 9.537 * AU, L: 50, r: 5.82e7, soi: 5.45e10, color: '#e6d39a', rings: true },
  { id: 'urano', name: 'Urano', a: 19.19 * AU, L: 313, r: 2.54e7, soi: 5.18e10, color: '#9fe0e6' },
  { id: 'neptuno', name: 'Neptuno', a: 30.07 * AU, L: 305, r: 2.46e7, soi: 8.66e10, color: '#4f78e0' },
];
const SUN = { x: -AU * Math.cos(EARTH_L * D2R), y: -AU * Math.sin(EARTH_L * D2R), r: 6.96e8 };
const MOON = { dist: 3.844e8, r: 1.737e6, soi: 6.61e7, SOI: MOON_BODY.SOI, R: MOON_BODY.R };
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
    for (const k of ['apo', 'peri', 'impact', 'rocket', 'window', 'target', 'moon', 'soi', 'sun', 'earth', 'enc', 'pmoon', 'burn', 'ret', ...PLANETS.map((p) => p.id)]) this.txt[k] = this.add.text(0, 0, '', style).setOrigin(0.5, 1).setDepth(5);
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
    // misión lunar: la Luna está donde está de verdad y, cerca de ella, el mapa se centra en la Luna
    const lunar = Boolean(sim.moon) && Boolean(app.lunarView);
    const moonNow = lunar ? moonState(sim.moon, sim.t, {}) : null;
    const bel = lunar && sim.body === 'moon' ? sim.bodyElements : null;
    const zPrev = this.zoomShown ?? (app.mapZoom ?? 1);
    const moonMode = Boolean(bel) && zPrev > 0.12;
    let farthest = Math.max(el.hyper || el.ra > 8e7 ? R * 4 : el.ra, R + tAlt, sim.r, R * 1.4);
    let fitCap = R * 6.5;
    if (moonMode) { const q = sim.rel(); const d = Math.hypot(q.x, q.y); farthest = bel.hyper || bel.ra > MOON.SOI ? Math.max(d * 1.2, MOON.R * 3) : Math.max(bel.ra * 1.1, MOON.R * 2.4); fitCap = MOON.SOI; } else if (lunar && sim.mission.tli) { farthest = MOON.dist * 1.1; fitCap = Infinity; }
    const cx = W * 0.5; const cy = H * 0.54;
    // zoom del jugador (rueda, pellizco o botones): al acercar, el mapa se centra en el cohete
    const z = app.mapZoom ?? 1;
    this.zoomShown = Math.exp(Math.log(this.zoomShown ?? z) + (Math.log(z) - Math.log(this.zoomShown ?? z)) * 0.25); // suave en escala logarítmica
    const zs = this.zoomShown;
    const scale = ((Math.min(W * 0.46, H * (lunar && !moonMode && sim.mission.tli ? 0.33 : 0.4))) / Math.min(farthest * 1.08, fitCap)) * zs; // px de pantalla por metro
    const ft = Math.min(1, Math.max(0, (zs - 1.15) / 1.6)); const follow = ft * ft * (3 - 2 * ft);
    // al alejar muchísimo, el centro del mapa pasa suavemente de la Tierra al Sol (para ver todo el Sistema Solar)
    const toSun = smooth01((Math.log10(1 / zs) - 3.2) / 0.8);
    const baseX = moonMode ? moonNow.x : 0; const baseY0 = moonMode ? moonNow.y : 0;
    const ox = baseX + (sim.x - baseX) * follow + SUN.x * toSun; const oy = baseY0 + (sim.y - baseY0) * follow + SUN.y * toSun;
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
      if (auPx > 2.5) label('sun', SUN.x, SUN.y, simText("flight.sun"), -10); else hide('sun');
    } else hide('sun', ...PLANETS.map((pl) => pl.id));

    // ---- la Luna, su órbita y las zonas de influencia de la Tierra y de la Luna
    const moonPx = MOON.dist * k;
    if (moonPx > 2 && moonPx < 60000) {
      ring(ctx, ex, ey, moonPx, LW, LH, '#8f9bb0'); // órbita de la Luna
      // la Luna: en las misiones lunares, donde está de verdad; en las demás, donde llega la transferencia del juego
      const ma = lunar ? moonAngle(sim.moon, sim.t) : ((DEST.TLI?.windowDeg ?? 120) + 180) * D2R;
      const mx = MOON.dist * Math.cos(ma); const my = MOON.dist * Math.sin(ma);
      const [mpx, mpy] = P(mx, my);
      if (MOON.soi * k > 3) ring(ctx, mpx, mpy, MOON.soi * k, LW, LH, '#c9d3df', 16);
      if (lunar && MOON.r * k >= 2) { if (visible(mpx, mpy, MOON.r * k + 4)) { drawMoonGlobe(ctx, LW, LH, mpx, mpy, MOON.r * k, -(ma + Math.PI)); ring(ctx, mpx, mpy, MOON.r * k, LW, LH, '#eef0f2'); } } else dot(mx, my, MOON.r, '#d7dde6', 1.5);
      if (moonPx > 20) label('moon', mx, my, MOON.soi * k > 12 ? simText('flight.moon-sphere-of-influence') : simText('flight.moon')); else hide('moon');
    } else hide('moon');
    const soiPx = EARTH_SOI * k;
    if (soiPx > 5 && soiPx < 60000) {
      ring(ctx, ex, ey, soiPx, LW, LH, '#4fb4ff', 48);
      if (soiPx > 40) label('soi', 0, EARTH_SOI, simText("flight.earth-s-sphere-of-influence-924-000-km")); else hide('soi');
    } else hide('soi');
    if (R * k < 3 && auPx > 10) label('earth', 0, 0, simText("flight.earth"), -8); else hide('earth');

        // atmósfera (velos azules) y Tierra real: gira con el suelo, con el sitio de lanzamiento bajo la plataforma
    ctx.globalAlpha = 0.14; clipDisc(ctx, ex, ey, (R + 220000) * k, LW, LH, '#4f9bff');
    ctx.globalAlpha = 0.22; clipDisc(ctx, ex, ey, (R + 100000) * k, LW, LH, '#8fd0ff');
    ctx.globalAlpha = 1;
    if (R * k >= 2) {
      drawGlobe(ctx, LW, LH, ex, ey, R * k, sim.atmRate * sim.t - this.globe.siteAngle, this.globe.lon0);
      ring(ctx, ex, ey, R * k, LW, LH, '#bfe3ff');
    } else { ctx.fillStyle = '#3f8fe0'; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 3, 3); }
    const near = (R + tAlt) * k > 6 && !moonMode; // de cerca se ven los detalles de la órbita; de lejos estorban
    // límite del aire (150 km) y órbita pedida, a trazos
    if (near) {
      ring(ctx, ex, ey, (R + PHYS.PERI_OK) * k, LW, LH, '#ffd24a', 60);
      ring(ctx, ex, ey, (R + tAlt) * k, LW, LH, '#73ddcf', 40);
      const [tx, ty] = S(-(R + tAlt) * Math.SQRT1_2, -(R + tAlt) * Math.SQRT1_2);
      this.setLabel('target', tx - 10, ty + 24, simText("flight.target-orbit-0-km", Math.round(tAlt / 1000)));
    } else hide('target');

    // misión lunar (ya en órbita): se dibuja la trayectoria predicha completa, con el paso por la Luna y el regreso
    const lunarTraj = lunar && sim.mission.leo;
    let lunarInfo = null;
    if (lunarTraj) lunarInfo = this.drawLunar(sim, { ctx, P, S, k, LW, LH, visible, hide, moonMode, moonNow });
    else hide('enc', 'pmoon', 'burn', 'ret');
    // trayectoria proyectada (verde si cierra, roja si no)
    const p = el.h * el.h / PHYS.MU;
    const closes = el.periAlt >= PHYS.PERI_OK;
    const col = closes ? '#4fd18b' : '#ff6b6b';
    const dir = el.ccw ? 1 : -1;
    const nuMax = el.hyper ? Math.acos(-1 / el.e) * 0.985 : Math.PI;
    let prev = null;
    const N = 480;
    for (let i = 0; i <= N && !lunarTraj; i++) {
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
    if (!lunarTraj && !closes && !el.hyper && el.periAlt < 0 && Math.abs((p / R - 1) / Math.max(el.e, 1e-9)) <= 1) {
      const nuHit = Math.acos((p / R - 1) / el.e);
      const ang = el.periAngle + dir * nuHit; // rama de bajada (después del apoapsis)
      const [ix, iy] = P(R * Math.cos(ang), R * Math.sin(ang));
      for (const o of [0, 1]) { line(ctx, ix - 3 + o, iy - 3, ix + 3 + o, iy + 3, '#ff3b3b'); line(ctx, ix + 3 + o, iy - 3, ix - 3 + o, iy + 3, '#ff3b3b'); }
      const [sx, sy] = S(R * Math.cos(ang), R * Math.sin(ang));
      this.setLabel('impact', sx, sy - 12, simText("flight.impact-here"));
    }
    // punto más alto y más bajo
    const apoAng = el.periAngle + Math.PI;
    if (moonMode) {
      // cerca de la Luna: puntos más alto y más bajo de la órbita lunar
      if (!bel.hyper && bel.ra < MOON.SOI) {
        const a2 = bel.periAngle + Math.PI;
        const wx = moonNow.x + bel.ra * Math.cos(a2); const wy = moonNow.y + bel.ra * Math.sin(a2);
        const [ax, ay] = P(wx, wy);
        if (visible(ax, ay)) { disc(ctx, ax, ay, 2, '#ffd24a'); ring(ctx, ax, ay, 3, LW, LH, '#0b1424'); }
        const [sx, sy] = S(wx, wy); this.setLabel('apo', sx, sy - 10, simText("lunarFlight.highest-point-0", fmtKm(bel.apoAlt)));
        const wx2 = moonNow.x + bel.rp * Math.cos(bel.periAngle); const wy2 = moonNow.y + bel.rp * Math.sin(bel.periAngle);
        const [qx, qy] = P(wx2, wy2);
        if (visible(qx, qy)) { disc(ctx, qx, qy, 2, '#4fd18b'); ring(ctx, qx, qy, 3, LW, LH, '#0b1424'); }
        const [sx2, sy2] = S(wx2, wy2); this.setLabel('peri', sx2, sy2 + 22, simText("lunarFlight.lowest-point-0", fmtKm(bel.periAlt)));
      } else hide('apo', 'peri');
    } else if (lunarTraj && sim.mission.tli) hide('apo', 'peri');
    else if (!el.hyper) {
      const [ax, ay] = P(el.ra * Math.cos(apoAng), el.ra * Math.sin(apoAng));
      if (visible(ax, ay)) { disc(ctx, ax, ay, 2, '#ffd24a'); ring(ctx, ax, ay, 3, LW, LH, '#0b1424'); }
      const [sx, sy] = S(el.ra * Math.cos(apoAng), el.ra * Math.sin(apoAng));
      if (el.ra * k > 6) this.setLabel('apo', sx, sy - 10, simText("flight.highest-point-0-in-1", fmtKm(el.apoAlt), mmss(timeToApoapsis(sim)))); else hide('apo');
    } else this.setLabel('apo', -999, -999, '');
    if (moonMode || (lunarTraj && sim.mission.tli)) { /* ya resuelto arriba */ } else if (el.rp > R * 0.9) {
      const [qx, qy] = P(el.rp * Math.cos(el.periAngle), el.rp * Math.sin(el.periAngle));
      if (visible(qx, qy)) { disc(ctx, qx, qy, 2, closes ? '#4fd18b' : '#ff6b6b'); ring(ctx, qx, qy, 3, LW, LH, '#0b1424'); }
      const [sx, sy] = S(el.rp * Math.cos(el.periAngle), el.rp * Math.sin(el.periAngle));
      if (near) this.setLabel('peri', sx, sy - 10, simText("flight.lowest-point-0", fmtKm(el.periAlt))); else hide('peri');
    } else this.setLabel('peri', -999, -999, '');

    // ventana de transferencia
    const d = DEST[sim.destId];
    this.txt.window.setText('');
    if (d.kind === 'transfer' && sim.orbitReached && near && !lunarTraj) {
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
        this.setLabel('window', sx, sy - 12, w.waitS > 2 ? simText("flight.ignition-point-in-0", mmss(w.waitS)) : simText("flight.ignite-now"));
      }
    }

    // cohete: la misma marca que en el vuelo con la cámara alejada, con una flecha hacia donde va
    const [rx0, ry0] = P(sim.x, sim.y);
    const rx = Math.round(rx0); const ry = Math.round(ry0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(rx - 1, ry - 1, 3, 3);
    ctx.fillStyle = '#73ddcf';
    for (const [dx, dy] of [[-4, -1], [-4, 0], [-4, 1], [4, -1], [4, 0], [4, 1], [-1, -4], [0, -4], [1, -4], [-1, 4], [0, 4], [1, 4]]) ctx.fillRect(rx + dx, ry + dy, 1, 1);
    const rv = moonMode ? sim.rel() : sim;
    const sp = Math.hypot(rv.vx, rv.vy) || 1;
    line(ctx, rx + (rv.vx / sp) * 5, ry - (rv.vy / sp) * 5, rx + (rv.vx / sp) * 10, ry - (rv.vy / sp) * 10, '#ffffff');
    const [srx, sry] = S(sim.x, sim.y);
    this.setLabel('rocket', srx, sry - 16, R * k >= 3 || auPx <= 10 ? simText("flight.you") : ''); // de lejos, la etiqueta «Tierra» ya marca dónde estás
    view.present(0, 0);
    // escala del mapa: cuánto mide un trozo de pantalla
    const barM = 80 / scale; // metros que caben en 80 px de pantalla
    const barTxt = barM > AU * 0.5 ? `${(barM / AU).toLocaleString('es', { maximumFractionDigits: 1 })} UA` : barM > 2e9 ? simText("lunarFlight.0-million-km", Math.round(barM / 1e9).toLocaleString('es')) : `${Math.round(barM / 1000).toLocaleString('es')} km`;
    this.scaleTxt.setText(`├─ ${barTxt} ─┤${W < 1000 ? '' : ' · ' + simText('flight.map-zoom-help')}`).setPosition(12, H - (W < 700 ? 250 : 190));

    // mensaje de estado
    let text;
    let good = null;
    if (lunarTraj) [text, good] = this.lunarStatus(sim, lunarInfo.pred, lunarInfo.plan);
    else if (d.kind === 'transfer' && sim.orbitReached) {
      text = sim.stats.transfer ? simText('flight.transfer-underway-watch-your-orbit-stretch-outward') : simText('flight.you-are-in-orbit-start-the-transfer-burn');
    } else if (closes) text = simText('flight.your-orbit-closes-the-rocket-will-keep-circling');
    else if (el.hyper) text = simText('flight.you-are-moving-fast-enough-to-escape-earth');
    else text = simText('flight.this-is-not-a-stable-orbit-its-lowest', fmtKm(el.periAlt));
    this.status.setText(text).setPosition(W / 2, H - (W < 700 ? 215 : 150));
    this.status.setColor((good ?? (closes || el.hyper)) ? '#bff5d6' : '#ffc4c4');
  }

  setLabel(key, x, y, text) {
    const t = this.txt[key];
    t.setText(text); t.setPosition(Math.round(x), Math.round(y)); t.setVisible(Boolean(text));
  }

  // ------------------------------------------------------------------ misión lunar

  /**
   * Trayectoria predicha de la misión lunar (cónicas enlazadas): el tramo alrededor de la Tierra, el paso por la Luna
   * y el regreso. Dibuja además dónde estará la Luna al llegar y dónde conviene encender cada maniobra.
   * `E` reúne lo que arma update(): { ctx, P, S, k, LW, LH, visible, hide, moonMode, moonNow }.
   */
  drawLunar(sim, E) {
    const { ctx, P, S, k, LW, LH, visible, moonMode, moonNow } = E;
    const view = app.lunarView;
    const plan = view?.plan ?? null;
    const pred = guidePrediction(sim, view.guide);
    const pt = (x, y) => P(x, y);
    const MSx = {};
    const strip = (seg, col, toWorld) => {
      let prev = null;
      const n = seg.pts.length / 3;
      const stepN = Math.max(1, Math.floor(n / 700));
      for (let i = 0; i < n; i += stepN) {
        const [wx, wy] = toWorld(seg.pts[i * 3], seg.pts[i * 3 + 1], seg.pts[i * 3 + 2]);
        const p = pt(wx, wy);
        if (prev && (visible(p[0], p[1], 300) || visible(prev[0], prev[1], 300)) && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1500) { line(ctx, prev[0], prev[1], p[0], p[1], col); line(ctx, prev[0], prev[1] + 1, p[0], p[1] + 1, col); }
        prev = p;
      }
      return prev;
    };
    // tramos: verde = alrededor de la Tierra a la ida · celeste = cerca de la Luna · naranja = el regreso
    let afterMoon = sim.mission.soi && sim.body === 'earth';
    let last = null; let lastSeg = null;
    for (const seg of pred.segs) {
      if (seg.body === 'earth') {
        if (moonMode && afterMoon) continue; // de cerca sólo se ve el tramo lunar; el regreso se anuncia con una etiqueta
        last = strip(seg, afterMoon ? '#ffb24a' : '#4fd18b', (x, y) => [x, y]);
      } else {
        // respecto a la Luna de ahora (vista lunar) o, en la vista de la Tierra, por donde irá pasando de verdad
        last = strip(seg, '#73ddcf', moonMode ? (x, y) => [x + moonNow.x, y + moonNow.y] : (x, y, t) => { moonState(sim.moon, t, MSx); return [x + MSx.x, y + MSx.y]; });
        afterMoon = true;
      }
      lastSeg = seg;
    }
    void lastSeg;
    const keys = ['enc', 'pmoon', 'burn', 'ret'];
    const used = new Set();
    const put = (key, wx, wy, text, dy = -10) => { const [sx, sy] = S(wx, wy); this.setLabel(key, sx, sy + dy, text); used.add(key); };
    const pm = pred.moon;
    // la Luna cuando llegues: disco y zona de influencia a trazos, con la altura a la que pasarías
    if (!moonMode && sim.body === 'earth' && pm && pred.encounter) {
      const tg = pm.tPeri ?? pred.encounter.t;
      const g = moonState(sim.moon, tg, {});
      const [gx, gy] = pt(g.x, g.y);
      if (MOON.SOI * k > 4) ring(ctx, gx, gy, MOON.SOI * k, LW, LH, '#73ddcf', 20);
      ring(ctx, gx, gy, Math.max(2, MOON.R * k), LW, LH, '#e6e9ec', MOON.R * k > 6 ? 12 : 0);
      const pass = signedPass(pred);
      put('enc', g.x, g.y, pm.impact ? simText("lunarFlight.you-would-hit-the-moon") : simText("lunarFlight.moon-at-arrival-passing-at-0-1-in", fmtKm(Math.abs(pass)), pass < 0 ? simText("lunarFlight.far-side-approach") : '', dur(tg - sim.t)), -Math.max(12, MOON.SOI * k * this.view.px + 6));
    }
    // punto más bajo sobre la Luna (vista lunar)
    if (moonMode && pm && !pm.closed) {
      const a = pm.periAngle;
      const wx = moonNow.x + pm.rp * Math.cos(a); const wy = moonNow.y + pm.rp * Math.sin(a);
      const [qx, qy] = pt(wx, wy);
      if (visible(qx, qy)) { disc(ctx, qx, qy, 2, pm.impact ? '#ff6b6b' : '#ffd24a'); ring(ctx, qx, qy, 3, LW, LH, '#0b1424'); }
      put('pmoon', wx, wy, pm.impact ? simText("lunarFlight.collision-with-the-moon") : simText("lunarFlight.lowest-point-0-1", fmtKm(pm.periAlt), pm.tPeri && pm.tPeri > sim.t ? simText("lunarFlight.in-0", dur(pm.tPeri - sim.t)) : ''));
    }
    // final de lo predicho
    if (last && pred.end === 'entry' && !moonMode) { const [lx, ly] = last; for (const o of [0, 1]) { line(ctx, lx - 3 + o, ly - 3, lx + 3 + o, ly + 3, '#ffb24a'); line(ctx, lx + 3 + o, ly - 3, lx - 3 + o, ly + 3, '#ffb24a'); } }
    if (pred.end === 'entry' && pred.entry && !moonMode) { const sx = last[0] * this.view.px - this.view.margin * this.view.px; const sy = last[1] * this.view.px - this.view.margin * this.view.px; this.setLabel('ret', sx, sy - 12, simText("lunarFlight.reentry-in-0-angle-1", dur(pred.entry.t - sim.t), pred.entry.angleDeg.toFixed(1))); used.add('ret'); }
    if (moonMode && pred.exit && pred.earth) put('ret', sim.x, sim.y, pred.end === 'entry' ? simText("lunarFlight.next-return-to-earth-lowest-point-0", fmtKm(pred.earth.periAlt)) : simText("lunarFlight.next-leave-the-moon-s-sphere-of-influence"), 30);
    // dónde encender
    const w = plan?.window;
    if (plan?.phase === 'parking' && w && !moonMode) {
      const r = sim.r; const steps = 40;
      let span = w.endAngle - w.startAngle; while (span > 0) span -= 2 * Math.PI; while (span < -2 * Math.PI) span += 2 * Math.PI;
      for (let i = 0; i <= steps; i++) { const a = w.startAngle + (span * i) / steps; const [qx, qy] = pt(r * Math.cos(a), r * Math.sin(a)); if (visible(qx, qy)) disc(ctx, qx, qy, 1, '#ffa24a'); }
      const [ix, iy] = pt(r * Math.cos(w.idealAngle), r * Math.sin(w.idealAngle));
      if (visible(ix, iy)) disc(ctx, ix, iy, 3, '#ffa24a');
      put('burn', r * Math.cos(w.idealAngle), r * Math.sin(w.idealAngle), w.open ? simText("lunarFlight.window-open-start-go-to-the-moon") : simText("lunarFlight.translunar-burn-point-in-0", dur(w.waitS)), -12);
    } else if (plan?.phase === 'lunarOrbit' && w && moonMode) {
      const q = sim.rel(); const r = Math.hypot(q.x, q.y);
      const wx = moonNow.x + r * Math.cos(w.startAngle); const wy = moonNow.y + r * Math.sin(w.startAngle);
      const [qx, qy] = pt(wx, wy);
      if (visible(qx, qy)) disc(ctx, qx, qy, 3, '#ffa24a');
      put('burn', wx, wy, w.open ? simText("lunarFlight.start-return-to-earth-now") : simText("lunarFlight.return-burn-point-in-0", dur(w.waitS)), -12);
    }
    for (const key of keys) if (!used.has(key)) this.setLabel(key, -999, -999, '');
    return { pred, plan };
  }

  /** Texto de estado del mapa para la misión lunar. */
  lunarStatus(sim, pred, plan) {
    const m = sim.mission;
    const ph = plan?.phase;
    if (sim.landing) return [simText("lunarFlight.splashdown-the-capsule-is-home"), true];
    if (ph === 'parking') return [simText("lunarFlight.parking-orbit-zoom-out-to-see-the-moon"), true];
    if (ph === 'toMoon') {
      const pass = signedPass(pred);
      if (pass == null) return [simText("lunarFlight.your-trajectory-misses-the-moon-correct-course"), false];
      if (pred.moon.impact) return [simText("lunarFlight.your-trajectory-intersects-the-moon-correct-course"), false];
      return [simText("lunarFlight.you-will-encounter-the-moon-the-dashed-circle"), true];
    }
    if (ph === 'approach') return pred.moon?.impact ? [simText("lunarFlight.the-trajectory-intersects-the-moon"), false] : [simText("lunarFlight.approaching-the-moon-if-you-do-not-brake"), true];
    if (ph === 'lunarOrbit') return [simText("lunarFlight.lunar-orbit-for-the-return-trip-burn-at"), true];
    if (ph === 'departing' || ph === 'toEarth') {
      if (pred.end === 'entry') return [simText("lunarFlight.heading-home-the-orange-line-ends-in-earth"), true];
      return [simText("lunarFlight.the-return-trajectory-misses-earth-s-atmosphere-correct"), false];
    }
    if (ph === 'entry' || ph === 'descent') return [simText("lunarFlight.reentry-the-atmosphere-is-slowing-the-capsule"), true];
    return [m.leo ? simText("lunarFlight.in-orbit") : simText("lunarFlight.climbing-toward-orbit"), true];
  }
}
