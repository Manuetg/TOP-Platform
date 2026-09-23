import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  loadingLabel?: string;
} & ({ iconOnly: true; "aria-label": string } | { iconOnly?: false });

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  iconOnly = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`top-button top-button--${variant} top-button--${size}${iconOnly ? " top-button--icon" : ""} ${className}`}
    >
      {loading ? <LoaderCircle className="top-motion-spin" size={18} aria-hidden="true" /> : null}
      {loading && iconOnly ? null : loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
