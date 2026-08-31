import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { isEnglish, outerRingName, shichenAlt, shichenName, t } from "../lib/i18n";
import { roman } from "../lib/roman";
import { dayFraction } from "../lib/shichen";
import { jieqiFraction, moonFraction, moonIndex, jieqiIndex, sunTimes } from "../lib/solar";

/**
 * 全屏時辰盤。
 *
 * 一個規則貫穿整個盤面：**環一律逆時針飄，把「現在」送到頂端標記下；
 * 只有秒針順時針掃。** 針與環反向，動起來層次才清楚。
 *
 * 時、分、秒三層各跳各的：秒針在走的那六十秒裡，時環與分環完全靜止。
 * 這是刻意的 —— 連續飄移會讓整個盤面一直微微蠕動，看久了很躁。
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const closeRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => closeRef.current?.focus(), []);

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
  const outerFrac = en ? moonFraction(now) : jieqiFraction(now);
  const outerActive = en ? moonIndex(now) : jieqiIndex(now);
  const scFrac = dayFraction(now);
  const scActive = Math.round(scFrac * 12) % 12;

  const sun = sunTimes(now, lat, lon);

  const spin = (deg: number) => ({ transform: `rotate(${deg}deg)`, transformOrigin: `${C}px ${C}px` });

  return (
    <div
      class={`dial${shown ? " in" : ""}${ready ? " ready" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("dial_title")}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <button ref={closeRef} class="dial-x" type="button" onClick={onClose} aria-label={t("dial_close")}>
        ✕
      </button>

      <div class="dial-wrap">
        <svg viewBox="0 0 620 620" aria-hidden="true">
          {[250, 204, 162, 93].map((r) => (
            <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="currentColor" stroke-opacity=".06" />
          ))}

          {/* 一環：六十分刻，一小時一圈，整分才跳。逢五羅馬數字，其餘小阿拉伯數字 */}
          <g style={spin(minAngle)}>
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
          <g style={spin(hourAngle)}>
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
          <g style={spin(-outerFrac * 360)}>
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

          {/* 四環：十二時辰／十二光相，一天一圈　五環：日照弧 */}
          <g style={spin(-scFrac * 360)}>
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
          <g class="sec" style={spin(secAngleRef.current)}>
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
