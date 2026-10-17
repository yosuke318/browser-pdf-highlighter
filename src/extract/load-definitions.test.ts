import { describe, expect, it } from "vitest";
import { findDocument } from "../schema/fields.ts";
import { DOCUMENT_DEFINITIONS } from "./load-definitions.ts";

// src/extract/definitions/ の書類定義が、抽出項目の定義(schema/extraction-fields.json)と合っているか。

describe("書類定義", () => {
  it.each(DOCUMENT_DEFINITIONS.map((d) => [d.id, d] as const))("%s: 書類IDと項目のキーが抽出項目の定義にある", (id, rules) => {
    const definition = findDocument(id);
    expect(definition, `${id} が schema/extraction-fields.json にありません`).toBeDefined();
    const keys = new Set(definition?.fields.map((f) => f.key));
    for (const key of Object.keys(rules.fields)) expect(keys.has(key), `${id}.${key} は定義にない項目です`).toBe(true);
    for (const fieldRules of Object.values(rules.fields)) {
      for (const rule of fieldRules) {
        if (rule.kind === "derive") expect(keys.has(rule.from), `${id}: 計算のもとの項目 ${rule.from} がありません`).toBe(true);
      }
    }
  });

  it("書類定義がまだなければ、何も読み込まない", () => {
    expect(Array.isArray(DOCUMENT_DEFINITIONS)).toBe(true);
  });
});
