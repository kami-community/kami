"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import InboxDetail from "@/components/inbox/InboxDetail";
import InboxRow, { INBOX_TYPES } from "@/components/inbox/InboxRow";
import { useInbox } from "@/components/inbox/useInbox";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconCheckCircle, IconInbox, IconRefresh } from "@/components/ui/icons";
import { Page, PageHeader } from "@/components/ui/Page";
import Segmented from "@/components/ui/Segmented";
import Skeleton from "@/components/ui/Skeleton";
import { nextStep } from "@/lib/client/nextStep";
import { INBOX_ORDER, type InboxItemType } from "@/lib/domain/inbox";

type Filter = "all" | InboxItemType;

/** Filter chips in the order a founder scans them. */
const FILTERS: readonly InboxItemType[] = ["draft", "reply", "meeting", "opportunity", "task"];

/**
 * Inbox — everything waiting on the founder in one list (drafts to review,
 * replies, meeting requests, opportunities, tasks), with the selected item
 * handled on the right using that item's own flow.
 */
export default function InboxArea() {
  return (
    <Suspense
      fallback={
        <Page wide>
          <Skeleton title lines={6} />
        </Page>
      }
    >
      <InboxScreen />
    </Suspense>
  );
}

function InboxScreen() {
  const inbox = useInbox();
  const { progress, session } = useCampaign();
  const { navigate, href } = useWorkspace();
  const router = useRouter();
  const selectedKey = useSearchParams().get("item");
  const [filter, setFilter] = useState<Filter>("all");

  // `?item=<key>` is a real URL (Home → Waiting on you, reload, Back/Forward).
  function select(key: string | null) {
    if (key === selectedKey) return;
    const base = href({ area: "inbox" });
    router.push(key ? `${base}?item=${encodeURIComponent(key)}` : base, { scroll: false });
  }

  const items = inbox.data?.items ?? [];
  const counts = inbox.data?.counts;
  const visible = filter === "all" ? items : items.filter((i) => i.type === filter);
  const selected = items.find((i) => i.key === selectedKey) ?? null;
  // the selected item was handled (it left the inbox): offer the next one
  const handled = selectedKey !== null && !selected && Boolean(inbox.data);
  const next = visible[0] ?? null;
  const upNext = progress ? nextStep(progress, session.goals ?? []) : null;

  return (
    <Page wide>
      <PageHeader
        title="Inbox"
        lede="Everything waiting on you: emails to review, replies, meetings, opportunities and tasks."
        actions={
          <Button
            size="sm"
            variant="quiet"
            icon={<IconRefresh size={13} />}
            busy={inbox.loading && Boolean(inbox.data)}
            onClick={inbox.refresh}
          >
            Refresh
          </Button>
        }
      />

      {inbox.error && (
        <Callout
          tone="error"
          actions={
            <Button size="sm" variant="secondary" onClick={inbox.refresh}>
              Try again
            </Button>
          }
        >
          {inbox.error}
        </Callout>
      )}

      {inbox.loading && !inbox.data && (
        <div className="inbox">
          <div className="inbox__list card">
            <Skeleton lines={6} />
          </div>
        </div>
      )}

      {inbox.data && items.length === 0 && (
        <EmptyState
          title="You're all caught up"
          icon={<IconCheckCircle size={16} />}
          action={
            upNext && upNext.view.area !== "inbox" ? (
              <Button size="sm" variant="secondary" onClick={() => navigate(upNext.view)}>
                {upNext.cta}
              </Button>
            ) : undefined
          }
        >
          Nothing needs you right now. Kami adds drafts, replies and opportunities here as they come
          in.
          {upNext && upNext.view.area !== "inbox" && <> Next up: {upNext.title}.</>}
        </EmptyState>
      )}

      {inbox.data && items.length > 0 && (
        <>
          <div className="inbox__filters">
            <Segmented<Filter>
              label="Filter the inbox"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts?.total ?? 0 },
                ...FILTERS.filter((t) => (counts?.[t] ?? 0) > 0 || filter === t).map((t) => ({
                  value: t,
                  label: INBOX_TYPES[t].filter,
                  count: counts?.[t] ?? 0,
                })),
              ]}
            />
          </div>

          <div className={`inbox${selected ? " inbox--detail-open" : ""}`}>
            <div className="inbox__list card" aria-label="Waiting on you" role="region">
              {visible.length === 0 && (
                <p className="inbox__none text-3 text-sm">Nothing of this kind is waiting.</p>
              )}
              {INBOX_ORDER.map((type) => {
                const group = visible.filter((i) => i.type === type);
                if (!group.length) return null;
                return (
                  <section
                    key={type}
                    className="inbox__group"
                    aria-label={INBOX_TYPES[type].filter}
                  >
                    {filter === "all" && (
                      <p className="inbox__group-label" aria-hidden>
                        {INBOX_TYPES[type].filter} <span className="tabular">{group.length}</span>
                      </p>
                    )}
                    <ul className="inbox__rows">
                      {group.map((item) => (
                        <li key={item.key}>
                          <InboxRow
                            item={item}
                            selected={item.key === selectedKey}
                            onOpen={() => select(item.key)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="inbox__detail">
              {selected ? (
                <InboxDetail
                  key={selected.key}
                  item={selected}
                  onClose={() => select(null)}
                  onChanged={inbox.refresh}
                />
              ) : handled ? (
                <EmptyState
                  title="Done"
                  icon={<IconCheckCircle size={16} />}
                  action={
                    next ? (
                      <Button size="sm" variant="secondary" onClick={() => select(next.key)}>
                        Next: {next.title}
                      </Button>
                    ) : undefined
                  }
                >
                  That item is handled and has left your inbox.
                </EmptyState>
              ) : (
                <EmptyState title="Pick an item" icon={<IconInbox size={16} />}>
                  Choose something on the left to review it here.
                </EmptyState>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
