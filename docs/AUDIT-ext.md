# 天光 / Aubade — 上架前稽核（封裝、平台整合、發佈面）

稽核日期：2026-09-02　　稽核範圍：`public/`、`dist/`、build config、`docs/`、`src/` 裡的 Chrome/Edge API 使用
稽核對象：`C:\Users\User\Projects\tianguang`，HEAD = `f813f30`
瀏覽器：`Edg/152.0.4191.53`（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）

本檔只做記錄，未修改專案任何其他檔案。

---

## ⚠️ 先講一件事：稽核期間 `dist/` 被別的行程改過

我第一次列檔案時 `dist/` 只有 `_locales/ assets/ icons/ index.html manifest.json`。
稽核進行到一半，出現了兩個新檔：

```
-rw-r--r-- 1 User 197121  987 2026-09-02 15:21:07 dist/index.html      ← 被改寫
-rw-r--r-- 1 User 197121  933 2026-09-02 15:20:36 dist/index.html.orig ← 備份
-rw-r--r-- 1 User 197121 3225 2026-09-02 15:21:25 dist/probe.js        ← 新增
```

`dist/probe.js` 第 1 行自述 `// TEMPORARY AUDIT PROBE - dist only`，內容是一支無障礙檢查腳本
（列舉 focusable 元素、檢查 `img` 缺 `alt`、`svg` 缺 `aria-hidden`）。
`dist/index.html` 第 14 行被插入 `<script src="/probe.js"></script>`。

**這是同時進行的另一份稽核留下的，不是專案原本的東西，但它現在在 `dist/` 裡。**
稽核結束時 `dist/` 已經長成這樣（`scenario.js` 是後來又冒出來的第三個）：

```
$ ls dist/
_locales  assets  icons  index.html  index.html.orig  manifest.json  probe.js  scenario.js
```

`npm run zip` 是 `Compress-Archive -Path *`，會把這些全部一起打包上傳。
**打包前務必把 `dist/` 砍掉重跑 `npm run build`**——不要只刪你看得到的那幾個檔，
因為外部行程還在寫，你不知道清單什麼時候又變長。乾淨的 `dist/` 應該只有：
`_locales/ assets/ icons/ index.html manifest.json`（修完 A-1 之後再多一支 `boot.js`）。

為了不受干擾，下面所有 `dist/` 的實測都是對一份乾淨副本做的：
`scratchpad/A/`（= `index.html.orig` 還原成 `index.html`、刪掉 `probe.js`）。
已驗證該副本與 `npx vite build` 的全新產物逐位元組相同（見 C-1）。

---

# (A) 上架阻斷項 — 必須修，否則會壞掉或被退件

## A-1 【最高優先】`index.html` 的 inline bootstrap script 在擴充功能裡**被 CSP 擋掉，完全沒有執行**

`vite.config.ts` 的 `bootPaint()` plugin 把一段同步 inline script 注入 `<head>`，
用途是「首屏不能白閃」——在 Preact 掛載前先把整頁塗成當下時辰的底色。

MV3 的 extension pages 預設 CSP 是 `script-src 'self'; object-src 'self'`，
`public/manifest.json` **沒有** `content_security_policy` 這個 key，所以吃預設值。
預設值不允許 inline script。它在 `vite dev`（http）下能跑，載成擴充功能就不行——
正是你懷疑的那一點，實測確認了。

### 實測

用 `--load-extension=` 載入乾淨的 `dist` 副本，開 `chrome-extension://<id>/index.html`，
透過 CDP 收 `Log.entryAdded`：

```
 [security/error] Executing inline script violates the following Content Security Policy
 directive 'script-src 'self''. Either the 'unsafe-inline' keyword, a hash
 ('sha256-ZCVDIWpqca+uHzItdVlhyt8+3UYnvUYOYCF0/cdZIvU='), or a nonce ('nonce-...')
 is required to enable inline execution. The action has been blocked.
 (chrome-extension://ckijgckljlejlenlbdfdbnhdhpkcejkh/index.html:3)
```

同一則錯誤在 Edge 的 stderr 也有：

```
[41776:21140:0902/152120.561:INFO:CONSOLE:4] "Executing inline script violates ...
The action has been blocked.", source: chrome-extension://.../index.html (4)
```

頁面狀態佐證（`Runtime.evaluate` 讀 `document.documentElement.style.background`）：

```
{"inlineBg":"","sc":"8","appChildren":6,"title":"新分頁","lang":"en-US","name":"Aubade"}
```

`inlineBg` 是空字串 → boot script 的 `r.style.background = c` 從未執行。
`appChildren: 6` 表示 Preact 本體有正常掛載，**壞掉的只有防白閃這一層**，
所以症狀是「開新分頁先閃一下白，然後才上色」，不是整個擴充功能死掉——
很容易在開發模式下被忽略。

### 修法：**不能**用 CSP hash，只能把 script 外部化

我實測了兩種修法。

**變體 B — 在 manifest 加上 Edge 自己建議的那個 sha256 hash：**

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'sha256-ZCVDIWpqca+uHzItdVlhyt8+3UYnvUYOYCF0/cdZIvU='; object-src 'self'"
}
```

結果是**整個擴充功能載不進去**：

```
WARNING:extensions\browser\load_error_reporter.cc:73] Extension error: We couldn't load
the extension from: ...\scratchpad\B. 'content_security_policy.extension_pages':
Insecure CSP value "'sha256-ZCVDIWpqca+uHzItdVlhyt8+3UYnvUYOYCF0/cdZIvU='" in directive 'script-src'.
```

頁面端：`granted permissions: {}`、`[netfail] Document net::ERR_BLOCKED_BY_CLIENT`。
**MV3 的 `extension_pages` 不接受 hash source。** 錯誤訊息裡那句建議是 Blink 的通用文案，
對擴充功能無效。這條路是死的。

**變體 C — 把那段 script 抽成 `dist/boot.js`，`index.html` 改成 `<script src="/boot.js"></script>`：**

```
{"inlineBg":"rgb(176, 180, 188)","sc":"8","appChildren":6,"title":"新分頁","lang":"en-US","name":"Aubade"}
```

`inlineBg` 有值了，CSP 錯誤消失。**這是唯一可行的修法。**

實作上就是把 `vite.config.ts:31` 的
`return [{ tag: "script", injectTo: "head-prepend", children: js }]`
改成用 `this.emitFile()` 產出一支 `boot.js`，再回
`[{ tag: "script", injectTo: "head-prepend", attrs: { src: "/boot.js" } }]`。
`boot-colors.json` 的單一真相來源不受影響。

---

## A-2 英文介面上顯示原始 i18n key：`sc_suffix`

實際截圖（`--lang` 預設 en-US，`chrome.i18n.getUILanguage()` = `en-US`）左上角顯示：

```
Long Lightsc_suffix
15 — 17
```

`Long Light` 是 `sc_*` 的光相名，後面直接接了原始鍵名 `sc_suffix`。

### 根因

`public/_locales/en/messages.json` 刻意把 `sc_suffix` 設成空字串（英文沒有「時」這個後綴）：

```
$ node -e "for(const l of ['en','ja','zh_CN','zh_TW'])console.log(l, JSON.stringify(require('./public/_locales/'+l+'/messages.json').sc_suffix));"
en {"message":""}
ja {"message":"の刻"}
zh_CN {"message":"時"}
zh_TW {"message":"時"}
```

而 `src/lib/i18n.ts:31`：

```ts
const msg = chrome.i18n.getMessage(key, subs);
// 找不到鍵時 chrome 回空字串。回傳鍵名比回傳空白好除錯。
return msg || key;
```

`msg || key` 分不出「查無此鍵」（回 `""`）和「這個鍵的值就是空字串」。
刻意留白的翻譯因此被當成缺鍵，回傳鍵名。

### 影響範圍（三個地方，都在英文預設畫面上）

```
src/ui/App.tsx:299        {t("sc_suffix")}
src/ui/ClockCard.tsx:51   {t("sc_suffix")} · {shichenAlt(sc)}
src/ui/Dial.tsx:422       {t("sc_suffix")}
```

### 修法

`msg || key` 改成分辨「有定義但為空」。最短的寫法是只在 key 完全查不到時才 fallback，
例如把空字串當合法值：`return msg === "" && !HAS[key] ? key : msg`——
但 `chrome.i18n` 沒有「這個鍵存在嗎」的 API，所以實務上最省的是
**不要把 `sc_suffix` 設成空字串**，改成一個空白或直接讓三個呼叫端在英文下不渲染它。
（`isEnglish()` 已經存在，`i18n.ts:50`。）

---

## A-3 `ja` 與 `zh_CN` 各缺 106 個字串，佔全部的三分之一

```
$ node scratchpad/i18n.mjs
locales: en, ja, zh_CN, zh_TW
  en: 298 keys
  ja: 218 keys
  zh_CN: 218 keys
  zh_TW: 310 keys
  union: 324 keys
```

`ja` 和 `zh_CN` 各缺 **106** 個鍵（兩者缺的完全是同一組）。缺的是 P2–P4 之後加的全部功能：

- 番茄鐘整屏：`fo_*` **30 個全缺**
- 日曆：`cal_*` 全缺、`c_calendar`、`s_card_calendar`
- 天氣／雷達：`wx_loading` `wx_zoom_in` `wx_zoom_out` `wx_radar_ask` `wx_radar_allow` `wx_radar_none` `c_weather` `s_card_weather`
- 媒體卡：`c_media*` 全缺、`s_card_media`
- 照片牆：`c_photos*` 全缺、`s_card_photos`
- 快速連結：`c_links` `s_card_links`
- 引言、版面編輯、節日、第二曆：`s_quote*` `s_desk*` `s_holidays*` `s_second_cal` `s_cal_*`
- `c_resize` `sheet_back` `card_expand` `c_clock` `s_card_clock`

**這不會顯示原始鍵名**——`chrome.i18n` 缺鍵時會退回 `default_locale`（`zh_TW`）。
已實測確認：用 `--lang=ja` 載入，`chrome.i18n.getMessage('extensionName')` 回 `"天光"`
（zh_TW 的值），而 `ja/messages.json` 自己的 `extensionName` 也剛好是 `"天光"`，
所以這一則看不出差別；但 `fo_*` 那 30 個在 `ja` 完全不存在，日文使用者按下番茄鐘，
整個面板會是**繁體中文**。

```
=== page state (--lang=ja) ===
{"inlineBg":"","sc":"8","appChildren":6,"title":"新分頁","lang":"ja","name":"天光"}
```

日文與簡中的商店描述已經寫好了（`extensionDescription` 四語系都有），
所以商店頁會用日文招攬使用者，裝進去卻是繁中介面。這是上架後最快收到負評的一種落差。

**選項**：要嘛補完 212 個字串，要嘛這一版先只送 `en` + `zh_TW`，把 `ja/` `zh_CN/` 移出
`public/_locales/`（商店語系列表跟著縮小，但呈現是誠實的）。

---

# (B) 真正的缺陷，但不擋上架

## B-1 `npm run zip` 產生的 ZIP 用反斜線當路徑分隔字元

`package.json:11`：

```json
"zip": "cd dist && powershell Compress-Archive -Path * -DestinationPath ../tianguang.zip -Force"
```

Windows PowerShell 5.1 的 `Compress-Archive` 存進去的 entry name 是反斜線：

```
PSVersion: 5.1.26100.4768
--- zip entries (FullName as stored) ---
assets\index-BMf4G3wJ.css
assets\index-DuGiLbFI.js
icons\icon128.png
_locales\en\messages.json
index.html
manifest.json
```

ZIP 規格（APPNOTE 4.4.17.1）要求一律用正斜線。
**誠實地說：Info-ZIP 的 `unzip` 很寬容，會正確還原成目錄樹**（我實測過，結構完好），
所以這不是必然失敗。但嚴格照規格解的解壓器（Python `zipfile`、Java `ZipInputStream`）
會產出檔名字面上就叫 `assets\index-BMf4G3wJ.css` 的**平鋪檔案**，
於是 `manifest.json` 找得到、`icons/icon16.png` 和 `_locales/*/messages.json` 全部找不到，
上傳會以「圖示載入失敗」之類的理由被退。

風險不對稱：踩到就是退件重來，修起來是一行。改用 `tar -a -c -f`（Windows 10+ 內建 bsdtar，
寫正斜線）或 `7z`，或在 `Compress-Archive` 後跑一支把 entry name 正規化的腳本。

順帶：`-Path *` 會把 `dist/` 裡任何東西都掃進去——目前就包含 A-0 提到的 `probe.js` 和 `index.html.orig`。

## B-2 分頁標題永遠是繁體中文「新分頁」，不隨語系變

`index.html:6`：

```html
<title>&#26032;&#20998;&#38913;</title>
```

實測四種語系下 `document.title` 都是 `"新分頁"`：

```
lang=en-US → {"title":"新分頁", "name":"Aubade"}
lang=ja    → {"title":"新分頁", "name":"天光"}
```

英文品牌叫 Aubade，分頁標題卻是「新分頁」。修法是在 `main.tsx` 掛載時
`document.title = t("...")`，並在四個語系補一個 key（目前沒有這個 key，
`grep` 過 `dial_title settings_title links_empty_title links_add_title pal_title sx_title s_tab_*` 都不是）。

## B-3 `zh_CN` 有三處繁體字沒轉

```
$ node -e "...掃描 zh_CN 的繁體字..."
  sc_suffix           "時"     <-- 時
  scalt_4             "食時"   <-- 時
  scalt_8             "哺時"   <-- 時
total entries with Traditional-only chars: 3
```

簡體應為「时」「食时」「哺时」。這三個都在時辰盤的常駐畫面上，簡中使用者一開新分頁就看得到。

## B-4 九個 message key 定義了但整個 `src/` 沒有任何地方引用

用「靜態 `t("...")` + 動態前綴展開 + 全域字面量比對」三種方式掃過 `src/**/*.{ts,tsx}` 都沒命中：

| key | 定義在哪些語系 |
|---|---|
| `c_focus` `c_focus_hint` `c_focus_change` `c_done` `sx_title` | en, ja, zh_CN, zh_TW |
| `c_weather` `c_clock` | en, zh_TW |
| `c_pomo_work` `c_pomo_rest` | ja, zh_CN（**en / zh_TW 反而沒有**）|

`c_pomo_work` / `c_pomo_rest` 只存在於 ja 和 zh_CN，形態上是「番茄鐘改版時 en/zh_TW 更新了、
ja/zh_CN 沒跟上」的殘留，正好對應 A-3 那個 106 鍵的缺口。
不影響執行，但每一個都是審查時可能被問到的死重。

（`extensionName` / `extensionDescription` 不算——它們由 `manifest.json` 的
`__MSG_extensionName__` / `__MSG_extensionDescription__` 使用。）

## B-5 底圖圖磚打到 `services.arcgisonline.com`，這個網域沒有出現在任何宣告或說明裡

`src/lib/radar.ts:143`：

```ts
return `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/${z}/${y}/${x}`;
```

技術上沒錯：圖磚是 `<img>`，不需要 host permission（`radar.ts:17` 的註解也講明了）。
問題在**透明度**：使用者按下雷達開關時，權限對話框只會出現 `api.rainviewer.com`，
但實際上 Esri 也拿到了一串能還原出使用者所在城市的 z/x/y 座標。

畫面上有標註（`src/ui/Radar.tsx:167`：`RainViewer · Esri, HERE, © OpenStreetMap`），
但那是版權標註，不是隱私揭露。Edge Add-ons 送審時要列出所有會連到的遠端主機，
`services.arcgisonline.com` 和 `tilecache.rainviewer.com` 都要寫進去，
不能只寫 `optional_host_permissions` 裡那四個。

---

# (C) 檢查過、確認沒問題的部分

## C-1 `dist/` 與原始碼同步，建置是可重現的

`npx vite build --outDir <scratch>` 的產物與交付的 `dist/`（清掉外來檔後）**逐位元組相同**：

```
SAME  ./_locales/en/messages.json      SAME  ./assets/index-BMf4G3wJ.css
SAME  ./_locales/ja/messages.json      SAME  ./assets/index-DuGiLbFI.js
SAME  ./_locales/zh_CN/messages.json   SAME  ./icons/icon16.png … icon128.png
SAME  ./_locales/zh_TW/messages.json   SAME  ./index.html
                                       SAME  ./manifest.json
```

`public/_locales/*` 與 `dist/_locales/*` 也四個語系全部 identical。

## C-2 typecheck 乾淨、測試全綠

```
$ npx tsc --noEmit
exit=0

$ npm test
 Test Files  16 passed (16)
      Tests  242 passed (242)
   Duration  45.10s
```

（`README.md` 寫「45 個測試」，實際 242 個——文件過期，不是缺陷。）

## C-3 沒有遠端程式碼、沒有 `eval`、沒有 CDN 資產、沒有 Google Fonts

掃過建置產物：

```
$ node -e "...檢查 dist/assets/index-DuGiLbFI.js..."
has eval(: false
has new Function(: false
bundle bytes: 110560
```

CSS 裡唯一的 `url()` 是一個 inline 的 `data:image/svg+xml`（雜訊紋理，`src/styles.css:87`），
沒有 `@import`、沒有 `@font-face`、沒有任何遠端字型：

```
$ grep -oE "https?://[^\")' ]+" dist/assets/index-BMf4G3wJ.css | sort -u
http://www.w3.org/2000/svg      ← 只是 SVG namespace，不是請求
```

字型全部走 `var(--f-cjk)` / `--f-latin` / `--f-mono` 的系統字型堆疊。
`vite.config.ts` 的 `build.target: "chrome120"` 與 `modulePreload.polyfill: false` 都合理。

## C-4 開發模式的字串包確實被 tree-shake 掉了

`src/lib/i18n.ts:12-13` 無條件 `import` 了 zh_TW 和 en 兩份 `messages.json`，
只在 `import.meta.env.DEV` 分支裡用。實測正式產物裡兩份都不在：

```
zh_TW extensionName = "天光" present in bundle: false
en extensionName = "Aubade" present in bundle: false
```

README 說「已驗證」——確實如此。

## C-5 四個圖示尺寸齊全，而且是真的 PNG

```
dist/icons/icon16.png   500B sig=89504e470d0a1a0a IHDR 16x16   bitDepth=8 colorType=6 validPNG=true
dist/icons/icon32.png   962B sig=89504e470d0a1a0a IHDR 32x32   bitDepth=8 colorType=6 validPNG=true
dist/icons/icon48.png  1491B sig=89504e470d0a1a0a IHDR 48x48   bitDepth=8 colorType=6 validPNG=true
dist/icons/icon128.png 3481B sig=89504e470d0a1a0a IHDR 128x128 bitDepth=8 colorType=6 validPNG=true
```

尺寸與 `manifest.json` 宣告一致，IHDR 的實際寬高與檔名相符（不是把同一張改名），
`public/` 與 `dist/` 的四個檔逐位元組相同。

## C-6 權限：宣告的都有用到，用到的都有宣告

| 宣告 | 使用位置 | 判定 |
|---|---|---|
| `storage` | `settings.ts:176,226` `workspace.ts:203` `weather.ts:209` `holidays.ts:123` | ✅ |
| `topSites` | `links.ts:77-79` `chrome.topSites.get()` | ✅ |
| `favicon` | `links.ts:69` `chrome.runtime.getURL("/_favicon/")` | ✅ |
| opt `tabs` | `media.ts:72,81,89` `palette.ts:94,186` | ✅ |
| opt `bookmarks` | `palette.ts:109-111` | ✅ |
| opt `history` | `palette.ts:124-126` | ✅ |
| opt `sessions` | `palette.ts:139-140,189-190` | ✅ |
| opt `downloads` | `palette.ts:166-167` | ✅ |
| opt host `api.open-meteo.com` | `weather.ts:14,243` | ✅ |
| opt host `geocoding-api.open-meteo.com` | `weather.ts:13,182` | ✅ |
| opt host `api.rainviewer.com` | `radar.ts:19,168` | ✅ |
| opt host `calendar.google.com` | `holidays.ts:47,157` | ✅ |

**沒有多餘的權限，也沒有用了卻沒宣告的權限。**
`chrome.windows.getCurrent/update`（`media.ts:91` `MediaCard.tsx:36`）不需要獨立權限。
`chrome.permissions.*` 本身不需宣告。

實際載入後瀏覽器授予的：

```
granted permissions: {"origins":[],"permissions":["storage","topSites","favicon","newTabPageOverride"]}
```

`origins: []`——四個 host permission 全都是 optional，安裝當下一個都沒拿，符合設計。
`newTabPageOverride` 是 `chrome_url_overrides.newtab` 帶來的隱含權限。

README 最後一段說「權限只宣告當下用得到的，目前只有 `storage`」——**這句已經過期**，
現在是三個必要加九個 optional。不是缺陷，是文件沒跟上。

## C-7 預設新分頁**完全不發任何對外請求**

這是最重要的隱私結論，實測得到。CDP 收 `Network.requestWillBeSent`，
乾淨 profile、首次開啟新分頁，全部的請求是：

```
chrome-extension://<id>/index.html
chrome-extension://<id>/assets/index-DuGiLbFI.js
chrome-extension://<id>/assets/index-BMf4G3wJ.css
data:image/svg+xml;utf8,<svg ...>          ← CSS 的雜訊紋理
```

**零個外部主機。** 沒有 telemetry、沒有 phone-home、沒有遠端字型、沒有 CDN。
天氣、雷達、節日全部要使用者先在手勢裡授權 optional host permission 才會動。
ROADMAP 說「拉大才載圖磚，預設大小一張圖都不該抓」——確實做到了。

## C-8 manifest 的基本欄位

| 欄位 | 值 | 判定 |
|---|---|---|
| `manifest_version` | `3` | ✅ |
| `name` | `__MSG_extensionName__` | ✅ 四語系都有定義 |
| `description` | `__MSG_extensionDescription__` | ✅ 四語系都有定義，長度都在 132 字元商店上限內 |
| `version` | `0.1.0` | ✅ 合法，與 `package.json` 一致（`vite.config.ts:37` 用 `define` 注入 `__APP_VERSION__`，單一來源）|
| `default_locale` | `zh_TW` | ✅ `public/_locales/zh_TW/` 存在 |
| `icons` | 16/32/48/128 | ✅ 見 C-5 |
| `chrome_url_overrides.newtab` | `index.html` | ✅ 實測生效，Edge 會跳「保留變更」提示 |

`minimum_edge_version: "120"` 載入時沒有觸發任何 `Unrecognized manifest key` 警告。

## C-9 favicon 走瀏覽器內建快取，不對外抓圖

`src/lib/links.ts:66-73` 用 `chrome.runtime.getURL("/_favicon/")` + `pageUrl` query，
這是瀏覽器本機的 favicon 快取，離線可用，而且**不會把使用者開過哪些站洩漏給第三方**。
比起常見的 `google.com/s2/favicons?domain=` 這是明顯正確的選擇。

## C-10 外部服務的授權標註有做

- `src/ui/Weather.tsx:80`：`Open-Meteo · CC BY 4.0`（免費層依 CC BY 4.0 強制要求標註）
- `src/ui/Radar.tsx:167`：`RainViewer · Esri, HERE, © OpenStreetMap`
- `src/ui/Settings.tsx:481-485`：設定頁「關於」有連到 `https://open-meteo.com/`

## C-11 對外請求的參數沒有夾帶識別資訊

| 請求 | 參數 | 洩漏什麼 |
|---|---|---|
| `geocoding-api.open-meteo.com/v1/search` | `name`（使用者自己打的城市名）、`count`、`language`、`format` | 使用者查了哪個城市 |
| `api.open-meteo.com/v1/forecast` | `latitude`/`longitude`（`toFixed(4)`，約 11 公尺）、`timezone=auto`、`forecast_days=4` | 座標 |
| `api.rainviewer.com/public/weather-maps.json` | 無參數 | 無 |
| `tilecache.rainviewer.com/.../{z}/{x}/{y}/...` | 圖磚座標 | 大致位置 |
| `services.arcgisonline.com/.../{z}/{y}/{x}` | 圖磚座標 | 大致位置（見 B-5）|
| `calendar.google.com/calendar/ical/...` | 國碼 + 語系 | 使用者在哪一國 |

**座標來自使用者手動輸入的城市名，不是 IP 定位、不是 geolocation API**
（`weather.ts:8` 的註解明講，程式碼也符合——全檔沒有 `navigator.geolocation`）。
沒有 cookie、沒有 user id、沒有自訂 header。
`toFixed(4)` 對天氣來說精度過剩（小數兩位就夠了），但那是使用者自己給的城市中心點，不是他的實際位置。

## C-12 離線降級有做

- 天氣：`weather.ts:248-250` `catch { return usable ? { ...usable, stale: true } : null }`，
  快取在 `chrome.storage.local`，`FRESH_MS = 30 分鐘`，拿不到就顯示上一次成功的值加「離線」標記。
- 雷達：`radar.ts:172-175` 拿不到 index 就 `return null`，呼叫端顯示底圖加一句取不到。
- 節日：`holidays.ts` 有 `chrome.storage.local` 快取。
- ROADMAP 記錄的兩個 HTTP 200 陷阱（CARTO 浮水印、RainViewer z7 以上的灰卡）都已經繞開，
  `RADAR_MAX_Z = 7` 在 `radar.ts:31`，超過就抓 z7 放大貼。

---

# (D) 建議，不是缺陷

## D-1 `README.md` 有兩處過期敘述

- 「`npm test` # 45 個測試」→ 實際 242 個。
- 「權限只宣告當下用得到的。目前只有 `storage`。`topSites` 等到 P2 真的要用了再加」
  → 現在是 `storage` + `topSites` + `favicon` 加九個 optional。
- 「目前進度：P1 完成 … 接下來 P2 是快速連結與天氣，P3 是工作區與 Ctrl K 指令面板」
  → 這些都做完了（`links.ts` `weather.ts` `workspace.ts` `palette.ts` 都在），
  ROADMAP 也寫「四項都做完了」。README 停在 P1。

## D-2 `optional_permissions` 一次列五個，審查時要逐條解釋

`tabs` `bookmarks` `history` `sessions` `downloads` 全部只服務一個功能：Ctrl-K 指令面板
（`src/lib/palette.ts`）。程式面沒問題（都是 optional、都在使用者手勢裡才請求、
`Palette.tsx:51-53` 會先 `contains()` 再顯示），但 `history` 和 `downloads` 是審查最敏感的兩個。
送審說明裡把「這五個都只用於本機的指令面板搜尋、結果不離開瀏覽器」寫清楚會省一輪往返。

## D-3 `toFixed(4)` 可以降到 `toFixed(2)`

`weather.ts:83-84`。天氣預報的網格解析度遠大於 11 公尺，兩位小數（約 1.1 公里）
一樣準，送出去的東西少一點。一行的事，不急。

---

# 補充實測：在真正載入的擴充功能裡直接問 `chrome.i18n` 與 `_favicon/`

上面 A-2、A-3 原本有一部分是從 `messages.json` 推論的。下面這一輪是在**實際載入的擴充功能頁面**
裡用 `Runtime.evaluate` 直接呼叫 `chrome.i18n.getMessage()` 和 `fetch()` 拿到的，三種 UI 語系各跑一次：

```
########## --lang 預設 (en-US) ##########
{"favicon":"200 type=image/bmp bytes=390","ui":"en-US",
 "fo_work":"Focus","cal_today":"Today","c_media":"Now playing",
 "sc_suffix":"\"\"","sc_0":"Small Hours","jq_0":"春分","moon_0":"Wolf Moon","bogus":"\"\""}

########## --lang=ja ##########
{"favicon":"200 type=image/bmp bytes=390","ui":"ja",
 "fo_work":"專注","cal_today":"今天","c_media":"正在播放",
 "sc_suffix":"\"の刻\"","sc_0":"子","jq_0":"春分","moon_0":"","bogus":"\"\""}

########## --lang=zh-CN ##########
{"favicon":"200 type=image/bmp bytes=390","ui":"zh-CN",
 "fo_work":"專注","cal_today":"今天","c_media":"正在播放",
 "sc_suffix":"\"時\"","sc_0":"子","jq_0":"春分","moon_0":"","bogus":"\"\""}
```

四個結論：

**1. A-2 的根因確認無誤。** 英文下 `getMessage("sc_suffix")` 回**空字串**，
而一個完全不存在的鍵 `getMessage("definitely_not_a_key")` 也回**空字串**。
兩者在 API 層面**完全無法區分**——`i18n.ts:31` 的 `msg || key` 因此必然把
「刻意留白的翻譯」誤判成「查無此鍵」而吐出鍵名。這不是推測，是量出來的。

**2. A-3 的退回行為確認：日文與簡中使用者實際看到的是繁體中文。**
`--lang=ja` 之下 `fo_work` 回 `"專注"`、`cal_today` 回 `"今天"`、`c_media` 回 `"正在播放"`
——全部是 `zh_TW`（`default_locale`）的繁體字串，不是日文，也不是原始鍵名。
簡中同理。所以症狀不是「畫面壞掉」，而是**日文介面裡混進整片繁體中文**，
比壞掉更難在測試時被發現，也更容易變成負評。

**3. `moon_*` 的保護是有效的，但很薄。** `moon_0` 在 ja / zh-CN 下回空字串
（因為 `moon_*` 只有 `en` 有，而 `en` 不是 `default_locale`，沒有東西可退回），
一旦被呼叫就會經由同一條 `msg || key` 吐出 `moon_0` 這串鍵名。
目前不會發生，因為 `i18n.ts:65` 的 `outerRingName()` 有 `isEnglish()` 擋著。
但這代表 A-2 那個 bug 的爆炸半徑不只 `sc_suffix` 一處——只要哪天有人把
`isEnglish()` 換成別的判斷，外環會整排變成鍵名。修 `msg || key` 才是根治。

**4. `_favicon/` 不需要 `web_accessible_resources`，manifest 目前是對的。**
`src/lib/links.ts:66-69` 的註解寫「走 `_favicon/` 需要 manifest 宣告 favicon 權限
**並把它列進 `web_accessible_resources`**」，而 `public/manifest.json` 沒有這個 key。
實測從擴充功能自己的頁面 fetch：

```
favicon: 200 type=image/bmp bytes=390
```

**回 200，拿到一張 390 位元組的真圖。** `web_accessible_resources` 管的是
「別的來源能不能存取」，擴充功能存取自己的資源不需要它。
**manifest 沒問題，是那行註解寫錯了**（可以順手改掉，但不影響上架）。

---

# (E) 上架前檢查清單 —— 對照 `docs/ROADMAP.md`

ROADMAP 最後一段「之後」列了四項上線前的事。逐項核實：

| ROADMAP 項目 | 實際狀態 | 依據 |
|---|---|---|
| **首次引導**（三步說明） | ❌ **完全沒做** | `grep -rniE "onboard\|firstrun\|first-run\|welcome\|intro\|tour"` 掃過 `src/` 與 `zh_TW/messages.json`，零命中（只有 `toUrl` 之類的假陽性）。四個語系也沒有任何引導用的字串。 |
| **設定匯入匯出**（一份 JSON） | ✅ **做完了** | `src/ui/Settings.tsx:767-800`：`new Blob([JSON.stringify(pack(value, work, at), null, 2)])` → `URL.createObjectURL` → `a.download = fileName(at)`；還原是 `<input type="file" accept="application/json,.json">` → `unpack(JSON.parse(await picked.text()))`。`src/lib/snapshot.ts` 有測試（`test/snapshot.test.ts`）。 |
| **無障礙驗收**（讀螢幕實走一遍） | ⚠️ 不在我的稽核範圍 | 但可以說一件事：稽核期間 `dist/` 裡出現的那支 `probe.js`（見開頭）正是在做這件事的自動化版本。**自動化掃描不等於 ROADMAP 說的「拿讀螢幕實際走一遍」**，那一項仍未完成。 |
| **上架素材**（商店圖、截圖、說明文字、每個權限的用途說明） | ❌ **完全沒做** | `docs/` 底下只有 `ROADMAP.md` 一個檔。全專案 `find` 過 `*screenshot*` `*promo*` `*store*`，零命中。 |

## 誠實的結論：現在還不能送審

擋在前面的是三件事，依修復成本排序：

1. **A-1（CSP inline script）** —— 改 `vite.config.ts` 一個 plugin，半小時，修法已驗證可行（變體 C）。
   不修的話「首屏不白閃」這個賣點在正式安裝下是假的。
2. **A-2（`sc_suffix` 顯示鍵名）** —— 改 `i18n.ts` 一行或改 en 的字串，十分鐘。
   這是英文使用者一開新分頁就看到的東西，商店截圖上都會有。
3. **上架素材 + 首次引導** —— 這是純工，不是技術問題，但沒有素材就送不出去。
   權限用途說明尤其要寫，因為 `optional_permissions` 一次列了五個（見 D-2）。

**A-3（ja / zh_CN 各缺 106 個字串）需要一個決定，不是一個修法**：
補完 212 個字串，或這一版先只上 `en` + `zh_TW`。我的建議是後者——
把 `ja/` 和 `zh_CN/` 移出 `public/_locales/`，商店語系少兩個，但呈現是誠實的；
等字串補齊再加回來，那是純加法，不會動到任何程式碼。

`B-1`（ZIP 反斜線）修起來是換一行指令，風險不對稱，建議一起處理。

## 打包前的機械檢查（給實際送審那天用）

```
1. rm dist/probe.js dist/index.html.orig      ← 稽核殘留，見本檔開頭
2. npm run build                              ← tsc --noEmit 之後才打包，已驗證乾淨
3. 確認 dist/ 只有 _locales assets icons index.html manifest.json（+ 修完 A-1 後的 boot.js）
4. 打包用會寫正斜線的工具，不要用 PowerShell 5.1 的 Compress-Archive（見 B-1）
5. 用 --load-extension= 載一次打包前的 dist，確認 console 沒有 CSP 錯誤
```

---

## 稽核方法附註

- 所有瀏覽器實測都是 `msedge.exe --headless=new --load-extension=<dist> --user-data-dir=<全新暫存 profile>`，
  透過 CDP（`Log.enable` / `Runtime.enable` / `Network.enable`）收錯誤與請求。
- 為避免受 `dist/` 被外部行程改寫的干擾，實測對象是 `dist/` 的乾淨副本
  （已驗證與 `npx vite build` 的全新產物逐位元組相同）。
- i18n 比對腳本、三個 CSP 變體、ZIP 測試檔都在
  `C:\Users\User\AppData\Local\Temp\claude\c--Users-User--claude\591797f1-882f-4580-b31c-e535e755d470\scratchpad\`。
- 本次稽核**只寫了這一個檔案**，專案其他檔案未經修改。

---
