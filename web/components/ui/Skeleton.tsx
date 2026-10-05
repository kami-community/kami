/** Kraft-fibre loading placeholder. `lines` text lines, optionally led by a title bar. */
export default function Skeleton({
  lines = 3,
  title = false,
}: {
  lines?: number;
  title?: boolean;
}) {
  return (
    <div className="skeleton-block" aria-hidden>
      {title && <span className="skeleton skeleton--title" />}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={`skeleton${i === lines - 1 ? " skeleton--short" : ""}`} />
      ))}
    </div>
  );
}
