# 天光 / Aubade — `src/ui/` 與 `src/styles.css` 上架前稽核

稽核方式：`npm run build` → `dist/` 以 `python -m http.server 4300` 服務 →
Edge `--headless=new --dump-dom` / `--screenshot` 驅動，探針注入 `dist/probe.js`
與 `dist/scenario.js`（`dist/index.html` 已加兩行 script，`dist/index.html.orig`
為原始備份）。`src/`、`test/`、設定檔全程未改。

探針以假的 `Date` 固定時刻（`?h=15` → 2026-09-02 15:30:12），因為 classic script
在 body 尾端執行、早於 deferred 的 app module，所以來得及換掉 `window.Date`。

> 註：`chrome.*` 在 http 伺服器下不存在，i18n 退回 `c_links`、`fo_work` 這種原始鍵，
> 截圖裡看到的英數字串是預期行為，不是缺陷。

---

## 摘要

| # | 缺陷 | 位置 | 嚴重度 |
|---|---|---|---|
| A1 | 每天約 14:30–16:30 整頁淺字壓淺底，主畫面與番茄鐘全屏讀不到（大字對比低到 2.37:1） | `src/lib/mesh.ts:151,166-167` → `src/ui/App.tsx:242-243,257`、`src/styles.css:2589` | 高（上架擋門） |
| A2 | `--fg-2` 在亮底時段一律不到小字 4.5:1（實測 3.53–4.19） | `src/lib/mesh.ts:156` | 中 |
| A3 | 四個浮層關掉後焦點一律掉到 `<body>`，不還給開啟者 | `Settings.tsx:63`、`Dial.tsx:144`、`Calendar.tsx:415`、`Focus.tsx:51`、`Palette.tsx:391` | 高 |
| A4 | 四個浮層宣告 `aria-modal="true"` 但 Tab 走得出去 | 同上五處 | 高 |
| A5 | 時辰盤盤內 0 個可聚焦元素、無關閉鈕，一次 Tab 焦點就跑到被遮住的按鈕上 | `src/ui/Dial.tsx:194-205` | 高 |
| A6 | 指令面板 Escape 綁在輸入框，焦點一離開就關不掉（鍵盤無出口） | `src/ui/Palette.tsx:466-467` | 高 |
| A7 | 全文件 0 個 `h1/h2/h3`、0 個 `aria-live` | `src/ui/App.tsx:393-395`、`Settings.tsx:607` | 中 |
| A8 | 天氣卡的 ResizeObserver 建在 ref callback，從不 disconnect（實測 8 created / 0 disconnected） | `src/ui/WeatherCard.tsx:50-57` | 中 |
| A9 | 拖曳遇 `pointercancel` 卡死：卡片永遠 `.held`、`pointermove` 留著、永不 commit | `src/ui/Cards.tsx:183-191,233-241` | 中 |
| A10 | Shift+方向鍵換位置會踩進「關掉的卡」，按第一下畫面不動 | `src/ui/Cards.tsx:245-254` + `src/lib/desk.ts:144-153` | 中 |
| A11 | `prefers-reduced-motion: reduce` 下箭頭動畫變成每秒千次的抖動（`dur=1ms, iters=Infinity`） | `src/styles.css:369-376` + `4634` | 中 |

其中 A1、A3–A6 我會擋上架；A2、A7–A11 建議一起清掉。
D 節列出「綠燈但綠得不算數」的測試，D2/D3/D4 三個直接蓋在上面這些缺陷上卻抓不到。

---

## A. 真實缺陷（依嚴重度）

### A1. 每天下午約 14:00–16:30，整頁變成「淺字壓在淺底上」，主畫面與番茄鐘全屏都讀不到

**位置**
- `src/lib/mesh.ts:151` — `const light = bgLuminance > 0.4;`
- `src/lib/mesh.ts:166` — `const lum = (luminance(c[3]) + luminance(c[4]) + luminance(c[5])) / 3;`
- `src/lib/mesh.ts:167` — `return foreground(lum, meshCss(c), c[4]);`（`boot` = `c[4]`）
- 消費端：`src/ui/App.tsx:242-243`（`--fg` / `--fg-2` 下到 `:root`）、
  `src/ui/App.tsx:257`（`--solid` = `p.boot`）、`src/styles.css:2589-2591`（`.full.solid`）

**成因**
`foreground()` 的亮暗判斷用的是 linear-gradient 三個色停 `c[3] c[4] c[5]` 的**平均**亮度，
門檻 0.4。15:30 內插出來的三色是 `#657ca2`(L≈0.199)、`#a6a3ad`(L≈0.374)、`#e3c19f`(L≈0.573)，
平均 0.382 —— 只差 0.018 就落在門檻下方，於是判定為「暗底」，`--fg` 給了 `#F4F2EE`（近白）。
可是實際畫面上，漸層由中段到底部是 0.37→0.57 的淺灰與淺褐，近白的字直接消失。

**實測（`--headless=new`，`?h=` 固定時刻，逐一量 computed color 對實際底色）**

番茄鐘全屏 `.full.solid`（底色就是 `--solid`，不透明，可精確計算）：

| 時刻 | `--solid` | `--fg` | 主計時 `.fo-time` | 次級文字 `--fg-2` |
|---|---|---|---|---|
| 00:30 | `#101829` | `#F4F2EE` | 15.85 | 7.44 |
| 06:30 | `#3c4a72` | `#F4F2EE` | 7.78 | 4.43 |
| 09:30 | `#c0d5e4` | `#1B2230` | 10.53 | **3.87** |
| 12:30 | `#e3e7e6` | `#1B2230` | 12.78 | **4.19** |
| 13:30 | `#ced2d5` | `#1B2230` | 10.47 | **3.86** |
| 14:30 | `#babec4` | `#1B2230` | 8.54 | **3.53** |
| **15:30** | `#a29da7` | `#F4F2EE` | **2.37** | **1.82** |
| **16:30** | `#867080` | `#F4F2EE` | **4.05**（大字勉強過 3:1） | **2.70** |
| 17:30 | `#69455b` | `#F4F2EE` | 7.22 | 4.18 |
| 21:30 | `#131a32` | `#F4F2EE` | 15.38 | 7.29 |

15:30 那一列，**連 144px 的大計時數字都只有 2.37:1**（WCAG 大字下限 3:1），
其餘每一個次級元素 1.82:1。截圖 `pomo-h15.png` 上，標題列的「c_pomodoro」、
右上四顆模式鈕（fo_short / fo_long / fo_power）、右下 fo_peak 幾乎看不見，
`fo_commit`（disabled）等於不存在。

主畫面同樣中招（15:30，量到的底色取 `boot`=`c[4]`，實際漸層底部更淺，只會更糟）：

```
1.86 (need 3)    button.clock[dial_open]  fs=128px  rgb(244,242,238) on rgb(176,180,188)  "15:30"
1.53 (need 4.5)  p.greet    fs=21.6px   rgba(244,242,238,.66)  "greet_dusk_anon"
1.53 (need 4.5)  p.datel    fs=12.48px  rgba(244,242,238,.66)
1.43 (need 4.5)  p.quote    fs=22.4px   rgba(244,242,238,.66)
1.41 (need 4.5)  span.kbd   fs=10.56px  rgba(244,242,238,.66)  "Ctrl K"
1.71 (need 4.5)  button.icon-btn.gear[settings_open]  "⚙"
```

**重現**
1. `npm run build`；`cd dist && python -m http.server 4300`
2. 把系統時間調到 15:30（或用探針蓋掉 `Date`），開 `http://localhost:4300/`
3. 主畫面時鐘、問候語、語錄全部糊在背景裡；`PageDown` → 展開番茄鐘卡更明顯

**這是先前那個 bug 的同一族**
`.dial` 已經修好了（`src/styles.css:455-456` 自己重新宣告 `--fg: #edeae4` / `--fg-2`，
註解 444-454 就在講這件事）。`.full.solid` 是**沒有跟著修的那一個**：它同樣是一塊
固定配色的表面（`background: var(--solid)`），卻繼續吃 `:root` 那組跟著時辰跑的 `--fg`。

**兩層問題要分開看**
- 真正的根因是 `mesh.ts:166` 用平均亮度決定前景，但 `boot`（`--solid`）取的是 `c[4]` 單一色，
  兩者不同步；門檻 0.4 又剛好卡在下午的漸層中段。
- 次級文字 `--fg-2` 的透明度（亮底 `.62` / 暗底 `.66`）在**正常時段也不合格**：
  09:30 是 3.87、12:30 是 4.19、13:30 是 3.86、14:30 是 3.53，全部低於小字 4.5:1。
  這是獨立於 A1 的第二個問題，見 A2。

---

### A2. `--fg-2` 在一天中大部分亮底時段都達不到小字 4.5:1

**位置** `src/lib/mesh.ts:156` — `fg2: light ? "rgba(27,34,48,.62)" : "rgba(244,242,238,.66)"`

**實測** 上表最右欄。亮底時段（09:00–14:30）量到 3.53–4.19，一律低於 4.5:1。
用 `--fg-2` 的都是小字：`.fo-peak`(9.6px)、`.rounds`(9.6px)、`p.empty`(12.16px)、
`.fo-h`(11.52px)、卡片 header 的計數 `span`(9.92px)、`.datel`(12.48px)、`.kbd`(10.56px)。
字級愈小愈不該踩線，這裡剛好相反。

不是 A1 的一部分：A1 是亮暗判斷選錯邊，A2 是選對邊之後透明度本身不夠。

---

## B. 已檢查、確認正確

- `src/styles.css:435-456` `.dial` 自帶 `--fg` / `--fg-2` / `--gold`，不吃 `:root`。
  實測開盤時 `:root --fg = #F4F2EE`、`.dial --fg = #edeae4`，覆寫確實生效。
  這個先前的 bug 已修好。
- `--solid` 全站只有 `.full.solid` 一個消費者（`grep -n -- "--solid" src/styles.css` → 僅 2590），
  所以 A1 的影響面就是番茄鐘那一屏，加上 `:root` 自身的 `--fg` 影響主畫面。
- `npm run build` 乾淨通過（含 `tsc --noEmit`）。
- 沒有 `img` 缺 `alt`；沒有裸露的 `svg`（全部有 `aria-hidden` 或 `role`）。
- `form.search` 有 `role="search"`；`main` landmark 存在。

（以下區塊隨稽核進行補上）

---

### A3. 四個浮層關閉後焦點一律掉到 `<body>`，沒有還給開啟者

**位置**（四處都沒有存 opener、也沒有在 unmount 時還原）
- `src/ui/Settings.tsx:63` — `useLayoutEffect(() => first.current?.focus(), []);`
- `src/ui/Dial.tsx:144` — `useLayoutEffect(() => boxRef.current?.focus(), []);`
- `src/ui/Calendar.tsx:415` — `useLayoutEffect(() => closeRef.current?.focus(), []);`
- `src/ui/Focus.tsx:51` — `useLayoutEffect(() => closeRef.current?.focus(), []);`
- `src/ui/Palette.tsx:391` — `useLayoutEffect(() => input.current?.focus(), []);`

只有「進去」沒有「回來」。

**實測**（開啟 → 送 Escape → 讀 `document.activeElement`）

```
SETTINGS DRAWER  opener=button.icon-btn.gear  → focus after close = body   restored? false
DIAL             opener=button.clock          → focus after close = body   restored? false
CALENDAR FULL    opener=button.expand         → focus after close = body   restored? false
```

鍵盤使用者按 Esc 收掉設定抽屜之後，下一個 Tab 從文件最開頭重新開始，
原本停在哪一顆齒輪／哪一張卡完全消失。四個浮層行為一致地錯。

---

### A4. 四個浮層都宣告 `aria-modal="true"`，但沒有任何一個攔得住 Tab

**位置** `src/ui/Settings.tsx:82-83`、`src/ui/Dial.tsx:202-203`、
`src/ui/Calendar.tsx:440`、`src/ui/Focus.tsx:93`、`src/ui/Palette.tsx:454`

底下那一屏只有「非當前分頁」才設 `inert`（`src/ui/App.tsx:406`、`430`），
浮層開著時當前那一屏照樣是可 Tab 的。

**實測**（列出「浮層開著時仍可用 Tab 到達」的元素）

```
SETTINGS DRAWER  tabbable 共 20，浮層外 5
DIAL             tabbable 共  5，浮層外 5   ← 浮層內是 0
COMMAND PALETTE  tabbable 共  6，浮層外 5   ← 浮層內只有輸入框 1 個
CALENDAR FULL    tabbable 共 58，浮層外 10
外面那五個一律是：button.badge | button.clock | input[search_label] | button.cue | button.icon-btn.gear
```

`aria-modal="true"` 對讀屏的意思是「浮層外的東西不存在」，但實際上 Tab 走得出去，
兩者說法不一致。

---

### A5. 時辰盤是鍵盤死路：盤內 0 個可聚焦元素、沒有關閉鈕，按一次 Tab 焦點就跑到看不見的按鈕上

**位置** `src/ui/Dial.tsx:194-205`（容器 `tabIndex={-1}`），
`src/ui/Dial.tsx:141-142` 的註解明講「盤面沒有關閉鈕，出口只有 Esc」。

**實測**

```
dial open = true
focus = div.dial.ready[dial_title]
tabbable INSIDE dial  = 0
tabbable OUTSIDE dial = button.badge | button.clock | input[search_label] | button.cue | button.icon-btn.gear
dial has any close button = false
after one Tab focus = button.badge[dial_open]
   its box = 34,34 171x58
   element painted at that point = div.dial.ready[dial_title]
   => focused control is COVERED by the dial: true
```

`document.elementFromPoint()` 在那顆按鈕的正中心回傳的是 `.dial` 本身 ——
焦點框畫在一塊全黑遮罩底下，看不到；這時按 Enter 會觸發一顆使用者看不見的按鈕。
Esc 仍然有效（`src/ui/Dial.tsx:137` 掛在 document 上），所以還救得回來，但
「唯一出口是一個沒有任何視覺提示的按鍵」對只用鍵盤的人不成立。

---

### A6. 指令面板的 Escape 綁在輸入框上，焦點一離開輸入框就關不掉

**位置** `src/ui/Palette.tsx:466-467`

```tsx
onKeyDown={(e) => {
  if (e.key === "Escape") onClose();
```

其他三個浮層都是 `document.addEventListener("keydown", ...)`
（`Settings.tsx:71`、`Dial.tsx:137`、`Calendar.tsx:421`、`Focus.tsx:57`），
只有這裡綁在單一元素上。而面板內部只有一個可聚焦元素（見 A4），**按一次 Tab
焦點就出去了**。

**實測**

```
palette open = true, focus = input[pal_title]
tabbables inside palette = 1
after focusing button.badge (= 按一次 Tab 會到的地方)
Escape dispatched from outside element. palette STILL OPEN = true
Escape from the input closed it = true
```

此時面板還蓋在畫面上，鍵盤上沒有任何一個鍵關得掉它 —— 只能用滑鼠點遮罩
（`src/ui/Palette.tsx:453`）。授權來源那幾顆鈕（`Palette.tsx:488-505`）在真實擴充功能裡
也是可聚焦的，走過去之後同樣關不掉。

---

### A7. 全文件沒有任何標題階層，也沒有 `aria-live`

**實測**（主畫面 + 工作區）

```
h1 count = 0   h2 count = 0   h3 count = 0
main landmarks = 1
aria-live regions = 0
```

`h3` 只存在於設定抽屜內（`src/ui/Settings.tsx:142` 等）。讀屏使用者用標題導覽
（H 鍵）在這一頁完全沒有著力點。

`aria-live` 缺席影響到兩處會動態出現、但不會被朗讀的訊息：
- `src/ui/App.tsx:393-395` 的 `notice`（`save_local_fallback`，設定同步降級的警告）
- `src/ui/Settings.tsx:607` 的 `LinkImport` 結果（`s_links_none` / `s_links_imported`）

---

## B（續）已檢查、確認正確

- 設定抽屜的 tablist 是對的：roving tabindex `0,-1,-1,-1`，ArrowRight 同時移動焦點
  與 `aria-selected`，`#panel-body` 有 `role=tabpanel` + `aria-labelledby=tab-look`。
  實測 `after ArrowRight: focus=button#tab-look selected=false,true,false,false`。
- 設定抽屜內所有 button / input / select / textarea 都有可及名稱（實測 0 個無名控制項）。
- 浮層開著時 `document.body` 的 `overflow` 是 `hidden`，底層不會跟著捲。
- 主畫面沒開浮層時按 Escape 不會爆（無 handler，安全略過）。
- `App.tsx:87-92` 的 PageDown / PageUp 換頁確實可用（實測 `data-page` 由 0 變 1），
  滾輪被接管之後鍵盤仍有路徑到工作區。

---

### A8. 天氣卡的 ResizeObserver 建在 ref callback 裡，從來不 disconnect

**位置** `src/ui/WeatherCard.tsx:50-57`

```tsx
const measure = (el: HTMLDivElement | null) => {
  if (!el || typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(([entry]) => { ... });
  ro.observe(el);
};                        // ← 沒有 return cleanup，沒有 ro.disconnect()
```
用在 `src/ui/WeatherCard.tsx:60` — `<div class="wxcard" ref={measure} data-grab>`。

**實測**（包住 `window.ResizeObserver`，計數 construct / disconnect，
再從設定→元件分頁反覆開關天氣卡）

```
RO at mount: 2 created / 0 disconnected / 2 LIVE
cards: links,weather

after 6 weather-card mount/unmount cycles: 8 created / 0 disconnected / 8 LIVE
```

每一次天氣卡重新掛載就多一個觀察者，舊的一個都沒收，而且它抓著已經脫離文件的
`.wxcard` 節點不放。新分頁是「開著就一直開著」的頁面，這種累積不會被重新整理清掉。

**同一個 repo 裡正確的寫法就在旁邊**，可以直接對照：
- `src/ui/Links.tsx:86-88` — `const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();`
- `src/ui/Radar.tsx:52-57` — 同樣 `return () => ro.disconnect();`

只有 `WeatherCard` 用 ref callback 而不是 `useEffect`/`useLayoutEffect`，
所以沒有地方掛 cleanup。

**附帶澄清（原本懷疑但實測不成立）**
我原先猜 inline arrow 當 ref 會讓 Preact 每次 render 都重掛一次觀察者（時鐘每秒重繪）。
實測**不成立**：連續 10 次時鐘重繪（`cc-sec` 由 45 走到 55）期間
`ResizeObserver created` 一直停在 2、`observe()` 呼叫次數也停在 2。
洩漏只發生在「重新掛載」，不是「重新繪製」。

---

## B（續）已檢查、確認正確

- **每秒重繪不會累積監聽器。** 包住 `addEventListener`/`removeEventListener` 計數，
  掛載當下是 `click +7/-0  submit +2/-0  input +3/-0  pointerdown +12/-0  keydown +7/-0  wheel +1/-0`，
  10 次時鐘重繪之後**數字完全沒變**。`App.tsx:82-96`（Ctrl+K / PageDown）、
  `App.tsx:134-167`（wheel）、`Dial.tsx:114-139`、`Calendar.tsx:419-423`、
  `Focus.tsx:55-59`、`Settings.tsx:69-73` 的 `[]` 相依陣列 + `close.current = onClose`
  這個 ref 手法是對的，監聽器只掛一次。
- **計時器有收。** `setInterval=3 / clearInterval=1`（其中 1 個是探針自己的）。
  `App.tsx:107-110`、`Weather.tsx:35-39`、`WeatherCard.tsx:41-45`、`Radar.tsx:70-74`、
  `MediaCard.tsx:49-53`、`PhotoWall.tsx:70-71`、`Cards.tsx:473-475`、`Focus.tsx:66-67`
  都有對應的 `clearInterval`。
- **blob URL 有 revoke。** `App.tsx:211-215`（換桌布先 revoke 舊的）、
  `PhotoWall.tsx:75-97`（換一張 revoke 一張 + unmount 再收一次）、
  `ImagePicker.tsx:29-41`（refresh 前先 revoke 整批 + unmount cleanup）。
- `Links.tsx:86-88` 與 `Radar.tsx:52-57` 的 ResizeObserver 都正確 disconnect。

---

### A9. 拖曳被 `pointercancel` 中斷時，卡片永遠卡在拖曳狀態，`pointermove` 監聽器留在 document 上

**位置** `src/ui/Cards.tsx:183-191`（換位置）與 `src/ui/Cards.tsx:233-241`（改大小）

```tsx
document.addEventListener("pointermove", onMove);
document.addEventListener("pointerup", () => {
  document.removeEventListener("pointermove", onMove);
  commit();
}, { once: true });
```

收尾只掛在 `pointerup` 上。`pointercancel` 沒有人接 —— 觸控被系統手勢搶走、
指標捕獲被別的元素拿走、拖到瀏覽器 UI 上放開，都會發出 `pointercancel` 而不是 `pointerup`。

**實測**（pointerdown → pointermove → pointercancel，不送 pointerup）

```
listeners after pointercancel: +1 added / 0 removed  => LEAKED = 1
card still stuck in .held state = true
```

後果不只是漏一個監聽器：`held` 與 `live` 都沒清掉，所以**滑鼠沒按著也還在拖** ——
游標之後掃過哪張卡，版面就跟著重排一次，而且因為 `commit()` 從未執行，
一次都不會寫進設定，重新整理就全部彈回去。這就是「拖曳把版面弄壞」的那條路。

正常放開的路徑是乾淨的，實測 `after pointerup: +1 / -1  held class = false`。

---

### A10. 鍵盤換位（Shift+方向鍵）會踩進「關掉的卡」的位置，按第一下沒有任何反應

**位置** `src/ui/Cards.tsx:245-254`

```tsx
const next = e.shiftKey ? nudge(order, tile.id, dx || dy) : resize(...);
```

`order`（`Cards.tsx:134`）是 `normalize(desk, linkIds)` —— **九張卡全部都在裡面**，
不是畫面上那幾張（畫面上的是 `Cards.tsx:135-140` 過濾後的 `tiles`）。
`nudge`（`src/lib/desk.ts:144-153`）只是在這個完整陣列裡挪一格，
挪到的鄰居可能是一張被關掉、根本沒畫出來的卡。

**實測**（把 desk 順序播成 `links, todos, pomodoro(關), note, …`，只開 links/todos/note）

```
visible before     : links,todos,note
handler ran        : true
visible after 1x   : links,todos,note      ← 按了 Shift+← 畫面完全沒動
stored after 1x    : links,todos,note,pomodoro,...   ← 存檔裡跟隱形的 pomodoro 換了位
visible after 2x   : links,note,todos      ← 按第二下才看得到
```

預設設定裡九張有五張是關的（`src/lib/settings.ts:109-120`：pomodoro / photos /
weather / media / clock），所以「按一下沒反應」是常態不是例外，
最壞情況要連按五下才會動一格。

滑鼠拖曳不受影響：`Cards.tsx:166-181` 的 `onMove` 是用
`document.elementFromPoint(...).closest(".card")` 取游標底下**看得見**的那張卡，
再交給 `move()`。所以同一個功能，滑鼠是對的、鍵盤是壞的。

---

## B（續）已檢查、確認正確

- **待辦卡**：新增（表單 submit）→ 清空輸入框 → 勾選加上 `.done` → 刪除 → 顯示空狀態，
  四步都正確。實測 `persisted todos = ["milk"]`，寫入 `tg.workspace` 成功
  （要等 `workspace.ts` 的 debounce，立刻讀會讀到舊值，這是預期行為不是缺陷）。
- **筆記卡**：輸入即存，`textarea value` 與 `tg.workspace.note` 一致（都是 `"hello 天光"`），
  標題列出現 `c_saved`。
- **鍵盤改大小可用**：單獨按、間隔 350ms，`note` 由 `2x1 → 3x1 → 3x2 → 2x2`，
  並正確寫進 `tg.settings.desk`。連結卡的高度被 `desk.ts:101` 鎖成 1，
  所以對它按 ArrowDown 沒反應是**刻意的**，不是缺陷。
- **`.grow` 把手的焦點是看得見的**：`src/styles.css:2295-2300`
  `.card:hover .grow, .grow:focus-visible { opacity: 1 }` 規則存在且實測
  `:focus-visible = true`。（探針量到 `opacity: 0` 是 `--dump-dom` 不推進
  時間軸、transition 沒跑完造成的量測假象，不是產品問題。）
- **正常放開的拖曳**會移除 `pointermove` 並呼叫 `commit()`，不漏監聽器。

---

### A11. `prefers-reduced-motion: reduce` 沒有讓「往下捲」的箭頭停下來 —— 它變成每秒重播一千次的抖動

**位置**
- `src/styles.css:369-376` — 全域只壓時長，沒有動 `animation-name` / `animation-iteration-count`：
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      transition-duration: 1ms !important;
      animation-duration: 1ms !important;
    }
  }
  ```
- `src/styles.css:4626-4646` — `.cue span { animation: nudge 2.4s ease-in-out infinite; }`

無限循環的動畫，把時長壓成 1ms **不會讓它停**，只會讓它每秒跑完一千圈。
螢幕一秒只畫 60 張，每一張抓到的是循環裡的哪一點基本上是隨機的。

**實測**（`--force-prefers-reduced-motion=reduce`，把動畫暫停後逐格 scrub）

```
prefers-reduced-motion:reduce = true
animation nudge: duration=1ms  iterations=Infinity  playState=running

sampling the rendered offset at successive 60Hz frame times:
  t=    0ms  translate=0px -2.4px
  t= 16.7ms  translate=0px -2.4px
  t= 33.3ms  translate=0px 2.20366px
  t=   50ms  translate=0px -2.4px
  t= 66.7ms  translate=0px -2.4px
  t= 83.3ms  translate=0px 2.20366px
  t=  100ms  translate=0px -2.4px
```

相鄰兩格之間跳動 4.6px，而且永遠不會停。要求「減少動態」的使用者拿到的，
比不要求的還吵 —— 原本是 2.4 秒一次的緩和上下，現在是不規則閃跳。

**同一份樣式表裡已經有正確做法可以對照**：`src/styles.css:802-815` 對盤面所有元素
寫的是 `animation: none`，不是壓時長。作者顯然知道壓時長不夠，`.cue` 是漏掉的那一個。

`getAnimations()` 掃過全頁，reduce 之下唯一還是 `iterations=Infinity` 的就是它
（其餘 `tile-in` 都是 `iterations=1`，1ms 播完就結束，沒有問題）。

---

## B（續）已檢查、確認正確

- **沒有水平溢位**。504px（Edge headless 的視窗寬度下限，見下）與 2530px 兩端量到
  `doc scrollWidth === clientWidth`，「超出右緣的元素」總數為 **0**。
  即使塞 16 個連結、超長連結標題、以及三倍長的自訂語錄也一樣。
- **窄視窗會正確收成單欄**：504px 下卡片全部變成 `447x192` 的一欄直排；
  2530px 下回到兩欄（`664x192`，calendar 佔 `324x192`）。
  連結磚塊由 ResizeObserver 量出來的欄數在兩端都合理（16 個 → `cols=6 rows=3`）。
- **長連結標題是刻意裁掉的**：`span.cap` 的 `scrollWidth` 285 vs `clientWidth` 44–58，
  容器 `overflow` 非 visible。磚塊尺寸固定、標題截斷是設計，不是破版
  （完整標題在 `<a title>` 裡，`src/ui/Links.tsx:182`）。
- **一次性動畫在 reduce 之下確實近乎瞬間完成**：`tile-in`、`full-in`、`slide-in`、
  `pal-in`、`.screen` 的過場全部 `duration=1ms, iterations=1`。只有無限循環那一個有問題。

**量測限制（誠實聲明）**：headless Edge 不接受小於約 504px 的視窗寬度
（`--window-size=320,900` 實際得到 504、加 `--force-device-scale-factor=2` 得到 630），
所以**沒有真的在 320px 下驗證過**。上面的結論成立於 504px。
考量 Edge 視窗本身也開不到 320px 寬，504px 大致就是這個產品的真實下限。

---

## D. 測試的誠實度

**併發作業注意**：稽核期間有其他 agent 同時在改這個 repo
（`src/lib/*`、`src/ui/Margins.tsx`、`vite.config.ts`、`public/_locales/*`，
以及新增的 `test/i18n-keys.test.ts`），`dist/` 也被重建過一次。
我全程沒有動 `src/`、`test/` 或設定檔，只寫這份 `AUDIT-ui.md` 並在 `dist/` 放過探針
（已還原、探針已刪除）。

### D0. 測試數量與紅綠狀態（含期間變動，據實記錄）

稽核中途量到一次紅燈：`Tests 2 failed | 243 passed (245)`，
來自另一個 agent 當時剛加進來的 `test/i18n-keys.test.ts`。兩個失敗分別是：

1. 「程式裡每一個寫死的 t() 鍵都在預設語系裡」報 6 個缺鍵
   （`sx_name_` / `sx_stars_` / `sx_dir_` / `sx_season_`）。
   **那是誤報** —— `src/ui/FourSymbols.tsx:97-98` 是動態組鍵（`t("sx_name_" + i)`），
   抽取器只吃到字面前綴。實際的 `sx_name_0` 等鍵在 `public/_locales/zh_TW/messages.json` 裡都在。
2. 「沒有孤兒鍵」報 `ja` 多了 `c_pomo_work` / `c_pomo_rest`。**那個是真的**，
   而且 `zh_CN` 也有同樣兩個（測試在第一個失敗就停，只報了 `ja`）。

**收尾時重跑已經是 `Tests 245 passed (245)` 全綠** —— 那位 agent 已經把兩邊都修掉
（`git diff` 顯示 `public/_locales/ja` 與 `zh_CN` 各刪了 6 行，正是那兩個死鍵）。
所以這兩個失敗不是 `src/ui/` 的問題，記在這裡只是說明我量到的數字為什麼一度不是 242。

以下 D1–D6 講的才是重點：**綠燈的那 245 個裡，哪些是綠得不算數的。**

### D1. jsdom 的能力邊界（實測，不是推論）

```
ResizeObserver              : undefined
matchMedia                  : undefined
document.elementFromPoint   : undefined（呼叫直接 TypeError）
getBoundingClientRect()     : 全部 0
```

由此可以逐條指出「測試根本沒跑到」的程式碼：

| 生產程式碼 | 守衛 | jsdom 下的結果 |
|---|---|---|
| `src/ui/Links.tsx:68-89` 欄數計算 | `typeof ResizeObserver !== "function"` → return | **整段從未執行** |
| `src/ui/WeatherCard.tsx:51` 雷達門檻 | `typeof ResizeObserver === "undefined"` → return | 從未執行（A8 的洩漏也就測不到） |
| `src/ui/Radar.tsx:51` 圖磚數量 | 同上 | 從未執行 |
| `src/ui/Dial.tsx:127-133` Esc 的「關動畫就直接卸載」分支 | `typeof matchMedia === "function"` 為 false | **永遠走 260ms 動畫那條**，reduce 分支零覆蓋 |
| `src/ui/App.tsx:43-49` `canScroll()` | `scrollHeight - clientHeight` = 0，`max <= 1` → false | 永遠回 false，`scrollableUnder()` 永遠 null |
| `src/ui/Cards.tsx:150-242` 拖曳換位置／改大小 | 需要 `elementFromPoint` | 無法測，**也確實沒測** |

### D2. 「排法由卡片寬度決定，欄數掛在 data-w 上」（`test/render.test.tsx:676`）—— 標題說的事一件都沒驗

斷言只有三條：`card.dataset.w === "3"`、`card.dataset.h === "1"`、`.slot` 有 16 個。
真正決定「排法」的是 `Links.tsx:68-89`（量 `clientWidth` → 算 `--cols` / `data-rows`），
而那段在 jsdom 裡因為沒有 `ResizeObserver` 直接 return，`--cols` 與 `data-rows`
從頭到尾是空的，測試也從沒斷言過它們。

**把 `Links.tsx` 的整個欄數演算法刪掉，這個測試照樣綠燈。**

### D3. 「卡片可以改大小換位置，鍵盤也走得通」（`test/render.test.tsx:587`）—— 靠預設順序的巧合而過

最後一段驗 Shift+→ 把 `todos` 換到 `note` 後面：

```js
key("ArrowRight", true);
await vi.waitFor(() => expect(order(), "Shift 是換位置").toEqual(
  ["links", "note", "todos", "calendar"]));
```

`DEFAULT_DESK`（`src/lib/desk.ts`）是
`links, todos, note, pomodoro, photos, calendar, weather, media, clock`，
預設開著的是 `links(0), todos(1), note(2), calendar(5)`。
測試挑的 `todos` 在索引 1，往後一格是索引 2 的 `note` —— 剛好也是看得見的那張，
所以畫面順序真的變了。

**換一張卡就會爆**：`note`（索引 2）往後一格是關著的 `pomodoro`（索引 3）；
`calendar`（索引 5）往前一格是關著的 `photos`（索引 4）。兩者都是畫面完全不動 ——
就是 A10 那個缺陷。這個測試選中了九張裡唯一測不出問題的那一步。

### D4. 「番茄鐘那一屏是純色，透不出後面」（`test/render.test.tsx:1429`）—— 正好蓋在 A1 上卻抓不到

```js
expect(document.querySelector(".full")!.classList.contains("solid")).toBe(true);
expect(cssVar("--solid")).toMatch(/^#|rgb/);
```

只驗「有 solid 這個 class」和「`--solid` 長得像顏色」。至於那個顏色跟壓在上面的
`--fg` 對不對得起來，一個字都沒問。而且 `mount(new Date(2026, 7, 30, 11, 0, 0))`
挑的是 11:00 —— A1 的壞掉區間是 14:30–16:30。

**A1 存在的情況下這個測試 100% 綠燈。**

### D5. 亮暗翻轉只在兩個最好過的時刻取樣

`test/render.test.tsx:67` 驗 12:00 是 `#1B2230`，`:72` 驗 00:30 是 `#F4F2EE`。
正午與午夜是離門檻最遠的兩點。整個 `foreground()` 的門檻邏輯
（`src/lib/mesh.ts:151` 的 `> 0.4`）在交界時段沒有任何一個取樣點，
所以 A1 這種「差 0.018 就翻錯邊」的問題結構上不可能被這組測試發現。

### D6. 誠實的那一個，值得記一筆

`test/render.test.tsx:645`「列高跟著卡片走」自己在註解裡寫明
「幾何量不到（jsdom 沒有版面），只能驗來源」，然後改去 `readFileSync("src/styles.css")`
比對三段宣告。它沒有假裝在驗版面。做法脆（跟選擇器字串綁死），
但**沒有說謊**，而且確實釘住了那兩個必須一起存在的宣告。

---

## C. 改進建議（不是缺陷）

1. `src/ui/Cards.tsx:245-254` 的 `.grow` 把手一顆鈕管兩件事（方向鍵改大小、
   Shift+方向鍵換位置），但 `aria-label` 只有 `c_resize`，沒有任何地方講得出這件事。
   加一個 `aria-describedby` 指向一句說明，鍵盤使用者才知道有這條路。
2. `src/ui/Palette.tsx:510-528` 的 `role="listbox"` 中間隔了一層 `<li>`，
   `role="option"` 不是 listbox 的直接子代，ARIA 上關係是斷的；輸入框也沒有
   `role="combobox"` / `aria-controls` / `aria-activedescendant`，
   所以游標在結果之間移動時讀屏不會報出目前選到哪一筆。
   改成 `<ul role="listbox">` 直接放 `<li role="option">`（按鈕拿掉）比較省事。
3. `src/lib/mesh.ts:151` 的門檻式亮暗判斷，建議改成「由 `--solid` / 實際底色
   反推前景」，而不是用三個色停的平均去猜 —— 這樣 A1 這一族的問題不會再長出來。
4. 時辰盤（`src/ui/Dial.tsx`）可以考慮加一顆視覺上很淡的關閉鈕。
   現在的 `aria-keyshortcuts="Escape"` 只有讀屏使用者拿得到，用鍵盤但不用讀屏的人
   看不到任何提示。

---

## A1 補充：15:30 的實際畫面（像素取樣，非計算）

截圖 `panel-h15.png`（1400x900，`?h=15`，開著設定抽屜）目視結果：

- 主時鐘「15:30」是灰字壓在灰藍底上，幾乎讀不出來
- 問候語 `greet_dusk_anon`、日期列 `Wednesday 2 September · moon_8` 近乎消失
- 搜尋列的 placeholder 被洗掉
- 抽屜裡所有 `.note` 小字（`s_engine_hint` / `s_holidays_hint` / `s_weather_perm`）非常淡
- **畫面上半是深藍灰、下半是淺暖褐**（`c[5] = #e3c19f`）—— 底部的「往下」箭頭
  幾乎看不見。單一個 `--fg` 本來就不可能同時對上這兩端。

設定抽屜的像素取樣（`.panel` 區域，PIL 直接讀截圖）：

```
h=15  surface(最常見色) = (112,110,116)  L=0.159
      最亮 0.5%         = (244,242,238)  對比 4.50   ← 主要文字剛好卡在門檻上
      掃描線 y=200      bg (105,111,127)  text (87,94,112)  對比 1.29   ← --fg-2 的小字
      掃描線 y=400      bg (108,107,115)  text (59,59,59)   對比 2.13

h=12  surface           = (183,186,188)  L=0.488
      最暗 0.5%         = (27,34,48)     對比 8.17   ← 正常
      掃描線 y=200      對比 11.04
```

（掃描線取的是含反鋸齒邊緣的像素，會低估字心對比；但「最亮 0.5% 對表面 = 4.50」
是主要文字的上界 —— 也就是**最好的情況剛好等於小字門檻**，其餘更差。）

設定抽屜是 `--glass`（`rgba(255,255,255,.10)`）疊在 `.sheet` 的
`rgba(0,0,0,.4)` 遮罩上（`src/styles.css:1379`、`1392`），再疊在偏亮的漸層上，
合成出來就是那塊中灰。它跟 `.full.solid` 是同一個病灶的兩個出口：
**表面色由一條路算、前景色由另一條路算，兩條在下午對不上。**
