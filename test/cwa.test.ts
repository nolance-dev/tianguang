import { describe, expect, it } from "vitest";
import {
  inTaiwan,
  nearestCwa,
  observationUrl,
  parseStations,
} from "../src/lib/cwa";
import { distanceKm } from "../src/lib/station";

/**
 * 氣象署測站。
 *
 * 這一份驗的是「拿到回應之後怎麼辦」—— 挑最近的測站、太遠就不要、格式
 * 認不出來就退回去。真實回應的欄位還沒對過（那支 API 要金鑰），所以解析
 * 寫得鬆，而這裡把新舊兩種已知形狀和一堆壞資料都餵過一次：任何一種都
 * 不可以丟例外，最差就是回空陣列讓上層走 Open-Meteo。
 */

const NEW_SHAPE = {
  records: {
    Station: [
      {
        StationName: "臺北",
        GeoInfo: {
          Coordinates: [
            {
              CoordinateName: "TWD97",
              StationLatitude: 0,
              StationLongitude: 0,
            },
            {
              CoordinateName: "WGS84",
              StationLatitude: 25.037658,
              StationLongitude: 121.514854,
            },
          ],
        },
        WeatherElement: { AirTemperature: 26.3 },
      },
      {
        StationName: "高雄",
        GeoInfo: {
          Coordinates: [
            {
              CoordinateName: "WGS84",
              StationLatitude: 22.565992,
              StationLongitude: 120.315482,
            },
          ],
        },
        WeatherElement: { AirTemperature: 29.1 },
      },
    ],
  },
};

const OLD_SHAPE = {
  records: {
    location: [
      {
        locationName: "臺北",
        lat: "25.037658",
        lon: "121.514854",
        weatherElement: [
          { elementName: "ELEV", elementValue: "6.3" },
          { elementName: "TEMP", elementValue: "26.3" },
        ],
      },
    ],
  },
};

describe("氣象署測站", () => {
  it("新版的具名欄位挖得出來", () => {
    const s = parseStations(NEW_SHAPE);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({
      name: "臺北",
      lat: 25.037658,
      lon: 121.514854,
      temp: 26.3,
    });
  });

  it("舊版的 weatherElement 陣列也挖得出來", () => {
    expect(parseStations(OLD_SHAPE)[0]?.temp).toBe(26.3);
  });

  it("認不出來的東西一律回空陣列，不丟例外", () => {
    for (const junk of [
      null,
      undefined,
      {},
      { records: null },
      { records: {} },
      { records: { Station: "not an array" } },
      { records: { Station: [{}] } },
      { records: { Station: [null] } },
      "401 Forbidden: Authorization key is not correct.",
    ])
      expect(parseStations(junk), JSON.stringify(junk)).toEqual([]);
  });

  it("-99 是缺值，不是零下九十九度", () => {
    const bad = {
      records: {
        Station: [
          {
            StationName: "壞掉的站",
            GeoInfo: {
              Coordinates: [
                {
                  CoordinateName: "WGS84",
                  StationLatitude: 25,
                  StationLongitude: 121,
                },
              ],
            },
            WeatherElement: { AirTemperature: -99 },
          },
        ],
      },
    };
    expect(parseStations(bad)).toEqual([]);
  });

  it("挑最近的那一站", () => {
    const s = parseStations(NEW_SHAPE);
    expect(nearestCwa(s, 25.033, 121.5654)?.name).toBe("臺北");
    expect(nearestCwa(s, 22.6, 120.3)?.name).toBe("高雄");
  });

  it("太遠就不要 —— 寧可用模式推算，也不要拿一百公里外的測站充數", () => {
    const s = parseStations(NEW_SHAPE);
    // 台中離兩站都超過 30 公里
    expect(nearestCwa(s, 24.15, 120.68)).toBeNull();
  });

  it("距離算得對", () => {
    // 台北到高雄大約 300 公里
    const km = distanceKm(25.0376, 121.5148, 22.566, 120.3155);
    expect(km).toBeGreaterThan(280);
    expect(km).toBeLessThan(320);
  });

  it("人不在台灣就不要打這支 API", () => {
    expect(inTaiwan(25.033, 121.5654)).toBe(true);
    expect(inTaiwan(23.5, 119.6)).toBe(true); // 澎湖
    expect(inTaiwan(35.68, 139.69)).toBe(false); // 東京
    expect(inTaiwan(51.5, -0.12)).toBe(false); // 倫敦
  });

  it("金鑰進查詢字串，而且要編碼過", () => {
    const url = observationUrl("CWA-abc/123");
    expect(url).toContain("Authorization=CWA-abc%2F123");
    expect(url).toContain("O-A0003-001");
  });
});
