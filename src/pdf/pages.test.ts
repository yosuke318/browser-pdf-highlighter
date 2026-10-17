import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { buildTestPdf } from "./test-fixtures/test-pdf.ts";

// ビューアが前提にしている pdf.js の動作を確かめる:
// 複数ページを順に取り出せること、/Rotate がページの大きさ(倍率1のときの幅)に反映されること。

const SAMPLES_DIR = join(import.meta.dirname, "../../samples");
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const manifest = JSON.parse(await readFile(join(SAMPLES_DIR, "manifest.json"), "utf8")) as { file: string; pages: string[] }[];

async function open(data: Uint8Array) {
  return getDocument({ data, cMapUrl: join(PDFJS_ROOT, "cmaps/"), cMapPacked: true }).promise;
}

describe("複数ページ・回転したページ", () => {
  // pdf.js は渡したデータを worker へ移すので、テストごとに作り直す
  const pdf = () =>
    buildTestPdf([
      { text: "page one" },
      { text: "page two", rotate: 90 },
      { text: "page three", rotate: 180 },
      { text: "page four", width: 842, height: 595 },
    ]);

  it("すべてのページを順に取り出せる", async () => {
    const doc = await open(pdf());
    try {
      expect(doc.numPages).toBe(4);
      const texts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const content = await (await doc.getPage(i)).getTextContent();
        texts.push(content.items.map((item) => ("str" in item ? item.str : "")).join(""));
      }
      expect(texts).toEqual(["page one", "page two", "page three", "page four"]);
    } finally {
      await doc.loadingTask.destroy();
    }
  });

  it("90度回転したページは、縦横が入れ替わった大きさで表示する", async () => {
    const doc = await open(pdf());
    try {
      const sizes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const { width, height } = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push([Math.round(width), Math.round(height)]);
      }
      expect(sizes).toEqual([
        [595, 842],
        [842, 595],
        [595, 842],
        [842, 595],
      ]);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});

describe("サンプルPDF", () => {
  it.each(manifest.map((entry) => [entry.file, entry.pages.length] as const))(
    "%s を開いて、全ページ(%i ページ)を取り出せる",
    async (file, expectedPages) => {
      const doc = await open(new Uint8Array(await readFile(join(SAMPLES_DIR, file))));
      try {
        expect(doc.numPages).toBe(expectedPages);
        for (let i = 1; i <= doc.numPages; i++) {
          const { width, height } = (await doc.getPage(i)).getViewport({ scale: 1 });
          expect(width).toBeGreaterThan(0);
          expect(height).toBeGreaterThan(0);
        }
      } finally {
        await doc.loadingTask.destroy();
      }
    },
  );
});
