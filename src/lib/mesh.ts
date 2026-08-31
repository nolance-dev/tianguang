/**
 * 背景引擎：四組錨點色，時辰之間做插值。
 *
 * 每個錨點六個色，套進同一個漸層樣板：兩層 radial 加一層 linear。
 * 因為樣板固定，插值就只是把六個色各自 lerp 一次，不用處理結構差異。
 *
 * 這個模組同時是 vite.config.ts 的資料來源 —— 首屏 inline script 用的
 * 底色表由這裡產生，避免顏色在兩個地方各寫一份。
 */

export type Six = [string, string, string, string, string, string];

export interface Anchor {
  /** 這組色所代表的時刻（0–24 小時制） */
  hour: number;
  label: string;
  c: Six;
}

/** 子夜、日出、日中、日入。其餘時辰由相鄰兩組插出來。 */
export const ANCHORS: Anchor[] = [
  { hour: 0, label: "夜半", c: ["#2C3D6B", "#16224A", "#1D3454", "#070B14", "#0F1727", "#151F3A"] },
  { hour: 6, label: "日出", c: ["#EDB86E", "#B26C3C", "#33437A", "#121933", "#27325C", "#4E4059"] },
  { hour: 12, label: "日中", c: ["#FFFFFF", "#C6DCEC", "#FFFFFF", "#D8E7F3", "#EDF1EF", "#F7F1E6"] },
  { hour: 18, label: "日入", c: ["#E68A3C", "#A2494A", "#4C2C54", "#271A31", "#5A3149", "#8E4A3E"] },
];

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** WCAG 相對亮度。用來決定前景該用亮字還是暗字，不必為每組錨點另外標一個旗標。 */
function luminance(hex: string): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = toRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** 把 0–24 的時刻夾在相鄰兩個錨點之間，回傳插好的六個色。 */
export function colorsAt(hour: number): Six {
  const h = ((hour % 24) + 24) % 24;
  // 錨點是 0/6/12/18，等距六小時，所以直接算落在第幾段
  const seg = Math.floor(h / 6);
  const t = (h - seg * 6) / 6;
  const from = ANCHORS[seg]!;
  const to = ANCHORS[(seg + 1) % ANCHORS.length]!;
  return from.c.map((c, i) => mix(c, to.c[i]!, t)) as Six;
}

export interface Palette {
  css: string;
  /** 首屏 inline script 只塗這一色，等 app 起來才換上完整漸層 */
  boot: string;
  fg: string;
  fg2: string;
  glass: string;
  glassLine: string;
  /** 亮底時為 true。決定玻璃層與陰影要往哪個方向走。 */
  light: boolean;
}

export function meshCss(c: Six): string {
  return [
    `radial-gradient(120% 92% at 18% 112%, ${c[0]} 0%, ${c[1]} 24%, transparent 63%)`,
    `radial-gradient(88% 72% at 82% -6%, ${c[2]} 0%, transparent 62%)`,
    `linear-gradient(180deg, ${c[3]} 0%, ${c[4]} 52%, ${c[5]} 100%)`,
  ].join(", ");
}

export function paletteAt(hour: number): Palette {
  const c = colorsAt(hour);
  // 底色三層的平均亮度決定前景，比替每組錨點手寫一個旗標穩，插值中段也不會判斷錯
  const light = (luminance(c[3]) + luminance(c[4]) + luminance(c[5])) / 3 > 0.4;
  return {
    css: meshCss(c),
    boot: c[4],
    fg: light ? "#1B2230" : "#F4F2EE",
    fg2: light ? "rgba(27,34,48,.62)" : "rgba(244,242,238,.66)",
    glass: light ? "rgba(255,255,255,.42)" : "rgba(255,255,255,.10)",
    glassLine: light ? "rgba(27,34,48,.13)" : "rgba(255,255,255,.20)",
    light,
  };
}

/** 二十四筆整點底色，給 vite 注入首屏 inline script 用。 */
export function bootColorTable(): string[] {
  return Array.from({ length: 24 }, (_, h) => paletteAt(h).boot);
}
