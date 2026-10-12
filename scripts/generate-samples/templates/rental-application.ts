import { createHandwriting, FAX_SCAN, page, type SampleDocument } from "../document.ts";
import { age, manYen, toWareki, yen } from "../format.ts";
import { tanaka, tanakaGuarantor as g } from "../people.ts";

// 賃貸の入居申込書。架空の「見本不動産管理」の独自様式。
// 手書きで記入され、仲介会社からFAXで届いたものをスキャンした想定(上端にFAXの送信記録が入る)。

const appliedOn = "2026-10-05" as const;
const birth = toWareki(tanaka.birthDate);
const gBirth = toWareki(g.birthDate);
const joined = toWareki(tanaka.employer.joinedOn);
const tanakaYears = 3;
const guarantorYears = 30;

const property = { name: "サンプルハイツ", room: "201", rent: 85_000 };
const h = createHandwriting(206);

const css = `
.fax-header {
  position: absolute; left: 6mm; top: 3mm; right: 6mm; font-size: 7.5pt;
  font-family: "Courier New", monospace; display: flex; justify-content: space-between;
}
.form { position: absolute; left: 10mm; top: 12mm; width: 190mm; }
.form h1 { font-size: 15pt; text-align: center; margin: 0 0 1mm; letter-spacing: 0.3em; }
.form .to { font-size: 9pt; }
.form .date { text-align: right; margin-bottom: 1.5mm; }
.form h2 { font-size: 9.5pt; margin: 2.5mm 0 1mm; background: #333; color: #fff; padding: 0.6mm 2mm; }
.form td, .form th { padding: 1mm 1.5mm; height: 8.5mm; vertical-align: middle; }
.form th { width: 26mm; }
.unit { font-size: 8pt; margin-left: 1mm; }
.rules { font-size: 6.5pt; margin-top: 2mm; line-height: 1.35; }
`;

function personRows(p: {
  kana: string;
  name: string;
  era: string;
  birth: { year: number; month: number; day: number };
  age: number;
  address: string;
  phone: string;
  employerName: string;
  employerAddress: string;
  employerPhone: string;
  years: number;
  income: number;
}): string {
  return `
    <tr><th>フリガナ</th><td colspan="3">${h(p.kana)}</td></tr>
    <tr><th>氏名</th><td>${h(p.name)}</td>
      <th>生年月日</th><td>${p.era} ${h(String(p.birth.year))} 年 ${h(String(p.birth.month))} 月 ${h(String(p.birth.day))} 日(${h(String(p.age))}歳)</td></tr>
    <tr><th>現住所</th><td colspan="3">${h(p.address)}</td></tr>
    <tr><th>電話番号</th><td colspan="3">${h(p.phone)}</td></tr>
    <tr><th>勤務先</th><td>${h(p.employerName)}</td><th>勤務先電話</th><td>${h(p.employerPhone)}</td></tr>
    <tr><th>勤務先所在地</th><td colspan="3">${h(p.employerAddress)}</td></tr>
    <tr><th>勤続年数</th><td>${h(String(p.years))}<span class="unit">年</span></td>
      <th>税込年収</th><td>${h(manYen(p.income))}<span class="unit">万円</span></td></tr>`;
}

const body = `
<div class="fax-header"><span>2026/10/05 14:32</span><span>FROM: 見本不動産仲介　FAX 000-0000-0001</span><span>P.001/001</span></div>
<div class="form">
  <div class="to">見本不動産管理株式会社 御中</div>
  <h1>入居申込書</h1>
  <div class="date">申込日　令和 ${h(String(toWareki(appliedOn).year))} 年 ${h("10")} 月 ${h("5")} 日</div>

  <h2>申込物件</h2>
  <table>
    <tr>
      <th>物件名</th><td>${h(property.name)}</td>
      <th>号室</th><td>${h(property.room)}<span class="unit">号室</span></td>
      <th>賃料</th><td>${h(yen(property.rent))}<span class="unit">円</span></td>
    </tr>
  </table>

  <h2>申込者(契約者)</h2>
  <table>
    ${personRows({
      kana: tanaka.kana,
      name: tanaka.name,
      era: "平成",
      birth,
      age: age(tanaka.birthDate, appliedOn),
      address: tanaka.address,
      phone: tanaka.phone,
      employerName: tanaka.employer.name,
      employerAddress: tanaka.employer.address,
      employerPhone: tanaka.employer.phone,
      years: tanakaYears,
      income: tanaka.annualIncome,
    })}
    <tr><th>雇用形態</th><td>${h(tanaka.employer.employmentType)}</td>
      <th>入社年月</th><td>令和 ${h(String(joined.year))} 年 ${h(String(joined.month))} 月</td></tr>
  </table>

  <h2>連帯保証人</h2>
  <table>
    <tr><th>続柄</th><td colspan="3">${h(g.relationship)}</td></tr>
    ${personRows({
      kana: g.kana,
      name: g.name,
      era: "昭和",
      birth: gBirth,
      age: age(g.birthDate, appliedOn),
      address: g.address,
      phone: g.phone,
      employerName: g.employer.name,
      employerAddress: g.employer.address,
      employerPhone: g.employer.phone,
      years: guarantorYears,
      income: g.annualIncome,
    })}
  </table>

  <h2>緊急連絡先</h2>
  <table>
    <tr><th>氏名</th><td>${h("田中 由美")}</td><th>続柄</th><td>${h("母")}</td><th>電話番号</th><td>${h("000-5555-7777")}</td></tr>
  </table>

  <div class="rules">
    【申込規定】1. 本申込書の記載内容に虚偽があった場合、申込を取り消すことがあります。
    2. 審査の結果、連帯保証人に代えて家賃保証会社の利用をお願いする場合があります。
    3. 本申込書は契約締結後、建物賃貸借契約書の一部として取り扱います。
  </div>
</div>
`;

export const rentalApplication: SampleDocument = {
  id: "rental-application",
  title: "入居申込書(賃貸)",
  issuer: "見本不動産管理(管理会社の独自様式)",
  handwritten: true,
  html: () => page(body, css),
  scan: FAX_SCAN,
  expected: {
    appliedOn,
    propertyName: property.name,
    room: property.room,
    rent: property.rent,
    applicant: {
      name: tanaka.name,
      birthDate: tanaka.birthDate,
      age: age(tanaka.birthDate, appliedOn),
      address: tanaka.address,
      employerName: tanaka.employer.name,
      employmentType: tanaka.employer.employmentType,
      yearsOfService: tanakaYears,
      annualIncome: tanaka.annualIncome,
    },
    guarantor: {
      name: g.name,
      relationship: g.relationship,
      birthDate: g.birthDate,
      age: age(g.birthDate, appliedOn),
      employerName: g.employer.name,
      yearsOfService: guarantorYears,
      annualIncome: g.annualIncome,
    },
  },
};
