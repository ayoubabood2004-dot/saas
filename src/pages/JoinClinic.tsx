import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Briefcase, LogIn, PartyPopper, ShieldCheck, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button, Dialog } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { acceptInvite, leaveClinic } from "@/lib/invites";
import { type StaffRole } from "@/lib/staff";
import { roleText } from "@/lib/roleText";
import { playSuccess, playWarning } from "@/lib/sounds";
import { forgetJoinCode, peekJoinCode, rememberJoinCode } from "@/lib/authNext";

/* الغلافُ بمستوى الوحدة لا داخل المكوّن (F12، ٢٥/١٠): تعريفُه داخل الصفحة كان يجعل نوعَه
 * جديداً بكلّ رسمة، فيُعاد بناءُ الحقل مع كلّ حرف — موظّفٌ يكتب رمزَ الدعوة من رسالة واتساب
 * كان يفقد التركيزَ بعد كلّ ضغطة، والبطاقةُ تُعيد حركتَها. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-surface-2 px-4">
      <div aria-hidden className="pointer-events-none absolute -start-24 -top-16 h-72 w-72 rounded-full bg-brand-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute end-0 bottom-0 h-80 w-80 rounded-full bg-accent-400/15 blur-3xl" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card relative w-full max-w-md p-6 text-center">
        <div className="mb-4 flex justify-center"><Logo size={48} /></div>
        {children}
      </motion.div>
    </div>
  );
}

/** Staff onboarding: redeem an invite code → join the clinic → welcome screen. */
export function JoinClinic() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [code, setCode] = useState(params.get("code") ?? peekJoinCode() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ clinicName?: string; role?: StaffRole } | null>(null);
  // Set when the signed-in user already owns a clinic and must confirm the switch.
  const [confirmOwner, setConfirmOwner] = useState<{ clinicName?: string } | null>(null);

  // الرمزُ يعبر رحلةَ الدخول بالجهاز لا بالتبويب (رابطُ تأكيد البريد يفتح تبويباً جديداً، والرئيسيةُ تُرجعه
  // هنا مرّةً واحدة) — ويُحفظ بضغطة «تسجيل الدخول» وحدها لا بمجرّد فتح الصفحة: فتحُ رابطٍ على جهازٍ
  // مشترك لا يرسل من يدخل بعده إلى دعوةٍ ليست له. وحين يصل وهو داخل، يُمسح.
  useEffect(() => {
    const c = params.get("code");
    if (c) setCode(c);
    if (!loading && user) forgetJoinCode();
  }, [params, user, loading]);

  // Recovery: this user is operating inside another clinic (joined as staff).
  const inAnotherClinic = !!user?.clinic_id && user.clinic_id !== user.id;
  const leave = async () => {
    setBusy(true); setError(null);
    const r = await leaveClinic();
    setBusy(false);
    if (r.ok) { playSuccess(); window.location.href = "/"; }
    else { playWarning(); setError(t("join.leaveFailed", { err: r.error ?? t("join.unknownErr") })); }
  };

  const accept = async (confirm = false) => {
    if (!code.trim()) { setError(t("join.needCode")); return; }
    setBusy(true); setError(null);
    const r = await acceptInvite(code.trim(), confirm);
    setBusy(false);
    if (r.ok) {
      playSuccess();
      setConfirmOwner(null);
      forgetJoinCode();
      setDone({ clinicName: r.clinicName, role: r.role });
    } else if (r.error === "confirm_owner_join") {
      // You own a clinic — warn strongly before switching workspace.
      playWarning();
      setConfirmOwner({ clinicName: r.clinicName });
    } else {
      playWarning();
      // الخادمُ يقول «غير صحيح أو مستعمل» عن بريدٍ لا يطابق الدعوة أيضاً (حمايةٌ من التخمين) —
      // فالرسالةُ تذكر البريدَ احتمالاً دون أن تؤكّد أن الرمزَ صحيح (F14).
      setError(
        r.error === "invalid_or_used" ? t("join.invalid")
          : r.error === "email_mismatch" ? t("join.emailMismatch")
            : r.error === "not_authenticated" ? t("join.signInFirst")
              : r.error === "already_clinic_owner" ? t("join.ownsClinic")
                : t("join.failed", { err: r.error ?? t("join.unknownErr") }),
      );
    }
  };

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
        <h1 className="font-display text-2xl font-extrabold text-ink">{t("join.welcome")} 🎉</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("join.joinedTo")} <span className="font-semibold text-ink">{done.clinicName || t("join.theClinic")}</span></p>
        {done.role && (
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <ShieldCheck size={15} /> {t("join.yourRole", { role: roleText(done.role, t) })}
          </span>
        )}
        <Button className="mt-6 w-full" size="lg" onClick={() => { window.location.href = "/"; }}>{t("join.start")}</Button>
      </Shell>
    );
  }

  // Not signed in → must authenticate first; the login page brings them straight back here.
  if (!user) {
    const back = `/join?code=${encodeURIComponent(code.trim())}`;
    return (
      <Shell>
        <h1 className="font-display text-xl font-extrabold text-ink">{t("join.inviteTitle")}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t("join.inviteSub")}</p>
        {code && <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-ink" dir="ltr">{code}</p>}
        <Button className="mt-5 w-full" size="lg" leftIcon={<LogIn size={18} />} onClick={() => { if (code.trim()) rememberJoinCode(code.trim()); navigate(`/login?as=clinic&staff=1&next=${encodeURIComponent(back)}`); }}>{t("join.signInBtn")}</Button>
        <p className="mt-3 text-2xs text-ink-subtle">{t("join.afterLogin")}</p>
      </Shell>
    );
  }

  // Signed in → confirm join.
  return (
    <Shell>
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Briefcase size={26} /></span>
      <h1 className="font-display text-xl font-extrabold text-ink">{t("join.joinTitle")}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("join.joinSub")}</p>
      <div className="mt-4 text-start">
        <label className="label" htmlFor="join-code">{t("join.codeLabel")}</label>
        <input id="join-code" dir="ltr" autoComplete="off" className="input text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="VET-XXXXXX" />
      </div>
      {error && <p role="alert" className="mt-2 flex items-center justify-center gap-1.5 text-sm text-danger-600"><AlertCircle size={15} className="shrink-0" /> {error}</p>}
      <Button className="mt-4 w-full" size="lg" loading={busy} onClick={() => accept()}>{t("join.joinBtn")}</Button>
      <button onClick={() => navigate("/")} className="mt-3 text-xs text-ink-subtle hover:text-ink">{t("join.skip")}</button>

      {/* Strong warning — you own a clinic and are switching into another workspace */}
      <Dialog
        open={!!confirmOwner}
        onClose={() => { if (!busy) setConfirmOwner(null); }}
        title={t("join.warnTitle")}
        footer={
          <div className="flex items-center gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmOwner(null)}>{t("join.cancelStay")}</Button>
            <Button className="flex-1" loading={busy} onClick={() => accept(true)}>{t("join.continueJoin")}</Button>
          </div>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><AlertTriangle size={20} /></span>
          <div className="text-sm text-ink-muted">
            <p className="font-semibold text-ink">{t("join.moveNote", { clinic: confirmOwner?.clinicName ?? t("join.theClinic") })}</p>
            <p className="mt-1"><Trans i18nKey="join.hiddenNote" components={{ b: <span className="font-semibold text-ink" /> }} /></p>
            <p className="mt-1 text-2xs text-ink-subtle">{t("join.mistake")}</p>
          </div>
        </div>
      </Dialog>

      {/* Recovery: you joined another clinic by mistake → leave & restore your own */}
      {inAnotherClinic && (
        <div className="mt-5 rounded-2xl border border-warn-200 bg-warn-50/60 p-3 text-start dark:border-warn-500/30 dark:bg-warn-500/10">
          <p className="text-xs font-semibold text-warn-700 dark:text-warn-300">{t("join.inOther")}</p>
          <p className="mt-0.5 text-2xs text-ink-muted">{t("join.inOtherSub")}</p>
          <Button variant="outline" className="mt-2 w-full" loading={busy} onClick={leave}>{t("join.leaveBtn")}</Button>
        </div>
      )}
    </Shell>
  );
}
