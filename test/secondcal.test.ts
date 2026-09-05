// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { calLabel, calToday, subDate } from "../src/lib/secondcal";

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
    const y = calLabel(D, "roc");
    expect(y).toContain("115");
    // Edge 的 ICU 對 roc 不給 era，只回「115年」—— 那三個字是我們自己接的
    expect(y).not.toBe("115年");
    expect(y!.length).toBeGreaterThan("115年".length);
  });

  it("日本年號由 Intl 給，不寫死 —— 年號會換", () => {
    expect(calLabel(D, "japanese")).toContain("8");
  });

  it("每一套曆法在標題都要交代自己是誰", () => {
    // 關掉才可以沒有；其餘五套都得說得出這個月叫什麼
    expect(calLabel(D, "none")).toBeNull();
    for (const cal of [
      "chinese",
      "roc",
      "japanese",
      "islamic",
      "hebrew",
    ] as const)
      expect(calLabel(D, cal), `${cal} 標題沒東西`).toBeTruthy();
  });

  it("一個西曆月橫跨兩個陰曆月時，兩個名字都要列", () => {
    // 2026-09 橫跨農曆七月與八月
    expect(calLabel(D, "chinese")).toContain("／");
  });

  it("卡片上不能出現裸數字 —— 一行沒有標題可以交代框架", () => {
    /*
     * 伊斯蘭曆的 24 跟西曆的 24 長得一模一樣。卡片只有一行，沒有月份標題在
     * 旁邊，所以那一行自己要帶月份名，不然沒有人知道那個數字是什麼。
     */
    for (const cal of ["islamic", "hebrew"] as const) {
      const today = calToday(D, cal);
      expect(today, `${cal} 卡片空的`).toBeTruthy();
      expect(today, `${cal} 只印了一個裸數字`).not.toMatch(/^\d+$/);
    }
    // 農曆的「廿四」自帶字形，看得出是農曆，不必再加月
    expect(calToday(D, "chinese")).toMatch(/[初廿十一二三四五六七八九]/);
    expect(calToday(D, "roc")).toContain("115");
  });
});
