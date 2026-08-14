import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Coins, Wallet, ArrowLeft, Lock, Building2, RefreshCw, Users, Sparkles, XCircle, Lightbulb, Check, Stethoscope, PawPrint, Receipt, Activity, AlertTriangle, Tag, MessageCircle, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin, getUsdRate, setUsdRate, adminActivate, adminGrantTrial, adminCancelSubscription, adminListClinics, adminSetPlanPrice, adminActivateDays, adminSetLimits, hydratePlanPrices, type AdminClinic } from "@/lib/platformAdmin";
import { PLANS, usdToIqd, priceUsd, planPrice, type BillingPeriod, type PlanId } from "@/lib/plans";
import { repo } from "@/lib/repo";
import type { FeatureRequest } from "@/types";
import { Button, Badge, Skeleton, useToast } from "@/components/ui";
import { money, formatNum, formatDate, cn } from "@/lib/utils";
import { playSuccess, playWarning, playTap } from "@/lib/sounds";

const STATUS_META: Record<string, { label: string; tone: "success" | "brand" | "warn" | "danger" }> = {
  active: { label: "نشط", tone: "success" },
  trialing: { label: "تجربة", tone: "brand" },
  expired: { label: "منتهي", tone: "warn" },
  locked: { label: "مقفل", tone: "danger" },
};

/** «قبل ٣ أيام» بدل تاريخ خام — المشغّل يريد يعرف بُعد النبض، لا اليوم بالضبط. */
function sinceLabel(iso: string | null): string {
  if (!iso) return "ما بدأت";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return "قبل شوية";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${formatNum(hrs)} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "أمس";
  if (days < 30) return `قبل ${formatNum(days)} يوم`;
  const months = Math.floor(days / 30);
  return months < 12 ? `قبل ${formatNum(months)} شهر` : `قبل ${formatNum(Math.floor(months / 12))} سنة`;
}

/** رقم واحد مع أيقونته — الصف يُقرأ بلمحة بدل ما يُفكّ. */
function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", tone ?? "text-ink-muted")} title={label}>
      {icon}
      <b className="tabular-nums text-ink">{formatNum(value)}</b>
      <span className="text-2xs">{label}</span>
    </span>
  );
}


/** حصة واحدة: مستهلَك/سقف + شريط يحمرّ عند الاقتراب — المشغّل يشوف من وصل
 *  الحد قبل ما تتصل العيادة تشتكي. */
function QuotaPill({ icon, used, limit, label }: { icon: React.ReactNode; used: number; limit: number | null; label: string }) {
  if (limit == null) return null;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const tone = pct >= 100 ? "text-danger-600" : pct >= 80 ? "text-warn-600" : "text-ink-muted";
  const bar = pct >= 100 ? "bg-danger-500" : pct >= 80 ? "bg-warn-500" : "bg-brand-500";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", tone)} title={`${label} هذا الشهر: ${used}/${limit}`}>
      {icon}
      <b className="tabular-nums">{formatNum(used)}<span className="opacity-60">/{formatNum(limit)}</span></b>
      <span className="text-[10px]">{label}</span>
      <span className="inline-block h-1 w-8 overflow-hidden rounded-full bg-surface-2 align-middle">
        <span className={cn("block h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

type SortKey = "cases" | "recent" | "name";
const SORTS: { id: SortKey; label: string }[] = [
  { id: "cases", label: "الأكثر حالات" },
  { id: "recent", label: "آخر نشاط" },
  { id: "name", label: "بالاسم" },
];

/**
 * Platform-operator console: adjust the USD→IQD rate and manually activate a
 * clinic that paid in cash. Every privileged action is ALSO gated server-side
 * (0054) — this screen is just the operator's UI for it.
 */
export function AdminBilling() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [rate, setRate] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState<PlanId>("super");
  const [period, setPeriod] = useState<BillingPeriod>("annual");
  const [actBusy, setActBusy] = useState(false);
  // وحدة المدّة: باقة جاهزة (شهر/سنة) أو عدد أيام حر — والحصص اختيارية.
  const [byDays, setByDays] = useState(false);
  const [days, setDays] = useState("30");
  const [petCap, setPetCap] = useState("");
  const [waCap, setWaCap] = useState("");
  const [prices, setPrices] = useState<Record<string, { m: string; a: string }>>({});
  const [priceBusy, setPriceBusy] = useState<string | null>(null);
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [clinicsBusy, setClinicsBusy] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>("cases");

  const loadClinics = async () => {
    setClinicsBusy(true);
    try { setClinics(await adminListClinics()); }
    catch (e) { toast.error("تعذّر جلب العيادات", e instanceof Error ? e.message : undefined); }
    finally { setClinicsBusy(false); }
  };

  useEffect(() => {
    void getUsdRate().then((r) => setRate(String(r)));
    void loadClinics();
    // اجلب الأسعار الحيّة ثم اعرضها بالحقول
    void hydratePlanPrices().then(() => {
      setPrices(Object.fromEntries(PLANS.map((p) => {
        const pr = planPrice(p);
        return [p.id, { m: String(pr.monthlyUsd), a: String(pr.annualUsd) }];
      })));
    });
  }, []);

  const pickClinic = (c: AdminClinic) => {
    playTap();
    if (c.email) setEmail(c.email);
    document.getElementById("manual-activation")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Per-clinic row actions: grant a fresh 14-day trial, or cancel the subscription.
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const grantTrial = async (c: AdminClinic) => {
    if (!c.email) { toast.error("لا يوجد بريد لهذه العيادة"); return; }
    playTap();
    setRowBusy(c.clinicId);
    try {
      await adminGrantTrial(c.email, 14);
      playSuccess();
      toast.success("تم منح تجربة 14 يوم", c.clinicName || c.email);
      void loadClinics();
    } catch (e) { playWarning(); toast.error("تعذّر منح التجربة", e instanceof Error ? e.message : undefined); }
    finally { setRowBusy(null); }
  };

  const cancelSub = async (c: AdminClinic) => {
    if (!c.email) { toast.error("لا يوجد بريد لهذه العيادة"); return; }
    if (!window.confirm(`إلغاء اشتراك «${c.clinicName || c.email}»؟\nينتهي وصولها فوراً — قراءة فقط إن كانت قد دفعت سابقاً، وإلا يُقفل النظام.`)) return;
    setRowBusy(c.clinicId);
    try {
      await adminCancelSubscription(c.email);
      playSuccess();
      toast.success("تم إلغاء الاشتراك", c.clinicName || c.email);
      void loadClinics();
    } catch (e) { playWarning(); toast.error("تعذّر الإلغاء", e instanceof Error ? e.message : undefined); }
    finally { setRowBusy(null); }
  };

  if (!isPlatformAdmin(user?.email)) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-danger-50 text-danger-600 dark:bg-danger-500/15"><Lock size={26} /></span>
        <h1 className="font-display text-xl font-extrabold text-ink">غير مصرّح</h1>
        <p className="mt-2 text-sm text-ink-muted">هذه الصفحة مخصّصة لمشغّل المنصّة فقط.</p>
        <Button className="mt-5" variant="secondary" onClick={() => navigate("/")}>الرجوع للرئيسية</Button>
      </div>
    );
  }

  const saveRate = async () => {
    const n = Number(rate);
    if (!(n > 100)) { toast.error("سعر صرف غير صالح"); return; }
    setRateBusy(true);
    try { await setUsdRate(n); playSuccess(); toast.success("تم تحديث سعر الصرف", `$1 = ${formatNum(n)} دينار`); }
    catch (e) { playWarning(); toast.error("تعذّر الحفظ", e instanceof Error ? e.message : undefined); }
    finally { setRateBusy(false); }
  };

  const activate = async () => {
    if (!email.trim()) { toast.error("أدخل بريد العيادة"); return; }
    setActBusy(true);
    try {
      const pet = petCap.trim() === "" ? null : Math.max(0, Math.floor(Number(petCap) || 0));
      const wa = waCap.trim() === "" ? null : Math.max(0, Math.floor(Number(waCap) || 0));
      if (byDays) {
        const d = Math.floor(Number(days) || 0);
        if (d < 1) { playWarning(); toast.error("عدد الأيام لازم يكون ١ فأكثر"); setActBusy(false); return; }
        await adminActivateDays(email, plan, d, pet, wa);
        playSuccess();
        toast.success("تم التفعيل يدوياً", `${PLANS.find((p) => p.id === plan)?.name} · ${formatNum(d)} يوم`);
      } else {
        await adminActivate(email, plan, period);
        // الباقة الجاهزة ما تمرّ بالحصص — نضبطها بنداء منفصل إن حُددت
        if (pet !== null || wa !== null) await adminSetLimits(email, pet, wa);
        playSuccess();
        toast.success("تم التفعيل يدوياً", `${PLANS.find((p) => p.id === plan)?.name} · ${period === "annual" ? "سنوي" : "شهري"}`);
      }
      setEmail("");
      void loadClinics();
    } catch (e) { playWarning(); toast.error("تعذّر التفعيل", e instanceof Error ? e.message : undefined); }
    finally { setActBusy(false); }
  };

  const savePrice = async (id: PlanId) => {
    const v = prices[id];
    const m = Number(v?.m), a = Number(v?.a);
    if (!(m > 0) || !(a > 0)) { playWarning(); toast.error("سعر غير صالح"); return; }
    setPriceBusy(id);
    try {
      await adminSetPlanPrice(id, m, a);
      playSuccess();
      toast.success("تم تحديث السعر", `${PLANS.find((p) => p.id === id)?.name} · $${m}/شهر`);
    } catch (e) { playWarning(); toast.error("تعذّر الحفظ", e instanceof Error ? e.message : undefined); }
    finally { setPriceBusy(null); }
  };

  // بوضع الأيام المبلغ يُحسب بالتناسب من السعر الشهري — عرض سعر السنة على
  // تفعيل ١٠ أيام رقم كاذب يضلّل المندوب عند التحصيل.
  const selectedPlan = PLANS.find((p) => p.id === plan)!;
  const selectedUsd = byDays
    ? Math.round((planPrice(selectedPlan).monthlyUsd / 30) * Math.max(0, Math.floor(Number(days) || 0)) * 100) / 100
    : priceUsd(selectedPlan, period);

  /* ---- الاستعمال: الحصيلة والترتيب ---- */
  // خادم قبل هجرة 0101 يرجّع usage=null — نقولها صراحةً بدل ما نعرض أصفاراً.
  const usageMissing = clinics.length > 0 && clinics.every((c) => c.usage === null);
  const totals = clinics.reduce(
    (a, c) => ({
      cases: a.cases + (c.usage?.cases ?? 0),
      cases30: a.cases30 + (c.usage?.cases30 ?? 0),
      patients: a.patients + (c.usage?.patients ?? 0),
      live: a.live + ((c.usage?.cases30 ?? 0) > 0 ? 1 : 0),
    }),
    { cases: 0, cases30: 0, patients: 0, live: 0 },
  );
  const sortedClinics = [...clinics].sort((a, b) => {
    if (sortBy === "cases") return (b.usage?.cases ?? 0) - (a.usage?.cases ?? 0);
    if (sortBy === "recent") {
      const t = (c: AdminClinic) => (c.usage?.lastActivity ? new Date(c.usage.lastActivity).getTime() : 0);
      return t(b) - t(a);
    }
    return (a.clinicName || a.email || "").localeCompare(b.clinicName || b.email || "", "ar");
  });

  /* ---- طلبات الدكاترة: صندوق الأفكار الي يرفعه المساعد من كل العيادات ---- */
  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [reqBusy, setReqBusy] = useState(true);
  const [reqFilter, setReqFilter] = useState<"all" | FeatureRequest["status"]>("all");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const loadRequests = async () => {
    setReqBusy(true);
    try { setRequests(await repo.adminListFeatureRequests()); }
    catch { /* pre-0092 database — the section just shows empty */ }
    finally { setReqBusy(false); }
  };
  useEffect(() => { void loadRequests(); }, []);

  const setReqStatus = async (r: FeatureRequest, status: FeatureRequest["status"]) => {
    playTap();
    setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
    try { await repo.updateFeatureRequest(r.id, { status }); }
    catch { setRequests((prev) => prev.map((x) => (x.id === r.id ? r : x))); toast.error("تعذّر التحديث"); }
  };

  const saveNote = async (r: FeatureRequest) => {
    const note = (noteDraft[r.id] ?? "").trim();
    try {
      await repo.updateFeatureRequest(r.id, { admin_note: note || null });
      setRequests((prev) => prev.map((x) => (x.id === r.id ? { ...x, admin_note: note || null } : x)));
      playSuccess(); toast.success("انحفظ الرد — يظهر للعيادة");
      setNoteDraft((d) => { const { [r.id]: _drop, ...rest } = d; return rest; });
    } catch { toast.error("تعذّر الحفظ"); }
  };

  const REQ_STATUS: { id: FeatureRequest["status"]; label: string; cls: string }[] = [
    { id: "new", label: "جديد", cls: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
    { id: "planned", label: "بالخطة", cls: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
    { id: "done", label: "تم", cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" },
    { id: "declined", label: "اعتذار", cls: "bg-surface-2 text-ink-muted" },
  ];
  const shownRequests = reqFilter === "all" ? requests : requests.filter((r) => r.status === reqFilter);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ShieldCheck size={22} /></span>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">لوحة المنصّة</h1>
          <p className="text-sm text-ink-muted">إدارة الاشتراكات وسعر الصرف — لمشغّل المنصّة.</p>
        </div>
      </div>

      {/* Clinics list */}
      <section className="mb-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Building2 size={18} /></span>
            <h2 className="font-display font-bold text-ink">العيادات ({clinicsBusy ? "…" : formatNum(clinics.length)})</h2>
          </div>
          <button onClick={() => { playTap(); void loadClinics(); }} aria-label="تحديث" className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink"><RefreshCw size={16} /></button>
        </div>

        {/* حصيلة المنصّة: الرقم الي يجاوب «شكد ينشتغل عليه فعلاً؟» بلمحة */}
        {!clinicsBusy && clinics.length > 0 && (
          usageMissing ? (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-2xs leading-relaxed text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>أرقام الاستعمال ما توصل لأن هجرة <b>0101_admin_usage</b> لسه ما تشغّلت على قاعدة البيانات. شغّلها وأعد التحديث — الاشتراكات تشتغل عادي بدونها.</span>
            </div>
          ) : (
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: <Stethoscope size={14} />, v: totals.cases, l: "حالة بالمجموع" },
                { icon: <Activity size={14} />, v: totals.cases30, l: "حالة بآخر ٣٠ يوم" },
                { icon: <PawPrint size={14} />, v: totals.patients, l: "مريض" },
                { icon: <Building2 size={14} />, v: totals.live, l: "عيادة شغّالة" },
              ].map((s) => (
                <div key={s.l} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                  <div className="flex items-center gap-1 text-ink-subtle">{s.icon}<span className="text-2xs font-semibold">{s.l}</span></div>
                  <div className="font-display text-xl font-extrabold tabular-nums text-ink">{formatNum(s.v)}</div>
                </div>
              ))}
            </div>
          )
        )}

        {/* الترتيب: الأكثر حالات أولاً — لأن هذا سؤال المشغّل الأول */}
        {!clinicsBusy && clinics.length > 1 && (
          <div className="mb-2.5 flex items-center gap-1">
            <span className="text-2xs font-semibold text-ink-subtle">رتّب:</span>
            {SORTS.map((s) => (
              <button key={s.id} type="button" onClick={() => { playTap(); setSortBy(s.id); }}
                className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", sortBy === s.id ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        {clinicsBusy ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
        ) : clinics.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">لا توجد عيادات بعد.</p>
        ) : (
          <div className="space-y-2">
            {sortedClinics.map((c) => {
              const meta = STATUS_META[c.status] ?? STATUS_META.trialing;
              const planName = PLANS.find((p) => p.id === c.plan)?.name;
              const u = c.usage;
              // عيادة عمرها ما فتحت حالة ≠ عيادة اشتغلت وهدّت. الأولى «ما بدأت»
              // (مشكلة تأهيل)، والثانية «خاملة» (خطر انسحاب) — وتحتاجان ردّين مختلفين.
              const dormant = !!u && u.cases > 0 && u.cases30 === 0;
              const neverStarted = !!u && u.cases === 0;
              return (
                <div key={c.clinicId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-ink">
                      {c.clinicName || c.email || "—"}
                      {neverStarted && <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-extrabold text-ink-subtle">ما بدأت</span>}
                      {dormant && <span className="shrink-0 rounded-full bg-warn-50 px-1.5 py-0.5 text-[10px] font-extrabold text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">خاملة</span>}
                    </p>
                    <p className="flex items-center gap-2 truncate text-xs text-ink-muted">
                      {c.email && <span dir="ltr" className="truncate">{c.email}</span>}
                      <span className="inline-flex items-center gap-0.5"><Users size={11} /> {formatNum(c.members)}</span>
                    </p>
                    {u && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                        <Stat icon={<Stethoscope size={12} />} value={u.cases} label="حالة" tone="text-brand-600 dark:text-brand-400" />
                        <Stat icon={<Activity size={12} />} value={u.cases30} label="بـ٣٠ يوم" />
                        <Stat icon={<PawPrint size={12} />} value={u.patients} label="مريض" />
                        <Stat icon={<Receipt size={12} />} value={u.invoices} label="فاتورة" />
                        <span className="text-2xs text-ink-subtle">· آخر نشاط {sinceLabel(u.lastActivity)}</span>
                      </p>
                    )}
                    {(c.petLimit != null || c.waLimit != null) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs">
                        <QuotaPill icon={<PawPrint size={11} />} used={c.petsUsed} limit={c.petLimit} label="حيوان" />
                        <QuotaPill icon={<MessageCircle size={11} />} used={c.waUsed} limit={c.waLimit} label="رسالة" />
                        {c.quotaPeriodEnd && (
                          <span className="text-[10px] text-ink-subtle">· يتصفّر {formatDate(c.quotaPeriodEnd, "ar")}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <Badge tone={meta.tone}>{meta.label}{planName && c.status === "active" ? ` · ${planName}` : ""}</Badge>
                    {(c.status === "active" || c.status === "trialing") && c.daysLeft > 0 && (
                      <span className="text-2xs text-ink-subtle">باقي {formatNum(c.daysLeft)} يوم</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => pickClinic(c)}>فعّل / مدّد</Button>
                    <Button size="sm" variant="secondary" leftIcon={<Sparkles size={14} />} loading={rowBusy === c.clinicId} onClick={() => grantTrial(c)}>
                      تجربة ١٤ يوم
                    </Button>
                    {(c.status === "active" || c.status === "trialing" || c.wasSubscriber) && (
                      <Button size="sm" variant="ghost" leftIcon={<XCircle size={14} />} loading={rowBusy === c.clinicId} onClick={() => cancelSub(c)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10">
                        إلغاء
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Plan pricing — live, no redeploy */}
      <section className="mb-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Tag size={18} /></span>
          <h2 className="font-display font-bold text-ink">أسعار الباقات</h2>
        </div>
        <p className="mb-4 text-sm text-ink-muted">بالدولار. التغيير يظهر فوراً بصفحة الباقات وبالفواتير الجديدة — بلا نشر نسخة.</p>
        <div className="space-y-2">
          {PLANS.map((p) => {
            const v = prices[p.id] ?? { m: "", a: "" };
            const setV = (patch: Partial<{ m: string; a: string }>) =>
              setPrices((s0) => ({ ...s0, [p.id]: { ...(s0[p.id] ?? { m: "", a: "" }), ...patch } }));
            return (
              <div key={p.id} className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-line p-3">
                <span className="min-w-24 flex-1 text-sm font-bold text-ink">{p.name}</span>
                <label className="text-2xs font-semibold text-ink-subtle">
                  شهري ($)
                  <input inputMode="decimal" dir="ltr" className="input mt-0.5 w-24 py-1.5 text-center"
                    value={v.m} onChange={(e) => setV({ m: e.target.value.replace(/[^\d.]/g, "") })} />
                </label>
                <label className="text-2xs font-semibold text-ink-subtle">
                  سنوي ($)
                  <input inputMode="decimal" dir="ltr" className="input mt-0.5 w-24 py-1.5 text-center"
                    value={v.a} onChange={(e) => setV({ a: e.target.value.replace(/[^\d.]/g, "") })} />
                </label>
                <span className="text-2xs text-ink-subtle">≈ {money(usdToIqd(Number(v.m) || 0, Number(rate) || undefined))}/شهر</span>
                <Button size="sm" loading={priceBusy === p.id} onClick={() => savePrice(p.id)}>حفظ</Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Exchange rate */}
      <section className="mb-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Coins size={18} /></span>
          <h2 className="font-display font-bold text-ink">سعر الصرف (دولار ← دينار)</h2>
        </div>
        <p className="mb-3 text-sm text-ink-muted">يُستعمل لتحويل أسعار الخطط إلى الدينار عند الدفع. عدّله كلما تحرّك السوق.</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-subtle">$1 =</span>
          <input inputMode="numeric" className="input w-40 text-center" dir="ltr" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} />
          <span className="text-sm font-semibold text-ink-subtle">دينار</span>
          <Button size="sm" onClick={saveRate} loading={rateBusy}>حفظ السعر</Button>
        </div>
        {Number(rate) > 0 && (
          <p className="mt-2 text-xs text-ink-subtle">مثال: السوبر السنوي (${priceUsd(PLANS[2], "annual")}) ≈ {money(usdToIqd(priceUsd(PLANS[2], "annual"), Number(rate)))}</p>
        )}
      </section>

      {/* Manual cash activation */}
      <section id="manual-activation" className="rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15"><Wallet size={18} /></span>
          <h2 className="font-display font-bold text-ink">تفعيل يدوي (دفع كاش)</h2>
        </div>
        <p className="mb-4 text-sm text-ink-muted">فعّل عيادة دفعت نقداً عبر المندوب — تختار الخطة والمدّة، ويُمدّد اشتراكها فوراً.</p>

        <label className="label">بريد العيادة</label>
        <input type="email" dir="ltr" className="input" placeholder="clinic@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label className="label mt-3">الخطة</label>
        <div className="flex flex-wrap gap-2">
          {PLANS.map((p) => (
            <button key={p.id} onClick={() => setPlan(p.id)} className={cn("rounded-full px-4 py-2 text-sm font-bold transition", plan === p.id ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
              {p.name}
            </button>
          ))}
        </div>

        <label className="label mt-3">المدّة</label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
            <button onClick={() => { playTap(); setByDays(false); setPeriod("monthly"); }} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", !byDays && period === "monthly" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>شهري</button>
            <button onClick={() => { playTap(); setByDays(false); setPeriod("annual"); }} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", !byDays && period === "annual" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>سنوي</button>
            <button onClick={() => { playTap(); setByDays(true); }} className={cn("inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition", byDays ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>
              <CalendarDays size={14} /> بالأيام
            </button>
          </div>
          {byDays && (
            <span className="inline-flex items-center gap-1.5">
              <input type="number" inputMode="numeric" min="1" step="1" dir="ltr"
                className="input w-24 py-2 text-center" value={days}
                onChange={(e) => setDays(e.target.value)} placeholder="30" />
              <span className="text-sm font-semibold text-ink-subtle">يوم</span>
              {[7, 10, 15, 30, 45, 90].map((d) => (
                <button key={d} type="button" onClick={() => { playTap(); setDays(String(d)); }}
                  className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", days === String(d) ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>{d}</button>
              ))}
            </span>
          )}
        </div>

        {/* حصص هذا الاشتراك — فاضي = بلا حد */}
        <label className="label mt-4">الحصة الشهرية <span className="font-normal text-ink-subtle">(اتركها فاضية = بلا حد)</span></label>
        <p className="-mt-1 mb-2 text-2xs leading-relaxed text-ink-subtle">
          تتجدد تلقائياً مع بداية كل شهر من تاريخ التفعيل. غير المستهلَك لا يتراكم، ولا شيء يُحذف من بيانات العيادة.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-2xl border border-line p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><PawPrint size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-ink">حيوانات بالشهر</span>
              <span className="block text-2xs text-ink-subtle">كم حيوان يضيف كل شهر</span>
            </span>
            <input type="number" inputMode="numeric" min="0" step="10" dir="ltr"
              className="input w-24 py-1.5 text-center" value={petCap}
              onChange={(e) => setPetCap(e.target.value)} placeholder="∞" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-line p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15"><MessageCircle size={16} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-ink">رسائل بالشهر</span>
              <span className="block text-2xs text-ink-subtle">كم رسالة يرسل كل شهر</span>
            </span>
            <input type="number" inputMode="numeric" min="0" step="50" dir="ltr"
              className="input w-24 py-1.5 text-center" value={waCap}
              onChange={(e) => setWaCap(e.target.value)} placeholder="∞" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-ink-muted">المبلغ المكافئ{byDays ? " (بالتناسب)" : ""}</span>
          <span className="font-display font-bold tabular-nums text-ink">${selectedUsd} · ≈ {money(usdToIqd(selectedUsd, Number(rate) || undefined))}</span>
        </div>

        <Button className="mt-4 w-full" leftIcon={<ShieldCheck size={16} />} onClick={activate} loading={actBusy}>فعّل الاشتراك يدوياً</Button>
      </section>

      {/* طلبات الدكاترة — شنو يريدون؟ هذا هو مصدر خارطة الطريق */}
      <section className="mt-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><Lightbulb size={18} /></span>
          <h2 className="font-display font-bold text-ink">طلبات الدكاترة ({reqBusy ? "…" : formatNum(requests.length)})</h2>
          <div className="ms-auto flex items-center gap-1">
            <button type="button" onClick={() => { playTap(); setReqFilter("all"); }}
              className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", reqFilter === "all" ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>الكل</button>
            {REQ_STATUS.map((s) => (
              <button key={s.id} type="button" onClick={() => { playTap(); setReqFilter(s.id); }}
                className={cn("rounded-full px-2.5 py-1 text-2xs font-bold transition", reqFilter === s.id ? s.cls + " ring-2 ring-brand-400" : "bg-surface-2 text-ink-muted hover:text-ink")}>{s.label}</button>
            ))}
            <button onClick={() => { playTap(); void loadRequests(); }} aria-label="تحديث" className="grid h-8 w-8 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink"><RefreshCw size={14} /></button>
          </div>
        </div>

        {reqBusy ? (
          <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>
        ) : shownRequests.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">ماكو طلبات {reqFilter !== "all" ? "بهاي الحالة" : "بعد"} — المساعد يرفعها من داخل العيادات تلقائياً.</p>
        ) : (
          <div className="space-y-2.5">
            {shownRequests.map((r) => (
              <div key={r.id} className="rounded-2xl border border-line bg-surface-2/40 p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold leading-relaxed text-ink">{r.body}</div>
                    {r.question && r.question !== r.body && (
                      <div className="mt-0.5 text-2xs text-ink-subtle">السؤال الأصلي: «{r.question}»</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-2xs text-ink-subtle">
                      <span className="font-bold text-ink-muted">{r.clinic_name || "عيادة بلا اسم"}</span>
                      {r.requested_by && <span>· د. {r.requested_by}</span>}
                      <span>· {formatDate(r.created_at, "ar")}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {REQ_STATUS.map((s) => (
                      <button key={s.id} type="button" onClick={() => void setReqStatus(r, s.id)}
                        className={cn("rounded-full px-2 py-1 text-[10px] font-extrabold transition", r.status === s.id ? s.cls + " ring-2 ring-brand-400" : "bg-surface-2 text-ink-subtle hover:text-ink")}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    value={noteDraft[r.id] ?? r.admin_note ?? ""}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveNote(r); }}
                    placeholder="ردّك للعيادة (يظهر بشاشة «طلباتي» عندهم)…"
                    className="input h-8 flex-1 text-2xs"
                  />
                  <button type="button" onClick={() => void saveNote(r)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white transition hover:bg-brand-700"><Check size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button onClick={() => navigate("/")} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-ink">
        <ArrowLeft size={15} /> الرجوع
      </button>
    </div>
  );
}
