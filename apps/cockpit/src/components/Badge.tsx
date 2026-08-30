import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "ok" | "warn" | "danger";

export interface BadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly "data-testid"?: string;
}

/** The single most reused visual primitive — mono, uppercase, hairline-bordered. */
export function Badge({ tone = "neutral", children, ...rest }: BadgeProps) {
  return (
    <span className={`badge badge--tone-${tone}`} {...rest}>
      {children}
    </span>
  );
}

export interface TrustBadgeProps {
  readonly trusted: boolean;
  readonly "data-testid"?: string;
}

/** Trust is never communicated by color alone — the word itself is always rendered. */
export function TrustBadge({ trusted, ...rest }: TrustBadgeProps) {
  return (
    <Badge tone={trusted ? "ok" : "danger"} {...rest}>
      {trusted ? "trusted" : "untrusted"}
    </Badge>
  );
}
