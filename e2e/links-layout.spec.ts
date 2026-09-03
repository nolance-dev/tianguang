import { expect, test, type Page } from "@playwright/test";

/**
 * 快速存取的排版。
 *
 * 這一整段演算法在 vitest 裡從來沒有跑過：欄數是 Links.tsx 用 ResizeObserver
 * 量出實際寬度算的，而 jsdom 沒有 ResizeObserver，也沒有版面。原本那條
 * 「排法由卡片寬度決定」的測試只驗了 data-w 屬性掛上去了，沒有驗排出來的結果。
 *
 * 規則：列數由「這個寬度塞得下幾個」決定，欄數再由 ceil(數量 / 列數) 回推 ——
 * 十六個排兩列就是八八，十五個是八七，不是塞滿一列剩下的掉到第二列。
 */

async function seed(page: Page, count: number, w: number) {
  const links = Array.from({ length: count }, (_, i) => ({
    id: `l${i}`,
    title: `站${i}`,
    url: `https://example.com/${i}`,
  }));
  await page.addInitScript(
    ([links, w]) => {
      localStorage.setItem(
        "tg.settings",
        JSON.stringify({
          schemaVersion: 1,
          // 這幾條測的不是引導，先當它看過了 —— 不然它會蓋住整頁擋掉所有點擊
          guided: true,
          links,
          desk: [{ id: "links", w, h: 1 }],
          cards: {
            todos: true,
            note: true,
            pomodoro: false,
            links: true,
            photos: false,
            calendar: true,
            weather: false,
            media: false,
            clock: false,
          },
        }),
      );
    },
    [links, w] as const,
  );
  await page.goto("/");
  await expect(page.locator(".card.linkcard .slot")).toHaveCount(count);
}

/** 每一列各有幾個磚 —— 用實際算繪出來的 y 座標分組，不是讀 CSS */
async function rowSizes(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const rows = new Map<number, number>();
    for (const el of document.querySelectorAll(".card.linkcard .slot")) {
      const y = Math.round(el.getBoundingClientRect().top);
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  });
}

test("十六個排成兩列是八八，不是一列塞滿", async ({ page }) => {
  await seed(page, 16, 2);
  const rows = await rowSizes(page);
  expect(rows.length, "應該排成兩列").toBeGreaterThan(1);
  expect(new Set(rows.slice(0, -1)).size, "除了最後一列，每列一樣多").toBe(1);
  // 上下對齊：最後一列不能比前面少太多，差距最多一個
  expect(rows[0]! - rows[rows.length - 1]!).toBeLessThanOrEqual(1);
  expect(rows.reduce((a, b) => a + b, 0)).toBe(16);
});

test("十五個是八七，最後一列只少一個", async ({ page }) => {
  await seed(page, 15, 2);
  const rows = await rowSizes(page);
  expect(rows.reduce((a, b) => a + b, 0)).toBe(15);
  expect(
    rows[0]! - rows[rows.length - 1]!,
    "上八下七，不是上八下四",
  ).toBeLessThanOrEqual(1);
});

test("磚塊不會滿出卡片外面", async ({ page }) => {
  // 這正是當初出錯的情形：欄數用格數推，工作區和主頁面寬度差三分之一
  for (const w of [1, 2, 3, 4]) {
    await seed(page, 16, w);
    const overflow = await page.evaluate(() => {
      const card = document
        .querySelector(".card.linkcard")!
        .getBoundingClientRect();
      return [...document.querySelectorAll(".card.linkcard .slot")].filter(
        (el) => {
          const r = el.getBoundingClientRect();
          return r.right > card.right + 1 || r.left < card.left - 1;
        },
      ).length;
    });
    expect(overflow, `卡片寬 ${w} 格時有磚塊溢出`).toBe(0);
  }
});

test("寬到一排放得下時，卡片收成一排的高度", async ({ page }) => {
  await seed(page, 16, 4);
  const rows = await rowSizes(page);
  expect(rows.length, "四格寬應該一排就夠").toBe(1);
  const { card, row } = await page.evaluate(() => ({
    card: document.querySelector(".card.linkcard")!.getBoundingClientRect()
      .height,
    row:
      parseFloat(
        getComputedStyle(document.querySelector(".cards")!).gridAutoRows,
      ) || 0,
  }));
  // 收起來之後卡片要比一整列矮 —— 而且列也跟著收（見 f813f30）
  expect(card, "一排的卡片不該還佔滿一整列的高度").toBeLessThan(180);
});
