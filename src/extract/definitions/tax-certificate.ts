import { defineDocument } from "../rules.ts";

// 課税証明書・所得証明書(市区町村が発行)。自治体ごとに様式が違うので、ラベルの近くを探し、
// ラベルの表記ゆれ(schema/extraction-fields.json の sourceLabels)を候補として並べる。
// 抽出項目の定義にない「発行自治体」は抽出しない。

const YEAR = "(?:令和|平成|R|H)(?:元|\\d{1,2})年";

export default defineDocument({
  id: "tax-certificate",
  fields: {
    // 「(令和8年度)」「令和8年度(令和7年中の所得)」
    fiscalYear: [{ id: "fiscal-year", kind: "pattern", pattern: new RegExp(`(${YEAR})度`) }],
    // 対象年(所得の年)。書かれていなければ年度の前年
    incomeYear: [
      { id: "income-year", kind: "pattern", pattern: new RegExp(`(${YEAR})中`) },
      {
        id: "income-year-from-fiscal-year",
        kind: "derive",
        from: "fiscalYear",
        compute: (v) => (typeof v === "number" ? v - 1 : null),
      },
    ],
    name: [{ id: "name", kind: "label", labels: ["氏名"], direction: "right", remove: /(様|殿)$/ }],
    address: [{ id: "address", kind: "label", labels: ["住所"], direction: "right" }],
    birthDate: [{ id: "birth-date", kind: "label", labels: ["生年月日"], direction: "right" }],

    salaryRevenue: [
      { id: "salary-revenue", kind: "label", labels: ["給与収入", "給与の収入金額", "給与収入金額"], direction: "right" },
    ],
    salaryIncome: [{ id: "salary-income", kind: "label", labels: ["給与所得", "給与所得金額"], direction: "right" }],
    totalIncome: [
      { id: "total-income", kind: "label", labels: ["合計所得金額", "総所得金額", "総所得金額等"], direction: "right" },
    ],
    totalDeductions: [
      { id: "total-deductions", kind: "label", labels: ["所得控除合計", "所得控除額合計", "所得控除額"], direction: "right" },
    ],
    taxableIncome: [{ id: "taxable-income", kind: "label", labels: ["課税標準額", "課税総所得金額"], direction: "right" }],
    // 市民税・県民税・森林環境税の内訳が並ぶ様式では、合計の列(行の右端)を取る。
    // 合計の列はページの右端近くにあり、ラベルから文字60個分ほど離れていることがある
    annualTax: [
      {
        id: "annual-tax",
        kind: "label",
        labels: ["年税額", "税額合計", "合計税額"],
        direction: "right",
        prefer: "farthest",
        maxDistance: 60,
      },
    ],
  },
});
