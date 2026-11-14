import Phaser from 'phaser';
import { GAME, ZONES, CORRIDORS } from '../config.js';
import { CollisionManager } from './CollisionManager.js';
import { Door } from '../objects/Door.js';
import { MediaScreen } from '../objects/MediaScreen.js';
import { AnimatedMachine } from '../objects/AnimatedMachine.js';

export class MapManager {
  constructor(scene) {
    this.scene = scene;
    this.collision = new CollisionManager(scene);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(3);
    this.structureGraphics = [];
    this.layers = { ground: null, structures: this.structureGraphics, furniture: [], collision: this.collision.solids, decorations: [this.graphics], lighting: [], effects: [] };
    this.doors = [];
    this.machines = [];
    this.sprites = [];
  }

  build() {
    this.createTilemap();
    this.collision.addPerimeter(GAME.worldWidth, GAME.worldHeight);
    this.segmentHorizontal(128, 1152, 128);
    this.segmentHorizontal(128, 1152, 832);
    this.segmentVertical(128, 128, 832);
    this.segmentVertical(1152, 128, 832);
    this.buildControlCenter();
    this.drawCeilingLights();
    this.scene.physics.world.setBounds(0, 0, GAME.worldWidth, GAME.worldHeight);
    this.scene.solidColliders = this.collision.solids;
  }

  createTilemap() {
    const { columns, rows, tileSize } = GAME;
    const data = Array.from({ length: rows }, () => Array(columns).fill(1));
    const paint = (rect, tile) => {
      const startX = Math.floor(rect.x / tileSize); const startY = Math.floor(rect.y / tileSize);
      const endX = Math.ceil((rect.x + rect.width) / tileSize); const endY = Math.ceil((rect.y + rect.height) / tileSize);
      for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) {
        if (data[y]?.[x] !== undefined) data[y][x] = tile;
      }
    };
    ZONES.forEach((zone) => paint(zone, zone.floor));
    CORRIDORS.forEach((corridor) => paint(corridor, corridor.floor));

    const map = this.scene.make.tilemap({ data, tileWidth: tileSize, tileHeight: tileSize });
    const tileset = map.addTilesetImage('facility-floor', 'space-floor-atlas', tileSize, tileSize, 0, 0);
    const ground = map.createLayer(0, tileset, 0, 0);
    ground.setDepth(-100).setRenderOrder(Phaser.Tilemaps.RENDER_ORDER_RIGHT_DOWN);
    ground.setCullPadding(3, 3);
    this.layers.ground = ground;
    this.tilemap = map;
    this.ground = ground;
  }

  segmentHorizontal(startX, endX, y, gaps = []) {
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    let cursor = startX;
    for (const [gapStart, gapEnd] of sorted) {
      if (gapStart > cursor) this.wallHorizontalPiece(cursor, Math.min(gapStart, endX), y);
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < endX) this.wallHorizontalPiece(cursor, endX, y);
  }

  wallHorizontalPiece(startX, endX, y) {
    const width = endX - startX;
    if (width <= 4) return;
    const g = this.createStructureGraphic(y + 18);
    g.fillStyle(0x09141d).fillRect(startX, y - 15, width, 34);
    g.fillStyle(0x34444d).fillRect(startX, y - 14, width, 26);
    g.fillStyle(0x708186).fillRect(startX, y - 14, width, 4);
    g.fillStyle(0x1a2932).fillRect(startX, y + 8, width, 6);
    g.fillStyle(0xa4aca2).fillRect(startX, y - 14, width, 1);
    for (let x = startX + 10; x < endX - 3; x += 32) {
      g.fillStyle(0x26343c).fillRect(x, y - 10, 2, 15);
      g.fillStyle(0x91a09c).fillRect(x + 4, y - 11, 2, 2);
      g.fillStyle(0x19252c).fillRect(x + 4, y + 3, 2, 2);
      if ((x / 32) % 4 === 0) {
        g.fillStyle(0xe2944e).fillRect(x + 9, y - 8, 5, 2);
        g.fillStyle(0x59d6d2).fillRect(x + 17, y - 8, 2, 2);
      }
    }
    this.collision.addRect((startX + endX) / 2, y, width, 26, 'bulkhead');
  }

  segmentVertical(x, startY, endY, gaps = []) {
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    let cursor = startY;
    for (const [gapStart, gapEnd] of sorted) {
      if (gapStart > cursor) this.wallVerticalPiece(x, cursor, Math.min(gapStart, endY));
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < endY) this.wallVerticalPiece(x, cursor, endY);
  }

  wallVerticalPiece(x, startY, endY) {
    const height = endY - startY;
    if (height <= 4) return;
    const g = this.createStructureGraphic((startY + endY) / 2 + 13);
    g.fillStyle(0x09141d).fillRect(x - 15, startY, 34, height);
    g.fillStyle(0x34444d).fillRect(x - 14, startY, 26, height);
    g.fillStyle(0x708186).fillRect(x - 14, startY, 4, height);
    g.fillStyle(0x1a2932).fillRect(x + 8, startY, 6, height);
    g.fillStyle(0xa4aca2).fillRect(x - 14, startY, 1, height);
    for (let y = startY + 10; y < endY - 3; y += 32) {
      g.fillStyle(0x26343c).fillRect(x - 10, y, 15, 2);
      g.fillStyle(0x91a09c).fillRect(x - 11, y + 4, 2, 2);
      if ((y / 32) % 4 === 0) g.fillStyle(0xff9a50).fillRect(x - 7, y + 8, 3, 4);
    }
    this.collision.addRect(x, (startY + endY) / 2, 26, height, 'bulkhead');
  }

  drawBuildingWalls() {
    // Launch Control Center — muros con accesos al vestíbulo este y al conducto sur.
    this.segmentHorizontal(128, 1152, 128);
    this.segmentHorizontal(128, 1152, 832, [[592, 688]]);
    this.segmentVertical(128, 128, 832);
    this.segmentVertical(1152, 128, 832, [[400, 496]]);
    // Ingeniería — vestíbulo compartido al oeste y salida hacia plataforma al sur.
    this.segmentHorizontal(1408, 2432, 128);
    this.segmentHorizontal(1408, 2432, 832, [[1856, 1952]]);
    this.segmentVertical(1408, 128, 832, [[400, 496]]);
    this.segmentVertical(2432, 128, 832);
    // Recursos — acceso norte y galería de salida al este.
    this.segmentHorizontal(128, 1152, 960, [[592, 688]]);
    this.segmentHorizontal(128, 1152, 1664);
    this.segmentVertical(128, 960, 1664);
    this.segmentVertical(1152, 960, 1664, [[1184, 1280]]);
    // Perímetro del exterior: valla de seguridad con dos accesos.
    this.fenceHorizontal(1408, 2432, 896, [[1856, 1952]]);
    this.fenceHorizontal(1408, 2432, 1664);
    this.fenceVertical(1408, 896, 1664, [[1184, 1280]]);
    this.fenceVertical(2432, 896, 1664);
  }

  fenceHorizontal(startX, endX, y, gaps = []) {
    const pieces = this.subtractGaps(startX, endX, gaps);
    for (const [left, right] of pieces) {
      const g = this.createStructureGraphic(y + 5);
      g.lineStyle(3, 0x586664, .92).lineBetween(left, y, right, y);
      this.collision.addRect((left + right) / 2, y, right - left, 8, 'perimeter fence');
      for (let x = left + 8; x < right; x += 48) {
        g.fillStyle(0x202d30).fillRect(x - 3, y - 8, 7, 16);
        g.fillStyle(0x849086).fillRect(x - 1, y - 7, 2, 12);
        g.fillStyle(0xe39552).fillRect(x - 3, y - 9, 6, 2);
      }
    }
  }

  fenceVertical(x, startY, endY, gaps = []) {
    const pieces = this.subtractGaps(startY, endY, gaps);
    for (const [top, bottom] of pieces) {
      const g = this.createStructureGraphic((top + bottom) / 2 + 5);
      g.lineStyle(3, 0x586664, .92).lineBetween(x, top, x, bottom);
      this.collision.addRect(x, (top + bottom) / 2, 8, bottom - top, 'perimeter fence');
      for (let y = top + 8; y < bottom; y += 48) {
        g.fillStyle(0x202d30).fillRect(x - 8, y - 3, 16, 7);
        g.fillStyle(0x849086).fillRect(x - 7, y - 1, 12, 2);
        g.fillStyle(0xe39552).fillRect(x + 6, y - 3, 2, 6);
      }
    }
  }

  createStructureGraphic(depth) {
    const graphics = this.scene.add.graphics().setDepth(depth);
    this.structureGraphics.push(graphics);
    return graphics;
  }

  subtractGaps(start, end, gaps) {
    const result = []; let cursor = start;
    for (const [left, right] of [...gaps].sort((a, b) => a[0] - b[0])) {
      if (left > cursor) result.push([cursor, left]);
      cursor = Math.max(cursor, right);
    }
    if (cursor < end) result.push([cursor, end]);
    return result;
  }

  drawLaunchPad() {
    const g = this.graphics;
    // Foso pavimentado, rejillas, marcas y líneas de seguridad a ras de suelo.
    g.fillStyle(0x303a3d).fillRect(1504, 944, 896, 688);
    g.fillStyle(0x566164).fillRect(1512, 952, 880, 3);
    g.fillStyle(0x1b282c).fillRect(1512, 1624, 880, 5);
    for (let y = 970; y < 1620; y += 32) {
      g.fillStyle(y % 64 ? 0x343e40 : 0x3b4444).fillRect(1518, y, 867, 1);
      g.fillStyle(0x2b3639).fillRect(1543, y + 3, 1, 25);
      g.fillStyle(0x4a5352).fillRect(2361, y + 3, 1, 25);
    }
    for (let y = 978; y < 1588; y += 54) {
      this.drawHazardStripe(1536, y, 18, 26);
      this.drawHazardStripe(2350, y, 18, 26);
    }
    g.fillStyle(0x727b77).fillRect(1664, 934, 425, 3);
    g.fillStyle(0xdaa167).fillRect(1664, 938, 425, 4);
    // Drenajes y anclajes de servicio que dan escala industrial a la zona.
    for (let y = 1024; y < 1580; y += 80) {
      g.fillStyle(0x1a2529).fillRect(1640, y, 52, 7);
      g.fillStyle(0x697471).fillRect(1643, y + 1, 47, 2);
      for (let x = 1646; x < 1690; x += 9) g.fillStyle(0x222d30).fillRect(x, y + 4, 3, 2);
    }
    // Acceso peatonal pintado a lo largo de la pasarela sureste.
    g.fillStyle(0xd79d62).fillRect(1379, 1183, 25, 3);
    g.fillStyle(0xd79d62).fillRect(1379, 1340, 25, 3);
  }

  drawHazardStripe(x, y, width, height) {
    const g = this.graphics;
    g.fillStyle(0x221f1c).fillRect(x, y, width, height);
    for (let offset = -height; offset < width; offset += 10) {
      g.fillStyle(0xd28a4a);
      const startX = Math.max(0, offset); const stripeWidth = Math.min(4, width - startX);
      if (stripeWidth > 0) g.fillRect(x + startX, y + Math.max(0, -offset), stripeWidth, Math.min(height, height + Math.min(0, offset)));
    }
  }

  drawOutdoorDetails() {
    const g = this.graphics;
    // Reflectores de plataforma.
    [[1458, 970], [2380, 970], [1458, 1602], [2380, 1602], [2128, 914], [2180, 1635]].forEach(([x, y]) => {
      const lamp = this.scene.add.image(x, y, 'searchlight').setDepth(y + 7).setScale(1.1);
      this.scene.tweens.add({ targets: lamp, alpha: .45, duration: 740, yoyo: true, repeat: -1, delay: Math.random() * 600 });
      this.addLightHalo(x, y);
    });
    // Vehículo de servicio y contenedores en el borde de la zona.
    this.place('service-vehicle', 2225, 1510, { width: 88, height: 54, solid: true, label: 'vehículo de mantenimiento' });
    this.place('generator', 2240, 1040, { width: 80, height: 42, solid: true, label: 'unidad de apoyo exterior' });
    this.place('fuel-tank', 2266, 1145, { width: 40, height: 54, solid: true, label: 'tanque exterior' });
    this.place('oxygen-bank', 2318, 1148, { width: 38, height: 52, solid: true, label: 'banco de gas exterior' });
    this.place('service-tower', 2085, 1266, { width: 94, height: 418, solid: true, colliderWidth: 82, colliderHeight: 390, label: 'torre de servicio', depth: 1490 });
    this.place('launch-rocket', 1872, 1266, { width: 146, height: 470, solid: true, colliderWidth: 138, colliderHeight: 434, label: 'cohete en plataforma', depth: 1515 });
    // Rutas de abastecimiento exteriores, vistas como cañerías protegidas a ras del suelo.
    g.lineStyle(9, 0x172a30).lineBetween(2156, 1066, 2156, 1116).lineBetween(2156, 1116, 1980, 1116);
    g.lineStyle(4, 0x72827c).lineBetween(2156, 1066, 2156, 1116).lineBetween(2156, 1116, 1980, 1116);
    g.lineStyle(2, 0xe09a59).lineBetween(2154, 1090, 2154, 1115);
    for (let x = 1990; x < 2150; x += 32) { g.fillStyle(0x283940).fillRect(x, 1108, 4, 17); g.fillStyle(0x7e8a80).fillRect(x, 1110, 2, 11); }
    // Zonas verdes naturales en el borde, sin cerrar la ruta de acceso.
    [[1480, 1110], [1482, 1422], [1553, 1573], [2320, 1406], [2290, 1002], [1538, 1518], [2262, 1590], [2348, 1213]].forEach(([x, y], index) => this.drawShrub(x, y, index));
    // Camino de aproximación y balizas de seguridad.
    for (let y = 1150; y < 1330; y += 28) {
      g.fillStyle(0xc49764).fillRect(1379, y, 12, 3);
      g.fillStyle(0x1d2b2e).fillRect(1393, y, 6, 3);
    }
    this.addLabel('ZONA RESTRINGIDA', 2245, 1600, '#ffd093', 8);
    this.addLabel('COMBUSTIBLE / O2', 2267, 1120, '#bbd4cd', 7);
    this.addLabel('PAD · 04', 1694, 988, '#c4dcda', 11);
    this.addLabel('VEHÍCULO · 03', 2226, 1545, '#a2b6b6', 7);
  }

  drawShrub(x, y, variant = 0) {
    const g = this.graphics;
    g.fillStyle(0x101b1c, .72).fillRect(x - 21, y + 9, 44, 9);
    const colors = [0x30443b, 0x425b47, 0x52644a, 0x213b3a];
    g.fillStyle(colors[variant % colors.length]).fillRect(x - 13, y - 7, 26, 21);
    g.fillStyle(0x52705a).fillRect(x - 8, y - 14, 14, 8);
    g.fillStyle(0x73806a).fillRect(x - 4, y - 15, 4, 3);
    g.fillStyle(0x1b302e).fillRect(x + 7, y + 4, 12, 8);
    g.fillStyle(0x61705b).fillRect(x - 18, y + 1, 7, 7);
    g.fillStyle(0x1b2626).fillRect(x - 2, y + 12, 3, 5);
  }

  buildControlCenter() {
    const scene = this.scene;
    this.addRoomPlaque('LAUNCH CONTROL CENTER', 'MISSION OPERATIONS // LCC · 01', 640, 318, 0x67dfe2);
    this.addWallScreen();
    this.place('server-rack', 212, 236, { width: 40, height: 82, solid: true, label: 'servidor de comunicaciones' });
    this.place('server-rack', 1064, 236, { width: 40, height: 82, solid: true, label: 'servidor de comunicaciones' });
    this.place('server-rack', 204, 729, { width: 40, height: 82, solid: true, label: 'servidor activo' });
    this.place('server-rack', 1072, 729, { width: 40, height: 82, solid: true, label: 'matriz de telemetría' });
    this.place('fan-unit', 1010, 255, { width: 36, height: 36, solid: false, type: 'fan', label: 'ventilador' });
    for (const y of [402, 593]) {
      for (const x of [330, 494, 658, 822, 986]) {
        this.place('console-desk', x, y, { width: 96, height: 61, solid: true, colliderWidth: 90, colliderHeight: 42, label: 'estación de control' });
      }
    }
    // Tiras de luz empotradas y anillos de tránsito bajo las consolas.
    const g = this.graphics;
    g.fillStyle(0x50777d, .8).fillRect(256, 486, 760, 2);
    g.fillStyle(0x254652, .7).fillRect(256, 691, 760, 2);
    for (let x = 280; x < 1000; x += 72) {
      g.fillStyle(0x73ddd9, .78).fillRect(x, 479, 9, 2);
      g.fillStyle(0xe08e51, .8).fillRect(x + 28, 684, 5, 3);
    }
    this.addLabel('MISSION DESIGN / LAUNCH', 358, 343, '#7cd7db', 7);
    this.addLabel('LUNAR ROVER / SYSTEMS', 734, 343, '#7cd7db', 7);
    this.addLabel('ENGINEERING / SCIENCE', 512, 536, '#7cd7db', 7);
    this.machines.push(new AnimatedMachine(scene, { x: 1074, y: 682, texture: 'server-rack', type: 'server', scale: .82 }));
  }

  addWallScreen() {
    const screen = new MediaScreen(this.scene, { x: 640, y: 190 });
    this.scene.mediaScreen = screen;
    this.collision.addRect(640, 198, 348, 24, 'integrated launch-control display');
  }

  buildEngineering() {
    this.addRoomPlaque('CONSTRUCTION & ENGINEERING', 'ENGINEERING BAY // ENG · 02', 1920, 257, 0xffaa61);
    this.place('engineering-bench', 1582, 380, { width: 126, height: 62, solid: true, colliderWidth: 124, colliderHeight: 48, label: 'mesa de trabajo' });
    this.place('engineering-bench', 2228, 380, { width: 126, height: 62, solid: true, colliderWidth: 124, colliderHeight: 48, label: 'mesa de ingeniería' });
    this.place('engineering-bench', 1580, 685, { width: 128, height: 64, solid: true, colliderWidth: 124, colliderHeight: 48, label: 'mesa de herramientas' });
    this.place('console-desk', 2230, 685, { width: 92, height: 58, solid: true, colliderWidth: 90, colliderHeight: 38, label: 'terminal de diseño' });
    this.place('rocket-engine', 1922, 506, { width: 96, height: 102, solid: true, colliderWidth: 90, colliderHeight: 78, label: 'motor de cohete desmontado' });
    const robot = new AnimatedMachine(this.scene, { x: 1730, y: 515, texture: 'robot-arm', type: 'robot-arm', scale: .86 });
    this.machines.push(robot);
    this.collision.addRect(1730, 534, 80, 42, 'robotic arm base');
    this.place('fan-unit', 2330, 268, { width: 44, height: 44, solid: true, type: 'fan', label: 'extractor de aire' });
    this.place('server-rack', 1466, 728, { width: 36, height: 76, solid: true, label: 'banco de diagnóstico' });
    this.place('supply-shelf', 2042, 730, { width: 80, height: 60, solid: true, colliderWidth: 76, colliderHeight: 44, label: 'repuestos de motor' });
    this.place('generator', 2212, 512, { width: 78, height: 58, solid: true, label: 'equipo de soldadura' });
    for (let x = 1502; x < 2355; x += 32) {
      this.graphics.fillStyle(0x496067, .65).fillRect(x, 302, 15, 2);
      if (x % 3 === 0) this.graphics.fillStyle(0xff9c52, .85).fillRect(x + 17, 299, 3, 7);
    }
    this.addLabel('ENSAMBLE / MOTORES', 1920, 320, '#e7b273', 7);
    this.addLabel('BANCO DE PRUEBAS', 1920, 644, '#a7c3c2', 7);
    // Chispas sutiles de un puesto de soldadura.
    const spark = this.scene.add.image(2213, 500, 'warning-light').setScale(.7).setDepth(527).setAlpha(.12);
    this.scene.tweens.add({ targets: spark, alpha: { from: .12, to: .9 }, duration: 130, yoyo: true, repeat: -1, repeatDelay: 2400 });
    const steam = new AnimatedMachine(this.scene, { x: 1530, y: 575, texture: 'server-rack', type: 'steam', scale: .58 });
    this.machines.push(steam);
  }

  buildResources() {
    this.addRoomPlaque('RESOURCE MANAGEMENT', 'SUPPLY DEPOT // RES · 03', 640, 1088, 0x78d4d8);
    this.addSectorTag('01 // PROPULSIÓN', 314, 1158, '#ffa366');
    this.addSectorTag('02 // SOPORTE VITAL', 848, 1158, '#7fe4de');
    this.addSectorTag('03 // RESERVA Y ENERGÍA', 560, 1498, '#c2d4c9');
    // Sectores identificados por señalética y colores, solo decorativos.
    this.place('fuel-tank', 240, 1267, { width: 48, height: 78, solid: true, colliderWidth: 43, colliderHeight: 70, label: 'tanque de combustible' });
    this.place('fuel-tank', 309, 1267, { width: 48, height: 78, solid: true, colliderWidth: 43, colliderHeight: 70, label: 'tanque de combustible' });
    this.place('oxygen-bank', 856, 1264, { width: 45, height: 74, solid: true, colliderWidth: 41, colliderHeight: 67, label: 'cilindros de oxígeno' });
    this.place('water-cistern', 996, 1264, { width: 58, height: 76, solid: true, colliderWidth: 52, colliderHeight: 66, label: 'reserva de agua' });
    this.place('supply-shelf', 402, 1236, { width: 79, height: 62, solid: true, colliderWidth: 74, colliderHeight: 48, label: 'estantería de suministros' });
    this.place('supply-shelf', 545, 1236, { width: 79, height: 62, solid: true, colliderWidth: 74, colliderHeight: 48, label: 'estantería de suministros' });
    this.place('supply-shelf', 710, 1236, { width: 79, height: 62, solid: true, colliderWidth: 74, colliderHeight: 48, label: 'almacenamiento de equipos' });
    this.place('supply-shelf', 400, 1517, { width: 80, height: 60, solid: true, colliderWidth: 74, colliderHeight: 48, label: 'cajas de suministros' });
    this.place('battery-bank', 702, 1513, { width: 54, height: 50, solid: true, colliderWidth: 48, colliderHeight: 44, type: 'server', label: 'banco de baterías' });
    this.place('generator', 826, 1513, { width: 74, height: 54, solid: true, label: 'generador' });
    this.place('crate', 948, 1474, { width: 42, height: 39, solid: true, label: 'caja de suministros' });
    this.place('crate', 1000, 1471, { width: 42, height: 39, solid: true, label: 'caja de suministros' });
    this.place('crate', 969, 1515, { width: 42, height: 39, solid: true, label: 'repuestos' });
    this.place('vent-fan', 1068, 1046, { width: 42, height: 42, solid: true, type: 'fan', label: 'ventilación de depósito' });
    this.place('vent-fan', 211, 1588, { width: 40, height: 40, solid: true, type: 'fan', label: 'ventilación de almacén' });
    for (let x = 214; x < 1098; x += 128) {
      this.graphics.fillStyle(0x4b7777, .55).fillRect(x, 1598, 44, 2);
      this.graphics.fillStyle(0x263c42, .5).fillRect(x + 5, 1603, 34, 1);
    }
    const light = new AnimatedMachine(this.scene, { x: 328, y: 1388, texture: 'warning-light', type: 'status', scale: 1.1 });
    this.machines.push(light);
    const light2 = new AnimatedMachine(this.scene, { x: 908, y: 1388, texture: 'warning-light', type: 'status', scale: 1.1 });
    this.machines.push(light2);
  }

  buildDoors() {
    const doors = [
      { x: 1152, y: 448, orientation: 'vertical', label: 'VESTÍBULO PRINCIPAL' },
      { x: 1408, y: 448, orientation: 'vertical', label: 'ACCESO A INGENIERÍA' },
      { x: 640, y: 832, orientation: 'horizontal', label: 'PASILLO DE SUMINISTROS' },
      { x: 640, y: 960, orientation: 'horizontal', label: 'ENTRADA A RECURSOS' },
      { x: 1152, y: 1232, orientation: 'vertical', label: 'PASILLO EXTERIOR' },
      { x: 1408, y: 1232, orientation: 'vertical', label: 'SALIDA A LA PLATAFORMA' },
      { x: 1904, y: 832, orientation: 'horizontal', label: 'SALIDA EXTERIOR' },
    ];
    for (const config of doors) this.doors.push(new Door(this.scene, this.collision, { ...config, open: true }));
  }

  drawCeilingLights() {
    const positions = [[320,190],[490,190],[790,190],[960,190],[320,790],[960,790]];
    for (const [x, y] of positions) {
      this.graphics.fillStyle(0x223e47, .6).fillRect(x - 13, y - 2, 26, 5);
      const lamp = this.scene.add.rectangle(x, y, 10, 3, 0x64d5d1).setDepth(y + 5).setAlpha(.66);
      this.layers.lighting.push(lamp);
      this.scene.tweens.add({ targets: lamp, alpha: .24, duration: 850 + (x % 5) * 110, yoyo: true, repeat: -1, delay: x % 7 * 140 });
    }
  }

  addRoomPlaque(title, subtitle, x, y, accent) {
    const g = this.graphics;
    g.fillStyle(0x0b1921, .9).fillRect(x - 212, y - 31, 424, 51);
    g.fillStyle(accent, .9).fillRect(x - 212, y - 31, 4, 51);
    g.fillStyle(0x30454d, .9).fillRect(x - 208, y + 18, 408, 1);
    this.addLabel(title, x, y - 14, '#e1ece4', 11, 'center');
    this.addLabel(subtitle, x, y + 5, `#${accent.toString(16).padStart(6, '0')}`, 7, 'center');
    for (let bolt = 0; bolt < 4; bolt += 1) {
      g.fillStyle(0x84908a).fillRect(x - 202 + bolt * 132, y - 25, 3, 3);
      g.fillStyle(0x84908a).fillRect(x - 202 + bolt * 132, y + 13, 3, 3);
    }
  }

  addSectorTag(text, x, y, color) {
    this.graphics.fillStyle(0x111e24, .9).fillRect(x - 95, y - 9, 190, 18);
    this.graphics.fillStyle(0x8f9a8e).fillRect(x - 95, y - 9, 2, 18);
    this.addLabel(text, x, y - 6, color, 7, 'center');
  }

  addLabel(text, x, y, color = '#adc4c3', size = 8, align = 'center') {
    const label = this.scene.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: `${size}px`, color, align,
      stroke: '#08131a', strokeThickness: 2, letterSpacing: 1,
    }).setOrigin(.5, .5).setDepth(y + 2).setResolution(2);
    this.layers.decorations.push(label);
    return label;
  }

  addLightHalo(x, y) {
    const halo = this.scene.add.rectangle(x, y + 13, 18, 22, 0x6ccdc5, .07).setDepth(y + 3);
    this.scene.tweens.add({ targets: halo, alpha: { from: .03, to: .13 }, duration: 720, yoyo: true, repeat: -1, delay: Math.random() * 500 });
  }

  place(texture, x, y, { width = null, height = null, solid = false, colliderWidth = width, colliderHeight = height, type = 'static', label = texture, depth = null, angle = 0 } = {}) {
    const image = this.scene.add.image(x, y, texture);
    if (width || height) image.setDisplaySize(width ?? image.width, height ?? image.height);
    image.setAngle(angle).setDepth(depth ?? y + Math.min(32, (height ?? image.height) * .48));
    this.sprites.push(image);
    this.layers.furniture.push(image);
    if (solid) this.collision.addRect(x, y + 7, colliderWidth ?? image.displayWidth * .72, colliderHeight ?? image.displayHeight * .55, label);
    if (type === 'fan' || type === 'server' || type === 'status' || type === 'steam') {
      this.machines.push(new AnimatedMachine(this.scene, { x, y, texture, type, scale: 1, sprite: image, depth }));
      return image;
    }
    return image;
  }

  destroy() {
    this.tilemap?.destroy();
    this.graphics?.destroy();
    this.structureGraphics.forEach((graphics) => graphics.destroy());
    this.machines.forEach((machine) => machine.destroy());
  }
}
