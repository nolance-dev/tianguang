// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { App } from "../src/ui/App";
import { DEFAULTS, migrate, SCHEMA_VERSION } from "../src/lib/settings";
import { isEnglish } from "../src/lib/i18n";
import { jieqiIndex } from "../src/lib/solar";
import zhTW from "../public/_locales/zh_TW/messages.json";
import { ENGINES } from "../src/lib/search";
import { paletteForColor } from "../src/lib/mesh";

/**
 * 冒煙測試。不驗長相 —— 那要載進 Edge 用眼睛看。
 * 這裡只確認「掛得起來、不丟例外、該有的東西在」，
 * 免得打包成功但一開新分頁是白畫面。
 *
 * Date 與 setInterval 換成假的（才控制得了時間），但 rAF 與微任務留真的，
 * 因為 Preact 的 effect 靠它們排程 —— 一起假掉就永遠等不到重繪。
 */

let host: HTMLElement | null = null;

afterEach(() => {
  if (host) {
    render(null, host);
    host.remove();
    host = null;
  }
  document.documentElement.removeAttribute("style");
  vi.useRealTimers();
});

function mount(at: Date) {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(at);
  host = document.createElement("div");
  document.body.append(host);
  render(<App />, host);
  return host;
}

const cssVar = (name: string) => document.documentElement.style.getPropertyValue(name);

describe("新分頁掛載", () => {
  it("深夜也掛得起來，時鐘、問候、搜尋列都在", async () => {
    const el = mount(new Date(2026, 7, 30, 23, 41, 0));
    await vi.waitFor(() => expect(el.querySelector(".clock")?.textContent).toContain("23:41"));
    expect(el.querySelector(".greet")?.textContent).toBeTruthy();
    expect(el.querySelector("input[type=text]")).not.toBeNull();
    expect(el.querySelector(".mesh")).not.toBeNull();
  });

  it("正午的前景翻成暗字，不會白底白字", async () => {
    mount(new Date(2026, 7, 30, 12, 0, 0));
    await vi.waitFor(() => expect(cssVar("--fg")).toBe("#1B2230"));
  });

  it("午夜的前景是亮字", async () => {
    mount(new Date(2026, 7, 30, 0, 30, 0));
    await vi.waitFor(() => expect(cssVar("--fg")).toBe("#F4F2EE"));
  });

  it("背景漸層有寫進 :root", async () => {
    mount(new Date(2026, 7, 30, 18, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toContain("linear-gradient"));
  });

  it("日期列帶著外環的名字，不會露出鍵名", async () => {
    const el = mount(new Date(2026, 7, 30, 9, 0, 0));
    // jsdom 的 navigator.language 是 en-US，所以走的是 Aubade 那一套。
    // 真正要驗的是「有拿到字」而不是「露出 moon_7」。
    const expected = isEnglish() ? "Sturgeon Moon" : "處暑";
    await vi.waitFor(() => expect(el.querySelector(".datel")?.textContent).toContain(expected));
    expect(el.querySelector(".datel")?.textContent).not.toMatch(/(jq|moon)_\d/);
  });

  it("時鐘一秒跳一次", async () => {
    const el = mount(new Date(2026, 7, 30, 9, 0, 59));
    // 先等 effect 真的跑過 —— setInterval 是在 effect 裡註冊的，
    // 太早撥時鐘等於撥一個還不存在的計時器。--mesh 有值就代表 commit 完成了。
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    expect(el.querySelector(".clock")?.textContent).toContain("09:00");
    await vi.advanceTimersByTimeAsync(1500);
    await vi.waitFor(() => expect(el.querySelector(".clock")?.textContent).toContain("09:01"));
  });
});

describe("節氣接到字串包", () => {
  it("8/30 落在處暑，而且 zh_TW 有這個鍵", () => {
    const idx = jieqiIndex(new Date("2026-08-30T09:00:00+08:00"));
    expect(idx).toBe(10);
    expect(zhTW[`jq_${idx}` as keyof typeof zhTW].message).toBe("處暑");
  });

  it("二十四個節氣鍵一個都不缺", () => {
    for (let i = 0; i < 24; i++) {
      expect(zhTW[`jq_${i}` as keyof typeof zhTW], `jq_${i}`).toBeTruthy();
    }
  });
});

describe("設定遷移", () => {
  it("沒有版本號的舊資料補上預設值", () => {
    const out = migrate({ name: "家宏" });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.name).toBe("家宏");
    expect(out.clock24).toBe(DEFAULTS.clock24);
  });

  it("比較新的設定原樣留著，版本號不往下改", () => {
    // 另一台電腦裝了新版才會出現這種資料。降級會把不認識的欄位吃掉。
    const out = migrate({ schemaVersion: 99, name: "家宏", futureThing: 1 });
    expect(out.schemaVersion).toBe(99);
    expect((out as unknown as Record<string, unknown>).futureThing).toBe(1);
  });

  it("壞掉的版本號當成沒有版本號處理", () => {
    expect(migrate({ schemaVersion: "1" }).schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("時辰盤與設定", () => {
  it("點時間會展開時辰盤，六個環都畫出來", async () => {
    const el = mount(new Date(2026, 7, 30, 22, 48, 12));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".clock") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".dial")).not.toBeNull());

    const dial = document.querySelector(".dial")!;
    expect(dial.querySelectorAll(".rn").length, "羅馬分刻逢五十二個").toBe(12);
    expect(dial.querySelectorAll(".ar").length, "其餘四十八個小阿拉伯數字").toBe(48);
    expect(dial.querySelectorAll(".hr").length, "二十四小時").toBe(24);
    expect(dial.querySelectorAll(".bch").length, "十二時辰").toBe(12);
    expect(dial.querySelector(".sunarc"), "日照弧").not.toBeNull();
    expect(dial.querySelector(".sec-hand"), "秒針").not.toBeNull();
    // 當下的時與分各亮一個，不多不少
    expect(dial.querySelectorAll(".hr.on").length).toBe(1);
    expect(dial.querySelectorAll(":is(.rn,.ar).on").length).toBe(1);
    expect(dial.querySelector(".dc-time")?.textContent).toBe("22:48");
  });

  it("Esc 關掉時辰盤", async () => {
    const el = mount(new Date(2026, 7, 30, 10, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".clock") as HTMLButtonElement).click();
    // 等 .in —— 那個 class 是在 effect 裡加的，代表 keydown 監聽器已經掛好了。
    // 只等 DOM 出現的話，Esc 會打在還沒註冊監聽的空檔上。
    await vi.waitFor(() => expect(document.querySelector(".dial.in")).not.toBeNull());
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await vi.waitFor(() => expect(document.querySelector(".dial")).toBeNull());
  });

  it("設定面板列出所有搜尋引擎，選了會存起來", async () => {
    const el = mount(new Date(2026, 7, 30, 10, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());

    const select = document.querySelector(".panel select") as HTMLSelectElement;
    expect(select.options.length).toBe(ENGINES.length);
    expect(select.value).toBe("bing");

    select.value = "google";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect((document.querySelector(".panel select") as HTMLSelectElement).value).toBe("google"),
    );
  });

  it("關於區塊講清楚怎麼換回原生新分頁，並標註天氣來源", async () => {
    const el = mount(new Date(2026, 7, 30, 10, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());

    const about = document.querySelector(".panel .about")!;
    expect(about.textContent).toContain("edge://extensions");
    expect(about.querySelector('a[href="https://open-meteo.com/"]')).not.toBeNull();
    expect(about.textContent).toContain("CC BY 4.0");
  });
});

describe("背景來源", () => {
  it("純色深底要翻成亮字 —— 之前這裡是暗字壓深藍，整頁讀不到", async () => {
    // 深藍 #131C30 的亮度遠低於門檻，不管當下幾點都該給亮字
    expect(paletteForColor("#131C30").fg).toBe("#F4F2EE");
    expect(paletteForColor("#F5F1E8").fg).toBe("#1B2230");
  });

  it("純色背景的前景不再跟著時間跑", async () => {
    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--fg")).toBe("#1B2230")); // 漸層模式，白天暗字
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());

    const solid = Array.from(document.querySelectorAll<HTMLButtonElement>(".seg button")).find(
      (b) => b.textContent === zhTW.s_bg_solid.message || b.textContent === "Solid colour",
    )!;
    solid.click();
    await vi.waitFor(() => expect(cssVar("--fg")).toBe("#F4F2EE"));
  });

  it("背景有三種來源可選", async () => {
    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());
    expect(document.querySelectorAll(".seg button").length).toBe(3);
  });

  it("搜尋引擎下拉只寫引擎名，不塞前綴", async () => {
    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel select")).not.toBeNull());
    for (const opt of Array.from(document.querySelectorAll(".panel select option"))) {
      expect(opt.textContent).not.toMatch(/\+/);
    }
  });

  it("齒輪釘在版面外，不會被中間那一列推著跑", async () => {
    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    const gear = el.querySelector(".gear")!;
    expect(gear.closest(".app"), "齒輪不該在 .app 版面流裡").toBeNull();
  });
});

describe("背景濾鏡", () => {
  it("漸層模式不掛濾鏡 —— 掛了會讓背景層自成合成層，顆粒混不到，整片洗成灰的", async () => {
    mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    expect(cssVar("--bg-filter")).toBe("none");
  });

  it("純色模式也不掛濾鏡", async () => {
    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".seg button"));
    buttons[1]!.click();
    await vi.waitFor(() => expect(cssVar("--fg")).toBe("#F4F2EE"));
    expect(cssVar("--bg-filter")).toBe("none");
  });
});

describe("拖滑桿不該重讀背景圖", () => {
  it("只有換圖才重讀 —— 動別的設定不會重建 blob 網址，畫面才不會閃", async () => {
    // 記下 createObjectURL 被叫了幾次。每多叫一次就是瀏覽器要重新解碼一張圖。
    const spy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const el = mount(new Date(2026, 7, 30, 11, 0, 0));
    await vi.waitFor(() => expect(cssVar("--mesh")).toBeTruthy());
    (el.querySelector(".gear") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector(".panel")).not.toBeNull());

    const before = spy.mock.calls.length;
    // 顆粒滑桿連拖十格，模擬實際拖曳
    const grain = Array.from(document.querySelectorAll<HTMLInputElement>('.panel input[type="range"]'))[0]!;
    for (let i = 0; i < 10; i++) {
      grain.value = String(0.01 * i);
      grain.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await vi.waitFor(() => expect(cssVar("--grain")).toBe("0.09"));

    expect(spy.mock.calls.length - before, "拖滑桿期間不該產生任何新的 blob 網址").toBe(0);
    spy.mockRestore();
  });
});
