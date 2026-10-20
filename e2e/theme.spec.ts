import { expect, test } from "@playwright/test";

// テーマの切り替え。選んだテーマだけをブラウザに覚えさせ、標準に戻したら保存領域に何も残さない。
// 見出しの明朝体も同じオリジンから読み込み、外部への通信や CSP の違反が起きないことも確かめる。

test("テーマを切り替えると見た目が変わり、選んだテーマを次に開いたときも使う", async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL ?? "").origin;
  const external: string[] = [];
  const fonts: string[] = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) {
      external.push(url);
      await route.abort();
      return;
    }
    if (/shippori-mincho/.test(url)) fonts.push(url);
    await route.continue();
  });
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Refused to|Content Security Policy/.test(message.text())) violations.push(message.text());
  });

  await page.goto("/");
  const html = page.locator("html");
  const toggle = page.getByRole("group", { name: "テーマ" });

  // 初めて開いたときは標準
  await expect(html).not.toHaveAttribute("data-theme");
  await expect(toggle.getByRole("button", { name: "標準" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "PDFをここにドロップ" })).toBeVisible();

  await toggle.getByRole("button", { name: "魔法の書庫" }).click();
  await expect(html).toHaveAttribute("data-theme", "library");
  await expect(page.getByRole("heading", { name: "書類をここに置いてください" })).toBeVisible();
  await expect(page.locator(".app-header")).toHaveCSS("background-color", "rgb(42, 28, 16)");
  await expect.poll(() => fonts.length).toBeGreaterThan(0);

  // 次に開いたときも同じテーマ
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "library");
  await expect(toggle.getByRole("button", { name: "魔法の書庫" })).toHaveAttribute("aria-pressed", "true");

  // 標準に戻すと、保存した値を消す
  await toggle.getByRole("button", { name: "標準" }).click();
  await expect(html).not.toHaveAttribute("data-theme");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);

  expect(external, "外部ドメインへのリクエスト").toEqual([]);
  expect(violations, "CSP の違反").toEqual([]);
});
