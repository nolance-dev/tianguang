/**
 * 月曆格子裡的第二套曆法。
 *
 * 全部走 Intl，不自己算。農曆尤其 —— 自己算要嘛打一張會過期的表，
 * 要嘛把朔望和節氣重算一遍；ICU 早就有了，連閏月都對（2028 年那個
 * 閏五月它答得出來）。少寫的每一行都是少一個會錯的地方。
 */

import { t } from "./i18n";

export type SecondCal =
  "none" | "chinese" | "roc" | "japanese" | "islamic" | "hebrew";

export const SECOND_CALS: SecondCal[] = [
  "none",
  "chinese",
  "roc",
  "japanese",
  "islamic",
  "hebrew",
];

/**
 * 每一套曆法配一個語系。
 *
 * 不跟著介面語系走：農曆的月份名本來就是中文，而伊斯蘭曆用 ar-SA 會拿到
 * 阿拉伯數字（٢٠），對看不懂的人等於沒顯示。曆法的語系是曆法的屬性。
 */
const LOCALE: Record<Exclude<SecondCal, "none">, string> = {
  chinese: "zh-TW-u-ca-chinese",
  roc: "zh-TW-u-ca-roc",
  japanese: "ja-JP-u-ca-japanese",
  islamic: "en-u-ca-islamic",
  hebrew: "en-u-ca-hebrew",
};

/** 農曆的日子有自己的寫法。初一不是「1 日」。 */
export const CN_DAY = [
  "",
  "初一",
  "初二",
  "初三",
  "初四",
  "初五",
  "初六",
  "初七",
  "初八",
  "初九",
  "初十",
  "十一",
  "十二",
  "十三",
  "十四",
  "十五",
  "十六",
  "十七",
  "十八",
  "十九",
  "二十",
  "廿一",
  "廿二",
  "廿三",
  "廿四",
  "廿五",
  "廿六",
  "廿七",
  "廿八",
  "廿九",
  "三十",
];

export interface Sub {
  /** 格子裡那一行小字 */
  text: string;
  /** 是不是那一套曆法的月初。月初顯示月份名，比顯示「初一」有用 */
  lead: boolean;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string): Intl.DateTimeFormat {
  const hit = cache.get(locale);
  if (hit) return hit;
  // 建 formatter 不便宜，而一個月要跑四十二次
  const made = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
  });
  cache.set(locale, made);
  return made;
}

/**
 * 這一天在第二套曆法裡怎麼寫。
 *
 * 月初回月份名，其餘回日。四十二格全寫月份名會變成一面噪音，
 * 而「這個月從哪一天開始」才是看第二套曆法的人真正在找的東西。
 */
export function subDate(d: Date, cal: SecondCal): Sub | null {
  if (cal === "none") return null;
  /*
   * 民國和日本年號在格子裡沒有東西可寫。
   *
   * 它們跟西曆共用同一套月和日 —— 差的只有年怎麼稱呼（2026 = 民國 115 =
   * 令和 8）。所以逐格印「日」印出來的數字，跟格子上方那個西曆日期一模一樣，
   * 四十二格重複四十二次，等於一整面噪音。年份改到月份標題那裡去講一次
   * （calYear），格子留白。
   *
   * 農曆、伊斯蘭曆、希伯來曆不一樣：它們的月和日真的和西曆不同，逐格才有意義。
   */
  if (cal === "roc" || cal === "japanese") return null;
  try {
    const parts = formatter(LOCALE[cal]).formatToParts(d);
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    if (!Number.isFinite(day)) return null;
    if (day === 1 && month) return { text: month, lead: true };
    if (cal === "chinese")
      return { text: CN_DAY[day] ?? String(day), lead: false };
    return { text: String(day), lead: false };
  } catch {
    // 這個執行環境的 ICU 沒帶這套曆法。不顯示比顯示錯的好。
    return null;
  }
}

/**
 * 只換年份稱呼的那幾套曆法，要說的話就這一句。
 *
 * 民國 115 年、令和 8 年 —— 這是使用者選這套曆法時真正想看到的東西，
 * 而它一個月只需要說一次，不必每一格都講。
 */
/**
 * 月份標題旁邊那一句：這一個月在第二套曆法裡叫什麼。
 *
 * 這是「看不懂」的解藥。格子裡那個數字單看沒有意義 —— 伊斯蘭曆的 24 跟西曆的
 * 24 長得一模一樣，沒有人知道它是哪一套曆法的第 24 天。所以框架在標題講一次：
 *
 *   民國／日本年號 → 年怎麼稱呼（月和日跟西曆相同，格子留白）
 *   農曆／伊斯蘭曆／希伯來曆 → 這個月橫跨到的月份名（格子放日）
 *
 * 一個西曆月通常橫跨兩個陰曆月，所以要看月頭和月尾兩個名字，不同就都列出來。
 */
export function calLabel(d: Date, cal: SecondCal): string | null {
  if (cal === "none") return null;
  try {
    if (cal === "roc" || cal === "japanese") return eraYear(d, cal);
    const first = monthName(new Date(d.getFullYear(), d.getMonth(), 1), cal);
    const last = monthName(new Date(d.getFullYear(), d.getMonth() + 1, 0), cal);
    if (!first) return null;
    return last && last !== first ? `${first}／${last}` : first;
  } catch {
    return null;
  }
}

/**
 * 今天在第二套曆法裡怎麼念 —— 卡片上那一行。
 *
 * 跟格子不同，這裡只有一行，沒有標題可以交代框架，所以要自己講完整：
 * 伊斯蘭曆得帶月份名，不然又是一個裸數字。農曆的「廿四」自帶字形，
 * 一看就知道是農曆，不必再加月。
 */
export function calToday(d: Date, cal: SecondCal): string | null {
  if (cal === "none") return null;
  try {
    if (cal === "roc" || cal === "japanese") return eraYear(d, cal);
    const sub = subDate(d, cal);
    if (!sub) return null;
    if (cal === "chinese" || sub.lead) return sub.text;
    const month = monthName(d, cal);
    return month ? `${month} ${sub.text}` : sub.text;
  } catch {
    return null;
  }
}

function monthName(d: Date, cal: SecondCal): string | null {
  if (cal === "none") return null;
  const key = LOCALE[cal] + "|m";
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE[cal], { month: "long" });
    cache.set(key, f);
  }
  return f.formatToParts(d).find((p) => p.type === "month")?.value ?? null;
}

/**
 * 民國那三個字要自己接。
 *
 * Edge 的 ICU 對 zh-TW-u-ca-roc 根本不給 era —— era 設 short、long、narrow
 * 都一樣，formatToParts 裡連 era 那一項都沒有，拿到的永遠是「115年」。
 * 單看那個數字沒有人知道它是民國。（同一份程式碼在 Node 的 ICU 上會回
 * 「民國115年」，所以這件事只有在目標瀏覽器裡量才看得到。）
 *
 * 民國只有一個年號，補字是安全的。日本年號會換（令和、平成…），那個一定要
 * 讓 Intl 給，不能寫死 —— 而它本來就給得出來。
 */
function eraYear(d: Date, cal: "roc" | "japanese"): string | null {
  const key = LOCALE[cal] + "|y";
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE[cal], { era: "short", year: "numeric" });
    cache.set(key, f);
  }
  if (cal === "japanese") return f.format(d);
  const year = f.formatToParts(d).find((p) => p.type === "year")?.value;
  return year ? t("cal_roc_year", year) : null;
}
