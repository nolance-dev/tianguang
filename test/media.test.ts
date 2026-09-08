import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forgetRecent,
  hostOf,
  order,
  playing,
  toPlaying,
  type Playing,
} from "../src/lib/media";

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
  paused: false,
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
    const list = [
      p({ id: 1, windowId: 10 }),
      p({ id: 2, windowId: 10, active: true }),
    ];
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

/**
 * 暫停的分頁要留在清單上。
 *
 * chrome.tabs.query({ audible: true }) 只給「現在正在發出聲音」的。
 * 沒有播放控制時那是對的；有了之後，按下暫停那一列立刻消失，
 * 播放鍵就變成一次性的自毀鈕 —— 按下去就再也按不回來。
 */
describe("響過的分頁", () => {
  const tabs = (audible: chrome.tabs.Tab[], all: chrome.tabs.Tab[]) => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue(audible),
        get: vi.fn((id: number) => {
          const found = all.find((x) => x.id === id);
          return found ? Promise.resolve(found) : Promise.reject(new Error("gone"));
        }),
      },
    };
  };

  afterEach(() => {
    forgetRecent();
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
  });

  it("暫停之後還在清單上，而且標成 paused", async () => {
    const yt = tab({ id: 1, title: "song" });
    tabs([yt], [yt]);
    expect((await playing()).map((p) => [p.id, p.paused])).toEqual([[1, false]]);

    // 使用者按了暫停：分頁還開著，但不再發聲
    tabs([], [yt]);
    const after = await playing();
    expect(after.map((p) => [p.id, p.paused])).toEqual([[1, true]]);
  });

  it("分頁關掉就真的不見，不是永遠掛在那裡", async () => {
    const yt = tab({ id: 1 });
    tabs([yt], [yt]);
    await playing();
    tabs([], []);
    expect(await playing()).toEqual([]);
    // 而且要忘掉它 —— 不忘的話每一輪都白問一次 chrome.tabs.get
    tabs([], [yt]);
    expect(await playing()).toEqual([]);
  });

  it("記憶有上限，不會一整天累積成一長串", async () => {
    // 分頁一個一個開始響，而且都還開著 —— all 要累積，不然上一輪的
    // 會在這一輪被判定成關掉了，測到的就不是淘汰而是清空
    const all: chrome.tabs.Tab[] = [];
    for (let i = 1; i <= 10; i++) {
      const one = tab({ id: i });
      all.push(one);
      tabs([one], all);
      await playing();
    }
    tabs([], all);
    const kept = (await playing()).map((p) => p.id);
    expect(kept).toHaveLength(8);
    // 淘汰從最舊的開始
    expect(kept).not.toContain(1);
    expect(kept).toContain(10);
  });

  it("正在響的排在暫停的前面，不管在哪個視窗", () => {
    const rows = [
      p({ id: 1, paused: true, windowId: 10, active: true }),
      p({ id: 2, paused: false, windowId: 99 }),
    ];
    expect(order(rows, 10).map((x) => x.id)).toEqual([2, 1]);
  });
});
