import { describe, expect, it } from "vitest";
import { centerHour, dayFraction, greetSlot, indexAt, range } from "../src/lib/shichen";
import { ANCHORS, colorsAt, paletteAt } from "../src/lib/mesh";

const at = (h: number, m = 0) => new Date(2026, 7, 30, h, m, 0);

describe("時辰", () => {
  it("子時橫跨午夜，兩邊都算 0", () => {
    expect(indexAt(at(23))).toBe(0);
    expect(indexAt(at(23, 59))).toBe(0);
    expect(indexAt(at(0))).toBe(0);
    expect(indexAt(at(0, 59))).toBe(0);
    // 一過 01:00 就進丑時
    expect(indexAt(at(1))).toBe(1);
  });

  it("每兩小時進一格，一天剛好十二格", () => {
    const seen = new Set<number>();
    for (let h = 0; h < 24; h++) seen.add(indexAt(at(h)));
    expect(seen.size).toBe(12);
    expect(indexAt(at(6))).toBe(3); // 卯
    expect(indexAt(at(12))).toBe(6); // 午
    expect(indexAt(at(18))).toBe(9); // 酉
    expect(indexAt(at(22))).toBe(11); // 亥
  });

  it("起訖與中心互相對得上", () => {
    for (let k = 0; k < 12; k++) {
      const [start, end] = range(k);
      expect((start + 2) % 24).toBe(end);
      // 中心是起點加一小時
      expect((start + 1) % 24).toBe(centerHour(k));
    }
    expect(range(0)).toEqual([23, 1]);
    expect(range(11)).toEqual([21, 23]);
  });

  it("dayFraction 從子夜起算，正午剛好一半", () => {
    expect(dayFraction(at(0))).toBe(0);
    expect(dayFraction(at(12))).toBeCloseTo(0.5, 6);
    expect(dayFraction(at(18))).toBeCloseTo(0.75, 6);
  });

  it("問候語四段涵蓋全部十二格", () => {
    const slots = Array.from({ length: 12 }, (_, k) => greetSlot(k));
    expect(new Set(slots).size).toBe(4);
    expect(greetSlot(indexAt(at(6)))).toBe("dawn");
    expect(greetSlot(indexAt(at(13)))).toBe("day");
    expect(greetSlot(indexAt(at(19)))).toBe("dusk");
    expect(greetSlot(indexAt(at(2)))).toBe("night");
  });
});

describe("背景插值", () => {
  it("整點錨點回傳原色，不因為插值走樣", () => {
    expect(colorsAt(0)[3].toLowerCase()).toBe("#070b14");
    expect(colorsAt(12)[3].toLowerCase()).toBe("#d8e7f3");
  });

  it("繞一圈回到原點", () => {
    expect(colorsAt(24)).toEqual(colorsAt(0));
    expect(colorsAt(-6)).toEqual(colorsAt(18));
  });

  it("只有白天判定為亮底，前景才會翻成暗字", () => {
    expect(paletteAt(12).light).toBe(true);
    expect(paletteAt(0).light).toBe(false);
    expect(paletteAt(18).light).toBe(false);
    expect(paletteAt(12).fg).toBe("#1B2230");
    expect(paletteAt(0).fg).toBe("#F4F2EE");
  });

  it("插值連續，逐分鐘不會跳", () => {
    // 背景每秒重算一次，所以要測的是「每一格更新之間看不看得出來」，
    // 不是隔半小時差多少 —— 隔半小時本來就該差很多，那是一天在走。
    const delta = (a: string, b: string) =>
      [1, 3, 5].reduce(
        (acc, i) => acc + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)),
        0,
      );
    let worst = 0;
    let worstAt = 0;
    for (let m = 0; m < 24 * 60; m++) {
      const d = delta(paletteAt(m / 60).boot, paletteAt((m + 1) / 60).boot);
      if (d > worst) {
        worst = d;
        worstAt = m;
      }
    }
    expect(worst, `最大跳動在第 ${worstAt} 分，跳了 ${worst}`).toBeLessThan(8);
  });

  it("八個錨點等距分佈，換算後每三小時一組", () => {
    for (let k = 0; k < ANCHORS.length; k++) {
      expect(ANCHORS[k]!.hour).toBe(k * 3);
      // 錨點時刻要原樣回傳，不能被插值動到
      expect(colorsAt(ANCHORS[k]!.hour)).toEqual(ANCHORS[k]!.c);
    }
  });

  it("上午與下午不會塌成灰 —— 這是加密錨點要解決的問題", () => {
    // 彩度用 max-min 粗估就夠：死灰是三個通道幾乎相等
    const chroma = (hex: string) => {
      const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return Math.max(...v) - Math.min(...v);
    };
    for (const h of [8, 9, 10, 14, 15, 16]) {
      const c = colorsAt(h);
      const top = chroma(c[3]);
      expect(top, `${h} 點的天空 ${c[3]} 太灰`).toBeGreaterThan(20);
    }
  });
});
