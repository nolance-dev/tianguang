/**
 * 指令面板的資料來源與排序。
 *
 * 這是天光真正沒有對手的地方：掃過十家以上的新分頁擴充功能，沒有一個
 * 去接瀏覽器手上的資料。開著的分頁、書籤、歷史、最近關閉、下載，
 * 全部在同一個輸入框裡。
 *
 * 權限全部是選用的，而且分開要 —— 只想搜書籤的人不必連歷史一起交出去。
 */

export type SourceId =
  "tabs" | "bookmarks" | "history" | "sessions" | "downloads";

export interface Item {
  id: string;
  source: SourceId | "action";
  title: string;
  /** 副標。網址、資料夾路徑、或動作說明。 */
  sub?: string;
  url?: string;
  /** 分頁類的結果要切過去，不是重新開一個 */
  tabId?: number;
  /** 最近關閉要用 sessions.restore */
  sessionId?: string;
  run?: () => void;
}

/** 每個來源要哪些權限。分開宣告，才能一次只要一個。 */
export const SOURCE_PERMISSIONS: Record<
  SourceId,
  chrome.permissions.Permissions
> = {
  tabs: { permissions: ["tabs"] },
  bookmarks: { permissions: ["bookmarks"] },
  history: { permissions: ["history"] },
  sessions: { permissions: ["sessions"] },
  downloads: { permissions: ["downloads"] },
};

/**
 * 子序列比對加權重。
 *
 * 不用完整的模糊比對函式庫 —— 這裡的清單頂多幾百筆，而且使用者輸入很短。
 * 規則只有三條：開頭命中最高、詞首命中次之、連續命中加分。
 * 回傳 -1 代表不match。
 */
export function score(text: string, query: string): number {
  if (!query) return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  const direct = t.indexOf(q);
  if (direct === 0) return 1000 - text.length;
  if (direct > 0) {
    // 接在分隔符後面算「詞首」，比夾在字中間有意義
    const boundary = direct === 0 || /[\s./\-_·—、（(]/.test(t[direct - 1]!);
    return (boundary ? 700 : 400) - direct - text.length * 0.1;
  }

  // 退回子序列：打 gh 也要找得到 GitHub
  let ti = 0;
  let hits = 0;
  let streak = 0;
  let best = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return -1;
    streak = at === ti ? streak + 1 : 1;
    best = Math.max(best, streak);
    hits++;
    ti = at + 1;
  }
  return 100 + hits * 5 + best * 10 - text.length * 0.1;
}

export function rank(items: Item[], query: string, limit = 40): Item[] {
  if (!query.trim()) return items.slice(0, limit);
  const scored: Array<[number, Item]> = [];
  for (const item of items) {
    const s = Math.max(
      score(item.title, query),
      score(item.sub ?? "", query) - 60,
    );
    if (s > 0) scored.push([s, item]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, limit).map(([, item]) => item);
}

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/* ---------- 各來源 ---------- */

export async function openTabs(): Promise<Item[]> {
  if (!chrome.tabs?.query) return [];
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((t) => t.id !== undefined && t.url)
    .map((t) => ({
      id: `tab-${t.id}`,
      source: "tabs" as const,
      title: t.title || host(t.url!),
      sub: host(t.url!),
      url: t.url,
      tabId: t.id,
    }));
}

export async function bookmarks(): Promise<Item[]> {
  if (!chrome.bookmarks?.search) return [];
  // 空字串會回傳全部；清單大時交給 rank 過濾，比每次打字都問一次瀏覽器快
  const found = await chrome.bookmarks.search({});
  return found
    .filter((b) => b.url)
    .map((b) => ({
      id: `bm-${b.id}`,
      source: "bookmarks" as const,
      title: b.title || host(b.url!),
      sub: host(b.url!),
      url: b.url,
    }));
}

export async function history(query: string): Promise<Item[]> {
  if (!chrome.history?.search) return [];
  // 歷史可能有數萬筆，這個一定要讓瀏覽器先過濾
  const found = await chrome.history.search({ text: query, maxResults: 60 });
  return found
    .filter((h) => h.url)
    .map((h) => ({
      id: `hi-${h.id}`,
      source: "history" as const,
      title: h.title || host(h.url!),
      sub: host(h.url!),
      url: h.url,
    }));
}

export async function recentlyClosed(): Promise<Item[]> {
  if (!chrome.sessions?.getRecentlyClosed) return [];
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
  const out: Item[] = [];
  for (const s of sessions) {
    if (s.tab?.url) {
      out.push({
        id: `se-${s.tab.sessionId}`,
        source: "sessions",
        title: s.tab.title || host(s.tab.url),
        sub: host(s.tab.url),
        url: s.tab.url,
        sessionId: s.tab.sessionId,
      });
    } else if (s.window?.tabs?.length) {
      out.push({
        id: `se-${s.window.sessionId}`,
        source: "sessions",
        title: s.window.tabs[0]?.title ?? "",
        sub: `${s.window.tabs.length}`,
        sessionId: s.window.sessionId,
      });
    }
  }
  return out;
}

export async function downloads(): Promise<Item[]> {
  if (!chrome.downloads?.search) return [];
  const found = await chrome.downloads.search({
    limit: 25,
    orderBy: ["-startTime"],
  });
  return found
    .filter((d) => d.state === "complete")
    .map((d) => ({
      id: `dl-${d.id}`,
      source: "downloads" as const,
      title: d.filename.split(/[\\/]/).pop() || d.filename,
      sub: host(d.url),
      url: d.finalUrl || d.url,
    }));
}

/** 開一筆結果。分頁是切過去，最近關閉是還原，其餘開新分頁。 */
export function activate(item: Item): void {
  if (item.run) {
    item.run();
    return;
  }
  if (item.tabId !== undefined && chrome.tabs?.update) {
    void chrome.tabs.update(item.tabId, { active: true });
    return;
  }
  if (item.sessionId && chrome.sessions?.restore) {
    void chrome.sessions.restore(item.sessionId);
    return;
  }
  if (item.url) location.href = item.url;
}
