// ============================================================================
// بوّابة المالك — /p/:slug — ملفُّ حيوانه من رابط العيادة العام (0158)
//
// صفحةٌ قائمةٌ بذاتها بلا مصادقة Supabase: المالكُ يثبت أنه يملك رقمَ الهاتف
// الذي كتبته العيادةُ يوم التسجيل، فيفتح ما يخصّه عند **هذه العيادة وحدها**.
// كلُّ بيانةٍ تصل عبر دوالّ `portal_*` الآمنة، والقصُّ يجري بالقاعدة لا هنا.
//
// موبايل أولاً وRTL كأختَيها (`/s/:slug` و`/t/:token`): من يفتح رابطَ عيادةٍ
// عراقية على تلفونه لا يقرأ إنكليزية — و`preferArabicForVisitor` تعرّب لمن لا
// تفضيلَ محفوظاً عنده، وتترك من اختار لغةً على اختياره.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  PawPrint, Phone, MessageCircle, ArrowRight, Loader2, ShieldCheck, LogOut,
  Syringe, CalendarDays, Scale, Pill, CheckCircle2, Clock, AlertTriangle, Home,
  BedDouble, Stethoscope, RefreshCw, ChevronLeft, Store,
} from "lucide-react";
import type { PortalMe, PortalPetCard, PortalPetDetail, StoreFrontInfo } from "@/types";
import { repo } from "@/lib/repo";
import { journeyStageDef } from "@/lib/journey";
import {
  getPortalToken, setPortalToken, clearPortalToken, preferArabicForVisitor,
  speciesEmoji, daysFromToday, vaxUrgency, looksLikePhone,
} from "@/lib/portal";
import { waNumber } from "@/lib/phone";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { cn, fmtKg, formatNum } from "@/lib/utils";

type Step = "phone" | "code";

export function OwnerPortal() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();

  const [token, setToken] = useState<string | null>(() => getPortalToken(slug));
  const [front, setFront] = useState<StoreFrontInfo | null>(null);
  const [me, setMe] = useState<PortalMe | null>(null);
  const [boot, setBoot] = useState<"loading" | "ready" | "closed">("loading");
  const [openPet, setOpenPet] = useState<string | null>(null);

  // حالةُ الدخول
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);

  useEffect(() => { preferArabicForVisitor(); }, []);

  /** رسائلُ الخادم → جملةٌ يفهمها المراجع. */
  const errText = useCallback((codeStr?: string) => {
    switch (codeStr) {
      case "closed":       return t("portal.err.closed", "هذي الصفحة مو متاحة حالياً — راجع العيادة.");
      case "bad_phone":    return t("portal.err.badPhone", "الرقم مو صحيح — دقّقه وحاول مرّة ثانية.");
      case "bad_code":     return t("portal.err.badCode", "الرمز مو صحيح أو انتهت صلاحيته.");
      case "too_many":     return t("portal.err.tooMany", "جرّبت مرّات كثيرة — اطلب رمز جديد.");
      case "rate_limited": return t("portal.err.rate", "محاولات كثيرة بوقت قصير — استنّى شوية.");
      default:             return t("portal.err.generic", "صار خلل — حاول مرّة ثانية.");
    }
  }, [t]);

  /* هويّةُ العيادة قبل الدخول: من `store_front` العامة — فالزائرُ يرى لوجو
   * عيادته وشعارَها قبل أن يكتب رقمه، لا صفحةً بيضاء تطلب رقمَ هاتف. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await repo.storeFrontPublic(slug);
        if (!alive) return;
        setFront(f);
        if (f) document.title = `${f.name} — ${t("portal.myPets", "حيواناتي")}`;
      } catch { /* الهويّةُ زينة: غيابُها لا يمنع الدخول */ }
      if (alive) setBoot((b) => (b === "loading" ? "ready" : b));
    })();
    return () => { alive = false; };
  }, [slug, t]);

  /** تحميلُ الملفّ. جلسةٌ ميتة تُمحى بصمت وتُعرض شاشةُ الدخول — لا رسالةَ خطأ
   *  على مراجعٍ لا ذنبَ له، ولا رمزٌ ميّت يبقى بالجهاز. */
  const loadMe = useCallback(async (tok: string) => {
    try {
      const data = await repo.portalMe(tok);
      if (!data) { clearPortalToken(slug); setToken(null); setMe(null); return; }
      setMe(data);
    } catch {
      setErr(errText());
    } finally {
      setBoot("ready");
    }
  }, [slug, errText]);

  useEffect(() => {
    if (!token) { setMe(null); return; }
    void loadMe(token);
  }, [token, loadMe]);

  const sendCode = async () => {
    if (busy) return;
    setErr(null);
    if (!looksLikePhone(phone)) { setErr(errText("bad_phone")); playWarning(); return; }
    setBusy(true);
    try {
      const res = await repo.portalRequestCode(slug, phone);
      if (!res.ok) { setErr(errText(res.error)); playWarning(); return; }
      setTestCode(res.test_code ?? null);
      setStep("code");
      playSuccess();
    } catch {
      setErr(errText());
    } finally { setBusy(false); }
  };

  const verify = async () => {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await repo.portalVerifyCode(slug, phone, code);
      if (!res.ok || !res.token) { setErr(errText(res.error)); playWarning(); return; }
      setPortalToken(slug, res.token);
      setToken(res.token);
      setCode(""); setTestCode(null); setStep("phone");
      playSuccess();
    } catch {
      setErr(errText());
    } finally { setBusy(false); }
  };

  const logout = async () => {
    playTap();
    const tok = token;
    clearPortalToken(slug);
    setToken(null); setMe(null); setOpenPet(null);
    if (tok) await repo.portalLogout(tok);
  };

  // `||` لا `??` عمداً: القاعدةُ ترجع اسماً فارغاً حين لا اسمَ لها، والفارغُ
  // يمرّ من `??` فتظهر ترويسةٌ بلا اسم.
  const clinicName = me?.clinic.name || front?.name || t("portal.clinic", "العيادة");
  const clinicLogo = me?.clinic.logo_url ?? front?.logo_url ?? null;
  const clinicWa   = me?.clinic.whatsapp ?? front?.whatsapp ?? null;
  const clinicTel  = me?.clinic.phone ?? front?.phone ?? null;

  if (boot === "loading") {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface">
        <Loader2 className="animate-spin text-brand-600" size={30} />
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-surface pb-16">
      {/* ── الهيرو: هويّةُ العيادة ── */}
      <header className="relative overflow-hidden bg-brand-grad px-4 pb-7 pt-7 text-white">
        <div className="pointer-events-none absolute -end-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-10 start-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative mx-auto flex max-w-3xl items-center gap-4">
          {clinicLogo
            ? <img src={clinicLogo} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-raised" />
            : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15 shadow-raised"><PawPrint size={26} /></span>}
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-bold uppercase tracking-widest text-white/70">{t("portal.myPets", "حيواناتي")}</p>
            <h1 className="truncate font-display text-xl font-extrabold">{clinicName}</h1>
          </div>
          {token && (
            <button onClick={logout} aria-label={t("portal.logout", "خروج")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 transition hover:bg-white/25">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {/* لا `AnimatePresence mode="wait"` هنا عمداً: هي تؤجّل ظهورَ الشاشة
            التالية حتى ينتهي أنيميشنُ خروج السابقة — وأنيميشنُ framer يمشي على
            `requestAnimationFrame`. فحيثما لا يُرسم الإطار (تبويبٌ بالخلفية،
            وضعُ توفير طاقة، متصفّحٌ يخنق الرسم) لا ينتهي الخروجُ أبداً فتعلق
            الشاشةُ على القديمة: يضغط المالكُ على حيوانه ولا يصير شيء.
            مُسك هذا بالفحص فعلاً. الدخولُ وحده يُحرَّك، ولا خروجَ يُنتظر. */}
        <div>
          {!token ? (
            <motion.div key="login" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <LoginCard
                step={step} phone={phone} code={code} busy={busy} err={err} testCode={testCode}
                onPhone={setPhone} onCode={setCode} onSend={sendCode} onVerify={verify}
                onBack={() => { setStep("phone"); setCode(""); setErr(null); setTestCode(null); }}
              />
            </motion.div>
          ) : openPet ? (
            <motion.div key="pet" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
              <PetDetail token={token} petId={openPet} showMedical={!!me?.show_medical}
                onBack={() => { playTap(); setOpenPet(null); }} />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              {me && me.pets.length === 0 ? (
                <EmptyPets />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(me?.pets ?? []).map((p, i) => (
                    <motion.button key={p.id} onClick={() => { playTap(); setOpenPet(p.id); }}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.05, 0.3) }}
                      className="w-full rounded-2xl border border-line bg-surface-1 p-4 text-start transition hover:border-brand-400 hover:shadow-raised active:scale-[0.99]">
                      <PetCardBody pet={p} />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* تواصلٌ سريع — الهاتفُ يبقى القناة حين يقلق المالك */}
        {(clinicWa || clinicTel) && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {clinicWa && (
              <a href={`https://wa.me/${waNumber(clinicWa, "+964")}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-4 py-2.5 text-sm font-extrabold text-white transition active:scale-[0.98]">
                <MessageCircle size={16} /> {t("portal.whatsapp", "راسل العيادة")}
              </a>
            )}
            {clinicTel && (
              <a href={`tel:${clinicTel}`}
                className="flex items-center gap-2 rounded-2xl border border-line bg-surface-1 px-4 py-2.5 text-sm font-extrabold text-ink transition active:scale-[0.98]">
                <Phone size={16} /> {t("portal.call", "اتصال")}
              </a>
            )}
            <a href={`/s/${slug}`}
              className="flex items-center gap-2 rounded-2xl border border-line bg-surface-1 px-4 py-2.5 text-sm font-extrabold text-ink transition active:scale-[0.98]">
              <Store size={16} /> {t("portal.toStore", "المتجر")}
            </a>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-2xs text-ink-subtle">
          <PawPrint size={12} /> doctorVet
        </p>
      </main>
    </div>
  );
}

/* ══════════════════════════ الدخول ══════════════════════════ */

function LoginCard(props: {
  step: Step; phone: string; code: string; busy: boolean; err: string | null; testCode: string | null;
  onPhone: (v: string) => void; onCode: (v: string) => void;
  onSend: () => void; onVerify: () => void; onBack: () => void;
}) {
  const { t } = useTranslation();
  const { step, phone, code, busy, err, testCode } = props;

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line bg-surface-1 p-5 shadow-soft">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h2 className="font-display text-base font-extrabold text-ink">{t("portal.signIn", "شوف حيواناتك")}</h2>
          <p className="text-2xs text-ink-subtle">{t("portal.signInSub", "برقم الهاتف اللي عند العيادة")}</p>
        </div>
      </div>

      {step === "phone" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-muted">{t("portal.phoneLabel", "رقم الهاتف")}</span>
            <input
              value={phone} onChange={(e) => props.onPhone(e.target.value)}
              inputMode="tel" autoComplete="tel" dir="ltr" placeholder="0770 123 4567"
              onKeyDown={(e) => { if (e.key === "Enter") props.onSend(); }}
              className="w-full rounded-2xl border border-line bg-surface py-3 px-4 text-center text-base font-bold tracking-wide text-ink outline-none transition focus:border-brand-400"
            />
          </label>
          <p className="text-2xs leading-relaxed text-ink-subtle">
            {t("portal.phoneHint", "راح يوصلك رمز تحقّق. ما نعرض شي إلا إذا الرقم مسجّل عند العيادة.")}
          </p>
          {err && <ErrNote>{err}</ErrNote>}
          <button onClick={props.onSend} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60">
            {busy ? <Loader2 className="animate-spin" size={16} /> : null}
            {t("portal.sendCode", "أرسل الرمز")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-ink-muted">
            {t("portal.codeSent", { phone, defaultValue: "دزّينا رمز إلى {{phone}}" })}
          </p>
          {testCode && (
            <div className="rounded-2xl border border-warn-200 bg-warn-50 px-3 py-2.5 dark:border-warn-500/30 dark:bg-warn-500/10">
              <p className="text-2xs font-bold text-warn-700 dark:text-warn-200">
                {t("portal.testMode", "وضع التجربة — ما ينرسل واتساب بعد. الرمز:")}
              </p>
              <p className="mt-0.5 text-center font-mono text-2xl font-extrabold tracking-[0.3em] text-warn-700 dark:text-warn-200">
                {testCode}
              </p>
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-muted">{t("portal.codeLabel", "رمز التحقّق")}</span>
            <input
              value={code} onChange={(e) => props.onCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" autoComplete="one-time-code" dir="ltr" placeholder="——————"
              onKeyDown={(e) => { if (e.key === "Enter") props.onVerify(); }}
              className="w-full rounded-2xl border border-line bg-surface py-3 px-4 text-center font-mono text-2xl font-extrabold tracking-[0.4em] text-ink outline-none transition focus:border-brand-400"
            />
          </label>
          {err && <ErrNote>{err}</ErrNote>}
          <button onClick={props.onVerify} disabled={busy || code.length < 4}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-60">
            {busy ? <Loader2 className="animate-spin" size={16} /> : null}
            {t("portal.verify", "تأكيد ودخول")}
          </button>
          <button onClick={props.onBack} className="flex w-full items-center justify-center gap-1.5 text-xs font-bold text-brand-600">
            <ArrowRight size={13} className="rotate-180" /> {t("portal.changePhone", "تغيير الرقم")}
          </button>
        </div>
      )}
    </div>
  );
}

function ErrNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-xl bg-danger-50 px-3 py-2 text-xs font-semibold leading-relaxed text-danger-700 dark:bg-danger-500/10 dark:text-danger-200">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {children}
    </p>
  );
}

function EmptyPets() {
  const { t } = useTranslation();
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-line bg-surface-1 py-14 text-center">
      <PawPrint size={30} className="opacity-40" />
      <p className="text-sm font-bold text-ink">{t("portal.noPets", "ما لكينا حيوانات على هذا الرقم")}</p>
      <p className="max-w-xs text-xs leading-relaxed text-ink-subtle">
        {t("portal.noPetsHint", "يمكن العيادة سجّلت رقم ثاني. راسلهم وخلّهم يحدّثون رقمك.")}
      </p>
    </div>
  );
}

/* ══════════════════════════ بطاقةُ الحيوان ══════════════════════════ */

/** حالةُ الحيوان بجملةٍ واحدة — أوّلُ ما تبحث عنه عينُ المالك. */
function useStatus(pet: { admission: PortalPetCard["admission"]; journey: PortalPetCard["journey"] }) {
  const { t } = useTranslation();
  return useMemo(() => {
    const j = pet.journey;
    if (j) {
      const def = journeyStageDef(j.kind, j.stage);
      if (def) return { label: def.label, emoji: def.emoji, tone: "brand" as const, Icon: Stethoscope };
    }
    const kind = pet.admission?.kind;
    if (kind === "boarding") return { label: t("portal.st.boarding", "بالمبيت"), emoji: "🛏️", tone: "sky" as const, Icon: BedDouble };
    if (kind === "treatment") return { label: t("portal.st.treatment", "تحت العلاج"), emoji: "💊", tone: "warn" as const, Icon: Pill };
    if (kind === "treatment_boarding") return { label: t("portal.st.both", "علاج ومبيت"), emoji: "🏥", tone: "warn" as const, Icon: Stethoscope };
    return { label: t("portal.st.home", "بالبيت"), emoji: "🏠", tone: "success" as const, Icon: Home };
  }, [pet.admission, pet.journey, t]);
}

const TONE: Record<string, string> = {
  brand:   "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
  warn:    "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200",
  sky:     "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
  success: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200",
};

function PetCardBody({ pet }: { pet: PortalPetCard }) {
  const { t } = useTranslation();
  const st = useStatus(pet);
  const done = pet.today?.given ?? 0;
  const total = pet.today?.total ?? 0;
  const vaxDays = daysFromToday(pet.next_vaccine?.due_date);

  return (
    <>
      <div className="flex items-center gap-3">
        {pet.photo_url
          ? <img src={pet.photo_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
          : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-2 text-3xl">{speciesEmoji(pet.species)}</span>}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-extrabold text-ink">{pet.name}</p>
          {pet.breed && <p className="truncate text-2xs text-ink-subtle">{pet.breed}</p>}
          <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold", TONE[st.tone])}>
            {st.emoji} {st.label}
          </span>
        </div>
      </div>

      {/* جرعاتُ اليوم — الشريطُ يقول القصّة قبل أن تُقرأ الأرقام */}
      {total > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-2xs font-bold">
            <span className="flex items-center gap-1 text-ink-muted"><Pill size={12} /> {t("portal.todayDoses", "جرعات اليوم")}</span>
            {/* dir=ltr: «٢ / ٤» كسرٌ لا جملة — بالسياق العربي ينقلب فيُقرأ
                «٤ / ٢»، أي عكسُ المعنى تماماً على شاشةِ مالكٍ يتابع جرعات. */}
            <span dir="ltr" className={cn(done >= total ? "text-success-600" : "text-warn-600")}>
              {formatNum(done)} / {formatNum(total)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={cn("h-full rounded-full transition-all", done >= total ? "bg-success-500" : "bg-warn-500")}
              style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {/* اللقاحُ القادم */}
      {pet.next_vaccine && vaxDays !== null && (
        <p className={cn("mt-2 flex items-center gap-1.5 text-2xs font-bold",
          vaxDays < 0 ? "text-danger-600" : vaxDays <= 30 ? "text-warn-600" : "text-ink-subtle")}>
          <Syringe size={12} />
          {vaxDays < 0
            ? t("portal.vaxOverdue", { name: pet.next_vaccine.name, defaultValue: "{{name}} متأخّر" })
            : vaxDays === 0
              ? t("portal.vaxToday", { name: pet.next_vaccine.name, defaultValue: "{{name}} اليوم" })
              : t("portal.vaxIn", { name: pet.next_vaccine.name, n: vaxDays, defaultValue: "{{name}} بعد {{n}} يوم" })}
        </p>
      )}
    </>
  );
}

/* ══════════════════════════ صفحةُ الحيوان ══════════════════════════ */

function PetDetail({ token, petId, showMedical, onBack }: {
  token: string; petId: string; showMedical: boolean; onBack: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<PortalPetDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // الحالةُ تُحسب **قبل** أي رجوعٍ مبكّر: نداءُ hook بعد `if (…) return` يكسر
  // ترتيبَ الخطّافات بين رسمتين ويرمي React. والقيمُ الفارغة تعطي «بالبيت»
  // وهي لا تُعرض أصلاً وقتها.
  const st = useStatus({ admission: data?.admission ?? null, journey: data?.journey ?? null });

  const load = useCallback(async () => {
    setState("loading");
    try {
      const d = await repo.portalPet(token, petId);
      if (!d) { setState("error"); return; }
      setData(d); setState("ready");
    } catch { setState("error"); }
  }, [token, petId]);

  useEffect(() => { void load(); }, [load]);

  if (state === "loading") {
    return <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-brand-600" size={26} /></div>;
  }
  if (state === "error" || !data) {
    return (
      <div className="grid place-items-center gap-3 py-16 text-center">
        <AlertTriangle size={26} className="text-warn-500" />
        <p className="text-sm font-bold text-ink">{t("portal.loadFail", "ما كدرنا نجيب الملف")}</p>
        <button onClick={load} className="flex items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-4 py-2 text-xs font-extrabold text-ink">
          <RefreshCw size={14} /> {t("portal.retry", "حاول مرّة ثانية")}
        </button>
        <button onClick={onBack} className="text-xs font-bold text-brand-600">{t("portal.back", "رجوع")}</button>
      </div>
    );
  }

  const p = data.pet;
  const given = data.today.filter((d) => d.given).length;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-extrabold text-brand-600">
        <ChevronLeft size={15} className="rotate-180" /> {t("portal.back", "رجوع")}
      </button>

      {/* ترويسةُ الحيوان */}
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface-1 p-4">
        {p.photo_url
          ? <img src={p.photo_url} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          : <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-surface-2 text-4xl">{speciesEmoji(p.species)}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-extrabold text-ink">{p.name}</h2>
          {p.breed && <p className="truncate text-xs text-ink-subtle">{p.breed}</p>}
          <span className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-bold", TONE[st.tone])}>
            {st.emoji} {st.label}
          </span>
        </div>
      </div>

      {/* جرعاتُ اليوم */}
      <Section icon={<Pill size={15} />} title={t("portal.todayDoses", "جرعات اليوم")}
        badge={data.today.length ? `${formatNum(given)}/${formatNum(data.today.length)}` : undefined}>
        {data.today.length === 0 ? (
          <Muted>{t("portal.noDoses", "ماكو جرعات مجدولة اليوم")}</Muted>
        ) : (
          <ul className="space-y-1.5">
            {data.today.map((d) => (
              <li key={d.id} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
                {d.given
                  ? <CheckCircle2 size={16} className="shrink-0 text-success-500" />
                  : <Clock size={16} className="shrink-0 text-warn-500" />}
                <span className={cn("flex-1 text-sm font-semibold", d.given ? "text-ink-subtle line-through" : "text-ink")}>
                  {d.label ?? (showMedical
                    ? t("portal.doseUnnamed", "جرعة")
                    : t("portal.doseHidden", "جرعة علاج"))}
                </span>
                {d.time && <span dir="ltr" className="font-mono text-2xs font-bold text-ink-subtle">{d.time}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* اللقاحات */}
      <Section icon={<Syringe size={15} />} title={t("portal.vaccines", "اللقاحات")}>
        {data.vaccines.length === 0 ? (
          <Muted>{t("portal.noVaccines", "ماكو لقاحات مسجّلة")}</Muted>
        ) : (
          <ul className="space-y-1.5">
            {data.vaccines.slice(0, 12).map((v) => {
              const u = vaxUrgency(v.due_date);
              const doneVax = !!v.administered_at;
              return (
                <li key={v.id} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full",
                    doneVax ? "bg-success-500" : u === "overdue" ? "bg-danger-500" : u === "today" || u === "soon" ? "bg-warn-500" : "bg-line-strong")} />
                  <span className="flex-1 truncate text-sm font-semibold text-ink">{v.name}</span>
                  <span className="text-2xs font-bold text-ink-subtle">
                    {doneVax
                      ? t("portal.vaxDone", "تمّ")
                      : u === "overdue" ? t("portal.vaxLate", "متأخّر")
                      : u === "today" ? t("portal.vaxNow", "اليوم")
                      : v.due_date ?? ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* الوزن — والشارةُ من آخر قياسٍ مسجَّل لا من حقل الوزن الحالي: الحقلُ قد
          يتخلّف عن السجلّات، فتقول الشارةُ رقماً والمنحنى تحتها رقماً آخر —
          وهذا بالضبط ما ظهر بالفحص. آخرُ نقطةٍ بالمنحنى هي الحقيقة المعروضة. */}
      {data.weights.length > 0 && (
        <Section icon={<Scale size={15} />} title={t("portal.weight", "الوزن")}
          badge={fmtKg(data.weights[data.weights.length - 1].kg)}>
          <WeightSpark points={data.weights} />
        </Section>
      )}

      {/* المواعيد */}
      <Section icon={<CalendarDays size={15} />} title={t("portal.appointments", "المواعيد القادمة")}>
        {data.appointments.length === 0 ? (
          <Muted>{t("portal.noAppointments", "ماكو مواعيد مجدولة")}</Muted>
        ) : (
          <ul className="space-y-1.5">
            {data.appointments.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                <span className="text-sm font-semibold text-ink">
                  {new Date(a.at).toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })}
                </span>
                <span dir="ltr" className="font-mono text-2xs font-bold text-ink-subtle">
                  {new Date(a.at).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ icon, title, badge, children }: {
  icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-brand-600">{icon}</span>
        <h3 className="flex-1 font-display text-sm font-extrabold text-ink">{title}</h3>
        {/* الشارةُ رقميّة (٢/٤ أو ١٢٫٤ كغم) — تُترك LTR لنفس سبب عدّاد الجرعات */}
        {badge && <span dir="ltr" className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-muted">{badge}</span>}
      </div>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-center text-xs text-ink-subtle">{children}</p>;
}

/** منحنى وزنٍ صغير بلا مكتبة — نقاطٌ قليلة لا تستاهل حزمة رسوم. */
function WeightSpark({ points }: { points: { kg: number; at: string }[] }) {
  const vals = points.map((p) => p.kg);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 280, H = 56;
  const d = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
    const y = H - ((p.kg - min) / span) * (H - 8) - 4;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last.kg - first.kg;
  return (
    <div>
      {/* إحداثيّاتُ SVG مطلقة فلا يقلبها اتجاهُ الصفحة: الأقدمُ يسار والأحدثُ
          يمين بالعربية كما بالإنكليزية — وهذا الصحيح لمحورٍ زمنيّ. */}
      <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" className="text-brand-500" />
      </svg>
      <p className="mt-1 text-center text-2xs font-bold text-ink-subtle">
        {fmtKg(first.kg)} → {fmtKg(last.kg)}
        {Math.abs(delta) >= 0.05 && (
          <span className={cn("ms-1.5", delta > 0 ? "text-success-600" : "text-warn-600")}>
            ({delta > 0 ? "+" : "−"}{fmtKg(Math.abs(delta))})
          </span>
        )}
      </p>
    </div>
  );
}

export default OwnerPortal;
