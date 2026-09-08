import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * manifest 宣告的每一條權限，文件裡都要有理由。
 *
 * 送審會逐條問。漏掉一條就是一趟來回，而漏掉最容易發生在「後來又加了一個
 * 網域」的時候 —— 程式改了、測試綠了、文件沒動，沒有任何東西會提醒你。
 */

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
  permissions: string[];
  optional_permissions: string[];
  optional_host_permissions: string[];
  version: string;
  homepage_url: string;
};
const store = readFileSync("docs/STORE.md", "utf8");
const privacy = readFileSync("docs/PRIVACY.md", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

describe("上架前的一致性", () => {
  it("每一條權限在上架文件裡都有說明", () => {
    const all = [...manifest.permissions, ...manifest.optional_permissions];
    const missing = all.filter((p) => !store.includes(`\`${p}\``));
    expect(missing, "docs/STORE.md 沒有交代這幾條").toEqual([]);
  });

  it("每一個網域在上架文件和隱私頁裡都有說明", () => {
    /*
     * manifest 寫的是比對樣式（https://host/*、*://*.host/*），
     * 文件裡寫的是人看的主機名。把樣式那一層剝掉再比 ——
     * 要求文件照抄 "*://*.youtube.com" 只會逼出一份沒人想讀的文件。
     */
    const hosts = manifest.optional_host_permissions.map((h) =>
      h
        .replace(/^(?:https?|\*):\/\//, "")
        .replace(/^\*\./, "")
        .replace(/\/\*$/, ""),
    );
    expect(
      hosts.filter((h) => !store.includes(h)),
      "STORE.md 少了",
    ).toEqual([]);
    expect(
      hosts.filter((h) => !privacy.includes(h)),
      "PRIVACY.md 少了",
    ).toEqual([]);
  });

  it("版本號只有一個來源", () => {
    // 建置時會把 package.json 的版本蓋進 dist/manifest.json，
    // 但原始檔也該一致，不然讀原始碼的人會看到兩個數字
    expect(manifest.version).toBe(pkg.version);
  });

  it("官方網站填了，而且跟文件裡的是同一個", () => {
    expect(manifest.homepage_url).toMatch(/^https:\/\//);
    expect(store).toContain(manifest.homepage_url);
  });

  it("認證注意事項塞得進 Partner Center 的格子", () => {
    /*
     * Partner Center 每次提交都要求認證注意事項，而且上限 2000 字元。
     * 那一格是最後一關，超過的當下已經填完前面所有東西了 ——
     * 而且新增權限一定要往這份文件加字，所以它只會越長越長。
     *
     * 換行有可能被算成兩個字元（CRLF），所以連最壞的情況一起擋。
     */
    const notes = readFileSync("docs/cert-notes.txt", "utf8").trimEnd();
    // 用 split 數換行，不用正規式 —— 這一行經過太多層跳脫了
    const worst =
      notes.length + notes.split(String.fromCharCode(10)).length - 1;
    expect(worst, `現在 ${notes.length} 字元，換行 CRLF 的話 ${worst}`).toBeLessThan(2000);
    // 空的也不行：沒寫會被標記或退件
    expect(notes.length).toBeGreaterThan(400);
  });

  it("送審清單裡沒有沒填的格子", () => {
    expect(store).not.toContain("⚠");
  });
});

/**
 * 商店對 manifest 裡的簡述有硬上限。
 *
 * Edge 的 Partner Center 在上傳當下就擋：「地區設定 en 中的欄位 Description
 * 翻譯太長…超過 190 個字元的大小上限」。那不是商店陳列的說明，是套件自己的
 * description，而且每個語系各自算。英文版原本 271 字元，整包被退回。
 *
 * 門檻取兩家的嚴格交集，不是 Edge 的 190。
 *
 * 一開始寫 190 是照著退件訊息校準的 —— 那只擋得住 Edge。Chrome 的 manifest
 * description 成文上限是 132，而英文版當時是 185：Edge 收、Chrome 不收，
 * 本機全綠，按下上傳才會知道。護欄照著單一商店校準，等於另一家沒有護欄。
 *
 * 這種錯只有真的按下上傳才會知道 —— 除非在這裡先擋下來。
 */
describe("套件簡述的長度", () => {
  const LIMIT = 132; // Chrome 的成文上限；Edge 是 190，取嚴的那個
  for (const loc of ["zh_TW", "en"]) {
    it(`${loc} 的 description 不超過 ${LIMIT} 字元`, () => {
      const bundle = JSON.parse(
        readFileSync(`public/_locales/${loc}/messages.json`, "utf8"),
      ) as Record<string, { message: string }>;
      const text = bundle.extensionDescription?.message ?? "";
      expect(text.length, `${loc} 現在是 ${text.length} 字元`).toBeLessThanOrEqual(LIMIT);
      expect(text.length, "空的也不行").toBeGreaterThan(0);
    });
  }
});
