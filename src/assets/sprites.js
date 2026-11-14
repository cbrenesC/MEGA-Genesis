const crisp = (context) => { context.imageSmoothingEnabled = false; context.lineCap = 'square'; context.lineJoin = 'miter'; };
const px = (context, color, x, y, width, height = width) => { context.fillStyle = color; context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height)); };

function texture(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return scene.textures.get(key);
  const image = scene.textures.createCanvas(key, width, height);
  const context = image.context;
  crisp(context);
  draw(context, width, height);
  image.refresh();
  return image;
}

function floorTile(context, index) {
  const bases = ['#101e28', '#172c3b', '#252b31', '#25313a', '#102735', '#42484a'];
  const inset = ['#142531', '#1b3343', '#2b3238', '#2d3a43', '#142d3a', '#484e50'];
  const hi = ['#21323a', '#315166', '#495257', '#445762', '#27505d', '#5b6261'];
  const dark = ['#0a141c', '#102330', '#171e24', '#18232b', '#0a1c27', '#30383a'];
  px(context, bases[index], 0, 0, 32, 32);
  px(context, inset[index], 2, 2, 28, 28);
  if (index === 0) {
    for (let n = 0; n < 11; n += 1) {
      const x = (n * 17 + 5) % 31;
      const y = (n * 23 + 3) % 31;
      px(context, n % 3 === 0 ? '#25343a' : dark[index], x, y, n % 4 === 0 ? 3 : 1, 1);
    }
    px(context, '#566768', 7, 8, 2); px(context, '#425a60', 23, 24, 1, 2);
    return;
  }
  px(context, dark[index], 0, 0, 32, 2); px(context, hi[index], 2, 2, 28, 1);
  px(context, dark[index], 0, 30, 32, 2); px(context, '#1a252e', 2, 28, 28, 1);
  if (index === 1 || index === 4) {
    px(context, '#263e4b', 15, 4, 1, 24); px(context, '#152734', 16, 4, 1, 24);
    px(context, '#243b47', 4, 15, 24, 1); px(context, '#152734', 4, 16, 24, 1);
  } else if (index === 2 || index === 3) {
    px(context, '#202a30', 7, 6, 1, 20); px(context, '#202a30', 23, 6, 1, 20);
    px(context, '#34434a', 8, 7, 1, 18); px(context, '#34434a', 24, 7, 1, 18);
    px(context, index === 3 ? '#525e62' : '#677174', 4, 5, 2, 2);
    px(context, index === 3 ? '#525e62' : '#677174', 26, 25, 2, 2);
  } else {
    px(context, '#687173', 3, 3, 1, 1); px(context, '#262e31', 27, 27, 2, 2);
    for (let x = 4; x < 31; x += 8) px(context, '#3d4546', x, 5, 1, 22);
    px(context, '#585f60', 6, 8, 4, 1); px(context, '#393f41', 18, 22, 7, 1);
  }
  [[4, 4], [26, 4], [4, 26], [26, 26]].forEach(([x, y]) => {
    px(context, hi[index], x, y, 2, 2); px(context, dark[index], x, y + 1, 1, 1);
  });
}

function drawAstronaut(context, pose) {
  const step = pose === 'a' ? -2 : pose === 'b' ? 2 : 0;
  px(context, '#07121b', 4, 25, 16, 5);
  px(context, '#111b25', 5, 22 + step, 5, 7); px(context, '#101a23', 14, 22 - step, 5, 7);
  px(context, '#728b91', 5, 26 + step, 5, 3); px(context, '#728b91', 14, 26 - step, 5, 3);
  px(context, '#192a37', 3, 16, 18, 9);
  px(context, '#dce7df', 6, 15, 13, 9);
  px(context, '#a4bbb6', 8, 17, 10, 6);
  px(context, '#ff8e54', 4, 18, 3, 4); px(context, '#fc984e', 18, 18, 3, 4);
  px(context, '#f3f0d9', 7, 7, 12, 10);
  px(context, '#c4d5cb', 5, 10, 2, 5); px(context, '#c4d5cb', 19, 10, 2, 5);
  px(context, '#142a39', 7, 10, 12, 5); px(context, '#5ddce2', 8, 10, 9, 3);
  px(context, '#baf7ef', 9, 10, 2, 1); px(context, '#20465a', 14, 12, 2, 2);
  px(context, '#ffaf6e', 10, 19, 3, 2); px(context, '#e2f1e7', 9, 4, 8, 3);
  px(context, '#fff5d4', 11, 3, 5, 2); px(context, '#829995', 5, 14, 14, 1);
  px(context, '#375365', 7, 23, 11, 1);
  if (pose === 'blink') {
    px(context, '#122c38', 7, 10, 11, 4);
    px(context, '#538e97', 9, 11, 8, 1);
    px(context, '#203e4b', 9, 13, 7, 1);
  }
}

function drawDesk(context, w, h) {
  px(context, '#060d13', 5, h - 8, w - 10, 6);
  px(context, '#17232b', 4, 10, w - 8, h - 17);
  px(context, '#718087', 6, 8, w - 12, h - 18);
  px(context, '#52646d', 8, 9, w - 16, h - 22);
  px(context, '#273b47', 10, 11, w - 20, h - 27);
  px(context, '#344d5a', 12, 12, w - 24, h - 32);
  px(context, '#101b24', w / 2 - 25, 12, 50, 22);
  px(context, '#526f78', w / 2 - 24, 13, 48, 1);
  px(context, '#0b141c', w / 2 - 21, 15, 42, 15);
  px(context, '#1c4051', w / 2 - 19, 16, 38, 11);
  px(context, '#62e4e3', w / 2 - 16, 17, 10, 1); px(context, '#317184', w / 2 - 16, 20, 27, 1);
  px(context, '#4caebb', w / 2 - 16, 24, 18, 1); px(context, '#ff9a51', w / 2 + 11, 28, 2, 2);
  px(context, '#172631', w / 2 - 24, 38, 48, 8);
  for (let i = 0; i < 10; i += 1) px(context, i % 4 === 0 ? '#6cc8ca' : '#819096', w / 2 - 20 + i * 4, 40, 2, 2);
  px(context, '#111a22', w / 2 - 32, h - 11, 64, 2);
  px(context, '#0e1820', w / 2 - 2, h - 7, 4, 7);
  px(context, '#66767a', w / 2 - 16, h - 1, 32, 1);
  for (let x = 9; x < w - 8; x += 25) { px(context, '#1c282e', x, 20, 1, 12); px(context, '#8e9a96', x + 2, 20, 2, 1); }
  px(context, '#ff984f', 8, 13, 2, 3); px(context, '#5de2d9', w - 11, 13, 2, 2);
}

function drawWorkbench(context, w, h) {
  px(context, '#060c10', 5, h - 8, w - 10, 6);
  px(context, '#202a2c', 2, 8, w - 4, h - 17);
  px(context, '#67716d', 5, 5, w - 10, h - 17);
  px(context, '#a0a294', 7, 7, w - 14, 2);
  px(context, '#424a49', 7, 9, w - 14, h - 25);
  px(context, '#333c3c', 10, 12, w - 20, h - 32);
  px(context, '#919083', 14, 14, 23, 5); px(context, '#6e6c61', 14, 20, 23, 3);
  px(context, '#ce984f', 43, 12, 20, 2); px(context, '#d6c291', 44, 15, 2, 10);
  px(context, '#687e7a', 52, 23, 23, 7); px(context, '#29444b', 55, 25, 14, 2);
  px(context, '#ad6a37', w - 28, 13, 12, 5); px(context, '#e2ae65', w - 25, 10, 4, 6);
  for (let x = 12; x < w - 12; x += 18) px(context, '#253033', x, h - 12, 3, 4);
  px(context, '#e4a45d', 6, 10, 3, 2); px(context, '#69d8d3', w - 11, 10, 3, 2);
}

function drawServer(context, w, h) {
  px(context, '#050a10', 4, h - 7, w - 8, 5);
  px(context, '#17212a', 3, 4, w - 6, h - 10);
  px(context, '#6c7c80', 5, 3, w - 10, h - 10);
  px(context, '#344750', 8, 6, w - 16, h - 18);
  for (let y = 10; y < h - 10; y += 11) {
    px(context, '#141e28', 11, y, w - 22, 8);
    px(context, '#263d49', 13, y + 1, w - 26, 1);
    for (let vent = 0; vent < 5; vent += 1) px(context, '#54636a', 15 + vent * 5, y + 4, 3, 2);
    px(context, y % 3 ? '#6aede0' : '#ff9855', w - 17, y + 3, 3, 3);
    px(context, '#d2ded4', 7, y + 2, 1, 4);
  }
  px(context, '#bbc5bd', 4, 3, w - 8, 2); px(context, '#334951', 3, 10, 2, h - 18);
  px(context, '#24323c', 6, h - 6, 3, 4); px(context, '#24323c', w - 9, h - 6, 3, 4);
}

function drawTank(context, w, h, type) {
  px(context, '#081118', 5, h - 7, w - 10, 5);
  px(context, '#27363c', 3, 8, w - 6, h - 15);
  px(context, '#728187', 5, 6, w - 10, h - 15);
  px(context, type === 'fuel' ? '#ad7141' : type === 'water' ? '#4e98aa' : '#b7c1ba', 8, 9, w - 16, h - 21);
  px(context, type === 'fuel' ? '#d19251' : type === 'water' ? '#65c4d1' : '#e1e6da', 9, 10, 3, h - 24);
  for (let y = 15; y < h - 13; y += 12) {
    px(context, '#e1ddd0', 5, y, w - 10, 2); px(context, '#536267', 7, y + 2, w - 14, 1);
  }
  px(context, '#1b2b33', w / 2 - 8, 14, 16, 12); px(context, '#0e1a21', w / 2 - 6, 16, 12, 7);
  px(context, type === 'fuel' ? '#ff974f' : type === 'water' ? '#6ce9e7' : '#d2ebdc', w / 2 - 4, 18, 8, 2);
  px(context, '#d5dfd4', w / 2 - 3, 2, 6, 5); px(context, '#74858a', w / 2 - 5, 1, 10, 2);
  px(context, '#55656a', 6, h - 8, 3, 4); px(context, '#55656a', w - 9, h - 8, 3, 4);
}

function drawRobotArm(context, w, h) {
  px(context, '#060b10', 10, h - 16, w - 20, 11);
  px(context, '#29353b', 8, h - 22, w - 16, 9);
  px(context, '#9a8051', w / 2 - 13, h - 23, 26, 5);
  px(context, '#57646a', w / 2 - 7, h - 27, 14, 5);
  px(context, '#c1a15e', w / 2 - 5, h - 31, 10, 7);
  px(context, '#d7b976', w / 2 - 2, h - 38, 4, 10);
  px(context, '#d6ba7a', w / 2 - 2, h - 50, 4, 13);
  px(context, '#53636a', w / 2 - 6, h - 53, 12, 5);
  px(context, '#c7a45d', w / 2 - 11, h - 60, 22, 8);
  px(context, '#e2c783', w / 2 - 12, h - 62, 5, 4); px(context, '#e2c783', w / 2 + 7, h - 62, 5, 4);
  px(context, '#283840', w / 2 - 3, h - 68, 6, 7);
  px(context, '#7099a1', 12, h - 17, 7, 2); px(context, '#ff9651', w - 19, h - 17, 6, 3);
  for (let y = h - 19; y > h - 52; y -= 10) px(context, '#515e5f', w / 2 - 4, y, 8, 2);
}

function drawEngine(context, w, h) {
  px(context, '#070d12', 9, h - 11, w - 18, 7);
  px(context, '#40494d', 8, 7, w - 16, h - 17);
  px(context, '#848c89', 12, 5, w - 24, h - 18);
  px(context, '#303b40', 15, 10, w - 30, h - 26);
  px(context, '#69777a', 18, 11, w - 36, 4); px(context, '#1e3039', 18, h - 19, w - 36, 8);
  const centerX = w / 2;
  for (let n = 0; n < 4; n += 1) {
    const y = 21 + n * 15;
    px(context, '#b2b6a8', centerX - 26, y, 52, 5);
    px(context, '#656e6c', centerX - 21, y + 5, 42, 5);
    px(context, '#313e42', centerX - 15, y + 10, 30, 4);
    px(context, '#c6a86c', centerX - 4, y - 2, 8, 2);
  }
  px(context, '#c7894f', 16, 13, 6, 6); px(context, '#6bd5d6', w - 22, 13, 6, 6);
  px(context, '#27353c', centerX - 3, h - 19, 6, 13); px(context, '#bd8c53', centerX - 2, h - 9, 4, 5);
}

function drawShelf(context, w, h) {
  px(context, '#090e14', 4, h - 6, w - 8, 5);
  px(context, '#27373f', 2, 5, w - 4, h - 12);
  px(context, '#8a948b', 5, 5, 3, h - 11); px(context, '#8a948b', w - 8, 5, 3, h - 11);
  for (let y = 9; y < h - 7; y += 15) {
    px(context, '#5d6c6c', 5, y, w - 10, 2); px(context, '#303f45', 6, y + 2, w - 12, 1);
    px(context, '#bd8e59', 10, y - 6, 18, 5); px(context, '#d7ae71', 11, y - 6, 2, 1);
    px(context, '#465b61', 33, y - 7, 14, 6); px(context, '#65c5c4', 35, y - 6, 7, 2);
    px(context, '#8e9590', 51, y - 7, 20, 6); px(context, '#3c5360', 54, y - 6, 13, 1);
  }
}

function drawVehicle(context, w, h) {
  px(context, '#050b10', 8, h - 8, w - 16, 5);
  px(context, '#18232c', 4, 9, w - 8, h - 16);
  px(context, '#839395', 7, 7, w - 14, h - 17);
  px(context, '#bcc4b8', 10, 9, w - 20, h - 21);
  px(context, '#3d5159', 18, 13, w - 36, 13);
  px(context, '#1e5262', 21, 15, w - 42, 8);
  px(context, '#78d8da', 24, 16, w - 50, 2);
  px(context, '#bc734a', 9, h - 18, w - 18, 4);
  px(context, '#ff9853', 10, 8, 6, 3); px(context, '#f6e3aa', w - 16, 8, 6, 3);
  px(context, '#37444a', 8, h - 14, w - 16, 2); px(context, '#344148', 8, 14, 3, h - 28); px(context, '#344148', w - 11, 14, 3, h - 28);
  px(context, '#344a53', w / 2 - 3, 27, 6, 8); px(context, '#d4d1b6', w / 2 - 10, h - 12, 20, 2);
}

function drawRocket(context, w, h) {
  px(context, '#030910', 28, h - 27, w - 56, 18);
  px(context, '#111923', 31, 35, w - 62, h - 72);
  px(context, '#5b6b70', 35, 33, w - 70, h - 78);
  px(context, '#9ca9a7', 39, 34, w - 78, h - 82);
  px(context, '#d3d8ce', 44, 43, w - 88, h - 103);
  px(context, '#f0eee0', w / 2 - 27, 53, 54, h - 136);
  px(context, '#9daca9', w / 2 - 5, 50, 10, h - 127);
  // Pixel-sharp nose cone and shoulder panels
  for (let y = 0; y < 58; y += 4) {
    const spread = Math.max(2, Math.floor(y * .56));
    px(context, y < 34 ? '#a9b8b1' : '#e6e5d7', w / 2 - spread, y + 10, spread * 2, 4);
  }
  px(context, '#829495', w / 2 - 27, 63, 54, 3);
  for (let y = 99; y < h - 122; y += 48) {
    px(context, '#8d9d9b', 43, y, w - 86, 3);
    px(context, '#f9f0d5', w / 2 - 22, y - 2, 44, 2);
    px(context, '#a06f53', w / 2 - 8, y + 5, 16, 4);
  }
  for (let y = 116; y < h - 140; y += 46) {
    px(context, '#aec5c1', w / 2 - 20, y, 8, 9); px(context, '#4a7880', w / 2 - 19, y + 1, 5, 6);
    px(context, '#aec5c1', w / 2 + 12, y, 8, 9); px(context, '#4a7880', w / 2 + 13, y + 1, 5, 6);
  }
  px(context, '#e58c4b', 46, 104, 12, 5); px(context, '#c86c43', w - 58, 104, 12, 5);
  px(context, '#e89156', 45, h - 147, 22, 14); px(context, '#bf6844', w - 67, h - 147, 22, 14);
  px(context, '#78898b', w / 2 - 19, h - 118, 38, 42);
  px(context, '#38464c', w / 2 - 25, h - 91, 50, 23);
  px(context, '#c2c4b7', w / 2 - 21, h - 80, 42, 12);
  for (let i = 0; i < 5; i += 1) px(context, '#5f6664', w / 2 - 15 + i * 8, h - 77, 4, 7);
  px(context, '#e09a58', w / 2 - 7, h - 63, 14, 7); px(context, '#607478', w / 2 - 33, 32, 66, 5);
  for (let side = 0; side < 2; side += 1) {
    const x = side ? w - 39 : 34;
    for (let y = 54; y < h - 66; y += 16) px(context, '#697b7d', x, y, 4, 9);
  }
}

function drawTower(context, w, h) {
  px(context, '#050c12', 8, 12, w - 16, h - 24);
  for (let x = 13; x < w - 8; x += 15) {
    px(context, '#53636a', x, 10, 4, h - 20); px(context, '#86908c', x + 1, 13, 1, h - 26);
  }
  for (let y = 18; y < h - 10; y += 25) {
    px(context, '#74817e', 8, y, w - 16, 4);
    px(context, '#3c4d53', 9, y + 5, w - 18, 2);
    for (let x = 13; x < w - 18; x += 15) {
      px(context, '#34464b', x, y + 4, 12, 2);
      px(context, '#96a19a', x + 5, y + 1, 3, 2);
    }
  }
  px(context, '#ae754d', 5, 17, 4, h - 34); px(context, '#d19759', w - 9, 17, 4, h - 34);
  px(context, '#f2a45a', 9, 10, 6, 5); px(context, '#ff9c50', w - 15, 10, 6, 5);
  px(context, '#1b2a32', 21, 25, w - 42, h - 50);
}

function drawFan(context, w, h, cross = false) {
  px(context, '#182832', 0, 0, w, h); px(context, '#506168', 2, 2, w - 4, h - 4);
  px(context, '#17232c', 5, 5, w - 10, h - 10);
  const cx = w / 2; const cy = h / 2;
  for (let i = 0; i < 4; i += 1) {
    context.save(); context.translate(cx, cy); context.rotate((Math.PI / 2) * i + (cross ? .35 : 0));
    px(context, '#587781', -3, -1, 6, -1 + Math.max(7, Math.floor(w * .31)));
    px(context, '#8aa4a2', -2, 3, 4, Math.max(3, Math.floor(w * .2)));
    context.restore();
  }
  px(context, '#9aa8a1', cx - 3, cy - 3, 6, 6); px(context, '#30424a', cx - 1, cy - 1, 2, 2);
  px(context, '#5c737c', 4, 4, 2, 2); px(context, '#5c737c', w - 6, 4, 2, 2);
  px(context, '#5c737c', 4, h - 6, 2, 2); px(context, '#5c737c', w - 6, h - 6, 2, 2);
}

export function createSpaceTextures(scene) {
  texture(scene, 'space-floor-atlas', 32 * 6, 32, (context) => {
    for (let tile = 0; tile < 6; tile += 1) {
      context.save(); context.translate(tile * 32, 0); floorTile(context, tile); context.restore();
    }
  });
  texture(scene, 'astronaut-idle', 24, 32, (context) => drawAstronaut(context, 'idle'));
  texture(scene, 'astronaut-idle-blink', 24, 32, (context) => drawAstronaut(context, 'blink'));
  texture(scene, 'astronaut-step-a', 24, 32, (context) => drawAstronaut(context, 'a'));
  texture(scene, 'astronaut-step-b', 24, 32, (context) => drawAstronaut(context, 'b'));
  texture(scene, 'console-desk', 112, 72, drawDesk);
  texture(scene, 'engineering-bench', 144, 76, drawWorkbench);
  texture(scene, 'server-rack', 52, 96, drawServer);
  texture(scene, 'robot-arm', 92, 100, drawRobotArm);
  texture(scene, 'rocket-engine', 112, 116, drawEngine);
  texture(scene, 'fuel-tank', 62, 98, (ctx, w, h) => drawTank(ctx, w, h, 'fuel'));
  texture(scene, 'oxygen-bank', 58, 96, (ctx, w, h) => drawTank(ctx, w, h, 'oxygen'));
  texture(scene, 'water-cistern', 72, 96, (ctx, w, h) => drawTank(ctx, w, h, 'water'));
  texture(scene, 'supply-shelf', 92, 76, drawShelf);
  texture(scene, 'battery-bank', 66, 64, (ctx, w, h) => drawServer(ctx, w, h));
  texture(scene, 'generator', 96, 72, (ctx, w, h) => {
    px(ctx, '#060d12', 5, h - 8, w - 10, 6); px(ctx, '#27373b', 4, 8, w - 8, h - 18);
    px(ctx, '#899087', 8, 6, w - 16, h - 18); px(ctx, '#39474a', 13, 11, w - 26, h - 28);
    px(ctx, '#182831', 17, 15, 38, 31); px(ctx, '#65c5c1', 20, 18, 32, 2);
    for (let i = 0; i < 5; i += 1) px(ctx, '#718282', 21 + i * 6, 23, 3, 17);
    px(ctx, '#f29a51', 68, 13, 13, 5); px(ctx, '#1a252a', 68, 21, 16, 19);
    px(ctx, '#75817a', 70, 24, 2, 12); px(ctx, '#61746d', 76, 24, 2, 12);
    px(ctx, '#b8844f', 7, 12, 4, 6); px(ctx, '#43babb', 83, 13, 3, 4);
  });
  texture(scene, 'service-vehicle', 100, 60, drawVehicle);
  texture(scene, 'launch-rocket', 164, 500, drawRocket);
  texture(scene, 'service-tower', 116, 440, drawTower);
  texture(scene, 'fan-blades', 44, 44, (ctx, w, h) => drawFan(ctx, w, h, false));
  texture(scene, 'vent-fan', 52, 52, (ctx, w, h) => drawFan(ctx, w, h, true));
  texture(scene, 'control-display', 336, 136, (ctx, w, h) => {
    px(ctx, '#071019', 0, 0, w, h); px(ctx, '#667b7f', 4, 4, w - 8, h - 8);
    px(ctx, '#1e2e36', 8, 8, w - 16, h - 16); px(ctx, '#101c28', 13, 13, w - 26, h - 26);
    px(ctx, '#1d394a', 18, 19, w - 36, h - 38);
    for (let i = 0; i < 60; i += 1) {
      const x = (i * 47 + 13) % (w - 40) + 20; const y = (i * 31 + 22) % (h - 46) + 22;
      px(ctx, i % 7 === 0 ? '#b7d2cd' : i % 5 === 0 ? '#569aa4' : '#385d70', x, y, i % 9 === 0 ? 2 : 1, 1);
    }
    px(ctx, '#61dfe1', 24, 26, 72, 2); px(ctx, '#2f7181', 24, 31, 120, 1);
    px(ctx, '#396c7c', 24, h - 25, 167, 1); px(ctx, '#e7904d', 252, 21, 4, 4);
    px(ctx, '#80bcc0', 262, 21, 4, 4); px(ctx, '#317280', 271, 21, 43, 2);
    px(ctx, '#d5ad70', 274, h - 24, 32, 2); px(ctx, '#5ed3da', 251, h - 28, 9, 9);
    px(ctx, '#476d78', 22, h / 2, 110, 1); px(ctx, '#355467', 146, h / 2 + 8, 160, 1);
    px(ctx, '#2a5062', 28, 74, 2, 22); px(ctx, '#2a5062', 36, 80, 2, 16); px(ctx, '#4b9a9d', 44, 67, 2, 29);
    for (let x = 20; x < w - 18; x += 24) px(ctx, '#182833', x, h - 13, 17, 1);
  });
  texture(scene, 'monitor-small', 72, 52, (ctx, w, h) => {
    px(ctx, '#081018', 1, 1, w - 2, h - 4); px(ctx, '#809193', 4, 3, w - 8, h - 10);
    px(ctx, '#102430', 8, 7, w - 16, h - 20); px(ctx, '#2a5d6c', 11, 10, w - 22, 2);
    px(ctx, '#60dce0', 11, 17, 21, 2); px(ctx, '#317c8c', 11, 23, 39, 2);
    px(ctx, '#dc9654', w - 18, 15, 4, 4); px(ctx, '#49bec0', w - 28, 22, 8, 2);
    px(ctx, '#2a3940', 28, h - 12, 16, 6); px(ctx, '#929b96', 19, h - 7, 34, 2);
  });
  texture(scene, 'fan-unit', 56, 56, (ctx, w, h) => drawFan(ctx, w, h, false));
  texture(scene, 'warning-light', 14, 14, (ctx) => { px(ctx, '#492a22', 2, 3, 10, 9); px(ctx, '#ff9850', 4, 4, 6, 5); px(ctx, '#ffcb74', 5, 4, 3, 2); });
  texture(scene, 'steam-puff', 32, 32, (ctx) => { px(ctx, '#b6cbd0', 12, 13, 8, 6); px(ctx, '#90acb4', 9, 15, 13, 5); px(ctx, '#d0ded9', 14, 11, 4, 4); px(ctx, '#617d87', 10, 20, 12, 2); });
  texture(scene, 'crate', 48, 44, (ctx, w, h) => { px(ctx, '#111b21', 2, 5, w - 4, h - 9); px(ctx, '#795c3d', 5, 4, w - 10, h - 13); px(ctx, '#ba8a53', 8, 7, w - 16, 3); px(ctx, '#493d31', 9, 11, 3, h - 22); px(ctx, '#493d31', w - 12, 11, 3, h - 22); px(ctx, '#d2a165', 12, h - 18, w - 24, 3); px(ctx, '#68716a', w / 2 - 5, 15, 10, 8); px(ctx, '#dbd5bb', w / 2 - 3, 17, 6, 4); px(ctx, '#182126', 3, h - 6, w - 6, 4); });
  texture(scene, 'door-h', 100, 28, (ctx, w, h) => { px(ctx, '#09131b', 0, 2, w, h - 4); px(ctx, '#85969a', 3, 1, w - 6, h - 2); px(ctx, '#192d37', 7, 5, w - 14, h - 10); px(ctx, '#43616a', w / 2 - 3, 5, 6, h - 10); px(ctx, '#73d4d3', w / 2 - 1, 8, 2, h - 16); px(ctx, '#182630', 11, 8, w - 22, 1); });
  texture(scene, 'door-v', 28, 100, (ctx, w, h) => { px(ctx, '#09131b', 2, 0, w - 4, h); px(ctx, '#85969a', 1, 3, w - 2, h - 6); px(ctx, '#192d37', 5, 7, w - 10, h - 14); px(ctx, '#43616a', 5, h / 2 - 3, w - 10, 6); px(ctx, '#73d4d3', 8, h / 2 - 1, w - 16, 2); px(ctx, '#182630', 8, 11, 1, h - 22); });
  texture(scene, 'pad-markings', 256, 256, (ctx, w, h) => {
    px(ctx, '#353e40', 0, 0, w, h); px(ctx, '#41494a', 4, 4, w - 8, h - 8);
    for (let y = 12; y < h - 10; y += 28) { px(ctx, '#5c6260', 8, y, w - 16, 1); px(ctx, '#31383a', 8, y + 1, w - 16, 1); }
    px(ctx, '#dbad70', 20, 19, 6, 82); px(ctx, '#2e383a', 26, 19, 2, 82); px(ctx, '#d5d0af', w - 27, 19, 5, 82);
    for (let i = 0; i < 5; i += 1) { const y = 24 + i * 17; px(ctx, '#e2a15e', 12, y, 8, 4); px(ctx, '#e2a15e', w - 20, y, 8, 4); }
    px(ctx, '#2b3638', 48, 20, 1, 215); px(ctx, '#565d5d', 49, 20, 1, 215);
    px(ctx, '#596161', 209, 20, 1, 215); px(ctx, '#2b3638', 210, 20, 1, 215);
    px(ctx, '#68706a', 12, 11, 5, 4); px(ctx, '#68706a', w - 17, h - 15, 5, 4);
  });
  texture(scene, 'searchlight', 20, 20, (ctx) => { px(ctx, '#1b3039', 2, 2, 16, 16); px(ctx, '#c9d2c2', 6, 6, 8, 8); px(ctx, '#79e2de', 8, 8, 4, 4); px(ctx, '#111e24', 9, 17, 2, 3); });
}

export function createOpenDoorTextures(scene) {
  texture(scene, 'door-h-open', 100, 28, (ctx, w, h) => {
    px(ctx, '#09131b', 0, 2, w, h - 4); px(ctx, '#85969a', 2, 1, w - 4, 3); px(ctx, '#85969a', 2, h - 4, w - 4, 3);
    px(ctx, '#192c35', 4, 5, w - 8, h - 10); px(ctx, '#0a1c25', 27, 7, 46, h - 14);
    px(ctx, '#688084', 5, 6, 3, h - 12); px(ctx, '#688084', w - 8, 6, 3, h - 12);
    px(ctx, '#70848a', 11, 7, 14, h - 14); px(ctx, '#70848a', w - 25, 7, 14, h - 14);
    px(ctx, '#95aaa4', 12, 8, 2, h - 17); px(ctx, '#95aaa4', w - 15, 8, 2, h - 17);
    px(ctx, '#54d6d2', 5, 5, 4, 2); px(ctx, '#54d6d2', w - 9, 5, 4, 2);
  });
  texture(scene, 'door-v-open', 28, 100, (ctx, w, h) => {
    px(ctx, '#09131b', 2, 0, w - 4, h); px(ctx, '#85969a', 1, 2, 3, h - 4); px(ctx, '#85969a', w - 4, 2, 3, h - 4);
    px(ctx, '#192c35', 5, 4, w - 10, h - 8); px(ctx, '#0a1c25', 7, 27, w - 14, 46);
    px(ctx, '#688084', 6, 5, w - 12, 3); px(ctx, '#688084', 6, h - 8, w - 12, 3);
    px(ctx, '#70848a', 7, 11, w - 14, 14); px(ctx, '#70848a', 7, h - 25, w - 14, 14);
    px(ctx, '#95aaa4', 8, 12, w - 17, 2); px(ctx, '#95aaa4', 8, h - 15, w - 17, 2);
    px(ctx, '#54d6d2', 5, 5, 2, 4); px(ctx, '#54d6d2', 5, h - 9, 2, 4);
  });
}
