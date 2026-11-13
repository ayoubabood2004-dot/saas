/* ============================================================================
 * الطبلة بعد 0269: سعرُ كلّ جرعةٍ قبل إعطائها، وحالُها بعده، ومجموعُ ما ينتظر البيعَ للحيوان — قراءةٌ وحدها (لا كتابة).
 * الحسابُ قبل الإعطاء من doseCharge (مرآةُ المحفّز على حساب الدواء الآن)، وبعده من معلَّقه كما كُتب لحظةَ الإعطاء (petDoseCharges).
 * فشلُ قراءة المعلَّقات يُخفي «بانتظار البيع» والمجموعَ — لا مجموعَ صفرٍ عن قراءةٍ فشلت.
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import type { Product, TreatmentEntry } from "@/types";
import { useClinicDrugs } from "./clinicDrugs";
import { drugKey } from "./medIndex";
import { drugBills, sheetBill, type DoseProduct, type SheetBill, type SheetCharge } from "./doseBilling";
import { repo } from "./repo";

export interface DoseSheet {
  billOf(tx: TreatmentEntry): SheetBill | null;
  /** معلَّقاتُ الحيوان كلُّها (لا أيامُ الطبلة المعروضة وحدها)؛ null = القراءةُ فشلت أو لم تصل. */
  pending: { count: number; total: number } | null;
}

export function useDoseSheet(petId: string, treatments: readonly TreatmentEntry[], on: boolean): DoseSheet {
  const drugs = useClinicDrugs();
  const billed = useMemo(() => drugs.rows.filter((r) => r.archived_at == null && drugBills(r)), [drugs.rows]);
  const drugByKey = useMemo(() => new Map(billed.map((d) => [drugKey(d.name), d] as const)), [billed]);
  const needProducts = on && billed.some((d) => !!d.product_id && d.dose_price == null);
  const [products, setProducts] = useState<ReadonlyMap<string, DoseProduct>>(new Map());
  useEffect(() => {
    if (!needProducts) return;
    let live = true;
    repo.listProducts().then((l: Product[]) => { if (live) setProducts(new Map(l.map((p) => [p.id, p] as const))); },
      () => { /* swallow-ok: سعرُ المعاينة قبل الإعطاء للمادّة المربوطة وحده يغيب — لا مالَ يُكتب من هنا */ });
    return () => { live = false; };
  }, [needProducts]);

  // تُعاد القراءةُ حين تتبدّل جرعاتُ الطبلة أو إعطاؤها (الإعطاءُ يكتب المعلَّقَ بمحفّزه).
  const sig = treatments.map((t) => `${t.id}${t.administered_at ? "+" : ""}`).join(",");
  const [charges, setCharges] = useState<SheetCharge[] | null>(null);
  useEffect(() => {
    if (!on) { setCharges(null); return; }
    let live = true;
    import("./doseApi").then((m) => m.petDoseCharges(petId)).then((l) => { if (live) setCharges(l); }, () => { if (live) setCharges(null); });
    return () => { live = false; };
  }, [petId, on, sig]);

  const byEntry = useMemo(() => (charges ? new Map(charges.map((c) => [c.entry_id, c] as const)) : null), [charges]);
  const pending = useMemo(() => {
    if (!charges) return null;
    const p = charges.filter((c) => c.status === "pending");
    return { count: p.length, total: p.reduce((n, c) => n + c.price, 0) };
  }, [charges]);
  return {
    billOf: (tx) => (on ? sheetBill(tx, byEntry, drugByKey, products, drugKey) : null),
    pending: on ? pending : null,
  };
}
