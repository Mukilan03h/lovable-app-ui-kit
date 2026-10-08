import { MotionConfig } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";
export type Accent = "violet" | "blue" | "emerald" | "amber" | "rose" | "slate";
export type TextSize = "sm" | "md" | "lg";
export type ChatBackground = "none" | "aurora" | "grid" | "dots" | "dunes";

export const accents: { id: Accent; label: string; swatch: string }[] = [
  { id: "violet", label: "Violet", swatch: "oklch(0.58 0.22 292)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.58 0.19 255)" },
  { id: "emerald", label: "Emerald", swatch: "oklch(0.6 0.15 160)" },
  { id: "amber", label: "Amber", swatch: "oklch(0.7 0.16 65)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.6 0.21 12)" },
  { id: "slate", label: "Slate", swatch: "oklch(0.5 0.03 260)" },
];

type Prefs = {
  mode: ThemeMode;
  accent: Accent;
  textSize: TextSize;
  chatBackground: ChatBackground;
  reduceMotion: boolean;
};

const defaults: Prefs = {
  mode: "dark",
  accent: "violet",
  textSize: "md",
  chatBackground: "none",
  reduceMotion: false,
};

type ThemeValue = Prefs & {
  /** Resolved light/dark theme after applying the system preference. */
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
};

const ThemeContext = createContext<ThemeValue>({
  ...defaults,
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
  setPref: () => {},
});

const STORAGE_KEY = "enaz-theme";
const PREFS_KEY = "enaz-appearance";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PREFS_KEY);
      const legacy = window.localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as Partial<Prefs>) : {};
      setPrefs({
        ...defaults,
        ...(legacy === "light" || legacy === "dark" ? { mode: legacy } : {}),
        ...parsed,
      });
    } catch {
      // Ignore unreadable storage; defaults apply.
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = prefs.mode === "system" ? (systemDark ? "dark" : "light") : prefs.mode;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    root.dataset["accent"] = prefs.accent;
    root.dataset["textSize"] = prefs.textSize;
    root.dataset["reduceMotion"] = String(prefs.reduceMotion);
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be blocked; the session still works.
    }
  }, [theme, prefs]);

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
  }, []);
  const setTheme = useCallback((t: Theme) => setPref("mode", t), [setPref]);
  const toggle = useCallback(
    () => setPref("mode", theme === "dark" ? "light" : "dark"),
    [setPref, theme],
  );

  const value = useMemo(
    () => ({ ...prefs, theme, toggle, setTheme, setPref }),
    [prefs, theme, toggle, setTheme, setPref],
  );

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
