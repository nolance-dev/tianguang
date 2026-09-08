import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { t } from "../lib/i18n";
import { extensionsUrl } from "../lib/browser";
import {
  focus,
  hasMediaAccess,
  order,
  playing,
  requestMediaAccess,
  setMuted,
  type Playing,
} from "../lib/media";
import {
  canControl,
  canSkip,
  control,
  grantControl,
  type Cmd,
} from "../lib/mediactl";

/**
 * 正在播放。
 *
 * 沒有 onAudibleChanged 這種事件，chrome.tabs.onUpdated 又要 tabs 權限才收得到
 * 完整的 changeInfo，所以這裡就輪詢。兩秒一次 —— 這是在問瀏覽器自己記憶體裡的
 * 一份清單，不是網路請求，兩秒的成本接近零，而拖到五秒按了靜音要等半天才更新。
 */

const POLL_MS = 2000;

export function MediaCard() {
  const list = useSignal<Playing[]>([]);
  const allowed = useSignal<boolean | null>(null);
  const windowId = useSignal<number | null>(null);
  const refused = useSignal(false);
  /** 剛剛被拒絕控制權限的那個網域。給一行說明，不是靜靜地什麼都不做 */
  const denied = useSignal<string | null>(null);
  // 開發伺服器上沒有 chrome.permissions。按了不會有任何事，
  // 而一顆按了沒反應的鈕比不給還糟 —— 直接講明白為什麼。
  const inExtension = typeof chrome !== "undefined" && !!chrome.permissions;

  useEffect(() => {
    void hasMediaAccess().then((ok) => (allowed.value = ok));
    if (typeof chrome !== "undefined" && chrome.windows?.getCurrent) {
      void chrome.windows
        .getCurrent()
        .then((w) => (windowId.value = w.id ?? null));
    }
  }, []);

  useEffect(() => {
    if (allowed.value !== true) return;
    let alive = true;
    const tick = () => {
      void playing().then((found) => {
        if (alive) list.value = found;
      });
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [allowed.value]);

  const rows = order(list.value, windowId.value);
  const lead = rows.find((r) => !r.paused) ?? rows[0];

  /**
   * 下一個指令。
   *
   * 權限直接 request，不先問 contains —— 中間多一個 await 會讓瀏覽器
   * 不再把這次呼叫算成使用者手勢，對話框就跳不出來。已經給過的話
   * request 會直接回 true，不會重複打擾。
   */
  async function send(p: Playing, cmd: Cmd) {
    const ok = await grantControl(p.host);
    if (!ok) {
      denied.value = p.host;
      return;
    }
    denied.value = null;
    const r = await control(p.id, p.host, cmd);
    // 輪詢兩秒才一次，按下去要當場看到鍵換了樣子
    if (cmd === "toggle" && (r === "playing" || r === "paused")) {
      list.value = list.value.map((x) =>
        x.id === p.id ? { ...x, paused: r === "paused" } : x,
      );
    }
  }

  if (allowed.value === false) {
    return (
      <div class="media" data-grab>
        <header>
          <b>{t("c_media")}</b>
        </header>
        <div class="media-ask">
          <p>{t(inExtension ? "c_media_ask" : "c_media_devmode")}</p>
          {inExtension && (
            <button
              type="button"
              onClick={() => {
                // 權限必須在使用者手勢裡要，所以請求就寫在 onClick
                void requestMediaAccess().then((ok) => {
                  allowed.value = ok;
                  // 被拒絕也要有回音。按了什麼都沒變會讓人以為按壞了
                  refused.value = !ok;
                });
              }}
            >
              {t("c_media_allow")}
            </button>
          )}
          {refused.value && (
            <p class="err">{t("c_media_refused", extensionsUrl())}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="media" data-grab>
      {/* 底圖是網站圖示放大糊掉。它不是專輯封面 —— 瀏覽器不給 ——
          但它是真的，而且一眼就知道聲音從哪個站來 */}
      {lead?.favicon && (
        <span
          class="media-bg"
          style={{ backgroundImage: `url("${lead.favicon}")` }}
        />
      )}

      <header>
        <b>{t("c_media")}</b>
        <span>{rows.length || ""}</span>
      </header>

      {rows.length === 0 ? (
        <p class="empty">{t("c_media_quiet")}</p>
      ) : (
        <ul class="media-list">
          {rows.map((p) => (
            <li
              key={p.id}
              class={[p.muted && "muted", p.paused && "paused"]
                .filter(Boolean)
                .join(" ")}
            >
              <button type="button" class="go" onClick={() => void focus(p)}>
                {p.favicon ? (
                  <img src={p.favicon} alt="" loading="lazy" />
                ) : (
                  <i class="dot" aria-hidden="true" />
                )}
                <span class="txt">
                  <b>{p.title}</b>
                  <span>{p.host}</span>
                </span>
              </button>
              <span class="media-ctl">
                {/* 沒宣告過的來源要不到權限，長出鈕來只是騙人 */}
                {/* 這一站有沒有上下首是量出來的，量不到就不長那兩顆鈕 ——
                    按了沒反應比沒有那顆鈕更糟 */}
                {canSkip(p.host) && (
                  <button
                    type="button"
                    aria-label={t("c_media_prev")}
                    onClick={() => void send(p, "prev")}
                  >
                    ⏮
                  </button>
                )}
                {canControl(p.host) && (
                  <button
                    type="button"
                    class="play"
                    aria-label={t(p.paused ? "c_media_play" : "c_media_pause")}
                    onClick={() => void send(p, "toggle")}
                  >
                    {p.paused ? "▶" : "⏸"}
                  </button>
                )}
                {canSkip(p.host) && (
                  <button
                    type="button"
                    aria-label={t("c_media_next")}
                    onClick={() => void send(p, "next")}
                  >
                    ⏭
                  </button>
                )}
                <button
                  type="button"
                  class="mute"
                  aria-pressed={p.muted}
                  aria-label={t(p.muted ? "c_media_unmute" : "c_media_mute")}
                  onClick={() => {
                    void setMuted(p.id, !p.muted);
                    // 等下一次輪詢會慢兩秒，按下去要馬上有反應
                    list.value = list.value.map((x) =>
                      x.id === p.id ? { ...x, muted: !x.muted } : x,
                    );
                  }}
                >
                  {p.muted ? "🔇" : "🔊"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {denied.value && <p class="err">{t("c_media_ctl_no", denied.value)}</p>}
    </div>
  );
}
