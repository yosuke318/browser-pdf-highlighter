import { type Rect, type TextSegment, unionRect } from "../text/types.ts";

// 画像の様式に値の文字を重ねたPDF(ページの種類 overlay)で、OCR の結果と PDF の文字を組み合わせる。
// 欄の名前は画像にしかないので OCR で読み、値は PDF に入っている正確な文字を使う。
// OCR は画像に重なった値の文字も読むので、PDF の文字と重なる OCR の文字は捨てる。

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

/**
 * PDF の文字(値)と、OCR の文字(PDF の文字と重ならない部分 = 画像の欄の名前など)を合わせる。
 * 結果は上から下、左から右の順
 */
export function mergeOverlay(pdfSegments: readonly TextSegment[], ocrSegments: readonly TextSegment[]): TextSegment[] {
  const areas = pdfSegments.map((s) => expand(s.bbox));
  const covered = (box: Rect) => {
    const x = (box.x0 + box.x1) / 2;
    const y = (box.y0 + box.y1) / 2;
    return areas.some((area) => contains(area, x, y));
  };
  const ocr = ocrSegments.flatMap((s) => removeCovered(s, covered));
  return [...pdfSegments, ...ocr].sort((p, q) => q.bbox.y1 - p.bbox.y1 || p.bbox.x0 - q.bbox.x0);
}
