/**
 * 工作區的版面。
 *
 * 每張卡自己記寬高，順序就是陣列順序 —— 不另外存一個 index 欄位，
 * 那種存法只要有一次寫入沒對齊就會冒出兩張排在第三位的卡。
 *
 * 寬是欄數（四欄制），高是列數。兩者都是整數格，不是像素 ——
 * 存像素的話換一台螢幕就全錯位，而且拖起來永遠對不齊隔壁那張。
 */

export type CardId =
  | "todos"
  | "note"
  | "pomodoro"
  | "links"
  | "photos"
  | "calendar"
  | "weather"
  | "media"
  | "clock";

/**
 * 版面上一格的識別碼。
 *
 * 不等於卡的種類：快速存取一張最多裝十六個，滿了就多開一張，所以會有
 * links、links2、links3……；照片牆想掛幾張就有幾張，photos、photos2……。
 * 其餘的卡一種只有一張，id 就是種類。
 * 要種類請用 kindOf()，不要自己比字串。
 */
export type TileId = CardId | `links${number}` | `photos${number}`;

/** 一張快速存取最多裝幾個。滿了自動開下一張，不是把同一張越拉越長。 */
export const LINKS_PER_CARD = 16;

/** 可以同時存在很多張的卡。它們的 id 是「種類 + 編號」 */
const MULTI = ["links", "photos"] as const;

export function kindOf(id: TileId): CardId {
  for (const k of MULTI) if (id.startsWith(k)) return k;
  return id as CardId;
}

/**
 * 第 n 張（從 0 起算）的 id。
 *
 * 第一張沒有編號 —— 那是舊版存下來的樣子，改名等於把所有人排好的版面
 * 都變成孤兒鍵，normalize() 會直接丟掉。
 */
export function tileId(kind: "links" | "photos", index: number): TileId {
  return (index === 0 ? kind : `${kind}${index + 1}`) as TileId;
}

export interface Tile {
  id: TileId;
  /** 佔幾欄，1 到 4 */
  w: number;
  /** 佔幾列，1 到 3 */
  h: number;
}

export const COLS = 4;
export const MAX_H = 3;

const IDS: CardId[] = [
  "todos",
  "note",
  "pomodoro",
  "links",
  "photos",
  "calendar",
  "weather",
  "media",
  "clock",
];

/**
 * 主頁面（第一屏）那一排的預設版面。
 *
 * 只列快速存取和照片牆 —— 其餘的卡由 show 關掉，normalize() 還是會把它們補在
 * 後面，那不影響畫面，但保證使用者之後想換的時候尺寸是現成的。
 * 高度一律一格：第一屏的高度是給時鐘的，那一排再高就把時鐘擠下去。
 * 工作區的照片牆仍然是兩列 —— 那裡有的是空間。
 */
export const DEFAULT_HOME_DESK: Tile[] = [
  { id: "links", w: 2, h: 1 },
  { id: "photos", w: 2, h: 1 },
];

export const DEFAULT_DESK: Tile[] = [
  { id: "links", w: 2, h: 1 },
  { id: "todos", w: 2, h: 1 },
  { id: "note", w: 2, h: 1 },
  { id: "pomodoro", w: 2, h: 1 },
  { id: "photos", w: 2, h: 2 },
  { id: "calendar", w: 1, h: 1 },
  { id: "weather", w: 1, h: 1 },
  { id: "media", w: 2, h: 1 },
  { id: "clock", w: 2, h: 1 },
];

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v =
    typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
}

export const clampW = (n: unknown): number => clamp(n, 1, COLS, 2);
export const clampH = (n: unknown): number => clamp(n, 1, MAX_H, 1);

/**
 * 快速存取的高度是固定的，只能左右拉。
 *
 * 它的內容是「一列排幾個由寬度決定、列數自己補齊」，高度多出來的部分永遠是空的 ——
 * 拉高只會在卡片裡留一塊白，不會多出任何東西。與其讓人拉了才發現沒用，
 * 不如一開始就只給左右。這裡是唯一的關卡：存下來的、拖出來的、鍵盤改的都會經過。
 */
export function heightOf(id: TileId, h: unknown): number {
  return kindOf(id) === "links" ? 1 : clampH(h);
}

/**
 * 把存下來的東西整成能畫的。
 *
 * 存下來的版面可能少了後來新增的卡，也可能留著已經拿掉的卡 ——
 * 前者補在最後面（新卡排在使用者排好的東西後面，不插隊），
 * 後者直接丟掉。順序一律以存的為準。
 */
export function normalize(raw: unknown, extra: TileId[] = []): Tile[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Tile[] = [];
  for (const item of list) {
    const id = (item as Partial<Tile> | null)?.id;
    /*
     * id 必須是字串才往下走。
     *
     * 手改過的備份檔（desk: [{ id: 5 }]）會讓 kindOf 去呼叫 id.startsWith，
     * 丟 TypeError。而 normalize 是在 render 裡跑的，於是每次重繪都炸，
     * 工作區永久打不開，介面上也沒有任何辦法救回來 —— 只能去清 storage。
     * 匯入的資料不該有能力把應用程式鎖死。
     */
    if (
      typeof id !== "string" ||
      !IDS.includes(kindOf(id)) ||
      out.some((x) => x.id === id)
    )
      continue;
    out.push({
      id,
      w: clampW((item as Tile).w),
      h: heightOf(id, (item as Tile).h),
    });
  }
  for (const d of DEFAULT_DESK) {
    if (!out.some((x) => x.id === d.id)) out.push({ ...d });
  }
  // 第二張之後的快速存取與照片牆。它們由數量長出來，所以補在最後面 ——
  // 使用者排好的順序不因為多了一張而被推開。尺寸沿用同種類第一張的預設
  for (const id of extra) {
    if (out.some((x) => x.id === id)) continue;
    const size = DEFAULT_DESK.find((d) => d.id === kindOf(id))!;
    out.push({ id, w: size.w, h: heightOf(id, size.h) });
  }
  return out;
}

/** 把 from 那張搬到 to 現在的位置，其餘往後推。 */
export function move(list: Tile[], from: TileId, to: TileId): Tile[] {
  if (from === to) return list;
  const a = list.findIndex((x) => x.id === from);
  const b = list.findIndex((x) => x.id === to);
  if (a < 0 || b < 0) return list;
  const out = list.slice();
  const [moved] = out.splice(a, 1);
  out.splice(b, 0, moved!);
  return out;
}

/** 往前或往後挪一格。鍵盤換位用這個，不必先知道鄰居是誰。 */
export function nudge(list: Tile[], id: TileId, delta: number): Tile[] {
  const a = list.findIndex((x) => x.id === id);
  if (a < 0) return list;
  const b = a + delta;
  if (b < 0 || b >= list.length) return list;
  const out = list.slice();
  const [moved] = out.splice(a, 1);
  out.splice(b, 0, moved!);
  return out;
}

export function resize(list: Tile[], id: TileId, w: number, h: number): Tile[] {
  return list.map((x) =>
    x.id === id ? { ...x, w: clampW(w), h: heightOf(id, h) } : x,
  );
}

/**
 * 只留放得下的那幾張。
 *
 * 主頁面那一排用。第一屏的高度是給時鐘的，卡片排到第二列就會把時鐘擠出
 * 畫面 —— 所以那一排就是一列，塞不下的不畫。
 *
 * 用 continue 不是 break：前面一張四欄的擋住了，後面那張一欄的還是該有
 * 機會補進來。使用者把大的排在前面，不代表小的就活該不見。
 *
 * 版面本身不動 —— 沒畫出來的那幾張還在設定裡，把前面的縮窄就會自己回來。
 */
export function fitCols(tiles: Tile[], cols: number): Tile[] {
  let used = 0;
  const out: Tile[] = [];
  for (const t of tiles) {
    if (used + t.w > cols) continue;
    used += t.w;
    out.push(t);
  }
  return out;
}

/**
 * 單列那一排最後長什麼樣：放得下的，而且一律只有一格高。
 *
 * 高度攤平不只是為了好看。主頁面鎖了高度（Cards 的 lockHeight），所以存下來
 * 的舊版面如果是兩列，使用者**沒有任何辦法把它拉回來** —— 拖也拖不動，
 * 鍵盤也改不了。這裡攤平，那些版面自己就好了。
 *
 * 只在畫的時候攤，設定裡存的數字不動：同一張卡搬到工作區還是它原本的高度。
 */
export function singleRow(tiles: Tile[], cols: number): Tile[] {
  return fitCols(tiles, cols).map((t) => (t.h === 1 ? t : { ...t, h: 1 }));
}
