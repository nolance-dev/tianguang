/**
 * 雷達回波圖。
 *
 * Open-Meteo 只給數值，沒有圖，所以雷達另外接 RainViewer 的公開圖磚。
 * 底圖用 Esri 的灰階 canvas —— 雷達圖磚是透明的，只有回波沒有地理，
 * 底下沒有海岸線的話，那張圖等於一片看不出在哪裡的色塊。
 *
 * 底圖本來寫 CARTO。實際拉圖來看才發現沒有 API key 的 CARTO 圖磚上
 * 印著「API KEY REQUIRED」的浮水印 —— HTTP 200、是張真的 PNG、
 * 大小也正常，只有用眼睛看才看得出來。
 *
 * 兩邊都是 Web Mercator、256 像素、標準的 z/x/y，所以疊在一起就是對齊的。
 * 對齊不是靠調整，是靠兩邊用同一套座標。
 */

/** 只有那份索引 JSON 要 fetch。圖磚是 <img>，不需要 host permission。 */
export const RADAR_ORIGINS = ["https://api.rainviewer.com/*"];

const INDEX = "https://api.rainviewer.com/public/weather-maps.json";

export const TILE = 256;
export const MIN_Z = 4;
export const MAX_Z = 10;

/**
 * 回波圖磚的最大縮放。
 *
 * RainViewer 只到 z7。再往上它回的是一張寫著「Zoom Level Not Supported」
 * 的灰底圖 —— HTTP 200、正常的 256×256 PNG、每一張都剛好 1370 位元組。
 * 沒有任何一種狀態碼或大小檢查看得出來，只有把它畫出來才知道。
 */
export const RADAR_MAX_Z = 7;

export interface Frame {
  /** 圖磚網址的前綴，例如 https://tilecache.rainviewer.com/v2/radar/xxxx */
  base: string;
  /** 這一幀的時刻（秒） */
  time: number;
}

/**
 * 世界像素座標下的圖磚座標，帶小數。
 *
 * 小數是重點：只取整數格的話，畫面中心會落在「包含這個城市的那一格」的
 * 某個角落，城市本身可能歪到邊上。要讓城市剛好在正中央，得知道它在格子裡
 * 的哪個位置。
 */
export function tileAt(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return {
    x: ((lon + 180) / 360) * n,
    // 夾的是結果不是輸入。那個緯度上限是一個十進位近似值，
    // 帶進公式之後會落在零的另一側一點點 —— 差幾個 10⁻⁹，
    // 但足以讓「不會算出範圍外的格子」這句話變成假的。
    y: Math.max(0, Math.min(n, y)),
  };
}

export interface Cell {
  x: number;
  y: number;
  /** 相對於容器左上角的位置（像素） */
  left: number;
  top: number;
}

/**
 * 讓 (lat, lon) 落在 width × height 這塊區域正中央所需要的圖磚。
 *
 * y 不繞。緯度超過範圍就沒有那一格，硬繞會把北極的圖磚畫到南極去。
 * x 要繞，因為經度是環的 —— 太平洋中線兩側的城市否則會少半邊。
 */
export function cover(
  lat: number,
  lon: number,
  z: number,
  width: number,
  height: number,
): Cell[] {
  const n = 2 ** z;
  const { x: fx, y: fy } = tileAt(lat, lon, z);
  const cells: Cell[] = [];

  const half = { w: width / 2, h: height / 2 };
  const from = { x: Math.floor(fx - half.w / TILE), y: Math.floor(fy - half.h / TILE) };
  const to = { x: Math.floor(fx + half.w / TILE), y: Math.floor(fy + half.h / TILE) };

  for (let ix = from.x; ix <= to.x; ix++) {
    for (let iy = from.y; iy <= to.y; iy++) {
      if (iy < 0 || iy >= n) continue;
      cells.push({
        x: ((ix % n) + n) % n,
        y: iy,
        // 不四捨五入。回波那一層是在較粗的縮放上算完再乘回來的，
        // 先取整再乘，半個像素的誤差會被放大成好幾個像素 ——
        // 底圖和回波就對不齊了。瀏覽器本來就處理得了小數位置。
        left: (ix - fx) * TILE + half.w,
        top: (iy - fy) * TILE + half.h,
      });
    }
  }
  return cells;
}

/**
 * 回波那一層要畫的圖磚。
 *
 * 超過 RainViewer 的上限就固定抓 z7 的圖磚再放大貼上去，
 * 跟地圖客戶端的 maxNativeZoom 是同一招：底圖繼續變細，回波變糊，
 * 但兩邊蓋的還是同一塊地。糊掉的回波仍然是資料；
 * 一張寫著「不支援」的灰卡不是。
 */
export function echoLayer(
  lat: number,
  lon: number,
  z: number,
  width: number,
  height: number,
): { z: number; scale: number; cells: Cell[] } {
  const ez = Math.min(z, RADAR_MAX_Z);
  const scale = 2 ** (z - ez);
  // 先在較粗的縮放上算一塊縮小過的區域，再整個放大回來 ——
  // 中心點在縮小的那塊裡是正中央，乘回去之後還是正中央
  const cells = cover(lat, lon, ez, width / scale, height / scale).map((c) => ({
    ...c,
    left: c.left * scale,
    top: c.top * scale,
  }));
  return { z: ez, scale, cells };
}

/**
 * 底圖。灰階、沒有地名標註 —— 標註是英文的，壓在中文介面上只是噪點，
 * 而這張圖要回答的是「雨在哪」，不是「這座城市叫什麼」。
 *
 * 注意路徑是 /tile/{z}/{y}/{x}，列在前欄在後，跟 XYZ 的慣例相反。
 */
export function baseTile(dark: boolean, z: number, x: number, y: number): string {
  const style = dark ? "World_Dark_Gray_Base" : "World_Light_Gray_Base";
  return `https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/${z}/${y}/${x}`;
}

/**
 * 雷達圖磚。
 *
 * 路徑格式是 {base}/{size}/{z}/{x}/{y}/{colour}/{smooth}_{snow}.png。
 * 色階 4 是通用的那組，雪的分色開著。
 *
 * 平滑關掉。開著比較好看，但那個平滑是「一張圖磚自己平滑自己」——
 * 相鄰兩張各自算各自的，接縫兩側對不起來，畫面上就是一條筆直的斷線，
 * 而且剛好落在圖磚邊界上。回波糊一點沒關係，一條不存在的直線不行。
 */
export function radarTile(frame: Frame, z: number, x: number, y: number): string {
  return `${frame.base}/${TILE}/${z}/${x}/${y}/4/0_1.png`;
}

/**
 * 最新的一幀。
 *
 * past 的最後一筆是「剛剛」，不是 nowcast —— 預測的回波拿來當現況會騙人。
 * 拿不到就回 null，呼叫端顯示底圖加一句取不到，不留空白。
 */
export async function latestFrame(): Promise<Frame | null> {
  try {
    const res = await fetch(INDEX, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      host?: string;
      radar?: { past?: Array<{ time: number; path: string }> };
    };
    const past = data.radar?.past;
    const last = past?.[past.length - 1];
    if (!data.host || !last) return null;
    return { base: `${data.host}${last.path}`, time: last.time };
  } catch {
    return null;
  }
}

export async function hasRadarAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  return chrome.permissions.contains({ origins: RADAR_ORIGINS });
}

/** 必須在使用者手勢裡呼叫。 */
export async function requestRadarAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  try {
    return await chrome.permissions.request({ origins: RADAR_ORIGINS });
  } catch {
    return false;
  }
}
