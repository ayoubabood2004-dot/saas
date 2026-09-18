/* ============================================================================
 * قسمُ حقول الدواجن — حقلٌ ⇒ قاعاتٌ ⇒ دفعةٌ ⇒ إدخالُ اليوم.
 *
 * ── لمن كُتبت هذه الشاشة ────────────────────────────────────────────────
 * لدكتورٍ **واقفٍ بالحقل** بيدٍ واحدة وتلفونٍ باليد الأخرى، بعد مراجعةٍ يريد
 * أن يقيّد ما رآه قبل أن ينساه. وهذا يقرّر كلَّ قرارٍ بالتصميم:
 *   • تنقّلٌ بالتعمّق لا تبويبات: شاشةٌ واحدةٌ بكلّ لحظة، ورجوعٌ واضح.
 *   • «إدخالُ اليوم» أوّلُ ما يُرى داخل الدفعة لا آخرَه.
 *   • أرقامُ الدفعة (عمرٌ، حيٌّ، نفوقٌ، علف) بالترويسة دائماً — هي سببُ
 *     فتحِه الشاشةَ أصلاً.
 *   • ولا حقلَ إلزاميٌّ إلا ما يعرفه فعلاً: اليومُ قد يمرّ بلا وزنِ عيّنةٍ ولا
 *     حرارة، وإجبارُه عليها يجعله يكتب رقماً من رأسه — ورقمٌ مخترعٌ أسوأ من
 *     خانةٍ فارغة.
 *
 * ── والمالُ لا يُخترع ──────────────────────────────────────────────────
 * الصرفُ يمرّ من `poultry_consume` وحدَها: خصمٌ وسطرُ كلفةٍ بمعاملةٍ واحدة،
 * بسعر الشراء. و«النقص» حين لا يكفي الرصيدُ **يُقال بصوت** — لا يُطمس.
 * ==========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bird, Plus, ArrowRight, Home, Layers, CalendarDays, Skull, Wheat,
  Syringe, Wrench, StickyNote, Loader2, PackageX, CheckCircle2, AlertTriangle, Boxes, Download,
  ShieldAlert, ShieldCheck, Scale, Gauge, Trophy, Coins, ClipboardList, ChevronDown, Circle,
} from "lucide-react";
import type { PoultryFarm, PoultryHouse, PoultryCycle, PoultryDaily, PoultryUse, PoultryCycleStats, PoultryUseKind, Product } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { cn, money, formatNum, formatDec } from "@/lib/utils";
import { poultryKpi, poultryOutcome, batchWeeks, dayDiff, weightSanity } from "@/lib/poultryKpi";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { Button, useToast } from "@/components/ui";
import { asciiFileName } from "@/lib/excelExport";

/** يومُ الجهاز **بتوقيته المحلّيّ** — نفسُ `localISO` بالتقارير.
 *
 *  كانت `toISOString()`، وهي UTC. وبغداد UTC+3، فمن منتصف الليل حتى الثالثة
 *  فجراً يقول النظامُ إنّ «اليوم» هو أمس: الدفترُ يقيّد جولةَ الليل بتاريخٍ
 *  مضى، و`max` بخانة التاريخ يمنع اختيارَ اليوم الحقيقيّ، وشارةُ «انكتب
 *  اليوم» تكذب. وثلاثُ ساعاتٍ من كلّ ليلةٍ ليست حالةً نادرة بحقلٍ يُجال عليه
 *  فجراً. */
const localISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO(new Date());
const addDays = (iso: string, n: number) => localISO(new Date(new Date(`${iso}T12:00:00`).getTime() + n * 86400000));
/** كم يوماً باقياً حتى `iso` — سالبٌ يعني أنه مضى. */
const daysUntil = (iso: string) =>
  Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayISO()}T12:00:00`).getTime()) / 86400000);

/** عمرُ الدفعة باليوم — نفسُ تعريف الخادم: من يوم وضع الدجاج إلى الإغلاق أو اليوم. */
const ageOf = (c: PoultryCycle): number => {
  const end = c.closed_on ?? todayISO();
  return Math.max(0, dayDiff(c.placed_on, end));
};

export function PoultryFarms() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id;
  const canWrite = can("manageInventory");

  const [farms, setFarms] = useState<PoultryFarm[]>([]);
  const [farm, setFarm] = useState<PoultryFarm | null>(null);
  const [cycle, setCycle] = useState<PoultryCycle | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    setState("loading");
    try { setFarms(await repo.listPoultryFarms()); setState("ok"); }
    catch { setState("error"); }   // قائمةٌ ناقصةٌ بصمتٍ تجعله يفتح حقلاً موجوداً
  }, []);
  useEffect(() => { void load(); }, [load, clinicId]);

  if (state === "loading") {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin text-brand-500" size={26} /></div>;
  }
  if (state === "error") {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4 text-center">
        <div className="max-w-sm space-y-3">
          <AlertTriangle className="mx-auto text-warn-500" size={30} />
          <p className="text-sm font-semibold text-ink">{t("farm.loadFailed")}</p>
          <Button onClick={() => void load()}>{t("farm.retry")}</Button>
        </div>
      </div>
    );
  }

  if (cycle && farm) return <CycleView farm={farm} cycle={cycle} canWrite={canWrite} onBack={() => setCycle(null)} />;
  if (farm) return <FarmView farm={farm} canWrite={canWrite} onBack={() => setFarm(null)} onOpenCycle={setCycle} />;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold text-ink">
          <Bird size={22} className="text-brand-600" /> {t("farm.title")}
        </h1>
      </header>

      {farms.length === 0 ? (
        <Empty icon={Bird} text={t("farm.noFarms")} />
      ) : (
        <ul className="space-y-2">
          {farms.map((f) => (
            <li key={f.id}>
              <button onClick={() => { playTap(); setFarm(f); }}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-4 text-start transition hover:bg-surface-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Bird size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{f.name}</span>
                  {(f.area || f.governorate) && <span className="block truncate text-2xs text-ink-subtle">{[f.governorate, f.area].filter(Boolean).join(" · ")}</span>}
                </span>
                <ArrowRight size={16} className="shrink-0 text-ink-subtle ltr:-scale-x-100" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {canWrite && <AddFarm onAdded={(f) => { setFarms((s) => [f, ...s]); toast.success(t("farm.farmAdded")); }} />}
    </div>
  );
}

/* ── إضافةُ حقل ─────────────────────────────────────────────────────────── */
function AddFarm({ onAdded }: { onAdded: (f: PoultryFarm) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { playWarning(); toast.error(t("farm.needName")); return; }
    setBusy(true);
    try {
      onAdded(await repo.addPoultryFarm({ name: name.trim() }));
      setName(""); setOpen(false); playSuccess();
    } catch (e) { playWarning(); toast.error(t("farm.saveFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  if (!open) {
    return <Button className="w-full" variant="secondary" leftIcon={<Plus size={16} />} onClick={() => { playTap(); setOpen(true); }}>{t("farm.addFarm")}</Button>;
  }
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-1 p-4">
      <label className="label">{t("farm.farmName")}</label>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("farm.farmNamePlaceholder")} autoFocus />
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={busy}>{t("farm.save")}</Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setName(""); }}>{t("farm.cancel")}</Button>
      </div>
    </div>
  );
}

/* ── الحقل: قاعاتُه ودفعاتُه ────────────────────────────────────────────── */
function FarmView({ farm, canWrite, onBack, onOpenCycle }: { farm: PoultryFarm; canWrite: boolean; onBack: () => void; onOpenCycle: (c: PoultryCycle) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [houses, setHouses] = useState<PoultryHouse[]>([]);
  const [cycles, setCycles] = useState<PoultryCycle[]>([]);
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [round, setRound] = useState(false);

  /** مجاميعُ كلّ دفعةٍ نشطة — النفوقُ وآخرُ إدخال. `null` = تعذّرت. */
  const [stats, setStats] = useState<Map<string, PoultryCycleStats | null>>(() => new Map());
  /* **آخرُ نداءٍ يفوز، لا آخرُ جوابٍ يصل.** للجلب رجلان: القائمةُ سريعة،
   * ومجاميعُ الدفعات تتأخّر. فتحميلان متداخلان (حفظُ الجولة يعيد التحميل، أو
   * نتٌّ متذبذب) قد يُنزل مجاميعَ الطلب **القديم** فوق الجديدة — فتظهر نقطةٌ
   * حمراء عن يومٍ كُتب للتوّ. الجيلُ يحسم: ما ليس من آخر نداءٍ يُهمَل. */
  const gen = useRef(0);

  const load = useCallback(async () => {
    const my = ++gen.current;
    setBusy(true);
    try {
      const [h, c] = await Promise.all([repo.listPoultryHouses(farm.id), repo.listPoultryCycles(farm.id)]);
      if (gen.current !== my) return;
      setHouses(h); setCycles(c);
      /* **القائمةُ تُرسم فوراً، والشاراتُ تلحق.** ورفعُ `busy` هنا لا بـ`finally`:
         كان بعد انتظار مجاميعِ كلّ دفعة، فنداءٌ واحدٌ يعلَق على نتٍّ ضعيف يترك
         الشاشةَ دوّامةً إلى الأبد — والقائمةُ وزرُّ الجولة بيدنا أصلاً. صفحةٌ
         تُحجب خلف شاراتٍ تزيينية أسوأُ من شاراتٍ تتأخّر. */
      setBusy(false);
      const act = c.filter((x) => x.status === "active");
      const rows = await Promise.all(act.map((x) =>
        repo.poultryCycleStats(x.id).then((r) => [x.id, r] as const).catch(() => [x.id, null] as const)));
      if (gen.current !== my) return;
      setStats(new Map(rows));
    } catch (e) { if (gen.current === my) toast.error(t("farm.loadFailed"), e instanceof Error ? e.message : undefined); }
    finally { if (gen.current === my) setBusy(false); }
  }, [farm.id, t, toast]);
  useEffect(() => { void load(); }, [load]);

  /** الدفعةُ النشطةُ لكلّ قاعة — القاعدةُ تضمن واحدةً لا أكثر. */
  const activeOf = useMemo(() => {
    const m = new Map<string, PoultryCycle>();
    for (const c of cycles) if (c.status === "active") m.set(c.house_id, c);
    return m;
  }, [cycles]);

  const actives = useMemo(() => houses
    .map((h) => ({ house: h, cycle: activeOf.get(h.id) }))
    .filter((x): x is { house: PoultryHouse; cycle: PoultryCycle } => !!x.cycle), [houses, activeOf]);

  if (round) {
    return <DailyRound farm={farm} rows={actives} onBack={() => { setRound(false); void load(); }} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <BackBar title={farm.name} onBack={onBack} />
      {busy ? <div className="grid py-12 place-items-center"><Loader2 className="animate-spin text-brand-500" size={22} /></div> : (
        <>
          {/* **جولةُ اليوم أوّلاً.** المقيس: إدخالُ يومِ قاعةٍ واحدةٍ أربعُ
              ضغطاتٍ قبل أوّل رقم، وحقلٌ بستّ قاعاتٍ أربعٌ وعشرون ضغطةً كلَّ
              يوم. وهذا الزرُّ هو سببُ فتحِه التطبيقَ أصلاً، فيسبق كلَّ شيء. */}
          {canWrite && actives.length > 0 && (
            <Button className="w-full" leftIcon={<ClipboardList size={17} />} onClick={() => { playTap(); setRound(true); }}>
              {t("farm.round.open", { n: formatNum(actives.length) })}
            </Button>
          )}
          {houses.length === 0 ? <Empty icon={Home} text={t("farm.noHouses")} /> : (
            <ul className="space-y-2">
              {houses.map((h) => {
                const act = activeOf.get(h.id);
                return (
                  <li key={h.id} className="rounded-2xl border border-line bg-surface-1 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted"><Home size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-ink">{h.label}</p>
                        <p className="text-2xs text-ink-subtle">
                          {h.capacity ? t("farm.capacityN", { n: formatNum(h.capacity) }) : t("farm.noCapacity")}
                        </p>
                      </div>
                    </div>
                    {act ? (
                      <HouseCard cycle={act} stats={stats.has(act.id) ? stats.get(act.id) ?? null : undefined}
                        onOpen={() => { playTap(); onOpenCycle(act); }} />
                    ) : canWrite ? (
                      <OpenCycle house={h} farmId={farm.id} onOpened={(c) => { setCycles((s) => [c, ...s]); toast.success(t("farm.batchOpened")); }} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {canWrite && (adding
            ? <AddHouse farmId={farm.id} onDone={(h) => { if (h) setHouses((s) => [...s, h]); setAdding(false); }} />
            : <Button className="w-full" variant="secondary" leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("farm.addHouse")}</Button>)}

          <FarmStore farmId={farm.id} canWrite={canWrite} />
          <ExportLedger farm={farm} houses={houses} cycles={cycles} />

          {/* الدفعاتُ المغلقة — تاريخُ الحقل، وهو سببُ كلِّ هذا البناء. */}
          {cycles.some((c) => c.status === "closed") && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-ink-muted">{t("farm.pastBatches")}</h2>
              {cycles.filter((c) => c.status === "closed").map((c) => (
                <button key={c.id} onClick={() => { playTap(); onOpenCycle(c); }}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/50 p-3 text-start transition hover:bg-surface-2">
                  <CheckCircle2 size={15} className="shrink-0 text-ink-subtle" />
                  <span className="min-w-0 flex-1 text-2xs text-ink-muted">
                    {houses.find((h) => h.id === c.house_id)?.label ?? "—"} · {c.placed_on} → {c.closed_on} · {t("farm.placedN", { n: formatNum(c.placed_count) })}
                  </span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ── إضافةُ قاعة ────────────────────────────────────────────────────────── */
function AddHouse({ farmId, onDone }: { farmId: string; onDone: (h: PoultryHouse | null) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [capacity, setCapacity] = useState("");
  const [kind, setKind] = useState<"broiler" | "layer">("broiler");
  const [breed, setBreed] = useState("");
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!label.trim()) { playWarning(); toast.error(t("farm.needLabel")); return; }
    setBusy(true);
    try {
      onDone(await repo.addPoultryHouse({
        farm_id: farmId, label: label.trim(),
        capacity: Number(capacity) || null,
        default_kind: kind, default_breed: breed.trim() || null, default_count: Number(count) || null,
      }));
      playSuccess();
    } catch (e) { playWarning(); toast.error(t("farm.saveFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
      <div>
        <label className="label">{t("farm.houseLabel")}</label>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("farm.houseLabelPlaceholder")} autoFocus />
      </div>
      <div>
        <label className="label">{t("farm.capacity")}</label>
        <input className="input" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      {/* هذه **افتراضاتٌ تُنسخ للدفعة** لا صفاتٌ للقاعة: العددُ والنوعُ والسلالةُ
          يتبدّلون كلَّ دورة، ولو عاشوا هنا لطمست الدفعةُ الثانيةُ تاريخَ الأولى. */}
      <p className="rounded-lg bg-surface-2 p-2 text-2xs leading-relaxed text-ink-subtle">{t("farm.defaultsHint")}</p>
      <div className="flex gap-1.5">
        {(["broiler", "layer"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={cn("flex-1 rounded-xl px-3 py-2 text-sm font-bold transition",
              kind === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
            {t(`farm.kind.${k}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t("farm.breed")}</label>
          <input className="input" value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Ross 308" />
        </div>
        <div>
          <label className="label">{t("farm.defaultCount")}</label>
          <input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={busy}>{t("farm.save")}</Button>
        <Button variant="ghost" onClick={() => onDone(null)}>{t("farm.cancel")}</Button>
      </div>
    </div>
  );
}

/* ── فتحُ دفعة — الافتراضاتُ تُنسخ من القاعة ───────────────────────────── */
function OpenCycle({ house, farmId, onOpened }: { house: PoultryHouse; farmId: string; onOpened: (c: PoultryCycle) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [placedOn, setPlacedOn] = useState(todayISO());
  const [count, setCount] = useState(String(house.default_count ?? ""));
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("farm.needCount")); return; }
    setBusy(true);
    try {
      onOpened(await repo.openPoultryCycle({
        farm_id: farmId, house_id: house.id,
        kind: house.default_kind ?? "broiler", breed: house.default_breed ?? null,
        placed_on: placedOn, placed_count: Math.round(n),
        chick_unit_cost: Number(cost) || null,
      }));
      setOpen(false); playSuccess();
    } catch (e) {
      playWarning();
      const msg = e instanceof Error && /house_has_active_cycle/.test(e.message) ? t("farm.houseBusy") : (e instanceof Error ? e.message : undefined);
      toast.error(t("farm.saveFailed"), msg);
    } finally { setBusy(false); }
  };

  if (!open) {
    return <Button className="mt-3 w-full" variant="secondary" leftIcon={<Plus size={15} />} onClick={() => { playTap(); setOpen(true); }}>{t("farm.startBatch")}</Button>;
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line bg-surface-2/40 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t("farm.placedOn")}</label>
          <input type="date" className="input" value={placedOn} onChange={(e) => setPlacedOn(e.target.value)} />
        </div>
        <div>
          <label className="label">{t("farm.placedCount")}</label>
          <input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} autoFocus />
        </div>
      </div>
      <div>
        <label className="label">{t("farm.chickCost")}</label>
        <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={busy}>{t("farm.startBatch")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("farm.cancel")}</Button>
      </div>
    </div>
  );
}

/* ── الدفعة: الأرقامُ ثم إدخالُ اليوم ──────────────────────────────────── */
function CycleView({ farm, cycle, canWrite, onBack }: { farm: PoultryFarm; cycle: PoultryCycle; canWrite: boolean; onBack: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [cur, setCur] = useState<PoultryCycle>(cycle);
  const [stats, setStats] = useState<PoultryCycleStats | null>(null);
  const [days, setDays] = useState<PoultryDaily[]>([]);
  const [uses, setUses] = useState<PoultryUse[]>([]);
  const [stock, setStock] = useState<Product[]>([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [s, d, u, p] = await Promise.all([
        repo.poultryCycleStats(cur.id), repo.listPoultryDaily(cur.id),
        repo.listPoultryUse(cur.id), repo.listFarmProducts(farm.id),
      ]);
      setStats(s); setDays(d); setUses(u); setStock(p ?? []);
    } catch (e) { toast.error(t("farm.loadFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  }, [cur.id, farm.id, t, toast]);
  useEffect(() => { void load(); }, [load]);

  const live = cur.status === "active";
  const mortalityPct = stats && stats.placed_count > 0 ? ((stats.dead + stats.culled) / stats.placed_count) * 100 : 0;
  /* المؤشّراتُ من وحدةٍ واحدة يمرّ منها النصفان — لا معادلةَ بالشاشة. */
  const kpi = useMemo(() => poultryKpi(stats, days), [stats, days]);
  const totalCost = kpi.totalCost;
  const outcome = useMemo(() => poultryOutcome(cur, totalCost), [cur, totalCost]);
  /* شذوذُ الوزن يُقاس بعمرِ **يوم العيّنة** لا بعمر اليوم: عيّنةٌ عمرُها أسبوعٌ
     تُحكَم بسقف أسبوعها. */
  const oddWeight = weightSanity(kpi.avgWeightKg, kpi.weighedOn ? dayDiff(cur.placed_on, kpi.weighedOn) : ageOf(cur));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <BackBar title={t("farm.batchOf", { n: formatNum(cur.placed_count) })} onBack={onBack} />

      {/* الأرقامُ أوّلاً — هي سببُ فتحِه الشاشة. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={CalendarDays} label={t("farm.age")} value={formatNum(ageOf(cur))} />
        <Stat icon={Bird} label={t("farm.alive")} value={formatNum(stats?.alive ?? 0)} />
        {/* `formatDec` لا `formatNum`: الثانيةُ تقصّ الكسورَ عمداً (للمبالغ)،
            فنفوقُ ٠٫٢٪ كان يُعرض «٠٪» — ورقمٌ يقول «ما مات شيء» وقد مات ٣٥ طيراً
            هو بالضبط صنفُ العطب الذي يُصدَّق. */}
        <Stat icon={Skull} label={t("farm.mortality")} value={`${formatDec(Math.round(mortalityPct * 10) / 10)}%`} tone={mortalityPct >= 5 ? "warn" : undefined} />
        <Stat icon={Wheat} label={t("farm.feedKg")} value={formatDec(stats?.feed_kg ?? 0)} />
        {/* «—» لا صفر: رقمٌ لم يُقَس ليس رقماً صغيراً، وصفرٌ بمعدّل التحويل
            يُقرأ «علفٌ ممتاز» وهو لم يوزن طيراً بعد. */}
        <Stat icon={Scale} label={t("farm.avgWeight")} value={kpi.avgWeightKg == null ? "—" : formatDec(kpi.avgWeightKg)} />
        <Stat icon={Gauge} label={t("farm.fcr")} value={kpi.fcr == null ? "—" : formatDec(kpi.fcr)} />
      </div>
      {kpi.avgWeightKg == null && live && (
        <p className="text-center text-2xs text-ink-subtle">{t("farm.weighHint")}</p>
      )}
      {/* المؤشّراتُ أعلاه محسوبةٌ على آخر عيّنة. فإن كانت العيّنةُ نفسُها خارجَ
          المعقول، فالتحويلُ وكلفةُ الكيلو **مبنيّان على رقمٍ مشكوكٍ فيه** —
          ولا يُخفَيان (ربّما هو على حقّ)، بل يُقال ما يستندان إليه. */}
      {oddWeight && (
        <div className="flex items-start gap-2 rounded-xl border border-warn-200 bg-warn-50 p-3 text-2xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
          <AlertTriangle size={15} className="mt-px shrink-0" />
          <span>{t("farm.oddBanner", { n: formatDec(kpi.avgWeightKg ?? 0), d: formatNum(kpi.weighedOn ? dayDiff(cur.placed_on, kpi.weighedOn) : ageOf(cur)) })}</span>
        </div>
      )}
      <WithdrawalBanner stats={stats} />
      <Trends days={days} placedOn={cur.placed_on} />
      {totalCost > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-surface-2/50 p-3 text-2xs">
          <span>
            <span className="font-semibold text-ink-muted">{t("farm.costSoFar")}</span>{" "}
            <span className="font-display font-bold tabular-nums text-ink">{money(totalCost)}</span>
          </span>
          {/* كلفةُ الكيلو الحيّ: الرقمُ الذي يُقارَن بسعر السوق مباشرةً — وهو
              سؤالُ صاحب الحقل الحقيقيّ، لا مجموعُ ما صُرف. */}
          {kpi.costPerLiveKg != null && (
            <span>
              <span className="font-semibold text-ink-muted">{t("farm.costPerKg")}</span>{" "}
              <span className="font-display font-bold tabular-nums text-ink">{money(kpi.costPerLiveKg)}</span>
            </span>
          )}
          {kpi.epef != null && (
            <span>
              <span className="font-semibold text-ink-muted">{t("farm.epef")}</span>{" "}
              <span className="font-display font-bold tabular-nums text-ink">{formatNum(kpi.epef)}</span>
            </span>
          )}
        </div>
      )}

      {busy ? <div className="grid py-10 place-items-center"><Loader2 className="animate-spin text-brand-500" size={22} /></div> : (
        <>
          {live && canWrite && <DayEntry cycleId={cur.id} placedOn={cur.placed_on} days={days} stock={stock} onSaved={load} />}
          {!live && <Outcome cycle={cur} outcome={outcome} />}

          <DayLog days={days} uses={uses} placedOn={cur.placed_on} through={cur.closed_on ?? todayISO()} />

          {live && canWrite && (
            <CloseCycle cycleId={cur.id} onClosed={(c) => { setCur(c); toast.success(t("farm.batchClosedOk")); void load(); }} />
          )}
        </>
      )}
    </div>
  );
}

/* ── إدخالُ اليوم — قلبُ الشاشة ────────────────────────────────────────── */
function DayEntry({ cycleId, placedOn, days, stock, onSaved }: { cycleId: string; placedOn: string; days: PoultryDaily[]; stock: Product[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const existing = days.find((d) => d.on_date === date);
  const [dead, setDead] = useState("");
  const [culled, setCulled] = useState("");
  const [note, setNote] = useState("");
  /* الوزنُ **اختياريّ** كبقية الخانات: يومٌ يمرّ بلا ميزانٍ أمرٌ طبيعيّ، وإجبارُه
     يجعله يكتب رقماً من رأسه. لكنه أهمُّ رقمٍ يُدخَل أصلاً — بلا وزنٍ لا معدّلَ
     تحويلٍ ولا كلفةَ كيلو، وهما سببُ فتحِه الشاشة. فيُعرض أثرُه فورَ الكتابة. */
  const [wg, setWg] = useState("");
  const [wn, setWn] = useState("");
  const [busy, setBusy] = useState(false);
  const wgNum = Number(wg), wnNum = Math.max(1, Math.round(Number(wn) || 1));
  const avgKg = wg.trim() !== "" && Number.isFinite(wgNum) && wgNum > 0 ? wgNum / wnNum / 1000 : null;
  /* الحكمُ على عمر **اليوم المُدخَل** لا على اليوم الحاليّ: من يقيّد وزنَ يوم
     السابع بعد أسبوع، سقفُ السابع هو الذي يُطبَّق عليه. */
  const entryAge = dayDiff(placedOn, date);
  const odd = weightSanity(avgKg, entryAge);

  // يومٌ سبق إدخالُه: تُعبّأ خاناتُه ليُصحَّح لا ليُكرَّر (القاعدةُ ترفض التكرار).
  useEffect(() => {
    setDead(existing ? String(existing.dead) : "");
    setCulled(existing ? String(existing.culled) : "");
    setNote(existing?.note ?? "");
    setWg(existing?.sample_weight_g != null ? String(existing.sample_weight_g) : "");
    setWn(existing?.sample_size != null ? String(existing.sample_size) : "");
  }, [existing]);

  const save = async () => {
    setBusy(true);
    try {
      await repo.savePoultryDaily({
        cycle_id: cycleId, on_date: date,
        dead: Math.max(0, Math.round(Number(dead) || 0)),
        culled: Math.max(0, Math.round(Number(culled) || 0)),
        // فارغٌ يبقى فارغاً: صفرٌ هنا يعني «وزنتُ فطلع صفر» ويُفسد المتوسّط.
        sample_weight_g: avgKg === null ? null : wgNum,
        sample_size: avgKg === null ? null : wnNum,
        note: note.trim() || null,
      });
      playSuccess(); toast.success(t("farm.daySaved")); onSaved();
    } catch (e) { playWarning(); toast.error(t("farm.saveFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/10">
      <h2 className="flex items-center gap-2 font-bold text-brand-800 dark:text-brand-200">
        <StickyNote size={17} /> {existing ? t("farm.editDay") : t("farm.todayEntry")}
      </h2>
      <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">{t("farm.dead")}</label>
          <input className="input" inputMode="numeric" value={dead} onChange={(e) => setDead(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="label">{t("farm.culled")}</label>
          <input className="input" inputMode="numeric" value={culled} onChange={(e) => setCulled(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr,auto] gap-2">
        <div>
          <label className="label">{t("farm.sampleWeight")}</label>
          <input className="input" inputMode="numeric" value={wg} onChange={(e) => setWg(e.target.value)} placeholder="0" />
        </div>
        <div className="w-24">
          <label className="label">{t("farm.sampleSize")}</label>
          <input className="input" inputMode="numeric" value={wn} onChange={(e) => setWn(e.target.value)} placeholder="1" />
        </div>
      </div>
      {avgKg !== null && (
        /* يُقال قبل الحفظ لا بعده: تصحيحُ رقمٍ بيده الآن أرخصُ من ملاحقته
           بالدفتر غداً. ولا يُمنع الحفظ — ربّما هو على حقّ ونحن لا نعرف. */
        <p className={cn("-mt-1 text-2xs font-semibold",
          odd ? "text-warn-800 dark:text-warn-200" : "text-brand-700 dark:text-brand-300")}>
          {t("farm.avgPreview", { n: formatDec(Math.round(avgKg * 1000) / 1000) })}
          {odd && <>
            {" — "}
            {t(odd === "low" ? "farm.oddLow" : "farm.oddHigh", { n: formatNum(entryAge) })}
          </>}
        </p>
      )}
      <div>
        <label className="label">{t("farm.note")}</label>
        <textarea className="input min-h-16" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("farm.notePlaceholder")} />
      </div>
      <Button className="w-full" onClick={save} disabled={busy}>{existing ? t("farm.updateDay") : t("farm.saveDay")}</Button>

      <ConsumeRow cycleId={cycleId} date={date} stock={stock} onDone={onSaved} />
    </section>
  );
}

/* ── صرفٌ من مخزن الحقل ─────────────────────────────────────────────────── */
function ConsumeRow({ cycleId, date, stock, onDone }: { cycleId: string; date: string; stock: Product[]; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [kind, setKind] = useState<PoultryUseKind>("feed");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  /* فترةُ السحب: خانةٌ **اختيارية** يكتبها من قرأ العلبة. لا سؤالَ إلزاميّ
     ولا رقاقةُ «ما مكتوبة»: سؤالٌ يتكرّر مع كلّ سطرِ دواءٍ احتكاكٌ يوميّ،
     والفراغُ يعني ببساطة «ما انكتبت». */
  const [wd, setWd] = useState("");
  const needsProduct = kind === "feed" || kind === "med";
  const isMed = kind === "med";
  const wdNum = wd.trim() === "" ? null : Math.round(Number(wd));
  const wdValid = wdNum !== null && Number.isFinite(wdNum) && wdNum >= 0 && wdNum <= 120;

  const submit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("farm.needQty")); return; }
    if (needsProduct && !productId) { playWarning(); toast.error(t("farm.needProduct")); return; }
    if (!needsProduct && !name.trim()) { playWarning(); toast.error(t("farm.needServiceName")); return; }
    setBusy(true);
    try {
      const r = await repo.poultryConsume({
        cycle_id: cycleId, kind, product_id: needsProduct ? productId : null,
        name: needsProduct ? null : name.trim(), qty: n, on_date: date,
        withdrawal_days: isMed && wdValid ? wdNum : null,
      });
      // النقصُ يُقال بصوت: «سجّلنا ٨٠٠ والمخزنُ كان ٥٠٠» — لا يُطمس.
      if (r.shortfall && r.shortfall > 0) {
        toast.error(t("farm.shortTitle"), t("farm.shortBody", { n: formatNum(Math.round(r.shortfall)) }));
      } else { playSuccess(); }
      // تاريخُ الأمان يُقال **لحظةَ الصرف**، لا بعد إعادة تحميلٍ قد لا تحصل.
      // ولا رسالةَ عتابٍ حين لا يُكتب: ما كُتب يُعرض، وما لم يُكتب يُترك.
      if (r.safe_from) toast.success(t("farm.wd.recorded"), t("farm.wd.safeFrom", { date: r.safe_from }));
      setQty(""); setName(""); setWd(""); onDone();
    } catch (e) {
      playWarning();
      const m = e instanceof Error ? e.message : "";
      toast.error(t("farm.saveFailed"), /not_farm_stock/.test(m) ? t("farm.notFarmStock") : /cycle_closed/.test(m) ? t("farm.batchClosed") : m || undefined);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-1 p-3">
      <div className="flex gap-1.5">
        {(["feed", "med", "service"] as const).map((k) => {
          const I = k === "feed" ? Wheat : k === "med" ? Syringe : Wrench;
          return (
            <button key={k} type="button" onClick={() => { setKind(k); setProductId(""); setWd(""); }}
              className={cn("flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-2xs font-bold transition",
                kind === k ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
              <I size={13} /> {t(`farm.use.${k}`)}
            </button>
          );
        })}
      </div>
      {needsProduct ? (
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{t("farm.pickFromStore")}</option>
          {stock.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatNum(p.stock ?? 0)}</option>)}
        </select>
      ) : (
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("farm.servicePlaceholder")} />
      )}
      {isMed && (
        <div className="space-y-1.5 rounded-lg border border-warn-200 bg-warn-50/60 p-2 dark:border-warn-500/30 dark:bg-warn-500/10">
          <label className="block text-2xs font-bold text-warn-800 dark:text-warn-200">{t("farm.wd.label")}</label>
          <input className="input" inputMode="numeric" value={wd}
            onChange={(e) => setWd(e.target.value)} placeholder={t("farm.wd.placeholder")} />
          {/* الأثرُ يُرى قبل الحفظ: «٧ أيام» رقمٌ مجرّد، و«آمن من ٢٩ أيلول» قرار. */}
          <p className="text-2xs text-warn-800/80 dark:text-warn-200/80">
            {wdValid ? (wdNum === 0 ? t("farm.wd.none") : t("farm.wd.preview", { date: addDays(date, wdNum as number) }))
              : t("farm.wd.fromBox")}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <input className="input flex-1" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={kind === "feed" ? t("farm.qtyKg") : t("farm.qty")} />
        <Button onClick={submit} disabled={busy} leftIcon={<Plus size={15} />}>{t("farm.addUse")}</Button>
      </div>
      {needsProduct && stock.length === 0 && <p className="text-2xs text-warn-700 dark:text-warn-300">{t("farm.emptyStore")}</p>}
    </div>
  );
}

/* ── دفترُ الحركات — «المسؤولُ يشوف حركاتِ كلّ يومٍ بالضبط» ────────────── */
/* ── خطّان صغيران — «شلون ماشية؟» ───────────────────────────────────────
 *
 * الشاشةُ كانت تقول أرقامَ اليوم وتاريخَه، ولا تقول **اتّجاهه**. وسؤالُ صاحب
 * الحقل ليس «شكد نفق اليوم» — هو «النفوقُ زايدٌ لو طبيعيّ؟ الوزنُ ماشٍ صح؟».
 * والبياناتُ كلُّها بيدنا أصلاً.
 *
 * ── وبلا مكتبةِ رسم ─────────────────────────────────────────────────────
 * حزمةُ الرسوم بالمشروع ١١٥ كيلو مضغوطة، و`store-weight-guard` يمنعها من
 * مسارٍ خفيف — واستيرادُها هنا يجرّها لكلّ من يفتح الحقل. وخطٌّ من ثلاثين
 * نقطةً لا يحتاجها: `polyline` واحدةٌ بـ`viewBox` تكفي.
 *
 * ── وما لا يُرسم ────────────────────────────────────────────────────────
 * نقطةٌ واحدةٌ ليست خطّاً. وبأقلَّ من نقطتين لا يُرسم شيء — خطٌّ مستقيمٌ من
 * قياسٍ واحدٍ يوحي باتّجاهٍ لم يُقَس.
 */
function Spark({ points, label, tone = "brand" }: {
  points: { x: number; y: number }[]; label: string; tone?: "brand" | "danger";
}) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  const W = 100, H = 28;
  // مدىً صفريٌّ (كلُّ القيم متساوية) يُرسم خطّاً بالوسط لا قسمةً على صفر.
  const sx = (x: number) => (x1 === x0 ? W / 2 : ((x - x0) / (x1 - x0)) * W);
  const sy = (y: number) => (y1 === y0 ? H / 2 : H - ((y - y0) / (y1 - y0)) * H);
  const d = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-0.5 text-2xs font-semibold text-ink-subtle">{label}</p>
      {/* `role="img"` واسمٌ معلَن: الخطُّ زينةٌ لمن لا يراه، والرقمُ بالترويسة
          هو المعلومة — فالاسمُ يحمل ملخّصَه لا شكلَه. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-7 w-full" role="img" aria-label={label}>
        <polyline
          points={d} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke"
          strokeLinecap="round" strokeLinejoin="round"
          className={tone === "danger" ? "stroke-danger-500" : "stroke-brand-500"}
        />
        <circle cx={sx(last.x)} cy={sy(last.y)} r={2.5} vectorEffect="non-scaling-stroke"
          className={tone === "danger" ? "fill-danger-600" : "fill-brand-600"} />
      </svg>
    </div>
  );
}

/** الخطّان معاً — يظهران حين يوجد ما يُرسم، ويختفيان بهدوءٍ حين لا يوجد. */
function Trends({ days, placedOn }: { days: PoultryDaily[]; placedOn: string }) {
  const { t } = useTranslation();
  const { weight, deaths } = useMemo(() => {
    const sorted = [...days].sort((a, b) => a.on_date.localeCompare(b.on_date));
    return {
      weight: sorted
        .filter((d) => (d.sample_weight_g ?? 0) > 0 && (d.sample_size ?? 1) > 0)
        .map((d) => ({ x: dayDiff(placedOn, d.on_date), y: (d.sample_weight_g as number) / (d.sample_size || 1) / 1000 })),
      deaths: sorted.map((d) => ({ x: dayDiff(placedOn, d.on_date), y: (d.dead || 0) + (d.culled || 0) })),
    };
  }, [days, placedOn]);

  if (weight.length < 2 && deaths.length < 2) return null;
  return (
    <div className="flex gap-4 rounded-xl border border-line bg-surface-1 p-3">
      <Spark points={weight} label={t("farm.trendWeight")} />
      <Spark points={deaths} label={t("farm.trendDeaths")} tone="danger" />
    </div>
  );
}

/* ── بطاقةُ القاعة — الشاشةُ تقول ما بقي على صاحبها اليوم ──────────────
 *
 * كانت تقول عمرَ الدفعة وعددَها، وبس. فمن عنده ستُّ قاعاتٍ لا يعرف أيَّها
 * كُتب اليوم إلا بفتح الجولة وقراءة خاناتها — أي أنّ سؤالَ «شنو باقي عليّ»
 * كان يكلّف ضغطتين وقراءةَ شاشة.
 *
 * فصارت تحمل ثلاثةً يقرؤها بنظرة: النفوقُ التراكميّ، وآخرُ إدخال، **ونقطةٌ
 * حمراء إن لم يُكتب اليوم**. والقائمةُ تنقلب من عرضٍ إلى قائمة مهام.
 *
 * وحالةٌ رابعةٌ تُقال ولا تُخمَّن: حين تتعذّر مجاميعُ الدفعة تُعرض «؟» —
 * **غيابُ النقطة الحمراء يُقرأ «انكتب اليوم»**، وهو ما لا نعرفه حينها. صمتٌ
 * هنا يعني طمأنينةً كاذبة، وهي عينُ ما يجعل يوماً يضيع بلا أن ينتبه أحد.
 */
function HouseCard({ cycle, stats, onOpen }: {
  cycle: PoultryCycle; stats: PoultryCycleStats | null | undefined; onOpen: () => void;
}) {
  const { t } = useTranslation();
  /* ثلاثُ حالاتٍ لا اثنتان، وخلطُها كان يُنتج تناقضاً على السطر الواحد:
   *   • `undefined` — لم تصل بعد. لا ندّعي شيئاً (رمادٌ و«…»). كانت تسقط على
   *     فرع «ماكو إدخال بعد» **بالأحمر**، فتتّهم دفعةً سُجّلت شهراً كاملاً.
   *   • `null`      — تعذّرت. نقولها صراحةً.
   *   • صفٌّ        — معروفة.
   */
  const state: "loading" | "failed" | "ok" = stats === undefined ? "loading" : stats === null ? "failed" : "ok";
  /* **ونفوقٌ صفرٌ ليس نفوقاً صفراً حين لم يُعدّ أحدٌ يوماً.** `poultry_cycle_stats`
   * تبني النفوقَ بـ`coalesce(...,0)` على وصلةٍ يسرى، فدفعةٌ بلا أيّ إدخالٍ
   * ترجع صفّاً سليماً دَخلُه صفر. وكانت البطاقةُ تقول «💀 ٠٪» وتحتها مباشرةً
   * «ماكو إدخال بعد» — سطران يتناقضان، وأحدُهما يطمئن. فالمقياسُ `last_entry`:
   * بلا إدخالٍ واحد لا نسبةَ نفوقٍ أصلاً. */
  const last = state === "ok" ? stats!.last_entry : null;
  const counted = state === "ok" && last != null;
  const mortality = counted && stats!.placed_count > 0 ? ((stats!.dead + stats!.culled) / stats!.placed_count) * 100 : null;
  const todayDone = last === todayISO();

  return (
    <button onClick={onOpen}
      className="mt-3 flex w-full items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-start transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10">
      <Layers size={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-brand-800 dark:text-brand-200">
          {t("farm.activeBatch", { n: formatNum(cycle.placed_count) })}
        </span>
        <span className="block text-2xs text-brand-700 dark:text-brand-300">
          {t("farm.ageDays", { n: formatNum(ageOf(cycle)) })}
          {/* «—» لا صفرٌ ولا «؟»: نفسُ ما تعرضه ترويسةُ الدفعة لرقمٍ لم يُقَس. */}
          {state !== "loading" && <> · <Skull size={10} className="inline" />{" "}
            {/* خانتان لا واحدة: أربعةُ نوافقَ من عشرين ألفاً = ٠٫٠٢٪، وبخانةٍ
                واحدةٍ تُعرض «٠٪» — وهي نفسُ العلّة التي أُصلحت بترويسة الدفعة. */}
            {mortality === null ? "—" : `${formatDec(Math.round(mortality * 100) / 100)}%`}</>}
        </span>
        {/* سطرُ الحالة: أحمرُ ما لم يُكتب اليوم، ورماديٌّ هادئٌ حين كُتب. */}
        {/* سطرُ الحالة: أحمرُ **فقط** حين نعرف أنّ اليوم لم يُكتب. أمّا قبل وصول
            الحالة أو عند تعذّرها فرماديٌّ صامت — نقطةٌ حمراءُ عن جهلٍ إنذارٌ
            كاذبٌ يُعلَّم بعد مرّتين فيُهمَل حين يصدق. */}
        <span className={cn("mt-0.5 flex items-center gap-1 text-2xs font-bold",
          state !== "ok" ? "text-ink-subtle"
            : todayDone ? "text-success-700 dark:text-success-300"
              : "text-danger-700 dark:text-danger-300")}>
          <Circle size={7} className={cn("shrink-0", state !== "ok" ? "fill-ink-subtle" : todayDone ? "fill-success-500" : "fill-danger-500")} />
          {/* التاريخُ بمقطعٍ لاتينيّ خاصٍّ به: مُدرَجاً بنصٍّ عربيٍّ يُقلب بصرياً
              (١٧-٠٩-٢٠٢٦) — نفسُ ما وقع بسطر «انغلقت بـ»، وقِيس بلقطة شاشة. */}
          {state === "loading" ? t("farm.statusLoading")
            : state === "failed" ? t("farm.lastUnknown")
              : todayDone ? t("farm.doneToday")
                : last ? <>{t("farm.lastEntry")} <span dir="ltr">{last}</span></>
                  : t("farm.neverEntered")}
        </span>
      </span>
      <ArrowRight size={15} className="shrink-0 text-brand-600 ltr:-scale-x-100 dark:text-brand-300" />
    </button>
  );
}

/* ── دفترُ الحركات — ينطوي بأسابيع ─────────────────────────────────────
 *
 * ── المقيس ───────────────────────────────────────────────────────────────
 * بعشرين يومٍ صارت صفحةُ الدفعة **٣٬٢٤٠ بكسلاً** بشاشة تلفون، والدفعةُ تعيش
 * خمسةً وثلاثين إلى أربعين — أي ضعفَ ذلك. وزرُّ «اغلق الدفعة» بالقاع، فمن
 * يريد إغلاقَ دورته يمرّ على تاريخها كلِّه. وكلُّ يومٍ يشبه الذي قبله، فالجدارُ
 * لا يُقرأ أصلاً: يُمرَّر.
 *
 * ── ولماذا الأسبوع وحدةَ الطيّ ──────────────────────────────────────────
 * ليس اختياراً جمالياً: دورةُ اللاحم تُدار **بالأسبوع** — العلفُ يتبدّل صنفُه
 * بأسبوع، والوزنُ يُقاس أسبوعياً، والنفوقُ يُقارَن بأسبوعه لا بيومه. فالطيُّ
 * بالأسبوع يطابق الطريقةَ التي يفكّر بها صاحبُ الحقل، والملخّصُ يصير معلومةً
 * جديدةً لم تكن معروضةً أصلاً — لا مجرّدَ إخفاء.
 *
 * ── وأسبوعُ اليوم مفتوحٌ دائماً ─────────────────────────────────────────
 * ما يُراجَع بعد ساعةٍ من كتابته هو أيّامُ هذا الأسبوع. فطيُّها كان سيبدّل
 * جداراً بضغطةٍ إضافيةٍ يوميّة — وهذا ليس تسهيلاً.
 *
 * ── والمجاميعُ تُحسب هنا لا بالقاعدة ────────────────────────────────────
 * الأيامُ والسطورُ وصلت الشاشةَ كلُّها أصلاً (`CycleView` تجلبها للمؤشّرات).
 * فجمعُها قسمةٌ على ما بيدنا، لا استعلامٌ جديد.
 */
function DayLog({ days, uses, placedOn, through }: { days: PoultryDaily[]; uses: PoultryUse[]; placedOn: string; through: string }) {
  const { t } = useTranslation();

  const weeks = useMemo(() => batchWeeks(days, uses, placedOn, through), [days, uses, placedOn, through]);

  const newest = weeks[0]?.week ?? 0;
  const [open, setOpen] = useState<Set<number>>(() => new Set([newest]));
  // دفعةٌ تعبر أسبوعاً جديداً وهي مفتوحة: الأسبوعُ الجديد يُفتح ولا يبقى مطويّاً.
  useEffect(() => { setOpen((s) => (s.has(newest) ? s : new Set([...s, newest]))); }, [newest]);

  if (!weeks.length) return <Empty icon={PackageX} text={t("farm.noEntries")} />;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-ink-muted">{t("farm.log")}</h2>
      {weeks.map((w) => {
        const isOpen = open.has(w.week);
        return (
          <div key={w.week} className="overflow-hidden rounded-xl border border-line bg-surface-1">
            <button type="button" onClick={() => { playTap(); setOpen((s) => { const n = new Set(s); if (n.has(w.week)) n.delete(w.week); else n.add(w.week); return n; }); }}
              className="flex w-full items-center gap-2 p-3 text-start transition hover:bg-surface-2">
              <ChevronDown size={15} className={cn("shrink-0 text-ink-subtle transition", isOpen && "rotate-180")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">
                  {t("farm.weekN", { n: formatNum(w.week) })}
                  <span className="ms-1.5 text-2xs font-semibold text-ink-subtle">{t("farm.dayRange", { a: formatNum(w.from), b: formatNum(w.to) })}</span>
                </span>
                {/* الملخّصُ هو الفائدة: ما كان أحدٌ يجمعه بعينه من عشرين سطراً. */}
                <span className="block text-2xs text-ink-muted">
                  {/* «٠» عن أسبوعٍ لم يُعدّ فيه يومٌ واحد تُقرأ «ما نفق شيء».
                      فبلا عدٍّ «—»، وبعدٍّ ناقصٍ يُقال كم يوماً منه عُدّ. */}
                  <Skull size={11} className="inline" />{" "}
                  {w.daysEntered === 0 ? "—" : formatNum(w.dead + w.culled)}
                  {w.daysEntered > 0 && w.daysEntered < w.daysElapsed && (
                    <span className="text-warn-700 dark:text-warn-300"> ({t("farm.ofDays", { a: formatNum(w.daysEntered), b: formatNum(w.daysElapsed) })})</span>
                  )}
                  {/* بلا `Math.round`: مجموعُ المقرَّبات ≠ تقريبُ المجموع، فكان
                      طيُّ ثلاثةِ أسابيعَ يعطي ٣٠٠ والترويسةُ ٣٠١ بلا تفسير.
                      `formatDec` تُبقي الكسرَ حين يوجد وتخفيه حين لا يوجد. */}
                  {w.feedKg > 0 && <> · <Wheat size={11} className="inline" /> {formatDec(w.feedKg)}</>}
                  {w.weightKg != null && <> · <Scale size={11} className="inline" /> {formatDec(Math.round(w.weightKg * 100) / 100)}</>}
                  {w.cost > 0 && <> · {money(w.cost)}</>}
                </span>
              </span>
            </button>
            {isOpen && (
              <div className="space-y-2 border-t border-line p-3">
                {w.rows.map((e) => (
                  <div key={e.date}>
                    <p className="mb-1 font-display text-2xs font-bold tabular-nums text-ink" dir="ltr">{e.date}</p>
                    {e.day && (e.day.dead > 0 || e.day.culled > 0) && (
                      <p className="text-2xs text-ink-muted">
                        <Skull size={11} className="inline" /> {t("farm.deadN", { n: formatNum(e.day.dead) })}
                        {e.day.culled > 0 && ` · ${t("farm.culledN", { n: formatNum(e.day.culled) })}`}
                      </p>
                    )}
                    {e.day?.sample_weight_g != null && e.day.sample_weight_g > 0 && (
                      <p className="text-2xs text-ink-muted">
                        <Scale size={11} className="inline" />{" "}
                        {t("farm.avgPreview", { n: formatDec(Math.round((e.day.sample_weight_g / (e.day.sample_size || 1) / 1000) * 100) / 100) })}
                      </p>
                    )}
                    {e.uses.map((u) => (
                      <p key={u.id} className="text-2xs text-ink-muted">
                        {u.kind === "feed" ? <Wheat size={11} className="inline" /> : u.kind === "med" ? <Syringe size={11} className="inline" /> : <Wrench size={11} className="inline" />}{" "}
                        {u.name} · {formatNum(u.qty)}{u.line_cost > 0 && ` · ${money(u.line_cost)}`}
                        {/* الفاصلُ خارجَ المقطع اللاتينيّ: `dir="ltr"` يجرّ النقطةَ لطرفه
                            فتلتصق «د.ع» بـ«آمن» بلا مسافة — قِيس بلقطة شاشة.
                            وما لم يُكتب رقمٌ لا يُكتب شيء: الفراغُ هنا فراغٌ لا تهمة. */}
                        {u.kind === "med" && u.withdrawal_days != null && <> · {u.withdrawal_days === 0
                          ? <span>{t("farm.wd.none")}</span>
                          : <span dir="ltr">{t("farm.wd.safeFromShort", { date: addDays(u.on_date, u.withdrawal_days) })}</span>}</>}
                      </p>
                    ))}
                    {e.day?.note && <p className="mt-0.5 text-2xs italic text-ink-subtle">{e.day.note}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ── إغلاقُ الدفعة — بلا تاريخٍ لا حصيلة ───────────────────────────────── */
/* ── إغلاقُ الدفعة ───────────────────────────────────────────────────────
 *
 * **بلا أيّ منع** — بكلمة المالك (١٨ أيلول): «لا تسوّي منع على الإغلاق بالذبح
 * أو غيرها؛ الحقلُ يعرف بروتوكولاته». كان هنا تأكيدٌ مكتوبٌ يُطلب حين تُغلق
 * الدفعةُ قبل تاريخ الأمان، فرُفع. نحن **دفترٌ يَذكر** لا جهةٌ تُجيز: النظامُ
 * يعرض ما يعرفه، والقرارُ لصاحب الحقل.
 */
function CloseCycle({ cycleId, onClosed }: { cycleId: string; onClosed: (c: PoultryCycle) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sold, setSold] = useState("");
  const [kg, setKg] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const c = await repo.closePoultryCycle(cycleId, {
        closed_on: todayISO(),
        sold_count: Number(sold) || null, sold_weight_kg: Number(kg) || null, sale_total: Number(total) || null,
      });
      if (c) { onClosed(c); setOpen(false); playSuccess(); }
    } catch (e) { playWarning(); toast.error(t("farm.saveFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  if (!open) return <Button className="w-full" variant="ghost" onClick={() => { playTap(); setOpen(true); }}>{t("farm.closeBatch")}</Button>;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-1 p-4">
      <p className="text-2xs text-ink-subtle">{t("farm.closeHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">{t("farm.soldCount")}</label><input className="input" inputMode="numeric" value={sold} onChange={(e) => setSold(e.target.value)} /></div>
        <div><label className="label">{t("farm.soldKg")}</label><input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} /></div>
      </div>
      <div><label className="label">{t("farm.saleTotal")}</label><input className="input" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={submit} disabled={busy}>{t("farm.closeBatch")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("farm.cancel")}</Button>
      </div>
    </div>
  );
}

/* ── جولةُ اليوم — كلُّ القاعات بشاشةٍ واحدة ────────────────────────────
 *
 * ── المقيس، وهو سببُ وجودها ─────────────────────────────────────────────
 * إدخالُ يومِ قاعةٍ واحدةٍ كان: حقول ⇐ حقل ⇐ قاعة ⇐ دفعة ⇐ اكتب = أربعُ
 * ضغطاتٍ **قبل أوّل رقم**. وحقلٌ بستّ قاعاتٍ أربعٌ وعشرون ضغطةً كلَّ يوم،
 * ومن يدفع هذا الثمنَ يومياً يتوقّف بالأسبوع الثاني — ودفترٌ ينقطع أسوأُ من
 * دفترٍ لم يُفتح: مؤشّراتُه تُحسب على علفٍ نصفِ مسجَّل فتكذب بثقة.
 *
 * ── وما تجمعه هذه الشاشة، ولماذا هذا بالضبط ────────────────────────────
 * جولةُ الصباح ثلاثةُ أرقام: كم نفق، كم استُبعد، وكم علفاً نزل. ووزنُ العيّنة
 * **ليس هنا** — يُوزن أسبوعياً لا يومياً، ووضعُه بالجولة يجعل خانةً تبقى
 * فارغةً ستّةَ أيامٍ من سبعة فتُقرأ إهمالاً. مكانُه شاشةُ الدفعة.
 *
 * ── والعلفُ صنفٌ واحدٌ للجولة كلِّها ────────────────────────────────────
 * ليس تبسيطاً: الحقلُ يفتح كيسَ علفٍ واحدٍ ويوزّعه على الجملونات. واختيارُ
 * صنفٍ لكلّ سطرٍ كان يعني ستَّ قوائمَ منسدلة بشاشةِ تلفونٍ واحدة. ومن عنده
 * أصنافٌ مختلفةٌ لقاعاتٍ مختلفة يدخل الدفعةَ نفسَها — الطريقُ القديم باقٍ.
 *
 * ── والحفظُ سطراً سطراً، والفشلُ يُسمّى ────────────────────────────────
 * ستُّ قاعاتٍ بمعاملةٍ واحدةٍ تعني أنّ فشلَ الأخيرة يمحو الخمسَ قبلها. فكلُّ
 * سطرٍ يُحفظ وحدَه، والنتيجةُ تُقال بالعدد: «انحفظت ٥ من ٦ — راجع جملون ٣».
 * لا «تمّ» عن نصفِ عمل.
 */
function DailyRound({ farm, rows, onBack }: {
  farm: PoultryFarm; rows: { house: PoultryHouse; cycle: PoultryCycle }[]; onBack: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [stock, setStock] = useState<Product[]>([]);
  const [feedId, setFeedId] = useState("");
  const [vals, setVals] = useState<Record<string, { dead: string; culled: string; feed: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const set = (id: string, k: "dead" | "culled" | "feed", v: string) =>
    setVals((s) => ({ ...s, [id]: { ...(s[id] ?? { dead: "", culled: "", feed: "" }), [k]: v } }));

  /* يومٌ سبق إدخالُه تُعبّأ خاناتُه: الجولةُ تُفتح مرّتين بنفس اليوم أحياناً
     (نسي قاعةً فرجع)، وشاشةٌ فارغةٌ حينها تغري بإعادة كتابة ما كُتب. */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, ...days] = await Promise.all([
        repo.listFarmProducts(farm.id),
        ...rows.map((r) => repo.listPoultryDaily(r.cycle.id)),
      ]);
      setStock(items ?? []);
      const next: Record<string, { dead: string; culled: string; feed: string }> = {};
      rows.forEach((r, i) => {
        const d = (days[i] as PoultryDaily[] | undefined)?.find((x) => x.on_date === date);
        next[r.cycle.id] = { dead: d ? String(d.dead) : "", culled: d ? String(d.culled) : "", feed: "" };
      });
      setVals(next);
    } catch (e) { toast.error(t("farm.loadFailed"), e instanceof Error ? e.message : undefined); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.id, date, t, toast]);
  useEffect(() => { void load(); }, [load]);

  const touched = (v?: { dead: string; culled: string; feed: string }) =>
    !!v && (v.dead.trim() !== "" || v.culled.trim() !== "" || v.feed.trim() !== "");

  const saveAll = async () => {
    const todo = rows.filter((r) => touched(vals[r.cycle.id]));
    if (!todo.length) { playWarning(); toast.error(t("farm.round.nothing")); return; }
    setBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const r of todo) {
      const v = vals[r.cycle.id];
      try {
        await repo.savePoultryDaily({
          cycle_id: r.cycle.id, on_date: date,
          dead: Math.max(0, Math.round(Number(v.dead) || 0)),
          culled: Math.max(0, Math.round(Number(v.culled) || 0)),
        } as Parameters<typeof repo.savePoultryDaily>[0]);
        const kg = Number(v.feed);
        if (feedId && Number.isFinite(kg) && kg > 0) {
          await repo.poultryConsume({ cycle_id: r.cycle.id, kind: "feed", product_id: feedId, qty: kg, on_date: date });
        }
        ok++;
      } catch { failed.push(r.house.label); }
    }
    setBusy(false);
    if (failed.length) {
      playWarning();
      toast.error(t("farm.round.partial", { ok: formatNum(ok), all: formatNum(todo.length) }), failed.join("، "));
    } else { playSuccess(); toast.success(t("farm.round.saved", { n: formatNum(ok) })); onBack(); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <BackBar title={t("farm.round.title")} onBack={onBack} />
      <input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />

      {stock.length > 0 && (
        <select className="input" value={feedId} onChange={(e) => setFeedId(e.target.value)}>
          <option value="">{t("farm.round.pickFeed")}</option>
          {stock.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatNum(p.stock ?? 0)}</option>)}
        </select>
      )}

      {loading ? <div className="grid py-10 place-items-center"><Loader2 className="animate-spin text-brand-500" size={22} /></div> : (
        <ul className="space-y-2">
          {rows.map(({ house, cycle }) => {
            const v = vals[cycle.id] ?? { dead: "", culled: "", feed: "" };
            return (
              <li key={cycle.id} className="rounded-2xl border border-line bg-surface-1 p-3">
                <p className="mb-2 flex items-baseline gap-2">
                  <span className="truncate font-bold text-ink">{house.label}</span>
                  <span className="text-2xs text-ink-subtle">{t("farm.ageDays", { n: formatNum(ageOf(cycle)) })}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label">{t("farm.dead")}</label>
                    <input className="input" inputMode="numeric" value={v.dead} placeholder="0"
                      onChange={(e) => set(cycle.id, "dead", e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t("farm.culled")}</label>
                    <input className="input" inputMode="numeric" value={v.culled} placeholder="0"
                      onChange={(e) => set(cycle.id, "culled", e.target.value)} />
                  </div>
                  <div>
                    <label className="label">{t("farm.qtyKg")}</label>
                    {/* بلا صنفٍ مختارٍ لا خانةَ علف: خانةٌ تقبل رقماً ثم تُهمله
                        بصمتٍ أسوأُ من خانةٍ مقفلة. */}
                    <input className="input" inputMode="decimal" value={v.feed} placeholder={feedId ? "0" : "—"}
                      disabled={!feedId} onChange={(e) => set(cycle.id, "feed", e.target.value)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button className="w-full" onClick={saveAll} disabled={busy || loading}>{t("farm.round.save")}</Button>
      {stock.length === 0 && <p className="text-center text-2xs text-ink-subtle">{t("farm.round.noFeed")}</p>}
    </div>
  );
}

/* ── حصيلةُ الدفعة — الجوابُ الذي يُغلق الدفتر ──────────────────────────
 *
 * كانت الدفعةُ المغلقة تقول «الدفعةُ مغلقة» ولا شيءَ غير ذلك: نجمع منه العددَ
 * المباعَ والوزنَ والمبلغ عند الإغلاق ثم **لا نرجّع له الجواب**. وهو الغايةُ
 * من الدفتر كلِّه: شكد كلّفني الكيلو، وشكد طلع بالآخر.
 *
 * وما لم يُدخَل يبقى غائباً: من أغلق بلا أرقامِ بيعٍ يرى الكلفةَ وحدَها —
 * لا ربحاً صفرياً مُدّعىً.
 */
function Outcome({ cycle, outcome }: { cycle: PoultryCycle; outcome: ReturnType<typeof poultryOutcome> }) {
  const { t } = useTranslation();
  const win = (outcome.profit ?? 0) >= 0;
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Trophy size={16} /> {t("farm.outcome")}</h2>
      {/* التاريخُ بمقطعٍ لاتينيّ خاصٍّ به: مُدرَجاً بنصٍّ عربيٍّ كان يُقلب
          بصرياً (١٨-٠٩-٢٠٢٦) — قِيس بلقطة شاشة. */}
      <p className="text-2xs text-ink-subtle">{t("farm.closedOn")} <span dir="ltr">{cycle.closed_on}</span></p>
      <div className="grid grid-cols-2 gap-2">
        {cycle.sold_count != null && <Stat icon={Bird} label={t("farm.soldCount")} value={formatNum(cycle.sold_count)} />}
        {outcome.soldWeightKg != null && <Stat icon={Scale} label={t("farm.soldKg")} value={formatNum(Math.round(outcome.soldWeightKg))} />}
        {outcome.costPerSoldKg != null && <Stat icon={Coins} label={t("farm.costPerSoldKg")} value={money(outcome.costPerSoldKg)} />}
        {outcome.saleTotal != null && <Stat icon={Coins} label={t("farm.saleTotal")} value={money(outcome.saleTotal)} />}
      </div>
      {outcome.profit != null && (
        <p className={cn("rounded-xl p-3 text-center text-sm font-bold",
          win ? "bg-success-50 text-success-800 dark:bg-success-500/10 dark:text-success-200"
            : "bg-danger-50 text-danger-800 dark:bg-danger-500/10 dark:text-danger-200")}>
          {win ? t("farm.profit") : t("farm.loss")}{" "}
          <span className="font-display tabular-nums">{money(Math.abs(outcome.profit))}</span>
          {outcome.marginPct != null && <span className="ms-1 text-2xs">({formatDec(Math.abs(outcome.marginPct))}%)</span>}
        </p>
      )}
    </section>
  );
}

/* ── شارةُ فترة السحب — **تذكيرٌ لا إنذار** ──────────────────────────────
 *
 * كانت ثلاثَ حالاتٍ إحداها حمراءُ تصرخ «فترةُ سحبٍ مجهولة» كلّما نقص رقمٌ.
 * وبكلمة المالك (١٨ أيلول) نحن لسنا جهةَ رقابة: «الحقلُ يعرف بروتوكولاته».
 * فما نعرفه يُعرض، وما لا نعرفه **يُترك بلا عتاب** — شاشةٌ تلوم كلَّ يومٍ
 * تُغلَق، ودفترٌ هادئ يُقرأ.
 *
 * فحالتان: «باقي كذا يوم» بلونِ تنبيهٍ ما دام التاريخُ بالمستقبل، ثم «انتهت»
 * بالأخضر. وبلا رقمٍ مكتوبٍ أصلاً: لا شارة.
 */
function WithdrawalBanner({ stats }: { stats: PoultryCycleStats | null }) {
  const { t } = useTranslation();
  const safe = stats?.safe_from ?? null;
  if (!safe) return null;
  const left = daysUntil(safe);
  const pending = left > 0;
  const Icon = pending ? ShieldAlert : ShieldCheck;
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-2xs font-semibold",
      pending
        ? "border-warn-200 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200"
        : "border-success-200 bg-success-50 text-success-800 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200")}>
      <Icon size={16} className="mt-px shrink-0" />
      <span>{pending ? t("farm.wd.pendingBanner", { date: safe, n: formatNum(left) }) : t("farm.wd.doneBanner", { date: safe })}</span>
    </div>
  );
}

/* ── مشتركات ───────────────────────────────────────────────────────────── */
function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex items-center gap-2">
      {/* زرُّ الرجوع سهمٌ بلا نصّ — بلا اسمٍ معلَنٍ يسمعه قارئُ الشاشة «زر». */}
      <button onClick={() => { playTap(); onBack(); }} aria-label={t("common.back")} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:text-ink">
        <ArrowRight size={17} className="ltr:-scale-x-100" />
      </button>
      <h1 className="min-w-0 flex-1 truncate font-display text-lg font-extrabold text-ink">{title}</h1>
    </header>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof Bird; label: string; value: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-xl border p-3", tone === "warn" ? "border-warn-200 bg-warn-50/60 dark:border-warn-500/30 dark:bg-warn-500/10" : "border-line bg-surface-1")}>
      <p className="flex items-center gap-1 text-2xs font-semibold text-ink-subtle"><Icon size={12} /> {label}</p>
      <p className={cn("mt-0.5 font-display text-lg font-extrabold tabular-nums", tone === "warn" ? "text-warn-800 dark:text-warn-200" : "text-ink")}>{value}</p>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Bird; text: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line py-12 text-center">
      <Icon size={26} className="text-ink-subtle/50" />
      <p className="text-sm font-semibold text-ink-subtle">{text}</p>
    </div>
  );
}

/* ── مخزنُ الحقل — نفسُ جدول المنتجات، وجهُه الآخر ─────────────────────── */
function FarmStore({ farmId, canWrite }: { farmId: string; canWrite: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await repo.listFarmProducts(farmId)); }
    catch (e) { toast.error(t("farm.loadFailed"), e instanceof Error ? e.message : undefined); }
  }, [farmId, t, toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const submit = async () => {
    if (!name.trim()) { playWarning(); toast.error(t("farm.needItemName")); return; }
    setBusy(true);
    try {
      /* `farm_id` يجعله مخزنَ الحقل: لا يظهر بمخزن العيادة ولا يُمسح بكاشيرها،
         و`sell_price: 0` لأنه لا يُباع — يُستهلك بسعر شرائه (قرارُ المالك). */
      await repo.createProduct({
        name: name.trim(), barcode: code.trim() || null,
        purchase_price: Number(cost) || 0, sell_price: 0,
        stock: Number(qty) || 0, farm_id: farmId,
      } as Parameters<typeof repo.createProduct>[0]);
      setName(""); setQty(""); setCost(""); setCode(""); setAdding(false);
      playSuccess(); await load();
    } catch (e) { playWarning(); toast.error(t("farm.saveFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  if (!open) {
    return <Button className="w-full" variant="ghost" leftIcon={<Boxes size={16} />} onClick={() => { playTap(); setOpen(true); }}>{t("farm.store")}</Button>;
  }
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface-1 p-4">
      <h2 className="flex items-center gap-2 font-bold text-ink"><Boxes size={17} /> {t("farm.store")}</h2>
      {rows.length === 0 ? <p className="py-3 text-center text-2xs text-ink-subtle">{t("farm.storeEmpty")}</p> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{r.name}</span>
              {/* رصيدٌ سالبٌ يُعرض أحمرَ لا يُقصّ: هو إشارةُ «راجع المخزن». */}
              <span className={cn("font-display text-sm font-bold tabular-nums", (r.stock ?? 0) < 0 ? "text-danger-600 dark:text-danger-400" : "text-ink-muted")}>
                {formatDec(r.stock ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (adding ? (
        <div className="space-y-2 border-t border-line pt-2">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("farm.itemName")} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={t("farm.itemQty")} />
            <input className="input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t("farm.itemCost")} />
          </div>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("farm.itemCode")} dir="ltr" />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={busy}>{t("farm.save")}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t("farm.cancel")}</Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" variant="secondary" leftIcon={<Plus size={15} />} onClick={() => { playTap(); setAdding(true); }}>{t("farm.addItem")}</Button>
      ))}
      <Button className="w-full" variant="ghost" onClick={() => setOpen(false)}>{t("farm.hide")}</Button>
    </section>
  );
}

/* ── الجردُ الكامل — «حركاتُ كلّ يومٍ بالضبط، بالأرقام الفعلية» ────────── */
function ExportLedger({ farm, houses, cycles }: { farm: PoultryFarm; houses: PoultryHouse[]; cycles: PoultryCycle[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const head = [t("farm.csv.house"), t("farm.csv.batch"), t("farm.csv.date"), t("farm.csv.day"),
        t("farm.csv.kind"), t("farm.csv.item"), t("farm.csv.qty"), t("farm.csv.cost"),
        t("farm.csv.withdrawal"), t("farm.csv.safeFrom"), t("farm.csv.note")];
      /* اسمُ الحقل صفَّ عنوانٍ داخل الملف لا باسمه: `asciiFileName` يُسقط
         العربيَّ من الاسم عمداً، فلو لم يُكتب هنا لخرج جردُ كلِّ حقلٍ بنفس
         الاسم — وملفّان بنفس الاسم بمجلّد التنزيلات يصيران «(1)» ولا يُعرفان. */
      const out: string[][] = [];
      // صفٌّ لكلّ حركةٍ بكلّ يومٍ بكلّ دفعة — لا مجاميعَ تخفي ما تحتها.
      for (const c of cycles) {
        const label = houses.find((h) => h.id === c.house_id)?.label ?? "—";
        const batch = `${c.placed_on} · ${c.placed_count}`;
        const [days, uses] = await Promise.all([repo.listPoultryDaily(c.id), repo.listPoultryUse(c.id)]);
        const dayNo = (d: string) => dayDiff(c.placed_on, d);
        for (const d of days) {
          if (d.dead > 0) out.push([label, batch, d.on_date, String(dayNo(d.on_date)), t("farm.csv.dead"), "", String(d.dead), "", "", "", d.note ?? ""]);
          if (d.culled > 0) out.push([label, batch, d.on_date, String(dayNo(d.on_date)), t("farm.csv.culled"), "", String(d.culled), "", "", "", ""]);
          if (d.dead === 0 && d.culled === 0 && d.note) out.push([label, batch, d.on_date, String(dayNo(d.on_date)), t("farm.csv.noteOnly"), "", "", "", "", "", d.note]);
        }
        for (const u of uses) {
          const wd = u.kind === "med" && u.withdrawal_days != null ? String(u.withdrawal_days) : "";
          const sf = u.kind === "med" && u.withdrawal_days != null ? addDays(u.on_date, u.withdrawal_days) : "";
          out.push([label, batch, u.on_date, String(dayNo(u.on_date)), t(`farm.use.${u.kind}`), u.name, String(u.qty), String(Math.round(u.line_cost)), wd, sf, u.note ?? ""]);
        }
      }
      if (out.length === 0) { toast.error(t("farm.nothingToExport")); return; }
      out.unshift([farm.name, todayISO()], [], head);
      /* BOM أوّلاً: إكسل بلا علامة الترتيب يقرأ UTF-8 العربيَّ رموزاً مشوّهة —
         وجردٌ لا يُقرأ ليس جرداً. */
      const csv = "﻿" + out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      /* اسمٌ لاتينيّ و`a` داخل المستند: كروم يُهمل `download` العربيَّ كلَّه
         فينزل «download» بلا امتداد، ويفتحه ويندوز بأيّ برنامجٍ إلا إكسل. */
      const a = document.createElement("a");
      a.style.display = "none";
      document.body.appendChild(a);
      a.href = url;
      a.download = asciiFileName(`${farm.name} ledger ${todayISO()}`, `farm-ledger-${todayISO()}`, "csv");
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
      playSuccess();
    } catch (e) { playWarning(); toast.error(t("farm.exportFailed"), e instanceof Error ? e.message : undefined); }
    finally { setBusy(false); }
  };

  if (!cycles.length) return null;
  return <Button className="w-full" variant="ghost" leftIcon={<Download size={16} />} onClick={run} disabled={busy}>{t("farm.exportLedger")}</Button>;
}
