import type { PageReading } from "../pdf/read-page.ts";
import { type ExtractionPage, extractDocument, toValues } from "./engine.ts";
import { DOCUMENT_DEFINITIONS } from "./load-definitions.ts";

// 書類ごとの抽出処理。src/extract/definitions/ の書類定義から作る。
// リグレッションテスト(src/regression/extraction.test.ts)は、ここに登録された書類について、
// ダミーPDFから抽出した値を正解データ(samples/<書類ID>/expected.json)と自動で突き合わせる。

/** 抽出した値。キーと値の形は正解データ(expected.json の values)と同じ */
export type ExtractedValues = Record<string, unknown>;

/**
 * 1つの書類(PDFのページの読み取り結果)から、項目の値を抽出する。
 * 読み取れなかった項目は入れない(推測で埋めない)
 */
export type DocumentExtractor = (pages: readonly PageReading[]) => ExtractedValues;

/**
 * ページの読み取り結果から、ルールを当てはめる文字を選ぶ。
 * pdf.js で読むページだけを使う(OCR で読むページは、OCR に対応したら OCR の結果を使う)
 */
export function toExtractionPages(pages: readonly PageReading[]): ExtractionPage[] {
  return pages
    .filter((p) => p.classification.method === "pdf")
    .map((p) => ({ pageNumber: p.pageNumber, view: p.view, segments: p.pdfSegments }));
}

export const EXTRACTORS: Readonly<Partial<Record<string, DocumentExtractor>>> = Object.fromEntries(
  DOCUMENT_DEFINITIONS.map((rules) => [
    rules.id,
    (pages: readonly PageReading[]) => toValues(extractDocument(rules, toExtractionPages(pages))),
  ]),
);
