import { defineDocument } from "../rules.ts";

// 所得税及び復興特別所得税の確定申告書(第一表)。様式は国税庁が定めている。
// e-Tax や確定申告書等作成コーナーで作ったPDFは文字データがあり、金額は1桁ずつマス目に入るが、
// 取り出すとつながった数字(「9600000」)になる。手書き・スキャンの申告書は OCR に対応してから扱う。
//
// 「事業 営業等」「合計」は、左の縦書きの区分(「収入金額等」「所得金額等」「所得から差し引かれる金額」)ごとに
// 同じラベルが出てくるので、sideHeading で区分を指定して区別する。

const INCOME = ["収入金額等"];
const EARNINGS = ["所得金額等"];
const DEDUCTIONS = ["所得から差し引かれる金額"];

export default defineDocument({
  id: "tax-return",
  fields: {
    // タイトルの「令和07年分の所得税及び…」
    incomeYear: [{ id: "income-year", kind: "pattern", pattern: /((?:令和|平成|R|H)(?:元|\d{1,2})年)分/ }],
    name: [{ id: "name", kind: "label", labels: ["氏名"], direction: "right", reject: /フリガナ/ }],
    address: [{ id: "address", kind: "label", labels: ["住所"], direction: "right" }],
    // 「昭和58.07.07」のような書き方にも対応する
    birthDate: [{ id: "birth-date", kind: "label", labels: ["生年月日"], direction: "right" }],
    occupation: [{ id: "occupation", kind: "label", labels: ["職業"], direction: "right" }],
    tradeName: [{ id: "trade-name", kind: "label", labels: ["屋号・雅号", "屋号"], direction: "right" }],

    businessRevenue: [
      { id: "business-revenue", kind: "label", labels: ["事業営業等", "営業等"], direction: "right", sideHeading: INCOME },
    ],
    salaryRevenue: [{ id: "salary-revenue", kind: "label", labels: ["給与"], direction: "right", sideHeading: INCOME }],
    businessIncome: [
      { id: "business-income", kind: "label", labels: ["事業営業等", "営業等"], direction: "right", sideHeading: EARNINGS },
    ],
    totalIncome: [{ id: "total-income", kind: "label", labels: ["合計"], direction: "right", sideHeading: EARNINGS }],
    totalDeductions: [{ id: "total-deductions", kind: "label", labels: ["合計"], direction: "right", sideHeading: DEDUCTIONS }],
    taxableIncome: [{ id: "taxable-income", kind: "label", labels: ["課税される所得金額"], direction: "right" }],
    // 還付の場合は「△」付きで書かれ、負の数として取る
    taxDue: [{ id: "tax-due", kind: "label", labels: ["申告納税額"], direction: "right" }],
  },
});
