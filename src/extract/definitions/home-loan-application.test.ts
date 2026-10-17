import { describe, expect, it } from "vitest";
import type { TextSegment } from "../../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "../engine.ts";
import homeLoanApplication from "./home-loan-application.ts";

// 住宅ローン借入申込書の書類定義を、表の行の数や、読み違えやすい配置で確かめる。
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
const extract = (segments: TextSegment[]) => extractDocument(homeLoanApplication, [page(segments)]);

/** ダミーの住宅ローン借入申込書をもとにした、他の借入の表。rows は1行ずつのセル */
function debtTable(rows: TextSegment[][]): TextSegment[] {
  return [
    cell("他の借入(住宅ローン以外)", 41, 344),
    cell("借入先", 39, 322),
    cell("借入目的", 171, 322),
    cell("借入残高", 302, 322),
    cell("年間返済額", 434, 322),
    ...rows.flat(),
    cell("購入物件", 41, 150),
    cell("物件所在地", 39, 128),
    cell("見本県見本市緑町2丁目3番4号", 123, 125, 11),
  ];
}

const debtRow = (y: number, lender: string, purpose: string, balance: string, repayment: string) => [
  cell(lender, 38, y, 11),
  cell(purpose, 170, y, 11),
  cell(balance, 302, y, 11),
  cell("万円", 327, y),
  cell(repayment, 433, y, 11),
  cell("万円", 451, y),
];

describe("住宅ローン借入申込書の書類定義", () => {
  it("他の借入の表を、行ごとに取る(単位が別のセルでも換算する)", () => {
    const values = toValues(
      extract(
        debtTable([
          debtRow(294, "見本ファイナンス", "自動車ローン", "120", "36"),
          debtRow(272, "見本カード", "カードローン", "30", "12"),
        ]),
      ),
    );
    expect(values.otherDebts).toEqual([
      { lender: "見本ファイナンス", purpose: "自動車ローン", balance: 1_200_000, annualRepayment: 360_000 },
      { lender: "見本カード", purpose: "カードローン", balance: 300_000, annualRepayment: 120_000 },
    ]);
  });

  it("何も書かれていない行(単位だけの行)は飛ばし、表の後の見出しを行として取らない", () => {
    const values = toValues(
      extract(
        debtTable([
          debtRow(294, "見本ファイナンス", "自動車ローン", "120", "36"),
          [cell("万円", 305, 272), cell("万円", 437, 272)],
        ]),
      ),
    );
    expect(values.otherDebts).toHaveLength(1);
  });

  it("他の借入がなければ、項目は未検出にする(空の一覧を作らない)", () => {
    const result = extract(debtTable([]));
    expect(result.fields.find((f) => f.key === "otherDebts")?.found).toBe(false);
  });

  it("勤務先の所在地を、購入物件の所在地と取り違えない", () => {
    const values = toValues(
      extract([
        cell("勤務先", 41, 498),
        cell("所在地", 39, 450),
        cell("見本県見本市中央1丁目1番1号", 124, 448, 11),
        cell("購入物件", 41, 242),
        cell("所在地", 39, 220),
        cell("見本県見本市緑町2丁目3番4号", 123, 217, 11),
      ]),
    );
    expect(values.propertyAddress).toBe("見本県見本市緑町2丁目3番4号");
  });

  it("元号が丸で選ぶ形式(「昭和・平成」)のままなら、生年月日は推測しない", () => {
    const values = toValues(extract([cell("生年月日", 39, 578), cell("昭和・平成63年4月15日", 124, 576, 11)]));
    expect(values.birthDate).toBeUndefined();
  });

  it("元号が1つに決まっていれば、生年月日を取る", () => {
    const values = toValues(extract([cell("生年月日", 39, 578), cell("昭和63年4月15日", 124, 576, 11)]));
    expect(values.birthDate).toBe("1988-04-15");
  });

  it("借入希望額・購入価格の万円単位を換算する", () => {
    const values = toValues(
      extract([
        cell("借入希望額", 39, 706),
        cell("4,000", 124, 703, 11),
        cell("万円", 182, 705),
        cell("購入価格", 334, 194),
        cell("4,500", 419, 192, 11),
        cell("万円", 477, 194),
      ]),
    );
    expect(values).toMatchObject({ loanAmount: 40_000_000, propertyPrice: 45_000_000 });
  });
});
