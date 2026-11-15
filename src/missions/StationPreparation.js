import { loadData } from '../../games/launch/js/state.js';
import { operationalPropellant } from '../../games/launch/js/rules.js';
import { vehicleFor, fuelSummary, FUEL_RANGE } from '../../games/launch/js/flight.js';
import { loadForecast, buildWindows, recommendWindow, bestPerDay, siteLocal } from '../../games/launch/js/launchWeather.js';
import { CATEGORIES, COMPONENTS, emptyBuild, LIMITS, RECOMMENDED_BUILD, RULES, restoreMission, selectComponent, validateBuild } from '../../games/rover/js/rules.js';
import { roverCanvas } from '../../games/rover/js/art.js';
import { hasStorageConsent } from '../welcome/core/consent.js';
import { getLanguage, t, formatNumber } from '../i18n/index.js';
import { newFlightPlan, PAYLOAD_FIELDS, reviewFlightPlan } from './flightPlan.js';
import { renderLaunchStation, rocketControlsSummary } from './launchStationUI.js';
import { renderRoverStation, ROVER_GROUPS } from './roverStationUI.js';
import './stationUI.css';
import { MISSION_COMPLETE, MISSION_EXIT, missionUrl, PREPARATION_KEY, ROVER_SAVE_KEY } from './missionTransfer.js';

const el = (tag, value = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};

export class StationPreparation {
  constructor(scene) {
    this.scene = scene;
    let saved;
    try { if (hasStorageConsent()) saved = JSON.parse(localStorage.getItem(PREPARATION_KEY)); } catch { /* optional storage */ }
    this.launch = saved?.launch;
    this.rover = { ...emptyBuild(), ...saved?.rover };
    this.guideProgress = Array.isArray(saved?.guideProgress) ? saved.guideProgress : [];
    this.guideConversations = Array.isArray(saved?.guideConversations) ? saved.guideConversations : [];
    this.onMessage = event => {
      if (!this.frame || event.origin !== location.origin || event.source !== this.frame.contentWindow) return;
      if (event.data?.type === MISSION_COMPLETE && ['launch', 'rover'].includes(event.data.mission)) {
        this.scene.onMissionCompleted(event.data.mission);
      }
      if (event.data?.type === MISSION_EXIT) this.closeSimulation();
    };
    window.addEventListener('message', this.onMessage);
  }

  save() {
    if (!hasStorageConsent()) return;
    try { localStorage.setItem(PREPARATION_KEY, JSON.stringify({ launch: this.launch, rover: this.rover, guideProgress: this.guideProgress, guideConversations: this.guideConversations })); } catch { /* still available within this visit */ }
  }

  hasGuideConversation(key) { return this.guideConversations.includes(key); }

  markGuideConversation(key) {
    if (!this.guideConversations.includes(key)) {
      this.guideConversations.push(key);
      this.save();
    }
  }

  completeGuideStep(id) {
    if (!this.guideProgress.includes(id)) {
      this.guideProgress.push(id);
      this.save();
    }
  }

  resetGuide() {
    this.guideProgress = [];
    this.guideConversations = [];
    this.save();
  }

  guideStationReady(step) {
    if (!step) return false;
    if (step.kind.startsWith('launch-')) {
      if (!this.data || !this.launch) return false;
      const view = reviewFlightPlan(this.data, this.launch);
      if (step.kind === 'launch-mission') return Boolean(this.launch.scenarioId);
      if (step.kind === 'launch-rocket') return Boolean(view.selected?.compatible);
      if (step.kind === 'launch-payload') {
        const payload = this.launch.payload ?? {};
        const validFields = Object.entries(PAYLOAD_FIELDS).every(([key, [min, max]]) => {
          const value = Number(payload[key]);
          return Number.isFinite(value) && value >= min && value <= max;
        });
        return validFields && view.reason !== 'payload';
      }
      if (step.kind === 'launch-review') return view.ready;
      return false;
    }
    if (step.kind === 'rover-group') {
      return (ROVER_GROUPS[step.part] ?? []).every(id =>
        COMPONENTS[id].some(option => option.id === this.rover[id]));
    }
    return false;
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
    this.frame?.remove();
    this.frame = null;
    this.item = null;
  }

  async render(item) {
    this.item = item;
    const dialog = this.scene.terminalDialog;
    const content = dialog.querySelector('[data-preparation]');
    content.replaceChildren();
    content.className = item?.setup ? `station-ui station-ui--${item.setup}` : '';
    dialog.classList.toggle('mission-terminal--setup', Boolean(item?.setup));
    const start = dialog.querySelector('[data-launch]');
    start.hidden = true;
    start.onclick = null;
    if (!item?.mission && !item?.setup) return;
    if (item.mission === 'launch' || item.setup === 'launch') {
      if (!this.data) content.append(el('p', t('station.loading')));
      try {
        this.data ??= await (this.loading ??= loadData());
        if (!this.launch || typeof this.launch !== 'object' || Array.isArray(this.launch)) this.launch = newFlightPlan(this.data);
      } catch {
        this.loading = null;
        if (item === this.item) content.replaceChildren(el('p', t('station.loadError')));
        return;
      }
    }
    if (item !== this.item || dialog.hidden) return;
    content.replaceChildren();
    if (item.setup === 'launch') this.renderLaunch(content, item.part);
    if (item.setup === 'rover') this.renderRover(content, item.part);
    if (item.mission) this.renderStart(content, start, item.mission);
  }

  renderAgain() {
    const focus = document.activeElement?.dataset.focus;
    const panel = this.scene.terminalDialog.querySelector('.mission-terminal__panel');
    const top = panel.scrollTop;
    void this.render(this.item).then(() => {
      panel.scrollTop = top;
      if (focus) this.scene.terminalDialog.querySelector(`[data-focus="${focus}"]`)?.focus({ preventScroll: true });
    });
  }

  changeLaunch(patch) {
    Object.assign(this.launch, { acks: {} }, patch, { approved: false });
    this.save();
    this.scene.onStationConfigurationChanged(this.item);
    this.renderAgain();
  }

  select(root, key, options, value, onChange) {
    const label = el('label', t(`station.field.${key}`));
    const select = el('select');
    select.dataset.focus = key;
    for (const [id, name] of options) select.add(new Option(name, id));
    select.value = value ?? '';
    select.onchange = () => onChange(select.value);
    label.append(select);
    root.append(label);
  }

  /**
   * Planificador de clima: pronóstico real de Meteomatics para el sitio elegido (o modo simulación, siempre avisado),
   * semáforo GO / CAUTION / NO-GO por ventana, la mejor fecha y hora, y elección de la ventana de lanzamiento.
   * El pronóstico se pide una sola vez al abrir la estación y queda en caché (ver launchWeather.js).
   */
  weatherPlanner(root, view) {
    const chosen = view.selected;
    const siteId = chosen.siteId;
    const box = el('section', '', 'wx-planner');
    box.append(el('h3', t('station.weather.title')), el('p', t('station.weather.loading'), 'muted'));
    root.append(box);
    const item = this.item;
    const locale = getLanguage() === 'es' ? 'es-CR' : 'en-US';
    const when = (time) => {
      const l = siteLocal(time, siteId);
      const d = new Date(`${l.date}T${l.clock}:00Z`);
      return `${new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)} · ${l.clock}`;
    };
    const statusLabel = (st) => ({ GO: t('station.weather.go'), CAUTION: t('station.weather.caution'), 'NO-GO': t('station.weather.nogo') })[st] ?? st;
    const chip = (st) => { const c = el('span', statusLabel(st), `wx-chip wx-${st === 'GO' ? 'go' : st === 'CAUTION' ? 'caution' : 'nogo'}`); return c; };
    const value = (f) => `${formatNumber(f.value, f.value < 10 && f.unit !== '%' ? 1 : 0)}${f.unit ? ` ${f.unit}` : ''}`;
    const pick = (w, source) => this.changeLaunch({ launchWindow: w ? { siteId, time: w.time, source, status: w.status, score: w.score, isDay: w.isDay, conditions: w.conditions } : null });

    loadForecast(siteId).then((forecast) => {
      if (this.item !== item || !box.isConnected) return;
      const windows = buildWindows(forecast.hours, { siteId });
      const best = recommendWindow(windows);
      const real = forecast.source === 'meteomatics';
      box.replaceChildren(el('h3', t('station.weather.title')));
      const src = el('p', real ? t('station.weather.sourceReal') : t('station.weather.sourceSim', { reason: t(`station.weather.reason.${['credentials', 'rate-limit', 'auth', 'timeout', 'offline', 'empty', 'upstream'].includes(forecast.reason) ? forecast.reason : 'network'}`) }), real ? 'wx-source' : 'wx-source wx-sim');
      box.append(src, el('p', t('station.weather.disclaimer'), 'muted'));
      if (!best) { box.append(el('p', t('station.weather.none'), 'status-yellow')); return; }

      const current = view.launchWindow && windows.find(w => w.time === view.launchWindow.time) ? view.launchWindow : null;
      const shown = current ? windows.find(w => w.time === current.time) : best;
      // recomendación
      const rec = el('div', '', 'wx-best');
      const head = el('p');
      head.append(el('b', t('station.weather.best')), ` ${when(best.time)} ${t('station.weather.siteTime')} · `, chip(best.status), ` ${t('station.weather.score', { score: best.score })}`);
      rec.append(head);
      rec.append(el('p', best.reasons.length
        ? t('station.weather.why', { list: best.reasons.map(r => `${t(`station.weather.factor.${r.id}`)} ${formatNumber(r.value, 1)}${r.unit ? ` ${r.unit}` : ''}`).join(', ') })
        : t('station.weather.whyGood'), 'muted'));
      box.append(rec);
      // factores de la ventana mostrada (la elegida, o la recomendada)
      const table = el('dl', '', 'wx-factors');
      for (const f of shown.factors) {
        const dt = el('dt', t(`station.weather.factor.${f.id}`));
        const dd = el('dd');
        if (f.available) dd.append(value(f), ' ', chip(f.status)); else dd.append(el('span', t('station.weather.noData'), 'muted'));
        table.append(dt, dd);
      }
      const c = shown.conditions;
      for (const [key, unit] of [['humidityPct', '%'], ['pressureHpa', 'hPa'], ['windDirDeg', '°']]) {
        if (typeof c[key] !== 'number') continue;
        table.append(el('dt', t(`station.weather.info.${key}`)), el('dd', `${formatNumber(c[key], 0)} ${unit}`));
      }
      box.append(el('p', t(current ? 'station.weather.selected' : 'station.weather.showing', { when: when(shown.time) }), current ? 'status-green' : 'muted'), table);
      // elegir ventana: la mejor de cada día y, desplegable, todas las horas
      const list = el('div', '', 'wx-windows');
      const button = (w, text) => {
        const b = el('button', '', `wx-window${current?.time === w.time ? ' is-selected' : ''}`);
        b.type = 'button';
        b.append(el('span', text), chip(w.status), el('small', `${w.score}/100 ${w.isDay ? '☀' : '🌙'}`));
        b.onclick = () => pick(w, forecast.source);
        return b;
      };
      for (const w of bestPerDay(windows, siteId)) list.append(button(w, when(w.time)));
      box.append(el('p', t('station.weather.choose'), 'muted'), list);
      const all = el('details');
      all.append(el('summary', t('station.weather.allHours', { n: windows.length })));
      const grid = el('div', '', 'wx-windows wx-all');
      for (const w of windows) grid.append(button(w, when(w.time)));
      all.append(grid);
      box.append(all);
      const actions = el('div', '', 'actions');
      const useBest = el('button', t('station.weather.useBest'));
      useBest.type = 'button'; useBest.disabled = current?.time === best.time; useBest.onclick = () => pick(best, forecast.source);
      actions.append(useBest);
      if (current) { const clear = el('button', t('station.weather.clear')); clear.type = 'button'; clear.onclick = () => pick(null); actions.append(clear); }
      box.append(actions, el('p', t('station.weather.effect'), 'muted'));
    });
  }

  /** Carga de combustible del cohete: deslizador dentro de lo permitido, con toneladas, peso al despegue y empuje/peso. */
  rocketFuel(root, view, chosen) {
    const info = vehicleFor(chosen.launcherId, view.resolved.inputs.orbit.type, this.data);
    if (!info) { this.number(root, 'rocketFuel', view.rocketFuelPct, FUEL_RANGE.minPct, FUEL_RANGE.maxPct, 1, rocketFuelPct => this.changeLaunch({ rocketFuelPct })); return; }
    const tons = kg => formatNumber(kg / 1000, kg < 100000 ? 1 : 0);
    const label = el('label', t('station.field.rocketFuel'));
    const slider = el('input');
    Object.assign(slider, { type: 'range', min: FUEL_RANGE.minPct, max: FUEL_RANGE.maxPct, step: 1, value: view.rocketFuelPct });
    slider.dataset.focus = 'rocketFuel';
    const amount = el('output');
    const detail = el('p', '', 'muted');
    const show = () => {
      const f = fuelSummary(info.vehicle, chosen.launchMassKg, slider.valueAsNumber / 100);
      amount.textContent = t('station.fuel.amount', { pct: slider.value, tons: tons(f.propKg), full: tons(f.fullKg) });
      detail.textContent = t('station.fuel.detail', { liftoff: tons(f.liftoffKg), twr: formatNumber(f.twr, 2), min: FUEL_RANGE.minPct, max: FUEL_RANGE.maxPct });
    };
    slider.oninput = show;
    slider.onchange = () => this.changeLaunch({ rocketFuelPct: slider.valueAsNumber });
    show();
    label.append(slider, amount);
    root.append(label, detail);
  }

  number(root, key, value, min, max, step, onChange) {
    const label = el('label', t(`station.field.${key}`));
    const input = el('input');
    Object.assign(input, { type: 'number', value, min, max, step, required: true });
    input.dataset.focus = key;
    input.onchange = () => {
      if (input.validity.valid && Number.isFinite(input.valueAsNumber)) onChange(input.valueAsNumber);
      else { input.reportValidity(); input.value = value; }
    };
    label.append(input);
    root.append(label);
  }

  note(root, key, params) { root.append(el('p', t(key, params), 'preparation-note')); }

  renderLaunch(root, part) {
    const plan = this.launch;
    const view = reviewFlightPlan(this.data, plan);
    root.innerHTML = renderLaunchStation(part, { data: this.data, plan, view, onlyCompatible: this.onlyCompatible, translate: t },
      '<div data-station-fields></div>');
    const fields = root.querySelector('[data-station-fields]');
    const grid = el('div', '', 'preparation-grid');
    fields.append(grid);
    const { spacecraft, budget, schedule } = view.resolved.inputs;

    if (part === 'mission') {
      root.querySelector('#scenario').onchange = event => this.changeLaunch({
        scenarioId: event.target.value, payload: {}, budgetMUSD: null,
        targetMonths: null, siteId: null, offloadKg: 0, launcherId: null,
      });
      for (const radio of root.querySelectorAll('[name=difficulty]')) {
        radio.onchange = () => this.changeLaunch({ difficulty: radio.value, siteId: null, offloadKg: 0, launcherId: null, events: null });
      }
      root.querySelector('#team-mode').onchange = event => this.changeLaunch({ teamMode: event.target.checked });
      this.number(grid, 'budget', budget.totalMUSD, budget.committedMUSD, 10000, '.01', budgetMUSD => this.changeLaunch({ budgetMUSD }));
      this.number(grid, 'schedule', schedule.monthsToTargetDate, 1, 120, 1, targetMonths => this.changeLaunch({ targetMonths }));
    } else if (part === 'payload') {
      for (const [key, [min, max, step]] of Object.entries(PAYLOAD_FIELDS)) {
        this.number(grid, key, spacecraft[key], min, max, step, value => this.changeLaunch({ payload: { ...plan.payload, [key]: value } }));
      }
      this.note(fields, 'station.payloadLimit', { reserve: spacecraft.reservedPropellantKg ?? 0 });
      if (view.reason === 'payload') this.note(fields, 'station.block.payload');
    } else if (part === 'vehicle') {
      const filter = root.querySelector('#only-compatible');
      filter.onchange = () => { this.onlyCompatible = filter.checked; this.renderAgain(); };
      const chosen = view.selected;
      if (chosen) {
        fields.className = 'card';
        const heading = el('h2', t('station.vehicleSettings', { rocket: chosen.launcher.name }));
        fields.prepend(heading);
        if (view.rules.siteChoice) {
          this.select(grid, 'site', chosen.launcher.sites.map(id => {
            const site = this.data.sites.find(s => s.id === id);
            return [id, `${site.name} · ${Math.abs(site.latitudeDeg)}° ${site.latitudeDeg < 0 ? 'S' : 'N'}`];
          }), chosen.siteId, siteId => this.changeLaunch({ siteId }));
        } else this.note(fields, 'station.selectedSite', { site: chosen.site.name });
        this.rocketFuel(grid, view, chosen);
        const available = Math.floor(operationalPropellant(spacecraft));
        if (view.rules.propellantOffload && available > 0) {
          const label = el('label', t('station.field.offload'));
          const fuel = el('input');
          Object.assign(fuel, { type: 'range', min: 0, max: available, step: 1, value: Math.floor(chosen.offloadKg) });
          fuel.dataset.focus = 'offload';
          const amount = el('output', `${fuel.value} kg`);
          fuel.oninput = () => { amount.textContent = `${fuel.value} kg`; };
          fuel.onchange = () => this.changeLaunch({ offloadKg: fuel.valueAsNumber });
          label.append(fuel, amount);
          grid.append(label);
          const detail = el('div');
          detail.innerHTML = rocketControlsSummary(view);
          fields.append(detail);
        }
      }
      for (const button of root.querySelectorAll('[data-select]')) {
        button.onclick = () => {
          const launcherId = button.dataset.select;
          if (view.selected?.launcherId !== launcherId) this.changeLaunch({ launcherId, siteId: null, offloadKg: 0 });
          requestAnimationFrame(() => {
            if (this.item?.part !== 'vehicle') return;
            root.querySelector('[data-station-fields] select, [data-station-fields] input')?.focus();
          });
        };
      }
    } else if (part === 'review') {
      if (view.selected) fields.className = 'card';
      this.select(grid, 'events', [['on', t('common.on')], ['off', t('common.off')]], view.events ? 'on' : 'off',
        value => this.changeLaunch({ events: value === 'on' }));
      if (view.selected) this.weatherPlanner(fields, view);
      for (const check of root.querySelectorAll('[data-ack]')) {
        check.onchange = () => this.changeLaunch({ acks: { ...plan.acks, [check.dataset.ack]: check.checked } });
      }
      const notes = root.querySelector('#team-notes');
      if (notes) notes.oninput = () => { plan.notes = notes.value; this.save(); };
      if (view.reason) this.note(fields, `station.block.${view.reason}`);
      const approve = el('button', t(view.ready ? 'station.approved' : 'station.approve'), 'primary big');
      approve.type = 'button';
      approve.disabled = !!view.reason || view.ready;
      approve.onclick = () => {
        this.launch.approved = true; this.save();
        this.scene.onStationConfigurationChanged(this.item);
        this.renderAgain();
        requestAnimationFrame(() => root.querySelector('[data-station-fields] p[tabindex]')?.focus());
      };
      fields.append(approve);
      if (view.ready) { this.note(fields, 'station.readyLaunch'); fields.lastElementChild.tabIndex = -1; }
    }
    this.bindGlossary(root);
  }

  bindGlossary(root) {
    for (const button of root.querySelectorAll('[data-term]')) {
      const term = this.data.glossary[button.dataset.term];
      if (!term) continue;
      button.type = 'button';
      button.setAttribute('aria-expanded', 'false');
      button.onclick = () => {
        const existing = root.querySelector('.station-glossary');
        const wasOpen = button.getAttribute('aria-expanded') === 'true';
        existing?.remove();
        for (const active of root.querySelectorAll('[data-term][aria-expanded="true"]')) active.setAttribute('aria-expanded', 'false');
        if (wasOpen) return;
        const help = el('aside', '', 'station-glossary');
        help.append(el('strong', term.title), el('p', term.text));
        if (term.more || term.formula) {
          const more = el('details');
          more.append(el('summary', t('station.glossaryMore')));
          if (term.more) more.append(el('p', term.more));
          if (term.formula) more.append(el('code', term.formula));
          help.append(more);
        }
        const host = button.closest('h2, h3, p, details, dl') ?? button;
        host.after(help);
        button.setAttribute('aria-expanded', 'true');
      };
    }
  }

  renderRover(root, part) {
    root.innerHTML = renderRoverStation(part, this.rover, { translate: t, number: formatNumber });
    const preview = roverCanvas(this.rover, 6);
    preview.setAttribute('aria-hidden', 'true');
    root.querySelector('[data-rover-preview]').append(preview);
    for (const button of root.querySelectorAll('[data-component]')) {
      button.onclick = () => {
        const { component, option } = button.dataset;
        this.rover = selectComponent(this.rover, component, option);
        this.save();
        this.scene.onStationConfigurationChanged(this.item);
        this.renderAgain();
      };
    }
    for (const button of root.querySelectorAll('[data-rover-action]')) {
      button.onclick = () => {
        for (const id of ROVER_GROUPS[part]) {
          this.rover[id] = button.dataset.roverAction === 'recommend' ? RECOMMENDED_BUILD[id] : null;
        }
        this.save();
        this.scene.onStationConfigurationChanged(this.item);
        this.renderAgain();
      };
    }
  }

  renderStart(root, start, mission) {
    const flight = mission === 'launch' ? reviewFlightPlan(this.data, this.launch) : null;
    const rover = mission === 'rover' ? validateBuild(this.rover) : null;
    const ready = flight?.ready ?? rover.ok;
    if (flight && !ready) this.note(root, flight.reason ? `station.block.${flight.reason}` : 'station.block.review');
    if (flight) this.note(root, 'station.flightControls');
    if (rover && !ready) {
      const missing = CATEGORIES.filter(c => !COMPONENTS[c.id].some(option => option.id === this.rover[c.id]));
      if (missing.length) this.note(root, 'station.roverMissing', { parts: missing.map(c => t(`station.field.${c.id}`)).join(', ') });
      if (rover.stats.mass > LIMITS.mass || rover.stats.cost > LIMITS.credits) this.note(root, 'station.roverLimits');
    }
    if (rover) {
      this.note(root, 'station.roverStats', { mass: rover.stats.mass, cost: rover.stats.cost, battery: rover.stats.capacity, solar: rover.stats.solar });
      this.note(root, 'station.roverControls', { goal: RULES.sampleGoal });
      let saved;
      try { if (hasStorageConsent()) saved = restoreMission(JSON.parse(localStorage.getItem(ROVER_SAVE_KEY))); } catch { /* optional storage */ }
      if (saved) {
        const resume = el('button', t('station.resumeRover'), 'preparation-confirm');
        resume.type = 'button';
        resume.onclick = () => this.openSimulation(mission, saved.build, { resume: true });
        root.append(resume);
      }
    }
    if (ready) this.note(root, mission === 'launch' ? 'station.readyLaunch' : 'station.readyRover');
    start.hidden = false;
    start.disabled = !ready;
    start.onclick = () => {
      if (ready) this.openSimulation(mission, mission === 'launch' ? this.launch : this.rover);
    };
  }

  openSimulation(mission, plan, options) {
    if (this.frame) return;
    this.scene.stopMovement();
    this.scene.terminalDialog.hidden = true;
    this.item = null;
    this.frame = el('iframe', '', 'mission-simulation');
    this.frame.title = t(`lesson.${mission}.title`);
    this.frame.src = missionUrl(mission, getLanguage(), plan, options);
    document.getElementById('app').append(this.frame);
    this.frame.focus();
    const frame = this.frame;
    frame.addEventListener('load', () => { if (this.frame === frame) frame.focus(); }, { once: true });
  }

  closeSimulation() {
    this.frame.remove();
    this.frame = null;
    this.scene.closeTerminal();
  }
}
