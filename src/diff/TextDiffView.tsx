import { useEffect, useRef, useState } from "react";
import { AlertIcon } from "../components/icons.tsx";
import type { DiffStatus } from "../highlight/highlights.ts";
import { DIFF_LABELS } from "./DiffList.tsx";
import { countTextDiffs, type DiffPart, type TextDiffKind, type TextDiffRow } from "./text-diff.ts";

// テキスト差分(前回と今回の行を左右に並べた表示)。抽出する項目に入らない欄の書き換えを見つけるための補助。

/** 行の差分の種類を、項目の差分と同じ記号・色で表す */
const KIND_STATUS: Record<Exclude<TextDiffKind, "same">, DiffStatus> = {
  changed: "changed",
  added: "added",
  removed: "removed",
};

/** 差分のある行の前後に、続けて表示する変わっていない行の数 */
const CONTEXT_LINES = 1;

interface Props {
  /** null のときは、前回の資料に文字がない(JSON から読み込んだ)ことを表す */
  rows: TextDiffRow[] | null;
  /** どちらかに OCR で読んだ行があるか */
  usesOcr: boolean;
  selectedIndex: number | null;
  onSelect: (index: number, row: TextDiffRow) => void;
}

function Parts({ parts, mark }: { parts: DiffPart[]; mark: "del" | "ins" }) {
  return (
    <>
      {parts.map((part, i) =>
        part.changed ? (
          mark === "del" ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: 文字の並びは変わらないので、位置をキーにしてよい
            <del key={i}>{part.text}</del>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上
            <ins key={i}>{part.text}</ins>
          )
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: 同上
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Row({
  row,
  index,
  selected,
  onSelect,
}: {
  row: TextDiffRow;
  index: number;
  selected: boolean;
  onSelect: Props["onSelect"];
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const status = row.kind === "same" ? null : DIFF_LABELS[KIND_STATUS[row.kind]];
  // 今回の行があれば、PDF上のその行を表示できる
  const selectable = row.current !== undefined && row.kind !== "same";
  return (
    <tr ref={ref} className={`text-diff__row text-diff__row--${row.kind}${selected ? " text-diff__row--selected" : ""}`}>
      <td className="text-diff__mark" aria-label={status?.label}>
        {status?.symbol}
      </td>
      <td className="text-diff__cell">
        {row.previous && (
          <>
            <span className="text-diff__page">p.{row.previous.page}</span>
            {row.parts ? (
              <Parts parts={row.parts.previous} mark="del" />
            ) : row.kind === "removed" ? (
              <del>{row.previous.text}</del>
            ) : (
              row.previous.text
            )}
          </>
        )}
      </td>
      <td className="text-diff__cell">
        {row.current && (
          <>
            <span className="text-diff__page">p.{row.current.page}</span>
            {selectable ? (
              <button type="button" className="text-diff__select" onClick={() => onSelect(index, row)}>
                {row.parts ? <Parts parts={row.parts.current} mark="ins" /> : <ins>{row.current.text}</ins>}
              </button>
            ) : (
              row.current.text
            )}
          </>
        )}
      </td>
    </tr>
  );
}

/** テキスト差分の表示 */
export function TextDiffView({ rows, usesOcr, selectedIndex, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (rows === null) {
    return (
      <p className="result-panel__note">
        前回の資料を抽出結果のファイル(JSON)から読み込んだため、テキスト差分は表示できません。前回のPDFを読み込むと表示できます。
      </p>
    );
  }

  const counts = countTextDiffs(rows);
  const total = counts.changed + counts.added + counts.removed;
  // 差分のある行と、その前後の行だけを出す
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => {
      if (showAll) return true;
      for (let k = index - CONTEXT_LINES; k <= index + CONTEXT_LINES; k++) {
        const near = rows[k];
        if (near && near.kind !== "same") return true;
      }
      return false;
    });

  return (
    <section className="text-diff" aria-label="テキスト差分">
      <p className="diff-list__hint">
        抽出する項目に入らない欄(備考・特記事項など)の書き換えを確かめるための表示です。空白・全角と半角の違いや、改行の位置だけの違いは差分にしていません。
      </p>
      {usesOcr && (
        <p className="text-diff__ocr" role="note">
          <AlertIcon size={16} />
          OCRで読んだページがあります。文字の読み違いで、実際には変わっていない行が差分になることがあります。
        </p>
      )}
      <ul className="diff-list__summary" aria-label="行の差分の件数">
        {(["changed", "added", "removed"] as const).map((kind) => (
          <li key={kind} className={`badge diff-badge diff-badge--${KIND_STATUS[kind]}`}>
            <b aria-hidden="true">{DIFF_LABELS[KIND_STATUS[kind]].symbol}</b>
            {DIFF_LABELS[KIND_STATUS[kind]].label} {counts[kind]}行
          </li>
        ))}
      </ul>
      {total === 0 && !showAll ? (
        <p className="result-list__empty">前回と違う行はありません。</p>
      ) : (
        <div className="text-diff__scroll">
          <table className="text-diff__table">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">判定</span>
                </th>
                <th scope="col">前回</th>
                <th scope="col">今回</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ row, index }) => (
                <Row key={index} row={row} index={index} selected={selectedIndex === index} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <label className="text-diff__toggle">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        変わっていない行もすべて表示する
      </label>
    </section>
  );
}
