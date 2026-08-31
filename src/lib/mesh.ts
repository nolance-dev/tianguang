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

/**
 * 八組錨點，每三小時一組。
 *
 * 原本只有四組（子、卯、午、酉），間隔六小時。結果早上九點正好落在
 * 「靛藍黎明」與「慘白正午」的正中間，插出來是一片死灰 —— 兩端都漂亮，
 * 中間卻沒有一個真實的時刻長那樣。上午九點的天色不是黎明和正午各一半，
 * 它自己就是一種光：藍天在上、暖光斜射。
 *
 * 換成 OKLab 混色只治標，真正的問題是取樣太粗。中間那四組是各自畫的，
 * 不是算出來的。
 */
export const ANCHORS: Anchor[] = [
  { hour: 0, label: "夜半", c: ["#2C3D6B", "#16224A", "#1D3454", "#070B14", "#0F1727", "#151F3A"] },
  { hour: 3, label: "平旦", c: ["#4A5B86", "#2B3560", "#16204A", "#080C1A", "#131B36", "#26305A"] },
  { hour: 6, label: "日出", c: ["#EDB86E", "#B26C3C", "#33437A", "#121933", "#27325C", "#4E4059"] },
  { hour: 9, label: "隅中", c: ["#F7DCAE", "#D9AE79", "#6E9BCB", "#86AECF", "#B7CFE2", "#EDE3D0"] },
  { hour: 12, label: "日中", c: ["#FFFFFF", "#C6DCEC", "#FFFFFF", "#D8E7F3", "#EDF1EF", "#F7F1E6"] },
  { hour: 15, label: "日昳", c: ["#F8CC8A", "#CE8F5C", "#5F80AE", "#6E8CB4", "#B0B4BC", "#EFD3AE"] },
  { hour: 18, label: "日入", c: ["#E68A3C", "#A2494A", "#4C2C54", "#271A31", "#5A3149", "#8E4A3E"] },
  { hour: 21, label: "人定", c: ["#6B4A6E", "#3A2A50", "#1B2246", "#0A0E1E", "#141A34", "#2A2450"] },
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

const srgbToLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number) => {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, s * 255));
};

type Lab = [number, number, number];

/** Ottosson 的 OKLab。感知均勻，混色不會塌進灰裡。 */
function toLab(hex: string): Lab {
  const [r, g, b] = toRgb(hex).map(srgbToLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromLab([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return toHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/**
 * 在 OKLab 裡混色，不是 sRGB。
 *
 * sRGB 的直線插值會讓互補方向的兩色在中點塌成灰 —— 卯時的靛藍配金往午時的
 * 淡天光混，早上九點到十一點整片會變成死灰，錨點本身卻是漂亮的。
 * OKLab 是感知均勻的，中途保得住彩度。
 */
function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const x = toLab(a);
  const y = toLab(b);
  return fromLab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/** WCAG 相對亮度。用來決定前景該用亮字還是暗字，不必為每組錨點另外標一個旗標。 */
export function luminance(hex: string): number {
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
  // 錨點等距分佈，段距由數量決定 —— 之後要加密只要往 ANCHORS 裡塞，這裡不用改
  const step = 24 / ANCHORS.length;
  const seg = Math.floor(h / step);
  const t = (h - seg * step) / step;
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

/**
 * 前景色一律由背後的亮度決定，背景是漸層、純色還是照片都走這裡。
 * 之前純色背景沒接上這條，結果深藍底配白天的暗字，整頁讀不到。
 */
export function foreground(bgLuminance: number, css: string, boot: string): Palette {
  const light = bgLuminance > 0.4;
  return {
    css,
    boot,
    fg: light ? "#1B2230" : "#F4F2EE",
    fg2: light ? "rgba(27,34,48,.62)" : "rgba(244,242,238,.66)",
    glass: light ? "rgba(255,255,255,.42)" : "rgba(255,255,255,.10)",
    glassLine: light ? "rgba(27,34,48,.13)" : "rgba(255,255,255,.20)",
    light,
  };
}

export function paletteAt(hour: number): Palette {
  const c = colorsAt(hour);
  // 底色三層的平均亮度決定前景，比替每組錨點手寫一個旗標穩，插值中段也不會判斷錯
  const lum = (luminance(c[3]) + luminance(c[4]) + luminance(c[5])) / 3;
  return foreground(lum, meshCss(c), c[4]);
}

/** 純色背景。 */
export function paletteForColor(hex: string): Palette {
  return foreground(luminance(hex), hex, hex);
}

/** 自訂圖片背景。亮度是匯入時量好存起來的，不用每次重讀像素。 */
export function paletteForImage(url: string, imageLuminance: number, dim: number): Palette {
  // 變暗層壓在圖上面，所以判斷前景時要把它算進去
  return foreground(imageLuminance * (1 - dim), `center / cover no-repeat url("${url}")`, "#000");
}

/** 二十四筆整點底色，給 vite 注入首屏 inline script 用。 */
export function bootColorTable(): string[] {
  return Array.from({ length: 24 }, (_, h) => paletteAt(h).boot);
}
