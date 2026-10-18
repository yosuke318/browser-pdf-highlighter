import type { FieldType } from "../schema/fields.ts";
import { normalizeForDisplay } from "../text/normalize.ts";

// 抽出結果の一覧に出す値の書き方。

function formatScalar(type: FieldType, value: unknown): string {
  if (value === undefined || value === null) return "";
  switch (type) {
    case "money":
      return typeof value === "number" ? `${value.toLocaleString("ja-JP")} 円` : String(value);
    case "year":
      return `${String(value)}年`;
    case "boolean":
      return value ? "あり" : "なし";
    default:
      return String(value);
  }
}

/** 一覧(list 型)の1行を「見本ファイナンス / 自動車ローン / 1,200,000 円」のように書く */
function formatRow(row: unknown): string {
  if (typeof row !== "object" || row === null) return String(row);
  return Object.values(row as Record<string, unknown>)
    .map((v) => (typeof v === "number" ? `${v.toLocaleString("ja-JP")}` : String(v)))
    .join(" / ");
}

export function formatValue(type: FieldType, value: unknown): string {
  if (type === "list") return Array.isArray(value) ? value.map(formatRow).join("\n") : "";
  return formatScalar(type, value);
}

/**
 * PDFに書かれていた表記。値と見た目が違うとき(和暦の日付・万円の金額など)だけ返す
 */
export function originalNotation(type: FieldType, value: unknown, rawText: string | undefined): string | null {
  if (!rawText || type === "list") return null;
  // 文字列以外は、字間の空白(「令 和 7 年」)を詰めて出す
  const raw = type === "text" ? normalizeForDisplay(rawText) : normalizeForDisplay(rawText).replace(/\s+/g, "");
  const shown = formatValue(type, value);
  const compact = (s: string) => s.replace(/[\s,円]/g, "");
  return compact(raw) === compact(shown) ? null : raw;
}

/** 手で直すときの、入力欄に最初に入れておく文字列 */
export function editableText(type: FieldType, value: unknown, rawText: string | undefined): string {
  if (value === undefined) return "";
  if (type === "money" && typeof value === "number") return value.toLocaleString("ja-JP");
  if (type === "text" && typeof value === "string") return value;
  return rawText ? normalizeForDisplay(rawText) : String(value);
}

/** 入力が型に合わないときの説明 */
export const INVALID_INPUT: Record<FieldType, string> = {
  text: "文字を入力してください。",
  date: "日付として読めませんでした(例: 1988-04-15、昭和63年4月15日)。",
  yearMonth: "年月として読めませんでした(例: 2011-04、平成23年4月)。",
  year: "年として読めませんでした(例: 2025、令和7年)。",
  money: "金額として読めませんでした(例: 5,800,000、580万円)。",
  number: "数として読めませんでした。",
  boolean: "「あり」か「なし」を入力してください。",
  list: "表の項目は、ここでは直せません。",
};
