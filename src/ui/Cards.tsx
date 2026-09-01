import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { Links } from "./Links";
import { ImagePicker } from "./ImagePicker";
import type { Link } from "../lib/links";
import {
  COLS,
  move,
  normalize,
  nudge,
  resize,
  type CardId,
  type Tile,
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
  WORK_MS,
  REST_MS,
  type Workspace,
} from "../lib/workspace";

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
  linkGrid: boolean;
  /** 目前當桌布的那張圖，沒有就是 null */
  wallpaper: string | null;
  onWallpaper: (id: string | null) => void;
}

/**
 * 換位置、改大小之後，讓每張卡從舊位置滑到新位置。
 *
 * 先量舊位置，改完版面再量新位置，把差值當成起始 transform 播回零 ——
 * 就是 FLIP。CSS 對 `grid-column: span 2 -> 3` 沒有過場可做，只能這樣補。
 *
 * 第一版用的是 View Transition。它在拖曳時是錯的工具：每跨一格就把整頁
 * 拍成快照、蓋一層 0.3 秒的過場在上面，那 0.3 秒裡的後續變動全發生在
 * 蓋板底下看不到，結束時一次跳到位 —— 拖起來就是卡的。FLIP 只碰這幾張卡，
 * 而且可以隨時被下一次打斷、從當下的位置接著跑。
 *
 * 只補位移，不補縮放：卡片變大變小是瞬間的，但拉伸中的文字很難看，
 * 而且那 200 毫秒裡使用者看的是自己拉的那一張，不是它的字。
 */
const flying = new WeakMap<HTMLElement, Animation>();

function slide(box: HTMLElement | null, apply: () => void): void {
  const still =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!box || still || typeof box.animate !== "function") {
    apply();
    return;
  }

  const cards = [...box.querySelectorAll<HTMLElement>(".card")];
  // 量到的是「看起來在哪」，不是「版面上在哪」—— 上一段動畫還在跑的話
  // 這裡量到的就是它現在飛到一半的位置，接得起來才不會跳回去重來
  const before = new Map(cards.map((n) => [n, n.getBoundingClientRect()]));

  apply();

  requestAnimationFrame(() => {
    for (const node of box.querySelectorAll<HTMLElement>(".card")) {
      const a = before.get(node);
      if (!a) continue;
      // 先取消上一段，位置才會回到版面算出來的地方
      flying.get(node)?.cancel();
      const b = node.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const anim = node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: 220, easing: "cubic-bezier(.22, 1, .28, 1)" },
      );
      flying.set(node, anim);
    }
  });
}

const VARIANT: Record<CardId, string> = {
  todos: "",
  note: " note",
  pomodoro: " pomo",
  links: " linkcard",
  photos: " photocard",
};

export function Cards({
  value,
  onChange,
  show,
  desk,
  onDesk,
  links,
  onLinks,
  linkGrid,
  wallpaper,
  onWallpaper,
}: Props) {
  const live = useSignal<Tile[] | null>(null);
  const held = useSignal<CardId | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const order = live.value ?? normalize(desk);
  const tiles = order.filter((tl) => show[tl.id]);

  /** 拖曳結束的共同收尾：放手才落盤 */
  function commit() {
    const final = live.peek();
    live.value = null;
    held.value = null;
    if (final) onDesk(final);
  }

  function startMove(e: PointerEvent, id: CardId) {
    if (e.button !== 0) return;
    // 標題列上的按鈕（例如未來加的收合鈕）不該變成拖曳把手
    if ((e.target as HTMLElement).closest("button, input, textarea, a")) return;
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
      slide(grid.current, () => (live.value = move(live.peek() ?? order, id, to)));
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener(
      "pointerup",
      () => {
        document.removeEventListener("pointermove", onMove);
        commit();
      },
      { once: true },
    );
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
    const unitX = (box.getBoundingClientRect().width - gap * (COLS - 1)) / COLS + gap;
    const unitY = (card.getBoundingClientRect().height + gap) / tile.h;
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
    document.addEventListener(
      "pointerup",
      () => {
        document.removeEventListener("pointermove", onMove);
        commit();
      },
      { once: true },
    );
  }

  /** 一個把手同時管大小與位置：方向鍵改大小，Shift 加方向鍵換位置 */
  function onHandleKey(e: KeyboardEvent, tile: Tile) {
    const dx = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const dy = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const next = e.shiftKey
      ? nudge(order, tile.id, dx || dy)
      : resize(order, tile.id, tile.w + dx, tile.h + dy);
    slide(grid.current, () => onDesk(next));
  }

  if (tiles.length === 0) return null;

  return (
    <div class="cards" ref={grid}>
      {tiles.map((tile) => (
        <section
          key={tile.id}
          class={`card${VARIANT[tile.id]}${held.value === tile.id ? " held" : ""}`}
          data-id={tile.id}
          style={{ "--w": String(tile.w), "--h": String(tile.h) }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("header")) startMove(e, tile.id);
          }}
        >
          {tile.id === "todos" && <TodoCard value={value} onChange={onChange} />}
          {tile.id === "note" && <NoteCard value={value} onChange={onChange} />}
          {tile.id === "pomodoro" && <PomodoroCard value={value} onChange={onChange} />}
          {tile.id === "photos" && (
            <>
              <header>
                <b>{t("c_photos")}</b>
              </header>
              {/* 設定抽屜裡那個圖庫的放大版。點一張就換桌布，再點一次換回漸層 */}
              <ImagePicker
                wall
                selected={wallpaper}
                onSelect={(id) => onWallpaper(id === wallpaper ? null : id)}
              />
            </>
          )}
          {tile.id === "links" && (
            <>
              <header>
                <b>{t("c_links")}</b>
                <span>{links.length}</span>
              </header>
              <Links links={links} onChange={onLinks} grid={linkGrid} />
            </>
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
        <ul class="todos">
          {value.todos.map((td) => (
            <li key={td.id}>
              <button
                type="button"
                class={td.done ? "done" : undefined}
                onClick={() =>
                  onChange({
                    todos: value.todos.map((x) => (x.id === td.id ? { ...x, done: !x.done } : x)),
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
                onClick={() => onChange({ todos: value.todos.filter((x) => x.id !== td.id) })}
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

  useEffect(() => {
    if (!isRunning(p)) return;
    const id = setInterval(() => (tick.value = Date.now()), 500);
    return () => clearInterval(id);
  }, [p.endsAt, p.pausedLeft]);

  const left = remaining(p, tick.value);
  const total = p.mode === "work" ? WORK_MS : REST_MS;

  // 跑完就換邊。放在 render 裡判斷，因為狀態只是「結束時刻」——
  // 分頁關著的時候沒人跑計時器，重開時同樣要能發現已經跑完了。
  useEffect(() => {
    if (isRunning(p) && left === 0) onChange({ pomodoro: advance(p) });
  }, [left === 0, p.endsAt]);

  return (
    <>
      <header>
        <b>{t("c_pomodoro")}</b>
        <span>{t(p.mode === "work" ? "c_pomo_work" : "c_pomo_rest")}</span>
      </header>

      {/* 錶面與控制項包成一組，卡片拉寬時這一組從直排換成橫排 ——
          @container 改不了容器自己（.card），所以得有這一層才換得了方向 */}
      <div class="pomo-body">
        <div class="clockface">
          {/* 剩餘時間畫在 svg 裡，跟著 viewBox 縮放 —— 卡片拉大時數字自己會變大，
              不必拿容器查詢單位去猜。也因為它是真的文字，讀螢幕讀得到。 */}
          <svg viewBox="0 0 100 100" role="img" aria-label={formatLeft(left)}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="5" />
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
            <text class="left" x="50" y="51" text-anchor="middle" dominant-baseline="central">
              {formatLeft(left)}
            </text>
          </svg>
        </div>

        <div class="pomo-side">
          <div class="acts">
            <button
              type="button"
              onClick={() => onChange({ pomodoro: isRunning(p) ? pause(p) : start(p) })}
            >
              {t(isRunning(p) ? "c_pomo_pause" : "c_pomo_start")}
            </button>
            <button type="button" onClick={() => onChange({ pomodoro: reset(p) })}>
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
