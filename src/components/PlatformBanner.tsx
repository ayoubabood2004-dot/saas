import { useEffect, useState } from "react";
import { ShieldCheck, LogOut, Bird } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin, platformContext, platformLeave, platformWorkspaceIds, type PlatformContext } from "@/lib/platformAdmin";

/* ============================================================================
 * شريطُ «أنت داخل عيادة…» (0151).
 *
 * مشغّلُ المنصّة الداخلُ عيادةً يرى الواجهةَ كما يراها كادرُها تماماً — وهذا هو
 * الخطر: ينسى أين هو فيبيع أو يحذف بعيادةٍ غير المقصودة. فالشريطُ ثابتٌ فوق كل
 * شاشة ما دام داخلاً، يسمّي العيادةَ وزرُّ الخروج بجانبه. يُخفى لغير المشغّل
 * ولمن لم يدخل.
 *
 * وحقلُ المشغّل (0247) دخولٌ كغيره، لكنه أرضُه هو: الشريطُ يسمّيه «حقلك» بلون الهويّة لا
 * بلون التحذير، والزرُّ «ارجع لعيادتي» — حتى لا يُقرأ «أنت داخل عيادة زبون» وهو بمساحته.
 * ==========================================================================*/
export function PlatformBanner() {
  const { user } = useAuth();
  const admin = isPlatformAdmin(user?.email);
  const [ctx, setCtx] = useState<PlatformContext | null>(null);
  const [busy, setBusy] = useState(false);
  /* فشلُ النداء كان يُخفي الشريطَ كلياً — وهو التحذيرُ الوحيد الذي يقول للمشغّل
   * أين هو. غيابُه على شبكةٍ متقطّعة يعني أن يكتب بعيادة الزبون وهو يحسبها
   * عيادتَه. فالفشلُ يُعرض: «تعذّر التأكد أين أنت». */
  const [failed, setFailed] = useState(false);
  /** حقلي (0247) — يُسأل مرّةً: معرّفُه لا يتغيّر. فشلُه (قبل الهجرة) يُبقي الشريطَ الأصفر كما كان. */
  const [myFarm, setMyFarm] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    let alive = true;
    const load = () => platformContext()
      .then((c) => { if (alive) { setCtx(c); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    load();
    platformWorkspaceIds().then((w) => { if (alive) setMyFarm(w.mine); }).catch(() => {});
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [admin]);

  // انتهت الجلسة، أو تعذّر التأكد — الشريطُ يبقى ويقول أيَّهما.
  const expired = !!ctx?.expired;
  if (!admin || (!ctx?.acting && !expired && !failed)) return null;
  const inFarm = !!ctx?.acting && ctx.acting === myFarm;

  const leave = async () => {
    setBusy(true);
    try {
      await platformLeave();
      // إعادةُ تحميلٍ كاملة: الجلسةُ والكاش كلُّها كانت باسم العيادة.
      window.location.assign("/platform");
    } catch { setBusy(false); }
  };

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-2" data-platform-banner>
      <div className={"pointer-events-auto flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold shadow-raised " + (inFarm
        ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
        : "border-warn-300 bg-warn-50 text-warn-800 dark:border-warn-500/40 dark:bg-warn-500/15 dark:text-warn-200")}
        data-platform-farm={inFarm ? "" : undefined}>
        {inFarm ? <Bird size={14} className="shrink-0" /> : <ShieldCheck size={14} className="shrink-0" />}
        <span className="truncate">
          {inFarm
            ? `أنت بحقلك «${ctx?.clinicName || "حقلي"}» — مساحة مفصولة عن عيادتك`
            : ctx?.acting
            ? `أنت داخل عيادة «${ctx.clinicName ?? "بلا اسم"}» — الشاشات كلها تعرض بياناتها وتكتب فيها`
            : expired
              ? "انتهت جلسةُ الدخول — رجعت لعيادتك. ادخل من جديد إذا تريد تكمّل."
              : "تعذّر التأكد أين أنت — حدّث الصفحة قبل ما تكتب أي شيء."}
        </span>
        {ctx?.acting && (
          <button type="button" onClick={() => void leave()} disabled={busy} data-platform-leave
            className={"inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-white transition disabled:opacity-60 " + (inFarm
              ? "bg-brand-600 hover:bg-brand-700" : "bg-warn-600 hover:bg-warn-700")}>
            <LogOut size={12} /> {busy ? "…" : inFarm ? "ارجع لعيادتي" : "اخرج"}
          </button>
        )}
      </div>
    </div>
  );
}
