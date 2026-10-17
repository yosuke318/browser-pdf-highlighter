// ズーム(表示倍率)の計算。倍率 1 は、PDFの 1pt を CSS の 1px で表示する大きさ。

/** ＋/− ボタンで切り替える倍率 */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** 「幅に合わせる」か、倍率を指定するか */
export type Zoom = { mode: "fit-width" } | { mode: "scale"; scale: number };

export function clampScale(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
}

/** 今の倍率より1段大きい倍率。すでに最大なら最大のまま */
export function zoomIn(current: number): number {
  return ZOOM_STEPS.find((step) => step > current + 1e-6) ?? MAX_ZOOM;
}

/** 今の倍率より1段小さい倍率。すでに最小なら最小のまま */
export function zoomOut(current: number): number {
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6) ?? MIN_ZOOM;
}

/**
 * ページの幅を表示領域の幅に合わせる倍率。
 * pageWidth は倍率 1 のときのページの幅(回転を反映した後の幅)。
 */
export function fitWidthScale(pageWidth: number, containerWidth: number): number {
  if (pageWidth <= 0 || containerWidth <= 0) return 1;
  return clampScale(containerWidth / pageWidth);
}

export function resolveScale(zoom: Zoom, pageWidth: number, containerWidth: number): number {
  return zoom.mode === "fit-width" ? fitWidthScale(pageWidth, containerWidth) : clampScale(zoom.scale);
}

export function formatPercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}
