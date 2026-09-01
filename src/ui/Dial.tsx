import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { isEnglish, outerRingName, shichenAlt, shichenName, t } from "../lib/i18n";
import { roman } from "../lib/roman";
import { indexAt } from "../lib/shichen";
import { moonIndex, jieqiIndex, sunTimes } from "../lib/solar";

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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "F11") return;
      // F11 是瀏覽器的全螢幕鍵。攔不攔得住由瀏覽器決定，攔得住就只收盤不切全螢幕
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 盤面沒有關閉鈕，出口只有鍵盤。焦點必須落進對話框本身，
  // 否則焦點還留在底下那顆看不見的按鈕上，讀屏會唸盤面外面的東西。
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => boxRef.current?.focus(), []);

  const en = isEnglish();
  const minute = now.getMinutes();
  const hour = now.getHours();
  const second = now.getSeconds();

  const minAngle = useMonotonicAngle(-minute * TAU_MIN, true);
  const hourAngle = useMonotonicAngle(-hour * TAU_HOUR, true);
  const secAngleRef = useRef(0);
  {
    const target = second * TAU_SEC;
    const forward = (((target - (secAngleRef.current % 360)) % 360) + 360) % 360;
    secAngleRef.current += forward;
  }

  const outerCount = en ? 12 : 24;
  const outerActive = en ? moonIndex(now) : jieqiIndex(now);
  const scActive = indexAt(now);

  // 分段的環一律停在「當下這一格」的正中央，換格才轉。標籤本來就畫在格中央
  // （下面那個 +0.5），所以角度也要算到格中央，否則會差半格。
  const outerAngle = useMonotonicAngle((-(outerActive + 0.5) * 360) / outerCount, true);
  const scAngle = useMonotonicAngle(-scActive * 30, true);
  // 日照弧不是分段的環，是實際刻度：日出日落那兩點要對得準頂端的「現在」，
  // 所以跟著分環一分鐘跳一次，不跟時辰環兩小時跳一次。
  const sunAngle = useMonotonicAngle((-(hour * 60 + minute) / 1440) * 360, true);

  const sun = sunTimes(now, lat, lon);

  // turns 是開盤時先自轉幾圈。圈數各環不同 —— 那就是「不同頻率」：同樣五秒，
  // 分環轉一圈半多、日照弧只有七成圈，看起來就是各轉各的。dur 也各差一點，
  // 六環不會同一瞬間一起剎車。
  //
  // 要整體快慢就等比縮放這裡的圈數，不要動曲線：曲線決定的是「越轉越慢」
  // 那個形狀，圈數決定的才是速度。改曲線會把減速的手感一起改掉。
  //
  // 用 rotate 這個獨立變換屬性，不動 transform：transform 隨時間每分每秒在跳，
  // 動畫掛上去會蓋掉它。兩者各自算完再相乘，互不干涉。
  const spin = (deg: number, turns = 0, dur = 5) =>
    `transform: rotate(${deg}deg); transform-origin: ${C}px ${C}px;` +
    ` --spin: ${turns * 360}deg; --dur: ${dur}s`;

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      class={`dial${shown ? " in" : ""}${ready ? " ready" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("dial_title")}
      aria-keyshortcuts="Escape F11"
    >
      <div class="dial-wrap">
        <svg viewBox="0 0 620 620" aria-hidden="true">
          {[250, 204, 162].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="currentColor" stroke-opacity=".06" />
          ))}

          {/* 秒針根部那一圈。其他三圈是死的分隔線，這圈是呼吸燈 */}
          <circle class="hubring" cx={C} cy={C} r="93" fill="none" />

          {/* 一環：六十分刻，一小時一圈，整分才跳。逢五羅馬數字，其餘小阿拉伯數字 */}
          <g style={spin(minAngle, 1.68, 4.9)}>
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
          <g style={spin(hourAngle, 1.3, 5.1)}>
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
          <g style={spin(outerAngle, 0.93, 4.6)}>
            {Array.from({ length: outerCount }, (_, i) => (
              <g key={i} transform={`rotate(${((i + 0.5) * 360) / outerCount} ${C} ${C})`}>
                <text
                  class={`jq${i === outerActive ? " on" : ""}`}
                  x={C}
                  y={C - 187}
                  text-anchor="middle"
                  dominant-baseline="central"
                >
                  {outerRingName(i)}
                </text>
                <line x1={C} y1={C - 175} x2={C} y2={C - 168} stroke="currentColor" stroke-opacity=".18" />
              </g>
            ))}
          </g>

          {/* 四環：十二時辰／十二光相，兩小時跳一格 */}
          <g style={spin(scAngle, 1.1, 5)}>
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
          <g style={spin(sunAngle, 0.7, 4.4)}>
            <circle class="nitearc" cx={C} cy={C} r="114" fill="none" stroke-width="3.5" />
            {sun.sunrise !== null && sun.sunset !== null && (
              <>
                <path
                  class="sunarc"
                  fill="none"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  d={arcPath(114, (sun.sunrise / 24) * 360, (sun.sunset / 24) * 360)}
                />
                {([[sun.sunrise, "sunrise"], [sun.sunset, "sunset"]] as const).map(([h, kind]) => (
                  <g key={kind} transform={`rotate(${((h / 24) * 360).toFixed(2)} ${C} ${C})`}>
                    <circle class="sundot" cx={C} cy={C - 114} r="3" />
                    <text class="sunlab" x={C} y={C - 99} text-anchor="middle" dominant-baseline="central">
                      {t(kind === "sunrise" ? "sun_rise" : "sun_set")} {hhmm(h)}
                    </text>
                  </g>
                ))}
              </>
            )}
          </g>

          {/* 秒針。軸心藏在中央時間後面，只露外半截 —— 不必為了指針把時間縮小 */}
          <g class="sec" style={spin(secAngleRef.current, -2.6, 4.7)}>
            <path class="sec-hand" d={`M${C} ${C - 140} L${C + 1.8} ${C - 86} L${C - 1.8} ${C - 86} Z`} />
            <circle class="sec-hub" cx={C} cy={C - 86} r="4.5" />
          </g>

          <path class="dial-mark" d={`M${C} 6 l8 15 h-16 z`} />
        </svg>

        <div class="dial-center">
          <div class="dc-time">
            {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
          </div>
          <div class="dc-date">
            {new Intl.DateTimeFormat(en ? "en-GB" : undefined, {
              year: "numeric",
              month: en ? "long" : "numeric",
              day: "numeric",
              weekday: "long",
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
