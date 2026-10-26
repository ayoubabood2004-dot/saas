import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { loadDB } from "@/lib/demoStore";
import { listStaff } from "@/lib/staff";
import { getClinicName } from "@/lib/settings";
import { getActiveClinicId } from "@/lib/clinics";
import { expectedServerClinic } from "@/lib/workspaceClinic";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * «جهّز عيادتك» — دليلُ اليوم الأوّل (F16، ٢٥/١٠).
 *
 * عيادةٌ جديدة كانت تهبط على لوحةٍ فارغة تقول «لا مرضى بعد» و«المخزون بخير» — والمخزنُ
 * صفر — بلا طريقٍ إلى «أضف منتجاتك، خدماتك، موظفيك، أوّل بيعة». فتجرّب يومين وتغادر
 * قبل أن ترى ما اشترت. هنا ستُّ خطوات، كلٌّ منها يُحسب **من الأرقام الحقيقية** (لا من
 * زرّ «تمّ»)، فتنطفئ وحدَها حين تُنجَز، والبطاقةُ تختفي بإتمامها أو بإخفاء المدير. وتظهر بالتجربة
 * وحدها (الشاشةُ تشرطها) — عيادةٌ قائمة بلا موظّفين ليست عيادةً «تُجهَّز». ولا خطوةَ للخدمات: تُبذر
 * خدماتٌ جاهزة لكلّ عيادةٍ جديدة، فخطوتُها كانت تنطفئ وحدَها بلا فعل.
 *
 * وفشلُ العدّ يُخفي البطاقة: قائمةٌ تقول «لم تُضف منتجات» عن عيادةٍ فيها منتجات أسوأ من
 * لا قائمة (قائمةٌ ناقصة أخطرُ من خطأ ظاهر).
 * ==========================================================================*/

type Counts = { products: number; pets: number; invoices: number; staff: number };

async function headCount(table: "products" | "pets" | "invoices", clinic: string): Promise<number> {
  // بعيادة الخادم صراحةً: سياسةُ الحيوانات تُري العيادةَ حيواناتِ أصحابها المسجّلين بالمنصّة أيضاً،
  // فعدٌّ بلا شرطٍ كان يعلّم «سجّل أوّل حالة» لعيادةٍ جديدةٍ بلا حالة (تدقيقٌ عدائيّ).
  let q = supabase!.from(table).select("id", { count: "exact", head: true }).eq("clinic_id", clinic);
  // منتجاتُ حقول الدواجن ليست مخزنَ العيادة (0191) — مرآةُ listProducts.
  if (table === "products") q = q.is("farm_id", null);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function loadCounts(): Promise<Counts> {
  const staff = (await listStaff()).length;
  if (isSupabaseConfigured && supabase) {
    const clinic = await expectedServerClinic();
    if (!clinic || clinic === "default") throw new Error("clinic_unknown");
    const [products, pets, invoices] = await Promise.all([headCount("products", clinic), headCount("pets", clinic), headCount("invoices", clinic)]);
    return { products, pets, invoices, staff };
  }
  const db = loadDB();
  return { products: (db.products ?? []).length, pets: (db.pets ?? []).length, invoices: (db.invoices ?? []).length, staff };
}

const hiddenKey = () => `vp_setup_hidden_${getActiveClinicId()}`;

export function SetupChecklist({ title }: { title: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(hiddenKey()) === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    loadCounts().then((c) => { if (alive) setCounts(c); }).catch(() => { /* لا بطاقةَ عن عدٍّ فشل */ });
    return () => { alive = false; };
  }, [hidden]);

  if (hidden || !counts) return null;

  const steps = [
    { key: "products", done: counts.products > 0, to: "/inventory" },
    { key: "pet", done: counts.pets > 0, to: "/new-case" },
    { key: "sale", done: counts.invoices > 0, to: "/retail" },
    { key: "staff", done: counts.staff > 0, to: "/staff" },
    { key: "identity", done: getClinicName().length > 0, to: "/settings" },
  ] as const;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);
  const Go = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;

  const hide = () => {
    playTap();
    try { localStorage.setItem(hiddenKey(), "1"); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <section aria-labelledby="setup-title" className="mt-6 rounded-3xl border border-brand-200/60 bg-surface-1 p-5 shadow-soft dark:border-brand-500/25">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="setup-title" className="font-display text-lg font-extrabold text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{t("onb.sub")}</p>
        </div>
        <button type="button" onClick={hide} aria-label={t("onb.hide")} className="rounded-full p-1.5 text-ink-subtle transition hover:bg-surface-2 hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={title} aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length}>
          <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-muted">{t("onb.progress", { done, total: steps.length })}</span>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={s.done}
              onClick={() => { playTap(); navigate(s.to); }}
              className="flex w-full items-start gap-3 rounded-2xl border border-line bg-surface p-3 text-start transition enabled:hover:border-brand-300 enabled:hover:bg-brand-50/40 disabled:opacity-70 dark:enabled:hover:bg-brand-500/10"
            >
              {s.done
                ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success-600" />
                : <Circle size={20} className="mt-0.5 shrink-0 text-ink-subtle" />}
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-semibold ${s.done ? "text-ink-muted line-through" : "text-ink"}`}>{t(`onb.${s.key}`)}</span>
                {!s.done && <span className="mt-0.5 block text-xs text-ink-subtle">{t(`onb.${s.key}Hint`)}</span>}
              </span>
              {!s.done && <Go size={16} className="mt-1 shrink-0 text-ink-subtle" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
