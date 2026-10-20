import { defineDocument } from "../rules.ts";

// 給与所得の源泉徴収票。様式は国税庁が定めていて、欄の並びはどの会社が発行してもほぼ同じ。
// 読み違えやすい点は .claude/skills/japanese-real-estate-docs/references/withholding-slip.md を参照。
//
// 中途就職日(hiredOn)・中途退職日(leftOn)・乙欄(secondaryEmployment)は、ダミーPDFでは空欄で
// 正解データがなく、ルールの正しさを確かめられないため、まだルールを書いていない(未検出になる)。

/**
 * 上の枠(支払を受ける者)。下の枠(支払者)の「氏名又は名称」「住所(居所)又は所在地」と区別する。
 * 見出しは縦書きで、スキャンPDFの OCR では読めないことが多いので、横書きのタイトルと
 * 「個人番号又は法人番号」(支払者の枠の1行目)も目印にする
 */
const RECIPIENT = { start: ["支払を受ける者", "給与所得の源泉徴収票"], end: ["支払者", "個人番号又は法人番号"] };
/** 下の枠(支払者 = 勤務先) */
const PAYER = { start: ["支払者", "個人番号又は法人番号"] };

/**
 * 金額の行の見出し(左から順)。様式で並びが決まっているので、OCR で読めない欄の名前があっても、
 * 読めた見出しを目印に、下の行の金額を左から順に割り当てられる(電子交付のPDFは欄の名前が小さな画像のため)
 */
const AMOUNT_HEADERS = [
  ["支払金額"],
  ["給与所得控除後の金額", "給与所得控除後の金額(調整控除後)"],
  ["所得控除の額の合計額"],
  ["源泉徴収税額"],
] as const;

/**
 * 都道府県から始まる住所(都道府県の後に市区町村が続くもの)。欄の名前が読めないときに、値の形から住所を探す。
 * ダミーの「見本県見本市」も読めるように、都道府県の名前の一覧ではなく「漢字2〜3文字+都道府県」の形で判定する
 */
const ADDRESS = /(\p{Script=Han}{2,3}[都道府県][\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]{1,8}?[市区町村郡].*)/u;

/** 郵便番号だけの文字列 */
const POSTAL_CODE_ONLY = /^〒?\d{3}-?\d{4}$/;

/** フリガナ(カタカナだけの文字列)。氏名の欄で、漢字の氏名より後回しにする */
const KANA_ONLY = /^[\p{Script=Katakana}ー・]+$/u;

/**
 * 金額の欄の名前の右にある値を取る(欄の名前と値が左右に並ぶ表の形の源泉徴収票のため)。
 * 表の金額は右寄せで、欄の名前から離れていることが多いので、遠くまで探す
 */
const amountRight = (id: string, labels: readonly string[]) =>
  ({ id, kind: "label", labels, direction: "right", maxDistance: 60 }) as const;

export default defineDocument({
  id: "withholding-slip",
  fields: {
    // タイトルの前の「令和7年分」。字間があいていると「令和」「7」「年分」に分かれるので、行の文字列から取る
    incomeYear: [{ id: "title-year", kind: "pattern", pattern: /((?:令和|平成|R|H)(?:元|\d{1,2})年)分/ }],

    // 「氏名」の右の欄。上にフリガナが入っていることがあるので、フリガナの行は取らない。
    // 電子交付のPDFでは「氏名」が縦書きで、フリガナの行と氏名の行にまたがっているので、
    // 右にあるフリガナ(カタカナだけ)より漢字の氏名を選ぶ
    name: [
      {
        id: "recipient-name",
        kind: "label",
        labels: ["氏名"],
        direction: ["right", "below"],
        section: RECIPIENT,
        reject: /フリガナ|^\(/,
        avoid: KANA_ONLY,
      },
      // 枠の見出しが読めないときは、ページ全体から「氏名」を探す(支払者の「氏名又は名称」の一部は取らない)
      {
        id: "name-label",
        kind: "label",
        labels: ["氏名"],
        direction: ["right", "below"],
        reject: /フリガナ|^\(|名称/,
        avoid: KANA_ONLY,
      },
    ],
    address: [
      // 住所の上の行に郵便番号だけが入っていることがあるので、郵便番号だけの値は取らない
      {
        id: "recipient-address",
        kind: "label",
        labels: ["住所又は居所", "住所"],
        direction: "right",
        section: RECIPIENT,
        reject: POSTAL_CODE_ONLY,
      },
      // 欄の名前が読めないとき(電子交付のPDFの縦書きの小さな欄の名前など)は、最初に出てくる住所を使う。
      // 源泉徴収票では、支払を受ける者(本人)の住所が支払者の住所より上にある
      { id: "first-address", kind: "pattern", perCell: true, pattern: ADDRESS, occurrence: 1 },
    ],
    // 元号・年・月・日が別々のマスに入っているので、セルをつなげて日付にする。
    // 表の形の源泉徴収票では、欄の名前の右に日付が書かれている
    birthDate: [
      { id: "birth-date", kind: "label", labels: ["受給者生年月日", "生年月日"], direction: ["below", "right"], maxCells: 4 },
      // 欄の名前が読めないときは、同じ行に元号・年・月・日のマスが並んでいるところを探す。
      // 令和生まれの人が給与を受け取ることはまずないので、令和は含めない(摘要欄の日付などと取り違えないため)
      {
        id: "birth-date-cells",
        kind: "pattern",
        cellSeparator: " ",
        pattern: /(?:^| )((?:明治|大正|昭和|平成|[明大昭平])(?: ?(?:元|\d{1,2}) ?年?)(?: \d{1,2} ?月?)(?: \d{1,2} ?日?))(?= |$)/,
      },
    ],

    employerName: [
      {
        id: "payer-name",
        kind: "label",
        labels: ["氏名又は名称", "名称"],
        direction: "right",
        section: PAYER,
        reject: /^\(電話\)/,
      },
      // 枠の見出し(縦書きの「支払者」)が読めないときは、ページ全体から欄の名前を探す
      { id: "payer-name-label", kind: "label", labels: ["氏名又は名称"], direction: "right", reject: /^\(電話\)/ },
      // 欄の名前が読めないとき(電子交付のPDFの小さな画像の欄の名前など)は、会社の形の名前を探す。
      // 源泉徴収票で会社名が書かれるのは、ふつう支払者(勤務先)の欄だけ
      {
        id: "payer-name-company",
        kind: "pattern",
        pdfTextOnly: true,
        perCell: true,
        pattern:
          /((?:株式会社|有限会社|合同会社|合資会社|合名会社|\((?:株|有|同)\))[^\s()（）:：]+|[^\s()（）:：]+(?:株式会社|有限会社|合同会社|合資会社|合名会社))/,
      },
    ],
    // ラベルが「住所(居所)」「又は所在地」の2行に分かれていることがある
    employerAddress: [
      {
        id: "payer-address",
        kind: "label",
        labels: ["住所(居所)又は所在地", "住所(居所)", "所在地", "住所"],
        direction: "right",
        section: PAYER,
        reject: POSTAL_CODE_ONLY,
      },
      // 枠の見出しが読めないときは、ページ全体から支払者の欄の名前を探す
      {
        id: "payer-address-label",
        kind: "label",
        labels: ["住所(居所)又は所在地", "住所(居所)"],
        direction: "right",
        reject: POSTAL_CODE_ONLY,
      },
      // 欄の名前も読めないときは、2番目に出てくる住所を使う(1番目は支払を受ける者の住所)
      { id: "second-address", kind: "pattern", perCell: true, pattern: ADDRESS, occurrence: 2 },
    ],

    // 金額の欄は、ラベルの下の値を取る。右向きに探さないのは、摘要欄に「前職分 支払金額 ○○円」のように
    // 書かれた前の勤務先の金額を取らないため。
    // 支払金額と源泉徴収税額の欄には、左上に「内」と小さな文字で未払いの金額(未徴収の税額)が入ることがあるので、
    // 文字が大きい方(本来の金額)を選ぶ
    paymentAmount: [
      { id: "payment-amount", kind: "label", labels: ["支払金額"], direction: "below", prefer: "largest" },
      { id: "payment-amount-column", kind: "column", headers: AMOUNT_HEADERS, index: 0 },
      amountRight("payment-amount-right", ["支払金額"]),
    ],
    salaryIncomeAfterDeduction: [
      {
        id: "salary-income",
        kind: "label",
        labels: ["給与所得控除後の金額", "給与所得控除後の金額(調整控除後)"],
        direction: "below",
      },
      { id: "salary-income-column", kind: "column", headers: AMOUNT_HEADERS, index: 1 },
      amountRight("salary-income-right", ["給与所得控除後の金額", "給与所得控除後の金額(調整控除後)"]),
    ],
    totalDeductions: [
      { id: "total-deductions", kind: "label", labels: ["所得控除の額の合計額"], direction: "below" },
      { id: "total-deductions-column", kind: "column", headers: AMOUNT_HEADERS, index: 2 },
      amountRight("total-deductions-right", ["所得控除の額の合計額"]),
    ],
    withholdingTax: [
      { id: "withholding-tax", kind: "label", labels: ["源泉徴収税額"], direction: "below", prefer: "largest" },
      { id: "withholding-tax-column", kind: "column", headers: AMOUNT_HEADERS, index: 3 },
      amountRight("withholding-tax-right", ["源泉徴収税額"]),
    ],
    socialInsurance: [
      { id: "social-insurance", kind: "label", labels: ["社会保険料等の金額"], direction: "below" },
      amountRight("social-insurance-right", ["社会保険料等の金額"]),
    ],
  },
});
