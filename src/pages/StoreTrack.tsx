// ============================================================================
// تتبّع طلب المتجر (0176) — صفحة عامة للزبون، بلا جلسة.
//
// الاستعلام برقم الطلب **والهاتف معاً**: الرقم وحده قصيرٌ فيُعَدّ تخميناً،
// والهاتف يعرفه صاحب الطلب وحده. الخادم يرجع الحالة والتوقيت فقط — لا
// عنوان ولا أصناف، فتسريبُ رقمٍ لا يكشف شيئاً يُذكر.
// ============================================================================
import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PackageSearch, CheckCircle2, XCircle, Clock3, ArrowRight } from "lucide-react";
import { repo } from "@/lib/repo";
import { describeDbError } from "@/lib/errors";
import { cn, money } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import type { StoreTrackInfo } from "@/types";

const LAST_KEY = "vp_store_last_order";

export function StoreTrack() {
  const { slug = "" } = useParams();
  const [sp] = useSearchParams();
  const { t } = useTranslation();
  const [no, setNo] = useState(() => sp.get("no") ?? (() => { try { return localStorage.getItem(LAST_KEY) ?? ""; } catch { return ""; } })());
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** undefined = بعدنا ما استعلمنا؛ null = استعلمنا وما لكينا. */
  const [result, setResult] = useState<StoreTrackInfo | null | undefined>(undefined);

  const go = async () => {
    if (busy || !no.trim() || phone.replace(/\D/g, "").length < 8) return;
    setBusy(true); setError(null);
    try {
      const r = await repo.trackStoreOrder(slug, no, phone);
      setResult(r);
      if (r) playSuccess(); else playWarning();
    } catch (e) {
      playWarning();
      setError(describeDbError(e, t));
      setResult(undefined);
    } finally { setBusy(false); }
  };

  const statusLook = (s: string) =>
    s === "accepted" ? { icon: CheckCircle2, cls: "bg-success-500", label: t("track.accepted", "انقبل طلبك — العيادة تجهّزه وراح يوصلك") }
    : s === "rejected" ? { icon: XCircle, cls: "bg-warn-500", label: t("track.rejected", "انرفض الطلب — تواصل مع العيادة للتفاصيل") }
    : s === "cancelled" ? { icon: XCircle, cls: "bg-ink/60", label: t("track.cancelled", "الطلب ملغى") }
    : { icon: Clock3, cls: "bg-brand-600", label: t("track.pending", "طلبك واصل وبانتظار تأكيد العيادة") };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8" dir="rtl">
      <div className="flex items-center gap-2">
        <PackageSearch size={22} className="text-brand-600" />
        <h1 className="font-display text-xl font-extrabold text-ink">{t("track.title", "تتبّع طلبك")}</h1>
      </div>
      <p className="text-sm text-ink-muted">{t("track.sub", "اكتب رقم الطلب الي وصلك ورقم هاتفك الي طلبت بيه.")}</p>

      <div className="card space-y-3 p-4">
        <div>
          <label className="label">{t("track.orderNo", "رقم الطلب")}</label>
          <input className="input font-mono" dir="ltr" value={no} onChange={(e) => setNo(e.target.value)} placeholder="SO-XXXXXX" data-trackno />
        </div>
        <div>
          <label className="label">{t("track.phone", "رقم الهاتف")}</label>
          <input className="input" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxxx" data-trackphone />
        </div>
        <button onClick={() => { playTap(); void go(); }} disabled={busy || !no.trim() || phone.replace(/\D/g, "").length < 8}
          className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-extrabold text-white transition active:scale-[0.98] disabled:opacity-50" data-trackgo>
          {busy ? t("track.checking", "جارٍ الفحص…") : t("track.go", "شوف حالة الطلب")}
        </button>
      </div>

      {error && <p className="rounded-2xl bg-warn-50 p-3 text-sm font-bold text-warn-700 dark:bg-warn-500/10">{error}</p>}

      {result === null && (
        <div className="card p-4 text-center text-sm text-ink-muted" data-tracknone>
          {t("track.notFound", "ما لكينا طلباً بهذا الرقم وهذا الهاتف — دقّق الاثنين وجرّب من جديد.")}
        </div>
      )}

      {result && (() => {
        const look = statusLook(result.status);
        const Icon = look.icon;
        return (
          <div className="card space-y-3 p-4" data-trackresult>
            <div className="flex items-center gap-3">
              <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white", look.cls)}><Icon size={24} /></span>
              <div className="min-w-0">
                <p className="font-mono text-xs font-bold text-brand-600">{result.order_no}</p>
                <p className="text-sm font-extrabold leading-snug text-ink">{look.label}</p>
              </div>
            </div>
            <div className="space-y-1 border-t border-line pt-2 text-xs text-ink-muted">
              <p>{t("track.placedAt", "وصل الطلب: {{d}}", { d: new Date(result.created_at).toLocaleString("ar-IQ") })}</p>
              {result.decided_at && <p>{t("track.decidedAt", "تقرّر: {{d}}", { d: new Date(result.decided_at).toLocaleString("ar-IQ") })}</p>}
              <p className="pt-1 text-sm font-bold text-ink">{money(result.total)} <span className="font-normal text-ink-subtle">{t("track.cod", "— الدفع عند الاستلام")}</span></p>
            </div>
          </div>
        );
      })()}

      <Link to={`/s/${slug}`} className="mt-auto flex items-center justify-center gap-1.5 text-sm font-bold text-brand-600">
        <ArrowRight size={15} /> {t("track.backToStore", "رجوع للمتجر")}
      </Link>
    </div>
  );
}
