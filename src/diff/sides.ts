import type { ExportedExtraction } from "../results/export.ts";
import type { ReviewedField } from "../results/review.ts";
import type { ComparisonSide, SideValue } from "./compare-fields.ts";

// 比べる片方の書類を、画面の抽出結果(確認・修正を反映したもの)や、書き出したJSONから作る。

/** 画面の抽出結果から作る。readable は、その書類に文字を読み取れたページがあったか */
export function sideFromReviewed(items: readonly ReviewedField[], readable: boolean): ComparisonSide {
  const values: Record<string, SideValue> = {};
  for (const item of items) {
    if (item.status === "missing" || item.value === undefined) continue;
    values[item.field.key] = {
      value: item.value,
      rawText: item.rawText,
      confirmed: item.status === "confirmed" || item.status === "edited",
      source: item.status === "edited" && !item.field.found ? "manual" : (item.field.source ?? "pdf"),
      page: item.page,
      bbox: item.bbox,
    };
  }
  return { values, readable };
}

/** 前回書き出したJSONから作る。JSONには読み取れなかった欄が入らないので、読み取れたものとして扱う */
export function sideFromExported(exported: ExportedExtraction): ComparisonSide {
  const values: Record<string, SideValue> = {};
  for (const [key, f] of Object.entries(exported.fields)) {
    values[key] = {
      value: f.value,
      rawText: f.rawText,
      confirmed: f.confirmed,
      source: f.source,
      page: f.page,
      bbox: f.bbox ? [{ x0: f.bbox[0], y0: f.bbox[1], x1: f.bbox[2], y1: f.bbox[3] }] : undefined,
    };
  }
  return { values, readable: true };
}
