// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  initial,
  makeLink,
  normalizeUrl,
  orderFields,
  reorder,
  titleFromUrl,
} from "../src/lib/links";
import {
  condition,
  fetchWeather,
  forecastUrl,
  formatTemp,
  geocode,
  hasCjk,
  parseForecast,
  resolveCityQuery,
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

  it("一個詞不是網址 —— 名稱打進網址欄要擋下來", () => {
    // new URL("https://抖音") 是合法的，主機名會變成 punycode。放行的話
    // 磚上出現的是另一欄那串網址，使用者打的名稱像是憑空消失了
    expect(normalizeUrl("抖音")).toBeNull();
    expect(normalizeUrl("douyin")).toBeNull();
    expect(makeLink("抖音", "https://www.douyin.com")).toBeNull();
    // 但開發用的 localhost 和 IP 還是要進得來
    expect(normalizeUrl("localhost:5173")).toBe("https://localhost:5173/");
    expect(normalizeUrl("192.168.1.5")).toBe("https://192.168.1.5/");
    expect(normalizeUrl("www.douyin.com")).toBe("https://www.douyin.com/");
  });

  it("兩格填反了自己調過來", () => {
    expect(orderFields("抖音", "https://www.douyin.com")).toEqual([
      "https://www.douyin.com",
      "抖音",
    ]);
    // 上面那格本來就是網址就不要動它，即使下面那格也像網址
    expect(orderFields("a.com", "b.com")).toEqual(["a.com", "b.com"]);
    // 兩格都不是網址就維持原樣，讓 makeLink 去擋
    expect(orderFields("抖音", "短影片")).toEqual(["抖音", "短影片"]);
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
    const ids = ["a", "b", "c", "d"].map((id) => ({
      id,
      title: id,
      url: `https://${id}.com`,
    }));
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
        current: {
          temperature_2m: 33.2,
          apparent_temperature: 38.1,
          weather_code: 3,
        },
        daily: {
          time: ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"],
          weather_code: [3, 61, 0, 80],
          temperature_2m_max: [34, 31, 33, 30],
          temperature_2m_min: [27, 25, 26, 25],
        },
      },
      25,
      121,
      1_000,
    );
    expect(w.temp).toBe(33.2);
    expect(w.days).toHaveLength(3);
    expect(w.days[0]).toEqual({
      date: "2026-09-01",
      code: 61,
      max: 31,
      min: 25,
    });
    expect([w.lat, w.lon]).toEqual([25, 121]);
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
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("offline"));
    expect(await fetchWeather(25, 121, 0)).toBeNull();
    fetchSpy.mockRestore();
  });
});

describe("中文城市名", () => {
  it("對照表把中文換成索引查得到的羅馬拼音", () => {
    expect(resolveCityQuery("台北")).toBe("Taipei");
    expect(resolveCityQuery("臺北")).toBe("Taipei");
    expect(resolveCityQuery("高雄")).toBe("Kaohsiung");
    expect(resolveCityQuery("東京")).toBe("Tokyo");
  });

  it("帶後綴也要對得到 —— 使用者會打「台北市」", () => {
    expect(resolveCityQuery("台北市")).toBe("Taipei");
    expect(resolveCityQuery("新北市")).toBe("New Taipei");
    // 長的鍵優先，不能被「台北」搶走
    expect(resolveCityQuery("台中市")).toBe("Taichung");
  });

  it("表外的輸入原樣送出", () => {
    expect(resolveCityQuery("Taipei")).toBe("Taipei");
    expect(resolveCityQuery("Reykjavik")).toBe("Reykjavik");
    expect(resolveCityQuery("  Kyoto  ")).toBe("Kyoto");
  });

  it("認得出中文輸入，才知道要不要給改用英文的提示", () => {
    expect(hasCjk("烏魯木齊")).toBe(true);
    expect(hasCjk("Taipei")).toBe(false);
    expect(hasCjk("台北 101")).toBe(true);
  });

  it("送出的查詢字串已經換成拼音", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ results: [] })));
    await geocode("台北", "zh-TW");
    expect(decodeURIComponent(String(spy.mock.calls[0]![0]))).toContain(
      "name=Taipei",
    );
    // language 只取前綴，zh-TW 要變成 zh
    expect(String(spy.mock.calls[0]![0])).toContain("language=zh");
    spy.mockRestore();
  });
});

describe("換城市要重新取得", () => {
  const body = (temp: number) =>
    JSON.stringify({
      current: {
        temperature_2m: temp,
        apparent_temperature: temp + 3,
        weather_code: 0,
      },
      daily: {
        time: ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03"],
        weather_code: [0, 0, 0, 0],
        temperature_2m_max: [temp, temp, temp, temp],
        temperature_2m_min: [temp - 5, temp - 5, temp - 5, temp - 5],
      },
    });

  it("台北和雪梨不能共用同一份快取", async () => {
    localStorage.clear();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(body(32)))
      .mockResolvedValueOnce(new Response(body(14)));

    const taipei = await fetchWeather(25.033, 121.565, 0);
    expect(taipei!.temp).toBe(32);

    // 同一分鐘內換城市 —— 快取還在保鮮期，但地點不同，必須重打
    const sydney = await fetchWeather(-33.868, 151.209, 60_000);
    expect(sydney!.temp, "換了城市卻拿到上一個城市的溫度").toBe(14);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("同一個城市在保鮮期內仍然用快取", async () => {
    localStorage.clear();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body(32)));
    await fetchWeather(25.033, 121.565, 0);
    await fetchWeather(25.0331, 121.5651, 60_000);
    expect(spy, "座標只差幾公尺不該讓快取失效").toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("斷線時不拿別的城市的舊資料頂 —— 那不是舊，是錯", async () => {
    localStorage.clear();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(body(32)));
    await fetchWeather(25.033, 121.565, 0);

    spy.mockRejectedValue(new TypeError("offline"));
    expect(await fetchWeather(-33.868, 151.209, 0)).toBeNull();
    spy.mockRestore();
  });
});
