/**
 * 工作區的版面。
 *
 * 每張卡自己記寬高，順序就是陣列順序 —— 不另外存一個 index 欄位，
 * 那種存法只要有一次寫入沒對齊就會冒出兩張排在第三位的卡。
 *
 * 寬是欄數（四欄制），高是列數。兩者都是整數格，不是像素 ——
 * 存像素的話換一台螢幕就全錯位，而且拖起來永遠對不齊隔壁那張。
 */

export type CardId = "todos" | "note" | "pomodoro" | "links" | "photos" | "calendar";

export interface Tile {
  id: CardId;
  /** 佔幾欄，1 到 4 */
  w: number;
  /** 佔幾列，1 到 3 */
  h: number;
}

export const COLS = 4;
export const MAX_H = 3;

const IDS: CardId[] = ["todos", "note", "pomodoro", "links", "photos", "calendar"];

export const DEFAULT_DESK: Tile[] = [
  { id: "links", w: 2, h: 2 },
  { id: "todos", w: 2, h: 1 },
  { id: "note", w: 2, h: 1 },
  { id: "pomodoro", w: 2, h: 1 },
  { id: "photos", w: 2, h: 2 },
  { id: "calendar", w: 1, h: 1 },
];

function clamp(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
}

export const clampW = (n: unknown): number => clamp(n, 1, COLS, 2);
export const clampH = (n: unknown): number => clamp(n, 1, MAX_H, 1);

/**
 * 把存下來的東西整成能畫的。
 *
 * 存下來的版面可能少了後來新增的卡，也可能留著已經拿掉的卡 ——
 * 前者補在最後面（新卡排在使用者排好的東西後面，不插隊），
 * 後者直接丟掉。順序一律以存的為準。
 */
export function normalize(raw: unknown): Tile[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Tile[] = [];
  for (const item of list) {
    const id = (item as Partial<Tile> | null)?.id;
    if (!id || !IDS.includes(id) || out.some((x) => x.id === id)) continue;
    out.push({ id, w: clampW((item as Tile).w), h: clampH((item as Tile).h) });
  }
  for (const d of DEFAULT_DESK) {
    if (!out.some((x) => x.id === d.id)) out.push({ ...d });
  }
  return out;
}

/** 把 from 那張搬到 to 現在的位置，其餘往後推。 */
export function move(list: Tile[], from: CardId, to: CardId): Tile[] {
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
export function nudge(list: Tile[], id: CardId, delta: number): Tile[] {
  const a = list.findIndex((x) => x.id === id);
  if (a < 0) return list;
  const b = a + delta;
  if (b < 0 || b >= list.length) return list;
  const out = list.slice();
  const [moved] = out.splice(a, 1);
  out.splice(b, 0, moved!);
  return out;
}

export function resize(list: Tile[], id: CardId, w: number, h: number): Tile[] {
  return list.map((x) => (x.id === id ? { ...x, w: clampW(w), h: clampH(h) } : x));
}
