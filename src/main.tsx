import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";
import { ThemeProvider } from "./theme/ThemeContext.tsx";
import { applyTheme, loadTheme } from "./theme/theme.ts";

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つかりません");

// 保存したテーマは、最初の描画の前に当てる
const theme = loadTheme();
applyTheme(theme);

createRoot(root).render(
  <StrictMode>
    <ThemeProvider initial={theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
