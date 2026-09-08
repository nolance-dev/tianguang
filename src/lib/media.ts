/**
 * 正在發出聲音的分頁。
 *
 * 這一項跟其他元件不一樣，得先講清楚做不到什麼：
 *
 * 瀏覽器**沒有**給擴充功能全域媒體控制的 API。拿得到的只有「哪些分頁正在
 * 發聲」、它們的標題與網站圖示，以及靜音的開關。曲名、演出者、封面、
 * 播放／暫停／下一首都不在裡面 —— 那些要對每一個播放中的網站注入
 * content script 去讀 `navigator.mediaSession`，需要 `<all_urls>`，
 * 而且「下一首」還得去模擬各家自己的按鈕，對方一改版就壞。
 *
 * 所以這裡做的是誠實的那一半：列出正在響的分頁、靜音、一鍵切過去。
 * 卡片的底圖用網站圖示放大糊掉 —— 那不是專輯封面，但它至少是真的，
 * 而且看一眼就知道聲音是從哪個站來的。
 */

export const MEDIA_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ["tabs"],
};

export interface Playing {
  id: number;
  windowId: number;
  title: string;
  /** 網域，給標題底下那一行 */
  host: string;
  favicon: string | null;
  muted: boolean;
  active: boolean;
  /**
   * 暫停中。曾經響過、分頁還開著，但現在沒聲音。
   *
   * 有了播放控制之後這一格才有意義：按下暫停的那一刻 audible 就變 false，
   * 分頁會從清單上消失 —— 於是那顆播放鍵按一下就把自己弄不見了，
   * 沒有辦法再按回來。所以響過的要留著。
   */
  paused: boolean;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * 排序：目前這個視窗的、正在看的那個排前面。
 *
 * 「哪個分頁在響」這個問題最常見的下一步是「把它關掉」或「切過去」，
 * 而手邊那個視窗裡的東西最可能是使用者剛剛在弄的。
 */
export function order(list: Playing[], windowId: number | null): Playing[] {
  return [...list].sort((a, b) => {
    // 正在響的一律排在暫停的前面，不管它在哪個視窗
    const live = Number(a.paused) - Number(b.paused);
    if (live) return live;
    const mine =
      Number(b.windowId === windowId) - Number(a.windowId === windowId);
    if (mine) return mine;
    return Number(b.active) - Number(a.active);
  });
}

/** chrome.tabs.Tab 轉成我們要的形狀。沒有網址就沒有身分，直接丟掉。 */
export function toPlaying(tab: chrome.tabs.Tab): Playing | null {
  if (tab.id === undefined || !tab.url) return null;
  const host = hostOf(tab.url);
  return {
    id: tab.id,
    windowId: tab.windowId ?? -1,
    title: tab.title?.trim() || host || String(tab.id),
    host,
    favicon: tab.favIconUrl ?? null,
    muted: tab.mutedInfo?.muted ?? false,
    active: tab.active ?? false,
    paused: false,
  };
}

/**
 * 響過的分頁記在這裡。
 *
 * chrome.tabs.query({ audible: true }) 問的是「現在正在發出聲音」，
 * 暫停的分頁不在裡面。沒有播放控制的時候那是對的行為；有了之後就不是 ——
 * 按下暫停，那一列立刻消失，播放鍵等於一次性的自毀鈕。
 *
 * 所以響過的留著，直到分頁真的關掉。上限八個，滿了丟最舊的 ——
 * 不設上限的話，一整天下來會累積出一長串早就不聽了的東西。
 */
const RECENT_MAX = 8;
const recent = new Map<number, Playing>();

/** 測試用。模組層的狀態要能歸零，否則前一條測試會漏到下一條。 */
export function forgetRecent(): void {
  recent.clear();
}

async function stillOpen(id: number): Promise<Playing | null> {
  try {
    const tab = await chrome.tabs.get(id);
    return toPlaying(tab);
  } catch {
    return null;
  }
}

export async function playing(): Promise<Playing[]> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return [];
  let audible: Playing[];
  try {
    const tabs = await chrome.tabs.query({ audible: true });
    audible = tabs.map(toPlaying).filter((p): p is Playing => p !== null);
  } catch {
    return [];
  }

  for (const p of audible) {
    // 先刪再塞，讓它排到 Map 的最後面 —— 淘汰要從最舊的開始
    recent.delete(p.id);
    recent.set(p.id, p);
  }
  while (recent.size > RECENT_MAX) {
    const oldest = recent.keys().next();
    if (oldest.done) break;
    recent.delete(oldest.value);
  }

  const live = new Set(audible.map((p) => p.id));
  const out = [...audible];
  for (const id of [...recent.keys()]) {
    if (live.has(id)) continue;
    const now = await stillOpen(id);
    if (!now) {
      recent.delete(id);
      continue;
    }
    out.push({ ...now, paused: true });
  }
  return out;
}

export async function setMuted(id: number, muted: boolean): Promise<void> {
  try {
    await chrome.tabs.update(id, { muted });
  } catch {
    // 分頁在這半秒內關掉了。下一次輪詢就不會再列出它。
  }
}

export async function focus(tab: Playing): Promise<void> {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    // 分頁可能在另一個視窗，只設 active 的話那個視窗還是在背後
    if (chrome.windows?.update)
      await chrome.windows.update(tab.windowId, { focused: true });
  } catch {
    // 同上
  }
}

export async function hasMediaAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  return chrome.permissions.contains(MEDIA_PERMISSIONS);
}

/** 必須在使用者手勢裡呼叫。 */
export async function requestMediaAccess(): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  try {
    return await chrome.permissions.request(MEDIA_PERMISSIONS);
  } catch {
    return false;
  }
}
