"use client";

import { useCallback, useEffect, useState } from "react";
import Landing, { type LaunchParams } from "@/components/Landing";
import Dashboard from "@/components/Dashboard";
import { CampaignProvider } from "@/components/campaign/CampaignProvider";
import type { CampaignSession, CampaignView } from "@/lib/campaigns/sessions";
import { api, ApiError, errorMessage } from "@/lib/client/api";

const STORAGE_KEY = "kami_session";

function readSavedSessionId(): string | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? ((JSON.parse(saved) as { dbId?: string }).dbId ?? null) : null;
  } catch {
    return null;
  }
}

function saveSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, JSON.stringify({ dbId: id }));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode: the campaign still works for this tab */
  }
}

/** Read and clear the result of an OAuth connect redirect (?connected= / ?connect_error=). */
function takeConnectNotice(): string | null {
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("connected");
  const failed = params.get("connect_error");
  if (!connected && !failed) return null;
  window.history.replaceState({}, "", "/");
  const label = (p: string | null) => (p === "instagram" ? "Instagram" : "X");
  return connected
    ? `Connected ${label(connected)} ${params.get("handle") ?? ""}`.trim()
    : `Could not connect ${label(failed)}: ${params.get("reason") ?? "unknown error"}`;
}

export default function Home() {
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [resume, setResume] = useState<CampaignView | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = readSavedSessionId();
    const connectNotice = takeConnectNotice();
    if (!id) return;
    api
      .get<CampaignView>(`/api/sessions/${id}`)
      .then((view) => {
        if (connectNotice) {
          // Returning from an OAuth connect: reopen the campaign straight away.
          setNotice(connectNotice);
          setCampaign(view);
        } else {
          setResume(view);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) saveSessionId(null);
      });
  }, []);

  const launch = useCallback(async (params: LaunchParams) => {
    setLaunching(true);
    setLaunchError(null);
    try {
      const { session } = await api.post<{ session: CampaignSession }>("/api/sessions", params);
      saveSessionId(session.id);
      setResume(null);
      setCampaign({ session, dossier: null });
    } catch (err) {
      setLaunchError(errorMessage(err, "Could not start the campaign"));
    } finally {
      setLaunching(false);
    }
  }, []);

  const newCampaign = useCallback(() => {
    saveSessionId(null);
    setCampaign(null);
    setResume(null);
    setNotice(null);
    setLaunchError(null);
  }, []);

  if (!campaign) {
    return (
      <main className="container">
        <Landing
          onLaunch={launch}
          busy={launching}
          error={launchError}
          resumeDomain={resume?.session.canonical_domain ?? null}
          onResume={() => resume && setCampaign(resume)}
          onDismissResume={() => {
            saveSessionId(null);
            setResume(null);
          }}
        />
      </main>
    );
  }

  return (
    <main className="container-wide">
      {notice && (
        <button type="button" className="mono notice" onClick={() => setNotice(null)}>
          {notice} <span aria-hidden>×</span>
        </button>
      )}
      <CampaignProvider key={campaign.session.id} initial={campaign}>
        <Dashboard onNewCampaign={newCampaign} />
      </CampaignProvider>
    </main>
  );
}
