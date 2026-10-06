import type { ReactNode } from "react";

/** Shimmering label — signals the agent is processing. */
export default function Shimmer({
  children,
  fast = false,
  className = "",
}: {
  children: ReactNode;
  fast?: boolean;
  className?: string;
}) {
  return (
    <span className={`shimmer${fast ? " shimmer--fast" : ""}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
