"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import GlideMenu from "@/components/bui/GlideMenu";
import ThemeToggle from "@/components/ui/ThemeToggle";
import {
  IconCheck,
  IconChevronsUpDown,
  IconLogout,
  IconPause,
  IconPlay,
  IconPlus,
  IconSidebar,
} from "@/components/ui/icons";
import type { CampaignSummary } from "@/lib/campaigns/sessions";

/* ─────────────────────────────────────────────────────────
 * SIDEBAR NAV (Beautiful UI) — the workspace navigation: a
 * campaign switcher, a handful of top-level areas, settings at
 * the bottom and the kill switch in the footer so it is visible
 * on every screen. Tabs inside an area live on the page, not here.
 *
 * The sidebar is one persistent 224px tree clipped by a 52px
 * shell; every rail glyph stays centered at x=26 in both states.
 * ───────────────────────────────────────────────────────── */

export type SidebarItem = {
  key: string;
  label: string;
  icon: ReactNode;
  href: string;
  count?: number;
  /** a live dot instead of a count (e.g. agents working) */
  live?: boolean;
  active?: boolean;
};

const SIDEBAR_MOTION = {
  expandedWidth: 224,
  collapsedWidth: 52,
  duration: 280,
  copyDuration: 180,
  copyOffset: 8,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

const COLLAPSE_KEY = "kami_sidebar_collapsed";

function NavRow({ item, onNavigate }: { item: SidebarItem; onNavigate: (href: string) => void }) {
  return (
    <a
      data-row
      href={item.href}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onNavigate(item.href);
      }}
      title={item.label}
      aria-current={item.active ? "page" : undefined}
      className={`sidebar-row sidebar-rail${item.active ? " is-active" : ""}`}
    >
      <span className="sidebar-rail__icon">
        {item.icon}
        {item.live && <span className="sidebar-rail__live" aria-hidden />}
      </span>
      <span className="sidebar-copy sidebar-rail__label">{item.label}</span>
      {item.count ? <span className="sidebar-copy sidebar-rail__count">{item.count}</span> : null}
    </a>
  );
}

function WorkspaceMenu({
  position,
  current,
  campaigns,
  authRequired,
  onSwitch,
  onNewCampaign,
  onSignOut,
  onClose,
}: {
  position: { top: number; left: number };
  current: string;
  campaigns: CampaignSummary[] | null;
  authRequired: boolean;
  onSwitch: (id: string) => void;
  onNewCampaign: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const others = campaigns ?? [];
  return createPortal(
    <div
      data-workspace-menu
      role="menu"
      className="workspace-menu"
      style={{ top: position.top, left: position.left }}
    >
      <GlideMenu className="workspace-menu__list" highlightClassName="workspace-menu__glide">
        <div className="workspace-menu__caption">Campaigns</div>
        {campaigns === null && <div className="workspace-menu__caption text-3">Loading…</div>}
        {others.map((c) => (
          <button
            key={c.id}
            data-menu-row
            role="menuitem"
            type="button"
            onClick={() => {
              onClose();
              if (c.id !== current) onSwitch(c.id);
            }}
            className="workspace-menu__row workspace-menu__row--lg"
          >
            <span className="workspace-menu__mark" aria-hidden>
              {c.canonical_domain.charAt(0).toUpperCase()}
            </span>
            <span className="workspace-menu__name truncate">
              {c.company_name ?? c.canonical_domain}
            </span>
            {c.id === current && <IconCheck size={15} strokeWidth={2.2} />}
          </button>
        ))}
        <div className="workspace-menu__rule" />
        <button
          data-menu-row
          role="menuitem"
          type="button"
          onClick={() => {
            onClose();
            onNewCampaign();
          }}
          className="workspace-menu__row"
        >
          <span className="workspace-menu__icon">
            <IconPlus size={15} />
          </span>
          <span className="workspace-menu__label">New campaign</span>
        </button>
        <div className="workspace-menu__row workspace-menu__row--static">
          <span className="workspace-menu__label text-2">Theme</span>
          <ThemeToggle />
        </div>
        {authRequired && (
          <>
            <div className="workspace-menu__rule" />
            <button
              data-menu-row
              role="menuitem"
              type="button"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="workspace-menu__row"
            >
              <span className="workspace-menu__icon">
                <IconLogout size={15} />
              </span>
              <span className="workspace-menu__label">Sign out</span>
            </button>
          </>
        )}
      </GlideMenu>
    </div>,
    document.body,
  );
}

export default function AppSidebar({
  campaignId,
  name,
  campaigns,
  onOpenSwitcher,
  primary,
  secondary,
  paused,
  pauseBusy,
  authRequired,
  onNavigate,
  onSwitch,
  onNewCampaign,
  onSignOut,
  onTogglePause,
}: {
  campaignId: string;
  name: string;
  campaigns: CampaignSummary[] | null;
  /** load the campaign list the first time the switcher opens */
  onOpenSwitcher: () => void;
  primary: SidebarItem[];
  secondary: SidebarItem[];
  paused: boolean;
  pauseBusy: boolean;
  authRequired: boolean;
  onNavigate: (href: string) => void;
  onSwitch: (id: string) => void;
  onNewCampaign: () => void;
  onSignOut: () => void;
  onTogglePause: () => void;
}) {
  // the workspace only renders client-side, so storage can seed the first render
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspacePosition, setWorkspacePosition] = useState({ top: 0, left: 0 });
  const workspaceButtonRef = useRef<HTMLButtonElement>(null);

  const setCollapsedSaved = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the choice lasts for this page */
    }
  };

  useEffect(() => {
    if (!workspaceOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!target.closest("[data-workspace-trigger]") && !target.closest("[data-workspace-menu]")) {
        setWorkspaceOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorkspaceOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [workspaceOpen]);

  return (
    <aside
      data-sidebar-collapsed={collapsed}
      aria-label="Workspace navigation"
      className="sidebar"
      style={
        {
          width: collapsed ? SIDEBAR_MOTION.collapsedWidth : SIDEBAR_MOTION.expandedWidth,
          transitionDuration: `${SIDEBAR_MOTION.duration}ms`,
          transitionTimingFunction: SIDEBAR_MOTION.easing,
          "--sidebar-copy-duration": `${SIDEBAR_MOTION.copyDuration}ms`,
          "--sidebar-copy-offset": `${SIDEBAR_MOTION.copyOffset}px`,
          "--sidebar-easing": SIDEBAR_MOTION.easing,
        } as CSSProperties
      }
    >
      <div className="sidebar__tree">
        <div className="sidebar__top">
          <button
            ref={workspaceButtonRef}
            data-workspace-trigger
            type="button"
            aria-expanded={workspaceOpen}
            aria-haspopup="menu"
            aria-label={`Campaign: ${name}. Switch campaign`}
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              if (!workspaceOpen && workspaceButtonRef.current) {
                const rect = workspaceButtonRef.current.getBoundingClientRect();
                setWorkspacePosition({ top: rect.bottom + 6, left: rect.left });
                onOpenSwitcher();
              }
              setWorkspaceOpen((open) => !open);
            }}
            className="sidebar-workspace-control"
          >
            <span className="sidebar-logo" aria-hidden>
              <span className="kami-seal">K</span>
            </span>
            <span className="sidebar-copy sidebar-workspace-name truncate">{name}</span>
            <span className="sidebar-copy sidebar-workspace-chevron">
              <IconChevronsUpDown size={14} />
            </span>
          </button>

          {workspaceOpen && (
            <WorkspaceMenu
              position={workspacePosition}
              current={campaignId}
              campaigns={campaigns}
              authRequired={authRequired}
              onSwitch={onSwitch}
              onNewCampaign={onNewCampaign}
              onSignOut={onSignOut}
              onClose={() => setWorkspaceOpen(false)}
            />
          )}

          <button
            type="button"
            aria-label="Collapse sidebar"
            aria-hidden={collapsed}
            tabIndex={collapsed ? -1 : 0}
            onClick={() => {
              setCollapsedSaved(true);
              setWorkspaceOpen(false);
            }}
            className="sidebar-collapse-control"
          >
            <IconSidebar size={18} />
          </button>
          <button
            type="button"
            aria-label="Expand sidebar"
            aria-hidden={!collapsed}
            tabIndex={collapsed ? 0 : -1}
            onClick={() => setCollapsedSaved(false)}
            className="sidebar-expand-control"
          >
            <IconSidebar size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        </div>

        <nav aria-label="Main" className="sidebar__nav">
          <GlideMenu
            rowSelector="[data-row]"
            highlightClassName="glide__highlight--sidebar"
            className="sidebar-glide"
          >
            {primary.map((item) => (
              <NavRow key={item.key} item={item} onNavigate={onNavigate} />
            ))}
          </GlideMenu>
        </nav>

        <div className="sidebar__spacer" />

        <nav aria-label="Workspace" className="sidebar__nav">
          <GlideMenu
            rowSelector="[data-row]"
            highlightClassName="glide__highlight--sidebar"
            className="sidebar-glide"
          >
            {secondary.map((item) => (
              <NavRow key={item.key} item={item} onNavigate={onNavigate} />
            ))}
          </GlideMenu>
        </nav>

        {/* the kill switch stays reachable when collapsed: it shrinks to its glyph */}
        <div className="sidebar__footer">
          <button
            type="button"
            aria-pressed={paused}
            aria-label={paused ? "Resume all sends" : "Pause all sends"}
            title={paused ? "Kami is paused — resume all sends" : "Pause every send, post and DM"}
            onClick={onTogglePause}
            disabled={pauseBusy}
            className={`sidebar-kill${paused ? " is-paused" : ""}`}
          >
            <span className="sidebar-kill__icon">
              {pauseBusy ? (
                <span className="btn__spinner" />
              ) : paused ? (
                <IconPlay size={13} />
              ) : (
                <IconPause size={13} />
              )}
            </span>
            <span className="sidebar-copy sidebar-kill__label">
              {paused ? "Resume all sends" : "Pause all sends"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
