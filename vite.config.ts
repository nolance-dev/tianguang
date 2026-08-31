import { defineConfig, type Plugin } from "vite";
import { bootColorTable } from "./src/lib/mesh.ts";
import pkg from "./package.json" with { type: "json" };

/**
 * 首屏不能白閃。
 *
 * chrome.storage 是非同步的，第一次繪製前來不及回來；等 Preact 掛載更晚。
 * 所以 head 裡放一段同步 inline script，先把整頁塗成接近最終結果的底色，
 * 之後 app 起來再換上完整漸層 —— 使用者永遠看不到白畫面。
 *
 * 那二十四筆底色是打包時從 mesh.ts 算出來的，不是另外手寫一份。
 * 調色盤只有一個真相來源，改了 ANCHORS 這裡自動跟著變。
 */
function bootPaint(): Plugin {
  return {
    name: "tg-boot-paint",
    transformIndexHtml() {
      const table = JSON.stringify(bootColorTable());
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
