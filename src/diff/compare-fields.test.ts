import { describe, expect, it } from "vitest";
import { findDocument } from "../schema/fields.ts";
import { compareKey } from "../text/compare-key.ts";
import { type ComparisonSide, compareDocuments, countDiffs, type SideValue } from "./compare-fields.ts";

describe("比較用の文字列", () => {
  it.each([
    ["(株)サンプル商事", "株式会社サンプル商事"],
    ["㈱サンプル商事", "株式会社サンプル商事"],
    ["見本市1-2-3", "見本市1丁目2番3号"],
    ["見本市一丁目二番三号", "見本市1丁目2番3号"],
    ["見本町十二丁目五番地", "見本町12-5"],
    ["霞ヶ関", "霞が関"],
    ["髙橋 﨑子", "高橋崎子"],
    ["ＡＢＣ　１２３", "ABC123"],
  ])("「%s」と「%s」は同じ", (a, b) => {
    expect(compareKey(a)).toBe(compareKey(b));
  });

  it.each([
    ["株式会社サンプル", "サンプル株式会社"],
    ["見本市1丁目2番3号", "見本市1丁目2番4号"],
    ["山田太郎", "山田次郎"],
  ])("「%s」と「%s」は違う", (a, b) => {
    expect(compareKey(a)).not.toBe(compareKey(b));
  });
});

const v = (value: unknown, rawText?: string, extra: Partial<SideValue> = {}): SideValue => ({
  value,
  rawText,
  confirmed: false,
  source: "pdf",
  ...extra,
});
const side = (values: Record<string, SideValue>, readable = true): ComparisonSide => ({ values, readable });
const rental = findDocument("rental-application");
const withholding = findDocument("withholding-slip");
if (!rental || !withholding) throw new Error("抽出項目の定義がありません");

const statusOf = (result: ReturnType<typeof compareDocuments>, key: string) => result.fields.find((f) => f.key === key);

describe("項目ごとの判定", () => {
  const previous = side({
    "applicant.name": v("田中 美咲"),
    "applicant.birthDate": v("1996-09-03", "平成8年9月3日"),
    "applicant.age": v(30),
    "applicant.employerName": v("(株)見本システムズ"),
    "applicant.annualIncome": v(4_200_000, "420万円"),
    "guarantor.name": v("田中 健二"),
    rent: v(85_000, "85,000円"),
  });
  const current = side({
    "applicant.name": v("田中 美咲"),
    "applicant.birthDate": v("1996-09-03", "平成8年9月3日"),
    "applicant.age": v(31),
    "applicant.employerName": v("株式会社見本システムズ"),
    "applicant.employmentType": v("正社員"),
    "applicant.annualIncome": v(4_500_000, "450万円"),
    rent: v(85_000, "8.5万円"),
  });
  const result = compareDocuments(rental, previous, current);

  it("値が同じなら一致", () => {
    expect(statusOf(result, "applicant.name")?.status).toBe("same");
  });

  it("金額が違えば変更とし、増減額と増減率を出す", () => {
    expect(statusOf(result, "applicant.annualIncome")).toMatchObject({
      status: "changed",
      delta: { amount: 300_000, percent: 7.14 },
    });
  });

  it("前回は空欄で今回は値があれば追加、その逆は削除", () => {
    expect(statusOf(result, "applicant.employmentType")?.status).toBe("added");
    expect(statusOf(result, "guarantor.name")?.status).toBe("removed");
  });

  it("正規化すると同じだが元の文字列が違えば、表記の違い", () => {
    expect(statusOf(result, "applicant.employerName")?.status).toBe("notation");
    expect(statusOf(result, "rent")?.status).toBe("notation");
  });

  it("生年月日が同じなら、年齢の違いは一致とする", () => {
    expect(statusOf(result, "applicant.age")).toMatchObject({ status: "same" });
    expect(statusOf(result, "applicant.age")?.notes).toHaveLength(1);
  });

  it("並び順は、変更・削除・追加・比較できない・表記の違い・一致の順で、同じ判定の中では重視する項目を上にする", () => {
    const order = result.fields.map((f) => f.status);
    const rank = ["changed", "removed", "added", "uncomparable", "notation", "same"];
    expect([...order].sort((a, b) => rank.indexOf(a) - rank.indexOf(b))).toEqual(order);
    expect(result.fields[0]?.key).toBe("applicant.annualIncome");
  });

  it("判定ごとの件数を数える", () => {
    expect(countDiffs(result.fields)).toMatchObject({ changed: 1, added: 1, removed: 1, notation: 2 });
  });
});

describe("比較できない・要確認・警告", () => {
  it("今回の資料が読み取れない(OCR未対応のスキャンなど)ときは、削除ではなく比較できないとする", () => {
    const result = compareDocuments(withholding, side({ paymentAmount: v(5_800_000) }), side({}, false));
    expect(statusOf(result, "paymentAmount")?.status).toBe("uncomparable");
  });

  it("OCRで読んで、まだ確認していない値は要確認にする", () => {
    const result = compareDocuments(
      withholding,
      side({ paymentAmount: v(5_800_000) }),
      side({ paymentAmount: v(5_900_000, undefined, { source: "ocr" }) }),
    );
    expect(statusOf(result, "paymentAmount")?.needsCheck).toBe(true);
  });

  it("氏名が違えば、別の人の書類の可能性を警告する", () => {
    const result = compareDocuments(withholding, side({ name: v("山田 太郎") }), side({ name: v("佐藤 花子") }));
    expect(result.warnings).toHaveLength(1);
  });

  it("対象年が違えば、その変化を返す", () => {
    const result = compareDocuments(withholding, side({ incomeYear: v(2024) }), side({ incomeYear: v(2025) }));
    expect(result.yearChange).toEqual({ from: 2024, to: 2025 });
  });
});

describe("表(他の借入)の比較", () => {
  const homeLoan = findDocument("home-loan-application");
  if (!homeLoan) throw new Error("抽出項目の定義がありません");
  const car = { lender: "見本ファイナンス", purpose: "自動車ローン", balance: 1_200_000, annualRepayment: 360_000 };
  const card = { lender: "見本カード", purpose: "カードローン", balance: 300_000 };

  it("借入先と借入目的で行を対応付け、行ごとに判定する", () => {
    const result = compareDocuments(
      homeLoan,
      side({ otherDebts: v([car, card]) }),
      side({ otherDebts: v([{ ...car, balance: 900_000 }]) }),
    );
    const rows = result.fields.filter((f) => f.key.startsWith("otherDebts["));
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["他の借入(見本ファイナンス・自動車ローン)", "changed"],
      ["他の借入(見本カード・カードローン)", "removed"],
    ]);
    expect(rows[0]?.notes).toEqual(["変わった欄: 借入残高"]);
  });

  it("借入先と借入目的が同じ行が複数あるときも、各行を区別して比較する", () => {
    const duplicateLoan1 = { lender: "見本ファイナンス", purpose: "自動車ローン", balance: 1_200_000, annualRepayment: 360_000 };
    const duplicateLoan2 = { lender: "見本ファイナンス", purpose: "自動車ローン", balance: 900_000, annualRepayment: 300_000 };
    const result = compareDocuments(
      homeLoan,
      side({ otherDebts: v([duplicateLoan1, duplicateLoan2]) }),
      side({
        otherDebts: v([
          { ...duplicateLoan1, balance: 1_100_000 },
          { ...duplicateLoan2, annualRepayment: 250_000 },
        ]),
      }),
    );
    const rows = result.fields.filter((f) => f.key.startsWith("otherDebts["));
    expect(rows.map((r) => [r.label, r.status])).toEqual([
      ["他の借入(見本ファイナンス・自動車ローン)", "changed"],
      ["他の借入(見本ファイナンス・自動車ローン)", "changed"],
    ]);
    expect(rows).toHaveLength(2);
  });
});
