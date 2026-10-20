import { useTheme } from "../theme/ThemeContext.tsx";
import { THEMES } from "../theme/theme.ts";
import { StarIcon } from "./icons.tsx";

/** ヘッダーに置く、テーマの切り替え */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset className="theme-toggle">
      <legend className="visually-hidden">テーマ</legend>
      {THEMES.map(({ id, label }) => (
        <button key={id} type="button" className="theme-toggle__option" aria-pressed={theme === id} onClick={() => setTheme(id)}>
          {id === "library" && <StarIcon size={13} />}
          {label}
        </button>
      ))}
    </fieldset>
  );
}
