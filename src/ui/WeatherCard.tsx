import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { intlLocale, t } from "../lib/i18n";
import {
  condition,
  fetchWeather,
  formatTemp,
  type Weather as W,
} from "../lib/weather";
import { Radar } from "./Radar";

/**
 * 天氣這張卡。
 *
 * 小的時候就是溫度、城市、天況 —— 跟右上角那塊同一份資料。
 * 拉大之後底下長出雷達回波圖。雷達只在夠大的時候掛上來，因為圖磚是每開一次
 * 新分頁都要付的網路成本，那筆錢得是使用者要的才付。
 *
 * 「夠大」用元素的實際尺寸判斷，不用 --w／--h。同樣是兩欄寬，
 * 在窄視窗上可能只有三百像素 —— 那個寬度放雷達只是一團色塊。
 */

const REFRESH_MS = 15 * 60 * 1000;
const RADAR_MIN = { w: 280, h: 200 };

interface Props {
  lat: number;
  lon: number;
  place: string;
  unit: "c" | "f";
  /** 氣象署金鑰，空字串就走模式推算 */
  cwaKey: string;
  dark: boolean;
}

export function WeatherCard({ lat, lon, place, unit, dark, cwaKey }: Props) {
  const data = useSignal<W | null>(null);
  const big = useSignal(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchWeather(lat, lon, Date.now(), cwaKey).then((w) => {
        if (alive) data.value = w;
      });
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lat, lon, cwaKey]);

  const w = data.value;

  /*
   * ref callback 每次 render 都是新的函式，Preact 每次都會再叫一遍 ——
   * 而這張卡跟著時鐘每秒重繪。原本寫在 callback 裡，等於每秒新建一個
   * ResizeObserver 而且從來沒有 disconnect（實測六次掛載就漏了八個）。
   *
   * 改成 effect + cleanup，跟 Links.tsx 和 Radar.tsx 一樣的寫法。
   */
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      big.value = r.width >= RADAR_MIN.w && r.height >= RADAR_MIN.h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div class="wxcard" ref={boxRef} data-grab>
      <div class="wx-now">
        {w ? (
          <>
            <b>{formatTemp(w.temp, unit)}</b>
            <span class="meta">
              {place} · {t(condition(w.code))}
              {/*
                體感跟氣溫差得夠多才講。台灣的夏天這兩個數字可以差五六度，
                而人在意的是體感 —— 只印氣溫會讓人以為這張卡在亂報。
                差不到兩度就不講：那是雜訊，不是資訊。
              */}
              {Math.abs(w.feels - w.temp) >= 2 && (
                <>
                  {" · "}
                  {t("wx_feels")} {formatTemp(w.feels, unit)}
                </>
              )}
            </span>
            {w.stale && <span class="stale">{t("wx_offline")}</span>}
          </>
        ) : (
          <span class="meta">{t("wx_loading")}</span>
        )}
      </div>

      {big.value && <Radar lat={lat} lon={lon} place={place} dark={dark} />}

      {w && !big.value && (
        <div class="wx-days">
          {/*
            這裡不能再 slice：parseForecast 已經切掉今天了，再切一次會把
            明天也吃掉 —— 卡上顯示的是後天和大後天，而使用者以為那是明後天。
          */}
          {w.days.map((d) => (
            <span key={d.date}>
              <i>
                {new Intl.DateTimeFormat(intlLocale(), {
                  weekday: "short",
                }).format(new Date(`${d.date}T12:00:00`))}
              </i>
              {formatTemp(d.max, unit)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
