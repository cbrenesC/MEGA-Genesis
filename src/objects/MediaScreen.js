import { GAME } from '../config.js';

export class MediaScreen {
  constructor(scene, { x, y, config = GAME.media }) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.config = config;
    this.imageKey = null;
    this.videoObject = null;
    this.currentUrl = '';
    this.createDisplay();
    this.bindControls();
    scene.interactables.push({
      type: 'media', x, y, radius: 152,
      label: 'E · CONTROLAR PANTALLA',
      interact: () => this.togglePanel(),
    });
    if (config?.src) this.loadSource(config.src, config.type ?? this.guessType(config.src));
  }

  createDisplay() {
    const scene = this.scene;
    this.frame = scene.add.rectangle(this.x, this.y, 362, 153, 0x111c23).setStrokeStyle(5, 0x586d73);
    this.frame.setDepth(this.y + 10);
    scene.add.rectangle(this.x, this.y, 348, 139, 0x37464a).setDepth(this.y + 11);
    scene.add.rectangle(this.x, this.y, 340, 131, 0x172833).setDepth(this.y + 12);
    this.display = scene.add.image(this.x, this.y, 'control-display').setDisplaySize(326, 117);
    this.display.setDepth(this.y + 13);
    for (let ix = -150; ix <= 150; ix += 30) {
      const bolt = scene.add.rectangle(this.x + ix, this.y - 69, 3, 3, 0x9bab9e).setDepth(this.y + 14);
      scene.add.rectangle(bolt.x, this.y + 69, 3, 3, 0x9bab9e).setDepth(this.y + 14);
    }
    this.scanline = scene.add.rectangle(this.x, this.y - 53, 314, 1, 0x78f0e0, .26).setDepth(this.y + 16);
    scene.tweens.add({ targets: this.scanline, y: this.y + 51, duration: 3000, repeat: -1, ease: 'Linear' });
  }

  bindControls() {
    const panel = document.getElementById('media-panel');
    document.getElementById('media-play')?.addEventListener('click', () => this.play());
    document.getElementById('media-pause')?.addEventListener('click', () => this.pause());
    document.getElementById('media-change')?.addEventListener('click', () => document.getElementById('media-file')?.click());
    document.getElementById('media-close')?.addEventListener('click', () => panel?.classList.add('is-hidden'));
    document.getElementById('media-file')?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.type.startsWith('image/')) this.loadImage(URL.createObjectURL(file), file.name);
      else if (file.type.startsWith('video/')) this.loadVideo(URL.createObjectURL(file), file.name);
      else this.scene.showNotice('FORMATO NO COMPATIBLE · USA PNG, JPG, WEBP, MP4 O WEBM');
      event.target.value = '';
    });
  }

  togglePanel() {
    const panel = document.getElementById('media-panel');
    if (!panel) return;
    panel.classList.toggle('is-hidden');
    if (!panel.classList.contains('is-hidden')) {
      document.getElementById('media-play')?.focus({ preventScroll: true });
      this.scene.showNotice('CONTROLES DE PANTALLA MULTIMEDIA');
    }
  }

  guessType(src) { return /\.(mp4|webm)(?:[?#].*)?$/i.test(src) ? 'video' : 'image'; }

  loadSource(src, type = this.guessType(src)) {
    this.pause();
    this.currentUrl = src;
    if (type === 'video') this.loadVideo(src, src.split('/').pop() || 'Video');
    else this.loadImage(src, src.split('/').pop() || 'Imagen');
  }

  loadImage(src, name = 'Imagen') {
    const image = new Image();
    image.onload = () => {
      const key = `media-image-${Date.now()}`;
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      this.scene.textures.addImage(key, image);
      this.videoObject?.destroy();
      this.videoObject = null;
      this.display.setVisible(true).setTexture(key).setDisplaySize(326, 117);
      this.imageKey = key;
      this.currentUrl = src;
      this.scene.showNotice(`MEDIO CARGADO · ${name.slice(0, 32)}`);
    };
    image.onerror = () => this.scene.showNotice('NO SE PUDO CARGAR ESA IMAGEN');
    image.src = src;
  }

  loadVideo(src, name = 'Video') {
    this.videoObject?.destroy();
    this.videoObject = this.scene.add.video(this.x, this.y);
    this.videoObject.setDisplaySize(326, 117).setDepth(this.y + 15).setMute(true);
    this.display.setVisible(false);
    this.currentUrl = src;
    this.videoObject.loadURL(src, 'loadeddata', false);
    this.videoObject.once('error', () => this.scene.showNotice('VIDEO NO COMPATIBLE · PRUEBA MP4 O WEBM'));
    this.videoObject.once('created', () => {
      if (this.videoObject?.video) {
        this.videoObject.video.loop = true;
        this.videoObject.video.muted = true;
        this.videoObject.video.playsInline = true;
      }
    });
    this.scene.showNotice(`VIDEO LISTO · ${name.slice(0, 32)} · INICIA CON ▶`);
  }

  async play() {
    if (!this.videoObject && this.currentUrl && this.guessType(this.currentUrl) === 'video') this.loadVideo(this.currentUrl);
    if (this.videoObject) {
      try { await this.videoObject.play(false); this.scene.showNotice('SIMULACIÓN MULTIMEDIA EN REPRODUCCIÓN'); }
      catch { this.scene.showNotice('PULSA INICIAR OTRA VEZ PARA PERMITIR LA REPRODUCCIÓN'); }
    } else {
      this.display.setVisible(true);
      this.scene.tweens.add({ targets: this.display, alpha: { from: .7, to: 1 }, duration: 240, yoyo: true, repeat: 1 });
      this.scene.showNotice('PANTALLA DE CONTROL ACTIVA');
    }
  }

  pause() {
    if (this.videoObject?.video) this.videoObject.video.pause();
    this.scene?.showNotice?.('REPRODUCCIÓN EN PAUSA');
  }
}
