import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { meshCss, colorsAt, paletteAt, paletteForColor, paletteForImage } from "../lib/mesh";
import { getImage, toUrl } from "../lib/images";
import { decimalHour, dayFraction, greetSlot, indexAt } from "../lib/shichen";
import { jieqiIndex, moonIndex } from "../lib/solar";
import { isEnglish, outerRingName, shichenAlt, shichenName, t } from "../lib/i18n";
import { resolve } from "../lib/search";
import { DEFAULTS, load, save, type Settings } from "../lib/settings";
import { Ring } from "./Ring";
import { Dial } from "./Dial";
import { SettingsPanel } from "./Settings";
import { Weather } from "./Weather";
import { Cards } from "./Cards";
import { Palette } from "./Palette";
import { randomQuote } from "../lib/quotes";
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

function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 33; // 以行為單位
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // 以頁為單位
  return e.deltaY;
}

/** 這一屏自己還捲得動嗎。捲得動就先讓它捲，捲到底了才換頁。 */
function canScroll(el: HTMLElement | null, dy: number): boolean {
  if (!el) return false;
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 1) return false;
  return dy > 0 ? el.scrollTop < max - 1 : el.scrollTop > 1;
}

export function App() {
  const now = useSignal(new Date());
  const settings = useSignal<Settings>(DEFAULTS);
  const notice = useSignal<string | null>(null);
  const dialOpen = useSignal(false);
  const panelOpen = useSignal(false);
  const palOpen = useSignal(false);
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

  useEffect(() => {
    const id = setInterval(() => (now.value = new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // 滾輪。彈窗開著時完全不收，那時滾輪屬於彈窗。
  useEffect(() => {
    let acc = 0;
    let last = 0;
    let until = 0;

    const onWheel = (e: WheelEvent) => {
      if (dialOpen.peek() || palOpen.peek() || panelOpen.peek()) return;
      const dy = wheelPixels(e);
      if (!dy) return;

      const at = Date.now();
      if (at < until) return;
      if (at - last > RESET_MS || Math.sign(dy) !== Math.sign(acc)) acc = 0;
      last = at;

      if (canScroll(document.querySelector<HTMLElement>(".screen.on"), dy)) return;

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
      notice.value = result === "local-fallback" ? t("save_local_fallback") : null;
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
    if (s.background === "image" && img) return paletteForImage(img.url, img.luminance, s.dim);
    // 還沒選圖、或圖讀不到，就退回時辰漸層，不要留一片空白
    return paletteAt(decimalHour(now.value));
  });
  const scIndex = useComputed(() => indexAt(now.value));

  // 顏色全部從這裡下到 :root，元件自己不判斷白天晚上
  useSignalEffect(() => {
    const s = settings.value;
    const p = palette.value;
    const r = document.documentElement;
    r.style.setProperty("--mesh", p.css);
    r.style.setProperty("--fg", p.fg);
    r.style.setProperty("--fg-2", p.fg2);
    r.style.setProperty("--glass", p.glass);
    r.style.setProperty("--glass-line", p.glassLine);
    // 搜尋列不吃 backdrop-filter，需要一個自己站得住的半透明底
    r.style.setProperty("--glass-solid", p.light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.11)");
    // 卡片與黏住的搜尋列都得自己站得住：底下有東西在動，不能只是一層半透明。
    // 暗底用比背景更暗的底做深度，亮底用白 —— 反過來會把字吃掉。
    r.style.setProperty("--card", p.light ? "rgba(255,255,255,.70)" : "rgba(13,17,27,.50)");
    r.style.setProperty("--veil", p.light ? "rgba(250,249,246,.90)" : "rgba(8,11,18,.86)");
    r.style.setProperty("--grain", String(s.grain));
    r.style.setProperty("--dim", String(s.dim));
    // 模糊只對自訂圖有意義，而且只有真的要模糊時才掛濾鏡 ——
    // filter 有值就會讓背景層自成合成層，顆粒層混不到它，漸層會被洗成灰的。
    const blur = s.background === "image" ? s.blur : 0;
    r.style.setProperty("--bg-filter", blur > 0 ? `blur(${blur}px)` : "none");

    // 自訂圖上仍依時辰疊一層明暗與色溫 —— 換了桌布，時間感不必跟著消失
    const tinted = s.background === "image" && s.shichenTint && bgImage.value;
    r.style.setProperty("--tint", tinted ? meshCss(colorsAt(decimalHour(now.value))) : "none");
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
        <Ring index={scIndex.value} fraction={dayFraction(now.value)} size={48} />
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
        />
      )}
    </header>
  );

  const hero = (
    <>
      <Greeting now={now.value} name={cfg.name} />
      <Clock now={now.value} settings={cfg} onOpen={() => (dialOpen.value = true)} />
      <DateLine now={now.value} />
    </>
  );
  const search = <SearchBar engineId={cfg.searchEngine} />;
  const quote = cfg.cards.quote ? <QuoteLine text={cfg.quoteText} by={cfg.quoteBy} /> : null;
  const cards = (
    <Cards
      value={work.value}
      onChange={patchWork}
      show={cfg.cards}
      desk={cfg.desk}
      onDesk={(desk) => patch({ desk })}
      links={cfg.links}
      onLinks={(l) => patch({ links: l })}
      linkGrid={cfg.linkGrid}
    />
  );
  const notices = (
    <footer class="bottom">{notice.value && <p class="notice">{notice.value}</p>}</footer>
  );

  return (
    <>
      <div class="mesh" />
      <div class="tint" />
      <div class="dim" />
      <div class="grain" />

      <div class="app" data-page={page.value}>
        {/* 收起來的那一屏設 inert：看不到的東西不該還能 Tab 進去 */}
        <section class={`screen${page.value === 0 ? " on" : ""}`} inert={page.value !== 0}>
          {topBar}

          <main class="core">
            {hero}
            {search}
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

      {dialOpen.value && (
        <Dial
          now={now.value}
          lat={settings.value.lat}
          lon={settings.value.lon}
          onClose={() => (dialOpen.value = false)}
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
  const date = new Intl.DateTimeFormat(en ? "en-GB" : undefined, {
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
      {hit.value ? <span class="hint">{hit.value.name}</span> : <span class="kbd">Ctrl K</span>}
    </form>
  );
}

function QuoteLine({ text, by }: { text: string; by: string }) {
  // 抽籤只抽一次。時鐘每秒重繪整棵樹，寫在 render 裡的話這句話會一秒換一句。
  const drawn = useMemo(() => randomQuote(isEnglish()), []);
  const own = text.trim();
  const q = own ? { text: own, by: by.trim() } : drawn;
  return (
    <p class="quote">
      {q.text}
      {q.by && <cite>{q.by}</cite>}
    </p>
  );
}
