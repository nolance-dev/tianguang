import { expect, test, type Page } from "@playwright/test";

/**
 * 動作。
 *
 * 兩件事這裡守得住，而且只有真的瀏覽器守得住：
 *
 *  1. 按下去有沒有回音 —— 把畫面上每一顆按鈕拿去比對樣式表裡所有帶 :active
 *     的選擇器，比對不到的就是按了沒感覺的。這條會抓到「以後新加的按鈕
 *     忘了進名單」，而那正是它上一次漏掉七個地方的原因。
 *  2. 要求減少動態的時候，時長和延遲都要收乾淨。只收時長的話，一排長條
 *     還是會一根一根冒出來，只是變快 —— 那不是靜止。
 */

async function ready(page: Page) {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({
        schemaVersion: 1,
        guided: true,
        lang: "zh_TW",
        cards: {
          todos: true,
          note: true,
          pomodoro: true,
          links: true,
          photos: true,
          calendar: true,
          weather: true,
          media: true,
          clock: true,
          quote: true,
        },
      }),
    ),
  );
  await page.reload();
  await expect(page.locator(".greet")).toBeVisible();
}

/** 畫面上按了沒有回音的按鈕 */
function pressless(page: Page) {
  return page.evaluate(() => {
    const bare: string[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) {
        const sel = (r as CSSStyleRule).selectorText;
        if (!sel?.includes(":active")) continue;
        for (const one of sel.split(","))
          if (one.includes(":active"))
            bare.push(one.replace(/:active/g, "").trim());
      }
    }
    const out = new Set<string>();
    for (const el of document.querySelectorAll("button, a.tile")) {
      const box = el as HTMLElement;
      if (!box.offsetParent && getComputedStyle(box).position !== "fixed")
        continue;
      if (bare.some((s) => box.matches(s))) continue;
      const cls = box.className.trim().split(/\s+/)[0] ?? "";
      out.add(`${box.tagName.toLowerCase()}.${cls}`);
    }
    return [...out];
  });
}

test("每一顆按得下去的按鈕都有回音", async ({ page }) => {
  await ready(page);
  // .grow 是拖曳把手，按下去的意思是「開始拖」—— 縮一下會跟接下來的位移打架
  const allowed = ["button.grow"];

  expect(await pressless(page), "第一屏").toEqual(allowed);

  await page.locator(".cue").click();
  await expect(page.locator(".screen.desk.on")).toBeVisible();
  expect(await pressless(page), "工作區").toEqual(allowed);

  await page.locator('.card[aria-label="番茄鐘"] .expand').click();
  await expect(page.locator(".full")).toBeVisible();
  expect(await pressless(page), "番茄鐘整屏").toEqual(allowed);

  await page.keyboard.press("Escape");
  await page.locator('.card[aria-label="日曆"] .expand').click();
  await expect(page.locator(".full")).toBeVisible();
  expect(await pressless(page), "日曆整屏").toEqual(allowed);

  await page.keyboard.press("Escape");
  await page.locator(".gear").click();
  await expect(page.locator(".panel")).toBeVisible();
  expect(await pressless(page), "設定").toEqual(allowed);
});

/** 整屏那兩欄和統計圖的長條，進場時各自的時長與延遲 */
function entrances(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".full-body > *, .fo-chart .bar i")].flatMap(
      (el) =>
        el.getAnimations().map((a) => {
          const t = a.effect!.getTiming();
          return {
            name: (a as CSSAnimation).animationName,
            ms: Number(t.duration),
            delay: Number(t.delay),
          };
        }),
    ),
  );
}

test("整屏的兩欄和統計圖是錯開進場的", async ({ page }) => {
  await ready(page);
  await page.locator(".cue").click();
  await page.locator('.card[aria-label="番茄鐘"] .expand').click();
  await expect(page.locator(".full")).toBeVisible();

  const runs = await entrances(page);
  const cols = runs.filter((r) => r.name === "col-in");
  const bars = runs.filter((r) => r.name === "bar-rise");
  expect(cols.length, "主欄與側欄各一").toBe(2);
  expect(
    cols.map((c) => c.delay).sort((a, b) => a - b),
    "側欄晚一點",
  ).toEqual([0, 60]);
  expect(bars.length, "一週七根").toBeGreaterThan(1);
  // 一根差 20 毫秒，而且整排要在半秒內走完 —— 再長就變成在等圖表演完
  expect(Math.max(...bars.map((b) => b.delay + b.ms))).toBeLessThanOrEqual(500);
});

test("要求減少動態時，時長和延遲都收乾淨，不是快轉的接力", async ({ page }) => {
  {
    // 用 emulateMedia 而不是 test.use({ reducedMotion })：後者在這個設定下
    // 沒有生效，量到的 matchMedia 是 false，動畫照跑 —— 那條測試會失敗得
    // 莫名其妙。這一行是直接對這個分頁下的，量得到。
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    await page.locator(".cue").click();
    await page.locator('.card[aria-label="番茄鐘"] .expand').click();
    await expect(page.locator(".full")).toBeVisible();

    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      "瀏覽器要真的處在減少動態模式",
    ).toBe(true);
    const runs = await entrances(page);
    expect(runs.length, "動畫還在，只是收乾淨了").toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.ms).toBeLessThanOrEqual(1);
      expect(r.delay).toBe(0);
    }
  }
});
