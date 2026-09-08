# 天光 · Aubade

一個新分頁擴充功能。不放推薦內容、不放廣告、不問你要不要登入。
支援 Microsoft Edge 與 Google Chrome。

中英文是兩個品牌而不是翻譯：`zh_TW` 叫天光，外環走二十四節氣；`en` 叫
Aubade，十二時辰換成十二個光相（Small Hours、Zenith、Golden Hour…），
節氣換成傳統滿月名。同一個套件，語言可以在設定裡直接選，不必跟著瀏覽器。

## 它做什麼

**背景是一天的光。** 十二個時辰各有一組顏色，從航海曙光、日出、日中，
一路走到黃昏與夜半。字色不是挑好的，是照背後的亮度即時算出來的 ——
每一刻都保證讀得到（WCAG AA，`src/lib/mesh.ts`）。

**時辰盤。** 點一下時鐘，整頁變成一座盤：二十四小時、十二時辰、二十四節氣、
二十八宿的四象，以及今天的日出日落弧。節氣是用低精度太陽視黃經公式算的，
不是查表。

**工作區。** 往下捲還有一整屏：待辦、隨手記、番茄鐘、日曆、天氣（拉大變雷達
回波圖）、快速存取、照片牆、正在播放。每張卡都能拖著換位置、拉著改大小，
變大之後顯示的內容也跟著變多。鍵盤也能改版面：方向鍵改大小，Shift+方向鍵
換位置。

**東西留在你自己的瀏覽器。** 沒有帳號、沒有伺服器、沒有分析追蹤。設定與版面
走瀏覽器自己的同步，進度留在本機。設定裡可以把整份匯出成一個 JSON 檔。

## 開發

```bash
npm install
npm run build     # 打包到 dist/
npm test          # 單元測試
npm run e2e       # 真瀏覽器測試（Playwright，用系統裝好的 Edge）
```

載進瀏覽器看：

1. 打開 `edge://extensions` 或 `chrome://extensions`
2. 開啟「開發人員模式」
3. 「載入解壓縮」，選 `dist` 資料夾
4. 瀏覽器會問一次要不要保留新分頁的變更 —— 選保留

停用不會刪掉設定，隨時可以開回來。

### 其他指令

| 指令 | 做什麼 |
| --- | --- |
| `npm run dev` | 開發伺服器。沒有 `chrome.*` API，i18n 退回字串包 |
| `npm run icons` | 重新產生四個尺寸的圖示 |
| `npm run store` | 商店的方形圖與宣傳圖 |
| `npm run shots` | 商店截圖（需要先跑 `vite preview`） |
| `npm run pack` | 兩家商店各一份 zip，放在 `release/` |

## 幾個不明顯的決定

**節氣用算的，不查表。** 低精度太陽視黃經公式（Meeus 第 25 章），三十行、
誤差約 0.004 度。表要維護會過期，公式不會。`test/solar.test.ts` 拿十五個
交節時刻驗過跨界。

**首屏底色是打包時算出來的。** `boot.js` 在第一次繪製前同步把整頁塗成接近
最終結果的底色，之後才掛 Preact —— 使用者看不到白畫面。那二十四筆顏色由
`scripts/gen-boot-colors.mjs` 從 `src/lib/mesh.ts` 算出來，調色盤只有一個
真相來源。它必須是外部檔而不是 inline：MV3 的預設 CSP 是 `script-src 'self'`，
inline script 一律被擋，而 `extension_pages` 不收 sha256 hash。

**設定整份存成一項。** `chrome.storage.sync` 的限制不只每項 8KB，還有最多
512 項與每分鐘 120 次寫入。寫入 debounce 300ms，sync 失敗降級寫 local
並提示一次，不靜默吞掉。

**權限只在使用者按下去的那一刻要。** `tabs`、`bookmarks`、`history`、
`sessions`、`downloads`、`scripting` 全部是 `optional_permissions`，走
`chrome.permissions.request()`；不點那些功能就永遠不會被問到。
每一條的用途寫在 [`docs/STORE.md`](docs/STORE.md)。

**播放控制是逐站的，而且選擇器是量出來的。** 瀏覽器沒有給擴充功能全域媒體
控制的 API，`navigator.mediaSession` 的處理器是頁面自己註冊的、從外面叫不動。
所以「正在播放」的播放／暫停是注進那個分頁去抓 `<video>`／`<audio>`，
上一首／下一首則是點該站自己的按鈕 —— 那幾條選擇器由
`tools/probe-media.mjs` 實地量出來，量不到的站就不長那兩顆鈕。
宣告的是十個具名網站而不是 `<all_urls>`，而且是按下去的那一刻才向
那一個網域要權限。

**語言存在 signal 裡，不是普通變數。** `@preact/signals` 給每個元件裝了
`shouldComponentUpdate`，props 淺比較沒變、訂閱的 signal 也沒動就不重繪。
搜尋列只有一個 `engineId` prop，換語言時它一動也不動 —— 量過，整場只算繪
一次，placeholder 會卡在上一種語言。`t()` 讀那個 signal，任何叫過 `t()`
的元件就自動訂閱到語言上。

## 隱私

沒有帳號、沒有伺服器、沒有分析。對外的請求只有幾個公開網域，而且都要
使用者自己開啟功能才會發生：Open-Meteo（天氣與地名查詢）、RainViewer
（雷達圖磚）、Google 公開的 iCal 行事曆（國定假日）。
詳見 [`docs/PRIVACY.md`](docs/PRIVACY.md)。

## 支援開發

天光不放廣告，也沒有付費版。如果它成了你一天的一部分：
[ko-fi.com/nolance](https://ko-fi.com/nolance)

## 授權

**保留所有權利。** 原始碼公開是為了讓你能自己確認它沒有偷偷做什麼 ——
上架時要求的那些權限，你不必只聽我說。

公開不等於開放授權：未經同意，不得重新散布、重新上架，或以本專案為基礎
發行衍生作品。歡迎閱讀、回報問題、提出建議。
