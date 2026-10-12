// 開発・回帰テスト用のダミーサンプルPDFを samples/ に生成する。
//   npm run samples
// Google Chrome がインストールされている必要がある(playwright-core から起動する)。

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { buildScanPdf, buildSearchablePdf, concatPdfs } from "./assemble.ts";
import type { SampleDocument } from "./document.ts";
import { renderScan, renderTextPdf } from "./render.ts";
import { homeLoanApplication } from "./templates/home-loan-application.ts";
import { rentalApplication } from "./templates/rental-application.ts";
import { residentTaxNotice } from "./templates/resident-tax-notice.ts";
import { taxCertificate } from "./templates/tax-certificate.ts";
import { taxReturn } from "./templates/tax-return.ts";
import { withholdingSlip } from "./templates/withholding-slip.ts";

const OUT_DIR = join(import.meta.dirname, "../../samples");

const documents: SampleDocument[] = [
  withholdingSlip,
  taxCertificate,
  residentTaxNotice,
  taxReturn,
  homeLoanApplication,
  rentalApplication,
];

/** 各ページがテキストPDFかスキャンPDFか(自動判別のテストの正解) */
type PageKind = "text" | "scanned" | "searchable";

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

      const textPdf = await renderTextPdf(browser, doc.html({ scan: false }));
      const scan = await renderScan(browser, doc.html({ scan: true }), doc.scan, 1000 + index);
      const scanPdf = await buildScanPdf([scan]);
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
        const searchable = await buildSearchablePdf(scan, doc.scan.skewDegrees);
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

    // 作成コーナーで作った確定申告書(テキストPDF)に、スキャンした源泉徴収票を添付した想定
    const mixed = await concatPdfs([textPdfs.get(taxReturn.id)!, scanPdfs.get(withholdingSlip.id)!]);
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
