/** 右側の抽出結果パネル。抽出処理ができるまでは説明だけを表示する */
export function ResultPanel() {
  return (
    <aside className="result-panel" aria-label="抽出結果">
      <div className="result-panel__section">
        <h2>抽出結果</h2>
        <p>PDFを読み込むと、書類の種類を判定し、検出した項目をここに一覧表示します。PDF上の該当箇所にもハイライトを付けます。</p>
      </div>
      <div className="result-panel__card">
        <h3>前回の資料と比較する</h3>
        <p>同じ種類の書類を2つ読み込むか、前回保存した抽出結果(JSON)を読み込むと、「前回と比較」で差分を確認できます。</p>
      </div>
    </aside>
  );
}
