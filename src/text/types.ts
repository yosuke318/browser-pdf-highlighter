// 文字の取り出し方法(pdf.js / OCR)によらない、後続の処理(抽出ルール・ハイライト・差分)向けの共通の形。

/**
 * PDFページ座標の長方形。単位は pt、原点はページの左下で y は上向き(PDFの座標系そのもの)。
 * ページの /Rotate は反映しない。画面に表示するときは pdf.js の viewport で変換する。
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 行または表のセルひとつ分の文字列 */
export interface TextSegment {
  /** 取り出したままの文字列(正規化する前) */
  text: string;
  /** 文字列全体を囲む長方形 */
  bbox: Rect;
  /**
   * 1文字ごとの長方形。[...text](コードポイント単位)と同じ順・同じ数。
   * 正規化した後の文字位置から元の位置へ戻せば、任意の文字範囲の長方形を求められる
   */
  charBoxes: Rect[];
  /** 読み取りの確からしさ(0〜1)。pdf.js で取り出した文字は 1 */
  confidence: number;
  source: "pdf" | "ocr";
}

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    y0: Math.min(...rects.map((r) => r.y0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y1: Math.max(...rects.map((r) => r.y1)),
  };
}
