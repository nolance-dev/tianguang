import { isEnglish, shichenAlt, shichenName, t } from "../lib/i18n";
import { indexAt } from "../lib/shichen";
import type { Settings } from "../lib/settings";

/**
 * 時鐘。
 *
 * 第一屏那個大時鐘不顯示秒（那裡要的是「大概幾點」），這張卡就是為了秒而存在的，
 * 所以秒一定顯示，不跟著設定裡那個「顯示秒數」的開關走 —— 開了這張卡卻沒有秒，
 * 那它跟日曆卡沒有差別。
 *
 * 時間從 App 每秒更新的那一個 now 來，卡片自己不開計時器。整頁只有一個時間來源，
 * 才不會出現這張卡跳到 32 秒、旁邊的時辰盤還停在 31 秒。
 */

interface Props {
  now: Date;
  settings: Settings;
  onOpen: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ClockCard({ now, settings, onOpen }: Props) {
  const h = now.getHours();
  const shown = settings.clock24 ? pad(h) : String(h % 12 === 0 ? 12 : h % 12);
  const sc = indexAt(now);
  const en = isEnglish();

  const date = new Intl.DateTimeFormat(en ? "en-GB" : undefined, {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);

  return (
    <div class="clockcard" data-grab>
      <b class="cc-time">
        {shown}
        <span class="sep">:</span>
        {pad(now.getMinutes())}
        {/* 秒用小一號並且推到基線上，讀時間的人是看時分，秒是背景 */}
        <span class="cc-sec">{pad(now.getSeconds())}</span>
        {!settings.clock24 && <span class="cc-ampm">{h < 12 ? "AM" : "PM"}</span>}
      </b>

      <span class="cc-meta">
        <span class="cc-date">{date}</span>
        <span class="cc-sc">
          {shichenName(sc)}
          {t("sc_suffix")} · {shichenAlt(sc)}
        </span>
      </span>

      <button type="button" class="expand" aria-label={t("dial_open")} onClick={onOpen}>
        ⤢
      </button>
    </div>
  );
}
