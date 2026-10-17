import type { PDFPageProxy } from "pdfjs-dist";
import type { TextSegment } from "../text/types.ts";
import { analyzeOperators, classifyPage, type OpCodes, type PageClassification, pageStats } from "./page-kind.ts";
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
  return {
    pageNumber: page.pageNumber,
    view: [x0, y0, x1, y1],
    classification: classifyPage(pageStats(text, operators)),
    pdfSegments: layoutText(items, styles),
  };
}
