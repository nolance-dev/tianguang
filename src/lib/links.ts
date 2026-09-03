/**
 * 快速連結。
 *
 * topSites 回傳幾筆是瀏覽器決定的，開發者指定不了，而且不含使用者自己在
 * Edge 新分頁上釘的捷徑。剛裝機、剛清過歷史、或隱私瀏覽用得多的人，
 * 很可能拿到空陣列 —— 所以自動帶入只是「幫你開個頭」，不是主要來源，
 * 空的時候要有像樣的空狀態，不是留一排空格子。
 */

export interface Link {
  id: string;
  title: string;
  url: string;
}

/**
 * 全部加起來最多幾個。一張卡裝十六個（desk.LINKS_PER_CARD），
 * 所以這個數是四張卡 —— 再多的話光是找一個連結就得掃過四張卡，
 * 那已經不是「快速」存取了。
 */
export const MAX_LINKS = 64;

/**
 * 主機名要像個主機名。
 *
 * 補上 https:// 之後，「抖音」這種一個詞也會 parse 成功 ——
 * new URL("https://抖音") 是合法的，主機名變成 punycode，連得到才有鬼。
 * 這件事最常發生在把名稱打進網址欄的時候：存下去不會有任何抱怨，
 * 磚上出現的是另一欄那串 https://... 的網址，名稱像是憑空消失了。
 * 要有一個點（example.com）、是 localhost、或是方括號包起來的 IPv6，才算數。
 */
function plausibleHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.startsWith("[") && host.endsWith("]")) return true;
  const dot = host.indexOf(".");
  return dot > 0 && dot < host.length - 1;
}

/** 把使用者輸入補成可用的網址。沒寫協定就補 https。 */
export function normalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProtocol);
    // 只收 http(s)。javascript: 這種東西不該進到一個會被點擊的磚上。
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!plausibleHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 沒填標題時的預設：拿網域，去掉 www。 */
export function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 磚上的字：取標題第一個字元。中文取字，英文取大寫字母。 */
export function initial(title: string): string {
  return [...title.trim()][0]?.toUpperCase() ?? "?";
}

/**
 * 兩格填反了就調過來。
 *
 * 網址在上、名稱在下，而兩個框長得一模一樣 —— 表單一開游標就在上面那格，
 * 想著「先打名字」的人有一半會把名稱打進網址欄。這件事沒有模稜兩可的空間：
 * 上面那格不是網址、下面那格是，那就是反了。與其罵人，不如收下。
 */
export function orderFields(a: string, b: string): [string, string] {
  return !normalizeUrl(a) && normalizeUrl(b) ? [b, a] : [a, b];
}

export function makeLink(url: string, title?: string): Link | null {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  return {
    id: crypto.randomUUID(),
    url: normalized,
    title: title?.trim() || titleFromUrl(normalized),
  };
}

/**
 * 瀏覽器內建的 favicon 快取。走 _favicon/ 需要 manifest 宣告 favicon 權限
 * 並把它列進 web_accessible_resources —— 這樣不必自己對外抓圖，
 * 離線也有圖示，而且不會洩漏使用者開過哪些站給第三方。
 */
export function faviconUrl(url: string, size = 64): string | null {
  if (typeof chrome === "undefined" || !chrome.runtime?.getURL) return null;
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url);
  u.searchParams.set("size", String(size));
  return u.toString();
}

/** 從瀏覽器的常用網站帶入，略過已經有的。回傳新增的部分。 */
export async function suggestFromTopSites(existing: Link[]): Promise<Link[]> {
  if (typeof chrome === "undefined" || !chrome.topSites?.get) return [];
  const seen = new Set(existing.map((l) => hostOf(l.url)));
  const sites = await chrome.topSites.get();
  const out: Link[] = [];
  for (const site of sites) {
    if (existing.length + out.length >= MAX_LINKS) break;
    const host = hostOf(site.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const link = makeLink(site.url, site.title);
    if (link) out.push(link);
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 拖曳排序：把 from 抽出來插到 to 的位置。 */
export function reorder(links: Link[], from: number, to: number): Link[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= links.length ||
    to >= links.length
  )
    return links;
  const next = links.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}
