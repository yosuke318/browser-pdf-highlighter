import { type PointerEvent, useState } from "react";

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  /** 範囲を選び終えたとき(ページの左上を原点とする、CSS px の長方形) */
  onSelect: (rect: ScreenRect) => void;
}

/**
 * ページの上でドラッグして範囲を選ぶ。抽出結果の値を、PDF上の文字から手で選び直すときに使う。
 * キーボードだけでは範囲を選べないので、値は「修正する」の入力欄からも直せるようにしている。
 */
export function RangeSelector({ onSelect }: Props) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  function point(event: PointerEvent<HTMLDivElement>) {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  const rect =
    start && current
      ? {
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y),
        }
      : null;

  return (
    <div
      className="range-selector"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setStart(point(e));
        setCurrent(point(e));
      }}
      onPointerMove={(e) => {
        if (start) setCurrent(point(e));
      }}
      onPointerUp={() => {
        if (rect && rect.width > 2 && rect.height > 2) onSelect(rect);
        setStart(null);
        setCurrent(null);
      }}
    >
      {rect && <div className="range-selector__box" style={rect} />}
    </div>
  );
}
