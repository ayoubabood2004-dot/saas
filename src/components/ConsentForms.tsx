import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { FileSignature, Printer, X, Scissors, Syringe, ReceiptText } from "lucide-react";
import type { Pet } from "@/types";
import { Button, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { overlayVariants, dialogVariants } from "@/lib/motion";
import { useAuth } from "@/contexts/AuthContext";
import { getClinic, getActiveClinicId } from "@/lib/clinics";
import { getClinicName, getClinicLogo } from "@/lib/settings";
import { buildConsentHTML, openConsentPrint, consentFormLabel, type ConsentFormType, type ConsentOptions } from "@/lib/consentForms";
import { repo } from "@/lib/repo";

/**
 * Consent-form studio: pick a form (Surgery / Anesthesia / Treatment & Cost) and a
 * language (Arabic / English), preview the official A4 paper live, then print it.
 * The preview iframe renders the exact same HTML the print window uses, so what you
 * see is what prints. Launched from a patient record — prefilled with their data.
 */
export function ConsentForms({ open, onClose, pet }: { open: boolean; onClose: () => void; pet: Pet }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();

  const [form, setForm] = useState<ConsentFormType>("surgery");
  const [lang, setLang] = useState<"ar" | "en">(i18n.language.startsWith("ar") ? "ar" : "en");
  const [estimate, setEstimate] = useState("");

  // Reset to the app language each time the studio opens.
  useEffect(() => { if (open) setLang(i18n.language.startsWith("ar") ? "ar" : "en"); }, [open, i18n.language]);

  // Lock background scroll + close on Escape while the studio is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  const opts: ConsentOptions = useMemo(() => {
    const clinic = getClinic(user?.clinic_id ?? getActiveClinicId());
    // Owner location mirrors the animal record: area (المنطقة) → governorate (المحافظة).
    const ownerAddress = [pet.owner_area?.trim(), pet.owner_governorate?.trim()].filter(Boolean).join("، ") || null;
    return {
      form,
      lang,
      clinic: {
        // The clinic's configured name (Settings → هوية العيادة); falls back to the
        // demo clinic record, never the website/brand text.
        name: getClinicName() || clinic?.name || user?.full_name || "",
        phone: clinic?.phone ?? user?.phone ?? null,
        city: clinic?.city ?? null,
        license: clinic?.license ?? null,
      },
      vetName: user?.full_name ?? null,
      owner: { name: pet.owner_name, phone: pet.owner_phone, address: ownerAddress },
      patient: {
        name: pet.name, serial: pet.serial, species: pet.species,
        breed: pet.breed, sex: pet.sex, dob: pet.dob, color: pet.color,
      },
      estimate: estimate.trim() || null,
      logoUrl: getClinicLogo(),
    };
  }, [form, lang, estimate, pet, user]);

  const html = useMemo(() => buildConsentHTML(opts), [opts]);

  const print = () => {
    playTap();
    const ok = openConsentPrint(opts);
    if (!ok) toast.error(t("consent.popupBlocked", "Allow pop-ups to print"), t("consent.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site."));
    else void repo.logClientEvent("consent.print", { pet: pet.name, form }); // activity trail
  };

  const FORMS: { id: ConsentFormType; icon: typeof Scissors }[] = [
    { id: "surgery", icon: Scissors },
    { id: "anesthesia", icon: Syringe },
    { id: "treatment", icon: ReceiptText },
  ];

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 no-print sm:items-center sm:p-4">
          <motion.div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" variants={overlayVariants} initial="initial" animate="animate" exit="exit" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("consent.title", "Consent forms")}
            className="relative flex w-full flex-col overflow-hidden border border-line bg-surface-1 shadow-raised sm:max-h-[94vh] sm:max-w-5xl sm:rounded-3xl"
            variants={dialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-line bg-surface-1/90 p-4 backdrop-blur">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><FileSignature size={20} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-bold tracking-tighter2 text-ink">{t("consent.title", "Consent forms")}</h2>
                <p className="truncate text-xs text-ink-muted">{pet.name}{pet.owner_name ? ` · ${pet.owner_name}` : ""}</p>
              </div>
              <Button size="sm" leftIcon={<Printer size={16} />} onClick={print}>{t("consent.print", "Print")}</Button>
              <button onClick={onClose} aria-label={t("common.close")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-ink"><X size={20} /></button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3">
              {/* Form type */}
              <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
                {FORMS.map((f) => {
                  const Icon = f.icon;
                  const active = form === f.id;
                  return (
                    <button key={f.id} onClick={() => { playTap(); setForm(f.id); }} className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-surface-1 text-brand-700 shadow-card dark:text-brand-300" : "text-ink-muted hover:text-ink")}>
                      <Icon size={15} /> <span className="hidden sm:inline">{consentFormLabel(f.id, lang)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Language */}
              <div className="flex items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1">
                {(["ar", "en"] as const).map((l) => (
                  <button key={l} onClick={() => { playTap(); setLang(l); }} className={cn("rounded-xl px-3.5 py-2 text-sm font-semibold transition", lang === l ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
                    {l === "ar" ? "العربية" : "English"}
                  </button>
                ))}
              </div>

              {/* Estimated cost (treatment form only) */}
              {form === "treatment" && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-ink-muted">{t("consent.estimate", "Estimated cost")}</span>
                  <input
                    value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                    placeholder={t("consent.estimatePlaceholder", "e.g. 150,000 IQD")}
                    className="input h-9 w-44 py-1.5 text-sm"
                  />
                </label>
              )}
            </div>

            {/* A4 preview — identical to the printed output */}
            <div className="grid flex-1 justify-center overflow-auto bg-surface-2 p-4 sm:p-6">
              <iframe
                title={t("consent.previewTitle", "Form preview")}
                srcDoc={html}
                className="h-[1123px] w-[794px] max-w-full shrink-0 rounded-lg border border-line bg-white shadow-card"
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
