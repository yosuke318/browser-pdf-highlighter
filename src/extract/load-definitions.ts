import type { DocumentRules } from "./rules.ts";

// src/extract/definitions/ にある書類定義を、すべて読み込む。
// 定義ファイルを置くだけで、新しい書類タイプが抽出の対象になる(ここを書き換える必要はない)。
// 各ファイルは defineDocument(...) の結果を default export する。

const modules = import.meta.glob<{ default: DocumentRules }>("./definitions/*.ts", { eager: true });

function load(): DocumentRules[] {
  const definitions = Object.entries(modules).map(([path, module]) => {
    if (!module.default) throw new Error(`${path} が書類定義を default export していません`);
    return module.default;
  });
  const ids = definitions.map((d) => d.id);
  const duplicated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (duplicated.length > 0) throw new Error(`書類定義の ID が重複しています: ${duplicated.join(", ")}`);
  return definitions;
}

export const DOCUMENT_DEFINITIONS: readonly DocumentRules[] = load();
