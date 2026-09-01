import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import {
  clock,
  countOnDay,
  durationMs,
  isFocus,
  lastDays,
  makeProject,
  makeSession,
  minutes,
  MODES,
  msOnDay,
  ROUND,
  totalMs,
} from "../lib/focus";
import {
  advance,
  formatLeft,
  isRunning,
  pause,
  remaining,
  reset,
  roundsToday,
  start,
  today,
  type Workspace,
} from "../lib/workspace";

/**
 * 專注的整屏畫面。
 *
 * 卡片上只有「還剩多久」和兩顆鈕，這裡才是「我在做什麼、做了多少」。
 * 統計全部從 sessions 當場算出來，不另外存加總 —— 存了加總就要在每個
 * 會改到紀錄的地方記得同步更新它，漏一個地方就永遠對不起來。
 */

interface Props {
  work: Workspace;
  onChange: (patch: Partial<Workspace>) => void;
  onClose: () => void;
}

export function Focus({ work, onChange, onClose }: Props) {
  const tick = useSignal(Date.now());
  const span = useSignal<7 | 30>(7);
  const filter = useSignal<string>("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => closeRef.current?.focus(), []);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const p = work.pomodoro;
  const total = durationMs(p.mode, work.durations);

  useEffect(() => {
    if (!isRunning(p)) return;
    const id = setInterval(() => (tick.value = Date.now()), 500);
    return () => clearInterval(id);
  }, [p.endsAt, p.pausedLeft]);

  const left = remaining(p, tick.value, total);

  /** 記一段，然後把番茄鐘推到下一個模式。 */
  function finish(elapsed: number) {
    const session = makeSession(elapsed, p.mode, p.projectId);
    onChange({
      pomodoro: advance(p),
      ...(session ? { sessions: [...work.sessions, session] } : {}),
    });
  }

  // 跑完了就自動結算。判斷放在 render 之後的 effect 裡，因為狀態只是一個
  // 結束時刻 —— 分頁關著時沒人跑計時器，重開時同樣要能發現已經到點了。
  useEffect(() => {
    if (isRunning(p) && left === 0) finish(total);
  }, [left === 0, p.endsAt]);

  const day = today();
  const scope = filter.value || undefined;
  const bars = lastDays(work.sessions, span.value, new Date(), scope);
  const peak = Math.max(1, ...bars.map((b) => b.ms));

  return (
    <div class="full" role="dialog" aria-modal="true" aria-label={t("c_pomodoro")}>
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
        <b>{t("c_pomodoro")}</b>

        <div class="seg fo-modes" role="group" aria-label={t("fo_mode")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={p.mode === m}
              onClick={() => onChange({ pomodoro: { ...reset(p), mode: m } })}
            >
              {t(`fo_${m}`)}
            </button>
          ))}
        </div>
      </header>

      <div class="full-body">
        <section class="fo-main">
          <b class="fo-time">{formatLeft(left)}</b>

          <div class="fo-acts">
            <button
              type="button"
              class="key"
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
            <button type="button" onClick={() => onChange({ pomodoro: reset(p) })}>
              {t("c_pomo_reset")}
            </button>
            {/* 提交＝把到目前為止的時間記下來就收工，不必等它跑完。
                真實的一段專注常常在響鈴之前就結束了 */}
            <button
              type="button"
              disabled={!isFocus(p.mode) || total - left < 60_000}
              onClick={() => finish(total - left)}
            >
              {t("fo_commit")}
            </button>
          </div>

          <div class="fo-chips">
            <span>
              {t("fo_round")} {roundsToday(work) % ROUND || (roundsToday(work) ? ROUND : 0)}/{ROUND}
            </span>
            <span>{isRunning(p) ? t("fo_running") : t("fo_ready")}</span>
          </div>

          <div class="fo-pick">
            <label>
              <span>{t("fo_project")}</span>
              <select
                value={p.projectId ?? ""}
                onChange={(e) =>
                  onChange({ pomodoro: { ...p, projectId: e.currentTarget.value || null } })
                }
              >
                <option value="">{t("fo_no_project")}</option>
                {work.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </label>

            {/* 任務直接用待辦那一份，不另外開一套 —— 兩份清單只會各記各的 */}
            <label>
              <span>{t("fo_task")}</span>
              <select
                value={p.todoId ?? ""}
                onChange={(e) =>
                  onChange({ pomodoro: { ...p, todoId: e.currentTarget.value || null } })
                }
              >
                <option value="">{t("fo_no_task")}</option>
                {work.todos
                  .filter((td) => !td.done)
                  .map((td) => (
                    <option key={td.id} value={td.id}>
                      {td.text}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </section>

        <aside class="fo-side">
          <Projects work={work} onChange={onChange} />

          <div class="fo-stats">
            <b class="fo-h">{t("fo_stats")}</b>
            <div class="fo-nums">
              <span>
                <i>{t("fo_today")}</i>
                {minutes(msOnDay(work.sessions, day, scope))}
                {t("fo_min")}
              </span>
              <span>
                <i>{t("fo_sets")}</i>
                {countOnDay(work.sessions, day)}
              </span>
              <span>
                <i>{t("fo_total")}</i>
                {clock(totalMs(work.sessions, scope))}
              </span>
            </div>

            <div class="fo-filter">
              <div class="seg" role="group" aria-label={t("fo_span")}>
                {([7, 30] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={span.value === n}
                    onClick={() => (span.value = n)}
                  >
                    {t(n === 7 ? "fo_week" : "fo_month")}
                  </button>
                ))}
              </div>
              <select value={filter.value} onChange={(e) => (filter.value = e.currentTarget.value)}>
                <option value="">{t("fo_all_projects")}</option>
                {work.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 圖自己畫。一排長條加一條基線，圖表套件的體積比這件事大十倍 */}
            <div class="fo-chart" role="img" aria-label={t("fo_chart", String(span.value))}>
              {bars.map((b) => (
                <span key={b.day} class="bar" title={`${b.day} · ${minutes(b.ms)}`}>
                  <i style={{ height: `${(b.ms / peak) * 100}%` }} />
                </span>
              ))}
            </div>
            <span class="fo-peak">{t("fo_peak", String(minutes(peak)))}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Projects({ work, onChange }: { work: Workspace; onChange: (p: Partial<Workspace>) => void }) {
  const draft = useSignal("");
  const active = work.pomodoro.projectId;

  return (
    <div class="fo-projects">
      <b class="fo-h">{t("fo_projects")}</b>

      <form
        class="fo-newproj"
        onSubmit={(e) => {
          e.preventDefault();
          const made = makeProject(draft.value, work.projects);
          if (!made) return;
          onChange({ projects: [...work.projects, made] });
          draft.value = "";
        }}
      >
        <input
          type="text"
          value={draft.value}
          placeholder={t("fo_project_name")}
          aria-label={t("fo_project_name")}
          onInput={(e) => (draft.value = e.currentTarget.value)}
        />
        <button type="submit" disabled={!draft.value.trim()}>
          {t("cal_add")}
        </button>
      </form>

      <ul class="fo-list">
        {work.projects.map((pr) => (
          <li key={pr.id} class={pr.id === active ? "on" : undefined}>
            <i class="hue" style={{ background: `oklch(0.72 0.13 ${pr.hue})` }} />
            <span class="name">{pr.name}</span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  pomodoro: {
                    ...work.pomodoro,
                    projectId: pr.id === active ? null : pr.id,
                  },
                })
              }
            >
              {t(pr.id === active ? "fo_using" : "fo_use")}
            </button>
            <button
              type="button"
              class="rm"
              aria-label={t("fo_project_remove")}
              onClick={() =>
                onChange({
                  projects: work.projects.filter((x) => x.id !== pr.id),
                  // 紀錄留著，只是不再屬於任何專案 —— 刪一個分類不該讓
                  // 已經做過的時間跟著消失
                  sessions: work.sessions.map((s) =>
                    s.projectId === pr.id ? { ...s, projectId: null } : s,
                  ),
                  ...(active === pr.id
                    ? { pomodoro: { ...work.pomodoro, projectId: null } }
                    : {}),
                })
              }
            >
              ✕
            </button>
          </li>
        ))}
        {work.projects.length === 0 && <li class="empty">{t("fo_no_projects")}</li>}
      </ul>
    </div>
  );
}
