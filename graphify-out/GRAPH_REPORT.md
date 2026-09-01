# Graph Report - tianguang  (2026-09-01)

## Corpus Check
- Corpus is ~22,676 words - fits in a single context window. You may not need a graph.

## Summary
- 368 nodes · 762 edges · 13 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Background Colour Engine
- Links, Weather and Settings Storage
- Localisation, Quotes and Numerals
- Build Config and Boot Paint
- Workspace State and Pomodoro
- Command Palette and Search
- TypeScript Project Config
- Extension Manifest and Permissions
- Solar Time: Shichen and Jieqi
- Desk Layout Editor
- Wallpaper Image Store
- Icon Generator

## God Nodes (most connected - your core abstractions)
1. `t()` - 33 edges
2. `App()` - 21 edges
3. `compilerOptions` - 17 edges
4. `Dial()` - 15 edges
5. `Palette()` - 13 edges
6. `isEnglish()` - 12 edges
7. `paletteAt()` - 11 edges
8. `PomodoroCard()` - 10 edges
9. `fetchWeather()` - 9 edges
10. `WeatherSettings()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `mount()` --indirect_call--> `host()`  [INFERRED]
  test/render.test.tsx → src/lib/palette.ts
- `NoteCard()` --calls--> `t()`  [EXTRACTED]
  src/ui/Cards.tsx → src/lib/i18n.ts
- `首屏底色打包時算出、inline script 先塗` --runs_before--> `#app 掛載點與 /src/main.tsx 進入點`  [EXTRACTED]
  README.md → index.html
- `Settings` --references--> `Tile`  [EXTRACTED]
  src/lib/settings.ts → src/lib/desk.ts
- `App()` --calls--> `t()`  [EXTRACTED]
  src/ui/App.tsx → src/lib/i18n.ts

## Import Cycles
- None detected.

## Communities (13 total, 0 thin omitted)

### Community 0 - "Background Colour Engine"
Cohesion: 0.07
Nodes (45): sync 失敗降級寫 local 並提示, out, 設定整份存成一項, 調色盤只有一個真相來源, Anchor, ANCHORS, bootColorTable(), colorsAt() (+37 more)

### Community 1 - "Links, Weather and Settings Storage"
Cohesion: 0.10
Nodes (42): locale(), faviconUrl(), hostOf(), initial(), Link, makeLink(), MAX_LINKS, normalizeUrl() (+34 more)

### Community 2 - "Localisation, Quotes and Numerals"
Cohesion: 0.10
Nodes (36): 開發模式 i18n 依 navigator.language 退回本機檔案, Bundle, devBundle(), isEnglish(), outerRingName(), shichenAlt(), shichenName(), t() (+28 more)

### Community 3 - "Build Config and Boot Paint"
Cohesion: 0.06
Nodes (32): #app 掛載點與 /src/main.tsx 進入點, 首屏底色打包時算出、inline script 先塗, jsdom, dependencies, preact, @preact/signals, description, devDependencies (+24 more)

### Community 4 - "Workspace State and Pomodoro"
Cohesion: 0.14
Nodes (29): CardId, Tile, advance(), EMPTY, formatLeft(), isRunning(), load(), makeTodo() (+21 more)

### Community 5 - "Command Palette and Search"
Cohesion: 0.14
Nodes (22): activate(), bookmarks(), downloads(), history(), host(), Item, openTabs(), rank() (+14 more)

### Community 6 - "TypeScript Project Config"
Cohesion: 0.07
Nodes (28): chrome, DOM, DOM.Iterable, ES2022, node, scripts, src, test (+20 more)

### Community 7 - "Extension Manifest and Permissions"
Cohesion: 0.07
Nodes (26): chrome_url_overrides, newtab, default_locale, description, icons, 128, 16, 32 (+18 more)

### Community 8 - "Solar Time: Shichen and Jieqi"
Cohesion: 0.12
Nodes (18): 同套件雙品牌，依語系顯示, Edge 新分頁擴充功能, 二十四節氣, 十二光相 (Small Hours / Zenith / Golden Hour), 載入解壓縮到 Edge 的步驟, Meeus 低精度太陽視黃經公式（第 25 章）, 權限只宣告當下用得到的, 傳統滿月名 (+10 more)

### Community 9 - "Desk Layout Editor"
Cohesion: 0.21
Nodes (17): clamp(), clampH(), clampW(), COLS, DEFAULT_DESK, IDS, MAX_H, move() (+9 more)

### Community 10 - "Wallpaper Image Store"
Cohesion: 0.29
Nodes (11): addImage(), deleteImage(), getImage(), listImages(), process(), StoredImage, toUrl(), tx() (+3 more)

### Community 11 - "Icon Generator"
Cohesion: 0.21
Nodes (10): BG_BOT, BG_TOP, chunk(), CRC, crc32(), GOLD, OUT, png() (+2 more)

## Knowledge Gaps
- **110 isolated node(s):** `name`, `private`, `version`, `type`, `description` (+105 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `首屏底色打包時算出、inline script 先塗` connect `Build Config and Boot Paint` to `Background Colour Engine`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Why does `t()` connect `Localisation, Quotes and Numerals` to `Background Colour Engine`, `Links, Weather and Settings Storage`, `Workspace State and Pomodoro`, `Command Palette and Search`, `Desk Layout Editor`, `Wallpaper Image Store`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _110 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Background Colour Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.06638714185883997 - nodes in this community are weakly interconnected._
- **Should `Links, Weather and Settings Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.09528214616096208 - nodes in this community are weakly interconnected._
- **Should `Localisation, Quotes and Numerals` be split into smaller, more focused modules?**
  _Cohesion score 0.10404040404040404 - nodes in this community are weakly interconnected._
- **Should `Build Config and Boot Paint` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._