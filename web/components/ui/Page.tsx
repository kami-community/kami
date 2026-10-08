import type { ReactNode } from "react";

/** Page wrapper: centered column with the gallery's rhythm. */
export function Page({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return <div className={`page${wide ? " page--wide" : ""}`}>{children}</div>;
}

/** Page title block: eyebrow, title, lede, and right-aligned actions. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page__head">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="page__eyebrow">{eyebrow}</div>}
        <h1 className="page__title">{title}</h1>
        {lede && <p className="page__lede">{lede}</p>}
      </div>
      {actions && <div className="page__actions">{actions}</div>}
    </div>
  );
}

/** "01  Title  description" — a numbered section with a dashed rule above. */
export function Section({
  num,
  title,
  desc,
  actions,
  children,
  flush = false,
  ...rest
}: {
  num?: string;
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`section${flush ? " section--flush" : ""}`} {...rest}>
      {(title || num) && (
        <div className="section__head">
          {num && <span className="section__num">{num}</span>}
          {title && <h2 className="section__title">{title}</h2>}
          {desc && <span className="section__desc">{desc}</span>}
          {actions && <span className="section__actions">{actions}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
