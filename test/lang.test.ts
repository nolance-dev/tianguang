import { afterEach, describe, expect, it } from "vitest";
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
