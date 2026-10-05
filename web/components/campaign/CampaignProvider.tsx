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
import type { CampaignSession, CampaignView } from "@/lib/campaigns/sessions";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import type { Dossier } from "@/lib/domain/dossier";
import type { MarketingConfig } from "@/lib/marketingTypes";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

/**
 * Client state for one campaign: the session, its dossier, Sales and Marketing
 * setup, and the kill switch. Server state is the source of truth; every
 * mutation goes through the API and updates this store from the response.
 */

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
  const sessionId = session.id;

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
  }, [sessionId]);

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
      generateDossier,
      setDossier,
      confirmDossier,
      setPaused,
      setSalesConfig,
      setMarketingConfig,
    }),
    [
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
