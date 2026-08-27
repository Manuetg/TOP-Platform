import type { PropsWithChildren } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";

type BadgeProps = PropsWithChildren<{
  tone?: BadgeTone;
}>;

export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <span className={`top-badge top-badge--${tone}`}>
      {children}
    </span>
  );
}
