import { useEffect, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Cascade delay, ms */
  delay?: number;
  /** Which side it slides in from */
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
 * A delayed appearance. It fires on mount, so changing the `key` on the parent
 * restarts the animation — that's how the heroes are switched.
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
