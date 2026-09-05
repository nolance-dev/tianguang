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
  };
}

export async function playing(): Promise<Playing[]> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return [];
  try {
    // audible 是「現在正在發出聲音」。暫停中的分頁不算 —— 那是對的，
    // 一個暫停的 YouTube 分頁不該出現在「正在播放」裡。
    const tabs = await chrome.tabs.query({ audible: true });
    return tabs.map(toPlaying).filter((p): p is Playing => p !== null);
  } catch {
    return [];
  }
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
