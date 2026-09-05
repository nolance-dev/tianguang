import { useEffect, useRef, useState } from "preact/hooks";
import {
  intlLocale,
  isEnglish,
  outerRingName,
  shichenAlt,
  shichenName,
  t,
} from "../lib/i18n";
import { roman } from "../lib/roman";
import { indexAt } from "../lib/shichen";
import { moonIndex, jieqiIndex, sunTimes } from "../lib/solar";
import { FourSymbols } from "./FourSymbols";
import { useDialog } from "./useDialog";
import { Margins } from "./Margins";

/**
 * 全屏時辰盤。
 *
 * 一個規則貫穿整個盤面：**環一律逆時針飄，把「現在」送到頂端標記下；
 * 只有秒針順時針掃。** 針與環反向，動起來層次才清楚。
 *
 * 每一環只在自己那一格走完時才跳，中間完全靜止：分環整分跳、時環整點跳、
 * 時辰環兩小時跳一次、節氣環十五天跳一次。連續飄移會讓整個盤面一直微微蠕動，
 * 看久了很躁；而「跳」這件事本身就說明了「這一格結束了」。
 * 例外只有兩個：秒針一秒一跳，日照弧跟著分環一分一跳（那是刻度不是格）。
 */

const C = 310; // viewBox 620 的圓心

/*
 * 四圈導線的呼吸燈。延遲跟半徑成正比，所以光是從中心一圈一圈走出去的。
 *
 * 外兩圈的谷底一樣壓得很低（0.06、0.07），但峰值拉到和內圈同一級 —— 落差大
 * 那口氣才看得出來走到外面了。峰值只維持一瞬間，字讀得到的時間是絕大部分。
 */
const LITE = [
  { r: 93, lo: 0.1, hi: 0.5, glow: 7, delay: 0, wave: "wave-near" },
  { r: 162, lo: 0.08, hi: 0.34, glow: 5, delay: 0.5, wave: "wave-mid" },
  { r: 204, lo: 0.07, hi: 0.38, glow: 7, delay: 0.85, wave: "wave-mid" },
  { r: 250, lo: 0.06, hi: 0.36, glow: 8, delay: 1.2, wave: "wave-far" },
];
/*
 * 收盤要跑多久。
 *
 * 比進場短很多：進場可以鋪陳，退場拖就是擋路 —— 按了 Esc 的人已經要去別的地方了。
 * 這個值跟 styles.css 裡 .dial.out 那幾條的時長綁在一起，改一邊要改兩邊。
 */
const EXIT_MS = 260;

const TAU_SEC = 6; // 每秒六度
const TAU_MIN = 6; // 每分六度
const TAU_HOUR = 15; // 每小時十五度

interface Props {
  now: Date;
  lat: number;
  lon: number;
  onClose: () => void;
}

function polar(r: number, deg: number): string {
  const rad = ((deg - 90) * Math.PI) / 180;
  return `${(C + r * Math.cos(rad)).toFixed(2)} ${(C + r * Math.sin(rad)).toFixed(2)}`;
}

function arcPath(r: number, a1: number, a2: number): string {
  const large = (((a2 - a1) % 360) + 360) % 360 > 180 ? 1 : 0;
  return `M${polar(r, a1)} A${r} ${r} 0 ${large} 1 ${polar(r, a2)}`;
}

const hhmm = (h: number) => {
  const H = Math.floor(h);
  return `${String(H).padStart(2, "0")}:${String(Math.round((h - H) * 60)).padStart(2, "0")}`;
};

/**
 * 只往同一個方向累加的角度。
 * 直接寫 -分*6 的話，五十九分跳零分會從 -354 度倒轉回 0，整圈退回去。
 */
function useMonotonicAngle(target: number, active: boolean): number {
  const ref = useRef<number | null>(null);
  if (!active) ref.current = null;
  else if (ref.current === null) ref.current = target;
  else {
    const forward = ((((ref.current % 360) - target) % 360) + 360) % 360;
    ref.current -= forward;
  }
  return ref.current ?? target;
}

export function Dial({ now, lat, lon, onClose }: Props) {
  const [shown, setShown] = useState(false);
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    // 元素是新的，第一格定位不能有過場，否則會從零度整圈轉進來
    const id = setTimeout(() => setReady(true), 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, []);

  // onClose 每次 render 都是新的函式，直接放進相依陣列會讓監聽器一秒拆裝一次。
  // 用 ref 接住最新的，監聽器只掛一次。
  const close = useRef(onClose);
  close.current = onClose;
  /*
   * going 是 ref 不是 state：連按兩下 Esc 會排兩個計時器，第二個在畫面已經
   * 收掉之後才觸發。state 要等重繪才看得到新值，擋不住同一輪裡的第二次。
   */
  const going = useRef(false);

  /*
   * 收起來要看得見。
   *
   * 原本按下 Esc 是直接卸載 —— 進場鋪了五秒，出場是一刀切回主畫面，
   * 兩邊對不上。拿掉 .in 就會沿著進場那條路倒著走回去，方向本來就是對的，
   * 只是要快得多（見 .dial.out）。
   *
   * 關掉動畫的人不該為了看不見的過場等這 260 毫秒，直接卸載。
   *
   * going 是 ref 不是 state：連按兩下 Esc 會排兩個計時器，第二個在畫面已經
   * 收掉之後才觸發。state 要等重繪才看得到新值，擋不住同一輪裡的第二次。
   */
  function leave() {
    if (going.current) return;
    going.current = true;
    const still =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      close.current();
      return;
    }
    setLeaving(true);
    setTimeout(() => close.current(), EXIT_MS);
  }

  /*
   * Esc、焦點鎖、關閉後歸位都走共用的 hook，只是關法換成上面那個帶過場的。
   *
   * 盤面裡一個可聚焦的元素都沒有（連關閉鈕都沒有），所以 hook 會把焦點留在
   * 盤本身，Tab 也哪裡都不去 —— 不然一個 Tab 就會落到盤底下那些看不見、
   * 也點不到的控制項上，讀屏會開始唸盤面外面的東西。
   */
  const boxRef = useDialog<HTMLDivElement>(leave);

  const en = isEnglish();
  const minute = now.getMinutes();
  const hour = now.getHours();
  const second = now.getSeconds();

  const minAngle = useMonotonicAngle(-minute * TAU_MIN, true);
  const hourAngle = useMonotonicAngle(-hour * TAU_HOUR, true);
  const secAngleRef = useRef(0);
  {
    const target = second * TAU_SEC;
    const forward =
      (((target - (secAngleRef.current % 360)) % 360) + 360) % 360;
    secAngleRef.current += forward;
  }

  const outerCount = en ? 12 : 24;
  const outerActive = en ? moonIndex(now) : jieqiIndex(now);
  const scActive = indexAt(now);

  // 分段的環一律停在「當下這一格」的正中央，換格才轉。標籤本來就畫在格中央
  // （下面那個 +0.5），所以角度也要算到格中央，否則會差半格。
  const outerAngle = useMonotonicAngle(
    (-(outerActive + 0.5) * 360) / outerCount,
    true,
  );
  const scAngle = useMonotonicAngle(-scActive * 30, true);
  // 日照弧不是分段的環，是實際刻度：日出日落那兩點要對得準頂端的「現在」，
  // 所以跟著分環一分鐘跳一次，不跟時辰環兩小時跳一次。
  const sunAngle = useMonotonicAngle(
    (-(hour * 60 + minute) / 1440) * 360,
    true,
  );

  const sun = sunTimes(now, lat, lon);

  // turns 是開盤時先自轉幾圈。圈數各環不同 —— 那就是「不同頻率」：同樣五秒，
  // 分環轉兩圈、日照弧不到一圈，看起來就是各轉各的。
  //
  // 五秒的前兩秒是等速，後三秒才減速到停（分段在 CSS 的 keyframes 裡）。
  // 等速那一段的角速度就是圈數的三分之一（每秒），要整體快慢就等比縮放圈數，
  // 不要動曲線 —— 曲線決定的是減速的形狀，圈數決定的才是速度。
  //
  // 用 rotate 這個獨立變換屬性，不動 transform：transform 隨時間每分每秒在跳，
  // 動畫掛上去會蓋掉它。兩者各自算完再相乘，互不干涉。
  /*
   * 相鄰的環轉相反方向。
   *
   * 五環同向的時候，開盤那五秒看起來是「一整片在轉」—— 環與環之間沒有相對
   * 運動，眼睛分不出那是五個獨立的盤還是一張貼上去的圖。一正一負交錯之後，
   * 每一道交界都有相對速度，層次是那個交界長出來的，不是靠粗細或顏色。
   * 渾天儀和星盤本來就是這樣：內外圈朝相反方向走。
   *
   * 正負只決定方向，圈數的絕對值仍然是速度（等速段的角速度是圈數的三分之一
   * 每秒），所以下面那幾個數字的大小一個都沒動。
   */
  const spin = (deg: number, turns = 0) =>
    `transform: rotate(${deg}deg); transform-origin: ${C}px ${C}px;` +
    ` --spin: ${turns * 360}deg`;

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      class={`dial${shown && !leaving ? " in" : ""}${ready ? " ready" : ""}${
        leaving ? " out" : ""
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={t("dial_title")}
      aria-keyshortcuts="Escape"
    >
      {/* 這兩個都要留在 .dial-wrap 外面：它們定位的參考是整個畫面，
          包進盤那個正方形裡就只能貼著盤走，也會被 .dial-wrap > svg 那條規則吃掉 */}
      <FourSymbols now={now} />
      <Margins now={now} lat={lat} lon={lon} />

      <div class="dial-wrap">
        <svg viewBox="0 0 620 620" aria-hidden="true">
          {LITE.map(({ r, lo, hi, glow, delay, wave }) => (
            <circle
              key={r}
              class="lite"
              cx={C}
              cy={C}
              r={r}
              fill="none"
              style={
                `--lo: ${lo}; --hi: ${hi}; --glow: ${glow}px;` +
                ` --wave: ${wave}; animation-delay: ${delay}s`
              }
            />
          ))}

          {/* 一環：六十分刻，一小時一圈，整分才跳。逢五羅馬數字，其餘小阿拉伯數字 */}
          <g class="rg rg-min" style={spin(minAngle, 1.97)}>
            {Array.from({ length: 60 }, (_, i) => {
              const m = i + 1;
              const five = m % 5 === 0;
              return (
                <g key={m} transform={`rotate(${m * 6} ${C} ${C})`}>
                  <text
                    class={`${five ? "rn" : "ar"}${m % 60 === minute ? " on" : ""}`}
                    x={C}
                    y={C - (five ? 278 : 276)}
                    text-anchor="middle"
                    dominant-baseline="central"
                  >
                    {five ? roman(m) : m}
                  </text>
                  <line
                    x1={C}
                    y1={C - (five ? 264 : 260)}
                    x2={C}
                    y2={C - 256}
                    stroke="currentColor"
                    stroke-opacity={five ? ".34" : ".14"}
                    stroke-width={five ? 1.4 : 1}
                  />
                </g>
              );
            })}
          </g>

          {/* 二環：二十四小時，一天一圈，整點才跳 */}
          <g class="rg rg-hour" style={spin(hourAngle, -1.47)}>
            {Array.from({ length: 24 }, (_, h) => (
              <g key={h} transform={`rotate(${h * 15} ${C} ${C})`}>
                <text
                  class={`hr${h === hour ? " on" : ""}`}
                  x={C}
                  y={C - 232}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {String(h).padStart(2, "0")}
                </text>
                <line
                  x1={C}
                  y1={C - 217}
                  x2={C}
                  y2={C - 208}
                  stroke="currentColor"
                  stroke-opacity={h % 6 === 0 ? ".34" : ".14"}
                  stroke-width={h % 6 === 0 ? 1.4 : 1}
                />
              </g>
            ))}
          </g>

          {/* 三環：節氣（中）／月名（英），一年一圈。標籤置於格中央，所以偏移半格 */}
          <g class="rg rg-jq" style={spin(outerAngle, 1.17)}>
            {Array.from({ length: outerCount }, (_, i) => (
              <g
                key={i}
                transform={`rotate(${((i + 0.5) * 360) / outerCount} ${C} ${C})`}
              >
                <text
                  class={`jq${i === outerActive ? " on" : ""}`}
                  x={C}
                  y={C - 187}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {outerRingName(i)}
                </text>
                <line
                  x1={C}
                  y1={C - 175}
                  x2={C}
                  y2={C - 168}
                  stroke="currentColor"
                  stroke-opacity=".18"
                />
              </g>
            ))}
          </g>

          {/* 四環：十二時辰／十二光相，兩小時跳一格 */}
          <g class="rg rg-sc" style={spin(scAngle, -1.27)}>
            {Array.from({ length: 12 }, (_, k) => (
              <g key={k} transform={`rotate(${k * 30} ${C} ${C})`}>
                <text
                  class={`bch${k === scActive ? " on" : ""}`}
                  x={C}
                  y={C - 145}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {shichenName(k)}
                </text>
                <line
                  x1={C}
                  y1={C - 135}
                  x2={C}
                  y2={C - 126}
                  stroke="currentColor"
                  stroke-opacity=".22"
                  stroke-width="1.4"
                />
              </g>
            ))}
          </g>

          {/* 五環：日照弧 */}
          <g class="rg rg-sun" style={spin(sunAngle, 0.92)}>
            <circle
              class="nitearc"
              cx={C}
              cy={C}
              r="114"
              fill="none"
              stroke-width="3.5"
            />
            {sun.sunrise !== null && sun.sunset !== null && (
              <>
                {/*
                 * pathLength 把弧長正規化成 1，dash 就不必去量真正的長度 ——
                 * 而這條弧的長度每天都不一樣（白晝多長它就多長），
                 * 量出來的值寫死在 CSS 裡隔天就錯了。
                 */}
                <path
                  class="sunarc"
                  fill="none"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  pathLength={1}
                  d={arcPath(
                    114,
                    (sun.sunrise / 24) * 360,
                    (sun.sunset / 24) * 360,
                  )}
                />
                {/* 整組包一層才有地方掛「弧畫到這裡了」的淡入 —— 點和字各自
                    已經有呼吸燈在動 animation 了，同一個屬性不能掛兩次 */}
                {(
                  [
                    [sun.sunrise, "sunrise"],
                    [sun.sunset, "sunset"],
                  ] as const
                ).map(([h, kind]) => (
                  <g
                    key={kind}
                    class="sunmark"
                    transform={`rotate(${((h / 24) * 360).toFixed(2)} ${C} ${C})`}
                  >
                    <circle class="sundot" cx={C} cy={C - 114} r="3" />
                    <text
                      class="sunlab"
                      x={C}
                      y={C - 99}
                      text-anchor="middle"
                      dominant-baseline="central"
                    >
                      {t(kind === "sunrise" ? "sun_rise" : "sun_set")} {hhmm(h)}
                    </text>
                  </g>
                ))}
              </>
            )}
          </g>

          {/* 秒針。軸心藏在中央時間後面，只露外半截 —— 不必為了指針把時間縮小 */}
          <g class="sec" style={spin(secAngleRef.current, -3.19)}>
            <path
              class="sec-hand"
              d={`M${C} ${C - 140} L${C + 1.8} ${C - 86} L${C - 1.8} ${C - 86} Z`}
            />
            <circle class="sec-hub" cx={C} cy={C - 86} r="4.5" />
          </g>

          <path class="dial-mark" d={`M${C} 6 l8 15 h-16 z`} />
        </svg>

        <div class="dial-center">
          <div class="dc-time">
            {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
          </div>
          {/*
            英文用縮寫，中文用全稱。
            
            「Thursday, 3 September 2026」在這個等寬字加 0.24em 字距之下是
            二十六個字，橫向會一路撞到日出日落那兩個金色標籤 —— 它們釘在
            半徑 99 的地方，位置是幾何算出來的，不會讓路。中文的「9月3日
            星期四」本來就短，不必動。
          */}
          <div class="dc-date">
            {new Intl.DateTimeFormat(intlLocale(), {
              year: "numeric",
              month: en ? "short" : "numeric",
              day: "numeric",
              weekday: en ? "short" : "long",
            }).format(now)}
          </div>
          <div class="dc-name">
            {shichenName(scActive)}
            {t("sc_suffix")}
          </div>
          <div class="dc-sub">
            {shichenAlt(scActive)} · {String(second).padStart(2, "0")}&quot;
          </div>
        </div>
      </div>
    </div>
  );
}
