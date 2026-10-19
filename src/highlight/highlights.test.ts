import { describe, expect, it } from "vitest";
import type { FieldDiff, SideValue } from "../diff/compare-fields.ts";
import type { ExtractionResult, FieldResult } from "../extract/engine.ts";
import { EXTRACTION_SCHEMA } from "../schema/fields.ts";
import { categoryOf, hasCategory } from "./categories.ts";
import { highlightsFromDiffs, highlightsFromExtraction, markerDirection } from "./highlights.ts";

describe("ハイライトの色分け", () => {
  it("抽出項目の定義にあるすべての項目に、種類が決まっている", () => {
    const missing = EXTRACTION_SCHEMA.documents.flatMap((d) =>
      d.fields.filter((f) => !hasCategory(f.key)).map((f) => `${d.id}.${f.key}`),
    );
    expect(missing, "src/highlight/categories.ts の CATEGORY_BY_KEY に種類を足してください").toEqual([]);
  });

  it.each([
    ["name", "name"],
    ["applicant.name", "name"],
    ["guarantor.birthDate", "birth"],
    ["paymentAmount", "money"],
    ["employerAddress", "address"],
    ["rent", "property"],
    ["incomeYear", "other"],
    ["unknownKey", "other"],
  ])("%s → %s", (key, category) => {
    expect(categoryOf(key)).toBe(category);
  });
});

function field(key: string, overrides: Partial<FieldResult>): FieldResult {
  return { key, label: key, type: "text", required: false, found: true, bbox: [], warnings: [], ...overrides };
}

describe("抽出結果からハイライトを作る", () => {
  const box = { x0: 10, y0: 20, x1: 30, y1: 40 };
  const result: ExtractionResult = {
    documentId: "withholding-slip",
    fields: [
      field("name", { label: "氏名", value: "山田 太郎", rawText: "⼭⽥ 太郎", page: 1, bbox: [box], confidence: 1 }),
      field("paymentAmount", {
        label: "支払金額",
        type: "money",
        value: 5_800_000,
        rawText: "5,800,000",
        page: 1,
        bbox: [box, box],
        confidence: 0.6,
      }),
      field("birthDate", { page: 2, bbox: [box] }),
      field("address", { found: false }),
    ],
  };

  it("指定したページで見つかった項目だけを、種類と説明を付けて返す", () => {
    const highlights = highlightsFromExtraction(result, 1);
    expect(highlights.map((h) => h.id)).toEqual(["name", "paymentAmount"]);
    expect(highlights[0]).toMatchObject({
      kind: { type: "field", category: "name" },
      label: "氏名: 山田 太郎",
      lowConfidence: false,
      rects: [box],
    });
  });

  it("1桁ずつのマス目に書かれた金額も、読みやすい形で説明に出す", () => {
    const digits: ExtractionResult = {
      documentId: "tax-return",
      fields: [
        field("businessRevenue", {
          label: "事業収入",
          type: "money",
          value: 9_600_000,
          rawText: "9 6 0 0 0 0 0",
          page: 1,
          bbox: [box],
        }),
      ],
    };
    expect(highlightsFromExtraction(digits, 1)[0]?.label).toBe("事業収入: 9,600,000円");
  });

  it("ほかの項目から計算した値は、計算した値ともとの項目を説明に出す", () => {
    const derived: ExtractionResult = {
      documentId: "resident-tax-notice",
      fields: [
        field("fiscalYear", { label: "年度", type: "year", value: 2026, rawText: "令和8年", page: 1, bbox: [box] }),
        field("incomeYear", {
          label: "対象年",
          type: "year",
          value: 2025,
          rawText: "令和8年",
          page: 1,
          bbox: [box],
          derivedFrom: "fiscalYear",
        }),
      ],
    };
    expect(highlightsFromExtraction(derived, 1)[1]?.label).toBe("対象年: 2025(年度から計算)");
  });

  it("確からしさが低い値は、要確認にする。金額は値から「5,800,000円」の形で説明に出す", () => {
    expect(highlightsFromExtraction(result, 1)[1]).toMatchObject({ lowConfidence: true, label: "支払金額: 5,800,000円" });
  });
});

describe("差分からハイライトを作る", () => {
  const box = { x0: 10, y0: 20, x1: 30, y1: 40 };
  const value = (v: unknown, extra: Partial<SideValue> = {}): SideValue => ({
    value: v,
    confirmed: false,
    source: "pdf",
    page: 1,
    bbox: [box],
    ...extra,
  });
  const diff = (key: string, status: FieldDiff["status"], extra: Partial<FieldDiff>): FieldDiff => ({
    key,
    label: key,
    type: "text",
    status,
    notes: [],
    needsCheck: false,
    priority: "normal",
    ...extra,
  });
  const diffs = [
    diff("paymentAmount", "changed", {
      label: "支払金額",
      type: "money",
      previous: value(5_500_000),
      current: value(5_800_000),
      needsCheck: true,
    }),
    diff("name", "same", { previous: value("山田 太郎"), current: value("山田 太郎") }),
    diff("withholdingTax", "added", { label: "源泉徴収税額", type: "money", current: value(166_900) }),
    diff("startDate", "removed", { previous: value("2024-04-01") }),
    diff("employerName", "notation", { current: value("株式会社サンプル商事", { page: 2 }) }),
  ];

  it("一致以外で、今回の資料の指定したページにある項目だけを、判定と前回→今回の説明を付けて返す", () => {
    const highlights = highlightsFromDiffs("g1", diffs, 1);
    expect(highlights.map((h) => h.id)).toEqual(["g1:paymentAmount", "g1:withholdingTax"]);
    expect(highlights[0]).toMatchObject({
      kind: { type: "diff", status: "changed" },
      label: "支払金額: 5,500,000 円 → 5,800,000 円",
      lowConfidence: true,
      rects: [box],
    });
    expect(highlights[1]?.label).toBe("源泉徴収税額: (なし) → 166,900 円");
  });
});

describe("蛍光ペンを引く向き", () => {
  it.each([
    [0, "to-bottom"],
    [90, "to-left"],
    [180, "to-top"],
    [270, "to-right"],
    [-90, "to-right"],
    [450, "to-left"],
  ] as const)("ページの回転 %i 度 → %s", (rotation, direction) => {
    expect(markerDirection(rotation)).toBe(direction);
  });
});
