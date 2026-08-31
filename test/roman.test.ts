import { describe, expect, it } from "vitest";
import { roman } from "../src/lib/roman";

describe("羅馬數字", () => {
  it("分刻環實際會用到的十二個", () => {
    const marks = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map(roman);
    expect(marks).toEqual([
      "V", "X", "XV", "XX", "XXV", "XXX", "XXXV", "XL", "XLV", "L", "LV", "LX",
    ]);
  });

  it("減法組合寫對", () => {
    expect(roman(4)).toBe("IV");
    expect(roman(9)).toBe("IX");
    expect(roman(14)).toBe("XIV");
    expect(roman(44)).toBe("XLIV");
    expect(roman(49)).toBe("XLIX");
  });

  it("零回空字串 —— 羅馬數字沒有零，呼叫端自己決定要顯示什麼", () => {
    expect(roman(0)).toBe("");
  });
});
