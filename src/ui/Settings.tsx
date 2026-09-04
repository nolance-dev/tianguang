import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { extensionsUrl } from "../lib/browser";
import { useDialog } from "./useDialog";
import { ENGINES } from "../lib/search";
import { DEFAULT_DESK, DEFAULT_HOME_DESK, LINKS_PER_CARD } from "../lib/desk";
import { SECOND_CALS } from "../lib/secondcal";
import {
  hasHolidayAccess,
  requestHolidayAccess,
  supported,
} from "../lib/holidays";
import { MAX_LINKS, suggestFromTopSites } from "../lib/links";
import { fileName, pack, unpack } from "../lib/snapshot";
import type { Workspace } from "../lib/workspace";
import {
  geocode,
  hasAccess,
  hasCjk,
  requestAccess,
  type Place,
} from "../lib/weather";
import { locale } from "../lib/i18n";
import type { Settings as S } from "../lib/settings";
import { ImagePicker } from "./ImagePicker";

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
  /** 備份要把工作區一起打包 —— 版面是設定，進度在工作區 */
  work: Workspace;
  onRestore: (settings: S, work: Workspace) => void;
}

/**
 * 設定分成幾頁。
 *
 * 十二個區塊排成一長條時，找一個開關要從頭捲到尾，而且捲過去的路上全是
 * 跟現在無關的東西。分頁不是為了好看 —— 是讓「我在調外觀」這件事，
 * 在畫面上只剩外觀。
 *
 * 分法照「調的是什麼」：一般是關於你和這台機器的（名字、時鐘、曆法、所在地），
 * 外觀是看得見的樣子，元件是桌面上擺什麼、怎麼排，備份是資料進出。
 */
const TABS = ["general", "look", "cards", "data"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPanel({
  value,
  onChange,
  onClose,
  work,
  onRestore,
}: Props) {
  const first = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("general");
  const body = useRef<HTMLDivElement>(null);

  const box = useDialog<HTMLElement>(onClose, first);

  return (
    <div
      class="sheet"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        ref={box}
        tabIndex={-1}
        class="panel"
        role="dialog"
        aria-modal="true"
        aria-label={t("settings_title")}
      >
        <header class="panel-h">
          <b>{t("settings_title")}</b>
          <button
            type="button"
            class="icon-btn"
            onClick={onClose}
            aria-label={t("settings_close")}
          >
            ✕
          </button>
        </header>

        <nav class="panel-tabs" role="tablist" aria-label={t("settings_title")}>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="panel-body"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => {
                setTab(id);
                // 換頁就回到最上面 —— 停在上一頁捲到的位置會像是內容少了一截
                if (body.current) body.current.scrollTop = 0;
              }}
              onKeyDown={(e) => {
                const step =
                  e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next =
                  TABS[(TABS.indexOf(id) + step + TABS.length) % TABS.length]!;
                setTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }}
            >
              {t(`s_tab_${id}`)}
            </button>
          ))}
        </nav>

        <div
          class="panel-body"
          id="panel-body"
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          ref={body}
        >
          {/* key 綁著分頁：換頁才重建這個節點，淡入動畫才重播。
              時鐘每秒重繪不會換 key，所以不會一直閃 */}
          <div class="tabpage" key={tab}>
            {tab === "general" && (
              <>
                <section>
                  <h3>{t("s_general")}</h3>
                  <label class="row">
                    <span>{t("s_lang")}</span>
                    <select
                      class="lang"
                      value={value.lang}
                      onChange={(e) =>
                        onChange({ lang: e.currentTarget.value as S["lang"] })
                      }
                    >
                      {/*
                       * 語言的名字用它自己 —— 找中文的人看得懂「繁體中文」，
                       * 不需要先看得懂現在這一種語言才找得到自己那一個。
                       */}
                      <option value="auto">{t("s_lang_auto")}</option>
                      <option value="zh_TW">繁體中文</option>
                      <option value="en">English</option>
                    </select>
                  </label>

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
                      class="engine"
                      value={value.searchEngine}
                      onChange={(e) =>
                        onChange({ searchEngine: e.currentTarget.value })
                      }
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
                      onChange={(e) =>
                        onChange({ clock24: e.currentTarget.checked })
                      }
                    />
                  </label>
                  <label class="row switch">
                    <span>{t("s_seconds")}</span>
                    <input
                      type="checkbox"
                      checked={value.showSeconds}
                      onChange={(e) =>
                        onChange({ showSeconds: e.currentTarget.checked })
                      }
                    />
                  </label>
                </section>

                <section>
                  <h3>{t("c_calendar")}</h3>
                  <label class="row">
                    <span>{t("s_second_cal")}</span>
                    <select
                      value={value.secondCal}
                      onChange={(e) =>
                        onChange({
                          secondCal: e.currentTarget.value as S["secondCal"],
                        })
                      }
                    >
                      {SECOND_CALS.map((c) => (
                        <option key={c} value={c}>
                          {t(`s_cal_${c}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Holidays value={value} onChange={onChange} />
                </section>

                <section>
                  <h3>{t("s_weather")}</h3>
                  <WeatherSettings value={value} onChange={onChange} />
                </section>
              </>
            )}

            {tab === "look" && (
              <>
                <section>
                  <h3>{t("s_quote")}</h3>
                  <label class="row">
                    <span>{t("s_quote_text")}</span>
                    <input
                      type="text"
                      value={value.quoteText}
                      onInput={(e) =>
                        onChange({ quoteText: e.currentTarget.value })
                      }
                    />
                  </label>
                  <label class="row">
                    <span>{t("s_quote_by")}</span>
                    <input
                      type="text"
                      value={value.quoteBy}
                      onInput={(e) =>
                        onChange({ quoteBy: e.currentTarget.value })
                      }
                    />
                  </label>
                  <p class="note">{t("s_quote_hint")}</p>
                </section>

                <section>
                  <h3>{t("s_background")}</h3>
                  <div
                    class="seg"
                    data-seg="background"
                    role="group"
                    aria-label={t("s_background")}
                  >
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
                        onInput={(e) =>
                          onChange({ solidColor: e.currentTarget.value })
                        }
                      />
                    </label>
                  )}

                  {value.background === "image" && (
                    <ImagePicker
                      selected={value.imageId}
                      onSelect={(imageId) => onChange({ imageId })}
                    />
                  )}

                  {value.background === "image" && (
                    <>
                      <label class="row switch">
                        <span>{t("s_tint")}</span>
                        <input
                          type="checkbox"
                          checked={value.shichenTint}
                          onChange={(e) =>
                            onChange({ shichenTint: e.currentTarget.checked })
                          }
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
                        onInput={(e) =>
                          onChange({ blur: Number(e.currentTarget.value) })
                        }
                      />
                    </label>
                  )}

                  {/* 顆粒與變暗只在圖片上有作用，其餘背景不顯示 —— 拉了沒反應的滑桿
                比沒有還糟 */}
                  {value.background === "image" && (
                    <label class="row">
                      <span>{t("s_grain")}</span>
                      <input
                        type="range"
                        min="0"
                        max="0.16"
                        step="0.005"
                        value={value.grain}
                        onInput={(e) =>
                          onChange({ grain: Number(e.currentTarget.value) })
                        }
                      />
                    </label>
                  )}
                  {value.background === "image" && (
                    <label class="row">
                      <span>{t("s_dim")}</span>
                      <input
                        type="range"
                        min="0"
                        max="0.6"
                        step="0.02"
                        value={value.dim}
                        onInput={(e) =>
                          onChange({ dim: Number(e.currentTarget.value) })
                        }
                      />
                    </label>
                  )}
                </section>
              </>
            )}

            {tab === "cards" && (
              <>
                <section>
                  <h3>{t("s_cards")}</h3>
                  {(
                    [
                      "links",
                      "clock",
                      "calendar",
                      "weather",
                      "media",
                      "todos",
                      "note",
                      "pomodoro",
                      "photos",
                      "quote",
                    ] as const
                  ).map((k) => (
                    <label class="row switch" key={k}>
                      <span>{t(`s_card_${k}`)}</span>
                      <input
                        type="checkbox"
                        checked={value.cards[k]}
                        onChange={(e) =>
                          onChange({
                            cards: {
                              ...value.cards,
                              [k]: e.currentTarget.checked,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <p class="note">{t("s_cards_local")}</p>
                </section>

                <section>
                  <h3>{t("s_home")}</h3>
                  <p class="note">{t("s_home_hint")}</p>
                  {(["links", "photos"] as const).map((k) => (
                    <label class="row switch" key={k}>
                      <span>{t(`s_card_${k}`)}</span>
                      <input
                        type="checkbox"
                        checked={value.home[k]}
                        onChange={(e) =>
                          onChange({
                            home: {
                              ...value.home,
                              [k]: e.currentTarget.checked,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </section>

                <section>
                  <h3>{t("s_desk")}</h3>
                  <p class="note">{t("s_desk_hint")}</p>
                  <button
                    type="button"
                    class="wide"
                    onClick={() => onChange({ desk: DEFAULT_DESK })}
                  >
                    {t("s_desk_reset")}
                  </button>
                  <button
                    type="button"
                    class="wide"
                    onClick={() => onChange({ homeDesk: DEFAULT_HOME_DESK })}
                  >
                    {t("s_desk_reset_home")}
                  </button>
                </section>

                <section>
                  <h3>{t("s_links")}</h3>
                  <div
                    class="seg"
                    data-seg="linkcards"
                    role="group"
                    aria-label={t("s_link_cards")}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={value.linkCards === n}
                        onClick={() => onChange({ linkCards: n })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p class="note">
                    {t("s_link_cards_hint", String(LINKS_PER_CARD))}
                  </p>
                  <LinkImport value={value} onChange={onChange} />
                </section>
              </>
            )}

            {tab === "data" && (
              <>
                <section>
                  <h3>{t("s_backup")}</h3>
                  <p class="note">{t("s_backup_hint")}</p>
                  <Backup value={value} work={work} onRestore={onRestore} />
                </section>

                <section>
                  <h3>{t("s_guide")}</h3>
                  <p class="note">{t("s_guide_hint")}</p>
                  {/*
                   * 引導看過一次就不再出現，而略過的人等於再也拿不回來。
                   * 這裡是唯一的入口 —— 把旗標放掉再關掉面板，引導就會自己上來。
                   */}
                  <button
                    type="button"
                    class="wide guide-replay"
                    onClick={() => {
                      onChange({ guided: false });
                      onClose();
                    }}
                  >
                    {t("s_guide_go")}
                  </button>
                </section>

                <section class="about">
                  <h3>{t("s_about")}</h3>
                  <dl>
                    <dt>{t("s_restore")}</dt>
                    {/* 網址由瀏覽器決定 —— 同一份程式碼要同時上 Edge 與
                        Chrome 兩家商店，寫死其中一個另一邊就找不到路 */}
                    <dd>{t("s_restore_body", extensionsUrl())}</dd>
                    <dt>{t("s_credits")}</dt>
                    <dd>
                      <a
                        href="https://open-meteo.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open-Meteo
                      </a>
                      {" · CC BY 4.0"}
                    </dd>
                    <dt>{t("s_version")}</dt>
                    <dd>{__APP_VERSION__}</dd>
                    {/*
                      捐款放在這裡，不放在看得到的地方。
                      新分頁是一天看五十次的畫面，在第一屏擺一顆募款鈕是最快
                      讓人解除安裝的做法。會翻到設定最底下的人本來就是在乎
                      這個工具的人 —— 那才是該問的時機。
                    */}
                    <dt>{t("s_support")}</dt>
                    <dd>
                      {t("s_support_body")}{" "}
                      <a
                        href="https://ko-fi.com/nolance"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("s_support_link")}
                      </a>
                    </dd>
                  </dl>
                </section>
              </>
            )}
          </div>
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
/**
 * 當地節日的開關。
 *
 * 三件事要分開講：使用者要不要、這個國家有沒有行事曆、以及有沒有連線權限。
 * 混成一個開關的話，關掉之後使用者不知道是自己關的還是根本沒支援。
 */
function Holidays({
  value,
  onChange,
}: {
  value: S;
  onChange: (p: Partial<S>) => void;
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // 開發伺服器上沒有 chrome.permissions，那顆「允許」按了不會有任何事
  const inExtension = typeof chrome !== "undefined" && !!chrome.permissions;

  useEffect(() => {
    void hasHolidayAccess().then(setAllowed);
  }, []);

  const known = supported(value.countryCode);

  return (
    <>
      <label class="row switch">
        <span>{t("s_holidays")}</span>
        <input
          type="checkbox"
          checked={value.holidaysOn}
          onChange={(e) => onChange({ holidaysOn: e.currentTarget.checked })}
        />
      </label>

      {value.holidaysOn && !known && (
        <p class="note">
          {t("s_holidays_unsupported", value.countryCode || "—")}
        </p>
      )}

      {value.holidaysOn && known && allowed === false && inExtension ? (
        <button
          type="button"
          class="wide"
          onClick={() => {
            // 權限必須在使用者手勢裡要
            void requestHolidayAccess().then(setAllowed);
          }}
        >
          {t("s_holidays_allow")}
        </button>
      ) : null}

      {value.holidaysOn && known && !inExtension && (
        <p class="note">{t("s_holidays_devmode")}</p>
      )}

      <p class="note">{t("s_holidays_hint", value.countryCode || "—")}</p>
    </>
  );
}

/**
 * 從瀏覽器的常用網站帶入。
 *
 * topSites 回傳幾筆是瀏覽器決定的，也可能一筆都沒有（剛裝機、剛清過歷史、
 * 或大多在隱私視窗瀏覽）。所以按下去要有明確回饋，不能靜靜地什麼都不發生。
 */
function LinkImport({
  value,
  onChange,
}: {
  value: S;
  onChange: (p: Partial<S>) => void;
}) {
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
function WeatherSettings({
  value,
  onChange,
}: {
  value: S;
  onChange: (p: Partial<S>) => void;
}) {
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
                  onChange({
                    placeName: p.name,
                    countryCode: p.countryCode ?? "",
                    lat: p.lat,
                    lon: p.lon,
                  });
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

/**
 * 備份與還原。
 *
 * 一個檔案，裡面是設定加工作區。跨裝置最老實的一條路 —— 不必登入、不必信任
 * 任何伺服器、換瀏覽器換帳號都能用。缺點是要自己搬檔案，所以介面上寫清楚
 * 它包含什麼、不包含什麼。
 */
function Backup({
  value,
  work,
  onRestore,
}: {
  value: S;
  work: Workspace;
  onRestore: (settings: S, work: Workspace) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        type="button"
        class="wide"
        onClick={() => {
          const at = new Date();
          const blob = new Blob(
            [JSON.stringify(pack(value, work, at), null, 2)],
            {
              type: "application/json",
            },
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName(at);
          a.click();
          // 立刻收掉的話，有些情況下下載還沒開始就沒了
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
          setMsg(t("s_backup_saved"));
        }}
      >
        {t("s_backup_export")}
      </button>

      <button type="button" class="wide" onClick={() => file.current?.click()}>
        {t("s_backup_import")}
      </button>

      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const picked = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!picked) return;
          try {
            const got = unpack(JSON.parse(await picked.text()));
            if (!got) {
              setMsg(t("s_backup_bad"));
              return;
            }
            onRestore(got.settings, got.workspace);
            setMsg(t("s_backup_done"));
          } catch {
            // 壞掉的 JSON、選錯檔案、讀不到 —— 對使用者都是同一件事
            setMsg(t("s_backup_bad"));
          }
        }}
      />

      {msg && <p class="note">{msg}</p>}
    </>
  );
}
