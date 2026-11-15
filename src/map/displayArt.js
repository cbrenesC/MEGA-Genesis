const land = [
  [[-151,61],[-133,70],[-105,75],[-86,65],[-63,60],[-53,48],[-72,43],[-80,26],[-97,20],[-116,31],[-126,46]],
  [[-82,10],[-70,12],[-59,9],[-46,-2],[-36,-9],[-51,-26],[-57,-38],[-70,-56],[-77,-38],[-72,-17]],
  [[-98,22],[-87,20],[-82,9],[-77,8],[-82,13],[-89,15]],
  [[-73,74],[-53,82],[-24,77],[-32,63],[-53,59],[-67,65]],
  [[-11,36],[-10,53],[4,58],[17,67],[33,62],[52,46],[40,35],[29,36],[16,43],[5,38]],
  [[-17,15],[-11,32],[14,36],[32,31],[48,12],[39,4],[36,-16],[29,-32],[18,-35],[10,-23],[9,-8],[-2,5]],
  [[29,44],[56,64],[93,72],[117,65],[137,46],[109,16],[102,5],[85,23],[74,7],[58,24],[43,28]],
];
function inside(x, y, points) {
  let odd = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}
function hash(x, y) {
  const n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  return ((Math.imul(n ^ (n >>> 13), 1274126177) >>> 16) & 255) / 255;
}
function globe(ctx, cx, cy, r, earth) {
  const rad = Math.PI / 180, tilt = 9 * rad;
  const noise = (x,y) => hash(x,y) * .27 + hash(x/3,y/3) * .38 + hash(x/7,y/7) * .35;
  for (let y = Math.max(0, cy - r - 2); y <= Math.min(ctx.canvas.height - 1, cy + r + 2); y++) {
    for (let x = cx - r - 2; x <= cx + r + 2; x++) {
      const nx = (x - cx) / r, ny = (cy - y) / r;
      const d = nx * nx + ny * ny;
      if (d >= 1) {
        if (earth && d < (1 + 1.4 / r) ** 2) { ctx.fillStyle = '#4bb9ff9c'; ctx.fillRect(x,y,1,1); }
        continue;
      }
      const z = Math.sqrt(1 - d);
      const lat = Math.asin(ny * Math.cos(tilt) + z * Math.sin(tilt)) / rad;
      const lon = Math.atan2(nx, z * Math.cos(tilt) - ny * Math.sin(tilt)) / rad - 69;
      let color;
      const detail = noise(x,y);
      if (earth) {
        const terrain = inside(lon + (detail - .5) * 6, lat + (detail - .5) * 6, land[0])
          || land.slice(1).some(p => inside(lon + (detail - .5) * 6, lat + (detail - .5) * 6, p));
        const glow = Math.max(0, z * .7 + ny * .4 - nx * .22);
        if (Math.abs(lat) > 64 + detail * 13 || (detail > .61 && hash(x/14,y/5) > .38)) color = glow > .62 ? '#d3eafd' : '#8cb3d5';
        else if (terrain) color = glow > .55 ? (detail > .60 ? '#c4ac71' : '#75a964') : '#4f815c';
        else color = glow > .64 ? (detail > .62 ? '#368fd5' : '#2377c0') : (glow > .33 ? '#195ba0' : '#193b73');
        if (d > .963) color = '#86cbf5';
      } else {
        color = detail > .56 ? '#c2cad5' : detail > .4 ? '#9facc3' : '#8293ab';
        for (const [a,b,s] of [[-.24,.32,.29],[.32,-.1,.22],[.05,-.45,.21]]) {
          const dist = Math.hypot(nx - a, ny - b);
          if (dist < s) color = dist < s * .75 ? '#6f7d95' : '#d0d6e0';
        }
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}
export function drawOrbitBoard(ctx) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#0b203b'; ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) {
    ctx.fillStyle = y % 4 ? '#25507423' : '#09193165';
    ctx.fillRect(0,y,w,1);
  }
  for (let i = 0; i < 100; i++) {
    ctx.fillStyle = i % 6 ? '#3678a0' : '#b9e1e6';
    ctx.fillRect((31+i*139)%w, (11+i*71)%h, 1, 1);
  }
  const pixels = (x,y,color) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x),Math.round(y),2,1); };
  for (let i = 0; i < 330; i++) {
    const a = i * Math.PI * 2 / 330;
    pixels(210 + Math.cos(a)*140, 61 + Math.sin(a)*24 - Math.cos(a)*14, i%5 ? '#40bfc7' : '#95e4de');
  }
  globe(ctx, 91, 93, 64, true);
  globe(ctx, 318, 35, 14, false);
  for (const x of [15, w - 20]) {
    ctx.fillStyle = '#87c3cc'; ctx.fillRect(x, h-13, 6, 1); ctx.fillRect(x, h-17, 1, 5);
  }
}
