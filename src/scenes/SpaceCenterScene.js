import Phaser from 'phaser';
import { GAME, ZONES } from '../config.js';
import { MapManager } from '../map/MapManager.js';
import { Player } from '../player/Player.js';

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
      {title:'MISSION OBJECTIVES',text:'Begin with a scientific question. Define measurable goals, mission success criteria, and the data needed to answer that question.',source:'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf'},
      {title:'MISSION REQUIREMENTS',text:'Translate objectives into verifiable requirements for performance, safety, cost, schedule, and operations. Identify constraints and major risks.',source:'https://science.nasa.gov/earth-science/programs/flight-programs/mission-phase-definitions/'},
      {title:'MISSION ARCHITECTURE',text:'Plan four connected segments: launch, space, ground, and users. Define how each segment supports mission objectives.',source:'https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf'},
      {title:'PRELIMINARY DESIGN',text:'Compare feasible concepts, select instruments, estimate mass and power, design communications, and establish an initial mission plan.',source:'https://science.nasa.gov/learn/basics-of-space-flight/chapter7-1/'},
      {title:'SYSTEMS ENGINEERING',text:'Integrate propulsion, power, guidance, software, thermal control, communications, and ground operations into one verified mission.',source:'https://science.nasa.gov/wp-content/uploads/2023/04/nasa_systems_engineering_handbook_0.pdf'},
      {title:'TESTING AND READINESS',text:'Build and integrate subsystems, verify requirements, conduct environmental tests, and complete flight readiness reviews before launch.',source:'https://science.nasa.gov/learn/basics-of-space-flight/chapter7-2/'},
      {title:'GROUND OPERATIONS',text:'Prepare mission control, communications, tracking, contingency procedures, launch criteria, and operational timelines.',source:'https://www.nasa.gov/reference/jsc-program-management-execution/'},
      {title:'MISSION OPERATIONS',text:'Operate the spacecraft or rover, collect scientific data, monitor system health, evaluate results, and plan mission closeout.',source:'https://science.nasa.gov/earth-science/programs/flight-programs/mission-phase-definitions/'},
    ];
    const stations = [];
    for (const y of [402,593]) for (const x of [330,494,658,822,986]) stations.push({x,y});
    const missions = new Map([
      ['494,402',{title:'ROCKET LAUNCH MISSION',text:'Prepare and execute a launch. Plan the launch window, vehicle readiness, ground systems, and flight safety.',mission:'launch'}],
      ['822,402',{title:'LUNAR ROVER MISSION',text:'Plan a rover delivery to the Moon. Consider payload, communications, surface mobility, energy, and scientific objectives.',mission:'rover'}],
    ]);
    stations.forEach(({x,y}) => {
      const item = missions.get(x+','+y) || lessons.shift();
      this.interactables.push({
        x,y:y+69,radius:92,label:'[E] '+item.title,
        interact:()=>this.openTerminal(item)
      });
    });

    this.player = new Player(this, 640, 720);
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

    this.createTerminalDialog();
    this.input.keyboard.addCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E', 'ESC']);
    this.events.on('shutdown', () => {
      this.prompt?.classList.remove('visible');
      this.terminalDialog?.remove();
      this.mapManager?.destroy();
    });
    this.updateZoneDisplay(true);
    this.drawMinimap();
  }

  update(time, delta) {
    if (this.inputsBlocked()) return;
    this.player.update(time, delta);
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.E)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.player.keys.ESC)) this.pauseExploration();
    this.updateZoneDisplay(false);
    this.findInteractionTarget();
    this.minimapClock = (this.minimapClock ?? 0) + delta;
    if (this.minimapClock > 130) { this.minimapClock = 0; this.drawMinimap(); }
  }

  inputsBlocked() {
    return this.gameContainer.inert || this.terminalOpen;
  }

  stopMovement() {
    this.player.body.stop();
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
      this.prompt.textContent = nearest.label;
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
      this.showNotice('APPROACH A CONSOLE AND PRESS E');
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
    dialog.innerHTML = `<div class="mission-terminal__panel" role="dialog" aria-modal="true" aria-label="Mission console">
      <div class="mission-terminal__top"><span>◈ MISSION CONTROL // TERMINAL</span><button type="button" data-close aria-label="Close terminal">✕</button></div>
      <h2 data-title></h2><p data-description></p>
      <div class="mission-terminal__actions"><a data-source target="_blank" rel="noopener noreferrer">NASA SOURCE ↗</a><a data-launch hidden>START MISSION ▶</a><button type="button" data-close>CLOSE</button></div>
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
    dialog.querySelector('[data-title]').textContent=item.title;
    dialog.querySelector('[data-description]').textContent=item.text;
    const link=dialog.querySelector('[data-source]');
    link.hidden=!item.source;
    if(item.source)link.href=item.source;
    const launchLink = dialog.querySelector('[data-launch]');
    const missionUrl = { launch: '/games/launch/', rover: '/games/rover/' }[item.mission];
    launchLink.hidden = !missionUrl;
    if (missionUrl) launchLink.href = missionUrl;
    else launchLink.removeAttribute('href');
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
