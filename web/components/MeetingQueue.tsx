"use client";

import { useMemo, useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { MeetingContact } from "@/lib/sales/meetings";
import type { Meeting, MeetingStatus } from "@/lib/salesTypes";

const STATUS_ORDER: MeetingStatus[] = [
  "proposed",
  "scheduling",
  "scheduled",
  "invited",
  "accepted",
  "declined",
  "rescheduled",
  "held",
  "completed",
  "no_show",
  "cancelled",
];

const DURATIONS = [15, 30, 45, 60];

interface MeetingQueueProps {
  sessionDbId: string | null;
}

interface MeetingsResponse {
  meetings: Meeting[];
  contacts: MeetingContact[];
  calendar_configured: boolean;
}

/** The browser's IANA time zone (the slot is entered in local time). */
function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** `YYYY-MM-DDTHH:mm` for a datetime-local input, in local time. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSlot(iso: string | undefined, timeZone?: string): string {
  if (!iso) return "Slot TBD";
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
  try {
    return new Date(iso).toLocaleString(undefined, { ...opts, timeZone, timeZoneName: "short" });
  } catch {
    return new Date(iso).toLocaleString(undefined, opts);
  }
}

function contactLabel(c: MeetingContact): string {
  const who = c.name ? `${c.name} · ` : "";
  return `${who}${c.email}${c.title ? ` (${c.title})` : ""}`;
}

export default function MeetingQueue({ sessionDbId }: MeetingQueueProps) {
  const { data, error, loading, reload } = useApi<MeetingsResponse>(
    sessionDbId ? withQuery("/api/sales/meetings", { session_id: sessionDbId }) : null,
  );
  const timeZone = useMemo(() => browserTimeZone(), []);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [contactId, setContactId] = useState("");
  const [slot, setSlot] = useState("");
  const [duration, setDuration] = useState(30);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!sessionDbId) return null;

  const meetings = data?.meetings ?? [];
  const contacts = data?.contacts ?? [];
  const calendarReady = data?.calendar_configured ?? false;

  function openInvite(m: Meeting) {
    setInviteId(m.id ?? null);
    setFormError(null);
    // Prefer the meeting's contact, then contacts on the same account.
    const sameAccount = contacts.filter((c) => !m.account_id || c.account_id === m.account_id);
    setContactId(m.contact_id ?? sameAccount[0]?.id ?? "");
    setSlot("");
  }

  async function sendInvite(e: React.FormEvent, meeting: Meeting) {
    e.preventDefault();
    setFormError(null);
    const start = new Date(slot); // datetime-local is parsed as local time
    if (!slot || Number.isNaN(start.getTime())) {
      setFormError("Pick a date and time.");
      return;
    }
    if (start.getTime() <= Date.now()) {
      setFormError("Pick a time in the future.");
      return;
    }
    if (!contactId) {
      setFormError("Choose who to invite.");
      return;
    }
    setSending(true);
    try {
      await api.post("/api/sales/meetings", {
        action: "schedule",
        session_id: sessionDbId,
        meeting_id: meeting.id,
        contact_id: contactId,
        start: start.toISOString(),
        time_zone: timeZone,
        duration_minutes: duration,
      });
      setInviteId(null);
      reload();
    } catch (err) {
      setFormError(errorMessage(err, "Could not send the invite"));
      reload();
    } finally {
      setSending(false);
    }
  }

  const grouped = new Map<MeetingStatus, Meeting[]>();
  for (const m of meetings) grouped.set(m.status, [...(grouped.get(m.status) ?? []), m]);

  return (
    <section className="meeting-queue">
      {loading && <p className="muted">Loading meetings…</p>}
      {error && (
        <p role="alert" className="mono form-error">
          {error}
        </p>
      )}
      {data && !calendarReady && (
        <p className="capability-banner">
          <strong>Calendar invites are off.</strong> Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
          GOOGLE_REFRESH_TOKEN to send real invites.
        </p>
      )}

      {STATUS_ORDER.map((status) => {
        const list = grouped.get(status) ?? [];
        if (!list.length) return null;
        return (
          <div key={status} className="meeting-queue__group">
            <p className="label-caps">
              {status.replace(/_/g, " ")} ({list.length})
            </p>
            <ul className="row-list">
              {list.map((m) => {
                const options = contacts.filter(
                  (c) => !m.account_id || !c.account_id || c.account_id === m.account_id,
                );
                return (
                  <li key={m.id} className="row meeting-queue__item">
                    <div className="row--flat">
                      <span className="row__title">{m.title ?? "Meeting"}</span>
                      <span className="mono muted">{formatSlot(m.scheduled_at, m.time_zone)}</span>
                      {m.attendee_email && <span className="mono muted">{m.attendee_email}</span>}
                      {m.meeting_link && (
                        <a className="mono" href={m.meeting_link} target="_blank" rel="noreferrer">
                          video link
                        </a>
                      )}
                      {typeof m.provider_receipt?.html_link === "string" &&
                        m.provider_receipt.html_link && (
                          <a
                            className="mono"
                            href={m.provider_receipt.html_link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            calendar event
                          </a>
                        )}
                      {m.status === "proposed" && calendarReady && inviteId !== m.id && (
                        <button type="button" className="btn-outline" onClick={() => openInvite(m)}>
                          Invite…
                        </button>
                      )}
                    </div>
                    {m.last_error && m.status === "proposed" && (
                      <p className="mono form-error meeting-queue__note">
                        Last attempt failed: {m.last_error}
                      </p>
                    )}

                    {inviteId === m.id && (
                      <form className="meeting-queue__form" onSubmit={(e) => sendInvite(e, m)}>
                        {options.length === 0 ? (
                          <p className="muted">
                            No contact with an email on this account yet — find or add one first.
                          </p>
                        ) : (
                          <div className="form-line">
                            <label className="mono label-caps" htmlFor={`attendee-${m.id}`}>
                              Attendee
                            </label>
                            <select
                              id={`attendee-${m.id}`}
                              value={contactId}
                              onChange={(e) => setContactId(e.target.value)}
                              required
                            >
                              <option value="" disabled>
                                Choose a contact
                              </option>
                              {options.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {contactLabel(c)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <div className="form-line">
                          <label className="mono label-caps" htmlFor={`slot-${m.id}`}>
                            Start ({timeZone})
                          </label>
                          <input
                            id={`slot-${m.id}`}
                            type="datetime-local"
                            value={slot}
                            min={toLocalInput(new Date())}
                            onChange={(e) => setSlot(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-line">
                          <label className="mono label-caps" htmlFor={`duration-${m.id}`}>
                            Length
                          </label>
                          <select
                            id={`duration-${m.id}`}
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                          >
                            {DURATIONS.map((d) => (
                              <option key={d} value={d}>
                                {d} min
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="meeting-queue__actions">
                          <button
                            type="submit"
                            className="btn-secondary"
                            disabled={sending || options.length === 0}
                          >
                            {sending ? "Sending…" : "Send invite"}
                          </button>
                          <button
                            type="button"
                            className="mono link-button"
                            onClick={() => setInviteId(null)}
                          >
                            cancel
                          </button>
                        </div>
                        {formError && (
                          <p role="alert" className="mono form-error">
                            {formError}
                          </p>
                        )}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {data && meetings.length === 0 && <p className="muted">No meetings queued.</p>}
    </section>
  );
}
