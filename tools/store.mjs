import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

/**
 * 上架素材。
 *
 * 宣傳圖的底不是另外挑的顏色 —— 它是產品自己那一刻的背景，把 mesh.ts 的
 * meshCss 原樣搬過來，色帶取「破曉」那一段（天光就是這個名字的意思）。
 * 圖示直接吃 assets/logo-128.svg，跟分頁上那顆是同一份幾何。
 */

const DAWN = ["#EDB86E", "#B26C3C", "#33437A", "#121933", "#27325C", "#4E4059"];
const mesh = (c) =>
  [
    `radial-gradient(120% 92% at 18% 112%, ${c[0]} 0%, ${c[1]} 24%, transparent 63%)`,
    `radial-gradient(88% 72% at 82% -6%, ${c[2]} 0%, transparent 62%)`,
    `linear-gradient(180deg, ${c[3]} 0%, ${c[4]} 52%, ${c[5]} 100%)`,
  ].join(", ");

const MARK = readFileSync("assets/logo-128.svg", "utf8");

/** 一張宣傳圖。mark 是圖示邊長，stack 決定直排還是橫排 */
function tile({ w, h, mark, stack, name, latin, tagline }) {
  return `<style>
  @import url("https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;500&display=swap");
  html, body { margin: 0; width: ${w}px; height: ${h}px; }
  body {
    background: ${mesh(DAWN)};
    display: flex; flex-direction: ${stack ? "column" : "row"};
    align-items: center; justify-content: center;
    gap: ${Math.round(mark * 0.28)}px;
    color: #F4EEE2;
  }
  .mark { width: ${mark}px; height: ${mark}px; flex: none;
          filter: drop-shadow(0 ${mark * 0.03}px ${mark * 0.08}px rgba(0,0,0,.45)); }
  .mark svg { width: 100%; height: 100%; display: block; }
  .words { text-align: ${stack ? "center" : "left"}; }
  .cjk { font-family: "Noto Serif TC", serif; font-weight: 500;
         font-size: ${Math.round(mark * 0.52)}px; letter-spacing: .22em;
         margin: 0 0 ${Math.round(mark * 0.07)}px; text-indent: .22em; }
  .lat { font-family: "Times New Roman", serif; font-size: ${Math.round(mark * 0.26)}px;
         letter-spacing: .3em; opacity: .82; margin: 0; text-indent: .3em; }
  .tag { font-family: "Noto Serif TC", serif; font-size: ${Math.round(mark * 0.17)}px;
         letter-spacing: .12em; opacity: .72; margin: ${Math.round(mark * 0.16)}px 0 0;
         text-indent: .12em; }
</style>
<div class="mark">${MARK}</div>
${
  name
    ? `<div class="words">
  <p class="cjk">${name}</p>
  <p class="lat">${latin}</p>
  ${tagline ? `<p class="tag">${tagline}</p>` : ""}
</div>`
    : ""
}`;
}

const SHOTS = {
  // 商店的方形圖：只有標記，字在這個尺寸讀不出來。
  // 標記不做滿版 —— 圓形拍到 300 見方，四角是瀏覽器的白底，
  // Partner Center 不去背，白角就這樣印在商店卡片上。
  "logo-300.png": { w: 300, h: 300, mark: 232, stack: true },
  "tile-440x280.png": {
    w: 440,
    h: 280,
    mark: 128,
    stack: false,
    name: "天光",
    latin: "AUBADE",
  },
  "marquee-1400x560.png": {
    w: 1400,
    h: 560,
    mark: 300,
    stack: false,
    name: "天光",
    latin: "AUBADE",
    tagline: "以十二時辰為底的新分頁",
  },
};

const b = await chromium.launch({ channel: "msedge" });
mkdirSync("assets/store", { recursive: true });
for (const [file, spec] of Object.entries(SHOTS)) {
  const page = await b.newPage({
    viewport: { width: spec.w, height: spec.h },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    spec.mark === spec.w && !spec.name
      ? `<style>html,body{margin:0}svg{display:block;width:${spec.w}px;height:${spec.h}px}</style>${MARK}`
      : tile(spec),
  );
  // 等字體真的下載完再拍，不然拍到的是 fallback
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `assets/store/${file}` });
  await page.close();
  console.log(file);
}
await b.close();
