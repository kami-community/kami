"use client";

import { useSyncExternalStore } from "react";
import Segmented from "@/components/ui/Segmented";
import { IconMoon, IconSun } from "@/components/ui/icons";

type Theme = "light" | "dark";
const KEY = "kami_theme";

function read(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Apply a theme in one clean repaint (transitions frozen for a frame). */
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching")),
  );
}

/** Inline script for <head>: applies the saved (or system) theme before paint. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`;

/** Sun / moon segmented switch. */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  return (
    <Segmented
      label="Color theme"
      value={theme}
      onChange={setTheme}
      options={[
        { value: "light", label: <IconSun size={13} />, ariaLabel: "Light mode" },
        { value: "dark", label: <IconMoon size={13} />, ariaLabel: "Dark mode" },
      ]}
    />
  );
}
