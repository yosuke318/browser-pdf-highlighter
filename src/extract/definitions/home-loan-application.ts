import type { Section } from "../rules.ts";
import { defineDocument } from "../rules.ts";

// 住宅ローン借入申込書。金融機関ごとに独自の様式なので、ラベルの近くを探す。
//
// 生年月日は「昭和・平成」の選択肢に丸を付けて元号を選ぶ様式があり、丸は図形なので文字からは元号が分からない
// (取り出すと「昭和・平成63年4月15日」になる)。推測で埋めず、その場合は未検出のままにする。
// 抽出項目の定義にない物件の面積は抽出しない。

/** 「所在地」は勤務先と購入物件の両方にあるので、見出しで範囲を分ける */
const EMPLOYER: Section = { start: ["勤務先"], end: ["他の借入", "お借入状況", "購入物件"] };
const PROPERTY: Section = { start: ["購入物件", "物件の内容"] };
const OTHER_DEBTS: Section = { start: ["他の借入", "お借入状況"], end: ["購入物件", "物件の内容"] };

export default defineDocument({
  id: "home-loan-application",
  fields: {
    appliedOn: [{ id: "applied-on", kind: "label", labels: ["申込日", "申込年月日"], direction: "right" }],
    // 「4,000」「万円」のように単位が別のセルでも、エンジンが単位を含めて換算する
    loanAmount: [{ id: "loan-amount", kind: "label", labels: ["借入希望額", "借入希望金額"], direction: "right" }],
    loanYears: [{ id: "loan-years", kind: "label", labels: ["借入期間", "返済期間"], direction: "right" }],

    name: [{ id: "name", kind: "label", labels: ["氏名", "お名前"], direction: "right", reject: /フリガナ|ふりがな/ }],
    birthDate: [{ id: "birth-date", kind: "label", labels: ["生年月日"], direction: "right" }],
    age: [{ id: "age", kind: "label", labels: ["年齢"], direction: "right" }],
    address: [{ id: "address", kind: "label", labels: ["現住所", "住所"], direction: "right" }],

    employerName: [
      { id: "employer-name", kind: "label", labels: ["勤務先名", "会社名"], direction: "right" },
      { id: "employer", kind: "label", labels: ["勤務先"], direction: "right", section: EMPLOYER },
    ],
    employmentType: [{ id: "employment-type", kind: "label", labels: ["雇用形態"], direction: "right" }],
    joinedOn: [{ id: "joined-on", kind: "label", labels: ["入社年月", "入社年月日"], direction: "right" }],
    yearsOfService: [{ id: "years-of-service", kind: "label", labels: ["勤続年数"], direction: "right" }],
    annualIncome: [{ id: "annual-income", kind: "label", labels: ["前年度税込年収", "税込年収", "年収"], direction: "right" }],

    // 他の借入(住宅ローン以外)の表。行ごとに借入先・目的・残高・年間返済額を取る
    otherDebts: [
      {
        id: "other-debts",
        kind: "table",
        section: OTHER_DEBTS,
        columns: {
          lender: ["借入先"],
          purpose: ["借入目的", "種類"],
          balance: ["借入残高", "残高"],
          annualRepayment: ["年間返済額"],
        },
      },
    ],

    propertyAddress: [
      { id: "property-address", kind: "label", labels: ["物件所在地"], direction: "right" },
      { id: "property-location", kind: "label", labels: ["所在地"], direction: "right", section: PROPERTY },
    ],
    propertyPrice: [{ id: "property-price", kind: "label", labels: ["購入価格", "物件価格"], direction: "right" }],
  },
});
