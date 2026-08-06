import type { ReactNode } from "react";

/**
 * Маркдаун из ответов модели.
 *
 * Она размечает две разные вещи: `**жирным**` — мысль абзаца, `*звёздочкой*`
 * — названия игр. Раньше и то и другое рисовалось одинаково белым, и портрет
 * читался как сплошная подсветка: целое предложение выглядело названием.
 * Поэтому мысль — просто светлее и плотнее, а название — своим оттенком.
 */
const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[\[[^\]]+\]\])/g;

export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <>
      {text.split(TOKEN).map((part, index): ReactNode => {
        const strong = /^\*\*([^*]+)\*\*$/.exec(part);
        if (strong) {
          return (
            <strong key={index} className={`font-medium text-gray-100 ${className}`}>
              {strong[1]}
            </strong>
          );
        }

        // Модель иногда размечает названия по-викисловарному: [[Metro Exodus]]
        const title = /^\*([^*]+)\*$/.exec(part) ?? /^\[\[([^\]]+)\]\]$/.exec(part);
        if (title) {
          return (
            <em key={index} className={`not-italic text-sky-200/90 ${className}`}>
              {title[1]}
            </em>
          );
        }

        return part;
      })}
    </>
  );
}
