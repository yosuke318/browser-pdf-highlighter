import { describe, expect, it } from "vitest";
import type { FieldDefinition } from "../schema/fields.ts";
import type { TextSegment } from "../text/types.ts";
import { findExpectedValues } from "./find-values.ts";

/** 1行に並んだセル。y は行の高さ(上ほど大きい) */
function row(y: number, ...cells: string[]): TextSegment[] {
  return cells.map((text, i) => ({
    text,
    bbox: { x0: i * 100, y0: y, x1: i * 100 + 80, y1: y + 10 },
    charBoxes: [],
    confidence: 1,
    source: "pdf" as const,
  }));
}

const field = (key: string, type: FieldDefinition["type"]): FieldDefinition => ({ key, label: key, type, required: true });

describe("正解データの値を、取り出した文字の中から探す", () => {
  const segments = [
    ...row(700, "令和 7 年分", "源泉徴収票"),
    ...row(680, "氏名", "山田　太郎"),
    ...row(660, "支払金額", "５，８００，０００", "420万円"),
    ...row(640, "生年月日", "昭和", "63年", "4月", "15日"),
    ...row(620, "生年月日", "昭和58.07.07"),
    ...row(600, "年齢", "3", "8", "歳"),
  ];

  it.each<[string, FieldDefinition["type"], unknown, string]>([
    ["空白・全角の違いを無視して文字列を探す", "text", "山田 太郎", "found"],
    ["全角の金額", "money", 5_800_000, "found"],
    ["万円の金額", "money", 4_200_000, "found"],
    ["ない金額", "money", 1_000, "not-found"],
    ["セルに分かれた和暦の日付", "date", "1988-04-15", "found"],
    ["点で区切った和暦の日付", "date", "1983-07-07", "found"],
    ["年分の年", "year", 2025, "found"],
    ["1文字ずつセルに分かれた、単位付きの数", "number", 38, "found"],
    ["真偽値は調べない", "boolean", true, "not-checked"],
  ])("%s", (_, type, value, expected) => {
    const result = findExpectedValues([field("x", type)], new Map([["x", value]]), segments);
    expect(result.x).toBe(expected);
  });

  it("一覧(list)の項目は、1行ずつ調べる", () => {
    const debts: FieldDefinition = {
      key: "debts",
      label: "既存借入",
      type: "list",
      required: false,
      items: [field("balance", "money")],
    };
    const result = findExpectedValues([debts], new Map([["debts", [{ balance: 5_800_000 }, { balance: 1 }]]]), segments);
    expect(result).toEqual({ "debts[0].balance": "found", "debts[1].balance": "not-found" });
  });
});
