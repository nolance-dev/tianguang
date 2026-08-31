/**
 * 搜尋列。
 *
 * 兩件事：判斷輸入的是網址還是關鍵字，以及前綴切引擎。
 * 前綴用 `g ` 這種形式（字母加空白），不是 DuckDuckGo 的 `!bang` ——
 * bang 本身就是 DDG 的語法，佔用它會讓習慣 bang 的人踩到。
 */

export interface Engine {
  id: string;
  name: string;
  /** 打字前綴。輸入 "g 天光" 就走 Google，不用去設定裡換。 */
  prefix: string;
  url: string;
}

export const ENGINES: Engine[] = [
  { id: "bing", name: "Bing", prefix: "b", url: "https://www.bing.com/search?q=%s" },
  { id: "google", name: "Google", prefix: "g", url: "https://www.google.com/search?q=%s" },
  { id: "duckduckgo", name: "DuckDuckGo", prefix: "d", url: "https://duckduckgo.com/?q=%s" },
  { id: "brave", name: "Brave", prefix: "v", url: "https://search.brave.com/search?q=%s" },
  { id: "perplexity", name: "Perplexity", prefix: "p", url: "https://www.perplexity.ai/search?q=%s" },
];

export function engineById(id: string): Engine {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0]!;
}

/**
 * 看起來像網址就直接開，不要丟去搜尋。
 * 判斷從嚴：有空白一律當關鍵字；沒有點就不是網域（localhost 例外）。
 */
export function looksLikeUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return true;
  if (s.startsWith("localhost") || s.startsWith("127.0.0.1")) return true;
  const host = s.split(/[/?#]/, 1)[0]!;
  // 至少要有一個點，而且最後一段是兩個字母以上，才算網域
  return /^[^.\s]+(\.[^.\s]+)+$/.test(host) && /\.[a-z]{2,}$/i.test(host);
}

export interface Resolved {
  url: string;
  /** 有用到打字前綴時，指出換去哪個引擎，UI 可以順手提示 */
  engine?: Engine;
}

export function resolve(raw: string, defaultEngineId: string): Resolved | null {
  const input = raw.trim();
  if (!input) return null;

  // 前綴：單一字母加空白，且後面還有東西
  let query = input;
  let engine = engineById(defaultEngineId);
  const m = /^([a-z])\s+(.+)$/i.exec(input);
  if (m) {
    const hit = ENGINES.find((e) => e.prefix === m[1]!.toLowerCase());
    if (hit) {
      engine = hit;
      query = m[2]!;
      return { url: engine.url.replace("%s", encodeURIComponent(query)), engine: hit };
    }
  }

  if (looksLikeUrl(query)) {
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(query) ? query : `https://${query}`;
    return { url };
  }
  return { url: engine.url.replace("%s", encodeURIComponent(query)) };
}
