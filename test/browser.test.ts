// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extensionsUrl } from "../src/lib/browser";

/**
 * 擴充功能管理頁的網址。
 *
 * 同一份程式碼要同時上 Edge 與 Chrome 兩家商店。寫死其中一個，
 * 另一邊的使用者就會照著一個開不起來的網址去找自己的擴充功能。
 */

function fakeUA(brands: string[] | null, ua: string) {
  const nav = navigator as unknown as Record<string, unknown>;
  const had = "userAgentData" in nav;
  const old = nav.userAgentData;
  if (brands)
    nav.userAgentData = { brands: brands.map((brand) => ({ brand })) };
  else delete nav.userAgentData;
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  return () => {
    if (had) nav.userAgentData = old;
    else delete nav.userAgentData;
  };
}

afterEach(() => vi.restoreAllMocks());

describe("擴充功能管理頁", () => {
  it("Edge 走 edge://，其餘 Chromium 走 chrome://", () => {
    let undo = fakeUA(["Chromium", "Microsoft Edge", "Not_A Brand"], "");
    expect(extensionsUrl()).toBe("edge://extensions");
    undo();

    undo = fakeUA(["Chromium", "Google Chrome", "Not_A Brand"], "");
    expect(extensionsUrl()).toBe("chrome://extensions");
    undo();
  });

  it("沒有 userAgentData 的時候退回 UA 字串", () => {
    // Chromium 版 Edge 的權杖是 Edg，不是 Edge —— 比對 "Edge" 會漏掉
    let undo = fakeUA(
      null,
      "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    );
    expect(extensionsUrl()).toBe("edge://extensions");
    undo();

    undo = fakeUA(null, "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36");
    expect(extensionsUrl()).toBe("chrome://extensions");
    undo();
  });

  it("字串包裡不准再寫死任何一家的網址", () => {
    for (const loc of ["zh_TW", "en"]) {
      const raw = readFileSync(`public/_locales/${loc}/messages.json`, "utf8");
      const bundle = JSON.parse(raw) as Record<string, { message: string }>;
      const bad = Object.entries(bundle)
        .filter(([, v]) => /(edge|chrome):\/\//.test(v.message))
        .map(([k]) => k);
      expect(bad, `${loc} 裡這些鍵寫死了瀏覽器`).toEqual([]);
    }
  });
});
