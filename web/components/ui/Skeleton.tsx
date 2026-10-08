/** Shimmering placeholder lines for content that is still loading. */
export default function Skeleton({
  lines = 3,
  title = false,
}: {
  lines?: number;
  title?: boolean;
}) {
  return (
    <div className="skeleton" aria-hidden>
      {title && <span className="skeleton__line skeleton__line--title" />}
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="skeleton__line"
          style={{ width: i === lines - 1 ? "62%" : `${92 - ((i * 7) % 15)}%` }}
        />
      ))}
    </div>
  );
}
