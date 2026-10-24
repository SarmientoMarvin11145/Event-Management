"use client";

import { useEffect } from "react";
import { setLocale } from "@/lib/locale";

export default function ThemeSync({ theme, locale = "en" }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const useDark = theme === "dark" || (theme === "system" && media.matches);
      if (useDark) {
        document.documentElement.dataset.theme = "dark";
      } else {
        delete document.documentElement.dataset.theme;
      }
    };
    applyTheme();
    if (theme !== "system") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale]);

  return null;
}
