import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Stethoscope, HeartPulse, LayoutGrid, ClipboardCheck, Check, X } from "lucide-react";
import type { Admission, PatientCondition, Pet } from "@/types";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { PetAvatar } from "@/components/PetAvatar";
import { cageStudio } from "@/components/cage3d/store";
import { cageSortKey } from "@/lib/cageOrder";
import { cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * «فتح طبلة» — الطبلة تُفتح من صفحة الطبلات نفسها، بلا مرور بخطة التشخيص.
 *
 * الدكتور عنده حيوان قدّامه ويريد يبدي علاجه هسة: ورقة واحدة يرفق بها
 * الحيوان، يحدد نوع الطبلة (يومية/فندقة علاجية)، حالته (ممتازة/جيدة/حرجة —
 * نفس مفردات الفرز اللوني بالبطاقات)، التشخيص/السبب (عنوان الطبلة)، وقفصاً
 * فاضياً إن أراد. وبالحفظ يهبط مباشرةً على ورقة علاج الحيوان وتنفتح له
 * البروتوكولات ليحدد الأدوية والأوقات — نفس الأدوات المعتمدة، بلا تكرار.
 * ==========================================================================*/

export interface OpenBoardDraft {
  petId: string;
  kind: Extract<Admission["kind"], "treatment" | "treatment_boarding">;
  condition: PatientCondition;
  reason: string;
  cage: string;
  /** افتح البروتوكولات فور الإنشاء لتحديد الأدوية. */
  withProtocol: boolean;
}

export function OpenBoardSheet({ open, pets, actives, busy, onClose, onCreate, onFocusExisting }: {
  open: boolean;
  pets: Record<string, Pet | undefined>;
  /** الرقود النشطة — بها نعرف من عنده طبلة أصلاً ومن يشغل أي قفص. */
  actives: Admission[];
  busy: boolean;
  onClose: () => void;
  onCreate: (draft: OpenBoardDraft) => void;
  /** الحيوان المختار عنده طبلة نشطة أصلاً — وديني عليها بدل الازدواج. */
  onFocusExisting: (petId: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [petId, setPetId] = useState<string | null>(null);
  const [kind, setKind] = useState<OpenBoardDraft["kind"]>("treatment");
  const [condition, setCondition] = useState<PatientCondition>("good");
  const [reason, setReason] = useState("");
  const [cage, setCage] = useState("");
  const [withProtocol, setWithProtocol] = useState(true);

  useEffect(() => {
    if (!open) return;
    setQ(""); setPetId(null); setKind("treatment"); setCondition("good");
    setReason(""); setCage(""); setWithProtocol(true);
  }, [open]);

  const admittedPet = useMemo(() => {
    const m = new Map<string, Admission>();
    for (const a of actives) if (a.status !== "discharged" && !m.has(a.pet_id)) m.set(a.pet_id, a);
    return m;
  }, [actives]);

  /* الأقفاص الفاضية — من تخطيط غرفة الأقفاص نفسه، بترتيب الغرف */
  const freeCages = useMemo(() => {
    if (!open) return [] as string[];
    const taken = new Set(actives.filter((a) => a.status !== "discharged").map((a) => (a.cage ?? "").trim().toLowerCase()).filter(Boolean));
    return cageStudio.get().cages
      .map((c) => c.code)
      .filter((c) => !taken.has(c.trim().toLowerCase()))
      .sort((a, b) => cageSortKey(a).localeCompare(cageSortKey(b)));
  }, [open, actives]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const all = Object.values(pets).filter((p): p is Pet => !!p);
    const f = query
      ? all.filter((p) => p.name?.toLowerCase().includes(query) || p.owner_name?.toLowerCase().includes(query) || (p.serial ?? "").includes(query))
      : all;
    // من بلا طبلة أولاً — هم المقصودون بفتح طبلة جديدة
    return f.sort((a, b) => Number(admittedPet.has(a.id)) - Number(admittedPet.has(b.id))
      || (a.name ?? "").localeCompare(b.name ?? "", "ar")).slice(0, 6);
  }, [q, pets, admittedPet]);

  const selected = petId ? pets[petId] : null;

  const CONDITIONS: { id: PatientCondition; label: string; cls: string; on: string }[] = [
    { id: "excellent", label: t("charts.condExcellent", "ممتازة"), cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300", on: "bg-success-600 text-white shadow-soft" },
    { id: "good", label: t("charts.condGood", "جيدة"), cls: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", on: "bg-sky-600 text-white shadow-soft" },
    { id: "critical", label: t("charts.condCritical", "حرجة"), cls: "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300", on: "bg-danger-600 text-white shadow-soft" },
  ];

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={t("charts.openBoard", "فتح طبلة")}>
      <div className="space-y-4">
        {/* ١) الحيوان */}
        <div>
          <label className="label">{t("charts.obPet", "١ — الحيوان")}</label>
          {selected ? (
            <div className="flex items-center gap-3 rounded-2xl border border-brand-300 bg-brand-50/50 p-2.5 dark:border-brand-500/40 dark:bg-brand-500/10" data-obselected>
              <PetAvatar pet={selected} size={40} className="shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink" dir="auto">{selected.name}</p>
                <p className="truncate text-2xs text-ink-subtle">{selected.owner_name || "—"}</p>
              </div>
              <button type="button" onClick={() => { playTap(); setPetId(null); }}
                aria-label={t("common.cancel", "إلغاء")}
                className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-danger-600">
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input className="input ltr:pl-9 rtl:pr-9" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder={t("charts.obPetPh", "اسم الحيوان أو صاحبه أو رقمه…")} data-obsearch />
              </div>
              <div className="mt-1.5 space-y-1.5">
                {rows.map((p) => {
                  const has = admittedPet.has(p.id);
                  return (
                    <button key={p.id} type="button" data-obpick={p.id}
                      onClick={() => {
                        playTap();
                        if (has) { onFocusExisting(p.id); return; }
                        setPetId(p.id);
                      }}
                      className={cn("flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface-1 p-2 text-start transition hover:border-brand-300",
                        has && "opacity-75")}>
                      <PetAvatar pet={p} size={34} className="shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink" dir="auto">{p.name}</span>
                        <span className="block truncate text-2xs text-ink-subtle">{p.owner_name || "—"}</span>
                      </span>
                      {has
                        ? <span className="chip shrink-0 bg-warn-50 text-2xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">{t("charts.obHasBoard", "عنده طبلة — افتحها")}</span>
                        : <span className="chip shrink-0 bg-surface-2 text-2xs font-bold text-ink-muted">{t("charts.obAttach", "أرفقه")}</span>}
                    </button>
                  );
                })}
                {rows.length === 0 && (
                  <p className="rounded-xl bg-surface-2 p-4 text-center text-xs text-ink-subtle">{t("charts.obNoMatch", "ما لقينا حيواناً بهذا الاسم — سجّله من الاستقبال أولاً.")}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* ٢) نوع الطبلة */}
        <div>
          <label className="label">{t("charts.obKind", "٢ — نوع الطبلة")}</label>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { id: "treatment" as const, label: t("charts.bucketDaily", "الطبلات اليومية"), icon: Stethoscope },
              { id: "treatment_boarding" as const, label: t("charts.bucketCareBoarding", "طبلات الفندقة العلاجية"), icon: HeartPulse },
            ]).map((k) => (
              <button key={k.id} type="button" data-obkind={k.id}
                onClick={() => { playTap(); setKind(k.id); }}
                className={cn("flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-bold transition",
                  kind === k.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                <k.icon size={14} /> {k.label}
              </button>
            ))}
          </div>
        </div>

        {/* ٣) حالة الحيوان — نفس مفردات الفرز اللوني بالبطاقات */}
        <div>
          <label className="label">{t("charts.obCondition", "٣ — حالة الحيوان الآن")}</label>
          <div className="grid grid-cols-3 gap-1.5">
            {CONDITIONS.map((c) => (
              <button key={c.id} type="button" data-obcond={c.id}
                onClick={() => { playTap(); setCondition(c.id); }}
                className={cn("rounded-xl px-2 py-2.5 text-xs font-extrabold transition", condition === c.id ? c.on : c.cls)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* ٤) التشخيص/السبب + القفص */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="label">{t("charts.obReason", "٤ — التشخيص أو السبب")}</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={t("charts.obReasonPh", "مثال: قطط — نقص مناعة")} data-obreason />
          </div>
          <div>
            <label className="label">{t("charts.obCage", "القفص")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
            <select className="input" value={cage} onChange={(e) => setCage(e.target.value)} data-obcage>
              <option value="">{t("charts.obNoCage", "بلا قفص")}</option>
              {freeCages.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ٥) الأدوية — البروتوكولات تنفتح فور الإنشاء */}
        <button type="button" data-obproto
          onClick={() => { playTap(); setWithProtocol((v) => !v); }}
          className={cn("flex w-full items-center gap-2.5 rounded-2xl border p-3 text-start transition",
            withProtocol ? "border-brand-300 bg-brand-50/50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-line bg-surface-1")}>
          <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition",
            withProtocol ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface-2 text-transparent")}>
            <Check size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><ClipboardCheck size={15} className="text-brand-600" /> {t("charts.obWithProto", "افتح البروتوكولات بعد الإنشاء")}</span>
            <span className="block text-2xs text-ink-subtle">{t("charts.obWithProtoHint", "تحدد الأدوية والأوقات فوراً — من البروتوكولات الجاهزة أو دليل الجرعات")}</span>
          </span>
        </button>

        <Button className="w-full" size="lg" data-obcreate loading={busy} disabled={!petId}
          leftIcon={<LayoutGrid size={17} />}
          onClick={() => { if (petId) onCreate({ petId, kind, condition, reason: reason.trim(), cage, withProtocol }); }}>
          {t("charts.obCreate", "افتح الطبلة")}
        </Button>
      </div>
    </Modal>
  );
}
