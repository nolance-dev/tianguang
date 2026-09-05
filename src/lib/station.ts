/**
 * 一個氣象測站，以及「哪一個離我最近」。
 *
 * 氣象署和機場 METAR 兩邊都要這組東西。距離和「太遠就不要」如果各寫一份，
 * 遲早會變成兩套標準 —— 而它們回答的是同一個問題。
 */

export interface Station {
  /** 顯示用的名字。介面會說「XX 測站實測」 */
  name: string;
  lat: number;
  lon: number;
  /** 攝氏 */
  temp: number;
}

/** 兩點之間的距離，公里。半正矢公式 —— 這個尺度用平面近似也行，但這個不會錯 */
export function distanceKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 最近的測站。太遠就回 null。
 *
 * 寧可退回模式推算，也不要拿一個很遠的測站假裝是這裡的天氣 ——
 * 實測過：桃園機場離台北三十公里，同一時刻差了兩度。
 */
export function nearest(
  list: Station[],
  lat: number,
  lon: number,
  maxKm: number,
): Station | null {
  let best: Station | null = null;
  let bestKm = Infinity;
  for (const s of list) {
    const km = distanceKm(lat, lon, s.lat, s.lon);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return best && bestKm <= maxKm ? best : null;
}
