/**
 * 滾輪的一格到底是多少像素。
 *
 * deltaY 的單位由 deltaMode 決定，滑鼠通常給像素、部分瀏覽器與設定給行或頁。
 * 不換算的話，同一個門檻在不同滑鼠上差幾十倍。
 */
export function wheelPixels(e: WheelEvent): number {
  if (e.deltaMode === 1) return e.deltaY * 33; // 以行為單位
  if (e.deltaMode === 2) return e.deltaY * window.innerHeight; // 以頁為單位
  return e.deltaY;
}
