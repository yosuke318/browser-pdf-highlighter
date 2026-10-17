import { defineDocument } from "../rules.ts";

// 給与所得の源泉徴収票。様式は国税庁が定めていて、欄の並びはどの会社が発行してもほぼ同じ。
// 読み違えやすい点は .claude/skills/japanese-real-estate-docs/references/withholding-slip.md を参照。
//
// 中途就職日(hiredOn)・中途退職日(leftOn)・乙欄(secondaryEmployment)は、ダミーPDFでは空欄で
// 正解データがなく、ルールの正しさを確かめられないため、まだルールを書いていない(未検出になる)。

/** 上の枠(支払を受ける者)。下の枠(支払者)の「氏名又は名称」「住所(居所)又は所在地」と区別する */
const RECIPIENT = { start: ["支払を受ける者"], end: ["支払者"] };
/** 下の枠(支払者 = 勤務先) */
const PAYER = { start: ["支払者"] };

export default defineDocument({
  id: "withholding-slip",
  fields: {
    // タイトルの前の「令和7年分」。字間があいていると「令和」「7」「年分」に分かれるので、行の文字列から取る
    incomeYear: [{ id: "title-year", kind: "pattern", pattern: /((?:令和|平成|R|H)(?:元|\d{1,2})年)分/ }],

    // 「氏名」の右の欄。上にフリガナが入っていることがあるので、フリガナの行は取らない
    name: [
      {
        id: "recipient-name",
        kind: "label",
        labels: ["氏名"],
        direction: ["right", "below"],
        section: RECIPIENT,
        reject: /フリガナ|^\(.*\)$/,
      },
    ],
    address: [
      { id: "recipient-address", kind: "label", labels: ["住所又は居所", "住所"], direction: "right", section: RECIPIENT },
    ],
    // 元号・年・月・日が別々のマスに入っているので、セルをつなげて日付にする
    birthDate: [{ id: "birth-date", kind: "label", labels: ["受給者生年月日", "生年月日"], direction: "below", maxCells: 4 }],

    employerName: [
      { id: "payer-name", kind: "label", labels: ["氏名又は名称"], direction: "right", section: PAYER, reject: /^\(電話\)/ },
    ],
    // ラベルが「住所(居所)」「又は所在地」の2行に分かれていることがある
    employerAddress: [
      {
        id: "payer-address",
        kind: "label",
        labels: ["住所(居所)又は所在地", "住所(居所)", "所在地"],
        direction: "right",
        section: PAYER,
      },
    ],

    // 金額の欄は、ラベルの下の値を取る。右向きに探さないのは、摘要欄に「前職分 支払金額 ○○円」のように
    // 書かれた前の勤務先の金額を取らないため。
    // 支払金額と源泉徴収税額の欄には、左上に「内」と小さな文字で未払いの金額(未徴収の税額)が入ることがあるので、
    // 文字が大きい方(本来の金額)を選ぶ
    paymentAmount: [{ id: "payment-amount", kind: "label", labels: ["支払金額"], direction: "below", prefer: "largest" }],
    salaryIncomeAfterDeduction: [
      {
        id: "salary-income",
        kind: "label",
        labels: ["給与所得控除後の金額", "給与所得控除後の金額(調整控除後)"],
        direction: "below",
      },
    ],
    totalDeductions: [{ id: "total-deductions", kind: "label", labels: ["所得控除の額の合計額"], direction: "below" }],
    withholdingTax: [{ id: "withholding-tax", kind: "label", labels: ["源泉徴収税額"], direction: "below", prefer: "largest" }],
    socialInsurance: [{ id: "social-insurance", kind: "label", labels: ["社会保険料等の金額"], direction: "below" }],
  },
});
