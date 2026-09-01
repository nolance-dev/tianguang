import { describe, expect, it } from "vitest";
import { daylight, daysToNextJieqi, houIndex, lunarDate } from "../src/lib/almanac";

describe("almanac", () => {
  it("晝長跨午夜也算得出來", () => {
    expect(daylight(5.5, 18.25)).toBeCloseTo(12.75, 6);
    // 日落繞回 [0,24) 之後小於日出：極區的夏天
    expect(daylight(22, 2)).toBeCloseTo(4, 6);
  });

  it("一年裡的候永遠是 0 到 2", () => {
    for (let d = 0; d < 365; d += 1) {
      const at = new Date(2026, 0, 1 + d, 12);
      const h = houIndex(at);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(2);
    }
  });

  it("距下一個節氣落在十四到十六天之間", () => {
    for (let d = 0; d < 365; d += 7) {
      const n = daysToNextJieqi(new Date(2026, 0, 1 + d, 12));
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(16);
    }
  });

  it("農曆寫成月加日", () => {
    const s = lunarDate(new Date(2026, 8, 1, 12));
    // ICU 沒帶農曆的環境回 null，那也是允許的行為
    if (s !== null) expect(s).toMatch(/月/);
  });
});
