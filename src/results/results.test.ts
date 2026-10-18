import { describe, expect, it } from "vitest";
import type { FieldResult } from "../extract/engine.ts";
import { groupPagesByDocument } from "./document-groups.ts";
import { exportFileName, ImportError, parseExportedExtraction, toExportedExtraction } from "./export.ts";
import { countReview, reviewFields, reviewReducer, unconfirmedKeys } from "./review.ts";
import { isPagesComplete, PAGE_READ_FAILED } from "./useDocumentResults.ts";

const box = { x0: 100, y0: 600, x1: 160.04, y1: 610 };

function field(key: string, overrides: Partial<FieldResult> = {}): FieldResult {
  return {
    key,
    label: key,
    type: "text",
    required: true,
    found: true,
    value: "値",
    rawText: "値",
    bbox: [box],
    page: 1,
    confidence: 1,
    source: "pdf",
    warnings: [],
    ...overrides,
  };
}

const fields = [
  field("name", { value: "山田 太郎", rawText: "⼭⽥ 太郎" }),
  field("paymentAmount", { type: "money", value: 5_800_000, rawText: "5,800,00O", confidence: 0.6, source: "ocr" }),
  field("birthDate", { type: "date", value: "1988-04-15", rawText: "昭和63年4月15日", warnings: ["要確認"] }),
  field("withholdingTax", {
    type: "money",
    found: false,
    value: undefined,
    rawText: undefined,
    bbox: [],
    page: undefined,
    required: false,
  }),
];

describe("確認・修正の状態", () => {
  it("抽出したままの項目は未確認、確からしさが低い・注意がある項目は要確認、見つからない項目は未検出", () => {
    const reviewed = reviewFields(fields, {});
    expect(reviewed.map((f) => f.status)).toEqual(["unconfirmed", "attention", "attention", "missing"]);
    expect(countReview(reviewed)).toEqual({ total: 4, attention: 2, unconfirmed: 3, missingRequired: 0, missing: 1 });
  });

  it("確認すると確認済みになり、取り消せる", () => {
    let state = reviewReducer({}, { type: "confirm", key: "name" });
    expect(reviewFields(fields, state)[0]?.status).toBe("confirmed");
    state = reviewReducer(state, { type: "unconfirm", key: "name" });
    expect(reviewFields(fields, state)[0]?.status).toBe("unconfirmed");
  });

  it("手で直した値は確認済みになり、もとの値を残す。元に戻せる", () => {
    let state = reviewReducer({}, { type: "edit", key: "paymentAmount", edit: { value: 5_800_000, rawText: "5,800,000" } });
    const edited = reviewFields(fields, state)[1];
    expect(edited).toMatchObject({ status: "edited", value: 5_800_000, rawText: "5,800,000", page: 1, bbox: [box] });
    expect(edited?.original).toEqual({ value: 5_800_000, rawText: "5,800,00O" });
    state = reviewReducer(state, { type: "revert", key: "paymentAmount" });
    expect(reviewFields(fields, state)[1]?.status).toBe("attention");
  });

  it("見つからなかった項目に、PDF上で選んだ範囲の値を手で入れられる", () => {
    const selected = { x0: 400, y0: 500, x1: 450, y1: 510 };
    const state = reviewReducer(
      {},
      { type: "edit", key: "withholdingTax", edit: { value: 166_900, rawText: "166,900", page: 1, bbox: [selected] } },
    );
    expect(reviewFields(fields, state)[3]).toMatchObject({ status: "edited", value: 166_900, page: 1, bbox: [selected] });
    expect(reviewFields(fields, state)[3]?.original).toBeUndefined();
  });

  it("未確認の項目をまとめて確認済みにする(見つからない項目は含めない)", () => {
    const keys = unconfirmedKeys(reviewFields(fields, {}));
    expect(keys).toEqual(["name", "paymentAmount", "birthDate"]);
    const state = reviewReducer({}, { type: "confirm-all", keys });
    expect(countReview(reviewFields(fields, state))).toMatchObject({ unconfirmed: 0, attention: 0, missing: 1 });
  });
});

describe("書類のまとまり", () => {
  it("書類タイプが同じページが続く範囲を、1つの書類にする", () => {
    expect(groupPagesByDocument(["tax-return", "tax-return", "withholding-slip", null, "withholding-slip"])).toEqual([
      { id: "tax-return@1", documentId: "tax-return", pages: [1, 2] },
      { id: "withholding-slip@3", documentId: "withholding-slip", pages: [3] },
      { id: "withholding-slip@5", documentId: "withholding-slip", pages: [5] },
    ]);
  });

  it("読み取り失敗したページも完了扱いになり、未完了の null だけが未完了と判定する", () => {
    expect(isPagesComplete([])).toBe(false);
    expect(isPagesComplete([null, null])).toBe(false);
    expect(isPagesComplete([PAGE_READ_FAILED, null])).toBe(false);
    expect(isPagesComplete([PAGE_READ_FAILED, { pageNumber: 1 } as never])).toBe(true);
  });
});

describe("JSONの書き出しと読み込み", () => {
  const at = new Date("2026-10-18T01:00:00Z");

  it("確認・修正を反映して書き出す。見つからない項目は入れない", () => {
    const state = reviewReducer(reviewReducer({}, { type: "confirm", key: "name" }), {
      type: "edit",
      key: "paymentAmount",
      edit: { value: 5_800_000, rawText: "5,800,000" },
    });
    const exported = toExportedExtraction("withholding-slip", "源泉徴収票_2025.pdf", reviewFields(fields, state), at);
    expect(exported).toMatchObject({
      formatVersion: "0.1.0",
      documentType: "withholding-slip",
      extractedAt: "2026-10-18T01:00:00.000Z",
    });
    expect(Object.keys(exported.fields)).toEqual(["name", "paymentAmount", "birthDate"]);
    expect(exported.fields.name).toEqual({
      value: "山田 太郎",
      rawText: "⼭⽥ 太郎",
      page: 1,
      bbox: [100, 600, 160, 610],
      source: "pdf",
      confidence: 1,
      confirmed: true,
    });
    expect(exported.fields.paymentAmount).toMatchObject({
      value: 5_800_000,
      confirmed: true,
      edited: true,
      originalValue: 5_800_000,
      source: "ocr",
    });
    expect(exported.fields.birthDate?.confirmed).toBe(false);
  });

  it("書き出したものを、そのまま読み込める", () => {
    const exported = toExportedExtraction("withholding-slip", "a.pdf", reviewFields(fields, {}), at);
    expect(parseExportedExtraction(JSON.stringify(exported))).toEqual(JSON.parse(JSON.stringify(exported)));
  });

  it("手で入れた値は、文字の取り方を manual にする", () => {
    const state = reviewReducer({}, { type: "edit", key: "withholdingTax", edit: { value: 166_900, rawText: "166,900" } });
    const exported = toExportedExtraction("withholding-slip", "a.pdf", reviewFields(fields, state), at);
    expect(exported.fields.withholdingTax).toMatchObject({ source: "manual", edited: true, confirmed: true });
  });

  it.each([
    ["JSONでない", "{"],
    [
      "形式の版が違う",
      JSON.stringify({ formatVersion: "9.0.0", documentType: "withholding-slip", fileName: "a", extractedAt: "x", fields: {} }),
    ],
    [
      "知らない書類",
      JSON.stringify({ formatVersion: "0.1.0", documentType: "unknown", fileName: "a", extractedAt: "x", fields: {} }),
    ],
    [
      "定義にない項目",
      JSON.stringify({
        formatVersion: "0.1.0",
        documentType: "withholding-slip",
        fileName: "a",
        extractedAt: "x",
        fields: { phone: { value: "0", confirmed: true } },
      }),
    ],
    [
      "型の違う値",
      JSON.stringify({
        formatVersion: "0.1.0",
        documentType: "withholding-slip",
        fileName: "a",
        extractedAt: "x",
        fields: { paymentAmount: { value: "580万", confirmed: true } },
      }),
    ],
  ])("%sファイルは読み込まない", (_, text) => {
    expect(() => parseExportedExtraction(text)).toThrow(ImportError);
  });

  it("書き出すファイル名に書類タイプを付ける", () => {
    expect(exportFileName("源泉徴収票_2025.pdf", "withholding-slip")).toBe("源泉徴収票_2025.withholding-slip.json");
  });
});
