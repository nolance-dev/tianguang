/**
 * 盤邊的曆書欄要的那幾個數。
 *
 * 全部從已經有的太陽黃經和日出日落推出來，不多要一個資料來源 ——
 * 盤面上寫的每一個字都得跟盤面本身是同一套算法算出來的，
 * 否則會出現「弧上寫日落 18:13、旁邊那欄寫 18:07」這種自己打自己的事。
 */

import { apparentLongitude, jieqiIndex } from "./solar";
import { CN_DAY } from "./secondcal";

/**
 * 晝長，小時。
 *
 * sunTimes 的日出日落都繞回 [0, 24)，跨午夜時日落會小於日出，
 * 所以要模減，直接相減會拿到負數。
 */
export function daylight(sunrise: number, sunset: number): number {
  return (((sunset - sunrise) % 24) + 24) % 24;
}

/** 七十二候。一個節氣十五度分三候：0 初候、1 次候、2 末候。 */
export function houIndex(date: Date): number {
  const within = apparentLongitude(date) % 15;
  return Math.min(2, Math.floor((within / 15) * 3));
}

/**
 * 距下一個節氣還有幾天。
 *
 * 太陽一天走約 0.9856 度，節氣之間十五度，所以答案落在十四到十六天。
 * 誤差半天上下 —— 地球軌道是橢圓的，近日點附近走得快些。要準到小時
 * 得去解克卜勒方程，為了盤邊一行小字不值得。
 */
export function daysToNextJieqi(date: Date): number {
  const rest = 15 - (apparentLongitude(date) % 15);
  return Math.max(1, Math.round(rest / 0.9856));
}

/**
 * 當令的是哪一象：0 青龍、1 玄武、2 白虎、3 朱雀 —— 順序照 FourSymbols 裡的排法。
 *
 * 二十八宿分四象本來就是分四季的。節氣索引 0 是春分，立春在 315 度也就是索引 21，
 * 所以春天是 21、22、23、0、1、2 這六個節氣，其後每六個換一季。
 */
export function seasonSymbol(date: Date): number {
  const season = Math.floor((((jieqiIndex(date) + 3) % 24) / 6)); // 0 春 1 夏 2 秋 3 冬
  return [0, 3, 2, 1][season]; // 春青龍、夏朱雀、秋白虎、冬玄武
}

let fmt: Intl.DateTimeFormat | null = null;

/**
 * 農曆日期，例如「七月二十」。閏月 ICU 自己會寫成「閏七月」。
 *
 * 這個執行環境的 ICU 沒帶農曆就回 null —— 盤邊少一行，比寫錯一行好。
 */
export function lunarDate(d: Date): string | null {
  try {
    fmt ??= new Intl.DateTimeFormat("zh-TW-u-ca-chinese", { month: "long", day: "numeric" });
    const parts = fmt.formatToParts(d);
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    if (!month || !Number.isFinite(day)) return null;
    return month + (CN_DAY[day] ?? String(day));
  } catch {
    return null;
  }
}
