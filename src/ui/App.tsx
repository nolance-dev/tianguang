import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
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
import { Links } from "./Links";
import { Weather } from "./Weather";
import { Cards } from "./Cards";
import { quoteOfDay } from "../lib/quotes";
import * as ws from "../lib/workspace";

/** 秒針之外的東西一秒更新一次就夠。時辰環一分鐘才動 0.25 度，看不出來。 */
const TICK_MS = 1000;

export function App() {
  const now = useSignal(new Date());
  const settings = useSignal<Settings>(DEFAULTS);
  const notice = useSignal<string | null>(null);
  const dialOpen = useSignal(false);
  const panelOpen = useSignal(false);

  useEffect(() => {
    const id = setInterval(() => (now.value = new Date()), TICK_MS);
    return () => clearInterval(id);
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

  return (
    <>
      <div class="mesh" />
      <div class="tint" />
      <div class="dim" />
      <div class="grain" />

      <div class="app">
        <section class="screen">
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

            {settings.value.weatherOn && (
              <Weather
                lat={settings.value.lat}
                lon={settings.value.lon}
                place={settings.value.placeName || t("s_city")}
                unit={settings.value.unit}
              />
            )}
          </header>

          <main class="core">
          <Greeting now={now.value} name={settings.value.name} />
          <Clock now={now.value} settings={settings.value} onOpen={() => (dialOpen.value = true)} />
          <DateLine now={now.value} />
          <SearchBar engineId={settings.value.searchEngine} />
            <Links links={settings.value.links} onChange={(links) => patch({ links })} />
          </main>

          {/* 往下還有一屏。不給提示的話沒人知道要捲。 */}
          <button
            class="cue"
            type="button"
            aria-label={t("scroll_down")}
            onClick={() =>
              document.getElementById("desk")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <span />
          </button>
        </section>

        {/* 第二屏：工作區。語錄在最上面，底下是各個功能卡。 */}
        <section class="screen desk" id="desk">
          {settings.value.cards.quote && <QuoteLine />}
          <Cards value={work.value} onChange={patchWork} show={settings.value.cards} />
          <footer class="bottom">{notice.value && <p class="notice">{notice.value}</p>}</footer>
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
        spellcheck={false}
        onInput={(e) => (value.value = e.currentTarget.value)}
      />
      {hit.value ? <span class="hint">{hit.value.name}</span> : <span class="kbd">Ctrl K</span>}
    </form>
  );
}

function QuoteLine() {
  const q = quoteOfDay(isEnglish());
  return (
    <p class="quote">
      {q.text}
      <cite>{q.by}</cite>
    </p>
  );
}
