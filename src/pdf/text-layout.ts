import type { Rect, TextSegment } from "../text/types.ts";
import { unionRect } from "../text/types.ts";

// pdf.js の getTextContent が返すテキスト片を、行・表のセル単位の文字列にまとめる。
// PDFによっては1文字ずつ別のテキスト片になっているため、近くにある片をつなげる。
// pdf.js 本体には依存せず、テキスト片の値だけを受け取る。

/** getTextContent の items のうち、ここで使う値 */
export interface TextItemLike {
  str: string;
  /** [a, b, c, d, e, f]。(e, f) が文字の基準点(ベースラインの始点) */
  transform: number[];
  /** 文字列の長さ(PDFページ座標) */
  width: number;
  /** 文字の大きさ(PDFページ座標) */
  height: number;
  fontName: string;
}

/** getTextContent の styles のうち、ここで使う値(フォントのベースラインからの上端・下端の比率) */
export interface FontStyleLike {
  ascent: number;
  descent: number;
}

/** まとめるときのしきい値(文字の大きさに対する比率) */
export const LAYOUT_SETTINGS = {
  /** ベースラインの高さの差がこれ以内なら、同じ行とみなす */
  sameLineTolerance: 0.3,
  /**
   * 前の片との間がこれより広ければ、別のセルとみなす。
   * ダミーの源泉徴収票では、表の見出しどうしの間が 0.96〜0.99、字間をあけたタイトル(「令 和 7 年 分」)の
   * 字間が 0.93 だった。見出しを分けることを優先して 0.9 にしている(タイトルは「令和」「7」「年分」に分かれる)
   */
  cellGap: 0.9,
  /** 文字の大きさが違う片は、間がこれより広ければ別のセルとみなす(ラベルと値が近接している表への対策) */
  cellGapOnFontChange: 0.3,
  /** 文字の大きさが違うとみなす比率 */
  fontSizeChange: 1.15,
  /** 前の片との間がこれより広ければ、間に空白を1文字入れる */
  spaceGap: 0.25,
} as const;

interface Run {
  chars: string[];
  boxes: Rect[];
  /** 横書きか(回転していない文字) */
  horizontal: boolean;
  /** ベースラインの位置(横書きの y) */
  baseline: number;
  x0: number;
  x1: number;
  size: number;
}

/** テキスト片を、1文字ごとの長方形を持つ形にする。空白だけの片は捨てる(間隔は座標から求める) */
function toRun(item: TextItemLike, styles: Record<string, FontStyleLike | undefined>): Run | null {
  if (item.str.trim() === "") return null;
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = item.transform;
  const style = styles[item.fontName];
  const ascent = style?.ascent || 0.88;
  const descent = style?.descent || -0.12;
  const chars = [...item.str];
  const size = item.height || Math.hypot(c, d);

  // 文字の進む向き(a, b)と、上向き(c, d)の単位ベクトル
  const advLen = Math.hypot(a, b) || 1;
  const upLen = Math.hypot(c, d) || 1;
  const adv = [a / advLen, b / advLen] as const;
  const up = [c / upLen, d / upLen] as const;
  const step = item.width / chars.length;

  const boxes = chars.map((_, k) => {
    const start = k * step;
    const end = (k + 1) * step;
    const corners = [
      [start, descent * size],
      [end, descent * size],
      [start, ascent * size],
      [end, ascent * size],
    ].map(([s = 0, t = 0]) => [e + adv[0] * s + up[0] * t, f + adv[1] * s + up[1] * t] as const);
    return {
      x0: Math.min(...corners.map((p) => p[0])),
      y0: Math.min(...corners.map((p) => p[1])),
      x1: Math.max(...corners.map((p) => p[0])),
      y1: Math.max(...corners.map((p) => p[1])),
    };
  });

  const horizontal = Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && a > 0;
  return { chars, boxes, horizontal, baseline: f, x0: e, x1: e + item.width, size };
}

function toSegment(chars: string[], boxes: Rect[]): TextSegment {
  return {
    text: chars.join(""),
    bbox: unionRect(boxes) ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
    charBoxes: boxes,
    confidence: 1,
    source: "pdf",
  };
}

/** 横書きの片を、行ごとに分ける(上の行から順) */
function groupLines(runs: Run[]): Run[][] {
  const sorted = [...runs].sort((p, q) => q.baseline - p.baseline || p.x0 - q.x0);
  const lines: Run[][] = [];
  for (const run of sorted) {
    const line = lines.find((l) => {
      const first = l[0];
      if (!first) return false;
      const tolerance = LAYOUT_SETTINGS.sameLineTolerance * Math.min(first.size, run.size);
      return Math.abs(first.baseline - run.baseline) <= tolerance;
    });
    if (line) line.push(run);
    else lines.push([run]);
  }
  for (const line of lines) line.sort((p, q) => p.x0 - q.x0);
  return lines;
}

/** 1行の片を、間隔と文字の大きさの変化を見てセルに分ける */
function splitCells(line: Run[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let chars: string[] = [];
  let boxes: Rect[] = [];
  let previous: Run | null = null;

  for (const run of line) {
    if (previous) {
      const gap = run.x0 - previous.x1;
      const size = Math.min(previous.size, run.size);
      const sizeRatio = Math.max(previous.size, run.size) / size;
      const fontChanged = sizeRatio > LAYOUT_SETTINGS.fontSizeChange;
      const newCell = gap > LAYOUT_SETTINGS.cellGap * size || (fontChanged && gap > LAYOUT_SETTINGS.cellGapOnFontChange * size);
      if (newCell) {
        segments.push(toSegment(chars, boxes));
        chars = [];
        boxes = [];
      } else if (gap > LAYOUT_SETTINGS.spaceGap * size) {
        // 間の空白も1文字として扱い、その長方形は片と片の間にする
        const y0 = Math.min(previous.boxes.at(-1)?.y0 ?? 0, run.boxes[0]?.y0 ?? 0);
        const y1 = Math.max(previous.boxes.at(-1)?.y1 ?? 0, run.boxes[0]?.y1 ?? 0);
        chars.push(" ");
        boxes.push({ x0: previous.x1, y0, x1: run.x0, y1 });
      }
    }
    chars.push(...run.chars);
    boxes.push(...run.boxes);
    previous = run;
  }
  if (chars.length > 0) segments.push(toSegment(chars, boxes));
  return segments;
}

/** 縦書きとみなす、縦に並んだ1文字の片の最小の数 */
const MIN_VERTICAL_CHARS = 3;

/**
 * 縦に1文字ずつ並んだ片(縦書きのラベル「支払を受ける者」など)を、上から順に1つにまとめる。
 * 行に分ける前に取り出しておかないと、同じ高さにある横書きの片と同じ行になってしまう。
 */
function extractVertical(runs: Run[]): { vertical: TextSegment[]; rest: Run[] } {
  const singles = runs.filter((r) => r.horizontal && r.chars.length === 1);
  const sorted = [...singles].sort((p, q) => p.x0 - q.x0 || q.baseline - p.baseline);
  const vertical: TextSegment[] = [];
  const used = new Set<Run>();
  let column: Run[] = [];

  const flush = () => {
    if (column.length >= MIN_VERTICAL_CHARS) {
      vertical.push(
        toSegment(
          column.flatMap((r) => r.chars),
          column.flatMap((r) => r.boxes),
        ),
      );
      for (const r of column) used.add(r);
    }
    column = [];
  };

  for (const run of sorted) {
    const last = column.at(-1);
    const step = last ? last.baseline - run.baseline : 0;
    const continues =
      last !== undefined &&
      Math.abs(last.x0 - run.x0) < 0.2 * run.size &&
      Math.abs(last.size - run.size) < 0.2 * run.size &&
      step > 0.5 * run.size &&
      step < 1.3 * run.size;
    if (!continues) flush();
    column.push(run);
  }
  flush();
  return { vertical, rest: runs.filter((r) => !used.has(r)) };
}

/**
 * getTextContent の結果を、行・セル単位の文字列にまとめる。
 * 結果は上から下、左から右の順。
 */
export function layoutText(items: readonly TextItemLike[], styles: Record<string, FontStyleLike | undefined>): TextSegment[] {
  const runs = items.map((item) => toRun(item, styles)).filter((r): r is Run => r !== null);
  const { vertical, rest } = extractVertical(runs);
  const lineSegments = groupLines(rest.filter((r) => r.horizontal)).flatMap(splitCells);
  // 回転した文字(横書きでない片)は、片ごとに1つの文字列にする
  const rotated = rest.filter((r) => !r.horizontal).map((r) => toSegment(r.chars, r.boxes));
  return [...lineSegments, ...vertical, ...rotated].sort((p, q) => q.bbox.y1 - p.bbox.y1 || p.bbox.x0 - q.bbox.x0);
}
