/**
 * 節氣：算太陽視黃經，不查表。
 *
 * 原本打算打一張 2026–2036 的日期表，但低精度的太陽位置公式（Meeus,
 * Astronomical Algorithms 第 25 章）只要三十行，誤差約 0.01 度 —— 換算成
 * 時間大約十五分鐘，而我們只需要「今天是哪個節氣」的日解析度。表要維護、
 * 會過期，公式不會。
 *
 * 節氣就是視黃經每跨十五度一個。春分定義為 0 度。
 */

const RAD = Math.PI / 180;

/** 儒略日。Date 內部就是 UTC 毫秒，直接換算，不碰時區。 */
function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * 太陽視黃經，度，已正規化到 [0, 360)。
 * 章動與光行差只取主項，對日解析度而言遠遠夠用。
 */
export function apparentLongitude(date: Date): number {
  const t = (julianDay(date) - 2451545) / 36525;

  // 幾何平黃經與平近點角
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const mRad = m * RAD;

  // 中心差
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(mRad) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * mRad) +
    0.000289 * Math.sin(3 * mRad);

  // 章動主項加光行差
  const omega = (125.04 - 1934.136 * t) * RAD;
  const lon = l0 + c - 0.00569 - 0.00478 * Math.sin(omega);

  return ((lon % 360) + 360) % 360;
}

/**
 * 二十四節氣，春分起算。索引 0 = 春分，每加一即黃經加十五度。
 * 名稱走 i18n 的 jq_0 到 jq_23。
 */
export function jieqiIndex(date: Date): number {
  return Math.floor(apparentLongitude(date) / 15) % 24;
}

/** 節氣在環上的連續位置，0 到 1。外環轉動吃這個值。 */
export function jieqiFraction(date: Date): number {
  return apparentLongitude(date) / 360;
}

/**
 * 英文版外環改用十二個傳統滿月名（Wolf、Snow…Cold），一個月一個。
 * 節氣在英語世界沒有對應物，月名是功能最接近的替代：一樣是天上的、
 * 一樣十二個、一樣不用連網。名稱走 i18n 的 moon_0 到 moon_11。
 */
export function moonIndex(date: Date): number {
  return date.getMonth();
}

export function moonFraction(date: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return (date.getMonth() + (date.getTime() - start) / (end - start)) / 12;
}
