import { describe, expect, it } from "vitest";
import type { FieldDefinition } from "../schema/fields.ts";
import { compareValues } from "./compare.ts";

const fields: FieldDefinition[] = [
  { key: "name", label: "氏名", type: "text", required: true },
  { key: "birthDate", label: "生年月日", type: "date", required: true },
  { key: "income", label: "年収", type: "money", required: true },
  { key: "applicant.name", label: "申込者の氏名", type: "text", required: false },
  {
    key: "debts",
    label: "既存借入",
    type: "list",
    required: false,
    items: [
      { key: "lender", label: "借入先", type: "text", required: true },
      { key: "balance", label: "残高", type: "money", required: true },
    ],
  },
];

const statuses = (results: ReturnType<typeof compareValues>) => Object.fromEntries(results.map((r) => [r.key, r.status]));

describe("抽出結果と正解データの突き合わせ", () => {
  it("項目ごとに、一致・違う・抽出できなかったを判定する", () => {
    const results = compareValues(
      fields,
      { name: "山田 太郎", birthDate: "1988-04-15", income: 5_800_000 },
      { name: "山田太郎", income: 5_000_000 },
    );
    expect(statuses(results)).toEqual({ name: "match", birthDate: "missing", income: "mismatch" });
  });

  it("文字列は、空白・全角半角・康熙部首の違いを無視して比べる", () => {
    const results = compareValues(fields, { name: "株式会社サンプル" }, { name: "株式会社 サンプル" });
    expect(statuses(results)).toEqual({ name: "match" });
    expect(statuses(compareValues(fields, { name: "見本" }, { name: "⾒本" }))).toEqual({ name: "match" });
  });

  it("入れ子の項目と、一覧(list)の項目を1つずつ比べる", () => {
    const results = compareValues(
      fields,
      { applicant: { name: "田中" }, debts: [{ lender: "見本ファイナンス", balance: 1_200_000 }] },
      {
        applicant: { name: "田中" },
        debts: [
          { lender: "見本ファイナンス", balance: 1_000_000 },
          { lender: "別の会社", balance: 1 },
        ],
      },
    );
    expect(statuses(results)).toEqual({
      "applicant.name": "match",
      "debts[0].lender": "match",
      "debts[0].balance": "mismatch",
      "debts[1].lender": "unexpected",
      "debts[1].balance": "unexpected",
    });
  });

  it("定義にない項目を抽出したら unexpected", () => {
    expect(statuses(compareValues(fields, {}, { phone: "000-0000-0000" }))).toEqual({ phone: "unexpected" });
  });
});
