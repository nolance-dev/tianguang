import { describe, expect, it } from "vitest";
import {
  colorsAt,
  luminance,
  paletteAt,
  paletteForColor,
} from "../src/lib/mesh";

/**
 * 任何時刻都要讀得到。
 *
 * 起因是一次稽核量到的：下午三點半整頁變成淺字配淺底，番茄鐘那一屏的對比
 * 掉到 2.37:1（一般文字的 AA 門檻是 4.5，大字是 3）。原因是選字色用的是
 * 一個寫死的門檻 bgLuminance > 0.4，而深字與淺字真正打平的位置在 0.20 ——
 * 中間那一段一律挑到比較差的那一個，而下午的漸層正好從那裡滑過。
 *
 * 現在的做法是算出來的：先看純黑純白哪一邊上限比較高，再從設計色往那一邊
 * 推到 4.5 為止。這一條就是那個保證的看門人 —— 以後有人調色盤、加錨點、
 * 或是把門檻改回寫死的數字，這裡會先紅。
 */

const AA = 4.5;
const ratio = (a: number, b: number) =>
  a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);

describe("對比", () => {
  it("一天二十四小時，主頁面的字都在 AA 之上", () => {
    let worst = { r: Infinity, at: "" };
    // 每三分鐘一格。錨點之間是插值的，只驗整點會漏掉中間最糟的那一段
    for (let q = 0; q < 24; q += 0.05) {
      const c = colorsAt(q);
      const avg = (luminance(c[3]) + luminance(c[4]) + luminance(c[5])) / 3;
      const r = ratio(luminance(paletteAt(q).fg), avg);
      if (r < worst.r) {
        worst = {
          r,
          at: `${String(Math.floor(q)).padStart(2, "0")}:${String(
            Math.round((q % 1) * 60),
          ).padStart(2, "0")}`,
        };
      }
    }
    expect(worst.r, `最糟落在 ${worst.at}`).toBeGreaterThanOrEqual(AA);
  });

  it("純色底自己那一套字色也在 AA 之上", () => {
    /*
     * 番茄鐘整屏塗的是單一個 --solid，不是漸層平均，所以它得自己算一套 ——
     * 沿用 :root 的 --fg 會在某些時刻掉到 4.28。時辰盤早就自己帶一套了。
     */
    for (let q = 0; q < 24; q += 0.05) {
      const solid = colorsAt(q)[4];
      const r = ratio(luminance(paletteForColor(solid).fg), luminance(solid));
      expect(r, `${solid} 在 ${q.toFixed(2)} 時`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("使用者自選的純色，不管挑到哪一個都讀得到", () => {
    // 中間調的灰最難處理 —— 兩邊都不夠遠。逐階掃一次
    for (let v = 0; v <= 255; v += 3) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const r = ratio(luminance(paletteForColor(hex).fg), luminance(hex));
      expect(r, `底色 ${hex}`).toBeGreaterThanOrEqual(AA);
    }
  });
});
