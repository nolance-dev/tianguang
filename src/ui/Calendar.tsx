import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { isEnglish, t } from "../lib/i18n";
import {
  busyDays,
  makeEvent,
  monthGrid,
  onDay,
  shiftMonth,
  upcoming,
  ymd,
  type Event,
} from "../lib/agenda";

/**
 * 日曆。
 *
 * 卡片上只有今天：星期、日、月。一張新分頁的日曆百分之九十的時候只被問
 * 一個問題 ——「今天幾號」，那個答案該一眼看完，不必先掃過一整個月的格子。
 * 要看月曆就展開。
 *
 * 展開的那一屏是「月」和「議程」兩個檢視。日／週／年是同一份資料換一種排版，
 * 真的要用再加，先不要為了填滿一排頁籤而做三個沒人點的東西。
 */

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
    <div class="calface">
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
  const view = useSignal<"month" | "agenda">("month");
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

  const busy = busyDays(events);
  const cells = monthGrid(year.value, month.value);
  const dayEvents = onDay(events, picked.value);

  const label = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(en ? "en-GB" : undefined, opts).format(d);

  function jump(delta: number) {
    const [y, m] = shiftMonth(year.value, month.value, delta);
    year.value = y;
    month.value = m;
  }

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={t("c_calendar")}>
      <header class="sheet-top">
        <button ref={closeRef} type="button" class="icon-btn" onClick={onClose} aria-label={t("sheet_back")}>
          ←
        </button>
        <b>{t("c_calendar")}</b>
        <div class="seg" role="group" aria-label={t("cal_view")}>
          {(["month", "agenda"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view.value === v} onClick={() => (view.value = v)}>
              {t(v === "month" ? "cal_month" : "cal_agenda")}
            </button>
          ))}
        </div>
      </header>

      <div class="sheet-body">
        <section class="cal-main">
          {view.value === "month" ? (
            <>
              <div class="cal-nav">
                <button
                  type="button"
                  onClick={() => {
                    year.value = now.getFullYear();
                    month.value = now.getMonth();
                    picked.value = ymd(now);
                  }}
                >
                  {t("cal_today")}
                </button>
                <button type="button" onClick={() => jump(-1)} aria-label={t("cal_prev")}>
                  ‹
                </button>
                <button type="button" onClick={() => jump(1)} aria-label={t("cal_next")}>
                  ›
                </button>
                <b>{label(new Date(year.value, month.value, 1), { year: "numeric", month: "long" })}</b>
              </div>

              <div class="cal-grid" role="grid">
                {cells.slice(0, 7).map((d) => (
                  <span key={`h${d.getDay()}`} class="cal-head">
                    {label(d, { weekday: "short" })}
                  </span>
                ))}
                {cells.map((d) => {
                  const key = ymd(d);
                  const out = d.getMonth() !== month.value;
                  return (
                    <button
                      key={key}
                      type="button"
                      class={`cal-cell${out ? " out" : ""}${key === ymd(now) ? " today" : ""}${
                        key === picked.value ? " on" : ""
                      }`}
                      aria-current={key === ymd(now) ? "date" : undefined}
                      onClick={() => (picked.value = key)}
                    >
                      <span>{d.getDate()}</span>
                      {busy.has(key) && <i class="dot" />}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <ul class="cal-agenda">
              {upcoming(events, ymd(now)).map((e) => (
                <li key={e.id}>
                  <span class="when">
                    {label(new Date(`${e.date}T00:00`), { month: "short", day: "numeric" })}
                    {e.time && ` ${e.time}`}
                  </span>
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
              {upcoming(events, ymd(now)).length === 0 && <li class="empty">{t("cal_none_ahead")}</li>}
            </ul>
          )}
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
      <input
        type="text"
        value={text.value}
        placeholder={t("cal_add_hint")}
        aria-label={t("cal_add_hint")}
        onInput={(e) => (text.value = e.currentTarget.value)}
      />
      {/* 時間可以留白 —— 一天裡多數的事沒有準確時刻，逼人填一個假的沒有意義 */}
      <input
        type="time"
        value={time.value}
        aria-label={t("cal_time")}
        onInput={(e) => (time.value = e.currentTarget.value)}
      />
      <button type="submit">{t("cal_add")}</button>
    </form>
  );
}
