import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate } from "react-router-dom";
import {
  PawPrint,
  Stethoscope,
  Building2,
  Languages,
  AlertCircle,
  User,
  ShieldCheck,
  QrCode,
  HeartPulse,
  Sparkles,
  Eye,
  EyeOff,
  Mail,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { setLang, type Lang } from "@/i18n";
import { playScan, playTap, playSuccess } from "@/lib/sounds";
import { describeAuthError } from "@/lib/errors";
import { registerClinic, authenticateClinic, getClinicByEmail, setClinicPassword } from "@/lib/clinics";
import { registerOwner, authenticateOwner, getOwnerByEmail, setOwnerPassword } from "@/lib/owners";
import { Button, Input, Label, Segmented, Card, ThemeToggle, SuccessDialog, useToast } from "@/components/ui";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { HERO_PHOTO } from "@/lib/petPhotos";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PhoneInput } from "@/components/PhoneInput";
import { LogoMark } from "@/components/Logo";
import type { Role } from "@/types";

type Portal = "owner" | "clinic";

function pwScore(pw: string): { score: number; bar: string; text: string; key: string; def: string } {
  let n = 0;
  if (pw.length >= 6) n++;
  if (pw.length >= 10) n++;
  if (/[A-Z]/.test(pw) && /\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  if (n <= 1) return { score: 1, bar: "bg-danger-500", text: "text-danger-600", key: "auth.pwWeak", def: "Weak" };
  if (n === 2) return { score: 2, bar: "bg-warn-500", text: "text-warn-600", key: "auth.pwFair", def: "Fair" };
  if (n === 3) return { score: 3, bar: "bg-sky-500", text: "text-sky-600", key: "auth.pwGood", def: "Good" };
  return { score: 4, bar: "bg-success-500", text: "text-success-600", key: "auth.pwStrong", def: "Strong" };
}

function PasswordField({ label, value, onChange, show, setShow, autoComplete, withStrength, t }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void;
  autoComplete?: string; withStrength?: boolean; t: TFunction;
}) {
  const s = pwScore(value);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input className="input pe-10" type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required minLength={6} />
        <button type="button" onClick={() => setShow(!show)} aria-label="Show password" className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle transition hover:text-ink">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {withStrength && value.length > 0 && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex h-1.5 flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`h-full flex-1 rounded-full ${i < s.score ? s.bar : "bg-line"}`} />)}
          </div>
          <span className={`text-xs font-medium ${s.text}`}>{t(s.key, s.def)}</span>
        </div>
      )}
    </div>
  );
}

/** Live Supabase auth — sign in / sign up (+ phone, clinic city), email-code verification,
 *  and forgot/reset password. Shown when VITE_SUPABASE_* are configured. */
function SupabaseAuthCard() {
  const { t, i18n } = useTranslation();
  const { signUpEmail, signInEmail, verifyEmailCode, resendSignupCode, resetPassword, updatePassword, addRole, recovery } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [portal, setPortal] = useState<Portal>("owner");
  // When an existing email tries to sign up for a second role, we route them to
  // sign in and append this role to their account afterwards.
  const [pendingRole, setPendingRole] = useState<Portal | null>(null);
  const [view, setView] = useState<"auth" | "verify" | "forgot">("auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clear = () => { setError(null); setInfo(null); };
  const emailOk = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

  const submitAuth = async (e: FormEvent) => {
    e.preventDefault();
    clear();
    if (!emailOk(email)) { setError(t("auth.invalidEmail", "Enter a valid email address.")); return; }
    if (password.length < 6) { setError(t("auth.pwTooShort", "Password must be at least 6 characters.")); return; }
    playTap();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) { setError(t("auth.nameRequired", "Please enter your name.")); return; }
        const role: Role = portal === "clinic" ? "admin" : "owner";
        const res = await signUpEmail(email, password, name, role, { phone, city });
        if (res.error) { setError(res.error); return; }
        if (res.alreadyExists) {
          // Existing account → switch to sign-in and append this role after login
          // (no duplicate auth.users row).
          setPendingRole(portal);
          setMode("signin");
          setName("");
          setInfo(t("auth.emailExists", { role: t(`role.${portal}`), defaultValue: "This email already has an account. Sign in to add {{role}} access." }));
          return;
        }
        if (res.needsConfirm) {
          setView("verify");
          setInfo(t("auth.codeSent", { email: email.trim(), defaultValue: "We emailed a verification code to {{email}}." }));
          return;
        }
        playSuccess();
        navigate("/");
      } else {
        const res = await signInEmail(email, password);
        if (res.error) { const msg = describeAuthError(res.error, t); setError(msg); toast.error(msg); return; }
        if (pendingRole) {
          const add = await addRole(pendingRole);
          setPendingRole(null);
          if (add.error) toast.error(t("auth.roleAddFailed", "Signed in, but couldn't add the new role."), add.error);
          else toast.success(t("auth.roleAdded", { role: t(`role.${pendingRole}`), defaultValue: "{{role}} access added to your account." }));
        }
        playSuccess();
        navigate("/");
      }
    } catch (err) {
      // Any unexpected failure — surface it and (critically) reset the button below.
      const msg = describeAuthError(err instanceof Error ? err.message : null, t);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false); // the button NEVER stays stuck on "Loading…"
    }
  };

  const submitVerify = async (e: FormEvent) => {
    e.preventDefault();
    clear();
    playTap();
    setBusy(true);
    try {
      const res = await verifyEmailCode(email, code);
      if (res.error) {
        const msg = /expired|invalid|token/i.test(res.error) ? t("auth.codeInvalid", "Invalid or expired code — request a new one.") : res.error;
        setError(msg);
        toast.error(msg);
        return;
      }
      // verifyOtp established the session → onAuthStateChange logs the user in.
      playSuccess();
      toast.success(t("auth.verified", "Verified — welcome!"));
      navigate("/");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy) return;
    clear();
    playTap();
    setBusy(true);
    try {
      const res = await resendSignupCode(email);
      if (res.error) setError(res.error);
      else setInfo(t("auth.codeResent", "A new code is on the way."));
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault();
    clear();
    if (!emailOk(email)) { setError(t("auth.invalidEmail", "Enter a valid email address.")); return; }
    playTap();
    setBusy(true);
    try {
      const res = await resetPassword(email);
      if (res.error) { setError(res.error); return; }
      setInfo(t("auth.resetSent", "Check your email for a password-reset link."));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    clear();
    if (newPw.length < 6) { setError(t("auth.pwTooShort", "Password must be at least 6 characters.")); return; }
    playTap();
    setBusy(true);
    try {
      const res = await updatePassword(newPw);
      if (res.error) { setError(res.error); return; }
      playSuccess();
      navigate("/");
    } finally {
      setBusy(false);
    }
  };

  const msg = (
    <>
      {error && <p className="flex items-center gap-1.5 text-sm font-medium text-danger-600"><AlertCircle size={15} /> {error}</p>}
      {info && <p className="flex items-start gap-1.5 rounded-xl bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-500/10 dark:text-success-300"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /> {info}</p>}
    </>
  );

  const features = [
    { icon: QrCode, title: t("login.f1Title", "One universal passport"), body: t("login.f1Body", "A single QR your pet carries to any clinic, anywhere.") },
    { icon: HeartPulse, title: t("login.f2Title", "Complete medical record"), body: t("login.f2Body", "Vitals, vaccines, treatments and history — always in sync.") },
    { icon: ShieldCheck, title: t("login.f3Title", "Private & secure"), body: t("login.f3Body", "You decide what each clinic can see. Always.") },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand hero (desktop) ── */}
      <div className="relative hidden overflow-hidden bg-brand-grad p-12 lg:flex lg:flex-col lg:justify-between">
        <img src={HERO_PHOTO} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-700/70 via-brand-600/45 to-brand-500/55" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
        <motion.div className="pointer-events-none absolute right-16 top-1/3 text-white/10" animate={{ y: [0, -18, 0], rotate: [0, 6, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>
          <PawPrint size={180} />
        </motion.div>

        <div className="relative flex items-center gap-3 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur"><LogoMark size={26} /></span>
          <span className="font-display text-2xl font-extrabold tracking-tighter2">{t("app.name")}</span>
        </div>

        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative max-w-md text-white">
          <motion.h2 variants={staggerItem} className="font-display text-4xl font-extrabold leading-tight tracking-tighter2">
            {t("login.heroTitle", "Every pet deserves a record that travels with them.")}
          </motion.h2>
          <motion.p variants={staggerItem} className="mt-4 text-lg text-white/80">{t("app.tagline")}</motion.p>
          <div className="mt-10 space-y-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} variants={staggerItem} className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur"><Icon size={22} /></span>
                  <div>
                    <p className="font-display font-bold">{f.title}</p>
                    <p className="text-sm text-white/75">{f.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <div className="relative flex items-center gap-2 text-sm text-white/70">
          <Sparkles size={16} /> {t("login.trust", "Trusted by veterinarians, loved by pet owners.")}
        </div>
      </div>

      {/* ── Auth panel ── */}
      <div className="relative flex flex-col bg-surface">
        <div className="flex items-center justify-end gap-1 p-4">
          <button onClick={() => setLang((i18n.language === "ar" ? "en" : "ar") as Lang)} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink">
            <Languages size={18} /> {i18n.language === "ar" ? "English" : "العربية"}
          </button>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
          {/* Mobile brand mark */}
          <div className="mb-6 flex flex-col items-center lg:hidden">
            <div className="mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-brand-grad text-white shadow-soft"><LogoMark size={32} /></div>
            <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">{t("app.name")}</h1>
            <p className="mt-1 text-ink-muted">{t("app.tagline")}</p>
          </div>

          <motion.div key={recovery ? "reset" : view + mode} variants={staggerContainer} initial="initial" animate="animate" className="w-full max-w-sm">
            {recovery ? (
              /* Set a new password (arrived via recovery link) */
              <form onSubmit={submitReset} className="space-y-3">
                <h2 className="font-display text-xl font-extrabold text-ink">{t("auth.setNewPassword", "Set a new password")}</h2>
                <p className="text-sm text-ink-muted">{t("auth.setNewPasswordSub", "Choose a new password for your account.")}</p>
                <PasswordField label={t("auth.newPassword", "New password")} value={newPw} onChange={setNewPw} show={showPw} setShow={setShowPw} autoComplete="new-password" withStrength t={t} />
                {msg}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? t("common.loading") : t("auth.updatePassword", "Update password")}</Button>
              </form>
            ) : view === "forgot" ? (
              /* Forgot password — send a reset email */
              <form onSubmit={submitForgot} className="space-y-3">
                <button type="button" onClick={() => { setView("auth"); clear(); }} className="mb-1 inline-flex items-center gap-1 text-sm text-ink-muted transition hover:text-ink"><ArrowLeft size={15} /> {t("auth.backToSignin", "Back to sign in")}</button>
                <h2 className="font-display text-xl font-extrabold text-ink">{t("auth.forgotTitle", "Reset your password")}</h2>
                <p className="text-sm text-ink-muted">{t("auth.forgotSub", "Enter your email and we'll send a reset link.")}</p>
                <div>
                  <label className="label">{t("phone.email", "Email")}</label>
                  <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                </div>
                {msg}
                <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? t("common.loading") : t("auth.sendReset", "Send reset link")}</Button>
              </form>
            ) : view === "verify" ? (
              /* Email verification code */
              <form onSubmit={submitVerify} className="space-y-3">
                <button type="button" onClick={() => { setView("auth"); clear(); }} className="mb-1 inline-flex items-center gap-1 text-sm text-ink-muted transition hover:text-ink"><ArrowLeft size={15} /> {t("common.back")}</button>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Mail size={22} /></span>
                <h2 className="font-display text-xl font-extrabold text-ink">{t("auth.verifyTitle", "Verify your email")}</h2>
                <p className="text-sm text-ink-muted">{t("auth.verifySub", "Enter the code we emailed you to finish creating your account.")}</p>
                <div>
                  <label className="label">{t("auth.code", "Verification code")}</label>
                  <input className="input text-center text-lg font-bold tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••••" autoFocus />
                </div>
                {msg}
                <Button type="submit" size="lg" className="w-full" disabled={busy || code.length < 4}>{busy ? t("common.loading") : t("auth.verify", "Verify & continue")}</Button>
                <button type="button" onClick={resend} disabled={busy} className="w-full text-center text-sm font-medium text-brand-600 hover:underline disabled:opacity-50 disabled:no-underline">{t("auth.resend", "Resend code")}</button>
              </form>
            ) : (
              /* Sign in / Sign up */
              <>
                <motion.div variants={staggerItem}>
                  <Segmented
                    className="mb-5 w-full [&>button]:flex-1"
                    layoutId="portal"
                    value={portal}
                    onChange={(p) => { setPortal(p as Portal); clear(); }}
                    options={[
                      { value: "owner", label: t("auth.iAmOwner"), icon: <User size={16} /> },
                      { value: "clinic", label: t("auth.iAmClinic"), icon: <Building2 size={16} /> },
                    ]}
                  />
                </motion.div>

                <motion.div variants={staggerItem}>
                  <h2 className="font-display text-xl font-extrabold text-ink">
                    {mode === "signin" ? t("auth.welcomeBack", "Welcome back") : t("auth.createAccount", "Create your account")}
                  </h2>
                  <p className="mb-4 text-sm text-ink-muted">
                    {portal === "owner" ? t("auth.ownerSub", "Manage your pets' health in one place.") : t("auth.clinicSub", "Run your clinic — records, reception and treatments.")}
                  </p>
                </motion.div>

                <motion.form variants={staggerItem} onSubmit={submitAuth} className="space-y-3">
                  {mode === "signup" && (
                    <>
                      <div>
                        <label className="label">{portal === "clinic" ? t("auth.clinicName", "Clinic name") : t("auth.fullName", "Full name")}</label>
                        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                      </div>
                      <div>
                        <label className="label">{t("auth.phone", "Phone")}</label>
                        <PhoneInput value={phone} onChange={setPhone} />
                      </div>
                      {portal === "clinic" && (
                        <div>
                          <label className="label">{t("auth.city", "City")}</label>
                          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <label className="label">{t("phone.email", "Email")}</label>
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
                  </div>
                  <PasswordField label={t("auth.password", "Password")} value={password} onChange={setPassword} show={showPw} setShow={setShowPw} autoComplete={mode === "signin" ? "current-password" : "new-password"} withStrength={mode === "signup"} t={t} />
                  {mode === "signin" && (
                    <button type="button" onClick={() => { setView("forgot"); clear(); }} className="block w-full text-end text-sm font-medium text-brand-600 hover:underline">{t("auth.forgotLink", "Forgot password?")}</button>
                  )}
                  {msg}
                  <Button type="submit" size="lg" className="w-full" disabled={busy}>
                    {busy ? t("common.loading") : mode === "signin" ? t("auth.signIn", "Sign in") : t("auth.signUp", "Create account")}
                  </Button>
                </motion.form>

                <motion.p variants={staggerItem} className="mt-5 text-center text-sm text-ink-muted">
                  {mode === "signin" ? t("auth.noAccount", "New here?") : t("auth.haveAccount", "Already have an account?")}{" "}
                  <button onClick={() => { playTap(); setMode(mode === "signin" ? "signup" : "signin"); clear(); }} className="font-semibold text-brand-600 hover:underline">
                    {mode === "signin" ? t("auth.signUp", "Create one") : t("auth.signIn", "Sign in")}
                  </button>
                </motion.p>
              </>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  return isSupabaseConfigured ? <SupabaseAuthCard /> : <DemoLogin />;
}

function DemoLogin() {
  const { t, i18n } = useTranslation();
  const { signInDemo, signInClinic, signInOwner } = useAuth();
  const navigate = useNavigate();

  const [portal, setPortal] = useState<Portal>("owner");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Password reset flow
  const [view, setView] = useState<"auth" | "reset">("auth");
  const [resetStep, setResetStep] = useState<"email" | "code">("email");
  const [sentCode, setSentCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [resetNote, setResetNote] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [welcome, setWelcome] = useState<{ name: string; to: string } | null>(null);

  const toggleLang = () => setLang((i18n.language === "ar" ? "en" : "ar") as Lang);
  const switchPortal = (p: Portal) => { setPortal(p); setMode("signin"); setError(null); setView("auth"); };

  const accountByEmail = (e: string) => (portal === "owner" ? getOwnerByEmail(e) : getClinicByEmail(e));
  const setAccountPassword = (e: string, pw: string) => (portal === "owner" ? setOwnerPassword(e, pw) : setClinicPassword(e, pw));

  const openReset = () => { setView("reset"); setResetStep("email"); setError(null); setResetNote(null); setResetDone(false); setSentCode(""); setEnteredCode(""); setNewPw(""); setNewPw2(""); };
  const backToSignin = () => { setView("auth"); setMode("signin"); setError(null); };

  const sendCode = () => {
    setError(null);
    if (!accountByEmail(email)) { setError(t("auth.noAccountEmail")); return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setSentCode(code);
    setResetStep("code");
    playSuccess();
    setResetNote(t("auth.codeSent", { email }) + " " + t("auth.demoCodeNote", { code }));
  };

  const confirmReset = () => {
    setError(null);
    if (enteredCode.trim() !== sentCode) { setError(t("auth.codeWrong")); return; }
    if (newPw.length < 4 || newPw !== newPw2) { setError(t("auth.pwMismatch")); return; }
    setAccountPassword(email, newPw);
    playSuccess();
    setResetDone(true);
    setPassword("");
  };

  const submit = () => {
    setError(null);
    if (portal === "owner") {
      if (mode === "register") {
        if (!name.trim() || !email.trim() || !password) return;
        const res = registerOwner({ name, email, password, phone });
        if (!res.ok) { setError(t("auth.accountExists")); return; }
        signInOwner(res.owner);
        setWelcome({ name, to: "/" });
      } else {
        const owner = authenticateOwner(email, password);
        if (!owner) { setError(t("auth.invalidLogin")); return; }
        playScan();
        signInOwner(owner);
        navigate("/");
      }
      return;
    }
    if (mode === "register") {
      if (!name.trim() || !email.trim() || !password) return;
      const res = registerClinic({ name, email, password, city, phone, license });
      if (!res.ok) { setError(t("auth.emailTaken")); return; }
      signInClinic(res.clinic);
      setWelcome({ name, to: "/reception" });
    } else {
      const clinic = authenticateClinic(email, password);
      if (!clinic) { setError(t("auth.invalidLogin")); return; }
      playScan();
      signInClinic(clinic);
      navigate("/reception");
    }
  };

  const isOwner = portal === "owner";

  const features = [
    { icon: QrCode, title: t("login.f1Title", "One universal passport"), body: t("login.f1Body", "A single QR your pet carries to any clinic, anywhere.") },
    { icon: HeartPulse, title: t("login.f2Title", "Complete medical record"), body: t("login.f2Body", "Vitals, vaccines, treatments and history — always in sync.") },
    { icon: ShieldCheck, title: t("login.f3Title", "Private & secure"), body: t("login.f3Body", "You decide what each clinic can see. Always.") },
  ];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ── Brand hero (desktop) ── */}
      <div className="relative hidden overflow-hidden bg-brand-grad p-12 lg:flex lg:flex-col lg:justify-between">
        {/* Photographic warmth behind the gradient */}
        <img
          src={HERO_PHOTO}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-luminosity"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-700/70 via-brand-600/45 to-brand-500/55" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-300/20 blur-3xl" />
        <motion.div
          className="pointer-events-none absolute right-16 top-1/3 text-white/10"
          animate={{ y: [0, -18, 0], rotate: [0, 6, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <PawPrint size={180} />
        </motion.div>

        <div className="relative flex items-center gap-3 text-white">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 backdrop-blur">
            <LogoMark size={26} />
          </span>
          <span className="font-display text-2xl font-extrabold tracking-tighter2">{t("app.name")}</span>
        </div>

        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="relative max-w-md text-white">
          <motion.h2 variants={staggerItem} className="font-display text-4xl font-extrabold leading-tight tracking-tighter2">
            {t("login.heroTitle", "Every pet deserves a record that travels with them.")}
          </motion.h2>
          <motion.p variants={staggerItem} className="mt-4 text-lg text-white/80">
            {t("app.tagline")}
          </motion.p>
          <div className="mt-10 space-y-5">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <motion.div key={f.title} variants={staggerItem} className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className="font-display font-bold">{f.title}</p>
                    <p className="text-sm text-white/75">{f.body}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        <div className="relative flex items-center gap-2 text-sm text-white/70">
          <Sparkles size={16} /> {t("login.trust", "Trusted by veterinarians, loved by pet owners.")}
        </div>
      </div>

      {/* ── Auth panel ── */}
      <div className="relative flex flex-col bg-surface">
        <div className="flex items-center justify-end gap-1 p-4">
          <button onClick={toggleLang} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink">
            <Languages size={18} />
            {i18n.language === "ar" ? "English" : "العربية"}
          </button>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
          {/* Mobile brand mark */}
          <div className="mb-6 flex flex-col items-center lg:hidden">
            <div className="mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-brand-grad text-white shadow-soft">
              <LogoMark size={32} />
            </div>
            <h1 className="font-display text-2xl font-extrabold tracking-tighter2 text-ink">{t("app.name")}</h1>
            <p className="mt-1 text-ink-muted">{t("app.tagline")}</p>
          </div>

          <div className="w-full max-w-sm">
            <Segmented
              className="mb-5 w-full [&>button]:flex-1"
              layoutId="portal"
              value={portal}
              onChange={switchPortal}
              options={[
                { value: "owner", label: t("auth.iAmOwner"), icon: <User size={16} /> },
                { value: "clinic", label: t("auth.iAmClinic"), icon: <Building2 size={16} /> },
              ]}
            />

            <motion.div
              key={view + portal}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {view === "auth" ? (
                <Card padded>
                  <div className="mb-1 flex items-center gap-2 text-brand-700 dark:text-brand-300">
                    {isOwner ? <User size={20} /> : <Building2 size={20} />}
                    <h2 className="font-display font-bold">{isOwner ? t("auth.ownerPortal") : t("auth.clinicPortal")}</h2>
                  </div>
                  <p className="mb-4 text-xs text-ink-subtle">{isOwner ? t("auth.ownerHint") : t("auth.clinicHint")}</p>

                  <div className="space-y-3">
                    {mode === "register" && (
                      <div>
                        <Label>{isOwner ? t("auth.fullName") : t("auth.clinicName")}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                    )}
                    <div>
                      <Label>{t("auth.email")}</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isOwner ? "you@email.com" : "clinic@email.com"} />
                    </div>
                    <div>
                      <Label>{t("auth.password")}</Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
                    </div>
                    {mode === "register" && (
                      <>
                        <div>
                          <Label>{t("phone.number")}</Label>
                          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        {!isOwner && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label>{t("auth.city")}</Label>
                              <Input value={city} onChange={(e) => setCity(e.target.value)} />
                            </div>
                            <div>
                              <Label>{t("auth.license")}</Label>
                              <Input value={license} onChange={(e) => setLicense(e.target.value)} />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {error && <ErrorNote>{error}</ErrorNote>}

                    <Button className="w-full" onClick={submit}>
                      {mode === "register" ? (isOwner ? t("auth.registerOwner") : t("auth.register")) : t("auth.signIn")}
                    </Button>

                    <button className="w-full pt-1 text-center text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => { setError(null); setMode(mode === "register" ? "signin" : "register"); }}>
                      {mode === "register" ? (isOwner ? t("auth.haveOwner") : t("auth.haveClinic")) : (isOwner ? t("auth.newOwner") : t("auth.newClinic"))}
                    </button>
                    {mode === "signin" && (
                      <button className="w-full text-center text-xs text-ink-subtle hover:text-brand-600" onClick={openReset}>
                        {t("auth.forgot")}
                      </button>
                    )}
                    {mode === "signin" && <p className="text-center text-[11px] text-ink-subtle">{isOwner ? t("auth.demoOwner") : t("auth.demoClinic")}</p>}
                  </div>
                </Card>
              ) : (
                <Card padded>
                  <h2 className="mb-1 font-display font-bold text-brand-700 dark:text-brand-300">{t("auth.resetTitle")}</h2>
                  {resetDone ? (
                    <div className="space-y-4">
                      <p className="flex items-center gap-1.5 text-sm text-success-700"><AlertCircle size={15} /> {t("auth.resetDone")}</p>
                      <Button className="w-full" onClick={backToSignin}>{t("auth.backToSignin")}</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-ink-subtle">{t("auth.resetEmailHint")}</p>
                      <div>
                        <Label>{t("auth.email")}</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={resetStep === "code"} placeholder="you@email.com" />
                      </div>

                      {resetStep === "code" && (
                        <>
                          {resetNote && <p className="rounded-xl bg-warn-50 p-2 text-xs text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">{resetNote}</p>}
                          <div>
                            <Label>{t("auth.code")}</Label>
                            <Input className="font-mono tracking-widest" value={enteredCode} onChange={(e) => setEnteredCode(e.target.value)} placeholder="123456" />
                          </div>
                          <div>
                            <Label>{t("auth.newPassword")}</Label>
                            <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                          </div>
                          <div>
                            <Label>{t("auth.confirmPassword")}</Label>
                            <Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmReset()} />
                          </div>
                        </>
                      )}

                      {error && <ErrorNote>{error}</ErrorNote>}

                      {resetStep === "email" ? (
                        <Button className="w-full" onClick={sendCode}>{t("auth.sendCode")}</Button>
                      ) : (
                        <Button className="w-full" onClick={confirmReset}>{t("auth.resetConfirm")}</Button>
                      )}
                      <button className="w-full pt-1 text-center text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={backToSignin}>{t("auth.backToSignin")}</button>
                    </div>
                  )}
                </Card>
              )}
            </motion.div>

            {/* Quick demo */}
            <div className="mt-6">
              <p className="mb-3 text-center text-xs text-ink-subtle">{t("auth.demoQuick")}</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" leftIcon={<PawPrint size={18} />} onClick={() => { playTap(); signInDemo("owner"); navigate("/"); }}>
                  {t("auth.owner")}
                </Button>
                <Button variant="secondary" className="flex-1" leftIcon={<Stethoscope size={18} />} onClick={() => { playScan(); signInDemo("doctor"); navigate("/reception"); }}>
                  {t("auth.doctor")}
                </Button>
              </div>
              <p className="pt-4 text-center text-xs text-ink-subtle">{t("common.demoMode")}</p>
            </div>
          </div>
        </div>
      </div>

      <SuccessDialog
        open={!!welcome}
        onClose={() => { const to = welcome?.to ?? "/"; setWelcome(null); navigate(to); }}
        title={t("auth.welcomeAboard", "Welcome aboard! 🎉")}
        message={t("auth.welcomeMsg", { name: welcome?.name ?? "", defaultValue: "Your account is ready, {{name}}. Let's get started." })}
        actionLabel={t("auth.getStarted", "Get started")}
        onAction={() => { const to = welcome?.to ?? "/"; setWelcome(null); navigate(to); }}
      />
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <motion.p
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5 rounded-xl bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700 dark:bg-danger-500/10 dark:text-danger-200"
    >
      <AlertCircle size={15} /> {children}
    </motion.p>
  );
}
