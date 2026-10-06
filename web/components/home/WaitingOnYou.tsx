"use client";

import { useRouter } from "next/navigation";
import InboxRow from "@/components/inbox/InboxRow";
import { useInbox } from "@/components/inbox/useInbox";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconArrowRight } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";

const SHOWN = 5;

/** Home → the first few things waiting on the founder, each opening in Inbox. */
export default function WaitingOnYou() {
  const inbox = useInbox();
  const { href, navigate } = useWorkspace();
  const router = useRouter();
  const items = inbox.data?.items ?? [];
  const total = inbox.data?.counts.total ?? 0;

  return (
    <Section
      title="Waiting on you"
      desc={
        inbox.data
          ? total
            ? `${total} item${total === 1 ? "" : "s"}`
            : "Nothing right now"
          : undefined
      }
      actions={
        total > 0 ? (
          <Button size="xs" variant="quiet" onClick={() => navigate({ area: "inbox" })}>
            View all in Inbox <IconArrowRight size={12} />
          </Button>
        ) : undefined
      }
    >
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
        <div className="card home-waiting">
          <Skeleton lines={3} />
        </div>
      )}
      {inbox.data && items.length === 0 && (
        <p className="home-quiet">
          You&apos;re all caught up. New drafts, replies and opportunities show up here.
        </p>
      )}
      {items.length > 0 && (
        <ul className="card home-waiting" aria-label="Waiting on you">
          {items.slice(0, SHOWN).map((item) => (
            <li key={item.key}>
              <InboxRow
                item={item}
                onOpen={() =>
                  router.push(`${href({ area: "inbox" })}?item=${encodeURIComponent(item.key)}`)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
