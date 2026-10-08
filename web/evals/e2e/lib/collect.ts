import type { ApiClient } from "./apiClient";
import type { CollectedEvidence } from "./types";

/** Pull session-linked product + observability evidence after a fixture run. */
export async function collectEvidence(
  api: ApiClient,
  sessionId: string,
): Promise<CollectedEvidence> {
  const warnings: string[] = [];
  const evidence: CollectedEvidence = {
    session: null,
    brand: null,
    dossier: null,
    runLogs: [],
    salesConfig: null,
    segments: null,
    plan: null,
    accounts: [],
    drafts: [],
    distributionConfig: null,
    opportunities: [],
    warnings,
  };

  try {
    const { data } = await api.get<{
      session?: Record<string, unknown>;
      dossier?: Record<string, unknown> | null;
    }>(`/api/sessions/${sessionId}`);
    evidence.session = data.session ?? null;
    evidence.dossier = data.dossier ?? null;
  } catch (e) {
    warnings.push(`session_load: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ runs?: Array<Record<string, unknown>> }>(
      `/api/activity/runs?session_id=${encodeURIComponent(sessionId)}&limit=100`,
    );
    evidence.runLogs = data.runs ?? [];
  } catch (e) {
    warnings.push(`run_logs: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ config?: Record<string, unknown> | null }>(
      `/api/sales/setup?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.salesConfig = data.config ?? null;
  } catch (e) {
    warnings.push(`sales_setup: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{
      segments?: unknown[];
      confirmed_at?: string | null;
    }>(`/api/sales/segments?session_id=${encodeURIComponent(sessionId)}`);
    evidence.segments = data.segments ?? null;
  } catch (e) {
    // Expected when no sales campaign
    const msg = e instanceof Error ? e.message : String(e);
    if (!/no sales campaign/i.test(msg)) warnings.push(`segments: ${msg}`);
  }

  try {
    const { data } = await api.get<{ plan?: Record<string, unknown> | null }>(
      `/api/sales/plan?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.plan = data.plan ?? null;
  } catch (e) {
    warnings.push(`plan: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ accounts?: unknown[] }>(
      `/api/sales/accounts?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.accounts = data.accounts ?? [];
  } catch (e) {
    warnings.push(`accounts: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ drafts?: unknown[] }>(
      `/api/sales/drafts?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.drafts = data.drafts ?? [];
  } catch (e) {
    warnings.push(`drafts: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ config?: Record<string, unknown> | null }>(
      `/api/marketing/distribution/setup?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.distributionConfig = data.config ?? null;
  } catch (e) {
    warnings.push(`dist_setup: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const { data } = await api.get<{ opportunities?: unknown[] }>(
      `/api/marketing/distribution/opportunities?session_id=${encodeURIComponent(sessionId)}`,
    );
    evidence.opportunities = data.opportunities ?? [];
  } catch (e) {
    warnings.push(`opportunities: ${e instanceof Error ? e.message : String(e)}`);
  }

  return evidence;
}
