import { useEffect, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Задержка каскада, мс */
  delay?: number;
  /** Откуда выезжает */
  from?: "up" | "down" | "left" | "scale";
  className?: string;
}

const OFFSET: Record<NonNullable<Props["from"]>, string> = {
  up: "translate-y-4",
  down: "-translate-y-3",
  left: "translate-x-6",
  scale: "scale-[1.03]",
};

/**
 * Появление с задержкой. Ставится на mount, поэтому смена `key` у родителя
 * перезапускает анимацию — этим и переключаются герои.
 */
export default function Reveal({ children, delay = 0, from = "up", className = "" }: Props) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  return (
    <div
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-x-0 translate-y-0 scale-100 opacity-100 blur-0" : `opacity-0 blur-[2px] ${OFFSET[from]}`
      } ${className}`}
    >
      {children}
    </div>
  );
}
