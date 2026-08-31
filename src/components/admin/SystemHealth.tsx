import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, RefreshCw, AlertTriangle } from "lucide-react";
import { repo } from "@/lib/repo";
import type { HealthMetric } from "@/types";
import { Skeleton } from "@/components/ui";
import { formatNum, formatDec, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/* ============================================================================
 * لوحةُ الأسقف — تُري ما لا يُرفَع.
 *
 * رفعنا حدود النظام كلَّها، لكن بقيت أسقفٌ ليست منّا: حجمُ القاعدة بالباقة،
 * وعددُ الاتصالات، ومهلةُ الاستعلام. هذه لا تُصلَّح بهجرة بل **تُرى قبل أن
 * تُبلَغ** — والفرق بين إزعاجِ يومٍ وكارثة أن تعرف وأنت على ٨٠٪.
 *
 * وأهمُّ صفٍّ هنا ليس رقماً كبيراً بل رقمٌ يجب أن يبقى **صفراً**: تأخُّرُ
 * الكنس. لو صعد فالجدولة ماتت، والقاعدة تكبر بهدوءٍ حتى تبلع الباقة.
 * ==========================================================================*/

/** حدُّ التحذير وحدُّ الخطر. الأول يعطيك شهراً، والثاني يعني «تصرّف اليوم». */
const WARN = 60;
const DANGER = 80;

/** رقمٌ بوحدته — البايت تُقرأ ميغا، والثواني ثواني، والباقي عدداً. */
function show(v: number, unit: string, t: ReturnType<typeof useTranslation>["t"]): string {
  if (unit === "bytes") {
    const mb = v / (1024 * 1024);
    return mb >= 1024
      ? t("health.gb", { n: formatDec(Math.round((mb / 1024) * 10) / 10), defaultValue: "{{n}} غيغا" })
      : t("health.mb", { n: formatNum(Math.round(mb)), defaultValue: "{{n}} ميغا" });
  }
  if (unit === "seconds") return t("health.sec", { n: formatDec(Math.round(v * 10) / 10), defaultValue: "{{n}} ثانية" });
  if (unit === "days") return t("health.days", { n: formatDec(Math.round(v * 10) / 10), defaultValue: "{{n}} يوم" });
  return formatNum(Math.round(v));
}

export function SystemHealth() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<HealthMetric[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setRows(await repo.systemHealth()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setRows([]); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // بالوضع التجريبي ماكو خادمٌ ولا باقة: القائمة فارغة، فتخفي اللوحة نفسها
  // بدل ما تعرض أصفاراً تبدو معلومة.
  if (!busy && !err && rows && rows.length === 0) return null;

  const hot = (rows ?? []).filter((r) => r.pct >= DANGER);

  return (
    <section className="mb-5 rounded-3xl border border-line bg-surface-1 p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15"><Gauge size={18} /></span>
          <h2 className="font-display font-bold text-ink">{t("health.title", "أسقف النظام")}</h2>
        </div>
        <button onClick={() => { playTap(); void load(); }} aria-label={t("health.refresh", "تحديث")}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2 hover:text-ink">
          <RefreshCw size={16} className={cn(busy && "animate-spin")} />
        </button>
      </div>

      {err ? (
        <p className="py-4 text-center text-sm text-ink-subtle">
          {t("health.unavailable", "ما وصلت أرقام الأسقف — تحتاج هجرة 0137 على قاعدة البيانات.")}
        </p>
      ) : rows === null ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-2xl" />)}</div>
      ) : (
        <>
          {hot.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-3 text-2xs leading-relaxed text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{t("health.hot", { n: formatNum(hot.length), defaultValue: "{{n}} سقف قارب الامتلاء — تصرّف قبل ما يوصل." })}</span>
            </div>
          )}
          <div className="space-y-2">
            {rows.map((r) => {
              const level = r.pct >= DANGER ? "danger" : r.pct >= WARN ? "warn" : "ok";
              return (
                <div key={r.metric} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-2xs font-semibold text-ink">
                      {t(`health.m.${r.metric}`, { defaultValue: r.metric })}
                    </span>
                    <span className={cn("shrink-0 text-2xs font-bold tabular-nums",
                      level === "danger" ? "text-danger-600 dark:text-danger-300"
                        : level === "warn" ? "text-warn-700 dark:text-warn-300" : "text-ink-muted")}>
                      {t("health.pct", { n: formatDec(r.pct), defaultValue: "{{n}}٪" })}
                    </span>
                  </div>
                  {/* الشريط يقول «وين احنا» بلمحة، والرقمان تحته يقولان بالضبط */}
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={cn("h-full rounded-full transition-all",
                        level === "danger" ? "bg-danger-500" : level === "warn" ? "bg-warn-500" : "bg-brand-500")}
                      style={{ width: `${Math.min(100, Math.max(1, r.pct))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] tabular-nums text-ink-subtle">
                    {show(r.value, r.unit, t)} / {show(r.ceiling, r.unit, t)}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
