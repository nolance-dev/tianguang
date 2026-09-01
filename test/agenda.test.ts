// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  busyDays,
  makeEvent,
  monthGrid,
  onDay,
  shiftMonth,
  upcoming,
  ymd,
  type Event,
} from "../src/lib/agenda";

const ev = (date: string, time: string, text: string): Event => ({
  id: `${date}-${time}-${text}`,
  date,
  time,
  text,
});

describe("建立行程", () => {
  it("空白不建立，前後空格去掉", () => {
    expect(makeEvent("2026-09-01", "", "   ")).toBeNull();
    expect(makeEvent("2026-09-01", "", "  看牙  ")!.text).toBe("看牙");
  });

  it("日期格式不對就不建立 —— 存進去之後整排會排錯", () => {
    expect(makeEvent("2026/9/1", "", "看牙")).toBeNull();
    expect(makeEvent("", "", "看牙")).toBeNull();
  });

  it("時間不合格就當成整天，不是整筆丟掉", () => {
    expect(makeEvent("2026-09-01", "25:00", "看牙")!.time).toBe("");
    expect(makeEvent("2026-09-01", "9:5", "看牙")!.time).toBe("");
    expect(makeEvent("2026-09-01", "09:05", "看牙")!.time).toBe("09:05");
  });
});

describe("某一天", () => {
  const list = [
    ev("2026-09-01", "14:00", "下午的"),
    ev("2026-09-02", "", "隔天"),
    ev("2026-09-01", "", "整天的"),
    ev("2026-09-01", "09:00", "早上的"),
  ];

  it("只挑那一天，整天的排最前面，其餘照時間", () => {
    expect(onDay(list, "2026-09-01").map((e) => e.text)).toEqual(["整天的", "早上的", "下午的"]);
  });

  it("哪幾天有事，給月曆的小圓點用", () => {
    const busy = busyDays(list);
    expect(busy.has("2026-09-01")).toBe(true);
    expect(busy.has("2026-09-03")).toBe(false);
  });
});

describe("議程", () => {
  const list = [
    ev("2026-08-30", "", "上個月的"),
    ev("2026-09-05", "10:00", "下週"),
    ev("2026-09-01", "08:00", "今天"),
  ];

  it("只列今天以後的，過去的不出現 —— 議程是「接下來」", () => {
    expect(upcoming(list, "2026-09-01").map((e) => e.text)).toEqual(["今天", "下週"]);
  });
});

describe("月曆格子", () => {
  it("永遠六列七欄，格子高度才不會每個月變一次", () => {
    expect(monthGrid(2026, 8)).toHaveLength(42);
    expect(monthGrid(2026, 1)).toHaveLength(42);
  });

  it("一週從星期一起算", () => {
    // 2026-09-01 是星期二，所以第一格是 8/31 星期一
    const cells = monthGrid(2026, 8);
    expect(cells[0]!.getDay(), "星期一").toBe(1);
    expect(ymd(cells[0]!)).toBe("2026-08-31");
    expect(ymd(cells[1]!)).toBe("2026-09-01");
  });

  it("前後補的日子是真的鄰月日期，不是空格", () => {
    const cells = monthGrid(2026, 8);
    expect(ymd(cells[41]!)).toBe("2026-10-11");
  });

  it("換月用 1 號當基準 —— 從 1/31 往後不會跳成 3/3", () => {
    expect(shiftMonth(2026, 0, 1)).toEqual([2026, 1]);
    expect(shiftMonth(2026, 11, 1)).toEqual([2027, 0]);
    expect(shiftMonth(2026, 0, -1)).toEqual([2025, 11]);
  });
});
