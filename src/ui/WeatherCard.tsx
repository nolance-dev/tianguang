import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { isEnglish, t } from "../lib/i18n";
import { condition, fetchWeather, formatTemp, type Weather as W } from "../lib/weather";
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
  dark: boolean;
}

export function WeatherCard({ lat, lon, place, unit, dark }: Props) {
  const data = useSignal<W | null>(null);
  const big = useSignal(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchWeather(lat, lon).then((w) => {
        if (alive) data.value = w;
      });
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lat, lon]);

  const w = data.value;

  const measure = (el: HTMLDivElement | null) => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      big.value = r.width >= RADAR_MIN.w && r.height >= RADAR_MIN.h;
    });
    ro.observe(el);
  };

  return (
    <div class="wxcard" ref={measure} data-grab>
      <div class="wx-now">
        {w ? (
          <>
            <b>{formatTemp(w.temp, unit)}</b>
            <span class="meta">
              {place} · {t(condition(w.code))}
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
          {w.days.slice(1, 4).map((d) => (
            <span key={d.date}>
              <i>
                {new Intl.DateTimeFormat(isEnglish() ? "en-GB" : undefined, {
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
