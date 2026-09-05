import { describe, expect, it } from "vitest";
import { bboxUrl, nearestMetar, parseMetar } from "../src/lib/metar";

/**
 * 機場 METAR。
 *
 * 下面這份是真的打過 aviationweather.gov 拿回來的形狀，不是照文件猜的 ——
 * 台北的兩座機場（松山在市區、桃園在三十公里外）同一時刻差了兩度，
 * 正好是「挑最近的那一站」為什麼重要的證據。
 */

const REAL = [
  {
    icaoId: "RCTP",
    name: "Taipei/Taoyuan Arpt, TA, TW",
    temp: 27,
    dewp: 23,
    lat: 25.078,
    lon: 121.233,
    elev: 33,
  },
  {
    icaoId: "RCSS",
    name: "Taipei/Songshan Arpt, TP, TW",
    temp: 25,
    dewp: 22,
    lat: 25.069,
    lon: 121.552,
    elev: 8,
  },
];

describe("機場觀測", () => {
  it("挖得出名字、座標、溫度", () => {
    const s = parseMetar(REAL);
    expect(s).toHaveLength(2);
    // 「Taipei/Songshan Arpt, TP, TW」太長，介面上只放得下前面那一段
    expect(s[1]).toEqual({
      name: "Taipei/Songshan Arpt",
      lat: 25.069,
      lon: 121.552,
      temp: 25,
    });
  });

  it("挑市區那座，不是三十公里外那座", () => {
    // 兩座機場同一時刻差兩度 —— 挑錯就等於報了另一個城市的天氣
    const hit = nearestMetar(parseMetar(REAL), 25.033, 121.5654);
    expect(hit?.name).toContain("Songshan");
    expect(hit?.temp).toBe(25);
  });

  it("附近沒有機場就回 null，退回模式推算", () => {
    // 台中離這兩座都超過三十公里
    expect(nearestMetar(parseMetar(REAL), 24.15, 120.68)).toBeNull();
  });

  it("沒報溫度的站不算數", () => {
    const partial = [
      { icaoId: "XXXX", name: "No Thermometer", lat: 25.03, lon: 121.56 },
      {
        icaoId: "YYYY",
        name: "Null Temp",
        temp: null,
        lat: 25.03,
        lon: 121.56,
      },
    ];
    expect(parseMetar(partial)).toEqual([]);
  });

  it("認不出來的東西一律回空陣列，不丟例外", () => {
    for (const junk of [
      null,
      undefined,
      {},
      "",
      42,
      { data: [] },
      [null],
      [{}],
    ])
      expect(parseMetar(junk), JSON.stringify(junk)).toEqual([]);
  });

  it("沒有名字就用 ICAO 代碼 —— 四個字母總比空白好", () => {
    expect(
      parseMetar([{ icaoId: "RCSS", temp: 25, lat: 25.07, lon: 121.55 }])[0]
        ?.name,
    ).toBe("RCSS");
  });

  it("方框查詢：不必內建機場資料庫", () => {
    const url = bboxUrl(25.033, 121.5654);
    expect(url).toContain("bbox=24.433%2C120.965%2C25.633%2C122.165");
    expect(url).toContain("format=json");
  });
});
