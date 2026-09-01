/**
 * 月曆格子裡的第二套曆法。
 *
 * 全部走 Intl，不自己算。農曆尤其 —— 自己算要嘛打一張會過期的表，
 * 要嘛把朔望和節氣重算一遍；ICU 早就有了，連閏月都對（2028 年那個
 * 閏五月它答得出來）。少寫的每一行都是少一個會錯的地方。
 */

export type SecondCal = "none" | "chinese" | "roc" | "japanese" | "islamic" | "hebrew";

export const SECOND_CALS: SecondCal[] = ["none", "chinese", "roc", "japanese", "islamic", "hebrew"];

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
const CN_DAY = [
  "",
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
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
  const made = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" });
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
  try {
    const parts = formatter(LOCALE[cal]).formatToParts(d);
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    const month = parts.find((p) => p.type === "month")?.value ?? "";
    if (!Number.isFinite(day)) return null;
    if (day === 1 && month) return { text: month, lead: true };
    if (cal === "chinese") return { text: CN_DAY[day] ?? String(day), lead: false };
    return { text: String(day), lead: false };
  } catch {
    // 這個執行環境的 ICU 沒帶這套曆法。不顯示比顯示錯的好。
    return null;
  }
}
