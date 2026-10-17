import { useId } from "react";
import { DOCUMENT_TYPES, type DocumentTypeGuess } from "../classify/document-type.ts";
import { AlertIcon } from "./icons.tsx";

interface Props {
  pageNumber: number;
  guess: DocumentTypeGuess;
  /** 利用者が手動で選んだ書類タイプ。自動判定のままなら undefined */
  override?: string;
  /** null を渡すと自動判定に戻す */
  onChange: (documentId: string | null) => void;
}

const REASONS: Record<NonNullable<DocumentTypeGuess["reason"]>, string> = {
  "no-text": "このページには文字データがないため、書類の種類を判定できません(OCRに対応したら判定します)。",
  "low-score": "書類の種類を判定する手がかりが見つかりませんでした。",
  "close-candidates": "複数の書類の特徴が見つかり、書類の種類を絞り込めませんでした。",
};

const AUTO = "__auto__";
const titleOf = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id)?.title ?? id;

/** 書類の種類の判定結果と根拠、手動での切り替え */
export function DocumentTypeCard({ pageNumber, guess, override, onChange }: Props) {
  const selectId = useId();
  const detected = guess.documentId;
  const current = override ?? detected;
  const best = guess.candidates[0];

  return (
    <section className="result-panel__card" aria-labelledby={`${selectId}-heading`}>
      <h3 id={`${selectId}-heading`}>書類の種類({pageNumber}ページ目)</h3>
      <p className="document-type__current">
        {current ? titleOf(current) : "判定できませんでした"}
        {override ? (
          <span className="badge badge--neutral">手動で選択</span>
        ) : (
          detected && <span className="badge badge--neutral">自動判定</span>
        )}
      </p>
      {!detected && !override && guess.reason && (
        <p className="document-type__note">
          <AlertIcon size={16} />
          {REASONS[guess.reason]}
          下の一覧から選んでください。
        </p>
      )}

      {best && best.hits.length > 0 && (
        <div>
          <h4>判定の根拠</h4>
          <ul className="document-type__hits">
            {best.hits.map((hit) => (
              <li key={hit.label}>
                「{hit.label}」{hit.inTitle && <span className="document-type__tag">タイトル</span>}
                <span className="mono">{hit.weight > 0 ? `+${hit.weight}` : hit.weight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {guess.candidates.length > 1 && (
        <div>
          <h4>ほかの候補</h4>
          <ul className="document-type__candidates">
            {guess.candidates.slice(1, 4).map((c) => (
              <li key={c.documentId}>
                {c.title}
                <span className="mono">{c.score}点</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label htmlFor={selectId} className="document-type__select-label">
        書類の種類を変える
      </label>
      <select
        id={selectId}
        className="select"
        value={override ?? AUTO}
        onChange={(e) => onChange(e.target.value === AUTO ? null : e.target.value)}
      >
        <option value={AUTO}>自動判定{detected ? `(${titleOf(detected)})` : "(判定できず)"}</option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
    </section>
  );
}
