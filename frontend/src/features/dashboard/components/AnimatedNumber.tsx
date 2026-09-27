import { useEffect, useRef, useState } from "react";
import { formatMoney } from "../../../shared/utils/money";

type Format = "number" | "percent" | "currency";

function formatValue(value: number, format: Format, currency = "PYG") {
  if (!Number.isFinite(value)) return "—";
  if (format === "percent") {
    return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(value) + "%";
  }
  if (format === "currency") return formatMoney(Math.round(value), currency);
  return new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(value);
}

export function AnimatedNumber({
  value,
  format = "number",
  currency,
  className,
}: {
  value: number;
  format?: Format;
  currency?: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    const duration = 800;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [value]);
  return <span className={className}>{formatValue(display, format, currency)}</span>;
}
