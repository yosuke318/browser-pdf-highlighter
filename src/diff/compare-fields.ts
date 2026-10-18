import type { DiffStatus } from "../highlight/highlights.ts";
import type { DocumentDefinition, FieldDefinition, FieldType } from "../schema/fields.ts";
import { compareKey } from "../text/compare-key.ts";
import { normalizeText } from "../text/normalize.ts";
import type { Rect } from "../text/types.ts";

// 前回と今回の抽出結果を、項目ごとに比べる。判定の規則は docs/extraction-fields.md の「4. 差分の判定ルール」のとおり。

/** 片方の書類の、1項目の値 */
export interface SideValue {
  value: unknown;
  rawText?: string;
  /** 人が確認・修正したか */
  confirmed: boolean;
  source: "pdf" | "ocr" | "manual";
  page?: number;
  bbox?: Rect[];
}

/** 比べる片方の書類 */
export interface ComparisonSide {
  /** 項目のキー → 値。見つからなかった項目は入れない */
  values: Readonly<Record<string, SideValue>>;
  /**
   * 文字を読み取れたか。OCR に対応するまでのスキャンPDFのように、文字が読めない書類では、
   * 値がない項目を「空欄」ではなく「比較できない」とする
   */
  readable: boolean;
}

export interface FieldDiff {
  /** 項目のキー。表の行は「otherDebts[見本ファイナンス/自動車ローン]」 */
  key: string;
  label: string;
  type: FieldType;
  status: DiffStatus;
  previous?: SideValue;
  current?: SideValue;
  /** 金額の増減 */
  delta?: { amount: number; percent: number | null };
  /** 補足の説明 */
  notes: string[];
  /** OCR で読んだ値で、まだ人が確認していない(判定に「要確認」を付ける) */
  needsCheck: boolean;
  priority: "high" | "normal";
}

export interface ComparisonResult {
  fields: FieldDiff[];
  /** 比較の前提についての注意(別の人の書類の可能性など) */
  warnings: string[];
  /** 対象年が違うときの「2024年 → 2025年」 */
  yearChange?: { from: unknown; to: unknown };
}

/** 元の文字列を、表記の違いを見るための形にする(空白・全角半角・康熙部首の違いは表記の違いとみなさない) */
function rawForm(side: SideValue): string {
  return normalizeText(side.rawText ?? String(side.value)).text;
}

function sameValue(type: FieldType, a: unknown, b: unknown): boolean {
  if (type === "text" && typeof a === "string" && typeof b === "string") return compareKey(a) === compareKey(b);
  return JSON.stringify(a) === JSON.stringify(b);
}

function needsCheck(side: SideValue | undefined): boolean {
  return side !== undefined && side.source === "ocr" && !side.confirmed;
}

function percent(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function compareScalar(
  field: FieldDefinition,
  previous: SideValue | undefined,
  current: SideValue | undefined,
  sides: [ComparisonSide, ComparisonSide],
): FieldDiff {
  const base = {
    key: field.key,
    label: field.label,
    type: field.type,
    previous,
    current,
    notes: [] as string[],
    needsCheck: needsCheck(previous) || needsCheck(current),
    priority: field.diffPriority ?? "normal",
  };
  if (!previous && !current) return { ...base, status: "same" };
  if (!current) {
    if (!sides[1].readable) {
      return {
        ...base,
        status: "uncomparable",
        notes: ["今回の資料のこの欄を読み取れなかったため、比較していません。PDFを見て確認してください。"],
      };
    }
    return { ...base, status: "removed" };
  }
  if (!previous) {
    if (!sides[0].readable) {
      return { ...base, status: "uncomparable", notes: ["前回の資料のこの欄を読み取れなかったため、比較していません。"] };
    }
    return { ...base, status: "added" };
  }
  if (!sameValue(field.type, previous.value, current.value)) {
    const diff: FieldDiff = { ...base, status: "changed" };
    if (field.type === "money" && typeof previous.value === "number" && typeof current.value === "number") {
      diff.delta = { amount: current.value - previous.value, percent: percent(previous.value, current.value) };
    }
    return diff;
  }
  if (rawForm(previous) !== rawForm(current)) {
    const note = field.type === "text" ? "表記は違いますが、同じ値として扱っています。" : "書き方は違いますが、同じ値です。";
    return { ...base, status: "notation", notes: [note] };
  }
  return { ...base, status: "same" };
}

function rowKey(row: unknown): string {
  if (typeof row !== "object" || row === null) return String(row);
  const r = row as Record<string, unknown>;
  return [r.lender, r.purpose].map((v) => compareKey(String(v ?? ""))).join("/");
}

function rowLabel(row: unknown): string {
  if (typeof row !== "object" || row === null) return String(row);
  const r = row as Record<string, unknown>;
  return [r.lender, r.purpose]
    .filter((v) => v !== undefined && v !== "")
    .map(String)
    .join("・");
}

/** 表(他の借入)は、借入先と借入目的で行を対応付け、行ごとに比べる */
function compareList(
  field: FieldDefinition,
  previous: SideValue | undefined,
  current: SideValue | undefined,
  sides: [ComparisonSide, ComparisonSide],
): FieldDiff[] {
  const prevRows = Array.isArray(previous?.value) ? previous.value : [];
  const curRows = Array.isArray(current?.value) ? current.value : [];
  const uniqueKey = (rows: readonly unknown[]) => {
    const counts = new Map<string, number>();
    return rows.map((row) => {
      const key = rowKey(row);
      const occurrence = (counts.get(key) ?? 0) + 1;
      counts.set(key, occurrence);
      return occurrence === 1 ? key : `${key}#${occurrence}`;
    });
  };
  const prevKeys = uniqueKey(prevRows);
  const curKeys = uniqueKey(curRows);
  const keys = [...new Set([...prevKeys, ...curKeys])];
  if (keys.length === 0) return [compareScalar(field, undefined, undefined, sides)];
  return keys.map((key) => {
    const p = prevRows.find((row, index) => prevKeys[index] === key);
    const c = curRows.find((row, index) => curKeys[index] === key);
    const side = (row: unknown, from: SideValue | undefined): SideValue | undefined =>
      row === undefined || !from ? undefined : { ...from, value: [row], rawText: undefined };
    const rowField: FieldDefinition = { ...field, key: `${field.key}[${key}]`, label: `${field.label}(${rowLabel(p ?? c)})` };
    const diff = compareScalar(rowField, side(p, previous), side(c, current), sides);
    if (diff.status === "changed" && p && c) {
      const changed = (field.items ?? []).filter(
        (item) => !sameValue(item.type, (p as Record<string, unknown>)[item.key], (c as Record<string, unknown>)[item.key]),
      );
      diff.notes.push(`変わった欄: ${changed.map((i) => i.label).join("・")}`);
    }
    return diff;
  });
}

const STATUS_ORDER: Readonly<Record<DiffStatus, number>> = {
  changed: 0,
  removed: 1,
  added: 2,
  uncomparable: 3,
  notation: 4,
  same: 5,
};

/** 差分の一覧の並び順: 判定(変更・削除・追加・比較できない・表記の違い・一致)、同じ判定の中では重視する項目を上に */
export function sortDiffs(diffs: readonly FieldDiff[]): FieldDiff[] {
  return [...diffs].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1),
  );
}

/** 生年月日の項目のキー(「applicant.age」なら「applicant.birthDate」) */
function birthDateKeyOf(ageKey: string): string {
  return ageKey.replace(/age$/, "birthDate");
}

export function compareDocuments(
  definition: DocumentDefinition,
  previous: ComparisonSide,
  current: ComparisonSide,
): ComparisonResult {
  const sides: [ComparisonSide, ComparisonSide] = [previous, current];
  const fields = definition.fields.flatMap((field) => {
    const p = previous.values[field.key];
    const c = current.values[field.key];
    return field.type === "list" ? compareList(field, p, c, sides) : [compareScalar(field, p, c, sides)];
  });

  // 年齢は申込日が違えば変わって当然なので、生年月日が同じなら一致とする
  for (const diff of fields) {
    if (!/(^|\.)age$/.test(diff.key) || diff.status !== "changed") continue;
    const birth = fields.find((f) => f.key === birthDateKeyOf(diff.key));
    if (birth && (birth.status === "same" || birth.status === "notation")) {
      diff.status = "same";
      diff.notes.push("生年月日が同じなので、年齢の違いは申込日の違いによるものとみなしています。");
    }
  }

  const warnings: string[] = [];
  // 氏名・生年月日が違えば、別の人の書類の可能性がある(比較は続ける)
  const personChanged = fields.some(
    (f) => /(^|\.)(name|birthDate)$/.test(f.key) && !f.key.startsWith("guarantor.") && f.status === "changed",
  );
  if (personChanged) warnings.push("氏名または生年月日が違います。別の人の書類の可能性があります。");

  const year = fields.find((f) => f.key === "incomeYear" && f.status === "changed");
  return {
    fields: sortDiffs(fields),
    warnings,
    yearChange: year ? { from: year.previous?.value, to: year.current?.value } : undefined,
  };
}

export function countDiffs(diffs: readonly FieldDiff[]): Record<DiffStatus, number> {
  const counts: Record<DiffStatus, number> = { changed: 0, added: 0, removed: 0, notation: 0, uncomparable: 0, same: 0 };
  for (const d of diffs) counts[d.status]++;
  return counts;
}
