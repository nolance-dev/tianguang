/**
 * 真的把一份擴充功能載進 Edge，用瀏覽器自己的 chrome.i18n 驗過再放行。
 *
 * 起因：1.0.0 上架了卻裝不起來。語系檔的 $1$ 是具名佔位符的語法，少了
 * placeholders 宣告，Edge 在安裝那一刻整包判無效。單元測試碰不到那條路 ——
 * 它是瀏覽器自己解析的，只有真的裝進去才會執行。
 *
 *   node tools/loadcheck.mjs [資料夾]     預設 dist
 *
 * 兩種介面語言各載一次：chrome.i18n 給的是瀏覽器語言，只驗英文等於
 * 中文那半份沒驗過。
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const target = resolve(process.argv[2] ?? "dist");

/** 未封裝擴充功能的 ID：路徑 sha256 的前 16 bytes，每個十六進位數字映到 a-p */
function idFor(path, enc) {
  return createHash("sha256")
    .update(Buffer.from(path, enc))
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}
const candidates = [
  ...new Set(
    [target, target.split("\\").join("/"), target.toLowerCase()].flatMap(
      (p) => ["utf16le", "utf8"].map((e) => idFor(p, e)),
    ),
  ),
];

/*
 * 六則出過事的訊息，連同代入值和該長出來的樣子。
 * 這是拿 chrome.i18n.getMessage() 本人跑的，不是我們自己的 fill()。
 */
const CASES = {
  "zh-TW": {
    title: "天光 Home Page",
    expect: {
      cal_roc_year: [["115"], "民國115年"],
      wx_station: [["臺北"], "臺北 測站實測"],
      c_sized: [["待辦", "3", "2"], "待辦 寬 3 高 2"],
      c_moved: [["待辦", "2", "5"], "待辦 移到第 2 張，共 5 張"],
      s_restore_body: [
        ["edge://extensions"],
        "到 edge://extensions 把天光關掉。停用不會刪掉設定，隨時可以開回來。",
      ],
      c_media_refused: [
        ["edge://extensions"],
        "沒有拿到權限。可以再按一次，或到 edge://extensions 裡開啟。",
      ],
    },
  },
  en: {
    title: "Aubade Home Page",
    expect: {
      cal_roc_year: [["115"], "Minguo 115"],
      wx_station: [["Taipei"], "Taipei station"],
      c_sized: [["To-dos", "3", "2"], "To-dos is now 3 by 2"],
      c_moved: [["To-dos", "2", "5"], "To-dos moved to 2 of 5"],
      s_restore_body: [
        ["edge://extensions"],
        "Open edge://extensions and turn Aubade off. Turning it off keeps your settings, so you can switch back any time.",
      ],
      c_media_refused: [
        ["edge://extensions"],
        "Permission was not granted. Try again, or turn it on in edge://extensions.",
      ],
    },
  },
};

const fail = [];

for (const [lang, spec] of Object.entries(CASES)) {
  const profile = mkdtempSync(resolve(tmpdir(), "edgeprof-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "msedge",
    headless: false,
    args: [
      `--disable-extensions-except=${target}`,
      `--load-extension=${target}`,
      `--lang=${lang}`,
    ],
  });
  const before = fail.length;
  const page = await ctx.newPage();
  const noise = [];
  page.on("pageerror", (e) => noise.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") noise.push(`console: ${m.text()}`);
  });

  let hit = null;
  for (const id of candidates) {
    try {
      await page.goto(`chrome-extension://${id}/index.html`, {
        waitUntil: "domcontentloaded",
        timeout: 8000,
      });
      hit = id;
      break;
    } catch {
      /* 換下一個候選 ID */
    }
  }

  if (!hit) {
    fail.push(`${lang}: 瀏覽器不接受這一包，沒有一個候選 ID 打得開`);
  } else {
    const title = await page.title();
    if (title !== spec.title)
      fail.push(`${lang}: 分頁標題是 ${JSON.stringify(title)}，應該是 ${JSON.stringify(spec.title)}`);

    // 這一段在擴充功能自己的頁面裡跑，用的是瀏覽器的 chrome.i18n
    const got = await page.evaluate(
      (expect) =>
        Object.fromEntries(
          Object.entries(expect).map(([k, [subs]]) => [
            k,
            chrome.i18n.getMessage(k, subs),
          ]),
        ),
      spec.expect,
    );
    for (const [k, [, want]] of Object.entries(spec.expect)) {
      if (got[k] !== want)
        fail.push(`${lang}/${k}: 得到 ${JSON.stringify(got[k])}，應該是 ${JSON.stringify(want)}`);
    }
    await page.waitForTimeout(1500); // 讓首屏跑完，錯誤才來得及冒出來
    for (const n of noise) fail.push(`${lang}: ${n}`);
    /*
     * 只有這一輪真的沒問題才報成功。
     * 先前無條件印，於是斷言已經失敗了畫面上還是先出現兩行「載入成功」，
     * 失敗訊息被推到後面 —— 那正是讓人以為過了的那種輸出。
     */
    if (fail.length === before)
      console.log(
        `${lang}: 載入成功，標題 ${JSON.stringify(title)}，` +
          `${Object.keys(spec.expect).length} 則訊息代入正確`,
      );
  }

  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
}

if (fail.length) {
  console.error("");
  console.error(`不通過（${target}）：`);
  for (const f of fail) console.error("  - " + f);
  console.error("");
  console.error("這正是使用者在商店按下「取得」時會遇到的失敗。");
  process.exit(1);
}
console.log(`OK: ${target} 兩種介面語言都裝得起來、跑得起來`);
