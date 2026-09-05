/**
 * 專注時段：模式、專案、每一段的紀錄，以及統計。
 *
 * 番茄鐘本來只有「工作／休息」兩個模式和一個結束時刻。要有統計就得留下
 * 每一段的紀錄 —— 一段一筆，記開始時刻、實際長度、算在哪個專案上。
 * 只記「今天做了幾分鐘」是不夠的：那個數字沒辦法回頭切成專案，也沒辦法
 * 畫出上週的樣子，而那正是統計要回答的兩件事。
 */

import { today } from "./day";

export type Mode = "work" | "short" | "long" | "power";

export const MODES: Mode[] = ["work", "short", "long", "power"];

/** 預設長度（分鐘）。使用者可以改，存在設定裡。 */
export interface Durations {
  work: number;
  short: number;
  long: number;
  power: number;
}

export const DEFAULT_DURATIONS: Durations = {
  work: 25,
  short: 5,
  long: 15,
  power: 50,
};

/** 幾輪工作之後換長休 */
export const ROUND = 4;

/** 休息不是專注 —— 統計只算工作與強力那兩種。 */
export const isFocus = (mode: Mode): boolean =>
  mode === "work" || mode === "power";

export function durationMs(mode: Mode, d: Durations): number {
  const minutes = Math.min(
    180,
    Math.max(1, Math.round(d[mode] ?? DEFAULT_DURATIONS[mode])),
  );
  return minutes * 60_000;
}

export function normalizeDurations(raw: unknown): Durations {
  const r = (raw ?? {}) as Partial<Record<Mode, unknown>>;
  const one = (mode: Mode): number => {
    const v = r[mode];
    const n =
      typeof v === "number" && Number.isFinite(v)
        ? Math.round(v)
        : DEFAULT_DURATIONS[mode];
    return Math.min(180, Math.max(1, n));
  };
  return {
    work: one("work"),
    short: one("short"),
    long: one("long"),
    power: one("power"),
  };
}

/* ---------- 專案 ---------- */

export interface Project {
  id: string;
  name: string;
  /** 色票索引，不存色碼 —— 換配色時色碼會跟主題打架 */
  hue: number;
}

/** 專案的顏色。存索引而不是色碼，暗底亮底各給一組才不會有一個看不見。 */
export const HUES = [8, 42, 96, 168, 210, 268, 320];

export function makeProject(name: string, taken: Project[]): Project | null {
  const label = name.trim();
  if (!label) return null;
  return {
    id: crypto.randomUUID(),
    name: label.slice(0, 40),
    hue: HUES[taken.length % HUES.length]!,
  };
}

/* ---------- 每一段的紀錄 ---------- */

export interface Session {
  id: string;
  /** 這一段結束的時刻 */
  at: number;
  /** 實際專注了多久（毫秒）。提早提交的話就是提交當下的長度 */
  ms: number;
  mode: Mode;
  projectId: string | null;
}

/** 太短的不記。滑一下就按到開始再按重設，那不是一段專注。 */
export const MIN_SESSION_MS = 60_000;

export function makeSession(
  ms: number,
  mode: Mode,
  projectId: string | null,
  at = Date.now(),
): Session | null {
  if (!isFocus(mode) || ms < MIN_SESSION_MS) return null;
  return { id: crypto.randomUUID(), at, ms: Math.round(ms), mode, projectId };
}

/* ---------- 統計 ---------- */

const dayOf = (at: number): string => today(new Date(at));

export function msOnDay(
  sessions: Session[],
  day: string,
  projectId?: string | null,
): number {
  let sum = 0;
  for (const s of sessions) {
    if (dayOf(s.at) !== day) continue;
    if (projectId !== undefined && s.projectId !== projectId) continue;
    sum += s.ms;
  }
  return sum;
}

export function totalMs(
  sessions: Session[],
  projectId?: string | null,
): number {
  let sum = 0;
  for (const s of sessions) {
    if (projectId !== undefined && s.projectId !== projectId) continue;
    sum += s.ms;
  }
  return sum;
}

export function countOnDay(sessions: Session[], day: string): number {
  return sessions.filter((s) => dayOf(s.at) === day).length;
}

export interface Bar {
  day: string;
  ms: number;
}

/**
 * 最近 n 天的柱狀圖資料，舊的在前。
 *
 * 沒有紀錄的那一天也要有一根高度為零的柱子 —— 跳過空日的話，
 * 圖上「連續五天」和「五天裡有做的那五天」長得一模一樣。
 */
export function lastDays(
  sessions: Session[],
  days: number,
  end = new Date(),
  projectId?: string | null,
): Bar[] {
  const out: Bar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    const day = today(d);
    out.push({ day, ms: msOnDay(sessions, day, projectId) });
  }
  return out;
}

/** 顯示用：毫秒轉「Xh Ym」或「X 分鐘」的分鐘數。 */
export function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function clock(ms: number): string {
  const total = Math.round(ms / 60_000);
  const h = Math.floor(total / 60);
  return `${String(h).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
