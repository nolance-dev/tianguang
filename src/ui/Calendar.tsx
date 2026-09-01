import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { isEnglish, t } from "../lib/i18n";
import { byDay, makeEvent, monthGrid, onDay, shiftMonth, ymd, type Event } from "../lib/agenda";

/**
 * 日曆。
 *
 * 卡片上只有今天：星期、日、月。一張新分頁的日曆百分之九十的時候只被問
 * 一個問題 ——「今天幾號」，那個答案該一眼看完，不必先掃過一整個月的格子。
 * 要看月曆就展開。
 *
 * 展開的那一屏只有月檢視。格子裡直接寫事件的標題，不是點一顆小圓點 ——
 * 圓點只回答「這天有沒有事」，而看月曆的人問的是「這天是什麼事」。
 */

/** 一格裡塞得下的事件行數。再多就收成「還有 N 件」。 */
const PER_CELL = 2;

interface CardProps {
  events: Event[];
  now: Date;
}

export function CalendarCard({ events, now }: CardProps) {
  const en = isEnglish();
  const busy = onDay(events, ymd(now)).length;
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(en ? "en-GB" : undefined, opts).format(now);

  return (
    <div class="calface" data-grab>
      <span class="cal-wd">{fmt({ weekday: "long" })}</span>
      <b class="cal-day">{now.getDate()}</b>
      <span class="cal-mo">{fmt({ month: "long" })}</span>
      {busy > 0 && <span class="cal-busy">{t("cal_today_count", String(busy))}</span>}
    </div>
  );
}

interface DetailProps {
  events: Event[];
  onChange: (events: Event[]) => void;
  now: Date;
  onClose: () => void;
}

export function CalendarDetail({ events, onChange, now, onClose }: DetailProps) {
  const en = isEnglish();
  const year = useSignal(now.getFullYear());
  const month = useSignal(now.getMonth());
  const picked = useSignal(ymd(now));
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => closeRef.current?.focus(), []);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const grouped = byDay(events);
  const cells = monthGrid(year.value, month.value);
  const dayEvents = grouped.get(picked.value) ?? [];
  const todayKey = ymd(now);

  const label = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(en ? "en-GB" : undefined, opts).format(d);

  function jump(delta: number) {
    const [y, m] = shiftMonth(year.value, month.value, delta);
    year.value = y;
    month.value = m;
  }

  return (
    <div class="full" role="dialog" aria-modal="true" aria-label={t("c_calendar")}>
      <header class="full-top">
        <button
          ref={closeRef}
          type="button"
          class="icon-btn"
          onClick={onClose}
          aria-label={t("sheet_back")}
        >
          ←
        </button>
        <b>{t("c_calendar")}</b>

        {/* 月份的前後鍵放在最上面那一列，底下那塊就純粹是格子 */}
        <div class="cal-nav">
          <button
            type="button"
            onClick={() => {
              year.value = now.getFullYear();
              month.value = now.getMonth();
              picked.value = todayKey;
            }}
          >
            {t("cal_today")}
          </button>
          <button type="button" onClick={() => jump(-1)} aria-label={t("cal_prev")}>
            ‹
          </button>
          <b class="cal-when">
            {label(new Date(year.value, month.value, 1), { year: "numeric", month: "long" })}
          </b>
          <button type="button" onClick={() => jump(1)} aria-label={t("cal_next")}>
            ›
          </button>
        </div>
      </header>

      <div class="full-body">
        <section class="cal-main">
          <div class="cal-grid">
            {cells.slice(0, 7).map((d) => (
              <span key={`h${d.getDay()}`} class="cal-head">
                {label(d, { weekday: "short" })}
              </span>
            ))}
            {cells.map((d) => {
              const key = ymd(d);
              const mine = grouped.get(key) ?? [];
              return (
                <button
                  key={key}
                  type="button"
                  class={`cal-cell${d.getMonth() !== month.value ? " out" : ""}${
                    key === todayKey ? " today" : ""
                  }${key === picked.value ? " on" : ""}`}
                  aria-current={key === todayKey ? "date" : undefined}
                  onClick={() => (picked.value = key)}
                >
                  <span class="num">{d.getDate()}</span>
                  {mine.slice(0, PER_CELL).map((e) => (
                    <span key={e.id} class="chip">
                      {e.time && <i>{e.time}</i>}
                      {e.text}
                    </span>
                  ))}
                  {mine.length > PER_CELL && (
                    <span class="more">{t("cal_more", String(mine.length - PER_CELL))}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <aside class="cal-side">
          <b class="cal-picked">
            {label(new Date(`${picked.value}T00:00`), {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </b>

          <AddEvent date={picked.value} onAdd={(e) => onChange([...events, e])} />

          <ul class="cal-list">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <span class="when">{e.time || t("cal_allday")}</span>
                <span class="what">{e.text}</span>
                <button
                  type="button"
                  class="rm"
                  aria-label={t("cal_remove")}
                  onClick={() => onChange(events.filter((x) => x.id !== e.id))}
                >
                  ✕
                </button>
              </li>
            ))}
            {dayEvents.length === 0 && <li class="empty">{t("cal_none")}</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function AddEvent({ date, onAdd }: { date: string; onAdd: (e: Event) => void }) {
  const text = useSignal("");
  const time = useSignal("");

  return (
    <form
      class="cal-add"
      onSubmit={(e) => {
        e.preventDefault();
        const made = makeEvent(date, time.value, text.value);
        if (!made) return;
        onAdd(made);
        text.value = "";
        time.value = "";
      }}
    >
      {/* 內容自己一行。跟時間和按鈕擠在同一列時三個都太窄，
          而要寫的那一欄本來就是最長的那一欄 */}
      <input
        class="what"
        type="text"
        value={text.value}
        placeholder={t("cal_add_hint")}
        aria-label={t("cal_add_hint")}
        onInput={(e) => (text.value = e.currentTarget.value)}
      />
      <div class="row">
        {/* 時間可以留白 —— 一天裡多數的事沒有準確時刻，逼人填一個假的沒有意義 */}
        <input
          type="time"
          value={time.value}
          aria-label={t("cal_time")}
          onInput={(e) => (time.value = e.currentTarget.value)}
        />
        <span class="hint">{time.value ? "" : t("cal_allday")}</span>
        <button type="submit" disabled={!text.value.trim()}>
          {t("cal_add")}
        </button>
      </div>
    </form>
  );
}
