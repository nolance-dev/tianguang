/**
 * FLIP：先量舊位置，改完版面再量新位置，把差值當成起始 transform 播回零。
 *
 * CSS 對「換一格」這種事沒有過場可做 —— grid-column: span 2 變 span 3、
 * 或者兩個兄弟節點互換順序，瀏覽器都是一幀跳到位。只能自己補。
 *
 * 第一版用的是 View Transition。它在拖曳時是錯的工具：每跨一格就把整頁
 * 拍成快照、蓋一層 0.3 秒的過場在上面，那 0.3 秒裡的後續變動全發生在
 * 蓋板底下看不到，結束時一次跳到位 —— 拖起來就是卡的。FLIP 只碰指定的
 * 那幾個節點，而且可以隨時被下一次打斷、從當下的位置接著跑。
 *
 * 兩個地方用它：工作區的卡片換位置改大小（.card），
 * 以及快速存取裡的磚塊互換順序（.slot）。兩邊的手感要一樣。
 *
 * 只補位移，不補縮放：東西變大變小是瞬間的，但拉伸中的文字很難看，
 * 而且那 200 毫秒裡使用者看的是自己拉的那一個，不是它的字。
 *
 * 用 element.animate() 不是 CSS transition，所以 styles.css 那條全域的
 * prefers-reduced-motion 管不到它 —— 這裡自己問一次。
 */

const flying = new WeakMap<HTMLElement, Animation>();

/** 跟 styles.css 裡那條同一條曲線。手感要一致，就不能各寫各的 */
export const EASE = "cubic-bezier(.22, 1, .28, 1)";
export const FLIP_MS = 220;

export function slide(
  box: HTMLElement | null,
  apply: () => void,
  sel = ".card",
): void {
  const still =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!box || still || typeof box.animate !== "function") {
    apply();
    return;
  }

  const nodes = [...box.querySelectorAll<HTMLElement>(sel)];
  // 量到的是「看起來在哪」，不是「版面上在哪」—— 上一段動畫還在跑的話
  // 這裡量到的就是它現在飛到一半的位置，接得起來才不會跳回去重來
  const before = new Map(nodes.map((n) => [n, n.getBoundingClientRect()]));

  apply();

  requestAnimationFrame(() => {
    for (const node of box.querySelectorAll<HTMLElement>(sel)) {
      const a = before.get(node);
      if (!a) continue;
      // 先取消上一段，位置才會回到版面算出來的地方
      flying.get(node)?.cancel();
      const b = node.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const anim = node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: FLIP_MS, easing: EASE },
      );
      flying.set(node, anim);
    }
  });
}
