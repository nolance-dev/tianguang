import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  meshCss,
  colorsAt,
  paletteAt,
  paletteForColor,
  paletteForImage,
} from "../lib/mesh";
import { getImage, toUrl } from "../lib/images";
import { decimalHour, dayFraction, greetSlot, indexAt } from "../lib/shichen";
import { jieqiIndex, moonIndex } from "../lib/solar";
import {
  intlLocale,
  isEnglish,
  locale,
  outerRingName,
  setLang,
  shichenAlt,
  shichenName,
  t,
} from "../lib/i18n";
import { resolve } from "../lib/search";
import { DEFAULTS, load, save, type Settings } from "../lib/settings";
import { Ring } from "./Ring";
import { Dial } from "./Dial";
import { wheelPixels } from "../lib/wheel";
import { SettingsPanel } from "./Settings";
import { Weather } from "./Weather";
import { Cards } from "./Cards";
import { COLS, type CardId, type Tile } from "../lib/desk";
import { CalendarDetail } from "./Calendar";
import {
  around,
  byDate,
  hasHolidayAccess,
  loadHolidays,
  supported,
} from "../lib/holidays";
import { Focus } from "./Focus";
import { Palette } from "./Palette";
import { Guide } from "./Guide";
import { nextQuote } from "../lib/quotes";
import * as ws from "../lib/workspace";

/** 秒針之外的東西一秒更新一次就夠。時辰環一分鐘才動 0.25 度，看不出來。 */
const TICK_MS = 1000;

/*
 * 換頁。
 *
 * 兩屏不是一份長文件捲上捲下，是疊起來的兩張牌：第二屏整張從底下插到前面，
 * 第一屏往後退半步。捲動做不出「插到前面」，只能做「同一張紙滑過去」，
 * 所以這裡自己收滾輪，不用瀏覽器的捲動。
 *
 * 一格滾輪不換頁。一格是「我在看」，兩格才是「我要走了」——
 * 只認一格的話，手擦過滾輪就翻頁。
 */
const NOTCH = 100; // 一格滾輪大約一百像素
const NEED = 2;
const RESET_MS = 240; // 手停這麼久就重新算，慢慢刷不該一路累積成換頁
const COOLDOWN_MS = 700; // 換頁後的冷卻，蓋掉觸控板的慣性尾巴

/** 這個元素自己還捲得動嗎。內容比框高還不夠 —— 得真的是個捲動容器才算。 */
function canScroll(el: HTMLElement | null, dy: number): boolean {
  if (!el) return false;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  const oy = getComputedStyle(el).overflowY;
  if (oy !== "auto" && oy !== "scroll") return false;
  return dy > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1;
}

/**
 * 從游標底下往上找第一個還捲得動的祖先。
 *
 * 本來只問「這一屏捲得動嗎」。屏本身通常剛好放得下，於是回答永遠是不行，
 * 滾輪就被換頁吃掉了 —— 卡片裡面那些會捲的東西（照片牆的縮圖、待辦清單、
 * 日曆的行程）全部捲不動，第三張之後的照片根本拿不到。
 */
function scrollableUnder(
  from: EventTarget | null,
  dy: number,
): HTMLElement | null {
  let el: HTMLElement | null =
    from instanceof Element ? (from as HTMLElement) : null;
  while (el) {
    if (canScroll(el, dy)) return el;
    el = el.parentElement;
  }
  return null;
}

export function App() {
  const now = useSignal(new Date());
  const settings = useSignal<Settings>(DEFAULTS);
  const notice = useSignal<string | null>(null);
  const dialOpen = useSignal(false);
  const panelOpen = useSignal(false);
  const palOpen = useSignal(false);
  /** 展開成整屏的那張卡。null 是沒有展開 */
  const sheet = useSignal<string | null>(null);
  /** 當地節日，日期 → 名字。抓不到就是空的，月曆照常畫 */
  const holidays = useSignal<Map<string, string[]>>(new Map());
  const page = useSignal(0);

  // Ctrl K（Mac 是 Cmd K）。搜尋列裡也吃，因為那裡才是手停的地方。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palOpen.value = true;
      } else if (e.key === "PageDown" || e.key === "PageUp") {
        // 瀏覽器的捲動被關掉了，換頁的鍵盤路徑得自己補，
        // 否則只用鍵盤的人到不了工作區。
        e.preventDefault();
        page.value = e.key === "PageDown" ? 1 : 0;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /*
   * 每秒讀一次真實時間。
   *
   * 試過改成對齊整秒的 setTimeout 遞迴 —— setInterval(1000) 從掛載那一刻起算，
   * 如果那一刻是 .437 秒，之後每次跳秒都在 .437。但顯示出來的時間永遠是對的
   * （每次都重讀 new Date()），差的只是「什麼時候換那個數字」。
   * 而要在測試裡假掉 setTimeout 才驗得了它，那會連 Preact 排 effect 的路徑
   * 一起假掉，四個測試當場掛掉。為了一個看不出錯的次秒偏移弄壞測試基礎，不划算。
   */
  useEffect(() => {
    const id = setInterval(() => (now.value = new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  /*
   * 當地節日。
   *
   * 只在有權限、有支援的國碼、而且使用者要顯示時才抓。抓不到不擋任何事 ——
   * 月曆本來就畫得出來，節日是加分不是前提。
   */
  useSignalEffect(() => {
    const s = settings.value;
    if (!s.holidaysOn || !supported(s.countryCode)) {
      holidays.value = new Map();
      return;
    }
    const lang = isEnglish() ? "en" : "zh-tw";
    void hasHolidayAccess().then((ok) => {
      if (!ok) return;
      void loadHolidays(s.countryCode, lang).then((list) => {
        holidays.value = byDate(around(list));
      });
    });
  });

  // 滾輪。彈窗開著時完全不收，那時滾輪屬於彈窗。
  useEffect(() => {
    let acc = 0;
    let last = 0;
    let until = 0;

    const onWheel = (e: WheelEvent) => {
      // sheet 是月曆／番茄鐘那些整屏畫面。少了它，蓋著一層的時候滾輪還在翻
      // 底下那一屏 —— 蓋子後面的東西自己在動，比沒有蓋子還怪
      if (dialOpen.peek() || palOpen.peek() || panelOpen.peek() || sheet.peek())
        return;
      const dy = wheelPixels(e);
      if (!dy) return;

      const at = Date.now();
      if (at < until) return;
      if (at - last > RESET_MS || Math.sign(dy) !== Math.sign(acc)) acc = 0;
      last = at;

      if (scrollableUnder(e.target, dy)) return;

      e.preventDefault();
      acc += dy;
      if (Math.abs(acc) < NOTCH * NEED - 20) return;

      const next = page.peek() + (acc > 0 ? 1 : -1);
      acc = 0;
      if (next < 0 || next > 1) return;
      page.value = next;
      until = at + COOLDOWN_MS;
    };

    // passive: false 才擋得掉預設捲動
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    // 載入是非同步的。使用者在它回來之前就可能已經動過設定（開頁馬上打字），
    // 這時用磁碟上的舊值蓋掉會讓輸入憑空消失 —— 只在還沒被動過時才套用。
    void load().then((s) => {
      if (settings.peek() === DEFAULTS) settings.value = s;
    });
  }, []);

  // 工作區與設定分開存：待辦和筆記會長大，塞不進 storage.sync 的 8KB
  const work = useSignal<ws.Workspace>(ws.EMPTY);
  useEffect(() => {
    void ws.load().then((w) => {
      if (work.peek() === ws.EMPTY) work.value = w;
    });
  }, []);

  function patchWork(p: Partial<ws.Workspace>) {
    const next = { ...work.value, ...p };
    work.value = next;
    ws.save(next);
  }

  function patch(p: Partial<Settings>) {
    const next = { ...settings.value, ...p };
    settings.value = next;
    save(next, (result) => {
      notice.value =
        result === "local-fallback" ? t("save_local_fallback") : null;
    });
  }

  // 自訂桌布。blob 網址換一次就要 revoke 一次，否則舊圖會一直留在記憶體裡。
  const bgImage = useSignal<{ url: string; luminance: number } | null>(null);
  // effect 會訂閱整個 settings，所以拖任何一根滑桿都會重跑。沒有這道閘的話
  // 每動一格就重讀一次圖、產生新的 blob URL、撤銷舊的 —— 瀏覽器得重新解碼
  // 整張圖，畫面就閃一下。只有真的換圖時才需要重讀。
  const loadedKey = useRef<string | null>(null);
  useSignalEffect(() => {
    const s = settings.value;
    const key = s.background === "image" ? s.imageId : null;
    if (key === loadedKey.current) return;
    loadedKey.current = key;

    const old = bgImage.peek();
    if (old) {
      URL.revokeObjectURL(old.url);
      bgImage.value = null;
    }
    if (!key) return;

    void getImage(key).then((img) => {
      // 讀取期間若又換了一張，這次的結果就作廢，不要蓋掉比較新的
      if (loadedKey.current !== key) return;
      if (!img) return;
      bgImage.value = { url: toUrl(img), luminance: img.luminance };
    });
  });

  const palette = useComputed(() => {
    const s = settings.value;
    if (s.background === "solid") return paletteForColor(s.solidColor);
    const img = bgImage.value;
    if (s.background === "image" && img)
      return paletteForImage(img.url, img.luminance, s.dim);
    // 還沒選圖、或圖讀不到，就退回時辰漸層，不要留一片空白
    return paletteAt(decimalHour(now.value));
  });
  const scIndex = useComputed(() => indexAt(now.value));

  // 顏色全部從這裡下到 :root，元件自己不判斷白天晚上
  useSignalEffect(() => {
    const s = settings.value;
    const p = palette.value;
    const r = document.documentElement;
    setLang(s.lang);
    // CSS 靠 :root[lang^="en"] 分中英文的字體與字距，跟著換
    r.lang = locale();
    /*
     * 分頁上的名字跟著語言走。
     *
     * 名字只有一個來源：manifest 用 __MSG_extensionName__，這裡也用同一個鍵，
     * 兩邊不會各改各的。開發預覽沒有 chrome.i18n，t() 會把鍵名原樣吐回來 ——
     * 那時候留著 index.html 寫死的那個，不要讓分頁標題變成 extensionName。
     */
    const name = t("extensionName");
    // 名字還是只有一個來源，Home Page 是接在後面的固定字尾 ——
    // 兩種語言都用英文，它是名字的一部分，不是要翻譯的介面文字。
    // manifest 那邊維持乾淨的「天光／Aubade」，商店和擴充功能清單不帶字尾。
    if (name && name !== "extensionName") document.title = `${name} Home Page`;
    r.style.setProperty("--mesh", p.css);
    r.style.setProperty("--fg", p.fg);
    r.style.setProperty("--fg-2", p.fg2);
    r.style.setProperty("--glass", p.glass);
    r.style.setProperty("--glass-line", p.glassLine);
    // 搜尋列不吃 backdrop-filter，需要一個自己站得住的半透明底
    r.style.setProperty(
      "--glass-solid",
      p.light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.11)",
    );
    // 卡片與黏住的搜尋列都得自己站得住：底下有東西在動，不能只是一層半透明。
    // 暗底用比背景更暗的底做深度，亮底用白 —— 反過來會把字吃掉。
    r.style.setProperty(
      "--card",
      p.light ? "rgba(255,255,255,.70)" : "rgba(13,17,27,.50)",
    );
    r.style.setProperty(
      "--veil",
      p.light ? "rgba(250,249,246,.90)" : "rgba(8,11,18,.86)",
    );
    /*
     * 這個主題的純色。番茄鐘那一屏用它當底 —— 不透明，所以後面什麼都不透出來。
     * 純色背景就用使用者選的那一色，其餘（時辰漸層、自訂圖）用這個時刻的
     * 代表色，也就是首屏那個 inline script 先塗的同一色。
     */
    const solid = s.background === "solid" ? s.solidColor : p.boot;
    r.style.setProperty("--solid", solid);
    /*
     * 純色那一屏自己算一套字色，不吃 :root 的 --fg。
     *
     * --fg 是照漸層三層的平均亮度挑的，而這一屏塗的是單一個 --solid ——
     * 兩者不是同一個亮度。實測差距最大時對比只剩 4.28（AA 要 4.5），
     * 而下午那幾點更糟。時辰盤早就自己帶一套了（styles.css 的 .dial），
     * 這一屏是它漏掉的兄弟。
     */
    const sp = paletteForColor(solid);
    r.style.setProperty("--solid-fg", sp.fg);
    r.style.setProperty("--solid-fg-2", sp.fg2);
    // 壓在 --fg 那個色塊上的字。它是 --fg 的反面，不是背景色 ——
    // 用半透明的 --card 當字色會糊成灰的。
    r.style.setProperty("--fg-ink", p.light ? "#F7F5F1" : "#12161F");
    // 節日與星期天的紅。亮底要深一點才咬得住，暗底要淺一點才不會糊成褐色
    r.style.setProperty("--holi", p.light ? "#B3382F" : "#E8776C");
    /*
     * 顆粒與變暗只對自訂圖有意義。
     *
     * 時辰漸層和純色是設計好的顏色 —— 蓋一層黑會把整片壓成灰、蓋一層噪點會把
     * 彩度洗掉，那不是「調整」，是把原本的東西弄壞。照片才需要壓一層底讓字站得住。
     * 值照樣留著，換回圖片時原封不動。
     */
    const onImage = s.background === "image";
    r.style.setProperty("--grain", String(onImage ? s.grain : 0));
    r.style.setProperty("--dim", String(onImage ? s.dim : 0));
    // 模糊只對自訂圖有意義，而且只有真的要模糊時才掛濾鏡 ——
    // filter 有值就會讓背景層自成合成層，顆粒層混不到它，漸層會被洗成灰的。
    const blur = s.background === "image" ? s.blur : 0;
    r.style.setProperty("--bg-filter", blur > 0 ? `blur(${blur}px)` : "none");

    // 自訂圖上仍依時辰疊一層明暗與色溫 —— 換了桌布，時間感不必跟著消失
    const tinted = s.background === "image" && s.shichenTint && bgImage.value;
    r.style.setProperty(
      "--tint",
      tinted ? meshCss(colorsAt(decimalHour(now.value))) : "none",
    );
    r.style.setProperty("--tint-opacity", tinted ? "0.34" : "0");
    r.dataset.sc = String(scIndex.value);
  });

  const cfg = settings.value;

  const topBar = (
    <header class="top">
      <button
        class="badge"
        type="button"
        aria-label={t("dial_open")}
        onClick={() => (dialOpen.value = true)}
      >
        <Ring
          index={scIndex.value}
          fraction={dayFraction(now.value)}
          size={48}
        />
        <span class="t">
          <b>
            {shichenName(scIndex.value)}
            {t("sc_suffix")}
          </b>
          <span>{shichenAlt(scIndex.value)}</span>
        </span>
      </button>

      {cfg.weatherOn && (
        <Weather
          lat={cfg.lat}
          lon={cfg.lon}
          place={cfg.placeName || t("s_city")}
          unit={cfg.unit}
          cwaKey={cfg.cwaKey}
        />
      )}
    </header>
  );

  const hero = (
    <>
      <Greeting now={now.value} name={cfg.name} />
      <Clock
        now={now.value}
        settings={cfg}
        onOpen={() => (dialOpen.value = true)}
      />
      <DateLine now={now.value} />
    </>
  );
  const search = <SearchBar engineId={cfg.searchEngine} />;
  const quote = cfg.cards.quote ? (
    <QuoteLine text={cfg.quoteText} by={cfg.quoteBy} />
  ) : null;
  /*
   * 兩屏共用同一個 Cards。差別只有三件事：顯示哪幾張、吃哪一份版面、寫回哪裡。
   * 抽成函式而不是複製一份，是為了讓「主頁面那一排的大小和編輯跟工作區一樣」
   * 這件事在程式裡是同一段程式碼，不是兩段長得像的程式碼。
   */
  const cardsFor = (
    show: Record<CardId, boolean>,
    desk: Tile[],
    onDesk: (desk: Tile[]) => void,
    lockHeight = false,
    maxCols?: number,
    // 主頁面與工作區各有一份照片牆，改一邊不會動到另一邊
    key: "photoWalls" | "homePhotoWalls" = "photoWalls",
  ) => {
    const walls = cfg[key];
    return (
    <Cards
      lockHeight={lockHeight}
      maxCols={maxCols}
      value={work.value}
      onChange={patchWork}
      show={show}
      desk={desk}
      onDesk={onDesk}
      links={cfg.links}
      onLinks={(l) => patch({ links: l })}
      linkCards={cfg.linkCards}
      now={now.value}
      settings={cfg}
      onExpand={(id) => {
        // 時鐘沒有自己的整屏畫面，它展開的是時辰盤 —— 那本來就是它的大版本
        if (id === "clock") dialOpen.value = true;
        else sheet.value = id;
      }}
      calendar={{
        secondCal: cfg.secondCal,
        todayHoliday: holidays.value.get(ws.today())?.[0] ?? null,
      }}
      weather={{
        lat: cfg.lat,
        lon: cfg.lon,
        place: cfg.placeName || t("s_city"),
        unit: cfg.unit,
        cwaKey: cfg.cwaKey,
        dark: !palette.value.light,
      }}
      photoWalls={walls}
      onPhotoWall={(index, p) =>
        patch({
          [key]: walls.map((w, i) => (i === index ? { ...w, ...p } : w)),
        })
      }
      />
    );
  };

  const cards = cardsFor(cfg.cards, cfg.desk, (desk) => patch({ desk }));

  // 主頁面那一排只認這兩張，其餘一律關掉
  const homeOn = cfg.home.links || cfg.home.photos;
  const homeCards = homeOn
    ? cardsFor(
        {
          todos: false,
          note: false,
          pomodoro: false,
          calendar: false,
          weather: false,
          media: false,
          clock: false,
          links: cfg.home.links,
          photos: cfg.home.photos,
        },
        cfg.homeDesk,
        (homeDesk) => patch({ homeDesk }),
        // 主頁面只准左右拉：往下長會把時鐘擠出第一屏
        true,
        // 而且只有一列。塞不下的卡不畫，版面本身留著
        COLS,
        "homePhotoWalls",
      )
    : null;
  const notices = (
    <footer class="bottom">
      {notice.value && <p class="notice">{notice.value}</p>}
    </footer>
  );

  return (
    <>
      <div class="mesh" />
      <div class="tint" />
      <div class="dim" />
      <div class="grain" />

      <div class="app" data-page={page.value}>
        {/* 收起來的那一屏設 inert：看不到的東西不該還能 Tab 進去 */}
        <section
          class={`screen${page.value === 0 ? " on" : ""}`}
          inert={page.value !== 0}
        >
          {topBar}

          <main class="core">
            {hero}
            {search}
            {homeCards}
          </main>

          {/* 往下還有一屏。不給提示的話沒人知道要捲。 */}
          <button
            class="cue"
            type="button"
            aria-label={t("scroll_down")}
            onClick={() => (page.value = 1)}
          >
            <span />
          </button>
        </section>

        {/* 第二屏：工作區。語錄在最上面，底下是各個功能卡。 */}
        <section
          class={`screen desk${page.value === 1 ? " on" : ""}`}
          id="desk"
          inert={page.value !== 1}
        >
          {quote}
          {cards}
          {notices}
        </section>
      </div>

      {/* 釘在右下角。放在版面流裡的話會被中間那一列推著跑，位置飄忽不定。 */}
      <button
        class="icon-btn gear"
        type="button"
        aria-label={t("settings_open")}
        onClick={() => (panelOpen.value = true)}
      >
        ⚙
      </button>

      {sheet.value === "calendar" && (
        <CalendarDetail
          events={work.value.events}
          onChange={(events) => patchWork({ events })}
          now={now.value}
          secondCal={cfg.secondCal}
          holidays={holidays.value}
          onClose={() => (sheet.value = null)}
        />
      )}

      {sheet.value === "pomodoro" && (
        <Focus
          work={work.value}
          onChange={patchWork}
          onClose={() => (sheet.value = null)}
        />
      )}

      {dialOpen.value && (
        <Dial
          now={now.value}
          lat={settings.value.lat}
          lon={settings.value.lon}
          onClose={() => (dialOpen.value = false)}
        />
      )}

      {/*
       * 首次引導。
       *
       * 兩個條件。第一個是「設定真的載回來了」—— settings 在載完之前握的是
       * DEFAULTS 本尊（見上面那個 peek() === DEFAULTS 的哨兵），而 DEFAULTS
       * 的 guided 是 false，少了這個判斷，老使用者每次開分頁都會先被引導閃一下。
       * 真的第一次跑的時候 load() 回的是 DEFAULTS 的複本，不是本尊，所以照樣進得來。
       *
       * 第二個是那個旗標本身。它存在設定裡而不是 localStorage，
       * 所以「看過了」跟著帳號走，不是跟著這一台機器。
       */}
      {settings.value !== DEFAULTS && !settings.value.guided && (
        <Guide
          onPage={(n) => (page.value = n)}
          onDone={() => {
            patch({ guided: true });
            page.value = 0;
          }}
        />
      )}

      {palOpen.value && (
        <Palette
          engineId={settings.value.searchEngine}
          onClose={() => (palOpen.value = false)}
        />
      )}

      {panelOpen.value && (
        <SettingsPanel
          value={settings.value}
          onChange={patch}
          onClose={() => (panelOpen.value = false)}
          work={work.value}
          onRestore={(s, w) => {
            // 整包蓋過去，不是逐項合併 —— 還原的意思就是「回到那個時候的樣子」
            patch(s);
            patchWork(w);
          }}
        />
      )}
    </>
  );
}

function Greeting({ now, name }: { now: Date; name: string }) {
  const slot = greetSlot(indexAt(now));
  const text = name ? t(`greet_${slot}`, name) : t(`greet_${slot}_anon`);
  return <p class="greet">{text}</p>;
}

function Clock({
  now,
  settings,
  onOpen,
}: {
  now: Date;
  settings: Settings;
  onOpen: () => void;
}) {
  const h = now.getHours();
  const shown = settings.clock24 ? h : h % 12 === 0 ? 12 : h % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <button
      class="clock"
      type="button"
      aria-haspopup="dialog"
      aria-label={t("dial_open")}
      onClick={onOpen}
    >
      {settings.clock24 ? pad(shown) : shown}:{pad(now.getMinutes())}
      {settings.showSeconds && <span class="sec">{pad(now.getSeconds())}</span>}
    </button>
  );
}

function DateLine({ now }: { now: Date }) {
  const en = isEnglish();
  // 中文日期用 Intl 產生，才不用自己維護「週日／星期日」這種在地差異
  const date = new Intl.DateTimeFormat(intlLocale(), {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  const outer = outerRingName(en ? moonIndex(now) : jieqiIndex(now));
  return (
    <p class="datel">
      {date}
      {en ? " · " : "　"}
      {outer}
    </p>
  );
}

function SearchBar({ engineId }: { engineId: string }) {
  const value = useSignal("");
  const input = useRef<HTMLInputElement>(null);

  // 覆寫新分頁時網址列不會自動聚焦到這裡，所以自己搶。
  // 使用者若想用網址列，一個 Esc 或直接點上去就走掉了。
  useEffect(() => {
    // 這是 passive effect，執行時機晚於版面掛載。若使用者已經點進別的欄位
    // （例如剛開的新增連結表單），硬搶會把游標拉走 —— 有人拿著焦點就不要搶。
    const active = document.activeElement;
    if (!active || active === document.body) input.current?.focus();
  }, []);

  const hit = useComputed(() => resolve(value.value, engineId)?.engine ?? null);

  return (
    <form
      class="search"
      role="search"
      autocomplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        const r = resolve(value.value, engineId);
        if (r) location.href = r.url;
      }}
    >
      <span class="icon" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={input}
        type="text"
        value={value.value}
        aria-label={t("search_label")}
        placeholder={t("search_placeholder")}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck={false}
        enterkeyhint="search"
        onInput={(e) => (value.value = e.currentTarget.value)}
      />
      {hit.value ? (
        <span class="hint">{hit.value.name}</span>
      ) : (
        <span class="kbd">Ctrl K</span>
      )}
    </form>
  );
}

function QuoteLine({ text, by }: { text: string; by: string }) {
  // 抽籤只抽一次。時鐘每秒重繪整棵樹，寫在 render 裡的話這句話會一秒換一句。
  const own = text.trim();
  /*
   * 不用 useMemo：nextQuote 一個分頁只走一格，重複叫它會拿到同一句。
   * 短路也是有意的 —— 有自訂語錄的時候一格都不該走，
   * 使用者根本沒看到那一句，回頭卻少了一句。
   */
  const q = own ? { text: own, by: by.trim() } : nextQuote(isEnglish());
  return (
    <p class="quote">
      {q.text}
      {q.by && <cite>{q.by}</cite>}
    </p>
  );
}
