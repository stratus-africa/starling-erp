import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "nimbus" | "light" | "dark";
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}
const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  const applyTheme = (nextTheme: Theme) => {
    const root = document.documentElement;
    root.classList.toggle("dark", nextTheme === "dark");
    root.classList.toggle("nimbus", nextTheme === "nimbus");
    if (typeof window !== "undefined") {
      localStorage.setItem("erp-theme", nextTheme);
    }
  };

  useEffect(() => {
    const stored = (typeof window !== "undefined" &&
      localStorage.getItem("erp-theme")) as Theme | null;
    if (stored === "nimbus" || stored === "dark" || stored === "light") {
      setTheme(stored);
      return;
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Ctx.Provider
      value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
