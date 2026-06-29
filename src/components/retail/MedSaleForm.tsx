import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pill, Syringe, Tag } from "lucide-react";
import type { Species } from "@/types";
import { MedicationForm, VaccinationForm, type MedicalDraft } from "@/components/MedicalEntry";
import { hydrateMeds } from "@/lib/meds";
import { hydrateVaccines } from "@/lib/vaccines";
import { cn, IQD } from "@/lib/utils";
import { playTap, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";

/**
 * The retail "الأدوية" tab. Reuses the EXACT same medication/vaccination entry
 * forms as the patient's medical record (cascading drug picker, species-aware
 * vaccine list with the booster scheduler, clinic-custom catalog merge), then adds
 * a sale price + quantity. On "أضف إلى السلة" it hands the medical draft + price up
 * to the cart; on checkout SaleBuilder bills it AND (when the sale is for a known
 * patient) writes the same record into the animal's file via persistMedicalEntries.
 */
export function MedSaleForm({ species, onAddLine }: {
  /** Patient species when the sale was launched from a record — locks the vaccine filter. */
  species?: Species;
  onAddLine: (draft: MedicalDraft, price: number, qty: number) => void;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"medication" | "vaccination">("medication");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [draftSpecies, setDraftSpecies] = useState<Species>(species ?? "dog");

  // Re-pull the clinic catalog on open so Settings-added meds/vaccines appear instantly.
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([hydrateMeds(), hydrateVaccines()]).then(() => { if (alive) setCatalogVersion((v) => v + 1); });
    return () => { alive = false; };
  }, []);

  const activeSpecies = species ?? draftSpecies;

  const handleAdd = (draft: MedicalDraft) => {
    const p = Number(price);
    if (Number.isNaN(p) || p <= 0) { playWarning(); toast.error("أدخل سعر البيع", "حدّد سعراً موجباً قبل الإضافة إلى السلة."); return; }
    onAddLine(draft, p, Math.max(1, qty));
    setPrice(""); setQty(1);
  };

  return (
    <div className="space-y-5">
      {/* Medication | Vaccination toggle — same control as the medical record */}
      <div className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
        {([
          { v: "medication", label: "دواء", icon: <Pill size={16} /> },
          { v: "vaccination", label: "لقاح", icon: <Syringe size={16} /> },
        ] as const).map((o) => (
          <button
            key={o.v}
            onClick={() => { playTap(); setMode(o.v); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
              mode === o.v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {o.icon}{o.label}
          </button>
        ))}
      </div>

      {/* Sale price + quantity (applied to the item added below) */}
      <div className="rounded-2xl border border-line bg-surface-1 p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <Tag size={14} className="text-brand-600" /> سعر البيع والكمية
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-bold text-ink-subtle ltr:left-3 rtl:right-3">{IQD}</span>
            <input
              type="number" min="0" step="1" inputMode="numeric"
              value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="سعر الوحدة" className="input ltr:pl-10 rtl:pr-10 tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-1">
            <button onClick={() => { playTap(); setQty((q) => Math.max(1, q - 1)); }} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-3">−</button>
            <span className="w-7 text-center text-sm font-bold tabular-nums text-ink">{qty}</span>
            <button onClick={() => { playTap(); setQty((q) => q + 1); }} className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-3">+</button>
          </div>
        </div>
      </div>

      {/* The reused medical-record entry form (keyed swap for a smooth transition) */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, x: mode === "medication" ? -10 : 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {mode === "medication"
          ? <MedicationForm onAdd={handleAdd} version={catalogVersion} addLabel="أضف إلى السلة" />
          : <VaccinationForm species={activeSpecies} hasSpeciesProp={!!species} draftSpecies={draftSpecies} setDraftSpecies={setDraftSpecies} onAdd={handleAdd} version={catalogVersion} addLabel="أضف إلى السلة" />}
      </motion.div>
    </div>
  );
}
