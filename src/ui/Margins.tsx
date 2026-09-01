import { isoWeek } from "../lib/agenda";
import { daylight, daysToNextJieqi, houIndex, lunarDate } from "../lib/almanac";
import { isEnglish, outerRingName, t } from "../lib/i18n";
import { apparentLongitude, jieqiIndex, sunTimes } from "../lib/solar";

/**
 * 盤面兩側的曆書欄。
 *
 * 盤是正方的，寬螢幕上左右一定各空一條。空著不是留白，是沒東西 ——
 * 一頁全黑的畫面中間擺一個圓，兩邊那兩條就只是黑。
 *
 * 放的東西有一條規矩：只放這個盤已經在算的東西的另一種說法。日出日落是弧的兩端、
 * 節氣是外環、候和下一個節氣是同一個黃經推出來的。不去抓天氣、不抓新聞、
 * 不放裝飾用的假資料 —— 這是一具儀器的邊欄，不是佈景。
 *
 * 直排是因為中文本來就直排，而且直排剛好把那條窄長的空間用滿。
 * 英文版轉回橫排（豎排的拉丁字母要側著讀，那是折磨）。
 */

interface Props {
  now: Date;
  lat: number;
  lon: number;
}

type Row = [label: string, value: string];

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}`;

/** 時長寫成「12h38」而不是 12:38 —— 12:38 看起來是時刻，不是長度 */
function span(h: number): string {
  const H = Math.floor(h);
  return `${H}h${pad(Math.round((h - H) * 60))}`;
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
}

function daysInYear(d: Date): number {
  const y = d.getFullYear();
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

export function Margins({ now, lat, lon }: Props) {
  const en = isEnglish();
  const { sunrise, sunset } = sunTimes(now, lat, lon);

  const left: Row[] = [];
  if (sunrise !== null && sunset !== null) {
    const day = daylight(sunrise, sunset);
    left.push(
      [t("m_sunrise"), hhmm(sunrise)],
      [t("m_sunset"), hhmm(sunset)],
      [t("m_day"), span(day)],
      [t("m_night"), span(24 - day)],
    );
  }

  const lon0 = apparentLongitude(now);
  const right: Row[] = [];
  if (en) {
    right.push(
      [t("m_doy"), `${dayOfYear(now)}/${daysInYear(now)}`],
      [t("m_week"), String(isoWeek(now))],
      [t("m_lon"), `${lon0.toFixed(1)}°`],
    );
  } else {
    const jq = jieqiIndex(now);
    const lunar = lunarDate(now);
    if (lunar) right.push([t("m_lunar"), lunar]);
    right.push(
      [outerRingName(jq), t(`m_hou_${houIndex(now)}`)],
      [t("m_next"), t("m_next_v", [outerRingName((jq + 1) % 24), String(daysToNextJieqi(now))])],
      [t("m_lon"), `${lon0.toFixed(1)}°`],
    );
  }

  const col = (rows: Row[], side: string) => (
    <aside class={`marg marg-${side}`}>
      {rows.map(([label, value]) => (
        <span key={label} class="mrow">
          <i>{label}</i>
          <b>{value}</b>
        </span>
      ))}
    </aside>
  );

  return (
    <>
      {col(left, "l")}
      {col(right, "r")}
    </>
  );
}
