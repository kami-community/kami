"use client";

import type { ReactNode } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import type { View } from "@/lib/client/routes";

/**
 * A real link to another workspace view: plain clicks navigate client-side,
 * modified clicks (new tab, copy link) behave like any link.
 */
export default function ViewLink({
  to,
  className = "records-link",
  children,
}: {
  to: View;
  className?: string;
  children: ReactNode;
}) {
  const { href, navigate } = useWorkspace();
  return (
    <a
      href={href(to)}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
