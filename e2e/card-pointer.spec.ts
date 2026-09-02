import { expect, test, type Page } from "@playwright/test";

/**
 * 卡片的拖曳與縮放。
 *
 * 整份 vitest 裡沒有任何一個 pointer 事件 —— 這兩個功能完全沒有被測過。
 * 它們也測不了：拖曳靠 elementFromPoint 判斷游標在哪一張卡上，縮放靠格線
 * 實際的欄寬換算跨幾格，兩者在 jsdom 裡都是零。
 */

const DESK = [
  { id: "links", w: 1, h: 1 },
  { id: "todos", w: 1, h: 1 },
  { id: "note", w: 1, h: 1 },
  { id: "calendar", w: 1, h: 1 },
];

async function seed(page: Page) {
  await page.addInitScript((desk) => {
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({
        schemaVersion: 1,
        links: [{ id: "a", title: "A", url: "https://example.com" }],
        desk,
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
  }, DESK);
  await page.goto("/");
  await expect(page.locator(".cards .card")).toHaveCount(4);
  /*
   * 要先切到第二屏，而且是照使用者的方式切 —— 按那顆往下的提示鈕。
   *
   * 捲動沒有用：第二屏平常用 translateY(100% + 80px) 收在畫面底下，是 page
   * 這個訊號把它推上來的，不是捲軸。而且沒有 .on 的那一屏收不到指標事件，
   * 所以就算座標算對了，按下去也只會打在 .app 上。
   *
   * 這一點查了很久：getBoundingClientRect 照樣回報一個看起來正常的位置，
   * 只有 elementFromPoint 會告訴你那裡其實什麼都沒有。
   */
  await page.locator(".cue").click();
  await expect(page.locator(".screen.desk.on")).toHaveCount(1);
  // 推上來有 0.72 秒的過場，等它坐定再量座標
  await page.waitForTimeout(900);
}

const order = (page: Page) =>
  page.$$eval(".cards .card", (els) =>
    els.map((e) => (e as HTMLElement).dataset.id!),
  );

const saved = (page: Page) =>
  page.evaluate(() =>
    (
      JSON.parse(localStorage.getItem("tg.settings")!).desk as { id: string }[]
    ).map((t) => t.id),
  );

/** 捲到定位並確認不再移動，然後一次取得所有卡片的中心座標 */
async function centres(page: Page) {
  await page.evaluate(() =>
    document
      .querySelector(".cards")!
      .scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await page.waitForFunction(() => {
    const y = window.scrollY;
    return new Promise((r) =>
      requestAnimationFrame(() => r(Math.abs(window.scrollY - y) < 0.5)),
    );
  });
  return page.evaluate(() => {
    const out: Record<
      string,
      { hx: number; hy: number; cx: number; cy: number; w: number }
    > = {};
    for (const el of document.querySelectorAll<HTMLElement>(".cards .card")) {
      const r = el.getBoundingClientRect();
      const h = (el.querySelector("header") ?? el).getBoundingClientRect();
      out[el.dataset.id!] = {
        hx: h.left + h.width / 2,
        hy: h.top + Math.min(h.height / 2, 10),
        cx: r.left + r.width / 2,
        cy: r.top + r.height / 2,
        w: r.width,
      };
    }
    return out;
  });
}

test("拖標題列可以換卡片位置，放手才寫回設定", async ({ page }) => {
  await seed(page);
  expect(await order(page)).toEqual(["links", "todos", "note", "calendar"]);
  const p = await centres(page);

  await page.mouse.move(p.links!.hx, p.links!.hy);
  await page.mouse.down();
  await page.mouse.move(p.links!.hx + 4, p.links!.hy, { steps: 2 });
  await expect(
    page.locator(".card.held"),
    "按住標題列要進入拖曳狀態",
  ).toHaveCount(1);

  // 分多步移動：一步到位不會產生中間的 pointermove，而換位是靠它判斷的
  await page.mouse.move(p.note!.cx, p.note!.cy, { steps: 15 });
  await page.mouse.up();

  const after = await order(page);
  expect(after, "links 應該離開第一個位置").not.toEqual([
    "links",
    "todos",
    "note",
    "calendar",
  ]);
  expect([...after].sort(), "不能弄丟或複製任何一張").toEqual(
    ["links", "todos", "note", "calendar"].sort(),
  );
  /*
   * 存起來的版面包含關掉的卡（pomodoro、photos…），畫面上只有開著的四張。
   * 那是對的 —— 關掉的卡留著位置，開回來才會回到原處。所以比較的時候要
   * 先濾成同一組，不然是拿四個去比九個。
   */
  await expect
    .poll(async () => (await saved(page)).filter((id) => after.includes(id)))
    .toEqual(after);
});

test("拖右下角把手可以改大小，而且會落盤", async ({ page }) => {
  await seed(page);
  const card = page.locator('.card[data-id="todos"]');
  expect(await card.getAttribute("data-w")).toBe("1");

  const p = await centres(page);
  const g = await page.evaluate(() => {
    const el = document
      .querySelector('.card[data-id="todos"] .grow')!
      .getBoundingClientRect();
    return { x: el.left + el.width / 2, y: el.top + el.height / 2 };
  });

  await page.mouse.move(g.x, g.y);
  await page.mouse.down();
  // 往右拉一整個欄寬（含間隙），應該剛好多跨一格
  await page.mouse.move(g.x + p.todos!.w + 20, g.y, { steps: 15 });
  await page.mouse.up();

  await expect(card).toHaveAttribute("data-w", "2");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            JSON.parse(localStorage.getItem("tg.settings")!).desk as {
              id: string;
              w: number;
            }[]
          ).find((t) => t.id === "todos")!.w,
      ),
    )
    .toBe(2);
});

test("拖到一半被系統收回去，卡片不會卡在拖曳狀態", async ({ page }) => {
  /*
   * 系統隨時可能撤回這次指標互動（切視窗、觸控被判成捲動、筆離開感應範圍）。
   * 那時 pointerup 不會來，原本只聽 pointerup 的話 held 會一直是真，
   * 卡片就黏在半透明狀態，放不下也拖不動，只能重新整理。
   */
  await seed(page);
  const p = await centres(page);
  await page.mouse.move(p.links!.hx, p.links!.hy);
  await page.mouse.down();
  await page.mouse.move(p.links!.hx + 40, p.links!.hy + 6, { steps: 5 });
  await expect(page.locator(".card.held")).toHaveCount(1);

  await page.evaluate(() =>
    document.dispatchEvent(
      new PointerEvent("pointercancel", { bubbles: true }),
    ),
  );
  await expect(
    page.locator(".card.held"),
    "取消之後不該還有卡片黏著",
  ).toHaveCount(0);
  await page.mouse.up();
});
