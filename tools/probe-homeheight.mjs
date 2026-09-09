import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
const ctx = await b.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4321/", { waitUntil: "domcontentloaded" });
// 模擬使用者現在存著的舊版面：照片牆兩列高
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("tg.settings") ?? "{}");
  localStorage.setItem("tg.settings", JSON.stringify({
    ...raw, schemaVersion: 1, guided: true, lang: "zh_TW",
    home: { links: false, photos: true },
    homeDesk: [{ id: "photos", w: 2, h: 2 }],
    homePhotoWalls: [{ id: null, rotate: 0 }],
  }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const out = await page.evaluate(() => {
  const vh = window.innerHeight;
  return [...document.querySelectorAll(".core .card")].map((c) => {
    const r = c.getBoundingClientRect();
    return { cls: c.className.replace("card", "").trim(),
             h: Math.round(r.height), pctOfScreen: Math.round((r.height / vh) * 100),
             row: getComputedStyle(c).gridRow,
             bottom: Math.round(r.bottom), vh };
  });
});
console.log(JSON.stringify(out, null, 1));
await ctx.close();
await b.close();
