import { describe, expect, it } from "vitest";
import { findDocument, flattenValues } from "../schema/fields.ts";
import { loadExpected, loadManifest, readSample } from "../test-support/samples.ts";
import { findExpectedValues } from "./find-values.ts";

// 文字の取り出し(pdf.js・正規化)のリグレッションテスト。
// ダミーPDFごとに、正解データの値が取り出した文字の中に見つかるかを調べ、結果を
// __snapshots__/text-coverage.json に記録する。見つかっていた値が見つからなくなると、テストが失敗する。
//
// 見つかる値が増えた(改善した)ときも失敗するので、結果を確かめてから
// `npx vitest run src/regression -u` で記録を更新し、変更をコミットする。

interface FileCoverage {
  /** ページごとの判別結果 */
  pages: string[];
  /** pdf.js で読んだページで、見つかった値の数 / 調べた値の数 */
  found?: string;
  /** 見つからなかった項目 */
  notFound?: string[];
  /** すべてのページが OCR で読むページのとき(OCR に対応したら調べる) */
  ocrOnly?: true;
}

describe("正解データの値が、取り出した文字の中に見つかるか", async () => {
  const manifest = (await loadManifest()).filter((e) => e.documentId);

  it("記録と一致する", async () => {
    const report: Record<string, FileCoverage> = {};
    for (const entry of manifest) {
      const documentId = entry.documentId ?? "";
      const definition = findDocument(documentId);
      if (!definition) throw new Error(`${documentId} の抽出項目の定義がありません`);
      const pages = await readSample(entry.file);
      const pdfPages = pages.filter((p) => p.classification.method === "pdf");
      const coverage: FileCoverage = { pages: pages.map((p) => `${p.classification.kind}(${p.classification.method})`) };
      if (pdfPages.length === 0) {
        coverage.ocrOnly = true;
      } else {
        const results = findExpectedValues(
          definition.fields,
          flattenValues(await loadExpected(documentId)),
          pdfPages.flatMap((p) => p.pdfSegments),
        );
        const checked = Object.entries(results).filter(([, r]) => r !== "not-checked");
        coverage.found = `${checked.filter(([, r]) => r === "found").length}/${checked.length}`;
        coverage.notFound = checked.filter(([, r]) => r === "not-found").map(([key]) => key);
      }
      report[entry.file] = coverage;
    }
    await expect(`${JSON.stringify(report, null, 2)}\n`).toMatchFileSnapshot("./__snapshots__/text-coverage.json");
  });
});
