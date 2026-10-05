"use client";

import { useCallback, useEffect, useState } from "react";
import type { Meeting, MeetingStatus } from "@/lib/salesTypes";

const STATUS_ORDER: MeetingStatus[] = [
  "proposed",
  "invited",
  "accepted",
  "declined",
  "completed",
  "no_show",
  "cancelled",
];

interface MeetingQueueProps {
  sessionDbId: string | null;
}

export default function MeetingQueue({ sessionDbId }: MeetingQueueProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [slot, setSlot] = useState("");
  const [inviting, setInviting] = useState(false);

  const fetchMeetings = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/meetings?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setMeetings(j.meetings ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  async function sendInvite(meetingId: string) {
    if (!email.includes("@") || !slot) return;
    setInviting(true);
    try {
      const res = await fetch("/api/sales/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invite",
          meeting_id: meetingId,
          attendee_email: email,
          slot,
        }),
      });
      if (res.ok) {
        setInviteId(null);
        setEmail("");
        setSlot("");
        fetchMeetings();
      }
    } finally {
      setInviting(false);
    }
  }

  const grouped: Record<string, Meeting[]> = {};
  for (const s of STATUS_ORDER) grouped[s] = [];
  for (const m of meetings) {
    if (grouped[m.status]) grouped[m.status].push(m);
  }

  return (
    <div>
      {STATUS_ORDER.map((status) => {
        const list = grouped[status] ?? [];
        if (list.length === 0) return null;
        return (
          <div key={status} style={{ marginBottom: "var(--stack-sm)" }}>
            <p
              className="label-caps"
              style={{ fontSize: 10, color: "var(--outline)", marginBottom: "0.35rem" }}
            >
              {status.replace(/_/g, " ")} ({list.length})
            </p>
            {list.map((m) => (
              <div
                key={m.id}
                className="kraft-card"
                style={{ padding: "0.6rem 0.75rem", marginBottom: "0.35rem" }}
              >
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{m.title ?? "Meeting"}</p>
                <p
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: "0.2rem" }}
                >
                  {m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : "Slot TBD"}
                  {m.calendar_event_id ? " · invited" : ""}
                </p>
                {m.status === "proposed" && (
                  <>
                    {inviteId === m.id ? (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.35rem",
                        }}
                      >
                        <div className="form-line">
                          <label className="mono label-caps" htmlFor={`email-${m.id}`}>
                            Attendee email
                          </label>
                          <input
                            id={`email-${m.id}`}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="prospect@company.com"
                          />
                        </div>
                        <div className="form-line">
                          <label className="mono label-caps" htmlFor={`slot-${m.id}`}>
                            Slot (ISO)
                          </label>
                          <input
                            id={`slot-${m.id}`}
                            value={slot}
                            onChange={(e) => setSlot(e.target.value)}
                            placeholder="2026-07-20T15:00:00.000Z"
                          />
                        </div>
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          <button
                            className="hanko-btn"
                            disabled={inviting}
                            onClick={() => sendInvite(m.id!)}
                            style={{ fontSize: 12 }}
                          >
                            Send invite
                          </button>
                          <button
                            type="button"
                            className="mono"
                            onClick={() => setInviteId(null)}
                            style={{ background: "none", border: "none", cursor: "pointer" }}
                          >
                            cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mono"
                        onClick={() => setInviteId(m.id ?? null)}
                        style={{
                          marginTop: "0.35rem",
                          border: "1px solid var(--ink)",
                          background: "transparent",
                          padding: "0.2rem 0.5rem",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Invite →
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {meetings.length === 0 && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 13 }}>
          No meetings queued.
        </p>
      )}
    </div>
  );
}
