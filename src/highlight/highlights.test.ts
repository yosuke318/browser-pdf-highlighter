import { describe, expect, it } from "vitest";
import type { ExtractionResult, FieldResult } from "../extract/engine.ts";
import { EXTRACTION_SCHEMA } from "../schema/fields.ts";
import { categoryOf, hasCategory } from "./categories.ts";
import { highlightsFromExtraction, markerDirection } from "./highlights.ts";

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
