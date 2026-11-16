// Hand-pixelled symbols. The same integer-grid renderer is used by the
// collection, notification and share image, so each emblem stays crisp.
const glyphs = {
  mission: ['...##...', '...##...', '.######.', '.#....#.', '##.##.##', '##.##.##', '.#....#.', '.######.', '...##...', '...##...'],
  rocket:  ['...##...', '..####..', '..#..#..', '..#..#..', '..####..', '.######.', '########', '##.##.##', '...##...', '..#..#..'],
  payload: ['........', '.######.', '##.##.##', '#..##..#', '########', '#......#', '###..###', '#......#', '########', '........'],
  review:  ['..####..', '.######.', '##....##', '##....##', '#....#.#', '#.#.#..#', '#..#...#', '##....##', '.######.', '........'],
  mobility:['........', '...##...', '...#....', '..####..', '..#..#..', '.######.', '########', '##.##.##', '.#....#.', '........'],
  science: ['..####..', '...##...', '...##...', '..#..#..', '..#..#..', '.#....#.', '.#.##.#.', '#.####.#', '########', '........'],
  power:   ['....###.', '...###..', '..###...', '.####...', '.######.', '...###..', '...##...', '..##....', '..#.....', '........'],
  comms:   ['......#.', '.#..#..#', '.##..#..', '.###.#..', '..###...', '...##...', '...##...', '..#..#..', '.######.', '........'],
  launch:  ['..##....', '.####..#', '##..#...', '##..#...', '.####...', '..##....', '.#..#..#', '##..##..', '...#....', '#.......'],
  rover:   ['......#.', '.#......', '.##.....', '..#.....', '..#####.', '########', '##.##.##', '.#....#.', '........', '######..'],
  lunarGold: ['...###..', '..###...', '.###....', '####..#.', '####.###', '####..#.', '.###....', '.####...', '..#####.', '...###..'],
  roverGold: ['.#....#.', '..####..', '.######.', '##.##.##', '########', '##....##', '.##..##.', '.##..##.', '########', '........'],
};
const palettes = {
  teal: ['#0a323f', '#43d4cb', '#baffea', '#23768d'],
  purple: ['#2b1d4e', '#ae8cf5', '#f4d8ff', '#6347aa'],
  blue: ['#142f63', '#63adff', '#d7f5ff', '#305eac'],
  gold: ['#482a24', '#ffbd48', '#fff4a8', '#a85a2e'],
  locked: ['#122238', '#415773', '#71839a', '#31405a'],
};
const rows = [
  [2, 8, 7], [3, 7, 9], [4, 6, 11], [5, 5, 13], [6, 4, 15], [7, 3, 17],
  [8, 3, 17], [9, 2, 19], [10, 2, 19], [11, 2, 19], [12, 2, 19],
  [13, 2, 19], [14, 2, 19], [15, 3, 17], [16, 3, 17], [17, 4, 15],
  [18, 5, 13], [19, 6, 11], [20, 7, 9], [21, 9, 5],
];
export function drawMedal(ctx, medal, x, y, scale, unlocked = true) {
  const [dark, mid, light, shade] = palettes[unlocked ? medal.color : 'locked'];
  const box = (color, left, top, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + left * scale, y + top * scale, w * scale, h * scale);
  };
  for (const [row, left, width] of rows) box('#060c1a', left + 1, row + 2, width);
  for (const [row, left, width] of rows) {
    box(row < 15 ? mid : shade, left, row, width);
    if (row >= 5 && row <= 18) box(dark, left + 2, row, width - 4);
  }
  box(light, 8, 2, 5);
  box(light, 5, 5, 2);
  box(shade, 4, 17, 2);
  box(shade, 17, 15, 2);
  for (const [row, line] of glyphs[medal.id].entries()) {
    for (const [col, pixel] of [...line].entries()) if (pixel === '#') box(row < 6 ? light : mid, col + 8, row + 7);
  }
  if (medal.color === 'gold' && unlocked) {
    for (const [sx, sy] of [[2, 4], [21, 17]]) {
      box(light, sx, sy - 1, 1, 3);
      box(light, sx - 1, sy, 3);
    }
  }
}

export function medalCanvas(medal, unlocked) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 24;
  canvas.setAttribute('aria-hidden', 'true');
  drawMedal(canvas.getContext('2d'), medal, 0, 0, 1, unlocked);
  return canvas;
}
