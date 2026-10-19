import { defineConfig } from "@playwright/test";

// E2Eテスト(e2e/)。ビルドした dist/ を `vite preview` で配信し、Google Chrome で開く。
//   npm run build && npm run test:e2e
// ブラウザはダウンロードせず、インストール済みの Google Chrome を使う(GitHub Actions のランナーにも入っている)。

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  // スキャンPDFの OCR を含むので、1つのテストに時間がかかる(e2e/network.spec.ts の待ち時間の説明も参照)
  timeout: 360_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
