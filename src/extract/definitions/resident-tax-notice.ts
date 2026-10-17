import { defineDocument } from "../rules.ts";

// 住民税決定通知書(特別徴収・納税義務者用)。勤務先経由で配られる。自治体ごとに様式が違うので、ラベルの近くを探す。
//
// 「特別徴収義務者」(勤務先)のラベルは、指定番号・所在地・名称の行に何度も出る。
// 名称だけを取るため、番号らしい値と住所らしい値は取らない。

const YEAR = "(?:令和|平成|R|H)(?:元|\\d{1,2})年";

export default defineDocument({
  id: "resident-tax-notice",
  fields: {
    // タイトルの前の「令和8年度」
    fiscalYear: [{ id: "fiscal-year", kind: "pattern", pattern: new RegExp(`(${YEAR})度`) }],
    // 対象年(所得の年)は通知書には書かれないことが多い。書かれていなければ年度の前年
    incomeYear: [
      { id: "income-year", kind: "pattern", pattern: new RegExp(`(${YEAR})中`) },
      {
        id: "income-year-from-fiscal-year",
        kind: "derive",
        from: "fiscalYear",
        compute: (v) => (typeof v === "number" ? v - 1 : null),
      },
    ],
    // 「山田太郎様」の「様」は値に含めない
    name: [{ id: "name", kind: "label", labels: ["納税義務者氏名", "氏名"], direction: "right", remove: /\s*(様|殿)$/ }],
    address: [{ id: "address", kind: "label", labels: ["納税義務者住所", "住所"], direction: "right" }],
    employerName: [
      {
        id: "employer-name",
        kind: "label",
        labels: ["特別徴収義務者名称", "特別徴収義務者", "名称"],
        direction: "right",
        // 指定番号(数字だけ)と所在地(丁目・番地を含む)の行の値は取らない
        reject: /^[\d-]+$|\d+丁目|番地|\d+番/,
      },
    ],

    salaryRevenue: [{ id: "salary-revenue", kind: "label", labels: ["給与収入", "給与収入額"], direction: "right" }],
    salaryIncome: [{ id: "salary-income", kind: "label", labels: ["給与所得"], direction: "right" }],
    totalIncome: [{ id: "total-income", kind: "label", labels: ["合計所得金額", "総所得金額"], direction: "right" }],
    totalDeductions: [
      { id: "total-deductions", kind: "label", labels: ["所得控除額合計", "所得控除合計", "所得控除額"], direction: "right" },
    ],
    // 「課税標準額(総所得)」のようにラベルに補足が付いていても、隣の値を取る
    taxableIncome: [{ id: "taxable-income", kind: "label", labels: ["課税標準額"], direction: "right" }],
    // 「特別徴収税額(年税額)」の行は、市民税・県民税・森林環境税・合計と並ぶので、右端の合計を取る。
    // 合計の列はページの右端近くにあり、ラベルから文字60個分ほど離れていることがある
    annualTax: [
      {
        id: "annual-tax",
        kind: "label",
        labels: ["特別徴収税額(年税額)", "特別徴収税額", "年税額", "税額合計"],
        direction: "right",
        prefer: "farthest",
        maxDistance: 60,
      },
    ],
  },
});
