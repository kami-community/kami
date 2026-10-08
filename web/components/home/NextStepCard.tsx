"use client";

import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { IconArrowRight, IconSparkle } from "@/components/ui/icons";
import type { NextStep } from "@/lib/client/nextStep";

/** Home's one recommendation, with the screen's single accent button. */
export default function NextStepCard({ step, paused }: { step: NextStep; paused: boolean }) {
  const { navigate, askGuide } = useWorkspace();
  return (
    <Card as="section" className="home-next fade-up" aria-labelledby="home-next-title">
      <div className="home-next__body">
        <p className="home-eyebrow">Next step</p>
        <h2 id="home-next-title" className="home-next__title">
          {step.title}
        </h2>
        <p className="home-next__why">{step.why}</p>
        {paused && (
          <p className="home-next__note">
            Kami is paused, so nothing will be sent until you resume it.
          </p>
        )}
      </div>
      <div className="home-next__actions">
        <Button
          size="sm"
          variant="quiet"
          icon={<IconSparkle size={13} />}
          onClick={() =>
            askGuide(`Why is "${step.title}" my next step, and what happens after it?`)
          }
        >
          Ask Kami why
        </Button>
        <Button
          variant="accent"
          icon={<IconArrowRight size={14} />}
          onClick={() => navigate(step.view)}
        >
          {step.cta}
        </Button>
      </div>
    </Card>
  );
}
