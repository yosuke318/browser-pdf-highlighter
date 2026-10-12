import { CLEAN_SCAN, page, type SampleDocument } from "../document.ts";
import { digitCells, toWareki } from "../format.ts";
import { sato } from "../people.ts";

// 所得税及び復興特別所得税の確定申告書 第一表(令和7年分)。
// 個人事業主が国税庁の確定申告書等作成コーナーで作成・印刷した想定(活字)。
// 実際の様式の欄構成をもとにした簡略版で、欄番号は省略している。

const v = {
  businessRevenue: 9_600_000,
  businessIncome: 3_850_000,
  totalIncome: 3_850_000,
  socialInsurance: 980_000,
  smallBusinessMutualAid: 840_000,
  lifeInsurance: 40_000,
  basicDeduction: 680_000,
  deductionTotal: 2_540_000,
  taxableIncome: 1_310_000,
  incomeTax: 65_500,
  reconstructionTax: 1_375,
  totalTax: 66_875,
  withheld: 0,
  taxDue: 66_800,
};

const birth = toWareki(sato.birthDate);

const css = `
.ret { position: absolute; left: 10mm; top: 10mm; width: 190mm; font-size: 8pt; }
.ret .head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 2mm; }
.ret h1 { font-size: 11pt; margin: 0; }
.ret .tag { border: 0.3mm solid #222; padding: 0.5mm 2mm; font-size: 9pt; }
.ret td, .ret th { padding: 0.7mm 1.2mm; font-size: 8pt; vertical-align: middle; }
.ret .cols { display: flex; gap: 3mm; margin-top: 3mm; }
.ret .cols > table { width: 50%; }
.ret .group { writing-mode: vertical-rl; text-align: center; width: 6mm; background: #e9e9e9; }
.ret td.amt { text-align: right; padding: 0.4mm 0.8mm; }
`;

function cells(label: string, value: number | null): string {
  return `<th>${label}</th><td class="amt">${digitCells(value, 10)}</td>`;
}

function row(label: string, value: number | null): string {
  return `<tr>${cells(label, value)}</tr>`;
}

const body = `
<div class="ret">
  <div class="head">
    <h1>令和 07 年分の所得税及び復興特別所得税の確定申告書</h1>
    <span class="tag">第一表</span>
  </div>
  <table>
    <tr><th style="width: 22mm">住所</th><td colspan="3">${sato.address}</td><th style="width: 18mm">個人番号</th><td>(記載省略)</td></tr>
    <tr><th>屋号・雅号</th><td colspan="3">${sato.tradeName}</td><th>職業</th><td>${sato.occupation}</td></tr>
    <tr><th>フリガナ</th><td colspan="3">${sato.kana}</td><th>世帯主の氏名</th><td>${sato.name}</td></tr>
    <tr>
      <th>氏名</th><td colspan="3" style="font-size: 10.5pt">${sato.name}</td>
      <th>生年月日</th><td>${birth.era} ${String(birth.year).padStart(2, "0")}.${String(birth.month).padStart(2, "0")}.${String(birth.day).padStart(2, "0")}</td>
    </tr>
    <tr><th>電話番号</th><td colspan="3">${sato.phone}</td><th>種類</th><td>青色</td></tr>
  </table>

  <div class="cols">
    <table>
      <tr><th rowspan="11" class="group">収入金額等</th><th colspan="2" class="center">(単位は円)</th></tr>
      ${row("事業 営業等", v.businessRevenue)}
      ${row("事業 農業", null)}
      ${row("不動産", null)}
      ${row("配当", null)}
      ${row("給与", null)}
      ${row("雑 公的年金等", null)}
      ${row("雑 業務", null)}
      ${row("雑 その他", null)}
      ${row("総合譲渡 短期", null)}
      ${row("一時", null)}
      <tr><th rowspan="8" class="group">所得金額等</th>${cells("事業 営業等", v.businessIncome)}</tr>
      ${row("事業 農業", null)}
      ${row("不動産", null)}
      ${row("利子", null)}
      ${row("配当", null)}
      ${row("給与", null)}
      ${row("雑", null)}
      ${row("合計", v.totalIncome)}
    </table>
    <table>
      <tr><th rowspan="7" class="group">所得から差し引かれる金額</th>${cells("社会保険料控除", v.socialInsurance)}</tr>
      ${row("小規模企業共済等掛金控除", v.smallBusinessMutualAid)}
      ${row("生命保険料控除", v.lifeInsurance)}
      ${row("配偶者(特別)控除", null)}
      ${row("扶養控除", null)}
      ${row("基礎控除", v.basicDeduction)}
      ${row("合計", v.deductionTotal)}
      <tr><th rowspan="8" class="group">税金の計算</th>${cells("課税される所得金額", v.taxableIncome)}</tr>
      ${row("上の金額に対する税額", v.incomeTax)}
      ${row("再差引所得税額(基準所得税額)", v.incomeTax)}
      ${row("復興特別所得税額", v.reconstructionTax)}
      ${row("所得税及び復興特別所得税の額", v.totalTax)}
      ${row("源泉徴収税額", v.withheld)}
      ${row("申告納税額", v.taxDue)}
      ${row("納める税金", v.taxDue)}
    </table>
  </div>
</div>
`;

export const taxReturn: SampleDocument = {
  id: "tax-return",
  title: "確定申告書 第一表(令和7年分)",
  issuer: "本人作成(様式は国税庁)",
  handwritten: false,
  html: () => page(body, css),
  scan: { ...CLEAN_SCAN, skewDegrees: -0.3 },
  expected: {
    year: 2025,
    name: sato.name,
    address: sato.address,
    birthDate: sato.birthDate,
    occupation: sato.occupation,
    tradeName: sato.tradeName,
    businessRevenue: v.businessRevenue,
    businessIncome: v.businessIncome,
    totalIncome: v.totalIncome,
    totalDeductions: v.deductionTotal,
    taxableIncome: v.taxableIncome,
    taxDue: v.taxDue,
  },
};
