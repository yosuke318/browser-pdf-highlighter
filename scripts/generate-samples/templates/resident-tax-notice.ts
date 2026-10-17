import { CLEAN_SCAN, page, type SampleDocument } from "../document.ts";
import { yen } from "../format.ts";
import { yamadaIncome2025 as inc, yamada } from "../people.ts";

// 給与所得等に係る市民税・県民税 特別徴収税額の決定通知書(納税義務者用)。令和8年度。
// 勤務先経由で配られる封書型(A4)を想定。架空の「見本市」発行。

const css = `
.notice { position: absolute; left: 12mm; top: 12mm; width: 186mm; }
.notice h1 { font-size: 11.5pt; text-align: center; margin: 0 0 1mm; }
.notice .sub { text-align: center; font-size: 9pt; margin-bottom: 3mm; }
.notice td, .notice th { font-size: 8.5pt; padding: 1mm 1.5mm; }
.notice .section { margin-top: 2.5mm; }
.notice .issuer { margin-top: 5mm; text-align: right; font-size: 9.5pt; }
.months td, .months th { text-align: center; padding: 1mm 0.5mm; font-size: 8pt; }
`;

const months = ["6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月", "4月", "5月"];

const body = `
<div class="notice">
  <h1>令和8年度　給与所得等に係る市民税・県民税　特別徴収税額の決定通知書</h1>
  <div class="sub">(納税義務者用)</div>
  <table>
    <tr>
      <th style="width: 28mm">宛名番号</th><td>000456789</td>
      <th style="width: 28mm">特別徴収義務者<br>指定番号</th><td>000111222</td>
    </tr>
    <tr><th>納税義務者 住所</th><td colspan="3">${yamada.address}</td></tr>
    <tr><th>納税義務者 氏名</th><td colspan="3">${yamada.name} 様</td></tr>
    <tr><th>特別徴収義務者<br>所在地</th><td colspan="3">${yamada.employer.address}</td></tr>
    <tr><th>特別徴収義務者<br>名称</th><td colspan="3">${yamada.employer.name}</td></tr>
  </table>

  <table class="section">
    <tr><th colspan="2" class="center">所得等</th><th colspan="2" class="center">所得控除額</th></tr>
    <tr><th>給与収入</th><td class="num">${yen(inc.salary)}</td><th>社会保険料</th><td class="num">${yen(inc.socialInsurance)}</td></tr>
    <tr><th>給与所得</th><td class="num">${yen(inc.salaryIncome)}</td><th>生命保険料</th><td class="num">${yen(inc.residentLifeInsurance)}</td></tr>
    <tr><th>その他の所得</th><td class="num">0</td><th>基礎</th><td class="num">${yen(inc.residentBasicDeduction)}</td></tr>
    <tr><th>総所得金額</th><td class="num">${yen(inc.salaryIncome)}</td><th>所得控除額合計</th><td class="num">${yen(inc.residentDeductionTotal)}</td></tr>
    <tr><th>合計所得金額</th><td class="num">${yen(inc.salaryIncome)}</td><th>課税標準額(総所得)</th><td class="num">${yen(inc.taxableIncome)}</td></tr>
  </table>

  <table class="section">
    <tr><th class="center">区分</th><th class="center">市民税</th><th class="center">県民税</th><th class="center">森林環境税</th><th class="center">合計</th></tr>
    <tr><th>算出所得割額</th><td class="num">${yen(inc.municipalCalculated)}</td><td class="num">${yen(inc.prefecturalCalculated)}</td><td></td><td></td></tr>
    <tr><th>税額控除額</th><td class="num">${yen(inc.municipalAdjustment)}</td><td class="num">${yen(inc.prefecturalAdjustment)}</td><td></td><td></td></tr>
    <tr><th>所得割額</th><td class="num">${yen(inc.municipalIncomeLevy)}</td><td class="num">${yen(inc.prefecturalIncomeLevy)}</td><td></td><td></td></tr>
    <tr><th>均等割額</th><td class="num">${yen(inc.municipalPerCapita)}</td><td class="num">${yen(inc.prefecturalPerCapita)}</td><td class="num">${yen(inc.forestTax)}</td><td></td></tr>
    <tr><th>特別徴収税額(年税額)</th><td class="num">${yen(inc.municipalIncomeLevy + inc.municipalPerCapita)}</td><td class="num">${yen(inc.prefecturalIncomeLevy + inc.prefecturalPerCapita)}</td><td class="num">${yen(inc.forestTax)}</td><td class="num">${yen(inc.annualResidentTax)}</td></tr>
  </table>

  <table class="section months">
    <tr><th>月割額</th>${months.map((m) => `<th>${m}</th>`).join("")}</tr>
    <tr><th>税額</th>${months
      .map((_, i) => `<td class="num">${yen(i === 0 ? inc.juneInstallment : inc.monthlyInstallment)}</td>`)
      .join("")}</tr>
  </table>

  <div class="issuer mincho">令和8年5月15日　見本市長　見本 一郎</div>
</div>
`;

export const residentTaxNotice: SampleDocument = {
  id: "resident-tax-notice",
  title: "住民税決定通知書(特別徴収・納税義務者用、令和8年度)",
  issuer: "見本市(市区町村。勤務先経由で配付)",
  handwritten: false,
  html: () => page(body, css),
  scan: { ...CLEAN_SCAN, skewDegrees: 0.7 },
  expected: {
    fiscalYear: 2026,
    incomeYear: 2025,
    name: yamada.name,
    address: yamada.address,
    employerName: yamada.employer.name,
    salaryRevenue: inc.salary,
    salaryIncome: inc.salaryIncome,
    totalIncome: inc.salaryIncome,
    totalDeductions: inc.residentDeductionTotal,
    taxableIncome: inc.taxableIncome,
    annualTax: inc.annualResidentTax,
  },
};
