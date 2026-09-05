/**
 * 機場的 METAR 觀測報文。
 *
 * 這是「不必任何設定就能拿到真實測值」的那一層。氣象署要金鑰、只有台灣；
 * METAR 免金鑰、全球每個機場都有，而且是真的溫度計讀數不是模式推算。
 *
 * 實測同一時刻的台北：模式 24.4、met.no 24.0、wttr.in 24，
 * 松山機場 METAR 25、氣象署測站 26。METAR 補上了模式差的那一度多。
 *
 * 它的限制要講清楚：報文只給整數度、大約一小時一筆，而且量的是機場。
 * 台北剛好松山在市區裡（離市中心五公里），但很多城市的機場在郊外 ——
 * 所以超過三十公里就不用，寧可退回模式推算。實測桃園機場離台北三十公里，
 * 同一時刻比松山高兩度。
 *
 * 還有一件事開發時會被騙：**這支 API 不送 CORS 標頭**（量過，Open-Meteo 送的是
 * access-control-allow-origin: *，它沒有）。也就是說 npm run dev 和 vite preview
 * 底下這一層一定失敗 —— 那是普通網頁，受 CORS 管。只有真的載進瀏覽器、
 * 而且 aviationweather.gov 的網域權限已授權時才讀得到，因為擴充功能頁面
 * 的跨網域讀取由主機權限決定，不看 CORS。
 *
 * 所以「在開發伺服器上看到 source=model」是預期，不是壞掉。
 */

import { nearest, type Station } from "./station";

const API = "https://aviationweather.gov/api/data/metar";

export const METAR_ORIGINS = ["https://aviationweather.gov/*"];

/** 機場不像氣象署測站那麼密，但更遠就不能代表「這裡」了 */
const MAX_KM = 30;

/**
 * 用一個方框查附近的機場，不必內建機場資料庫。
 *
 * 0.6 度大約是六十公里見方，在任何緯度都涵蓋得到 MAX_KM 的圓，
 * 挑最近的那一步再把太遠的濾掉。
 */
export function bboxUrl(lat: number, lon: number, pad = 0.6): string {
  const box = [lat - pad, lon - pad, lat + pad, lon + pad]
    .map((n) => n.toFixed(3))
    .join(",");
  const q = new URLSearchParams({ bbox: box, format: "json" });
  return `${API}?${q}`;
}

/**
 * 把回應挖成測站清單。
 *
 * 這個形狀是真的打過的（RCSS、RCTP、倫敦那幾站），不是照文件猜的。
 * temp 可能是 null（有些站不報溫度），沒有溫度的站不能算「最近的一站」。
 */
export function parseMetar(raw: unknown): Station[] {
  if (!Array.isArray(raw)) return [];
  const out: Station[] = [];
  for (const row of raw) {
    // 陣列裡塞 null 是會發生的。先擋，不然下一行就丟例外
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const temp = typeof r.temp === "number" ? r.temp : null;
    const lat = typeof r.lat === "number" ? r.lat : null;
    const lon = typeof r.lon === "number" ? r.lon : null;
    if (temp === null || lat === null || lon === null) continue;
    if (!Number.isFinite(temp) || temp < -90 || temp > 60) continue;
    out.push({ name: shortName(r.name, r.icaoId), lat, lon, temp });
  }
  return out;
}

/**
 * 「Taipei/Songshan Arpt, TP, TW」太長，介面上只放得下前面那一段。
 * 連名字都沒有就退回 ICAO 代碼 —— 四個字母總比空白好。
 */
function shortName(name: unknown, icao: unknown): string {
  const full = typeof name === "string" ? name : "";
  const head = full.split(",")[0]?.trim();
  if (head) return head;
  return typeof icao === "string" ? icao : "";
}

/** 最近的機場。太遠回 null，讓上層退回模式推算 */
export function nearestMetar(list: Station[], lat: number, lon: number) {
  return nearest(list, lat, lon, MAX_KM);
}
