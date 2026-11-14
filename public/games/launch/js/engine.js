// Motor de reglas del módulo de LANZAMIENTO.
// Es lógica pura: no toca el DOM ni la red, así se puede probar con Node
// (tests/engine.test.mjs) y reutilizar desde cualquier interfaz.
// Todos los números "de juego" viven en data/*.json; aquí solo hay fórmulas.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Generador pseudoaleatorio con semilla (mulberry32): mismo seed → mismo lanzamiento. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  return next;
}

// ---------- Utilidades de datos ----------

export function getLauncher(data, id) {
  return data.launchers.find((l) => l.id === id) || null;
}

/** Lanzadores visibles según la dificultad (fácil = catálogo reducido). */
export function visibleLaunchers(data, difficulty) {
  const ids = data.config.difficulty[difficulty]?.launcher_ids;
  return ids ? data.launchers.filter((l) => ids.includes(l.id)) : data.launchers;
}

/** Costo del lanzamiento en M$: fijo, o por kg (rideshare). */
export function launchCost(launcher, spacecraftMassKg) {
  const p = launcher.pricing;
  if (p.type === 'per_kg') {
    return Math.max(p.min_cost_musd, (p.usd_per_kg * spacecraftMassKg) / 1e6);
  }
  return p.cost_musd;
}

/** Masa del adaptador (la pieza que une la nave al cohete) también cuenta. */
export function adapterMass(config, spacecraftMassKg) {
  const { adapter_pct, adapter_min_kg } = config.physics;
  return Math.max(adapter_min_kg, spacecraftMassKg * adapter_pct);
}

/** Una órbita retrógrada (98°) equivale, para el sitio, a 82° respecto al ecuador. */
export const effectiveInclination = (deg) => (deg > 90 ? 180 - deg : deg);

const rotationSpeed = (config, latDeg) =>
  (config.physics.earth_rotation_ms_equator * Math.cos((latDeg * Math.PI) / 180)) / 1000; // km/s

// ---------- Capacidad ajustada ----------

/**
 * Capacidad real (kg) de un lanzador hacia una órbita desde un sitio.
 * - base: cifra del catálogo (en el sitio de referencia).
 * - factor de sitio: más cerca del ecuador, la rotación de la Tierra "regala" velocidad.
 * - factor de plano: si la inclinación pedida es menor que la latitud, hay que cambiar de plano (cuesta carga).
 */
export function capacityFor(data, launcher, orbitId, siteId, inclinationDeg) {
  const { config } = data;
  const orbit = config.orbits[orbitId];
  const site = config.sites[siteId];
  const refSite = config.sites[launcher.reference_site];
  const base = launcher.payload_kg[orbitId];
  const out = { base_kg: base ?? 0, kg: 0, reachable: base != null, siteAllowed: true, siteFactor: 1, planeFactor: 1, notes: [] };
  if (base == null) return out;
  if (!site.orbits_allowed.includes(orbitId)) {
    out.siteAllowed = false;
    return out;
  }
  if (orbitId !== 'SSO' && site.id !== refSite.id) {
    const gain = config.physics.rotation_gain_per_kms;
    out.siteFactor = 1 + gain * (rotationSpeed(config, site.latitude_deg) - rotationSpeed(config, refSite.latitude_deg));
    out.notes.push(`Sitio ${site.name}: factor ${out.siteFactor.toFixed(3)} por la rotación terrestre.`);
  }
  const inc = inclinationDeg ?? orbit.inclination_deg;
  if (inc != null) {
    const eff = effectiveInclination(inc);
    if (eff < site.latitude_deg) {
      const { plane_change_penalty_per_deg: pen, plane_change_min_factor: min } = config.physics;
      out.planeFactor = Math.max(min, 1 - pen * (site.latitude_deg - eff));
      out.notes.push(`Inclinación ${inc}° menor que la latitud (${site.latitude_deg}°): cambio de plano, factor ${out.planeFactor.toFixed(2)}.`);
    }
  }
  out.kg = Math.round(base * out.siteFactor * out.planeFactor);
  return out;
}

/** Mejor sitio de un lanzador para una órbita (el de mayor capacidad ajustada). */
export function bestSite(data, launcher, orbitId, inclinationDeg) {
  let best = null;
  for (const siteId of launcher.sites) {
    const cap = capacityFor(data, launcher, orbitId, siteId, inclinationDeg);
    if (cap.siteAllowed && cap.reachable && (!best || cap.kg > best.cap.kg)) best = { siteId, cap };
  }
  return best ? best.siteId : launcher.reference_site;
}

// ---------- Compatibilidad ----------

export function marginLevel(config, marginPct) {
  const t = config.margin_thresholds;
  if (marginPct >= t.green_min_pct) return 'green';
  if (marginPct >= t.yellow_min_pct) return 'yellow';
  return 'red';
}

/** Confiabilidad efectiva: un margen de masa muy justo resta hasta 4 puntos. */
export function effectiveReliability(config, launcher, marginPct) {
  const t = config.margin_thresholds;
  const thin = clamp((t.thin_margin_risk_below_pct - marginPct) / t.thin_margin_risk_below_pct, 0, 1);
  return launcher.reliability * (1 - thin * t.thin_margin_max_penalty);
}

export function failureProbability(config, launcher, marginPct, difficulty) {
  const eff = effectiveReliability(config, launcher, marginPct);
  const scale = config.difficulty[difficulty].failure_scale;
  return clamp((1 - eff) * scale, 0, 0.95);
}

/**
 * Evalúa un lanzador para la misión. Devuelve un informe con cada verificación
 * (ok / warn / fail), el porqué de cada una, y sugerencias si algo falla.
 *
 * input: { spacecraft, target_orbit:{id, inclination_deg?}, budget_musd, difficulty, deadline_months }
 * choice: { launcher_id, site_id? }
 */
export function checkCompatibility(data, input, choice, opts = {}) {
  const { config } = data;
  const launcher = getLauncher(data, choice.launcher_id);
  const difficulty = input.difficulty || 'normal';
  const diff = config.difficulty[difficulty];
  const orbitId = input.target_orbit.id;
  const orbit = config.orbits[orbitId];
  const inc = input.target_orbit.inclination_deg ?? orbit.inclination_deg;
  const siteId = diff.choose_site && choice.site_id && launcher.sites.includes(choice.site_id)
    ? choice.site_id
    : bestSite(data, launcher, orbitId, inc);
  const site = config.sites[siteId];
  const sc = input.spacecraft;
  const checks = [];

  // 1. ¿Llega a esa órbita?
  const cap = capacityFor(data, launcher, orbitId, siteId, inc);
  if (!cap.reachable) {
    checks.push({ id: 'orbit', status: 'fail', title: `No llega a ${orbit.name}`,
      detail: `${launcher.name} no tiene capacidad publicada para esta órbita.`,
      why: 'Cada cohete se diseña para ciertos destinos. Para llegar más alto necesitaría etapas superiores más potentes.' });
  } else if (!cap.siteAllowed) {
    checks.push({ id: 'orbit', status: 'fail', title: `Desde ${site.name} no se puede ir a ${orbitId}`,
      detail: site.note,
      why: 'La trayectoria debe sobrevolar el mar o zonas deshabitadas por seguridad. No todos los sitios tienen esos corredores.' });
  } else {
    checks.push({ id: 'orbit', status: 'ok', title: `Puede alcanzar ${orbit.name}`,
      detail: `Capacidad base: ${cap.base_kg.toLocaleString('es')} kg desde ${site.name}.`,
      why: 'El cohete tiene delta-v suficiente para ese destino.' });
  }

  // 2. Inclinación
  if (cap.reachable && cap.siteAllowed && inc != null) {
    const eff = effectiveInclination(inc);
    if (eff < site.latitude_deg) {
      checks.push({ id: 'inclination', status: 'warn', title: `Cambio de plano necesario (${inc}° < latitud ${site.latitude_deg}°)`,
        detail: `La capacidad baja al ${Math.round(cap.planeFactor * 100)} %.`,
        why: 'Un cohete no puede lanzar a una inclinación menor que la latitud de su sitio sin gastar combustible extra para corregir el plano.' });
    } else {
      checks.push({ id: 'inclination', status: 'ok', title: `Inclinación ${inc}° alcanzable desde latitud ${site.latitude_deg}°`,
        detail: 'No hace falta cambiar de plano.', why: 'La latitud del sitio es menor o igual que la inclinación pedida.' });
    }
  }

  // 3. Masa (lo más importante)
  const adapter = adapterMass(config, sc.mass_kg);
  const payload = sc.mass_kg + adapter;
  const margin_kg = cap.kg - payload;
  const margin_pct = cap.kg > 0 ? (margin_kg / payload) * 100 : -100;
  const usage_pct = cap.kg > 0 ? (payload / cap.kg) * 100 : 999;
  const level = cap.kg > 0 ? marginLevel(config, margin_pct) : 'red';
  const mass = { spacecraft_kg: sc.mass_kg, adapter_kg: Math.round(adapter * 10) / 10, payload_kg: Math.round(payload * 10) / 10,
    capacity_kg: cap.kg, base_capacity_kg: cap.base_kg, margin_kg: Math.round(margin_kg), margin_pct: Math.round(margin_pct * 10) / 10, usage_pct: Math.round(usage_pct), level };
  if (cap.kg > 0) {
    const status = level === 'green' ? 'ok' : level === 'yellow' ? 'warn' : 'fail';
    const t = config.margin_thresholds;
    checks.push({ id: 'mass', status,
      title: status === 'fail' ? `Masa excedida en ${Math.abs(mass.margin_kg).toLocaleString('es')} kg` : `Margen de masa: ${mass.margin_kg.toLocaleString('es')} kg (${mass.margin_pct} %)`,
      detail: `Nave ${sc.mass_kg} kg + adaptador ${mass.adapter_kg} kg = ${mass.payload_kg} kg. Capacidad a ${orbitId}: ${cap.kg.toLocaleString('es')} kg.`,
      why: status === 'ok' ? `Con un margen de ${t.green_min_pct} % o más la nave puede crecer durante el diseño sin cambiar de cohete.`
        : status === 'warn' ? 'Cabe, pero con muy poca holgura: cualquier kilo extra de último momento puede dejarla fuera. Además, un margen muy justo resta confiabilidad.'
        : 'La nave pesa más de lo que el cohete puede llevar a esa órbita. Para despegar, hay que reducir masa o usar un cohete más potente.' });
  }

  // 4. Cofia
  const dims = sc.dimensions;
  if (dims) {
    const f = launcher.fairing;
    const fits = dims.diameter_m <= f.usable_diameter_m && dims.height_m <= f.usable_height_m;
    checks.push({ id: 'fairing', status: fits ? 'ok' : 'fail',
      title: fits ? 'Cabe en la cofia' : 'No cabe en la cofia',
      detail: `Nave ${dims.diameter_m} × ${dims.height_m} m; espacio útil ${f.usable_diameter_m} × ${f.usable_height_m} m.`,
      why: 'La cofia es un cilindro con "nariz": la nave plegada debe caber dentro, sin tocar las paredes.' });
  }

  // 5. Costo y presupuesto
  const cost = launchCost(launcher, sc.mass_kg);
  const afterBudget = input.budget_musd - cost;
  const pct = input.budget_musd > 0 ? Math.round((cost / input.budget_musd) * 100) : 999;
  checks.push({ id: 'budget', status: afterBudget < 0 ? 'fail' : pct > 60 ? 'warn' : 'ok',
    title: afterBudget < 0 ? `Cuesta ${cost} M$ y solo tienes ${input.budget_musd} M$` : `Costo ${cost} M$ (${pct} % del presupuesto)`,
    detail: `Presupuesto restante: ${(Math.round(afterBudget * 10) / 10)} M$.`,
    why: 'El lanzamiento sale del mismo presupuesto que los instrumentos y las operaciones. Un cohete caro deja menos dinero para la ciencia.' });

  // 6. Plazo
  const dl = input.deadline_months;
  if (dl != null) {
    const late = launcher.lead_time_months > dl;
    const strict = diff.enforce_deadline;
    checks.push({ id: 'schedule', status: late ? (strict ? 'fail' : 'warn') : 'ok',
      title: late ? `Plazo de reserva (${launcher.lead_time_months} meses) mayor que tu fecha límite (${dl} meses)` : `Plazo de reserva ${launcher.lead_time_months} meses (límite ${dl})`,
      detail: `Disponibilidad ${launcher.availability}; ~${launcher.launches_per_year} lanzamientos al año.`,
      why: 'Los cohetes grandes se reservan con mucha anticipación porque salen pocas veces al año.' });
  }

  const compatible = !checks.some((c) => c.status === 'fail');
  const relBase = launcher.reliability;
  const relEff = cap.kg > 0 ? effectiveReliability(config, launcher, margin_pct) : relBase;
  const p_fail = failureProbability(config, launcher, cap.kg > 0 ? margin_pct : 100, difficulty);
  const report = {
    launcher_id: launcher.id, site_id: siteId, orbit_id: orbitId, inclination_deg: inc, difficulty,
    compatible, checks, mass, cost_musd: round2(cost), budget_after_musd: round2(afterBudget),
    reliability: { base: relBase, effective: round3(relEff), p_fail: round3(p_fail), p_success: round3(1 - p_fail) },
    capacity_notes: cap.notes,
  };
  // `noSuggestions` evita recursión: las sugerencias evalúan otros lanzadores.
  report.suggestions = opts.noSuggestions ? [] : compatible ? upsideSuggestions(data, input, report) : buildSuggestions(data, input, report);
  return report;
}

const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;

// ---------- Sugerencias ----------

/** Cuántos años de vida cuesta quitar `kg` de combustible. */
export function lifeLostForFuelCut(spacecraft, kg) {
  if (!spacecraft.fuel_kg || !spacecraft.design_life_years) return 0;
  return round2((spacecraft.design_life_years * kg) / spacecraft.fuel_kg);
}

function buildSuggestions(data, input, report) {
  const sc = input.spacecraft;
  const out = [];
  const failIds = report.checks.filter((c) => c.status === 'fail').map((c) => c.id);
  const launcher = getLauncher(data, report.launcher_id);

  if (failIds.includes('mass')) {
    const short = -report.mass.margin_kg;
    // a) Quitar instrumentos (el rol Ciencia debe verlo)
    if (Array.isArray(sc.instruments) && sc.instruments.length) {
      const sorted = [...sc.instruments].sort((a, b) => b.mass_kg - a.mass_kg);
      const picked = []; let sum = 0;
      for (const i of sorted) { if (sum >= short) break; picked.push(i); sum += i.mass_kg; }
      if (sum >= short) out.push({ id: 'drop_instruments', role: 'science',
        text: `Quitar instrumentos (${picked.map((i) => `${i.name} ${i.mass_kg} kg`).join(', ')}) libera ${sum} kg, pero reduce la ciencia posible.` });
    }
    // b) Menos combustible → menos vida útil
    if (sc.fuel_kg && sc.fuel_kg > short) {
      out.push({ id: 'less_fuel', role: 'spacecraft',
        text: `Cargar ${Math.ceil(short)} kg menos de combustible resuelve la masa, pero baja la vida útil unos ${lifeLostForFuelCut(sc, Math.ceil(short))} años.` });
    }
    // c) Otro lanzador
    const alts = alternativeLaunchers(data, input, report.launcher_id).slice(0, 3);
    if (alts.length) out.push({ id: 'other_launcher', role: 'launch',
      text: `Prueba con: ${alts.map((a) => `${a.name} (${a.cost_musd} M$, margen ${a.margin_pct} %)`).join('; ')}.`, launcher_ids: alts.map((a) => a.id) });
    // d) Otra órbita
    const orbits = Object.keys(data.config.orbits).filter((o) => o !== report.orbit_id).filter((o) => {
      const s = bestSite(data, launcher, o);
      const cap = capacityFor(data, launcher, o, s);
      return cap.kg >= report.mass.payload_kg;
    });
    if (orbits.length) out.push({ id: 'other_orbit', role: 'launch',
      text: `Con ${launcher.name} sí cabría en: ${orbits.join(', ')}. Una órbita más baja pide menos delta-v (¡pero cambia la ciencia posible!).`, orbits });
  }
  if (failIds.includes('orbit')) {
    const reach = Object.keys(data.config.orbits).filter((o) => launcher.payload_kg[o] != null);
    if (reach.length) out.push({ id: 'launcher_orbits', role: 'launch', text: `${launcher.name} solo llega a: ${reach.join(', ')}.` });
    const alts = alternativeLaunchers(data, input, report.launcher_id).slice(0, 3);
    if (alts.length) out.push({ id: 'other_launcher', role: 'launch', text: `Lanzadores que sí llegan: ${alts.map((a) => a.name).join(', ')}.`, launcher_ids: alts.map((a) => a.id) });
  }
  if (failIds.includes('fairing')) {
    const alts = alternativeLaunchers(data, input, report.launcher_id).slice(0, 3);
    out.push({ id: 'fairing', role: 'spacecraft', text: 'Pide a la nave pliegues más compactos (paneles solares o antenas plegables) o usa un lanzador con cofia más grande.' });
    if (alts.length) out.push({ id: 'other_launcher', role: 'launch', text: `Cofias que sí caben: ${alts.map((a) => a.name).join(', ')}.`, launcher_ids: alts.map((a) => a.id) });
  }
  if (failIds.includes('budget')) {
    const alts = alternativeLaunchers(data, input, report.launcher_id, { ignoreBudget: false }).slice(0, 3);
    out.push({ id: 'budget', role: 'launch', text: alts.length ? `Dentro de tu presupuesto caben: ${alts.map((a) => `${a.name} (${a.cost_musd} M$)`).join('; ')}.` : 'Ningún lanzador compatible cabe en el presupuesto actual: habría que pedir más fondos o reducir la misión.' });
  }
  if (failIds.includes('schedule')) {
    out.push({ id: 'schedule', role: 'launch', text: 'Elige un lanzador con menor plazo de reserva (suelen ser los de uso frecuente, como Falcon 9) o negocia una fecha más tardía.' });
  }
  return out;
}

/** Cuando todo cabe, también se enseña: ¿qué hago con el margen que sobra? */
function upsideSuggestions(data, input, report) {
  const out = [];
  const sc = input.spacecraft;
  const t = data.config.margin_thresholds;
  if (report.mass.level === 'yellow') {
    out.push({ id: 'thin', role: 'launch', text: `Margen justo (${report.mass.margin_pct} %). Lo recomendable es ${t.green_min_pct} % o más. Si la nave engorda, hay que cambiar de cohete.` });
  }
  if (report.mass.margin_pct > 100) {
    out.push({ id: 'oversized', role: 'launch', text: 'Este cohete es mucho más grande de lo necesario: estás pagando por capacidad que no usas. ¿Hay uno más barato que también cumpla?' });
  }
  if (sc.fuel_kg && sc.design_life_years) {
    const reserve = report.mass.capacity_kg * (t.extra_fuel_reserve_pct / 100);
    const spare = Math.floor(report.mass.margin_kg - reserve);
    if (spare > 0) {
      out.push({ id: 'extra_fuel', role: 'spacecraft',
        text: `Te sobran ${spare} kg sobre el ${t.extra_fuel_reserve_pct} % de reserva. Si la nave los usa como combustible: unos +${lifeLostForFuelCut(sc, spare)} años de vida útil.` });
    }
  }
  return out;
}

/** Lanzadores del catálogo visible que cumplen todo (excepto el elegido). Ordenados por costo. */
export function alternativeLaunchers(data, input, excludeId, opts = {}) {
  const list = [];
  for (const l of visibleLaunchers(data, input.difficulty || 'normal')) {
    if (l.id === excludeId) continue;
    const r = checkCompatibility(data, input, { launcher_id: l.id }, { noSuggestions: true });
    if (r.compatible && r.mass.level !== 'red') list.push({ id: l.id, name: l.name, cost_musd: r.cost_musd, margin_pct: r.mass.margin_pct, reliability: l.reliability });
  }
  return list.sort((a, b) => a.cost_musd - b.cost_musd);
}

/** Evalúa todo el catálogo visible (para la tabla comparativa de trade study). */
export function evaluateAll(data, input) {
  return visibleLaunchers(data, input.difficulty || 'normal').map((l) => checkCompatibility(data, input, { launcher_id: l.id }));
}

/** Para el modo guiado: el más barato que cumple con margen verde. */
export function recommend(data, input) {
  const ok = evaluateAll(data, input).filter((r) => r.compatible && r.mass.level === 'green');
  ok.sort((a, b) => a.cost_musd - b.cost_musd || b.reliability.p_success - a.reliability.p_success);
  return ok[0]?.launcher_id ?? null;
}

// ---------- Roles / equipo ----------

/** Avisos automáticos por rol: lo que la decisión de lanzamiento significa para cada uno. */
export function roleNotices(data, input, report) {
  const sc = input.spacecraft;
  const l = getLauncher(data, report.launcher_id);
  const m = report.mass;
  const lines = { launch: [], spacecraft: [], science: [], comms: [] };
  lines.launch.push(`${l.name} desde ${data.config.sites[report.site_id].name}. Costo ${report.cost_musd} M$; P(éxito) ${(report.reliability.p_success * 100).toFixed(0)} %.`);
  if (m.margin_kg < 0) {
    lines.spacecraft.push(`Hay que quitar ${Math.abs(m.margin_kg)} kg a la nave (o bajar combustible).`);
    lines.science.push('Si se quitan instrumentos, se pierde ciencia: revisen cuál sacrificar.');
  } else if (m.level === 'yellow') {
    lines.spacecraft.push(`Margen justo: no pueden sumar más de ${m.margin_kg} kg a la nave.`);
  } else {
    lines.spacecraft.push(`Pueden sumar hasta ~${m.margin_kg} kg (sin pasar de la reserva).`);
  }
  const f = l.fairing;
  if (sc.dimensions) lines.spacecraft.push(`Cofia útil: ${f.usable_diameter_m} × ${f.usable_height_m} m; la nave mide ${sc.dimensions.diameter_m} × ${sc.dimensions.height_m} m.`);
  lines.comms.push(`La antena/paneles plegados deben caber en la cofia (${f.usable_diameter_m} m de diámetro).`);
  lines.comms.push(`Plazo de reserva ${l.lead_time_months} meses: afecta el calendario de pruebas de enlace.`);
  lines.science.push(`Órbita objetivo ${report.orbit_id}: ${data.config.orbits[report.orbit_id].name}.`);
  return lines;
}

// ---------- Simulación ----------

/**
 * Lanza los dados (con la semilla dada) y devuelve el resultado completo.
 * El orden de las tiradas es fijo para que un seed reproduzca el mismo lanzamiento.
 */
export function simulateLaunch(data, input, choice, seed) {
  const { config } = data;
  const rng = createRng(seed ?? input.seed ?? Date.now());
  const report = checkCompatibility(data, input, choice);
  if (!report.compatible) throw new Error('Intento de lanzar una combinación incompatible: ' + report.checks.filter((c) => c.status === 'fail').map((c) => c.title).join(' | '));
  const launcher = getLauncher(data, report.launcher_id);
  const site = config.sites[report.site_id];
  const diff = config.difficulty[input.difficulty || 'normal'];
  const sc = input.spacecraft;
  const scale = diff.event_scale;
  const allowed = new Set(diff.random_events);
  const rel = launcher.reliability;
  const events = [];

  // Tiradas (siempre las mismas, para reproducibilidad)
  const rWeather = rng(), rWeatherVal = rng();
  const rFail = rng(), rFailPhase = rng();
  const rAnom = rng(), rAnomPhase = rng(), rAnomVal = rng();
  const rOff = rng(), rOffAlt = rng(), rOffInc = rng(), rOffFuel = rng();

  let extraCost = 0, delayDays = 0, fuelLoss = 0;

  // Clima (antes del despegue; la lentitud de un rideshare lo agrava)
  const w = config.events.weather_delay;
  const pWeather = clamp(site.weather_delay_chance * scale, 0, 0.8);
  if (allowed.has('weather_delay') && rWeather < pWeather) {
    delayDays = Math.round((w.delay_days[0] + rWeatherVal * (w.delay_days[1] - w.delay_days[0])) * launcher.delay_multiplier);
    const c = round2(report.cost_musd * w.extra_cost_pct_per_day * delayDays);
    extraCost += c;
    events.push({ id: 'weather_delay', phase: 'countdown', title: w.title, severity: 'minor',
      effect: { delay_days: delayDays, extra_cost_musd: c }, text: `${w.desc} (+${delayDays} días, +${c} M$)`, learn: w.learn });
  }

  // Falla total
  if (rFail < report.reliability.p_fail) {
    const weights = config.events.failure.phase_weights;
    let acc = 0, phase = 'insertion';
    for (const [p, wt] of Object.entries(weights)) { acc += wt; if (rFailPhase < acc) { phase = p; break; } }
    events.push({ id: 'failure', phase, title: config.events.failure.title, severity: 'fatal', effect: { mission_lost: true },
      text: config.events.failure.desc, learn: config.events.failure.learn });
    return finalize({ status: 'failure', events, extraCost, delayDays, fuelLoss: sc.fuel_kg || 0, lifeLost: sc.design_life_years || 0, achieved: null });
  }

  // Anomalía menor
  const a = config.events.minor_anomaly;
  const pAnom = clamp((1 - rel) * a.reliability_multiplier * scale, 0, a.max_probability);
  if (allowed.has('minor_anomaly') && rAnom < pAnom) {
    const pct = a.fuel_loss_pct[0] + rAnomVal * (a.fuel_loss_pct[1] - a.fuel_loss_pct[0]);
    const kg = round2((sc.fuel_kg || 0) * pct / 100);
    fuelLoss += kg;
    const phase = a.phase_options[Math.min(a.phase_options.length - 1, Math.floor(rAnomPhase * a.phase_options.length))];
    events.push({ id: 'minor_anomaly', phase, title: a.title, severity: 'moderate',
      effect: { fuel_lost_kg: kg, fuel_lost_pct: Math.round(pct) }, text: `${a.desc} (−${kg} kg de combustible)`, learn: a.learn });
  }

  // Órbita distinta
  const o = config.events.off_nominal_orbit;
  const pOff = clamp((1 - rel) * o.reliability_multiplier * scale, 0, o.max_probability);
  let achieved = achievedOrbit(data, report, 0, 0);
  if (allowed.has('off_nominal_orbit') && rOff < pOff) {
    const altDev = o.altitude_deviation_pct[0] + rOffAlt * (o.altitude_deviation_pct[1] - o.altitude_deviation_pct[0]);
    const incDev = o.inclination_deviation_deg[0] + rOffInc * (o.inclination_deviation_deg[1] - o.inclination_deviation_deg[0]);
    const fuelPct = o.correction_fuel_pct[0] + rOffFuel * (o.correction_fuel_pct[1] - o.correction_fuel_pct[0]);
    const kg = round2((sc.fuel_kg || 0) * fuelPct / 100);
    fuelLoss += kg;
    achieved = achievedOrbit(data, report, altDev, incDev);
    events.push({ id: 'off_nominal_orbit', phase: o.phase, title: o.title, severity: 'moderate',
      effect: { altitude_deviation_pct: -Math.round(altDev), inclination_deviation_deg: round2(incDev), fuel_lost_kg: kg },
      text: `${o.desc} (altitud −${Math.round(altDev)} %, −${kg} kg de combustible para corregir)`, learn: o.learn });
  }

  const lifeLost = sc.fuel_kg ? lifeLostForFuelCut(sc, fuelLoss) : 0;
  const status = events.some((e) => e.id === 'minor_anomaly' || e.id === 'off_nominal_orbit') ? 'partial' : 'success';
  return finalize({ status, events, extraCost, delayDays, fuelLoss, lifeLost, achieved });

  function finalize(r) {
    const total = round2(report.cost_musd + r.extraCost);
    const fuelLeft = Math.max(0, round2((sc.fuel_kg || 0) - r.fuelLoss));
    const lifeLeft = Math.max(0, round2((sc.design_life_years || 0) - r.lifeLost));
    return {
      status: r.status,
      launcher: { id: launcher.id, name: launcher.name },
      site: { id: site.id, name: site.name },
      target_orbit: { id: report.orbit_id, altitude_km: config.orbits[report.orbit_id].altitude_km, inclination_deg: report.inclination_deg },
      achieved_orbit: r.achieved,
      mission_lost: r.status === 'failure',
      cost_musd: total,
      cost_breakdown: { launch_musd: report.cost_musd, extra_musd: round2(r.extraCost) },
      budget_remaining_musd: round2(input.budget_musd - total),
      delay_days: r.delayDays,
      spacecraft_delta: { fuel_lost_kg: round2(r.fuelLoss), life_lost_years: round2(r.lifeLost), remaining_fuel_kg: fuelLeft, remaining_life_years: lifeLeft },
      mass: report.mass,
      reliability: report.reliability,
      events: r.events,
      timeline: buildTimeline(data, r.events, r.status),
      seed: seed ?? null,
    };
  }
}

function achievedOrbit(data, report, altDevPct, incDev) {
  const orbit = data.config.orbits[report.orbit_id];
  const inc = report.inclination_deg;
  return {
    id: report.orbit_id,
    altitude_km: Math.round(orbit.altitude_km * (1 - altDevPct / 100)),
    inclination_deg: inc == null ? null : round2(inc + (incDev || 0)),
    deviation_pct: Math.round(altDevPct),
  };
}

/** Línea de tiempo de fases del lanzamiento, con estado ok/warn/fail por fase. */
export function buildTimeline(data, events, status) {
  const failEv = events.find((e) => e.id === 'failure');
  const phases = data.config.timeline.phases;
  const stopIdx = failEv ? phases.findIndex((p) => p.id === failEv.phase) : -1;
  const out = [];
  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    if (stopIdx >= 0 && i > stopIdx) break;
    const ev = events.filter((e) => e.phase === p.id);
    const state = ev.some((e) => e.severity === 'fatal') ? 'fail' : ev.length ? 'warn' : 'ok';
    out.push({ ...p, state, events: ev.map((e) => e.id) });
  }
  return out;
}

// ---------- Salida para el siguiente módulo ----------

/** Formato estable que consumen otros módulos (ver LAUNCH_CHANGES.md §7). */
export function buildOutput(result, report, teamReview = null) {
  return {
    version: 1,
    module: 'launch',
    status: result.status,
    mission_lost: result.mission_lost,
    launcher: result.launcher,
    site: result.site,
    cost_musd: result.cost_musd,
    cost_breakdown: result.cost_breakdown,
    budget_remaining_musd: result.budget_remaining_musd,
    target_orbit: result.target_orbit,
    achieved_orbit: result.achieved_orbit,
    delay_days: result.delay_days,
    spacecraft_delta: result.spacecraft_delta,
    mass: result.mass,
    reliability: result.reliability,
    events: result.events.map((e) => ({ id: e.id, phase: e.phase, severity: e.severity, effect: e.effect })),
    team_review: teamReview,
    seed: result.seed,
  };
}

/** Misión de referencia de NASA/ESA más parecida (misma órbita, masa más cercana en escala log). */
export function similarMission(data, orbitId, massKg) {
  const list = data.references.missions.filter((m) => m.orbit === orbitId);
  if (!list.length) return null;
  return [...list].sort((a, b) => Math.abs(Math.log(a.mass_kg / massKg)) - Math.abs(Math.log(b.mass_kg / massKg)))[0];
}
