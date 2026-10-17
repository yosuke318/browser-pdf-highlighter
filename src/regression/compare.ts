import { type FieldDefinition, type FieldType, flattenValues, isRecord } from "../schema/fields.ts";
import { normalizeText } from "../text/normalize.ts";

// 抽出結果と正解データを、項目ごとに突き合わせる。

/**
 * - match: 一致
 * - mismatch: 値が違う(誤った値を取っている。抽出できないことより悪い)
 * - missing: 正解データにはあるが、抽出できなかった
 * - unexpected: 正解データにない項目を抽出した
 */
export type FieldStatus = "match" | "mismatch" | "missing" | "unexpected";

export interface FieldComparison {
  key: string;
  status: FieldStatus;
  expected?: unknown;
  actual?: unknown;
}

/** 文字列は正規化(空白・全角半角・康熙部首の違いをなくす)してから比べる。それ以外は値そのもので比べる */
function sameValue(type: FieldType, expected: unknown, actual: unknown): boolean {
  if (type === "text" && typeof expected === "string" && typeof actual === "string") {
    return normalizeText(expected).text === normalizeText(actual).text;
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function compareScalar(key: string, type: FieldType, expected: unknown, actual: unknown): FieldComparison {
  if (expected === undefined) return { key, status: "unexpected", actual };
  if (actual === undefined || actual === null) return { key, status: "missing", expected };
  return sameValue(type, expected, actual)
    ? { key, status: "match", expected, actual }
    : { key, status: "mismatch", expected, actual };
}

export function compareValues(
  fields: readonly FieldDefinition[],
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): FieldComparison[] {
  const exp = flattenValues(expected);
  const act = flattenValues(actual);
  const results: FieldComparison[] = [];
  for (const field of fields) {
    const e = exp.get(field.key);
    const a = act.get(field.key);
    if (e === undefined && a === undefined) continue;
    if (field.type === "list") {
      const eRows = Array.isArray(e) ? e : [];
      const aRows = Array.isArray(a) ? a : [];
      for (let i = 0; i < Math.max(eRows.length, aRows.length); i++) {
        const eRow: unknown = eRows[i];
        const aRow: unknown = aRows[i];
        for (const item of field.items ?? []) {
          const ev = isRecord(eRow) ? eRow[item.key] : undefined;
          const av = isRecord(aRow) ? aRow[item.key] : undefined;
          if (ev === undefined && av === undefined) continue;
          results.push(compareScalar(`${field.key}[${i}].${item.key}`, item.type, ev, av));
        }
      }
    } else {
      results.push(compareScalar(field.key, field.type, e, a));
    }
  }
  const known = new Set(fields.map((f) => f.key));
  for (const [key, value] of act) {
    if (!known.has(key)) results.push({ key, status: "unexpected", actual: value });
  }
  return results;
}
