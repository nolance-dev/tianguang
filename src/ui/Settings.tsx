import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { ENGINES } from "../lib/search";
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
            <div class="seg" role="group" aria-label={t("s_background")}>
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
