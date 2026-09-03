import { expect, test } from "@playwright/test";

/**
 * 設定抽屜的標題列與分頁列。
 *
 * 兩者都是 sticky，所以捲動時它們底下會有東西經過 —— 遮不住就會疊字。
 * 這件事 jsdom 驗不到：沒有版面、沒有捲動、也沒有 elementFromPoint。
 *
 * 量的是「那個座標上最上面的是誰」，不是「有沒有設底色」：只有前者能同時
 * 抓到沒底色和沒 z-index 兩種寫法（後者會被後面的兄弟節點畫在上面）。
 */

// 抽屜比視窗還高才捲得動 —— 1000px 高的預設視窗只捲得了 56px
test.use({ viewport: { width: 1000, height: 520 } });

test("設定的標題與分頁列會遮住捲過去的內容", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({ schemaVersion: 1, guided: true }),
    ),
  );
  await page.reload();

  await page.click(".gear");
  const panel = page.locator(".panel");
  await expect(panel).toBeVisible();
  // 元件那一頁最長，捲得動
  await page.locator(".panel-tabs button").nth(2).click();

  // 用滾輪捲，不指定捲的是哪一層 —— 這條測的是「兩條列上面是誰」，
  // 不是捲軸掛在哪個節點上
  const mark = page.locator(".panel section").first();
  const before = (await mark.boundingBox())!.y;
  const centre = (await panel.boundingBox())!;
  await page.mouse.move(
    centre.x + centre.width / 2,
    centre.y + centre.height / 2,
  );
  await page.mouse.wheel(0, 400);
  await expect
    .poll(async () => (await mark.boundingBox())!.y)
    .toBeLessThan(before - 100);

  for (const sel of [".panel-h", ".panel-tabs"]) {
    const owns = await page.evaluate((s) => {
      const bar = document.querySelector(s)!;
      const r = bar.getBoundingClientRect();
      // 三個點都要是這條列自己的，不能是從底下透上來的內容
      return [0.2, 0.5, 0.8].every((f) => {
        const hit = document.elementFromPoint(
          r.left + r.width * f,
          r.top + r.height / 2,
        );
        return !!hit && (hit === bar || bar.contains(hit));
      });
    }, sel);
    expect(owns, `${sel} 被底下的內容蓋過去`).toBe(true);
  }
});
