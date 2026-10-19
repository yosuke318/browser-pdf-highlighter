import { describe, expect, it } from "vitest";
import type { Rect, TextSegment } from "../text/types.ts";
import { joinNumbersInCells, mergeOverlay } from "./overlay.ts";

/** 文字ごとの長方形を、左から等間隔に並べたセル */
function seg(text: string, x0: number, y0: number, opts: { w?: number; h?: number; source?: "pdf" | "ocr" } = {}): TextSegment {
  const w = opts.w ?? 6;
  const h = opts.h ?? 9;
  const charBoxes = [...text].map((_, i) => ({ x0: x0 + i * w, y0, x1: x0 + (i + 1) * w, y1: y0 + h }));
  return {
    text,
    bbox: { x0, y0, x1: x0 + w * [...text].length, y1: y0 + h },
    charBoxes,
    confidence: opts.source === "ocr" ? 0.9 : 1,
    source: opts.source ?? "pdf",
  };
}

/** 縦の線(x の位置に、y0〜y1) */
const line = (x: number, y0: number, y1: number): Rect => ({ x0: x, y0, x1: x + 0.5, y1 });

describe("joinNumbersInCells", () => {
  // 値の文字は y=460〜469。枠の罫線は見出しの行(上)まで伸びる
  const columnLines = [line(500, 455, 495), line(580, 455, 495)];

  it("同じ枠の中で離れて置かれた数字を、1つにつなげる(「5」「800 000」)", () => {
    const joined = joinNumbersInCells([seg("5", 510, 460), seg("800 000", 530, 460)], columnLines);
    expect(joined.map((s) => s.text)).toEqual(["5 800 000"]);
    expect([...(joined[0]?.text ?? "")]).toHaveLength(joined[0]?.charBoxes.length ?? -1);
  });

  it("枠の罫線をはさむ数字はつなげない", () => {
    const joined = joinNumbersInCells([seg("800 000", 530, 460), seg("4", 590, 460)], columnLines);
    expect(joined.map((s) => s.text).sort()).toEqual(["4", "800 000"]);
  });

  it("桁の区切りの短い縦線(文字の少し上で止まる線)は、枠の罫線とみなさない", () => {
    const tick = line(548, 455, 479);
    const joined = joinNumbersInCells([seg("870", 525, 460), seg("000", 565, 460)], [...columnLines, tick]);
    expect(joined.map((s) => s.text)).toEqual(["870 000"]);
  });

  it("数字以外の文字列や、別の行の数字はつなげない", () => {
    const joined = joinNumbersInCells([seg("給料", 510, 460), seg("800", 530, 460), seg("000", 550, 480)], columnLines);
    expect(joined).toHaveLength(3);
  });

  it("罫線が分からない(OCR がまだ終わっていない)ときは、つなげない", () => {
    expect(joinNumbersInCells([seg("5", 510, 460), seg("800 000", 530, 460)], [])).toHaveLength(2);
  });
});

describe("mergeOverlay", () => {
  it("PDF の文字と重なる OCR の文字は捨て、重ならない部分(欄の名前)だけを足す", () => {
    const pdf = [seg("5 800 000", 530, 460)];
    // OCR は欄の名前と、画像に重なった値の文字を、1つのセルとして読んでいる
    const ocr = [seg("支払金額", 530, 490, { source: "ocr" }), seg("金額5800", 518, 460, { source: "ocr" })];
    const merged = mergeOverlay(pdf, ocr);
    expect(merged.map((s) => `${s.source}:${s.text}`)).toEqual(["ocr:支払金額", "ocr:金額", "pdf:5 800 000"]);
  });

  it("OCR の結果がないときは、PDF の文字だけ", () => {
    expect(mergeOverlay([seg("山田 太郎", 100, 100)], []).map((s) => s.text)).toEqual(["山田 太郎"]);
  });
});
