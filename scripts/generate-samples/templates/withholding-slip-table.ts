import { page } from "../document.ts";
import { toWareki, yen } from "../format.ts";
import { yamadaIncome2025 as inc, yamada } from "../people.ts";

// 給与所得の源泉徴収票(令和7年分)を、国税庁の様式ではなく表の形で出力したPDFを再現したもの。
// 給与システムによっては、源泉徴収票の内容を「欄の名前 | 値」の2列の表で出力する。
// - 欄の名前の右に値がある(国税庁の様式のように、金額が欄の名前の下にあるわけではない)
// - 欄の名前が様式と少し違う(「住所」「生年月日」「所在地」「名称」など)
// - 枠の見出し(支払を受ける者・支払者)は、表の上の横書きの見出し

const birth = toWareki(yamada.birthDate);

const css = `
.sheet { position: absolute; left: 20mm; top: 18mm; width: 170mm; font-size: 9pt; }
.sheet h1 { font-size: 13pt; margin: 0 0 1mm; }
.sheet .sub { margin: 0 0 5mm; color: #444; font-size: 8pt; }
.sheet h2 { font-size: 10pt; margin: 5mm 0 1.5mm; }
.sheet table.list { width: 100%; }
.sheet table.list th { width: 62mm; text-align: left; background: #f2f2f2; font-weight: normal; }
.sheet table.list td, .sheet table.list th { padding: 1.2mm 2mm; }
.sheet .num { text-align: right; }
`;

const row = (label: string, value: string, className = "") =>
  `<tr><th>${label}</th><td${className ? ` class="${className}"` : ""}>${value}</td></tr>`;

const body = `
<div class="sheet">
  <h1>令和7年分 給与所得の源泉徴収票</h1>
  <p class="sub">電子交付・受給者交付用</p>

  <h2>支払を受ける者</h2>
  <table class="list">
    ${row("住所", yamada.address)}
    ${row("フリガナ", yamada.kana)}
    ${row("氏名", yamada.name)}
    ${row("生年月日", `${birth.era}${birth.year}年${birth.month}月${birth.day}日`)}
    ${row("役職名", yamada.employer.position)}
  </table>

  <h2>支払金額等</h2>
  <table class="list">
    ${row("種別", "給料・賞与")}
    ${row("支払金額", `${yen(inc.salary)}円`, "num")}
    ${row("給与所得控除後の金額(調整控除後)", `${yen(inc.salaryIncome)}円`, "num")}
    ${row("所得控除の額の合計額", `${yen(inc.incomeTaxDeductionTotal)}円`, "num")}
    ${row("源泉徴収税額", `${yen(inc.withholdingTax)}円`, "num")}
    ${row("社会保険料等の金額", `${yen(inc.socialInsurance)}円`, "num")}
    ${row("生命保険料の控除額", `${yen(inc.lifeInsurance)}円`, "num")}
  </table>

  <h2>支払者</h2>
  <table class="list">
    ${row("所在地", yamada.employer.address)}
    ${row("名称", yamada.employer.name)}
    ${row("電話番号", yamada.employer.phone)}
  </table>
</div>
`;

export const withholdingSlipTable = {
  /** 出力先(samples/ からの相対パス)。正解データは源泉徴収票(withholding-slip)と同じ */
  file: "withholding-slip/table.pdf",
  documentId: "withholding-slip",
  title: "源泉徴収票(令和7年分・表の形の電子交付)",
  html: () => page(body, css),
};
