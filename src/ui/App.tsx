import { useComputed, useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { paletteAt } from "../lib/mesh";
import { decimalHour, dayFraction, greetSlot, indexAt } from "../lib/shichen";
import { jieqiIndex, moonIndex } from "../lib/solar";
import { isEnglish, outerRingName, shichenAlt, shichenName, t } from "../lib/i18n";
import { resolve } from "../lib/search";
import { DEFAULTS, load, mirrorBoot, type Settings } from "../lib/settings";
import { Ring } from "./Ring";

/** 秒針之外的東西一秒更新一次就夠。時辰環一分鐘才動 0.25 度，看不出來。 */
const TICK_MS = 1000;

export function App() {
  const now = useSignal(new Date());
  const settings = useSignal<Settings>(DEFAULTS);
  const saveNotice = useSignal<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => (now.value = new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void load().then((s) => {
      settings.value = s;
      mirrorBoot(s);
    });
  }, []);

  const palette = useComputed(() => paletteAt(decimalHour(now.value)));
  const scIndex = useComputed(() => indexAt(now.value));

  // 顏色全部從這裡下到 :root，元件自己不判斷白天晚上
  useSignalEffect(() => {
    const p = palette.value;
    const r = document.documentElement;
    r.style.setProperty("--mesh", p.css);
    r.style.setProperty("--fg", p.fg);
    r.style.setProperty("--fg-2", p.fg2);
    r.style.setProperty("--glass", p.glass);
    r.style.setProperty("--glass-line", p.glassLine);
    r.style.setProperty("--grain", String(settings.value.grain));
    r.dataset.sc = String(scIndex.value);
  });

  return (
    <>
      <div class="mesh" />
      <div class="grain" />
      <div class="app">
        <header class="top">
          <button class="badge" type="button" aria-label={t("dial_open")}>
            <Ring index={scIndex.value} fraction={dayFraction(now.value)} size={48} />
            <span class="t">
              <b>
                {shichenName(scIndex.value)}
                {t("sc_suffix")}
              </b>
              <span>{shichenAlt(scIndex.value)}</span>
            </span>
          </button>
        </header>

        <main class="core">
          <Greeting now={now.value} name={settings.value.name} />
          <Clock now={now.value} settings={settings.value} />
          <DateLine now={now.value} />
          <SearchBar engineId={settings.value.searchEngine} />
        </main>

        <footer class="bottom">
          {saveNotice.value && <p class="notice">{saveNotice.value}</p>}
        </footer>
      </div>
    </>
  );
}

function Greeting({ now, name }: { now: Date; name: string }) {
  const slot = greetSlot(indexAt(now));
  const text = name ? t(`greet_${slot}`, name) : t(`greet_${slot}_anon`);
  return <p class="greet">{text}</p>;
}

function Clock({ now, settings }: { now: Date; settings: Settings }) {
  const h = now.getHours();
  const shown = settings.clock24 ? h : h % 12 === 0 ? 12 : h % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <button class="clock" type="button" aria-haspopup="dialog" aria-label={t("dial_open")}>
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
  useEffect(() => input.current?.focus(), []);

  const hit = useComputed(() => {
    const r = resolve(value.value, engineId);
    return r?.engine ?? null;
  });

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
      {hit.value ? (
        <span class="hint">{hit.value.name}</span>
      ) : (
        <span class="kbd">Ctrl K</span>
      )}
    </form>
  );
}
