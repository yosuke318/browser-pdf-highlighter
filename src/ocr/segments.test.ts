import { describe, expect, it } from "vitest";
import { linesFromBlocks, type OcrLine, type OcrSymbol, ocrLinesToSegments, type PixelToPdf } from "./segments.ts";

// 300dpi の画像(1pt = 300/72 画素)を、高さ 842pt のページに戻す
const SCALE = 300 / 72;
const toPdf: PixelToPdf = (x, y) => [x / SCALE, 842 - y / SCALE];

/** 左から順に、文字の幅 w・間隔 gap で並べた1行 */
function line(text: string, x: number, y: number, opts: { w?: number; h?: number; gap?: number; conf?: number[] } = {}): OcrLine {
  const w = opts.w ?? 40;
  const h = opts.h ?? 42;
  const gap = opts.gap ?? 4;
  const symbols: OcrSymbol[] = [];
  let cx = x;
  [...text].forEach((ch, i) => {
    if (ch !== " ") symbols.push({ text: ch, bbox: { x0: cx, y0: y, x1: cx + w, y1: y + h }, confidence: opts.conf?.[i] ?? 90 });
    cx += w + gap;
  });
  return { bbox: { x0: x, y0: y, x1: cx - gap, y1: y + h }, symbols };
}

describe("ocrLinesToSegments", () => {
  it("詰まって並んだ日本語の文字は、空白を入れずに1つのセルにする", () => {
    const segments = ocrLinesToSegments([line("支払金額", 100, 200)], toPdf);
    expect(segments.map((s) => s.text)).toEqual(["支払金額"]);
    expect(segments[0]?.source).toBe("ocr");
    expect(segments[0]?.charBoxes).toHaveLength(4);
  });

  it("間隔の広いところでセルを分ける(表のラベルと値)", () => {
    const label = line("支払金額", 100, 200);
    const value = line("5,800,000", 600, 200, { w: 24 });
    const segments = ocrLinesToSegments(
      [{ bbox: { ...label.bbox, x1: value.bbox.x1 }, symbols: [...label.symbols, ...value.symbols] }],
      toPdf,
    );
    expect(segments.map((s) => s.text)).toEqual(["支払金額", "5,800,000"]);
  });

  it("消した縦の罫線をはさむ文字は、間が狭くても別のセルにする", () => {
    const value = line("000", 100, 200, { w: 24, gap: 4 });
    const label = line("社会", 190, 200, { gap: 4 });
    const merged: OcrLine = { bbox: { ...value.bbox, x1: label.bbox.x1 }, symbols: [...value.symbols, ...label.symbols] };
    expect(ocrLinesToSegments([merged], toPdf).map((s) => s.text)).toEqual(["000社会"]);
    const separator = { x0: 180, y0: 150, x1: 182, y1: 300 };
    expect(ocrLinesToSegments([merged], toPdf, [separator]).map((s) => s.text)).toEqual(["000", "社会"]);
  });

  it("英数字の間が空いていれば空白を入れる", () => {
    expect(ocrLinesToSegments([line("AB CD", 100, 200, { w: 20, gap: 2 })], toPdf).map((s) => s.text)).toEqual(["AB CD"]);
  });

  it("位置をPDFページ座標に変える(y は上向き)", () => {
    const [segment] = ocrLinesToSegments([line("山田", 300, 420)], toPdf);
    expect(segment?.bbox.x0).toBeCloseTo(300 / SCALE, 3);
    expect(segment?.bbox.y1).toBeCloseTo(842 - 420 / SCALE, 3);
    expect(segment?.bbox.y0).toBeCloseTo(842 - 462 / SCALE, 3);
  });

  it("確からしさは、セルの文字の平均(0〜1)にする", () => {
    const [segment] = ocrLinesToSegments([line("山田", 300, 420, { conf: [80, 60] })], toPdf);
    expect(segment?.confidence).toBeCloseTo(0.7, 5);
  });

  it("上の行から順に並べる", () => {
    const segments = ocrLinesToSegments([line("下", 100, 800), line("上", 100, 100)], toPdf);
    expect(segments.map((s) => s.text)).toEqual(["上", "下"]);
  });

  it("高さのない行は捨てる", () => {
    expect(ocrLinesToSegments([line("無", 100, 100, { h: 0 })], toPdf)).toEqual([]);
  });
});

describe("linesFromBlocks", () => {
  it("tesseract.js の blocks から行と文字を取り出す(空白の文字は捨てる)", () => {
    const blocks = [
      {
        paragraphs: [
          {
            lines: [
              {
                bbox: { x0: 0, y0: 0, x1: 100, y1: 20 },
                words: [
                  {
                    symbols: [
                      { text: "山", confidence: 91, bbox: { x0: 0, y0: 0, x1: 20, y1: 20 } },
                      { text: " ", confidence: 99, bbox: { x0: 20, y0: 0, x1: 25, y1: 20 } },
                      { text: "田", confidence: 88, bbox: { x0: 25, y0: 0, x1: 45, y1: 20 } },
                    ],
                  },
                ],
              },
              { bbox: { x0: 0, y0: 30, x1: 100, y1: 50 }, words: [] },
            ],
          },
        ],
      },
    ];
    const lines = linesFromBlocks(blocks);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.symbols.map((s) => s.text)).toEqual(["山", "田"]);
    expect(lines[0]?.symbols[1]?.confidence).toBe(88);
  });

  it("形の違うデータは空にする", () => {
    expect(linesFromBlocks(null)).toEqual([]);
    expect(linesFromBlocks([{ paragraphs: "x" }])).toEqual([]);
  });
});
