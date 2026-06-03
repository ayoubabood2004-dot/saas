import { Moon, Sun } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme";
import { playTap } from "@/lib/sounds";
import { Tooltip } from "./Tooltip";

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return (
    <Tooltip label={dark ? "Light mode" : "Dark mode"}>
      <button
        onClick={() => {
          toggle();
          playTap();
        }}
        aria-label="Toggle theme"
        className="relative grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-surface-2 hover:text-ink transition overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={dark ? "moon" : "sun"}
            initial={{ y: 14, opacity: 0, rotate: -30 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: -14, opacity: 0, rotate: 30 }}
            transition={{ duration: 0.2 }}
            className="absolute"
          >
            {dark ? <Moon size={19} /> : <Sun size={19} />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}
