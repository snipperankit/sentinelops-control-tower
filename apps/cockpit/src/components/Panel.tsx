import type { ReactNode } from "react";

export interface PanelProps {
  readonly title: string;
  readonly meta?: ReactNode;
  readonly children: ReactNode;
  readonly padded?: boolean;
  readonly "data-testid"?: string;
  readonly "aria-label"?: string;
}

/** Panel shell: hairline border, mono eyebrow header, optional right-aligned meta. */
export function Panel({
  title,
  meta,
  children,
  padded = true,
  ...rest
}: PanelProps) {
  return (
    <section className="panel" {...rest}>
      <div className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {meta && <div className="panel__meta">{meta}</div>}
      </div>
      <div className={padded ? "panel__body" : "panel__body panel__body--flush"}>
        {children}
      </div>
    </section>
  );
}
