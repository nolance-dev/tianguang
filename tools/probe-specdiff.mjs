/**
 * 規格比對：實驗室 vs 真的擴充功能。
 *
 * 規格是「出貨的卡片要跟 media-lab 那頁一樣」。實驗室畫的是 MediaPanel 本人，
 * 但它自己給了一組 :root 主題變數、包了 .lab-page / .lab-grid、還多加一個
 * 真的 app 從來不設的 card-media —— 那幾樣都可能讓實驗室好看、擴充功能卻不是。
 * 所以兩邊各量一次同樣的東西，再逐格比。
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/** 兩邊都問同一組問題，答案才比得起來 */
const PROBE = () => {
  const card = document.querySelector(".card[data-id=media]") ?? document.querySelector(".lab-cell .card");
  if (!card) return null;
  const li = card.querySelector(".media-list li");
  const ctl = li?.querySelector(".media-ctl");
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const rows = [...card.querySelectorAll(".media-list li")];
  return {
    w: card.getAttribute("data-w"), h: card.getAttribute("data-h"),
    card: box(card),
    visibleRows: rows.filter((r) => cs(r).display !== "none").length,
    buttons: li ? [...li.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.className) : [],
    ctlCols: ctl ? cs(ctl).gridTemplateColumns : null,
    ctlDisplay: ctl ? cs(ctl).display : null,
    playCol: (() => { const p = li?.querySelector(".play"); return p ? cs(p).gridColumn : null; })(),
    prevCol: (() => { const p = li?.querySelector('.step[data-cmd=prev]'); return p ? cs(p).gridColumn : null; })(),
    nextCol: (() => { const p = li?.querySelector('.step[data-cmd=next]'); return p ? cs(p).gridColumn : null; })(),
    muteCol: (() => { const p = li?.querySelector(".mute"); return p ? cs(p).gridColumn : null; })(),
    artPx: (() => { const a = li?.querySelector(".media-art"); return a ? box(a) : null; })(),
    titleSize: (() => { const t = li?.querySelector(".txt b"); return t ? cs(t).fontSize : null; })(),
    goDisplay: (() => { const g = li?.querySelector(".go"); return g ? cs(g).display : null; })(),
    liCols: li ? cs(li).gridTemplateColumns : null,
    countBadge: !!card.querySelector(".media-count"),
    live: !!card.querySelector(".media-live"),
  };
};

const SIZES = [];
for (let h = 1; h <= 3; h++) for (let w = 1; w <= 4; w++) SIZES.push([w, h]);

const b = await chromium.launch({ channel: "msedge" });

// ---------- 實驗室 ----------
const labCtx = await b.newContext({ locale: "zh-TW", viewport: { width: 1440, height: 1000 } });
const labPage = await labCtx.newPage();
await labPage.goto("http://localhost:5174/media-lab.html", { waitUntil: "domcontentloaded" });
await labPage.waitForSelector(".lab-cell .media", { timeout: 15000 });
const lab = {};
for (const [w, h] of SIZES) {
  const got = await labPage.evaluate(([w, h, src]) => {
    const cell = [...document.querySelectorAll(".lab-cell")].find((f) => {
      const c = f.querySelector(".card");
      return c?.getAttribute("data-w") === String(w) && c?.getAttribute("data-h") === String(h);
    });
    if (!cell) return null;
    const probe = new Function("return (" + src + ")")();
    const old = document.querySelector.bind(document);
    // 把探針的搜尋範圍限制在這一格
    document.querySelector = (s) => cell.querySelector(s);
    const out = probe();
    document.querySelector = old;
    return out;
  }, [w, h, PROBE.toString()]);
  lab[`${w}x${h}`] = got;
}
await labCtx.close();

// ---------- 真的擴充功能 ----------
const stage = mkdtempSync(resolve(tmpdir(), "specdiff-"));
cpSync(resolve("dist"), stage, { recursive: true });
const mf = JSON.parse(readFileSync(resolve(stage, "manifest.json"), "utf8"));
mf.permissions.push("tabs");
mf.optional_permissions = mf.optional_permissions.filter((p) => p !== "tabs");
writeFileSync(resolve(stage, "manifest.json"), JSON.stringify(mf, null, 2));
const id = createHash("sha256").update(Buffer.from(stage, "utf16le")).digest("hex")
  .slice(0, 32).replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

const profile = mkdtempSync(resolve(tmpdir(), "specprof-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "msedge", headless: false, viewport: { width: 1440, height: 1000 },
  args: [`--disable-extensions-except=${stage}`, `--load-extension=${stage}`, "--lang=zh-TW"],
});
const TABS = [
  { id: 1, windowId: 1, title: "刀麻发鬓角 · 刀脚", url: "https://open.spotify.com/x", favIconUrl: "", active: true, mutedInfo: { muted: false } },
  { id: 2, windowId: 1, title: "Lo-fi beats to relax and study to \u2014 24/7 live radio stream", url: "https://www.youtube.com/watch?v=1", favIconUrl: "", active: false, mutedInfo: { muted: false } },
  { id: 3, windowId: 1, title: "\u591c\u8272\u94a2\u7434\u66f2", url: "https://www.bilibili.com/v", favIconUrl: "", active: false, mutedInfo: { muted: true } },
  { id: 4, windowId: 2, title: "Midnight Set", url: "https://soundcloud.com/s", favIconUrl: "", active: false, mutedInfo: { muted: false } },
  { id: 5, windowId: 2, title: "\u6c92\u6709\u5716\u793a\u7684\u90a3\u4e00\u7a2e", url: "https://www.mixcloud.com/m", favIconUrl: "", active: false, mutedInfo: { muted: false } },
];
const page = await ctx.newPage();
await page.addInitScript((tabs) => {
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 0));
  Object.defineProperty(chrome, "tabs", { configurable: true, value: {
    query: () => wait(tabs), get: (i) => wait(tabs.find((t) => t.id === i)), update: () => wait(undefined) } });
}, TABS);
const url = `chrome-extension://${id}/index.html`;
await page.goto(url, { waitUntil: "domcontentloaded" });

const ext = {};
for (const [w, h] of SIZES) {
  await page.evaluate(async ([w, h]) => {
    const cur = (await chrome.storage.sync.get("tg.settings"))["tg.settings"] ?? {};
    await chrome.storage.sync.set({ "tg.settings": { ...cur, schemaVersion: 1, guided: true, lang: "zh_TW",
      home: { links: false, photos: false },
      cards: { todos: false, note: false, pomodoro: false, quote: false, links: false, photos: false,
               calendar: false, weather: false, media: true, clock: false },
      desk: [{ id: "media", w, h }] } });
  }, [w, h]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(700);
  ext[`${w}x${h}`] = await page.evaluate((src) => new Function("return (" + src + ")")()(), PROBE.toString());
}
await ctx.close();
rmSync(profile, { recursive: true, force: true });
rmSync(stage, { recursive: true, force: true });
await b.close();

// ---------- 比對 ----------
const KEYS = ["card","visibleRows","buttons","ctlCols","ctlDisplay","playCol","prevCol","nextCol","muteCol","artPx","titleSize","goDisplay","liCols","countBadge","live"];
const diffs = [];
for (const [w, h] of SIZES) {
  const k = `${w}x${h}`, a = lab[k], c = ext[k];
  if (!a || !c) { diffs.push({ size: k, missing: !a ? "lab" : "ext" }); continue; }
  for (const key of KEYS) {
    const x = JSON.stringify(a[key]), y = JSON.stringify(c[key]);
    if (x !== y) diffs.push({ size: k, key, lab: a[key], ext: c[key] });
  }
}
if (process.env.SNAP) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.SNAP, JSON.stringify({ lab, ext }, null, 1));
  console.log("snapshot ->", process.env.SNAP);
}
console.log(JSON.stringify({ labSizes: Object.keys(lab).length, extSizes: Object.keys(ext).length, diffCount: diffs.length, diffs }, null, 1));
