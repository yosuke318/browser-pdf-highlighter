import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type PageReading, readPage } from "../pdf/read-page.ts";
import { isRecord } from "../schema/fields.ts";
import { ocrPdfPageInNode } from "./ocr.ts";

// テストからダミーPDF(samples/)を読むための補助。Node.js でだけ使う。

export const SAMPLES_DIR = join(import.meta.dirname, "../../samples");
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

export interface SampleEntry {
  /** samples/ からの相対パス */
  file: string;
  /** ページごとの種類(text / scanned / searchable) */
  pages: string[];
  /** 正解データのある書類の ID(samples/<ID>/expected.json)。ない場合は undefined */
  documentId?: string;
}

export async function loadManifest(): Promise<SampleEntry[]> {
  const raw: unknown = JSON.parse(await readFile(join(SAMPLES_DIR, "manifest.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error("manifest.json の形式が想定と違います");
  return raw.map((entry: unknown, i) => {
    if (!isRecord(entry) || typeof entry.file !== "string" || !Array.isArray(entry.pages)) {
      throw new Error(`manifest.json の ${i} 番目の形式が想定と違います`);
    }
    const expected = typeof entry.expected === "string" ? entry.expected : undefined;
    return {
      file: entry.file,
      pages: entry.pages.map(String),
      documentId: expected ? dirname(expected) : undefined,
    };
  });
}

/** 正解データ(expected.json の values) */
export async function loadExpected(documentId: string): Promise<Record<string, unknown>> {
  const raw: unknown = JSON.parse(await readFile(join(SAMPLES_DIR, documentId, "expected.json"), "utf8"));
  if (!isRecord(raw) || !isRecord(raw.values)) throw new Error(`${documentId}/expected.json に values がありません`);
  return raw.values;
}

/**
 * PDFの全ページを読み取る(ページの種類の判別と、pdf.js による文字の取り出し)。
 * ocr が true なら、OCR で読むと判別したページを OCR する
 */
export async function readSample(file: string, options: { ocr?: boolean } = {}): Promise<PageReading[]> {
  const data = new Uint8Array(await readFile(join(SAMPLES_DIR, file)));
  const doc = await getDocument({ data, cMapUrl: join(PDFJS_ROOT, "cmaps/"), cMapPacked: true }).promise;
  try {
    const pages: PageReading[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const reading = await readPage(page, OPS);
      if (options.ocr && reading.classification.method === "ocr") reading.ocr = await ocrPdfPageInNode(page);
      pages.push(reading);
    }
    return pages;
  } finally {
    await doc.loadingTask.destroy();
  }
}
