import { chromium } from "@playwright/test";

const SITES = [
  { name: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    sel: [".ytp-next-button", ".ytp-prev-button", "video"] },
  { name: "music.youtube", url: "https://music.youtube.com/",
    sel: [".next-button", ".previous-button", "tp-yt-paper-icon-button.next-button", "video", "audio"] },
  { name: "soundcloud", url: "https://soundcloud.com/discover",
    sel: [".skipControl__next", ".skipControl__previous", ".playControls__next", ".playControls__prev", "audio", "video"] },
  { name: "bilibili", url: "https://www.bilibili.com/video/BV1GJ411x7h7",
    sel: [".bpx-player-ctrl-next", ".bpx-player-ctrl-prev", ".squirtle-video-next", "video"] },
  { name: "spotify", url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    sel: ['[data-testid="control-button-skip-forward"]', '[data-testid="control-button-skip-back"]',
          '[data-testid="control-button-playpause"]', "video", "audio"] },
  { name: "apple", url: "https://music.apple.com/us/album/1440857781",
    sel: [".playback-controls__button--next", ".playback-controls__button--previous",
          'button[aria-label*="Next"]', 'button[aria-label*="Play"]', "audio", "video"] },
];

const b = await chromium.launch({ channel: "msedge" });
for (const s of SITES) {
  const ctx = await b.newContext({ locale: "en-US" });
  const page = await ctx.newPage();
  const out = { site: s.name, loaded: false, found: {}, aria: [] };
  try {
    await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(6000);
    out.loaded = true;
    for (const q of s.sel) {
      out.found[q] = await page.locator(q).count();
    }
    // 順便撈出所有 aria-label 含 next/prev 的按鈕，當通用退路的依據
    out.aria = await page.evaluate(() =>
      [...document.querySelectorAll("button, [role=button]")]
        .map((e) => e.getAttribute("aria-label") || e.getAttribute("title") || "")
        .filter((l) => /next|previous|prev|skip|下一|上一/i.test(l))
        .slice(0, 8),
    );
  } catch (e) {
    out.error = String(e).split(String.fromCharCode(10))[0].slice(0, 120);
  }
  console.log(JSON.stringify(out));
  await ctx.close();
}
await b.close();
