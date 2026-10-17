import type { TextSegment } from "./types.ts";

// 行・セル単位の文字列(TextSegment)を、さらに同じ高さにあるもの同士で1行にまとめる。
// 表の中で「昭和」「63年」「4月」「15日」のように別々のセルに分かれた値を、行として続けて読むために使う。

export interface TextLine {
  /** 左から順に並べたセル */
  segments: TextSegment[];
}

function centerY(s: TextSegment): number {
  return (s.bbox.y0 + s.bbox.y1) / 2;
}

function height(s: TextSegment): number {
  return s.bbox.y1 - s.bbox.y0;
}

/**
 * 縦方向の中心が近いセルを1行にまとめる。結果は上の行から順。
 * 縦書きの文字列(縦長のセル)は、それだけで1行にする。
 */
export function groupLines(segments: readonly TextSegment[]): TextLine[] {
  const lines: TextSegment[][] = [];
  const sorted = [...segments].sort((p, q) => centerY(q) - centerY(p));
  for (const segment of sorted) {
    const isVertical = height(segment) > (segment.bbox.x1 - segment.bbox.x0) * 2 && [...segment.text].length > 1;
    const line = isVertical
      ? undefined
      : lines.find((l) => {
          const first = l[0];
          if (!first) return false;
          return Math.abs(centerY(first) - centerY(segment)) <= Math.min(height(first), height(segment)) / 2;
        });
    if (line) line.push(segment);
    else lines.push([segment]);
  }
  return lines.map((l) => ({ segments: l.sort((p, q) => p.bbox.x0 - q.bbox.x0) }));
}
