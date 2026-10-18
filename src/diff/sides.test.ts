import { describe, expect, it } from "vitest";
import type { FieldResult } from "../extract/engine.ts";
import { toExportedExtraction } from "../results/export.ts";
import { reviewField } from "../results/review.ts";
import { sideFromExported, sideFromReviewed } from "./sides.ts";

function field(key: string, overrides: Partial<FieldResult>): FieldResult {
  return { key, label: key, type: "text", required: false, found: true, bbox: [], warnings: [], ...overrides };
}

const box = { x0: 10, y0: 20, x1: 30, y1: 40 };
const reviewed = [
  reviewField(field("name", { value: "山田 太郎", rawText: "山田 太郎", page: 1, bbox: [box] }), { confirmed: true }),
  reviewField(field("paymentAmount", { type: "money", value: 5_800_000, page: 1, bbox: [box], source: "ocr" }), undefined),
  reviewField(field("employerName", { found: false }), {
    confirmed: true,
    edit: { value: "株式会社サンプル商事", rawText: "株式会社サンプル商事" },
  }),
  reviewField(field("incomeYear", { found: false }), undefined),
];

describe("比べる片方の書類を作る", () => {
  it("画面の抽出結果から作る。見つからなかった項目は入れない", () => {
    const side = sideFromReviewed(reviewed, true);
    expect(Object.keys(side.values)).toEqual(["name", "paymentAmount", "employerName"]);
    expect(side.values.name).toMatchObject({ confirmed: true, source: "pdf", page: 1, bbox: [box] });
    expect(side.values.paymentAmount).toMatchObject({ confirmed: false, source: "ocr" });
    expect(side.values.employerName).toMatchObject({ value: "株式会社サンプル商事", confirmed: true, source: "manual" });
  });

  it("書き出したJSONから作ると、画面の抽出結果から作ったものと同じ値になる", () => {
    const exported = toExportedExtraction("withholding-slip", "sample.pdf", reviewed, new Date(0));
    const side = sideFromExported(exported);
    const fromScreen = sideFromReviewed(reviewed, true);
    expect(side.readable).toBe(true);
    for (const [key, v] of Object.entries(fromScreen.values)) {
      expect(side.values[key]).toMatchObject({ value: v.value, confirmed: v.confirmed, source: v.source, page: v.page });
    }
    expect(side.values.name?.bbox).toEqual([box]);
  });
});
