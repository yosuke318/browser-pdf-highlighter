// 生成したダミーPDFを pdf.js で読み、manifest.json に書いたページの種類と
// 実際の中身(文字データの有無・画像の有無・透明テキストかどうか)が合っているかを確認する。
//   npm run samples:check

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

const SAMPLES_DIR = join(import.meta.dirname, "../../samples");
const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

type PageKind = "text" | "scanned" | "searchable";

interface ManifestEntry {
  file: string;
  pages: PageKind[];
}

function isManifest(value: unknown): value is ManifestEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (e: unknown) =>
        typeof e === "object" && e !== null && "file" in e && typeof e.file === "string" && "pages" in e && Array.isArray(e.pages),
    )
  );
}

interface PageReport {
  chars: number;
  images: number;
  invisibleText: boolean;
  head: string;
}

async function inspect(path: string): Promise<PageReport[]> {
  const pdf = await getDocument({
    data: new Uint8Array(await readFile(path)),
    cMapUrl: join(PDFJS_DIR, "cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: join(PDFJS_DIR, "standard_fonts/"),
  }).promise;
  const reports: PageReport[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join("");
    const ops = await page.getOperatorList();
    let images = 0;
    let invisibleText = false;
    ops.fnArray.forEach((fn, k) => {
      if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) images++;
      if (fn === OPS.setTextRenderingMode && ops.argsArray[k]?.[0] === 3) invisibleText = true;
    });
    const compact = text.replace(/\s/g, "");
    reports.push({ chars: compact.length, images, invisibleText, head: compact.slice(0, 30) });
  }
  await pdf.cleanup();
  return reports;
}

function kindOf(r: PageReport): PageKind | "unknown" {
  if (r.images === 0 && r.chars > 0) return "text";
  if (r.images > 0 && r.chars === 0) return "scanned";
  if (r.images > 0 && r.invisibleText) return "searchable";
  return "unknown";
}

const raw: unknown = JSON.parse(await readFile(join(SAMPLES_DIR, "manifest.json"), "utf8"));
if (!isManifest(raw)) throw new Error("manifest.json の形式が想定と違います");

let failures = 0;
for (const entry of raw) {
  const reports = await inspect(join(SAMPLES_DIR, entry.file));
  reports.forEach((r, i) => {
    const actual = kindOf(r);
    const expected = entry.pages[i];
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(
      `${ok ? "OK  " : "NG  "}${entry.file} p${i + 1}: 期待=${expected} 実際=${actual}` +
        ` (文字数=${r.chars}, 画像=${r.images}, 透明テキスト=${r.invisibleText}) ${r.head}`,
    );
  });
  if (reports.length !== entry.pages.length) {
    failures++;
    console.log(`NG  ${entry.file}: ページ数 期待=${entry.pages.length} 実際=${reports.length}`);
  }
}

if (failures > 0) {
  console.error(`${failures} 件の不一致があります`);
  process.exit(1);
}
console.log("すべて一致しました");
