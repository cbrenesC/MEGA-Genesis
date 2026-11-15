// Dibujo pixel art del vuelo. Todo se pinta en un lienzo chico (≈ 360×200 px) con píxeles enteros, sin suavizado,
// y Phaser lo muestra agrandado con un múltiplo entero (nearest-neighbor). Así cada píxel es nítido y del mismo tamaño.
//
// Este módulo SOLO dibuja (presentación): recibe un "estado de dibujo" ya calculado por la escena a partir de la
// simulación y de la cámara. No cambia la física.

import { PHYS } from '../flight.js';
import { CAMERA, angleFromVertical, toCameraFrame, skyProgress, starVisibility } from '../world.js';
import { ParticleSystem } from '../particles.js';
import { rocketSprite, stageSprite, fairingSprite, flameSprite, padSprite, landmarkSprite, cloudSprite, rocketDims } from './rocketArt.js';
import { globeView, globeSample, OCEAN, GREEN, SAND, ICE, CLOUD } from './earth.js';
import { lerpColor } from './gfx.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hexCache = new Map();
export const css = (c) => { let v = hexCache.get(c); if (!v) { v = `#${c.toString(16).padStart(6, '0')}`; hexCache.set(c, v); } return v; };
const hash = (a, b = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------------------------------------------------------------------------
// Lienzo pequeño que Phaser muestra agrandado
// ---------------------------------------------------------------------------

export class PixelView {
  constructor(scene, key = 'flightView') { this.scene = scene; this.key = key; this.image = null; this.tex = null; this.px = 3; this.W = 0; this.H = 0; this.margin = 3; }

  /** Elige el factor entero de agrandado y crea el lienzo. Devuelve true si cambió el tamaño. */
  fit(screenW, screenH) {
    const px = Math.max(2, Math.round(Math.min(screenH / 200, screenW / 300)));
    const W = Math.ceil(screenW / px) + this.margin * 2;
    const H = Math.ceil(screenH / px) + this.margin * 2;
    if (this.tex && px === this.px && W === this.W && H === this.H) return false;
    this.px = px; this.W = W; this.H = H;
    this.destroy();
    this.tex = this.scene.textures.createCanvas(this.key, W, H);
    this.ctx = this.tex.context;
    this.ctx.imageSmoothingEnabled = false;
    this.image = this.scene.add.image(0, 0, this.key).setOrigin(0, 0).setScale(px);
    return true;
  }

  /** Dibujable (sin el margen que absorbe la sacudida). */
  get viewW() { return this.W - this.margin * 2; }
  get viewH() { return this.H - this.margin * 2; }

  present(ox = 0, oy = 0) {
    this.tex.refresh();
    this.image.setPosition((ox - this.margin) * this.px, (oy - this.margin) * this.px);
  }

  setVisible(v) { this.image?.setVisible(v); }

  destroy() {
    this.image?.destroy(); this.image = null;
    if (this.tex) { this.scene.textures.remove(this.key); this.tex = null; }
  }
}

// ---------------------------------------------------------------------------
// Primitivas de píxel
// ---------------------------------------------------------------------------

export function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.max(0, Math.round(w)), Math.max(0, Math.round(h))); }
export function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r + r * 0.5 - y * y)); ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); }
}
export function line(ctx, x0, y0, x1, y1, color) {
  ctx.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 1600; i++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Disco relleno recortado a la pantalla (sirve aunque el radio sea enorme). */
export function clipDisc(ctx, cx, cy, r, W, H, color) {
  ctx.fillStyle = color;
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r)); y++) {
    const q = r * r - (y + 0.5 - cy) * (y + 0.5 - cy); if (q <= 0) continue;
    const h = Math.sqrt(q); const x0 = Math.max(0, Math.round(cx - h)); const x1 = Math.min(W, Math.round(cx + h));
    if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, 1);
  }
}

/** Circunferencia de 1 px recortada a la pantalla; `dash` > 0 la dibuja a trazos (número de trazos por vuelta). */
export function ring(ctx, cx, cy, r, W, H, color, dash = 0) {
  ctx.fillStyle = color;
  const on = (x, y) => !dash || Math.floor(((Math.atan2(y - cy, x - cx) / (2 * Math.PI)) + 1) * dash * 2) % 2 === 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, Math.ceil(cy + r) + 1); y++) {
    const q = r * r - (y - cy) * (y - cy); if (q < 0) continue;
    const h = Math.sqrt(q);
    for (const x of [Math.round(cx - h), Math.round(cx + h)]) if (x >= 0 && x < W && on(x, y)) ctx.fillRect(x, y, 1, 1);
  }
  for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(W, Math.ceil(cx + r) + 1); x++) {
    const q = r * r - (x - cx) * (x - cx); if (q < 0) continue;
    const h = Math.sqrt(q);
    for (const y of [Math.round(cy - h), Math.round(cy + h)]) if (y >= 0 && y < H && on(x, y)) ctx.fillRect(x, y, 1, 1);
  }
}

const GLOBE_PAL = { 0: 0x1f5fae, 1: 0x3f8f4a, 2: 0xc2a465, 3: 0xeef4fa };
/**
 * La Tierra como globo pixel art (continentes, hielo y nubes de earth.js), recortada a la pantalla.
 * (cx, cy) centro y `rpx` radio en píxeles del lienzo; `rot` giro horario del disco; `lon0` longitud del centro de la vista.
 */
export function drawGlobe(ctx, W, H, cx, cy, rpx, rot, lon0) {
  const shadeOn = rpx < 900;
  for (let y = Math.max(0, Math.floor(cy - rpx)); y < Math.min(H, Math.ceil(cy + rpx)); y++) {
    const dyN = (cy - (y + 0.5)) / rpx;
    const halfN = 1 - dyN * dyN; if (halfN <= 0) continue;
    const half = Math.sqrt(halfN) * rpx;
    const x0 = Math.max(0, Math.ceil(cx - half)); const x1 = Math.min(W, Math.floor(cx + half) + 1);
    let runStart = x0; let runCol = -1;
    for (let x = x0; x <= x1; x++) {
      let col = -2;
      if (x < x1) {
        const dxN = (x + 0.5 - cx) / rpx;
        const g = globeSample(dxN, dyN, rot, lon0);
        col = g & CLOUD ? 0xf4f8fc : GLOBE_PAL[g & 7];
        if (shadeOn) { const z2 = 1 - dxN * dxN - dyN * dyN; if (z2 < 0.12) col = lerpColor(col, 0x0b2a55, 0.35); else if (z2 < 0.3 && ((x + y) & 1)) col = lerpColor(col, 0x0b2a55, 0.3); }
      }
      if (col !== runCol) { if (runCol >= 0) { ctx.fillStyle = css(runCol); ctx.fillRect(runStart, y, x - runStart, 1); } runStart = x; runCol = col; }
    }
  }
}

// ---------------------------------------------------------------------------
// Cielo (se guarda y solo se rehace cuando cambia el tono o el tamaño)
// ---------------------------------------------------------------------------

const skyCache = { key: '', canvas: null };
function skyCanvas(W, H, prog) {
  const step = Math.round(prog * 60);
  const key = `${W}x${H}|${step}`;
  if (skyCache.key === key) return skyCache.canvas;
  const p = step / 60;
  const top = lerpColor(0x3d8de0, 0x01030a, clamp(p * 1.12, 0, 1));
  const bot = lerpColor(0xaedcff, 0x060d1c, clamp(p * 1.02, 0, 1));
  const c = skyCache.canvas && skyCache.canvas.width === W && skyCache.canvas.height === H ? skyCache.canvas : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const B = 12; // franjas de color: cada una se mezcla con la siguiente con trama (dither) de Bayer
  for (let y = 0; y < H; y++) {
    const v = (y / (H - 1)) * B * (1 - 1 / B);
    const band = Math.floor(v); const frac = v - band;
    const cA = lerpColor(top, bot, band / (B - 1)); const cB = lerpColor(top, bot, Math.min(1, (band + 1) / (B - 1)));
    for (let x = 0; x < W; x++) {
      const col = frac > BAYER[(x & 3) + ((y & 3) << 2)] / 16 ? cB : cA;
      const i = (y * W + x) * 4;
      img.data[i] = (col >> 16) & 255; img.data[i + 1] = (col >> 8) & 255; img.data[i + 2] = col & 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  skyCache.key = key; skyCache.canvas = c;
  return c;
}

// Paisaje de cada sitio de lanzamiento. Todos están en la costa: el mar queda al este (a la derecha), como en la realidad
// se lanza sobre el océano. coastE = metros desde la plataforma hasta la playa.
const SITE_LOOK = {
  ksc: { coastE: 190, land: 0x3c8a46, grass: '#79d36b', trees: 0.35, landmark: 'vab', hills: 0.25 }, // Florida: llano y pantanoso
  wallops: { coastE: 170, land: 0x4a8f4a, grass: '#84d672', trees: 0.4, landmark: 'control', hills: 0.2 },
  vsfb: { coastE: 220, land: 0x8f8a52, grass: '#b7b06a', trees: 0.75, landmark: 'control', hills: 1.6 }, // California: seco y con cerros
  kourou: { coastE: 230, land: 0x2c7a3a, grass: '#5fc45a', trees: 0.08, landmark: 'control', hills: 0.5 }, // selva
  mahia: { coastE: 120, land: 0x4f9a4a, grass: '#8fdc78', trees: 0.7, landmark: 'control', hills: 1.3 }, // acantilados verdes
  sdsc: { coastE: 180, land: 0x4a8a44, grass: '#86cf6c', trees: 0.3, landmark: 'control', hills: 0.3 },
  kwaj: { coastE: 90, land: 0xcdbb7a, grass: '#e6d79a', trees: 0.8, landmark: 'control', hills: 0 }, // atolón: arena y mar
  default: { coastE: 190, land: 0x3c8a46, grass: '#79d36b', trees: 0.35, landmark: 'control', hills: 0.4 },
};
const SEA = 0x2368b0; const BEACH = 0xd9c98a;
const GLOBE_COLORS = { [OCEAN]: 0x1f5fae, [GREEN]: 0x3f8f4a, [SAND]: 0xc2a465, [ICE]: 0xeef4fa };

// ---------------------------------------------------------------------------
// El renderizador
// ---------------------------------------------------------------------------

export class FlightRenderer {
  /** @param site { id, latDeg } sitio de lanzamiento real: orienta el globo y elige el paisaje */
  constructor(vehicle, site = {}) {
    this.vehicle = vehicle;
    this.site = { ...(SITE_LOOK[site.id] ?? SITE_LOOK.default), id: site.id ?? 'ksc' };
    this.globe = globeView(site.id, site.latDeg);
    this.dims = rocketDims(vehicle);
    this.stars = Array.from({ length: 170 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), b: 0.35 + 0.65 * hash(i, 3), big: hash(i, 4) > 0.93, p: hash(i, 5) * 6.28 }));
    this.clouds = Array.from({ length: 64 }, (_, i) => {
      const kind = hash(i, 10) < 0.2 ? 2 : hash(i, 11) < 0.5 ? 1 : 0;
      return { e: (hash(i, 12) - 0.35) * 160000, h: kind === 2 ? 8000 + hash(i, 13) * 3500 : 900 + hash(i, 14) * 5200, w: (kind === 2 ? 2600 : 900) + hash(i, 15) * 2400, kind };
    });
    this.streaks = Array.from({ length: 22 }, (_, i) => ({ x: hash(i, 20), y: hash(i, 21), l: 0.6 + hash(i, 22) }));
    this.flameFrame = 0;
  }

  /** Dibuja un cuadro completo. `S` es el estado de dibujo que arma FlightScene. */
  draw(ctx, W, H, S) {
    ctx.imageSmoothingEnabled = false;
    const cx = Math.round(W / 2);
    const baseY = Math.round(S.baseY);
    const mpp = S.mpp;
    const alt = Math.max(0, S.alt);
    const sky = skyProgress(alt);
    // 1 · cielo y estrellas
    ctx.drawImage(skyCanvas(W, H, sky), 0, 0);
    this.drawStars(ctx, W, H, S, alt);
    this.drawSun(ctx, W, H, sky);
    // 2 · nubes, planeta y suelo
    this.drawClouds(ctx, W, H, cx, baseY, S, alt, mpp, true);
    this.drawPlanet(ctx, W, H, cx, baseY, S, alt, mpp);
    this.drawClouds(ctx, W, H, cx, baseY, S, alt, mpp, false);
    // 3 · plataforma
    this.drawPad(ctx, cx, baseY, S, alt, mpp);
    // 4 · humo (detrás del cohete)
    this.drawParticles(ctx, S, cx, baseY, mpp, alt, false);
    // 5 · velocidad
    this.drawStreaks(ctx, W, H, S);
    // 6 · piezas sueltas, cohete, llama
    for (const d of S.debris) this.drawDebris(ctx, d, S, cx, baseY, mpp);
    if (!S.hideRocket) this.drawRocket(ctx, cx, baseY, S, mpp, alt);
    // 7 · fuego y chispas (delante)
    this.drawParticles(ctx, S, cx, baseY, mpp, alt, true);
    // 8 · marcadores de guía
    if (!S.hideRocket) this.drawMarkers(ctx, cx, baseY, S);
  }

  // ---- fondo ----

  drawStars(ctx, W, H, S, alt) {
    const vis = starVisibility(alt);
    if (vis < 0.02) return;
    const shift = Math.round(S.starShift ?? 0);
    for (const s of this.stars) {
      const tw = S.reduced ? 1 : 0.75 + 0.25 * Math.sin(S.time * 1.7 + s.p);
      const a = vis * s.b * tw;
      if (a < 0.08) continue;
      const x = (((Math.floor(s.x * W) - shift) % W) + W) % W; const y = Math.floor(s.y * H * 0.92);
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
      if (s.big && a > 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); }
    }
  }

  drawSun(ctx, W, H, sky) {
    const x = Math.round(W * 0.8); const y = Math.round(H * 0.17);
    ctx.globalAlpha = 0.18 * (1 - sky * 0.5); disc(ctx, x, y, 10, '#fff6c8');
    ctx.globalAlpha = 0.3 * (1 - sky * 0.4); disc(ctx, x, y, 7, '#fff6c8');
    ctx.globalAlpha = 1; disc(ctx, x, y, 4, '#fffdf0');
  }

  drawClouds(ctx, W, H, cx, baseY, S, alt, mpp, behind) {
    if (alt > 42000) return;
    const fade = 1 - smooth(18000, 42000, alt);
    for (const c of this.clouds) {
      // las nubes altas (cirros) van detrás de la curva del planeta; las bajas, delante
      if ((c.kind === 2) !== behind) continue;
      const sprite = cloudSprite(c.kind);
      const wpx = Math.round(c.w / mpp);
      if (wpx < 3 || wpx > 280) continue;
      const hpx = Math.max(2, Math.round((sprite.h / sprite.w) * wpx));
      const x = Math.round(cx + (c.e - S.groundS) / mpp - wpx / 2);
      const y = Math.round(baseY - (c.h - alt) / mpp - hpx);
      if (x > W || x + wpx < 0 || y > H || y + hpx < 0) continue;
      ctx.globalAlpha = (c.kind === 2 ? 0.7 : 0.95) * fade;
      ctx.drawImage(sprite.canvas, x, y, wpx, hpx);
    }
    ctx.globalAlpha = 1;
  }

  /** Planeta como columnas de 1 px: horizonte curvo real (por altura y escala), atmósfera y continentes. */
  drawPlanet(ctx, W, H, cx, baseY, S, alt, mpp) {
    const R = PHYS.RE;
    const drop = (Rr, s) => { const q = Rr * Rr - s * s; return q <= 0 ? Infinity : (s * s) / (Rr + Math.sqrt(q)); };
    const yAt = (x, hs) => { const s = (x - cx) * mpp; const d = drop(R + hs, s); return d === Infinity ? Infinity : baseY + (alt - hs + d) / mpp; };
    // borde de abajo del planeta en esa columna (sólo importa con la cámara muy alejada: la Tierra se ve como un disco)
    const yEnd = (x, hs, top) => { const s = (x - cx) * mpp; const q = (R + hs) * (R + hs) - s * s; return q <= 0 ? top : Math.min(H, top + (2 * Math.sqrt(q)) / mpp); };
    const sky = skyProgress(alt);
    // atmósfera: dos velos azules sobre el horizonte, sólo cuando se ve el planeta desde arriba
    if (alt > 5000) {
      // desde el espacio, con la vista normal, la atmósfera ya no se dibuja; vuelve al alejar la cámara
      const a = Math.max(1 - smooth(60000, 95000, alt), smooth(1.3, 4, S.zoomOut ?? 1));
      for (const [hs, col, al] of [[90000, '#4f9bff', 0.16], [38000, '#8fd0ff', 0.2]]) {
        ctx.fillStyle = col; ctx.globalAlpha = al * a;
        if (a > 0.01) for (let x = 0; x < W; x++) { const y = yAt(x, hs); if (y < H) { const y0 = Math.max(0, Math.floor(y)); ctx.fillRect(x, y0, 1, Math.max(0, Math.ceil(yEnd(x, hs, y)) - y0)); } }
      }
      ctx.globalAlpha = 1;
    }
    // colinas lejanas (sólo cerca del suelo)
    const near = 1 - smooth(1500, 6000, alt);
    if (near > 0.02) {
      for (let x = 0; x < W; x++) {
        const y = yAt(x, 0); if (y >= H) continue;
        const e = S.groundS + (x - cx) * mpp;
        if (e > this.site.coastE - 60 || this.site.hills <= 0) continue;
        const hm = 16 * this.site.hills * (Math.sin(e / 1100) + 0.6 * Math.sin(e / 420 + 2) + 1.7) * near * clamp((this.site.coastE - 60 - e) / 400, 0, 1) * clamp((Math.abs(e) - 120) / 300, 0, 1);
        const hp = Math.round(hm / mpp);
        if (hp > 0) { ctx.fillStyle = '#34706a'; ctx.fillRect(x, Math.floor(y) - hp, 1, hp + 1); if (hp > 3) { ctx.fillStyle = '#3f8478'; ctx.fillRect(x, Math.floor(y) - hp, 1, 1); } }
      }
    }
    // superficie: cerca del suelo, el paisaje del sitio (tierra, playa y mar al este); desde arriba, el mapa del mundo
    const site = this.site;
    const localAt = (e) => (e > site.coastE + 26 ? SEA : e > site.coastE ? BEACH : site.land);
    const tGlobe = smooth(6000, 26000, alt);
    if (tGlobe <= 0) {
      for (let x = 0; x < W; x++) {
        const y = yAt(x, 0); if (y >= H) continue;
        const yi = Math.max(0, Math.floor(y));
        const e = S.groundS + (x - cx) * mpp;
        const c = localAt(e);
        ctx.fillStyle = css(c);
        ctx.fillRect(x, yi, 1, H - yi);
        ctx.fillStyle = c === SEA ? '#8fd0ff' : c === BEACH ? '#f1e6b4' : site.grass; ctx.fillRect(x, yi, 1, 1);
      }
    } else {
      // globo: cada píxel del disco mira un punto real de la Tierra (el sitio de lanzamiento queda en el borde, bajo la plataforma)
      const Rpx = R / mpp;
      const yc = baseY + (alt + R) / mpp;
      const rot = -S.groundS / R - this.globe.siteAngle;
      const lon0 = this.globe.lon0;
      const shadeOn = Rpx < 900;
      const yStart = Math.max(0, Math.floor(yc - Rpx));
      const yStop = Math.min(H, Math.ceil(yc + Rpx));
      for (let y = yStart; y < yStop; y++) {
        const dyN = (yc - (y + 0.5)) / Rpx;
        const halfN = 1 - dyN * dyN; if (halfN <= 0) continue;
        const half = Math.sqrt(halfN) * Rpx;
        const x0 = Math.max(0, Math.ceil(cx - half)); const x1 = Math.min(W, Math.floor(cx + half) + 1);
        let runStart = x0; let runCol = -1;
        for (let x = x0; x <= x1; x++) {
          let col = -2;
          if (x < x1) {
            const dxN = (x + 0.5 - cx) / Rpx;
            const useGlobe = tGlobe >= 1 || BAYER[(x & 3) + ((y & 3) << 2)] / 16 < tGlobe;
            if (useGlobe) {
              const g = globeSample(dxN, dyN, rot, lon0);
              col = g & CLOUD ? 0xf4f8fc : GLOBE_COLORS[g & 7];
              if (shadeOn) { const z2 = 1 - dxN * dxN - dyN * dyN; if (z2 < 0.12) col = lerpColor(col, 0x0b2a55, 0.35); else if (z2 < 0.3 && ((x + y) & 1)) col = lerpColor(col, 0x0b2a55, 0.3); }
            } else col = localAt(S.groundS + (x - cx) * mpp);
          }
          if (col !== runCol) { if (runCol >= 0) { ctx.fillStyle = css(runCol); ctx.fillRect(runStart, y, x - runStart, 1); } runStart = x; runCol = col; }
        }
      }
      // borde iluminado por la atmósfera
      for (let x = 0; x < W; x++) {
        const y = yAt(x, 0); if (y >= H || y < -1) continue;
        const yi = Math.floor(y);
        ctx.fillStyle = '#bfe3ff'; ctx.fillRect(x, yi, 1, 1);
        if (alt > 20000) { ctx.fillStyle = 'rgba(160,210,255,0.5)'; ctx.fillRect(x, yi + 1, 1, 1); }
      }
    }
    // textura del suelo: bloques de campo/ nubes pequeñas que se mueven al volar (da sensación de velocidad)
    if (alt < 26000) this.drawGroundDetail(ctx, W, H, cx, baseY, S, alt, mpp, yAt);
    // árboles y arbustos junto a la plataforma
    if (alt < 320) this.drawTrees(ctx, W, cx, baseY, S, alt, mpp);
  }

  drawGroundDetail(ctx, W, H, cx, baseY, S, alt, mpp, yAt) {
    const sky = skyProgress(alt);
    const depthPx = Math.min(H, 56);
    const cell = 4;
    for (let x = 0; x < W; x += cell) {
      const y0 = yAt(x + 1, 0); if (y0 >= H) continue;
      const s0 = (x + 1 - cx) * mpp; const q0 = PHYS.RE * PHYS.RE - s0 * s0;
      const maxDy = q0 <= 0 ? 0 : (2 * Math.sqrt(q0)) / mpp - cell;
      for (let dy = 2; dy < depthPx && dy < maxDy; dy += cell) {
        const yy = Math.floor(y0) + dy; if (yy >= H) break;
        // coordenadas del suelo (marco que gira con la Tierra) para que el dibujo se mueva con el suelo
        const e = Math.floor((S.groundS + (x - cx) * mpp) / (cell * mpp * 3));
        const r = hash(e, Math.floor(dy / cell) + Math.floor(alt / 800));
        if (r < 0.3) { ctx.fillStyle = r < 0.15 ? 'rgba(0,30,20,0.16)' : 'rgba(255,255,255,0.09)'; ctx.fillRect(x, yy, cell, cell); }

      }
    }
  }

  drawTrees(ctx, W, cx, baseY, S, alt, mpp) {
    const gy = baseY + alt / mpp;
    const k = CAMERA.mpp0 / mpp;
    if (k < 0.22) return;
    const spacing = 38;
    const e0 = S.groundS - cx * mpp;
    const first = Math.floor(e0 / spacing) - 1;
    const last = Math.ceil((S.groundS + (W - cx) * mpp) / spacing) + 1;
    for (let i = first; i <= last; i++) {
      const r = hash(i, 77); if (r < this.site.trees) continue;
      const e = i * spacing + r * 20;
      if (Math.abs(e) < 150 || e > this.site.coastE - 12) continue; // deja libre el complejo de lanzamiento y la playa
      const x = Math.round(cx + (e - S.groundS) / mpp);
      const h = Math.max(2, Math.round((7 + r * 8) * k));
      const w = Math.max(2, Math.round(h * 0.55));
      ctx.fillStyle = '#4a3326'; ctx.fillRect(x, Math.round(gy) - Math.max(1, Math.round(h * 0.3)), 1, Math.max(1, Math.round(h * 0.3)));
      ctx.fillStyle = r > 0.7 ? '#1f5a34' : '#2a6f3c'; ctx.fillRect(x - (w >> 1), Math.round(gy) - h, w, h - Math.max(1, Math.round(h * 0.25)));
      ctx.fillStyle = '#4f9a52'; ctx.fillRect(x - (w >> 1), Math.round(gy) - h, Math.max(1, w >> 1), 1);
    }
  }

  drawPad(ctx, cx, baseY, S, alt, mpp) {
    const k = CAMERA.mpp0 / mpp;
    if (k < 0.07) return;
    // edificio lejano del sitio (al oeste, tierra adentro)
    if (this.site.landmark) {
      const lm = landmarkSprite(this.site.landmark);
      const lw = Math.round(lm.w * k); const lh = Math.round(lm.h * k);
      const lx = Math.round(cx + (-330 - S.groundS) / mpp - lm.cx * k);
      if (lw >= 3 && lx < ctx.canvas.width && lx + lw > 0) ctx.drawImage(lm.canvas, lx, Math.round(baseY + alt / mpp - lm.groundY * k), lw, lh);
    }
    const pad = padSprite(this.vehicle);
    const dw = Math.round(pad.w * k); const dh = Math.round(pad.h * k);
    if (dw < 3) return;
    const x = Math.round(cx - S.groundS / mpp - pad.cx * k);
    const y = Math.round(baseY + alt / mpp - pad.groundY * k);
    if (x > ctx.canvas.width || x + dw < 0) return;
    ctx.drawImage(pad.canvas, x, y, dw, dh);
    // mancha de quemado bajo el cohete mientras los motores trabajan
    if (S.throttle > 0.05 && alt < 40) {
      const gy = Math.round(baseY + alt / mpp);
      const g = clamp(1 - alt / 40, 0, 1);
      ctx.fillStyle = `rgba(255,170,70,${(0.55 * S.throttle * g).toFixed(2)})`;
      ctx.fillRect(cx - Math.round(this.dims.hw * 3 * (0.5 + S.throttle)), gy - 1, Math.round(this.dims.hw * 6 * (0.5 + S.throttle)), 2);
    }
  }

  // ---- velocidad y partículas ----

  drawStreaks(ctx, W, H, S) {
    const a = S.streakAlpha;
    if (a < 0.04) return;
    const speed = Math.hypot(S.flowX, S.flowY);
    if (speed < 30) return;
    const len = Math.round(clamp(speed * 0.035, 2, 14));
    const dx = S.flowX / speed; const dy = S.flowY / speed;
    ctx.fillStyle = `rgba(255,255,255,${clamp(a * 0.55, 0, 0.55).toFixed(2)})`;
    for (const s of this.streaks) {
      const x = ((s.x * W + S.flowPhaseX) % W + W) % W; const y = ((s.y * H + S.flowPhaseY) % H + H) % H;
      for (let i = 0; i < len * s.l; i++) ctx.fillRect(Math.round(x - dx * i), Math.round(y - dy * i), 1, 1);
    }
  }

  drawParticles(ctx, S, cx, baseY, mpp, alt, front) {
    const sz = (p) => Math.max(1, Math.round(p.size * CAMERA.mpp0 / mpp));
    for (const p of S.particles.list) {
      const isFront = p.kind === 'fire' || p.kind === 'spark' || p.kind === 'boom' || p.kind === 'flash';
      if (isFront !== front) continue;
      const x = cx + (p.x - S.groundS) / mpp; const y = baseY + (alt - p.y) / mpp;
      if (x < -20 || y < -20 || x > ctx.canvas.width + 20 || y > ctx.canvas.height + 20) continue;
      const t = ParticleSystem.life(p);
      const s = sz(p);
      if (p.kind === 'smoke' || p.kind === 'gas') {
        const a = (p.kind === 'gas' ? 0.7 : 0.82) * (1 - t) * (t < 0.08 ? t / 0.08 : 1);
        const tone = t < 0.25 ? 0 : t < 0.55 ? 1 : 2;
        ctx.fillStyle = `rgba(${[250, 214, 176][tone]},${[246, 220, 184][tone]},${[238, 226, 196][tone]},${a.toFixed(2)})`;
        if (s <= 2) ctx.fillRect(Math.round(x), Math.round(y), s, s); else disc(ctx, x, y, s >> 1, ctx.fillStyle);
        if (s >= 4 && t < 0.6) { ctx.fillStyle = `rgba(255,255,255,${(a * 0.7).toFixed(2)})`; ctx.fillRect(Math.round(x - s / 3), Math.round(y - s / 3), Math.max(1, s >> 2), 1); }
      } else if (p.kind === 'fire') {
        const col = t < 0.15 ? '#fff6c4' : t < 0.4 ? '#ffd24a' : t < 0.7 ? '#ff7a3d' : '#b93b23';
        ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), s, s);
      } else if (p.kind === 'spark') {
        ctx.fillStyle = t < 0.5 ? '#fff0b0' : '#ffb04a'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      } else if (p.kind === 'boom') {
        ctx.fillStyle = t < 0.2 ? '#ffffff' : t < 0.5 ? '#ffd24a' : t < 0.8 ? '#ff7a3d' : '#7a2f22';
        ctx.fillRect(Math.round(x), Math.round(y), s, s);
      } else if (p.kind === 'flash') {
        const r = Math.round(2 + p.age * 22);
        ctx.strokeStyle = `rgba(255,255,255,${(0.9 * (1 - t)).toFixed(2)})`;
        ctx.lineWidth = 1;
        ctx.fillStyle = `rgba(255,255,255,${(0.7 * (1 - t)).toFixed(2)})`;
        disc(ctx, x, y, Math.max(1, Math.round(r * 0.4 * (1 - t))), ctx.fillStyle);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1); }
      }
    }
  }

  // ---- cohete y piezas ----

  drawRocket(ctx, cx, baseY, S, mpp, alt) {
    const spr = rocketSprite(this.vehicle, S.stage, S.fairing);
    const centerY = Math.round(baseY - (spr.base - spr.cy));
    const ang = S.betaShown;
    // con la cámara muy alejada el cohete se achica y termina siendo una marca (si no, taparía la Tierra)
    const zo = S.zoomOut ?? 1;
    const f = zo <= 2.5 ? 1 : Math.max(0.2, 1 / Math.sqrt(zo / 2.5));
    if (f < 0.32) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 1, baseY - 2, 3, 3);
      ctx.fillStyle = '#73ddcf';
      for (const [dx, dy] of [[-4, -1], [-4, 0], [-4, 1], [4, -1], [4, 0], [4, 1], [-1, -4], [0, -4], [1, -4], [-1, 4], [0, 4], [1, 4]]) ctx.fillRect(cx + dx, baseY - 1 + dy, 1, 1);
      if (S.engineOn && S.throttle > 0.03) { ctx.fillStyle = '#ffd24a'; ctx.fillRect(cx - Math.round(Math.sin(ang) * 3), baseY - 1 + Math.round(Math.cos(ang) * 3), 1, 1); }
      return;
    }
    ctx.save();
    if (f < 1) { ctx.translate(cx, baseY); ctx.scale(f, f); ctx.translate(-cx, -baseY); }
    ctx.translate(cx, centerY);
    if (Math.abs(ang) > 0.004) ctx.rotate(ang);
    // llama (detrás del cohete): sale de la tobera de la etapa que está encendida
    const thr = S.throttle;
    if (S.engineOn && thr > 0.03 && S.stage < this.vehicle.stages.length) {
      const d = spr.dims;
      const nozzleY = spr.nozzleY;
      const vac = S.airFade < 0.12;
      const len = Math.round((3 + 22 * thr) * (vac ? 0.8 : 1) * (S.reduced ? 1 : 0.88 + 0.24 * S.flicker));
      const fl = flameSprite(Math.max(1, Math.round(spr.flameHw * (0.5 + 0.35 * thr))), len, this.flameFrame, vac);
      ctx.drawImage(fl.canvas, -fl.cx, nozzleY - spr.cy);
    }
    ctx.drawImage(spr.canvas, -spr.cx, -spr.cy);
    ctx.restore();
  }

  drawDebris(ctx, d, S, cx, baseY, mpp) {
    const f = toCameraFrame(d.x, d.y, S.rx, S.ry);
    const x = Math.round(cx + f.east / mpp); const y = Math.round(baseY - f.up / mpp);
    if (x < -60 || y < -60 || x > ctx.canvas.width + 60 || y > ctx.canvas.height + 60) return;
    // cuando ya se alejó poco y a esta escala se confunde con el cohete, no se dibuja (se sigue simulando)
    if (d.age > 8 && !S.focus && Math.hypot(x - cx, y - baseY + this.dims.total / 2) < this.dims.total * 0.7) return;
    const spr = d.kind === 'fairing' ? fairingSprite(this.vehicle, d.side) : stageSprite(this.vehicle, d.index, d.side);
    const ang = angleFromVertical(d.axis, S.rx, S.ry); // orientación fija en el mundo → ángulo respecto a la vertical local
    ctx.save();
    ctx.translate(x, y);
    if (Math.abs(ang) > 0.004) ctx.rotate(ang);
    ctx.drawImage(spr.canvas, -spr.cx, -spr.cy);
    ctx.restore();
  }

  drawMarkers(ctx, cx, baseY, S) {
    const cy = Math.round(baseY - this.dims.total / 2);
    if (S.prograde != null) {
      const a = S.prograde; const mx = Math.round(cx + Math.sin(a) * 30); const my = Math.round(cy - Math.cos(a) * 30);
      ctx.fillStyle = '#73ddcf';
      for (const [dx, dy] of [[-3, -1], [-3, 0], [-3, 1], [3, -1], [3, 0], [3, 1], [-1, -3], [0, -3], [1, -3], [-1, 3], [0, 3], [1, 3]]) ctx.fillRect(mx + dx, my + dy, 1, 1);
      ctx.fillRect(mx, my, 1, 1);
      line(ctx, mx - 6, my, mx - 4, my, '#73ddcf'); line(ctx, mx + 4, my, mx + 6, my, '#73ddcf'); line(ctx, mx, my - 6, mx, my - 4, '#73ddcf');
    }
    if (S.recommend != null) {
      const a = S.recommend;
      const x0 = cx + Math.sin(a) * 22; const y0 = cy - Math.cos(a) * 22; const x1 = cx + Math.sin(a) * 38; const y1 = cy - Math.cos(a) * 38;
      line(ctx, x0, y0, x1, y1, '#ffd24a');
      const bx = Math.cos(a); const by = Math.sin(a);
      line(ctx, x1, y1, x1 - Math.sin(a) * 4 + bx * 3, y1 + Math.cos(a) * 4 + by * 3, '#ffd24a');
      line(ctx, x1, y1, x1 - Math.sin(a) * 4 - bx * 3, y1 + Math.cos(a) * 4 - by * 3, '#ffd24a');
    }
  }
}
