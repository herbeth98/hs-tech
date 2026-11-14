// Gera src/renderer/assets/icon.png (256x256) sem dependências: hexágono com gradiente e um raio.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 256;
const px = Buffer.alloc(S * S * 4);

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const hex = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  hex.push([128 + 118 * Math.cos(a), 128 + 118 * Math.sin(a)]);
}
const inner = hex.map(([x, y]) => [128 + (x - 128) * 0.86, 128 + (y - 128) * 0.86]);
const bolt = [[146, 38], [78, 140], [122, 140], [104, 218], [180, 108], [134, 108], [158, 38]];

const SS = 4;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = x + (sx + 0.5) / SS; const fy = y + (sy + 0.5) / SS;
      if (!inPoly(fx, fy, hex)) continue;
      const t = (fx + fy) / (2 * S);
      // Cores do design system: verde Nuxt (green-400 -> green-500) sobre navy (neutral-950)
      let cr = 0, cg = 220 - 27 * t, cb = 130 - 24 * t;
      if (inPoly(fx, fy, inner)) { cr = 2; cg = 4; cb = 32; }
      if (inPoly(fx, fy, bolt)) { cr = 0; cg = 220 - 27 * t; cb = 130 - 24 * t; }
      r += cr; g += cg; b += cb; a += 255;
    }
    const n = SS * SS;
    const i = (y * S + x) * 4;
    const cov = a / n;
    px[i] = cov ? (r / (a / 255)) : 0; px[i + 1] = cov ? (g / (a / 255)) : 0; px[i + 2] = cov ? (b / (a / 255)) : 0; px[i + 3] = cov;
  }
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) { raw[y * (S * 4 + 1)] = 0; px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('icon.png gerado:', out, png.length, 'bytes');
