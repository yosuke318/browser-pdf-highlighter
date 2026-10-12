import { CLEAN_SCAN, createHandwriting, page, type SampleDocument } from "../document.ts";
import { age, manYen, toWareki } from "../format.ts";
import { yamada, yamadaIncome2025 } from "../people.ts";

// 住宅ローン借入申込書。架空の「サンプル銀行」の独自様式。
// 印刷された記入欄に、申込者が手書きで記入した想定。

const appliedOn = "2026-09-20" as const;
const birth = toWareki(yamada.birthDate);
const joined = toWareki(yamada.employer.joinedOn);

const loan = {
  amount: 40_000_000,
  years: 35,
  propertyAddress: "見本県見本市緑町2丁目3番4号",
  propertyType: "新築マンション",
  propertyPrice: 45_000_000,
  ownFunds: 5_000_000,
};

const otherDebt = {
  lender: "見本ファイナンス",
  purpose: "自動車ローン",
  balance: 1_200_000,
  annualRepayment: 360_000,
};

const serviceYears = 15;
const h = createHandwriting(193);

const css = `
.form { position: absolute; left: 12mm; top: 12mm; width: 186mm; }
.form .bank { font-size: 9pt; }
.form h1 { font-size: 15pt; text-align: center; margin: 1mm 0 4mm; letter-spacing: 0.2em; }
.form .date { text-align: right; margin-bottom: 2mm; }
.form h2 { font-size: 9.5pt; margin: 3.5mm 0 1mm; border-left: 1.2mm solid #333; padding-left: 1.5mm; }
.form td, .form th { padding: 1.3mm 1.5mm; height: 9mm; vertical-align: middle; }
.form th { width: 30mm; }
.unit { font-size: 8pt; margin-left: 1mm; }
`;

const body = `
<div class="form">
  <div class="bank">株式会社サンプル銀行 御中</div>
  <h1>住宅ローン借入申込書</h1>
  <div class="date">申込日　令和 ${h(String(toWareki(appliedOn).year))} 年 ${h("9")} 月 ${h("20")} 日</div>

  <h2>お申込内容</h2>
  <table>
    <tr>
      <th>借入希望額</th><td>${h(manYen(loan.amount))}<span class="unit">万円</span></td>
      <th>借入期間</th><td>${h(String(loan.years))}<span class="unit">年</span></td>
    </tr>
    <tr><th>返済方法</th><td colspan="3">元利均等返済 ・ 元金均等返済　(${h("元利均等")})</td></tr>
  </table>

  <h2>申込人</h2>
  <table>
    <tr><th>フリガナ</th><td colspan="3">${h(yamada.kana)}</td></tr>
    <tr><th>氏名</th><td colspan="3">${h(yamada.name)}</td></tr>
    <tr>
      <th>生年月日</th><td>昭和・平成 ${h(String(birth.year))} 年 ${h(String(birth.month))} 月 ${h(String(birth.day))} 日</td>
      <th>年齢</th><td>${h(String(age(yamada.birthDate, appliedOn)))}<span class="unit">歳</span></td>
    </tr>
    <tr><th>現住所</th><td colspan="3">${h(yamada.address)}</td></tr>
    <tr>
      <th>電話番号</th><td>${h(yamada.phone)}</td>
      <th>家族構成</th><td>${h("配偶者・子1人")}</td>
    </tr>
  </table>

  <h2>勤務先</h2>
  <table>
    <tr><th>勤務先名</th><td colspan="3">${h(yamada.employer.name)}</td></tr>
    <tr><th>所在地</th><td colspan="3">${h(yamada.employer.address)}</td></tr>
    <tr>
      <th>業種</th><td>${h(yamada.employer.industry)}</td>
      <th>雇用形態</th><td>${h(yamada.employer.employmentType)}</td>
    </tr>
    <tr>
      <th>入社年月</th><td>平成 ${h(String(joined.year))} 年 ${h(String(joined.month))} 月</td>
      <th>勤続年数</th><td>${h(String(serviceYears))}<span class="unit">年</span></td>
    </tr>
    <tr>
      <th>前年度税込年収</th><td>${h(manYen(yamadaIncome2025.salary))}<span class="unit">万円</span></td>
      <th>役職</th><td>${h(yamada.employer.position)}</td>
    </tr>
  </table>

  <h2>他の借入(住宅ローン以外)</h2>
  <table>
    <tr><th>借入先</th><th>借入目的</th><th>借入残高</th><th>年間返済額</th></tr>
    <tr>
      <td>${h(otherDebt.lender)}</td><td>${h(otherDebt.purpose)}</td>
      <td>${h(manYen(otherDebt.balance))}<span class="unit">万円</span></td>
      <td>${h(manYen(otherDebt.annualRepayment))}<span class="unit">万円</span></td>
    </tr>
    <tr><td></td><td></td><td><span class="unit">万円</span></td><td><span class="unit">万円</span></td></tr>
  </table>

  <h2>購入物件</h2>
  <table>
    <tr><th>物件所在地</th><td colspan="3">${h(loan.propertyAddress)}</td></tr>
    <tr>
      <th>物件の種類</th><td>${h(loan.propertyType)}</td>
      <th>購入価格</th><td>${h(manYen(loan.propertyPrice))}<span class="unit">万円</span></td>
    </tr>
    <tr><th>自己資金</th><td colspan="3">${h(manYen(loan.ownFunds))}<span class="unit">万円</span></td></tr>
  </table>
</div>
`;

export const homeLoanApplication: SampleDocument = {
  id: "home-loan-application",
  title: "住宅ローン借入申込書",
  issuer: "サンプル銀行(金融機関の独自様式)",
  handwritten: true,
  html: () => page(body, css),
  scan: { ...CLEAN_SCAN, skewDegrees: 0.9, noise: 8 },
  expected: {
    appliedOn,
    name: yamada.name,
    birthDate: yamada.birthDate,
    age: age(yamada.birthDate, appliedOn),
    address: yamada.address,
    employerName: yamada.employer.name,
    employmentType: yamada.employer.employmentType,
    joinedOn: yamada.employer.joinedOn.slice(0, 7),
    yearsOfService: serviceYears,
    annualIncome: yamadaIncome2025.salary,
    otherDebts: [otherDebt],
    loanAmount: loan.amount,
    loanYears: loan.years,
    propertyAddress: loan.propertyAddress,
    propertyPrice: loan.propertyPrice,
  },
};
