import { CLEAN_SCAN, page, type SampleDocument } from "../document.ts";
import { warekiText, yen } from "../format.ts";
import { yamadaIncome2025 as inc, yamada } from "../people.ts";

// 市民税・県民税 課税(所得)証明書(令和8年度 = 令和7年中の所得)。架空の「見本市」発行。
// 実物は偽造防止の地紋入り用紙で、コピーやスキャンをすると背景に「複写」の文字が浮き出る。
// スキャン版ではその地紋を再現する。

const css = `
.cert { position: absolute; left: 18mm; top: 18mm; width: 174mm; z-index: 1; }
.cert h1 { font-size: 15pt; text-align: center; letter-spacing: 0.15em; margin: 4mm 0 6mm; }
.cert .meta { display: flex; justify-content: space-between; font-size: 8.5pt; margin-bottom: 2mm; }
.cert td, .cert th { padding: 1.4mm 2mm; font-size: 9.5pt; }
.cert .section { margin-top: 4mm; }
.cert .footer { margin-top: 10mm; font-size: 10.5pt; position: relative; }
.seal {
  position: absolute; right: 6mm; top: 6mm; width: 22mm; height: 22mm;
  border: 0.8mm solid #c0392b; color: #c0392b; font-size: 9pt; line-height: 1.15;
  display: flex; align-items: center; justify-content: center; text-align: center;
  opacity: 0.8; transform: rotate(3deg);
}
.copy-pattern {
  position: absolute; inset: 0; z-index: 0; overflow: hidden;
  background-image: radial-gradient(#d7d7d7 0.35mm, transparent 0.4mm);
  background-size: 1.6mm 1.6mm;
}
.copy-pattern span {
  position: absolute; font-size: 54pt; color: #cfcfcf; transform: rotate(-25deg);
  font-family: "Hiragino Sans", sans-serif; font-weight: bold;
}
`;

function copyPattern(): string {
  const marks: string[] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 3; col++) {
      marks.push(`<span style="left: ${col * 75 + (row % 2) * 35 - 10}mm; top: ${row * 52 + 10}mm">複写</span>`);
    }
  }
  return `<div class="copy-pattern">${marks.join("")}</div>`;
}

const body = `
<div class="cert mincho">
  <div class="meta"><span>証明番号 第 0000123 号</span><span>(令和8年度)</span></div>
  <h1>市民税・県民税　課税(所得)証明書</h1>
  <table>
    <tr><th style="width: 30mm">住所</th><td colspan="3">${yamada.address}</td></tr>
    <tr>
      <th>氏名</th><td>${yamada.name}</td>
      <th style="width: 24mm">生年月日</th><td>${warekiText(yamada.birthDate)}</td>
    </tr>
    <tr><th>課税年度</th><td>令和8年度(令和7年中の所得)</td><th>扶養人数</th><td>0 人</td></tr>
  </table>

  <table class="section">
    <tr><th colspan="2" class="center">所得の内訳</th><th colspan="2" class="center">所得控除の内訳</th></tr>
    <tr><th>給与収入</th><td class="num">${yen(inc.salary)}</td><th>社会保険料控除</th><td class="num">${yen(inc.socialInsurance)}</td></tr>
    <tr><th>給与所得</th><td class="num">${yen(inc.salaryIncome)}</td><th>生命保険料控除</th><td class="num">${yen(inc.residentLifeInsurance)}</td></tr>
    <tr><th>事業所得</th><td class="num">0</td><th>配偶者控除</th><td class="num">0</td></tr>
    <tr><th>不動産所得</th><td class="num">0</td><th>扶養控除</th><td class="num">0</td></tr>
    <tr><th>雑所得</th><td class="num">0</td><th>基礎控除</th><td class="num">${yen(inc.residentBasicDeduction)}</td></tr>
    <tr><th>合計所得金額</th><td class="num">${yen(inc.salaryIncome)}</td><th>所得控除合計</th><td class="num">${yen(inc.residentDeductionTotal)}</td></tr>
    <tr><th>総所得金額等</th><td class="num">${yen(inc.salaryIncome)}</td><th>課税標準額</th><td class="num">${yen(inc.taxableIncome)}</td></tr>
  </table>

  <table class="section">
    <tr><th class="center">区分</th><th class="center">所得割額</th><th class="center">均等割額</th><th class="center">合計</th></tr>
    <tr><th>市民税</th><td class="num">${yen(inc.municipalIncomeLevy)}</td><td class="num">${yen(inc.municipalPerCapita)}</td><td class="num">${yen(inc.municipalIncomeLevy + inc.municipalPerCapita)}</td></tr>
    <tr><th>県民税</th><td class="num">${yen(inc.prefecturalIncomeLevy)}</td><td class="num">${yen(inc.prefecturalPerCapita)}</td><td class="num">${yen(inc.prefecturalIncomeLevy + inc.prefecturalPerCapita)}</td></tr>
    <tr><th>森林環境税</th><td class="num">-</td><td class="num">${yen(inc.forestTax)}</td><td class="num">${yen(inc.forestTax)}</td></tr>
    <tr><th>年税額</th><td colspan="3" class="num">${yen(inc.annualResidentTax)}</td></tr>
  </table>

  <div class="footer">
    上記のとおり証明します。<br><br>
    令和8年10月1日<br><br>
    見本市長　見本 一郎
    <div class="seal">見本市<br>長之印</div>
  </div>
</div>
`;

export const taxCertificate: SampleDocument = {
  id: "tax-certificate",
  title: "課税(所得)証明書(令和8年度)",
  issuer: "見本市(市区町村)",
  handwritten: false,
  html: ({ scan }) => page((scan ? copyPattern() : "") + body, css),
  scan: { ...CLEAN_SCAN, skewDegrees: -0.6 },
  expected: {
    fiscalYear: 2026,
    incomeYear: 2025,
    name: yamada.name,
    address: yamada.address,
    birthDate: yamada.birthDate,
    salaryRevenue: inc.salary,
    salaryIncome: inc.salaryIncome,
    totalIncome: inc.salaryIncome,
    totalDeductions: inc.residentDeductionTotal,
    taxableIncome: inc.taxableIncome,
    annualTax: inc.annualResidentTax,
  },
};
