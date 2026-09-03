import { expect, test, type Page } from "@playwright/test";

/**
 * 時辰盤中央那幾行字不能撞到日出日落的標籤。
 *
 * 那兩個金色標籤釘在半徑 99 的地方，位置是幾何算出來的，不會讓路 ——
 * 會讓路的只有中間那幾行。英文版原本是
 * 「Thursday, 3 September 2026」，等寬字加 0.24em 字距共二十六個字，
 * 橫向直接壓過去，年份被切掉一半。
 *
 * 量的是實際算繪出來的方框有沒有相交，不是字數 —— 換字型、換語系、
 * 換日期格式都會被這條抓到。
 */

async function openDial(page: Page, lang: string) {
  await page.goto("/");
  await page.evaluate(
    (l) =>
      localStorage.setItem(
        "tg.settings",
        JSON.stringify({ schemaVersion: 1, guided: true, lang: l }),
      ),
    lang,
  );
  await page.reload();
  await page.locator(".badge").click();
  await expect(page.locator(".dial")).toBeVisible();
  // 邊註和日出日落的點是 2.8 秒之後才淡入的，早了量不到
  await page.locator(".sunlab").first().waitFor();
  await page.waitForTimeout(3600);
}

/** 中央每一行 × 每個金色標籤，相交的組合 */
function clashes(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const hit = (a: DOMRect, b: DOMRect) =>
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    const labs = [...document.querySelectorAll(".sunlab")].map(box);
    const out: string[] = [];
    for (const sel of [".dc-time", ".dc-date", ".dc-name", ".dc-sub"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = box(el);
      for (const l of labs) if (hit(r, l)) out.push(`${sel} × sunlab`);
    }
    return out;
  });
}

for (const lang of ["zh_TW", "en"]) {
  test(`時辰盤中央不撞到日出日落的標籤（${lang}）`, async ({ page }) => {
    await openDial(page, lang);
    expect(await page.locator(".sunlab").count(), "兩個標籤都要在").toBe(2);
    expect(await clashes(page)).toEqual([]);
  });
}

test("日期照設定的語言排，不是照瀏覽器的", async ({ page }) => {
  await openDial(page, "zh_TW");
  // 選了繁體中文，日期就不該出現英文的月份或星期
  expect(await page.locator(".dc-date").textContent()).toMatch(/年.*月.*日/);
  await openDial(page, "en");
  expect(await page.locator(".dc-date").textContent()).toMatch(
    /^[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]+ \d{4}$/,
  );
});
