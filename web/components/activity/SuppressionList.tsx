"use client";

import { useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import Skeleton from "@/components/ui/Skeleton";
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
    try {
      await api.del(withQuery("/api/suppressions", { session_id: sessionId, id }));
      reload();
    } catch (err) {
      setFormError(errorMessage(err, "Could not remove"));
    }
  }

  const rows = data?.suppressions ?? [];

  return (
    <section>
      <p className="label-caps">Suppression list</p>
      <p className="muted">Kami never contacts anyone on this list, on any channel you choose.</p>

      <form className="inline-form" onSubmit={add}>
        <div className="form-line">
          <label className="mono label-caps" htmlFor="suppress-identifier">
            Email, domain or @handle
          </label>
          <input
            id="suppress-identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="jane@acme.com"
            required
          />
        </div>
        <div className="form-line">
          <label className="mono label-caps" htmlFor="suppress-reason">
            Reason
          </label>
          <input
            id="suppress-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="asked not to be contacted"
            required
          />
        </div>
        <label className="mono checkbox">
          <input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />{" "}
          all campaigns
        </label>
        <button type="submit" className="btn-secondary" disabled={saving || !identifier || !reason}>
          {saving ? "Adding…" : "Add"}
        </button>
      </form>
      {formError && (
        <p role="alert" className="mono form-error">
          {formError}
        </p>
      )}

      {loading && <Skeleton lines={3} />}
      {error && (
        <p role="alert" className="mono form-error">
          {error}
        </p>
      )}
      <ul className="row-list">
        {rows.map((s) => (
          <li key={s.id} className="row row--flat">
            <span className="row__title mono">{s.identifier}</span>
            <span className="muted">{s.reason}</span>
            <span className="mono muted">
              {s.channel ?? "all channels"} · {s.session_id ? "this campaign" : "all campaigns"} ·{" "}
              {s.source}
            </span>
            <button type="button" className="mono link-button" onClick={() => remove(s.id)}>
              remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
