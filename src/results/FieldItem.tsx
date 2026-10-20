import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { AlertIcon } from "../components/icons.tsx";
import { convertValue } from "../extract/convert.ts";
import { CATEGORIES, categoryOf } from "../highlight/categories.ts";
import { useWording } from "../theme/ThemeContext.tsx";
import type { Wording } from "../theme/theme.ts";
import { editableText, formatValue, INVALID_INPUT, originalNotation } from "./format.ts";
import type { ManualEdit, ReviewedField } from "./review.ts";

interface Props {
  item: ReviewedField;
  selected: boolean;
  /** 項目を選ぶ(PDF上の該当箇所へ移動する) */
  onSelect: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onEdit: (edit: ManualEdit) => void;
  onRevert: () => void;
  /** PDF上で範囲を選んで値を入れる */
  onPickRange: () => void;
}

const STATUS_LABELS = {
  confirmed: "確認済み",
  attention: "要確認",
  unconfirmed: "未確認",
  missing: "未検出",
} as const;

function statusText(item: ReviewedField, wording: Wording): string {
  if (item.status === "attention" && item.field.confidence !== undefined && item.field.confidence < 1) {
    return `${item.field.source === "ocr" ? wording.ocrPrefix : ""}要確認 ${Math.round(item.field.confidence * 100)}%`;
  }
  return item.status === "edited" ? wording.edited : STATUS_LABELS[item.status];
}

/** 抽出結果の一覧の1項目。値・状態・確認と修正の操作 */
export function FieldItem({ item, selected, onSelect, onConfirm, onUnconfirm, onEdit, onRevert, onPickRange }: Props) {
  const { field, status } = item;
  const wording = useWording();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const ref = useRef<HTMLLIElement>(null);
  const category = categoryOf(field.key);
  const editable = field.type !== "list";
  // 手で直した値は、入力した文字列ではなく、もとの読取値を出す
  const notation = status === "edited" ? null : originalNotation(field.type, item.value, item.rawText);

  // PDF上のハイライトから選ばれたときは、一覧の中でその項目が見えるようにする
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function startEdit() {
    setInput(editableText(field.type, item.value, item.rawText));
    setError(null);
    setEditing(true);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const converted = convertValue(field.type, input);
    if (!converted || input.trim() === "") {
      setError(INVALID_INPUT[field.type]);
      return;
    }
    onEdit({ value: converted.value, rawText: input.trim() });
    setEditing(false);
  }

  return (
    <li ref={ref} className={`field-item field-item--${status}${selected ? " field-item--selected" : ""}`}>
      <span className={`highlight-chip highlight-chip--${category}`} aria-hidden="true">
        {CATEGORIES[category].symbol}
      </span>
      <div className="field-item__body">
        {/* 項目名と値は、押すとPDF上の該当箇所へ移動する */}
        <button type="button" className="field-item__main" onClick={onSelect} disabled={item.page === undefined}>
          <span className="field-item__label">
            {field.label}
            {!field.required && <span className="field-item__optional">(任意)</span>}
          </span>
          {status === "missing" ? (
            <span className="field-item__value field-item__value--missing">見つかりませんでした</span>
          ) : (
            <span className={`field-item__value${field.type === "money" ? " mono" : ""}`}>
              {formatValue(field.type, item.value)}
            </span>
          )}
          {notation && <span className="field-item__note">元の表記 {notation}</span>}
          {status === "edited" && item.original && (
            <span className="field-item__note">
              元の読取値 <s>{formatValue(field.type, item.original.value)}</s>
            </span>
          )}
          {field.derivedFrom && <span className="field-item__note">{field.warnings[0]}</span>}
          {status === "attention" && !field.derivedFrom && field.warnings.length > 0 && (
            <span className="field-item__note field-item__note--warning">
              <AlertIcon size={12} />
              {field.warnings.join(" / ")}
            </span>
          )}
        </button>

        {editing ? (
          <form className="field-item__edit" onSubmit={save}>
            <label htmlFor={inputId} className="visually-hidden">
              {field.label}の値
            </label>
            <input
              id={inputId}
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error ? `${inputId}-error` : undefined}
              // biome-ignore lint/a11y/noAutofocus: 「修正する」を押した直後に入力できるようにする
              autoFocus
            />
            <div className="field-item__actions">
              <button type="submit" className="button button--small button--primary">
                保存
              </button>
              <button type="button" className="button button--small" onClick={() => setEditing(false)}>
                やめる
              </button>
            </div>
            {error && (
              <p id={`${inputId}-error`} className="field-item__error" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="field-item__actions">
            {(status === "attention" || status === "unconfirmed") && (
              <button type="button" className="button button--small" onClick={onConfirm}>
                {status === "attention" ? "このまま確認" : "確認する"}
              </button>
            )}
            {status === "confirmed" && (
              <button type="button" className="link-button" onClick={onUnconfirm}>
                確認を取り消す
              </button>
            )}
            {editable && status !== "missing" && (
              <button type="button" className="link-button" onClick={startEdit}>
                {wording.edit}
              </button>
            )}
            {editable && status === "missing" && (
              <button type="button" className="button button--small" onClick={startEdit}>
                手動で追加
              </button>
            )}
            {editable && (
              <button type="button" className="link-button" onClick={onPickRange}>
                PDF上で範囲を選ぶ
              </button>
            )}
            {status === "edited" && (
              <button type="button" className="link-button" onClick={onRevert}>
                元に戻す
              </button>
            )}
          </div>
        )}
      </div>
      <span className={`badge field-item__status field-item__status--${status}`}>{statusText(item, wording)}</span>
      <span className="field-item__page mono">{item.page ? `p.${item.page}` : "—"}</span>
    </li>
  );
}
