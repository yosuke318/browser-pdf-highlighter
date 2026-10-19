import type { Rect, TextSegment } from "../text/types.ts";
import { type GrayImage, preprocess, toGray, unrotatePoint } from "./preprocess.ts";
import { type OcrLine, ocrLinesToSegments, type PixelToPdf } from "./segments.ts";

// 1ページ分の OCR の流れ(ブラウザにもNode.jsにも依存しない部分)。
// 描画したページの画像 → 前処理 → 文字認識 → PDFページ座標の TextSegment

/** OCR のためにページを描画するときの解像度 */
export const OCR_DPI = 300;

/** 描画したページの画像 */
export interface RenderedPage {
  /** RGBA の画素(canvas の getImageData の data) */
  rgba: ArrayLike<number>;
  width: number;
  height: number;
  dpi: number;
  /** この画像の画素の位置を、PDFページ座標に変える関数 */
  toPdf: PixelToPdf;
}

/** 前処理した画像から、行と文字を認識する関数(tesseract.js などの実装を渡す) */
export type Recognize = (image: GrayImage) => Promise<OcrLine[]>;

export interface OcrReading {
  segments: TextSegment[];
  /** 補正したスキャンの傾き(度) */
  skewDegrees: number;
  /** 画像の中の、表の縦の罫線(PDFページ座標)。同じ枠の中にある文字かどうかを調べるのに使う */
  separators: Rect[];
  /** 前処理と文字認識にかかった時間(ミリ秒) */
  elapsedMs: number;
}

export async function ocrRenderedPage(page: RenderedPage, recognize: Recognize): Promise<OcrReading> {
  const started = performance.now();
  const { image, skewDegrees, verticalLines } = preprocess(toGray(page.rgba, page.width, page.height), page.dpi);
  const lines = await recognize(image);
  // 傾きを補正した画像の位置 → 描画した画像の位置 → PDFページ座標
  const toPdf: PixelToPdf = (x, y) => {
    const [ox, oy] = unrotatePoint(x, y, -skewDegrees, image.width, image.height);
    return page.toPdf(ox, oy);
  };
  const separators = verticalLines.map((line): Rect => {
    const corners = [toPdf(line.x0, line.y0), toPdf(line.x1, line.y0), toPdf(line.x0, line.y1), toPdf(line.x1, line.y1)];
    return {
      x0: Math.min(...corners.map((c) => c[0])),
      y0: Math.min(...corners.map((c) => c[1])),
      x1: Math.max(...corners.map((c) => c[0])),
      y1: Math.max(...corners.map((c) => c[1])),
    };
  });
  return {
    segments: ocrLinesToSegments(lines, toPdf, verticalLines),
    skewDegrees,
    separators,
    elapsedMs: Math.round(performance.now() - started),
  };
}
