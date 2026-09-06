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
    // manifest 寫的是 https://host/*，文件裡寫的是主機名
    const hosts = manifest.optional_host_permissions.map((h) =>
      h.replace(/^https:\/\//, "").replace(/\/\*$/, ""),
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
 * 這種錯只有真的按下上傳才會知道 —— 除非在這裡先擋下來。
 */
describe("套件簡述的長度", () => {
  const LIMIT = 190;
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
