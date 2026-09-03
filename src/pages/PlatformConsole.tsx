import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Lock, Search, RefreshCw, LogIn, LogOut, Activity, KeyRound, Users, Wifi, Receipt,
  HandCoins, Boxes, Bike, CreditCard, Building2, ExternalLink, AlertTriangle, History,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  isPlatformAdmin, platformPulse, platformActivity, platformLogins, platformEnter, platformLeave, platformContext,
  type ClinicPulse, type PlatformActivityRow, type PlatformLoginRow, type PlatformContext,
} from "@/lib/platformAdmin";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { cn, money, formatNum } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * لوحةُ المنصّة (0151) — للمشغّل وحده (عربيةٌ عمداً؛ الملفّ مستثنى من حارس الترجمة).
 *
 * ثلاثُ نظرات: «العيادات» نبضُ كل عيادة (من حيّ الآن، مبيعُ اليوم، الديون،
 * المخزون الصفري، التوصيلات المعلّقة) وزرُّ «ادخل العيادة»؛ «الحركة» سجلُّ
 * التدقيق عبر كل العيادات؛ «الدخول» من دخل ومتى. والاشتراكاتُ بلوحتها القديمة.
 *
 * الدخولُ يقلب الجلسةَ كلَّها إلى تلك العيادة (auth_clinic بالخادم) فتشتغل كلُّ
 * شاشات النظام بلا استثناء — لذا يُعاد تحميلُ الصفحة بعده، ويظهر شريطٌ ثابت.
 * بالاتفاق مع العيادات: لا أثرَ للدخول عندها؛ السببُ يُحفظ بسجلّ المشغّل وحده.
 * ==========================================================================*/

type Tab = "clinics" | "activity" | "logins";

/** «قبل ٥ د» — الوقتُ النسبيّ يقول «حيّة» أو «تعبت» أسرعَ من التاريخ. */
function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${formatNum(m)} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${formatNum(h)} س`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${formatNum(d)} يوم`;
  return new Date(iso).toLocaleDateString("ar-IQ");
}
const when = (iso: string) => new Date(iso).toLocaleString("ar-IQ", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });

const ACTION_AR: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };
const ACTION_TONE: Record<string, "success" | "warn" | "danger" | "neutral"> = { INSERT: "success", UPDATE: "warn", DELETE: "danger" };

export function PlatformConsole() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("clinics");
  const [ctx, setCtx] = useState<PlatformContext | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin(user?.email)) return;
    platformContext().then(setCtx).catch(() => setCtx(null));
  }, [user?.email]);

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

  const leave = async () => {
    try { await platformLeave(); playSuccess(); window.location.assign("/platform"); }
    catch (e) { playWarning(); toast.error("تعذّر الخروج", e instanceof Error ? e.message : undefined); }
  };

  const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: "clinics", label: "العيادات", icon: Building2 },
    { id: "activity", label: "الحركة", icon: Activity },
    { id: "logins", label: "الدخول", icon: KeyRound },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ShieldCheck size={24} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold text-ink">لوحة المنصّة</h1>
          <p className="text-sm text-ink-subtle">كل العيادات بنظرة — وادخل أيّها لتصلح ما يصعب على الطبيب.</p>
        </div>
        <Button variant="secondary" leftIcon={<CreditCard size={16} />} onClick={() => { playTap(); navigate("/admin"); }}>الاشتراكات والأسعار</Button>
      </div>

      {ctx?.acting && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warn-300 bg-warn-50 p-3 text-sm dark:border-warn-500/40 dark:bg-warn-500/10" data-acting>
          <AlertTriangle size={18} className="shrink-0 text-warn-600" />
          <p className="min-w-0 flex-1 font-semibold text-warn-800 dark:text-warn-200">
            أنت الآن داخل عيادة «{ctx.clinicName ?? "بلا اسم"}» منذ {ago(ctx.since)}{ctx.reason ? ` — السبب: ${ctx.reason}` : ""}. الشاشات كلها تعرض بياناتها وتكتب فيها.
          </p>
          <Button size="sm" variant="secondary" leftIcon={<LogOut size={15} />} onClick={() => void leave()} data-leave>اخرج من العيادة</Button>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { playTap(); setTab(id); }} data-ptab={id}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              tab === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "clinics" ? <ClinicsTab acting={ctx?.acting ?? null} onShowActivity={() => setTab("activity")} />
        : tab === "activity" ? <ActivityTab />
        : <LoginsTab />}
    </div>
  );
}

/* ---------------------------------------------------------------- العيادات */
function ClinicsTab({ acting, onShowActivity }: { acting: string | null; onShowActivity: (clinicId: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ClinicPulse[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<ClinicPulse | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setFailed(null);
    try { setRows(await platformPulse()); }
    catch (e) { setFailed(e instanceof Error ? e.message : "فشل"); }
  };
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || (r.clinicName ?? "").toLowerCase().includes(s) || (r.email ?? "").toLowerCase().includes(s) || r.clinicId.includes(s));
  }, [rows, q]);

  const kpi = useMemo(() => {
    const all = rows ?? [];
    return {
      clinics: all.length,
      online: all.reduce((n, r) => n + r.onlineNow, 0),
      activeToday: all.filter((r) => r.invoicesToday > 0).length,
      salesToday: all.reduce((n, r) => n + r.salesToday, 0),
      debts: all.reduce((n, r) => n + r.openDebtTotal, 0),
      zero: all.reduce((n, r) => n + r.zeroStock, 0),
    };
  }, [rows]);

  const enter = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const r = await platformEnter(target.clinicId, reason);
      playSuccess();
      toast.success("دخلت العيادة", r.clinicName ?? target.email ?? target.clinicId);
      // الجلسةُ كلُّها تغيّرت بالخادم — نعيد التحميل حتى تُبنى الواجهة باسم العيادة.
      window.location.assign("/");
    } catch (e) {
      playWarning();
      const msg = e instanceof Error ? e.message : "";
      toast.error("تعذّر الدخول", /does not exist|schema cache|pgrst202/i.test(msg) ? "شغّل هجرة 0151 على القاعدة أولاً." : msg);
      setBusy(false);
    }
  };

  if (failed) {
    return (
      <div className="card space-y-3 p-10 text-center">
        <p className="text-sm text-ink-subtle">تعذّر جلب نبض العيادات. {/does not exist|schema cache|pgrst202/i.test(failed) ? "شغّل هجرة 0151 على القاعدة أولاً." : failed}</p>
        <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => void load()}>أعد المحاولة</Button>
      </div>
    );
  }
  if (!rows) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={Building2} label="عيادة" value={formatNum(kpi.clinics)} />
        <Kpi icon={Wifi} label="متصل الآن" value={formatNum(kpi.online)} tone={kpi.online > 0 ? "success" : undefined} />
        <Kpi icon={Receipt} label="باعت اليوم" value={formatNum(kpi.activeToday)} />
        <Kpi icon={HandCoins} label="مبيع اليوم" value={money(kpi.salesToday)} />
        <Kpi icon={AlertTriangle} label="ديون مفتوحة" value={money(kpi.debts)} tone={kpi.debts > 0 ? "warn" : undefined} />
        <Kpi icon={Boxes} label="مواد برصيد صفر" value={formatNum(kpi.zero)} tone={kpi.zero > 0 ? "warn" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث باسم العيادة أو بريدها…" data-psearch />
        </div>
        <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => { playTap(); void load(); }}>تحديث</Button>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-subtle">ماكو عيادة مطابقة.</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((c) => {
            const isActing = acting === c.clinicId;
            const live = !!c.lastActivity && Date.now() - new Date(c.lastActivity).getTime() < 86400000;
            return (
              <div key={c.clinicId} data-pclinic={c.clinicId}
                className={cn("card space-y-3 p-4", isActing && "border-warn-400 ring-2 ring-warn-200 dark:ring-warn-500/30")}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-display text-base font-extrabold text-ink">
                      {c.clinicName || "عيادة بلا اسم"}
                      {c.onlineNow > 0 && <Badge tone="success"><Wifi size={11} /> {formatNum(c.onlineNow)} متصل</Badge>}
                      {!live && <Badge tone="neutral">خاملة</Badge>}
                      {isActing && <Badge tone="warn">أنت داخلها</Badge>}
                    </p>
                    <p className="truncate text-xs text-ink-subtle">{c.email ?? c.clinicId}</p>
                  </div>
                  <div className="text-end text-2xs text-ink-subtle">
                    <p>{c.plan ? `باقة ${c.plan}` : "بلا اشتراك"}{c.periodEnd ? ` · تنتهي ${new Date(c.periodEnd).toLocaleDateString("ar-IQ")}` : c.trialEnd ? ` · تجربة حتى ${new Date(c.trialEnd).toLocaleDateString("ar-IQ")}` : ""}</p>
                    <p>آخر نشاط: {ago(c.lastActivity)} · آخر دخول: {ago(c.lastLogin)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center sm:grid-cols-6">
                  <Stat label="مبيع اليوم" value={money(c.salesToday)} sub={`${formatNum(c.invoicesToday)} فاتورة`} />
                  <Stat label="٧ أيام" value={money(c.sales7d)} sub={`${formatNum(c.invoices7d)} فاتورة`} />
                  <Stat label="ديون" value={money(c.openDebtTotal)} sub={`${formatNum(c.openDebtCount)} فاتورة`} warn={c.openDebtCount > 0} />
                  <Stat label="مخزن" value={formatNum(c.products)} sub={`${formatNum(c.zeroStock)} برصيد صفر`} warn={c.zeroStock > 0} />
                  <Stat label="توصيل معلّق" value={formatNum(c.pendingDeliveries)} sub={<Bike size={11} className="mx-auto" />} warn={c.pendingDeliveries > 0} />
                  <Stat label="حركة ٢٤س" value={formatNum(c.audit24h)} sub={<span className="inline-flex items-center gap-1"><Users size={11} /> {formatNum(c.members)} كادر</span>} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isActing ? (
                    <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={14} />} onClick={() => { playTap(); window.location.assign("/"); }}>افتح شاشاتها</Button>
                  ) : (
                    <Button size="sm" leftIcon={<LogIn size={14} />} data-penter={c.clinicId}
                      onClick={() => { playTap(); setTarget(c); setReason(""); }}>ادخل العيادة</Button>
                  )}
                  <Button size="sm" variant="ghost" leftIcon={<History size={14} />} onClick={() => { playTap(); onShowActivity(c.clinicId); }}>حركتها</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {target && (
        <Modal open onClose={() => setTarget(null)} title={`الدخول إلى «${target.clinicName || target.email || "عيادة"}»`}>
          <div className="space-y-3.5">
            <p className="rounded-xl bg-warn-50 p-3 text-xs leading-relaxed text-warn-800 dark:bg-warn-500/10 dark:text-warn-200">
              من هذه اللحظة تشتغل كل الشاشات ببيانات هذي العيادة وبصلاحية مدير. اخرج من الشريط الأصفر لما تخلّص.
            </p>
            <div>
              <label className="label">سبب الدخول <span className="text-2xs font-normal text-ink-subtle">(لسجلّك أنت فقط — العيادة لا تراه)</span></label>
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: الطبيب طلب تصحيح مخزون مادة" autoFocus data-preason />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {["طلب من الطبيب", "تصحيح مخزون", "تصحيح فاتورة", "إعداد النظام", "متابعة مشكلة"].map((r) => (
                  <button key={r} type="button" className={cn("chip text-2xs transition", reason === r ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}
                    onClick={() => { playTap(); setReason(reason === r ? "" : r); }}>{r}</button>
                ))}
              </div>
            </div>
            <Button className="w-full" loading={busy} leftIcon={<LogIn size={16} />} onClick={() => void enter()} data-pconfirm>ادخل الآن</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Building2; label: string; value: string; tone?: "success" | "warn" }) {
  return (
    <div className="card flex items-center gap-2.5 p-3">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl",
        tone === "success" ? "bg-success-50 text-success-600 dark:bg-success-500/15" : tone === "warn" ? "bg-warn-50 text-warn-600 dark:bg-warn-500/15" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15")}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-base font-extrabold tabular-nums text-ink">{value}</p>
        <p className="text-2xs text-ink-subtle">{label}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub: React.ReactNode; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl px-1.5 py-2", warn ? "bg-warn-50 dark:bg-warn-500/10" : "bg-surface-2")}>
      <p className="text-2xs text-ink-subtle">{label}</p>
      <p className={cn("truncate text-sm font-extrabold tabular-nums", warn ? "text-warn-700 dark:text-warn-300" : "text-ink")}>{value}</p>
      <p className="text-2xs text-ink-subtle">{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ الحركة */
function ActivityTab() {
  const [rows, setRows] = useState<PlatformActivityRow[] | null>(null);
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [clinic, setClinic] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const [auto, setAuto] = useState(true);

  const load = async (cid: string) => {
    setFailed(false);
    try { setRows(await platformActivity(150, cid || null)); }
    catch { setFailed(true); }
  };
  useEffect(() => { void load(clinic); }, [clinic]);
  useEffect(() => {
    platformPulse().then((p) => setClinics(p.map((c) => ({ id: c.clinicId, name: c.clinicName || c.email || c.clinicId.slice(0, 8) })))).catch(() => {});
  }, []);
  // تحديثٌ ذاتيّ كل ٣٠ ثانية ما دام التبويب مفتوحاً — المراقبةُ حيّة لا لقطة.
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void load(clinic), 30_000);
    return () => clearInterval(id);
  }, [auto, clinic]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-10 w-auto min-w-[200px]" value={clinic} onChange={(e) => setClinic(e.target.value)} data-pactclinic>
          <option value="">كل العيادات</option>
          {clinics.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> تحديث تلقائي كل ٣٠ ثانية
        </label>
        <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={() => { playTap(); void load(clinic); }}>تحديث</Button>
      </div>

      {failed ? (
        <div className="card p-8 text-center text-sm text-ink-subtle">تعذّر جلب الحركة — أعد المحاولة.</div>
      ) : !rows ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-subtle">ماكو حركات.</div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {rows.map((r) => {
            const act = r.action ?? "";
            const d = r.details ?? {};
            const summary = Object.keys(d).length ? Object.keys(d).slice(0, 6).join("، ") : "";
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs" data-pact={r.id}>
                <span className="w-24 shrink-0 tabular-nums text-ink-subtle">{when(r.createdAt)}</span>
                <span className="w-32 shrink-0 truncate font-semibold text-ink">{r.clinicName || r.clinicId?.slice(0, 8) || "—"}</span>
                <Badge tone={ACTION_TONE[act] ?? "neutral"}>{ACTION_AR[act] ?? act}</Badge>
                <span className="font-mono text-2xs text-ink-muted">{r.entity}{r.entityId ? ` · ${r.entityId.slice(-6)}` : ""}</span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">{summary}</span>
                <span className="shrink-0 text-ink-subtle">{r.actorName ?? (r.actor ? r.actor.slice(0, 8) : "—")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ الدخول */
function LoginsTab() {
  const [rows, setRows] = useState<PlatformLoginRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = async () => { setFailed(false); try { setRows(await platformLogins(150)); } catch { setFailed(true); } };
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-subtle">آخر ١٥٠ دخولاً عبر كل العيادات — من دخل، على أي عيادة، ومتى.</p>
        <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={() => { playTap(); void load(); }}>تحديث</Button>
      </div>
      {failed ? (
        <div className="card p-8 text-center text-sm text-ink-subtle">تعذّر جلب سجل الدخول — أعد المحاولة.</div>
      ) : !rows ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-subtle">ماكو دخول مسجَّل.</div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {rows.map((r, i) => (
            <div key={`${r.userId ?? ""}-${r.createdAt}-${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="w-24 shrink-0 tabular-nums text-ink-subtle">{when(r.createdAt)}</span>
              <span className="w-32 shrink-0 truncate font-semibold text-ink">{r.clinicName || r.clinicId.slice(0, 8)}</span>
              <KeyRound size={12} className="text-ink-subtle" />
              <span className="min-w-0 flex-1 truncate text-ink-muted">{r.name || "—"} <span className="text-ink-subtle">{r.email ?? ""}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
