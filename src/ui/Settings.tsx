import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import { ENGINES } from "../lib/search";
import type { Settings as S } from "../lib/settings";

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

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
                    {eng.name}　{eng.prefix} +空白
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
              {(["mesh", "solid"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  aria-pressed={value.background === src}
                  onClick={() => onChange({ background: src })}
                >
                  {t(src === "mesh" ? "s_bg_mesh" : "s_bg_solid")}
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
