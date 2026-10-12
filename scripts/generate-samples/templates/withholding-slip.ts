import { CLEAN_SCAN, page, type SampleDocument } from "../document.ts";
import { toWareki, yen } from "../format.ts";
import { yamada, yamadaIncome2025 as inc } from "../people.ts";

// 給与所得の源泉徴収票(令和7年分・受給者交付用)。
// 国税庁の様式の欄構成をもとにした簡略版。A4用紙の上部に1枚置いてスキャンした想定。

const birth = toWareki(yamada.birthDate);

const css = `
.slip { position: absolute; left: 12mm; top: 14mm; width: 186mm; font-size: 8pt; }
.slip h1 { font-size: 12pt; text-align: center; margin: 0 0 1.5mm; letter-spacing: 0.3em; }
.slip .copy { position: absolute; right: 0; top: 0; font-size: 7pt; }
.slip td, .slip th { padding: 0.6mm 1mm; }
.slip .big { font-size: 10pt; }
.vertical { writing-mode: vertical-rl; text-align: center; width: 6mm; }
`;

const body = `
<div class="slip mincho">
  <div class="copy">(受給者交付用)</div>
  <h1>令和 7 年分　給与所得の源泉徴収票</h1>
  <table>
    <tr>
      <th rowspan="2" class="vertical">支払を受ける者</th>
      <th style="width: 18mm">住所又は居所</th>
      <td colspan="3" class="big">${yamada.address}</td>
      <th style="width: 14mm">(受給者番号)</th>
      <td style="width: 22mm">00123</td>
    </tr>
    <tr>
      <th>(役職名)</th>
      <td>${yamada.employer.position}</td>
      <th style="width: 10mm">氏名</th>
      <td colspan="3"><span class="small">(フリガナ) ${yamada.kana}</span><br><span class="big">${yamada.name}</span></td>
    </tr>
  </table>
  <table style="margin-top: -0.3mm">
    <tr>
      <th class="center">種別</th>
      <th class="center">支払金額</th>
      <th class="center">給与所得控除後の金額<br>(調整控除後)</th>
      <th class="center">所得控除の額の合計額</th>
      <th class="center">源泉徴収税額</th>
    </tr>
    <tr class="big">
      <td class="center">給料・賞与</td>
      <td class="num">内　　　　${yen(inc.salary)}</td>
      <td class="num">${yen(inc.salaryIncome)}</td>
      <td class="num">${yen(inc.incomeTaxDeductionTotal)}</td>
      <td class="num">内　　　${yen(inc.withholdingTax)}</td>
    </tr>
  </table>
  <table style="margin-top: -0.3mm">
    <tr>
      <th class="center">(源泉)控除対象配偶者の有無等</th>
      <th class="center">配偶者(特別)控除の額</th>
      <th class="center">控除対象扶養親族の数<br>(配偶者を除く)</th>
      <th class="center">16歳未満扶養親族の数</th>
      <th class="center">障害者の数<br>(本人を除く)</th>
      <th class="center">非居住者である親族の数</th>
    </tr>
    <tr>
      <td class="center">無</td><td class="num"></td><td class="center">0 人</td>
      <td class="center">0 人</td><td class="center">0 人</td><td class="center">0 人</td>
    </tr>
  </table>
  <table style="margin-top: -0.3mm">
    <tr>
      <th class="center">社会保険料等の金額</th>
      <th class="center">生命保険料の控除額</th>
      <th class="center">地震保険料の控除額</th>
      <th class="center">住宅借入金等特別控除の額</th>
      <th class="center">特定親族特別控除の額</th>
    </tr>
    <tr class="big">
      <td class="num">${yen(inc.socialInsurance)}</td>
      <td class="num">${yen(inc.lifeInsurance)}</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num"></td>
    </tr>
  </table>
  <table style="margin-top: -0.3mm">
    <tr><th style="width: 12mm">(摘要)</th><td style="height: 9mm"></td></tr>
  </table>
  <table style="margin-top: -0.3mm" class="small">
    <tr>
      <th>未成年者</th><th>外国人</th><th>死亡退職</th><th>災害者</th><th>乙欄</th>
      <th>本人が障害者</th><th>寡婦</th><th>ひとり親</th><th>勤労学生</th>
      <th colspan="4" class="center">中途就・退職</th>
      <th colspan="4" class="center">受給者生年月日</th>
    </tr>
    <tr>
      <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
      <td>就職</td><td>退職</td><td>年</td><td>月 日</td>
      <td class="center">${birth.era}</td><td class="center">${birth.year} 年</td>
      <td class="center">${birth.month} 月</td><td class="center">${birth.day} 日</td>
    </tr>
  </table>
  <table style="margin-top: -0.3mm">
    <tr>
      <th rowspan="3" class="vertical">支払者</th>
      <th style="width: 34mm">個人番号又は法人番号</th>
      <td>(記載省略)</td>
    </tr>
    <tr><th>住所(居所)<br>又は所在地</th><td class="big">${yamada.employer.address}</td></tr>
    <tr><th>氏名又は名称</th><td class="big">${yamada.employer.name}　　<span class="small">(電話) ${yamada.employer.phone}</span></td></tr>
  </table>
</div>
`;

export const withholdingSlip: SampleDocument = {
  id: "withholding-slip",
  title: "源泉徴収票(令和7年分)",
  issuer: "株式会社サンプル商事(勤務先)",
  handwritten: false,
  html: () => page(body, css),
  scan: CLEAN_SCAN,
  expected: {
    year: 2025,
    name: yamada.name,
    address: yamada.address,
    birthDate: yamada.birthDate,
    employerName: yamada.employer.name,
    employerAddress: yamada.employer.address,
    paymentAmount: inc.salary,
    salaryIncomeAfterDeduction: inc.salaryIncome,
    totalDeductions: inc.incomeTaxDeductionTotal,
    withholdingTax: inc.withholdingTax,
    socialInsurance: inc.socialInsurance,
  },
};
