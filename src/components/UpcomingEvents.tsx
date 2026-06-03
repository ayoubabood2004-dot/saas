import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  Stethoscope, Pill, Syringe, CalendarClock, Scissors, Utensils, BedDouble, Bell,
  Plus, Trash2, CalendarDays,
} from "lucide-react";
import type { EventCategory, Pet, Reminder } from "@/types";
import type { UpcomingEvent } from "@/lib/events";
import { dayBucket } from "@/lib/events";
import { repo } from "@/lib/repo";
import { Modal } from "./Modal";
import { Button, CardTitle, Card } from "./ui";
import { formatDate, formatHM, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

export const EVENT_META: Record<EventCategory, { icon: typeof Bell; cls: string }> = {
  appointment: { icon: Stethoscope, cls: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" },
  medication: { icon: Pill, cls: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300" },
  vaccine: { icon: Syringe, cls: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300" },
  recheck: { icon: CalendarClock, cls: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  grooming: { icon: Scissors, cls: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300" },
  feeding: { icon: Utensils, cls: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" },
  boarding: { icon: BedDouble, cls: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" },
  reminder: { icon: Bell, cls: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300" },
};

/** Reusable on/off switch (logical start-* so it mirrors correctly in RTL). */
function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} role="switch" aria-checked={on} className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-brand-600" : "bg-line-strong")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "start-[22px]" : "start-0.5")} />
    </button>
  );
}

function whenLabel(e: UpcomingEvent, now: number, t: (k: string) => string, lang: string): string {
  const bucket = dayBucket(e.dateISO, now);
  const datePart = bucket === "today" ? t("events.today") : bucket === "tomorrow" ? t("events.tomorrow") : formatDate(`${e.dateISO}T12:00:00`, lang);
  const timePart = e.time ? formatHM(e.time, lang) : e.urgent ? t("events.now") : "";
  return [datePart, timePart].filter(Boolean).join(" · ");
}

interface Props {
  events: UpcomingEvent[];
  reminders: Reminder[];
  scope: { ownerId?: string | null };
  pets: Pet[];
  now: number;
  loading?: boolean;
  max?: number;
  onChanged: () => void;
  onEventClick?: (e: UpcomingEvent) => void;
}

export function UpcomingEvents({ events, reminders, scope, pets, now, loading, max = 6, onChanged, onEventClick }: Props) {
  const { t, i18n } = useTranslation();
  const [manageOpen, setManageOpen] = useState(false);
  const shown = events.slice(0, max);

  return (
    <Card padded>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle>{t("events.title")}</CardTitle>
        <button
          onClick={() => { playTap(); setManageOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-surface-2 hover:text-brand-600"
        >
          <Plus size={14} /> {t("events.addReminder")}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-surface-2" />)}</div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300"><CalendarDays size={22} /></span>
          <p className="text-sm font-medium text-ink">{t("events.empty")}</p>
          <p className="text-xs text-ink-subtle">{t("events.emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {shown.map((e) => {
              const meta = EVENT_META[e.category];
              const Icon = meta.icon;
              const clickable = !!(e.petLink && e.petId && onEventClick);
              return (
                <motion.li
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                  onClick={clickable ? () => onEventClick!(e) : undefined}
                  className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5", clickable && "cursor-pointer transition hover:border-brand-200 hover:bg-surface-2 dark:hover:border-brand-500/40")}
                >
                  <span className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-xl", meta.cls)}>
                    <Icon size={17} />
                    {e.urgent && <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-danger-500 ring-2 ring-surface-1" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{e.title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {e.petName ? `${e.petName} · ` : ""}{whenLabel(e, now, t, i18n.language)}
                    </p>
                  </div>
                  {e.urgent && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">{t("events.due")}</span>}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <RemindersModal open={manageOpen} onClose={() => setManageOpen(false)} reminders={reminders} scope={scope} pets={pets} now={now} onChanged={onChanged} />
    </Card>
  );
}

const REMINDER_CATEGORIES: EventCategory[] = ["recheck", "medication", "vaccine", "grooming", "reminder"];

function RemindersModal({ open, onClose, reminders, scope, pets, now, onChanged }: {
  open: boolean; onClose: () => void; reminders: Reminder[]; scope: { ownerId?: string | null }; pets: Pet[]; now: number; onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>("recheck");
  const [date, setDate] = useState(new Date(now + 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState("09:00");
  const [petId, setPetId] = useState("");
  const [recurring, setRecurring] = useState<NonNullable<Reminder["recurring"]>>("none");

  useEffect(() => {
    if (open) { setAdding(false); setTitle(""); setCategory("recheck"); setDate(new Date(now + 86400000).toISOString().slice(0, 10)); setTime("09:00"); setPetId(""); setRecurring("none"); }
  }, [open, now]);

  const toggle = async (r: Reminder) => { playTap(); await repo.updateReminder(r.id, { enabled: !r.enabled }); onChanged(); };
  const remove = async (r: Reminder) => { await repo.removeReminder(r.id); onChanged(); };
  const add = async () => {
    if (!title.trim()) return;
    const pet = pets.find((p) => p.id === petId);
    await repo.addReminder({
      owner_id: scope.ownerId ?? undefined,
      pet_id: petId || undefined,
      pet_name: pet?.name,
      category, title: title.trim(), date, time, recurring,
      enabled: true,
    });
    playSuccess();
    setAdding(false); setTitle(""); setPetId("");
    onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("events.remindersTitle")}>
      <div className="space-y-3">
        {reminders.length === 0 && !adding && (
          <p className="py-2 text-center text-sm text-ink-subtle">{t("events.noReminders")}</p>
        )}
        {reminders.map((r) => {
          const meta = EVENT_META[r.category];
          const Icon = meta.icon;
          return (
            <div key={r.id} className={cn("flex items-center gap-3 rounded-2xl border border-line p-2.5 transition", r.enabled ? "bg-surface-1" : "bg-surface-2 opacity-60")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", meta.cls)}><Icon size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                <p className="truncate text-xs text-ink-muted">
                  {r.pet_name ? `${r.pet_name} · ` : ""}{formatDate(`${r.date}T12:00:00`, i18n.language)}{r.time ? ` · ${formatHM(r.time, i18n.language)}` : ""}
                  {r.recurring && r.recurring !== "none" ? ` · ${t(`events.recur.${r.recurring}`)}` : ""}
                </p>
              </div>
              <Switch on={r.enabled} onClick={() => toggle(r)} />
              <button onClick={() => remove(r)} aria-label={t("common.delete")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15"><Trash2 size={15} /></button>
            </div>
          );
        })}

        {adding ? (
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-3">
            <div>
              <label className="label">{t("events.reminderTitle")}</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={t("events.reminderPlaceholder")} />
            </div>
            <div>
              <label className="label">{t("events.category")}</label>
              <div className="flex flex-wrap gap-2">
                {REMINDER_CATEGORIES.map((c) => {
                  const Icon = EVENT_META[c].icon;
                  return (
                    <button key={c} onClick={() => setCategory(c)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition", category === c ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-1")}>
                      <Icon size={13} /> {t(`events.cat.${c}`)}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t("diet.time")}</label><input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} /></div>
              <div><label className="label">{t("events.date")}</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            {pets.length > 0 && (
              <div>
                <label className="label">{t("events.pet")}</label>
                <select className="input" value={petId} onChange={(e) => setPetId(e.target.value)}>
                  <option value="">{t("events.noPet")}</option>
                  {pets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">{t("events.repeat")}</label>
              <select className="input" value={recurring} onChange={(e) => setRecurring(e.target.value as NonNullable<Reminder["recurring"]>)}>
                <option value="none">{t("events.recur.none")}</option>
                <option value="daily">{t("events.recur.daily")}</option>
                <option value="weekly">{t("events.recur.weekly")}</option>
                <option value="monthly">{t("events.recur.monthly")}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={add} disabled={!title.trim()}>{t("common.add")}</Button>
              <Button variant="ghost" onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="w-full" leftIcon={<Plus size={16} />} onClick={() => setAdding(true)}>{t("events.addReminder")}</Button>
        )}
      </div>
    </Modal>
  );
}
