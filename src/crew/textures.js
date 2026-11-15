/** Character artwork adapted from demogame/src/art/topdownStyle.js. */
const P = {
  ink: '#172037', navy: '#2a3550', shade: '#9fb2d6', suit: '#e9f1ff',
  cyan: '#4fd8ff', bright: '#bff0ff',
  rust: '#d95f2a', gold: '#ffb84d', blue: '#2f6bd8', green: '#57e39a',
};
function texture(scene, key, w, h, paint) {
  const canvas = scene.textures.createCanvas(key, w, h);
  const ctx = canvas.context;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  canvas.refresh();
}
function rect(c, color, x, y, w, h) {
  c.fillStyle = color; c.fillRect(x, y, w, h);
}
function crew(c, coat, shadow, hair, face, facing = 'down', step = 0) {
  // Cabeza, torso, guantes y botas en perspectiva desde arriba.
  rect(c, P.ink, 5, 1, 10, 9);
  rect(c, hair, 6, 1, 8, 3);
  if (facing === 'up') {
    rect(c, hair, 6, 3, 8, 6);
  } else {
    rect(c, face, 6, 4, facing === 'down' ? 8 : 4, 5);
    if (facing === 'down') {
      rect(c, P.ink, 7, 6, 1, 1);
      rect(c, P.ink, 12, 6, 1, 1);
    }
  }
  rect(c, P.ink, 6, 10, 8, 8);
  rect(c, shadow, 6, 12, 8, 6);
  rect(c, coat, 5, 10, 10, 6);
  rect(c, coat, 2, 11, 3, 7);
  rect(c, coat, 15, 11, 3, 7);
  rect(c, face, 2, 16, 3, 2);
  rect(c, face, 15, 16, 3, 2);
  rect(c, P.navy, 6, step === 1 ? 17 : 18, 3, 2);
  rect(c, P.navy, 11, step === 2 ? 17 : 18, 3, 2);
  if (facing !== 'up') rect(c, P.bright, 9, 11, 2, 2);
}
export function createCrewTextures(scene) {
  const crewPalettes = {
    scientist: [P.suit, P.shade, '#5a3b2a', '#f1c7a5'],
    engineer: [P.rust, '#9c3f1a', '#1b2436', '#d9a07a'],
    director: [P.blue, '#1f4a9c', '#8fa3c7', '#e8b48c'],
    technician: [P.green, '#2f9e6a', '#3a2a1a', '#c98e63'],
  };
  for (const [name, palette] of Object.entries(crewPalettes)) {
    const key = `top-npc-${name}`;
    texture(scene, key, 20, 20, c => crew(c, ...palette));
    for (const facing of ['down', 'up', 'side']) {
      for (let step = 0; step < 3; step++) {
        texture(scene, `${key}-${facing}-${step}`, 20, 20, c => crew(c, ...palette, facing, step));
      }
    }
  }
  // Traje blanco, visor cian y mochila naranja, en las cuatro direcciones.
  for (const facing of ['down', 'up', 'left', 'right']) {
    for (let frame = 0; frame < 2; frame++) {
      texture(scene, 'top-astro-' + facing + '-' + frame, 20, 20, c => {
        rect(c, P.rust, 4, 8, 12, 9);
        rect(c, P.suit, 3, 7, 14, 10);
        rect(c, P.shade, 4, 15, 12, 2);
        rect(c, P.ink, 6, 1, 8, 9);
        rect(c, P.suit, 5, 1, 10, 8);
        if (facing === 'up') {
          rect(c, P.rust, 7, 4, 6, 6);
          rect(c, P.navy, 8, 5, 4, 3);
        } else if (facing === 'down') {
          rect(c, P.ink, 6, 3, 8, 5);
          rect(c, P.cyan, 7, 4, 6, 3);
          rect(c, P.bright, 8, 4, 2, 1);
        } else {
          const x = facing === 'left' ? 5 : 9;
          rect(c, P.ink, x, 3, 6, 5);
          rect(c, P.cyan, x + 1, 4, 4, 3);
        }
        rect(c, P.suit, 2, 9, 3, 6);
        rect(c, P.suit, 15, 9, 3, 6);
        rect(c, P.navy, frame === 0 ? 5 : 4, 17, 5, 3);
        rect(c, P.navy, frame === 0 ? 11 : 12, 17, 5, 3);
        rect(c, P.gold, 9, 13, 2, 2);
      });
    }
  }
}

export function createAstronautAnimations(scene) {
  for (const direction of ['down', 'up', 'left', 'right']) {
    const key = `crew-astro-walk-${direction}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: [0, 1].map(frame => ({ key: `top-astro-${direction}-${frame}` })),
      frameRate: 6,
      repeat: -1,
    });
  }
}
