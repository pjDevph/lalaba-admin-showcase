"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ColorThemeId =
  | "lalaba"
  | "default"
  | "blue"
  | "green"
  | "rose"
  | "orange"
  | "violet";

export const COLOR_THEMES: { id: ColorThemeId; label: string; swatch: string }[] = [
  // The brand, and the default. Swatch is brand500 (#00AEEF) because that is
  // what the logo is — even though the palette itself uses the darker brand700
  // for anything carrying text. See the note in globals.css.
  { id: "lalaba", label: "Lalaba", swatch: "oklch(0.708 0.149 234.4)" },
  { id: "default", label: "Neutral", swatch: "oklch(0.205 0 0)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.55 0.18 255)" },
  { id: "green", label: "Green", swatch: "oklch(0.52 0.15 150)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.58 0.19 15)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.6 0.17 45)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.55 0.2 300)" },
];

const STORAGE_KEY = "color-theme";

type ColorThemeContextValue = {
  colorTheme: ColorThemeId;
  setColorTheme: (id: ColorThemeId) => void;
};

const ColorThemeContext = createContext<ColorThemeContextValue>({
  colorTheme: "lalaba",
  setColorTheme: () => {},
});

function readStoredColorTheme(): ColorThemeId {
  if (typeof document === "undefined") return "lalaba";
  const attr = document.documentElement.dataset.theme;
  // Falls back to the brand rather than to neutral: the blocking script above
  // has already written "lalaba" for a first-time operator, and disagreeing
  // with it here would make the picker show a selection the page is not using.
  return (COLOR_THEMES.find((t) => t.id === attr)?.id as ColorThemeId) ?? "lalaba";
}

// Mirrors the blocking inline script in layout.tsx, which already set
// `data-theme` on <html> before hydration to avoid a flash of the wrong
// palette — the lazy initializer just reads that same attribute back into
// React state (it runs once, client-side, during the initial mount; the
// server-rendered pass is never visible since nothing here depends on
// `colorTheme` for its actual DOM output, only for the attribute/context).
export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorTheme, setColorTheme] = useState<ColorThemeId>(readStoredColorTheme);

  useEffect(() => {
    if (colorTheme === "default") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = colorTheme;
    }
    localStorage.setItem(STORAGE_KEY, colorTheme);
  }, [colorTheme]);

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  );
}

export function useColorTheme(): ColorThemeContextValue {
  return useContext(ColorThemeContext);
}
