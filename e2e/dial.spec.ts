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
  /*
   * 等環真的停下來，不要用固定秒數。
   *
   * .sunlab 一開始就在 DOM 裡（只是 opacity 0），所以 waitFor 立刻就回來，
   * 固定等三秒六其實還落在五秒的開盤動畫中間 —— 量到的是轉到一半的位置，
   * 相不相交純看運氣。這條測試曾經因此綠著，也曾經因此紅過。
   *
   * 盤面停下來的定義很明確：每一環的 rotate 都回到零。
   */
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".dial [style*='--spin']")].every((el) => {
        const r = getComputedStyle(el).rotate;
        return r === "none" || Math.abs(parseFloat(r)) < 0.01;
      }),
    undefined,
    { timeout: 15000 },
  );
}

/**
 * 中央每一行 × 每個金色標籤，真的疊在一起的組合。
 *
 * 兩件事都不能用 getBoundingClientRect() 直接比：
 *
 * 標籤是**跟著盤旋轉**的 SVG 文字，貼著弧線走。旋轉之後的軸對齊外接矩形
 * 比那行字大得多 —— 一行小字量出來 66 像素高。拿兩個外接矩形相交當成
 * 「字壓到字」，一天二十四小時會誤報八九次，而截圖上明明留著空隙。
 * 所以標籤要取 getBBox() 的四個角，經 getScreenCTM() 轉到螢幕座標，
 * 得到真正的斜方框，再用分離軸定理判交。
 *
 * 中央那幾行是區塊元素，寬度是整個 .dial-center，而字是置中的 ——
 * 方框同樣比字寬。用 Range 圈住內容才量得到墨跡。
 */
function clashes(page: Page) {
  return page.evaluate(() => {
    /** 一個凸多邊形的四個角（螢幕座標） */
    type Quad = { x: number; y: number }[];

    const rectQuad = (r: DOMRect): Quad => [
      { x: r.left, y: r.top },
      { x: r.right, y: r.top },
      { x: r.right, y: r.bottom },
      { x: r.left, y: r.bottom },
    ];

    /** SVG 元素旋轉後的真實四角 */
    const svgQuad = (el: SVGGraphicsElement): Quad | null => {
      const m = el.getScreenCTM();
      if (!m) return null;
      const b = el.getBBox();
      return [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x + b.width, b.y + b.height],
        [b.x, b.y + b.height],
      ].map(([x, y]) => ({
        x: m.a * x! + m.c * y! + m.e,
        y: m.b * x! + m.d * y! + m.f,
      }));
    };

    /** 分離軸定理：找得到一條分隔線就是沒交集 */
    const overlap = (p: Quad, q: Quad): boolean => {
      for (const poly of [p, q]) {
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i]!;
          const c = poly[(i + 1) % poly.length]!;
          // 邊的法線
          const nx = -(c.y - a.y);
          const ny = c.x - a.x;
          const span = (r: Quad) => {
            const vs = r.map((v) => v.x * nx + v.y * ny);
            return [Math.min(...vs), Math.max(...vs)] as const;
          };
          const [lo1, hi1] = span(p);
          const [lo2, hi2] = span(q);
          if (hi1 < lo2 || hi2 < lo1) return false;
        }
      }
      return true;
    };

    /** 區塊元素裡那行字真正佔的地方，不是區塊本身 */
    const inkRect = (el: Element): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      range.detach();
      return r.width > 0 ? r : el.getBoundingClientRect();
    };

    const labs = [...document.querySelectorAll(".sunlab")]
      .map((e) => svgQuad(e as SVGGraphicsElement))
      .filter((q): q is Quad => q !== null);

    const out: string[] = [];
    for (const sel of [".dc-time", ".dc-date", ".dc-name", ".dc-sub"]) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const q = rectQuad(inkRect(el));
      for (const l of labs) if (overlap(q, l)) out.push(`${sel} × sunlab`);
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

/**
 * 開盤那五秒，相鄰的環要轉相反方向。
 *
 * 五環同向的時候看起來是「一整片在轉」—— 環與環之間沒有相對運動，眼睛分不出
 * 那是五個獨立的盤還是一張貼上去的圖。層次是交界處的相對速度長出來的。
 *
 * 量的是 --spin 的正負號（決定方向）而不是它的絕對值（決定速度）——
 * 以後有人調快慢，這條不會誤報。
 */
test("相鄰的環轉相反方向", async ({ page }) => {
  await openDial(page, "zh_TW");

  const spins = await page.evaluate(() =>
    [...document.querySelectorAll(".dial .rg")].map((el) => ({
      cls: (el.getAttribute("class") ?? "").replace("rg ", ""),
      // DOM 順序就是由外而內：分、時、節氣、時辰、日照
      spin: parseFloat((el as HTMLElement).style.getPropertyValue("--spin")),
    })),
  );

  expect(spins.length, "五個環都要在").toBe(5);
  for (const s of spins) expect(s.spin, `${s.cls} 沒有 --spin`).not.toBeNaN();
  for (let i = 1; i < spins.length; i++)
    expect(
      Math.sign(spins[i]!.spin) * Math.sign(spins[i - 1]!.spin),
      `${spins[i - 1]!.cls} 和 ${spins[i]!.cls} 同向`,
    ).toBe(-1);

  // 秒針在最裡面，也要跟它的鄰居（日照那環）相反
  const sec = await page.evaluate(() =>
    parseFloat(
      (
        document.querySelector(".dial .sec") as HTMLElement
      ).style.getPropertyValue("--spin"),
    ),
  );
  expect(Math.sign(sec) * Math.sign(spins[4]!.spin)).toBe(-1);
});
