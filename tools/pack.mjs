import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import pkg from "../package.json" with { type: "json" };

/**
 * 兩家商店各包一份。
 *
 * 差別只在 manifest 的一個鍵：Edge 認 minimum_edge_version，Chrome 認
 * minimum_chrome_version。把兩個都塞在同一份裡，等於每一家都收到一個
 * 它不認得的鍵 —— 能過，但那是在賭審查的寬容度，沒必要。
 *
 * 其餘完全相同：同一次 build 的產物，只換掉那一個鍵再壓縮。
 */

const STORES = {
  edge: { drop: "minimum_chrome_version", keep: "minimum_edge_version" },
  chrome: { drop: "minimum_edge_version", keep: "minimum_chrome_version" },
};

/** 兩家都用同一個底線：容器查詢與 :has() 都要 Chromium 120 */
const FLOOR = "120";

const dist = resolve("dist");
const out = resolve("release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [store, spec] of Object.entries(STORES)) {
  const stage = resolve(out, store);
  cpSync(dist, stage, { recursive: true });

  const file = resolve(stage, "manifest.json");
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  delete manifest[spec.drop];
  manifest[spec.keep] = FLOOR;
  writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");

  const zip = resolve(out, `${store}-${pkg.version}.zip`);
  /*
   * 不用 Compress-Archive。它在 Windows PowerShell 5.1 底下寫出來的項目名
   * 帶反斜線（量過：assets\index-....css），不符合 ZIP 規範。Edge 收了，
   * 但兩家商店都要求 manifest.json 在根目錄，分隔符錯了就是在賭對方的
   * 解壓縮夠寬容。tools/zip.ps1 自己寫項目名，一律斜線。
   */
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      resolve("tools/zip.ps1"),
      "-Source",
      stage,
      "-Destination",
      zip,
    ],
    { stdio: "inherit" },
  );
  rmSync(stage, { recursive: true, force: true });
  console.log(`${store}: ${zip}`);
}
