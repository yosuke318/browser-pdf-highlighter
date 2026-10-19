import type { PDFPageProxy } from "pdfjs-dist";
import { guessDocumentType } from "../classify/document-type.ts";
import type { OcrReading } from "../ocr/ocr-page.ts";
import { mergeOverlay } from "../ocr/overlay.ts";
import type { TextSegment } from "../text/types.ts";
import {
  analyzeOperators,
  classifyPage,
  type OpCodes,
  type PageClassification,
  pageStats,
  type ReadMethod,
} from "./page-kind.ts";
import { type FontStyleLike, layoutText, type TextItemLike } from "./text-layout.ts";

// 1ページ分の読み取り: ページの種類の判別と、pdf.js による文字と座標の取り出し。
// pdf.js の OPS はブラウザ用と Node.js 用(テスト)でモジュールが違うので、引数で受け取る。

export interface PageReading {
  pageNumber: number;
  /** ページの範囲 [x0, y0, x1, y1](PDFページ座標。page.view) */
  view: [number, number, number, number];
  classification: PageClassification;
  /**
   * pdf.js で取り出した文字(行・セル単位)。
   * 判別結果が OCR のページでは使わない(透明テキストや文字化けした文字が入っていることがある)
   */
  pdfSegments: TextSegment[];
  /** OCR で読み取った結果。OCR がまだ終わっていないページ、OCR しないページでは undefined */
  ocr?: OcrReading;
}

/**
 * 読み取り方法に応じて、後続の処理(抽出ルール・書類タイプの判定・範囲選択)に使う文字を選ぶ。
 * - pdf.js で読むページは、pdf.js の文字
 * - OCR で読むページは、OCR の結果(OCR がまだ終わっていなければ空)
 * - 画像の様式に値の文字を重ねたページ(overlay)を OCR で読むときは、PDF の文字(値)と、
 *   それと重ならない OCR の文字(欄の名前)を合わせたもの。OCR がまだ終わっていなければ PDF の文字だけ
 */
export function pageSegments(reading: PageReading, method: ReadMethod): TextSegment[] {
  if (method === "pdf") return reading.pdfSegments;
  if (reading.classification.kind === "overlay") {
    return mergeOverlay(reading.pdfSegments, reading.ocr?.segments ?? [], reading.ocr?.separators ?? []);
  }
  return reading.ocr?.segments ?? [];
}

export async function readPage(page: PDFPageProxy, ops: OpCodes): Promise<PageReading> {
  const [content, operatorList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
  // items には文字列のほかに、構造の区切り(マーク付きコンテンツ)が混ざるので、文字列だけを取り出す
  const items: TextItemLike[] = [];
  for (const item of content.items) if ("str" in item) items.push(item);
  const styles: Record<string, FontStyleLike | undefined> = content.styles;
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
  const operators = analyzeOperators(operatorList.fnArray, operatorList.argsArray, ops, [x0, y0, x1, y1]);
  const text = items.map((item) => item.str).join("");
  const classification = classifyPage(pageStats(text, operators));
  const pdfSegments = layoutText(items, styles);
  // 画像の上に文字を重ねたページでも、PDF の文字だけで書類の種類が分かるなら、欄の名前も文字として
  // 入っている(背景に画像を敷いた普通の書類)。その場合は OCR せず、テキストPDFと同じく PDF の文字を使う
  if (classification.kind === "overlay" && guessDocumentType(pdfSegments).documentId !== null) {
    classification.method = "pdf";
  }
  return { pageNumber: page.pageNumber, view: [x0, y0, x1, y1], classification, pdfSegments };
}
