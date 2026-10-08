"use client";

import { useState } from "react";
import CodeBlock from "@/components/bui/CodeBlock";
import FilterTable, { FilterStatus } from "@/components/bui/FilterTable";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBar, CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { IconArrowUpRight, IconRefresh, IconSend } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { OutboundReceipt } from "@/lib/outbound/receipts";

const CHANNEL_LABEL: Record<OutboundReceipt["channel"], string> = {
  email: "Email",
  x_post: "X post",
  x_dm: "X DM",
  ig_dm: "Instagram DM",
};

const TONE: Record<OutboundReceipt["status"], "done" | "progress" | "failed"> = {
  sent: "done",
  sending: "progress",
  failed: "failed",
};

/** Every real send, post and DM, with proof (provider id or URL) and replies. */
export default function OutboundLog({ sessionId }: { sessionId: string }) {
  const { data, error, loading, reload } = useApi<{ receipts: OutboundReceipt[] }>(
    withQuery("/api/outbound", { session_id: sessionId }),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ tone: "success" | "warn"; text: string } | null>(
    null,
  );

  async function refresh() {
    setRefreshing(true);
    setRefreshNote(null);
    const results = await Promise.allSettled([
      api.post("/api/marketing/x/engagement", { session_id: sessionId }),
      api.post("/api/jobs/email-replies"),
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    setRefreshNote(
      failures.length
        ? { tone: "warn", text: failures.map((f) => errorMessage(f.reason)).join(" · ") }
        : { tone: "success", text: "Replies and engagement are up to date." },
    );
    setRefreshing(false);
    reload();
  }

  const receipts = data?.receipts ?? [];
  const selected = receipts.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="stack">
      {refreshNote && <Callout tone={refreshNote.tone}>{refreshNote.text}</Callout>}
      {error && (
        <Callout
          tone="error"
          title="Could not load the sent log"
          actions={
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          }
        >
          {error}
        </Callout>
      )}
      {loading && !data && <Skeleton title lines={5} />}
      {data && receipts.length === 0 && (
        <EmptyState title="Nothing sent yet" icon={<IconSend size={15} />}>
          When you approve an email, post or DM, it appears here with its proof: the provider’s
          message id or the live link.
        </EmptyState>
      )}
      {receipts.length > 0 && (
        <FilterTable
          label="Outbound ledger"
          rows={receipts}
          rowKey={(r) => r.id}
          rowFilter={(r) => r.status}
          filters={[
            { key: "sent", label: "Sent", dot: "var(--green)" },
            { key: "sending", label: "Sending", dot: "var(--orange)" },
            { key: "failed", label: "Failed", dot: "var(--red)" },
          ]}
          minWidth={720}
          onRowClick={(r) => setSelectedId((id) => (id === r.id ? null : r.id))}
          toolbar={
            <Button
              size="xs"
              variant="secondary"
              icon={<IconRefresh size={12} />}
              busy={refreshing}
              onClick={() => void refresh()}
            >
              Check replies & engagement
            </Button>
          }
          columns={[
            {
              key: "to",
              label: "To",
              width: "minmax(0,1.3fr)",
              render: (r) => (
                <span className="truncate">{r.recipient ?? r.sent_as ?? "Public post"}</span>
              ),
            },
            {
              key: "channel",
              label: "Channel",
              width: "minmax(0,0.7fr)",
              muted: true,
              render: (r) => CHANNEL_LABEL[r.channel],
            },
            {
              key: "status",
              label: "Status",
              width: "minmax(0,0.6fr)",
              render: (r) => <FilterStatus tone={TONE[r.status]}>{r.status}</FilterStatus>,
            },
            {
              key: "proof",
              label: "Proof",
              width: "minmax(0,1fr)",
              render: (r) =>
                r.url ? (
                  <a
                    className="records-link"
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Live link <IconArrowUpRight size={11} />
                  </a>
                ) : r.provider_message_id ? (
                  <span className="mono text-xs truncate" title={r.provider_message_id}>
                    {r.provider_message_id}
                  </span>
                ) : (
                  <span className="text-3">no provider id</span>
                ),
            },
            {
              key: "replies",
              label: "Replies",
              width: "minmax(0,0.5fr)",
              muted: true,
              render: (r) => r.replies.length || "—",
            },
            {
              key: "when",
              label: "When",
              width: "minmax(0,0.8fr)",
              muted: true,
              render: (r) =>
                new Date(r.sent_at ?? r.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
            },
          ]}
        />
      )}

      {selected && (
        <Card className="fade-up">
          <CardBar
            title={`${CHANNEL_LABEL[selected.channel]} · ${selected.recipient ?? selected.sent_as ?? "public post"}`}
          >
            <Button size="xs" variant="quiet" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </CardBar>
          <CardBody className="stack stack--sm">
            <dl className="kv">
              <dt>Provider</dt>
              <dd>{selected.provider}</dd>
              <dt>Provider id</dt>
              <dd className="mono">{selected.provider_message_id ?? "—"}</dd>
              {selected.provider_thread_id && (
                <>
                  <dt>Thread</dt>
                  <dd className="mono">{selected.provider_thread_id}</dd>
                </>
              )}
              {selected.metrics && (
                <>
                  <dt>Metrics</dt>
                  <dd>
                    {Object.entries(selected.metrics)
                      .map(([k, v]) => `${k.replace(/_count$/, "")} ${v}`)
                      .join(" · ")}
                  </dd>
                </>
              )}
            </dl>
            {selected.error && <Callout tone="error">{selected.error}</Callout>}
            <CodeBlock
              filename="content.txt"
              lines={selected.content.split("\n")}
              maxHeight={320}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
