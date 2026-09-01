import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import {
  cover,
  echoLayer,
  hasRadarAccess,
  latestFrame,
  MAX_Z,
  MIN_Z,
  radarTile,
  requestRadarAccess,
  TILE,
  baseTile,
  type Frame,
} from "../lib/radar";

/**
 * 雷達回波。
 *
 * 只在卡片夠大時才掛上來 —— 圖磚是網路成本，每開一張新分頁都付一次的東西
 * 必須是使用者要的，不是預設的。
 *
 * 圖磚數量按容器的實際尺寸算，不寫死一個 5×5 的網格：寫死的話小卡片會多抓
 * 十幾張看不到的圖，大卡片又會缺一角。
 */

const REFRESH_MS = 5 * 60 * 1000;

interface Props {
  lat: number;
  lon: number;
  place: string;
  dark: boolean;
}

export function Radar({ lat, lon, place, dark }: Props) {
  const frame = useSignal<Frame | null>(null);
  const allowed = useSignal<boolean | null>(null);
  const box = useSignal<{ w: number; h: number }>({ w: 0, h: 0 });
  const zoom = useSignal(7);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void hasRadarAccess().then((ok) => (allowed.value = ok));
  }, []);

  // 容器多大就抓多少圖磚。卡片可以被拉大拉小，所以要跟著量。
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      box.value = { w: Math.ceil(r.width), h: Math.ceil(r.height) };
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (allowed.value !== true) return;
    let alive = true;
    const load = () => {
      void latestFrame().then((f) => {
        if (alive) frame.value = f;
      });
    };
    load();
    // RainViewer 大約十分鐘出一幀，五分鐘問一次就不會落後太多
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [allowed.value]);

  const { w, h } = box.value;
  const live = w > 0 && h > 0;
  const cells = live ? cover(lat, lon, zoom.value, w, h) : [];
  // 回波那一層自己算。超過 RainViewer 的上限就抓粗一級的再放大
  const echo = live
    ? echoLayer(lat, lon, zoom.value, w, h)
    : { z: zoom.value, scale: 1, cells: [] };
  const stamp = frame.value
    ? new Date(frame.value.time * 1000).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div class="radar" ref={wrap}>
      {cells.map((c) => (
        <img
          key={`b${zoom.value}-${c.x}-${c.y}`}
          class="rtile"
          src={baseTile(dark, zoom.value, c.x, c.y)}
          alt=""
          loading="lazy"
          width={TILE}
          height={TILE}
          style={{ left: `${c.left}px`, top: `${c.top}px` }}
        />
      ))}

      {frame.value &&
        echo.cells.map((c) => (
          <img
            key={`r${frame.value!.time}-${echo.z}-${c.x}-${c.y}`}
            class="rtile echo"
            src={radarTile(frame.value!, echo.z, c.x, c.y)}
            alt=""
            loading="lazy"
            width={TILE * echo.scale}
            height={TILE * echo.scale}
            style={{
              left: `${c.left}px`,
              top: `${c.top}px`,
              width: `${TILE * echo.scale}px`,
              height: `${TILE * echo.scale}px`,
            }}
          />
        ))}

      {/* 中心點的準星。沒有它就不知道這張圖是對著哪裡畫的 */}
      <span class="pin" aria-hidden="true" />
      <span class="here">{place}</span>

      <div class="zoom">
        <button
          type="button"
          aria-label={t("wx_zoom_out")}
          disabled={zoom.value <= MIN_Z}
          onClick={() => (zoom.value = Math.max(MIN_Z, zoom.value - 1))}
        >
          −
        </button>
        <button
          type="button"
          aria-label={t("wx_zoom_in")}
          disabled={zoom.value >= MAX_Z}
          onClick={() => (zoom.value = Math.min(MAX_Z, zoom.value + 1))}
        >
          ＋
        </button>
      </div>

      {allowed.value === false && (
        <div class="radar-ask">
          <p>{t("wx_radar_ask")}</p>
          <button
            type="button"
            onClick={() => {
              // 權限必須在使用者手勢裡要，所以請求寫在 onClick
              void requestRadarAccess().then((ok) => (allowed.value = ok));
            }}
          >
            {t("wx_radar_allow")}
          </button>
        </div>
      )}

      {allowed.value === true && !frame.value && <p class="radar-note">{t("wx_radar_none")}</p>}

      {/* 兩個來源都要求標註，這不是禮貌 */}
      <span class="radar-credit">
        {stamp && <b>{stamp}</b>} RainViewer · Esri, HERE, © OpenStreetMap
      </span>
    </div>
  );
}
