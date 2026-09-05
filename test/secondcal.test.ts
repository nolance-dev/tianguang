// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { calYear, subDate } from "../src/lib/secondcal";

/**
 * 第二套曆法。
 *
 * 民國和日本年號跟西曆共用同一套月和日，差的只有年怎麼稱呼 ——
 * 逐格印「日」印出來的數字跟格子上方那個西曆日期一模一樣，四十二格重複
 * 四十二次。那不是資訊，是噪音，而且會讓人以為這個功能壞了。
 */

const D = new Date(2026, 8, 5); // 2026-09-05

describe("第二曆法", () => {
  it("只換年份稱呼的那兩套，格子裡不寫東西", () => {
    expect(subDate(D, "roc")).toBeNull();
    expect(subDate(D, "japanese")).toBeNull();
  });

  it("月和日真的不同的那幾套，格子照寫", () => {
    // 農曆 2026-09-05 是七月廿四前後，只驗它有寫東西而且不是西曆的日
    const lunar = subDate(D, "chinese");
    expect(lunar).not.toBeNull();
    expect(lunar!.text).not.toBe("5");
    expect(subDate(D, "islamic")).not.toBeNull();
  });

  it("民國要看得出是民國，不是一個孤零零的 115", () => {
    const y = calYear(D, "roc");
    expect(y).toContain("115");
    // Edge 的 ICU 對 roc 不給 era，只回「115年」—— 那三個字是我們自己接的
    expect(y).not.toBe("115年");
    expect(y!.length).toBeGreaterThan("115年".length);
  });

  it("日本年號由 Intl 給，不寫死 —— 年號會換", () => {
    expect(calYear(D, "japanese")).toContain("8");
  });

  it("其餘曆法沒有年號可講", () => {
    for (const cal of ["none", "chinese", "islamic", "hebrew"] as const)
      expect(calYear(D, cal)).toBeNull();
  });
});
