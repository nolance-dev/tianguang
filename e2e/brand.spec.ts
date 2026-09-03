import { expect, test } from "@playwright/test";

/**
 * 分頁上的名字與圖示。
 *
 * manifest 裡的 icons 給的是擴充功能清單和商店 —— 分頁列不看它。分頁看的是
 * index.html 的 <title> 和 <link rel=icon>，兩個都沒掛的時候 Edge 顯示的是
 * 「新分頁」加一顆地球，等於這個擴充功能在使用者眼前沒有名字。
 */

test("分頁顯示的是名字，不是「新分頁」", async ({ page }) => {
  await page.goto("/");
  // 靜態那一份是中文名，載入之前就在了 —— 不會先閃一下「新分頁」
  await expect(page).toHaveTitle("天光");

  const icons = await page
    .locator("link[rel=icon]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  expect(icons.length, "16 與 32 各給一個，讓瀏覽器自己挑").toBe(2);
  for (const href of icons) {
    const res = await page.request.get(href);
    expect(res.ok(), `${href} 要真的存在`).toBe(true);
    expect((await res.body()).length).toBeGreaterThan(200);
  }
});

test("名字跟著語言換", async ({ page }) => {
  await page.goto("/");
  for (const [lang, name] of [
    ["zh_TW", "天光"],
    ["en", "Aubade"],
  ] as const) {
    await page.evaluate(
      (l) =>
        localStorage.setItem(
          "tg.settings",
          JSON.stringify({ schemaVersion: 1, guided: true, lang: l }),
        ),
      lang,
    );
    await page.reload();
    await expect(page).toHaveTitle(name);
  }
});
