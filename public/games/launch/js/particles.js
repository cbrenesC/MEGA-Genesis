// Partículas del vuelo (fuego, humo, chispas, explosión). Módulo PURO: sin Phaser ni DOM.
//
// Viven en el MUNDO, en el marco del suelo: x = metros hacia el este de la plataforma, y = altura sobre el suelo.
// Una vez emitidas NO siguen al cohete: el humo y el fuego se quedan donde nacieron y la cámara los deja atrás.
// El tiempo avanza con el tiempo físico (warp incluido), así que todo va a la par de la simulación.

export const MAX_PARTICLES = 520;

const KINDS = {
  // life en segundos físicos · drag = pérdida de velocidad por segundo · grow = px por segundo de vida
  fire: { life: 1.0, drag: 1.6, grow: 0 },
  smoke: { life: 9, drag: 0.55, grow: 0.9 },
  gas: { life: 2.2, drag: 1.2, grow: 1.2 },
  spark: { life: 2.4, drag: 0.15, grow: 0, gravity: 9.8 },
  boom: { life: 3.2, drag: 0.5, grow: 0, gravity: 4 },
  flash: { life: 0.5, drag: 0, grow: 22 },
};

export class ParticleSystem {
  constructor(max = MAX_PARTICLES) {
    this.max = max;
    this.list = [];
    this.seed = 1234567;
  }

  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  spread(a) { return (this.rand() * 2 - 1) * a; }

  clear() { this.list.length = 0; }
  get count() { return this.list.length; }

  /** Agrega una partícula. Si no hay lugar, descarta la más vieja (el límite protege el rendimiento). */
  add(kind, x, y, vx, vy, extra = {}) {
    const def = KINDS[kind];
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ kind, x, y, vx, vy, age: 0, life: (extra.life ?? def.life) * (0.75 + 0.5 * this.rand()), size: extra.size ?? 2, tone: extra.tone ?? this.rand() });
  }

  /**
   * Avanza `dt` segundos físicos. Sin aire (arriba) el humo se desvanece rápido.
   */
  step(dt) {
    if (dt <= 0) return;
    const keep = [];
    for (const p of this.list) {
      const def = KINDS[p.kind];
      const airFade = Math.exp(-Math.max(0, p.y) / 7500); // aire que queda a la altura de la partícula
      p.age += dt * (p.kind === 'smoke' || p.kind === 'gas' ? 1 + (1 - airFade) * 2.5 : 1);
      if (p.age >= p.life) continue;
      const damp = Math.exp(-def.drag * dt);
      p.vx *= damp; p.vy *= damp;
      if (def.gravity) p.vy -= def.gravity * dt;
      if (p.kind === 'smoke' || p.kind === 'gas') p.vy += 3 * dt * airFade; // el aire caliente sube un poco
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += def.grow * dt * 0.5;
      if (p.y < 0 && p.kind !== 'smoke') { p.y = 0; p.vy = Math.abs(p.vy) * 0.25; p.vx *= 0.6; }
      keep.push(p);
    }
    this.list = keep;
  }

  /** Fracción de vida usada (0 recién nacida, 1 por desaparecer). */
  static life(p) { return Math.min(1, p.age / p.life); }

  // ---- emisores ----

  /**
   * Llama de los motores: fuego corto y humo/gases que quedan atrás.
   * @param from/to  posición de la tobera antes y ahora (marco del suelo), para no dejar huecos si se mueve rápido
   * @param vel      velocidad del cohete respecto al suelo (m/s) · axis = hacia dónde apunta
   */
  exhaust({ from, to, vel, axis, throttle, air, dt }) {
    if (throttle < 0.04) return;
    const n = Math.max(1, Math.min(14, Math.round(throttle * 5 * (0.5 + Math.min(2, dt * 14)))));
    for (let i = 0; i < n; i++) {
      const k = this.rand();
      const x = from.x + (to.x - from.x) * k; const y = from.y + (to.y - from.y) * k;
      const back = 25 + 70 * this.rand();
      const vx = vel.x - axis.x * back + this.spread(6 + 10 * (1 - air)); const vy = vel.y - axis.y * back + this.spread(6 + 10 * (1 - air));
      this.add(air > 0.15 || this.rand() < 0.55 ? 'fire' : 'gas', x, y, vx, vy, { size: 1 + Math.round(throttle * 1.5 * (1 + (1 - air))), life: air > 0.15 ? 0.5 : 0.9 });
      // humo de la columna: solo donde hay aire
      if (air > 0.04 && this.rand() < 0.5 * Math.min(1, air * 2)) {
        this.add('smoke', x + this.spread(3), y, vel.x * 0.1 + this.spread(8), vel.y * 0.1 + this.spread(8), { size: 2 + Math.round(this.rand() * 2), life: 5 + 6 * air });
      }
    }
  }

  /** Nube de humo y gases que sale hacia los lados al encender y despegar (rebota en la plataforma). */
  padBillow({ x, throttle, strength = 1 }) {
    const n = Math.round((2 + throttle * 5) * strength);
    for (let i = 0; i < n; i++) {
      const side = this.rand() < 0.5 ? -1 : 1;
      const sp = (18 + 70 * this.rand()) * (0.6 + throttle * 0.7);
      this.add('smoke', x + side * (6 + this.rand() * 10), this.rand() * 4, side * sp, 3 + this.rand() * 14, { size: 3 + Math.round(this.rand() * 4), life: 7 + 5 * this.rand() });
      if (this.rand() < 0.4) this.add('fire', x + side * 5, 1 + this.rand() * 4, side * sp * 1.2, 4 + this.rand() * 8, { size: 2 + Math.round(this.rand() * 2), life: 0.45 });
    }
  }

  /** Destello y gases fríos al soltar una etapa o una cofia. */
  separation({ x, y, vx, vy, axis, strength = 1 }) {
    this.add('flash', x, y, vx, vy, { size: 3, life: 0.28 });
    for (let i = 0; i < Math.round(14 * strength); i++) {
      const a = this.rand() * Math.PI * 2; const sp = 6 + 22 * this.rand();
      this.add('gas', x, y, vx + Math.cos(a) * sp - axis.x * 8, vy + Math.sin(a) * sp - axis.y * 8, { size: 2, life: 1.3 });
    }
    for (let i = 0; i < Math.round(8 * strength); i++) {
      const a = this.rand() * Math.PI * 2; const sp = 5 + 18 * this.rand();
      this.add('spark', x, y, vx + Math.cos(a) * sp, vy + Math.sin(a) * sp, { size: 1, life: 1.1 });
    }
  }

  explosion({ x, y, vx = 0, vy = 0, n = 70 }) {
    this.add('flash', x, y, vx, vy, { size: 6, life: 0.55 });
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2; const sp = 15 + 140 * this.rand();
      this.add('boom', x, y, vx + Math.cos(a) * sp, vy + Math.sin(a) * sp, { size: 1 + Math.round(this.rand() * 2) });
    }
  }
}
