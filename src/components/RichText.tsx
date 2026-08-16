import type { ReactNode } from "react";

/**
 * Markdown coming out of the model's answers.
 *
 * It marks up two different things: `**bold**` is the point of a paragraph,
 * `*a single asterisk*` is a game title. Both used to render the same white,
 * and a portrait read as one solid highlight: a whole sentence looked like a
 * title. So the point is merely lighter and denser, and a title gets its own hue.
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

        // The model sometimes marks titles up wiki-style: [[Metro Exodus]]
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
