import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
for (const [cal, lang] of [["roc","zh_TW"],["roc","en"],["japanese","zh_TW"],["chinese","zh_TW"]]) {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.goto("http://localhost:4321/");
  await p.evaluate(([c, l]) => localStorage.setItem("tg.settings", JSON.stringify({
    schemaVersion: 1, guided: true, lang: l, secondCal: c,
    cards: { calendar: true, todos: true, note: true, clock: true } })), [cal, lang]);
  await p.reload();
  await p.locator(".cue").click();
  await p.locator('.card[aria-label="日曆"], .card[aria-label="Calendar"]').first().locator(".expand").click();
  await p.waitForTimeout(800);
  const title = (await p.locator(".cal-when").textContent() ?? "").trim().replace(/\s+/g, " ");
  const cell = (await p.locator(".cal-cell").nth(10).textContent() ?? "").trim();
  console.log(`${cal}/${lang}`.padEnd(16), "標題:", title.padEnd(24), "格子:", JSON.stringify(cell));
  await p.close();
}
await b.close();
