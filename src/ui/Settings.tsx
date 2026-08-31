import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { ENGINES } from "../lib/search";
import { MAX_LINKS, suggestFromTopSites } from "../lib/links";
import { geocode, hasAccess, hasCjk, requestAccess, type Place } from "../lib/weather";
import { locale } from "../lib/i18n";
import type { Settings as S } from "../lib/settings";
import { addImage, deleteImage, listImages, toUrl, type StoredImage } from "../lib/images";

/**
 * 設定抽屜。
 *
 * 「關於」那一段不是附贈的說明文字，是複審抓到的缺漏：
 * 使用者裝上之後沒有任何地方告訴他怎麼換回 Edge 原本的新分頁，
 * 天氣資料的授權也要求標註來源。兩件事都放在這裡，一次講完。
 */

interface Props {
  value: S;
  onChange: (patch: Partial<S>) => void;
  onClose: () => void;
}

export function SettingsPanel({ value, onChange, onClose }: Props) {
  const first = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => first.current?.focus(), []);

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div class="sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside class="panel" role="dialog" aria-modal="true" aria-label={t("settings_title")}>
        <header class="panel-h">
          <b>{t("settings_title")}</b>
          <button type="button" class="icon-btn" onClick={onClose} aria-label={t("settings_close")}>
            ✕
          </button>
        </header>

        <div class="panel-body">
          <section>
            <h3>{t("s_general")}</h3>
            <label class="row">
              <span>{t("s_name")}</span>
              <input
                ref={first}
                type="text"
                value={value.name}
                placeholder={t("s_name_hint")}
                onInput={(e) => onChange({ name: e.currentTarget.value })}
              />
            </label>

            <label class="row">
              <span>{t("s_engine")}</span>
              <select
                value={value.searchEngine}
                onChange={(e) => onChange({ searchEngine: e.currentTarget.value })}
              >
                {ENGINES.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    {eng.name}
                  </option>
                ))}
              </select>
            </label>
            <p class="note">{t("s_engine_hint")}</p>
          </section>

          <section>
            <h3>{t("s_clock")}</h3>
            <label class="row switch">
              <span>{t("s_clock24")}</span>
              <input
                type="checkbox"
                checked={value.clock24}
                onChange={(e) => onChange({ clock24: e.currentTarget.checked })}
              />
            </label>
            <label class="row switch">
              <span>{t("s_seconds")}</span>
              <input
                type="checkbox"
                checked={value.showSeconds}
                onChange={(e) => onChange({ showSeconds: e.currentTarget.checked })}
              />
            </label>
          </section>

          <section>
            <h3>{t("s_background")}</h3>
            <div class="seg" data-seg="background" role="group" aria-label={t("s_background")}>
              {(["mesh", "solid", "image"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  aria-pressed={value.background === src}
                  onClick={() => onChange({ background: src })}
                >
                  {t(`s_bg_${src}`)}
                </button>
              ))}
            </div>

            {value.background === "solid" && (
              <label class="row">
                <span>{t("s_bg_color")}</span>
                <input
                  type="color"
                  value={value.solidColor}
                  onInput={(e) => onChange({ solidColor: e.currentTarget.value })}
                />
              </label>
            )}

            {value.background === "image" && (
              <ImagePicker selected={value.imageId} onSelect={(imageId) => onChange({ imageId })} />
            )}

            {value.background === "image" && (
              <>
                <label class="row switch">
                  <span>{t("s_tint")}</span>
                  <input
                    type="checkbox"
                    checked={value.shichenTint}
                    onChange={(e) => onChange({ shichenTint: e.currentTarget.checked })}
                  />
                </label>
                <p class="note">{t("s_tint_hint")}</p>
              </>
            )}

            {value.background === "image" && (
              <label class="row">
                <span>{t("s_blur")}</span>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={value.blur}
                  onInput={(e) => onChange({ blur: Number(e.currentTarget.value) })}
                />
              </label>
            )}

            <label class="row">
              <span>{t("s_grain")}</span>
              <input
                type="range"
                min="0"
                max="0.16"
                step="0.005"
                value={value.grain}
                onInput={(e) => onChange({ grain: Number(e.currentTarget.value) })}
              />
            </label>
            <label class="row">
              <span>{t("s_dim")}</span>
              <input
                type="range"
                min="0"
                max="0.6"
                step="0.02"
                value={value.dim}
                onInput={(e) => onChange({ dim: Number(e.currentTarget.value) })}
              />
            </label>
          </section>

          <section>
            <h3>{t("s_cards")}</h3>
            {(["focus", "todos", "note", "pomodoro", "quote"] as const).map((k) => (
              <label class="row switch" key={k}>
                <span>{t(`s_card_${k}`)}</span>
                <input
                  type="checkbox"
                  checked={value.cards[k]}
                  onChange={(e) =>
                    onChange({ cards: { ...value.cards, [k]: e.currentTarget.checked } })
                  }
                />
              </label>
            ))}
            <p class="note">{t("s_cards_local")}</p>
          </section>

          <section>
            <h3>{t("s_links")}</h3>
            <LinkImport value={value} onChange={onChange} />
          </section>

          <section>
            <h3>{t("s_weather")}</h3>
            <WeatherSettings value={value} onChange={onChange} />
          </section>

          <section class="about">
            <h3>{t("s_about")}</h3>
            <dl>
              <dt>{t("s_restore")}</dt>
              <dd>{t("s_restore_body")}</dd>
              <dt>{t("s_credits")}</dt>
              <dd>
                <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
                  Open-Meteo
                </a>
                {" · CC BY 4.0"}
              </dd>
              <dt>{t("s_version")}</dt>
              <dd>{__APP_VERSION__}</dd>
            </dl>
          </section>
        </div>
      </aside>
    </div>
  );
}


/**
 * 自訂桌布的挑圖區。
 *
 * 圖存在 IndexedDB，只在這台電腦 —— storage.sync 每項 8KB，圖片塞不進去，
 * 而我們沒有伺服器。這件事直接寫在下面那行小字裡，不要讓使用者以為傳丟了。
 */
function ImagePicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await listImages();
    setImages(list);
    setUrls((old) => {
      // 舊的縮圖網址要收掉，不然每次重整都漏一批 blob
      for (const url of Object.values(old)) URL.revokeObjectURL(url);
      return Object.fromEntries(list.map((img) => [img.id, toUrl(img)]));
    });
  }

  useEffect(() => {
    void refresh();
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      let last = "";
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        last = (await addImage(file)).id;
      }
      await refresh();
      if (last) onSelect(last);
    } catch {
      // 配額滿、檔案壞掉、或格式解不開都會走到這裡。講清楚發生什麼事就好。
      setError(t("s_bg_upload_failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="picker">
      <label class="drop">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void onFiles(e.currentTarget.files)}
        />
        <span>{busy ? t("s_bg_working") : t("s_bg_pick")}</span>
      </label>

      {error && <p class="note err">{error}</p>}

      {images.length > 0 && (
        <div class="thumbs">
          {images.map((img) => (
            <div key={img.id} class={`thumb${img.id === selected ? " on" : ""}`}>
              <button
                type="button"
                style={{ backgroundImage: `url("${urls[img.id]}")` }}
                aria-pressed={img.id === selected}
                aria-label={t("s_bg_use")}
                onClick={() => onSelect(img.id)}
              />
              <button
                type="button"
                class="rm"
                aria-label={t("s_bg_remove")}
                onClick={async () => {
                  await deleteImage(img.id);
                  if (img.id === selected) onSelect(null);
                  await refresh();
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p class="note">{t("s_bg_local_only")}</p>
    </div>
  );
}


/**
 * 從瀏覽器的常用網站帶入。
 *
 * topSites 回傳幾筆是瀏覽器決定的，也可能一筆都沒有（剛裝機、剛清過歷史、
 * 或大多在隱私視窗瀏覽）。所以按下去要有明確回饋，不能靜靜地什麼都不發生。
 */
function LinkImport({ value, onChange }: { value: S; onChange: (p: Partial<S>) => void }) {
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <div class="row">
        <span>
          {value.links.length} / {MAX_LINKS}
        </span>
        <button
          type="button"
          class="wide"
          onClick={async () => {
            const found = await suggestFromTopSites(value.links);
            if (found.length === 0) {
              setMsg(t("s_links_none"));
              return;
            }
            onChange({ links: [...value.links, ...found] });
            setMsg(t("s_links_imported", String(found.length)));
          }}
        >
          {t("s_links_import")}
        </button>
      </div>
      {msg && <p class="note">{msg}</p>}
    </>
  );
}

/**
 * 天氣。
 *
 * 網域權限是選用的，而且只有在使用者按下開關那一刻才索取 —— 必須在使用者
 * 手勢裡呼叫，所以請求寫在 onChange 裡而不是 effect。被拒絕就維持關閉並說明，
 * 不要留一個開著卻永遠讀不到資料的開關。
 */
function WeatherSettings({ value, onChange }: { value: S; onChange: (p: Partial<S>) => void }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(on: boolean) {
    if (!on) {
      onChange({ weatherOn: false });
      return;
    }
    const ok = (await hasAccess()) || (await requestAccess());
    if (!ok) {
      setNote(t("s_weather_denied"));
      return;
    }
    setNote(null);
    onChange({ weatherOn: true });
  }

  async function search() {
    const name = query.trim();
    if (!name) return;
    setBusy(true);
    setNote(null);
    try {
      const found = await geocode(name, locale());
      setPlaces(found);
      if (found.length === 0) {
        // 對照表沒收到的中文地名一定查不到 —— 索引本身只有英文。
        // 給一句能照做的提示，不要丟一個空清單讓人以為是壞了。
        setNote(hasCjk(name) ? t("s_city_cjk_hint") : t("s_city_none"));
      }
    } catch {
      setNote(t("s_city_none"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label class="row switch">
        <span>{t("s_weather_on")}</span>
        <input
          type="checkbox"
          checked={value.weatherOn}
          onChange={(e) => void toggle(e.currentTarget.checked)}
        />
      </label>
      <p class="note">{t("s_weather_perm")}</p>

      <div class="row">
        <span>{t("s_unit")}</span>
        <div class="seg" data-seg="unit" role="group" aria-label={t("s_unit")}>
          {(["c", "f"] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={value.unit === u}
              onClick={() => onChange({ unit: u })}
            >
              °{u.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div class="row">
        <span>{t("s_city")}</span>
        <input
          type="text"
          value={query}
          placeholder={value.placeName || t("s_city_search")}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
        />
      </div>
      {busy && <p class="note">…</p>}
      {note && <p class="note">{note}</p>}

      {places && places.length > 0 && (
        <ul class="places">
          {places.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button
                type="button"
                onClick={() => {
                  // 城市同時決定天氣的座標與時辰盤日照弧的緯度 ——
                  // 一個來源，之後不會出現天氣在台北、日照弧在別處的怪事
                  onChange({ placeName: p.name, lat: p.lat, lon: p.lon });
                  setPlaces(null);
                  setQuery("");
                }}
              >
                <b>{p.name}</b>
                <span>{[p.admin, p.country].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
