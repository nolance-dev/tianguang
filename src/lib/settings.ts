/**
 * 設定儲存。
 *
 * 三個約束決定了這裡的寫法：
 *
 * 1. chrome.storage.sync 的限制不只每項 8KB —— 還有總計 100KB、最多 512 項、
 *    每分鐘 120 次寫入。所以整份設定存成「一項」，不是一個欄位一項，
 *    而且所有寫入都 debounce。
 * 2. sync 寫失敗（配額滿、離線、被政策擋）必須降級寫 local 並讓使用者知道，
 *    不能靜默吞掉。
 * 3. 首屏不能白閃。chrome.storage 是非同步的，來不及在第一次繪製前回來，
 *    所以每次存檔順手把首屏要用的幾個值鏡到 localStorage，
 *    index.html 裡的同步 inline script 直接讀它。
 */

import { paletteAt } from "./mesh";

export const SCHEMA_VERSION = 1;

export type BackgroundSource = "mesh" | "solid" | "image";

export interface Settings {
  schemaVersion: number;
  name: string;
  clock24: boolean;
  showSeconds: boolean;
  searchEngine: string;
  background: BackgroundSource;
  solidColor: string;
  /** 換成自訂圖之後，是否仍依時辰疊一層明暗與色溫 */
  shichenTint: boolean;
  grain: number;
  dim: number;
  blur: number;
}

export const DEFAULTS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  name: "",
  clock24: true,
  showSeconds: false,
  searchEngine: "bing",
  background: "mesh",
  solidColor: "#131C30",
  shichenTint: true,
  grain: 0.055,
  dim: 0,
  blur: 0,
};

const KEY = "tg.settings";
const BOOT_KEY = "tg.boot";

/** 之後每加一版就在下面接一段 if，不要回頭改前面的。 */
export function migrate(raw: Record<string, unknown>): Settings {
  const v = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;

  // 比這一版還新的設定，是從裝了新版的另一台電腦同步回來的。
  // 硬套會把我們還不認識的欄位吃掉，所以原樣留著，只補上缺的鍵，
  // 版本號也不往下改 —— 那台電腦下次同步時才不會被降級。
  if (v > SCHEMA_VERSION) return { ...DEFAULTS, ...raw } as Settings;

  // v <= SCHEMA_VERSION：目前只有第一版，補預設值即可。
  // 之後每加一版在這裡接一段 if (v < N) { ... }
  return { ...DEFAULTS, ...raw, schemaVersion: SCHEMA_VERSION } as Settings;
}

const hasChrome = typeof chrome !== "undefined" && !!chrome.storage;

export type SaveOutcome = "synced" | "local-fallback";

export async function load(): Promise<Settings> {
  if (!hasChrome) {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }
  // sync 先，沒有才看 local —— local 可能是上次 sync 失敗降級留下的
  const fromSync = (await chrome.storage.sync.get(KEY)) as Record<string, unknown>;
  if (fromSync[KEY]) return migrate(fromSync[KEY] as Record<string, unknown>);
  const fromLocal = (await chrome.storage.local.get(KEY)) as Record<string, unknown>;
  if (fromLocal[KEY]) return migrate(fromLocal[KEY] as Record<string, unknown>);
  return { ...DEFAULTS };
}

/**
 * 把首屏需要的值鏡到 localStorage。只鏡最小集合：一個底色。
 * 首屏 inline script 讀不到也不會壞，它有依時刻算出來的預設表可以退。
 */
export function mirrorBoot(s: Settings, now = new Date()): void {
  try {
    const color =
      s.background === "solid" ? s.solidColor : paletteAt(now.getHours() + now.getMinutes() / 60).boot;
    localStorage.setItem(BOOT_KEY, JSON.stringify({ color, dim: s.dim }));
  } catch {
    // 無痕視窗或封鎖站台資料時會丟例外。首屏會退回內建色表，不影響功能。
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;
let latest: Settings | undefined;

/** 寫入 debounce 300ms，避免拖滑桿時撞到 sync 每分鐘 120 次的節流。 */
export function save(s: Settings, onResult?: (r: SaveOutcome) => void): void {
  latest = s;
  mirrorBoot(s);
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = undefined;
    void flush(latest!, onResult);
  }, 300);
}

async function flush(s: Settings, onResult?: (r: SaveOutcome) => void): Promise<void> {
  if (!hasChrome) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* 開發模式，寫不進去就算了 */
    }
    onResult?.("synced");
    return;
  }
  try {
    await chrome.storage.sync.set({ [KEY]: s });
    onResult?.("synced");
  } catch {
    // 配額滿、離線、或被企業政策擋住。降級寫 local，設定不會消失，
    // 但這台電腦以外看不到 —— 呼叫端負責告訴使用者一次。
    await chrome.storage.local.set({ [KEY]: s });
    onResult?.("local-fallback");
  }
}
