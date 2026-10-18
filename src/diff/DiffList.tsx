import { useEffect, useRef } from "react";
import { AlertIcon } from "../components/icons.tsx";
import { CATEGORIES, categoryOf } from "../highlight/categories.ts";
import type { DiffStatus } from "../highlight/highlights.ts";
import { formatValue } from "../results/format.ts";
import { type ComparisonResult, countDiffs, type FieldDiff } from "./compare-fields.ts";

/** 判定ごとの記号と名前(色だけに頼らないよう、記号も付ける) */
export const DIFF_LABELS: Readonly<Record<DiffStatus, { symbol: string; label: string }>> = {
  changed: { symbol: "~", label: "変更" },
  added: { symbol: "+", label: "追加" },
  removed: { symbol: "−", label: "削除" },
  uncomparable: { symbol: "?", label: "比較できない" },
  notation: { symbol: "≈", label: "表記の違い" },
  same: { symbol: "=", label: "一致" },
};

const SUMMARY_ORDER: DiffStatus[] = ["changed", "added", "removed", "uncomparable", "notation"];

interface Props {
  documentTitle: string;
  previousName: string;
  currentName: string;
  result: ComparisonResult;
  selectedKey: string | null;
  onSelect: (diff: FieldDiff) => void;
  onClose: () => void;
}

function formatDelta(amount: number, percent: number | null): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "−" : "±";
  const money = `${sign}${Math.abs(amount).toLocaleString("ja-JP")} 円`;
  if (percent === null) return money;
  const p = `${percent > 0 ? "+" : percent < 0 ? "−" : "±"}${Math.abs(percent).toFixed(2)}%`;
  return `${money}(${p})`;
}

function DiffItem({ diff, selected, onSelect }: { diff: FieldDiff; selected: boolean; onSelect: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const category = categoryOf(diff.key.replace(/\[.*\]$/, ""));
  const status = DIFF_LABELS[diff.status];
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <li ref={ref} className={`diff-item diff-item--${diff.status}${selected ? " diff-item--selected" : ""}`}>
      <button type="button" className="diff-item__main" onClick={onSelect} disabled={diff.current?.page === undefined}>
        <span className="diff-item__head">
          <span className={`highlight-chip highlight-chip--${category}`} aria-hidden="true">
            {CATEGORIES[category].symbol}
          </span>
          <span className="diff-item__label">{diff.label}</span>
          <span className={`badge diff-badge diff-badge--${diff.status}`}>
            <b aria-hidden="true">{status.symbol}</b>
            {status.label}
          </span>
          {diff.needsCheck && <span className="badge badge--warning">要確認</span>}
        </span>
        <span className="diff-item__values">
          <span className="diff-item__side">
            <span className="diff-item__side-label">前回</span>
            {diff.previous ? (
              diff.status === "changed" || diff.status === "removed" ? (
                <s>{formatValue(diff.type, diff.previous.value)}</s>
              ) : (
                <span>{formatValue(diff.type, diff.previous.value)}</span>
              )
            ) : (
              <span className="diff-item__empty">—</span>
            )}
          </span>
          <span className="diff-item__side">
            <span className="diff-item__side-label">今回</span>
            {diff.current ? (
              <b>{formatValue(diff.type, diff.current.value)}</b>
            ) : (
              <span className="diff-item__empty">{diff.status === "uncomparable" ? "読み取れませんでした" : "—"}</span>
            )}
          </span>
        </span>
        {diff.delta && <span className="diff-item__delta mono">{formatDelta(diff.delta.amount, diff.delta.percent)}</span>}
        {diff.notes.map((note) => (
          <span key={note} className="diff-item__note">
            {note}
          </span>
        ))}
      </button>
    </li>
  );
}

/** 前回と今回の、項目ごとの差分の一覧 */
export function DiffList({ documentTitle, previousName, currentName, result, selectedKey, onSelect, onClose }: Props) {
  const counts = countDiffs(result.fields);
  const differing = result.fields.filter((f) => f.status !== "same");
  const same = result.fields.filter((f) => f.status === "same");

  return (
    <section className="diff-list" aria-label="前回と今回の比較">
      <div className="diff-list__header">
        <h2>項目の差分</h2>
        <p className="diff-list__files">
          <span>
            前回 <span className="mono">{previousName}</span>
          </span>
          <span aria-hidden="true">→</span>
          <span>
            今回 <span className="mono">{currentName}</span>
          </span>
        </p>
        <p className="diff-list__document">{documentTitle}</p>
      </div>

      {result.yearChange && (
        <p className="diff-list__year">
          対象年: {String(result.yearChange.from)}年 → {String(result.yearChange.to)}年
        </p>
      )}
      {result.warnings.map((w) => (
        <p key={w} className="diff-list__warning" role="alert">
          <AlertIcon size={16} />
          {w}
        </p>
      ))}

      <ul className="diff-list__summary" aria-label="判定ごとの件数">
        {SUMMARY_ORDER.map((s) => (
          <li key={s} className={`badge diff-badge diff-badge--${s}`}>
            <b aria-hidden="true">{DIFF_LABELS[s].symbol}</b>
            {DIFF_LABELS[s].label} {counts[s]}
          </li>
        ))}
      </ul>
      <p className="diff-list__hint">重視する項目(年収・勤務先・連帯保証人など)を上に表示しています。</p>

      <ul className="diff-list__items">
        {differing.map((diff) => (
          <DiffItem key={diff.key} diff={diff} selected={selectedKey === diff.key} onSelect={() => onSelect(diff)} />
        ))}
        {differing.length === 0 && <li className="result-list__empty">前回と違う項目はありません。</li>}
      </ul>

      {same.length > 0 && (
        <details className="diff-list__same">
          <summary>
            <span className="badge diff-badge diff-badge--same">
              <b aria-hidden="true">=</b>一致
            </span>{" "}
            変更のない項目 {same.length}件
          </summary>
          <p>{same.map((f) => f.label).join("・")}</p>
        </details>
      )}

      <div className="result-list__footer">
        <button type="button" className="button" onClick={onClose}>
          比較をやめる
        </button>
      </div>
    </section>
  );
}
