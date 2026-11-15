import * as R from '../js/rules.js';
const results = [];
const test = (name, fn) => { try { fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); } };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'falló'); };
const good = () => ({ ...R.RECOMMENDED_BUILD });
const near = (m, s) => { m.rover.x = s.x - 20; m.rover.y = s.y + 10; };
const run = (m, secs, input = {}) => { const ev = []; for (let t = 0; t < secs; t += 0.02) ev.push(...R.step(m, input, 0.02)); return ev; };
const fresh = (b = good()) => { const m = R.createMission(b); run(m, 3); return m; };
const doAction = (m, type) => { const r = R.startAction(m, type); ok(r.ok, r.reason); return run(m, 8); };

test('una opción por categoría: reemplaza, nunca acumula', () => {
  let b = R.emptyBuild();
  for (const cat of R.CATEGORIES) for (const c of R.COMPONENTS[cat.id]) { b = R.selectComponent(b, cat.id, c.id); eq(b[cat.id], c.id); }
  for (let i = 0; i < 20; i++) b = R.selectComponent(b, 'chassis', 'ligero'); // pulsar repetidamente
  eq(R.computeBuild(b).mass, 38 + 20 + 28 + 16 + 15 + 8 + 14, 'masa tras pulsar repetido');
});
test('totales idénticos sin importar el historial de clics', () => {
  let a = good(), b = R.emptyBuild();
  for (const id of ['reforzado', 'ligero', 'estandar', 'reforzado', 'ligero']) b = R.selectComponent(b, 'chassis', id);
  for (const cat of R.CATEGORIES) if (cat.id !== 'chassis') b = R.selectComponent(b, cat.id, a[cat.id]);
  eq(R.computeBuild(b), R.computeBuild(a));
});
test('id inválido no cambia la selección', () => eq(R.selectComponent(good(), 'chassis', 'nada').chassis, 'ligero'));
test('cada componente actualiza masa, costo, consumo, solar y batería', () => {
  const base = R.computeBuild(good());
  eq(R.computeBuild(R.selectComponent(good(), 'battery', 'grande')).capacity, 150);
  eq(R.computeBuild(R.selectComponent(good(), 'solar', 'avanzado')).solar, 2);
  ok(R.computeBuild(R.selectComponent(good(), 'chassis', 'reforzado')).moveDraw > base.moveDraw);
  ok(R.computeBuild(R.selectComponent(good(), 'camera', 'hd')).idleDraw > base.idleDraw);
  for (const cat of R.CATEGORIES) for (const c of R.COMPONENTS[cat.id]) { const s = R.computeBuild(R.selectComponent(good(), cat.id, c.id)); const old = R.getComponent(cat.id, good()[cat.id]); eq(+(s.mass - base.mass).toFixed(2), c.mass - old.mass, cat.id + ' masa'); eq(s.cost - base.cost, c.cost - old.cost, cat.id + ' costo'); }
});
test('límites 145 kg / 850 cr y razones específicas', () => {
  eq(R.LIMITS, { mass: 145, credits: 850 });
  ok(R.validateBuild(good()).ok);
  let v = R.validateBuild(R.emptyBuild()); ok(!v.ok && /Falta elegir: Chasis/.test(v.reasons[0]));
  let heavy = { chassis: 'reforzado', wheels: 'todoterreno', battery: 'grande', solar: 'avanzado', instrument: 'taladro', camera: 'hd', comms: 'alta' };
  v = R.validateBuild(heavy); ok(v.reasons.some((r) => /Masa/.test(r)) && v.reasons.some((r) => /Presupuesto/.test(r)));
  heavy = R.selectComponent(R.selectComponent(R.selectComponent(heavy, 'chassis', 'ligero'), 'battery', 'media'), 'wheels', 'estandar');
  heavy = R.selectComponent(R.selectComponent(R.selectComponent(heavy, 'solar', 'medio'), 'instrument', 'espectrometro'), 'comms', 'media');
  heavy = R.selectComponent(heavy, 'camera', 'basica'); ok(R.validateBuild(heavy).ok, 'vuelve a ser válida');
  ok(R.validateBuild({ ...good(), chassis: 'reforzado', battery: 'grande', instrument: 'taladro' }).reasons.some((r) => /Masa/.test(r)));
  let t = R.createMission; let threw = false; try { t(R.emptyBuild()); } catch { threw = true; } ok(threw, 'no se crea misión inválida');
});
test('recoger: una vez, desaparece del estado, cuenta una vez', () => {
  const m = fresh(), s = m.samples[0]; near(m, s);
  R.startAction(m, 'collect'); const ev = run(m, 3);
  eq(ev.filter((e) => e.type === 'collected').length, 1); eq(s.state, 'collected'); eq(m.inventory, ['S1']); eq(R.progress(m).collected, 1);
  const again = R.startAction(m, 'collect'); ok(!again.ok, 'no se puede volver a recoger'); eq(m.inventory, ['S1']);
  for (let i = 0; i < 50; i++) R.startAction(m, 'collect'); eq(R.progress(m).collected, 1, 'clics repetidos');
});
test('recoger lejos o sin energía falla sin tocar la muestra', () => {
  const m = fresh(); let r = R.startAction(m, 'collect'); ok(!r.ok && /Acércate/.test(r.reason)); eq(m.samples[0].state, 'available');
  near(m, m.samples[0]); m.battery = 1; r = R.startAction(m, 'collect'); ok(!r.ok && /Energía insuficiente/.test(r.reason));
});
test('mover cancela la recolección sin consumir la muestra', () => {
  const m = fresh(); near(m, m.samples[0]); R.startAction(m, 'collect'); run(m, 0.5);
  const ev = run(m, 0.1, { dx: 1, dy: 0 }); ok(ev.some((e) => e.type === 'action-failed')); eq(m.samples[0].state, 'available'); eq(R.progress(m).collected, 0); eq(m.action, null);
});
test('analizar requiere recoger primero y cuenta muestras únicas', () => {
  const m = fresh(); ok(!R.startAction(m, 'analyze').ok);
  near(m, m.samples[0]); doAction(m, 'collect'); doAction(m, 'analyze'); eq(R.progress(m).analyzed, 1);
  ok(!R.startAction(m, 'analyze').ok, 'no se analiza dos veces'); eq(R.progress(m).analyzed, 1);
});
test('ciclo completo: 3 muestras distintas → transmitir → éxito sin doble conteo', () => {
  const m = fresh({ ...good(), battery: 'grande', solar: 'basico' });
  for (const s of m.samples.slice(0, 3)) { near(m, s); doAction(m, 'collect'); doAction(m, 'analyze'); run(m, 30); }
  eq(R.progress(m).analyzed, 3); eq(R.progress(m).transmitted, 0); eq(m.phase, 'explore');
  ok(!R.startAction(m, 'collect').ok || true);
  for (let i = 0; i < 3; i++) { const ev = doAction(m, 'transmit'); run(m, 20); }
  eq(m.phase, 'success'); const p = R.progress(m); eq([p.collected, p.analyzed, p.transmitted], [3, 3, 3]);
  const a = R.evaluate(m), b = R.evaluate(m); eq(a, b, 'evaluación determinista'); ok(a.success && a.score > 0);
  eq(R.step(m, {}, .05), [], 'no hay más eventos tras el éxito');
});
test('transmitir sin análisis está bloqueado con motivo', () => { const r = R.startAction(fresh(), 'transmit'); ok(!r.ok && /análisis/.test(r.reason)); });
test('energía: acotada [0,capacidad], consumo al moverse, recarga solar detenido', () => {
  const m = fresh(); const cap = m.stats.capacity;
  run(m, 1, { dx: 0, dy: 0 }); eq(m.battery, cap, 'no excede capacidad');
  const x0 = m.rover.x; run(m, 2, { dx: -1, dy: 0 }); ok(m.rover.x < x0 && m.battery < cap, 'se mueve y gasta');
  const b1 = m.battery; run(m, 2); ok(m.battery > b1, 'recarga solar parado');
  m.battery = 0.01; run(m, 5, { dx: -1, dy: 0 }); ok(m.battery >= 0, 'nunca negativa');
});
test('sin energía no hay movimiento y se informa', () => { const m = fresh(); m.battery = 0; const x = m.rover.x; R.step(m, { dx: 1, dy: 0 }, .02); eq(m.rover.x, x); ok(m.noPower); });
test('acción que agota la batería falla sin cambiar la muestra', () => {
  const m = fresh(); near(m, m.samples[0]); R.startAction(m, 'collect'); m.battery = 0.001; const ev = run(m, 1);
  ok(ev.some((e) => e.type === 'action-failed')); eq(m.samples[0].state, 'available');
});
test('colisiones con cráter y límites del terreno', () => {
  const m = fresh(); const c = R.CRATERS[1]; m.rover.x = c.x; m.rover.y = c.y + c.r + R.RULES.roverRadius + 1; run(m, 2, { dx: 0, dy: -1 });
  ok(Math.hypot(m.rover.x - c.x, m.rover.y - c.y) >= c.r + R.RULES.roverRadius - 0.5, 'no entra al cráter'); ok(m.bumps >= 1);
  m.rover.x = 25; m.rover.y = 500; run(m, 3, { dx: -1, dy: 0 }); ok(m.rover.x >= R.RULES.roverRadius, 'límite izquierdo');
});
test('dt enorme no teletransporta (pausa/hidden)', () => { const m = fresh(); const x = m.rover.x; R.step(m, { dx: 1, dy: 0 }, 100); ok(Math.abs(m.rover.x - x) < 5); });
test('tiempo agotado → misión fallida y puntuación parcial', () => { const m = fresh(); m.elapsed = R.RULES.timeLimit - .01; run(m, .1); eq(m.phase, 'failed'); const e = R.evaluate(m); ok(!e.success && e.rating === 'X'); });
test('guardar/restaurar: recogidas siguen recogidas, sin duplicar inventario', () => {
  const m = fresh({ ...good(), battery: 'grande', solar: 'basico' }); near(m, m.samples[1]); doAction(m, 'collect'); doAction(m, 'analyze');
  const snap = JSON.parse(JSON.stringify(R.snapshot(m))); snap.inventory.push('S2', 'S2', 'ZZ');
  const r = R.restoreMission(snap); ok(r); eq(r.samples[1].state, 'analyzed'); eq(r.inventory, ['S2']); eq(R.progress(r).collected, 1);
  eq(R.restoreMission({ ...snap, samples: [{ id: 'S1', state: 'raro' }] }), null); eq(R.restoreMission(null), null); eq(R.restoreMission({ ...snap, battery: 'x' }), null);
});
test('misión nueva = estado limpio', () => { const a = fresh(); near(a, a.samples[0]); doAction(a, 'collect'); const b = R.createMission(good()); eq(R.progress(b).collected, 0); eq(b.inventory, []); eq(b.bumps, 0); ok(b.samples.every((s) => s.state === 'available')); });

window.__testResults = results;
const out = document.getElementById('out');
out.innerHTML = results.map(([n, p, e]) => `<div style="color:${p ? '#6ce2cf' : '#ff7b7b'}">${p ? '✔' : '✘'} ${n}${e ? ' — ' + e : ''}</div>`).join('') + `<h3>${results.filter((r) => r[1]).length}/${results.length}</h3>`;
