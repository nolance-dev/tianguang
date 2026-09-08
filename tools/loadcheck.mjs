/**
 * 真的把 dist/ 載進 Edge，確認瀏覽器認這一包。
 *
 * messages.json 的佔位符寫錯時，擴充功能在安裝的那一刻就整包被判無效，
 * 而那條路只有真的裝進瀏覽器才會執行到 —— 單元測試、vite dev、
 * 甚至商店的上傳驗證都碰不到。上架之後才被使用者發現，就是這個洞。
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const dist = resolve("dist");

/** 未封裝擴充功能的 ID：路徑 sha256 的前 16 bytes，每個十六進位數字映到 a-p */
function idFor(path, enc) {
  return createHash("sha256")
    .update(Buffer.from(path, enc))
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

const candidates = new Set();
for (const p of [dist, dist.split("\\").join("/"), dist.toLowerCase()])
  for (const enc of ["utf16le", "utf8"]) candidates.add(idFor(p, enc));

const profile = mkdtempSync(resolve(tmpdir(), "edgeprof-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "msedge",
  headless: false,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

let hit = null;
const page = await ctx.newPage();
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
  console.error(
    "NOT LOADED — 沒有一個候選 ID 打得開，瀏覽器不接受這一包。",
  );
  console.error(
    "這正是使用者在商店按下「取得」時會看到的失敗。",
  );
  await ctx.close();
  rmSync(profile, { recursive: true, force: true });
  process.exit(1);
} else {
  // 標題來自 manifest 的 __MSG_extensionName__，走的正是 chrome.i18n
  const title = await page.title();
  const body = await page.evaluate(() => document.body.innerText.slice(0, 120));
  console.log("LOADED  id    :", hit);
  console.log("        title :", JSON.stringify(title));
  console.log("        body  :", JSON.stringify(body));
}
await ctx.close();
rmSync(profile, { recursive: true, force: true });
