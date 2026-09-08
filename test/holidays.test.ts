import { afterEach, describe, expect, it, vi } from "vitest";
import {
  around,
  byDate,
  feedUrl,
  parseIcs,
  supported,
  loadHolidays,
} from "../src/lib/holidays";
import { isoWeek } from "../src/lib/agenda";
import { subDate } from "../src/lib/secondcal";

describe("行事曆代號", () => {
  it("代號沒有規律，所以只認表 —— en.tw 是 500，en.taiwan 才是對的", () => {
    expect(feedUrl("TW", "zh-tw")).toContain(
      encodeURIComponent("zh-tw.taiwan#holiday"),
    );
    expect(feedUrl("US", "en")).toContain(encodeURIComponent("en.usa#holiday"));
    expect(feedUrl("TH", "en"), "這個反而是 ISO 國碼").toContain(
      encodeURIComponent("en.th#holiday"),
    );
  });

  it("大小寫都收，表裡沒有的回 null 而不是猜一個", () => {
    expect(feedUrl("tw", "en")).not.toBeNull();
    expect(feedUrl("ZA", "en")).toBeNull();
    expect(supported("MX")).toBe(true);
    expect(supported("ZZ")).toBe(false);
  });
});

describe("讀 ICS", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260101",
    "SUMMARY:中華民國開國紀念日",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260217",
    "SUMMARY:春節\, 初一",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260228",
    "SUMMARY:和平紀念日補假很長的名",
    " 字被折行了",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20260301T090000Z",
    "SUMMARY:這是帶時刻的，不是節日",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const list = parseIcs(ics);

  it("只收整天的事件 —— 節日是一整天，帶時刻的是別的東西", () => {
    expect(list).toHaveLength(3);
    expect(list.map((h) => h.date)).toEqual([
      "2026-01-01",
      "2026-02-17",
      "2026-02-28",
    ]);
  });

  it("折行要接回去，不然長的名字會被切一半", () => {
    expect(list[2]!.name).toBe("和平紀念日補假很長的名字被折行了");
  });

  it("跳脫的逗號要還原", () => {
    expect(list[1]!.name).toBe("春節, 初一");
  });

  it("同一天可以有兩個 —— 補假撞到節日是常態", () => {
    const map = byDate([
      { date: "2026-02-28", name: "和平紀念日" },
      { date: "2026-02-28", name: "補假" },
    ]);
    expect(map.get("2026-02-28")).toEqual(["和平紀念日", "補假"]);
  });

  it("只留今年前後一年，月曆用不到十年前的", () => {
    const kept = around(
      [
        { date: "2015-01-01", name: "太舊" },
        { date: "2026-01-01", name: "今年" },
        { date: "2027-06-01", name: "明年" },
        { date: "2030-01-01", name: "太遠" },
      ],
      2026,
    );
    expect(kept.map((h) => h.name)).toEqual(["今年", "明年"]);
  });
});

describe("ISO 週數", () => {
  it("週一起算，跨年那幾天算給正確的年份", () => {
    // 2026-01-01 是星期四，所以它屬於 2026 年第一週
    expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    // 2026-12-31 是星期四 → 第 53 週
    expect(isoWeek(new Date(2026, 11, 31))).toBe(53);
    // 2027-01-01 是星期五，跟前一天同一週，仍然是 53 —— 不是第 0 週
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });

  it("九月一日那一週", () => {
    expect(isoWeek(new Date(2026, 8, 1))).toBe(36);
  });
});

describe("第二套曆法", () => {
  it("農曆的日子用初一那套寫法，不是 1 日", () => {
    // 2026-09-01 是農曆七月二十
    expect(subDate(new Date(2026, 8, 1), "chinese")?.text).toBe("二十");
  });

  it("月初顯示月份名 —— 四十二格全寫日子是一面噪音", () => {
    // 2026-08-13 是農曆七月初一
    const first = subDate(new Date(2026, 7, 13), "chinese");
    expect(first?.lead).toBe(true);
    expect(first?.text).toContain("月");
  });

  it("關掉就是 null，不是空字串", () => {
    expect(subDate(new Date(), "none")).toBeNull();
  });

  it("民國不逐格寫 —— 它的月和日跟西曆一模一樣", () => {
    /*
     * 這條原本斷言民國格子印「2」，也就是跟格子上方的西曆日期同一個數字。
     * 那是把缺陷寫成了規格：四十二格重複四十二次同一個數，看的人只會覺得
     * 這個功能壞了。年份改由 calYear 在月份標題講一次，逐格留白。
     * 伊斯蘭曆不一樣，它的日跟西曆真的不同，所以照寫。
     */
    expect(subDate(new Date(2026, 8, 2), "roc")).toBeNull();
    expect(subDate(new Date(2026, 8, 1), "islamic")?.text).toBeTruthy();
  });
});

/**
 * 換語言之後，舊的那一份不能頂上來。
 *
 * 使用者的快取裡抓到現行犯：{"cc":"TW","lang":"en","list":[Mid-Autumn Festival…]}，
 * 而畫面是中文的。原本抓不到就拿舊的頂，只比國碼不比語言，於是中文介面
 * 配一整排英文節日名，而且不會自己好。
 */
describe("節日的語言", () => {
  const store = new Map<string, unknown>();
  const setup = (cached: unknown, fetchOk: boolean, body = "") => {
    store.clear();
    if (cached) store.set("tg.holidays", cached);
    (globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: (k: string) =>
            Promise.resolve(store.has(k) ? { [k]: store.get(k) } : {}),
          set: (o: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(o)) store.set(k, v);
            return Promise.resolve();
          },
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        fetchOk
          ? Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
          : Promise.resolve({ ok: false, status: 404 }),
      ),
    );
  };

  const ICS = [
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20260925",
    "SUMMARY:中秋節",
    "END:VEVENT",
  ].join(String.fromCharCode(13, 10));

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  const enCache = {
    cc: "TW",
    lang: "en",
    at: Date.now(),
    list: [{ date: "2026-09-25", name: "Mid-Autumn Festival" }],
  };

  it("語言不對的舊資料寧可不給，也不要顯示成另一種語言", async () => {
    setup(enCache, false);
    expect(await loadHolidays("TW", "zh-tw")).toEqual([]);
  });

  it("語言對得上就照常頂著用 —— 離線時月曆仍然有節日", async () => {
    setup(enCache, false);
    expect(await loadHolidays("TW", "en")).toEqual(enCache.list);
  });

  it("抓得到就換成新的那一份", async () => {
    setup(enCache, true, ICS);
    const got = await loadHolidays("TW", "zh-tw");
    expect(got).toEqual([{ date: "2026-09-25", name: "中秋節" }]);
    // 而且要把語言一起存進去，下次才不會又拿英文那份頂
    expect((store.get("tg.holidays") as { lang: string }).lang).toBe("zh-tw");
  });

  it("同語言而且還新鮮就不重抓", async () => {
    setup({ ...enCache, at: Date.now() }, true, ICS);
    await loadHolidays("TW", "en");
    expect(fetch).not.toHaveBeenCalled();
  });
});
