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
import { EXTRACTION_SCHEMA, isRecord, validateValues } from "../src/schema/fields.ts";

const ROOT = join(import.meta.dirname, "..");
const schema = EXTRACTION_SCHEMA;
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
  errors.push(...validateValues(doc.fields, expected.values, doc.id));
}

if (errors.length > 0) {
  for (const e of errors) console.error(`NG  ${e}`);
  console.error(`${errors.length} 件の不一致があります`);
  process.exit(1);
}
console.log(`OK  ${schema.documents.length} 種類の書類の正解データが抽出項目の定義と一致しました`);
