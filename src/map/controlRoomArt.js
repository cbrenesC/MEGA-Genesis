// The room is rendered from low-resolution canvas textures. All dimensions
// below are art pixels, not physics units. Phaser displays them at 2×.
const C = {
  ink: '#182332', black: '#101927', deep: '#233044', navy: '#304154',
  shadow: '#41546e', steel: '#657b96', silver: '#a2b7cb', pale: '#cedbe0',
  cream: '#e9dfd0', warm: '#c7b6a9', white: '#fff4df',
  cyan: '#7de4e8', blue: '#3e95c8', amber: '#ffc274',
  leaf0: '#203c2b', leaf1: '#405f32', leaf2: '#6d923e', leaf3: '#a8bc59',
};

const rect = (c, x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x, y, w, h); };
function poly(c, points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath();
  c.fill();
}
function box(c, x, y, w, h, top, front, lip = C.white) {
  rect(c, x + 3, y + 4, w, h, '#15253785');
  rect(c, x, y, w, h, C.ink);
  rect(c, x + 1, y + 1, w - 2, h - 2, front);
  rect(c, x + 1, y + 1, w - 2, Math.floor(h * .56), top);
  rect(c, x + 2, y + 2, w - 4, 1, lip);
}
function light(c, x, y, w, vertical = false) {
  const a = vertical ? 4 : w, b = vertical ? w : 4;
  rect(c, x - 2, y - 2, a + 4, b + 4, '#ffc17924');
  rect(c, x - 1, y - 1, a + 2, b + 2, '#6f5143');
  rect(c, x, y, a, b, C.amber);
  rect(c, x + 1, y + 1, a - 2, b - 2, '#fff1c5');
}
function texture(scene, key, w, h, paint) {
  const surface = scene.textures.createCanvas(key, w, h);
  paint(surface.context);
  surface.refresh();
}

function room(c) {
  rect(c, 0, 0, 640, 432, '#111e2d');
  rect(c, 11, 21, 622, 403, '#0a1420');
  rect(c, 20, 26, 600, 385, '#536b87');
  for (let y = 40; y < 410; y += 25) {
    for (let x = 22; x < 610; x += 27) {
      const tone = [ '#647f9d', '#627c98', '#637d9a', '#607894', '#667f9b' ][(x * 3 + y * 7) % 5];
      rect(c, x, y, Math.min(26, 610 - x), 24, tone);
      rect(c, x + 1, y, 24, 1, '#7891ae90');
      rect(c, x, y + 1, 1, 22, '#7e96b355');
      for (let i = 0; i < 6; i++) {
        rect(c, x + 2 + ((x + y * 3 + i * 17) % 23), y + 2 + ((x * 7 + y + i * 11) % 20), (i % 2) + 1, 1, i % 2 ? '#7090ab55' : '#495f7945');
      }
    }
  }

  // Central walkway and inset platform edges.
  rect(c, 291, 172, 58, 226, '#91aec12b');
  for (const x of [289, 350]) {
    rect(c, x, 181, 1, 215, '#a9c1d299');
    for (let y = 190; y < 390; y += 23) rect(c, x + (x < 320 ? -3 : 3), y, 1, 8, '#a2dee5');
  }
  for (const [x, y, w, h] of [[65, 186, 203, 129], [372, 186, 203, 129], [56, 326, 195, 62], [389, 326, 195, 62]]) {
    poly(c, [[x+6,y],[x+w-6,y],[x+w,y+6],[x+w,y+h-6],[x+w-6,y+h],[x+6,y+h],[x,y+h-6],[x,y+6]], y > 320 ? '#4d637c' : '#506883');
    rect(c, x + 7, y + 2, w - 14, 1, '#96acc1');
    rect(c, x + 7, y + h - 3, w - 14, 1, '#314761');
    if (y > 320) {
      for (let yy = y + 6; yy < y + h - 4; yy += 3) {
        for (let xx = x + 6 + (yy % 2); xx < x + w - 4; xx += 3) rect(c, xx, yy, 1, 1, '#7890a035');
      }
      rect(c, x + 7, y + 5, w - 14, 1, '#adc2c283');
      rect(c, x + 7, y + h - 6, w - 14, 1, '#adc2c283');
    }
  }

  // Floor access chevron in front of the presentation console.
  for (const offset of [-12, 0, 12]) {
    const x = 320 + offset;
    poly(c, [[x-4,179],[x,175],[x+4,179],[x+2,179],[x,177],[x-2,179]], '#d5f0eb');
  }

  // Ivory wall modules and brushed metal trim.
  rect(c, 26, 17, 588, 124, '#1a2536');
  rect(c, 27, 21, 586, 112, '#c1aaa0');
  for (let x = 28; x < 614; x += 49) {
    rect(c, x, 22, 47, 109, C.cream);
    rect(c, x, 22, 47, 5, '#fbefdb');
    rect(c, x + 1, 28, 44, 1, '#baa899');
    rect(c, x + 1, 124, 44, 4, '#c5b3a7');
    rect(c, x + 1, 126, 44, 1, '#e0caba');
    rect(c, x + 45, 33, 1, 86, '#aa988c');
    rect(c, x + 2, 119, 2, 2, '#a19a96');
  }
  rect(c, 27, 134, 586, 3, '#e9daca');
  rect(c, 27, 137, 586, 4, '#8f7c7a');
  rect(c, 27, 141, 586, 4, '#2940586a');
  rect(c, 28, 13, 584, 8, C.shadow);
  rect(c, 28, 13, 584, 2, '#b0b2b9');
  for (const x of [53, 159, 312, 469, 565]) light(c, x, 23, 24);
  for (const x of [19, 610]) {
    rect(c, x - 5, 15, 17, 398, C.ink);
    for (let y = 15; y < 413; y += 37) {
      rect(c, x - 4, y, 15, 35, C.warm);
      rect(c, x - 4, y, 4, 35, '#ede1d0');
      rect(c, x + 8, y, 3, 35, '#837e88');
      rect(c, x - 4, y, 15, 1, '#ffebd0');
    }
    for (const y of [44, 162, 260, 371]) light(c, x + 1, y, 20, true);
  }
  for (const [x, w] of [[20, 266], [354, 266]]) {
    rect(c, x, 396, w, 17, C.ink);
    rect(c, x, 397, w, 5, C.cream);
    rect(c, x, 402, w, 9, '#8b8792');
    rect(c, x, 397, w, 1, C.white);
    for (let p = x + 25; p < x + w - 6; p += 33) rect(c, p, 399, 1, 11, '#5d5b6b');
  }
  box(c, 286, 395, 68, 24, '#516c88', C.deep, '#b6cfdf');
  rect(c, 289, 405, 62, 3, '#172535');
  for (let x = 292; x < 349; x += 7) poly(c, [[x,405],[x+3,405],[x+1,408],[x-2,408]], C.amber);

  // Tall technical blueprint and pipework behind the server bank.
  box(c, 45, 43, 67, 72, '#193e67', '#193e67', '#8ab2d1');
  for (let y = 49; y < 111; y += 7) rect(c, 50, y, 56, 1, '#4b759c85');
  for (let x = 51; x < 108; x += 7) rect(c, x, 48, 1, 63, '#4b759c85');
  poly(c, [[80,53],[88,66],[88,89],[94,101],[85,99],[85,103],[76,103],[76,99],[67,101],[73,89],[73,66]], '#d0e9ef');
  poly(c, [[80,56],[86,67],[86,90],[89,98],[83,96],[83,101],[78,101],[78,96],[72,98],[75,90],[75,67]], '#234a74');
  rect(c, 74, 70, 13, 1, '#94d1e1'); rect(c, 74, 85, 13, 1, '#94d1e1');
  for (let y = 58; y < 105; y += 9) { rect(c, 54, y, 9 - (y % 4), 1, '#b0d3ee'); rect(c, 95, y + 2, 6, 1, '#b0d3ee'); }
  for (const x of [47, 108]) for (const y of [45, 111]) rect(c, x, y, 2, 2, C.amber);
  for (const [i, color] of ['#364f66', '#c17a55', '#527d8b'].entries()) {
    const x = 536 + i * 7;
    rect(c, x, 28, 5, 37 + i * 4, C.ink);
    rect(c, x + 1, 29, 2, 34 + i * 4, color);
    rect(c, x, 61 + i * 4, 31, 4, C.ink);
    rect(c, x + 1, 62 + i * 4, 29, 1, color);
  }
}
function monitor(c, x, y, w, tone, style) {
  box(c, x, y, w, 15, C.steel, C.ink, C.silver);
  rect(c, x + 2, y + 3, w - 4, 10, tone);
  rect(c, x + 3, y + 4, w - 6, 1, '#4598be85');
  if (style === 0) {
    for (let i = 0; i < w - 7; i++) {
      const v = [1,2,3,4,3,1,2,4,6,4,2,3,4,5,3][i % 15];
      rect(c, x + 3 + i, y + 12 - v, 1, 2, '#8eeaff');
    }
  } else {
    for (let i = 0; i < w - 8; i += 2) {
      const h = 2 + ((i * 7 + x) % 6);
      rect(c, x + 4 + i, y + 12 - h, 1, h, style === 1 ? '#9de58c' : '#ffca79');
    }
  }
  rect(c, x + w - 2, y + 12, 1, 1, '#a0f28e');
  rect(c, x + Math.floor(w / 2) - 2, y + 15, 4, 2, C.deep);
}
function workstation(c, lead) {
  poly(c, [[5,19],[12,14],[66,14],[73,19],[73,33],[69,38],[9,38],[5,33]], C.ink);
  poly(c, [[6,18],[13,15],[65,15],[72,18],[69,28],[9,28]], lead ? '#f5e4cd' : '#e3d9cb');
  rect(c, 9, 28, 60, 7, '#9ca6af');
  rect(c, 10, 28, 58, 1, C.white);
  rect(c, 11, 31, 56, 1, '#6f7e8b');
  rect(c, 10, 35, 7, 4, C.deep); rect(c, 62, 35, 7, 4, C.deep);
  monitor(c, 15, 5, 19, '#15496d', 0);
  monitor(c, 35, 3, 28, lead ? '#145b6d' : '#184a5c', lead ? 2 : 1);
  rect(c, 26, 22, 23, 4, '#506274');
  rect(c, 28, 22, 19, 1, '#95a6b0');
  for (let x = 28; x < 47; x += 3) rect(c, x, 24, 2, 1, '#b6cbd5');
  rect(c, 50, 22, 3, 4, '#718799');
  box(c, 60, 22, 5, 5, lead ? '#cd955f' : '#77b6c6', '#433f47', '#ffd7a7');
  rect(c, 15, 22, 5, 4, '#faf1e0');
  rect(c, 16, 22, 3, 1, '#6d503c');
  rect(c, 20, 23, 1, 2, '#faf1e0');
  if (lead) light(c, 33, 30, 12);
}
function chair(c) {
  box(c, 3, 10, 14, 8, '#354f6d', '#212f47', '#7797b4');
  box(c, 4, 2, 12, 10, '#42658d', '#293e5b', '#a2b9ce');
  rect(c, 2, 10, 2, 6, '#8192a6'); rect(c, 16, 10, 2, 6, '#8192a6');
  rect(c, 8, 18, 4, 3, C.ink); rect(c, 4, 20, 12, 2, '#1f2b3b');
}
function sofa(c) {
  box(c, 4, 12, 95, 25, '#284260', '#26364e', '#94afcb');
  for (let i = 0; i < 3; i++) {
    box(c, 10+i*27, 17, 27, 16, '#436d9e', '#2e4f77', '#88aacf');
    box(c, 10+i*27, 5, 27, 16, '#3d608a', '#29486e', '#92b2cf');
  }
  box(c, 4, 12, 7, 23, '#5c7fa5', '#213653', '#92b2cf');
  box(c, 92, 12, 7, 23, '#5c7fa5', '#213653', '#92b2cf');
  rect(c, 7, 37, 5, 3, C.ink); rect(c, 89, 37, 5, 3, C.ink);
}
function table(c) {
  box(c, 3, 4, 52, 17, '#eadaca', '#b9ac9d', C.white);
  rect(c, 7, 20, 5, 7, C.deep); rect(c, 46, 20, 5, 7, C.deep);
  box(c, 12, 7, 12, 8, '#ba7750', '#7e534d', '#edab73');
  rect(c, 13, 12, 10, 1, '#fff0d6');
  box(c, 33, 8, 6, 6, '#eae9e0', '#a09587', '#fff8e6');
  rect(c, 34, 9, 3, 2, '#93624a');
  rect(c, 39, 10, 2, 2, '#fff8ea');
}
function foliage(c, x, y, variant = 0) {
  const paths = [
    [[0,15],[-5,9],[-13,7],[-11,3],[-3,4],[1,11]],
    [[-1,15],[-3,7],[-9,0],[-6,-4],[-1,0],[2,10]],
    [[0,16],[0,5],[4,-6],[8,-8],[10,-5],[7,3],[3,13]],
    [[0,15],[4,8],[11,2],[15,4],[13,8],[7,11]],
    [[1,17],[5,13],[13,11],[14,15],[10,17],[3,19]],
  ];
  for (const [i, points] of paths.entries()) {
    const moved = points.map(([px, py]) => [x + px, y + py]);
    poly(c, moved, C.leaf0);
    poly(c, moved.map(([px, py]) => [Math.round(x + (px-x)*.81), Math.round(y+7+(py-y-7)*.81)]), (i+variant)%3 === 0 ? C.leaf3 : C.leaf2);
    rect(c, x + (i-2)*3, y + 8 + (i%2)*3, 4, 1, C.leaf1);
  }
  rect(c, x - 1, y + 12, 2, 9, '#5b7737');
}
function planter(c, long) {
  const w = long ? 67 : 23;
  box(c, 4, 21, w, 17, C.cream, '#aa9b90', C.white);
  rect(c, 6, 23, w - 4, 6, '#47372f');
  if (long) {
    for (const [i, x] of [18, 36, 55].entries()) foliage(c, x, 7 + (i%2)*2, i);
    light(c, 29, 32, 14);
  } else {
    foliage(c, 15, 9);
    rect(c, 8, 33, 15, 1, '#d5c3b0');
  }
}
function rack(c, variant) {
  box(c, 4, 4, 31, 52, '#a6b5c1', '#52637d', '#d9dbd9');
  rect(c, 7, 14, 24, 38, '#243143');
  for (let y = 16; y < 49; y += 7) {
    rect(c, 8, y, 22, 5, '#101b2c');
    rect(c, 9, y, 20, 1, '#43536d');
    for (let x = 12; x < 28; x += 3) rect(c, x, y+2, 2, 1, (x+y+variant)%4 ? '#9fc469' : C.amber);
  }
  rect(c, 9, 7, 18, 3, '#7b8da1');
}
function cabinet(c) {
  box(c, 3, 4, 30, 47, '#e5d9ca', '#b0a29b', C.white);
  rect(c, 6, 10, 24, 37, '#c5b5a8');
  rect(c, 17, 9, 1, 39, '#8b807c');
  for (let y = 13; y < 23; y += 3) {
    rect(c, 8, y, 6, 1, '#596676'); rect(c, 21, y, 6, 1, '#596676');
  }
  rect(c, 13, 29, 2, 4, '#505c68'); rect(c, 20, 29, 2, 4, '#505c68');
}
function mainDesk(c) {
  poly(c, [[7,31],[24,20],[65,13],[177,13],[218,20],[235,31],[230,46],[187,38],[55,38],[12,46]], C.ink);
  poly(c, [[8,28],[25,17],[65,10],[177,10],[217,17],[234,28],[229,40],[187,32],[55,32],[13,40]], '#d3c3b4');
  poly(c, [[9,27],[26,16],[66,9],[176,9],[216,16],[232,27],[232,30],[215,20],[176,13],[66,13],[27,20],[10,31]], C.white);
  rect(c, 90, 17, 62, 10, '#756a68'); rect(c, 92, 18, 58, 7, '#405569');
  for (let x = 98; x < 149; x += 5) rect(c, x, 21, 2, 2, x % 3 ? C.cyan : C.amber);
  light(c, 113, 31, 16);
}
export function createControlRoomArt(scene) {
  texture(scene, 'lcc-shell', 640, 432, room);
  texture(scene, 'lcc-station', 78, 44, c => workstation(c, false));
  texture(scene, 'lcc-lead-station', 78, 44, c => workstation(c, true));
  texture(scene, 'lcc-main-desk', 242, 50, mainDesk);
  texture(scene, 'lcc-chair', 20, 24, chair);
  texture(scene, 'lcc-sofa', 104, 43, sofa);
  texture(scene, 'lcc-table', 58, 29, table);
  texture(scene, 'lcc-plant', 31, 41, c => planter(c, false));
  texture(scene, 'lcc-trough', 75, 41, c => planter(c, true));
  for (let i = 0; i < 3; i++) texture(scene, 'lcc-rack-' + i, 39, 59, c => rack(c, i));
  texture(scene, 'lcc-cabinet', 36, 55, cabinet);
}
