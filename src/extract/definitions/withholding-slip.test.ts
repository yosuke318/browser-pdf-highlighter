import { describe, expect, it } from "vitest";
import type { TextSegment } from "../../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "../engine.ts";
import withholdingSlip from "./withholding-slip.ts";

// 源泉徴収票の書類定義を、読み違えやすい配置で確かめる。
// ダミーPDF全体での確認は、リグレッションテスト(src/regression/extraction.test.ts)で行っている。

/** 1文字の幅・高さが size のセル。(x, y) は左下 */
function cell(text: string, x: number, y: number, size = 8): TextSegment {
  const chars = [...text];
  return {
    text,
    bbox: { x0: x, y0: y, x1: x + chars.length * size, y1: y + size },
    charBoxes: chars.map((_, i) => ({ x0: x + i * size, y0: y, x1: x + (i + 1) * size, y1: y + size })),
    confidence: 1,
    source: "pdf",
  };
}

/** 縦書きの見出し(1文字ずつ下へ並ぶ) */
function vertical(text: string, x: number, top: number, size = 8): TextSegment {
  const chars = [...text];
  const y0 = top - chars.length * size;
  return {
    text,
    bbox: { x0: x, y0, x1: x + size, y1: top },
    charBoxes: chars.map((_, i) => ({ x0: x, y0: top - (i + 1) * size, x1: x + size, y1: top - i * size })),
    confidence: 1,
    source: "pdf",
  };
}

/** ダミーの源泉徴収票の配置をもとにした、1ページ分のセル */
function slip(extra: TextSegment[] = []): ExtractionPage {
  return {
    pageNumber: 1,
    view: [0, 0, 595, 842],
    segments: [
      cell("令和", 168, 790, 12),
      cell("7", 206, 790, 12),
      cell("年分", 225, 790, 12),
      cell("給与所得の源泉徴収票", 272, 790, 12),
      vertical("支払を受ける者", 40, 780),
      cell("住所又は居所", 55, 772),
      cell("見本県見本市サンプル町1丁目2番3号", 109, 770, 10),
      cell("氏名", 422, 750),
      cell("(フリガナ)ヤマダ タロウ", 450, 750, 7),
      cell("山田 太郎", 450, 737, 10),
      cell("支払金額", 155, 712),
      cell("給与所得控除後の金額", 251, 712),
      cell("内", 136, 685, 10),
      cell("5,800,000", 186, 685, 10),
      cell("4,200,000", 294, 685, 10),
      cell("受給者生年月日", 484, 574),
      cell("昭和", 462, 561),
      cell("63年", 486, 561),
      cell("4月", 514, 561),
      cell("15日", 538, 561),
      vertical("支払者", 40, 541),
      cell("住所(居所)", 55, 532),
      cell("見本県見本市中央1丁目1番1号", 151, 529, 10),
      cell("又は所在地", 55, 521),
      cell("氏名又は名称", 55, 507),
      cell("株式会社サンプル商事", 151, 505, 10),
      cell("(電話)000-0000-1111", 270, 505, 7),
      ...extra,
    ],
  };
}

const extract = (page: ExtractionPage) => toValues(extractDocument(withholdingSlip, [page]));

describe("源泉徴収票の書類定義", () => {
  it("各欄の値を取る", () => {
    expect(extract(slip())).toEqual({
      incomeYear: 2025,
      name: "山田 太郎",
      address: "見本県見本市サンプル町1丁目2番3号",
      birthDate: "1988-04-15",
      employerName: "株式会社サンプル商事",
      employerAddress: "見本県見本市中央1丁目1番1号",
      paymentAmount: 5_800_000,
      salaryIncomeAfterDeduction: 4_200_000,
    });
  });

  it("支払金額の欄の左上の「内」(未払いの金額)は取らない", () => {
    const values = extract(slip([cell("1,200,000", 120, 695, 6)]));
    expect(values.paymentAmount).toBe(5_800_000);
  });

  it("摘要欄に書かれた前の勤務先の支払金額は取らない", () => {
    const values = extract(
      slip([cell("(摘要)", 38, 600), cell("前職分", 80, 600), cell("支払金額", 110, 600), cell("1,000,000円", 150, 600)]),
    );
    expect(values.paymentAmount).toBe(5_800_000);
  });

  it("受給者の氏名と、支払者(勤務先)の氏名又は名称を取り違えない", () => {
    const values = extract(slip());
    expect(values.name).toBe("山田 太郎");
    expect(values.employerName).toBe("株式会社サンプル商事");
  });

  it("受給者の住所と、支払者の所在地を取り違えない", () => {
    const values = extract(slip());
    expect(values.address).toBe("見本県見本市サンプル町1丁目2番3号");
    expect(values.employerAddress).toBe("見本県見本市中央1丁目1番1号");
  });

  it("氏名がフリガナの右にある様式でも、フリガナは取らない", () => {
    const page = slip();
    page.segments = page.segments.filter((s) => s.text !== "山田 太郎");
    page.segments.push(cell("山田 太郎", 560, 750, 10));
    expect(extract(page).name).toBe("山田 太郎");
  });

  it("元号の欄が読めなければ、生年月日は取らない(推測で埋めない)", () => {
    const page = slip();
    page.segments = page.segments.filter((s) => s.text !== "昭和");
    expect(extract(page).birthDate).toBeUndefined();
  });

  it("令和元年分も年に変換する", () => {
    const page = slip();
    page.segments = page.segments.filter((s) => s.text !== "7");
    page.segments.push(cell("元", 206, 790, 12));
    expect(extract(page).incomeYear).toBe(2019);
  });
});
