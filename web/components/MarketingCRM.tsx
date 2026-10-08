"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useConnections } from "@/components/ConnectSocials";
import ConversationsPanel from "@/components/ConversationsPanel";
import LoadingState from "@/components/bui/LoadingState";
import RecordsTable, { Strength, type RecordColumn } from "@/components/bui/RecordsTable";
import MarketingSetup from "@/components/MarketingSetup";
import { PlatformMark } from "@/components/marketing/platforms";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import { IconArrowLeft, IconSearch, IconSend, IconSettings } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { humanize, StatusPill, statusTone } from "@/components/ui/Pills";
import Segmented from "@/components/ui/Segmented";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { Conversation, MarketingConfig, MarketingCrmEntry } from "@/lib/marketingTypes";

type Tab = "x" | "creators" | "conversations";

interface DiscoverResponse {
  message: string;
  warnings: string[];
}

const pctColor = (v: number) =>
  v >= 0.66 ? "var(--green)" : v >= 0.4 ? "var(--orange)" : "var(--red)";

/** Advanced creator CRM: X leads, Instagram creators, DM conversations. */
export default function MarketingCRM({
  sessionId,
  config,
  dossierTone,
  onSetup,
}: {
  sessionId: string;
  config: MarketingConfig | null;
  dossierTone?: string[];
  onSetup: (config: MarketingConfig) => void;
}) {
  const [editingSettings, setEditingSettings] = useState(false);
  const crm = useApi<{ entries: MarketingCrmEntry[] }>(
    withQuery("/api/marketing/crm", { session_id: sessionId }),
  );
  const conversations = useApi<{ conversations: Conversation[] }>(
    withQuery("/api/marketing/conversations", { session_id: sessionId }),
  );
  const hasX = Boolean(config?.platforms.includes("x"));
  const hasIg = Boolean(config?.platforms.includes("instagram"));
  const [tab, setTab] = useState<Tab>(hasX ? "x" : "creators");
  const [busy, setBusy] = useState<"discover" | "outreach" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDm, setPendingDm] = useState<{
    entries: MarketingCrmEntry[];
    platform: "X" | "Instagram";
    approveFirst: boolean;
  } | null>(null);
  const { handleOf } = useConnections(sessionId);
  const paused = Boolean(config?.autonomous_paused);

  if (!config || editingSettings) {
    return (
      <>
        {config && (
          <Button
            size="xs"
            variant="quiet"
            icon={<IconArrowLeft size={13} />}
            onClick={() => setEditingSettings(false)}
          >
            Back to CRM
          </Button>
        )}
        <MarketingSetup
          sessionDbId={sessionId}
          existingTone={dossierTone}
          onComplete={(c) => {
            onSetup(c);
            setEditingSettings(false);
          }}
        />
      </>
    );
  }

  const entries = crm.data?.entries ?? [];
  const leads = entries.filter((e) => e.type === "x_lead");
  const creators = entries.filter((e) => e.type === "creator");
  const rows = tab === "x" ? leads : creators;
  const identified = rows.filter((e) => e.status === "identified");
  const selectedIdentified = identified.filter((e) => selected.has(e.id));

  function refresh() {
    crm.reload();
    conversations.reload();
  }

  /** Approve each entry (X leads only) and send its first DM; stops at the first failure. */
  async function sendOutreach(ids: string[], platformLabel: string, approveFirst: boolean) {
    if (busy) return;
    setBusy("outreach");
    setMessage(null);
    setError(null);
    let sent = 0;
    try {
      for (const id of ids) {
        if (approveFirst)
          await api.post("/api/marketing/crm", { session_id: sessionId, id, status: "approved" });
        await api.post("/api/marketing/dm", { session_id: sessionId, crm_entry_id: id });
        sent++;
      }
      setMessage(
        `Sent ${sent} ${platformLabel} outreach DM${sent === 1 ? "" : "s"} from your connected account.`,
      );
      setSelected(new Set());
    } catch (err) {
      setError(
        `${errorMessage(err, "DM failed")}${sent ? ` (${sent} sent before the failure)` : ""}`,
      );
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function triggerDiscovery() {
    if (paused || busy) return;
    setBusy("discover");
    setMessage(null);
    setError(null);
    try {
      const res = await api.post<DiscoverResponse>("/api/marketing/discover", {
        session_id: sessionId,
      });
      setMessage(res.message + (res.warnings.length ? ` (${res.warnings[0]})` : ""));
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Discovery failed"));
    } finally {
      setBusy(null);
    }
  }

  const columns: RecordColumn<MarketingCrmEntry>[] = [
    {
      key: "status",
      label: "Status",
      width: 150,
      render: (e) => <StatusPill tone={statusTone(e.status)}>{humanize(e.status)}</StatusPill>,
      sort: (a, b) => a.status.localeCompare(b.status),
    },
    {
      key: "match",
      label: "Match",
      width: 110,
      render: (e) =>
        e.niche_match_score != null ? (
          <Strength color={pctColor(e.niche_match_score)}>
            {Math.round(e.niche_match_score * 100)}%
          </Strength>
        ) : (
          <span className="records-muted">—</span>
        ),
      sort: (a, b) => (a.niche_match_score ?? 0) - (b.niche_match_score ?? 0),
    },
    ...(tab === "creators"
      ? ([
          {
            key: "followers",
            label: "Followers",
            width: 120,
            render: (e) => (e.followers != null ? `${(e.followers / 1000).toFixed(1)}k` : "—"),
            sort: (a, b) => (a.followers ?? 0) - (b.followers ?? 0),
            footer: (all) =>
              `${(all.reduce((n, e) => n + (e.followers ?? 0), 0) / 1000).toFixed(0)}k reach`,
          },
          {
            key: "eng",
            label: "Engagement",
            width: 120,
            render: (e) =>
              e.engagement_rate != null ? `${(e.engagement_rate * 100).toFixed(1)}%` : "—",
            sort: (a, b) => (a.engagement_rate ?? 0) - (b.engagement_rate ?? 0),
          },
          {
            key: "offer",
            label: "Offer",
            width: 100,
            render: (e) => (e.offer_amount != null ? `$${e.offer_amount}` : "—"),
          },
        ] as RecordColumn<MarketingCrmEntry>[])
      : []),
    {
      key: "why",
      label: "Why",
      width: 340,
      render: (e) => (
        <span className="truncate" title={e.relevance_reasoning}>
          {e.relevance_reasoning ?? "—"}
        </span>
      ),
    },
  ];

  const platformLabel: "X" | "Instagram" = tab === "x" ? "X" : "Instagram";
  const sender = handleOf(tab === "x" ? "x" : "instagram");

  return (
    <>
      <Section
        num="01"
        title="Platforms"
        actions={
          <>
            <Button
              size="sm"
              variant="quiet"
              icon={<IconSettings size={13} />}
              onClick={() => setEditingSettings(true)}
            >
              Settings
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<IconSearch size={13} />}
              busy={busy === "discover"}
              disabled={paused || busy !== null}
              onClick={() => void triggerDiscovery()}
            >
              Run discovery
            </Button>
          </>
        }
      >
        <div className="grid-2">
          {hasX && (
            <Card>
              <CardBody className="platform-stat">
                <PlatformMark platform="x" size={28} />
                <span className="platform-stat__copy">
                  <span className="platform-stat__name">X</span>
                  <span className="text-3 text-xs">
                    {leads.length} leads ·{" "}
                    {
                      leads.filter(
                        (e) => e.status === "in_conversation" || e.status === "contacted",
                      ).length
                    }{" "}
                    active · ${config.x_boost_budget ?? 0}/mo
                  </span>
                </span>
              </CardBody>
            </Card>
          )}
          {hasIg && (
            <Card>
              <CardBody className="platform-stat">
                <PlatformMark platform="instagram" size={28} />
                <span className="platform-stat__copy">
                  <span className="platform-stat__name">Instagram</span>
                  <span className="text-3 text-xs">
                    {creators.length} creators · offer ${config.ig_offer_min ?? 0}–$
                    {config.ig_offer_max ?? 0}
                  </span>
                </span>
              </CardBody>
            </Card>
          )}
        </div>
        {busy === "discover" && (
          <div className="dist-note">
            <LoadingState
              label="Kami is searching for leads and creators that match your niche…"
              detail="This can take a minute. Nobody is contacted — you choose who gets a DM."
            />
          </div>
        )}
        <div className="stack stack--sm dist-note">
          {paused && <Callout tone="warn">Marketing is paused — resume to run discovery.</Callout>}
          {error && <Callout tone="error">{error}</Callout>}
          {message && <Callout tone="info">{message}</Callout>}
          {(crm.error ?? conversations.error) && (
            <Callout tone="error">{crm.error ?? conversations.error}</Callout>
          )}
        </div>
      </Section>

      <Section num="02" title="People">
        <div className="queue-bar">
          <Segmented<Tab>
            label="CRM view"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSelected(new Set());
            }}
            options={[
              ...(hasX ? [{ value: "x" as Tab, label: "X leads", count: leads.length }] : []),
              ...(hasIg
                ? [{ value: "creators" as Tab, label: "Creators", count: creators.length }]
                : []),
              {
                value: "conversations",
                label: "Conversations",
                count: conversations.data?.conversations.length ?? 0,
              },
            ]}
          />
          {tab !== "conversations" && identified.length > 0 && (
            <span className="row crm-actions">
              <Button
                size="sm"
                variant="quiet"
                onClick={() => setSelected(new Set(identified.map((e) => e.id)))}
              >
                Select {identified.length} awaiting
              </Button>
              <Button
                size="sm"
                variant="accent"
                icon={<IconSend size={13} />}
                busy={busy === "outreach"}
                disabled={paused || !selectedIdentified.length}
                onClick={() =>
                  setPendingDm({
                    entries: selectedIdentified,
                    platform: platformLabel,
                    approveFirst: tab === "x",
                  })
                }
              >
                Approve & DM {selectedIdentified.length || ""}…
              </Button>
            </span>
          )}
        </div>

        {tab === "conversations" ? (
          <ConversationsPanel
            conversations={conversations.data?.conversations ?? []}
            entries={entries}
            onRefresh={refresh}
          />
        ) : crm.loading && !crm.data ? (
          <Skeleton title lines={6} />
        ) : (
          <RecordsTable
            label={tab === "x" ? "X leads" : "Instagram creators"}
            rows={rows}
            rowId={(e) => e.id}
            anchor={{
              label: tab === "x" ? "Lead" : "Creator",
              width: 240,
              name: (e) => e.name ?? `@${e.handle}`,
              href: (e) =>
                e.platform === "x"
                  ? `https://x.com/${e.handle}`
                  : `https://instagram.com/${e.handle}`,
              sort: (a, b) => (a.name ?? a.handle).localeCompare(b.name ?? b.handle),
            }}
            columns={columns}
            selected={selected}
            onSelectedChange={setSelected}
            countLabel={tab === "x" ? "leads" : "creators"}
            empty="Nobody yet — run discovery to find matches."
          />
        )}
      </Section>

      <ConfirmDialog
        open={pendingDm !== null}
        title={`Send ${pendingDm?.entries.length ?? 0} ${pendingDm?.platform ?? ""} DM${pendingDm?.entries.length === 1 ? "" : "s"}?`}
        body={
          pendingDm && (
            <div className="stack stack--sm">
              <p>
                Kami writes a short first message for each person from your dossier and sends it
                {sender ? ` from ${sender}` : " from your connected account"}. Replies land in
                Conversations.
              </p>
              <ul className="bullet-list">
                {pendingDm.entries.map((e) => (
                  <li key={e.id}>{e.name ? `${e.name} (@${e.handle})` : `@${e.handle}`}</li>
                ))}
              </ul>
            </div>
          )
        }
        confirmLabel={`Send ${pendingDm?.entries.length ?? 0} DM${pendingDm?.entries.length === 1 ? "" : "s"}`}
        busy={busy === "outreach"}
        onConfirm={() => {
          if (!pendingDm) return;
          const { entries: chosen, platform, approveFirst } = pendingDm;
          void sendOutreach(
            chosen.map((e) => e.id),
            platform,
            approveFirst,
          ).finally(() => setPendingDm(null));
        }}
        onCancel={() => setPendingDm(null)}
      />
    </>
  );
}
