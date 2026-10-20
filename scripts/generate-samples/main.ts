// 開発・回帰テスト用のダミーサンプルPDFを samples/ に生成する。
//   npm run samples
// Google Chrome がインストールされている必要がある(playwright-core から起動する)。

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildOverlayPdf, buildScanPdf, buildSearchablePdf, concatPdfs, makeReproducible } from "./assemble.ts";
import type { SampleDocument } from "./document.ts";
import { renderOverlay, renderScan, renderTextPdf } from "./render.ts";
import { homeLoanApplication } from "./templates/home-loan-application.ts";
import { rentalApplication } from "./templates/rental-application.ts";
import { residentTaxNotice } from "./templates/resident-tax-notice.ts";
import { taxCertificate } from "./templates/tax-certificate.ts";
import { taxReturn } from "./templates/tax-return.ts";
import { withholdingSlip } from "./templates/withholding-slip.ts";
import { withholdingSlipOverlay } from "./templates/withholding-slip-overlay.ts";
import { withholdingSlipTable } from "./templates/withholding-slip-table.ts";

const OUT_DIR = join(import.meta.dirname, "../../samples");

const documents: SampleDocument[] = [
  withholdingSlip,
  taxCertificate,
  residentTaxNotice,
  taxReturn,
  homeLoanApplication,
  rentalApplication,
];

/** 各ページの種類(自動判別のテストの正解) */
type PageKind = "text" | "scanned" | "searchable" | "overlay";

interface ManifestEntry {
  file: string;
  document: string;
  pages: PageKind[];
  expected?: string;
  note?: string;
}

async function main(): Promise<void> {
  // 生成物だけを消す(README.md は残す)
  for (const name of [...documents.map((d) => d.id), "pdf-kinds", "manifest.json"]) {
    await rm(join(OUT_DIR, name), { recursive: true, force: true });
  }
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const manifest: ManifestEntry[] = [];
  const textPdfs = new Map<string, Uint8Array>();
  const scanPdfs = new Map<string, Uint8Array>();

  try {
    for (const [index, doc] of documents.entries()) {
      const dir = join(OUT_DIR, doc.id);
      await mkdir(dir, { recursive: true });

      const textPdf = await makeReproducible(await renderTextPdf(browser, doc.html({ scan: false })));
      const scan = await renderScan(browser, doc.html({ scan: true }), doc.scan, 1000 + index);
      const scanPdf = await makeReproducible(await buildScanPdf([scan]));
      textPdfs.set(doc.id, textPdf);
      scanPdfs.set(doc.id, scanPdf);

      await writeFile(join(dir, "text.pdf"), textPdf);
      await writeFile(join(dir, "scan.pdf"), scanPdf);
      await writeFile(
        join(dir, "expected.json"),
        `${JSON.stringify({ document: doc.title, issuer: doc.issuer, values: doc.expected }, null, 2)}\n`,
      );

      manifest.push(
        { file: `${doc.id}/text.pdf`, document: doc.title, pages: ["text"], expected: `${doc.id}/expected.json` },
        { file: `${doc.id}/scan.pdf`, document: doc.title, pages: ["scanned"], expected: `${doc.id}/expected.json` },
      );

      if (doc.id === withholdingSlip.id) {
        const searchable = await makeReproducible(await buildSearchablePdf(scan, doc.scan.skewDegrees));
        await mkdir(join(OUT_DIR, "pdf-kinds"), { recursive: true });
        await writeFile(join(OUT_DIR, "pdf-kinds/searchable.pdf"), searchable);
        manifest.push({
          file: "pdf-kinds/searchable.pdf",
          document: doc.title,
          pages: ["searchable"],
          expected: `${doc.id}/expected.json`,
          note: "複合機のOCR機能で作られる透明テキスト付きPDFを再現したもの",
        });
      }
      console.log(`生成: ${doc.title}`);
    }

    // 電子交付の源泉徴収票の様式(様式は画像、値だけが文字)
    const overlay = await makeReproducible(
      await buildOverlayPdf(await renderOverlay(browser, withholdingSlipOverlay.html(), withholdingSlipOverlay.dpi)),
    );
    await writeFile(join(OUT_DIR, withholdingSlipOverlay.file), overlay);
    manifest.push({
      file: withholdingSlipOverlay.file,
      document: withholdingSlipOverlay.title,
      pages: ["overlay"],
      expected: `${withholdingSlipOverlay.documentId}/expected.json`,
      note: "様式(罫線・欄の名前)が画像で、値だけが文字として重なったPDF。金額は空白区切りで、先頭の桁などが離れている",
    });
    console.log(`生成: ${withholdingSlipOverlay.title}`);

    // 源泉徴収票の内容を「欄の名前 | 値」の表で出力したもの
    const table = await makeReproducible(await renderTextPdf(browser, withholdingSlipTable.html()));
    await writeFile(join(OUT_DIR, withholdingSlipTable.file), table);
    manifest.push({
      file: withholdingSlipTable.file,
      document: withholdingSlipTable.title,
      pages: ["text"],
      expected: `${withholdingSlipTable.documentId}/expected.json`,
      note: "国税庁の様式ではなく、欄の名前の右に値を書いた表の形のPDF",
    });
    console.log(`生成: ${withholdingSlipTable.title}`);

    // 作成コーナーで作った確定申告書(テキストPDF)に、スキャンした源泉徴収票を添付した想定
    const taxReturnTextPdf = textPdfs.get(taxReturn.id);
    if (!taxReturnTextPdf) throw new Error(`Text PDF not found: ${taxReturn.id}`);
    const withholdingScanPdf = scanPdfs.get(withholdingSlip.id);
    if (!withholdingScanPdf) throw new Error(`Scan PDF not found: ${withholdingSlip.id}`);
    const mixed = await makeReproducible(await concatPdfs([taxReturnTextPdf, withholdingScanPdf]));
    await writeFile(join(OUT_DIR, "pdf-kinds/mixed.pdf"), mixed);
    manifest.push({
      file: "pdf-kinds/mixed.pdf",
      document: `${taxReturn.title} + ${withholdingSlip.title}`,
      pages: ["text", "scanned"],
      note: "テキストPDFとスキャンPDFのページが混在するPDF",
    });

    await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`完了: ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

await main();
