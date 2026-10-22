import { useState } from "react";
import { CATEGORIES, categoryOf, type HighlightCategory } from "../highlight/categories.ts";
import { download } from "./download.ts";
import { exportFileName, toExportedExtraction } from "./export.ts";
import { FieldItem } from "./FieldItem.tsx";
import { countReview, type ManualEdit, type ReviewAction, type ReviewedField, unconfirmedKeys } from "./review.ts";

interface Props {
  /** 書類の名前(「給与所得の源泉徴収票」) */
  title: string;
  documentId: string;
  /** 書類のページ(「1〜2ページ」と表示する) */
  pages: number[];
  fileName: string;
  items: ReviewedField[];
  selectedKey: string | null;
  onSelect: (item: ReviewedField) => void;
  onReview: (action: ReviewAction) => void;
  onPickRange: (key: string) => void;
}

type Filter = "all" | "todo" | HighlightCategory;

/** 1つの書類の抽出結果の一覧 */
export function ResultList({ title, documentId, pages, fileName, items, selectedKey, onSelect, onReview, onPickRange }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = countReview(items);
  const categories = [...new Set(items.map((i) => categoryOf(i.field.key)))];
  const visible = items.filter((i) => {
    if (filter === "all") return true;
    if (filter === "todo") return i.status === "attention" || i.status === "unconfirmed" || i.status === "missing";
    return categoryOf(i.field.key) === filter;
  });
  const pageText = pages.length === 1 ? `${pages[0]}ページ` : `${pages[0]}〜${pages.at(-1)}ページ`;

  function saveJson() {
    const exported = toExportedExtraction(documentId, fileName, items, new Date());
    download(
      exportFileName(fileName, documentId),
      new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json" }),
    );
  }

  return (
    <section className="result-list" aria-label={`${title}の抽出結果`}>
      <div className="result-list__header">
        <h2>
          {title}
          <span className="result-list__pages">{pageText}</span>
        </h2>
        <p className="result-list__counts">
          抽出結果 <b>{counts.total - counts.missing}</b> 件 ・ 未確認 <b>{counts.unconfirmed}</b>(うち要確認{" "}
          <b>{counts.attention}</b>)・ 未検出 <b>{counts.missing}</b>
        </p>
        <fieldset className="result-list__filters">
          <legend className="visually-hidden">表示する項目</legend>
          <button type="button" className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            すべて
          </button>
          <button type="button" className="chip" aria-pressed={filter === "todo"} onClick={() => setFilter("todo")}>
            未確認・未検出のみ
          </button>
          {categories.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {CATEGORIES[c].symbol} {CATEGORIES[c].label}
            </button>
          ))}
        </fieldset>
      </div>

      <ul className="result-list__items">
        {visible.map((item) => {
          const key = item.field.key;
          return (
            <FieldItem
              key={key}
              item={item}
              selected={selectedKey === key}
              onSelect={() => onSelect(item)}
              onConfirm={() => onReview({ type: "confirm", key })}
              onUnconfirm={() => onReview({ type: "unconfirm", key })}
              onEdit={(edit: ManualEdit) => onReview({ type: "edit", key, edit })}
              onRevert={() => onReview({ type: "revert", key })}
              onPickRange={() => onPickRange(key)}
            />
          );
        })}
        {visible.length === 0 && <li className="result-list__empty">表示する項目はありません。</li>}
      </ul>

      <div className="result-list__footer">
        <button type="button" className="button button--primary" onClick={saveJson}>
          JSONで保存
        </button>
        <button type="button" className="button" onClick={() => window.print()}>
          印刷
        </button>
        <button
          type="button"
          className="button"
          disabled={counts.unconfirmed === 0}
          onClick={() => onReview({ type: "confirm-all", keys: unconfirmedKeys(items) })}
        >
          未確認をまとめて確認済みにする
        </button>
      </div>
    </section>
  );
}
