import type { LabelRule, Rule, Section } from "../rules.ts";
import { defineDocument } from "../rules.ts";

// 賃貸の入居申込書。管理会社・仲介会社・家賃保証会社ごとに独自の様式なので、
// 座標ではなくラベル(欄の名前)の近くを探す。表記ゆれは .claude/skills/japanese-real-estate-docs/references/rental-application.md を参照。
//
// 申込者欄と連帯保証人欄には同じラベル(氏名・生年月日・勤務先など)が並ぶので、見出しで範囲を分ける。
// 緊急連絡先の人を連帯保証人として取らないよう、連帯保証人の範囲は「緊急連絡先」の見出しまでにする。

const APPLICANT: Section = { start: ["申込者(契約者)", "申込者", "契約者"], end: ["連帯保証人", "緊急連絡先", "入居者"] };
const GUARANTOR: Section = { start: ["連帯保証人"], end: ["緊急連絡先", "入居者"] };

/** 申込者・連帯保証人の欄に共通するルール。section で範囲を分ける */
function personRules(section: Section): Record<string, Rule[]> {
  const label = (id: string, labels: string[], extra: Partial<LabelRule> = {}): LabelRule => ({
    id,
    kind: "label",
    labels,
    direction: "right",
    section,
    ...extra,
  });
  return {
    name: [label("name", ["氏名", "お名前", "契約者名"], { reject: /フリガナ|ふりがな/ })],
    birthDate: [label("birth-date", ["生年月日"])],
    // 「平成8年9月3日(30歳)」のように生年月日の後ろに書かれた年齢。なければ「年齢」の欄を探す
    age: [{ id: "age-after-birth-date", kind: "pattern", pattern: /\((\d{1,3})歳\)/, section }, label("age", ["年齢"])],
    employerName: [label("employer", ["勤務先", "勤務先名", "会社名", "勤務先(学校名)"])],
    yearsOfService: [label("years-of-service", ["勤続年数", "勤続"])],
    // 「420」「万円」のように単位が別のセルでも、エンジンが単位を含めて換算する
    annualIncome: [label("annual-income", ["税込年収", "年収(税込)", "年収", "年間収入", "前年年収"])],
  };
}

/** personRules のキーに「applicant.」「guarantor.」を付ける */
function prefixed(prefix: string, rules: Record<string, Rule[]>): Record<string, Rule[]> {
  return Object.fromEntries(Object.entries(rules).map(([key, value]) => [`${prefix}.${key}`, value]));
}

export default defineDocument({
  id: "rental-application",
  fields: {
    appliedOn: [{ id: "applied-on", kind: "label", labels: ["申込日", "申込年月日"], direction: "right" }],
    propertyName: [{ id: "property-name", kind: "label", labels: ["物件名", "建物名", "マンション名"], direction: "right" }],
    // 「号室」は部屋番号の後ろの単位としても書かれるので、部屋番号らしい値だけを取る
    room: [
      {
        id: "room",
        kind: "label",
        labels: ["号室", "部屋番号"],
        direction: "right",
        accept: /^[0-9A-Za-z-]+(号室)?$/,
      },
    ],
    // 管理費・共益費は別の欄。合算しない
    rent: [{ id: "rent", kind: "label", labels: ["賃料", "家賃", "月額賃料"], direction: "right" }],

    ...prefixed("applicant", personRules(APPLICANT)),
    // 住所と雇用形態は、抽出項目の定義では申込者だけの項目
    "applicant.address": [{ id: "address", kind: "label", labels: ["現住所", "住所"], direction: "right", section: APPLICANT }],
    "applicant.employmentType": [
      { id: "employment-type", kind: "label", labels: ["雇用形態"], direction: "right", section: APPLICANT },
    ],

    ...prefixed("guarantor", personRules(GUARANTOR)),
    "guarantor.relationship": [
      { id: "relationship", kind: "label", labels: ["続柄", "申込者との関係"], direction: "right", section: GUARANTOR },
    ],
  },
});
