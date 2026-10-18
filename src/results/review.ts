import type { FieldResult } from "../extract/engine.ts";
import { LOW_CONFIDENCE } from "../highlight/highlights.ts";
import type { Rect } from "../text/types.ts";

// 抽出結果の確認・修正の状態。抽出した値(FieldResult)は書き換えず、利用者の操作を別に持ち、
// 表示や書き出しのときに重ねて「いまの値」を求める。

/** 利用者が手で直した値 */
export interface ManualEdit {
  value: unknown;
  /** 手で入力した文字列、または PDF 上で範囲を選んだときの文字列 */
  rawText: string;
  /** PDF 上で範囲を選んだときの位置。入力欄で直しただけなら、抽出したときの位置のまま */
  page?: number;
  bbox?: Rect[];
}

export interface FieldReview {
  confirmed: boolean;
  edit?: ManualEdit;
}

/** 項目のキー → 確認・修正の状態 */
export type ReviewState = Readonly<Record<string, FieldReview>>;

export type ReviewAction =
  | { type: "confirm"; key: string }
  | { type: "unconfirm"; key: string }
  | { type: "edit"; key: string; edit: ManualEdit }
  | { type: "revert"; key: string }
  | { type: "confirm-all"; keys: readonly string[] };

/** 確認・修正の操作を反映する。手で直した値は、直した時点で確認済みにする */
export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case "confirm":
      return { ...state, [action.key]: { ...state[action.key], confirmed: true } };
    case "unconfirm":
      return { ...state, [action.key]: { ...state[action.key], confirmed: false } };
    case "edit":
      return { ...state, [action.key]: { confirmed: true, edit: action.edit } };
    case "revert": {
      const { [action.key]: _, ...rest } = state;
      return rest;
    }
    case "confirm-all":
      return Object.fromEntries([
        ...Object.entries(state),
        ...action.keys.map((key) => [key, { ...state[key], confirmed: true }]),
      ]);
  }
}

/** 画面に出す項目の状態 */
export type ReviewStatus =
  /** 確認済み(抽出したまま) */
  | "confirmed"
  /** 手で直した(確認済み) */
  | "edited"
  /** 確認が必要(読み取りの確からしさが低い、注意がある) */
  | "attention"
  /** 未確認 */
  | "unconfirmed"
  /** 見つからなかった */
  | "missing";

/** 抽出結果に、確認・修正を重ねた「いまの値」 */
export interface ReviewedField {
  field: FieldResult;
  status: ReviewStatus;
  /** いまの値。見つからず手でも入れていなければ undefined */
  value?: unknown;
  rawText?: string;
  page?: number;
  bbox: Rect[];
  /** 手で直したとき、もとの値(抽出した値) */
  original?: { value: unknown; rawText?: string };
}

export function needsAttention(field: FieldResult): boolean {
  return field.found && ((field.confidence ?? 1) < LOW_CONFIDENCE || field.warnings.length > 0);
}

export function reviewField(field: FieldResult, review: FieldReview | undefined): ReviewedField {
  const edit = review?.edit;
  if (edit) {
    return {
      field,
      status: "edited",
      value: edit.value,
      rawText: edit.rawText,
      page: edit.page ?? field.page,
      bbox: edit.bbox ?? field.bbox,
      original: field.found ? { value: field.value, rawText: field.rawText } : undefined,
    };
  }
  if (!field.found) return { field, status: "missing", bbox: [] };
  const status: ReviewStatus = review?.confirmed ? "confirmed" : needsAttention(field) ? "attention" : "unconfirmed";
  return { field, status, value: field.value, rawText: field.rawText, page: field.page, bbox: field.bbox };
}

export function reviewFields(fields: readonly FieldResult[], state: ReviewState): ReviewedField[] {
  return fields.map((f) => reviewField(f, state[f.key]));
}

export interface ReviewCounts {
  total: number;
  /** 確認が必要(確からしさが低い・注意がある)で、まだ確認していない項目 */
  attention: number;
  /** まだ確認していない項目(要確認を含む) */
  unconfirmed: number;
  /** 見つからなかった項目のうち、必須の項目 */
  missingRequired: number;
  missing: number;
}

export function countReview(fields: readonly ReviewedField[]): ReviewCounts {
  return {
    total: fields.length,
    attention: fields.filter((f) => f.status === "attention").length,
    unconfirmed: fields.filter((f) => f.status === "attention" || f.status === "unconfirmed").length,
    missingRequired: fields.filter((f) => f.status === "missing" && f.field.required).length,
    missing: fields.filter((f) => f.status === "missing").length,
  };
}

/** まとめて確認済みにできる項目(見つかっていて、まだ確認していない項目) */
export function unconfirmedKeys(fields: readonly ReviewedField[]): string[] {
  return fields.filter((f) => f.status === "attention" || f.status === "unconfirmed").map((f) => f.field.key);
}
