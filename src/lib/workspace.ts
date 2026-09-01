/**
 * 工作區：待辦、隨手記、番茄鐘。
 *
 * 這些東西走 chrome.storage.local，不走 sync —— 待辦和筆記會長大，
 * sync 每項 8KB、總計 100KB，塞不了多久就會靜默寫失敗。
 * 代價是不跨裝置，設定頁會寫明。
 *
 * 番茄鐘只存一個結束時刻。任何分頁自己算剩多久，所以關掉分頁再開回來
 * 計時仍然是對的 —— 不需要 service worker，也就不必多要一個權限。
 */

/** 行程的型別住在 agenda.ts；這裡只負責存它，重複宣告會變成兩邊各改一次。 */
import type { Event as AgendaEvent } from "./agenda";

export const WORKSPACE_VERSION = 1;

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export type PomodoroMode = "work" | "rest";

export interface Pomodoro {
  mode: PomodoroMode;
  /** 結束時刻的毫秒時間戳。null 代表沒在跑。 */
  endsAt: number | null;
  /** 暫停時剩下的毫秒。跑的時候是 null。 */
  pausedLeft: number | null;
  /** 今天完成了幾輪工作 */
  rounds: number;
  roundsDate: string;
}

export interface Workspace {
  schemaVersion: number;
  todos: Todo[];
  note: string;
  pomodoro: Pomodoro;
  /** 日曆上的行程。型別在 agenda.ts，這裡只負責存。 */
  events: AgendaEvent[];
}

export const WORK_MS = 25 * 60 * 1000;
export const REST_MS = 5 * 60 * 1000;

export const EMPTY: Workspace = {
  schemaVersion: WORKSPACE_VERSION,
  todos: [],
  note: "",
  pomodoro: { mode: "work", endsAt: null, pausedLeft: null, rounds: 0, roundsDate: "" },
  events: [],
};

/** 當地日期。用 UTC 會讓「今天」在台灣早上八點前算成昨天。 */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 今日輪數跨日歸零。 */
export function roundsToday(w: Workspace, now = new Date()): number {
  return w.pomodoro.roundsDate === today(now) ? w.pomodoro.rounds : 0;
}

/** 番茄鐘剩下多少毫秒。沒在跑就回整段長度，暫停就回暫停時的剩餘。 */
export function remaining(p: Pomodoro, now = Date.now()): number {
  if (p.pausedLeft !== null) return p.pausedLeft;
  if (p.endsAt === null) return p.mode === "work" ? WORK_MS : REST_MS;
  return Math.max(0, p.endsAt - now);
}

export function isRunning(p: Pomodoro): boolean {
  return p.endsAt !== null && p.pausedLeft === null;
}

export function formatLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 一段跑完就換邊：工作完進休息並記一輪，休息完回工作。 */
export function advance(p: Pomodoro, now = new Date()): Pomodoro {
  const finishedWork = p.mode === "work";
  const day = today(now);
  return {
    mode: finishedWork ? "rest" : "work",
    endsAt: null,
    pausedLeft: null,
    rounds: finishedWork ? (p.roundsDate === day ? p.rounds : 0) + 1 : p.rounds,
    roundsDate: finishedWork ? day : p.roundsDate,
  };
}

export function start(p: Pomodoro, now = Date.now()): Pomodoro {
  const left = p.pausedLeft ?? (p.mode === "work" ? WORK_MS : REST_MS);
  return { ...p, endsAt: now + left, pausedLeft: null };
}

export function pause(p: Pomodoro, now = Date.now()): Pomodoro {
  if (!isRunning(p)) return p;
  return { ...p, pausedLeft: remaining(p, now), endsAt: null };
}

export function reset(p: Pomodoro): Pomodoro {
  return { ...p, endsAt: null, pausedLeft: null };
}

export function makeTodo(text: string): Todo | null {
  const t = text.trim();
  if (!t) return null;
  return { id: crypto.randomUUID(), text: t, done: false, createdAt: Date.now() };
}

/* ---------- 儲存 ---------- */

const KEY = "tg.workspace";
const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;

export function migrate(raw: Record<string, unknown>): Workspace {
  // 之後每加一版在這裡接一段 if (v < N)
  return {
    ...EMPTY,
    ...raw,
    pomodoro: { ...EMPTY.pomodoro, ...((raw.pomodoro as Pomodoro) ?? {}) },
    // 陣列要自己補：展開運算子只在鍵不存在時才用預設，
    // 舊資料裡沒有 events 這個鍵，但存成 null 的話也得接住
    events: Array.isArray(raw.events) ? (raw.events as AgendaEvent[]) : [],
    schemaVersion: WORKSPACE_VERSION,
  } as Workspace;
}

export async function load(): Promise<Workspace> {
  try {
    if (hasChrome) {
      const got = (await chrome.storage.local.get(KEY)) as Record<string, unknown>;
      return got[KEY] ? migrate(got[KEY] as Record<string, unknown>) : { ...EMPTY };
    }
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;
let latest: Workspace | undefined;

/** 打字時每個字都寫一次太吵，debounce 400ms。 */
export function save(w: Workspace): void {
  latest = w;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    const value = latest!;
    try {
      if (hasChrome) void chrome.storage.local.set({ [KEY]: value });
      else localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
      // local 也滿了才會走到這裡。內容還在記憶體，下次寫入會再試。
    }
  }, 400);
}
