"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import CommandPalette, { type Command } from "@/components/bui/CommandPalette";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import ConfirmDialog from "@/components/ConfirmDialog";
import KamiGuide from "@/components/KamiGuide";
import AppSidebar, { type SidebarItem } from "@/components/shell/AppSidebar";
import {
  AgentActivityIndicator,
  AgentActivityProvider,
  useAgentActivity,
} from "@/components/shell/AgentActivity";
import { WorkspaceContext, type WorkspaceContextValue } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import { setTheme } from "@/components/ui/ThemeToggle";
import {
  IconActivity,
  IconChat,
  IconChevronRight,
  IconHome,
  IconInbox,
  IconMegaphone,
  IconMoon,
  IconPause,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTarget,
  IconUsers,
} from "@/components/ui/icons";
import { Kbd } from "@/components/ui/Pills";
import Toast from "@/components/ui/Toast";
import { api, errorMessage } from "@/lib/client/api";
import { forgetCampaign } from "@/lib/client/lastCampaign";
import {
  ACTIVITY_TABS,
  AREA_LABELS,
  DISTRIBUTION_TABS,
  parseViewPath,
  SALES_TABS,
  SETTINGS_TABS,
  tabLabel,
  TEAM_TABS,
  viewHref,
  type View,
} from "@/lib/client/routes";
import type { CampaignSummary } from "@/lib/campaigns/sessions";

/**
 * The campaign workspace frame: sidebar on the left, top bar with breadcrumbs,
 * agent activity, search and Ask Kami, the routed page in the middle, and Kami
 * Guide as a right-hand panel the founder opens on demand. The view comes from
 * the URL (`/c/<id>/<area>/<tab>`), so Back/Forward and links behave normally.
 */

const GUIDE_KEY = "kami_guide_open";

function readGuideOpen(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Read and clear the result of an OAuth connect redirect (?connected= / ?connect_error=). */
function takeConnectNotice(): { ok: boolean; text: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const connected = params.get("connected");
  const failed = params.get("connect_error");
  if (!connected && !failed) return null;
  const handle = params.get("handle") ?? "";
  const reason = params.get("reason") ?? "unknown error";
  window.history.replaceState(window.history.state, "", window.location.pathname);
  const label = (p: string | null) => (p === "instagram" ? "Instagram" : "X");
  return connected
    ? { ok: true, text: `Connected ${label(connected)} ${handle}`.trim() }
    : { ok: false, text: `Could not connect ${label(failed)}: ${reason}` };
}

export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const campaign = useCampaign();
  return (
    <AgentActivityProvider sessionId={campaign.sessionId}>
      <Shell>{children}</Shell>
    </AgentActivityProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const campaign = useCampaign();
  const { session, progress, caps, sessionId } = campaign;
  const router = useRouter();
  const pathname = usePathname();
  const view = useMemo(
    () => parseViewPath(pathname.split("/").slice(3).filter(Boolean)),
    [pathname],
  );
  const activity = useAgentActivity();

  const [guideOpen, setGuideOpenState] = useState(readGuideOpen);
  const [guidePrompt, setGuidePrompt] = useState<{ text: string; n: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [pauseSaving, setPauseSaving] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [notice, setNotice] = useState(takeConnectNotice);

  const setGuideOpen = useCallback((open: boolean) => {
    setGuideOpenState(open);
    try {
      localStorage.setItem(GUIDE_KEY, open ? "1" : "0");
    } catch {
      /* storage blocked: the choice lasts for this page */
    }
  }, []);

  const href = useCallback((v: View) => viewHref(sessionId, v), [sessionId]);
  const navigate = useCallback(
    (v: View) => router.push(viewHref(sessionId, v)),
    [router, sessionId],
  );
  const askGuide = useCallback(
    (text: string) => {
      setGuideOpen(true);
      setGuidePrompt((p) => ({ text, n: (p?.n ?? 0) + 1 }));
    },
    [setGuideOpen],
  );

  /* ⌘K / Ctrl-K opens search; "/" opens Ask Kami (not while typing). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("dialog[open]")) return;
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);
      if (typing) return;
      e.preventDefault();
      setGuideOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setGuideOpen]);

  const togglePause = useCallback(async () => {
    setPauseSaving(true);
    setPauseError(null);
    try {
      await campaign.setPaused(!session.paused);
      campaign.refreshProgress();
    } catch (err) {
      setPauseError(errorMessage(err, "Could not change the kill switch"));
    } finally {
      setPauseSaving(false);
    }
  }, [campaign, session.paused]);

  const loadCampaigns = useCallback(() => {
    api
      .get<{ campaigns: CampaignSummary[] }>("/api/sessions")
      .then((r) => setCampaigns(r.campaigns))
      .catch((err) => {
        setCampaigns([]);
        setNotice({ ok: false, text: errorMessage(err, "Could not load your campaigns") });
      });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.del("/api/auth/login");
    } finally {
      window.location.assign("/login");
    }
  }, []);

  const newCampaign = useCallback(() => {
    forgetCampaign();
    router.push("/start");
  }, [router]);

  /* ── navigation model ─────────────────────────────── */

  const s = progress?.sales;
  const inboxCount =
    (s?.needsYou.total ?? 0) +
    (s?.drafts.pending ?? 0) +
    (progress?.marketing.opportunities.needsReview ?? 0);

  const item = (key: View["area"], icon: ReactNode, extra?: Partial<SidebarItem>): SidebarItem => {
    const target: View =
      key === "home" || key === "inbox"
        ? { area: key }
        : ({ area: key, tab: defaultTab(key) } as View);
    return {
      key,
      label: AREA_LABELS[key],
      icon,
      href: href(target),
      active: view.area === key,
      ...extra,
    };
  };

  const primary: SidebarItem[] = [
    item("home", <IconHome size={17} />),
    item("inbox", <IconInbox size={17} />, { count: inboxCount || undefined }),
    item("sales", <IconTarget size={17} />),
    item("distribution", <IconMegaphone size={17} />),
    item("team", <IconUsers size={17} />, { live: activity.running > 0 }),
  ];
  const secondary: SidebarItem[] = [
    item("activity", <IconActivity size={17} />),
    item("settings", <IconSettings size={17} />),
  ];

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [];
    const go = (v: View, label: string, icon: ReactNode): Command => ({
      id: viewHref("", v),
      label,
      group: "Go to",
      icon,
      run: () => navigate(v),
    });
    list.push(go({ area: "home" }, "Home", <IconHome size={14} />));
    list.push(go({ area: "inbox" }, "Inbox", <IconInbox size={14} />));
    for (const t of SALES_TABS)
      list.push(
        go({ area: "sales", tab: t.key }, `Find customers · ${t.label}`, <IconTarget size={14} />),
      );
    for (const t of DISTRIBUTION_TABS)
      list.push(
        go(
          { area: "distribution", tab: t.key },
          `Distribution · ${t.label}`,
          <IconMegaphone size={14} />,
        ),
      );
    for (const t of TEAM_TABS)
      list.push(go({ area: "team", tab: t.key }, `Team · ${t.label}`, <IconUsers size={14} />));
    for (const t of ACTIVITY_TABS)
      list.push(
        go({ area: "activity", tab: t.key }, `Activity · ${t.label}`, <IconActivity size={14} />),
      );
    for (const t of SETTINGS_TABS)
      list.push(
        go({ area: "settings", tab: t.key }, `Settings · ${t.label}`, <IconSettings size={14} />),
      );
    list.push(
      {
        id: "ask-next",
        label: "Ask Kami: what should I do next?",
        group: "Kami Guide",
        icon: <IconChat size={14} />,
        run: () => askGuide("What should I do next?"),
      },
      {
        id: "toggle-guide",
        label: guideOpen ? "Hide Kami Guide" : "Show Kami Guide",
        group: "Kami Guide",
        icon: <IconChat size={14} />,
        run: () => setGuideOpen(!guideOpen),
      },
      {
        id: "pause",
        label: session.paused ? "Resume all sends" : "Pause all sends",
        group: "Campaign",
        icon: <IconPause size={14} />,
        keywords: "kill switch stop",
        run: () => void togglePause(),
      },
      {
        id: "new",
        label: "New campaign",
        group: "Campaign",
        icon: <IconPlus size={14} />,
        run: () => setConfirmingNew(true),
      },
      {
        id: "theme",
        label: "Toggle dark mode",
        group: "Appearance",
        icon: <IconMoon size={14} />,
        keywords: "theme light dark",
        run: () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"),
      },
    );
    return list;
  }, [askGuide, guideOpen, navigate, session.paused, setGuideOpen, togglePause]);

  const workspace: WorkspaceContextValue = useMemo(
    () => ({ view, href, navigate, askGuide }),
    [view, href, navigate, askGuide],
  );

  const name = session.domain_check?.company_name ?? session.canonical_domain;
  const crumbs: { label: string; view?: View }[] = [
    {
      label: AREA_LABELS[view.area],
      view: "tab" in view ? ({ area: view.area, tab: defaultTab(view.area) } as View) : undefined,
    },
  ];
  const tab = tabLabel(view);
  if (tab) crumbs.push({ label: tab });

  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="app">
        <AppSidebar
          campaignId={sessionId}
          name={name}
          campaigns={campaigns}
          onOpenSwitcher={loadCampaigns}
          primary={primary}
          secondary={secondary}
          paused={session.paused}
          pauseBusy={pauseSaving}
          authRequired={Boolean(caps?.authRequired)}
          onNavigate={(h) => router.push(h)}
          onSwitch={(id) => router.push(`/c/${id}`)}
          onNewCampaign={() => setConfirmingNew(true)}
          onSignOut={() => void signOut()}
          onTogglePause={() => void togglePause()}
        />

        <main className="app__main">
          <header className="app__topbar">
            <nav className="app__crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <span key={c.label} className="app__crumb-slot">
                    {i > 0 && <IconChevronRight size={12} className="app__crumb-sep" />}
                    {!last && c.view ? (
                      <a
                        className="app__crumb app__crumb--link"
                        href={href(c.view)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(c.view!);
                        }}
                      >
                        {c.label}
                      </a>
                    ) : (
                      <span
                        className={`app__crumb${last ? " app__crumb--current" : ""}`}
                        aria-current={last ? "page" : undefined}
                      >
                        {c.label}
                      </span>
                    )}
                  </span>
                );
              })}
            </nav>
            <div className="app__actions">
              <AgentActivityIndicator />
              <Button
                variant="quiet"
                size="xs"
                onClick={() => setPaletteOpen(true)}
                icon={<IconSearch size={13} />}
              >
                Search <Kbd>⌘K</Kbd>
              </Button>
              <Button
                variant={guideOpen ? "secondary" : "quiet"}
                size="xs"
                aria-pressed={guideOpen}
                onClick={() => setGuideOpen(!guideOpen)}
                icon={<IconChat size={13} />}
              >
                Ask Kami <Kbd>/</Kbd>
              </Button>
            </div>
          </header>

          {session.paused && (
            <div className="app__banner" role="status">
              <IconPause size={13} />
              Kami is paused for this campaign — nothing will be sent or posted until you resume.
              <Button
                size="xs"
                variant="secondary"
                onClick={() => void togglePause()}
                busy={pauseSaving}
              >
                Resume
              </Button>
            </div>
          )}
          {pauseError && (
            <div className="app__banner" role="alert">
              {pauseError}
            </div>
          )}
          {caps && !caps.hermesReachable && (
            <div className="app__banner app__banner--info" role="status">
              {caps.notes[0] ??
                "Hermes is not reachable — agent steps will fail until it is running."}
            </div>
          )}

          <div className="app__content">{children}</div>
        </main>

        {guideOpen && (
          <KamiGuide view={view} prompt={guidePrompt} onClose={() => setGuideOpen(false)} />
        )}

        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={commands}
        />

        <ConfirmDialog
          open={confirmingNew}
          title="Start a new campaign?"
          body="This campaign stays saved — switch back to it any time from the campaign menu."
          confirmLabel="Start new campaign"
          onConfirm={() => {
            setConfirmingNew(false);
            newCampaign();
          }}
          onCancel={() => setConfirmingNew(false)}
        />

        {notice && (
          <Toast tone={notice.ok ? "success" : "error"} onClose={() => setNotice(null)}>
            {notice.text}
          </Toast>
        )}
      </div>
    </WorkspaceContext.Provider>
  );
}

function defaultTab(area: View["area"]): string {
  switch (area) {
    case "sales":
      return SALES_TABS[0].key;
    case "distribution":
      return DISTRIBUTION_TABS[0].key;
    case "team":
      return TEAM_TABS[0].key;
    case "activity":
      return ACTIVITY_TABS[0].key;
    case "settings":
      return SETTINGS_TABS[0].key;
    default:
      return "";
  }
}
