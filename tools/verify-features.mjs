/**
 * 在真的擴充功能裡驗這一版新增的四件事。
 *
 * 不是「測試綠了所以應該沒問題」——   四件都是使用者用眼睛看的東西，
 * 而其中三件（純色底、鎖高度、卡片數）只有瀏覽器算完樣式才知道結果。
 *
 * tabs 在這裡臨時提升成必要權限：選用權限會跳出瀏覽器自己的對話框，
 * 自動化按不掉。提升的是暫存的那一份，dist 本身不動。
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const stage = mkdtempSync(resolve(tmpdir(), "tgcheck-"));
cpSync(resolve("dist"), stage, { recursive: true });
const mf = JSON.parse(readFileSync(resolve(stage, "manifest.json"), "utf8"));
mf.permissions.push("tabs");
mf.optional_permissions = mf.optional_permissions.filter((p) => p !== "tabs");
writeFileSync(resolve(stage, "manifest.json"), JSON.stringify(mf, null, 2));

const id = createHash("sha256")
  .update(Buffer.from(stage, "utf16le"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

const profile = mkdtempSync(resolve(tmpdir(), "tgprof-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: false,
  args: [`--disable-extensions-except=${stage}`, `--load-extension=${stage}`, "--lang=zh-TW"],
});

const FAKE_TABS = [
  { id: 11, windowId: 1, title: "some song", url: "https://www.youtube.com/watch?v=x",
    favIconUrl: "", active: true, mutedInfo: { muted: false } },
  { id: 12, windowId: 1, title: "a lecture", url: "https://example.com/talk",
    favIconUrl: "", active: false, mutedInfo: { muted: false } },
];

const page = await ctx.newPage();
await page.addInitScript((tabs) => {
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 0));
  Object.defineProperty(chrome, "tabs", {
    configurable: true,
    value: {
      query: () => wait(tabs),
      get: (i) => wait(tabs.find((t) => t.id === i)),
      update: () => wait(undefined),
    },
  });
}, FAKE_TABS);

const url = `chrome-extension://${id}/index.html`;
await page.goto(url, { waitUntil: "domcontentloaded" });

// 版面：主頁面兩張卡都開，工作區給三張照片牆
await page.evaluate(async () => {
  const cur = (await chrome.storage.sync.get("tg.settings"))["tg.settings"] ?? {};
  await chrome.storage.sync.set({
    "tg.settings": {
      ...cur,
      schemaVersion: 1,
      guided: true,
      home: { links: true, photos: true },
      cards: { todos: false, note: false, pomodoro: false, quote: false, links: false,
               photos: true, calendar: false, weather: false, media: true, clock: false },
      photoWalls: [{ id: null, rotate: 0 }, { id: null, rotate: 0 }, { id: null, rotate: 0 }],
      homeDesk: [{ id: "links", w: 2, h: 1 }, { id: "photos", w: 2, h: 2 },
                 { id: "photos2", w: 2, h: 1 }],
    },
  });
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const out = {};

// ① 主頁面只准左右拉
out.home = await page.evaluate(() => {
  const grips = [...document.querySelectorAll(".core .grow")];
  const g = grips[0];
  return {
    cards: document.querySelectorAll(".core .card").length,
    grips: grips.length,
    allMarkedX: grips.length > 0 && grips.every((e) => e.classList.contains("x")),
    cursor: g ? getComputedStyle(g).cursor : null,
    keys: g ? g.getAttribute("aria-keyshortcuts") : null,
  };
});

// 鍵盤：按下之後高度不能變
out.lockH = await page.evaluate(async () => {
  const g = document.querySelector(".core .grow");
  const card = g.closest(".card");
  const before = getComputedStyle(card).gridRow;
  g.focus();
  for (let i = 0; i < 3; i++)
    g.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await new Promise((r) => setTimeout(r, 500));
  const after = getComputedStyle(document.querySelector(".core .grow").closest(".card")).gridRow;
  return { before, after, changed: before !== after };
});

// ③ 設定面板要是純色
await page.evaluate(() => document.querySelector(".gear, .settings-open, [class*=gear]")?.click());
await page.waitForTimeout(900);
out.panel = await page.evaluate(() => {
  const p = document.querySelector(".panel");
  if (!p) return { found: false };
  const cs = getComputedStyle(p);
  const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
  const parts = m ? m[1].split(",").map((x) => parseFloat(x)) : [];
  return {
    found: true,
    background: cs.backgroundColor,
    alpha: parts.length === 4 ? parts[3] : 1,
    backdrop: cs.backdropFilter,
    headerBackdrop: getComputedStyle(document.querySelector(".panel-h")).backdropFilter,
  };
});
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// ②④ 工作區：照片牆張數、正在播放的傳輸鍵
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(1500);
out.desk = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".media-list li")].map((li) => ({
    title: li.querySelector(".txt b")?.textContent,
    host: li.querySelector(".txt span")?.textContent,
    buttons: [...li.querySelectorAll(".media-ctl button")].map(
      (b) => b.getAttribute("aria-label") + "=" + b.textContent.trim(),
    ),
  }));
  return { photocards: document.querySelectorAll(".photocard").length, rows };
});

console.log(JSON.stringify(out, null, 1));
await ctx.close();
rmSync(profile, { recursive: true, force: true });
rmSync(stage, { recursive: true, force: true });
