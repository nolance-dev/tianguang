import { expect, test } from "@playwright/test";

/**
 * 整屏畫面不能透。
 *
 * .full 的底是 --veil，而 --veil 是 0.86（暗）／0.90（亮）—— 單獨用的話
 * 後面那一屏會透上來。白天幾乎看不出來，晚上就是整個工作區的卡片和時鐘
 * 鬼影疊在日曆底下。當初的錯是把顏色寫在 background 的「圖層位置」上：
 * 那個位置只收 <image>，顏色會被解析成 none，於是面紗底下什麼都沒有。
 *
 * 這條原本的驗法是「把後面藏起來，截圖應該一個位元組都不變」。那是錯的驗法：
 * 半透明圖層疊在不透明底色上，Chromium 的合成會有 ±1 的抖動（量過：藍通道
 * 差 1，棋盤狀分佈，--solid 與 --veil 兩次完全相同）。--repeat-each=6 實測
 * 六次紅三次 —— 一半機率的紅燈跟沒有測試是同一回事。
 *
 * 現在直接量那個不變量本身：面紗底下必須有一層不透明的地板。Chromium 對
 * 完全不透明的顏色一律序列化成 rgb(...)，只要出現 rgba(...) 或 transparent
 * 就是地板不見了 —— 正是當初那個 bug 的形狀，而且沒有抖動可言。
 * 順帶把設定抽屜一起看住：它 1.1.0 才從玻璃改成純色，同一種錯會再犯一次。
 */

/** 完全不透明的顏色，Chromium 序列化成 rgb(...)；有 alpha 的是 rgba(...) */
const OPAQUE = /^rgb\([^a]/;
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
  // 進場動畫走完再量，不然量到的是動畫中途的透明度
  await page.waitForTimeout(600);

  const bg = (sel: string) =>
    page.locator(sel).evaluate((el) => getComputedStyle(el).backgroundColor);

  expect(await bg(".full"), "面紗底下要有一層不透明的地板").toMatch(OPAQUE);

  // 設定抽屜同一種錯：1.1.0 之前它是 var(--glass)，字會跟後面的時鐘疊在一起
  await page.keyboard.press("Escape");
  await page.locator(".gear").click();
  await expect(page.locator(".panel")).toBeVisible();
  expect(await bg(".panel"), "設定抽屜的底要是純色").toMatch(OPAQUE);
});
