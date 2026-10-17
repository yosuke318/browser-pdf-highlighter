import type { FieldDefinition, FieldType } from "../schema/fields.ts";
import { groupLines } from "../text/lines.ts";
import { normalizeText } from "../text/normalize.ts";
import type { TextSegment } from "../text/types.ts";
import { parseDate, parseMoney, parseYear } from "../text/values.ts";

// 正解データの値が、PDFから取り出した文字の中に見つかるかを調べる。
// 抽出ルールの前段(文字の取り出し・正規化)のリグレッションテストに使う。
// 「どの欄の値か」までは見ないので、見つかっても抽出できるとは限らないが、
// 見つからなければ抽出ルールをどう書いても取れない、という目安になる。

export type FindResult = "found" | "not-found" | "not-checked";

/** 1行分の、正規化したセルの配列。セルをつなげた文字列も候補にして、セルをまたいだ値も探せるようにする */
interface LineText {
  /** セルごとの正規化した文字列 */
  cells: string[];
}

const MONEY_TOKEN = /[△▲-]?[¥\\]?\d[\d,]*(?:\.\d+)?(?:万円|千円|万|千|円)?/g;
const ERA = "令和|平成|昭和|大正|明治|[令平昭大明RHSTM]";
const DATE_TOKEN = new RegExp(
  `(?:${ERA})(?:元|\\d{1,2})[年./-]\\d{1,2}[月./-]\\d{1,2}日?|\\d{4}[年./-]\\d{1,2}[月./-]\\d{1,2}日?`,
  "gi",
);
const YEAR_MONTH_TOKEN = new RegExp(`((?:${ERA})(?:元|\\d{1,2})|\\d{4})年(\\d{1,2})月`, "gi");
const YEAR_TOKEN = new RegExp(`(?:${ERA})(?:元|\\d{1,2})年(?:分|度)?|\\d{4}年(?:分|度)?`, "gi");

function lineTexts(segments: readonly TextSegment[]): LineText[] {
  return groupLines(segments).map((line) => ({ cells: line.segments.map((s) => normalizeText(s.text).text) }));
}

/** 1行の中で探す文字列の候補: 各セルと、セルをつなげた行全体 */
function haystacks(line: LineText): string[] {
  return [...line.cells, line.cells.join("")];
}

function findIn(lines: LineText[], test: (text: string) => boolean): boolean {
  return lines.some((line) => haystacks(line).some(test));
}

function tokens(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

function yearMonthOf(text: string): string[] {
  return [...text.matchAll(YEAR_MONTH_TOKEN)].flatMap((m) => {
    const year = parseYear(`${m[1] ?? ""}年`);
    const month = Number(m[2]);
    return year && month >= 1 && month <= 12 ? [`${year}-${String(month).padStart(2, "0")}`] : [];
  });
}

function findScalar(type: FieldType, expected: unknown, lines: LineText[]): FindResult {
  switch (type) {
    case "text": {
      if (typeof expected !== "string") return "not-checked";
      const target = normalizeText(expected).text;
      return findIn(lines, (t) => t.includes(target)) ? "found" : "not-found";
    }
    case "money":
      return findIn(lines, (t) => tokens(t, MONEY_TOKEN).some((tok) => parseMoney(tok)?.yen === expected))
        ? "found"
        : "not-found";
    case "date":
      return findIn(lines, (t) => tokens(t, DATE_TOKEN).some((tok) => parseDate(tok)?.iso === expected)) ? "found" : "not-found";
    case "yearMonth":
      return findIn(lines, (t) => yearMonthOf(t).includes(String(expected))) ? "found" : "not-found";
    case "year":
      return findIn(lines, (t) => tokens(t, YEAR_TOKEN).some((tok) => parseYear(tok) === expected)) ? "found" : "not-found";
    case "number":
      // 単位の付いた数(「38歳」「15年」「35年」)として探す。単位のない数字は、どの欄の値か区別できないので数えない
      return findIn(lines, (t) => new RegExp(`(?<!\\d)${String(expected)}(歳|年|ヶ月|か月|人)`).test(t)) ? "found" : "not-found";
    default:
      // 真偽値(チェック欄の印など)は文字として探せない
      return "not-checked";
  }
}

/**
 * 正解データの各項目の値が、取り出した文字の中に見つかるかを調べる。
 * list 型の項目は「otherDebts[0].balance」のようなキーで1行ずつ調べる。
 */
export function findExpectedValues(
  fields: readonly FieldDefinition[],
  expected: ReadonlyMap<string, unknown>,
  segments: readonly TextSegment[],
): Record<string, FindResult> {
  const lines = lineTexts(segments);
  const result: Record<string, FindResult> = {};
  for (const field of fields) {
    const value = expected.get(field.key);
    if (value === undefined) continue;
    if (field.type === "list" && Array.isArray(value)) {
      value.forEach((row: unknown, i) => {
        if (typeof row !== "object" || row === null) return;
        for (const item of field.items ?? []) {
          const v = (row as Record<string, unknown>)[item.key];
          if (v !== undefined) result[`${field.key}[${i}].${item.key}`] = findScalar(item.type, v, lines);
        }
      });
    } else {
      result[field.key] = findScalar(field.type, value, lines);
    }
  }
  return result;
}
