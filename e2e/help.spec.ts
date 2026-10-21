import { expect, test } from "@playwright/test";

// 使い方のページ。ヘッダーのリンクで開き、スクリーンショットの画像が同じオリジンから読み込めること、
// 「画面に戻る」で元の画面に戻れることを確かめる。

test("使い方のページを開いて、元の画面に戻れる", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Refused to|Content Security Policy/.test(message.text())) violations.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("link", { name: "使い方", exact: true }).click();
  await expect(page).toHaveURL(/#help$/);
  await expect(page.getByRole("heading", { name: "使い方", level: 1 })).toBeVisible();

  // スクリーンショットの画像がすべて読み込めている
  const images = page.locator(".help__figure img");
  await expect(images).toHaveCount(4);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  // 目次のリンクで移動しても、使い方のページのまま
  await page.getByRole("navigation", { name: "目次" }).getByRole("link", { name: "前回の資料と比べる" }).click();
  await expect(page.getByRole("heading", { name: "使い方", level: 1 })).toBeAttached();

  await page.getByRole("link", { name: "← 画面に戻る" }).first().click();
  await expect(page.getByRole("heading", { name: "PDFをここにドロップ" })).toBeVisible();
  expect(violations, "CSP の違反").toEqual([]);
});
