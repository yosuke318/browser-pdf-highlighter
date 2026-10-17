import type { ExtractionResult, FieldResult } from "../extract/engine.ts";
import { normalizeForDisplay } from "../text/normalize.ts";
import type { Rect } from "../text/types.ts";
import { categoryOf, type HighlightCategory } from "./categories.ts";

// PDF上に描くハイライトの形。抽出結果のハイライトと、差分のハイライト(前回資料との比較)の両方を表す。

/** 差分の判定(docs/extraction-fields.md の「4. 差分の判定ルール」) */
export type DiffStatus = "changed" | "added" | "removed" | "notation" | "uncomparable" | "same";

export type HighlightKind = { type: "field"; category: HighlightCategory } | { type: "diff"; status: DiffStatus };

export interface Highlight {
  /** 画面の中で一意な ID(項目のキーなど) */
  id: string;
  page: number;
  /** PDFページ座標の長方形。値が複数のセルに分かれていれば、セルごと */
  rects: Rect[];
  kind: HighlightKind;
  /** 読み上げ・ツールチップに使う説明(「支払金額(年収): 5,800,000」など) */
  label: string;
  /** 読み取りの確からしさが低い(OCR で読んだ値など)。波線の下線で目立たせる */
  lowConfidence?: boolean;
}

/** これより確からしさが低い値は、要確認として表示する */
export const LOW_CONFIDENCE = 0.8;

/** 抽出結果のうち、指定したページにある値のハイライト */
export function highlightsFromExtraction(result: ExtractionResult, page: number): Highlight[] {
  const labels = new Map(result.fields.map((f) => [f.key, f.label]));
  return result.fields
    .filter((f) => f.found && f.page === page && f.bbox.length > 0)
    .map((f) => ({
      id: f.key,
      page,
      rects: f.bbox,
      kind: { type: "field", category: categoryOf(f.key) },
      // ほかの項目から計算した値は、PDFに書かれていないので、計算した値ともとの項目を出す
      label: f.derivedFrom
        ? `${f.label}: ${String(f.value)}(${labels.get(f.derivedFrom) ?? f.derivedFrom}から計算)`
        : `${f.label}: ${displayValue(f)}`,
      lowConfidence: (f.confidence ?? 1) < LOW_CONFIDENCE,
    }));
}

/**
 * 説明に出す値。金額は、1桁ずつのマス目や「120」「万円」のように分かれて書かれていても読みやすいよう、
 * 値から「9,600,000円」の形にする。それ以外は、PDFに書かれているとおりの文字列を、康熙部首などを通常の文字にして出す
 */
function displayValue(f: FieldResult): string {
  if (f.type === "money" && typeof f.value === "number") return `${f.value.toLocaleString("ja-JP")}円`;
  return normalizeForDisplay(f.rawText ?? String(f.value));
}

/** PDF座標の長方形を、画面上の長方形(左上が原点、単位は CSS px)に変換する関数 */
export type ToScreen = (rect: Rect) => { left: number; top: number; width: number; height: number };

/**
 * 蛍光ペンを引く向き(画面上で、文字の上から下へ向かう向き)。
 * ページが回転していると文字の上下の向きも変わるので、塗る範囲の向きを合わせる
 */
export function markerDirection(rotation: number): "to-bottom" | "to-left" | "to-top" | "to-right" {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return "to-left";
    case 180:
      return "to-top";
    case 270:
      return "to-right";
    default:
      return "to-bottom";
  }
}
