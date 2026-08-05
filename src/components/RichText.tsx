import type { ReactNode } from "react";

/**
 * Модель размечает названия игр звёздочками (*The Witcher 3 (S)*).
 * Рендерим их выделением, а не показываем сырую разметку.
 */
export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*?[^*]+\*\*?)/g);

  return (
    <>
      {parts.map((part, index): ReactNode => {
        const match = /^\*\*?([^*]+)\*\*?$/.exec(part);
        if (!match) return part;
        return (
          <em key={index} className={`text-white not-italic ${className}`}>
            {match[1]}
          </em>
        );
      })}
    </>
  );
}
