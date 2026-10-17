import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { PDFJS_ASSET_DIRS } from "../../vite-plugins/pdfjs-assets.ts";
import { buildPredefinedCmapPdf } from "./test-fixtures/predefined-cmap-pdf.ts";

const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

async function extractText(data: Uint8Array, cMapUrl?: string): Promise<string> {
  const pdf = await getDocument({ data, cMapUrl, cMapPacked: true }).promise;
  try {
    const content = await (await pdf.getPage(1)).getTextContent();
    return content.items.map((item) => ("str" in item ? item.str : "")).join("");
  } finally {
    await pdf.loadingTask.destroy();
  }
}

describe("定義済み CMap を使う日本語PDF", () => {
  it("配信対象に CMap のディレクトリが含まれている", () => {
    expect(PDFJS_ASSET_DIRS).toContain("cmaps");
  });

  it("CMap を読み込めると日本語の文字を取り出せる", async () => {
    const text = await extractText(buildPredefinedCmapPdf("日本語"), join(PDFJS_ROOT, "cmaps/"));
    expect(text).toBe("日本語");
  });

  it("CMap を読み込めないと日本語の文字を取り出せない", async () => {
    // 上のテストが CMap の読み込みに依存していることを確かめる
    const text = await extractText(buildPredefinedCmapPdf("日本語")).catch(() => "");
    expect(text).not.toBe("日本語");
  });
});
