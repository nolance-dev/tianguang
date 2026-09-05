/**
 * 中央氣象署的測站實測值。
 *
 * 為什麼要它：Open-Meteo 給的是模式推算的 2 公尺氣溫，不是溫度計的讀數。
 * 實測過台北五個點，其中四個吸附到同一個網格（25.0615, 121.5194），回傳值
 * 只差 0.4 度；換 jma／ecmwf／gfs 三個模型也只差 0.3 度。也就是說我們送
 * 什麼參數都改變不了它跟測站之間的差距 —— 台北是熱島，夜裡測站本來就比
 * 粗網格暖上一兩度。要對得上手機看到的數字，只能拿實測。
 *
 * 代價：氣象署的開放資料要金鑰，而且是每個使用者自己申請的（免費）。
 * 沒填金鑰、金鑰錯了、格式跟我們認得的不一樣、或是人不在台灣 ——
 * 任何一種情況都安靜退回 Open-Meteo，天氣卡不會因此壞掉。
 */

/** 局屬有人測站的現在天氣觀測。自動站是 O-A0001-001，欄位一樣走下面那條解析 */
import { nearest, type Station } from "./station";

const DATASET = "O-A0003-001";
const API = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${DATASET}`;

export const CWA_ORIGINS = ["https://opendata.cwa.gov.tw/*"];

/** 氣象署的測站很密，超過三十公里就不算「這裡」了 */
const MAX_KM = 30;

/**
 * 台灣（含離島）的大概範圍。
 *
 * 人不在台灣就不必打這支 API —— 氣象署只有台灣的測站，在東京問它只會拿到
 * 一個幾百公里外的測站，比模式推算還糟。範圍放寬到涵蓋澎湖金馬與蘭嶼。
 */
export function inTaiwan(lat: number, lon: number): boolean {
  return lat >= 21.5 && lat <= 26.5 && lon >= 118.0 && lon <= 122.5;
}

/**
 * 把回應挖成測站清單。
 *
 * 寫得鬆是刻意的：這支 API 的欄位名稱改過（舊版是 records.location 配
 * 一個 weatherElement 陣列，新版是 records.Station 配具名欄位），而且
 * 缺值是用 -99／-999 表示而不是 null。認不出來就回空陣列，讓上層退回
 * Open-Meteo —— 一個第三方改欄位不該讓使用者的天氣卡整個消失。
 */
export function parseStations(raw: unknown): Station[] {
  const records = (raw as { records?: Record<string, unknown> })?.records;
  if (!records) return [];
  const rows = (records.Station ?? records.location ?? []) as unknown[];
  if (!Array.isArray(rows)) return [];

  const out: Station[] = [];
  for (const row of rows) {
    // 陣列裡塞 null 是會發生的。先擋，不然下一行就丟例外
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = str(r.StationName ?? r.locationName);
    const geo = r.GeoInfo as { Coordinates?: unknown } | undefined;
    const lat = num(r.lat ?? pick(geo?.Coordinates, "StationLatitude"));
    const lon = num(r.lon ?? pick(geo?.Coordinates, "StationLongitude"));
    const temp = num(
      pick(r.WeatherElement, "AirTemperature") ??
        element(r.weatherElement, "TEMP"),
    );
    // -99 / -999 是氣象署的缺值，不是零下九十九度
    if (!name || lat === null || lon === null || temp === null || temp < -50)
      continue;
    out.push({ name, lat, lon, temp });
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * 新版：具名欄位，但座標藏在一個陣列裡。
 *
 * 那個陣列是 [{CoordinateName:"TWD97", …}, {CoordinateName:"WGS84", …}]，
 * 而 TWD97 排在前面 —— 拿第一個符合的會得到二度分帶座標（測試裡那筆是 0），
 * 整個定位就毀了。有 CoordinateName 的時候一定要指名 WGS84。
 */
function pick(v: unknown, key: string): unknown {
  if (!v) return undefined;
  if (!Array.isArray(v)) return (v as Record<string, unknown>)[key];

  const wgs = v.find(
    (item) => (item as Record<string, unknown>)?.CoordinateName === "WGS84",
  );
  if (wgs) return (wgs as Record<string, unknown>)[key];
  // 沒有標示座標系的話才退回「第一個有這個鍵的」
  for (const item of v) {
    const hit = (item as Record<string, unknown>)?.[key];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** 舊版：weatherElement: [{elementName:"TEMP", elementValue:"27.5"}, …] */
function element(v: unknown, name: string): unknown {
  if (!Array.isArray(v)) return undefined;
  const hit = v.find(
    (e) => (e as Record<string, unknown>)?.elementName === name,
  );
  return (hit as Record<string, unknown>)?.elementValue;
}

export function observationUrl(key: string): string {
  const q = new URLSearchParams({ Authorization: key, format: "JSON" });
  return `${API}?${q}`;
}

/** 只有使用者填了金鑰那一刻才要網域權限，而且要在使用者手勢裡呼叫 */
export async function requestCwa(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  return chrome.permissions.request({ origins: CWA_ORIGINS });
}

/** 最近的氣象署測站。太遠回 null，讓上層往下一層退 */
export function nearestCwa(list: Station[], lat: number, lon: number) {
  return nearest(list, lat, lon, MAX_KM);
}
