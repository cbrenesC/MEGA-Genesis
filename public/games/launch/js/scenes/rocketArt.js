// Arte original del cohete: formas simples dibujadas con Phaser Graphics (sin imágenes externas).

const STAGE_COLORS = [0xe9eef5, 0xc9d3df, 0xaebccb, 0x93a6ba];
const ACCENT = [0xff7a3d, 0x4aa8ff, 0xffc44a, 0x73ddcf];

/** Medidas en píxeles del cohete (proporcionales al tamaño del catálogo, pero siempre cabe en pantalla). */
export function rocketDims(vehicle) {
  const lg = Math.log10(Math.max(vehicle.stackKg, 1000));
  const total = Math.max(80, Math.min(150, 70 + (80 * (lg - 4)) / 2.5));
  const w = Math.max(16, Math.min(40, 10 + vehicle.diameterM * 4));
  const fairingH = total * 0.2;
  const bodyH = total - fairingH;
  const masses = vehicle.stages.map((s) => s.dryKg + s.propKg);
  const sum = masses.reduce((a, b) => a + b, 0);
  const stageH = masses.map((m) => Math.max(bodyH * 0.18, (m / sum) * bodyH));
  const k = bodyH / stageH.reduce((a, b) => a + b, 0);
  return { total, w, fairingH, stageH: stageH.map((h) => h * k), bodyH };
}

/**
 * Dibuja el cohete con la base del motor en (0,0) y la punta hacia arriba (y negativo).
 * @param state { stage, fairing, throttle, flicker }
 */
export function drawRocket(g, vehicle, state, oy = 0) {
  const d = rocketDims(vehicle);
  const half = d.w / 2;
  let y = oy; // la base del motor; con oy = total/2 el cohete gira alrededor de su centro
  // de abajo hacia arriba: la etapa 0 queda abajo
  for (let i = 0; i < vehicle.stages.length; i++) {
    const h = d.stageH[i];
    if (i >= state.stage) {
      const w = half * (i === 0 ? 1 : 0.92);
      g.fillStyle(STAGE_COLORS[i % 4], 1);
      g.fillRect(-w, y - h, w * 2, h);
      g.fillStyle(ACCENT[i % 4], 1);
      g.fillRect(-w, y - h, w * 2, Math.max(2, h * 0.08));
      g.fillStyle(0x000000, 0.18);
      g.fillRect(w * 0.45, y - h, w * 0.55, h);
      // toberas
      if (i === state.stage) {
        g.fillStyle(0x4a5663, 1);
        g.fillTriangle(-w * 0.6, y, w * 0.6, y, 0, y + 7);
      }
      // aletas de la primera etapa
      if (i === 0) {
        g.fillStyle(0x4a5663, 1);
        g.fillTriangle(-w, y - 2, -w - 7, y + 4, -w, y - h * 0.3);
        g.fillTriangle(w, y - 2, w + 7, y + 4, w, y - h * 0.3);
      }
    }
    y -= h;
  }
  // cofia o nave
  const topW = half * 0.92;
  if (state.fairing) {
    g.fillStyle(0xfff3e0, 1);
    g.fillRect(-topW, y - d.fairingH * 0.55, topW * 2, d.fairingH * 0.55);
    g.fillTriangle(-topW, y - d.fairingH * 0.55, topW, y - d.fairingH * 0.55, 0, y - d.fairingH);
    g.fillStyle(0x000000, 0.15);
    g.fillRect(topW * 0.4, y - d.fairingH * 0.55, topW * 0.6, d.fairingH * 0.55);
  } else {
    // la nave ya está sola: caja con dos paneles solares
    g.fillStyle(0xd7dde6, 1);
    g.fillRect(-topW * 0.7, y - d.fairingH * 0.7, topW * 1.4, d.fairingH * 0.7);
    g.fillStyle(0x3a78c9, 1);
    g.fillRect(-topW * 2.2, y - d.fairingH * 0.5, topW * 1.4, d.fairingH * 0.22);
    g.fillRect(topW * 0.8, y - d.fairingH * 0.5, topW * 1.4, d.fairingH * 0.22);
  }
  // llama
  const run = state.stage < vehicle.stages.length && state.throttle > 0.02;
  if (run) {
    const len = (10 + 46 * state.throttle) * (0.85 + 0.3 * (state.flicker ?? 0.5));
    const w = half * 0.7;
    const fy = oy + 6;
    g.fillStyle(0xff7a3d, 0.9);
    g.fillTriangle(-w, fy, w, fy, 0, fy + len);
    g.fillStyle(0xffe08a, 0.95);
    g.fillTriangle(-w * 0.55, fy, w * 0.55, fy, 0, fy + len * 0.62);
    g.fillStyle(0xffffff, 0.9);
    g.fillTriangle(-w * 0.25, fy, w * 0.25, fy, 0, fy + len * 0.3);
  }
  return d;
}

/** Pedazo suelto (etapa o mitad de cofia) que cae después de separarse. */
export function drawPiece(g, piece) {
  g.fillStyle(piece.color, 1);
  if (piece.kind === 'fairing') {
    g.fillTriangle(0, -piece.h, 0, 0, piece.dir * piece.w, 0);
    g.fillRect(0, 0, piece.dir * piece.w, piece.h * 0.1);
  } else {
    g.fillRect(-piece.w, -piece.h, piece.w * 2, piece.h);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(piece.w * 0.45, -piece.h, piece.w * 0.55, piece.h);
  }
}
