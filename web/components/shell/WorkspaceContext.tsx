"use client";

import { createContext, useContext } from "react";
import type { View } from "@/lib/client/routes";

/**
 * Workspace navigation for any screen inside `/c/<id>`: the current view,
 * links and navigation to other views, and the Kami Guide entry point.
 */
export interface WorkspaceContextValue {
  view: View;
  href: (view: View) => string;
  navigate: (view: View) => void;
  /** open Kami Guide and ask a question */
  askGuide: (text: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside the campaign workspace");
  return value;
}
