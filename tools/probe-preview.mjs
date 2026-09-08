import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
for (const lang of ["en-US", "zh-TW"]) {
  const ctx = await b.newContext({ locale: lang });
  const page = await ctx.newPage();
  await page.goto("http://localhost:4321/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const out = await page.evaluate(() => {
    const txt = document.body.innerText;
    // 鍵名長這樣：小寫英數加底線，而且沒有空白
    const keys = (txt.match(/[a-z][a-z0-9]*_[a-z0-9_]+/g) ?? []).filter(
      (w) => !w.includes(" "),
    );
    return {
      rawKeys: [...new Set(keys)].slice(0, 8),
      greeting: document.querySelector(".hello, .greet, h1")?.textContent?.trim(),
      head: txt.split(String.fromCharCode(10)).slice(0, 6),
    };
  });
  console.log(lang, JSON.stringify(out));
  await ctx.close();
}
await b.close();
