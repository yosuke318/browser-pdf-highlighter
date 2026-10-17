import { describe, expect, it } from "vitest";
import { EXTRACTORS } from "../extract/extractors.ts";
import { findDocument } from "../schema/fields.ts";
import { loadExpected, loadManifest, readSample } from "../test-support/samples.ts";
import { compareValues } from "./compare.ts";

// 抽出結果のリグレッションテスト。
// 書類の抽出処理(src/extract/extractors.ts)が登録されていれば、ダミーPDFから抽出した値を
// 正解データ(samples/<書類ID>/expected.json)と項目ごとに突き合わせる。
// - 誤った値(mismatch)・正解データにない項目(unexpected)が1つでもあれば失敗する
// - 抽出できなかった項目(missing)は失敗にしないが、__snapshots__/extraction/<ファイル>.json に記録し、
//   増えたり減ったりしたら失敗する(確かめてから `npx vitest run src/regression -u` で更新する)
// 登録されていない書類は「未実装」として表示する。

describe("抽出結果と正解データの突き合わせ", async () => {
  const manifest = (await loadManifest()).filter((e) => e.documentId);

  for (const entry of manifest) {
    const documentId = entry.documentId ?? "";
    const extract = EXTRACTORS[documentId];
    if (!extract) {
      it.todo(`${entry.file}: ${documentId} の抽出処理は未実装`);
      continue;
    }
    // OCR は未対応なので、OCR で読むページしかないPDFは、OCR に対応するまで飛ばす
    const ocrOnly = entry.pages.every((kind) => kind !== "text");
    it.skipIf(ocrOnly)(entry.file, async () => {
      const definition = findDocument(documentId);
      if (!definition) throw new Error(`${documentId} の抽出項目の定義がありません`);
      const actual = extract(await readSample(entry.file));
      const results = compareValues(definition.fields, await loadExpected(documentId), actual);

      const wrong = results.filter((r) => r.status === "mismatch" || r.status === "unexpected");
      expect(wrong, "誤った値・定義にない項目を抽出しています").toEqual([]);
      const missing = results.filter((r) => r.status === "missing").map((r) => r.key);
      const name = entry.file.replace(/\//g, "__").replace(/\.pdf$/, "");
      await expect(`${JSON.stringify({ missing }, null, 2)}\n`).toMatchFileSnapshot(`./__snapshots__/extraction/${name}.json`);
    });
  }
});
