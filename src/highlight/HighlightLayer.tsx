import type { CSSProperties } from "react";
import { CATEGORIES } from "./categories.ts";
import { type Highlight, markerDirection, type ToScreen } from "./highlights.ts";

interface Props {
  highlights: readonly Highlight[];
  toScreen: ToScreen;
  /** ページの表示上の回転角度(/Rotate)。蛍光ペンを引く向きを合わせる */
  rotation: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function className(h: Highlight, selected: boolean): string {
  const base = h.kind.type === "field" ? `highlight highlight--${h.kind.category}` : `highlight highlight--diff-${h.kind.status}`;
  return [base, h.lowConfidence ? "highlight--low-confidence" : "", selected ? "highlight--selected" : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * ページの canvas の上に重ねて、蛍光ペンを引いたようなハイライトを描く。
 * 位置は toScreen(pdf.js の viewport による変換)で求めるので、ズームやページの回転に追従する。
 * 値が複数のセルに分かれていればセルごとに塗り、記号(色だけに頼らないための目印)は最初のセルにだけ付ける。
 */
export function HighlightLayer({ highlights, toScreen, rotation, selectedId, onSelect }: Props) {
  const direction = markerDirection(rotation);
  return (
    <div className={`highlight-layer highlight-layer--${direction}`}>
      {highlights.flatMap((h) =>
        h.rects.map((rect, i) => {
          const box = toScreen(rect);
          const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
          const selected = selectedId === h.id;
          return (
            <button
              type="button"
              key={`${h.id}:${rect.x0},${rect.y0}`}
              className={className(h, selected)}
              style={style}
              title={h.label}
              aria-label={h.label}
              aria-pressed={selected}
              onClick={() => onSelect?.(selected ? null : h.id)}
            >
              {i === 0 && h.kind.type === "field" && (
                <span className="highlight__symbol" aria-hidden="true">
                  {CATEGORIES[h.kind.category].symbol}
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}
