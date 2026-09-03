import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * 商店截圖。
 *
 * 拍的是打包後的產物（vite preview 吃 dist/），不是開發伺服器 ——
 * 商店上放的必須是使用者真的會裝到的那一份。
 *
 * 唯一跟正式版不同的地方：預覽沒有 chrome.favicon，快速存取的圖示會退成
 * 字母磚。那是刻意留著的，示範資料本來就不該是別人的真實網站圖示。
 */

const SIZE = { width: 1280, height: 800 };

const seed = () => {
  const day = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  localStorage.setItem(
    "tg.settings",
    JSON.stringify({
      schemaVersion: 1,
      guided: true,
      lang: "zh_TW",
      name: "",
      weatherOn: true,
      lat: 25.03,
      lon: 121.56,
      placeName: "台北市",
      cards: {
        todos: true,
        note: true,
        pomodoro: true,
        links: true,
        photos: false,
        calendar: true,
        weather: true,
        media: false,
        clock: true,
        quote: true,
      },
      home: { links: true, photos: false },
      links: [
        { id: "l1", title: "信箱", url: "https://mail.example.com/" },
        { id: "l2", title: "行事曆", url: "https://calendar.example.com/" },
        { id: "l3", title: "雲端硬碟", url: "https://drive.example.com/" },
        { id: "l4", title: "筆記", url: "https://notes.example.com/" },
        { id: "l5", title: "課表", url: "https://school.example.com/" },
        { id: "l6", title: "音樂", url: "https://music.example.com/" },
      ],
    }),
  );
  const now = Date.now();
  const DAY = 86400000;
  localStorage.setItem(
    "tg.workspace",
    JSON.stringify({
      schemaVersion: 1,
      todos: [
        { id: "t1", text: "把報告的第三節寫完", done: false, createdAt: now },
        { id: "t2", text: "回覆助教的信", done: false, createdAt: now },
        { id: "t3", text: "訂週五的車票", done: true, createdAt: now },
      ],
      note: "想到再寫：\n・下週的簡報開頭改成問題，不要先講結論\n・借的書三號到期",
      pomodoro: {
        mode: "work",
        endsAt: null,
        pausedLeft: null,
        rounds: 3,
        roundsDate: "",
        projectId: "p1",
        todoId: "t1",
      },
      events: [
        { id: "e1", date: day(0), time: "14:00", text: "小組討論" },
        { id: "e2", date: day(1), time: "09:30", text: "回診" },
        { id: "e3", date: day(3), time: "19:00", text: "讀書會" },
      ],
      projects: [
        { id: "p1", name: "期末報告", hue: 42 },
        { id: "p2", name: "程式作業", hue: 210 },
      ],
      sessions: Array.from({ length: 18 }, (_, i) => ({
        id: "s" + i,
        at: now - (i % 7) * DAY - i * 900000,
        ms: (18 + (i % 5) * 6) * 60000,
        mode: "work",
        projectId: i % 3 === 0 ? "p2" : "p1",
      })),
      durations: { work: 25, short: 5, long: 15, deep: 50 },
    }),
  );
};

/*
 * 時間是假的，這一點很重要。
 *
 * 這個擴充功能整張臉都由當下幾點決定 —— 照著真實時間拍，五張截圖會全是
 * 同一種夜色，而「背景跟著天光走」正是它要賣的東西。用 Playwright 的
 * 時鐘控制把每一張釘在不同的時辰，一組截圖才看得出那條漸變。
 */
const AT = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

const b = await chromium.launch({ channel: "msedge" });
mkdirSync("assets/store", { recursive: true });

async function frame(file, hour, min, go, settle = 400) {
  const page = await b.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.clock.install({ time: AT(hour, min) });
  await page.goto("http://localhost:4321/");
  await page.evaluate(seed);
  await page.reload();
  await page.waitForTimeout(300);
  // 裝了假時鐘，計時器不會自己走 —— 手動推進讓非同步的東西（天氣）跑完
  await page.clock.runFor(2000);
  await go(page);
  await page.clock.runFor(1000);
  // CSS 的過場走的是真實時間，假時鐘推不動它 —— 時辰盤的邊註要等
  // 2.2 秒的延遲加 1.1 秒的淡入才到齊，早拍就是一張只有環的圖
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `assets/store/${file}` });
  await page.close();
  console.log(file);
}

// 卯時的天光、午時的晴、酉時的暮、亥時的夜 —— 一組看得出一天
await frame("shot-1-home.png", 6, 40, async () => {});
await frame("shot-2-desk.png", 12, 10, async (p) => {
  await p.locator(".cue").click();
});
await frame(
  "shot-3-dial.png",
  18,
  25,
  async (p) => {
    await p.locator(".badge").click();
  },
  4200,
);
await frame("shot-4-focus.png", 9, 15, async (p) => {
  await p.locator(".cue").click();
  await p.locator('.card[aria-label="番茄鐘"] .expand').click();
});
await frame("shot-5-calendar.png", 21, 40, async (p) => {
  await p.locator(".cue").click();
  await p.locator('.card[aria-label="日曆"] .expand').click();
});
await b.close();
