import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { classifyPage, type PageKind, type PageStats } from "./page-kind.ts";
import { readPage } from "./read-page.ts";
import { buildTestPdf } from "./test-fixtures/test-pdf.ts";

const SAMPLES_DIR = join(import.meta.dirname, "../../samples");
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

async function classifyAll(data: Uint8Array) {
  const doc = await getDocument({ data, cMapUrl: join(PDFJS_ROOT, "cmaps/"), cMapPacked: true }).promise;
  try {
    const results = [];
    for (let i = 1; i <= doc.numPages; i++) results.push((await readPage(await doc.getPage(i), OPS)).classification);
    return results;
  } finally {
    await doc.loadingTask.destroy();
  }
}

describe("判別の規則", () => {
  const base: PageStats = { textChars: 0, imageCoverage: 0, allTextInvisible: false, normalCharRatio: 1 };

  it.each<[string, Partial<PageStats>, PageKind]>([
    ["文字が十分にある", { textChars: 100 }, "text"],
    ["画像がページを覆い、文字がない", { imageCoverage: 0.95 }, "scanned"],
    ["画像がページを覆い、文字が少しだけある(スキャナが入れた日付など)", { imageCoverage: 0.95, textChars: 5 }, "scanned"],
    ["画像がページを覆い、文字が透明", { imageCoverage: 0.95, textChars: 300, allTextInvisible: true }, "searchable"],
    ["文字は十分にあるが、正常な文字が少ない", { textChars: 100, normalCharRatio: 0.3 }, "garbled"],
    ["文字も画像もほとんどない", { textChars: 3, imageCoverage: 0.1 }, "other"],
    ["画像の上に見える文字が十分にある(画像入りの書類)", { imageCoverage: 0.95, textChars: 300 }, "text"],
  ])("%s → %s", (_, stats, kind) => {
    expect(classifyPage({ ...base, ...stats }).kind).toBe(kind);
  });

  it("テキストPDFだけを pdf.js で読み、それ以外は OCR にする", () => {
    expect(classifyPage({ ...base, textChars: 100 }).method).toBe("pdf");
    expect(classifyPage({ ...base, imageCoverage: 1 }).method).toBe("ocr");
    expect(classifyPage(base).method).toBe("ocr");
  });

  it("しきい値を変えて判別できる", () => {
    const stats = { ...base, textChars: 10 };
    expect(classifyPage(stats).kind).toBe("other");
    expect(classifyPage(stats, { minTextChars: 5, minImageCoverage: 0.8, minNormalCharRatio: 0.7 }).kind).toBe("text");
  });
});

describe("テスト用PDFの判別", () => {
  const lines = ["The quick brown fox jumps over", "the lazy dog 0123456789"];

  it("ページごとに種類を判別する", async () => {
    const results = await classifyAll(
      buildTestPdf([
        { text: lines },
        { text: "", image: "full" },
        { text: lines, image: "full", invisibleText: true },
        { text: lines, garbled: true },
        { text: "", image: "small" },
        { text: lines, image: "full" },
      ]),
    );
    expect(results.map((r) => r.kind)).toEqual(["text", "scanned", "searchable", "garbled", "other", "text"]);
  });

  it("画像の割合は、画像が描かれた範囲から求める", async () => {
    const [full, small] = await classifyAll(
      buildTestPdf([
        { text: "", image: "full" },
        { text: "", image: "small" },
      ]),
    );
    expect(full?.stats.imageCoverage).toBeCloseTo(1);
    expect(small?.stats.imageCoverage).toBeCloseTo(0.25);
  });
});

describe("サンプルPDFの判別", async () => {
  const manifest = JSON.parse(await readFile(join(SAMPLES_DIR, "manifest.json"), "utf8")) as { file: string; pages: string[] }[];

  it.each(manifest.map((e) => [e.file, e.pages] as const))("%s → %j", async (file, expected) => {
    const results = await classifyAll(new Uint8Array(await readFile(join(SAMPLES_DIR, file))));
    expect(results.map((r) => r.kind)).toEqual(expected);
  });
});
