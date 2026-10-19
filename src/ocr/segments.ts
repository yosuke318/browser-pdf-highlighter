import { LAYOUT_SETTINGS } from "../pdf/text-layout.ts";
import { type Rect, type TextSegment, unionRect } from "../text/types.ts";

// OCR の結果(行・文字ごとの画素の位置と確からしさ)を、pdf.js で取り出した文字と同じ形
// (TextSegment)に変える。セルを分けるしきい値は、pdf.js の文字と同じもの(LAYOUT_SETTINGS)を使う。
// tesseract.js には依存しない(結果の形だけを受け取る)。

/** 画像の画素の長方形。原点は左上で y は下向き */
export interface PixelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrSymbol {
  text: string;
  bbox: PixelBox;
  /** 確からしさ(0〜100) */
  confidence: number;
}

export interface OcrLine {
  bbox: PixelBox;
  symbols: OcrSymbol[];
}

/** 画像の画素の位置を、PDFページ座標(pt、原点は左下で y は上向き)に変える関数 */
export type PixelToPdf = (x: number, y: number) => [number, number];

/** tesseract.js の recognize の結果(blocks)から、行と文字を取り出す */
export function linesFromBlocks(blocks: unknown): OcrLine[] {
  const lines: OcrLine[] = [];
  if (!Array.isArray(blocks)) return lines;
  for (const block of blocks) {
    for (const paragraph of arrayProp(block, "paragraphs")) {
      for (const line of arrayProp(paragraph, "lines")) {
        const bbox = boxProp(line);
        if (!bbox) continue;
        const symbols: OcrSymbol[] = [];
        for (const word of arrayProp(line, "words")) {
          for (const symbol of arrayProp(word, "symbols")) {
            const box = boxProp(symbol);
            const text = isObject(symbol) && typeof symbol.text === "string" ? symbol.text : "";
            const confidence = isObject(symbol) && typeof symbol.confidence === "number" ? symbol.confidence : 0;
            if (box && text.trim() !== "") symbols.push({ text, bbox: box, confidence });
          }
        }
        if (symbols.length > 0) lines.push({ bbox, symbols });
      }
    }
  }
  return lines;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function arrayProp(value: unknown, key: string): unknown[] {
  const prop = isObject(value) ? value[key] : undefined;
  return Array.isArray(prop) ? prop : [];
}

function boxProp(value: unknown): PixelBox | null {
  const box = isObject(value) ? value.bbox : undefined;
  if (!isObject(box)) return null;
  const { x0, y0, x1, y1 } = box;
  if (typeof x0 !== "number" || typeof y0 !== "number" || typeof x1 !== "number" || typeof y1 !== "number") return null;
  return { x0, y0, x1, y1 };
}

/** 長方形の4つの角を変換して、それを囲む長方形を返す */
function toPdfRect(box: PixelBox, toPdf: PixelToPdf): Rect {
  const corners = [toPdf(box.x0, box.y0), toPdf(box.x1, box.y0), toPdf(box.x0, box.y1), toPdf(box.x1, box.y1)];
  return {
    x0: Math.min(...corners.map((c) => c[0])),
    y0: Math.min(...corners.map((c) => c[1])),
    x1: Math.max(...corners.map((c) => c[0])),
    y1: Math.max(...corners.map((c) => c[1])),
  };
}

const ASCII_WORD = /^[\x21-\x7e]$/;

/** 2つの文字の間に、表の縦の罫線があるか */
function hasSeparatorBetween(left: OcrSymbol, right: OcrSymbol, line: PixelBox, separators: readonly PixelBox[]): boolean {
  const from = (left.bbox.x0 + left.bbox.x1) / 2;
  const to = (right.bbox.x0 + right.bbox.x1) / 2;
  const lineHeight = line.y1 - line.y0;
  return separators.some((s) => {
    const x = (s.x0 + s.x1) / 2;
    const overlap = Math.min(s.y1, line.y1) - Math.max(s.y0, line.y0);
    return x > from && x < to && overlap >= lineHeight / 2;
  });
}

/** 1行の文字を、間隔と罫線を見てセルに分ける */
function splitLine(line: OcrLine, separators: readonly PixelBox[]): OcrSymbol[][] {
  const size = line.bbox.y1 - line.bbox.y0;
  const symbols = [...line.symbols].sort((p, q) => p.bbox.x0 - q.bbox.x0);
  const cells: OcrSymbol[][] = [];
  let cell: OcrSymbol[] = [];
  for (const symbol of symbols) {
    const previous = cell.at(-1);
    if (
      previous &&
      (symbol.bbox.x0 - previous.bbox.x1 > LAYOUT_SETTINGS.cellGap * size ||
        hasSeparatorBetween(previous, symbol, line.bbox, separators))
    ) {
      cells.push(cell);
      cell = [];
    }
    cell.push(symbol);
  }
  if (cell.length > 0) cells.push(cell);
  return cells;
}

/** 1つのセルの文字を TextSegment にする */
function toSegment(cell: OcrSymbol[], line: PixelBox, toPdf: PixelToPdf): TextSegment {
  const size = line.y1 - line.y0;
  const chars: string[] = [];
  const boxes: Rect[] = [];
  cell.forEach((symbol, i) => {
    const next = cell[i + 1];
    // OCR の文字の長方形はインクの部分だけを囲むので、次の文字の手前まで広げる
    // (pdf.js の文字の長方形と同じく、字の送り幅の分を含める)。高さは行にそろえる
    const x1 = next ? Math.max(symbol.bbox.x1, next.bbox.x0) : symbol.bbox.x1;
    chars.push(symbol.text);
    boxes.push(toPdfRect({ x0: symbol.bbox.x0, y0: line.y0, x1, y1: line.y1 }, toPdf));
    // 英数字どうしの間が空いていれば、空白を1文字入れる(日本語の文字の間には入れない)
    if (
      next &&
      ASCII_WORD.test(symbol.text) &&
      ASCII_WORD.test(next.text) &&
      next.bbox.x0 - symbol.bbox.x1 > LAYOUT_SETTINGS.spaceGap * size
    ) {
      chars.push(" ");
      boxes.push(toPdfRect({ x0: symbol.bbox.x1, y0: line.y0, x1: next.bbox.x0, y1: line.y1 }, toPdf));
    }
  });
  const confidence = cell.reduce((sum, s) => sum + s.confidence, 0) / cell.length / 100;
  return {
    text: chars.join(""),
    bbox: unionRect(boxes) ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
    charBoxes: boxes,
    confidence: Math.round(confidence * 100) / 100,
    source: "ocr",
  };
}

/**
 * OCR の行を、行・セル単位の TextSegment にする。
 * セルは、文字の間隔(pdf.js の文字と同じしきい値)と、前処理で消した縦の罫線(separators)で分ける。
 * separators と lines は同じ画像の画素の位置で渡す。
 */
export function ocrLinesToSegments(
  lines: readonly OcrLine[],
  toPdf: PixelToPdf,
  separators: readonly PixelBox[] = [],
): TextSegment[] {
  return lines
    .filter((line) => line.bbox.y1 > line.bbox.y0)
    .flatMap((line) => splitLine(line, separators).map((cell) => toSegment(cell, line.bbox, toPdf)))
    .sort((p, q) => q.bbox.y1 - p.bbox.y1 || p.bbox.x0 - q.bbox.x0);
}
