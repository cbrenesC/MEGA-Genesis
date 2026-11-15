import { t } from '../i18n/index.js';
import { CREW } from './roster.js';

export function placeCrew(scene, collision) {
  for (const member of CREW) {
    const { x, y, name, accent, texture } = member;
    scene.add.ellipse(x, y + 4, 34, 10, 0x06121c, .72).setDepth(y - 1);
    scene.add.image(x, y, texture).setOrigin(.5, .85).setScale(2).setDepth(y + 6).setName(name);
    scene.add.text(x, y - 40, name, {
      fontFamily: 'monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: accent,
      stroke: '#0a1623',
      strokeThickness: 4,
    }).setOrigin(.5).setDepth(1200);
    collision.addRect(x, y, 22, 14, `crew · ${name}`);

    scene.interactables.push({
      x,
      y,
      radius: 64,
      label: () => t('crew.prompt', { name }),
      interact: () => scene.openTerminal({ ...member, kind: 'crew' }),
    });
  }
}
