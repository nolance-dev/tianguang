/**
 * 節氣：算太陽視黃經，不查表。
 *
 * 原本打算打一張 2026–2036 的日期表，但低精度的太陽位置公式（Meeus,
 * Astronomical Algorithms 第 25 章）只要三十行，誤差約 0.01 度 —— 換算成
 * 時間大約十五分鐘，而我們只需要「今天是哪個節氣」的日解析度。表要維護、
 * 會過期，公式不會。
 *
 * 節氣就是視黃經每跨十五度一個。春分定義為 0 度。
 */

const RAD = Math.PI / 180;

/** 儒略日。Date 內部就是 UTC 毫秒，直接換算，不碰時區。 */
function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

const norm360 = (d: number) => ((d % 360) + 360) % 360;

interface SunPosition {
  /** 儒略世紀 */
  t: number;
  /** 幾何平黃經，度 */
  l0: number;
  /** 視黃經，度，[0, 360) */
  lambda: number;
  /** 黃赤交角，度 */
  epsilon: number;
}

/** 日出日落也要用到 l0 與黃赤交角，所以中間結果一併回傳，不要算兩次。 */
function sunPosition(date: Date): SunPosition {
  const t = (julianDay(date) - 2451545) / 36525;

  // 幾何平黃經與平近點角
  const l0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const m = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const mRad = m * RAD;

  // 中心差
  const c =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(mRad) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * mRad) +
    0.000289 * Math.sin(3 * mRad);

  // 章動主項加光行差
  const omega = (125.04 - 1934.136 * t) * RAD;
  const lambda = norm360(l0 + c - 0.00569 - 0.00478 * Math.sin(omega));

  return { t, l0, lambda, epsilon: 23.439291 - 0.0130042 * t };
}

/**
 * 太陽視黃經，度，已正規化到 [0, 360)。
 * 章動與光行差只取主項，對日解析度而言遠遠夠用。
 */
export function apparentLongitude(date: Date): number {
  return sunPosition(date).lambda;
}

export interface SunTimes {
  /**
   * 當地時鐘的小數小時，已繞回 [0, 24)。極區永晝永夜時為 null。
   *
   * 繞回是刻意的 —— 這兩個值是要畫到二十四小時環上的角度。
   * 代價是日落可能小於日出（跨午夜時），所以算日長要用模減
   * `(sunset - sunrise + 24) % 24`，不能直接相減。
   */
  sunrise: number | null;
  sunset: number | null;
}

/**
 * 日出日落。時辰盤的日照弧要標出今天天光的範圍。
 *
 * 用的是標準的太陽赤緯加時角解法，−0.833 度已含大氣折射與日面半徑。
 * 誤差在幾分鐘之譜，畫一段弧綽綽有餘。
 *
 * lat 北緯為正，lon 東經為正。
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  // 用當地中午去算，才不會在日界附近取到前後一天的赤緯
  const noonLocal = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
  );
  const { l0, lambda, epsilon } = sunPosition(noonLocal);

  const decl = Math.asin(Math.sin(epsilon * RAD) * Math.sin(lambda * RAD));
  const ra =
    Math.atan2(
      Math.cos(epsilon * RAD) * Math.sin(lambda * RAD),
      Math.cos(lambda * RAD),
    ) / RAD;

  // 均時差，分鐘
  let eot = 4 * (norm360(l0 - 0.0057183) - norm360(ra));
  if (eot > 720) eot -= 1440;
  if (eot < -720) eot += 1440;

  /*
   * 座標先驗過。
   *
   * 底下那個 cosH > 1 || cosH < -1 是用來認極晝極夜的，但 NaN 跟任何數字比
   * 都是 false，所以壞座標會整路穿過去，回一組 NaN。呼叫端
   * （Margins.tsx、Dial.tsx）檢查的是 !== null，NaN 過得了那一關，
   * 於是畫面上出現 NaN:NaN。
   *
   * 順帶擋掉範圍外的：緯度 200 算得出數字，但那個數字沒有意義，
   * 悄悄給一個錯的答案比說不知道更糟。
   */
  if (!Number.isFinite(lat) || !Number.isFinite(lon))
    return { sunrise: null, sunset: null };
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
    return { sunrise: null, sunset: null };

  const latRad = lat * RAD;
  const cosH =
    (Math.cos(90.833 * RAD) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null }; // 永夜或永晝

  const h = Math.acos(cosH) / RAD;
  const noonUtcMin = 720 - 4 * lon - eot;
  // getTimezoneOffset 是「UTC 減本地」的分鐘數，所以要減掉
  const toLocal = (utcMin: number) =>
    ((((utcMin - date.getTimezoneOffset()) / 60) % 24) + 24) % 24;

  return {
    sunrise: toLocal(noonUtcMin - 4 * h),
    sunset: toLocal(noonUtcMin + 4 * h),
  };
}

/**
 * 二十四節氣，春分起算。索引 0 = 春分，每加一即黃經加十五度。
 * 名稱走 i18n 的 jq_0 到 jq_23。
 */
export function jieqiIndex(date: Date): number {
  return Math.floor(apparentLongitude(date) / 15) % 24;
}

/** 節氣在環上的連續位置，0 到 1。外環轉動吃這個值。 */
export function jieqiFraction(date: Date): number {
  return apparentLongitude(date) / 360;
}

/**
 * 英文版外環改用十二個傳統滿月名（Wolf、Snow…Cold），一個月一個。
 * 節氣在英語世界沒有對應物，月名是功能最接近的替代：一樣是天上的、
 * 一樣十二個、一樣不用連網。名稱走 i18n 的 moon_0 到 moon_11。
 */
export function moonIndex(date: Date): number {
  return date.getMonth();
}

export function moonFraction(date: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  return (date.getMonth() + (date.getTime() - start) / (end - start)) / 12;
}
