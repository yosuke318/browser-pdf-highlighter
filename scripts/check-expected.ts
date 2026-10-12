// samples/*/expected.json の正解データが、schema/extraction-fields.json の
// 抽出項目の定義と合っているかを確認する。
//   npm run samples:check
//
// 確認すること:
// - 定義にないキーが正解データに入っていない
// - 必須の項目が正解データにある
// - 値の型が定義どおり(金額は整数、日付は YYYY-MM-DD など)
// - 定義の中の書類をまたいだ比較(crossDocument)が、存在する項目を指している

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

const FIELD_TYPES = ["text", "date", "yearMonth", "year", "money", "number", "boolean", "list"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

interface FieldDefinition {
  key: string;
  type: FieldType;
  required: boolean;
  items?: FieldDefinition[];
}

interface DocumentDefinition {
  id: string;
  fields: FieldDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseField(value: unknown, where: string): FieldDefinition {
  if (!isRecord(value)) throw new Error(`${where}: 項目の定義がオブジェクトではありません`);
  const { key, type, required, items } = value;
  if (typeof key !== "string") throw new Error(`${where}: key がありません`);
  if (typeof type !== "string" || !(FIELD_TYPES as readonly string[]).includes(type)) {
    throw new Error(`${where}.${key}: 不明な型 ${String(type)}`);
  }
  if (typeof required !== "boolean") throw new Error(`${where}.${key}: required がありません`);
  const field: FieldDefinition = { key, type: type as FieldType, required };
  if (type === "list") {
    if (!Array.isArray(items)) throw new Error(`${where}.${key}: list 型には items が必要です`);
    field.items = items.map((item, i) => parseField(item, `${where}.${key}.items[${i}]`));
  }
  return field;
}

function parseSchema(value: unknown): { documents: DocumentDefinition[]; crossDocument: string[][] } {
  if (!isRecord(value) || !Array.isArray(value.documents)) throw new Error("documents がありません");
  const documents = value.documents.map((doc, i): DocumentDefinition => {
    if (!isRecord(doc) || typeof doc.id !== "string" || !Array.isArray(doc.fields)) {
      throw new Error(`documents[${i}] の形式が違います`);
    }
    const id = doc.id;
    return { id, fields: doc.fields.map((f) => parseField(f, id)) };
  });
  const crossDocument = Array.isArray(value.crossDocument)
    ? value.crossDocument.map((group) =>
        isRecord(group) && Array.isArray(group.fields) ? group.fields.filter((f) => typeof f === "string") : [],
      )
    : [];
  return { documents, crossDocument };
}

function checkValue(type: FieldType, value: unknown): boolean {
  switch (type) {
    case "text":
      return typeof value === "string" && value.length > 0;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    case "yearMonth":
      return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    case "year":
      return Number.isInteger(value) && typeof value === "number" && value >= 1900 && value <= 2100;
    case "money":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "list":
      return Array.isArray(value);
  }
}

/** 入れ子のオブジェクトを「applicant.name」のような点区切りのキーに平らにする(配列はそのまま) */
function flatten(value: Record<string, unknown>, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isRecord(v)) for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
    else out.set(key, v);
  }
  return out;
}

function checkFields(fields: FieldDefinition[], values: Record<string, unknown>, where: string): string[] {
  const errors: string[] = [];
  const flat = flatten(values);
  const defined = new Map(fields.map((f) => [f.key, f]));
  for (const key of flat.keys()) {
    if (!defined.has(key)) errors.push(`${where}: 定義にないキー ${key}`);
  }
  for (const field of fields) {
    const value = flat.get(field.key);
    if (value === undefined) {
      if (field.required) errors.push(`${where}: 必須の項目 ${field.key} がありません`);
      continue;
    }
    if (!checkValue(field.type, value)) {
      errors.push(`${where}: ${field.key} の値が型 ${field.type} に合いません`);
      continue;
    }
    if (field.type === "list" && field.items && Array.isArray(value)) {
      value.forEach((row, i) => {
        if (!isRecord(row)) errors.push(`${where}: ${field.key}[${i}] がオブジェクトではありません`);
        else errors.push(...checkFields(field.items ?? [], row, `${where}.${field.key}[${i}]`));
      });
    }
  }
  return errors;
}

const schema = parseSchema(JSON.parse(await readFile(join(ROOT, "schema/extraction-fields.json"), "utf8")));
const errors: string[] = [];

const allKeys = new Set(schema.documents.flatMap((d) => d.fields.map((f) => `${d.id}.${f.key}`)));
for (const ref of schema.crossDocument.flat()) {
  if (!allKeys.has(ref)) errors.push(`crossDocument: 存在しない項目 ${ref}`);
}

for (const doc of schema.documents) {
  const keys = doc.fields.map((f) => f.key);
  const duplicated = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (duplicated.length > 0) errors.push(`${doc.id}: キーが重複しています ${duplicated.join(", ")}`);

  const path = join(ROOT, "samples", doc.id, "expected.json");
  const expected: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(expected) || !isRecord(expected.values)) {
    errors.push(`${doc.id}: expected.json に values がありません`);
    continue;
  }
  errors.push(...checkFields(doc.fields, expected.values, doc.id));
}

if (errors.length > 0) {
  for (const e of errors) console.error(`NG  ${e}`);
  console.error(`${errors.length} 件の不一致があります`);
  process.exit(1);
}
console.log(`OK  ${schema.documents.length} 種類の書類の正解データが抽出項目の定義と一致しました`);
