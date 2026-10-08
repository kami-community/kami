"use client";

import type { AnchorHTMLAttributes } from "react";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import type { View } from "@/lib/client/routes";

/** A real link to a workspace view: client navigation on click, new tab on ⌘/Ctrl-click. */
export default function ViewLink({
  view,
  onClick,
  ...rest
}: { view: View } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const { href, navigate } = useWorkspace();
  return (
    <a
      href={href(view)}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.button !== 0
        )
          return;
        event.preventDefault();
        navigate(view);
      }}
      {...rest}
    />
  );
}
