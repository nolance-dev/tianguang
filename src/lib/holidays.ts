/**
 * 當地節日。
 *
 * 來源是 Google 的公開節日行事曆（ICS）。挑它不是因為它最漂亮，是因為
 * 它涵蓋台灣 —— Nager.Date 的 JSON 乾淨、用 ISO 國碼、一次給兩百零四個國家，
 * 但它沒有 TW、MO、IN、TH、MY。使用者人在台北，那個缺口不是小事。
 *
 * 行事曆的代號沒有規律：有的是 ISO 國碼（en.th、en.ae），有的是名字
 * （en.taiwan、en.usa、en.mexican），而 en.tw、en.us、en.jp 全部是 500。
 * 下面那張表是一個一個拉過確認的，不是猜的。
 */

import { today } from "./day";

/** 只有抓行事曆需要。圖磚那種 <img> 不用，這個是 fetch。 */
export const HOLIDAY_ORIGINS = ["https://calendar.google.com/*"];

/**
 * ISO 3166-1 alpha-2 → Google 行事曆代號的後半段。
 * 前面的語系可以換（zh-tw.taiwan、ja.taiwan 都成立），所以只存後半。
 */
export const FEEDS: Record<string, string> = {
  AE: "ae", AR: "ar", AT: "austrian", AU: "australian", BE: "be",
  BR: "brazilian", CA: "canadian", CH: "ch", CL: "cl", CN: "china",
  CO: "co", CZ: "czech", DE: "german", DK: "danish", EG: "eg",
  ES: "spain", FI: "finnish", FR: "french", GB: "uk", HK: "hong_kong",
  ID: "indonesian", IE: "irish", IL: "jewish", IN: "indian", IT: "italian",
  JP: "japanese", KR: "south_korea", MO: "mo", MX: "mexican", MY: "malaysia",
  NL: "dutch", NO: "norwegian", NZ: "new_zealand", PH: "philippines",
  PL: "polish", PT: "portuguese", RU: "russian", SA: "sa", SE: "swedish",
  SG: "singapore", TH: "th", TR: "turkish", TW: "taiwan", UA: "ukrainian",
  US: "usa", VN: "vietnamese",
};

export const supported = (cc: string): boolean => cc.toUpperCase() in FEEDS;

export interface Holiday {
  /** 當地日期 YYYY-MM-DD */
  date: string;
  name: string;
}

export function feedUrl(cc: string, lang: string): string | null {
  const slug = FEEDS[cc.toUpperCase()];
  if (!slug) return null;
  const id = `${lang}.${slug}#holiday@group.v.calendar.google.com`;
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`;
}

/**
 * 從 ICS 挑出整天的事件。
 *
 * 只認 DTSTART;VALUE=DATE 那種 —— 節日是一整天，帶時刻的那些是別的東西。
 * ICS 會折行：續行以空白或 tab 開頭，得先接回去，否則長的節日名會被切一半。
 */
export function parseIcs(text: string): Holiday[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  const out: Holiday[] = [];
  let date: string | null = null;
  let name: string | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      date = null;
      name = null;
      continue;
    }
    if (line === "END:VEVENT") {
      if (date && name) out.push({ date, name });
      continue;
    }
    const at = line.indexOf(":");
    if (at < 0) continue;
    const key = line.slice(0, at);
    const value = line.slice(at + 1);
    if (key.startsWith("DTSTART") && key.includes("VALUE=DATE") && /^\d{8}$/.test(value)) {
      date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    } else if (key === "SUMMARY" || key.startsWith("SUMMARY;")) {
      // ICS 用反斜線跳脫逗號、分號與換行
      name = value.replace(/\\([,;\\])/g, "$1").replace(/\\n/gi, " ").trim();
    }
  }
  return out;
}

/** 日期 → 那天的節日名。同一天可能有兩個（例如補假撞到節氣）。 */
export function byDate(list: Holiday[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const h of list) {
    const bucket = out.get(h.date);
    if (bucket) bucket.push(h.name);
    else out.set(h.date, [h.name]);
  }
  return out;
}

/* ---------- 取得與快取 ---------- */

const KEY = "tg.holidays";
/** 節日一年只變一次，但補假會補公告，一個月重抓一次夠了。 */
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

interface Cached {
  cc: string;
  lang: string;
  at: number;
  list: Holiday[];
}

const hasChrome = (): boolean => typeof chrome !== "undefined" && !!chrome.storage;

async function read(): Promise<Cached | null> {
  try {
    if (hasChrome()) {
      const got = (await chrome.storage.local.get(KEY)) as Record<string, unknown>;
      return (got[KEY] as Cached) ?? null;
    }
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

async function write(value: Cached): Promise<void> {
  try {
    if (hasChrome()) await chrome.storage.local.set({ [KEY]: value });
    else localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // 配額滿或無痕視窗。抓來的東西這次還能用，只是下次要重抓。
  }
}

/**
 * 某個國家的節日。
 *
 * 先給快取再背景更新 —— 節日不是即時資料，為了它讓日曆空著半秒不值得。
 * 抓不到就用舊的；連舊的都沒有就回空陣列，日曆照常畫。
 */
export async function loadHolidays(cc: string, lang: string, now = Date.now()): Promise<Holiday[]> {
  const cached = await read();
  const fresh = cached && cached.cc === cc && cached.lang === lang && now - cached.at < STALE_MS;
  if (fresh) return cached.list;

  const url = feedUrl(cc, lang);
  if (!url) return cached?.cc === cc ? cached.list : [];

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const list = parseIcs(await res.text());
    if (list.length === 0) throw new Error("empty");
    await write({ cc, lang, at: now, list });
    return list;
  } catch {
    return cached?.cc === cc ? cached.list : [];
  }
}

/** 只留今年前後各一年的，畫月曆用不到 2015 年的行憲紀念日。 */
export function around(list: Holiday[], year = new Date().getFullYear()): Holiday[] {
  const lo = `${year - 1}-01-01`;
  const hi = `${year + 1}-12-31`;
  return list.filter((h) => h.date >= lo && h.date <= hi);
}

export const todayKey = today;

/**
 * 有沒有連線抓節日的權限。
 *
 * 不在擴充功能裡就是沒有 —— 這一點跟雷達不同。RainViewer 是公開 API，
 * 會回 CORS 標頭，開發伺服器上照抓；Google 的 ICS 不會，只有帶著
 * host permission 的擴充功能繞得過去。回 true 只會讓開發模式與測試
 * 對著一個注定失敗的網址發請求。
 */
export async function hasHolidayAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  return chrome.permissions.contains({ origins: HOLIDAY_ORIGINS });
}

/** 必須在使用者手勢裡呼叫。 */
export async function requestHolidayAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  try {
    return await chrome.permissions.request({ origins: HOLIDAY_ORIGINS });
  } catch {
    return false;
  }
}
