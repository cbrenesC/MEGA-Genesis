import Phaser from 'phaser';
import { GAME, ZONES } from '../config.js';
import { MapManager } from '../map/MapManager.js';
import { Player } from '../player/Player.js';

export class SpaceCenterScene extends Phaser.Scene {
  constructor() { super('SpaceCenterScene'); }

  create() {
    this.interactables = [];
    this.mobilePressed = new Set();
    this.mobileDirection = { x: 0, y: 0 };
    this.currentTarget = null;
    this.lastZoneId = '';
    this.noticeTimer = null;
    this.mapManager = new MapManager(this);
    this.mapManager.build();
    this.player = new Player(this, 640, 510);
    this.physics.add.collider(this.player, this.mapManager.collision.solids);
    this.physics.world.setBounds(0, 0, GAME.worldWidth, GAME.worldHeight);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, GAME.worldWidth, GAME.worldHeight);
    camera.setZoom(1);
    camera.startFollow(this.player, true, .085, .085);
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

    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'ESC']);
    this.events.on('shutdown', () => {
      this.prompt?.classList.remove('visible');
      this.mapManager?.destroy();
    });
    this.updateZoneDisplay(true);
    this.drawMinimap();
  }

  update(time, delta) {
    this.player.update(time, delta);
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.E)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.ESC)) this.pauseExploration();
    this.updateZoneDisplay(false);
    this.findInteractionTarget();
    this.minimapClock = (this.minimapClock ?? 0) + delta;
    if (this.minimapClock > 130) { this.minimapClock = 0; this.drawMinimap(); }
  }

  pauseExploration() {
    if (!this.scene.isActive() || this.scene.isPaused()) return;
    this.scene.launch('PauseScene');
    this.scene.pause();
  }

  setMobileDirection(direction, active) {
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
      this.prompt.textContent = nearest.label;
      this.prompt.classList.add('visible');
    } else {
      this.prompt.classList.remove('visible');
    }
  }

  interact() {
    const target = this.currentTarget;
    if (!target) {
      this.showNotice('EXPLORA EL COMPLEJO · BUSCA UN ACCESO O CONSOLA');
      return;
    }
    target.interact();
  }

  showNotice(message) {
    if (!this.doorNotice) return;
    this.doorNotice.textContent = message;
    this.doorNotice.classList.add('visible');
    this.noticeTimer?.remove(false);
    this.noticeTimer = this.time.delayedCall(2200, () => this.doorNotice?.classList.remove('visible'));
  }

  updateZoneDisplay(force) {
    const zone = ZONES.find((candidate) => this.player.x >= candidate.x && this.player.x <= candidate.x + candidate.width && this.player.y >= candidate.y && this.player.y <= candidate.y + candidate.height);
    if (!zone) return;
    if (force || zone.id !== this.lastZoneId) {
      this.lastZoneId = zone.id;
      if (this.zoneLabel) this.zoneLabel.textContent = zone.shortTitle;
      const displayTitles = {
        control: 'Launch<br />Control Center',
        engineering: 'Construction &amp;<br />Engineering',
        resources: 'Resource<br />Management',
        launchpad: 'Rocket Launch<br />Pad',
      };
      if (this.roomTitle) this.roomTitle.innerHTML = displayTitles[zone.id] ?? zone.title;
      if (this.roomSubtitle) this.roomSubtitle.textContent = zone.subtitle;
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
    for (const corridor of [{ x: 1152, y: 352, width: 256, height: 192 }, { x: 512, y: 832, width: 256, height: 128 }, { x: 1152, y: 1120, width: 256, height: 224 }, { x: 1792, y: 832, width: 224, height: 64 }]) {
      context.fillRect(corridor.x * scaleX, corridor.y * scaleY, corridor.width * scaleX, corridor.height * scaleY);
    }
    const fills = { control: '#336f7a', engineering: '#705944', resources: '#416772', launchpad: '#6c7164' };
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
}
