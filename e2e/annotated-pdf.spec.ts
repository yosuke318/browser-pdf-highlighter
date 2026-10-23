import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// ハイライト付きPDFの保存。テキストPDFを開いて「ハイライト付きPDFを保存」を押し、
// 保存したPDFに、抽出した項目のハイライト注釈(項目名と値のコメント付き)が入っていることを確かめる。
// 注釈を書き込む pdf-lib は保存するときに読み込むので、CSP の下でも読み込めることも確かめる。

const SAMPLES = join(import.meta.dirname, "../samples");
// 待ち時間は長めにしている(理由は e2e/network.spec.ts の説明を参照)
const STEP_TIMEOUT = 180_000;

test("抽出した項目を、ハイライト注釈として書き込んだPDFを保存できる", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Refused to|Content Security Policy/.test(message.text())) violations.push(message.text());
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page
    .locator('input[type="file"][accept="application/pdf,.pdf"]')
    .setInputFiles(join(SAMPLES, "withholding-slip/text.pdf"));
  await expect(page.locator(".result-panel").getByText("5,800,000").first()).toBeVisible({ timeout: STEP_TIMEOUT });

  const save = page.getByRole("button", { name: "ハイライト付きPDFを保存" });
  await expect(save).toBeEnabled({ timeout: STEP_TIMEOUT });
  const [download] = await Promise.all([page.waitForEvent("download"), save.click()]);
  expect(download.suggestedFilename()).toBe("text.highlighted.pdf");

  const data = new Uint8Array(await readFile(await download.path()));
  const task = getDocument({ data });
  try {
    const annotations = await (await (await task.promise).getPage(1)).getAnnotations();
    const highlights = annotations.filter((a) => a.subtype === "Highlight");
    const contents = highlights.map((a) => String(a.contentsObj?.str ?? ""));
    expect(contents).toContain("支払金額(年収): 5,800,000円\n状態: 未確認");
    expect(contents.some((c) => c.startsWith("氏名: 山田 太郎\n"))).toBe(true);
    expect(highlights.every((a) => a.titleObj?.str === "給与所得の源泉徴収票")).toBe(true);
  } finally {
    await task.destroy();
  }

  expect(errors, "画面のスクリプトのエラー").toEqual([]);
  expect(violations, "CSP の違反").toEqual([]);
});
