import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { t } from "../lib/i18n";
import {
  activate,
  bookmarks,
  downloads,
  history,
  openTabs,
  rank,
  recentlyClosed,
  SOURCE_PERMISSIONS,
  type Item,
  type SourceId,
} from "../lib/palette";
import { resolve } from "../lib/search";

/**
 * 指令面板。
 *
 * 權限一個一個要，不是一次全拿 —— 只想搜書籤的人不必連歷史也交出去。
 * 沒授權的來源會在上方列出來，按一下才問，而且拒絕之後其他來源照常用。
 *
 * 沒有任何結果時，Enter 直接拿去搜尋。這個框不該有死路。
 */

const SOURCES: SourceId[] = ["tabs", "bookmarks", "history", "sessions", "downloads"];

interface Props {
  engineId: string;
  onClose: () => void;
}

export function Palette({ engineId, onClose }: Props) {
  const query = useSignal("");
  const items = useSignal<Item[]>([]);
  const granted = useSignal<SourceId[]>([]);
  const cursor = useSignal(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => input.current?.focus(), []);

  const close = useRef(onClose);
  close.current = onClose;

  async function refreshGrants() {
    if (typeof chrome === "undefined" || !chrome.permissions) return;
    const has = await Promise.all(
      SOURCES.map((s) => chrome.permissions.contains(SOURCE_PERMISSIONS[s])),
    );
    granted.value = SOURCES.filter((_, i) => has[i]);
  }

  useEffect(() => {
    void refreshGrants();
  }, []);

  // 每次查詢變動就重抓。歷史一定要讓瀏覽器先過濾，其餘一次抓完在本地排序。
  useEffect(() => {
    let alive = true;
    const q = query.value;
    void (async () => {
      const g = granted.value;
      const parts = await Promise.all([
        g.includes("tabs") ? openTabs() : [],
        g.includes("bookmarks") ? bookmarks() : [],
        g.includes("history") ? history(q) : [],
        g.includes("sessions") ? recentlyClosed() : [],
        g.includes("downloads") ? downloads() : [],
      ]);
      if (!alive) return;
      items.value = parts.flat();
      cursor.value = 0;
    })();
    return () => {
      alive = false;
    };
  }, [query.value, granted.value.join()]);

  const shown = rank(items.value, query.value);

  function go(delta: number) {
    if (shown.length === 0) return;
    cursor.value = (cursor.value + delta + shown.length) % shown.length;
    listRef.current
      ?.querySelectorAll("li")
      [cursor.value]?.scrollIntoView({ block: "nearest" });
  }

  function submit() {
    const hit = shown[cursor.value];
    if (hit) {
      activate(hit);
      close.current();
      return;
    }
    // 沒有結果就當成一般搜尋。這個框不該有死路。
    const r = resolve(query.value, engineId);
    if (r) location.href = r.url;
  }

  return (
    <div class="pal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="pal-box" role="dialog" aria-modal="true" aria-label={t("pal_title")}>
        <div class="pal-head">
          <span aria-hidden="true">⌕</span>
          <input
            ref={input}
            type="text"
            value={query.value}
            placeholder={t("pal_hint")}
            aria-label={t("pal_title")}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => (query.value = e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                go(1);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                go(-1);
              } else if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <span class="kbd">Esc</span>
        </div>

        {SOURCES.some((s) => !granted.value.includes(s)) && (
          <div class="pal-grants">
            <span>{t("pal_enable")}</span>
            {SOURCES.filter((s) => !granted.value.includes(s)).map((s) => (
              <button
                key={s}
                type="button"
                onClick={async () => {
                  // 必須在使用者手勢裡呼叫，所以請求寫在 onClick
                  const ok = await chrome.permissions.request(SOURCE_PERMISSIONS[s]);
                  if (ok) await refreshGrants();
                }}
              >
                {t(`pal_src_${s}`)}
              </button>
            ))}
          </div>
        )}

        {shown.length > 0 ? (
          <ul class="pal-list" ref={listRef} role="listbox">
            {shown.map((it, i) => (
              <li key={it.id}>
                <button
                  type="button"
                  class={i === cursor.value ? "on" : undefined}
                  role="option"
                  aria-selected={i === cursor.value}
                  onMouseEnter={() => (cursor.value = i)}
                  onClick={() => {
                    activate(it);
                    onClose();
                  }}
                >
                  <span class="tag">{t(`pal_src_${it.source}`)}</span>
                  <span class="ttl">{it.title}</span>
                  {it.sub && <span class="sub">{it.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p class="pal-empty">
            {granted.value.length === 0
              ? t("pal_empty_nogrant")
              : query.value
                ? t("pal_empty_search")
                : t("pal_empty_type")}
          </p>
        )}
      </div>
    </div>
  );
}
