// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { useDialog } from "../src/ui/useDialog";

/**
 * 對話框的鍵盤行為。
 *
 * 稽核量到的：五個整屏畫面都寫了 aria-modal="true"，但沒有一個真的擋住 Tab
 * （後面還有五到十個可聚焦的控制項），關掉之後 document.activeElement 一律
 * 落回 <body>。aria-modal 只是叫輔助技術別唸後面的東西，它不會替你擋 Tab。
 *
 * jsdom 沒有版面，但 focus() 和 activeElement 是有的 —— 這幾條驗的正好是
 * 焦點跑到哪裡，不是誰畫在哪裡，所以在 jsdom 裡驗得準。
 */

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) {
    render(null, host);
    host.remove();
    host = null;
  }
});

function Box({ onClose, empty }: { onClose: () => void; empty?: boolean }) {
  const box = useDialog<HTMLDivElement>(onClose);
  return (
    <div ref={box} tabIndex={-1} role="dialog" aria-modal="true">
      {!empty && (
        <>
          <button type="button" id="a">
            a
          </button>
          <button type="button" id="b">
            b
          </button>
        </>
      )}
    </div>
  );
}

const key = (k: string, shift = false) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true }),
  );

/*
 * Preact 的 useEffect 是排在繪製之後跑的，而按鍵監聽器就掛在那裡面。
 * render() 之後立刻送 keydown 會打在還沒掛好的空檔上 —— 真人按不了那麼快，
 * 但測試可以，所以這裡要等一輪。焦點那幾條走的是 useLayoutEffect，同步的，
 * 不受影響。
 */
async function mount(el: preact.VNode) {
  host = document.createElement("div");
  document.body.append(host);
  render(el, host);
  // Preact 用 rAF 排 effect，光等一個 macrotask 不夠
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await new Promise((r) => setTimeout(r, 0));
  return host;
}

describe("對話框", () => {
  it("關掉之後焦點回到打開它的那個元素", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const h = await mount(<Box onClose={() => {}} />);
    expect(document.activeElement, "開啟時焦點要進到框裡").toBe(
      h.querySelector("#a"),
    );

    render(null, h);
    expect(document.activeElement, "關掉要還回去，不是丟回 body").toBe(opener);
    opener.remove();
  });

  it("Tab 走到最後一個會繞回第一個", async () => {
    const h = await mount(<Box onClose={() => {}} />);
    const a = h.querySelector<HTMLElement>("#a")!;
    const b = h.querySelector<HTMLElement>("#b")!;
    b.focus();
    key("Tab");
    expect(document.activeElement, "最後一個再按 Tab 要回到第一個").toBe(a);
    key("Tab", true);
    expect(document.activeElement, "Shift+Tab 反過來繞").toBe(b);
  });

  it("框裡沒有可聚焦的東西時，Tab 哪裡都不去", async () => {
    /*
     * 時辰盤就是這一種：它連關閉鈕都沒有。沒擋住的話一個 Tab 就落到盤底下
     * 那些看不見也點不到的控制項上，讀屏會開始唸盤面外面的東西。
     */
    const outside = document.createElement("button");
    document.body.append(outside);
    const h = await mount(<Box onClose={() => {}} empty />);
    const box = h.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(document.activeElement).toBe(box);
    key("Tab");
    expect(document.activeElement, "焦點不該跑到框外面").toBe(box);
    outside.remove();
  });

  it("Esc 掛在 document 上，焦點不在輸入框裡也關得掉", async () => {
    let closed = 0;
    const h = await mount(<Box onClose={() => closed++} />);
    // 焦點移到框裡另一個元素，模擬「已經 Tab 離開第一個控制項」
    h.querySelector<HTMLElement>("#b")!.focus();
    key("Escape");
    expect(closed, "Esc 要有反應").toBe(1);
  });
});
