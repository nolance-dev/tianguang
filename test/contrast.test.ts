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

/**
 * 設定抽屜的次要文字扛不到 AA —— 那是刻意的，但要有人記著它有多低。
 *
 * mesh.ts 的 fg2 是把同一個字色淡成 .62／.66，那裡的註解寫明「淡的那一層
 * 本來就不扛 4.5」。決定沒問題，問題是沒有任何東西量過它，而 1.1.0 的
 * commit 訊息說設定抽屜用的是「contrast.test.ts 已經守住 4.5 的那組配色」——
 * 那句話對 fg 成立，對 fg2 不成立。抽屜同時把 --fg-2 指到 --solid-fg-2
 * （styles.css 的 .panel），h3、.note、未選取的分頁都吃那一格。
 *
 * 所以這裡不假裝它有 AA，而是把真正的下限釘住。要補到 AA 得讓 fg2 也走
 * harden()，那會改變整個介面的視覺層次，是設計決定不是修 bug。
 */
describe("設定抽屜的次要文字", () => {
  /** 全天實測最低約 2.57。低於這裡代表有人又把它調淡了 */
  const FLOOR = 2.5;

  const hex = (rgb: number[]) =>
    "#" +
    rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  /** fg2 是 rgba(r,g,b,a)，要先跟自己的底合成才有意義 */
  function fg2Ratio(hour: number): number {
    // --solid 是這個時刻的代表色，--solid-fg-2 是照它算的（見 App.tsx）
    const solid = paletteAt(hour).boot;
    const m = /rgba?\(([^)]+)\)/.exec(paletteForColor(solid).fg2)!;
    const [r, g, b, a] = m[1]!.split(",").map((x) => parseFloat(x)) as number[];
    const bg = [1, 3, 5].map((i) => parseInt(solid.slice(i, i + 2), 16));
    const mixed = [r!, g!, b!].map((v, i) => v * a! + bg[i]! * (1 - a!));
    return ratio(luminance(hex(mixed)), luminance(solid));
  }

  it("整天都不會比現在更糟", () => {
    let worst = { r: Infinity, at: 0 };
    for (let q = 0; q < 24; q += 0.05) {
      const got = fg2Ratio(q);
      if (got < worst.r) worst = { r: got, at: q };
    }
    expect(
      worst.r,
      `全天最低 ${worst.r.toFixed(2)}:1（${worst.at.toFixed(2)} 時）`,
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it("它確實還在 AA 之下 —— 補好的那天這一條會紅，提醒回來刪掉上面的註解", () => {
    let worst = Infinity;
    for (let q = 0; q < 24; q += 0.05) worst = Math.min(worst, fg2Ratio(q));
    expect(worst).toBeLessThan(AA);
  });
});
