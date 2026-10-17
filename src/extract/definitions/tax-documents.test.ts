import { describe, expect, it } from "vitest";
import type { TextSegment } from "../../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "../engine.ts";
import residentTaxNotice from "./resident-tax-notice.ts";
import taxCertificate from "./tax-certificate.ts";

// 課税証明書と住民税決定通知書の書類定義を、自治体による様式の違いや、読み違えやすい配置で確かめる。
// ダミーPDF全体での確認は、リグレッションテスト(src/regression/extraction.test.ts)で行っている。

/** 1文字の幅・高さが size のセル。(x, y) は左下 */
function cell(text: string, x: number, y: number, size = 9): TextSegment {
  const chars = [...text];
  return {
    text,
    bbox: { x0: x, y0: y, x1: x + chars.length * size, y1: y + size },
    charBoxes: chars.map((_, i) => ({ x0: x + i * size, y0: y, x1: x + (i + 1) * size, y1: y + size })),
    confidence: 1,
    source: "pdf",
  };
}

const page = (segments: TextSegment[]): ExtractionPage => ({ pageNumber: 1, view: [0, 0, 595, 842], segments });

describe("課税証明書", () => {
  const extract = (segments: TextSegment[]) => extractDocument(taxCertificate, [page(segments)]);

  it("ラベルの表記ゆれ(「給与の収入金額」「総所得金額」「税額合計」)に対応する", () => {
    const values = toValues(
      extract([
        cell("給与の収入金額", 57, 620),
        cell("5,800,000", 240, 620),
        cell("総所得金額", 57, 600),
        cell("4,200,000", 240, 600),
        cell("税額合計", 57, 580),
        cell("287,600", 500, 580),
      ]),
    );
    expect(values).toMatchObject({ salaryRevenue: 5_800_000, totalIncome: 4_200_000, annualTax: 287_600 });
  });

  it("「令和7年中の所得」がなければ、対象年は年度の前年にし、計算した値であることを注意として残す", () => {
    const result = extract([cell("(令和8年度)", 500, 782)]);
    const incomeYear = result.fields.find((f) => f.key === "incomeYear");
    expect(toValues(result)).toMatchObject({ fiscalYear: 2026, incomeYear: 2025 });
    expect(incomeYear?.warnings).toHaveLength(1);
  });

  it("「令和7年中の所得」があれば、それを対象年にする", () => {
    const result = extract([cell("令和8年度(令和7年中の所得)", 142, 675)]);
    const incomeYear = result.fields.find((f) => f.key === "incomeYear");
    expect(toValues(result)).toMatchObject({ fiscalYear: 2026, incomeYear: 2025 });
    expect(incomeYear?.ruleId).toBe("income-year");
  });

  it("年税額の内訳(市民税・県民税)が並んでいても、合計の列を取る", () => {
    const values = toValues(
      extract([cell("年税額", 57, 440), cell("169,800", 268, 440), cell("3,000", 398, 440), cell("172,800", 501, 440)]),
    );
    expect(values.annualTax).toBe(172_800);
  });
});

describe("住民税決定通知書", () => {
  const extract = (segments: TextSegment[]) => toValues(extractDocument(residentTaxNotice, [page(segments)]));

  it("氏名の敬称(「様」)は値に含めない", () => {
    expect(extract([cell("納税義務者氏名", 39, 711), cell("山田太郎様", 118, 711)]).name).toBe("山田太郎");
  });

  it("「特別徴収義務者」の行が何度あっても、勤務先の名称だけを取る", () => {
    const values = extract([
      cell("特別徴収義務者", 302, 757),
      cell("000111222", 382, 757),
      cell("特別徴収義務者", 39, 694),
      cell("見本県見本市中央1丁目1番1号", 118, 694),
      cell("特別徴収義務者", 39, 665),
      cell("株式会社サンプル商事", 118, 665),
    ]);
    expect(values.employerName).toBe("株式会社サンプル商事");
  });

  it("特別徴収税額の行は、右端の合計を取る", () => {
    const values = extract([
      cell("特別徴収税額(年税額)", 39, 429),
      cell("172,800", 253, 429),
      cell("113,800", 338, 429),
      cell("1,000", 447, 429),
      cell("287,600", 521, 429),
    ]);
    expect(values.annualTax).toBe(287_600);
  });

  it("「課税標準額(総所得)」のようにラベルに補足が付いていても、隣の値を取る", () => {
    expect(extract([cell("課税標準額(総所得)", 278, 542), cell("2,872,000", 513, 542)]).taxableIncome).toBe(2_872_000);
  });

  it("タイトルの「給与所得等に係る」を、給与所得のラベルと取り違えない", () => {
    const values = extract([
      cell("給与所得等に係る市民税・県民税", 169, 796),
      cell("給与所得", 39, 594),
      cell("4,200,000", 225, 594),
    ]);
    expect(values.salaryIncome).toBe(4_200_000);
  });
});
