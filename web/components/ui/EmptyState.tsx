import type { ReactNode } from "react";
import { IconInbox } from "@/components/ui/icons";

/** What is missing and what to do next. */
export default function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty fade-up">
      <span className="empty__icon">{icon ?? <IconInbox size={16} />}</span>
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
