# 隱私權政策 · Privacy Policy

天光 / Aubade — 瀏覽器新分頁擴充功能
最後更新：2026-09-04

---

## 繁體中文

### 簡短版

天光沒有帳號、沒有伺服器、沒有分析或追蹤。你的資料留在你自己的瀏覽器裡，
我看不到，也沒有地方可以看。

### 我們蒐集什麼

**沒有。** 這個擴充功能不蒐集、不傳送、也不販售任何個人資料。沒有任何一項
資料會離開你的裝置送到我們手上 —— 因為我們根本沒有伺服器可以接收它。

### 資料存在哪裡

| 資料 | 存在哪 | 會不會離開這台電腦 |
| --- | --- | --- |
| 設定、版面、快速連結 | 瀏覽器的 `storage.sync` | 只在你自己的瀏覽器帳號之間同步，由瀏覽器處理，我們碰不到 |
| 待辦、筆記、番茄鐘紀錄、行程 | 瀏覽器的 `storage.local` | 不會 |
| 照片牆的圖片 | 本機 IndexedDB | 不會 |
| 語錄走到第幾句 | 本機 `localStorage` | 不會 |
| 氣象署金鑰（若你填了） | 瀏覽器的 `storage.sync` | 跟其他設定一樣，只在你自己的瀏覽器帳號之間同步。我們沒有伺服器可以收它 |

「同步」指的是瀏覽器自己的帳號同步功能（例如 Microsoft 帳號或 Google 帳號）。
資料在你和瀏覽器廠商之間，不經過我們。

### 對外的網路請求

只有以下幾個，而且**都只在你主動開啟對應功能之後**才會發生。相關的網域權限
是選用的，你不開啟就永遠不會被要求。

| 網域 | 什麼時候 | 送出什麼 |
| --- | --- | --- |
| `api.open-meteo.com` | 你開啟天氣卡之後 | 你設定的城市的經緯度 |
| `geocoding-api.open-meteo.com` | 你在設定裡輸入城市名時 | 你輸入的城市名 |
| `api.rainviewer.com` | 你把天氣卡拉大成雷達圖時 | 沒有個人資料，只取圖磚索引 |
| `tilecache.rainviewer.com` | 同上 | 圖磚的座標 |
| `calendar.google.com` | 你開啟「顯示當地節日」時 | 沒有個人資料，取的是公開的 iCal 行事曆 |
| `opendata.cwa.gov.tw` | 你在設定裡填了氣象署金鑰，而且所在地在台灣 | 你自己的金鑰。回來的是全台測站清單，我們在本機挑最近的一站 |
| `aviationweather.gov` | 你開啟天氣卡之後 | 你所在地周邊的一個經緯度方框。回來的是那個範圍內機場的觀測報文，我們在本機挑最近的一座 |

### 播放控制會進到哪裡

「正在播放」那張卡上的播放／暫停與上下首，是把一小段程式注入到**正在發聲的
那一個分頁**去執行的 —— 瀏覽器沒有給擴充功能全域的媒體控制 API，這是唯一的
做法。那段程式只做兩件事：找到頁面上的 `<video>`／`<audio>` 呼叫播放或暫停，
或點該站自己的上一首／下一首按鈕。它**不讀取頁面內容、不送出任何東西**，
按完就結束，沒有常駐的 content script。

可以控制的站只有這十個：`youtube.com`（含 music.youtube.com）、
`open.spotify.com`、`soundcloud.com`、`bilibili.com`、`music.apple.com`、
`twitch.tv`、`nicovideo.jp`、`mixcloud.com`、`deezer.com`、`bandcamp.com`。

**權限是一站一站要的。** 你按下某一列的播放鍵時，瀏覽器才會問你要不要讓天光
存取那一個網域；沒按過的站一個都不會問。拒絕了，靜音與切過去照常運作。
我們刻意不要 `<all_urls>`。

這些請求裡沒有識別碼、沒有 cookie、也沒有你的瀏覽紀錄。我們不會因此知道
是誰發出的請求 —— 我們根本沒有參與這些請求。

### 那些權限拿去做什麼

必要權限：

- **storage** — 存你的設定與筆記，如上表。
- **topSites** — 只有在你按下設定裡的「從常用網站帶入」那一刻，讀一次瀏覽器
  自己的常用網站清單，用來一次建立快速連結。不持續讀取、不外送。
- **favicon** — 快速連結上的網站圖示，取自瀏覽器內建的圖示快取。**正是為了
  不向第三方洩漏你開過哪些站**，我們才不自己去對方網站抓圖。

選用權限（只有你點下對應功能時才會被詢問，拒絕了其他功能照常運作）：

- **tabs** — 「正在播放」那張卡。列出正在發出聲音的分頁，可以靜音或切過去。
  不讀取網頁內容，也沒有注入任何 content script。
- **bookmarks** / **history** / **sessions** / **downloads** — 命令面板
  （Ctrl K）搜尋你的書籤、瀏覽紀錄、最近關閉的分頁與最近的下載。搜尋在本機
  進行，結果不外送。
- **scripting** — 「正在播放」的播放控制，見上一節。只在你按下控制鍵的那一刻
  注入一次，不讀頁面內容，也不常駐。

### 兒童

本擴充功能不針對兒童設計，也不蒐集任何年齡資訊。

### 變更

政策若有變更，會更新本頁最上方的日期，並在版本更新說明中註明。

### 聯絡

問題與建議請開 issue：https://github.com/nolance-dev/tianguang/issues

---

## English

### Short version

Aubade has no account, no server, and no analytics. Your data stays in your
own browser. I cannot see it, and there is nowhere for me to see it from.

### What we collect

**Nothing.** This extension does not collect, transmit, or sell any personal
data. No data leaves your device for us — there is no server to receive it.

### Where your data lives

| Data | Stored in | Leaves this computer? |
| --- | --- | --- |
| Settings, layout, quick links | Browser `storage.sync` | Only between your own browser profiles, handled by the browser; we never touch it |
| To-dos, notes, pomodoro history, events | Browser `storage.local` | No |
| Photo wall images | Local IndexedDB | No |
| Which quote you're up to | Local `localStorage` | No |
| Your CWA key, if you enter one | Browser `storage.sync` | Syncs between your own browser profiles like any other setting. We have no server to receive it |

"Sync" means the browser's own account sync (a Microsoft or Google account).
That is between you and your browser vendor; it does not pass through us.

### Outbound network requests

Only the following, and **only after you turn the matching feature on**. The
host permissions are optional; if you never enable the feature, they are never
requested.

| Host | When | What is sent |
| --- | --- | --- |
| `api.open-meteo.com` | After you enable the weather card | The latitude and longitude of the city you set |
| `geocoding-api.open-meteo.com` | When you type a city name in settings | The city name you typed |
| `api.rainviewer.com` | When you enlarge the weather card into radar | No personal data; a tile index |
| `tilecache.rainviewer.com` | Same | Tile coordinates |
| `calendar.google.com` | When you enable local holidays | No personal data; a public iCal calendar |
| `opendata.cwa.gov.tw` | Only if you enter a CWA key and your location is in Taiwan | Your own key. The response is a list of all stations; the nearest is chosen locally |
| `aviationweather.gov` | After you enable the weather card | A bounding box around your location. The response is airport observations in that box; the nearest is chosen locally |

### Where the playback controls reach

Play/pause and next/previous on the "now playing" card work by injecting a
short script into the tab that is currently making sound. The browser gives
extensions no global media-control API, so this is the only way. That script
does two things only: find the page's `<video>`/`<audio>` and play or pause it,
or click that site's own next/previous button. It reads no page content and
sends nothing anywhere, and it stops as soon as it has run. There is no
persistent content script.

Only ten sites can be controlled: `youtube.com` (including music.youtube.com),
`open.spotify.com`, `soundcloud.com`, `bilibili.com`, `music.apple.com`,
`twitch.tv`, `nicovideo.jp`, `mixcloud.com`, `deezer.com` and `bandcamp.com`.

**Access is asked for one site at a time.** When you press play on a row, the
browser asks whether Aubade may access that one domain; sites you never press
are never asked about. Declining leaves mute and switch-to working. We
deliberately do not ask for `<all_urls>`.

These requests carry no identifier, no cookie, and no browsing history. We do
not learn who made them — we are not party to them at all.

### What the permissions are for

Required:

- **storage** — stores your settings and notes, as above.
- **topSites** — read once, at the moment you press "import from most visited"
  in settings, to create quick links in one step. Not read continuously, never
  transmitted.
- **favicon** — site icons on quick links, drawn from the browser's own icon
  cache. Fetching them from the sites themselves is exactly what we avoid, so
  that no third party learns which sites you have open.

Optional (requested only when you use the feature; declining leaves everything
else working):

- **tabs** — the "now playing" card. Lists tabs currently making sound so you
  can mute them or switch to them. No page content is read and no content
  script is injected.
- **bookmarks** / **history** / **sessions** / **downloads** — the command
  palette (Ctrl K) searches your bookmarks, history, recently closed tabs and
  recent downloads. Searching happens locally; results are never transmitted.
- **scripting** — the playback controls, described above. Injected once at the
  moment you press a control, reading no page content and leaving nothing
  behind.

### Children

This extension is not directed at children and collects no age information.

### Changes

If this policy changes, the date at the top of this page is updated and the
change is noted in the release notes.

### Contact

Please open an issue: https://github.com/nolance-dev/tianguang/issues
