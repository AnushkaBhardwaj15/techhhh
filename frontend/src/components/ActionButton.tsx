import type { ButtonHTMLAttributes } from "react";
import styles from "./ActionButton.module.css";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
};

/**
 * Adapts Aceternity UI's Stateful Button loader to CSS Modules.
 * https://ui.aceternity.com/components/stateful-button
 * The caller owns request state; a click alone never implies success.
 */
export function ActionButton({
  busy = false,
  disabled,
  children,
  className = "",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${styles.button} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy}
    >
      {busy && (
        <svg
          className={styles.loader}
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      )}
      {children}
    </button>
  );
}
