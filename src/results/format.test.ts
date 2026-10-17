import { describe, expect, it } from "vitest";
import { editableText, formatValue, originalNotation } from "./format.ts";

describe("一覧に出す値の書き方", () => {
  it.each([
    ["money", 5_800_000, "5,800,000 円"],
    ["year", 2025, "2025年"],
    ["date", "1988-04-15", "1988-04-15"],
    ["boolean", true, "あり"],
    ["text", "山田 太郎", "山田 太郎"],
  ] as const)("%s: %s → %s", (type, value, text) => {
    expect(formatValue(type, value)).toBe(text);
  });

  it("一覧(表)の項目は、1行ずつ書く", () => {
    expect(formatValue("list", [{ lender: "見本ファイナンス", balance: 1_200_000 }])).toBe("見本ファイナンス / 1,200,000");
  });
});

describe("元の表記", () => {
  it("値と見た目が違うときだけ出す", () => {
    expect(originalNotation("date", "1988-04-15", "昭和63年4月15日")).toBe("昭和63年4月15日");
    expect(originalNotation("money", 4_200_000, "420万円")).toBe("420万円");
    expect(originalNotation("money", 5_800_000, "5,800,000")).toBeNull();
    expect(originalNotation("text", "山田 太郎", "山田 太郎")).toBeNull();
  });

  it("文字列以外は、字間の空白と康熙部首を詰めて出す", () => {
    expect(originalNotation("year", 2025, "令 和 7 年")).toBe("令和7年");
    expect(originalNotation("date", "1988-04-15", "昭和 63 年 4 ⽉ 15 ⽇")).toBe("昭和63年4月15日");
  });
});

describe("修正するときの入力欄", () => {
  it("金額は3桁区切り、文字列は値、それ以外は元の表記を最初に入れておく", () => {
    expect(editableText("money", 5_800_000, "5,800,00O")).toBe("5,800,000");
    expect(editableText("text", "山田 太郎", "⼭⽥ 太郎")).toBe("山田 太郎");
    expect(editableText("date", "1988-04-15", "昭和 63 年 4 ⽉ 15 ⽇")).toBe("昭和 63 年 4 月 15 日");
    expect(editableText("money", undefined, undefined)).toBe("");
  });
});
