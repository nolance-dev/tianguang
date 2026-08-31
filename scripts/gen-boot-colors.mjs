/**
 * 產生首屏底色表。
 *
 * 為什麼要獨立成一支腳本，而不是讓 vite.config.ts 直接 import mesh.ts：
 * config 的 import 圖是被 Vite 監看的，所以改一次調色盤就會重啟整個開發
 * 伺服器，開著的分頁 HMR 連線一斷就再也不更新 —— 改了看不到，還會以為
 * 是程式沒生效。改成讀一個生成好的 JSON，讀檔不進 import 圖，就不會重啟。
 *
 * 執行：npm run colors（build 前會自動跑）
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bootColorTable } from "../src/lib/mesh.ts";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../boot-colors.json");
writeFileSync(out, JSON.stringify(bootColorTable()) + "\n");
console.log("boot-colors.json ←", bootColorTable().length, "colours");
