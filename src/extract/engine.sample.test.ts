import { describe, expect, it } from "vitest";
import { readSample } from "../test-support/samples.ts";
import { extractDocument, toValues } from "./engine.ts";
import { toExtractionPages } from "./extractors.ts";
import { defineDocument } from "./rules.ts";

// 実際のレイアウト(ダミーの源泉徴収票のテキストPDF)で、エンジンが動くことを確かめる。
// 書類定義そのもののテストではない(源泉徴収票の書類定義は src/extract/definitions/ に別に作る)。

const rules = defineDocument({
  id: "withholding-slip",
  fields: {
    incomeYear: [{ kind: "pattern", pattern: /((?:令和|平成)\d+年)分/ }],
    name: [{ kind: "label", labels: ["氏名"], direction: ["below", "right"], reject: /フリガナ/ }],
    birthDate: [{ kind: "label", labels: ["受給者生年月日"], direction: "below" }],
    paymentAmount: [{ kind: "label", labels: ["支払金額"], direction: "below" }],
    withholdingTax: [{ kind: "label", labels: ["源泉徴収税額"], direction: "below" }],
    employerName: [{ kind: "label", labels: ["氏名又は名称"], direction: "right" }],
  },
});

describe("ダミーの源泉徴収票", async () => {
  const pages = toExtractionPages(await readSample("withholding-slip/text.pdf"));
  const result = extractDocument(rules, pages);

  it("ラベル・正規表現のルールで値を取れる", () => {
    expect(toValues(result)).toEqual({
      incomeYear: 2025,
      name: "山田 太郎",
      birthDate: "1988-04-15",
      paymentAmount: 5_800_000,
      withholdingTax: 166_900,
      employerName: "株式会社サンプル商事",
    });
  });

  it("値の位置(ページと長方形)を返す", () => {
    const amount = result.fields.find((f) => f.key === "paymentAmount");
    expect(amount?.page).toBe(1);
    expect(amount?.bbox).toHaveLength(1);
    const [box] = amount?.bbox ?? [];
    // 「内」の欄(x = 136〜146)ではなく、金額の欄にある
    expect(box?.x0).toBeGreaterThan(150);
  });

  it("ルールを書いていない項目は未検出になる", () => {
    const missing = result.fields.filter((f) => !f.found).map((f) => f.key);
    expect(missing).toContain("address");
    expect(missing).toContain("socialInsurance");
  });
});
