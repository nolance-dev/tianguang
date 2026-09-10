/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { cancelSave, DEFAULTS, save } from "../src/lib/settings";


/**
 * 還沒落盤的寫入要收得回來。
 *
 * save() 把寫入 debounce 三百毫秒，而 pending 是模組層的 —— 上一條測試排的
 * 那一次會在下一條測試跑到一半時醒來，把設定蓋過去。那是一條隨機紅的測試，
 * 而隨機紅跟沒有測試是同一回事。
 */
describe("取消還沒落盤的寫入", () => {
  it("cancelSave 之後那次寫入不會再醒過來", async () => {
    localStorage.clear();
    save({ ...DEFAULTS, name: "會被取消的" });
    cancelSave();
    await new Promise((r) => setTimeout(r, 400));
    expect(localStorage.getItem("tg.settings")).toBeNull();
  });

  it("不取消的話它會落盤 —— 上面那條才有意義", async () => {
    localStorage.clear();
    save({ ...DEFAULTS, name: "會落盤的" });
    await new Promise((r) => setTimeout(r, 400));
    const got = JSON.parse(localStorage.getItem("tg.settings") ?? "{}");
    expect(got.name).toBe("會落盤的");
    cancelSave();
  });
});
