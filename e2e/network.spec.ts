import { join } from "node:path";
import { expect, test } from "@playwright/test";

// PDFを処理している間の通信が、このアプリと同じオリジンへの静的ファイルの読み込みだけであることを確かめる。
// - スキャンPDFを開いて OCR し、テキストPDFを前回の資料として読み込んで比較するまでを行う
// - 外部ドメインへのリクエストは、送らずに止めたうえで記録し、1件でもあれば失敗にする
// - CSP の違反(ブロックされた読み込み)も、1件でもあれば失敗にする
// - 抽出した値をブラウザの保存領域(localStorage・sessionStorage・IndexedDB)に残していないことも確かめる

const SAMPLES = join(import.meta.dirname, "../samples");
// 待ち時間は長めにしている。Apple Silicon の Mac で Intel 版の Node.js から起動すると、Chrome も Intel 版として
// Rosetta の変換を通して動き、OCR に10倍ほどの時間がかかるため(CI の Linux ではすぐ終わる)
const OCR_TIMEOUT = 180_000;
const STEP_TIMEOUT = 90_000;

test("PDFの処理中に、外部ドメインへの通信が発生しない", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "").origin;
  const requests: string[] = [];
  const external: string[] = [];

  // worker の中の通信も含めて、すべてのリクエストを調べる。外部へのリクエストは送らない
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (new URL(url).origin !== origin) {
      external.push(url);
      await route.abort();
      return;
    }
    await route.continue();
  });

  // CSP の違反を記録する
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (/CSP violation|Refused to|Content Security Policy/.test(text)) violations.push(text);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByText("PDFをここにドロップ")).toBeVisible();

  // スキャンPDFを開くと、OCR で読み取って値を抽出する
  await page
    .locator('input[type="file"][accept="application/pdf,.pdf"]')
    .setInputFiles(join(SAMPLES, "withholding-slip/scan.pdf"));
  await expect(page.getByText(/読み取りました/)).toBeVisible({ timeout: OCR_TIMEOUT });
  await expect(page.getByText("給与所得の源泉徴収票").first()).toBeVisible();
  await expect(page.locator(".result-panel").getByText("5,800,000").first()).toBeVisible();

  // テキストPDFを前回の資料として読み込み、項目の差分とテキスト差分を表示する
  await page.locator('input[type="file"][accept*="json"]').setInputFiles(join(SAMPLES, "withholding-slip/text.pdf"));
  await expect(page.getByRole("tab", { name: "項目の差分" })).toBeVisible({ timeout: STEP_TIMEOUT });
  await page.getByRole("tab", { name: "テキスト差分" }).click();
  await expect(page.getByRole("region", { name: "テキスト差分" })).toBeVisible();

  // worker の中の通信(OCR の学習データ)も記録できていることを確かめる(記録できていなければ、この検証は意味がない)
  expect(requests.some((url) => url.endsWith("/tesseract/lang/jpn.traineddata.gz"))).toBe(true);
  expect(requests.some((url) => url.includes("/assets/pdf.worker"))).toBe(true);

  expect(errors, "画面のスクリプトのエラー").toEqual([]);
  expect(external, "外部ドメインへのリクエスト").toEqual([]);
  expect(violations, "CSP の違反").toEqual([]);

  const storage = await page.evaluate(async () => ({
    localStorage: localStorage.length,
    sessionStorage: sessionStorage.length,
    indexedDB: (await indexedDB.databases()).map((d) => d.name),
  }));
  expect(storage, "ブラウザの保存領域").toEqual({ localStorage: 0, sessionStorage: 0, indexedDB: [] });
});
