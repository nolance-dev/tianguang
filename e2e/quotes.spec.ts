import { expect, test } from "@playwright/test";

/**
 * 語錄的輪替，在真的打包產物上。
 *
 * vitest 那一份驗的是函式；這一份驗的是「開一次分頁只走一格」。
 * 那件事只有在真的算繪裡才會出錯：設定是非同步讀回來的，讀回來之前先用
 * 瀏覽器語言算繪過一次，語言和自訂語錄各再觸發一次重繪 —— 每一次都可能
 * 再抽一句。實測過每開一頁跳兩到三格，使用者大約每三句只看得到一句。
 */

test("每開一次分頁往下走一句，一格不多", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({ schemaVersion: 1, guided: true, lang: "zh_TW" }),
    ),
  );
  await page.evaluate(() => localStorage.setItem("tg.quote", "0"));

  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.reload();
    await expect(page.locator(".quote")).toBeVisible();
    // 設定讀回來、語言定下來之後才算數
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang))
      .toBe("zh-TW");
    seen.push((await page.locator(".quote").textContent())!.trim());
    expect(
      await page.evaluate(() => localStorage.getItem("tg.quote")),
      `第 ${i + 1} 次之後游標應該是 ${i + 1}`,
    ).toBe(String(i + 1));
  }
  expect(new Set(seen).size, "五次五句，不能重複").toBe(5);
});
