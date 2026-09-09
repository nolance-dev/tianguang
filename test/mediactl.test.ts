import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ADAPTERS,
  CONTROLLABLE,
  adapterFor,
  canControl,
  canSkip,
  originOf,
} from "../src/lib/mediactl";

/**
 * 播放控制。
 *
 * 這一組盯的是三件會在不同地方各自漂走的東西：manifest 宣告了哪些來源、
 * 程式認為自己能控制哪些站、以及哪一站真的有上下首。三者對不上時，
 * 畫面上長出來的是一顆要不到權限、或按了沒反應的鈕。
 */

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
  optional_host_permissions: string[];
  optional_permissions: string[];
};

/** 把 manifest 的比對樣式剝成主機名，跟 CONTROLLABLE 同一個形狀 */
const declared = manifest.optional_host_permissions
  .map((h) =>
    h
      .replace(/^(?:https?|\*):\/\//, "")
      .replace(/^\*\./, "")
      .replace(/\/\*$/, ""),
  )
  .filter((h) => !h.includes("api.") && !h.includes("opendata"));

describe("可控制的站", () => {
  it("每一站在 manifest 裡都有對應的來源，否則按了要不到權限", () => {
    const missing = CONTROLLABLE.filter((h) => !declared.includes(h));
    expect(missing, "manifest 的 optional_host_permissions 少了").toEqual([]);
  });

  it("scripting 有宣告成選用權限", () => {
    expect(manifest.optional_permissions).toContain("scripting");
  });

  it("子網域算同一站", () => {
    expect(canControl("music.youtube.com")).toBe(true);
    expect(canControl("www.youtube.com")).toBe(true);
  });

  it("宣告成精確主機的站，子網域不給 —— 那顆鈕要不到權限", () => {
    /*
     * manifest 裡 open.spotify.com 與 music.apple.com 是精確主機，
     * 其餘是 *://*.host/*。實測過 chrome.permissions.contains()：
     * beta.music.apple.com 回 false。長出鈕來只會跳一次詢問然後失敗。
     */
    expect(canControl("music.apple.com")).toBe(true);
    expect(canControl("beta.music.apple.com")).toBe(false);
    expect(canControl("open.spotify.com")).toBe(true);
    expect(canControl("preview.open.spotify.com")).toBe(false);
    // 帶萬用字元宣告的那些，子網域照給
    expect(canControl("m.bilibili.com")).toBe(true);
    expect(canControl("www.youtube.com")).toBe(true);
  });

  it("沒宣告的站一律不能控制 —— 長出鈕來只是騙人", () => {
    expect(canControl("example.com")).toBe(false);
    // 尾綴要比在點上，notyoutube.com 不是 youtube.com 的子網域
    expect(canControl("notyoutube.com")).toBe(false);
  });
});

describe("站台轉接器", () => {
  it("完整網域先比，music.youtube.com 不會被 youtube.com 接走", () => {
    expect(adapterFor("music.youtube.com")).toBe(ADAPTERS["music.youtube.com"]);
    expect(adapterFor("music.youtube.com").next).toEqual([".next-button"]);
    expect(adapterFor("www.youtube.com").next).toEqual([".ytp-next-button"]);
  });

  it("沒有轉接器的站回空的，不是 undefined", () => {
    const a = adapterFor("example.com");
    expect(a.next).toEqual([]);
    expect(a.prev).toEqual([]);
    expect(a.toggle).toEqual([]);
  });

  it("量不到上下首的站不給那兩顆鈕", () => {
    // 實測過：Bilibili 單片頁只有播放、清晰度、倍速、音量，沒有上下首
    expect(canControl("www.bilibili.com")).toBe(true);
    expect(canSkip("www.bilibili.com")).toBe(false);
    // Apple Music 網頁版抓得到的 Next 全是「下一頁」
    expect(canSkip("music.apple.com")).toBe(false);
    expect(canSkip("open.spotify.com")).toBe(true);
  });

  it("有轉接器但沒宣告來源的話，一樣不給 —— 兩邊都要成立", () => {
    for (const host of Object.keys(ADAPTERS)) {
      expect(canControl(host), `${host} 沒宣告來源`).toBe(true);
    }
  });

  it("Spotify 要自己的播放鍵：登出時頁面上沒有媒體元素", () => {
    expect(adapterFor("open.spotify.com").toggle.length).toBeGreaterThan(0);
    // YouTube 有 <video>，走通用那條就好
    expect(adapterFor("www.youtube.com").toggle).toEqual([]);
  });
});

describe("要權限的來源", () => {
  it("只要這一站，不是所有站", () => {
    expect(originOf("open.spotify.com")).toBe("*://open.spotify.com/*");
    expect(originOf("www.youtube.com")).toBe("*://www.youtube.com/*");
  });
});
