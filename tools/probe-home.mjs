import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4321/", { waitUntil: "domcontentloaded" });

// 主頁面：快速存取 + 照片牆都打開，工作區的照片牆放三張
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("tg.settings") ?? "{}");
  localStorage.setItem("tg.settings", JSON.stringify({
    ...raw, schemaVersion: 1, guided: true, lang: "zh_TW",
    home: { links: true, photos: true },
    cards: { todos: false, note: false, pomodoro: false, quote: false, links: false,
             photos: true, calendar: false, weather: false, media: false, clock: false },
    photoWalls: [{ id: null, rotate: 0 }, { id: null, rotate: 0 }, { id: null, rotate: 0 }],
    homePhotoWalls: [{ id: null, rotate: 0 }, { id: null, rotate: 0 }],
  }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const home = await page.evaluate(() => {
  const vh = window.innerHeight;
  const cards = [...document.querySelectorAll(".core .card")].map((c) => {
    const r = c.getBoundingClientRect();
    return {
      cls: c.className.replace("card", "").trim(),
      w: Math.round(r.width), h: Math.round(r.height),
      row: getComputedStyle(c).gridRow, col: getComputedStyle(c).gridColumn,
      pctOfScreen: Math.round((r.height / vh) * 100),
    };
  });
  const grid = document.querySelector(".core .grid, .core [class*=grid]");
  return { vh, cards, rows: grid ? getComputedStyle(grid).gridAutoRows : null,
           bottomOfLast: cards.length ? Math.round(document.querySelector(".core").getBoundingClientRect().bottom) : null };
});
console.log("HOME " + JSON.stringify(home, null, 1));

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1200);
const desk = await page.evaluate(() => ({
  photocardsTotal: document.querySelectorAll(".photocard").length,
  photocardsHome: document.querySelectorAll(".core .photocard").length,
}));
console.log("DESK " + JSON.stringify(desk));
await ctx.close();
await b.close();
