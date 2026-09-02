import { defineConfig } from "@playwright/test";

/**
 * 真瀏覽器測試。
 *
 * jsdom 沒有版面引擎，所以有兩整塊功能一直沒有被測到：
 *
 *  - 卡片的拖曳與縮放。整份 vitest 裡沒有任何一個 pointer 事件。
 *  - 快速存取的排版。欄數是 ResizeObserver 量出來的，而 jsdom 沒有
 *    ResizeObserver —— 那個演算法從來沒有被執行過，只被「假裝」測過。
 *
 * 用系統已經裝好的 Edge（channel: msedge），不另外下載瀏覽器：這個擴充功能
 * 就是給 Edge 用的，拿它自己來測最準，也省掉一份幾百 MB 的相依。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // 打包一次，所有測試共用同一份產物 —— 測的是真的會出貨的東西
  webServer: {
    command: "npx vite preview --port 4321 --strictPort",
    url: "http://localhost:4321/",
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:4321/",
    channel: "msedge",
    viewport: { width: 1400, height: 1000 },
    // 失敗時留下能看的東西，不然只有一句 assertion 很難查
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
