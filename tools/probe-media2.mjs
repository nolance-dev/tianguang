import { chromium } from "@playwright/test";
const SITES = [
  { name: "bilibili", url: "https://www.bilibili.com/video/BV1xx411c7mD/",
    sel: [".bpx-player-ctrl-next", ".bpx-player-ctrl-prev", ".squirtle-video-next", "video", ".bpx-player-ctrl-play"] },
  { name: "apple", url: "https://music.apple.com/us/album/abbey-road-2019-mix/1474815798",
    sel: ["#playback-controls-next", "#playback-controls-previous", ".web-chrome-playback-controls__playback-btn",
          "amp-playback-controls-item", "audio", "video"] },
];
const b = await chromium.launch({ channel: "msedge" });
for (const s of SITES) {
  const ctx = await b.newContext({ locale: "en-US" });
  const page = await ctx.newPage();
  const out = { site: s.name, found: {} };
  try {
    await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(12000);
    for (const q of s.sel) out.found[q] = await page.locator(q).count();
    out.ids = await page.evaluate(() =>
      [...document.querySelectorAll("button,[role=button]")]
        .filter((e) => /next|prev|play|pause/i.test(
          (e.id || "") + " " + (e.className && e.className.baseVal !== undefined ? "" : e.className || "") + " " + (e.getAttribute("aria-label") || "")))
        .slice(0, 10)
        .map((e) => ({ id: e.id || null, cls: typeof e.className === "string" ? e.className.slice(0, 60) : null,
                       aria: e.getAttribute("aria-label") })));
  } catch (e) { out.error = String(e).split(String.fromCharCode(10))[0].slice(0, 100); }
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
}
await b.close();
