import { useEffect, useState } from "react";

/**
 * 要素の内側の幅(padding を除いた幅)を、大きさが変わるたびに返す。
 * 要素が後から表示される場合にも対応するため、ref ではなく ref 用のコールバックを返す。
 */
export function useElementWidth<T extends HTMLElement>(): [(element: T | null) => void, number] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, width];
}
