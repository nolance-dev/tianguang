import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * 語系檔的完整性。
 *
 * 起因是一個看得見的錯：英文版的 sc_suffix 是刻意留白的（時辰的「時」字
 * 英文不需要），而 chrome.i18n.getMessage() 對「鍵不存在」和「翻譯留白」
 * 都回空字串，兩者分不出來。t() 原本一律退回鍵名，於是畫面上出現一行
 * sc_suffix。
 *
 * 修法是讓正式版相信留白就是留白、直接回空字串。那個「相信」要有東西撐著,
 * 否則哪天真的漏了一個鍵，使用者看到的是一片空白，比看到鍵名還難查。
 * 這一條就是那個撐著的東西。
 */

const DIR = "public/_locales";
const load = (loc: string) =>
  JSON.parse(readFileSync(`${DIR}/${loc}/messages.json`, "utf8")) as Record<
    string,
    { message: string }
  >;

/** manifest 的 default_locale。任何語系缺鍵都退回這一套 */
const FALLBACK = "zh_TW";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name)
        ? [`${dir}/${e.name}`]
        : [],
  );
}

describe("語系檔", () => {
  it("程式裡每一個寫死的 t() 鍵都在預設語系裡", () => {
    const base = load(FALLBACK);
    const missing: string[] = [];
    for (const f of sourceFiles("src")) {
      const src = readFileSync(f, "utf8");
      // 只掃字面鍵。動態拼出來的（t("sx_name_" + i)）掃不到，由下面那條擋
      /*
       * 引號後面必須緊接著 , 或 ) 才算字面鍵。少了這個條件，
       * t("sx_name_" + i) 會被當成一個叫 sx_name_ 的鍵 —— 那是拼接用的前綴，
       * 不是鍵，掃出來全是假警報。
       */
      for (const m of src.matchAll(/\bt\(\s*"([a-z0-9_]+)"\s*[,)]/g)) {
        const key = m[1]!;
        if (!(key in base)) missing.push(`${f}: ${key}`);
      }
    }
    expect(missing, "這些鍵在畫面上會變成空白").toEqual([]);
  });

  it("每個語系都是預設語系的子集，沒有孤兒鍵", () => {
    const base = load(FALLBACK);
    // 英文的外環走月名不走節氣，所以它多的那組 moon_* 是合法的
    const allowed = new Set(
      Object.keys(base).concat(
        Array.from({ length: 12 }, (_, i) => `moon_${i}`),
      ),
    );
    for (const loc of readdirSync(DIR)) {
      const orphan = Object.keys(load(loc)).filter((k) => !allowed.has(k));
      expect(orphan, `${loc} 有預設語系沒有的鍵，八成是改名之後忘了刪`).toEqual(
        [],
      );
    }
  });

  it("佔位符是 chrome.i18n 收得下的寫法", () => {
    /*
     * 這一條是拿商店退件換來的。
     *
     * chrome.i18n 有兩種佔位符：位置式的 $1，以及具名的 $NAME$ —— 後者
     * 一定要在同一則訊息裡附一份 placeholders。我把 cal_roc_year 寫成
     * 「民國$1$年」，兩頭都有錢字號，於是被當成一個叫 1 的具名佔位符，
     * 卻沒有定義。Edge 在安裝的那一刻就整包判無效：
     *   Package is invalid. Details: 'Variable $1$ used but not defined.'
     *
     * 為什麼一路綠燈到上架：i18n.ts 的 fill() 用 /\$(\d)\$?/ 兩種都吃，
     * 而 fill() 只在「設定裡選了語言」時才走。跟著瀏覽器語言那條路是
     * chrome.i18n 自己解析的 —— 那條路只有真的裝進瀏覽器才會執行到，
     * 單元測試和 vite dev 都碰不到。
     *
     * 所以這裡直接照 chrome 的規則驗檔案本身，不經過任何自己寫的程式。
     */
    const bad: string[] = [];
    for (const loc of readdirSync(DIR)) {
      const pack = JSON.parse(
        readFileSync(`${DIR}/${loc}/messages.json`, "utf8"),
      ) as Record<
        string,
        { message: string; placeholders?: Record<string, unknown> }
      >;
      for (const [key, entry] of Object.entries(pack)) {
        const defined = new Set(
          Object.keys(entry.placeholders ?? {}).map((n) => n.toLowerCase()),
        );
        // $$ 是錢字號的跳脫，先拿掉再掃，免得誤判
        for (const m of entry.message
          .replace(/\$\$/g, "")
          .matchAll(/\$([A-Za-z0-9_]+)\$/g)) {
          if (!defined.has(m[1]!.toLowerCase()))
            bad.push(`${loc}/${key}: $${m[1]}$`);
        }
      }
    }
    expect(bad, "Edge 會在安裝時整包退掉，不是只有這一句壞掉").toEqual([]);
  });

  it("留白的翻譯是刻意的，數量要盯著", () => {
    /*
     * 留白現在會原封不動顯示成空白，所以每一個都必須是故意的。
     * 目前只有一個：英文的 sc_suffix。多出來的要嘛是誤刪，
     * 要嘛是新的刻意留白 —— 兩種都該有人看過再放行。
     */
    const blank: string[] = [];
    for (const loc of readdirSync(DIR)) {
      const b = load(loc);
      for (const k of Object.keys(b))
        if (b[k]!.message === "") blank.push(`${loc}/${k}`);
    }
    expect(blank).toEqual(["en/sc_suffix"]);
  });
});
