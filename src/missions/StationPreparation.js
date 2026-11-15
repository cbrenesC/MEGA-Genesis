import { loadData } from '../../games/launch/js/state.js';
import { operationalPropellant } from '../../games/launch/js/rules.js';
import { vehicleFor, fuelSummary, FUEL_RANGE } from '../../games/launch/js/flight.js';
import { CATEGORIES, COMPONENTS, emptyBuild, LIMITS, RECOMMENDED_BUILD, RULES, restoreMission, selectComponent, validateBuild } from '../../games/rover/js/rules.js';
import { roverCanvas } from '../../games/rover/js/art.js';
import { hasStorageConsent } from '../welcome/core/consent.js';
import { getLanguage, t, formatNumber } from '../i18n/index.js';
import { newFlightPlan, PAYLOAD_FIELDS, reviewFlightPlan } from './flightPlan.js';
import { renderLaunchStation, rocketControlsSummary } from './launchStationUI.js';
import { renderRoverStation, ROVER_GROUPS } from './roverStationUI.js';
import './stationUI.css';
import { MISSION_EXIT, missionUrl, PREPARATION_KEY, ROVER_SAVE_KEY } from './missionTransfer.js';

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
    this.onMessage = event => {
      if (this.frame && event.origin === location.origin && event.source === this.frame.contentWindow && event.data?.type === MISSION_EXIT) {
        this.closeSimulation();
      }
    };
    window.addEventListener('message', this.onMessage);
  }

  save() {
    if (!hasStorageConsent()) return;
    try { localStorage.setItem(PREPARATION_KEY, JSON.stringify({ launch: this.launch, rover: this.rover })); } catch { /* still available within this visit */ }
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
        this.launch.approved = true; this.save(); this.renderAgain();
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
        this.renderAgain();
      };
    }
    for (const button of root.querySelectorAll('[data-rover-action]')) {
      button.onclick = () => {
        for (const id of ROVER_GROUPS[part]) {
          this.rover[id] = button.dataset.roverAction === 'recommend' ? RECOMMENDED_BUILD[id] : null;
        }
        this.save();
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
