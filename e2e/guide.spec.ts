import { expect, test, type Page } from "@playwright/test";

/**
 * 首次引導。
 *
 * 三步，裝好第一次開新分頁時出現一次，看完寫進設定。第二步會真的把畫面切到
 * 第二屏 —— 那一屏平常收在畫面底下，不主動帶一次多數人不會知道它存在。
 */

/*
 * 按鈕用 class 選，不用文字。
 *
 * 這份 build 是用 http 服務的，沒有 chrome.i18n —— 正式版的 t() 找不到來源時
 * 直接回鍵名，所以畫面上是 gd_next、gd_skip，不是「下一步」「略過」。
 * 拿翻譯後的字串去選永遠選不到。
 */
const fresh = async (page: Page) => {
  /*
   * 不要用 addInitScript 清 localStorage —— 它每一次導覽都會再跑一遍，
   * 包含 reload。那樣「重新整理之後不該再出現」那條測的其實是
   * 「又一次全新安裝」，永遠會看到引導，而且看起來像功能壞了。
   * 先進站，清一次，再重新整理，得到的才是真正的空白起點。
   */
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
};

test("剛裝好會出現，走完三步之後不再出現", async ({ page }) => {
  await fresh(page);
  const box = page.locator(".guide-box");
  await expect(box, "第一次開分頁要看到引導").toBeVisible();

  // 第一步在第一屏
  await expect(page.locator(".screen.desk.on")).toHaveCount(0);

  await page.locator(".gd-next").click();
  // 第二步要真的把人帶到工作區，不是用文字描述它
  await expect(
    page.locator(".screen.desk.on"),
    "第二步要切到第二屏",
  ).toHaveCount(1);

  await page.locator(".gd-next").click();
  await expect(page.locator(".gd-dots i.on")).toHaveCount(1);

  await page.locator(".gd-next").click();
  await expect(box, "看完就收起來").toHaveCount(0);
  // 收完回到第一屏，不要把人丟在工作區
  await expect(page.locator(".screen.desk.on")).toHaveCount(0);

  await expect
    .poll(() =>
      page.evaluate(
        // 落盤有延遲，還沒寫進去時 getItem 是 null —— 直接 JSON.parse 會丟例外，
        // poll 就不會重試了。回 undefined 讓它繼續等。
        () => {
          const raw = localStorage.getItem("tg.settings");
          return raw
            ? (JSON.parse(raw) as { guided?: boolean }).guided
            : undefined;
        },
      ),
    )
    .toBe(true);

  // 重新整理不該再出現
  await page.reload();
  await expect(page.locator(".card, .clock").first()).toBeVisible();
  await expect(box, "看過就不要再來一次").toHaveCount(0);
});

test("略過也算看過", async ({ page }) => {
  await fresh(page);
  await expect(page.locator(".guide-box")).toBeVisible();
  await page.locator(".gd-skip").click();
  await expect(page.locator(".guide-box")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        // 落盤有延遲，還沒寫進去時 getItem 是 null —— 直接 JSON.parse 會丟例外，
        // poll 就不會重試了。回 undefined 讓它繼續等。
        () => {
          const raw = localStorage.getItem("tg.settings");
          return raw
            ? (JSON.parse(raw) as { guided?: boolean }).guided
            : undefined;
        },
      ),
    )
    .toBe(true);
});

test("Esc 也關得掉，而且焦點在引導裡", async ({ page }) => {
  await fresh(page);
  const box = page.locator(".guide-box");
  await expect(box).toBeVisible();
  // useDialog 會把焦點放進框裡第一個可按的東西
  // 焦點要落在主要動作上，不是「略過」—— 一進來按 Enter 不該把引導關掉
  await expect(page.locator(".gd-next")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
});

test("已經設定過的人不會被引導閃一下", async ({ page }) => {
  /*
   * settings 在載回來之前握的是 DEFAULTS 本尊，而 DEFAULTS 的 guided 是 false。
   * 少了那個哨兵判斷，老使用者每次開新分頁都會先閃一下引導再消失。
   * 這條測的就是那一瞬間：一載完就檢查，不給它機會閃。
   */
  await page.addInitScript(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({ schemaVersion: 1, guided: true }),
    ),
  );
  await page.goto("/");
  await expect(page.locator(".clock")).toBeVisible();
  await expect(page.locator(".guide-box")).toHaveCount(0);
});
