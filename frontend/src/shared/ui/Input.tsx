import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, className = "", "aria-describedby": describedBy, "aria-invalid": invalid, ...props }: InputProps) {
  const inputId = id ?? props.name;
  const errorId = error && inputId ? `${inputId}-error` : undefined;

  return (
    <div className="top-field">
      {label ? (
        <label className="top-field__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <input
        id={inputId}
        className={`top-input ${className}`.trim()}
        aria-invalid={error ? true : invalid ?? false}
        aria-describedby={[describedBy, errorId].filter(Boolean).join(" ") || undefined}
        {...props}
      />

      {error ? (
        <p id={errorId} className="top-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
