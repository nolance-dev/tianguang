# 天光 · Aubade

Edge 新分頁擴充功能。以十二時辰與二十四節氣為底色，背景隨天光流轉。

中英文是兩個品牌而不是翻譯：`zh_TW` 叫天光、外環走二十四節氣；`en` 叫
Aubade、十二時辰換成十二個光相（Small Hours、Zenith、Golden Hour…）、
節氣換成傳統滿月名。同一個套件、同一次上架，商店依語系顯示。

## 載進 Edge 看

```bash
npm install
npm run icons     # 產生四個尺寸的圖示（純 node，不裝繪圖套件）
npm run build
```

然後：

1. 打開 `edge://extensions`
2. 右下角開啟「開發人員模式」
3. 「載入解壓縮」，選這個專案的 `dist` 資料夾
4. Edge 會問一次要不要保留新分頁的變更 — 選保留
5. 開一個新分頁

想換回 Edge 原本的新分頁，回 `edge://extensions` 把天光停用即可。
停用不會刪掉設定。

想看英文版：把 Edge 的顯示語言換成英文，或直接改 `edge://settings/languages`。

## 開發

```bash
npm run dev       # 一般網頁，沒有 chrome.* API，字串包退回本機檔案
npm test          # 45 個測試
npm run build     # tsc --noEmit 之後才打包
```

`npm run dev` 之下沒有 `chrome.i18n`，i18n 會依 `navigator.language`
退回 `public/_locales` 裡的 `zh_TW` 或 `en`。這段被 `import.meta.env.DEV`
包住，正式打包會被搖掉（已驗證）。

## 目前進度

P1 完成：骨架、時辰引擎、節氣、背景插值、無白閃啟動、時鐘、問候語、搜尋列、
四語系、設定儲存與遷移。

接下來 P2 是快速連結與天氣，P3 是工作區與 Ctrl K 指令面板。

## 幾個不明顯的決定

**節氣用算的，不查表。** 原本打算打一張 2026–2036 的日期表，後來改用低精度
太陽視黃經公式（Meeus 第 25 章），三十行、誤差約 0.004 度。表要維護會過期，
公式不會。`test/solar.test.ts` 拿 2026 年十五個交節時刻驗過跨界。

**首屏底色由打包時算出來。** `index.html` 的 head 裡有一段同步 inline script，
先把整頁塗成接近最終結果的底色，之後才掛 Preact——使用者看不到白畫面。
那二十四筆顏色是 `vite.config.ts` 從 `src/lib/mesh.ts` 算出來注入的，
調色盤只有一個真相來源。

**設定整份存成一項，不是一個欄位一項。** `chrome.storage.sync` 的限制不只
每項 8KB，還有最多 512 項與每分鐘 120 次寫入。寫入 debounce 300ms，
sync 失敗降級寫 local 並提示一次，不靜默吞掉。

**權限只宣告當下用得到的。** 目前只有 `storage`。`topSites` 等到 P2 真的
要用了再加——上架時每個權限都要逐條解釋，提早宣告只會多一條要辯護的。
