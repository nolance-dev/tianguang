import { describe, expect, it } from "vitest";
import { fileName, pack, SNAPSHOT_VERSION, unpack } from "../src/lib/snapshot";
import { DEFAULTS } from "../src/lib/settings";
import { EMPTY } from "../src/lib/workspace";

describe("備份的包裝", () => {
  it("包起來再拆開，設定與工作區都還在", () => {
    const settings = { ...DEFAULTS, name: "阿明", linkCards: 3 };
    const work = {
      ...EMPTY,
      note: "記一筆",
      todos: [{ id: "a", text: "買菜", done: false, createdAt: 1 }],
    };

    const got = unpack(JSON.parse(JSON.stringify(pack(settings, work))));
    expect(got).not.toBeNull();
    expect(got!.settings.name).toBe("阿明");
    expect(got!.settings.linkCards).toBe(3);
    expect(got!.workspace.note).toBe("記一筆");
    expect(got!.workspace.todos[0]!.text).toBe("買菜");
  });

  it("認不出來的東西一律回 null，不猜", () => {
    expect(unpack(null)).toBeNull();
    expect(unpack("不是物件")).toBeNull();
    expect(unpack({})).toBeNull();
    expect(unpack({ app: "別的擴充功能", version: 1 })).toBeNull();
    // 比這一版還新的檔案不硬讀 —— 讀錯比讀不到糟
    expect(
      unpack({ app: "tianguang", version: SNAPSHOT_VERSION + 1, settings: {} }),
    ).toBeNull();
  });

  it("缺欄位的舊檔案補成預設，不是丟掉", () => {
    const got = unpack({
      app: "tianguang",
      version: 1,
      settings: { name: "只有名字" },
    });
    expect(got).not.toBeNull();
    expect(got!.settings.name).toBe("只有名字");
    // 沒寫到的欄位回到預設，而不是 undefined
    expect(got!.settings.linkCards).toBe(DEFAULTS.linkCards);
    expect(got!.workspace.todos).toEqual([]);
  });

  it("檔名帶到分鐘 —— 一個資料夾裡躺三份時只有它分得出來", () => {
    expect(fileName(new Date(2026, 8, 2, 9, 5))).toBe(
      "tianguang-20260902-0905.json",
    );
  });
});
