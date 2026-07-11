import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CalendarDays,
  ClipboardList,
  ScanLine,
  Settings as SettingsIcon,
  PlusCircle,
  PawPrint,
  CornerDownLeft,
} from "lucide-react";
import { repo } from "@/lib/repo";
import type { Pet } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { playTap } from "@/lib/sounds";
import { overlayVariants } from "@/lib/motion";

type Cmd = { id: string; label: string; icon: typeof Search; run: () => void; group: string };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [pets, setPets] = useState<Pet[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const staff = user?.role !== "owner";

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      void repo.listAllPets(user?.clinic_id ?? user?.id).then(setPets).catch(() => setPets([]));
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const go = (path: string) => {
    onClose();
    navigate(path);
    playTap();
  };

  const commands = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [];
    if (staff) {
      c.push({ id: "reception", label: "Reception · today's board", icon: CalendarDays, group: "Navigate", run: () => go("/reception") });
      c.push({ id: "records", label: "Clinic records", icon: ClipboardList, group: "Navigate", run: () => go("/records") });
      c.push({ id: "newcase", label: "New walk-in case", icon: PlusCircle, group: "Navigate", run: () => go("/new-case") });
      c.push({ id: "scan", label: "Scan passport QR", icon: ScanLine, group: "Navigate", run: () => go("/scan") });
    }
    c.push({ id: "settings", label: "Settings", icon: SettingsIcon, group: "Navigate", run: () => go("/settings") });
    return c;
  }, [staff]);

  const q = query.trim().toLowerCase();
  const filteredCmds = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;
  const matchedPets = q
    ? pets
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.owner_name || "").toLowerCase().includes(q) ||
            (p.owner_phone || "").includes(q) ||
            (p.serial || "").includes(q),
        )
        .slice(0, 6)
    : [];

  const flat: { run: () => void; node: number }[] = [
    ...filteredCmds.map((c) => ({ run: c.run, node: 0 })),
    ...matchedPets.map((p) => ({ run: () => go(`/pet/${p.id}`), node: 1 })),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, flat.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        flat[active]?.run();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, flat, active, onClose]);

  let idx = -1;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh] no-print">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 360, damping: 30 } }}
            exit={{ opacity: 0, scale: 0.98, y: -8, transition: { duration: 0.12 } }}
            className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface-1 shadow-raised"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Search size={20} className="text-ink-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search patients, owners, or jump to…"
                className="flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-subtle"
              />
              <kbd className="hidden rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-2xs font-medium text-ink-subtle sm:block">
                ESC
              </kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {flat.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-subtle">No matches.</p>}

              {filteredCmds.length > 0 && (
                <Group title="Navigate">
                  {filteredCmds.map((c) => {
                    idx++;
                    const Icon = c.icon;
                    return <Row key={c.id} active={idx === active} onClick={c.run} icon={<Icon size={18} />} label={c.label} />;
                  })}
                </Group>
              )}

              {matchedPets.length > 0 && (
                <Group title="Patients">
                  {matchedPets.map((p) => {
                    idx++;
                    return (
                      <Row
                        key={p.id}
                        active={idx === active}
                        onClick={() => go(`/pet/${p.id}`)}
                        icon={<PawPrint size={18} />}
                        label={p.name}
                        sub={`${p.species}${p.owner_name ? " · " + p.owner_name : ""}${p.serial ? " · #" + p.serial : ""}`}
                      />
                    );
                  })}
                </Group>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">{title}</p>
      {children}
    </div>
  );
}

function Row({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
        active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "text-ink hover:bg-surface-2"
      }`}
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-brand-100 text-brand-700 dark:bg-brand-500/25 dark:text-brand-100" : "bg-surface-2 text-ink-muted"}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub && <span className="block truncate text-xs text-ink-subtle">{sub}</span>}
      </span>
      {active && <CornerDownLeft size={15} className="text-ink-subtle" />}
    </button>
  );
}
