// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  advance,
  EMPTY,
  focusForToday,
  formatLeft,
  isRunning,
  makeTodo,
  migrate,
  pause,
  remaining,
  reset,
  REST_MS,
  roundsToday,
  start,
  today,
  WORK_MS,
  type Pomodoro,
} from "../src/lib/workspace";

const fresh = (): Pomodoro => ({ ...EMPTY.pomodoro });

describe("今日焦點", () => {
  it("跨日就作廢 —— 一天一件事，昨天的不留在畫面上", () => {
    const now = new Date(2026, 7, 31, 9, 0);
    const w = { ...EMPTY, focus: { text: "定案設計", done: false, date: "2026-08-30" } };
    expect(focusForToday(w, now)).toBeNull();
    expect(focusForToday({ ...w, focus: { ...w.focus!, date: "2026-08-31" } }, now)?.text).toBe(
      "定案設計",
    );
  });

  it("today() 用當地日期 —— UTC 會讓台灣早上八點前算成昨天", () => {
    // 台灣時間 2026-08-31 07:00 的 UTC 還是 8/30
    expect(today(new Date(2026, 7, 31, 7, 0))).toBe("2026-08-31");
    expect(today(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
});

describe("番茄鐘", () => {
  it("沒在跑就回整段長度", () => {
    expect(remaining(fresh())).toBe(WORK_MS);
    expect(remaining({ ...fresh(), mode: "rest" })).toBe(REST_MS);
    expect(isRunning(fresh())).toBe(false);
  });

  it("只存結束時刻，所以關掉分頁再開回來仍然是對的", () => {
    const p = start(fresh(), 1_000);
    expect(p.endsAt).toBe(1_000 + WORK_MS);
    // 模擬「關掉分頁十分鐘後重開」：同一份狀態，換一個當下時間
    expect(remaining(p, 1_000 + 10 * 60_000)).toBe(WORK_MS - 10 * 60_000);
    expect(isRunning(p)).toBe(true);
  });

  it("暫停記下剩餘，繼續時從那裡接回去", () => {
    const running = start(fresh(), 0);
    const paused = pause(running, 5 * 60_000);
    expect(paused.pausedLeft).toBe(WORK_MS - 5 * 60_000);
    expect(isRunning(paused)).toBe(false);

    // 暫停十分鐘後才繼續，剩餘不該被那十分鐘吃掉
    const resumed = start(paused, 15 * 60_000);
    expect(remaining(resumed, 15 * 60_000)).toBe(WORK_MS - 5 * 60_000);
  });

  it("時間到就歸零，不會變成負數", () => {
    const p = start(fresh(), 0);
    expect(remaining(p, WORK_MS + 99_999)).toBe(0);
  });

  it("工作完換休息並記一輪，休息完換回工作不記輪", () => {
    const now = new Date(2026, 7, 31, 9, 0);
    const afterWork = advance(fresh(), now);
    expect(afterWork.mode).toBe("rest");
    expect(afterWork.rounds).toBe(1);

    const afterRest = advance(afterWork, now);
    expect(afterRest.mode).toBe("work");
    expect(afterRest.rounds, "休息不算一輪").toBe(1);
  });

  it("輪數跨日歸零", () => {
    const w = {
      ...EMPTY,
      pomodoro: { ...fresh(), rounds: 4, roundsDate: "2026-08-30" },
    };
    expect(roundsToday(w, new Date(2026, 7, 31))).toBe(0);
    expect(roundsToday(w, new Date(2026, 7, 30))).toBe(4);
  });

  it("重設不會把今天累積的輪數清掉", () => {
    const p = reset({ ...fresh(), rounds: 3, roundsDate: "2026-08-31", endsAt: 999 });
    expect(p.endsAt).toBeNull();
    expect(p.rounds).toBe(3);
  });

  it("顯示格式補零", () => {
    expect(formatLeft(25 * 60_000)).toBe("25:00");
    expect(formatLeft(61_000)).toBe("1:01");
    expect(formatLeft(0)).toBe("0:00");
    // 無條件進位，才不會在還剩半秒時就顯示 0:00
    expect(formatLeft(500)).toBe("0:01");
  });
});

describe("待辦", () => {
  it("空白不建立，前後空格去掉", () => {
    expect(makeTodo("   ")).toBeNull();
    expect(makeTodo("  買牛奶  ")!.text).toBe("買牛奶");
    expect(makeTodo("買牛奶")!.done).toBe(false);
  });
});

describe("遷移", () => {
  it("舊資料補上預設值，番茄鐘欄位不會缺", () => {
    const w = migrate({ note: "舊筆記" });
    expect(w.note).toBe("舊筆記");
    expect(w.todos).toEqual([]);
    expect(w.pomodoro.mode).toBe("work");
    expect(w.schemaVersion).toBe(EMPTY.schemaVersion);
  });

  it("番茄鐘只存了一半也要補齊", () => {
    const w = migrate({ pomodoro: { mode: "rest" } });
    expect(w.pomodoro.mode).toBe("rest");
    expect(w.pomodoro.endsAt).toBeNull();
    expect(w.pomodoro.rounds).toBe(0);
  });
});
