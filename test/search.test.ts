import { describe, expect, it } from "vitest";
import { looksLikeUrl, resolve } from "../src/lib/search";

describe("網址判斷", () => {
  it("像網址的直接開", () => {
    for (const s of ["example.com", "www.example.com", "https://a.b/c?d=1", "localhost:5173", "中文.tw"]) {
      expect(looksLikeUrl(s), s).toBe(true);
    }
  });

  it("像關鍵字的不要當網址", () => {
    // 有空白、沒有點、或最後一段不是字母結尾，都不是網域
    for (const s of ["天光", "new tab extension", "example.com 好用嗎", "3.14", "", "  "]) {
      expect(looksLikeUrl(s), s).toBe(false);
    }
  });
});

describe("搜尋解析", () => {
  it("預設走設定的引擎", () => {
    expect(resolve("天光", "bing")!.url).toBe("https://www.bing.com/search?q=%E5%A4%A9%E5%85%89");
  });

  it("前綴切引擎，前綴本身不進查詢字串", () => {
    const r = resolve("g 天光", "bing")!;
    expect(r.engine!.id).toBe("google");
    expect(r.url).toBe("https://www.google.com/search?q=%E5%A4%A9%E5%85%89");
  });

  it("不認識的前綴當成一般關鍵字，整串照送", () => {
    const r = resolve("z 天光", "bing")!;
    expect(r.engine).toBeUndefined();
    expect(decodeURIComponent(r.url.split("q=")[1]!)).toBe("z 天光");
  });

  it("沒有協定的網址補 https", () => {
    expect(resolve("example.com", "bing")!.url).toBe("https://example.com");
    expect(resolve("http://example.com", "bing")!.url).toBe("http://example.com");
  });

  it("空白輸入不做事", () => {
    expect(resolve("   ", "bing")).toBeNull();
  });

  it("前綴後面是網址時仍然當搜尋，不會誤開網站", () => {
    // "g example.com" 是「用 Google 搜 example.com」，不是「開 example.com」
    const r = resolve("g example.com", "bing")!;
    expect(r.engine!.id).toBe("google");
    expect(r.url).toContain("google.com/search");
  });
});
