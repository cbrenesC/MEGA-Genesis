import Phaser from 'phaser';
import { loadData } from '../state.js';
import { app } from '../store.js';
import { reviewFlightPlan } from '../../../../src/missions/flightPlan.js';
import { readMissionPlan } from '../../../../src/missions/missionTransfer.js';
import { t } from '../../../../src/i18n/index.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  async create() {
    try {
      app.data = await loadData();
      const plan = readMissionPlan(location.hash);
      const review = plan && reviewFlightPlan(app.data, plan);
      if (!review?.ready) throw new Error(t('station.prepareFirst'));
      app.teamMode = plan.teamMode === true;
      app.acks = Object.fromEntries(review.requiredRoles.map(role => [role, true]));
      app.notes = app.teamMode && typeof plan.notes === 'string' ? plan.notes.slice(0, 240) : '';
      app.resolved = review.resolved;
      app.evaluations = review.evaluations;
      app.options = review.options;
      app.selectedId = review.selected.launcherId;
      app.eventsEnabled = review.events;
      app.rocketFuelPct = review.rocketFuelPct;
      app.launchWindow = review.launchWindow;
      app.confirmed = true;
      document.getElementById('boot').hidden = true;
      this.scene.start('PadScene');
    } catch (error) {
      document.querySelector('#boot .boot-bar').hidden = true;
      const el = document.getElementById('boot-error');
      el.hidden = false;
      el.textContent = error.message;
      document.getElementById('boot-back').hidden = false;
      document.getElementById('boot-back').focus();
    }
  }
}
