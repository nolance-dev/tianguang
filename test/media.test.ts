import { describe, expect, it } from "vitest";
import { hostOf, order, toPlaying, type Playing } from "../src/lib/media";

const tab = (over: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: 1,
    windowId: 10,
    url: "https://www.youtube.com/watch?v=x",
    title: "  某支影片  ",
    favIconUrl: "https://www.youtube.com/favicon.ico",
    active: false,
    mutedInfo: { muted: false },
    ...over,
  }) as chrome.tabs.Tab;

const p = (over: Partial<Playing>): Playing => ({
  id: 1,
  windowId: 10,
  title: "x",
  host: "x.com",
  favicon: null,
  muted: false,
  active: false,
  ...over,
});

describe("網域", () => {
  it("去掉 www，壞網址回空字串而不是丟例外", () => {
    expect(hostOf("https://www.youtube.com/watch")).toBe("youtube.com");
    expect(hostOf("https://open.spotify.com/x")).toBe("open.spotify.com");
    expect(hostOf("這不是網址")).toBe("");
  });
});

describe("轉成清單的一列", () => {
  it("標題去掉前後空白", () => {
    expect(toPlaying(tab({}))!.title).toBe("某支影片");
  });

  it("沒有標題就退回網域 —— 空白一列看不出是什麼", () => {
    expect(toPlaying(tab({ title: "   " }))!.title).toBe("youtube.com");
  });

  it("沒有網址就沒有身分，直接丟掉", () => {
    expect(toPlaying(tab({ url: undefined }))).toBeNull();
    expect(toPlaying(tab({ id: undefined }))).toBeNull();
  });

  it("靜音狀態讀 mutedInfo，沒有就是沒靜音", () => {
    expect(toPlaying(tab({ mutedInfo: { muted: true } }))!.muted).toBe(true);
    expect(toPlaying(tab({ mutedInfo: undefined }))!.muted).toBe(false);
  });
});

describe("排序", () => {
  it("同一個視窗的排前面 —— 手邊那個最可能是剛剛在弄的", () => {
    const list = [p({ id: 1, windowId: 99 }), p({ id: 2, windowId: 10 })];
    expect(order(list, 10).map((x) => x.id)).toEqual([2, 1]);
  });

  it("同一個視窗裡，正在看的那個再排前面", () => {
    const list = [p({ id: 1, windowId: 10 }), p({ id: 2, windowId: 10, active: true })];
    expect(order(list, 10).map((x) => x.id)).toEqual([2, 1]);
  });

  it("不知道自己在哪個視窗也不會炸", () => {
    const list = [p({ id: 1 }), p({ id: 2, active: true })];
    expect(order(list, null).map((x) => x.id)).toEqual([2, 1]);
  });

  it("不改動原本那個陣列", () => {
    const list = [p({ id: 1 }), p({ id: 2, active: true })];
    order(list, null);
    expect(list.map((x) => x.id)).toEqual([1, 2]);
  });
});
