# 上架素材

送審要填的東西全部在這一份。素材本身在 `assets/store/`，都是產生出來的，
不是手工畫的 —— 改了重跑就好，不必找原檔。

```bash
node tools/icons.mjs    # 分頁與擴充功能的圖示（16/32/48/128）
node tools/store.mjs    # 商店方形圖與宣傳圖
npx vite preview --port 4321 &
node tools/shots.mjs    # 五張截圖，1280×800
```

截圖拍的是 `dist/`，不是開發伺服器 —— 商店上放的必須是使用者真的會裝到的
那一份。時間是用 Playwright 的時鐘控制釘死的：這個擴充功能整張臉都由當下
幾點決定，照真實時間拍會拍出五張同一種顏色的圖，而「背景跟著天光走」正是
它要賣的東西。五張分別釘在卯時、午時、酉時、辰時、亥時。

**尺寸請以 Partner Center 當下的要求為準**，這裡放的是常見的那一組
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
設定和版面走 Edge 自己的同步，進度（待辦、筆記、番茄鐘紀錄）留在本機。
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
analytics. Settings and layout ride Edge's own sync; your progress stays on
the machine. Settings can export the whole thing to a single JSON file.

**English and 繁體中文**, switchable in settings rather than tied to the
browser's language.

## 權限說明

送審會逐條問，這裡先寫好答案。

### 一定要的

| 權限 | 用途 |
| --- | --- |
| `storage` | 存設定、版面、待辦與筆記。設定與版面走 `storage.sync`（跟著使用者自己的 Edge 帳號），會長大的進度走 `storage.local`，不上傳任何地方。 |
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

以上五個都是 `optional_permissions`：不點那些功能就永遠不會被要求，
拒絕了其餘功能照常運作。

### 選用的網域

| 網域 | 用途 |
| --- | --- |
| `api.open-meteo.com` | 天氣。開放資料，不需要金鑰，請求裡只有經緯度。 |
| `geocoding-api.open-meteo.com` | 使用者在設定裡輸入城市名時查經緯度。 |
| `api.rainviewer.com` | 雷達回波的圖磚索引。圖磚本身是 `<img>`，不需要權限。 |
| `calendar.google.com` | 當地國定假日，取的是公開的 iCal 行事曆，不需要登入，也不碰使用者自己的行事曆。 |

天氣與雷達預設是關的，使用者自己開啟並輸入城市時才會第一次要求這些權限。

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
| `assets/store/shot-1-home.png` | 1280×800 | 第一屏（卯時） |
| `assets/store/shot-2-desk.png` | 1280×800 | 工作區（午時） |
| `assets/store/shot-3-dial.png` | 1280×800 | 時辰盤（酉時） |
| `assets/store/shot-4-focus.png` | 1280×800 | 番茄鐘整屏（辰時） |
| `assets/store/shot-5-calendar.png` | 1280×800 | 日曆整屏（亥時） |
| `public/icons/icon*.png` | 16/32/48/128 | 擴充功能圖示 |

截圖裡的資料是示範用的中性內容（「把報告的第三節寫完」這類），
快速連結指向 `example.com`，不是任何真實網站或真實的個人資料。
