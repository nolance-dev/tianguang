import { expect, test, type Page } from "@playwright/test";

/**
 * 無障礙驗收。
 *
 * 量的是瀏覽器真的建出來的無障礙樹（CDP 的 Accessibility.getFullAXTree）——
 * 那正是讀螢幕拿到的東西。DOM 上有沒有寫 aria-label 是一回事，算出來的
 * 可及名稱是不是空的是另一回事，只有後者算數。
 *
 * 這一份取代不了真的拿 NVDA 聽一遍：朗讀順序、標點怎麼念、同一句話會不會
 * 被下一句蓋掉，那些只有耳朵聽得出來。這裡守的是機器驗得了的部分。
 */

const INTERACTIVE = [
  "button",
  "link",
  "textbox",
  "combobox",
  "checkbox",
  "slider",
  "tab",
  "searchbox",
  "switch",
];

async function axNodes(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  await cdp.detach();
  return nodes
    .filter((n) => !n.ignored && n.role?.value)
    .map((n) => ({
      role: n.role!.value as string,
      name: ((n.name?.value as string) ?? "").trim(),
    }));
}

async function nameless(page: Page) {
  return (await axNodes(page))
    .filter((n) => INTERACTIVE.includes(n.role) && !n.name)
    .map((n) => n.role);
}

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
        },
      }),
    ),
  );
  await page.reload();
  await expect(page.locator(".greet")).toBeVisible();
}

test("每一個可操作的東西都念得出名字", async ({ page }) => {
  await ready(page);
  expect(await nameless(page), "第一屏").toEqual([]);

  await page.locator(".cue").click();
  await expect(page.locator(".screen.desk.on")).toBeVisible();
  expect(await nameless(page), "工作區").toEqual([]);

  await page.reload();
  await page.locator(".badge").click();
  await expect(page.locator(".dial")).toBeVisible();
  expect(await nameless(page), "時辰盤").toEqual([]);

  await page.keyboard.press("Escape");
  await page.locator(".gear").click();
  await expect(page.locator(".panel")).toBeVisible();
  expect(await nameless(page), "設定").toEqual([]);

  // 番茄鐘那一屏的專案篩選不在 <label> 裡，是唯一漏掉名字的那一個
  await page.keyboard.press("Escape");
  await page.locator(".cue").click();
  await page.locator('.card[aria-label="番茄鐘"] .expand').click();
  await expect(page.locator(".full")).toBeVisible();
  expect(await nameless(page), "番茄鐘整屏").toEqual([]);
});

test("每張卡都有自己的名字，把手也是", async ({ page }) => {
  await ready(page);
  await page.locator(".cue").click();
  await expect(page.locator(".screen.desk.on")).toBeVisible();

  const regions = (await axNodes(page)).filter((n) => n.role === "region");
  const cards = await page.locator(".screen.desk .card").count();
  expect(regions.length, "每張卡都是一個有名字的區域").toBe(cards);
  expect(new Set(regions.map((r) => r.name)).size, "名字不能重複").toBe(cards);

  // 九顆把手念起來要不一樣，不然只知道「有個調整大小的鈕」
  const handles = await page
    .locator(".screen.desk .card .grow")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(handles.length).toBe(cards);
  expect(new Set(handles).size).toBe(cards);
  for (const h of handles) expect(h).toContain("方向鍵");
});

test("鍵盤改完版面會講一聲", async ({ page }) => {
  await ready(page);
  await page.locator(".cue").click();
  await expect(page.locator(".screen.desk.on")).toBeVisible();

  const first = page.locator(".screen.desk .card").first();
  const name = (await first.getAttribute("aria-label"))!;
  const live = page.locator(".screen.desk .cards p[aria-live]");
  await expect(live).toHaveText("");

  await first.locator(".grow").focus();
  await page.keyboard.press("ArrowRight");
  await expect(live).toContainText(name);
  await expect(live).toHaveText(/寬 \d+ 高 \d+$/);

  await page.keyboard.press("Shift+ArrowRight");
  await expect(live).toContainText(name);
  await expect(live).toHaveText(/移到第 \d+ 張，共 \d+ 張$/);
});

test("四象的星名不會被一個字一個字念過去", async ({ page }) => {
  await ready(page);
  await page.locator(".badge").click();
  await expect(page.locator(".dial")).toBeVisible();

  const nodes = await axNodes(page);
  // 外層那個 role="img" 帶著整句話
  expect(
    nodes.some((n) => n.role === "image" && n.name.startsWith("青龍七宿：")),
  ).toBe(true);
  // 裡面那二十八個字不該各自出現一次
  expect(nodes.some((n) => n.name === "角")).toBe(false);
});
