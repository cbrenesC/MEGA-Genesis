import Phaser from 'phaser';
import { GAME, ZONES } from '../config.js';
import { ROOM, SPAWN, STATIONS } from '../map/controlRoomLayout.js';
import { MapManager } from '../map/MapManager.js';
import { Player } from '../player/Player.js';
import { placeCrew } from '../crew/placeCrew.js';
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
        x, y: y + 52, radius: 78,
        label: () => t('map.prompt', { title: t(`lesson.${id}.title`) }),
        interact: () => this.openTerminal(item),
      });
    }

    placeCrew(this, this.mapManager.collision);

    this.player = new Player(this, SPAWN.x, SPAWN.y);
    this.physics.add.collider(this.player, this.mapManager.collision.solids);
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
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'ESC']);
    if (this.inputsBlocked()) this.input.keyboard.disableGlobalCapture();
    const removeLanguageListener = onLanguageChange(() => {
      this.findInteractionTarget();
      this.updateZoneDisplay(true);
      if (this.activeNotice) this.doorNotice.textContent = t(this.activeNotice.key, this.activeNotice.params);
    });
    const stopWhenSettingsOpen = (event) => {
      if (event.detail.open && this.scene.isActive()) this.stopMovement();
    };
    window.addEventListener('sms-settings-toggled', stopWhenSettingsOpen);
    this.events.once('shutdown', () => {
      removeLanguageListener();
      window.removeEventListener('sms-settings-toggled', stopWhenSettingsOpen);
      this.prompt?.classList.remove('visible');
      this.terminalDialog?.remove();
      this.scale.off('resize', resizeCamera);
    });
    this.updateZoneDisplay(true);
    this.drawMinimap();
  }

  update(_time, delta) {
    if (this.inputsBlocked()) return;
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
    let nearest = null; let nearestDistance = Infinity;
    for (const target of this.interactables) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
      if (distance <= target.radius && distance < nearestDistance) { nearest = target; nearestDistance = distance; }
    }
    this.currentTarget = nearest;
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
      <div class="mission-terminal__actions"><a data-source target="_blank" rel="noopener noreferrer" data-i18n="terminal.source">NASA resource ↗</a><a data-launch hidden data-i18n="terminal.launch">Start mission ▶</a><button type="button" data-close data-i18n="common.close">Close</button></div>
    </div>`;
    document.getElementById('app').append(dialog);
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>this.closeTerminal()));
    this.terminalDialog=dialog;
    this.input.keyboard.on('keydown-ESC',()=>{if(this.terminalOpen)this.closeTerminal();});
  }
  openTerminal(item) {
    const dialog=this.terminalDialog;
    this.terminalOpen=true;
    this.stopMovement();
    this.gameContainer.inert = true;
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
      title.dataset.i18n = `lesson.${item.id}.title`;
      delete role.dataset.i18n;
      portrait.removeAttribute('src');
    }
    const topic = isCrew ? 'crew' : 'lesson';
    dialog.querySelector('[data-description]').dataset.i18n = `${topic}.${item.id}.text`;
    const link=dialog.querySelector('[data-source]');
    link.hidden=!item.source;
    if(item.source)link.href=item.source;
    const launchLink = dialog.querySelector('[data-launch]');
    const missionUrl = { launch: '/games/launch/', rover: '/games/rover/' }[item.mission];
    launchLink.hidden = !missionUrl;
    if (missionUrl) {
      launchLink.href = missionUrl;
      launchLink.dataset.localeLink = '';
    } else {
      launchLink.removeAttribute('href');
      delete launchLink.dataset.localeLink;
    }
    localizeDOM(dialog);
    dialog.hidden=false;
    dialog.querySelector('[data-close]').focus({ preventScroll: true });
  }
  closeTerminal() {
    this.terminalOpen=false;
    this.terminalDialog.hidden=true;
    this.gameContainer.inert = false;
    this.stopMovement();
    this.gameContainer.focus({ preventScroll: true });
  }

}
