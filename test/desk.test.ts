import { describe, expect, it } from "vitest";
import {
  COLS,
  DEFAULT_DESK,
  kindOf,
  LINKS_PER_CARD,
  MAX_H,
  move,
  normalize,
  nudge,
  resize,
  type Tile,
} from "../src/lib/desk";

const ids = (list: Tile[]) => list.map((t) => t.id);

describe("整理存下來的版面", () => {
  it("什麼都沒存就用預設", () => {
    expect(normalize(undefined)).toEqual(DEFAULT_DESK);
    expect(normalize(null)).toEqual(DEFAULT_DESK);
    expect(normalize("壞掉的東西")).toEqual(DEFAULT_DESK);
  });

  it("以存的順序為準", () => {
    const saved = [
      { id: "pomodoro", w: 1, h: 1 },
      { id: "note", w: 3, h: 2 },
      { id: "todos", w: 2, h: 1 },
    ];
    expect(ids(normalize(saved)).slice(0, 3)).toEqual([
      "pomodoro",
      "note",
      "todos",
    ]);
  });

  it("缺的卡補在最後面，不插隊", () => {
    const out = normalize([{ id: "note", w: 4, h: 1 }]);
    expect(out[0]!.id, "存過的排前面").toBe("note");
    expect(ids(out)).toHaveLength(DEFAULT_DESK.length);
    expect(ids(out)).toContain("todos");
    expect(ids(out)).toContain("pomodoro");
  });

  it("不認得的卡丟掉，重複的只留第一次", () => {
    const out = normalize([
      { id: "焦點", w: 2, h: 1 },
      { id: "note", w: 1, h: 1 },
      { id: "note", w: 4, h: 3 },
    ]);
    expect(ids(out).filter((i) => i === "note")).toHaveLength(1);
    expect(out.find((x) => x.id === "note")!.w, "留的是第一次那筆").toBe(1);
    expect(ids(out)).not.toContain("焦點");
  });

  it("尺寸夾在範圍內，壞值退回預設", () => {
    const out = normalize([
      { id: "todos", w: 99, h: -4 },
      { id: "note", w: "寬", h: null },
    ]);
    expect(out[0]).toEqual({ id: "todos", w: COLS, h: 1 });
    expect(out[1], "非數字就用預設的 2 × 1").toEqual({
      id: "note",
      w: 2,
      h: 1,
    });
  });
});

describe("換位置", () => {
  const base: Tile[] = [
    { id: "todos", w: 2, h: 1 },
    { id: "note", w: 2, h: 1 },
    { id: "pomodoro", w: 1, h: 1 },
  ];

  it("搬到目標現在的位置，其餘往後推", () => {
    expect(ids(move(base, "pomodoro", "todos"))).toEqual([
      "pomodoro",
      "todos",
      "note",
    ]);
    expect(ids(move(base, "todos", "pomodoro"))).toEqual([
      "note",
      "pomodoro",
      "todos",
    ]);
  });

  it("搬到自己身上不動，也不重建陣列", () => {
    expect(move(base, "note", "note")).toBe(base);
  });

  it("鍵盤挪一格，到頭了就停住不繞回去", () => {
    expect(ids(nudge(base, "note", -1))).toEqual(["note", "todos", "pomodoro"]);
    expect(ids(nudge(base, "todos", -1)), "已經在最前面").toEqual(ids(base));
    expect(ids(nudge(base, "pomodoro", 1)), "已經在最後面").toEqual(ids(base));
  });
});

describe("改大小", () => {
  const base: Tile[] = [{ id: "todos", w: 2, h: 1 }];

  it("夾在一到四欄、一到三列", () => {
    expect(resize(base, "todos", 9, 9)[0]).toEqual({
      id: "todos",
      w: COLS,
      h: MAX_H,
    });
    expect(resize(base, "todos", 0, 0)[0]).toEqual({ id: "todos", w: 1, h: 1 });
  });

  it("只動指定那張", () => {
    const two: Tile[] = [...base, { id: "note", w: 2, h: 1 }];
    const out = resize(two, "todos", 4, 2);
    expect(out[1]).toEqual(two[1]);
  });
});

describe("好幾張快速存取", () => {
  it("id 認得出種類", () => {
    expect(kindOf("links")).toBe("links");
    expect(kindOf("links2")).toBe("links");
    expect(kindOf("links9")).toBe("links");
    // 其餘的卡一種一張，id 就是種類
    expect(kindOf("calendar")).toBe("calendar");
    expect(kindOf("clock")).toBe("clock");
  });

  it("多出來的那幾張補在最後面，尺寸沿用第一張的預設", () => {
    const out = normalize(DEFAULT_DESK, ["links", "links2", "links3"]);
    expect(ids(out).slice(-2)).toEqual(["links2", "links3"]);
    const first = out.find((t) => t.id === "links")!;
    for (const id of ["links2", "links3"]) {
      const t = out.find((x) => x.id === id)!;
      expect([t.w, t.h]).toEqual([first.w, first.h]);
    }
  });

  it("存下來的位置留著 —— 排到前面的第二張不會被推回最後", () => {
    const saved: Tile[] = [
      { id: "links2", w: 1, h: 1 },
      { id: "clock", w: 2, h: 1 },
    ];
    const out = normalize(saved, ["links", "links2"]);
    expect(ids(out)[0]).toBe("links2");
    // 而且它自己的尺寸也留著，不會被預設蓋掉
    expect(out[0]).toEqual({ id: "links2", w: 1, h: 1 });
  });

  it("一張裝十六個", () => {
    expect(LINKS_PER_CARD).toBe(16);
  });
});

describe("快速存取只能左右拉", () => {
  it("存成幾列都會被拉回一列", () => {
    const out = normalize(
      [
        { id: "links", w: 3, h: 3 },
        { id: "links2", w: 2, h: 2 },
        { id: "note", w: 2, h: 3 },
      ],
      ["links", "links2"],
    );
    expect(out.find((t) => t.id === "links")!.h).toBe(1);
    expect(out.find((t) => t.id === "links2")!.h).toBe(1);
    // 其他卡不受影響
    expect(out.find((t) => t.id === "note")!.h).toBe(3);
  });

  it("拉大小的時候，寬度改得動、高度改不動", () => {
    const list = normalize([{ id: "links", w: 2, h: 1 }]);
    const wider = resize(list, "links", 4, 3);
    expect(wider.find((t) => t.id === "links")).toEqual({
      id: "links",
      w: 4,
      h: 1,
    });
  });
});
