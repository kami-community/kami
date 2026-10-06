import type { ReactNode } from "react";
import {
  IconChat,
  IconHash,
  IconInstagram,
  IconRocket,
  IconUsers,
  IconX,
} from "@/components/ui/icons";
import type { DistributionPlatform } from "@/lib/distributionTypes";

export const PLATFORM_LABELS: Record<DistributionPlatform, string> = {
  x: "X",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  hackernews: "Hacker News",
  producthunt: "Product Hunt",
  discord: "Discord",
};

export const PLATFORM_COLORS: Record<string, string> = {
  x: "oklch(0.25 0 0)",
  reddit: "oklch(0.64 0.21 35)",
  linkedin: "oklch(0.52 0.13 245)",
  hackernews: "oklch(0.7 0.18 48)",
  producthunt: "oklch(0.62 0.2 30)",
  discord: "oklch(0.58 0.2 275)",
  instagram: "oklch(0.6 0.22 350)",
};

export function platformIcon(platform: string, size = 13): ReactNode {
  switch (platform) {
    case "x":
      return <IconX size={size} />;
    case "reddit":
      return <IconChat size={size} />;
    case "linkedin":
      return <IconUsers size={size} />;
    case "hackernews":
      return <IconHash size={size} />;
    case "producthunt":
      return <IconRocket size={size} />;
    case "discord":
      return <IconChat size={size} />;
    case "instagram":
      return <IconInstagram size={size} />;
    default:
      return <IconHash size={size} />;
  }
}

/** A colored square with the platform glyph. */
export function PlatformMark({ platform, size = 22 }: { platform: string; size?: number }) {
  return (
    <span
      className="platform-mark"
      style={{ width: size, height: size, background: PLATFORM_COLORS[platform] ?? "var(--ink-3)" }}
      aria-hidden
    >
      {platformIcon(platform, Math.round(size * 0.55))}
    </span>
  );
}
