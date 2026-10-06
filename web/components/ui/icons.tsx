import type { ReactNode, SVGProps } from "react";

/**
 * Kami's icon set: round-cap, 2px-stroke outline glyphs on a 24px grid
 * (the Beautiful UI look), inlined so the app has no icon dependency.
 * Every icon is decorative by default (`aria-hidden`); label the control.
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  strokeWidth?: number;
};

function make(name: string, paths: ReactNode, filled = false) {
  function Icon({ size = 16, strokeWidth = 2, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? "currentColor" : "none"}
        stroke={filled ? "none" : "currentColor"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable={false}
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = `Icon${name}`;
  return Icon;
}

export const IconHome = make(
  "Home",
  <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />,
);
export const IconEdit = make(
  "Edit",
  <>
    <path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12" />
    <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.5 14.4 9 15l.6-3.5 8-7.6Z" />
  </>,
);
export const IconUserAdd = make(
  "UserAdd",
  <>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c.6-3.3 3.2-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9M18 14v6M15 17h6" />
  </>,
);
export const IconUsers = make(
  "Users",
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.6-3.3 3.2-5.5 6.5-5.5s5.9 2.2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.7 2.5 3 5.2" />
  </>,
);
export const IconSearch = make(
  "Search",
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.8-3.8" />
  </>,
);
export const IconChevronDown = make("ChevronDown", <path d="m6 9 6 6 6-6" />);
export const IconChevronUp = make("ChevronUp", <path d="m18 15-6-6-6 6" />);
export const IconChevronRight = make("ChevronRight", <path d="m9 6 6 6-6 6" />);
export const IconChevronLeft = make("ChevronLeft", <path d="m15 6-6 6 6 6" />);
export const IconChevronsUpDown = make("ChevronsUpDown", <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />);
export const IconClose = make("Close", <path d="M18 6 6 18M6 6l12 12" />);
export const IconCheck = make("Check", <path d="M20 6 9 17l-5-5" />);
export const IconPlus = make("Plus", <path d="M12 5v14M5 12h14" />);
export const IconMinus = make("Minus", <path d="M5 12h14" />);
export const IconSettings = make(
  "Settings",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>,
);
export const IconSidebar = make(
  "Sidebar",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="M9.5 4.5v15M15.5 10l-2 2 2 2" />
  </>,
);
export const IconSparkle = make(
  "Sparkle",
  <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />,
  true,
);
export const IconArrowUp = make("ArrowUp", <path d="M12 19V5M6 11l6-6 6 6" />);
export const IconArrowRight = make("ArrowRight", <path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowLeft = make("ArrowLeft", <path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconArrowUpRight = make("ArrowUpRight", <path d="M7 17 17 7M8 7h9v9" />);
export const IconCopy = make(
  "Copy",
  <>
    <rect x="9" y="9" width="12" height="12" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
);
export const IconRetry = make("Retry", <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />);
export const IconThumbUp = make(
  "ThumbUp",
  <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z" />,
);
export const IconThumbDown = make(
  "ThumbDown",
  <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z" />,
);
export const IconPause = make(
  "Pause",
  <>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </>,
);
export const IconPlay = make(
  "Play",
  <path d="M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5Z" />,
);
export const IconMail = make(
  "Mail",
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </>,
);
export const IconSend = make("Send", <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />);
export const IconBuilding = make(
  "Building",
  <>
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h8A1.5 1.5 0 0 1 15 5.5V21M15 9h3.5a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18" />
    <path d="M8 8h3M8 12h3M8 16h3" />
  </>,
);
export const IconMegaphone = make(
  "Megaphone",
  <>
    <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4.5V4.5L7 9H5a1 1 0 0 0-1 1Z" />
    <path d="M19 9a4 4 0 0 1 0 6M8 15l1 5h3l-1-4.5" />
  </>,
);
export const IconInbox = make(
  "Inbox",
  <>
    <path d="M3 13h5l1.5 3h5L16 13h5" />
    <path d="M5.5 5h13L21 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V13l2.5-8Z" />
  </>,
);
export const IconCalendar = make(
  "Calendar",
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const IconList = make(
  "List",
  <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
);
export const IconLines = make("Lines", <path d="M4 7h16M4 12h16M4 17h10" />);
export const IconActivity = make("Activity", <path d="M3 12h4l3-8 4 16 3-8h4" />);
export const IconShield = make(
  "Shield",
  <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />,
);
export const IconGlobe = make(
  "Globe",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
);
export const IconLink = make(
  "Link",
  <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />,
);
export const IconSun = make(
  "Sun",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const IconMoon = make(
  "Moon",
  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />,
);
export const IconTrash = make(
  "Trash",
  <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />,
);
export const IconFilter = make("Filter", <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z" />);
export const IconMore = make(
  "More",
  <>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </>,
);
export const IconWarning = make(
  "Warning",
  <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
);
export const IconInfo = make(
  "Info",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4.5M12 8h.01" />
  </>,
);
export const IconAlert = make(
  "Alert",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V13M12 16.5h.01" />
  </>,
);
export const IconCheckCircle = make(
  "CheckCircle",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);
export const IconClock = make(
  "Clock",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const IconTarget = make(
  "Target",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </>,
);
export const IconBolt = make("Bolt", <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />);
export const IconDoc = make(
  "Doc",
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </>,
);
export const IconCode = make("Code", <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />);
export const IconTerminal = make("Terminal", <path d="m4 7 5 5-5 5M12 18h8" />);
export const IconEye = make(
  "Eye",
  <>
    <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IconLogout = make(
  "Logout",
  <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10" />,
);
export const IconReply = make("Reply", <path d="m9 10-5 5 5 5M20 4v7a4 4 0 0 1-4 4H4" />);
export const IconAt = make(
  "At",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </>,
);
export const IconSlash = make("Slash", <path d="M15 4 9 20" />);
export const IconStop = make("Stop", <rect x="6" y="6" width="12" height="12" rx="2" />, true);
export const IconCompass = make(
  "Compass",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </>,
);
export const IconLayers = make(
  "Layers",
  <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5" />,
);
export const IconFunnel = make("Funnel", <path d="M3 4h18l-7 8.5V20l-4-2v-5.5L3 4Z" />);
export const IconChat = make(
  "Chat",
  <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z" />,
);
export const IconPhone = make(
  "Phone",
  <path d="M21 16.5v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.5 5.2 2 2 0 0 1 4.5 3h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.4 10.9a16 16 0 0 0 4.7 4.7l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
);
export const IconHash = make("Hash", <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />);
export const IconRocket = make(
  "Rocket",
  <>
    <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1Z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2Z" />
    <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
  </>,
);
export const IconX = make(
  "XBrand",
  <path d="M17.8 3h3l-6.6 7.6L22 21h-6.1l-4.8-6.2L5.6 21h-3l7.1-8.1L2.2 3h6.2l4.3 5.7L17.8 3Zm-1 16.2h1.7L7.3 4.7H5.5l11.3 14.5Z" />,
  true,
);
export const IconInstagram = make(
  "Instagram",
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.5 6.5h.01" />
  </>,
);
export const IconGrid = make(
  "Grid",
  <>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
  </>,
);
export const IconWand = make(
  "Wand",
  <path d="m15 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM4 20 14 10M19 13l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5.5-1Z" />,
);
export const IconQuestion = make(
  "Question",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
  </>,
);
export const IconSort = make(
  "Sort",
  <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />,
);
export const IconUser = make(
  "User",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c.7-3.8 3.9-6.5 8-6.5s7.3 2.7 8 6.5" />
  </>,
);
export const IconBan = make(
  "Ban",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </>,
);
export const IconRefresh = make(
  "Refresh",
  <path d="M20 11a8 8 0 0 0-14.7-4.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.3L20 16M20 20v-4h-4" />,
);
export const IconLock = make(
  "Lock",
  <>
    <rect x="5" y="11" width="14" height="9.5" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
