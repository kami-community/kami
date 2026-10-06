"use client";

import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody, CardFooter } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Field, { Input, Select } from "@/components/ui/Field";
import { IconArrowUpRight, IconCalendar } from "@/components/ui/icons";
import { humanize, StatusPill, statusTone } from "@/components/ui/Pills";
import Segmented from "@/components/ui/Segmented";
import Skeleton from "@/components/ui/Skeleton";
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
  /** When set (Inbox), show only this meeting instead of every meeting on the campaign. */
  focusId?: string;
  onChanged?: () => void;
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

export default function MeetingQueue({ sessionDbId, focusId, onChanged }: MeetingQueueProps) {
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

  const meetings = (data?.meetings ?? []).filter((m) => !focusId || m.id === focusId);
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
      onChanged?.();
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
    <div className="stack">
      {loading && !data && <Skeleton title lines={4} />}
      {error && <Callout tone="error">{error}</Callout>}
      {data && !calendarReady && (
        <Callout tone="info" title="Calendar invites are off">
          Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN to send real invites.
        </Callout>
      )}

      {STATUS_ORDER.map((status) => {
        const list = grouped.get(status) ?? [];
        if (!list.length) return null;
        return (
          <section key={status} className="stack stack--sm">
            <p className="group-label">
              {humanize(status)} <span className="tabular">{list.length}</span>
            </p>
            {list.map((m) => {
              const options = contacts.filter(
                (c) => !m.account_id || !c.account_id || c.account_id === m.account_id,
              );
              const htmlLink =
                typeof m.provider_receipt?.html_link === "string"
                  ? m.provider_receipt.html_link
                  : null;
              return (
                <Card key={m.id}>
                  <CardBody className="meeting">
                    <span className="meeting__icon">
                      <IconCalendar size={16} />
                    </span>
                    <span className="meeting__copy">
                      <span className="meeting__title">{m.title ?? "Meeting"}</span>
                      <span className="text-3 text-xs">
                        {formatSlot(m.scheduled_at, m.time_zone)}
                        {m.attendee_email ? ` · ${m.attendee_email}` : ""}
                      </span>
                    </span>
                    <span className="row row--wrap" style={{ gap: 6 }}>
                      <StatusPill tone={statusTone(m.status)}>{humanize(m.status)}</StatusPill>
                      {m.meeting_link && (
                        <a
                          className="records-link"
                          href={m.meeting_link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Video <IconArrowUpRight size={11} />
                        </a>
                      )}
                      {htmlLink && (
                        <a
                          className="records-link"
                          href={htmlLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Calendar <IconArrowUpRight size={11} />
                        </a>
                      )}
                      {m.status === "proposed" && calendarReady && inviteId !== m.id && (
                        <Button size="xs" variant="accent" onClick={() => openInvite(m)}>
                          Invite…
                        </Button>
                      )}
                    </span>
                  </CardBody>
                  {m.last_error && m.status === "proposed" && (
                    <CardBody>
                      <p className="field__error">Last attempt failed: {m.last_error}</p>
                    </CardBody>
                  )}
                  {inviteId === m.id && (
                    <form onSubmit={(e) => sendInvite(e, m)}>
                      <CardBody
                        className="field-grid"
                        style={{ borderTop: "1px solid var(--line)" }}
                      >
                        {options.length === 0 ? (
                          <p className="text-3 text-sm">
                            No contact with an email on this account yet — find or add one first.
                          </p>
                        ) : (
                          <Field label="Attendee">
                            <Select
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
                            </Select>
                          </Field>
                        )}
                        <Field label={`Start (${timeZone})`}>
                          <Input
                            type="datetime-local"
                            value={slot}
                            min={toLocalInput(new Date())}
                            onChange={(e) => setSlot(e.target.value)}
                            required
                          />
                        </Field>
                        <div className="field">
                          <span className="field__label">Length</span>
                          <Segmented
                            label="Meeting length"
                            value={String(duration)}
                            onChange={(v) => setDuration(Number(v))}
                            options={DURATIONS.map((d) => ({ value: String(d), label: `${d}m` }))}
                          />
                        </div>
                      </CardBody>
                      {formError && (
                        <CardBody>
                          <p role="alert" className="field__error">
                            {formError}
                          </p>
                        </CardBody>
                      )}
                      <CardFooter>
                        <Button size="sm" variant="quiet" onClick={() => setInviteId(null)}>
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          variant="accent"
                          busy={sending}
                          disabled={options.length === 0}
                        >
                          Send invite
                        </Button>
                      </CardFooter>
                    </form>
                  )}
                </Card>
              );
            })}
          </section>
        );
      })}
      {data &&
        meetings.length === 0 &&
        (focusId ? (
          <EmptyState title="This meeting is no longer waiting" icon={<IconCalendar size={16} />}>
            It has left your inbox.
          </EmptyState>
        ) : (
          <EmptyState title="No meetings queued" icon={<IconCalendar size={16} />}>
            Meeting requests from replies show up here.
          </EmptyState>
        ))}
    </div>
  );
}
