import Phaser from 'phaser';
import { GAME, ZONES } from '../config.js';
import { ROOM, SPAWN, STATIONS } from '../map/controlRoomLayout.js';
import { MapManager } from '../map/MapManager.js';
import { InteractionSignal } from '../map/InteractionSignal.js';
import { getPreferences } from '../welcome/core/consent.js';
import { Player } from '../player/Player.js';
import { placeCrew } from '../crew/placeCrew.js';
import { CREW } from '../crew/roster.js';
import { CREW_GUIDE } from '../crew/guideFlow.js';
import { StationPreparation } from '../missions/StationPreparation.js';
import { localizeDOM, onLanguageChange, t } from '../i18n/index.js';

export class SpaceCenterScene extends Phaser.Scene {
  constructor() { super('SpaceCenterScene'); }

  create() {
    this.interactables = [];
    this.gameContainer = document.getElementById('game-container');
    this.terminalOpen = false;
    this.mobilePressed = new Set();
    this.mobileDirection = { x: 0, y: 0 };
    this.currentTarget = null;
    this.lastZoneId = '';
    this.noticeTimer = null;
    this.mapManager = new MapManager(this);
    this.mapManager.build();
    // Two mission launch consoles and eight educational terminals.
    const lessons = [
      {id:'objectives',source:'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf'},
      {id:'requirements',source:'https://science.nasa.gov/earth-science/programs/flight-programs/mission-phase-definitions/'},
      {id:'architecture',source:'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf'},
      {id:'design',source:'https://science.nasa.gov/learn/basics-of-space-flight/chapter7-1/'},
      {id:'systems',source:'https://science.nasa.gov/wp-content/uploads/2023/04/nasa_systems_engineering_handbook_0.pdf'},
      {id:'testing',source:'https://science.nasa.gov/learn/basics-of-space-flight/chapter7-2/'},
      {id:'ground',source:'https://www.nasa.gov/reference/jsc-program-management-execution/'},
      {id:'operations',source:'https://science.nasa.gov/earth-science/programs/flight-programs/mission-phase-definitions/'},
    ];
    const sources = new Map(lessons.map(({ id, source }) => [id, source]));
    for (const station of STATIONS) {
      const { x, y, id } = station;
      const item = { ...station, source: sources.get(id) };
      this.interactables.push({
        x, y: y + 52, radius: 78, markerY: -135,
        label: () => t('map.prompt', { title: t(station.setup ? `station.title.${station.part}` : `lesson.${id}.title`) }),
        interact: () => this.openTerminal(item),
      });
    }

    this.crew = placeCrew(this, this.mapManager.collision.solids);
    this.interactionSignal = new InteractionSignal(this);
    this.motionClock = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.player = new Player(this, SPAWN.x, SPAWN.y);
    this.physics.add.collider(this.player, this.mapManager.collision.solids);
    this.physics.add.collider(this.player, this.crew.group);
    this.physics.world.setBounds(0, 0, GAME.worldWidth, GAME.worldHeight);

    const camera = this.cameras.main;
    const resizeCamera = () => {
      const { width, height } = this.scale.gameSize;
      const fit = Math.min(width / ROOM.width, height / ROOM.height);
      // Frame the complete room whenever the furniture remains legible.
      const zoom = width < height ? Math.max(.79, fit) : fit;
      camera.setZoom(zoom);
      if (zoom > fit) {
        camera.setBounds(0, 0, ROOM.width, ROOM.height);
        camera.startFollow(this.player, true, .14, .14);
      } else {
        camera.stopFollow();
        camera.removeBounds();
        camera.centerOn(ROOM.width / 2, ROOM.height / 2);
      }
    };
    resizeCamera();
    this.scale.on('resize', resizeCamera);
    camera.setRoundPixels(true);

    this.prompt = document.getElementById('interaction-prompt');
    this.doorNotice = document.getElementById('door-notice');
    this.zoneLabel = document.getElementById('zone-label');
    this.roomTitle = document.getElementById('room-title');
    this.roomSubtitle = document.getElementById('room-subtitle');
    this.sectorReadout = document.getElementById('sector-readout');
    this.coordinateReadout = document.getElementById('coordinate-readout');
    this.minimap = document.getElementById('minimap');
    this.minimapContext = this.minimap?.getContext('2d');
    if (this.minimapContext) this.minimapContext.imageSmoothingEnabled = false;

    this.createTerminalDialog();
    this.preparation = new StationPreparation(this);
    this.completedGuideSteps = new Set(this.preparation.guideProgress);
    this.createCrewGuide();
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'ESC']);
    if (this.inputsBlocked()) this.input.keyboard.disableGlobalCapture();
    const removeLanguageListener = onLanguageChange(() => {
      this.findInteractionTarget();
      if (this.terminalOpen && !this.terminalDialog.hidden) this.preparation.renderAgain();
      this.renderCrewGuide();
      this.updateZoneDisplay(true);
      if (this.activeNotice) this.doorNotice.textContent = t(this.activeNotice.key, this.activeNotice.params);
    });
    const stopWhenSettingsOpen = (event) => {
      if (event.detail.open && this.scene.isActive()) this.stopMovement();
    };
    window.addEventListener('sms-settings-toggled', stopWhenSettingsOpen);
    const hideSignal = () => this.interactionSignal.hide();
    this.events.on('pause', hideSignal);
    this.events.once('shutdown', () => {
      removeLanguageListener();
      window.removeEventListener('sms-settings-toggled', stopWhenSettingsOpen);
      this.prompt?.classList.remove('visible');
      this.preparation?.destroy();
      this.terminalDialog?.remove();
      this.guidePanel?.remove();
      this.scale.off('resize', resizeCamera);
      this.events.off('pause', hideSignal);
    });
    this.updateZoneDisplay(true);
    this.drawMinimap();
  }

  update(_time, delta) {
    const blocked = this.inputsBlocked();
    const animate = !blocked && getPreferences().animations && !this.reducedMotion.matches;
    if (animate) this.motionClock += delta;
    this.crew.update(delta, animate, this.player, this.motionClock);
    if (blocked) {
      this.interactionSignal.hide();
      this.prompt.classList.remove('visible');
      return;
    }
    this.consoleActivity.update(this.motionClock, animate);
    this.player.update();
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.E)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.ESC)) this.pauseExploration();
    this.updateZoneDisplay(false);
    this.findInteractionTarget();
    this.minimapClock = (this.minimapClock ?? 0) + delta;
    if (this.minimapClock > 130) { this.minimapClock = 0; this.drawMinimap(); }
  }

  inputsBlocked() {
    return this.gameContainer.inert || this.terminalOpen || this.mediaScreen?.isOpen() || !document.getElementById('settings-dialog').hidden;
  }

  stopMovement() {
    this.player.body.stop();
    this.player.setIdlePose();
    this.mobilePressed.clear();
    this.mobileDirection.x = 0;
    this.mobileDirection.y = 0;
    this.input.keyboard.resetKeys();
  }

  pauseExploration() {
    if (this.inputsBlocked() || !this.scene.isActive() || this.scene.isPaused()) return;
    this.stopMovement();
    this.scene.launch('PauseScene');
    this.scene.pause();
  }

  setMobileDirection(direction, active) {
    if (active && (this.inputsBlocked() || !this.scene.isActive())) return;
    if (active) this.mobilePressed.add(direction);
    else this.mobilePressed.delete(direction);
    const has = (name) => this.mobilePressed.has(name);
    this.mobileDirection.x = Number(has('right')) - Number(has('left'));
    this.mobileDirection.y = Number(has('down')) - Number(has('up'));
  }

  findInteractionTarget() {
    if (!this.player || !this.prompt) return;
    if (this.inputsBlocked() || !this.scene.isActive()) {
      this.currentTarget = null;
      this.interactionSignal.hide();
      this.prompt.classList.remove('visible');
      return;
    }
    let nearest = null; let nearestDistance = Infinity;
    for (const target of this.interactables) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
      if (distance <= target.radius && distance < nearestDistance) { nearest = target; nearestDistance = distance; }
    }
    this.currentTarget = nearest;
    const animate = getPreferences().animations && !this.reducedMotion.matches;
    this.interactionSignal.update(nearest, this.motionClock, animate);
    if (nearest) {
      const label = nearest.label();
      if (this.prompt.textContent !== label) this.prompt.textContent = label;
      this.prompt.classList.add('visible');
    } else {
      this.prompt.classList.remove('visible');
    }
  }

  interact() {
    if (this.inputsBlocked() || !this.scene.isActive()) return;
    this.findInteractionTarget();
    const target = this.currentTarget;
    if (!target) {
      this.showNotice('map.approach');
      return;
    }
    target.interact();
  }

  showNotice(key, params) {
    if (!this.doorNotice) return;
    this.doorNotice.textContent = t(key, params);
    this.activeNotice = { key, params };
    this.doorNotice.classList.add('visible');
    this.noticeTimer?.remove(false);
    this.noticeTimer = this.time.delayedCall(2200, () => this.doorNotice?.classList.remove('visible'));
  }

  updateZoneDisplay(force) {
    const zone = ZONES.find((candidate) => this.player.x >= candidate.x && this.player.x <= candidate.x + candidate.width && this.player.y >= candidate.y && this.player.y <= candidate.y + candidate.height);
    if (!zone) return;
    if (force || zone.id !== this.lastZoneId) {
      this.lastZoneId = zone.id;
      if (this.zoneLabel) this.zoneLabel.textContent = t(zone.shortTitle);
      if (this.roomTitle) this.roomTitle.textContent = t(zone.title);
      if (this.roomSubtitle) this.roomSubtitle.textContent = t(zone.subtitle);
      if (this.sectorReadout) this.sectorReadout.textContent = zone.code;
    }
    if (this.coordinateReadout) {
      const col = Math.floor(this.player.x / GAME.tileSize).toString().padStart(2, '0');
      const row = Math.floor(this.player.y / GAME.tileSize).toString().padStart(2, '0');
      this.coordinateReadout.textContent = `${col} / ${row}`;
    }
  }

  drawMinimap() {
    const context = this.minimapContext;
    if (!context || !this.player) return;
    const width = this.minimap.width; const height = this.minimap.height;
    const scaleX = width / GAME.worldWidth; const scaleY = height / GAME.worldHeight;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#08141e'; context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(89,142,157,.18)'; context.lineWidth = 1;
    for (let x = 0; x < width; x += 16) { context.beginPath(); context.moveTo(x + .5, 0); context.lineTo(x + .5, height); context.stroke(); }
    for (let y = 0; y < height; y += 16) { context.beginPath(); context.moveTo(0, y + .5); context.lineTo(width, y + .5); context.stroke(); }
    context.fillStyle = '#314a54';
    for (const corridor of []) {
      context.fillRect(corridor.x * scaleX, corridor.y * scaleY, corridor.width * scaleX, corridor.height * scaleY);
    }
    const fills = { control: '#336f7a' };
    for (const zone of ZONES) {
      const x = Math.round(zone.x * scaleX); const y = Math.round(zone.y * scaleY);
      const w = Math.max(2, Math.round(zone.width * scaleX)); const h = Math.max(2, Math.round(zone.height * scaleY));
      context.fillStyle = fills[zone.id]; context.fillRect(x, y, w, h);
      context.strokeStyle = 'rgba(220,240,229,.62)'; context.lineWidth = 1; context.strokeRect(x + .5, y + .5, w - 1, h - 1);
      context.fillStyle = '#d1ded8'; context.font = '5px monospace';
      context.fillText(zone.code.split(' · ')[0], x + 3, y + 8);
    }
    context.fillStyle = '#ffb577';
    for (const door of this.mapManager.doors) {
      context.fillRect(Math.round(door.x * scaleX) - 1, Math.round(door.y * scaleY) - 1, 3, 3);
    }
    const playerX = Math.round(this.player.x * scaleX); const playerY = Math.round(this.player.y * scaleY);
    context.fillStyle = '#65f4e7'; context.fillRect(playerX - 3, playerY - 3, 7, 7);
    context.fillStyle = '#fff8d5'; context.fillRect(playerX - 1, playerY - 1, 3, 3);
  }
  currentGuideStep() {
    return CREW_GUIDE.find(step => !this.completedGuideSteps.has(step.id)) ?? null;
  }

  completeGuideStep(id) {
    const step = this.currentGuideStep();
    if (!step || step.id !== id || !this.preparation.hasGuideConversation(step.talkKey)) return false;
    this.completedGuideSteps.add(id);
    this.preparation.completeGuideStep(id);
    this.renderCrewGuide();
    return true;
  }

  onStationConfigurationChanged(item) {
    const step = this.currentGuideStep();
    if (!step || step.stationId !== item?.id || !this.preparation.hasGuideConversation(step.talkKey)) return;
    if (this.preparation.guideStationReady(step)) this.completeGuideStep(step.id);
  }

  onMissionCompleted(mission) {
    const step = this.currentGuideStep();
    if (step?.mission === mission && this.preparation.hasGuideConversation(step.talkKey)) this.completeGuideStep(step.id);
  }

  createCrewGuide() {
    const panel = document.createElement('aside');
    panel.id = 'crew-guide';
    panel.className = 'crew-guide';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.dataset.i18nAria = 'guide.title';
    panel.innerHTML = `<div class="crew-guide__top"><span data-i18n="guide.title">Crew guide</span><span data-count></span></div>
      <h2 data-name></h2><p data-task></p><p class="crew-guide__hint" data-hint></p>
      <button type="button" data-guide-action data-i18n="guide.skip">Skip this step</button>`;
    document.getElementById('app').append(panel);
    localizeDOM(panel);
    panel.querySelector('[data-guide-action]').addEventListener('click', () => {
      const step = this.currentGuideStep();
      if (step) this.completeGuideStep(step.id);
      else {
        this.preparation.resetGuide();
        this.completedGuideSteps.clear();
        this.renderCrewGuide();
      }
    });
    this.guidePanel = panel;
    this.renderCrewGuide();
  }

  renderCrewGuide() {
    if (!this.guidePanel) return;
    const step = this.currentGuideStep();
    const name = this.guidePanel.querySelector('[data-name]');
    const task = this.guidePanel.querySelector('[data-task]');
    const hint = this.guidePanel.querySelector('[data-hint]');
    const count = this.guidePanel.querySelector('[data-count]');
    const action = this.guidePanel.querySelector('[data-guide-action]');
    if (step) {
      const member = CREW.find(person => person.id === step.crewId);
      count.textContent = t('guide.counter', { current: this.completedGuideSteps.size + 1, total: CREW_GUIDE.length });
      name.textContent = member?.name ?? '';
      task.textContent = t(step.taskKey);
      const talked = this.preparation.hasGuideConversation(step.talkKey);
      hint.textContent = talked
        ? t('guide.openConsole', { console: t(step.stationNameKey) })
        : t('guide.talkFirst', { name: member?.name ?? '' });
      action.textContent = t('guide.skip');
      this.crew?.setGuideTarget(step.crewId);
    } else {
      count.textContent = t('guide.complete.counter');
      name.textContent = t('guide.complete.title');
      task.textContent = t('guide.complete.task');
      hint.textContent = t('guide.complete.hint');
      action.textContent = t('guide.restart');
      this.crew?.setGuideTarget(null);
    }
  }

  createTerminalDialog() {
    const dialog = document.createElement('section');
    dialog.id = 'mission-terminal';
    dialog.className = 'mission-terminal';
    dialog.hidden = true;
    dialog.innerHTML = `<div class="mission-terminal__panel" role="dialog" aria-modal="true" aria-labelledby="mission-terminal-title">
      <div class="mission-terminal__top"><span data-i18n="terminal.header">◈ MISSION CONTROL // TERMINAL</span><button type="button" data-close data-i18n-aria="terminal.close">✕</button></div>
      <div class="mission-terminal__profile">
        <img data-portrait alt="" hidden />
        <div><h2 id="mission-terminal-title" data-title></h2><p data-role class="mission-terminal__role" hidden></p></div>
      </div>
      <p data-description></p>
      <section class="mission-terminal__guide" data-guide-next hidden>
        <strong data-i18n="guide.dialogLabel">YOUR NEXT STEP</strong><p data-guide-instruction></p>
      </section>
      <div data-preparation></div>
      <div class="mission-terminal__actions"><a data-source target="_blank" rel="noopener noreferrer" data-i18n="terminal.source">NASA resource ↗</a><button type="button" data-launch hidden data-i18n="terminal.launch">Start mission ▶</button><button type="button" data-close data-i18n="common.close">Close</button></div>
    </div>`;
    document.getElementById('app').append(dialog);
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>this.closeTerminal()));
    this.terminalDialog=dialog;
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.stopPropagation(); this.closeTerminal(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled), a[href], input, select, textarea, summary')]
          .filter(node => !node.closest('[hidden]') && (!node.closest('details:not([open])') || node.matches('summary')));
        const target = event.shiftKey ? items.at(-1) : items[0];
        const edge = event.shiftKey ? items[0] : items.at(-1);
        if (target && (document.activeElement === edge || !items.includes(document.activeElement))) {
          event.preventDefault();
          target.focus();
        }
      }
    });
  }
  openTerminal(item) {
    const dialog=this.terminalDialog;
    this.terminalOpen=true;
    this.stopMovement();
    this.interactionSignal.hide();
    this.gameContainer.inert = true;
    const cornerControls = document.querySelector('.corner-controls');
    if (cornerControls) cornerControls.inert = true;
    this.input.keyboard.disableGlobalCapture();
    const isCrew = item.kind === 'crew';
    const title = dialog.querySelector('[data-title]');
    const role = dialog.querySelector('[data-role]');
    const portrait = dialog.querySelector('[data-portrait]');
    const header = dialog.querySelector('.mission-terminal__top span');
    header.dataset.i18n = isCrew ? 'crew.header' : 'terminal.header';
    dialog.querySelector('.mission-terminal__top [data-close]').dataset.i18nAria =
      isCrew ? 'crew.close' : 'terminal.close';
    role.hidden = portrait.hidden = !isCrew;
    if (isCrew) {
      delete title.dataset.i18n;
      title.textContent = item.name;
      role.dataset.i18n = `crew.${item.id}.role`;
      portrait.src = this.textures.get(item.texture).getSourceImage().toDataURL();
    } else {
      title.dataset.i18n = item.setup ? `station.title.${item.part}` : `lesson.${item.id}.title`;
      delete role.dataset.i18n;
      portrait.removeAttribute('src');
    }
    const topic = isCrew ? 'crew' : 'lesson';
    dialog.querySelector('[data-description]').dataset.i18n = `${topic}.${item.id}.text`;
    const nextGuide = dialog.querySelector('[data-guide-next]');
    const instruction = dialog.querySelector('[data-guide-instruction]');
    const step = this.currentGuideStep();
    const isActiveGuide = isCrew && step?.crewId === item.id;
    nextGuide.hidden = !isActiveGuide;
    if (isActiveGuide) {
      this.preparation.markGuideConversation(step.talkKey);
      instruction.textContent = t('guide.dialogInstruction', {
        console: t(step.stationNameKey),
        task: t(step.taskKey),
      });
    } else instruction.textContent = '';
    const link=dialog.querySelector('[data-source]');
    link.hidden=!item.source;
    if(item.source)link.href=item.source;
    localizeDOM(dialog);
    dialog.hidden=false;
    dialog.querySelector('.mission-terminal__panel').scrollTop = 0;
    void this.preparation.render(item);
    this.renderCrewGuide();
    dialog.querySelector('[data-close]').focus({ preventScroll: true });
  }
  closeTerminal() {
    this.terminalOpen=false;
    this.terminalDialog.hidden=true;
    this.preparation.item = null;
    this.gameContainer.inert = false;
    const cornerControls = document.querySelector('.corner-controls');
    if (cornerControls) cornerControls.inert = false;
    this.stopMovement();
    this.input.keyboard.enableGlobalCapture();
    this.gameContainer.focus({ preventScroll: true });
  }

}
