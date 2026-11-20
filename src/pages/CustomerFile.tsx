/* ============================================================================
 * ملفُّ الزبون (0270) — «سجلّ حالة» لزبونٍ بلا حيوان: معلوماتُه، حيواناتُه، فواتيرُه، ودينُه، ومنه «بيع» و«إضافة حيوان».
 *
 * الهويّةُ مفتاحُ الزبون (`cust_key`): الرقمُ الوطنيّ بدولة العيادة، وإلا الاسمُ المطويّ — العنوان `/customer/<key>`.
 * فالملفُّ يُفتح لأيّ زبونٍ كُتب اسمُه أو رقمُه (تلقائيّ)، و`/customer/new` يسجّل زبوناً ما اشترى بعد (قرارُ المالك ١٤/١١).
 * الحقلُ الذي هو الهويّة (الرقم، أو الاسمُ لزبونٍ بلا رقم) لا يُعدَّل هنا: تغييرُه زبونٌ ثانٍ وفواتيرُه تبقى بالأوّل — والخادمُ
 * يرفضه أيضاً (customer_key_frozen).
 *
 * لا قائمةَ جزئية: فشلُ أيّ قراءةٍ يُقال بـ«أعد المحاولة» (قائمةٌ ناقصة أخطرُ من خطأ ظاهر). والنصوصُ بنطاقٍ مملوك `cfile`
 * (النصفُ البارد على سقفه) — تصل مع الصفحة بـpage(…, ["cfile"]).
 * ========================================================================= */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowRight, UserRound, Phone, MapPin, NotebookPen, Pencil, ShoppingCart, PawPrint, Plus, HandCoins,
  Receipt, RotateCcw, Loader2, AlertTriangle, CalendarClock, UserPlus,
} from "lucide-react";
import type { CustomerHit, CustomerProfile, Invoice } from "@/types";
import { Button, useToast } from "@/components/ui";
import { cn, formatDate, money } from "@/lib/utils";
import { dueOf } from "@/lib/debt";
import { usdDueCentsOf, usdText } from "@/lib/usdMath";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess } from "@/lib/sounds";
import { addProfile, directoryHit, getProfile, isCfileAbsent, keyInvoices, keyOf, updateProfile, type ProfileInput } from "@/lib/customerFileApi";
import { page } from "@/lib/lazyPage";
import { LoadBoundary } from "@/components/LoadBoundary";

/* «إضافة دين قديم» (0271) على هذا الزبون — قطعةٌ كسولة بنطاقها odebt، للمدير وحده (تُخفي نفسَها لغيره). */
const loadOldDebtBtn = () => page(() => import("@/components/retail/OldDebt").then((m) => ({ default: m.OldDebtButton })), ["odebt"]);
let OldDebtBtnLazy = loadOldDebtBtn();

const enc = (key: string) => `/customer/${encodeURIComponent(key)}`;

/** رسالةُ خطأ الملفّ: رموزُ الخادم (وصيغتُها بالتجريبيّ بلا hint) بجملها، وغيرُها كما يشرحها describeDbError. */
function errText(e: unknown, t: TFunction): string {
  const msg = String((e as { message?: string } | null)?.message ?? "");
  if (isCfileAbsent(e)) return t("cfile.absent");
  if (msg.includes("customer_key_frozen")) return t("cfile.keyFrozen");
  if (msg.includes("customer_no_identity")) return t("cfile.noIdentity");
  if (msg === "stale" || (e as { code?: string } | null)?.code === "stale") return t("cfile.stale");
  if (msg === "cfile_short") return t("cfile.short");
  return describeDbError(e, t);
}

export function CustomerFile() {
  // useParams يرجع المقطعَ مفكوكاً أصلاً — فكٌّ ثانٍ يرمي على «%» بالاسم أو يفتح مفتاحاً غيرَه.
  const { key: raw } = useParams();
  const key = raw ?? "";
  if (key === "new") return <NewCustomer />;
  return <FileView key={key} cKey={key} />;
}

/* ─────────────────────────────── زبونٌ جديد ─────────────────────────────── */
function NewCustomer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<ProfileInput>({ name: "", phone: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = f.name.trim() !== "" || f.phone.trim() !== "";
  const save = async () => {
    if (busy || !ok) return;
    setBusy(true); setErr(null);
    try {
      // الخادمُ يقرّر: ملفٌّ قائم أو زبونٌ له فواتيرُ/حيوان ⇒ لا كتابة (اسمٌ آخر كان سيغلب الدليل) — يُفتح ملفُّه بمفتاح الخادم.
      const r = await addProfile(f, null);
      if (r.status === "created") {
        playSuccess();
        toast.success(t("cfile.created"));
      } else {
        toast.warn(t(r.status === "known" ? "cfile.known" : "cfile.exists"));
      }
      navigate(enc(r.key), { replace: true });
    } catch (e) {
      setErr(errText(e, t));
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-5" data-cfile-new>
      <BackBar />
      <div className="card space-y-4 p-5">
        <h1 className="flex items-center gap-2 text-lg font-black text-ink"><UserPlus size={20} className="text-brand-600" /> {t("cfile.newTitle")}</h1>
        <p className="text-sm text-ink-muted">{t("cfile.newHint")}</p>
        <ProfileFields value={f} onChange={setF} lockName={false} lockPhone={false} />
        {err && <p role="alert" className="text-sm font-bold text-danger-600" data-cfile-err>{err}</p>}
        <Button className="w-full" size="lg" loading={busy} disabled={!ok} onClick={save} data-cfile-save>{t("cfile.create")}</Button>
      </div>
    </div>
  );
}

function BackBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => { playTap(); navigate(-1); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-ink">
      <ArrowRight size={16} /> {t("cfile.back")}
    </button>
  );
}

function ProfileFields({ value, onChange, lockName, lockPhone }: { value: ProfileInput; onChange: (v: ProfileInput) => void; lockName: boolean; lockPhone: boolean }) {
  const { t } = useTranslation();
  const set = (k: keyof ProfileInput) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-muted">{t("cfile.name")}</span>
        <input className="input w-full" value={value.name} onChange={set("name")} readOnly={lockName} maxLength={80} data-cfile-name />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-ink-muted">{t("cfile.phone")}</span>
        <input className="input w-full" dir="ltr" inputMode="tel" value={value.phone} onChange={set("phone")} readOnly={lockPhone} maxLength={40} data-cfile-phone />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-ink-muted">{t("cfile.address")}</span>
        <input className="input w-full" value={value.address} onChange={set("address")} maxLength={200} data-cfile-address />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-bold text-ink-muted">{t("cfile.notes")}</span>
        <textarea className="input min-h-[84px] w-full resize-y" value={value.notes} onChange={set("notes")} maxLength={2000} data-cfile-notes />
      </label>
      {(lockName || lockPhone) && <p className="text-2xs text-ink-subtle sm:col-span-2">{t("cfile.identityHint")}</p>}
    </div>
  );
}

/* ─────────────────────────────── الملفّ ─────────────────────────────── */
type Loaded = { profile: CustomerProfile | null; hit: CustomerHit | null; invoices: Invoice[] };

function FileView({ cKey }: { cKey: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileInput>({ name: "", phone: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [, setLazyTick] = useState(0);

  useEffect(() => {
    let live = true;
    setErr(null);
    Promise.all([getProfile(cKey), directoryHit(cKey), keyInvoices(cKey)])
      .then(([profile, hit, invoices]) => { if (live) setData({ profile, hit, invoices }); })
      .catch((e) => { if (live) setErr(errText(e, t)); });
    return () => { live = false; };
  }, [cKey, tick, t]);

  const phoneKeyed = cKey.startsWith("p:");
  // الاسمُ والرقمُ من مصدرٍ حقيقيّ وحده (الملفّ، الدليل، آخرُ فاتورة) — المفتاحُ مطبَّعٌ (بلا مسافات، همزةٌ مطويّة) فلا يُكتب
  // به بيعٌ ولا حيوانٌ ولا ملفّ.
  const lastInv = data?.invoices[0] ?? null;
  const name = data?.profile?.name ?? data?.hit?.name ?? (lastInv?.customer_name?.trim() || null);
  const phone = data?.profile?.phone ?? data?.hit?.phone ?? (lastInv?.customer_phone?.trim() || null);
  const found = !!data && (!!data.profile || !!data.hit || data.invoices.length > 0);

  const stats = useMemo(() => {
    const inv = data?.invoices ?? [];
    let due = 0, usdCents = 0, buys = 0;
    for (const i of inv) {
      if ((i.status ?? "paid") === "refunded") continue;
      if ((i.sale_kind ?? "retail") !== "opening") buys++;
      if (i.currency === "USD") usdCents += Number(usdDueCentsOf(i));
      else due += dueOf(i);
    }
    return { due, usdCents, buys, last: inv.find((i) => (i.sale_kind ?? "retail") !== "opening")?.created_at ?? null };
  }, [data]);

  const startEdit = useCallback(() => {
    playTap();
    setDraft({ name: name ?? "", phone: phone ?? "", address: data?.profile?.address ?? "", notes: data?.profile?.notes ?? "" });
    setSaveErr(null);
    setEditing(true);
  }, [name, phone, data]);

  const save = async () => {
    if (busy) return;
    // الهويّةُ نفسُها: حقلٌ يغيّر المفتاحَ زبونٌ ثانٍ — يُقال قبل أن يُرسل (والخادمُ يرفضه أيضاً).
    if (keyOf(draft.phone, draft.name) !== cKey) { setSaveErr(t("cfile.keyFrozen")); return; }
    setBusy(true); setSaveErr(null);
    try {
      const p = data?.profile ?? null;
      let saved: CustomerProfile;
      if (p) {
        saved = await updateProfile(draft, { id: p.id, updated_at: p.updated_at });
      } else {
        // «أضف معلومات» لزبونٍ معروف: الإدراجُ لمفتاح هذا الملفّ نفسِه (forKey).
        const r = await addProfile(draft, cKey);
        if (r.status === "created") saved = r.profile;
        else {
          // ملفٌّ انكتب من جهازٍ ثانٍ بعد ما انفتحت الصفحة: لا يُداس — «تغيّر، حدّث» بدل كتابةٍ فوقه.
          throw Object.assign(new Error("stale"), { code: "stale" });
        }
      }
      setData((d) => (d ? { ...d, profile: saved } : d));
      playSuccess();
      toast.success(t("cfile.saved"));
      setEditing(false);
    } catch (e) {
      setSaveErr(errText(e, t));
    } finally { setBusy(false); }
  };

  const sell = () => {
    playTap();
    const q = new URLSearchParams();
    if (name) q.set("customer", name);
    if (phone) q.set("phone", phone);
    navigate(`/retail?${q.toString()}`);
  };
  const addPet = () => {
    playTap();
    navigate("/new-case", { state: { ownerPrefill: { name: name ?? "", phone: phone ?? "", email: "", governorate: "", area: data?.profile?.address ?? "" } } });
  };

  if (err) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <BackBar />
        <div role="alert" className="card flex flex-wrap items-center gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/30 dark:bg-danger-500/10" data-cfile-loaderr>
          <AlertTriangle size={18} className="shrink-0 text-danger-600" />
          <span className="min-w-0 flex-1 text-sm font-bold text-danger-700 dark:text-danger-300">{err}</span>
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("cfile.retry")}</Button>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> {t("cfile.loading")}</div>;
  }

  if (!found) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <BackBar />
        <div className="card space-y-3 p-6 text-center" data-cfile-notfound>
          <p className="text-sm font-bold text-ink">{t("cfile.notFound")}</p>
          <Button leftIcon={<UserPlus size={16} />} onClick={() => { playTap(); navigate("/customer/new"); }}>{t("cfile.newTitle")}</Button>
        </div>
      </div>
    );
  }
  const pets = data.hit?.pets ?? [];
  const invoices = showAll ? data.invoices : data.invoices.slice(0, 30);
  const lang = i18n.language;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5" data-cfile={cKey}>
      <BackBar />

      {/* الرأس: الاسمُ والرقمُ والعنوانُ والملاحظات */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><UserRound size={24} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black text-ink" data-cfile-title>{name || phone || t("cfile.noName")}</h1>
            {phone && <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-ink-muted"><Phone size={14} /> <span dir="ltr">{phone}</span></p>}
            {data.profile?.address && <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted"><MapPin size={14} /> {data.profile.address}</p>}
          </div>
          {!editing && (
            <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} onClick={startEdit} data-cfile-edit>
              {data.profile ? t("cfile.edit") : t("cfile.addInfo")}
            </Button>
          )}
        </div>
        {data.profile?.notes && !editing && (
          <p className="mt-3 flex items-start gap-1.5 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm text-ink [overflow-wrap:anywhere]"><NotebookPen size={14} className="mt-0.5 shrink-0 text-ink-subtle" /> {data.profile.notes}</p>
        )}
        {editing && (
          <div className="mt-4 space-y-3 border-t border-line pt-4" data-cfile-form>
            <ProfileFields value={draft} onChange={setDraft} lockName={!phoneKeyed} lockPhone />
            {saveErr && <p role="alert" className="text-sm font-bold text-danger-600" data-cfile-err>{saveErr}</p>}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={save} data-cfile-save>{t("cfile.save")}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { playTap(); setEditing(false); }}>{t("cfile.cancel")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* الأرقام والأزرار */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={<Receipt size={16} />} label={t("cfile.purchases")} value={String(stats.buys)} />
        <Stat icon={<CalendarClock size={16} />} label={t("cfile.lastVisit")} value={stats.last ? formatDate(stats.last, lang, true) : "—"} />
        <Stat icon={<HandCoins size={16} />} label={t("cfile.debt")} tone={stats.due > 0 || stats.usdCents > 0 ? "warn" : undefined}
          value={stats.due > 0 || stats.usdCents === 0 ? money(stats.due) : ""} extra={stats.usdCents > 0 ? usdText(stats.usdCents) : null} data-cfile-debt />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button leftIcon={<ShoppingCart size={16} />} onClick={sell} data-cfile-sell>{t("cfile.sell")}</Button>
        <Button variant="secondary" leftIcon={<Plus size={16} />} onClick={addPet} data-cfile-addpet>{t("cfile.addPet")}</Button>
        {(name || phone) && (
          <LoadBoundary scope="odebt" onRetry={() => { OldDebtBtnLazy = loadOldDebtBtn(); setLazyTick((n) => n + 1); }}>
            <Suspense fallback={null}><OldDebtBtnLazy prefill={{ name, phone }} onAdded={() => setTick((n) => n + 1)} /></Suspense>
          </LoadBoundary>
        )}
      </div>

      {/* الحيوانات */}
      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink"><PawPrint size={16} className="text-brand-600" /> {t("cfile.pets")}</h2>
        {pets.length === 0 ? (
          <p className="text-sm text-ink-subtle" data-cfile-nopets>{t("cfile.noPets")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pets.map((p) => (
              <button key={p.id} type="button" onClick={() => { playTap(); navigate(`/pet/${p.id}`); }} data-cfile-pet={p.id}
                className={cn("inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 py-2 text-sm font-bold text-ink transition hover:border-brand-300",
                  p.deceased && "opacity-60")}>
                <PawPrint size={14} className="text-brand-600" /> {p.name || "—"}
                {p.deceased && <span className="chip bg-surface-2 text-2xs text-ink-muted">{t("cfile.deceased")}</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* الفواتير */}
      <section className="card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink"><Receipt size={16} className="text-brand-600" /> {t("cfile.invoices", { n: data.invoices.length })}</h2>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-ink-subtle" data-cfile-noinv>{t("cfile.noInvoices")}</p>
        ) : (
          <div className="divide-y divide-line">
            {invoices.map((i) => <InvoiceRow key={i.id} inv={i} lang={lang} />)}
          </div>
        )}
        {!showAll && data.invoices.length > 30 && (
          <button type="button" className="mt-3 text-sm font-bold text-brand-600 hover:text-brand-700" onClick={() => { playTap(); setShowAll(true); }}>
            {t("cfile.showAll", { n: data.invoices.length })}
          </button>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, extra, tone, ...rest }: { icon: React.ReactNode; label: string; value: string; extra?: string | null; tone?: "warn"; [k: `data-${string}`]: unknown }) {
  return (
    <div className={cn("card p-3", tone === "warn" && "border-warn-300 bg-warn-50/60 dark:bg-warn-500/10")} {...rest}>
      <p className="flex items-center gap-1.5 text-2xs font-bold text-ink-muted">{icon} {label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-ink">{value}{extra && <span className="block text-sm font-black" dir="ltr">{extra}</span>}</p>
    </div>
  );
}

function InvoiceRow({ inv, lang }: { inv: Invoice; lang: string }) {
  const { t } = useTranslation();
  const refunded = (inv.status ?? "paid") === "refunded";
  const usd = inv.currency === "USD";
  const due = usd ? Number(usdDueCentsOf(inv)) : dueOf(inv);
  return (
    <div className="flex flex-wrap items-center gap-2 py-2.5 text-sm" data-cfile-inv={inv.id}>
      <span className="min-w-[96px] text-xs font-bold text-ink-subtle">{formatDate(inv.created_at, lang, true)}</span>
      <span className="min-w-0 flex-1 truncate font-bold text-ink">
        {usd ? <span dir="ltr">{usdText(Math.round((inv.total_usd ?? 0) * 100))}</span> : money(inv.total)}
        {inv.pet_name && <span className="ms-2 text-xs font-semibold text-ink-muted">· {inv.pet_name}</span>}
        {/* الدينُ القديم (0271) ليس شراءً — يُقال بما هو. */}
        {inv.sale_kind === "opening" && <span className="ms-2 text-xs font-semibold text-violet-700 dark:text-violet-300" data-cfile-old>· {t("cfile.oldTag", { what: inv.opening_what ?? "—" })}</span>}
      </span>
      {refunded ? (
        <span className="chip bg-surface-2 text-2xs text-ink-muted">{t("cfile.refunded")}</span>
      ) : due > 0 ? (
        <span className="chip bg-warn-50 text-2xs text-warn-700 dark:bg-warn-500/15 dark:text-warn-200" data-cfile-due>
          {t("cfile.due", { amount: usd ? usdText(due) : money(due) })}
        </span>
      ) : (
        <span className="chip bg-success-50 text-2xs text-success-700 dark:bg-success-500/15 dark:text-success-200">{t("cfile.paid")}</span>
      )}
    </div>
  );
}
