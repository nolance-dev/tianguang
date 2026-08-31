// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "preact";
import { App } from "../src/ui/App";
import { DEFAULTS, migrate, SCHEMA_VERSION } from "../src/lib/settings";
import { isEnglish } from "../src/lib/i18n";
import { jieqiIndex } from "../src/lib/solar";
import zhTW from "../public/_locales/zh_TW/messages.json";

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
