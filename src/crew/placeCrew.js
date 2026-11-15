import { t } from '../i18n/index.js';
import { CREW } from './roster.js';

const STOP_DISTANCE = 86;
const WALK_SPEED = 30;
export function placeCrew(scene, solids) {
  let guideTargetId = null;
  const group = scene.physics.add.group({
    allowGravity: false, immovable: true, collideWorldBounds: true,
  });
  scene.physics.add.collider(group, solids);

  const members = CREW.map((member, index) => {
    const { id, route, name, accent, texture } = member;
    const [x, y] = route[0];
    const sprite = group.create(x, y, texture).setOrigin(.5, .85).setScale(2).setName(name).setPushable(false);
    sprite.body.setSize(11, 7).setOffset(4.5, 13);
    const shadow = scene.add.ellipse(x, y + 4, 34, 10, 0x06121c, .72);
    const nameplate = scene.add.text(x, y - 40, name, {
      fontFamily: 'monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: accent,
      stroke: '#0a1623',
      strokeThickness: 4,
    }).setOrigin(.5).setDepth(1200);
    const guideHalo = scene.add.ellipse(x, y + 10, 48, 26, 0xffdf9d, .12)
      .setStrokeStyle(3, 0xffdf9d, .95).setVisible(false);

    scene.interactables.push({
      get x() { return sprite.x; },
      get y() { return sprite.y; },
      markerY: -62,
      markerStyle: 'crew',
      radius: 64,
      label: () => t('crew.prompt', { name }),
      interact: () => scene.openTerminal({ ...member, kind: 'crew' }),
    });

    let next = 1;
    let direction = 1;
    let rest = 1250 + index * 420;
    let facing = 'down';
    let stepClock = 0;
    let wasGuiding = false;

    return (delta, animate, player, time = 0) => {
      const guiding = guideTargetId === id;
      const vx = player.x - sprite.x;
      const vy = player.y - sprite.y;
      const nearby = Math.hypot(vx, vy) < STOP_DISTANCE;
      const [toX, toY] = route[next];
      const dx = toX - sprite.x;
      const dy = toY - sprite.y;
      const remaining = Math.hypot(dx, dy);
      let walking = false;
      const face = (horizontal, vertical) => {
        facing = Math.abs(horizontal) > Math.abs(vertical) ? 'side' : (vertical < 0 ? 'up' : 'down');
        sprite.setFlipX(facing === 'side' && horizontal > 0);
      };

      sprite.body.stop();
      if (nearby) {
        face(vx, vy);
      } else if (animate) {
        if (rest > 0) {
          rest -= delta;
        } else if (remaining < 1.5) {
          if (next === route.length - 1 || next === 0) direction *= -1;
          next += direction;
          rest = 680 + index * 95;
        } else {
          face(dx, dy);
          const speed = Math.min(WALK_SPEED, remaining * 20);
          sprite.setVelocity(dx / remaining * speed, dy / remaining * speed);
          walking = true;
        }
      }

      stepClock = walking ? stepClock + delta : 0;
      if (animate || nearby) {
        const pose = walking ? [0, 1, 0, 2][Math.floor(stepClock / 140) % 4] : 0;
        const key = `${texture}-${facing}-${pose}`;
        if (sprite.texture.key !== key) sprite.setTexture(key);
      } else {
        sprite.setTexture(texture).setFlipX(false);
      }
      sprite.setDepth(sprite.y + 6);
      shadow.setPosition(sprite.x, sprite.y + 4).setDepth(sprite.y - 1);
      nameplate.setPosition(sprite.x, sprite.y - 40);
      const pulse = animate ? 1 + Math.sin(time / 180) * .08 : 1;
      guideHalo.setPosition(sprite.x, sprite.y + 10).setDepth(sprite.y + 1)
        .setScale(pulse).setVisible(guiding);
      if (guiding !== wasGuiding) {
        nameplate.setColor(guiding ? '#fff2b2' : accent).setFontSize(guiding ? '14px' : '12px');
        wasGuiding = guiding;
      }
    };
  });

  return {
    group,
    update(delta, animate, player, time) {
      for (const update of members) update(delta, animate, player, time);
    },
    setGuideTarget(id) { guideTargetId = id ?? null; },
  };
}
