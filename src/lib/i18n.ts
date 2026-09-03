/**
 * i18n。
 *
 * 從第一天就走 chrome.i18n，不是之後再補 —— 中英文是兩個品牌（天光／Aubade），
 * 連十二時辰的名稱、外環的內容、預設單位都不一樣，那些差異必須從
 * messages.json 出來，不能散在元件裡寫 if。
 *
 * `vite dev` 之下沒有 chrome.i18n，所以開發模式退回 zh_TW 的字串包。
 * 這段被 import.meta.env.DEV 包住，正式打包時會被搖掉。
 */

import { signal } from "@preact/signals";
import zhTW from "../../public/_locales/zh_TW/messages.json";
import enUS from "../../public/_locales/en/messages.json";

type Bundle = Record<string, { message: string }>;

const hasChromeI18n =
  typeof chrome !== "undefined" && !!chrome.i18n?.getMessage;

/** 設定裡選的語言。auto 是跟著瀏覽器走，也就是 chrome.i18n 原本的行為。 */
export type Lang = "auto" | "zh_TW" | "en";

/*
 * 選了語言就不能再問 chrome.i18n。
 *
 * chrome.i18n.getMessage() 給的永遠是瀏覽器介面語言，沒有參數可以覆寫 ——
 * 想讓使用者自己選，就只能自己讀字串包。所以兩份 messages.json 會一起
 * 打包進去（多約 12KB gzip）。這是選語言的價碼，沒有更便宜的走法：
 * _locales 底下的檔案要用 fetch 拿是非同步的，而第一次算繪就要用到字串。
 */
/*
 * 放在 signal 裡，不是普通變數。
 *
 * @preact/signals 給每個元件裝了 shouldComponentUpdate：props 淺比較沒變、
 * 訂閱的 signal 也沒動，就不重繪。搜尋列的 props 只有一個 engineId，
 * 換語言時它一動也不動 —— 實測 SearchBar 整場只算繪過一次，
 * placeholder 卡在上一種語言，旁邊的時鐘和日期卻換好了。
 * t() 讀這個 signal，任何叫過 t() 的元件就自動訂閱到語言上。
 */
const forced = signal<Lang>("auto");

export function setLang(next: Lang): void {
  if (forced.peek() !== next) forced.value = next;
}

function fill(
  entry: { message: string } | undefined,
  key: string,
  subs?: string | string[],
): string {
  if (!entry) return import.meta.env.DEV ? key : "";
  if (!subs) return entry.message;
  const list = Array.isArray(subs) ? subs : [subs];
  return entry.message.replace(
    /\$(\d)\$?/g,
    (_, n) => list[Number(n) - 1] ?? "",
  );
}

/**
 * 兩套都載，因為中英文不只是翻譯 —— 英文版的外環是月名（moon_*），
 * 中文版是節氣（jq_*），鍵根本不同。只放一套的話另一邊會整排顯示鍵名。
 */
function devBundle(): Bundle {
  return (isEnglish() ? enUS : zhTW) as Bundle;
}

export function t(key: string, subs?: string | string[]): string {
  const pick = forced.value;
  if (pick !== "auto") {
    return fill(((pick === "en" ? enUS : zhTW) as Bundle)[key], key, subs);
  }
  if (hasChromeI18n) {
    const msg = chrome.i18n.getMessage(key, subs);
    /*
     * 空字串有兩種意思，而 chrome 不讓你分辨：鍵不存在是空字串，
     * 翻譯本來就留白也是空字串。
     *
     * 原本一律退回鍵名，於是英文版的 sc_suffix（時辰的「時」字，英文不需要，
     * 所以刻意留白）在畫面上變成一行 sc_suffix。實測過，那三個地方
     * （App.tsx、ClockCard.tsx、Dial.tsx）都會露出來。
     *
     * 所以正式版本相信「留白就是留白」，直接回空字串；開發時才退回鍵名，
     * 少了鍵仍然一眼看得到。「鍵一定存在」不是用祈禱保證的 —— 有一條測試
     * 掃過 src 裡所有 t("...") 的字面鍵，確認它們都在預設語系裡。
     */
    if (msg) return msg;
    return import.meta.env.DEV ? key : "";
  }
  if (import.meta.env.DEV) return fill(devBundle()[key], key, subs);
  return key;
}

/** 目前語系。決定外環走節氣還是月名、溫度預設攝氏還是華氏。 */
export function locale(): string {
  const pick = forced.value;
  if (pick !== "auto") return pick === "en" ? "en" : "zh-TW";
  if (hasChromeI18n) return chrome.i18n.getUILanguage();
  return typeof navigator !== "undefined" ? navigator.language : "zh-TW";
}

export function isEnglish(): boolean {
  return locale().toLowerCase().startsWith("en");
}

/** 十二時辰／十二光相的名稱，同一組索引兩套語彙。 */
export function shichenName(index: number): string {
  return t(`sc_${index}`);
}

/** 時辰的古稱（夜半、日出…）。英文版放時段範圍。 */
export function shichenAlt(index: number): string {
  return t(`scalt_${index}`);
}

/** 外環：中文是二十四節氣，英文是十二個傳統滿月名。 */
export function outerRingName(index: number): string {
  return isEnglish() ? t(`moon_${index}`) : t(`jq_${index}`);
}
