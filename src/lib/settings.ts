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

import type { Lang } from "./i18n";
import { paletteAt } from "./mesh";
import type { Link } from "./links";
import { DEFAULT_DESK, DEFAULT_HOME_DESK, type Tile } from "./desk";
import type { SecondCal } from "./secondcal";

export const SCHEMA_VERSION = 1;

export type BackgroundSource = "mesh" | "solid" | "image";

export interface PhotoWall {
  /** 牆上現在掛的那張。null 代表還沒挑過 */
  id: string | null;
  /** 輪播間隔（秒），0 是不輪播 */
  rotate: number;
}

/** 照片牆最多幾張。不是版面的限制，是 storage.sync 那 8KB 的限制。 */
export const MAX_PHOTO_WALLS = 12;

export interface Settings {
  schemaVersion: number;
  name: string;
  clock24: boolean;
  showSeconds: boolean;
  /** 介面語言。auto 跟著瀏覽器，其餘覆寫掉 chrome.i18n */
  lang: Lang;
  /**
   * 中央氣象署的開放資料金鑰（台灣，選填）。
   *
   * 填了之後氣溫改用最近測站的實測值，而不是 Open-Meteo 的模式推算 ——
   * 實測過台北兩者可以差兩度，因為模式的網格抹掉了熱島。金鑰是每個使用者
   * 自己到 opendata.cwa.gov.tw 申請的，我們沒有也不能代發。
   */
  cwaKey: string;
  searchEngine: string;
  background: BackgroundSource;
  solidColor: string;
  /** 自訂桌布：IndexedDB 裡的圖片 id。background 為 image 時才有意義。 */
  imageId: string | null;
  /** 換成自訂圖之後，是否仍依時辰疊一層明暗與色溫 */
  shichenTint: boolean;
  grain: number;
  dim: number;
  blur: number;
  cards: {
    todos: boolean;
    note: boolean;
    pomodoro: boolean;
    quote: boolean;
    links: boolean;
    photos: boolean;
    calendar: boolean;
    weather: boolean;
    media: boolean;
    clock: boolean;
  };
  /**
   * 主頁面（第一屏）也要顯示的元件，擺在搜尋框下面。
   *
   * 跟 cards 各記各的：同一張卡可以只在工作區、只在主頁面，或兩邊都有。
   * 一個開關管兩屏的話，想在主頁面看快速存取就得把工作區那張也拖出來。
   */
  home: {
    links: boolean;
    photos: boolean;
  };
  /** 主頁面那一排的順序與尺寸。跟 desk 各記各的，兩屏的版面互不影響。 */
  homeDesk: Tile[];
  /**
   * 快速存取要幾張卡。一張裝十六個（desk.LINKS_PER_CARD），
   * 張數由使用者決定 —— 自動長出來的話，加一個連結會突然多一張卡在版面上，
   * 那不是使用者要求的變化。
   */
  linkCards: number;
  /** 工作區卡片的順序與尺寸。畫之前一律過 desk.normalize()。 */
  desk: Tile[];
  /**
   * 照片牆。一張卡一格，想掛幾張就有幾筆。
   *
   * 長度就是卡的張數 —— 不另外存一個 photoCards，那種存法只要有一次寫入
   * 沒對齊，就會出現「說有三張但只有兩筆資料」的狀態，而畫面上看到的是
   * 第三張永遠是空的、換了照片也不會記住。
   *
   * 跟桌布的 imageId 是兩回事，各記各的。
   */
  photoWalls: PhotoWall[];
  /**
   * 主頁面那一排的照片牆，跟工作區完全分開。
   *
   * 兩邊共用一份的話，在工作區加一張，第一屏也會跟著多一張 —— 而第一屏
   * 只有一列，多出來的那張擠掉的是使用者放在那裡的別的東西。兩個地方是
   * 兩種用途：第一屏是一眼看到的那張，工作區是牆。
   */
  homePhotoWalls: PhotoWall[];
  /** 自訂名言。留白就用內建那批隨機抽。 */
  quoteText: string;
  quoteBy: string;
  links: Link[];
  weatherOn: boolean;
  unit: "c" | "f";
  /** 城市名。空字串代表還沒選過，預設用台北的座標把日照弧畫出來。 */
  placeName: string;
  /** 選城市時一併記下來的 ISO 國碼。節日看它，不看座標 */
  countryCode: string;
  /** 月曆格子裡的第二套曆法 */
  secondCal: SecondCal;
  /** 月曆上要不要標當地節日 */
  holidaysOn: boolean;
  /**
   * 首次引導看過了沒有。
   *
   * 存在設定裡而不是 localStorage：它跟著帳號同步，換一台機器不會再被引導一次。
   * 預設 false —— 剛裝好的人本來就沒看過。
   */
  guided: boolean;
  /** 日照弧與天氣共用的座標，由城市搜尋填入 */
  lat: number;
  lon: number;
}

export const DEFAULTS: Settings = {
  schemaVersion: SCHEMA_VERSION,
  name: "",
  clock24: true,
  showSeconds: false,
  cwaKey: "",
  lang: "auto",
  searchEngine: "bing",
  background: "mesh",
  solidColor: "#131C30",
  imageId: null,
  shichenTint: true,
  grain: 0.055,
  dim: 0,
  blur: 0,
  // 照片牆預設關著 —— 剛裝好一張圖都沒有，開著就是一個空框
  cards: {
    todos: true,
    note: true,
    pomodoro: false,
    quote: true,
    links: true,
    photos: false,
    calendar: true,
    weather: false,
    media: false,
    clock: false,
  },
  // 主頁面預設乾淨 —— 第一屏本來就是「時間、搜尋、一句話」，
  // 要多擺東西是使用者的決定，不是預設
  home: {
    links: false,
    photos: false,
  },
  homeDesk: DEFAULT_HOME_DESK,
  linkCards: 1,
  desk: DEFAULT_DESK,
  photoWalls: [{ id: null, rotate: 0 }],
  homePhotoWalls: [{ id: null, rotate: 0 }],
  quoteText: "",
  quoteBy: "",
  links: [],
  weatherOn: false,
  unit: "c",
  placeName: "",
  countryCode: "TW",
  secondCal: "chinese",
  holidaysOn: true,
  guided: false,
  lat: 25.033,
  lon: 121.565,
};

const KEY = "tg.settings";
const BOOT_KEY = "tg.boot";

/** 之後每加一版就在下面接一段 if，不要回頭改前面的。 */
/**
 * 巢狀的開關表要逐鍵合併，不能整包換掉。
 *
 * cards 和 home 都是「一張卡一個布林」的表。展開運算子是淺的，所以
 * { ...DEFAULTS, ...raw } 遇到 raw.cards 就是整包取代 —— 一份只寫了
 * { cards: { newcard: true } } 的設定（從新版同步回來的，或是手改的備份）
 * 會讓十張卡的開關全部消失，而那正是上面註解說要防的情境。
 *
 * 只認得的鍵才收，而且只收布林：不認得的鍵丟掉（那是新版才有的卡，
 * 這一版畫不出來），型別不對的丟掉（手改壞的）。
 */
function mergeFlags<T extends Record<string, boolean>>(
  base: T,
  raw: unknown,
): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...base };
  const src = raw as Record<string, unknown>;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (typeof src[k] === "boolean")
      (out as Record<string, boolean>)[k] = src[k];
  }
  return out;
}

/**
 * 純色背景只收顏色，不收任意 CSS。
 *
 * 這個值最後會走到 --solid 和 --mesh，而 styles.css 是 background: var(--mesh)。
 * background 收得下 url()，所以一份手改的備份寫上
 * url(https://example.invalid/beacon.png) 就是一個每次開新分頁都會發出去的
 * 遠端請求 —— 不需要任何注入技巧，那本來就是合法的 CSS 值。
 * 擴充功能不該有這種東西，何況它是靜悄悄的。
 */
function safeColor(raw: unknown, fallback: string): string {
  return typeof raw === "string" && /^#[0-9a-f]{3,8}$/i.test(raw.trim())
    ? raw.trim()
    : fallback;
}

/** 空白的一張。兩邊的預設都是這個，不是彼此的複本。 */
function blankWall(): PhotoWall {
  return { id: null, rotate: 0 };
}

/**
 * 照片牆的清單。
 *
 * 1.0 只有一張，存成 photoId／photoRotate 兩個欄位。那些設定還在使用者的
 * 瀏覽器裡，直接改欄位名等於把他們掛好的照片弄丟 —— 所以舊的兩個欄位
 * 仍然讀，讀完轉成第一張。但只有工作區讀（legacy = true）：那兩個欄位
 * 是工作區那張牆存下來的，主頁面拿去用等於把同一張照片複製過去，於是
 * 兩邊一開始就掛著同一張，看起來像還連在一起。
 *
 * 一定至少有一張：零張的話「照片牆」這個開關打開會什麼都沒有，
 * 而使用者沒有任何辦法從介面上把它變回一張。
 */
/**
 * 一份照片牆清單。讀不出東西就回 null，讓呼叫端決定拿什麼頂。
 *
 * 原本這裡吃一個 legacy 旗標，呼叫端只看得到一個裸露的 true —— 那個 true
 * 是什麼意思全靠上一行註解撐著。改成「讀得到就給，讀不到回 null」，
 * 「工作區接手 1.0 的舊欄位、主頁面不接」這個決定就寫在呼叫的地方，
 * 看得到它旁邊的另一行。
 */
function photoWalls(value: unknown): PhotoWall[] | null {
  const list = Array.isArray(value) ? value : null;
  const out: PhotoWall[] = [];
  for (const item of list ?? []) {
    const w = item as Partial<PhotoWall> | null;
    if (!w || typeof w !== "object") continue;
    out.push({
      id: typeof w.id === "string" ? w.id : null,
      rotate:
        typeof w.rotate === "number" && Number.isFinite(w.rotate)
          ? Math.max(0, Math.round(w.rotate))
          : 0,
    });
    if (out.length >= MAX_PHOTO_WALLS) break;
  }
  return out.length ? out : null;
}

/** 1.0 只有一面牆，存在 photoId／photoRotate 兩個欄位裡 */
function legacyWall(raw: Record<string, unknown>): PhotoWall {
  return {
    id: typeof raw.photoId === "string" ? raw.photoId : null,
    rotate:
      typeof raw.photoRotate === "number" && Number.isFinite(raw.photoRotate)
        ? Math.max(0, Math.round(raw.photoRotate))
        : 0,
  };
}

export function migrate(raw: Record<string, unknown>): Settings {
  const v = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;

  // 比這一版還新的設定，是從裝了新版的另一台電腦同步回來的。
  // 硬套會把我們還不認識的欄位吃掉，所以原樣留著，只補上缺的鍵，
  // 版本號也不往下改 —— 那台電腦下次同步時才不會被降級。
  const merged =
    v > SCHEMA_VERSION
      ? ({ ...DEFAULTS, ...raw } as Settings)
      : // v <= SCHEMA_VERSION：目前只有第一版，補預設值即可。
        // 之後每加一版在這裡接一段 if (v < N) { ... }
        ({ ...DEFAULTS, ...raw, schemaVersion: SCHEMA_VERSION } as Settings);

  // 淺展開救不了的那幾個，逐一收拾。兩條路徑都要走這一段 ——
  // 「比較新的設定」正是最可能帶著我們不認得的 cards 內容回來的那一種
  return {
    ...merged,
    cards: mergeFlags(DEFAULTS.cards, (raw as { cards?: unknown }).cards),
    home: mergeFlags(DEFAULTS.home, (raw as { home?: unknown }).home),
    solidColor: safeColor(merged.solidColor, DEFAULTS.solidColor),
    lang: (["auto", "zh_TW", "en"] as const).includes(merged.lang)
      ? merged.lang
      : DEFAULTS.lang,
    cwaKey: typeof merged.cwaKey === "string" ? merged.cwaKey.trim() : "",
    // 1.0 的 photoId／photoRotate 是工作區那張牆的，所以只有它接手
    photoWalls: photoWalls(raw.photoWalls) ?? [legacyWall(raw)],
    // 主頁面從空的開始。承接工作區的舊值等於一開始就把兩邊接在一起
    homePhotoWalls: photoWalls(raw.homePhotoWalls) ?? [blankWall()],
  };
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
  const fromSync = (await chrome.storage.sync.get(KEY)) as Record<
    string,
    unknown
  >;
  if (fromSync[KEY]) return migrate(fromSync[KEY] as Record<string, unknown>);
  const fromLocal = (await chrome.storage.local.get(KEY)) as Record<
    string,
    unknown
  >;
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
      s.background === "solid"
        ? s.solidColor
        : paletteAt(now.getHours() + now.getMinutes() / 60).boot;
    // 變暗只跟著圖片走，首屏也要一樣 —— 不然漸層背景會先暗一下再彈回來
    localStorage.setItem(
      BOOT_KEY,
      JSON.stringify({ color, dim: s.background === "image" ? s.dim : 0 }),
    );
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

/**
 * 取消還沒落盤的那一次寫入。測試用。
 *
 * pending 與 latest 是模組層的，跨測試活著 —— 上一條測試排的那次寫入
 * 會在三百毫秒後醒來，把它的設定蓋到下一條測試的 localStorage 上。
 * 機器忙的時候才會撞到，所以它是一條隨機紅的測試，而隨機紅的測試
 * 跟沒有測試是同一回事（這一輪已經因此誤判過兩次）。
 */
export function cancelSave(): void {
  if (pending) clearTimeout(pending);
  pending = undefined;
  latest = undefined;
}

async function flush(
  s: Settings,
  onResult?: (r: SaveOutcome) => void,
): Promise<void> {
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
