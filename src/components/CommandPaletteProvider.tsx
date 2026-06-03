import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";

/** Shared command-palette state so both the Sidebar (desktop) and TopBar (mobile)
 *  can trigger it, and ⌘K works globally — with a single mounted instance. */
const Ctx = createContext<{ open: () => void }>({ open: () => {} });

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open: () => setIsOpen(true) }}>
      {children}
      <CommandPalette open={isOpen} onClose={() => setIsOpen(false)} />
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCommandPalette() {
  return useContext(Ctx);
}
