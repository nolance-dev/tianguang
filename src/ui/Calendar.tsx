import { useSignal } from "@preact/signals";
import { useDialog } from "./useDialog";
import { useRef } from "preact/hooks";
import { intlLocale, t } from "../lib/i18n";
import {
  byDay,
  isoWeek,
  makeEvent,
  monthGrid,
  onDay,
  shiftMonth,
  ymd,
  type Event,
} from "../lib/agenda";
import { calYear, subDate, type SecondCal } from "../lib/secondcal";

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
  secondCal: SecondCal;
  holiday: string | null;
}

/** 年號曆在卡片上顯示「民國115年」，形狀跟 subDate 一致，呼叫端不必分兩種 */
function eraSub(d: Date, cal: SecondCal) {
  const year = calYear(d, cal);
  return year ? { text: year, lead: true } : null;
}

export function CalendarCard({ events, now, secondCal, holiday }: CardProps) {
  const busy = onDay(events, ymd(now)).length;
  // 民國／和曆逐日沒東西可寫（月日跟西曆相同），改成顯示年號
  const sub = subDate(now, secondCal) ?? eraSub(now, secondCal);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale(), opts).format(now);

  return (
    <div class={`calface${now.getDay() === 0 ? " sun" : ""}`} data-grab>
      <span class="cal-wd">{fmt({ weekday: "long" })}</span>
      <b class="cal-day">{now.getDate()}</b>
      <span class="cal-mo">
        {fmt({ month: "long" })}
        {sub && <i>{sub.text}</i>}
      </span>
      {holiday && <span class="cal-holi">{holiday}</span>}
      {busy > 0 && (
        <span class="cal-busy">{t("cal_today_count", String(busy))}</span>
      )}
    </div>
  );
}

interface DetailProps {
  events: Event[];
  onChange: (events: Event[]) => void;
  now: Date;
  secondCal: SecondCal;
  /** 日期 → 那天的節日名 */
  holidays: Map<string, string[]>;
  onClose: () => void;
}

export function CalendarDetail({
  events,
  onChange,
  now,
  secondCal,
  holidays,
  onClose,
}: DetailProps) {
  const year = useSignal(now.getFullYear());
  const month = useSignal(now.getMonth());
  const picked = useSignal(ymd(now));
  const closeRef = useRef<HTMLButtonElement>(null);

  // 焦點鎖在框裡、Esc 關閉、關掉之後還給打開它的那個元素，都在這個 hook 裡
  const box = useDialog<HTMLDivElement>(onClose, closeRef);

  const grouped = byDay(events);
  const cells = monthGrid(year.value, month.value);
  const dayEvents = grouped.get(picked.value) ?? [];
  const todayKey = ymd(now);

  const label = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(intlLocale(), opts).format(d);

  function jump(delta: number) {
    const [y, m] = shiftMonth(year.value, month.value, delta);
    year.value = y;
    month.value = m;
  }

  return (
    <div
      ref={box}
      tabIndex={-1}
      class="full"
      role="dialog"
      aria-modal="true"
      aria-label={t("c_calendar")}
    >
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
          <button
            type="button"
            onClick={() => jump(-1)}
            aria-label={t("cal_prev")}
          >
            ‹
          </button>
          <b class="cal-when">
            {label(new Date(year.value, month.value, 1), {
              year: "numeric",
              month: "long",
            })}
            {/*
              民國／和曆只換年份的稱呼，月和日跟西曆一模一樣 ——
              所以它要說的話在這裡說一次就夠，不必逐格重複四十二次。
            */}
            {calYear(new Date(year.value, month.value, 1), secondCal) && (
              <i class="cal-era">
                {calYear(new Date(year.value, month.value, 1), secondCal)}
              </i>
            )}
          </b>
          <button
            type="button"
            onClick={() => jump(1)}
            aria-label={t("cal_next")}
          >
            ›
          </button>
        </div>
      </header>

      <div class="full-body">
        <section class="cal-main">
          <div class="cal-grid">
            <span class="cal-head wk">{t("cal_week")}</span>
            {cells.slice(0, 7).map((d) => (
              <span
                key={`h${d.getDay()}`}
                class={`cal-head${d.getDay() === 0 ? " sun" : ""}`}
              >
                {label(d, { weekday: "short" })}
              </span>
            ))}
            {cells.map((d, i) => {
              const key = ymd(d);
              const mine = grouped.get(key) ?? [];
              const holi = holidays.get(key);
              const sub = subDate(d, secondCal);
              // 每一列開頭插一格週數。星期一起算，所以每七格一次
              const week =
                i % 7 === 0 ? (
                  <span key={`w${key}`} class="cal-wk">
                    {isoWeek(d)}
                  </span>
                ) : null;
              const cell = (
                <button
                  key={key}
                  type="button"
                  class={`cal-cell${d.getMonth() !== month.value ? " out" : ""}${
                    key === todayKey ? " today" : ""
                  }${key === picked.value ? " on" : ""}${d.getDay() === 0 ? " sun" : ""}${
                    holi ? " holi" : ""
                  }`}
                  aria-current={key === todayKey ? "date" : undefined}
                  onClick={() => (picked.value = key)}
                >
                  <span class="row1">
                    <span class="num">{d.getDate()}</span>
                    {sub && (
                      <i class={sub.lead ? "sub lead" : "sub"}>{sub.text}</i>
                    )}
                  </span>
                  {holi && <span class="holiname">{holi[0]}</span>}
                  {mine.slice(0, PER_CELL).map((e) => (
                    <span key={e.id} class="chip">
                      {e.time && <i>{e.time}</i>}
                      {e.text}
                    </span>
                  ))}
                  {mine.length > PER_CELL && (
                    <span class="more">
                      {t("cal_more", String(mine.length - PER_CELL))}
                    </span>
                  )}
                </button>
              );
              return week ? [week, cell] : cell;
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

          {(holidays.get(picked.value) ?? []).map((name) => (
            <span key={name} class="cal-holiday">
              {name}
            </span>
          ))}

          <AddEvent
            date={picked.value}
            onAdd={(e) => onChange([...events, e])}
          />

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

function AddEvent({
  date,
  onAdd,
}: {
  date: string;
  onAdd: (e: Event) => void;
}) {
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
