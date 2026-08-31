import { describe, expect, it } from "vitest";
import { apparentLongitude, jieqiIndex } from "../src/lib/solar";

/**
 * 2026 年前十五個節氣的交節時刻（UTC+8），取自香港天文台與漢典曆法表。
 * 索引以春分為 0，每十五度加一。
 *
 * 驗的是「跨界」：交節前一小時應該還是上一個節氣，交節後一小時應該已經換過去。
 * 這比抽查某一天落在哪個節氣嚴格得多，能同時抓出角度算錯與索引偏移。
 */
const TERMS_2026: Array<[string, string, number]> = [
  ["立春", "2026-02-04T04:01:51+08:00", 21],
  ["雨水", "2026-02-18T23:51:39+08:00", 22],
  ["驚蟄", "2026-03-05T21:58:43+08:00", 23],
  ["春分", "2026-03-20T22:45:42+08:00", 0],
  ["清明", "2026-04-05T02:39:43+08:00", 1],
  ["穀雨", "2026-04-20T09:38:51+08:00", 2],
  ["立夏", "2026-05-05T19:48:27+08:00", 3],
  ["小滿", "2026-05-21T08:36:28+08:00", 4],
  ["芒種", "2026-06-05T23:48:04+08:00", 5],
  ["夏至", "2026-06-21T16:24:12+08:00", 6],
  ["小暑", "2026-07-07T09:56:40+08:00", 7],
  ["大暑", "2026-07-23T03:12:48+08:00", 8],
  ["立秋", "2026-08-07T19:42:26+08:00", 9],
  ["處暑", "2026-08-23T10:18:31+08:00", 10],
  ["白露", "2026-09-07T22:40:59+08:00", 11],
];

const HOUR = 3600_000;

describe("節氣", () => {
  it.each(TERMS_2026)("%s 交節前後各換一次", (_name, iso, index) => {
    const at = new Date(iso).getTime();
    expect(jieqiIndex(new Date(at + HOUR))).toBe(index);
    expect(jieqiIndex(new Date(at - HOUR))).toBe((index + 23) % 24);
  });

  it("交節當下的視黃經落在該節氣的界線上", () => {
    for (const [, iso, index] of TERMS_2026) {
      const lon = apparentLongitude(new Date(iso));
      // 折回 [-180, 180) 的帶號差。界線在 index * 15 度。
      // 實測誤差約 0.004 度，門檻放 0.05 度 —— 太陽一天走約一度，離「算錯一天」還很遠
      const delta = Math.abs(((lon - index * 15 + 540) % 360) - 180);
      expect(delta, `${iso} 黃經 ${lon.toFixed(4)}`).toBeLessThan(0.05);
    }
  });

  it("黃經一年繞滿一圈且單調遞增", () => {
    const day = 86400_000;
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    let prev = apparentLongitude(new Date(start));
    let wraps = 0;
    for (let i = 1; i < 365; i++) {
      const lon = apparentLongitude(new Date(start + i * day));
      if (lon < prev) wraps++;
      else expect(lon).toBeGreaterThan(prev);
      prev = lon;
    }
    expect(wraps).toBe(1);
  });
});
