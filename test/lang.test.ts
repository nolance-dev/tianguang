import { afterEach, describe, expect, it, vi } from "vitest";
import { isEnglish, locale, setLang, t } from "../src/lib/i18n";
import { DEFAULTS, migrate } from "../src/lib/settings";

/**
 * 設定裡的語言。
 *
 * chrome.i18n.getMessage() 只給瀏覽器介面語言，沒有參數可以覆寫 ——
 * 所以選了語言之後 t() 必須改讀打包進來的字串包，locale() 也要跟著換，
 * 不然外環（節氣／月名）和溫度單位會停在瀏覽器那一邊。
 */

afterEach(() => setLang("auto"));

describe("語言切換", () => {
  it("選了語言就照那一套出字，不管瀏覽器是什麼", () => {
    setLang("zh_TW");
    expect(t("s_lang")).toBe("語言");
    expect(locale()).toBe("zh-TW");
    expect(isEnglish()).toBe(false);

    setLang("en");
    expect(t("s_lang")).toBe("Language");
    expect(locale()).toBe("en");
    expect(isEnglish()).toBe(true);
  });

  it("刻意留白的翻譯要留白，不是吐出鍵名", () => {
    // 英文不需要時辰的「時」字，那一格本來就是空的
    setLang("en");
    expect(t("sc_suffix")).toBe("");
  });

  it("預設跟著瀏覽器", () => {
    expect(DEFAULTS.lang).toBe("auto");
  });

  it("手改過的備份塞進來的語言要擋掉", () => {
    expect(migrate({ schemaVersion: 1, lang: "klingon" }).lang).toBe("auto");
    expect(migrate({ schemaVersion: 1, lang: "en" }).lang).toBe("en");
  });
});

/**
 * 跟著瀏覽器的時候，語言要問字串包，不要問 getUILanguage()。
 *
 * 這兩個會不一致，而且實際害過使用者：Edge 介面是英文，getUILanguage() 回
 * "en-US"，但 chrome.i18n.getMessage() 挑到的是 zh_TW —— 畫面全中文，
 * 月曆卻抓了英文那份行事曆，整排 Mid-Autumn Festival。快取裡留著現行犯
 * （lang: "en"）。字串包自報語言，畫面上的字和從語言推出來的決定就同源。
 *
 * i18n.ts 在載入時就記住有沒有 chrome.i18n，所以這裡用動態 import 重載模組。
 */
describe("跟著瀏覽器：介面語言與字串包不一致", () => {
  const withChrome = async (uiLang: string, pack: Record<string, string>) => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      i18n: {
        getUILanguage: () => uiLang,
        getMessage: (k: string) => pack[k] ?? "",
      },
    };
    vi.resetModules();
    return (await import("../src/lib/i18n")) as typeof import("../src/lib/i18n");
  };

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    vi.resetModules();
  });

  it("字串包說中文就是中文，即使瀏覽器介面是英文", async () => {
    const m = await withChrome("en-US", { locale_tag: "zh-TW" });
    expect(m.locale()).toBe("zh-TW");
    expect(m.isEnglish()).toBe(false);
    // 日期也要跟著，不然畫面中文、日期 Thursday, 9/3/2026
    expect(m.intlLocale()).toBe("zh-TW");
  });

  it("反過來也一樣", async () => {
    const m = await withChrome("zh-TW", { locale_tag: "en" });
    expect(m.isEnglish()).toBe(true);
    expect(m.intlLocale()).toBe("en-GB");
  });

  it("舊版沒有 locale_tag 就退回瀏覽器的答案，不是空字串", async () => {
    const m = await withChrome("en-US", {});
    expect(m.locale()).toBe("en-US");
    expect(m.intlLocale()).toBeUndefined();
  });
});
