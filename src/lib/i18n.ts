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

import zhTW from "../../public/_locales/zh_TW/messages.json";
import enUS from "../../public/_locales/en/messages.json";

type Bundle = Record<string, { message: string }>;

const hasChromeI18n = typeof chrome !== "undefined" && !!chrome.i18n?.getMessage;

/**
 * 兩套都載，因為中英文不只是翻譯 —— 英文版的外環是月名（moon_*），
 * 中文版是節氣（jq_*），鍵根本不同。只放一套的話另一邊會整排顯示鍵名。
 */
function devBundle(): Bundle {
  return (isEnglish() ? enUS : zhTW) as Bundle;
}

export function t(key: string, subs?: string | string[]): string {
  if (hasChromeI18n) {
    const msg = chrome.i18n.getMessage(key, subs);
    // 找不到鍵時 chrome 回空字串。回傳鍵名比回傳空白好除錯。
    return msg || key;
  }
  if (import.meta.env.DEV) {
    const entry = devBundle()[key];
    if (!entry) return key;
    if (!subs) return entry.message;
    const list = Array.isArray(subs) ? subs : [subs];
    return entry.message.replace(/\$(\d)\$?/g, (_, n) => list[Number(n) - 1] ?? "");
  }
  return key;
}

/** 目前語系。決定外環走節氣還是月名、溫度預設攝氏還是華氏。 */
export function locale(): string {
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
