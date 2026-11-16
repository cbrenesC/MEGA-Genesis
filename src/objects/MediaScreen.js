import { GAME } from '../config.js';
import { onLanguageChange, t } from '../i18n/index.js';
import { drawOrbitBoard } from '../map/displayArt.js';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

export class MediaScreen {
  constructor(scene, { x, y, width, height, accessX, accessY, config = GAME.media }) {
    this.scene = scene;
    this.board = document.getElementById('media-panel');
    this.input = document.getElementById('media-message');
    this.form = document.getElementById('media-text-form');
    this.status = document.getElementById('media-status');
    this.file = document.getElementById('media-file');
    this.mode = 'orbit';
    this.announcement = '';
    this.createDisplay(x, y, width, height);
    this.bindControls();
    // The wall display is presentation-only for players.
    // Team-managed media can still be configured through GAME.media.
    const stopLanguage = onLanguageChange(() => {
      if (this.mode === 'orbit' || this.mode === 'text') this.render();
      if (this.statusKey) this.setStatus(this.statusKey, this.statusParams);
    });
    scene.events.once('shutdown', () => {
      stopLanguage();
      this.controls.abort();
      this.releaseSource();
      if (this.board.open) this.board.close();
      if (scene.textures.exists('lcc-display-content')) scene.textures.remove('lcc-display-content');
    });
    if (config?.src) {
      const fallbackType = /\.(mp4|webm)(?:[?#].*)?$/i.test(config.src) ? 'video' : 'image';
      this.loadSource(config.src, config.type || fallbackType);
    }
    if (!config?.src && config?.announcementKey) {
      this.announcementKey = config.announcementKey;
      this.mode = 'text';
      this.render();
    }
  }

  createDisplay(x, y, width, height) {
    const g = this.scene.add.graphics().setDepth(y + 10);
    const left = x - width / 2, top = y - height / 2;
    const bands = [
      [14, 13, 0x172132], [10, 9, 0x7f98ad], [7, 6, 0x374b64], [3, 3, 0x132237],
    ];
    for (const [hx, hy, color] of bands) g.fillStyle(color).fillRect(left - hx, top - hy, width + hx * 2, height + hy * 2);
    g.fillStyle(0xabc1ce).fillRect(left - 8, top - 8, width + 16, 2);
    g.fillStyle(0x30516b).fillRect(left - 5, top + height + 4, width + 10, 3);
    for (const xx of [left - 10, left + width + 6]) {
      g.fillStyle(0xb3c5d0).fillRect(xx, top + 16, 4, 4);
      g.fillRect(xx, top + height - 19, 4, 4);
    }

    const w = width / 2, h = height / 2;
    this.orbit = document.createElement('canvas');
    this.orbit.width = w;
    this.orbit.height = h;
    drawOrbitBoard(this.orbit.getContext('2d'));
    this.texture = this.scene.textures.createCanvas('lcc-display-content', w, h);
    this.scene.add.image(x, y, 'lcc-display-content').setDisplaySize(width, height).setDepth(y + 11);
    this.render();
  }

  isOpen() { return this.board.open; }

  bindControls() {
    this.controls = new AbortController();
    this.playButton = document.getElementById('media-play');
    this.pauseButton = document.getElementById('media-pause');
    this.syncPlaybackControls();
    const opt = { signal: this.controls.signal };
    const link = (id, action) => document.getElementById(id).addEventListener('click', action, opt);
    link('media-play', () => this.play());
    link('media-pause', () => this.pause());
    link('media-change', () => this.file.click());
    link('media-reset', () => {
      this.releaseSource();
      this.mode = 'orbit';
      this.render();
      this.setStatus('media.orbitRestored');
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = this.input.value.trim();
      if (!message) {
        this.setStatus('media.messageRequired');
        this.input.focus();
        return;
      }
      this.releaseSource();
      this.mode = 'text';
      this.announcement = message;
      this.announcementKey = null;
      this.render();
      this.setStatus('media.messageShown');
    }, opt);
    this.file.addEventListener('change', () => {
      const file = this.file.files?.[0];
      this.file.value = '';
      if (!file) return;
      const type = IMAGE_TYPES.includes(file.type) ? 'image' : VIDEO_TYPES.includes(file.type) ? 'video' : null;
      if (!type) {
        this.setStatus('media.format');
        return;
      }
      const url = URL.createObjectURL(file);
      this.loadSource(url, type, file.name, true);
    }, opt);
    this.board.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.board.close();
    }, opt);
    this.board.addEventListener('close', () => {
      this.scene.stopMovement();
      this.scene.gameContainer.focus({ preventScroll: true });
    }, opt);
  }

  openPanel() {
    if (this.board.open) return;
    this.scene.stopMovement();
    this.board.showModal();
    this.input.focus({ preventScroll: true });
  }

  setStatus(key, params) {
    this.statusKey = key;
    this.statusParams = params;
    this.status.textContent = t(key, params);
  }

  releaseSource() {
    this.loadingMedia = null;
    this.video?.pause();
    if (this.video) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.video = null;
    this.syncPlaybackControls();
    if (this.refreshTimer) this.scene.time.removeEvent(this.refreshTimer);
    this.refreshTimer = null;
    this.image = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  loadSource(src, type, name = src.split('/').pop(), owned = false) {
    this.releaseSource();
    if (owned) this.objectUrl = src;
    this.mode = 'orbit';
    this.render();
    const params = { name: (name || '').slice(0, 42) };
    if (type === 'video') {
      const video = this.video = document.createElement('video');
      video.muted = video.loop = video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('loadeddata', () => {
        if (this.video !== video) return;
        this.mode = 'video';
        this.syncPlaybackControls();
        this.render();
        this.setStatus('media.videoReady', params);
      }, { once: true });
      video.addEventListener('error', () => {
        if (this.video !== video) return;
        this.releaseSource();
        this.mode = 'orbit';
        this.render();
        this.setStatus('media.videoError');
      }, { once: true });
      video.src = src;
    } else {
      const image = this.loadingMedia = new Image();
      image.onload = () => {
        if (this.loadingMedia !== image) return;
        this.image = image;
        this.mode = 'image';
        this.render();
        this.setStatus('media.loaded', params);
      };
      image.onerror = () => {
        if (this.loadingMedia !== image) return;
        this.releaseSource();
        this.setStatus('media.imageError');
      };
      image.src = src;
    }
  }

  syncPlaybackControls() {
    this.playButton.disabled = !this.video || this.video.readyState < 2 || !this.video.paused;
    this.pauseButton.disabled = !this.video || this.video.paused;
  }

  async play() {
    const video = this.video;
    if (!video) return this.setStatus('media.active');
    try {
      await video.play();
      if (this.video !== video) return;
      if (!this.refreshTimer) this.refreshTimer = this.scene.time.addEvent({
        delay: 42,
        loop: true,
        callback: () => { if (!video.paused && video.readyState >= 2) this.render(); },
      });
      this.syncPlaybackControls();
      this.setStatus('media.playing');
    } catch {
      if (this.video === video) this.setStatus('media.retry');
    }
  }

  pause() {
    if (this.video) this.video.pause();
    if (this.refreshTimer) this.scene.time.removeEvent(this.refreshTimer);
    this.refreshTimer = null;
    this.syncPlaybackControls();
    this.setStatus(this.video ? 'media.paused' : 'media.active');
  }

  render() {
    const ctx = this.texture.context;
    const { width: w, height: h } = ctx.canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c2038';
    ctx.fillRect(0, 0, w, h);

    if (this.mode === 'orbit') {
      ctx.drawImage(this.orbit, 0, 0);
      ctx.fillStyle = '#0c1c31df';
      ctx.fillRect(8, 7, w - 16, 15);
      ctx.fillStyle = '#a9e4ea';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(t('media.orbitHeading'), 14, 17, w - 28);
    } else if (this.mode === 'text') {
      this.renderText(ctx, w, h);
    } else {
      const src = this.mode === 'video' ? this.video : this.image;
      if (src) {
        const sw = src.videoWidth || src.naturalWidth;
        const sh = src.videoHeight || src.naturalHeight;
        if (sw && sh) {
          const scale = Math.min(w / sw, h / sh);
          const dw = Math.round(sw * scale), dh = Math.round(sh * scale);
          ctx.drawImage(src, Math.round((w - dw) / 2), Math.round((h - dh) / 2), dw, dh);
        }
      }
    }
    this.texture.refresh();
  }

  renderText(ctx, w, h) {
    const message = this.announcementKey ? t(this.announcementKey) : this.announcement;
    ctx.fillStyle = '#173954'; ctx.fillRect(10, 8, w - 20, h - 16);
    ctx.fillStyle = '#1d5272'; ctx.fillRect(10, 8, w - 20, 19);
    ctx.fillStyle = '#91edf1'; ctx.fillRect(10, 8, 3, h - 16);
    ctx.font = 'bold 9px monospace';
    ctx.fillText(t('media.announcementHeading'), 21, 21, w - 38);
    const words = [...message].slice(0, 180).join('').replace(/\s+/g, ' ').split(' ');
    const maxWidth = w - 43;
    const lineAt = (size) => {
      ctx.font = `bold ${size}px monospace`;
      const rows = [];
      let line = '';
      for (const word of words) {
        const pair = line ? line + ' ' + word : word;
        if (ctx.measureText(pair).width <= maxWidth) { line = pair; continue; }
        if (line) rows.push(line);
        line = '';
        for (const letter of word) {
          if (ctx.measureText(line + letter).width > maxWidth) {
            rows.push(line);
            line = '';
          }
          line += letter;
        }
      }
      if (line) rows.push(line);
      return rows;
    };
    let size = 19, lines = lineAt(size);
    while (size > 9 && lines.length * (size + 3) > h - 39) lines = lineAt(--size);
    ctx.fillStyle = '#e8f5fb';
    let y = Math.max(38, Math.round((h + 25 - lines.length * (size + 3)) / 2 + size));
    for (const line of lines) {
      ctx.fillText(line, 22, y, maxWidth);
      y += size + 3;
    }
  }
}
