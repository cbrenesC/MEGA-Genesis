// Ayudas de dibujo. El renderizador Canvas de Phaser no admite degradados, así que se dibujan con franjas.

const lerp = (a, b, t) => a + (b - a) * t;
export function lerpColor(c1, c2, t) {
  const r = Math.round(lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t));
  const g = Math.round(lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t));
  const b = Math.round(lerp(c1 & 255, c2 & 255, t));
  return (r << 16) | (g << 8) | b;
}

/** Rectángulo con degradado vertical (arriba → abajo) hecho de franjas. */
export function gradientRect(g, x, y, w, h, top, bottom, steps = 32) {
  const bandH = Math.ceil(h / steps) + 1;
  for (let i = 0; i < steps; i++) {
    g.fillStyle(lerpColor(top, bottom, i / (steps - 1)), 1);
    g.fillRect(x, y + (h * i) / steps, w, bandH);
  }
}
