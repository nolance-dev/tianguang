import { describe, expect, it } from "vitest";
import { rank, score, type Item } from "../src/lib/palette";

const item = (title: string, sub?: string): Item => ({
  id: title,
  source: "bookmarks",
  title,
  sub,
});

describe("比對權重", () => {
  it("開頭命中最高", () => {
    expect(score("GitHub", "git")).toBeGreaterThan(
      score("Awesome GitHub", "git"),
    );
  });

  it("詞首命中高於夾在字中間", () => {
    // "Awesome Git" 的 git 接在空白後，是詞首；"Legitimate" 的 git 夾在中間
    expect(score("Awesome Git", "git")).toBeGreaterThan(
      score("Legitimate", "git"),
    );
  });

  it("完全不match 回 -1", () => {
    expect(score("GitHub", "zzz")).toBe(-1);
    expect(score("GitHub", "hg")).toBe(-1);
  });

  it("子序列也要找得到 —— 打 gh 要找到 GitHub", () => {
    expect(score("GitHub", "gh")).toBeGreaterThan(0);
    expect(score("GitHub", "gthb")).toBeGreaterThan(0);
  });

  it("大小寫不影響", () => {
    expect(score("GitHub", "GITHUB")).toBe(score("github", "github"));
  });

  it("空查詢一律 0，讓呼叫端自己決定要不要全列", () => {
    expect(score("任何東西", "")).toBe(0);
  });

  it("同樣命中時，短的排前面 —— 標題越短越可能是使用者要的", () => {
    expect(score("Git", "git")).toBeGreaterThan(
      score("Git Extensions Manual", "git"),
    );
  });
});

describe("排序", () => {
  const items = [
    item("Legitimate Business", "example.com"),
    item("GitHub", "github.com"),
    item("Awesome Git Tools", "awesome.dev"),
    item("Figma", "figma.com"),
  ];

  it("空查詢原樣回傳，不做排序", () => {
    expect(rank(items, "").map((i) => i.title)).toEqual(
      items.map((i) => i.title),
    );
  });

  it("開頭命中的排最前", () => {
    expect(rank(items, "git")[0]!.title).toBe("GitHub");
  });

  it("不match 的不出現", () => {
    const out = rank(items, "git").map((i) => i.title);
    expect(out).not.toContain("Figma");
  });

  it("副標也能命中，但權重低於標題", () => {
    const out = rank(items, "figma.com");
    expect(out[0]!.title).toBe("Figma");

    // 只有副標對得上時仍然找得到
    const only = rank([item("無關標題", "github.com")], "github");
    expect(only).toHaveLength(1);
  });

  it("限制筆數", () => {
    const many = Array.from({ length: 200 }, (_, i) => item(`Item ${i}`));
    expect(rank(many, "item", 10)).toHaveLength(10);
  });
});
