"use client";

import { useEffect, useState } from "react";
import type { KamiCapabilities } from "@/lib/capabilities";
import { api } from "@/lib/client/api";

/** One-line summary of what this install can do, shown only when something is missing. */
export default function CapabilityBanner() {
  const [caps, setCaps] = useState<KamiCapabilities | null>(null);

  useEffect(() => {
    api
      .get<KamiCapabilities>("/api/capabilities")
      .then(setCaps)
      .catch(() => setCaps(null));
  }, []);

  if (!caps?.notes.length) return null;

  return (
    <div className="mono capability-banner" role="status">
      <strong>Setup · </strong>
      research: {caps.researchModes.join(", ")} · email:{" "}
      {caps.canSendEmail ? "send ready" : "drafts only"} · X:{" "}
      {caps.canConnectX ? "connectable" : "drafts only"}
      {" · "}
      {caps.notes[0]}
    </div>
  );
}
