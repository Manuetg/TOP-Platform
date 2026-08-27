import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, id, ...props }: InputProps) {
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
        className="top-input"
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
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
