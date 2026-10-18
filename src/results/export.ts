import { findDocument, isRecord, matchesType } from "../schema/fields.ts";
import { type Rect, unionRect } from "../text/types.ts";
import type { ReviewedField } from "./review.ts";

// 抽出結果の書き出し(JSON)と読み込み。形は docs/extraction-fields.md の「5. 出力形式」のとおり。
// 書き出したファイルは、次回「前回の資料」として読み込み、PDFを読み直さずに差分を取るのに使う。

export const FORMAT_VERSION = "0.1.0";

export interface ExportedField {
  value: unknown;
  rawText?: string;
  page?: number;
  /** PDFページ上の位置 [左下x, 左下y, 右上x, 右上y](ポイント)。セルに分かれた値は全体を囲む長方形 */
  bbox?: [number, number, number, number];
  /** 文字の取り方。"manual" は利用者が手で入力した値 */
  source: "pdf" | "ocr" | "manual";
  confidence?: number;
  /** 人が画面で確認・修正したか */
  confirmed: boolean;
  /** 手で直した値なら true。もとの値は originalValue に残す */
  edited?: true;
  originalValue?: unknown;
}

export interface ExportedExtraction {
  formatVersion: string;
  documentType: string;
  fileName: string;
  /** ISO 8601 の日時 */
  extractedAt: string;
  fields: Record<string, ExportedField>;
}

function toBbox(rects: readonly Rect[]): ExportedField["bbox"] {
  const r = unionRect(rects);
  return r ? ([r.x0, r.y0, r.x1, r.y1].map((n) => Math.round(n * 10) / 10) as [number, number, number, number]) : undefined;
}

/**
 * 確認・修正を反映した抽出結果を、書き出す形にする。見つからなかった項目(手でも入れていない項目)は入れない
 */
export function toExportedExtraction(
  documentType: string,
  fileName: string,
  fields: readonly ReviewedField[],
  extractedAt: Date,
): ExportedExtraction {
  const out: Record<string, ExportedField> = {};
  for (const f of fields) {
    if (f.status === "missing" || f.value === undefined) continue;
    const edited = f.status === "edited";
    out[f.field.key] = {
      value: f.value,
      rawText: f.rawText,
      page: f.page,
      bbox: toBbox(f.bbox),
      source: edited && !f.field.found ? "manual" : (f.field.source ?? "pdf"),
      confidence: edited ? undefined : f.field.confidence,
      confirmed: f.status === "confirmed" || edited,
      ...(edited && f.original
        ? { edited: true as const, originalValue: f.original.value }
        : edited
          ? { edited: true as const }
          : {}),
    };
  }
  return { formatVersion: FORMAT_VERSION, documentType, fileName, extractedAt: extractedAt.toISOString(), fields: out };
}

/** 書き出すときのファイル名(「源泉徴収票_2025.pdf」→「源泉徴収票_2025.withholding-slip.json」) */
export function exportFileName(pdfName: string, documentType: string): string {
  return `${pdfName.replace(/\.pdf$/i, "")}.${documentType}.json`;
}

function toTuple(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const [a, b, c, d] = value;
  return typeof a === "number" && typeof b === "number" && typeof c === "number" && typeof d === "number"
    ? [a, b, c, d]
    : undefined;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * 書き出したJSONを読み込む。形が違うものや、抽出項目の定義に合わない値は ImportError にする
 */
export function parseExportedExtraction(text: string): ExportedExtraction {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("JSONとして読めませんでした。");
  }
  if (!isRecord(raw)) throw new ImportError("抽出結果のファイルではありません。");
  const { formatVersion, documentType, fileName, extractedAt, fields } = raw;
  if (typeof formatVersion !== "string" || formatVersion.split(".")[0] !== FORMAT_VERSION.split(".")[0]) {
    throw new ImportError("このアプリで書き出した抽出結果のファイルではないか、形式の版が違います。");
  }
  if (typeof documentType !== "string") throw new ImportError("書類の種類が書かれていません。");
  const definition = findDocument(documentType);
  if (!definition) throw new ImportError(`知らない書類の種類です: ${documentType}`);
  if (typeof fileName !== "string" || typeof extractedAt !== "string" || !isRecord(fields)) {
    throw new ImportError("抽出結果のファイルの形が違います。");
  }
  const types = new Map(definition.fields.map((f) => [f.key, f.type]));
  const parsed: Record<string, ExportedField> = {};
  for (const [key, value] of Object.entries(fields)) {
    const type = types.get(key);
    if (!type) throw new ImportError(`「${definition.title}」にない項目があります: ${key}`);
    if (!isRecord(value) || !matchesType(type, value.value) || typeof value.confirmed !== "boolean") {
      throw new ImportError(`項目「${key}」の値の形が違います。`);
    }
    const bbox = toTuple(value.bbox);
    const source = value.source;
    parsed[key] = {
      value: value.value,
      rawText: typeof value.rawText === "string" ? value.rawText : undefined,
      page: typeof value.page === "number" ? value.page : undefined,
      bbox,
      source: source === "ocr" || source === "manual" ? source : "pdf",
      confidence: typeof value.confidence === "number" ? value.confidence : undefined,
      confirmed: value.confirmed,
      ...(value.edited === true ? { edited: true as const, originalValue: value.originalValue } : {}),
    };
  }
  return { formatVersion, documentType, fileName, extractedAt, fields: parsed };
}
