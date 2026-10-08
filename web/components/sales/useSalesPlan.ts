"use client";

import { useState } from "react";
import type { PlanSource } from "@/components/SalesPlanView";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { SalesPlan } from "@/lib/salesTypes";

interface GeneratedPlan {
  plan: SalesPlan;
  source: PlanSource | null;
  note: string | null;
}

type PlanResponse = { plan: SalesPlan; source?: PlanSource; note?: string | null };

/**
 * The campaign's latest Sales plan: the stored one, or the one the sales
 * strategist just wrote. Lives at the area level so a plan being written
 * survives switching tabs.
 */
export function useSalesPlan(sessionId: string, configured: boolean, onChanged: () => void) {
  const query = useApi<{ plan: SalesPlan | null }>(
    configured ? withQuery("/api/sales/plan", { session_id: sessionId }) : null,
  );
  const [generated, setGenerated] = useState<GeneratedPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  async function generate() {
    setGenerateError(null);
    setGenerating(true);
    try {
      const json = await api.post<PlanResponse>("/api/sales/plan", {
        session_id: sessionId,
        action: "generate",
      });
      setGenerated({ plan: json.plan, source: json.source ?? null, note: json.note ?? null });
      onChanged();
    } catch (err) {
      setGenerateError(errorMessage(err, "Could not write the plan"));
    } finally {
      setGenerating(false);
    }
  }

  return {
    plan: generated?.plan ?? query.data?.plan ?? null,
    source: generated?.source ?? null,
    note: generated?.note ?? null,
    /** the stored plan has not arrived yet */
    loading: configured && (query.loading || (!query.data && !query.error)),
    generating,
    error: generateError ?? query.error,
    generate,
    retry() {
      if (generateError) void generate();
      else query.reload();
    },
    /** a plan came back from approve / rewrite */
    replace(plan: SalesPlan, meta?: { source?: PlanSource; note?: string | null }) {
      setGenerated((g) => ({
        plan,
        source: meta ? (meta.source ?? null) : (g?.source ?? null),
        note: meta ? (meta.note ?? null) : (g?.note ?? null),
      }));
    },
    /** setup changed: drop the local copy and reload the stored plan */
    reset() {
      setGenerated(null);
      setGenerateError(null);
      query.reload();
    },
  };
}

export type SalesPlanState = ReturnType<typeof useSalesPlan>;
