// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextQuote, resetQuoteSlot } from "../src/lib/quotes";

/**
 * 語錄的輪替。
 *
 * 規則只有一條：六十句每一句都出現過一次，才會有第二次。
 * 隨機抽做不到這件事 —— 不重複是機率，不是保證。
 */

beforeEach(() => {
  localStorage.clear();
  // 每個分頁只走一格，測試要一頁一頁地模擬
  resetQuoteSlot();
});

/** 開一個新分頁，抽那一句 */
function open(english = false) {
  resetQuoteSlot();
  return nextQuote(english);
}

describe("語錄", () => {
  it("走完一輪六十句，一句不漏也一句不重", () => {
    const seen = Array.from({ length: 60 }, () => open().text);
    expect(seen.length).toBe(60);
    expect(new Set(seen).size, "整輪之內不能重複").toBe(60);
  });

  it("六十句之後才從頭來", () => {
    const first = open().text;
    for (let i = 0; i < 59; i++) open();
    expect(open().text).toBe(first);
  });

  it("英文那一份也是六十句，各走各的", () => {
    const seen = Array.from({ length: 60 }, () => open(true).text);
    expect(new Set(seen).size).toBe(60);
  });

  it("照列表順序走，不是隨機", () => {
    const a = open().text;
    localStorage.clear();
    const b = open().text;
    // 同一個起點一定得到同一句 —— 隨機抽做不到
    expect(b).toBe(a);
  });

  it("同一個分頁裡重複問，拿到的是同一句", () => {
    const a = nextQuote(false);
    expect(nextQuote(false)).toEqual(a);
    // 語言換了是同一號的另一種說法，不多走一格
    const other = nextQuote(true);
    expect(nextQuote(false)).toEqual(a);
    expect(other.text).not.toBe(a.text);
    expect(localStorage.getItem("tg.quote")).toBe("1");
  });

  it("手改過的游標不會讓它爆掉", () => {
    for (const junk of ["", "-3", "abc", "9e99", "1.5"]) {
      localStorage.setItem("tg.quote", junk);
      const q = open();
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.by.length).toBeGreaterThan(0);
    }
  });

  it("localStorage 完全用不了的時候還是要有一句", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("denied");
      });
    try {
      expect(open().text.length).toBeGreaterThan(0);
    } finally {
      get.mockRestore();
    }
  });
});
