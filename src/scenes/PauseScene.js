import Phaser from 'phaser';
import { localizeTextObjects, t } from '../i18n/index.js';

export class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  create() {
    const { width, height } = this.scale;
    this.backdrop = this.add.rectangle(0, 0, width, height, 0x02080e, .66).setOrigin(0).setScrollFactor(0);
    this.frame = this.add.rectangle(width / 2, height / 2, 430, 238, 0x0a1b27, .97).setStrokeStyle(2, 0x456c76).setScrollFactor(0);
    this.kicker = this.add.text(width / 2 - 164, height / 2 - 73, t('pause.kicker'), { fontFamily: 'monospace', fontSize: '9px', color: '#75bec4', letterSpacing: 2 }).setScrollFactor(0);
    this.title = this.add.text(width / 2 - 164, height / 2 - 45, t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#e0efec' }).setScrollFactor(0);
    this.copy = this.add.text(width / 2 - 164, height / 2 - 10, t('pause.description'), { fontFamily: 'monospace', fontSize: '10px', lineSpacing: 7, color: '#98b1b6' }).setScrollFactor(0);
    this.button = this.add.rectangle(width / 2, height / 2 + 51, 330, 42, 0x123743).setStrokeStyle(1, 0x4a8790).setInteractive({ useHandCursor: true }).setScrollFactor(0);
    this.buttonText = this.add.text(width / 2 - 143, height / 2 + 46, t('pause.resume'), { fontFamily: 'monospace', fontSize: '9px', color: '#c8f6ed', letterSpacing: 1 }).setScrollFactor(0);
    this.buttonMark = this.add.text(width / 2 + 142, height / 2 + 43, '↗', { fontFamily: 'monospace', fontSize: '14px', color: '#ffb16c' }).setScrollFactor(0);
    this.hint = this.add.text(width / 2, height / 2 + 96, t('pause.hint'), { fontFamily: 'monospace', fontSize: '8px', color: '#64818b', letterSpacing: 2 }).setOrigin(.5).setScrollFactor(0);
    localizeTextObjects(this, [
      [this.kicker, 'pause.kicker'],
      [this.title, 'pause.title'],
      [this.copy, 'pause.description'],
      [this.buttonText, 'pause.resume'],
      [this.hint, 'pause.hint'],
    ]);
    this.button.on('pointerover', () => this.button.setFillStyle(0x1b4b55));
    this.button.on('pointerout', () => this.button.setFillStyle(0x123743));
    this.button.on('pointerdown', () => this.resumeExploration());
    this.input.keyboard.on('keydown-ESC', () => this.resumeExploration());
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  layout(gameSize) {
    if (!gameSize) return;
    const { width, height } = gameSize; const cx = width / 2; const cy = height / 2;
    this.backdrop?.setSize(width, height);
    this.frame?.setPosition(cx, cy);
    this.kicker?.setPosition(cx - 164, cy - 73);
    this.title?.setPosition(cx - 164, cy - 45);
    this.copy?.setPosition(cx - 164, cy - 10);
    this.button?.setPosition(cx, cy + 51);
    this.buttonText?.setPosition(cx - 143, cy + 46);
    this.buttonMark?.setPosition(cx + 142, cy + 43);
    this.hint?.setPosition(cx, cy + 96);
  }

  resumeExploration() {
    if (!this.scene.isActive()) return;
    this.scene.stop();
    this.scene.resume('SpaceCenterScene');
  }
}
