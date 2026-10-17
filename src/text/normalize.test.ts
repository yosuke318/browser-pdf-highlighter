import { describe, expect, it } from "vitest";
import { normalizeChar, normalizeForDisplay, normalizeText, rangeBBox, toSourceRange } from "./normalize.ts";
import type { TextSegment } from "./types.ts";

describe("1文字の正規化", () => {
  it("康熙部首とCJK部首補助を、通常の漢字に戻す", () => {
    // ダミーの源泉徴収票から実際に取り出された文字
    expect(normalizeChar("⽀")).toBe("支"); // U+2F40 康熙部首
    expect(normalizeChar("⾒")).toBe("見"); // U+2F92 康熙部首
    expect(normalizeChar("⺠")).toBe("民"); // U+2EA0 CJK部首補助(NFKC では戻らない)
    expect(normalizeChar("⻑")).toBe("長"); // U+2ED1 CJK部首補助
  });

  it("全角の英数字・記号を半角にする", () => {
    expect(normalizeText("ＡＢＣ１２３，．").text).toBe("ABC123,.");
  });

  it("空白(全角・半角・改行)を取り除く", () => {
    expect(normalizeText("山田　太郎 \n様").text).toBe("山田太郎様");
  });

  it("ハイフンに似た文字を揃え、長音はそのまま残す", () => {
    expect(normalizeText("1‐2−3－4").text).toBe("1-2-3-4");
    expect(normalizeText("サンプルハイツ").text).toBe("サンプルハイツ");
    expect(normalizeText("ｻﾝﾌﾟﾙｰ").text).toBe("サンプルー");
  });

  it("㈱ は (株) にする", () => {
    expect(normalizeText("㈱見本").text).toBe("(株)見本");
  });
});

describe("元の文字位置への対応", () => {
  it("空白を取り除いても、元の何文字目かを覚えている", () => {
    const n = normalizeText("山田 太郎");
    expect(n.text).toBe("山田太郎");
    expect(n.sourceIndex).toEqual([0, 1, 3, 4]);
    // 「太郎」は元の文字列の 3〜5 文字目
    expect(toSourceRange(n, 2, 4)).toEqual([3, 5]);
  });

  it("1文字が複数の文字になっても、すべて元の同じ文字を指す", () => {
    const n = normalizeText("㈱A");
    expect(n.text).toBe("(株)A");
    expect(n.sourceIndex).toEqual([0, 0, 0, 1]);
    expect(toSourceRange(n, 1, 2)).toEqual([0, 1]);
  });

  it("範囲が不正なら null", () => {
    const n = normalizeText("abc");
    expect(toSourceRange(n, 2, 2)).toBeNull();
    expect(toSourceRange(n, 0, 4)).toBeNull();
  });

  it("正規化した文字列の範囲を囲む長方形を求められる", () => {
    const box = (x: number) => ({ x0: x, y0: 0, x1: x + 10, y1: 10 });
    const segment: TextSegment = {
      text: "山田 太郎",
      bbox: { x0: 0, y0: 0, x1: 50, y1: 10 },
      charBoxes: [box(0), box(10), box(20), box(30), box(40)],
      confidence: 1,
      source: "pdf",
    };
    const n = normalizeText(segment.text);
    expect(rangeBBox(segment, n, 2, 4)).toEqual({ x0: 30, y0: 0, x1: 50, y1: 10 });
  });
});

it("濁点・半濁点が分かれた文字は、前の文字と合わせて1文字にし、元の位置は前の文字を指す", () => {
  const n = normalizeText("ﾌﾟﾗﾝ");
  expect(n.text).toBe("プラン");
  expect(n.sourceIndex).toEqual([0, 2, 3]);
});

it("画面に出すための正規化は、空白を1つにまとめて残す", () => {
  expect(normalizeForDisplay(" ⼭⽥　 太郎 ")).toBe("山田 太郎");
  expect(normalizeForDisplay("昭和 63 年 4 ⽉ 15 ⽇")).toBe("昭和 63 年 4 月 15 日");
});
