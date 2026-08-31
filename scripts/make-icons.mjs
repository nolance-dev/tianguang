/**
 * 產生擴充功能圖示。
 *
 * 不裝繪圖套件 —— 圖案是一個圓底加一圈金環加頂端一根刻，每個像素都算得出來，
 * 而 PNG 編碼用內建的 zlib 就夠。少一個相依，也不用把二進位檔簽進版本庫。
 *
 * 執行：npm run icons
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const SIZES = [16, 32, 48, 128];
const SS = 4; // 超取樣倍率，邊緣才不會有鋸齒

// 夜半那組錨點色，跟 mesh.ts 的 hour 0 對得上
const BG_TOP = [10, 15, 28];
const BG_BOT = [27, 36, 64];
const GOLD = [227, 182, 103];

/** 回傳 [r,g,b,a]，座標是以圓心為原點、半徑 1 的單位圓 */
function shade(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1) return [0, 0, 0, 0];

  const t = (y + 1) / 2;
  const bg = [0, 1, 2].map((i) => BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t);

  // 金環
  const onRing = Math.abs(r - 0.62) < 0.055;

  // 頂端的刻。angle 從正上方起算，取窄窄一楔。
  const angle = Math.atan2(x, -y); // 正上方為 0
  const onMark = r > 0.72 && r < 0.93 && Math.abs(angle) < 0.13;

  return onRing || onMark ? [...GOLD, 255] : [...bg, 255];
}

function crcTable() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}
const CRC = crcTable();

function crc32(buf) {
  let c = ~0;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  // 每個像素取 SS×SS 個樣本再平均
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let py = 0; py < size; py++) {
    raw[p++] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const s = shade(x, y);
          // 先乘上 alpha 再平均，透明邊緣才不會混進黑色
          const a = s[3] / 255;
          acc[0] += s[0] * a;
          acc[1] += s[1] * a;
          acc[2] += s[2] * a;
          acc[3] += s[3];
        }
      }
      const n = SS * SS;
      const alpha = acc[3] / n;
      const norm = alpha > 0 ? 255 / alpha : 0;
      raw[p++] = Math.round((acc[0] / n) * norm);
      raw[p++] = Math.round((acc[1] / n) * norm);
      raw[p++] = Math.round((acc[2] / n) * norm);
      raw[p++] = Math.round(alpha);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT, `icon${size}.png`);
  const buf = png(size);
  writeFileSync(file, buf);
  console.log(`icon${size}.png  ${buf.length} bytes`);
}
