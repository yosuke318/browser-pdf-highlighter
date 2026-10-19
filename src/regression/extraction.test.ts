import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { EXTRACTORS } from "../extract/extractors.ts";
import { findDocument, isRecord } from "../schema/fields.ts";
import { terminateOcr } from "../test-support/ocr.ts";
import { loadExpected, loadManifest, readSample } from "../test-support/samples.ts";
import { compareValues } from "./compare.ts";

// 抽出結果のリグレッションテスト。
// 書類の抽出処理(src/extract/extractors.ts)が登録されていれば、ダミーPDFから抽出した値を
// 正解データ(samples/<書類ID>/expected.json)と項目ごとに突き合わせる。
//
// テキストPDF(すべてのページを pdf.js の文字で読むもの):
// - 誤った値(mismatch)・正解データにない項目(unexpected)が1つでもあれば失敗する
// - 抽出できなかった項目(missing)は失敗にしないが、__snapshots__/extraction/<ファイル>.json に記録し、
//   増えたり減ったりしたら失敗する(確かめてから `npx vitest run src/regression -u` で更新する)
//
// スキャンPDF(OCR で読むページがあるもの):
// - OCR の文字の読み違い(「郎」→「朗」など)は避けられないので、誤った値があっても失敗にしない
// - 正しく抽出できた項目の数が、__snapshots__/ocr-baseline.json の基準を下回ったら失敗する
//   (OCR の結果は実行する環境でわずかに変わることがあるので、記録との完全な一致は求めない。
//   基準は、手元で取れた数より1つ少なくしている)
// - 基準より多く取れたときは、結果を確かめてから基準を上げる
//
// 登録されていない書類は「未実装」として表示する。

const OCR_BASELINE = join(import.meta.dirname, "__snapshots__/ocr-baseline.json");
/** OCR を含むPDF1つの読み取りにかかる時間の上限(ミリ秒) */
const OCR_TIMEOUT = 120_000;

async function loadOcrBaseline(): Promise<Record<string, number>> {
  const raw: unknown = JSON.parse(await readFile(OCR_BASELINE, "utf8"));
  if (!isRecord(raw)) throw new Error("ocr-baseline.json の形式が想定と違います");
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === "number"));
}

afterAll(terminateOcr);

describe("抽出結果と正解データの突き合わせ", async () => {
  const manifest = (await loadManifest()).filter((e) => e.documentId);
  const baseline = await loadOcrBaseline();

  for (const entry of manifest) {
    const documentId = entry.documentId ?? "";
    const extract = EXTRACTORS[documentId];
    if (!extract) {
      it.todo(`${entry.file}: ${documentId} の抽出処理は未実装`);
      continue;
    }
    const definition = findDocument(documentId);
    const usesOcr = entry.pages.some((kind) => kind !== "text");

    if (!usesOcr) {
      it(entry.file, async () => {
        if (!definition) throw new Error(`${documentId} の抽出項目の定義がありません`);
        const actual = extract(await readSample(entry.file));
        const results = compareValues(definition.fields, await loadExpected(documentId), actual);

        const wrong = results.filter((r) => r.status === "mismatch" || r.status === "unexpected");
        expect(wrong, "誤った値・定義にない項目を抽出しています").toEqual([]);
        const missing = results.filter((r) => r.status === "missing").map((r) => r.key);
        const name = entry.file.replace(/\//g, "__").replace(/\.pdf$/, "");
        await expect(`${JSON.stringify({ missing }, null, 2)}\n`).toMatchFileSnapshot(`./__snapshots__/extraction/${name}.json`);
      });
      continue;
    }

    it(`${entry.file}(OCR)`, { timeout: OCR_TIMEOUT }, async () => {
      if (!definition) throw new Error(`${documentId} の抽出項目の定義がありません`);
      const actual = extract(await readSample(entry.file, { ocr: true }));
      const results = compareValues(definition.fields, await loadExpected(documentId), actual);

      const unexpected = results.filter((r) => r.status === "unexpected");
      expect(unexpected, "定義にない項目を抽出しています").toEqual([]);
      const matched = results.filter((r) => r.status === "match").length;
      const minimum = baseline[entry.file];
      expect(minimum, `${entry.file} の基準が ocr-baseline.json にありません(今回: ${matched})`).toBeDefined();
      expect(matched, "正しく抽出できた項目の数が基準を下回りました").toBeGreaterThanOrEqual(minimum ?? 0);
    });
  }
});
