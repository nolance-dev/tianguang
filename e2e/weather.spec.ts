import { expect, test } from "@playwright/test";

/**
 * 天氣卡的三日預報。
 *
 * parseForecast 已經把「今天」切掉了，卡片卻又 slice(1, 4) 切了第二次 ——
 * 明天被吃掉，卡上顯示的是後天和大後天，而使用者以為那是明後天。
 * 一份資料被切兩次，兩邊各自都看起來合理，只有數天數才看得出來。
 *
 * 用寫死的快取，不打網路：真的去要天氣的話，每次跑測試的溫度都不一樣，
 * 而且外面的服務掛掉會讓這條紅得莫名其妙。
 */

const DAYS = [
  { date: "2026-09-06", code: 0, max: 29, min: 24 },
  { date: "2026-09-07", code: 51, max: 31, min: 23 },
  { date: "2026-09-08", code: 51, max: 32, min: 22 },
];

test("三天的預報要有三天，而且從明天開始", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((days) => {
    localStorage.setItem(
      "tg.settings",
      JSON.stringify({
        schemaVersion: 1,
        guided: true,
        lang: "zh_TW",
        weatherOn: true,
        lat: 25.033,
        lon: 121.5654,
        placeName: "台北市",
        cards: { weather: true, todos: true, note: true, clock: true },
      }),
    );
    localStorage.setItem(
      "tg.weather",
      JSON.stringify({
        temp: 27.5,
        feels: 33.1,
        code: 0,
        days,
        fetchedAt: Date.now(),
        lat: 25.033,
        lon: 121.5654,
        stale: false,
      }),
    );
  }, DAYS);
  await page.reload();
  await page.locator(".cue").click();

  const chips = page.locator(".wxcard .wx-days > span");
  await expect(chips).toHaveCount(3);
  // 第一格是明天，不是後天 —— 這正是被切兩次時消失的那一天
  await expect(chips.first()).toContainText("29");

  // 體感跟氣溫差 5.6 度，只印氣溫會讓人以為這張卡在亂報
  await expect(page.locator(".wxcard .wx-now")).toContainText("33");
});
