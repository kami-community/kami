import type { ReactNode } from "react";
import { IconAlert, IconCheckCircle, IconInfo, IconWarning } from "@/components/ui/icons";

type CalloutTone = "neutral" | "info" | "success" | "warn" | "error";

const ICONS: Record<CalloutTone, ReactNode> = {
  neutral: <IconInfo size={15} />,
  info: <IconInfo size={15} />,
  success: <IconCheckCircle size={15} />,
  warn: <IconWarning size={15} />,
  error: <IconAlert size={15} />,
};

/** An inline note: neutral, info, success, warning or error (errors are alerts). */
export default function Callout({
  tone = "neutral",
  title,
  children,
  actions,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={`callout${tone === "neutral" ? "" : ` callout--${tone}`} fade-up`}
      role={tone === "error" ? "alert" : undefined}
    >
      <span className="callout__icon">{ICONS[tone]}</span>
      <div className="callout__body">
        {title && <p className="callout__title">{title}</p>}
        {children && <div>{children}</div>}
        {actions && <div className="callout__actions">{actions}</div>}
      </div>
    </div>
  );
}
