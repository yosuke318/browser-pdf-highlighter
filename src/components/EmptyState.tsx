import { useWording } from "../theme/ThemeContext.tsx";
import { LockIcon, UploadIcon } from "./icons.tsx";

interface Props {
  onChooseFile: () => void;
}

/** PDFを読み込む前の画面。ドロップはウインドウ全体で受け取る(useFileDrop) */
export function EmptyState({ onChooseFile }: Props) {
  const wording = useWording();
  return (
    <div className="empty-state">
      <div className="drop-area">
        <span className="drop-area__icon">
          <UploadIcon size={56} />
        </span>
        <div className="drop-area__text">
          <h1>{wording.dropTitle}</h1>
          <p>
            源泉徴収票・課税証明書・住民税決定通知書・確定申告書・
            <br />
            住宅ローン申込書・入居申込書のPDF
          </p>
        </div>
        <button type="button" className="button button--primary button--large" onClick={onChooseFile}>
          ファイルを選択
        </button>
        <p className="drop-area__note">
          スキャンしたPDFは自動でOCR(文字の読み取り)を行います。読み取った値は、画面で確認してから使ってください。
        </p>
        <a className="link-button" href="#help">
          使い方を見る
        </a>
        <div className="safe-note">
          <LockIcon />
          PDFはこの端末の外へ送信されません
        </div>
      </div>
    </div>
  );
}
