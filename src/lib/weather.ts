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
const FRESH_MS = 30 * 60 * 1000;

export const WEATHER_ORIGINS = [
  "https://api.open-meteo.com/*",
  "https://geocoding-api.open-meteo.com/*",
];

export interface Place {
  name: string;
  admin?: string;
  country?: string;
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
  feels: number;
  code: number;
  days: Day[];
  fetchedAt: number;
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
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
}

export function parseForecast(raw: RawForecast, at = Date.now()): Weather {
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
    stale: false,
  };
}

export async function geocode(name: string, language: string): Promise<Place[]> {
  const res = await fetch(geocodeUrl(name, language));
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const json = (await res.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    admin: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }));
}

const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;

async function readCache(): Promise<Weather | null> {
  try {
    if (hasChrome) {
      const got = (await chrome.storage.local.get(CACHE_KEY)) as Record<string, Weather>;
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

/**
 * 拿天氣。快取三十分鐘內直接用，過期才打網路。
 * 網路失敗時回傳快取並標成 stale —— 免費層沒有 SLA，空格子比舊資料難看得多。
 */
export async function fetchWeather(lat: number, lon: number, now = Date.now()): Promise<Weather | null> {
  const cached = await readCache();
  if (cached && now - cached.fetchedAt < FRESH_MS) return { ...cached, stale: false };

  try {
    const res = await fetch(forecastUrl(lat, lon));
    if (!res.ok) throw new Error(`forecast ${res.status}`);
    const parsed = parseForecast((await res.json()) as RawForecast, now);
    await writeCache(parsed);
    return parsed;
  } catch {
    return cached ? { ...cached, stale: true } : null;
  }
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
