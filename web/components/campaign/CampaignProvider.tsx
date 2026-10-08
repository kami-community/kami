"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KamiCapabilities } from "@/lib/capabilities";
import type { CampaignProgress } from "@/lib/campaigns/progress";
import type { CampaignSession, CampaignView } from "@/lib/campaigns/sessions";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import type { Dossier } from "@/lib/domain/dossier";
import type { MarketingConfig } from "@/lib/marketingTypes";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

/**
 * Client state for one campaign: the session, its dossier, Sales and Marketing
 * setup, the kill switch, server-derived progress and install capabilities.
 * Server state is the source of truth; every mutation goes through the API and
 * updates this store from the response. Progress is refetched after mutations
 * (`refreshProgress`) and polled while the tab is visible.
 */

const PROGRESS_POLL_MS = 20_000;

interface DossierJob {
  busy: boolean;
  error: string | null;
}

interface CampaignContextValue {
  session: CampaignSession;
  sessionId: string;
  dossier: Dossier | null;
  dossierJob: DossierJob;
  salesConfig: SalesCampaignConfig | null;
  marketingConfig: MarketingConfig | null;
  /** Loading Sales/Marketing setup failed (shown by the dashboard). */
  setupError: string | null;
  /** Where the campaign stands (null until first load). */
  progress: CampaignProgress | null;
  progressError: string | null;
  refreshProgress: () => void;
  /** What this install can do (null until loaded or if the probe failed). */
  caps: KamiCapabilities | null;
  generateDossier: () => Promise<void>;
  setDossier: (dossier: Dossier) => void;
  confirmDossier: () => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  setSalesConfig: (config: SalesCampaignConfig) => void;
  setMarketingConfig: (config: MarketingConfig) => void;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function useCampaign(): CampaignContextValue {
  const value = useContext(CampaignContext);
  if (!value) throw new Error("useCampaign must be used inside <CampaignProvider>");
  return value;
}

export function CampaignProvider({
  initial,
  children,
}: {
  initial: CampaignView;
  children: React.ReactNode;
}) {
  const [session, setSession] = useState(initial.session);
  const [dossier, setDossierState] = useState<Dossier | null>(initial.dossier);
  const [dossierJob, setDossierJob] = useState<DossierJob>({ busy: false, error: null });
  const [salesConfig, setSalesConfig] = useState<SalesCampaignConfig | null>(null);
  const [marketingConfig, setMarketingConfig] = useState<MarketingConfig | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [progress, setProgress] = useState<CampaignProgress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const [caps, setCaps] = useState<KamiCapabilities | null>(null);
  const sessionId = session.id;

  const refreshProgress = useCallback(() => setProgressVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CampaignProgress>(`/api/sessions/${sessionId}/progress`)
      .then((p) => {
        if (cancelled) return;
        setProgress(p);
        setProgressError(null);
      })
      .catch((err) => {
        if (!cancelled) setProgressError(errorMessage(err, "Could not load campaign progress"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, progressVersion]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refreshProgress();
    };
    const id = window.setInterval(tick, PROGRESS_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refreshProgress]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<KamiCapabilities>("/api/capabilities")
      .then((c) => {
        if (!cancelled) setCaps(c);
      })
      .catch(() => {
        /* the capability probe is advisory: the UI works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.get<{ config: SalesCampaignConfig | null }>(
        withQuery("/api/sales/setup", { session_id: sessionId }),
      ),
      api.get<{ config: MarketingConfig | null }>(
        withQuery("/api/marketing/setup", { session_id: sessionId }),
      ),
    ])
      .then(([sales, marketing]) => {
        if (cancelled) return;
        setSalesConfig(sales.config);
        setMarketingConfig(marketing.config);
      })
      .catch((err) => {
        if (!cancelled) setSetupError(errorMessage(err, "Could not load campaign setup"));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const generateDossier = useCallback(async () => {
    setDossierJob({ busy: true, error: null });
    try {
      const { dossier: fresh } = await api.post<{ dossier: Dossier }>(
        `/api/sessions/${sessionId}/dossier`,
      );
      setDossierState(fresh);
      setSession((s) => ({ ...s, dossier_confirmed_at: null }));
      setDossierJob({ busy: false, error: null });
    } catch (err) {
      setDossierJob({ busy: false, error: errorMessage(err, "Could not build the dossier") });
    }
  }, [sessionId]);

  // A brand-new campaign has research but no dossier yet: build it once.
  const started = useRef(false);
  useEffect(() => {
    if (!initial.dossier && !started.current) {
      started.current = true;
      void generateDossier();
    }
  }, [initial.dossier, generateDossier]);

  const confirmDossier = useCallback(async () => {
    const { dossier_confirmed_at } = await api.post<{ dossier_confirmed_at: string }>(
      `/api/sessions/${sessionId}/dossier/confirm`,
    );
    setSession((s) => ({ ...s, dossier_confirmed_at }));
    refreshProgress();
  }, [sessionId, refreshProgress]);

  const setPaused = useCallback(
    async (paused: boolean) => {
      const previous = session.paused;
      setSession((s) => ({ ...s, paused }));
      try {
        const res = await api.put<{ paused: boolean }>(`/api/sessions/${sessionId}/pause`, {
          paused,
        });
        setSession((s) => ({ ...s, paused: res.paused }));
      } catch (err) {
        setSession((s) => ({ ...s, paused: previous }));
        throw err;
      }
    },
    [session.paused, sessionId],
  );

  const setDossier = useCallback((next: Dossier) => {
    setDossierState(next);
    setSession((s) => ({ ...s, dossier_confirmed_at: null }));
  }, []);

  const value = useMemo<CampaignContextValue>(
    () => ({
      session,
      sessionId,
      dossier,
      dossierJob,
      salesConfig,
      marketingConfig,
      setupError,
      progress,
      progressError,
      refreshProgress,
      caps,
      generateDossier,
      setDossier,
      confirmDossier,
      setPaused,
      setSalesConfig,
      setMarketingConfig,
    }),
    [
      progress,
      progressError,
      refreshProgress,
      caps,
      session,
      sessionId,
      dossier,
      dossierJob,
      salesConfig,
      marketingConfig,
      setupError,
      generateDossier,
      setDossier,
      confirmDossier,
      setPaused,
    ],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}
