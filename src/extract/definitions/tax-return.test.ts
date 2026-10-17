import { describe, expect, it } from "vitest";
import type { TextSegment } from "../../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "../engine.ts";
import taxReturn from "./tax-return.ts";

// 確定申告書(第一表)の書類定義を、同じラベルが区分ごとに出てくる配置で確かめる。
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

/** 縦書きの見出し。中心の高さ center に、1文字ずつ縦に並べる */
function vertical(text: string, x: number, center: number, size = 8): TextSegment {
  const chars = [...text];
  const top = center + (chars.length * size) / 2;
  return {
    text,
    bbox: { x0: x, y0: top - chars.length * size, x1: x + size, y1: top },
    charBoxes: chars.map((_, i) => ({ x0: x, y0: top - (i + 1) * size, x1: x + size, y1: top - i * size })),
    confidence: 1,
    source: "pdf",
  };
}

/** ダミーの確定申告書の配置をもとにした、収入金額等・所得金額等・所得から差し引かれる金額の区分 */
function form(extra: TextSegment[] = []): ExtractionPage {
  return {
    pageNumber: 1,
    view: [0, 0, 595, 842],
    segments: [
      // 左の列: 収入金額等(上)と所得金額等(下)。縦書きの見出しは区分の縦の真ん中にある
      vertical("収入金額等", 34, 593),
      cell("事業営業等", 50, 675),
      cell("9600000", 213, 674),
      cell("給与", 50, 593),
      cell("一時", 50, 489),
      vertical("所得金額等", 34, 400),
      cell("事業営業等", 50, 469),
      cell("3850000", 213, 468),
      cell("合計", 50, 324),
      cell("3850000", 213, 324),
      // 右の列: 所得から差し引かれる金額と、税金の計算
      vertical("所得から差し引かれる金額", 308, 613),
      cell("社会保険料控除", 324, 687),
      cell("980000", 498, 687),
      cell("合計", 324, 533),
      cell("2540000", 487, 533),
      vertical("税金の計算", 308, 420),
      cell("申告納税額", 324, 353),
      cell("66800", 510, 353),
      ...extra,
    ],
  };
}

const extract = (page: ExtractionPage) => toValues(extractDocument(taxReturn, [page]));

describe("確定申告書の書類定義", () => {
  it("同じラベル(「事業 営業等」「合計」)を、左の縦書きの区分で区別する", () => {
    expect(extract(form())).toMatchObject({
      businessRevenue: 9_600_000,
      businessIncome: 3_850_000,
      totalIncome: 3_850_000,
      totalDeductions: 2_540_000,
      taxDue: 66_800,
    });
  });

  it("区分の見出しは、同じ高さにある別の列の見出しと取り違えない", () => {
    // 右の列の「合計」は、高さでは左の列の「収入金額等」が近いが、最も近い列の見出し(所得から差し引かれる金額)を使う
    expect(extract(form()).totalIncome).toBe(3_850_000);
  });

  it("書かれていない欄(給与)は、近くの別の欄の値を取らない", () => {
    expect(extract(form()).salaryRevenue).toBeUndefined();
  });

  it("還付の申告(△)は負の数にする", () => {
    const page = form();
    page.segments = page.segments.filter((s) => s.text !== "66800");
    page.segments.push(cell("△12000", 505, 353));
    expect(extract(page).taxDue).toBe(-12_000);
  });

  it("対象年は「令和07年分」のようなゼロ埋めの書き方にも対応する", () => {
    expect(extract(form([cell("令和07年分の所得税及び復興特別所得税の確定申告書", 28, 799)])).incomeYear).toBe(2025);
  });
});
