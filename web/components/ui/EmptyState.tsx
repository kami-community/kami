/** A dashed paper slip saying what is missing and what to do next. */
export default function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state fade-in">
      <p className="empty-state__title">{title}</p>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}
