import { useEffect, useLayoutEffect, useRef } from "preact/hooks";

/**
 * 對話框該有的鍵盤行為，五個整屏畫面共用一份。
 *
 * 稽核量到的：五個畫面都宣告了 aria-modal="true"，但沒有一個真的做到 ——
 * Tab 一路走出去（後面還有五到十個可聚焦的控制項），關掉之後
 * document.activeElement 一律落回 <body>，鍵盤使用者等於被丟回頁面開頭。
 * aria-modal 只是告訴輔助技術「後面別唸了」，它不會替你擋 Tab。
 *
 * 三件事：
 *
 * 1. 記住是誰打開的，關掉時把焦點還回去。還不回去的話，用鍵盤開了設定再關掉，
 *    就得從頭 Tab 一遍才能回到原來的位置。
 *
 * 2. Tab 在框內循環。到最後一個再按 Tab 回到第一個，Shift+Tab 反過來。
 *    框裡沒有任何可聚焦元素時（時辰盤就是這樣，它連關閉鈕都沒有），
 *    焦點就停在框本身 —— 所以框自己要能接焦點，見 tabIndex={-1}。
 *
 * 3. Esc 一律關掉，而且監聽掛在 document 上。掛在某個 input 的 onKeyDown 上
 *    （命令選盤本來就是這樣）只要焦點離開那個 input 就再也關不掉了。
 */

const FOCUSABLE =
  "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled])," +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(
  onClose: () => void,
  /** 開啟時要先聚焦哪一個。沒給就用框裡第一個可聚焦的 */
  initial?: { current: HTMLElement | null },
) {
  const box = useRef<T>(null);

  // onClose 每次 render 都是新的函式。放進相依陣列會讓監聽器一秒拆裝一次
  //（整頁每秒重繪，時鐘在走），用 ref 接住最新的，監聽器只掛一次。
  const close = useRef(onClose);
  close.current = onClose;

  // 用 layout effect 記錄，這時候焦點還在原本那個元素上
  const opener = useRef<Element | null>(null);
  useLayoutEffect(() => {
    opener.current = document.activeElement;
    const el = box.current;
    if (!el) return;
    // 指定的優先，再來是框裡第一個可聚焦的，都沒有就給框本身
    const first = initial?.current ?? el.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el).focus();
    return () => {
      // 還給打開它的那個元素。它可能已經不在畫面上（版面重排過），所以要檢查
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const el = box.current;
      if (!el) return;
      /*
       * 不要用 offsetParent 過濾看不看得見。
       *
       * position: fixed 的元素 offsetParent 一律是 null —— 而這幾個對話框
       * 正好都是 fixed，過濾下去會把框裡的東西全部濾掉，等於沒有這個迴圈。
       * 多收一兩個藏起來的元素，比整個機制失效便宜得多。
       */
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        // 框裡沒有東西可以聚焦，那就哪裡都不去 —— 不然一個 Tab 就跑到框後面了
        e.preventDefault();
        el.focus();
        return;
      }
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const on = document.activeElement;
      if (!e.shiftKey && on === lastItem) {
        e.preventDefault();
        firstItem.focus();
      } else if (e.shiftKey && (on === firstItem || on === el)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!el.contains(on)) {
        // 焦點不知怎麼跑到框外面了，抓回來
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return box;
}
