import { ChevronLeftIcon, ChevronRightIcon, FitWidthIcon, MinusIcon, PlusIcon } from "../components/icons.tsx";
import { formatPercent, MAX_ZOOM, MIN_ZOOM, type Zoom } from "./zoom.ts";

interface Props {
  pageNumber: number;
  numPages: number;
  /** 前後のページへ移る。delta は -1 か 1 */
  onPageStep: (delta: -1 | 1) => void;
  zoom: Zoom;
  /** 実際に使っている倍率(「幅に合わせる」のときは計算した倍率) */
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}

/** ページ送りとズームの操作 */
export function ViewerToolbar({ pageNumber, numPages, onPageStep, zoom, scale, onZoomIn, onZoomOut, onFitWidth }: Props) {
  return (
    <div className="viewer-toolbar">
      <div className="control-group">
        <button
          type="button"
          className="icon-button"
          aria-label="前のページ"
          disabled={pageNumber <= 1}
          onClick={() => onPageStep(-1)}
        >
          <ChevronLeftIcon />
        </button>
        <span className="mono page-indicator" aria-live="polite">
          {pageNumber} / {numPages}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label="次のページ"
          disabled={pageNumber >= numPages}
          onClick={() => onPageStep(1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <div className="control-group">
        <button type="button" className="icon-button" aria-label="縮小" disabled={scale <= MIN_ZOOM} onClick={onZoomOut}>
          <MinusIcon />
        </button>
        <span className="mono zoom-indicator" aria-live="polite">
          {formatPercent(scale)}
        </span>
        <button type="button" className="icon-button" aria-label="拡大" disabled={scale >= MAX_ZOOM} onClick={onZoomIn}>
          <PlusIcon />
        </button>
        <button type="button" className="button" aria-pressed={zoom.mode === "fit-width"} onClick={onFitWidth}>
          <FitWidthIcon />
          幅に合わせる
        </button>
      </div>
    </div>
  );
}
