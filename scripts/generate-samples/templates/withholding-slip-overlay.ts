import { page } from "../document.ts";
import { toWareki, yen } from "../format.ts";
import { yamadaIncome2025 as inc, yamada } from "../people.ts";

// 給与所得の源泉徴収票(令和7年分)の、電子交付のPDFを再現したもの。
// 勤務先の給与システムが出力する電子交付のPDFには、次の特徴がある(実物で確かめた様式の特徴。値は架空)。
// - 様式(罫線・欄の名前・「千」「円」の区切り)は画像で、値だけが文字として重ねてある
// - 欄の名前は小さく、画像の解像度も低いので、OCR で読めない欄の名前がある
// - 金額はカンマではなく空白で区切り、様式の「千」「円」の区切りに合わせて置く。
//   先頭の桁だけが離れて別の文字列になっているもの、「千」をはさんで離れているものがある
// - A4横のページの右半分に源泉徴収票がある
// - 「住所又は居所」「氏名」の欄の名前は縦書き。「氏名」はフリガナの行と氏名の行にまたがり、OCR では1文字ずつ読まれる
// - 住所の上に郵便番号が別の行で入っている
// - 生年月日は、元号・年・月・日が別々のマスに入り、「年」「月」「日」は値の上の見出しにだけ書かれている
// 値の文字は class="v" の要素に入れる。生成スクリプトは、値を隠した画像と、値の文字の位置を別々に取り出す。

const birth = toWareki(yamada.birthDate);

/** 金額を空白で3桁ずつ区切る(「5 800 000」) */
function spaced(value: number): string {
  return yen(value).replace(/,/g, " ");
}

/** 先頭の桁(百万の位)だけを別の文字列にした金額(「5」と「800 000」) */
function splitHead(value: number, gapMm: number): string {
  const text = spaced(value);
  const head = text.slice(0, text.indexOf(" "));
  const rest = text.slice(text.indexOf(" ") + 1);
  return `<span class="v">${head}</span><span style="display: inline-block; width: ${gapMm}mm"></span><span class="v">${rest}</span>`;
}

/** 「千」の区切りをはさんで、千の位より上と下を別の文字列にした金額(「870」千「000」) */
function splitThousand(value: number): string {
  const text = String(value);
  return `<span class="v">${text.slice(0, -3)}</span><span class="sep">千</span><span class="v">${text.slice(-3)}</span>`;
}

const css = `
@page { size: A4 landscape; margin: 0; }
body { width: 297mm; height: 210mm; }
.slip { position: absolute; left: 152mm; top: 14mm; width: 136mm; font-size: 6pt; font-family: "Hiragino Mincho ProN", serif; }
.slip h1 { font-size: 9pt; text-align: center; margin: 0 0 1.5mm; letter-spacing: 0.2em; }
.slip td, .slip th { padding: 0.5mm 0.8mm; font-size: 5.5pt; border-width: 0.25mm; }
.slip th { background: #fff; }
.slip .v { font-family: "Hiragino Sans", sans-serif; font-size: 8pt; color: #000; }
.slip .amount { text-align: right; height: 7mm; vertical-align: bottom; position: relative; }
.slip .marks { position: absolute; top: 0.3mm; left: 0.8mm; right: 0.8mm; font-size: 4.5pt; color: #333; display: flex; justify-content: space-between; }
.slip .sep { font-size: 4.5pt; color: #333; margin: 0 2.5mm; }
.vertical { writing-mode: vertical-rl; text-align: center; width: 4mm; }
.spread { letter-spacing: 2mm; }
.slip .kana-label { font-size: 4.5pt; color: #333; margin-right: 1.5mm; }
.slip .v.kana { font-size: 6pt; }
`;

const marks = (inner = "") => `<span class="marks"><span>${inner}</span><span>千</span><span>円</span></span>`;

const body = `
<div class="slip">
  <h1>令和 7 年分　給与所得の源泉徴収票</h1>
  <table>
    <tr>
      <th rowspan="2" class="vertical">支払を受ける者</th>
      <th class="vertical">住所又は居所</th>
      <td colspan="3"><span class="v">〒000-0000</span><br><span class="v">${yamada.address}</span></td>
    </tr>
    <tr>
      <th>(役職名)</th>
      <td><span class="v">${yamada.employer.position}</span></td>
      <th class="vertical spread">氏名</th>
      <td>
        <div><span class="kana-label">(フリガナ)</span><span class="v kana">${yamada.kana}</span></div>
        <div><span class="v">${yamada.name}</span></div>
      </td>
    </tr>
  </table>
  <table style="margin-top: -0.25mm">
    <tr>
      <th class="center">種別</th>
      <th class="center">支払金額</th>
      <th class="center">給与所得控除後の金額<br>(調整控除後)</th>
      <th class="center">所得控除の額の合計額</th>
      <th class="center">源泉徴収税額</th>
    </tr>
    <tr>
      <td class="amount" style="text-align: center"><span class="v">給料・賞与</span></td>
      <td class="amount">${marks("内")}${splitHead(inc.salary, 3.5)}</td>
      <td class="amount">${marks()}${splitHead(inc.salaryIncome, 2)}</td>
      <td class="amount">${marks()}<span class="v">${spaced(inc.incomeTaxDeductionTotal)}</span></td>
      <td class="amount">${marks("内")}<span class="v">${spaced(inc.withholdingTax)}</span></td>
    </tr>
  </table>
  <table style="margin-top: -0.25mm">
    <tr>
      <th class="center">社会保険料等の金額</th>
      <th class="center">生命保険料の控除額</th>
      <th class="center">地震保険料の控除額</th>
      <th class="center">住宅借入金等特別控除の額</th>
    </tr>
    <tr>
      <td class="amount">${splitThousand(inc.socialInsurance)}<span class="sep">円</span></td>
      <td class="amount">${splitThousand(inc.lifeInsurance)}<span class="sep">円</span></td>
      <td class="amount"><span class="sep">千</span><span class="sep">円</span></td>
      <td class="amount"><span class="sep">千</span><span class="sep">円</span></td>
    </tr>
  </table>
  <table style="margin-top: -0.25mm">
    <tr><th style="width: 10mm">(摘要)</th><td style="height: 8mm"></td></tr>
  </table>
  <table style="margin-top: -0.25mm">
    <tr>
      <th colspan="4" class="center">受給者生年月日</th>
    </tr>
    <tr>
      <th class="center">明・大・昭・平・令</th><th class="center">年</th><th class="center">月</th><th class="center">日</th>
    </tr>
    <tr>
      <td class="center"><span class="v">${birth.era}</span></td><td class="center"><span class="v">${birth.year}</span></td>
      <td class="center"><span class="v">${birth.month}</span></td><td class="center"><span class="v">${birth.day}</span></td>
    </tr>
  </table>
  <table style="margin-top: -0.25mm">
    <tr>
      <th rowspan="3" class="vertical">支払者</th>
      <th style="width: 24mm">個人番号又は法人番号</th>
      <td><span class="v">(記載省略)</span></td>
    </tr>
    <tr><th>住所(居所)<br>又は所在地</th><td><span class="v">${yamada.employer.address}</span></td></tr>
    <tr><th>氏名又は名称</th><td><span class="v">${yamada.employer.name}</span></td></tr>
  </table>
</div>
`;

export const withholdingSlipOverlay = {
  /** 出力先(samples/ からの相対パス)。正解データは源泉徴収票(withholding-slip)と同じ */
  file: "withholding-slip/overlay.pdf",
  documentId: "withholding-slip",
  title: "源泉徴収票(令和7年分・電子交付の様式)",
  html: () => page(body, css),
  /** 様式の画像の解像度。実物と同じく、小さい欄の名前の一部が OCR で読めない程度にする */
  dpi: 200,
};
