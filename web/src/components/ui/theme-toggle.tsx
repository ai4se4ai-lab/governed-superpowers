"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Toggles an explicit theme class on <html> and remembers it. With no stored
 * preference the CSS falls back to prefers-color-scheme; the first click
 * pins the opposite of whatever is currently rendered.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("gsp-theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("gsp-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="label"
      style={{ cursor: "pointer", padding: "4px 2px" }}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === null ? "····" : theme === "dark" ? "◐ dark" : "◑ light"}
    </button>
  );
}
