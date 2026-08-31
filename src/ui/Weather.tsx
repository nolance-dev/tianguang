import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { isEnglish, t } from "../lib/i18n";
import { condition, fetchWeather, formatTemp, type Weather as W } from "../lib/weather";

/**
 * 天氣。右上角。
 *
 * Open-Meteo 免費層沒有 SLA，所以拿不到就顯示上一次成功的值加「離線」，
 * 不留空格子。資料來源的標註是 CC BY 4.0 的要求，不是禮貌。
 */

const REFRESH_MS = 15 * 60 * 1000;

interface Props {
  lat: number;
  lon: number;
  place: string;
  unit: "c" | "f";
}

export function Weather({ lat, lon, place, unit }: Props) {
  const data = useSignal<W | null>(null);
  const open = useSignal(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchWeather(lat, lon).then((w) => {
        if (alive) data.value = w;
      });
    };
    load();
    // 快取本身是三十分鐘，這裡每十五分鐘問一次，讓長時間開著的分頁也會更新
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [lat, lon]);

  const w = data.value;
  if (!w) return null;

  const day = (iso: string) =>
    new Intl.DateTimeFormat(isEnglish() ? "en-GB" : undefined, { weekday: "short" }).format(
      new Date(`${iso}T12:00:00`),
    );

  return (
    <button
      class={`wx${open.value ? " open" : ""}`}
      type="button"
      aria-expanded={open.value}
      onClick={() => (open.value = !open.value)}
    >
      <span class="now">
        <b>{formatTemp(w.temp, unit)}</b>
        <span class="meta">
          {place} · {t(condition(w.code))}
          {w.stale && <span class="off">{t("wx_offline")}</span>}
        </span>
      </span>

      {open.value && (
        <span class="days">
          <span class="feels">
            {t("wx_feels")} {formatTemp(w.feels, unit)}
          </span>
          {w.days.map((d) => (
            <span class="day" key={d.date}>
              <span class="d">{day(d.date)}</span>
              <span class="c">{t(condition(d.code))}</span>
              <span class="hl">
                {formatTemp(d.max, unit)}
                <i>{formatTemp(d.min, unit)}</i>
              </span>
            </span>
          ))}
          <span class="credit">Open-Meteo · CC BY 4.0</span>
        </span>
      )}
    </button>
  );
}
