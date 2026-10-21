import { useEffect, useState } from "react";

// 使い方のページへの切り替え。URL の "#help" で切り替えるので、ブラウザの「戻る」でも元の画面に戻れる。
// 開いているPDFや確認の状態は App が持ち続けるので、使い方を見てから戻っても消えない。

/** URL が "#help"(または目次の "#help-…")のあいだ true */
export function useHelpRoute(): boolean {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash === "#help" || hash.startsWith("#help-");
}
