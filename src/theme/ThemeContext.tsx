import { createContext, type ReactNode, useContext, useState } from "react";
import { applyTheme, saveTheme, type Theme, type Wording, wordingFor } from "./theme.ts";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState>({ theme: "standard", setTheme: () => {} });

/** テーマを持ち、切り替えたときにページへ当てて保存する。保存は利用者が切り替えたときだけ行う */
export function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState(initial);
  function setTheme(next: Theme) {
    applyTheme(next);
    saveTheme(next);
    setThemeState(next);
  }
  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

/** いまのテーマの言い回し */
export function useWording(): Wording {
  return wordingFor(useContext(ThemeContext).theme);
}
