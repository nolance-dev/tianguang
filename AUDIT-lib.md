# 天光 `src/lib/` 稽核報告

方法：所有結論都由 vitest 實際執行過 `src/lib/` 的程式碼取得，不是讀出來的。
探針檔在 `%TEMP%\claude\...\scratchpad\{a-solar,b-sun,c-data,d-sec}.test.ts`，
以專案的 vitest 執行（`npx vitest run --config <scratchpad>/vitest.config.mjs`）。
本機時區 `Asia/Singapore`（UTC+8，與台北同偏移）。

---

## 優先項 1：`links.ts` 的 URL 驗證 — **沒有問題**

**結論：`javascript:` 與 `data:` 存不進快速連結。這一條是乾淨的。**

`links.ts:24-36` `normalizeUrl()` 實測輸入與輸出：

```
normalizeUrl("javascript:alert(1)")                              -> null
normalizeUrl("javascript://x.example/%0aalert(document.domain)") -> null
normalizeUrl("JavaScript://comment%0Aalert(1)")                  -> null
normalizeUrl("data:text/html,<script>alert(1)</script>")         -> null
normalizeUrl("data://text.html/x")                               -> null
normalizeUrl("vbscript://x.example/")                            -> null
normalizeUrl("file:///C:/Windows/system32/")                     -> null
normalizeUrl("chrome://settings/")                               -> null
normalizeUrl("edge://settings/")                                 -> null
normalizeUrl("chrome-extension://abcdef/popup.html")             -> null
normalizeUrl("blob:https://x.example/uuid")                      -> null
normalizeUrl("  javascript://x.example/a  ")                     -> null
makeLink("javascript:alert(1)")                                  -> null
```

`u.protocol !== "http:" && u.protocol !== "https:"` 這一關擋得住全部，
大小寫、前後空白、`//` 有無都試過。`makeLink()` 走同一條，所以也擋得住。

唯一一個看起來會漏的其實不會：`normalizeUrl("java\tscript://x.example/")`
回 `"https://javascript//x.example/"` —— WHATWG URL 剖析器會把 tab 拿掉，
但因為原字串沒有通過 `/^[a-z][a-z0-9+.-]*:\/\//` 的協定測試，
它被當成「沒寫協定」而補上 `https://`。結果是一個無害的 https 網址，不是 script URL。

`faviconUrl()`（`links.ts:67-73`）用 `URLSearchParams.set` 組查詢字串，
惡意 `pageUrl` 只會被百分比編碼，不會逃出參數。也是乾淨的。

---

## 優先項 1b：**同一件事在 `search.ts` 沒做** — 這才是真正的漏洞

### A-1【高】`search.ts:66-68` `resolve()` 把任意 scheme 原樣交給 `location.href`

`links.ts` 明明白白寫著「`javascript:` 這種東西不該進到一個會被點擊的磚上」，
但搜尋列走的是 `search.ts`，那裡完全沒有這一關。

實測（`resolve(input, "bing")` 的回傳 `url`）：

```
resolve("javascript://x.example/%0aalert(document.domain)")
   -> "javascript://x.example/%0aalert(document.domain)"   [原樣]
resolve("JavaScript://comment%0Aalert(1)")
   -> "JavaScript://comment%0Aalert(1)"                    [原樣]
resolve("  javascript://x.example/a  ")
   -> "javascript://x.example/a"                           [原樣]
resolve("vbscript://x.example/")        -> "vbscript://x.example/"
resolve("data://text.html/x")           -> "data://text.html/x"
resolve("file:///C:/Windows/system32/") -> "file:///C:/Windows/system32/"
resolve("chrome://settings/")           -> "chrome://settings/"
resolve("edge://settings/")             -> "edge://settings/"
resolve("chrome-extension://abcdef/popup.html")
   -> "chrome-extension://abcdef/popup.html"
```

這個字串接著被指派給 `location.href`，兩個呼叫點：
- `src/ui/App.tsx:569` — `if (r) location.href = r.url;`
- `src/ui/Palette.tsx:103` — `if (r) location.href = r.url;`

觸發條件：`looksLikeUrl()`（`search.ts:36`）只要看到 `scheme://` 就回 true，
`resolve()`（第 67 行）接著只判斷「有沒有協定」來決定要不要補 `https://`，
從來沒有問過「這是哪一種協定」。所以帶 `//` 的 `javascript:` 會整條通過；
不帶 `//` 的 `javascript:alert(1)` 反而被當成關鍵字丟去 Bing。

嚴重度說明（不誇大）：MV3 擴充功能頁的預設 CSP 是 `script-src 'self'`，
瀏覽器會擋掉 `javascript:` 的實際執行；`file://`、`chrome://` 的導覽通常也會被擋。
所以我**沒有**驗證到「真的跳出 alert」——我驗證到的是**驗證層本身不存在**，
而且與同專案 `links.ts` 的作法自相矛盾。這正是 Edge Add-ons 審查會挑的形狀，
而且防線目前完全靠瀏覽器，不靠這份程式碼。

修法就是 `links.ts` 已經有的那三行：`resolve()` 在回傳前把 url 過一次
`normalizeUrl()`，不是 http(s) 就當關鍵字送去搜尋。

### A-2【中】`search.ts:56-64` 單字母前綴吃掉第一個字

`/^([a-z])\s+(.+)$/i` 只要開頭是「單字母 + 空白」就換引擎並**丟掉那個字母**。
五個前綴分別是 `b g d v p`。實測：

```
resolve("d day",           "bing") -> "https://duckduckgo.com/?q=day"
resolve("p value",         "bing") -> "https://www.perplexity.ai/search?q=value"
resolve("v for vendetta",  "bing") -> "https://search.brave.com/search?q=for%20vendetta"
resolve("b hello",         "bing") -> "https://www.bing.com/search?q=hello"
resolve("G HELLO",         "bing") -> "https://www.google.com/search?q=HELLO"
```

搜「d day」（諾曼第登陸）、「p value」（統計 p 值）、「v neck」、「g force」、
「b flat」這些都是完全正常的查詢，使用者會拿到一個少一個字、而且換了引擎的結果。
`z hello` 因為 `z` 不是前綴而正確保留全文，證明問題就出在前綴命中這一支。

### A-3【中】`search.ts:40` 電子郵件地址被當成網址開走

```
looksLikeUrl("user@example.com") = true
resolve("user@example.com", "bing") -> "https://user@example.com"
looksLikeUrl("mailto:a@b.com")  = true
resolve("mailto:a@b.com", "bing")   -> "https://mailto:a@b.com"
```

在搜尋框打自己的 email 會被導去 `example.com`（`user@` 變成 userinfo），
不是搜尋。`^[^.\s]+(\.[^.\s]+)+$` 沒有排除 `@`。

### A-4【低】`search.ts:36,67` `"http://"` 與 `"https://"` 本身被當成合法網址

```
looksLikeUrl("http://")  = true   resolve -> "http://"
looksLikeUrl("https://") = true   resolve -> "https://"
looksLikeUrl("-.com")    = true   resolve -> "https://-.com"
```

`location.href = "https://"` 是無效導覽。使用者打一半按 Enter 就會踩到。

### A-5【低】`search.ts:37,40` 裸 IPv4 進搜尋，`127.0.0.1` 卻進導覽

```
looksLikeUrl("127.0.0.1:8080") = true   -> https://127.0.0.1:8080
looksLikeUrl("1.2.3.4")        = false  -> Bing 搜尋 "1.2.3.4"
```

最後一段必須是 `[a-z]{2,}` 才算網域，所以 `1.2.3.4` 落到搜尋；
但 `127.0.0.1` 被第 37 行硬寫特例救回來。同一類輸入兩種結果。

---

## 優先項 2：`settings.ts` migrate() 與 `snapshot.ts` unpack()

### A-6【高】`settings.ts:155,159` 巢狀物件是「整個換掉」，不是「補上缺的鍵」

第 152–154 行的註解承諾：「原樣留著，**只補上缺的鍵**」。
`{ ...DEFAULTS, ...raw }` 對頂層成立，對 `cards` / `home` 這兩個巢狀物件不成立。

實測：

```
migrate({ schemaVersion: 1, cards: { todos: true } }).cards
  -> {"todos":true}
     .note = undefined   .calendar = undefined   （其餘九個鍵全部消失）

migrate({ schemaVersion: 1, home: {} }).home
  -> {}                  （links / photos 兩個鍵都沒了）

migrate({ schemaVersion: 99, cards: { newcard: true } }).cards
  -> {"newcard":true}    （已知的十張卡全部消失）
```

後果：`Cards.tsx:136` 的 `show[kind]` 讀到 `undefined` → falsy → 那張卡不畫。
使用者的工作區會整片空掉，而且是**靜默**的。
最後一個案例正是註解宣稱要防的情境（新版機器同步回舊版），實際上它反而是最糟的一個。

### A-7【高】`settings.ts:149-160` migrate() 完全沒有型別驗證

`migrate()` 是設定唯一的入口（`load()` 走它、`snapshot.unpack()` 也走它），
但它對 `raw` 的內容一個字都不檢查。實測一份惡意／損壞的設定：

```js
migrate({ schemaVersion: 1, lat: "abc", lon: null, links: "boom",
          desk: 42, linkCards: -9, grain: 99, dim: -5, blur: "x",
          unit: "kelvin", secondCal: "aztec" })
```

輸出（原樣穿過去）：

```
lat  = "abc"   (typeof string)
lon  = null
links = "boom" (Array.isArray = false)
desk = 42
grain/dim/blur = 99 / -5 / "x"
unit = "kelvin"   secondCal = "aztec"   linkCards = -9
```

其中 `lat` 直接引爆下一節的 A-8。`links: "boom"` 會讓
`Settings.tsx:589` 的 `value.links.length` 變 4、`Links.tsx:131` 的
`links.map` 直接 TypeError。`unit`/`secondCal` 的非法值會讓對應的
`Intl` formatter 走進 catch（`secondcal.ts:69`）而少一行，那一支還算安全。

對照組：`workspace.ts:192-195` 對 `events`/`projects`/`sessions` 有做
`Array.isArray` 檢查，`durations` 有 `normalizeDurations`。同一份程式碼裡
兩套標準，而較鬆的那一套守的是比較危險的那個入口。

### A-8【高】`solar.ts:102` 的定義域檢查漏掉 NaN，日出日落回傳 NaN 而不是 null

`if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null }` ——
NaN 跟任何數比大小都是 false，所以 NaN 直接穿過去餵給 `Math.acos`。

實測：

```
sunTimes(new Date(2026,5,21,12), NaN, 121)        -> { sunrise: NaN, sunset: NaN }
sunTimes(new Date(2026,5,21,12), "abc", 121)      -> { sunrise: NaN, sunset: NaN }
sunTimes(new Date(2026,5,21,12), undefined, 121)  -> { sunrise: NaN, sunset: NaN }
sunTimes(new Date(2026,5,21,12), 25, NaN)         -> { sunrise: NaN, sunset: NaN }
（sunrise === null  →  false）
```

`NaN !== null`，所以下游兩個守門都放行：
- `src/ui/Margins.tsx:52` `if (sunrise !== null && sunset !== null)` → 進去 →
  `hhmm(NaN)` 印出 `NaN:NaN`
- `src/ui/Dial.tsx:348` 同樣的判斷 → 日照弧拿到 `(NaN/24)*360` → SVG path 變成無效字串

完整鏈路（實測，見 A-11）：一份手改過的備份 JSON → `unpack` 收下 →
`migrate` 不驗 → `settings.lat = "abc"` → 每次開新分頁曆書欄都寫 `NaN:NaN`。

順帶一提：`sunTimes(date, null, null)` 回 `{ sunrise: 13.97, sunset: 2.09 }`
—— `null * RAD === 0`，被當成赤道上的一點，錯得無聲無息。

### A-9【中】`snapshot.ts:51` 版本檢查收下 `NaN` 與負數

「認不出來就回 null，不猜」——但 `typeof NaN === "number"` 為真，
而 `NaN > SNAPSHOT_VERSION` 為假，所以 NaN 版本一路通過。實測全表：

```
unpack(null)                                  -> null   OK
unpack("hello")                               -> null   OK
unpack([])                                    -> null   OK
unpack({app:"other",  version:1, settings:{}}) -> null   OK
unpack({app:"tianguang",           settings:{}}) -> null   OK
unpack({app:"tianguang", version:2, settings:{}}) -> null   OK
unpack({app:"tianguang", version:"1", settings:{}}) -> null OK
unpack({app:"tianguang", version:1})          -> null   OK  (truncated)
unpack({app:"tianguang", version:1, settings:null, workspace:null}) -> null OK

unpack({app:"tianguang", version:NaN, settings:{}}) -> 收下   <-- 應該回 null
unpack({app:"tianguang", version:-1,  settings:{}}) -> 收下   <-- 應該回 null
unpack({app:"tianguang", version:1, settings:"abc"}) -> 收下  <-- 字串當設定
unpack({app:"tianguang", version:1, settings:[1,2]}) -> 收下  <-- 陣列當設定
```

`settings: "abc"` 那一支的結果：`{...DEFAULTS, ..."abc"}` 產生額外的鍵
`['0','1','2']`（值是 `'a','b','c'`），DEFAULTS 的欄位倒是都活著，
所以不會壞畫面，只是把三個垃圾鍵寫回 chrome.storage 永久保存。

### 良性確認：原型污染打不進去

```js
migrate(JSON.parse('{"schemaVersion":1,"__proto__":{"pwned":"yes"}}'))
  -> ({}).pwned === undefined      （spread 用 CreateDataProperty，不會設原型）
migrate(JSON.parse('{"schemaVersion":1,"constructor":{"prototype":{"x":1}}}'))
  -> ({}).x === undefined
```

### A-10【中】`workspace.ts:177-197` `todos` 與 `note` 沒有跟其他欄位一樣被驗

```js
migrateWorkspace({ todos: "boom", note: 42, pomodoro: "x",
                   sessions: {a:1}, durations: "x" })
```

```
todos     = "boom"   Array.isArray = false     <-- 沒驗
note      = 42       typeof number             <-- 沒驗
sessions  = []                                 OK（Array.isArray 有擋）
durations = {work:25,short:5,long:15,power:50} OK（normalizeDurations 有擋）
pomodoro  = {"0":"x", mode:"work", endsAt:null, ...}  無害
```

`todos` 是唯一會被 `.filter()` / `.map()` 的那一個：
`Cards.tsx:358` `value.todos.filter(...)` → `TypeError: ... .filter is not a function`
→ 整個工作區白畫面。第 191 行的註解說「陣列要自己補」，但只補了三個，漏掉最重要的那個。

### A-11【高】端對端重現：一份備份檔就能讓工作區永久打不開

```js
unpack({
  app: "tianguang", version: 1, at: "2026-01-01T00:00:00Z",
  settings:  { schemaVersion: 1, desk: [{ id: 5, w: 2, h: 1 }] },
  workspace: { todos: "boom" },
})
```

實測輸出：

```
unpack 收下了                                    -> true
desk.normalize(settings.desk)                    -> TypeError: id.startsWith is not a function
workspace.todos.filter(...)                      -> TypeError: ....filter is not a function
```

`normalize()` 在 `Cards.tsx:134` 的 render 路徑上，所以這個例外每次繪製都會丟，
而且資料已經寫回 storage —— 使用者沒有辦法從介面上救回來（設定頁也在同一棵樹）。

---

## 優先項 3：`desk.ts` normalize / move / resize / nudge

### 好消息：版面不會掉卡、不會重複、尺寸不會出界

2000 次隨機 `move` / `nudge` / `resize`（含負數、超界、NaN 參數）之後，
不變式全部成立：

- `cur.length` 恆等於起始長度
- id 集合大小恆等於長度（沒有重複、沒有遺失）
- 每一張 `1 <= w <= 4`、`1 <= h <= 3`
- `kindOf(id) === "links"` 的卡 `h` 恆為 1（`heightOf` 那道關卡確實是唯一入口）

`clamp()`（`desk.ts:85-88`）對 NaN / Infinity / 字串都正確退回 fallback：

```
normalize([{id:"note", w: Infinity, h: -99}])  -> {id:"note", w:2, h:1}
normalize([{id:"note", w: "3", h: "2"}])       -> {id:"note", w:2, h:1}
resize(base, "note", NaN, NaN)                 -> {id:"note", w:2, h:1}
normalize(null) / normalize("boom") / normalize([null,undefined,1,"x"])
                                               -> 都回 9 張預設卡，不丟例外
normalize([{id:"note",w:3,h:2},{id:"note",w:1,h:1}])
                                               -> 只留第一張，去重正確
```

### A-12【高】`desk.ts:35` `kindOf()` 對非字串 id 直接丟例外

見 A-11。三個入口都會炸：

```
normalize([{ id: 5,  w:1, h:1 }])   -> TypeError: id.startsWith is not a function
normalize([{ id: {}, w:1, h:1 }])   -> TypeError: id.startsWith is not a function
normalize(DEFAULT_DESK, [7])        -> TypeError: id.startsWith is not a function
```

第 116 行的 `if (!id || ...)` 只擋掉 falsy，沒擋掉「不是字串」。
`normalize()` 是整個版面的驗證關卡，它自己會被輸入炸掉。

### A-13【中】`desk.ts:116` 任何 `links` 開頭的字串都被當成合法磚

```
normalize([{ id: "links<img src=x>" }])[0]  -> {"id":"links<img src=x>","w":2,"h":1}
normalize([{ id: "linksNOTANUMBER" }])[0]   -> {"id":"linksNOTANUMBER","w":2,"h":1}
```

型別上 `TileId` 是 `links${number}`，執行期只檢查 `startsWith("links")`。
這些垃圾 id 會永久留在使用者的設定裡，被寫進 `data-id` 屬性
（`Cards.tsx:264`，Preact 會跳脫，所以不是 XSS），並且被
`Cards.tsx:139` 的 `linkIds.includes(tl.id)` 過濾掉而永遠不顯示 ——
使用者看不到、也刪不掉的殭屍條目。

### A-14【低】`desk.ts:147` / `links.ts:102` NaN 索引穿過範圍檢查

`if (b < 0 || b >= list.length) return list;` —— NaN 兩邊都是 false。

```
base 順序:  links,todos,note,pomodoro,photos,calendar,weather,media,clock
nudge(base, "weather", NaN)
  -> weather,links,todos,note,pomodoro,photos,calendar,media,clock
     （應該原封不動，實際被搬到第一位；splice(NaN,...) 把 NaN 當 0）
nudge(base, "weather", 0.5)      -> 順序不變     OK
nudge(base, "weather", Infinity) -> 順序不變     OK
```

`links.ts:101-107` `reorder()` 同一個洞：

```
reorder([a,b], NaN, 1)  -> ["b","a"]   （應該原封不動）
reorder([a,b], 0.5, 1)  -> ["b","a"]
reorder([a,b], 0,   5)  -> 回傳同一個陣列參考   OK
```

---

## 優先項 4：`solar.ts` / `almanac.ts`

### 好消息：太陽視黃經是準的

對照已知的二分二至時刻（UTC），`apparentLongitude()` 的誤差：

```
2025 春分 2025-03-20T09:01Z : lambda=  0.0069  err= 0.0069deg (≈10 min)
2025 夏至 2025-06-21T02:42Z : lambda= 90.0046  err= 0.0046deg (≈ 7 min)
2025 秋分 2025-09-22T18:19Z : lambda=179.9970  err=-0.0030deg (≈ 4 min)
2025 冬至 2025-12-21T15:03Z : lambda=270.0009  err= 0.0009deg (≈ 1 min)
2026 春分 2026-03-20T14:46Z : lambda=  0.0057  err= 0.0057deg (≈ 8 min)
2026 夏至 2026-06-21T08:24Z : lambda= 90.0022  err= 0.0022deg (≈ 3 min)
2026 秋分 2026-09-23T00:05Z : lambda=179.9968  err=-0.0032deg (≈ 5 min)
2026 冬至 2026-12-21T20:50Z : lambda=270.0006  err= 0.0006deg (≈ 1 min)
2024 春分 2024-03-20T03:06Z : lambda=  0.0012  err= 0.0012deg (≈ 2 min)
2028 夏至 2028-06-20T20:02Z : lambda= 90.0058  err= 0.0058deg (≈ 8 min)
```

全部在 0.01 度以內，正是檔頭註解自己宣稱的精度。反解出來的 2026 全年節氣時刻
（台北時間）也對得上公開曆：

```
小寒 01-05 16:19   大寒 01-20 09:41   立春 02-04 03:55   雨水 02-18 23:46
驚蟄 03-05 21:50   春分 03-20 22:37   清明 04-05 02:28   穀雨 04-20 09:29
立夏 05-05 19:36   小滿 05-21 08:29   芒種 06-05 23:37   夏至 06-21 16:20
小暑 07-07 09:49   大暑 07-23 03:13   立秋 08-07 19:40   處暑 08-23 10:22
白露 09-07 22:41   秋分 09-23 08:09   寒露 10-08 14:30   霜降 10-23 17:40
立冬 11-07 17:51   小雪 11-22 15:23   大雪 12-07 10:49   冬至 12-22 04:49
```

（冬至落在 12/22 而非 12/21，是正確的 —— 2026 年台北的冬至確實跨到 22 日凌晨。）

索引語意也對得上 `messages.json`：`jq_0 = 春分`、`jq_21 = 立春`，
所以 `jieqiIndex`（`solar.ts:117`）以春分為 0 是一致的，
`almanac.ts:47` `seasonSymbol` 的 `+3` 偏移推得出正確的四象：

```
seasonSymbol(2026-02-10) = 0 青龍（春）
seasonSymbol(2026-07-20) = 3 朱雀（夏）
seasonSymbol(2026-10-20) = 2 白虎（秋）
seasonSymbol(2026-01-20) = 1 玄武（冬）
```

一整年每 6 小時取樣 1464 次：`jieqiIndex` 恆在 0–23 且 24 個值全部出現過，
`houIndex` 恆在 {0,1,2}，`jieqiFraction` 恆在 [0,1)。

### 日出日落也是準的（台北）

```
2025-06-21  rise 05:05 (曆書 05:04)   set 18:46 (18:47)   晝長 13.694h
2025-12-21  rise 06:34 (06:35)        set 17:09 (17:11)   晝長 10.579h
2026-03-20  rise 05:58 (06:00)        set 18:05 (18:07)   晝長 12.112h
2026-09-23  rise 05:43 (05:47)        set 17:50 (17:55)   晝長 12.119h
```

誤差 1–5 分鐘，與註解宣稱的「幾分鐘之譜」相符。

### 極區：`null` 這一支是對的（NaN 那一支不對，見 A-8）

```
lat=  90  夏至/冬至/春分  -> null / null / null
lat=89.9  夏至/冬至       -> null / null      春分 -> 有值
lat=  85  夏至/冬至       -> null / null      春分 -> 有值
lat=78.2（Svalbard）夏至/冬至 -> null / null   春分 -> 有值
lat=  70  夏至/冬至       -> null / null
lat=66.6  夏至 -> null    冬至 -> 18:54/21:02（約 2 小時天光，合理）
lat= -90 / -85 / -78.2    -> 南半球對稱，同樣正確
lat= 1e9                  -> null / null      （不會回 NaN）
```

沒有任何一個有限緯度回傳 NaN。破口只有非數值輸入（A-8）。

### 南半球與極端經度：座標對，時刻是「本機時鐘」

```
Sydney       2026-06-21  rise 05:00 set 14:54  晝長  9.90h
Sydney       2025-12-21  rise 02:41 set 17:05  晝長 14.41h
Buenos Aires 2026-06-21  rise 19:00 set 04:50  晝長  9.83h
Kiritimati   2026-06-21  rise 00:24 set 12:38  晝長 12.23h
Pago Pago    2026-06-21  rise 01:46 set 13:03  晝長 11.28h
Reykjavik    2025-12-21  rise 19:22 set 23:29  晝長  4.13h
```

**晝長全部正確**（雷克雅未克冬至 4 小時、雪梨冬至 9.9 小時），
時刻則是換算到本機時區並繞回 [0,24) 的結果 —— 這是 `SunTimes` 註解裡
寫明的刻意設計（那兩個值是要畫到 24 小時環上的角度）。
不是缺陷，但下面 C-3 有一個相關的顯示問題。

### C 級：`almanac.ts:35-38` `daysToNextJieqi` 有 19.5% 的日子差一天

2026 全年逐日比對「線性近似」與「真正的黃經跨越時刻」：

```
誤差直方圖: {"0": 294, "1": 56, "-1": 15}   最壞 +1 天
```

365 天裡有 71 天（19.5%）盤邊會寫錯一天。註解已經自承「誤差半天上下」，
所以這是刻意的取捨，不算缺陷 —— 但比例比「半天上下」聽起來的要高。
要修的話不必解克卜勒方程，`solar.ts` 已經有 `apparentLongitude`，
對它做十次二分法就能得到分鐘級的答案。

---

（下一批：`agenda.ts` / `shichen.ts` / `mesh.ts` / `holidays.ts` / `weather.ts` /
`radar.ts` / `focus.ts` / `workspace.ts` 的邊界測試，以及現有測試的誠實性檢查。）

## 優先項 5：其餘模組

### A-15【中】`mesh.ts:172` + `settings.ts` 未驗證的 `solidColor` = 一個可遠端抓圖的信標

`paletteForColor(hex)` 直接把字串當 CSS 值用（`css: hex`），
而 `src/styles.css:61` 是 `background: var(--mesh)`。
`url(...)` 本身就是 `background` 的合法值 —— **不需要任何注入技巧、
不需要分號、CSSOM 沒有東西可以拒絕**。

端對端實測（jsdom 環境）：

```js
unpack({ app: "tianguang", version: 1, at: "x",
         settings: { schemaVersion: 1, background: "solid",
                     solidColor: "url(https://evil.example/beacon.png)" } })
```

```
unpack 收下:      true
settings.solidColor = "url(https://evil.example/beacon.png)"   (migrate 不驗)
paletteForColor(...).css = "url(https://evil.example/beacon.png)"
setProperty("--mesh", css) 之後 getPropertyValue("--mesh")
                        = "url(https://evil.example/beacon.png)"
```

`manifest.json` 沒有覆寫 CSP，MV3 擴充功能頁的預設值是
`script-src 'self'; object-src 'self'` —— 沒有 `default-src`、沒有 `img-src`，
所以這張遠端圖會被載入。後果是「匯入一份朋友給的備份檔」等於
把每次開新分頁的事件回報給對方的伺服器。

同一支函式對 `"#zzz"`、`""`、`"image-set(url(...))"` 也一律原樣放行。

順帶一提（**不是**目前的缺陷，是硬化建議）：`mesh.ts:178`
`paletteForImage` 用 `url("${url}")` 組字串，沒有跳脫引號。實測
`paletteForImage('x") ,url("https://evil.example/b.png', 0.5, 0)` 產生
`center / cover no-repeat url("x") ,url("https://evil.example/b.png")` ——
一個合法的雙層背景。目前 `url` 一律來自 `images.toUrl()` 的 blob: 網址，
攻擊者碰不到，所以現在是安全的；但那是靠呼叫端，不是靠這一行。

### A-16【中】`weather.ts:171-179` `resolveCityQuery` 的前綴比對會對到錯的城市

「長的優先」擋得住 `台北` vs `台北車站`，但擋不住兩個城市名互為前綴：

```
resolveCityQuery("台北車站") -> "Taipei"      OK
resolveCityQuery("台中港")   -> "Taichung"    OK
resolveCityQuery("東京鐵塔") -> "Tokyo"       OK
resolveCityQuery("新北投")   -> "New Taipei"  <-- 錯
```

新北投是**台北市**北投區，不是新北市。使用者查新北投的天氣會拿到新北市的。
同類的還有「新竹」對「新竹縣/市」沒問題，但任何以既有鍵開頭的地名都有這個風險。

### A-17【低】`focus.ts:33` `durationMs` 的 `??` 攔不住 NaN

```
durationMs("work", {})            -> 1500000   OK
durationMs("work", { work: 0 })   -> 60000     OK（夾到 1 分鐘）
durationMs("work", { work: 99999 })-> 10800000 OK（夾到 180 分鐘）
durationMs("work", { work: NaN }) -> NaN       <-- 漏
```

`d[mode] ?? DEFAULT_DURATIONS[mode]` 的 `??` 只接 null/undefined。
`normalizeDurations`（第 37-45 行）用 `Number.isFinite` 擋得住，兩支的標準不一致。
呼叫端 `Cards.tsx:477` 與 `Focus.tsx:62` 傳的是 `value.durations`，
而它經過 `workspace.migrate` 的 `normalizeDurations`，所以目前構不成問題 ——
但這道防線在別的模組裡，不在函式自己身上。

### A-18【低】`workspace.ts:112` 暫停剩餘時間沒有下限夾子，倒數會顯示負值

```
remaining({...p, pausedLeft:  9e9 }, now, 1500000) -> 1500000   OK（上限有夾）
remaining({...p, pausedLeft: -5000}, now, 1500000) -> -5000     <-- 沒有下限
formatLeft(-5000)                                  -> "-1:-5"
```

第 114 行的 `endsAt` 那一支有 `Math.max(0, ...)`，第 112 行的 `pausedLeft` 那一支沒有。
`pause()` 自己不會產生負值，所以只有損壞／被改過的 `tg.workspace`
（`migrate` 對 pomodoro 的數字欄位一樣不驗）會走到這裡，畫面會出現 `-1:-5`。
`clock(NaN)` 同理回 `"NaN:NaN"`。

### A-19【低】`agenda.ts:20,24` `makeEvent` 只檢查日期的**形狀**，不檢查有效性

```
makeEvent("2026-01-01","09:00") -> date=2026-01-01  time="09:00"   OK
makeEvent("2026-1-1", "09:00")  -> null                            OK（形狀不合）
makeEvent("2026-01-01","24:00") -> time=""  （時間正確地退回整天）  OK
makeEvent("2026-01-01","23:60") -> time=""                         OK
makeEvent("2026-13-45","09:00") -> date=2026-13-45   <-- 收下了
makeEvent("2026-02-30","09:00") -> date=2026-02-30   <-- 收下了
makeEvent("9999-99-99","00:00") -> date=9999-99-99   <-- 收下了
```

時間欄位驗得很嚴（`([01]\d|2[0-3]):[0-5]\d`），日期欄位只驗 `\d{4}-\d{2}-\d{2}`。
`monthGrid` 永遠產不出 `2026-02-30`，所以這些行程存進去之後
在月曆上**永遠不會出現**，卻一直佔著 storage。使用者從 UI 刪不掉看不見的東西。
（正常路徑是 `<input type="date">`，所以要踩到得靠匯入或損壞資料。）

### A-20【低】`shiftMonth` 溢位回 `[NaN, NaN]`

```
shiftMonth(2026, 0, -1)   -> [2025, 11]   OK
shiftMonth(2026, 11, 1)   -> [2027, 0]    OK
shiftMonth(2026, 0, -13)  -> [2024, 11]   OK
shiftMonth(2026, 0, NaN)  -> [NaN, NaN]
shiftMonth(2026, 0, 1e9)  -> [NaN, NaN]   （Date 的 ±8.64e15ms 上限）
```

之後 `monthGrid(NaN, NaN)` 會產出 42 個 Invalid Date。鍵盤翻頁一次只 ±1，
所以正常操作到不了；只是沒有夾子。

---

## B. 查過而且是對的（覆蓋範圍）

| 模組 | 驗了什麼 | 結果 |
|---|---|---|
| `solar.ts` `apparentLongitude` | 對照 2024/2025/2026/2028 十個已知二分二至時刻 | 誤差 < 0.01 度（≈ 1–10 分鐘），符合自述精度 |
| `solar.ts` `jieqiIndex` | 反解 2026 全年二十四個交節時刻、對照 `messages.json` 的 `jq_*` | 日期全對（含冬至落在 12/22）；一年取樣 1464 次，恆在 0–23 且 24 個值都出現 |
| `solar.ts` `sunTimes` | 台北四個日期對照曆書；極區 ±90/±85/±78.2/±70/±66.5 三個季節 | 台北誤差 1–5 分鐘；極區一律回 `null`，**沒有任何有限緯度回 NaN** |
| `solar.ts` `sunTimes` | 南半球（雪梨、布宜諾斯艾利斯）、UTC+14、UTC−11、雷克雅維克 | 晝長全部正確（雷克雅維克冬至 4.13h、雪梨冬至 9.90h） |
| `solar.ts` `moonFraction` | 2026 全年逐時 8760 次 | 恆在 [0,1)，除跨年外單調遞增，12/31 23:00 = 0.99989 |
| `almanac.ts` `seasonSymbol` | 四季各抽一點 | 春青龍 0、夏朱雀 3、秋白虎 2、冬玄武 1，全對 |
| `almanac.ts` `houIndex` `daylight` | 一年 1464 次取樣 | `houIndex` 恆在 {0,1,2}；`daylight` 模減正確 |
| `shichen.ts` | 24 個整點的 `indexAt` → `range` 一致性 | 無缺口無重疊；子時跨午夜 `[23,1)` 正確；23:59→00:00 都是索引 0 |
| `agenda.ts` `monthGrid` | 2020–2032 共 156 個月 | 恆 42 格、格格差一天、該月每日皆覆蓋、首格恆為星期一；2024/2028 有 2/29、2100 沒有 |
| `agenda.ts` `isoWeek` | 12 個已知 ISO 週 + 2020–2032 逐日 | 全對；恆在 1..53，沒有第 0 週 |
| `desk.ts` | 2000 次隨機 move/nudge/resize（含負值、超界、NaN） | 卡片集合恆不變、無重複無遺失、`w`∈[1,4]、`h`∈[1,3]、links 卡 `h` 恆為 1 |
| `desk.ts` `clamp` | Infinity / −99 / 字串 / NaN | 一律退回 fallback，正確 |
| `links.ts` `normalizeUrl` | 12 種惡意 scheme | **全部擋下**（見優先項 1） |
| `links.ts` `initial` | 空字串、全空白、emoji | `"?"`、`"?"`、`"😀"`（有正確處理 surrogate pair） |
| `roman.ts` | 1..60（唯一呼叫點 `Dial.tsx:242` 的 `m = i+1`，`m%5===0`） | 5..60 全部正確，最大 `LX` |
| `mesh.ts` `colorsAt`/`paletteAt` | 一天 1440 個取樣點 | 六個色永遠是合法 `#rrggbb`；`colorsAt(24) === colorsAt(0)` 環接正確 |
| `mesh.ts` `luminance` | 黑白端點 | 0 與 1，WCAG 公式正確 |
| `holidays.ts` `parseIcs` | 折行、`\,` `\;` `\\` 跳脫、帶時刻的 DTSTART、缺 SUMMARY、缺 END、重複鍵、開頭就是續行 | **全部正確**；折行接回、跳脫還原成 `Escaped, comma; semi\backslash`、帶時刻的事件正確丟棄、殘缺事件不入列 |
| `holidays.ts` `feedUrl` | `en/../../evil` 路徑穿越 | `encodeURIComponent` 擋下（斜線被編碼） |
| `holidays.ts` `around` | 2026 前後各一年 | 正確保留 2025-01-01 與 2027-12-31，丟掉 2024/2028 |
| `radar.ts` `tileAt`/`cover` | z4–z10 × 8 個緯度 × 6 個經度 | **沒有任何超出 `[0, 2^z)` 的格子、沒有 NaN**；`cover(NaN,…)` 回 0 格；經度環繞正確；覆蓋率驗證：800px 寬實得 −12.6..1011.4 |
| `radar.ts` `echoLayer` | z10 與 z4 | z10 → 降到 z7、scale 8；z4 → z4、scale 1，`maxNativeZoom` 邏輯正確 |
| `weather.ts` `parseForecast` | daily 只有 2 天 / 0 天 | 不丟例外，回較少天數（`slice(1,4)` 有界） |
| `focus.ts` `advance` | 連續十輪 | `1short 2short 3short 4long 5short 6short 7short 8long …` 每四輪長休，正確 |
| `focus.ts` `makeSession` | 59999ms / 休息模式 / 60000ms | 分別回 null / null / 正常，`MIN_SESSION_MS` 門檻正確 |
| `focus.ts` `lastDays` | 跨年（2025-12-30..2026-01-01） | 日期序列正確，空日補零柱 |
| `workspace.ts` `roundsToday` | 跨日 | 正確歸零 |
| `settings.ts` `migrate` | `__proto__` 與 `constructor.prototype` 兩種原型污染載荷 | **打不進去**（spread 用 CreateDataProperty） |
| `snapshot.ts` `unpack` | 14 種畸形輸入 | 9 種正確回 null（見 A-9 的 4 個例外） |

### A-21【中】`src/ui/Margins.tsx:29,33` 曆書欄一年有四天顯示不存在的時刻

（在 `src/lib/` 之外，但它吃的是 `solar.ts` 的輸出，而且我實測到了，所以列在這裡。）

```ts
const hhmm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;
```

`Math.round` 在小數部分 ≥ 0.9917 時進位成 60，但整數位不跟著進。
拿 `sunTimes(台北)` 跑 2026 全年 365 天：

```
2026-10-30  日出 -> "05:60"
2026-03-09  日落 -> "17:60"
2026-09-14  日落 -> "17:60"
2026-09-28  晝長 -> "11h60"   （span() 第 33 行同一個毛病）
hhmm(13.999) = "13:60"   hhmm(23.9999) = "23:60"
hhmm(NaN) = "NaN:NaN"    span(NaN) = "NaNhNaN"   （配合 A-8）
```

一年四天，盤邊寫著一個不存在的時刻。修法是先四捨五入到分鐘再拆：
`const m = Math.round(h * 60); pad(Math.floor(m/60) % 24) + ":" + pad(m % 60)`。

---

## 現有測試的誠實性檢查

242 個測試全過。大部分是紮實的，但有五處**即使程式壞掉也照樣會過**。

### 強的（值得留著的樣板）

- `test/solar.test.ts:31-46` —— 用香港天文台的 2026 十五個交節時刻，
  驗「交節前一小時是上一個、後一小時是下一個」。這比抽查某天落在哪個節氣嚴格得多，
  角度算錯或索引偏移都逃不掉。這是整份測試裡最好的一個。
- `test/solar.test.ts:70-78` —— 「春分前後全球日長都接近十二小時」，
  拿天文本身當預言機，不需要查任何一地的日出表。自我驗證式的測試。
- `test/desk.test.ts:41-59` —— 真的餵了 `w: 99`、`h: -4`、`w: "寬"`、`h: null`
  和一個不認得的 id，而且斷言的是具體數值。
- `test/solar.test.ts:48-60` —— 一年逐日檢查黃經單調遞增且**恰好**繞一圈（`wraps === 1`）。

### 弱的（壞掉也會過）

1. **`test/render.test.tsx:123-128`「沒有版本號的舊資料補上預設值」**
   只斷言 `out.clock24 === DEFAULTS.clock24` —— 一個**頂層純量**。
   `migrate` 的巢狀合併完全壞掉（A-6），這個測試看不到。
   要抓到就得斷言 `migrate({ cards: { todos: true } }).cards.calendar`。

2. **`test/render.test.tsx:130-135`「比較新的設定原樣留著」**
   只斷言 `schemaVersion === 99` 和一個**不認識的**頂層鍵 `futureThing === 1`。
   測試自己的註解寫著「降級會把不認識的欄位吃掉」，但它從來沒有檢查
   **認識的**巢狀欄位有沒有活下來 —— 而那正是 A-6 最嚴重的一支
   （`migrate({schemaVersion:99, cards:{newcard:true}})` 弄丟全部十張卡）。

3. **`test/workspace.test.ts:126-131`「舊資料補上預設值」**
   `expect(w.todos).toEqual([])` 之所以過，是因為輸入根本**沒有** `todos` 這個鍵。
   `migrate({ todos: "boom" })` 會原樣回 `"boom"`（A-10），而測試從來沒餵過錯型別。
   `events`/`projects`/`sessions` 三個有 `Array.isArray` 保護的反而沒被測，
   沒保護的那一個被測了 —— 但用的是測不出問題的那種輸入。

4. **`test/snapshot.test.ts:30-37`「缺欄位的舊檔案補成預設，不是丟掉」**
   同樣只挑 `linkCards`（頂層純量）。整份 `snapshot.test.ts` 沒有任何一個
   **型別錯誤**的輸入 —— `settings: "abc"`、`settings: [1,2]`、`version: NaN`
   這三個 `unpack` 都會收下（A-9），而「認不出來的東西一律回 null，不猜」
   那個測試（第 21-28 行）只試了五種一望即知的垃圾。

5. **`test/render.test.tsx` 裡二十處 `await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy())`**
   這是**掛載完成的等待閘**，不是斷言 —— 任何非空字串都會過，
   包括 A-15 那個 `url(https://evil.example/beacon.png)`。
   同檔第 69、74、284、301 行的 `expect(cssVar("--fg")).toBe("#1B2230")` 才是真的斷言。
   閘門本身沒問題，但它出現的次數（20）遠多於真斷言的次數（4），
   容易讓人以為背景引擎被測得很密。

6. **`test/render.test.tsx:159`「日照弧」`expect(dial.querySelector(".sunarc")).not.toBeNull()`**
   只驗元素**存在**。A-8 的 NaN 日出不會讓元素消失，只會讓 SVG path
   變成 `M NaN NaN A …`，所以這個測試抓不到。要抓得斷言 path 的 `d` 屬性不含 `NaN`。

### 完全沒有測試覆蓋的

- `settings.ts` 的 `save()` / `flush()` / `load()` —— 包含 sync 寫失敗降級寫 local
  那條路徑（`local-fallback`），也就是 C-1 說的配額問題發生時唯一的補救機制。
- `mesh.ts` 的 `paletteForColor` / `paletteForImage`（`test/palette.test.ts` 測的是
  指令面板的 `palette.ts`，不是背景的 `mesh.ts`；同名不同檔）。
- `images.ts` 全部（jsdom 沒有 IndexedDB / OffscreenCanvas，可以理解）。
- `i18n.ts`、`wheel.ts`、`secondcal.ts` 的 `subDate`。

---

## C. 不是缺陷，但值得做的

### C-1 快速連結加到第 47 個，設定就靜默停止同步

`chrome.storage.sync` 的 `QUOTA_BYTES_PER_ITEM` 是 8192 位元組
（量的是 key 長度加上 value 的 JSON 字串）。整份設定存成一項（這個決定本身是對的），
所以所有欄位共用這 8KB。用實際形狀的連結（UUID + 中文標題 + 帶查詢字串的網址）量：

```
0 個連結:    938 bytes
16 個連結:  3419 bytes
32 個連結:  5931 bytes
47 個連結:  8192 bytes  <-- 超過
48 個連結:  8443 bytes
64 個連結: 10955 bytes  (MAX_LINKS = 64，設定頁上寫著的上限)
一段 3000 字的自訂名言（其他都預設）: 9938 bytes
```

`MAX_LINKS = 64` 這個數字，配上 `Settings.tsx:589` 大剌剌寫著的 `x / 64`，
等於在邀請使用者走進一個從第 47 個開始就不再跨裝置同步的狀態。
降級機制是有的（`settings.ts:228-232` catch 之後寫 local，回報 `local-fallback`，
`App.tsx:195` 會顯示一次提示），所以資料不會掉 —— 但提示只出現一次，
而且使用者不會知道「是第 47 個連結害的」。

三個選項，挑一個就好：
1. `MAX_LINKS` 降到 32（實測仍有 2.2KB 餘裕），設定頁改寫 32。
2. 把 `links` 拆成獨立的一項（`tg.links`），設定本體維持在 1KB 以下 ——
   512 項的限制離得很遠，兩項不痛不癢。
3. 連結改存 `chrome.storage.local`，跟工作區同一套說法（設定頁已經寫明不跨裝置）。

順帶一提：`quoteText` / `quoteBy` / `name` 在 `Settings.tsx:233,243` 都沒有
`maxlength`，單靠一段長名言就能把 8KB 吃掉。

### C-2 `almanac.daysToNextJieqi` 可以免費變準

第 35-38 行用 `rest / 0.9856` 線性外插，實測 2026 全年 71/365 天（19.5%）差一天。
`solar.ts` 已經有 `apparentLongitude`，對它做十次二分法（約六行）就能得到
分鐘級的交節時刻，誤差降到零。註解說「為了盤邊一行小字不值得去解克卜勒方程」——
沒錯，但這裡不需要克卜勒，只需要對一個已經有的單調函式做二分搜尋。

### C-3 `sunTimes` 的節氣時刻系統性早約 5–12 分鐘

拿 `test/solar.test.ts` 自己引用的香港天文台值對照本模組反解出的交節時刻：

```
春分 2026: HKO 22:45:42 CST，本模組 22:37   （早 8.7 分）
立夏 2026: HKO 19:48:27 CST，本模組 19:36   （早 12 分）
```

方向一致（永遠偏早），量級與檔頭自述的「0.01 度 ≈ 十五分鐘」相符，
日解析度下無害。既有測試用 ±1 小時的窗口，所以吸收得掉。
記在這裡只是為了：如果將來有人想把「交節倒數」做到分鐘級，
得先知道基準本身有十分鐘的系統偏差。

### C-4 `radar.tileAt` 可以回傳 `y === n`（不是合法的圖磚列號）

```
tileAt(-90, 0, 4) -> { x: 8, y: 16 }   而 z4 的合法範圍是 0..15
```

第 58 行的夾子是 `Math.min(n, y)`，應該是 `n - 1`。
目前不構成問題，因為 `cover()` 第 93 行的 `iy >= n` 會把它濾掉 ——
但「不會算出範圍外的格子」這句註解（第 56-57 行）目前是靠呼叫端成立的，不是靠它自己。

### C-5 `desk.nudge` / `links.reorder` 的範圍檢查應該用 `Number.isInteger`

`if (b < 0 || b >= list.length)` 對 NaN 一律放行（A-14）。
一行改成 `if (!Number.isInteger(b) || b < 0 || b >= list.length)` 就同時
解決 NaN 與小數。`solar.sunTimes` 的 `cosH` 檢查（A-8）是同一個形狀的錯誤，
建議一起改成 `if (!(cosH >= -1 && cosH <= 1))` —— 這個寫法 NaN 會落進 return。

### C-6 `palette.rank` 的 query 沒有 trim，尾隨空白會清空結果

`palette.ts:73` 用 `query.trim()` 判斷「有沒有輸入」，
但第 76 行把**沒有 trim 的** query 傳給 `score()`。實測：

```
rank(items, "gh")   -> ["gh notes", "GitHub"]
rank(items, " gh ") -> []                      <-- 空的
```

指令面板貼上一段帶空白的文字就會看到一片空白。第 73 行算完的
`query.trim()` 拿去用就好，不必多寫一行。

### C-7 `palette.score:52` 有一個永遠為 false 的判斷

```ts
if (direct > 0) {
  const boundary = direct === 0 || /[\s./\-_·—、（(]/.test(t[direct - 1]!);
```

進到這個分支時 `direct > 0` 已經成立，所以 `direct === 0` 恆為 false。
無害，但讀的人會停一下。刪掉即可。

### C-8 `desk.normalize` 應該連 `links` 後綴一起驗

`kindOf` 只看 `startsWith("links")`，所以 `"linksNOTANUMBER"` 會被收下並永久保存，
但因為 `Cards.tsx:139` 的 `linkIds.includes()` 過濾，它永遠不顯示 ——
一個使用者看不見也刪不掉的殭屍條目（A-13）。
`/^links([2-9]|[1-9]\d)?$/` 一個正規式就解決。

### C-9 `weather.condition` 對範圍外的碼一律回「雷雨」

```
condition(-1)   -> "wx_partly"
condition(1000) -> "wx_thunder"
condition(NaN)  -> "wx_thunder"
```

Open-Meteo 不會送這些，但「不認識的碼 = 雷雨」是最糟的預設值。
最後一行改成 `code <= 99 ? "wx_thunder" : "wx_clear"`（或回 null 讓 UI 不畫圖示）比較誠實。

---

## 結論

**`src/lib/` 的數學是對的。** 節氣、日出日落、時辰、月曆格、ISO 週數、
四象、雷達圖磚座標 —— 我拿得到獨立參考值的每一項都對得上，
極區、南北半球、閏年、跨年、23:59→00:00 這些邊界也都站得住。
`desk.ts` 的版面在 2000 次隨機操作下不會掉卡、不會重複、尺寸不會出界。
`links.ts` 的 URL 驗證擋得住 `javascript:` 和 `data:`。原型污染打不進去。

**問題全部集中在同一件事上：資料進來的時候沒有人檢查。**
`settings.migrate` 相信 storage 和匯入檔的每一個位元組，
`snapshot.unpack` 的三道關卡漏掉四種輸入，
而下游的 `desk.normalize`、`solar.sunTimes`、`workspace.todos`
都假設自己拿到的型別是對的。一份手改過的備份 JSON 就能讓工作區
永久打不開（A-11），或讓每次開新分頁靜靜地打一個遠端請求（A-15）。

上架前我會修的，照順序：

| # | 位置 | 一句話 |
|---|---|---|
| A-1 | `search.ts:66-68` | `resolve()` 回傳前過一次 `normalizeUrl()`，非 http(s) 就當關鍵字 |
| A-11 A-12 | `desk.ts:35,116` | `kindOf` 加 `typeof id !== "string"` 的門，`normalize` 不會再被輸入炸掉 |
| A-6 A-7 | `settings.ts:149-160` | `cards`/`home` 深層合併；`lat`/`lon`/`links`/`desk` 四個欄位做型別夾持 |
| A-8 | `solar.ts:102` | `if (!(cosH >= -1 && cosH <= 1)) return {null,null}` |
| A-10 | `workspace.ts:192` | `todos` 比照 `events` 加 `Array.isArray` |
| A-15 | `settings.ts` / `mesh.ts:172` | `solidColor` 用 `/^#[0-9a-f]{6}$/i` 驗，不合就退回預設 |
| A-9 | `snapshot.ts:51` | 版本號改用 `Number.isInteger(v) && v >= 1 && v <= SNAPSHOT_VERSION` |
| A-21 | `Margins.tsx:29,33` | 先進位到分鐘再拆時分，`05:60` 就不會出現 |
| A-2 A-3 | `search.ts:40,56` | 前綴命中時比對整個字典避免吃字；`looksLikeUrl` 排除含 `@` 的輸入 |
| C-1 | `links.ts:21` | `MAX_LINKS` 降到 32，或把 `links` 拆成獨立的 storage 項 |

A-16（新北投→New Taipei）、A-17、A-18、A-19、A-20 與 C-2..C-9 可以排在上架之後。
