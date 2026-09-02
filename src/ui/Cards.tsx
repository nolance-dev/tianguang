import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { Links } from "./Links";
import { PhotoWall } from "./PhotoWall";
import { CalendarCard } from "./Calendar";
import type { SecondCal } from "../lib/secondcal";
import { WeatherCard } from "./WeatherCard";
import { MediaCard } from "./MediaCard";
import { ClockCard } from "./ClockCard";
import type { Settings } from "../lib/settings";
import { MAX_LINKS, type Link } from "../lib/links";
import {
  COLS,
  move,
  kindOf,
  LINKS_PER_CARD,
  normalize,
  nudge,
  resize,
  type CardId,
  type Tile,
  type TileId,
} from "../lib/desk";
import {
  advance,
  formatLeft,
  isRunning,
  makeTodo,
  pause,
  remaining,
  reset,
  roundsToday,
  start,
  type Workspace,
} from "../lib/workspace";
import { durationMs } from "../lib/focus";
import { slide } from "../lib/flip";

/**
 * 工作區的卡片。
 *
 * 每張卡都有空狀態 —— 沒東西的時候是一句邀請，不是一個空框。
 * 這是複審抓到的缺漏之一：上線第一天每張卡都是空的，那才是第一印象。
 *
 * 版面可以自己排：拖標題列換位置，拖右下角改大小，卡片變大裡面顯示的
 * 東西也跟著變多（見 styles.css 的 @container 那幾段）。拖曳過程中的排法
 * 放在 live 這個訊號裡，放手才寫進設定 —— 每動一像素就寫一次的話，
 * 會一路撞到 chrome.storage.sync 每分鐘 120 次的節流。
 */

interface Body {
  value: Workspace;
  onChange: (patch: Partial<Workspace>) => void;
}

interface Props extends Body {
  show: Record<CardId, boolean>;
  desk: Tile[];
  onDesk: (desk: Tile[]) => void;
  links: Link[];
  onLinks: (links: Link[]) => void;
  /** 快速存取要幾張卡。由設定決定，不是由連結數量長出來 */
  linkCards: number;
  /** 照片牆的狀態。跟桌布無關 */
  photo: { id: string | null; rotate: number };
  onPhoto: (patch: Partial<{ id: string | null; rotate: number }>) => void;
  now: Date;
  onExpand: (id: CardId) => void;
  /** 時鐘卡要看十二／二十四小時制 */
  settings: Settings;
  /** 月曆卡要的：第二套曆法，以及今天的節日 */
  calendar: { secondCal: SecondCal; todayHoliday: string | null };
  /** 天氣卡要的座標與單位。亮暗由呼叫端判斷，卡片自己不看時間 */
  weather: {
    lat: number;
    lon: number;
    place: string;
    unit: "c" | "f";
    dark: boolean;
  };
}

const VARIANT: Record<CardId, string> = {
  todos: "",
  note: " note",
  pomodoro: " pomo",
  links: " linkcard",
  photos: " photocard",
  calendar: " calcard",
  weather: " wxcardwrap",
  media: " mediacard",
  clock: " clockcardwrap",
};

/** 有整屏詳細畫面的卡。沒列在這裡的就不長那顆展開鈕。 */
const EXPANDS: CardId[] = ["calendar", "pomodoro"];

export function Cards({
  value,
  onChange,
  show,
  desk,
  onDesk,
  links,
  onLinks,
  linkCards,
  photo,
  onPhoto,
  now,
  onExpand,
  weather,
  calendar,
  settings,
}: Props) {
  const live = useSignal<Tile[] | null>(null);
  const held = useSignal<TileId | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  /*
   * 快速存取有幾張是設定說了算，不是連結的數量說了算。
   *
   * 自動長出來的話，加第十七個連結會讓版面突然多一張卡 —— 使用者要的是加一個
   * 連結，不是改版面。所以滿了就是滿了，要更多自己去設定裡加一張。
   */
  const cardCount = Math.min(
    Math.max(1, Math.round(linkCards)),
    MAX_LINKS / LINKS_PER_CARD,
  );
  const linkIds: TileId[] = Array.from({ length: cardCount }, (_, i) =>
    i === 0 ? "links" : (`links${i + 1}` as TileId),
  );

  const order = live.value ?? normalize(desk, linkIds);
  const tiles = order.filter((tl) => {
    const kind = kindOf(tl.id);
    if (!show[kind]) return false;
    // 連結變少之後，多出來的那幾張不畫（版面裡的位置留著，加回來還在原位）
    return kind !== "links" || linkIds.includes(tl.id);
  });

  /** 拖曳結束的共同收尾：放手才落盤 */
  function commit() {
    const final = live.peek();
    live.value = null;
    held.value = null;
    if (final) onDesk(final);
  }

  function startMove(e: PointerEvent, id: TileId) {
    if (e.button !== 0) return;
    // 標題列上的控制項不該變成拖曳把手。select 漏掉的話，
    // 按下去是開始拖卡片，下拉選單永遠打不開。
    if (
      (e.target as HTMLElement).closest(
        "button, input, textarea, select, a, label",
      )
    )
      return;
    e.preventDefault();
    held.value = id;
    live.value = order;
    let over: CardId | null = null;

    const onMove = (ev: PointerEvent) => {
      const under = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>(".card");
      const to = under?.dataset.id as CardId | undefined;
      if (!to) return;
      // 換過去之後游標底下就是自己那張了，這時把記號清掉，才換得回來
      if (to === id) {
        over = null;
        return;
      }
      if (to === over) return;
      over = to;
      slide(
        grid.current,
        () => (live.value = move(live.peek() ?? order, id, to)),
      );
    };
    document.addEventListener("pointermove", onMove);
    /*
     * pointercancel 也要收尾。
     *
     * 系統隨時可能把這次指標互動收回去（切到別的視窗、觸控被判成捲動、
     * 筆離開感應範圍）。那時候 pointerup 永遠不會來，於是 held 一直是真，
     * 卡片就黏在半透明的拖曳狀態上，放不下也拖不動，只能重新整理。
     */
    const done = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", done);
      document.removeEventListener("pointercancel", done);
      commit();
    };
    document.addEventListener("pointerup", done);
    document.addEventListener("pointercancel", done);
  }

  function startResize(e: PointerEvent, tile: Tile) {
    if (e.button !== 0) return;
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>(".card");
    const box = grid.current;
    if (!card || !box) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    live.value = order;

    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    // 一格的跨距要含間隙，否則拖到第二欄時會差一個 gap，永遠慢半拍
    const unitX =
      (box.getBoundingClientRect().width - gap * (COLS - 1)) / COLS + gap;
    /*
     * 一列的高度要問格線，不要量卡片。
     *
     * 快速存取那張卡的高度是跟著內容走的（align-self: start），量它會比一格短，
     * 縱向就越拉越快。grid-auto-rows 是那個唯一不會騙人的值。
     */
    const rowPx = parseFloat(getComputedStyle(box).gridAutoRows);
    const unitY = Number.isFinite(rowPx)
      ? rowPx + gap
      : (card.getBoundingClientRect().height + gap) / tile.h;
    const x0 = e.clientX;
    const y0 = e.clientY;

    const onMove = (ev: PointerEvent) => {
      const w = tile.w + Math.round((ev.clientX - x0) / unitX);
      const h = tile.h + Math.round((ev.clientY - y0) / unitY);
      // 沒跨過格就什麼都不做。每一次 pointermove 都重設一次訊號的話，
      // 動畫會一直被自己打斷，看起來反而更頓。夾過範圍再比，
      // 才不會在拉到底之後還一直重算。
      const now = live.peek() ?? order;
      const next = resize(now, tile.id, w, h);
      const a = now.find((x) => x.id === tile.id);
      const b = next.find((x) => x.id === tile.id);
      if (a && b && a.w === b.w && a.h === b.h) return;
      slide(grid.current, () => (live.value = next));
    };
    document.addEventListener("pointermove", onMove);
    /*
     * pointercancel 也要收尾。
     *
     * 系統隨時可能把這次指標互動收回去（切到別的視窗、觸控被判成捲動、
     * 筆離開感應範圍）。那時候 pointerup 永遠不會來，於是 held 一直是真，
     * 卡片就黏在半透明的拖曳狀態上，放不下也拖不動，只能重新整理。
     */
    const done = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", done);
      document.removeEventListener("pointercancel", done);
      commit();
    };
    document.addEventListener("pointerup", done);
    document.addEventListener("pointercancel", done);
  }

  /** 一個把手同時管大小與位置：方向鍵改大小，Shift 加方向鍵換位置 */
  function onHandleKey(e: KeyboardEvent, tile: Tile) {
    const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const dy = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const next = e.shiftKey
      ? nudgeVisible(order, tile.id, dx || dy, new Set(tiles.map((t) => t.id)))
      : resize(order, tile.id, tile.w + dx, tile.h + dy);
    slide(grid.current, () => onDesk(next));
  }

  /*
   * Shift+方向鍵換位置，要跳過畫面上沒有的那幾張。
   *
   * order 裡有全部的卡（關掉的也留著，開回來還在原位），但畫面上只有 tiles。
   * 直接 nudge 一格，如果隔壁那張正好是關掉的，看起來就是「按了沒反應」——
   * 而使用者只能再按一次，多按幾次才動一格。
   *
   * 所以一直推到「看得見的順序」真的變了為止。推不動就還原，不要留下一個
   * 只換了隱藏卡片位置的結果。
   */
  function nudgeVisible(
    list: Tile[],
    id: TileId,
    dir: number,
    shown: Set<TileId>,
  ): Tile[] {
    const seen = (l: Tile[]) =>
      l.filter((t) => shown.has(t.id)).findIndex((t) => t.id === id);
    const from = seen(list);
    let next = list;
    for (let i = 0; i < list.length; i++) {
      const step = nudge(next, id, dir);
      if (step === next) return list; // already at the end
      next = step;
      if (seen(next) !== from) return next;
    }
    return list;
  }

  if (tiles.length === 0) return null;

  return (
    <div class="cards" ref={grid}>
      {tiles.map((tile) => (
        <section
          key={tile.id}
          class={`card${VARIANT[kindOf(tile.id)]}${held.value === tile.id ? " held" : ""}`}
          data-id={tile.id}
          data-w={tile.w}
          data-h={tile.h}
          style={{ "--w": String(tile.w), "--h": String(tile.h) }}
          onPointerDown={(e) => {
            // 沒有標題列的卡（照片、日曆）自己標出哪一塊可以抓
            if ((e.target as HTMLElement).closest("header, [data-grab]"))
              startMove(e, tile.id);
          }}
        >
          {tile.id === "todos" && (
            <TodoCard value={value} onChange={onChange} />
          )}
          {tile.id === "note" && <NoteCard value={value} onChange={onChange} />}
          {tile.id === "pomodoro" && (
            <PomodoroCard value={value} onChange={onChange} />
          )}
          {tile.id === "photos" && (
            <PhotoWall photo={photo} onPhoto={onPhoto} />
          )}
          {tile.id === "calendar" && (
            <CalendarCard
              events={value.events}
              now={now}
              secondCal={calendar.secondCal}
              holiday={calendar.todayHoliday}
            />
          )}
          {tile.id === "weather" && <WeatherCard {...weather} />}
          {tile.id === "media" && <MediaCard />}
          {tile.id === "clock" && (
            <ClockCard
              now={now}
              settings={settings}
              onOpen={() => onExpand("clock")}
            />
          )}
          {kindOf(tile.id) === "links" &&
            (() => {
              const from = linkIds.indexOf(tile.id) * LINKS_PER_CARD;
              const mine = links.slice(from, from + LINKS_PER_CARD);
              return (
                <>
                  <header>
                    <b>{t("c_links")}</b>
                    <span>{mine.length}</span>
                  </header>
                  <Links
                    links={mine}
                    // 這一張只換自己那一段，前後原封不動接回去
                    onChange={(next) =>
                      onLinks([
                        ...links.slice(0, from),
                        ...next,
                        ...links.slice(from + mine.length),
                      ])
                    }
                    // 這一張裝滿十六個、或全部的卡都裝滿了，加號就不出現
                    max={
                      links.length >= cardCount * LINKS_PER_CARD
                        ? mine.length
                        : LINKS_PER_CARD
                    }
                  />
                </>
              );
            })()}

          {EXPANDS.includes(kindOf(tile.id)) && (
            <button
              type="button"
              class="expand"
              aria-label={t("card_expand")}
              onClick={() => onExpand(kindOf(tile.id))}
            >
              ⤢
            </button>
          )}

          <button
            type="button"
            class="grow"
            aria-label={t("c_resize")}
            onPointerDown={(e) => startResize(e, tile)}
            onKeyDown={(e) => onHandleKey(e, tile)}
          />
        </section>
      ))}
    </div>
  );
}

function TodoCard({ value, onChange }: Body) {
  const draft = useSignal("");
  const left = value.todos.filter((td) => !td.done).length;
  const list = useRef<HTMLUListElement>(null);

  return (
    <>
      <header>
        <b>{t("c_todos")}</b>
        <span>
          {left} / {value.todos.length}
        </span>
      </header>

      {value.todos.length === 0 ? (
        <p class="empty">{t("c_todos_empty")}</p>
      ) : (
        <ul class="todos" ref={list}>
          {value.todos.map((td) => (
            <li key={td.id}>
              <button
                type="button"
                class={td.done ? "done" : undefined}
                onClick={() =>
                  onChange({
                    todos: value.todos.map((x) =>
                      x.id === td.id ? { ...x, done: !x.done } : x,
                    ),
                  })
                }
              >
                <i class="box" />
                <span>{td.text}</span>
              </button>
              <button
                type="button"
                class="rm"
                aria-label={t("c_todo_remove")}
                /*
                 * 劃掉中間一項，底下那幾項會整批往上跳一格。用的是卡片換位置
                 * 那一套 FLIP —— 先量舊位置，刪完再從舊位置滑到新位置。
                 * 消失的那一項不補，它已經不在了；補的是還在的那些。
                 */
                onClick={() =>
                  slide(
                    list.current,
                    () =>
                      onChange({
                        todos: value.todos.filter((x) => x.id !== td.id),
                      }),
                    "li",
                  )
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        class="one"
        onSubmit={(e) => {
          e.preventDefault();
          const td = makeTodo(draft.value);
          if (!td) return;
          onChange({ todos: [...value.todos, td] });
          draft.value = "";
        }}
      >
        <input
          type="text"
          value={draft.value}
          placeholder={t("c_todo_add")}
          aria-label={t("c_todo_add")}
          onInput={(e) => (draft.value = e.currentTarget.value)}
        />
      </form>
    </>
  );
}

function NoteCard({ value, onChange }: Body) {
  return (
    <>
      <header>
        <b>{t("c_note")}</b>
        <span>{value.note.trim() ? t("c_saved") : ""}</span>
      </header>
      <textarea
        value={value.note}
        placeholder={t("c_note_hint")}
        aria-label={t("c_note")}
        onInput={(e) => onChange({ note: e.currentTarget.value })}
      />
    </>
  );
}

function PomodoroCard({ value, onChange }: Body) {
  const p = value.pomodoro;
  const tick = useSignal(Date.now());

  /*
   * 用 useLayoutEffect，而且進來第一件事就是對時。
   *
   * tick 只在跑的時候才更新，所以按下開始的那一瞬間，它還停在上一次停下來的
   * 時間戳上 —— 那個值可能是幾分鐘前。endsAt 是用「現在」算的，兩者相減就會
   * 多出那幾分鐘，畫面先閃一格 15:02 再跳回 14:59。
   *
   * useEffect 是畫完才跑的，那一格錯的畫面看得到；useLayoutEffect 在畫之前跑，
   * 看不到。上面 remaining() 的夾子是第二道保險，兩個都要。
   */
  useLayoutEffect(() => {
    if (!isRunning(p)) return;
    tick.value = Date.now();
    const id = setInterval(() => (tick.value = Date.now()), 500);
    return () => clearInterval(id);
  }, [p.endsAt, p.pausedLeft]);

  const total = durationMs(p.mode, value.durations);
  const left = remaining(p, tick.value, total);

  // 跑完就換邊。放在 render 裡判斷，因為狀態只是「結束時刻」——
  // 分頁關著的時候沒人跑計時器，重開時同樣要能發現已經跑完了。
  useEffect(() => {
    if (isRunning(p) && left === 0) onChange({ pomodoro: advance(p) });
  }, [left === 0, p.endsAt]);

  return (
    <>
      <header>
        <b>{t("c_pomodoro")}</b>
        <span>{t(`fo_${p.mode}`)}</span>
      </header>

      {/* 錶面與控制項包成一組，卡片拉寬時這一組從直排換成橫排 ——
          @container 改不了容器自己（.card），所以得有這一層才換得了方向 */}
      <div class="pomo-body">
        <div class="clockface">
          {/* 剩餘時間畫在 svg 裡，跟著 viewBox 縮放 —— 卡片拉大時數字自己會變大，
              不必拿容器查詢單位去猜。也因為它是真的文字，讀螢幕讀得到。 */}
          <svg viewBox="0 0 100 100" role="img" aria-label={formatLeft(left)}>
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              stroke-opacity=".15"
              stroke-width="5"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="currentColor"
              stroke-width="5"
              stroke-linecap="round"
              transform="rotate(-90 50 50)"
              stroke-dasharray={`${(1 - left / total) * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
            />
            <text
              class="left"
              x="50"
              y="51"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {formatLeft(left)}
            </text>
          </svg>
        </div>

        <div class="pomo-side">
          <div class="acts">
            <button
              type="button"
              onClick={() =>
                onChange({
                  pomodoro: isRunning(p)
                    ? pause(p, Date.now(), total)
                    : start(p, Date.now(), total),
                })
              }
            >
              {t(isRunning(p) ? "c_pomo_pause" : "c_pomo_start")}
            </button>
            <button
              type="button"
              onClick={() => onChange({ pomodoro: reset(p) })}
            >
              {t("c_pomo_reset")}
            </button>
          </div>

          <p class="rounds">
            {t("c_pomo_rounds")} {roundsToday(value)}
          </p>
        </div>
      </div>
    </>
  );
}
