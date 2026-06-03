import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { GraduationCap, Clock } from "lucide-react";
import { EDUCATION, EDU_CATEGORIES, type EduItem, type EduCategory, type EduLevel } from "@/lib/education";
import { Card, CardTitle } from "./ui";
import { Modal } from "./Modal";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

const CAT_CLS: Record<EduCategory, string> = {
  recovery: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  nutrition: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  preventive: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  behaviour: "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300",
  emergency: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300",
};
const LEVEL_CLS: Record<EduLevel, string> = {
  essential: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  intermediate: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  advanced: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
};

export function EducationHub() {
  const { t, i18n } = useTranslation();
  const lang: "en" | "ar" = i18n.language === "ar" ? "ar" : "en";
  const [cat, setCat] = useState<EduCategory | "all">("all");
  const [open, setOpen] = useState<EduItem | null>(null);

  const items = EDUCATION.filter((e) => cat === "all" || e.category === cat);

  return (
    <Card padded>
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle>{t("edu.title")}</CardTitle>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-subtle"><GraduationCap size={15} /> {t("edu.subtitle")}</span>
      </div>

      {/* category filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", ...EDU_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            onClick={() => { playTap(); setCat(c); }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              cat === c ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted hover:bg-surface-2",
            )}
          >
            {c === "all" ? t("edu.all") : t(`edu.cat.${c}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => (
          <motion.button
            key={e.id}
            layout
            onClick={() => { playTap(); setOpen(e); }}
            className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-1 text-start transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card dark:hover:border-brand-500/40"
          >
            <div className="flex h-20 items-center justify-center bg-gradient-to-br from-brand-50 to-sky-50 text-4xl dark:from-brand-500/10 dark:to-sky-500/5">{e.emoji}</div>
            <div className="flex flex-1 flex-col p-3">
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide", CAT_CLS[e.category])}>{t(`edu.cat.${e.category}`)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide", LEVEL_CLS[e.level])}>{t(`edu.level.${e.level}`)}</span>
              </div>
              <p className="font-display font-bold leading-snug text-ink">{e.title[lang]}</p>
              <p className="mt-1 text-xs text-ink-muted">{e.summary[lang]}</p>
              <p className="mt-2 flex items-center gap-1 text-2xs text-ink-subtle"><Clock size={11} /> {e.minutes} {t("edu.minRead")}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title[lang] ?? ""}>
        {open && (
          <div>
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-sky-50 text-3xl dark:from-brand-500/10 dark:to-sky-500/5">{open.emoji}</span>
              <div className="flex flex-wrap gap-1.5">
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide", CAT_CLS[open.category])}>{t(`edu.cat.${open.category}`)}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide", LEVEL_CLS[open.level])}>{t(`edu.level.${open.level}`)}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-ink-muted"><Clock size={11} /> {open.minutes} {t("edu.minRead")}</span>
              </div>
            </div>
            <p className="mb-3 text-sm text-ink-muted">{open.summary[lang]}</p>
            <ul className="space-y-2">
              {open.body[lang].map((line, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-ink-subtle">{t("edu.disclaimer")}</p>
          </div>
        )}
      </Modal>
    </Card>
  );
}
