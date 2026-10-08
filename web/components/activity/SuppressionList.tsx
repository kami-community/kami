"use client";

import { useState } from "react";
import FilterTable from "@/components/bui/FilterTable";
import ConfirmDialog from "@/components/ConfirmDialog";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import Field, { Input } from "@/components/ui/Field";
import { IconBan, IconPlus } from "@/components/ui/icons";
import { humanize } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import Toggle from "@/components/ui/Toggle";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { Suppression } from "@/lib/outbound/suppressions";

/** Do-not-contact list: checked before every send, post and DM. */
export default function SuppressionList({ sessionId }: { sessionId: string }) {
  const { data, error, loading, reload } = useApi<{ suppressions: Suppression[] }>(
    withQuery("/api/suppressions", { session_id: sessionId }),
  );
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [global, setGlobal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Suppression | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post("/api/suppressions", { session_id: sessionId, identifier, reason, global });
      setIdentifier("");
      setReason("");
      reload();
    } catch (err) {
      setFormError(errorMessage(err, "Could not add"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await api.del(withQuery("/api/suppressions", { session_id: sessionId, id }));
      reload();
    } catch (err) {
      setFormError(errorMessage(err, "Could not remove"));
    } finally {
      setRemoving(null);
      setPendingRemove(null);
    }
  }

  const rows = data?.suppressions ?? [];

  return (
    <div className="stack">
      <Card>
        <form onSubmit={add}>
          <CardBody roomy className="form-stack">
            <div className="field-grid">
              <Field label="Email, domain or @handle">
                <Input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="jane@acme.com"
                  required
                />
              </Field>
              <Field label="Reason">
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Asked not to be contacted"
                  required
                />
              </Field>
            </div>
            <div className="row row--between row--wrap">
              <Toggle checked={global} onChange={setGlobal} label="Apply to all campaigns" />
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                icon={<IconPlus size={13} />}
                busy={saving}
                disabled={!identifier || !reason}
              >
                Add to list
              </Button>
            </div>
            {formError && (
              <p className="field__error" role="alert">
                {formError}
              </p>
            )}
          </CardBody>
        </form>
      </Card>

      {error && (
        <Callout
          tone="error"
          title="Could not load the do-not-contact list"
          actions={
            <Button size="sm" variant="secondary" onClick={reload}>
              Retry
            </Button>
          }
        >
          {error}
        </Callout>
      )}
      {loading && !data ? (
        <Skeleton lines={4} />
      ) : (
        <FilterTable
          label="Suppression list"
          rows={rows}
          rowKey={(s) => s.id}
          rowFilter={(s) => (s.session_id ? "campaign" : "global")}
          filters={[
            { key: "campaign", label: "This campaign" },
            { key: "global", label: "All campaigns" },
          ]}
          minWidth={600}
          empty={
            <span className="row suppressions__empty">
              <IconBan size={13} /> Nobody is on the list yet. Unsubscribes and bounces are added
              automatically.
            </span>
          }
          columns={[
            {
              key: "id",
              label: "Identifier",
              width: "minmax(0,1.2fr)",
              render: (s) => <span className="mono truncate">{s.identifier}</span>,
            },
            {
              key: "reason",
              label: "Reason",
              width: "minmax(0,1.4fr)",
              render: (s) => <span className="truncate">{s.reason}</span>,
            },
            {
              key: "channel",
              label: "Channel",
              width: "minmax(0,0.7fr)",
              muted: true,
              render: (s) => (s.channel ? humanize(s.channel) : "All"),
            },
            {
              key: "source",
              label: "Source",
              width: "minmax(0,0.6fr)",
              muted: true,
              render: (s) => humanize(s.source),
            },
            {
              key: "remove",
              label: "",
              width: "minmax(0,0.5fr)",
              render: (s) => (
                <Button
                  size="xs"
                  variant="quiet"
                  busy={removing === s.id}
                  onClick={() => setPendingRemove(s)}
                >
                  Remove
                </Button>
              ),
            },
          ]}
        />
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Allow Kami to contact ${pendingRemove?.identifier ?? ""} again?`}
        body={
          pendingRemove && (
            <p>
              Removing them from the list means future emails, posts and DMs can reach them. They
              were added because: <strong>{pendingRemove.reason}</strong>
            </p>
          )
        }
        confirmLabel="Remove from list"
        tone="danger"
        busy={pendingRemove !== null && removing === pendingRemove.id}
        onConfirm={() => pendingRemove && void remove(pendingRemove.id)}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
