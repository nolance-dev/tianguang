// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  clock,
  countOnDay,
  DEFAULT_DURATIONS,
  durationMs,
  isFocus,
  lastDays,
  makeProject,
  makeSession,
  MIN_SESSION_MS,
  minutes,
  msOnDay,
  normalizeDurations,
  totalMs,
  type Session,
} from "../src/lib/focus";

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m, d, h).getTime();

const s = (when: number, ms: number, projectId: string | null = null): Session => ({
  id: `${when}-${ms}`,
  at: when,
  ms,
  mode: "work",
  projectId,
});

describe("時段長度", () => {
  it("只有專注與強力算進統計，休息不算", () => {
    expect(isFocus("work")).toBe(true);
    expect(isFocus("power")).toBe(true);
    expect(isFocus("short")).toBe(false);
    expect(isFocus("long")).toBe(false);
  });

  it("夾在一到一百八十分鐘之間，壞值退回預設", () => {
    expect(normalizeDurations({ work: 0 }).work).toBe(1);
    expect(normalizeDurations({ work: 9999 }).work).toBe(180);
    expect(normalizeDurations({ work: "二十五" }).work).toBe(DEFAULT_DURATIONS.work);
    expect(normalizeDurations(undefined)).toEqual(DEFAULT_DURATIONS);
  });

  it("轉成毫秒", () => {
    expect(durationMs("work", DEFAULT_DURATIONS)).toBe(25 * 60_000);
    expect(durationMs("power", DEFAULT_DURATIONS)).toBe(50 * 60_000);
  });
});

describe("記一段", () => {
  it("太短的不記 —— 按了開始又馬上重設不是一段專注", () => {
    expect(makeSession(MIN_SESSION_MS - 1, "work", null)).toBeNull();
    expect(makeSession(MIN_SESSION_MS, "work", null)).not.toBeNull();
  });

  it("休息不記", () => {
    expect(makeSession(30 * 60_000, "short", null)).toBeNull();
    expect(makeSession(30 * 60_000, "long", null)).toBeNull();
  });

  it("記下模式與專案", () => {
    const one = makeSession(25 * 60_000, "power", "p1", 1234)!;
    expect(one.mode).toBe("power");
    expect(one.projectId).toBe("p1");
    expect(one.at).toBe(1234);
  });
});

describe("統計", () => {
  const list = [
    s(at(2026, 8, 1), 25 * 60_000, "a"),
    s(at(2026, 8, 1, 14), 25 * 60_000, "b"),
    s(at(2026, 8, 3), 50 * 60_000, "a"),
  ];

  it("某一天的總長，可以只算一個專案", () => {
    expect(msOnDay(list, "2026-09-01")).toBe(50 * 60_000);
    expect(msOnDay(list, "2026-09-01", "a")).toBe(25 * 60_000);
    expect(msOnDay(list, "2026-09-02")).toBe(0);
  });

  it("某一天的段數", () => {
    expect(countOnDay(list, "2026-09-01")).toBe(2);
    expect(countOnDay(list, "2026-09-02")).toBe(0);
  });

  it("總計也吃專案篩選", () => {
    expect(totalMs(list)).toBe(100 * 60_000);
    expect(totalMs(list, "a")).toBe(75 * 60_000);
    expect(totalMs(list, null), "沒指定專案的那些").toBe(0);
  });

  it("柱狀圖含沒有紀錄的日子 —— 跳過空日的話「連續五天」跟「五天裡做了五天」會長得一樣", () => {
    const bars = lastDays(list, 4, new Date(2026, 8, 4));
    expect(bars.map((b) => b.day)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(bars.map((b) => b.ms)).toEqual([50 * 60_000, 0, 50 * 60_000, 0]);
  });

  it("柱狀圖也吃專案篩選", () => {
    const bars = lastDays(list, 3, new Date(2026, 8, 3), "b");
    expect(bars.map((b) => b.ms)).toEqual([25 * 60_000, 0, 0]);
  });
});

describe("顯示", () => {
  it("分鐘四捨五入，總計是時:分", () => {
    expect(minutes(90_000)).toBe(2);
    expect(clock(0)).toBe("00:00");
    expect(clock(75 * 60_000)).toBe("01:15");
    expect(clock(600 * 60_000), "超過十小時不會被截掉").toBe("10:00");
  });
});

describe("專案", () => {
  it("空白不建立，名字太長就截斷", () => {
    expect(makeProject("   ", [])).toBeNull();
    expect(makeProject("x".repeat(80), [])!.name).toHaveLength(40);
  });

  it("顏色照順序輪，不隨機 —— 每次重開換一個顏色會認不出來", () => {
    const one = makeProject("甲", [])!;
    const two = makeProject("乙", [one])!;
    expect(one.hue).not.toBe(two.hue);
    const again = makeProject("甲", [])!;
    expect(again.hue).toBe(one.hue);
  });
});

describe("跨日", () => {
  it("用當地日期切 —— UTC 會讓台灣早上八點前的專注算成昨天", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const early = new Date(2026, 8, 2, 7, 0).getTime();
    expect(msOnDay([s(early, 60_000)], "2026-09-02")).toBe(60_000);
    expect(msOnDay([s(early, 60_000)], "2026-09-01")).toBe(0);
    vi.useRealTimers();
  });
});
