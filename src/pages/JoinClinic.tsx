import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Briefcase, LogIn, PartyPopper, ShieldCheck, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Dialog } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { acceptInvite, leaveClinic } from "@/lib/invites";
import { ROLE_LABEL, type StaffRole } from "@/lib/staff";
import { playSuccess, playWarning } from "@/lib/sounds";

const JOIN_CODE_KEY = "vp_join_code";

/** Staff onboarding: redeem an invite code → join the clinic → welcome screen. */
export function JoinClinic() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ clinicName?: string; role?: StaffRole } | null>(null);
  // Set when the signed-in user already owns a clinic and must confirm the switch.
  const [confirmOwner, setConfirmOwner] = useState<{ clinicName?: string } | null>(null);

  // Remember the code across a login round-trip.
  useEffect(() => {
    const c = params.get("code");
    if (c) { setCode(c); sessionStorage.setItem(JOIN_CODE_KEY, c); }
    else { const saved = sessionStorage.getItem(JOIN_CODE_KEY); if (saved) setCode(saved); }
  }, [params]);

  // Recovery: this user is operating inside another clinic (joined as staff).
  const inAnotherClinic = !!user?.clinic_id && user.clinic_id !== user.id;
  const leave = async () => {
    setBusy(true); setError(null);
    const r = await leaveClinic();
    setBusy(false);
    if (r.ok) { playSuccess(); window.location.href = "/"; }
    else { playWarning(); setError(`تعذّرت المغادرة: ${r.error ?? "خطأ غير معروف"}`); }
  };

  const accept = async (confirm = false) => {
    if (!code.trim()) { setError("أدخل رمز الدعوة"); return; }
    setBusy(true); setError(null);
    const r = await acceptInvite(code.trim(), confirm);
    setBusy(false);
    if (r.ok) {
      playSuccess();
      setConfirmOwner(null);
      sessionStorage.removeItem(JOIN_CODE_KEY);
      setDone({ clinicName: r.clinicName, role: r.role });
    } else if (r.error === "confirm_owner_join") {
      // You own a clinic — warn strongly before switching workspace.
      playWarning();
      setConfirmOwner({ clinicName: r.clinicName });
    } else {
      playWarning();
      setError(
        r.error === "invalid_or_used" ? "رمز الدعوة غير صحيح أو مُستخدَم."
          : r.error === "email_mismatch" ? "هذه الدعوة مخصّصة لبريد إلكتروني محدّد. سجّل الدخول بالبريد الذي استلم الدعوة لإتمام الانضمام."
            : r.error === "not_authenticated" ? "سجّل الدخول أولاً."
              : r.error === "already_clinic_owner" ? "لا يمكنك الانضمام لعيادة أخرى لأنك تملك عيادة خاصة بك. بياناتك آمنة ولم تتأثر — استخدم حساباً منفصلاً للعمل كموظف في عيادة أخرى."
                : `تعذّر الانضمام: ${r.error ?? "خطأ غير معروف"}`,
      );
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-surface-2 px-4">
      <div aria-hidden className="pointer-events-none absolute -start-24 -top-16 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute end-0 bottom-0 h-80 w-80 rounded-full bg-accent-400/15 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card relative w-full max-w-md p-6 text-center">
        <div className="mb-4 flex justify-center"><Logo size={48} /></div>
        {children}
      </motion.div>
    </div>
  );

  if (loading) {
    return <Shell><Loader2 className="mx-auto animate-spin text-brand-500" size={28} /></Shell>;
  }

  // Success → welcome screen.
  if (done) {
    return (
      <Shell>
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.05 }} className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-success-500 text-white shadow-soft">
          <PartyPopper size={30} />
        </motion.span>
        <h1 className="font-display text-2xl font-extrabold text-ink">أهلاً بك في الفريق! 🎉</h1>
        <p className="mt-1 text-sm text-ink-muted">انضممتَ إلى <span className="font-semibold text-ink">{done.clinicName || "العيادة"}</span></p>
        {done.role && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <ShieldCheck size={15} /> دورك: {ROLE_LABEL[done.role]}
          </span>
        )}
        <Button className="mt-6 w-full" size="lg" onClick={() => { window.location.href = "/"; }}>ابدأ العمل</Button>
      </Shell>
    );
  }

  // Not signed in → must authenticate first (the code is preserved).
  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-extrabold text-ink">دعوة للانضمام إلى عيادة</h1>
        <p className="mt-1 text-sm text-ink-muted">سجّل الدخول أو أنشئ حساباً بنفس بريدك لقبول الدعوة.</p>
        {code && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-ink" dir="ltr">{code}</p>}
        <Button className="mt-5 w-full" size="lg" leftIcon={<LogIn size={18} />} onClick={() => navigate("/login")}>تسجيل الدخول / إنشاء حساب</Button>
        <p className="mt-3 text-2xs text-ink-subtle">بعد الدخول، افتح رابط الدعوة نفسه مرّة أخرى لإتمام الانضمام.</p>
      </Shell>
    );
  }

  // Signed in → confirm join.
  return (
    <Shell>
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Briefcase size={26} /></span>
      <h1 className="font-display text-xl font-extrabold text-ink">الانضمام إلى العيادة</h1>
      <p className="mt-1 text-sm text-ink-muted">أكّد رمز الدعوة للانضمام إلى فريق العيادة.</p>
      <div className="mt-4 text-start">
        <label className="label">رمز الدعوة</label>
        <input dir="ltr" className="input text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VET-XXXXXX" />
      </div>
      {error && <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-danger-600"><AlertCircle size={15} /> {error}</p>}
      <Button className="mt-4 w-full" size="lg" loading={busy} onClick={() => accept()}>انضمام</Button>
      <button onClick={() => navigate("/")} className="mt-3 text-xs text-ink-subtle hover:text-ink">تخطّي والعودة للرئيسية</button>

      {/* Strong warning — you own a clinic and are switching into another workspace */}
      <Dialog
        open={!!confirmOwner}
        onClose={() => { if (!busy) setConfirmOwner(null); }}
        title="تحذير: أنت تملك عيادة"
        footer={
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmOwner(null)}>إلغاء (البقاء في عيادتي)</Button>
            <Button className="flex-1" loading={busy} onClick={() => accept(true)}>متابعة الانضمام</Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><AlertTriangle size={20} /></span>
          <div className="text-sm text-ink-muted">
            <p className="font-semibold text-ink">الانضمام إلى «{confirmOwner?.clinicName ?? "العيادة"}» سينقلك إلى مساحة عملها.</p>
            <p className="mt-1">ستُخفى بيانات عيادتك مؤقتاً أثناء عملك هناك — <span className="font-semibold text-ink">لن تُحذف أي معلومة</span>. تقدر تستعيد عيادتك وكل بياناتها في أي وقت عبر زر «مغادرة هذه العيادة».</p>
            <p className="mt-1 text-2xs text-ink-subtle">إذا فتحت الرابط بالخطأ، اضغط «إلغاء».</p>
          </div>
        </div>
      </Dialog>

      {/* Recovery: you joined another clinic by mistake → leave & restore your own */}
      {inAnotherClinic && (
        <div className="mt-5 rounded-2xl border border-warn-200 bg-warn-50/60 p-3 text-start dark:border-warn-500/30 dark:bg-warn-500/10">
          <p className="text-xs font-semibold text-warn-700 dark:text-warn-300">أنت تعمل حالياً ضمن عيادة انضممت إليها.</p>
          <p className="mt-0.5 text-2xs text-ink-muted">إذا حدث هذا بالخطأ، غادر العيادة لتستعيد عيادتك وبياناتك (لم تُحذف، فقط مخفية مؤقتاً).</p>
          <Button variant="outline" className="mt-2 w-full" loading={busy} onClick={leave}>مغادرة هذه العيادة واستعادة عيادتي</Button>
        </div>
      )}
    </Shell>
  );
}
