import { useEffect } from "react";
import { DOCUMENT_TYPES } from "../classify/document-type.ts";
import { LockIcon } from "../components/icons.tsx";
import diffImage from "./screenshots/diff.jpg";
import extractImage from "./screenshots/extract.jpg";
import homeImage from "./screenshots/home.jpg";
import ocrImage from "./screenshots/ocr.jpg";

// 使い方のページ。画面のスクリーンショットは、ダミーPDFから npm run help:screenshots で作る。
// 目次のリンクは "#help-…" にする(useHelpRoute は "#help" で始まる間、このページを出す)。
// 元の画面へは "#home" で戻る(PDFや確認の状態は App が持ち続けている)。

const SECTIONS = [
  { id: "help-open", title: "PDFを開く" },
  { id: "help-check", title: "抽出結果を確かめる" },
  { id: "help-ocr", title: "スキャンしたPDF(OCR)" },
  { id: "help-type", title: "書類の種類が違うとき" },
  { id: "help-compare", title: "前回の資料と比べる" },
  { id: "help-save", title: "保存・印刷" },
  { id: "help-data", title: "PDFとデータの扱い" },
  { id: "help-trouble", title: "うまくいかないとき" },
] as const;

function Figure({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="help__figure">
      <img src={src} alt={caption} width={1280} height={800} loading="lazy" />
      <figcaption>{caption}(見本のダミーPDF)</figcaption>
    </figure>
  );
}

function Section({ index, children }: { index: number; children: React.ReactNode }) {
  const section = SECTIONS[index];
  if (!section) return null;
  return (
    <section id={section.id} className="help__section" aria-labelledby={`${section.id}-title`}>
      <h2 id={`${section.id}-title`}>
        <span className="help__number mono">{index + 1}</span>
        {section.title}
      </h2>
      {children}
    </section>
  );
}

/** 使い方のページ */
export function HelpPage() {
  // 開いたときは、ページの先頭から見せる
  useEffect(() => {
    if (window.location.hash === "#help") window.scrollTo(0, 0);
  }, []);

  return (
    <main className="help">
      <div className="help__inner">
        <a className="link-button help__back" href="#home">
          ← 画面に戻る
        </a>
        <h1>使い方</h1>
        <p className="help__lead">
          不動産の取引で受け取る書類(源泉徴収票・課税証明書など)のPDFから、氏名・住所・年収などの項目を取り出して一覧にし、
          PDFの上の該当箇所に色を付けて示します。前回受け取った資料と比べて、違うところを確かめることもできます。
        </p>
        <p className="safe-note help__safe">
          <LockIcon />
          PDFはこの端末の中だけで読み取ります。インターネットの向こうへは送信しません。
        </p>

        <nav className="help__toc" aria-label="目次">
          <h2>目次</h2>
          <ol>
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <Section index={0}>
          <p>
            ヘッダーの「PDFを開く」を押してファイルを選ぶか、PDFのファイルを画面の上にドラッグして離します。
            読み込むと、書類の種類を自動で判定し、項目を取り出します。
          </p>
          <Figure src={homeImage} caption="PDFを開く前の画面" />
          <h3>対応している書類</h3>
          <ul>
            {DOCUMENT_TYPES.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
          </ul>
          <p>
            パソコンで作ったPDF(文字が入っているもの)のほか、紙をスキャンしたPDFや、勤務先から電子で受け取った源泉徴収票のPDFにも対応しています。
          </p>
        </Section>

        <Section index={1}>
          <p>右側に、取り出した項目の一覧が出ます。左のPDFでは、取り出した値に蛍光ペンのような色が付きます。</p>
          <Figure src={extractImage} caption="抽出結果の一覧と、PDFの上のハイライト(「支払金額」を選んだ状態)" />
          <ul>
            <li>
              <b>色と記号</b>は項目の種類を表します(名=氏名、生=生年月日、勤=勤務先、¥=年収・所得、住=住所、物=物件)。
              色の一覧は、PDFを開く前の画面の右側にあります。
            </li>
            <li>一覧の項目を押すと、PDFのその値に枠が付きます。反対に、PDFのハイライトを押すと、一覧のその項目が選ばれます。</li>
            <li>
              取り出した値は<b>必ずPDFと見比べて</b>確かめてください。合っていれば「確認する」を押します。
              すべて確かめたら「未確認をまとめて確認済みにする」で一度に確認済みにできます。
            </li>
            <li>
              値が違うときは「修正する」で書き直します。見つからなかった項目は「手動で追加」で入れられます。
              「PDF上で範囲を選ぶ」を押してPDFの上をドラッグすると、その範囲の文字を値にできます。
            </li>
            <li>
              項目の右には状態が出ます。「要確認」は読み取りが不確かな値で、値に波線が付きます。
              「未検出」は書類の中に見つからなかった項目です。
            </li>
            <li>一覧の上のボタンで、未確認・未検出の項目だけや、種類ごとに絞り込めます。</li>
          </ul>
        </Section>

        <Section index={2}>
          <p>
            紙をスキャンしたPDFは、画像から文字を読み取ります(OCR)。読み取っている間は、右側に「文字を読み取っています…」と出ます。
            1ページあたり数秒から数十秒かかります。読み取りが終わると、書類の種類を判定して項目を取り出します。
          </p>
          <Figure src={ocrImage} caption="スキャンしたPDFを読み取っている途中" />
          <ul>
            <li>
              OCR は文字を読み違えることがあります(「郎」を「朗」と読むなど)。読み取った値は、特に注意してPDFと見比べてください。
            </li>
            <li>
              読み取り方法は自動で選びます。結果がおかしいときは、ヘッダーの「読み取り方法を変える」で、PDFに入っている文字を使うか
              OCR で読むかを切り替えられます。
            </li>
          </ul>
        </Section>

        <Section index={3}>
          <p>
            書類の種類は、タイトルや欄の名前から自動で判定します。判定が違うときや「判定できませんでした」と出たときは、
            右側の「書類の種類を変える」で正しい種類を選んでください。選び直すと、その種類の項目を取り出し直します。
          </p>
        </Section>

        <Section index={4}>
          <p>
            PDFを開いた後でヘッダーの「前回と比較」を押し、前回受け取った同じ種類の書類のPDFか、前回「JSONで保存」したファイルを選びます。
            項目ごとに前回と今回の値を並べ、違うところを示します。
          </p>
          <Figure src={diffImage} caption="前回の資料と比べた結果(項目の差分)" />
          <dl className="help__terms">
            <dt>~ 変更</dt>
            <dd>値が変わった項目</dd>
            <dt>+ 追加</dt>
            <dd>今回だけにある項目</dd>
            <dt>− 削除</dt>
            <dd>前回だけにある項目</dd>
            <dt>≈ 表記の違い</dt>
            <dd>書き方は違うが、同じ値の項目(「4,200,000円」と「420万円」など)</dd>
            <dt>? 比較できない</dt>
            <dd>どちらかが読み取れなかった項目</dd>
          </dl>
          <ul>
            <li>氏名や生年月日が違うときは、別の人の書類かもしれないという注意が出ます。</li>
            <li>「テキスト差分」に切り替えると、書類の文章を行ごとに比べられます(前回をPDFで読み込んだときだけ)。</li>
          </ul>
        </Section>

        <Section index={5}>
          <ul>
            <li>
              「JSONで保存」で、確認・修正した抽出結果をファイルとして自分の端末に保存できます。次回の「前回と比較」に使えます。
            </li>
            <li>
              ヘッダーの「ハイライト付きPDFを保存」で、元のPDFにハイライトを書き込んだPDFを保存できます。ハイライトはPDFの注釈なので、Acrobat
              などで開くと、コメントに項目名・値・確認の状態が出ます。すべてのページの読み取りが終わると押せます。
            </li>
            <li>「印刷」で、抽出結果の一覧だけを印刷します。</li>
          </ul>
        </Section>

        <Section index={6}>
          <ul>
            <li>PDFは、この端末のブラウザの中だけで読み取ります。インターネットの向こうへは送信しません。</li>
            <li>
              読み込んだPDFや取り出した値は、ブラウザに保存しません。画面を閉じると消えます。残したいときは「JSONで保存」を使ってください。
            </li>
            <li>ブラウザに覚えさせるのは、ヘッダーで選んだ画面の見た目(標準・魔法の書庫)だけです。</li>
          </ul>
        </Section>

        <Section index={7}>
          <dl className="help__terms">
            <dt>項目が見つからない</dt>
            <dd>
              「PDF上で範囲を選ぶ」で値の範囲をドラッグするか、「手動で追加」で入力してください。スキャンしたPDFが傾いていたり薄かったりすると、
              読み取れないことがあります。
            </dd>
            <dt>値が違う</dt>
            <dd>
              「修正する」で書き直してください。書き直した値は「手動修正済み」になり、「元に戻す」で取り出した値に戻せます。
            </dd>
            <dt>読み取りが終わらない</dt>
            <dd>スキャンしたPDFは、ページが多いと時間がかかります。読み取りが終わったページから、順に結果に反映します。</dd>
            <dt>書類の種類を判定できない</dt>
            <dd>「書類の種類を変える」で選んでください。対応していない書類では、項目を取り出せません。</dd>
          </dl>
        </Section>

        <a className="link-button help__back" href="#home">
          ← 画面に戻る
        </a>
      </div>
    </main>
  );
}
