# 上架素材

送審要填的東西全部在這一份。素材本身在 `assets/store/`，都是產生出來的，
不是手工畫的 —— 改了重跑就好，不必找原檔。

```bash
npm run icons                      # 分頁與擴充功能的圖示（16/32/48/128）
npm run store                      # 商店方形圖與宣傳圖
npx vite preview --port 4321 &     # 截圖要有東西可拍
npm run shots                      # 五張截圖，1280×800
npm run pack                       # 兩家商店各一份 zip
```

截圖拍的是 `dist/`，不是開發伺服器 —— 商店上放的必須是使用者真的會裝到的
那一份。時間是用 Playwright 的時鐘控制釘死的：這個擴充功能整張臉都由當下
幾點決定，照真實時間拍會拍出五張同一種顏色的圖，而「背景跟著天光走」正是
它要賣的東西。五張分別釘在卯時、午時、酉時、辰時、亥時。

**尺寸請以 Partner Center 與 Chrome Web Store 當下的要求為準**，這裡放的是常見的那一組
（方形圖 300、小宣傳圖 440×280、大宣傳圖 1400×560、截圖 1280×800）。

## 名字

| 欄位 | 繁體中文 | English |
| --- | --- | --- |
| 名稱 | 天光 | Aubade |
| 分頁上顯示 | 天光 Home Page | Aubade Home Page |

名稱只有一個來源：`_locales/*/messages.json` 的 `extensionName`，manifest 用
`__MSG_extensionName__` 取。分頁標題在後面接一句固定的 `Home Page`，兩種語言
都用英文 —— 它是名字的一部分，不是要翻譯的介面文字。

## 簡短說明

- **繁中**：以十二時辰為底的新分頁。背景跟著天光走，從破曉到入夜。
- **English**: A new tab page built on the twelve phases of the day, with a background that moves with the light.

## 完整說明

### 繁體中文

天光是一個新分頁。它不放推薦內容、不放廣告、不問你要不要登入。

**背景是一天的光。** 十二個時辰各有一組顏色，從航海曙光、日出、日中，
一路走到黃昏與夜半。字色不是挑好的，是照背後的亮度即時算出來的，
所以任何一刻都讀得到。

**時辰盤。** 點一下時鐘，整個畫面變成一座盤：二十四小時、十二時辰、
二十四節氣、二十八宿的四象，還有今天的日出日落弧。它是可以讀的，
不只是好看。

**工作區。** 往下捲還有一整屏：待辦、隨手記、番茄鐘、日曆、天氣、
快速存取、照片牆。每一張卡都可以拖著換位置、拉著改大小，
變大之後顯示的東西也會跟著變多。

**東西留在你自己的瀏覽器。** 沒有帳號、沒有伺服器、沒有分析追蹤。
設定和版面走瀏覽器自己的同步，進度（待辦、筆記、番茄鐘紀錄）留在本機。
要搬家的話設定裡可以把整份匯出成一個 JSON 檔。

**繁體中文與英文**，可以在設定裡直接切換，不必跟著瀏覽器的語言。

### English

Aubade is a new tab page. No feed, no ads, no sign-in.

**The background is the light of the day.** Twelve phases, each with its own
palette, from nautical dawn through sunrise and zenith to dusk and the small
hours. Text colour is not picked, it is computed against the brightness
behind it, so it stays readable at every hour.

**The dial.** Click the clock and the page becomes an instrument: twenty-four
hours, twelve phases, the traditional moons, the four symbols of the
twenty-eight mansions, and today's sunrise-to-sunset arc. It is meant to be
read, not just looked at.

**A second screen.** Scroll down for to-dos, notes, a pomodoro timer, a
calendar, weather with radar, quick links and a photo wall. Every card can be
dragged to a new place and resized, and shows more as it grows.

**Everything stays in your own browser.** No account, no server, no
analytics. Settings and layout ride the browser's own sync; your progress stays on
the machine. Settings can export the whole thing to a single JSON file.

**English and 繁體中文**, switchable in settings rather than tied to the
browser's language.

## 權限說明

送審會逐條問，這裡先寫好答案。

### 一定要的

| 權限 | 用途 |
| --- | --- |
| `storage` | 存設定、版面、待辦與筆記。設定與版面走 `storage.sync`（跟著使用者自己的瀏覽器帳號），會長大的進度走 `storage.local`，不上傳任何地方。 |
| `topSites` | 設定裡那顆「從常用網站帶入」。只在使用者按下去的那一刻讀一次瀏覽器自己的常用清單，用來一次建立快速連結，不持續讀取、不外送。 |
| `favicon` | 快速連結的磚上要顯示網站圖示。走瀏覽器內建的 `_favicon/` 快取，所以離線也有圖示，而且**不會**把使用者開過哪些站洩漏給任何第三方 —— 這正是不自己去對方網站抓圖的原因。 |

### 選用的（使用者按下去才要）

| 權限 | 用途 |
| --- | --- |
| `tabs` | 「正在播放」那張卡。用 `tabs.query({ audible: true })` 列出正在發出聲音的分頁，可以靜音或切過去。不讀網頁內容，也沒有注入任何 content script。 |
| `bookmarks` | 命令面板（Ctrl K）搜尋書籤。 |
| `history` | 命令面板搜尋瀏覽紀錄。 |
| `sessions` | 命令面板列出並還原最近關閉的分頁。 |
| `downloads` | 命令面板列出最近的下載。 |
| `scripting` | 「正在播放」那張卡上的播放／暫停與上下首。瀏覽器沒有給擴充功能全域媒體控制的 API，`navigator.mediaSession` 的處理器是頁面自己註冊的、從外面叫不動 —— 要控制只能用 `chrome.scripting.executeScript` 注進那個正在發聲的分頁，抓 `<video>`／`<audio>` 呼叫 play()／pause()，或點該站自己的上下首按鈕。只在使用者按下控制鍵的那一刻注入，一次一個指令，不留任何常駐的 content script。 |

以上五個都是 `optional_permissions`：不點那些功能就永遠不會被要求，
拒絕了其餘功能照常運作。

### 選用的網域

| 網域 | 用途 |
| --- | --- |
| `api.open-meteo.com` | 天氣。開放資料，不需要金鑰，請求裡只有經緯度。 |
| `geocoding-api.open-meteo.com` | 使用者在設定裡輸入城市名時查經緯度。 |
| `api.rainviewer.com` | 雷達回波的圖磚索引。圖磚本身是 `<img>`，不需要權限。 |
| `calendar.google.com` | 當地國定假日，取的是公開的 iCal 行事曆，不需要登入，也不碰使用者自己的行事曆。 |
| 十個播放網站（見下表） | 「正在播放」的播放控制。只在使用者按下控制鍵的那一刻，向**當下正在發聲的那一個網域**要權限，不是十個一起要。拒絕了靜音與切過去照常。 |
| `opendata.cwa.gov.tw` | 中央氣象署開放資料。使用者自己填了金鑰、而且所在地在台灣時才會用到 —— 氣溫改用最近測站的實測值，因為模式推算在台北跟測站可以差兩度。金鑰由使用者自行申請，我們不代發也收不到。 |
| `aviationweather.gov` | 美國國家氣象局的機場觀測報文（METAR），公有領域、免金鑰。開啟天氣卡時用來拿最近機場的實測氣溫 —— 模式推算是網格平均，抹掉了都市熱島。送出的只有一個經緯度方框，沒有任何識別資料。超過三十公里就不用，退回模式推算。 |

天氣與雷達預設是關的，使用者自己開啟並輸入城市時才會第一次要求這些權限。

### 播放控制的網域

這十個是「正在播放」可以控制的站。**不是宣告了就會拿** —— 使用者按下某一列的
播放鍵時，只向那一列的網域要權限，瀏覽器跳出來問的是「youtube.com」，
不是「你所有的網頁」。沒按過就一個都不會要。

| 網域 | 播放／暫停 | 上一首／下一首 |
| --- | --- | --- |
| `youtube.com`（含 music.youtube.com） | 是 | 是 |
| `open.spotify.com` | 是 | 是 |
| `soundcloud.com` | 是 | 是 |
| `bilibili.com` | 是 | 否 —— 單片頁沒有那兩顆鈕 |
| `music.apple.com` | 是 | 否 —— 抓得到的 Next 都是「下一頁」 |
| `twitch.tv` | 是 | 否 |
| `nicovideo.jp` | 是 | 否 |
| `mixcloud.com` | 是 | 否 |
| `deezer.com` | 是 | 否 |
| `bandcamp.com` | 是 | 否 |

上下首做不到通用版：沒有標準，只能點各站自己的按鈕。那幾條選擇器是拿
`tools/probe-media.mjs` **實際去站上量出來的**，不是憑印象寫的；量不到的站
就不長那兩顆鈕，因為按了沒反應比沒有那顆鈕更糟。對方改版時只壞那一站，
重跑一次探測腳本就知道新的選擇器。

刻意**不用** `<all_urls>`：控制一個播放器要的是「進得去那一頁」，而那正是
這個擴充功能最不想要的東西。具名清單涵蓋了實際會出現在「正在播放」裡的
絕大多數，而審查與使用者看到的是一串站名，不是一句「所有網站」。

## 隱私

沒有帳號、沒有自建伺服器、沒有分析或追蹤。對外的網路請求只有上面那四個
網域，而且都由使用者主動開啟功能才發生。照片存在本機的 IndexedDB，
不會離開這台機器。

## 素材清單

| 檔案 | 尺寸 | 用途 |
| --- | --- | --- |
| `assets/store/logo-300.png` | 300×300 | 商店方形圖 |
| `assets/store/tile-440x280.png` | 440×280 | 小宣傳圖 |
| `assets/store/marquee-1400x560.png` | 1400×560 | 大宣傳圖 |
| `assets/store/shot-1-home-*.png` | 1280×800 / 1366×768 | 第一屏（卯時） |
| `assets/store/shot-2-desk-*.png` | 1280×800 / 1366×768 | 工作區（午時） |
| `assets/store/shot-3-dial-*.png` | 1280×800 / 1366×768 | 時辰盤（酉時） |
| `assets/store/shot-4-focus-*.png` | 1280×800 / 1366×768 | 番茄鐘整屏（辰時） |
| `assets/store/shot-5-calendar-*.png` | 1280×800 / 1366×768 | 日曆整屏（亥時） |
| `public/icons/icon*.png` | 16/32/48/128 | 擴充功能圖示 |

兩種尺寸都產：Chrome 收 1280×800，Edge 常見的是 1366×768。尺寸不對是上傳
當下就被擋，所以兩套都留著，上傳時挑對的。

截圖裡的資料是示範用的中性內容（「把報告的第三節寫完」這類），
快速連結指向 `example.com`，不是任何真實網站或真實的個人資料。

---

# 送審清單

兩家商店各填一次。左邊是欄位，右邊是直接可以貼上去的值。

隱私權政策直接連 repo 裡的檔案，不架 GitHub Pages —— Pages 要設定 Jekyll，
而 `.md` 最後會變成哪一個網址取決於設定，填錯進商店表單就是退件。
連檔案是永久有效的公開網址，GitHub 自己會排版，零設定。

## 打包

```bash
npm run pack
```

產出在 `release/`：

| 檔案 | 上傳到 |
| --- | --- |
| `release/edge-1.0.0.zip` | Microsoft Partner Center |
| `release/chrome-1.0.0.zip` | Chrome Web Store Developer Dashboard |

兩份的差別只有 manifest 的一個鍵（`minimum_edge_version` / `minimum_chrome_version`），
其餘完全相同。**壓縮檔根目錄就是 `manifest.json`**，不能多一層資料夾 ——
多一層會直接被退。

## 兩家共用的欄位

| 欄位 | 值 |
| --- | --- |
| 名稱 | 天光（zh-TW）／ Aubade（en） |
| 簡短說明 | 見本文件上方「簡短說明」 |
| 完整說明 | 見本文件上方「完整說明」 |
| 類別 | Productivity（生產力） |
| 語言 | 繁體中文、English |
| 圖示 | `assets/store/logo-300.png` |
| 截圖 | `assets/store/shot-1` ～ `shot-5`，1280×800 |
| 宣傳圖 | `assets/store/tile-440x280.png`、`marquee-1400x560.png` |
| 隱私權政策網址 | `https://github.com/nolance-dev/tianguang/blob/main/docs/PRIVACY.md` |
| 支援網址 | `https://github.com/nolance-dev/tianguang/issues` |
| 官方網站 | `https://github.com/nolance-dev/tianguang` |
| 發佈者顯示名稱 | Nolance |

## 資料蒐集聲明

兩家都會問一份「你的擴充功能處理哪些使用者資料」。**全部都不勾**，唯一要
說明的是下面這件事：

- **是否蒐集個人身分資訊？** 否
- **是否蒐集健康資訊 / 財務資訊 / 認證資訊 / 個人通訊 / 位置 / 網頁內容？** 否
- **是否蒐集使用者活動（點擊、瀏覽紀錄）？** 否
- **是否為了非核心功能傳送資料到第三方？** 否
- **是否販售或轉移資料給第三方？** 否
- **是否將資料用於與核心功能無關的用途？** 否
- **是否用資料判斷信用或放貸？** 否

**位置那一格要小心。** 天氣功能會把「使用者自己在設定裡輸入的城市」的經緯度
送給 Open-Meteo。那不是裝置定位（沒有用 `geolocation` API，也沒有 `location`
權限），而是使用者自己打的地名。若表單的定義是「蒐集並傳送位置」，這一格
仍然勾「否」—— 資料沒有到我們手上；若審查追問，答案是：
「城市由使用者手動輸入，經緯度只送給 Open-Meteo 換天氣，本擴充功能不儲存、
不回傳、也沒有伺服器。」

## 權限理由（審查會逐條問）

直接引用本文件上方「權限說明」那一整節。每一條都是一句話對應一個看得見的
功能，五個選用權限全部走 `chrome.permissions.request()`，安裝時不會拿。

被退的話，優先順序是：先讓 `downloads`（價值最低），再讓 `history`（最敏感）。
`tabs` 不能讓 —— 讓掉等於「正在播放」整張卡下架。

## 上架前最後檢查

- [ ] `npm test` 與 `npm run e2e` 全綠
- [ ] `npm run pack` 重跑，兩份 zip 是同一次 build 的產物
- [ ] 解壓縮其中一份，確認 `manifest.json` 在根目錄
- [ ] `manifest.json` 的 `version` 跟 `package.json` 一致（由建置自動蓋，
      但送審前看一眼）
- [ ] 載入 `dist/` 實際開一次新分頁，確認圖示與分頁標題正確
- [ ] 設定 → 資料 → 關於，確認 Ko-fi 連結會開新分頁
- [ ] 隱私權政策網址真的打得開（無痕視窗開一次）

## 送出之後

Edge 與 Chrome 的審查時間不一樣，兩邊各自會回。**任何一邊要求修改，都要
改在同一份原始碼上再重跑 `npm run pack`** —— 不要只改其中一包，兩邊版本
分岔之後就再也對不回來了。


---

# 給審查人員的備註

送審表單通常有一欄「Notes for certification / 提交備註」。**把下面這段整段貼進去。**
審查是逐條問權限的，先寫在這裡可以省掉一整輪來回。用英文，因為審查用英文讀。

```
WHAT THIS IS
A new tab page. It replaces the default new tab with a clock, a search box,
quick links, and an optional second screen of cards (to-dos, notes, pomodoro,
calendar, weather). No account, no server, no analytics, no remote code.
Everything is bundled; nothing is fetched and executed at runtime.

Source: https://github.com/nolance-dev/tianguang
Privacy policy: https://github.com/nolance-dev/tianguang/blob/main/docs/PRIVACY.md

REQUIRED PERMISSIONS
- storage: settings, layout, to-dos and notes. Settings and layout use
  storage.sync so they follow the user's own browser account; larger,
  growing data uses storage.local. Nothing is uploaded anywhere.
- topSites: read once, only at the moment the user presses "import from most
  visited" in settings, to create quick links in one step. Never read
  continuously, never transmitted.
- favicon: site icons on quick links, drawn from the browser's own icon cache
  via _favicon/. This is specifically so we do NOT fetch icons from the sites
  themselves, which would disclose the user's browsing to third parties.

OPTIONAL PERMISSIONS
All five are declared under optional_permissions and requested at runtime
with chrome.permissions.request(), inside a user gesture, only when the user
opens the matching feature. A user who never opens those features is never
prompted, and declining leaves the rest of the extension working.
- tabs: the "now playing" card lists tabs currently producing sound
  (tabs.query({audible:true})) so the user can mute them or switch to them.
  No page content is read. No content scripts are injected anywhere — the
  extension has none.
- bookmarks / history / sessions / downloads: the command palette (Ctrl+K)
  searches the user's bookmarks, history, recently closed tabs and recent
  downloads. Matching happens locally; results are never transmitted.

OPTIONAL HOST PERMISSIONS
Requested only when the user enables the matching feature.
- api.open-meteo.com, geocoding-api.open-meteo.com: weather. The request
  contains the latitude and longitude of a city the user typed in settings.
  There is no geolocation API use and no location permission.
- aviationweather.gov: airport observations (METAR) from the US National
  Weather Service, public domain, no key. Used to show a measured temperature
  instead of a modelled one. The request contains a bounding box around the
  user's chosen city and nothing else.
- api.rainviewer.com: radar tile index, used only when the weather card is
  enlarged into radar view.
- opendata.cwa.gov.tw: Taiwan's Central Weather Administration open data.
  Used only if the user pastes their own free API key in settings and their
  city is in Taiwan.
- calendar.google.com: a public iCal calendar of local public holidays. No
  sign-in, and the user's own calendar is never accessed.

DATA
Nothing is collected, transmitted for our benefit, or sold. There is no
server belonging to this extension. Photos added to the photo wall stay in
local IndexedDB.

HOW TO TEST
Open a new tab. Scroll down (or press the chevron) for the second screen.
Click the clock for the dial. The gear at the bottom right opens settings;
the tour can be replayed from Settings > Data > Show it again.
```


---

# Edge 隱私權那一區：逐格的文字

Partner Center 的「隱私權」不是問卷，是自由欄位，每一個權限各一格，
而且頁面明說「要求不必要的權限將導致此版本遭拒絕」。以下直接貼。
英文寫的，因為審查用英文讀。

## 單一用途描述

```
A new tab page. The extension's single purpose is to replace the browser's
new tab with one page that shows the time and a small set of personal tools
the user arranges themselves: a clock and greeting based on the twelve
traditional phases of the day, a search box, quick links, and an optional
second screen with to-dos, notes, a pomodoro timer, a calendar and weather.

Every feature serves that one page. The extension has no content scripts, no
background service worker, no remote code, no account, no server and no
analytics. It never runs on, reads or modifies any other website.
```

## storage 理由

```
Stores the user's own settings and content for the new tab page: layout,
chosen background, quick links, to-dos, notes, pomodoro history and calendar
entries.

Settings and layout use storage.sync so they follow the user's own browser
account across their devices. Larger, growing data uses storage.local so it
does not hit sync quotas. Nothing is transmitted anywhere — this extension
has no server of its own.
```

## topSites 理由

```
Powers a single button in settings, "import from most visited", which fills
the user's quick-link tiles in one step instead of making them type each
address by hand.

It is read only at the moment the user presses that button — never
continuously, never in the background — and the result stays on the device.
```

## favicon 理由

```
Draws the site icons on the quick-link tiles, using the browser's own favicon
cache via _favicon/.

This permission is requested specifically so that the extension does NOT
fetch icons from the sites themselves. Fetching them directly would disclose
the user's saved sites to third parties, which we do not want to do. Using
the browser's cache also means icons still appear when offline.
```

## 若另有「選用權限」的欄位

以下五個都宣告在 `optional_permissions`，安裝時不會索取，只有使用者打開對應
功能時才用 `chrome.permissions.request()` 在使用者手勢中詢問；拒絕不影響其他功能。

```
tabs — The "now playing" card lists tabs that are currently producing sound
(tabs.query({audible: true})) so the user can mute one or switch to it. No
page content is read and no content script is injected; the extension has
none.

bookmarks / history / sessions / downloads — The command palette (Ctrl+K)
searches the user's bookmarks, browsing history, recently closed tabs and
recent downloads so they can reopen something without leaving the new tab.
Matching happens locally and results are never transmitted.
```

## 若另有「主機權限理由」的欄位

```
api.open-meteo.com, geocoding-api.open-meteo.com — Weather. The request
carries the latitude and longitude of a city the user typed into settings.
The extension does not use the geolocation API and holds no location
permission.

aviationweather.gov — Airport observations (METAR) from the US National
Weather Service, public domain and keyless, used to show a measured
temperature rather than a modelled one. The request carries a bounding box
around the user's chosen city and nothing else.

api.rainviewer.com — Radar tile index, used only when the user enlarges the
weather card into radar view.

opendata.cwa.gov.tw — Taiwan's Central Weather Administration open data, used
only if the user pastes their own free API key into settings and their city
is in Taiwan.

calendar.google.com — A public iCal calendar of local public holidays. No
sign-in is involved and the user's own calendar is never accessed.

All five are optional host permissions, requested only when the user turns on
the matching feature.
```


---

# Edge「Store 清單」逐格：兩種語言各填一次

兩列都要填完才會從「不完整」變綠。點右邊的「編輯詳細資料」。
欄位順序以 Partner Center 當下畫面為準，沒出現的就跳過。

## 中文 (臺灣)

**延伸模組名稱**（已帶入，不用改）

```
天光
```

**簡短描述 / 說明**

```
以十二時辰為底的新分頁。背景跟著天光走，從破曉到入夜。
```

**描述**（純文字貼上，不要貼 Markdown 的星號）

```
天光是一個新分頁。它不放推薦內容、不放廣告、不問你要不要登入。

■ 背景是一天的光
十二個時辰各有一組顏色，從航海曙光、日出、日中，一路走到黃昏與夜半。
字色不是挑好的，是照背後的亮度即時算出來的，所以任何一刻都讀得到。

■ 時辰盤
點一下時鐘，整個畫面變成一座盤：二十四小時、十二時辰、二十四節氣、
二十八宿的四象，還有今天的日出日落弧。它是可以讀的，不只是好看。
節氣是用天文公式即時算的，不是查表。

■ 工作區
往下捲還有一整屏：待辦、隨手記、番茄鐘、日曆、天氣（拉大變雷達回波圖）、
快速存取、照片牆、正在播放。每一張卡都可以拖著換位置、拉著改大小，
變大之後顯示的東西也會跟著變多。鍵盤也能改版面：方向鍵改大小，
Shift 加方向鍵換位置。

■ 東西留在你自己的瀏覽器
沒有帳號、沒有伺服器、沒有分析追蹤。設定和版面走瀏覽器自己的同步，
進度（待辦、筆記、番茄鐘紀錄）留在本機。要搬家的話，設定裡可以把整份
匯出成一個 JSON 檔。

■ 權限只在你按下去的那一刻要
分頁、書籤、瀏覽紀錄、最近關閉、下載這五項全部是選用權限，
不點那些功能就永遠不會被問到。

■ 繁體中文與英文
可以在設定裡直接切換，不必跟著瀏覽器的語言。中英文不是互相翻譯：
英文版叫 Aubade，十二時辰換成十二個光相，節氣換成傳統滿月名。

原始碼公開：https://github.com/nolance-dev/tianguang
```

**搜尋字詞**（一格一個）

```
新分頁
時辰
待辦
番茄鐘
天氣
個人化
極簡
```

## 英文

**延伸模組名稱**（已帶入，不用改）

```
Aubade
```

**簡短描述 / 說明**

```
A new tab page built on the twelve phases of the day, with a background that moves with the light.
```

**描述**

```
Aubade is a new tab page. No feed, no ads, no sign-in.

■ The background is the light of the day
Twelve phases, each with its own palette, from nautical dawn through sunrise
and zenith to dusk and the small hours. Text colour is not picked, it is
computed against the brightness behind it, so it stays readable at every hour.

■ The dial
Click the clock and the page becomes an instrument: twenty-four hours, twelve
phases, the traditional moons, the four symbols of the twenty-eight mansions,
and today's sunrise-to-sunset arc. It is meant to be read, not just looked at.

■ A second screen
Scroll down for to-dos, notes, a pomodoro timer, a calendar, weather with
radar, quick links, a photo wall and now playing. Every card can be dragged to
a new place and resized, and shows more as it grows. The keyboard works too:
arrow keys resize, Shift with arrows moves.

■ Everything stays in your own browser
No account, no server, no analytics. Settings and layout ride the browser's own
sync; your progress stays on the machine. Settings can export the whole thing
to a single JSON file.

■ Permissions are asked for at the moment you press the button
Tabs, bookmarks, history, recently closed and downloads are all optional. If
you never open those features, you are never asked.

■ English and 繁體中文
Switchable in settings rather than tied to the browser's language. The two are
not translations of each other: the Chinese build is called 天光 and runs on
the twenty-four solar terms.

Source: https://github.com/nolance-dev/tianguang
```

**搜尋字詞**

```
new tab
clock
todo
pomodoro
weather
minimal
dashboard
```

## 兩種語言共用的檔案

| 欄位 | 檔案 |
| --- | --- |
| 商店標誌 300×300 | `assets/store/logo-300.png` |
| 螢幕擷取畫面（至少一張，Edge 要 1366×768） | `assets/store/shot-1-home-1366x768.png` 到 `shot-5-calendar-1366x768.png` |
| 小型宣傳磚 440×280（有這格才傳） | `assets/store/tile-440x280.png` |
| 大型宣傳磚（有這格才傳） | `assets/store/marquee-1400x560.png` |

上傳截圖時務必挑 **1366×768** 那五張，1280×800 是給 Chrome 的，
在 Edge 會被擋。

## 附加資訊那一段

| 欄位 | 值 |
| --- | --- |
| 支援聯絡資訊 / 網址 | `https://github.com/nolance-dev/tianguang/issues` |
| 網站 | `https://github.com/nolance-dev/tianguang` |
| 隱私權政策網址 | `https://github.com/nolance-dev/tianguang/blob/main/docs/PRIVACY.md` |
