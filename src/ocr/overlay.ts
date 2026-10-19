import { type Rect, type TextSegment, unionRect } from "../text/types.ts";

// 画像の様式に値の文字を重ねたPDF(ページの種類 overlay)で、OCR の結果と PDF の文字を組み合わせる。
// - 欄の名前は画像にしかないので OCR で読み、値は PDF に入っている正確な文字を使う
// - OCR は画像に重なった値の文字も読むので、PDF の文字と重なる OCR の文字は捨てる
// - 様式の「千」「円」の区切りに合わせて、1つの金額が離れた数字の文字列に分かれていることがある
//   (「5」「800 000」、「870」「000」)。様式の表の縦の罫線をはさまない、同じ行の数字の文字列は1つにつなげる

/** PDF の文字の長方形を、上下左右にこの割合(文字の高さに対する比率)だけ広げて、重なりを調べる */
const MARGIN = 0.2;

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

function expand(rect: Rect): Rect {
  const m = (rect.y1 - rect.y0) * MARGIN;
  return { x0: rect.x0 - m, y0: rect.y0 - m, x1: rect.x1 + m, y1: rect.y1 + m };
}

/** OCR のセルから、PDF の文字と重なる文字を除く。除いた文字の前後でセルを分ける */
function removeCovered(segment: TextSegment, covered: (box: Rect) => boolean): TextSegment[] {
  const chars = [...segment.text];
  const parts: TextSegment[] = [];
  let text: string[] = [];
  let boxes: Rect[] = [];
  const flush = () => {
    // 前後の空白だけのセルは作らない
    const start = text.findIndex((c) => c.trim() !== "");
    const end = text.length - [...text].reverse().findIndex((c) => c.trim() !== "");
    if (start >= 0) {
      const kept = boxes.slice(start, end);
      parts.push({
        ...segment,
        text: text.slice(start, end).join(""),
        charBoxes: kept,
        bbox: unionRect(kept) ?? segment.bbox,
      });
    }
    text = [];
    boxes = [];
  };
  chars.forEach((char, i) => {
    const box = segment.charBoxes[i] ?? segment.bbox;
    if (covered(box)) {
      flush();
      return;
    }
    text.push(char);
    boxes.push(box);
  });
  flush();
  return parts;
}

/** 数字(と区切りの空白・カンマ)だけの文字列 */
const NUMBER_ONLY = /^[\d０-９][\d０-９\s,，]*$/u;
/** 同じ金額の続きとみなす、文字列の間の最大の距離(文字の高さの何倍か)。枠の幅を超えるほど離れたものはつなげない */
const MAX_JOIN_GAP = 6;

function sameLine(a: TextSegment, b: TextSegment): boolean {
  const h = Math.min(a.bbox.y1 - a.bbox.y0, b.bbox.y1 - b.bbox.y0);
  return Math.abs((a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2) <= h / 2;
}

/**
 * 枠の罫線とみなすために、縦の線が値の文字の上端より上へ伸びている必要がある長さ(文字の高さの何倍か)。
 * 源泉徴収票の金額の欄には、桁の区切り(千・円)を示す短い縦線もある。実物では、枠の罫線は見出しの行まで
 * 伸びていて文字の上端から高さの約2.3倍上まであり、桁の区切りの線は約1.1倍上で止まっていた
 */
const MIN_RISE = 1.5;

/** a と b の間に、様式の枠の縦の罫線があるか */
function separated(a: TextSegment, b: TextSegment, separators: readonly Rect[]): boolean {
  const y = (a.bbox.y0 + a.bbox.y1) / 2;
  const h = a.bbox.y1 - a.bbox.y0;
  return separators.some((line) => {
    const x = (line.x0 + line.x1) / 2;
    return x > a.bbox.x1 && x < b.bbox.x0 && line.y0 <= y && line.y1 - a.bbox.y1 >= MIN_RISE * h;
  });
}

/**
 * 同じ枠の中で離れて置かれた数字の文字列を、1つにつなげる。
 * 罫線が分からない(OCR がまだ終わっていない)ときは、つなげない
 */
export function joinNumbersInCells(segments: readonly TextSegment[], separators: readonly Rect[]): TextSegment[] {
  if (separators.length === 0) return [...segments];
  const sorted = [...segments].sort((p, q) => p.bbox.x0 - q.bbox.x0);
  const result: TextSegment[] = [];
  const used = new Set<TextSegment>();
  for (const start of sorted) {
    if (used.has(start)) continue;
    used.add(start);
    let current = start;
    if (NUMBER_ONLY.test(start.text.trim())) {
      for (;;) {
        const h = current.bbox.y1 - current.bbox.y0;
        const next = sorted.find(
          (s) =>
            !used.has(s) &&
            s.bbox.x0 >= current.bbox.x1 &&
            sameLine(current, s) &&
            NUMBER_ONLY.test(s.text.trim()) &&
            s.bbox.x0 - current.bbox.x1 <= MAX_JOIN_GAP * h,
        );
        if (!next || separated(current, next, separators)) break;
        used.add(next);
        const gap: Rect = { x0: current.bbox.x1, y0: current.bbox.y0, x1: next.bbox.x0, y1: current.bbox.y1 };
        const charBoxes = [...current.charBoxes, gap, ...next.charBoxes];
        current = {
          ...current,
          text: `${current.text} ${next.text}`,
          charBoxes,
          bbox: unionRect([current.bbox, next.bbox]) ?? current.bbox,
          confidence: Math.min(current.confidence, next.confidence),
        };
      }
    }
    result.push(current);
  }
  return result;
}

/**
 * PDF の文字(値)と、OCR の文字(PDF の文字と重ならない部分 = 画像の欄の名前など)を合わせる。
 * separators は様式の表の縦の罫線(OCR の前処理で見つけたもの)。結果は上から下、左から右の順
 */
export function mergeOverlay(
  pdfSegments: readonly TextSegment[],
  ocrSegments: readonly TextSegment[],
  separators: readonly Rect[] = [],
): TextSegment[] {
  const values = joinNumbersInCells(pdfSegments, separators);
  const areas = values.map((s) => expand(s.bbox));
  const covered = (box: Rect) => {
    const x = (box.x0 + box.x1) / 2;
    const y = (box.y0 + box.y1) / 2;
    return areas.some((area) => contains(area, x, y));
  };
  const ocr = ocrSegments.flatMap((s) => removeCovered(s, covered));
  return [...values, ...ocr].sort((p, q) => q.bbox.y1 - p.bbox.y1 || p.bbox.x0 - q.bbox.x0);
}
