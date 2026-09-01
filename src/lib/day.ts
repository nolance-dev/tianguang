/**
 * 當地日期字串。
 *
 * 自己一個模組，因為工作區、行程、專注統計都要用它 —— 放在其中一個裡面，
 * 另外兩個就得回頭 import 那一個，而那一個又要 import 它們，
 * 變成迴圈：模組初始化時有一邊的常數還是 undefined。
 */

/** 當地日期。用 UTC 會讓「今天」在台灣早上八點前算成昨天。 */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
