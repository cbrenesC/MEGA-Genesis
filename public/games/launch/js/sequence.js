// Animación de la secuencia de lanzamiento en <canvas> (Canvas 2D, como el resto
// de minijuegos del repo). Recibe la línea de tiempo del motor y la dibuja fase por fase.
const PAL = { skyLow: [21, 55, 83], skyHigh: [4, 9, 20], white: '#edf2f5', accent: '#e66b4c', cyan: '#73ddcf', flame: '#ffc66b', ground: '#647681', dark: '#0a1524' };
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => `rgb(${c1.map((v, i) => Math.round(lerp(v, c2[i], t))).join(',')})`;
const ease = (t) => t * t * (3 - 2 * t);

// Altitud normalizada (0..1) al comenzar cada fase
const ALT = { countdown: 0, liftoff: 0, max_q: 0.06, stage_sep: 0.22, fairing_sep: 0.42, insertion: 0.58, deploy: 1 };

export class LaunchSequence {
  constructor(canvas, { launcher, result, reduced = false, onPhase, onDone }) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.launcher = launcher; this.result = result; this.phases = result.timeline;
    this.onPhase = onPhase; this.onDone = onDone;
    this.phaseSec = reduced ? 0.7 : 3.2;
    this.reduced = reduced;
    this.stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97) % canvas.width, y: (i * 179) % (canvas.height - 60), s: 1 + (i % 3 === 0) }));
    this.particles = [];
    this.idx = -1; this.t0 = 0; this.running = false; this.done = false; this.raf = 0;
    this.weather = result.events.find((e) => e.id === 'weather_delay');
  }

  start() { this.running = true; this.done = false; this.idx = -1; this.t0 = performance.now(); this.advance(0); this.raf = requestAnimationFrame((t) => this.frame(t)); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  /** Salta directo al final de la secuencia. */
  skip() { if (!this.running) return; this.idx = this.phases.length - 1; this.t0 = performance.now() - this.phaseSec * 1000; this.onPhase?.(this.phases[this.idx], this.idx); }

  advance(i) {
    this.idx = i; this.t0 = performance.now();
    const ph = this.phases[i];
    this.onPhase?.(ph, i);
    if (ph.state === 'fail') this.boom();
  }

  boom() {
    const x = this.c.width / 2, y = this.c.height * 0.5;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col: Math.random() > 0.5 ? PAL.flame : PAL.accent });
    }
  }

  frame(now) {
    if (!this.running) return;
    const el = (now - this.t0) / 1000;
    const dur = this.phases[this.idx].id === 'countdown' ? this.phaseSec + (this.weather ? 1.6 : 0) : this.phaseSec;
    const p = Math.min(1, el / dur);
    if (p >= 1) {
      if (this.idx < this.phases.length - 1) this.advance(this.idx + 1);
      else if (el > dur + 0.8) { this.running = false; this.done = true; this.draw(1); this.onDone?.(); return; }
    }
    this.draw(p, el);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  altitude(p) {
    const cur = this.phases[this.idx].id;
    const keys = Object.keys(ALT);
    const next = ALT[keys[keys.indexOf(cur) + 1]] ?? 1;
    return lerp(ALT[cur], next, ease(p));
  }

  draw(p, el = 0) {
    const { ctx, c } = this, W = c.width, H = c.height;
    const ph = this.phases[this.idx], id = ph.id;
    const alt = this.altitude(p);
    // Cielo: azul de día → negro del espacio
    ctx.fillStyle = mix(PAL.skyLow, PAL.skyHigh, Math.min(1, alt * 1.6));
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaf7ff';
    ctx.globalAlpha = Math.min(1, 0.15 + alt * 1.4);
    for (const s of this.stars) ctx.fillRect(s.x, (s.y + alt * 60) % (H - 40), s.s, s.s);
    ctx.globalAlpha = 1;

    const inOrbitView = id === 'insertion' || id === 'deploy';
    if (inOrbitView) this.drawOrbit(p, id, el);
    else this.drawAscent(p, id, alt, el);

    // Partículas de explosión
    for (const q of this.particles) {
      q.x += q.vx * 0.016; q.y += q.vy * 0.016; q.vy += 40 * 0.016; q.life -= 0.012;
      if (q.life > 0) { ctx.globalAlpha = q.life; ctx.fillStyle = q.col; ctx.fillRect(q.x, q.y, 4, 4); }
    }
    ctx.globalAlpha = 1;

    // Telemetría
    const T = this.tPlus(ph, p);
    ctx.fillStyle = '#e8f6ff'; ctx.font = '16px monospace';
    ctx.fillText(`${this.launcher.name.toUpperCase()}`, 16, 28);
    ctx.fillText(`T${T >= 0 ? '+' : '−'}${Math.abs(Math.round(T))} s · ${ph.label}`, 16, 52);
    ctx.fillText(`ALT ${this.altKm(alt)} km`, 16, 76);
    if (id === 'countdown') this.drawCountdown(p);
  }

  tPlus(ph, p) {
    const i = this.phases.indexOf(ph);
    const nxt = this.phases[i + 1];
    return nxt ? lerp(ph.t, nxt.t, p) : ph.t;
  }
  altKm(alt) { return Math.round(alt * this.result.target_orbit.altitude_km * (this.result.target_orbit.altitude_km > 5000 ? 0.001 : 1)); }

  drawCountdown(p) {
    const { ctx, c } = this;
    const left = Math.max(0, Math.ceil(10 * (1 - p)));
    ctx.fillStyle = PAL.cyan; ctx.font = 'bold 56px monospace'; ctx.textAlign = 'center';
    if (this.weather && p < 0.75) {
      ctx.font = 'bold 22px monospace'; ctx.fillStyle = PAL.flame;
      ctx.fillText('CLIMA: lanzamiento pospuesto', c.width / 2, 150);
      ctx.font = '18px monospace'; ctx.fillStyle = '#e8f6ff';
      ctx.fillText(`+${this.weather.effect.delay_days} días de espera`, c.width / 2, 178);
    } else ctx.fillText(String(left || 'GO'), c.width / 2, 150);
    ctx.textAlign = 'left';
  }

  drawAscent(p, id, alt, el) {
    const { ctx, c } = this, W = c.width, H = c.height;
    const groundY = H - 50 + alt * 900;      // el suelo se aleja
    const rx = W / 2, rh = 110 * (0.7 + this.launcher.visual.height * 0.6);
    const lift = id === 'countdown' ? 0 : ease(Math.min(1, alt / 0.25)) * (H * 0.45);
    const shake = !this.reduced && (id === 'liftoff' || id === 'max_q') ? (Math.random() - 0.5) * 3 : 0;
    const ry = groundY - 4 - lift;
    if (groundY < H + 20) {
      ctx.fillStyle = PAL.ground; ctx.fillRect(0, groundY, W, H - groundY + 20);
      ctx.fillStyle = '#4a5b66'; ctx.fillRect(rx + 50, groundY - 150, 14, 150); // torre
      ctx.fillRect(rx + 30, groundY - 140, 24, 4);
    }
    const failedHere = this.phases[this.idx].state === 'fail';
    if (failedHere && p > 0.25) return;       // el cohete ya no existe
    this.drawRocket(rx + shake, ry, rh, id, p, el);
    if (id !== 'countdown') this.drawFlame(rx + shake, ry, rh);
    if (id === 'max_q') { ctx.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(rx, ry - rh * 0.8, 26 + i * 8 + (p * 10), Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); } }
  }

  drawFlame(x, y, h) {
    const { ctx } = this, boosters = this.launcher.stages.boosters;
    ctx.fillStyle = PAL.flame;
    const L = 20 + Math.random() * 24;
    ctx.fillRect(x - 6, y, 12, L);
    ctx.fillStyle = PAL.accent; ctx.fillRect(x - 3, y, 6, L * 0.6);
    for (let b = 0; b < boosters; b++) { const bx = x + (b % 2 ? 1 : -1) * (18 + (b >> 1) * 8); ctx.fillStyle = PAL.flame; ctx.fillRect(bx - 4, y - 6, 8, 14 + Math.random() * 16); }
  }

  drawRocket(x, y, h, id, p, el) {
    const { ctx } = this, st = this.launcher.stages, w = 24;
    const order = this.phases.map((q) => q.id);
    const cur = order.indexOf(id), sepIdx = 3, fairIdx = 4;
    const stageSep = Math.max(0, cur - sepIdx + (cur === sepIdx ? p : 1)) * 140;   // etapa 1 cae
    const fairSep = cur >= fairIdx ? (cur === fairIdx ? p : 1) * 26 : 0;
    const lowerH = h * 0.55, upperH = h * 0.45;
    // Etapa inferior
    if (cur < sepIdx + 1 || stageSep < 400) {
      ctx.save(); ctx.translate(0, stageSep);
      ctx.fillStyle = PAL.white; ctx.fillRect(x - w / 2, y - lowerH, w, lowerH);
      ctx.fillStyle = '#c5d0d8'; ctx.fillRect(x - w / 2, y - lowerH, 4, lowerH);
      for (let b = 0; b < st.boosters; b++) { const bx = x + (b % 2 ? 1 : -1) * (w / 2 + 6 + (b >> 1) * 10); ctx.fillStyle = '#dfe6ea'; ctx.fillRect(bx - 4, y - lowerH * 0.8, 8, lowerH * 0.8); ctx.fillStyle = PAL.accent; ctx.fillRect(bx - 4, y - lowerH * 0.8 - 6, 8, 6); }
      ctx.restore();
    }
    // Etapa superior + cofia
    const uy = y - lowerH;
    ctx.fillStyle = PAL.white; ctx.fillRect(x - w / 2 + 2, uy - upperH * 0.55, w - 4, upperH * 0.55);
    ctx.fillStyle = PAL.accent; ctx.fillRect(x - w / 2 + 2, uy - 4, w - 4, 4);
    const fy = uy - upperH * 0.55;
    ctx.fillStyle = PAL.white;
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 2 - fairSep, fy); ctx.lineTo(x - fairSep * 1.1, fy - upperH * 0.45); ctx.lineTo(x - 1 - fairSep * 0.2, fy); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 2 + fairSep, fy); ctx.lineTo(x + fairSep * 1.1, fy - upperH * 0.45); ctx.lineTo(x + 1 + fairSep * 0.2, fy); ctx.fill();
    if (fairSep > 1) { ctx.fillStyle = PAL.cyan; ctx.fillRect(x - 6, fy - 14, 12, 14); } // nave expuesta
  }

  drawOrbit(p, id, el) {
    const { ctx, c } = this, W = c.width, H = c.height, cx = W / 2, cy = H + 180;
    const tgt = this.result.target_orbit, ach = this.result.achieved_orbit;
    const R = 330;
    ctx.fillStyle = '#1f6f9a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2d8f6a'; ctx.beginPath(); ctx.arc(cx - 120, cy - R + 40, 40, 0, Math.PI * 2); ctx.fill();
    const rT = R + 90;
    const devPct = ach ? ach.deviation_pct : 0;
    const rA = rT - (devPct * 1.4);
    // Órbita planeada (punteada)
    ctx.setLineDash([6, 6]); ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rT, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.setLineDash([]);
    // Órbita lograda
    ctx.strokeStyle = devPct ? PAL.flame : PAL.white;
    ctx.beginPath(); ctx.arc(cx, cy, rA, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    const a = Math.PI * 1.1 + (id === 'insertion' ? ease(p) * 0.35 : 0.35 + p * 0.3) * Math.PI * 0.8;
    const r = id === 'insertion' ? lerp(R + 12, rA, ease(p)) : rA;
    const sx = cx + Math.cos(a) * r, sy = cy + Math.sin(a) * r;
    ctx.fillStyle = PAL.white; ctx.fillRect(sx - 5, sy - 3, 10, 6);
    if (id === 'deploy') { ctx.fillStyle = PAL.cyan; ctx.fillRect(sx - 20 * p, sy - 2, 14 * p, 4); ctx.fillRect(sx + 6, sy - 2, 14 * p, 4); }
    ctx.font = '14px monospace'; ctx.fillStyle = PAL.cyan; ctx.fillText('--- órbita planeada', 16, H - 48);
    ctx.fillStyle = devPct ? PAL.flame : PAL.white; ctx.fillText(`— órbita lograda${devPct ? ` (−${devPct} % de altitud)` : ''}`, 16, H - 28);
  }
}
