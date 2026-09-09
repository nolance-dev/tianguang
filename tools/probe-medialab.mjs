/**
 * 尺寸實驗室的體檢。
 *
 * 開發伺服器上那一頁畫得出來不代表畫對了 —— 十二格裡少一格、某一格的卡片
 * 高度算成 0、控制台在噴錯，人眼掃過去都不一定看得出來。這支去問實際量到的
 * 尺寸，順便把整頁拍下來。
 *
 * 用法：npm run lab 開著，然後 node tools/probe-medialab.mjs
 */
import { chromium } from "playwright";

const URL = process.env.LAB_URL ?? "http://localhost:5174/media-lab.html";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".lab-cell .media", { timeout: 10000 });

const cells = await page.$$eval(".lab-cell", (nodes) =>
  nodes.map((n) => {
    const card = n.querySelector(".card");
    const r = card.getBoundingClientRect();
    const rows = n.querySelectorAll(".media-list li");
    const visible = [...rows].filter(
      (li) => getComputedStyle(li).display !== "none",
    ).length;
    const media = n.querySelector(".media");
    const list = n.querySelector(".media-list");
    /*
     * 溢出要量清單的外框，不是 media.scrollHeight。
     *
     * .media 的兩團光暈是絕對定位的 ::before / ::after，故意擺在卡片外面，
     * 而絕對定位的子孫算進 scrollHeight —— 拿那個當訊號的話十二格全部誤報。
     * 清單是 flex:1，它自己會捲，所以它的下緣本來就該落在卡片裡面。
     */
    const overflow = list
      ? list.getBoundingClientRect().bottom > media.getBoundingClientRect().bottom + 1
      : false;
    return {
      size: n.querySelector("figcaption b").textContent.trim(),
      w: Math.round(r.width),
      h: Math.round(r.height),
      visibleRows: visible,
      overflow,
      // 看得見的才算 —— w1 是用 display:none 把上下首收起來的
      steps: [...n.querySelectorAll(".media-list li:first-child .step")].filter(
        (b) => getComputedStyle(b).display !== "none",
      ).length,
    };
  }),
);

console.table(cells);

/*
 * 捲得動嗎。
 *
 * styles.css 是給新分頁那一頁寫的：body { height: 100%; overflow: hidden }
 * —— 那一頁的捲動在每一屏自己身上。這一頁整個匯入那份樣式，所以第一屏以下
 * 全部被切掉：十二格排好了、量得到、就是看不到也捲不到。整頁截圖那時候只
 * 畫得出三格，訊號一直在，是我讀錯了。
 */
const scroll = await page.evaluate(async () => {
  const before = window.scrollY;
  window.scrollTo(0, document.documentElement.scrollHeight);
  await new Promise((r) => requestAnimationFrame(r));
  const after = window.scrollY;
  window.scrollTo(0, before);
  return {
    docHeight: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
    moved: after,
    bodyOverflow: getComputedStyle(document.body).overflowY,
  };
});
const needsScroll = scroll.docHeight > scroll.viewport + 1;
if (needsScroll && scroll.moved === 0)
  console.log(
    `FAIL: 頁高 ${scroll.docHeight}px、視窗 ${scroll.viewport}px，但捲不動` +
      `（body overflow-y: ${scroll.bodyOverflow}）`,
  );
else console.log(`scroll ok: ${scroll.docHeight}px, moved to ${scroll.moved}`);

/*
 * 一格拍一張，不拍整頁。
 *
 * 整頁那張在 1440×6104 只畫得出前三格，後面全是空的 —— 十二張卡各帶兩團
 * blur(56px) 的光暈，超過某個高度之後 Chromium 的合成就交不出來了。分開拍
 * 每一張都在視窗尺寸內，而且要看某一種尺寸本來就該單獨看。
 */
const dir = process.env.LAB_SHOTS ?? "media-lab-shots";
await import("node:fs/promises").then((fs) =>
  fs.mkdir(dir, { recursive: true }),
);
const nodes = await page.$$(".lab-cell");
for (let i = 0; i < nodes.length; i++) {
  await nodes[i].scrollIntoViewIfNeeded();
  const name = cells[i].size.replace(/\s/g, "");
  await nodes[i].screenshot({ path: `${dir}/${name}.png` });
}
console.log(`shots: ${dir}/ (${nodes.length})`);

if (cells.length !== 12) console.log(`FAIL: 應該十二格，量到 ${cells.length}`);
for (const c of cells) {
  if (c.h < 100) console.log(`FAIL ${c.size}: 卡片高度只有 ${c.h}px`);
  if (c.overflow) console.log(`FAIL ${c.size}: 內容溢出卡片`);
}
if (errors.length) console.log("console errors:", errors);
else console.log("no console errors");

await browser.close();
