import type { IsoDate } from "./format.ts";

// 実在しない人物・会社・自治体のダミーデータ。
// 電話番号は実在しない 000 始まりにしている。

export const yamada = {
  name: "山田 太郎",
  kana: "ヤマダ タロウ",
  birthDate: "1988-04-15" as IsoDate,
  address: "見本県見本市サンプル町1丁目2番3号",
  phone: "000-1234-5678",
  employer: {
    name: "株式会社サンプル商事",
    address: "見本県見本市中央1丁目1番1号",
    phone: "000-0000-1111",
    industry: "卸売業",
    joinedOn: "2011-04-01" as IsoDate,
    position: "係長",
    employmentType: "正社員",
  },
};

/** 山田太郎の令和7年分の給与と、それに基づく令和8年度の住民税 */
export const yamadaIncome2025 = {
  salary: 5_800_000,
  salaryIncome: 4_200_000,
  socialInsurance: 870_000,
  lifeInsurance: 40_000,
  // 所得税の控除
  incomeTaxDeductionTotal: 1_590_000,
  withholdingTax: 166_900,
  // 住民税の控除(所得税とは控除額が異なる)
  residentLifeInsurance: 28_000,
  residentBasicDeduction: 430_000,
  residentDeductionTotal: 1_328_000,
  taxableIncome: 2_872_000,
  municipalCalculated: 172_320,
  prefecturalCalculated: 114_880,
  municipalAdjustment: 2_500,
  prefecturalAdjustment: 2_000,
  municipalIncomeLevy: 169_800,
  prefecturalIncomeLevy: 112_800,
  municipalPerCapita: 3_000,
  prefecturalPerCapita: 1_000,
  forestTax: 1_000,
  annualResidentTax: 287_600,
  juneInstallment: 24_700,
  monthlyInstallment: 23_900,
};

export const sato = {
  name: "佐藤 花子",
  kana: "サトウ ハナコ",
  birthDate: "1983-07-07" as IsoDate,
  address: "見本県見本市北町4丁目5番6号",
  phone: "000-2345-6789",
  occupation: "デザイナー",
  tradeName: "さとうデザイン事務所",
};

export const tanaka = {
  name: "田中 美咲",
  kana: "タナカ ミサキ",
  birthDate: "1996-09-03" as IsoDate,
  address: "見本県見本市南町7丁目8番9号 見本アパート102",
  phone: "000-1111-2222",
  employer: {
    name: "株式会社見本システムズ",
    address: "見本県見本市駅前3丁目3番3号",
    phone: "000-3333-4444",
    industry: "情報通信業",
    joinedOn: "2023-04-01" as IsoDate,
    employmentType: "正社員",
  },
  annualIncome: 4_200_000,
};

export const tanakaGuarantor = {
  name: "田中 健二",
  kana: "タナカ ケンジ",
  relationship: "父",
  birthDate: "1965-01-20" as IsoDate,
  address: "見本県見本市西町10丁目11番12号",
  phone: "000-5555-6666",
  employer: {
    name: "見本運輸株式会社",
    address: "見本県見本市港町5丁目5番5号",
    phone: "000-7777-8888",
    joinedOn: "1996-04-01" as IsoDate,
  },
  annualIncome: 6_000_000,
};
