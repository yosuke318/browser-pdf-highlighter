import type { PageReading } from "../pdf/read-page.ts";

// 書類ごとの抽出処理の登録先。
// 抽出ルール(書類定義)を作ったら、書類ID(schema/extraction-fields.json の documents[].id)で登録する。
// 登録すると、リグレッションテスト(src/regression/extraction.test.ts)が、
// ダミーPDFから抽出した値を正解データ(samples/<書類ID>/expected.json)と自動で突き合わせる。

/** 抽出した値。キーと値の形は正解データ(expected.json の values)と同じ */
export type ExtractedValues = Record<string, unknown>;

/**
 * 1つの書類(PDFのページの読み取り結果)から、項目の値を抽出する。
 * 読み取れなかった項目は入れない(推測で埋めない)
 */
export type DocumentExtractor = (pages: readonly PageReading[]) => ExtractedValues;

export const EXTRACTORS: Readonly<Partial<Record<string, DocumentExtractor>>> = {};
