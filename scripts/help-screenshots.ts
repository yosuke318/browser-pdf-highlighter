// 使い方のページ(src/help/HelpPage.tsx)に載せる画面のスクリーンショットを、ダミーPDFから作る。
//   npm run help:screenshots
// アプリをビルドして vite preview で配信し、Google Chrome で samples/ のダミーPDFを開いて撮影する(実データは使わない)。
// 撮影したファイルは src/help/screenshots/manifest.json に記録する。npm run check:files は、ここに載っている
// 画像だけを samples/ の外に置いてよいものとして扱う。

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { build, preview } from "vite";

const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "src/help/screenshots");
const SAMPLES = join(ROOT, "samples");
const PORT = 5179;
// 待ち時間は長めにする(Apple Silicon の Mac で Intel 版の Node.js から起動すると、Chrome の処理がとても遅くなるため)
const STEP_TIMEOUT = 120_000;
const OCR_TIMEOUT = 300_000;

interface Shot {
  file: string;
  description: string;
  samples: string[];
}

const shots: Shot[] = [];

async function capture(page: Page, file: string, description: string, samples: string[]): Promise<void> {
  // ハイライトの描画や、表示の切り替わりが落ち着くのを待つ
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT_DIR, file), type: "jpeg", quality: 78 });
  shots.push({ file, description, samples });
  console.log(`撮影: ${file}`);
}

async function main(): Promise<void> {
  // 開発サーバーは初回の表示で依存パッケージを最適化してページを読み込み直し、選んだファイルが消えることがあるので、
  // ビルドしたものを配信する
  await build({ root: ROOT, logLevel: "error" });
  const server = await preview({ root: ROOT, logLevel: "error", preview: { port: PORT, strictPort: true } });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(STEP_TIMEOUT);
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole("heading", { name: "PDFをここにドロップ" }).waitFor();
    await capture(page, "home.jpg", "読み込み前の画面", []);

    const openPdf = page.locator('input[type="file"][accept="application/pdf,.pdf"]');
    const comparePdf = page.locator('input[type="file"][accept*="json"]');

    // テキストPDF: 抽出結果とハイライト。「支払金額」を選んだ状態
    await openPdf.setInputFiles(join(SAMPLES, "withholding-slip/text.pdf"));
    const payment = page.locator(".field-item").filter({ hasText: "支払金額" }).first();
    await payment.waitFor();
    await payment.locator(".field-item__main").click();
    await capture(page, "extract.jpg", "抽出結果とハイライト(項目を選んだ状態)", ["withholding-slip/text.pdf"]);

    // スキャンPDF: OCR で読み取っている途中
    await openPdf.setInputFiles(join(SAMPLES, "withholding-slip/scan.pdf"));
    await page.getByText("読み取り中", { exact: true }).first().waitFor();
    await capture(page, "ocr.jpg", "スキャンPDFを OCR で読み取っている途中", ["withholding-slip/scan.pdf"]);
    await page.getByText(/読み取りました/).waitFor({ timeout: OCR_TIMEOUT });

    // 前回の資料との比較
    await comparePdf.setInputFiles(join(SAMPLES, "withholding-slip/text.pdf"));
    await page.getByRole("tab", { name: "項目の差分" }).waitFor({ timeout: OCR_TIMEOUT });
    await capture(page, "diff.jpg", "前回の資料との比較(項目の差分)", ["withholding-slip/scan.pdf", "withholding-slip/text.pdf"]);
  } finally {
    await browser.close();
    await server.close();
  }
  await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(shots, null, 2)}\n`);
}

await main();
