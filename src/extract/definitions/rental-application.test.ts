import { describe, expect, it } from "vitest";
import type { TextSegment } from "../../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "../engine.ts";
import rentalApplication from "./rental-application.ts";

// 入居申込書の書類定義を、読み違えやすい配置で確かめる。
// ダミーPDF全体での確認は、リグレッションテスト(src/regression/extraction.test.ts)で行っている。

/** 1文字の幅・高さが size のセル。(x, y) は左下 */
function cell(text: string, x: number, y: number, size = 9): TextSegment {
  const chars = [...text];
  return {
    text,
    bbox: { x0: x, y0: y, x1: x + chars.length * size, y1: y + size },
    charBoxes: chars.map((_, i) => ({ x0: x + i * size, y0: y, x1: x + (i + 1) * size, y1: y + size })),
    confidence: 1,
    source: "pdf",
  };
}

/** 1人分の欄(氏名・生年月日・勤務先・年収)。top は欄の見出しの高さ */
function person(heading: string, top: number, values: { name: string; birth: string; employer: string; income: string }) {
  return [
    cell(heading, 34, top),
    cell("氏名", 33, top - 24),
    cell(values.name, 107, top - 24, 11),
    cell("生年月日", 307, top - 24),
    cell(values.birth, 381, top - 24, 11),
    cell("勤務先", 33, top - 48),
    cell(values.employer, 107, top - 48, 11),
    cell("税込年収", 307, top - 72),
    cell(values.income, 381, top - 72, 11),
  ];
}

function page(segments: TextSegment[]): ExtractionPage {
  return { pageNumber: 1, view: [0, 0, 595, 842], segments };
}

const extract = (segments: TextSegment[]) => toValues(extractDocument(rentalApplication, [page(segments)]));

const applicant = { name: "田中美咲", birth: "平成8年9月3日(30歳)", employer: "株式会社見本システムズ", income: "420万円" };
const guarantor = { name: "田中健二", birth: "昭和40年1月20日(61歳)", employer: "見本運輸株式会社", income: "600万円" };
const emergency = { name: "田中由美", birth: "昭和42年5月5日", employer: "見本商店", income: "100万円" };

describe("入居申込書の書類定義", () => {
  it("申込者欄と連帯保証人欄の同じラベルを、見出しで区別する", () => {
    const values = extract([...person("申込者(契約者)", 690, applicant), ...person("連帯保証人", 470, guarantor)]);
    expect(values.applicant).toMatchObject({ name: "田中美咲", birthDate: "1996-09-03", age: 30, annualIncome: 4_200_000 });
    expect(values.guarantor).toMatchObject({ name: "田中健二", birthDate: "1965-01-20", age: 61, annualIncome: 6_000_000 });
  });

  it("緊急連絡先の人を、連帯保証人として取らない", () => {
    const values = extract([...person("申込者(契約者)", 690, applicant), ...person("緊急連絡先", 470, emergency)]);
    expect(values.guarantor).toBeUndefined();
    expect(values.applicant).toMatchObject({ name: "田中美咲" });
  });

  it("連帯保証人欄の後に緊急連絡先欄があっても、連帯保証人の値だけを取る", () => {
    const values = extract([
      ...person("申込者(契約者)", 690, applicant),
      ...person("連帯保証人", 470, guarantor),
      ...person("緊急連絡先", 250, emergency),
    ]);
    expect(values.guarantor).toMatchObject({ name: "田中健二", employerName: "見本運輸株式会社" });
  });

  it("年収が円単位で書かれていても換算する", () => {
    const values = extract(person("申込者(契約者)", 690, { ...applicant, income: "4,200,000円" }));
    expect(values.applicant).toMatchObject({ annualIncome: 4_200_000 });
  });

  it("「号室」が部屋番号の単位として書かれていても、部屋番号だけを取る", () => {
    const values = extract([
      cell("物件名", 33, 717),
      cell("サンプルハイツ", 107, 715, 11),
      cell("号室", 247, 717),
      cell("201", 321, 716, 11),
      cell("号室", 345, 716),
      cell("賃料", 401, 717),
      cell("85,000", 474, 716, 11),
      cell("円", 517, 716),
    ]);
    expect(values).toMatchObject({ propertyName: "サンプルハイツ", room: "201", rent: 85_000 });
  });

  it("賃料と管理費が並んでいても、賃料だけを取る", () => {
    const values = extract([
      cell("賃料", 33, 700),
      cell("85,000円", 80, 700),
      cell("管理費", 200, 700),
      cell("5,000円", 250, 700),
    ]);
    expect(values.rent).toBe(85_000);
  });
});
