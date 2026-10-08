"use client";

import type { ReactNode } from "react";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import ConnectSocials from "@/components/ConnectSocials";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import { IconBolt, IconGlobe, IconMail, IconSearch } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { StatusPill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import type { KamiCapabilities } from "@/lib/capabilities";
import { useApi } from "@/lib/client/useApi";

const PROVIDER_LABELS: Record<string, string> = { linkup: "Linkup", exa: "Exa", tavily: "Tavily" };

function StatusRow({
  icon,
  name,
  ok,
  okLabel,
  offLabel,
  children,
}: {
  icon: ReactNode;
  name: string;
  ok: boolean;
  okLabel: string;
  offLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="connect-list__row">
      <span className="settings-status__icon" aria-hidden>
        {icon}
      </span>
      <div className="connect-list__copy">
        <span className="connect-list__name">
          {name}
          <StatusPill tone={ok ? "green" : "neutral"}>{ok ? okLabel : offLabel}</StatusPill>
        </span>
        <span className="connect-list__hint">{children}</span>
      </div>
    </div>
  );
}

/**
 * Settings → Connections: the social accounts the founder connects here,
 * plus a read-only view of what this install is configured to do (email,
 * research, Hermes). Install-level services are set in the environment.
 */
export default function ConnectionsSettings() {
  const { sessionId } = useCampaign();
  const caps = useApi<KamiCapabilities>("/api/capabilities");
  const c = caps.data;

  return (
    <>
      <Section
        num="01"
        title="Social accounts"
        desc="Connected for this campaign only. Disconnect any time."
      >
        <Card>
          <CardBody>
            <ConnectSocials sessionId={sessionId} layout="list" />
          </CardBody>
        </Card>
      </Section>

      <Section
        num="02"
        title="This install"
        desc="Set by whoever runs Kami, in the environment. Shown here so you know what Kami can and can’t do."
      >
        {caps.error ? (
          <Callout
            tone="error"
            title="Could not check what this install can do"
            actions={
              <Button size="sm" variant="secondary" onClick={caps.reload}>
                Retry
              </Button>
            }
          >
            {caps.error}
          </Callout>
        ) : !c ? (
          <Skeleton lines={4} />
        ) : (
          <div className="stack">
            <Card>
              <CardBody className="connect-list">
                <StatusRow
                  icon={<IconMail size={15} />}
                  name="Email (AgentMail)"
                  ok={c.canSendEmail}
                  okLabel="Ready"
                  offLabel="Drafts only"
                >
                  {c.canSendEmail
                    ? "Kami can send the emails you approve and pick up replies."
                    : "Kami drafts emails but can’t send them. Set AGENTMAIL_API_KEY and AGENTMAIL_INBOX to send."}
                </StatusRow>
                <StatusRow
                  icon={<IconSearch size={15} />}
                  name="Web research"
                  ok={c.researchProviders.length > 0}
                  okLabel={c.researchProviders.map((p) => PROVIDER_LABELS[p] ?? p).join(", ")}
                  offLabel="Your site only"
                >
                  {c.researchProviders.length > 0
                    ? "Agents search the web to find companies, people and conversations."
                    : "No search provider is set, so research uses your own site. Add LINKUP_API_KEY, EXA_API_KEY or TAVILY_API_KEY."}
                </StatusRow>
                <StatusRow
                  icon={<IconGlobe size={15} />}
                  name="Browser"
                  ok={c.researchModes.includes("browser")}
                  okLabel="Connected"
                  offLabel="Off"
                >
                  {c.researchModes.includes("browser")
                    ? "Agents can open and read live pages."
                    : "Optional. Set HERMES_BROWSER_CDP_URL to let agents read live pages."}
                </StatusRow>
                <StatusRow
                  icon={<IconBolt size={15} />}
                  name="Hermes"
                  ok={c.hermes && c.hermesReachable}
                  okLabel="Reachable"
                  offLabel={c.hermes ? "Not reachable" : "Not set"}
                >
                  {c.hermes && c.hermesReachable
                    ? "The agent runtime is up. Your agents’ work is on the Team page."
                    : c.hermes
                      ? "Kami can’t reach the Hermes gateway — start it, then reload."
                      : "Set HERMES_API_KEY to your Hermes API_SERVER_KEY."}
                </StatusRow>
              </CardBody>
            </Card>
            {c.notes.length > 0 && (
              <Callout tone="info" title="To unlock more">
                <ul className="bullet-list">
                  {c.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Callout>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
