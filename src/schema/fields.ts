import schemaJson from "../../schema/extraction-fields.json";

// 抽出項目の定義(schema/extraction-fields.json)の読み込みと、値の型の確認。
// 正解データの確認(scripts/check-expected.ts)と、抽出結果の突き合わせ(リグレッションテスト)で使う。

export const FIELD_TYPES = ["text", "date", "yearMonth", "year", "money", "number", "boolean", "list"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDefinition {
  /** 項目のキー。入れ子の項目は「applicant.name」のような点区切り */
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** list 型の、1行分の項目 */
  items?: FieldDefinition[];
}

export interface DocumentDefinition {
  id: string;
  title: string;
  fields: FieldDefinition[];
}

export interface ExtractionSchema {
  documents: DocumentDefinition[];
  /** 書類をまたいで比べる項目の組(「withholding-slip.paymentAmount」のような書類ID付きのキー) */
  crossDocument: string[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldType(value: unknown): value is FieldType {
  return typeof value === "string" && (FIELD_TYPES as readonly string[]).includes(value);
}

function parseField(value: unknown, where: string): FieldDefinition {
  if (!isRecord(value)) throw new Error(`${where}: 項目の定義がオブジェクトではありません`);
  const { key, label, type, required, items } = value;
  if (typeof key !== "string") throw new Error(`${where}: key がありません`);
  if (!isFieldType(type)) throw new Error(`${where}.${key}: 不明な型 ${String(type)}`);
  if (typeof required !== "boolean") throw new Error(`${where}.${key}: required がありません`);
  const field: FieldDefinition = { key, label: typeof label === "string" ? label : key, type, required };
  if (type === "list") {
    if (!Array.isArray(items)) throw new Error(`${where}.${key}: list 型には items が必要です`);
    field.items = items.map((item, i) => parseField(item, `${where}.${key}.items[${i}]`));
  }
  return field;
}

export function parseSchema(value: unknown): ExtractionSchema {
  if (!isRecord(value) || !Array.isArray(value.documents)) throw new Error("documents がありません");
  const documents = value.documents.map((doc, i): DocumentDefinition => {
    if (!isRecord(doc) || typeof doc.id !== "string" || !Array.isArray(doc.fields)) {
      throw new Error(`documents[${i}] の形式が違います`);
    }
    const id = doc.id;
    return { id, title: typeof doc.title === "string" ? doc.title : id, fields: doc.fields.map((f) => parseField(f, id)) };
  });
  const crossDocument = Array.isArray(value.crossDocument)
    ? value.crossDocument.map((group) =>
        isRecord(group) && Array.isArray(group.fields) ? group.fields.filter((f) => typeof f === "string") : [],
      )
    : [];
  return { documents, crossDocument };
}

/** schema/extraction-fields.json の内容 */
export const EXTRACTION_SCHEMA: ExtractionSchema = parseSchema(schemaJson);

export function findDocument(id: string, schema: ExtractionSchema = EXTRACTION_SCHEMA): DocumentDefinition | undefined {
  return schema.documents.find((d) => d.id === id);
}

/** 値が項目の型に合っているか */
export function matchesType(type: FieldType, value: unknown): boolean {
  switch (type) {
    case "text":
      return typeof value === "string" && value.length > 0;
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    case "yearMonth":
      return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    case "year":
      return typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2100;
    case "money":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "list":
      return Array.isArray(value);
  }
}

/** 入れ子のオブジェクトを「applicant.name」のような点区切りのキーに平らにする(配列はそのまま) */
export function flattenValues(value: Record<string, unknown>, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [k, v] of Object.entries(value)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (isRecord(v)) for (const [kk, vv] of flattenValues(v, key)) out.set(kk, vv);
    else out.set(key, v);
  }
  return out;
}

/** 値の集まりが、項目の定義(キー・必須・型)に合っているかを確かめ、合わない点を返す */
export function validateValues(fields: FieldDefinition[], values: Record<string, unknown>, where: string): string[] {
  const errors: string[] = [];
  const flat = flattenValues(values);
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
    if (!matchesType(field.type, value)) {
      errors.push(`${where}: ${field.key} の値が型 ${field.type} に合いません`);
      continue;
    }
    if (field.type === "list" && Array.isArray(value)) {
      value.forEach((row, i) => {
        if (!isRecord(row)) errors.push(`${where}: ${field.key}[${i}] がオブジェクトではありません`);
        else errors.push(...validateValues(field.items ?? [], row, `${where}.${field.key}[${i}]`));
      });
    }
  }
  return errors;
}

export { isRecord };
