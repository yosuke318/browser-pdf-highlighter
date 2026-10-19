import { normalCharRatio } from "../text/char-class.ts";

// ページの種類の自動判別。docs/document-formats.md の「0-1. 自動判別の方針」を実装したもの。
// pdf.js 本体には依存せず、getTextContent と getOperatorList の結果だけを受け取る。

/** 判別のしきい値。サンプルで調整できるように、ここにまとめる */
export const PAGE_KIND_SETTINGS = {
  /** これ以上の文字数(空白を除く)があれば、文字データのあるページとみなす */
  minTextChars: 20,
  /** 画像がページ面積に占める割合がこれ以上なら、スキャンしたページとみなす */
  minImageCoverage: 0.8,
  /** 正常な文字の割合がこれより低ければ、文字化けとみなす */
  minNormalCharRatio: 0.7,
} as const;

export type PageKindSettings = { [K in keyof typeof PAGE_KIND_SETTINGS]: number };

/**
 * ページの種類
 * - text: テキストPDF(pdf.js で取り出した文字をそのまま使う)
 * - scanned: スキャンPDF(画像だけで文字データがない)
 * - searchable: 透明テキスト付きPDF(サーチャブルPDF。画像の上に見えない文字がある)
 * - overlay: 画像の上に見える文字を重ねたPDF。様式(罫線・欄の名前)が画像で、値だけが文字になっている
 *   電子交付の源泉徴収票などがこの形。欄の名前を OCR で読み、値は PDF の文字を使う
 *   (PDF の文字だけで書類の種類が分かるときは、テキストPDFと同じく PDF の文字だけを使う。read-page.ts)
 * - garbled: 文字化けしたテキストPDF
 * - other: 上のどれにも当てはまらないページ(白紙に近いページなど)
 */
export type PageKind = "text" | "scanned" | "searchable" | "overlay" | "garbled" | "other";

/** 文字をどの方法で読み取るか */
export type ReadMethod = "pdf" | "ocr";

export interface PageStats {
  /** 空白を除いた文字数 */
  textChars: number;
  /** 最も大きい画像がページ面積に占める割合(0〜1) */
  imageCoverage: number;
  /** 描画される文字がすべて透明(描画モード 3)か。文字がなければ false */
  allTextInvisible: boolean;
  /** 空白を除いた文字のうち、正常な文字の割合(0〜1) */
  normalCharRatio: number;
}

export interface PageClassification {
  kind: PageKind;
  /** 自動で選んだ読み取り方法。テキストPDF以外は OCR */
  method: ReadMethod;
  stats: PageStats;
}

export function classifyPage(stats: PageStats, settings: PageKindSettings = PAGE_KIND_SETTINGS): PageClassification {
  const hasText = stats.textChars >= settings.minTextChars;
  const coveredByImage = stats.imageCoverage >= settings.minImageCoverage;
  let kind: PageKind;
  if (coveredByImage && stats.textChars > 0 && stats.allTextInvisible) kind = "searchable";
  else if (coveredByImage && !hasText) kind = "scanned";
  else if (hasText && stats.normalCharRatio < settings.minNormalCharRatio) kind = "garbled";
  else if (coveredByImage && hasText) kind = "overlay";
  else if (hasText) kind = "text";
  else kind = "other";
  return { kind, method: kind === "text" ? "pdf" : "ocr", stats };
}

// ---- getOperatorList の結果から、画像の割合と透明な文字を調べる ----

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  // m を適用した後に、現在の座標系 n を適用する(PDF の cm 演算子と同じ順)
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((v) => typeof v === "number");
}

/** 画像の描画は、単位正方形 (0,0)-(1,1) を現在の座標系で変換した範囲に描かれる */
function unitSquareArea(m: Matrix, view: readonly [number, number, number, number]): number {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  // ページからはみ出した部分は数えない
  const x0 = Math.max(Math.min(...xs), view[0]);
  const x1 = Math.min(Math.max(...xs), view[2]);
  const y0 = Math.max(Math.min(...ys), view[1]);
  const y1 = Math.min(Math.max(...ys), view[3]);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/** pdf.js の OPS のうち、ここで使うもの */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  setTextRenderingMode: number;
  showText: number;
  showSpacedText: number;
  nextLineShowText: number;
  nextLineSetSpacingShowText: number;
}

export interface OperatorStats {
  imageCoverage: number;
  /** 文字を描く命令のうち、見える文字・透明な文字を描いた回数 */
  visibleTextOps: number;
  invisibleTextOps: number;
}

const INVISIBLE_TEXT_MODE = 3;

/**
 * getOperatorList の結果から、画像の割合と透明な文字の有無を求める。
 * view はページの範囲 [x0, y0, x1, y1](page.view)
 */
export function analyzeOperators(
  fnArray: readonly number[],
  argsArray: readonly unknown[],
  ops: OpCodes,
  view: readonly [number, number, number, number],
): OperatorStats {
  const pageArea = (view[2] - view[0]) * (view[3] - view[1]);
  const imageOps = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject]);
  const textOps = new Set([ops.showText, ops.showSpacedText, ops.nextLineShowText, ops.nextLineSetSpacingShowText]);

  let ctm: Matrix = IDENTITY;
  let textMode = 0;
  const stack: { ctm: Matrix; textMode: number }[] = [];
  let maxImageArea = 0;
  let visibleTextOps = 0;
  let invisibleTextOps = 0;

  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === ops.save) {
      stack.push({ ctm, textMode });
    } else if (fn === ops.restore) {
      const saved = stack.pop();
      if (saved) ({ ctm, textMode } = saved);
    } else if (fn === ops.transform) {
      if (isMatrix(args)) ctm = multiply(args, ctm);
    } else if (fn === ops.paintFormXObjectBegin) {
      // フォーム(再利用される描画のまとまり)の中は、フォームの座標系で描かれる
      stack.push({ ctm, textMode });
      const matrix = Array.isArray(args) ? args[0] : undefined;
      if (isMatrix(matrix)) ctm = multiply(matrix, ctm);
    } else if (fn === ops.paintFormXObjectEnd) {
      const saved = stack.pop();
      if (saved) ({ ctm, textMode } = saved);
    } else if (imageOps.has(fn)) {
      maxImageArea = Math.max(maxImageArea, unitSquareArea(ctm, view));
    } else if (fn === ops.setTextRenderingMode) {
      const mode = Array.isArray(args) ? args[0] : undefined;
      if (typeof mode === "number") textMode = mode;
    } else if (textOps.has(fn)) {
      if (textMode === INVISIBLE_TEXT_MODE) invisibleTextOps++;
      else visibleTextOps++;
    }
  });

  return {
    imageCoverage: pageArea > 0 ? Math.min(1, maxImageArea / pageArea) : 0,
    visibleTextOps,
    invisibleTextOps,
  };
}

export function pageStats(text: string, operators: OperatorStats): PageStats {
  const compact = text.replace(/\s/gu, "");
  return {
    textChars: [...compact].length,
    imageCoverage: operators.imageCoverage,
    allTextInvisible: operators.invisibleTextOps > 0 && operators.visibleTextOps === 0,
    normalCharRatio: normalCharRatio(compact),
  };
}
