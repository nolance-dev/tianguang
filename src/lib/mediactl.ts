/**
 * 播放控制。
 *
 * 這一段的前提在 media.ts 的開頭寫過：瀏覽器沒有給擴充功能全域媒體控制的
 * API，`navigator.mediaSession` 的處理器是頁面自己註冊的，從外面叫不動。
 * 所以要控制，只有一條路 —— 用 chrome.scripting 注進那個分頁，在頁面裡動手。
 *
 * 兩件事因此變成事實，而不是選擇：
 *
 * **播放／暫停是通用的。** 幾乎每個播放器最後都落在一個 <video> 或 <audio>
 * 上，抓到它呼叫 play()／pause() 就成。Spotify 是例外（登出時頁面上沒有媒體
 * 元素），所以它多帶一個自己的按鈕選擇器。
 *
 * **上一首／下一首不是通用的。** 沒有標準，只能點各站自己的按鈕。所以這裡
 * 一站一個轉接器，選擇器是**實際去那個站上量出來的**，不是憑印象寫的
 * （tools/probe-media.mjs 會重跑一次）。量不到的站就不給那兩顆鈕 ——
 * 按了沒反應比沒有那顆鈕更糟。
 *
 * 對方改版時只壞那一站，而且壞在一個看得見的地方：鈕還在但沒反應。
 * 重跑探測腳本就知道新的選擇器是什麼。
 */

export type Cmd = "toggle" | "next" | "prev";

/**
 * 能控制哪些站。
 *
 * 這一串必須跟 manifest 的 optional_host_permissions 對得上 ——
 * 沒宣告的來源就算按了也要不到權限。test/mediactl.test.ts 盯著這件事。
 *
 * 為什麼是具名清單而不是 <all_urls>：控制一個播放器要的是「進得去那一頁」，
 * 而那是這個擴充功能最不想要的東西。列出來的十個站涵蓋了實際會在
 * 「正在播放」裡出現的絕大多數，而審查看到的是一串站名，不是一句
 * 「所有網站」—— 對使用者也一樣，瀏覽器跳出來問的是 youtube.com，
 * 不是你所有的網頁。
 *
 * 要加站就兩邊一起加，然後去量它的上下首選擇器（tools/probe-media.mjs）。
 */
export const CONTROLLABLE: string[] = [
  "youtube.com",
  "open.spotify.com",
  "soundcloud.com",
  "bilibili.com",
  "music.apple.com",
  "twitch.tv",
  "nicovideo.jp",
  "mixcloud.com",
  "deezer.com",
  "bandcamp.com",
];

/** 這一站在不在清單上。不在就連播放／暫停都不長出來 */
export function canControl(host: string): boolean {
  return CONTROLLABLE.some((k) => host === k || host.endsWith("." + k));
}

export interface Adapter {
  /** 點這些就換上一首／下一首。空的代表這一站做不到 */
  next: string[];
  prev: string[];
  /** 播放／暫停優先點的按鈕。空的就走通用的媒體元素 */
  toggle: string[];
}

const NONE: Adapter = { next: [], prev: [], toggle: [] };

/**
 * 站台轉接器。鍵是 hostOf() 之後的網域（已經去掉 www.）。
 *
 * 每一條的選擇器都在 2026-09-08 用 tools/probe-media.mjs 實地量過存在。
 * 沒量到的站不列 —— Bilibili 的單片頁沒有上下首按鈕（量到的只有播放、
 * 清晰度、倍速、音量），Apple Music 網頁版抓得到的 Next 全是「下一頁」。
 * 那兩站走通用的播放／暫停就好。
 */
export const ADAPTERS: Record<string, Adapter> = {
  "music.youtube.com": {
    next: [".next-button"],
    prev: [".previous-button"],
    toggle: [],
  },
  "youtube.com": {
    next: [".ytp-next-button"],
    prev: [".ytp-prev-button"],
    toggle: [],
  },
  "soundcloud.com": {
    next: [".skipControl__next", ".playControls__next"],
    prev: [".skipControl__previous", ".playControls__prev"],
    toggle: [],
  },
  "open.spotify.com": {
    next: ['[data-testid="control-button-skip-forward"]'],
    prev: ['[data-testid="control-button-skip-back"]'],
    // 登出狀態的 Spotify 頁面上沒有 <video>／<audio>，通用那條走不通
    toggle: ['[data-testid="control-button-playpause"]'],
  },
};

/** 先比完整網域，再比子網域 —— music.youtube.com 不能被 youtube.com 接走。 */
export function adapterFor(host: string): Adapter {
  const exact = ADAPTERS[host];
  if (exact) return exact;
  for (const [key, val] of Object.entries(ADAPTERS)) {
    if (host.endsWith("." + key)) return val;
  }
  return NONE;
}

/** 這一站給不給切歌。決定那兩顆鈕出不出現。 */
export function canSkip(host: string): boolean {
  if (!canControl(host)) return false;
  const a = adapterFor(host);
  return a.next.length > 0 && a.prev.length > 0;
}

/**
 * 要注入哪個來源。
 *
 * 只要這一站，不是所有站。使用者按下播放鍵的那一刻才問，而且問的是
 * 「youtube.com」而不是「你所有的網頁」—— 差別在瀏覽器的那個對話框上
 * 看得一清二楚。
 */
export function originOf(host: string): string {
  return `*://${host}/*`;
}

export function permissionsFor(host: string): chrome.permissions.Permissions {
  return { permissions: ["scripting"], origins: [originOf(host)] };
}

export async function hasControl(host: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  try {
    return await chrome.permissions.contains(permissionsFor(host));
  } catch {
    return false;
  }
}

/**
 * 要權限。必須在使用者手勢裡直接呼叫。
 *
 * 不先問 contains() 再決定要不要 request()：那個 await 會把手勢的資格切斷，
 * 瀏覽器就不給跳對話框了。已經給過的話 request() 本來就會直接回 true，
 * 不會多跳一次，所以每次都問是對的。
 */
export async function grantControl(host: string): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.permissions) return false;
  try {
    return await chrome.permissions.request(permissionsFor(host));
  } catch {
    return false;
  }
}

export type Result = "playing" | "paused" | "clicked" | "unsupported" | "none";

/**
 * 在頁面裡跑的那一段。
 *
 * 它會被序列化送過去，所以不能參照這個模組裡的任何東西 —— 要用的值一律
 * 從 args 傳。看起來重複的地方是這個限制造成的，不是忘了抽出來。
 */
function inPage(cmd: Cmd, sels: string[]): Result {
  for (const q of sels) {
    const el = document.querySelector(q) as HTMLElement | null;
    if (el && !(el as HTMLButtonElement).disabled) {
      el.click();
      return "clicked";
    }
  }
  if (cmd !== "toggle") return "unsupported";

  const media = Array.from(
    document.querySelectorAll("video, audio"),
  ) as HTMLMediaElement[];
  // 正在響的那個優先。一個頁面上常常有好幾個 <video>（預覽、廣告、背景動畫）
  const target = media.find((m) => !m.paused && !m.ended) ?? media[0];
  if (!target) return "none";
  if (target.paused) {
    void target.play();
    return "playing";
  }
  target.pause();
  return "paused";
}

/**
 * 對某個分頁下指令。
 *
 * allFrames 是必要的：嵌在別人網頁裡的 YouTube 播放器住在 iframe，
 * 只跑最上層那一格會找不到任何媒體元素。每一格都跑，取第一個有意義的答案。
 */
export async function control(
  tabId: number,
  host: string,
  cmd: Cmd,
): Promise<Result> {
  if (typeof chrome === "undefined" || !chrome.scripting?.executeScript)
    return "none";
  const a = adapterFor(host);
  const sels = cmd === "toggle" ? a.toggle : cmd === "next" ? a.next : a.prev;
  if (cmd !== "toggle" && sels.length === 0) return "unsupported";
  try {
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: inPage,
      args: [cmd, sels],
    });
    for (const f of frames) {
      const r = f.result as Result | undefined;
      if (r && r !== "none" && r !== "unsupported") return r;
    }
    return "none";
  } catch {
    // 分頁關了，或那個來源的權限剛好被撤掉
    return "none";
  }
}
