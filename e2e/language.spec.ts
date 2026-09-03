import { expect, test } from "@playwright/test";

/**
 * 設定裡的語言切換。
 *
 * 預覽版沒有 chrome.i18n，所以「跟著瀏覽器」那一檔會顯示鍵名（settings_title）——
 * 這反而讓這條測試很好判斷：選了語言之後出現真的字串，就代表 t() 真的改讀
 * 打包進來的字串包了。
 *
 * 換完之後只等兩個影格再讀，不用 expect.poll：時鐘每秒會重繪一次整頁，
 * 用輪詢的話「換語言當下就生效」跟「等到下一秒才生效」是分不出來的，
 * 而那正是這條要守的東西（setLang 要在算繪之前跑，不能放在 effect 裡）。
 */

test("選了語言，整頁當下就換過去", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({ schemaVersion: 1, guided: true }),
    ),
  );
  await page.reload();
  await page.click(".gear");

  const heading = page.locator(".panel-h b");
  await expect(heading).toHaveText("settings_title");

  const lang = page.locator(".panel-body select.lang");
  await lang.selectOption("en");
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await heading.textContent()).toBe("Settings");
  // CSS 靠 :root[lang^="en"] 分字體，屬性也要跟著換
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  /*
   * 搜尋列的 props 只有一個 engineId，換語言時一動也不動 ——
   * signals 給元件裝的 shouldComponentUpdate 會因此整個跳過它。
   * 這一格盯的就是那件事：它必須跟著換，不能停在上一種語言。
   */
  expect(
    await page.locator(".search input").getAttribute("placeholder"),
  ).toContain("Search");

  await lang.selectOption("zh_TW");
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  expect(await heading.textContent()).toBe("設定");

  // 存得住：重開之後還是中文，不是回到鍵名。
  // 寫入 debounce 300ms，落盤了才重新整理 —— 不等的話重開讀到的是上一個值
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("tg.settings") ?? "{}").lang,
      ),
    )
    .toBe("zh_TW");
  await page.reload();
  await expect(page.locator(".greet")).toBeVisible();
  await page.click(".gear");
  await expect(page.locator(".panel-h b")).toHaveText("設定");
});
