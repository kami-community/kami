"use client";

import { useEffect, useRef, useState } from "react";
import type { Dossier } from "@/lib/hermes";
import { streamChat } from "@/lib/hermes";
import { guidePrompt } from "@/lib/prompts";
import {
  buildCompanyContextPack,
  dossierFromBrandPayload,
} from "@/lib/guideContext";
import type { SalesCampaignConfig } from "@/lib/salesTypes";
import type { CampaignTab } from "@/lib/marketingTypes";

interface Message {
  role: "you" | "guide";
  text: string;
}

interface KamiGuideProps {
  sessionId: string;
  domain: string;
  dossier: Dossier | null;
  sessionDbId?: string | null;
  salesConfig?: SalesCampaignConfig | null;
  goals?: string[] | null;
  activeTab?: CampaignTab;
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function KamiGuide({
  sessionId,
  domain,
  dossier,
  sessionDbId = null,
  salesConfig = null,
  goals = null,
  activeTab = "overview",
  collapsed = false,
  onToggle,
}: KamiGuideProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  async function resolveDossier(): Promise<Dossier | null> {
    if (dossier) return dossier;
    if (!sessionDbId) return null;
    try {
      const res = await fetch(`/api/sessions/${sessionDbId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return dossierFromBrandPayload(json.brand);
    } catch {
      return null;
    }
  }

  async function send() {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "you", text: question }, { role: "guide", text: "" }]);
    try {
      const resolved = await resolveDossier();
      const contextPack = buildCompanyContextPack({
        dossier: resolved,
        domain,
        salesConfig,
        goals,
        activeJob:
          activeTab === "sales"
            ? "find_customers"
            : activeTab === "marketing"
              ? "create_distribution"
              : null,
        canonicalDomain: resolved?.canonical_domain ?? domain,
        researchProvenance: resolved
          ? {
              confidence: resolved.identity_confidence,
              evidenceUrls: resolved.evidence_urls,
              sourceCount: resolved.evidence_urls?.length,
            }
          : null,
      });
      const guideSession = `kami-guide-${sessionId}`;
      await streamChat(
        guidePrompt(question, contextPack),
        guideSession,
        (delta) => {
          setMessages((m) => {
            const last = m[m.length - 1];
            return [...m.slice(0, -1), { ...last, text: last.text + delta }];
          });
        },
        {
          kamiSessionId: sessionDbId,
          kind: "ask_kami",
          agent: "guide",
          maxTokens: 400,
        },
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "request failed";
      setMessages((m) => [...m.slice(0, -1), { role: "guide", text: `⚠ ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        className="hanko-btn"
        onClick={onToggle}
        style={{ position: "fixed", right: 16, bottom: 16, zIndex: 40 }}
      >
        Ask Kami
      </button>
    );
  }

  return (
    <aside
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        position: "sticky",
        top: 64,
        width: "100%",
        maxWidth: 380,
        minWidth: 300,
        background: "var(--paper)",
        borderLeft: "1px solid var(--crease)",
        zIndex: 20,
      }}
    >
      <div
        style={{
          padding: "var(--stack-md)",
          borderBottom: "1px solid var(--crease)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>Ask Kami</h3>
          {onToggle && (
            <button
              type="button"
              className="mono"
              onClick={onToggle}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}
            >
              hide
            </button>
          )}
        </div>
        <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "0.35rem" }}>
          Grounded in your dossier + current {activeTab} state. Cannot send or publish for you.
        </p>
      </div>

      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "var(--stack-md)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--stack-sm)",
        }}
      >
        {messages.length === 0 && (
          <p className="kami-guide-message" style={{ color: "var(--ink-soft)" }}>
            Ask: “What should I do next?” or “Why is this company a fit?”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i}>
            <span className="label-caps">{m.role === "you" ? "You" : "Kami"}</span>
            <p className="kami-guide-message" style={{ whiteSpace: "pre-wrap", marginTop: "0.25rem" }}>
              {m.text || "…"}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--crease)",
          padding: "var(--stack-md)",
          flexShrink: 0,
          background: "var(--paper)",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <div className="form-line" style={{ flex: 1 }}>
            <label className="mono label-caps" htmlFor="kami-guide-input">
              YOUR QUESTION
            </label>
            <input
              id="kami-guide-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="What should I do next?"
              disabled={busy}
              style={{ fontSize: 14, padding: "0.35rem 0" }}
            />
          </div>
          <button className="hanko-btn" onClick={() => void send()} disabled={busy}>
            {busy ? "…" : "Ask"}
          </button>
        </div>
      </div>
    </aside>
  );
}
