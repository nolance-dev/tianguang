/**
 * 天氣。Open-Meteo，不需要金鑰、不需要註冊。
 *
 * 三件事決定了這裡的寫法：
 *
 * 1. 免費層限非商業用途，而且依 CC BY 4.0 **必須標註來源**。標註在設定頁的
 *    「關於」與天氣元件上，那是義務不是禮貌。
 * 2. 免費層沒有 SLA。所以一定要有快取與降級 —— 拿不到資料就顯示上一次成功
 *    的值加一個「離線」標記，不留空格子。
 * 3. 不送 IP 定位。座標來自使用者自己輸入的城市，網域權限也是那時候才要。
 */

const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const API = "https://api.open-meteo.com/v1/forecast";
const CACHE_KEY = "tg.weather";
import {
  CWA_ORIGINS,
  inTaiwan,
  nearestCwa,
  observationUrl,
  parseStations,
} from "./cwa";
import { METAR_ORIGINS, bboxUrl, nearestMetar, parseMetar } from "./metar";
import type { Station } from "./station";

const FRESH_MS = 30 * 60 * 1000;

/*
 * 打開天氣就一次要齊。
 *
 * 機場 METAR 也放進來 —— 它是免金鑰的那一層，不該為了它再彈第二次權限視窗。
 * 已經授權過舊清單的人不會自動拿到 aviationweather，那時 permissions.contains
 * 回 false，就安靜退回模式推算；重新開關一次天氣就補齊了。
 */
export const WEATHER_ORIGINS = [
  "https://api.open-meteo.com/*",
  "https://geocoding-api.open-meteo.com/*",
  "https://aviationweather.gov/*",
];

export interface Place {
  name: string;
  admin?: string;
  country?: string;
  /** ISO 3166-1 alpha-2。節日要用它挑行事曆 */
  countryCode?: string;
  lat: number;
  lon: number;
}

export interface Day {
  /** ISO 日期，yyyy-mm-dd */
  date: string;
  code: number;
  max: number;
  min: number;
}

export interface Weather {
  temp: number;
  /**
   * 這個氣溫是哪裡來的。
   *
   * model 是 Open-Meteo 的模式推算，station 是氣象署某個測站的實測。
   * 存起來是為了讓介面說得出口 —— 兩個數字可以差一兩度，使用者有權知道
   * 自己看的是哪一種，而不是自己去猜為什麼跟手機不一樣。
   */
  source?: "model" | "station";
  /** 實測時是哪一站。模式推算時沒有 */
  station?: string;
  feels: number;
  code: number;
  days: Day[];
  fetchedAt: number;
  /**
   * 這份資料是哪裡的。快取一定要帶座標 —— 沒有的話換了城市會沿用上一個城市
   * 還在保鮮期內的資料，台北和雪梨顯示同一個溫度。
   */
  lat: number;
  lon: number;
  /** 這份資料是不是快取來的舊資料。UI 要據此標「離線」。 */
  stale: boolean;
}

/**
 * WMO 天氣代碼歸成十類。
 * 原始表有近三十個碼，逐一翻譯對使用者沒有意義 ——「毛毛雨」和「中度毛毛雨」
 * 在一個角落的小元件裡是同一件事。回傳的是 i18n 鍵名。
 */
export function condition(code: number): string {
  if (code === 0) return "wx_clear";
  if (code <= 2) return "wx_partly";
  if (code === 3) return "wx_cloudy";
  if (code <= 48) return "wx_fog";
  if (code <= 57) return "wx_drizzle";
  if (code <= 67) return "wx_rain";
  if (code <= 77) return "wx_snow";
  if (code <= 82) return "wx_showers";
  if (code <= 86) return "wx_snow";
  return "wx_thunder";
}

export const toF = (c: number) => c * 1.8 + 32;

export function formatTemp(celsius: number, unit: "c" | "f"): string {
  return `${Math.round(unit === "f" ? toF(celsius) : celsius)}°`;
}

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "4",
  });
  return `${API}?${q}`;
}

export function geocodeUrl(name: string, language: string): string {
  const q = new URLSearchParams({
    name,
    count: "6",
    language: language.split("-")[0]!,
    format: "json",
  });
  return `${GEO}?${q}`;
}

interface RawForecast {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

export function parseForecast(
  raw: RawForecast,
  lat: number,
  lon: number,
  at = Date.now(),
): Weather {
  const d = raw.daily;
  return {
    temp: raw.current.temperature_2m,
    feels: raw.current.apparent_temperature,
    code: raw.current.weather_code,
    // 第 0 天是今天，元件只需要接下來三天
    days: d.time.slice(1, 4).map((date, i) => ({
      date,
      code: d.weather_code[i + 1]!,
      max: d.temperature_2m_max[i + 1]!,
      min: d.temperature_2m_min[i + 1]!,
    })),
    fetchedAt: at,
    lat,
    lon,
    stale: false,
  };
}

/**
 * Open-Meteo 的地名索引只吃羅馬拼音 —— 送「台北」回零筆，送「Taipei」才有，
 * 但帶 language=zh 時顯示名稱會回「台北市」。也就是說它支援中文顯示，
 * 不支援中文搜尋。
 *
 * 對一個以繁中為母語的產品來說，「打台北找不到」等於這個功能是壞的。
 * 所以內建一張常用城市對照表，涵蓋台灣各縣市與鄰近主要城市；
 * 表外的中文輸入會拿到一句提示，請使用者改打英文，而不是一個空清單。
 */
export const CITY_ALIASES: Record<string, string> = {
  台北: "Taipei",
  臺北: "Taipei",
  新北: "New Taipei",
  桃園: "Taoyuan",
  台中: "Taichung",
  臺中: "Taichung",
  台南: "Tainan",
  臺南: "Tainan",
  高雄: "Kaohsiung",
  基隆: "Keelung",
  新竹: "Hsinchu",
  嘉義: "Chiayi",
  苗栗: "Miaoli",
  彰化: "Changhua",
  南投: "Nantou",
  雲林: "Douliu",
  屏東: "Pingtung",
  宜蘭: "Yilan",
  花蓮: "Hualien",
  台東: "Taitung",
  臺東: "Taitung",
  澎湖: "Magong",
  金門: "Kinmen",
  馬祖: "Nangan",
  東京: "Tokyo",
  大阪: "Osaka",
  京都: "Kyoto",
  札幌: "Sapporo",
  福岡: "Fukuoka",
  名古屋: "Nagoya",
  橫濱: "Yokohama",
  横浜: "Yokohama",
  北京: "Beijing",
  上海: "Shanghai",
  廣州: "Guangzhou",
  广州: "Guangzhou",
  深圳: "Shenzhen",
  香港: "Hong Kong",
  澳門: "Macau",
  澳门: "Macau",
  成都: "Chengdu",
  杭州: "Hangzhou",
  南京: "Nanjing",
  西安: "Xi'an",
  首爾: "Seoul",
  首尔: "Seoul",
  釜山: "Busan",
  新加坡: "Singapore",
  曼谷: "Bangkok",
  吉隆坡: "Kuala Lumpur",
  河內: "Hanoi",
  胡志明市: "Ho Chi Minh City",
  馬尼拉: "Manila",
  紐約: "New York",
  倫敦: "London",
  巴黎: "Paris",
  柏林: "Berlin",
  慕尼黑: "Munich",
  羅馬: "Rome",
  馬德里: "Madrid",
  巴塞隆納: "Barcelona",
  阿姆斯特丹: "Amsterdam",
  洛杉磯: "Los Angeles",
  舊金山: "San Francisco",
  西雅圖: "Seattle",
  溫哥華: "Vancouver",
  多倫多: "Toronto",
  雪梨: "Sydney",
  墨爾本: "Melbourne",
  奧克蘭: "Auckland",
};

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/u;

export function hasCjk(s: string): boolean {
  return CJK.test(s);
}

/** 把中文城市名換成索引查得到的羅馬拼音。表裡沒有就原樣送出。 */
export function resolveCityQuery(input: string): string {
  const q = input.trim();
  // 「台北市」「台北車站」這種也要能對到，所以用前綴比對，長的優先
  const keys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (q === key || q.startsWith(key)) return CITY_ALIASES[key]!;
  }
  return q;
}

export async function geocode(
  name: string,
  language: string,
): Promise<Place[]> {
  const res = await fetch(geocodeUrl(resolveCityQuery(name), language));
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const json = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      country_code?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1,
    country: r.country,
    countryCode: r.country_code?.toUpperCase(),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;

async function readCache(): Promise<Weather | null> {
  try {
    if (hasChrome) {
      const got = (await chrome.storage.local.get(CACHE_KEY)) as Record<
        string,
        Weather
      >;
      return got[CACHE_KEY] ?? null;
    }
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Weather) : null;
  } catch {
    return null;
  }
}

async function writeCache(w: Weather): Promise<void> {
  try {
    if (hasChrome) await chrome.storage.local.set({ [CACHE_KEY]: w });
    else localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {
    // 快取寫不進去不影響顯示，這一次的資料還在記憶體裡
  }
}

/** 座標到小數第二位就夠分辨城市了，再細只會讓快取白白失效。 */
const sameSpot = (w: Weather, lat: number, lon: number) =>
  Math.abs(w.lat - lat) < 0.005 && Math.abs(w.lon - lon) < 0.005;

/**
 * 拿天氣。快取三十分鐘內直接用，過期才打網路。
 * 網路失敗時回傳快取並標成 stale —— 免費層沒有 SLA，空格子比舊資料難看得多。
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  now = Date.now(),
  key = "",
): Promise<Weather | null> {
  const cached = await readCache();
  // 只有同一個地點的快取才算數。別的城市的舊資料不是「舊」，是「錯」。
  const usable = cached && sameSpot(cached, lat, lon) ? cached : null;
  if (usable && now - usable.fetchedAt < FRESH_MS)
    return { ...usable, stale: false };

  try {
    const res = await fetch(forecastUrl(lat, lon));
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const parsed = parseForecast(
      (await res.json()) as RawForecast,
      lat,
      lon,
      now,
    );
    /*
     * 有金鑰就拿測站的實測值蓋掉模式推算的氣溫。
     *
     * 只蓋氣溫那一格 —— 預報三天、天氣代碼、體感都還是 Open-Meteo 的，
     * 氣象署那支觀測資料集沒有那些。蓋不成（沒金鑰、金鑰錯、人不在台灣、
     * 附近沒站、格式對不上）就維持原樣，天氣卡不會因此少一塊。
     */
    const observed = await observe(lat, lon, key);
    const merged = observed
      ? {
          ...parsed,
          temp: observed.temp,
          source: "station" as const,
          station: observed.name,
        }
      : { ...parsed, source: "model" as const };
    await writeCache(merged);
    return merged;
  } catch {
    return usable ? { ...usable, stale: true } : null;
  }
}

/**
 * 最近那一站的實測氣溫。任何一步不順就回 null，讓上層維持模式推算。
 *
 * 這裡刻意不丟例外也不記錄失敗：它是一個加分項，不是必要路徑。
 * 氣象署掛了、金鑰過期、對方改了欄位 —— 使用者該看到的仍然是天氣，
 * 不是一張壞掉的卡。
 */
async function observe(
  lat: number,
  lon: number,
  key: string,
): Promise<Station | null> {
  return (await fromCwa(lat, lon, key)) ?? (await fromMetar(lat, lon));
}

/** 第一層：氣象署。最準，但要使用者自己的金鑰，而且只有台灣 */
async function fromCwa(
  lat: number,
  lon: number,
  key: string,
): Promise<Station | null> {
  if (!key.trim() || !inTaiwan(lat, lon)) return null;
  try {
    if (!(await granted(CWA_ORIGINS))) return null;
    const res = await fetch(observationUrl(key.trim()));
    if (!res.ok) return null;
    return nearestCwa(parseStations(await res.json()), lat, lon);
  } catch {
    return null;
  }
}

/** 第二層：最近的機場。免金鑰、全球，代價是整數度、大約一小時一筆 */
async function fromMetar(lat: number, lon: number): Promise<Station | null> {
  try {
    if (!(await granted(METAR_ORIGINS))) return null;
    const res = await fetch(bboxUrl(lat, lon));
    if (!res.ok) return null;
    return nearestMetar(parseMetar(await res.json()), lat, lon);
  } catch {
    return null;
  }
}

/** 開發模式沒有 chrome.permissions，那時候一律當作有 */
async function granted(origins: string[]): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  return chrome.permissions.contains({ origins });
}

/** 只有使用者按下開關那一刻才要網域權限，而且要在使用者手勢裡呼叫。 */
export async function requestAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true; // 開發模式
  return chrome.permissions.request({ origins: WEATHER_ORIGINS });
}

export async function hasAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  return chrome.permissions.contains({ origins: WEATHER_ORIGINS });
}
