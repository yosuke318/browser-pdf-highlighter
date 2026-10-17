// ハイライトの色分けに使う、項目の種類。承認済みのUIデザイン(UIトークン)の6種類と、どれにも当てはまらない項目。

export type HighlightCategory = "name" | "birth" | "work" | "money" | "address" | "property" | "other";

export interface CategoryStyle {
  /** 画面に出す名前 */
  label: string;
  /** 含む項目の説明(凡例に出す) */
  description: string;
  /** 色だけに頼らないための記号(ハイライトの先頭に付ける) */
  symbol: string;
}

export const CATEGORIES: Readonly<Record<HighlightCategory, CategoryStyle>> = {
  name: { label: "氏名", description: "氏名・フリガナ・続柄", symbol: "名" },
  birth: { label: "生年月日・年齢", description: "生年月日・年齢", symbol: "生" },
  work: { label: "勤務先・勤続", description: "勤務先・雇用形態・勤続年数・職業", symbol: "勤" },
  money: { label: "年収・所得", description: "年収・所得・税額・借入", symbol: "¥" },
  address: { label: "住所", description: "現住所・勤務先の所在地", symbol: "住" },
  property: { label: "物件", description: "物件名・所在地・賃料・価格", symbol: "物" },
  other: { label: "その他", description: "対象年・申込日など", symbol: "他" },
};

/**
 * 項目のキー(入れ子の項目は最後の部分。「applicant.name」なら「name」)ごとの種類。
 * 抽出項目の定義(schema/extraction-fields.json)に項目を足したら、ここにも足す(足さないとテストが失敗する)
 */
const CATEGORY_BY_KEY: Readonly<Record<string, HighlightCategory>> = {
  name: "name",
  relationship: "name",

  birthDate: "birth",
  age: "birth",

  employerName: "work",
  employmentType: "work",
  joinedOn: "work",
  yearsOfService: "work",
  hiredOn: "work",
  leftOn: "work",
  secondaryEmployment: "work",
  occupation: "work",
  tradeName: "work",

  paymentAmount: "money",
  salaryIncomeAfterDeduction: "money",
  totalDeductions: "money",
  withholdingTax: "money",
  socialInsurance: "money",
  salaryRevenue: "money",
  salaryIncome: "money",
  totalIncome: "money",
  taxableIncome: "money",
  annualTax: "money",
  businessRevenue: "money",
  businessIncome: "money",
  taxDue: "money",
  annualIncome: "money",
  otherDebts: "money",
  loanAmount: "money",
  loanYears: "money",

  address: "address",
  employerAddress: "address",

  propertyName: "property",
  room: "property",
  rent: "property",
  propertyAddress: "property",
  propertyPrice: "property",

  incomeYear: "other",
  fiscalYear: "other",
  appliedOn: "other",
};

/** 項目のキーの種類。分からないキーは "other" */
export function categoryOf(key: string): HighlightCategory {
  const last =
    key
      .split(".")
      .at(-1)
      ?.replace(/\[\d+\]$/, "") ?? key;
  return CATEGORY_BY_KEY[last] ?? "other";
}

/** 種類が決まっているキーか(テスト用) */
export function hasCategory(key: string): boolean {
  const last = key.split(".").at(-1) ?? key;
  return last in CATEGORY_BY_KEY;
}
