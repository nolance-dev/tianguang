// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { initial, makeLink, normalizeUrl, reorder, titleFromUrl } from "../src/lib/links";
import {
  condition,
  fetchWeather,
  forecastUrl,
  formatTemp,
  parseForecast,
} from "../src/lib/weather";

describe("快速連結", () => {
  it("沒寫協定就補 https", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("只收 http 和 https —— 會被點擊的磚不該掛 javascript:", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<h1>x")).toBeNull();
    expect(normalizeUrl("file:///C:/")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });

  it("沒填標題就用網域，去掉 www", () => {
    expect(titleFromUrl("https://www.example.com/a/b")).toBe("example.com");
    expect(makeLink("github.com")!.title).toBe("github.com");
    expect(makeLink("github.com", "  程式碼  ")!.title).toBe("程式碼");
  });

  it("磚上的字取第一個字元，中英文都要對", () => {
    expect(initial("github")).toBe("G");
    expect(initial("天光")).toBe("天");
    // 表情符號是代理對，用 [...str] 拆才不會切成半個字
    expect(initial("🌅 早安")).toBe("🌅");
  });

  it("拖曳排序把元素抽出來插到新位置", () => {
    const ids = ["a", "b", "c", "d"].map((id) => ({ id, title: id, url: `https://${id}.com` }));
    expect(reorder(ids, 0, 2).map((l) => l.id)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(ids, 3, 0).map((l) => l.id)).toEqual(["d", "a", "b", "c"]);
    // 越界或原地不動就原樣回傳
    expect(reorder(ids, 1, 1)).toBe(ids);
    expect(reorder(ids, 9, 0)).toBe(ids);
  });
});

describe("天氣", () => {
  it("WMO 代碼歸成看得懂的十類", () => {
    expect(condition(0)).toBe("wx_clear");
    expect(condition(2)).toBe("wx_partly");
    expect(condition(3)).toBe("wx_cloudy");
    expect(condition(45)).toBe("wx_fog");
    expect(condition(53)).toBe("wx_drizzle");
    expect(condition(65)).toBe("wx_rain");
    expect(condition(75)).toBe("wx_snow");
    expect(condition(81)).toBe("wx_showers");
    expect(condition(95)).toBe("wx_thunder");
  });

  it("攝氏華氏換算並四捨五入", () => {
    expect(formatTemp(33, "c")).toBe("33°");
    expect(formatTemp(33, "f")).toBe("91°");
    expect(formatTemp(-0.4, "c")).toBe("0°");
  });

  it("查詢網址帶上 timezone=auto，否則每日資料會對不上當地日界", () => {
    const url = forecastUrl(25.033, 121.565);
    expect(url).toContain("timezone=auto");
    expect(url).toContain("latitude=25.0330");
    expect(url).toContain("forecast_days=4");
  });

  it("解析時跳過今天，只留接下來三天", () => {
    const w = parseForecast(
      {
        current: { temperature_2m: 33.2, apparent_temperature: 38.1, weather_code: 3 },
        daily: {
          time: ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"],
          weather_code: [3, 61, 0, 80],
          temperature_2m_max: [34, 31, 33, 30],
          temperature_2m_min: [27, 25, 26, 25],
        },
      },
      1_000,
    );
    expect(w.temp).toBe(33.2);
    expect(w.days).toHaveLength(3);
    expect(w.days[0]).toEqual({ date: "2026-09-01", code: 61, max: 31, min: 25 });
    expect(w.stale).toBe(false);
  });
});

describe("天氣降級", () => {
  const raw = {
    current: { temperature_2m: 30, apparent_temperature: 33, weather_code: 0 },
    daily: {
      time: ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"],
      weather_code: [0, 0, 0, 0],
      temperature_2m_max: [34, 34, 34, 34],
      temperature_2m_min: [27, 27, 27, 27],
    },
  };

  it("三十分鐘內用快取，不重打網路", async () => {
    localStorage.clear();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(raw)));

    await fetchWeather(25, 121, 0);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await fetchWeather(25, 121, 10 * 60 * 1000);
    expect(fetchSpy, "還在保鮮期內就不該再打一次").toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it("網路掛掉就給上一次成功的資料，並標成 stale —— 空格子比舊資料難看", async () => {
    localStorage.clear();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(raw)));
    await fetchWeather(25, 121, 0);

    fetchSpy.mockRejectedValue(new TypeError("offline"));
    const stale = await fetchWeather(25, 121, 60 * 60 * 1000);
    expect(stale).not.toBeNull();
    expect(stale!.temp).toBe(30);
    expect(stale!.stale).toBe(true);

    fetchSpy.mockRestore();
  });

  it("從來沒成功過又沒網路，就回 null 讓 UI 顯示空狀態", async () => {
    localStorage.clear();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    expect(await fetchWeather(25, 121, 0)).toBeNull();
    fetchSpy.mockRestore();
  });
});
