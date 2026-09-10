import { expect, test } from "@playwright/test";

/**
 * 每一面照片牆都獨立。
 *
 * 一面卡就是一張照片，所以「加一張卡」跟「那張卡掛什麼」是同一件事。
 * 兩層獨立都要成立：主頁面與工作區各記各的（共用一份的話，在工作區加一張，
 * 第一屏也會跟著多一張，而那裡只有一列，擠掉的是使用者放在那裡的別的東西），
 * 而同一屏上的每一面也各記各的（否則換第二張的照片，第一張跟著換）。
 *
 * 動的是輪播那個下拉，因為它不需要真的圖庫就看得出誰被改到。
 */

const SETTINGS = {
  schemaVersion: 1,
  guided: true,
  lang: "zh_TW",
  home: { links: false, photos: true },
  cards: {
    todos: false, note: false, pomodoro: false, quote: false, links: false,
    photos: true, calendar: false, weather: false, media: false, clock: false,
  },
  homeDesk: [
    { id: "photos", w: 2, h: 1 },
    { id: "photos2", w: 2, h: 1 },
  ],
  desk: [
    { id: "photos", w: 2, h: 2 },
    { id: "photos2", w: 1, h: 1 },
    { id: "photos3", w: 1, h: 1 },
  ],
  homePhotoWalls: [
    { id: null, rotate: 0 },
    { id: null, rotate: 0 },
  ],
  photoWalls: [
    { id: null, rotate: 0 },
    { id: null, rotate: 0 },
    { id: null, rotate: 0 },
  ],
};

test("動一面照片牆，其他四面一動也不動", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("tg.settings", JSON.stringify(s));
  }, SETTINGS);
  await page.reload();

  await expect(page.locator(".core .photocard")).toHaveCount(2);
  await expect(page.locator(".screen.desk .photocard")).toHaveCount(3);

  const saved = () =>
    page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("tg.settings") ?? "{}");
      return {
        home: (s.homePhotoWalls ?? []).map((w: { rotate: number }) => w.rotate),
        desk: (s.photoWalls ?? []).map((w: { rotate: number }) => w.rotate),
      };
    });

  expect(await saved()).toEqual({ home: [0, 0], desk: [0, 0, 0] });

  // 工作區的第二面
  await page
    .locator(".screen.desk .photocard select")
    .nth(1)
    .selectOption("60");
  await expect.poll(saved).toEqual({ home: [0, 0], desk: [0, 60, 0] });

  // 主頁面的第一面 —— 工作區那一格不該跟著動
  await page.locator(".core .photocard select").first().selectOption("15");
  await expect.poll(saved).toEqual({ home: [15, 0], desk: [0, 60, 0] });

  // 撐過重新載入：記在設定裡，不是留在記憶體
  await page.reload();
  expect(await saved()).toEqual({ home: [15, 0], desk: [0, 60, 0] });
});
