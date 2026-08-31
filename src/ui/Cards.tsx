import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../lib/i18n";
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
 */

interface Props {
  value: Workspace;
  onChange: (patch: Partial<Workspace>) => void;
  show: { todos: boolean; note: boolean; pomodoro: boolean };
}

export function Cards({ value, onChange, show }: Props) {
  if (!show.todos && !show.note && !show.pomodoro) return null;
  return (
    <div class="cards">
      {show.todos && <TodoCard value={value} onChange={onChange} />}
      {show.note && <NoteCard value={value} onChange={onChange} />}
      {show.pomodoro && <PomodoroCard value={value} onChange={onChange} />}
    </div>
  );
}

function TodoCard({ value, onChange }: Omit<Props, "show">) {
  const draft = useSignal("");
  const left = value.todos.filter((td) => !td.done).length;

  return (
    <section class="card">
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
    </section>
  );
}

function NoteCard({ value, onChange }: Omit<Props, "show">) {
  return (
    <section class="card note">
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
    </section>
  );
}

function PomodoroCard({ value, onChange }: Omit<Props, "show">) {
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
    <section class="card pomo">
      <header>
        <b>{t("c_pomodoro")}</b>
        <span>{t(p.mode === "work" ? "c_pomo_work" : "c_pomo_rest")}</span>
      </header>

      <div class="clockface">
        <svg viewBox="0 0 100 100" aria-hidden="true">
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
        </svg>
        <span class="left">{formatLeft(left)}</span>
      </div>

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
    </section>
  );
}
