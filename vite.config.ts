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
  /*
   * 這段必須是外部檔，不能 inline。
   *
   * MV3 的預設 CSP 是 script-src 'self'，inline script 一律擋掉，而
   * extension_pages 又不收 sha256 hash（填了整個擴充功能會載不進去）。
   * 開發伺服器不受這條約束，所以 inline 在 npm run dev 底下永遠是好的 ——
   * 真正載進 Edge 才會被拒，症狀只是「開新分頁先閃一下白」，不會報錯給使用者。
   * 這種只在打包後才發生的錯最難發現，所以 dev 和 build 都走同一個外部檔。
   */
  const source = () => {
    const table = readFileSync(
      new URL("./boot-colors.json", import.meta.url),
      "utf8",
    ).trim();
    return (
      `(function(){var T=${table},d=new Date(),c=T[d.getHours()];` +
      `try{var b=JSON.parse(localStorage.getItem("tg.boot")||"null");if(b&&b.color)c=b.color}catch(e){}` +
      `var r=document.documentElement;r.style.background=c;` +
      `r.dataset.sc=String(Math.floor(((d.getHours()+1)%24)/2))})()`
    );
  };

  return {
    name: "tg-boot-paint",

    // 開發伺服器上自己供這一支，才不會 dev 走 inline、build 走檔案兩套行為
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/boot.js") return next();
        res.setHeader("Content-Type", "text/javascript");
        res.end(source());
      });
    },

    generateBundle() {
      this.emitFile({ type: "asset", fileName: "boot.js", source: source() });
    },

    transformIndexHtml() {
      // 不加 type=module、不加 defer：要在第一次繪製前同步跑完
      return [
        { tag: "script", attrs: { src: "/boot.js" }, injectTo: "head-prepend" },
      ];
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
