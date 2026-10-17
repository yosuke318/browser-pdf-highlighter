import { CATEGORIES, type HighlightCategory } from "./categories.ts";

const ORDER: HighlightCategory[] = ["name", "birth", "work", "money", "address", "property", "other"];

/** ハイライトの色の凡例 */
export function HighlightLegend() {
  return (
    <section className="highlight-legend" aria-labelledby="highlight-legend-heading">
      <h3 id="highlight-legend-heading">ハイライトの色</h3>
      <ul>
        {ORDER.map((category) => (
          <li key={category}>
            <span className={`highlight-chip highlight-chip--${category}`} aria-hidden="true">
              {CATEGORIES[category].symbol}
            </span>
            <span className="highlight-legend__label">{CATEGORIES[category].label}</span>
            <span className="highlight-legend__description">{CATEGORIES[category].description}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
