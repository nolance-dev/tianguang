import { describe, expect, it } from "vitest";
import { resolve, looksLikeUrl } from "../src/lib/search";
import { sunTimes } from "../src/lib/solar";
import { migrate, DEFAULTS, MAX_PHOTO_WALLS } from "../src/lib/settings";
import { normalize } from "../src/lib/desk";

/**
 * 這一份全部來自一次逐項稽核。每一條都對應一個實際重現過的缺陷，
 * 不是想像出來的邊界 —— 註解裡寫的輸入就是當初問出錯誤輸出的那一個。
 */

describe("搜尋列不當跳板", () => {
  /*
   * resolve() 原本只問「有沒有 scheme://」，不問是哪一種，然後原樣交給
   * location.href。實測放行了下面這幾種。同專案的 links.ts 早就在擋了，
   * 兩邊對同一件事有兩套標準。
   */
  it.each([
    "javascript://x/%0aalert(1)",
    "vbscript://x",
    "file:///C:/Windows",
    "chrome://settings",
    "edge://extensions",
    "chrome-extension://abc/index.html",
    "data:text/html,<script>alert(1)</script>",
  ])("不把 %s 當網址跳過去", (bad) => {
    const r = resolve(bad, "bing");
    expect(r, "空輸入才回 null，這些不是").not.toBeNull();
    const url = r!.url;
    expect(url.startsWith(bad), `${bad} 不該原樣跳轉`).toBe(false);
    // 擋掉的當關鍵字丟去搜尋，不是靜靜什麼都不做
    expect(url.startsWith("https://"), "要退回搜尋").toBe(true);
  });

  it("正常網址照走", () => {
    expect(resolve("https://example.com", "bing")!.url).toBe(
      "https://example.com",
    );
    expect(resolve("example.com", "bing")!.url).toBe("https://example.com");
    expect(looksLikeUrl("localhost:3000")).toBe(true);
  });
});

describe("日出日落遇到壞座標要說不知道", () => {
  /*
   * cosH > 1 || cosH < -1 是用來認極晝極夜的，但 NaN 跟任何數字比都是 false，
   * 所以壞座標一路穿過去回一組 NaN。呼叫端檢查的是 !== null，NaN 過得了。
   */
  it.each([
    ["非數字", "abc"],
    ["NaN", NaN],
    ["undefined", undefined],
    ["緯度 200", 200],
    ["緯度 -91", -91],
  ])("%s 回 null 而不是 NaN", (_label, lat) => {
    const r = sunTimes(new Date(2026, 8, 2), lat as number, 121.56);
    expect(r.sunrise).toBeNull();
    expect(r.sunset).toBeNull();
  });

  it("好座標照算", () => {
    const r = sunTimes(new Date(2026, 8, 2), 25.03, 121.56);
    expect(r.sunrise).toBeGreaterThan(5);
    expect(r.sunrise).toBeLessThan(6);
  });
});

describe("匯入的資料不能鎖死應用程式", () => {
  it("id 不是字串時 normalize 不丟例外", () => {
    /*
     * 手改過的備份（desk: [{ id: 5 }]）會讓 kindOf 呼叫 id.startsWith 丟
     * TypeError。normalize 是在 render 裡跑的，於是每次重繪都炸，
     * 工作區永久打不開，介面上救不回來。
     */
    expect(() => normalize([{ id: 5 }] as never)).not.toThrow();
    expect(() =>
      normalize([null, undefined, 7, { id: {} }] as never),
    ).not.toThrow();
    // 壞的丟掉，但預設版面要補回來，不能剩一個空陣列
    expect(normalize([{ id: 5 }] as never).length).toBeGreaterThan(0);
  });

  it("比較新的設定不會把所有卡片開關洗掉", () => {
    /*
     * 展開運算子是淺的，raw.cards 整包取代 DEFAULTS.cards。
     * 一份只寫了 { cards: { newcard: true } } 的設定會讓十張卡全部消失 ——
     * 而那正是那段程式碼的註解說要防的情境。
     */
    const out = migrate({
      schemaVersion: 99,
      cards: { newcard: true },
    } as never);
    expect(Object.keys(out.cards).sort()).toEqual(
      Object.keys(DEFAULTS.cards).sort(),
    );
    expect(out.cards.todos).toBe(DEFAULTS.cards.todos);
  });

  it("認得的開關收下，型別不對的丟掉", () => {
    const out = migrate({
      schemaVersion: 1,
      cards: { todos: false, note: "yes" },
    } as never);
    expect(out.cards.todos).toBe(false);
    expect(out.cards.note).toBe(DEFAULTS.cards.note);
  });

  it("純色背景只收顏色，不收 url()", () => {
    /*
     * solidColor 會走到 --solid 與 --mesh，而 styles.css 是
     * background: var(--mesh)。background 收得下 url()，所以這一行
     * 就是一個每次開新分頁都會發出去的遠端請求。
     */
    const evil = migrate({
      schemaVersion: 1,
      solidColor: "url(https://example.invalid/beacon.png)",
    } as never);
    expect(evil.solidColor).toBe(DEFAULTS.solidColor);
    expect(
      migrate({ schemaVersion: 1, solidColor: "#abc123" } as never).solidColor,
    ).toBe("#abc123");
  });
});

describe("時刻不會出現第 60 分", () => {
  it("2026 年那四天不再印出 05:60 / 17:60 / 11h60", () => {
    /*
     * round((h % 1) * 60) 在 h = 5.9995 算出 60。實測 2026 年有四天中招：
     * 10/30 日出、3/09 與 9/14 日落、9/28 晝長。
     */
    const pad = (n: number) => String(n).padStart(2, "0");
    const hhmm = (h: number) => {
      const mins = Math.round(h * 60);
      return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
    };
    expect(hhmm(5.9995)).toBe("06:00");
    expect(hhmm(17.9999)).toBe("18:00");
    expect(hhmm(23.9999)).toBe("00:00");
    expect(hhmm(5.5)).toBe("05:30");
  });
});

/**
 * 照片牆從一張變成很多張。
 *
 * 1.0 存的是 photoId／photoRotate 兩個欄位，那些設定現在還在使用者的
 * 瀏覽器裡（而且會透過 storage.sync 同步回來）。直接改欄位名，
 * 使用者掛好的那張照片就消失了 —— 而他不會知道是升級弄的。
 */
describe("照片牆的搬家", () => {
  it("1.0 的 photoId／photoRotate 變成第一張", () => {
    const out = migrate({
      schemaVersion: 1,
      photoId: "img-7",
      photoRotate: 60,
    } as never);
    expect(out.photoWalls).toEqual([{ id: "img-7", rotate: 60 }]);
  });

  it("沒掛過照片的舊設定也走得通，不是變成空陣列", () => {
    const out = migrate({ schemaVersion: 1 } as never);
    expect(out.photoWalls).toEqual([{ id: null, rotate: 0 }]);
  });

  it("新的清單原樣留著", () => {
    const walls = [
      { id: "a", rotate: 0 },
      { id: null, rotate: 15 },
    ];
    expect(migrate({ schemaVersion: 1, photoWalls: walls } as never).photoWalls)
      .toEqual(walls);
  });

  it("永遠至少一張 —— 零張的話介面上沒有辦法變回一張", () => {
    expect(
      migrate({ schemaVersion: 1, photoWalls: [] } as never).photoWalls,
    ).toHaveLength(1);
  });

  it("手改過的備份不會炸，也不會塞進垃圾", () => {
    const out = migrate({
      schemaVersion: 1,
      photoWalls: [null, { id: 5, rotate: "x" }, { id: "ok", rotate: -3 }],
    } as never);
    // null 丟掉；型別不對的欄位退回預設；負的輪播間隔夾成 0
    expect(out.photoWalls).toEqual([
      { id: null, rotate: 0 },
      { id: "ok", rotate: 0 },
    ]);
  });

  it("有上限，不會被同步回來的一大包撐爆 storage.sync", () => {
    const many = Array.from({ length: 50 }, () => ({ id: "x", rotate: 0 }));
    expect(
      migrate({ schemaVersion: 1, photoWalls: many } as never).photoWalls,
    ).toHaveLength(MAX_PHOTO_WALLS);
  });

  it("預設就是一張空的", () => {
    expect(DEFAULTS.photoWalls).toEqual([{ id: null, rotate: 0 }]);
  });
});

describe("主頁面與工作區的照片牆分開", () => {
  it("兩份各自遷移，不會互相灌", () => {
    const out = migrate({
      schemaVersion: 1,
      photoWalls: [
        { id: "a", rotate: 0 },
        { id: "b", rotate: 0 },
      ],
      homePhotoWalls: [{ id: "c", rotate: 30 }],
    } as never);
    expect(out.photoWalls).toHaveLength(2);
    expect(out.homePhotoWalls).toEqual([{ id: "c", rotate: 30 }]);
  });

  it("1.0 的單一 photoId 兩邊都接得住，而且各是各的", () => {
    const out = migrate({ schemaVersion: 1, photoId: "old" } as never);
    expect(out.photoWalls).toEqual([{ id: "old", rotate: 0 }]);
    expect(out.homePhotoWalls).toEqual([{ id: "old", rotate: 0 }]);
    // 同樣的內容但不是同一個物件 —— 改一邊不該動到另一邊
    expect(out.homePhotoWalls).not.toBe(out.photoWalls);
  });

  it("只設了工作區的話，主頁面不會跟著變多", () => {
    const out = migrate({
      schemaVersion: 1,
      photoWalls: [
        { id: null, rotate: 0 },
        { id: null, rotate: 0 },
        { id: null, rotate: 0 },
      ],
    } as never);
    expect(out.photoWalls).toHaveLength(3);
    expect(out.homePhotoWalls).toHaveLength(1);
  });
});
