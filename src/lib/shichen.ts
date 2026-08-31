/**
 * 十二時辰。
 *
 * 子時橫跨午夜（23:00–01:00），所以索引不是直接除以二 —— 先把時鐘往前推
 * 一小時再切，子時才會落在 0。這裡只做數學，名稱一律走 chrome.i18n，
 * 因為中日文用地支、英文版用光相，是同一組索引的兩套語彙。
 */

export const SHICHEN_COUNT = 12;

/** 第 k 個時辰的中心時刻（子時中心在 0 點）。 */
export function centerHour(index: number): number {
  return (index * 2) % 24;
}

/** 第 k 個時辰的起訖，起點含、終點不含。子時回傳 [23, 1]。 */
export function range(index: number): [number, number] {
  const start = (index * 2 + 23) % 24;
  return [start, (start + 2) % 24];
}

/** 現在是第幾個時辰。0 = 子。 */
export function indexAt(date: Date): number {
  return Math.floor(((date.getHours() + 1) % 24) / 2);
}

/**
 * 一天之內的連續位置，0 到 1。子時中心對應 0。
 * 時辰盤與背景插值都吃這個值，別各自再算一次。
 */
export function dayFraction(date: Date): number {
  const h =
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600 +
    date.getMilliseconds() / 3600000;
  return (h % 24) / 24;
}

/** 小數形式的當下時刻，背景引擎用。 */
export function decimalHour(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/** 問候語分四段：晨、午、晚、深夜。索引對應 i18n 的 greet_* 鍵。 */
export type GreetSlot = "dawn" | "day" | "dusk" | "night";

export function greetSlot(index: number): GreetSlot {
  if (index >= 2 && index <= 4) return "dawn";
  if (index >= 5 && index <= 7) return "day";
  if (index >= 8 && index <= 10) return "dusk";
  return "night";
}
