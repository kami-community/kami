import type { HTMLAttributes, ReactNode } from "react";

type CardTone = "default" | "raised" | "inset" | "flat";

/** Surface card: white, hairline ring, smooth layered shadow. */
export default function Card({
  tone = "default",
  interactive = false,
  className,
  as: Tag = "div",
  ...rest
}: HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  interactive?: boolean;
  as?: "div" | "section" | "article" | "li";
}) {
  const cls = [
    "card",
    tone !== "default" ? `card--${tone}` : "",
    interactive ? "card--interactive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return <Tag className={cls} {...rest} />;
}

/** Header bar: title on the left, meta or actions on the right. */
export function CardBar({
  title,
  icon,
  children,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card__bar${className ? ` ${className}` : ""}`}>
      <div className="row truncate">
        {icon && <span className="text-3 row">{icon}</span>}
        <span className="card__title truncate">{title}</span>
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function CardBody({
  roomy = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { roomy?: boolean }) {
  return (
    <div
      className={`card__body${roomy ? " card__body--roomy" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export function CardFooter({
  plain = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { plain?: boolean }) {
  return (
    <div
      className={`card__footer${plain ? " card__footer--plain" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
