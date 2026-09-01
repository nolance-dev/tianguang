/**
 * 行程。
 *
 * 日期一律存 `YYYY-MM-DD` 的當地日期字串，不存時間戳 —— 「9 月 1 日」
 * 是一個格子，不是一個瞬間。存時間戳的話換一個時區看，整排就位移一天。
 * 時間另外存 `HH:MM`，空字串代表整天的事。
 */

import { today } from "./day";

export interface Event {
  id: string;
  /** 當地日期 YYYY-MM-DD */
  date: string;
  /** HH:MM，空字串是整天 */
  time: string;
  text: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 空白的、日期不合格式的都不建立。回 null 讓呼叫端自己決定要不要提示。 */
export function makeEvent(date: string, time: string, text: string): Event | null {
  const body = text.trim();
  if (!body || !DATE.test(date)) return null;
  return {
    id: crypto.randomUUID(),
    date,
    time: TIME.test(time) ? time : "",
    text: body,
  };
}

/** 某一天的行程。整天的排在最前面，其餘照時間。 */
export function onDay(events: Event[], date: string): Event[] {
  return events
    .filter((e) => e.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.text.localeCompare(b.text));
}

/**
 * 依日期分組，每組已排好。
 *
 * 月曆一次要畫四十二格，每一格都拿整份行程過濾一次是四十二趟；
 * 先分一次組，畫的時候只是查表。
 */
export function byDay(events: Event[]): Map<string, Event[]> {
  const out = new Map<string, Event[]>();
  for (const e of events) {
    const bucket = out.get(e.date);
    if (bucket) bucket.push(e);
    else out.set(e.date, [e]);
  }
  for (const bucket of out.values()) {
    bucket.sort((a, b) => a.time.localeCompare(b.time) || a.text.localeCompare(b.text));
  }
  return out;
}

/**
 * 一個月的格子。永遠是六列乘七欄，一週從星期一起算。
 *
 * 固定六列不是為了整齊 —— 是為了格子高度不要每個月變一次。
 * 五列的月份跟六列的月份輪流出現時，整塊面板會忽高忽低。
 */
export function monthGrid(year: number, month: number): Date[] {
  // getDay() 星期日是 0，我們要星期一是 0
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  // 直接用「這個月的第 n 天」去偏移，Date 自己會處理跨月跨年。
  // 先算出起始日再拿它的 getDate() 是錯的 —— 那個數字是「上個月的 31 號」，
  // 拿回這個月來算就變成下下個月了。
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - lead + i));
}

/**
 * ISO 週數。週一起算，含當年第一個週四的那一週是第一週。
 *
 * 不自己用「一月一日算第一週」那套 —— 跨年那幾天會算出第五十三或第零週，
 * 而月曆左邊那一欄寫著 0 比不寫還糟。
 */
export function isoWeek(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 挪到那一週的星期四：ISO 規定一週屬於它星期四所在的那一年
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const first = new Date(d.getFullYear(), 0, 4);
  first.setDate(first.getDate() + 3 - ((first.getDay() + 6) % 7));
  return 1 + Math.round((d.getTime() - first.getTime()) / (7 * 86400000));
}

/** 往前或往後 n 個月。用 1 號當基準，才不會在 1/31 往後跳成 3/3。 */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(year, month + delta, 1);
  return [d.getFullYear(), d.getMonth()];
}

export const ymd = today;
