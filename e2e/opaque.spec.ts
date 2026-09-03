import { expect, test } from "@playwright/test";

/**
 * 整屏畫面不能透。
 *
 * .full 的底是 --veil，而 --veil 是 0.86（暗）／0.90（亮）—— 單獨用的話
 * 後面那一屏會透上來。白天幾乎看不出來，晚上就是整個工作區的卡片和時鐘
 * 鬼影疊在日曆底下。這條測的方式是「把後面藏起來，畫面應該一個像素都不變」。
 */
test("日曆整屏底下的工作區不會透上來", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({
        schemaVersion: 1,
        guided: true,
        lang: "zh_TW",
        cards: {
          calendar: true,
          todos: true,
          note: true,
          clock: true,
          quote: true,
        },
      }),
    ),
  );
  await page.reload();
  await page.locator(".cue").click();
  await page.locator('.card[aria-label="日曆"] .expand').click();
  const full = page.locator(".full");
  await expect(full).toBeVisible();
  // 進場動畫走完再拍，不然兩張差在透明度上
  await page.waitForTimeout(600);

  // 挑一塊面板裡本來就空白的地方 —— 有字的地方兩張本來就一樣
  const clip = { x: 60, y: 620, width: 200, height: 80 };
  const before = await page.screenshot({ clip });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>(".screen"))
      el.style.visibility = "hidden";
  });
  const after = await page.screenshot({ clip });
  expect(Buffer.compare(before, after), "後面藏起來之後畫面不該變").toBe(0);
});
