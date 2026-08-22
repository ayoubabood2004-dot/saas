import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  LayoutGrid, Search, UserPlus, Settings2, Plus, Trash2, Move, X, Syringe, BedDouble, DoorOpen, Check,
} from "lucide-react";
import { cageStudio, useCageStudio, codesFromPrefs, type Room3D, type CagePlacement } from "@/components/cage3d/store";
import { SPECIES_AR, SPECIES_EMOJI, type Occupant } from "@/components/cage3d/neon";
import { CageCard } from "./CageCard";
import { opsStore } from "@/lib/opsStore";
import { statusOf } from "@/lib/opsStatus";
import { repo } from "@/lib/repo";
import type { Admission } from "@/types";
import { speciesPhoto } from "@/lib/petPhotos";
import { cn, formatNum, localISO } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

/* ============================================================================
 * لوحة الأقفاص المسطّحة — بديل المنظور المجسّم.
 *
 * ── لماذا أُلغي المجسّم ──────────────────────────────────────────────────
 * كان مبهراً ومزدحماً: منظورٌ مائل يحتاج تعلّم كاميرا، وأرقامٌ عائمة تتزاحم،
 * وساكنٌ يطفو فوق قفصه. الموظف يريد جواباً بلمحة: «منو بهذا القفص؟ ووين
 * فاضي؟» — وبطاقاتٌ مصفوفة أفقياً بمسافاتٍ واسعة تجيبه أسرع من أي مشهد.
 *
 * ── ما بقي كما هو (وهذا الأهم) ───────────────────────────────────────────
 * نفس مخزن التخطيط (غرف ورموز) ونفس opsStore (الرقود النشطة): النقل هنا
 * يعدّل admission.cage نفسه فيظهر بالتقويم الرئيسي وبرحلة الحيوان — حقيقة
 * واحدة بواجهةٍ أهدأ. ولا حاجة لأي هجرة.
 * ==========================================================================*/

const norm = (c?: string | null) => (c ?? "").trim().toLowerCase();
const dayNo = (iso?: string) => {
  const t = new Date((iso ?? "") + "T00:00:00").getTime();
  return Number.isNaN(t) ? 1 : Math.max(1, Math.floor((Date.now() - t) / 86400000) + 1);
};
/** نفس معادلة لوحات الاستقبال: جرعة العلاج حان وقتها ولم تُعطَ. */
const doseDueOf = (a: Admission): boolean => {
  if (a.status !== "active" || (a.kind !== "treatment" && a.kind !== "treatment_boarding")) return false;
  if (!a.last_completed_at) return true;
  const cyc = a.cycle_hours && a.cycle_hours > 0 ? a.cycle_hours : 24;
  return Date.now() >= new Date(a.last_completed_at).getTime() + cyc * 3600000;
};

type Filter = "all" | "occupied" | "free" | "dose";

export default function CageBoard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;

  const s = useCageStudio();
  const [ops, setOps] = useState(() => opsStore.get());
  useEffect(() => {
    const unsub = opsStore.subscribe(() => setOps(opsStore.get()));
    void opsStore.hydrate(clinicId).catch(() => { /* بلا شبكة — الكاش يغطّي */ });
    return unsub;
  }, [clinicId]);

  /* دقّاقة الدقيقة — «جرعة مستحقّة» تشتعل وتنطفئ بلا تحديث يدوي */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const makeOcc = (a: Admission): Occupant => {
    const p = ops.pets[a.pet_id];
    const st = statusOf(a);
    return {
      admId: a.id, petId: a.pet_id,
      name: p?.name ?? t("cages.animal", "حيوان"),
      speciesAr: p ? (SPECIES_AR[p.species] ?? t("cages.animal", "حيوان")) : t("cages.animal", "حيوان"),
      photoUrl: p ? (p.photo_url || speciesPhoto(p.species, 128)) : null,
      emoji: p ? (SPECIES_EMOJI[p.species] ?? "🐾") : "🐾",
      status: st === "done" ? "boarding" : st,
      days: dayNo(a.admitted_on),
      doseDue: doseDueOf(a),
    };
  };
  const actives = useMemo(() => ops.admissions.filter((a) => a.status !== "discharged"), [ops.admissions]);
  const occByCage = useMemo(() => {
    const m = new Map<string, Occupant>();
    for (const a of actives) {
      const k = norm(a.cage);
      if (k && !m.has(k)) m.set(k, makeOcc(a));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actives, ops.pets]);
  const occOf = (code: string) => occByCage.get(norm(code)) ?? null;

  /* التبنّي: رمز على رقود نشط وغير مرسوم هنا → يُغرز تلقائياً فلا يختفي أحد */
  useEffect(() => {
    if (!ops.hydrated) return;
    const codes = [...actives.map((a) => a.cage ?? ""), ...codesFromPrefs()].filter(Boolean);
    cageStudio.adoptCodes(codes);
  }, [ops.hydrated, actives]);

  /* ── حالة الواجهة ── */
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [edit, setEdit] = useState(false);
  const [carrying, setCarrying] = useState<Occupant | null>(null);
  const [picker, setPicker] = useState<{ targetCage: string | null } | null>(null);
  const [editCage, setEditCage] = useState<string | null>(null);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const canEdit = can("manageSettings");

  /* ── الغرف وأقفاصها بترتيبٍ ثابت ── */
  const rooms = useMemo(() => [...s.rooms].sort((a, b) => a.x - b.x), [s.rooms]);
  const cagesOf = (r: Room3D): CagePlacement[] =>
    s.cages
      .filter((c) => c.x >= r.x && c.x < r.x + r.w && c.z >= r.z && c.z < r.z + r.d)
      .sort((a, b) => (a.z - b.z) || (a.x - b.x));

  const totals = useMemo(() => {
    const total = s.cages.length;
    const occupied = s.cages.filter((c) => occOf(c.code)).length;
    const dose = s.cages.filter((c) => occOf(c.code)?.doseDue).length;
    return { total, occupied, free: total - occupied, dose };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.cages, occByCage]);

  const ql = q.trim().toLowerCase();
  const matches = (c: CagePlacement): boolean => {
    if (!ql) return true;
    const o = occOf(c.code);
    return c.code.toLowerCase().includes(ql) || !!o?.name.toLowerCase().includes(ql);
  };
  const passesFilter = (c: CagePlacement): boolean => {
    const o = occOf(c.code);
    return filter === "all" ? true
      : filter === "occupied" ? !!o
        : filter === "free" ? !o
          : !!o?.doseDue;
  };

  /* ── الأفعال ── */
  const doMove = async (occ: Occupant, toCode: string) => {
    try {
      await opsStore.patch(occ.admId, { cage: toCode });
      playSuccess();
      toast.success(t("cages.moved", { name: occ.name, code: toCode, defaultValue: "{{name}} صار بالقفص {{code}}" }));
    } catch {
      playWarning();
      toast.error(t("cages.moveFailed", "تعذّر النقل — حاول مجدداً"));
    }
    setCarrying(null);
  };

  const onTapFree = (code: string) => {
    playTap();
    if (carrying) { void doMove(carrying, code); return; }
    setPicker({ targetCage: code });
  };

  const pickPet = async (pet: { id: string; name: string; species: Parameters<typeof speciesPhoto>[0] }, adm: Admission | null, kind?: Admission["kind"]) => {
    playTap();
    const target = picker?.targetCage ?? null;
    setPicker(null);
    let occ: Occupant | null = null;
    if (adm) {
      occ = makeOcc(adm);
    } else {
      try {
        const created = await repo.addAdmission({
          pet_id: pet.id, kind: kind ?? "boarding", status: "active",
          admitted_on: localISO(), cage: "",
        });
        await opsStore.hydrate(clinicId);
        occ = makeOcc(created);
      } catch {
        playWarning();
        toast.error(t("cages.admitFailed", "تعذّر فتح الرقود — حاول مجدداً"));
        return;
      }
    }
    if (target) { void doMove(occ, target); return; }
    setCarrying(occ);
    toast.success(t("cages.pickTarget", { name: pet.name, defaultValue: "اضغط القفص اللي تريد تحط {{name}} بيه" }));
  };

  /* ============================== الواجهة ============================== */
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* الترويسة */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><LayoutGrid size={24} /></span>
        <div className="me-auto">
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("nav.cageRoom", "غرفة الأقفاص")}</h1>
          <p className="text-sm text-ink-subtle">{t("cages.subtitle", "منو بكل قفص، ووين الفاضي — بلمحة وحدة.")}</p>
        </div>
        {canEdit && (
          <button
            type="button" data-cageedit
            onClick={() => { playTap(); setEdit((v) => !v); setCarrying(null); }}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-2xl border px-4 text-sm font-bold transition",
              edit ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                : "border-line bg-surface-1 text-ink-muted hover:text-ink",
            )}
          >
            {edit ? <Check size={16} /> : <Settings2 size={16} />} {edit ? t("cages.doneEdit", "انتهيت") : t("cages.organize", "تنظيم")}
          </button>
        )}
        <Button leftIcon={<UserPlus size={16} />} data-cageadmit onClick={() => { playTap(); setPicker({ targetCage: null }); }}>
          {t("cages.admit", "إسكان حيوان")}
        </Button>
      </div>

      {/* الملخص = التصفية: ضغطة على الرقم تصفّي عليه */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {([
          { id: "all", label: t("cages.fAll", "الكل"), n: totals.total, icon: LayoutGrid },
          { id: "occupied", label: t("cages.fOccupied", "ممتلئ"), n: totals.occupied, icon: BedDouble },
          { id: "free", label: t("cages.fFree", "فاضي"), n: totals.free, icon: DoorOpen },
          { id: "dose", label: t("cages.fDose", "جرعة مستحقّة"), n: totals.dose, icon: Syringe },
        ] as { id: Filter; label: string; n: number; icon: typeof Syringe }[]).map((f) => {
          const Icon = f.icon;
          const active = filter === f.id;
          if (f.id === "dose" && f.n === 0) return null;
          return (
            <button key={f.id} type="button" data-cagefilter={f.id}
              onClick={() => { playTap(); setFilter(f.id); }}
              className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition",
                active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink",
                f.id === "dose" && !active && "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300")}>
              <Icon size={14} /> {f.label}
              <span className={cn("rounded-full px-1.5 text-2xs font-extrabold tabular-nums", active ? "bg-white/25" : "bg-surface-1 text-ink-subtle")}>
                {formatNum(f.n)}
              </span>
            </button>
          );
        })}
        <div className="relative ms-auto min-w-[180px] flex-1 sm:max-w-64">
          <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input h-10 py-0 ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("cages.search", "دوّر بالاسم أو رقم القفص…")} data-cagesearch />
        </div>
      </div>

      {/* الغرف */}
      <div className="space-y-8">
        {rooms.map((room) => {
          const cages = cagesOf(room);
          const occN = cages.filter((c) => occOf(c.code)).length;
          return (
            <section key={room.id} data-cageroom={room.id}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="font-display text-lg font-extrabold text-ink">{room.name}</h2>
                <span className="chip bg-surface-2 text-2xs font-bold text-ink-muted tabular-nums">
                  {formatNum(occN)}/{formatNum(cages.length)}
                </span>
                <span className="h-px flex-1 bg-line" />
                {edit && (
                  <div className="flex items-center gap-1.5">
                    <button type="button" data-roomaddcage={room.id}
                      onClick={() => { playTap(); cageStudio.addCageAuto(room.id); }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-2xs font-bold text-ink-muted transition hover:text-ink">
                      <Plus size={13} /> {t("cages.addCage", "قفص")}
                    </button>
                    <button type="button"
                      onClick={() => {
                        playTap();
                        const name = window.prompt(t("cages.renamePrompt", "اسم الغرفة:"), room.name);
                        if (name?.trim()) cageStudio.updateRoom(room.id, { name });
                      }}
                      className="inline-flex h-8 items-center rounded-lg bg-surface-2 px-2.5 text-2xs font-bold text-ink-muted transition hover:text-ink">
                      {t("cages.rename", "تسمية")}
                    </button>
                    <button type="button"
                      onClick={() => {
                        playTap();
                        if (cages.some((c) => occOf(c.code))) { playWarning(); toast.error(t("cages.roomOccupied", "بالغرفة نزلاء — انقلهم أولاً")); return; }
                        if (window.confirm(t("cages.confirmRoomDelete", { name: room.name, defaultValue: "حذف «{{name}}» وأقفاصها من اللوحة؟" }))) cageStudio.removeRoom(room.id);
                      }}
                      className="inline-flex h-8 items-center rounded-lg bg-danger-50 px-2.5 text-2xs font-bold text-danger-600 transition hover:bg-danger-100 dark:bg-danger-500/15 dark:text-danger-300">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* المصفوفة الأفقية — بطاقات واسعة تلتف بمسافات سخية */}
              <motion.div
                variants={staggerContainer} initial="initial" animate="animate"
                className="grid gap-x-6 gap-y-9 pt-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))] lg:gap-x-7"
              >
                {cages.filter(passesFilter).map((c) => (
                  <motion.div key={c.code} variants={staggerItem}>
                    <CageCard
                      code={c.code}
                      occ={occOf(c.code)}
                      carrying={!!carrying}
                      dimmed={!!ql && !matches(c)}
                      highlighted={!!ql && matches(c)}
                      editable={edit}
                      onTapFree={() => onTapFree(c.code)}
                      onOpenFile={() => { playTap(); const o = occOf(c.code); if (o) navigate(`/pet/${o.petId}?tab=timeline`); }}
                      onStartMove={() => {
                        playTap();
                        const o = occOf(c.code);
                        if (!o) return;
                        setCarrying(o);
                        toast.success(t("cages.pickTarget", { name: o.name, defaultValue: "اضغط القفص اللي تريد تحط {{name}} بيه" }));
                      }}
                      onEditCage={() => setEditCage(c.code)}
                    />
                  </motion.div>
                ))}
              </motion.div>
              {cages.filter(passesFilter).length === 0 && (
                <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-subtle">
                  {t("cages.emptyFilter", "لا أقفاص مطابقة بهذه الغرفة")}
                </p>
              )}
            </section>
          );
        })}

        {edit && (
          <button type="button" data-addroom
            onClick={() => { playTap(); setAddRoomOpen(true); }}
            className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-line-strong p-6 text-sm font-bold text-ink-subtle transition hover:border-brand-300 hover:text-brand-600">
            <Plus size={18} /> {t("cages.addRoom", "إضافة غرفة")}
          </button>
        )}
      </div>

      {/* شريط النقل — ثابت أسفل الشاشة ما دام الحمل نشطاً */}
      {carrying && (
        <div data-cagecarry className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-brand-300 bg-surface-1/95 py-2 pe-2 ps-4 shadow-raised backdrop-blur dark:border-brand-500/40">
            <Move size={15} className="text-brand-600 dark:text-brand-300" />
            <span className="text-sm font-bold text-ink">
              {t("cages.whereTo", { name: carrying.name, defaultValue: "وين ننقل {{name}}؟" })}{" "}
              <span className="font-semibold text-ink-subtle">{t("cages.tapPulsing", "اضغط أي قفص متاح")}</span>
            </span>
            <button type="button" onClick={() => { playTap(); setCarrying(null); }}
              className="inline-flex h-8 items-center gap-1 rounded-xl bg-surface-2 px-3 text-xs font-bold text-ink-muted transition hover:text-ink">
              <X size={13} /> {t("common.cancel", "إلغاء")}
            </button>
          </div>
        </div>
      )}

      <AdmitPicker
        open={!!picker}
        targetCage={picker?.targetCage ?? null}
        onClose={() => setPicker(null)}
        actives={actives}
        pets={ops.pets}
        cages={s.cages}
        onPick={pickPet}
      />

      <CageEditModal
        code={editCage}
        occupied={!!(editCage && occOf(editCage))}
        onClose={() => setEditCage(null)}
        onRename={(from, to) => {
          if (!cageStudio.updateCage(from, { code: to })) {
            playWarning();
            toast.error(t("cages.codeTaken", "هذا الرقم مستعمل بقفص آخر"));
            return false;
          }
          const o = occOf(from);
          if (o) void opsStore.patch(o.admId, { cage: to }).catch(() => { /* التبنّي يصلحه */ });
          playSuccess();
          return true;
        }}
        onDelete={(code) => {
          if (occOf(code)) { playWarning(); toast.error(t("cages.cageOccupied", "بالقفص ساكن — انقله أولاً")); return; }
          cageStudio.removeCage(code);
          playSuccess();
        }}
      />

      <AddRoomModal
        open={addRoomOpen}
        onClose={() => setAddRoomOpen(false)}
        onAdd={(name, count) => {
          const w = Math.min(4, Math.max(1, count));
          const room = cageStudio.addRoom(name, w, Math.max(1, Math.ceil(count / w)));
          for (let i = 0; i < count; i++) cageStudio.addCageAuto(room.id);
          setAddRoomOpen(false);
          playSuccess();
        }}
      />
    </div>
  );
}

/* ============================================================================
 * منتقي الإسكان — بحثٌ بسجلاتك: راقدٌ بلا قفص يُسكَن فوراً، وغير الراقد
 * يُفتح له رقود (علاج أو فندقة) ثم يُسكَن. نفس منطق المشهد القديم حرفياً.
 * ==========================================================================*/
function AdmitPicker({ open, targetCage, onClose, actives, pets, cages, onPick }: {
  open: boolean;
  targetCage: string | null;
  onClose: () => void;
  actives: Admission[];
  pets: ReturnType<typeof opsStore.get>["pets"];
  cages: CagePlacement[];
  onPick: (pet: { id: string; name: string; species: Parameters<typeof speciesPhoto>[0] }, adm: Admission | null, kind?: Admission["kind"]) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const admitted = new Set(actives.map((a) => a.pet_id));
    const out: Array<{ pet: NonNullable<typeof pets[string]>; adm: Admission | null }> = [];
    for (const a of actives) {
      const p = pets[a.pet_id];
      if (p) out.push({ pet: p, adm: a });
    }
    for (const p of Object.values(pets)) if (p && !admitted.has(p.id)) out.push({ pet: p, adm: null });
    const f = query
      ? out.filter(({ pet }) => pet.name?.toLowerCase().includes(query) || pet.owner_name?.toLowerCase().includes(query))
      : out;
    const hasCage = (a: Admission | null) => !!a && !!norm(a.cage) && cages.some((c) => norm(c.code) === norm(a!.cage));
    return f.sort((a, b) => Number(hasCage(a.adm)) - Number(hasCage(b.adm)) || Number(!!b.adm) - Number(!!a.adm)).slice(0, 8);
  }, [q, actives, pets, cages]);

  return (
    <Modal open={open} onClose={onClose} title={targetCage
      ? t("cages.admitTo", { code: targetCage, defaultValue: "إسكان بالقفص {{code}}" })
      : t("cages.admit", "إسكان حيوان")}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t("cages.pickSearch", "اسم الحيوان أو صاحبه…")} data-cagepickq />
        </div>
        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto [scrollbar-width:thin]">
          {rows.map(({ pet, adm }) => {
            const inCage = adm && norm(adm.cage) && cages.some((c) => norm(c.code) === norm(adm.cage));
            return (
              <div key={pet.id} data-cagepick={pet.id}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-xl">
                  {pet.photo_url ? <img src={pet.photo_url} alt="" className="h-full w-full object-cover" /> : (SPECIES_EMOJI[pet.species] ?? "🐾")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{pet.name}</p>
                  <p className="truncate text-2xs text-ink-subtle">
                    {pet.owner_name || "—"}
                    {adm && (inCage
                      ? <> · {t("cages.nowInCage", { code: adm.cage, defaultValue: "حالياً بالقفص {{code}}" })}</>
                      : <> · <b className="text-warn-600 dark:text-warn-400">{t("cages.noCage", "راقد بلا قفص")}</b></>)}
                  </p>
                </div>
                {adm ? (
                  <button type="button" onClick={() => onPick(pet, adm)}
                    className="inline-flex h-9 shrink-0 items-center rounded-xl bg-brand-600 px-3.5 text-xs font-bold text-white shadow-soft transition hover:bg-brand-700">
                    {inCage ? t("cages.moveHim", "انقله") : t("cages.placeHim", "أسكنه")}
                  </button>
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={() => onPick(pet, null, "treatment")}
                      className="inline-flex h-9 items-center rounded-xl bg-brand-50 px-3 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-300">
                      {t("cages.kindCare", "علاج")}
                    </button>
                    <button type="button" onClick={() => onPick(pet, null, "boarding")}
                      className="inline-flex h-9 items-center rounded-xl bg-violet-50 px-3 text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300">
                      {t("cages.kindBoard", "فندقة")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <p className="p-6 text-center text-sm text-ink-subtle">{t("cages.noPickMatch", "ما لقينا حيواناً بهذا الاسم")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** تعديل قفص واحد: تغيير رقمه (تُنقل معه إقامة ساكنه) أو حذفه إن كان فاضياً. */
function CageEditModal({ code, occupied, onClose, onRename, onDelete }: {
  code: string | null;
  occupied: boolean;
  onClose: () => void;
  onRename: (from: string, to: string) => boolean;
  onDelete: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [val, setVal] = useState("");
  useEffect(() => { if (code) setVal(code); }, [code]);
  if (!code) return null;
  return (
    <Modal open onClose={onClose} title={t("cages.editCage", { code, defaultValue: "القفص {{code}}" })}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("cages.cageNo", "رقم اللافتة")}</label>
          <input className="input text-center font-mono text-lg font-black tracking-widest" value={val} data-cagecode
            onChange={(e) => setVal(e.target.value)} />
        </div>
        <Button className="w-full" onClick={() => { const to = val.trim(); if (!to || to === code) { onClose(); return; } if (onRename(code, to)) onClose(); }}>
          {t("common.save", "حفظ")}
        </Button>
        <button type="button"
          onClick={() => { if (occupied) { onDelete(code); return; } if (window.confirm(t("cages.confirmCageDelete", { code, defaultValue: "حذف القفص {{code}}؟" }))) { onDelete(code); onClose(); } }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-danger-50 py-2.5 text-sm font-bold text-danger-600 transition hover:bg-danger-100 dark:bg-danger-500/15 dark:text-danger-300">
          <Trash2 size={15} /> {t("cages.deleteCage", "حذف القفص")}
        </button>
      </div>
    </Modal>
  );
}

/** إضافة غرفة: اسم + عدد أقفاص مبدئي — الشبكة الداخلية شأن المخزن لا الطبيب. */
function AddRoomModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, count: number) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [count, setCount] = useState(6);
  useEffect(() => { if (open) { setName(""); setCount(6); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={t("cages.addRoom", "إضافة غرفة")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("cages.roomName", "اسم الغرفة")}</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t("cages.roomNamePh", "مثال: غرفة العزل")} data-roomname />
        </div>
        <div>
          <label className="label">{t("cages.initialCages", "عدد الأقفاص")}</label>
          <div className="flex gap-1.5">
            {[4, 6, 8, 12].map((n) => (
              <button key={n} type="button" onClick={() => { playTap(); setCount(n); }}
                className={cn("flex-1 rounded-xl px-2 py-2.5 text-sm font-bold tabular-nums transition",
                  count === n ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {formatNum(n)}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" data-roomsave disabled={!name.trim()} onClick={() => onAdd(name.trim(), count)}>
          {t("cages.createRoom", "إنشاء الغرفة")}
        </Button>
      </div>
    </Modal>
  );
}
