/**
 * 這個瀏覽器是誰。
 *
 * 只為了一件事存在：擴充功能管理頁的網址。Edge 是 edge://extensions，
 * Chrome 是 chrome://extensions，而同一份程式碼要同時上兩家商店 ——
 * 寫死其中一個，另一邊的使用者就會照著一個開不起來的網址去找。
 *
 * 那串網址不能做成連結（從擴充功能頁面連到 chrome:// 會被擋掉），
 * 所以它只是說明文字裡的一個字串，由訊息的 $1$ 帶進去。
 */

interface UABrand {
  brand: string;
}

/** 擴充功能管理頁。認不出來就當 chrome://，那是 Chromium 的共通值。 */
export function extensionsUrl(): string {
  if (typeof navigator === "undefined") return "chrome://extensions";
  /*
   * 先問 userAgentData —— 那是為了這件事設計的 API，回的是結構化的品牌清單。
   * 沒有的時候才退回 UA 字串比對 "Edg/"（不是 "Edge"：舊的 EdgeHTML 才叫
   * Edge，Chromium 版的權杖是 Edg）。
   */
  const data = (navigator as { userAgentData?: { brands?: UABrand[] } })
    .userAgentData;
  const brands = data?.brands;
  if (Array.isArray(brands))
    return brands.some((b) => b.brand.includes("Edge"))
      ? "edge://extensions"
      : "chrome://extensions";
  return / Edg\//.test(navigator.userAgent)
    ? "edge://extensions"
    : "chrome://extensions";
}
