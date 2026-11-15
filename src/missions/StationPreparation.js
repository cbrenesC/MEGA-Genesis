import { loadData } from '../../games/launch/js/state.js';
import { operationalPropellant } from '../../games/launch/js/rules.js';
import { vehicleFor } from '../../games/launch/js/flight.js';
import { CATEGORIES, COMPONENTS, emptyBuild, LIMITS, RECOMMENDED_BUILD, restoreMission, selectComponent, validateBuild } from '../../games/rover/js/rules.js';
import { roverCanvas } from '../../games/rover/js/art.js';
import { hasStorageConsent } from '../welcome/core/consent.js';
import { getLanguage, t, formatNumber } from '../i18n/index.js';
import { newFlightPlan, PAYLOAD_FIELDS, reviewFlightPlan } from './flightPlan.js';
import { MISSION_EXIT, missionUrl, PREPARATION_KEY, ROVER_SAVE_KEY } from './missionTransfer.js';

const ROVER_GROUPS = {
  mobility: ['chassis', 'wheels'], power: ['battery', 'solar'],
  science: ['instrument', 'camera'], comms: ['comms'],
};
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
    const { spacecraft, budget, schedule, orbit } = view.resolved.inputs;
    const grid = el('div', '', 'preparation-grid');
    root.append(grid);
    if (part === 'mission') {
      this.select(grid, 'scenario', this.data.mocks.scenarios.map(s => [s.id, t(`station.scenario.${s.id}`)]), view.resolved.scenario.id,
        scenarioId => this.changeLaunch({ scenarioId, payload: {}, budgetMUSD: null, targetMonths: null, siteId: null, offloadKg: 0, launcherId: null }));
      this.select(grid, 'difficulty', ['facil','normal','dificil'].map(id => [id, t(`station.difficulty.${id}`)]), view.difficulty,
        difficulty => this.changeLaunch({ difficulty, siteId: null, offloadKg: 0, launcherId: null, events: null }));
      this.select(grid, 'team', [['off', t('common.off')], ['on', t('common.on')]], plan.teamMode ? 'on' : 'off',
        value => this.changeLaunch({ teamMode: value === 'on' }));
      this.number(grid, 'budget', budget.totalMUSD, budget.committedMUSD, 10000, '.01', budgetMUSD => this.changeLaunch({ budgetMUSD }));
      this.number(grid, 'schedule', schedule.monthsToTargetDate, 1, 120, 1, targetMonths => this.changeLaunch({ targetMonths }));
      this.note(root, 'station.target', { type: orbit.type, name: spacecraft.name });
    } else if (part === 'payload') {
      for (const [key, [min, max, step]] of Object.entries(PAYLOAD_FIELDS)) {
        this.number(grid, key, spacecraft[key], min, max, step, value => this.changeLaunch({ payload: { ...plan.payload, [key]: value } }));
      }
      this.note(root, 'station.payloadLimit', { reserve: spacecraft.reservedPropellantKg ?? 0 });
      if (view.reason === 'payload') this.note(root, 'station.block.payload');
    } else if (part === 'vehicle') {
      const choices = view.evaluations.map(e => [e.launcherId,
        `${e.launcher.name} · ${t(!e.compatible ? 'station.vehicleIncompatible' : vehicleFor(e.launcherId, orbit.type, this.data) ? 'station.vehicleAvailable' : 'station.vehicleUnavailable')}`]);
      this.select(grid, 'rocket', [['', t('station.choose')], ...choices], view.selected?.launcherId,
        launcherId => this.changeLaunch({ launcherId: launcherId || null, siteId: null, offloadKg: 0 }));
      if (view.selected) {
        const chosen = view.selected;
        if (view.rules.siteChoice) {
          this.select(grid, 'site', chosen.launcher.sites.map(id => [id, this.data.sites.find(s => s.id === id).name]), chosen.siteId,
            siteId => this.changeLaunch({ siteId }));
        } else this.note(root, 'station.selectedSite', { site: chosen.site.name });
        this.number(grid, 'rocketFuel', view.rocketFuelPct, 75, 100, 1,
          rocketFuelPct => this.changeLaunch({ rocketFuelPct }));
        const available = Math.floor(operationalPropellant(spacecraft));
        if (view.rules.propellantOffload && available > 0) {
          this.number(grid, 'offload', Math.floor(chosen.offloadKg), 0, available, 1, offloadKg => this.changeLaunch({ offloadKg }));
        }
        if (getLanguage() === 'es') root.append(el('p', chosen.launcher.summary, 'preparation-note'));
        this.note(root, 'station.rocketStats', { mass: formatNumber(chosen.launchMassKg, 1), capacity: formatNumber(chosen.capacityKg, 1), cost: formatNumber(chosen.totalCostMUSD, 2) });
      }
    } else if (part === 'review') {
      this.select(grid, 'events', [['on', t('common.on')], ['off', t('common.off')]], view.events ? 'on' : 'off',
        value => this.changeLaunch({ events: value === 'on' }));
      if (plan.teamMode) {
        for (const role of view.requiredRoles) {
          const label = el('label', t(`station.ack.${role}`), 'preparation-ack');
          const check = el('input');
          check.type = 'checkbox';
          check.dataset.focus = role;
          check.checked = plan.acks?.[role] === true;
          check.onchange = () => this.changeLaunch({ acks: { ...plan.acks, [role]: check.checked } });
          label.prepend(check);
          grid.append(label);
        }
        const notesLabel = el('label', t('station.field.notes'));
        const notes = el('textarea');
        notes.maxLength = 240;
        notes.rows = 2;
        notes.value = plan.notes ?? '';
        notes.oninput = () => { plan.notes = notes.value; this.save(); };
        notesLabel.append(notes);
        grid.append(notesLabel);
      }
      if (view.selected) this.note(root, 'station.summary', {
        name: view.selected.launcher.name, site: view.selected.site.name, payload: spacecraft.name,
      });
      if (view.reason) this.note(root, `station.block.${view.reason}`);
      if (view.reason === 'compatibility') {
        const list = el('ul');
        for (const check of view.selected.checks.filter(c => c.status === 'fail')) {
          list.append(el('li', getLanguage() === 'es' ? check.detail : t(`station.check.${check.id}`)));
        }
        root.append(list);
      }
      const approve = el('button', t(view.ready ? 'station.approved' : 'station.approve'), 'preparation-confirm');
      approve.type = 'button';
      approve.disabled = !!view.reason || view.ready;
      approve.onclick = () => { this.launch.approved = true; this.save(); this.renderAgain(); };
      root.append(approve);
      if (view.ready) this.note(root, 'station.readyLaunch');
    }
  }

  renderRover(root, part) {
    const grid = el('div', '', 'preparation-grid');
    root.append(grid);
    for (const id of ROVER_GROUPS[part]) {
      this.select(grid, id, [['', t('station.choose')], ...COMPONENTS[id].map(c => [c.id,
        `${getLanguage() === 'es' ? c.name : t(`station.component.${id}.${c.id}`)} · ${c.mass} kg · ${c.cost} cr`])],
        this.rover[id], value => {
          this.rover = value ? selectComponent(this.rover, id, value) : { ...this.rover, [id]: null };
          this.save();
          this.renderAgain();
        });
      const choice = COMPONENTS[id].find(c => c.id === this.rover[id]);
      if (choice && getLanguage() === 'es') grid.lastElementChild.append(el('small', choice.trade));
    }
    const recommend = el('button', t('station.recommend'), 'preparation-confirm');
    recommend.type = 'button';
    recommend.dataset.focus = 'recommend';
    recommend.onclick = () => {
      for (const id of ROVER_GROUPS[part]) this.rover = selectComponent(this.rover, id, RECOMMENDED_BUILD[id]);
      this.save();
      this.renderAgain();
    };
    root.append(recommend);
    const view = validateBuild(this.rover);
    const preview = roverCanvas(this.rover, 3);
    preview.className = 'preparation-rover';
    preview.setAttribute('aria-hidden', 'true');
    root.append(preview);
    this.note(root, 'station.roverStats', { mass: view.stats.mass, cost: view.stats.cost, battery: view.stats.capacity, solar: view.stats.solar });
    if (view.ok) this.note(root, 'station.readyRover');
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
      this.note(root, 'station.roverControls');
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
