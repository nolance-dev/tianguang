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

/*
 * 型別住在各自的模組裡，這裡只負責存。重複宣告會變成兩邊各改一次，
 * 而漏掉的那一邊要等到資料讀不回來才會被發現。
 */
import type { Event as AgendaEvent } from "./agenda";
import { today } from "./day";
import {
  DEFAULT_DURATIONS,
  durationMs,
  isFocus,
  normalizeDurations,
  ROUND,
  type Durations,
  type Mode,
  type Project,
  type Session,
} from "./focus";

export const WORKSPACE_VERSION = 1;

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

/** 舊版只有工作與休息兩種。休息在四模式裡對應短休。 */
export type PomodoroMode = Mode;

export interface Pomodoro {
  mode: Mode;
  /** 結束時刻的毫秒時間戳。null 代表沒在跑。 */
  endsAt: number | null;
  /** 暫停時剩下的毫秒。跑的時候是 null。 */
  pausedLeft: number | null;
  /** 今天完成了幾輪專注 */
  rounds: number;
  roundsDate: string;
  /** 這一段算在哪個專案上。null 是沒指定 */
  projectId: string | null;
  /** 這一段對著哪一件待辦。null 是沒指定 */
  todoId: string | null;
}

export interface Workspace {
  schemaVersion: number;
  todos: Todo[];
  note: string;
  pomodoro: Pomodoro;
  /** 日曆上的行程。型別在 agenda.ts，這裡只負責存。 */
  events: AgendaEvent[];
  /** 專注的專案分類 */
  projects: Project[];
  /** 每一段專注的紀錄。統計全部從這裡算出來，不另外存加總 */
  sessions: Session[];
  /** 各模式的長度，分鐘 */
  durations: Durations;
}

export const EMPTY: Workspace = {
  schemaVersion: WORKSPACE_VERSION,
  todos: [],
  note: "",
  pomodoro: {
    mode: "work",
    endsAt: null,
    pausedLeft: null,
    rounds: 0,
    roundsDate: "",
    projectId: null,
    todoId: null,
  },
  events: [],
  projects: [],
  sessions: [],
  durations: DEFAULT_DURATIONS,
};

export { today } from "./day";

/** 今日輪數跨日歸零。 */
export function roundsToday(w: Workspace, now = new Date()): number {
  return w.pomodoro.roundsDate === today(now) ? w.pomodoro.rounds : 0;
}

/**
 * 番茄鐘剩下多少毫秒。沒在跑就回整段長度，暫停就回暫停時的剩餘。
 *
 * 整段長度要從外面傳進來 —— 長度是使用者可以改的設定，
 * 讓這支函式自己去讀設定的話，它就得知道設定存在哪裡。
 */
/**
 * 這一段還剩多久。
 *
 * 上限夾在 total：剩餘時間不可能比這一段本身還長。沒有這個夾子的話，
 * 只要傳進來的 now 比 endsAt 的起算點早（畫面上那個時間戳晚一拍、或使用者
 * 改短了這個模式的長度），畫面就會出現「十五分鐘的倒數顯示 15:02」再跳回來。
 */
export function remaining(
  p: Pomodoro,
  now = Date.now(),
  total = FALLBACK,
): number {
  if (p.pausedLeft !== null) return Math.min(total, p.pausedLeft);
  if (p.endsAt === null) return total;
  return Math.max(0, Math.min(total, p.endsAt - now));
}

/** 沒傳長度時的退路：預設的工作長度。 */
const FALLBACK = durationMs("work", DEFAULT_DURATIONS);

export function isRunning(p: Pomodoro): boolean {
  return p.endsAt !== null && p.pausedLeft === null;
}

export function formatLeft(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 一段跑完就換邊。
 *
 * 專注（工作或強力）完了記一輪，然後進休息：每四輪一次長休，其餘短休。
 * 休息完回到工作 —— 不是回到「上一個專注模式」，因為強力那段之後再來一段
 * 強力多半不是使用者要的，要的話自己按一下就好。
 */
export function advance(p: Pomodoro, now = new Date()): Pomodoro {
  const done = isFocus(p.mode);
  const day = today(now);
  const rounds = done ? (p.roundsDate === day ? p.rounds : 0) + 1 : p.rounds;
  return {
    ...p,
    mode: done ? (rounds % ROUND === 0 ? "long" : "short") : "work",
    endsAt: null,
    pausedLeft: null,
    rounds,
    roundsDate: done ? day : p.roundsDate,
  };
}

export function start(
  p: Pomodoro,
  now = Date.now(),
  total = FALLBACK,
): Pomodoro {
  const left = p.pausedLeft ?? total;
  return { ...p, endsAt: now + left, pausedLeft: null };
}

export function pause(
  p: Pomodoro,
  now = Date.now(),
  total = FALLBACK,
): Pomodoro {
  if (!isRunning(p)) return p;
  return { ...p, pausedLeft: remaining(p, now, total), endsAt: null };
}

export function reset(p: Pomodoro): Pomodoro {
  return { ...p, endsAt: null, pausedLeft: null };
}

export function makeTodo(text: string): Todo | null {
  const t = text.trim();
  if (!t) return null;
  return {
    id: crypto.randomUUID(),
    text: t,
    done: false,
    createdAt: Date.now(),
  };
}

/* ---------- 儲存 ---------- */

const KEY = "tg.workspace";
const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;

export function migrate(raw: Record<string, unknown>): Workspace {
  // 之後每加一版在這裡接一段 if (v < N)
  return {
    ...EMPTY,
    ...raw,
    pomodoro: {
      ...EMPTY.pomodoro,
      ...((raw.pomodoro as Pomodoro) ?? {}),
      // 舊資料的 "rest" 在四個模式裡是短休
      mode:
        ((raw.pomodoro as Pomodoro)?.mode as string) === "rest"
          ? "short"
          : ((raw.pomodoro as Pomodoro)?.mode ?? "work"),
    },
    // 陣列要自己補：展開運算子只在鍵不存在時才用預設，
    // 舊資料裡沒有 events 這個鍵，但存成 null 的話也得接住
    events: Array.isArray(raw.events) ? (raw.events as AgendaEvent[]) : [],
    projects: Array.isArray(raw.projects) ? (raw.projects as Project[]) : [],
    sessions: Array.isArray(raw.sessions) ? (raw.sessions as Session[]) : [],
    durations: normalizeDurations(raw.durations),
    schemaVersion: WORKSPACE_VERSION,
  } as Workspace;
}

export async function load(): Promise<Workspace> {
  try {
    if (hasChrome) {
      const got = (await chrome.storage.local.get(KEY)) as Record<
        string,
        unknown
      >;
      return got[KEY]
        ? migrate(got[KEY] as Record<string, unknown>)
        : { ...EMPTY };
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
