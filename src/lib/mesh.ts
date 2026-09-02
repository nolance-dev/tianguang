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
  {
    hour: 0,
    label: "夜半",
    c: ["#2C3D6B", "#16224A", "#1D3454", "#070B14", "#0F1727", "#151F3A"],
  },
  {
    hour: 3,
    label: "平旦",
    c: ["#4A5B86", "#2B3560", "#16204A", "#080C1A", "#131B36", "#26305A"],
  },
  {
    hour: 6,
    label: "日出",
    c: ["#EDB86E", "#B26C3C", "#33437A", "#121933", "#27325C", "#4E4059"],
  },
  {
    hour: 9,
    label: "隅中",
    c: ["#F7DCAE", "#D9AE79", "#6E9BCB", "#86AECF", "#B7CFE2", "#EDE3D0"],
  },
  {
    hour: 12,
    label: "日中",
    c: ["#FFFFFF", "#C6DCEC", "#FFFFFF", "#D8E7F3", "#EDF1EF", "#F7F1E6"],
  },
  {
    hour: 15,
    label: "日昳",
    c: ["#F8CC8A", "#CE8F5C", "#5F80AE", "#6E8CB4", "#B0B4BC", "#EFD3AE"],
  },
  {
    hour: 18,
    label: "日入",
    c: ["#E68A3C", "#A2494A", "#4C2C54", "#271A31", "#5A3149", "#8E4A3E"],
  },
  {
    hour: 21,
    label: "人定",
    c: ["#6B4A6E", "#3A2A50", "#1B2246", "#0A0E1E", "#141A34", "#2A2450"],
  },
];

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  const h = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
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
  return fromLab([
    x[0] + (y[0] - x[0]) * t,
    x[1] + (y[1] - x[1]) * t,
    x[2] + (y[2] - x[2]) * t,
  ]);
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
/** 兩個亮度之間的 WCAG 對比。1 是一模一樣，21 是純黑配純白 */
function contrast(a: number, b: number): number {
  return a > b ? (a + 0.05) / (b + 0.05) : (b + 0.05) / (a + 0.05);
}

/**
 * 把字色往極端色混，直到對比夠 4.5 或者已經混到底。
 *
 * 二分十次就夠了：色彩空間上這條線是單調的，十次的誤差遠小於一個色階。
 */
function harden(base: string, extreme: string, bg: number): string {
  if (contrast(luminance(base), bg) >= AA) return base;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (contrast(luminance(mix(base, extreme, mid)), bg) >= AA) hi = mid;
    else lo = mid;
  }
  return mix(base, extreme, hi);
}

/** 一般文字的 WCAG AA 門檻 */
const AA = 4.5;

export function foreground(
  bgLuminance: number,
  css: string,
  boot: string,
): Palette {
  /*
   * 用哪一種字，問「哪一種比較讀得到」，不要用一個寫死的門檻。
   *
   * 原本是 bgLuminance > 0.4。那個 0.4 訂得太高：深色字與淺色字真正打平的
   * 位置在亮度 0.20（解 (L+0.05)² = (PAPER+0.05)(INK+0.05) 得到），
   * 所以 0.20 到 0.40 這一段會挑到比較差的那一個 —— 而下午的漸層正好
   * 從那一段滑過去。實測 15:30 時番茄鐘整屏的對比掉到 2.37:1
   * （一般文字的門檻是 4.5，大字是 3），16:00 是 3.08:1。
   *
   * 改成直接比對比之後，這條線自己會落在該落的地方，
   * 而且以後有人調色盤也不會再把它推歪。
   */
  /*
   * 選邊要看「推到底能到多少」，不是看設計色現在是多少。
   *
   * 這兩件事會給出不同的答案。底色亮度 0.198 時，設計的白字是 4.23、
   * 深字是 3.76，看起來白字贏；但白字已經沒有餘裕了（推到純白也才 4.23），
   * 深字推到純黑卻有 4.96。照設計色選就會選到那條走不遠的路。
   *
   * 所以拿純黑（亮度 0）和純白（亮度 1）來比 —— 那是各自的上限。
   */
  const light = contrast(bgLuminance, 0) >= contrast(bgLuminance, 1);

  /*
   * 對比不夠時，把字往極端推，推到剛好夠為止。
   *
   * 選對了邊還不保證讀得到：底色落在中間那一段時，設計用的 #1B2230 和
   * #F4F2EE 兩邊都構不到 4.5（一般文字的 AA 門檻）。實測最差是早上七點半
   * 的 3.73:1。要跨過去，字得比設計色更黑或更白。
   *
   * 所以只在不夠的時候往純黑／純白混，混到 4.5 就停 —— 一天裡絕大多數
   * 時間對比綽綽有餘，那些時候用的還是原本那兩個帶色溫的字色。
   * 這樣「任何時刻都讀得到」是算出來的保證，不是調出來的巧合。
   */
  const ink = harden(
    light ? "#1B2230" : "#F4F2EE",
    light ? "#000000" : "#ffffff",
    bgLuminance,
  );
  return {
    css,
    boot,
    fg: ink,
    // 次要文字沿用同一個字色，只是淡一點。淡的那一層本來就不扛 4.5
    fg2: `rgba(${toRgb(ink).join(",")},${light ? ".62" : ".66"})`,
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
export function paletteForImage(
  url: string,
  imageLuminance: number,
  dim: number,
): Palette {
  // 變暗層壓在圖上面，所以判斷前景時要把它算進去
  return foreground(
    imageLuminance * (1 - dim),
    `center / cover no-repeat url("${url}")`,
    "#000",
  );
}

/** 二十四筆整點底色，給 vite 注入首屏 inline script 用。 */
export function bootColorTable(): string[] {
  return Array.from({ length: 24 }, (_, h) => paletteAt(h).boot);
}
