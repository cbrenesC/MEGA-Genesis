import Phaser from 'phaser';
import { getLanguage, localizeTextObjects, t } from '../i18n/index.js';
import { playClick } from '../welcome/core/gameAudio.js';

export class PauseScene extends Phaser.Scene {
  constructor() { super('PauseScene'); }

  create() {
    const { width, height } = this.scale;
    this.backdrop = this.add.rectangle(0, 0, width, height, 0x02080e, .66).setOrigin(0).setScrollFactor(0);
    this.frame = this.add.rectangle(width / 2, height / 2, 430, 284, 0x0a1b27, .97).setStrokeStyle(2, 0x456c76).setScrollFactor(0);
    this.kicker = this.add.text(0, 0, t('pause.kicker'), { fontFamily: 'monospace', fontSize: '9px', color: '#75bec4', letterSpacing: 2 }).setOrigin(.5).setScrollFactor(0);
    this.title = this.add.text(0, 0, t('pause.title'), { fontFamily: 'monospace', fontSize: '20px', color: '#e0efec' }).setOrigin(.5).setScrollFactor(0);
    this.copy = this.add.text(0, 0, t('pause.description'), { fontFamily: 'monospace', fontSize: '10px', lineSpacing: 7, color: '#98b1b6', align: 'center' }).setOrigin(.5).setScrollFactor(0);
    const makeButton = (label, action) => {
      const hit = this.add.rectangle(0, 0, 330, 42, 0x123743).setStrokeStyle(1, 0x4a8790).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const text = this.add.text(0, 0, t(label), { fontFamily: 'monospace', fontSize: '12px', color: '#c8f6ed' }).setOrigin(.5).setScrollFactor(0);
      hit.on('pointerover', () => hit.setFillStyle(0x1b4b55));
      hit.on('pointerout', () => hit.setFillStyle(0x123743));
      hit.on('pointerup', () => { playClick(); action(); });
      return { hit, text };
    };
    this.resume = makeButton('pause.resume', () => this.resumeExploration());
    this.exit = makeButton('pause.exit', () => {
      this.scene.get('SpaceCenterScene').preparation.save();
      location.assign('/?' + new URLSearchParams({ lang: getLanguage() }));
    });
    this.hint = this.add.text(0, 0, t('pause.hint'), { fontFamily: 'monospace', fontSize: '8px', color: '#98b1b6', letterSpacing: 2 }).setOrigin(.5).setScrollFactor(0);
    this.layout({ width, height });
    localizeTextObjects(this, [
      [this.kicker, 'pause.kicker'],
      [this.title, 'pause.title'],
      [this.copy, 'pause.description'],
      [this.resume.text, 'pause.resume'],
      [this.exit.text, 'pause.exit'],
      [this.hint, 'pause.hint'],
    ]);
    this.input.keyboard.on('keydown-ESC', () => this.resumeExploration());
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  layout(gameSize) {
    if (!gameSize) return;
    const { width, height } = gameSize; const cx = width / 2; const cy = height / 2;
    this.backdrop?.setSize(width, height);
    this.frame.setPosition(cx, cy).setDisplaySize(Math.min(430, width - 20), 284);
    this.kicker.setPosition(cx, cy - 115);
    this.title.setPosition(cx, cy - 86);
    this.copy.setPosition(cx, cy - 47);
    for (const [button, offset] of [[this.resume, 8], [this.exit, 62]]) {
      button.hit.setPosition(cx, cy + offset).setDisplaySize(Math.min(330, width - 42), 42);
      button.text.setPosition(cx, cy + offset);
    }
    this.hint.setPosition(cx, cy + 113);
  }

  resumeExploration() {
    if (!this.scene.isActive()) return;
    this.scene.stop();
    this.scene.resume('SpaceCenterScene');
  }
}
