import { expect, test } from "@playwright/test";

/**
 * 分頁上的名字與圖示。
 *
 * manifest 裡的 icons 給的是擴充功能清單和商店 —— 分頁列不看它。分頁看的是
 * index.html 的 <title> 和 <link rel=icon>，兩個都沒掛的時候 Edge 顯示的是
 * 「新分頁」加一顆地球，等於這個擴充功能在使用者眼前沒有名字。
 */

// 名字有兩個（天光／Aubade），釘死瀏覽器語言才知道該等哪一個
test.use({ locale: "zh-TW" });

test("分頁顯示的是名字，不是「新分頁」", async ({ page }) => {
  await page.goto("/");
  // 靜態那一份是中文名，載入之前就在了 —— 不會先閃一下「新分頁」
  await expect(page).toHaveTitle("天光 Home Page");

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
    ["zh_TW", "天光 Home Page"],
    ["en", "Aubade Home Page"],
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

/**
 * 設定最底下的「關於」。
 *
 * 捐款放在這裡，不放在看得到的地方 —— 新分頁是一天看五十次的畫面，
 * 在第一屏擺一顆募款鈕是最快讓人解除安裝的做法。
 *
 * 順便守住 $1$ 有沒有真的被代換掉：那個佔位符沒填的話，畫面上會出現
 * 一句「到 $1$ 把天光關掉」，而且只有真的算繪過才看得出來。
 */
test("關於裡有 Ko-fi 連結，而且瀏覽器網址有被填進去", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({ schemaVersion: 1, guided: true, lang: "zh_TW" }),
    ),
  );
  await page.reload();
  await page.click(".gear");
  await page.locator(".panel-tabs button").nth(3).click();

  const kofi = page.locator('.panel .about a[href^="https://ko-fi.com/"]');
  await expect(kofi).toHaveCount(1);
  await expect(kofi).toHaveAttribute("target", "_blank");
  // 外連一定要 noreferrer：不讓對方看到使用者是從哪個擴充功能 ID 過去的
  await expect(kofi).toHaveAttribute("rel", "noreferrer");

  const about = (await page.locator(".panel .about").textContent()) ?? "";
  expect(about, "佔位符要被換掉").not.toContain("$1$");
  expect(about).toMatch(/(edge|chrome):\/\/extensions/);
});
