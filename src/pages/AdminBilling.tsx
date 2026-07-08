import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Coins, Wallet, ArrowLeft, Lock, Building2, RefreshCw, Users, Sparkles, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin, getUsdRate, setUsdRate, adminActivate, adminGrantTrial, adminCancelSubscription, adminListClinics, type AdminClinic } from "@/lib/platformAdmin";
import { PLANS, usdToIqd, priceUsd, type BillingPeriod, type PlanId } from "@/lib/plans";
import { Button, Badge, Skeleton, useToast } from "@/components/ui";
import { money, formatNum, cn } from "@/lib/utils";
import { playSuccess, playWarning, playTap } from "@/lib/sounds";

const STATUS_META: Record<string, { label: string; tone: "success" | "brand" | "warn" | "danger" }> = {
  active: { label: "نشط", tone: "success" },
  trialing: { label: "تجربة", tone: "brand" },
  expired: { label: "منتهي", tone: "warn" },
  locked: { label: "مقفل", tone: "danger" },
};

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
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [clinicsBusy, setClinicsBusy] = useState(true);

  const loadClinics = async () => {
    setClinicsBusy(true);
    try { setClinics(await adminListClinics()); }
    catch (e) { toast.error("تعذّر جلب العيادات", e instanceof Error ? e.message : undefined); }
    finally { setClinicsBusy(false); }
  };

  useEffect(() => { void getUsdRate().then((r) => setRate(String(r))); void loadClinics(); }, []);

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
    if (!window.confirm(`إلغاء اشتراك «${c.clinicName || c.email}»؟\nستنتهي مدّته فوراً (تبقى القراءة فقط إن كان قد دفع سابقاً).`)) return;
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
      await adminActivate(email, plan, period);
      playSuccess();
      toast.success("تم التفعيل يدوياً", `${PLANS.find((p) => p.id === plan)?.name} · ${period === "annual" ? "سنوي" : "شهري"}`);
      setEmail("");
      void loadClinics();
    } catch (e) { playWarning(); toast.error("تعذّر التفعيل", e instanceof Error ? e.message : undefined); }
    finally { setActBusy(false); }
  };

  const selectedUsd = priceUsd(PLANS.find((p) => p.id === plan)!, period);

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
        {clinicsBusy ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)}</div>
        ) : clinics.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">لا توجد عيادات بعد.</p>
        ) : (
          <div className="space-y-2">
            {clinics.map((c) => {
              const meta = STATUS_META[c.status] ?? STATUS_META.trialing;
              const planName = PLANS.find((p) => p.id === c.plan)?.name;
              return (
                <div key={c.clinicId} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{c.clinicName || c.email || "—"}</p>
                    <p className="flex items-center gap-2 truncate text-xs text-ink-muted">
                      {c.email && <span dir="ltr" className="truncate">{c.email}</span>}
                      <span className="inline-flex items-center gap-0.5"><Users size={11} /> {formatNum(c.members)}</span>
                    </p>
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
        <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          <button onClick={() => setPeriod("monthly")} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", period === "monthly" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>شهري</button>
          <button onClick={() => setPeriod("annual")} className={cn("rounded-full px-5 py-2 text-sm font-bold transition", period === "annual" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted")}>سنوي</button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
          <span className="text-sm text-ink-muted">المبلغ المكافئ</span>
          <span className="font-display font-bold tabular-nums text-ink">${selectedUsd} · ≈ {money(usdToIqd(selectedUsd, Number(rate) || undefined))}</span>
        </div>

        <Button className="mt-4 w-full" leftIcon={<ShieldCheck size={16} />} onClick={activate} loading={actBusy}>فعّل الاشتراك يدوياً</Button>
      </section>

      <button onClick={() => navigate("/")} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-ink">
        <ArrowLeft size={15} /> الرجوع
      </button>
    </div>
  );
}
