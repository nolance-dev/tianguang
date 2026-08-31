import { defineConfig, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import pkg from "./package.json" with { type: "json" };

/**
 * 首屏不能白閃。
 *
 * chrome.storage 是非同步的，第一次繪製前來不及回來；等 Preact 掛載更晚。
 * 所以 head 裡放一段同步 inline script，先把整頁塗成接近最終結果的底色，
 * 之後 app 起來再換上完整漸層 —— 使用者永遠看不到白畫面。
 *
 * 那二十四筆底色由 scripts/gen-boot-colors.mjs 從 mesh.ts 算出來，
 * 這裡只是把生成好的 JSON 讀進來 —— 調色盤仍然只有一個真相來源。
 *
 * 刻意用讀檔而不是 import：config 的 import 圖被 Vite 監看，
 * 直接 import mesh.ts 會讓「改一次顏色就重啟開發伺服器」，
 * 開著的分頁 HMR 一斷就再也不更新，改了看不到。
 */
function bootPaint(): Plugin {
  return {
    name: "tg-boot-paint",
    transformIndexHtml() {
      const table = readFileSync(new URL("./boot-colors.json", import.meta.url), "utf8").trim();
      const js =
        `(function(){var T=${table},d=new Date(),c=T[d.getHours()];` +
        `try{var b=JSON.parse(localStorage.getItem("tg.boot")||"null");if(b&&b.color)c=b.color}catch(e){}` +
        `var r=document.documentElement;r.style.background=c;` +
        `r.dataset.sc=String(Math.floor(((d.getHours()+1)%24)/2))})()`;
      return [{ tag: "script", injectTo: "head-prepend", children: js }];
    },
  };
}

export default defineConfig({
  plugins: [bootPaint()],
  // 版本號只有 package.json 一個來源，設定頁的「關於」直接讀這個
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Vite 8 走 oxc，不是 esbuild。JSX 直接編到 preact/jsx-runtime，不裝 preset 外掛。
  oxc: { jsx: { runtime: "automatic", importSource: "preact" } },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // MV3 不准遠端程式碼，全部要打包進去。Edge 120 以上才有我們用到的容器查詢。
    target: "chrome120",
    modulePreload: { polyfill: false },
  },
});
