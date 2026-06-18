import type { ReactNode } from "react";

export interface BadgeProps {
  ariaLabel?: string | undefined;
  children?: ReactNode;
  className?: string | undefined;
}

export function Badge({ ariaLabel, children, className = "" }: BadgeProps) {
  return (
    <span aria-label={ariaLabel} className={`badge${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

export interface StatusDotProps {
  className?: string | undefined;
  statusClassName: string;
}

export function StatusDot({ className = "", statusClassName }: StatusDotProps) {
  return <span aria-hidden="true" className={`status-dot ${statusClassName}${className ? ` ${className}` : ""}`} />;
}
