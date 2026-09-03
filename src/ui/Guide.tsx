import { useRef, useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { useDialog } from "./useDialog";

/**
 * 首次引導。三步，裝好第一次開新分頁時出現一次。
 *
 * 第二步會真的把畫面切到第二屏，讓人看見卡片，而不是讀一段「往下還有一屏」。
 * 這一屏平常是收在畫面底下的，不講的話多數人不會發現它存在 —— 而那正是
 * 這個擴充功能一半的內容。看得到就不必解釋。
 *
 * 看完寫進設定（不是 localStorage），所以它跟著帳號同步：換一台機器登入
 * 同一個 Edge 帳號，不會再被引導一次。
 */

interface Props {
  /** 引導走到某一步時，要把畫面切到哪一屏 */
  onPage: (page: number) => void;
  onDone: () => void;
}

/*
 * 每一步停在哪一屏。
 *
 * 前三步講第一屏的東西（時鐘、搜尋、快速存取），第四五步講工作區，
 * 最後一步回到第一屏收在時辰盤和齒輪 —— 因為那是接下來要按的兩個地方。
 *
 * 挑的六件事有一個共同點：**看不出來**。第二屏收在畫面底下、時鐘可以點、
 * Ctrl K 是隱形的、天氣卡拉大會變雷達圖 —— 沒人講就不會發現。
 * 齒輪和卡片本身看得見，所以只帶過。
 */
const PAGE = [0, 0, 0, 1, 1, 0];
const STEPS = PAGE.length;

export function Guide({ onPage, onDone }: Props) {
  const [step, setStep] = useState(0);

  /*
   * 焦點給「下一步」，不是給「略過」。
   *
   * useDialog 預設聚焦框裡第一個可按的東西，而版面上「略過」排在前面 ——
   * 那樣一進來按 Enter 就是把引導關掉，剛好是使用者最不想要的那個結果。
   * 主要動作該接住 Enter。
   */
  const next = useRef<HTMLButtonElement>(null);
  // 略過和看完是同一件事：都不要再出現
  const box = useDialog<HTMLDivElement>(onDone, next);

  const go = (next: number) => {
    if (next >= STEPS) {
      onDone();
      return;
    }
    setStep(next);
    onPage(PAGE[next]!);
  };

  return (
    <div class="guide">
      <div
        ref={box}
        tabIndex={-1}
        class="guide-box"
        role="dialog"
        aria-modal="true"
        aria-label={t("gd_title")}
      >
        <b class="gd-kicker">{t("gd_title")}</b>
        <h2>{t(`gd_h${step}`)}</h2>
        <p>{t(`gd_b${step}`)}</p>

        <div class="gd-foot">
          {/* 走到哪一步用點表示。數字對三步來說太吵 */}
          <span class="gd-dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <i key={i} class={i === step ? "on" : undefined} />
            ))}
          </span>
          <span class="gd-acts">
            {step < STEPS - 1 && (
              <button type="button" class="gd-skip" onClick={onDone}>
                {t("gd_skip")}
              </button>
            )}
            <button
              ref={next}
              type="button"
              class="gd-next"
              onClick={() => go(step + 1)}
            >
              {t(step === STEPS - 1 ? "gd_done" : "gd_next")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
