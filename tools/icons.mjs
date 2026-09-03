import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

/**
 * 圖示產生器。
 *
 * 一份幾何，四個尺寸 —— 但不是把 128 縮下去。16 像素的分頁圖示縮出來是一團
 * 深色的糊：金色的環只剩一個畫素寬，頂上那顆日也沒了。所以小尺寸自己一套
 * 參數（環更粗、日更大、金色更亮），這是視覺尺寸調整，不是同一張圖的縮圖。
 *
 * 顏色直接取自 src/lib/mesh.ts 的破曉那一段：#121933 是夜，#EDB86E 是天光。
 * 圖示用的是產品自己的顏色，不是另外挑的。
 */

const NIGHT = "#121933";
const DEEP = "#0A0E1E";

/** 環頂端留一個缺口，日就坐在那個缺口上 —— 日出的那一刻 */
function arc(cx, cy, r, fromDeg, toDeg) {
  const p = (d) => {
    const a = ((d - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x1, y1] = p(fromDeg);
  const [x2, y2] = p(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function svg({ ring, sun, gold, gap, r = 40 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NIGHT}"/>
      <stop offset="1" stop-color="${DEEP}"/>
    </linearGradient>
  </defs>
  <circle cx="64" cy="64" r="64" fill="url(#g)"/>
  <path d="${arc(64, 64, r, gap / 2, 360 - gap / 2)}" fill="none" stroke="${gold}"
        stroke-width="${ring}" stroke-linecap="round"/>
  <circle cx="64" cy="${64 - r}" r="${sun}" fill="${gold}"/>
</svg>`;
}

// 大尺寸看得到細節，小尺寸要的是還讀得出來
const SPEC = {
  128: { ring: 7, sun: 9.5, gold: "#EDB86E", gap: 34 },
  48: { ring: 8.5, sun: 11, gold: "#EFC078", gap: 38 },
  32: { ring: 11, sun: 14, gold: "#F3C983", gap: 46 },
  16: { ring: 14, sun: 17, gold: "#F8D28E", gap: 54, r: 38 },
};

const b = await chromium.launch({ channel: "msedge" });
mkdirSync("assets", { recursive: true });
for (const [size, spec] of Object.entries(SPEC)) {
  const markup = svg(spec);
  writeFileSync(`assets/logo-${size}.svg`, markup + "\n");
  const page = await b.newPage({
    viewport: { width: Number(size), height: Number(size) },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:100%;height:100%}</style>${markup}`,
  );
  await page.screenshot({
    path: `public/icons/icon${size}.png`,
    omitBackground: true,
  });
  await page.close();
  console.log("icon" + size + ".png");
}
await b.close();
