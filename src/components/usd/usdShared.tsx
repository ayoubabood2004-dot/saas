/* ============================================================================
 * الدولار (0264) — رفيقُ Usd.tsx بنطاق `usd`: ما تتقاسمه شاشاتُ الدولار (الحالُ المخبَّأ، وكلامُ الرفض، وسؤالُ «السعر نفسه
 * اليوم؟»، وشارةُ USD). المالكُ لا يُستورد ثابتاً أبداً (i18n-owned-guard) — فالمشتركُ هنا، يستورده المالكُ ورفيقُه.
 * ========================================================================= */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertTriangle, DollarSign } from "lucide-react";
import { Button } from "@/components/ui";
import { playTap } from "@/lib/sounds";
import { cn, formatDate, formatNum, formatTime } from "@/lib/utils";
import { describeDbError, isNetworkError } from "@/lib/errors";
import { getActiveClinicId } from "@/lib/clinics";
import { usdApi, type UsdRate, type UsdState } from "@/lib/usdApi";
import { centsOf, per100Of, usdText } from "@/lib/usdMath";

/** مبلغُ دولارٍ داخل جملةٍ مترجمة: معزولٌ اتجاهياً (LRI…PDI) — بجملةٍ عربية كان «$1,000» يُرسم «1,000$» (الرمزُ يلتصق
 *  بالمقطع العربيّ). خارج الجمل (خانةٌ بـdir="ltr") يكفي usdText. */
export const usdIso = (c: bigint): string => `\u2066${usdText(c)}\u2069`;

/* ── الحال: سؤالٌ واحدٌ للشاشات كلِّها، مخبَّأٌ دقيقةً بمفتاح العيادة ─────────────────────────────────── */
let cache: { v: UsdState; at: number; clinic: string } | null = null;
let inflight: Promise<UsdState> | null = null;
const subs = new Set<() => void>();
export function refreshUsdState(): Promise<UsdState> {
  const clinic = getActiveClinicId();
  inflight ??= usdApi.state()
    .then((v) => { cache = { v, at: Date.now(), clinic }; subs.forEach((f) => f()); return v; })
    .finally(() => { inflight = null; });
  return inflight;
}
/** null = لم يصل بعد؛ failed = فشل (لا «مطفأ» عن خطأ — الشاشةُ تقول «أعد المحاولة»). */
export function useUsdState(): { state: UsdState | null; failed: boolean; reload: () => void } {
  const [, tick] = useState(0);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => { setFailed(false); refreshUsdState().catch(() => setFailed(true)); }, []);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    if (!cache || Date.now() - cache.at > 60_000 || cache.clinic !== getActiveClinicId()) reload();
    return () => { subs.delete(f); };
  }, [reload]);
  const fresh = cache && cache.clinic === getActiveClinicId() ? cache.v : null;
  return { state: fresh, failed, reload };
}

/* ── الرفضُ بكلامه: رمزُ الخادم (أو المرآة) ⇒ جملةٌ بالقاموس، وغيرُه كما يقوله describeDbError ─────────── */
const KNOWN = new Set<string>(["usd_disabled", "usd_no_rate", "usd_rate_changed", "usd_method", "usd_mixed", "usd_duplicate_line", "usd_qty",
  "usd_no_price", "usd_partial_at_sale", "usd_backdate", "usd_total_mismatch", "usd_due_changed", "usd_amount", "usd_over",
  "usd_rate_override", "usd_rate_bad", "usd_rate_manager", "usd_operator", "usd_too_small", "usd_not_usd", "usd_void_manager",
  "usd_void_reason", "usd_settlement_missing", "usd_already_void", "usd_delete_settled", "usd_door", "usd_product_in_iqd",
  "usd_prefs_manager", "usd_step_bad", "usd_in_use", "photographer_forbidden"]);
export function usdErrorText(e: unknown, t: TFunction): string {
  const code = (e as { message?: string } | null)?.message ?? "";
  if (KNOWN.has(code)) return t(`usd.err.${code}`);
  if (isNetworkError(e)) return t("usd.err.offline");
  return describeDbError(e, t);
}

/* ── أدواتُ عرض ─────────────────────────────────────────────────────────────────────────────────── */
export const iqd = (n: bigint | number) => formatNum(Number(n));
export const centsOfNum = (n: number | null | undefined): bigint => centsOf(n == null ? "0" : String(n)) ?? 0n;
/** «اليوم ١٠:٣٢» أو التاريخ — لختم السعر. */
export function stampText(iso: string, lang: string, t: TFunction): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? t("usd.today", { time: formatTime(iso, lang) }) : formatDate(iso, lang, true);
}
export const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
export function UsdChip({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full bg-success-50 px-1.5 py-0.5 text-2xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300", className)}>
      <DollarSign size={11} strokeWidth={3} />USD
    </span>
  );
}

/* ── سؤالُ «السعر نفسه اليوم؟» (قرار ٨): مرّةً باليوم بالجهاز، لا بيعَ بسعر أمس بصمت ─────────────────────── */
const ackKey = (r: UsdRate) => `usd_rate_ack_${r.id}_${new Date().toDateString()}`;
function acked(r: UsdRate): boolean { try { return localStorage.getItem(ackKey(r)) === "1"; } catch { return false; } }
export function useStaleRate(rate: UsdRate | null): { stale: boolean; ack: () => void } {
  const [, tick] = useState(0);
  const stale = !!rate && !isToday(rate.created_at) && !acked(rate);
  return { stale, ack: () => { if (rate) { try { localStorage.setItem(ackKey(rate), "1"); } catch { /* الجهازُ بلا تخزين: يُسأل ثانيةً */ } } tick((n) => n + 1); } };
}
export function StaleRateBanner({ rate, onAck }: { rate: UsdRate; onAck: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-usd-stale>
      <AlertTriangle size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{t("usd.stale.ask", { date: formatDate(rate.created_at, i18n.language, true), v: iqd(per100Of(rate.rate1e4)) })}</span>
      <Button size="sm" onClick={() => { playTap(); onAck(); }}>{t("usd.stale.same")}</Button>
      <span className="w-full text-2xs text-warn-700 dark:text-warn-300">{t("usd.stale.askManager")}</span>
    </div>
  );
}
